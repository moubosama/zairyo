/**
 * 下地高リゾルバ（物件汎用化・2026-07-24）のユニット検証
 *
 * 背景: 下地高（床仕上げ面〜上階スラブ下端）はアルファステイツ実績値2.57/2.77が
 *   ハードコードされていたが、これは物件不変の定数ではない。
 *   別府4丁目プロジェクトXLSを**部位付きで**集計した下地高の実出現値:
 *     Ａ〜Ｇタイプ 一般2.72 / 水回り2.82（drop +100）、Ｈ・Ｉタイプ 一般2.86 / 水回り2.86（drop 0）
 *   → **2.57は1回も出現しない**。2.57固定では別府の間仕切下地・遮音壁がずれる。
 *
 * 【誤読注意・2026-07-24訂正】別府シートの 2.5 / 2.4 / 2.2 は「壁（ボード）」
 *   「下地補強合板t9」「スラブ下り床」行の高さであり**下地高ではない**（2.5はアルファのCH+40=2.44相当）。
 *   下地高の実レンジは 2.72〜2.86。STUD_HEIGHT_MIN_MM=2200 は物理的な安全側マージンであって
 *   「別府に2.2mの下地高が実在する」という根拠ではない。
 *   一方、換算係数(1.4/1.45/1.5)は別府XLSのX列でも同値＝業界標準のため変更対象外。
 *
 * 【水回りのdropも物件依存】アルファ+200 / 別府Ａ〜Ｇ+100 / 別府Ｈ・Ｉ 0。
 *   よって wet_mm 未指定時に default+固定drop で外挿してはならない（別府Ｈで+7.0%のサイレント過大）。
 *   未指定時は一般部と同値（控えめ側）＋warningとする。
 *
 * 検証する優先順位（resolveStudHeightM）:
 *   ① opts.studHeight.by_room[部屋名]（部屋別の明示入力）
 *   ② opts.studHeight.default_mm / wet_mm（物件全体の明示入力＝人手・XLS由来の確定値）
 *   ③ elevations.rooms[].stud_height_mm（展開図AIが読んだ値）
 *   ④ STUD_HEIGHT_M 2.57 / STUD_HEIGHT_WET_M 2.77（アルファ実績値・フォールバック＋警告）
 *   ※ ②が③より先＝「人手/XLS由来の確定値 > AI読取値」（専有面積と同じ原則）
 *
 * 【期待値の作り方】観測値の写しではなく、拾い式から算出した値を書く。
 *   間仕切下地(majikiri_shitaji_m) = Σ(G下地面の幅×下地高−開口) ÷ 2（両面計上→壁1枚換算）
 *   遮音壁PB = 2×幅×下地高 / 遮音GW = 幅×下地高（DEFAULT_SOUND_WALL_PAIRS）
 *
 * 実行: node scripts/test-stud-height.mjs
 */
import {
  computeElevationTakeoff, resolveStudHeightM,
} from '../src/services/buildupCalculator.js';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`✗ ${label}\n    expected: ${e}\n    actual:   ${a}`); }
}
// 浮動小数の丸め差を吸収（拾い値は小数第2位で丸められる）
function near(label, actual, expected, tol = 0.011) {
  if (Number.isFinite(actual) && Math.abs(actual - expected) <= tol) {
    pass++; console.log(`✅ ${label} (${actual})`);
  } else {
    fail++; console.log(`✗ ${label}\n    expected: ${expected}±${tol}\n    actual:   ${actual}`);
  }
}

// 単一のG下地面だけを持つ部屋を作る（間仕切下地＝幅×下地高、開口なし）。
// 4面のうちA面のみG14（間仕切下地の対象）、他面はC04（打放・下地対象外）にして
// 「幅×下地高」が1面分だけ立つようにする＝下地高が式に直接現れるテストベンチ
function oneWallRoom(name, ch, widthMm, extra = {}) {
  return { rooms: [
    { name, ceiling_height_mm: ch, faces: [
      { face: 'A', width_mm: widthMm, wall_code: 'G14', openings: [] },
      { face: 'B', width_mm: 1, wall_code: 'C04', openings: [] },
    ], ...extra },
  ]};
}
// 遮音壁ルール（DEFAULT_SOUND_WALL_PAIRS）が発火しない部屋名を使う＝下地高の影響を間仕切下地に限定
const ROOM = '洋室(9)';
// majikiri = 幅×下地高 ÷2（両面計上の÷2。G下地1面のみのため鏡像加算なし）
const expectMajikiri = (widthM, studHM) => Math.round(widthM * studHM * 100) / 100 / 2;

