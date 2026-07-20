/**
 * タイル失敗理由の分類+途切れJSON救済の検証（2026-07-20）
 *
 * 背景: 本番でタイル1〜2/6失敗が続くが、旧警告文言は「API制限で失敗」決め打ちで
 * 実際の理由（429/5xx/JSONパース失敗/その他）を区別できず診断不能だった。
 * 今朝の課金済みローカル実行では JSONパース失敗（Expected ',' or ']' at position 4994
 * =出力途切れ疑い）を1/6で観測。
 *
 * 実行: node scripts/test-tile-failures.mjs（AI呼び出しなし・DB不要・depsモック注入）
 * 検証対象:
 *  - claudeApi.js analyzeTiles: 失敗理由分類（rate_limit/server/parse/empty/error）と
 *    failedReasons/repairedTilesの返却・「parsedがnullでerrorも無い」のfailedTiles計上
 *    （記号なし=[]との区別維持）・parse失敗の第2スイープ対象化
 *  - claudeApi.js analyzeTiles: 途切れ救済のスイープ優先（レビューS-2: 初回途切れは失敗扱いで
 *    スイープへ・スイープでも回復しない場合のみ救済採用）
 *  - claudeApi.js parseAiText: 救済のタイル限定適用（レビューS-1: allowRepair=falseは従来どおり例外）
 *  - claudeApi.js repairTruncatedJson: 途切れJSONの救済（成功例・救済不能例）
 *  - projects.js tileFailureBreakdown + attachElevationData: 理由別内訳付き警告文言
 *    （途切れ救済×Nの配線を含む）
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// AIキーを外す（誤って実APIへ到達しないように。dotenvは読み込まない）
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;
delete process.env.GOOGLE_GEMINI_API_KEY;

const { analyzeTiles, repairTruncatedJson, parseAiText } = await import('../src/services/claudeApi.js');
const { attachElevationData, tileFailureBreakdown } = await import('../src/routes/projects.js');

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

/** 共通deps（待機なし・ジッター0） */
const fastDeps = (analyze, n) => ({
  analyze, sleep: async () => {}, jitterMs: () => 0, loadTiles: async () => fakeTiles(n),
});

// console.warnのモック出力を抑える（失敗系テストのノイズ防止）
const origWarn = console.warn;
console.warn = () => {};

// ---------------------------------------------------------------------------
console.log('■ analyzeTiles: 失敗理由の分類（failedReasons）');

/** タイル0だけが指定の結果を返し、他は成功するモック */
const failTile0With = (result) => async (_f, base64Data) => {
  const idx = Number(base64Data.replace('tile', ''));
  if (idx === 0) return typeof result === 'function' ? result() : result;
  return { parsed: { codes: [{ room: `R${idx}`, code: 'G14' }] }, rawText: 'x' };
};

await test('429 → rate_limit（呼び出し内で持ち帰ったerror）', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With({ parsed: null, rawText: null, error: { status: 429, message: 'Too Many Requests' } }), 3));
  assert.equal(res.failedTiles, 1);
  assert.deepEqual(res.failedReasons, [{ tile: 1, kind: 'rate_limit', detail: 'Too Many Requests' }]);
});

await test('503 → server（5xx系）', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With({ parsed: null, rawText: null, error: { status: 503, message: 'overloaded' } }), 3));
  assert.equal(res.failedReasons[0].kind, 'server');
});

await test('SyntaxError（status無し）→ parse（救済不能の出力途切れの持ち帰り形）', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With({
      parsed: null, rawText: null,
      error: { status: null, name: 'SyntaxError', message: "Expected ',' or ']' after array element in JSON at position 4994" },
    }), 3));
  assert.equal(res.failedReasons[0].kind, 'parse');
  assert.ok(res.failedReasons[0].detail.length <= 80, 'detailは先頭80字まで');
});

await test('401（status有り・429/5xx/SyntaxError以外）→ error', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With({ parsed: null, rawText: null, error: { status: 401, message: 'API key not valid' } }), 3));
  assert.equal(res.failedReasons[0].kind, 'error');
});

