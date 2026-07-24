/**
 * 別府4丁目方式（1文字の壁仕上記号）マッピング層のユニットテスト（純関数・実AI呼び出しゼロ）
 *
 * 【検証すること】
 *   A. 別府記号→内部表現（base/mid/surf）の変換が凡例どおりか
 *   B. アルファ方式（3桁 G14/C04）が完全に不変か（相互汚染がないこと）
 *   C. 記号ありデータで「全面デフォルトPB扱い」が解消されること（暴発の解消方向）
 *   D. 安全弁（遮/G枠の全面適用禁止・Ｇの二義性の既定）が効いていること
 *
 * 【検証しないこと（答え合わせの禁止）】
 *   別府Ａタイプの正解値（壁PB75.497等）への一致は**目標にしない**。
 *   記号の面への割り当ては図面から完全には読み切れておらず（遮が洋室3・LDKの右側に
 *   あることのみ実測確認済み）、正解へ寄せるように記号を置くと答え合わせになる。
 *   ここでは「凡例の意味どおりに変換されるか」「暴発が止まるか」だけを見る。
 *
 * 凡例の出典（2026-07-24 実測・意匠図 page_036 Ａタイプ平面詳細図の凡例2箇所）:
 *   丸囲みＡ〜Ｇの表（図面下部中央）:
 *     Ａ ビニルクロス貼、ＰＢt9.5 / Ｂ 同（ＧＬ工法） / Ｃ ビニルクロス貼、コンクリート打放し補修 /
 *     Ｄ 吹付けタイル、打放し補修 / Ｅ アクリル系リシン吹付け、打放し補修 /
 *     Ｆ アクリル系リシン吹付け、ＬＧＳ下地＋ケイカル板t6.0 / Ｇ コンクリート打放し補修のまま
 *   図面右欄の凡例:
 *     (丸囲み)遮 戸境二重遮音壁：胴縁+ＰＢt9.5(グラスウール24Ｋ充填)+遮音シート+ＰＢt9.5
 *     [枠囲み]Ｇ 戸境二重壁：胴縁＋ＰＢt9.5（グラスウール24Ｋ充填）
 *   ※Ｇが丸囲み=打放し / 枠囲み=戸境二重壁 の二義。囲み形状で区別される（実測で確認）
 *
 * 実行: node scripts/test-beppu-wallcode.mjs
 */
import {
  parseWallCode, parseBeppuWallCode, canonicalizeWallCode,
  computeElevationTakeoff, validateTakeoffSanity, hasNoWallCodes,
  applyElevationTakeoff, DEFAULT_SOUND_WALL_PAIRS,
} from '../src/services/buildupCalculator.js';
import { aggregateWallCodeItems, voteWallCodeRuns } from '../src/services/claudeApi.js';

let ok = 0, fail = 0;
const failures = [];
function check(label, cond, detail = '') {
  if (cond) { ok++; return true; }
  fail++; failures.push(`${label}${detail ? ' — ' + detail : ''}`);
  return false;
}
function eqCode(label, actual, expect) {
  const a = actual ? `${actual.base}/${actual.mid}/${actual.surf}` : String(actual);
  const e = `${expect.base}/${expect.mid}/${expect.surf}`;
  return check(label, a === e, `expected ${e}, actual ${a}`);
}
function near(label, actual, expected, tol) {
  const good = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  return check(label, good, good ? '' : `expected ${expected}±${tol}, actual ${actual}`);
}

console.log('=== 別府方式 壁仕上記号マッピング ユニットテスト ===\n');

// ============================================================
// A. 記号→内部表現の変換（凡例どおりか）
// ============================================================
console.log('--- A. 別府記号→内部表現（凡例の構成と一致するか） ---');

// Ａ: 間仕切下地+PB9.5+ビニルクロス = 壁PBに入る（アルファG14と同一構成）
eqCode('A1 Ａ=間仕切+PB9.5+クロス', parseWallCode('A'), { base: 'G', mid: 1, surf: 4 });
// Ｂ: GL工法のPB。D下地×中間4 → EV廻り/防露ふかし壁の部位（別府XLSにも「防露ふかし壁（ＰＢ）」行あり）
eqCode('A2 Ｂ=GL工法PB', parseWallCode('B'), { base: 'D', mid: 4, surf: 4 });
// Ｃ: 打放し補修+クロス → PBなし（mid=0）・クロスあり（surf=4）
eqCode('A3 Ｃ=打放し+クロス(PBなし)', parseWallCode('C'), { base: 'C', mid: 0, surf: 4 });
// Ｄ/Ｅ: 打放し補修+吹付け → PBなし・クロスなし
eqCode('A4 Ｄ=打放し+吹付タイル', parseWallCode('D'), { base: 'C', mid: 0, surf: 0 });
eqCode('A5 Ｅ=打放し+リシン吹付', parseWallCode('E'), { base: 'C', mid: 0, surf: 0 });
// Ｆ: ケイカル板t6.0 → **PBではない**。中間0でPB系に混ざらないこと
eqCode('A6 Ｆ=ケイカル板(PBでない)', parseWallCode('F'), { base: 'G', mid: 0, surf: 0 });
check('A6b Ｆはmid=0でPB部位に入らない', parseWallCode('F').mid === 0);
// Ｇ(丸囲み・既定): 打放し補修のまま → PBなし
eqCode('A7 Ｇ(既定)=打放しのまま', parseWallCode('G'), { base: 'C', mid: 0, surf: 0 });
// 遮: 戸境二重遮音壁 → 遮音系(W)+PB+GW+遮音シート
eqCode('A8 遮=戸境二重遮音壁', parseWallCode('遮'), { base: 'W', mid: 1, surf: 4 });
check('A8b 遮は遮音シートを持つ', parseWallCode('遮').sound_sheet === true);
// Ｇ(枠囲み): 戸境二重壁 → 遮音系(W)+PB+GW・遮音シートなし
eqCode('A9 Ｇ(枠)=戸境二重壁', parseWallCode('G枠'), { base: 'W', mid: 1, surf: 4 });
check('A9b Ｇ(枠)は遮音シートを持たない', parseWallCode('G枠').sound_sheet !== true);

