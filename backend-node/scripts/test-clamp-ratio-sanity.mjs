// 実績レンジのクランプ4件 → 2層ガード置換のユニットテスト（AI呼び出しゼロ・純関数）
//
// 検証対象: materialCalculator.calculateMaterials の以下4部位のガード。
//   2026-07-24 に絶対値クランプ Math.min(Math.max(x, min), max) を撤去した:
//     壁PB 旧[30, 90]枚 / 壁耐水PB 旧[2, 7]枚 / 巾木 旧[30, 60]m / 間仕切GW 旧[5, 15]㎡
//
// 【置換後の設計（M-2で第1版から作り直し）】
//   層1 floor_area_inflated: 「数量計算に使う床面積 vs 信頼できる床面積(sanityBase)」が比1.25超なら
//     **床面積そのもの**（totalFloorArea/flooringArea/cfArea/tileArea）を一括是正。
//     全部位が同じ基準になる唯一の層で、床面積由来の暴走はここで止める。
//   層2 部位cap: 床面積とは**独立した入力**を持つ部位だけに置く。
//     壁耐水PB ← cfArea（0.4㎡/㎡）/ 間仕切GW ← 間仕切壁延長（1.2㎡/㎡）。
//   **壁PB・巾木の部位capは置かない**: 出力が床面積の固定倍（1.37×0.6=0.822枚/㎡・0.82m/㎡）で、
//     床面積比の上限（1.509枚/㎡・1.5m/㎡）とは床面積によらず常に比54%＝**到達不能な死んだガード**
//     だったため（第1版の欠陥）。セクション9で総当たりして「死んでいない」ことを検証する。
//
// 撤去の動機（scripts/check-engine-constants.mjs で判明した実測）:
//   別府4丁目9タイプの実測（scripts/beppu-9types-ground-truth.json = XLS集計表の戸当セル）が
//   旧帯の外に出る。壁PB 23.6〜98.4枚（B・Iが帯外）／耐水 2.5〜9.5枚（Gが帯外）／
//   巾木 43.8〜106.8m（**7/9タイプ**が帯外）／間仕切GW 35.0〜53.6㎡（**9/9タイプ全滅**）。
//   旧帯はいずれもアルファステイツ新宮町（リノベ・67㎡級）の実績で、90〜117㎡級の
//   新築住戸には物理的に足りない。
//
// 撤去だけでは危険（＝このテストの主眼）:
//   旧クランプの上限は「外形寸法の誤読で total_floor_area_sqm が水増しされたときの暴走」を
//   止める唯一の安全弁でもあった（従来パスでは validateTakeoffSanity 未呼び出し・
//   applyElevationTakeoff も走らない）。実測: total=200㎡誤読で壁PB165枚/巾木164m/GW96㎡。
//   → 置換後もこの暴走が止まることを確認する。
//
// 期待値の出所（答え合わせではなく実装式からの論理導出 or XLS実測）:
//   壁PB枚数   = ceil(ceil(床面積 × 1.37) × 0.6)
//   耐水PB枚数 = ceil(水回り床面積 ÷ 1.6562 × 1.2)
//   巾木       = ceil(床面積 × 0.82)（3LDK/4LDKは最低50m・2LDKは最低40m）
//   間仕切GW   = ceil(間仕切壁延長 × 天井高 × 充填率)。充填率の既定はアルファ基準0.135
//                （= GW実測6.425㎡ ÷ (間仕切19.8m × CH2.4m)。M-3で物件依存と判明しoverride化）
//   別府9タイプの実測値は beppu-9types-ground-truth.json（XLS集計表の戸当セル）。
//   別府の床面積は正解JSONに無いため「天井面積÷0.88」で逆算（天井/専有比0.88は両物件で収束）。
//
// 使い方: node scripts/test-clamp-ratio-sanity.mjs
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

const TRUTH = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'beppu-9types-ground-truth.json'), 'utf8'));
const TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const CEILING_TO_FLOOR = 0.88; // 天井/専有の収束比（アルファG 0.878・別府H/I 0.878）
const floorSqmOf = (t) => TRUTH.types[t].parts['天井PB'].area_or_length / CEILING_TO_FLOOR;

const PB_SHEET = 1.6562; // ㎡/枚（materialCalculator の PB_SHEET_SIZE_3x6）

// 実装の上限比（materialCalculator と同値。ここを変えたら実装も変わる＝回帰ガードになる）
//   壁PB・巾木は**床面積比**の部位capを持たない（M-2）ので上限比の定数も持たない。
//   代わりに**絶対上限**を持つ（MF-1・下記）。
const WATER_PB_MAX_RATIO = 0.4 / PB_SHEET;       // 枚/㎡
const GW_MAX_RATIO = 1.2;                        // ㎡/㎡
const GW_COVERAGE_DEFAULT = 0.135;               // 充填率の既定（アルファ基準・M-3）
// 部位絶対上限（MF-1。materialCalculator の WALL_PB_ABSOLUTE_MAX_SHEETS / HABAKI_ABSOLUTE_MAX_M と同値）
const WALL_PB_ABS_MAX = 120;                     // 枚（別府実測max 98.4枚の1.22倍）
const HABAKI_ABS_MAX = 130;                      // m （別府実測max 106.9mの1.22倍）

const ROWS = {
  wallPb: '壁 石膏ボード',
  waterPb: '壁 耐水石膏ボード',
  habaki: '木製巾木',
  gw: '間仕切 グラスウール充填',
};

function calc(floorPlan, overrides = {}) {
  const r = calculateMaterials(floorPlan, {}, overrides);
  const q = (name) => r.materials.find((m) => m.name === name)?.quantity;
  const warnings = r._warnings || [];
  return {
    wallPb: q(ROWS.wallPb), waterPb: q(ROWS.waterPb),
    habaki: q(ROWS.habaki), gw: q(ROWS.gw),
    note: (name) => r.materials.find((m) => m.name === name)?.calculation,
    warnings, warnFields: warnings.map((w) => w.field),
  };
}

// 別府タイプ相当の入力（専有面積はユーザー入力＝通常運用）。
// ※ 正解値から逆算した入力は作らない（答え合わせ回避）。水回りは床の10%という一般的な比で置く。
function beppuLike(t, { wetRatio = 0.10 } = {}) {
  const floor = floorSqmOf(t);
  const wet = floor * wetRatio;
  return {
    _validated: true,
    layout_type: '3LDK',
    total_floor_area_sqm: floor,
    total_area_source: 'user_input',
    partition_wall_length_m: floor * 0.4,
    ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: floor - wet, floor_type: 'flooring' },
      { name: 'パウダールーム', area_sqm: wet * 0.5 },
      { name: 'トイレ', area_sqm: wet * 0.5 },
    ],
    openings: [], equipment: {},
  };
}

console.log('=== 実績レンジのクランプ4件 → 比率型サニティ テスト ===');

// ------------------------------------------------------------
// 1. 別府9タイプの実測値に「到達できる」こと（旧帯で潰されない＝本バグの本丸）
//    旧クランプ下では 巾木9/9中7タイプ・GW9/9タイプが上限に張り付いていた。
// ------------------------------------------------------------
console.log('--- 1. 別府9タイプで抑制警告が出ない（上限に張り付かない） ---');
for (const t of TYPES) {
  const r = calc(beppuLike(t));
  const excessive = r.warnFields.filter((f) => /excessive|floor_area_inflated/.test(f));
  check(`別府${t}(床${floorSqmOf(t).toFixed(1)}㎡) 壁PB=${r.wallPb}枚 耐水=${r.waterPb}枚 巾木=${r.habaki}m GW=${r.gw}㎡ で抑制なし`,
    excessive.length === 0, `warnFields=${r.warnFields.join(',')}`);
}

console.log('--- 1-b. 旧クランプ上限を超える出力が実際に出ること（撤去の実効性） ---');
{
  // 旧上限: 巾木60m / GW15㎡ / 壁PB90枚 / 耐水7枚
  const h = calc(beppuLike('H'));  // 床≈107.6㎡（最大級）
  check(`別府H 巾木${h.habaki}m が旧上限60mを超える`, h.habaki > 60, `habaki=${h.habaki}`);
  // GWは旧上限15㎡の撤去だけでは別府に届かない（充填率が物件依存のため。M-3）。
  //   既定（アルファ基準0.135）では14㎡どまりで、別府の実測45.4㎡には遠い。
  //   別府仕様の充填率を指定して初めて旧上限を大きく超える＝「上限撤去が効いている」ことは
  //   その状態で確認する（既定のまま15㎡超を期待すると、充填率の物件依存を隠すことになる）。
  const hBeppuCoverage = calc(beppuLike('H'), { glasswool_coverage: '0.5' });
  check(`別府H GW${hBeppuCoverage.gw}㎡（充填率0.5指定）が旧上限15㎡を超える`,
    hBeppuCoverage.gw > 15, `gw=${hBeppuCoverage.gw}`);
  check(`別府H GWは既定の充填率だと${h.gw}㎡どまり（＝上限撤去だけでは別府に届かない・M-3の記録）`,
    h.gw < 20, `gw=${h.gw}`);
  const i = calc(beppuLike('I'));  // 床≈116.8㎡
  check(`別府I 壁PB${i.wallPb}枚 が旧上限90枚を超える`, i.wallPb > 90, `wallPb=${i.wallPb}`);
  check(`別府I 巾木${i.habaki}m が旧上限60mを超える`, i.habaki > 60, `habaki=${i.habaki}`);
  // 耐水は水回りが大きいタイプで旧上限7枚を超える（別府G実測9.5枚相当）
  const g = calc(beppuLike('G', { wetRatio: 0.16 }));
  check(`水回り大(床の16%)で耐水${g.waterPb}枚 が旧上限7枚を超える`, g.waterPb > 7, `waterPb=${g.waterPb}`);
}

