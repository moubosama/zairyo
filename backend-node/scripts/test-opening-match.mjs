/**
 * 開口×建具表マッチング層のユニット検証
 *
 * 対象: buildupCalculator.js の normalizeDoorSymbol / buildDoorLookup / resolveOpening
 *       + routes/projects.js の mergeDoorSchedule / attachElevationData（部屋名・符号の正規化突合）
 * 観点: 符号の表記ゆれ吸収・推定マッチ（type+寸法帯+取付位置）・複数候補の安全側挙動・
 *       マッチ失敗時のnull維持（既存fallback高さに委ねる）・後方互換（建具表なし）・
 *       同符号の寸法null再掲行の非毒化（サイクルB修正1〜4の再現ケース含む）
 *
 * 実行: node scripts/test-opening-match.mjs
 */
import {
  normalizeDoorSymbol, buildDoorLookup, resolveOpening, computeElevationTakeoff,
} from '../src/services/buildupCalculator.js';
import { mergeDoorSchedule, attachElevationData } from '../src/routes/projects.js';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`✗ ${label}\n    expected: ${e}\n    actual:   ${a}`); }
}

// ============ 建具表フィクスチャ（CLAUDE.mdの実在WD建具寸法） ============
const SCHEDULE = [
  { symbol: 'WD-1TA',  name: '片開き戸', width_mm: 850,  height_mm: 2175, location: 'LDK' },
  { symbol: 'WD-2A',   name: '片開き戸', width_mm: 800,  height_mm: 2080, location: '洋室' },
  { symbol: 'WD-2TA',  name: '片開き戸', width_mm: 800,  height_mm: 2175, location: '洋室' },
  { symbol: 'WD-3TB',  name: '片開き戸', width_mm: 700,  height_mm: 2175, location: 'トイレ' },
  { symbol: 'WD-8B',   name: '片引き戸', width_mm: 760,  height_mm: 2075, location: 'パウダールーム' },
  { symbol: 'WD-8TB',  name: '片引き戸', width_mm: 760,  height_mm: 2170, location: '洗面' },
  { symbol: 'WD-120A', name: '2枚折戸',  width_mm: 605,  height_mm: 2320, location: 'クロゼット' },
  { symbol: 'WD-160B', name: '6枚折戸',  width_mm: 2091, height_mm: 2320, location: 'ウォークインクロゼット' },
  { symbol: 'AWD-101', name: '引違い窓', width_mm: 4120, height_mm: 2000, location: 'LDK' },
];
const LOOKUP = buildDoorLookup(SCHEDULE);

// ============ 1. 符号の正規化（表記ゆれ吸収） ============
console.log('--- 符号の正規化 ---');
check('半角ハイフン', normalizeDoorSymbol('WD-2A'), 'WD2A');
check('ハイフンなし', normalizeDoorSymbol('WD2A'), 'WD2A');
check('小文字', normalizeDoorSymbol('wd-2a'), 'WD2A');
check('全角英数字+全角ハイフン', normalizeDoorSymbol('ＷＤ－２Ａ'), 'WD2A');
check('長音ー（OCR誤読）', normalizeDoorSymbol('WDー2A'), 'WD2A');
check('ダッシュ‐と空白', normalizeDoorSymbol(' WD ‐ 2A '), 'WD2A');
check('null入力', normalizeDoorSymbol(null), null);
check('空文字', normalizeDoorSymbol(''), null);

// ============ 2. 符号マッチ（確定） ============
console.log('--- 符号マッチ ---');
{
  const r = resolveOpening({ symbol: 'wd2a', type: '片開き戸' }, LOOKUP);
  check('符号マッチで寸法補完+matched_by=symbol',
    [r.width_mm, r.height_mm, r.matched_by], [800, 2080, 'symbol']);
}
{
  const r = resolveOpening({ symbol: 'ＷＤ－２ＴＡ' }, LOOKUP);
  check('全角符号でもマッチ+typeも補完',
    [r.width_mm, r.height_mm, r.type, r.matched_by], [800, 2175, '片開き戸', 'symbol']);
}
{
  const r = resolveOpening({ symbol: 'WD-2A', width_mm: 850, height_mm: 2100 }, LOOKUP);
  check('転記済み寸法は上書きしない（符号マッチでも補完のみ）',
    [r.width_mm, r.height_mm, r.matched_by], [850, 2100, 'symbol']);
}