// 表記ゆれ（全角・丸囲み文字・説明語）
eqCode('A10 全角Ａ', parseWallCode('Ａ'), { base: 'G', mid: 1, surf: 4 });
eqCode('A11 丸囲み文字Ⓐ', parseWallCode('Ⓐ'), { base: 'G', mid: 1, surf: 4 });
eqCode('A12 「遮音」表記', parseWallCode('遮音'), { base: 'W', mid: 1, surf: 4 });
eqCode('A13 「戸境」表記=戸境二重壁', parseWallCode('戸境'), { base: 'W', mid: 1, surf: 4 });
eqCode('A14 G(枠)表記ゆれ', parseWallCode('G(枠)'), { base: 'W', mid: 1, surf: 4 });
eqCode('A15 G（全角枠）表記ゆれ', parseWallCode('G（枠）'), { base: 'W', mid: 1, surf: 4 });
eqCode('A16 小文字a', parseWallCode('a'), { base: 'G', mid: 1, surf: 4 });
eqCode('A17 前後空白', parseWallCode(' A '), { base: 'G', mid: 1, surf: 4 });

// 無効入力
check('A18 空文字はnull', parseWallCode('') === null);
check('A19 未定義記号Xはnull', parseWallCode('X') === null);
check('A20 数字はnull', parseWallCode('1') === null);
check('A21 非文字列はnull', parseWallCode(null) === null && parseWallCode(undefined) === null);
check('A22 長い日本語はnull', parseWallCode('壁') === null);
check('A23 2文字の英字はnull', parseWallCode('AB') === null);

// beppuマーカーの付与（別府由来であることの識別子。アルファ側には付かない=B4で検証）
check('A24 別府記号にはbeppuマーカーが付く', parseWallCode('A').beppu === 'A');
check('A25 別名は正規キーへ解決される', parseWallCode('戸境').beppu === 'G枠');

// ============================================================
// A'. Ｇの二義性（囲み形状ヒント）
// ============================================================
console.log('--- A\'. Ｇの二義性（丸囲み=打放し / 枠囲み=戸境二重壁） ---');

// ヒントなし＝既定は「打放し」（安全側: 誤って戸境二重壁にするとPB+GWが暴発するため）
eqCode('G1 ヒントなしは打放し(既定)', parseBeppuWallCode('G'), { base: 'C', mid: 0, surf: 0 });
// 枠囲みのヒントがあれば戸境二重壁へ
eqCode('G2 shape=boxで戸境二重壁', parseBeppuWallCode('G', { shape: 'box' }), { base: 'W', mid: 1, surf: 4 });
eqCode('G3 shape=枠で戸境二重壁', parseBeppuWallCode('G', { shape: '枠' }), { base: 'W', mid: 1, surf: 4 });
eqCode('G4 shape=四角で戸境二重壁', parseBeppuWallCode('G', { shape: '四角' }), { base: 'W', mid: 1, surf: 4 });
// 丸囲みのヒントは既定と同じ（打放し）
eqCode('G5 shape=circleは打放し', parseBeppuWallCode('G', { shape: 'circle' }), { base: 'C', mid: 0, surf: 0 });
eqCode('G6 shape=丸は打放し', parseBeppuWallCode('G', { shape: '丸' }), { base: 'C', mid: 0, surf: 0 });
// enclosureキーでも受ける
eqCode('G7 enclosure=boxで戸境二重壁', parseBeppuWallCode('G', { enclosure: 'box' }), { base: 'W', mid: 1, surf: 4 });
// ヒントはＧ以外の記号の意味を変えない（一意な記号は形状に依らない）
eqCode('G8 Ａはshape=boxでも意味不変', parseBeppuWallCode('A', { shape: 'box' }), { base: 'G', mid: 1, surf: 4 });
eqCode('G9 遮はshape=boxでも意味不変', parseBeppuWallCode('遮', { shape: 'box' }), { base: 'W', mid: 1, surf: 4 });
// 明示の 'G枠' はヒント無しでも戸境二重壁（プロンプトが別表記で返す経路）
eqCode('G10 明示G枠はヒント不要', parseBeppuWallCode('G枠'), { base: 'W', mid: 1, surf: 4 });

// ============================================================
// B. アルファ方式の不変（相互汚染がないこと）
// ============================================================
console.log('--- B. アルファ方式（3桁）の不変 ---');

eqCode('B1 G14不変', parseWallCode('G14'), { base: 'G', mid: 1, surf: 4 });
eqCode('B2 C04不変', parseWallCode('C04'), { base: 'C', mid: 0, surf: 4 });
eqCode('B3 D64不変', parseWallCode('D64'), { base: 'D', mid: 6, surf: 4 });
eqCode('B3b L14不変', parseWallCode('L14'), { base: 'L', mid: 1, surf: 4 });
eqCode('B3c G24不変', parseWallCode('G24'), { base: 'G', mid: 2, surf: 4 });
eqCode('B3d I14不変', parseWallCode('I14'), { base: 'I', mid: 1, surf: 4 });
// 3桁コードにbeppuマーカーやsound_sheetが付かない（=アルファの下流分岐が一切変わらない）
check('B4 3桁にbeppuマーカーが付かない', parseWallCode('G14').beppu === undefined);
check('B5 3桁にsound_sheetが付かない', parseWallCode('L14').sound_sheet === undefined
  && parseWallCode('O14').sound_sheet === undefined);
// 不正な3桁は従来どおり弾かれる（別府パスへ落ちて誤救済されないこと）
check('B6 T14は従来どおりnull', parseWallCode('T14') === null);
check('B7 X99は従来どおりnull', parseWallCode('X99') === null);
// 同じ文字でも桁数で完全に分岐する（別府Ｇ=打放し / アルファG14=間仕切PB）
check('B8 別府ＧとアルファG14は別物',
  parseWallCode('G').mid === 0 && parseWallCode('G14').mid === 1);
