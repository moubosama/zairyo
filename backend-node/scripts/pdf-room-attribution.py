# pdf-room-attribution.py — レバー1第8段: 壁線幾何スパンの部屋帰属プロトタイプ
#
# 用途: 課金ゼロ・実AI不使用。第5段（pdf-wall-geometry.py）の内法スパンは「ページ全体の値集合」で
#   84.6%一致したが、第6段で「AI誤読の100%が帰属間違い」と確定したため、置換に使うには
#   スパンを部屋へ空間帰属させる必要がある。本スクリプトはその帰属を
#   「部屋名ラベル座標（テキスト層）＋壁線幾何（ベクターパス）」だけで行う。
#
# 【構造的分離】正解JSON（beppu-room-truth.json）は一切読まない。一致率測定は
#   verify-room-attribution-beppu-a.mjs が別途行う（第2段以降の全プロトタイプと同じ分離）。
#
# 手法:
#   (1) 第5段のロジック（スケール推定・軸平行セグメント・共線マージ・平行ペア=壁面）を
#       pdf-wall-geometry.py からそのままimportして再利用（定数の二重管理をしない）。
#   (2) スキャンラインの隣接ギャップを「値のヒストグラム」でなく**インスタンス**
#       （両側壁面の座標 cLo/cHi + 走行区間 run0/run1 + 支持数）として保持する。
#   (3) 部屋矩形の推定: 部屋名ラベル中心から上下左右へ、ラベル行を跨ぐ最近傍の壁面まで
#       拡張した矩形近似（フラッドフィルの矩形版。ラベル座標と壁面座標のみ使用）。
#   (4) 帰属: スパンインスタンスの矩形（ギャップ区間×走行区間）が部屋矩形と
#       両軸ともATTR_OVERLAP_MIN_MM以上重なれば、その部屋の候補に加える。
#       1つのスパンは複数部屋に帰属しうる（開口貫通スパン・連続壁の共有ギャップ）。
#   (5) 7350再構成: 同一スキャンライン上の「スパン+壁厚+スパン(+壁厚+スパン)」の
#       交互列を合成した値も別バケット（composed）で保持（袖壁スタブでスパンが分割される
#       LDK長辺7350の再構成可否の測定用。直接スパンとは混ぜない＝偽陽性教訓の踏襲）。
#
# 実行: python -X utf8 scripts/pdf-room-attribution.py [ページ番号]（既定: 36 = 別府A平面詳細図）
# 出力: scripts/out-room-attribution-beppu-a.json
import sys, os, json, unicodedata, importlib.util
from collections import defaultdict

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out-room-attribution-beppu-a.json')

# --- 第5段の抽出ロジックをそのまま再利用（ファイル名にハイフンがあるためimportlib経由） ---
_spec = importlib.util.spec_from_file_location('pdf_wall_geometry', os.path.join(HERE, 'pdf-wall-geometry.py'))
G = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(G)

# --- 部屋ラベル判定（pdf-dim-extract.py の実在語彙をそのまま踏襲） ---
ROOM_KEYWORDS = ['玄関', '洋室', 'ＬＤＫ', 'LDK', '廊下', '洗面', '浴室', 'トイレ', '便所',
                 'ＵＢ', '押入', '収納', 'ＷＣＬ', 'ＳＣＬ', 'ＷＩＣ', 'バルコニ', 'ホール', 'キッチン', '台所']
ROOM_EXCLUDE = ['化粧台', '先行', 'ＦＬ', 'スリーブ', 'ｽﾘｰﾌﾞ', '冷媒']