console.log('--- ① 展開図の部屋別実値 stud_height_mm が既定値より優先される ---');
{
  // 別府実測の下地高2.82mを展開図から読めたケース。幅4.0m
  // 期待: 4.0×2.82÷2 = 5.64（アルファ既定2.57なら5.14＝別値になることも確認）
  const t = computeElevationTakeoff(
    oneWallRoom(ROOM, 2400, 4000, { stud_height_mm: 2820 }), []);
  near('図面実値2.82mが使われる（majikiri 5.64）', t.majikiri_shitaji_m, expectMajikiri(4.0, 2.82));
  check('図面実値があればフォールバック警告は出ない', t.stud_height_fallback, false);
  check('警告なし', t._warnings.filter((w) => w.field === 'stud_height').length, 0);
}
{
  // 既定値2.57との差が数量に現れることの実証（同じ幅で高さだけ違う）
  const tAlpha = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 4000), []);
  const tBeppu = computeElevationTakeoff(
    oneWallRoom(ROOM, 2400, 4000, { stud_height_mm: 2820 }), []);
  near('既定2.57時は5.14', tAlpha.majikiri_shitaji_m, expectMajikiri(4.0, 2.57));
  check('別府2.82と既定2.57で数量が変わる（固定値のままなら物件差を取りこぼす）',
    tAlpha.majikiri_shitaji_m !== tBeppu.majikiri_shitaji_m, true);
}

console.log('--- ② 物件全体の入力 opts.studHeight.default_mm / wet_mm ---');
{
  // 別府の最多値2.5mを物件既定として与える。幅3.0m → 3.0×2.5÷2 = 3.75
  const t = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 3000), [],
    { studHeight: { default_mm: 2500 } });
  near('物件入力2.5mが使われる（majikiri 3.75）', t.majikiri_shitaji_m, expectMajikiri(3.0, 2.5));
  check('物件入力があればフォールバック警告は出ない', t.stud_height_fallback, false);
}
{
  // 水回りは wet_mm 側（別府2.72）が使われる。幅2.0m → 2.0×2.72 ×2(鏡像なし・G14のため) ÷2
  // ※ G14（中間1）なのでUB鏡像加算は無い → 2.0×2.72÷2 = 2.72
  const t = computeElevationTakeoff(oneWallRoom('パウダールーム', 2200, 2000), [],
    { studHeight: { default_mm: 2500, wet_mm: 2720 } });
  near('水回りは wet_mm 2.72 が使われる（majikiri 2.72）',
    t.majikiri_shitaji_m, expectMajikiri(2.0, 2.72));
}
{
  // 水回り判定（WET_ROOM_NAME_RE）が効かない部屋名では default_mm 側
  const t = computeElevationTakeoff(oneWallRoom('洋室(9)', 2400, 2000), [],
    { studHeight: { default_mm: 2500, wet_mm: 2720 } });
  near('居室は default_mm 2.5 が使われる（majikiri 2.5）',
    t.majikiri_shitaji_m, expectMajikiri(2.0, 2.5));
}
{
  // wet_mm未指定の水回りは default をそのまま使う（スラブ下がり量は物件依存＝外挿禁止）
  // → 2.0×2.5÷2 = 2.5。アルファ2.77も「default+200=2.7」も混ぜない
  const t = computeElevationTakeoff(oneWallRoom('トイレ', 2200, 2000), [],
    { studHeight: { default_mm: 2500 } });
  near('wet_mm未指定の水回りは default と同値=2.5（majikiri 2.5）',
    t.majikiri_shitaji_m, expectMajikiri(2.0, 2.5));
  check('wet_mm未指定でも物件入力扱い＝フォールバック警告は出ない', t.stud_height_fallback, false);
  check('水回り未指定の観測フラグが立つ', t.stud_height_wet_from_default, true);
  const w = t._warnings.filter((x) => x.field === 'stud_height_wet');
  check('水回り未指定の要確認warningが1件出る', w.length, 1);
  check('warning本文に物件別のdrop実測が明記される',
    /\+200|\+100/.test(w[0]?.message || ''), true);
}
{
  // wet_mm を指定すれば水回り未指定warningは出ない
  const t = computeElevationTakeoff(oneWallRoom('トイレ', 2200, 2000), [],
    { studHeight: { default_mm: 2500, wet_mm: 2720 } });
  check('wet_mm指定時は水回り未指定フラグが立たない', t.stud_height_wet_from_default, false);
  check('wet_mm指定時は水回り未指定warningなし',
    t._warnings.filter((x) => x.field === 'stud_height_wet').length, 0);
}
{
  // 水回りが無い物件（居室のみ）では default_mm だけでもwarningは出ない
  const t = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 2000), [],
    { studHeight: { default_mm: 2500 } });
  check('水回り部屋が無ければ水回り未指定warningは出ない',
    t._warnings.filter((x) => x.field === 'stud_height_wet').length, 0);
}

