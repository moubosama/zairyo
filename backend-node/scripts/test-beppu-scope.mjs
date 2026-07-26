/**
 * 別府の部位スコープ整合2件のユニット検証（2026-07-26）
 *
 * ① 収納室のスコープ除外（BEPPU_CLOSET_SCOPE_ROOM_RE）:
 *   別府XLSタイプ別シートには収納室（SCL/WCL等）の部屋ブロック自体が無い（作り付け
 *   システム収納＝工事対象外）＝収納の壁・巾木・下地を一切拾わないが正。
 *   isBeppuLayout（遮/G枠マーカー実在）のときだけ展開図の収納室を部屋ごと除外する。
 * ② 水回りの遮/G枠 → 遮音壁耐水PBバケット振替（SOUND_WET_ROOM_RE）:
 *   別府の便所・洗面所の壁はほぼ全量「遮音壁耐水ＰＢ張」（XLS集計表r60・全9タイプ実在）
 *   ＝エンジン未実装の実在部位。NON_PARTY棄却でなく sound_wall_waterproof_pb_sqm へ振替する。
 *   バケットは表示スコープ外（資材行なし・データ層とsummaryのみ）。
 *
 * 対象:
 *   1. ①発火: 別府レイアウトの収納室は壁PB・巾木・周長・下地すべて0＋カウンタ＋警告
 *   2. ①非発火: 遮/G枠の無い図面（アルファ相当）では収納室を従来どおり計上（完全不変）
 *   3. ①の対象部屋名の網羅と、水回りが①の対象外であること
 *   4. ②セグメント経路: 水回りの遮/G枠はバケットへ（len×下地高）・遮音壁PBに載らない
 *   5. ②面記号経路: 水回りの面遮はバケットへ（面幅×下地高−開口）
 *   6. ②の壁PB非干渉: 振替は壁PB・遮音壁PBを1バイトも動かさない（棄却時と同値）
 *   7. ②対象外: バルコニー/倉庫は従来どおりnonparty棄却（バケット0）
 *   8. 表示スコープ: applyElevationTakeoffで資材行が増えない・summaryは検出>0のときのみ
 *   9. フォールト注入相当の値固定: 下地高（一般/水回り指定）で振替量が正しく変わる
 *
 * 実行: node scripts/test-beppu-scope.mjs
 */
import {
  computeElevationTakeoff, applyElevationTakeoff, filterKenzaiScope,
} from '../src/services/buildupCalculator.js';

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

// 4面の無記号部屋（既定G14=通常壁PBに落ちる）。skirting付き
function plainRoom(name, w = 2000, ch = 2400, skirting = '木製') {
  return {
    name, ceiling_height_mm: ch, skirting,
    faces: ['A', 'B', 'C', 'D'].map((f) => ({ face: f, width_mm: w, openings: [] })),
  };
}
// 遮/G枠セグメントを持つ部屋（isBeppuLayoutマーカー兼用）
function segRoom(name, segs, ch = 2400) {
  return {
    name, ceiling_height_mm: ch, skirting: '木製',
    faces: ['A', 'B', 'C', 'D'].map((f) => ({ face: f, width_mm: 3300, openings: [] })),
    plan_placements: segs.map((s) => ({ code: s.code, wall_length_mm: s.len_mm })),
  };
}

// ============ 1. ① 別府レイアウトの収納室は部屋ごと除外 ============
console.log('--- 1. ①発火: 別府レイアウト（遮/G枠実在）の収納室は何も拾わない ---');
{
  // LDKの遮@3250がisBeppuLayoutマーカー。SCL（無記号4面×2.0m）は従来なら
  // 既定G14で壁PB 4面×2.0×2.44=19.52㎡・巾木8m・間仕切下地に載っていた
  const beppu = { rooms: [segRoom('LDK', [{ code: '遮', len_mm: 3250 }]), plainRoom('SCL')] };
  const withCloset = computeElevationTakeoff(beppu, [], OPTS);
  const withoutCloset = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [{ code: '遮', len_mm: 3250 }])] }, [], OPTS);
  check('SCLありなしで壁PBが同値（=収納寄与ゼロ）',
    withCloset.wall_pb_sqm, withoutCloset.wall_pb_sqm);
  check('SCLありなしで巾木が同値', withCloset.skirting_m, withoutCloset.skirting_m);
  check('SCLありなしで間仕切下地が同値', withCloset.majikiri_shitaji_m, withoutCloset.majikiri_shitaji_m);
  check('SCLありなしでクロスが同値', withCloset.cloth_sqm, withoutCloset.cloth_sqm);
  check('部屋統計にSCLが載らない', withCloset.rooms.map((r) => r.name), ['LDK']);
  check('closet_excluded=1', withCloset.beppu_closet_rooms_excluded, 1);
  const w = (withCloset._warnings || []).find((x) => x.field === 'beppu_closet_scope');
  check('beppu_closet_scope 警告が出る', !!w, true);
  check('警告に部屋名SCLが入る', /SCL/.test(w?.message || ''), true);
}

