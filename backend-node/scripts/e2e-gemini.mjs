// Gemini実読みE2E測定: Gタイプ3図面（平面詳細図/展開図/建具表×3枚）を
// AI_PROVIDER=gemini で本番と同じ組み立てパイプラインに通し、
// replay互換のparsedData記録を保存する（Geminiの読み質の測定用・エンジンは変更しない）
//
// 使い方: node scripts/e2e-gemini.mjs [--model gemini-2.5-pro]
//   モデルは GEMINI_MODEL 環境変数でも指定可（デフォルト gemini-2.5-flash）
// 出力:
//   scripts/recordings/gtype-gemini-read-<モデル名>.json … replay-gtype.mjs に渡す記録
//   scripts/recordings/raw-gemini/<モデル名>-*.txt        … AI生レスポンス（デバッグ用）
//   ※ タイル解析（壁記号・開口の分割読取）の生レスポンスは analyzeTiles 内部で
//     完結するため保存されない（parsed結果は記録JSONに含まれる）
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

if (!process.env.GOOGLE_GEMINI_API_KEY) {
  console.error('GOOGLE_GEMINI_API_KEY が backend-node/.env に設定されていません。中断します。');
  process.exit(1);
}

// 全AI呼び出しをGeminiへ（claudeApi.jsは呼び出し時にAI_PROVIDERを評価する）
process.env.AI_PROVIDER = 'gemini';
// 429/503の再試行を有効化（無料枠キーはRPM制限・高負荷503に当たりやすい。
// タイル解析は12並列のため必須。本番Renderも GEMINI_RETRY_MAX=4 で運用中。
// 日次上限quotaの429はリトライされず失敗タイルとして顕在化する）
if (!process.env.GEMINI_RETRY_MAX) process.env.GEMINI_RETRY_MAX = '4';
const modelFlag = process.argv.indexOf('--model');
if (modelFlag >= 0 && process.argv[modelFlag + 1]) {
  process.env.GEMINI_MODEL = process.argv[modelFlag + 1];
}
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const { analyzeDrawing, analyzeAuxDrawing } = await import('../src/services/claudeApi.js');
// 組み立てロジックは本番ルートの関数をそのまま再利用（重複実装しない）
const { attachElevationData, mergeDoorSchedule } = await import('../src/routes/projects.js');

// 入力図面（Gタイプ・意匠図page 45/56/61/62/63）
const SRC = 'C:/Users/81804/Pictures/zairyoの資料/Gタイプ_アップロード用';
const PLAN = path.join(SRC, '①平面詳細図_Gタイプ_page45.png');
const ELEV = path.join(SRC, '②展開図_Gタイプ_page56.png');
const DOORS = [
  path.join(SRC, '③建具表1_スチールSD・サッシAWD_page61.png'),
  path.join(SRC, '③建具表2_アルミAW・AD_page62.png'),
  path.join(SRC, '③建具表3_木製WD_page63.png'),
];
for (const f of [PLAN, ELEV, ...DOORS]) {
  if (!fs.existsSync(f)) {
    console.error('入力図面が見つかりません:', f);
    process.exit(1);
  }
}

const rawDir = path.join(__dirname, 'recordings', 'raw-gemini');
fs.mkdirSync(rawDir, { recursive: true });
const saveRaw = (name, text) =>
  fs.writeFileSync(path.join(rawDir, `${MODEL}-${name}.txt`), text ?? '(no response)');

console.log(`=== Gemini実読みE2E（モデル: ${MODEL}） ===`);

// STEP1: 平面詳細図（本番uploadと同じ analyzeDrawing。専有面積は通常運用どおりユーザー入力あり
// = 67.30㎡。比較対象のClaude記録 gtype-vscode-claude-read.json も total 67.3 で条件を揃える）
console.log('STEP1: 平面詳細図', path.basename(PLAN));
const parsedData = await analyzeDrawing(PLAN, { userTotalAreaSqm: 67.30 });
saveRaw('plan', parsedData._raw_responses?.gemini);
delete parsedData._raw_responses;
if (parsedData._ai_unavailable || parsedData.is_rejected) {
  console.error('平面図解析が拒否されました:', parsedData.rejection_reason);
  process.exit(1);
}
console.log('  rooms:', parsedData.rooms?.length ?? 0,
  '/ 間仕切壁:', parsedData.partition_wall_length_m, 'm',
  '/ 警告:', (parsedData._warnings || []).length);

