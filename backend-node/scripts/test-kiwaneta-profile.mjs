/**
 * 際根太の物件別プロファイル（係数・下限・規格・材積換算の有無）の検証
 *
 * 実行: node scripts/test-kiwaneta-profile.mjs（AI呼び出しなし・DB不要）
 *
 * 【なぜ「規格だけのoverride」では足りないか】
 *   際根太は「どこに入れるか」が物件の設計思想そのもので、床面積比が物件で3.5〜4.6倍違う:
 *     アルファ 18.2m ÷ 床65.76㎡ = 0.277 m/㎡（玄関5.7+便所4.0+洗面8.5＝水回り+玄関の段差部だけ）
 *     別府     0.97〜1.27 m/㎡（住戸のほぼ全周。際根太/巾木=1.05〜1.31で巾木と同オーダー）
 *   規格文字列だけ 'H110' に差し替えると、数量は既定係数のまま18〜33mしか出ず**実測47〜137mに対し
 *   -60〜76%の過少なのに「対応済み」に見える**＝かえって危険。よって
 *     ratio（長さ係数）/ min_m（下限）/ spec（摘要）/ volume（材積行を出すか）
 *   を1プロファイルとして解決する（resolveKiwanetaProfile）。
 *
 * 【答え合わせをしていないことの明示（重要）】
 *   本テストは「別府の正解値に一致する係数をエンジンが自動で当てる」ことは**検証していない**
 *   （それは正解からの逆算＝答え合わせになる）。検証するのは
 *     「人がXLS由来の係数を指定したとき、その指定が素直に数量へ反映されること」
 *   だけ。指定値そのもの（1.066等）は別府XLS集計表9行の戸当実測 ÷ 床面積 で人が作る値で、
 *   エンジンはそれを推測しない。正解JSONとの比較は「指定が効いた結果が実測帯に入るか」の
 *   サニティであり、係数をフィットさせてはいない（同じ係数を全タイプに使い、
 *   タイプ別に係数を作り分けていないことがその証拠）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateMaterials, resolveKiwanetaProfile, KIWANETA_RATIO_ALPHA,
} from '../src/services/materialCalculator.js';

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
console.log('■ resolveKiwanetaProfile: 既定（アルファ実績）と物件別指定');

test('未設定はアルファ既定（係数0.28・下限18m・規格45×30・材積あり）', () => {
  const p = resolveKiwanetaProfile({});
  assert.equal(p.ratio, KIWANETA_RATIO_ALPHA);
  assert.equal(p.min_m, 18);
  assert.equal(p.spec, '45×30 米栂1等');
  assert.equal(p.volume, true);
  assert.deepEqual(p.source, { ratio: 'default', min_m: 'default', spec: 'default', volume: 'default' });
  assert.deepEqual(p.invalid, {});
});

test('別府プロファイル: 4項目すべてが override として解決される', () => {
  const p = resolveKiwanetaProfile({
    kiwaneta_ratio: '1.07', kiwaneta_min_m: '0', kiwaneta_spec: 'H110', kiwaneta_volume: 'なし',
  });
  assert.equal(p.ratio, 1.07);
  assert.equal(p.min_m, 0);
  assert.equal(p.spec, 'H110');
  assert.equal(p.volume, false);
  assert.deepEqual(p.source, { ratio: 'override', min_m: 'override', spec: 'override', volume: 'override' });
});

test('空文字・null・undefined は未設定扱い（既定へ）', () => {
  for (const v of ['', '   ', null, undefined]) {
    const p = resolveKiwanetaProfile({
      kiwaneta_ratio: v, kiwaneta_min_m: v, kiwaneta_spec: v, kiwaneta_volume: v,
    });
    assert.equal(p.ratio, KIWANETA_RATIO_ALPHA, `ratio(${JSON.stringify(v)})`);
    assert.equal(p.min_m, 18);
    assert.equal(p.spec, '45×30 米栂1等');
    assert.equal(p.volume, true);
  }
});

test('min_m=0 は「下限なし」として採用される（既定18mへ戻らない）', () => {
  // アルファ実績18mを他物件へ持ち込ませないための要件。0の明示指定が潰れると
  // 別府の小さいタイプで下限18mが誤って効く
  const p = resolveKiwanetaProfile({ kiwaneta_min_m: '0' });
  assert.equal(p.min_m, 0);
  assert.equal(p.source.min_m, 'override');
});

test('材積の有無は表記ゆれを受ける（なし/無/0/false/off ↔ あり/有/1/true/on）', () => {
  for (const v of ['なし', '無', '0', 'false', 'FALSE', 'off']) {
    assert.equal(resolveKiwanetaProfile({ kiwaneta_volume: v }).volume, false, `${v}→false`);
  }
  for (const v of ['あり', '有', '1', 'true', 'ON']) {
    assert.equal(resolveKiwanetaProfile({ kiwaneta_volume: v }).volume, true, `${v}→true`);
  }
});

test('不正値は既定へフォールバックし invalid に記録（呼び出し側が警告を出せる）', () => {
  const p = resolveKiwanetaProfile({
    kiwaneta_ratio: '1.07m/㎡', kiwaneta_min_m: 'なし', kiwaneta_volume: 'たぶん',
  });
  assert.equal(p.ratio, KIWANETA_RATIO_ALPHA);
  assert.equal(p.min_m, 18);
  assert.equal(p.volume, true);
  assert.equal(p.invalid.ratio, '1.07m/㎡');
  assert.equal(p.invalid.min_m, 'なし');
  assert.equal(p.invalid.volume, 'たぶん');
});

test('数字以外の暗黙除去はしない（1.07→107 の100倍化・-3→3 の符号反転を起こさない）', () => {
  // resolveKaibeWallSqm / glasswool_coverage と同じ方針。黙って桁を変えるのが最悪
  assert.equal(resolveKiwanetaProfile({ kiwaneta_ratio: '-1.07' }).ratio, KIWANETA_RATIO_ALPHA);
  assert.equal(resolveKiwanetaProfile({ kiwaneta_ratio: '1.07 m' }).ratio, KIWANETA_RATIO_ALPHA);
  assert.equal(resolveKiwanetaProfile({ kiwaneta_min_m: '-40' }).min_m, 18);
});

test('レンジ外は既定へ（係数上限3.0 m/㎡・下限指定上限300m）', () => {
  // 別府max 1.27 の2倍以上＝桁違いの入力ミス（'107'のような%入力等）
  assert.equal(resolveKiwanetaProfile({ kiwaneta_ratio: '107' }).ratio, KIWANETA_RATIO_ALPHA);
  assert.equal(resolveKiwanetaProfile({ kiwaneta_ratio: '3.01' }).ratio, KIWANETA_RATIO_ALPHA);
  assert.equal(resolveKiwanetaProfile({ kiwaneta_ratio: '3' }).ratio, 3, '上限ちょうどは採用');
  assert.equal(resolveKiwanetaProfile({ kiwaneta_min_m: '301' }).min_m, 18);
});

test('規格は自由文字列だが50字で切り詰める（spec列の桁を圧迫させない）', () => {
  const long = 'あ'.repeat(80);
  assert.equal(resolveKiwanetaProfile({ kiwaneta_spec: long }).spec.length, 50);
});

// ---------------------------------------------------------------------------
console.log('\n■ calculateMaterials: プロファイルが実際の資材行に効く');

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
const rowsOf = (floor, ov = {}) => {
  const r = calculateMaterials(floorPlan(floor), {}, ov);
  return {
    m: r.materials.find((x) => x.name === '際根太' && x.unit === 'm'),
    m3: r.materials.find((x) => x.name === '際根太' && x.unit === 'm³'),
    warnings: r._warnings || [],
  };
};

const BEPPU = { kiwaneta_ratio: '1.07', kiwaneta_min_m: '0', kiwaneta_spec: 'H110', kiwaneta_volume: 'なし' };

test('既定（アルファG 65.76㎡）: 19m・規格45×30・材積行あり', () => {
  const { m, m3 } = rowsOf(65.76);
  assert.equal(m.quantity, Math.ceil(65.76 * KIWANETA_RATIO_ALPHA),
    'ceil(65.76×0.28)=19（実績18.2mに対し+4.4%＝eval既存値）');
  assert.equal(m.spec, '45×30 米栂1等');
  assert.ok(m3, '材積(m³)行が出る');
  assert.equal(m3.spec, 'LVL 30×45');
});

test('別府プロファイル: 規格がH110になり材積(m³)行が出ない（X9=0＝材積換算しない）', () => {
  const { m, m3 } = rowsOf(75.9, BEPPU);
  assert.equal(m.spec, 'H110');
  assert.equal(m3, undefined, '材積行は0m³で出すのではなく行ごと出さない');
});

test('規格だけ差し替えた場合は数量が既定のまま（＝規格overrideだけでは不十分の実証）', () => {
  // このテストは「規格だけのoverrideでは危険」というレビュー指摘を回帰として固定するもの。
  // 別府Ａの実測は80.9mだが、規格だけ変えても21m（-74%）にしかならない
  const floor = 75.9;
  const { m } = rowsOf(floor, { kiwaneta_spec: 'H110' });
  assert.equal(m.spec, 'H110');
  // 期待値は観測値の写しではなく式から算出: ceil(床 × 既定係数) と一致＝係数が変わっていない
  assert.equal(m.quantity, Math.ceil(floor * KIWANETA_RATIO_ALPHA), '既定係数のまま');
  assert.ok(m.quantity < 80.9 * 0.4, '実測80.9mに対し-60%超の過少（規格だけでは埋まらない）');
});

test('下限18mは既定のみ（min_m=0指定で小規模住戸でも下限が効かない）', () => {
  const small = 30; // ceil(30×0.277)=9 < 18
  assert.equal(rowsOf(small).m.quantity, 18, '既定は下限18mが効く（アルファ実績の後方互換）');
  assert.equal(rowsOf(small, { kiwaneta_min_m: '0' }).m.quantity, 9, 'min_m=0なら下限なし');
});

test('不正値のoverrideは既定で計算し kiwaneta_*_invalid 警告を出す（黙って既定に落ちない）', () => {
  const { m, warnings } = rowsOf(65.76, { kiwaneta_ratio: '1.07m/㎡' });
  assert.equal(m.quantity, 19, '既定係数で計算');
  const w = warnings.find((x) => x.field === 'kiwaneta_ratio_invalid');
  assert.ok(w, `警告が出る: ${JSON.stringify(warnings)}`);
  assert.equal(w.before, '1.07m/㎡');
});

test('無関係なoverrideだけなら際根太は既定のまま（回帰なし）', () => {
  const { m, m3 } = rowsOf(65.76, { ceiling_height: '2400mm', glasswool_coverage: '0.5' });
  assert.equal(m.quantity, 19);
  assert.equal(m.spec, '45×30 米栂1等');
  assert.ok(m3, '材積行も従来どおり出る');
});

// ---------------------------------------------------------------------------
console.log('\n■ 別府9タイプ: 人が指定した係数で実測帯に入るか（答え合わせではないことの説明は冒頭コメント）');

const here = path.dirname(fileURLToPath(import.meta.url));
const truth = JSON.parse(fs.readFileSync(path.join(here, 'beppu-9types-ground-truth.json'), 'utf8'));
const TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
// 床面積は正解JSONに専有が無いため天井PB面積÷0.88で逆算（check-engine-constants.mjs と同じ根拠）
const CEILING_TO_FLOOR = 0.88;
const floorOf = (t) => truth.types[t].parts['天井PB'].area_or_length / CEILING_TO_FLOOR;
const kiwaOf = (t) => truth.types[t].parts['際根太'].area_or_length;

// 【指定する係数の作り方＝タイプ別にフィットさせない】
//   別府の物件レベルの代表値1つ（全9タイプ共通）だけを人が指定する。
//   値は XLS 9行の戸当合計 ÷ 床面積合計（＝物件の加重平均）で、正解に合わせた微調整はしない。
const beppuRatio = (() => {
  const kiwaSum = TYPES.reduce((a, t) => a + kiwaOf(t), 0);
  const floorSum = TYPES.reduce((a, t) => a + floorOf(t), 0);
  return Math.round((kiwaSum / floorSum) * 100) / 100; // 小数2桁（人が入力する粒度）
})();
console.log(`  別府の指定係数（物件加重平均・全タイプ共通）= ${beppuRatio} m/㎡`);

test('既定（アルファ係数）のままだと別府9タイプすべてが大幅な過少（未対応時の姿）', () => {
  const bad = [];
  for (const t of TYPES) {
    const q = rowsOf(floorOf(t)).m.quantity;
    const diff = (q / kiwaOf(t) - 1) * 100;
    if (diff < -50) bad.push(`${t}=${q}m(実測${kiwaOf(t)}m ${diff.toFixed(0)}%)`);
  }
  assert.equal(bad.length, 9, `9タイプ全部が-50%超の過少になる: ${bad.join(' ')}`);
});

test('物件係数を指定すると9タイプすべてが実測±25%帯に入る（タイプ別調整なしの単一係数）', () => {
  const ov = { ...BEPPU, kiwaneta_ratio: String(beppuRatio) };
  const out = [];
  const ng = [];
  for (const t of TYPES) {
    const q = rowsOf(floorOf(t), ov).m.quantity;
    const diff = (q / kiwaOf(t) - 1) * 100;
    out.push(`${t}: ${String(q).padStart(3)}m vs 実測${String(kiwaOf(t)).padStart(6)}m = ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`);
    // ±25%: 単一係数で9タイプ（床48〜117㎡）を賄う以上、タイプ差（0.97〜1.27の幅）は残る。
    // ここで見たいのは「指定が効いて実測帯へ届くか」であり、係数精度の追い込みではない
    if (Math.abs(diff) > 25) ng.push(`${t} ${diff.toFixed(1)}%`);
  }
  for (const line of out) console.log(`     ${line}`);
  assert.equal(ng.length, 0, `帯外: ${ng.join(' / ')}`);
});

test('タイプ別に人が係数を指定すればさらに近づく（別府Ａ80.9m・Ｈ136.9m の再現）', () => {
  // タイプ別の係数もXLS実測÷床面積で人が作る値（エンジンは推測しない）。
  // 小数2桁に丸めた「人が入力する粒度」で指定し、丸めの範囲で実測に一致することを確認する
  for (const t of ['A', 'H']) {
    const ratio = Math.round((kiwaOf(t) / floorOf(t)) * 100) / 100;
    const q = rowsOf(floorOf(t), { ...BEPPU, kiwaneta_ratio: String(ratio) }).m.quantity;
    const diff = Math.abs(q / kiwaOf(t) - 1) * 100;
    console.log(`     別府${t}: 指定${ratio} → ${q}m vs 実測${kiwaOf(t)}m = ${diff.toFixed(1)}%`);
    assert.ok(diff <= 3, `別府${t}: ${q}m vs ${kiwaOf(t)}m（${diff.toFixed(1)}%）`);
  }
});

// ---------------------------------------------------------------------------
console.log(`\n結果: ✅${pass} / ✗${fail}`);
process.exit(fail > 0 ? 1 : 0);
