/**
 * 配線・運用系修正（サイクルC）の検証: 警告のフロント返却 / lost update縮小 / updateスキップ /
 * auxの恒久エラー文言 / 単価ゆるい一致の単位ガード
 *
 * 実行: node scripts/test-calc-wiring.mjs（AI呼び出しなし・DB不要。expressマウント+スタブprisma）
 *
 * 検証対象（src/routes/projects.js）:
 *  - auxAiErrorResponse: 恒久エラー（キー未設定/401/403）と一時エラー（429等）の文言分岐
 *  - mergeAuxIntoFresh: /aux 書き込み直前の再読取マージ（並行 /calculate の警告を消さない）
 *  - POST /:id/calculate: 再読取マージで /aux データを巻き戻さない・警告同一なら update スキップ・
 *    レスポンス warnings がマージ後の最新一覧
 *  - POST /:id/aux: APIキー未設定時に「運営者にご連絡ください」系の文言（再試行誘導ではなく）
 *  - 単価ゆるい一致: unit 不一致の単価行を適用しない
 *
 * 追加（2026-07-24）: 下地高の供給経路 Override(stud_height/stud_height_wet) → opts.studHeight
 *  - parseStudHeightOverrides のパース（未設定はundefined＝既定値フォールバックが効く）
 *  - /calculate で実際に拾い値へ反映され、下地高フォールバック警告が消えること
 *  - 不正値は採用せず警告を維持（サイレント誤りにしない）
 *  - by_room の空文字キー弾き（部屋名なしの拾いを乗っ取らせない防御）
 */
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

// AIキーを確実に外す（/aux のキー未設定エラー経路を決定的に踏むため。dotenvは読み込まない）
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;
delete process.env.GOOGLE_GEMINI_API_KEY;
delete process.env.AI_PROVIDER;
delete process.env.UPLOAD_GUARD_TOKEN;

const { default: projectsRouter, auxAiErrorResponse, mergeAuxIntoFresh, parseStudHeightOverrides } =
  await import('../src/routes/projects.js');
const { computeElevationTakeoff, resolveStudHeightM } =
  await import('../src/services/buildupCalculator.js');

