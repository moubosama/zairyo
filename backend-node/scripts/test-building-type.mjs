// 壁PB推定パス（展開図なし）の建物種別プロファイル テスト（AI呼び出しゼロ・純関数）
//
// 検証対象: materialCalculator の
//   resolveBuildingTypeProfile / resolveWallPerimeterM / 壁PB推定ブロック
//
// 【背景】旧実装は `床面積 × 1.37 × 0.6`。1.37は**アルファステイツ新宮町(新築)実績**
//   （6,010枚÷67戸÷65.8㎡=1.363）なのに、その上に「リノベ=片面のみ」の0.6を掛けており、
//   出力0.822枚/㎡は新築でもリノベでもない中間値だった。
//   0.6の出自は git de42b9b（GLASSWOOL_COVERAGE=0.5＝後に「根拠不明」と判定され撤去済み、と
//   同じコミットの根拠なし定数の一括投入）。実績値の裏づけはリポジトリにもXLSにも無い。
//
// 【期待値の出所】答え合わせではなく実績・実測から導く:
//   - リノベ実績（けいとさん資料5現場・CLAUDE.md実績表のPB12.5=壁用）
//   - 別府4丁目9タイプ（scripts/beppu-9types-ground-truth.json = XLS集計表の戸当セル）
//   - アルファG（壁PB 122.061㎡ ÷ 1.4 = 87.2枚。展開図実測周長 95.97m）
//   - アルファA（展開図の面幅実測 総周長 97.77m）
//
// 使い方: node scripts/test-building-type.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  calculateMaterials, resolveBuildingTypeProfile, resolveWallPerimeterM,
} from '../src/services/materialCalculator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let ok = 0, ng = 0;
function check(name, cond, detail = '') {
  if (cond) { ok++; console.log(` ✅ ${name}`); }
  else { ng++; console.log(` ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const TRUTH = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'beppu-9types-ground-truth.json'), 'utf8'));
const TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const CEILING_TO_FLOOR = 0.88; // 天井/専有の収束比（test-clamp-ratio-sanity.mjs と同じ）
const floorSqmOf = (t) => TRUTH.types[t].parts['天井PB'].area_or_length / CEILING_TO_FLOOR;

const WALL_PB_ROW = '壁 石膏ボード';
const CEILING_PB_ROW = '天井 石膏ボード';

function calc(floorPlan, overrides = {}) {
  const r = calculateMaterials(floorPlan, {}, overrides);
  const row = r.materials.find((m) => m.name === WALL_PB_ROW);
  const ceil = r.materials.find((m) => m.name === CEILING_PB_ROW);
  return {
    sheets: row?.quantity, note: row?.calculation,
    ceilingSheets: ceil?.quantity, ceilingNote: ceil?.calculation,
    summary: r.summary, warnings: r._warnings || [],
    warnFields: (r._warnings || []).map((w) => w.field),
  };
}

// 汎用の入力（専有面積はユーザー入力＝通常運用）。正解から逆算した入力は作らない
function plan({ floor, partition, ch = 2400, layout = '3LDK', wetRatio = 0.10 }) {
  const wet = floor * wetRatio;
  return {
    _validated: true,
    layout_type: layout,
    total_floor_area_sqm: floor,
    total_area_source: 'user_input',
    partition_wall_length_m: partition,
    ceiling_height_mm: ch,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: floor - wet, floor_type: 'flooring' },
      { name: 'パウダールーム', area_sqm: wet * 0.5 },
      { name: 'トイレ', area_sqm: wet * 0.5 },
    ],
    openings: [], equipment: {},
  };
}

console.log('=== 建物種別プロファイル（壁PB推定パス）テスト ===');

// ------------------------------------------------------------
// 1. resolveBuildingTypeProfile の解決規則
// ------------------------------------------------------------
console.log('--- 1. 建物種別の解決（推定に依存せず外から指定） ---');
{
  const d = resolveBuildingTypeProfile({});
  check('未指定は renovation（後方互換）', d.type === 'renovation' && d.source.type === 'default', JSON.stringify(d));

  for (const v of ['new', '新築', 'NEW', ' 新築 ']) {
    const p = resolveBuildingTypeProfile({ building_type: v });
    check(`'${v}' → new`, p.type === 'new' && p.source.type === 'override', JSON.stringify(p));
  }
  for (const v of ['renovation', 'リノベ', 'リノベーション', '改修', 'リフォーム']) {
    const p = resolveBuildingTypeProfile({ building_type: v });
    check(`'${v}' → renovation`, p.type === 'renovation' && p.source.type === 'override', JSON.stringify(p));
  }
  // 空文字・null は未設定扱い（invalidにしない）
  for (const v of ['', '   ', null, undefined]) {
    const p = resolveBuildingTypeProfile({ building_type: v });
    check(`空値(${JSON.stringify(v)})は既定・invalidなし`,
      p.type === 'renovation' && !p.invalid.type, JSON.stringify(p));
  }
  // 解釈できない値は invalid に載せて既定へ（黙って新築にしない＝壁PBが1.4倍跳ねるのを防ぐ）
  for (const v of ['newbuild', '新', 'その他', '1']) {
    const p = resolveBuildingTypeProfile({ building_type: v });
    check(`不正値'${v}'は invalid かつ既定 renovation`,
      p.type === 'renovation' && p.invalid.type === v, JSON.stringify(p));
  }
}

console.log('--- 1b. 係数overrideの検証（暗黙の文字除去をしない） ---');
{
  const p = resolveBuildingTypeProfile({ wall_pb_perimeter_coeff: '0.486', wall_pb_general_ratio: '0.5' });
  check('係数overrideが効く', p.perimeter_coeff === 0.486 && p.general_ratio === 0.5, JSON.stringify(p));
  // '0.55'→55 の100倍化や '-0.5'→0.5 の符号反転を起こさない
  for (const bad of ['-0.5', '0.5m', 'abc', '0', '99']) {
    const q = resolveBuildingTypeProfile({ wall_pb_perimeter_coeff: bad });
    check(`周長係数の不正値'${bad}'は既定へフォールバック+invalid`,
      q.perimeter_coeff === 0.55 && q.invalid.perimeter_coeff === bad, JSON.stringify(q));
  }
  const r = resolveBuildingTypeProfile({ wall_pb_general_ratio: '1.5' }); // 比率は1.0超えない
  check('一般壁比率>1.0 は不正', r.general_ratio === 0.863 && r.invalid.general_ratio === '1.5', JSON.stringify(r));
}

// ------------------------------------------------------------
// 2. resolveWallPerimeterM の優先順位と下限
// ------------------------------------------------------------
console.log('--- 2. 周長の解決 ---');
{
  const ev = resolveWallPerimeterM({ elevationPerimeterM: 95.97, partitionWallLengthM: 19.8, structuralWallLengthM: 36.5, floorAreaSqm: 65.76 });
  check('展開図の実測があれば最優先・底上げしない',
    ev.perimeter_m === 95.97 && ev.source === 'elevation' && ev.floored === false, JSON.stringify(ev));

  // 間仕切×2+躯体。下限(床×1.417)を上回る入力ではそのまま使う
  const big = resolveWallPerimeterM({ partitionWallLengthM: 40, structuralWallLengthM: 40, floorAreaSqm: 65.76 });
  check('間仕切×2+躯体が下限超ならそのまま',
    Math.abs(big.perimeter_m - 120) < 1e-9 && big.source === 'partition_structural' && !big.floored, JSON.stringify(big));

  // Gタイプ相当: 19.8×2+36.5=76.1 < 65.76×1.417=93.2 → 底上げ
  const g = resolveWallPerimeterM({ partitionWallLengthM: 19.8, structuralWallLengthM: 36.5, floorAreaSqm: 65.76 });
  check('再構成が実測帯の下限を割ったら底上げ（G相当 76.1→93.2）',
    Math.abs(g.perimeter_m - 65.76 * 1.417) < 1e-6 && g.floored === true, JSON.stringify(g));
  check('底上げ後の周長はアルファG実測95.97の±10%以内',
    Math.abs(g.perimeter_m / 95.97 - 1) <= 0.10, `${g.perimeter_m.toFixed(1)}m vs 95.97m`);

  const none = resolveWallPerimeterM({ floorAreaSqm: 0 });
  check('何も無ければ0（新築式は使わずリノベ式へ退避する）', none.perimeter_m === 0 && none.source === 'none', JSON.stringify(none));
}

// ------------------------------------------------------------
// 3. 条件(3) リノベ側の精度が落ちていないこと
//    ＝ 既定・renovation指定のいずれでも**旧実装と1枚も変わらない**
//    旧実装式: ceil(ceil(床面積 × 1.37) × 0.6)
// ------------------------------------------------------------
console.log('--- 3. リノベ側の非退行（旧式と完全一致） ---');
const legacy = (floor) => Math.ceil(Math.ceil(floor * 1.37) * 0.6);
{
  let allSame = true;
  for (const floor of [40, 48.7, 50.74, 55, 60, 65.76, 67.3, 69, 71.9, 80, 90, 107.6, 116.8]) {
    const p = plan({ floor, partition: floor * 0.4 });
    const def = calc(p, {});                                // 既定
    const reno = calc(p, { building_type: 'renovation' });   // 明示
    // 床面積は rooms 合計で再計算されるので summary の値で旧式を再現して比べる
    const exp = legacy(def.summary.total_floor_area);
    if (def.sheets !== exp || reno.sheets !== exp) {
      allSame = false;
      console.log(`   床${floor}: 既定${def.sheets} / reno${reno.sheets} / 旧式${exp}`);
    }
  }
  check('全床面積帯で 既定=renovation=旧式（1枚も変わらない）', allSame);
  check('既定の根拠欄が「リノベ係数」表記', /リノベ係数/.test(calc(plan({ floor: 65, partition: 26 }), {}).note));
  check('summary.building_type が renovation', calc(plan({ floor: 65, partition: 26 }), {}).summary.building_type === 'renovation');
}

console.log('--- 3b. リノベ実績5現場との突合（けいとさん資料） ---');
{
  // CLAUDE.md実績表の PB12.5(壁用)。床面積が明記されているのは「3LDK 70㎡」のみ。
  // 他は間取り帯（CLAUDE.md「間仕切壁延長の目安」の床面積帯）で幅を持たせる。
  const SITES = [
    { name: '3LDK 70㎡', pb: 35, floorMin: 70, floorMax: 70 },        // 唯一の確定値 0.500枚/㎡
    { name: '朝日パリオ305(2LDK)', pb: 40, floorMin: 50, floorMax: 65 }, // 0.615〜0.800
    { name: '別物件ミドル(2LDK)', pb: 50, floorMin: 50, floorMax: 65 },  // 0.769〜1.000
  ];
  // 実効係数 1.37×0.6 = 0.822枚/㎡ がこの実績帯に収まることを確認する。
  // ＝「0.6には導出の筋は通っていないが、リノベの出力としては実績帯の中」の数値的裏づけ。
  const EFF = 1.37 * 0.6;
  const lo = Math.min(...SITES.map((s) => s.pb / s.floorMax));
  const hi = Math.max(...SITES.map((s) => s.pb / s.floorMin));
  console.log(`   リノベ実測帯 ${lo.toFixed(3)}〜${hi.toFixed(3)} 枚/㎡ / 実効係数 ${EFF.toFixed(3)}`);
  check(`実効係数0.822がリノベ実績帯(${lo.toFixed(2)}〜${hi.toFixed(2)})の内側`, EFF >= lo && EFF <= hi);

  // 各現場を「その現場の床面積帯」で回して出力を記録する。
  //
  // 【ここで“点の一致”を合格条件にしないのはなぜか】リノベの壁PB枚数は床面積では決まらない。
  //   実績表がそれを示している: 「3LDK 70㎡」は35枚で、より狭い2LDK(50〜65㎡)の40〜50枚**より少ない**
  //   （合計金額も535万で5現場中最安。他は620〜735万）。床面積が最大の現場が最少枚数＝
  //   **既存壁の張り替えスコープ（全面/部分/なし）**が現場ごとに違うため。
  //   CLAUDE.md運用メモの未解決事項「既存壁PBの張り替えスコープ → けいとさんへ確認中」がこれで、
  //   スコープが決まるまでは床面積からの点推定は原理的に当たらない。
  //   → 条件(3)「リノベ側の精度が落ちていないこと」は
  //      ①旧実装と1枚も変わらない（セクション3・7で実証済み）
  //      ②実効係数が実績帯の内側にある（上のcheck）
  //      ③各現場の実測枚数が“出力の帯”に対して極端に外れない
  //      の3点で示す。①が本体で、今回の変更でリノベ経路は一切通っていない。
  const outputs = [];
  for (const s of SITES) {
    const lo2 = calc(plan({ floor: s.floorMin, partition: s.floorMin * 0.4, layout: '2LDK' }), { building_type: 'renovation' }).sheets;
    const hi2 = calc(plan({ floor: s.floorMax, partition: s.floorMax * 0.4, layout: '2LDK' }), { building_type: 'renovation' }).sheets;
    outputs.push({ ...s, lo2, hi2 });
    console.log(`   ${s.name}: 出力 ${lo2}〜${hi2}枚 / 実測 ${s.pb}枚`);
  }
  // 5現場の実測（35〜60枚）が、エンジンが同じ床面積帯で出す範囲（42〜58枚）と重なること。
  // ＝ リノベ推定が実績のオーダーを外していない（スコープ差の分だけ個別にはズレる）
  const allLo = Math.min(...outputs.map((o) => o.lo2));
  const allHi = Math.max(...outputs.map((o) => o.hi2));
  const pbLo = Math.min(...SITES.map((s) => s.pb));
  const pbHi = Math.max(...SITES.map((s) => s.pb));
  check(`エンジン出力帯 ${allLo}〜${allHi}枚 が実測帯 ${pbLo}〜${pbHi}枚 と重なる`,
    allLo <= pbHi && allHi >= pbLo);
  // 個々の現場は「実測の0.6〜1.7倍」に収まる（スコープ差を許容した実用域）
  for (const o of outputs) {
    const ratioLo = o.lo2 / o.pb, ratioHi = o.hi2 / o.pb;
    check(`${o.name}: 出力/実測 = ${ratioLo.toFixed(2)}〜${ratioHi.toFixed(2)} 倍が0.6〜1.7倍の実用域`,
      ratioLo >= 0.6 && ratioHi <= 1.7, `${o.lo2}〜${o.hi2} vs ${o.pb}`);
  }
}

// ------------------------------------------------------------
// 4. 新築式の構造（周長×階高）
// ------------------------------------------------------------
console.log('--- 4. 新築式が周長ベースで動く ---');
{
  const p = plan({ floor: 69, partition: 24 });
  const n = calc(p, { building_type: 'new' });
  check('新築の根拠欄が周長ベース表記', /新築: 周長/.test(n.note), n.note);
  check('summary.building_type が new', n.summary.building_type === 'new');
  check('新築 > リノベ（同一入力で新築の方が多い）',
    n.sheets > calc(p, { building_type: 'renovation' }).sheets);

  // 床面積を変えずに間仕切壁だけ増やすと新築は増える（＝床面積比ではない構造の証明）
  const a = calc(plan({ floor: 69, partition: 24 }), { building_type: 'new' }).sheets;
  const b = calc(plan({ floor: 69, partition: 45 }), { building_type: 'new' }).sheets;
  check('床面積が同じでも間仕切が長ければ新築は増える（周長ベースの証明）', b > a, `${a} → ${b}`);
  // リノベは床面積比なので変わらない（旧構造の確認）
  const ra = calc(plan({ floor: 69, partition: 24 }), { building_type: 'renovation' }).sheets;
  const rb = calc(plan({ floor: 69, partition: 45 }), { building_type: 'renovation' }).sheets;
  check('リノベは間仕切を変えても不変（床面積比のまま）', ra === rb, `${ra} vs ${rb}`);

  // 周長が取れない（間仕切0・躯体0）＝床面積も0 → リノベ式へ退避して警告
  const zero = calc({
    _validated: true, layout_type: '3LDK', total_floor_area_sqm: 0, total_area_source: 'user_input',
    partition_wall_length_m: 0, ceiling_height_mm: 2400, rooms: [], openings: [], equipment: {},
  }, { building_type: 'new' });
  check('周長ゼロでも落ちない（0枚 or 退避）', Number.isFinite(zero.sheets), JSON.stringify(zero.sheets));
}

console.log('--- 4b. 不正なbuilding_typeは警告付きでリノベ ---');
{
  const r = calc(plan({ floor: 69, partition: 24 }), { building_type: 'newbuild' });
  check('不正値で building_type_invalid 警告', r.warnFields.includes('building_type_invalid'), JSON.stringify(r.warnFields));
  check('不正値の出力はリノベ式', r.sheets === legacy(r.summary.total_floor_area), `${r.sheets}`);
}

// ------------------------------------------------------------
// 5. 条件(1) Aタイプ（新築・アルファステイツ）
//
//    ★期待値の出典が確定した（2026-07-24・訂正）。
//      積算XLSは**2ファイルに分かれている**:
//        ①(仮称)アルファステイツ新宮町（木及び_建材）A~F.XLS ← A〜Fタイプ（58戸）
//        ②(仮称)アルファステイツ新宮町（木及び_建材）G.XLS   ← Gタイプのみ（9戸）
//      従来は②しか見ておらず「Aタイプの壁PB正解は存在しない」と判断していたが、
//      ①にAタイプの実データが在った（①現場名等!B4=9戸・B14合計58戸。②の9戸と合わせて67戸）。
//
//    【正解値（①集計表・戸当列）】
//      壁PB   = C56 118.020㎡ ÷ X56 1.4  = 84.3枚
//      天井PB = C77  61.007㎡ ÷ X77 1.45 = 42.1枚
//      ※ かつて「118枚」「61枚」と伝わっていた数字は**枚ではなく㎡**だった。
//        物理整合も取れる: 天井61.007/床53.118=1.149（Gは59.087/48.415=1.220）。
//
//    【①の「Ａタイプ」シートは本物のAタイプか（②の罠の確認）】
//      ②では「Ａタイプ」シートの中身がGだった（CLAUDE.md「原資料の罠」）。①は違う:
//        ①'Ａタイプ'!B2 = {現場名等!A$4} = "A" ＝シート名とタイプが一致
//      ただし①でも**シート名と実タイプは1つずつズレる**（現場名等がA/A1/B/B1/…の派生タイプ順のため）:
//        'Ａタイプ'=A / 'Ｂタイプ'=A1 / 'Ｃタイプ'=B / 'Ｄタイプ'=B1 / 'Ｅタイプ'=C /
//        'Ｆタイプ'=C1 / 'Ｇタイプ'=D / 'Ｈタイプ'=D1 / 'Ｉタイプ'=E / 'Ｊタイプ'=F
//      集計表の列も同様に C=A / E=A1 / G=B / I=B1 / K=C / M=C1 / O=D / Q=D1 / S=E / U=F。
//      （B6セルの {=現場名等!A6} 等で各列のタイプ名を直接確認済み。
//        「C/E/G/I/K/M = A/B/C/D/E/F」ではないので注意）
// ------------------------------------------------------------
console.log('--- 5. Aタイプ（新築・アルファ）---');
const ALPHA_G_SHEETS = 122.061 / 1.4;   // 87.19枚（②集計表C56 ÷ X列1.4）
const ALPHA_G_PERIM = 95.97;            // Gタイプ展開図の面幅合計（recordings実測）
const ALPHA_A_PERIM = 97.77;            // Aタイプ展開図の面幅合計（実測）
// Aタイプ壁PB正解: ①集計表C56=118.020㎡ ÷ X56=1.4 = 84.3枚
const ATYPE_EXPECT = 118.020 / 1.4;
// Aタイプ天井PB正解: ①集計表C77=61.007㎡ ÷ X77=1.45 = 42.1枚
const ATYPE_CEILING_EXPECT = 61.0072 / 1.45;
{
  const gt = JSON.parse(fs.readFileSync(path.join(__dirname, 'atype_ground_truth.json'), 'utf8'));
  const rooms = gt.rooms.map((r) => ({ name: r.name, area_sqm: r.area_sqm_label, floor_type: 'flooring' }));
  const aPlan = {
    _validated: true, layout_type: '3LDK',
    total_floor_area_sqm: gt.senyu_area_sqm, total_area_source: 'user_input',
    partition_wall_length_m: 24, ceiling_height_mm: 2400,
    rooms, openings: [], equipment: {},
  };
  const n = calc(aPlan, { building_type: 'new' });
  console.log(`   Aタイプ 新築: 壁PB ${n.sheets}枚 / XLS正解 ${ATYPE_EXPECT.toFixed(1)}枚`
    + `（${((n.sheets / ATYPE_EXPECT - 1) * 100).toFixed(1)}%）`);
  console.log(`   ${n.note}`);
  check(`Aタイプ新築 壁PB ${n.sheets}枚 が XLS正解 ${ATYPE_EXPECT.toFixed(1)}枚（①集計表C56 118.020㎡÷1.4）の±15%以内`,
    Math.abs(n.sheets / ATYPE_EXPECT - 1) <= 0.15, `${n.sheets} vs ${ATYPE_EXPECT.toFixed(1)}`);

  // 天井PB: ①集計表C77=61.007㎡÷X77=1.45=42.1枚
  //   XLSの天井拾いは「居室・廊下・便所・洗面の天井」の合計で、**UB・押入・PSの天井は含まない**
  //   （C77 = 'Ａタイプ'!P45+P154+P208+P260+P309+P364+P418 を参照先まで辿って確認。
  //     押入ブロックには専用行「押入天井」P464が別に在り値0＝C77の参照に入っていない）。
  const nc = n.ceilingSheets;
  console.log(`   Aタイプ 新築: 天井PB ${nc}枚 / XLS正解 ${ATYPE_CEILING_EXPECT.toFixed(1)}枚`
    + `（${((nc / ATYPE_CEILING_EXPECT - 1) * 100).toFixed(1)}%）`);
  console.log(`   ${n.ceilingNote}`);
  check(`Aタイプ新築 天井PB ${nc}枚 が XLS正解 ${ATYPE_CEILING_EXPECT.toFixed(1)}枚（①集計表C77 61.007㎡÷1.45）の±15%以内`,
    Math.abs(nc / ATYPE_CEILING_EXPECT - 1) <= 0.15, `${nc} vs ${ATYPE_CEILING_EXPECT.toFixed(1)}`);
  // 【2026-07-25 MF-1で仕様変更】ラベル無し区画の天井対象外控除は**新築オプトイン**になった。
  //   旧版はこれを既定パスにも掛けており、リノベ（＝building_type未指定の既存全プロジェクト）を
  //   最大-43%退行させていた（rooms:[]で控除が床面積全体の42%に膨張）。
  //   したがって「種別に依存しない」はもう成り立たない。正しい不変条件は:
  //     リノベ = 控除なし（totalFloorArea − ub − cl のまま＝旧実装と同値）
  //     新築   = そこから対象外面積5.258㎡（ub/clで未控除の残り）を引く
  //   詳細な回帰は scripts/test-ceiling-unlabeled.mjs（旧実装との総当たり差分0件を担保）。
  const renoCeiling = calc(aPlan, { building_type: 'renovation' }).ceilingSheets;
  check(`リノベは控除なしで新築より多い（リノベ${renoCeiling}枚 > 新築${nc}枚）`,
    renoCeiling > nc, `reno=${renoCeiling} new=${nc}`);
  // リノベ側がXLS正解より過大なのは想定内（XLSは新築の拾い構造）。ここでは
  // 「控除が効いた新築の方がXLS実測に近い」＝控除の向きが正しいことを確認する。
  check('新築の方がXLS実測(42.1枚)に近い＝控除の向きが正しい',
    Math.abs(nc - ATYPE_CEILING_EXPECT) <= Math.abs(renoCeiling - ATYPE_CEILING_EXPECT),
    `new差=${Math.abs(nc - ATYPE_CEILING_EXPECT).toFixed(1)} reno差=${Math.abs(renoCeiling - ATYPE_CEILING_EXPECT).toFixed(1)}`);
  // 推定した周長が展開図実測に近いこと（新築式の入力側の妥当性）
  const m = /周長 ([\d.]+)m/.exec(n.note);
  const perim = m ? Number(m[1]) : 0;
  check(`推定周長 ${perim}m が展開図実測 ${ALPHA_A_PERIM}m の±15%以内`,
    Math.abs(perim / ALPHA_A_PERIM - 1) <= 0.15, `${perim} vs ${ALPHA_A_PERIM}`);
  // リノベ指定だと大きく下振れする＝種別指定が効いていることの裏返し
  check('Aタイプをリノベ指定すると新築より大幅に少ない',
    calc(aPlan, { building_type: 'renovation' }).sheets < n.sheets * 0.8);
}

console.log('--- 5b. Gタイプ（新築・唯一の壁PB正解あり）---');
{
  // アルファG: XLS正解 87.2枚。専有65.76㎡・間仕切19.8m（'Ａタイプ'!P113等の遮音壁出典と同じ図面）
  const g = plan({ floor: 65.76, partition: 19.8 });
  const n = calc(g, { building_type: 'new' });
  const err = n.sheets / ALPHA_G_SHEETS - 1;
  console.log(`   Gタイプ 新築: ${n.sheets}枚 / XLS正解 ${ALPHA_G_SHEETS.toFixed(1)}枚（${(err * 100).toFixed(1)}%）`);
  check(`Gタイプ新築が正解の±20%以内（推定パスの実力）`, Math.abs(err) <= 0.20, `${n.sheets} vs ${ALPHA_G_SHEETS.toFixed(1)}`);
  check('Gタイプ新築 > Gタイプリノベ（種別の効き）',
    n.sheets > calc(g, { building_type: 'renovation' }).sheets);
  // 物件係数をアルファ実測に合わせれば更に寄る（override が効く証明）
  const tuned = calc(g, { building_type: 'new', wall_pb_perimeter_coeff: '0.614' });
  check(`アルファ係数0.614指定で誤差が縮む（${n.sheets}→${tuned.sheets}枚）`,
    Math.abs(tuned.sheets / ALPHA_G_SHEETS - 1) < Math.abs(err), `${tuned.sheets} vs ${n.sheets}`);
}

// ------------------------------------------------------------
// 6. 条件(2) 別府9タイプ（新築）で破綻しないこと
//    ★「壁 石膏ボード」単独行の一致は**構造的に不可能**（下記PB系合計で検証する）:
//      一般壁比率 = 壁PB ÷ PB系合計 は アルファ0.863 / 別府0.373〜0.654 と2.3倍開く。
//      遮音壁の比率が物件で全く違う（アルファ10% vs 別府21〜47%）ためで、
//      これは壁の量ではなく**物件の壁種別区分**＝図面の面積からは決まらない。
//      よって既定（アルファ基準0.863）で別府を回すと過大になるのは設計どおり。
//      別府は wall_pb_general_ratio='0.486' を指定して使う。
// ------------------------------------------------------------
console.log('--- 6. 別府9タイプ（新築）が破綻しない ---');
{
  const beppuPlan = (t) => {
    const floor = floorSqmOf(t);
    return plan({ floor, partition: floor * 0.4 });
  };

  // 6a. PB系合計（周長×階高×0.55）が実測のPB系合計に対して妥当か。
  //     ここが新築モデルの本体で、行分割の前段。
  console.log('   [PB系合計での照合＝新築モデル本体]');
  let worst = 0;
  for (const t of TYPES) {
    const p = TRUTH.types[t].parts;
    const actual = p['壁PB'].area_or_length + p['遮音壁PB'].area_or_length
      + p['壁耐水PB'].area_or_length + p['遮音壁耐水PB'].area_or_length;
    // エンジンと同じ周長再構成を再現（間仕切×2+躯体、下限=床×1.417）
    const floor = floorSqmOf(t);
    const perim = Math.max(floor * 0.4 * 2 + Math.sqrt(floor) * 4.5, floor * 1.417);
    const est = perim * 2.4 * 0.55;
    const err = est / actual - 1;
    worst = Math.max(worst, Math.abs(err));
    console.log(`     ${t}: 推定${est.toFixed(1)}㎡ / 実測${actual.toFixed(1)}㎡ = ${(err * 100).toFixed(0)}%`);
  }
  check(`PB系合計が9タイプ全部で±20%以内（最大${(worst * 100).toFixed(0)}%）`, worst <= 0.20);

  // 6b. 別府の一般壁比率を指定すれば「壁 石膏ボード」行も実用域に入る
  console.log('   [別府の一般壁比率0.486を指定した場合の壁PB行]');
  const errs = [];
  for (const t of TYPES) {
    const truth = TRUTH.types[t].parts['壁PB'].sheets_converted;
    const r = calc(beppuPlan(t), { building_type: 'new', wall_pb_general_ratio: '0.486' });
    const err = r.sheets / truth - 1;
    errs.push(err);
    console.log(`     ${t}: ${r.sheets}枚 / 実測${truth.toFixed(1)}枚 = ${(err * 100).toFixed(0)}%`);
  }
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  check(`9タイプ平均誤差が±10%以内（${(mean * 100).toFixed(1)}%）`, Math.abs(mean) <= 0.10);
  check('9タイプすべてが±45%以内（タイプ別の遮音比率差は推定パスでは見えない）',
    errs.every((e) => Math.abs(e) <= 0.45), errs.map((e) => `${(e * 100).toFixed(0)}%`).join(','));

  // 6c. 「破綻しない」＝ 物件係数を指定した正しい使い方で、ガードに一切引っかからないこと。
  //   ※既定（アルファ基準0.863）のまま別府を回すと H/I が絶対上限120枚に当たる。
  //     これは**設計どおりの正しい発火**: 一般壁比率が物件と合っていないので出力が過大になり、
  //     MF-1の防波堤が「面積読み取り要確認」として捕まえる。黙って過大値を出すより安全。
  //     ＝ cap が新築経路でも生きていることの実証でもある（死んだガードでない）。
  console.log('   [物件係数を指定した正しい使い方ではガードに掛からない]');
  let clean = true;
  for (const t of TYPES) {
    const r = calc(beppuPlan(t), { building_type: 'new', wall_pb_general_ratio: '0.486' });
    const bad = r.warnFields.filter((f) => /wall_pb_absolute_cap|wall_pb_sheets_small|floor_area_inflated|floor_area_implausible/.test(f));
    if (bad.length > 0) { clean = false; console.log(`     ${t}: ${bad.join(',')}`); }
    if (!(r.sheets > 0)) { clean = false; console.log(`     ${t}: sheets=${r.sheets}`); }
  }
  check('別府9タイプ（一般壁比率0.486指定）で cap張り付き/過少/床面積 の警告ゼロ', clean);

  // 6d. 既定のまま回した場合は「過大だが上限で抑制され、警告で可視化される」こと
  console.log('   [既定係数のまま回すと上限で抑制＋警告＝黙って過大値を出さない]');
  let capped = 0, silent = 0;
  for (const t of TYPES) {
    const r = calc(beppuPlan(t), { building_type: 'new' });
    if (r.sheets > 120) silent++;                              // 上限超えが素通りしたら異常
    if (r.warnFields.includes('wall_pb_absolute_cap')) capped++;
  }
  check('既定係数でも上限120枚を超える出力は無い（防波堤が効く）', silent === 0);
  check(`既定係数で上限に当たったタイプ(${capped}件)は警告付き＝黙って過大値を出さない`, capped >= 1);

  // 6e. 絶対上限(120枚)を超えないこと＝最大住戸でも防波堤の内側
  const iMax = calc(beppuPlan('I'), { building_type: 'new', wall_pb_general_ratio: '0.486' });
  check(`最大住戸I(床≈117㎡・物件係数指定) ${iMax.sheets}枚 が絶対上限120枚の内側`, iMax.sheets < 120);
}

// ------------------------------------------------------------
// 7. リノベ側の別府（＝新築物件をリノベ指定した場合）も従来どおり動く
//    条件(3)の裏取り: リノベ経路は今回の変更で一切変わっていない
// ------------------------------------------------------------
console.log('--- 7. 別府9タイプをリノベ指定＝旧実装と完全一致 ---');
{
  let same = true;
  for (const t of TYPES) {
    const p = plan({ floor: floorSqmOf(t), partition: floorSqmOf(t) * 0.4 });
    const r = calc(p, { building_type: 'renovation' });
    const exp = legacy(r.summary.total_floor_area);
    if (r.sheets !== exp) { same = false; console.log(`     ${t}: ${r.sheets} vs 旧式${exp}`); }
  }
  check('別府9タイプ リノベ指定＝旧式と1枚も違わない', same);
}

console.log(`\n=== 結果: ✅${ok} / ✗${ng} ===`);
process.exit(ng > 0 ? 1 : 0);
