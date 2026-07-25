/**
 * 戸境二重壁（遮/G枠）の面数物理上限のユニット検証（2026-07-25）
 *
 * 背景: 既存2フィルタ（NON_PARTY部屋種別・面ラベル混同）を通過してもなお、別府B/Dの
 *   Gemini実読みでは遮/G枠のセグメントが1部屋に最大7件・住戸で9件残り、遮音壁PBが
 *   +99〜127%に暴走する（同一の戸境壁を粒度違い・記号違いで複数回転記する読取ノイズ）。
 *
 * 物理上限の導出（正解値からの逆算ではない・buildupCalculator.js soundFaceCap の注記参照）:
 *   別府4丁目は片廊下型で住戸が横一列（階配置表 A|B|C|D|E|F|G）＝
 *   ・1住戸が接する隣戸は左右の最大2戸 → 戸境壁は最大2辺
 *   ・1部屋が接しうる戸境壁も左右2辺まで・1辺に見せる壁面は連続1面 → 部屋あたり最大2面
 *   ・1辺に接しうる部屋は間取り上最大3室（2〜3LDK・奥行き10〜12m） → 住戸全体で 2辺×3室=最大6面
 *
 * 削る順序: 寄与（セグメント長/面幅）の大きい順に上限まで採用（戸境壁は奥行き方向に走る
 *   長い壁で、境界に接するのは大きい居室が主）。同寸タイは列挙順で決定的。
 *
 * 対象:
 *   1. 部屋あたり上限2面（3件目以降は寄与の小さい順に棄却）
 *   2. 住戸あたり上限6面（7件目以降は寄与の小さい順に棄却）
 *   3. 上限内は不変（別府A型=4面・過少タイプを削らない）＋警告なし
 *   4. 棄却＝「検出が無かった」扱い（セグメントを最初から与えない場合と数量が完全一致）
 *   5. 選択は寄与の大きさ順で決定的（入力順に依存しない）
 *   6. 面記号（face.wall_code）経路にも同じ上限が効く
 *   7. アルファの3桁記号（L14等・beppuマーカーなし）は上限の対象外＝非発火
 *   8. NON_PARTY部屋の遮/G枠はプール外（nonpartyカウンタで落ち、上限枠を消費しない）
 *   9. フォールト注入: 上限をきつく（部屋1面/住戸5面）緩く（部屋3面/住戸7面）変異させると
 *      赤になる境界ケースで検出力を実証
 *
 * 実行: node scripts/test-sound-face-cap.mjs
 */
import { computeElevationTakeoff } from '../src/services/buildupCalculator.js';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`✗ ${label}\n    expected: ${e}\n    actual:   ${a}`); }
}
function approx(label, actual, expected, tol = 3e-2) {
  if (Math.abs(actual - expected) <= tol) { pass++; console.log(`✅ ${label} (${actual})`); }
  else { fail++; console.log(`✗ ${label}\n    expected≈ ${expected}\n    actual:   ${actual}`); }
}

const OPTS = { soundWallRule: { pairs: [] }, studHeight: { default_mm: 2570 } };
const H = 2.57;

// セグメント経路の部屋（面は無記号・plan_placementsに遮/G枠を与える）。
// 同寸重複はcollapseDoubledPlacementsの縮退対象になるため、テストでは全て異寸にする。
function segRoom(name, segs, faceWidths = [6000, 6000, 6000, 6000]) {
  return {
    name, ceiling_height_mm: 2400,
    faces: faceWidths.map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })),
    plan_placements: segs.map(([code, mm]) => ({ code, wall_length_mm: mm })),
  };
}

// ============ 1. 部屋あたり上限2面（左右2辺） ============
console.log('--- 1. 1部屋の遮/G枠は寄与の大きい2件まで（3件目以降を棄却） ---');
{
  const rooms = [segRoom('LDK', [['遮', 4000], ['遮', 3000], ['遮', 2000]])];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  // 上位2件（4.0+3.0=7.0m）×2.57=17.99㎡。3件目2.0mは棄却
  approx('遮音壁PBは上位2件のみ（(4.0+3.0)×2.57≒17.99㎡）', t.sound_wall_pb_sqm, 7.0 * H);
  check('cap_dropped=1', t.beppu_sound_face_cap_dropped, 1);
  const w = (t._warnings || []).find((x) => x.field === 'sound_wall_face_cap');
  check('sound_wall_face_cap 警告が出る', !!w, true);
  check('警告に部屋上限超過1面と入る', /部屋上限超過1面/.test(w?.message || ''), true);
}