console.log('--- 1-c. 旧下限で底上げされないこと（別府Bは旧下限を下回る実測を持つ） ---');
{
  // 別府B: 壁PB実測23.6枚（旧下限30）・耐水実測3.8枚（旧下限2は下回らないが下限撤去の確認）
  // 小さな住戸（床30㎡）で旧下限[30枚/30m/5㎡]に底上げされないことを見る
  const small = {
    _validated: true, layout_type: '1LDK',
    total_floor_area_sqm: 30, total_area_source: 'user_input',
    partition_wall_length_m: 6, ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 27, floor_type: 'flooring' },
      { name: 'トイレ', area_sqm: 3 },
    ],
    openings: [], equipment: {},
  };
  const r = calc(small);
  // 壁PB = ceil(ceil(30×1.37)×0.6) = ceil(41×0.6) = 25 （旧なら30へ底上げ）
  check(`小住戸30㎡ 壁PB=${r.wallPb}枚 が旧下限30枚へ底上げされない`, r.wallPb < 30, `wallPb=${r.wallPb}`);
  // GW = ceil(6×2.4×0.5) = 8 （旧下限5は下回らないが、より小さい場合の確認を下で行う）
  const tinyGw = calc({ ...small, partition_wall_length_m: 2 });
  // ceil(2×2.4×0.5) = 3 （旧なら5へ底上げ）
  check(`間仕切2mでGW=${tinyGw.gw}㎡ が旧下限5㎡へ底上げされない`, tinyGw.gw < 5, `gw=${tinyGw.gw}`);
  check('小住戸で抑制警告が出ない（下限撤去は警告を伴わない＝正常値扱い）',
    !r.warnFields.some((f) => /excessive/.test(f)), `warnFields=${r.warnFields.join(',')}`);
}

// ------------------------------------------------------------
// 2. アルファGの不変（回帰）: 旧クランプ帯の内側にあった値が変わらないこと
//    ※ 展開図ありの本番経路では applyElevationTakeoff がこの4部位を実測置換するため
//      本ガードは効かない（eval-gtype-buildup で別途担保）。ここは従来パス（平面図のみ）の回帰。
// ------------------------------------------------------------
console.log('--- 2. アルファGタイプの従来パス出力が不変 ---');
{
  // eval-gtype-buildup.mjs の G_FLOOR_PLAN と同じ読み取り値
  const G = {
    _validated: true, layout_type: '3LDK',
    total_floor_area_sqm: 67.3,
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
  const r = calc(G);
  // 変更前の実測値（2026-07-24に git stash で置換前コードを実行して採取した実出力）:
  //   壁PB 54枚 / 耐水PB 6枚 / 巾木 54m / GW 15㎡
  // 式の確認（床面積は部屋合計64.69㎡。declared 67.3 の netTarget=64.61 < 64.69 なので補填は起きない）:
  //   壁PB   = ceil(ceil(64.69×1.37)×0.6) = ceil(89×0.6) = 54枚（旧クランプ[30,90]内＝不変）
  //   耐水PB = ceil((2.9+1.33+2.87)÷1.6562×1.2) = 6枚（旧クランプ[2,7]内＝不変）
  //   巾木   = max(ceil(64.69×0.82), 50) = 54m（旧クランプ[30,60]内＝不変）
  //   GW     = ceil(19.8×2.4×0.135) = 7㎡（充填率をアルファ基準へ是正。XLS正解6.425㎡＝+9%）
  check('アルファG 壁PB=54枚（置換前と同値・クランプ帯内だったため不変）', r.wallPb === 54, `wallPb=${r.wallPb}`);
  check('アルファG 耐水PB=6枚（置換前と同値）', r.waterPb === 6, `waterPb=${r.waterPb}`);
  check('アルファG 巾木=54m（置換前と同値）', r.habaki === 54, `habaki=${r.habaki}`);
  check('アルファG 従来パスで抑制警告が出ない', !r.warnFields.some((f) => /excessive|floor_area_inflated/.test(f)),
    `warnFields=${r.warnFields.join(',')}`);
  check(`アルファG GW=${r.gw}㎡（旧15㎡の頭打ち撤去＋充填率0.135化。XLS正解6.425㎡）`,
    r.gw === Math.ceil(19.8 * 2.4 * GW_COVERAGE_DEFAULT), `gw=${r.gw}`);
}

// ------------------------------------------------------------
// 2-b. **実fixture4本**でのGW実測（M-3: 合成入力で悪化を隠さない）
//   セクション2の入力は間仕切19.8mの合成値で、実際のAI読み取り結果（fixture）より小さい。
//   実運用で出る数量は fixture の partition_wall_length_m（15.7〜29.0m）で決まるため、
//   **上限撤去の影響は実fixtureの値で固定する**。
//   経緯: 上限だけ撤去した第1版は 15㎡（頭打ち）→ 35/25/31/19㎡ となり、
//     XLS正解6.425㎡に対し +196〜445% へ悪化していた（旧15㎡でも+133%）。
//     原因は上限ではなく充填率0.5が物件依存だったこと → 既定をアルファ基準0.135へ。
// ------------------------------------------------------------
console.log('--- 2-b. 実fixture4本のGW（合成入力ではなく実際の読み取り結果） ---');
{
  const ALPHA_G_GW_TRUTH = 6.425; // 'Ａタイプ'!P113/P221/P275（LDK↔洋1 1450 + LDK↔洋3 1050 の片面）
  const FIXTURES = [
    'gtype_parsedData.json', 'gtype_parsedData_p2.json',
    'gtype_parsedData_p2v2.json', 'gtype_parsedData_p3.json',
  ];
  for (const f of FIXTURES) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    const r = calc(data);
    const expected = Math.ceil((data.partition_wall_length_m) * (data.ceiling_height_mm / 1000) * GW_COVERAGE_DEFAULT);
    const pct = ((r.gw / ALPHA_G_GW_TRUTH) - 1) * 100;
    // 実装式どおりの値であること（＝この数字が実運用で出る）を固定する。
    // 正解比は情報として表示（±10%に入る保証はしない＝推定式の精度は別軸）
    check(`${f} GW=${r.gw}㎡（間仕切${data.partition_wall_length_m}m×CH${data.ceiling_height_mm / 1000}×${GW_COVERAGE_DEFAULT}）正解6.425㎡比 ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`,
      r.gw === expected, `gw=${r.gw} expected=${expected}`);
    // 上限撤去だけをやった第1版の値（35/25/31/19㎡）へ戻らないことの回帰ガード
    check(`${f} GWが充填率0.5相当（第1版の悪化値）に戻っていない`,
      r.gw < Math.ceil(data.partition_wall_length_m * (data.ceiling_height_mm / 1000) * 0.5),
      `gw=${r.gw}`);
  }
  // 別府のように全間仕切へ充填する物件は override で切り替える（既定は動かさない）
  const beppuStyle = calc(beppuLike('G'), { glasswool_coverage: '0.5' });
  const beppuDefault = calc(beppuLike('G'));
  check(`overrides.glasswool_coverage=0.5 でGWが既定${beppuDefault.gw}㎡→${beppuStyle.gw}㎡へ切替わる（別府実測53.6㎡帯）`,
    beppuStyle.gw > beppuDefault.gw * 2, `default=${beppuDefault.gw} override=${beppuStyle.gw}`);
  const badCoverage = calc(beppuLike('G'), { glasswool_coverage: 'ぜんぶ' });
  check('不正な充填率指定は既定へフォールバックし警告 glasswool_coverage_invalid が出る',
    badCoverage.gw === beppuDefault.gw && badCoverage.warnFields.includes('glasswool_coverage_invalid'),
    `gw=${badCoverage.gw} warnFields=${badCoverage.warnFields.join(',')}`);
}

