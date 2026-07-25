/**
 * Gemini残高枯渇429の専用エラー化の検証（2026-07-25）
 *
 * 背景（2026-07-20実障害）: プリペイド残高0で全解析が429になったが、RPM超過の429と
 * 区別できず「RPM/多数決集中」と誤診して1日浪費した。残高枯渇はリトライしても直らないのに
 * GEMINI_RETRY_MAXのリトライが再投擲を積み上げ被害を拡大した。
 *
 * 実行: node scripts/test-credits-depleted.mjs（AI呼び出しなし・DB不要・モックのみ）
 * 検証対象:
 *  - claudeApi.js isCreditsDepletedMessage: 残高枯渇文言の検出（RPM/PerDay/キー無効を誤検出しない）
 *  - claudeApi.js gemini429RetryDecision: ①残高枯渇429=リトライ0回で即断念 ②RPM 429=従来どおり再試行
 *    ③PerDay 429=即断念（既存挙動の回帰なし）④503=再試行 ⑤401=再試行なし
 *  - claudeApi.js analyzeTiles(classifyTileFailure): 残高枯渇429→kind 'credits_depleted' / RPM→'rate_limit'
 *  - claudeApi.js buildAllAiFailedReason: 一括upload経路の文言分岐（残高枯渇=運営者連絡/他=従来文言）
 *  - projects.js auxAiErrorResponse: 残高枯渇=「運営者にご連絡」系 / RPM=再試行誘導（既存分岐の回帰なし）
 *  - projects.js tileFailureBreakdown: credits_depletedのラベル「AI残高不足」
 */
import assert from 'node:assert/strict';

// AIキーを外す（誤って実APIへ到達しないように。dotenvは読み込まない）
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;
delete process.env.GOOGLE_GEMINI_API_KEY;

const {
  isCreditsDepletedMessage, gemini429RetryDecision, analyzeTiles, buildAllAiFailedReason,
} = await import('../src/services/claudeApi.js');
const { auxAiErrorResponse, tileFailureBreakdown } = await import('../src/routes/projects.js');

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

// 2026-07-20実障害の実メッセージ形（SDKはfetchエラーに包んで返すことがあるため両形を使う）
const DEPLETED_MSG = '[429 Too Many Requests] Your prepayment credits are depleted. Please purchase more credits to continue using the API.';
const DEPLETED_MSG_WRAPPED = 'Error fetching from https://generativelanguage.googleapis.com/...: [429 ] Your prepayment credits are depleted.';
// RPM超過429の実メッセージ形（quotaId: ...PerMinutePerProjectPerModel）
const RPM_MSG = '[429 Too Many Requests] Resource has been exhausted (e.g. check quota). quotaId: GenerateRequestsPerMinutePerProjectPerModel';
// 日次上限429の実メッセージ形
const PERDAY_MSG = '[429 Too Many Requests] Quota exceeded. quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier';

// ---------------------------------------------------------------------------
console.log('■ isCreditsDepletedMessage: 検出パターン（誤検出なし）');

await test('残高枯渇メッセージ（実障害の文言）を検出する', () => {
  assert.equal(isCreditsDepletedMessage(DEPLETED_MSG), true);
});
await test('fetchエラーに包まれた形でも検出する', () => {
  assert.equal(isCreditsDepletedMessage(DEPLETED_MSG_WRAPPED), true);
});
await test('大文字小文字を無視する', () => {
  assert.equal(isCreditsDepletedMessage('YOUR PREPAYMENT CREDITS ARE DEPLETED'), true);
});
await test('prepayment単独でも検出する（文言変更への耐性）', () => {
  assert.equal(isCreditsDepletedMessage('Prepayment required to continue'), true);
});
await test('RPM超過429を残高枯渇と誤検出しない', () => {
  assert.equal(isCreditsDepletedMessage(RPM_MSG), false);
});
await test('日次上限429を残高枯渇と誤検出しない', () => {
  assert.equal(isCreditsDepletedMessage(PERDAY_MSG), false);
});
await test('キー無効メッセージを誤検出しない', () => {
  assert.equal(isCreditsDepletedMessage('API key not valid. Please pass a valid API key.'), false);
});
await test('null/空文字は検出しない', () => {
  assert.equal(isCreditsDepletedMessage(null), false);
  assert.equal(isCreditsDepletedMessage(''), false);
});

