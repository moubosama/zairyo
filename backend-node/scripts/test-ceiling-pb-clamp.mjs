// 天井PB 比率型サニティのユニットテスト（AI呼び出しゼロ・純関数）
//
// 検証対象: materialCalculator.calculateMaterials の天井PB枚数ガード。
//   2026-07-24: 旧 Math.min(Math.max(x,20),50) の実績レンジクランプを撤去し、
//   「天井面積 ÷ 信頼できる床面積 の比」による暴走捕捉へ置換した（差し戻し再修正）。
//
// 背景（must-fix M-1）:
//   - 旧クランプの上限50枚は別府4丁目の新築大型住戸（H天井94.71㎡=66枚・I102.786㎡=71枚）を
//     頭打ちさせ-23〜30%の過少を出していた（撤去の動機は正当）。
//   - ただし旧クランプは「外形寸法誤読で total_floor_area_sqm=200㎡ → 天井PB138枚」の暴走を
//     止める唯一の安全弁でもあった（applyElevationTakeoffは天井PB行を書き換えず・
//     validateTakeoffSanityは壁PB比率のみ・従来パスでは未呼び出し）。虚偽根拠で外したのがNG。
//   - 置換: 天井/床面積比≈0.88の収束を利用し、ceilingArea が信頼できる床面積×1.3 を超えたら
//     床面積×0.88へ抑制+警告。信頼できる床面積(sanityBase)は total_area_source が検証済みなら
//     declaredArea、未検証/誤読/source無しなら roomsSumArea（部屋面積の生合計＝誤読の影響を受けない）。
//
// 期待値の出所（答え合わせではなく実装式からの論理導出）:
//   天井PB枚数 = ceil((ceilingArea − パウダー・トイレ天井) ÷ 1.45) [+ 4枚（該当室がある場合）]
//   ceilingArea = totalFloorArea − UB − CL（部屋名で分類）
//   別府H/Iの天井面積正解は scripts/beppu-9types-ground-truth.json の実XLS値。
//   別府H/I専有面積(107.9/117.1)は意匠図面積表由来（天井/専有≈0.88の裏取りに使用）。
//
// 使い方: node scripts/test-ceiling-pb-clamp.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateMaterials } from '../src/services/materialCalculator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let ok = 0, ng = 0;
function check(name, cond, detail = '') {
  if (cond) { ok++; console.log(` ✅ ${name}`); }
  else { ng++; console.log(` ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const CEILING_PB_SQM_PER_SHEET = 1.45; // 集計表X77（materialCalculatorと同値）

// 天井PB行+要確認警告を取り出す
function ceilingPb(floorPlan) {
  const calc = calculateMaterials(floorPlan, {}, {});
  const row = calc.materials.find((m) => m.name === '天井 石膏ボード');
  const warnings = calc._warnings || [];
  return {
    sheets: row?.quantity,
    ceilingArea: calc.summary.ceiling_area,
    note: row?.calculation,
    warnings,
    warnFields: warnings.map((w) => w.field),
  };
}

// パウダー・トイレを持たない単純な居室のみの間取り（+4枚加算が発動しない=純粋な面積換算のみ）
// を作るヘルパ。居室1室に全面積を寄せる（UB/CL/水回りなし → ceilingArea = totalFloorArea）。
// total_area_source は未設定 → sanityBase は roomsSumArea（=totalSqm）になる。
function livingOnly(totalSqm) {
  return {
    _validated: true,
    layout_type: '3LDK',
    total_floor_area_sqm: totalSqm,
    partition_wall_length_m: 20,
    ceiling_height_mm: 2400,
    rooms: [{ name: 'リビング・ダイニング', area_sqm: totalSqm, floor_type: 'flooring' }],
    openings: [],
    equipment: {},
  };
}

console.log('=== 天井PB 比率型サニティ テスト ===');

// ------------------------------------------------------------
// 1. 大規模住戸（旧上限50枚超）で頭打ちしないこと（本バグの本丸）
// ------------------------------------------------------------
console.log('--- 1. 大規模住戸（旧上限50枚超）で頭打ちしない ---');

// 別府Hタイプ相当: 天井94.71㎡ → 94.71/1.45 = 65.3 → ceil 66枚
{
  const beppuH = 94.71;
  const { sheets, ceilingArea, warnFields } = ceilingPb(livingOnly(beppuH));
  const expected = Math.ceil(beppuH / CEILING_PB_SQM_PER_SHEET); // 66
  check(`別府H相当(天井${beppuH}㎡)が50枚を超える`, sheets > 50, `実際 ${sheets}枚`);
  check(`別府H相当が面積換算値${expected}枚に一致（抑制されない）`, sheets === expected,
    `ceilingArea=${ceilingArea} sheets=${sheets} expected=${expected}`);
  check('別府H相当で水増し警告が出ない', !warnFields.includes('ceiling_pb_area_inflated'),
    `warnFields=${warnFields.join(',')}`);
}

// 別府Iタイプ相当: 天井102.786㎡ → 102.786/1.45 = 70.9 → ceil 71枚（絶対上限100未満）
{
  const beppuI = 102.786;
  const { sheets, warnFields } = ceilingPb(livingOnly(beppuI));
  const expected = Math.ceil(beppuI / CEILING_PB_SQM_PER_SHEET); // 71
  check(`別府I相当(天井${beppuI}㎡)が50枚を超える`, sheets > 50, `実際 ${sheets}枚`);
  check(`別府I相当が面積換算値${expected}枚に一致（絶対上限100で潰れない）`, sheets === expected,
    `sheets=${sheets} expected=${expected}`);
  check('別府I相当で抑制/上限の警告が出ない',
    !warnFields.includes('ceiling_pb_area_inflated') && !warnFields.includes('ceiling_pb_absolute_cap'),
    `warnFields=${warnFields.join(',')}`);
}

// 境界: 天井74㎡ → 74/1.45 = 51.0 → 51枚（旧なら50で頭打ち）
{
  const sqm = 74;
  const { sheets } = ceilingPb(livingOnly(sqm));
  const expected = Math.ceil(sqm / CEILING_PB_SQM_PER_SHEET);
  check(`天井${sqm}㎡が51枚（旧上限50の直上で頭打ちしない）`, sheets === expected && sheets > 50,
    `sheets=${sheets} expected=${expected}`);
}

// ------------------------------------------------------------
// 2. Gタイプ（アルファ）の回帰: クランプ非該当（範囲内）ゆえ不変
//    ※ replayは記録間で41/42に振れる（部屋面積の回間差・本ガードは無関係）。
//      ここでは固定の部屋面積入力なので決定的に算出される値で回帰確認する。
// ------------------------------------------------------------
console.log('--- 2. Gタイプ回帰（本ガード非該当・42枚±10%を維持） ---');
{
  const gtypeFloorPlan = {
    _validated: true, layout_type: '3LDK', total_floor_area_sqm: 67.3,
    partition_wall_length_m: 19.8, ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 16.75, floor_type: 'flooring' },
      { name: 'キッチン', area_sqm: 5.66, floor_type: 'flooring' },
      { name: '玄関・廊下', area_sqm: 3.6, floor_type: 'flooring' },
      { name: '洋室(1)', area_sqm: 9.72, floor_type: 'flooring' },
      { name: '洋室(2)', area_sqm: 8.10, floor_type: 'flooring' },
      { name: '洋室(3)', area_sqm: 7.76, floor_type: 'flooring' },
      { name: 'パウダールーム', area_sqm: 2.9 },
      { name: 'トイレ', area_sqm: 1.33 },
      { name: 'UB', area_sqm: 2.87 },
      { name: 'ウォークインクロゼット', area_sqm: 2.2 },
      { name: 'クロゼット(1)', area_sqm: 0.9 },
      { name: 'クロゼット(2)', area_sqm: 1.0 },
      { name: '玄関', area_sqm: 1.9, floor_type: 'tile' },
    ],
    openings: [], equipment: { ub_size: '1416' },
  };
  const { sheets, ceilingArea, warnFields } = ceilingPb(gtypeFloorPlan);
  check('Gタイプ天井PB=41枚（本ガード非該当・数値不変）', sheets === 41,
    `ceilingArea=${ceilingArea} sheets=${sheets}`);
  check('Gタイプで抑制/上限/過少の警告が出ない', warnFields.length === 0,
    `warnFields=${warnFields.join(',')}`);
  // 正解59.087/1.45系（eval-gtype-buildupの期待42枚相当）に対し±10%以内
  const diffPct = (sheets / 42 - 1) * 100;
  check('Gタイプ天井PBが正解42枚±10%以内', Math.abs(diffPct) <= 10, `${diffPct.toFixed(1)}%`);
}

// ------------------------------------------------------------
// 3. 別府9タイプ全て（正解JSON）で頭打ちが起きないことの回帰
// ------------------------------------------------------------
console.log('--- 3. 別府9タイプ正解の天井面積で頭打ちしない ---');
{
  const TRUTH = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'beppu-9types-ground-truth.json'), 'utf8'));
  for (const [type, ty] of Object.entries(TRUTH.types)) {
    const ceilSqm = ty.parts['天井PB'].area_or_length;
    const { sheets, warnFields } = ceilingPb(livingOnly(ceilSqm));
    const expected = Math.ceil(ceilSqm / CEILING_PB_SQM_PER_SHEET);
    // 天井72.5㎡超のタイプは旧クランプで50に潰れていた → 撤去後は面積換算値に一致・抑制警告なし
    check(`別府${type}(天井${ceilSqm}㎡)→${sheets}枚が面積換算${expected}枚に一致（無警告）`,
      sheets === expected && !warnFields.includes('ceiling_pb_area_inflated'),
      `sheets=${sheets} expected=${expected} warn=${warnFields.join(',')}`);
  }
}

// ------------------------------------------------------------
// 4. 誤読200㎡（外形寸法誤読）の暴走を比率で捕捉すること（M-1の核心）
//    実バグ形状: 部屋合計≒65㎡（正しく読めている）なのに total=200㎡（外形寸法誤読で水増し）。
//    total_area_source='outer_dimensions'（未検証）→ sanityBase=roomsSumArea=65 → 比≈3 で捕捉。
// ------------------------------------------------------------
console.log('--- 4. 誤読200㎡の暴走を比率で捕捉 ---');
{
  // 部屋は正しく65㎡ぶん読めているが、外形寸法誤読で total_floor_area_sqm=200 に水増しされた状態
  const misread = {
    layout_type: '3LDK',
    total_floor_area_sqm: 200,          // 誤読値
    total_area_source: 'outer_dimensions', // 未検証（validatorが誤読疑いで付けるsource）
    total_floor_area_needs_review: true,
    partition_wall_length_m: 20,
    ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 20, floor_type: 'flooring' },
      { name: '洋室(1)', area_sqm: 12, floor_type: 'flooring' },
      { name: '洋室(2)', area_sqm: 10, floor_type: 'flooring' },
      { name: '洋室(3)', area_sqm: 9, floor_type: 'flooring' },
      { name: '玄関・廊下', area_sqm: 6, floor_type: 'flooring' },
      { name: 'UB', area_sqm: 3 },
      { name: 'トイレ', area_sqm: 2 },
      { name: 'ウォークインクロゼット', area_sqm: 3 },
    ], // 合計 65㎡
    openings: [], equipment: {},
  };
  const { sheets, ceilingArea, warnFields, warnings } = ceilingPb(misread);
  // 旧クランプ撤去直後（ガード無し）なら ceilingArea≈192 → 138枚まで暴走していた
  check('誤読200㎡で天井PBが暴走せず抑制される（<=72枚≒別府I上限相当）', sheets <= 72,
    `ceilingArea=${ceilingArea} sheets=${sheets}`);
  check('誤読200㎡で水増し警告が出る', warnFields.includes('ceiling_pb_area_inflated'),
    `warnFields=${warnFields.join(',')}`);
  // sanityBase=roomsSumArea=65 → 抑制天井=65×0.88=57.2 → ceil(57.2/1.45)=40枚
  const expectedCapped = Math.ceil(65 * 0.88 / CEILING_PB_SQM_PER_SHEET);
  check(`誤読200㎡の抑制枚数が room合計ベース${expectedCapped}枚`, sheets === expectedCapped,
    `sheets=${sheets} expected=${expectedCapped}`);
  const w = warnings.find((x) => x.field === 'ceiling_pb_area_inflated');
  check('警告に before/after が入っている', w && typeof w.before === 'number' && typeof w.after === 'number',
    `warning=${JSON.stringify(w)}`);
}

// ------------------------------------------------------------
// 5. 部屋を1つも拾えず誤読totalのみ（分母無し）→ 絶対上限100で暴走を止める
// ------------------------------------------------------------
console.log('--- 5. 分母無し・誤読totalのみ → 絶対上限100 ---');
{
  const roomless = {
    layout_type: '3LDK',
    total_floor_area_sqm: 200,          // 誤読値・部屋なし・source無し
    partition_wall_length_m: 20,
    ceiling_height_mm: 2400,
    rooms: [],
    openings: [], equipment: {},
  };
  const { sheets, warnFields } = ceilingPb(roomless);
  check('部屋無し誤読200㎡で絶対上限100枚に抑制される', sheets === 100, `sheets=${sheets}`);
  check('絶対上限警告が出る', warnFields.includes('ceiling_pb_absolute_cap'),
    `warnFields=${warnFields.join(',')}`);
}

// ------------------------------------------------------------
// 6. 拾い落ち補填の正常系で誤発火しないこと（false positive防止）
//    ユーザー入力の専有67㎡（信頼済み）＋部屋が40㎡ぶんしか読めていない。
//    total_area_source='user_input' → sanityBase=declaredArea=67 → 比 0.9 で通る（抑制しない）。
// ------------------------------------------------------------
console.log('--- 6. 拾い落ち補填（信頼済み専有）で誤発火しない ---');
{
  const shortRooms = {
    layout_type: '3LDK',
    total_floor_area_sqm: 67,
    total_area_source: 'user_input',    // ユーザー入力=信頼できる → declaredAreaを分母に
    partition_wall_length_m: 20,
    ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 20, floor_type: 'flooring' },
      { name: '洋室(1)', area_sqm: 12, floor_type: 'flooring' },
      { name: '洋室(2)', area_sqm: 8, floor_type: 'flooring' },
    ], // 合計40㎡（廊下・水回り等を拾い落とし）
    openings: [], equipment: {},
  };
  const { sheets, ceilingArea, warnFields } = ceilingPb(shortRooms);
  // netTarget=67×0.96=64.3 → totalFloorArea=64.3 → ceilingArea≈64.3（UB/CL無し）
  const expected = Math.ceil(ceilingArea / CEILING_PB_SQM_PER_SHEET);
  check('拾い落ち補填で抑制されない（面積換算値のまま）', sheets === expected,
    `ceilingArea=${ceilingArea} sheets=${sheets} expected=${expected}`);
  check('拾い落ち補填で水増し警告が出ない', !warnFields.includes('ceiling_pb_area_inflated'),
    `warnFields=${warnFields.join(',')}`);
}

// ------------------------------------------------------------
// 7. S-1 過少側の情報提供（正の小面積が無警告で通らないこと）
//    信頼済み専有60㎡だが天井が10㎡しか出ない（比0.17<0.4）→ 抑制はせず情報警告のみ。
// ------------------------------------------------------------
console.log('--- 7. S-1 過少側の情報警告 ---');
{
  const tiny = {
    layout_type: '3LDK',
    total_floor_area_sqm: 60,
    total_area_source: 'user_input',
    partition_wall_length_m: 20,
    ceiling_height_mm: 2400,
    // 部屋合計は10㎡（大半がUB/CLに分類され天井から抜ける想定）
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 10, floor_type: 'flooring' },
    ],
    openings: [], equipment: {},
  };
  // ここでは netTarget=57.6 > roomsSum10 → totalFloorArea=57.6, flooringは補填で増えるが
  // ceilingArea=totalFloorArea(57.6) になり比0.96で過少にならないため、別の作り方で過少を作る:
  // 逆に declaredを大きく・部屋の大半をCL/UBにして ceilingArea を小さくする。
  const tiny2 = {
    layout_type: '3LDK',
    total_floor_area_sqm: 60,
    total_area_source: 'user_input',
    partition_wall_length_m: 20,
    ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 8, floor_type: 'flooring' },
      { name: 'ウォークインクロゼット', area_sqm: 26 },
      { name: 'クロゼット(1)', area_sqm: 26 },
    ], // roomsSum=60・うちCL52 → ceilingArea=60-52=8 → 比 8/60=0.13<0.4
  };
  const { sheets, ceilingArea, warnFields } = ceilingPb(tiny2);
  check('過少側で天井PBは抑制されない（過少は情報のみ）', sheets === Math.ceil(ceilingArea / CEILING_PB_SQM_PER_SHEET),
    `ceilingArea=${ceilingArea} sheets=${sheets}`);
  check('過少側で情報警告 ceiling_pb_area_small が出る', warnFields.includes('ceiling_pb_area_small'),
    `ceilingArea=${ceilingArea} warnFields=${warnFields.join(',')}`);
}

console.log(`\n判定: ✅ ${ok} / ✗ ${ng}`);
process.exit(ng > 0 ? 1 : 0);
