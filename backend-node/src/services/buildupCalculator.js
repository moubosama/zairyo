/**
 * ボトムアップ拾い出しエンジン（展開図・建具表ベース）
 *
 * プロの拾い出しXLS（部屋×A〜D面×部位で幅×高さを積み上げる方式）を踏襲する。
 * - 壁面積: Σ(面幅×(天井高+40mm)) − 開口面積（建具表の実寸を優先。+40mmはXLSの壁拾い高さ）
 * - 巾木: Σ周長 − 床まで達する開口の幅（種別: 木製/ソフト/樹脂）
 * - 部位振り分け: 平面詳細図の壁仕上記号（例 D14 = 下地D+中間1+表面4）
 *     下地: L/O/W=遮音壁系, G=間仕切, D=RC面木, C=打放, H/I=ウレタン(GL)
 *     中間: 1=PB9.5, 2=耐水PB9.5, 3=ラワンベニヤ, 4=PB9.5GL, 5=耐水PBGL, 6=コンパネ
 *     表面: 4=洋室クロス, 5=和室クロス, 6=キッチンパネル
 *   記号が無い面は「間仕切+PB+クロス」として扱う（安全側）
 *
 * 単位換算はXLS準拠: PB類 1.4㎡/枚（ロス込み）
 */

import {
  majikiriTimberLengthM, majikiriVolumeM3, MAJIKIRI_M3_PER_SQM,
  dobuchiVolumeM3, DOBUCHI_M3_PER_SQM,
} from './timberVolume.js';

const PB_SQM_PER_SHEET = 1.4; // XLS集計表の換算係数（3×6板・ロス込み。壁X56/耐水X58/遮音X54=1.4）

// EV廻り・防露ふかし壁PBの換算係数。壁PB(1.4)ではなくXLS集計表X62=1.5が正（A-4是正）
// 出典: 集計表X62「防露壁面」(アルファ・ボード共スラブ下まで) / 別府X62「防露ふかし壁（ＰＢ）」=1.5。
// 面積÷1.5（1.4流用は係数-6.7%のズレ）。壁/耐水/遮音のPB_SQM_PER_SHEET(1.4)は変えない。
// 丸めは round（総量方式整合・2026-07-25）。EV廻り壁PBは1.44枚/戸の小数量部位で、G実測2.16㎡は
// round(1.44)=1枚（旧ceilは2枚）。applyElevationTakeoff / summary の該当箇所参照。
export const EV_WALL_PB_SQM_PER_SHEET = 1.5;

// キッチンパネルの板面積: 3'×8'（910×2420mm）= 0.91×2.42 = 2.2022㎡/枚
// XLS集計表のKP行は枚数2.5/戸を手入力しており換算係数（X列）の行が無い → 実板寸で㎡→枚に換算する
const KP_SHEET_SQM = 2.2022;

// キッチンカウンター天板高（業務標準850mm）。キッチンパネルはカウンター上端から天井まで張る
// → 表面6の面は「面全面」ではなく「カウンター上の帯 = 面幅×(CH−0.85)」で拾う
const KITCHEN_COUNTER_H_M = 0.85;

// 床まで達する開口（巾木・壁下部から引く）とみなす高さ
const FLOOR_OPENING_MIN_HEIGHT_MM = 1800;

// ============================================================
// 下地高（間仕切下地・遮音壁・収納内側の立上り高さ）
// ============================================================
// 【重要】これは物件不変の業界標準ではなく「アルファステイツ新宮町の実績値」であり、
// フォールバック専用の既定値である（2026-07-24 物件汎用化で位置づけを明確化）。
//
// 定義: 下地高 = 床仕上げ面 〜 上階スラブ下端（＝スラブ間）。天井高(CH)とは連動しない。
//   居室CH2400の下地も2.57 / 水回りCH2200の下地は2.77（スラブ下がり-200の分だけ高い）。
//   旧実装のCH+370説はCH2200の水回りで2.57に偶然一致していただけ
//   = 計算ロジック総監査A-2で両方向誤りと確定・2026-07-19修正。
//   → よってCHから下地高を導出してはならない（CH連動は既に棄却済みの誤り）。
//
// アルファ実績値の出典: XLS 'Ａタイプ'(=Gデータ)シートの間仕切下地行
//   E123/G123(H)/E177/E231/E284=2.57（居室）、H339/E340/E393/E394=2.77（便所・洗面の水回り壁）。
//
// 【物件により異なる（汎用化の根拠）】別府4丁目プロジェクト（木及び建材XLS R7,03,08）の
//   タイプ別シートを**部位付きで**集計すると、下地高そのものの実出現値は次の3つだけ:
//     Ａ〜Ｇタイプ: 一般部 2.72 / 水回り 2.82（差+100）
//     Ｈ・Ｉタイプ: 一般部 2.86 / 水回り 2.86（差0＝スラブ下がりなし）
//   対象行は「間仕切下地(木)」「遮音壁ＰＢ張り」「軸組」「間仕切ｸﾞﾗｽｳｰﾙ」＝下地高で拾う部位。
//   **アルファの2.57は別府に1回も出現しない**（スラブ間が物件ごとに違うため）。
//
//   ※【誤読注意・2026-07-24訂正】別府シートには 2.5 / 2.4 / 2.2 も頻出するが、これらは
//     「壁（ボード）」「下地補強合板t9」「スラブ下り床」行の高さであって**下地高ではない**
//     （2.5はアルファのCH+40=2.44に相当する壁ボードの拾い高さ）。部位を混ぜて
//     「別府の下地高は2.2〜2.82」と読むのは誤り。下地高の実レンジは 2.72〜2.86。
//     STUD_HEIGHT_MIN_MM=2200 は物理下限としての安全側マージンであり、
//     「別府に2.2mの下地高が実在する」という根拠ではない。
//
//   ※【一般/水回りの2分法は別府に完全には当てはまらない】別府では押入・物入（水回りでない収納）も
//     2.82で拾われている。部屋名による2分法（WET_ROOM_NAME_RE）で表現できない物件は
//     opts.studHeight.by_room で部屋別に指定して吸収すること。
//
//   ※ 換算係数（PB 1.4 / 天井1.45 / 界壁1.5）は別府XLSのX列でも同値＝業界標準で物件不変のため
//     汎用化の対象外（変更しない）。
//
// 優先順位（resolveStudHeightM）: ①opts.studHeight.by_room（部屋別の明示入力）
//   > ②opts.studHeight.default_mm / wet_mm（物件全体の明示入力＝人手・XLS由来）
//   > ③elevations.rooms[].stud_height_mm（AI読取値）> ④この既定値（+要確認warning）
//   ②が③より優先なのはZAIRYOの原則「人手/XLS由来の確定値 > AI読取値」に揃えるため
//   （専有面積がユーザー入力最優先なのと同じ）。
//
// ※既知の近似: XLSは水回りブロック内でも標準スラブ上に立つ壁を2.57で拾う（便所D339=2.1×2.57）が、
//   面単位のスラブ下がり判定情報が図面読取に無いため部屋名（WET_ROOM_NAME_RE）で一律に振る
const STUD_HEIGHT_M = 2.57;
const STUD_HEIGHT_WET_M = 2.77;

// 【スラブ下がり量の固定外挿は禁止】水回りの下地高−一般部の下地高（drop）も物件依存である:
//   アルファG +200（2.57→2.77） / 別府Ａ〜Ｇ +100（2.72→2.82） / 別府Ｈ・Ｉ 0（2.86→2.86）。
// よって default_mm だけが与えられ wet_mm が無い場合に「default+200」で外挿してはならない
//   （別府Ａで2720+200=2920＝実測2820に対し+3.5%、別府Ｈで2860+200=3060＝実測2860に対し+7.0%を
//    レンジ内のためサイレントに誤る）。
// 対応: wet_mm 未指定時は水回りも default_mm をそのまま使い（drop=0のＨ・Ｉ型と一致、
//   drop>0の物件では控えめ側に外す）、_warningsで「未指定のため一般部と同値」を明示する。

// 下地高として受け入れる物理レンジ（mm）。マンションのスラブ間は概ね2.2〜3.2m
// （実測は別府2.72〜2.86・アルファ2.57/2.77がいずれも内側）。範囲外は読取ノイズ（階高2810や
// CH2400の誤転記・単位違い）とみなして採用せず既定値へフォールバックする。
// 下限2200は「これ未満は人が立てない＝転記ミス」という物理的な安全側マージン
// （2.2という実測下地高が存在するという意味ではない。上のコメント参照）
const STUD_HEIGHT_MIN_MM = 2200;
const STUD_HEIGHT_MAX_MM = 3200;

// 耐水記号（中間2/5）救済マッチの適用部屋（部屋名ベースの水回り判定）。
// 面幅の転記は芯々/内法・部分区間で揺れるため、±80mmの第1パスでは取り逃すことがある
// （Gemini実読み: パウダールームG24の壁1725 vs 面幅1925=差200）。
// 耐水は水回りにしか出ない記号のため、救済は水回り部屋に限定して誤爆面を絞る
const WET_ROOM_NAME_RE = /パウダー|洗面|トイレ|便所|UB|浴/;

// UB（ユニットバス）内部の立面はボード拾いの対象外（完成品ユニットのためPB/耐水PBの現場張りが
// 無く、XLSタイプ別シートにもUB内部の行は存在しない。耐水PBは「UB廻り」=隣室側の面で拾う）。
// 正しい読取ではUB内部は展開図に描かれない（Gタイプ実測: Claude記録×2・Gemini0717記録とも
// 展開図8室にUBなし）ため、UB室が現れた場合は読取ノイズとして部屋ごとスキップする
// （2026-07-19 Gemini記録で幻出したUB室が耐水+117%とジャンク壁PBの燃料になった実例）
const UB_ROOM_NAME_RE = /^(UB|ユニットバス|浴室)$/;

// 戸境二重壁（遮 / G枠）を物理的に持ち得ない部屋種別（別府の遮/G枠系統的過剰検出の棄却）。
// 戸境壁＝隣接する別住戸との境界にある二重壁（遮音のため）。したがって以下の部屋には物理的に
// 戸境壁が接し得ない（＝そこにGeminiが読んだ遮/G枠は誤検出）:
//   ・屋外       … バルコニー / ベランダ（住戸の外・隣戸との共有壁ではない）
//   ・共用部/住戸外 … 防災倉庫 / 防炎倉庫 / 備蓄倉庫（住戸の専有内に無い＝戸境の外）
//   ・収納内部    … パントリー / システムクローゼット / SCL / WCL / WIC / CL / クローゼット /
//                  クロゼット / 押入 / 物入（壁1枚介した内側の小空間。戸境壁は外側の居室が持つ）
//   ・水回り内部  … トイレ / 便所 / 洗面 / パウダー / UB / 浴室（戸境に接しても壁1枚介す内側）
// 触らない（本物の可能性がある＝戸境壁を持ちうる居室・動線）: LDK / 洋室 / 玄関 / 廊下。
// 実測（別府A〜F 3回読み多数決）でGeminiが上記の部屋へ遮/G枠を系統的に誤付与し、遮音壁PBが
// 最大+338%（D）に暴走していた（3回とも同じ誤読＝多数決では消えない）。物理制約で棄却する。
// ※ アルファの記録には遮/G枠が1件も無い（isBeppuSoundCodeが別府マーカー付きのみ真）ため
//    このフィルタはアルファで非発火＝アルファGは1バイトも変わらない。
// ※ 判定は normalizeRoomName（長音「ー」除去）後の文字列に対して行うため、
//    パターンも長音を含まない語幹で書く（バルコニー→バルコニ / パントリー→パントリ /
//    クローゼット→クロゼット / パウダー→パウダ）。
// ※ 素の `CL`/`UB` は英字語（Club/hub/subroom 等）への部分一致を避けるため語境界化する
//    （reviewer SF-1・全実記録では発火ゼロだが将来の英字ラベル物件での居室誤棄却を予防）。
//    SCL/WCL/WIC は個別列挙で拾う（語境界の前後に英字が付くため素のCL規則からは外れる）。
const NON_PARTY_WALL_ROOM_RE =
  /バルコニ|ベランダ|倉庫|パントリ|クロゼット|SCL|WCL|WIC|(?:^|[^A-Za-z])CL(?![A-Za-z])|押入|物入|トイレ|便所|洗面|パウダ|(?:^|[^A-Za-z])UB(?![A-Za-z])|浴/i;

// 開口控除の物理上限（面面積に対する開口合計の比率）。壁一面がほぼ開口で埋まることは
// 物理的に無い（袖壁・垂れ壁が残る）ため、超過は開口の幻覚・重複転記とみなして
// ①面内の完全同一開口（符号/type+寸法一致）の2件目以降を落とす → ②なお超過なら比率まで縮退+警告。
// 0.9の根拠（2026-07-19の4記録実測）: ノイズ記録の暴発面は111〜178%、クリーン記録の最大は92%
// （Claudeキッチン面=実在の開口密集）→ 0.9はクリーン側に僅かに掛かるが控除縮退=壁過大側で安全
const OPENING_MAX_FACE_RATIO = 0.9;

// 壁ボード類の拾い高さ = 天井高 + 40mm（天井PBへの飲み込み代）
// XLSタイプ別シート（Gタイプ）の壁(ボード)行で直接確認: 玄関・廊下 4.84×2.24（CH2200+40）/
// 洋室 3.64×2.44（CH2400+40）。耐水PBも (0.95+1.925)×2.24=6.44 vs 正解6.4535（差は丸め）で整合。
// 優先規則: face.height_mm が明示されている面は展開図の実測としてそのまま使い、+40mmは乗せない
// （+40mmを適用するのは高さ未指定の面に天井高からデフォルトを立てる場合のみ）。
// ※ 下地高STUD_PLENUM_M(+370=スラブ下端まで)とは別物。巾木（周長ベース）には影響しない。
const WALL_PICKUP_EXTRA_MM = 40;

// ============================================================
// 界壁面（一部界壁）＝ 木胴縁（一部界壁面）の拾い対象
// ============================================================
// 【XLS原典（2026-07-24）】タイプ別シートの「界壁面 ＰＢｔ9.5+木胴縁」行（アルファ 'Ａタイプ'!r155/209/261/318、
//   別府「部分界壁 ｔ9.5+木胴縁」）。Gタイプ実績 = 洋室(3) Ｃ面 0.98m×2.45 + 台所 Ｃ面 1.08m×2.45 = 5.047㎡/戸。
//   集計表 C85 が上記4セルの合計を参照し、Y85 {=W85*X$86} で材積化される（timberVolume.js の注記参照）。
//
// 【拾い高さ 2.45m】XLSの界壁面行の高さセル（'Ａタイプ'!K261/K318）が両方2.45。
//   一般部の下地高2.57・壁ボードのCH+40=2.44 のいずれとも違う界壁専用の高さ。
//   ※別府は界壁面の高さ＝その物件の下地高（2.72/2.86）を使っており**物件依存**のため
//     opts.kaibeWall.height_m で差し替え可能にする（既定はアルファ実績2.45）。
export const KAIBE_FACE_HEIGHT_M = 2.45;

// 【幅は展開図から機械的に切り出せない（重要・過大計上の防止）】
//   界壁は「隣戸との境界にあたるRC壁の一部分」で、平面図では打放し記号(C04/別府C)が付く面の
//   **一部の区間**にすぎない。実例（Gタイプ洋室(3)）: 展開図のＣ面幅は2.36mだが、XLSの界壁面は0.98m。
//   残りは壁(ボード)行に別セグメント(1.24/3.33/3.24)として拾われており、面幅からの按分則は存在しない
//   （別府の部分界壁幅も0.75〜2.78mとばらつき、面幅比の一定則は無い）。
//   平面図の凡例にも界壁の範囲マークは無い（太線は「遮音壁の範囲」）。
//   → 面に界壁の明示（face.is_kaibe / wall_code の界壁指定 / 幅の実測入力）がある場合のみ実測計上し、
//     無ければ**実測ゼロ**として materialCalculator の実績推定（KAIBE_WALL_SQM_ALPHA）を維持する。
//     面幅をそのまま界壁とみなす実装は+3〜5倍の過大になるため採らない。
const KAIBE_FACE_RE = /界壁|戸境|かいへき/;

// 【界壁面の拾い面積も物件依存（2026-07-24 S-2）】
//   実測が取れないとき（＝界壁の明示が展開図に無い通常ケース）に使う推定面積。
//   既定はアルファ実績 5.047㎡/戸（'Ａタイプ'!P158+P212+P264+P321 の戸当。C85が参照する4セル合計）
//   だが、これは**アルファでしか成立しない値**。別府の「部分界壁 ｔ9.5+木胴縁」戸当（XLS r85）は
//     Ａ2.266 / Ｂ0.000 / Ｃ? / Ｄ2.040 / Ｅ2.448 / Ｈ17.332 / Ｉ15.902 ㎡/戸
//   と物件・タイプで3桁%レベルにばらつき、**界壁が存在しない（0.000）タイプまである**。
//   固定値のままだと別府Ｂ/Ｊのように実在しない材を計上してしまうため、高さ（KAIBE_FACE_HEIGHT_M）と
//   同じく差し替え可能にする:
//     ・opts.kaibeWall.area_sqm（buildup経由・数値）
//     ・overrides.kaibe_wall_sqm（Overrideテーブル経由・文字列。materialCalculatorの推定パス）
//   **0を明示指定できる**（＝界壁を計上しない）ことが要件。未設定のみ既定へフォールバックする。
export const KAIBE_WALL_SQM_ALPHA = 5.047;

// 界壁面の拾い面積として受け付ける上限（㎡/戸）。別府Ｈ17.332の約1.7倍。
// 住戸1戸の界壁面としてこれを超える値は入力ミス（桁違い）とみなして既定へ戻す
const KAIBE_WALL_SQM_MAX = 30;

/**
 * 界壁面の拾い面積（㎡/戸）を解決する。高さ側 opts.kaibeWall.height_m と対になる面積側の入力口。
 *
 * @param raw 面積指定（数値 or 文字列。undefined/null/空文字＝未設定）
 * @returns { value: number, source: 'default'|'override', invalid?: string }
 *   invalid が付くのは「値は入っているが採用できなかった」場合のみ（呼び出し側で警告を出す）。
 *   **0 は正当な指定**（界壁が存在しない物件）なので既定へ戻さない。
 */
export function resolveKaibeWallSqm(raw) {
  if (raw === null || raw === undefined) return { value: KAIBE_WALL_SQM_ALPHA, source: 'default' };
  const s = String(raw).trim();
  if (s === '') return { value: KAIBE_WALL_SQM_ALPHA, source: 'default' };
  // 許可パターン: 0以上の数値（'0' / '2.266' / '.5'）。ceiling_pb_extra_sheets と同様、
  // 数字以外の暗黙除去はしない（'-3'→3の符号反転・'2.5'→25の10倍化を起こさないため）
  const n = /^\d*\.?\d+$/.test(s) ? Number(s) : Number.NaN;
  if (Number.isFinite(n) && n >= 0 && n <= KAIBE_WALL_SQM_MAX) return { value: n, source: 'override' };
  return { value: KAIBE_WALL_SQM_ALPHA, source: 'default', invalid: s };
}