// ---------------------------------------------------------------------------
console.log('■ gemini429RetryDecision: リトライ可否（①残高枯渇=即断念 ②RPM=再試行 ③PerDay=即断念）');

await test('① 残高枯渇429はmaxRetries=4でもattempt=0で即断念（リトライ0回）+ 専用reason', () => {
  const d = gemini429RetryDecision({ status: 429, message: DEPLETED_MSG }, 0, 4);
  assert.equal(d.retry, false);
  assert.equal(d.reason, 'credits_depleted');
});
await test('② RPM 429は従来どおり再試行（attempt<maxRetries・待機15/30秒の漸増）', () => {
  const d0 = gemini429RetryDecision({ status: 429, message: RPM_MSG }, 0, 4);
  assert.deepEqual(d0, { retry: true, waitMs: 15000, reason: null });
  const d1 = gemini429RetryDecision({ status: 429, message: RPM_MSG }, 1, 4);
  assert.deepEqual(d1, { retry: true, waitMs: 30000, reason: null });
});
await test('② RPM 429もattempt>=maxRetriesなら断念（従来挙動）', () => {
  const d = gemini429RetryDecision({ status: 429, message: RPM_MSG }, 4, 4);
  assert.equal(d.retry, false);
  assert.equal(d.reason, null);
});
await test('② RPM 429でmaxRetries=0（既定値）なら再試行なし（従来挙動）', () => {
  const d = gemini429RetryDecision({ status: 429, message: RPM_MSG }, 0, 0);
  assert.equal(d.retry, false);
});
await test('③ PerDay 429は即断念+reason daily_quota（既存挙動の回帰なし）', () => {
  const d = gemini429RetryDecision({ status: 429, message: PERDAY_MSG }, 0, 4);
  assert.equal(d.retry, false);
  assert.equal(d.reason, 'daily_quota');
});
await test('④ 503は従来どおり再試行', () => {
  const d = gemini429RetryDecision({ status: 503, message: 'Service Unavailable' }, 0, 4);
  assert.deepEqual(d, { retry: true, waitMs: 15000, reason: null });
});
await test('⑤ 401（キー無効）は再試行しない（従来挙動）', () => {
  const d = gemini429RetryDecision({ status: 401, message: 'Unauthorized' }, 0, 4);
  assert.equal(d.retry, false);
  assert.equal(d.reason, null);
});
await test('残高枯渇でもstatusが429以外なら専用reasonにしない（400等の別障害を巻き込まない）', () => {
  const d = gemini429RetryDecision({ status: 400, message: DEPLETED_MSG }, 0, 4);
  assert.equal(d.reason, null);
});

// ---------------------------------------------------------------------------
console.log('■ analyzeTiles(classifyTileFailure): 残高枯渇のkind分類');

const fakeTiles = (n) =>
  Array.from({ length: n }, (_, i) => ({ base64Data: `tile${i}`, mimeType: 'image/png' }));
const fastDeps = (analyze, n) => ({
  analyze, sleep: async () => {}, jitterMs: () => 0, loadTiles: async () => fakeTiles(n),
});
const failTile0With = (result) => async (_f, base64Data) => {
  const idx = Number(base64Data.replace('tile', ''));
  if (idx === 0) return result;
  return { parsed: { codes: [{ room: `R${idx}`, code: 'G14' }] }, rawText: 'x' };
};

// 失敗系テストのログノイズ抑制
const origWarn = console.warn;
console.warn = () => {};

await test('残高枯渇429のタイル失敗 → kind credits_depleted', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With({ parsed: null, rawText: null, error: { status: 429, message: DEPLETED_MSG } }), 3));
  assert.equal(res.failedTiles, 1);
  assert.equal(res.failedReasons[0].kind, 'credits_depleted');
});
await test('RPM 429のタイル失敗 → 従来どおりkind rate_limit（回帰なし）', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With({ parsed: null, rawText: null, error: { status: 429, message: RPM_MSG } }), 3));
  assert.equal(res.failedReasons[0].kind, 'rate_limit');
});
await test('PerDay 429のタイル失敗 → 従来どおりkind rate_limit（回帰なし）', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With({ parsed: null, rawText: null, error: { status: 429, message: PERDAY_MSG } }), 3));
  assert.equal(res.failedReasons[0].kind, 'rate_limit');
});