// ============ 3. 推定マッチ（フォールバック） ============
console.log('--- 推定マッチ ---');
{
  // 片引き戸760は WD-8B(2075) と WD-8TB(2170) の2候補 → 取付位置で絞れれば補完
  const r = resolveOpening({ type: '片引き戸', width_mm: 760 }, LOOKUP, 'パウダールーム');
  check('type+幅+取付位置で高さ補完+matched_by=inferred',
    [r.height_mm, r.matched_by], [2075, 'inferred']);
}
{
  // 部屋名なし → 2候補の高さが矛盾 → 補完しない（fallback高さに委ねる）
  const r = resolveOpening({ type: '片引き戸', width_mm: 760 }, LOOKUP);
  check('複数候補で高さ矛盾 → null維持', [r.height_mm, r.matched_by], [null, undefined].map((v) => v ?? null));
}
{
  // 幅の読取ズレ（605を600と読む）を許容帯30mmで吸収。「折戸」（枚数不明）↔「2枚折戸」は互換
  const r = resolveOpening({ type: '折戸', width_mm: 600 }, LOOKUP);
  check('折戸600→WD-120A(605)の高さ2320を補完', [r.height_mm, r.matched_by], [2320, 'inferred']);
}
{
  // 両寸法なし: type+取付位置で一意なら両方補完
  const r = resolveOpening({ type: '6枚折戸' }, LOOKUP, 'ウォークインクロゼット');
  check('寸法なし+一意候補 → W/H両方補完',
    [r.width_mm, r.height_mm, r.matched_by], [2091, 2320, 'inferred']);
}
{
  // 高さのみ読めている場合: 高さ帯で絞る（2175の片開き戸は850/800/700で幅矛盾 → 幅は補完しない）
  const r = resolveOpening({ type: '片開き戸', height_mm: 2175 }, LOOKUP);
  check('高さのみ+幅矛盾 → 幅null維持', [r.width_mm ?? null, r.matched_by ?? null], [null, null]);
}
{
  const r = resolveOpening({ type: '窓', width_mm: 4120 }, LOOKUP);
  check('窓は推定対象外（高さnull維持）', [r.height_mm ?? null, r.matched_by ?? null], [null, null]);
}
{
  const r = resolveOpening({ type: '開口', width_mm: 2200 }, LOOKUP);
  check('分類不能タイプ（開口）は推定しない', [r.height_mm ?? null, r.matched_by ?? null], [null, null]);
}
{
  // 玄関ドア幅850はWD-1TA(850×2175)に絞れてしまうが、真値はSD-101A(850×1900)
  // → 玄関/SD/鋼製は推定対象外（fallback高さ2.0mより悪化するため）
  const r = resolveOpening({ type: '玄関ドア', width_mm: 850 }, LOOKUP, '玄関・廊下');
  check('玄関ドアは推定対象外（高さnull維持）', [r.height_mm ?? null, r.matched_by ?? null], [null, null]);
}
{
  const r = resolveOpening({ type: '鋼製片開きドア', width_mm: 850 }, LOOKUP);
  check('SD系鋼製建具は推定対象外', [r.height_mm ?? null, r.matched_by ?? null], [null, null]);
}
{
  // 玄関ドアでも符号が読めていれば確定マッチは可
  const withSd = buildDoorLookup([...SCHEDULE,
    { symbol: 'SD-101A', name: '鋼製片開きドア', width_mm: 850, height_mm: 1900, location: '玄関' }]);
  const r = resolveOpening({ type: '玄関ドア', symbol: 'sd-101a' }, withSd);
  check('玄関ドアも符号マッチは可（SD-101A→850×1900）',
    [r.width_mm, r.height_mm, r.matched_by], [850, 1900, 'symbol']);
}
{
  // 【修正3再現】玄関ドアをAIが type:'片開き戸'・room:'玄関・廊下' と転記 → typeの玄関/SD/鋼製
  // 除外を素通りし、WD-1TA 850×2175が補完され真値SD-101A 1900より過大控除になっていた
  // （location未記載の建具表だと取付位置照合でも止まらない）→ 部屋名の玄関判定で推定除外
  const entLookup = buildDoorLookup([
    { symbol: 'WD-1TA', name: '片開き戸', width_mm: 850, height_mm: 2175, location: null }]);
  const r = resolveOpening({ type: '片開き戸', width_mm: 850, room: '玄関・廊下' }, entLookup);
  check('type片開き戸+room玄関・廊下 → 推定除外（WD-1TA 2175を補完しない）',
    [r.height_mm ?? null, r.matched_by ?? null], [null, null]);
}
{
  // roomNameフォールバック側（openingにroomが無い）でも同様に除外。全角部屋名でも効く
  const entLookup = buildDoorLookup([
    { symbol: 'WD-1TA', name: '片開き戸', width_mm: 850, height_mm: 2175, location: null }]);
  const r = resolveOpening({ type: '片開き戸', width_mm: 850 }, entLookup, '玄関　・　廊下');
  check('roomName=玄関系（全角空白入り）でも推定除外',
    [r.height_mm ?? null, r.matched_by ?? null], [null, null]);
}
{
  // 玄関部屋の開口でも符号マッチ（①）は引き続き可（room除外は推定②のみに効く）
  const withSd = buildDoorLookup([...SCHEDULE,
    { symbol: 'SD-101A', name: '鋼製片開きドア', width_mm: 850, height_mm: 1900, location: '玄関' }]);
  const r = resolveOpening({ type: '片開き戸', symbol: 'SD-101A', room: '玄関・廊下' }, withSd);
  check('room玄関でも符号マッチは可（SD-101A→850×1900）',
    [r.width_mm, r.height_mm, r.matched_by], [850, 1900, 'symbol']);
}
{
  // 取付位置照合は候補1件でも適用: 唯一の候補の取付位置が開口の部屋と対応しない → 推定しない
  const r = resolveOpening({ type: '6枚折戸' }, LOOKUP, 'トイレ');
  check('候補1件でも取付位置不一致なら推定しない',
    [r.width_mm ?? null, r.height_mm ?? null, r.matched_by ?? null], [null, null, null]);
}
{
  // 取付位置未記載の候補は推定対象に残す（建具表のlocation欠落で推定を殺さない）
  const noLoc = buildDoorLookup([{ symbol: 'WD-160B', name: '6枚折戸', width_mm: 2091, height_mm: 2320, location: null }]);
  const r = resolveOpening({ type: '6枚折戸' }, noLoc, 'トイレ');
  check('location未記載の候補は残る（部屋名不一致でも補完）',
    [r.width_mm, r.height_mm, r.matched_by], [2091, 2320, 'inferred']);
}
{
  // 再解決: 入力に古いmatched_by印が残っていても引き継がない
  const r = resolveOpening({ type: '窓', width_mm: 1200, matched_by: 'inferred' }, LOOKUP);
  check('古いmatched_by印はクリアされる', 'matched_by' in r, false);
}

