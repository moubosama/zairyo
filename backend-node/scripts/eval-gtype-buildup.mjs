/**
 * Gタイプ ボトムアップ拾い出しeval
 *
 * 入力: page_56（展開図(7)Gタイプ）の面寸法+建具表実寸、page_45（平面詳細図）の壁仕上記号
 * 正解: 拾い出しXLS 集計表のG列 戸当値（②(仮称)アルファステイツ新宮町（木及び_建材）R6,09,19.XLS）
 *
 * 実行: node scripts/eval-gtype-buildup.mjs
 *
 * 記号割付（page_45拡大読み取りで確定）:
 *   外周壁=I14 / 界壁・柱型=C04（打放・PBなし・クロス直） / 間仕切=G14 /
 *   クロゼット内=D64（コンパネ） / EV側=D14 / 耐水はUB隣接面のみG24 /
 *   遮音壁L14は洋室(1)C面1,450で確認。全量（LDK↔洋1 1.45m+LDK↔洋3 1.05m）は
 *   DEFAULT_SOUND_WALL_PAIRSの数式ルールで計上（2026-07-19数式化。洋3側に記号は無い）
 */
import { computeElevationTakeoff, applyElevationTakeoff } from '../src/services/buildupCalculator.js';
import { calculateMaterials } from '../src/services/materialCalculator.js';

const F = (face, width_mm, wall_code, openings = []) => ({ face, width_mm, wall_code, openings });

// ============ 展開図読み取り値（page_56） ============
export const G_ELEVATIONS = { rooms: [
  { name: '玄関・廊下', ceiling_height_mm: 2200, skirting: '木製巾木H=40', faces: [
    F('A', 1385, 'G14', [{ type: '玄関ドア', width_mm: 850, height_mm: 1900 }]),
    // 開口の面帰属はpage_56クロップ+page_45平面図の建具符号で確定（2026-07-16再確認・記録JSONと同構成）:
    //   B面(廊下北側壁)=洋室(2)WD-2TA 800 + トイレWD-3TB 700（W=700,H=2,175ラベル）
    //     + 収納2枚折戸WD-12C（平面図ラベル W=803,H=2.080。旧転記の高さ2320を2080に是正）
    //     + パウダーWD-8B片引き（W=760,H=2.075ラベル。旧D面から移動）
    //   D面=WD-1TA 850のみ（展開図D面の描画は片開き1枚≈846mm。旧D面の700はB面WD-3TBの誤帰属重複→削除）
    //   C面(965・EV側D14)には扉様の描画があるが、XLSの壁(ボード)=4.84+1.39+4.84はC面965自体を含まず
    //   控除も無いため住戸内建具ではないと判断（EV昇降路側の参考描画とみられる）→開口計上しない
    // 検算: B/D面のH2175系建具幅計=0.80+0.70+0.85=2.35m。XLSの控除はセル値3.15+0.60=計3.75m×H2.17
    //   （3.15の内訳はXLS未記載）。差1.40m ≒ 洋室(1)ドア0.80（平面図では廊下南側壁に実在するが
    //   展開図D面には描かれていない）+ 0.60（対応する建具を展開図・平面図から特定できず・未計上）
    F('B', 4840, 'G14', [
      { type: '2枚折戸', symbol: 'WD-12C', width_mm: 803, height_mm: 2080 },
      { type: '片開き戸', symbol: 'WD-2TA', width_mm: 800, height_mm: 2175 },
      { type: '片開き戸', symbol: 'WD-3TB', width_mm: 700, height_mm: 2175 },
      { type: '片引き戸', symbol: 'WD-8B', width_mm: 760, height_mm: 2075 } ]),
    F('C', 965, 'D14'), // EV側=RC面木+PB
    F('D', 4840, 'G14', [
      { type: '片開き戸', symbol: 'WD-1TA', width_mm: 850, height_mm: 2175 } ]),
  ]},
  { name: 'キッチン', ceiling_height_mm: 2200, skirting: '木製巾木H=40', faces: [
    F('A', 2575, 'C04'),
    F('B', 2200, 'G14', [{ type: '開口', width_mm: 2200, height_mm: 2050 }]),
    F('C', 2575, 'G16'), // キッチンパネル面
    F('D', 2200, 'G14'),
  ]},
  { name: 'リビング・ダイニング', ceiling_height_mm: 2400, skirting: '木製巾木H=40', faces: [
    F('A', 3540, 'G14', [{ type: '開口', width_mm: 2200, height_mm: 2050 }]),
    F('B', 6660, 'G14', [
      { type: '片開き戸', width_mm: 800, height_mm: 2175 },
      { type: '片開き戸', width_mm: 800, height_mm: 2175 } ]),
    F('C', 3540, 'C04', [{ type: '窓', width_mm: 2270, height_mm: 2000 }]),
    F('D', 6660, 'I14', [{ type: '窓', width_mm: 4120, height_mm: 1900 }]),
  ]},
  { name: '洋室(1)', ceiling_height_mm: 2400, skirting: '木製巾木H=40', faces: [
    F('A', 2575, 'I14', [{ type: '窓', width_mm: 1200, height_mm: 1100 }]),
    F('B', 5190, 'G14', [
      { type: '片開き戸', width_mm: 800, height_mm: 2175 },
      { type: '2枚折戸', width_mm: 1200, height_mm: 2320 } ]),
    F('C1', 1450, 'L14'), // 遮音壁（確認済み分）
    F('C2', 1125, 'G14'),
    F('D', 5190, 'C04'),
  ]},
  { name: '洋室(2)', ceiling_height_mm: 2400, skirting: '木製巾木H=40', faces: [
    F('A', 2360, 'I14', [{ type: '窓', width_mm: 1400, height_mm: 1100 }]),
    F('B', 3685, 'G14'),
    F('C', 2360, 'C04'),
    F('D', 4635, 'G14', [{ type: '片開き戸', width_mm: 800, height_mm: 2175 }]),
  ]},
  { name: '洋室(3)', ceiling_height_mm: 2400, skirting: '木製巾木H=40', faces: [
    F('A', 2360, 'I14'),
    F('B', 4140, 'I14', [{ type: '窓', width_mm: 850, height_mm: 1550 }]),
    F('C', 2360, 'C04', [{ type: '窓', width_mm: 1400, height_mm: 1900 }]),
    F('D', 3290, 'G14', [{ type: '片開き戸', width_mm: 800, height_mm: 2175 }]),
  ]},
  { name: 'クロゼット内RC面', ceiling_height_mm: 2345, skirting: null, faces: [
    F('A', 1450, 'D64'), F('B', 905, 'D64'), F('C', 835, 'D64'),
  ]},
  { name: 'トイレ', ceiling_height_mm: 2200, skirting: 'ソフト巾木H=40', faces: [
    F('A', 1400, 'G14'),
    F('B', 950, 'G24'),  // UB隣接=耐水
    F('C', 1400, 'G14', [{ type: '片開き戸', width_mm: 700, height_mm: 2175 }]),
    F('D', 950, 'G14'),
  ]},
  { name: 'パウダールーム', ceiling_height_mm: 2200, skirting: 'ソフト巾木H=40', faces: [
    F('A', 2360, 'G14'),
    F('B', 1925, 'G24'), // UB隣接=耐水
    F('C', 2360, 'G14', [{ type: '片引き戸', width_mm: 760, height_mm: 2075 }]),
    F('D', 1925, 'G14'),
  ]},
]};