check('B9 別府ＤとアルファD14は別物',
  parseWallCode('D').base === 'C' && parseWallCode('D14').base === 'D');

// ============================================================
// B''. canonicalizeWallCode（shape→記号文字列の畳み込み）
// ============================================================
console.log('--- B\'\'. 囲み形状の畳み込み（保存する記号文字列の確定） ---');
// 四角囲みのＧだけ 'G枠' へ確定。丸囲み・形状不明は 'G'（打放し=安全側の既定）のまま
check('K1 shape=boxのＧはG枠へ確定', canonicalizeWallCode('G', 'box') === 'G枠');
check('K2 shape=circleのＧはGのまま', canonicalizeWallCode('G', 'circle') === 'G');
check('K3 shapeなしのＧはGのまま（既定=打放し）', canonicalizeWallCode('G', null) === 'G');
check('K4 shape=枠のＧはG枠へ確定', canonicalizeWallCode('G', '枠') === 'G枠');
check('K5 Ａはshapeに依らずA', canonicalizeWallCode('A', 'box') === 'A'
  && canonicalizeWallCode('A', 'circle') === 'A');
check('K6 遮はshapeに依らず遮', canonicalizeWallCode('遮', 'box') === '遮');
check('K7 全角Ａは半角Aへ正規化', canonicalizeWallCode('Ａ', null) === 'A');
// アルファの3桁はshapeを無視して素通し（従来と完全同一）
check('K8 3桁はshapeがあっても素通し', canonicalizeWallCode('G14', 'box') === 'G14'
  && canonicalizeWallCode('C04', 'circle') === 'C04');
check('K9 3桁の小文字は大文字化のみ', canonicalizeWallCode('g14', null) === 'G14');
check('K10 無効記号はnull', canonicalizeWallCode('ダミー', null) === null
  && canonicalizeWallCode('', null) === null && canonicalizeWallCode(null, null) === null);
// 畳み込み後の文字列を再パースすると意図した構成になる（保存→再計算の往復で意味が保たれる）
{
  const box = canonicalizeWallCode('G', 'box');
  const circle = canonicalizeWallCode('G', 'circle');
  eqCode('K11 G枠を再パース=戸境二重壁', parseWallCode(box), { base: 'W', mid: 1, surf: 4 });
  eqCode('K12 Gを再パース=打放し', parseWallCode(circle), { base: 'C', mid: 0, surf: 0 });
}

// ============================================================
// B'. 集約層（claudeApi.aggregateWallCodeItems）の門番
// ============================================================
console.log('--- B\'. 集約層が別府記号を通し、アルファ挙動は不変か ---');

{
  // 別府記号が集約段で捨てられない（旧実装は /^[A-Z][0-9][0-9]$/ で全て落としていた）
  const agg = aggregateWallCodeItems([
    { room: '洋室3', code: '遮', wall_length_mm: 3250, _tile: 1 },
    { room: '洋室3', code: 'A', wall_length_mm: 2250, _tile: 1 },
    { room: '洋室3', code: 'ダミー', wall_length_mm: 999, _tile: 1 }, // 無効記号は落ちる
  ]);
  const room = agg.find((r) => r.room === '洋室3');
  check('C1 別府記号が集約を通る', !!room && room.placements.length === 2,
    `placements=${JSON.stringify(room?.placements)}`);
  check('C2 無効記号は集約で落ちる',
    !!room && !room.placements.some((p) => p.code === 'ダミー'));
  check('C3 遮の寸法が保持される',
    !!room && room.placements.some((p) => p.code === '遮' && p.wall_length_mm === 3250));
}
{
  // アルファの集約挙動が不変（同一タイル内の等寸2件=対面2枚の保持）
  const agg = aggregateWallCodeItems([
    { room: '洋室(1)', code: 'C04', wall_length_mm: 5190, _tile: 1 },
    { room: '洋室(1)', code: 'C04', wall_length_mm: 5190, _tile: 1 },
    { room: '洋室(1)', code: 'I14', wall_length_mm: 2575, _tile: 1 },
  ]);
  const room = agg.find((r) => r.room === '洋室(1)');
  const c04 = room.placements.filter((p) => p.code === 'C04');
  check('C4 アルファ等寸対面2枚の保持が不変', c04.length === 2, `C04=${c04.length}`);
  check('C5 アルファのI14が残る', room.placements.some((p) => p.code === 'I14'));
}
{
  // 囲み形状が集約段で記号文字列へ畳み込まれる（保存データにshapeを増やさずに意味を保持）
  const agg = aggregateWallCodeItems([
    { room: '洋室3', code: 'G', wall_length_mm: 2250, shape: 'box', _tile: 1 },
    { room: '洋室3', code: 'G', wall_length_mm: 3250, shape: 'circle', _tile: 1 },
  ]);
  const room = agg.find((r) => r.room === '洋室3');
  check('C6 四角囲みＧはG枠として保存される',
    room.placements.some((p) => p.code === 'G枠' && p.wall_length_mm === 2250),
    JSON.stringify(room.placements));
  check('C7 丸囲みＧはGとして保存される',
    room.placements.some((p) => p.code === 'G' && p.wall_length_mm === 3250));
  check('C8 同じ「G」でも囲みが違えば別クラスタになる', room.placements.length === 2);
  // 保存された文字列を再パースすると別々の構成に解決される（往復の一貫性）
  check('C9 G枠とGは再パースで別構成',
    parseWallCode('G枠').base === 'W' && parseWallCode('G').base === 'C');
}
{
  // 門番厳格化の固定（should-fix②・2026-07-24）: 旧正規表現 /^[A-Z][0-9][0-9]$/ は下地英字を
  // 検証しないため凡例外の3桁（T14/X99）も集約を通していた。新門番parseWallCodeは
  // VALID_BASE_CODES='ZCDGHILSOW' で弾く＝集約段で落ちる（挙動変化。下流影響は無いが記録する）
  const agg = aggregateWallCodeItems([
    { room: '洋室(1)', code: 'T14', wall_length_mm: 3000, _tile: 1 }, // T=凡例外の下地
    { room: '洋室(1)', code: 'X99', wall_length_mm: 3100, _tile: 1 }, // X=凡例外の下地
    { room: '洋室(1)', code: 'G14', wall_length_mm: 3200, _tile: 1 }, // 有効記号（対照）
  ]);
  const room = agg.find((r) => r.room === '洋室(1)');
  check('C12 凡例外の3桁(T14/X99)は集約で落ちる',
    !!room && !room.placements.some((p) => p.code === 'T14' || p.code === 'X99'),
    JSON.stringify(room?.placements));
  check('C13 同時に有効な3桁(G14)は通る',
    !!room && room.placements.length === 1 && room.placements[0].code === 'G14',
    JSON.stringify(room?.placements));
}
{
  // 多数決層（1run=集約そのまま）でも畳み込みが効く
  const v = voteWallCodeRuns([
    { items: [{ room: '洋室3', code: 'G', wall_length_mm: 2250, shape: 'box', _tile: 1 }],
      failedTiles: [] },
  ]);
  check('C10 多数決層でもG枠が保持される',
    v[0]?.placements?.[0]?.code === 'G枠', JSON.stringify(v));
  check('C11 多数決層の出力に_tileが漏れない',
    v[0]?.placements?.[0]?._tile === undefined);
}

