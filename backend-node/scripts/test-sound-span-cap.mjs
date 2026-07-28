/**
 * 戸境二重壁（遮/G枠）セグメントの辺長物理上限のユニット検証（2026-07-28）
 *
 * 背景: 面数上限（1部屋2面・住戸6面）を通過してもなお別府Bの遮音壁PBが+101%残る。
 *   主因は「件数」ではなく「1件の長さ」＝LDKの 遮@9700mm 1本（約26㎡＝Bの正解総量26.7㎡に匹敵）。
 *   B住戸の外形は 7350×8500mm で、9700 は自身の最大辺を1200mm超過する（＝住戸内に存在し得ない）。
 *   9700 は A/D/E/F の奥行きと同値＝建物全体の通り芯グリッド値をAIが拾った「帰属間違い」。
 *
 * 物理規則（正解値からの逆算ではない・buildupCalculator.js resolveSoundSpanCapMm の注記参照）:
 *   1住戸の中に、その住戸の外形（通り芯）の最大辺より長い壁は物理的に存在し得ない。
 *   よって セグメント長 > max(外形width, 外形depth) → 誤読として棄却。マージンは足さない
 *   （外形＝通り芯なので実壁はそれ以下＝等倍で既に緩い側。絞るのは正解逆算になるのでしない）。
 *
 * 外形が無い/不正なら上限を課さない（＝1件も棄却しない安全側）。
 *
 * 対象:
 *   1. セグメント経路: 外形超過の遮/G枠を棄却・上限内は不変
 *   2. 境界（等長は残す・+1mmで落ちる）
 *   3. 外形なし/不正（null・欠落・桁違い・0/負）は上限なし＝棄却ゼロ
 *   4. 面記号（face.wall_code）経路にも同じ上限が効く
 *   5. 面数上限より先に適用される（挙動の固定。順序の根拠は「単体で棄却できるものを先に
 *      落としてから集合を評価する」一般原則＝buildupCalculator.js soundSpanCap の注記。
 *      **この順序は別府Bを正解から遠ざける**（逆順+2.5% / 現順+27.9%）ことを承知の上で
 *      正解値に依存しない論拠を優先している）
 *   6. 棄却＝「検出が無かった」扱い（該当セグメントを最初から与えない場合と数量が完全一致）
 *   7. アルファの3桁記号（L14等・beppuマーカーなし）は対象外＝非発火
 *   8. NON_PARTY/水回り振替との順序（水回りは従来どおり振替が先＝辺長上限で消えない）
 *   9. 警告（field:'sound_wall_span_cap'）の内容
 *  10. resolveSoundSpanCapMm の単体
 *  11. フォールト注入: 上限を「無効化」「面数上限の後に適用」に変異させると赤になることを実証
 *
 * 実行: node scripts/test-sound-span-cap.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { computeElevationTakeoff, resolveSoundSpanCapMm } from '../src/services/buildupCalculator.js';

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

// 別府E2Eプロファイル相当（既定遮音ペアは無効化＝この検証と無関係な計上を混ぜない）
const H = 2.57;
const baseOpts = { soundWallRule: { pairs: [] }, studHeight: { default_mm: 2570 } };
const optsWithOuter = (outer) => ({ ...baseOpts, outerDimensionsMm: outer });
// 別府B実測の外形（7350×8500）を模す
const OUTER_B = { width: 7350, depth: 8500 };

// セグメント経路の部屋（面は無記号・plan_placementsに遮/G枠を与える）。
// 同寸重複は collapseDoubledPlacements の縮退対象になるためテストでは全て異寸にする。
function segRoom(name, segs, faceWidths = [6000, 6000, 6000, 6000]) {
  return {
    name, ceiling_height_mm: 2400,
    faces: faceWidths.map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })),
    plan_placements: segs.map(([code, mm]) => ({ code, wall_length_mm: mm })),
  };
}
// 面記号経路の部屋（faces に wall_code を直接与える）
function faceRoom(name, faceDefs) {
  return {
    name, ceiling_height_mm: 2400,
    faces: faceDefs.map(([label, w, code]) => ({ face: label, width_mm: w, wall_code: code, openings: [] })),
  };
}

// ============ 1. セグメント経路: 外形超過を棄却・上限内は不変 ============
console.log('--- 1. 外形の最大辺を超えるセグメントを棄却（別府B 遮@9700 の再現） ---');
{
  // B実測の縮図: LDKに 遮@2500 / 遮@3070 / 遮@9700。外形最大辺8500 → 9700のみ物理的に不可能
  const rooms = [segRoom('LDK', [['遮', 2500], ['遮', 3070], ['遮', 9700]])];
  const t = computeElevationTakeoff({ rooms }, [], optsWithOuter(OUTER_B));
  approx('遮音壁PBは上限内の2件のみ（(2.5+3.07)×2.57）', t.sound_wall_pb_sqm, (2.5 + 3.07) * H);
  check('span_cap_dropped=1', t.beppu_sound_span_cap_dropped, 1);
  check('face_cap_dropped=0（偽物が枠を食わないので本物は落ちない）', t.beppu_sound_face_cap_dropped, 0);
}
{
  // 上限内だけの部屋は完全不変（削る方向のみ・A型の再現: 最大辺9700・最長3250）
  const rooms = [segRoom('LDK', [['遮', 3250], ['G枠', 2250]])];
  const withCap = computeElevationTakeoff({ rooms }, [], optsWithOuter({ width: 8200, depth: 9700 }));
  const noCap = computeElevationTakeoff({ rooms }, [], baseOpts);
  approx('上限内のみ＝遮音壁PBは上限なしと一致', withCap.sound_wall_pb_sqm, noCap.sound_wall_pb_sqm, 1e-9);
  check('span_cap_dropped=0', withCap.beppu_sound_span_cap_dropped, 0);
  check('警告なし', (withCap._warnings || []).some((x) => x.field === 'sound_wall_span_cap'), false);
}

// ============ 2. 境界（等長は残す・+1mmで落ちる） ============
console.log('--- 2. 境界: 上限と等長は残す（住戸全長に及ぶ戸境壁は物理的にありうる） ---');
{
  const eq = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 8500]])] }, [], optsWithOuter(OUTER_B));
  approx('等長8500は計上される', eq.sound_wall_pb_sqm, 8.5 * H);
  check('等長は棄却しない', eq.beppu_sound_span_cap_dropped, 0);

  const over = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 8501]])] }, [], optsWithOuter(OUTER_B));
  approx('8501は棄却（0㎡）', over.sound_wall_pb_sqm, 0);
  check('+1mmで棄却される', over.beppu_sound_span_cap_dropped, 1);
}

// ============ 3. 外形が無い/不正なら上限なし（安全側＝削らない） ============
console.log('--- 3. 外形なし/不正は上限を課さない（過少化を招かない安全側） ---');
{
  const rooms = [segRoom('LDK', [['遮', 9700]])];
  const cases = [
    ['opts未指定（現行の本番配線＝完全後方互換）', baseOpts],
    ['outerDimensionsMm=null', optsWithOuter(null)],
    ['outerDimensionsMm={}（別府C型=外形読めず）', optsWithOuter({})],
    ['width/depthがnull', optsWithOuter({ width: null, depth: null })],
    ['0以下', optsWithOuter({ width: 0, depth: -100 })],
    ['非数（文字列ジャンク）', optsWithOuter({ width: 'abc', depth: 'x' })],
    ['桁落ち誤読（最大辺2000<下限3000）', optsWithOuter({ width: 1500, depth: 2000 })],
    ['桁上がり誤読（最大辺40000>上限30000＝棟全体の寸法）', optsWithOuter({ width: 9000, depth: 40000 })],
  ];
  for (const [label, o] of cases) {
    const t = computeElevationTakeoff({ rooms }, [], o);
    approx(`${label}: 遮@9700が計上される（上限なし）`, t.sound_wall_pb_sqm, 9.7 * H);
    check(`${label}: span_cap_dropped=0`, t.beppu_sound_span_cap_dropped, 0);
  }
}
{
  // 片方だけ読めていれば上限として機能する（最大辺が取れるため）
  const t = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 9700]])] }, [], optsWithOuter({ width: 8500, depth: null }));
  check('片側のみ(width=8500)でも上限は効く', t.beppu_sound_span_cap_dropped, 1);
}

// ============ 4. 面記号（face.wall_code）経路 ============
console.log('--- 4. 面記号経路にも同じ上限が効く ---');
{
  const rooms = [faceRoom('LDK', [['A', 9700, '遮'], ['B', 3000, '遮']])];
  const t = computeElevationTakeoff({ rooms }, [], optsWithOuter(OUTER_B));
  approx('上限内のB面3000のみ計上', t.sound_wall_pb_sqm, 3.0 * H);
  check('face経路 span_cap_dropped=1', t.beppu_sound_span_cap_dropped, 1);
  // 棄却面は「丸ごと落とす」＝壁PBへ振り替えない（面ラベル混同・面数上限と同じ過少側の扱い）。
  // 面A(9700)を最初から与えない場合と壁PBが一致することで確認する
  const without = computeElevationTakeoff(
    { rooms: [faceRoom('LDK', [['B', 3000, '遮']])] }, [], optsWithOuter(OUTER_B));
  approx('棄却面は壁PBへ振り替わらない（面を与えない場合と一致）',
    t.wall_pb_sqm, without.wall_pb_sqm, 1e-9);
}
{
  // 面記号の遮/G枠が上限内なら不変
  const rooms = [faceRoom('LDK', [['A', 3300, '遮']])];
  const withCap = computeElevationTakeoff({ rooms }, [], optsWithOuter(OUTER_B));
  const noCap = computeElevationTakeoff({ rooms }, [], baseOpts);
  approx('上限内のface記号は上限なしと一致', withCap.sound_wall_pb_sqm, noCap.sound_wall_pb_sqm, 1e-9);
  check('face経路 上限内は棄却0', withCap.beppu_sound_span_cap_dropped, 0);
}

// ============ 5. 適用順序（辺長上限 → 面数上限）の固定 ============
// 順序の根拠は「単体で棄却できるものを先に落としてから集合を評価する」一般原則
// （buildupCalculator.js soundSpanCap 定義部の注記）。
// ※ この順序は別府Bを正解から**遠ざける**（逆順27.36㎡=+2.5% / 現順34.16㎡=+27.9%）。
//   ここで固定するのは「現実装がどちらの順序で動いているか」であって、
//   「どちらが正解に近いか」ではない（個別セグメントの真偽は判定できない＝レバー1第8段）。
console.log('--- 5. 適用順序: 辺長上限 → 面数上限（挙動の固定・正解への近さは主張しない） ---');
{
  // 1部屋に3件（上限内2件 + 外形超過1件）。面数上限は「寄与の大きい順に2件」なので、
  // 辺長上限を先に適用すると枠に空きが生まれ、上限内2件がともに採用される。
  const rooms = [segRoom('LDK', [['遮', 2500], ['遮', 3070], ['遮', 9700]])];
  const t = computeElevationTakeoff({ rooms }, [], optsWithOuter(OUTER_B));
  approx('上限内の2件（2500+3070）がともに採用される', t.sound_wall_pb_sqm, (2.5 + 3.07) * H);
  check('face_capは発火しない（枠に空きがある）', t.beppu_sound_face_cap_dropped, 0);
  check('span_capのみ1件', t.beppu_sound_span_cap_dropped, 1);
}
{
  // 辺長上限を通過した寄与単位が4件あれば、面数上限は従来どおり効く（順序変更で面数上限が死んでいない）
  const rooms = [segRoom('LDK', [['遮', 2500], ['遮', 3070], ['遮', 4000], ['遮', 9700]])];
  const t = computeElevationTakeoff({ rooms }, [], optsWithOuter(OUTER_B));
  approx('上位2件（4.0+3.07）のみ＝面数上限は生きている', t.sound_wall_pb_sqm, (4.0 + 3.07) * H);
  check('span_cap=1 / face_cap=1 の両方が効く', [t.beppu_sound_span_cap_dropped, t.beppu_sound_face_cap_dropped], [1, 1]);
}

// ============ 6. 棄却＝「検出が無かった」扱い ============
console.log('--- 6. 棄却は「検出が無かった」扱い（該当セグメント抜きと完全一致） ---');
{
  const withOver = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 2500], ['遮', 9700]])] }, [], optsWithOuter(OUTER_B));
  const without = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 2500]])] }, [], optsWithOuter(OUTER_B));
  // 数量系のすべてのキーで一致すること（壁PB・GW・遮音シート・巾木・周長・下地…）
  const keys = Object.keys(without).filter((k) => typeof without[k] === 'number');
  const diffs = keys.filter((k) => k !== 'beppu_sound_span_cap_dropped'
    && Math.abs(withOver[k] - without[k]) > 1e-9);
  check('数量キーは全一致（span_capカウンタ以外に差分なし）', diffs, []);
  check('カウンタだけが違う', [withOver.beppu_sound_span_cap_dropped, without.beppu_sound_span_cap_dropped], [1, 0]);
}

// ============ 7. アルファ非発火（3桁記号にはbeppuマーカーが無い） ============
console.log('--- 7. アルファの3桁記号（L14/O14/W14）は辺長上限の対象外 ---');
{
  // アルファ相当: L14（間仕切木+GW）を外形超過の長さで与えても棄却されない
  //（この上限は別府の戸境二重壁記号 遮/G枠 専用。アルファのL/O/Wは別の物理＝住戸内遮音壁）
  const rooms = [segRoom('LDK', [['L14', 9700]])];
  const withCap = computeElevationTakeoff({ rooms }, [], optsWithOuter(OUTER_B));
  const noCap = computeElevationTakeoff({ rooms }, [], baseOpts);
  check('L14は棄却されない（span_cap=0）', withCap.beppu_sound_span_cap_dropped, 0);
  const keys = Object.keys(noCap).filter((k) => typeof noCap[k] === 'number');
  const diffs = keys.filter((k) => Math.abs(withCap[k] - noCap[k]) > 1e-9);
  check('アルファ記号のみの記録は外形指定の有無で完全不変', diffs, []);
}

// ============ 8. 既存フィルタとの順序（水回り振替は従来どおり先行） ============
console.log('--- 8. 水回り（SOUND_WET_ROOM_RE）の遮/G枠は従来どおり耐水バケットへ振替 ---');
{
  // 洗面の 遮@9700（外形超過）。水回り振替が先行するので耐水バケットへ入り、span_capでは落ちない
  //（＝辺長上限は既存フィルタの挙動を変えない。②振替の受け皿を奪わない）
  const rooms = [segRoom('洗面', [['遮', 9700]])];
  const t = computeElevationTakeoff({ rooms }, [], optsWithOuter(OUTER_B));
  check('水回り振替が先行（wet_rerouted=1）', t.beppu_sound_wet_rerouted, 1);
  check('span_capでは落ちない', t.beppu_sound_span_cap_dropped, 0);
  approx('耐水バケットに9.7m分', t.sound_wall_waterproof_pb_sqm, 9.7 * H);
}
{
  // バルコニー（NON_PARTY・非水回り）も従来どおり nonparty で落ちる
  const t = computeElevationTakeoff(
    { rooms: [segRoom('バルコニー', [['遮', 9700]])] }, [], optsWithOuter(OUTER_B));
  check('nonparty棄却が先行（nonparty=1 / span_cap=0）',
    [t.beppu_sound_nonparty_dropped, t.beppu_sound_span_cap_dropped], [1, 0]);
}

// ============ 9. 警告 ============
console.log('--- 9. 警告 sound_wall_span_cap ---');
{
  const t = computeElevationTakeoff(
    { rooms: [segRoom('LDK', [['遮', 9700]])] }, [], optsWithOuter(OUTER_B));
  const w = (t._warnings || []).find((x) => x.field === 'sound_wall_span_cap');
  check('警告が出る', !!w, true);
  check('件数が入る', /1件/.test(w?.message || ''), true);
  check('棄却された最長mmが入る', /9700mm/.test(w?.message || ''), true);
  check('上限（外形の最大辺）が入る', /8500mm/.test(w?.message || ''), true);
}

// ============ 10. resolveSoundSpanCapMm 単体 ============
console.log('--- 10. resolveSoundSpanCapMm 単体 ---');
{
  check('正常: 最大辺を返す', resolveSoundSpanCapMm({ width: 7350, depth: 8500 }),
    { capMm: 8500, source: 'outer_dimensions' });
  check('width側が大きい場合も最大辺', resolveSoundSpanCapMm({ width: 9700, depth: 7150 }).capMm, 9700);
  check('undefined → 上限なし', resolveSoundSpanCapMm(undefined), { capMm: null, source: 'none' });
  check('null → 上限なし', resolveSoundSpanCapMm(null), { capMm: null, source: 'none' });
  check('空オブジェクト → 上限なし', resolveSoundSpanCapMm({}), { capMm: null, source: 'none' });
  check('数値でない → 上限なし', resolveSoundSpanCapMm({ width: '八千', depth: null }), { capMm: null, source: 'none' });
  check('下限未満(2999) → 上限なし+reason', resolveSoundSpanCapMm({ width: 2999 }).capMm, null);
  check('下限ちょうど(3000) → 採用', resolveSoundSpanCapMm({ width: 3000 }).capMm, 3000);
  check('上限ちょうど(30000) → 採用', resolveSoundSpanCapMm({ width: 30000 }).capMm, 30000);
  check('上限超過(30001) → 上限なし', resolveSoundSpanCapMm({ width: 30001 }).capMm, null);
  check('文字列数値も受ける（Number変換）', resolveSoundSpanCapMm({ width: '8500' }).capMm, 8500);
}

// ============ 11. フォールト注入（検出力の実証） ============
console.log('--- 11. フォールト注入（このテストが空振りでないことの実証） ---');
{
  // 注入1: 上限を無効化した場合（＝実装前の挙動）に、上の主張が実際に赤くなることを確認する。
  //   実装を書き換える代わりに「外形を渡さない」ことで無効化状態を再現する（同値）。
  const rooms = [segRoom('LDK', [['遮', 2500], ['遮', 3070], ['遮', 9700]])];
  const disabled = computeElevationTakeoff({ rooms }, [], baseOpts);
  const enabled = computeElevationTakeoff({ rooms }, [], optsWithOuter(OUTER_B));
  check('注入1: 上限無効なら遮音壁PBが実装後と一致しない（＝検出力あり）',
    Math.abs(disabled.sound_wall_pb_sqm - enabled.sound_wall_pb_sqm) > 1, true);
  // 実装前の値も明示（面数上限の枠を最長の@9700が取り、@2500が部屋上限で落ちた結果）
  approx('注入1: 上限無効時は (9.7+3.07)×2.57', disabled.sound_wall_pb_sqm, (9.7 + 3.07) * H);

  // 注入2: 「辺長上限を面数上限の後に適用」した場合の値を計算し、現実装と違うことを確認する。
  //   後に適用すると face_cap が先に働き 9700 と 3070 が残り、その後 9700 が落ちて 3070 だけになる。
  //   ※ 別府B実データではこの逆順の方が正解に近い（+2.5% vs 現順+27.9%）。それでも一般原則を
  //     優先して現順序を採っている（正解値で順序を決めない）。ここは挙動の固定のみ。
  const afterOrderValue = 3.07 * H; // 順序を逆にした場合の理論値
  check('注入2: 順序を逆にした理論値とは一致しない（＝順序が効いている）',
    Math.abs(enabled.sound_wall_pb_sqm - afterOrderValue) > 1, true);
  approx('注入2: 現実装は(2.5+3.07)×2.57＝上限内2件', enabled.sound_wall_pb_sqm, (2.5 + 3.07) * H);
}

// 注入3〜5: **実装ソースを実際に変異**させた版を動的importして、上の期待値が赤くなることを実証する
// （注入1/2は「外形を渡さない」「理論値」による間接確認なので、実コードの変異でも裏を取る）。
{
  const src = fs.readFileSync(new URL('../src/services/buildupCalculator.js', import.meta.url), 'utf8');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zairyo-spancap-'));
  const mutants = [
    // 変異A: 上限を常に無効化（capMm=null固定）→ 偽@9700が残るはず
    ['A: 上限を常時無効化', (s) => s.replace(
      'return { capMm: maxSide, source: \'outer_dimensions\' };',
      'return { capMm: null, source: \'none\' };')],
    // 変異B: 判定を「以上」に緩める（> を >=）→ 等長8500が落ちるはず（境界テストが赤くなる）
    ['B: 境界を > から >= へ', (s) => s.replace(
      '&& Number.isFinite(lenMm) && lenMm > soundSpanCap.capMm;',
      '&& Number.isFinite(lenMm) && lenMm >= soundSpanCap.capMm;')],
    // 変異C: 面数上限プレパスから辺長判定を外す（＝偽物が枠を消費）→ 本物2500が押し出されるはず
    ['C: 面数上限プレパスの辺長除外を削除', (s) => s.replace(
      '          if (isSoundSpanOver(len)) return;\n', '')],
  ];
  for (const [label, mutate] of mutants) {
    const mutated = mutate(src);
    if (mutated === src) { fail++; console.log(`✗ 注入 ${label}: ソース置換が当たらなかった（実装変更で陳腐化）`); continue; }
    const file = path.join(tmpDir, `mutant-${label[0]}.js`);
    // 相対import（./timberVolume.js等）を解決するため src/services 直下に置く
    const dst = new URL(`../src/services/__mutant_${label[0]}.js`, import.meta.url);
    fs.writeFileSync(dst, mutated);
    try {
      const m = await import(`${dst.href}?t=${Date.now()}`);
      const rooms = [segRoom('LDK', [['遮', 2500], ['遮', 3070], ['遮', 9700]])];
      const t = m.computeElevationTakeoff({ rooms }, [], optsWithOuter(OUTER_B));
      const eqRooms = [segRoom('LDK', [['遮', 8500]])];
      const tEq = m.computeElevationTakeoff({ rooms: eqRooms }, [], optsWithOuter(OUTER_B));
      const expectedMain = (2.5 + 3.07) * H;   // 正しい実装の値
      const expectedEq = 8.5 * H;              // 正しい実装の境界値
      const detected = Math.abs(t.sound_wall_pb_sqm - expectedMain) > 1e-6
        || Math.abs(tEq.sound_wall_pb_sqm - expectedEq) > 1e-6;
      check(`注入 ${label}: 主張が赤くなる（検出力あり）`, detected, true);
      if (!detected) console.log(`    mutant値: main=${t.sound_wall_pb_sqm} eq=${tEq.sound_wall_pb_sqm}`);
    } finally {
      fs.rmSync(dst, { force: true });
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\n=== ${pass} ✅ / ${fail} ✗ ===`);
process.exit(fail > 0 ? 1 : 0);
