# pdf-wall-geometry.py — 別府型PDFのベクターパスから壁線幾何→内法スパンを抽出するプロトタイプ
#
# 用途: レバー1第5段（課金ゼロ・実AI不使用）。テキスト層の寸法は芯々で内法幅と合わない（第3-4段）ため、
#   壁線の図形そのもの（get_drawings）から内法スパンを計算できるかの実現可能性測定。
#   p36実測（2026-07-26・本スクリプトの現行定数での出力）: 軸平行セグメント H=13,973/V=15,945・
#   斜め線=18,075（RCハッチング）・曲線=4,018（建具軌跡・記号丸）・塗りパス=985（0.4〜14pt角の小物のみ）
#   ＝RC躯体は塗りでなくハッチング+輪郭線で描かれている（「矩形塗り=躯体」の区別は本図面では使えない）。
#   ※初期探査時の別許容値ではH20,388/V40,816等の大きい数字が出る（マージ・分類条件依存。reviewer SF-1で現行値に訂正済み）
#
# 実行: python -X utf8 scripts/pdf-wall-geometry.py [ページ番号]（既定: 36 = 別府Aタイプ平面詳細図）
# 出力: scripts/out-wall-geometry-beppu-a.json
#   （正解との一致率測定は verify-wall-geometry-beppu-a.mjs が別途行う。本スクリプトは正解JSONを
#     一切読まない＝抽出ロジックに正解値が混入しない構造的保証。pdf-dim-extract.py と同じ分離）
#
# 座標空間の注意（p36実測）: ページはrot=90だが、get_drawings と get_text('words') は
#   どちらも未回転空間（縦842×1191pt・図形x[10,823] y[19,1181]・文字x[16,821] y[23,1153]）で整合する。
#   スケール(mm/pt)は回転不変のため、テキスト由来スケールを図形距離へそのまま適用してよい。
#
# 流儀: conv-pdf-to-png.py / pdf-dim-extract.py と同じPyMuPDF(fitz)直叩き。pipは壊れているため新規パッケージ不可。
import sys, os, json, re, unicodedata, statistics, fitz
from collections import Counter

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

PDF = r'C:/Users/81804/Pictures/zairyoの資料/02_別府4丁目/図面PDF/250627_意匠図一式.pdf'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out-wall-geometry-beppu-a.json')
DIM_RE = re.compile(r'^[0-9]{2,5}$')  # pdf-dim-extract.py と同一の寸法語判定

# --- スケール推定の定数（物理・実測由来。正解JSON由来の値はない） ---
BAND_TOL = 1.5     # pt。同一寸法線帯の判定（pdf-dim-extract.py実測値を踏襲）
CHAIN_GAP = 250.0  # pt。同上（隣接寸法とみなす最大ギャップ）
SCALE_DIM_MIN, SCALE_DIM_MAX = 300, 15000  # mm。スケール標本に使う寸法値の帯（添字・通し番号ノイズ除外）
SCALE_BIN = 2.0    # pt/m。モード探索のヒストグラム刻み
SCALE_REFINE = 0.06  # モード中心±6%を本標本として平均（探索実測: モード群はsd0.15%で密集・他は倍半分に散る）

# --- 壁線幾何の定数（物理由来） ---
AXIS_TOL = 0.05      # pt。軸平行判定（dx or dy がこれ未満）
SEG_MIN_PT = 0.2     # pt。これ未満の微小線分は捨てる（点ノイズ）
MERGE_COORD_TOL = 0.1  # pt≒2mm。共線とみなす座標ジッタ（JWW出力の同一線の分割描画を連結）
MERGE_GAP_TOL = 1.0    # pt≒21mm。共線区間の連結ギャップ上限（ドア開口600mm≒28ptは連結しない）
FACE_MIN_MM = 300      # 壁面候補の最小長（これ未満は記号・器具の線とみなす）
THICK_MIN_MM, THICK_MAX_MM = 50, 300  # 壁厚の物理帯（タスク指定・第3段の壁厚候補帯と同一）
PAIR_OVERLAP_MIN_MM = 300  # 平行線ペアを壁とみなす最小オーバーラップ
SPAN_MIN_MM, SPAN_MAX_MM = 300, 12000  # 内法スパンの物理帯（住戸内の部屋幅）
SCAN_STEP_PT = 2.0   # スキャンライン間隔（≒42mm。実スパンは壁の走行全長で観測され支持数が積み上がる）
# 線幅バリアント: 実測分布 0.06(65,348)/0.12(27,873)/0.18(1,803)/0.24(146)。0.06はヘアライン
# （寸法線・ハッチング主体）のため、全線と「0.10以上=太線のみ」の2バリアントを両方出力し測定側で比較する
# （どちらを採るかを一致率で選ぶことはしない＝両方の生値を報告）。
STROKE_VARIANTS = {'all': 0.0, 'thick': 0.10}


