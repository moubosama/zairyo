/**
 * 戸境二重壁（遮 / G枠）の物理制約フィルタのユニット検証（2026-07-25）
 *
 * 背景: 別府A〜FをGeminiで3回読み多数決しても、戸境壁を物理的に持ち得ない部屋
 *   （バルコニー=屋外 / 各種倉庫=共用部・住戸外 / 収納内部 / 水回り内部）へ
 *   遮/G枠を系統的に誤付与し、遮音壁PBが最大+338%に暴走していた。
 * 戸境壁＝隣接する別住戸との境界にある二重壁のため、上記の部屋には物理的に接し得ない。
 * buildupCalculator.js の NON_PARTY_WALL_ROOM_RE で棄却し、居室（LDK/洋室/玄関/廊下）の
 * 遮/G枠は本物として計上する。
 *
 * 対象:
 *   1. 非戸境部屋（バルコニー/倉庫/収納/水回り）の遮/G枠は棄却され遮音壁PBに載らない
 *   2. 居室（洋室/LDK）の同一寸法の遮/G枠は棄却されず計上される（誤って全部消さない）
 *   3. 棄却時は beppu_sound_nonparty_dropped が加算され _warnings に出る（黙って消さない）
 *   4. アルファの3桁記号（G14等・遮/G枠なし）ではフィルタが非発火（アルファ完全不変）
 *
 * 実行: node scripts/test-sound-nonparty.mjs
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
  if (Math.abs(actual - expected) <= tol) { pass++; console.log(`✅ ${label} (${actual})`); }
  else { fail++; console.log(`✗ ${label}\n    expected≈ ${expected}\n    actual:   ${actual}`); }
}

// 部屋を1室組み立てるヘルパ（遮/G枠はplacementで与える＝別府方式のセグメント計上経路）。
// 面は無記号（wall_code:null）にして、遮/G枠がセグメント長で拾われる経路だけを見る。
function room(name, segs, ch = 2400) {
  return {
    name, ceiling_height_mm: ch,
    faces: [
      { face: 'A', width_mm: 3300, openings: [] },
      { face: 'B', width_mm: 3300, openings: [] },
      { face: 'C', width_mm: 3300, openings: [] },
      { face: 'D', width_mm: 3300, openings: [] },
    ],
    plan_placements: segs.map((s) => ({ code: s.code, wall_length_mm: s.len_mm })),
  };
}
// soundWallRule.pairs:[] で既定遮音壁ルールを無効化（このテストの対象は別府セグメント計上のみ）。
const OPTS = { soundWallRule: { pairs: [] }, studHeight: { default_mm: 2570 } };

// ============ 1. 非戸境部屋の遮/G枠は棄却（遮音壁PB=0） ============
console.log('--- 1. 戸境壁を持ち得ない部屋の遮/G枠は棄却 ---');
for (const nm of ['バルコニー', 'ベランダ', '防災倉庫', '防炎倉庫', '備蓄倉庫',
  'パントリー', 'システムクローゼット', 'SCL', 'WCL', 'WIC', 'CL', '押入', '物入',
  'トイレ', '便所', '洗面', 'パウダールーム', 'UB', '浴室']) {
  const t = computeElevationTakeoff({ rooms: [room(nm, [{ code: 'G枠', len_mm: 2500 }])] }, [], OPTS);
  check(`${nm} の G枠 は棄却（遮音壁PB=0）`, Math.round(t.sound_wall_pb_sqm * 1000) / 1000, 0);
}

// ============ 2. 居室の遮/G枠は棄却しない（本物として計上） ============
console.log('--- 2. 戸境壁を持ちうる居室の遮/G枠は計上 ---');
for (const nm of ['LDK', '洋室3', '洋室(1)', '玄関', '廊下']) {
  const t = computeElevationTakeoff({ rooms: [room(nm, [{ code: 'G枠', len_mm: 2500 }])] }, [], OPTS);
  // セグメント長2.5m × 下地高2.57（default_mm=2570）= 6.425㎡（両面はplacementが両側を持つ実データで成立。
  // ここは1室なので片側分のみ計上される。エンジンは2桁丸めで 6.43 を返す）
  approx(`${nm} の G枠 は計上（2.5×2.57≒6.43㎡）`, t.sound_wall_pb_sqm, 6.43, 1e-2);
}

// ============ 3. 棄却時のカウンタと警告 ============
console.log('--- 3. 棄却の可視化（カウンタ＋_warnings） ---');
{
  const rooms = [
    room('防災倉庫', [{ code: 'G枠', len_mm: 2500 }]),
    room('バルコニー', [{ code: '遮', len_mm: 1400 }]),
    room('LDK', [{ code: 'G枠', len_mm: 3250 }]),    // 居室=残す
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('非戸境部屋2件を棄却（beppu_sound_nonparty_dropped=2）', t.beppu_sound_nonparty_dropped, 2);
  const w = (t._warnings || []).find((x) => x.field === 'sound_wall_nonparty_room');
  check('sound_wall_nonparty_room 警告が出る', !!w, true);
  check('警告メッセージに件数が入る', /2件/.test(w?.message || ''), true);
  // LDKのG枠(3.25m)は残る（棄却は倉庫/バルコニーのみ）。3.25×2.57≒8.3525→丸め8.35
  approx('居室LDKのG枠は計上され続ける（3.25×2.57≒8.35㎡）', t.sound_wall_pb_sqm, 8.35, 1e-2);
}

// ============ 3b. 面記号（face.wall_code）経路も同じ物理制約が効く ============
console.log('--- 3b. 面記号 face.wall_code=遮/G枠 でも棄却/計上が効く ---');
{
  // 別府の展開図はD面等に face.wall_code='遮' を持つ（plan_placementsとは別経路）。
  // 非戸境部屋（洗面）の面記号遮は棄却、居室（洋室3）の面記号遮は計上されることを確認。
  const wetFace = {
    name: '洗面', ceiling_height_mm: 2400,
    faces: [
      { face: 'A', width_mm: 2200, openings: [] },
      { face: 'B', width_mm: 1100, openings: [] },
      { face: 'C', width_mm: 2200, openings: [] },
      { face: 'D', width_mm: 2000, wall_code: '遮', openings: [] },
    ],
  };
  const tw = computeElevationTakeoff({ rooms: [wetFace] }, [], OPTS);
  check('洗面の面記号遮は棄却（遮音壁PB=0）', Math.round(tw.sound_wall_pb_sqm * 1000) / 1000, 0);
  check('洗面の面記号遮でカウンタ加算（dropped=1）', tw.beppu_sound_nonparty_dropped, 1);

  const livingFace = {
    name: '洋室3', ceiling_height_mm: 2400,
    faces: [
      { face: 'A', width_mm: 2500, openings: [] },
      { face: 'B', width_mm: 2500, openings: [] },
      { face: 'C', width_mm: 2500, openings: [] },
      { face: 'D', width_mm: 2000, wall_code: '遮', openings: [] },
    ],
  };
  const tl = computeElevationTakeoff({ rooms: [livingFace] }, [], OPTS);
  // 面記号遮は下地高2.57で全幅計上: 2.0×2.57=5.14㎡（居室なので棄却しない）
  approx('洋室3の面記号遮は計上（2.0×2.57≒5.14㎡）', tl.sound_wall_pb_sqm, 5.14, 1e-2);
  check('洋室3の面記号遮では棄却カウンタ0', tl.beppu_sound_nonparty_dropped, 0);
}

// ============ 4. アルファ非発火（3桁記号・遮/G枠なし） ============
console.log('--- 4. アルファの3桁記号ではフィルタ非発火 ---');
{
  // アルファの記号は G14/C04 等の3桁（beppuマーカーなし）。isBeppuSoundCode が偽のため
  // NON_PARTY_WALL_ROOM_RE に該当する部屋名でも遮音壁セグメント棄却は起きない
  // （そもそも遮/G枠が1件も無い）。トイレG14/耐水G24 が通常どおり処理される。
  const rooms = [
    { name: 'トイレ', ceiling_height_mm: 2200, faces: [
      { face: 'A', width_mm: 950, wall_code: 'G24', openings: [] },
      { face: 'B', width_mm: 1925, wall_code: 'G24', openings: [] },
      { face: 'C', width_mm: 950, openings: [] },
      { face: 'D', width_mm: 1925, openings: [] },
    ], plan_codes: ['G24'], plan_placements: [
      { code: 'G24', wall_length_mm: 950 }, { code: 'G24', wall_length_mm: 1925 },
    ] },
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('アルファ経路: beppu_sound_nonparty_dropped=0（非発火）', t.beppu_sound_nonparty_dropped, 0);
  check('アルファ経路: sound_wall_nonparty_room 警告なし',
    (t._warnings || []).some((x) => x.field === 'sound_wall_nonparty_room'), false);
  check('アルファ経路: 遮音壁PB=0（トイレは遮/G枠を持たない）',
    Math.round(t.sound_wall_pb_sqm * 1000) / 1000, 0);
}
{
  // アルファのL14（下地L・beppuマーカーなし）を非戸境部屋名（洗面）の面に置いても、
  // beppuマーカーが無いためフィルタは非発火し、従来どおり遮音壁PBとして計上される
  // （アルファのL/O/W下地の挙動を1バイトも変えないことの担保）。
  const rooms = [
    { name: '洗面', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2000, wall_code: 'L14', openings: [] },
      { face: 'B', width_mm: 1000, openings: [] },
      { face: 'C', width_mm: 2000, openings: [] },
      { face: 'D', width_mm: 1000, openings: [] },
    ] },
  ];
  const t = computeElevationTakeoff({ rooms }, [], OPTS);
  check('アルファL14（beppuマーカーなし）は非戸境部屋名でも棄却されない（dropped=0）',
    t.beppu_sound_nonparty_dropped, 0);
  // 2.0×2.82(水回り下地高)=5.64㎡ が遮音壁PBに計上される（従来挙動）
  approx('アルファL14は従来どおり遮音壁PBに計上（>0）',
    t.sound_wall_pb_sqm > 0 ? 1 : 0, 1);
}

console.log(`\n判定: ✅ ${pass} / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
