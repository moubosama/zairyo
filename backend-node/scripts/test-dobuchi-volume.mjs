/**
 * 木胴縁（一部界壁面）の材積換算のユニット検証（2026-07-24）
 *
 * 【是正の背景 — 相殺誤差だった】
 *   旧実装は eval で -46.0% ⏳ だったが、これは**2つの誤りが打ち消し合った結果**:
 *     ① 材積係数が過少: DOBUCHI_M_PER_SQM(1/0.455) × 断面45×30 = 0.0029670 m³/㎡
 *        XLS実測 0.0098 m³/㎡ に対し -69.7%
 *     ② 拾い面積が過大: rc_furring_sqm（D下地=EV面D14 + 収納内RC面D64）9.77㎡ を投入。
 *        XLS の木胴縁の対象は「界壁面」5.047㎡/戸のみ
 *   → **係数だけ直すと 9.77×0.0098 = 0.0957m³ = 実績0.0537の +78% に反転する**。
 *     このテストはその反転を固定し、片方だけの修正が再発しないようにする。
 *
 * 【XLS原典（両物件の数式まで確認）】
 *   アルファ 集計表 r85「界壁面 ＰＢｔ9.5+木胴縁」
 *     C85 {='Ａタイプ'!P158+P212+P264+P321} = 5.047㎡/戸
 *       内訳: 洋室(3) Ｃ面 'Ａタイプ'!J261×K261 = 0.98×2.45 = 2.401
 *             台所   Ｃ面 'Ａタイプ'!J318×K318 = 1.08×2.45 = 2.646
 *     W85 = 5.047×9戸 = 45.423 / Y85 {=W85*X$86} = 45.423×0.0098 = 0.4451454 m³（AJ列=軸組み）
 *     → 戸当 0.049461 m³/戸
 *   別府   集計表 r85「部分界壁 ｔ9.5+木胴縁」 W85=122.1288 → Y85=1.19686224（X86も0.0098）
 *   見積明細「木胴縁（一部界壁面）」3.6m³/67戸 = 0.0537 m³/戸（A〜H全タイプ平均）
 *
 * 【収納内RC面・EV面を混ぜてはいけない根拠 — 係数差ではなく「集計先の行が違う」（2026-07-24訂正）】
 *   3行とも係数は同じ0.0098だが、集計される行・見積明細の発注行が違う:
 *     r26 EV面      : Y26{=W26*X$27} = 80.955×0.0098 = 0.793359   → AJ26
 *     r73 収納内RC面 : Y73{=W73*X$72} = 67.59 ×0.0098 = 0.662382   → AK73（構造材・天井）
 *     r85 界壁面     : Y85{=W85*X$86} = 45.423×0.0098 = 0.4451454  → AJ85（＝木胴縁の対象）
 *   （旧記述の「EV面は別係数で集計され」は誤り。係数を揃えれば合算してよい、と誤読させる）
 *
 * 実行: node scripts/test-dobuchi-volume.mjs
 */
import {
  computeElevationTakeoff, applyElevationTakeoff, kaibeFaceWidthMm, KAIBE_FACE_HEIGHT_M,
  resolveKaibeWallSqm, KAIBE_WALL_SQM_ALPHA,
} from '../src/services/buildupCalculator.js';
import { dobuchiVolumeM3, DOBUCHI_M3_PER_SQM } from '../src/services/timberVolume.js';
import { calculateMaterials } from '../src/services/materialCalculator.js';

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

// ---- XLS原典の値（このファイル内で二度と手打ちしないよう1箇所に）----
const XLS_KAIBE_SQM_PER_UNIT = 0.98 * 2.45 + 1.08 * 2.45; // = 5.047（'Ａタイプ'!J261×K261 + J318×K318）
const XLS_DOBUCHI_M3_PER_UNIT = 45.423 * 0.0098 / 9;      // = 0.049461（Y85÷9戸）
const MEISAI_M3_PER_UNIT = 3.6 / 67;                      // = 0.053731（見積明細67戸平均）

