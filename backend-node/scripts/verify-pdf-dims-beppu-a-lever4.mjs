// verify-pdf-dims-beppu-a-lever4.mjs — レバー1第4段: 凡例壁構成からの「総厚合成則」の測定
//
// 背景（第3段の診断・2026-07-26）:
//   直接寸法で未一致の正解セグメント幅 [1530, 1580, 1880, 2430] が一斉に t=120 の差し引きで閉じ、
//   3430 もチェーン和 3550−120 で閉じる。だが t=120 は寸法頻度表では頻度1＝頻度則からは導出不能。
//   一方 p36 凡例に「t=100　PBt9.5二重貼+遮音シート+グラスウール24ｋ充填」が実在し、
//   総厚 = 芯厚100 + ボード9.5×2 = 119 ≒ 120 という「仕上厚合成」仮説が図面自身から立つ。
//   本スクリプトはこの合成則を最小候補セットで測定する（第3段の教訓: 候補集合を膨らませる変換は
//   偽陽性が支配＝V1で+25.3→+11.5ptに希釈。だから合成総厚「だけ」を候補にしてシグナルを測る）。
//
// 答え合わせ回避の構造（第2・3段と同一）:
//   - 合成則の入力は out-pdf-dims-beppu-a.json の legend_hits（pdf-dim-extract.py が図面テキストから
//     機械抽出・正解JSON非参照）。芯厚t=NNN・ボード厚PBt9.5・層数（二重）は全て凡例文字列から取る。
//     「未一致を最小化する厚みを選ぶ」最適化はしない（候補は凡例合成値のみ・単一厚スイープは順位の報告のみで不採用）。
//   - 本スクリプトは測定のみ。エンジン(src/)非import・目標値なし・exit常に0。部屋帰属は触らない。
//
// 合成則の定義（図面由来・曖昧さは両解釈を併記して測る）:
//   芯厚 core = 凡例の t=NNN（p36実測: 100）
//   ボード合計 boardSum = Σ(ボード厚 × 層数)。ボード厚は 'PBt9.5' 表記から、層数は直後の 二重/三重 から
//   解釈I1（表記の層をそのまま加算・片側複層）: 総厚 = core + boardSum          → 100+9.5×2 = 119
//   解釈I2（同構成を両側に張る戸境壁読み）  : 総厚 = core + boardSum×2         → 100+9.5×4 = 138
//   丸め規則（両方測る）: raw（119/138のまま）と round10（10mm丸め→120/140）。
//     round10の根拠: 別府図面の寸法・正解セグメント幅は10mm粒度（正解26種すべて10の倍数）＝
//     作図寸法は総厚を10mm粒度に丸めて置くのが自然。ただしこれは仮説なのでrawも併記して差を可視化する。
//
// 【必須の対照（第3段reviewer nit-1対応で10mm格子を追加）】
//   50mm格子カバー率（第2・3段と同一・比較継続性）+ 10mm格子カバー率（正解幅の実粒度に合わせた公平な
//   ベースレート。raw=119差し引きは末尾1のmm値を生む＝10mm粒度の正解に構造的に当たらないことも
//   10mm格子側が正しく写す）。シグナル = 合算ヒット率 − 格子カバー率。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const extracted = JSON.parse(readFileSync(join(HERE, 'out-pdf-dims-beppu-a.json'), 'utf-8'));
const truth = JSON.parse(readFileSync(join(HERE, 'beppu-room-truth.json'), 'utf-8'));

const strip = (s) => s.replace(/[\s　]/g, '');
const PART_WALL = '壁（ボ－ド）';    // 第2・3段と同一の測定対象
const PART_SOUND = '遮音壁ＰＢ張り';

