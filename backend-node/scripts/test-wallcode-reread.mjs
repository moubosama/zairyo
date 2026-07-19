/**
 * 壁記号タイル解析のスキップ/再実行判定とマージの検証（2026-07-19）
 *
 * 背景: STEP1の全体図解析（gemini-3.5-flash等）が部屋別のwall_finish_codes（codesのみ・
 * placementsなし）を返すと、attachElevationDataの旧スキップ条件「既にあればスキップ」が発動し、
 * 寸法付きplacementsが取れず面割付が全滅→全面デフォルトG14で壁PB暴発（E2Eで148枚=+70%を実測）。
 * 修正: 再実行条件に「寸法付きplacement（wall_length_mm>0）が1件も無い」を追加。
 *
 * 実行: node scripts/test-wallcode-reread.mjs（AI呼び出しなし・DB不要）
 * 検証対象（src/routes/projects.js）:
 *  - wallCodesNeedTileReread: 無い/空/partial/codesのみ → 再実行、寸法付きplacementsあり → スキップ
 *  - mergeWallFinishCodes: タイル結果を正に同一部屋を上書き・タイル外の部屋は残す
 *  - attachElevationData: 判定・マージの実配線（解析関数をdepsで注入して呼び出し有無を観測）
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// AIキーを外す（誤って実APIへ到達しないように。dotenvは読み込まない）
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;
delete process.env.GOOGLE_GEMINI_API_KEY;

const { wallCodesNeedTileReread, mergeWallFinishCodes, attachElevationData } =
  await import('../src/routes/projects.js');

let pass = 0;
let fail = 0;
const test = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    console.error(`  ✗ ${name}\n     ${e.message}`);
  }
};

// ---------------------------------------------------------------------------
console.log('■ wallCodesNeedTileReread: 再実行判定');

await test('wall_finish_codes無し → 再実行', () => {
  assert.equal(wallCodesNeedTileReread({}), true);
});

await test('空配列 → 再実行', () => {
  assert.equal(wallCodesNeedTileReread({ wall_finish_codes: [] }), true);
});

await test('codesのみ（placementsなし・STEP1全体図読みの形）→ 再実行', () => {
  assert.equal(wallCodesNeedTileReread({
    wall_finish_codes: [
      { room: 'LDK', codes: ['C04', 'G14'] },
      { room: '洋室(1)', codes: ['I14'] },
    ],
  }), true);
});

await test('placementsはあるが全て寸法null → 再実行', () => {
  assert.equal(wallCodesNeedTileReread({
    wall_finish_codes: [
      { room: 'LDK', codes: ['C04'], placements: [{ code: 'C04', wall_length_mm: null }] },
    ],
  }), true);
});

await test('寸法付きplacementが1件でもあれば → スキップ', () => {
  assert.equal(wallCodesNeedTileReread({
    wall_finish_codes: [
      { room: 'LDK', codes: ['C04'], placements: [{ code: 'C04', wall_length_mm: 2200 }] },
      { room: '洋室(1)', codes: ['I14'] }, // 混在していてもスキップ側
    ],
  }), false);
});

await test('寸法付きplacementsありでも_wall_codes_partial=true → 再実行（既存挙動維持）', () => {
  assert.equal(wallCodesNeedTileReread({
    wall_finish_codes: [
      { room: 'LDK', codes: ['C04'], placements: [{ code: 'C04', wall_length_mm: 2200 }] },
    ],
    _wall_codes_partial: true,
  }), true);
});

await test('wall_length_mmが0や負値のみ → 再実行（正の数のみ有効）', () => {
  assert.equal(wallCodesNeedTileReread({
    wall_finish_codes: [
      { room: 'LDK', codes: ['C04'], placements: [{ code: 'C04', wall_length_mm: 0 }] },
    ],
  }), true);
});

// ---------------------------------------------------------------------------
console.log('■ mergeWallFinishCodes: タイル結果を正としたマージ');

const tiled = [
  { room: 'LDK', codes: ['C04'], placements: [{ code: 'C04', wall_length_mm: 2200 }] },
  { room: '洋室(1)', codes: ['I14'], placements: [{ code: 'I14', wall_length_mm: 3200 }] },
];

await test('同一部屋の既存codesのみエントリはタイル結果で上書き', () => {
  const prev = [{ room: 'LDK', codes: ['G14'] }];
  const merged = mergeWallFinishCodes(prev, tiled);
  const ldk = merged.filter((w) => w.room === 'LDK');
  assert.equal(ldk.length, 1);
  assert.deepEqual(ldk[0].codes, ['C04']); // タイル側
});

await test('部屋名の表記ゆれ（全角括弧）でも同一部屋として上書き', () => {
  const prev = [{ room: '洋室（１）', codes: ['G14'] }];
  const merged = mergeWallFinishCodes(prev, tiled);
  assert.equal(merged.length, 2); // 重複エントリが残らない
  assert.ok(merged.some((w) => w.room === '洋室(1)' && w.codes.includes('I14')));
});

await test('タイルに現れなかった部屋の既存エントリは残す', () => {
  const prev = [{ room: 'トイレ', codes: ['G24'] }];
  const merged = mergeWallFinishCodes(prev, tiled);
  assert.equal(merged.length, 3);
  assert.ok(merged.some((w) => w.room === 'トイレ'));
  // タイル結果が先頭（後段plan_codes突合のfind先勝ちでタイル側が優先される順序）
  assert.equal(merged[0].room, 'LDK');
});

await test('既存が未定義でもタイル結果のみで成立', () => {
  const merged = mergeWallFinishCodes(undefined, tiled);
  assert.equal(merged.length, 2);
});

// ---------------------------------------------------------------------------
console.log('■ attachElevationData: 実配線（解析関数をdepsで注入）');

// planPathは存在チェック（fsPromises.access）を通す必要があるため、このスクリプト自身を使う
const SELF = fileURLToPath(import.meta.url);
const elevParsed = () => ({ rooms: [{ name: 'LDK', faces: [{ face: 'A' }] }] });

/** 呼び出し記録付きのスタブ解析関数ペアを作る */
function makeDeps(tiledResults) {
  const calls = { wallCodes: 0, openings: 0 };
  return {
    calls,
    deps: {
      wallCodesAnalyzer: async () => {
        calls.wallCodes++;
        return { results: tiledResults, failedTiles: 0, totalTiles: 6 };
      },
      openingsAnalyzer: async () => {
        calls.openings++;
        return null; // 開口タイルは今回の検証対象外
      },
    },
  };
}