def estimate_scale(page):
    """テキスト層の寸法チェーンからmm/ptを推定。
    原理: 同一寸法線帯で隣接する寸法文字の中心間隔(pt) ≒ scale × (v1+v2)/2
    （各寸法文字は自分の寸法区間の中央に置かれるため、隣接中心間隔=区間半分ずつの和）。
    倍半分に散る偽ペア（別の寸法線・離れた文字）はモード抽出で除外する。"""
    words = page.get_text('words')
    dims = []
    for w in words:
        t = unicodedata.normalize('NFKC', w[4]).replace(',', '')
        if DIM_RE.fullmatch(t):
            dims.append({'v': int(t), 'bbox': [float(w[0]), float(w[1]), float(w[2]), float(w[3])]})
    samples = []  # (pt per 1000mm, v1, v2, gap)
    for axis in (1, 0):  # 1=横書き帯(yで帯化) / 0=縦書き帯(xで帯化)
        c = lambda d: (d['bbox'][axis] + d['bbox'][axis + 2]) / 2
        run = lambda d: (d['bbox'][1 - axis] + d['bbox'][3 - axis]) / 2
        ds = sorted(dims, key=c)
        if not ds:
            continue
        bands, cur = [], [ds[0]]
        for d in ds[1:]:
            if c(d) - c(cur[-1]) < BAND_TOL:
                cur.append(d)
            else:
                bands.append(cur); cur = [d]
        bands.append(cur)
        for band in bands:
            band = sorted(band, key=run)
            for a, b in zip(band, band[1:]):
                gap = run(b) - run(a)
                if gap <= 0 or gap > CHAIN_GAP:
                    continue
                if not (SCALE_DIM_MIN <= a['v'] <= SCALE_DIM_MAX and SCALE_DIM_MIN <= b['v'] <= SCALE_DIM_MAX):
                    continue
                samples.append((gap / ((a['v'] + b['v']) / 2) * 1000, a['v'], b['v'], round(gap, 1)))
    if not samples:
        return None
    hist = Counter(round(s[0] / SCALE_BIN) * SCALE_BIN for s in samples)
    mode_center = max(hist.items(), key=lambda kv: kv[1])[0]
    good = [s[0] for s in samples if abs(s[0] - mode_center) / mode_center <= SCALE_REFINE]
    mean = statistics.mean(good)
    sd = statistics.pstdev(good) if len(good) > 1 else 0.0
    mm_per_pt = 1000.0 / mean
    return {
        'n_samples': len(samples), 'n_mode': len(good),
        'mode_bin_pt_per_m': mode_center,
        'pt_per_m_mean': round(mean, 4), 'pt_per_m_sd': round(sd, 4),
        'sd_pct': round(100 * sd / mean, 3),
        'mm_per_pt': round(mm_per_pt, 4),
        # 紙上1pt=0.352778mm → 縮尺分母 = mm_per_pt / 0.352778
        'implied_scale_denominator': round(mm_per_pt / 0.352778, 2),
    }


