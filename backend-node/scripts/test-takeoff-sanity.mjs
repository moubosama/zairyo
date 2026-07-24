// 展開図実測モードのサニティチェック層のユニットテスト（AI呼び出しゼロ）
//
// 検証対象: buildupCalculator.validateTakeoffSanity / hasNoWallCodes
// 期待値は実装の判定ロジック（比率上限2.4のみ・同形3室（有効面3以上）・周長4√A×1.3）から論理導出する。
// 別府9タイプ（scripts/beppu-9types-ground-truth.json）は実正解データによる誤検知の回帰テスト。
//
// 使い方: node scripts/test-takeoff-sanity.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateTakeoffSanity, hasNoWallCodes, computeElevationTakeoff,
} from '../src/services/buildupCalculator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let ok = 0, ng = 0;
function check(name, cond, detail = '') {
  if (cond) { ok++; console.log(` ✅ ${name}`); }
  else { ng++; console.log(` ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function hasCode(res, code) {
  return res.reasons.some((r) => r.code === code);
}

// 面幅mmの配列から faces を作るヘルパ
const faces = (...widths) => widths.map((w, i) => ({ face: 'ABCD'[i] || 'X', width_mm: w, openings: [] }));
const room = (name, widths, extra = {}) => ({ name, ceiling_height_mm: 2400, faces: faces(...widths), ...extra });

// 正常な展開図の骨格（Gタイプ相当・部屋ごとに寸法が異なる）
const normalElev = {
  rooms: [
    room('玄関・廊下', [1385, 4840, 965, 4840], { ceiling_height_mm: 2200 }),
    room('キッチン', [2575, 2200, 2575, 2200]),
    room('リビング・ダイニング', [3540, 6660, 3540, 6660]),
    room('洋室(1)', [2575, 5190, 1450, 1125, 5190]),
    room('洋室(2)', [2360, 3685, 2360, 4635]),
    room('洋室(3)', [2360, 4140, 2360, 3290]),
  ],
};

console.log('=== 1. 正常系 ===');
{
  // Gタイプ相当: 専有67.3㎡・壁PB121.1㎡ → 比率1.80（実績1.81相当）
  const res = validateTakeoffSanity({ wall_pb_sqm: 121.1 }, {
    totalFloorAreaSqm: 67.3, elevations: normalElev,
  });
  check('Gタイプ相当（比率1.80・部屋寸法バラバラ）→ ok:true', res.ok === true, JSON.stringify(res.reasons));
}
{
  // Aタイプ正解相当: 118㎡ ÷ 71.9㎡ = 1.64
  const res = validateTakeoffSanity({ wall_pb_sqm: 118 }, {
    totalFloorAreaSqm: 71.9, elevations: normalElev,
  });
  check('Aタイプ正解相当（比率1.64）→ ok:true', res.ok === true, JSON.stringify(res.reasons));
}
{
  // エンジンの正常出力レンジ（3記録replay実測 127.54㎡ ÷ 67.3 = 1.895）
  const res = validateTakeoffSanity({ wall_pb_sqm: 127.54 }, {
    totalFloorAreaSqm: 67.3, elevations: normalElev,
  });
  check('エンジン正常出力（比率1.895）→ ok:true', res.ok === true, JSON.stringify(res.reasons));
}

console.log('\n=== 2. 異常① 壁PB比率の逸脱 ===');
{
  // 本番ログの実データ: アルファAタイプ 専有71.9㎡ で wall_pb 226.48㎡ = 3.15倍
  const res = validateTakeoffSanity({ wall_pb_sqm: 226.48 }, {
    totalFloorAreaSqm: 71.9, elevations: normalElev,
  });
  check('本番異常データ（226.48㎡/71.9㎡=3.15倍）→ ok:false', res.ok === false);
  check('  理由に wall_pb_ratio を含む', hasCode(res, 'wall_pb_ratio'));
  const d = res.reasons.find((r) => r.code === 'wall_pb_ratio')?.detail;
  check('  detailに比率3.15が入る', d?.ratio === 3.15, JSON.stringify(d));
}
{
  // 過少側は弾かない（下限は撤廃。物件による壁の分類構造差で正常に起こりうる＝別府参照）
  const res = validateTakeoffSanity({ wall_pb_sqm: 40 }, {
    totalFloorAreaSqm: 67.3, elevations: normalElev,
  });
  check('比率0.59（過少）→ ok:true（下限は設けない）', res.ok === true, JSON.stringify(res.reasons));
}

console.log('\n=== 3. 境界値（上限2.4ちょうどは許容内・下限なし） ===');
{
  const area = 100;
  const resMax = validateTakeoffSanity({ wall_pb_sqm: 2.4 * area }, { totalFloorAreaSqm: area, elevations: normalElev });
  check('比率2.4ちょうど → ok:true（境界は許容）', resMax.ok === true, JSON.stringify(resMax.reasons));
  const over = validateTakeoffSanity({ wall_pb_sqm: 2.41 * area }, { totalFloorAreaSqm: area, elevations: normalElev });
  check('比率2.41 → ok:false', over.ok === false && hasCode(over, 'wall_pb_ratio'));
  const low = validateTakeoffSanity({ wall_pb_sqm: 0.3 * area }, { totalFloorAreaSqm: area, elevations: normalElev });
  check('比率0.30 → ok:true（過少側は判定しない）', low.ok === true, JSON.stringify(low.reasons));
  const d = over.reasons.find((r) => r.code === 'wall_pb_ratio')?.detail;
  check('  detailにminキーを持たない（上限のみ判定）', d && d.max === 2.4 && d.min === undefined, JSON.stringify(d));
}

console.log('\n=== 4. 異常③ 同一寸法の部屋が3室以上（幻覚読み） ===');
{
  // 本番ログの読み取り: 洋室(1)(2)(3)が全て A=2875,B=4840,C=2875,D=4840
  const halluElev = {
    rooms: [
      room('玄関・廊下', [2875, 4840, 2875, 4840]),
      room('リビング・ダイニング', [2875, 4840, 2875, 4840]),
      room('洋室(1)', [2875, 4840, 2875, 4840]),
      room('洋室(2)', [2875, 4840, 2875, 4840]),
      room('洋室(3)', [2875, 4840, 2875, 4840]),
    ],
  };
  // 比率は正常帯に置いて「幻覚検知だけ」で落ちることを確認する
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, {
    totalFloorAreaSqm: 67.3, elevations: halluElev,
  });
  check('同一寸法5室（比率は正常帯1.80）→ ok:false', res.ok === false);
  check('  理由に duplicate_room_shape を含む', hasCode(res, 'duplicate_room_shape'));
  const d = res.reasons.find((r) => r.code === 'duplicate_room_shape')?.detail;
  check('  detailに該当5室の名前が入る', d?.rooms?.length === 5, JSON.stringify(d));
}
{
  // 2室までは実在しうる（同型の洋室が2つ並ぶ間取り）→ 検知しない
  const twinElev = {
    rooms: [
      room('洋室(1)', [2600, 3600, 2600, 3600]),
      room('洋室(2)', [2600, 3600, 2600, 3600]),
      room('LDK', [3540, 6660, 3540, 6660]),
    ],
  };
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, {
    totalFloorAreaSqm: 67.3, elevations: twinElev,
  });
  check('同型2室 → ok:true（3室未満は正常とみなす）', res.ok === true, JSON.stringify(res.reasons));
}
{
  // 面の並び順が違っても同じ形なら検知する（昇順シグネチャ）
  const shuffled = {
    rooms: [
      room('洋室(1)', [2875, 4840, 2875, 4840]),
      room('洋室(2)', [4840, 2875, 4840, 2875]),
      room('洋室(3)', [2875, 2875, 4840, 4840]),
    ],
  };
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, { totalFloorAreaSqm: 67.3, elevations: shuffled });
  check('面の並び順違いでも同形3室を検知', hasCode(res, 'duplicate_room_shape'));
}
{
  // 誤爆防止（should-fix 1）: 面が1つしか読めなかった小部屋が3室並んでも幻覚扱いしない。
  // 幅900の物入・PS・UBが揃うのは実データで十分ありえる（実記録のUBは2面のみ）
  const fewFaces = {
    rooms: [
      room('物入1', [900]),
      room('物入2', [900]),
      room('物入3', [900]),
      room('LDK', [3540, 6660, 3540, 6660]),
    ],
  };
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, { totalFloorAreaSqm: 67.3, elevations: fewFaces });
  check('1面のみの部屋が3室 → ok:true（比較対象外）', res.ok === true, JSON.stringify(res.reasons));
}
{
  // 2面のみ（実記録のUB相当）が3室並んでも誤爆しない
  const twoFaces = {
    rooms: [
      room('UB', [1400, 950]),
      room('トイレ物入', [1400, 950]),
      room('PS', [1400, 950]),
      room('LDK', [3540, 6660, 3540, 6660]),
    ],
  };
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, { totalFloorAreaSqm: 67.3, elevations: twoFaces });
  check('2面のみの部屋が3室 → ok:true（比較対象外）', res.ok === true, JSON.stringify(res.reasons));
}
{
  // 3面そろえば検知は効く（検知力を落としていないことの確認）
  const threeFaces = {
    rooms: [
      room('洋室(1)', [2875, 4840, 2875]),
      room('洋室(2)', [2875, 4840, 2875]),
      room('洋室(3)', [2875, 4840, 2875]),
    ],
  };
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, { totalFloorAreaSqm: 67.3, elevations: threeFaces });
  check('3面同形が3室 → ok:false（検知力は維持）', res.ok === false && hasCode(res, 'duplicate_room_shape'));
}

console.log('\n=== 5. 専有面積なし（比率チェックはスキップ） ===');
{
  // 専有面積が無い → 比率は判定不能。他の判定のみ行う
  const res = validateTakeoffSanity({ wall_pb_sqm: 226.48 }, {
    totalFloorAreaSqm: null, elevations: normalElev,
  });
  check('専有面積null＋異常比率 → 比率チェックはスキップされ ok:true',
    res.ok === true && !hasCode(res, 'wall_pb_ratio'), JSON.stringify(res.reasons));
  const res0 = validateTakeoffSanity({ wall_pb_sqm: 226.48 }, { totalFloorAreaSqm: 0, elevations: normalElev });
  check('専有面積0 → 同じくスキップ', res0.ok === true && !hasCode(res0, 'wall_pb_ratio'));
  const resU = validateTakeoffSanity({ wall_pb_sqm: 226.48 }, { elevations: normalElev });
  check('専有面積undefined → 同じくスキップ', resU.ok === true);
  // 専有面積が無くても幻覚読みは検知できる
  const hallu = {
    rooms: [room('A', [2875, 4840, 2875, 4840]), room('B', [2875, 4840, 2875, 4840]), room('C', [2875, 4840, 2875, 4840])],
  };
  const resH = validateTakeoffSanity({ wall_pb_sqm: 121 }, { elevations: hallu });
  check('専有面積なしでも同形3室は検知する', resH.ok === false && hasCode(resH, 'duplicate_room_shape'));
}

console.log('\n=== 6. 異常② 1部屋の周長が非現実的 ===');
{
  // 専有67.3㎡ → 上限 4×√67.3×1.3 = 42.6m。桁誤読で28.75m級の面が並ぶ部屋を作る
  const bigElev = {
    rooms: [
      room('玄関・廊下', [1385, 4840, 965, 4840]),
      room('LDK', [28750, 48400, 28750, 48400]), // 面幅の桁誤読（×10）
    ],
  };
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, { totalFloorAreaSqm: 67.3, elevations: bigElev });
  check('周長154.3mの部屋 → ok:false・room_perimeter', res.ok === false && hasCode(res, 'room_perimeter'));
  const d = res.reasons.find((r) => r.code === 'room_perimeter')?.detail;
  check('  detailに部屋名と周長', d?.room === 'LDK' && d?.perimeter_m === 154.3, JSON.stringify(d));
}
{
  // Gタイプ実測の最大室（LDK 3540+6660+3540+6660 = 20.4m）は上限42.6m内 → 検知しない
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, { totalFloorAreaSqm: 67.3, elevations: normalElev });
  check('Gタイプ実測の最大室20.4m → 周長チェックは発動しない', !hasCode(res, 'room_perimeter'));
}

console.log('\n=== 7. 複合異常・入力堅牢性 ===');
{
  // 本番ログの破綻データ相当（比率3.15 ＋ 同形3室）は両方の理由が並ぶ
  const bad = {
    rooms: [
      room('洋室(1)', [2875, 4840, 2875, 4840]),
      room('洋室(2)', [2875, 4840, 2875, 4840]),
      room('洋室(3)', [2875, 4840, 2875, 4840]),
      room('玄関・廊下', [1385, 4840, 965, 4840]),
    ],
  };
  const res = validateTakeoffSanity({ wall_pb_sqm: 226.48 }, { totalFloorAreaSqm: 71.9, elevations: bad });
  check('本番破綻データ再現 → ok:false・理由2種', res.ok === false
    && hasCode(res, 'wall_pb_ratio') && hasCode(res, 'duplicate_room_shape'),
    JSON.stringify(res.reasons.map((r) => r.code)));
}
{
  const res = validateTakeoffSanity(null, { totalFloorAreaSqm: 67.3 });
  check('takeoff null → ok:false・no_takeoff', res.ok === false && hasCode(res, 'no_takeoff'));
}
{
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, {});
  check('contextが空でも例外なく ok:true', res.ok === true, JSON.stringify(res.reasons));
}
{
  const res = validateTakeoffSanity({ wall_pb_sqm: 0 }, { totalFloorAreaSqm: 67.3, elevations: { rooms: [] } });
  check('wall_pb 0（展開図なし相当）→ 比率チェックは発動しない', !hasCode(res, 'wall_pb_ratio'));
}
{
  // width_mm が null / 文字列でも落ちない
  const messy = { rooms: [{ name: 'X', faces: [{ width_mm: null }, { width_mm: 'abc' }, {}] }, { name: 'Y' }] };
  const res = validateTakeoffSanity({ wall_pb_sqm: 121 }, { totalFloorAreaSqm: 67.3, elevations: messy });
  check('faces異常値でも例外なく判定できる', res.ok === true, JSON.stringify(res.reasons));
}

console.log('\n=== 8. hasNoWallCodes（記号ゼロの情報提供フラグ） ===');
{
  check('記号どこにも無し → true', hasNoWallCodes({ rooms: [room('A', [1000, 2000])] }) === true);
  check('face.wall_codeあり → false',
    hasNoWallCodes({ rooms: [{ name: 'A', faces: [{ width_mm: 1000, wall_code: 'G14' }] }] }) === false);
  check('plan_codesあり → false',
    hasNoWallCodes({ rooms: [{ name: 'A', faces: [{ width_mm: 1000 }], plan_codes: ['C04'] }] }) === false);
  check('plan_placementsあり → false',
    hasNoWallCodes({ rooms: [{ name: 'A', faces: [{ width_mm: 1000 }], plan_placements: [{ code: 'D64', wall_length_mm: 1000 }] }] }) === false);
  check('不正記号のみ（T14）→ true（パース不能は記号なし扱い）',
    hasNoWallCodes({ rooms: [{ name: 'A', faces: [{ width_mm: 1000, wall_code: 'T14' }] }] }) === true);
  check('部屋ゼロ → false（判定対象なし＝警告を出さない）', hasNoWallCodes({ rooms: [] }) === false);
}

console.log('\n=== 9. 実記録3件がサニティを通過すること（回帰の要） ===');
{
  const files = [
    'gtype-vscode-claude-read.json',
    'gtype-vscode-claude-read-v2-pure.json',
    'gtype-gemini-read-gemini-2.5-flash.json',
  ];
  for (const f of files) {
    const p = path.join(__dirname, 'recordings', f);
    if (!fs.existsSync(p)) { check(`${f} が存在する`, false); continue; }
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const t = computeElevationTakeoff(d.elevations, d.door_schedule || [],
      { planRooms: d.rooms || [], closetInteriors: d.closet_interiors || [] });
    const res = validateTakeoffSanity(t, {
      totalFloorAreaSqm: d.total_floor_area_sqm, elevations: d.elevations,
    });
    const ratio = (t.wall_pb_sqm / d.total_floor_area_sqm).toFixed(3);
    check(`${f}（壁PB${t.wall_pb_sqm}㎡・比率${ratio}）→ ok:true`, res.ok === true,
      JSON.stringify(res.reasons));
  }
}

console.log('\n=== 10. 別府4丁目 A〜Iタイプ実正解がサニティを通過すること（誤検知の回帰） ===');
{
  // 背景: 下限比率1.2は別府9タイプ全部を弾いた（比率0.68〜1.18）。
  //   別府は住戸間戸境が全て「遮音壁PB」行へ分かれるため一般壁PB行が構造的に小さい。
  //   正しく読めた別府をNG判定して推定値へ落とす回帰を防ぐため、実正解データで常時検証する。
  // 専有面積は正解データに無いので天井PB÷0.878で逆算（アルファGの実績: 天井59.09㎡/専有67.3㎡=0.878）。
  //   逆算誤差の影響を排すため、プロキシに依存しない生比（壁PB÷天井PB）も併記する。
  const p = path.join(__dirname, 'beppu-9types-ground-truth.json');
  if (!fs.existsSync(p)) {
    check('beppu-9types-ground-truth.json が存在する', false);
  } else {
    const gt = JSON.parse(fs.readFileSync(p, 'utf8'));
    const CEILING_PER_AREA = 0.878; // 天井PB㎡ ÷ 専有面積㎡（アルファG実績 59.087/67.3）
    const rows = [];
    for (const [type, v] of Object.entries(gt.types || {})) {
      const wallPb = v.parts?.['壁PB']?.area_or_length;
      const ceilPb = v.parts?.['天井PB']?.area_or_length;
      const area = ceilPb / CEILING_PER_AREA;
      // 展開図（elevations）は別府には無いので比率チェックのみを見る（rooms空＝他判定は非発動）
      const res = validateTakeoffSanity({ wall_pb_sqm: wallPb }, {
        totalFloorAreaSqm: area, elevations: { rooms: [] },
      });
      rows.push({ type, wallPb, ceilPb, area, ratio: wallPb / area, raw: wallPb / ceilPb, ok: res.ok,
        codes: res.reasons.map((r) => r.code) });
      check(`別府${type}タイプ（壁PB${wallPb}㎡ / 専有推定${area.toFixed(1)}㎡ = 比率${(wallPb / area).toFixed(2)}）→ ok:true`,
        res.ok === true, JSON.stringify(res.reasons));
    }
    // 判定表を出力（レビュー時の一次資料）
    console.log('\n  --- 別府9タイプ 判定表 ---');
    console.log('  type | 壁PB㎡  | 天井PB㎡ | 専有推定㎡ | 壁PB/専有 | 壁PB/天井PB | 判定');
    for (const r of rows) {
      console.log(`  ${r.type.padEnd(4)} | ${String(r.wallPb).padStart(7)} | ${String(r.ceilPb).padStart(8)}`
        + ` | ${r.area.toFixed(1).padStart(10)} | ${r.ratio.toFixed(3).padStart(9)}`
        + ` | ${r.raw.toFixed(3).padStart(11)} | ${r.ok ? 'ok ✅' : 'NG ✗ ' + r.codes.join(',')}`);
    }
    const ratios = rows.map((r) => r.ratio);
    console.log(`  比率レンジ: ${Math.min(...ratios).toFixed(2)}〜${Math.max(...ratios).toFixed(2)}`
      + `（旧下限1.2なら9/9が誤検知。上限2.4は全タイプが下回る）`);
    check(`  9タイプ全部が ok（${rows.filter((r) => r.ok).length}/${rows.length}）`,
      rows.length === 9 && rows.every((r) => r.ok));
    check('  上限2.4は別府全タイプが下回る（上限判定は据え置き妥当）', rows.every((r) => r.ratio < 2.4));
  }
}

console.log(`\n判定: ✅${ok} / ✗${ng}`);
process.exit(ng > 0 ? 1 : 0);
