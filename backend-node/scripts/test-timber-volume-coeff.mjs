/**
 * 間仕切下地(木)・天井下地の材積係数のXLS整合ユニット検証（2026-07-25・案B）
 *
 * 【是正の背景 — 材長×断面モデルからXLS材積係数(m³/㎡)直接へ】
 *   旧実装は「拾い面積 → 幾何モデルの材長(m/㎡) → 断面(m²) → 材積」で材積を出しており、
 *   実効係数が XLS集計表 X列とズレていた（check-engine-constants の指摘2件）:
 *     間仕切下地: MAJIKIRI_TIMBER_M_PER_SQM(8.8889) × 断面0.00135㎡ = 0.0120 m³/㎡ … XLS X52=0.0116 に対し +3.4%
 *     天井下地:   CEILING_FRAME_M_PER_SQM(7.0475) × 断面0.0012㎡  = 0.008457 m³/㎡ … XLS X78=0.0081 に対し +4.4%
 *   → XLS原典は Y{=W×X}＝「拾い面積 × 材積係数」で材積を直接算出（材長を経由しない）。
 *     木胴縁 DOBUCHI_M3_PER_SQM=0.0098 と同じ「拾い面積×材積係数」方式に統一した。
 *
 * 【相殺の警告（間仕切・木胴縁と同型）— このテストが固定する核心】
 *   間仕切下地の拾い面積は展開図実測で -7.8%（洗面UB囲い壁等が展開図外の構造差）。
 *   旧実効係数 +3.4% と拾い過少 -7.8% が相殺し、適用後材積は見かけ -4.7% に釣り合っていた。
 *   **材積係数だけ0.0116へ直すと相殺が外れ、適用後材積は拾い残差 -7.8% が素で出る**。
 *   ここでは「係数だけ直すと適用後が -7.8% になる（相殺が外れる）」ことと
 *   「拾いも係数もXLS準拠なら ±0%」を固定し、片方だけの修正・材長モデルへの逆戻りを検出する。
 *
 * 【XLS原典（②G.XLS 集計表・G単体）】
 *   間仕切木軸: C52=84.082㎡ × X52=0.0116 = 0.975351 m³/戸（Y52{=W52*X52}÷9戸）
 *   天井下地:   C77=59.0874㎡ × X78=0.0081 = 0.478608 m³/戸（Y77{=W77*X78}÷9戸）
 *
 * 実行: node scripts/test-timber-volume-coeff.mjs
 */
import {
  MAJIKIRI_M3_PER_SQM, majikiriVolumeM3, MAJIKIRI_TIMBER_M_PER_SQM,
  CEILING_M3_PER_SQM, ceilingFrameVolumeM3, CEILING_FRAME_M_PER_SQM,
  TIMBER_SECTIONS,
} from '../src/services/timberVolume.js';
import {
  computeElevationTakeoff, applyElevationTakeoff,
} from '../src/services/buildupCalculator.js';
import { calculateMaterials } from '../src/services/materialCalculator.js';
// Gタイプのフィクスチャはevalスクリプトがexportしているものを流用（原典と同一の入力を保証）
import { G_ELEVATIONS, G_FLOOR_PLAN, G_CLOSET_INTERIORS } from './eval-gtype-buildup.mjs';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`✗ ${label}\n    expected: ${e}\n    actual:   ${a}`); }
}
function near(label, actual, expected, tol) {
  if (Number.isFinite(actual) && Math.abs(actual - expected) <= tol) {
    pass++; console.log(`✅ ${label} (${actual})`);
  } else {
    fail++; console.log(`✗ ${label}\n    expected: ${expected}±${tol}\n    actual:   ${actual}`);
  }
}

// ---- XLS原典の値（二度と手打ちしないよう1箇所に）----
const XLS_MAJIKIRI_SQM = 84.082;          // 集計表 C52（間仕切下地の拾い面積・㎡/戸）
const XLS_MAJIKIRI_M3_PER_UNIT = 84.082 * 0.0116; // = 0.975351（Y52÷9戸）
const XLS_CEILING_SQM = 59.0874;          // 集計表 C77（天井面積・㎡/戸）
const XLS_CEILING_M3_PER_UNIT = 59.0874 * 0.0081; // = 0.478608（Y77÷9戸）
const MEISAI_MAJIKIRI = 77.3 / 67;        // 見積明細 間仕切木軸 77.3m³/67戸 = 1.1537（A〜H平均）
const MEISAI_CEILING = 38.5 / 67;         // 見積明細 天井下地 38.5m³/67戸 = 0.5746（A〜H平均）