// ============================================================
// 収納面PB（マルチクロゼット・WIC・CLRC面 石膏ボード）の面積換算（2026-07-25）
//
// 【固定5枚 → 面積換算へ】旧実装は ALPHA_STATS.wall_pb_closet(340枚/67戸=5.07)≈5枚の固定値だった。
//   XLS原典（Ｇタイプ集計表）: AB73 = C73 ÷ X73。
//     C73 = 'Ａタイプ'!P34+P88+P142+P196+…（各室の収納面RC＝収納内側の打放しRC面）= 7.51㎡/戸
//     X73 = 1.45（収納面PBの換算係数。天井系X77=1.45と同値だが別セル・別部位の係数）
//   → 7.51 ÷ 1.45 = 5.18枚/戸。固定5枚を面積÷1.45へ置き換える。
//   ※答え合わせではない: 導出は「拾い面積÷X73」で、結果 ceil(5.18)=6枚 は XLS発注列 AB73(=5.18の実質値)と
//     完全一致しない（丸め方向が違う）。係数を5枚に合わせて逆算していない証拠。
//
// 【拾い面積は物件依存】収納面RCの面積は物件・タイプで異なる。
//   ・アルファG実績: 7.51㎡/戸（CLOSET_RC_SQM_ALPHA）
//   ・別府: **収納面PBの概念が無い**（作り付けシステム収納でRC面PBを使わない・集計表に該当行なし。
//     r73は別府では木胴縁の別用途）。→ 0㎡＝収納面PBを計上しない、が別府の正解。
//   固定5枚のままだと別府でも5枚出てしまうため、界壁面（KAIBE_WALL_SQM_ALPHA）と同じ方式で
//   差し替え可能にする:
//     ・推定パス（展開図なし）: overrides.closet_rc_sqm（Overrideテーブル経由・文字列。
//       materialCalculator が resolveClosetRcSqm で解決）。**0を明示指定できる**（＝計上しない）。
//       未設定のみ既定 CLOSET_RC_SQM_ALPHA=7.51 へフォールバック。
//     ・実測パス（展開図あり）: konpane_sqm（中間6＝D64収納内RC面）で自然に置換され、
//       別府のように中間6の面が無ければ konpane_sqm=0 で実測置換が発火しない。
//   ※ resolveClosetRcSqm は推定パス専用（materialCalculatorから呼ぶ）。buildup側 opts からは呼ばない
//     （実測パスは konpane_sqm を直接使うため。界壁面が opts 経由なのと流儀が違う点に注意）。
export const CLOSET_RC_SQM_ALPHA = 7.51; // ㎡/戸（アルファG実績 C73＝'Ａタイプ'!収納面RC合計）
export const CLOSET_PB_SQM_PER_SHEET = 1.45; // 集計表X73（収納面PBの換算係数）

// 収納面RCの拾い面積として受け付ける上限（㎡/戸）。アルファG実績7.51の約4倍。
// 住戸1戸の収納面RCとしてこれを超える値は入力ミス（桁違い）とみなして既定へ戻す
const CLOSET_RC_SQM_MAX = 30;

/**
 * 収納面RCの拾い面積（㎡/戸）を解決する。resolveKaibeWallSqm と同じ流儀の入力口。
 *
 * @param raw 面積指定（数値 or 文字列。undefined/null/空文字＝未設定）
 * @returns { value: number, source: 'default'|'override', invalid?: string }
 *   invalid が付くのは「値は入っているが採用できなかった」場合のみ（呼び出し側で警告を出す）。
 *   **0 は正当な指定**（収納面PBが無い物件＝別府）なので既定へ戻さない。
 */
export function resolveClosetRcSqm(raw) {
  if (raw === null || raw === undefined) return { value: CLOSET_RC_SQM_ALPHA, source: 'default' };
  const s = String(raw).trim();
  if (s === '') return { value: CLOSET_RC_SQM_ALPHA, source: 'default' };
  // 許可パターン: 0以上の数値。数字以外の暗黙除去はしない（符号反転・10倍化の事故防止）
  const n = /^\d*\.?\d+$/.test(s) ? Number(s) : Number.NaN;
  if (Number.isFinite(n) && n >= 0 && n <= CLOSET_RC_SQM_MAX) return { value: n, source: 'override' };
  return { value: CLOSET_RC_SQM_ALPHA, source: 'default', invalid: s };
}

// 戸数（同一タイプの住戸戸数）の許容上限。1棟のマンションで同一タイプが数百戸を超えるのは
// 入力ミス（別フィールドの混入・桁違い）とみなす。アルファ最大10戸・別府9戸なので余裕をとって500。
const HOUSEHOLDS_MAX = 500;

/**
 * EV廻り壁PBの「戸数総量方式」に使う戸数（opt-in）を解決する。resolveClosetRcSqm と同じ流儀。
 *
 * ★これは opt-in 専用の入り口★。**未指定なら null を返し、呼び出し側は従来の per-戸 round にフォールバック**
 *   する（ZAIRYOの1戸単位見積が根幹。ALPHA_STATS.units=67 は実績割り算用で見積対象の戸数ではない）。
 *   戸数を「外から」渡されたときだけ、XLS AB列と厳密一致する総量方式 ceil(㎡×戸数÷係数) に切り替える。
 *
 * @param raw 戸数（数値 or 文字列。undefined/null/空文字/0以下/非数＝未指定扱いで null）
 * @returns { value: number }（1以上の整数）| null（未指定・不正）
 *   ※0・負・非数は「未指定へフォールバック」（per-戸round維持）で null を返す。警告は出さない
 *     （未設定時に鬱陶しくしない方針。closet_rc_sqm の invalid とは扱いが違う＝戸数は任意のopt-inなので）。
 */
export function resolveHouseholds(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  // 許可パターン: 正の整数のみ（戸数に小数はない）。符号・小数点の暗黙除去はしない
  const n = /^\d+$/.test(s) ? Number(s) : Number.NaN;
  if (Number.isFinite(n) && n >= 1 && n <= HOUSEHOLDS_MAX) return { value: n };
  return null; // 0/負/非数/桁違いは未指定扱い（per-戸roundへフォールバック）
}

/**
 * 面が「界壁面」として明示されているかを判定し、拾い幅(mm)を返す（無ければ0）。
 * 受け付ける入力（いずれも図面/AI読取からの明示。推測はしない）:
 *   face.kaibe_width_mm  … 界壁部分の実測幅（最優先。XLSのJ261/J318に相当する値）
 *   face.is_kaibe = true … 面の全幅が界壁（幅は面幅を使う）
 *   face.part      … '界壁' 等の注記（同上）
 */
export function kaibeFaceWidthMm(face) {
  if (!face || typeof face !== 'object') return 0;
  const w = Number(face.kaibe_width_mm);
  if (Number.isFinite(w) && w > 0) return w;
  const marked = face.is_kaibe === true
    || (typeof face.part === 'string' && KAIBE_FACE_RE.test(face.part))
    || (typeof face.note === 'string' && KAIBE_FACE_RE.test(face.note));
  if (!marked) return 0;
  const fw = Number(face.width_mm);
  return Number.isFinite(fw) && fw > 0 ? fw : 0;
}

/**
 * 壁仕上記号のパース。 'D14' -> { base: 'D', mid: 1, surf: 4 }
 * 不正・欠落は null（デフォルト構成で扱う）
 */
// 図面凡例に存在する下地記号のみ有効（AIの誤読 T14 等を弾く）
const VALID_BASE_CODES = 'ZCDGHILSOW';

export function parseWallCode(code) {
  if (typeof code !== 'string') return null;
  const s = code.trim().toUpperCase();
  const m = s.match(/^([A-Z])([0-9])([0-9])$/);
  if (!m) return parseBeppuWallCode(s); // 3桁でなければ別府方式（1文字記号）を試す
  if (!VALID_BASE_CODES.includes(m[1])) return null;
  return { base: m[1], mid: parseInt(m[2], 10), surf: parseInt(m[3], 10) };
}

// ============================================================
// 別府4丁目方式（1文字の壁仕上記号）→ 内部表現（base/mid/surf）への正規化
// ============================================================
// 【背景】壁に記号が付く方式そのものはアルファステイツ新宮町（3桁 G14/C04）と同じだが、
// 別府4丁目プロジェクトの図面（意匠図 page_036 Ａタイプ平面詳細図の凡例・2026-07-24実測）は
// **丸囲み/枠囲みの1文字**で仕上げ構成を指定する:
//
//   Ａ  ビニルクロス貼、ＰＢt9.5                         → PBあり（一般間仕切）
//   Ｂ  ビニルクロス貼、ＰＢt9.5（ＧＬ工法）              → PBあり（GL工法=RC面のふかし）
//   Ｃ  ビニルクロス貼、コンクリート打放し補修            → PBなし
//   Ｄ  吹付けタイル、コンクリート打放し補修              → PBなし
//   Ｅ  アクリル系リシン吹付け、コンクリート打放し補修     → PBなし
//   Ｆ  アクリル系リシン吹付け、ＬＧＳ下地＋ケイカル板t6.0 → PBでない（ケイカル板）
//   Ｇ  コンクリート打放し補修のまま                     → PBなし
//   遮  戸境二重遮音壁: 胴縁+ＰＢt9.5(ＧＷ24Ｋ充填)+遮音シート+ＰＢt9.5
//   Ｇ(枠囲み) 戸境二重壁: 胴縁＋ＰＢt9.5（ＧＷ24Ｋ充填）
//
// 【設計方針】アルファの3桁パスには一切触れず、1文字記号を既存の内部表現へ「翻訳」する。
// 下流（面割付・部位振り分け・遮音ルール・材積換算）は base/mid/surf しか見ていないため、
// 翻訳さえ正しければロジックの再実装が要らない＝アルファ側の回帰リスクがゼロになる。
//
// 【Ｇの二義性の扱い（最重要）】凡例のＧは2つある:
//   (a) 丸囲みＧ = コンクリート打放し補修のまま（PBなし）
//   (b) 枠囲みＧ = 戸境二重壁（胴縁+PB+GW。PBあり・GWあり）
// 図面上は「丸囲み/枠囲み」で区別されるが、**AIの転記でこの囲み形状が来る保証は無い**
// （現状のプロンプトは記号の文字しか要求していない）。そこで:
//   ・既定（囲み情報なし・裸の 'G'）は **(a) PBなし＝打放し** に倒す。
//     根拠: ①凡例のＡ〜Ｇは連続した仕上げ表であり丸囲みＧがその末項＝出現頻度が高い
//           ②誤って(b)にすると PB+GW を戸境全面に積む＝壁PB暴発（+245%側）に戻る。
//           (a)に倒した場合の誤りは「戸境二重壁を打放し扱いで拾い落とす」＝過少側で、
//           サニティ（比の上限）にも掛からず静かに止まるため安全側と判断した。
//   ・区別情報が来た場合はそれを優先する。優先順位:
//       ① 明示の別表記（'G枠' / 'G(枠)' / '戸境' 等 → BEPPU_WALL_CODE_MAP のキー）
//       ② item.shape / enclosure が 'box'|'枠'|'四角' → 戸境二重壁(b)、'circle'|'丸' → 打放し(a)
//       ③ 情報なし → 既定(a)
//     ②はプロンプト側が囲み形状を返せるようになった場合の受け口（parseWallCode の第2引数）。
//
// 【アルファ側との衝突が無いことの確認】アルファの記号は必ず「英字1+数字2」の3桁で、
// 1文字記号は3桁の正規表現にマッチしない。逆に別府の1文字は3桁パスを通らない。
// よって同じ文字（例 'G'）でも文字列長で完全に分岐し、相互汚染しない。
// ※ただし 'C'（別府=打放し）と 'C04'（アルファ=打放し）は意味も一致しており、
//   仮に取り違えても部位振り分けは同じになる。
//
// 【マッピングの根拠】右列が翻訳先の3桁コード。mid: 0=ナシ/1=PB9.5/2=耐水PB/4=PB9.5 GL工法、
// surf: 0=ナシ/4=クロス貼。base: G=間仕切木下地/C=打放/D=RC面木(GL・ふかし)/W=遮音系。
const BEPPU_WALL_CODE_MAP = {
  // Ａ: 間仕切下地+PB9.5+ビニルクロス = アルファのG14と同一構成
  'A': { base: 'G', mid: 1, surf: 4, beppu: 'A' },
  // Ｂ: GL工法のPB9.5+クロス。GL工法はRC面のふかし=アルファのD14（中間4=PB9.5GL工法）に対応。
  //    D下地×中間4はエンジンで ev_wall_pb_sqm（防露/EV廻り壁の別部位）へ入る。
  //    別府XLSにも「防露ふかし壁（ＰＢ）」行（X62=1.5）が実在し、壁PB本体と別部位で拾う運用が一致する
  'B': { base: 'D', mid: 4, surf: 4, beppu: 'B' },
  // Ｃ/Ｄ/Ｅ: 打放し補修（下地なし・PBなし）。仕上げがクロス/吹付タイル/リシン吹付で違うが
  //    ボード類はいずれもゼロ。クロス（surf=4）はＣのみ、Ｄ/Ｅは吹付=クロスでないためsurf=0
  'C': { base: 'C', mid: 0, surf: 4, beppu: 'C' },
  'D': { base: 'C', mid: 0, surf: 0, beppu: 'D' },
  'E': { base: 'C', mid: 0, surf: 0, beppu: 'E' },
  // Ｆ: LGS下地+ケイカル板t6.0。**PBではない**ためPB系の中間コードを与えない（mid=0）。
  //    ケイカル板の拾いは現状のtakeoffに部位が無く、別府XLS集計表にも該当行を確認していない
  //    （正解JSONの10部位に無い）ため、面積は計上せず「PBに混ぜない」ことだけを保証する。
  //    ※将来ケイカル板部位を作る場合はここに mid を新設して振り分ける
  'F': { base: 'G', mid: 0, surf: 0, beppu: 'F' },
  // Ｇ（丸囲み・既定）: 打放し補修のまま。仕上げもなし
  'G': { base: 'C', mid: 0, surf: 0, beppu: 'G' },
  // 遮: 戸境二重遮音壁（胴縁+PB+GW24K+遮音シート+PB）。
  //    アルファのL14（遮音壁PB+GW）に遮音シートが加わった構成のため、
  //    base='W'（遮音系・GWあり）に sound_sheet=true を添えて表現する（下の注記参照）
  '遮': { base: 'W', mid: 1, surf: 4, beppu: '遮', sound_sheet: true },
  // Ｇ（枠囲み）: 戸境二重壁（胴縁+PB+GW24K・遮音シートなし）= アルファのW系と同一構成
  'G枠': { base: 'W', mid: 1, surf: 4, beppu: 'G枠' },
};

// 別府記号の表記ゆれ → 正規キー。全角英字・丸囲み文字（Ⓐ等）・囲み表記の明示形を吸収する。
// 「戸境」「遮音」等の日本語表記もAIが返しうるため受ける（読取プロンプトは記号1文字を要求するが、
// 説明語で返す実例がアルファのタイル読取でも観測されている）
const BEPPU_ALIASES = {
  'Ⓐ': 'A', 'Ⓑ': 'B', 'Ⓒ': 'C', 'Ⓓ': 'D', 'Ⓔ': 'E', 'Ⓕ': 'F', 'Ⓖ': 'G',
  '遮音': '遮', '遮音壁': '遮', '戸境二重遮音壁': '遮',
  'G枠': 'G枠', 'G(枠)': 'G枠', 'G（枠）': 'G枠', '枠G': 'G枠',
  '戸境': 'G枠', '戸境二重壁': 'G枠',
};

/**
 * 別府方式の1文字壁仕上記号をパースする（純関数・scripts/test-beppu-wallcode.mjsで検証）
 *
 * @param {string} raw 記号（'A' / 'Ａ' / '遮' / 'G枠' 等。呼び出し元でtrim+大文字化済みを想定）
 * @param {object} [hint] 囲み形状のヒント { shape: 'circle'|'box'|'丸'|'枠'|'四角' }。
 *   Ｇの二義性の解決にのみ使う（他の記号は形状に依らず一意）
 * @returns {{base, mid, surf, beppu, sound_sheet?}|null}
 */
export function parseBeppuWallCode(raw, hint = null) {
  if (typeof raw !== 'string') return null;
  // 全角英字→半角、空白除去（'Ａ' → 'A'）。長音・ハイフンは別府記号に出ないため触らない
  let s = raw
    .replace(/[ａ-ｚＡ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]/g, '')
    .toUpperCase();
  if (!s) return null;
  if (BEPPU_ALIASES[s]) s = BEPPU_ALIASES[s];
  // Ｇの二義性: 囲み形状のヒントがあれば既定より優先する（BEPPU_WALL_CODE_MAPのコメント参照）
  if (s === 'G' && hint) {
    const shape = String(hint.shape || hint.enclosure || '');
    if (/box|枠|四角|角/i.test(shape)) s = 'G枠';
    // circle/丸 は既定(a)と同じ=打放しのため変換不要
  }
  const hit = BEPPU_WALL_CODE_MAP[s];
  return hit ? { ...hit } : null;
}

/**
 * 読取アイテムの (code, shape) を「保存する記号文字列」へ正規化する（純関数）
 *
 * 保存データ（wall_finish_codes[].placements[].code / faces[].wall_code）は文字列1つしか
 * 持たないため、別府方式のＧの二義性（丸囲み=打放し / 四角囲み=戸境二重壁）を
 * **読み取った時点で文字列に畳み込む**。四角囲みのＧだけ 'G枠' に確定させ、
 * 丸囲み・形状不明は 'G'（=打放し・既定の安全側）のまま通す。
 * これによりスキーマを増やさずに済み、リプレイ・再計算でも同じ意味へ解決される。
 *
 * アルファの3桁記号は shape の有無に関わらず素通し（大文字化+trimのみ＝従来と同一）。
 *
 * @param {string} rawCode 読み取った記号
 * @param {string|null} shape 囲み形状 'circle'|'box'|'丸'|'枠'|'四角' 等（無ければnull）
 * @returns {string|null} 保存用の記号文字列。無効ならnull
 */
export function canonicalizeWallCode(rawCode, shape = null) {
  if (rawCode == null) return null;
  const s = String(rawCode).toUpperCase().trim();
  if (!s) return null;
  // 3桁（アルファ方式）はそのまま（shapeは無視）
  if (/^[A-Z][0-9][0-9]$/.test(s)) return s;
  // 別府方式: 形状ヒント込みで解釈し、正規キー（BEPPU_WALL_CODE_MAPのキー）へ寄せる
  const parsed = parseBeppuWallCode(s, shape ? { shape } : null);
  return parsed ? parsed.beppu : null;
}

// ============================================================
// 開口×建具表マッチング層
// 目的: タイル読取で増えた開口（寸法null多数）に建具表の実寸を補完する
// 優先順位: ①符号の正規化マッチ（確定） > ②type+寸法帯+取付位置の推定マッチ
// 安全側の原則:
//   - 推定マッチは matched_by:'inferred' を付け、符号確定（'symbol'）と区別する
//   - 図面から転記済みの寸法は上書きしない（補完のみ）
//   - 候補が複数あり値が矛盾する寸法は補完しない（null維持=既存のfallback高さで控除）
//   - 窓は推定対象外（住戸・面ごとにサイズ差が大きく誤マッチの害が大）
//   - 玄関ドア・SD系鋼製建具も推定対象外（WD建具表への誤マッチ防止。符号マッチは可）
// ============================================================

// 建具表と図面読取の寸法ズレ許容。幅30mm=折戸803を800と読む等の作図/読取差、
// 高さ15mm=2075と2080を別建具として区別できる幅（WD-8A/WD-2A実在寸法より）
const OPENING_WIDTH_TOL_MM = 30;
const OPENING_HEIGHT_TOL_MM = 15;

/**
 * 建具符号の正規化。'WD-2A' / 'WD2A' / 'wd-2a' / 'ＷＤ－２Ａ' / 長音・全角ハイフン → 'WD2A'
 */
