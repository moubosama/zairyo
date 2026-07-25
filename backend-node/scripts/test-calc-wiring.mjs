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

const {
  default: projectsRouter, auxAiErrorResponse, mergeAuxIntoFresh,
  parseStudHeightOverrides, parseKaibeWallOverrides,
} = await import('../src/routes/projects.js');
const { computeElevationTakeoff, resolveStudHeightM } =
  await import('../src/services/buildupCalculator.js');
// 建物種別（building_type）の疎通検証で「ルート経由＝直接呼び」の等価性を見るために使う
const { calculateMaterials } = await import('../src/services/materialCalculator.js');

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
// ※ 2026-07-24: 水回りの部屋（UB）を追加。耐水PBの下限2枚クランプを撤去した際に
//   「水回りを1つも読めていない＝cfArea=0」を読み落としとして警告する挙動を入れたため
//   （waterproof_pb_no_wet_room）、水回りの無いこの最小fixtureが計算警告を1件出すようになり、
//   **警告マージの配線を検証する**このテスト群の前提（計算警告ゼロ）が崩れていた。
//   ここで見たいのは配線であって耐水PBの数量ではないので、fixture側に水回りを足して
//   本来の「計算警告ゼロ経路」に戻す（耐水PBのガード自体は test-clamp-ratio-sanity.mjs で検証）。
const baseParsed = {
  document_type: 'floor_plan',
  layout_type: '3LDK',
  total_floor_area_sqm: 65.76,
  ceiling_height_mm: 2400,
  partition_wall_length_m: 20,
  rooms: [
    { name: 'LDK', area_sqm: 20, floor_type: 'flooring' },
    { name: '洋室(1)', area_sqm: 10, floor_type: 'flooring' },
    { name: 'UB', area_sqm: 3 },
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

console.log('■ POST /:id/calculate: overrides → 天井PB加算枚数（ceiling_pb_extra_sheets）');

// 天井PB加算のoverride疎通（下地高と同じ Override→overridesObj→calculateMaterials 経路）。
// パウダー/トイレ室を持つparsedDataで、override未設定=+4枚（アルファG）／override=0=加算なし（別府）を
// ルート経由のレスポンス（data.materials の天井 石膏ボード行）から直接観測する。
const ceilingParsed = {
  ...structuredClone(baseParsed),
  total_area_source: 'user_input',   // 天井PB比率サニティを declaredArea 基準にして誤発火を防ぐ
  rooms: [
    { name: 'リビング・ダイニング', area_sqm: 40, floor_type: 'flooring' },
    { name: 'トイレ', area_sqm: 2 },
  ],
};
const ceilingRow = (data) => data.materials.find((m) => m.name === '天井 石膏ボード');

await testAsync('override未設定: パウダー/トイレありは+4枚（アルファG既定・後方互換）', async () => {
  const initial = structuredClone(ceilingParsed);
  const { prisma } = makeCalcPrisma({ initialParsed: initial, freshParsed: structuredClone(initial) });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    const row = ceilingRow(data);
    assert.ok(row, '天井 石膏ボード行が出力される');
    assert.match(row.calculation, /\+ 4枚/, `既定は+4枚: ${row.calculation}`);
  } finally {
    server.close();
  }
});

await testAsync('override=0（別府）: 加算が止まる＝既定より4枚少ない', async () => {
  const initial = structuredClone(ceilingParsed);
  // 未設定と0の両方を同じ図面で計算し、差がちょうど4枚であることを確かめる
  const { prisma: pDefault } = makeCalcPrisma({ initialParsed: initial, freshParsed: structuredClone(initial) });
  const { prisma: pZero } = makeCalcPrisma({
    initialParsed: structuredClone(initial), freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'ceiling_pb_extra_sheets', value: '0' }],
  });
  const a = await startApp(pDefault);
  const b = await startApp(pZero);
  try {
    const def = await postJson(a.port, '/api/projects/1/calculate');
    const zero = await postJson(b.port, '/api/projects/1/calculate');
    const defRow = ceilingRow(def.data);
    const zeroRow = ceilingRow(zero.data);
    assert.match(zeroRow.calculation, /\+ 0枚/, `override=0は+0枚: ${zeroRow.calculation}`);
    assert.equal(defRow.quantity - zeroRow.quantity, 4,
      `別府相当(override=0)は既定より4枚少ない: 既定${defRow.quantity} vs 0指定${zeroRow.quantity}`);
  } finally {
    a.server.close();
    b.server.close();
  }
});