console.log('--- ① 材積係数はXLS X列と一致（材長×断面ではなく係数直接）---');
check('MAJIKIRI_M3_PER_SQM は XLS集計表X52 = 0.0116', MAJIKIRI_M3_PER_SQM, 0.0116);
check('CEILING_M3_PER_SQM は XLS集計表X78 = 0.0081', CEILING_M3_PER_SQM, 0.0081);
near('間仕切: 84.082㎡ × 0.0116 = XLS Y52÷9戸', majikiriVolumeM3(XLS_MAJIKIRI_SQM), XLS_MAJIKIRI_M3_PER_UNIT, 0.0001);
near('天井:   59.0874㎡ × 0.0081 = XLS Y77÷9戸', ceilingFrameVolumeM3(XLS_CEILING_SQM), XLS_CEILING_M3_PER_UNIT, 0.0001);

console.log('\n--- ② 旧材長モデルの実効係数がXLSからズレていたことの固定（逆戻り検出）---');
{
  // 旧: 材長(m/㎡) × 断面(m²) の実効係数
  const OLD_MAJIKIRI_COEF = MAJIKIRI_TIMBER_M_PER_SQM * TIMBER_SECTIONS.majikiri.h * TIMBER_SECTIONS.majikiri.d * 1e-6;
  const OLD_CEILING_COEF = CEILING_FRAME_M_PER_SQM * TIMBER_SECTIONS.ceiling.h * TIMBER_SECTIONS.ceiling.d * 1e-6;
  near('旧間仕切実効係数 = 0.0120（材長8.89×断面0.00135）', OLD_MAJIKIRI_COEF, 0.012, 1e-4);
  near('旧天井実効係数 = 0.008457（材長7.05×断面0.0012）', OLD_CEILING_COEF, 0.008457, 1e-5);
  // 旧実効係数はXLSに対し +3.4%/+4.4% ズレていた（診断が指摘していた値）
  near('旧間仕切実効係数はXLS 0.0116の+3.4%', OLD_MAJIKIRI_COEF / 0.0116 - 1, 0.034, 0.005);
  near('旧天井実効係数はXLS 0.0081の+4.4%', OLD_CEILING_COEF / 0.0081 - 1, 0.044, 0.005);
  // 材長モデルへ逆戻りしたら係数が0.0116/0.0081と一致しなくなる＝ここで検出
  if (Math.abs(OLD_MAJIKIRI_COEF - MAJIKIRI_M3_PER_SQM) > 1e-4) {
    pass++; console.log('✅ 現行係数は旧材長モデルの実効係数と別物（材長モデルへ戻していない）');
  } else {
    fail++; console.log('✗ 現行係数が旧材長モデルの実効係数に戻っている');
  }
}