// ============ 4. 同符号の重複（複数ページマージ後の建具表） ============
console.log('--- 同符号の重複 ---');
{
  // 寸法が矛盾する同符号 → 符号マッチ不可（安全側）。推定も高さ矛盾で補完しない
  const dup = buildDoorLookup([
    { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 },
    { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2175 },
  ]);
  const r = resolveOpening({ symbol: 'WD-2A', type: '片開き戸', width_mm: 800 }, dup);
  check('同符号で寸法矛盾 → 高さnull維持（符号マッチ拒否）',
    [r.height_mm ?? null, r.matched_by ?? null], [null, null]);
}
{
  // 寸法が一致する同符号（ページ重複読み） → 1件扱いでマッチ可
  const dup = buildDoorLookup([
    { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 },
    { symbol: 'WD2A', name: '片開き戸', width_mm: 800, height_mm: 2080 },
  ]);
  const r = resolveOpening({ symbol: 'wd-2a' }, dup);
  check('同符号で寸法一致 → マッチ可', [r.width_mm, r.height_mm, r.matched_by], [800, 2080, 'symbol']);
}
{
  // 【修正1再現・CONFIRMED】同符号の2行目が寸法null（一覧行+姿図欄の再掲等）
  // 旧実装は厳密比較で null≠実寸 も「矛盾」扱い → bySymbolがnull毒化し寸法行までマッチ不能だった
  const dup = buildDoorLookup([
    { symbol: 'WD-2TA', name: '片開き戸', width_mm: 800, height_mm: 2175 },
    { symbol: 'WD-2TA', name: '片開き戸', width_mm: null, height_mm: null },
  ]);
  const r = resolveOpening({ symbol: 'wd-2ta' }, dup);
  check('同符号null行が後 → 寸法行で符号マッチ成立（毒化しない）',
    [r.width_mm, r.height_mm, r.matched_by], [800, 2175, 'symbol']);
}
{
  // null行が先でも同じ（順序非依存）
  const dup = buildDoorLookup([
    { symbol: 'WD-2TA', name: '片開き戸', width_mm: null, height_mm: null },
    { symbol: 'WD-2TA', name: '片開き戸', width_mm: 800, height_mm: 2175 },
  ]);
  const r = resolveOpening({ symbol: 'WD-2TA' }, dup);
  check('同符号null行が先でも符号マッチ成立',
    [r.width_mm, r.height_mm, r.matched_by], [800, 2175, 'symbol']);
}
{
  // 部分null: 幅だけの行+高さだけの行 → フィールド単位で合成（非nullの食い違いのみ矛盾）
  const dup = buildDoorLookup([
    { symbol: 'WD-2TA', name: '片開き戸', width_mm: 800, height_mm: null },
    { symbol: 'WD-2TA', name: '片開き戸', width_mm: null, height_mm: 2175 },
  ]);
  const r = resolveOpening({ symbol: 'WD-2TA' }, dup);
  check('部分nullの2行はフィールド単位で合成',
    [r.width_mm, r.height_mm, r.matched_by], [800, 2175, 'symbol']);
}
{
  // 非null同士の矛盾は従来どおり毒化。間にnull行が挟まっても毒化判定は変わらない
  const dup = buildDoorLookup([
    { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 },
    { symbol: 'WD-2A', name: '片開き戸', width_mm: null, height_mm: null },
    { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2175 },
  ]);
  const r = resolveOpening({ symbol: 'WD-2A', type: '片開き戸', width_mm: 800 }, dup);
  check('null行を挟んだ非null矛盾 → 毒化維持（高さnull）',
    [r.height_mm ?? null, r.matched_by ?? null], [null, null]);
}
{
  // 矛盾確定後に寸法一致の行が来ても復活しない（どちらの寸法か確定できないままのため安全側維持）
  const dup = buildDoorLookup([
    { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 },
    { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2175 },
    { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 },
  ]);
  const r = resolveOpening({ symbol: 'WD-2A', type: '片開き戸', width_mm: 800 }, dup);
  check('矛盾確定後は後続の寸法行でも復活しない',
    [r.height_mm ?? null, r.matched_by ?? null], [null, null]);
}

