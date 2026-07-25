/**
 * 別府限定・打放し既定への切替（2026-07-25）のユニット検証
 *
 * 対象: buildupCalculator.js computeElevationTakeoff の isBeppuLayout ゲート＋
 *   「打放し記号(C下地)を読めた部屋の割付漏れ面を既定G14ではなく打放し(PBなし)へ倒す」ロジック。
 *
 * 主眼: **アルファ非回帰**（別府マーカー=遮/G枠 が無い図面では一切発火しない）と
 *   **別府で打放し面が壁PBに載らない**ことの両立を、記号だけを変えた対のfixtureで固定する。
 *
 * 実行: node scripts/test-beppu-blank-default.mjs
 */
import { computeElevationTakeoff } from '../src/services/buildupCalculator.js';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`✗ ${label}\n    expected: ${e}\n    actual:   ${a}`); }
}
function approx(label, actual, expected, tol = 1e-6) {
  if (Math.abs(actual - expected) <= tol) { pass++; console.log(`✅ ${label} (${actual.toFixed(3)})`); }
  else { fail++; console.log(`✗ ${label}\n    expected: ${expected}\n    actual:   ${actual}`); }
}

// 面幅・下地高を固定した1部屋（下地高2.72=別府一般部相当・展開図に高さ実測が無いので
// CH+40mm=2.44で面積を拾う。この検証は「どの面が壁PBに載るか」を見るので高さ絶対値は問わない）。
// 部屋: 4面（A/C=長辺2000, B/D=短辺1000）。plan_placements は C04@2000 を1件だけ持つ
//   → A面 or C面のどちらか1面がC04(打放し)にマッチ。残る等幅面（もう片方の2000）と短辺2面が
//     割付漏れ＝既定判定に回る。
function room(extraCodes = []) {
  return { rooms: [{
    name: '洋室3', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2000, openings: [] },
      { face: 'B', width_mm: 1000, openings: [] },
      { face: 'C', width_mm: 2000, openings: [] },
      { face: 'D', width_mm: 1000, openings: [] },
    ],
    plan_codes: ['A', 'C04', ...extraCodes],
    plan_placements: [{ code: 'C04', wall_length_mm: 2000 }],
  }] };
}

const H = 2.44; // (2400+40)/1000

// ── 1) アルファ図面（別府マーカー無し）: 従来どおり割付漏れ面は既定G14＝全面PB ──
// C04@2000は1面(2000)へ割付され打放し=PB除外。残り3面（もう片方2000 + 1000×2）は既定G14。
//   wall_pb = (2.0 + 1.0 + 1.0) × 2.44 = 4.0×2.44 = 9.76
{
  const t = computeElevationTakeoff(room(), []);
  approx('アルファ（遮/G枠なし）: 割付漏れ面は既定G14のまま（壁PB 9.76）', t.wall_pb_sqm, 4.0 * H);
}