// ============ 2. ① 非発火（アルファ相当=遮/G枠なし）で完全不変 ============
console.log('--- 2. ①非発火: 遮/G枠の無い図面では収納室を従来どおり計上 ---');
{
  // 同じSCL部屋でも遮/G枠が1件も無ければ isBeppuLayout=false ＝除外しない（アルファ完全不変の担保）
  const alpha = { rooms: [plainRoom('洋室(1)', 3000), plainRoom('SCL')] };
  const t = computeElevationTakeoff(alpha, [], OPTS);
  // SCL: 4面×2.0m×(2.4+0.04)=19.52㎡ が既定G14で壁PBに載る（洋室分4×3.0×2.44=29.28と合算）
  approx('SCLの壁PBが従来どおり載る（19.52+29.28=48.8㎡）', t.wall_pb_sqm, 48.8, 2e-2);
  check('closet_excluded=0（非発火）', t.beppu_closet_rooms_excluded, 0);
  check('beppu_closet_scope 警告なし',
    (t._warnings || []).some((x) => x.field === 'beppu_closet_scope'), false);
}

// ============ 3. ① 対象部屋名の網羅と水回り非対象 ============
console.log('--- 3. ①の対象部屋名（収納系のみ・水回りは対象外） ---');
for (const nm of ['SCL', 'WCL', 'WIC', 'CL', 'クローゼット', 'ウォークインクロゼット',
  'パントリー', '押入', '物入(1)', 'システムクローゼット']) {
  const t = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [{ code: '遮', len_mm: 3250 }]), plainRoom(nm)] }, [], OPTS);
  check(`${nm} は①で除外（closet_excluded=1）`, t.beppu_closet_rooms_excluded, 1);
}
for (const nm of ['洗面', 'トイレ', '便所', '玄関', '洋室(2)', '廊下']) {
  const t = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [{ code: '遮', len_mm: 3250 }]), plainRoom(nm)] }, [], OPTS);
  check(`${nm} は①の対象外（closet_excluded=0）`, t.beppu_closet_rooms_excluded, 0);
}

// ============ 4. ② セグメント経路の振替 ============
console.log('--- 4. ②セグメント経路: 水回りの遮/G枠は耐水バケットへ ---');
{
  const t = computeElevationTakeoff(
    { rooms: [segRoom('トイレ', [{ code: '遮', len_mm: 2200 }])] }, [], OPTS);
  // 下地高: wet未指定+default指定 → 2.57（wetFromDefault）。2.2×2.57=5.654
  approx('バケット= len×下地高（2.2×2.57≒5.65㎡）', t.sound_wall_waterproof_pb_sqm, 5.65, 1e-2);
  check('遮音壁PBには載らない（=0）', Math.round(t.sound_wall_pb_sqm * 100) / 100, 0);
  check('wet_rerouted=1 / nonparty=0',
    [t.beppu_sound_wet_rerouted, t.beppu_sound_nonparty_dropped], [1, 0]);
  const w = (t._warnings || []).find((x) => x.field === 'sound_wall_waterproof_pb');
  check('sound_wall_waterproof_pb 警告が出る', !!w, true);
  check('警告に㎡と件数が入る', /5\.7㎡.*1件|5\.6㎡.*1件/.test(w?.message || ''), true);
}

// ============ 5. ② 面記号経路の振替（開口控除つき） ============
console.log('--- 5. ②面記号経路: 水回りの面遮は面幅×下地高−開口でバケットへ ---');
{
  const wetFace = {
    name: '洗面', ceiling_height_mm: 2400,
    faces: [
      { face: 'A', width_mm: 2200, openings: [] },
      { face: 'B', width_mm: 1100, openings: [] },
      { face: 'C', width_mm: 2200, openings: [] },
      { face: 'D', width_mm: 2440, wall_code: '遮',
        openings: [{ type: '片開き戸', width_mm: 700, height_mm: 2000 }] },
    ],
  };
  const t = computeElevationTakeoff({ rooms: [wetFace] }, [], OPTS);
  // 2.44×2.57 − 0.7×2.0 = 6.2708 − 1.4 = 4.8708
  approx('バケット= 面幅×下地高−開口（2.44×2.57−0.7×2.0≒4.87㎡）',
    t.sound_wall_waterproof_pb_sqm, 4.87, 1e-2);
  check('面経路も遮音壁PBには載らない（=0）', Math.round(t.sound_wall_pb_sqm * 100) / 100, 0);
  check('wet_rerouted=1', t.beppu_sound_wet_rerouted, 1);
}