console.warn = origWarn;

await test('tileFailureBreakdownのラベル: credits_depleted → 「AI残高不足×N」', () => {
  assert.equal(tileFailureBreakdown([{ tile: 1, kind: 'credits_depleted', detail: '' }]), 'AI残高不足×1');
});

// ---------------------------------------------------------------------------
console.log('■ auxAiErrorResponse: ④ 文言分岐（残高枯渇=運営者連絡 / RPM=再試行誘導）');

await test('残高枯渇429 → ai_credits_depleted + 「運営者にご連絡」系文言（503維持）', () => {
  const { status, body } = auxAiErrorResponse({ status: 429, message: DEPLETED_MSG });
  assert.equal(status, 503);
  assert.equal(body.error, 'ai_credits_depleted');
  assert.match(body.message, /運営者にご連絡/);
  assert.doesNotMatch(body.message, /再アップロード/); // 直らないリトライを誘導しない
});
await test('RPM 429 → 従来どおりai_unavailable + 再試行誘導文言（回帰なし）', () => {
  const { status, body } = auxAiErrorResponse({ status: 429, message: RPM_MSG });
  assert.equal(status, 503);
  assert.equal(body.error, 'ai_unavailable');
  assert.match(body.message, /再アップロード/);
});
await test('401 → 従来どおりai_auth_error（回帰なし）', () => {
  const { body } = auxAiErrorResponse({ status: 401, message: 'Unauthorized' });
  assert.equal(body.error, 'ai_auth_error');
});
await test('Gemini無効キー（400+API key not valid） → 従来どおりai_auth_error（回帰なし）', () => {
  const { body } = auxAiErrorResponse({ status: 400, message: 'API key not valid. Please pass a valid API key.' });
  assert.equal(body.error, 'ai_auth_error');
});
await test('キー未設定 → 従来どおりai_not_configured（回帰なし）', () => {
  const { body } = auxAiErrorResponse({ status: 500, message: 'GOOGLE_GEMINI_API_KEY is not configured' });
  assert.equal(body.error, 'ai_not_configured');
});

// ---------------------------------------------------------------------------
console.log('■ buildAllAiFailedReason: 一括upload経路の文言分岐');

await test('Gemini残高枯渇（provider=gemini） → 運営者連絡系文言', () => {
  const reason = buildAllAiFailedReason('gemini',
    { parsed: null, error: { status: 429, message: DEPLETED_MSG } }, null);
  assert.match(reason, /残高が不足/);
  assert.match(reason, /運営者にご連絡/);
  assert.doesNotMatch(reason, /時間をおいて再試行/);
});
await test('RPM 429（provider=gemini） → 従来文言そのまま（回帰なし）', () => {
  const reason = buildAllAiFailedReason('gemini',
    { parsed: null, error: { status: 429, message: RPM_MSG } }, null);
  assert.equal(reason, 'AI解析に失敗しました（Gemini: 429 / Claude: 未使用）。時間をおいて再試行してください。');
});
await test('provider=claudeではGemini側の残高枯渇を見ない（未使用側で誤分岐しない）', () => {
  const reason = buildAllAiFailedReason('claude',
    { parsed: null, error: { status: 429, message: DEPLETED_MSG } },
    { parsed: null, error: { status: 529, message: 'overloaded' } });
  assert.equal(reason, 'AI解析に失敗しました（Gemini: 未使用 / Claude: 529）。時間をおいて再試行してください。');
});
await test('キー未設定表示は従来どおり（回帰なし）', () => {
  const reason = buildAllAiFailedReason('dual', null, null);
  assert.equal(reason, 'AI解析に失敗しました（Gemini: キー未設定 / Claude: キー未設定）。時間をおいて再試行してください。');
});

// ---------------------------------------------------------------------------
console.log(`\n結果: ${pass}✅ / ${fail}✗`);
process.exit(fail > 0 ? 1 : 0);