// ------------------------------------------------------------
// 3. 展開図ありの本番経路ではこの4部位が実測置換される（従来パスの推定値は表に出ない）
//    ＝ アルファGのeval数値がこの変更の影響を受けないことの構造的な裏取り。
// ------------------------------------------------------------
console.log('--- 3. 展開図実測が4部位を上書きする（アルファG evalが不変な理由） ---');
{
  const { applyElevationTakeoff } = await import('../src/services/buildupCalculator.js');
  const base = calculateMaterials({
    _validated: true, layout_type: '3LDK', total_floor_area_sqm: 67.3,
    partition_wall_length_m: 19.8, ceiling_height_mm: 2400,
    rooms: [{ name: 'リビング・ダイニング', area_sqm: 67.3, floor_type: 'flooring' }],
    openings: [], equipment: {},
  }, {}, {});
  // 実測takeoff（値はアルファGのXLS正解相当。ここでは「上書きが効くか」だけを見る）
  const takeoff = {
    wall_pb_sqm: 122.06, waterproof_pb_sqm: 6.45, ev_wall_pb_sqm: 0,
    sound_wall_pb_sqm: 12.85, kitchen_panel_sqm: 3.48, gw_sqm: 6.43,
    cloth_sqm: 200, skirting_m: { 木製: 60.5, 樹脂: 3.75 },
    majikiri_shitaji_m: 77.5, rc_furring_sqm: 7.61,
  };
  const applied = applyElevationTakeoff(base, takeoff);
  const q = (n) => applied.materials.find((m) => m.name === n)?.quantity;
  check('壁PBが実測置換される（推定56枚→実測122.06÷1.4=88枚）', q(ROWS.wallPb) === Math.ceil(122.06 / 1.4),
    `wallPb=${q(ROWS.wallPb)}`);
  check('耐水PBが実測置換される', q(ROWS.waterPb) === Math.ceil(6.45 / 1.4), `waterPb=${q(ROWS.waterPb)}`);
  check('巾木が実測置換される（推定→実測60.5m）', q(ROWS.habaki) === 61, `habaki=${q(ROWS.habaki)}`);
  check('GWが実測置換される（推定24㎡→実測6.43㎡）', q(ROWS.gw) === 6, `gw=${q(ROWS.gw)}`);
}

// ------------------------------------------------------------
// 4. 暴走の捕捉: 外形寸法誤読で床面積が水増しされたケース（旧クランプが担っていた役割）
//    部屋合計65㎡が正しく読めているのに total=200㎡ に水増しされた実バグ形状。
//    total_area_source='outer_dimensions'（未検証）かつ declared>150㎡ → sanityBase=roomsSumArea=65。
// ------------------------------------------------------------
console.log('--- 4. 誤読200㎡の暴走が止まる（旧クランプの安全弁を代替） ---');
{
  const misread = {
    layout_type: '3LDK',
    total_floor_area_sqm: 200,             // 誤読値
    total_area_source: 'outer_dimensions', // 未検証
    total_floor_area_needs_review: true,
    partition_wall_length_m: 20, ceiling_height_mm: 2400,
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
  const r = calc(misread);
  check('誤読200㎡で床面積水増し警告 floor_area_inflated が出る',
    r.warnFields.includes('floor_area_inflated'), `warnFields=${r.warnFields.join(',')}`);
  // ガード無しなら 壁PB165枚 / 巾木164m。sanityBase=65㎡ベースで算出し直される:
  //   壁PB = ceil(ceil(65×1.37)×0.6) = ceil(90×0.6) = 54枚
  //   巾木 = max(ceil(65×0.82), 50) = 54m
  check(`誤読200㎡ 壁PB=${r.wallPb}枚 が暴走しない（旧上限90枚以下・部屋合計65㎡ベース）`,
    r.wallPb === Math.ceil(Math.ceil(65 * 1.37) * 0.6), `wallPb=${r.wallPb}`);
  check(`誤読200㎡ 巾木=${r.habaki}m が暴走しない（部屋合計65㎡ベース）`,
    r.habaki === Math.max(Math.ceil(65 * 0.82), 50), `habaki=${r.habaki}`);
  const w = r.warnings.find((x) => x.field === 'floor_area_inflated');
  // before は「抑制しなければ使われていた床面積」＝ netTarget（declared 200×0.96=192）。
  // declaredそのもの(200)ではなく、実際に数量計算へ入る値を出す（根拠欄と一致させるため）
  check('床面積水増し警告に before(抑制前192㎡=200×0.96) / after(採用値65㎡) が入っている',
    w && w.before === 192 && w.after === 65, `warning=${JSON.stringify(w)}`);
  // 根拠欄も抑制後の床面積に揃う（Excelの根拠列に矛盾表示を残さない）
  check('壁PBの根拠欄が抑制後の床面積65.0㎡になっている',
    r.note(ROWS.wallPb).includes('65.0㎡'), `note=${r.note(ROWS.wallPb)}`);
  check('巾木の根拠欄が抑制後の床面積65.0㎡になっている',
    r.note(ROWS.habaki).includes('65.0㎡'), `note=${r.note(ROWS.habaki)}`);
}

// ------------------------------------------------------------
// 5. 誤発火しないこと（false positive防止）
//    5-a: 拾い落ち補填（信頼済み専有67㎡・部屋合計40㎡）で floor_area_inflated が出ない
//    5-b: 未検証だが妥当な大きさ(≤150㎡)のdeclaredは分母として信頼する
// ------------------------------------------------------------
console.log('--- 5. 誤発火しない（拾い落ち補填・未検証だが妥当な専有面積） ---');
{
  const shortRooms = {
    layout_type: '3LDK',
    total_floor_area_sqm: 67, total_area_source: 'user_input',
    partition_wall_length_m: 20, ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 20, floor_type: 'flooring' },
      { name: '洋室(1)', area_sqm: 12, floor_type: 'flooring' },
      { name: '洋室(2)', area_sqm: 8, floor_type: 'flooring' },
    ], // 合計40㎡（廊下・水回り等を拾い落とし）
    openings: [], equipment: {},
  };
  const r = calc(shortRooms);
  check('拾い落ち補填（信頼済み専有）で floor_area_inflated が出ない',
    !r.warnFields.includes('floor_area_inflated'), `warnFields=${r.warnFields.join(',')}`);
  check('拾い落ち補填で部位の抑制警告も出ない',
    !r.warnFields.some((f) => /excessive/.test(f)), `warnFields=${r.warnFields.join(',')}`);

  // 5-b: source無し・部屋合計40㎡・declared=67㎡（妥当な大きさ）→ declaredを信頼（比1.0で通る）
  const noSource = { ...shortRooms };
  delete noSource.total_area_source;
  const r2 = calc(noSource);
  check('source無し・妥当なdeclared(67㎡)でも誤発火しない（declaredを分母に信頼）',
    !r2.warnFields.includes('floor_area_inflated'), `warnFields=${r2.warnFields.join(',')}`);
}

// ------------------------------------------------------------
// 6. 部位ごとの物理上限が効くこと（床面積は正しいが部位の入力が壊れているケース）
//    床面積の誤読ではないので floor_area_inflated では捕まらない。
//    6-a: 間仕切壁延長が異常（ユーザー上書きでクランプを免れる経路）→ GWが暴走
//    6-b: 水回り面積が異常（水回り部屋の面積誤読）→ 耐水PBが暴走
// ------------------------------------------------------------
console.log('--- 6. 部位ごとの物理上限（入力が壊れたときの第2の防波堤） ---');
{
  // 6-a: 専有67㎡は正しいが、間仕切壁延長のユーザー上書きが500m（=図面の全線長を足した類の誤入力）。
  //   overrides.partition_wall_length はクランプ対象外（ユーザー入力尊重）なのでそのまま通る。
  //   GW生値 = ceil(500×2.4×0.135) = 162㎡ → 上限 67×1.2 = ceil(80.4)=81㎡ で抑制されるはず
  //   ※ 第1版は充填率0.5で200m→240㎡だった。M-3で既定を0.135にしたぶん、
  //     同じ上限に当たるのに必要な誤入力量が増えている（＝しきい値の位置は充填率に比例）
  const base = {
    _validated: true, layout_type: '3LDK',
    total_floor_area_sqm: 67, total_area_source: 'user_input',
    partition_wall_length_m: 20, ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 60, floor_type: 'flooring' },
      { name: 'トイレ', area_sqm: 7 },
    ],
    openings: [], equipment: {},
  };
  const r = calc(base, { partition_wall_length: '500' });
  const expectedCap = Math.ceil(67 * GW_MAX_RATIO);
  const rawGw = Math.ceil(500 * 2.4 * GW_COVERAGE_DEFAULT);
  check(`間仕切壁500m誤入力でGWが上限${expectedCap}㎡に抑制される`, r.gw === expectedCap,
    `gw=${r.gw} expected=${expectedCap}`);
  check('GW抑制で警告 glasswool_area_excessive が出る',
    r.warnFields.includes('glasswool_area_excessive'), `warnFields=${r.warnFields.join(',')}`);
  const w = r.warnings.find((x) => x.field === 'glasswool_area_excessive');
  check(`GW抑制警告に before(${rawGw}) / after(${expectedCap}) が入っている`,
    w && w.before === rawGw && w.after === expectedCap, `warning=${JSON.stringify(w)}`);

  // 6-b: 水回りの面積が異常（トイレ60㎡と誤読）→ 耐水PB生値 = ceil(60÷1.6562×1.2)=44枚
  //   上限 = ceil(67 × 0.4/1.6562) = ceil(16.2) = 17枚
  const wetMisread = {
    _validated: true, layout_type: '3LDK',
    total_floor_area_sqm: 67, total_area_source: 'user_input',
    partition_wall_length_m: 20, ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 7, floor_type: 'flooring' },
      { name: 'トイレ', area_sqm: 60 },
    ],
    openings: [], equipment: {},
  };
  const r2 = calc(wetMisread);
  const expectedWaterCap = Math.ceil(67 * WATER_PB_MAX_RATIO);
  check(`水回り60㎡誤読で耐水PBが上限${expectedWaterCap}枚に抑制される`, r2.waterPb === expectedWaterCap,
    `waterPb=${r2.waterPb} expected=${expectedWaterCap}`);
  check('耐水PB抑制で警告 waterproof_pb_sheets_excessive が出る',
    r2.warnFields.includes('waterproof_pb_sheets_excessive'), `warnFields=${r2.warnFields.join(',')}`);
}

