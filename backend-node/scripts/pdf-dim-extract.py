# pdf-dim-extract.py — 別府型PDF（JWWテキスト層あり）からの寸法・部屋名・壁記号・建具符号の抽出プロトタイプ
#
# 用途: レバー1（テキスト層読み）の実現可能性定量化・第1段（課金ゼロ・実AI不使用）。
#   別府PDFはJWW出力でテキスト層が実在（寸法は全角数字'２,２００'等・座標付き）。
#   アルファPDFはテキスト層ゼロのため対象外（本スクリプトは別府型専用）。
#
# 実行: python -X utf8 scripts/pdf-dim-extract.py [ページ番号...]（既定: 36 37 = 別府Aタイプ平面詳細図/展開図）
# 出力: scripts/out-pdf-dims-beppu-a.json（正解との一致率測定は verify-pdf-dims-beppu-a.mjs が別途行う。
#        本スクリプトは正解JSONを一切読まない＝抽出ロジックに正解値が混入しない構造的保証）
#
# 流儀: scripts/conv-pdf-to-png.py と同じPyMuPDF(fitz)直叩き。pipは壊れているため新規パッケージ不可。
import sys, os, json, re, unicodedata, fitz

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# 実測に基づく定数（2026-07-26・別府p36/p37で実測）:
PDF = r'C:/Users/81804/Pictures/zairyoの資料/02_別府4丁目/図面PDF/250627_意匠図一式.pdf'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out-pdf-dims-beppu-a.json')
BAND_TOL = 1.5    # pt。同一寸法線上の数字は基線が揃う（文字高さ実測約3pt・帯中心差は実測<1.5pt）
CHAIN_GAP = 250.0 # pt。同一帯内の隣接寸法間ギャップ実測は最大~120pt（p37縦帯）。ページ幅1191ptで
                  # 1/60縮尺なら5300mm区間≒250pt＝これを超える離れは別の寸法線とみなす
DIM_RE = re.compile(r'^[0-9]{2,5}$')  # NFKC正規化+カンマ除去後。2〜5桁（1桁は記号添字ノイズが支配的なため除外）
# 壁厚候補の機械導出ルール（第3段・2026-07-26）: 正解JSONを見ずに図面自身から導出する。
#   (1) 抽出寸法のうち壁厚の物理帯 THICK_MIN..THICK_MAX にある値の頻度が THICK_FREQ_MIN 以上
#       （閾値5は第2段の実測分布「p36: 75×11・110×16・150×10・300×11」の顕著クラスタとノイズ
#        （1〜2回出現の添字・注記数字）の谷から。一致率を見て選んだ値ではない）
#   (2) 凡例テキストの t=NNN 表記（p36実測: 't=100　PBt9.5二重貼+遮音シート+グラスウール24ｋ充填'）
THICK_MIN, THICK_MAX, THICK_FREQ_MIN = 50, 300, 5
LEGEND_T_RE = re.compile(r'[tT]\s*=\s*([0-9]{2,3})')  # NFKC後の凡例壁厚表記
# 部屋名キーワード（p36/p37の実在語彙から。正規化前の生テキストに対する部分一致）
ROOM_KEYWORDS = ['玄関', '洋室', 'ＬＤＫ', 'LDK', '廊下', '洗面', '浴室', 'トイレ', '便所',
                 'ＵＢ', '押入', '収納', 'ＷＣＬ', 'ＳＣＬ', 'ＷＩＣ', 'バルコニ', 'ホール', 'キッチン', '台所']
# 部屋名でない語の除外（設備注記・段差注記など。実測: '洗面化粧台'・'先行冷媒（洋室２）'・'（玄関ＦＬ＋３）'）
ROOM_EXCLUDE = ['化粧台', '先行', 'ＦＬ', 'スリーブ', 'ｽﾘｰﾌﾞ', '冷媒']
WALL_CODE_CHARS = set('ＡＢＣＤＥＦＧ遮')  # 別府凡例の丸囲み1文字記号（丸自体は図形でテキスト化されない）


def norm_num(t):
    """全角数字+カンマの寸法テキストを整数mmへ。寸法でなければNone"""
    n = unicodedata.normalize('NFKC', t).replace(',', '')
    return int(n) if DIM_RE.fullmatch(n) else None