console.log('--- ②-must-fix: スラブ下がり量(drop)の固定外挿をしないこと ---');
{
  // drop も物件依存: アルファG +200 / 別府Ａ〜Ｇ +100 / 別府Ｈ・Ｉ 0。
  // default_mm だけを渡した時に「+200」で外挿すると実測に対しサイレントに過大になる
  // （レンジ2200〜3200の内側に収まるため棄却もフォールバックも効かない）
  const beppuA = resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: 2720 } });
  check('別府Ａ(default 2720・wet未指定): 2.92mにならない', beppuA !== 2.92, true);
  check('別府Ａ(default 2720・wet未指定): 一般部と同値2.72', beppuA, 2.72);
  const beppuH = resolveStudHeightM({ name: '洗面' }, { studHeight: { default_mm: 2860 } });
  check('別府Ｈ/Ｉ(default 2860・wet未指定): 3.06mにならない', beppuH !== 3.06, true);
  check('別府Ｈ/Ｉ(default 2860・wet未指定): 実測どおり一般部と同値2.86', beppuH, 2.86);
  // 実測drop（別府Ａ +100）を wet_mm で明示すれば正しく2.82が出る＝指定経路は生きている
  check('別府Ａ: wet_mm 2820 を指定すれば実測どおり2.82',
    resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: 2720, wet_mm: 2820 } }), 2.82);
  // アルファも同様に wet_mm で明示可能（既定値2.77と同値）
  check('アルファ: wet_mm 2770 指定で2.77',
    resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: 2570, wet_mm: 2770 } }), 2.77);
}

console.log('--- ②-must-fix: 明示入力(XLS由来) > room.stud_height_mm(AI読取) ---');
{
  // 展開図AIが下地高を幻覚転記していても、XLS由来の確定値を渡したらそちらが勝つこと
  check('wet_mm(XLS確定) が room.stud_height_mm(AI幻覚2820) に勝つ',
    resolveStudHeightM({ name: 'トイレ', stud_height_mm: 2820 },
      { studHeight: { wet_mm: 2500 } }), 2.5);
  check('default_mm(XLS確定) が room.stud_height_mm(AI幻覚2820) に勝つ',
    resolveStudHeightM({ name: '洋室(1)', stud_height_mm: 2820 },
      { studHeight: { default_mm: 2720 } }), 2.72);
  // 明示入力が無い部屋区分ではAI読取値が使われる（AI読取経路自体は殺さない）
  check('居室のみdefault指定 → 水回りはwet_mm不在なのでdefault（AI値は使わない）',
    resolveStudHeightM({ name: 'トイレ', stud_height_mm: 2820 },
      { studHeight: { default_mm: 2720 } }), 2.72);
  check('明示入力が一切無ければ room.stud_height_mm が使われる',
    resolveStudHeightM({ name: '洋室(1)', stud_height_mm: 2820 }, {}), 2.82);
  // 数量レベルでも同じ（takeoff経由）
  const t = computeElevationTakeoff(
    oneWallRoom(ROOM, 2400, 4000, { stud_height_mm: 2820 }), [],
    { studHeight: { default_mm: 2720 } });
  near('takeoff: 明示2.72がAI読取2.82に勝つ（majikiri 5.44）',
    t.majikiri_shitaji_m, expectMajikiri(4.0, 2.72));
}