// ------------------------------------------------------------
// 7. 分母が全く無い場合の絶対上限（部屋も専有面積も拾えていない）
//    比率で捕捉できないため絶対上限が最終防波堤になる。
//    上限は実在最大物件（別府I 床≈117㎡）を弾かない高さに置いてある。
// ------------------------------------------------------------
console.log('--- 7. 分母無しの絶対上限（最終防波堤） ---');
{
  // 部屋なし・専有面積なし → totalFloorArea=0 → sanityBase=0。
  // このとき床面積由来の部位は0になるので、GWだけが partition_wall_length_m で暴走しうる。
  const roomless = {
    layout_type: '3LDK',
    partition_wall_length_m: 500,  // 異常値（AIが図面の全線長を足した等）
    ceiling_height_mm: 2400,
    rooms: [], openings: [], equipment: {},
  };
  const r = calc(roomless);
  // GW生値 = ceil(500×2.4×0.5) = 600㎡ → 絶対上限150㎡
  check('分母無しでGWが絶対上限150㎡に抑制される', r.gw === 150, `gw=${r.gw}`);
  check('分母無しGW抑制で警告が出る', r.warnFields.includes('glasswool_area_excessive'),
    `warnFields=${r.warnFields.join(',')}`);
  const w = r.warnings.find((x) => x.field === 'glasswool_area_excessive');
  check('絶対上限の警告に上限値が明記される', w && /150/.test(w.message), `warning=${JSON.stringify(w)}`);
}

// ------------------------------------------------------------
// 7-b. 耐水PBの下限撤去の副作用対応:
//   下限2枚の撤去自体は正しい（別府H=2.49枚のように旧下限すれすれの実測がある）。
//   ただし旧下限は「水回りを1つも読めなかった（cfArea=0）」ときに0枚を出さない役割も
//   兼ねていた。住戸に浴室・便所は必ずあり0枚は物理的にありえない（実測最小2.49枚）ので、
//   **cfArea=0のときだけ**実績最小2枚を仮置き+警告する。読めた小さな値は底上げしない。
// ------------------------------------------------------------
console.log('--- 7-b. 耐水PB: 水回りを読めなかった場合のみ仮置き（読めた小値は底上げしない） ---');
{
  // 7-b-1: 水回りの部屋が1つも無い（AIの読み落とし）→ 2枚+警告
  const noWet = {
    _validated: true, layout_type: '2LDK',
    total_floor_area_sqm: 55, total_area_source: 'user_input',
    partition_wall_length_m: 18, ceiling_height_mm: 2400,
    rooms: [{ name: 'リビング・ダイニング', area_sqm: 55, floor_type: 'flooring' }],
    openings: [], equipment: {},
  };
  const r = calc(noWet);
  check('水回り未読(cfArea=0)で耐水PB=2枚が仮置きされる（0枚を出さない）', r.waterPb === 2,
    `waterPb=${r.waterPb}`);
  check('水回り未読で警告 waterproof_pb_no_wet_room が出る',
    r.warnFields.includes('waterproof_pb_no_wet_room'), `warnFields=${r.warnFields.join(',')}`);
  check('水回り未読の根拠欄に「仮置き」が明記される', /仮置き/.test(r.note(ROWS.waterPb)),
    `note=${r.note(ROWS.waterPb)}`);
  const w = r.warnings.find((x) => x.field === 'waterproof_pb_no_wet_room');
  check('水回り未読の警告に before(0) / after(2) が入っている', w && w.before === 0 && w.after === 2,
    `warning=${JSON.stringify(w)}`);

  // 7-b-2: 水回りが小さいが読めている → 底上げしない（旧下限2枚の復活ではないことの確認）
  //   トイレ0.5㎡のみ → ceil(0.5÷1.6562×1.2) = 1枚。旧なら2枚へ底上げされていた
  const tinyWet = {
    ...noWet,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 54.5, floor_type: 'flooring' },
      { name: 'トイレ', area_sqm: 0.5 },
    ],
  };
  const r2 = calc(tinyWet);
  check(`水回り0.5㎡で耐水PB=${r2.waterPb}枚（旧下限2枚へ底上げされない）`, r2.waterPb === 1,
    `waterPb=${r2.waterPb}`);
  check('読めた小値では仮置き警告を出さない',
    !r2.warnFields.includes('waterproof_pb_no_wet_room'), `warnFields=${r2.warnFields.join(',')}`);
}

// ------------------------------------------------------------
// 8. 上限比が実在物件を弾かないことの明示的な確認（閾値の妥当性）
//    別府9タイプ+アルファGの**実測値そのもの**が上限比の内側にあること。
//    ＝「正解に一致させる閾値」ではなく「実在値を弾かない閾値」であることの裏取り。
// ------------------------------------------------------------
console.log('--- 8. 上限比が実在物件の実測を弾かない ---');
{
  // アルファG（'Ａタイプ'シート戸当・専有67.3㎡）
  const ALPHA_G = { floor: 67.3, wallPbSqm: 122.0609, soundPbSqm: 12.9785, waterSqm: 6.4535, habakiM: 56.44, gwSqm: 6.425 };
  // 壁PB上限は「壁ボード総量/床面積」で置いている（一般壁PBはこれを超えられない）
  const alphaTotalBoard = (ALPHA_G.wallPbSqm + ALPHA_G.soundPbSqm + ALPHA_G.waterSqm) / ALPHA_G.floor;
  check(`アルファG 壁ボード総量比 ${alphaTotalBoard.toFixed(2)}㎡/㎡ が上限2.5以下`,
    alphaTotalBoard <= 2.5, `ratio=${alphaTotalBoard}`);
  check(`アルファG GW比 ${(ALPHA_G.gwSqm / ALPHA_G.floor).toFixed(2)}㎡/㎡ が上限1.2以下`,
    ALPHA_G.gwSqm / ALPHA_G.floor <= GW_MAX_RATIO);
  check(`アルファG 耐水比 ${(ALPHA_G.waterSqm / ALPHA_G.floor).toFixed(2)}㎡/㎡ が上限0.4以下`,
    ALPHA_G.waterSqm / ALPHA_G.floor <= 0.4);

  for (const t of TYPES) {
    const p = TRUTH.types[t].parts;
    const floor = floorSqmOf(t);
    // capを持つ2部位（GW・耐水PB）の実測が上限比の内側にあること
    check(`別府${t} GW ${(p['間仕切GW'].area_or_length / floor).toFixed(2)} / 耐水 ${(p['壁耐水PB'].area_or_length / floor).toFixed(2)} が上限内（1.2 / 0.4）`,
      p['間仕切GW'].area_or_length / floor <= GW_MAX_RATIO
      && p['壁耐水PB'].area_or_length / floor <= 0.4,
      `gw=${(p['間仕切GW'].area_or_length / floor).toFixed(3)}`);
  }
  void ALPHA_G.habakiM; void alphaTotalBoard; // 壁PB・巾木は部位capを持たない（M-2）
}