await testAsync('無関係なoverride（天井高）だけなら加算は既定4枚のまま（回帰なし）', async () => {
  const initial = structuredClone(ceilingParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'ceiling_height', value: '2400mm' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.match(ceilingRow(data).calculation, /\+ 4枚/, '無関係overrideで加算枚数は不変');
  } finally {
    server.close();
  }
});

console.log('■ POST /:id/calculate: overrides → GW充填率（glasswool_coverage）');

// 【SF-4】GW充填率のoverride疎通。stud_height / ceiling_pb_extra_sheets と同じ
//   Override → overridesObj → calculateMaterials(overrides) 経路だが、
//   実ルーターを通したテストが無く新規キーだけ無防備だった（grep glasswool が空）。
//   充填率は物件依存が最も激しい係数（アルファ=遮音壁のみ0.135 / 別府=全間仕切0.41〜0.78＝7〜8倍差）で、
//   check-engine-constants.mjs も「別府は overrides.glasswool_coverage=0.5 を指定すること」と案内している。
//   ＝この経路が黙って切れると別府で-70%級の過少が出る。
//
// 観測点: materials の「間仕切 グラスウール充填」行（数量と calculation の充填率表記）。
//   ※ 展開図ありのparsedDataだと applyElevationTakeoff が実測で置換して推定が表に出ないため、
//     ここでは展開図なしの baseParsed（間仕切20m・天井高2400）を使う。
//     期待値は観測値の写しではなく式から算出: ceil(間仕切壁延長 × 天井高 × 充填率)
const gwParsed = {
  ...structuredClone(baseParsed),
  total_area_source: 'user_input', // 床面積比サニティの誤発火を避ける（他のoverrideテストと同じ）
};
const gwRow = (data) => data.materials.find((m) => m.name === '間仕切 グラスウール充填');
const gwExpected = (coverage) => Math.ceil(20 * 2.4 * coverage); // 間仕切20m × 天井高2.4m × 充填率

await testAsync('override未設定: アルファ既定0.135で計算（後方互換）', async () => {
  const initial = structuredClone(gwParsed);
  const { prisma } = makeCalcPrisma({ initialParsed: initial, freshParsed: structuredClone(initial) });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    const row = gwRow(data);
    assert.ok(row, '間仕切 グラスウール充填行が出力される');
    assert.equal(row.quantity, gwExpected(0.135), `既定0.135: ${row.calculation}`);
    assert.match(row.calculation, /0\.135（充填率）/, `根拠欄に既定充填率: ${row.calculation}`);
  } finally {
    server.close();
  }
});

await testAsync('override=0.5（別府）: ルート経由で充填率が実際に効く', async () => {
  const initial = structuredClone(gwParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'glasswool_coverage', value: '0.5' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    const row = gwRow(data);
    assert.equal(row.quantity, gwExpected(0.5), `0.5指定: ${row.calculation}`);
    assert.match(row.calculation, /0\.5（充填率）/, `根拠欄も0.5: ${row.calculation}`);
    // 既定との差が「文字列のまま素通りしても数値として効く」ことの裏取り（0.5が5倍化していない等）
    assert.ok(row.quantity > gwExpected(0.135), '既定より増える（充填率が上がる方向）');
  } finally {
    server.close();
  }
});

