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
 *   遮音壁L14は洋室(1)C面1,450で確認（UB裏側の面は展開図に現れないため部分計上）
 */
import { computeElevationTakeoff } from '../src/services/buildupCalculator.js';
import { calculateMaterials } from '../src/services/materialCalculator.js';

const F = (face, width_mm, wall_code, openings = []) => ({ face, width_mm, wall_code, openings });

// ============ 展開図読み取り値（page_56） ============
export const G_ELEVATIONS = { rooms: [
  { name: '玄関・廊下', ceiling_height_mm: 2200, skirting: '木製巾木H=40', faces: [
    F('A', 1385, 'G14', [{ type: '玄関ドア', width_mm: 850, height_mm: 1900 }]),
    F('B', 4840, 'G14', [{ type: '2枚折戸', width_mm: 803, height_mm: 2320 }]),
    F('C', 965, 'D14'), // EV側=RC面木+PB
    F('D', 4840, 'G14', [
      { type: '片開き戸', width_mm: 700, height_mm: 2175 },
      { type: '片引き戸', width_mm: 760, height_mm: 2075 } ]),
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

// ============ XLS正解（集計表 G列 戸当） ============
const EXPECTED = [
  // [ラベル, 正解値, 単位, 実測値の取得, 判定閾値%]
  ['壁PB t-9.5',        122.0609, '㎡', (t) => t.wall_pb_sqm, 10],
  ['耐水PB t-9.5',      6.4535,   '㎡', (t) => t.waterproof_pb_sqm, 15],
  ['遮音壁PB t9.5+GW',  12.9785,  '㎡', (t) => t.sound_wall_pb_sqm, 999], // UB裏面が展開図外のため部分計上（既知）
  ['間仕切GW t50',      6.425,    '㎡', (t) => t.gw_sqm, 999],           // 同上
  ['木製巾木 H=40',     56.44,    'm',  (t) => t.skirting_m.木製, 12],
  ['クロゼット内RC面',  7.51,     '㎡', (t) => t.konpane_sqm, 15],
  ['キッチンパネル面',  6.7,      '㎡', (t) => t.kitchen_panel_sqm, 20],
  ['間仕切下地(木)',    84.082,   'm',  (t, m) => null, 999],            // 材積換算層とセットで今後実装
];

const EXPECTED_FLOOR = [
  ['際根太',            18.2,   'm',  (mats) => qty(mats, '際根太'), 12],
  ['フローリング',      53.26,  '㎡', (mats) => qty(mats, 'フローリング'), 10], // 48.42×1.1ロス
  ['乾式置床(ﾊﾟｳﾀﾞｰ/ﾄｲﾚ)', 3.9049, '㎡', (mats) => qty(mats, '乾式置床'), 30],
  ['床下地合板(置床上)', 4.7589, '㎡', (mats) => qty(mats, '床下地合板'), 30],
  ['天井PB(面積換算)',   59.0874,'㎡', (mats, summary) => summary.ceiling_area, 8],
];

function qty(materials, nameIncludes) {
  const m = materials.find((x) => x.name.includes(nameIncludes));
  return m ? m.quantity : null;
}

// ============ 実行 ============
const takeoff = computeElevationTakeoff(G_ELEVATIONS, []);
const calc = calculateMaterials(G_FLOOR_PLAN, {}, {});

const rows = [];
for (const [label, expected, unit, getter, tol] of EXPECTED) {
  const actual = getter(takeoff, calc);
  rows.push({ label, expected, actual, unit, tol });
}
for (const [label, expected, unit, getter, tol] of EXPECTED_FLOOR) {
  const actual = getter(calc.materials, calc.summary);
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
console.log(`\n✅ ${ok} / ⏳ ${warn}（既知の未実装） / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
