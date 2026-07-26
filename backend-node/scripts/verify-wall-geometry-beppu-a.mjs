// verify-wall-geometry-beppu-a.mjs — レバー1第5段: ベクターパス壁線幾何→内法スパンの一致率測定
//
// 役割: scripts/out-wall-geometry-beppu-a.json（pdf-wall-geometry.py抽出・正解JSON非参照）と
//   scripts/beppu-room-truth.json（XLS正解）を突合し、壁線幾何から計算した内法スパン集合が
//   正解の部屋別セグメント幅（壁（ボ－ド）+遮音壁ＰＢ張り＝第2-3段と同一の測定対象）を
//   ±10mm / ±25mm 許容でどれだけ当てるかを測定する。
//
// 【必須の対照（第2段reviewer must-fix承継）】全ての一致率に、同レンジ50mm格子の
//   同許容カバー率（=当てずっぽうのヒット率）を併記。実測ヒット率−格子カバー率＝シグナル強度。
//
// 答え合わせ回避の構造: 抽出側は正解JSONを読まない。本スクリプトは測定のみ
//   （エンジンsrc/非import・目標値なし・exit常に0）。バリアント（線幅・支持数閾値）は
//   事前定義の全組を報告する（一致率で1つを選んで他を隠すことはしない）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const geo = JSON.parse(readFileSync(join(HERE, 'out-wall-geometry-beppu-a.json'), 'utf-8'));
const truth = JSON.parse(readFileSync(join(HERE, 'beppu-room-truth.json'), 'utf-8'));

const strip = (s) => s.replace(/[\s　]/g, '');
const PART_WALL = '壁（ボ－ド）';   // 第2-3段と同一の測定対象（見出し継続性）
const PART_SOUND = '遮音壁ＰＢ張り';

// ---- 正解収集（部屋別セグメント幅・控除行除く） ----
function collectWidths(partName) {
  const out = [];
  for (const room of truth.types.A.rooms) {
    for (const b of room.blocks) {
      if (b.kind !== 'faces' || strip(b.part) !== partName) continue;
      for (const face of Object.values(b.faces)) {
        for (const seg of face) if (!seg.ded) out.push({ room: room.name, face: seg.face, mm: Math.round(seg.w * 1000) });
      }
    }
  }
  return out;
}
const wallSegs = collectWidths(PART_WALL);
const soundSegs = collectWidths(PART_SOUND);
const wallW = [...new Set(wallSegs.map((s) => s.mm))].sort((a, b) => a - b);
const soundW = [...new Set(soundSegs.map((s) => s.mm))].sort((a, b) => a - b);
const allW = [...new Set([...wallW, ...soundW])].sort((a, b) => a - b);
const LO = allW[0], HI = allW[allW.length - 1];

// ---- スパン集合の構築（バリアント×支持数閾値） ----
function spanSet(variant, minSupport) {
  const v = geo.variants[variant];
  const out = [];
  for (const key of ['spans_h_gap', 'spans_v_gap']) {
    for (const [mm, n] of Object.entries(v[key])) if (n >= minSupport) out.push(Number(mm));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
// tol許容の存在判定（ソート済み配列＋二分探索）
function makeHas(sorted) {
  return (v, tol) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v - tol) lo = m + 1; else hi = m; }
    return lo < sorted.length && sorted[lo] <= v + tol;
  };
}
function gridCoverage(has, tol) {
  let total = 0, hit = 0;
  for (let v = LO; v <= HI; v += 50) { total++; if (has(v, tol)) hit++; }
  return (100 * hit) / total;
}
const pct = (x) => x.toFixed(1) + '%';

console.log('=== レバー1第5段: ベクターパス壁線幾何→内法スパン（別府A p36・課金ゼロ） ===');
console.log(`スケール推定（抽出側報告）: mm/pt=${geo.scale.mm_per_pt} 縮尺≒1/${geo.scale.implied_scale_denominator}`
  + ` sd=${geo.scale.sd_pct}%（モード標本${geo.scale.n_mode}/${geo.scale.n_samples}）`);
console.log(`正解: 壁PB ${wallW.length}種(${wallSegs.length}セグ) / 遮音PB ${soundW.length}種(${soundSegs.length}セグ)`
  + ` / 合算${allW.length}種 レンジ${LO}〜${HI}mm 格子${Math.floor((HI - LO) / 50) + 1}点`);
console.log('※シグナル=合算ヒット率−格子カバー率。第2段テキスト直接一致の基準線は+25.3pt（許容±0=完全一致時）');

const results = [];
for (const variant of Object.keys(geo.variants)) {
  const v = geo.variants[variant];
  console.log(`\n--- バリアント[${variant}]（線幅>=${v.stroke_width_min}）: 壁面H=${v.wall_faces.H}/V=${v.wall_faces.V}`
    + ` ペアH=${v.wall_pairs.H}/V=${v.wall_pairs.V}`);
  const th = Object.entries(v.thickness_hist_5mm).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`  壁厚クラスタ上位: ${th.map(([k, n]) => `${k}mm×${n}`).join(' ')}`);
  for (const minSup of [1, 3]) {
    const spans = spanSet(variant, minSup);
    const has = makeHas(spans);
    for (const tol of [10, 25]) {
      const hitW = wallW.filter((x) => has(x, tol));
      const hitS = soundW.filter((x) => has(x, tol));
      const hitA = allW.filter((x) => has(x, tol));
      const cov = gridCoverage(has, tol);
      const margin = (100 * hitA.length) / allW.length - cov;
      console.log(`  支持>=${minSup} ±${tol}mm: スパン${spans.length}種`
        + ` | 壁PB ${hitW.length}/${wallW.length}(${pct((100 * hitW.length) / wallW.length)})`
        + ` 遮音PB ${hitS.length}/${soundW.length}(${pct((100 * hitS.length) / soundW.length)})`
        + ` 合算 ${hitA.length}/${allW.length}(${pct((100 * hitA.length) / allW.length)})`
        + ` | 対照格子 ${pct(cov)} | シグナル ${margin >= 0 ? '+' : ''}${margin.toFixed(1)}pt`);
      results.push({ variant, minSup, tol, hit: hitA.length, cov, margin, spans, has });
    }
  }
}

// ---- 未一致の内訳（全バリアント共通で外している幅＝図形から原理的に取れていない候補） ----
console.log('\n--- 未一致の内訳（±25mm・各バリアント）');
for (const r of results.filter((x) => x.tol === 25)) {
  const miss = allW.filter((x) => !r.has(x, 25));
  console.log(`  [${r.variant} 支持>=${r.minSup}] 未一致${miss.length}: [${miss.join(', ')}]`);
}
const missAll = allW.filter((x) => results.filter((r) => r.tol === 25).every((r) => !r.has(x, 25)));
console.log(`  全バリアント共通未一致(±25): [${missAll.join(', ')}]`);
const segOf = (mm) => [...wallSegs, ...soundSegs].filter((s) => s.mm === mm)
  .map((s) => `${strip(s.room)}${s.face}`).join('/');
for (const m of missAll) console.log(`    ${m}mm = ${segOf(m)}`);

// ---- サマリ ----
console.log('\n[実測サマリ]');
for (const r of results) {
  console.log(`  ${r.variant}/支持>=${r.minSup}/±${r.tol}mm: 合算${r.hit}/${allW.length}`
    + ` シグナル${r.margin >= 0 ? '+' : ''}${r.margin.toFixed(1)}pt`);
}
// exit codeは常に0（目標値を設けない実測レポート。回帰ゲートではない）