let pass = 0;
let fail = 0;
const test = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    fail++;
    console.error(`  ✗ ${name}\n     ${e.message}`);
  }
};
const testAsync = async (name, fn) => {
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
console.log('■ auxAiErrorResponse: 恒久/一時エラーの文言分岐');

test('キー未設定（is not configured）→ 運営者連絡の文言・再試行誘導なし', () => {
  const e = new Error('ANTHROPIC_API_KEY is not configured');
  e.status = 500;
  const { status, body } = auxAiErrorResponse(e);
  assert.equal(status, 503);
  assert.equal(body.error, 'ai_not_configured');
  assert.match(body.message, /運営者にご連絡ください/);
  assert.doesNotMatch(body.message, /1分ほど待って/);
});

test('Geminiキー未設定も同様', () => {
  const { body } = auxAiErrorResponse(new Error('GOOGLE_GEMINI_API_KEY is not configured'));
  assert.equal(body.error, 'ai_not_configured');
});

test('401（キー無効）→ 認証エラー文言・運営者連絡', () => {
  const e = new Error('authentication_error');
  e.status = 401;
  const { status, body } = auxAiErrorResponse(e);
  assert.equal(status, 503);
  assert.equal(body.error, 'ai_auth_error');
  assert.match(body.message, /401/);
  assert.match(body.message, /運営者にご連絡ください/);
});

test('403 → 認証エラー扱い', () => {
  const e = new Error('forbidden');
  e.status = 403;
  assert.equal(auxAiErrorResponse(e).body.error, 'ai_auth_error');
});

test('Gemini無効キー（HTTP 400 + API key not valid）→ 恒久扱い・運営者連絡', () => {
  // Geminiの無効/失効キーは401でなく400で返る（本番AI_PROVIDER=gemini稼働中の主経路）
  const e = new Error('[400 Bad Request] API key not valid. Please pass a valid API key.');
  e.status = 400;
  const { status, body } = auxAiErrorResponse(e);
  assert.equal(status, 503);
  assert.equal(body.error, 'ai_auth_error');
  assert.match(body.message, /運営者にご連絡ください/);
  assert.doesNotMatch(body.message, /1分ほど待って/);
});

test('Gemini無効キー（API_KEY_INVALID・statusなし）→ 恒久扱い', () => {
  const e = new Error('reason: API_KEY_INVALID');
  const { body } = auxAiErrorResponse(e);
  assert.equal(body.error, 'ai_auth_error');
  assert.match(body.message, /運営者にご連絡ください/);
});

test('無関係な400（プロンプト長超過等）→ 従来どおり一時エラー', () => {
  const e = new Error('[400 Bad Request] request payload size exceeds the limit');
  e.status = 400;
  const { body } = auxAiErrorResponse(e);
  assert.equal(body.error, 'ai_unavailable');
  assert.match(body.message, /1分ほど待って再アップロード/);
});

test('429（レート制限）→ 従来どおり一時エラー+再試行誘導', () => {
  const e = new Error('rate limited');
  e.status = 429;
  const { status, body } = auxAiErrorResponse(e);
  assert.equal(status, 503);
  assert.equal(body.error, 'ai_unavailable');
  assert.match(body.message, /429/);
  assert.match(body.message, /1分ほど待って再アップロード/);
});

test('ステータスなし（接続断）→ 一時エラー', () => {
  const { body } = auxAiErrorResponse(new Error('fetch failed'));
  assert.equal(body.error, 'ai_unavailable');
  assert.match(body.message, /接続/);
});

// ---------------------------------------------------------------------------
console.log('■ mergeAuxIntoFresh: /aux 書き込み直前マージ');

const aiW = { field: 'total_area', message: 'AI読取由来の警告', before: null, after: null };
const calcW = { field: 'wood_furring', message: '木胴縁の部分実測疑い', before: null, after: null, source: 'calculate' };
const partialW = {
  field: 'wall_codes_partial',
  message: '壁記号の読取タイル 2/12件がAPI制限で失敗しました。壁数量が過大になる可能性があります。展開図を再アップロードすると再読取します',
  before: null, after: null,
};

test('door: 並行/calculateの警告を保持しつつ自分のdoor_scheduleと矛盾警告を書く', () => {
  const base = { rooms: [], door_schedule: [{ symbol: 'WD-1TA', width_mm: 850 }], _warnings: [aiW] };
  const my = {
    ...structuredClone(base),
    door_schedule: [{ symbol: 'WD-1TA', width_mm: null }, { symbol: 'WD-2A', width_mm: 800 }],
    _warnings: [aiW, { field: 'door_schedule_conflict', message: '符号WD-1TAの寸法がページ間で矛盾', before: null, after: null }],
  };
  // 並行する/calculateが計算警告を追記していた（自分の読んでいない更新）
  const fresh = structuredClone(base);
  fresh._warnings = [aiW, calcW];
  const out = mergeAuxIntoFresh(fresh, base, my, 'door_schedule');
  assert.equal(out.door_schedule.length, 2, '自分のマージ済みdoor_scheduleが反映される');
  assert.ok(out._warnings.some((w) => w.source === 'calculate'), '並行追加された計算警告が消えない');
  assert.ok(out._warnings.some((w) => w.field === 'door_schedule_conflict'), '自分の矛盾警告が追加される');
  assert.equal(out._warnings.filter((w) => w.field === 'total_area').length, 1, 'AI警告は重複しない');
});

test('elevation: 展開図は丸ごと差し替え・部分失敗フラグ解消時はfreshからも警告が消える', () => {
  const base = {
    rooms: [],
    elevations: { rooms: [{ name: '旧' }] },
    wall_finish_codes: [{ room: '旧', code: 'G14' }],
    _wall_codes_partial: true,
    _warnings: [aiW, partialW],
  };
  const my = {
    ...structuredClone(base),
    elevations: { rooms: [{ name: '新LDK' }] },
    wall_finish_codes: [{ room: '新LDK', code: 'C04' }],
    _warnings: [aiW], // 全タイル成功→部分失敗警告を自分が削除した
  };
  delete my._wall_codes_partial;
  const fresh = structuredClone(base);
  fresh._warnings = [aiW, partialW, calcW]; // 並行/calculateの追記あり
  const out = mergeAuxIntoFresh(fresh, base, my, 'elevation');
  assert.equal(out.elevations.rooms[0].name, '新LDK', '展開図は自分の読取で差し替え');
  assert.equal(out.wall_finish_codes[0].code, 'C04');
  assert.ok(!('_wall_codes_partial' in out), '解消したフラグはfreshからも消える');
  assert.ok(!out._warnings.some((w) => w.field === 'wall_codes_partial'), '自分が消した警告はfreshからも消える');
  assert.ok(out._warnings.some((w) => w.source === 'calculate'), '並行追加の計算警告は保持');
});

test('elevation: 部分失敗発生時はフラグ+警告がfreshへ乗る', () => {
  const base = { rooms: [], _warnings: [] };
  const my = { rooms: [], elevations: { rooms: [] }, _wall_codes_partial: true, _warnings: [partialW] };
  const fresh = { rooms: [], _warnings: [calcW] };
  const out = mergeAuxIntoFresh(fresh, base, my, 'elevation');
  assert.equal(out._wall_codes_partial, true);
  assert.ok(out._warnings.some((w) => w.field === 'wall_codes_partial'));
  assert.ok(out._warnings.some((w) => w.source === 'calculate'));
});

test('警告が一切ない場合は_warningsキーを作らない', () => {
  const base = { rooms: [] };
  const my = { rooms: [], elevations: { rooms: [] } };
  const fresh = { rooms: [] };
  const out = mergeAuxIntoFresh(fresh, base, my, 'elevation');
  assert.ok(!('_warnings' in out));
});

// ---------------------------------------------------------------------------
// ルートレベル検証: expressに実ルーターをマウントし、スタブprismaで/calculateと/auxを叩く
// ---------------------------------------------------------------------------

/**
 * /calculate 用スタブprisma。initial=起動時読取、fresh=書き込み直前再読取のparsedData
 * overrides=Overrideテーブルの行（{itemKey, value}の配列。下地高の供給経路検証で使う）
 */
function makeCalcPrisma({ initialParsed, freshParsed, defaultPrices = [], overrides = [] }) {
  const calls = { aiReadingUpdates: [], materialListCreates: [] };
  const prisma = {
    project: {
      findFirst: async () => ({
        id: 1, name: 'テスト現場', companyId: null, guestToken: 'g',
        package: null,
        overrides: overrides.map((o) => ({ category: 'spec', ...o })),
        aiReadings: [{ id: 10, parsedData: JSON.stringify(initialParsed) }],
      }),
      update: async () => ({}),
    },
    aiReading: {
      findUnique: async () => ({ id: 10, parsedData: JSON.stringify(freshParsed) }),
      update: async (args) => { calls.aiReadingUpdates.push(args); return {}; },
    },
    unitPrice: { findMany: async () => [] },
    defaultUnitPrice: { findMany: async () => defaultPrices },
    materialList: {
      create: async (args) => { calls.materialListCreates.push(args); return { id: 99, ...args.data }; },
    },
  };
  return { prisma, calls };
}

function startApp(prisma) {
  const app = express();
  app.use(express.json());
  app.set('prisma', prisma);
  app.use('/api/projects', projectsRouter);
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const postJson = async (port, path, body = {}) => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-guest-token': 'g' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
};

console.log('■ POST /:id/calculate: 警告の再読取マージ+レスポンス同梱');

// 最小のparsedData（展開図なし=計算警告ゼロ経路。calculateMaterialsは欠落に頑健）
const baseParsed = {
  document_type: 'floor_plan',
  layout_type: '3LDK',
  total_floor_area_sqm: 65.76,
  ceiling_height_mm: 2400,
  partition_wall_length_m: 20,
  rooms: [
    { name: 'LDK', area_sqm: 20, floor_type: 'flooring' },
    { name: '洋室(1)', area_sqm: 10, floor_type: 'flooring' },
  ],
  openings: [],
};
const staleCalcW = { field: 'wood_furring', message: '前回計算の警告（今回解消）', before: null, after: null, source: 'calculate' };

await testAsync('並行/auxのdoor_scheduleを巻き戻さず・stale計算警告を除去・warningsを返す', async () => {
  const initial = { ...structuredClone(baseParsed), _warnings: [aiW, staleCalcW] };
  // /calculateの計算中に/auxが建具表を書き込んだ想定（初回読取に無いdoor_schedule）
  const fresh = { ...structuredClone(initial), door_schedule: [{ symbol: 'WD-1TA', width_mm: 850, height_mm: 2175 }] };
  const { prisma, calls } = makeCalcPrisma({ initialParsed: initial, freshParsed: fresh });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    // レスポンスにマージ後の最新警告一覧（stale計算警告は除去済み）
    assert.deepEqual(data.warnings, [aiW], 'warningsがフロント向けに同梱される');
    // 書き戻しは1回・freshベース（door_scheduleが消えていない）
    assert.equal(calls.aiReadingUpdates.length, 1, 'stale警告除去のため1回書き戻す');
    const written = JSON.parse(calls.aiReadingUpdates[0].data.parsedData);
    assert.equal(written.door_schedule?.[0]?.symbol, 'WD-1TA', '/auxが書いたdoor_scheduleが保持される');
    assert.deepEqual(written._warnings, [aiW]);
  } finally {
    server.close();
  }
});