# --- 帰属の定数（物理由来・正解由来の値はない） ---
ATTR_OVERLAP_MIN_MM = 100   # 部屋矩形とスパン矩形の最小重なり（接触ノイズ除去。最薄壁厚50mmの2倍）
FONT_SIZE_TIE_PT = 0.2      # 同名ラベルの「最大フォント」同値判定（本図面: 主平面5.6-5.7 vs 姿図3.5 vs 表5.3）
MAX_COMPOSE_WALLS = 2       # 合成で跨いでよい介在壁の最大数（袖壁スタブ1〜2本を想定）
# テキスト注記まわりの図形除外: JWW→PDFは (a)文字背後の白抜き矩形（語bboxと一致・hairline）
# (b)注記の囲み枠（部屋ラベル直下の「2,500」「110」ボックス罫線・w=0.12太線・語bboxより約1pt外側）
# を描くため、両方が「軸平行線」として収集され偽壁面ペアになる（実測: 部屋ラベル中心±58mm/±74mmの
# 短い面ペア＝部屋矩形が117mm幅に潰れる直因）。枠は単語1個のbboxに収まらない（枠高17pt vs 語「110」9pt）
# ため、**近接語をクラスタ化した注記ブロックbbox**（+PAD）に内包される面を除外する
# （テキスト層のみ使用・正解非参照。クラスタ化は語bboxをCLUSTER_JOIN_PT膨張して重なる語を連結）。
TEXT_MASK_PAD_PT = 2.0
CLUSTER_JOIN_PT = 1.5


def extract_room_labels(page):
    """テキスト層から部屋名ラベルを収集。同名は最大フォント（±FONT_SIZE_TIE_PT）だけ残す
    ＝主平面図の大ラベルを選び、姿図（小フォント）・室仕上表（中フォント）の同名を落とす。
    フォントサイズ=bboxの短辺（回転90ページの縦書きは幅が文字サイズになる）。"""
    labels = []
    for w in page.get_text('words'):
        t = w[4]
        if len(t) <= 12 and any(k in t for k in ROOM_KEYWORDS) and not any(e in t for e in ROOM_EXCLUDE):
            x0, y0, x1, y1 = float(w[0]), float(w[1]), float(w[2]), float(w[3])
            labels.append({
                'name': unicodedata.normalize('NFKC', t),
                'cx': (x0 + x1) / 2, 'cy': (y0 + y1) / 2,
                'font': min(x1 - x0, y1 - y0),
                'bbox': [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)],
            })
    by_name = defaultdict(list)
    for l in labels:
        by_name[l['name']].append(l)
    selected = []
    for name, ls in by_name.items():
        fmax = max(l['font'] for l in ls)
        selected += [l for l in ls if l['font'] >= fmax - FONT_SIZE_TIE_PT]
    return labels, selected


def collect_word_boxes(page):
    """全テキスト語のbboxを近接クラスタへ連結（注記ブロックbbox化）。
    CLUSTER_JOIN_PT膨張bboxが重なる語同士を同一クラスタとし、クラスタの外接bboxを返す。
    寸法チェーン（数字が20pt以上離れて並ぶ）は連結されない＝細長い巨大クラスタ化はしない。"""
    boxes = [(float(w[0]), float(w[1]), float(w[2]), float(w[3])) for w in page.get_text('words')]
    j = CLUSTER_JOIN_PT
    parent = list(range(len(boxes)))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    order = sorted(range(len(boxes)), key=lambda i: boxes[i][0])
    for oi, i in enumerate(order):
        x0, y0, x1, y1 = boxes[i]
        for k in order[oi + 1:]:
            bx0, by0, bx1, by1 = boxes[k]
            if bx0 - j > x1 + j:
                break  # x0昇順なのでこれ以降は重ならない
            if not (bx1 + j < x0 - j or by0 - j > y1 + j or by1 + j < y0 - j):
                ra, rb = find(i), find(k)
                if ra != rb:
                    parent[rb] = ra
    clusters = {}
    for i, b in enumerate(boxes):
        r = find(i)
        c = clusters.get(r)
        clusters[r] = b if c is None else (min(c[0], b[0]), min(c[1], b[1]), max(c[2], b[2]), max(c[3], b[3]))
    return list(clusters.values())


def drop_text_mask_faces(faces, word_boxes, axis):
    """テキスト語bbox（+PAD）に完全内包されるマージ済み面を除外。
    axis='H': face=(y, x0, x1) / axis='V': face=(x, y0, y1)"""
    p = TEXT_MASK_PAD_PT
    out = []
    for f in faces:
        c, a0, a1 = f
        inside = False
        for (wx0, wy0, wx1, wy1) in word_boxes:
            if axis == 'H':
                if wy0 - p <= c <= wy1 + p and a0 >= wx0 - p and a1 <= wx1 + p:
                    inside = True; break
            else:
                if wx0 - p <= c <= wx1 + p and a0 >= wy0 - p and a1 <= wy1 + p:
                    inside = True; break
        if not inside:
            out.append(f)
    return out