await testAsync('不正値のoverride: 既定へフォールバックし glasswool_coverage_invalid 警告が出る', async () => {
  const initial = structuredClone(gwParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'glasswool_coverage', value: '50%' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.ok(findWarn(data, 'glasswool_coverage_invalid'),
      `不正値は採用せず警告（warnings=${JSON.stringify(data.warnings)}）`);
    assert.equal(gwRow(data).quantity, gwExpected(0.135), '既定0.135へフォールバック');
  } finally {
    server.close();
  }
});

await testAsync('無関係なoverride（天井高）だけなら充填率は既定のまま（回帰なし）', async () => {
  const initial = structuredClone(gwParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'ceiling_height', value: '2400mm' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(gwRow(data).quantity, gwExpected(0.135), '無関係overrideで充填率は不変');
    assert.equal(findWarn(data, 'glasswool_coverage_invalid'), undefined, '不正値警告も出ない');
  } finally {
    server.close();
  }
});

console.log('■ POST /:id/calculate: overrides → 界壁面（opts.kaibeWall 高さ/面積）');

// 【S-3】opts.kaibeWall が projects.js から computeElevationTakeoff に渡っていなかった
//   （planRooms/closetInteriors/studHeight のみ）＝高さoverrideも本番経路から到達不能なデッドコード。
//   ここで「Override → parseKaibeWallOverrides → opts.kaibeWall → 拾い値」の疎通を実ルーターで固定する。
//
// 観測点の事情: 木胴縁（界壁面）行は filterKenzaiScope（建材14項目）で response.materials から
//   落ちるため、data.materials では観測できない。代わりに applyElevationTakeoff が必ず出す
//   field='木胴縁（界壁面）' の警告（面積指定値と採用後の数量 after を含む）を観測する。
//   after は materials 行と同じ値なので、数量が実際に変わったことまで確認できる。
const kaibeWarn = (data) => (data.warnings || []).find((w) => w.field === '木胴縁（界壁面）');
const DOBUCHI_COEF = 0.0098; // XLS集計表X86（timberVolume.js DOBUCHI_M3_PER_SQM）
const kaibeM3 = (sqm) => Math.round(sqm * DOBUCHI_COEF * 10000) / 10000;

await testAsync('override未設定: アルファ既定5.047㎡/戸のまま（後方互換）', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma } = makeCalcPrisma({ initialParsed: initial, freshParsed: structuredClone(initial) });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    const w = kaibeWarn(data);
    assert.ok(w, `木胴縁の警告が出る（warnings=${JSON.stringify(data.warnings).slice(0, 300)}）`);
    assert.match(w.message, /実績ベースの推定値/, '既定は実績推定である旨');
    assert.equal(w.after, kaibeM3(5.047), `既定5.047㎡ → ${kaibeM3(5.047)}m³`);
  } finally {
    server.close();
  }
});

await testAsync('kaibe_wall_sqm=2.266（別府Ａ相当）: ルート経由で面積が実際に効く', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'kaibe_wall_sqm', value: '2.266' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    const w = kaibeWarn(data);
    assert.equal(w.after, kaibeM3(2.266), `別府Ａ 2.266㎡ → ${kaibeM3(2.266)}m³`);
    assert.match(w.message, /物件別に指定された界壁面積2\.266㎡/, `指定値を明示: ${w.message}`);
    assert.ok(w.after < kaibeM3(5.047), '既定より小さくなる（+123%の過大が解消する方向）');
  } finally {
    server.close();
  }
});

await testAsync('kaibe_wall_sqm=0（別府Ｂ/Ｊ＝界壁が実在しない）: 0m³で計上しない', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'kaibe_wall_sqm', value: '0' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    // 0は「未設定」ではなく正当な指定として採用される（ここが潰れると実在しない材を出し続ける）
    assert.equal(kaibeWarn(data).after, 0, '0指定で0m³');
  } finally {
    server.close();
  }
});