// ---- 正解収集（第3段と同一） ----
function collectWidths(partName) {
  const add = [];
  for (const room of truth.types.A.rooms) {
    for (const b of room.blocks) {
      if (b.kind !== 'faces' || strip(b.part) !== partName) continue;
      for (const face of Object.values(b.faces)) {
        for (const seg of face) if (!seg.ded) add.push(Math.round(seg.w * 1000));
      }
    }
  }
  return add;
}
const wallW = collectWidths(PART_WALL);
const soundW = collectWidths(PART_SOUND);
const allTruthUniq = [...new Set([...wallW, ...soundW])].sort((a, b) => a - b);

// ---- 抽出側集合（第3段と同一） ----
const pages = Object.keys(extracted.extracted_pages).map(Number).sort((a, b) => a - b);
const D = new Set(); // 直接寸法（全ページ統合）
const S = new Set(); // チェーン連続部分和（全ページ統合・参考のみ。第2段時点で格子90.8%飽和）
for (const pn of pages) {
  const p = extracted.extracted_pages[String(pn)];
  for (const d of p.dims) D.add(d.value_mm);
  for (const s of p.chain_run_sums) S.add(s);
}

// ---- 対照: 格子カバー率（レンジ=正解幅の存在レンジ・第2・3段と同一。stepで50/10mm両対応） ----
const LO = Math.min(...allTruthUniq), HI = Math.max(...allTruthUniq);
function gridCoverage(set, step) {
  let total = 0, hit = 0;
  for (let v = LO; v <= HI; v += step) { total++; if (set.has(v)) hit++; }
  return (100 * hit) / total;
}
const pct = (x) => x.toFixed(1) + '%';
const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);

// ---- 合成則: 凡例テキスト → 総厚（機械導出・数値のハードコードなし） ----
function composeFromLegend(hit) {
  const txt = hit.text.normalize('NFKC');
  const boards = [];
  const re = /PB\s*t?\s*(\d+(?:\.\d+)?)/gi; // 凡例のボード厚表記 'PBt9.5'
  let m;
  while ((m = re.exec(txt))) {
    const th = parseFloat(m[1]);
    // 層数: ボード表記の直後の数詞（'PBt9.5二重貼'→2）。表記がなければ1層
    const after = txt.slice(m.index + m[0].length, m.index + m[0].length + 4);
    const mult = /三重/.test(after) ? 3 : /二重/.test(after) ? 2 : 1;
    boards.push({ th, mult });
  }
  const boardSum = boards.reduce((a, b) => a + b.th * b.mult, 0);
  return {
    core: hit.t_mm, boards, boardSum,
    i1: hit.t_mm + boardSum,       // 解釈I1: 表記層をそのまま加算
    i2: hit.t_mm + boardSum * 2,   // 解釈I2: 同構成を両側に（戸境二重壁読み）
  };
}
const round10 = (v) => Math.round(v / 10) * 10;

const legendHits = extracted.thickness_candidates.legend_hits || [];
console.log('=== レバー1第4段: 凡例壁構成からの総厚合成則（別府Aタイプ・課金ゼロ・測定のみ） ===');
console.log('--- 合成則の導出過程（凡例テキスト→総厚。正解JSONは一切見ない）');
if (!legendHits.length) console.log('  凡例 t=NNN の抽出なし＝合成不能（測定対象なし）');
const compositions = [];
for (const h of legendHits) {
  const c = composeFromLegend(h);
  compositions.push(c);
  console.log(`  p${h.page} "${h.text}"`);
  console.log(`    芯厚 core=${c.core}mm / ボード [${c.boards.map((b) => `${b.th}mm×${b.mult}層`).join(', ')}] 合計${c.boardSum}mm`);
  console.log(`    解釈I1(表記層のみ)  : ${c.core}+${c.boardSum} = ${c.i1}mm → round10 ${round10(c.i1)}mm`);
  console.log(`    解釈I2(両側に同構成): ${c.core}+${c.boardSum}×2 = ${c.i2}mm → round10 ${round10(c.i2)}mm`);
}

