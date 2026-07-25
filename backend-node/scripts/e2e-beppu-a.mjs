// Gemini実読みE2E測定: 別府4丁目 Aタイプ3図面（平面詳細図/展開図/木製建具表）を
// AI_PROVIDER=gemini で本番と同じ組み立てパイプラインに通し、replay互換のparsedData記録を保存する。
// （別府方式の図面でGeminiがどこまで読めるかの測定用・エンジンもプロンプトも変更しない）
//
// ※ e2e-gemini.mjs（Gタイプ用）を雛形に、別府Aタイプ向けに図面パス・専有面積・記録名だけ差し替えた版。
//   Gタイプ版とは別ファイル（記録が混ざらない）。Gタイプ版は変更しない。
//
// 【別府の壁記号は方式が違う】アルファは3桁記号（G14）だが、別府は丸囲み1文字（遮/G/A〜F）。
//   エンジンは対応済み（parseBeppuWallCode）だが、既存プロンプト（analyzeDrawing/analyzeAuxDrawing）が
//   別府方式の記号を読み取れる指示になっているかは未検証。このスクリプトはプロンプトを一切改変せず
//   既存のまま流す。別府の壁記号が読めているか（wall_finish_codesに丸囲み1文字が入るか）は
//   記録取得後に人手で確認する。読めない場合はプロンプト改善が次サイクルの本命。
//
// 使い方: node scripts/e2e-beppu-a.mjs [--model gemini-2.5-pro]
//   モデルは GEMINI_MODEL 環境変数でも指定可（デフォルト gemini-2.5-flash）
// 出力:
//   scripts/recordings/beppu-a-gemini-read-<モデル名>.json … replay/calculate に渡す記録
//   scripts/recordings/raw-gemini/beppu-a-<モデル名>-*.txt … AI生レスポンス（デバッグ用）
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
// 429/503の再試行を有効化（タイル解析は12並列のためRPM制限に当たりやすい。本番Renderも4で運用）。
if (!process.env.GEMINI_RETRY_MAX) process.env.GEMINI_RETRY_MAX = '4';
const modelFlag = process.argv.indexOf('--model');
if (modelFlag >= 0 && process.argv[modelFlag + 1]) {
  process.env.GEMINI_MODEL = process.argv[modelFlag + 1];
}
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const { analyzeDrawing, analyzeAuxDrawing } = await import('../src/services/claudeApi.js');
// 組み立てロジックは本番ルートの関数をそのまま再利用（重複実装しない）
const { attachElevationData, mergeDoorSchedule } = await import('../src/routes/projects.js');