def scan_instances(wall_faces, mm_per_pt):
    """スキャンラインの隣接ギャップをインスタンス化。
    戻り: spans=[{cLo,cHi,run0,run1,n,mm}], composed=[{cLo,cHi,run0,run1,n,mm,walls}]
    キーは両側壁面のid（=マージ済み面は座標が安定するためスキャン間で同一視できる）。"""
    spans, composed = {}, {}
    if not wall_faces:
        return [], []
    faces = sorted(wall_faces)
    lo = min(f[1] for f in faces)
    hi = max(f[2] for f in faces)
    idx = {f: i for i, f in enumerate(faces)}
    x = lo
    while x <= hi:
        act = sorted((f for f in faces if f[1] <= x <= f[2]), key=lambda f: f[0])
        gaps = []  # (mmギャップ, faceA, faceB)
        for a, b in zip(act, act[1:]):
            gaps.append(((b[0] - a[0]) * mm_per_pt, a, b))
        # 直接スパン
        for mm, a, b in gaps:
            if G.SPAN_MIN_MM <= mm <= G.SPAN_MAX_MM:
                key = (idx[a], idx[b])
                r = spans.setdefault(key, {'cLo': a[0], 'cHi': b[0], 'run0': x, 'run1': x, 'n': 0})
                r['run0'] = min(r['run0'], x); r['run1'] = max(r['run1'], x); r['n'] += 1
        # 合成スパン: span (thick span)+ の交互列（介在壁 1〜MAX_COMPOSE_WALLS 本）
        kind = ['S' if G.SPAN_MIN_MM <= g[0] <= G.SPAN_MAX_MM
                else ('T' if G.THICK_MIN_MM <= g[0] <= G.THICK_MAX_MM else '-') for g in gaps]
        for s in range(len(gaps)):
            if kind[s] != 'S':
                continue
            total = gaps[s][0]
            k = s + 1
            walls = 0
            while k + 1 < len(gaps) and kind[k] == 'T' and kind[k + 1] == 'S' and walls < MAX_COMPOSE_WALLS:
                total += gaps[k][0] + gaps[k + 1][0]
                walls += 1
                k += 2
                if total > G.SPAN_MAX_MM:
                    break
                key = (idx[gaps[s][1]], idx[gaps[k - 1][2]], walls)
                r = composed.setdefault(key, {'cLo': gaps[s][1][0], 'cHi': gaps[k - 1][2][0],
                                              'run0': x, 'run1': x, 'n': 0, 'walls': walls})
                r['run0'] = min(r['run0'], x); r['run1'] = max(r['run1'], x); r['n'] += 1
        x += G.SCAN_STEP_PT
    def fin(d):
        out = []
        for r in d.values():
            mm = int(round((r['cHi'] - r['cLo']) * mm_per_pt))
            out.append({**{k: round(v, 2) if isinstance(v, float) else v for k, v in r.items()}, 'mm': mm})
        return out
    return fin(spans), fin(composed)


def room_rect(label, fH, fV, mm_per_pt):
    """ラベル中心から最近傍壁面までの矩形近似。fH=(y,x0,x1) fV=(x,y0,y1)。
    4辺いずれか欠落ならNone（枠外ラベル＝帰属不能として報告）。"""
    cx, cy = label['cx'], label['cy']
    left = max((f[0] for f in fV if f[1] <= cy <= f[2] and f[0] < cx), default=None)
    right = min((f[0] for f in fV if f[1] <= cy <= f[2] and f[0] > cx), default=None)
    top = max((f[0] for f in fH if f[1] <= cx <= f[2] and f[0] < cy), default=None)
    bot = min((f[0] for f in fH if f[1] <= cx <= f[2] and f[0] > cy), default=None)
    if None in (left, right, top, bot):
        return None
    return {'x0': left, 'x1': right, 'y0': top, 'y1': bot,
            'w_mm': int(round((right - left) * mm_per_pt)), 'h_mm': int(round((bot - top) * mm_per_pt))}


def overlap(a0, a1, b0, b1):
    return min(a1, b1) - max(a0, b0)