console.log('--- ③ 部屋別指定 by_room が全体既定より優先 ---');
{
  // 別府のように部屋ごとに下地高が違う物件（2.72/2.82/2.86が混在）を表現できること。
  // 別府では押入・物入（水回りでない収納）も2.82で拾われており、部屋名の一般/水回り2分法では
  // 表現できない → by_room で吸収するのが正規ルート
  const t = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 2000), [],
    { studHeight: { default_mm: 2500, by_room: { '洋室(9)': 2820 } } });
  near('by_room 2.82 が default 2.5 を上書き（majikiri 2.82）',
    t.majikiri_shitaji_m, expectMajikiri(2.0, 2.82));
}
{
  // 部屋名の表記ゆれ（全角括弧・数字）を正規化して突合すること
  const t = computeElevationTakeoff(oneWallRoom('洋室（９）', 2400, 2000), [],
    { studHeight: { default_mm: 2500, by_room: { '洋室(9)': 2820 } } });
  near('by_room は部屋名の表記ゆれを正規化して一致（majikiri 2.82）',
    t.majikiri_shitaji_m, expectMajikiri(2.0, 2.82));
}

console.log('--- ④ 何も無ければアルファ実績値2.57/2.77へフォールバック＋警告 ---');
{
  const t = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 2000), []);
  near('居室の既定は2.57（majikiri 2.57）', t.majikiri_shitaji_m, expectMajikiri(2.0, 2.57));
  check('フォールバックフラグが立つ', t.stud_height_fallback, true);
  const w = t._warnings.filter((x) => x.field === 'stud_height');
  check('要確認warningが1件出る', w.length, 1);
  check('warning本文に既定値2.57が明記される', /2\.57/.test(w[0]?.message || ''), true);
  check('warning本文に物件差（別府の実値）が明記される', /別府/.test(w[0]?.message || ''), true);
}
{
  const t = computeElevationTakeoff(oneWallRoom('トイレ', 2200, 2000), []);
  near('水回りの既定は2.77（majikiri 2.77）', t.majikiri_shitaji_m, expectMajikiri(2.0, 2.77));
  check('水回りでもフォールバック警告が立つ', t.stud_height_fallback, true);
}

console.log('--- CH非連動の確認（総監査A-2: 下地高はCHから導出しない） ---');
{
  // CHが2200でも2400でも下地高（既定2.57）は変わらないこと。
  // 旧CH+370説ならCH2400→2.77・CH2200→2.57と食い違うため、この2件が同値ならCH非連動が保たれている
  const t24 = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 2000), []);
  const t22 = computeElevationTakeoff(oneWallRoom(ROOM, 2200, 2000), []);
  check('CH2400とCH2200で下地高由来の拾いが同値（CH非連動）',
    t24.majikiri_shitaji_m, t22.majikiri_shitaji_m);
  near('いずれも2.57ベース', t24.majikiri_shitaji_m, expectMajikiri(2.0, 2.57));
}
{
  // CHが未指定（null）でも下地高は既定値で立つ
  const t = computeElevationTakeoff(oneWallRoom(ROOM, null, 2000), []);
  near('CH未指定でも下地高2.57で拾える', t.majikiri_shitaji_m, expectMajikiri(2.0, 2.57));
}

console.log('--- 物理レンジ外の値は読取ノイズとして棄却し既定値へ ---');
{
  // 階高2810や単位違い（2.57をmで転記）を下地高として採用しないこと
  for (const [label, mm] of [['階高2810相当の3500', 3500], ['CH誤転記の2000', 2000],
    ['単位違いの2.57', 2.57], ['0', 0], ['負値', -2570], ['非数', 'abc']]) {
    const t = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 2000, { stud_height_mm: mm }), []);
    near(`${label} は棄却し既定2.57`, t.majikiri_shitaji_m, expectMajikiri(2.0, 2.57));
  }
}
{
  // レンジ境界: 2200と3200は採用。
  // ※下限2200は「これ未満は人が立てない＝転記ミス」という物理的な安全側マージン。
  //   別府の2.2は壁（ボード）行の高さであって下地高ではない（下地高の実測は2.72〜2.86）
  const tMin = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 2000, { stud_height_mm: 2200 }), []);
  near('下限2200は採用（物理的な安全側マージン）', tMin.majikiri_shitaji_m, expectMajikiri(2.0, 2.2));
  const tMax = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 2000, { stud_height_mm: 3200 }), []);
  near('上限3200は採用', tMax.majikiri_shitaji_m, expectMajikiri(2.0, 3.2));
}