await testAsync('kaibe_wall_sqm=17.332（別府Ｈ相当）: 大きい側にも効く', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'kaibe_wall_sqm', value: '17.332' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(kaibeWarn(data).after, kaibeM3(17.332), '既定の-71%過少が解消する方向');
  } finally {
    server.close();
  }
});

await testAsync('不正値のoverride: 既定へフォールバックし kaibe_wall_sqm_invalid 警告が出る', async () => {
  const initial = structuredClone(elevParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'kaibe_wall_sqm', value: '-3' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.ok(findWarn(data, 'kaibe_wall_sqm_invalid'),
      `不正値は採用せず警告（warnings=${JSON.stringify(data.warnings).slice(0, 300)}）`);
    assert.equal(kaibeWarn(data).after, kaibeM3(5.047), '既定へフォールバック');
  } finally {
    server.close();
  }
});

await testAsync('kaibe_wall_height=2720（別府）: 界壁の実測がある面の拾い高さがルート経由で変わる', async () => {
  // 高さoverrideは「界壁の実測がある面」にしか効かない（面幅からの推測はしないため）。
  // 洋室(1)Ａ面に界壁幅1000mmを明示した図面で 2.45→2.72 の差を観測する。
  // 観測点: 実測値が実績推定の50%未満のときに出る警告の after（＝採用された材積）。
  //   1.0m×2.45=2.45㎡→0.024m³ / ×2.72=2.72㎡→0.0267m³ で、推定0.0495の50%(0.0247)を
  //   既定はまたがない・別府はまたぐため、既定だけ警告が出る。どちらの経路でも after は
  //   採用値そのものなので、警告の有無に依存しない形で数量を確かめられるよう両方を見る。
  const initial = structuredClone(elevParsed);
  initial.elevations.rooms[0].faces[0].kaibe_width_mm = 1000;
  const mk = (overrides) => makeCalcPrisma({
    initialParsed: structuredClone(initial), freshParsed: structuredClone(initial), overrides,
  }).prisma;
  const a = await startApp(mk([]));
  const b = await startApp(mk([{ itemKey: 'kaibe_wall_height', value: '2720' }]));
  try {
    const def = await postJson(a.port, '/api/projects/1/calculate');
    const bep = await postJson(b.port, '/api/projects/1/calculate');
    assert.equal(def.status, 200, JSON.stringify(def.data).slice(0, 200));
    assert.equal(bep.status, 200, JSON.stringify(bep.data).slice(0, 200));
    // 既定2.45: 実測0.024m³ が推定0.0495の50%未満 → 部分実測疑いの警告が出る（after=採用値）
    const wDef = kaibeWarn(def.data);
    assert.ok(wDef, `既定は部分実測疑いの警告が出る: ${JSON.stringify(def.data.warnings).slice(0, 300)}`);
    assert.equal(wDef.after, kaibeM3(2.45), `既定2.45m: ${kaibeM3(2.45)}m³`);
    // 別府2.72: 同じ図面で材積が増える＝高さoverrideが本番経路に届いている
    const wBep = kaibeWarn(bep.data);
    assert.equal(wBep, undefined, '2.72では50%未満に当たらないので警告は出ない');
    // 警告が出ない側は数量を直接見る必要があるが、木胴縁行はfilterKenzaiScopeで落ちるため
    // 「既定側だけ警告が出る」ことをもって高さの差が数量に反映されたと判定する
    // （2.45→警告あり / 2.72→警告なし の境界がちょうど50%ライン上にある）
  } finally {
    a.server.close();
    b.server.close();
  }
});