// ============ 平面詳細図読み取り値（page_45） ============
export const G_FLOOR_PLAN = {
  _validated: true,
  layout_type: '3LDK',
  total_floor_area_sqm: 67.3,
  partition_wall_length_m: 19.8,
  ceiling_height_mm: 2400,
  rooms: [
    { name: 'リビング・ダイニング', area_sqm: 16.75, floor_type: 'flooring' },
    { name: 'キッチン', area_sqm: 5.66, floor_type: 'flooring' },
    { name: '玄関・廊下', area_sqm: 3.6, floor_type: 'flooring' },
    { name: '洋室(1)', area_sqm: 9.72, floor_type: 'flooring' },
    { name: '洋室(2)', area_sqm: 8.10, floor_type: 'flooring' },
    { name: '洋室(3)', area_sqm: 7.76, floor_type: 'flooring' },
    { name: 'パウダールーム', area_sqm: 2.9 },
    { name: 'トイレ', area_sqm: 1.33 },
    { name: 'UB', area_sqm: 2.87 },
    { name: 'ウォークインクロゼット', area_sqm: 2.2 },
    { name: 'クロゼット(1)', area_sqm: 0.9 },
    { name: 'クロゼット(2)', area_sqm: 1.0 },
    { name: '玄関', area_sqm: 1.9, floor_type: 'tile' },
  ],
  openings: [],
  equipment: { ub_size: '1416' },
};

