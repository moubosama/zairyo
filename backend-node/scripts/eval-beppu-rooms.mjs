/**
 * 別府4丁目 タイプ別シート部屋ブロック正解（beppu-room-truth.json）の機械検証eval
 * （実AI呼び出しゼロ・XLS読み不要・エンジン非import・xlsx非依存＝JSONのみ読む）
 *
 * 【このevalが検証すること】
 *   A. 正解JSON自身の健全性（9タイプ×部屋×ブロックの構造・戸数が既存正解と一致）
 *   B. 内部整合: 各面 area ≒ w×h / faces小計 = Σ加算面 − Σ控除面(ded:true) / linear小計 = Σvalues
 *      （XLSの数式 F=D*E・P小計=Pa+Pb-Pc の計算値を転記できていることの検算）
 *   C. 外部整合（最重要）: 部位×タイプごとの Σ部屋subtotal_P が beppu-9types-ground-truth.json の
 *      戸当値(area_or_length)と一致（±1%）。テンプレート規則「集計表C列=タイプ別シートP参照合算」の実証。
 *      参照P行は _meta.agg_refs（抽出時に9タイプ全列で同一とassert済みの集計表数式パース結果）。
 *      p_rowsに在ってJSONに無い行は「小計0でスキップされた行」のみ許容（カバレッジ検査）。
 *      ※ 10部位に対応しない部位ラベル（ｼｽﾃﾑ収納下・下地補強合板・部分界壁・EV面遮音壁等）は
 *        集計表の別行に集計される「対象外」であり、無理にマッピングせず一覧表示のみ行う。
 *
 * 【このevalが検証しないこと】図面読み取り（parsedData）との突合・エンジン計算の正誤。
 *   本JSONは「部屋×面×部位」の正解内訳であり、読み取り調整の突合土台として使う
 *   （アルファGの部屋ブロック突合＝壁PB残差の部屋単位分解と同じ武器を別府9タイプに拡張）。
 *
 * 実行: node scripts/eval-beppu-rooms.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const roomTruth = JSON.parse(fs.readFileSync(path.join(HERE, 'beppu-room-truth.json'), 'utf8'));
const aggTruth = JSON.parse(fs.readFileSync(path.join(HERE, 'beppu-9types-ground-truth.json'), 'utf8'));

let ok = 0, fail = 0;
const failures = [];
function check(label, cond, detail = '') {
  if (cond) { ok++; return true; }
  fail++; failures.push(`${label}${detail ? ' — ' + detail : ''}`);
  return false;
}

const TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const PARTS = ['際根太', 'フローリング', '巾木', '遮音壁PB', '壁PB', '壁耐水PB',
  '遮音壁耐水PB', '間仕切GW', '天井下り', '天井PB'];

console.log('=== 別府4丁目 部屋ブロック正解（タイプ別シートＡ〜Ｉ） 機械検証 ===');
console.log(`物件: ${aggTruth._meta?.project}\n`);

// ============================================================
// A. 構造の健全性
// ============================================================
console.log('--- A. 構造の健全性 ---');
check('A1 タイプが9件（A〜I）', TYPES.every((t) => roomTruth.types?.[t]),
  `実際: ${Object.keys(roomTruth.types || {}).join(',')}`);
check('A2 agg_refsに10部位', PARTS.every((p) => roomTruth._meta?.agg_refs?.[p]?.p_rows?.length > 0),
  `欠落: ${PARTS.filter((p) => !roomTruth._meta?.agg_refs?.[p]?.p_rows?.length).join(',') || 'なし'}`);

for (const t of TYPES) {
  const ty = roomTruth.types?.[t];
  if (!ty) continue;
  check(`A3-${t} 部屋が1件以上`, Array.isArray(ty.rooms) && ty.rooms.length > 0,
    `実際 ${ty.rooms?.length}`);
  // 戸数は既存正解（集計表由来）と同一のはず（両JSONとも同XLSから独立に読んだ値）
  check(`A4-${t} 戸数が既存正解と一致`, ty.households === aggTruth.types?.[t]?.households,
    `room=${ty.households} / agg=${aggTruth.types?.[t]?.households}`);
  for (const room of ty.rooms || []) {
    for (const b of room.blocks || []) {
      check(`A5-${t}/${room.name}/${b.part}@${b.subtotal_row} 必須フィールド`,
        typeof b.subtotal_row === 'number' && Number.isFinite(b.subtotal_P)
        && (b.kind === 'faces' ? !!b.faces : b.kind === 'linear' ? Array.isArray(b.values) : false),
        `kind=${b.kind}`);
    }
  }
}

// ============================================================
// B. 内部整合（XLS数式の転記検算）
// ============================================================
console.log('--- B. 内部整合（area=w×h / 小計=Σ加算−Σ控除） ---');
for (const t of TYPES) {
  for (const room of roomTruth.types?.[t]?.rooms || []) {
    for (const b of room.blocks || []) {
      const tag = `${t}/${room.name}/${b.part}@${b.subtotal_row}`;
      if (b.kind === 'faces') {
        let add = 0, ded = 0, badArea = null;
        for (const faceLabel of ['A', 'B', 'C', 'D']) {
          for (const f of b.faces?.[faceLabel] || []) {
            // XLSの面積セルは F=D*E の計算値。w/h欠落で面積非0は構造仮定違反
            if (!Number.isFinite(f.w) || !Number.isFinite(f.h)
              || Math.abs(f.area - f.w * f.h) > 0.01) badArea = f;
            if (f.ded) ded += f.area; else add += f.area;
          }
        }
        check(`B1-${tag} 面積=w×h（±0.01）`, badArea == null,
          badArea ? `w=${badArea.w} h=${badArea.h} area=${badArea.area}` : '');
        check(`B2-${tag} 小計=Σ加算−Σ控除`, Math.abs(b.subtotal_P - (add - ded)) <= 0.02,
          `小計${b.subtotal_P} vs 加算${add.toFixed(4)}−控除${ded.toFixed(4)}`);
      } else {
        const sum = (b.values || []).reduce((s, v) => s + v, 0);
        check(`B3-${tag} 小計=Σvalues`, Math.abs(b.subtotal_P - sum) <= 0.01,
          `小計${b.subtotal_P} vs Σ${sum.toFixed(4)}`);
      }
    }
  }
}

// ============================================================
// C. 外部整合（Σ部屋subtotal_P = 集計表の戸当正解）
// ============================================================
console.log('--- C. 外部整合（部位×タイプ: Σ部屋小計 vs 集計表戸当・±1%） ---');
const extTable = [];
for (const t of TYPES) {
  const ty = roomTruth.types?.[t];
  if (!ty) continue;
  // subtotal_row -> {P, room, part} の索引
  const byRow = new Map();
  for (const room of ty.rooms || []) {
    for (const b of room.blocks || []) byRow.set(b.subtotal_row, { P: b.subtotal_P, room: room.name, part: b.part });
  }
  const skipped = new Set(ty.skipped_zero_subtotal_rows || []);
  for (const p of PARTS) {
    const refs = roomTruth._meta?.agg_refs?.[p]?.p_rows || [];
    let sum = 0;
    const missing = [];
    const contributors = [];
    for (const r of refs) {
      const hit = byRow.get(r);
      if (hit) { sum += hit.P; contributors.push(`${hit.room}:${hit.P}`); }
      else if (!skipped.has(r)) missing.push(r);
    }
    // カバレッジ: 参照行は「抽出済み」か「小計0でスキップ」のどちらかでなければならない
    check(`C1-${t}/${p} 参照P行のカバレッジ`, missing.length === 0,
      `未抽出かつ非ゼロスキップ扱いでない行: ${missing.join(',')}`);
    const expected = aggTruth.types?.[t]?.parts?.[p]?.area_or_length;
    const tol = Math.max(0.01, Math.abs(expected) * 0.01);
    const diffPct = expected ? ((sum - expected) / expected * 100) : NaN;
    check(`C2-${t}/${p} Σ部屋小計=集計表戸当`, Number.isFinite(expected) && Math.abs(sum - expected) <= tol,
      `Σ=${sum.toFixed(4)} vs 正解=${expected}（${Number.isFinite(diffPct) ? diffPct.toFixed(2) : '?'}%）`);
    extTable.push({ t, p, sum, expected, diffPct });
  }
}

// ============================================================
// 対象外部位の明示（無理にマッピングしない）
// ============================================================
const mappedRows = new Set();
for (const p of PARTS) for (const r of roomTruth._meta?.agg_refs?.[p]?.p_rows || []) mappedRows.add(r);
const unmapped = new Map(); // part label -> count
for (const t of TYPES) {
  for (const room of roomTruth.types?.[t]?.rooms || []) {
    for (const b of room.blocks || []) {
      if (!mappedRows.has(b.subtotal_row)) {
        unmapped.set(b.part, (unmapped.get(b.part) || 0) + 1);
      }
    }
  }
}
console.log('\n--- 外部整合の対象外部位（集計表の10部位正解に対応しない行・検証スキップ） ---');
for (const [part, n] of [...unmapped.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  対象外: ${part}（${n}ブロック）`);
}

// ============================================================
// 結果表
// ============================================================
console.log('\n=== 外部整合 一覧（Σ部屋小計 vs 集計表戸当・diff%） ===');
const isWideCp = (cp) => (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xff00 && cp <= 0xff60)
  || (cp >= 0x3000 && cp <= 0x303f);
const dispWidth = (s) => [...String(s)].reduce((w, ch) => w + (isWideCp(ch.codePointAt(0)) ? 2 : 1), 0);
const padDisp = (s, w) => String(s) + ' '.repeat(Math.max(1, w - dispWidth(s)));
console.log(padDisp('部位', 20) + TYPES.map((t) => t.padStart(8)).join(''));
for (const p of PARTS) {
  const cells = TYPES.map((t) => {
    const row = extTable.find((e) => e.t === t && e.p === p);
    return (row && Number.isFinite(row.diffPct) ? row.diffPct.toFixed(2) + '%' : '-').padStart(8);
  }).join('');
  console.log(padDisp(p, 20) + cells);
}

console.log(`\n判定: ✅ ${ok} / ✗ ${fail}`);
if (fail > 0) {
  console.log('\n--- 失敗詳細 ---');
  failures.slice(0, 50).forEach((f) => console.log('  ✗ ' + f));
  if (failures.length > 50) console.log(`  …他${failures.length - 50}件`);
}
process.exit(fail > 0 ? 1 : 0);