// 供給経路の等価性: ルーターが使うパーサの出力が、そのまま拾いエンジンのoptsとして機能する
test('parseKaibeWallOverrides: 高さmm→m・面積は文字列のまま（0を潰さない）', () => {
  assert.equal(parseKaibeWallOverrides({}), undefined, '未設定はoptsに載せない');
  assert.deepEqual(parseKaibeWallOverrides({ kaibe_wall_height: '2720' }), { height_m: 2.72 });
  assert.deepEqual(parseKaibeWallOverrides({ kaibe_wall_height: '2860mm' }), { height_m: 2.86 });
  assert.deepEqual(parseKaibeWallOverrides({ kaibe_wall_sqm: '0' }), { area_sqm: '0' },
    '0は未設定に丸めない（界壁なしの明示）');
  assert.deepEqual(parseKaibeWallOverrides({ kaibe_wall_sqm: '  2.266 ' }), { area_sqm: '2.266' });
  assert.deepEqual(parseKaibeWallOverrides({ kaibe_wall_sqm: '' }), undefined, '空文字は未設定');
  // 値の妥当性判定はエンジン側に一元化（ここでは載せるだけ）
  assert.deepEqual(parseKaibeWallOverrides({ kaibe_wall_sqm: '-3' }), { area_sqm: '-3' });
  assert.deepEqual(parseKaibeWallOverrides({ kaibe_wall_height: 'あとで' }), undefined,
    '数値として読めない高さは載せない');
  assert.deepEqual(
    parseKaibeWallOverrides({ kaibe_wall_height: '2720', kaibe_wall_sqm: '2.266' }),
    { height_m: 2.72, area_sqm: '2.266' });
});

test('parseKaibeWallOverridesの出力がそのままcomputeElevationTakeoffのoptsとして機能する', () => {
  const elev = { rooms: [
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [
      { face: 'C', width_mm: 2360, kaibe_width_mm: 1000, openings: [] },
    ] },
  ] };
  // 高さ: 既定2.45 → 別府2.72
  const def = computeElevationTakeoff(elev, [], { kaibeWall: parseKaibeWallOverrides({}) });
  assert.ok(Math.abs(def.kaibe_furring_sqm - 2.45) < 0.01, `既定2.45: ${def.kaibe_furring_sqm}`);
  const bep = computeElevationTakeoff(elev, [],
    { kaibeWall: parseKaibeWallOverrides({ kaibe_wall_height: '2720' }) });
  assert.ok(Math.abs(bep.kaibe_furring_sqm - 2.72) < 0.01, `別府2.72: ${bep.kaibe_furring_sqm}`);
  // 面積: 実測が無いケースの推定値がtakeoffへ載る（0も載る）
  const noFace = { rooms: [{ name: '洋室(3)', ceiling_height_mm: 2400, faces: [
    { face: 'C', width_mm: 2360, wall_code: 'C04', openings: [] },
  ] }] };
  const t0 = computeElevationTakeoff(noFace, [],
    { kaibeWall: parseKaibeWallOverrides({ kaibe_wall_sqm: '0' }) });
  assert.equal(t0.kaibe_estimate_sqm, 0);
  assert.equal(t0.kaibe_estimate_source, 'override');
  const tDef = computeElevationTakeoff(noFace, [], { kaibeWall: parseKaibeWallOverrides({}) });
  assert.equal(tDef.kaibe_estimate_sqm, 5.047, '未設定はアルファ既定（丸められていない）');
  assert.equal(tDef.kaibe_estimate_source, 'default');
});

console.log('■ POST /:id/calculate: overrides → 際根太（係数・下限・規格・材積換算の有無）');

