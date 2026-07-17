// UI（MaterialResult画面）相当の出力を再現する: summaryサマリー + 建材リスト（名称/摘要/数量/単位）
// AI呼び出しゼロ。記録済み読み取り（recordings/gtype-vscode-claude-read.json）を使う。
// 使い方: node scripts/dump-ui-gtype.mjs [記録ファイル]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeElevationTakeoff, applyElevationTakeoff, filterKenzaiScope } from '../src/services/buildupCalculator.js';
import { calculateMaterials } from '../src/services/materialCalculator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rec = process.argv[2] || path.join(__dirname, 'recordings', 'gtype-vscode-claude-read.json');
const parsedData = JSON.parse(fs.readFileSync(rec, 'utf8'));

const result = calculateMaterials(parsedData, {}, {});
let takeoff = null;
if (parsedData.elevations?.rooms?.length) {
  takeoff = computeElevationTakeoff(parsedData.elevations, parsedData.door_schedule || [],
    { planRooms: parsedData.rooms || [], closetInteriors: parsedData.closet_interiors || [] });
  applyElevationTakeoff(result, takeoff);
}
result.materials = filterKenzaiScope(result.materials);

console.log('=== サマリー（UI上部カード相当: result.summary） ===');
for (const [k, v] of Object.entries(result.summary || {})) console.log(`  ${k}: ${v}`);

console.log('\n=== 資材リスト（UIの表: 名称 / 摘要 / 数量 / 単位） ===');
for (const m of result.materials) {
  console.log(`  ${m.name.padEnd(22, '　').slice(0, 40)} | ${(m.spec || '').padEnd(28)} | ${String(m.quantity).padStart(6)} ${m.unit}${m.takeoff ? ' [実測]' : ' [推定]'}`);
}

// サマリーと資材行の整合チェック（表示系バグの検出）
const findQty = (name) => result.materials.find((m) => m.name === name)?.quantity;
const checks = [
  ['wall_pb_sheets', findQty('壁 石膏ボード')],
  ['waterproof_pb_sheets', findQty('壁 耐水石膏ボード')],
  ['ev_wall_pb_sheets', findQty('EV廻り壁 石膏ボード')],
];
// クロス面積カード: 実測適用時はtakeoffのクロス面と一致していること（外部レビューshould-fix対応）
if (takeoff) checks.push(['wall_cloth_area', takeoff.cloth_sqm]);
let ng = 0;
console.log('\n=== summary ⇔ 資材行の整合 ===');
for (const [key, qty] of checks) {
  const s = result.summary?.[key];
  const pass = s === qty;
  if (!pass) ng++;
  console.log(`  ${pass ? '✅' : '✗'} summary.${key}=${s} ⇔ 対応値=${qty}`);
}
process.exit(ng > 0 ? 1 : 0);
