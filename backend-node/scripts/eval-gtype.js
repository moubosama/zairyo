/**
 * ZAIRYO eval: Gタイプ正解データとアプリ解析結果の突き合わせ
 *
 * 使い方:
 *   node scripts/eval-gtype.js <parsedData.json> [calcResult.json]
 *
 * - parsedData.json: アップロードAPIが返した parsedData（AI読み取り結果）
 * - calcResult.json: calculate APIのレスポンス or summary部分（任意。あれば数量比較も行う）
 *   例: {"wall_area": 202.3, "ceiling_area": 54.9, "pb_wall_sheets": 48, "pb_ceiling_sheets": 35}
 *
 * 正解データ: gtype_ground_truth.json（同ディレクトリ or パス指定）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- 正解データ（Gタイプ・アルファステイツ新宮町） ----------
const GROUND_TRUTH = {
  senyu_area_sqm: 67.30,
  layout: '3LDK',
  // プロの拾い出し（②木及び建材XLS Ａタイプシート=Gタイプ実データ）
  wall_pb_sqm: 215.3,       // 壁PB面積合計（遮音壁含む・開口控除後）
  ceiling_pb_sqm: 59.1,     // 天井PB面積合計
  wall_pb_sheets_theory: 130,   // 215.3 / 1.6562（割付ロス含まず）
  ceiling_pb_sheets_theory: 36, // 59.1 / 1.6562
  // 見積明細（67戸平均）: スコープが異なる可能性あり（要けいとさん確認）
  mitsumori_wall_pb_per_unit: 89.7, // 6010枚/67戸
  // 帖数正解（意匠図page_45の記載と拾い出しから）
  rooms_jou: {
    // 図面記載の帖数がparsedDataに正しく転記されているかを見る
    // ※図面の正確な帖数表記はpage_45を目視して埋めること
  },
};

function pct(ai, truth) {
  if (truth === 0 || truth == null || ai == null) return null;
  return ((ai - truth) / truth) * 100;
}

function fmt(v, unit = '') {
  return v == null ? '-' : `${typeof v === 'number' ? Math.round(v * 10) / 10 : v}${unit}`;
}

function judge(errPct, warnAt = 10, failAt = 25) {
  if (errPct == null) return '❓';
  const a = Math.abs(errPct);
  if (a <= warnAt) return '✅';
  if (a <= failAt) return '⚠️';
  return '❌';
}

function main() {
  const parsedPath = process.argv[2];
  const calcPath = process.argv[3];
  if (!parsedPath) {
    console.error('使い方: node scripts/eval-gtype.js <parsedData.json> [calcResult.json]');
    process.exit(1);
  }
  const ai = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));
  const calc = calcPath ? JSON.parse(fs.readFileSync(calcPath, 'utf8')) : null;
  const gt = GROUND_TRUTH;

  const rows = [];

  // ---- 読み取りフィールド（parsedData） ----
  rows.push(['【AI読み取り】', '', '', '', '']);
  rows.push([
    '専有面積',
    fmt(gt.senyu_area_sqm, '㎡'),
    fmt(ai.total_floor_area_sqm, '㎡'),
    fmt(pct(ai.total_floor_area_sqm, gt.senyu_area_sqm), '%'),
    judge(pct(ai.total_floor_area_sqm, gt.senyu_area_sqm), 3, 10),
  ]);
  rows.push([
    '間取り',
    gt.layout,
    ai.layout_type || '-',
    ai.layout_type === gt.layout ? '一致' : '不一致',
    ai.layout_type === gt.layout ? '✅' : '❌',
  ]);
  const outer = ai.outer_dimensions_mm;
  rows.push([
    '外形寸法転記',
    '(図面の寸法線)',
    outer ? `${outer.width}×${outer.depth}` : '-',
    outer ? `面積${Math.round((outer.width / 1000) * (outer.depth / 1000) * 10) / 10}㎡` : '未転記',
    outer ? '✅' : '⚠️',
  ]);
  rows.push([
    '間仕切壁延長',
    '(正解未確定)',
    fmt(ai.partition_wall_length_m, 'm'),
    ai.partition_wall_length_m_needs_review ? '要確認フラグあり' : '',
    '📋',
  ]);
  // 部屋: 帖数転記の有無
  const rooms = ai.rooms || [];
  const jouRooms = rooms.filter((r) => r.area_jou);
  rows.push([
    '帖数転記率',
    '居室は100%',
    `${jouRooms.length}/${rooms.length}部屋`,
    rooms.filter((r) => /LDK|洋室|リビング/.test(r.name || '')).every((r) => r.area_jou)
      ? '居室すべて転記済み'
      : '居室に未転記あり',
    '',
  ]);

  // ---- 数量フィールド（calculate結果） ----
  if (calc) {
    const wallArea = calc.wall_area ?? calc.summary?.wall_area;
    const ceilArea = calc.ceiling_area ?? calc.summary?.ceiling_area;
    rows.push(['【数量計算】', '', '', '', '']);
    rows.push([
      '壁面積',
      fmt(gt.wall_pb_sqm, '㎡'),
      fmt(wallArea, '㎡'),
      fmt(pct(wallArea, gt.wall_pb_sqm), '%'),
      judge(pct(wallArea, gt.wall_pb_sqm)),
    ]);
    rows.push([
      '天井面積',
      fmt(gt.ceiling_pb_sqm, '㎡'),
      fmt(ceilArea, '㎡'),
      fmt(pct(ceilArea, gt.ceiling_pb_sqm), '%'),
      judge(pct(ceilArea, gt.ceiling_pb_sqm)),
    ]);
    if (calc.pb_wall_sheets != null) {
      rows.push([
        '壁PB枚数',
        `理論${gt.wall_pb_sheets_theory}枚 / 見積平均${gt.mitsumori_wall_pb_per_unit}枚`,
        fmt(calc.pb_wall_sheets, '枚'),
        '※スコープ差の可能性あり（リノベ既存壁の扱い要確認）',
        '📋',
      ]);
    }
  } else {
    rows.push(['(calculate結果未指定のため数量比較はスキップ)', '', '', '', '']);
  }

  // ---- 出力 ----
  console.log('\n=== Gタイプ eval結果 ===\n');
  const widths = [16, 26, 22, 34, 4];
  for (const r of rows) {
    console.log(r.map((c, i) => String(c).padEnd(widths[i])).join(' | '));
  }
  console.log('\n凡例: ✅ 良好 / ⚠️ 要注意(10-25%) / ❌ 大きな乖離(25%超) / 📋 前提確認が必要 / ❓ データ不足');
  if (ai._warnings?.length) {
    console.log('\n--- アプリ側のバリデーション警告 ---');
    ai._warnings.forEach((w) => console.log(`⚠ ${w.field}: ${w.message}`));
  }
  if (ai._ai_disagreements?.length) {
    console.log('\n--- デュアルAI不一致 ---');
    ai._ai_disagreements.forEach((d) => console.log(`⚡ ${d.field}: Gemini=${d.gemini} / Claude=${d.claude}`));
  }
}

main();