// ---- 変換と測定（第3段と同一の枠組み+10mm格子対照） ----
function convert(base, diffs) {
  const out = new Set(base);
  for (const d of base) for (const t of diffs) if (d - t > 0) out.add(d - t);
  return out;
}
function measure(label, set, { showMiss = false } = {}) {
  const hit = (ws) => {
    const uniq = [...new Set(ws)];
    const h = uniq.filter((v) => set.has(v));
    return { n: uniq.length, h: h.length, miss: uniq.filter((v) => !set.has(v)).sort((a, b) => a - b) };
  };
  const w = hit(wallW), s = hit(soundW), c = hit(allTruthUniq);
  const cov50 = gridCoverage(set, 50), cov10 = gridCoverage(set, 10);
  const hitPct = (100 * c.h) / c.n;
  const m50 = hitPct - cov50, m10 = hitPct - cov10;
  console.log(`  ${label}: 集合${set.size}種`
    + ` | 壁PB ${w.h}/${w.n}(${pct((100 * w.h) / w.n)}) 遮音PB ${s.h}/${s.n}(${pct((100 * s.h) / s.n)})`
    + ` 合算 ${c.h}/${c.n}(${pct(hitPct)})`
    + ` | 格子50mm ${pct(cov50)}→ｼｸﾞﾅﾙ${sgn(m50)}pt / 格子10mm ${pct(cov10)}→ｼｸﾞﾅﾙ${sgn(m10)}pt`);
  if (showMiss) console.log(`    未一致(合算): [${c.miss.join(', ')}]`);
  return { w, s, c, cov50, cov10, m50, m10, hitPct };
}

console.log(`\n--- 最小候補セットでの測定（直接寸法ベース。レンジ${LO}〜${HI}mm・50mm格子${Math.floor((HI - LO) / 50) + 1}点/10mm格子${Math.floor((HI - LO) / 10) + 1}点）`);
console.log('  ※候補を合成総厚のみに絞る＝ベースレート上昇を最小化してシグナルを測る（第3段V1の希釈教訓）');
const base = measure('無変換（基準）', D, { showMiss: true });
const coreOnly = [...new Set(compositions.map((c) => c.core))];
const v0 = measure(`L0 芯厚のみ t∈[${coreOnly.join(',')}]（第3段V0の再掲・比較継続）`, convert(D, coreOnly));
const i1raw = [...new Set(compositions.map((c) => c.i1))];
const i1r10 = [...new Set(compositions.map((c) => round10(c.i1)))];
const i2raw = [...new Set(compositions.map((c) => c.i2))];
const i2r10 = [...new Set(compositions.map((c) => round10(c.i2)))];
const rI1raw = measure(`L4a 合成I1 raw t∈[${i1raw.join(',')}]`, convert(D, i1raw), { showMiss: true });
const rI1r10 = measure(`L4b 合成I1 round10 t∈[${i1r10.join(',')}]`, convert(D, i1r10), { showMiss: true });
const rI2raw = measure(`L4c 合成I2 raw t∈[${i2raw.join(',')}]（対照解釈）`, convert(D, i2raw));
const rI2r10 = measure(`L4d 合成I2 round10 t∈[${i2r10.join(',')}]（対照解釈）`, convert(D, i2r10));
measure(`L4e 合成I1 raw+round10 t∈[${[...new Set([...i1raw, ...i1r10])].join(',')}]`, convert(D, [...new Set([...i1raw, ...i1r10])]));

// ---- 診断: 第3段の直接未一致それぞれが合成総厚で閉じるか（直接/チェーン和別・報告のみ） ----
console.log('\n--- 診断: 無変換の未一致それぞれが合成総厚で閉じるか（チェーン和は参考・格子飽和済み）');
const candAll = [...new Set([...i1raw, ...i1r10, ...i2raw, ...i2r10])].sort((a, b) => a - b);
for (const miss of base.c.miss) {
  const via = [];
  for (const t of candAll) {
    if (D.has(miss + t)) via.push(`直接${miss + t}−${t}`);
    else if (S.has(miss + t)) via.push(`ﾁｪｰﾝ和${miss + t}−${t}`);
  }
  console.log(`  ${miss}: ${via.length ? via.join(' / ') : '合成総厚では閉じない'}`);
}