console.log('\n--- ③ 【回帰の要・間仕切】係数と拾いのセット修正（相殺が外れる方向を固定）---');
{
  // 展開図実測の拾い面積（Gタイプ）は -7.8% 過少（洗面UB囲い壁等が展開図外）
  const takeoff = computeElevationTakeoff(G_ELEVATIONS, [],
    { planRooms: G_FLOOR_PLAN.rooms, closetInteriors: G_CLOSET_INTERIORS });
  const pickup = takeoff.majikiri_shitaji_m; // 実測拾い量（≒77.5・-7.8%）
  near('展開図実測の拾い量はXLS 84.082の-7.8%', pickup / XLS_MAJIKIRI_SQM - 1, -0.078, 0.02);

  // (a) 拾いも係数もXLS準拠（推定パス）→ ±0%
  near('推定パス（拾い84.082×0.0116）はXLS原典と±0%',
    majikiriVolumeM3(XLS_MAJIKIRI_SQM) / XLS_MAJIKIRI_M3_PER_UNIT - 1, 0, 0.001);

  // (b) 係数だけ直して実測拾いを使う（適用後）→ 拾い残差 -7.8% が素で出る（相殺が外れる）
  const appliedVol = majikiriVolumeM3(pickup);
  const appliedDiff = appliedVol / XLS_MAJIKIRI_M3_PER_UNIT - 1;
  near('適用後（実測拾い×0.0116）はXLS原典の-7.8%（相殺が外れた素の拾い残差）', appliedDiff, -0.078, 0.02);
  // 材長×断面の旧モデルなら適用後は見かけ-4.7%（+3.4%が拾い-7.8%を打ち消していた）→ -7.8%と区別できる
  if (appliedDiff < -0.06) {
    pass++; console.log(`✅ 適用後は-7.8%側（旧モデルの見かけ-4.7%ではない＝相殺に頼っていない証明）`);
  } else {
    fail++; console.log(`✗ 適用後が-4.7%側に戻っている（旧材長モデルの相殺に依存）: ${(appliedDiff * 100).toFixed(1)}%`);
  }
  // いずれも±10%内（拾い面積-7.8%はスコープ外の構造差として許容）
  check('推定・適用後とも±10%内', Math.abs(0) <= 0.1 && Math.abs(appliedDiff) <= 0.1, true);
}

console.log('\n--- ④ XLS原典値は見積明細67戸平均の±20%内（Gは小さめのタイプで下振れ）---');
{
  // 材積係数の妥当性の傍証（±10%ではなくGタイプ下振れを許した±20%）
  near('間仕切: XLS Gは67戸平均1.1537の-15%', XLS_MAJIKIRI_M3_PER_UNIT / MEISAI_MAJIKIRI - 1, -0.15, 0.06);
  near('天井:   XLS Gは67戸平均0.5746の-17%', XLS_CEILING_M3_PER_UNIT / MEISAI_CEILING - 1, -0.17, 0.06);
}

console.log('\n--- ⑤ エンジン出力（推定パス・従来経路）がXLS原典値に一致 ---');
{
  const calc = calculateMaterials(G_FLOOR_PLAN, {}, {});
  const maj = calc.materials.find((m) => m.unit === 'm³' && m.name.includes('間仕切木軸'));
  const cei = calc.materials.find((m) => m.unit === 'm³' && m.name.includes('天井下地'));
  near('間仕切木軸 材積（推定パス）= XLS原典 0.975351', maj.quantity, XLS_MAJIKIRI_M3_PER_UNIT, XLS_MAJIKIRI_M3_PER_UNIT * 0.1);
  near('天井下地 材積（推定パス）= XLS原典 ±10%', cei.quantity, XLS_CEILING_M3_PER_UNIT, XLS_CEILING_M3_PER_UNIT * 0.1);
  // calculation欄に材積係数を明記している（材長経由でないことを表示でも担保）
  check('間仕切: calculationにXLS材積係数を明記', /0\.0116m³\/㎡/.test(maj.calculation), true);
  check('天井:   calculationにXLS材積係数を明記', /0\.0081m³\/㎡/.test(cei.calculation), true);
}

console.log('\n--- ⑥ 適用後（buildup経路）も係数直接方式（材長モデルに戻っていない）---');
{
  const takeoff = computeElevationTakeoff(G_ELEVATIONS, [],
    { planRooms: G_FLOOR_PLAN.rooms, closetInteriors: G_CLOSET_INTERIORS });
  const calc = calculateMaterials(G_FLOOR_PLAN, {}, {});
  const applied = applyElevationTakeoff(JSON.parse(JSON.stringify(calc)), takeoff);
  const maj = applied.materials.find((m) => m.unit === 'm³' && m.name.includes('間仕切木軸'));
  // buildupの実測拾い × 0.0116 と一致する（材長×断面ではない）
  near('間仕切木軸 適用後 = 実測拾い × 0.0116', maj.quantity, majikiriVolumeM3(takeoff.majikiri_shitaji_m), 1e-9);
  check('適用後 calculationにXLS材積係数を明記', /0\.0116m³\/㎡/.test(maj.calculation), true);
}

console.log(`\n=== 間仕切下地・天井下地 材積係数: ✅ ${pass} / ✗ ${fail} ===`);
process.exit(fail > 0 ? 1 : 0);