// ── 2) 別府図面（別のダミー部屋に遮/G枠が存在）: 打放しを読めた部屋の割付漏れ面は打放しへ ──
// 同じ洋室3に加えて、遮/G枠を持つ戸境部屋を1つ足すと isBeppuLayout=true。
//   洋室3のC04@2000が1面へ割付。残る等幅2000面と短辺1000×2は plan_codes に C04 があるため
//   既定が「打放し(PBなし)」に切替 → これら3面は壁PBに載らない ＝ 洋室3の壁PB寄与は0。
//   戸境部屋（遮@3000）を C-code の無い最小構成（面は遮1面のみ）にして、洋室3の効果だけを見る。
//     遮@3000は遮音壁PB側で計上され壁PB本体には載らない → 全体 wall_pb = 0。
{
  const elevations = { rooms: [
    room().rooms[0],
    { name: 'LDK', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3000, wall_code: '遮', openings: [] },
    ], plan_codes: ['遮'], plan_placements: [{ code: '遮', wall_length_mm: 3000 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  approx('別府（遮あり）: 打放しを読めた部屋の割付漏れ面は打放し＝壁PBは0', t.wall_pb_sqm, 0);
  // 遮音壁PBは戸境セグメントで計上される（ゼロでない）＝ゲートが遮音側を殺していない確認
  if (t.sound_wall_pb_sqm > 0) { pass++; console.log('✅ 別府: 遮音壁PBは別途計上される（>0）'); }
  else { fail++; console.log('✗ 別府: 遮音壁PBが0になっている（遮のセグメント計上が壊れた）'); }
}

// ── 3) 別府図面だが「打放し記号を1つも読めていない部屋」: 既定G14を維持（過少に倒さない）──
// plan_codes に C04 を含めない（A のみ）→ 割付漏れ面は従来どおり全面PB。
//   C04@2000マッチ面は無い（placementもAのみ）ので4面すべて既定G14 → wall_pb = 6.0×2.44。
{
  const elevations = { rooms: [
    { name: '洗面室', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2000, openings: [] },
      { face: 'B', width_mm: 1000, openings: [] },
      { face: 'C', width_mm: 2000, openings: [] },
      { face: 'D', width_mm: 1000, openings: [] },
    ], plan_codes: ['A'], plan_placements: [{ code: 'A', wall_length_mm: 9999 }] },
    { name: 'LDK', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3000, wall_code: 'G枠', openings: [] },
    ], plan_codes: ['G枠'], plan_placements: [{ code: 'G枠', wall_length_mm: 3000 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  approx('別府だが打放し未読の部屋は既定G14を維持（壁PB 6.0×2.44=14.64）', t.wall_pb_sqm, 6.0 * H);
}

// ── 4) 面に明示記号がある面は既定切替の影響を受けない（打放しを全面に塗らない）──
// 洋室3のB面(1000)に A（=G14相当PB）を明示 → その面はPBのまま。残りは打放し既定。
//   wall_pb = B面のみ = 1.0×2.44 = 2.44
{
  const elevations = { rooms: [
    { name: '洋室3', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2000, openings: [] },
      { face: 'B', width_mm: 1000, wall_code: 'A', openings: [] },
      { face: 'C', width_mm: 2000, openings: [] },
      { face: 'D', width_mm: 1000, openings: [] },
    ], plan_codes: ['A', 'C04'], plan_placements: [{ code: 'C04', wall_length_mm: 2000 }] },
    { name: 'LDK', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3000, wall_code: '遮', openings: [] },
    ], plan_codes: ['遮'], plan_placements: [{ code: '遮', wall_length_mm: 3000 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  approx('別府: 明示記号(A=PB)の面は打放し既定に飲まれずPBのまま（壁PB 2.44）', t.wall_pb_sqm, 1.0 * H);
}

// ── 5) planCodes単一の標準PB部屋（roomDefaultCode確定）は打放しへ倒さない ──
// plan_codes=['A'] のみ（C04なし）で全面がroomDefaultCode=A(PB)。別府マーカーがあっても
//   「PBと明示読取された部屋」を打放しに落とさない（安全側）。wall_pb = 6.0×2.44。
{
  const elevations = { rooms: [
    { name: '洋室2', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2000, openings: [] },
      { face: 'B', width_mm: 1000, openings: [] },
      { face: 'C', width_mm: 2000, openings: [] },
      { face: 'D', width_mm: 1000, openings: [] },
    ], plan_codes: ['A'], plan_placements: [] },
    { name: 'LDK', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3000, wall_code: '遮', openings: [] },
    ], plan_codes: ['遮'], plan_placements: [{ code: '遮', wall_length_mm: 3000 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  approx('別府: planCodes単一PBの部屋は打放しに落とさずroomDefault=PBを維持（壁PB 14.64）',
    t.wall_pb_sqm, 6.0 * H);
}

console.log(`\n結果: ✅${pass} / ✗${fail}`);
process.exit(fail > 0 ? 1 : 0);