def collect_axis_segments(page):
    """軸平行線分を収集。H=(width, y, x0, x1) / V=(width, x, y0, y1)。're'は4辺に分解。
    斜め線（RCハッチング）・曲線（建具軌跡・記号丸）は件数のみ観察報告。"""
    H, V = [], []
    n_diag = n_curve = n_fill = 0
    for d in page.get_drawings():
        wd = d.get('width') or 0.0
        if d.get('fill'):
            n_fill += 1
        for it in d['items']:
            if it[0] == 'l':
                p1, p2 = it[1], it[2]
                dx, dy = abs(p1.x - p2.x), abs(p1.y - p2.y)
                if dy < AXIS_TOL and dx >= SEG_MIN_PT:
                    H.append((wd, (p1.y + p2.y) / 2, min(p1.x, p2.x), max(p1.x, p2.x)))
                elif dx < AXIS_TOL and dy >= SEG_MIN_PT:
                    V.append((wd, (p1.x + p2.x) / 2, min(p1.y, p2.y), max(p1.y, p2.y)))
                elif dx >= SEG_MIN_PT or dy >= SEG_MIN_PT:
                    n_diag += 1
            elif it[0] == 're':
                r = it[1]
                H.append((wd, r.y0, r.x0, r.x1)); H.append((wd, r.y1, r.x0, r.x1))
                V.append((wd, r.x0, r.y0, r.y1)); V.append((wd, r.x1, r.y0, r.y1))
            else:
                n_curve += 1
    return H, V, {'diagonal_lines': n_diag, 'curves': n_curve, 'filled_paths': n_fill}


def merge_collinear(segs):
    """同一座標帯（MERGE_COORD_TOL）の区間をギャップMERGE_GAP_TOL以下で連結 → 面(coord, a0, a1)"""
    if not segs:
        return []
    segs = sorted(segs, key=lambda s: s[1])
    groups, cur = [], [segs[0]]
    for s in segs[1:]:
        if s[1] - cur[-1][1] <= MERGE_COORD_TOL:
            cur.append(s)
        else:
            groups.append(cur); cur = [s]
    groups.append(cur)
    faces = []
    for g in groups:
        coord = statistics.mean(s[1] for s in g)
        ivs = sorted((s[2], s[3]) for s in g)
        a0, a1 = ivs[0]
        for b0, b1 in ivs[1:]:
            if b0 - a1 <= MERGE_GAP_TOL:
                a1 = max(a1, b1)
            else:
                faces.append((coord, a0, a1)); a0, a1 = b0, b1
        faces.append((coord, a0, a1))
    return faces


def detect_wall_faces(faces, mm_per_pt):
    """平行線ペア（間隔=壁厚帯・オーバーラップ>=PAIR_OVERLAP_MIN_MM）に参加する面を壁面候補として返す。
    戻り: (壁面リスト, ペア数, 厚みmmリスト)"""
    tmin, tmax = THICK_MIN_MM / mm_per_pt, THICK_MAX_MM / mm_per_pt
    omin = PAIR_OVERLAP_MIN_MM / mm_per_pt
    faces = sorted(faces)
    mark, thicknesses, n_pairs = set(), [], 0
    for i, f in enumerate(faces):
        for j in range(i + 1, len(faces)):
            g = faces[j]
            dt = g[0] - f[0]
            if dt > tmax:
                break
            if dt < tmin:
                continue
            if min(f[2], g[2]) - max(f[1], g[1]) >= omin:
                mark.add(i); mark.add(j)
                thicknesses.append(dt * mm_per_pt)
                n_pairs += 1
    return [faces[i] for i in sorted(mark)], n_pairs, thicknesses


def scan_spans(wall_faces, mm_per_pt):
    """スキャンライン（SCAN_STEP_PT間隔）ごとに、走行区間がラインを跨ぐ壁面を座標順に並べ、
    隣接ギャップ（=向かい合う壁面間の内法スパン）をmm化して支持数付きで集計。
    同一壁の表裏ペア間ギャップ(<=300mm)はSPAN_MIN_MMで自然に除外される。"""
    out = Counter()
    if not wall_faces:
        return out
    lo = min(f[1] for f in wall_faces)
    hi = max(f[2] for f in wall_faces)
    x = lo
    while x <= hi:
        act = sorted(f[0] for f in wall_faces if f[1] <= x <= f[2])
        for a, b in zip(act, act[1:]):
            mm = (b - a) * mm_per_pt
            if SPAN_MIN_MM <= mm <= SPAN_MAX_MM:
                out[int(round(mm))] += 1
        x += SCAN_STEP_PT
    return out