// ------------------------------------------------------------
// 9. 【M-2の核心】ガードが「死んでいない」ことの総当たり検証。
//    第1版は壁PB・巾木にも床面積比のcapを置いたが、出力が床面積の固定倍だったため
//    比が常に一定（54%・55%）で**一度も発火しない死んだガード**だった。
//    ここでは (a) 撤去した2部位に死んだcapが残っていないこと
//            (b) 残した2部位のcapは異常入力で実際に発火すること
//            (c) 正常入力では発火しないこと（誤発火なし）
//    を総当たり（床面積×間仕切壁×水回り比×天井高）で数値的に示す。
// ------------------------------------------------------------
console.log('--- 9. 総当たり: 死んだガードが無い / 異常入力は止まる / 正常入力は止まらない ---');
{
  const FLOORS = [20, 35, 50, 67, 85, 100, 117, 150];
  const PARTS = [5, 15, 30, 60, 120, 200, 300];
  const WETS = [0, 0.05, 0.1, 0.2, 0.33, 0.5, 0.9];
  const CHS = [2200, 2400, 2700, 3000];
  const counts = new Map();
  let total = 0;
  const bump = (f) => counts.set(f, (counts.get(f) || 0) + 1);
  for (const floor of FLOORS) for (const part of PARTS) for (const wet of WETS) for (const ch of CHS) {
    total++;
    const wetA = floor * wet;
    const rooms = [{ name: 'リビング・ダイニング', area_sqm: floor - wetA, floor_type: 'flooring' }];
    if (wetA > 0) rooms.push({ name: 'トイレ', area_sqm: wetA });
    const r = calc({
      _validated: true, layout_type: '3LDK',
      total_floor_area_sqm: floor, total_area_source: 'user_input',
      partition_wall_length_m: part, ceiling_height_mm: ch,
      rooms, openings: [], equipment: {},
    });
    for (const f of r.warnFields) bump(f);
  }
  console.log(`    総当たり ${total}件（床${FLOORS.length}×間仕切${PARTS.length}×水回り${WETS.length}×CH${CHS.length}）の警告発火数:`);
  for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`      ${String(v).padStart(5)} ${k}`);

  // (a) 撤去した2部位のcap警告は**存在しない**（死んだガードを残していない）
  check('壁PBの部位cap警告 wall_pb_sheets_excessive は存在しない（撤去済み・死んだガードを残さない）',
    !counts.has('wall_pb_sheets_excessive'), `count=${counts.get('wall_pb_sheets_excessive')}`);
  check('巾木の部位cap警告 habaki_length_excessive は存在しない（撤去済み・間取り最低値の誤発火も消えた）',
    !counts.has('habaki_length_excessive'), `count=${counts.get('habaki_length_excessive')}`);

  // (b) 残した2部位のcapは実際に発火する（生きたガードであること）
  check(`耐水PBのcapが発火する（${counts.get('waterproof_pb_sheets_excessive') || 0}件）`,
    (counts.get('waterproof_pb_sheets_excessive') || 0) > 0);
  check(`GWのcapが発火する（${counts.get('glasswool_area_excessive') || 0}件）`,
    (counts.get('glasswool_area_excessive') || 0) > 0);

  // (c) 発火の境界が「物理的にありえない入力」側にあること（誤発火していない）
  //   耐水PB: 水回りが床の1/3を超えたときだけ発火（アルファGの実測は10.5%）
  const wetCase = (wet) => calc({
    _validated: true, layout_type: '3LDK', total_floor_area_sqm: 67, total_area_source: 'user_input',
    partition_wall_length_m: 20, ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 67 * (1 - wet), floor_type: 'flooring' },
      { name: 'パウダールーム', area_sqm: 67 * wet },
    ], openings: [], equipment: {},
  });
  check('耐水PB: 水回り10%（アルファG実測10.5%相当）では発火しない',
    !wetCase(0.10).warnFields.includes('waterproof_pb_sheets_excessive'));
  check('耐水PB: 水回り30%（かなり大きい水回り）でもまだ発火しない',
    !wetCase(0.30).warnFields.includes('waterproof_pb_sheets_excessive'));
  check('耐水PB: 水回り40%（住戸としてありえない）で発火する',
    wetCase(0.40).warnFields.includes('waterproof_pb_sheets_excessive'));
  //   GW: 間仕切壁延長が床面積比で異常に長いときだけ発火
  const partCase = (part) => calc({
    _validated: true, layout_type: '3LDK', total_floor_area_sqm: 67, total_area_source: 'user_input',
    partition_wall_length_m: part, ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 60, floor_type: 'flooring' },
      { name: 'トイレ', area_sqm: 7 },
    ], openings: [], equipment: {},
  });
  //   発火条件は part/floor > 1.2/(CH×充填率)。既定(CH2.4・0.135)なら 3.70m/㎡＝
  //   3LDK実績帯（25m/67㎡=0.37m/㎡）の**10倍**で、暴走入力だけを捕まえる位置にある。
  //   充填率を上げる物件（別府 0.5）ではしきい値が1.00m/㎡へ自動的に締まる（比例するため）。
  check('GW: 間仕切30m（3LDK実績帯20〜30m）では発火しない',
    !partCase(30).warnFields.includes('glasswool_area_excessive'));
  check('GW: 間仕切200m（実績帯の8倍）でもまだ発火しない（既定の充填率0.135では上限内）',
    !partCase(200).warnFields.includes('glasswool_area_excessive'));
  check('GW: 間仕切300m（床67㎡に対し4.5m/㎡＝図面の全線長を足した類の誤入力）で発火する',
    partCase(300).warnFields.includes('glasswool_area_excessive'));
  check('GW: 充填率0.5の物件では間仕切200mで発火する（しきい値が充填率に比例して締まる）',
    calc({
      _validated: true, layout_type: '3LDK', total_floor_area_sqm: 67, total_area_source: 'user_input',
      partition_wall_length_m: 200, ceiling_height_mm: 2400,
      rooms: [
        { name: 'リビング・ダイニング', area_sqm: 60, floor_type: 'flooring' },
        { name: 'トイレ', area_sqm: 7 },
      ], openings: [], equipment: {},
    }, { glasswool_coverage: '0.5' }).warnFields.includes('glasswool_area_excessive'));
}

// ------------------------------------------------------------
// 10. 【M-1】層1の発火時に**全部位が同じ床面積基準**になること。
//    旧実装は sanityFloorArea を壁PB・巾木だけに使い、天井PB・フローリングは
//    元の（水増しされた）床面積のままだった＝同一図面で基準が食い違う見積が出ていた。
//    発火条件: ユーザー入力65㎡ vs ㎡ラベル部屋合計85㎡（validatorの按分はラベル部屋を
//    縮小しないので正規経路で残存する）。
// ------------------------------------------------------------
console.log('--- 10. 層1発火時に全部位が同じ床面積基準になる（M-1） ---');
{
  const labeled = (name, area, floor_type) => ({ name, area_sqm: area, area_source: 'sqm_label', floor_type });
  const inflated = {
    _validated: true, layout_type: '3LDK',
    total_floor_area_sqm: 65, total_area_source: 'user_input', // 信頼できる床面積=65
    partition_wall_length_m: 20, ceiling_height_mm: 2400,
    rooms: [
      labeled('リビング・ダイニング', 30, 'flooring'),
      labeled('洋室(1)', 20, 'flooring'),
      labeled('洋室(2)', 20, 'flooring'),
      labeled('洋室(3)', 12, 'flooring'),
      labeled('トイレ', 3),
    ], // ラベル部屋合計85㎡（按分縮小の対象外）
    openings: [], equipment: {},
  };
  const r = calculateMaterials(inflated, {}, {});
  const warn = (r._warnings || []).find((w) => w.field === 'floor_area_inflated');
  const note = (n) => r.materials.find((m) => m.name === n)?.calculation || '';
  const qty = (n) => r.materials.find((m) => m.name === n)?.quantity;
  check('層1 floor_area_inflated が発火する（構造的に非発火という第1版の想定は誤りだった）',
    !!warn, `warnings=${(r._warnings || []).map((w) => w.field).join(',')}`);
  // 警告文の向き（M-1②）: before=是正前の85 / after=採用値65 で、説明も「85が計算に使う床面積・
  // 65が信頼できる床面積」でなければならない（第1版は「85が床面積・65が部屋合計」と逆だった）
  check('警告の before=85 / after=65（是正前→採用値の向き）', warn && warn.before === 85 && warn.after === 65,
    `warn=${JSON.stringify(warn)}`);
  check('警告文が「65は信頼できる床面積（専有面積の入力）」と正しく説明している',
    warn && /信頼できる床面積\(65\.0㎡・専有面積の入力/.test(warn.message), `msg=${warn?.message}`);
  // 全部位が65ベース: 根拠欄の床面積表記と、面積由来の数量で確認
  check('壁PBの根拠欄が65.0㎡ベース', note('壁 石膏ボード').includes('65.0㎡'), note('壁 石膏ボード'));
  check('巾木の根拠欄が65.0㎡ベース', note('木製巾木').includes('65.0㎡'), note('木製巾木'));
  check('天井PBが65㎡ベース（旧は85㎡ベースのまま＝部位間で矛盾していた）',
    note('天井 石膏ボード').includes('65.0㎡'), note('天井 石膏ボード'));
  // フローリング: 居室（LDK+洋室3室=82㎡）を 65/85 に按分 → 62.7㎡
  const expectedFlooring = (30 + 20 + 20 + 12) * (65 / 85);
  check(`フローリングが按分後の居室床面積${expectedFlooring.toFixed(1)}㎡ベース（旧は82.0㎡のままだった）`,
    note('フローリング').includes(`${expectedFlooring.toFixed(1)}㎡`), note('フローリング'));
  // 天井PB側の二重抑制（ceiling_pb_area_inflated）は層1で床面積が是正されるため出ない
  check('層1で是正済みなので天井PBの重複抑制 ceiling_pb_area_inflated は出ない',
    !(r._warnings || []).some((w) => w.field === 'ceiling_pb_area_inflated'),
    `warnings=${(r._warnings || []).map((w) => w.field).join(',')}`);
  // summary（部位横断の集計）も同じ基準
  check(`summary.floor_area(${r.summary?.floor_area?.toFixed(1)}) が按分後の値で天井面積と整合`,
    Math.abs((r.summary?.floor_area ?? 0) - expectedFlooring) < 0.15,
    `summary=${JSON.stringify(r.summary)}`);
  void qty;
}

// ------------------------------------------------------------
// 11. 【S-3】過少側の警告（数量は書き換えない）
// ------------------------------------------------------------
console.log('--- 11. 過少側は書き換えず警告のみ（S-3） ---');
{
  // 間仕切壁が極端に短い（読み落とし）→ GWが過少になるが数量は書き換えない
  const tiny = {
    _validated: true, layout_type: '3LDK',
    total_floor_area_sqm: 67, total_area_source: 'user_input',
    partition_wall_length_m: 1, ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 60, floor_type: 'flooring' },
      { name: 'トイレ', area_sqm: 7 },
    ],
    openings: [], equipment: {},
  };
  const r = calc(tiny);
  const expected = Math.ceil(1 * 2.4 * GW_COVERAGE_DEFAULT); // = 1㎡
  check(`GW過少で glasswool_area_small が出る（数量は生値${expected}㎡のまま＝書き換えない）`,
    r.warnFields.includes('glasswool_area_small') && r.gw === expected, `gw=${r.gw}`);
  const w = r.warnings.find((x) => x.field === 'glasswool_area_small');
  check('過少警告は before=null / after=生値（書き換えていないことが読み取れる）',
    w && w.before === null && w.after === expected, `warning=${JSON.stringify(w)}`);
  check('過少警告の文面に「書き換えていません」が入っている', w && /書き換えていません/.test(w.message),
    `msg=${w?.message}`);
  // 壁PB・巾木の過少警告も同様に存在する（間取り最低値が効かない間取り不明のケース）
  const noLayout = calc({
    _validated: true, total_floor_area_sqm: 67, total_area_source: 'user_input',
    partition_wall_length_m: 20, ceiling_height_mm: 2400,
    rooms: [{ name: 'リビング・ダイニング', area_sqm: 67, floor_type: 'flooring' }],
    openings: [], equipment: {},
  });
  check('正常な67㎡住戸では過少警告（wall_pb_sheets_small/habaki_length_small）は出ない',
    !noLayout.warnFields.includes('wall_pb_sheets_small')
    && !noLayout.warnFields.includes('habaki_length_small'),
    `warnFields=${noLayout.warnFields.join(',')}`);
}

