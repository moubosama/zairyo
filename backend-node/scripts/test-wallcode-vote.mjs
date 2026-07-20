/**
 * 壁記号タイルの多数決読み（WALL_CODE_READS）の検証（2026-07-20）
 *
 * 背景: ブラウザ実測7回で壁PBが73〜108枚に振れる。インフラ起因（タイル失敗）は解消済みで、
 * 残るはGemini 2.5-flashの読み取り自体の回間ブレ（C04/L14/G24のplacementが出たり
 * 出なかったり・幻覚が混ざったり）。同じタイルを3回読み、部屋×記号×寸法クラスタ単位の
 * 過半数採用でならす。
 *
 * 実行: node scripts/test-wallcode-vote.mjs（AI呼び出しなし・DB不要）
 * 検証対象:
 *  - claudeApi.js voteWallCodeRuns: 幻覚1/3落選・正当2/3当選・対面2枚の件数多数決・
 *    寸法クラスタの最頻値・失敗run混在の分母調整・codesのみの残留・部屋名ゆれ統合・
 *    1run入力の従来互換・_tile非漏出
 *  - claudeApi.js mergeWallCodeRunStats: 全run全滅ベースの失敗統計合成
 *  - claudeApi.js wallCodeReadCount: WALL_CODE_READSの解釈（デフォルト3・1で従来・上限5）
 */
import assert from 'node:assert/strict';

// AIキーを外す（誤って実APIへ到達しないように。dotenvは読み込まない）
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;
delete process.env.GOOGLE_GEMINI_API_KEY;
delete process.env.WALL_CODE_READS;

const { voteWallCodeRuns, mergeWallCodeRunStats, wallCodeReadCount, aggregateWallCodeItems } =
  await import('../src/services/claudeApi.js');

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

/** タイル生アイテムの短縮記法 */
const it = (room, code, len, tile = 0) => ({ room, code, wall_length_mm: len, _tile: tile });
/** 失敗タイルなしのrun */
const run = (...items) => ({ items, failedTiles: [] });
/** 結果から部屋を取り出す */
const roomOf = (res, name) => res.find((r) => r.room === name);
/** placementsを code@len の文字列配列へ（比較しやすく） */
const plStr = (entry) => (entry?.placements || []).map((p) => `${p.code}@${p.wall_length_mm}`).sort();

// ---------------------------------------------------------------------------
console.log('■ voteWallCodeRuns: 過半数の採否（3run）');

test('幻覚1/3は落選・正当3/3は当選（全タイル成功）', () => {
  const res = voteWallCodeRuns([
    run(it('LDK', 'G14', 3000), it('LDK', 'C04', 2360)), // C04はこのrunだけ=幻覚疑い
    run(it('LDK', 'G14', 3000)),
    run(it('LDK', 'G14', 3010)), // ±100mm内の揺れは同一クラスタ
  ]);
  assert.deepEqual(plStr(roomOf(res, 'LDK')), ['G14@3000']);
  assert.deepEqual(roomOf(res, 'LDK').codes, ['G14'], 'C04はcodesにも残らない（1/3出現）');
});

test('正当2/3は当選（1runの読み漏れに負けない）', () => {
  const res = voteWallCodeRuns([
    run(it('洋室(2)', 'C04', 2360), it('洋室(2)', 'G14', 1500)),
    run(it('洋室(2)', 'C04', 2360), it('洋室(2)', 'G14', 1500)),
    run(it('洋室(2)', 'G14', 1500)), // このrunだけC04を読み漏れ
  ]);
  assert.deepEqual(plStr(roomOf(res, '洋室(2)')), ['C04@2360', 'G14@1500']);
});

test('1runのみ出現の幻覚部屋は部屋ごと出力されない', () => {
  const res = voteWallCodeRuns([
    run(it('LDK', 'G14', 3000), it('謎の部屋', 'I14', 2000)),
    run(it('LDK', 'G14', 3000)),
    run(it('LDK', 'G14', 3000)),
  ]);
  assert.equal(roomOf(res, '謎の部屋'), undefined);
  assert.equal(res.length, 1);
});

// ---------------------------------------------------------------------------
console.log('■ voteWallCodeRuns: 寸法クラスタの最頻値');