await testAsync('警告に変化がなければparsedDataのupdateをスキップ（毎回全体書き戻しの抑止）', async () => {
  const initial = { ...structuredClone(baseParsed), _warnings: [aiW] };
  const { prisma, calls } = makeCalcPrisma({ initialParsed: initial, freshParsed: structuredClone(initial) });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200);
    assert.deepEqual(data.warnings, [aiW]);
    assert.equal(calls.aiReadingUpdates.length, 0, '同一内容ならaiReading.updateが走らない');
  } finally {
    server.close();
  }
});

await testAsync('警告ゼロ同士でもupdateスキップ・warningsは空配列', async () => {
  const initial = structuredClone(baseParsed);
  const { prisma, calls } = makeCalcPrisma({ initialParsed: initial, freshParsed: structuredClone(initial) });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.deepEqual(data.warnings, []);
    assert.equal(calls.aiReadingUpdates.length, 0);
  } finally {
    server.close();
  }
});

console.log('■ 単価ゆるい一致の単位ガード');

await testAsync('unit不一致の規格なし単価はマッチしない（m単価がm³/枚行に誤適用されない）', async () => {
  const initial = structuredClone(baseParsed);
  // 「壁 石膏ボード」は枚単位。mのゆるい単価は拒否されるべき
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    defaultPrices: [{ materialName: '壁 石膏ボード', spec: null, unitPrice: 1000, unit: 'm' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    const pb = data.materials.find((m) => m.name === '壁 石膏ボード');
    assert.ok(pb, '壁 石膏ボード行が出力される');
    assert.equal(pb.unit, '枚');
    assert.equal(pb.unitPrice, 0, '単位違いのゆるい一致は適用されない');
  } finally {
    server.close();
  }
});

await testAsync('unit一致の規格なし単価は従来どおり適用される（回帰なし）', async () => {
  const initial = structuredClone(baseParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    defaultPrices: [{ materialName: '壁 石膏ボード', spec: null, unitPrice: 1000, unit: '枚' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    const pb = data.materials.find((m) => m.name === '壁 石膏ボード');
    assert.equal(pb.unitPrice, 1000, '単位一致なら適用');
    assert.ok(pb.amount > 0);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
console.log('■ POST /:id/aux: APIキー未設定の恒久エラー文言（実ルート・multipart）');

await testAsync('キー未設定→「運営者にご連絡ください」（再試行誘導ではない）', async () => {
  const prisma = {
    project: { findFirst: async () => ({ id: 1, companyId: null, guestToken: 'g' }) },
    aiReading: {
      findFirst: async () => ({
        id: 10, parsedData: JSON.stringify(structuredClone(baseParsed)), filePath: null,
      }),
      findUnique: async () => null,
      update: async () => ({}),
    },
  };
  const { server, port } = await startApp(prisma);
  try {
    // マジックバイト検証を通る最小PNG風バイト列（AI呼び出し前にキー未設定で落ちる）
    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);
    const fd = new FormData();
    fd.append('elevation', new Blob([pngBytes], { type: 'image/png' }), 'elev.png');
    const res = await fetch(`http://127.0.0.1:${port}/api/projects/1/aux`, {
      method: 'POST', headers: { 'x-guest-token': 'g' }, body: fd,
    });
    const data = await res.json();
    assert.equal(res.status, 503, JSON.stringify(data).slice(0, 200));
    assert.equal(data.error, 'ai_not_configured');
    assert.match(data.message, /APIキー未設定/);
    assert.match(data.message, /運営者にご連絡ください/);
    assert.doesNotMatch(data.message, /1分ほど待って/);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// 下地高の供給経路（Override → opts.studHeight）・2026-07-24
// 下地高は物件ごとに違う（アルファ2.57/2.77 ↔ 別府2.72/2.82/2.86）が図面に書かれないため、
// 人が Override（itemKey: stud_height / stud_height_wet）で設定できることが必須。
// リゾルバ resolveStudHeightM は実装済みだったが供給経路が無く、全物件がフォールバック＋
// 「消せない警告」に落ちていた（狼少年化）。ここではその配線を検証する。
// ---------------------------------------------------------------------------
console.log('■ parseStudHeightOverrides: Override値のパース');

test('未設定なら undefined（optsに載せない＝既定値フォールバックが効く）', () => {
  assert.equal(parseStudHeightOverrides({}), undefined);
  assert.equal(parseStudHeightOverrides({ ceiling_height: '2400mm' }), undefined);
  assert.equal(parseStudHeightOverrides(), undefined);
});

test('一般部のみ設定 → default_mm のみ（wet_mmは載せない）', () => {
  assert.deepEqual(parseStudHeightOverrides({ stud_height: '2720' }), { default_mm: 2720 });
});

test('水回りのみ設定 → wet_mm のみ', () => {
  assert.deepEqual(parseStudHeightOverrides({ stud_height_wet: '2820' }), { wet_mm: 2820 });
});

test('両方設定 → 両方載る（別府Ａ〜Ｇ 2720/2820）', () => {
  assert.deepEqual(parseStudHeightOverrides({ stud_height: '2720', stud_height_wet: '2820' }),
    { default_mm: 2720, wet_mm: 2820 });
});

test('単位付き文字列も既存ceiling_heightと同じ流儀で拾う（2570mm）', () => {
  assert.deepEqual(parseStudHeightOverrides({ stud_height: '2570mm' }), { default_mm: 2570 });
});

test('空文字・空白のみ → 未設定扱い', () => {
  assert.equal(parseStudHeightOverrides({ stud_height: '', stud_height_wet: '   ' }), undefined);
});

test('非数（文字列・単位のみ）→ 未設定扱い', () => {
  assert.equal(parseStudHeightOverrides({ stud_height: 'なし', stud_height_wet: 'mm' }), undefined);
});

test('負値は符号が落ちて正数化される（レンジ判定はリゾルバに一元化）', () => {
  // 「-2570」→ 2570。負の下地高という無意味な値を素通しさせないための挙動。
  // レンジ外（例: -100 → 100）はリゾルバ側 STUD_HEIGHT_MIN/MAX で不採用になる
  assert.deepEqual(parseStudHeightOverrides({ stud_height: '-2570' }), { default_mm: 2570 });
});

test('レンジ外の値はパースは通るがリゾルバが採用しない（既定値へフォールバック）', () => {
  // 100mm（桁誤り）・9999mm（階高誤読）は resolveStudHeightM の 2200〜3200 レンジ外
  const tooSmall = parseStudHeightOverrides({ stud_height: '100' });
  assert.deepEqual(tooSmall, { default_mm: 100 });
  const st = { usedFallback: false, wetFromDefault: false };
  assert.equal(resolveStudHeightM({ name: '洋室(1)' }, { studHeight: tooSmall }, st), 2.57,
    'レンジ外は既定値2.57へ');
  assert.equal(st.usedFallback, true, 'レンジ外はフォールバック扱い＝警告が出る');
  const tooBig = parseStudHeightOverrides({ stud_height: '9999' });
  assert.equal(resolveStudHeightM({ name: '洋室(1)' }, { studHeight: tooBig }), 2.57);
});

console.log('■ by_room の空文字キー弾き（防御・将来のby_room供給に備える）');

test('by_roomの空文字キーが部屋名なしの拾い（遮音壁・収納内側）を乗っ取らない', () => {
  // resolveGeneralStudHeightM は {name:''} で呼ばれる。正規化後に '' になるキー（''・全角空白）を
  // 素通しすると、1部屋の指定のつもりが物件全体の既定を上書きしてしまう
  const opts = { studHeight: { by_room: { '': 3000, '　': 3100 }, default_mm: 2720 } };
  assert.equal(resolveStudHeightM({ name: '' }, opts), 2.72, '部屋名なしは②default_mmで解決');
  assert.equal(resolveStudHeightM({ name: undefined }, opts), 2.72);
  assert.equal(resolveStudHeightM({ name: '洋室(1)' }, opts), 2.72, '通常部屋も汚染されない');
});

test('正当なby_roomキーは従来どおり効く（回帰なし）', () => {
  const opts = { studHeight: { by_room: { '押入': 2820, '': 3000 }, default_mm: 2720 } };
  assert.equal(resolveStudHeightM({ name: '押入' }, opts), 2.82);
});

console.log('■ POST /:id/calculate: overrides → opts.studHeight → 警告の解消');

// 展開図つきparsedData。遮音壁L14面（下地高で拾う部位）を居室と水回りに1面ずつ置く。
// 遮音壁PBは summary.sound_wall_pb_sqm に出るので、ルート経由で「下地高が実際に効いたか」を
// レスポンスから直接観測できる（間仕切下地(木)は建材表示スコープ外でmaterialsに出ないため）。
// 他の面はC04（打放・PBなし）にして拾いを遮音壁だけに絞る
const elevParsed = {
  ...structuredClone(baseParsed),
  elevations: {
    rooms: [
      { name: '洋室(1)', ceiling_height_mm: 2400, faces: [
        { face: 'A', width_mm: 10000, wall_code: 'L14', openings: [] },
        { face: 'B', width_mm: 1, wall_code: 'C04', openings: [] },
        { face: 'C', width_mm: 1, wall_code: 'C04', openings: [] },
        { face: 'D', width_mm: 1, wall_code: 'C04', openings: [] },
      ] },
      { name: 'トイレ', ceiling_height_mm: 2200, faces: [
        { face: 'A', width_mm: 4000, wall_code: 'L14', openings: [] },
        { face: 'B', width_mm: 1, wall_code: 'C04', openings: [] },
        { face: 'C', width_mm: 1, wall_code: 'C04', openings: [] },
        { face: 'D', width_mm: 1, wall_code: 'C04', openings: [] },
      ] },
    ],
  },
};
// 期待値は観測値の写しではなく拾い式から算出する:
//   遮音壁PB(L下地の面) = Σ(面幅×下地高−開口)。開口なしなので 10×一般部 + 4×水回り
//   （トイレは WET_ROOM_NAME_RE 該当＝水回りの下地高が当たる）
const soundExpected = (generalM, wetM) => 10 * generalM + 4 * wetM;
const findWarn = (data, field) => (data.warnings || []).find((w) => w.field === field);

await testAsync('overrides未設定: 既定値で計算し stud_height 警告が出る（現状の挙動）', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma, calls } = makeCalcPrisma({ initialParsed: initial, freshParsed: structuredClone(initial) });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    assert.ok(findWarn(data, 'stud_height'), '既定値使用の警告が出る');
    assert.match(findWarn(data, 'stud_height').message, /2\.57/);
    // 既定値 2.57/2.77 での拾い（トイレは水回り＝2.77）
    const expected = soundExpected(2.57, 2.77);
    const actual = data.summary.sound_wall_pb_sqm;
    assert.ok(Math.abs(actual - expected) < 0.02,
      `遮音壁PB ${actual} ≒ ${expected}（既定値2.57/2.77）`);
  } finally {
    server.close();
  }
});

await testAsync('stud_height+stud_height_wet 設定: opts.studHeightに流れ両警告が消える', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma, calls } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'stud_height', value: '2720' }, { itemKey: 'stud_height_wet', value: '2820' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    assert.equal(findWarn(data, 'stud_height'), undefined, '下地高フォールバック警告が消える');
    assert.equal(findWarn(data, 'stud_height_wet'), undefined, '水回り未指定警告も消える');
    // 別府Ａ〜Ｇの実測 2.72/2.82 で拾えている（＝opts.studHeightが実際に効いている）
    const expected = soundExpected(2.72, 2.82);
    const actual = data.summary.sound_wall_pb_sqm;
    assert.ok(Math.abs(actual - expected) < 0.02,
      `遮音壁PB ${actual} ≒ ${expected}（別府2.72/2.82）`);
  } finally {
    server.close();
  }
});

await testAsync('stud_heightのみ設定: フォールバック警告は消え、水回り未指定の警告だけ残る', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma, calls } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'stud_height', value: '2860' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(findWarn(data, 'stud_height'), undefined, '既定値フォールバック警告は消える');
    assert.ok(findWarn(data, 'stud_height_wet'), '水回り未指定の警告は残る（外挿していない明示）');
    // 別府Ｈ・Ｉ型（drop=0）: 水回りも2.86で拾う＝一般部と同値
    const expected = soundExpected(2.86, 2.86);
    const actual = data.summary.sound_wall_pb_sqm;
    assert.ok(Math.abs(actual - expected) < 0.02,
      `遮音壁PB ${actual} ≒ ${expected}（別府Ｈ/Ｉ 2.86）`);
  } finally {
    server.close();
  }
});

