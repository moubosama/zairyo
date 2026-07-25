/**
 * 物件固有の追加部位行（extra parts）の検証
 *
 * 実行: node scripts/test-extra-parts.mjs（AI呼び出しなし・DB不要）
 *
 * 【なぜ定数のoverrideでは足りないのか＝この仕組みの存在理由】
 *   既存の override（kiwaneta_* / kaibe_wall_* / stud_height / glasswool_coverage 等）は
 *   「エンジンに**行は存在する**が値が物件で違う」ケースを吸収するもの。
 *   ところが物件によっては **行そのものが存在しない部位** がある:
 *     別府4丁目 集計表 r10「ｽﾗﾌﾞ下り際根太 H=210」
 *       A10 f="'Ａタイプ'!B104" / B10 f="'Ａタイプ'!C104"='H=210' / C10 f="'Ａタイプ'!$P104"=23.3
 *       X10=0（材積換算しない・m のまま発注）
 *       戸当: Ａ23.3 Ｂ24.1 Ｃ25.7 Ｄ17.9 Ｅ17.3 Ｆ17.4 Ｇ24.3 Ｈ0 Ｉ0
 *     アルファ側は B10='' C10=0 ＝**行が無い**（＝定数の差し替えでは表現不能）。
 *
 * 【答え合わせをしていないことの明示（重要）】
 *   23.3 等は**ユーザーがXLSを見て入力する値**であり、エンジンが図面から推定する値ではない。
 *   本テストが検証するのは「人が指定した数量がそのまま行になること（転記の正しさ）」だけで、
 *   正解に合わせるための係数・推定モデルは一切作っていない
 *   （その証拠に、タイプごとの違いは**入力値の違いだけ**でコード側に分岐が無い）。
 *
 * 【kiwaneta_spec を流用していないことの確認】
 *   H=210 は際根太本体（H110）とは別材で数量も別拾い。よって
 *   「際根太の規格を H=210 にする」実装だと本体が消える／数量が混ざる。
 *   本テストは「際根太本体と追加部位が**同時に別行として**出る」ことを固定する。
 */
import assert from 'node:assert/strict';
import { calculateMaterials, resolveExtraParts } from '../src/services/materialCalculator.js';
import { filterKenzaiScope } from '../src/services/buildupCalculator.js';

let pass = 0;
let fail = 0;
const test = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    console.error(`  ✗ ${name}\n     ${e.message}`);
  }
};

// ---------------------------------------------------------------------------
console.log('■ resolveExtraParts: 指定の解決');

test('未指定なら1行も作らない（アルファの既定動作＝後方互換）', () => {
  const r = resolveExtraParts({});
  assert.deepEqual(r.rows, []);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.invalid, []);
  // 無関係なoverrideだけでも増えない
  assert.deepEqual(resolveExtraParts({ ceiling_height: '2400mm', kiwaneta_spec: 'H110' }).rows, []);
  assert.deepEqual(resolveExtraParts().rows, []);
});

test('別府スラブ下り際根太: 名称/規格/数量/単位がそのまま行になる', () => {
  const r = resolveExtraParts({
    extra_part_1_name: 'ｽﾗﾌﾞ下り際根太',
    extra_part_1_spec: 'H=210',
    extra_part_1_qty: '23.3',
    extra_part_1_unit: 'm',
  });
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.rows[0], {
    index: 1, name: 'ｽﾗﾌﾞ下り際根太', spec: 'H=210', unit: 'm',
    category: '下地材', quantity: 23.3, volume: false, volume_m3_per_unit: null,
  });
});

test('数量0は「行を出さない」の明示指定（別府Ｈ・Ｉ＝P104=0）', () => {
  const r = resolveExtraParts({ extra_part_1_name: 'ｽﾗﾌﾞ下り際根太', extra_part_1_qty: '0' });
  assert.deepEqual(r.rows, [], '0の行は作らない（存在しない材の発注行にしない）');
  assert.equal(r.skipped.length, 1, '意図的に出さなかったことは記録する（黙って捨てない）');
  assert.equal(r.skipped[0].name, 'ｽﾗﾌﾞ下り際根太');
  assert.deepEqual(r.invalid, [], '0は不正値ではない');
});