test('寸法はクラスタ内の最頻値（2360×1 vs 2410×2 → 2410）', () => {
  const res = voteWallCodeRuns([
    run(it('洋室(3)', 'C04', 2360)),
    run(it('洋室(3)', 'C04', 2410)),
    run(it('洋室(3)', 'C04', 2410)),
  ]);
  assert.deepEqual(plStr(roomOf(res, '洋室(3)')), ['C04@2410']);
});

test('寸法の最頻値が同数タイなら先勝ち（run順で先に出た値）', () => {
  const res = voteWallCodeRuns([
    run(it('洋室(3)', 'C04', 2360)),
    run(it('洋室(3)', 'C04', 2410)),
    run(), // 出現2/3=当選・寸法は1対1タイ → 先のrunの2360
  ]);
  assert.deepEqual(plStr(roomOf(res, '洋室(3)')), ['C04@2360']);
});

test('差>100mmは別クラスタ=別の壁として個別に投票（両方2/3で両方当選）', () => {
  const res = voteWallCodeRuns([
    run(it('洋室(1)', 'C04', 5190), it('洋室(1)', 'C04', 2575)),
    run(it('洋室(1)', 'C04', 5190), it('洋室(1)', 'C04', 2575)),
    run(it('洋室(1)', 'C04', 5190)), // 2575はこのrunで読み漏れ → それでも2/3
  ]);
  assert.deepEqual(plStr(roomOf(res, '洋室(1)')), ['C04@2575', 'C04@5190']);
});

// ---------------------------------------------------------------------------
console.log('■ voteWallCodeRuns: 対面2枚の件数多数決');

test('件数も多数決: run別2件・2件・1件 → 2件採用', () => {
  // 同一タイル内の同記号・完全等寸2件=対面2枚（aggregateWallCodeItemsの実在判定を経由）
  const res = voteWallCodeRuns([
    run(it('洋室(2)', 'C04', 2360, 2), it('洋室(2)', 'C04', 2360, 2)),
    run(it('洋室(2)', 'C04', 2360, 2), it('洋室(2)', 'C04', 2360, 2)),
    run(it('洋室(2)', 'C04', 2360, 2)),
  ]);
  assert.deepEqual(plStr(roomOf(res, '洋室(2)')), ['C04@2360', 'C04@2360']);
});

test('件数の多数決: run別1件・1件・2件 → 1件採用（1runだけの二重書き出しに引きずられない）', () => {
  const res = voteWallCodeRuns([
    run(it('洋室(2)', 'C04', 2360, 2)),
    run(it('洋室(2)', 'C04', 2360, 2)),
    run(it('洋室(2)', 'C04', 2360, 2), it('洋室(2)', 'C04', 2360, 2)),
  ]);
  assert.deepEqual(plStr(roomOf(res, '洋室(2)')), ['C04@2360']);
});

test('件数タイ（2件・1件の2run出現）は先勝ち=先のrunの件数', () => {
  const res = voteWallCodeRuns([
    run(it('洋室(2)', 'C04', 2360, 2), it('洋室(2)', 'C04', 2360, 2)),
    run(it('洋室(2)', 'C04', 2360, 2)),
    run(),
  ]);
  assert.deepEqual(plStr(roomOf(res, '洋室(2)')), ['C04@2360', 'C04@2360']);
});

// ---------------------------------------------------------------------------
console.log('■ voteWallCodeRuns: 失敗run混在（分母のタイル調整）');

test('タイル失敗runは反対票にしない: 2/2一致で採用（3run中1runがそのタイル全滅）', () => {
  const res = voteWallCodeRuns([
    { items: [it('トイレ', 'G24', 950, 0)], failedTiles: [] },
    { items: [it('トイレ', 'G24', 950, 0)], failedTiles: [] },
    { items: [], failedTiles: [0] }, // タイル0が全滅したrun
  ]);
  assert.deepEqual(plStr(roomOf(res, 'トイレ')), ['G24@950']);
});

