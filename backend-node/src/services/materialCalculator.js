/**
 * 資材計算サービス
 * アルファスタイル新宮町67戸（A〜Gタイプ）+ けいとさんの5現場実績データに基づいて最適化
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 【アルファスタイル新宮町 住戸タイプ別実績（意匠図より抽出）】
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * | タイプ | 専有面積 | 内法面積 | 間取り | UBサイズ | 戸数 | LDK面積 |
 * |--------|----------|----------|--------|----------|------|---------|
 * | A | 71.90㎡ | 68.00㎡ | 3LDK | 1416 | 10戸 | 18.82㎡ |
 * | B | 67.30㎡ | 64.80㎡ | 3LDK | 1416 | 10戸 | - |
 * | C | 67.30㎡ | 64.80㎡ | 3LDK | 1416 | 10戸 | - |
 * | D | 67.30㎡ | 64.80㎡ | 3LDK | 1416 | 10戸 | - |
 * | E | 67.31㎡ | 64.80㎡ | 3LDK | 1416 | 9戸 | 18.90㎡ |
 * | F | 50.74㎡ | - | 2LDK | 1216 | 9戸 | - |
 * | G | 67.30㎡ | 64.80㎡ | 3LDK | 1416 | 9戸 | - |
 * ※ 意匠図①より確認: UBサイズはFタイプのみ1216、他は全て1416
 *
 * 【建具表（木製建具）より】
 * - 片開き戸: WD-1TA(850×2175)〜WD-6C(450×2080)
 * - 片引き戸: WD-8A(660×2075)〜WD-8TB(760×2170)
 * - 引違い戸: WD-102C(1825×2075)
 * - 2枚引込み: WD-01(2270×2170)
 * - 2枚折戸: WD-12AL(605×2005)〜WD-120E(983×2320)
 * - 6枚折戸: WD-160B(2091×2320)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 【アルファスタイル新宮町 Gタイプ(67戸) 1戸あたり実績】
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * ■ 石膏ボード
 * | 項目 | 総数量(67戸) | 1戸あたり | 算出根拠 |
 * |------|-------------|-----------|----------|
 * | 壁PB t-9.5 | 6,010枚 | 約90枚 | 壁面積122㎡÷1.4㎡=87枚 |
 * | 天井PB t-9.5 | 2,810枚 | 約42枚 | 天井面積59㎡÷1.4㎡=42枚 |
 * | 下り天井PB | 260枚 | 約4枚 | 下り天井5.2㎡ |
 * | 耐水PB t-9.5 | 280枚 | 約4枚 | 水回り6.5㎡ |
 * | EV廻り壁PB | 150枚 | 約2枚 | EV面9㎡ |
 * | キッチンパネル | 170枚 | 約3枚 | 3'×8' |
 *
 * ■ 木工事
 * | 項目 | 1戸あたり | 算出根拠 |
 * |------|-----------|----------|
 * | 際根太 45×30 | 18.2m | 床周囲 |
 * | 間仕切下地 45×30 | 84m | @450ピッチ |
 * | 天井下地 LVL 30×40 | 天井面積分 | 38.5m3(67戸) |
 * | 吊戸下地 30×40 | 9本 | |
 *
 * ■ 仕上げ
 * | 項目 | 1戸あたり | 算出根拠 |
 * |------|-----------|----------|
 * | 床フローリング直貼り | 48.4㎡ | 居室床面積 |
 * | 巾木 H=40 | 56.4m | 壁延長−開口部 |
 * | 玄関廻り巾木（樹脂） | 3.75m | |
 * | 巾木出隅コーナー | 10個 | |
 * | グラスウール | 6.4㎡ | 間仕切部 |
 * | 下地補強合板 t-9.0 | 5.6㎡ | カーテンレール等 |
 *
 * ■ 建具（67戸分）
 * | 建具タイプ | 数量 | サイズ |
 * |------------|------|--------|
 * | 片開き戸 | 約6枚/戸 | 600〜850×2080〜2175 |
 * | 片引き戸 | 約2枚/戸 | 660〜760×2075 |
 * | 2枚折戸 | 約3枚/戸 | 605〜983×2080〜2320 |
 * | 6枚折戸 | 約0.4枚/戸 | 2091×2320 |
 *
 * ■ 床工事
 * | 項目 | 1戸あたり | 算出根拠 |
 * |------|-----------|----------|
 * | 床下地合板 t-9.0 | 4.8㎡ | 水回り |
 * | 乾式置床 H200 | 3.9㎡ | パウダールーム・トイレ |
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 【旧実績データサマリー（けいとさんの資料より・リノベ用）】
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * - 朝日パリオ305 (2LDK, 620万): PB12.5=40枚, PB9.5=30枚, Mクロス=7枚, 垂木=25束
 * - 別物件ミドル (2LDK, 665万): PB12.5=50枚, PB9.5=35枚, Mクロス=7枚, 垂木=25束
 * - 寿401 HG (2LDK, 735万): PB9.5=30枚, Mクロス=7枚, 垂木=20束
 * - 3LDK 70㎡ (535万): PB12.5=35枚, PB9.5=30枚, Mクロス=7枚, 垂木=20束
 */

import {
  TIMBER_SECTIONS, timberVolumeM3, majikiriTimberLengthM, ceilingFrameLengthM,
  majikiriVolumeM3, MAJIKIRI_M3_PER_SQM, ceilingFrameVolumeM3, CEILING_M3_PER_SQM,
  dobuchiVolumeM3, DOBUCHI_M3_PER_SQM,
} from './timberVolume.js';
// 窓判定は buildupCalculator.js の isWindow に一本化（2026-07-21共通化）。
// 従来ここに別実装 isOpeningWindow があり type.includes('aw') で誤爆＋判定基準がbuildup側とズレていた。
import {
  isWindow as isOpeningWindow,
  // 界壁面（木胴縁の拾い対象）の既定面積と解決ロジック。高さ側 KAIBE_FACE_HEIGHT_M と同じ場所に置き、
  // 推定パス（ここ）と実測パス（applyElevationTakeoff）で同じ解釈になるようにする（S-2）
  resolveKaibeWallSqm, KAIBE_WALL_SQM_ALPHA,
  // 収納面PB（マルチクロゼット・WIC・CLRC面）の面積換算。推定パス（ここ）と実測パス
  // （applyElevationTakeoff の konpane_sqm）で同じ係数 X73=1.45 を使う（2026-07-25）
  resolveClosetRcSqm, CLOSET_RC_SQM_ALPHA, CLOSET_PB_SQM_PER_SHEET,
} from './buildupCalculator.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【計算用定数】
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PB_SHEET_SIZE_3x6 = 1.6562; // ㎡ (910mm × 1820mm = 3×6)
const PB_SHEET_SIZE_3x8 = 2.208; // ㎡ (910mm × 2420mm = 3×8)
const DOOR_OPENING_AREA = 0.8 * 2.0; // 1.6㎡
const WINDOW_OPENING_AREA = 1.5 * 1.2; // 1.8㎡
const TARUKI_PER_BUNDLE = 12; // 垂木1束=12本

// 面積推定係数（床面積からの推定用）
const CEILING_AREA_RATIO = 0.9;           // 天井面積 = 床面積 × 0.9
const PARTITION_WALL_RATIO = 0.4;         // 間仕切壁延長 = 床面積 × 0.4 (目安)
const PARTITION_WALL_MAX_RATIO = 0.45;    // 間仕切壁延長の最大係数
const PARTITION_WALL_MIN_RATIO = 0.25;    // 間仕切壁延長の最小係数

// ロス率・補正係数
const LOSS_RATE_5 = 1.05;                 // +5% ロス（PB等）
const LOSS_RATE_10 = 1.1;                 // +10% ロス（フローリング等）
const LOSS_RATE_20 = 1.2;                 // +20% ロス（耐水PB等）
// 壁PBの枚数換算係数（XLS集計表X列の実運用係数。ロス・切り無駄込みで 3'×6'実面積1.6562より小さい）。
//   出典: 打ち合わせ議事メモ 2026-07-14「壁PB÷1.4=87〜88枚が正解。1.6562はロスなし理論値」
const PB_CONVERSION_WALL = 1.4;
// 旧 WALL_PB_REDUCTION=0.6（「リノベ=片面のみ」）は削除。新築実績係数1.37の上に掛かっていて
//   新築でもリノベでもない値になっていた。建物種別ごとの式は resolveBuildingTypeProfile を参照
//   （リノベ側の実効値 1.37×0.6 は WALL_PB_COEFF_RENOVATION / WALL_PB_RENOVATION_REDUCTION として保存）。
// グラスウール充填率は**物件依存**（アルファ=遮音壁のみ0.135 / 別府=全間仕切0.4〜0.8）のため
// 定数ではなく GLASSWOOL_COVERAGE_ALPHA + overrides.glasswool_coverage で扱う（M-3・下記GWブロック参照）。
// 旧 GLASSWOOL_COVERAGE=0.5 は「間仕切壁の半分」という根拠不明の値で、両物件のどちらとも一致しなかった。

// 建具関連係数
const DOOR_WIDTH_DEFAULT = 0.8;           // ドア幅デフォルト (m)
const DOOR_OPEN_RATIO = 0.5;              // 開き戸比率
const DOOR_SLIDE_RATIO = 0.2;             // 引き戸比率
const DOOR_FOLD_RATIO = 0.3;              // 折戸比率

// 沓摺係数
const KUTSUZURI_DOOR_LENGTH = 0.7;        // 開き戸沓摺長さ係数
const KUTSUZURI_SLIDE_LENGTH = 1.5;       // 引き戸沓摺長さ係数
const KUTSUZURI_CLOSET_LENGTH = 0.8;      // 折戸沓摺長さ係数

// 下地関連係数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【際根太は「係数・規格・材積換算の有無」の3点セットで物件依存（2026-07-24）】
//   際根太＝床の段差部・壁際に入れる根太。**どの範囲に入れるかが物件の設計思想そのもの**で、
//   床面積からの一定係数では物件を跨げない（下記の実測差3.5〜4.6倍が証拠）。
//
//   ① 長さ係数（床面積㎡ → 際根太m）
//      アルファ: 集計表9行「際根太(木) ４５ｘ３0」戸当 18.2m ÷ 床65.76㎡ = 0.277 m/㎡
//                内訳は玄関5.7＋便所4.0＋洗面8.5＝**水回り＋玄関の段差部だけ**に入れる仕様
//      別府    : 集計表9行「際根太 H110」戸当 Ａ80.9 / Ｂ47.2 / Ｃ67.0 / Ｄ67.9 / Ｅ72.7 /
//                Ｆ74.2 / Ｇ96.4 / Ｈ136.9 / Ｉ134.18 m。床面積比 **0.97〜1.27 m/㎡**
//                （床面積は正解JSONに専有が無いため天井PB面積÷0.88で逆算。CEILING_TO_FLOORと同じ）
//                ＝巾木長さとほぼ同オーダー（kiwa/habaki 1.05〜1.31）で、**住戸のほぼ全周**に入る仕様
//      → 既定0.277をそのまま別府に当てると 18〜33m しか出ず実測47〜137mに対し **-60〜76%**。
//        1つの係数で両立できないので override で人が指定する（0.28→アルファ実績値を明示化）
//   ② 規格（名称の摘要）: アルファ「45×30 米栂1等」/ 別府「H110」。断面が違う＝別の材
//   ③ 材積換算の有無: アルファは集計表X9=0.00135 m³/m で材積(m³)行を出す。
//      **別府はX9=0＝材積換算しない**（mのまま発注する運用）。0を掛けて0m³の行を出すのではなく
//      **行そのものを出さない**のが正（存在しない材の発注行を作らないため）
//
//   ※ 別府にはアルファに存在しない「スラブ下り際根太 H=210」（別府タイプ別シートr10・戸当23.3m）
//     という別部位行がある。これは際根太本体とは別の材で、今回のoverrideの対象外
//     （check-engine-constants.mjs に未対応として別項目で明示。黙って無視しない）
// 既定は従来どおり 0.28（アルファ実績の丸め値）。**0.277（=18.2÷65.76 の生値）へ精密化しない**:
//   evalのGタイプ入力（部屋合計64.7㎡）で ceil(64.7×0.28)=19 / ceil(64.7×0.277)=18 と
//   ceil境界をまたぎ、既存の際根太+4.4%・際根太材積+4.5%が変わってしまうため
//   （今回の目的は物件依存のoverride化であって既定値の精度変更ではない）。
export const KIWANETA_RATIO_ALPHA = 0.28; // 際根太 = 床面積 × 0.28 (m)（アルファ実績18.2m/65.76㎡=0.2768の丸め）
const KIWANETA_RATIO_MAX = 3.0;           // 入力ガード。別府max 1.27 m/㎡ の2倍以上＝桁違いの入力ミス
const KIWANETA_MIN_M_ALPHA = 18;          // 下限も物件依存（アルファ実績18.2mの丸め。別府minはＢ47.2m）
const KIWANETA_MIN_M_MAX = 300;           // 下限指定の入力ガード（住戸1戸の際根太長として非現実な値を弾く）
const KIWANETA_SPEC_ALPHA = '45×30 米栂1等'; // 別府は 'H110'
const AIRCON_PER_ROOM = 0.5;              // エアコン下地 = 部屋数 × 0.5

// 壁下地係数
const PARTITION_WALL_RATIO_30 = 0.3;      // 間仕切壁部分（壁面積の約30%）

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【仮単価マスター】※実際の単価は信頼関係構築後に更新予定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const UNIT_PRICES = {
  // === 解体工事 ===
  '解体工事 表層 設備・建具': 150000,
  '解体工事 表層 フローリング・カーペット': 80000,
  '解体廃材処分 表層 設備・建具': 120000,
  '解体廃材処分 表層 フローリング・カーペット': 60000,

  // === 仮設工事 ===
  '養生費': 15000,

  // === 左官工事 ===
  '玄関土間左官補修': 25000,
  '床左官補修': 20000,

  // === 下地材 ===
  '壁 石膏ボード': 450,                // 枚
  '壁 耐水石膏ボード': 550,            // 枚
  '天井 石膏ボード': 450,              // 枚
  '下り天井 石膏ボード': 450,          // 枚
  '一部界壁 石膏ボード': 450,          // 枚
  '一部界壁 耐水石膏ボード': 550,      // 枚
  'EV廻り壁 石膏ボード': 450,          // 枚
  'マルチクロゼット・WIC・CLRC面 石膏ボード': 450, // 枚
  'キッチンパネル': 8500,              // 枚（設備カテゴリの標準行）
  '壁 キッチンパネル': 8500,           // 枚
  '壁 キッチンパネル見切り': 1200,     // 箇所
  '間仕切 グラスウール充填': 1800,     // ㎡
  'EV廻り壁 グラスウール充填': 1800,   // ㎡
  'カーテンレール・手摺・タオル掛 下地補強合板': 850, // 枚
  'エアコン下地補強合板': 850,         // 枚
  '壁出隅面木': 450,                   // 箇所
  '垂木 LVL 30×40 L3000': 3500,       // 束
  '際根太': 350,                       // m
  '吊戸下地': 280,                     // 本
  '間仕切下地(木)': 380,               // m
  '遮音壁PB張り': 2800,                // ㎡
  'ラワンベニヤ 9mm 3×6': 1200,       // 枚
  'ラワンランバー 24mm 3×8': 2800,    // 枚
  '床下地合板': 3200,                  // ㎡

  // === 床材 ===
  'フローリング': 6500,                // ㎡
  '床見切り': 1500,                    // 本
  '水回りフロアタイル貼り': 45000,     // 式
  'クッションフロア貼り': 35000,       // 式
  '玄関土間フロアタイル貼り': 25000,   // 式
  '乾式置床': 6900,                    // ㎡

  // === 造作材 ===
  '木製巾木': 850,                     // m
  '木製巾木出隅役物': 350,             // 箇所
  '樹脂巾木': 650,                     // m
  '玄関見切縁': 480,                   // m
  '玄関廻り壁面木': 550,               // m
  '天井点検口': 4500,                  // 箇所
  'PS点検口': 4500,                    // 箇所
  'カーテンボックス': 8500,            // 箇所
  '額縁': 3500,                        // 箇所
  'UB三方枠': 12000,                   // 箇所
  'AW掃出し下見切り': 1800,            // m
  'タイル見切縁': 650,                 // m
  '枕棚取付': 8500,                    // 箇所
  'ハンガーパイプ取付': 3500,          // 箇所
  'LD開戸沓摺': 2500,                  // m
  '開戸沓摺': 1800,                    // m
  '引戸沓摺': 2200,                    // m
  'クローゼット沓摺': 1500,            // m

  // === 仕上材 ===
  '天井クロス貼り': 1200,              // ㎡
  '壁クロス貼り': 1200,                // ㎡
  'アクセントクロス貼り': 1800,        // ㎡
  'クロス新規下地処理': 18000,         // 人工
  'ダイノックシート貼り': 8500,        // m

  // === 建具 ===
  '片開き戸': 35000,                   // 枚
  '片引き戸': 42000,                   // 枚
  '2枚折戸': 28000,                    // 枚
  '下駄箱': 85000,                     // 台

  // === 家具 ===
  'リネン庫': 45000,                   // 台
  'トイレ吊戸棚': 32000,               // 台
  'キッチンカウンター': 55000,         // 箇所
  '固定棚': 12000,                     // 箇所
  '可動棚': 18000,                     // 箇所

  // === 設備 ===
  'ユニットバス': 450000,              // 台
  'システムキッチン本体': 380000,      // 台
  '洗面化粧台': 120000,                // 台
  '洗面タオルレール': 3500,            // 個
  '洗濯パン': 8500,                    // 台
  '洗濯機横引きトラップ': 4500,        // 個
  '洗濯機用水栓': 6500,                // 個
  'ランドリー収納': 25000,             // 個
  'トイレ本体': 85000,                 // 台
  'トイレペーパーホルダー': 3500,      // 個
  'トイレタオルレール': 3500,          // 個
  '給湯器': 180000,                    // 台
  'マルチリモコン': 15000,             // 個
  '床暖房': 45000,                     // ㎡
  '室内窓': 85000,                     // 箇所

  // === 内装材 ===
  'カーテンレール設置': 3500,          // 箇所
  'カーテンレール': 4500,              // 本
  'レジスター': 2500,                  // 個
  'スリーブキャップ': 850,             // 個

  // === 電気工事 ===
  'ダウンライト': 3500,                // 台
  'シーリングライト': 12000,           // 台
  '照明器具取付': 35000,               // 式
  'スイッチ・コンセント工事': 85000,   // 式
  '単室換気扇': 18000,                 // 台
  '電気部分新規配線': 65000,           // 式
  '分電盤交換': 45000,                 // 式
  'ダウンライト追加配線': 4500,        // 箇所
  '食洗機用専用回路追加': 25000,       // 式
  '浴室換気乾燥機専用回路追加': 25000, // 式
  '人感センサー・DL連光器設置': 18000, // 式
  'モニターホン取付': 8500,            // 式
  '給湯器リモコン取付': 5500,          // 式
  'レジスタ取付': 2500,                // 箇所
  '照明器具付け': 25000,               // 式
  '火災報知器取付': 2500,              // 個

  // === 電材 ===
  '配線器具一式': 65000,               // 式
  'TV端子': 3500,                      // 個
  '人感スイッチ': 4500,                // 個
  '両切スイッチダウンライト 100W 電球色': 3200, // 台
  '調光器': 8500,                      // 台
  'テレビドアホン': 25000,             // 台
  '分電盤': 35000,                     // 台
  '火災報知器（熱）': 3500,            // 個
  '火災報知器（煙）': 3500,            // 個

  // === 設備工事 ===
  '給排水配管部分更新': 180000,        // 式
  'UB接続': 45000,                     // 式
  '給湯器取付': 35000,                 // 式
  'トイレ取付': 25000,                 // 式
  '洗面化粧台取付': 18000,             // 式
  '洗面所アクセサリー取付': 8500,      // 式
  '洗濯機パン取付': 12000,             // 式
  'キッチンダクト配管工事': 5500,      // m
  'トイレ・洗面・浴室ダクト配管工事': 4500, // m
  '水回り用単室換気扇交換': 25000,     // 式
  'エアコンスリーブキャップ取付': 2500, // 箇所

  // === ガス工事 ===
  '既存ガス管撤去': 25000,             // 式
  '新規ガス管基本工事費': 45000,       // 式
  'ガス新規配管': 8500,                // m
  'ガスコンロ繋ぎ': 15000,             // 式
  '給湯器繋ぎ': 18000,                 // 式

  // === サッシ工事 ===
  '網戸張替え': 4500,                  // 枚

  // === 大工工事 ===
  '天井下地': 2800,                    // ㎡
  '壁下地': 3200,                      // ㎡
  '玄関上がり框取付': 25000,           // 式
  '壁下地補強ベニヤ・合板貼り': 3500,  // ㎡
  '窓枠交換': 15000,                   // ㎡

  // === 現場管理 ===
  '施工管理費（工程管理）': 180000,    // 式
  '現場諸経費': 85000,                 // 式

  // === 諸経費 ===
  'ルームクリーニング': 45000,         // 式
  '検査費': 25000,                     // 式
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【アルファステイツ新宮町 67戸実績 → 1戸あたり】
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ALPHA_STATS = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【木工事シートより - 木材（m³単位）】
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  timber_kiwaneta: 1.8,         // 際根太 LVL 30×45 (m³) → 0.027m³/戸
  timber_majikiri: 77.3,        // 間仕切木軸 LVL 30×45 (m³) → 1.15m³/戸
  timber_dobuchi: 3.6,          // 木胴縁（一部界壁面）LVL 30×45 (m³) → 0.054m³/戸
  timber_ceiling: 38.5,         // 天井下地 LVL 30×40 (m³) → 0.57m³/戸

  // 石膏ボード（67戸分）
  wall_pb_95: 6010,          // 壁PB t-9.5 (3'×6')
  wall_pb_95_water: 280,     // 壁耐水PB t-9.5 (3'×6')
  wall_pb_boundary: 200,     // 一部界壁PB t-9.5 (キッチンパネル下のみ)
  wall_pb_boundary_water: 50,// 一部界壁耐水PB t-9.5 (キッチンパネル下のみ)
  wall_pb_ev: 150,           // EV廻り壁PB t-9.5
  wall_pb_closet: 340,       // クローゼット・WIC・CLRC面 PB t-9.5 (コンパネ→PBに変更 250121)
  ceiling_pb_95: 2810,       // 天井PB t-9.5 (3'×6')
  ceiling_pb_drop: 260,      // 下り天井PB t-9.5
  kitchen_panel: 170,        // キッチンパネル 3'×8' (アイカセラール→キョーライトアーバンSマリアパール変更)
  kitchen_panel_joiner: 134, // キッチンパネル見切り H=2250 (樹脂製ABSジョイナー)

  // グラスウール・断熱
  glasswool_partition: 451,  // 間仕切グラスウール t-50 24kg/m³
  glasswool_ev: 140,         // EV廻り壁グラスウール t-50 (VE数量変更220→140)

  // 下地補強合板
  reinforce_board: 390,      // カーテンレール・手摺・タオル掛下地 t-9.0 (3'×6')
  aircon_board: 20,          // エアコン下地補強合板 t-9.0

  // 面木・コーナー
  corner_general: 420,       // 壁出隅面木（一般）R型コーナーパット
  corner_small_1000: 67,     // 壁出隅面木（小口）H=1000
  corner_small_2200: 91,     // 壁出隅面木（小口）H=2200
  corner_small_2300: 5,      // 壁出隅面木（小口）H=2300

  // 巾木
  wood_habaki: 3615,         // 木製巾木 H=40
  habaki_corner: 672,        // 木製巾木出隅役物
  resin_habaki: 242,         // 樹脂巾木（玄関用）H=60

  // 玄関
  entrance_trim: 319,        // 玄関SD見切縁
  entrance_corner: 319,      // 玄関廻り壁面木

  // 点検口
  ceiling_hatch: 67,         // 天井点検口 450角

  // カーテンボックス（タイプ別あり）
  curtain_box_count: 67,     // カーテンボックス 各タイプ合計

  // 額縁（合計）
  frame_3way_total: 123,     // 三方額縁 合計
  frame_4way_total: 164,     // 四方額縁 合計
  ub_frame: 67,              // UB三方枠

  // 建具枠
  door_single: 375,          // 片開き戸枠 合計(WD-1TA〜WD-6C)
  door_slide: 95,            // 片引き戸枠 合計(WD-8A〜WD-8TB)
  door_double_slide: 9,      // 引違い戸枠(WD-102C)
  door_4slide: 10,           // 2枚引込み×2枠(WD-01)
  door_fold_2: 125,          // 2枚折戸 合計(WD-12AL〜WD-120E)
  door_fold_6: 29,           // 6枚折戸(WD-160B)

  // 沓摺
  kutsuzuri_ld: 57,          // LD開戸沓摺 バリアフリー床見切
  kutsuzuri_door: 225,       // 開戸沓摺
  kutsuzuri_slide: 199,      // 引戸沓摺
  kutsuzuri_closet: 163,     // クローゼット沓摺

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 木下地詳細（集計表シートより・Gタイプ9戸+造作構造材1戸=10戸分）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  kiwaneta_45x30: 163.8,     // 際根太 45×30 (m) → 18.2m/戸
  shikidodai_85x45: 18,      // 敷土台 85×45 (本) → 2本/戸
  shikidodai_49x36: 36,      // 敷土台 49×36 (本) → 4本/戸
  tsurito_shita_30x40: 81,   // 吊戸下地 30×40 (本) → 9本/戸
  linen_sangi_150x30: 9,     // リネン庫桟木 150×30 (本) → 1本/戸
  aw_hakidashi_mikiri: 21.6, // AW掃出し下見切り カイダーベースボード (m) → 2.4m/戸
  genkan_mawari_habaki: 33.75, // 玄関廻り巾木 樹脂H=35 (m) → 3.75m/戸
  habaki_h40: 507.96,        // 巾木 H=40 (m) → 56.44m/戸
  habaki_desumi: 90,         // 巾木出隅コーナー (個) → 10個/戸
  ev_glasswool: 80.955,      // EV面グラスウール+PBt9.5+木胴縁 (㎡) → 8.995㎡/戸
  sanitary_hikiki: 20.17,    // サニタリー片引き部 (㎡) → 2.24㎡/戸
  floor_direct: 435.74,      // 床上直貼りフローリングt=13 (㎡) → 48.4㎡/戸

  // 間仕切下地・壁ボード詳細（集計表シートより）
  majikiri_shitaji: 756.74,  // 間仕切下地(木) 45×30 @450 (m) → 84m/戸
  shaon_wall: 116.81,        // 遮音壁PB張り t9.5+GW (㎡) → 13㎡/戸
  wall_pb_detail: 1098.55,   // 壁PB t-9.5 (㎡) → 122㎡/戸
  wall_pb_water_detail: 58.08, // 壁耐水PB t-9.5 (㎡) → 6.5㎡/戸
  wall_funen: 35.33,         // 壁不燃材 t-6.0 (㎡) → 3.9㎡/戸
  hikiki_sodekabe: 28.45,    // 片引き袖壁 (㎡) → 3.2㎡/戸
  majikiri_glasswool: 107.32, // 間仕切グラスウール t50 24kg (㎡) → 12㎡/戸
  closet_rc_wall: 67.59,     // クローゼット内RC面 木胴縁+コンパネ (㎡) → 7.5㎡/戸

  // 天井詳細
  powder_toilet_ceiling: 36, // パウダールーム・トイレ天井ボード (㎡) → 4㎡/戸
  ceiling_drop: 47.1,        // 天井(下り) (㎡) → 5.2㎡/戸
  ceiling_pb_detail: 531.79, // 天井PB t-9.5 (㎡) → 59㎡/戸

  // 出隅・その他造作
  board_desumi: 198.18,      // ボード出隅 フクビ (㎡) → 22㎡/戸
  // 界壁面 PBt9.5+木胴縁 (㎡・アルファ9戸分) → 5.047㎡/戸。
  // ※木胴縁の計算には使わない（物件依存のため KAIBE_WALL_SQM_ALPHA + overrides.kaibe_wall_sqm へ移管・S-2）。
  //   この表は「アルファ67戸実績の記録」なので値自体は残す（他部位の実績表と並びを保つ）
  kaibe_wall: 45.42,
  ps_tenkenkou: 18,          // PS点検口 (箇所) → 2箇所/戸
  mengi: 99,                 // 面木 (箇所) → 11箇所/戸
  mengi_general: 63,         // 面木(一般) 4R型コーナーパット (箇所) → 7箇所/戸
  tile_mikiri: 18,           // タイル見切縁 塩ビ見切り (m) → 2m/戸

  // 下地補強詳細
  shitaji_hokyou_gesoku: 50.36, // 下地補強 下足入・洗面・吊戸 (㎡) → 5.6㎡/戸
  shitaji_hokyou_gouhan: 22.68, // 下地補強 合板 (㎡) → 2.5㎡/戸
  aircon_shitaji: 3.51,      // エアコン下地 (㎡) → 0.4㎡/戸

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 内装工事シート
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  floor_base_board: 323,     // 床下地合板 T9.0 (㎡) ※パウダールーム・トイレ
  floor_okiyuka: 251,        // 乾式置床 H200 (㎡) ※パウダールーム・トイレ
  floor_leveling_base: 220,  // 床シート下レベリング上 下地合板 (㎡)

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 木製建具工事シート（詳細）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 片開き戸詳細
  door_wd1ta: 67,            // WD-1TA 片開き戸 850×2175
  door_wd2a: 57,             // WD-2A 片開き戸 800×2080
  door_wd2ta: 116,           // WD-2TA 片開き戸 800×2175
  door_wd3tb: 67,            // WD-3TB 片開き戸 700×2175
  door_wd6a: 19,             // WD-6A 片開き戸 600×2080
  door_wd6ta: 30,            // WD-6TA 片開き戸 600×2175
  door_wd6tba: 9,            // WD-6TBA 片開き戸 600×2210
  door_wd6c: 10,             // WD-6C 片開き戸 450×2080
  // 片引き戸詳細
  door_wd8a: 28,             // WD-8A 片引き戸 660×2075
  door_wd8b: 48,             // WD-8B 片引き戸 760×2075
  door_wd8tb: 19,            // WD-8TB 片引き戸 760×2170
  // 引違い・引込み戸
  door_wd102c: 9,            // WD-102C 引違い戸 1825×2075
  door_wd01: 10,             // WD-01 2枚引込み×2 (1135+1135)×2170
  // 2枚折戸詳細
  door_wd12al: 9,            // WD-12AL 2枚折戸 605×2005
  door_wd12c: 9,             // WD-12C 2枚折戸 803×2080
  door_wd12e: 9,             // WD-12E 2枚折戸 983×2080
  door_wd120a: 48,           // WD-120A 2枚折戸 605×2320
  door_wd120b: 10,           // WD-120B 2枚折戸 701×2320
  door_wd120c: 20,           // WD-120C 2枚折戸 803×2320
  door_wd120d: 9,            // WD-120D 2枚折戸 905×2320
  door_wd120e: 20,           // WD-120E 2枚折戸 983×2320
  // 6枚折戸
  door_wd160b: 29,           // WD-160B 6枚折戸 2091×2320

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 家具工事シート
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 下足箱
  shoe_box: 58,              // 下足箱取付 W1200×D410×H1900
  // リネン庫
  linen_closet: 67,          // リネン庫 W320×D310×H2200
  // トイレ吊戸棚
  toilet_cabinet_885: 39,    // 吊戸棚 W885×D310×H702 (A,C,D,G)
  toilet_cabinet_935: 19,    // 吊戸棚 W935×D310×H702 (B,E)
  toilet_cabinet_950: 9,     // 吊戸棚 W950×D310×H702 (F)
  // キッチンカウンター
  kitchen_counter: 67,       // キッチンカウンター（各タイプ）
  // 固定棚
  fixed_shelf_cl: 67,        // クローゼット固定棚（各タイプ）
  fixed_shelf_wic: 29,       // WIC固定棚（B,C,E,G）
  // 可動棚
  movable_shelf_ld: 67,      // LD収納可動棚
  movable_shelf_pantry: 10,  // パントリー可動棚(Aタイプのみ)
  movable_shelf_sic: 18,     // SIC可動棚(Fタイプ 9×2)

  // 工事面積
  total_area: 4406,          // 延床面積(㎡) 67戸分 → 1戸≒65.8㎡

  units: 67                  // 戸数
};

