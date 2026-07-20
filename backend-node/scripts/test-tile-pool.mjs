/**
 * analyzeTilesの並列プール+第2スイープの検証（2026-07-20）
 *
 * 背景: 全タイル一斉発射（壁記号6+開口6=12並列）が課金Tier1でもRPMバーストを踏み、
 * 本番で毎回1〜2タイル失敗→壁PBが+12〜24%に膨れていた。
 * 修正: 同時実行3本のプール+タイルごと100〜300msジッター+失敗タイルの第2スイープ
 * （5秒待って直列1回ずつ再試行。GEMINI_RETRY_MAXの呼び出し内リトライとは独立の層）。
 *
 * 実行: node scripts/test-tile-pool.mjs（AI呼び出しなし・DB不要・depsモック注入）
 * 検証対象（src/services/claudeApi.js analyzeTiles）:
 *  - 同時実行がTILE_CONCURRENCY=3本を超えない / プールとして並列には走る
 *  - 各タイル呼び出し前にジッターsleepが入る
 *  - 失敗タイルは5秒待機後に直列で再試行され、回復分はfailedTilesから除外される
 *  - スイープ呼び出しは呼び出し内リトライ無効（retryMax:0）で呼ばれる（二重リトライ防止）
 *  - 失敗なしならスイープは走らない（5秒待機なし）
 *  - _tile番号・タイル順・失敗タイルの結果除外が従来どおり
 */
import assert from 'node:assert/strict';

// AIキーを外す（誤って実APIへ到達しないように。dotenvは読み込まない）
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;
delete process.env.GOOGLE_GEMINI_API_KEY;

const { analyzeTiles } = await import('../src/services/claudeApi.js');

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

/** ダミータイルN枚（makeTilesの戻りと同形） */
const fakeTiles = (n) =>
  Array.from({ length: n }, (_, i) => ({ base64Data: `tile${i}`, mimeType: 'image/png' }));

/**
 * 計測付きモック解析関数を作る
 * @param opts.failFirst  1回目の呼び出しで失敗させるタイル番号の配列（r.error返し）
 * @param opts.failAlways 何度呼んでも失敗するタイル番号の配列
 * @param opts.throwFirst 1回目にthrowするタイル番号の配列
 * @param opts.holdMs     解析1回の擬似所要時間（並列度の計測用・実時間）
 */
function makeAnalyze(opts = {}) {
  const { failFirst = [], failAlways = [], throwFirst = [], holdMs = 20 } = opts;
  const state = {
    inFlight: 0,
    maxInFlight: 0,
    calls: [], // 呼び出し順のタイル番号（base64Dataから逆引き）
    attempts: new Map(), // tileIdx -> 回数
  };
  const analyze = async (_filePath, base64Data) => {
    const idx = Number(base64Data.replace('tile', ''));
    state.inFlight++;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    state.calls.push(idx);
    const attempt = (state.attempts.get(idx) || 0) + 1;
    state.attempts.set(idx, attempt);
    await new Promise((r) => setTimeout(r, holdMs)); // 実時間で滞留させ並列度を観測
    state.inFlight--;
    if (throwFirst.includes(idx) && attempt === 1) throw new Error(`boom tile${idx}`);
    if (failAlways.includes(idx) || (failFirst.includes(idx) && attempt === 1)) {
      return { parsed: null, rawText: null, error: { status: 429, message: 'rate limited (mock)' } };
    }
    return { parsed: { codes: [{ room: `R${idx}`, code: 'G14' }] }, rawText: 'x' };
  };
  return { analyze, state };
}

/** sleepモック: 待機せず記録だけ（ジッター/スイープ5秒をテストで待たない） */
function makeSleep() {
  const waits = [];
  return { waits, sleep: async (ms) => { waits.push(ms); } };
}

const JITTER0 = () => 0;

// console.warnのモック出力を抑える（失敗系テストのノイズ防止。失敗件数の検証はfailedTilesで行う）
const origWarn = console.warn;
console.warn = () => {};

// ---------------------------------------------------------------------------
console.log('■ 並列プール: 同時実行の上限');

await test('6タイルで同時実行が3本を超えない（かつプールとして3本は並列に走る）', async () => {
  const { analyze, state } = makeAnalyze({ holdMs: 30 });
  const { sleep } = makeSleep();
  const res = await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze, sleep, jitterMs: JITTER0, loadTiles: async () => fakeTiles(6),
  });
  assert.equal(state.maxInFlight, 3, `maxInFlight=${state.maxInFlight}（期待=3）`);
  assert.equal(res.failedTiles, 0);
  assert.equal(res.totalTiles, 6);
  assert.deepEqual(res.failedReasons, [], '失敗なし → failedReasonsは空配列');
  assert.equal(res.repairedTiles, 0, '救済なし → repairedTiles=0');
  assert.equal(state.calls.length, 6, '全タイルが1回ずつ呼ばれる');
});

