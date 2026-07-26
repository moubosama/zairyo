// verify-anchor-beppu-a.mjs — レバー1第6段: 2ソース検証アンカーのAI読み照合測定（課金ゼロ・測定のみ）
//
// 目的: 第4段（テキスト層寸法+t=120合成則）と第5段（壁線幾何スパン）で作った「図面由来の
//   独立2ソース」を、AIの読み幅（別府A記録の面幅・平面セグメント長）の**検証網**として
//   使えるかの白黒を付ける。AIの誤読は「値の捏造」より「実在値の帰属間違い」が多い
//   （B遮@9700=建物グリッド値の実測）と判明済みなので、単純な値照合の検出力の上限を正直に測る。
//
// 測定の構造（答え合わせ回避）:
//   - アンカー集合（ソースA/B）は図面由来のみで構成（out-*.json は pdf-dim-extract.py /
//     pdf-wall-geometry.py が正解JSON非参照で抽出）。正解JSON（beppu-room-truth.json）は
//     「各AI読みが正しかったか」のラベル付けにのみ使用し、アンカー集合には一切入れない。
//   - 本スクリプトは測定のみ: エンジン(src/)非import・目標値なし・exit常に0。
//
// 分類（優先順位つき・上から先着）:
//   (a) ソースA直接一致    : AI幅 w が直接寸法集合Dに完全一致（AIは寸法値の転記なので許容0mm）
//   (b) ソースA+t変換一致  : D.has(w + t)。tは凡例合成則（lever4 I1 round10。p36凡例から機械導出=120）
//                            ＝「芯々寸法 − 総厚 = 内法」の側だけ（lever4と同方向・対称拡張しない）
//   (c) ソースB一致        : 壁線幾何スパン（バリアントall・支持>=3・±10mm。第5段の
//                            正解84.6%カバー/遮音100%/シグナル+45.9ptの構成）
//   (d) チェーン和のみ一致 : 寸法チェーン連続部分和（第2段で格子90.8%飽和＝偽陽性帯。参考のみ）
//   (e) どこにも無い       : 検証網が「怪しい」と弾く側
//
// 正誤ラベル: AI部屋名→正解部屋の対応表（diag-beppu-rooms.mjs の ROOM_MAP を流用）で
//   該当部屋の正解セグメント幅（壁面系部位・h>=2.0m・控除行除く＝diagのtruthWallSegmentsと同一）
//   と±80mm（エンジンPLACEMENT_TOL_MM同値）で照合。対応部屋が無い読み（SCL/UB等）は「不明」。
//   感度チェックとして「全部位faces（h>=2.0）」を参照集合にした場合も併記
//   （打放しA/C04面は壁面系ブロックに現れず、正しい転記が誤り側に落ちる分の定量化）。
//
// 対照（ベースレート）: AI読み幅の代わりに正解幅レンジの50mm格子悉皆を同じ分類器に流した分布。
//   「網一致」が当てずっぽうでもどれだけ出るか＝検証網の見かけの通過率の基準線。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const dims = JSON.parse(readFileSync(join(HERE, 'out-pdf-dims-beppu-a.json'), 'utf-8'));
const geo = JSON.parse(readFileSync(join(HERE, 'out-wall-geometry-beppu-a.json'), 'utf-8'));
const rec = JSON.parse(readFileSync(join(HERE, 'recordings', 'beppu-a-gemini-read-gemini-2.5-flash.json'), 'utf-8'));
const truth = JSON.parse(readFileSync(join(HERE, 'beppu-room-truth.json'), 'utf-8'));

const pct = (x) => (Number.isFinite(x) ? x.toFixed(1) + '%' : '-');
const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);

