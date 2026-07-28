// verify-room-attribution-beppu-a.mjs — レバー1第8段: 壁線幾何スパンの部屋帰属の一致率測定
//
// 役割: scripts/out-room-attribution-beppu-a.json（pdf-room-attribution.py抽出・正解JSON非参照）と
//   scripts/beppu-room-truth.json（XLS正解）を突合し、
//   (a) 部屋帰属つき候補集合が正解の部屋別セグメント幅（±10mm）をどれだけ当てるか
//       （部屋帰属なし=グローバル集合の上限と分離して「帰属で失う分」「候補が絞れる分」を測定）
//   (b) 遮音壁セグメント（玄関/洋1/洋2/洋3/台所）の個別帰属の成否
//   (c) 7350（LDK長辺・第5段全バリアント共通未一致）の合成再構成の成否
//   を、部屋別ベースレート対照（50mm格子カバー率）つきで報告する。
//
// 答え合わせ回避の構造: 抽出側は正解JSONを読まない。本スクリプトは測定のみ
//   （エンジンsrc非import・目標値なし・exit常に0）。バリアント×支持数×許容の全組を報告する。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const attr = JSON.parse(readFileSync(join(HERE, 'out-room-attribution-beppu-a.json'), 'utf-8'));
const truth = JSON.parse(readFileSync(join(HERE, 'beppu-room-truth.json'), 'utf-8'));

const strip = (s) => s.replace(/[\s　]/g, '');
// 第2〜5段と同一の測定対象部位（見出し継続性）
const PART_WALL = '壁（ボ－ド）';
const PART_SOUND = '遮音壁ＰＢ張り';
// 補足測定（水回り）: 便所・洗面所の壁は正解側で別部位名
const PART_WALL_HW = '壁（ﾎﾞ-ﾄﾞ）';
const PART_SOUND_WET = '遮音壁耐水ＰＢ張';

// 図面ラベル → 正解部屋の対応（diag-beppu-rooms.mjsと同じ仮定: LDK→台所・玄関/廊下→玄関）
const ROOM_MAP = {
  '玄関': ['玄関', '廊下'],
  '洋室(１)': ['洋室1'],
  '洋室(2)': ['洋室2'],
  '洋室(3)': ['洋室3'],
  '台所': ['LDK'],
  '便所': ['トイレ'],
  '洗面所': ['洗面'],
};

// ---- 正解収集（部屋別・控除行除く） ----
function collectRoomSegs(parts) {
  const map = new Map(); // truthRoom -> [{face, mm, part}]
  for (const room of truth.types.A.rooms) {
    const name = strip(room.name);
    for (const b of room.blocks) {
      if (b.kind !== 'faces' || !parts.includes(strip(b.part))) continue;
      for (const face of Object.values(b.faces)) {
        for (const seg of face) {
          if (seg.ded) continue;
          if (!map.has(name)) map.set(name, []);
          map.get(name).push({ face: seg.face, mm: Math.round(seg.w * 1000), part: strip(b.part) });
        }
      }
    }
  }
  return map;
}
const mainSegs = collectRoomSegs([PART_WALL, PART_SOUND]);   // 主測定（第5段スコープ）
const wetSegs = collectRoomSegs([PART_WALL_HW, PART_SOUND_WET]); // 補足（水回り）

// グローバル正解レンジ（第5段と同一の格子対照レンジ）
const allW = [...new Set([...mainSegs.values()].flat().map((s) => s.mm))].sort((a, b) => a - b);
const LO = allW[0], HI = allW[allW.length - 1];

const pct = (x) => (Number.isFinite(x) ? x.toFixed(1) + '%' : 'n/a');
function makeHas(sortedArr) {
  return (v, tol) => {
    let lo = 0, hi = sortedArr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sortedArr[m] < v - tol) lo = m + 1; else hi = m; }
    return lo < sortedArr.length && sortedArr[lo] <= v + tol;
  };
}
function gridCoverage(has, tol) {
  let total = 0, hit = 0;
  for (let v = LO; v <= HI; v += 50) { total++; if (has(v, tol)) hit++; }
  return (100 * hit) / total;
}

// 候補集合の取り出し
function candSet(variant, geoRooms, kind, minSup) {
  const v = attr.variants[variant];
  const out = new Set();
  for (const g of geoRooms) {
    const r = v.rooms[g];
    if (!r || !r.candidates) continue;
    const bucket = r.candidates[kind];
    for (const [mm, val] of Object.entries(bucket)) {
      const n = kind === 'direct' ? val : val.n;
      if (n >= minSup) out.add(Number(mm));
    }
  }
  return [...out].sort((a, b) => a - b);
}
function globalSet(variant, kind, minSup) {
  const v = attr.variants[variant];
  return Object.entries(kind === 'direct' ? v.global_direct : v.global_composed)
    .filter(([, n]) => n >= minSup).map(([mm]) => Number(mm)).sort((a, b) => a - b);
}