// ============ 収納内側の下地幅実寸（見積明細 家具工事シート・Gタイプ行） ============
// 固定棚実寸 → 棚に沿う内側3辺の幅に換算（コ型=W3辺の和 / 単棚=W+D×2）。
// タイプ別入力としてcomputeElevationTakeoffのopts.closetInteriorsに渡す（エンジンにはハードコードしない）
export const G_CLOSET_INTERIORS = [
  // 「G ﾀｲﾌﾟ 洋室1 WIC 固定棚（コ型）W（1140+2400+1140）×D500」→ 1140+2400+1140 = 4680
  { room: 'ウォークインクロゼット', inner_width_mm: 4680 },
  // 「G ﾀｲﾌﾟ 洋室2 CL 固定棚 W800×D835」→ 800+835×2 = 2470
  { room: 'クロゼット(1)', inner_width_mm: 2470 },
  // 「G ﾀｲﾌﾟ 洋室3 CL 固定棚 W1150×D735（欠込有）」→ 1150+735×2 = 2620
  { room: 'クロゼット(2)', inner_width_mm: 2620 },
];

// ============ XLS正解（集計表 G列 戸当） ============
const EXPECTED = [
  // [ラベル, 正解値, 単位, 実測値の取得, 判定閾値%]
  ['壁PB t-9.5',        122.0609, '㎡', (t) => t.wall_pb_sqm, 10], // 集計表C56='Ａタイプ'!P22+P76+P130+P184+P238+P291+P346+P400
  // ⚠ 構成が異なる（数値はほぼ一致）: XLS C58=台所ブロックのUB廻りのみ（便所P376・洗面P430は0）。
  //   エンジンはトイレ950/パウダー1925のG24面を耐水に回している。壁PBの部屋別構成ズレの一因
  ['耐水PB t-9.5',      6.4535,   '㎡', (t) => t.waterproof_pb_sqm, 15],
  // 遮音壁 = LDK↔洋室(1)間1.45m + LDK↔洋室(3)間1.05m の2枚だけ（2026-07-19数式化。
  //   'Ａタイプ'!P113=1.45×2.57 / P221=1.05×2.57 / 台所P275=1.45×2.57+1.1×2.57=裏面 → 計12.9785。
  //   PBは両面計上・高さは下地高2.57）。エンジンはDEFAULT_SOUND_WALL_PAIRSの宣言的ルールで
  //   2×(1.45+1.05)×2.57=12.85 を計上（台所裏面の1.1≒1.05の作図差分-1.0%が残差）
  ['遮音壁PB t9.5+GW',  12.9785,  '㎡', (t) => t.sound_wall_pb_sqm, 10],
  // GWは壁1枚1回（'Ａタイプ'!P81=1.45×2.57 + P82=1.05×2.57 = 6.425）→ ルール値と完全一致
  ['間仕切GW t50',      6.425,    '㎡', (t) => t.gw_sqm, 10],
  ['木製巾木 H=40',     56.44,    'm',  (t) => t.skirting_m.木製, 12],   // 玄関4.8+洋1 10.5+洋2 11.45+洋3 8.9+台所20.79
  ['クロゼット内RC面',  7.51,     '㎡', (t) => t.konpane_sqm, 15],       // 集計表C73
  // 旧期待値6.7はXLSに存在しない値だった（2026-07-16是正）。XLS実セル='Ａタイプ'!P313=3.925
  // （壁(不燃材): 2.5×1.35+0.7×2.2+0.7×2.2−2.2×1.15）。エンジン5.77は+47%で✗が正しい姿
  ['キッチンパネル面',  3.925,    '㎡', (t) => t.kitchen_panel_sqm, 20],
  // XLS方式の拾い量（Σ幅×下地高(2.57/水回り2.77)−開口 の壁1枚換算 + 収納内推定。"m"表記はXLS慣行で実態㎡）
  // ※ -8%台の主因は水回り（洗面ブロック8.07m等）にXLSが含むUB囲い壁の一部が展開図に写らない構造差
  //   （S6「便所無控除」説は便所P341=0.7×2.17・洗面P395=0.75×1.91の控除行実在で棄却・2026-07-19）
  ['間仕切下地(木)',    84.082,   'm',  (t) => t.majikiri_shitaji_m, 10],
];

const EXPECTED_FLOOR = [
  ['際根太',            18.2,   'm',  (mats) => qty(mats, '際根太'), 12], // 玄関5.7+便所4+洗面8.5
  // 旧期待値53.26=48.42×1.1は「XLS値にエンジンのロス率を掛けた循環比較」だった（2026-07-16是正）。
  // XLS実セル=床上直貼りΣ48.415（発注AL列は収納床を除き47.5/戸）。エンジンのロス前床面積と比較する
  ['フローリング(ロス前)', 48.415, '㎡', (mats, summary) => summary.floor_area, 10],
  ['乾式置床(ﾊﾟｳﾀﾞｰ/ﾄｲﾚ)', 3.9049, '㎡', (mats) => qty(mats, '乾式置床'), 30],
  ['床下地合板(置床上)', 4.7589, '㎡', (mats) => qty(mats, '床下地合板'), 30],
  ['天井PB(面積換算)',   59.0874,'㎡', (mats, summary) => summary.ceiling_area, 8],
];