console.log('--- ① XLS係数と原典の再現 ---');
check('DOBUCHI_M3_PER_SQM は XLS集計表X86 = 0.0098', DOBUCHI_M3_PER_SQM, 0.0098);
near('界壁面の戸当拾い面積 = 5.047㎡（J261/K261 + J318/K318）', XLS_KAIBE_SQM_PER_UNIT, 5.047, 1e-9);
near('5.047㎡ × 0.0098 = XLS Y85÷9戸', dobuchiVolumeM3(XLS_KAIBE_SQM_PER_UNIT), XLS_DOBUCHI_M3_PER_UNIT, 0.0001);
near('XLS原典値は見積明細67戸平均の±10%内（-7.9%）', XLS_DOBUCHI_M3_PER_UNIT, MEISAI_M3_PER_UNIT, MEISAI_M3_PER_UNIT * 0.1);

console.log('\n--- ② 【回帰の要】係数だけ直すと +78% に反転することの固定 ---');
{
  // 旧実装が投入していた拾い面積（Gタイプ実測の rc_furring_sqm = D14 EV側2.16 + D64収納内7.61）
  const OLD_PICKUP_SQM = 9.77;
  const OLD_COEF = (1 / 0.455) * 45 * 30 * 1e-6; // 旧 DOBUCHI_M_PER_SQM × 断面
  near('旧係数は0.0029670（XLS 0.0098の1/3.3）', OLD_COEF, 0.002967, 1e-6);
  // 旧実装の出力 ≒ -46%（相殺の結果）
  near('旧: 過大な拾い×過少な係数 = -46%相当', OLD_PICKUP_SQM * OLD_COEF, MEISAI_M3_PER_UNIT * 0.54, 0.003);
  // 係数だけ直した場合 = +78%（拾い面積を直さないと反転する）
  const coefOnly = OLD_PICKUP_SQM * DOBUCHI_M3_PER_SQM;
  near('係数だけ直すと0.0957m³', coefOnly, 0.0957, 0.001);
  if (coefOnly / MEISAI_M3_PER_UNIT - 1 > 0.5) {
    pass++; console.log(`✅ 係数のみ修正は+${((coefOnly / MEISAI_M3_PER_UNIT - 1) * 100).toFixed(0)}%に反転する（セット修正が必須の証明）`);
  } else {
    fail++; console.log('✗ 係数のみ修正の反転が再現しない（テストの前提が壊れている）');
  }
  // 現行実装 = 拾いも係数もXLS準拠
  const bothFixed = dobuchiVolumeM3(XLS_KAIBE_SQM_PER_UNIT);
  if (Math.abs(bothFixed / MEISAI_M3_PER_UNIT - 1) <= 0.1) {
    pass++; console.log(`✅ 両方直すと${((bothFixed / MEISAI_M3_PER_UNIT - 1) * 100).toFixed(1)}%（±10%内）`);
  } else {
    fail++; console.log(`✗ 両方直しても±10%に入らない: ${bothFixed}`);
  }
}

console.log('\n--- ③ 拾い対象は界壁面のみ（収納内RC面・EV面を混ぜない）---');
{
  // D14（EV側）とD64（収納内RC面）だけの展開図 → 界壁の明示が無いので実測ゼロ
  const elev = { rooms: [
    { name: '玄関・廊下', ceiling_height_mm: 2200, faces: [
      { face: 'C', width_mm: 965, wall_code: 'D14', openings: [] },
    ]},
    { name: 'クロゼット内RC面', ceiling_height_mm: 2345, faces: [
      { face: 'A', width_mm: 1450, wall_code: 'D64', openings: [] },
      { face: 'B', width_mm: 905, wall_code: 'D64', openings: [] },
    ]},
  ]};
  const t = computeElevationTakeoff(elev, []);
  check('D下地はrc_furring_sqmに入る（従来どおり）', t.rc_furring_sqm > 0, true);
  check('D下地は界壁面には入らない（kaibe_furring_sqm=0）', t.kaibe_furring_sqm, 0);
  check('界壁面の実測面数=0', t.kaibe_furring_faces, 0);
}

