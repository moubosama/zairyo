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
import {
  computeElevationTakeoff, applyElevationTakeoff, collapseDoubledPlacements,
  sanitizeRoomOpenings, buildDoorLookup,
} from '../src/services/buildupCalculator.js';
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
  //   → majikiri = (4.157−2.0)×2.57÷2 = 2.77（物入分の計上漏れ）
  // 修正後: 平面図の部屋名と一致する展開図収納のD64は控除プール外
  //   → majikiri = 4.157×2.57÷2 = 5.34
  //   （下地高は現場定数2.57。2026-07-19の総監査A-2修正でCH+370=2.77から変更）
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
  check('実測済み収納のD64は平面図のみの収納（物入）の推定を消さない（5.34）',
    t.majikiri_shitaji_m, 5.34);
}
{
  // 回帰確認: 平面図に対応の無い合算立面（クロゼット内RC面）のD64控除は維持される
  // （推定4.157−2.0=2.157 → ×2.57÷2 = 2.77。RC面と推定の重複控除という元来の意図）
  const elevations = { rooms: [
    { name: 'クロゼット内RC面', ceiling_height_mm: 2345, faces: [
      { face: 'A', width_mm: 2000, wall_code: 'D64', openings: [] },
    ]},
  ]};
  const planRooms = [{ name: '物入', area_sqm: 1.92 }];
  const t = computeElevationTakeoff(elevations, [], { planRooms });
  check('平面図に無い合算立面（クロゼット内RC面）のD64控除は維持（2.77）',
    t.majikiri_shitaji_m, 2.77);
}