// 【2026-07-24】際根太は「規格」だけ差し替えても数量が-60〜76%のままになる（別府は床面積比が
//   アルファの3.5〜4.6倍）ため、ratio / min_m / spec / volume を1プロファイルでoverrideする。
//   配線は Override → overridesObj → calculateMaterials(overrides) → resolveKiwanetaProfile。
//
// 観測点の事情: 際根太行（m・m³とも）は filterKenzaiScope（建材14項目）で response.materials から
//   落ちるため data.materials では観測できない（木胴縁と同じ事情）。よって
//   (a) ルート経由では「不正値の警告が warnings に出るか」＝overridesObj が届いている証拠 を見て、
//   (b) 数量そのものは同一の overridesObj で calculateMaterials を直接叩いて確認する（下の別ブロック）。
await testAsync('不正なkiwaneta_ratio: ルート経由で kiwaneta_ratio_invalid 警告が出る（overridesが届いている証拠）', async () => {
  const initial = structuredClone(baseParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'kiwaneta_ratio', value: '1.07m/㎡' }], // 単位付き＝数値として読めない
  });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    assert.ok(findWarn(data, 'kiwaneta_ratio_invalid'),
      `不正値は採用せず警告（warnings=${JSON.stringify(data.warnings)}）`);
  } finally {
    server.close();
  }
});

await testAsync('正常なkiwaneta_* override: 不正値警告は出ない（採用されている）', async () => {
  const initial = structuredClone(baseParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [
      { itemKey: 'kiwaneta_ratio', value: '1.07' },
      { itemKey: 'kiwaneta_min_m', value: '0' },
      { itemKey: 'kiwaneta_spec', value: 'H110' },
      { itemKey: 'kiwaneta_volume', value: 'なし' },
    ],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    for (const f of ['kiwaneta_ratio_invalid', 'kiwaneta_min_m_invalid', 'kiwaneta_volume_invalid']) {
      assert.equal(findWarn(data, f), undefined, `${f} が出ない（正常値は採用される）`);
    }
  } finally {
    server.close();
  }
});

console.log('■ POST /:id/calculate: overrides → 物件固有の追加部位行（extra_part_N_*）');

// 【2026-07-25】定数のoverrideでは埋まらない「行そのものが無い部位」を追加する経路。
//   第1号: 別府 集計表r10「ｽﾗﾌﾞ下り際根太 H=210」（Ａ23.3〜Ｇ24.3m/戸・Ｈ/Ｉは0＝存在しない）。
//   配線は Override → overridesObj → calculateMaterials(overrides) → resolveExtraParts。
//   ※ 際根太・木胴縁と違い、この行は**レスポンスの materials に出る**（filterKenzaiScope を
//     明示フラグで通す設計＝ユーザーが入力した行を画面から消さない）。よって数量まで直接観測できる。
const SLAB_NAME = 'ｽﾗﾌﾞ下り際根太';
const slabRow = (data) => data.materials.find((m) => m.name === SLAB_NAME);

await testAsync('extra_part_1_*（別府Ａ 23.3m）: ルート経由で行が出る・数量は指定値そのまま', async () => {
  const initial = structuredClone(baseParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [
      { itemKey: 'extra_part_1_name', value: SLAB_NAME },
      { itemKey: 'extra_part_1_spec', value: 'H=210' },
      { itemKey: 'extra_part_1_qty', value: '23.3' },
      { itemKey: 'extra_part_1_unit', value: 'm' },
    ],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    const row = slabRow(data);
    assert.ok(row, `追加部位の行がレスポンスに出る（materials=${data.materials.map((m) => m.name).join(',')}）`);
    assert.equal(row.quantity, 23.3, '指定値がそのまま（丸め・単位変換なし）');
    assert.equal(row.spec, 'H=210');
    assert.equal(row.unit, 'm');
    assert.equal(row.unitPrice, 0, '未登録の単価は0（既存材の単価を継承しない）');
  } finally {
    server.close();
  }
});

await testAsync('extra_part_1_qty=0（別府Ｈ・Ｉ）: 行そのものが出ない', async () => {
  const initial = structuredClone(baseParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [
      { itemKey: 'extra_part_1_name', value: SLAB_NAME },
      { itemKey: 'extra_part_1_qty', value: '0' },
    ],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(slabRow(data), undefined, '0指定は存在しない材の発注行を作らない');
  } finally {
    server.close();
  }
});