console.log('--- 遮音壁ルールの高さも物件入力に追従する ---');
{
  // DEFAULT_SOUND_WALL_PAIRS: LDK↔洋1 1.45m + LDK↔洋3 1.05m（両部屋が展開図にある場合のみ発火）
  // PB = 2×(1.45+1.05)×下地高 / GW = (1.45+1.05)×下地高
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [{ face: 'A', width_mm: 1, wall_code: 'C04', openings: [] }] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [{ face: 'A', width_mm: 1, wall_code: 'C04', openings: [] }] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [{ face: 'A', width_mm: 1, wall_code: 'C04', openings: [] }] },
  ]};
  const alpha = computeElevationTakeoff(elevations, []);
  check('遮音ペア2件が発火', alpha.sound_rule_pairs, 2);
  near('既定2.57時: 遮音PB = 2×2.5×2.57 = 12.85', alpha.sound_wall_pb_sqm, 12.85);
  near('既定2.57時: 遮音GW = 2.5×2.57 = 6.43', alpha.gw_sqm, 6.43);

  const beppu = computeElevationTakeoff(elevations, [], { studHeight: { default_mm: 2500 } });
  near('物件入力2.5時: 遮音PB = 2×2.5×2.5 = 12.5', beppu.sound_wall_pb_sqm, 12.5);
  near('物件入力2.5時: 遮音GW = 2.5×2.5 = 6.25', beppu.gw_sqm, 6.25);
  check('物件入力時は遮音側でもフォールバック警告なし', beppu.stud_height_fallback, false);
}

console.log('--- 収納内側（planRooms推定）の下地高も物件入力に追従する ---');
{
  // 展開図に無い収納は 3×√面積 で内側幅を推定し、下地高を掛ける。
  // 面積4㎡ → 3×2 = 6.0m。majikiri は ÷2 されるので 6.0×高さ÷2
  const elevations = { rooms: [
    { name: ROOM, ceiling_height_mm: 2400, faces: [{ face: 'A', width_mm: 1, wall_code: 'C04', openings: [] }] },
  ]};
  const opts = { planRooms: [{ name: '物入', area_sqm: 4 }] };
  const alpha = computeElevationTakeoff(elevations, [], opts);
  near('既定2.57時: 収納 6.0×2.57÷2 = 7.71', alpha.majikiri_shitaji_m, 6.0 * 2.57 / 2);
  const beppu = computeElevationTakeoff(elevations, [], { ...opts, studHeight: { default_mm: 2500 } });
  near('物件入力2.5時: 収納 6.0×2.5÷2 = 7.5', beppu.majikiri_shitaji_m, 6.0 * 2.5 / 2);
}

console.log('--- resolveStudHeightM 単体（優先順位の直接検証） ---');
{
  check('①by_room が最優先（明示入力・AI読取の双方に勝つ）',
    resolveStudHeightM({ name: '洋室(1)', stud_height_mm: 2820 },
      { studHeight: { by_room: { '洋室(1)': 2500 }, default_mm: 2720 } }), 2.5);
  check('②物件全体の明示入力が図面AI読取値より優先',
    resolveStudHeightM({ name: '洋室(1)', stud_height_mm: 2820 },
      { studHeight: { default_mm: 2720 } }), 2.72);
  check('②物件既定（居室）',
    resolveStudHeightM({ name: '洋室(1)' }, { studHeight: { default_mm: 2720 } }), 2.72);
  check('②物件既定（水回りはwet_mm）',
    resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: 2500, wet_mm: 2720 } }), 2.72);
  // wet_mm未指定の水回りは一般部と同値。スラブ下がり量が物件依存（+200/+100/0）のため外挿しない
  check('②wet_mm未指定の水回りは default_mm と同値（2.5）',
    resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: 2500 } }), 2.5);
  check('②wet_mm未指定でもアルファ2.77は混入しない',
    resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: 2500 } }) !== 2.77, true);
  check('②wet_mm未指定で default+200 の外挿もしない',
    resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: 2500 } }) !== 2.7, true);
  check('③明示入力なしなら図面AI読取値',
    resolveStudHeightM({ name: '洋室(1)', stud_height_mm: 2820 }, {}), 2.82);
  check('④フォールバック（居室2.57）', resolveStudHeightM({ name: '洋室(1)' }, {}), 2.57);
  check('④フォールバック（水回り2.77）', resolveStudHeightM({ name: '洗面' }, {}), 2.77);
  const st = { usedFallback: false, wetFromDefault: false };
  resolveStudHeightM({ name: '洋室(1)' }, {}, st);
  check('フォールバック時にstateへ記録', st.usedFallback, true);
  const st2 = { usedFallback: false, wetFromDefault: false };
  resolveStudHeightM({ name: '洋室(1)' }, { studHeight: { default_mm: 2500 } }, st2);
  check('入力ありならstateは変化しない', st2.usedFallback, false);
  const st3 = { usedFallback: false, wetFromDefault: false };
  resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: 2500 } }, st3);
  check('wet_mm未指定の水回りでwetFromDefaultが立つ', st3.wetFromDefault, true);
  check('wet_mm未指定でもフォールバック扱いにはしない（入力はある）', st3.usedFallback, false);
  const st4 = { usedFallback: false, wetFromDefault: false };
  resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: 2500, wet_mm: 2720 } }, st4);
  check('wet_mm指定時はwetFromDefaultが立たない', st4.wetFromDefault, false);

  // 水回り判定（WET_ROOM_NAME_RE）の網羅
  for (const n of ['パウダールーム', '洗面', 'トイレ', '便所', 'UB', '浴室']) {
    check(`水回り判定: ${n} → 2.77`, resolveStudHeightM({ name: n }, {}), 2.77);
  }
  for (const n of ['洋室(1)', 'リビング・ダイニング', 'キッチン', '玄関・廊下']) {
    check(`居室判定: ${n} → 2.57`, resolveStudHeightM({ name: n }, {}), 2.57);
  }
}