export function normalizeDoorSymbol(sym) {
  if (sym == null) return null;
  const s = String(sym)
    .replace(/[ａ-ｚＡ-Ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toUpperCase()
    .replace(/[\s　]/g, '')
    .replace(/[-‐‑–—―ー−－_]/g, ''); // ハイフン類（全角・長音・ダッシュ）を除去
  return s || null;
}

/**
 * 開口タイプの分類（推定マッチ用）。片開き戸/片引き戸/引違い戸/折戸N/窓 等に正規化
 * 分類できない表記（「開口」等）は null = 推定マッチしない
 */
function openingTypeClass(t) {
  const s = String(t || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!s) return null;
  if (/窓|サッシ|ガラリ|AW/.test(s)) return '窓';
  const fold = s.match(/([0-9]+)\s*枚\s*折/);
  if (fold) return `折戸${fold[1]}`;
  if (s.includes('折戸') || s.includes('折れ戸')) return '折戸';
  if (s.includes('引違')) return '引違い戸';
  if (s.includes('引込')) return '引込み戸';
  if (/両開/.test(s)) return '両開き戸';
  if (/片引|引戸|引き戸/.test(s)) return '片引き戸';
  if (/片開|開き戸|開戸|ドア/.test(s)) return '開き戸';
  return null;
}

/** 「折戸」（枚数不明）と「折戸2」等は互換とみなす */
function classCompatible(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith('折戸') && b.startsWith('折戸') && (a === '折戸' || b === '折戸');
}

/**
 * 建具表から検索構造を作る
 * - bySymbol: 正規化符号 → 建具。同符号が複数ページ等で重複した場合はフィールド単位で照合し、
 *   両行とも値を持ち食い違う寸法があるときだけ null を立てて符号マッチ不可にする
 *   （どちらの寸法か確定できないため安全側）。片方が寸法null（一覧行+姿図欄の再掲等）の場合は
 *   矛盾ではなく、寸法を持つ行の値を採用する（旧実装は厳密比較で null≠実寸 も矛盾扱いになり、
 *   正しい寸法を持つ行まで符号マッチ不能に毒化していたバグの修正・2026-07-18）
 * - doors: 全建具（符号なし行も推定マッチの候補に含める）
 */
export function buildDoorLookup(doorSchedule) {
  const bySymbol = new Map();
  const doors = [];
  for (const d of doorSchedule || []) {
    if (!d) continue;
    doors.push(d);
    const key = normalizeDoorSymbol(d.symbol);
    if (!key) continue;
    if (!bySymbol.has(key)) {
      bySymbol.set(key, d);
      continue;
    }
    const prev = bySymbol.get(key);
    if (prev === null) continue; // 既に矛盾確定 → 後続行で復活させない（安全側を維持）
    const conflict = ['width_mm', 'height_mm'].some(
      (f) => prev[f] != null && d[f] != null && prev[f] !== d[f]);
    if (conflict) {
      bySymbol.set(key, null); // 同符号で非null寸法が矛盾 → マッチ失敗として扱う
      continue;
    }
    // 欠けているフィールドだけ他方の行で補完（値を持つ行を優先・転記済みの値は動かさない）
    const merged = { ...prev };
    for (const f of ['width_mm', 'height_mm', 'name', 'location']) {
      if (merged[f] == null && d[f] != null) merged[f] = d[f];
    }
    bySymbol.set(key, merged);
  }
  return { bySymbol, doors };
}

/**
 * 建具表から開口寸法を補完する
 * @param opening { type?, symbol?, width_mm?, height_mm?, room? }
 * @param doorLookup buildDoorLookup() の戻り値
 * @param roomName 開口が属する部屋名（openingにroomが無い場合の取付位置マッチ用）
 * @returns 補完済みコピー。補完・確定マッチ時は matched_by: 'symbol'|'inferred' が付く
 */
// 推定マッチの対象外とする建具タイプ（確定符号マッチは可）
// 玄関ドア・SD系鋼製建具はWD建具表のみの典型運用で内部ドア（WD-1TA 850×2175等）に
// 誤マッチし、fallback高さ2.0mより悪化する（玄関SD-101A真値は850×1900）ため推定しない
const INFERENCE_EXCLUDE_RE = /玄関|SD|鋼製/;

export function resolveOpening(opening, doorLookup, roomName = null) {
  const resolved = { ...opening };
  delete resolved.matched_by; // 再解決時に古い印を引き継がない
  const lookup = doorLookup || { bySymbol: new Map(), doors: [] };

  // ① 符号の正規化マッチ（確定）
  const key = normalizeDoorSymbol(opening.symbol);
  const hit = key ? lookup.bySymbol.get(key) : undefined;
  if (hit) {
    // 寸法整合ガード（2026-07-19 Gemini読取ノイズ対策）: 転記済み寸法が建具表の実寸と
    // 大きく矛盾する場合は符号マッチを拒否する（符号と寸法のどちらかが誤読で、どちらが正か
    // 確定できない。実例: 幻覚開口WD-120A転記幅1800 vs 建具表605 → 拒否しないと高さ2320が
    // 補完され4.2㎡の架空控除になる）。許容差は推定マッチと同じ帯（幅±30/高さ±15=作図/読取差）。
    // 拒否時はこれ以上の推定マッチも重ねない（矛盾データに推測を積むと悪化するため転記値のまま。
    // 欠け寸法は既存のfallback高さで控除される）
    const dimConflict =
      (opening.width_mm && hit.width_mm != null &&
        Math.abs(opening.width_mm - hit.width_mm) > OPENING_WIDTH_TOL_MM) ||
      (opening.height_mm && hit.height_mm != null &&
        Math.abs(opening.height_mm - hit.height_mm) > OPENING_HEIGHT_TOL_MM);
    if (dimConflict) return resolved;
    if (!resolved.width_mm) resolved.width_mm = hit.width_mm;
    if (!resolved.height_mm) resolved.height_mm = hit.height_mm;
    if (!resolved.type) resolved.type = hit.name;
    resolved.matched_by = 'symbol';
    return resolved;
  }

  // ② 推定マッチ（寸法が欠けている開口のみ。窓・玄関/SD/鋼製・分類不能タイプは対象外）
  if (resolved.width_mm && resolved.height_mm) return resolved;
  if (INFERENCE_EXCLUDE_RE.test(String(resolved.type || ''))) return resolved;
  // 玄関ドアはAIが type:'片開き戸'・room:'玄関・廊下' とだけ転記する場合があり（typeに「玄関」が
  // 出ず上のtype除外を素通り）、WD-1TA 850×2175が補完され真値SD-101A 850×1900より過大控除になる
  // → 部屋名の玄関判定でも推定を止める（fallback高さ2.0mの方が真値に近い）。符号マッチは①で済み可。
  // 玄関・廊下内の廊下側ドアも推定対象外になるが、玄関ドア誤補完の害の方が大きい（レビュー確定の安全側）
  if (/玄関/.test(normalizeRoomName(resolved.room || roomName))) return resolved;
  const cls = openingTypeClass(resolved.type);
  if (!cls || cls === '窓' || isWindow(resolved)) return resolved;

  let candidates = lookup.doors.filter((d) => d && classCompatible(openingTypeClass(d.name), cls));
  // 取付位置照合（候補1件でも適用）:
  //   - 対応する候補があればそちらに絞る
  //   - 全候補が取付位置を持ち、どれも開口の部屋と対応しない → 推定しない（安全側）
  //   - 取付位置未記載の候補は対象に残す（建具表のlocation欠落で推定を殺さない）
  const rn = normalizeRoomName(resolved.room || roomName);
  if (rn && candidates.length > 0) {
    const locOf = (d) => normalizeRoomName(d.location);
    const byLoc = candidates.filter((d) => {
      const ln = locOf(d);
      return ln && (ln.includes(rn) || rn.includes(ln));
    });
    if (byLoc.length > 0) candidates = byLoc;
    else if (candidates.every((d) => locOf(d))) candidates = [];
  }
  // 読めている寸法で絞る
  if (resolved.width_mm) {
    candidates = candidates.filter((d) => d.width_mm != null &&
      Math.abs(d.width_mm - resolved.width_mm) <= OPENING_WIDTH_TOL_MM);
  }
  if (resolved.height_mm) {
    candidates = candidates.filter((d) => d.height_mm != null &&
      Math.abs(d.height_mm - resolved.height_mm) <= OPENING_HEIGHT_TOL_MM);
  }
  if (candidates.length === 0) return resolved;

  // 候補間で値が一意な寸法だけ採用（矛盾する寸法は補完しない）
  const uniq = (vals) => {
    const set = new Set(vals.filter((v) => v != null));
    return set.size === 1 ? [...set][0] : null;
  };
  let filled = false;
  if (!resolved.width_mm) {
    const w = uniq(candidates.map((d) => d.width_mm));
    if (w) { resolved.width_mm = w; filled = true; }
  }
  if (!resolved.height_mm) {
    const h = uniq(candidates.map((d) => d.height_mm));
    if (h) { resolved.height_mm = h; filled = true; }
  }
  if (filled) resolved.matched_by = 'inferred';
  return resolved;
}

// 開口が窓かどうかの単一の真実（buildup/materialCalculator 両方から使う・2026-07-21共通化）。
// 旧: materialCalculator側に別実装 isOpeningWindow があり type.includes('aw')（小文字部分一致）で
//     「aw を含む語」を窓と誤爆しうる+判定基準が食い違っていた。ここへ一本化し export で共有する。
// 判定: type が window/窓/サッシ/AW（大文字・語として保持したまま照合。'aw'部分一致の誤爆を避ける）、
//   または符号 AW/AWD-数字 / W-数字（WD-=木製建具は非該当。「Wの直後がハイフン＋数字」形のみ）
export function isWindow(opening) {
  const t = String(opening.type || '');
  if (t === 'window' || t.includes('窓') || t.includes('サッシ') || t.includes('AW')) return true;
  // 建具符号でも窓を判定（tieRankの割付判断が依存するため頑健化・2026-07-18）:
  // AW/AWD=アルミ窓系（実例: LDKの4枚引違い窓 AWD-101。typeが「引違い戸」と転記されても窓）。
  // W-数字 も窓系符号として扱う。※ WD-（木製建具）を誤判定しないよう「Wの直後がハイフン＋数字」形のみ
  const symNorm = normalizeDoorSymbol(opening.symbol) || '';
  if (/^AWD?\d/.test(symNorm)) return true;
  return /^W\s*[-‐‑–—―ー−－]\s*[0-9０-９]/.test(String(opening.symbol || '').toUpperCase());
}

// 部屋名ベースの水回り判定（buildupCalculatorの各所で共有）。定義はモジュール上部（後述）。
// ※ ここで先出し宣言せず、下部のWET_ROOM_NAME_RE定数を参照する（巻き上げ対象のconst定義は関数の
//   実行時に評価されるためファイル内どこからでも参照可）。

// 部屋種別ごとに物理的にありえない「大窓」の下限幅(mm)。
// トイレ・洗面・パウダー等の水回り小部屋に幅2000mm以上の窓は物理的に付かない
// （XLS建具表AW系の水回り窓は最大でもAW-106=850mm。AWD-102=4120mmはLDKの4枚引違窓）。
// Gemini読取ノイズで大窓符号（AWD-102等）が小部屋の面へ帰属し、面幅超過ガードで面ごとに
// 弾かれてはいるが、残骸が別面の判定（第2パス救済・下地控除）に混入しうるため部屋単位で除去する。
const WET_ROOM_MAX_WINDOW_MM = 2000;

/**
 * 部屋の開口リストを面横断で健全化する（幻覚・誤配置の除去・2026-07-22）。
 * 純関数。face.openings（raw）に一切変更を加えず、「控除対象から外す raw 開口の Set」と
 * 発動統計を返す。呼び出し側は resolved(=resolveOpening後)を面ごとに再計算するが、
 * ここでは同じ resolveOpening を使って解決寸法・窓判定・符号を得てから判定する。
 *
 * 対象とする2つのノイズ（クリーン記録=手動割付記録には発動しないよう保守的に設計）:
 *   ① 大窓の小部屋誤配置: 窓（isWindow）かつ解決幅 >= WET_ROOM_MAX_WINDOW_MM が水回り部屋に来た場合
 *      → その開口を部屋から除去（トイレ/パウダーに4120mm窓は物理的にありえない）。
 *   ② 同一符号ドアの面またぎ重複: 建具符号（窓を除く）が同一部屋の複数面に現れる場合、
 *      1枚の物理ドアは1面にしか無い → 最も収まりの良い1面だけ残し、他面の同符号ドアを除去する。
 *      「収まりの良い面」= 開口幅が面幅を超えない面のうち面幅が最大の面（超えない面が無ければ最大面幅）。
 *      ※ 窓・符号なしの開口は対象外（クリーン記録が窓を複数面に正当に持つ実例=LDK/洋室(3)の窓を守る）。
 *
 * @param faces 部屋の faces 配列
 * @param doorLookup buildDoorLookup() の戻り値
 * @param roomName 部屋名
 * @returns { drop: Set<rawOpening>, stats: { wet_window_dropped, cross_face_door_dropped } }
 */
export function sanitizeRoomOpenings(faces, doorLookup, roomName) {
  const drop = new Set();
  const stats = { wet_window_dropped: 0, cross_face_door_dropped: 0 };
  const isWet = WET_ROOM_NAME_RE.test(roomName || '');

  // 各面の raw 開口を解決して (raw, resolved, faceWidth, faceRef) の一覧を作る
  const entries = [];
  for (const face of Array.isArray(faces) ? faces : []) {
    const fw = face.width_mm || 0;
    for (const raw of face.openings || []) {
      const op = resolveOpening(raw, doorLookup, roomName);
      entries.push({ raw, op, fw, face, win: isWindow(op), sym: normalizeDoorSymbol(op.symbol) });
    }
  }

  // ① 大窓の水回り誤配置
  if (isWet) {
    for (const e of entries) {
      if (e.win && (e.op.width_mm || 0) >= WET_ROOM_MAX_WINDOW_MM) {
        if (!drop.has(e.raw)) { drop.add(e.raw); stats.wet_window_dropped++; }
      }
    }
  }

  // ② 同一符号ドアの面またぎ重複（窓・符号なしは除外）
  const bySymbol = new Map(); // 符号 -> [entry]（drop済みは除く）
  for (const e of entries) {
    if (drop.has(e.raw)) continue;
    if (e.win || !e.sym) continue;
    if (!bySymbol.has(e.sym)) bySymbol.set(e.sym, []);
    bySymbol.get(e.sym).push(e);
  }
  for (const [, group] of bySymbol) {
    // 同符号が複数の「異なる面」に跨る場合のみ発動（同一面内の重複は既存の dup ガードの担当）。
    const faceSet = new Set(group.map((e) => e.face));
    if (faceSet.size <= 1) continue;
    // 面幅で「収まりの良い」1件を残す: 開口幅<=面幅の面を優先し、その中で面幅最大。
    // 該当が無ければ面幅最大の面。残り（面をまたいだ同符号ドア）を除去する。
    const ow = group.reduce((mx, e) => Math.max(mx, e.op.width_mm || 0), 0);
    let keep = null;
    const fits = group.filter((e) => e.fw > 0 && ow <= e.fw);
    const pool = fits.length ? fits : group;
    for (const e of pool) { if (!keep || e.fw > keep.fw) keep = e; }
    for (const e of group) {
      if (e === keep) continue;
      if (!drop.has(e.raw)) { drop.add(e.raw); stats.cross_face_door_dropped++; }
    }
  }

  return { drop, stats };
}

/**
 * 部屋名の表記ゆれ吸収（平面図と展開図の突合用）
 * 空白（全角含む）除去・長音「ー」除去（クローゼット/クロゼット）・括弧と数字の全角→半角
 * ※ (1)等の番号は区別に必要なので除去しない（クロゼット(1)とクロゼット(2)は別部屋）
 * routes/projects.js の attachElevationData（壁記号・タイル開口の部屋名突合）からも使うためexport
 */
export function normalizeRoomName(name) {
  return String(name || '')
    .replace(/[\s　]/g, '')
    .replace(/ー/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * 下地高リゾルバ（物件汎用化・2026-07-24）
 *
 * 下地高（床仕上げ面〜上階スラブ下端）は物件ごとに違う（アルファ2.57/2.77 ↔ 別府2.72/2.82/2.86）。
 * 人手・XLS由来の明示入力があればそれを使い、無ければ図面読取値、最後にアルファ実績値へ落とす。
 *
 * 優先順位:
 *   ① opts.studHeight.by_room[部屋名]        ← 部屋別の明示入力（最優先）
 *   ② opts.studHeight.default_mm / wet_mm    ← 物件全体の明示入力（人手・XLS由来の確定値）
 *   ③ room.stud_height_mm                    ← 展開図AIが読んだ部屋別の値
 *   ④ STUD_HEIGHT_M / STUD_HEIGHT_WET_M      ← アルファ実績値（+要確認warning）
 *
 * 【②が③より先の理由】ZAIRYOの原則「人手/XLS由来の確定値 > AI読取値」に揃える
 *   （専有面積がユーザー入力最優先なのと同じ）。逆順だと、XLSから確定した wet_mm を渡しても
 *   展開図AIの幻覚転記（stud_height_mm）が勝ってしまう。
 *
 * 【wet_mm未指定時に「default+drop」で外挿しない理由】スラブ下がり量も物件依存で
 *   アルファ+200 / 別府Ａ〜Ｇ+100 / 別府Ｈ・Ｉ 0 とばらつく。固定値で外挿すると
 *   別府Ｈで2860→3060（+7.0%）をレンジ内のまま無警告で誤るため、
 *   未指定時は一般部と同値（＝控えめ側）にして warning で明示する。
 *
 * 【CHから導出しない理由】下地高はスラブ間であり天井高と連動しない（総監査A-2で確定）。
 *   CH+40やCH+370で代用すると居室CH2400→2.44/2.77となり、実測2.57に対して両方向に誤る。
 *   展開図プロンプトのceiling_height_mmは「天井高」を読ませており下地高の情報源ではない。
 *
 * @param room 展開図の部屋 { name, stud_height_mm? }
 * @param opts { studHeight?: { default_mm?, wet_mm?, by_room?: {部屋名: mm} } }
 * @param state { usedFallback: boolean, wetFromDefault: boolean }
 *   フォールバック／水回り未指定の発生を呼び出し側へ伝える観測点
 * @returns 下地高（m）
 */
export function resolveStudHeightM(room, opts = {}, state = null) {
  const isWet = WET_ROOM_NAME_RE.test(room?.name || '');
  const sh = opts?.studHeight || {};
  const valid = (mm) => Number.isFinite(mm) && mm >= STUD_HEIGHT_MIN_MM && mm <= STUD_HEIGHT_MAX_MM;

  // ① 部屋名指定（最優先。物件別に「この部屋だけ2.82」が指定できる。
  //    別府の押入・物入のように部屋名の一般/水回り2分法で表せない物件はここで吸収する）
  const byRoom = sh.by_room || {};
  const key = normalizeRoomName(room?.name);
  // 空文字キーは無視する（防御・2026-07-24）。by_room に '' や '　'（全角空白のみ）の
  // キーが混ざると、正規化後に '' となって resolveGeneralStudHeightM の {name:''}
  // （遮音壁ルール・収納内側など部屋に紐づかない拾い）へ誤マッチし、
  // 「1部屋の指定のつもりが物件全体の既定を乗っ取る」事故になる。
  // 部屋名なしの拾いは ②default_mm 以降で解決させるのが正しい
  if (key) {
    for (const k of Object.keys(byRoom)) {
      if (normalizeRoomName(k) === key && valid(byRoom[k])) return byRoom[k] / 1000;
    }
  }
  // ② 物件全体の明示入力（人手・XLS由来の確定値。AI読取値より優先）
  if (isWet && valid(sh.wet_mm)) return sh.wet_mm / 1000;
  if (!isWet && valid(sh.default_mm)) return sh.default_mm / 1000;
  // ②-b wet_mm未指定の水回り: 一般部の値をそのまま使う（スラブ下がり量は物件依存のため外挿しない）。
  //   別府Ｈ・Ｉ型（drop=0）と一致し、drop>0の物件では控えめ側に外れる＝過大にしない安全側。
  //   正確に拾うには wet_mm か by_room の指定が要る旨をwarningで促す
  if (isWet && valid(sh.default_mm)) {
    if (state) state.wetFromDefault = true;
    return sh.default_mm / 1000;
  }
  // ③ 展開図から読めた部屋別の値（プロンプトが下地高を返すようになった場合に効く）
  if (valid(room?.stud_height_mm)) return room.stud_height_mm / 1000;

  // ④ フォールバック: アルファ実績値（物件が違えばずれるため要確認warningを立てる）
  if (state) state.usedFallback = true;
  return isWet ? STUD_HEIGHT_WET_M : STUD_HEIGHT_M;
}

/**
 * 遮音壁ルール・収納内側など「特定の部屋に紐づかない」拾いに使う下地高（一般部）。
 * resolveStudHeightMと同じ優先順位だが、部屋別指定は参照しない。
 */
function resolveGeneralStudHeightM(opts = {}, state = null) {
  return resolveStudHeightM({ name: '' }, opts, state);
}

// ============================================================
// 住戸内遮音壁の宣言的ルール（記号読みに依存しない数式化・2026-07-19）
// 確定事実（XLS 'Ａタイプ'(=Gデータ)シートの数式セルで直接確認）:
//   遮音壁 = 「LDK↔洋室(1)間の壁1.45m」と「LDK↔洋室(3)間の壁1.05m」の2枚だけ。
//   - PBは両面計上・高さは下地高2.57: 洋室(1)ブロック P113=1.45×2.57 / 洋室(3) P221=1.05×2.57 /
//     台所 P275=1.45×2.57+1.1×2.57（裏面。1.1≒1.05の作図差）→ 遮音壁PB計 12.9785㎡/戸
//   - GWは壁1枚1回: 玄関ブロック P81=1.45×2.57 + P82=1.05×2.57 = 6.425㎡/戸
// 平面図の記号はL14が洋室(1)側に1個あるだけで洋室(3)側には無い（図面は凡例の「遮音壁の範囲」
// マーク+注意書きで指定）ため、記号読みでは原理的に全量を拾えない → 部屋ペア+壁幅の
// 宣言的ルールで計上する（AIは部屋名の転記のみ・幾何判断をさせない）。
// ※ Gタイプで検証済みのタイプ依存定数。他タイプでは特記仕様書(意匠図page_05)の「住戸内遮音壁」
//   指定に依存する（部屋名が同じでも壁構成は別物）。他タイプの正解データ入手時に
//   opts.soundWallRule = { pairs: [...] } でタイプ別ルールへ差し替えること
// ============================================================
export const DEFAULT_SOUND_WALL_PAIRS = [
  { roomA: 'リビング・ダイニング', roomB: '洋室(1)', width_mm: 1450 }, // 'Ａタイプ'!D113/J275
  { roomA: 'リビング・ダイニング', roomB: '洋室(3)', width_mm: 1050 }, // 'Ａタイプ'!D221/M275(1.1)
];

// 遮音壁ルールの部屋名照合: 正規化完全一致に加えLDK系の表記ゆれを同一視する。
// 台所系も含めるのは、遮音壁のLDK側が平面上は台所ブロックに接する壁のため
// （XLSも裏面を台所ブロックで拾う。読取が「キッチン」側の面として返しても対応させる）
const LDK_LIKE_RE = /リビング|LDK|ダイニング|食事室|キッチン|台所/;
function soundRoomMatches(ruleName, roomName) {
  if (!ruleName || !roomName) return false;
  if (normalizeRoomName(ruleName) === normalizeRoomName(roomName)) return true;
  return LDK_LIKE_RE.test(String(ruleName)) && LDK_LIKE_RE.test(String(roomName));
}

/**
 * 同一部屋のplacementのうち「同記号・完全同寸のペア」が2クラスタ以上ある場合、全ペアを1件へ縮退する（純関数）
 *
 * 等寸×2保持（claudeApi.js aggregateWallCodeItems の MAX_SAME_WALL=2）は「矩形部屋の等幅対面2枚」
 * （対面C04が典型）のための仕組みだが、Gemini実読みで「部屋内のほぼ全記号を二重転記する癖」を観測
 * （2026-07-19記録: placement123件中76件が同一部屋・同記号・完全等寸のペア。0717記録は0件）。
 * 実在の等幅対面は1部屋にせいぜい1組であり、2クラスタ以上のペアは転記ノイズの疑いが強い
 * → その部屋の全ペアを1件へ縮退する（ペアが1クラスタだけの部屋は従来どおり×2を保持=対面C04を守る）。
 * 縮退はマッチング層の二重除外（壁PB過少）と耐水第2パス救済の重複燃料（耐水過大）の両方を断つ。
 * クリーン記録（Claude×2・Gemini0717）にはペアが1件も無いことを確認済み=挙動不変。
 * 読取時（aggregateWallCodeItems）と再計算時（computeElevationTakeoff）の両方から適用する
 * （ノイズ入りのまま保存された記録のリプレイ・再計算でも効かせるため）
 */
export function collapseDoubledPlacements(placements) {
  if (!Array.isArray(placements)) return placements;
  const keyOf = (p) => `${String(p.code).toUpperCase()}|${p.wall_length_mm}`;
  const counts = new Map();
  for (const p of placements) {
    if (!p?.code || !Number.isFinite(p.wall_length_mm)) continue;
    const k = keyOf(p);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let pairClusters = 0;
  for (const n of counts.values()) if (n >= 2) pairClusters++;
  if (pairClusters < 2) return placements; // 対面1組までは実在とみなす（従来挙動）
  const seen = new Set();
  return placements.filter((p) => {
    if (!p?.code || !Number.isFinite(p.wall_length_mm)) return true; // 寸法nullは対象外
    const k = keyOf(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * メイン: 展開図データから部位別数量を積み上げる
 * @param elevations { rooms: [{ name, ceiling_height_mm, skirting, faces: [{ width_mm, height_mm?, wall_code?, openings: [] }] }] }
 * @param doorSchedule [{ symbol, name, width_mm, height_mm }]
 * @param opts { planRooms?: [{ name, area_sqm }], closetInteriors?: [{ room, inner_width_mm }],
 *               soundWallRule?: { pairs: [{ roomA, roomB, width_mm }] } }
 *   planRooms: 平面図の部屋一覧（展開図に現れない収納内の下地推定に使う）
 *   closetInteriors: 収納内側の下地幅実寸mm（見積明細の家具工事シート等。部屋名でplanRoomsと突合し、
 *     実寸がある収納は3×√面積の推定を実寸で置き換える。タイプ別に入力で与える=ハードコードしない）
 *   soundWallRule: 住戸内遮音壁の宣言的ルール（未指定はDEFAULT_SOUND_WALL_PAIRS。
 *     pairs: [] で無効化可。DEFAULT_SOUND_WALL_PAIRS参照）
 */
export function computeElevationTakeoff(elevations, doorSchedule = [], opts = {}) {
  const rooms = elevations?.rooms || [];
  const doorLookup = buildDoorLookup(doorSchedule);

  // ============================================================
  // 別府方式の図面かどうかの文書レベル判定（打放し面の過大計上を安全に縮小するためのゲート）
  // ============================================================
  // 【背景・2026-07-25】別府AタイプのGemini実読みで壁PBが+82%になる。主因は「記号を面に
  //   割り付けられなかった面が既定G14（全面PB）へ落ちる」こと。別府の展開図はRC打放し（凡例C/D/E/G）
  //   の面が多いのに、平面タイル読取のplacement寸法が展開図の面幅と揃わず（面が合算幅・
  //   タイルはセグメント幅）多くの面が既定PBへ落ちる（トレース: 別府A 237㎡が既定G14＝正解75㎡の3倍）。
  //
  // 【なぜ別府限定にするか＝アルファ非回帰の絶対条件】前サイクルで「全記録一律に打放し(C04)を
  //   差し引く」を試したところ、アルファのノイズC04（面に載らない読取ジャンク）まで差し引き
  //   壁PB 92枚→54枚(-38%)に退行して撤回された。打放しの記号（別府C/D/E/G と アルファC04）は
  //   parseWallCode 上でほぼ同一構造（base:'C', mid:0）で、AIが別府の打放しを "C04"（3桁）と
  //   転記するケースもある（この記録の plan_placements も "C04"）ため、記号単体では別府/アルファを
  //   区別できない。
  //
  // 【安全な弁別マーカー＝別府にしか無い戸境二重壁記号（遮 / G枠）の存在】別府の凡例には
  //   遮（戸境二重遮音壁）・Ｇ枠（戸境二重壁）という**アルファに存在しない記号**があり、
  //   parseBeppuWallCode がこれらに beppu:'遮'|'G枠' を付与する（アルファの3桁 C04/G14 には
  //   beppu フィールドが付かない＝長さで分岐）。記録横断で確認: 別府Aのみ遮/G枠を含み、
  //   アルファ3記録（gtype-gemini/claude×2）は1件も含まない。
  //   → 図面のどこかに 遮 か G枠 が読めていれば「別府方式の図面」と判定し、打放し面の縮小を許可する。
  //     アルファ図面では isBeppuLayout=false のまま＝この節は完全非発火＝アルファ挙動バイト単位不変。
  const isBeppuSoundCodeStr = (raw) => {
    const c = parseWallCode(raw);
    return !!(c && c.beppu && (c.beppu === '遮' || c.beppu === 'G枠'));
  };
  const isBeppuLayout = rooms.some((room) => {
    const faces = Array.isArray(room.faces) ? room.faces : [];
    if (faces.some((f) => isBeppuSoundCodeStr(f?.wall_code))) return true;
    if ((Array.isArray(room.plan_codes) ? room.plan_codes : []).some(isBeppuSoundCodeStr)) return true;
    if ((Array.isArray(room.plan_placements) ? room.plan_placements : [])
      .some((pl) => isBeppuSoundCodeStr(pl?.code))) return true;
    return false;
  });

  // 遮音壁ルールの適用対象: ペアの両部屋が展開図に存在する場合のみ（片方しか読めていない
  // 読取で幻の壁を積まない安全側ゲート。Gタイプ以外の間取りで部屋名が偶然一致した場合に
  // 誤計上するリスクはDEFAULT_SOUND_WALL_PAIRS側のコメント参照=他タイプ検証時に差し替え）
  // 界壁面の拾い高さ（物件依存: アルファ2.45 / 別府は下地高2.72・2.86）。
  // 不正値（0以下・非数・非現実的な高さ）は既定へフォールバックする
  const kaibeHeightOpt = Number(opts.kaibeWall?.height_m);
  const kaibeHeightM = (Number.isFinite(kaibeHeightOpt) && kaibeHeightOpt > 0 && kaibeHeightOpt <= 5)
    ? kaibeHeightOpt : KAIBE_FACE_HEIGHT_M;
  // 界壁面の拾い**面積**の物件別指定（実測が無いときの推定値。0＝界壁なしの明示も可）。
  // takeoffに載せて applyElevationTakeoff へ運ぶ（materialCalculatorの推定行を差し替えるため）
  const kaibeAreaOpt = resolveKaibeWallSqm(opts.kaibeWall?.area_sqm);

  const soundPairs = (Array.isArray(opts.soundWallRule?.pairs)
    ? opts.soundWallRule.pairs : DEFAULT_SOUND_WALL_PAIRS)
    .filter((p) => p && Number.isFinite(p.width_mm) && p.width_mm > 0 &&
      rooms.some((r) => soundRoomMatches(p.roomA, r.name)) &&
      rooms.some((r) => soundRoomMatches(p.roomB, r.name)));

  const t = {
    // 面積系（㎡）
    wall_pb_sqm: 0,          // 壁PB t9.5（通常間仕切・GL含む）
    waterproof_pb_sqm: 0,    // 耐水PB t9.5
    ev_wall_pb_sqm: 0,       // EV廻り・防露壁面のPB t9.5（D下地×中間1/4。XLSは壁(ボード)と別部位で拾う）
    sound_wall_pb_sqm: 0,    // 遮音壁PB張り t9.5+GW（下地L/O/W）
    gw_sqm: 0,               // グラスウール充填（下地L/S/W）
    sound_sheet_sqm: 0,      // 遮音シート（下地O）
    rawan_veneer_sqm: 0,     // ラワンベニヤ（中間3）
    konpane_sqm: 0,          // コンパネ下地（中間6）
    cloth_sqm: 0,            // 壁クロス（表面4/5）
    kitchen_panel_sqm: 0,    // キッチンパネル（表面6）
    // 延長系（m）
    partition_face_length_m: 0, // 間仕切系下地の面延長（両面計上・参考値）
    // 間仕切下地(木)の拾い量。XLS慣行の"m"表記だが実態は「壁1枚あたり片面の下地面積(㎡)」
    // = Σ(間仕切面幅×下地高(2.57/水回り2.77)−開口) を壁1枚換算(÷2)したもの。timberVolume.js解読メモ参照
    majikiri_shitaji_m: 0,
    // RC面木(D下地)の面積（D14防露/EV面・D64収納内）。木胴縁の換算には使わない（下記）ため
    // 現在この欄を読む資材行は無い（N-1）。**観測用として残す**:
    //   ①XLS集計表の別行（r26 EV面 / r73 収納内RC面）の実装時にそのまま拾い値として使う予定
    //   ②「木胴縁にD下地を混ぜていた」旧バグの再発検知に使っている（test-dobuchi-volume ③）
    rc_furring_sqm: 0,
    // 界壁面（一部界壁）の面積 — 木胴縁（一部界壁面）の材積換算用。
    // XLS集計表r85（アルファ「界壁面」/別府「部分界壁」）に対応し、rc_furring_sqmとは**別部位**。
    // 展開図の面から機械的に切り出せないため（下記 KAIBE_* の注記参照）、面に界壁の明示があるときだけ積む。
    kaibe_furring_sqm: 0,
    kaibe_furring_faces: 0,  // 界壁面として拾えた面の数（0なら実測なし=推定を維持する判定に使う）
    // 実測が無い場合に使う推定面積（㎡/戸）と、その出どころ。物件別指定 opts.kaibeWall.area_sqm を
    // applyElevationTakeoff まで運ぶための欄（source='override' なら 0 指定も含めて推定行を置き換える）
    kaibe_estimate_sqm: kaibeAreaOpt.value,
    kaibe_estimate_source: kaibeAreaOpt.source, // 'default'（アルファ実績）| 'override'（物件別指定）
    kaibe_estimate_invalid: kaibeAreaOpt.invalid || null, // 採用できなかった指定値（警告用）
    skirting_m: { 木製: 0, ソフト: 0, 樹脂: 0 },
    // 参考
    opening_area_sqm: 0,
    // 開口×建具表マッチの内訳。symbol=符号確定 / inferred=推定補完 /
    // unresolved=解決後も寸法欠けのままの開口数（符号マッチしたが建具表行に寸法が無い場合も含む）
    opening_match: { symbol: 0, inferred: 0, unresolved: 0 },
    // 開口控除の物理ガード発動数（2026-07-19）: width_over_face=面幅超過で棄却 /
    // dup_dropped=超過面で落とした完全同一開口 / clamped_faces=比率縮退した面数 /
    // wet_window_dropped=水回り小部屋に誤配置された大窓の除去 /
    // cross_face_door_dropped=同一符号ドアが同一部屋の複数面に幻出した重複の除去（2026-07-22）
    opening_guard: {
      width_over_face: 0, dup_dropped: 0, clamped_faces: 0,
      wet_window_dropped: 0, cross_face_door_dropped: 0,
    },
    rooms: [],
  };
  // ガード発動などの要確認事項（applyElevationTakeoffがresult._warningsへ載せ替える）
  t._warnings = [];
  // 別府方式Ｇの囲み形状が不明のまま既定（丸囲み=打放し・PBなし）で処理した件数（2026-07-24）。
  // 図面実測ではＧは四角囲み（丸囲みは遮のみ）だったため既定が外れる公算があり、
  // 外れた場合は戸境二重壁のPB+GWが**静かに過少**になる（サニティは上限側しか見ない）。
  // 面/plan_codes/plan_placementsの3経路すべてで数え、下で_warningsに集約する
  t.beppu_g_shape_unknown = 0;
  // 戸境二重壁（遮/G枠）を物理的に持ち得ない部屋（NON_PARTY_WALL_ROOM_RE）で読まれた
  // 遮/G枠を棄却した件数（2026-07-25）。別府でGeminiがバルコニー・倉庫・収納・水回り内部へ
  // 系統的に遮/G枠を誤付与し遮音壁PBが暴走していたのを物理制約で削る。下で_warningsへ集約。
  t.beppu_sound_nonparty_dropped = 0;

  // 高さ誤転記の疑い寸法（2026-07-19 Gemini読取ノイズ対策）: 平面図タイルの壁寸法(wall_length_mm)に
  // 天井高（2,400/2,200等の図面内の高さ表記）が混入する実例があるため、いずれかの部屋のCHと
  // 完全一致する寸法は「高さの誤転記疑い」として面割付の優先度を下げる。
  // 実在の面幅がCHと偶然一致するケース（例: キッチン面幅2200=CH2200）を殺さないため
  // 除外はせず降格のみ（他に±80mm候補が無い面では従来どおり割り付く）。
  // ただし耐水記号（中間2/5）は誤爆時の増幅が大きい（耐水過大+間仕切鏡像加算+第2パス救済が連鎖）
  // ため、疑い寸法は割付に使わない（実例: パウダーのG24@2400=居室CHの誤転記が面幅2360に化けて耐水+5.3㎡）
  const suspectHeights = new Set(rooms.map((r) => r.ceiling_height_mm).filter(Boolean));

  // 間仕切下地(木): 部屋間の壁は両部屋の展開図に現れる（ドア開口が両側の面に出ることを実データで確認）
  // ため、面ごとの拾いを合算して最後に÷2し「壁1枚1回」のXLS方式に合わせる。
  // UB隣接面(耐水記号)は反対面がUB内で展開図に現れない → 鏡像分をもう一度足して÷2で相殺する。
  // 下地高フォールバックの観測点（物件汎用化・2026-07-24）。
  // 図面・入力から下地高が得られずアルファ実績値(2.57/2.77)を使った場合にwarningを立てる
  // （別府等では実値2.72/2.82/2.86とずれるため、ユーザーが物件差に気づけるようにする）。
  // wetFromDefault = wet_mm未指定で水回りにも一般部の値を当てた（スラブ下がり分を外挿していない）
  const studHeightState = { usedFallback: false, wetFromDefault: false };

  let majikiriDouble = 0; // 両面計上の下地面積（後で÷2）
  // D6*（収納内RC面コンパネ）の面幅を展開図の部屋ごとに記録 — 収納推定からの重複控除用。
  // 戸全体の単一アキュムレータだと、平面図の部屋名と一致する（=推定対象外でskip済みの）収納の
  // D6*実測が、展開図に無い別の収納の推定分から差し引かれてゼロ化する（2026-07-18レビュー確定バグ）
  const d6ByElevRoom = new Map(); // 正規化部屋名 -> D6*面幅合計(m)

  // 別府方式Ｇ（囲み形状不明）の検出（④・2026-07-24）。
  // canonicalizeWallCodeが四角囲みを 'G枠' へ畳み込むため、保存データに素の 'G' が残っている
  // ＝「丸囲みだった」か「形状が判別できなかった」のどちらか。読取側は形状不明時に shape:null を
  // 返す（推測禁止）ので、素の 'G' の大半は後者とみなして数える。
  // アルファの3桁記号（G14等）は長さで分岐するためここに掛からない（=通常運用で非発火）。
  const isBeppuBareG = (raw) => typeof raw === 'string'
    && String(raw).trim().toUpperCase() === 'G';

  for (const room of rooms) {
    // UB内部の立面は拾わない（UB_ROOM_NAME_RE参照。読取ノイズで幻出した室のスキップ）
    if (UB_ROOM_NAME_RE.test(normalizeRoomName(room.name))) continue;
    const ch = (room.ceiling_height_mm || 2400) / 1000;
    // 下地高: 物件別入力 > 展開図の部屋別実値 > アルファ実績値（2.57/水回り2.77）。
    // CH非連動（resolveStudHeightM / STUD_HEIGHT_M定義のコメント参照）
    const studH = resolveStudHeightM(room, opts, studHeightState);
    const faces = Array.isArray(room.faces) ? room.faces : [];
    let perimeter = 0;
    let floorOpeningWidth = 0;
    let roomWallNet = 0;

    // 平面詳細図から抽出した部屋の壁記号（plan_codes）。
    // その部屋の記号が1種類だけなら、記号未指定の面のデフォルトとして使う。
    // ただし「PBを張らない/特殊な構成」（C=打放, D6*=コンパネ, Z=ナシ等）を全面に
    // 適用するのは危険（記号の部屋帰属はタイル境界で誤りうる。トイレ全面コンパネ等の
    // 誤分類を実測で確認済み）ため、全面適用は標準的なPB構成のみに限定する。
    // 囲み形状不明のＧの計数（④・上のisBeppuBareG参照）。読取の3経路すべてを見る。
    // plan_codesはSet化前の生配列で数える（同じ部屋に複数面あれば複数件として警告に出す）
    for (const f of faces) if (isBeppuBareG(f?.wall_code)) t.beppu_g_shape_unknown++;
    for (const c of (Array.isArray(room.plan_codes) ? room.plan_codes : [])) {
      if (isBeppuBareG(c)) t.beppu_g_shape_unknown++;
    }
    for (const pl of (Array.isArray(room.plan_placements) ? room.plan_placements : [])) {
      if (isBeppuBareG(pl?.code)) t.beppu_g_shape_unknown++;
    }

    const planCodes = Array.isArray(room.plan_codes)
      ? [...new Set(room.plan_codes.map((c) => String(c).toUpperCase()).filter((c) => parseWallCode(c)))]
      : [];
    let roomDefaultCode = null;
    if (planCodes.length === 1) {
      const c = parseWallCode(planCodes[0]);
      // 全面適用は「通常PB（中間1/4）」のみ。耐水（2/5）はUB隣接の特定面にしか
      // 張らないため全面適用しない（トイレ全面耐水などの過大計上を防ぐ。面単位の
      // 割付はplan_placementsの寸法マッチで行う）
      // 別府方式の遮音系（遮 / G枠 → base W）も全面適用しない: 戸境壁は住戸の外周側1〜2面に
      // しか無いのに、その部屋で読めた記号が遮だけだと四方全面が遮音壁PB（下地高×両面+GW）に
      // 化け、遮音壁PBが4倍規模で暴発する。別府の遮/G枠は必ず面単位（plan_placementsの
      // 寸法マッチ or 面のwall_code）で割り付ける（2026-07-24 別府対応で追加した安全弁）。
      // ※アルファ側は 'L14 のみ' の部屋が実データに無く、この除外で挙動が変わらないことを
      //   eval/replay全記録で確認済み（アルファ不変）
      const isStandardPb = c && ['G', 'I', 'H', 'L', 'O', 'W', 'S'].includes(c.base)
        && [1, 4].includes(c.mid) && !(c.beppu && ['遮', 'G枠'].includes(c.beppu));
      if (isStandardPb) roomDefaultCode = c;
    }

    // 【別府限定・打放し既定への切替（2026-07-25）】
    // 別府方式の図面（isBeppuLayout。遮/G枠の存在で判定）で、この部屋の平面タイル読取に
    //   打放し記号（C下地・別府C/D/E/G や アルファ表記のC04）が1つでも含まれる場合、
    //   面に割り付けられなかった面（placement/面記号なし）を既定G14（全面PB）ではなく
    //   **打放し（PBなし）** に倒す。
    // 根拠: 別府はRC躯体面が多く、AIが「その部屋に打放し記号がある」と読めた時点で、その部屋は
    //   RC打放し面を含むことが確定する。展開図の面幅と平面タイルのセグメント幅が揃わず割付漏れした
    //   面を全面PBへ落とすと壁PBが暴発する（別府A: 既定G14面が237㎡＝正解75㎡の3倍）。割付漏れ面を
    //   PB(過大)ではなく打放し(過少)へ倒すことで、この物件の主誤差である+82%を安全側に縮小する。
    // 安全性:
    //   ・isBeppuLayout=false のアルファ図面では発火しない（遮/G枠が無い）＝アルファ完全不変。
    //   ・別府でも「打放し記号を1つも読めていない部屋」（LDK/洗面室等）は従来どおり既定G14を維持する
    //     （＝読取根拠が無い部屋を勝手に打放しにはしない＝答え合わせに寄せない）。
    //   ・面/plan_placements に個別の記号（A=PB / G24=耐水 等）が付く面はその記号が優先されるため、
    //     この既定は「記号の無い面」にしか効かない（打放しを全面に塗るわけではない）。
    // 位置づけ: roomDefaultCode を打放しへ差し替える（面ループ末尾の既定 { base:'G',mid:1,surf:4 } の代替）。
    //   roomDefaultCode が上で標準PBに確定している部屋（planCodes単一のPB）はそれを尊重し、打放しへは
    //   倒さない（PBと明示読取された部屋を打放しに落とさない安全側）。
    if (isBeppuLayout && !roomDefaultCode) {
      const hasBlankConcrete = planCodes.some((pc) => {
        const c = parseWallCode(pc);
        return c && c.base === 'C' && c.mid === 0;
      });
      // 打放し既定コード（別府C相当・base:'C', mid:0）。surfは0（クロス無し面もあるため既定は無仕上げ）。
      // 面ループでこの code は switch(mid) の default に落ちて壁PBに載らない＝PBなしになる。
      if (hasBlankConcrete) roomDefaultCode = { base: 'C', mid: 0, surf: 0, _beppuBlankDefault: true };
    }

    // 平面図タイル読取の「記号＋壁寸法mm」を面に割り付ける。
    // 展開図のA〜D面の向きは作図者次第でルールが無い（2026-07-14打ち合わせで確認）ため
    // 方角ではなく「平面図の壁寸法 ≒ 展開図の面幅」の数値マッチで面を特定する
    // （AIの転記のみで成立し、長辺/短辺のような幾何判断をさせない）。
    // 面積の計算には「対面のどちらか」までの特定は不要（同じ幅の対面なら面積が同じ）。
    // これでC04（打放・PBなし）等の面がデフォルトPB扱いで過大計上されるのを防ぐ。
    const PLACEMENT_TOL_MM = 80; // 平面図の壁寸法と展開図の面幅の許容差（芯/内法の差を吸収）
    const placementByFace = new Map(); // faceIndex -> parsed code
    // 別府の戸境二重壁（遮/G枠）はセグメント長で直接計上する（下記soundSegments）。
    // これらは面幅マッチ（placementByFace）から除外する — 別府の展開図は面が壁全体で
    // 合算されており（例 LDK-A面=8200mm）、平面図タイルのセグメント長（遮@3250/G枠@2250）と
    // ±80mmで一致しない。マッチに頼ると①遮/G枠が面に載らず遮音壁PBが過少
    // ②その面が既定G14へ落ちて壁PBが過大、という別府の実害（壁PB+98%/遮音壁-80%）が出る。
    // セグメント長そのものが「その戸境壁の実長」なので、面幅と突合せず長さで拾うのが正しい
    // （XLSも部屋ブロックの面をセグメント単位で拾う）。両面計上は各室のplacementが両側を
    // 持つことで自然に成立する（遮@3250はLDKと洋室3の両方に出る）。
    // ※ アルファの記録に遮/G枠 placementは1件も無い（3桁記号のみ）＝この分岐は非発火＝回帰なし。
    const soundSegments = []; // { c, len(m) } — 遮/G枠のセグメント（面幅マッチ対象外）
    const isBeppuSoundCode = (c) => c && c.beppu && ['遮', 'G枠'].includes(c.beppu);
    // 物理制約: この部屋が戸境二重壁を持ち得ない部屋種別（バルコニー/倉庫/収納内部/水回り内部）
    // なら、そこで読まれた遮/G枠は誤検出として棄却する（NON_PARTY_WALL_ROOM_RE参照）。
    // 居室（LDK/洋室/玄関/廊下）の遮/G枠はここでは弾かず本物として計上する。
    const isNonPartyRoom = NON_PARTY_WALL_ROOM_RE.test(normalizeRoomName(room.name));
    if (Array.isArray(room.plan_placements) && faces.length >= 1) {
      // 二重転記ノイズの縮退（保存済み記録にもノイズが残るため読取時と再計算時の両方で適用）
      const planPlacements = collapseDoubledPlacements(room.plan_placements);
      const used = new Set();
      const usedPl = new Set();
      // 消費済みの(記号|寸法)キー。縮退をすり抜けた同記号・同寸の残骸が第2パス救済の
      // 燃料になって同じ壁を二重に割り付けるのを防ぐ（ガード5・2026-07-19）
      const consumedKeys = new Set();
      const plKey = (pl) => `${String(pl.code).toUpperCase()}|${pl.wall_length_mm}`;

      // 第0パス: 展開図の面記号(wall_code)で実測済みの壁に対応するplacementを消費済みにする。
      // 同一記号・寸法±80mmのplacementが未消費のまま残ると、等幅の無記号面へ割り付いて
      // 同じ壁を二重に除外/振替してしまう（例: A面C04実測済み + 等幅C面 → C面までC04扱いで
      // 壁PBが過少になるのを再現で確認・2026-07-18レビュー確定バグ）。
      // 記号一致かつ寸法一致の面ごとに最も近い1件だけ消費する（寸法の合わないplacementは
      // 実在の第2の壁でありうるため残す）。
      const codedCands = [];
      for (const pl of planPlacements) {
        const c = parseWallCode(pl?.code);
        const len = pl?.wall_length_mm;
        if (!c || !Number.isFinite(len) || len <= 0) continue;
        if (isBeppuSoundCode(c)) continue; // 遮/G枠はセグメント長で別途計上（面幅マッチしない）
        for (let i = 0; i < faces.length; i++) {
          const fc = parseWallCode(faces[i].wall_code);
          if (!fc || fc.base !== c.base || fc.mid !== c.mid || fc.surf !== c.surf) continue;
          const d = Math.abs((faces[i].width_mm || 0) - len);
          if (d <= PLACEMENT_TOL_MM) codedCands.push({ pl, i, d });
        }
      }
      codedCands.sort((a, b) => a.d - b.d);
      for (const cand of codedCands) {
        if (used.has(cand.i) || usedPl.has(cand.pl)) continue;
        used.add(cand.i); // 記号付き面は元々cands対象外だが、消費済みの記録として揃えておく
        usedPl.add(cand.pl);
        consumedKeys.add(plKey(cand.pl));
      }

      // 寸法差が小さい割付から確定させる（曖昧なマッチが確実なマッチの面を奪わないように）
      const cands = [];
      for (const pl of planPlacements) {
        if (usedPl.has(pl)) continue; // 第0パスで実測面に消費済み
        const c = parseWallCode(pl?.code);
        const len = pl?.wall_length_mm;
        if (!c || !Number.isFinite(len) || len <= 0) continue;
        // 別府の戸境二重壁（遮/G枠）: 面幅マッチせずセグメント長で計上する。
        // 面幅マッチ（±80mm）は合算面（LDK-A面8200等）で外れて過少/過大化するため。
        // ただし戸境壁を物理的に持ち得ない部屋（isNonPartyRoom）の遮/G枠は誤検出として棄却。
        if (isBeppuSoundCode(c)) {
          if (isNonPartyRoom) { t.beppu_sound_nonparty_dropped += 1; continue; }
          soundSegments.push({ c, len: len / 1000 });
          continue;
        }
        const susp = suspectHeights.has(len) ? 1 : 0; // 高さ誤転記疑い（suspectHeights参照）
        if (susp && (c.mid === 2 || c.mid === 5)) continue; // 耐水記号×疑い寸法は割付しない（増幅遮断）
        // 遮音壁ルール適用時、遮音記号（L/O/W）placementの採用は
        // 「ペア構成部屋（roomA/roomB該当室）×ペア幅±80mm」に限定する:
        // 遮音壁は確定2枚だけ＝それ以外のL系読取は部屋帰属ノイズの疑いが強い。
        // 部屋限定が無いと、非ペア部屋のL14がペア幅帯に偶然入って素通りする
        // （実例: Gemini記録の玄関・廊下L14@1000が|1000−1050|=50で帯内→面965に割り付き
        //  遮音+0.53㎡/GW誤加算。真の壁記号はD14=EV面）。
        // 不採用のplacementは捨てられ、面はデフォルトG14へ落ちる（壁PB側=読取ノイズとして安全側）。
        // 展開図の面記号（face.wall_code）のL/O/Wは実測として従来どおり尊重する
        if (soundPairs.length > 0 && ['L', 'O', 'W'].includes(c.base)) {
          const inPairRoom = soundPairs.some((p) =>
            soundRoomMatches(p.roomA, room.name) || soundRoomMatches(p.roomB, room.name));
          const inBand = soundPairs.some((p) => Math.abs(len - p.width_mm) <= PLACEMENT_TOL_MM);
          if (!inPairRoom || !inBand) continue;
        }
        for (let i = 0; i < faces.length; i++) {
          const fw = faces[i].width_mm || 0;
          if (fw <= 0 || parseWallCode(faces[i].wall_code)) continue; // 展開図の面記号は実測として優先
          const d = Math.abs(fw - len);
          if (d <= PLACEMENT_TOL_MM) cands.push({ pl, c, i, d, susp });
        }
      }
      // タイ解決（寸法差の同点=等幅の対面が典型）: 面index順で機械的に選ぶと、C04（打放・
      // PBなし）が誤った側に付いたとき開口面積の分だけ壁PBがずれる（レビュー再現: A面開口あり/
      // C面なしで+1.60㎡=開口分ちょうど）。開口の物理制約を加点式でランク化して面を選ぶ:
      //   - RC打放（C下地）の壁に木製建具の開口は切れない → ドア等のある面は後回し(+1)
      //   - 窓はRC外周壁側に付く（読取プロンプトの業務知識「C04は窓のあるバルコニー側にも
      //     付く」と同根） → 窓のある面を優先(-1)
      //   - 両方が同居する面（窓+ドア）は加点相殺で中立(0)。シグナルが矛盾する面は開口の
      //     誤帰属（読取ノイズ）の疑いが強く、どちらか一方に賭けない（実例: Gemini記録
      //     洋室(1)A面=窓+幻ドア。ドア優先を単独適用するとC04が無開口面へ動き壁PB-11%に悪化）
      // 実測整合（Claude記録リプレイで確認）: 洋室(1) C04@5190 → ドア2枚のB面でなく無開口の
      // D面へ（XLS部屋ブロックのD面=C04と一致）、LDK C04@3540 → 開口面でなく窓面へ。
      // 残タイ（ランクも同点）は面積が同値か判別不能 → index順で決定的に確定。
      const tieRank = (cand) => {
        if (cand.c.base !== 'C') return 0;
        const ops = faces[cand.i].openings || [];
        let r = 0;
        if (ops.some((op) => !isWindow(op))) r += 1;
        if (ops.some((op) => isWindow(op))) r -= 1;
        return r;
      };
      // 高さ誤転記疑い（susp）は他の候補より後回し（=非疑い候補が面を取り切った残りにだけ割り付く。
      // 2400が面幅2360±80に化ける経路の抑制。距離より優先して降格する）
      cands.sort((a, b) => (a.susp - b.susp) || (a.d - b.d) || (tieRank(a) - tieRank(b)) || (a.i - b.i));
      for (const cand of cands) {
        if (used.has(cand.i) || usedPl.has(cand.pl)) continue;
        used.add(cand.i);
        usedPl.add(cand.pl);
        consumedKeys.add(plKey(cand.pl));
        placementByFace.set(cand.i, cand.c);
      }

      // 第2パス（耐水記号限定の救済マッチ）: 水回り部屋で第1パス（±80mm）に漏れた
      // 耐水placement（中間2/5・例G24）だけを、未割付の面のうち幅が最も近いものへ
      // tol=300mmまで緩めて割り付ける。根拠: 面幅の転記が芯々/内法・部分区間で揺れるため
      // （実例: Gemini実読み パウダー1725 vs 面幅1925=差200）。300mmは両端の壁厚合計
      // （RC約180+LGS約65+仕上代）を上限とする物理的な揺れ幅。Gタイプ1記録でのみ検証・
      // 他タイプ未検証。なお器具寸法（洗面台W1000・UB1416等）の誤転記は差500以上になり
      // ±300でも救済されない。耐水記号は水回りにしか出ないため誤爆面が限定される
      // （WET_ROOM_NAME_RE参照）。居室・耐水以外の記号（LDKのC04ジャンク等）は
      // 救済しない（±80のまま維持）。
      if (WET_ROOM_NAME_RE.test(room.name || '')) {
        const WATERPROOF_RESCUE_TOL_MM = 300;
        const rescue = [];
        for (const pl of planPlacements) {
          if (usedPl.has(pl)) continue;
          const c = parseWallCode(pl?.code);
          const len = pl?.wall_length_mm;
          if (!c || !(c.mid === 2 || c.mid === 5)) continue; // 耐水記号のみ
          if (!Number.isFinite(len) || len <= 0) continue;
          if (suspectHeights.has(len)) continue; // 高さ誤転記疑いは救済に使わない（suspectHeights参照）
          // 同記号・同寸を第0/1パスで消費済みなら、その残骸は二重転記の疑い → 救済の燃料にしない
          // （実例: パウダーのG24@1725ペアがB/D両面へ二重救済され耐水過大・2026-07-19）
          if (consumedKeys.has(plKey(pl))) continue;
          for (let i = 0; i < faces.length; i++) {
            if (used.has(i)) continue;
            const fw = faces[i].width_mm || 0;
            if (fw <= 0 || parseWallCode(faces[i].wall_code)) continue;
            const d = Math.abs(fw - len);
            if (d <= WATERPROOF_RESCUE_TOL_MM) rescue.push({ pl, c, i, d });
          }
        }
        rescue.sort((a, b) => a.d - b.d);
        for (const cand of rescue) {
          if (used.has(cand.i) || usedPl.has(cand.pl)) continue;
          used.add(cand.i);
          usedPl.add(cand.pl);
          placementByFace.set(cand.i, cand.c);
          // 救済割付は1部屋につき最大1件（差が最小の候補のみ）。救済パスはあくまで
          // フォールバックであり、水回り部屋がUBに接する耐水面は通常1面のため、
          // ±300mmの緩い窓で複数面へ広がる過大計上を防ぐ（安全側ガード）
          break;
        }
      }
    }

    // 別府の戸境二重壁（遮/G枠）のセグメント計上（面幅マッチしない・上のsoundSegments参照）。
    //   ・遮音壁PB … セグメント長×下地高（各室のplacementが両側を持つため両面が自然に揃う）
    //   ・GW … 同上（遮・G枠とも胴縁+PB+GW24K充填）
    //   ・遮音シート … 遮のみ（G枠は遮音シートなし）
    // 高さは下地高（遮音壁はスラブ下までボードを張る＝一般部の下地高。図面注意書き準拠）。
    // 併せて「セグメント幅の合計」を、この面がその戸境壁を含む面（記号なし=既定G14へ落ちる面）から
    // 差し引く予算（soundDeductByFace）として登録し、同じ壁が壁PB本体に二重計上されるのを防ぐ。
    // faceIndex -> 壁PB本体の面積計上から差し引く幅(m)。
    const soundDeductByFace = new Map();
    // 遮/G枠（戸境二重壁）: 遮音壁PB・GW（・遮のみ遮音シート）をセグメント長×下地高で計上し、
    //   同幅を壁PB本体から差し引く。両面計上は各室のplacementが両側を持つことで自然に成立。
    //   差し引き先の面: 記号未確定（面記号なし・placementByFace未割付）で残余幅が
    //   セグメント長を収容でき、幅が最小の面（合算面 8200 に 遮3250 が含まれる想定）を1件選ぶ。
    for (const seg of soundSegments) {
      t.sound_wall_pb_sqm += seg.len * studH;
      t.gw_sqm += seg.len * studH;
      if (seg.c.sound_sheet === true) t.sound_sheet_sqm += seg.len * studH;
      let best = -1;
      let bestW = Infinity;
      for (let i = 0; i < faces.length; i++) {
        if (parseWallCode(faces[i].wall_code) || placementByFace.get(i)) continue;
        const fw = (faces[i].width_mm || 0) / 1000;
        const already = soundDeductByFace.get(i) || 0;
        if (fw - already + 1e-6 < seg.len) continue; // 残余幅がセグメントを収容できない面は不可
        if (fw < bestW) { bestW = fw; best = i; }
      }
      if (best >= 0) soundDeductByFace.set(best, (soundDeductByFace.get(best) || 0) + seg.len);
      // 収容できる面が無い場合はPB本体からの差し引きをしない（過少側で安全）。
      // 戸境壁の計上自体はセグメント長で済んでいるため遮音壁PBは正しく立つ。
    }

    // 遮音壁ルールと同じ壁を指す面の消費（面単位のused管理・二重計上防止）:
    // この部屋が関与するペアごとに、幅がpair.width_mm±80mmの面を最大1面
    // 「ルール側で計上済み」としてマークする。対象は遮音記号（L/O/W）の面と
    // 間仕切PB扱いになる面（G×中間1/4・記号なしデフォルト含む）のみ。
    // C04/D64等（元々壁PBに入らない面）は消費しない。遮音記号の面を最優先
    // （既にL14で遮音に入っている面と数式ルールが同じ壁を指すケース＝eval fixtureの洋室(1)C1面）
    const soundConsumed = new Set();
    for (const p of soundPairs) {
      if (!soundRoomMatches(p.roomA, room.name) && !soundRoomMatches(p.roomB, room.name)) continue;
      let best = -1;
      let bestD = Infinity;
      let bestSound = false;
      for (let i = 0; i < faces.length; i++) {
        if (soundConsumed.has(i)) continue;
        const fw = faces[i].width_mm || 0;
        if (fw <= 0) continue;
        const d = Math.abs(fw - p.width_mm);
        if (d > PLACEMENT_TOL_MM) continue;
        const c = parseWallCode(faces[i].wall_code) || placementByFace.get(i)
          || roomDefaultCode || { base: 'G', mid: 1, surf: 4 };
        const isSoundCode = ['L', 'O', 'W'].includes(c.base);
        const isPartitionPb = c.base === 'G' && (c.mid === 1 || c.mid === 4);
        if (!isSoundCode && !isPartitionPb) continue;
        if ((isSoundCode && !bestSound) || (isSoundCode === bestSound && d < bestD)) {
          best = i; bestD = d; bestSound = isSoundCode;
        }
      }
      if (best >= 0) soundConsumed.add(best);
    }

    // 部屋横断の開口健全化（大窓の水回り誤配置・同一符号ドアの面またぎ重複を除去・2026-07-22）。
    // 面ごとの控除ループの前に「控除対象から外す raw 開口」を確定させる。
    // これらは面幅超過ガード（面単位）だけでは残骸が別面の判定に混入しうるため部屋単位で除去する。
    const { drop: droppedOpenings, stats: sanitizeStats } =
      sanitizeRoomOpenings(faces, doorLookup, room.name);
    t.opening_guard.wet_window_dropped += sanitizeStats.wet_window_dropped;
    t.opening_guard.cross_face_door_dropped += sanitizeStats.cross_face_door_dropped;
    if (sanitizeStats.wet_window_dropped + sanitizeStats.cross_face_door_dropped > 0) {
      t._warnings.push({
        field: 'opening_guard',
        message: `${room.name}: 開口の幻覚読取を除去しました（大窓の水回り誤配置` +
          `${sanitizeStats.wet_window_dropped}件・同一符号ドアの複数面重複` +
          `${sanitizeStats.cross_face_door_dropped}件）。壁数量が過少になる読取ノイズの補正です`,
        before: null, after: null,
      });
    }

    for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
      const face = faces[faceIdx];
      const w = (face.width_mm || 0) / 1000;
      if (w <= 0) continue;
      // 別府の戸境壁セグメント分は、この面の「壁PB/GW等の面積計上」からのみ差し引く
      // （上のsoundDeductByFace参照）。差し引かれた幅の壁は既に遮音壁PB/GWとしてセグメント長で
      // 計上済みのため壁PB本体に載せると二重計上になる。周長・巾木・開口はその戸境壁も
      // 物理的にこの部屋の壁なので full width（w）のまま拾う（wPb=面積計上用の残余幅）。
      const wPb = Math.max(0, w - (soundDeductByFace.get(faceIdx) || 0));
      // 面の高さ: 展開図の実測(height_mm)があればそのまま、無ければCH+40mm（XLSの壁拾い高さ）
      const h = (face.height_mm ? face.height_mm : (room.ceiling_height_mm || 2400) + WALL_PICKUP_EXTRA_MM) / 1000;
      perimeter += w;

      // 開口控除（物理ガード付き・2026-07-19 Gemini読取ノイズ対策）
      let openingArea = 0;
      let openingAreaStud = 0; // 下地用（下地高=CH+370まで見るので面の仕上げ高でキャップしない）
      const resolvedOps = [];
      for (const raw of face.openings || []) {
        // 部屋横断ガードで幻覚と判定された開口は控除しない（面数量の過少補正）
        if (droppedOpenings.has(raw)) continue;
        const op = resolveOpening(raw, doorLookup, room.name);
        // マッチ結果の印を元データに付ける（このリクエスト内限りのインメモリ観測点。寸法は書き戻さない。
        // ※ /calculate の書き戻しは警告のみ最新版へマージする方式（サイクルC）のため永続化はされない）
        // 再計算でマッチ結果が変わった場合に備え、マッチしなかったら古い印は消す
        if (op.matched_by) raw.matched_by = op.matched_by;
        else delete raw.matched_by;
        if (op.matched_by === 'symbol') t.opening_match.symbol++;
        else if (op.matched_by === 'inferred') t.opening_match.inferred++;
        // 寸法欠けは符号マッチの成否と独立に数える（符号は合ったが建具表行に寸法が無い場合も含む）
        if (!op.width_mm || !op.height_mm) t.opening_match.unresolved++;
        const ow = (op.width_mm || 0) / 1000;
        const oh = (op.height_mm || 0) / 1000;
        if (ow <= 0) continue;
        // ガード①: 面幅を超える開口は物理的に載らない → 控除から棄却
        // （実例: 幻覚窓AWD-102=4120mmが洋室の面3685/2360に付き、面の壁がゼロに潰れた）
        if ((face.width_mm || 0) > 0 && op.width_mm > face.width_mm) {
          t.opening_guard.width_over_face++;
          t._warnings.push({
            field: 'opening_guard',
            message: `${room.name}${face.face ? face.face + '面' : ''}: 開口${op.symbol || op.type || ''}` +
              `(幅${op.width_mm}mm)が面幅${face.width_mm}mmを超えるため控除から除外しました（読取誤りの疑い）`,
            before: null, after: null,
          });
          continue;
        }
        // 高さ不明の開口: 窓=腰窓標準1.1m / 戸=2.0m。面の高さは超えない
        const fallbackH = isWindow(op) ? 1.1 : 2.0;
        const effH = Math.min(oh > 0 ? oh : fallbackH, h);
        const reachesFloor = !isWindow(op) || (op.height_mm || 0) >= FLOOR_OPENING_MIN_HEIGHT_MM;
        resolvedOps.push({
          area: ow * effH,
          areaStud: ow * Math.min(oh > 0 ? oh : fallbackH, studH),
          floorW: reachesFloor ? ow : 0,
          // 完全同一開口の判定キー（符号優先・無ければtype。寸法は解決後の値）
          dupKey: `${normalizeDoorSymbol(op.symbol) || op.type || ''}|${op.width_mm}|${op.height_mm}`,
        });
      }
      // ガード②: 開口合計が面面積の90%超（OPENING_MAX_FACE_RATIO）は幻覚・重複転記とみなす。
      // まず面内の完全同一開口（dupKey一致）の2件目以降を落とし、なお超過なら比率まで縮退+警告。
      // ※ 同一寸法の実在ペア（例: Claude記録LDKの片開き戸800×2175×2）を守るため、
      //   重複落としは超過した面でのみ発動する（通常面では従来どおり全件控除）
      let ops = resolvedOps;
      const grossFace = w * h;
      const sumArea = (list) => list.reduce((s, x) => s + x.area, 0);
      if (grossFace > 0 && sumArea(ops) > OPENING_MAX_FACE_RATIO * grossFace) {
        const seen = new Set();
        ops = ops.filter((x) => {
          if (seen.has(x.dupKey)) { t.opening_guard.dup_dropped++; return false; }
          seen.add(x.dupKey);
          return true;
        });
        const total = sumArea(ops);
        if (total > OPENING_MAX_FACE_RATIO * grossFace) {
          // 面積比例で縮退（残す開口を選べないため一律スケール。下地控除も同率）
          const scale = (OPENING_MAX_FACE_RATIO * grossFace) / total;
          for (const x of ops) { x.area *= scale; x.areaStud *= scale; }
          t.opening_guard.clamped_faces++;
        }
        t._warnings.push({
          field: 'opening_guard',
          message: `${room.name}${face.face ? face.face + '面' : ''}: 開口控除の合計が面面積の90%を超えたため` +
            '縮退しました（開口の重複・幻覚読取の疑い。この面の壁数量は要確認です）',
          before: null, after: null,
        });
      }
      for (const x of ops) {
        openingArea += x.area;
        openingAreaStud += x.areaStud;
        floorOpeningWidth += x.floorW;
      }

      const net = Math.max(0, w * h - openingArea);
      // netPb: 戸境壁セグメント分を除いた残余幅での正味面積（壁PB/耐水/GW等の面積計上に使う）。
      // soundDeductが無い通常面では wPb===w のため netPb===net（＝別府以外・別府の非戸境面は不変）。
      const netPb = soundDeductByFace.get(faceIdx)
        ? Math.max(0, wPb * h - Math.min(openingArea, wPb * h))
        : net;
      t.opening_area_sqm += openingArea;
      roomWallNet += net;

      // 部位振り分け（面の記号 > 長辺/短辺割付 > 部屋の単一記号 > 間仕切+PB9.5+クロスのデフォルト）
      const code = parseWallCode(face.wall_code) || placementByFace.get(faceIdx)
        || roomDefaultCode || { base: 'G', mid: 1, surf: 4 };

      // 遮音壁ルールで計上済みの面: PB/GW/下地系の振り分けをスキップ（ルール側で
      // PB両面×2.57+GW1回を計上済み。二重計上防止）。周長・巾木・開口・部屋統計は
      // 上で計上済みのまま、クロス（表面4/5）だけは面の実仕上げとして拾う
      if (soundConsumed.has(faceIdx)) {
        if (code.surf === 4 || code.surf === 5) t.cloth_sqm += net;
        continue;
      }

      // 間仕切下地(木)の拾い（XLS方式: G下地のみ。遮音壁L/O/Wは「遮音壁PB張り」の部位で別拾い）
      // ※ wPb=戸境壁セグメント分を除いた残余幅（別府以外・非戸境面では w と一致）
      if (code.base === 'G') {
        majikiriDouble += Math.max(0, wPb * studH - openingAreaStud);
        // 鏡像加算: 「耐水記号(中間2/5)の面=UB隣接で、反対面はUB内=展開図に現れない」という
        // Gタイプ実測に基づく仮定で、不可視の反対面分を足す（÷2で壁1枚に戻る）。
        // ※ 既知の限界: 両面とも展開図に現れる耐水壁（トイレ−洗面間等）ではこの加算が
        //   壁2枚分の二重計上になる。面の隣接情報が無く反対面の可視判定はできないため、
        //   開口分を鏡像からも控除して過大側を抑える（開口はUB側の面にも同様に無い想定）。
        if (code.mid === 2 || code.mid === 5) {
          majikiriDouble += Math.max(0, wPb * studH - openingAreaStud);
        }
      }
      // RC面木(D下地)の面積（D14=防露/EV面、D64=収納内コンパネ）。
      // ※ 木胴縁（一部界壁面）の換算には使わない: XLSでは収納内RC面(集計表r73)・EV面(r26)は
      //   木胴縁の行(r85)とは**別行**（別の発注行）に集計される。係数は3行とも0.0098で同じであり、
      //   分離の根拠は係数差ではなく集計先の違い（timberVolume.js / materialCalculator.js の注記参照）
      if (code.base === 'D') {
        t.rc_furring_sqm += netPb;
        if (code.mid === 6) {
          const rn = normalizeRoomName(room.name);
          d6ByElevRoom.set(rn, (d6ByElevRoom.get(rn) || 0) + wPb);
        }
      }
      // 界壁面（一部界壁）: 面に界壁の明示がある場合のみ、界壁高さ(既定2.45m)で拾う。
      // 面幅から界壁部分を推測はしない（KAIBE_FACE_HEIGHT_M 付近の注記＝過大計上の防止）
      const kaibeW = kaibeFaceWidthMm(face);
      if (kaibeW > 0) {
        t.kaibe_furring_sqm += (kaibeW / 1000) * kaibeHeightM;
        t.kaibe_furring_faces++;
      }

      // 物理制約: 面の記号が別府の戸境二重壁（遮/G枠）で、この部屋が戸境壁を持ち得ない
      // 部屋種別（バルコニー/倉庫/収納内部/水回り内部）の場合は誤読とみなして棄却する。
      // 別府の展開図はD面等に face.wall_code='遮' を持ち、非戸境部屋（洗面/WCL/トイレ等）にも
      // 系統的に付くため、soundSegments（plan_placements）だけでなくこの面記号経路にも同じ
      // 物理制約を効かせる（棄却しないと遮音壁PBが暴走する）。棄却面は遮音壁PB・GW・遮音シートも
      // 壁PBも積まず素通りさせる（＝soundSegmentsのcontinueと同じ「丸ごと落とす」過少側の扱い）。
      // ※ 判定は code.beppu マーカー付きの遮/G枠のみ（アルファのL/O/Wは beppu が無く非該当＝不変）。
      if (code.beppu && ['遮', 'G枠'].includes(code.beppu) && isNonPartyRoom) {
        t.beppu_sound_nonparty_dropped += 1;
        // 巾木・周長・開口・部屋統計は上で計上済み。仕上げ（クロス）だけは面の実仕上げとして拾う
        if (code.surf === 4 || code.surf === 5) t.cloth_sqm += net;
        continue;
      }
      // 下地
      if (['L', 'O', 'W'].includes(code.base)) {
        // 遮音壁はボードをスラブ下まで張る（図面注意書き「遮音壁はボードをスラブ下まで+GW24kg充填」・
        // XLS 'Ａタイプ'!E113等=下地高2.57）→ 面の仕上げ高（CH+40）ではなく下地高で拾う。
        // 開口控除も下地高キャップ側（openingAreaStud）を使う（総監査A-3の修正・2026-07-19）
        const netSlab = Math.max(0, w * studH - openingAreaStud);
        t.sound_wall_pb_sqm += netSlab;
        t.partition_face_length_m += w;
        if (code.base !== 'O') t.gw_sqm += netSlab;
        // 遮音シート: アルファの下地Ｏ（間仕切木+遮音シート・GWなし）に加え、
        // 別府の「遮」（胴縁+PB+GW24K+遮音シート+PB）も対象。別府の遮はGWと遮音シートが
        // **同居する**（アルファのL/O=排他とは構成が違う）ため、GW側のifとは独立に加算する。
        // sound_sheetフラグは parseBeppuWallCode が付与する（3桁コードには付かない＝アルファ不変）
        if (code.base === 'O' || code.sound_sheet === true) t.sound_sheet_sqm += netSlab;
      } else {
        if (code.base === 'G') t.partition_face_length_m += wPb;
        if (code.base === 'S') t.gw_sqm += netPb;
        // 中間材（遮音壁系はPB込みのためelse側のみ）
        switch (code.mid) {
          case 1: case 4:
            // D下地（RC面木=EV廻り・防露壁面。例 D14）のPBはXLSでは「EV廻り壁」の部位で別拾い
            // （プロは玄関のEV側D14面0.965mを壁(ボード)に入れない）。耐水(2/5)・コンパネ(6)は現状どおり
            // ※既知の近似（Gタイプでのみ検証済み 2026-07-16）: 「D下地×中間1/4は全てEV廻り行」は
            //   GのD14がEV側1面だけのため成立している。他タイプで窓廻り防露壁面や収納内のD14が
            //   ある場合もEV行に積まれてしまう（防露壁面/EV面の区別には部屋名や面の位置情報が必要）。
            //   他タイプの正解データで検証する際に部屋名/面情報での分岐を検討すること。
            if (code.base === 'D') t.ev_wall_pb_sqm += netPb;
            else t.wall_pb_sqm += netPb;
            break;
          case 2: case 5: t.waterproof_pb_sqm += netPb; break;
          case 3: t.rawan_veneer_sqm += netPb; break;
          case 6: t.konpane_sqm += netPb; break;
          default: break; // 0=ナシ（打放し等）
        }
      }

      // 表面
      if (code.surf === 4 || code.surf === 5) t.cloth_sqm += net;
      else if (code.surf === 6) {
        // キッチンパネル（表面6）は面全面ではなくカウンター上の帯のみ張る。
        // XLSの正解式（'Ａタイプ'!P310〜P313 = 3.925㎡/戸）:
        //   2.5×1.35 + 0.7×2.2 + 0.7×2.2 − 2.2×1.15
        //   = 正面幅×(CH−カウンター高0.85) + 側面袖壁2本×CH − 吊戸裏の控除
        // 図面から機械的に取れるのは「KP面の幅」と「CH」だけなので正面帯のみモデル化し、
        // 側面袖壁(+3.08)と吊戸控除(−2.53)は未モデル（ほぼ相殺する前提の近似）。
        // G実測: 2.575×(2.2−0.85)=3.476 vs XLS 3.925 = −11.4%（eval許容20%内）
        t.kitchen_panel_sqm += Math.max(0, w * Math.max(0, ch - KITCHEN_COUNTER_H_M) - openingArea);
      }
    }

    // 巾木（種別ごと・開口幅を控除）
    const skirtingLen = Math.max(0, perimeter - floorOpeningWidth);
    const sk = String(room.skirting || '');
    if (sk.includes('木製')) t.skirting_m.木製 += skirtingLen;
    else if (sk.includes('ソフト')) t.skirting_m.ソフト += skirtingLen;
    else if (sk.includes('樹脂')) t.skirting_m.樹脂 += skirtingLen;
    // skirting未記載（UB等）は計上しない

    t.rooms.push({
      name: room.name,
      perimeter_m: Math.round(perimeter * 100) / 100,
      wall_net_sqm: Math.round(roomWallNet * 100) / 100,
      ceiling_height_mm: room.ceiling_height_mm || 2400,
    });
  }

  // 遮音壁ルールの計上（DEFAULT_SOUND_WALL_PAIRS参照）:
  //   PBは両面（XLSは隣接する各室ブロックの面で両側を拾う: 12.9785㎡/戸）= 2×幅×2.57
  //   GWは壁1枚1回（玄関ブロックP81/P82: 6.425㎡/戸）= 幅×2.57
  // 高さは下地高（遮音壁はLDK↔居室間=標準スラブ部＝一般部の下地高。開口は無い壁のため控除なし）。
  // 物件別入力があればそれを使い、無ければアルファ実績値2.57（resolveStudHeightM参照）。
  // 対応する面が展開図で特定できた場合は上のsoundConsumedで面側の計上を止めており、
  // 特定できない場合（面が大きな面に合算されている読取等）もルール値だけが立つ
  // ※ フォールバック観測はペアが実在する場合のみ記録する（遮音壁が無い物件で
  //   使いもしない高さのwarningを出さないため、stateはsoundPairs>0のときだけ渡す）
  const soundStudH = resolveGeneralStudHeightM(opts, soundPairs.length > 0 ? studHeightState : null);
  for (const p of soundPairs) {
    const w = p.width_mm / 1000;
    t.sound_wall_pb_sqm += 2 * w * soundStudH;
    t.gw_sqm += w * soundStudH;
  }
  t.sound_rule_pairs = soundPairs.length; // 観測点（テスト・デバッグ用）

  // 収納（WIC/CL等）の内側は展開図に現れないが間仕切下地は必要。
  // 優先順位: ①実寸（opts.closetInteriors。見積明細 家具工事シートの固定棚実寸から
  //   「棚に沿う内側3辺」= コ型W(w1+w2+w3)なら w1+w2+w3 / 単棚W×Dなら W+D×2 に換算した幅mmを入力で受ける）
  //   > ②3×√面積の推定（正方形近似のフォールバック）
  // 部屋側の面は上のループで拾い済み（÷2対象）なので、収納側の面も両面計上の山に足してから÷2する。
  // RC面（D6*で実測済み・胴縁の部位）の幅控除は②推定分のみに適用する。
  // 根拠（拾い出しXLS Ａタイプ(=Gデータ)シート精査 2026-07-16）: 間仕切下地の正解84.082 =
  //   洋室(1)9.7341+洋室(2)17.8474+洋室(3)7.6896+食事室・台所12.1005+便所15.789+洗面20.9214 の
  //   6室ブロック合計と完全一致（玄関・物入(1)〜(3)ブロックの間仕切下地行は空欄）で、
  //   収納内RC面を控除する行は存在しない → 実寸には控除を掛けない
  //   （②推定は面積由来でRC面と重複しうるため控除を維持する）
  const CLOSET_NAME_RE = /クローゼット|クロゼット|WIC|CL|収納|物入|押入/;
  const elevRoomNames = new Set(rooms.map((r) => normalizeRoomName(r.name)).filter(Boolean));
  const interiorByRoom = new Map(); // 正規化部屋名 → 収納内側の下地幅mm（実寸）
  for (const ci of opts.closetInteriors || []) {
    const key = normalizeRoomName(ci?.room);
    if (key && Number.isFinite(ci?.inner_width_mm) && ci.inner_width_mm > 0) {
      interiorByRoom.set(key, ci.inner_width_mm);
    }
  }
  let closetActualWidth = 0; // ①実寸の合計（m）
  let closetEstWidth = 0;    // ②3×√面積推定の合計（m）
  for (const pr of opts.planRooms || []) {
    if (!pr?.name || !CLOSET_NAME_RE.test(pr.name)) continue;
    // 展開図に実測がある収納は二重計上しない（表記ゆれを正規化して比較）
    if (elevRoomNames.has(normalizeRoomName(pr.name))) continue;
    const actualMm = interiorByRoom.get(normalizeRoomName(pr.name));
    if (actualMm) { closetActualWidth += actualMm / 1000; continue; }
    const a = pr.area_sqm || 0;
    if (a > 0) closetEstWidth += 3 * Math.sqrt(a);
  }
  // D6*実測の控除プール: 「平面図の部屋一覧に対応が無い展開図の部屋」（例: クロゼット内RC面 =
  // 複数収納の内側をまとめた立面）のD6*面幅のみ。これらのRC面は②推定を通った収納の一部と
  // みなせるため推定から差し引く（元来の重複控除の意図）。一方、平面図の部屋名と一致する
  // 展開図の収納はelevRoomNamesのskipで既に推定対象外＝そのD6*実測は推定に混ざっておらず、
  // 控除すると展開図に無い収納（物入等）の推定が丸ごと消える（再現: 物入4.16m分の計上漏れ）
  const planRoomNames = new Set(
    (opts.planRooms || []).map((pr) => normalizeRoomName(pr?.name)).filter(Boolean));
  let d6DeductWidth = 0;
  for (const [rn, wsum] of d6ByElevRoom) {
    if (!planRoomNames.has(rn)) d6DeductWidth += wsum;
  }
  closetEstWidth = Math.max(0, closetEstWidth - d6DeductWidth);
  // 収納内側の下地高は一般部と同じ（収納は標準スラブ上=居室と同じ。XLSに収納別の下地高行は無い）。
  // 物件別入力があればそれを使い、無ければアルファ実績値2.57（resolveStudHeightM参照）
  const closetWidthTotal = closetActualWidth + closetEstWidth;
  const closetStudH = resolveGeneralStudHeightM(opts, closetWidthTotal > 0 ? studHeightState : null);
  majikiriDouble += closetWidthTotal * closetStudH;

  // 両面計上 → 壁1枚換算（XLSの拾い方に一致。検証: Gタイプ 77.6 vs XLS正解84.082 = −7.7%）
  t.majikiri_shitaji_m = majikiriDouble / 2;

  // 下地高フォールバックの要確認warning（物件汎用化・2026-07-24）。
  // 下地高は物件ごとに違う（アルファ2.57/2.77 ↔ 別府2.72/2.82/2.86）ため、図面・入力から
  // 実値が取れず既定値を使った場合は「別物件なら数%ずれる」ことをユーザーに明示する。
  t.stud_height_fallback = studHeightState.usedFallback; // 観測点（テスト・デバッグ用）
  t.stud_height_wet_from_default = studHeightState.wetFromDefault; // 同上（水回り未指定の観測点）
  if (studHeightState.usedFallback) {
    t._warnings.push({
      field: 'stud_height',
      message: `下地高が図面から読めなかったため既定値${STUD_HEIGHT_M}m（水回り${STUD_HEIGHT_WET_M}m）を使用しました。`
        + 'この値はアルファステイツ新宮町の実績値です（下地高＝床〜上階スラブ下端はスラブ間の寸法で'
        + '物件ごとに異なり、例: 別府4丁目は2.72/2.82/2.86m）。'
        + '別物件では間仕切下地・遮音壁の数量が数%ずれる可能性があります（要確認）',
      before: null, after: null,
    });
  }
  // 水回りの下地高が未指定のまま一般部と同値で計算した場合の明示（must-fix・2026-07-24）。
  // 水回りのスラブ下がり量は物件依存（アルファ+200 / 別府Ａ〜Ｇ+100 / 別府Ｈ・Ｉ 0）のため
  // 一般部からの外挿はせず、控えめ側（同値）で計算していることを伝える
  if (studHeightState.wetFromDefault) {
    t._warnings.push({
      field: 'stud_height_wet',
      message: '水回りの下地高が指定されていないため、一般部と同じ下地高で計算しました。'
        + '水回りは配管のスラブ下がり分だけ下地高が高い物件があり（実測: アルファ+200mm・'
        + '別府Ａ〜Ｇ+100mm・別府Ｈ/Ｉ 0mm＝物件ごとに異なる）、その場合は水回りの'
        + '間仕切下地・遮音壁が少なめに出ます。XLS等で確定値が分かる場合は指定してください（要確認）',
      before: null, after: null,
    });
  }

  // 別府方式Ｇの囲み形状が判別できなかった場合の明示（should-fix④・2026-07-24）。
  // 既定は「丸囲み＝打放し（PBなし）」＝過少側だが、図面実測ではＧは四角囲み（丸囲みは遮のみ）
  // だったため、既定が外れて戸境二重壁のPB・GWが丸ごと落ちる公算がある。
  // サニティは壁PBの**上限**しか見ないため、この過少は静かに通ってしまう → 明示的に警告する。
  // アルファは記号が3桁（G14等）でここに掛からない＝通常運用では出ない
  if (t.beppu_g_shape_unknown > 0) {
    t._warnings.push({
      field: 'wall_code_g_shape',
      message: `Ｇ記号${t.beppu_g_shape_unknown}件の囲み形状（丸/四角）が判別できませんでした。`
        + '打放し（ボードなし）として扱っています。'
        + '四角囲みのＧ＝戸境二重壁（胴縁＋PBt9.5＋グラスウール24K）の場合、'
        + 'その壁の壁PB・グラスウールが計上されず数量が過少になります（要確認）',
      before: null, after: null,
    });
  }

  // 戸境二重壁（遮/G枠）を物理的に持ち得ない部屋での棄却の明示（2026-07-25）。
  // 別府でGeminiがバルコニー・各種倉庫（住戸外）・収納内部・水回り内部へ遮/G枠を系統的に
  // 誤付与し（3回読み多数決でも消えない同一誤読）、遮音壁PBが最大+338%に暴走していた。
  // 戸境壁＝隣接住戸との境界の二重壁のため、上記の部屋種別には物理的に接し得ない
  // （NON_PARTY_WALL_ROOM_RE参照）→ 誤検出として棄却した。黙って消さず件数を可視化する。
  // アルファは記号が3桁でここに掛からない（遮/G枠が無い）＝通常運用では出ない。
  if (t.beppu_sound_nonparty_dropped > 0) {
    t._warnings.push({
      field: 'sound_wall_nonparty_room',
      message: `戸境二重壁（遮 / G枠）の読み取り${t.beppu_sound_nonparty_dropped}件を、`
        + '戸境壁を物理的に持ち得ない部屋（バルコニー・倉庫・収納内部・水回り内部）で'
        + '検出したため誤読とみなして棄却しました。'
        + '戸境壁は隣接する別住戸との境界にのみ存在します。'
        + '該当部屋に本当に戸境壁がある場合は手動で追加してください（要確認）',
      before: null, after: null,
    });
  }

  // デフォルト遮音壁ルールの発火の明示（should-fix⑤・2026-07-24）。
  // DEFAULT_SOUND_WALL_PAIRSはアルファステイツ新宮町Gタイプ専用の実測定数（LDK↔洋室(1)1450 /
  // LDK↔洋室(3)1050）。部屋名と幅帯さえ合えば他物件でも発火するため（別府にもLDK・洋室1・洋室3が
  // 実在する）、既定ルールを使って計上したことをユーザーに見せる。
  // opts.soundWallRuleで明示的に指定された場合（別物件のルール・pairs:[]での無効化）は出さない
  if (!Array.isArray(opts.soundWallRule?.pairs) && soundPairs.length > 0) {
    t._warnings.push({
      field: 'sound_wall_rule_default',
      message: `住戸内遮音壁を既定ルール（アルファステイツ新宮町Gタイプ実測: `
        + soundPairs.map((p) => `${p.roomA}↔${p.roomB} ${p.width_mm}mm`).join(' / ')
        + `）で${soundPairs.length}枚計上しました。`
        + '部屋名と壁幅が一致すれば別物件でも適用されるため、'
        + '別物件の場合は遮音壁PB・グラスウールが実際と異なる可能性があります（要確認）',
      before: null, after: null,
    });
  }

  // 遮音シートが出力の資材行に存在しないことの明示（must-fix①・2026-07-24）。
  // 別府の凡例では 遮＝「胴縁+PBt9.5(GW24K)+**遮音シート**+PBt9.5」で遮音シートは実在の部材だが、
  // 発注用の独立行がXLSに無い（実測: 別府 集計表 54行「遮音壁ＰＢ張り」の規格は "t9.5+GW" で
  // シートを含まず、シートは30行「EV面遮音壁（界壁）PBt9.5+9.5GW+ｼｰﾄ+木胴縁」・34行の
  // **複合行の規格文字列の中にしか出てこない**＝単独の数量・単価を持たない。
  // アルファの見積明細（名称/摘要の正）にも遮音シート行は存在しない）。
  // 名称・摘要・単価の正が無い行を勝手に作らない方針のため資材行は新設せず、
  // 「拾えているが出力に出ない」ことを警告で可視化する（黙って落とさない）
  if (t.sound_sheet_sqm > 0) {
    t._warnings.push({
      field: 'sound_sheet',
      message: `遮音シート${Math.round(t.sound_sheet_sqm * 10) / 10}㎡を拾いましたが、`
        + '資材リストには遮音シートの行がありません（発注用の独立行が拾い出しXLS・見積明細の'
        + 'どちらにも無く、遮音壁の複合仕様の一部として扱われているため）。'
        + '遮音シートを別途手配する運用の場合は、この面積を手動で追加してください（未実装項目）',
      before: null, after: null,
    });
  }

  // 丸め
  // ※ kaibe_estimate_sqm は「拾い値」ではなく**入力された定数のまま運ぶ欄**なので丸めない
  //   （既定5.047が5.05になると材積が+0.06%ずれ、推定パスとの後方互換が崩れる）
  const NO_ROUND_KEYS = new Set(['kaibe_estimate_sqm']);
  for (const k of Object.keys(t)) {
    if (typeof t[k] === 'number' && !NO_ROUND_KEYS.has(k)) t[k] = Math.round(t[k] * 100) / 100;
  }
  for (const k of Object.keys(t.skirting_m)) {
    t.skirting_m[k] = Math.round(t.skirting_m[k] * 10) / 10;
  }
  return t;
}

/**
 * 【一旦の表示スコープ】建材リストのみ表示する
 * ユーザー指定（2026-07-10）: 見積明細の「建材」ブロックの項目以外は当面非表示。
 * 精度検証の焦点を建材（PB・パネル・GW・下地合板）に絞るため。
 * このフィルタを外せば全項目（約130）の表示に戻る。
 */
const KENZAI_SCOPE_PATTERNS = [
  '石膏ボード',            // 壁・耐水・天井・下り天井・一部界壁・EV廻り・収納面すべて
  '遮音壁PB',              // 遮音壁PB張り（t9.5+GW）— PB系なので建材スコープに含める
  'キッチンパネル',        // 本体+見切り
  'グラスウール充填',      // 間仕切+EV廻り
  '下地補強合板',
  'エアコン下地補強合板',
];

export function filterKenzaiScope(materials) {
  return materials.filter((m) =>
    // 【物件固有の追加部位（2026-07-25）】ユーザーが Override で明示的に指定した行は
    //   建材14項目のパターンに一致しなくても落とさない。理由:
    //   ①この行はエンジンの推定ではなく**利用者が自分で入力した数量**であり、
    //     表示から消すと入力しても画面に出ない＝override機能そのものが成立しない
    //   ②パターン（名称の部分一致）を広げるのではなく行に付いた明示フラグで通すので、
    //     既定の14項目スコープ（ユーザー指定の表示範囲）は一切変わらない
    //     ＝追加部位を指定しない限り出力は従来と完全に同一
    m.extra_part === true
    || (m.category === '下地材' && KENZAI_SCOPE_PATTERNS.some((p) => String(m.name).includes(p)))
  );
}

/**
 * 計算結果（materialCalculatorの出力）に展開図実測値を反映する
 * 該当する資材行の数量を実測ベースで置き換え、計算根拠に「展開図実測」を記す
 */
export function applyElevationTakeoff(result, takeoff, opts = {}) {
  if (!result?.materials || !takeoff) return result;

  const set = (match, quantity, basis) => {
    for (const m of result.materials) {
      if (match(m) && quantity > 0) {
        m.quantity = quantity;
        m.calculation = `展開図実測: ${basis}`;
        m.takeoff = true;
      }
    }
  };

  const wallPbSheets = Math.ceil(takeoff.wall_pb_sqm / PB_SQM_PER_SHEET);
  const waterPbSheets = Math.ceil(takeoff.waterproof_pb_sqm / PB_SQM_PER_SHEET);

  set((m) => m.name === '壁 石膏ボード',
    wallPbSheets, `壁PB ${takeoff.wall_pb_sqm}㎡ ÷ ${PB_SQM_PER_SHEET}㎡/枚`);
  set((m) => m.name === '壁 耐水石膏ボード',
    waterPbSheets, `耐水PB ${takeoff.waterproof_pb_sqm}㎡ ÷ ${PB_SQM_PER_SHEET}㎡/枚`);
  // EV廻り・防露壁面（D下地×中間1/4）。実測0（EV面が展開図に写らないタイプ）は
  // set()のquantity>0ガードにより既存の実績推定（標準3枚）を維持する
  const evPbSqm = takeoff.ev_wall_pb_sqm || 0;
  // EV廻り・防露壁PBはXLS X62=1.5で換算（壁PBの1.4ではない。A-4是正）
  //
  // 【丸め方式は2通り（戸数の有無で切り替え・opt-in）】
  //   ● 戸数未指定（既定・後方互換）: per-戸 round（1戸単位見積が根幹）。
  //     EV廻り壁PBは 1.44枚/戸の小数量部位で、per-戸 ceil(1.44)=2 が総量方式（9戸合算→÷1.5）から
  //     +38%乖離する（収納面PBと同型）。round(1.44)=1 の方が近い。実測0は下の quantity>0 ガードで既存推定を維持。
  //     ※ evPbSqm>0 のときは Math.max(1,...) で最低1枚を保証する。round だけだと 0<ev<0.75㎡ で
  //       round=0 になり「実測が0枚→quantity>0ガードで固定推定3枚に化ける退行」+行/summary不整合が
  //       起きるため（既知の正解値は全て0.75㎡超で現データ非発火だが、round化が持ち込む潜在穴を塞ぐ）。
  //   ● 戸数指定あり（opts.households）: XLS総量方式そのもの ceil(㎡×戸数÷1.5)。
  //     XLS AB列（W/X→ceil。W=拾い面積×戸数）と厳密一致する。G実測2.16㎡×9戸÷1.5=12.96→ceil=13枚。
  //     ※これは opt-in。戸数を「外から」受け取ったときだけ発火し、per-戸roundの1戸見積を壊さない。
  //       戸数0/負/非数は resolveHouseholds が null を返し per-戸round にフォールバックする。
  //   最低1枚保証は総量方式でも同じ趣旨で適用（evPbSqm>0 かつ ceil>=1 なので実質常に満たすが揃える）。
  const households = resolveHouseholds(opts.households);
  let evWallSheets;
  if (households && evPbSqm > 0) {
    evWallSheets = Math.max(1, Math.ceil(evPbSqm * households.value / EV_WALL_PB_SQM_PER_SHEET));
  } else {
    evWallSheets = evPbSqm > 0 ? Math.max(1, Math.round(evPbSqm / EV_WALL_PB_SQM_PER_SHEET)) : 0;
  }
  const evBasis = households && evPbSqm > 0
    ? `EV面実測 ${evPbSqm}㎡ ×${households.value}戸 ÷ ${EV_WALL_PB_SQM_PER_SHEET}㎡/枚（総量方式）`
    : `EV面実測 ${evPbSqm}㎡ ÷ ${EV_WALL_PB_SQM_PER_SHEET}㎡/枚`;
  set((m) => m.name === 'EV廻り壁 石膏ボード', evWallSheets, evBasis);
  // 実測が実績スケールを大きく超えた場合の警告（should-fix③・2026-07-24）。
  // この部位（防露ふかし壁/EV廻り壁）はXLS実測で**1戸あたり1〜2㎡台**の小さな行:
  //   別府 集計表62行「防露ふかし壁（ＰＢ）」戸当 = A 1.36 / B 1.904 / C 0.816 / D 1.904 / G 2.176㎡
  //   アルファ（同62行）も見積明細67戸平均 2.2枚/戸 相当
  // 一方エンジンは「D下地×中間1/4の面」をこの部位に丸ごと入れるため、別府方式Ｂ（GL工法）が
  // 面単位で数面読まれると壁PBから抜けた面積がそのままここへ積み上がり、実体1.36㎡の行が
  // 10㎡超（=7〜12倍）に膨らみうる（レビュー実測: Ｂ1面で10.03㎡・2面で16.38㎡）。
  // 記号→部位の振り分け方向は正しい（XLSも防露壁を壁PBと別行で拾う）が、
  // 「Ｂが指すのはRC面の一部だけで壁1面全部ではない」という粒度差が未解決のため、
  // 桁が合わない事実を隠さず出す。閾値は実績上限2.2㎡の約2倍=5㎡（1面ぶん未満で発火しない値）
  const EV_WALL_PB_PLAUSIBLE_MAX_SQM = 5;
  if (evPbSqm > EV_WALL_PB_PLAUSIBLE_MAX_SQM) {
    result._warnings = result._warnings || [];
    result._warnings.push({
      field: 'ev_wall_pb',
      message: `EV廻り・防露ふかし壁の実測が${evPbSqm}㎡と大きすぎます`
        + `（拾い出しXLSの実績は1戸あたり0.8〜2.2㎡）。`
        + 'GL工法・防露壁の記号（別府方式Ｂ / アルファD14）が付いた壁を1面まるごと'
        + 'この部位として拾っているためで、実際にはその壁の一部だけがふかし壁の可能性があります。'
        + 'この面積は壁 石膏ボードから抜けているため、両方の数量を確認してください（要確認）',
      before: null, after: evPbSqm,
    });
  }
  set((m) => m.name.includes('遮音壁PB'),
    takeoff.sound_wall_pb_sqm, `遮音壁面 Σ幅×高さ−開口`);
  // キッチンパネル: カウンター上帯の実測㎡（表面6）→ 3'×8'板（2.2022㎡/枚）で枚数化
  // ※ 完全一致（'壁 キッチンパネル見切り' への誤マッチ防止）。実測0はset()のガードで既存推定を維持
  const kpSqm = takeoff.kitchen_panel_sqm || 0;
  const kpSheets = Math.ceil(kpSqm / KP_SHEET_SQM);
  set((m) => m.name === '壁 キッチンパネル',
    kpSheets, `キッチンパネル面 ${kpSqm}㎡ ÷ ${KP_SHEET_SQM}㎡/枚（3'×8' 910×2420mm）`);

  // 収納面PB（マルチクロゼット・WIC・CLRC面）: 収納内RC面（D64＝中間6コンパネ→PB VE変更）の
  // 実測面積 ÷ 1.45（XLS集計表X73）で枚数化する。
  // 実測0（収納面PBの記号が展開図に無い＝別府のようにRC面PBを使わない物件）は set() の
  // quantity>0 ガードにより materialCalculator の推定行（面積換算 or override）を維持する
  // ＝別府では konpane_sqm=0 で実測置換が発火せず、overrides.closet_rc_sqm='0' 指定の0枚が残る。
  // 丸めは round（推定パス materialCalculator.js と統一）。小数量部位（5枚台）は per-戸 ceil だと
  // 端数0.18が+15.8%に効くため。XLS発注実態(AB73=5.18)は総量方式で per-戸 ceil ではない。詳細は
  // materialCalculator の同名ブロック（収納面PB）参照。
  const closetRcSqm = takeoff.konpane_sqm || 0;
  const closetPbSheets = Math.round(closetRcSqm / CLOSET_PB_SQM_PER_SHEET);
  set((m) => m.name === 'マルチクロゼット・WIC・CLRC面 石膏ボード',
    closetPbSheets, `収納面RC ${Math.round(closetRcSqm * 100) / 100}㎡ ÷ ${CLOSET_PB_SQM_PER_SHEET}㎡/枚（XLS集計表X73）`);

  if (result.summary) {
    result.summary.wall_pb_sqm = takeoff.wall_pb_sqm;
    result.summary.wall_pb_sheets = wallPbSheets;
    result.summary.waterproof_pb_sqm = takeoff.waterproof_pb_sqm;
    result.summary.waterproof_pb_sheets = waterPbSheets;
    result.summary.ev_wall_pb_sqm = evPbSqm;
    // 資材行と同じ evWallSheets を使う（行=round+max(1)・summary=無条件round だと
    //   0<ev<0.75㎡ で 行3枚/summary0枚 の不整合が出るため一致させる）。
    result.summary.ev_wall_pb_sheets = evWallSheets;
    result.summary.sound_wall_pb_sqm = takeoff.sound_wall_pb_sqm;
    result.summary.kitchen_panel_sqm = kpSqm;
    result.summary.kp_sheets = kpSheets;
  }
  // ※ 'EV廻り壁 グラスウール充填' への誤マッチを防ぐため完全一致
  set((m) => m.name === '間仕切 グラスウール充填',
    Math.round(takeoff.gw_sqm), `GW充填面 Σ幅×高さ−開口`);
  set((m) => m.name.includes('壁クロス'),
    Math.ceil(takeoff.cloth_sqm), `クロス面 Σ幅×高さ−開口`);
  // ※ '木製巾木出隅役物'（単位:ヶ所）への誤マッチ防止のため完全一致（部分一致だと箇所数がm数で上書きされる）
  set((m) => m.name === '木製巾木',
    Math.round(takeoff.skirting_m.木製), `Σ周長−開口幅（木製巾木の部屋）`);
  set((m) => m.name.includes('樹脂巾木'),
    Math.round(takeoff.skirting_m.樹脂 * 10) / 10, `Σ周長−開口幅（樹脂巾木の部屋）`);

  // 間仕切下地(木): XLSの拾い量（壁1枚あたり片面の下地面積。"m"表記はXLS慣行）を実測で上書き
  // 根拠文言は実際に使った下地高の出所を反映する（既定値フォールバック時のみ数値を明記。
  // 物件別入力・図面実値を使った場合は部屋ごとに高さが異なりうるため数値を書かない）
  set((m) => m.name === '間仕切下地(木)',
    Math.round(takeoff.majikiri_shitaji_m * 10) / 10,
    takeoff.stud_height_fallback === false
      ? `間仕切面 Σ幅×下地高(図面・物件別入力)−開口 の壁1枚換算`
      : `間仕切面 Σ幅×下地高(既定値${STUD_HEIGHT_M}m/水回り${STUD_HEIGHT_WET_M}m)−開口 の壁1枚換算`);
  // 間仕切木軸の材積: XLS集計表 Y52{=W52*X52}＝拾い面積 × 材積係数0.0116m³/㎡ で直接算出（2026-07-25・案B）。
  //   材長（両面縦横@450）は発注実態の表示として残すが、材積は材長経由しない（materialCalculatorと同一方式）。
  const majikiriLen = majikiriTimberLengthM(takeoff.majikiri_shitaji_m);
  set((m) => m.name === '間仕切木軸',
    majikiriVolumeM3(takeoff.majikiri_shitaji_m),
    `間仕切下地 ${Math.round(takeoff.majikiri_shitaji_m * 10) / 10}㎡ × ${MAJIKIRI_M3_PER_SQM}m³/㎡（XLS集計表X52・両面縦横@450 ≒${Math.round(majikiriLen)}m）`);
  // 木胴縁（一部界壁面）: 界壁面の実測面積 × XLS材積係数（timberVolume.js の DOBUCHI_M3_PER_SQM）。
  // 【拾い対象は界壁面のみ】旧実装は rc_furring_sqm（D下地=EV面+収納内RC面）を投入していたが、
  //   XLSではそれらは木胴縁とは別行（集計表r73/r26）に集計される別部位で、対象が誤っていた。
  //   さらに旧係数(1/0.455×断面=0.00297)がXLS実測0.0098の1/3.3だったため、
  //   「対象が過大 × 係数が過少」の相殺で-46%に見えていた（2026-07-24に両方セットで是正）。
  // 【実測が無い場合は推定を維持】界壁の区間幅は展開図の面幅から切り出せない（kaibeFaceWidthMm の注記）。
  //   面に界壁の明示が無い＝実測ゼロのときは上書きせず、materialCalculatorの実績推定を残す
  //   （面幅を界壁とみなすと数倍の過大になるため、"読めなかった"を"ゼロ"にしない）
  const dobuchiRow = result.materials.find((m) => m.name === '木胴縁（界壁面）');
  if (takeoff.kaibe_furring_faces > 0) {
    const dobuchiVol = dobuchiVolumeM3(takeoff.kaibe_furring_sqm);
    const kaibeSqm = Math.round(takeoff.kaibe_furring_sqm * 100) / 100;
    if (dobuchiRow && dobuchiVol > 0 && dobuchiRow.quantity > 0 && dobuchiVol < dobuchiRow.quantity * 0.5) {
      result._warnings = result._warnings || [];
      result._warnings.push({
        field: '木胴縁（界壁面）',
        message: `展開図実測の木胴縁材積(${dobuchiVol}m³)が実績ベース推定(${dobuchiRow.quantity}m³)の50%未満です。`
          + '界壁面の一部が展開図に写っていない可能性があります（実測値を採用済み・要確認）',
        before: dobuchiRow.quantity,
        after: dobuchiVol,
      });
    }
    set((m) => m.name === '木胴縁（界壁面）', dobuchiVol,
      `界壁面 ${kaibeSqm}㎡（実測${takeoff.kaibe_furring_faces}面）× ${DOBUCHI_M3_PER_SQM}m³/㎡`);
  } else if (dobuchiRow) {
    // 実測なし。物件別の拾い面積指定（opts.kaibeWall.area_sqm）があればそれで推定を差し替える。
    // 【0の指定も採用する】別府Ｂ/Ｊのように界壁が存在しないタイプでは 0 が正解であり、
    //   「未設定」と区別して 0m³ まで落とせないと実在しない材を計上し続ける（S-2）。
    //   materialCalculator 側は overrides.kaibe_wall_sqm で同じ差し替えができるので、
    //   通常は同値になる（ここは buildup経由 opts の指定が効くことを保証する二重の入口）。
    if (takeoff.kaibe_estimate_source === 'override') {
      const estSqm = takeoff.kaibe_estimate_sqm;
      // set() は quantity>0 を条件にする（実測0＝「読めなかった」で潰さないための共通ガード）が、
      // ここは実測ではなく**人が宣言した値**なので 0 もそのまま採用する必要がある（別府Ｂ/Ｊ）。
      // 共通ガードを緩めると他部位の「読めなかった→0」が通ってしまうため、この行だけ直接書く
      // takeoff:true は付けない（実測ではなく人の指定値。実測フラグを立てると
      // 「展開図から読めた」と誤って読まれる）
      dobuchiRow.quantity = dobuchiVolumeM3(estSqm);
      dobuchiRow.calculation = `界壁面 ${estSqm}㎡（物件別指定・実測なし）× ${DOBUCHI_M3_PER_SQM}m³/㎡`;
    }
    // 読者が「実測されている」と誤解しないよう根拠に明示する（指定の有無にかかわらず出す）
    const kept = result.materials.find((m) => m.name === '木胴縁（界壁面）');
    result._warnings = result._warnings || [];
    result._warnings.push({
      field: '木胴縁（界壁面）',
      message: '展開図に界壁面の明示が無いため、木胴縁は'
        + (takeoff.kaibe_estimate_source === 'override'
          ? `物件別に指定された界壁面積${takeoff.kaibe_estimate_sqm}㎡からの計算値です`
          : '実績ベースの推定値のままです')
        + '（界壁の区間幅は面幅から特定できません。実測したい場合は界壁部分の幅を指定してください）',
      before: dobuchiRow.quantity,
      after: kept ? kept.quantity : dobuchiRow.quantity,
    });
  }

  // 開口ガード等、takeoff側で検出した要確認事項を結果の警告へ載せ替える
  // （/calculateの警告マージ経路（サイクルC）に乗り、結果画面の警告パネルに表示される）
  if (Array.isArray(takeoff._warnings) && takeoff._warnings.length > 0) {
    result._warnings = [...(result._warnings || []), ...takeoff._warnings];
  }

  // サマリーにも反映
  if (result.summary) {
    result.summary.wall_cloth_area = takeoff.cloth_sqm;
    result.summary.takeoff_applied = true;
  }
  return result;
}

// ============================================================
// 展開図実測モードのサニティチェック層（2026-07-24）
//
// 背景: 展開図の読み取りが破綻していても実測モードが無条件に採用され、
//   異常値がそのまま見積に出ていた（本番ログ実例: アルファAタイプ 専有71.9㎡で
//   wall_pb_sqm=226.48㎡=162枚。積算正解118㎡=85枚に対し+92%）。
//   その読み取りは「洋室(1)(2)(3)が全て同一寸法(A=2875,B=4840,C=2875,D=4840)」
//   「wall_codeが全部null・記号ゼロ」というAIの幻覚読みだった。
//
// 方針: 実測値そのものの正しさは判定できない（正解が無いから実測している）ため、
//   「物理的・実績的にありえない出力」と「読み取り破綻の痕跡」だけを検出して
//   実測モードの不採用（=従来の推定値にフォールバック）へ落とす安全弁とする。
//   誤検知（正常読みを弾く）は精度を落とすので、閾値は実績より十分広く取る。
// ============================================================

// 壁PB面積 ÷ 専有面積 の実績比率。**上限のみ**で判定する（下限は設けない）。
//   アルファGタイプ実績: 122.06㎡ ÷ 67.3㎡ = 1.81
//   アルファAタイプ正解: 118㎡ ÷ 71.9㎡ = 1.64
//   本エンジンの正常出力（Gタイプ3記録replay）: 127.5〜128.2㎡ ÷ 67.3 = 1.90
//     （エンジンは実績比 +5〜6%側に出る = 既知の壁PB+7%系の残差）
//   上限2.4: 正常上限1.90に対して+26%の余裕。異常実例3.15はこれを大きく超える。
//
// 下限を設けない理由（2026-07-24・別府4丁目の実正解データ scripts/beppu-9types-ground-truth.json で検算）:
//   壁PBの分類構造は物件ごとに違う。別府は住戸間の戸境が全て「遮音壁PB」行へ分かれており、
//   一般壁PB行が構造的に小さい（遮音壁PB÷壁PB比: アルファG=0.11 に対し別府=0.49〜1.52）。
//   その結果、別府A〜Iの壁PB÷専有面積は **0.68〜1.18**（専有面積は天井PB÷0.878で逆算）。
//     A 75.50/76.0=0.99 / B 33.09/48.8=0.68 / C 74.37/63.0=1.18 / D 47.13/62.6=0.75 /
//     E 52.61/61.0=0.86 / F 58.29/66.9=0.87 / G 73.47/82.2=0.89 / H 117.95/107.9=1.09 / I 137.79/117.1=1.18
//   逆算に依存しない生比（壁PB÷天井PB）でも別府0.77〜1.34 vs アルファG 2.07 と桁違いで、
//   これは逆算誤差ではなく物件間の分類構造差。下限1.2では別府9タイプ全部が誤検知で弾かれ、
//   「正しい実測が捨てられ推定値へフォールバック＋誤警告」という実害の大きい回帰になる。
//   また今回の事故モードは「+92%の過大」であり、過少側は見積が小さく出るだけで危険度が違う。
//   よって上限のみを残す。
const WALL_PB_RATIO_MAX = 2.4;

// 同一の面幅構成（幅の多重集合）を持つ部屋がこの数以上あれば幻覚読みを疑う。
//   正常な読み取りでは部屋ごとに寸法が異なる（Gタイプ3記録の実測: 同一構成の部屋は最大1室）。
//   一方、破綻例では洋室(1)(2)(3)が完全同一の4面寸法で並んだ。
//   2室までは実在しうる（同型の洋室が2つ並ぶ間取りは普通にある）ため3室以上を異常とする。
//   ※ 1部屋の中でA面=C面のように対面が同寸なのは矩形室として正常 → 部屋間の比較のみ行う。
const DUP_ROOM_SHAPE_MIN = 3;

// 1部屋の周長の物理上限（専有面積に対する比率）。
//   住戸全体の外周ですら概ね 4×√専有面積 × 1.3 程度に収まる（矩形からの逸脱を見込んだ係数）。
//   1部屋がそれを超えるのは面幅の桁誤読・重複転記の疑い。
//   Gタイプ実測の最大室（LDK 20.4m / 専有67.3㎡ → 4×√67.3=32.8m の 0.62倍）に対し十分広い。
const ROOM_PERIMETER_MAX_RATIO = 1.3;

// シグネチャ比較の対象にする最小の有効面数。
//   面が1〜2しか読めていない部屋は「幅900の物入が3室」「2面だけのUB」のように
//   同じ構成が偶然そろうことが実際にありうる（実記録 gtype-gemini-read-gemini-2.5-flash.json の
//   UBは2面のみ）。一方、検知したい破綻例は「洋室(1)(2)(3)が4面すべて一致」だったので、
//   3面以上に限っても検知力は落ちない。
const DUP_SHAPE_MIN_FACES = 3;

/**
 * 面幅構成のシグネチャ。[4840,1385,4840,965] -> '1385|4840|4840|965' を昇順で
 * （面の並び順・A〜Dのラベル差を無視して「同じ形の部屋か」を比較するため）
 * 有効面が DUP_SHAPE_MIN_FACES 未満の部屋は null（＝比較対象外）。
 */
function roomShapeSignature(room) {
  const widths = (Array.isArray(room?.faces) ? room.faces : [])
    .map((f) => f?.width_mm)
    .filter((w) => Number.isFinite(w) && w > 0)
    .sort((a, b) => a - b);
  return widths.length >= DUP_SHAPE_MIN_FACES ? widths.join('|') : null;
}

/**
 * 展開図実測（takeoff）の妥当性チェック。純関数。
 *
 * @param {object} takeoff computeElevationTakeoffの戻り値
 * @param {object} context
 *   - totalFloorAreaSqm: 専有面積（ユーザー入力 or validator確定値）。無ければ比率チェックはスキップ
 *   - elevations: 展開図の読み取りデータ（品質判定に使う。{rooms:[...]}）
 * @returns {{ok: boolean, reasons: Array<{code, message, detail}>}}
 *   ok=false のとき呼び出し側は実測モードを採用せず推定値にフォールバックする。
 */
export function validateTakeoffSanity(takeoff, context = {}) {
  const reasons = [];
  if (!takeoff) {
    return { ok: false, reasons: [{ code: 'no_takeoff', message: '展開図の実測データがありません', detail: {} }] };
  }

  const rooms = Array.isArray(context.elevations?.rooms) ? context.elevations.rooms : [];
  const area = Number(context.totalFloorAreaSqm);
  const hasArea = Number.isFinite(area) && area > 0;
  const wallPb = Number(takeoff.wall_pb_sqm);

  // ① 壁PB比率の上限のみ（専有面積が無い場合は判定不能としてスキップ）
  //    過少側は物件の分類構造差で正常に起こりうるため見ない（上のWALL_PB_RATIO_MAX注記参照）
  if (hasArea && Number.isFinite(wallPb) && wallPb > 0) {
    const ratio = wallPb / area;
    if (ratio > WALL_PB_RATIO_MAX) {
      reasons.push({
        code: 'wall_pb_ratio',
        message: `壁PB面積が専有面積の${ratio.toFixed(2)}倍です`
          + `（実績1.6〜1.9倍・許容上限${WALL_PB_RATIO_MAX}倍）`,
        detail: { ratio: Math.round(ratio * 100) / 100, wall_pb_sqm: wallPb, total_floor_area_sqm: area,
          max: WALL_PB_RATIO_MAX },
      });
    }
  }

  // ② 読み取り品質: 同一寸法構成の部屋が並ぶ（幻覚読みの典型的な痕跡）
  //    ※ 壁記号（wall_code）が全部nullでも実測モードは止めない。正常な記録でも
  //      記号は平面図側（plan_codes/plan_placements）から供給され face.wall_code は
  //      null のままのことがある（Gタイプ3記録とも 0/33〜0/34 = 全null で正常動作）。
  //      記号ゼロは「記号が面に割り付かず全面PB扱い→過大」の前兆なので、
  //      平面図側にも記号が1つも無い場合に限り情報提供の警告として積む（不採用理由にはしない）。
  if (rooms.length > 0) {
    const shapes = new Map();
    for (const r of rooms) {
      const sig = roomShapeSignature(r);
      if (!sig) continue;
      if (!shapes.has(sig)) shapes.set(sig, []);
      shapes.get(sig).push(r.name || '(名称なし)');
    }
    for (const [sig, names] of shapes) {
      if (names.length >= DUP_ROOM_SHAPE_MIN) {
        reasons.push({
          code: 'duplicate_room_shape',
          message: `同一の面寸法(${sig})を持つ部屋が${names.length}室あります`
            + '（展開図の読み取りが同じ部屋を繰り返した幻覚の疑い）',
          detail: { signature: sig, rooms: names, threshold: DUP_ROOM_SHAPE_MIN },
        });
      }
    }
  }

  // ③ 1部屋の周長が専有面積から見て非現実的（面幅の桁誤読・重複転記の検出）
  if (hasArea && rooms.length > 0) {
    const maxPerimeterM = 4 * Math.sqrt(area) * ROOM_PERIMETER_MAX_RATIO;
    for (const r of rooms) {
      const perim = (Array.isArray(r.faces) ? r.faces : [])
        .reduce((s, f) => s + (Number.isFinite(f?.width_mm) && f.width_mm > 0 ? f.width_mm : 0), 0) / 1000;
      if (perim > maxPerimeterM) {
        reasons.push({
          code: 'room_perimeter',
          message: `部屋「${r.name || '(名称なし)'}」の周長${Math.round(perim * 10) / 10}mが`
            + `専有面積${area}㎡に対して非現実的です（上限${Math.round(maxPerimeterM * 10) / 10}m）`,
          detail: { room: r.name || null, perimeter_m: Math.round(perim * 10) / 10,
            max_perimeter_m: Math.round(maxPerimeterM * 10) / 10 },
        });
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * 壁仕上記号が1つも読めていないか（面のwall_code・平面図のplan_codes/plan_placementsすべて空）。
 * 記号ゼロは「全面をデフォルトPB扱い＝過大計上」の前兆なので、実測モードは止めないが
 * 要確認の警告として利用者に見せる（validateTakeoffSanityとは独立の情報提供）。
 */
export function hasNoWallCodes(elevations) {
  const rooms = Array.isArray(elevations?.rooms) ? elevations.rooms : [];
  for (const r of rooms) {
    for (const f of (Array.isArray(r.faces) ? r.faces : [])) {
      if (parseWallCode(f?.wall_code)) return false;
    }
    for (const c of (Array.isArray(r.plan_codes) ? r.plan_codes : [])) {
      if (parseWallCode(c)) return false;
    }
    for (const pl of (Array.isArray(r.plan_placements) ? r.plan_placements : [])) {
      if (parseWallCode(pl?.code)) return false;
    }
  }
  return rooms.length > 0;
}