// STEP2: 展開図（段階式auxと同じ: roomContext付き解析 → attachElevationData で
// タイル詳細パス（平面図の壁記号+展開図の開口。Gemini 12回）ごと統合）
console.log('STEP2: 展開図', path.basename(ELEV));
const roomNames = (parsedData.rooms || []).map((r) => r.name).filter(Boolean);
const elevRes = await analyzeAuxDrawing(ELEV, 'elevation', { roomNames }).catch((e) => {
  console.error('  展開図API失敗:', e?.status || '', e?.message);
  return null;
});
saveRaw('elevation', elevRes?.rawText);
if (elevRes?.parsed?.drawing_type === 'elevation' &&
    Array.isArray(elevRes.parsed.rooms) && elevRes.parsed.rooms.length > 0) {
  const tileStats = await attachElevationData(parsedData, elevRes.parsed, PLAN, ELEV);
  console.log('  展開図室数:', parsedData.elevations.rooms.length,
    '/ 壁記号:', (parsedData.wall_finish_codes || []).length, '部屋分',
    '/ タイル失敗: 壁記号', tileStats?.wall_codes
      ? `${tileStats.wall_codes.failedTiles}/${tileStats.wall_codes.totalTiles}` : '-',
    '開口', tileStats?.openings
      ? `${tileStats.openings.failedTiles}/${tileStats.openings.totalTiles}` : '-');
  if (parsedData._wall_codes_partial) {
    console.warn('  ⚠ 壁記号タイルが部分失敗（_wall_codes_partial=true）。壁数量が過大になる可能性');
  }
} else {
  console.error('  展開図として読めませんでした（drawing_type:',
    elevRes?.parsed?.drawing_type, '）→ elevationsなしで続行（読めなかった事実も記録）');
}

// STEP3: 建具表3枚（段階式auxと同じ符号単位マージ）
for (const [i, doorPath] of DOORS.entries()) {
  console.log(`STEP3-${i + 1}: 建具表`, path.basename(doorPath));
  const doorRes = await analyzeAuxDrawing(doorPath, 'door_schedule').catch((e) => {
    console.error('  建具表API失敗:', e?.status || '', e?.message);
    return null;
  });
  saveRaw(`door${i + 1}`, doorRes?.rawText);
  if (doorRes?.parsed?.drawing_type === 'door_schedule' && Array.isArray(doorRes.parsed.doors)) {
    const { doors, added } = mergeDoorSchedule(parsedData.door_schedule, doorRes.parsed.doors);
    parsedData.door_schedule = doors;
    console.log('  符号追加:', added, '/ 累計:', doors.length, '件');
  } else {
    console.error('  建具表として読めませんでした（drawing_type:', doorRes?.parsed?.drawing_type, '）');
  }
}

// 記録保存（replay-gtype.mjs互換のparsedData形式）
const outFile = path.join(__dirname, 'recordings', `gtype-gemini-read-${MODEL}.json`);
fs.writeFileSync(outFile, JSON.stringify(parsedData, null, 2));
console.log('\n記録保存:', outFile);
console.log('読み取り概要: rooms', parsedData.rooms?.length ?? 0,
  '/ 展開図', parsedData.elevations?.rooms?.length ?? 0, '室',
  '/ 建具', parsedData.door_schedule?.length ?? 0, '件',
  '/ 壁記号', (parsedData.wall_finish_codes || []).length, '部屋分');
console.log(`次: node scripts/replay-gtype.mjs scripts/recordings/gtype-gemini-read-${MODEL}.json`);