// ============================================================
// アンカー集合の構築（図面由来のみ・正解JSON非参照）
// ============================================================
// ソースA: 直接寸法D + チェーン連続部分和S（全対象ページ統合・第2〜4段と同一）
const D = new Set();
const S = new Set();
for (const p of Object.values(dims.extracted_pages)) {
  for (const d of p.dims) D.add(d.value_mm);
  for (const s of p.chain_run_sums) S.add(s);
}
// t=120合成則: 凡例テキストから機械導出（lever4 composeFromLegend の I1 round10 と同一規則。
// 数値120のハードコードなし＝凡例が変われば追従する）
function composedThicknesses(legendHits) {
  const out = new Set();
  for (const h of legendHits || []) {
    const txt = String(h.text).normalize('NFKC');
    let boardSum = 0;
    const re = /PB\s*t?\s*(\d+(?:\.\d+)?)/gi;
    let m;
    while ((m = re.exec(txt))) {
      const after = txt.slice(m.index + m[0].length, m.index + m[0].length + 4);
      const mult = /三重/.test(after) ? 3 : /二重/.test(after) ? 2 : 1;
      boardSum += parseFloat(m[1]) * mult;
    }
    out.add(Math.round((h.t_mm + boardSum) / 10) * 10); // 解釈I1 round10（第4段で有効と実測済み）
  }
  return [...out].sort((a, b) => a - b);
}
const T_COMPOSED = composedThicknesses(dims.thickness_candidates.legend_hits);

// ソースB: 壁線幾何スパン（第5段のシグナル最良構成: バリアントall・支持>=3・±10mm）
const GEO_VARIANT = 'all';
const GEO_MIN_SUPPORT = 3;
const GEO_TOL = 10;
const spans = (() => {
  const v = geo.variants[GEO_VARIANT];
  const out = new Set();
  for (const key of ['spans_h_gap', 'spans_v_gap']) {
    for (const [mm, n] of Object.entries(v[key])) if (n >= GEO_MIN_SUPPORT) out.add(Number(mm));
  }
  return [...out].sort((a, b) => a - b);
})();
const spanHas = (v, tol) => {
  let lo = 0, hi = spans.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (spans[m] < v - tol) lo = m + 1; else hi = m; }
  return lo < spans.length && spans[lo] <= v + tol;
};

// 分類器（優先順位 a > b > c > d > e）
const CLASSES = ['a_A直接', 'b_A+t変換', 'c_B幾何', 'd_ﾁｪｰﾝ和のみ', 'e_どこにも無い'];
function classify(w) {
  if (D.has(w)) return 'a_A直接';
  if (T_COMPOSED.some((t) => D.has(w + t))) return 'b_A+t変換';
  if (spanHas(w, GEO_TOL)) return 'c_B幾何';
  if (S.has(w)) return 'd_ﾁｪｰﾝ和のみ';
  return 'e_どこにも無い';
}

// ============================================================
// 正解セグメント収集（diag-beppu-rooms.mjs の partClass / truthWallSegments と同一規則）
// ============================================================
const stripSp = (s) => String(s || '').replace(/[\s　]/g, '');
const partClass = (b) => {
  const p = stripSp(b.part);
  const spec = String(b.spec || '');
  if (/^遮音壁ＰＢ張り/.test(p)) return 'sound';
  if (/^遮音壁耐水/.test(p)) return 'soundWet';
  if (/^壁（(ボ|ﾎﾞ)/.test(p)) return /耐水/.test(spec) ? 'wallWet' : 'wall';
  if (/^部分界壁/.test(p)) return 'kaibe';
  if (/^防露ふかし壁/.test(p)) return 'boro';
  if (/^壁（不燃材）/.test(p)) return 'funen';
  return null;
};
// 参照集合2種: primary=壁面系部位のみ（diag互換） / all=全部位faces（感度チェック）
function truthSegs(room, mode) {
  const segs = [];
  for (const b of room.blocks || []) {
    if (b.kind !== 'faces') continue;
    if (mode === 'primary' && !partClass(b)) continue;
    for (const label of ['A', 'B', 'C', 'D']) {
      for (const f of b.faces?.[label] || []) {
        if (f.ded) continue;
        if (!(f.h >= 2.0)) continue;
        segs.push({ label, w_mm: Math.round(f.w * 1000), part: stripSp(b.part) });
      }
    }
  }
  return segs;
}
const truthRooms = new Map(truth.types.A.rooms.map((r) => [r.name, r]));