await test('r=null（キー未設定等）→ empty', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(failTile0With(null), 3));
  assert.equal(res.failedReasons[0].kind, 'empty');
});

await test('throw経路もstatusで分類される（throw 429 → rate_limit）', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With(() => { const e = new Error('rate limited'); e.status = 429; throw e; }), 3));
  assert.equal(res.failedReasons[0].kind, 'rate_limit');
});

await test('detailにAPIキーが乗らない（key=xxxは伏せ字・80字丸め）', async () => {
  const longMsg = 'Error fetching from https://example.com/v1?key=SECRET-KEY-12345&alt=json: ' + 'x'.repeat(200);
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With({ parsed: null, rawText: null, error: { status: null, message: longMsg } }), 3));
  const d = res.failedReasons[0].detail;
  assert.ok(!d.includes('SECRET-KEY-12345'), `キーが伏せられている: ${d}`);
  assert.ok(d.includes('key=***'));
  assert.ok(d.length <= 80);
});

// ---------------------------------------------------------------------------
console.log('■ analyzeTiles: parsedがnull（errorなし）のfailedTiles計上と第2スイープ');

await test('parsed=null・errorなし → parse失敗としてfailedTilesに計上（旧: 黙って成功扱い）', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    failTile0With({ parsed: null, rawText: 'null' }), 3));
  assert.equal(res.failedTiles, 1, '空success扱いにしない');
  assert.equal(res.failedReasons[0].kind, 'parse');
});

await test('parse失敗タイルも第2スイープ対象（1回目parsed=null → 2回目成功で回復）', async () => {
  const attempts = new Map();
  const analyze = async (_f, base64Data) => {
    const idx = Number(base64Data.replace('tile', ''));
    const n = (attempts.get(idx) || 0) + 1;
    attempts.set(idx, n);
    if (idx === 1 && n === 1) return { parsed: null, rawText: 'null' }; // errorなしのパース失敗
    return { parsed: { codes: [{ room: `R${idx}`, code: 'G14' }] }, rawText: 'x' };
  };
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(analyze, 3));
  assert.equal(res.failedTiles, 0, 'スイープで回復');
  assert.equal(attempts.get(1), 2, '失敗タイルは再試行される');
  assert.ok(res.results.some((r) => r._tile === 1 && r.room === 'R1'), '回復結果を取り込む');
});

await test('「記号なし={codes:[]}」は従来どおり成功扱い（parse失敗と区別維持）', async () => {
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(
    async () => ({ parsed: { codes: [] }, rawText: '{"codes": []}' }), 3));
  assert.equal(res.failedTiles, 0);
  assert.deepEqual(res.failedReasons, []);
  assert.deepEqual(res.results, []);
});

// ---------------------------------------------------------------------------
console.log('■ analyzeTiles: 途切れ救済のスイープ優先（S-2）');

/** attempt回数を記録しつつ、タイル0の応答を試行回数で変えるモック */
const tile0Sequence = (...resultsByAttempt) => {
  const attempts = new Map();
  const analyze = async (_f, base64Data) => {
    const idx = Number(base64Data.replace('tile', ''));
    const n = (attempts.get(idx) || 0) + 1;
    attempts.set(idx, n);
    if (idx === 0) {
      const r = resultsByAttempt[Math.min(n, resultsByAttempt.length) - 1];
      return typeof r === 'function' ? r() : r;
    }
    return { parsed: { codes: [{ room: `R${idx}`, code: 'G14' }] }, rawText: 'x' };
  };
  return { analyze, attempts };
};
const REPAIRED_R0 = { parsed: { codes: [{ room: 'R0', code: 'C04' }] }, rawText: 'x', _truncated_repaired: true };
const CLEAN_R0 = { parsed: { codes: [{ room: 'R0', code: 'C04' }, { room: 'R0', code: 'I14' }] }, rawText: 'x' };