console.log('\n--- ④ 界壁の明示がある面だけ拾う（面幅からの推測はしない）---');
{
  check('注記なしのC04面は界壁とみなさない', kaibeFaceWidthMm({ width_mm: 2360, wall_code: 'C04' }), 0);
  check('kaibe_width_mm の実測が最優先', kaibeFaceWidthMm({ width_mm: 2360, kaibe_width_mm: 980 }), 980);
  check('is_kaibe=true は面幅を使う', kaibeFaceWidthMm({ width_mm: 1080, is_kaibe: true }), 1080);
  check("part:'界壁' も明示として扱う", kaibeFaceWidthMm({ width_mm: 1080, part: '界壁' }), 1080);
  check('明示があっても幅が無ければ0', kaibeFaceWidthMm({ is_kaibe: true }), 0);

  // XLSと同じ拾い（洋室(3) 0.98m / 台所 1.08m）を与えると 5.047㎡ が再現する
  const elev = { rooms: [
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [
      { face: 'C', width_mm: 2360, wall_code: 'C04', kaibe_width_mm: 980, openings: [] },
    ]},
    { name: 'キッチン', ceiling_height_mm: 2200, faces: [
      { face: 'C', width_mm: 2575, wall_code: 'C04', kaibe_width_mm: 1080, openings: [] },
    ]},
  ]};
  const t = computeElevationTakeoff(elev, []);
  // takeoffの数値は全部位共通で小数第2位に丸められる（computeElevationTakeoff末尾の「丸め」）
  // ため 5.047 → 5.05。許容はその丸め幅に合わせる
  near('界壁面の実測 = XLS 5.047㎡（丸め後5.05）', t.kaibe_furring_sqm, XLS_KAIBE_SQM_PER_UNIT, 0.005);
  check('実測面数=2', t.kaibe_furring_faces, 2);
  near('材積 = XLS Y85÷9戸', dobuchiVolumeM3(t.kaibe_furring_sqm), XLS_DOBUCHI_M3_PER_UNIT, 0.0001);
}

console.log('\n--- ⑤ 界壁高さは物件依存（opts.kaibeWall.height_m で差し替え）---');
{
  check('既定はアルファ実績2.45', KAIBE_FACE_HEIGHT_M, 2.45);
  const elev = { rooms: [
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [
      { face: 'C', width_mm: 2360, kaibe_width_mm: 1000, openings: [] },
    ]},
  ]};
  near('既定2.45: 1.0m×2.45', computeElevationTakeoff(elev, []).kaibe_furring_sqm, 2.45, 0.001);
  // 別府Ａ〜Ｇタイプの界壁面高さ2.72
  near('別府2.72に差し替え可', computeElevationTakeoff(elev, [], { kaibeWall: { height_m: 2.72 } }).kaibe_furring_sqm, 2.72, 0.001);
  // 不正値は既定へフォールバック（0や巨大値でサイレントに壊れない）
  near('不正値(0)は既定へフォールバック', computeElevationTakeoff(elev, [], { kaibeWall: { height_m: 0 } }).kaibe_furring_sqm, 2.45, 0.001);
  near('不正値(99)は既定へフォールバック', computeElevationTakeoff(elev, [], { kaibeWall: { height_m: 99 } }).kaibe_furring_sqm, 2.45, 0.001);
}