// ============ 5. 後方互換（建具表なし・符号なし） ============
console.log('--- 後方互換 ---');
{
  const r = resolveOpening({ type: '片開き戸', width_mm: 800 }, buildDoorLookup([]));
  check('建具表なし → 開口は無変更・matched_byなし',
    [r.width_mm, r.height_mm ?? null, 'matched_by' in r], [800, null, false]);
}
{
  const r = resolveOpening({ type: '片開き戸', width_mm: 800, height_mm: 2175 }, LOOKUP);
  check('実寸転記済みの開口は推定に入らない（無変更）',
    [r.width_mm, r.height_mm, 'matched_by' in r], [800, 2175, false]);
}

// ============ 6. computeElevationTakeoff 統合（開口控除への反映） ============
console.log('--- computeElevationTakeoff 統合 ---');
{
  const elevations = { rooms: [
    { name: '洋室(1)', ceiling_height_mm: 2400, skirting: '木製巾木H=40', faces: [
      { face: 'A', width_mm: 3000, wall_code: 'G14',
        openings: [{ type: '片開き戸', symbol: 'WD－2TA', width_mm: null, height_mm: null }] },
    ]},
  ]};
  const t = computeElevationTakeoff(elevations, SCHEDULE);
  // 開口 = 800×2175（符号マッチ） → 面積1.74
  // 壁PB = 3.0×2.44 − 1.74 = 5.58（壁の拾い高さ=CH+40mm。XLSの壁拾い 2.44/2.24 に整合・2026-07-16変更）
  check('符号マッチの実寸で開口控除', t.opening_area_sqm, 1.74);
  check('壁PBに反映', t.wall_pb_sqm, 5.58);
  check('マッチ統計 symbol=1', t.opening_match, { symbol: 1, inferred: 0, unresolved: 0 });
  check('元データにmatched_byの印',
    elevations.rooms[0].faces[0].openings[0].matched_by, 'symbol');
  check('巾木からも開口幅0.8を控除', t.skirting_m.木製, 2.2);
}
{
  // 建具表なし（従来パス）: 幅800・高さ不明 → fallback 2.0m控除の従来挙動を維持
  const elevations = { rooms: [
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3000, wall_code: 'G14',
        openings: [{ type: '片開き戸', width_mm: 800 }] },
    ]},
  ]};
  const t = computeElevationTakeoff(elevations, []);
  check('建具表なし → fallback高さ2.0mで控除（従来挙動）', t.opening_area_sqm, 1.6);
  check('マッチ統計 unresolved=1', t.opening_match, { symbol: 0, inferred: 0, unresolved: 1 });
}
{
  // 符号は合ったが建具表行に寸法が無い → symbolとunresolvedの両方に数える（寸法欠けの実態を隠さない）
  const elevations = { rooms: [
    { name: '洋室(1)', ceiling_height_mm: 2400, faces: [
      { face: 'A', width_mm: 3000, wall_code: 'G14',
        openings: [{ type: '片開き戸', symbol: 'WD-9X' }] },
    ]},
  ]};
  const t = computeElevationTakeoff(elevations,
    [{ symbol: 'WD-9X', name: '片開き戸', width_mm: null, height_mm: null }]);
  check('符号マッチだが寸法なし → symbol=1かつunresolved=1',
    t.opening_match, { symbol: 1, inferred: 0, unresolved: 1 });
}
{
  // 再計算でマッチが外れたら元データの古い印は消える
  const opening = { type: '玄関ドア', width_mm: 850, matched_by: 'inferred' };
  const elevations = { rooms: [
    { name: '玄関・廊下', ceiling_height_mm: 2200, faces: [
      { face: 'A', width_mm: 1385, wall_code: 'G14', openings: [opening] },
    ]},
  ]};
  computeElevationTakeoff(elevations, SCHEDULE);
  check('マッチしなくなった開口の古い印は削除される', 'matched_by' in opening, false);
}