def extract_page(page):
    words = page.get_text('words')  # (x0, y0, x1, y1, text, block, line, word)
    dims, rooms, wall_codes, door_words, others, legend_t = [], [], [], [], [], []
    for w in words:
        x0, y0, x1, y1, t = float(w[0]), float(w[1]), float(w[2]), float(w[3]), w[4]
        rec = {'text': t, 'bbox': [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)]}
        m = LEGEND_T_RE.search(unicodedata.normalize('NFKC', t))
        if m:  # 凡例の壁厚表記（寸法語とは排他にならない位置なので先に拾う。語自体は通常テキスト）
            legend_t.append({'t_mm': int(m.group(1)), 'text': t, 'bbox': rec['bbox']})
        v = norm_num(t)
        if v is not None:
            dims.append({**rec, 'value_mm': v})
            continue
        if len(t) == 1 and t in WALL_CODE_CHARS:
            wall_codes.append(rec)
            continue
        if 'ＷＤ' in t or 'WD' in unicodedata.normalize('NFKC', t):
            door_words.append(rec)
            continue
        if len(t) <= 12 and any(k in t for k in ROOM_KEYWORDS) and not any(e in t for e in ROOM_EXCLUDE):
            rooms.append({**rec, 'name_nfkc': unicodedata.normalize('NFKC', t)})
            continue
        others.append(rec)

    # 建具符号: 'ＷＤ'の直後（同一行・ギャップ<3pt実測: 'ＷＤ'(294.9)と'０'(295.7)=0.8pt）の数字語を連結
    door_symbols = []
    for d in door_words:
        bx = d['bbox']
        num = None
        for o in others + [{'text': x['text'], 'bbox': x['bbox']} for x in dims]:
            ox = o['bbox']
            same_line = abs((bx[1] + bx[3]) / 2 - (ox[1] + ox[3]) / 2) < BAND_TOL * 2
            adjacent = 0 <= ox[0] - bx[2] < 3.0
            if same_line and adjacent and unicodedata.normalize('NFKC', o['text']).isdigit():
                num = unicodedata.normalize('NFKC', o['text'])
                break
        door_symbols.append({'symbol': 'WD' + (num or '?'), 'bbox': bx})
    return dims, rooms, wall_codes, door_symbols, legend_t


def build_chains(dims):
    """同一寸法線上の隣接数字をチェーン化し、連続部分和を生成。
    horiz: y中心が同帯(BAND_TOL)でx連続 / vert: x中心が同帯でy連続（回転90ページの縦書き寸法対応）。
    部分和は連続区間のみ（例 chain=[1200,7350] → sums=[1200,7350,8550]）"""
    chains = []
    for axis in (1, 0):  # 1=horiz(yで帯化), 0=vert(xで帯化)
        c = lambda d: (d['bbox'][axis] + d['bbox'][axis + 2]) / 2
        run = lambda d: d['bbox'][1 - axis]          # 帯内の並び順キー（x0またはy0）
        run_end = lambda d: d['bbox'][3 - axis]      # 前要素の終端（x1またはy1）
        ds = sorted(dims, key=c)
        if not ds:
            continue
        # 帯クラスタリング（中心座標の昇順で1.5pt以内を同帯に）
        bands, cur = [], [ds[0]]
        for d in ds[1:]:
            if c(d) - c(cur[-1]) < BAND_TOL:
                cur.append(d)
            else:
                bands.append(cur)
                cur = [d]
        bands.append(cur)
        # 帯内をギャップで分割してチェーン化
        for band in bands:
            band = sorted(band, key=run)
            cur = [band[0]]
            emit = lambda c: chains.append({'axis': 'horiz' if axis == 1 else 'vert',
                                            'values': [x['value_mm'] for x in c],
                                            # 部屋帰属用（第3段追加）: 各メンバーのbboxとチェーン外接矩形
                                            'member_bboxes': [x['bbox'] for x in c],
                                            'bbox': [min(x['bbox'][0] for x in c), min(x['bbox'][1] for x in c),
                                                     max(x['bbox'][2] for x in c), max(x['bbox'][3] for x in c)]})
            for d in band[1:]:
                if run(d) - run_end(cur[-1]) <= CHAIN_GAP:
                    cur.append(d)
                else:
                    if len(cur) >= 2:
                        emit(cur)
                    cur = [d]
            if len(cur) >= 2:
                emit(cur)
    # 連続部分和（長さ2以上。長さ1=直接値はdims側で担保）
    for ch in chains:
        v = ch['values']
        sums = set()
        for i in range(len(v)):
            s = v[i]
            for j in range(i + 1, len(v)):
                s += v[j]
                sums.add(s)
        ch['run_sums'] = sorted(sums)
    return chains