console.log('\n--- ⑥ 実測が無いときは推定を維持する（ゼロで上書きしない）---');
{
  const plan = {
    layout_type: '3LDK', total_floor_area_sqm: 67.3, ceiling_height_mm: 2400,
    rooms: [{ name: 'リビング・ダイニング', area_sqm: 16.75, floor_type: 'flooring' }],
  };
  const base = calculateMaterials(plan, {}, {});
  const baseRow = base.materials.find((m) => m.name === '木胴縁（界壁面）');
  near('推定パスは界壁面5.047㎡ベース = XLS原典値', baseRow.quantity, XLS_DOBUCHI_M3_PER_UNIT, 0.0002);

  // 界壁の明示が無い展開図（Gタイプの実データはこの状態）→ 推定を維持し、警告で理由を伝える
  const elev = { rooms: [
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [
      { face: 'C', width_mm: 2360, wall_code: 'C04', openings: [] },
    ]},
  ]};
  const t = computeElevationTakeoff(elev, []);
  const applied = applyElevationTakeoff(JSON.parse(JSON.stringify(base)), t);
  const row = applied.materials.find((m) => m.name === '木胴縁（界壁面）');
  check('実測ゼロでも推定値のまま（0で潰さない）', row.quantity, baseRow.quantity);
  check('理由を警告で明示', (applied._warnings || []).some((w) => w.field === '木胴縁（界壁面）'), true);

  // 界壁の実測がある場合は実測で置換される
  const elev2 = { rooms: [
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [
      { face: 'C', width_mm: 2360, kaibe_width_mm: 980, openings: [] },
    ]},
    { name: 'キッチン', ceiling_height_mm: 2200, faces: [
      { face: 'C', width_mm: 2575, kaibe_width_mm: 1080, openings: [] },
    ]},
  ]};
  const applied2 = applyElevationTakeoff(
    JSON.parse(JSON.stringify(base)), computeElevationTakeoff(elev2, []));
  const row2 = applied2.materials.find((m) => m.name === '木胴縁（界壁面）');
  near('実測ありなら実測で置換', row2.quantity, XLS_DOBUCHI_M3_PER_UNIT, 0.0001);
  check('根拠に界壁面と明記', /界壁面/.test(row2.calculation), true);
}