await test('タイル数2 < 並列度3 ならワーカーは2本だけ', async () => {
  const { analyze, state } = makeAnalyze({ holdMs: 20 });
  const { sleep } = makeSleep();
  await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze, sleep, jitterMs: JITTER0, loadTiles: async () => fakeTiles(2),
  });
  assert.equal(state.maxInFlight, 2);
  assert.equal(state.calls.length, 2);
});

await test('各タイルの呼び出し前にジッターsleepが入る（6タイル=6回・100〜300ms相当の値）', async () => {
  const { analyze } = makeAnalyze({ holdMs: 1 });
  const { waits, sleep } = makeSleep();
  const jitters = [110, 250, 300, 100, 180, 220];
  let j = 0;
  await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze, sleep, jitterMs: () => jitters[j++ % jitters.length], loadTiles: async () => fakeTiles(6),
  });
  assert.equal(waits.length, 6, `sleep回数=${waits.length}（失敗なし→スイープ待機なし）`);
  assert.ok(waits.every((w) => w >= 100 && w <= 300), `全てジッター帯: ${waits}`);
});

// ---------------------------------------------------------------------------
console.log('■ 第2スイープ: 失敗タイルの拾い直し');

await test('失敗2件 → スイープで1件回復・1件残留 → failedTiles=1', async () => {
  // タイル1は1回目のみ失敗（スイープで回復）、タイル4は常に失敗
  const { analyze, state } = makeAnalyze({ failFirst: [1], failAlways: [4], holdMs: 5 });
  const { waits, sleep } = makeSleep();
  const res = await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze, sleep, jitterMs: JITTER0, loadTiles: async () => fakeTiles(6),
  });
  assert.equal(res.failedTiles, 1, `failedTiles=${res.failedTiles}`);
  assert.equal(res.totalTiles, 6);
  // failedReasonsはスイープ後の最終状態のみ（回復したタイル1は含まない・タイル番号は1始まり）
  assert.equal(res.failedReasons.length, 1);
  assert.equal(res.failedReasons[0].tile, 5, 'タイル番号は1始まり（idx4→tile5）');
  assert.equal(res.failedReasons[0].kind, 'rate_limit', '429はrate_limitに分類');
  // 回復したタイル1の結果が取り込まれている（_tile=1）
  assert.ok(res.results.some((r) => r._tile === 1 && r.room === 'R1'), '回復タイルの結果を取り込む');
  // 残留失敗のタイル4の結果は無い
  assert.ok(!res.results.some((r) => r._tile === 4), '失敗タイルの結果は含まれない');
  // スイープ前に5秒待機が1回入る
  assert.ok(waits.includes(5000), `5秒待機あり: ${waits}`);
  assert.equal(waits.filter((w) => w === 5000).length, 1, '5秒待機は1回だけ');
  // 再試行はタイル1と4に対して1回ずつ（計8呼び出し）
  assert.equal(state.attempts.get(1), 2);
  assert.equal(state.attempts.get(4), 2);
  assert.equal(state.calls.length, 8);
});

await test('スイープの呼び出しは呼び出し内リトライ無効（retryMax:0）で呼ばれる', async () => {
  // 差し戻し対応（2026-07-20）: スイープがGEMINI_RETRY_MAX=4を持ったまま直列実行されると
  // 失敗nタイルで最悪n×約300秒（n=6で30分級）になるため、スイープはretryMax:0で1試行のみ
  const calls = []; // {idx, attempt, options}
  const attempts = new Map();
  const analyze = async (_f, base64Data, _m, _p, options) => {
    const idx = Number(base64Data.replace('tile', ''));
    const attempt = (attempts.get(idx) || 0) + 1;
    attempts.set(idx, attempt);
    calls.push({ idx, attempt, options });
    if (idx === 2 && attempt === 1) {
      return { parsed: null, rawText: null, error: { status: 429, message: 'rate limited (mock)' } };
    }
    return { parsed: { codes: [{ room: `R${idx}`, code: 'G14' }] }, rawText: 'x' };
  };
  const { sleep } = makeSleep();
  const res = await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze, sleep, jitterMs: JITTER0, loadTiles: async () => fakeTiles(6),
  });
  assert.equal(res.failedTiles, 0, 'スイープで回復');
  const first = calls.filter((c) => c.attempt === 1);
  assert.equal(first.length, 6);
  assert.ok(first.every((c) => c.options?.retryMax === undefined),
    '第1スイープはretryMax上書きなし（GEMINI_RETRY_MAXの既定リトライが有効）');
  const sweep = calls.filter((c) => c.attempt === 2);
  assert.equal(sweep.length, 1, 'スイープ再試行は失敗タイル(2)の1回のみ');
  assert.equal(sweep[0].idx, 2);
  assert.equal(sweep[0].options?.retryMax, 0, 'スイープは呼び出し内リトライ無効');
});