await test('codesのみの既存データ → タイル再実行され、結果がマージされる', async () => {
  const analysisResult = {
    rooms: [{ name: 'LDK' }],
    wall_finish_codes: [{ room: 'LDK', codes: ['G14'] }], // STEP1由来（placementsなし）
  };
  const { calls, deps } = makeDeps(tiled);
  const stats = await attachElevationData(analysisResult, elevParsed(), SELF, SELF, deps);
  assert.equal(calls.wallCodes, 1, 'タイル解析が実行されること');
  assert.deepEqual(stats.wall_codes, { failedTiles: 0, totalTiles: 6 });
  const ldk = analysisResult.wall_finish_codes.filter((w) => w.room === 'LDK');
  assert.equal(ldk.length, 1);
  assert.ok(ldk[0].placements?.some((p) => p.wall_length_mm > 0), 'タイル側の寸法付きplacementsに置換');
});

await test('寸法付きplacements付きの既存データ → スキップ維持（上書きされない）', async () => {
  const before = [{ room: 'LDK', codes: ['C04'], placements: [{ code: 'C04', wall_length_mm: 2200 }] }];
  const analysisResult = { rooms: [{ name: 'LDK' }], wall_finish_codes: before };
  const { calls, deps } = makeDeps(tiled);
  const stats = await attachElevationData(analysisResult, elevParsed(), SELF, SELF, deps);
  assert.equal(calls.wallCodes, 0, 'タイル解析が実行されないこと');
  assert.equal(stats.wall_codes, null);
  assert.equal(analysisResult.wall_finish_codes, before, '既存データがそのまま');
});

await test('_wall_codes_partial=true → 再実行（既存挙動維持・成功でフラグ解除）', async () => {
  const analysisResult = {
    rooms: [{ name: 'LDK' }],
    wall_finish_codes: [{ room: 'LDK', codes: ['C04'], placements: [{ code: 'C04', wall_length_mm: 2200 }] }],
    _wall_codes_partial: true,
    _warnings: [{ field: 'wall_codes_partial', message: 'x', before: null, after: null }],
  };
  const { calls, deps } = makeDeps(tiled);
  await attachElevationData(analysisResult, elevParsed(), SELF, SELF, deps);
  assert.equal(calls.wallCodes, 1, 'タイル解析が実行されること');
  assert.equal(analysisResult._wall_codes_partial, undefined, '全タイル成功でフラグ解除');
  assert.equal((analysisResult._warnings || []).length, 0, '部分失敗警告も解除');
});

await test('planPathが存在しない → 再実行せず既存維持（安全側の従来挙動）', async () => {
  const analysisResult = {
    rooms: [{ name: 'LDK' }],
    wall_finish_codes: [{ room: 'LDK', codes: ['G14'] }],
  };
  const { calls, deps } = makeDeps(tiled);
  await attachElevationData(analysisResult, elevParsed(), 'Z:/no/such/file.png', SELF, deps);
  assert.equal(calls.wallCodes, 0);
});

// ---------------------------------------------------------------------------
console.log('');
console.log(`結果: ✅${pass} / ✗${fail}`);
process.exit(fail > 0 ? 1 : 0);