// ============ 2. 住戸あたり上限6面（2辺×片側最大3室） ============
console.log('--- 2. 住戸全体で7件目以降を棄却（各部屋は2件以内＝部屋上限は非発火） ---');
{
  const rooms = [
    segRoom('LDK', [['遮', 5000], ['遮', 4000]]),
    segRoom('洋室1', [['遮', 3600], ['遮', 3100]]),
    segRoom('洋室2', [['遮', 2600], ['遮', 2100]]),
    segRoom('洋室3', [['遮', 1500]]),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  // 7件中、最小の1.5m（洋室3）だけが住戸上限で棄却される
  approx('上位6件のみ計上（20.4m×2.57≒52.43㎡）', t.sound_wall_pb_sqm, 20.4 * H);
  check('cap_dropped=1', t.beppu_sound_face_cap_dropped, 1);
  const w = (t._warnings || []).find((x) => x.field === 'sound_wall_face_cap');
  check('警告に住戸上限超過1面と入る', /住戸上限超過1面/.test(w?.message || ''), true);
  check('警告に検出7面と入る', /検出が7面/.test(w?.message || ''), true);
}

// ============ 3. 上限内は不変（過少タイプを削らない・別府A型の構成） ============
console.log('--- 3. 上限内（部屋2件以内・住戸6件以内）は1件も削らない ---');
{
  // 別府Aの正当構成: LDK(遮+G枠)・洋室3(遮+G枠)=4面（-26%過少タイプ。これを削ると退行）
  const rooms = [
    segRoom('LDK', [['遮', 3250], ['G枠', 2250]]),
    segRoom('洋室3', [['遮', 3251], ['G枠', 2251]]),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  approx('4面すべて計上（11.002m×2.57≒28.28㎡）', t.sound_wall_pb_sqm, 11.002 * H);
  check('cap_dropped=0', t.beppu_sound_face_cap_dropped, 0);
  check('警告なし', (t._warnings || []).some((x) => x.field === 'sound_wall_face_cap'), false);
}
{
  // 境界ちょうど: 3室×2件=6件は1件も削らない（住戸上限=6の内側。
  // フォールト注入: 住戸上限を5へ変異させるとここが赤になる）
  const rooms = [
    segRoom('LDK', [['遮', 5000], ['遮', 4000]]),
    segRoom('洋室1', [['遮', 3600], ['遮', 3100]]),
    segRoom('洋室2', [['遮', 2600], ['遮', 2100]]),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  approx('6件ちょうどは全計上（20.4m×2.57≒52.43㎡）', t.sound_wall_pb_sqm, 20.4 * H);
  check('cap_dropped=0（住戸上限5化ならここが1で赤）', t.beppu_sound_face_cap_dropped, 0);
}

// ============ 4. 棄却＝「検出が無かった」扱い（数量の完全一致） ============
console.log('--- 4. 棄却分は最初から与えない場合と壁PB・遮音壁PBが完全一致 ---');
{
  // 3件目（3000）が棄却される部屋と、最初から2件しか無い部屋で全数量が一致すること
  // ＝soundDeductByFace（壁PB差し引き）にも棄却分が漏れない検証
  const withExcess = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 4000], ['遮', 3500], ['遮', 3000]], [5000, 4600, 4400, 4200])] },
    [], OPTS);
  const clean = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 4000], ['遮', 3500]], [5000, 4600, 4400, 4200])] },
    [], OPTS);
  approx('遮音壁PBが一致', withExcess.sound_wall_pb_sqm, clean.sound_wall_pb_sqm, 1e-9);
  approx('壁PBが一致（棄却セグメントの差し引きが残らない）', withExcess.wall_pb_sqm, clean.wall_pb_sqm, 1e-9);
  approx('GWが一致', withExcess.gw_sqm, clean.gw_sqm, 1e-9);
  approx('遮音シートが一致', withExcess.sound_sheet_sqm, clean.sound_sheet_sqm, 1e-9);
  check('超過側のみcap_dropped=1', [withExcess.beppu_sound_face_cap_dropped, clean.beppu_sound_face_cap_dropped], [1, 0]);
}

// ============ 5. 選択の決定性（寄与の大きさ順・入力順に依存しない） ============
console.log('--- 5. 入力順を入れ替えても「寄与の大きい2件」が残る ---');
{
  const a = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 4000], ['遮', 3000], ['遮', 2000]])] }, [], OPTS);
  const b = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 2000], ['遮', 4000], ['遮', 3000]])] }, [], OPTS);
  const c = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 3000], ['遮', 2000], ['遮', 4000]])] }, [], OPTS);
  approx('順序a: (4.0+3.0)×2.57', a.sound_wall_pb_sqm, 7.0 * H);
  approx('順序b: 同値（入力順非依存）', b.sound_wall_pb_sqm, a.sound_wall_pb_sqm, 1e-9);
  approx('順序c: 同値（入力順非依存）', c.sound_wall_pb_sqm, a.sound_wall_pb_sqm, 1e-9);
}