// 1戸あたりの標準数量を計算
const PER_UNIT = {
  // 木材（m³）
  timber_kiwaneta: Math.round(ALPHA_STATS.timber_kiwaneta / ALPHA_STATS.units * 1000) / 1000,  // 0.027m³/戸
  timber_majikiri: Math.round(ALPHA_STATS.timber_majikiri / ALPHA_STATS.units * 100) / 100,   // 1.15m³/戸
  timber_dobuchi: Math.round(ALPHA_STATS.timber_dobuchi / ALPHA_STATS.units * 1000) / 1000,   // 0.054m³/戸
  timber_ceiling: Math.round(ALPHA_STATS.timber_ceiling / ALPHA_STATS.units * 100) / 100,    // 0.57m³/戸

  // 石膏ボード
  wall_pb_95: Math.ceil(ALPHA_STATS.wall_pb_95 / ALPHA_STATS.units),         // 約90枚
  wall_pb_95_water: Math.ceil(ALPHA_STATS.wall_pb_95_water / ALPHA_STATS.units), // 約4枚
  wall_pb_closet: Math.ceil(ALPHA_STATS.wall_pb_closet / ALPHA_STATS.units), // 約5枚 (MC/WIC/CLRC)
  ceiling_pb_95: Math.ceil(ALPHA_STATS.ceiling_pb_95 / ALPHA_STATS.units),   // 約42枚
  ceiling_pb_drop: Math.ceil(ALPHA_STATS.ceiling_pb_drop / ALPHA_STATS.units), // 約4枚
  kitchen_panel: Math.ceil(ALPHA_STATS.kitchen_panel / ALPHA_STATS.units),   // 約3枚
  kitchen_panel_joiner: Math.ceil(ALPHA_STATS.kitchen_panel_joiner / ALPHA_STATS.units), // 約2箇所
  glasswool: Math.ceil(ALPHA_STATS.glasswool_partition / ALPHA_STATS.units), // 約7㎡
  glasswool_ev: Math.round(ALPHA_STATS.glasswool_ev / ALPHA_STATS.units * 10) / 10, // 約2.1㎡
  reinforce_board: Math.ceil(ALPHA_STATS.reinforce_board / ALPHA_STATS.units), // 約6枚
  aircon_board: Math.round(ALPHA_STATS.aircon_board / ALPHA_STATS.units * 10) / 10, // 約0.3枚
  wood_habaki: Math.ceil(ALPHA_STATS.wood_habaki / ALPHA_STATS.units),       // 約54m
  habaki_corner: Math.ceil(ALPHA_STATS.habaki_corner / ALPHA_STATS.units),   // 約10個
  corner_general: Math.ceil(ALPHA_STATS.corner_general / ALPHA_STATS.units), // 約6個
  frame_3way: Math.ceil(ALPHA_STATS.frame_3way_total / ALPHA_STATS.units),   // 約2個
  frame_4way: Math.ceil(ALPHA_STATS.frame_4way_total / ALPHA_STATS.units),   // 約2個
  door_total: Math.ceil((ALPHA_STATS.door_single + ALPHA_STATS.door_slide + ALPHA_STATS.door_double_slide +
                         ALPHA_STATS.door_4slide + ALPHA_STATS.door_fold_2 + ALPHA_STATS.door_fold_6) / ALPHA_STATS.units), // 約10枚
  floor_area: Math.round(ALPHA_STATS.total_area / ALPHA_STATS.units * 10) / 10, // 約65.8㎡

  // 内装工事
  floor_base_board: Math.round(ALPHA_STATS.floor_base_board / ALPHA_STATS.units * 10) / 10, // 約4.8㎡
  floor_okiyuka: Math.round(ALPHA_STATS.floor_okiyuka / ALPHA_STATS.units * 10) / 10,       // 約3.7㎡
  floor_leveling_base: Math.round(ALPHA_STATS.floor_leveling_base / ALPHA_STATS.units * 10) / 10, // 約3.3㎡

  // 建具詳細
  door_single_total: Math.ceil((ALPHA_STATS.door_wd1ta + ALPHA_STATS.door_wd2a + ALPHA_STATS.door_wd2ta +
                                ALPHA_STATS.door_wd3tb + ALPHA_STATS.door_wd6a + ALPHA_STATS.door_wd6ta +
                                ALPHA_STATS.door_wd6tba + ALPHA_STATS.door_wd6c) / ALPHA_STATS.units), // 約6枚
  door_slide_total: Math.ceil((ALPHA_STATS.door_wd8a + ALPHA_STATS.door_wd8b + ALPHA_STATS.door_wd8tb) / ALPHA_STATS.units), // 約1.4枚
  door_fold_total: Math.ceil((ALPHA_STATS.door_wd12al + ALPHA_STATS.door_wd12c + ALPHA_STATS.door_wd12e +
                              ALPHA_STATS.door_wd120a + ALPHA_STATS.door_wd120b + ALPHA_STATS.door_wd120c +
                              ALPHA_STATS.door_wd120d + ALPHA_STATS.door_wd120e + ALPHA_STATS.door_wd160b) / ALPHA_STATS.units), // 約2.5枚

  // 家具
  shoe_box: Math.ceil(ALPHA_STATS.shoe_box / ALPHA_STATS.units),             // 約1台
  linen_closet: Math.ceil(ALPHA_STATS.linen_closet / ALPHA_STATS.units),     // 約1台
  toilet_cabinet: Math.ceil((ALPHA_STATS.toilet_cabinet_885 + ALPHA_STATS.toilet_cabinet_935 +
                             ALPHA_STATS.toilet_cabinet_950) / ALPHA_STATS.units), // 約1台
  kitchen_counter: Math.ceil(ALPHA_STATS.kitchen_counter / ALPHA_STATS.units), // 約1台
  fixed_shelf: Math.ceil((ALPHA_STATS.fixed_shelf_cl + ALPHA_STATS.fixed_shelf_wic) / ALPHA_STATS.units), // 約1.4箇所
  movable_shelf: Math.ceil((ALPHA_STATS.movable_shelf_ld + ALPHA_STATS.movable_shelf_pantry +
                            ALPHA_STATS.movable_shelf_sic) / ALPHA_STATS.units) // 約1.4箇所
};

/**
 * 際根太の物件別プロファイルを解決する（2026-07-24）
 *
 * 際根太は「どこに入れるか」が物件の設計そのもので、**係数だけ差し替えても足りない**
 * （規格＝断面が違い、材積換算をするかどうかも物件で違う）。よって
 *   ratio（長さ係数 m/㎡）/ min_m（下限m）/ spec（摘要）/ volume（材積行を出すか）
 * を1つのプロファイルとしてまとめて解決する。既定は**アルファ実績**（後方互換）。
 *
 * 受け口（overrides = Overrideテーブルの itemKey→value・すべて文字列）:
 *   kiwaneta_ratio        長さ係数 m/㎡（例: 別府 '1.07'。0〜3.0）
 *   kiwaneta_min_m        下限m（例: 別府 '40'。0を指定すれば下限なし）
 *   kiwaneta_spec         摘要（例: 別府 'H110'）
 *   kiwaneta_volume       材積(m³)行を出すか（'なし'/'0'/'false' で出さない＝別府X9=0）
 *
 * 【値の検証方針】resolveKaibeWallSqm と同じ。数字以外の暗黙除去はしない
 *   （'-3'→3の符号反転・'1.07'→107 の100倍化を起こさないため）。
 *   不正値は既定へフォールバックし、呼び出し側が invalid_* を見て警告を出せるようにする。
 *
 * @param overrides { [itemKey]: string }
 * @returns { ratio, min_m, spec, volume, source:{ratio,min_m,spec,volume}, invalid:{...} }
 */
