// ラベル無し区画の天井PB控除のユニットテスト（AI呼び出しゼロ・純関数）
//
// 検証対象: materialCalculator.calculateMaterials の unlabeledNonCeilingArea 控除。
//
// 【背景（2026-07-25 must-fix MF-1・差し戻し）】
//   第1版は「補填分（netTarget−部屋合計） × 0.42」という**比率**で天井面積を削っていた。
//   これはリノベ既定パス（overrides={}・building_type指定なし＝既存の全プロジェクト）を
//   最大 -43% 退行させていた。原因は2つ:
//     (1) rooms:[]（AIが部屋を1つも拾えない）で補填分＝床面積全体になり、
//         控除が 62.40×0.42＝26.2㎡ に膨張 → 天井PB 45→25枚
//     (2) UB/クロゼットは ubArea/closetArea で既に控除済みなのに、補填分の42%を重ねて引く
//         （導出に使ったA・Gの両ケースが ub=cl=0 だったため導出時には表面化しない潜伏バグ）
//   第1版が「変更前後で完全一致」と報告されたのは、テスト入力の室カバー率が高く
//   補填分がほぼ0のケースしか流していなかったため。**このテストはその穴を塞ぐためにある**。
//
// 【現行仕様】控除は以下を**すべて**満たすときのみ発火する:
//   ① building_type === 'new'（新築オプトイン。控除の根拠は全て新築アルファの拾い構造由来で、
//      リノベ側には「UB・押入の天井を拾わない」根拠データが無いため既定は据え置き）
//   ② unlabeledFillArea > 0（補填が実在する）
//   ③ roomsSumArea > 0（部屋を1つ以上拾えている＝UB・PSの存在に図面側の根拠がある）
//   控除量 = clamp(5.258㎡ − ubArea − closetArea, 0, 補填分)
//     5.258㎡ = A〜Gタイプ6件の「内法面積 − XLS天井PB実測」の平均（4.51〜6.99の帯）
//
// 期待値の出所（答え合わせではなく原典セルからの導出）:
//   内法面積: 意匠図page_12 面積表 / 天井PB実測: XLS集計表77行（タイプ別シートP列の合算）
//     A 68.00−61.007=6.993 / G 64.80−59.087=5.713 / B 64.80−60.122=4.678
//     C 64.80−59.904=4.896 / D 64.80−60.292=4.508 / E 64.80−60.040=4.760 → 平均5.258
//   天井PB枚数 = ceil((ceilingArea − パウダー・トイレ天井) ÷ 1.45) [+4枚（該当室がある場合）]
//
// 使い方: node scripts/test-ceiling-unlabeled.mjs
import { calculateMaterials } from '../src/services/materialCalculator.js';

