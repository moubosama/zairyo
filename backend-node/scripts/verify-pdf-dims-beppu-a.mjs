// verify-pdf-dims-beppu-a.mjs — PDFテキスト層抽出（pdf-dim-extract.py）の正解一致率測定
//
// 役割: scripts/out-pdf-dims-beppu-a.json（抽出結果）と scripts/beppu-room-truth.json（XLS正解）を突合し、
//   別府Aタイプの壁PB・遮音PBの全セグメント幅（w×1000 mm）が
//   (a) 直接抽出値に在るか (b) 寸法チェーンの連続部分和まで含めて構成可能か を測定する。
//
// 答え合わせ回避の構造: 抽出側（pdf-dim-extract.py）は正解JSONを一切読まない。
//   本スクリプトは測定のみでエンジン(src/)を一切importしない（eval-beppu-truth.mjsと同じ流儀）。
//   目標値は設けない＝実測を報告するだけ。
//
// 【指標の格付け（2026-07-26 reviewer対照実験で確定）】
//   見出し指標＝直接一致のみ。チェーン連続部分和込みは「参考」（偽陽性が支配的）。
//   根拠: direct115種+chain和747種の集合は50mm格子をほぼ飽和し、50mm刻み一様乱数の90.8%が
//   ヒットする＝実測76.9%は乱数対照を下回り証拠にならない。一方直接一致57.7%は
//   50mm格子ベースレート32.4%に対し有意（p≈0.003級）＝本物の信号。
//   本スクリプトは両集合の50mm格子カバー率（ベースレート対照）を併記し、読者が偽陽性率を
//   自分で確認できるようにする。
//   【次段への申し送り】芯々−壁厚の差し引き層を入れる場合、候補集合が壁厚4種(60/110/120/220)で
//   約4倍に膨らみ格子飽和がさらに進む。同種のベースレート対照の併記が必須。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const extracted = JSON.parse(readFileSync(join(HERE, 'out-pdf-dims-beppu-a.json'), 'utf-8'));
const truth = JSON.parse(readFileSync(join(HERE, 'beppu-room-truth.json'), 'utf-8'));

// 測定対象部位（beppu-room-truth.json Aタイプの実在part名・空白除去後の完全一致）。
// 注意: '壁（ﾎﾞ-ﾄﾞ）'（半角カナ）は耐水PBの別部位＝対象外。
const PART_WALL = '壁（ボ－ド）';       // spec: ＰＢ ｔ-9.5
const PART_SOUND = '遮音壁ＰＢ張り';    // spec: t9.5+GW
const strip = (s) => s.replace(/[\s　]/g, '');

// ---- 正解セグメント幅の収集（w×1000のmm値。加算行=壁セグメント / ded:true=開口控除は参考扱い） ----
function collectWidths(partName) {
  const add = [], ded = [];
  for (const room of truth.types.A.rooms) {
    for (const b of room.blocks) {
      if (b.kind !== 'faces' || strip(b.part) !== partName) continue;
      for (const face of Object.values(b.faces)) {
        for (const seg of face) {
          (seg.ded ? ded : add).push({ room: room.name, w_mm: Math.round(seg.w * 1000) });
        }
      }
    }
  }
  return { add, ded };
}

const wall = collectWidths(PART_WALL);
const sound = collectWidths(PART_SOUND);

// ---- 抽出側の照合集合（ページごと + 両ページ統合） ----
function pageSets(pn) {
  const p = extracted.extracted_pages[String(pn)];
  if (!p) return null;
  return {
    direct: new Set(p.dims.map((d) => d.value_mm)),
    sums: new Set(p.chain_run_sums),
  };
}
const pages = Object.keys(extracted.extracted_pages).map(Number).sort((a, b) => a - b);
const sets = Object.fromEntries(pages.map((pn) => [pn, pageSets(pn)]));
const union = {
  direct: new Set(pages.flatMap((pn) => [...sets[pn].direct])),
  sums: new Set(pages.flatMap((pn) => [...sets[pn].sums])),
};