// ------------------------------------------------------------
// 12. 【M-4】層1が構造的に発火できない2経路（層0の絶対上限で塞ぐ）
//    層1は「計算に使う床面積 vs sanityBase」の**相対比**なので、床面積の根拠が
//    片方しか無いと sanityBase が検査対象**自身**になり比が常に≈1.0＝発火不能だった:
//      X) roomsSum=200㎡(誤読) / declared無し → sanityBase = roomsSumArea = 200（自己参照）
//      Y) rooms 0件 / declared=200㎡(外形誤読) → sanityBase = declaredArea = 200（自己参照）
//    実測（層0導入前の回帰）: X=壁PB165枚/巾木164m・Y=159枚/158m・declared1000㎡で790枚/788m
//    がいずれも**警告ゼロ**で出ていた。特にXは専有面積が任意入力（ゲスト運用の既定は未入力）
//    のため、ユーザーの誤操作なしに到達する。
// ------------------------------------------------------------
console.log('--- 12. 層0: 根拠が片方しか無い経路の暴走を絶対上限で止める（M-4） ---');
{
  const PLAUSIBLE_MAX = 150; // materialCalculator の PLAUSIBLE_MAX_FLOOR_SQM と同値（回帰ガード）
  // X: 部屋合計200㎡の誤読 + 専有面積の入力なし
  const caseX = {
    layout_type: '3LDK', ceiling_height_mm: 2400, partition_wall_length_m: 20,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 120, floor_type: 'flooring' },
      { name: '洋室(1)', area_sqm: 40, floor_type: 'flooring' },
      { name: '洋室(2)', area_sqm: 36.5, floor_type: 'flooring' },
      { name: 'トイレ', area_sqm: 3.5 },
    ], // 合計200㎡・declaredは無し
    openings: [], equipment: {},
  };
  const x = calc(caseX);
  check('X(部屋合計200㎡誤読・専有未入力) で floor_area_implausible が出る（旧は警告ゼロ）',
    x.warnFields.includes('floor_area_implausible'), `warnFields=${x.warnFields.join(',')}`);
  check('X で層1 floor_area_inflated も発火し床面積が是正される',
    x.warnFields.includes('floor_area_inflated'), `warnFields=${x.warnFields.join(',')}`);
  check(`X 壁PB=${x.wallPb}枚 が層0導入前の165枚から抑制される`, x.wallPb < 165, `wallPb=${x.wallPb}`);
  check(`X 巾木=${x.habaki}m が層0導入前の164mから抑制される`, x.habaki < 164, `habaki=${x.habaki}`);
  // 抑制後の値は「層0の150㎡ベース」と「層3の部位絶対上限」の**小さい方**で決まる（式からの論理導出）。
  //   MF-1で層3を追加したため、150㎡ベースの124枚は上限120枚でさらに切られる。
  //   期待値をベタ書きせず min(...) で書くことで、どちらの層が効いたかが式から読み取れる。
  const layer0WallPb = Math.ceil(Math.ceil(PLAUSIBLE_MAX * 1.37) * 0.6); // =124枚
  const layer0Habaki = Math.ceil(PLAUSIBLE_MAX * 0.82);                  // =123m
  check(`X 壁PBが min(層0の150㎡ベース${layer0WallPb}枚, 層3の絶対上限${WALL_PB_ABS_MAX}枚)=${Math.min(layer0WallPb, WALL_PB_ABS_MAX)}枚`,
    x.wallPb === Math.min(layer0WallPb, WALL_PB_ABS_MAX), `wallPb=${x.wallPb}`);
  check(`X 巾木が min(層0の150㎡ベース${layer0Habaki}m, 層3の絶対上限${HABAKI_ABS_MAX}m)=${Math.min(layer0Habaki, HABAKI_ABS_MAX)}m`,
    x.habaki === Math.min(layer0Habaki, HABAKI_ABS_MAX), `habaki=${x.habaki}`);

  // Y: 部屋0件 + declared=200㎡（外形寸法の誤読）
  const y = calc({
    layout_type: '3LDK', ceiling_height_mm: 2400, partition_wall_length_m: 20,
    total_floor_area_sqm: 200, total_area_source: 'outer_dimensions',
    rooms: [], openings: [], equipment: {},
  });
  check('Y(部屋0件・declared=200㎡誤読) で floor_area_implausible が出る（旧は警告ゼロ）',
    y.warnFields.includes('floor_area_implausible'), `warnFields=${y.warnFields.join(',')}`);
  check(`Y 壁PB=${y.wallPb}枚 が層0導入前の159枚から抑制される`, y.wallPb < 159, `wallPb=${y.wallPb}`);
  check(`Y 巾木=${y.habaki}m が層0導入前の158mから抑制される`, y.habaki < 158, `habaki=${y.habaki}`);

  // Z: declared=1000㎡（未検証）→ 上限150㎡へ丸められXと同じ値に収束する
  const z = calc({
    layout_type: '3LDK', ceiling_height_mm: 2400, partition_wall_length_m: 20,
    total_floor_area_sqm: 1000, total_area_source: 'outer_dimensions',
    rooms: [], openings: [], equipment: {},
  });
  check(`Z(declared=1000㎡未検証) 壁PB=${z.wallPb}枚（旧790枚）が min(層0の150㎡ベース, 層3の絶対上限)へ収束`,
    z.wallPb === Math.min(Math.ceil(Math.ceil(PLAUSIBLE_MAX * 1.37) * 0.6), WALL_PB_ABS_MAX), `wallPb=${z.wallPb}`);
  check(`Z 巾木=${z.habaki}m（旧788m）が min(層0の150㎡ベース, 層3の絶対上限)へ収束`,
    z.habaki === Math.min(Math.ceil(PLAUSIBLE_MAX * 0.82), HABAKI_ABS_MAX), `habaki=${z.habaki}`);
  const zw = z.warnings.find((w) => w.field === 'floor_area_implausible');
  check(`Z の警告に before(1000) / after(${PLAUSIBLE_MAX}) が入っている`,
    zw && zw.before === 1000 && zw.after === PLAUSIBLE_MAX, `warning=${JSON.stringify(zw)}`);

  // 層0は「ユーザーが自分で入力した値」は握り潰さない（警告のみ・数量は入力どおり）
  const trustedBig = calc({
    layout_type: '3LDK', ceiling_height_mm: 2400, partition_wall_length_m: 20,
    total_floor_area_sqm: 1000, total_area_source: 'user_input',
    rooms: [], openings: [], equipment: {},
  });
  check('ユーザー入力1000㎡は数量を書き換えず floor_area_implausible_trusted の警告のみ',
    trustedBig.warnFields.includes('floor_area_implausible_trusted')
    && !trustedBig.warnFields.includes('floor_area_implausible'),
    `warnFields=${trustedBig.warnFields.join(',')}`);
  const tw = trustedBig.warnings.find((w) => w.field === 'floor_area_implausible_trusted');
  check('trusted警告は before=null（書き換えていないことが読み取れる）',
    tw && tw.before === null, `warning=${JSON.stringify(tw)}`);

  // 【最重要】層0が実在物件を弾かないこと。別府I(床116.8㎡)・別府H(107.6㎡)は150の内側
  for (const t of TYPES) {
    const r = calc(beppuLike(t));
    check(`別府${t}(床${floorSqmOf(t).toFixed(1)}㎡) で層0の警告が出ない（実在物件を弾かない）`,
      !r.warnFields.some((f) => /implausible/.test(f)), `warnFields=${r.warnFields.join(',')}`);
  }
  // 別府の最大実測（I 壁PB98.4枚・H 巾木106.8m）に相当する出力が通ること
  const bi = calc(beppuLike('I'));
  const bh = calc(beppuLike('H'));
  check(`別府I 壁PB=${bi.wallPb}枚 が98.4枚相当まで出せる（層0で頭打ちしない）`,
    bi.wallPb >= 96, `wallPb=${bi.wallPb}`);
  check(`別府H 巾木=${bh.habaki}m が106.8m相当まで出せる（層0で頭打ちしない）`,
    bh.habaki >= 88, `habaki=${bh.habaki}`);

  // 150〜187.5㎡の帯が層1の許容比(1.25)で素通りしないこと
  //   （層0で sanityBase=150 に丸めた後、totalFloorArea 165 < 150×1.25=187.5 なので
  //     比だけでは是正されない。floorAreaImplausible 時は比を挟まず是正する実装の回帰ガード）
  const band = calc({
    layout_type: '3LDK', ceiling_height_mm: 2400, partition_wall_length_m: 20,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: 150, floor_type: 'flooring' },
      { name: 'トイレ', area_sqm: 15 },
    ], // 合計165㎡（150×1.25=187.5 未満＝比では捕まらない帯）
    openings: [], equipment: {},
  });
  check(`部屋合計165㎡（層1の許容比では捕まらない帯）でも壁PB=${band.wallPb}枚が min(150㎡ベース, 絶対上限)へ是正される`,
    band.wallPb === Math.min(Math.ceil(Math.ceil(PLAUSIBLE_MAX * 1.37) * 0.6), WALL_PB_ABS_MAX)
    && band.warnFields.includes('floor_area_inflated'),
    `wallPb=${band.wallPb} warnFields=${band.warnFields.join(',')}`);
}

