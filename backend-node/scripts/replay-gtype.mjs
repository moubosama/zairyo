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
    { planRooms: parsedData.rooms || [],
      closetInteriors: parsedData.closet_interiors || [] });
  applyElevationTakeoff(result, takeoff);
}
result.materials = filterKenzaiScope(result.materials);

// XLS集計表（Gタイプ・戸当）との突合
// 出典: ②木及び建材XLS「集計表」シート（G=9戸。発注数量列の合計÷9戸。係数はX列の実値）
// 判定: 差1枚(1㎡)以内 または ±10%以内で✅。known付きは⏳（既知の限界がある行に使う。現在は0件）
const EXPECTED = [
  { name: '壁 石膏ボード', exp: 87.2, note: '122.061㎡÷1.4 ※発注列(AB)は遮音9.3+W下地6.0を合算し102.4枚/戸' },
  { name: '壁 耐水石膏ボード', exp: 4.6, note: '6.454㎡÷1.4（AC列41.487÷9戸）' },
  { name: '天井 石膏ボード', exp: 41.5, note: '59.087㎡÷1.45+ﾊﾟｳﾀﾞｰ･ﾄｲﾚ調整7枚（AD列373.749÷9戸）' },
  { name: '下り天井 石膏ボード', exp: 3.6, note: '5.233㎡÷1.45（AE列32.481÷9戸）' },
  { name: '一部界壁 石膏ボード', exp: 3.4, note: '5.047㎡÷1.5（Z列30.282÷9戸）' },
  { name: '一部界壁 耐水石膏ボード', exp: 0, note: '集計表AA列=0（Gタイプは無し）' },
  { name: 'マルチクロゼット・WIC・CLRC面 石膏ボード', exp: 5.2, note: '7.51㎡÷1.45（AG列内46.614÷9戸）' },
  { name: '壁 キッチンパネル', exp: 2.5, note: 'AF列22.5÷9戸' },
  // 遮音壁はDEFAULT_SOUND_WALL_PAIRS（LDK↔洋1 1.45m + LDK↔洋3 1.05m）の数式ルールで計上
  // （2026-07-19数式化。旧「UB裏面が展開図外」説は誤りと確定=両壁とも展開図に写る）
  { name: '間仕切 グラスウール充填', exp: 6.4, note: '6.425㎡/戸（壁1枚1回: P81+P82=(1.45+1.05)×2.57）' },
  { name: '遮音壁PB張り', exp: 13.0, note: '12.979㎡/戸（両面計上: P113+P221+P275。ルール値12.85）' },
];
console.log('\n=== 建材リスト（vs XLS集計表・Gタイプ戸当） ===');
let ok = 0, ng = 0, pend = 0;
for (const m of result.materials) {
  const e = EXPECTED.find((x) => x.name === m.name);
  if (!e) {
    console.log(`    ${m.name}: ${m.quantity}${m.unit} ${m.takeoff ? '[実測]' : '[推定]'}`);
    continue;
  }
  const diffAbs = m.quantity - e.exp;
  const diffPct = e.exp > 0 ? ((m.quantity / e.exp - 1) * 100).toFixed(0) : '-';
  const pass = Math.abs(diffAbs) <= 1 || (e.exp > 0 && Math.abs(m.quantity / e.exp - 1) <= 0.10);
  const mark = e.known ? '⏳' : pass ? '✅' : '✗';
  if (e.known) pend++; else pass ? ok++ : ng++;
  console.log(` ${mark} ${m.name}: ${m.quantity}${m.unit} vs 正解${e.exp} (${diffAbs >= 0 ? '+' : ''}${Math.round(diffAbs * 10) / 10}${m.unit}/${diffPct}%) ${m.takeoff ? '[実測]' : '[推定]'}${e.known ? ` ←${e.known}` : ''}`);
  console.log(`      └ 根拠: ${e.note}`);
}
console.log('\n※ 集計表の壁-PBt9.5発注列(AB)は 102.4枚/戸 = 一般87.2 + 遮音壁9.3(÷1.4) + W下地6.0(÷1.5) の合算。');
console.log('   エンジンは遮音壁を別行（遮音壁PB張り・㎡）で持つため、壁 石膏ボードは一般分87.2枚と比較する。');
console.log(`\n判定対象: ✅${ok} / ✗${ng} / ⏳${pend}（合格ライン: 差1枚以内 or ±10%）`);
process.exit(ng > 0 ? 1 : 0);