test('単位・カテゴリの既定（m / 下地材）', () => {
  const [row] = resolveExtraParts({ extra_part_1_name: 'X', extra_part_1_qty: '5' }).rows;
  assert.equal(row.unit, 'm');
  assert.equal(row.category, '下地材');
  assert.equal(row.spec, '');
});

test('単位・カテゴリは指定できる（m以外の部位も載る＝汎用の器）', () => {
  const [row] = resolveExtraParts({
    extra_part_1_name: '特殊笠木', extra_part_1_qty: '12.5',
    extra_part_1_unit: '㎡', extra_part_1_category: '造作材',
  }).rows;
  assert.equal(row.unit, '㎡');
  assert.equal(row.category, '造作材');
});

test('複数行を同時に指定できる（欠番も許す）', () => {
  const r = resolveExtraParts({
    extra_part_1_name: 'A', extra_part_1_qty: '1',
    extra_part_3_name: 'C', extra_part_3_qty: '3',
  });
  assert.equal(r.rows.length, 2, '2番が空でも3番が拾われる');
  assert.deepEqual(r.rows.map((x) => x.name), ['A', 'C']);
});

test('上限10行を超える番号は読まない（Override 100件の枠を食い潰さない）', () => {
  const ov = {};
  for (let i = 1; i <= 12; i++) { ov[`extra_part_${i}_name`] = `P${i}`; ov[`extra_part_${i}_qty`] = '1'; }
  assert.equal(resolveExtraParts(ov).rows.length, 10);
});

console.log('■ resolveExtraParts: 不正値ガード（黙って0や既定の行を作らない）');

test('名称なし+数量あり → 行を作らず invalid に記録', () => {
  const r = resolveExtraParts({ extra_part_1_qty: '23.3' });
  assert.deepEqual(r.rows, []);
  assert.equal(r.invalid.length, 1);
  assert.equal(r.invalid[0].key, 'extra_part_1_name');
});

test('名称あり+数量なし → 行を作らず invalid に記録（0扱いにしない）', () => {
  const r = resolveExtraParts({ extra_part_1_name: 'ｽﾗﾌﾞ下り際根太' });
  assert.deepEqual(r.rows, []);
  assert.equal(r.invalid[0].key, 'extra_part_1_qty');
});

test('数字以外の暗黙除去はしない（23.3m→233 の10倍化・-5→5 の符号反転を起こさない）', () => {
  // resolveKiwanetaProfile / resolveKaibeWallSqm と同じ方針
  for (const bad of ['23.3m', '-5', '２３．３', '1,200', 'あとで']) {
    const r = resolveExtraParts({ extra_part_1_name: 'X', extra_part_1_qty: bad });
    assert.deepEqual(r.rows, [], `${bad} は採用しない`);
    assert.equal(r.invalid.length, 1, `${bad} は invalid に記録`);
  }
});

test('桁違いの数量（10万超）は採用しない', () => {
  assert.deepEqual(resolveExtraParts({ extra_part_1_name: 'X', extra_part_1_qty: '100001' }).rows, []);
  assert.equal(resolveExtraParts({ extra_part_1_name: 'X', extra_part_1_qty: '100000' }).rows.length, 1,
    '上限ちょうどは採用');
});

test('長すぎる名称・規格は切り詰める（列の桁を圧迫させない）', () => {
  const [row] = resolveExtraParts({
    extra_part_1_name: 'あ'.repeat(100), extra_part_1_spec: 'い'.repeat(100), extra_part_1_qty: '1',
  }).rows;
  assert.equal(row.name.length, 60);
  assert.equal(row.spec.length, 50);
});