console.log('=== レバー1第8段: 壁線幾何スパンの部屋帰属（別府A p36・課金ゼロ・測定のみ） ===');
console.log(`スケール（抽出側報告）: mm/pt=${attr.scale.mm_per_pt} 縮尺≒1/${attr.scale.implied_scale_denominator}`);
console.log(`正解（主測定=第5段スコープ）: ${[...mainSegs.entries()].map(([r, s]) => `${r}${s.length}セグ`).join(' ')}`
  + ` / 幅レンジ${LO}〜${HI}mm 格子${Math.floor((HI - LO) / 50) + 1}点`);
console.log('※第5段基準線（帰属なし・all/支持>=3/±10mm）: 合算84.6% vs 格子対照38.7%（+45.9pt）・遮音9/9=100%');

// ---- 距離ベースの帰属可能性上限（手法非依存の物理上限） ----
// 「正解幅±tolのインスタンスが、当該部屋ラベルからどの距離に実在するか」。
// どんな帰属手法（矩形・フラッドフィル・多角形）でも、部屋の中/近傍に値が実在しなければ当てられない。
const MM_PER_PT = attr.scale.mm_per_pt;
function pointRectDistMm(cx, cy, x0, x1, y0, y1) {
  const dx = Math.max(0, x0 - cx, cx - x1);
  const dy = Math.max(0, y0 - cy, cy - y1);
  return Math.hypot(dx, dy) * MM_PER_PT;
}
function minDistToValue(variant, geoRooms, mm, tol, family) {
  const v = attr.variants[variant];
  let best = Infinity;
  const pts = geoRooms.map((g) => v.rooms[g]?.label).filter(Boolean);
  if (!pts.length) return Infinity;
  const consider = (x0, x1, y0, y1) => {
    for (const p of pts) best = Math.min(best, pointRectDistMm(p.cx, p.cy, x0, x1, y0, y1));
  };
  if (family === 'gap') {
    for (const i of v.instances.H) if (Math.abs(i.mm - mm) <= tol) consider(i.run0, i.run1, i.cLo, i.cHi);
    for (const i of v.instances.V) if (Math.abs(i.mm - mm) <= tol) consider(i.cLo, i.cHi, i.run0, i.run1);
  } else if (family === 'composed') {
    for (const i of v.instances.composed_H) if (Math.abs(i.mm - mm) <= tol) consider(i.run0, i.run1, i.cLo, i.cHi);
    for (const i of v.instances.composed_V) if (Math.abs(i.mm - mm) <= tol) consider(i.cLo, i.cHi, i.run0, i.run1);
  } else {
    for (const f of v.face_runs.H) if (Math.abs(f.mm - mm) <= tol) consider(f.a0, f.a1, f.coord, f.coord);
    for (const f of v.face_runs.V) if (Math.abs(f.mm - mm) <= tol) consider(f.coord, f.coord, f.a0, f.a1);
  }
  return best;
}

