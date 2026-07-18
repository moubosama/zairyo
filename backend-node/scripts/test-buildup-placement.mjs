/**
 * 記号割付・タイル集約・収納控除・巾木マッチャのユニット検証
 * （2026-07-18 コードレビューで確定した精度バグ4件の再現ケース）
 *
 * 対象:
 *   修正1: buildupCalculator.js placementByFace
 *     1a 面のwall_codeと同一記号のplacement消費（等幅面への二重除外の防止）
 *     1b タイ（寸法差同点=等幅対面）の開口シグナルによる解決（C04が誤った側に付く問題）
 *   修正2: claudeApi.js aggregateWallCodeItems
 *     タイル重なりの二重検出と「同一タイル内に実在する等寸の対面2枚」の区別
 *   修正3: buildupCalculator.js 収納推定のD6*控除
 *     展開図実測済み（skip済み）収納のD6*が、展開図に無い収納の推定を消す問題
 *   修正4: applyElevationTakeoff 木製巾木マッチャ
 *     '木製巾木出隅役物'（単位ヶ所）への誤マッチによる上書きの防止
 *
 * 実行: node scripts/test-buildup-placement.mjs
 */
import { computeElevationTakeoff, applyElevationTakeoff } from '../src/services/buildupCalculator.js';
import { aggregateWallCodeItems } from '../src/services/claudeApi.js';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`✗ ${label}\n    expected: ${e}\n    actual:   ${a}`); }
}

