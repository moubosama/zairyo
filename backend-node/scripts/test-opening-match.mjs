/**
 * 開口×建具表マッチング層のユニット検証
 *
 * 対象: buildupCalculator.js の normalizeDoorSymbol / buildDoorLookup / resolveOpening
 * 観点: 符号の表記ゆれ吸収・推定マッチ（type+寸法帯+取付位置）・複数候補の安全側挙動・
 *       マッチ失敗時のnull維持（既存fallback高さに委ねる）・後方互換（建具表なし）
 *
 * 実行: node scripts/test-opening-match.mjs
 */
import {
  normalizeDoorSymbol, buildDoorLookup, resolveOpening, computeElevationTakeoff,
} from '../src/services/buildupCalculator.js';

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
  // 開口 = 800×2175（符号マッチ） → 面積1.74 / 壁PB = 3.0×2.4 − 1.74 = 5.46
  check('符号マッチの実寸で開口控除', t.opening_area_sqm, 1.74);
  check('壁PBに反映', t.wall_pb_sqm, 5.46);
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

console.log(`\n合計: ✅ ${pass} / ✗ ${fail}`);
process.exit(fail > 0 ? 1 : 0);