// ============ 6. 面記号（face.wall_code）経路にも同じ上限 ============
console.log('--- 6. 面記号経由の遮/G枠にも部屋あたり上限2面が効く ---');
{
  // 3面が別々のface-label（A/B/C）に遮＝面ラベル混同（同一ラベル×3室）には該当しない構成。
  // 部屋あたり上限で最小の1面（2000）だけが棄却される
  const rooms = [{
    name: 'LDK', ceiling_height_mm: 2400,
    faces: [
      { face: 'A', width_mm: 4000, wall_code: '遮', openings: [] },
      { face: 'B', width_mm: 3000, wall_code: '遮', openings: [] },
      { face: 'C', width_mm: 2000, wall_code: '遮', openings: [] },
      { face: 'D', width_mm: 3000, openings: [] },
    ],
  }];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  approx('面記号経路も上位2件のみ（(4.0+3.0)×2.57≒17.99㎡）', t.sound_wall_pb_sqm, 7.0 * H);
  check('cap_dropped=1', t.beppu_sound_face_cap_dropped, 1);
  check('face_label_dropped=0（1室のみ＝面ラベル混同ではない）', t.beppu_sound_face_label_dropped, 0);
}

// ============ 7. アルファ非発火（beppuマーカーなしのL/O/Wは対象外） ============
console.log('--- 7. アルファの3桁記号（L14等）は面数上限の対象外 ---');
{
  // 1部屋にL14の面が3面あっても削らない（アルファの遮音壁はDEFAULT_SOUND_WALL_PAIRSと
  // L/O/W面の実測で拾う既存挙動のまま＝アルファ完全不変の構造的担保）
  const rooms = [{
    name: 'LDK', ceiling_height_mm: 2400,
    faces: [
      { face: 'A', width_mm: 3000, wall_code: 'L14', openings: [] },
      { face: 'B', width_mm: 2500, wall_code: 'L14', openings: [] },
      { face: 'C', width_mm: 2000, wall_code: 'L14', openings: [] },
      { face: 'D', width_mm: 3000, openings: [] },
    ],
  }];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  approx('L14×3面は全計上（7.5m×2.57≒19.28㎡）', t.sound_wall_pb_sqm, 7.5 * H);
  check('cap_dropped=0（非発火）', t.beppu_sound_face_cap_dropped, 0);
  check('警告なし', (t._warnings || []).some((x) => x.field === 'sound_wall_face_cap'), false);
}

// ============ 8. NON_PARTY部屋はプール外（上限枠を消費しない） ============
console.log('--- 8. NON_PARTY部屋の遮/G枠はnonpartyで落ち、上限枠を食わない ---');
{
  // 洗面の3件はnonpartyで棄却（プール外）。居室7件のうち住戸上限で1件だけ棄却
  // ＝nonparty分が住戸上限の分母に入らないことの検証
  const rooms = [
    segRoom('洗面', [['遮', 9000], ['遮', 8000], ['遮', 7000]]),
    segRoom('LDK', [['遮', 5000], ['遮', 4000]]),
    segRoom('洋室1', [['遮', 3600], ['遮', 3100]]),
    segRoom('洋室2', [['遮', 2600], ['遮', 2100]]),
    segRoom('洋室3', [['遮', 1500]]),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('nonparty_dropped=3（洗面）', t.beppu_sound_nonparty_dropped, 3);
  check('cap_dropped=1（居室7件中1件のみ）', t.beppu_sound_face_cap_dropped, 1);
  approx('居室上位6件のみ計上（20.4m×2.57≒52.43㎡）', t.sound_wall_pb_sqm, 20.4 * H);
}

// ============ 9. フォールト注入の境界（上限の変異検出） ============
console.log('--- 9. 上限の変異（きつめ/緩め）を検出する境界ケース ---');
{
  // 部屋2件ちょうど＝削らない（部屋上限を1へ変異させるとここが赤）
  const t2 = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 4000], ['遮', 3000]])] }, [], OPTS);
  approx('部屋2件ちょうどは全計上（部屋上限1化ならここが赤）', t2.sound_wall_pb_sqm, 7.0 * H);
  // 部屋3件は必ず1件削る（部屋上限を3へ変異させるとここが赤）
  const t3 = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 4000], ['遮', 3000], ['遮', 2000]])] }, [], OPTS);
  check('部屋3件は必ず1件棄却（部屋上限3化ならここが赤）', t3.beppu_sound_face_cap_dropped, 1);
  // 住戸7件は必ず1件削る（住戸上限を7へ変異させるとここが赤）
  const t7 = computeElevationTakeoff({
    rooms: [
      segRoom('LDK', [['遮', 5000], ['遮', 4000]]),
      segRoom('洋室1', [['遮', 3600], ['遮', 3100]]),
      segRoom('洋室2', [['遮', 2600], ['遮', 2100]]),
      segRoom('洋室3', [['遮', 1500]]),
    ],
  }, [], OPTS);
  check('住戸7件は必ず1件棄却（住戸上限7化ならここが赤）', t7.beppu_sound_face_cap_dropped, 1);
}

console.log(`\n判定: ✅ ${pass} / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