console.log('■ resolveExtraParts: 材積(m³)行の有無（既定=出さない）');

test('既定は材積行なし（別府X10=0＝材積換算せずmのまま発注）', () => {
  const [row] = resolveExtraParts({ extra_part_1_name: 'X', extra_part_1_qty: '23.3' }).rows;
  assert.equal(row.volume, false);
  assert.equal(row.volume_m3_per_unit, null);
});

test('材積あり+係数指定で材積行を出す（アルファ際根太X9=0.00135相当）', () => {
  const [row] = resolveExtraParts({
    extra_part_1_name: 'X', extra_part_1_qty: '20',
    extra_part_1_volume: 'あり', extra_part_1_volume_m3_per_unit: '0.00135',
  }).rows;
  assert.equal(row.volume, true);
  assert.equal(row.volume_m3_per_unit, 0.00135);
});

test('材積ありだが係数なし → 材積行は出さず invalid に記録（0m³の行を作らない）', () => {
  const r = resolveExtraParts({
    extra_part_1_name: 'X', extra_part_1_qty: '20', extra_part_1_volume: 'あり',
  });
  assert.equal(r.rows.length, 1, '本体行は出る');
  assert.equal(r.rows[0].volume, false, '材積行は出さない');
  assert.equal(r.invalid[0].key, 'extra_part_1_volume_m3_per_unit');
});

test('材積の有無は表記ゆれを受ける（kiwaneta_volume と同じ流儀）', () => {
  for (const v of ['なし', '無', '0', 'false', 'off']) {
    assert.equal(resolveExtraParts({
      extra_part_1_name: 'X', extra_part_1_qty: '1', extra_part_1_volume: v,
    }).rows[0].volume, false, `${v}→false`);
  }
  for (const v of ['あり', '有', 'true', '1', 'ON']) {
    assert.equal(resolveExtraParts({
      extra_part_1_name: 'X', extra_part_1_qty: '1',
      extra_part_1_volume: v, extra_part_1_volume_m3_per_unit: '0.001',
    }).rows[0].volume, true, `${v}→true`);
  }
});

// ---------------------------------------------------------------------------
console.log('\n■ calculateMaterials: 追加部位が実際の資材行になる');

const floorPlan = (floor) => ({
  _validated: true,
  document_type: 'floor_plan',
  layout_type: '3LDK',
  total_floor_area_sqm: floor,
  total_area_source: 'user_input', // 床面積サニティの誤発火を避ける（他のoverrideテストと同じ）
  partition_wall_length_m: floor * 0.4,
  ceiling_height_mm: 2400,
  rooms: [
    { name: 'リビング・ダイニング', area_sqm: floor * 0.9, floor_type: 'flooring' },
    { name: 'パウダールーム', area_sqm: floor * 0.05 },
    { name: 'トイレ', area_sqm: floor * 0.05 },
  ],
  openings: [], equipment: {},
});
const calc = (floor, ov = {}) => calculateMaterials(floorPlan(floor), {}, ov);
const rowOf = (res, name, unit) => res.materials.find((m) => m.name === name && (!unit || m.unit === unit));

const SLAB = 'ｽﾗﾌﾞ下り際根太';
const slabOv = (qty) => ({
  extra_part_1_name: SLAB, extra_part_1_spec: 'H=210',
  extra_part_1_qty: String(qty), extra_part_1_unit: 'm',
});

test('指定すると資材行が出る（数量は指定値そのまま・丸めない）', () => {
  const res = calc(75.9, slabOv(23.3));
  const row = rowOf(res, SLAB);
  assert.ok(row, '追加部位の行が出る');
  assert.equal(row.quantity, 23.3);
  assert.equal(row.spec, 'H=210');
  assert.equal(row.unit, 'm');
  assert.equal(row.category, '下地材');
  assert.match(row.calculation, /物件別指定/);
});

