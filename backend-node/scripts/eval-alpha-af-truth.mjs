/**
 * アルファステイツ新宮町 A〜Fタイプ（+派生A1/B1/C1/D1）正解データの構造検証eval
 * （実AI呼び出しゼロ・XLS読み不要・**エンジンを一切importしない**）
 *
 * 【なぜエンジンをimportしないのか】
 *   eval-beppu-truth.mjs と同じ方針。エンジンを通して「正解と一致した」と報告できてしまうと
 *   答え合わせになる（過去にKP+47%の✗を自作期待値が隠した事故がある）。
 *   ここは正解JSON**そのもの**の健全性と、XLS由来の不変量だけを検証する。
 *   エンジンとの突合は test-building-type.mjs（Aタイプ）と eval-gtype-buildup.mjs（Gタイプ）が担当する。
 *
 * 【このevalが検証しないこと】
 *   A〜Fタイプの図面読み取り結果（parsedData）は存在しない（実AI＝課金が必要）。
 *   よって「図面→エンジン→正解」のフル検証はここでは**できない**。
 *
 * 【このevalが検証すること】
 *   A. 正解JSON自身の健全性（10タイプ×10部位の値・単位・戸数・列/行メタの自己整合）
 *   B. 換算係数が別府・Gタイプと同値か（壁1.4 / 天井1.45 = 物件不変の回帰ガード）
 *   C. 部位間の物理整合（天井/床比・巾木/床比など。桁違い・転記事故の検出）
 *   D. 派生タイプ（A1/B1/C1/D1）と基本タイプの関係（同一住戸の派生なので天井・床は一致し、
 *      壁は妻側住戸ぶんだけ増える）
 *   E. 総戸数の整合（①58戸 + ②G 9戸 = 67戸。CLAUDE.mdの実績表と一致）
 *
 * 正解の出典（2026-07-24・独立確認済み）:
 *   ①(仮称)アルファステイツ新宮町（木及び_建材）A~F.XLS 「集計表」シートの戸当列。
 *   列→タイプは B6セルの {=現場名等!A*} 参照で確定: C=A / E=A1 / G=B / I=B1 / K=C /
 *   M=C1 / O=D / Q=D1 / S=E / U=F（「C/E/G/I/K/M=A/B/C/D/E/F」ではないので注意）。
 *   行はラベルで解決（別府XLSとは行番号が違う部位がある。例: 遮音壁耐水PB=アルファ81行／別府60行）。
 *   例: 集計表C56 = 'Ａタイプ'!P22+P76+P130+P184+P238+P291+P346+P400 = 118.020（Aタイプ壁PB戸当）
 *
 * 実行: node scripts/eval-alpha-af-truth.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRUTH_PATH = path.join(HERE, 'alpha-af-ground-truth.json');
const truth = JSON.parse(fs.readFileSync(TRUTH_PATH, 'utf8'));

let ok = 0, fail = 0;
const failures = [];
function check(label, cond, detail = '') {
  if (cond) { ok++; return true; }
  fail++; failures.push(`${label}${detail ? ' — ' + detail : ''}`);
  return false;
}
function near(label, actual, expected, tol) {
  const good = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  return check(label, good, good ? '' : `expected ${expected}±${tol}, actual ${actual}`);
}

// 基本タイプ（意匠図の面積表に載る6タイプ）と、妻側住戸の派生タイプ
const BASE_TYPES = ['A', 'B', 'C', 'D', 'E', 'F'];
const DERIVED = { A1: 'A', B1: 'B', C1: 'C', D1: 'D' }; // 派生 → 基本
const TYPES = ['A', 'A1', 'B', 'B1', 'C', 'C1', 'D', 'D1', 'E', 'F'];
const PARTS = ['際根太', 'フローリング', '巾木', '遮音壁PB', '壁PB', '壁耐水PB',
  '遮音壁耐水PB', '間仕切GW', '天井下り', '天井PB'];

// XLS X列の実値。別府（eval-beppu-truth.mjs の XLS_FACTORS）と同値であることが
// 「換算係数は物件不変＝エンジンにハードコードしてよい」根拠になる。
const XLS_FACTORS = { 壁PB: 1.4, 壁耐水PB: 1.4, 遮音壁PB: 1.4, 遮音壁耐水PB: 1.4, 天井PB: 1.45, 天井下り: 1.45 };
const NO_FACTOR_PARTS = ['際根太', 'フローリング', '巾木', '間仕切GW'];
// 遮音壁耐水PBはアルファでは全タイプ0（②Gも0）。「値が正」を要求しない部位として明示する
// （XLS C81='Ａタイプ'!P368+P422 を参照先まで辿り、両方0＝拾い自体が無いことを確認済み）
const ZERO_PARTS = ['遮音壁耐水PB'];

console.log('=== アルファステイツ新宮町 A〜Fタイプ 正解データ 構造検証 ===');
console.log(`正解JSON: ${path.basename(TRUTH_PATH)}`);
console.log(`物件: ${truth._meta?.project}\n`);

// ============================================================
// A. 正解JSONの健全性
// ============================================================
console.log('--- A. 正解JSONの健全性（10タイプ×10部位=100件+メタ） ---');

check('A1 タイプが10件（A,A1,B,B1,C,C1,D,D1,E,F）', TYPES.every((t) => truth.types?.[t]),
  `実際: ${Object.keys(truth.types || {}).join(',')}`);

// 列→タイプ の対応がメタに記録され、思い込み（C/E/G=A/B/C）と食い違っていないこと
const EXPECT_COL = { C: 'A', E: 'A1', G: 'B', I: 'B1', K: 'C', M: 'C1', O: 'D', Q: 'D1', S: 'E', U: 'F' };
for (const [col, t] of Object.entries(EXPECT_COL)) {
  check(`A2-${col} 列→タイプ = ${t}`, truth._meta?.column_to_type?.[col] === t,
    `実際 ${truth._meta?.column_to_type?.[col]}`);
  check(`A3-${t} aggregation_column = ${col}`, truth.types?.[t]?.aggregation_column === col,
    `実際 ${truth.types?.[t]?.aggregation_column}`);
}

// 戸数: 基本9戸・派生1戸・合計58戸（①）。②のG 9戸と合わせて67戸（CLAUDE.md実績表）
const metaHh = truth._meta?.households || {};
let hhSum = 0;
for (const t of TYPES) {
  const ty = truth.types?.[t];
  if (!ty) continue;
  check(`A4-${t} 戸数がメタと一致`, ty.households === metaHh[t], `meta=${metaHh[t]} / type=${ty.households}`);
  hhSum += ty.households || 0;
}
check('A5 ①の合計58戸', hhSum === 58, `実際 ${hhSum}`);
check('A6 メタの合計欄も58', truth._meta?.households_total === 58, `実際 ${truth._meta?.households_total}`);
for (const t of BASE_TYPES) check(`A7-${t} 基本タイプは9戸`, metaHh[t] === 9, `実際 ${metaHh[t]}`);
for (const d of Object.keys(DERIVED)) check(`A8-${d} 派生タイプは1戸`, metaHh[d] === 1, `実際 ${metaHh[d]}`);

for (const t of TYPES) {
  const parts = truth.types?.[t]?.parts || {};
  check(`A9-${t} 10部位すべて存在`, PARTS.every((p) => parts[p]),
    `欠落: ${PARTS.filter((p) => !parts[p]).join(',') || 'なし'}`);
  for (const p of PARTS) {
    const v = parts[p];
    if (!v) continue;
    if (ZERO_PARTS.includes(p)) {
      // アルファは遮音壁耐水PBの拾いが無い（0）。0であること自体を検証する
      check(`A10-${t}/${p} 値が0（アルファは拾い無し）`, v.area_or_length === 0, `${v.area_or_length}`);
    } else {
      check(`A10-${t}/${p} 正の数値`, Number.isFinite(v.area_or_length) && v.area_or_length > 0,
        `${v.area_or_length}`);
    }
    const expectUnit = (p === '際根太' || p === '巾木') ? 'm' : 'm2';
    check(`A11-${t}/${p} 単位=${expectUnit}`, v.unit === expectUnit, `実際 ${v.unit}`);
  }
}

// ============================================================
// B. 換算係数の物件不変性
// ============================================================
console.log('--- B. 換算係数（アルファXLS X列 vs 別府・Gタイプ） ---');

for (const t of TYPES) {
  const parts = truth.types?.[t]?.parts || {};
  for (const p of PARTS) {
    const v = parts[p];
    if (!v) continue;
    if (NO_FACTOR_PARTS.includes(p)) {
      check(`B1-${t}/${p} 係数なし`, v.factor == null, `実際 ${v.factor}`);
      check(`B2-${t}/${p} 枚数換算なし`, v.sheets_converted == null, `実際 ${v.sheets_converted}`);
      continue;
    }
    check(`B3-${t}/${p} 係数=${XLS_FACTORS[p]}（別府と同値）`, v.factor === XLS_FACTORS[p], `実際 ${v.factor}`);
    near(`B4-${t}/${p} 枚数=面積÷係数`, v.sheets_converted, v.area_or_length / XLS_FACTORS[p], 0.002);
  }
}
for (const [p, f] of Object.entries(truth._meta?.factors_read_from_X_column || {})) {
  const expected = NO_FACTOR_PARTS.includes(p) ? null : XLS_FACTORS[p];
  check(`B5 メタ係数 ${p}=${f}`, f === expected, `期待 ${expected}`);
}
// 行番号メタ: 遮音壁耐水PBは81行（別府の60行を流用していないこと＝ラベル解決の証跡）
check('B6 遮音壁耐水PBの行=81（別府60行の流用でない）',
  truth._meta?.aggregation_rows?.遮音壁耐水PB === 81, `実際 ${truth._meta?.aggregation_rows?.遮音壁耐水PB}`);
check('B7 壁PBの行=56', truth._meta?.aggregation_rows?.壁PB === 56);
check('B8 天井PBの行=77', truth._meta?.aggregation_rows?.天井PB === 77);

// ============================================================
// C. 部位間の物理整合
// ============================================================
console.log('--- C. 部位間の物理整合（帯は広め・明らかな転記事故のみ検出） ---');

for (const t of TYPES) {
  const parts = truth.types?.[t]?.parts || {};
  const val = (p) => parts[p]?.area_or_length;
  const ceil = val('天井PB'), floor = val('フローリング'), habaki = val('巾木');
  const kiwa = val('際根太'), wall = val('壁PB'), sound = val('遮音壁PB');
  const gw = val('間仕切GW'), sagari = val('天井下り');

  check(`C1-${t} 天井PB(${ceil}) ≧ フローリング(${floor})`, ceil >= floor);
  check(`C2-${t} 天井/床 が1.0〜1.6倍`, ceil / floor >= 1.0 && ceil / floor <= 1.6,
    `比 ${(ceil / floor).toFixed(3)}`);
  check(`C3-${t} 巾木/床 が0.8〜1.6`, habaki / floor >= 0.8 && habaki / floor <= 1.6,
    `比 ${(habaki / floor).toFixed(3)}`);
  // 際根太は「水回り・玄関まわりだけ」なので巾木より短い。別府(0.6〜1.5)より広い帯が要る
  // （アルファは際根太11.0〜19.5m vs 巾木42.4〜57.3m ＝ 0.19〜0.36倍）
  check(`C4-${t} 際根太/巾木 が0.15〜1.5`, kiwa / habaki >= 0.15 && kiwa / habaki <= 1.5,
    `比 ${(kiwa / habaki).toFixed(3)}`);
  // C5 GWと遮音壁PBの関係: PBは壁の両面・GWは壁1枚に1回なので GW ≒ 遮音壁PB÷2 が期待値。
  //   実測比 GW÷(遮音PB/2): A=1.000 A1=1.000 B=1.019 B1=1.019 C=1.011 C1=1.011
  //                        D=1.000 D1=1.000 F=1.000 G(②)=0.990 ── 10件中9件が1.00前後。
  //   **Eタイプだけ0.743**（GW 5.397 vs 遮音壁PB 14.521）。これは転記ミスではなくXLS側の入力実態:
  //     集計表S54(遮音壁PB) = 'Ｉタイプ'!P8+P116+P170+P224+P278 = 0+2.699+3.726+2.699+5.397
  //     集計表S71(間仕切GW) = 'Ｉタイプ'!$P84 の1セルのみ = 5.397
  //   GW欄の数式は全タイプ共通で「$P84の1セル参照」だが、Eタイプは遮音壁が5行に分かれて
  //   入力されている一方 P84 には最大の1枚（5.397）しか入っておらず、残り3枚ぶんのGWが
  //   XLSに計上されていない（＝拾い漏れの疑いが濃厚だが、**正解データとしてはXLSの値が正**）。
  //   → ここで帯を緩めて全部通すと「XLSにGW漏れがある」という事実まで見えなくなるので、
  //     期待どおりの9タイプは厳しく（0.95〜1.10）検証し、Eタイプだけ既知の逸脱として個別に固定する。
  //     Eの値が将来変わった（XLSが修正された）ら、この分岐が落ちて気づける。
  const gwRatio = sound > 0 ? gw / (sound / 2) : null;
  if (t === 'E') {
    near(`C5-${t} 【既知】GW/(遮音PB÷2)=0.743（XLSのGW拾い漏れ疑い・S71が5行中1行しか参照していない）`,
      gwRatio, 0.743, 0.005);
  } else {
    check(`C5-${t} GW/(遮音PB÷2) が0.95〜1.10（PB両面・GW片面）`,
      gwRatio >= 0.95 && gwRatio <= 1.10, `比 ${gwRatio?.toFixed(3)}`);
  }
  check(`C6-${t} 下り天井 ≦ 天井PB`, sagari <= ceil, `${sagari} vs ${ceil}`);
  check(`C7-${t} 壁PB/床 が0.3〜3.0`, wall / floor >= 0.3 && wall / floor <= 3.0,
    `比 ${(wall / floor).toFixed(3)}`);
}

// ============================================================
// D. 派生タイプ（妻側住戸）と基本タイプの関係
// ============================================================
console.log('--- D. 派生タイプ（A1/B1/C1/D1）と基本タイプの関係 ---');
// 派生は同じ間取りの妻側住戸。床・天井・巾木の拾いは同一で、外皮に面する分だけ壁が増える。
for (const [d, b] of Object.entries(DERIVED)) {
  const dp = truth.types?.[d]?.parts || {}, bp = truth.types?.[b]?.parts || {};
  for (const p of ['天井PB', 'フローリング', '巾木', '際根太']) {
    near(`D1-${d} ${p}が基本${b}と同一`, dp[p]?.area_or_length, bp[p]?.area_or_length, 0.001);
  }
  // 壁PB・遮音壁PB・GWは派生の方が多い（妻側の壁が増える）
  check(`D2-${d} 壁PB > 基本${b}`, dp['壁PB']?.area_or_length > bp['壁PB']?.area_or_length,
    `${dp['壁PB']?.area_or_length} vs ${bp['壁PB']?.area_or_length}`);
  check(`D3-${d} 遮音壁PB > 基本${b}`, dp['遮音壁PB']?.area_or_length > bp['遮音壁PB']?.area_or_length,
    `${dp['遮音壁PB']?.area_or_length} vs ${bp['遮音壁PB']?.area_or_length}`);
  // 増分は1割前後（住戸まるごと1つ増えるような桁ではない）
  const inc = dp['壁PB'].area_or_length / bp['壁PB'].area_or_length - 1;
  check(`D4-${d} 壁PBの増分が0〜15%（${(inc * 100).toFixed(1)}%）`, inc > 0 && inc <= 0.15);
}

// ============================================================
// E. 物件全体の整合（①58戸 + ②G 9戸 = 67戸）
// ============================================================
console.log('--- E. 物件全体の整合 ---');
const G_HOUSEHOLDS = 9;              // ②G.XLS 現場名等!B4
const G_WALL_PB_SQM = 122.0609;      // ②集計表C56（既存の正解・CLAUDE.md）
const G_CEILING_PB_SQM = 59.0874;    // ②集計表C77
check('E1 ①58戸 + ②G9戸 = 67戸（CLAUDE.md実績表と一致）', hhSum + G_HOUSEHOLDS === 67,
  `${hhSum} + ${G_HOUSEHOLDS}`);

// 67戸総量での壁PB枚数がCLAUDE.md実績「壁石膏ボード 6,010枚」のオーダーに合うか。
//   ※ 見積明細の6,010枚は発注ベース（遮音壁・W下地を含む合算＝CLAUDE.md「発注列AB=102.4枚/戸」）
//     なので一致は要求しない。ここでは「一般壁だけで4,000〜6,500枚」の帯に入ることだけ見る。
let totalWallSheets = 0, totalCeilSheets = 0;
for (const t of TYPES) {
  const ty = truth.types[t];
  totalWallSheets += ty.parts['壁PB'].sheets_converted * ty.households;
  totalCeilSheets += ty.parts['天井PB'].sheets_converted * ty.households;
}
totalWallSheets += (G_WALL_PB_SQM / 1.4) * G_HOUSEHOLDS;
totalCeilSheets += (G_CEILING_PB_SQM / 1.45) * G_HOUSEHOLDS;
console.log(`   67戸総量: 壁PB ${totalWallSheets.toFixed(0)}枚 / 天井PB ${totalCeilSheets.toFixed(0)}枚`);
check(`E2 壁PB総量 ${totalWallSheets.toFixed(0)}枚 が4,000〜6,500枚（実績6,010枚は遮音・W下地込みの発注値）`,
  totalWallSheets >= 4000 && totalWallSheets <= 6500);
// 天井PBは実績2,810枚（=42枚/戸）。こちらは一般/遮音の区分が無いので実績と直接比較できる
check(`E3 天井PB総量 ${totalCeilSheets.toFixed(0)}枚 が実績2,810枚の±10%`,
  Math.abs(totalCeilSheets / 2810 - 1) <= 0.10, `${totalCeilSheets.toFixed(0)} vs 2810`);

// ============================================================
// 結果表
// ============================================================
console.log('\n=== アルファA〜Fタイプ 正解値一覧（戸当・①集計表より） ===');
const isWideCp = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf)
  || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff)
  || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6);
const dispWidth = (s) => [...String(s)].reduce((w, ch) => w + (isWideCp(ch.codePointAt(0)) ? 2 : 1), 0);
const padDisp = (s, w) => String(s) + ' '.repeat(Math.max(1, w - dispWidth(s)));
const head = padDisp('部位', 18) + TYPES.map((t) => t.padStart(9)).join('') + '  単位';
console.log(head);
console.log('-'.repeat(head.length));
for (const p of PARTS) {
  const cells = TYPES.map((t) => {
    const v = truth.types?.[t]?.parts?.[p]?.area_or_length;
    return (Number.isFinite(v) ? v.toFixed(1) : '-').padStart(9);
  }).join('');
  const unit = truth.types?.A?.parts?.[p]?.unit || '';
  const f = XLS_FACTORS[p];
  console.log(padDisp(p, 18) + cells + `  ${unit}` + (f ? ` ÷${f}` : ''));
}
console.log('\n' + padDisp('戸数', 18) + TYPES.map((t) => String(truth.types?.[t]?.households ?? '-').padStart(9)).join(''));
console.log(padDisp('集計表列', 18) + TYPES.map((t) => String(truth.types?.[t]?.aggregation_column ?? '-').padStart(9)).join(''));

console.log('\n=== 主要部位の枚数換算（戸当） ===');
for (const p of ['壁PB', '天井PB', '壁耐水PB', '遮音壁PB', '天井下り']) {
  const cells = TYPES.map((t) => {
    const v = truth.types?.[t]?.parts?.[p]?.sheets_converted;
    return (Number.isFinite(v) ? v.toFixed(1) : '-').padStart(9);
  }).join('');
  console.log(padDisp(p, 18) + cells + `  枚 ÷${XLS_FACTORS[p]}`);
}

console.log(`\n判定: ✅ ${ok} / ✗ ${fail}`);
if (fail > 0) {
  console.log('\n--- 失敗詳細 ---');
  failures.forEach((f) => console.log('  ✗ ' + f));
}
process.exit(fail > 0 ? 1 : 0);
