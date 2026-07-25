/**
 * EV廻り壁PB（EV廻り壁 石膏ボード）の丸め方式テスト（2026-07-25）
 *
 * ゴール「面積換算部位の丸め方式をXLS総量方式に整合」のうち EV廻り壁PB の回帰・仕様固定テスト。
 * 実AI呼び出しゼロ。
 *
 * 検証すること:
 *   (1) 実測パス: buildup takeoff の ev_wall_pb_sqm ÷ EV_WALL_PB_SQM_PER_SHEET(1.5) を round で置換
 *       （applyElevationTakeoff・summary.ev_wall_pb_sheets とも round）。
 *       ※丸めは round（2026-07-25・総量方式整合）。EV廻り壁PBは 1.44枚/戸の小数量部位で、
 *         per-戸 ceil(1.44)=2 が総量方式（9戸合算→÷1.5）から+38%乖離する（収納面PBと同型）。
 *   (2) 実測0のフォールバック: ev_wall_pb_sqm=0 は set() の quantity>0 ガードにより
 *       実測置換が発火せず、推定パスの固定3枚を維持する（別府のようにEV面PBが展開図に無いケース）。
 *   (3) round と ceil で結果が変わる境界（Gタイプ実測2.16㎡）で round=1枚・ceil=2枚 を明示。
 *   (4) 総量方式との照合（答え合わせでない残差の可視化）:
 *       per-戸 round×9 = 1×9 = 9枚 vs XLS総量 ceil(2.16×9/1.5)=ceil(12.96)=13枚。
 *       小数量部位のため per-戸roundでも端数の関係で総量方式と乖離が残る（-30.8%）ことを数値で明示。
 *
 * 実行: node scripts/test-ev-wall-pb.mjs
 */