// ============================================================
// C. 記号ありデータで全面デフォルトPB扱いが解消されるか
// ============================================================
// 別府Ａタイプの展開図実測（面幅mm・page_037・メインループ実測値をそのまま使用）。
// **記号の面への割り当ては仮**（図面から全面は読み切れていない）。ここでの目的は
// 「記号が入れば全面PB扱いが止まるか」の方向確認であり、正解値への一致ではない。
console.log('--- C. 記号あり/なしで全面デフォルトPB扱いが解消されるか ---');

const mkRoom = (name, ch, widths, codes = {}) => ({
  name,
  ceiling_height_mm: ch,
  skirting: '木製巾木H=40',
  faces: widths.map((w, i) => ({
    face: 'ABCD'[i], width_mm: w, wall_code: codes['ABCD'[i]] || null, openings: [],
  })),
});

// 面幅（page_037実測。分割表記は合算値）
const FACES = {
  '玄関・廊下': [2250, [2150, 4450, 1000, 4450]],
  'LDK': [2500, [8200, 5150, 8200, 6950]],
  '洋室1': [2500, [3950, 2500, 3950, 3500]],
  '洋室2': [2500, [3950, 2200, 3950, 2200]],
  '洋室3': [2500, [3240, 2950, 3250, 2250]],
  '洗面': [2200, [3250, 1800, 3250, 1800]],
  'トイレ': [2200, [1700, 950, 1700, 950]],
  'WCL': [2200, [3500, 1275, 1275, 1275]],
  'SCL': [2250, [1950, 1000, 1950, 1000]],
};
// 別府Ａタイプの下地高（XLSタイプ別シート実測: 一般2.72 / 水回り2.82）
const BEPPU_A_OPTS = {
  studHeight: { default_mm: 2720, wet_mm: 2820 },
  // 遮音壁はアルファGタイプ専用の宣言的ルール（LDK↔洋1 1450等）を使わず、
  // 別府は図面の「遮」記号から拾う。ルールを無効化しないと他物件の壁を幻計上する
  soundWallRule: { pairs: [] },
};
const elevNoCode = { rooms: Object.entries(FACES).map(([n, [ch, w]]) => mkRoom(n, ch, w)) };

// 記号なし（現状の失敗の再現）
const tNo = computeElevationTakeoff(elevNoCode, [], BEPPU_A_OPTS);
check('D1 記号なしは全面PB扱いで暴発する（現状の再現）', tNo.wall_pb_sqm > 200,
  `wall_pb=${tNo.wall_pb_sqm.toFixed(1)}`);
check('D2 記号なしは遮音壁PBがゼロ', tNo.sound_wall_pb_sqm === 0);

// 記号あり（仮の割当。実測で確認済みなのは「遮が洋室3・LDKの右側の壁」のみ。
// 他は凡例の意味を確認するための仮置きであり正解主張ではない）
const elevCoded = {
  rooms: [
    mkRoom('玄関・廊下', 2250, FACES['玄関・廊下'][1], { A: 'A', B: 'A', C: 'A', D: 'A' }),
    mkRoom('LDK', 2500, FACES['LDK'][1], { A: 'A', B: 'A', C: '遮', D: 'C' }),
    mkRoom('洋室1', 2500, FACES['洋室1'][1], { A: 'A', B: 'A', C: 'C', D: 'A' }),
    mkRoom('洋室2', 2500, FACES['洋室2'][1], { A: 'A', B: 'A', C: 'C', D: 'A' }),
    mkRoom('洋室3', 2500, FACES['洋室3'][1], { A: 'A', B: 'A', C: '遮', D: 'A' }),
    mkRoom('洗面', 2200, FACES['洗面'][1], { A: 'A', B: 'A', C: 'A', D: 'A' }),
    mkRoom('トイレ', 2200, FACES['トイレ'][1], { A: 'A', B: 'A', C: 'A', D: 'A' }),
    mkRoom('WCL', 2200, FACES['WCL'][1], { A: 'A', B: 'A', C: 'A', D: 'A' }),
    mkRoom('SCL', 2250, FACES['SCL'][1], { A: 'A', B: 'A', C: 'A', D: 'A' }),
  ],
};
const tCoded = computeElevationTakeoff(elevCoded, [], BEPPU_A_OPTS);

check('D3 記号ありで壁PBが減る（全面PB扱いの解消）', tCoded.wall_pb_sqm < tNo.wall_pb_sqm,
  `記号なし${tNo.wall_pb_sqm.toFixed(1)} → 記号あり${tCoded.wall_pb_sqm.toFixed(1)}`);