console.log('\n--- ⑦ 界壁面の拾い面積も物件依存（S-2: 面積のoverride）---');
{
  // 別府 集計表r85「部分界壁 ｔ9.5+木胴縁」の戸当実測（XLSダンプ）。
  // エンジン既定5.047のままだと Ａ+123% / Ｄ+147% / Ｅ+106% / Ｈ-71% / Ｉ-68%、
  // Ｂ/Ｊは界壁が実在しないのに0.0495m³を計上してしまう＝ゴール条件(1)に抵触していた
  const BEPPU_KAIBE_SQM = { A: 2.266, B: 0.000, D: 2.040, E: 2.448, H: 17.332, I: 15.902 };

  check('既定はアルファ実績5.047㎡/戸', KAIBE_WALL_SQM_ALPHA, 5.047);
  check('未設定は既定へ', resolveKaibeWallSqm(undefined), { value: 5.047, source: 'default' });
  check('空文字も未設定扱い', resolveKaibeWallSqm('   '), { value: 5.047, source: 'default' });
  check('0は「界壁なし」の正当な指定（既定へ戻さない）', resolveKaibeWallSqm('0'), { value: 0, source: 'override' });
  check('別府Ａ 2.266を採用', resolveKaibeWallSqm('2.266'), { value: 2.266, source: 'override' });
  check('数値でも受ける', resolveKaibeWallSqm(17.332), { value: 17.332, source: 'override' });
  // 暗黙の文字除去はしない（'-3'→3の符号反転・'2.5'→25の10倍化を起こさない）
  check('負値は不正として既定へ（符号を落として採用しない）',
    resolveKaibeWallSqm('-3'), { value: 5.047, source: 'default', invalid: '-3' });
  check('桁違い(999)は不正として既定へ',
    resolveKaibeWallSqm('999'), { value: 5.047, source: 'default', invalid: '999' });
  check('非数は不正として既定へ',
    resolveKaibeWallSqm('なし'), { value: 5.047, source: 'default', invalid: 'なし' });

  // --- 推定パス（materialCalculator）で overrides.kaibe_wall_sqm が効く ---
  const plan = {
    layout_type: '3LDK', total_floor_area_sqm: 67.3, ceiling_height_mm: 2400,
    rooms: [{ name: 'リビング・ダイニング', area_sqm: 16.75, floor_type: 'flooring' }],
  };
  const qtyOf = (ov) => calculateMaterials(plan, {}, ov)
    .materials.find((m) => m.name === '木胴縁（界壁面）').quantity;

  near('override未設定＝従来どおりXLS原典値（後方互換）', qtyOf({}), XLS_DOBUCHI_M3_PER_UNIT, 0.0002);
  for (const [t, sqm] of Object.entries(BEPPU_KAIBE_SQM)) {
    near(`別府${t} ${sqm}㎡ を指定 → ${sqm}×0.0098`,
      qtyOf({ kaibe_wall_sqm: String(sqm) }), dobuchiVolumeM3(sqm), 1e-9);
  }
  check('別府Ｂ（界壁なし）は0m³＝実在しない材を計上しない', qtyOf({ kaibe_wall_sqm: '0' }), 0);
  {
    const r = calculateMaterials(plan, {}, { kaibe_wall_sqm: '-3' });
    const row = r.materials.find((m) => m.name === '木胴縁（界壁面）');
    near('不正値は既定へフォールバック', row.quantity, XLS_DOBUCHI_M3_PER_UNIT, 0.0002);
    check('不正値は黙って戻さず警告を出す',
      (r._warnings || []).some((w) => w.field === 'kaibe_wall_sqm_invalid'), true);
  }
  {
    const row = calculateMaterials(plan, {}, { kaibe_wall_sqm: '2.266' })
      .materials.find((m) => m.name === '木胴縁（界壁面）');
    check('根拠に物件別指定であることを明示', /物件別指定/.test(row.calculation), true);
  }

  // --- 実測パス（opts.kaibeWall.area_sqm）: 展開図はあるが界壁の明示が無い通常ケース ---
  const elev = { rooms: [
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [
      { face: 'C', width_mm: 2360, wall_code: 'C04', openings: [] },
    ]},
  ]};
  const applyWith = (opts, ov = {}) => {
    const base = calculateMaterials(plan, {}, ov);
    return applyElevationTakeoff(base, computeElevationTakeoff(elev, [], opts))
      .materials.find((m) => m.name === '木胴縁（界壁面）');
  };
  near('opts未指定＝推定（XLS原典値）を維持', applyWith({}).quantity, XLS_DOBUCHI_M3_PER_UNIT, 0.0002);
  near('opts.kaibeWall.area_sqm=2.266（別府Ａ）で推定を差し替え',
    applyWith({ kaibeWall: { area_sqm: 2.266 } }).quantity, dobuchiVolumeM3(2.266), 1e-9);
  check('opts.kaibeWall.area_sqm=0（別府Ｂ）で0m³になる',
    applyWith({ kaibeWall: { area_sqm: '0' } }).quantity, 0);
  check('opts側の不正値は既定へ（推定を維持）',
    applyWith({ kaibeWall: { area_sqm: '-3' } }).quantity, applyWith({}).quantity);
  // 面積・高さは独立して指定できる（界壁の実測がある場合は高さ側だけが効く）
  {
    const elevMeasured = { rooms: [
      { name: '洋室(3)', ceiling_height_mm: 2400, faces: [
        { face: 'C', width_mm: 2360, kaibe_width_mm: 1000, openings: [] },
      ]},
    ]};
    const t = computeElevationTakeoff(elevMeasured, [], { kaibeWall: { height_m: 2.72, area_sqm: 0 } });
    near('実測がある面は面積指定に影響されず実測×指定高さで拾う', t.kaibe_furring_sqm, 2.72, 0.001);
    const row = applyElevationTakeoff(calculateMaterials(plan, {}, {}), t)
      .materials.find((m) => m.name === '木胴縁（界壁面）');
    near('実測ありなら area_sqm=0 でも実測を採用（0で潰さない）', row.quantity, dobuchiVolumeM3(2.72), 1e-9);
  }
}

console.log(`\n=== 木胴縁 材積換算: ✅ ${pass} / ✗ ${fail} ===`);
process.exit(fail > 0 ? 1 : 0);