// ============ 7. mergeDoorSchedule（複数ページマージの正規化キー・修正2） ============
console.log('--- mergeDoorSchedule ---');
{
  // 【修正2再現】表記ゆれの同一建具（全角・ハイフンゆれ）が別エントリで残らず1件に統合される
  // （生symbolキーだと2件残り、下流buildDoorLookupの正規化キーで衝突していた）
  const existing = [{ symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 }];
  const incoming = [{ symbol: 'ＷＤ－２Ａ', name: '片開き戸', width_mm: null, height_mm: null }];
  const { doors, added } = mergeDoorSchedule(existing, incoming);
  check('表記ゆれマージ → 1件統合・added=0', [doors.length, added], [1, 0]);
  check('既存の寸法行が保持される', [doors[0].width_mm, doors[0].height_mm], [800, 2080]);
}
{
  // 逆方向: 既存が寸法null・新規が全角符号で寸法あり → 同一符号として寸法を埋める
  const existing = [{ symbol: 'WD-120A', name: '2枚折戸', width_mm: null, height_mm: null }];
  const incoming = [{ symbol: 'ＷＤ－１２０Ａ', name: '2枚折戸', width_mm: 605, height_mm: 2320 }];
  const { doors, added } = mergeDoorSchedule(existing, incoming);
  check('表記ゆれでも寸法欠け既存に補完される（added=0）',
    [doors.length, added, doors[0].width_mm, doors[0].height_mm], [1, 0, 605, 2320]);
}
{
  // 既存保存データに生キー重複が既にある場合もここを通れば統合される
  const existing = [
    { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 },
    { symbol: 'ＷＤ－２Ａ', name: '片開き戸', width_mm: null, height_mm: null },
  ];
  const { doors, added } = mergeDoorSchedule(existing, []);
  check('既存内の生キー重複も統合される', [doors.length, added, doors[0].width_mm], [1, 0, 800]);
}
{
  // 新規符号は追加カウント（従来挙動の維持）
  const { doors, added } = mergeDoorSchedule(
    [{ symbol: 'SD-101A', name: '鋼製片開きドア', width_mm: 850, height_mm: 1900 }],
    [{ symbol: 'WD-2TA', name: '片開き戸', width_mm: 800, height_mm: 2175 }]);
  check('新規符号の追加はadded=1', [doors.length, added], [2, 1]);
}
{
  // 【should-fix1再現】丸ごとspreadだとincomingのnullフィールドが既存の実寸を消していた
  // （既存width 800がincoming width nullで消失→開口控除が落ち壁PB約1.7㎡過大）
  // → フィールド単位補完: 既存の非null値は保持・欠けたフィールドだけ埋める・symbolは既存表記
  const existing = [{ symbol: 'WD-8B', name: '片引き戸', width_mm: 800, height_mm: null }];
  const incoming = [{ symbol: 'ＷＤ－８Ｂ', name: null, width_mm: null, height_mm: 2075 }];
  const { doors, warnings } = mergeDoorSchedule(existing, incoming);
  check('null上書き防止: 既存width保持+高さのみ補完+symbol/nameは既存表記',
    [doors[0].symbol, doors[0].name, doors[0].width_mm, doors[0].height_mm],
    ['WD-8B', '片引き戸', 800, 2075]);
  check('矛盾なし → 警告なし', warnings, []);
}
{
  // 【should-fix2再現】非null同士の寸法矛盾（表記ゆれ符号のページ間矛盾）を黙殺しない:
  // 該当フィールドをnull化（=buildDoorLookupの毒化相当をマージ層で実施・fallback高さへ倒す）+警告
  const { doors, warnings } = mergeDoorSchedule(
    [{ symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 }],
    [{ symbol: 'ＷＤ－２Ａ', name: '片開き戸', width_mm: 800, height_mm: 2175 }]);
  check('矛盾フィールドのみnull化（一致する幅は保持）',
    [doors.length, doors[0].width_mm, doors[0].height_mm], [1, 800, null]);
  check('door_schedule_conflict警告が出る',
    [warnings.length, warnings[0].field], [1, 'door_schedule_conflict']);
  check('警告メッセージに符号と両寸法', /WD-2A/.test(warnings[0].message) &&
    /2080/.test(warnings[0].message) && /2175/.test(warnings[0].message), true);
}
{
  // 矛盾でnull化した寸法は後続行の値でも復活しない（どちらが正か確定できないまま=安全側維持）
  const { doors, warnings } = mergeDoorSchedule(
    [{ symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 }],
    [{ symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2175 },
     { symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 }]);
  check('矛盾null化は後続の寸法行で復活しない・警告は符号×フィールドごと1回',
    [doors[0].height_mm ?? null, warnings.length], [null, 1]);
}
{
  // マージ層でnull化された寸法は下流buildDoorLookupでも符号マッチ不成立（fallback高さ控除に落ちる）
  const { doors } = mergeDoorSchedule(
    [{ symbol: 'WD-2A', name: '片開き戸', width_mm: 800, height_mm: 2080 }],
    [{ symbol: 'ＷＤ－２Ａ', name: '片開き戸', width_mm: 800, height_mm: 2175 }]);
  const r = resolveOpening({ symbol: 'WD-2A', type: '片開き戸', width_mm: 800 }, buildDoorLookup(doors));
  check('矛盾null化後の下流: 高さは補完されずfallbackへ',
    [r.height_mm ?? null], [null]);
}