export function resolveKiwanetaProfile(overrides = {}) {
  const source = { ratio: 'default', min_m: 'default', spec: 'default', volume: 'default' };
  const invalid = {};

  // 0以上の数値のみ許可（'0' / '1.07' / '.5'）。空文字・null・undefined＝未設定
  const num = (raw, max) => {
    if (raw === null || raw === undefined) return undefined;
    const s = String(raw).trim();
    if (s === '') return undefined;
    const n = /^\d*\.?\d+$/.test(s) ? Number(s) : Number.NaN;
    if (Number.isFinite(n) && n >= 0 && n <= max) return n;
    return { bad: s };
  };

  let ratio = KIWANETA_RATIO_ALPHA;
  const r = num(overrides.kiwaneta_ratio, KIWANETA_RATIO_MAX);
  if (typeof r === 'number') { ratio = r; source.ratio = 'override'; }
  else if (r) invalid.ratio = r.bad;

  // 下限は **0を明示指定できる**（＝下限なし。アルファ実績18mを他物件へ持ち込まないため）
  let min_m = KIWANETA_MIN_M_ALPHA;
  const mn = num(overrides.kiwaneta_min_m, KIWANETA_MIN_M_MAX);
  if (typeof mn === 'number') { min_m = mn; source.min_m = 'override'; }
  else if (mn) invalid.min_m = mn.bad;

  // 摘要は自由文字列（断面表記は物件ごとに書式が違う: '45×30 米栂1等' / 'H110'）。
  // 長すぎる入力はUnitPrice.spec等の桁を圧迫するので切り詰める
  let spec = KIWANETA_SPEC_ALPHA;
  if (overrides.kiwaneta_spec !== null && overrides.kiwaneta_spec !== undefined
      && String(overrides.kiwaneta_spec).trim() !== '') {
    spec = String(overrides.kiwaneta_spec).trim().slice(0, 50);
    source.spec = 'override';
  }

  // 材積換算の有無。既定＝出す（アルファ X9=0.00135）。
  // 別府のように集計表X9=0 の物件は「材積行を出さない」＝ m のまま発注する
  let volume = true;
  const rawV = overrides.kiwaneta_volume;
  if (rawV !== null && rawV !== undefined && String(rawV).trim() !== '') {
    const s = String(rawV).trim();
    if (/^(なし|無|no|false|0|off)$/i.test(s)) { volume = false; source.volume = 'override'; }
    else if (/^(あり|有|yes|true|1|on)$/i.test(s)) { volume = true; source.volume = 'override'; }
    else invalid.volume = s;
  }

  return { ratio, min_m, spec, volume, source, invalid };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【物件固有の追加部位行（extra parts）・2026-07-25】
//
//  ■ なぜ定数のoverrideでは足りないのか
//    これまでの override（kiwaneta_* / kaibe_wall_* / stud_height 等）はすべて
//    「エンジンに**行は存在する**が値が物件で違う」ケースを吸収するものだった。
//    ところが物件によっては **行そのものが存在しない部位** がある。
//    実例（第1号）: 別府4丁目 集計表 r10「ｽﾗﾌﾞ下り際根太 H=210」
//      A10 v='ｽﾗﾌﾞ下り際根太 ' f="'Ａタイプ'!B104"   ← 部位名
//      B10 v='H=210'          f="'Ａタイプ'!C104"   ← 規格（際根太本体r9の H110 とは**別材**）
//      C10 v=23.3             f="'Ａタイプ'!$P104"  ← Aタイプ戸当 m
//      X10 = 0 / Y10 {=X10*X$11} = 0                ← **材積換算しない**（m のまま発注）
//      タイプ別戸当: Ａ23.3 Ｂ24.1 Ｃ25.7 Ｄ17.9 Ｅ17.3 Ｆ17.4 Ｇ24.3 Ｈ0 Ｉ0
//      （Ｈ・Ｉは P104=0 ＝ この物件でもタイプによっては部位が存在しない）
//    アルファ側は B10='' / C10=0 ＝ **行そのものが無い**。よって
//    「際根太の規格を H=210 に差し替える」では表現できない（際根太本体と数量も材も別）。
//
//  ■ 設計: 部位名・規格・単位・数量・材積換算の有無を**外から丸ごと与える器**にする
//    スラブ下り際根太**専用**の定数やキーは作らない（将来ほかの物件固有部位が出ても同じ器に載る）。
//    受け口は既存 override と同じ「Overrideテーブル itemKey→value（すべて文字列・1件200字まで）」で、
//    行ごとにインデックスを振った平坦なキーにする（JSON1本にしないのは200字上限と、
//    UIが1項目=1入力欄で素直に作れることを優先したため）:
//      extra_part_1_name    部位名（必須。空なら行は作られない）
//      extra_part_1_qty     数量（必須。**0を指定したら行そのものを出さない**）
//      extra_part_1_unit    単位（既定 'm'）
//      extra_part_1_spec    規格・摘要（任意。例 'H=210'）
//      extra_part_1_category カテゴリ（既定 '下地材'）
//      extra_part_1_volume  材積(m³)行も併せて出すか（既定=出さない。'あり'で出す＋
//                           extra_part_1_volume_m3_per_unit に係数 m³/単位 が必要）
//      extra_part_1_volume_m3_per_unit 材積係数（例 アルファ際根太のX9=0.00135 m³/m）
//    2行目以降は extra_part_2_*, extra_part_3_* … と続ける（EXTRA_PART_MAX_ROWS まで）。
//
//  ■ 「0なら行を出さない」を必須仕様にする理由
//    0mの行は「存在しない材の発注行」になり、拾い出し表と行単位で照合するときに
//    実在しない部位が並ぶ。木胴縁（kaibe_wall_sqm='0'）・際根太材積（kiwaneta_volume='なし'）で
//    既に採った方針と同じ（0で行を残さない）。別府Ｈ・Ｉタイプ（P104=0）がまさにこれに当たる。
//
//  ■ 未指定なら1行も増えない（後方互換）
//    extra_part_* が1つも無ければ resolveExtraParts は空配列を返し、materials は一切変わらない。
const EXTRA_PART_MAX_ROWS = 10;          // 1物件あたりの追加部位行の上限（Override 100件の枠を食い潰さない）
const EXTRA_PART_QTY_MAX = 100000;       // 数量の入力ガード（桁違い入力を弾く。m/㎡/枚/本のいずれでも非現実）
const EXTRA_PART_NAME_MAX_LEN = 60;      // 部位名の桁（資材名列。既存 spec の50字に合わせた運用上限）
const EXTRA_PART_SPEC_MAX_LEN = 50;      // 規格・摘要（kiwaneta_spec と同じ50字）
const EXTRA_PART_UNIT_MAX_LEN = 8;       // 単位（'m' '㎡' '枚' '本' '箇所' 程度）
const EXTRA_PART_CATEGORY_MAX_LEN = 20;  // カテゴリ（'下地材' '造作材' 等）
const EXTRA_PART_DEFAULT_UNIT = 'm';     // 既定の単位（第1号のスラブ下り際根太が m。XLS C列も m）
const EXTRA_PART_DEFAULT_CATEGORY = '下地材';
const EXTRA_PART_VOL_COEF_MAX = 1;       // 材積係数 m³/単位 の上限（際根太0.00135・木胴縁0.0098 に対し十分広い）

/**
 * 物件固有の追加部位行を解決する（2026-07-25）
 *
 * **数量を推定しない**（図面から「この物件にはこの部位がある」と当てるのは不可能）。
 * 人がXLS等を見て指定した値をそのまま行にする転記層であり、係数もモデルも持たない。
 *
 * 【値の検証方針】resolveKiwanetaProfile / resolveKaibeWallSqm と同じ。
 *   数字以外の暗黙除去はしない（'23.3m'→233 の10倍化を起こさない）。
 *   不正値の行は**採用せず**（黙って0や既定値の行を作らない）invalid に積み、
 *   呼び出し側が警告を出せるようにする。
 *
 * @param overrides { [itemKey]: string }
 * @returns { rows: Array<{name, spec, unit, category, quantity, volume, volume_m3_per_unit, index}>,
 *            skipped: Array<{index, name, reason}>, invalid: Array<{index, key, value, reason}> }
 *          rows = 実際に出力する行（数量>0のみ）／skipped = 0指定等で意図的に出さなかった行
 */
export function resolveExtraParts(overrides = {}) {
  const rows = [];
  const skipped = [];
  const invalid = [];

  // 0以上の数値のみ許可（'0' / '23.3' / '.5'）。空文字・null・undefined＝未設定
  const num = (raw, max) => {
    if (raw === null || raw === undefined) return undefined;
    const s = String(raw).trim();
    if (s === '') return undefined;
    const n = /^\d*\.?\d+$/.test(s) ? Number(s) : Number.NaN;
    if (Number.isFinite(n) && n >= 0 && n <= max) return n;
    return { bad: s };
  };
  const str = (raw, maxLen) => {
    if (raw === null || raw === undefined) return undefined;
    const s = String(raw).trim();
    return s === '' ? undefined : s.slice(0, maxLen);
  };

  for (let i = 1; i <= EXTRA_PART_MAX_ROWS; i++) {
    const p = `extra_part_${i}_`;
    const name = str(overrides[`${p}name`], EXTRA_PART_NAME_MAX_LEN);
    const rawQty = overrides[`${p}qty`];
    const hasQty = rawQty !== null && rawQty !== undefined && String(rawQty).trim() !== '';
    // 名前も数量も無い＝この番号は未使用（欠番も許す。UIで途中の行を消しても後続が消えないように）
    if (!name && !hasQty) continue;

    if (!name) {
      invalid.push({ index: i, key: `${p}name`, value: '', reason: '部位名が未入力です' });
      continue;
    }
    const qty = num(rawQty, EXTRA_PART_QTY_MAX);
    if (qty === undefined) {
      invalid.push({ index: i, key: `${p}qty`, value: '', reason: `「${name}」の数量が未入力です` });
      continue;
    }
    if (typeof qty !== 'number') {
      invalid.push({ index: i, key: `${p}qty`, value: qty.bad,
        reason: `「${name}」の数量（${qty.bad}）が数値として読めません` });
      continue;
    }
    // 【0は「行を出さない」の明示指定】別府Ｈ・Ｉタイプ（P104=0＝この部位が存在しない）。
    //   0mの発注行を出すと存在しない材が並ぶため、行ごと作らない（木胴縁0㎡・際根太材積なしと同方針）
    if (qty === 0) {
      skipped.push({ index: i, name, reason: '数量0のため行を出力しません（この物件・タイプには存在しない部位）' });
      continue;
    }

    // 材積(m³)行の併記。既定は「出さない」（第1号の別府スラブ下り際根太はX10=0＝材積換算しない）。
    // 'あり' を指定する場合は係数（m³/単位）が必須。係数が無い/不正なら材積行は作らず本体行だけ出す
    let volume = false;
    let volumeCoef = null;
    const rawVol = overrides[`${p}volume`];
    if (rawVol !== null && rawVol !== undefined && String(rawVol).trim() !== '') {
      const s = String(rawVol).trim();
      if (/^(あり|有|yes|true|1|on)$/i.test(s)) volume = true;
      else if (/^(なし|無|no|false|0|off)$/i.test(s)) volume = false;
      else invalid.push({ index: i, key: `${p}volume`, value: s,
        reason: `「${name}」の材積換算の有無（${s}）が読めないため材積行を出しません` });
    }
    if (volume) {
      const c = num(overrides[`${p}volume_m3_per_unit`], EXTRA_PART_VOL_COEF_MAX);
      if (typeof c === 'number' && c > 0) {
        volumeCoef = c;
      } else {
        volume = false;
        invalid.push({ index: i, key: `${p}volume_m3_per_unit`,
          value: c && c.bad !== undefined ? c.bad : '',
          reason: `「${name}」の材積係数（m³/単位）が未入力または不正のため材積行を出しません` });
      }
    }

    rows.push({
      index: i,
      name,
      spec: str(overrides[`${p}spec`], EXTRA_PART_SPEC_MAX_LEN) || '',
      unit: str(overrides[`${p}unit`], EXTRA_PART_UNIT_MAX_LEN) || EXTRA_PART_DEFAULT_UNIT,
      category: str(overrides[`${p}category`], EXTRA_PART_CATEGORY_MAX_LEN) || EXTRA_PART_DEFAULT_CATEGORY,
      quantity: qty,
      volume,
      volume_m3_per_unit: volumeCoef,
    });
  }

  return { rows, skipped, invalid };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 【壁PB推定パス（展開図なし）の建物種別プロファイル（2026-07-24）】
//
//  ■ 旧実装の何が壊れていたか（調査結果・推測ではない）
//    `wallPbCoeff=1.37` は **アルファステイツ新宮町（新築67戸）Gタイプ実績**が出典:
//      壁PB 6,010枚 ÷ 67戸 ÷ 65.8㎡ = 1.363 枚/㎡（コメントの「90枚/65.8㎡」と一致）
//    その新築係数の上に `WALL_PB_REDUCTION=0.6`（「リノベ=片面のみ」）を掛けていたため、
//    出力 0.822枚/㎡ は**新築でもリノベでもない中間値**だった。
//    0.6 の出自は git de42b9b（2026-07-05「67戸意匠図データ完全反映」）で、
//    同じコミットで `GLASSWOOL_COVERAGE=0.5`（後にM-3で「根拠不明・両物件どちらとも不一致」と
//    判定され撤去済み）が入った**根拠なし定数の一括投入**。0.6を裏づける実績値は
//    リポジトリにもXLSにも存在しない。当時同時に入った旧クランプ [30,90]枚の帯へ
//    値を収めるための調整値だったとみられる（1.37をそのまま使うと67㎡級で90枚＝帯の上端に張り付く）。
//
//  ■ リノベ実績から見た 0.6 の位置（けいとさん資料5現場・CLAUDE.md実績表のPB12.5=壁用）
//    床面積が明記されているのは「3LDK 70㎡=35枚」の1件のみ。他は間取り帯で幅を持つ:
//      3LDK 70㎡    35枚 / 70㎡          = 0.500 枚/㎡（唯一の確定値）
//      朝日パリオ305 40枚 / 2LDK 50〜65㎡ = 0.615〜0.800
//      別物件ミドル   50枚 / 2LDK 50〜65㎡ = 0.769〜1.000
//      目白テラス3A  40枚 / 床面積不明     = 算出不可
//      大型物件      60枚 / 床面積不明     = 算出不可
//    → 実効 0.822枚/㎡（=1.37×0.6）は**この帯（0.50〜1.00）の内側**に収まる。
//      つまり 0.6 は導出の筋は通っていないが、**リノベの出力としては実績帯の中**にある。
//      よってリノベ側は既定を一切変えない（＝精度は現状維持。数値で示す=test-building-type.mjs）。
//
//  ■ 新築側の構造（床面積比では物件を跨げないことの実証）
//    壁PB系の実測（XLS集計表・戸当）を床面積比で見ると:
//      アルファG        1.326 枚/㎡（87.2枚 / 65.76㎡）
//      別府4丁目9タイプ 0.486〜0.845 枚/㎡（mean 0.676）
//    ＝ 同じ「新築マンション住戸」でも **2.7倍**開く。1つの床面積係数では両立不可能で、
//    これは際根太(0.277 vs 0.97〜1.27)・GW(0.095 vs 0.411〜0.775)と同じ**物件依存**パターン。
//    一方、**周長×階高**を分母に取ると分布が締まる（PB系合計＝壁+遮音+耐水+遮音耐水）:
//      別府9タイプ 0.434〜0.547（mean 0.501）／ アルファG 0.614
//      ＝ 2物件・10住戸タイプで 0.434〜0.614（全幅1.41倍。床面積比の2.7倍から大幅改善）
//    壁は「床の広さ」ではなく「壁の長さ×高さ」で発生するので、構造としてこちらが正しい。
//    ※ 別府の周長は正解JSONに無いため巾木から復元した（巾木/周長=0.588。
//      アルファGの実測 巾木56.44m ÷ 展開図実測周長95.97m。巾木は開口と水回りで欠ける分だけ短い）。
//      この復元は近似なので、係数は帯の中央付近に置き、幅は override で吸収させる。
//
//  ■ なぜ「壁 石膏ボード」単独ではなく PB系合計で係数を持つか
//    遮音壁の比率が物件で全く違う（遮音/(壁+遮音)）:
//      アルファG 10% ／ 別府 21〜47%
//    ＝ 同じ壁量でも「一般壁」と「遮音壁」のどちらの行に載るかは**物件の壁種別区分**次第で、
//    床面積からも周長からも一意に決まらない。安定するのは合計側なので、
//    合計を周長から出し、一般壁の取り分（＝1−遮音等の比率）を wall_pb_general_ratio で持つ。
//    既定はアルファ基準（後方互換）。
//
//  ■ 既定を 'renovation' にする理由（後方互換とリスク）
//    既存の保存済みプロジェクトには building_type override が無い。既定を新築にすると
//    **過去の全リノベ案件の壁PBが黙って跳ね上がる**（67㎡級で57→90枚台）。
//    現行の出力はリノベ実績帯（0.50〜1.00枚/㎡）の中にあり実害が出ていないため、
//    既定は据え置き＝'renovation' とし、新築は明示指定で入る（＝オプトイン）。
const WALL_PB_COEFF_RENOVATION = 1.37;   // 枚/㎡（床面積比）。既存値そのまま＝リノベ側の出力を変えない
const WALL_PB_RENOVATION_REDUCTION = 0.6; // 同上（実効 0.822枚/㎡ ＝ リノベ実績帯0.50〜1.00の中）
// 新築: PB系合計 ㎡ = 周長m × 階高m × この係数
const WALL_PB_PERIMETER_COEFF_NEW = 0.55; // 別府0.434〜0.547 / アルファG 0.614 の帯の中央寄り
const WALL_PB_PERIMETER_COEFF_MAX = 2.0;  // 入力ガード（両面全面でも階高比2.0は超えない）
// PB系合計のうち「壁 石膏ボード」行が取る比率。残りは遮音・耐水など他の行が持つ。
//   アルファG実測: 122.061 ÷ (122.061+12.979+6.45) = 0.863
//   別府9タイプ実測: 0.373〜0.654（mean 0.486）＝ 遮音壁の比率が物件で全く違うため
//     （遮音/(壁+遮音): アルファ10% vs 別府21〜47%）。
//   ★この比率は**壁量ではなく物件の壁種別区分**なので図面の面積からは決まらない。
//     周長×階高で出す「PB系合計」の方は2物件で -15%〜+6%（mean -3.6%）に収まるのに対し、
//     一般壁の取り分だけが 0.373〜0.863 と2.3倍開く。よって既定はアルファ基準に置き、
//     他物件は wall_pb_general_ratio で指定する（別府なら '0.486'）。
const WALL_PB_GENERAL_RATIO_ALPHA = 0.863;
// 巾木から周長を復元する比（アルファG実測 56.44m ÷ 95.97m）。
//   周長が直接読めない入力（従来パスは展開図なし＝面幅が無い）でのフォールバック用。
const HABAKI_TO_PERIMETER_RATIO = 0.588;
// 周長/床面積 の下限（実測帯からのフロア）。
//   実測（周長÷床）: アルファA 1.417 / アルファG 1.459（いずれも展開図の面幅実測）、
//   別府9タイプ 1.487〜1.835（巾木÷0.588で復元）。＝ 11住戸タイプで **1.42〜1.84**。
//   一方「間仕切×2+躯体」の再構成はGで 76.1m（=1.157）と帯の下限を大きく割る。
//   間仕切壁延長がAI読み取りで小さめに出る（収納内部・小部屋の壁が落ちる）ためで、
//   これをそのまま新築式に入れると壁PBが構造的に過少になる。
//   → 再構成値が実測帯の下限を割ったら下限で底上げする。**上限側は触らない**
//     （大きい側は間仕切に躯体を含めた読みの可能性があり、既存の層1/層3ガードが受け持つ）。
//   下限は実測min 1.417 をそのまま採る（安全側＝底上げしすぎない）。
//
// 【SF-2: Gタイプ新築 -12.8% の原因は係数 0.55 ではなく「周長の再構成」である】
//   誤解しやすいので明記する。Gの新築評価が -12.8% になるのは、
//     再構成周長 19.8×2+36.5 = 76.1m（＝周長/床 1.157）が実測帯の下限を割り、
//     この下限で 65.76×1.417 = 93.18m へ**底上げされた結果**であって、
//     93.18m は実測周長 95.97m に対して **-2.9%** しかズレていない。
//   つまり残差の主因は「間仕切壁延長のAI読み取りが小さい」＝**入力側**であり、
//   WALL_PB_PERIMETER_COEFF_NEW=0.55 を動かして埋めるべき誤差ではない
//   （比較: Aタイプは間仕切24m指定で再構成 97.8m となり実測97.77mとほぼ一致＝底上げ不発火）。
//   係数を触ると、周長が正しく取れているAタイプ側を巻き添えで狂わせる。
//   なお下限が実測minそのものである以上、**底上げは常に安全側（過少）へ倒れる**
//   （実測帯 1.42〜1.84 の最小値なので、底上げ後の周長が実測を上回ることはない）。
const PERIMETER_PER_FLOOR_MIN = 1.417;

/**
 * 建物種別プロファイルの解決（2026-07-24）
 *
 * **物件種別の推定はしない**（図面から新築/リノベを当てるのは不確実で、外すと壁PBが
 * 1.6倍ずれる）。必ず外から指定させる。未指定は後方互換の 'renovation'。
 *
 * 受け口（overrides = Overrideテーブルの itemKey→value・すべて文字列）:
 *   building_type              'new'|'新築' / 'renovation'|'リノベ'|'リノベーション'|'改修'
 *   wall_pb_perimeter_coeff    新築の周長係数（既定 0.55。別府実測0.434〜0.547・アルファG 0.614）
 *   wall_pb_general_ratio      PB系合計のうち一般壁行の取り分（既定 0.863＝アルファG実測）
 *
 * @param overrides { [itemKey]: string }
 * @returns { type, perimeter_coeff, general_ratio, source, invalid }
 */
export function resolveBuildingTypeProfile(overrides = {}) {
  const source = { type: 'default', perimeter_coeff: 'default', general_ratio: 'default' };
  const invalid = {};

  // 0より大きい数値のみ許可。resolveKiwanetaProfile と同じ方針で暗黙の文字除去はしない
  //   （'0.55'→55 の100倍化や '-0.5'→0.5 の符号反転を起こさないため）
  const num = (raw, max) => {
    if (raw === null || raw === undefined) return undefined;
    const s = String(raw).trim();
    if (s === '') return undefined;
    const n = /^\d*\.?\d+$/.test(s) ? Number(s) : Number.NaN;
    if (Number.isFinite(n) && n > 0 && n <= max) return n;
    return { bad: s };
  };

  let type = 'renovation'; // 既定＝後方互換（既存プロジェクトの出力を変えない）
  const rawT = overrides.building_type;
  if (rawT !== null && rawT !== undefined && String(rawT).trim() !== '') {
    const s = String(rawT).trim();
    if (/^(new|新築|新築工事)$/i.test(s)) { type = 'new'; source.type = 'override'; }
    else if (/^(renovation|reno|リノベ|リノベーション|改修|リフォーム)$/i.test(s)) {
      type = 'renovation'; source.type = 'override';
    } else invalid.type = s;
  }

  let perimeter_coeff = WALL_PB_PERIMETER_COEFF_NEW;
  const pc = num(overrides.wall_pb_perimeter_coeff, WALL_PB_PERIMETER_COEFF_MAX);
  if (typeof pc === 'number') { perimeter_coeff = pc; source.perimeter_coeff = 'override'; }
  else if (pc) invalid.perimeter_coeff = pc.bad;

  let general_ratio = WALL_PB_GENERAL_RATIO_ALPHA;
  const gr = num(overrides.wall_pb_general_ratio, 1.0);
  if (typeof gr === 'number') { general_ratio = gr; source.general_ratio = 'override'; }
  else if (gr) invalid.general_ratio = gr.bad;

  return { type, perimeter_coeff, general_ratio, source, invalid };
}

/**
 * 壁の総延長（周長）m を解決する。
 *   優先順位: ①展開図の面幅合計（最も確か・実測）> ②間仕切×2+躯体（従来パスの壁面積の分解）
 *   ③巾木推定からの復元（最後の手段）
 * 新築の壁PB推定は「周長×階高」なので、周長をどこから採るかで精度が決まる。
 * @returns {{ perimeter_m:number, source:string }}
 */
export function resolveWallPerimeterM({
  elevationPerimeterM, partitionWallLengthM, structuralWallLengthM, habakiM, floorAreaSqm,
}) {
  const pos = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const ev = pos(elevationPerimeterM);
  // 展開図の面幅合計は実測なので、下限の底上げは掛けない（実測を推定で書き換えない）
  if (ev > 0) return { perimeter_m: ev, source: 'elevation', floored: false };

  // 展開図なし: 部屋を1周する線の長さ＝間仕切は両側の部屋から2回数えられ、躯体は1回。
  //   従来パスの wallArea = 間仕切×CH×2 + 躯体×CH×1 と同じ分解（＝既存の壁面積と整合する）。
  const part = pos(partitionWallLengthM), st = pos(structuralWallLengthM);
  const hb = pos(habakiM);
  let raw = 0, source = 'none';
  if (part > 0 || st > 0) { raw = part * 2 + st; source = 'partition_structural'; }
  else if (hb > 0) { raw = hb / HABAKI_TO_PERIMETER_RATIO; source = 'habaki'; }

  // 再構成値が実測帯の下限を割ったら底上げ（PERIMETER_PER_FLOOR_MIN のコメント参照）
  const floor = pos(floorAreaSqm);
  const minPerim = floor * PERIMETER_PER_FLOOR_MIN;
  if (minPerim > 0 && raw < minPerim) {
    return { perimeter_m: minPerim, source: raw > 0 ? `${source}_floored` : 'floor_area_min', floored: true };
  }
  return { perimeter_m: raw, source, floored: false };
}

export function calculateMaterials(aiReading, packageSpecs, overrides = {}) {
  // aiReadingがnull/undefined/空の場合のガード
  if (!aiReading) {
    return {
      materials: [],
      summary: {
        totalFloorArea: 0,
        flooringArea: 0,
        cfArea: 0,
        tileArea: 0,
        wallArea: 0,
        ceilingArea: 0,
        doorCount: 0,
        windowCount: 0,
        partitionWallLength: 0,
        structuralWallLength: 0,
        wall_pb_sqm: 0,
        wall_pb_sheets: 0,
        waterproof_pb_sqm: 0,
        waterproof_pb_sheets: 0,
        ev_wall_pb_sqm: 0,
        ev_wall_pb_sheets: 0,
        sound_wall_pb_sqm: 0
      }
    };
  }

  let data;
  try {
    data = typeof aiReading === 'string' ? JSON.parse(aiReading) : aiReading;
  } catch (e) {
    console.error('Failed to parse aiReading:', e);
    data = {};
  }

  const materials = [];
  // 計算由来の要確認警告（天井PBの面積水増しガード等）。返却オブジェクトの _warnings に載せ、
  // routes/projects.js が source:'calculate' として AiReading.parsedData._warnings へマージ・永続化する。
  const calcWarnings = [];

  // 天井高 (デフォルト2400mm)
  // フロントエンドから "2400mm" 形式で送られるため、数値部分を抽出
  let ceilingHeightMm = data.ceiling_height_mm || 2400;
  if (overrides.ceiling_height) {
    const parsed = parseInt(overrides.ceiling_height.replace(/[^0-9]/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      ceilingHeightMm = parsed;
    }
  }
  const ceilingHeight = ceilingHeightMm / 1000;

  // 部屋データを集計
  const rooms = data.rooms || [];
  const openings = data.openings || [];

  // 床面積の計算
  let flooringArea = 0; // フローリング用（居室）
  let cfArea = 0; // CF用（水回り）
  let tileArea = 0; // タイル用（玄関等）
  let totalFloorArea = 0; // 総床面積

  rooms.forEach(room => {
    const area = room.area_sqm || (room.area_tsubo ? room.area_tsubo * 3.306 : 0);
    totalFloorArea += area;

    if (room.name?.includes('クローゼット') || room.name?.includes('クロゼット') || room.name?.includes('WIC') || room.name?.includes('CL') || room.name?.includes('収納') || room.name?.includes('物入')) {
      // 収納の床仕上げは「一部置床」として別計上（プロの拾いではフローリングに含めない）
      // totalFloorAreaには算入済み（面積・天井計算用）
    } else if (room.floor_type === 'flooring' || room.name?.includes('LDK') || room.name?.includes('洋室') || room.name?.includes('リビング') || room.name?.includes('廊下') || room.name?.includes('ホール')) {
      flooringArea += area;
    } else if (room.floor_type === 'cf' || room.name?.includes('洗面') || room.name?.includes('トイレ') || room.name?.includes('UB') || room.name?.includes('浴室') || room.name?.includes('脱衣') || room.name?.includes('パウダー')) {
      cfArea += area;
    } else if (room.floor_type === 'tile' || room.name?.includes('玄関')) {
      tileArea += area;
    } else {
      flooringArea += area; // デフォルトはフローリング
    }
  });

  // 部屋面積合計の生値（専有面積による補填で totalFloorArea を書き換える前に退避）。
  // 天井PBのサニティ（後述）で「信頼できる分母」として使う: AIが外形寸法を誤読して
  // total_floor_area_sqm を過大に返しても、個々の部屋面積の合計は物理的な実測に近い。
  const roomsSumArea = totalFloorArea;

  // 専有面積（validatorが確定した値・ユーザー入力優先）を数量計算の基礎に反映する
  // ※ AIが部屋を拾い落として部屋合計が専有面積より小さい場合、居室・天井が過小になる。
  //   不足分は「専有面積×0.96（内法相当）」までを居室床として補い、天井もそれに追従させる。
  //   部屋合計の方が大きい場合はvalidatorの按分補正済みなので触らない。
  const declaredArea = data.total_floor_area_sqm || 0;
  const netTarget = declaredArea > 0 ? declaredArea * 0.96 : 0;
  // 拾い落ち補填で足した面積（＝部屋ラベルの無い区画）。天井PBの控除に使うため退避する。
  let unlabeledFillArea = 0;
  if (netTarget > totalFloorArea && totalFloorArea > 0) {
    const shortfall = netTarget - totalFloorArea;
    flooringArea += shortfall; // 拾い落ちは廊下・居室など内装対象が大半
    unlabeledFillArea = shortfall;
    totalFloorArea = netTarget;
  } else if (totalFloorArea === 0 && netTarget > 0) {
    // 部屋を1つも拾えなかった場合は専有面積ベースで最低限の内装面積を確保
    flooringArea = netTarget;
    unlabeledFillArea = netTarget;
    totalFloorArea = netTarget;
  }

  // ── 信頼できる床面積 sanityBase（部位横断の共通分母・2026-07-24 に天井PBガードから
  //    ここへ**巻き上げ**。壁PB/耐水PB/巾木/GWの比率型サニティも同じ分母を使うため、
  //    選び方の重複実装を作らない。ロジックは天井PB導入時（41155a2）のものを変更していない）
  //
  //  選び方の根拠（誤発火の防止が最重要）:
  //   - total_area_source が検証済み（ユーザー入力/ラベル×部屋合計整合/寸法整合）→ declaredArea を分母に。
  //     部屋の拾い落ち補填で各部位の面積が room合計を上回るのは正常なので、信頼済み時に roomsSumArea を
  //     分母にすると誤発火する（validator確定値はそのまま信頼する）。
  //   - 未検証・外形寸法誤読・sourceなしの従来パスでは declaredArea が誤読で水増しされうる。ただし
  //     ここで無条件に roomsSumArea を分母にすると、AIが一部の部屋しか拾えていない正常な拾い落ち
  //     （例: total=65.76㎡が正しいのに rooms合計30㎡）で誤発火してしまう。
  //     そこで「declaredArea が住戸として物理的に妥当な大きさ(≤PLAUSIBLE_MAX_FLOOR_SQM)なら
  //     declaredArea を信頼し、非現実的に大きい場合だけ誤読とみなして roomsSumArea へ切り替える」。
  //     住戸1戸の内法床は既知最大でも別府I≈117㎡どまり → 150㎡超は外形寸法誤読と判断できる。
  const TRUSTED_AREA_SOURCES = ['user_input', 'ai_label_roomsum_verified', 'ai_estimate_verified'];
  const areaSourceTrusted = TRUSTED_AREA_SOURCES.includes(data.total_area_source);
  const PLAUSIBLE_MAX_FLOOR_SQM = 150; // 住戸1戸の内法床の物理上限目安（既知最大 別府I≈117㎡の1.3倍弱）
  let sanityBase;
  if (areaSourceTrusted) {
    sanityBase = declaredArea > 0 ? declaredArea : roomsSumArea;
  } else if (declaredArea > 0 && declaredArea <= PLAUSIBLE_MAX_FLOOR_SQM) {
    sanityBase = declaredArea; // 妥当な大きさの専有面積は未検証でも分母として信頼する（誤発火防止）
  } else {
    sanityBase = roomsSumArea > 0 ? roomsSumArea : declaredArea; // 非現実的なdeclared=誤読 → 部屋実測へ
  }

  // ── 層0: 床面積そのものの「物理的にありえない大きさ」の抑制（2026-07-24 must-fix M-4）──
  //
  //  【なぜ層1だけでは足りないか】層1（floor_area_inflated）は
  //    「数量計算に使う床面積 vs 信頼できる床面積(sanityBase)」という**相対比**の検査で、
  //    2つの独立した根拠（部屋面積の合計／専有面積の転記）を突き合わせて矛盾を捕まえる仕組み。
  //    ところが根拠が**片方しか無い**とき sanityBase は検査対象**自身**になり、比が常に≈1.0で
  //    構造的に発火できない（レビュー M-4）:
  //      ・roomsSumArea=0（部屋を1つも拾えず declared のみ）→ sanityBase = declaredArea
  //      ・declaredArea=0（専有面積の入力なし・total読めず）→ sanityBase = roomsSumArea
  //    実測（撤去直後の回帰）: 部屋合計200㎡誤読+専有未入力で 壁PB165枚/巾木164m、
  //    declared=1000㎡なら 壁PB790枚/巾木788m が**警告ゼロ**で出ていた。
  //    ケース前者は「専有面積は任意入力（ゲスト運用の既定は未入力）＋AIの部屋面積誤読」だけで
  //    到達する＝ユーザーの誤操作を必要としない。
  //
  //  【対処】相対比が使えないときは**別の根拠**＝物理的な絶対上限で判定する。
  //    住戸1戸の内法床は既知最大でも別府I≈117㎡（本エンジンが扱う分譲マンション住戸の実測）。
  //    PLAUSIBLE_MAX_FLOOR_SQM(150) はまさに「これを超えたら外形寸法の誤読」という判断で、
  //    上の sanityBase 選択でも同じ意味で使っている定数なのでそのまま流用する。
  //    ※ 意味の二重化はしていない: 上は「declaredを分母として信頼してよいか」、
  //      ここは「採用した床面積が住戸としてありえるか」で、**同一の物理判断の別の適用先**。
  //      別府I(117㎡)・別府H(107.6㎡)は 150 の内側なので実在物件は一切弾かれない。
  //
  //  【安全側の設計】150㎡を超えたときも 150 へ丸めるだけ（0にしない・計算は続行する）。
  //    利用者には警告で「専有面積を入力すれば正しくなる」ことを伝える。
  //    また is-a-trusted-source（ユーザーが自分で150㎡超を入力した）ケースは**抑制しない**:
  //    人が明示入力した値まで機械が握り潰すと、大型住戸・二戸一等の正当な入力を壊すため
  //    （その場合は警告のみ出して数量は入力どおりにする）。
  const floorAreaImplausible = sanityBase > PLAUSIBLE_MAX_FLOOR_SQM;
  if (floorAreaImplausible && areaSourceTrusted) {
    // ユーザー入力/検証済みの値が150㎡超 → 数量は入力を尊重し、警告だけ出す（書き換えない）
    calcWarnings.push({
      field: 'floor_area_implausible_trusted',
      message: `床面積(${sanityBase.toFixed(1)}㎡)が住戸1戸の想定上限${PLAUSIBLE_MAX_FLOOR_SQM}㎡を超えています`
        + '（入力値・検証済みの転記値のため数量は書き換えていません）。'
        + '複数住戸をまとめた図面・専有面積の入力誤りでないかご確認ください',
      before: null,
      after: Math.round(sanityBase * 10) / 10,
    });
  } else if (floorAreaImplausible) {
    // 未検証の床面積が物理上限超 → 上限へ丸めてから層1へ渡す（層1の縮小係数もこの値基準になる）
    calcWarnings.push({
      field: 'floor_area_implausible',
      message: `数量計算に使う床面積(${sanityBase.toFixed(1)}㎡)が住戸1戸の想定上限`
        + `${PLAUSIBLE_MAX_FLOOR_SQM}㎡を超えています（外形寸法・部屋面積の誤読の可能性）。`
        + `${PLAUSIBLE_MAX_FLOOR_SQM}㎡で抑制しました。専有面積を入力すると正しく算出できます`,
      before: Math.round(sanityBase * 10) / 10,
      after: PLAUSIBLE_MAX_FLOOR_SQM,
    });
    sanityBase = PLAUSIBLE_MAX_FLOOR_SQM;
  }

  // ── 床面積の水増し是正（層1・2026-07-24 must-fix M-1で「全部位が同じ基準になる」方式へ再設計）──
  //
  //  【旧実装の欠陥】旧版は sanityFloorArea という**別変数**を作り、壁PB・巾木だけがそれを使い、
  //    天井PB・フローリング・際根太・垂木などは totalFloorArea / ceilingArea / flooringArea の
  //    ままだった。結果、発火時に「壁PB・巾木は65㎡基準／天井PB・フローリングは85㎡基準」という
  //    **同一図面で基準が食い違う見積**が出る（レビューM-1の再現ケース）。
  //    また旧コメントは「この分岐は発火しない」と書いていたが誤り。637-645の補填は
  //    netTarget > totalFloorArea のときだけ totalFloorArea を書き換えるので、
  //    roomsSumArea が declared×0.96 を超えていれば totalFloorArea は roomsSum のまま残る。
  //    aiReadingValidator:229-241 の按分縮小は**ラベル付き部屋を縮小しない**（かつscale下限0.5）ため、
  //    「ユーザー入力65㎡ vs ㎡ラベル部屋合計85㎡」は正規経路で普通に残存する。
  //
  //  【新実装】是正は「部位の出力」ではなく**部位の入力である床面積そのもの**に1回だけ掛ける。
  //    床面積由来の値（totalFloorArea / flooringArea / cfArea / tileArea）を同じ係数で一括縮小し、
  //    以降の全部位（天井・フローリング・際根太・垂木・壁PB・巾木…）が自動的に同じ基準になる。
  //    ＝部位ごとの上限帯を持たなくても全部位が同時に守られる（部位を跨げる唯一の層）。
  const FLOOR_AREA_MAX_RATIO = 1.25; // 読み取りの揺れ（拾い落ち補填0.96・内法/壁芯差）を吸収した閾値
  //  ※ 層0で sanityBase を物理上限へ丸めた場合は、許容比(1.25)を挟まず**必ず**是正する。
  //    150㎡は「読み取りの揺れ」ではなく物理的にありえない値なので、150×1.25=187.5㎡までを
  //    見逃す余地を残してはいけない（例: 部屋合計165㎡の誤読が素通りする穴になる）。
  const floorAreaInflated = sanityBase > 0
    && (totalFloorArea > sanityBase * FLOOR_AREA_MAX_RATIO
      || (floorAreaImplausible && !areaSourceTrusted && totalFloorArea > sanityBase));
  // 是正係数（<1）。**部屋データの生値に対する**縮小率なので分母は roomsSumArea を使う。
  //   （totalFloorArea は拾い落ち補填で netTarget に置き換わっていることがあり、
  //     それを分母にすると UB・収納の控除だけが過剰に縮む＝天井面積が過大になる）
  const inflationScale = (floorAreaInflated && roomsSumArea > 0)
    ? Math.min(1, sanityBase / roomsSumArea) : 1;
  if (floorAreaInflated) {
    const before = totalFloorArea;
    // 床の内訳（居室/水回り/土間）を按分縮小する。
    //   ※ flooringArea には拾い落ち補填分（netTarget − roomsSum）が乗っていることがあるが、
    //     水増しと判定した以上その補填は根拠を失うので先に落とす。
    //   ※ 収納（クロゼット等）は totalFloorArea には入るが3バケットのどれにも入らないため、
    //     3バケットの合計は sanityBase より小さいのが正常（合計を sanityBase に合わせない）。
    flooringArea = Math.max(0, flooringArea - Math.max(0, netTarget - roomsSumArea)) * inflationScale;
    cfArea *= inflationScale;
    tileArea *= inflationScale;
    // 補填分も同じ理由で取り消す（＝天井PBの「ラベル無し区画」控除も無効化する）。
    //   これを残すと、水増し是正で totalFloorArea が部屋実測(sanityBase)まで縮んだ後も
    //   「誤読した総面積 − 部屋実測」ぶんの控除が効き続け、天井面積が大幅な過少になる
    //   （実測: total誤読200㎡・部屋実測65㎡で ceilingArea 65→11.7㎡・天井PB 45→9枚）。
    //   縮小後の totalFloorArea は部屋実測そのもので、ラベル無し区画は含まれていない。
    unlabeledFillArea = 0;
    totalFloorArea = sanityBase;
    calcWarnings.push({
      field: 'floor_area_inflated',
      // 【M-1】旧文言は before/after と説明が逆だった（sanityBase を「部屋面積の合計」と
      //   決め打ちしていたが、実際は信頼できる床面積＝ユーザー入力の専有面積であることが多い）。
      //   分母の出どころを sanityBase の選ばれ方から明示する。
      message: `数量計算に使う床面積(${before.toFixed(1)}㎡)が信頼できる床面積(${sanityBase.toFixed(1)}㎡`
        + `・${areaSourceTrusted ? '専有面積の入力/検証済みの転記値' : '部屋面積の合計'})に対し過大です`
        + '（外形寸法の誤読・部屋面積の読みすぎの可能性）。'
        + `全部位を${sanityBase.toFixed(1)}㎡ベースで算出しました。専有面積を正しく入力すると改善します`,
      before: Math.round(before * 10) / 10,
      after: Math.round(sanityBase * 10) / 10,
    });
  }

  // 天井面積 (UB・CLを除く)
  //  ※ UB・収納の面積は部屋データの生値なので、床面積を縮小した場合は同じ係数で揃える
  //    （縮小後の totalFloorArea から生値の ubArea を引くと控除が過大になるため）
  const ubArea = rooms.filter(r => r.name?.includes('UB') || r.name?.includes('浴室')).reduce((sum, r) => sum + (r.area_sqm || 0), 0) * inflationScale;
  const closetArea = rooms.filter(r => r.name?.includes('クローゼット') || r.name?.includes('クロゼット') || r.name?.includes('CL') || r.name?.includes('収納') || r.name?.includes('物入')).reduce((sum, r) => sum + (r.area_sqm || 0), 0) * inflationScale;
  // 建物種別プロファイル（壁PBの式の選択と、直下の天井PB控除の適用条件に使う）。
  //   種別は**推定せず** overrides.building_type で外から与える。既定は後方互換の 'renovation'。
  //   設計根拠は resolveBuildingTypeProfile のブロックコメント。
  //   ※ 警告の push は壁PBのブロック（下方）で行う（重複して積まないため）。
  const buildingProfile = resolveBuildingTypeProfile(overrides);

  // ── 拾い落ち補填分（部屋ラベルの無い区画）の天井PB対象外control ────────────────
  // 【問題】上の ubArea/closetArea 控除は「AIがUB・収納を部屋として拾えた場合」しか効かない。
  //   実際の平面詳細図では UB・押入・PS・MB に㎡ラベルが無いことが多く、AIは居室しか返さない。
  //   その場合 netTarget(専有×0.96) との差が丸ごと unlabeledFillArea として床に足され、
  //   控除ゼロのまま天井面積になる＝UB・収納・PSの天井までPBを張ることになり過大。
  //
  // 【XLSの拾い構造（①A~F.XLS / ②G.XLS の集計表77行を、参照先のタイプ別シートまで辿って確認）】
  //   集計表C77 = 'Ａタイプ'!P45+P154+P208+P260+P309+P364+P418
  //     = 玄関・廊下4.833 + 洋室(1)+CL 11.150 + 洋室(2)+CL 9.034 + 洋室(3)+CL 8.477
  //       + LDK 22.950 + 便所1.330 + 洗面所3.233 = 61.007㎡
  //   ＝ 居室・廊下・便所・洗面の天井は拾うが、**UB・押入・PSの天井は拾わない**
  //     （押入ブロックには専用行「押入天井」(Ａタイプ!P464)が別に在り、値0＝C77の参照に含まれない）。
  //   これは「UBは天井ユニット同梱・押入とPSはPBを張らない」という実務仕様に対応する。
  //
  // 【控除量の出所（答え合わせではなく面積表からの導出）】
  //   意匠図page_12の面積表（内法）と各タイプの天井PB実測（XLS集計表77行）から、
  //   「内法面積 − 天井PB面積」＝ UB・押入・PS等の**天井対象外面積の実測**を求めると:
  //     Aタイプ 68.00−61.007=6.993 ／ Gタイプ 64.80−59.087=5.713
  //     Bタイプ 64.80−60.122=4.678 ／ Cタイプ 64.80−59.904=4.896
  //     Dタイプ 64.80−60.292=4.508 ／ Eタイプ 64.80−60.040=4.760
  //   ＝ 6タイプで **4.51〜6.99㎡（平均5.258㎡）** の狭い帯に収まる。
  //
  // 【なぜ「比率」ではなく「絶対量」で持つのか（2026-07-25 MF-1 で設計変更）】
  //   旧実装は「補填分 × 0.42」という**比率**で控除していたが、これは2つの理由で破綻していた:
  //
  //   (a) 対象外面積は UB・押入・PS という**実在する区画の実寸**であって、
  //       「AIが何㎡拾い落としたか」には比例しない。補填分が大きいほど UB が広くなる
  //       わけではない。実際 rooms:[]（部屋を1つも拾えない）だと補填分＝床面積全体になり、
  //       控除が 62.40×0.42＝26.2㎡ まで膨張して天井PBが 45→25枚（-43%）に退行していた。
  //   (b) 上の実測帯は**内法全体**から引いた値なので、UB も押入も**すでに含んでいる**。
  //       そこへ ubArea/closetArea の明示控除を重ねると同じ区画を二重に引く。
  //       （導出に使ったA・Gの両ケースはたまたま ubArea=closetArea=0 だったため、
  //         導出時には二重控除が表面化せず、実運用でUB・CLがラベル付きで拾えたときだけ
  //         発火する潜伏バグになっていた。実測: 補填分19.1㎡で8.03㎡の重複控除＝-16%）
  //
  //   → 控除は「対象外面積の実測平均 5.258㎡ から、**すでに ubArea/closetArea で引いた分を差し引いた残り**」
  //     とする。UB・収納をAIが拾えていれば控除は自動的に小さくなり（二重控除の解消）、
  //     1つも拾えていなければ 5.258㎡ 全量を引く（従来の狙いどおり）。
  //   → さらに上限を「補填分」に置く。ラベルのある居室の天井はXLS実測どおり㎡ラベルと
  //     ほぼ一致する（Aタイプ: ラベル5室51.94㎡ vs XLS同5室天井51.61㎡＝比0.9937）ので、
  //     **拾えている部屋の天井を削ってはいけない**。
  //
  // 【検算（導出に使った2タイプで再現すること・数式はそのまま計算して合う）】
  //   Aタイプ: netTarget 71.90×0.96=69.024 ／ ラベル5室合計 51.940（atype_ground_truth.json）
  //     → 補填分 69.024−51.940=17.084、控除 min(5.258−0−0, 17.084)=5.258
  //     → 天井 69.024−5.258=63.766 ㎡（XLS実測 61.007 に対し +4.5%）
  //   Gタイプ: netTarget 66.70×0.96=64.032 ／ ラベル8室合計 50.970（gtype_parsedData.json）
  //     → 補填分 64.032−50.970=13.062、控除 min(5.258−0−0, 13.062)=5.258
  //     → 天井 64.032−5.258=58.774 ㎡（XLS実測 59.087 に対し −0.5%）
  //   ※ 旧コメントは A を「(69.02−61.007)/16.39=0.4267」と書いていたが、実際に計算すると
  //     0.4889 であり、分母16.39も netTarget−ラベル合計＝17.084 と一致しない（＝再現不能な記述だった）。
  //     絶対量モデルは上記のとおり原典セル（内法面積表・XLS天井実測）から直接導出でき、
  //     両タイプとも実際に計算して合う。
  //
  // 【物件依存であること】この帯はアルファステイツ新宮町の実測。他物件（別府等）で外れる場合に備え
  //   overrides.unlabeled_non_ceiling_sqm で差し替え可能。**'0' を指定すると控除を完全に無効化**できる
  //   （UB・PSまで天井PBを張る物件・すでに全区画がラベル付きで拾えている場合の逃げ道）。
  const UNLABELED_NON_CEILING_SQM_DEFAULT = 5.258; // A〜Gタイプ6件の実測平均（4.51〜6.99の帯）
  const UNLABELED_NON_CEILING_SQM_MAX = 30;        // 入力ガード（住戸1戸のUB+押入+PSが30㎡を超えることはない）
  const unlabeledNonCeilingSqm = (() => {
    const raw = overrides.unlabeled_non_ceiling_sqm;
    if (raw === null || raw === undefined || String(raw).trim() === '') return UNLABELED_NON_CEILING_SQM_DEFAULT;
    const s = String(raw).trim();
    // 暗黙の文字除去はしない（'-5'→5 の符号反転や '5m'→5 の桁化を防ぐ。他のoverrideと同じ方針）
    const n = /^\d*\.?\d+$/.test(s) ? Number(s) : Number.NaN;
    if (Number.isFinite(n) && n >= 0 && n <= UNLABELED_NON_CEILING_SQM_MAX) return n;
    calcWarnings.push({
      field: 'unlabeled_non_ceiling_sqm_invalid',
      message: `ラベル無し区画の天井対象外面積の指定値（${s}）が不正のため既定の`
        + `${UNLABELED_NON_CEILING_SQM_DEFAULT}㎡を使用しました`
        + `（0以上${UNLABELED_NON_CEILING_SQM_MAX}以下の㎡で入力してください。0で控除を無効化できます）`,
      before: s,
      after: UNLABELED_NON_CEILING_SQM_DEFAULT,
    });
    return UNLABELED_NON_CEILING_SQM_DEFAULT;
  })();
  // 【控除を適用する条件（3つすべてを満たすときのみ）】
  //
  //  ① building_type === 'new'（新築指定）であること。
  //     この控除の根拠（内法面積表・XLS天井実測・「UBは天井ユニット同梱／押入・PSはPBを張らない」）は
  //     **すべてアルファステイツ新宮町＝新築の拾い構造**から来ている。リノベの実績側には
  //     「UB・押入の天井を拾わない」ことを示すデータが1件も無い（けいとさん資料の天井CLは
  //     52〜75㎡で内訳不明）。根拠の無い既定パスに控除を効かせると、既存の保存済みプロジェクト
  //     （building_type override を持たない＝全件リノベ既定）の天井PBが黙って4枚前後下がる。
  //     壁PB側と同じ方針＝**新築はオプトイン、リノベ既定は1枚も変えない**に揃える。
  //     ※ 検証: 旧実装との総当たり差分で天井PB系の退行0件（scripts/test-ceiling-unlabeled.mjs）。
  //
  //  ② 補填分が実在する（unlabeledFillArea > 0）こと。補填が無い＝全区画がラベル付きで
  //     拾えているので、引くべき「ラベルの無い区画」は存在しない。
  //
  //  ③ **部屋を1つ以上拾えている**こと（roomsSumArea > 0）。
  //     rooms:[] は「この住戸にUB・PSがある」という根拠が図面側に1つも無い状態であり、
  //     そこで対象外面積を差し引くのは推定の上に推定を重ねることになる
  //     （旧比率モデルではここが最悪の退行点だった: 控除26.2㎡・天井PB 45→25枚＝-43%）。
  //     部屋が1つも無い時点で既に精度は保証外なので **安全側＝控除せず** に倒し、
  //     既存の ceiling_pb_area_small 等の警告に判断を委ねる。
  const hasRoomEvidence = roomsSumArea > 0;
  // すでに ubArea/closetArea で引いた分を相殺し（二重控除の防止）、残りを補填分の範囲内で引く。
  //   ※ ubArea/closetArea には inflationScale が適用済みなので、控除量も同じ土俵で比較する。
  const unlabeledNonCeilingArea = (buildingProfile.type === 'new' && hasRoomEvidence && unlabeledFillArea > 0)
    ? Math.max(0, Math.min(
      unlabeledNonCeilingSqm - ubArea - closetArea, // 未控除の残りだけを引く
      unlabeledFillArea * inflationScale,           // ラベルのある居室の天井は削らない
    ))
    : 0;
  let ceilingArea = totalFloorArea - ubArea - closetArea - unlabeledNonCeilingArea;
  // 天井面積が0以下の場合、床面積の90%として推定（最低50㎡）
  if (ceilingArea <= 0) {
    ceilingArea = totalFloorArea > 0 ? totalFloorArea * CEILING_AREA_RATIO : 50;
  }

  // 壁延長の計算
  // ユーザーの上書き入力 > AIが直接出力した間仕切壁延長
  const partitionWallOverride = parseFloat(overrides.partition_wall_length);
  const hasPartitionWallOverride = !isNaN(partitionWallOverride) && partitionWallOverride > 0;
  let partitionWallLength = hasPartitionWallOverride
    ? partitionWallOverride
    : (data.partition_wall_length_m || 0);

  // AIから壁延長が取得できない場合、床面積から推定
  // 実績データ: 2LDK(50㎡)=約20m, 3LDK(70㎡)=約30m
  if (partitionWallLength === 0) {
    partitionWallLength = totalFloorArea * PARTITION_WALL_RATIO;
  }

  // 間仕切壁延長の妥当性チェック
  // ※ aiReadingValidator で検証済み（_validated=true）の場合は二重補正しない
  // ※ ユーザーが上書き入力した値はそのまま採用（クランプしない）
  // AIが躯体壁（外周壁）を含めて計算している場合、値が大きすぎる
  // 実績: 2LDK(50㎡)=15-25m, 3LDK(70㎡)=20-30m
  if (!data._validated && !hasPartitionWallOverride) {
    const maxPartitionWallLength = totalFloorArea * PARTITION_WALL_MAX_RATIO;
    const minPartitionWallLength = totalFloorArea * PARTITION_WALL_MIN_RATIO;

    if (partitionWallLength > maxPartitionWallLength && totalFloorArea > 0) {
      console.log(`間仕切壁延長を補正: ${partitionWallLength}m → ${maxPartitionWallLength}m (AIが躯体壁を含めた可能性)`);
      partitionWallLength = maxPartitionWallLength;
    }
    if (partitionWallLength < minPartitionWallLength && totalFloorArea > 0) {
      console.log(`間仕切壁延長を補正: ${partitionWallLength}m → ${minPartitionWallLength}m (最小値)`);
      partitionWallLength = minPartitionWallLength;
    }
  }

  // 躯体壁（外周壁）の延長を推定
  // リノベでは躯体壁にもクロスを貼る（GL工法で片面のみ）
  // マンションの外周 ≒ sqrt(床面積) × 4.5 として推定（長方形の部屋が多いため補正）
  // 7現場実績: 壁クロス187～270㎡を満たすよう調整
  let structuralWallLength = Math.sqrt(totalFloorArea) * 4.5;

  // 開口部の面積と幅を計算
  let doorCount = 0;
  let windowCount = 0;
  let totalOpeningWidth = 0;

  // 窓判定は buildupCalculator.js の isWindow を import（isOpeningWindow 別名）して共有。
  // 二重実装・判定不一致（type.includes('aw')の誤爆）を解消。

  // 建具の型番はプロンプト改定で語彙が変わりうるため、
  // 「窓」でないもの＝建具（ドア類）として扱う（片開き戸/片引き戸/引違い戸/折戸すべてを拾う）
  openings.forEach(opening => {
    if (isOpeningWindow(opening)) {
      // 窓（type=窓/サッシ/AW、または符号 AW/AWD/W-数字）は isOpeningWindow が符号でも判定する
      windowCount++;
    } else if (opening.type) {
      // ドア扱いは type のある開口のみ（2026-07-22 Fix5）。
      // symbolだけの開口を安易にドア化しない: 現状 top-level openings スキーマに symbol は無く発火しないが、
      // 将来プロンプト改定で建具符号が top-level に転記されると、type空でsymbolだけの行を幅800mm既定で
      // ドアカウント＋巾木控除に加算してしまい二重/誤カウントになる余地があった（旧 `opening.type || opening.symbol`）。
      // 窓符号は上の isOpeningWindow で拾い済みなので、ここを type 限定に戻しても窓は取りこぼさない。
      // symbol でドア化したくなった場合は、既知の建具符号パターン（WD/SD 等・isWindow の逆）に限定すること。
      doorCount++;
      totalOpeningWidth += (opening.width_mm || 800) / 1000;
    }
  });

  // 建具数が不足している場合、間取りから推定
  // 7現場実績: 1LDK=7枚, 2LDK=10枚, 3LDK=15枚
  if (doorCount === 0) {
    const layoutType = data.layout_type || '';
    if (layoutType.includes('3LDK')) {
      doorCount = 15;
    } else if (layoutType.includes('2LDK')) {
      doorCount = 10;
    } else if (layoutType.includes('1LDK')) {
      doorCount = 7;
    } else {
      doorCount = Math.max(rooms.length + 2, 5);
    }
    totalOpeningWidth = doorCount * DOOR_WIDTH_DEFAULT;
  }

  const openingArea = doorCount * DOOR_OPENING_AREA + windowCount * WINDOW_OPENING_AREA;

  // 壁面積の計算
  // 間仕切壁: 両面にボードを貼る（係数2）
  // 躯体壁: GL工法で片面のみ（係数1）
  // 壁面積 = (間仕切壁延長 × 天井高 × 2) + (躯体壁延長 × 天井高 × 1) − 開口部面積

  let wallArea = (partitionWallLength * ceilingHeight * 2) + (structuralWallLength * ceilingHeight * 1) - openingArea;

  // 壁面積が計算できない場合、床面積から推定
  // 7現場実績: 壁クロス187～270㎡ → 床面積の約4倍
  if (wallArea <= 0 || isNaN(wallArea)) {
    wallArea = totalFloorArea > 0 ? totalFloorArea * 4 : 200;
  }

  // 7現場実績に基づく範囲チェック
  // 最小: 床面積の3.5倍（50㎡なら175㎡）
  // 最大: 床面積の5.5倍（50㎡なら275㎡）
  const minWallArea = totalFloorArea * 3.5;
  const maxWallArea = totalFloorArea * 5.5;

  if (wallArea < minWallArea && totalFloorArea > 0) {
    wallArea = minWallArea;
  }
  if (wallArea > maxWallArea && totalFloorArea > 0) {
    wallArea = maxWallArea;
  }

  // --- 資材計算 ---
  // アルファステイツ新宮町67戸実績に基づく

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【実績レンジのクランプ4件の置換（2026-07-24・must-fix M-2で設計やり直し）】
  //
  // 旧実装は Math.min(Math.max(x, min), max) の**絶対値クランプ**で、帯はすべて
  // アルファステイツ新宮町（=リノベ実績・67㎡級）から取られていた。他物件に出すと必ず頭打ちする:
  //   壁PB[30,90]枚  別府実測23.6〜98.4枚 → I=98.4が90で頭打ち
  //   耐水PB[2,7]枚  別府実測2.5〜9.5枚   → G=9.5が7で頭打ち
  //   巾木[30,60]m   別府実測43.8〜106.8m → 7/9タイプが60で頭打ち（H=106.8は-44%）
  //   間仕切GW[5,15]㎡ 別府実測35.0〜53.6㎡ → **9/9タイプ全滅**（-57〜72%）
  //   （実測値の出典: scripts/beppu-9types-ground-truth.json = 別府4丁目XLS集計表の戸当セル）
  //
  // 一方でクランプの上限は「外形寸法の誤読で totalFloorArea が水増しされたときの暴走を
  // 止める唯一の安全弁」でもあった（従来パスでは validateTakeoffSanity は呼ばれず、
  // applyElevationTakeoff もこの経路では走らない）。実測: total=200㎡誤読で
  // 壁PB165枚 / 巾木164m / GW96㎡ まで伸びる。単純撤去は暴走を野放しにするので不可。
  //
  // 【M-2で判明した設計ミスと、その修正方針】
  //   第1版は4部位すべてに「床面積比の上限」を掛けたが、そのうち**壁PBと巾木は床面積の
  //   固定倍そのもの**（壁PB=床×1.37×0.6=0.822枚/㎡・巾木=床×0.82m/㎡）であり、
  //   同じ床面積から作った値を同じ床面積の倍率(1.509枚/㎡・1.5m/㎡)と比べていた。
  //   比は床面積に依らず一定（54%・55%）なので**上限には永久に到達しない＝死んだガード**。
  //   540通りの総当たりでも発火0件だった。巾木で唯一発火したのは間取り別の最低値
  //   （3LDKなら50m）を打ち消すケースだけで、床20㎡の住戸で50m→30mに「抑制」する
  //   **誤発火**（=逆効果）だった。
  //
  //   → 床面積に比例するだけの部位に床面積比のcapを掛けても無意味。この2部位で本当に
  //     守るべきは「床面積そのものの誤り」なので、**層1（floor_area_inflated）に一本化**する。
  //     層1は totalFloorArea/flooringArea/cfArea/tileArea を一括是正するので、壁PB・巾木・
  //     天井・フローリングが**同じ基準**で同時に守られる（部位を跨げる唯一の層）。
  //     壁PB・巾木の部位capは撤去（死んだコードを残さない）。
  //
  // 【層2（部位capを残す部位）】床面積とは**独立した入力**を持ち、その入力が壊れると
  //   床面積が正しくても部位単独で暴走する部位だけに置く:
  //     耐水PB  ← cfArea（水回り部屋の面積誤読。トイレ60㎡等）
  //     間仕切GW ← partitionWallLength（躯体壁混入・ユーザー上書きの誤入力）
  //   この2部位は「出力/床面積」が入力次第で何倍にも振れるので床面積比のcapが実際に効く
  //   （総当たりで発火を実証: scripts/test-clamp-ratio-sanity.mjs のセクション9）。
  //
  // 【下限は設けない】別府Bの壁PB23.6枚・耐水2.5枚のように、実在物件が旧下限（30枚・2枚）を
  //   下回る実測を持つ。「小さすぎる＝異常」とは言えないので底上げしない（天井PBと同じ方針）。
  //   ただし過少側は**書き換えずに警告だけ出す**（S-3。天井PBの ceiling_pb_area_small と同じ扱い）。

  /**
   * 部位ごとの物理上限比による抑制（層2）。
   *   value が totalFloorArea × maxRatio を超えたら上限で抑制し警告を出す。
   *   分母が無い（部屋も専有面積も拾えていない）場合は絶対上限 absoluteMax で最終防波堤とする。
   *   ※ 床面積は層1で是正済み（floorAreaInflated 時は sanityBase へ縮小済み）なので、
   *     ここでは totalFloorArea をそのまま分母に使う（旧 sanityFloorArea 変数は層1の
   *     一本化にともない廃止＝部位ごとに基準が分かれる M-1 の温床だった）。
   *   @param {string} basis 警告文に出す上限の根拠（人が読める表現）。maxRatio をそのまま
   *     文面に出すと枚数系で 0.2415167250332086 のような数字が並び読めないため別引数にする
   *   @returns {number} 抑制後の値（抑制しなければ value のまま）
   */
  const applyRatioCap = ({ value, maxRatio, absoluteMax, field, label, unit, round, basis }) => {
    const fmt = (v) => (round === 'ceil' ? Math.ceil(v) : Math.round(v * 10) / 10);
    if (totalFloorArea > 0) {
      const cap = fmt(totalFloorArea * maxRatio);
      if (value > cap) {
        calcWarnings.push({
          field,
          message: `${label}(${value}${unit})が床面積${totalFloorArea.toFixed(1)}㎡に対し過大です`
            + `（実在物件の実測上限は${basis}）。${cap}${unit}に抑制しました。`
            + '専有面積・部屋面積の読み取りをご確認ください',
          before: value,
          after: cap,
        });
        return cap;
      }
      return value;
    }
    // 分母が全く無い場合のみ絶対上限（実在最大物件を弾かない高さに置く）
    if (value > absoluteMax) {
      calcWarnings.push({
        field,
        message: `${label}(${value}${unit})が上限${absoluteMax}${unit}を超えました`
          + '（図面の面積読み取りに問題がある可能性）。上限で抑制しました。専有面積を入力してください',
        before: value,
        after: absoluteMax,
      });
      return absoluteMax;
    }
    return value;
  };

  /**
   * 過少側の情報提供（S-3。数量は**書き換えない**・警告のみ）。
   *   下限の底上げは実在物件を歪めるので行わないが、「読み落としで0に近づいた」ことを
   *   検知する手段は必要（天井PBの ceiling_pb_area_small と同じ設計）。
   *   閾値は実測最小の**半分**に置く（実在の小さい物件で鳴らさないため）:
   *     壁PB   実測最小 別府B 23.6枚/48.7㎡=0.485枚/㎡ → 0.24
   *     巾木   実測最小 別府B 43.8m/48.7㎡=0.900m/㎡  → 0.45
   *     耐水PB 実測最小 別府H 2.49枚/107.6㎡=0.023枚/㎡ → 0.012
   *     GW     実測最小 アルファG 6.425㎡/67.3㎡=0.095㎡/㎡ → 0.048
   *       （GWだけは物件仕様で桁が違う＝アルファ基準の方が小さいのでそちらを採用）
   *
   *   @param {boolean} [suppressed] 直前に上限で抑制された値か（2026-07-24 MF-1）。
   *     true のときは鳴らさない。上限で書き換えた値を「床面積に対し小さい＝読み落とし疑い」と
   *     報告するのは**自作自演の矛盾警告**で、しかも床面積が巨大なときほど必ず起きる
   *     （実測: user_input 1000㎡ で wall_pb_absolute_cap[140枚] と wall_pb_sheets_small が同時発火）。
   *     抑制済みなら原因は既に上限側の警告で伝わっているので二重に鳴らさない。
   */
  const warnIfTooSmall = ({ value, minRatio, field, label, unit, basis, suppressed }) => {
    if (suppressed) return;
    if (!(totalFloorArea > 0) || !(value >= 0)) return;
    const floorMin = totalFloorArea * minRatio;
    if (value < floorMin) {
      calcWarnings.push({
        field,
        message: `${label}(${value}${unit})が床面積${totalFloorArea.toFixed(1)}㎡に対し小さいため`
          + `過少の可能性があります（部屋・寸法の読み落とし疑い。実在物件の実測最小は${basis}）。`
          + '数量は書き換えていません。図面の読み取りをご確認ください',
        before: null,
        after: value,
      });
    }
  };

  // 実在物件の実測から導いた「床面積あたりの物理上限」。
  // 出典: アルファG（'Ａタイプ'シート戸当・専有67.3㎡）と別府9タイプ（集計表戸当・
  //   床面積は天井面積÷0.88で逆算。天井/専有比0.88は両物件で収束＝test-ceiling-pb-clamp.mjs参照）。
  // いずれも「実測の最大値」に余裕を掛けた値で、**実在物件を弾かない**ことを最優先にしている
  // （正解に一致させる閾値ではなく、物理的にありえない値だけを弾く閾値）。
  //
  // 耐水PB: 実測 アルファG 6.45/67.3=0.096 / 別府max 0.161（Gタイプ13.23㎡）→ 上限 0.4㎡/㎡（実測max×2.5）
  //   水回りが極端に大きい間取り（1戸に浴室2つ等）を弾かないよう広めに取る
  const WATERPROOF_PB_MAX_SQM_PER_FLOOR_SQM = 0.4;
  // 間仕切GW: 実測 アルファG 6.43/67.3=0.095（Gは遮音壁2枚だけ）/ 別府max 0.775（Eタイプ47.15㎡）
  //   → 上限 1.2㎡/㎡（実測max×1.55）。物件により「全間仕切に充填」まで振れる部位なので広めに取る
  const GLASSWOOL_MAX_SQM_PER_FLOOR_SQM = 1.2;
  // 分母が全く無い場合の絶対上限。既知最大住戸（別府I 床≈117㎡）の実測を弾かない高さに置く:
  //   耐水 別府G=9.5枚 → 40枚 / GW 別府G=53.6㎡ → 150㎡
  const WATERPROOF_PB_ABSOLUTE_MAX_SHEETS = 40;
  const GLASSWOOL_ABSOLUTE_MAX_SQM = 150;

  // ── 層3: 壁PB・巾木の「部位絶対上限」（2026-07-24 must-fix MF-1）──
  //
  //  【なぜ必要か】層0（floor_area_implausible）は sanityBase>150㎡ でしか、
  //    層1（floor_area_inflated）は totalFloorArea > sanityBase×1.25 でしか発火しない。
  //    その結果 **declared ≤ 150 かつ roomsSum ≤ declared×1.25** の帯が両層をすり抜け、
  //    床面積の警告が1件も出ないまま最大187㎡ベースで計算される。
  //    実測（この修正前・レビュアー独立検証と一致）:
  //      decl=150 rooms=187 → 壁PB 155枚 / 巾木 154m ・床面積警告ゼロ
  //      decl=149 rooms=165 → 壁PB 137枚 / 巾木 136m ・床面積警告ゼロ
  //      decl=130 rooms=160 → 壁PB 132枚 / 巾木 132m ・床面積警告ゼロ（誤操作不要の現実的経路）
  //    天井PBには CEILING_PB_ABSOLUTE_MAX_SHEETS=100 の最終防波堤があり、この帯でも
  //    唯一鳴っていた（上の実測で ceiling_pb_absolute_cap だけが出ている）。
  //    壁PB・巾木には同等の防波堤が無かった＝MF-1の穴。
  //
  //  【M-2の「死んだガード」結論との関係】M-2で撤去したのは**床面積比**のcap
  //    （壁PB=床×0.822枚/㎡ を 床×1.509枚/㎡ と比べる＝比が床面積に依らず一定で到達不能）。
  //    ここで置くのは**絶対上限**で、床面積が大きくなれば必ず到達する＝性質が異なり死なない。
  //    天井PBの100枚capが現に機能している（上の実測で唯一鳴った警告）ことがその実証。
  //
  //  【上限値の置き方】2つの制約の間に置く（勘で決めない）:
  //    下側の制約＝実在物件を弾かない。実測max（beppu-9types-ground-truth.json 戸当）と
  //      エンジン出力（従来パス・別府規模の入力）の**両方**を上回る必要がある:
  //        壁PB 実測max 別府I=98.4枚（137.79㎡÷1.4）／エンジン出力 別府I=97枚
  //        巾木 実測max 別府H=106.85m           ／エンジン出力 別府I=96枚（H=89m）
  //    上側の制約＝すり抜け帯を実効的に閉じる。この帯の床面積上限は
  //      150（層0の閾値）×1.25（層1の閾値）=187.5㎡ で、無抑制なら壁PB155枚・巾木154m に達する。
  //      上限をこの到達値より十分下に置かないと防波堤として機能しない。
  //  → 実測maxの約1.2倍に置く（天井PBの100枚が実測max70.9枚の1.41倍なのより厳しめ。
  //    天井PBは「面積÷1.45」の素直な換算なのに対し、壁PB・巾木は床面積の固定倍推定で
  //    物件差が出にくく、実測を大きく超える正当な値が出にくいため）:
  //        壁PB 120枚（実測max×1.22・エンジン出力max×1.24・床≈146㎡相当）
  //        巾木 130m （実測max×1.22・エンジン出力max×1.35・床≈159㎡相当）
  //    ※ 別府I(床≈116.8㎡)・別府H(≈107.6㎡)はいずれも上限の内側で、実在物件は一切弾かれない
  //      （test-clamp-ratio-sanity.mjs のセクション13/14で9タイプ全数を実測して確認）。
  //    ※ 巾木を壁PBより高くしているのは実測の絶対値が大きいため（別府H 106.9m vs 壁PB 98.4枚）。
  const WALL_PB_ABSOLUTE_MAX_SHEETS = 120;
  const HABAKI_ABSOLUTE_MAX_M = 130;

  /**
   * 部位の絶対上限による最終防波堤（層3）。
   *   床面積比ではなく**部位の出力そのもの**を実在物件の実測上限と比べる。
   *   層0/層1が発火しない帯（declared≤150 かつ roomsSum≤declared×1.25）と、
   *   ユーザー入力を尊重して床面積を書き換えない経路（floor_area_implausible_trusted）の
   *   両方をここで受け止める。天井PBの ceiling_pb_absolute_cap と同じ形。
   *   @returns {{value:number, note:string|null}} 抑制後の値と、抑制時の根拠欄の差し替え文言
   */
  const applyAbsoluteCap = ({ value, absoluteMax, field, label, unit, basis }) => {
    if (!(value > absoluteMax)) return { value, note: null };
    calcWarnings.push({
      field,
      message: `${label}算出値(${value}${unit})が上限${absoluteMax}${unit}を超えました`
        + `（実在物件の実測上限は${basis}）。図面の面積読み取りに問題がある可能性があります。`
        + '上限で抑制しました。専有面積を正しく入力すると改善します',
      before: value,
      after: absoluteMax,
    });
    // S-1と同じ扱い: 数量を書き換えたら calculation 列（Excelの根拠）も揃える
    return {
      value: absoluteMax,
      note: `算出値が上限${absoluteMax}${unit}を超えたため上限で抑制（面積読み取り要確認）`,
    };
  };
  // 過少側の警告閾値（実測最小の半分。書き換えはしない＝S-3）
  const WALL_PB_MIN_SHEETS_PER_FLOOR_SQM = 0.24;
  const WATERPROOF_PB_MIN_SHEETS_PER_FLOOR_SQM = 0.012;
  const HABAKI_MIN_M_PER_FLOOR_SQM = 0.45;
  const GLASSWOOL_MIN_SQM_PER_FLOOR_SQM = 0.048;

  // === 石膏ボード ===

  // 壁PB t-9.5 (3'×6') - メイン壁用
  //
  // 【建物種別で構造ごと切り替える（2026-07-24）】設計の根拠は resolveBuildingTypeProfile の
  //   ブロックコメント（旧0.6の出自調査・床面積比が物件を跨げない実証・周長ベースの実測分布）。
  //   種別は**推定せず**必ず overrides.building_type で外から与える。既定は後方互換の 'renovation'。
  //
  //   リノベ: 床面積 × 1.37 × 0.6（＝実効0.822枚/㎡）… 既存式そのまま＝出力を1枚も変えない
  //   新築  : 周長 × 階高 × 0.55 → PB系合計㎡ → × 0.863（一般壁の取り分）→ ÷1.4（XLS換算係数）
  //           ※ ÷1.6562（3'×6'の実面積）ではなく **÷1.4** を使う。1.4はXLS集計表X列の
  //             実運用換算係数（ロス・切り無駄込み）で、正解データ（枚数）はこの係数で作られている。
  // buildingProfile は天井面積の算出（上方）でも使うため、この関数の前半で解決済み。
  if (buildingProfile.invalid.type) {
    calcWarnings.push({
      field: 'building_type_invalid',
      message: `建物種別の指定値（${buildingProfile.invalid.type}）を解釈できないため既定の「リノベーション」で計算しました`
        + '（new/新築 または renovation/リノベ を指定してください）',
      before: buildingProfile.invalid.type,
      after: 'renovation',
    });
  }
  for (const [k, label, def] of [
    ['perimeter_coeff', '新築の壁PB周長係数', WALL_PB_PERIMETER_COEFF_NEW],
    ['general_ratio', '壁PB一般壁比率', WALL_PB_GENERAL_RATIO_ALPHA],
  ]) {
    if (buildingProfile.invalid[k]) {
      calcWarnings.push({
        field: `${k}_invalid`,
        message: `${label}の指定値（${buildingProfile.invalid[k]}）が不正のため既定の${def}を使用しました`,
        before: buildingProfile.invalid[k], after: def,
      });
    }
  }

  let wallPb95Sheets;
  let wallPbCalcNote;
  if (buildingProfile.type === 'new') {
    // 新築: 壁は「床の広さ」ではなく「壁の長さ×高さ」で発生する
    const perim = resolveWallPerimeterM({
      partitionWallLengthM: partitionWallLength,
      structuralWallLengthM: structuralWallLength,
      floorAreaSqm: totalFloorArea,
    });
    const pbFamilySqm = perim.perimeter_m * ceilingHeight * buildingProfile.perimeter_coeff;
    const generalSqm = pbFamilySqm * buildingProfile.general_ratio;
    wallPb95Sheets = Math.ceil(generalSqm / PB_CONVERSION_WALL);
    wallPbCalcNote = `新築: 周長 ${perim.perimeter_m.toFixed(1)}m × 天井高 ${ceilingHeight.toFixed(2)}m`
      + ` × ${buildingProfile.perimeter_coeff}（PB系係数） × ${buildingProfile.general_ratio}（一般壁比率）`
      + ` ÷ ${PB_CONVERSION_WALL}㎡/枚`;
    if (perim.perimeter_m <= 0) {
      // 周長がまったく取れない＝間仕切も躯体も0。新築式が0枚を出すのを避け、リノベ式へ退避して警告
      wallPb95Sheets = Math.ceil(Math.ceil(totalFloorArea * WALL_PB_COEFF_RENOVATION) * WALL_PB_RENOVATION_REDUCTION);
      wallPbCalcNote = `床面積 ${totalFloorArea.toFixed(1)}㎡ × ${WALL_PB_COEFF_RENOVATION}枚/㎡ × ${WALL_PB_RENOVATION_REDUCTION}（周長不明のため従来式）`;
      calcWarnings.push({
        field: 'wall_pb_perimeter_missing',
        message: '新築指定ですが壁の延長（間仕切・躯体）を読み取れなかったため、'
          + '床面積ベースの従来式で仮計算しました。壁PBが過少になる可能性があります（要確認）',
        before: 0, after: wallPb95Sheets,
      });
    }
  } else {
    // リノベ: 既存式を1文字も変えない（けいとさん実績帯0.50〜1.00枚/㎡の内側）
    wallPb95Sheets = Math.ceil(totalFloorArea * WALL_PB_COEFF_RENOVATION);
    wallPb95Sheets = Math.ceil(wallPb95Sheets * WALL_PB_RENOVATION_REDUCTION);
    wallPbCalcNote = `床面積 ${totalFloorArea.toFixed(1)}㎡ × ${WALL_PB_COEFF_RENOVATION}枚/㎡ × ${WALL_PB_RENOVATION_REDUCTION}（リノベ係数）`;
  }
  // 旧: Math.min(Math.max(wallPb95Sheets, 30), 90) → 別府I=98.4枚を90で頭打ち・B=23.6枚を30へ底上げ
  //
  // 【床面積比の部位capは置かない（2026-07-24 M-2）】この式の出力は床面積の固定倍
  //   （1.37×0.6=0.822枚/㎡）でしかなく、床面積比の上限（旧: 2.5㎡/㎡÷1.6562=1.509枚/㎡）とは
  //   常に比54%で**到達不能**だった。床面積の誤読に対する守りは層1（床面積そのものの是正）が担う。
  //
  // 【ただし絶対上限は置く（2026-07-24 MF-1）】層0/層1は
  //   「declared≤150 かつ roomsSum≤declared×1.25」の帯では発火せず、床面積の警告が
  //   1件も出ないまま最大187㎡ベースの計算が通る（decl=150/rooms=187 で155枚）。
  //   絶対上限は床面積比と違い床面積が伸びれば必ず到達する＝この帯の最終防波堤になる。
  const wallPbCapped = applyAbsoluteCap({
    value: wallPb95Sheets, absoluteMax: WALL_PB_ABSOLUTE_MAX_SHEETS,
    field: 'wall_pb_absolute_cap', label: '壁石膏ボード', unit: '枚',
    basis: '別府I 98.4枚（床≈117㎡）',
  });
  wallPb95Sheets = wallPbCapped.value;
  if (wallPbCapped.note) wallPbCalcNote = wallPbCapped.note;
  //   過少側は書き換えず警告のみ（S-3）。
  warnIfTooSmall({
    value: wallPb95Sheets, minRatio: WALL_PB_MIN_SHEETS_PER_FLOOR_SQM,
    field: 'wall_pb_sheets_small', label: '壁石膏ボード', unit: '枚',
    basis: '別府B 23.6枚/48.7㎡=0.49枚/㎡',
    suppressed: wallPbCapped.note !== null, // 上限で書き換えた値を「過少」と鳴らさない（MF-1）
  });
  const wallPb95Area = Math.round(wallPb95Sheets * PB_SHEET_SIZE_3x6 * 100) / 100;
  materials.push({
    category: '下地材',
    name: '壁 石膏ボード',
    spec: "t-9.5（3'×6'）910×1820mm",
    unit: '枚',
    quantity: wallPb95Sheets,
    calculation: wallPbCalcNote
  });

  // 壁耐水PB t-9.5 - 水回り用
  // アルファステイツ実績: 280枚/67戸 = 約4枚/戸
  let wallPbWaterSheets = Math.ceil(cfArea / PB_SHEET_SIZE_3x6 * LOSS_RATE_20);
  let waterproofPbCalcNote = `水回り面積 ${cfArea.toFixed(1)}㎡から算出`;
  // 旧: Math.min(Math.max(wallPbWaterSheets, 2), 7) → 別府G=9.5枚を7で頭打ち（-26%）
  //
  // 【下限2枚を撤去したことの副作用と、その限定的な埋め合わせ】
  //   下限撤去は正しい（別府H=2.49枚のように旧下限すれすれの実測があり、
  //   「小さい＝異常」とは言えないため底上げしない）。ただし旧下限は
  //   「AIが水回りの部屋を1つも拾えなかった（cfArea=0）」ときに 0枚を出さない役割も
  //   兼ねていた。住戸には必ず浴室・便所があり（別府9タイプ・アルファG とも耐水PBは
  //   最小でも2.49枚）、0枚は物理的にありえず**部屋の読み落とし**を意味する。
  //   → 「読めた結果が小さい」場合は尊重して底上げしない。
  //     「1つも読めていない（cfArea=0）」場合だけ、実績最小値の推定を置いて**警告を出す**。
  //   ※ 平面図に水回りが存在しない特殊な区画（倉庫等）ではこの推定が過大になるが、
  //     警告付きで可視化されるため黙って0を出すより安全と判断した。
  const WATERPROOF_PB_FALLBACK_SHEETS = 2; // 実測最小 別府H=2.49枚 の切り捨て（過大にしない側へ丸める）
  if (cfArea <= 0 && totalFloorArea > 0) {
    wallPbWaterSheets = WATERPROOF_PB_FALLBACK_SHEETS;
    waterproofPbCalcNote = `水回りの部屋を読み取れなかったため実績最小 ${WATERPROOF_PB_FALLBACK_SHEETS}枚を仮置き（要確認）`;
    calcWarnings.push({
      field: 'waterproof_pb_no_wet_room',
      message: '図面から浴室・洗面・トイレ等の水回りを読み取れなかったため、'
        + `壁耐水石膏ボードを実績最小の${WATERPROOF_PB_FALLBACK_SHEETS}枚で仮置きしました。`
        + '水回りの部屋名・面積が図面に記載されているかご確認ください（要確認）',
      before: 0,
      after: WATERPROOF_PB_FALLBACK_SHEETS,
    });
  }
  // 層2のcapを置く部位（M-2）: 入力の cfArea が床面積とは独立に壊れうる
  //   （水回り部屋の面積誤読・部屋名の取り違えでLDKが水回りに入る等）。
  //   出力/床面積 は cfArea 次第で何倍にも振れるため床面積比のcapが実際に効く。
  wallPbWaterSheets = applyRatioCap({
    value: wallPbWaterSheets,
    maxRatio: WATERPROOF_PB_MAX_SQM_PER_FLOOR_SQM / PB_SHEET_SIZE_3x6,
    absoluteMax: WATERPROOF_PB_ABSOLUTE_MAX_SHEETS,
    field: 'waterproof_pb_sheets_excessive', label: '壁耐水石膏ボード', unit: '枚', round: 'ceil',
    basis: `耐水ボード面積が床面積の${WATERPROOF_PB_MAX_SQM_PER_FLOOR_SQM}倍まで`,
  });
  // 過少側（S-3）。cfArea=0 の仮置きは上の専用警告で伝わるので二重に鳴らさない
  if (cfArea > 0) {
    warnIfTooSmall({
      value: wallPbWaterSheets, minRatio: WATERPROOF_PB_MIN_SHEETS_PER_FLOOR_SQM,
      field: 'waterproof_pb_sheets_small', label: '壁耐水石膏ボード', unit: '枚',
      basis: '別府H 2.49枚/107.6㎡=0.023枚/㎡',
    });
  }
  const waterproofPb95Area = Math.round(wallPbWaterSheets * PB_SHEET_SIZE_3x6 * 100) / 100;
  materials.push({
    category: '下地材',
    name: '壁 耐水石膏ボード',
    spec: "耐水t-9.5（3'×6'）910×1820mm",
    unit: '枚',
    quantity: wallPbWaterSheets,
    calculation: waterproofPbCalcNote
  });

  // 天井PB t-9.5 (3'×6')
  // アルファステイツ実績: 2,810枚/67戸 = 約42枚/戸
  // 換算はプロXLS集計表の式に一致させる（77行: AD77=W77/X77・X77=1.45はロス込みの実係数。
  // ÷1.4や×1.05のロス率は使わない）。さらに74行「ﾊﾟｳﾀﾞｰﾙｰﾑ・ﾄｲﾚ天井ボード」=4枚/戸を
  // ㎡換算とは別枠で確保するため、該当小部屋の天井面積を㎡換算から控除して+4枚を加算する:
  //   天井PB/戸 = (天井面積 − パウダールーム・トイレ天井面積) ÷ 1.45 + 4枚
  // Gタイプ検算: (59.087−(1.33+3.381))/1.45 + 4 = 41.5枚/戸（AD列373.749÷9戸と一致）
  const CEILING_PB_SQM_PER_SHEET = 1.45; // 集計表X77
  // 集計表74行「ﾊﾟｳﾀﾞｰﾙｰﾑ・ﾄｲﾚ天井ボード」= 4枚/戸。ただしこの加算行はアルファG固有で、
  // 物件によっては存在しない（別府9タイプは集計表74行が空＝加算行が無い。scripts/beppu-9types-
  // ground-truth.json）。にもかかわらず部屋名「パウダー/トイレ」の存在だけで無条件に+4枚すると
  // 別府では常に+4枚の過大になる（check-engine-constants.mjs で判明した物件依存の定数）。
  // そこで下地高（studHeight）と同じく物件別Override可能にする:
  //   overrides.ceiling_pb_extra_sheets（itemKey='ceiling_pb_extra_sheets'・文字列）
  //   - 未設定（undefined/空文字/非数）＝デフォルト4枚維持（アルファGの後方互換）
  //   - '0' を明示指定＝加算しない（別府はここで0を入れて誤発火を止める）
  // 発火条件（パウダー/トイレ室が存在する場合のみ加算）は据え置き。override値は加算枚数のみ差し替える。
  //
  // 【入力ガード（2026-07-24 must-fix M-1）】
  //   旧実装は下地高overrideに倣い String(raw).replace(/[^0-9]/g,'') で数字だけ抜いていたが、
  //   これはマイナス記号と小数点を「除去」するため値が黙って別物になる（'-3'→3で符号反転・
  //   '2.5'→25で10倍・'1,0'→10・'1e3'→13）。下地高は下流の STUD_HEIGHT_MIN_MM/MAX_MM
  //   （buildupCalculator.js:99-100,482）が壊れた値を捨てて既定へ戻す第2段があるので助かっていたが、
  //   天井PB加算にはその第2段が無く +25枚（Gタイプで+48%）が無警告で出力に載る。
  //   → 暗黙の文字除去をやめ、許可パターン（整数のみ・任意で「枚」サフィックス）で明示的に読む。
  //      レンジはUIの input min=0 max=20（MaterialResult.vue）と一致させる。
  //      不正値は既定へフォールバックしたうえで **必ず警告を出す**（黙って戻さない）。
  const POWDER_TOILET_PB_SHEETS_DEFAULT = 4; // 集計表74行（ﾊﾟｳﾀﾞｰﾙｰﾑ・ﾄｲﾚ天井ボード 4枚/戸・アルファG）
  const CEILING_PB_EXTRA_MAX_SHEETS = 20;    // UIの max="20" と一致（物件依存の加算行の現実的上限）
  const POWDER_TOILET_PB_SHEETS = (() => {
    const raw = overrides.ceiling_pb_extra_sheets;
    // 未設定（null/undefined/空文字・空白のみ）＝デフォルト4枚（アルファGの後方互換）。警告も出さない
    if (raw === null || raw === undefined) return POWDER_TOILET_PB_SHEETS_DEFAULT;
    const s = String(raw).trim();
    if (s === '') return POWDER_TOILET_PB_SHEETS_DEFAULT;
    // 許可パターン: 非負整数（任意で全角/半角の「枚」を許す）。'0枚'→0 / '4'→4
    const m = /^(\d+)\s*枚?$/.exec(s);
    const n = m ? Number(m[1]) : Number.NaN;
    if (Number.isInteger(n) && n >= 0 && n <= CEILING_PB_EXTRA_MAX_SHEETS) return n;
    // ここに来る値: 負値・小数・カンマ/指数表記・レンジ外・'なし'等の非数
    // 非数（'なし'など）は「未設定扱い」で従来どおり黙って既定に戻すと不正入力を見逃すので、
    // 数値として解釈できるのに不採用になったケースは警告を出す。純粋な非数も同様に可視化する
    // （ユーザーが入力した以上、無視した事実は伝える）。
    calcWarnings.push({
      field: 'ceiling_pb_extra_sheets_invalid',
      message: `天井PB加算の指定値（${s}）が不正のため既定の${POWDER_TOILET_PB_SHEETS_DEFAULT}枚を使用しました`
        + `（0〜${CEILING_PB_EXTRA_MAX_SHEETS}の整数で入力してください。加算しない場合は0）`,
      before: s,
      after: POWDER_TOILET_PB_SHEETS_DEFAULT,
    });
    return POWDER_TOILET_PB_SHEETS_DEFAULT;
  })();
  const powderToiletCeilingArea = rooms
    .filter(r => /パウダー|トイレ|便所/.test(r.name || ''))
    .reduce((sum, r) => sum + (r.area_sqm || 0), 0);
  let ceilingPb95Sheets;
  let ceilingPbCalcNote;
  if (powderToiletCeilingArea > 0) {
    ceilingPb95Sheets = Math.ceil((ceilingArea - powderToiletCeilingArea) / CEILING_PB_SQM_PER_SHEET)
      + POWDER_TOILET_PB_SHEETS;
    ceilingPbCalcNote = `(天井面積 ${ceilingArea.toFixed(1)}㎡ − ﾊﾟｳﾀﾞｰ･ﾄｲﾚ ${powderToiletCeilingArea.toFixed(1)}㎡) ÷ ${CEILING_PB_SQM_PER_SHEET}㎡/枚 + ${POWDER_TOILET_PB_SHEETS}枚（XLS集計表方式）`;
  } else {
    // パウダールーム・トイレを特定できない場合は控除・加算なしの㎡換算のみ（係数はX77=1.45が正）
    ceilingPb95Sheets = Math.ceil(ceilingArea / CEILING_PB_SQM_PER_SHEET);
    ceilingPbCalcNote = `天井面積 ${ceilingArea.toFixed(1)}㎡ ÷ ${CEILING_PB_SQM_PER_SHEET}㎡/枚（XLS集計表X77係数）`;
  }
  // ── 天井PBの比率型サニティ（2026-07-24: 旧[20,50]レンジクランプの置換）──
  // 旧クランプ Math.min(Math.max(x,20),50) は「別府4丁目の新築大型住戸（H天井94.71㎡=66枚・
  //   I天井102.786㎡=71枚。scripts/beppu-9types-ground-truth.json）」を上限50枚で頭打ちさせ
  //   -23〜30%の過少を出していた（=撤去の動機は正当）。一方で下限を含む絶対レンジは、
  //   従来パス（展開図なし）で外形寸法を誤読して total_floor_area_sqm=200㎡ 等になった際に
  //   天井PBが138枚まで暴走するのを止める唯一の安全弁でもあった（applyElevationTakeoffは
  //   天井PB行を書き換えず・validateTakeoffSanityは壁PB比率のみ検査で天井は対象外・かつ
  //   展開図なしパスでは未呼び出し。旧クランプが実質唯一のガードだった）。
  //
  // 【2026-07-24 M-1: 天井側の水増しブランチは層1へ統合して撤去した】
  //   旧実装はここで「天井面積 ÷ sanityBase > 1.3 なら 床面積×0.88 へ丸める」を行っていたが、
  //   層1（floor_area_inflated）が**床面積そのもの**を sanityBase へ是正するようになったため、
  //   ここへ来る時点で必ず totalFloorArea ≤ sanityBase かつ ceilingArea ≤ totalFloorArea、
  //   すなわち ceilingArea/sanityBase ≤ 1.0 < 1.3 で**構造的に到達不能**になった
  //   （層1が非発火なら比 ≤ 1.25 < 1.3、発火すれば ≤ 1.0）。
  //   到達不能なガードを残すと「守られているつもり」の誤報告を生む（M-2で起きた事故）ので削除する。
  //   撤去による品質面の変化はむしろ改善: 旧は 床面積×0.88 という**推定値**へ丸めていたが、
  //   新は層1で是正された床面積から UB・収納を実測控除した**実面積**で算出する
  //   （誤読200㎡の回帰ケースで 40枚[推定] → 44枚[実測ベース]）。
  //
  // 絶対上限は残す: 分母が全く無い（部屋も専有も拾えず declaredのみ・それも誤読）と
  //   層1も働けないため、ここが最終防波堤になる。
  //   別府I=71枚を弾かないよう十分高く取る（100枚=天井145㎡相当。既知最大住戸の1.4倍の余裕）。
  const CEILING_PB_ABSOLUTE_MAX_SHEETS = 100;

  if (ceilingPb95Sheets < 0) ceilingPb95Sheets = 0;
  if (ceilingPb95Sheets > CEILING_PB_ABSOLUTE_MAX_SHEETS) {
    // 分母が無く比率で捕捉できないケースの最終ガード（従来パス・部屋も専有も不明で誤読totalのみ）
    calcWarnings.push({
      field: 'ceiling_pb_absolute_cap',
      message: `天井PB算出値(${ceilingPb95Sheets}枚)が上限${CEILING_PB_ABSOLUTE_MAX_SHEETS}枚を超えました`
        + '（図面の面積読み取りに問題がある可能性）。上限で抑制しました。専有面積を入力してください',
      before: ceilingPb95Sheets,
      after: CEILING_PB_ABSOLUTE_MAX_SHEETS,
    });
    ceilingPb95Sheets = CEILING_PB_ABSOLUTE_MAX_SHEETS;
    // S-1: 数量を書き換えたら根拠欄も揃える（抑制前の生の式が calculation 列＝Excelの根拠に
    // 残ると「100枚なのに + 999999枚」のような矛盾表示になる。水増しブランチと同じ扱いに統一）
    ceilingPbCalcNote = `天井面積${ceilingArea.toFixed(1)}㎡からの算出値が上限`
      + `${CEILING_PB_ABSOLUTE_MAX_SHEETS}枚を超えたため上限で抑制（面積読み取り要確認）`;
  } else if (sanityBase > 0 && ceilingArea > 0 && ceilingArea < sanityBase * 0.4) {
    // S-1: 過少側は危険度が低いため抑制せず情報提供のみ（正の小面積が無警告で通るのを防ぐ）
    calcWarnings.push({
      field: 'ceiling_pb_area_small',
      message: `天井面積(${ceilingArea.toFixed(1)}㎡)が床面積(${sanityBase.toFixed(1)}㎡)に対し小さいため`
        + '天井PBが過少の可能性があります（部屋・面積の読み落とし疑い）。専有面積の入力をご確認ください',
      before: null,
      after: ceilingPb95Sheets,
    });
  }
  materials.push({
    category: '下地材',
    name: '天井 石膏ボード',
    spec: "t-9.5（3'×6'）910×1820mm",
    unit: '枚',
    quantity: ceilingPb95Sheets,
    calculation: ceilingPbCalcNote
  });

  // 下り天井PB t-9.5
  // アルファステイツ実績: 260枚/67戸 = 約4枚/戸
  materials.push({
    category: '下地材',
    name: '下り天井 石膏ボード',
    spec: "t-9.5（3'×6'）910×1820mm",
    unit: '枚',
    quantity: 4,
    calculation: '標準4枚（実績値）'
  });

  // 一部界壁PB t-9.5（キッチンパネル下）
  // アルファステイツ実績: 200枚/67戸 = 約3枚/戸
  materials.push({
    category: '下地材',
    name: '一部界壁 石膏ボード',
    spec: "t-9.5（3'×6'）910×1820mm キッチンパネル貼下のみ",
    unit: '枚',
    quantity: 3,
    calculation: '標準3枚（67戸実績）'
  });

  // 一部界壁耐水PB t-9.5（キッチンパネル下）
  // アルファステイツ実績: 50枚/67戸 = 約1枚/戸
  materials.push({
    category: '下地材',
    name: '一部界壁 耐水石膏ボード',
    spec: "耐水t-9.5（3'×6'）910×1820mm キッチンパネル貼下のみ",
    unit: '枚',
    quantity: 1,
    calculation: '標準1枚（67戸実績）'
  });

  // EV廻り壁PB t-9.5
  // アルファステイツ実績: 150枚/67戸 = 約2.2枚/戸
  const evWallPb95Sheets = 3;
  const evWallPb95Area = Math.round(evWallPb95Sheets * PB_SHEET_SIZE_3x6 * 100) / 100;
  materials.push({
    category: '下地材',
    name: 'EV廻り壁 石膏ボード',
    spec: "t-9.5（3'×6'）910×1820mm",
    unit: '枚',
    quantity: evWallPb95Sheets,
    calculation: '標準3枚（67戸実績2.2枚/戸切上げ）'
  });

  // 収納面PB t-9.5（マルチクロゼット・WIC・CLRC面）
  // 【面積換算（2026-07-25）】固定5枚 → 収納面RCの拾い面積 ÷ 1.45（XLS集計表X73）。
  //   既定はアルファG実績 7.51㎡/戸（CLOSET_RC_SQM_ALPHA＝集計表C73）÷ 1.45 = 5.18 → ceil 6枚。
  //   ※展開図ありの本番経路では applyElevationTakeoff が konpane_sqm（中間6＝D64収納内RC面）の
  //     実測面積で置換する。ここは推定パス（展開図なし）と物件別指定の入口。
  //   【物件依存】別府は収納面PBの概念が無い（集計表に該当行なし）。overrides.closet_rc_sqm='0' で
  //     拾い面積0＝0枚を明示できる（未設定のみアルファ既定へフォールバック）。固定5枚の押し付けを解消。
  const closetResolved = resolveClosetRcSqm(overrides.closet_rc_sqm);
  if (closetResolved.invalid) {
    calcWarnings.push({
      field: 'closet_rc_sqm_invalid',
      message: `収納面RCの拾い面積の指定値（${closetResolved.invalid}）が不正のため既定の${CLOSET_RC_SQM_ALPHA}㎡/戸を使用しました`
        + '（0以上の数値で入力してください。収納面PBが無い物件は0）',
      before: closetResolved.invalid,
      after: CLOSET_RC_SQM_ALPHA,
    });
  }
  const closetRcSqm = closetResolved.value;
  // 【丸め方の選択（2026-07-25）】収納面PBだけ round、他の面積換算部位（壁PB/耐水/天井PB/EV）は ceil。
  //   理由: 他部位は 87枚台/42枚台の大数量で、per-戸 ceil の切り上げ端数(<1枚)は+0.9%程度に埋もれる。
  //   収納面PBは 5.18枚/戸 の小数量で、ceil(5.18)=6 が +15.8%（端数0.18が5枚台に大きく効く）。
  //   XLS発注実態は per-戸 ceil ではない: 集計表 AB73=C73÷X73=5.18 は総量方式（9戸ぶんを合算→÷1.45）で、
  //   9戸発注=ceil(7.51×9/1.45)=ceil(46.6)=47枚。per-戸 ceil の 6×9=54枚は+7枚の過大。
  //   round(5.18)=5 → 5×9=45枚 の方が XLS の 47枚 に近い（±10%内・+15.8%→-3.5%）。
  //   これは「5枚に合わせる逆算」ではなく、小数量部位で戸単位ceilがXLS総量方式から乖離する構造の是正。
  //   ※クロゼット内RC面（㎡）の拾い量は変更しない（eval-gtype-buildup の面積判定 +1.3%✅は不変）。
  const closetPbSheets = Math.round(closetRcSqm / CLOSET_PB_SQM_PER_SHEET);
  materials.push({
    category: '下地材',
    name: 'マルチクロゼット・WIC・CLRC面 石膏ボード',
    spec: "t-9.5（3'×6'）910×1820mm",
    unit: '枚',
    quantity: closetPbSheets,
    calculation: `収納面RC ${closetRcSqm.toFixed(2)}㎡ ÷ ${CLOSET_PB_SQM_PER_SHEET}㎡/枚（XLS集計表X73）`
      + (closetResolved.source === 'override' ? '（物件別指定）' : '（アルファG実績7.51㎡/戸）')
  });

  // キッチンパネル 3'×8'
  // アルファステイツ実績: 170枚/67戸 = 約3枚/戸
  // ※ 2026-07 アイカセラール → キョーライト アーバンSマリアパールへ仕様変更
  materials.push({
    category: '下地材',
    name: '壁 キッチンパネル',
    spec: "t-3.0（3'×8'）910×2420mm キョーライト アーバンSマリアパール",
    unit: '枚',
    quantity: 3,
    calculation: '標準3枚（実績値）'
  });

  // キッチンパネル見切り
  // アルファステイツ実績: 134箇所/67戸 = 約2箇所/戸
  materials.push({
    category: '下地材',
    name: '壁 キッチンパネル見切り',
    spec: "樹脂製 アイカ：ABSジョイナー H=2250",
    unit: '箇所',
    quantity: 2,
    calculation: '標準2箇所（実績値）'
  });

  // === グラスウール・断熱材 ===

  // 間仕切グラスウール
  // アルファステイツ実績: 451㎡/67戸 = 約7㎡/戸
  //
  // 【充填率は物件依存（2026-07-24 must-fix M-3）】
  //   旧上限[5,15]㎡は別府9/9タイプ全滅（実測35.0〜53.6㎡を15で頭打ち＝-57〜72%）だが、
  //   上限を外すだけではアルファ側が逆に大きく外れる。実fixture 4本の実測（従来パス）:
  //     gtype_parsedData.json 15→35㎡ / _p2 15→25㎡ / _p2v2 15→31㎡ / _p3 15→19㎡
  //     （アルファGの正解は 6.425㎡。旧15㎡=+133% → 撤去だけだと +196〜445%へ悪化）
  //   原因は上限ではなく **GLASSWOOL_COVERAGE=0.5 という充填率そのものが物件依存**であること:
  //     アルファ（実測GW/床）= 6.425/67.3 = 0.095㎡/㎡（住戸内遮音壁2枚だけに充填する仕様）
  //     別府   （同）        = 0.411〜0.775㎡/㎡（間仕切のほぼ全部に充填する仕様）＝**7〜8倍差**
  //   1つの係数で両者を満たすことは不可能なので、係数を物件別overrideで差し替えられるようにする
  //   （天井PB加算 overrides.ceiling_pb_extra_sheets と同じ方式）。
  //   デフォルトは**エンジンが作られたアルファ基準**（＝既存物件の後方互換）:
  //     間仕切壁のうち遮音壁だけに充填する ⇒ 充填率 GLASSWOOL_COVERAGE_ALPHA。
  //   別府のように全間仕切へ充填する物件は overrides.glasswool_coverage='0.5' 等を指定する。
  //   ※ 展開図ありの本番経路では applyElevationTakeoff が実測値で置換するのでこの推定は表に出ない
  //     （eval-gtype-buildup の間仕切GW +0.1%✅は本ロジックの影響を受けない）。
  //
  //   アルファ基準の充填率の導出（実績からの逆算・答え合わせではなく係数の定義）:
  //     GW実測 6.425㎡ ÷（間仕切壁延長19.8m × 天井高2.4m = 47.52㎡）= 0.135
  //     出典: 'Ａタイプ'!P113/P221/P275（LDK↔洋1 1450mm・LDK↔洋3 1050mm の遮音壁片面）
  const GLASSWOOL_COVERAGE_ALPHA = 0.135; // 住戸内遮音壁のみ充填（アルファG実測6.425㎡から逆算）
  const GLASSWOOL_COVERAGE_MAX = 1.0;     // 両面・全間仕切でも1.0を超えることはない（入力ガード）
  const glasswoolCoverage = (() => {
    const raw = overrides.glasswool_coverage;
    if (raw === null || raw === undefined) return GLASSWOOL_COVERAGE_ALPHA;
    const s = String(raw).trim();
    if (s === '') return GLASSWOOL_COVERAGE_ALPHA;
    // 許可パターン: 0より大きく1.0以下の小数（'0.5' / '.5' / '1'）。
    //   ceiling_pb_extra_sheets と同じ方針で、暗黙の文字除去はしない（'0.5'→5 のような
    //   黙った10倍化を避ける）。不正値は既定へフォールバックしたうえで必ず警告を出す。
    const n = /^\d*\.?\d+$/.test(s) ? Number(s) : Number.NaN;
    if (Number.isFinite(n) && n > 0 && n <= GLASSWOOL_COVERAGE_MAX) return n;
    calcWarnings.push({
      field: 'glasswool_coverage_invalid',
      message: `グラスウール充填率の指定値（${s}）が不正のため既定の${GLASSWOOL_COVERAGE_ALPHA}を使用しました`
        + `（0より大きく${GLASSWOOL_COVERAGE_MAX}以下の数値で入力してください）`,
      before: s,
      after: GLASSWOOL_COVERAGE_ALPHA,
    });
    return GLASSWOOL_COVERAGE_ALPHA;
  })();
  let glasswoolArea = Math.ceil(partitionWallLength * ceilingHeight * glasswoolCoverage);
  // 層2のcapを置く部位（M-2）: 入力の partitionWallLength が床面積と独立に壊れうる
  //   （躯体壁の混入・ユーザー上書きの誤入力）。出力/床面積 が入力次第で何倍にも振れる。
  glasswoolArea = applyRatioCap({
    value: glasswoolArea,
    maxRatio: GLASSWOOL_MAX_SQM_PER_FLOOR_SQM,
    absoluteMax: GLASSWOOL_ABSOLUTE_MAX_SQM,
    field: 'glasswool_area_excessive', label: '間仕切グラスウール', unit: '㎡', round: 'ceil',
    basis: `床面積あたり${GLASSWOOL_MAX_SQM_PER_FLOOR_SQM}㎡/㎡まで`,
  });
  // 過少側（S-3）。書き換えずに警告のみ
  warnIfTooSmall({
    value: glasswoolArea, minRatio: GLASSWOOL_MIN_SQM_PER_FLOOR_SQM,
    field: 'glasswool_area_small', label: '間仕切グラスウール', unit: '㎡',
    basis: 'アルファG 6.43㎡/67.3㎡=0.095㎡/㎡',
  });
  materials.push({
    category: '下地材',
    name: '間仕切 グラスウール充填',
    spec: "t-50 24kg/m3",
    unit: '㎡',
    quantity: glasswoolArea,
    calculation: `間仕切壁 ${partitionWallLength.toFixed(1)}m × ${ceilingHeight.toFixed(1)}m × ${glasswoolCoverage}（充填率）`
  });

  // === 下地補強合板 ===

  // カーテンレール・手摺・タオル掛下地補強合板
  // アルファステイツ実績: 390枚/67戸 = 約6枚/戸
  materials.push({
    category: '下地材',
    name: 'カーテンレール・手摺・タオル掛 下地補強合板',
    spec: "t-9.0（3'×6'）910×1820mm",
    unit: '枚',
    quantity: 6,
    calculation: '標準6枚（実績値）'
  });

  // エアコン下地補強合板
  // アルファステイツ実績: 20枚/67戸 = 約0.3枚/戸 → 1枚
  const roomCount = rooms.length > 0 ? rooms.length : 3;
  const airconBoardCount = Math.min(Math.max(Math.ceil(roomCount * AIRCON_PER_ROOM), 1), 3);
  materials.push({
    category: '下地材',
    name: 'エアコン下地補強合板',
    spec: "t-9.0（3'×6'）910×1820mm",
    unit: '枚',
    quantity: airconBoardCount,
    calculation: `部屋数 ${roomCount}室 × ${AIRCON_PER_ROOM}`
  });

  // === 面木・コーナー ===

  // 壁出隅面木（一般）
  // アルファステイツ実績: 420箇所/67戸 = 約6箇所/戸
  materials.push({
    category: '下地材',
    name: '壁出隅面木',
    spec: 'R型コーナーパット H=2200〜2400',
    unit: '箇所',
    quantity: 6,
    calculation: '標準6箇所（実績値）'
  });

  // === 構造材（木軸） ===

  // 垂木 (赤松KD/LVL 30×40 L3000 入数12)
  // アルファステイツ実績: 天井下地38.5m3/67戸、間仕切木軸77.3m3/67戸
  // リノベでは規模が小さいため調整
  let tarukiBundles = 20; // デフォルト20束
  if (partitionWallLength > 0 || ceilingArea > 0) {
    const tarukiCount = ((partitionWallLength / 0.303 * 2) + (ceilingArea / 0.303)) / TARUKI_PER_BUNDLE;
    tarukiBundles = Math.ceil(tarukiCount);
    if (isNaN(tarukiBundles) || tarukiBundles <= 0) {
      tarukiBundles = 20;
    }
    tarukiBundles = Math.min(Math.max(tarukiBundles, 10), 30);
  }
  materials.push({
    category: '下地材',
    name: '垂木 LVL 30×40 L3000',
    spec: '入数12本/束 壁・天井下地',
    unit: '束',
    quantity: tarukiBundles,
    calculation: `壁下地 + 天井下地 @303ピッチ（10〜30束）`
  });

  // === 木下地詳細（集計表シートより） ===

  // 際根太（係数・規格・材積換算の有無が物件依存。既定=アルファ実績18.2m/戸・45×30）
  //   別府は overrides.kiwaneta_ratio='1.07' / kiwaneta_min_m='0' / kiwaneta_spec='H110' /
  //   kiwaneta_volume='なし' を指定する（集計表9行「際根太 H110」・X9=0＝材積換算なし）
  const kiwaneta = resolveKiwanetaProfile(overrides);
  for (const [k, bad] of Object.entries(kiwaneta.invalid)) {
    const label = { ratio: '長さ係数', min_m: '下限', volume: '材積換算の有無' }[k] || k;
    calcWarnings.push({
      field: `kiwaneta_${k}_invalid`,
      message: `際根太の${label}の指定値（${bad}）が不正のため既定値を使用しました`,
      before: bad,
      after: k === 'volume' ? 'あり' : kiwaneta[k],
    });
  }
  const kiwanetaLength = Math.max(Math.ceil(totalFloorArea * kiwaneta.ratio), kiwaneta.min_m);
  materials.push({
    category: '下地材',
    name: '際根太',
    spec: kiwaneta.spec,
    unit: 'm',
    quantity: kiwanetaLength,
    calculation: `床面積 ${totalFloorArea.toFixed(1)}㎡ × ${kiwaneta.ratio}`
      + (kiwaneta.min_m > 0 ? `（下限${kiwaneta.min_m}m）` : '')
      + (kiwaneta.source.ratio === 'override' ? '［物件別指定］' : '（アルファ実績18.2m/戸）')
  });

  // 物件固有の追加部位行（2026-07-25・resolveExtraParts）
  //   「その物件にしか無い部位」を人が指定して行として足す器。エンジンは数量を推定しない。
  //   第1号: 別府4丁目「ｽﾗﾌﾞ下り際根太 H=210」（集計表r10。Ａ23.3〜Ｇ24.3m/戸・Ｈ/Ｉは0＝行なし）。
  //   ここ（際根太の直後）に置くのは、第1号が木下地ブロックの部位であり
  //   XLS集計表でも r9 際根太 → r10 スラブ下り際根太 と隣り合うため（行単位で照合しやすい）。
  //   ※ 追加部位は**際根太のプロファイル（kiwaneta_*）とは完全に独立**。
  //     H=210 は際根太H110と別材で数量も別に拾うため、kiwaneta_spec を流用してはいけない。
  const extraParts = resolveExtraParts(overrides);
  for (const bad of extraParts.invalid) {
    calcWarnings.push({
      field: `extra_part_${bad.index}_invalid`,
      message: `追加部位${bad.index}の指定に問題があるため${
        bad.key.endsWith('_volume') || bad.key.endsWith('_volume_m3_per_unit') ? '材積行を' : '行を'
      }出力しませんでした（${bad.reason}）`,
      before: bad.value || null,
      after: null,
    });
  }
  for (const row of extraParts.rows) {
    materials.push({
      category: row.category,
      name: row.name,
      spec: row.spec,
      unit: row.unit,
      quantity: row.quantity,
      calculation: `物件別指定 ${row.quantity}${row.unit}（この物件固有の追加部位）`,
      // 単価は未整備（0）。**部分一致の単価検索に載せない**ことが重要:
      //   UNIT_PRICES の検索は `item.name.includes(key) || key.includes(item.name)` の部分一致で、
      //   'ｽﾗﾌﾞ下り際根太' は '際根太'(350円/m) を拾ってしまう。追加部位は物件固有＝
      //   既存資材の単価と同じである保証がどこにも無いので、既存材の単価を勝手に継承させない
      //   （材積行が同名のm単価を誤って拾うのを unit_price 明示で防いでいるのと同じ手当て）。
      //   単価は単価設定画面（名称+規格）で登録された時点で適用される。
      unit_price: 0,
      // 表示スコープ（建材14項目・filterKenzaiScope）を通すための明示フラグ。
      // ユーザーが自分で入力した行なので落とさない（名称パターンは広げない）
      extra_part: true,
    });
    // 材積(m³)行は「あり」指定＋係数がある場合のみ。既定は出さない
    //   （第1号の別府スラブ下り際根太は集計表X10=0＝材積換算せず m のまま発注する）
    if (row.volume && row.volume_m3_per_unit > 0) {
      materials.push({
        category: row.category,
        name: row.name,
        spec: row.spec,
        unit: 'm³',
        quantity: Math.round(row.quantity * row.volume_m3_per_unit * 10000) / 10000,
        unit_price: 0, // 単価未整備（材積行は既存の際根太/木胴縁と同じ扱い）
        calculation: `物件別指定 ${row.quantity}${row.unit} × ${row.volume_m3_per_unit}m³/${row.unit}`,
        extra_part: true,
      });
    }
  }

  // 吊戸下地 30×40
  // 実績: 9本/戸
  materials.push({
    category: '下地材',
    name: '吊戸下地',
    spec: '30×40 米栂1等',
    unit: '本',
    quantity: 9,
    calculation: '標準9本（実績値）'
  });

  // AW掃出し下見切り
  // 実績: 2.4m/戸
  materials.push({
    category: '造作材',
    name: 'AW掃出し下見切り',
    spec: 'カイダーベースボード',
    unit: 'm',
    quantity: 2.4,
    calculation: '標準2.4m（実績値）'
  });

  // EV面グラスウール（マンション向け）
  // 実績: 8.995㎡/戸
  // リノベでは省略可能だが、新築マンション向けに追加
  // EV廻り壁グラスウール充填
  // アルファステイツ実績: 140㎡/67戸 = 約2.1㎡/戸（EVに面する住戸はより多い。overrides.ev_insulation='あり'で9㎡）
  materials.push({
    category: '下地材',
    name: 'EV廻り壁 グラスウール充填',
    spec: "t-50 24kg/m3",
    unit: '㎡',
    quantity: overrides.ev_insulation === 'あり' ? 9 : 2,
    calculation: overrides.ev_insulation === 'あり' ? 'EV面あり 9㎡（実績値）' : '標準2㎡（67戸実績）'
  });

  // 間仕切下地(木) 45×30 @450ピッチ
  // 実績: 84m/戸（XLS拾い量。"m"表記だが実態は壁1枚あたり片面の下地面積㎡ — timberVolume.js解読メモ）
  const majikiriLength = Math.max(Math.ceil(partitionWallLength * 4.2), 80);
  materials.push({
    category: '下地材',
    name: '間仕切下地(木)',
    spec: '45×30 @450ピッチ 米栂1等',
    unit: 'm',
    quantity: majikiriLength,
    calculation: `間仕切壁 ${partitionWallLength.toFixed(1)}m × 4.2（実績84m/戸）`
  });

  // === 造作材の材積発注（m³）===
  // XLS造作材集計の数式を踏襲: 材積(m³) = 断面H×D×材長×10⁻⁹（timberVolume.js）。
  // 名称/摘要は見積明細・木材ブロックの表記（際根太/間仕切木軸/木胴縁（界壁面）/天井下地）。
  // 単価は未整備（¥0）— m単価・㎡単価の同名行と混ざらないよう unit_price を明示する。
  // 展開図がある場合は applyElevationTakeoff が実測ベースで上書きする。
  // 【際根太の材積行は物件依存で「出さない」ことがある（2026-07-24）】
  //   アルファ集計表X9=0.00135 m³/m で材積化するが、**別府はX9=0＝材積換算をしない**
  //   （mのまま発注する運用）。0m³の行を出すと「存在しない材の発注行」になるため行ごと出さない。
  if (kiwaneta.volume) {
    materials.push({
      category: '下地材',
      name: '際根太',
      spec: TIMBER_SECTIONS.kiwaneta.spec,
      unit: 'm³',
      quantity: timberVolumeM3(TIMBER_SECTIONS.kiwaneta, kiwanetaLength),
      unit_price: 0,
      calculation: `際根太 ${kiwanetaLength}m × 断面45×30（実績0.027m³/戸）`
    });
  }
  // 間仕切木軸の材積: XLS集計表 Y52{=W52*X52}＝拾い面積 × 材積係数0.0116m³/㎡ で直接算出（2026-07-25・案B）。
  //   材長（両面縦横@450）は発注実態の表示としてcalculation欄に残すが、材積は材長経由しない。
  const majikiriTimberLen = majikiriTimberLengthM(majikiriLength);
  materials.push({
    category: '下地材',
    name: '間仕切木軸',
    spec: 'LVL 30×45',
    unit: 'm³',
    quantity: majikiriVolumeM3(majikiriLength),
    unit_price: 0,
    calculation: `間仕切下地 ${majikiriLength}㎡ × ${MAJIKIRI_M3_PER_SQM}m³/㎡（XLS集計表X52・両面縦横@450 ≒${Math.round(majikiriTimberLen)}m）`
  });
  // 木胴縁（一部界壁面）: 拾い面積は**界壁面のみ**（収納内RC面・EV面は含めない）。
  // 【XLS原典 2026-07-24】見積明細「木胴縁（一部界壁面）」3.6m³/67戸 の実体は
  //   集計表 r85（アルファ「界壁面 ＰＢｔ9.5+木胴縁」/ 別府「部分界壁 ｔ9.5+木胴縁」）1行のみで、
  //   Y85 {=W85*X$86} = 45.423㎡ × 0.0098 = 0.4451454m³（AJ列=構造材・軸組み）。
  // 【分離の根拠は「係数が違う」ではなく「集計先の行が違う」（2026-07-24 S-1 訂正）】
  //   旧コメントは「EV面(r26)は**別係数**へ入る」と書いていたが誤り。実セルを検算すると
  //     r26 EV面     : Y26 {=W26*X$27} = 80.955 × 0.0098 = 0.793359（AJ26と一致）
  //     r73 収納内RC面: Y73 {=W73*X$72} = 67.59  × 0.0098 = 0.662382（AK73と一致）
  //     r85 界壁面    : Y85 {=W85*X$86} = 45.423 × 0.0098 = 0.4451454
  //   と**3行とも同じ0.0098**。違うのは集計先（r85→AJ85単独 / r73→AK73 / r26→AJ26）＝
  //   見積明細で別々の行として発注される点であり、木胴縁の行(r85)に他2行を合算してはいけない
  //   （旧実装は3行を足していた）。「係数が違うから分ける」と読むと将来の判断を誤る。
  //
  // 【拾い面積は物件依存（2026-07-24 S-2）】既定のアルファ実績5.047㎡/戸は全物件共通ではない。
  //   別府の部分界壁は戸当 0.000〜17.332㎡ とタイプで大きく違い、0（界壁なし）のタイプもある。
  //   → overrides.kaibe_wall_sqm（itemKey='kaibe_wall_sqm'・文字列）で差し替え可能にする。
  //     未設定＝既定（アルファ後方互換）／'0'＝界壁を計上しない、が成立すること。
  //     解決ロジックは高さ側と同じ場所（buildupCalculator の resolveKaibeWallSqm）に一元化する。
  const kaibeResolved = resolveKaibeWallSqm(overrides.kaibe_wall_sqm);
  if (kaibeResolved.invalid) {
    calcWarnings.push({
      field: 'kaibe_wall_sqm_invalid',
      message: `界壁面の拾い面積の指定値（${kaibeResolved.invalid}）が不正のため既定の${KAIBE_WALL_SQM_ALPHA}㎡/戸を使用しました`
        + '（0以上の数値で入力してください。界壁が無い物件は0）',
      before: kaibeResolved.invalid,
      after: KAIBE_WALL_SQM_ALPHA,
    });
  }
  const dobuchiSqm = kaibeResolved.value; // 既定: 界壁面 45.423㎡/9戸 = 5.047㎡/戸（ALPHA_STATS.kaibe_wall）
  materials.push({
    category: '下地材',
    name: '木胴縁（界壁面）',
    spec: 'LVL 30×45',
    unit: 'm³',
    quantity: dobuchiVolumeM3(dobuchiSqm),
    unit_price: 0,
    calculation: `界壁面 ${dobuchiSqm.toFixed(2)}㎡ × ${DOBUCHI_M3_PER_SQM}m³/㎡`
      + (kaibeResolved.source === 'override' ? '（物件別指定）' : '（XLS集計表X86・実績0.054m³/戸）')
  });
  // 天井下地の材積: XLS集計表 Y77{=W77*X78}＝天井面積 × 材積係数0.0081m³/㎡ で直接算出（2026-07-25・案B）。
  //   野縁@303格子+吊木の材長は発注実態の表示としてcalculation欄に残すが、材積は材長経由しない。
  const ceilingFrameLen = ceilingFrameLengthM(ceilingArea);
  materials.push({
    category: '下地材',
    name: '天井下地',
    spec: 'LVL 30×40',
    unit: 'm³',
    quantity: ceilingFrameVolumeM3(ceilingArea),
    unit_price: 0,
    calculation: `天井 ${ceilingArea.toFixed(1)}㎡ × ${CEILING_M3_PER_SQM}m³/㎡（XLS集計表X78・野縁@303格子+吊木 ≒${Math.round(ceilingFrameLen)}m）`
  });

  // 遮音壁PB張り
  // 実績: 13㎡/戸
  const soundWallPbSqm = 13;
  materials.push({
    category: '下地材',
    name: '遮音壁PB張り',
    spec: 't9.5+グラスウール',
    unit: '㎡',
    quantity: soundWallPbSqm,
    calculation: '標準13㎡（実績値）'
  });

  // PS点検口
  // 実績: 2箇所/戸
  materials.push({
    category: '造作材',
    name: 'PS点検口',
    spec: '450角',
    unit: '箇所',
    quantity: 2,
    calculation: '標準2箇所（実績値）'
  });

  // タイル見切縁
  // 実績: 2m/戸
  materials.push({
    category: '造作材',
    name: 'タイル見切縁',
    spec: '塩ビ見切り',
    unit: 'm',
    quantity: 2,
    calculation: '標準2m（実績値）'
  });

  // フローリング - ロス率+10%
  // 54ファイル実績: 50〜70㎡（間取りによる）
  // - 1LDK: 約40㎡
  // - 2LDK: 50〜55㎡
  // - 3LDK: 60〜70㎡
  let flooringQty = Math.ceil(flooringArea * LOSS_RATE_10 * 10) / 10;
  // 最低50㎡、最大70㎡（ロス込み）
  if (flooringQty > 0) {
    materials.push({
      category: '床材',
      name: 'フローリング',
      spec: packageSpecs?.flooring || 'DAIKEN MYフロア ΔLL(I)-4 遮音直貼り',
      unit: '㎡',
      quantity: flooringQty,
      calculation: `居室床面積 ${flooringArea.toFixed(1)}㎡ × ${LOSS_RATE_10}`
    });
  }

  // 床見切り（DAIKEN MYフロア用）
  materials.push({
    category: '床材',
    name: '床見切り',
    spec: 'DAIKEN MYフロア ΔLL(I)-4用',
    unit: '本',
    quantity: 4,
    calculation: '標準4本'
  });

  // CF (クッションフロア) または フロアタイル
  // 7現場実績: 水回りフロアタイル貼り 1式
  const waterFloorFinish = overrides.water_floor_finish || 'CF';
  const waterproofFloorType = waterFloorFinish.includes('タイル') ? 'tile' : 'cf';
  materials.push({
    category: '床材',
    name: waterproofFloorType === 'tile' ? '水回りフロアタイル貼り' : 'クッションフロア貼り',
    spec: waterproofFloorType === 'tile' ? 'サンゲツ フロアタイル IS' : 'サンゲツ Hフロア 洗面室・トイレ',
    unit: '式',
    quantity: 1,
    calculation: '水回り一式'
  });

  // 玄関土間フロアタイル
  if (tileArea > 0 || overrides.entrance_floor === 'tile') {
    materials.push({
      category: '床材',
      name: '玄関土間フロアタイル貼り',
      spec: 'LIXIL エコカラット or 600角磁器質タイル',
      unit: '式',
      quantity: 2,
      calculation: '玄関土間'
    });
  }

  // ラワンベニヤ 9mm 3×6 (水回りフロアタイル下地 + 床暖房下地 + フローリング下地更新)
  // 54ファイル実績: 4〜19枚（用途により変動）
  // - 水回りリフロアタイル下地: 4〜5枚
  // - 床暖房新規導入下地: 3〜4枚
  // - フローリング下地更新: 5〜12枚
  let rawanSheets = Math.max(Math.ceil((cfArea / PB_SHEET_SIZE_3x6) * LOSS_RATE_10), 4);
  // 床暖房がある場合は追加
  const hasFloorHeatingForRawan = (overrides.floor_heating && overrides.floor_heating.includes('あり')) ||
    data.special?.some(s => s.type === 'floor_heating' || s.type === '床暖房');
  if (hasFloorHeatingForRawan) {
    rawanSheets += 3; // 床暖房下地用
  }
  // 大型物件（70㎡以上）はフローリング下地更新分を追加
  if (totalFloorArea >= 70) {
    rawanSheets += 5;
  }
  // 実績に基づく範囲制限: 4〜19枚
  rawanSheets = Math.min(Math.max(rawanSheets, 4), 19);
  materials.push({
    category: '下地材',
    name: 'ラワンベニヤ 9mm 3×6',
    spec: '水回りフロアタイル下地',
    unit: '枚',
    quantity: rawanSheets,
    calculation: `水回り+床暖房+下地更新（4〜19枚）`
  });

  // ラワンランバー 24mm 3×8（フローリング下地用）
  // 7現場実績: 1～2枚
  materials.push({
    category: '下地材',
    name: 'ラワンランバー 24mm 3×8',
    spec: 'フローリング下地',
    unit: '枚',
    quantity: 2,
    calculation: '標準2枚'
  });

  // === 巾木 ===
  // アルファステイツ実績: 木製巾木3,615m/67戸 = 約54m/戸
  // 床面積係数: 54m / 65.8㎡ ≒ 0.82m/㎡
  const habakiCoeff = 0.82;

  const totalWallLength = partitionWallLength + structuralWallLength;
  let habakiLength = Math.ceil(totalFloorArea * habakiCoeff);
  const layoutTypeForHabaki = data.layout_type || '';

  // 間取りによる調整（下限の底上げのみ。1LDKの上限35mは下記参照）
  if (layoutTypeForHabaki.includes('3LDK') || layoutTypeForHabaki.includes('4LDK')) {
    habakiLength = Math.max(habakiLength, 50);
  } else if (layoutTypeForHabaki.includes('2LDK')) {
    habakiLength = Math.max(habakiLength, 40);
  } else if (layoutTypeForHabaki.includes('1LDK')) {
    // ※ 1LDKの上限35mもアルファのリノベ実績帯だが、別府9タイプに1LDKが無く比較データが無いため
    //   今回は触らない（帯外実測が確認できていないものを推測で動かさない）。1LDK実測が手に入り次第見直す
    habakiLength = Math.min(habakiLength, 35);
  }

  // 旧: Math.min(Math.max(habakiLength, 30), 60) → 別府7/9タイプが60mで頭打ち
  //   （H=106.85m→-44% / I=102.14m→-41% / G=88.48m→-32%）。実績帯[30,60]はアルファ67㎡級の値で、
  //   90〜117㎡級の住戸には物理的に足りない。
  //
  // 【床面積比の部位capは置かない（2026-07-24 M-2）】壁PBと同じく出力は床面積の固定倍
  //   （0.82m/㎡）で、床面積比の上限1.5m/㎡とは常に比55%＝**到達不能**だった。唯一発火したのは上の
  //   間取り別の最低値（3LDK=50m）を打ち消すケースで、床20㎡の住戸で50m→30mに下げる
  //   **誤発火**（暴走の抑制ではなく最低値の破壊）だった。
  //
  // 【ただし絶対上限は置く（2026-07-24 MF-1）】壁PBと同じ理由。層0/層1が発火しない帯
  //   （decl=150/rooms=187 で巾木154m）を受け止める最終防波堤。
  //   ※ 上の間取り別の最低値（3LDK=50m 等）より**後**に置く。最低値は「小さすぎる側の底上げ」で
  //     上限とは方向が逆、かつ最低値の最大は50m＜上限150mなので打ち消し合わない
  //     （M-2で問題になった「capが最低値を破壊する誤発火」はここでは構造的に起きない）。
  let habakiCalcNote = `床面積 ${totalFloorArea.toFixed(1)}㎡ × ${habakiCoeff}m/㎡`;
  const habakiCapped = applyAbsoluteCap({
    value: habakiLength, absoluteMax: HABAKI_ABSOLUTE_MAX_M,
    field: 'habaki_absolute_cap', label: '木製巾木', unit: 'm',
    basis: '別府H 106.9m（床≈107.6㎡）',
  });
  habakiLength = habakiCapped.value;
  if (habakiCapped.note) habakiCalcNote = habakiCapped.note;
  //   ※ 過少側の警告も間取り別の最低値（50/40m）が先に効くため、最低値が適用されない
  //     間取り不明のケースでのみ実効的に鳴る。
  warnIfTooSmall({
    value: habakiLength, minRatio: HABAKI_MIN_M_PER_FLOOR_SQM,
    field: 'habaki_length_small', label: '木製巾木', unit: 'm',
    basis: '別府B 43.8m/48.7㎡=0.90m/㎡',
    suppressed: habakiCapped.note !== null, // 上限で書き換えた値を「過少」と鳴らさない（MF-1）
  });

  materials.push({
    category: '造作材',
    name: '木製巾木',
    spec: packageSpecs?.habaki || 'ニホンフラッシュ LM-9KJ H=40',
    unit: 'm',
    quantity: habakiLength,
    calculation: habakiCalcNote
  });

  // 木製巾木出隅役物
  // アルファステイツ実績: 672箇所/67戸 = 約10箇所/戸
  const habakiCornerCount = Math.ceil(habakiLength / 5);
  materials.push({
    category: '造作材',
    name: '木製巾木出隅役物',
    spec: '4R対応折曲',
    unit: '箇所',
    quantity: habakiCornerCount,
    calculation: `巾木長さ ${habakiLength}m ÷ 5m`
  });

  // 樹脂巾木（玄関用）
  // アルファステイツ実績: 242m/67戸 = 約3.6m/戸
  materials.push({
    category: '造作材',
    name: '樹脂巾木',
    spec: '玄関用 カイダーベースボード SC型 H=60',
    unit: 'm',
    quantity: 4,
    calculation: '標準4m（実績値）'
  });

  // 玄関SD見切縁
  // アルファステイツ実績: 319m/67戸 = 約4.8m/戸
  materials.push({
    category: '造作材',
    name: '玄関見切縁',
    spec: '創建 ビニール見切縁 PDD-10',
    unit: 'm',
    quantity: 5,
    calculation: '標準5m（実績値）'
  });

  // 玄関廻り壁面木
  // アルファステイツ実績: 319m/67戸 = 約4.8m/戸
  materials.push({
    category: '造作材',
    name: '玄関廻り壁面木',
    spec: '4R型コーナーパット',
    unit: 'm',
    quantity: 5,
    calculation: '標準5m（実績値）'
  });

  // === 点検口 ===
  // アルファステイツ実績: 天井点検口 67箇所/67戸 = 1箇所/戸
  materials.push({
    category: '造作材',
    name: '天井点検口',
    spec: '450角 ブルズ JKN45SV',
    unit: '箇所',
    quantity: 1,
    calculation: '標準1箇所（実績値）'
  });

  // === カーテンボックス ===
  // アルファステイツ実績: 各タイプ約1箇所/戸
  materials.push({
    category: '造作材',
    name: 'カーテンボックス',
    spec: '合板t12+PBt9.5 クロス巻込み W210×H150',
    unit: '箇所',
    quantity: 1,
    calculation: 'LD用 標準1箇所'
  });

  // === 額縁 ===
  // アルファステイツ実績: 三方額縁123箇所+四方額縁164箇所/67戸 = 約4箇所/戸
  // 窓数から推定
  const frameCount = Math.max(windowCount, 3);
  materials.push({
    category: '造作材',
    name: '額縁',
    spec: 'オレフィンシート貼 三方・四方',
    unit: '箇所',
    quantity: frameCount,
    calculation: `窓数 ${windowCount}箇所`
  });

  // UB三方枠
  // アルファステイツ実績: 67箇所/67戸 = 1箇所/戸
  materials.push({
    category: '造作材',
    name: 'UB三方枠',
    spec: 'カイダーベースボード S-40〜60 W758×H1919',
    unit: '箇所',
    quantity: 1,
    calculation: '標準1箇所（実績値）'
  });

  // === 置床・床下地 ===
  // アルファステイツ実績（内装工事シートより）:
  // - 乾式置床 H200: 251㎡/67戸 = 約3.75㎡/戸 (トイレ・パウダールーム)
  // - 床下地合板 t-9.0: 323㎡/67戸 = 約4.8㎡/戸

  // 乾式置床（パウダールーム・トイレ用）
  // ※ UBはユニットバス架台のため置床対象外（cfAreaから除く）。G正解3.9㎡/戸
  const okiyukaBase = Math.max(cfArea - ubArea, 0);
  const okiyukaQty = Math.max(Math.round(okiyukaBase * 10) / 10, 3);
  materials.push({
    category: '床材',
    name: '乾式置床',
    spec: 'H200 トイレ・パウダールーム用',
    unit: '㎡',
    quantity: okiyukaQty,
    calculation: `パウダールーム・トイレ床 ${okiyukaBase.toFixed(1)}㎡（UB除く）`
  });

  // 床下地合板（置床上）
  materials.push({
    category: '下地材',
    name: '床下地合板',
    spec: 't-9.0 3×6 置床上',
    unit: '㎡',
    quantity: Math.round(okiyukaQty * LOSS_RATE_5 * 10) / 10,
    calculation: `置床面積 ${okiyukaQty}㎡ + ロス${Math.round((LOSS_RATE_5 - 1) * 100)}%`
  });

  // === 建具沓摺 ===
  // アルファステイツ実績（木工事シートより）:
  // - LD開戸沓摺: 57m/67戸 ≒ 0.85m/戸 → バリアフリー床見切り
  // - 開戸沓摺: 225m/67戸 ≒ 3.4m/戸
  // - 引戸沓摺: 199m/67戸 ≒ 3.0m/戸
  // - クローゼット沓摺: 163m/67戸 ≒ 2.4m/戸

  // 建具タイプ別カウント
  const doorOpenCount = openings.filter(o =>
    o.type === '開き戸' || o.type === 'door' || o.type === '片開き戸'
  ).length || Math.ceil(doorCount * DOOR_OPEN_RATIO);
  const doorSlideCount = openings.filter(o =>
    o.type === '引戸' || o.type === '片引戸' || o.type === '引違い戸'
  ).length || Math.ceil(doorCount * DOOR_SLIDE_RATIO);
  const doorFoldCount = openings.filter(o =>
    o.type === '折戸' || o.type === 'クローゼット' || o.type === '収納'
  ).length || Math.ceil(doorCount * DOOR_FOLD_RATIO);

  // LD開戸沓摺（バリアフリー床見切り）
  materials.push({
    category: '造作材',
    name: 'LD開戸沓摺',
    spec: 'バリアフリー床見切り',
    unit: 'm',
    quantity: 1,
    calculation: '標準1m（実績値）'
  });

  // 開戸沓摺
  const kutsuzuriDoorLength = Math.ceil(doorOpenCount * KUTSUZURI_DOOR_LENGTH);
  materials.push({
    category: '造作材',
    name: '開戸沓摺',
    spec: 'アルミ製',
    unit: 'm',
    quantity: Math.max(kutsuzuriDoorLength, 3),
    calculation: `開戸 ${doorOpenCount}枚 × ${KUTSUZURI_DOOR_LENGTH}m`
  });

  // 引戸沓摺
  const kutsuzuriSlideLength = Math.ceil(doorSlideCount * KUTSUZURI_SLIDE_LENGTH);
  materials.push({
    category: '造作材',
    name: '引戸沓摺',
    spec: 'アルミ製',
    unit: 'm',
    quantity: Math.max(kutsuzuriSlideLength, 3),
    calculation: `引戸 ${doorSlideCount}枚 × ${KUTSUZURI_SLIDE_LENGTH}m`
  });

  // クローゼット沓摺
  const kutsuzuriClosetLength = Math.ceil(doorFoldCount * KUTSUZURI_CLOSET_LENGTH);
  materials.push({
    category: '造作材',
    name: 'クローゼット沓摺',
    spec: 'アルミ製',
    unit: 'm',
    quantity: Math.max(kutsuzuriClosetLength, 2),
    calculation: `折戸 ${doorFoldCount}枚 × ${KUTSUZURI_CLOSET_LENGTH}m`
  });

  // 天井クロス（サンゲツ SP 量産クロス）
  // 意匠図仕上表: サンゲツ 量産クロス
  // 54ファイル実績: 52〜75㎡
  // 範囲制限を適用
  let ceilingClothArea = Math.ceil(ceilingArea);
  ceilingClothArea = Math.min(Math.max(ceilingClothArea, 52), 75);
  materials.push({
    category: '仕上材',
    name: '天井クロス貼り',
    spec: 'サンゲツ SP（量産クロス）',
    unit: '㎡',
    quantity: ceilingClothArea,
    calculation: `天井面積 ${ceilingArea.toFixed(1)}㎡（52〜75㎡）`
  });

  // 壁クロス（サンゲツ SP 量産クロス）
  // 意匠図仕上表: サンゲツ 量産クロス
  // 54ファイル実績: 187〜270㎡
  // 範囲制限を適用
  let wallClothArea = Math.ceil(wallArea);
  wallClothArea = Math.min(Math.max(wallClothArea, 187), 270);
  materials.push({
    category: '仕上材',
    name: '壁クロス貼り',
    spec: 'サンゲツ SP（量産クロス）',
    unit: '㎡',
    quantity: wallClothArea,
    calculation: `壁面積 ${wallArea.toFixed(1)}㎡（187〜270㎡）`
  });

  // アクセントクロス（サンゲツ 1000番台）
  // 7現場実績: 10㎡が標準
  materials.push({
    category: '仕上材',
    name: 'アクセントクロス貼り',
    spec: 'サンゲツ 1000番台',
    unit: '㎡',
    quantity: 10,
    calculation: '標準10㎡'
  });

  // クロス新規下地処理
  materials.push({
    category: '仕上材',
    name: 'クロス新規下地処理',
    spec: '',
    unit: '人工',
    quantity: 2,
    calculation: '標準2人工'
  });

  // ダイノックシート貼り（玄関扉）
  materials.push({
    category: '仕上材',
    name: 'ダイノックシート貼り',
    spec: '玄関扉',
    unit: 'm',
    quantity: 2,
    calculation: '玄関扉'
  });

  // ダイノックシート貼り（窓枠）
  // 7現場実績: 4～5m
  materials.push({
    category: '仕上材',
    name: 'ダイノックシート貼り',
    spec: '窓枠',
    unit: 'm',
    quantity: 5,
    calculation: '窓枠'
  });

  // === 建具詳細 ===
  // アルファステイツ実績: 片開き戸約6枚、片引き戸約1.4枚、折戸約2.5枚/戸

  // 片開き戸
  const singleDoorCount = doorOpenCount > 0 ? doorOpenCount : PER_UNIT.door_single_total;
  materials.push({
    category: '建具',
    name: '片開き戸',
    spec: packageSpecs?.doors || 'ニホンフラッシュ WD-1TA〜6C W600〜850×H2080〜2175',
    unit: '枚',
    quantity: singleDoorCount,
    calculation: `実績値 約${PER_UNIT.door_single_total}枚/戸`
  });

  // 片引き戸
  const slideDoorCount = doorSlideCount > 0 ? doorSlideCount : PER_UNIT.door_slide_total;
  materials.push({
    category: '建具',
    name: '片引き戸',
    spec: 'ニホンフラッシュ WD-8A/8B W660〜760×H2075〜2170',
    unit: '枚',
    quantity: slideDoorCount,
    calculation: `実績値 約${PER_UNIT.door_slide_total}枚/戸`
  });

  // 2枚折戸（クローゼット用）
  const foldDoorCount = doorFoldCount > 0 ? doorFoldCount : PER_UNIT.door_fold_total;
  materials.push({
    category: '建具',
    name: '2枚折戸',
    spec: 'ニホンフラッシュ WD-12/120系 W605〜983×H2080〜2320',
    unit: '枚',
    quantity: foldDoorCount,
    calculation: `実績値 約${PER_UNIT.door_fold_total}枚/戸`
  });

  // 下駄箱（トール 2070×800）
  // アルファステイツ実績: 58台/67戸 ≒ 1台/戸
  materials.push({
    category: '建具',
    name: '下駄箱',
    spec: 'トール W1200×D410×H1900 Panasonic ベリティス',
    unit: '台',
    quantity: 1,
    calculation: '標準1台（実績値）'
  });

  // === 家具工事 ===
  // アルファステイツ実績に基づく

  // リネン庫
  // アルファステイツ実績: 67台/67戸 = 1台/戸
  materials.push({
    category: '家具',
    name: 'リネン庫',
    spec: 'W320×D310×H2200 パウダールーム用',
    unit: '台',
    quantity: 1,
    calculation: '標準1台（実績値）'
  });

  // トイレ吊戸棚
  // アルファステイツ実績: 67台/67戸 = 1台/戸
  materials.push({
    category: '家具',
    name: 'トイレ吊戸棚',
    spec: 'W885〜950×D310×H702',
    unit: '台',
    quantity: 1,
    calculation: '標準1台（実績値）'
  });

  // キッチンカウンター
  // アルファステイツ実績: 67台/67戸 = 1台/戸
  materials.push({
    category: '家具',
    name: 'キッチンカウンター',
    spec: 'アイカ バリューエッジ t=28 表面材K-6001KN SW',
    unit: '箇所',
    quantity: 1,
    calculation: '標準1箇所（実績値）'
  });

  // 固定棚（クローゼット・WIC用）
  // アルファステイツ実績: 約1.4箇所/戸
  const storageDataForShelf = data.storage || [];
  const storageCountForShelf = storageDataForShelf.filter(s => s.type === 'closet' || s.has_makuradana).length;
  const fixedShelfCount = storageCountForShelf > 0 ? storageCountForShelf : 2;
  materials.push({
    category: '家具',
    name: '固定棚',
    spec: '南海プライウッド 中棚Cシリーズ同等',
    unit: '箇所',
    quantity: fixedShelfCount,
    calculation: `収納 ${fixedShelfCount}箇所`
  });

  // 可動棚（LD収納用）
  // アルファステイツ実績: 約1.4箇所/戸
  materials.push({
    category: '家具',
    name: '可動棚',
    spec: 'ポリ合板 T25 ダボレール共 2〜3段',
    unit: '箇所',
    quantity: 1,
    calculation: '標準1箇所（実績値）'
  });

  // 設備関連
  const equipment = data.equipment || {};
  // AIがサイズを数値（例: 1416）で返すことがあるため必ず文字列化する
  // （文字列前提の .includes() 呼び出しがTypeErrorでcalculate全体を落とすのを防ぐ）
  const asStr = (v) => (v == null ? '' : String(v));

  // UB（ユニットバス）
  // 意匠図設備リスト: LIXIL リノビオP / BW（Gタイプ等）、INAX BW（一部）
  // 54ファイル実績: 1216, 1317, 1416, 1418 の4サイズが多い
  const ubSize = asStr(equipment.ub_size) || '1216';
  let ubSpec = packageSpecs?.ub || 'LIXIL リノビオP';
  if (ubSize.includes('1616') || ubSize.includes('1618')) {
    ubSpec = packageSpecs?.ub || 'LIXIL リノビオP 1616 電気式浴室乾燥機付 アクセントパネル';
  } else if (ubSize.includes('1418')) {
    ubSpec = packageSpecs?.ub || 'LIXIL リノビオP 1418 電気式浴室乾燥機付';
  } else if (ubSize.includes('1416')) {
    ubSpec = packageSpecs?.ub || 'LIXIL リノビオP 1416 電気式浴室乾燥機付';
  } else if (ubSize.includes('1317')) {
    ubSpec = packageSpecs?.ub || 'LIXIL リノビオP 1317';
  } else {
    ubSpec = packageSpecs?.ub || 'LIXIL BW 1216';
  }
  materials.push({
    category: '設備',
    name: 'ユニットバス',
    spec: ubSpec,
    unit: '台',
    quantity: 1,
    calculation: `サイズ: ${ubSize}`
  });

  // キッチン
  const kitchenType = asStr(equipment.kitchen) || 'I型 2550';
  let kitchenSpec = packageSpecs?.kitchen || 'LIXIL ES 2550 スライド・食洗機あり';
  if (kitchenType.includes('L型')) {
    kitchenSpec = 'LIXIL ES L型 シンク側1800×コンロ側2100 スライド・食洗機あり';
  }
  materials.push({
    category: '設備',
    name: 'システムキッチン本体',
    spec: kitchenSpec,
    unit: '台',
    quantity: 1,
    calculation: kitchenType
  });

  // キッチンパネル
  materials.push({
    category: '設備',
    name: 'キッチンパネル',
    spec: '3×8',
    unit: '枚',
    quantity: 2,
    calculation: '標準2枚'
  });

  // 洗面台
  const washstandSize = asStr(equipment.washstand) || 'W750';
  let washstandSpec = packageSpecs?.washstand || 'LIXIL EV1000 (D500) フルスライド+三面鏡（スリムLED）ミドルグレード';
  if (washstandSize.includes('640') || washstandSize.includes('600')) {
    washstandSpec = 'TOTO 640角 PWP640N2W';
  }
  materials.push({
    category: '設備',
    name: '洗面化粧台',
    spec: washstandSpec,
    unit: '台',
    quantity: 1,
    calculation: washstandSize
  });

  // 洗面タオルレール
  materials.push({
    category: '設備',
    name: '洗面タオルレール',
    spec: 'カワジュン SC-611-XC',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // 洗濯パン
  materials.push({
    category: '設備',
    name: '洗濯パン',
    spec: 'TOTO 640角 PWP640N2W',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  // 洗濯機横引きトラップ
  materials.push({
    category: '設備',
    name: '洗濯機横引きトラップ',
    spec: 'TOTO PJ2008NW',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // 洗濯機用水栓
  materials.push({
    category: '設備',
    name: '洗濯機用水栓',
    spec: 'LIXIL LF-WJ50KQA',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // ランドリー収納
  materials.push({
    category: '設備',
    name: 'ランドリー収納',
    spec: 'アイカ YCGB51H',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // トイレ
  materials.push({
    category: '設備',
    name: 'トイレ本体',
    spec: packageSpecs?.toilet || 'TOTO 一体型便器ZJ2 (ZR2)',
    unit: '台',
    quantity: 1,
    calculation: 'パッケージ仕様'
  });

  // トイレペーパーホルダー
  materials.push({
    category: '設備',
    name: 'トイレペーパーホルダー',
    spec: 'カワジュン SC-613-XC',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // トイレタオルレール
  materials.push({
    category: '設備',
    name: 'トイレタオルレール',
    spec: 'カワジュン SC-611-XC',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // トイレ吊戸棚
  materials.push({
    category: '設備',
    name: 'トイレ吊戸棚',
    spec: 'ワンド STO-60EN W600×D201×H600',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // 給湯器
  materials.push({
    category: '設備',
    name: '給湯器',
    spec: '20号追い焚き RUF-A2005SAW',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  // マルチリモコン
  materials.push({
    category: '設備',
    name: 'マルチリモコン',
    spec: 'MBC-240V(A)',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // 収納関連（枕棚+ハンガーパイプ）
  const storages = data.storage || [];
  let closetCount = storages.filter(s => s.type === 'closet' || s.has_makuradana).length;
  if (closetCount === 0) {
    closetCount = 3; // デフォルト3箇所
  }

  materials.push({
    category: '造作材',
    name: '枕棚取付',
    spec: '',
    unit: '箇所',
    quantity: closetCount,
    calculation: `収納 ${closetCount}箇所`
  });

  materials.push({
    category: '造作材',
    name: 'ハンガーパイプ取付',
    spec: '',
    unit: '箇所',
    quantity: closetCount,
    calculation: `収納 ${closetCount}箇所`
  });

  // 床暖房（オプション）
  // フロントエンドから 'あり（1箇所）' や 'あり（2箇所以上）' で送られる
  const hasFloorHeating = (overrides.floor_heating && overrides.floor_heating.includes('あり')) ||
    data.special?.some(s => s.type === 'floor_heating' || s.type === '床暖房');
  if (hasFloorHeating) {
    const floorHeatingArea = overrides.floor_heating_area || 2.7;
    const floorHeatingType = packageSpecs?.floor_heating || '電気式';
    materials.push({
      category: '設備',
      name: '床暖房',
      spec: floorHeatingType === 'ガス温水式' ? 'ガス温水式床暖房' : '電気式床暖房',
      unit: '㎡',
      quantity: floorHeatingArea,
      calculation: `${floorHeatingType} ${floorHeatingArea}㎡`
    });
  }

  // 室内窓（オプション）
  if (overrides.interior_window === 'あり' || data.special?.some(s => s.type === 'interior_window' || s.type === '室内窓')) {
    materials.push({
      category: '造作',
      name: '室内窓',
      spec: 'Panasonic 暮らし&リフォーム',
      unit: '箇所',
      quantity: 1,
      calculation: 'オプション'
    });
  }

  // カーテンレール設置
  materials.push({
    category: '内装材',
    name: 'カーテンレール設置',
    spec: '',
    unit: '箇所',
    quantity: 4,
    calculation: '標準4箇所'
  });

  // カーテンレール ダブル2m
  materials.push({
    category: '内装材',
    name: 'カーテンレール',
    spec: 'ダブル2m ホワイト トーソーAJ606',
    unit: '本',
    quantity: 4,
    calculation: '標準4本'
  });

  // レジスター
  materials.push({
    category: '内装材',
    name: 'レジスター',
    spec: 'Φ150',
    unit: '個',
    quantity: 3,
    calculation: '標準3個'
  });

  // スリーブキャップ
  materials.push({
    category: '内装材',
    name: 'スリーブキャップ',
    spec: 'Φ75 311-313',
    unit: '個',
    quantity: 3,
    calculation: '標準3個'
  });

  // 電気工事
  // 7現場実績: 照明器具が各現場で必須

  // ダウンライト（間取りから推定）
  let downlightCount = 20; // デフォルト2LDK
  const layoutType = data.layout_type || '';
  if (layoutType.includes('3LDK') || layoutType.includes('4LDK')) {
    downlightCount = 30;
  } else if (layoutType.includes('1LDK') || totalFloorArea < 40) {
    downlightCount = 15;
  }
  materials.push({
    category: '電気工事',
    name: 'ダウンライト',
    spec: '非調光 100W 電球色',
    unit: '台',
    quantity: downlightCount,
    calculation: `間取り ${layoutType} から推定`
  });

  // シーリングライト（部屋数+1）
  const ceilingLightCount = Math.max(rooms.length > 0 ? rooms.length + 1 : 4, 3);
  materials.push({
    category: '電気工事',
    name: 'シーリングライト',
    spec: 'ODELIC 調光調色 6～8畳',
    unit: '台',
    quantity: ceilingLightCount,
    calculation: `部屋数 ${rooms.length}室 + 共用部1台`
  });

  // 照明器具取付工事
  materials.push({
    category: '電気工事',
    name: '照明器具取付',
    spec: 'ダウンライト・シーリング含む',
    unit: '式',
    quantity: 1,
    calculation: '全照明取付工事'
  });

  // スイッチ・コンセント工事
  materials.push({
    category: '電気工事',
    name: 'スイッチ・コンセント工事',
    spec: '配線器具一式',
    unit: '式',
    quantity: 1,
    calculation: '全室配線器具'
  });

  // 単室換気扇（水回り用）
  materials.push({
    category: '電気工事',
    name: '単室換気扇',
    spec: '水回り用 三菱 VD-10ZC14',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【追加項目】54ファイル実績から確認された必須項目
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // === 解体工事 ===
  materials.push({
    category: '解体工事',
    name: '解体工事 表層 設備・建具',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '1式'
  });

  materials.push({
    category: '解体工事',
    name: '解体工事 表層 フローリング・カーペット',
    spec: '',
    unit: '式',
    quantity: 1.5,
    calculation: '1.5式'
  });

  materials.push({
    category: '解体工事',
    name: '解体廃材処分 表層 設備・建具',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '1式'
  });

  materials.push({
    category: '解体工事',
    name: '解体廃材処分 表層 フローリング・カーペット',
    spec: '',
    unit: '式',
    quantity: 1.5,
    calculation: '1.5式'
  });

  // === 仮設工事 ===
  materials.push({
    category: '仮設工事',
    name: '養生費',
    spec: '',
    unit: '基',
    quantity: 2,
    calculation: '標準2基'
  });

  // === 左官・タイル工事 ===
  materials.push({
    category: '左官工事',
    name: '玄関土間左官補修',
    spec: '',
    unit: '箇所',
    quantity: 1,
    calculation: '標準1箇所'
  });

  materials.push({
    category: '左官工事',
    name: '床左官補修',
    spec: 'レベラー無し',
    unit: '箇所',
    quantity: 1,
    calculation: '標準1箇所'
  });

  // === 大工工事（単価項目） ===
  // 天井下地工事
  materials.push({
    category: '大工工事',
    name: '天井下地',
    spec: 'PB9.5mm',
    unit: '㎡',
    quantity: Math.ceil(ceilingArea),
    calculation: `天井面積 ${ceilingArea.toFixed(1)}㎡`
  });

  // 壁下地工事
  materials.push({
    category: '大工工事',
    name: '壁下地',
    spec: 'PB12.5mm ※外周壁は既存下地',
    unit: '㎡',
    quantity: Math.ceil(wallArea * PARTITION_WALL_RATIO_30),
    calculation: `間仕切壁部分 約${(wallArea * PARTITION_WALL_RATIO_30).toFixed(1)}㎡`
  });

  // 玄関上がり框取付
  materials.push({
    category: '大工工事',
    name: '玄関上がり框取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  // 壁下地補強ベニヤ・合板貼り
  materials.push({
    category: '大工工事',
    name: '壁下地補強ベニヤ・合板貼り',
    spec: '',
    unit: '㎡',
    quantity: 10,
    calculation: '標準10㎡'
  });

  // 窓枠交換
  materials.push({
    category: '大工工事',
    name: '窓枠交換',
    spec: '',
    unit: '㎡',
    quantity: 1,
    calculation: '標準1㎡'
  });

  // === 設備工事 ===
  materials.push({
    category: '設備工事',
    name: '給排水配管部分更新',
    spec: '間仕切り残し同位置廻給排水',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: 'UB接続',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: '給湯器取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: 'トイレ取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: '洗面化粧台取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: '洗面所アクセサリー取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: '洗濯機パン取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: 'キッチンダクト配管工事',
    spec: '銀フレキ',
    unit: 'm',
    quantity: 3,
    calculation: '標準3m'
  });

  materials.push({
    category: '設備工事',
    name: 'トイレ・洗面・浴室ダクト配管工事',
    spec: 'アルミフレキ',
    unit: 'm',
    quantity: 2,
    calculation: '標準2m'
  });

  materials.push({
    category: '設備工事',
    name: '水回り用単室換気扇交換',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: 'エアコンスリーブキャップ取付',
    spec: '',
    unit: '箇所',
    quantity: 3,
    calculation: '標準3箇所'
  });

  // === ガス工事 ===
  materials.push({
    category: 'ガス工事',
    name: '既存ガス管撤去',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: 'ガス工事',
    name: '新規ガス管基本工事費',
    spec: 'コック20A付',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: 'ガス工事',
    name: 'ガス新規配管',
    spec: '白ガス、フレキ対',
    unit: 'm',
    quantity: 3,
    calculation: '標準3m'
  });

  materials.push({
    category: 'ガス工事',
    name: 'ガスコンロ繋ぎ',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: 'ガス工事',
    name: '給湯器繋ぎ',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  // === 電気工事（追加項目） ===
  materials.push({
    category: '電気工事',
    name: '電気部分新規配線',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '分電盤交換',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: 'ダウンライト追加配線',
    spec: '',
    unit: '箇所',
    quantity: 6,
    calculation: '標準6箇所'
  });

  materials.push({
    category: '電気工事',
    name: '食洗機用専用回路追加',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '浴室換気乾燥機専用回路追加',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '人感センサー・DL連光器設置',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: 'モニターホン取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '給湯器リモコン取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: 'レジスタ取付',
    spec: '',
    unit: '箇所',
    quantity: 3,
    calculation: '標準3箇所'
  });

  materials.push({
    category: '電気工事',
    name: '照明器具付け',
    spec: '開梱姿図',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '火災報知器取付',
    spec: '電池式',
    unit: '個',
    quantity: 4,
    calculation: '標準4個'
  });

  // === 電材 ===
  materials.push({
    category: '電材',
    name: '配線器具一式',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電材',
    name: 'TV端子',
    spec: '',
    unit: '個',
    quantity: 4,
    calculation: '標準4個'
  });

  materials.push({
    category: '電材',
    name: '人感スイッチ',
    spec: 'コスモ WTK1811WK',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  materials.push({
    category: '電材',
    name: '両切スイッチダウンライト 100W 電球色',
    spec: 'OD261898',
    unit: '台',
    quantity: 20,
    calculation: '標準20台'
  });

  materials.push({
    category: '電材',
    name: '調光器',
    spec: 'OL291216R 2700K電球色 L600',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  materials.push({
    category: '電材',
    name: 'テレビドアホン',
    spec: 'Panasonic VL-SE30XL',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  materials.push({
    category: '電材',
    name: '分電盤',
    spec: 'テンパール MAG35122 住宅用分電盤(2ケ付、横三列タイプ、単3、12+2、50A)',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  materials.push({
    category: '電材',
    name: '火災報知器（熱）',
    spec: 'SHK48455K',
    unit: '個',
    quantity: 3,
    calculation: '標準3個'
  });

  materials.push({
    category: '電材',
    name: '火災報知器（煙）',
    spec: 'SHK48155K',
    unit: '個',
    quantity: 2,
    calculation: '標準2個'
  });

  // === サッシ工事 ===
  materials.push({
    category: 'サッシ工事',
    name: '網戸張替え',
    spec: '',
    unit: '枚',
    quantity: 4,
    calculation: '標準4枚'
  });

  // === 現場管理 ===
  materials.push({
    category: '現場管理',
    name: '施工管理費（工程管理）',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '現場管理',
    name: '現場諸経費',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  // ルームクリーニング
  materials.push({
    category: '諸経費',
    name: 'ルームクリーニング',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  // 検査費
  materials.push({
    category: '諸経費',
    name: '検査費',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  // === 単価・金額計算 ===
  // 各資材に単価と金額を追加
  const materialsWithPrice = materials.map(item => {
    // 行が単価を明示している場合はそれを使う
    // （材積(m³)行が同名のm単価・㎡単価（際根太350円/m等）を誤って拾うのを防ぐ。0=単価未整備）
    if (typeof item.unit_price === 'number') {
      return { ...item, unit_price: item.unit_price, amount: Math.round(item.unit_price * item.quantity) };
    }

    // 資材名でUNIT_PRICESから単価を検索
    let unitPrice = UNIT_PRICES[item.name] || 0;

    // 名前が見つからない場合、部分一致で検索
    if (unitPrice === 0) {
      for (const [key, price] of Object.entries(UNIT_PRICES)) {
        if (item.name.includes(key) || key.includes(item.name)) {
          unitPrice = price;
          break;
        }
      }
    }

    // 金額計算
    const amount = Math.round(unitPrice * item.quantity);

    return {
      ...item,
      unit_price: unitPrice,
      amount: amount
    };
  });

  // カテゴリ別小計を計算
  const categoryTotals = {};
  materialsWithPrice.forEach(item => {
    if (!categoryTotals[item.category]) {
      categoryTotals[item.category] = 0;
    }
    categoryTotals[item.category] += item.amount;
  });

  // 総合計
  const grandTotal = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);

  return {
    materials: materialsWithPrice,
    summary: {
      total_floor_area: totalFloorArea,
      floor_area: flooringArea,
      water_floor_area: cfArea,
      tile_area: tileArea,
      wall_area: wallArea,
      wall_cloth_area: Math.ceil(wallArea),
      ceiling_area: ceilingArea,
      door_count: doorCount,
      window_count: windowCount,
      partition_wall_length: partitionWallLength,
      structural_wall_length: structuralWallLength,
      wall_pb_sqm: wallPb95Area,
      wall_pb_sheets: wallPb95Sheets,
      waterproof_pb_sqm: waterproofPb95Area,
      waterproof_pb_sheets: wallPbWaterSheets,
      ev_wall_pb_sqm: evWallPb95Area,
      ev_wall_pb_sheets: evWallPb95Sheets,
      sound_wall_pb_sqm: soundWallPbSqm,
      // 壁PB推定パスがどちらの式で計算されたか（'new'|'renovation'）。
      // 展開図ありの本番経路では applyElevationTakeoff が実測で置換するため表に出ない
      building_type: buildingProfile.type,
    },
    estimate: {
      category_totals: categoryTotals,
      grand_total: grandTotal,
      note: '仮単価による概算見積もり（税抜）'
    },
    // 計算由来の要確認警告（applyElevationTakeoffが後段でさらに push する場合もある）
    _warnings: calcWarnings.length > 0 ? calcWarnings : undefined,
  };
}