await test('スイープの再試行は直列（同時1本）で走る', async () => {
  const { analyze, state } = makeAnalyze({ failFirst: [0, 3, 5], holdMs: 15 });
  const { sleep } = makeSleep();
  // 第1スイープ終了後に並列度カウンタをリセットして、スイープ中の最大並列度だけを観測する
  let sweepPhase = false;
  let sweepMax = 0;
  const wrapped = (...args) => {
    // analyze()は呼び出しと同期的にinFlight++する → 呼んだ直後の値=この瞬間の並列度
    const p = analyze(...args);
    if (sweepPhase) sweepMax = Math.max(sweepMax, state.inFlight);
    return p;
  };
  const sleepSpy = async (ms) => {
    if (ms === 5000) sweepPhase = true; // 5秒待機以降=スイープ
  };
  const res = await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze: wrapped, sleep: sleepSpy, jitterMs: JITTER0, loadTiles: async () => fakeTiles(6),
  });
  assert.equal(sweepMax, 1, `スイープ中の並列度=${sweepMax}（期待=1）`);
  assert.equal(res.failedTiles, 0, '3件とも回復');
});

await test('throwする失敗もスイープ対象（1回目throw→2回目成功で回復）', async () => {
  const { analyze } = makeAnalyze({ throwFirst: [2], holdMs: 1 });
  const { waits, sleep } = makeSleep();
  const res = await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze, sleep, jitterMs: JITTER0, loadTiles: async () => fakeTiles(6),
  });
  assert.equal(res.failedTiles, 0);
  assert.ok(res.results.some((r) => r._tile === 2));
  assert.ok(waits.includes(5000));
});

await test('r=null（キー未設定相当）も失敗に数え、スイープでも回復しなければ残留', async () => {
  const nullAnalyze = async () => null;
  const { waits, sleep } = makeSleep();
  const res = await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze: nullAnalyze, sleep, jitterMs: JITTER0, loadTiles: async () => fakeTiles(3),
  });
  assert.equal(res.failedTiles, 3);
  assert.deepEqual(res.results, []);
  assert.ok(res.failedReasons.every((f) => f.kind === 'empty'), 'r=nullはemptyに分類');
  assert.ok(waits.includes(5000), 'スイープは試みられる');
});

await test('失敗なしならスイープは走らない（5秒待機なし・追加呼び出しなし）', async () => {
  const { analyze, state } = makeAnalyze({ holdMs: 1 });
  const { waits, sleep } = makeSleep();
  await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze, sleep, jitterMs: JITTER0, loadTiles: async () => fakeTiles(6),
  });
  assert.ok(!waits.includes(5000), `5秒待機なし: ${waits}`);
  assert.equal(state.calls.length, 6);
});

// ---------------------------------------------------------------------------
console.log('■ 従来仕様の維持');

await test('resultsはタイル順を維持し、_tile番号が付く', async () => {
  const { analyze } = makeAnalyze({ holdMs: 5 });
  const { sleep } = makeSleep();
  const res = await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze, sleep, jitterMs: JITTER0, loadTiles: async () => fakeTiles(4),
  });
  assert.deepEqual(res.results.map((r) => r._tile), [0, 1, 2, 3]);
  assert.deepEqual(res.results.map((r) => r.room), ['R0', 'R1', 'R2', 'R3']);
});

await test('タイル分割不可（loadTilesがnull）→ nullを返す', async () => {
  const { analyze } = makeAnalyze();
  const res = await analyzeTiles('dummy.pdf', 'p', 'codes', {
    analyze, sleep: async () => {}, jitterMs: JITTER0, loadTiles: async () => null,
  });
  assert.equal(res, null);
});

await test('タイル分割がthrow → nullを返す（従来のcatch挙動）', async () => {
  const { analyze } = makeAnalyze();
  const origError = console.error;
  console.error = () => {};
  try {
    const res = await analyzeTiles('dummy.pdf', 'p', 'codes', {
      analyze, sleep: async () => {}, jitterMs: JITTER0,
      loadTiles: async () => { throw new Error('sharp失敗(mock)'); },
    });
    assert.equal(res, null);
  } finally {
    console.error = origError;
  }
});

await test('parsedに該当キーが無ければ空扱い（失敗には数えない）', async () => {
  const emptyAnalyze = async () => ({ parsed: { openings: [] }, rawText: 'x' });
  const { sleep } = makeSleep();
  const res = await analyzeTiles('dummy.png', 'p', 'codes', {
    analyze: emptyAnalyze, sleep, jitterMs: JITTER0, loadTiles: async () => fakeTiles(3),
  });
  assert.equal(res.failedTiles, 0);
  assert.deepEqual(res.results, []);
});

// ---------------------------------------------------------------------------
console.warn = origWarn;
console.log('');
console.log(`結果: ✅${pass} / ✗${fail}`);
process.exit(fail > 0 ? 1 : 0);