test('【kiwaneta_spec流用でない証拠】際根太本体と追加部位が別行で同時に出る', () => {
  // 別府運用: 際根太本体=H110（kiwaneta_*） + スラブ下り際根太=H=210（extra_part_*）
  const res = calc(75.9, {
    kiwaneta_ratio: '1.07', kiwaneta_min_m: '0', kiwaneta_spec: 'H110', kiwaneta_volume: 'なし',
    ...slabOv(23.3),
  });
  const honmono = rowOf(res, '際根太', 'm');
  const slab = rowOf(res, SLAB);
  assert.ok(honmono, '際根太本体の行が残る（追加部位に置き換わっていない）');
  assert.equal(honmono.spec, 'H110', '本体の規格はH110のまま');
  assert.ok(slab, 'スラブ下り際根太は別行');
  assert.equal(slab.spec, 'H=210');
  assert.notEqual(honmono.quantity, slab.quantity, '数量も別（本体は係数計算・追加は指定値）');
  // 本体は kiwaneta_volume='なし' なので材積行なし・追加部位も既定で材積なし
  assert.equal(rowOf(res, '際根太', 'm³'), undefined);
  assert.equal(rowOf(res, SLAB, 'm³'), undefined);
});

test('0指定なら行そのものが出ない（別府Ｈ・Ｉタイプ）', () => {
  const res = calc(107.6, slabOv(0));
  assert.equal(rowOf(res, SLAB), undefined, '0mの発注行を作らない');
});

test('未指定なら行が増えない（アルファ）', () => {
  assert.equal(rowOf(calc(65.76), SLAB), undefined);
});

test('単価は既存資材から継承しない（部分一致で際根太350円/mを拾わない）', () => {
  // UNIT_PRICESの検索は部分一致（name.includes(key)）なので 'ｽﾗﾌﾞ下り際根太' が '際根太' を拾いうる。
  // 物件固有の材に既存材の単価を勝手に付けると金額が嘘になるため 0（未整備）で出す
  const row = rowOf(calc(75.9, slabOv(23.3)), SLAB);
  assert.equal(row.unit_price, 0);
  assert.equal(row.amount, 0);
  // 際根太本体の単価は従来どおり（回帰なし）
  assert.equal(rowOf(calc(75.9), '際根太', 'm').unit_price, 350);
});

test('材積あり指定で材積(m³)行も出る（数量×係数）', () => {
  const res = calc(75.9, {
    ...slabOv(20), extra_part_1_volume: 'あり', extra_part_1_volume_m3_per_unit: '0.00135',
  });
  const m3 = rowOf(res, SLAB, 'm³');
  assert.ok(m3, '材積行が出る');
  assert.equal(m3.quantity, Math.round(20 * 0.00135 * 10000) / 10000);
  assert.equal(m3.unit_price, 0);
});

test('不正値は行を作らず extra_part_N_invalid 警告を出す（黙って落とさない）', () => {
  const res = calc(75.9, { extra_part_1_name: SLAB, extra_part_1_qty: '23.3m' });
  assert.equal(rowOf(res, SLAB), undefined);
  const w = (res._warnings || []).find((x) => x.field === 'extra_part_1_invalid');
  assert.ok(w, `警告が出る: ${JSON.stringify(res._warnings)}`);
  assert.equal(w.before, '23.3m');
});

test('表示スコープ（建材14項目）を通る＝入力した行が画面に出る', () => {
  // filterKenzaiScope は名称パターンで絞るため、追加部位は明示フラグで通す設計。
  // ここが落ちると「指定しても画面に出ない」＝override機能が成立しない
  const res = calc(75.9, slabOv(23.3));
  const shown = filterKenzaiScope(res.materials);
  assert.ok(shown.find((m) => m.name === SLAB), '追加部位が表示スコープに残る');
  // 既定の14項目スコープは広がっていない（際根太本体・間仕切下地は従来どおり非表示）
  assert.equal(shown.find((m) => m.name === '際根太'), undefined, '名称パターンは広げていない');
  assert.equal(shown.find((m) => m.name === '間仕切下地(木)'), undefined);
});