check('D4 遮記号が遮音壁PBへ振り分けられる', tCoded.sound_wall_pb_sqm > 0,
  `sound=${tCoded.sound_wall_pb_sqm.toFixed(2)}`);
check('D5 遮記号がGWを発生させる', tCoded.gw_sqm > 0, `gw=${tCoded.gw_sqm.toFixed(2)}`);
check('D6 遮記号が遮音シートを発生させる（別府はGWと同居）', tCoded.sound_sheet_sqm > 0,
  `sheet=${tCoded.sound_sheet_sqm.toFixed(2)}`);
check('D7 遮のGWと遮音シートは同量（同じ壁の別部材）',
  Math.abs(tCoded.gw_sqm - tCoded.sound_sheet_sqm) < 0.001,
  `gw=${tCoded.gw_sqm.toFixed(3)} sheet=${tCoded.sound_sheet_sqm.toFixed(3)}`);
// Ｃ（打放し）の面は壁PBに入らないがクロスには入る
check('D8 Ｃ面は壁PBに入らずクロスに入る', tCoded.cloth_sqm > 0);

// 遮音壁は下地高（2.72）で拾う＝面の仕上げ高（CH+40=2.54）より大きい
{
  const shaWidthM = (8200 + 3250) / 1000; // LDK C面 + 洋室3 C面（仮割当）
  near('D9 遮音壁PBは下地高2.72で拾う', tCoded.sound_wall_pb_sqm, shaWidthM * 2.72, 0.01);
}

// ============================================================
// D. 安全弁: 遮/G枠の全面適用禁止（roomDefaultCode）
// ============================================================
console.log('--- D. 安全弁（遮/Ｇ枠を部屋全面に広げない） ---');
{
  // 部屋の読取記号が「遮」1種類だけ = plan_codes に遮のみ。
  // これを全面適用すると四方全部が遮音壁PBになり暴発する
  const elev = { rooms: [{
    name: '洋室3', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    plan_codes: ['遮'],
    faces: [3240, 2950, 3250, 2250].map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })),
  }] };
  const t = computeElevationTakeoff(elev, [], BEPPU_A_OPTS);
  check('E1 遮のみの部屋でも全面遮音壁にならない', t.sound_wall_pb_sqm === 0,
    `sound=${t.sound_wall_pb_sqm.toFixed(2)}`);
  check('E2 遮のみの部屋はデフォルトPB扱いのまま（過大側だが暴走しない）', t.wall_pb_sqm > 0);
}
{
  // Ｇ枠も同様に全面適用しない
  const elev = { rooms: [{
    name: '洋室3', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    plan_codes: ['G枠'],
    faces: [3240, 2950, 3250, 2250].map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })),
  }] };
  const t = computeElevationTakeoff(elev, [], BEPPU_A_OPTS);
  check('E3 Ｇ枠のみの部屋でも全面遮音壁にならない', t.sound_wall_pb_sqm === 0);
}
{
  // Ａ（通常PB）は従来どおり全面適用してよい（アルファのG14と同じ扱い）
  const elev = { rooms: [{
    name: '洋室1', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    plan_codes: ['A'],
    faces: [3950, 2500, 3950, 3500].map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })),
  }] };
  const t = computeElevationTakeoff(elev, [], BEPPU_A_OPTS);
  const perim = (3950 + 2500 + 3950 + 3500) / 1000;
  near('E4 Ａのみの部屋は全面PB（CH+40で拾う）', t.wall_pb_sqm, perim * 2.54, 0.01);
}
{
  // Ｃ/Ｇ（打放し）は全面適用しない（アルファのC04と同じ安全弁が効く）
  const elev = { rooms: [{
    name: '洋室1', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    plan_codes: ['G'],
    faces: [3950, 2500, 3950, 3500].map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })),
  }] };
  const t = computeElevationTakeoff(elev, [], BEPPU_A_OPTS);
  check('E5 Ｇ(打放し)は全面適用されずデフォルトPBのまま', t.wall_pb_sqm > 0);
}

// ============================================================
// E. plan_placements（記号＋寸法mm）による面割付が別府記号でも効くか
// ============================================================
console.log('--- E. 寸法マッチによる面割付（別府記号） ---');
{
  // 洋室3: 面幅3250のC面に遮を割り付ける（平面図の壁寸法3250をマッチ）
  const elev = { rooms: [{
    name: '洋室3', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    plan_placements: [{ code: '遮', wall_length_mm: 3250 }],
    faces: [3240, 2950, 3250, 2250].map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })),
  }] };
  const t = computeElevationTakeoff(elev, [], BEPPU_A_OPTS);
  check('F1 遮placementが面へ割り付く', t.sound_wall_pb_sqm > 0,
    `sound=${t.sound_wall_pb_sqm.toFixed(2)}`);
  // 3240と3250は±80以内で両方候補だが、距離最小（3250）が優先され1面だけ消費される
  near('F2 遮は1面だけ消費される（3.25m×2.72）', t.sound_wall_pb_sqm, 3.25 * 2.72, 0.01);
}
{
  // Ｃ（打放し）placementで壁PBから面が除外される
  const facesW = [3950, 2500, 3950, 3500];
  const base = { name: '洋室1', ceiling_height_mm: 2500, skirting: '木製巾木H=40' };
  const mk = (pl) => ({ rooms: [{ ...base, plan_placements: pl,
    faces: facesW.map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })) }] });
  const t0 = computeElevationTakeoff(mk([]), [], BEPPU_A_OPTS);
  const t1 = computeElevationTakeoff(mk([{ code: 'C', wall_length_mm: 2500 }]), [], BEPPU_A_OPTS);
  near('F3 Ｃ面が壁PBから除外される', t1.wall_pb_sqm, t0.wall_pb_sqm - 2.5 * 2.54, 0.01);
  check('F4 Ｃ面のクロスは残る', t1.cloth_sqm > 0);
}
{
  // Ｂ（GL工法）は壁PBでなくEV廻り/防露ふかし壁の部位へ
  const elev = { rooms: [{
    name: '洋室1', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    plan_placements: [{ code: 'B', wall_length_mm: 2500 }],
    faces: [3950, 2500, 3950, 3500].map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })),
  }] };
  const t = computeElevationTakeoff(elev, [], BEPPU_A_OPTS);
  near('F5 ＢはEV廻り/防露ふかし壁へ', t.ev_wall_pb_sqm, 2.5 * 2.54, 0.01);
}
{
  // Ｆ（ケイカル板）はPB系のどの部位にも入らない
  const elev = { rooms: [{
    name: '洋室1', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    plan_placements: [{ code: 'F', wall_length_mm: 2500 }],
    faces: [3950, 2500, 3950, 3500].map((w, i) => ({ face: 'ABCD'[i], width_mm: w, openings: [] })),
  }] };
  const t = computeElevationTakeoff(elev, [], BEPPU_A_OPTS);
  const t0 = computeElevationTakeoff({ rooms: [{ ...elev.rooms[0], plan_placements: [] }] }, [], BEPPU_A_OPTS);
  near('F6 Ｆ面は壁PBから外れる', t.wall_pb_sqm, t0.wall_pb_sqm - 2.5 * 2.54, 0.01);
  check('F7 Ｆ面は耐水・EV・遮音のどこにも入らない',
    t.waterproof_pb_sqm === 0 && t.ev_wall_pb_sqm === 0 && t.sound_wall_pb_sqm === 0);
}