// 入力図面（別府4丁目 Aタイプ・PDFページ p036/p037/p069）
// 別府は建具表が1枚に集約（木製建具表 p069・全タイプ共通）。アルファのようにSD/AW/WDに分かれない。
const SRC = 'C:/Users/81804/Pictures/zairyoの資料/02_別府4丁目/アップロード用/Aタイプ';
const PLAN = path.join(SRC, '①平面詳細図_p036.png');
const ELEV = path.join(SRC, '②展開図_p037.png');
const DOORS = [
  path.join(SRC, '③木製建具表_p069.png'),
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
  fs.writeFileSync(path.join(rawDir, `beppu-a-${MODEL}-${name}.txt`), text ?? '(no response)');

console.log(`=== 別府Aタイプ Gemini実読みE2E（モデル: ${MODEL}） ===`);

// STEP1: 平面詳細図（本番uploadと同じ analyzeDrawing。専有面積は通常運用どおりユーザー入力あり
// = 83.43㎡（別府Aタイプ・p036記載の専有面積））
console.log('STEP1: 平面詳細図', path.basename(PLAN));
const parsedData = await analyzeDrawing(PLAN, { userTotalAreaSqm: 83.43 });
saveRaw('plan', parsedData._raw_responses?.gemini);
delete parsedData._raw_responses;
if (parsedData._ai_unavailable || parsedData.is_rejected) {
  console.error('平面図解析が拒否されました:', parsedData.rejection_reason);
  process.exit(1);
}
console.log('  rooms:', parsedData.rooms?.length ?? 0,
  '/ 間仕切壁:', parsedData.partition_wall_length_m, 'm',
  '/ 警告:', (parsedData._warnings || []).length);

// STEP2: 展開図（段階式auxと同じ: roomContext付き解析 → attachElevationData でタイル詳細パスごと統合）
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

// STEP3: 木製建具表1枚（段階式auxと同じ符号単位マージ）
for (const [i, doorPath] of DOORS.entries()) {
  console.log(`STEP3-${i + 1}: 建具表`, path.basename(doorPath));
  const doorRes = await analyzeAuxDrawing(doorPath, 'door_schedule').catch((e) => {
    console.error('  建具表API失敗:', e?.status || '', e?.message);
    return null;
  });
  saveRaw(`door${i + 1}`, doorRes?.rawText);
  if (doorRes?.parsed?.drawing_type === 'door_schedule' && Array.isArray(doorRes.parsed.doors)) {
    const { doors, added, warnings: doorWarnings } =
      mergeDoorSchedule(parsedData.door_schedule, doorRes.parsed.doors);
    parsedData.door_schedule = doors;
    // 寸法矛盾の警告を記録JSONにも残す（本番/auxルートと同じ_warningsマージ）
    if (doorWarnings.length > 0) {
      const prevWarnings = parsedData._warnings || [];
      const newOnes = doorWarnings.filter(
        (w) => !prevWarnings.some((p) => p.field === w.field && p.message === w.message));
      parsedData._warnings = [...prevWarnings, ...newOnes];
    }
    console.log('  符号追加:', added, '/ 累計:', doors.length, '件',
      '/ 寸法矛盾:', doorWarnings.length, '件');
  } else {
    console.error('  建具表として読めませんでした（drawing_type:', doorRes?.parsed?.drawing_type, '）');
  }
}

// 記録保存（replay/calculate用のparsedData形式・Gタイプ記録と別名）
const outFile = path.join(__dirname, 'recordings', `beppu-a-gemini-read-${MODEL}.json`);
fs.writeFileSync(outFile, JSON.stringify(parsedData, null, 2));
console.log('\n記録保存:', outFile);
console.log('読み取り概要: rooms', parsedData.rooms?.length ?? 0,
  '/ 展開図', parsedData.elevations?.rooms?.length ?? 0, '室',
  '/ 建具', parsedData.door_schedule?.length ?? 0, '件',
  '/ 壁記号', (parsedData.wall_finish_codes || []).length, '部屋分');
console.log('※ 別府の壁記号（丸囲み1文字 遮/G/A〜F）が wall_finish_codes に入っているか記録を確認すること。');
console.log('  空・3桁記号だらけ・全面PB扱いなら既存プロンプトが別府方式を読めていない → 次サイクルでプロンプト改善。');

// ────────────────────────────────────────────────────────────────────────────
// 【別府Aタイプ 物件プロファイル（後段の calculate / replay で使う override 一式）】
//   記録取得（このスクリプト）は読み取りのみなので override 不要だが、
//   calculateMaterials(parsedData, { overrides }) に渡す値をここに明記しておく。
//   出典: CLAUDE.md「物件依存9件の全override化」「推定パスの新築/リノベ分離」節、別府9タイプ正解JSON。
//
//   const beppuAOverrides = {
//     building_type: 'new',            // 別府は新築（推定パスの新築式=周長×階高ベースを使う）
//     glasswool_coverage: 0.5,         // 別府はGW被覆率0.5（アルファ既定0.135と別。MaterialResult.vueに入力欄あり）
//     stud_height: 2.72,               // 一般部の下地高2720mm（別府値。アルファは2.57）
//     stud_height_wet: 2.82,           // 水回りの下地高2820mm（別府値。アルファは2.77）
//     ceiling_pb_extra_sheets: 0,      // 別府は集計表A74「ﾊﾟｳﾀﾞｰ･ﾄｲﾚ」加算行が無い（アルファG=4）
//     soundWallRule: { pairs: [] },    // 別府はアルファG専用ペア（LDK↔洋1 1450/LDK↔洋3 1050）を発火させない
//     closet_rc_sqm: 0,                // 収納内RC面（別府の実測値。未確定なら別府正解JSONから）
//     // 際根太プロファイル（4項目1セット。単一定数では別府に通らない＝CLAUDE.md参照）
//     kiwaneta_spec: 'H110',           // 別府の際根太規格（アルファは45×30）
//     kiwaneta_volume: 'なし',         // 別府はX9=0＝材積換算せずmのまま発注（0m³行を出さない）
//     // kiwaneta_ratio / kiwaneta_min_m は別府正解JSONの実測から設定
//     // extra_part: 'スラブ下り際根太H=210',  // 別府r10のみ存在する部位行（overrideでは埋まらない・別実装が必要）
//   };
//
//   ※ 上記の数値（stud_height 2.72/2.82・closet_rc・kiwaneta_ratio 等）は
//     このスクリプトを流す前に別府Aタイプ正解JSON（beppu-9types-ground-truth.json）で
//     Aタイプの実値を確認して確定すること。ここではプロファイルの「構造（キー一式）」を示す。
// ────────────────────────────────────────────────────────────────────────────