test('未指定時の表示スコープは完全に不変（追加部位を使わなければ従来どおり）', () => {
  const before = filterKenzaiScope(calc(65.76).materials);
  assert.equal(before.every((m) => m.extra_part !== true), true);
  assert.ok(before.length > 0);
});

// ---------------------------------------------------------------------------
console.log('\n■ 別府7タイプ: 指定した戸当mがそのまま出るか（±2%以内）');

// 【出典】別府XLS集計表 r10「ｽﾗﾌﾞ下り際根太 H=210」の戸当セル
//   （C10=Ａ / E10=Ｂ / G10=Ｃ / I10=Ｄ / K10=Ｅ / M10=Ｆ / O10=Ｇ / Q10=Ｈ / S10=Ｉ。
//    いずれもタイプ別シート $P104 への直接参照）。
//   **これはユーザーが入力する値**であってエンジンが推定する値ではない。
//   よって「±2%以内」は係数の精度検証ではなく「転記が壊れていない（丸め・単位変換が入らない）」ことの確認。
const BEPPU_R10 = { A: 23.3, B: 24.1, C: 25.7, D: 17.9, E: 17.3, F: 17.4, G: 24.3, H: 0, I: 0 };
// 各タイプの床面積（この部位の数量には無関係だが、実運用に近い規模で計算を回すため）。
// 天井PB面積÷0.88 の逆算（check-engine-constants.mjs / test-kiwaneta-profile.mjs と同じ根拠）
const BEPPU_FLOOR = { A: 75.9, B: 48.6, C: 62.8, D: 62.5, E: 60.8, F: 66.7, G: 81.9, H: 107.6, I: 116.8 };

test('Ａ〜Ｇの7タイプ: 指定値と出力が±2%以内（丸め以外でズレない）', () => {
  const out = [];
  const ng = [];
  for (const t of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
    const expected = BEPPU_R10[t];
    const row = rowOf(calc(BEPPU_FLOOR[t], slabOv(expected)), SLAB);
    assert.ok(row, `別府${t}: 行が出る`);
    const diff = (row.quantity / expected - 1) * 100;
    out.push(`別府${t}: 指定${expected}m → ${row.quantity}m（${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%）`);
    if (Math.abs(diff) > 2) ng.push(`${t} ${diff.toFixed(2)}%`);
  }
  for (const line of out) console.log(`     ${line}`);
  assert.equal(ng.length, 0, `帯外: ${ng.join(' / ')}`);
});

test('Ｈ・Ｉタイプ: 行そのものが出力されない（P104=0＝部位が存在しない）', () => {
  for (const t of ['H', 'I']) {
    assert.equal(BEPPU_R10[t], 0, `別府${t}のXLS戸当は0`);
    const res = calc(BEPPU_FLOOR[t], slabOv(0));
    assert.equal(rowOf(res, SLAB), undefined, `別府${t}: 行なし`);
    console.log(`     別府${t}: 指定0m → 行なし ✅`);
  }
});

test('タイプ別の分岐がコードに無いことの確認（同一コードで入力値だけが違う）', () => {
  // 同じoverrideキー・同じ計算経路に「タイプ名」は一切渡していない。
  // 出力の違いが入力値の違いだけであることを、床面積を入れ替えても数量が変わらないことで示す
  // （＝床面積から推定していない＝答え合わせの係数が無い）
  const a = rowOf(calc(BEPPU_FLOOR.A, slabOv(23.3)), SLAB).quantity;
  const b = rowOf(calc(BEPPU_FLOOR.I, slabOv(23.3)), SLAB).quantity;
  assert.equal(a, b, '床面積が違っても指定値どおり（推定していない）');
  assert.equal(a, 23.3);
});

// ---------------------------------------------------------------------------
console.log(`\n結果: ✅${pass} / ✗${fail}`);
process.exit(fail > 0 ? 1 : 0);