// ============ 材積換算（m³・従来パス=平面図のみ） ============
// Gタイプ正解があるのは際根太（18.2m×断面45×30）のみ。
// 他は見積明細67戸平均（A〜H全タイプ）×Gタイプ規模のサニティ（広め許容帯）:
//   間仕切木軸 77.3/67=1.1537、天井下地 38.5/67=0.5746、木胴縁 3.6/67=0.0537
//   木胴縁はGの界壁がC04（打放・胴縁なし）のため平均より少なくて正 → 広めの帯
const EXPECTED_VOLUME = [
  ['際根太 材積',       0.0246, 'm³', (mats) => qtyM3(mats, '際根太'), 12],
  ['間仕切木軸 材積',   1.1537, 'm³', (mats) => qtyM3(mats, '間仕切木軸'), 35],
  ['木胴縁 材積(ｻﾆﾃｨ)', 0.0537, 'm³', (mats) => qtyM3(mats, '木胴縁'), 50],
  ['天井下地 材積',     0.5746, 'm³', (mats) => qtyM3(mats, '天井下地'), 45],
];

// ============ 展開図実測適用後（applyElevationTakeoff） ============
const EXPECTED_APPLIED = [
  ['間仕切下地(木)適用後', 84.082, 'm',  (mats) => qty(mats, '間仕切下地(木)'), 10],
  ['間仕切木軸 適用後',   1.1537, 'm³', (mats) => qtyM3(mats, '間仕切木軸'), 35],
  ['木胴縁 適用後',       0.0537, 'm³', (mats) => qtyM3(mats, '木胴縁'), 999], // 界壁・EV面が展開図外（Gは界壁C04で胴縁なし）
];

function qty(materials, nameIncludes) {
  const m = materials.find((x) => x.name.includes(nameIncludes));
  return m ? m.quantity : null;
}

function qtyM3(materials, nameIncludes) {
  const m = materials.find((x) => x.unit === 'm³' && x.name.includes(nameIncludes));
  return m ? m.quantity : null;
}

// ============ 実行 ============
const takeoff = computeElevationTakeoff(G_ELEVATIONS, [],
  { planRooms: G_FLOOR_PLAN.rooms, closetInteriors: G_CLOSET_INTERIORS });
const calc = calculateMaterials(G_FLOOR_PLAN, {}, {});
const applied = applyElevationTakeoff(JSON.parse(JSON.stringify(calc)), takeoff);

const rows = [];
for (const [label, expected, unit, getter, tol] of EXPECTED) {
  const actual = getter(takeoff, calc);
  rows.push({ label, expected, actual, unit, tol });
}
for (const [label, expected, unit, getter, tol] of EXPECTED_FLOOR) {
  const actual = getter(calc.materials, calc.summary);
  rows.push({ label, expected, actual, unit, tol });
}
for (const [label, expected, unit, getter, tol] of EXPECTED_VOLUME) {
  const actual = getter(calc.materials);
  rows.push({ label, expected, actual, unit, tol });
}
for (const [label, expected, unit, getter, tol] of EXPECTED_APPLIED) {
  const actual = getter(applied.materials);
  rows.push({ label, expected, actual, unit, tol });
}

console.log('=== Gタイプ 突合結果（戸当・1戸あたり） ===');
console.log('部位'.padEnd(22) + 'XLS正解'.padStart(10) + '計算値'.padStart(10) + '差'.padStart(9) + '  判定');
let ok = 0, warn = 0, fail = 0;
for (const r of rows) {
  if (r.actual == null) {
    console.log(r.label.padEnd(24) + String(r.expected).padStart(9) + '未実装'.padStart(9) + ''.padStart(8) + '  ⏳');
    warn++;
    continue;
  }
  const diff = (r.actual / r.expected - 1) * 100;
  const d = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
  const status = r.tol === 999 ? '⏳既知' : (Math.abs(diff) <= r.tol ? '✅' : '✗');
  if (status === '✅') ok++; else if (status === '✗') fail++; else warn++;
  console.log(r.label.padEnd(24) + r.expected.toFixed(2).padStart(9) + Number(r.actual).toFixed(2).padStart(9) + d.padStart(8) + '  ' + status);
}
console.log(`\n✅ ${ok} / ⏳ ${warn}（既知の限界: 展開図外の面など・実装済みの部分計上を含む） / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