test('有効2runの1/2は過半数不成立だが採用側に倒す（読めた事実を尊重）', () => {
  const res = voteWallCodeRuns([
    { items: [it('トイレ', 'G24', 950, 0)], failedTiles: [] },
    { items: [], failedTiles: [] },      // タイル0は読めたが記号なし → 反対票
    { items: [], failedTiles: [0] },     // タイル0全滅 → 分母から除外
  ]);
  // 分母=2（run1,run2）・出現1 ≥ ceil(2/2)=1 → 採用
  assert.deepEqual(plStr(roomOf(res, 'トイレ')), ['G24@950']);
});

test('全タイル成功の1/3は同条件でも落選（分母調整は失敗タイル限定）', () => {
  const res = voteWallCodeRuns([
    { items: [it('トイレ', 'G24', 950, 0)], failedTiles: [] },
    { items: [], failedTiles: [] },
    { items: [], failedTiles: [] },
  ]);
  assert.equal(roomOf(res, 'トイレ'), undefined);
});

// ---------------------------------------------------------------------------
console.log('■ voteWallCodeRuns: codesのみ（寸法null）の扱い');

test('codesのみ2/3出現 → codesに残す（寸法nullのplacement1件）', () => {
  const res = voteWallCodeRuns([
    run(it('B室', 'D14', null, 0)),
    run(it('B室', 'D14', null, 0)),
    run(),
  ]);
  const e = roomOf(res, 'B室');
  assert.deepEqual(e.codes, ['D14']);
  assert.deepEqual(e.placements, [{ code: 'D14', wall_length_mm: null }]);
});

test('codesのみ1/3出現 → 落選', () => {
  const res = voteWallCodeRuns([
    run(it('B室', 'D14', null, 0), it('B室', 'G14', 2000, 0)),
    run(it('B室', 'G14', 2000, 0)),
    run(it('B室', 'G14', 2000, 0)),
  ]);
  assert.deepEqual(roomOf(res, 'B室').codes, ['G14']);
});

test('寸法付きが採用された記号のnullは破棄（従来ルールのrun横断版）', () => {
  const res = voteWallCodeRuns([
    run(it('A室', 'C04', null, 0)),
    run(it('A室', 'C04', 2500, 1)),
    run(it('A室', 'C04', 2500, 1)),
  ]);
  assert.deepEqual(plStr(roomOf(res, 'A室')), ['C04@2500'], 'nullは追加されない');
});

test('寸法が回ごとにバラバラ（どのクラスタも1/3）でも出現2/3ならcodesのみへ降格', () => {
  const res = voteWallCodeRuns([
    run(it('LDK', 'C04', 2000, 0)),
    run(it('LDK', 'C04', 5000, 0)), // 寸法不一致=ノイズ・記号の存在は2/3
    run(),
  ]);
  const e = roomOf(res, 'LDK');
  assert.deepEqual(e.codes, ['C04']);
  assert.deepEqual(e.placements, [{ code: 'C04', wall_length_mm: null }],
    '確証のない寸法は捨てて記号だけ残す');
});

// ---------------------------------------------------------------------------
console.log('■ voteWallCodeRuns: 部屋名ゆれ・互換・_tile非漏出');

test('run間の部屋名ゆれ（全角括弧）は同一部屋に束ね、最頻の生表記を代表にする', () => {
  const res = voteWallCodeRuns([
    run(it('洋室（１）', 'C04', 5190)),
    run(it('洋室(1)', 'C04', 5190)),
    run(it('洋室(1)', 'C04', 5190)),
  ]);
  assert.equal(res.length, 1);
  assert.equal(res[0].room, '洋室(1)', '最頻表記（2/3）が代表');
  assert.deepEqual(plStr(res[0]), ['C04@5190']);
});

test('1run入力は従来のaggregateWallCodeItemsと同一結果（WALL_CODE_READS=1互換・_tile差なし）', () => {
  const items = [
    it('トイレ', 'G24', 950, 0), it('トイレ', 'G24', 965, 1), // タイル重なりの二重検出→1件
    it('洋室(2)', 'C04', 2360, 2), it('洋室(2)', 'C04', 2360, 2), // 対面2枚→2件
    it('B室', 'D14', null, 0),
  ];
  assert.deepEqual(voteWallCodeRuns([run(...items)]), aggregateWallCodeItems(items));
});