await test('初回途切れ → スイープでクリーン回復 → 全量採用（repairedTiles=0・failedTiles=0）', async () => {
  const { analyze, attempts } = tile0Sequence(REPAIRED_R0, CLEAN_R0);
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(analyze, 3));
  assert.equal(res.failedTiles, 0);
  assert.equal(res.repairedTiles, 0, '救済結果は使わない（スイープの全量を採用）');
  assert.equal(attempts.get(0), 2, '初回の途切れは救済可能でも失敗扱いでスイープへ');
  assert.equal(res.results.filter((r) => r._tile === 0).length, 2, 'スイープのクリーン結果（2件）を採用');
});

await test('初回途切れ → スイープでも途切れ → 救済採用（repairedTiles=1・失敗には数えない）', async () => {
  const { analyze, attempts } = tile0Sequence(REPAIRED_R0, REPAIRED_R0);
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(analyze, 3));
  assert.equal(res.failedTiles, 0);
  assert.deepEqual(res.failedReasons, []);
  assert.equal(res.repairedTiles, 1);
  assert.equal(attempts.get(0), 2);
  assert.ok(res.results.some((r) => r._tile === 0 && r.room === 'R0'), '救済結果を採用');
});

await test('初回途切れ → スイープが429で失敗 → 初回の救済結果に縮退採用（repairedTiles=1）', async () => {
  const { analyze } = tile0Sequence(REPAIRED_R0,
    { parsed: null, rawText: null, error: { status: 429, message: 'rate limited' } });
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(analyze, 3));
  assert.equal(res.failedTiles, 0, '救済結果があるのでfailedには残さない');
  assert.equal(res.repairedTiles, 1);
  assert.ok(res.results.some((r) => r._tile === 0 && r.room === 'R0'), '初回の救済結果を採用');
});

await test('初回429（救済結果なし）→ スイープも429 → 従来どおり残留失敗（縮退なし）', async () => {
  const err429 = { parsed: null, rawText: null, error: { status: 429, message: 'rate limited' } };
  const { analyze } = tile0Sequence(err429, err429);
  const res = await analyzeTiles('d.png', 'p', 'codes', fastDeps(analyze, 3));
  assert.equal(res.failedTiles, 1);
  assert.equal(res.failedReasons[0].kind, 'rate_limit');
  assert.equal(res.repairedTiles, 0);
});

// ---------------------------------------------------------------------------
console.log('■ parseAiText: 救済のタイル限定適用（S-1）');

const TRUNCATED = '{"codes": [{"room": "LDK", "code": "I14"}, {"room": "洋室';

await test('allowRepair=false（メイン・aux経路）→ 途切れは従来どおり例外（救済しない）', () => {
  assert.throws(() => parseAiText(TRUNCATED, false), SyntaxError,
    'dualでGeminiの部分roomsがreconcileの土台に勝つ退行を防ぐ');
});

await test('allowRepair=true（タイル経路）→ 救済して_truncated_repaired付きで返す', () => {
  const r = parseAiText(TRUNCATED, true);
  assert.equal(r._truncated_repaired, true);
  assert.deepEqual(r.parsed, { codes: [{ room: 'LDK', code: 'I14' }] });
  assert.equal(r.rawText, TRUNCATED, 'rawTextは原文のまま');
});

await test('完全なJSONはどちらのフラグでも救済印なしで通る', () => {
  const ok = '{"codes": [{"room": "LDK", "code": "I14"}]}';
  for (const flag of [false, true]) {
    const r = parseAiText(ok, flag);
    assert.deepEqual(r.parsed, { codes: [{ room: 'LDK', code: 'I14' }] });
    assert.ok(!('_truncated_repaired' in r), '救済印なし');
  }
});

await test('allowRepair=trueでも救済不能なら元の例外を投げる（→タイルはparse失敗計上）', () => {
  assert.throws(() => parseAiText('ただの文章です', true));
});

// ---------------------------------------------------------------------------
console.log('■ repairTruncatedJson: 途切れJSONの救済');

await test('配列要素の途中で切れた純JSON → 最後の完全な要素までで復旧', () => {
  const cut = '{"codes": [{"room": "洋室(1)", "code": "C04", "wall_length_mm": 5190}, {"room": "洋室(1)", "co';
  assert.deepEqual(repairTruncatedJson(cut), {
    codes: [{ room: '洋室(1)', code: 'C04', wall_length_mm: 5190 }],
  });
});

