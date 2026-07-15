// 記録済みのAI読み取り（scripts/recordings/gtype-*.json）をエンジンに通して
// XLS正解と突合する（AI呼び出しゼロ・エンジン変更の回帰チェック用）
//
// 使い方: node scripts/replay-gtype.mjs [記録ファイル]（省略時は最新）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeElevationTakeoff, applyElevationTakeoff, filterKenzaiScope } from '../src/services/buildupCalculator.js';
import { calculateMaterials } from '../src/services/materialCalculator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'recordings');

let file = process.argv[2];
if (!file) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('gtype-')).sort() : [];
  if (files.length === 0) {
    console.error('recordings/ に記録がありません。先に prod-repro（実AI）を1回実行してください。');
    process.exit(1);
  }
  file = path.join(dir, files[files.length - 1]);
}

const parsedData = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log('リプレイ:', path.basename(file));
console.log('読み取り概要: rooms', parsedData.rooms?.length,
  '/ 展開図', parsedData.elevations?.rooms?.length, '室',
  '/ 建具', parsedData.door_schedule?.length, '件',
  '/ 壁記号', (parsedData.wall_finish_codes || []).length, '部屋分');

const result = calculateMaterials(parsedData, {}, {});
if (parsedData.elevations?.rooms?.length) {
  const takeoff = computeElevationTakeoff(parsedData.elevations, parsedData.door_schedule || [],
    { planRooms: parsedData.rooms || [] });
  applyElevationTakeoff(result, takeoff);
}
result.materials = filterKenzaiScope(result.materials);

// XLS正解（Gタイプ戸当）との突合
const EXPECTED = [
  ['壁 石膏ボード', 88, '枚'],        // 122.06㎡ ÷ 1.4 = 87.2
  ['壁 耐水石膏ボード', 5, '枚'],     // 6.45㎡ ÷ 1.4 = 4.6
  ['天井 石膏ボード', 42, '枚'],      // 59.09㎡ ÷ 1.4 = 42.2
];
console.log('\n=== 建材リスト（vs XLS正解） ===');
let ok = 0, ng = 0;
for (const m of result.materials) {
  const exp = EXPECTED.find(([n]) => n === m.name);
  if (exp) {
    const diff = ((m.quantity / exp[1] - 1) * 100).toFixed(0);
    const pass = Math.abs(m.quantity / exp[1] - 1) <= 0.10;
    pass ? ok++ : ng++;
    console.log(` ${pass ? '✅' : '✗'} ${m.name}: ${m.quantity}${m.unit} vs 正解${exp[1]} (${diff > 0 ? '+' : ''}${diff}%) ${m.takeoff ? '[実測]' : '[推定]'}`);
  } else {
    console.log(`    ${m.name}: ${m.quantity}${m.unit} ${m.takeoff ? '[実測]' : '[推定]'}`);
  }
}
console.log(`\n判定対象: ✅${ok} / ✗${ng}（合格ライン: ±10%）`);
process.exit(ng > 0 ? 1 : 0);