def attribute(rooms, spansH, spansV, composedH, composedV, mm_per_pt):
    """スパン矩形×部屋矩形の重なり判定で部屋ごとの候補集合を構築。
    H面ギャップ=縦方向スパン（ギャップ軸=y・走行軸=x）/ V面ギャップ=横方向スパン（軸が逆）。"""
    min_pt = ATTR_OVERLAP_MIN_MM / mm_per_pt
    out = {}
    for name, rect in rooms.items():
        if rect is None:
            out[name] = None
            continue
        direct, comp = defaultdict(int), {}
        for inst in spansH:
            if overlap(inst['cLo'], inst['cHi'], rect['y0'], rect['y1']) >= min_pt and \
               overlap(inst['run0'], inst['run1'], rect['x0'], rect['x1']) >= min_pt:
                direct[inst['mm']] = max(direct[inst['mm']], inst['n'])
        for inst in spansV:
            if overlap(inst['cLo'], inst['cHi'], rect['x0'], rect['x1']) >= min_pt and \
               overlap(inst['run0'], inst['run1'], rect['y0'], rect['y1']) >= min_pt:
                direct[inst['mm']] = max(direct[inst['mm']], inst['n'])
        for inst in composedH:
            if overlap(inst['cLo'], inst['cHi'], rect['y0'], rect['y1']) >= min_pt and \
               overlap(inst['run0'], inst['run1'], rect['x0'], rect['x1']) >= min_pt:
                cur = comp.get(inst['mm'])
                if cur is None or inst['n'] > cur['n']:
                    comp[inst['mm']] = {'n': inst['n'], 'walls': inst['walls']}
        for inst in composedV:
            if overlap(inst['cLo'], inst['cHi'], rect['x0'], rect['x1']) >= min_pt and \
               overlap(inst['run0'], inst['run1'], rect['y0'], rect['y1']) >= min_pt:
                cur = comp.get(inst['mm'])
                if cur is None or inst['n'] > cur['n']:
                    comp[inst['mm']] = {'n': inst['n'], 'walls': inst['walls']}
        out[name] = {
            'direct': {str(k): direct[k] for k in sorted(direct)},
            'composed': {str(k): comp[k] for k in sorted(comp)},
        }
    return out