// ============================================================
// F. サニティ（壁PB比の上限）が記号対応で改善方向に動くか
// ============================================================
console.log('--- F. サニティ判定の変化 ---');
{
  const AREA = 83.43; // 別府Ａタイプ住戸面積（page_036記載）
  const sNo = validateTakeoffSanity(tNo, { totalFloorAreaSqm: AREA, elevations: elevNoCode });
  const sCoded = validateTakeoffSanity(tCoded, { totalFloorAreaSqm: AREA, elevations: elevCoded });
  const rNo = tNo.wall_pb_sqm / AREA;
  const rCoded = tCoded.wall_pb_sqm / AREA;
  check('H1 記号なしはサニティNG（現状の再現）', sNo.ok === false,
    `ratio=${rNo.toFixed(2)}`);
  check('H2 記号ありで比率が下がる', rCoded < rNo,
    `${rNo.toFixed(2)} → ${rCoded.toFixed(2)}`);
  console.log(`   [参考] 壁PB比 記号なし ${rNo.toFixed(2)} / 記号あり ${rCoded.toFixed(2)}`
    + `（上限2.4・サニティ${sCoded.ok ? 'OK' : 'NG'}）`);
}

// ============================================================
// G. 既存の周辺機能が別府記号を認識するか
// ============================================================
console.log('--- G. 周辺機能（記号ゼロ判定）との接続 ---');
{
  // hasNoWallCodesが別府記号を「記号あり」と認識する（しないと別府で常に
  // 「記号が1つも読めていない」警告が出続け、本物の読取失敗が埋もれる）
  const withBeppu = { rooms: [{ name: '洋室3', faces: [{ wall_code: '遮' }] }] };
  const withBeppuPlan = { rooms: [{ name: '洋室3', faces: [{ wall_code: null }], plan_codes: ['A'] }] };
  const withBeppuPl = { rooms: [{ name: '洋室3', faces: [{ wall_code: null }],
    plan_placements: [{ code: 'G枠', wall_length_mm: 2250 }] }] };
  const none = { rooms: [{ name: '洋室3', faces: [{ wall_code: null }] }] };
  check('J1 面の別府記号を認識', hasNoWallCodes(withBeppu) === false);
  check('J2 plan_codesの別府記号を認識', hasNoWallCodes(withBeppuPlan) === false);
  check('J3 plan_placementsの別府記号を認識', hasNoWallCodes(withBeppuPl) === false);
  check('J4 記号ゼロは従来どおりtrue', hasNoWallCodes(none) === true);
}
{
  // Ｄ/Ｅ/Ｇ（打放し系）は内部表現が同一になる。第0パスの記号一致比較で
  // 面'D'とplacement'E'が入れ替わって消費されうるが、どちらもPBゼロ部位のため
  // 数量への影響がないことを明示的に固定する（設計上の許容として記録）
  const mkE = (faceCode, plCode) => ({ rooms: [{
    name: '洋室1', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    plan_placements: [{ code: plCode, wall_length_mm: 2500 }],
    faces: [3950, 2500, 3950, 3500].map((w, i) => ({
      face: 'ABCD'[i], width_mm: w, wall_code: i === 1 ? faceCode : null, openings: [] })),
  }] });
  const tDD = computeElevationTakeoff(mkE('D', 'D'), [], BEPPU_A_OPTS);
  const tDE = computeElevationTakeoff(mkE('D', 'E'), [], BEPPU_A_OPTS);
  check('J5 打放し系Ｄ/Ｅの取り違えは数量に影響しない',
    Math.abs(tDD.wall_pb_sqm - tDE.wall_pb_sqm) < 0.001,
    `D/D=${tDD.wall_pb_sqm.toFixed(3)} D/E=${tDE.wall_pb_sqm.toFixed(3)}`);
}

// ============================================================
// H. 静かな過少・デッドエンドの可視化（2026-07-24 レビュー指摘の警告群）
// ============================================================
console.log('--- H. 要確認警告（Ｇ形状不明・既定遮音ルール・遮音シート・EV桁乖離） ---');

const warnFields = (t) => (t._warnings || []).map((w) => w.field);
const warnMsg = (t, field) => (t._warnings || []).find((w) => w.field === field)?.message || '';