def room_neighborhood(rooms, dims, radius=120.0):
    """部屋名近傍の寸法（本格帰属は次サイクル・今回は当たりの表示のみ）。
    radius=120pt≒紙上42mm≒1/60縮尺で2.5m四方＝居室1室ぶんの目安"""
    out = []
    for r in rooms:
        rx = ((r['bbox'][0] + r['bbox'][2]) / 2, (r['bbox'][1] + r['bbox'][3]) / 2)
        near = []
        for d in dims:
            dx = ((d['bbox'][0] + d['bbox'][2]) / 2, (d['bbox'][1] + d['bbox'][3]) / 2)
            dist = ((rx[0] - dx[0]) ** 2 + (rx[1] - dx[1]) ** 2) ** 0.5
            if dist <= radius:
                near.append((round(dist, 1), d['value_mm']))
        near.sort()
        out.append({'room': r['text'], 'near_dims': [v for _, v in near[:10]], 'near_count': len(near)})
    return out


def main():
    pages = [int(a) for a in sys.argv[1:]] or [36, 37]
    doc = fitz.open(PDF)
    result = {'pdf': PDF, 'extracted_pages': {}}
    thick_freq, legend_all = {}, []
    for pn in pages:
        page = doc[pn - 1]
        dims, rooms, wall_codes, door_symbols, legend_t = extract_page(page)
        chains = build_chains(dims)
        all_sums = sorted(set(s for ch in chains for s in ch['run_sums']))
        for d in dims:
            v = d['value_mm']
            if THICK_MIN <= v <= THICK_MAX:
                thick_freq[v] = thick_freq.get(v, 0) + 1
        legend_all += [{**l, 'page': pn} for l in legend_t]
        result['extracted_pages'][str(pn)] = {
            'rotation': page.rotation,
            'dims': dims, 'rooms': rooms, 'wall_codes': wall_codes, 'door_symbols': door_symbols,
            'legend_thickness': legend_t,
            'chains': chains, 'chain_run_sums': all_sums,
            'room_neighborhood': room_neighborhood(rooms, dims),
        }
        uniq = sorted(set(d['value_mm'] for d in dims))
        print(f'--- p{pn} (rot={page.rotation})')
        print(f'  寸法語 {len(dims)}件 / ユニーク値 {len(uniq)}種')
        print(f'  部屋名 {len(rooms)}件: {sorted(set(r["text"] for r in rooms))}')
        from collections import Counter
        print(f'  壁記号(1文字) {len(wall_codes)}件: {dict(Counter(w["text"] for w in wall_codes))}')
        print(f'  建具符号 {len(door_symbols)}件: {sorted(set(d["symbol"] for d in door_symbols))}')
        print(f'  チェーン {len(chains)}本 / 連続部分和 {len(all_sums)}種')
        for ch in chains[:6]:
            print(f'    例 {ch["axis"]}: {ch["values"]}')
        print('  部屋名近傍の寸法（当たり表示・上位5室）:')
        for rn in result['extracted_pages'][str(pn)]['room_neighborhood'][:5]:
            print(f'    {rn["room"]}: 近傍{rn["near_count"]}件 {rn["near_dims"]}')
    # 壁厚候補（機械導出・正解JSON不使用）: 頻度クラスタ + 凡例 t=NNN。
    # 「未一致を最小化する厚みを選ぶ」最適化は行わない（答え合わせ禁止）。
    freq_vals = sorted(v for v, n in thick_freq.items() if n >= THICK_FREQ_MIN)
    legend_vals = sorted(set(l['t_mm'] for l in legend_all))
    result['thickness_candidates'] = {
        'rule': f'寸法頻度>={THICK_FREQ_MIN} in [{THICK_MIN},{THICK_MAX}]mm（全対象ページ合算） + 凡例 t=NNN',
        'freq_table': {str(k): thick_freq[k] for k in sorted(thick_freq)},
        'from_freq': freq_vals,
        'from_legend': legend_vals,
        'legend_hits': legend_all,
        'values': sorted(set(freq_vals) | set(legend_vals)),
    }
    print('壁厚候補（機械導出）:', result['thickness_candidates']['values'],
          '（頻度由来', freq_vals, '/ 凡例由来', legend_vals, '）')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f'saved: {OUT}')


if __name__ == '__main__':
    main()