console.log('--- 別府4丁目の実出現下地高（2.72/2.82/2.86）が正しく計算されること ---');
{
  // 別府XLSの下地高行（間仕切下地(木)/遮音壁ＰＢ張り/軸組/間仕切ｸﾞﾗｽｳｰﾙ）の実出現値。
  // 幅10mの間仕切G14面1つで拾い値を検証する。期待: 10×高さ÷2（両面計上→壁1枚換算）
  for (const mm of [2720, 2820, 2860]) {
    const t = computeElevationTakeoff(oneWallRoom(ROOM, 2400, 10000), [],
      { studHeight: { default_mm: mm } });
    near(`下地高${mm}mm → majikiri ${(10 * mm / 1000 / 2).toFixed(2)}`,
      t.majikiri_shitaji_m, 10 * (mm / 1000) / 2);
  }
  // 2.57固定だった旧実装との差（別府Ａ〜Ｇの一般部2.72の場合）を数値で示す
  const fixed = 10 * 2.57 / 2;   // 12.85
  const real = 10 * 2.72 / 2;    // 13.60
  check('旧2.57固定は別府Ａ〜Ｇの2.72に対して-5.5%過少（物件差の実証）',
    Math.round((fixed / real - 1) * 1000) / 10, -5.5);
}

console.log('--- 別府タイプ別の水回り導出値（must-fixの回帰ガード） ---');
{
  // 実測: 別府Ａ〜Ｇ 一般2.72/水回り2.82（drop+100）、別府Ｈ・Ｉ 一般2.86/水回り2.86（drop 0）。
  // wet未指定時に「+200」で外挿すると 2.92 / 3.06 とレンジ内のままサイレントに過大化する
  const cases = [
    { label: '別府Ａ', def: 2720, wetActual: 2820, badExtrap: 2.92 },
    { label: '別府Ｈ/Ｉ', def: 2860, wetActual: 2860, badExtrap: 3.06 },
  ];
  for (const c of cases) {
    const wetNoSpec = resolveStudHeightM({ name: 'トイレ' }, { studHeight: { default_mm: c.def } });
    check(`${c.label}: wet未指定で外挿値${c.badExtrap}にならない`, wetNoSpec !== c.badExtrap, true);
    check(`${c.label}: wet未指定は一般部と同値 ${c.def / 1000}`, wetNoSpec, c.def / 1000);
    check(`${c.label}: wet未指定は実測${c.wetActual / 1000}以下（過大にしない）`,
      wetNoSpec <= c.wetActual / 1000, true);
    check(`${c.label}: wet_mm指定で実測${c.wetActual / 1000}を再現`,
      resolveStudHeightM({ name: 'トイレ' },
        { studHeight: { default_mm: c.def, wet_mm: c.wetActual } }), c.wetActual / 1000);
  }
}

console.log(`\n合計: ✅ ${pass} / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