{
  // ④ Ｇ（囲み形状不明）を読んだら件数付きで警告する。
  // 既定は打放し（PBなし）＝過少側で、サニティ（上限判定）には掛からず静かに落ちるため
  const mkG = (extra) => ({ rooms: [{
    name: '洋室3', ceiling_height_mm: 2500, skirting: '木製巾木H=40', ...extra,
    faces: [3240, 2950, 3250, 2250].map((w, i) => ({
      face: 'ABCD'[i], width_mm: w, wall_code: extra.faceG && i === 0 ? 'G' : null, openings: [] })),
  }] });
  // 経路1: 面の記号
  const tFace = computeElevationTakeoff(mkG({ faceG: true }), [], BEPPU_A_OPTS);
  check('W1 面のＧ（形状不明）で警告が出る', warnFields(tFace).includes('wall_code_g_shape'),
    JSON.stringify(warnFields(tFace)));
  check('W2 件数が警告文に入る', /Ｇ記号1件/.test(warnMsg(tFace, 'wall_code_g_shape')),
    warnMsg(tFace, 'wall_code_g_shape'));
  // 経路2: plan_codes
  const tPlan = computeElevationTakeoff(mkG({ plan_codes: ['G', 'G'] }), [], BEPPU_A_OPTS);
  check('W3 plan_codesのＧも数える', /Ｇ記号2件/.test(warnMsg(tPlan, 'wall_code_g_shape')),
    warnMsg(tPlan, 'wall_code_g_shape'));
  // 経路3: plan_placements
  const tPl = computeElevationTakeoff(
    mkG({ plan_placements: [{ code: 'G', wall_length_mm: 3250 }] }), [], BEPPU_A_OPTS);
  check('W4 plan_placementsのＧも数える', tPl.beppu_g_shape_unknown === 1,
    `count=${tPl.beppu_g_shape_unknown}`);
  // 形状が確定していれば警告は出ない（G枠へ畳み込み済み＝判別できている）
  const tBox = computeElevationTakeoff(
    mkG({ plan_placements: [{ code: 'G枠', wall_length_mm: 3250 }] }), [], BEPPU_A_OPTS);
  check('W5 G枠（形状確定）では警告しない', !warnFields(tBox).includes('wall_code_g_shape'),
    JSON.stringify(warnFields(tBox)));
  // アルファの3桁G14は別府Ｇではない＝警告しない（通常運用で鬱陶しく出ないことの固定）
  const tAlpha = computeElevationTakeoff({ rooms: [{
    name: '洋室(1)', ceiling_height_mm: 2400, skirting: '木製巾木H=40',
    plan_codes: ['G14'], plan_placements: [{ code: 'G14', wall_length_mm: 3250 }],
    faces: [3240, 2950, 3250, 2250].map((w, i) => ({
      face: 'ABCD'[i], width_mm: w, wall_code: i === 0 ? 'G14' : null, openings: [] })),
  }] }, [], { soundWallRule: { pairs: [] } });
  check('W6 アルファのG14では警告しない（通常運用で非発火）',
    tAlpha.beppu_g_shape_unknown === 0 && !warnFields(tAlpha).includes('wall_code_g_shape'),
    JSON.stringify(warnFields(tAlpha)));
}

{
  // ⑤ 既定の遮音壁ルール（アルファGタイプ専用定数）が発火したら明示する。
  // 別府にも「LDK」「洋室1」「洋室3」が実在し、幅が帯に入れば誤発火しうるため
  const mkPairRooms = (w1, w3) => ({ rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, skirting: '木製巾木H=40',
      faces: [{ face: 'A', width_mm: 3000, openings: [] }] },
    { name: '洋室(1)', ceiling_height_mm: 2400, skirting: '木製巾木H=40',
      faces: [{ face: 'A', width_mm: w1, openings: [] }] },
    { name: '洋室(3)', ceiling_height_mm: 2400, skirting: '木製巾木H=40',
      faces: [{ face: 'A', width_mm: w3, openings: [] }] },
  ] });
  // opts未指定＝既定ルール適用 → 警告あり
  const tDef = computeElevationTakeoff(mkPairRooms(1450, 1050), [], {});
  check('W7 既定遮音ルール発火で警告が出る',
    warnFields(tDef).includes('sound_wall_rule_default'), JSON.stringify(warnFields(tDef)));
  check('W8 警告に枚数とペアの根拠が入る',
    /2枚計上/.test(warnMsg(tDef, 'sound_wall_rule_default'))
    && /1450mm/.test(warnMsg(tDef, 'sound_wall_rule_default')),
    warnMsg(tDef, 'sound_wall_rule_default'));
  check('W9 既定ルールは実際に計上している（警告が空振りでない）',
    tDef.sound_wall_pb_sqm > 0 && tDef.sound_rule_pairs === 2,
    `sound=${tDef.sound_wall_pb_sqm} pairs=${tDef.sound_rule_pairs}`);
  // 明示ルール（別物件の指定・無効化）では出さない＝ユーザーが自分で決めた場合は黙る
  const tOff = computeElevationTakeoff(mkPairRooms(1450, 1050), [], { soundWallRule: { pairs: [] } });
  check('W10 pairs:[]（無効化）では警告しない',
    !warnFields(tOff).includes('sound_wall_rule_default'), JSON.stringify(warnFields(tOff)));
  const tCustom = computeElevationTakeoff(mkPairRooms(1450, 1050), [],
    { soundWallRule: { pairs: [{ roomA: 'リビング・ダイニング', roomB: '洋室(1)', width_mm: 1450 }] } });
  check('W11 物件別ルール指定では警告しない',
    !warnFields(tCustom).includes('sound_wall_rule_default'), JSON.stringify(warnFields(tCustom)));
  // ペアの部屋が揃わない（=非発火）なら警告も出ない（既存の両部屋存在ゲート）
  const tNoPair = computeElevationTakeoff({ rooms: [
    { name: '洋室(2)', ceiling_height_mm: 2400, skirting: '木製巾木H=40',
      faces: [{ face: 'A', width_mm: 1450, openings: [] }] }] }, [], {});
  check('W12 ルール非発火なら警告も出ない',
    !warnFields(tNoPair).includes('sound_wall_rule_default'), JSON.stringify(warnFields(tNoPair)));
  // 既定定数そのものが変わっていないことの固定（警告文の根拠と実装の一致）
  check('W13 既定ペアはGタイプ実測2枚のまま', DEFAULT_SOUND_WALL_PAIRS.length === 2
    && DEFAULT_SOUND_WALL_PAIRS[0].width_mm === 1450 && DEFAULT_SOUND_WALL_PAIRS[1].width_mm === 1050);
}