// AI部屋名→正解部屋名（diagのROOM_MAP流用。NFKC正規化+空白・中黒除去キー）
const normKey = (s) => String(s || '').normalize('NFKC').replace(/[\s　・]/g, '');
const AI_TO_TRUTH = new Map(Object.entries({
  '玄関': '玄関', '廊下': '玄関', '玄関廊下': '玄関',
  'LDK': '台所',
  '洋室1': '洋室(１)', '洋室(1)': '洋室(１)',
  '洋室2': '洋室(2)', '洋室(2)': '洋室(2)',
  '洋室3': '洋室(3)', '洋室(3)': '洋室(3)',
  '洗面': '洗面所', '洗面室': '洗面所', '洗面所': '洗面所',
  'トイレ': '便所', '便所': '便所',
}));
const mapRoom = (aiName) => AI_TO_TRUTH.get(normKey(aiName)) ?? null;

const TRUTH_TOL = 80; // エンジンPLACEMENT_TOL_MMと同値（diag面幅突合と同一）
function judge(truthRoomName, w, mode) {
  if (!truthRoomName) return { label: '不明', nearest: null };
  const room = truthRooms.get(truthRoomName);
  if (!room) return { label: '不明', nearest: null };
  const segs = truthSegs(room, mode);
  if (segs.length === 0) return { label: '不明', nearest: null };
  let best = null;
  for (const s of segs) {
    const d = Math.abs(w - s.w_mm);
    if (!best || d < best.d) best = { d, seg: s };
  }
  return { label: best.d <= TRUTH_TOL ? '正' : '誤', nearest: best };
}

// ============================================================
// AI読み幅の収集（面幅 + 平面セグメント長。重複読みはdedup）
// ============================================================
const items = [];
let rawFaceN = 0, rawPlN = 0;
const seenPl = new Set(); // (部屋キー, 幅) — 両面重複と elevations/wall_finish_codes の二重収録をdedup
for (const er of rec.elevations.rooms) {
  const roomKey = mapRoom(er.name) ?? 'raw:' + normKey(er.name);
  for (const f of er.faces || []) {
    if (!Number.isFinite(f.width_mm) || f.width_mm <= 0) continue;
    rawFaceN++;
    items.push({ room: er.name, truthRoom: mapRoom(er.name), kind: 'face', detail: `${f.face}面`, w: f.width_mm, code: f.wall_code || '' });
  }
  for (const p of er.plan_placements || []) {
    if (!Number.isFinite(p.wall_length_mm) || p.wall_length_mm <= 0) continue;
    rawPlN++;
    const k = `${roomKey}|${p.wall_length_mm}`;
    if (seenPl.has(k)) continue;
    seenPl.add(k);
    items.push({ room: er.name, truthRoom: mapRoom(er.name), kind: 'placement', detail: p.code, w: p.wall_length_mm, code: p.code || '' });
  }
}
// wall_finish_codes（平面タイル読み）のうち展開図rooms未収録の部屋（UB・共用部等）も収集
const elevKeys = new Set(rec.elevations.rooms.map((er) => mapRoom(er.name) ?? 'raw:' + normKey(er.name)));
for (const wr of rec.wall_finish_codes || []) {
  const roomKey = mapRoom(wr.room) ?? 'raw:' + normKey(wr.room);
  if (elevKeys.has(roomKey)) continue; // attachElevationDataでplan_placementsへマージ済み＝二重計上回避
  for (const p of wr.placements || []) {
    if (!Number.isFinite(p.wall_length_mm) || p.wall_length_mm <= 0) continue;
    rawPlN++;
    const k = `${roomKey}|${p.wall_length_mm}`;
    if (seenPl.has(k)) continue;
    seenPl.add(k);
    items.push({ room: wr.room, truthRoom: mapRoom(wr.room), kind: 'placement', detail: p.code, w: p.wall_length_mm, code: p.code || '' });
  }
}
for (const it of items) {
  it.cls = classify(it.w);
  const j1 = judge(it.truthRoom, it.w, 'primary');
  const j2 = judge(it.truthRoom, it.w, 'all');
  it.label = j1.label; it.nearest = j1.nearest;
  it.labelAll = j2.label; it.nearestAll = j2.nearest;
}