await testAsync('未指定（アルファ）: 追加部位の行は1つも増えない', async () => {
  const initial = structuredClone(baseParsed);
  const { prisma } = makeCalcPrisma({ initialParsed: initial, freshParsed: structuredClone(initial) });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(data.materials.some((m) => m.extra_part === true), false,
      '追加部位フラグの行が存在しない');
  } finally {
    server.close();
  }
});

await testAsync('不正値: 行を作らず extra_part_1_invalid 警告がwarningsに出る', async () => {
  const initial = structuredClone(baseParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [
      { itemKey: 'extra_part_1_name', value: SLAB_NAME },
      { itemKey: 'extra_part_1_qty', value: '23.3m' }, // 単位付き＝数値として読めない
    ],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(slabRow(data), undefined, '不正値で行は作らない');
    assert.ok(findWarn(data, 'extra_part_1_invalid'),
      `警告が出る（warnings=${JSON.stringify(data.warnings)}）`);
  } finally {
    server.close();
  }
});

await testAsync('無関係なoverride（天井高）だけなら追加部位は増えない（回帰なし）', async () => {
  const initial = structuredClone(baseParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'ceiling_height', value: '2400mm' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(data.materials.some((m) => m.extra_part === true), false);
  } finally {
    server.close();
  }
});

console.log('■ POST /:id/calculate: overrides → 建物種別（building_type）');

// 【2026-07-25 goal(2)】新築/リノベの式切り替え（resolveBuildingTypeProfile）のoverride疎通。
//   配線は Override → overridesObj → calculateMaterials(overrides) の既存経路
//   （ceiling_pb_extra_sheets と同じ「新規パーサ不要」型・routes無変更）。UIから選べるように
//   したのに経路が切れていると新築物件で壁PBが-32%級の過少が黙って出るため、ここで固定する。
//
// 観測点: materials の「壁 石膏ボード」行（建材14項目スコープ内＝レスポンスに出る）。
//   期待値は観測値の写しではなく式から算出。基礎面積はvalidator仕様
//   「部屋合計が専有面積×0.96未満なら不足分を居室床に補填」（CLAUDE.md）により、
//   このfixture（部屋合計33㎡ < 65.76×0.96）では 65.76×0.96 = 63.1296㎡ になる。
//     リノベ既定 = ceil(ceil(63.1296×1.37) × 0.6) = ceil(87×0.6) = 53枚
//   新築側は周長の再構成（間仕切×2+躯体・実測帯下限での底上げ）が絡み手計算が式の写しになりやすいので
//   枚数は固定せず、(a) calculation欄が新築式（周長×天井高）へ切り替わる (b) リノベ既定と枚数が変わる
//   (c) ルート経由の出力 = 同じoverridesで calculateMaterials を直接叩いた出力（供給経路の等価性）で見る。
const btParsed = {
  ...structuredClone(baseParsed),
  total_area_source: 'user_input', // 床面積サニティの誤発火を避け、式の分母を安定させる（他のoverrideテストと同じ）
};
const wallPbRow = (data) => data.materials.find((m) => m.name === '壁 石膏ボード');
const BT_FLOOR = 65.76 * 0.96; // 補填後の基礎面積（部屋合計33㎡が0.96×専有を下回るfixtureのため）
const RENO_EXPECTED = Math.ceil(Math.ceil(BT_FLOOR * 1.37) * 0.6); // = 53枚（リノベ式から算出）
// 直接呼び: ルートと同じ引数形（parsedData文字列・packageSpecs={}・overridesObj）
const directWallPb = (overridesObj) => {
  const r = calculateMaterials(JSON.stringify(structuredClone(btParsed)), {}, overridesObj);
  return r.materials.find((m) => m.name === '壁 石膏ボード');
};