// ---- 対照: 単一厚スイープ（合成総厚が「特別」か「どの厚でも同程度」かの白黒。順位の報告のみ・採用しない） ----
console.log('\n--- 対照: 単一厚スイープ t\'=40..400（step10）で convert(D,{t\'}) の新規ヒット数を全数測定');
console.log('  合成総厚の順位がスイープ上位に入らなければ「t=120の効きは偶然（どの厚でも起きる）」と判定できる');
const sweep = [];
for (let t = 40; t <= 400; t += 10) {
  const set = convert(D, [t]);
  const h = allTruthUniq.filter((v) => set.has(v)).length;
  const m10 = (100 * h) / allTruthUniq.length - gridCoverage(set, 10);
  sweep.push({ t, newHits: h - base.c.h, hits: h, m10 });
}
sweep.sort((a, b) => b.newHits - a.newHits || b.m10 - a.m10);
console.log('  上位10厚: ' + sweep.slice(0, 10).map((s) => `t=${s.t}(+${s.newHits}件,10mm格子ｼｸﾞﾅﾙ${sgn(s.m10)}pt)`).join(' '));
for (const t of [...new Set([...i1r10, ...i2r10, ...coreOnly])].sort((a, b) => a - b)) {
  const idx = sweep.findIndex((s) => s.t === t);
  if (idx >= 0) console.log(`  合成/芯厚 t=${t} の順位: ${idx + 1}/${sweep.length}（新規+${sweep[idx].newHits}件・10mm格子ｼｸﾞﾅﾙ${sgn(sweep[idx].m10)}pt）`);
}

// ---- 実測サマリ（数値からの機械判定。目標値なし・exit 0） ----
console.log('\n[実測サマリ]');
console.log(`  無変換: 合算${base.c.h}/${base.c.n} ｼｸﾞﾅﾙ50mm${sgn(base.m50)}pt/10mm${sgn(base.m10)}pt`);
console.log(`  L0芯厚のみ(t=${coreOnly.join(',')}): 新規+${v0.c.h - base.c.h}件 ｼｸﾞﾅﾙ50mm${sgn(v0.m50)}pt/10mm${sgn(v0.m10)}pt`);
console.log(`  L4a合成I1 raw(t=${i1raw.join(',')}): 新規+${rI1raw.c.h - base.c.h}件 ｼｸﾞﾅﾙ50mm${sgn(rI1raw.m50)}pt/10mm${sgn(rI1raw.m10)}pt`);
console.log(`  L4b合成I1 round10(t=${i1r10.join(',')}): 新規+${rI1r10.c.h - base.c.h}件 ｼｸﾞﾅﾙ50mm${sgn(rI1r10.m50)}pt/10mm${sgn(rI1r10.m10)}pt`);
console.log(`  L4c/d合成I2(t=${i2raw.join(',')}/${i2r10.join(',')}): 新規+${rI2raw.c.h - base.c.h}/+${rI2r10.c.h - base.c.h}件`);
const verdict = (rI1r10.c.h - base.c.h) > 0 && rI1r10.m10 >= base.m10 - 0.05
  ? '合成則(round10)はベースレート上昇を上回って効いている'
  : (rI1r10.c.h - base.c.h) > 0
    ? '合成則(round10)は新規一致を生むがシグナルは基準から縮む＝ベースレート上昇に見合うかは上の数値で判断'
    : '合成則は効かない（新規一致なし）';
console.log(`  機械判定: ${verdict}`);
// exit codeは常に0（目標値を設けない実測レポート。回帰ゲートではない）
