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
  TIMBER_SECTIONS, timberVolumeM3, majikiriTimberLengthM, ceilingFrameLengthM, dobuchiLengthM,
} from './timberVolume.js';

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
const WALL_PB_REDUCTION = 0.6;            // 壁PBの両面係数削減（リノベ=片面のみ）
const GLASSWOOL_COVERAGE = 0.5;           // グラスウール充填率（間仕切壁の半分）

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
const KIWANETA_RATIO = 0.28;              // 際根太 = 床面積 × 0.28 (m)
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
  kaibe_wall: 45.42,         // 界壁面 PBt9.5+木胴縁 (㎡) → 5㎡/戸
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

  // 専有面積（validatorが確定した値・ユーザー入力優先）を数量計算の基礎に反映する
  // ※ AIが部屋を拾い落として部屋合計が専有面積より小さい場合、居室・天井が過小になる。
  //   不足分は「専有面積×0.96（内法相当）」までを居室床として補い、天井もそれに追従させる。
  //   部屋合計の方が大きい場合はvalidatorの按分補正済みなので触らない。
  const declaredArea = data.total_floor_area_sqm || 0;
  const netTarget = declaredArea > 0 ? declaredArea * 0.96 : 0;
  if (netTarget > totalFloorArea && totalFloorArea > 0) {
    const shortfall = netTarget - totalFloorArea;
    flooringArea += shortfall; // 拾い落ちは廊下・居室など内装対象が大半
    totalFloorArea = netTarget;
  } else if (totalFloorArea === 0 && netTarget > 0) {
    // 部屋を1つも拾えなかった場合は専有面積ベースで最低限の内装面積を確保
    flooringArea = netTarget;
    totalFloorArea = netTarget;
  }

  // 天井面積 (UB・CLを除く)
  const ubArea = rooms.filter(r => r.name?.includes('UB') || r.name?.includes('浴室')).reduce((sum, r) => sum + (r.area_sqm || 0), 0);
  const closetArea = rooms.filter(r => r.name?.includes('クローゼット') || r.name?.includes('クロゼット') || r.name?.includes('CL') || r.name?.includes('収納') || r.name?.includes('物入')).reduce((sum, r) => sum + (r.area_sqm || 0), 0);
  let ceilingArea = totalFloorArea - ubArea - closetArea;
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

  // 建具の型番はプロンプト改定で語彙が変わりうるため、
  // 「窓」でないもの＝建具（ドア類）として扱う（片開き戸/片引き戸/引違い戸/折戸すべてを拾う）
  openings.forEach(opening => {
    const type = opening.type || '';
    const isWindow = type === 'window' || type.includes('窓') || type.includes('サッシ') || type.includes('AW');
    if (isWindow) {
      windowCount++;
    } else if (type) {
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

  // === 石膏ボード ===

  // 壁PB t-9.5 (3'×6') - メイン壁用
  // アルファステイツ実績: 6,010枚/67戸 = 約90枚/戸
  // 床面積係数: 90枚 / 65.8㎡ ≒ 1.37枚/㎡
  const wallPbCoeff = 1.37;
  let wallPb95Sheets = Math.ceil(totalFloorArea * wallPbCoeff);
  // リノベの場合は少なめに調整（新築の60%程度）
  wallPb95Sheets = Math.ceil(wallPb95Sheets * WALL_PB_REDUCTION);
  wallPb95Sheets = Math.min(Math.max(wallPb95Sheets, 30), 90);
  const wallPb95Area = Math.round(wallPb95Sheets * PB_SHEET_SIZE_3x6 * 100) / 100;
  materials.push({
    category: '下地材',
    name: '壁 石膏ボード',
    spec: "t-9.5（3'×6'）910×1820mm",
    unit: '枚',
    quantity: wallPb95Sheets,
    calculation: `床面積 ${totalFloorArea.toFixed(1)}㎡ × ${wallPbCoeff}枚/㎡ × 0.6（リノベ係数）`
  });

  // 壁耐水PB t-9.5 - 水回り用
  // アルファステイツ実績: 280枚/67戸 = 約4枚/戸
  let wallPbWaterSheets = Math.ceil(cfArea / PB_SHEET_SIZE_3x6 * LOSS_RATE_20);
  wallPbWaterSheets = Math.min(Math.max(wallPbWaterSheets, 2), 7);
  const waterproofPb95Area = Math.round(wallPbWaterSheets * PB_SHEET_SIZE_3x6 * 100) / 100;
  materials.push({
    category: '下地材',
    name: '壁 耐水石膏ボード',
    spec: "耐水t-9.5（3'×6'）910×1820mm",
    unit: '枚',
    quantity: wallPbWaterSheets,
    calculation: `水回り面積 ${cfArea.toFixed(1)}㎡から算出`
  });

  // 天井PB t-9.5 (3'×6')
  // アルファステイツ実績: 2,810枚/67戸 = 約42枚/戸
  // 換算はプロXLS集計表の式に一致させる（77行: AD77=W77/X77・X77=1.45はロス込みの実係数。
  // ÷1.4や×1.05のロス率は使わない）。さらに74行「ﾊﾟｳﾀﾞｰﾙｰﾑ・ﾄｲﾚ天井ボード」=4枚/戸を
  // ㎡換算とは別枠で確保するため、該当小部屋の天井面積を㎡換算から控除して+4枚を加算する:
  //   天井PB/戸 = (天井面積 − パウダールーム・トイレ天井面積) ÷ 1.45 + 4枚
  // Gタイプ検算: (59.087−(1.33+3.381))/1.45 + 4 = 41.5枚/戸（AD列373.749÷9戸と一致）
  const CEILING_PB_SQM_PER_SHEET = 1.45; // 集計表X77
  const POWDER_TOILET_PB_SHEETS = 4;     // 集計表74行（ﾊﾟｳﾀﾞｰﾙｰﾑ・ﾄｲﾚ天井ボード 4枚/戸）
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
  ceilingPb95Sheets = Math.min(Math.max(ceilingPb95Sheets, 20), 50);
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
  // アルファステイツ実績: 340枚/67戸 = 約5.1枚/戸
  materials.push({
    category: '下地材',
    name: 'マルチクロゼット・WIC・CLRC面 石膏ボード',
    spec: "t-9.5（3'×6'）910×1820mm",
    unit: '枚',
    quantity: 5,
    calculation: '標準5枚（67戸実績）'
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
  let glasswoolArea = Math.ceil(partitionWallLength * ceilingHeight * GLASSWOOL_COVERAGE);
  glasswoolArea = Math.min(Math.max(glasswoolArea, 5), 15);
  materials.push({
    category: '下地材',
    name: '間仕切 グラスウール充填',
    spec: "t-50 24kg/m3",
    unit: '㎡',
    quantity: glasswoolArea,
    calculation: `間仕切壁 ${partitionWallLength.toFixed(1)}m × ${ceilingHeight.toFixed(1)}m × ${GLASSWOOL_COVERAGE}`
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

  // 際根太 45×30
  // 実績: 18.2m/戸
  const kiwanetaLength = Math.max(Math.ceil(totalFloorArea * KIWANETA_RATIO), 18);
  materials.push({
    category: '下地材',
    name: '際根太',
    spec: '45×30 米栂1等',
    unit: 'm',
    quantity: kiwanetaLength,
    calculation: `床面積 ${totalFloorArea.toFixed(1)}㎡ × ${KIWANETA_RATIO}（実績18.2m/戸）`
  });

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
  materials.push({
    category: '下地材',
    name: '際根太',
    spec: 'LVL 30×45',
    unit: 'm³',
    quantity: timberVolumeM3(TIMBER_SECTIONS.kiwaneta, kiwanetaLength),
    unit_price: 0,
    calculation: `際根太 ${kiwanetaLength}m × 断面45×30（実績0.027m³/戸）`
  });
  const majikiriTimberLen = majikiriTimberLengthM(majikiriLength);
  materials.push({
    category: '下地材',
    name: '間仕切木軸',
    spec: 'LVL 30×45',
    unit: 'm³',
    quantity: timberVolumeM3(TIMBER_SECTIONS.majikiri, majikiriTimberLen),
    unit_price: 0,
    calculation: `間仕切下地 ${majikiriLength} × 両面縦横@450 = ${Math.round(majikiriTimberLen)}m × 断面45×30（実績1.15m³/戸）`
  });
  // 木胴縁: RC面木の実績面積（収納内RC面7.5㎡ + 界壁面5㎡ + EV面）× 横胴縁@455
  const dobuchiSqm = ALPHA_STATS.closet_rc_wall / 9 + ALPHA_STATS.kaibe_wall / 9
    + (overrides.ev_insulation === 'あり' ? 9 : 2);
  const dobuchiLen = dobuchiLengthM(dobuchiSqm);
  materials.push({
    category: '下地材',
    name: '木胴縁（界壁面）',
    spec: 'LVL 30×45',
    unit: 'm³',
    quantity: timberVolumeM3(TIMBER_SECTIONS.dobuchi, dobuchiLen),
    unit_price: 0,
    calculation: `RC面木 ${dobuchiSqm.toFixed(1)}㎡ × 横胴縁@455 = ${Math.round(dobuchiLen)}m × 断面45×30（実績0.054m³/戸）`
  });
  const ceilingFrameLen = ceilingFrameLengthM(ceilingArea);
  materials.push({
    category: '下地材',
    name: '天井下地',
    spec: 'LVL 30×40',
    unit: 'm³',
    quantity: timberVolumeM3(TIMBER_SECTIONS.ceiling, ceilingFrameLen),
    unit_price: 0,
    calculation: `天井 ${ceilingArea.toFixed(1)}㎡ × 野縁@303格子+吊木 = ${Math.round(ceilingFrameLen)}m × 断面40×30（実績0.57m³/戸）`
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

  // 間取りによる調整
  if (layoutTypeForHabaki.includes('3LDK') || layoutTypeForHabaki.includes('4LDK')) {
    habakiLength = Math.max(habakiLength, 50);
  } else if (layoutTypeForHabaki.includes('2LDK')) {
    habakiLength = Math.max(habakiLength, 40);
  } else if (layoutTypeForHabaki.includes('1LDK')) {
    habakiLength = Math.min(habakiLength, 35);
  }

  // 実績に基づく範囲制限: 30〜60m
  habakiLength = Math.min(Math.max(habakiLength, 30), 60);

  materials.push({
    category: '造作材',
    name: '木製巾木',
    spec: packageSpecs?.habaki || 'ニホンフラッシュ LM-9KJ H=40',
    unit: 'm',
    quantity: habakiLength,
    calculation: `床面積 ${totalFloorArea.toFixed(1)}㎡ × ${habakiCoeff}m/㎡`
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
      sound_wall_pb_sqm: soundWallPbSqm
    },
    estimate: {
      category_totals: categoryTotals,
      grand_total: grandTotal,
      note: '仮単価による概算見積もり（税抜）'
    }
  };
}
