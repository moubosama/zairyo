/**
 * 面ラベル混同（column-label confusion）の系統誤読検出のユニット検証（2026-07-25）
 *
 * 背景: 別府DのGemini実読み（3回読み多数決・既定）で、展開図の**全8室のD面すべてに**
 *   face.wall_code='遮' が付く。これはGeminiが展開図の**列ラベル「D面」**を壁記号「遮」と
 *   取り違え、D列全体（＝全部屋のD面）へ遮音を貼った系統誤読の指紋。
 * 物理規則: 戸境二重壁＝住戸外周の隣戸接触面（1〜2面）にのみ存在。住戸内の全部屋が
 *   同一方向（同一face-label）で戸境に接することは物理的にありえない。
 * → 「同一face-label（A/B/C/D）× 同一遮音記号（遮/G枠）が N室（=3室）以上に一律付与」
 *   された組は面ラベル混同とみなし、該当する全面の面記号経由の遮/G枠計上を棄却する。
 *
 * 閾値 N=3 の根拠: 正当に「同一face-labelに遮」が2室で出るケース（隣接2室が同一戸境壁を共有し
 *   両室の同face-labelにその壁が割り当たる）を潰さないため、2室までは保持する。3室以上の
 *   一律付与は「物理的に戸境壁が付きうる面数の上限」を超えており面ラベル混同の指紋とみなす。
 *   特定タイプの正解面数へ寄せた閾値ではない。
 *
 * 対象:
 *   1. 同一face-label × 同一記号が3室以上 → 該当面を棄却（遮音壁PBに載らない）
 *   2. 2室以下は保持（本物の戸境壁を誤って全消ししない）
 *   3. 棄却時は beppu_sound_face_label_dropped が加算され _warnings に出る（黙って消さない）
 *   4. NON_PARTY部屋は集計対象外＝面ラベル閾値を甘くしない（水回り込みで3室を超えさせない）
 *   5. plan_placements経由の遮/G枠（セグメント計上・正当）は面ラベル集計の対象外＝不変
 *   6. アルファの3桁記号（遮/G枠なし）ではフィルタ非発火（アルファ完全不変）
 *   7. フォールト注入: 閾値を2に緩めると2室ケースまで棄却される（検出力の実証）
 *
 * 実行: node scripts/test-sound-face-label.mjs
 */
import { computeElevationTakeoff } from '../src/services/buildupCalculator.js';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`✗ ${label}\n    expected: ${e}\n    actual:   ${a}`); }
}
function approx(label, actual, expected, tol = 1e-2) {
  if (Math.abs(actual - expected) <= tol) { pass++; console.log(`✅ ${label} (${actual})`); }
  else { fail++; console.log(`✗ ${label}\n    expected≈ ${expected}\n    actual:   ${actual}`); }
}

const OPTS = { soundWallRule: { pairs: [] }, studHeight: { default_mm: 2570 } };

// 居室を1室組み立てるヘルパ。D面に face.wall_code='遮' を持たせ（別府Dの指紋を再現）、
// 他の面は無記号。面幅は各室で任意。
function roomWithDFaceCode(name, code, dWidth = 3200) {
  return {
    name, ceiling_height_mm: 2400,
    faces: [
      { face: 'A', width_mm: 3000, openings: [] },
      { face: 'B', width_mm: 3000, openings: [] },
      { face: 'C', width_mm: 3000, openings: [] },
      { face: 'D', width_mm: dWidth, wall_code: code, openings: [] },
    ],
  };
}