// ============ 6. ② は壁PBを動かさない（棄却時と同値＝振替先だけの変更） ============
console.log('--- 6. ②の壁PB非干渉: 遮セグの有無で壁PB・巾木は不変 ---');
{
  const withSeg = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [{ code: 'G枠', len_mm: 2250 }]),
      segRoom('便所', [{ code: '遮', len_mm: 2200 }])] }, [], OPTS);
  const withoutSeg = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [{ code: 'G枠', len_mm: 2250 }]),
      segRoom('便所', [])] }, [], OPTS);
  check('便所の遮セグ有無で壁PBが同値（振替は壁PBを触らない）',
    withSeg.wall_pb_sqm, withoutSeg.wall_pb_sqm);
  check('同・遮音壁PBも同値', withSeg.sound_wall_pb_sqm, withoutSeg.sound_wall_pb_sqm);
  check('同・巾木も同値', withSeg.skirting_m, withoutSeg.skirting_m);
  approx('違いはバケットのみ（2.2×2.57≒5.65㎡）',
    withSeg.sound_wall_waterproof_pb_sqm - withoutSeg.sound_wall_waterproof_pb_sqm, 5.65, 1e-2);
}

// ============ 7. ② 対象外: 屋外・倉庫は従来どおりnonparty棄却 ============
console.log('--- 7. バルコニー/倉庫は振替せずnonparty棄却（従来どおり） ---');
for (const nm of ['バルコニー', 'ベランダ', '防災倉庫']) {
  const t = computeElevationTakeoff(
    { rooms: [segRoom(nm, [{ code: 'G枠', len_mm: 2500 }])] }, [], OPTS);
  check(`${nm}: nonparty=1 / wet=0 / バケット0`,
    [t.beppu_sound_nonparty_dropped, t.beppu_sound_wet_rerouted,
      Math.round(t.sound_wall_waterproof_pb_sqm * 100) / 100], [1, 0, 0]);
}

// ============ 8. 表示スコープ外（資材行なし・summaryのみ） ============
console.log('--- 8. バケットは資材行を作らない（filterKenzaiScope外・summaryのみ） ---');
{
  const takeoff = computeElevationTakeoff(
    { rooms: [segRoom('トイレ', [{ code: '遮', len_mm: 2200 }])] }, [], OPTS);
  const mkResult = () => ({
    materials: [
      { name: '壁 石膏ボード', spec: "t-9.5（3'×6'）", category: '建材', quantity: 10, unit: '枚' },
      { name: '遮音壁PB張り', spec: 't9.5+GW', category: '建材', quantity: 13, unit: '㎡' },
      { name: '天井 石膏ボード', spec: "t-9.5（3'×6'）", category: '建材', quantity: 40, unit: '枚' },
    ],
    summary: {},
  });
  const result = mkResult();
  const namesBefore = result.materials.map((m) => m.name);
  applyElevationTakeoff(result, takeoff, {});
  check('資材行は増えない（遮音壁耐水PBの行を新設しない）',
    result.materials.map((m) => m.name), namesBefore);
  approx('summaryに sound_wall_waterproof_pb_sqm が載る（>0時）',
    result.summary.sound_wall_waterproof_pb_sqm, 5.65, 1e-2);
  check('filterKenzaiScopeにも遮音壁耐水の行は現れない',
    filterKenzaiScope(result.materials).some((m) => /遮音壁耐水/.test(m.name)), false);

  // 検出0（アルファ相当）ではsummaryキー自体を書かない＝既存出力とバイト単位で不変
  const takeoffZero = computeElevationTakeoff({ rooms: [plainRoom('洋室(1)')] }, [], OPTS);
  const resultZero = mkResult();
  applyElevationTakeoff(resultZero, takeoffZero, {});
  check('検出0ではsummaryキーを書かない（アルファのバイト不変）',
    'sound_wall_waterproof_pb_sqm' in resultZero.summary, false);
}

// ============ 9. 下地高の反映（水回り指定で振替量が変わる＝値の固定） ============
console.log('--- 9. 振替量は水回り下地高に追従する（別府B実測値 6.20㎡ の再現） ---');
{
  // 別府プロファイル（2720/2820）: 便所の遮@2200 → 2.2×2.82=6.204（replay-beppu Bの6.20と一致）
  const t = computeElevationTakeoff(
    { rooms: [segRoom('便所', [{ code: '遮', len_mm: 2200 }])] }, [],
    { soundWallRule: { pairs: [] }, studHeight: { default_mm: 2720, wet_mm: 2820 } });
  approx('2.2×2.82=6.20㎡（水回り下地高が効く）', t.sound_wall_waterproof_pb_sqm, 6.20, 1e-2);
}

console.log(`\n判定: ✅ ${pass} / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