test('出力placementsに_tileが漏れない（保存データ汚染の防止）', () => {
  const res = voteWallCodeRuns([
    run(it('LDK', 'G14', 3000, 1), it('B室', 'D14', null, 0)),
    run(it('LDK', 'G14', 3000, 1), it('B室', 'D14', null, 0)),
    run(it('LDK', 'G14', 3000, 1)),
  ]);
  for (const e of res) {
    for (const p of e.placements) {
      assert.ok(!('_tile' in p), `_tileが漏れている: ${JSON.stringify(p)}`);
    }
  }
});

test('runなし → 空配列（防御）', () => {
  assert.deepEqual(voteWallCodeRuns([]), []);
});

// ---------------------------------------------------------------------------
console.log('■ mergeWallCodeRunStats: 全run全滅ベースの統計合成');

test('全runで失敗したタイルだけfailedTilesに数える（理由は最後のrunを代表に）', () => {
  const merged = mergeWallCodeRunStats([
    { failedReasons: [{ tile: 2, kind: 'rate_limit', detail: 'a' }], repairedTiles: 0, totalTiles: 6 },
    { failedReasons: [{ tile: 2, kind: 'server', detail: 'b' }, { tile: 5, kind: 'parse', detail: 'c' }], repairedTiles: 0, totalTiles: 6 },
    { failedReasons: [{ tile: 2, kind: 'rate_limit', detail: 'd' }], repairedTiles: 0, totalTiles: 6 },
  ]);
  assert.equal(merged.failedTiles, 1, 'タイル5は1runでは読めている=全滅ではない');
  assert.deepEqual(merged.failedReasons, [{ tile: 2, kind: 'rate_limit', detail: 'd' }]);
  assert.equal(merged.totalTiles, 6);
});

test('全run成功 → failedTiles=0・failedReasons=[]', () => {
  const merged = mergeWallCodeRunStats([
    { failedReasons: [], repairedTiles: 0, totalTiles: 6 },
    { failedReasons: [], repairedTiles: 0, totalTiles: 6 },
    { failedReasons: [], repairedTiles: 0, totalTiles: 6 },
  ]);
  assert.equal(merged.failedTiles, 0);
  assert.deepEqual(merged.failedReasons, []);
});

test('repairedTilesはmin（1runでも救済なしで読めていれば多数決が欠落を補う=警告不要）', () => {
  const merged = mergeWallCodeRunStats([
    { failedReasons: [], repairedTiles: 1, totalTiles: 6 },
    { failedReasons: [], repairedTiles: 0, totalTiles: 6 },
    { failedReasons: [], repairedTiles: 2, totalTiles: 6 },
  ]);
  assert.equal(merged.repairedTiles, 0);
  const allRepaired = mergeWallCodeRunStats([
    { failedReasons: [], repairedTiles: 2, totalTiles: 6 },
    { failedReasons: [], repairedTiles: 1, totalTiles: 6 },
    { failedReasons: [], repairedTiles: 1, totalTiles: 6 },
  ]);
  assert.equal(allRepaired.repairedTiles, 1, '全runが救済を要した場合のみ計上');
});

// ---------------------------------------------------------------------------
console.log('■ wallCodeReadCount: WALL_CODE_READSの解釈');

test('未設定 → デフォルト3', () => {
  delete process.env.WALL_CODE_READS;
  assert.equal(wallCodeReadCount(), 3);
});

test('1 → 従来の1回読み / 5 → 5回', () => {
  process.env.WALL_CODE_READS = '1';
  assert.equal(wallCodeReadCount(), 1);
  process.env.WALL_CODE_READS = '5';
  assert.equal(wallCodeReadCount(), 5);
});

test('不正値（0・負・非数）→ デフォルト3 / 過大（9）→ 上限5', () => {
  process.env.WALL_CODE_READS = '0';
  assert.equal(wallCodeReadCount(), 3);
  process.env.WALL_CODE_READS = '-2';
  assert.equal(wallCodeReadCount(), 3);
  process.env.WALL_CODE_READS = 'abc';
  assert.equal(wallCodeReadCount(), 3);
  process.env.WALL_CODE_READS = '9';
  assert.equal(wallCodeReadCount(), 5);
  delete process.env.WALL_CODE_READS;
});

// ---------------------------------------------------------------------------
console.log('');
console.log(`結果: ✅${pass} / ✗${fail}`);
process.exit(fail > 0 ? 1 : 0);