// ============================================================
// 出力
// ============================================================
console.log('=== レバー1第6段: 2ソース検証アンカーのAI読み照合（別府A・課金ゼロ・測定のみ） ===');
console.log(`アンカー: ソースA直接寸法${D.size}種 / 合成厚t∈[${T_COMPOSED.join(',')}]（凡例から機械導出）`
  + ` / ソースB幾何スパン${spans.length}種（${GEO_VARIANT}・支持>=${GEO_MIN_SUPPORT}・±${GEO_TOL}mm）`
  + ` / ﾁｪｰﾝ和${S.size}種（参考・偽陽性帯）`);
console.log(`AI読み: 面幅${rawFaceN}件 + 平面ｾｸﾞ${rawPlN}件(生) → dedup後 計${items.length}件`
  + `（正誤ラベル: 正解部屋対応あり${items.filter((i) => i.truthRoom).length}件 / 対応なし=不明${items.filter((i) => !i.truthRoom).length}件）`);
const unmapped = [...new Set(items.filter((i) => !i.truthRoom).map((i) => i.room))];
console.log(`  対応なし部屋（収納・UB・共用部=正解に部屋ブロックなし）: [${unmapped.join(', ')}]`);
console.log(`  正誤基準: 該当部屋の正解セグメント幅（壁面系部位・h>=2.0・控除除く）±${TRUTH_TOL}mm`);

// ---- クロス表（分類×正誤・primary基準） ----
console.log('\n--- 1. 分類×正誤クロス表（primary=壁面系部位基準） ---');
console.log('  分類            | 正   誤   不明 | 計   | 正解率(正誤判明分)');
const byCls = new Map(CLASSES.map((c) => [c, { 正: 0, 誤: 0, 不明: 0 }]));
for (const it of items) byCls.get(it.cls)[it.label]++;
for (const c of CLASSES) {
  const r = byCls.get(c);
  const n = r.正 + r.誤 + r.不明;
  const known = r.正 + r.誤;
  console.log(`  ${c.padEnd(14)} | ${String(r.正).padEnd(4)} ${String(r.誤).padEnd(4)} ${String(r.不明).padEnd(4)} | ${String(n).padEnd(4)}| ${known ? pct((100 * r.正) / known) : '-(判明0件)'}`);
}
const tot = { 正: 0, 誤: 0, 不明: 0 };
for (const it of items) tot[it.label]++;
console.log(`  ${'全体'.padEnd(15)} | ${String(tot.正).padEnd(4)} ${String(tot.誤).padEnd(4)} ${String(tot.不明).padEnd(4)} | ${String(items.length).padEnd(4)}| ${pct((100 * tot.正) / (tot.正 + tot.誤))}`);