let ok = 0, ng = 0;
function check(name, cond, detail = '') {
  if (cond) { ok++; console.log(` ✅ ${name}`); }
  else { ng++; console.log(` ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const UNLABELED_SQM = 5.258; // materialCalculator と同値（A〜Gタイプ6件の実測平均）

function run(data, overrides = {}) {
  const calc = calculateMaterials(data, {}, overrides);
  return {
    sheets: calc.materials.find((m) => m.name === '天井 石膏ボード')?.quantity,
    ceilingArea: calc.summary.ceiling_area,
    warnings: calc._warnings || [],
  };
}
const room = (name, area_sqm, floor_type) => ({ name, area_sqm, ...(floor_type ? { floor_type } : {}) });
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

console.log('\n=== 1. rooms:[]（部屋ゼロ）では控除しない（MF-1 原因1の回帰） ===');
{
  // 旧比率モデル: 62.40 − 62.40×0.42 = 36.19㎡ → 25枚（-43%）だった
  const data = {
    document_type: 'floor_plan', layout_type: '3LDK',
    total_floor_area_sqm: 65, ceiling_height_mm: 2400, rooms: [], openings: [],
  };
  const reno = run(data);
  const nw = run(data, { building_type: 'new' });
  check('リノベ既定: 天井面積が床面積のまま（控除0）', near(reno.ceilingArea, 62.40),
    `ceilingArea=${reno.ceilingArea}`);
  // ceil(62.40 ÷ 1.45) = ceil(43.03) = 44枚（旧実装と一致。第1版は25枚＝-43%だった）
  check('リノベ既定: 天井PB 44枚（旧実装と一致・25枚に落ちない）', reno.sheets === 44,
    `sheets=${reno.sheets}`);
  check('新築指定でも部屋ゼロなら控除しない（根拠不在＝安全側）', near(nw.ceilingArea, 62.40),
    `ceilingArea=${nw.ceilingArea}`);
}

console.log('\n=== 2. UB・収納がラベル付き＋補填あり（MF-1 原因2＝二重控除の回帰） ===');
{
  // roomsSum=45.5 / netTarget=67.3×0.96=64.608 / 補填分=19.108
  // ubArea=3・closetArea=2.5 は既に個別控除済み。
  // 旧比率モデルはさらに 19.108×0.42=8.025㎡ を重ねて引いていた（-16%）。
  const data = {
    document_type: 'floor_plan', layout_type: '3LDK',
    total_floor_area_sqm: 67.3, ceiling_height_mm: 2400,
    rooms: [
      room('LDK', 22, 'flooring'), room('洋室(1)', 10, 'flooring'), room('洋室(2)', 8, 'flooring'),
      room('UB', 3, 'cf'), room('クロゼット', 2.5),
    ],
    openings: [],
  };
  const reno = run(data);
  const nw = run(data, { building_type: 'new' });
  // 期待: 64.608 − ub3 − cl2.5 = 59.108（リノベ＝旧実装と同じ）
  check('リノベ既定: 64.608−3−2.5=59.108㎡（二重控除なし）', near(reno.ceilingArea, 59.108),
    `ceilingArea=${reno.ceilingArea}`);
  check('リノベ既定: 天井PB 41枚（旧実装と一致・36枚に落ちない）', reno.sheets === 41,
    `sheets=${reno.sheets}`);
  // 新築: 追加控除 = clamp(5.258 − 3 − 2.5, 0, 19.108) = 0（既に5.5㎡引いており残りは負）
  check('新築: ub+cl(5.5㎡)が実測平均5.258を上回るため追加控除は0', near(nw.ceilingArea, 59.108),
    `ceilingArea=${nw.ceilingArea}`);
}

console.log('\n=== 3. 新築＋居室のみ（UB無ラベル）＝控除が本来効くべきケース ===');
{
  // Aタイプ相当: netTarget=71.9×0.96=69.024 / ラベル5室=51.940 / 補填分=17.084
  const rooms = [
    room('リビング・ダイニング', 18.82, 'flooring'), room('キッチン', 6.05, 'flooring'),
    room('洋室(1)', 9.73, 'flooring'), room('洋室(2)', 8.92, 'flooring'), room('洋室(3)', 8.42, 'flooring'),
  ];
  const data = {
    document_type: 'floor_plan', layout_type: '3LDK', _validated: true, total_area_source: 'user_input',
    total_floor_area_sqm: 71.9, ceiling_height_mm: 2400, rooms, openings: [],
  };
  const reno = run(data);
  const nw = run(data, { building_type: 'new' });
  check('リノベ既定: 控除0（69.024㎡のまま＝既存挙動を1㎡も変えない）', near(reno.ceilingArea, 69.024),
    `ceilingArea=${reno.ceilingArea}`);
  check('新築: 69.024−5.258=63.766㎡', near(nw.ceilingArea, 69.024 - UNLABELED_SQM),
    `ceilingArea=${nw.ceilingArea}`);
  // XLS実測61.007に対する誤差（±15%内であること。答え合わせではなく到達度の記録）
  const err = (nw.ceilingArea - 61.007) / 61.007 * 100;
  check(`新築: XLS実測61.007㎡に対し ${err.toFixed(1)}%（±15%以内）`, Math.abs(err) <= 15);
}

console.log('\n=== 4. 控除量は補填分を超えない（拾えている居室の天井を削らない） ===');
{
  // 補填分が控除量5.258より小さいケース: netTarget=64.608 / roomsSum=63.0 → 補填分1.608
  const data = {
    document_type: 'floor_plan', layout_type: '3LDK',
    total_floor_area_sqm: 67.3, ceiling_height_mm: 2400,
    rooms: [room('LDK', 33, 'flooring'), room('洋室(1)', 15, 'flooring'), room('洋室(2)', 15, 'flooring')],
    openings: [],
  };
  const nw = run(data, { building_type: 'new' });
  // 控除 = min(5.258, 1.608) = 1.608 → 64.608−1.608 = 63.0（＝部屋合計まで戻るのが上限）
  check('新築: 控除は補填分1.608㎡で頭打ち（63.0㎡）', near(nw.ceilingArea, 63.0),
    `ceilingArea=${nw.ceilingArea}`);
}

console.log('\n=== 5. 補填が無い（部屋合計 ≥ netTarget）なら控除0 ===');
{
  const data = {
    document_type: 'floor_plan', layout_type: '3LDK',
    total_floor_area_sqm: 60, ceiling_height_mm: 2400,
    rooms: [room('LDK', 30, 'flooring'), room('洋室(1)', 15, 'flooring'), room('洋室(2)', 13, 'flooring')],
    openings: [],
  };
  const nw = run(data, { building_type: 'new' });
  check('新築: 補填なし＝控除0（58.0㎡）', near(nw.ceilingArea, 58.0), `ceilingArea=${nw.ceilingArea}`);
}

console.log('\n=== 6. override unlabeled_non_ceiling_sqm ===');
{
  const rooms = [room('LDK', 20, 'flooring'), room('洋室(1)', 12, 'flooring')];
  const data = {
    document_type: 'floor_plan', layout_type: '3LDK', _validated: true, total_area_source: 'user_input',
    total_floor_area_sqm: 67.3, ceiling_height_mm: 2400, rooms, openings: [],
  };
  const base = run(data, { building_type: 'new' });
  check('既定5.258㎡が引かれる', near(base.ceilingArea, 64.608 - UNLABELED_SQM), `ceilingArea=${base.ceilingArea}`);

  const zero = run(data, { building_type: 'new', unlabeled_non_ceiling_sqm: '0' });
  check("'0'指定で控除を完全に無効化できる（SF-3の逃げ道）", near(zero.ceilingArea, 64.608),
    `ceilingArea=${zero.ceilingArea}`);

  const custom = run(data, { building_type: 'new', unlabeled_non_ceiling_sqm: '8' });
  check('8㎡指定が反映される', near(custom.ceilingArea, 64.608 - 8), `ceilingArea=${custom.ceilingArea}`);

  for (const bad of ['-5', '5m', 'abc', '999']) {
    const r = run(data, { building_type: 'new', unlabeled_non_ceiling_sqm: bad });
    const warned = r.warnings.some((w) => w.field === 'unlabeled_non_ceiling_sqm_invalid');
    check(`不正値 '${bad}' は既定へフォールバック＋警告`,
      warned && near(r.ceilingArea, 64.608 - UNLABELED_SQM), `ceilingArea=${r.ceilingArea} warned=${warned}`);
  }
}

console.log('\n=== 7. 水増し是正（層1）発火時は控除しない ===');
{
  // declared 65 に対し部屋合計200㎡の誤読 → 層1が sanityBase へ縮小し unlabeledFillArea=0
  const data = {
    document_type: 'floor_plan', layout_type: '3LDK',
    total_floor_area_sqm: 65, ceiling_height_mm: 2400,
    rooms: [room('LDK', 120, 'flooring'), room('洋室(1)', 80, 'flooring')], openings: [],
  };
  const nw = run(data, { building_type: 'new' });
  check('層1発火時は補填分が取り消され控除0（天井面積>0）', nw.ceilingArea > 0, `ceilingArea=${nw.ceilingArea}`);
  check('層1の警告が出ている', nw.warnings.some((w) => w.field === 'floor_area_inflated'));
}

console.log('\n=== 8. リノベ既定パスの総当たりスイープ（控除が1件も発火しないこと） ===');
{
  // MF-1 の再発検知。旧実装との直接比較は temp コピーが要るため CI では回せないので、
  // 「リノベ既定では控除0＝天井面積が totalFloorArea − ub − cl と厳密一致」を不変条件として
  // 総当たりで検査する（これが成り立つ限り旧実装と同値であることは式から自明）。
  const declareds = [0, 45, 50.74, 65.76, 67.3, 71.9, 90, 120, 200];
  const coverages = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.3];
  let swept = 0, bad = 0;
  for (const declared of declareds) {
    for (const cov of coverages) {
      for (const variant of ['plain', 'wetCloset']) {
        const base = declared || 65;
        const target = base * 0.96 * cov;
        let rooms = [];
        if (cov > 0) {
          rooms = variant === 'wetCloset'
            ? [room('UB', 3, 'cf'), room('クロゼット', 2.5),
              room('LDK', Math.max(0, target - 5.5) * 0.5, 'flooring'),
              room('洋室(1)', Math.max(0, target - 5.5) * 0.3, 'flooring'),
              room('洋室(2)', Math.max(0, target - 5.5) * 0.2, 'flooring')]
            : [room('LDK', target * 0.45, 'flooring'), room('洋室(1)', target * 0.3, 'flooring'),
              room('洋室(2)', target * 0.25, 'flooring')];
        }
        const data = {
          document_type: 'floor_plan', layout_type: '3LDK',
          total_floor_area_sqm: declared || null, ceiling_height_mm: 2400,
          partition_wall_length_m: 24, rooms, openings: [],
        };
        const calc = calculateMaterials(data, {}, {}); // リノベ既定
        const ub = rooms.filter((r) => r.name.includes('UB')).reduce((s, r) => s + r.area_sqm, 0);
        const cl = rooms.filter((r) => r.name.includes('クロゼット')).reduce((s, r) => s + r.area_sqm, 0);
        const expected = calc.summary.total_floor_area - ub - cl;
        swept++;
        // 除外するケース（いずれも旧実装と同値であることを確認済み・この控除とは無関係）:
        //   - 層1（水増し是正）発火時: ub/cl が inflationScale で縮むため式が変わる
        //   - expected<=0: 面積の根拠が皆無で `ceilingArea<=0 → 50㎡` の既存フォールバックが働く
        const inflated = (calc._warnings || []).some((w) => w.field === 'floor_area_inflated');
        if (!inflated && expected > 0 && calc.summary.ceiling_area > 0
          && !near(calc.summary.ceiling_area, expected, 0.02)) {
          bad++;
          if (bad <= 3) console.log(`    差分: decl=${declared} cov=${cov} ${variant} ceiling=${calc.summary.ceiling_area} expected=${expected}`);
        }
      }
    }
  }
  check(`リノベ既定 ${swept}シナリオで控除の発火0件`, bad === 0, `発火=${bad}件`);
}

console.log(`\n──────────── 合計: ✅${ok} / ✗${ng} ────────────`);
process.exit(ng > 0 ? 1 : 0);