// ------------------------------------------------------------
// 13. 【M-4 → MF-1で「境界の掃引」へ再設計】
//    「暴走 かつ 抑制警告なし」が0件であること。
//
//    【なぜ総当たり格子をやめたか（MF-1の教訓・重要）】
//      旧版は DECLS=[0,30,50,67,100,150,200,1000] × ROOMSUMS=[0,20,65,117,200] の
//      **飛び飛びの格子**で回して「silent=0」と報告していたが、これは**偶然**だった。
//      格子で到達できる無警告の最大は壁PB119枚で、判定閾値120のわずか1枚下。
//      格子の外（decl=150, roomsSum=187）には壁PB155枚・巾木154mの完全無警告ケースが実在した。
//      ＝「テストが通る＝穴が無い」ではない。閾値のすぐ近くを刻んで掃かないと意味がない。
//
//    【掃引の設計】層の閾値（PLAUSIBLE_MAX=150 / FLOOR_AREA_MAX_RATIO=1.25）の**境界を跨ぐ**よう
//      decl と roomsSum を連続的に刻む。特に decl=149/150/151 × roomsSum=160/165/180/187 の帯
//      （旧実装が無警告で155枚を出していた帯）を必ず含める。
// ------------------------------------------------------------
console.log('--- 13. 境界の掃引: 暴走かつ無警告 = 0件（MF-1の合格条件） ---');
{
  // decl: 0（未入力）と、層0境界150の前後を1㎡刻みで通過させる連続掃引
  const DECLS = [0];
  for (let d = 60; d <= 210; d += 3) DECLS.push(d);          // 全域を3㎡刻み
  for (let d = 140; d <= 160; d += 1) DECLS.push(d);          // 層0境界(150)の前後は1㎡刻み
  for (const d of [1, 149, 150, 151, 300, 1000, 5000]) DECLS.push(d); // 極値と必須ケース
  // roomsSum: 層1境界（decl×1.25）と層0上限×1.25=187.5 を跨ぐよう連続に刻む
  const ROOMSUMS = [0];
  for (let r = 20; r <= 240; r += 4) ROOMSUMS.push(r);        // 全域を4㎡刻み
  for (let r = 155; r <= 195; r += 1) ROOMSUMS.push(r);       // 187.5近傍は1㎡刻み
  for (const r of [117, 160, 165, 180, 187]) ROOMSUMS.push(r); // 別府I実測と必須ケース
  const SOURCES = [undefined, 'user_input', 'outer_dimensions', 'ai_estimate',
    'ai_label_roomsum_verified', 'ai_estimate_verified', 'outer_dimension_anchor'];
  const PARTS = [0, 20, 60, 300];
  // 「抑制/是正が働いた」と認めるフィールド（層0・層1・部位cap・絶対上限）
  const SUPPRESS = /floor_area_inflated|floor_area_implausible|excessive|absolute_cap/;
  // 暴走の定義（レビュアーの基準）: 実在物件の実測上限（壁PB98.4枚・巾木106.9m）を
  //   明らかに超える値。部位絶対上限（120枚/130m）と同じ値に揃えてある。
  const RUNAWAY_WALL = WALL_PB_ABS_MAX, RUNAWAY_HABAKI = HABAKI_ABS_MAX;
  let total = 0, runaway = 0, silent = 0, maxUntrustedWallPb = 0, maxUntrustedHabaki = 0;
  let maxSilentWallPb = 0, maxSilentHabaki = 0;
  const silentCases = [];
  for (const decl of DECLS) for (const roomsSum of ROOMSUMS) for (const source of SOURCES) for (const part of PARTS) {
    total++;
    const wet = roomsSum * 0.1;
    const rooms = [];
    if (roomsSum > 0) {
      rooms.push({ name: 'リビング・ダイニング', area_sqm: roomsSum - wet, floor_type: 'flooring' });
      rooms.push({ name: 'トイレ', area_sqm: wet });
    }
    const data = {
      layout_type: '3LDK', ceiling_height_mm: 2400,
      partition_wall_length_m: part, rooms, openings: [], equipment: {},
    };
    if (decl > 0) data.total_floor_area_sqm = decl;
    if (source) data.total_area_source = source;
    const r = calc(data);
    const isRunaway = r.wallPb > RUNAWAY_WALL || r.habaki > RUNAWAY_HABAKI;
    if (source !== 'user_input') {
      maxUntrustedWallPb = Math.max(maxUntrustedWallPb, r.wallPb);
      maxUntrustedHabaki = Math.max(maxUntrustedHabaki, r.habaki);
    }
    const suppressed = r.warnFields.some((f) => SUPPRESS.test(f));
    if (!suppressed) {
      maxSilentWallPb = Math.max(maxSilentWallPb, r.wallPb);
      maxSilentHabaki = Math.max(maxSilentHabaki, r.habaki);
    }
    if (isRunaway) {
      runaway++;
      if (!suppressed) {
        silent++;
        silentCases.push({ decl, roomsSum, source: source || '(none)', part, wallPb: r.wallPb, habaki: r.habaki });
      }
    }
  }
  console.log(`    境界掃引 ${total}件（decl${DECLS.length}値×roomsSum${ROOMSUMS.length}値×source${SOURCES.length}×間仕切${PARTS.length}）`);
  console.log(`      ※ レビュアーの掃引軸(9×8×7×4×2=4032件相当)以上の密度`);
  console.log(`      暴走(壁PB>${RUNAWAY_WALL}枚 or 巾木>${RUNAWAY_HABAKI}m)ケース数: ${runaway}`);
  console.log(`      うち「抑制警告が1つも無い」ケース: ${silent}`);
  console.log(`      無警告で到達しうる最大: 壁PB=${maxSilentWallPb}枚 巾木=${maxSilentHabaki}m`);
  console.log(`      source≠user_input（AIの誤読のみで到達する経路）の最大: 壁PB=${maxUntrustedWallPb}枚 巾木=${maxUntrustedHabaki}m`);
  for (const c of silentCases.slice(0, 10)) console.log(`      無警告暴走: ${JSON.stringify(c)}`);
  check('「暴走かつ抑制警告なし」が0件（MF-1の合格条件）', silent === 0, `silent=${silent}`);
  // 無警告で到達しうる最大が部位絶対上限の内側にあること（=上限が実効的に効いている）
  check(`無警告の壁PB最大=${maxSilentWallPb}枚 が絶対上限${WALL_PB_ABS_MAX}枚以下`,
    maxSilentWallPb <= WALL_PB_ABS_MAX, `max=${maxSilentWallPb}`);
  check(`無警告の巾木最大=${maxSilentHabaki}m が絶対上限${HABAKI_ABS_MAX}m以下`,
    maxSilentHabaki <= HABAKI_ABS_MAX, `max=${maxSilentHabaki}`);
  // ユーザー入力の桁違い（1000㎡等）も部位絶対上限で常識的範囲に収まること（SF-1）
  check(`ユーザー入力経路も含む全体の壁PB最大=${Math.max(maxUntrustedWallPb, maxSilentWallPb)}枚 が絶対上限以下`,
    maxUntrustedWallPb <= WALL_PB_ABS_MAX, `max=${maxUntrustedWallPb}`);
}