// ---- 検証網としての2値評価: 網一致(a|b|c) vs 網不一致(e)。(d)は偽陽性帯として別掲 ----
function binaryStats(labelField) {
  const inNet = items.filter((i) => ['a_A直接', 'b_A+t変換', 'c_B幾何'].includes(i.cls) && i[labelField] !== '不明');
  const outNet = items.filter((i) => i.cls === 'e_どこにも無い' && i[labelField] !== '不明');
  const chainOnly = items.filter((i) => i.cls === 'd_ﾁｪｰﾝ和のみ' && i[labelField] !== '不明');
  const err = (arr) => (arr.length ? (100 * arr.filter((i) => i[labelField] === '誤').length) / arr.length : NaN);
  const known = items.filter((i) => i[labelField] !== '不明');
  const wrongAll = known.filter((i) => i[labelField] === '誤');
  const flaggedWrong = outNet.filter((i) => i[labelField] === '誤');
  return {
    inNet, outNet, chainOnly,
    errIn: err(inNet), errOut: err(outNet), errChain: err(chainOnly), errAll: err(known),
    recall: wrongAll.length ? (100 * flaggedWrong.length) / wrongAll.length : NaN, // 誤読のうち網が弾いた率
    precision: outNet.length ? (100 * flaggedWrong.length) / outNet.length : NaN, // 弾いたもののうち実際に誤読の率
    nWrong: wrongAll.length, nFlaggedWrong: flaggedWrong.length,
  };
}
const B1 = binaryStats('label');
console.log('\n--- 2. 検証網の検出力（網一致=a∪b∪c / 網不一致=e。正誤判明分のみ） ---');
console.log(`  誤り率: 網一致${pct(B1.errIn)}(${B1.inNet.length}件) / 網不一致(e)${pct(B1.errOut)}(${B1.outNet.length}件)`
  + ` / ﾁｪｰﾝ和のみ(d)${pct(B1.errChain)}(${B1.chainOnly.length}件) / 全体${pct(B1.errAll)}`);
console.log(`  検出力（(e)誤り率−全体誤り率）: ${B1.outNet.length ? sgn(B1.errOut - B1.errAll) + 'pt' : '-（(e)該当0件＝網が何も弾かない）'}`);
console.log(`  誤読の捕捉率（誤読${B1.nWrong}件中、網不一致で弾けた数）: ${B1.nFlaggedWrong}/${B1.nWrong} (${pct(B1.recall)})`);
console.log(`  弾きの的中率（網不一致${B1.outNet.length}件中、実際に誤読）: ${pct(B1.precision)}`);

// ---- kind別（面幅=合算誤読の主戦場 / 平面ｾｸﾞ=帰属間違いの主戦場） ----
console.log('\n--- 3. 種別内訳（正誤判明分・primary基準） ---');
for (const kind of ['face', 'placement']) {
  const ks = items.filter((i) => i.kind === kind && i.label !== '不明');
  const inN = ks.filter((i) => ['a_A直接', 'b_A+t変換', 'c_B幾何'].includes(i.cls));
  const outN = ks.filter((i) => i.cls === 'e_どこにも無い');
  const err = (arr) => (arr.length ? (100 * arr.filter((i) => i.label === '誤').length) / arr.length : NaN);
  console.log(`  ${kind === 'face' ? '展開図面幅  ' : '平面ｾｸﾞ長   '}: ${ks.length}件 誤り率${pct(err(ks))}`
    + ` | 網一致${inN.length}件(誤り率${pct(err(inN))}) 網不一致${outN.length}件(誤り率${pct(err(outN))})`);
}

// ---- 限界の定量化: アンカー一致なのに誤読（帰属間違い=値照合では原理的に捕まらない） ----
console.log('\n--- 4. 検証網の限界: アンカー一致(a∪b∪c)かつ誤読の全件 ---');
const inWrong = items.filter((i) => ['a_A直接', 'b_A+t変換', 'c_B幾何'].includes(i.cls) && i.label === '誤');
if (!inWrong.length) console.log('  0件');
for (const it of inWrong) {
  console.log(`  [${it.cls}] ${it.room} ${it.kind === 'face' ? it.detail : `${it.detail}@`}${it.w}mm`
    + ` → 正解最近傍 ${it.nearest.seg.label}${it.nearest.seg.w_mm}(${it.nearest.seg.part}) Δ${it.nearest.d}mm`
    + (it.labelAll === '正' ? ' ※全部位基準では正（部位スコープ差）' : ''));
}
// 逆側: 網不一致(e)なのに正読（過剰に弾く側の損失）
const outRight = items.filter((i) => i.cls === 'e_どこにも無い' && i.label === '正');
console.log(`\n  逆側=網不一致(e)なのに正読（過剰棄却の損失）: ${outRight.length}件`);
for (const it of outRight) {
  console.log(`    ${it.room} ${it.kind === 'face' ? it.detail : `${it.detail}@`}${it.w}mm`
    + ` → 正解 ${it.nearest.seg.label}${it.nearest.seg.w_mm}(${it.nearest.seg.part}) Δ${it.nearest.d}mm`);
}