await testAsync('不正値のoverride: 既定値へフォールバックし警告が残る（サイレント誤りにしない）', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma, calls } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'stud_height', value: 'あとで入れる' }, { itemKey: 'stud_height_wet', value: '100' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.ok(findWarn(data, 'stud_height'), '非数・レンジ外は採用せず警告を維持');
    const expected = soundExpected(2.57, 2.77);
    const actual = data.summary.sound_wall_pb_sqm;
    assert.ok(Math.abs(actual - expected) < 0.02, `既定値のまま ${actual} ≒ ${expected}`);
  } finally {
    server.close();
  }
});

await testAsync('無関係なoverride（天井高）だけならstudHeightは渡らない（回帰なし）', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'ceiling_height', value: '2400mm' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.ok(findWarn(data, 'stud_height'), '既定値フォールバックのまま＝studHeightは未供給');
  } finally {
    server.close();
  }
});

// 供給経路の等価性: ルート経由で流した結果が、リゾルバを直接叩いた値と一致することの裏取り
test('parseStudHeightOverridesの出力がそのままcomputeElevationTakeoffのoptsとして機能する', () => {
  const studHeight = parseStudHeightOverrides({ stud_height: '2720', stud_height_wet: '2820' });
  const t = computeElevationTakeoff(elevParsed.elevations, [], { studHeight });
  assert.equal(t.stud_height_fallback, false);
  assert.equal(t.stud_height_wet_from_default, false);
  const expected = soundExpected(2.72, 2.82);
  assert.ok(Math.abs(t.sound_wall_pb_sqm - expected) < 0.02,
    `${t.sound_wall_pb_sqm} ≒ ${expected}`);
});

// ---------------------------------------------------------------------------
console.log(`\n結果: ✅${pass} / ✗${fail}`);
process.exit(fail > 0 ? 1 : 0);