await test('閉じフェンスの無い```jsonブロック → フェンスを剥いで復旧', () => {
  const cut = '```json\n{"openings": [{"room": "LDK", "face": "A", "type": "片開き戸"}, {"room": "LD';
  assert.deepEqual(repairTruncatedJson(cut), {
    openings: [{ room: 'LDK', face: 'A', type: '片開き戸' }],
  });
});

await test('文字列値に{}を含む要素の後で切れても正しく閉じる', () => {
  const cut = '{"codes": [{"room": "A{B}", "code": "G14"}, {"room": "C';
  assert.deepEqual(repairTruncatedJson(cut), { codes: [{ room: 'A{B}', code: 'G14' }] });
});

await test('ネストしたオブジェクト/配列の途中切れ → 未閉鎖の括弧を全て補う', () => {
  const cut = '{"a": {"b": [1, 2, {"c": 3},';
  assert.deepEqual(repairTruncatedJson(cut), { a: { b: [1, 2, { c: 3 }] } });
});

await test('空配列の閉じ}だけ欠け → 復旧', () => {
  assert.deepEqual(repairTruncatedJson('{"codes": []'), { codes: [] });
});

await test('救済不能: JSONの気配が無いテキスト → undefined', () => {
  assert.equal(repairTruncatedJson('この図面には壁仕上記号が見当たりませんでした。'), undefined);
});

await test('救済不能: 完全な要素が1つも無い（{"codes": [ で切れ）→ undefined', () => {
  assert.equal(repairTruncatedJson('{"codes": [{"room": "洋室'), undefined);
});

await test('救済不能: 空文字/非文字列 → undefined', () => {
  assert.equal(repairTruncatedJson(''), undefined);
  assert.equal(repairTruncatedJson(null), undefined);
});

await test('正常なJSONもそのまま通る（冪等・呼ばれても壊さない）', () => {
  const ok = '{"codes": [{"room": "LDK", "code": "I14"}]}';
  assert.deepEqual(repairTruncatedJson(ok), { codes: [{ room: 'LDK', code: 'I14' }] });
});

// ---------------------------------------------------------------------------
console.log('■ 警告文言: 理由別内訳（tileFailureBreakdown + attachElevationData）');

await test('tileFailureBreakdown: 種別を集計して「レート制限×2・解析失敗×1」形式', () => {
  assert.equal(tileFailureBreakdown([
    { tile: 1, kind: 'rate_limit' }, { tile: 3, kind: 'parse' }, { tile: 5, kind: 'rate_limit' },
  ]), 'レート制限×2・解析失敗×1');
  assert.equal(tileFailureBreakdown([{ tile: 2, kind: 'server' }, { tile: 4, kind: 'empty' }]),
    'サーバーエラー×1・応答なし×1');
  assert.equal(tileFailureBreakdown([{ tile: 1, kind: 'mystery' }]), 'mystery×1', '未知kindは素通し表示');
});

await test('tileFailureBreakdown: failedReasons無し/空 → 空文字（旧経路フォールバック）', () => {
  assert.equal(tileFailureBreakdown(undefined), '');
  assert.equal(tileFailureBreakdown([]), '');
});

await test('tileFailureBreakdown: repairedTilesは末尾に「途切れ救済×N」で足す', () => {
  assert.equal(tileFailureBreakdown([{ tile: 1, kind: 'rate_limit' }], 2), 'レート制限×1・途切れ救済×2');
  assert.equal(tileFailureBreakdown([], 1), '途切れ救済×1', '失敗ゼロでも救済のみ表示');
  assert.equal(tileFailureBreakdown(undefined, 0), '');
});

// attachElevationDataの実配線（planPathの存在チェックを通すためこのファイル自身を使う）
const SELF = fileURLToPath(import.meta.url);
const elevParsed = () => ({ rooms: [{ name: 'LDK', faces: [{ face: 'A' }] }] });