// ---- 対照: 50mm格子悉皆の分類分布（ベースレート） ----
const truthWidths = [];
for (const room of truth.types.A.rooms) for (const s of truthSegs(room, 'primary')) truthWidths.push(s.w_mm);
const LO = Math.min(...truthWidths), HI = Math.max(...truthWidths);
const gridDist = new Map(CLASSES.map((c) => [c, 0]));
let gridN = 0;
for (let v = LO; v <= HI; v += 50) { gridN++; gridDist.set(classify(v), gridDist.get(classify(v)) + 1); }
console.log(`\n--- 5. 対照: 50mm格子悉皆（${LO}〜${HI}mm・${gridN}点）の分類分布（ベースレート） ---`);
const aiDist = new Map(CLASSES.map((c) => [c, items.filter((i) => i.cls === c).length]));
console.log('  分類            | AI読み分布      | 格子ベースレート');
for (const c of CLASSES) {
  console.log(`  ${c.padEnd(14)} | ${String(aiDist.get(c)).padEnd(3)} (${pct((100 * aiDist.get(c)) / items.length).padEnd(6)}) | ${String(gridDist.get(c)).padEnd(3)} (${pct((100 * gridDist.get(c)) / gridN)})`);
}
const netAi = (100 * ['a_A直接', 'b_A+t変換', 'c_B幾何'].reduce((s, c) => s + aiDist.get(c), 0)) / items.length;
const netGrid = (100 * ['a_A直接', 'b_A+t変換', 'c_B幾何'].reduce((s, c) => s + gridDist.get(c), 0)) / gridN;
console.log(`  網一致率: AI読み${pct(netAi)} vs 格子${pct(netGrid)}（差${sgn(netAi - netGrid)}pt＝AI読みが実在値側に寄っている度）`);

// ---- 感度チェック: 正誤基準を全部位facesに広げた場合 ----
const B2 = binaryStats('labelAll');
console.log('\n--- 6. 感度チェック: 正誤基準=全部位faces(h>=2.0)の場合 ---');
console.log(`  誤り率: 網一致${pct(B2.errIn)} / 網不一致(e)${pct(B2.errOut)} / 全体${pct(B2.errAll)}`
  + ` | 検出力${sgn(B2.errOut - B2.errAll)}pt / 捕捉率${pct(B2.recall)} / 的中率${pct(B2.precision)}`);

// ---- 機械サマリ ----
console.log('\n[実測サマリ]');
console.log(`  検出力（primary）: (e)誤り率${pct(B1.errOut)} − 全体${pct(B1.errAll)} = ${sgn(B1.errOut - B1.errAll)}pt`
  + `（全部位基準: ${sgn(B2.errOut - B2.errAll)}pt）`);
console.log(`  限界: アンカー一致かつ誤読 ${inWrong.length}件（うち全部位基準でも誤 ${inWrong.filter((i) => i.labelAll === '誤').length}件）`
  + ` / 誤読捕捉率 ${pct(B1.recall)}（値照合で捕まらない誤読=帰属間違いが ${B1.nWrong - B1.nFlaggedWrong}/${B1.nWrong}件）`);
const verdict = (B1.errOut - B1.errAll) >= 15 && B1.precision >= 50
  ? '網不一致(e)は誤読の有力シグナル＝検証網として使える（ただし帰属間違いは素通り）'
  : (B1.errOut - B1.errAll) >= 5
    ? '弱いシグナルはあるが単純値照合では検出力不足＝帰属（部屋・面）まで見ない限り検証網にならない'
    : '検出力なし＝単純値照合は検証網として機能しない';
console.log(`  機械判定: ${verdict}`);
// exit codeは常に0（目標値を設けない実測レポート。回帰ゲートではない）