// ============ 修正1a: 実測面と同一記号のplacementは消費済みにする ============
console.log('--- 修正1a: 二重除外の防止（wall_code実測済み面とplacementの消費） ---');
{
  // A面はC04実測済み（展開図の面記号）。plan_placementsにも同じC04@2000が残っている。
  // 旧実装: placementが未消費のまま等幅の無記号C面へ割り付き、C面までC04扱い
  //   → wall_pb = (B+D) 2.0×2.44 = 4.88（過少）
  // 修正後: placementはA面に消費され、C面はデフォルトG14
  //   → wall_pb = (B+C+D) 4.0×2.44 = 9.76（レビュー再現の正解値）
  const elevations = { rooms: [
    { name: '洋室(X)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2000, wall_code: 'C04', openings: [] },
      { face: 'B', width_mm: 1000, openings: [] },
      { face: 'C', width_mm: 2000, openings: [] },
      { face: 'D', width_mm: 1000, openings: [] },
    ], plan_placements: [{ code: 'C04', wall_length_mm: 2000 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('C04実測済み面のplacementは消費され等幅C面を二重除外しない（壁PB 9.76）',
    t.wall_pb_sqm, 9.76);
}
{
  // 実在する第2のC04壁は消費されず割り付く: A面C04実測@2000 + 別寸のC04@3000
  // → 3000は無記号B面(3000)へ割付（第2の壁として除外）。wall_pb = C+D = 3.0×2.44 = 7.32
  const elevations = { rooms: [
    { name: '洋室(Y)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2000, wall_code: 'C04', openings: [] },
      { face: 'B', width_mm: 3000, openings: [] },
      { face: 'C', width_mm: 2000, openings: [] },
      { face: 'D', width_mm: 1000, openings: [] },
    ], plan_placements: [
      { code: 'C04', wall_length_mm: 2000 },
      { code: 'C04', wall_length_mm: 3000 },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('別寸のC04は実在の第2の壁として割付が残る（壁PB 7.32）', t.wall_pb_sqm, 7.32);
}

// ============ 修正1b: タイ（等幅対面）の開口シグナル解決 ============
console.log('--- 修正1b: 等幅対面のタイ解決（開口の物理制約） ---');
{
  // 等幅3540の対面: A面=片開き戸あり / C面=窓あり。C04はどちらか。
  // 物理制約: RC打放にドアは切れない・窓はRC外周壁側 → C04はC面（窓側）。
  // 旧実装は面index順でC04→A面 → 壁PB = C面net = 8.6376−4.54 = 4.10（誤り・
  //   逆パターンでは開口面積分ちょうど過大になるのがレビュー再現 +1.60㎡）
  // 修正後: C04→C面 → 壁PB = A面net = 3.54×2.44 − 0.8×2.175 = 6.90
  const elevations = { rooms: [
    { name: 'テスト室', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3540, openings: [{ type: '片開き戸', width_mm: 800, height_mm: 2175 }] },
      { face: 'C', width_mm: 3540, openings: [{ type: '窓', width_mm: 2270, height_mm: 2000 }] },
    ], plan_placements: [{ code: 'C04', wall_length_mm: 3540 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('タイはドア面でなく窓面へC04を割付（壁PB 6.90=ドア面のnet）', t.wall_pb_sqm, 6.9);
}
{
  // シグナル矛盾面（窓+ドア同居）は加点相殺で中立: 開口の誤帰属（読取ノイズ）の疑いが
  // 強いため、どちらか一方に賭けず従来のindex順に委ねる（実例: Gemini記録 洋室(1)A面の
  // 幻ドア。ドア優先を単独適用すると壁PBが-8%→-11%に悪化した）
  const elevations = { rooms: [
    { name: 'テスト室X', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3000, openings: [
        { type: '片開き戸', width_mm: 800, height_mm: 2000 },
        { type: '窓', width_mm: 1200, height_mm: 1100 },
      ] },
      { face: 'C', width_mm: 3000, openings: [] },
    ], plan_placements: [{ code: 'C04', wall_length_mm: 3000 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  // rank A = +1(ドア)−1(窓) = 0, C = 0 → index順でC04→A → 壁PB = C面 3.0×2.44 = 7.32
  check('窓+ドア同居の矛盾面は中立（index順維持・壁PB 7.32）', t.wall_pb_sqm, 7.32);
}
{
  // 窓判定は建具符号にも対応（tieRankの依存強化）: AWD-108の4枚引違いを「引違い戸」と
  // 転記されてもtype依存で誤ってドア(+1)扱いにせず、窓(-1)としてC04を引き寄せる
  const elevations = { rooms: [
    { name: 'テスト室W', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3000,
        openings: [{ type: '引違い戸', symbol: 'AWD-108', width_mm: 2000, height_mm: 2000 }] },
      { face: 'C', width_mm: 3000, openings: [] },
    ], plan_placements: [{ code: 'C04', wall_length_mm: 3000 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  // symbol AWD-108 → 窓 → rank A=-1 → C04→A面 → 壁PB = C面 3.0×2.44 = 7.32
  // （typeだけ見てドア扱いだと rank A=+1 → C04→C面 → 壁PB = A面net 3.32 に誤る）
  check('AWD符号は「引違い戸」転記でも窓としてC04を引き寄せる（壁PB 7.32）', t.wall_pb_sqm, 7.32);
}
{
  // 残タイ（両面とも無開口）は面積が同値のため結果に影響しない（決定的にindex順）
  const elevations = { rooms: [
    { name: 'テスト室2', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2500, openings: [] },
      { face: 'C', width_mm: 2500, openings: [] },
    ], plan_placements: [{ code: 'C04', wall_length_mm: 2500 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('無開口同士の残タイはどちらでも面積同値（壁PB 6.1=片面分）', t.wall_pb_sqm, 6.1);
}

// ============ 修正2: aggregateWallCodeItems（タイル重複 vs 実在の対面2枚） ============
console.log('--- 修正2: タイル集約（重複統合と対面2枚の区別） ---');
const pls = (res, room) => (res.find((r) => r.room === room) || {}).placements;
{
  // 隣接タイルの重なりで同じ壁が2回読まれた（実例: トイレG24@950と@965）→ 1件に統合
  const res = aggregateWallCodeItems([
    { room: 'トイレ', code: 'G24', wall_length_mm: 950, _tile: 0 },
    { room: 'トイレ', code: 'G24', wall_length_mm: 965, _tile: 1 },
  ]);
  check('別タイルからの同記号・寸法差≤100mmは重複統合（1件・先勝ち950）',
    pls(res, 'トイレ'), [{ code: 'G24', wall_length_mm: 950 }]);
}
{
  // 同一タイル内の同記号・同寸2件 = 矩形部屋の等幅対面2枚（実在）→ 2件保持
  // 旧実装はキー`${code}|${len}`で1件に潰していた（確定バグ）
  const res = aggregateWallCodeItems([
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
  ]);
  check('同一タイル内の等寸2件は実在の対面2枚として保持',
    pls(res, '洋室(2)'), [
      { code: 'C04', wall_length_mm: 2360 },
      { code: 'C04', wall_length_mm: 2360 },
    ]);
}
{
  // 対面2枚のうち片方が隣接タイルにも重複して写った（同タイル2件+別タイル1件）→ 2件
  const res = aggregateWallCodeItems([
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2400, _tile: 3 },
  ]);
  check('対面2枚+重なり重複1件 → タイル内最大件数の2件', (pls(res, '洋室(2)') || []).length, 2);
}
{
  // 同一タイルで3件以上の反復書き出し → 上限2（対面想定のキャップ）
  const res = aggregateWallCodeItems([
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
  ]);
  check('同一タイル3件はMAX_SAME_WALL=2でキャップ', (pls(res, '洋室(2)') || []).length, 2);
}
{
  // 同一タイル内でも寸法が僅差で異なる2件（同じ楕円の再転記ノイズ疑い）は1件扱い。
  // 実在の等幅対面2枚なら寸法ラベルは同一値が2回書かれる → 複数計上は寸法完全一致に限定
  const res = aggregateWallCodeItems([
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2410, _tile: 2 },
  ]);
  check('同一タイル内の僅差2件（2360/2410）は再転記ノイズとして1件',
    pls(res, '洋室(2)'), [{ code: 'C04', wall_length_mm: 2360 }]);
}
{
  // 僅差ノイズ+完全一致ペアの混在: @2360×2（実在対面）+@2410×1（ノイズ）→ 2件
  const res = aggregateWallCodeItems([
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2410, _tile: 2 },
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360, _tile: 2 },
  ]);
  check('完全一致ペア+僅差ノイズの混在は2件（一致分のみ計上）',
    (pls(res, '洋室(2)') || []).length, 2);
}
{
  // 別寸（差>100mm）は別クラスタ=別の壁（洋室(1)のC04@5190とC04@2575）
  const res = aggregateWallCodeItems([
    { room: '洋室(1)', code: 'C04', wall_length_mm: 5190, _tile: 1 },
    { room: '洋室(1)', code: 'C04', wall_length_mm: 2575, _tile: 1 },
  ]);
  check('寸法差>100mmは別の壁として両方保持', pls(res, '洋室(1)'), [
    { code: 'C04', wall_length_mm: 5190 },
    { code: 'C04', wall_length_mm: 2575 },
  ]);
}
{
  // 寸法nullは同記号で寸法ありがあれば捨てる / 全てnullなら1件だけ残す（従来挙動維持）
  const res = aggregateWallCodeItems([
    { room: 'A室', code: 'C04', wall_length_mm: null, _tile: 0 },
    { room: 'A室', code: 'C04', wall_length_mm: 2500, _tile: 1 },
    { room: 'B室', code: 'D14', _tile: 0 },
    { room: 'B室', code: 'D14', _tile: 1 },
  ]);
  check('寸法nullは寸法あり優先で捨てる', pls(res, 'A室'), [{ code: 'C04', wall_length_mm: 2500 }]);
  check('全nullは記号ごと1件', pls(res, 'B室'), [{ code: 'D14', wall_length_mm: null }]);
}
{
  // _tileが無い旧データは各々別タイル扱い → 従来どおり1件に統合（安全側=過大除外しない）
  const res = aggregateWallCodeItems([
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360 },
    { room: '洋室(2)', code: 'C04', wall_length_mm: 2360 },
  ]);
  check('_tileなしの等寸2件は従来どおり1件（旧経路の互換）', (pls(res, '洋室(2)') || []).length, 1);
}
{
  // 不正記号・部屋なしはフィルタ（従来挙動維持）
  const res = aggregateWallCodeItems([
    { room: '洋室(2)', code: 'X1', wall_length_mm: 2360, _tile: 0 },
    { code: 'C04', wall_length_mm: 2360, _tile: 0 },
    { room: '洋室(2)', code: 'c04', wall_length_mm: 2360, _tile: 0 },
  ]);
  check('不正記号/部屋なしは除外・小文字は正規化', res, [
    { room: '洋室(2)', codes: ['C04'], placements: [{ code: 'C04', wall_length_mm: 2360 }] },
  ]);
}

// ============ 修正3: 収納推定のD6*控除の部屋対応 ============
console.log('--- 修正3: 収納推定のD6*控除（実測済み収納が別収納の推定を消さない） ---');
{
  // クロゼット(1)は展開図に実測あり（skip済み・D64面2000mm）。物入は平面図のみ。
  // 旧実装: 戸全体アキュムレータでD64の2.0mが物入の推定4.157mから引かれ半減以下
  //   → majikiri = (4.157−2.0)×2.77÷2 = 2.99（物入分の計上漏れ）
  // 修正後: 平面図の部屋名と一致する展開図収納のD64は控除プール外
  //   → majikiri = 4.157×2.77÷2 = 5.76
  const elevations = { rooms: [
    { name: 'クロゼット(1)', ceiling_height_mm: 2345, faces: [
      { face: 'A', width_mm: 2000, wall_code: 'D64', openings: [] },
    ]},
  ]};
  const planRooms = [
    { name: 'クロゼット(1)', area_sqm: 1.0 },
    { name: '物入', area_sqm: 1.92 },
  ];
  const t = computeElevationTakeoff(elevations, [], { planRooms });
  check('実測済み収納のD64は平面図のみの収納（物入）の推定を消さない（5.76）',
    t.majikiri_shitaji_m, 5.76);
}
{
  // 回帰確認: 平面図に対応の無い合算立面（クロゼット内RC面）のD64控除は維持される
  // （推定4.157−2.0=2.157 → ×2.77÷2 = 2.99。RC面と推定の重複控除という元来の意図）
  const elevations = { rooms: [
    { name: 'クロゼット内RC面', ceiling_height_mm: 2345, faces: [
      { face: 'A', width_mm: 2000, wall_code: 'D64', openings: [] },
    ]},
  ]};
  const planRooms = [{ name: '物入', area_sqm: 1.92 }];
  const t = computeElevationTakeoff(elevations, [], { planRooms });
  check('平面図に無い合算立面（クロゼット内RC面）のD64控除は維持（2.99）',
    t.majikiri_shitaji_m, 2.99);
}

// ============ 修正4: 木製巾木マッチャの完全一致 ============
console.log('--- 修正4: 木製巾木出隅役物への誤マッチ防止 ---');
{
  const result = { materials: [
    { name: '木製巾木', quantity: 50, unit: 'm' },
    { name: '木製巾木出隅役物', quantity: 10, unit: '箇所' },
  ], summary: {} };
  const takeoff = {
    wall_pb_sqm: 0, waterproof_pb_sqm: 0, ev_wall_pb_sqm: 0, sound_wall_pb_sqm: 0,
    gw_sqm: 0, cloth_sqm: 0, kitchen_panel_sqm: 0, majikiri_shitaji_m: 0, rc_furring_sqm: 0,
    skirting_m: { 木製: 56.2, ソフト: 0, 樹脂: 0 },
  };
  applyElevationTakeoff(result, takeoff);
  const habaki = result.materials.find((m) => m.name === '木製巾木');
  const desumi = result.materials.find((m) => m.name === '木製巾木出隅役物');
  check('木製巾木は実測56mで上書き', [habaki.quantity, habaki.takeoff], [56, true]);
  check('出隅役物（ヶ所）は上書きされない', [desumi.quantity, 'takeoff' in desumi], [10, false]);
}

console.log(`\n合計: ✅ ${pass} / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