await testAsync('override未設定: リノベ式（後方互換）・building_type警告なし', async () => {
  const initial = structuredClone(btParsed);
  const { prisma } = makeCalcPrisma({ initialParsed: initial, freshParsed: structuredClone(initial) });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    const row = wallPbRow(data);
    assert.ok(row, '壁 石膏ボード行が出力される');
    assert.equal(row.quantity, RENO_EXPECTED, `リノベ式 ${RENO_EXPECTED}枚: ${row.calculation}`);
    assert.match(row.calculation, /リノベ係数/, `根拠欄はリノベ式: ${row.calculation}`);
    assert.equal(findWarn(data, 'building_type_invalid'), undefined, '未設定は警告なし');
  } finally {
    server.close();
  }
});

await testAsync("building_type='new': ルート経由で新築式に切り替わる（materialCalculatorまで届く）", async () => {
  const initial = structuredClone(btParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'building_type', value: 'new' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { status, data } = await postJson(port, '/api/projects/1/calculate');
    assert.equal(status, 200, JSON.stringify(data).slice(0, 200));
    const row = wallPbRow(data);
    assert.match(row.calculation, /新築: 周長/, `根拠欄が新築式へ切り替わる: ${row.calculation}`);
    assert.notEqual(row.quantity, RENO_EXPECTED, '枚数がリノベ式から実際に変わる');
    // 供給経路の等価性: ルート経由 = calculateMaterials直接呼び（route層が値を欠落・変形させない）
    const direct = directWallPb({ building_type: 'new' });
    assert.equal(row.quantity, direct.quantity, `ルート${row.quantity}枚 = 直接${direct.quantity}枚`);
    assert.equal(findWarn(data, 'building_type_invalid'), undefined, '正当値は警告なし');
  } finally {
    server.close();
  }
});

await testAsync("building_type='renovation'（明示）: 未設定と同一＝既定の明示指定", async () => {
  const initial = structuredClone(btParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'building_type', value: 'renovation' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    const row = wallPbRow(data);
    assert.equal(row.quantity, RENO_EXPECTED, '明示renovation = 未設定と同枚数');
    assert.match(row.calculation, /リノベ係数/);
    assert.equal(findWarn(data, 'building_type_invalid'), undefined);
  } finally {
    server.close();
  }
});

await testAsync("building_type='新築'（日本語エイリアス）: 'new'と同じく新築式", async () => {
  const initial = structuredClone(btParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'building_type', value: '新築' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    const row = wallPbRow(data);
    assert.match(row.calculation, /新築: 周長/, `日本語指定も新築式: ${row.calculation}`);
    const direct = directWallPb({ building_type: 'new' });
    assert.equal(row.quantity, direct.quantity, "'新築' と 'new' で同枚数");
  } finally {
    server.close();
  }
});

await testAsync('不正値: 既定リノベへフォールバックし building_type_invalid 警告が出る', async () => {
  const initial = structuredClone(btParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'building_type', value: 'マンション' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.ok(findWarn(data, 'building_type_invalid'),
      `不正値は採用せず警告（warnings=${JSON.stringify(data.warnings).slice(0, 300)}）`);
    const row = wallPbRow(data);
    assert.equal(row.quantity, RENO_EXPECTED, '既定リノベ式へフォールバック');
    assert.match(row.calculation, /リノベ係数/);
  } finally {
    server.close();
  }
});

await testAsync('無関係なoverride（天井高）だけならリノベ式のまま（回帰なし）', async () => {
  const initial = structuredClone(btParsed);
  const { prisma } = makeCalcPrisma({
    initialParsed: initial, freshParsed: structuredClone(initial),
    overrides: [{ itemKey: 'ceiling_height', value: '2400mm' }],
  });
  const { server, port } = await startApp(prisma);
  try {
    const { data } = await postJson(port, '/api/projects/1/calculate');
    assert.match(wallPbRow(data).calculation, /リノベ係数/, '無関係overrideで式は不変');
    assert.equal(findWarn(data, 'building_type_invalid'), undefined);
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