// ---- 一致率測定（ユニークmm値ベース。見出し=直接一致・チェーン和込みは参考） ----
function measure(label, widths, s) {
  const uniq = [...new Set(widths.map((x) => x.w_mm))].sort((a, b) => a - b);
  const directHit = uniq.filter((v) => s.direct.has(v));
  const directMiss = uniq.filter((v) => !s.direct.has(v));
  const chainHit = uniq.filter((v) => s.direct.has(v) || s.sums.has(v));
  const miss = uniq.filter((v) => !s.direct.has(v) && !s.sums.has(v));
  const pct = (n) => (uniq.length ? ((100 * n) / uniq.length).toFixed(1) + '%' : '-');
  console.log(`  ${label}: ユニーク幅${uniq.length}種`
    + ` / 直接一致 ${directHit.length} (${pct(directHit.length)})`
    + ` / [参考]チェーン和込み ${chainHit.length} (${pct(chainHit.length)}・偽陽性を含む・下記対照参照)`);
  if (directMiss.length) console.log(`    直接未一致: [${directMiss.join(', ')}]`);
  if (miss.length) console.log(`    チェーン和でも未構成: [${miss.join(', ')}]`);
  return { uniq, directHit, chainHit, miss };
}

// ---- ベースレート対照: 50mm格子悉皆のカバー率 ----
// 建築寸法は50mm格子に乗ることが多く、照合集合が格子を飽和していると
// 「和込みヒット」は偶然でも当たる。正解幅の存在レンジ全体の50mm格子に対する
// カバー率＝当てずっぽうのヒット率（ベースレート）として併記する。
function gridCoverage(s, lo, hi) {
  let total = 0, inDirect = 0, inChain = 0;
  for (let v = lo; v <= hi; v += 50) {
    total++;
    if (s.direct.has(v)) inDirect++;
    if (s.direct.has(v) || s.sums.has(v)) inChain++;
  }
  const pct = (n) => ((100 * n) / total).toFixed(1) + '%';
  return { total, direct: pct(inDirect), chain: pct(inChain) };
}

console.log('=== 別府Aタイプ 壁PB・遮音PB セグメント幅のPDFテキスト層一致率 ===');
console.log('（見出し指標=直接一致。チェーン和込みは参考・偽陽性を含む）');
console.log(`正解: 壁PB加算行${wall.add.length}行(控除${wall.ded.length}行) / 遮音PB加算行${sound.add.length}行(控除${sound.ded.length}行)`);
for (const pn of pages) {
  console.log(`--- p${pn} 単独（寸法${sets[pn].direct.size}種・チェーン和${sets[pn].sums.size}種）`);
  measure(`壁PB(${PART_WALL})`, wall.add, sets[pn]);
  measure(`遮音PB(${PART_SOUND})`, sound.add, sets[pn]);
}
console.log(`--- p${pages.join('+p')} 統合（寸法${union.direct.size}種・チェーン和${union.sums.size}種）`);
const wu = measure(`壁PB(${PART_WALL})`, wall.add, union);
const su = measure(`遮音PB(${PART_SOUND})`, sound.add, union);
measure('壁PB+遮音PB 合算', [...wall.add, ...sound.add], union);
console.log('--- 参考: 控除行（開口幅）の統合一致率');
measure('壁PB控除行', wall.ded, union);
measure('遮音PB控除行', sound.ded, union);

// ---- ベースレート対照の出力（正解幅レンジの50mm格子悉皆） ----
const allTruth = [...wall.add, ...sound.add].map((x) => x.w_mm);
const lo = Math.min(...allTruth), hi = Math.max(...allTruth);
console.log(`--- ベースレート対照: 50mm格子悉皆カバー率（レンジ ${lo}〜${hi}mm）`);
for (const pn of pages) {
  const g = gridCoverage(sets[pn], lo, hi);
  console.log(`  p${pn}: 格子${g.total}点中 直接集合 ${g.direct} / チェーン和込み集合 ${g.chain}`);
}
const gu = gridCoverage(union, lo, hi);
console.log(`  統合: 格子${gu.total}点中 直接集合 ${gu.direct} / チェーン和込み集合 ${gu.chain}`);
console.log('  ※チェーン和込み集合の格子カバー率が実測ヒット率と同水準以上なら、その指標は偶然と区別できない');

// exit codeは常に0（目標値を設けない実測レポート。回帰ゲートではない）
console.log(`\n[実測サマリ] 統合の直接一致（見出し指標）: 壁PB ${wu.directHit.length}/${wu.uniq.length}`
  + ` / 遮音PB ${su.directHit.length}/${su.uniq.length}`
  + `（対照: 50mm格子ベースレート 直接${gu.direct}・和込み${gu.chain}）`);