// ============ 8. attachElevationData（部屋名の正規化突合・修正4） ============
console.log('--- attachElevationData ---');
{
  // 【修正4再現】平面図の壁記号room='洋室（１）'（全角）vs 展開図room名'洋室(1)'（半角）
  // 生比較だと不一致でplan_codes/plan_placementsが丸ごと落ち、全面デフォルトG14=壁PB過大になる
  // planPath/elevPath=null → タイル読取はスキップ/失敗catchされAI呼び出しなしで通る
  const analysisResult = {
    rooms: [{ name: '洋室(1)' }],
    wall_finish_codes: [{ room: '洋室（１）', codes: ['C04', 'G14'],
      placements: [{ code: 'C04', wall_mm: 2360 }] }],
  };
  const elevParsed = { rooms: [{ name: '洋室(1)', ceiling_height_mm: 2400,
    faces: [{ face: 'A', width_mm: 2360 }] }] };
  await attachElevationData(analysisResult, elevParsed, null, null);
  check('全角表記ゆれ部屋名でもplan_codesが付く',
    analysisResult.elevations.rooms[0].plan_codes, ['C04', 'G14']);
  check('plan_placementsも付く',
    analysisResult.elevations.rooms[0].plan_placements, [{ code: 'C04', wall_mm: 2360 }]);
}
{
  // 部屋番号の区別は維持: 洋室(2)の記号が洋室(1)に付かない（正規化しても(1)≠(2)）
  const analysisResult = {
    rooms: [{ name: '洋室(1)' }],
    wall_finish_codes: [{ room: '洋室（２）', codes: ['D64'] }],
  };
  const elevParsed = { rooms: [{ name: '洋室(1)', ceiling_height_mm: 2400,
    faces: [{ face: 'A', width_mm: 2360 }] }] };
  await attachElevationData(analysisResult, elevParsed, null, null);
  check('別番号の部屋には付かない（(1)と(2)は別部屋のまま）',
    analysisResult.elevations.rooms[0].plan_codes ?? null, null);
}

console.log(`\n合計: ✅ ${pass} / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