import { calculateMaterials } from '../src/services/materialCalculator.js';
import { applyElevationTakeoff, EV_WALL_PB_SQM_PER_SHEET } from '../src/services/buildupCalculator.js';

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra ? '  ← ' + extra : ''}`); }
}

const EV_NAME = 'EV廻り壁 石膏ボード';
const findEv = (materials) => materials.find((m) => m.name === EV_NAME);

// 最小の平面図入力（EV廻り壁PBは実測 ev_wall_pb_sqm ÷ 1.5 で決まり図面精度に依存しない）
const plan = {
  _validated: true, document_type: 'floor_plan', layout_type: '3LDK',
  total_floor_area_sqm: 67.3, total_area_source: 'user_input',
  partition_wall_length_m: 24, ceiling_height_mm: 2400,
  rooms: [
    { name: 'リビング・ダイニング', area_sqm: 20, floor_type: 'flooring' },
    { name: '洋室(1)', area_sqm: 8, floor_type: 'flooring' },
    { name: 'トイレ', area_sqm: 2 },
  ],
  openings: [], equipment: {},
};

console.log('=== 換算係数の原典値 ===');
ok(EV_WALL_PB_SQM_PER_SHEET === 1.5, `EV_WALL_PB_SQM_PER_SHEET = 1.5（XLS集計表X62・A-4是正）`, `実際=${EV_WALL_PB_SQM_PER_SHEET}`);

console.log('\n=== (1) 実測パス: applyElevationTakeoff(ev_wall_pb_sqm ÷ 1.5・round丸め) ===');
{
  // Gタイプ実測 2.16㎡ → round(2.16/1.5)=round(1.44)=1枚（旧ceilは2枚）
  const base = calculateMaterials(plan, {}, {});
  const before = findEv(base.materials).quantity;
  applyElevationTakeoff(base, mkTakeoff({ ev_wall_pb_sqm: 2.16 }));
  const row = findEv(base.materials);
  ok(row.quantity === Math.round(2.16 / EV_WALL_PB_SQM_PER_SHEET), `ev_wall_pb_sqm=2.16 → round=${Math.round(2.16 / EV_WALL_PB_SQM_PER_SHEET)}枚に実測置換`, `実際=${row.quantity}(前=${before})`);
  ok(row.quantity === 1, `Gタイプ実測2.16㎡は round(1.44)=1枚`, `実際=${row.quantity}`);
  ok(row.takeoff === true, `実測フラグ takeoff=true が立つ`);
  ok(/実測/.test(row.calculation) && /1\.5/.test(row.calculation), `根拠に「EV面実測 … ÷1.5」`, row.calculation);
  // summary も round
  ok(base.summary && base.summary.ev_wall_pb_sheets === 1, `summary.ev_wall_pb_sheets も round=1枚`, `実際=${base.summary && base.summary.ev_wall_pb_sheets}`);

  // 別の面積で round が効く境界: 2.30㎡ → round(1.533)=2枚
  const base2 = calculateMaterials(plan, {}, {});
  applyElevationTakeoff(base2, mkTakeoff({ ev_wall_pb_sqm: 2.30 }));
  ok(findEv(base2.materials).quantity === 2, `ev_wall_pb_sqm=2.30 → round(1.53)=2枚`, `実際=${findEv(base2.materials).quantity}`);
}

console.log('\n=== (2) 実測0のフォールバック: 推定3枚を維持（quantity>0ガード）===');
{
  const base = calculateMaterials(plan, {}, {});
  const est = findEv(base.materials).quantity;
  ok(est === 3, `推定パス（展開図なし）の固定3枚が既定`, `実際=${est}`);
  applyElevationTakeoff(base, mkTakeoff({ ev_wall_pb_sqm: 0 }));
  const row = findEv(base.materials);
  ok(row.quantity === est && row.takeoff !== true, `ev_wall_pb_sqm=0 は実測発火せず推定(${est}枚)を維持`, `実際=${row.quantity} takeoff=${row.takeoff}`);
  ok(base.summary && base.summary.ev_wall_pb_sheets === 0, `summary.ev_wall_pb_sheets=0（実測0の㎡はsummaryに反映・行はフォールバック維持）`, `実際=${base.summary && base.summary.ev_wall_pb_sheets}`);
}

console.log('\n=== (3) round vs ceil の差（境界の可視化）===');
{
  // 1.44枚はちょうど round↓(1) と ceil↑(2) が割れる帯（0.5未満）。旧実装ceilから-1枚になることを固定
  const sqm = 2.16;
  ok(Math.round(sqm / 1.5) === 1 && Math.ceil(sqm / 1.5) === 2, `2.16㎡: round=1枚 / ceil=2枚（旧実装は2枚）`, `round=${Math.round(sqm / 1.5)} ceil=${Math.ceil(sqm / 1.5)}`);
}

console.log('\n=== (条件2) 別府9タイプの防露ふかし壁実測帯で丸めが破綻しない ===');
{
  // 別府 集計表62行「防露ふかし壁（ＰＢ）」戸当㎡（原典）: A=1.36 B=1.904 C=0.816 D=1.904 G=2.176
  //   丸めは物件不変（roundはアルファ/別府とも同じ規則）。負値・巨大値を出さないことを確認。
  const beppu62 = { A: 1.36, B: 1.904, C: 0.816, D: 1.904, G: 2.176 };
  for (const [t, sqm] of Object.entries(beppu62)) {
    const base = calculateMaterials(plan, {}, {});
    applyElevationTakeoff(base, mkTakeoff({ ev_wall_pb_sqm: sqm }));
    const q = findEv(base.materials).quantity;
    const expected = Math.round(sqm / EV_WALL_PB_SQM_PER_SHEET);
    ok(q === expected && q >= 0 && q <= 3, `別府${t} ${sqm}㎡ → round=${expected}枚（0〜3枚の妥当域・負値/暴走なし）`, `実際=${q}`);
  }
}

console.log('\n=== (4) 総量方式との照合（答え合わせでない残差）===');
{
  // per-戸 round×9 = 1×9 = 9枚 vs XLS総量 ceil(2.16×9/1.5)=ceil(12.96)=13枚。
  //   round化は「per-戸ceilが総量方式から乖離する構造」の是正だが、EVは小数量ゆえ端数の関係で
  //   round(1.44)=1 に丸めると 9戸で9枚となり総量13枚から-30.8%乖離が残る。無理に合わせない（答え合わせ禁止）。
  const perUnitRound = Math.round(2.16 / 1.5);          // 1
  const perUnitCeil = Math.ceil(2.16 / 1.5);            // 2
  const totalXls = Math.ceil(2.16 * 9 / 1.5);           // 13
  const diffRound = (perUnitRound * 9 - totalXls) / totalXls * 100;   // -30.8%
  const diffCeil = (perUnitCeil * 9 - totalXls) / totalXls * 100;     // +38.5%
  console.log(`     per-戸round×9=${perUnitRound * 9}枚  per-戸ceil×9=${perUnitCeil * 9}枚  XLS総量=${totalXls}枚`);
  console.log(`     乖離: round=${diffRound.toFixed(1)}% / ceil=${diffCeil.toFixed(1)}%`);
  ok(perUnitRound * 9 === 9 && totalXls === 13, `per-戸round×9=9枚 / XLS総量ceil=13枚`, `round9=${perUnitRound * 9} xls=${totalXls}`);
  // roundはceilより総量方式に「近い側」ではあるが±5%には収まらない（端数が小さすぎるため）
  ok(Math.abs(diffRound) < Math.abs(diffCeil), `round(-30.8%)はceil(+38.5%)より総量方式に近い`, `|round|=${Math.abs(diffRound).toFixed(1)} |ceil|=${Math.abs(diffCeil).toFixed(1)}`);
  ok(Math.abs(diffRound) > 5, `ただし±5%には収まらない（EVは1.44枚の極小量で端数丸めの相対誤差が大きい・答え合わせしない）`, `残差=${diffRound.toFixed(1)}%`);
}

console.log(`\n=== EV廻り壁PB 丸め方式: ✅ ${pass} / ✗ ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);

// applyElevationTakeoff が読む takeoff の最小形（他部位は0で実測発火させない）
function mkTakeoff(over) {
  return {
    wall_pb_sqm: 0, waterproof_pb_sqm: 0, ev_wall_pb_sqm: 0, sound_wall_pb_sqm: 0,
    gw_sqm: 0, sound_sheet_sqm: 0, rawan_veneer_sqm: 0, konpane_sqm: 0,
    cloth_sqm: 0, kitchen_panel_sqm: 0, majikiri_shitaji_m: 0,
    kaibe_furring_sqm: 0, kaibe_furring_faces: 0,
    kaibe_estimate_sqm: 5.047, kaibe_estimate_source: 'default',
    skirting_m: { 木製: 0, ソフト: 0, 樹脂: 0 },
    _warnings: [],
    ...over,
  };
}