for (const variant of Object.keys(attr.variants)) {
  const v = attr.variants[variant];
  console.log(`\n===== バリアント[${variant}]（線幅>=${v.stroke_width_min}） =====`);
  // ---- (0) グローバル値レベル（第5段互換・テキスト枠ノイズ除去後） ----
  {
    const uniq = [...new Set([...mainSegs.values()].flat().map((s) => s.mm))].sort((a, b) => a - b);
    for (const minSup of [1, 3]) {
      const g = globalSet(variant, 'direct', minSup);
      const has = makeHas(g);
      const hit = uniq.filter((w) => has(w, 10));
      const cov = gridCoverage(has, 10);
      console.log(`  [値レベル対照] 支持>=${minSup} ±10mm: 正解${uniq.length}種中${hit.length}種 (${pct((100 * hit.length) / uniq.length)})`
        + ` 格子${pct(cov)} 未一致=[${uniq.filter((w) => !has(w, 10)).join(',')}]`
        + ` ※第5段（ノイズ除去前）は22/26=84.6%`);
    }
  }
  console.log(`壁面H=${v.wall_faces.H}/V=${v.wall_faces.V} スパンinst H=${v.span_instances.H}/V=${v.span_instances.V}`
    + ` 合成inst H=${v.composed_instances.H}/V=${v.composed_instances.V}`);
  // 部屋矩形の概況
  for (const [tRoom, geoRooms] of Object.entries(ROOM_MAP)) {
    const rects = geoRooms.map((g) => {
      const r = v.rooms[g];
      if (!r) return `${g}=ラベルなし`;
      if (!r.rect) return `${g}=矩形不成立`;
      return `${g}=${r.rect.w_mm}×${r.rect.h_mm}mm`;
    });
    console.log(`  矩形 ${tRoom}: ${rects.join(' / ')}`);
  }

  for (const minSup of [1, 3]) {
    for (const tol of [10, 25]) {
      console.log(`\n--- 支持>=${minSup} ±${tol}mm`);
      let sumHitA = 0, sumHitG = 0, sumHitAC = 0, sumN = 0;
      console.log('  部屋            | 正解幅  | 帰属ヒット      | +合成       | 帰属なし上限   | 候補数(帰属/全) | 部屋別対照格子(帰属)');
      for (const [tRoom, geoRooms] of Object.entries(ROOM_MAP)) {
        if (!mainSegs.has(tRoom)) continue; // 主測定は第5段スコープの部屋のみ
        const widths = [...new Set(mainSegs.get(tRoom).map((s) => s.mm))].sort((a, b) => a - b);
        const cA = candSet(variant, geoRooms, 'direct', minSup);
        const cC = candSet(variant, geoRooms, 'composed', minSup);
        const cG = globalSet(variant, 'direct', minSup);
        const hasA = makeHas(cA), hasG = makeHas(cG);
        const hasAC = makeHas([...new Set([...cA, ...cC])].sort((a, b) => a - b));
        const hitA = widths.filter((w) => hasA(w, tol));
        const hitAC = widths.filter((w) => hasAC(w, tol));
        const hitG = widths.filter((w) => hasG(w, tol));
        sumHitA += hitA.length; sumHitAC += hitAC.length; sumHitG += hitG.length; sumN += widths.length;
        const cov = gridCoverage(hasA, tol);
        console.log(`  ${tRoom.padEnd(8, '　')} | ${String(widths.length).padStart(2)}種   |`
          + ` ${String(hitA.length).padStart(2)}/${widths.length} (${pct((100 * hitA.length) / widths.length).padStart(6)}) |`
          + ` ${String(hitAC.length).padStart(2)}/${widths.length}       |`
          + ` ${String(hitG.length).padStart(2)}/${widths.length} (${pct((100 * hitG.length) / widths.length).padStart(6)}) |`
          + ` ${String(cA.length).padStart(3)}/${String(cG.length).padStart(3)}        | ${pct(cov)}`);
        if (hitG.length > hitA.length) {
          const lost = widths.filter((w) => hasG(w, tol) && !hasA(w, tol));
          console.log(`      └ 帰属で失った幅: [${lost.join(', ')}]`);
        }
      }
      const gHas = makeHas(globalSet(variant, 'direct', minSup));
      const gCov = gridCoverage(gHas, tol);
      console.log(`  [計] 帰属 ${sumHitA}/${sumN} (${pct((100 * sumHitA) / sumN)})`
        + ` / +合成 ${sumHitAC}/${sumN} (${pct((100 * sumHitAC) / sumN)})`
        + ` / 帰属なし上限 ${sumHitG}/${sumN} (${pct((100 * sumHitG) / sumN)})`
        + ` / 全体対照格子(帰属なし) ${pct(gCov)}`);
    }
  }

  // ---- (b) 遮音壁セグメントの個別表（支持>=3・±10mm 基準） ----
  console.log('\n--- (b) 遮音壁セグメント個別（±10mm・支持>=1/>=3の両方）');
  for (const [tRoom, geoRooms] of Object.entries(ROOM_MAP)) {
    if (!mainSegs.has(tRoom)) continue;
    const sounds = mainSegs.get(tRoom).filter((s) => s.part === strip(PART_SOUND));
    if (!sounds.length) continue;
    for (const s of sounds) {
      const line = [1, 3].map((minSup) => {
        const hasA = makeHas(candSet(variant, geoRooms, 'direct', minSup));
        const hasG = makeHas(globalSet(variant, 'direct', minSup));
        return `支持>=${minSup}: 帰属${hasA(s.mm, 10) ? '✅' : '✗'} 全体${hasG(s.mm, 10) ? '✅' : '✗'}`;
      }).join(' | ');
      console.log(`  ${tRoom} ${s.face}面 ${String(s.mm).padStart(4)}mm: ${line}`);
    }
  }

  // ---- 補足: 水回り（便所・洗面所=遮音壁耐水ＰＢ張+壁ﾎﾞ-ﾄﾞ。第5段スコープ外の追加情報） ----
  console.log('\n--- 補足: 水回り部屋の帰属（第5段スコープ外・±10mm）');
  for (const [tRoom, geoRooms] of Object.entries(ROOM_MAP)) {
    if (!wetSegs.has(tRoom)) continue;
    const widths = [...new Set(wetSegs.get(tRoom).map((s) => s.mm))].sort((a, b) => a - b);
    for (const minSup of [1, 3]) {
      const hasA = makeHas(candSet(variant, geoRooms, 'direct', minSup));
      const hit = widths.filter((w) => hasA(w, 10));
      console.log(`  ${tRoom} 支持>=${minSup}: ${hit.length}/${widths.length} [${widths.map((w) => (hasA(w, 10) ? w + '✅' : w + '✗')).join(' ')}]`);
    }
  }

  // ---- (d) 距離ベース上限: 正解幅インスタンスは部屋ラベルからどこにあるか ----
  console.log('\n--- (d) 帰属可能性の物理上限（正解幅±10mmインスタンスの部屋ラベルからの最短距離・支持数不問）');
  console.log('  距離0=ラベルを含む / ≤1500mm=部屋内相当 / ≤3000mm=部屋半径相当 / それ以上=部屋外＝どんな帰属手法でも当てられない');
  const buckets = { 'd=0': 0, '≤1500': 0, '≤3000': 0, '>3000': 0, 'なし': 0 };
  const bucketsF = { 'd=0': 0, '≤1500': 0, '≤3000': 0, '>3000': 0, 'なし': 0 };
  let totalWidths = 0;
  for (const [tRoom, geoRooms] of Object.entries(ROOM_MAP)) {
    if (!mainSegs.has(tRoom)) continue;
    const widths = [...new Set(mainSegs.get(tRoom).map((s) => s.mm))].sort((a, b) => a - b);
    const rows = widths.map((w) => {
      const dG = minDistToValue(variant, geoRooms, w, 10, 'gap');
      const dC = minDistToValue(variant, geoRooms, w, 10, 'composed');
      const dF = minDistToValue(variant, geoRooms, w, 10, 'face');
      totalWidths++;
      const b = (d) => (d === Infinity ? 'なし' : d === 0 ? 'd=0' : d <= 1500 ? '≤1500' : d <= 3000 ? '≤3000' : '>3000');
      buckets[b(Math.min(dG, dC))]++;
      bucketsF[b(dF)]++;
      const fmt = (d) => (d === Infinity ? '--' : d.toFixed(0));
      return `${w}(gap${fmt(dG)}/合成${fmt(dC)}/面長${fmt(dF)})`;
    });
    console.log(`  ${tRoom}: ${rows.join(' ')}`);
  }
  console.log(`  [集計${totalWidths}幅] ギャップ族(合成込み): ` + Object.entries(buckets).map(([k, n]) => `${k}=${n}`).join(' ')
    + ` / 面長族: ` + Object.entries(bucketsF).map(([k, n]) => `${k}=${n}`).join(' '));

  // ---- (c) 7350の合成再構成 ----
  console.log('\n--- (c) 7350再構成（LDK長辺・第5段全バリアント共通未一致）');
  for (const minSup of [1, 3]) {
    const ldkC = candSet(variant, ROOM_MAP['台所'], 'composed', minSup);
    const ldkA = candSet(variant, ROOM_MAP['台所'], 'direct', minSup);
    const gC = globalSet(variant, 'composed', minSup);
    const near = (arr) => arr.filter((x) => Math.abs(x - 7350) <= 25);
    console.log(`  支持>=${minSup}: LDK直接近傍(±25)=[${near(ldkA).join(',') || 'なし'}]`
      + ` LDK合成近傍=[${near(ldkC).join(',') || 'なし'}] 全体合成近傍=[${near(gC).join(',') || 'なし'}]`);
    // 合成の膨張対照: 直接のみ vs 直接+合成 の格子カバー率（LDK帰属集合）
    const hasD = makeHas(ldkA);
    const hasDC = makeHas([...new Set([...ldkA, ...ldkC])].sort((a, b) => a - b));
    console.log(`    LDK候補: 直接${ldkA.length}種(格子${pct(gridCoverage(hasD, 10))}) → +合成${ldkC.length}種で計`
      + `${new Set([...ldkA, ...ldkC]).size}種(格子${pct(gridCoverage(hasDC, 10))})＝膨張分がベースレート上昇`);
  }
}
// exit codeは常に0（目標値を設けない実測レポート。回帰ゲートではない）