await test('attachElevationData: 部分失敗の警告に内訳が入る', async () => {
  const analysisResult = { rooms: [{ name: 'LDK' }] }; // wall_finish_codes無し → タイル再読取
  await attachElevationData(analysisResult, elevParsed(), SELF, SELF, {
    wallCodesAnalyzer: async () => ({
      results: [], failedTiles: 2, totalTiles: 6,
      failedReasons: [{ tile: 1, kind: 'rate_limit', detail: '' }, { tile: 4, kind: 'parse', detail: '' }],
    }),
    openingsAnalyzer: async () => null,
  });
  assert.equal(analysisResult._wall_codes_partial, true);
  const w = analysisResult._warnings.find((x) => x.field === 'wall_codes_partial');
  assert.equal(w.message,
    '壁記号の読取タイル 2/6件が不完全です（内訳: レート制限×1・解析失敗×1）。' +
    '壁数量が過大になる可能性があります。展開図を再アップロードすると再読取します');
});

await test('attachElevationData: failedReasons無し（旧モック互換）→ 内訳なし文言', async () => {
  const analysisResult = { rooms: [{ name: 'LDK' }] };
  await attachElevationData(analysisResult, elevParsed(), SELF, SELF, {
    wallCodesAnalyzer: async () => ({ results: [], failedTiles: 1, totalTiles: 6 }),
    openingsAnalyzer: async () => null,
  });
  const w = analysisResult._warnings.find((x) => x.field === 'wall_codes_partial');
  assert.equal(w.message,
    '壁記号の読取タイル 1/6件が不完全です。' +
    '壁数量が過大になる可能性があります。展開図を再アップロードすると再読取します');
});

await test('attachElevationData: 途切れ救済のみ（failedTiles=0）でも警告+partialフラグ', async () => {
  // S-2の配線: 救済採用は結果があっても要素欠落の可能性があるため、
  // 警告表示+_wall_codes_partial=true（再アップロードで全量再読取のチャンスを残す）
  const analysisResult = { rooms: [{ name: 'LDK' }] };
  await attachElevationData(analysisResult, elevParsed(), SELF, SELF, {
    wallCodesAnalyzer: async () => ({
      results: [{ room: 'LDK', codes: ['C04'], placements: [{ code: 'C04', wall_length_mm: 2200 }] }],
      failedTiles: 0, totalTiles: 6, failedReasons: [], repairedTiles: 1,
    }),
    openingsAnalyzer: async () => null,
  });
  assert.equal(analysisResult._wall_codes_partial, true, '救済採用も再読取対象にする');
  const w = analysisResult._warnings.find((x) => x.field === 'wall_codes_partial');
  assert.equal(w.message,
    '壁記号の読取タイル 1/6件が不完全です（内訳: 途切れ救済×1）。' +
    '壁数量が過大になる可能性があります。展開図を再アップロードすると再読取します');
  assert.equal(analysisResult.wall_finish_codes.length, 1, '救済結果自体はマージされる');
});

await test('attachElevationData: 失敗+救済の混在 → 件数は合算・内訳は併記', async () => {
  const analysisResult = { rooms: [{ name: 'LDK' }] };
  await attachElevationData(analysisResult, elevParsed(), SELF, SELF, {
    wallCodesAnalyzer: async () => ({
      results: [], failedTiles: 1, totalTiles: 6,
      failedReasons: [{ tile: 2, kind: 'rate_limit', detail: '' }], repairedTiles: 1,
    }),
    openingsAnalyzer: async () => null,
  });
  const w = analysisResult._warnings.find((x) => x.field === 'wall_codes_partial');
  assert.equal(w.message,
    '壁記号の読取タイル 2/6件が不完全です（内訳: レート制限×1・途切れ救済×1）。' +
    '壁数量が過大になる可能性があります。展開図を再アップロードすると再読取します');
});

// ---------------------------------------------------------------------------
console.warn = origWarn;
console.log('');
console.log(`結果: ✅${pass} / ✗${fail}`);
process.exit(fail > 0 ? 1 : 0);