def main():
    page_no = int(sys.argv[1]) if len(sys.argv) > 1 else 36
    import fitz
    doc = fitz.open(G.PDF)
    page = doc[page_no - 1]
    print(f'--- p{page_no} (rot={page.rotation}, rect={page.rect})')

    scale = G.estimate_scale(page)
    if not scale:
        print('スケール推定不能'); sys.exit(1)
    mm_per_pt = scale['mm_per_pt']
    print(f"スケール: mm/pt={mm_per_pt} 縮尺≒1/{scale['implied_scale_denominator']} sd={scale['sd_pct']}%")

    all_labels, sel = extract_room_labels(page)
    print(f'部屋ラベル: 全{len(all_labels)}件 → 最大フォント選抜{len(sel)}件: '
          + ' '.join(sorted(set(l["name"] for l in sel))))

    H, V, obs = G.collect_axis_segments(page)
    result = {
        'pdf': G.PDF, 'page': page_no, 'rotation': page.rotation, 'scale': scale,
        'constants': {
            'ATTR_OVERLAP_MIN_MM': ATTR_OVERLAP_MIN_MM, 'FONT_SIZE_TIE_PT': FONT_SIZE_TIE_PT,
            'MAX_COMPOSE_WALLS': MAX_COMPOSE_WALLS, 'TEXT_MASK_PAD_PT': TEXT_MASK_PAD_PT,
            'inherited_from_stage5': {k: getattr(G, k) for k in
                ['FACE_MIN_MM', 'THICK_MIN_MM', 'THICK_MAX_MM', 'PAIR_OVERLAP_MIN_MM',
                 'SPAN_MIN_MM', 'SPAN_MAX_MM', 'SCAN_STEP_PT']},
        },
        'labels_all': [{'name': l['name'], 'bbox': l['bbox'], 'font': round(l['font'], 1)} for l in all_labels],
        'labels_selected': [{'name': l['name'], 'bbox': l['bbox'], 'font': round(l['font'], 1)} for l in sel],
        'variants': {},
    }

    word_boxes = collect_word_boxes(page)
    for vname, wmin in G.STROKE_VARIANTS.items():
        fH0 = [f for f in G.merge_collinear([s for s in H if s[0] >= wmin])
               if (f[2] - f[1]) * mm_per_pt >= G.FACE_MIN_MM]
        fV0 = [f for f in G.merge_collinear([s for s in V if s[0] >= wmin])
               if (f[2] - f[1]) * mm_per_pt >= G.FACE_MIN_MM]
        fH = drop_text_mask_faces(fH0, word_boxes, 'H')
        fV = drop_text_mask_faces(fV0, word_boxes, 'V')
        print(f'[{vname}] テキストマスク面の除外: H {len(fH0)}→{len(fH)} / V {len(fV0)}→{len(fV)}')
        wH, pH, _ = G.detect_wall_faces(fH, mm_per_pt)
        wV, pV, _ = G.detect_wall_faces(fV, mm_per_pt)
        spH, coH = scan_instances(wH, mm_per_pt)   # H面ギャップ=縦内法（ギャップ軸y・走行軸x）
        spV, coV = scan_instances(wV, mm_per_pt)   # V面ギャップ=横内法（ギャップ軸x・走行軸y）

        # 部屋矩形（壁面はこのバリアントの検出結果を使用）
        rects = {}
        for l in sel:
            # 同名複数（WCL×2等）はラベル座標で区別（name#index）
            base = l['name']
            key = base
            i = 2
            while key in rects:
                key = f'{base}#{i}'; i += 1
            rects[key] = {'label': {'name': base, 'cx': round(l['cx'], 1), 'cy': round(l['cy'], 1)},
                          'rect': room_rect(l, wH, wV, mm_per_pt)}

        attr = attribute({k: v['rect'] for k, v in rects.items()}, spH, spV, coH, coV, mm_per_pt)

        # グローバル集合（帰属なし上限の対照用）: mm→最大支持数
        gdir, gcomp = defaultdict(int), defaultdict(int)
        for inst in spH + spV:
            gdir[inst['mm']] = max(gdir[inst['mm']], inst['n'])
        for inst in coH + coV:
            gcomp[inst['mm']] = max(gcomp[inst['mm']], inst['n'])

        result['variants'][vname] = {
            'stroke_width_min': wmin,
            'wall_faces': {'H': len(wH), 'V': len(wV)}, 'wall_pairs': {'H': pH, 'V': pV},
            'span_instances': {'H': len(spH), 'V': len(spV)},
            'composed_instances': {'H': len(coH), 'V': len(coV)},
            'rooms': {k: {'label': rects[k]['label'],
                          'rect': (None if rects[k]['rect'] is None else
                                   {kk: (round(vv, 2) if isinstance(vv, float) else vv)
                                    for kk, vv in rects[k]['rect'].items()}),
                          'candidates': attr[k]} for k in rects},
            'global_direct': {str(k): gdir[k] for k in sorted(gdir)},
            'global_composed': {str(k): gcomp[k] for k in sorted(gcomp)},
            # 生インスタンス（測定側の距離ベース上限分析用。H=ギャップ軸y/走行軸x・Vは逆）
            'instances': {'H': spH, 'V': spV, 'composed_H': coH, 'composed_V': coV},
            # 壁面の走行長（もう1つの候補族: XLS正解幅は「壁セグメント長」なので面長も測定対象に）
            'face_runs': {
                'H': [{'coord': round(f[0], 2), 'a0': round(f[1], 2), 'a1': round(f[2], 2),
                       'mm': int(round((f[2] - f[1]) * mm_per_pt))} for f in wH],
                'V': [{'coord': round(f[0], 2), 'a0': round(f[1], 2), 'a1': round(f[2], 2),
                       'mm': int(round((f[2] - f[1]) * mm_per_pt))} for f in wV],
            },
        }
        n_rect = sum(1 for r in rects.values() if r['rect'] is not None)
        print(f'[{vname}] 壁面H={len(wH)}/V={len(wV)} スパンinst H={len(spH)}/V={len(spV)}'
              f' 合成inst H={len(coH)}/V={len(coV)} 部屋矩形 {n_rect}/{len(rects)}'
              f' グローバル直接{len(gdir)}種/合成{len(gcomp)}種')

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f'saved: {OUT}')


if __name__ == '__main__':
    main()