def main():
    page_no = int(sys.argv[1]) if len(sys.argv) > 1 else 36
    doc = fitz.open(PDF)
    page = doc[page_no - 1]
    print(f'--- p{page_no} (rot={page.rotation}, rect={page.rect})')

    scale = estimate_scale(page)
    if not scale:
        print('スケール推定不能（寸法語なし）'); sys.exit(1)
    mm_per_pt = scale['mm_per_pt']
    print(f"スケール推定: mode {scale['mode_bin_pt_per_m']}pt/m 標本{scale['n_mode']}/{scale['n_samples']}"
          f" mean={scale['pt_per_m_mean']}pt/m sd={scale['sd_pct']}%"
          f" → mm/pt={mm_per_pt} 縮尺≒1/{scale['implied_scale_denominator']}")

    H, V, obs = collect_axis_segments(page)
    print(f"軸平行セグメント: H={len(H)} V={len(V)} / 斜め線={obs['diagonal_lines']}（RCハッチング主体）"
          f" 曲線={obs['curves']} 塗りパス={obs['filled_paths']}（大型の躯体塗り矩形は存在しない=実測観察）")

    result = {
        'pdf': PDF, 'page': page_no, 'rotation': page.rotation,
        'scale': scale, 'observations': obs,
        'constants': {
            'MERGE_COORD_TOL_pt': MERGE_COORD_TOL, 'MERGE_GAP_TOL_pt': MERGE_GAP_TOL,
            'FACE_MIN_MM': FACE_MIN_MM, 'THICK_MIN_MM': THICK_MIN_MM, 'THICK_MAX_MM': THICK_MAX_MM,
            'PAIR_OVERLAP_MIN_MM': PAIR_OVERLAP_MIN_MM,
            'SPAN_MIN_MM': SPAN_MIN_MM, 'SPAN_MAX_MM': SPAN_MAX_MM, 'SCAN_STEP_PT': SCAN_STEP_PT,
        },
        'variants': {},
    }
    for vname, wmin in STROKE_VARIANTS.items():
        fH = [f for f in merge_collinear([s for s in H if s[0] >= wmin])
              if (f[2] - f[1]) * mm_per_pt >= FACE_MIN_MM]
        fV = [f for f in merge_collinear([s for s in V if s[0] >= wmin])
              if (f[2] - f[1]) * mm_per_pt >= FACE_MIN_MM]
        wH, pH, tH = detect_wall_faces(fH, mm_per_pt)
        wV, pV, tV = detect_wall_faces(fV, mm_per_pt)
        spH = scan_spans(wH, mm_per_pt)  # H面間ギャップ=縦方向の内法
        spV = scan_spans(wV, mm_per_pt)  # V面間ギャップ=横方向の内法
        thick_hist = Counter(int(round(t / 5) * 5) for t in tH + tV)
        result['variants'][vname] = {
            'stroke_width_min': wmin,
            'merged_faces': {'H': len(fH), 'V': len(fV)},
            'wall_faces': {'H': len(wH), 'V': len(wV)},
            'wall_pairs': {'H': pH, 'V': pV},
            'thickness_hist_5mm': {str(k): thick_hist[k] for k in sorted(thick_hist)},
            # スパン: {mm: 支持スキャンライン数}。支持数は測定側の安定度フィルタ用（閾値は測定側が両方報告）
            'spans_h_gap': {str(k): spH[k] for k in sorted(spH)},
            'spans_v_gap': {str(k): spV[k] for k in sorted(spV)},
        }
        top_th = sorted(thick_hist.items(), key=lambda kv: -kv[1])[:8]
        print(f"[{vname}] 面 H={len(fH)}/V={len(fV)} → 壁面 H={len(wH)}/V={len(wV)}（ペアH={pH}/V={pV}）"
              f" スパン {len(spH)}+{len(spV)}種 / 厚み上位: {top_th}")

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f'saved: {OUT}')


if __name__ == '__main__':
    main()