{
  // ① 遮音シート: 拾えているのに資材行が存在しない（デッドエンド）ことを警告で可視化する。
  // 対応(b)を選択した根拠 = 発注用の独立行がXLS・見積明細のどちらにも無い
  //   （別府 集計表54行「遮音壁ＰＢ張り」規格="t9.5+GW"／シートは30行・34行の複合行の
  //    規格文字列内にしか出ず単独の数量・単価を持たない）
  check('W14 遮でsound_sheet_sqmが立つ（前提の再確認）', tCoded.sound_sheet_sqm > 0,
    `sheet=${tCoded.sound_sheet_sqm}`);
  check('W15 遮音シートのデッドエンド警告が出る',
    warnFields(tCoded).includes('sound_sheet'), JSON.stringify(warnFields(tCoded)));
  check('W16 警告に面積が入る',
    new RegExp(`遮音シート${Math.round(tCoded.sound_sheet_sqm * 10) / 10}㎡`)
      .test(warnMsg(tCoded, 'sound_sheet')), warnMsg(tCoded, 'sound_sheet'));
  // 遮音シートが無い読み（アルファのL14等・別府のＡのみ）では出ない
  const tNoSheet = computeElevationTakeoff({ rooms: [{
    name: '洋室1', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    faces: [3950, 2500, 3950, 3500].map((w, i) => ({
      face: 'ABCD'[i], width_mm: w, wall_code: 'A', openings: [] })),
  }] }, [], BEPPU_A_OPTS);
  check('W17 シートが無ければ警告しない',
    !warnFields(tNoSheet).includes('sound_sheet'), JSON.stringify(warnFields(tNoSheet)));
}

{
  // ③ EV廻り・防露ふかし壁の桁乖離。XLS実績は0.8〜2.2㎡/戸なのに、
  // Ｂ（GL工法）が面単位で読まれると1面10㎡級になる → 画面に出る行なので警告する
  const mkB = (n) => ({ rooms: [{
    name: '洋室1', ceiling_height_mm: 2500, skirting: '木製巾木H=40',
    plan_placements: Array.from({ length: n }, (_, i) => ({
      code: 'B', wall_length_mm: [3950, 3500][i] })),
    faces: [3950, 2500, 3950, 3500].map((w, i) => ({
      face: 'ABCD'[i], width_mm: w, openings: [] })),
  }] });
  const mkResult = () => ({ materials: [
    { category: '下地材', name: 'EV廻り壁 石膏ボード', spec: 't-9.5（3\'×6\'）', unit: '枚', quantity: 3 },
    { category: '下地材', name: '壁 石膏ボード', spec: 't-9.5（3\'×6\'）', unit: '枚', quantity: 80 },
  ], summary: {} });
  const tB = computeElevationTakeoff(mkB(2), [], BEPPU_A_OPTS);
  const rB = applyElevationTakeoff(mkResult(), tB);
  const rbFields = (rB._warnings || []).map((w) => w.field);
  check('W18 Ｂ2面でEV廻りが実績スケールを大きく超える', tB.ev_wall_pb_sqm > 5,
    `ev=${tB.ev_wall_pb_sqm}`);
  check('W19 桁乖離の警告が出る', rbFields.includes('ev_wall_pb'), JSON.stringify(rbFields));
  check('W20 警告に実績レンジが明記される',
    /0\.8〜2\.2㎡/.test((rB._warnings || []).find((w) => w.field === 'ev_wall_pb')?.message || ''));
  // アルファ実測相当（2.16㎡）では出ない＝通常運用で鬱陶しくない
  const rSmall = applyElevationTakeoff(mkResult(), { ...tB, ev_wall_pb_sqm: 2.16, _warnings: [] });
  check('W21 実績スケール(2.16㎡)では警告しない',
    !(rSmall._warnings || []).some((w) => w.field === 'ev_wall_pb'),
    JSON.stringify((rSmall._warnings || []).map((w) => w.field)));
}

{
  // 通常運用（アルファ）で新規警告が鬱陶しく出ないことの固定。
  // アルファ記録相当の読み（3桁記号・遮音シートなし・EV小）では
  // 新設3警告（Ｇ形状・遮音シート・EV桁乖離）は1件も出ない。
  // ⑤の既定遮音ルール警告はアルファでは「正しい発火」なので対象外
  const tAlphaLike = computeElevationTakeoff({ rooms: [{
    name: '洋室(1)', ceiling_height_mm: 2400, skirting: '木製巾木H=40',
    plan_placements: [{ code: 'C04', wall_length_mm: 5190 }, { code: 'I14', wall_length_mm: 2575 }],
    faces: [{ face: 'A', width_mm: 5190, openings: [] }, { face: 'B', width_mm: 2575, openings: [] },
      { face: 'C', width_mm: 5190, openings: [] }, { face: 'D', width_mm: 2575, openings: [] }],
  }] }, [], {});
  const f = warnFields(tAlphaLike);
  check('W22 アルファ相当の読みで新規警告が出ない',
    !f.includes('wall_code_g_shape') && !f.includes('sound_sheet'), JSON.stringify(f));
}

console.log('');
if (failures.length) {
  console.log('--- 失敗 ---');
  for (const f of failures) console.log('  ✗ ' + f);
}
console.log(`合計: ✅ ${ok} / ✗ ${fail}`);
process.exit(fail === 0 ? 0 : 1);