// ============ 1. 同一face-label × 同一記号が3室以上で棄却 ============
console.log('--- 1. D面遮×3室以上は面ラベル混同として棄却 ---');
{
  // 居室3室すべてのD面に '遮'（別府Dの指紋の縮小版）
  const rooms = [
    roomWithDFaceCode('LDK', '遮', 5550),
    roomWithDFaceCode('洋室1', '遮', 3300),
    roomWithDFaceCode('洋室2', '遮', 3200),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('D面遮×3室は全棄却（遮音壁PB=0）', Math.round(t.sound_wall_pb_sqm * 1000) / 1000, 0);
  check('face_label_dropped=3', t.beppu_sound_face_label_dropped, 3);
  check('nonparty_dropped=0（居室なので別フィルタは非発火）', t.beppu_sound_nonparty_dropped, 0);
}

// ============ 2. 2室以下は保持（本物の戸境壁を全消ししない） ============
console.log('--- 2. D面遮×2室は保持（隣接2室が同一戸境壁を共有する正当ケース） ---');
{
  const rooms = [
    roomWithDFaceCode('LDK', '遮', 3000),
    roomWithDFaceCode('洋室1', '遮', 3000),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('face_label_dropped=0（2室は棄却しない）', t.beppu_sound_face_label_dropped, 0);
  // 各室 D面遮 3.0m × 下地高2.57 = 7.71㎡ ×2室 = 15.42㎡
  approx('2室のD面遮は計上される（3.0×2.57×2≒15.42㎡）', t.sound_wall_pb_sqm, 15.42, 2e-2);
}

// ============ 2b. 異なるface-labelなら3室でも混同ではない（保持） ============
console.log('--- 2b. face-labelが分散していれば混同でない（保持） ---');
{
  // 3室が別々の面ラベル（A/B/C）に遮を持つ＝列ラベル混同の指紋ではない（本物の可能性）
  const mk = (name, label) => ({
    name, ceiling_height_mm: 2400,
    faces: [
      { face: 'A', width_mm: 3000, wall_code: label === 'A' ? '遮' : null, openings: [] },
      { face: 'B', width_mm: 3000, wall_code: label === 'B' ? '遮' : null, openings: [] },
      { face: 'C', width_mm: 3000, wall_code: label === 'C' ? '遮' : null, openings: [] },
      { face: 'D', width_mm: 3000, openings: [] },
    ],
  });
  const rooms = [mk('LDK', 'A'), mk('洋室1', 'B'), mk('洋室2', 'C')];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('分散face-labelは棄却されない（face_label_dropped=0）', t.beppu_sound_face_label_dropped, 0);
  approx('3室の遮が全て計上（3.0×2.57×3≒23.13㎡）', t.sound_wall_pb_sqm, 23.13, 3e-2);
}

// ============ 3. 棄却の可視化（カウンタ＋_warnings） ============
console.log('--- 3. 棄却の可視化 ---');
{
  const rooms = [
    roomWithDFaceCode('LDK', '遮'),
    roomWithDFaceCode('洋室1', '遮'),
    roomWithDFaceCode('洋室2', '遮'),
    roomWithDFaceCode('洋室3', '遮'),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('face_label_dropped=4', t.beppu_sound_face_label_dropped, 4);
  const w = (t._warnings || []).find((x) => x.field === 'sound_wall_face_label_confusion');
  check('sound_wall_face_label_confusion 警告が出る', !!w, true);
  check('警告に件数が入る', /4件/.test(w?.message || ''), true);
}

// ============ 4. NON_PARTY部屋は集計対象外（閾値を甘くしない） ============
console.log('--- 4. NON_PARTY部屋は面ラベル集計に数えない ---');
{
  // 居室2室 + 水回り/収納3室のD面すべてに遮（別府Dの実パターンに近い）。
  // NON_PARTY（洗面/WCL/トイレ）は面ラベル集計から除外されるので、居室は2室のみ＝
  // 面ラベル混同の閾値(3)には達しない → 居室のD面遮は保持、NON_PARTYはnonpartyで落ちる。
  const rooms = [
    roomWithDFaceCode('LDK', '遮', 3000),
    roomWithDFaceCode('洋室1', '遮', 3000),
    roomWithDFaceCode('洗面', '遮', 2440),
    roomWithDFaceCode('WCL', '遮', 2960),
    roomWithDFaceCode('トイレ', '遮', 1000),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  // 居室2室は面ラベル混同に達しない → face_label_dropped=0
  check('居室2室はface_label混同に達しない（face_label_dropped=0）', t.beppu_sound_face_label_dropped, 0);
  // 【2026-07-26 部位スコープ整合】NON_PARTY3室の内訳が変わった:
  //   水回り（洗面/トイレ）→ 遮音壁耐水PBバケットへ振替（wet_rerouted） /
  //   収納（WCL）→ 部屋ごとスコープ除外（closet_excluded）。nonparty棄却は0になる
  check('水回り2室（洗面/トイレ）は耐水振替（wet_rerouted=2）', t.beppu_sound_wet_rerouted, 2);
  check('収納1室（WCL）はスコープ除外（closet_excluded=1）', t.beppu_closet_rooms_excluded, 1);
  check('nonparty棄却は0（水回り=振替・収納=部屋除外へ移行）', t.beppu_sound_nonparty_dropped, 0);
  // 振替バケット: 洗面D面2.44 + トイレD面1.0 = 3.44m × 下地高2.57 = 8.8408㎡
  approx('耐水振替バケット（(2.44+1.0)×2.57≒8.84㎡）', t.sound_wall_waterproof_pb_sqm, 8.84, 2e-2);
  // 居室2室のD面遮は計上（3.0×2.57×2≒15.42㎡）
  approx('居室2室のD面遮は計上（≒15.42㎡）', t.sound_wall_pb_sqm, 15.42, 2e-2);
}
{
  // 別府Dの実パターン: 居室5室（玄関/LDK/洋室1/2/3）+ NON_PARTY3室 が全部D面遮。
  // 居室が5室＝閾値3を超えるので居室のD面遮も棄却される。
  const rooms = [
    roomWithDFaceCode('玄関', '遮', 4150),
    roomWithDFaceCode('LDK', '遮', 5550),
    roomWithDFaceCode('洋室1', '遮', 3300),
    roomWithDFaceCode('洋室2', '遮', 3200),
    roomWithDFaceCode('洋室3', '遮', 3200),
    roomWithDFaceCode('洗面', '遮', 2440),
    roomWithDFaceCode('WCL', '遮', 2960),
    roomWithDFaceCode('トイレ', '遮', 1000),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('別府D型: 居室5室のD面遮を棄却（face_label_dropped=5）', t.beppu_sound_face_label_dropped, 5);
  // 【2026-07-26 部位スコープ整合】旧nonparty=3の内訳: 水回り2（洗面/トイレ）=耐水振替 /
  // 収納1（WCL）=部屋ごとスコープ除外。nonparty棄却は0
  check('別府D型: 水回り2室は耐水振替（wet_rerouted=2）', t.beppu_sound_wet_rerouted, 2);
  check('別府D型: 収納WCLはスコープ除外（closet_excluded=1）', t.beppu_closet_rooms_excluded, 1);
  check('別府D型: nonparty棄却は0', t.beppu_sound_nonparty_dropped, 0);
  check('別府D型: 面記号経由の遮音壁PBは全棄却（=0）', Math.round(t.sound_wall_pb_sqm * 1000) / 1000, 0);
}

// ============ 5. plan_placements経由の遮/G枠は面ラベル集計の対象外（正当・不変） ============
console.log('--- 5. plan_placements経由の遮/G枠はセグメント計上され面ラベル混同で消えない ---');
{
  // 面に記号は無く、遮/G枠は plan_placements（セグメント）だけで与える。面ラベルを持たないため
  // 面ラベル混同集計の対象外＝3室あってもセグメント計上され続ける（別府A/B/Cの正当経路の担保）。
  const seg = (name) => ({
    name, ceiling_height_mm: 2400,
    faces: [
      { face: 'A', width_mm: 3300, openings: [] },
      { face: 'B', width_mm: 3300, openings: [] },
      { face: 'C', width_mm: 3300, openings: [] },
      { face: 'D', width_mm: 3300, openings: [] },
    ],
    plan_placements: [{ code: '遮', wall_length_mm: 2500 }],
  });
  const rooms = [seg('LDK'), seg('洋室1'), seg('洋室2')];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('plan_placements経由はface_label_dropped=0（対象外）', t.beppu_sound_face_label_dropped, 0);
  // 各室 2.5m×2.57=6.425㎡ ×3室 = 19.275㎡
  approx('plan_placementsの遮は3室とも計上（2.5×2.57×3≒19.28㎡）', t.sound_wall_pb_sqm, 19.28, 3e-2);
}

// ============ 6. アルファ非発火（3桁記号・遮/G枠なし） ============
console.log('--- 6. アルファの3桁記号ではフィルタ非発火 ---');
{
  // アルファのL14（下地L・beppuマーカーなし）を全室のD面に置いても、beppuマーカーが無いため
  // 面ラベル混同集計の対象外＝棄却されず従来どおり遮音壁PBに計上される（アルファ完全不変）。
  const mk = (name) => ({
    name, ceiling_height_mm: 2400,
    faces: [
      { face: 'A', width_mm: 3000, openings: [] },
      { face: 'B', width_mm: 3000, openings: [] },
      { face: 'C', width_mm: 3000, openings: [] },
      { face: 'D', width_mm: 2000, wall_code: 'L14', openings: [] },
    ],
  });
  const rooms = [mk('LDK'), mk('洋室1'), mk('洋室2')];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('アルファL14×3室D面: face_label_dropped=0（非発火）', t.beppu_sound_face_label_dropped, 0);
  check('アルファL14×3室D面: 面ラベル混同警告なし',
    (t._warnings || []).some((x) => x.field === 'sound_wall_face_label_confusion'), false);
  // L14は遮音壁PBに計上され続ける（2.0×2.57×3=15.42㎡ > 0）
  check('アルファL14は従来どおり遮音壁PBに計上（>0）', t.sound_wall_pb_sqm > 0, true);
}

// ============ 7. フォールト注入: 2室ケースは「保持」でなければならない（検出力の実証） ============
console.log('--- 7. フォールト注入: 2室ケースは保持されることの担保（誤って全消ししない） ---');
{
  // もし閾値が2に甘くなった実装なら、この2室ケースが棄却され sound_wall_pb=0 になる。
  // 現行(閾値3)では保持されるので >0。この差でミューテーション（閾値2化）を検出できる。
  const rooms = [
    roomWithDFaceCode('LDK', '遮', 3000),
    roomWithDFaceCode('洋室1', '遮', 3000),
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('2室ケースは保持（sound_wall_pb>0・閾値2化ならここが0で赤になる）',
    t.sound_wall_pb_sqm > 0, true);
}

console.log(`\n判定: ✅ ${pass} / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