// ------------------------------------------------------------
// 13b. 【MF-1】レビュアーが指摘した具体的な帯を名指しで固定する。
//    decl=149/150/151 × roomsSum=160/165/180/187。旧実装ではこの帯で
//    壁PB 155枚 / 巾木 154m が**完全無警告**で出ていた（decl=151で124Wに落ちる非単調性も）。
// ------------------------------------------------------------
console.log('--- 13b. MF-1の名指し帯（decl 149/150/151 × rooms 160/165/180/187） ---');
{
  const SUPPRESS = /floor_area_inflated|floor_area_implausible|excessive|absolute_cap/;
  let bad = 0;
  for (const decl of [149, 150, 151]) for (const roomsSum of [160, 165, 180, 187]) {
    for (const source of [undefined, 'user_input']) {
      const wet = roomsSum * 0.1;
      const data = {
        layout_type: '3LDK', ceiling_height_mm: 2400, partition_wall_length_m: 20,
        total_floor_area_sqm: decl,
        rooms: [
          { name: 'リビング・ダイニング', area_sqm: roomsSum - wet, floor_type: 'flooring' },
          { name: 'トイレ', area_sqm: wet },
        ],
        openings: [], equipment: {},
      };
      if (source) data.total_area_source = source;
      const r = calc(data);
      const suppressed = r.warnFields.some((f) => SUPPRESS.test(f));
      const over = r.wallPb > WALL_PB_ABS_MAX || r.habaki > HABAKI_ABS_MAX;
      if (over || (!suppressed && (r.wallPb > WALL_PB_ABS_MAX || r.habaki > HABAKI_ABS_MAX))) bad++;
      console.log(`      decl=${decl} rooms=${roomsSum} src=${source || '(none)'}`
        + ` → 壁PB=${r.wallPb}枚 巾木=${r.habaki}m 抑制=${suppressed ? 'あり' : 'なし'}`);
    }
  }
  check('名指し帯のいずれも部位絶対上限を超えない（旧: 壁PB155枚・巾木154mが無警告）',
    bad === 0, `over=${bad}`);
}

// ------------------------------------------------------------
// 14. 【MF-1】部位絶対上限が実在物件を弾かないこと（別府9タイプ全数）。
//    上限は「暴走を止める」ためのもので、実測を頭打ちさせたら本末転倒（M-2で撤去した
//    旧クランプ[30,90]枚・[30,60]mと同じ過ちになる）。9タイプ全部で発火しないことを実測する。
// ------------------------------------------------------------
console.log('--- 14. 部位絶対上限が別府9タイプを弾かない（MF-1） ---');
{
  for (const t of TYPES) {
    const r = calc(beppuLike(t));
    const fired = r.warnFields.filter((f) => /absolute_cap/.test(f) && !/ceiling/.test(f));
    check(`別府${t}(床${floorSqmOf(t).toFixed(1)}㎡) 壁PB=${r.wallPb}枚 巾木=${r.habaki}m で部位絶対上限が発火しない`,
      fired.length === 0, `fired=${fired.join(',')}`);
  }
  // 完了条件で名指しされた2件（別府I 壁PB・別府H 巾木）を個別に固定
  const bi = calc(beppuLike('I'));
  const bh = calc(beppuLike('H'));
  check(`別府I 壁PB=${bi.wallPb}枚（実測98.4枚・エンジン97枚）が上限${WALL_PB_ABS_MAX}枚で潰れない`,
    bi.wallPb >= 96 && bi.wallPb <= WALL_PB_ABS_MAX, `wallPb=${bi.wallPb}`);
  check(`別府H 巾木=${bh.habaki}m（実測106.9m・エンジン89m）が上限${HABAKI_ABS_MAX}mで潰れない`,
    bh.habaki >= 88 && bh.habaki <= HABAKI_ABS_MAX, `habaki=${bh.habaki}`);
  // 実測値そのもの（エンジン出力ではなくXLS戸当）も上限の内側にあること
  const truthWallMax = Math.max(...TYPES.map((t) => TRUTH.types[t].parts['壁PB'].area_or_length / 1.4));
  const truthHabakiMax = Math.max(...TYPES.map((t) => TRUTH.types[t].parts['巾木'].area_or_length));
  check(`別府実測max 壁PB=${truthWallMax.toFixed(1)}枚 < 上限${WALL_PB_ABS_MAX}枚（余裕${(WALL_PB_ABS_MAX / truthWallMax).toFixed(2)}倍）`,
    truthWallMax < WALL_PB_ABS_MAX, `truthMax=${truthWallMax}`);
  check(`別府実測max 巾木=${truthHabakiMax.toFixed(1)}m < 上限${HABAKI_ABS_MAX}m（余裕${(HABAKI_ABS_MAX / truthHabakiMax).toFixed(2)}倍）`,
    truthHabakiMax < HABAKI_ABS_MAX, `truthMax=${truthHabakiMax}`);
}

// ------------------------------------------------------------
// 15. 【MF-1・SF-1】上限発火時の副作用チェック。
//    (a) 桁違いのユーザー入力も常識的範囲に収まる（SF-1: 旧は790枚・最大3947枚）
//    (b) 上限で書き換えた値を「過少」と鳴らさない（自作自演の矛盾警告の防止）
//    (c) 数量を書き換えたら calculation 列（Excelの根拠）も揃える（S-1と同じ扱い）
// ------------------------------------------------------------
console.log('--- 15. 上限発火時の副作用（SF-1・矛盾警告・根拠欄） ---');
{
  for (const decl of [1000, 5000]) {
    const r = calc({
      layout_type: '3LDK', ceiling_height_mm: 2400, partition_wall_length_m: 20,
      total_floor_area_sqm: decl, total_area_source: 'user_input',
      rooms: [], openings: [], equipment: {},
    });
    check(`ユーザー入力${decl}㎡ でも壁PB=${r.wallPb}枚が上限${WALL_PB_ABS_MAX}枚以下（SF-1。旧は${decl === 1000 ? '790' : '3947'}枚）`,
      r.wallPb <= WALL_PB_ABS_MAX, `wallPb=${r.wallPb}`);
    check(`同 巾木=${r.habaki}m が上限${HABAKI_ABS_MAX}m以下`,
      r.habaki <= HABAKI_ABS_MAX, `habaki=${r.habaki}`);
    check(`同 入力を尊重する層0の警告(floor_area_implausible_trusted)は維持される（人の入力は書き換えない設計）`,
      r.warnFields.includes('floor_area_implausible_trusted'), `warnFields=${r.warnFields.join(',')}`);
    check(`同 上限発火の警告(wall_pb_absolute_cap)が出る（黙って書き換えない）`,
      r.warnFields.includes('wall_pb_absolute_cap'), `warnFields=${r.warnFields.join(',')}`);
    // (b) 上限で切った値を同時に「過少」と鳴らさない
    check(`同 上限で切った値を「過少」と鳴らさない（wall_pb_sheets_small が出ない）`,
      !r.warnFields.includes('wall_pb_sheets_small'), `warnFields=${r.warnFields.join(',')}`);
    check(`同 habaki_length_small も出ない`,
      !r.warnFields.includes('habaki_length_small'), `warnFields=${r.warnFields.join(',')}`);
    // (c) 根拠欄が抑制後の内容に揃っている
    const wnote = r.note(ROWS.wallPb);
    const hnote = r.note(ROWS.habaki);
    check(`同 壁PBの根拠欄が抑制後の文言（"${wnote}"）`,
      /上限/.test(wnote || ''), `note=${wnote}`);
    check(`同 巾木の根拠欄が抑制後の文言（"${hnote}"）`,
      /上限/.test(hnote || ''), `note=${hnote}`);
  }
  // 上限に達しない通常の物件では根拠欄が従来どおりの式であること（回帰）
  const normal = calc(beppuLike('G'));
  check(`別府G（上限未達）の壁PB根拠欄は従来の式のまま: "${normal.note(ROWS.wallPb)}"`,
    /床面積/.test(normal.note(ROWS.wallPb) || '') && !/上限/.test(normal.note(ROWS.wallPb) || ''),
    `note=${normal.note(ROWS.wallPb)}`);
  check(`別府G（上限未達）の巾木根拠欄は従来の式のまま: "${normal.note(ROWS.habaki)}"`,
    /床面積/.test(normal.note(ROWS.habaki) || '') && !/上限/.test(normal.note(ROWS.habaki) || ''),
    `note=${normal.note(ROWS.habaki)}`);
}

console.log(`\n判定: ✅ ${ok} / ✗ ${ng}`);
process.exit(ng > 0 ? 1 : 0);