// ============ 遮音壁ルール+下地高（2026-07-19 数式化・総監査A-2/A-3修正） ============
console.log('--- 遮音壁ルール: DEFAULT_SOUND_WALL_PAIRS（LDK↔洋1 1.45m + LDK↔洋3 1.05m） ---');
{
  // 両ペアの部屋が存在 → 記号読みゼロでも数式で計上される
  //   PB両面: 2×(1.45+1.05)×2.57 = 12.85 / GW壁1枚1回: (1.45+1.05)×2.57 = 6.43
  //   （XLS正解: PB 12.9785（台所裏面1.1の作図差-1%）/ GW 6.425完全一致）
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('両ペア成立で記号なしでも遮音壁を数式計上（PB 12.85 / GW 6.43 / 2ペア）',
    [t.sound_wall_pb_sqm, t.gw_sqm, t.sound_rule_pairs], [12.85, 6.43, 2]);
}
{
  // ペアの片部屋しか無い読取では幻の壁を積まない（安全側ゲート）: 洋室(3)なし → pair2は不成立
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('片部屋欠けのペアは計上しない（pair1のみ: PB 2×1.45×2.57=7.45）',
    [t.sound_wall_pb_sqm, t.sound_rule_pairs], [7.45, 1]);
}
{
  // LDK表記ゆれ（'LDK'）でもペア成立（soundRoomMatchesのLDK系同一視）
  const elevations = { rooms: [
    { name: 'LDK', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('LDK表記ゆれでもペア成立（PB 12.85）', t.sound_wall_pb_sqm, 12.85);
}
{
  // opts.soundWallRule.pairs = [] で無効化できる（他タイプでの誤計上防止の逃げ道）
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [] },
  ]};
  const t = computeElevationTakeoff(elevations, [], { soundWallRule: { pairs: [] } });
  check('pairs:[]で遮音壁ルール無効化', [t.sound_wall_pb_sqm, t.sound_rule_pairs], [0, 0]);
}
{
  // 面単位のused管理: L14の面（eval fixtureの洋室(1)C1=1450と同型）はルールと同じ壁
  //   → 面側の遮音計上をスキップし二重計上しない（PBは12.85のままでルール分のみ）
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [
      { face: 'C1', width_mm: 1450, wall_code: 'L14', openings: [] },
    ] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('L14面はルールに消費され二重計上しない（PB 12.85 / GW 6.43）',
    [t.sound_wall_pb_sqm, t.gw_sqm], [12.85, 6.43]);
}
{
  // 記号なしのペア幅一致面はwall_pb/間仕切下地から除外される（遮音壁への振替）
  //   洋室(1)の1450面（記号なし=デフォルトG14）+ 無関係の2000面
  //   → wall_pb = 2000面のみ 2.0×2.44 = 4.88 / majikiri = 2.0×2.57÷2 = 2.57
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 1450, openings: [] },
      { face: 'B', width_mm: 2000, openings: [] },
    ] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('ペア幅一致の無記号面はwall_pbから遮音へ振替（壁PB 4.88 / 下地2.57）',
    [t.wall_pb_sqm, t.majikiri_shitaji_m], [4.88, 2.57]);
}
{
  // C04（打放・元々壁PB外）の面は消費対象外: 幅が偶然一致してもルールの面扱いにしない
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 1450, wall_code: 'C04', openings: [] },
    ] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('C04面は消費されずルール値のみ（PB 12.85・壁PB 0）',
    [t.sound_wall_pb_sqm, t.wall_pb_sqm], [12.85, 0]);
}
{
  // ペア幅（±80mm）に合わないL/O/W placementはルール適用時に採用しない（部屋帰属ノイズ遮断。
  // 実例: Gemini記録の玄関・廊下L14@1000→面965。※1000は|1000-1050|=50でpair2帯に入るため
  // このテストでは帯外の@2200で再現）→ 面はデフォルトG14で壁PBへ（安全側）
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [] },
    { name: '玄関・廊下', ceiling_height_mm: 2200, faces: [
      { face: 'C', width_mm: 2200, openings: [] },
    ], plan_placements: [{ code: 'L14', wall_length_mm: 2200 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  // 遮音=ルール12.85のみ / 廊下面はG14デフォルト → 壁PB 2.2×2.24 = 4.93
  check('ペア幅外のL14 placementは採用せず面はG14へ（遮音12.85・壁PB 4.93）',
    [t.sound_wall_pb_sqm, t.wall_pb_sqm], [12.85, 4.93]);
}
{
  // ペア構成部屋以外のL/O/W placementは、ペア幅帯（±80mm）に偶然入っても採用しない
  // （should-fix①・Gemini記録の実経路再現: 玄関・廊下L14@1000が|1000−1050|=50で帯内
  //  → 面965=正はD14 EV面に割り付き遮音+0.53㎡/GW誤加算していた）
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [] },
    { name: '玄関・廊下', ceiling_height_mm: 2200, faces: [
      { face: 'C', width_mm: 965, openings: [] },
    ], plan_placements: [{ code: 'L14', wall_length_mm: 1000 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  // 遮音=ルール12.85のみ / GW=6.43のみ / 廊下面965はG14デフォルト → 壁PB 0.965×2.24 = 2.16
  check('非ペア部屋のL14はペア幅帯内でも採用しない（遮音12.85・GW6.43・壁PB2.16）',
    [t.sound_wall_pb_sqm, t.gw_sqm, t.wall_pb_sqm], [12.85, 6.43, 2.16]);
}
{
  // ペア構成部屋（洋室(1)）×ペア幅帯のL14 placementは従来どおり採用され、
  // ルールの面消費で二重計上にならない（Claude記録の実経路=回帰確認）
  const elevations = { rooms: [
    { name: 'リビング・ダイニング', ceiling_height_mm: 2400, faces: [] },
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [
      { face: 'C1', width_mm: 1450, openings: [] },
    ], plan_placements: [{ code: 'L14', wall_length_mm: 1450 }] },
    { name: '洋室(3)', ceiling_height_mm: 2400, faces: [] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('ペア部屋×帯内のL14 placementは採用+ルール消費で二重計上なし（遮音12.85・壁PB0）',
    [t.sound_wall_pb_sqm, t.wall_pb_sqm], [12.85, 0]);
}
{
  // ルール非適用時（ペア部屋なし）はL14 placementの割付が従来どおり生きる
  const elevations = { rooms: [
    { name: '玄関・廊下', ceiling_height_mm: 2200, faces: [
      { face: 'C', width_mm: 2200, openings: [] },
    ], plan_placements: [{ code: 'L14', wall_length_mm: 2200 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  // 遮音 = 2.2×下地高2.57 = 5.65（面の遮音は下地高で拾う=A-3修正）
  check('ルール非適用時はL14割付が従来どおり（遮音5.65=下地高2.57）',
    [t.sound_wall_pb_sqm, t.wall_pb_sqm], [5.65, 0]);
}

console.log('--- 下地高: 現場定数2.57（水回りのみ2.77・CH非連動＝総監査A-2修正） ---');
{
  // 居室CH2400でも下地高2.57（旧CH+370=2.77は誤り）: majikiri = 2.0×2.57÷2 = 2.57
  const elevations = { rooms: [
    { name: '洋室(H1)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2000, openings: [] },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('居室CH2400の下地高は2.57（majikiri 2.57）', t.majikiri_shitaji_m, 2.57);
}
{
  // 水回り（パウダールーム）はスラブ下がり分+0.2=2.77（旧CH2200+370=2.57は過少）
  // G14面2000 → majikiri = 2.0×2.77÷2 = 2.77
  const elevations = { rooms: [
    { name: 'パウダールーム', ceiling_height_mm: 2200, faces: [
      { face: 'A', width_mm: 2000, openings: [] },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('水回りの下地高は2.77（majikiri 2.77）', t.majikiri_shitaji_m, 2.77);
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

// ============ 読取ノイズ防御ガード（2026-07-19 Gemini実読みE2Eの暴発対策） ============
console.log('--- ガード1: 二重転記ペアの縮退（collapseDoubledPlacements） ---');
{
  // 完全等寸ペアが1クラスタだけ → 実在の等幅対面（対面C04）として×2を保持（従来挙動）
  const input = [
    { code: 'C04', wall_length_mm: 2360 },
    { code: 'C04', wall_length_mm: 2360 },
    { code: 'I14', wall_length_mm: 3000 },
  ];
  check('ペア1クラスタは対面2枚として保持', collapseDoubledPlacements(input).length, 3);
}
{
  // ペアが2クラスタ以上 → 全記号の二重転記癖とみなし全ペアを1件へ縮退
  // （2026-07-19記録の再現: 123placement中76件が同一部屋・同記号・完全等寸ペア）
  const input = [
    { code: 'C04', wall_length_mm: 2360 },
    { code: 'C04', wall_length_mm: 2360 },
    { code: 'G24', wall_length_mm: 1725 },
    { code: 'G24', wall_length_mm: 1725 },
    { code: 'I14', wall_length_mm: 3000 },
  ];
  check('ペア2クラスタ以上は全ペアを1件へ縮退', collapseDoubledPlacements(input), [
    { code: 'C04', wall_length_mm: 2360 },
    { code: 'G24', wall_length_mm: 1725 },
    { code: 'I14', wall_length_mm: 3000 },
  ]);
}
{
  // 寸法nullは縮退の対象外（そのまま通す）
  const input = [
    { code: 'C04', wall_length_mm: 2360 }, { code: 'C04', wall_length_mm: 2360 },
    { code: 'G24', wall_length_mm: 1725 }, { code: 'G24', wall_length_mm: 1725 },
    { code: 'D14', wall_length_mm: null },
  ];
  check('寸法nullは縮退対象外', collapseDoubledPlacements(input).length, 3);
}
{
  // aggregateWallCodeItems統合: 同一タイルで2記号ともペア書き出し → 部屋単位で縮退
  const res = aggregateWallCodeItems([
    { room: '洋室(N)', code: 'C04', wall_length_mm: 2000, _tile: 0 },
    { room: '洋室(N)', code: 'C04', wall_length_mm: 2000, _tile: 0 },
    { room: '洋室(N)', code: 'G24', wall_length_mm: 1500, _tile: 0 },
    { room: '洋室(N)', code: 'G24', wall_length_mm: 1500, _tile: 0 },
  ]);
  check('読取時（aggregate）でも2クラスタ以上のペアは縮退', pls(res, '洋室(N)'), [
    { code: 'C04', wall_length_mm: 2000 },
    { code: 'G24', wall_length_mm: 1500 },
  ]);
}

console.log('--- ガード3: 開口控除の物理上限 ---');
{
  // 面幅を超える開口は棄却（実例: 幻覚窓AWD-102=4120mmが洋室の面3685に付き壁net 0に潰れた）
  const elevations = { rooms: [
    { name: '洋室(G3)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3000,
        openings: [{ type: '引違い窓', symbol: 'AWD-102', width_mm: 4120, height_mm: 1900 }] },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('面幅超過の開口は控除から棄却（壁PB=面全面7.32）',
    [t.wall_pb_sqm, t.opening_guard.width_over_face], [7.32, 1]);
}
{
  // 開口合計>90%の面では完全同一開口（符号+寸法一致）の2件目以降を落とす
  // （実例: 玄関B面にSD-101A 1600×2000が2回転記され開口111%→壁net 0）
  const elevations = { rooms: [
    { name: '玄関(G3)', ceiling_height_mm: 2400, faces: [
      { face: 'B', width_mm: 2000, openings: [
        { type: '片開き戸', symbol: 'SD-101A', width_mm: 1600, height_mm: 2000 },
        { type: '片開き戸', symbol: 'SD-101A', width_mm: 1600, height_mm: 2000 },
      ] },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  // gross 4.88・重複を1件落とし控除3.2（66%）→ net 1.68
  check('超過面の完全同一開口は2件目を落とす（net 1.68）',
    [t.wall_pb_sqm, t.opening_guard.dup_dropped], [1.68, 1]);
}
{
  // 重複を落としても90%超なら面積比例で縮退+警告（net=面面積の10%を確保）
  const elevations = { rooms: [
    { name: '洋室(G3c)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2000, openings: [
        { type: '片開き戸', width_mm: 1500, height_mm: 2000 },
        { type: '引違い戸', width_mm: 900, height_mm: 2000 },
      ] },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  // gross 4.88・控除4.8（98%）→ 0.9×4.88=4.392へ縮退 → net 0.49
  check('重複なしの超過は比率縮退+警告（net 0.49）',
    [t.wall_pb_sqm, t.opening_guard.clamped_faces, t._warnings.length >= 1], [0.49, 1, true]);
}
{
  // 超過していない面では同一寸法の実在ペアを守る（Claude記録LDK B面の片開き戸800×2175×2）
  const elevations = { rooms: [
    { name: 'LDK(G3)', ceiling_height_mm: 2400, faces: [
      { face: 'B', width_mm: 6660, openings: [
        { type: '片開き戸', width_mm: 800, height_mm: 2175 },
        { type: '片開き戸', width_mm: 800, height_mm: 2175 },
      ] },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  // gross 16.25・控除3.48（21%）→ ガード非発動で両方控除 → net 12.77
  check('通常面の同一寸法ペアは両方控除（実在の2枚を守る・net 12.77）', t.wall_pb_sqm, 12.77);
}

console.log('--- ガード4: 高さ誤転記疑い寸法（CH一致）の降格・耐水除外 ---');
{
  // CH2400と完全一致する寸法は降格: 非疑い候補（D14@2360・d30）が疑い候補（C04@2400・d10）より
  // 先に面を取る（旧実装は距離順でC04が勝ち、D14のEV面が消えていた）
  const elevations = { rooms: [
    { name: '玄関(G4)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2390, openings: [] },
    ], plan_placements: [
      { code: 'C04', wall_length_mm: 2400 },
      { code: 'D14', wall_length_mm: 2360 },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('CH一致寸法は降格され非疑い候補が面を取る（D14→EV面5.83）',
    [t.ev_wall_pb_sqm, t.wall_pb_sqm], [5.83, 0]);
}
{
  // 他に候補が無い面では疑い寸法も従来どおり割り付く（実面幅=CH偶然一致の保護）
  const elevations = { rooms: [
    { name: '洋室(G4)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 2360, openings: [] },
    ], plan_placements: [{ code: 'C04', wall_length_mm: 2400 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('単独候補の疑い寸法は割付維持（C04→打放で壁PB 0）', t.wall_pb_sqm, 0);
}
{
  // 耐水記号（中間2/5）×疑い寸法は割付自体を止める（実例: パウダーのG24@2400=居室CHの
  // 誤転記が面幅2360±80に化けて耐水+5.3㎡。鏡像加算・第2パス救済まで連鎖するため除外）
  const elevations = { rooms: [
    { name: 'パウダールーム', ceiling_height_mm: 2200, faces: [
      { face: 'A', width_mm: 2360, openings: [] },
    ], plan_placements: [{ code: 'G24', wall_length_mm: 2400 }] },
    { name: '洋室(G4b)', ceiling_height_mm: 2400, faces: [] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('耐水×疑い寸法は割付しない（面はデフォルトG14へ・耐水0）',
    [t.waterproof_pb_sqm, t.wall_pb_sqm], [0, 5.29]);
}

console.log('--- ガード5: 耐水救済の重複燃料の遮断 ---');
{
  // 同記号・同寸ペア（1クラスタ=縮退対象外）の残骸が第2パス救済（±300mm）で
  // 別面へ二重に割り付くのを防ぐ（実例: パウダーB/D両面がG24@1725で二重救済）
  const elevations = { rooms: [
    { name: 'トイレ(G5)', ceiling_height_mm: 2200, faces: [
      { face: 'A', width_mm: 1725, openings: [] },
      { face: 'B', width_mm: 1900, openings: [] },
    ], plan_placements: [
      { code: 'G24', wall_length_mm: 1725 },
      { code: 'G24', wall_length_mm: 1725 },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  // 1枚目はA面（±80マッチ）。2枚目は同寸の消費済みキー → 救済に使わずB面はデフォルトG14
  check('消費済みと同寸の残骸は救済に使わない（耐水3.86・壁PB 4.26）',
    [t.waterproof_pb_sqm, t.wall_pb_sqm], [3.86, 4.26]);
}

console.log('--- ガード7: UB内部立面のスキップ ---');
{
  // UB=完成品ユニットでボード拾いなし（正しい読取ではUB内部は展開図に現れない。
  // 幻出したUB室が耐水・壁PBのジャンク燃料になるため部屋ごとスキップ）
  const elevations = { rooms: [
    { name: 'UB', ceiling_height_mm: 2200, faces: [
      { face: 'C', width_mm: 1400, openings: [] },
      { face: 'D', width_mm: 950, openings: [] },
    ], plan_placements: [{ code: 'G24', wall_length_mm: 1416 }] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('UB室は拾わない（壁0・耐水0・部屋リスト外）',
    [t.wall_pb_sqm, t.waterproof_pb_sqm, t.rooms.length], [0, 0, 0]);
}
{
  // 名前の部分一致では消さない（「UB前室」等の実在部屋を守る完全一致）
  const elevations = { rooms: [
    { name: 'UB前室', ceiling_height_mm: 2200, faces: [
      { face: 'A', width_mm: 1000, openings: [] },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('UBを含むだけの部屋名はスキップしない（完全一致のみ）', t.wall_pb_sqm, 2.24);
}

// ============ 開口の幻覚読取ガード（sanitizeRoomOpenings・2026-07-22） ============
console.log('--- 開口の幻覚読取ガード: 大窓の水回り誤配置・同一符号ドアの面またぎ重複 ---');
{
  // ① 大窓（AWD-102=4120mm窓）が水回り小部屋（パウダー）に誤配置 → 部屋から除去
  const ds = [{ symbol: 'AWD-102', name: '4枚引違窓', width_mm: 4120, height_mm: 1900 }];
  const dl = buildDoorLookup(ds);
  const faces = [
    { face: 'A', width_mm: 2360, openings: [
      { symbol: 'SD-101A', type: '玄関ドア', width_mm: 800, height_mm: 2000 },
      { symbol: 'AWD-102' }, // 幻覚: パウダーに4120mm窓
    ] },
  ];
  const { drop, stats } = sanitizeRoomOpenings(faces, dl, 'パウダールーム');
  check('パウダーの大窓AWD-102は除去（wet_window_dropped=1）',
    [stats.wet_window_dropped, drop.has(faces[0].openings[1]), drop.has(faces[0].openings[0])],
    [1, true, false]);
}
{
  // 水回りでも小窓（AW-109=600mm）は物理的にありえるので除去しない
  const ds = [{ symbol: 'AW-109', name: '引違窓', width_mm: 600, height_mm: 850 }];
  const dl = buildDoorLookup(ds);
  const faces = [{ face: 'A', width_mm: 1400, openings: [{ symbol: 'AW-109' }] }];
  const { stats } = sanitizeRoomOpenings(faces, dl, 'トイレ');
  check('水回りの小窓（600mm）は除去しない', stats.wet_window_dropped, 0);
}
{
  // 居室に大窓が来ても水回りガードは発動しない（居室のLDK掃出し窓を守る）
  const ds = [{ symbol: 'AWD-101', name: '4枚引違窓', width_mm: 4120, height_mm: 2000 }];
  const dl = buildDoorLookup(ds);
  const faces = [{ face: 'A', width_mm: 6660, openings: [{ symbol: 'AWD-101' }] }];
  const { stats } = sanitizeRoomOpenings(faces, dl, 'リビング・ダイニング');
  check('居室の大窓は除去しない（掃出し窓を守る）', stats.wet_window_dropped, 0);
}
{
  // ② 同一符号ドア（WD-120A）が同一部屋の3面（A/B/C）に幻出 → 1面だけ残し2件除去。
  //   面幅がドア幅以上の面のうち最大の面（B=4840）を残す
  const ds = [{ symbol: 'WD-120A', name: '2枚折戸', width_mm: 1800, height_mm: 2000 }];
  const dl = buildDoorLookup(ds);
  const oA = { symbol: 'WD-120A' };
  const oB = { symbol: 'WD-120A' };
  const oC = { symbol: 'WD-120A' };
  const faces = [
    { face: 'A', width_mm: 1385, openings: [oA] },
    { face: 'B', width_mm: 4840, openings: [oB] },
    { face: 'C', width_mm: 965, openings: [oC] },
  ];
  const { drop, stats } = sanitizeRoomOpenings(faces, dl, '玄関・廊下');
  check('同一符号ドアの面またぎ重複は最も収まる面(B)だけ残す（2件除去）',
    [stats.cross_face_door_dropped, drop.has(oA), drop.has(oB), drop.has(oC)],
    [2, true, false, true]);
}
{
  // 同一符号でも1面だけなら除去しない（正当な単一ドア）
  const ds = [{ symbol: 'WD-2TA', name: '片開き戸', width_mm: 800, height_mm: 2175 }];
  const dl = buildDoorLookup(ds);
  const faces = [{ face: 'B', width_mm: 3990, openings: [{ symbol: 'WD-2TA' }] }];
  const { stats } = sanitizeRoomOpenings(faces, dl, '洋室(1)');
  check('同一符号でも1面だけなら除去しない', stats.cross_face_door_dropped, 0);
}
{
  // 窓は面またぎ重複ガードの対象外（クリーン記録がLDK/洋室で窓を複数面に正当保持する実例を守る）
  const dl = buildDoorLookup([]);
  const faces = [
    { face: 'C', width_mm: 3540, openings: [{ type: '窓', width_mm: 1400, height_mm: 1100 }] },
    { face: 'D', width_mm: 6660, openings: [{ type: '窓', width_mm: 1600, height_mm: 1100 }] },
  ];
  const { stats } = sanitizeRoomOpenings(faces, dl, 'リビング・ダイニング');
  check('符号なしの窓の複数面はドア重複ガードで除去しない',
    [stats.cross_face_door_dropped, stats.wet_window_dropped], [0, 0]);
}
{
  // 面またぎ除去で壁PBが回復する統合ケース（面Aの過剰控除が消える）
  const ds = [{ symbol: 'WD-120A', name: '2枚折戸', width_mm: 1800, height_mm: 2000 }];
  const elevations = { rooms: [
    { name: '玄関・廊下', ceiling_height_mm: 2200, faces: [
      { face: 'A', width_mm: 1385, wall_code: 'G14', openings: [{ symbol: 'WD-120A' }] },
      { face: 'B', width_mm: 4840, wall_code: 'G14', openings: [{ symbol: 'WD-120A' }] },
    ] },
  ]};
  const t = computeElevationTakeoff(elevations, ds);
  // 面高=CH2200+40mm=2.24m。A面(1.385×2.24=3.102)は幻覚WD-120A除去でまるごと壁 /
  // B面(4.84×2.24=10.842)−WD-120A(1.8×2.0=3.6)=7.242 → 合計 10.34
  check('面またぎ幻覚ドア除去でA面の壁が回復（wall_pb 10.34）',
    Math.round(t.wall_pb_sqm * 100) / 100, 10.34);
  check('cross_face_door_dropped=1 が計上される', t.opening_guard.cross_face_door_dropped, 1);
}

console.log(`\n合計: ✅ ${pass} / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
