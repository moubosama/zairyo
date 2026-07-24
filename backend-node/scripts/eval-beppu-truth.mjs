/**
 * 別府4丁目 9タイプ正解データの構造検証eval（実AI呼び出しゼロ・XLS読み不要）
 *
 * 【このevalが検証しないこと（重要・誤読防止）】
 *   別府の**図面読み取り結果（parsedData）は存在しない**（実AI＝課金が必要なため未取得）。
 *   よって「図面→エンジン→正解」のフル検証はここでは**できない**。
 *   XLSの面寸法からparsedDataを合成してエンジンに流し「正解と一致した」と報告するのは
 *   答え合わせであり禁止（過去にKP+47%の✗を自作期待値が隠した事故がある）。
 *
 * 【このevalが検証すること】読み取りデータが無くても検証できる3点に限定する:
 *   A. 正解JSON自身の健全性（9タイプ×10部位の値・単位・戸数・行番号メタの自己整合）
 *   B. 換算係数が別府でもアルファと同値か（壁1.4 / 天井1.45 / 界壁1.5 = 物件不変の回帰ガード）
 *      → エンジンのPB_SQM_PER_SHEET等が物件をまたいで使えることの根拠
 *   C. 部位間の物理整合（天井PB > 0 なら床・巾木が妥当な比にあるか等。過剰に狭くしない）
 *
 * 正解の出典（独立確認済み・2026-07-24）:
 *   XLS「集計表」シートの戸当列（A=C列 / B=E / C=G / D=I / E=K / F=M / G=O / H=Q / I=S）。
 *   各セルはタイプ別シートのP列（部位計）への直接参照であり、集計表側での加工は無い。
 *   例: 集計表C56 = 'Ａタイプ'!P22+P76+P130+P184+P238+P291+P346+P400 = 75.4971（Ａタイプ壁PB戸当）
 *   換算係数はX列の実値（X54/X56/X58/X60=1.4・X75/X77=1.45・X30/X34/X62/X73/X85=1.5）。
 *
 * 実行: node scripts/eval-beppu-truth.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRUTH_PATH = path.join(HERE, 'beppu-9types-ground-truth.json');
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

const TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const PARTS = ['際根太', 'フローリング', '巾木', '遮音壁PB', '壁PB', '壁耐水PB',
  '遮音壁耐水PB', '間仕切GW', '天井下り', '天井PB'];

// XLS集計表 X列の実値（2026-07-24に両物件のX列を全行ダンプして確認）。
// 別府もアルファも同値＝物件不変（＝エンジンのハードコードで良い部位）
const XLS_FACTORS = { 壁PB: 1.4, 壁耐水PB: 1.4, 遮音壁PB: 1.4, 遮音壁耐水PB: 1.4, 天井PB: 1.45, 天井下り: 1.45 };
// 係数を持たない（発注が枚数換算でない）部位。XLS X列は '（ｍ2）' や 0 が入っている
const NO_FACTOR_PARTS = ['際根太', 'フローリング', '巾木', '間仕切GW'];

console.log('=== 別府4丁目 9タイプ正解データ 構造検証 ===');
console.log(`正解JSON: ${path.basename(TRUTH_PATH)}`);
console.log(`物件: ${truth._meta?.project}\n`);

// ============================================================
// A. 正解JSONの健全性
// ============================================================
console.log('--- A. 正解JSONの健全性（9タイプ×10部位=90件+メタ） ---');

check('A1 タイプが9件（A〜I）', TYPES.every((t) => truth.types?.[t]),
  `実際: ${Object.keys(truth.types || {}).join(',')}`);

// 戸数: _meta.households と各タイプの households が一致し、合計が集計表8行の戸数と合うか。
// 別府の総戸数37 = 住戸36（4+5×6+1+1）+ 共用部1（集計表U列・タイプ別シートを持たないダミー枠）
const metaHh = truth._meta?.households || {};
let hhSum = 0;
for (const t of TYPES) {
  const ty = truth.types?.[t];
  if (!ty) continue;
  check(`A2-${t} 戸数がメタと一致`, ty.households === metaHh[t],
    `meta=${metaHh[t]} / type=${ty.households}`);
  hhSum += ty.households || 0;
}
check('A3 住戸合計36戸（+共用部1枠=集計表の37）', hhSum === 36, `実際 ${hhSum}`);

for (const t of TYPES) {
  const parts = truth.types?.[t]?.parts || {};
  check(`A4-${t} 10部位すべて存在`, PARTS.every((p) => parts[p]),
    `欠落: ${PARTS.filter((p) => !parts[p]).join(',') || 'なし'}`);
  for (const p of PARTS) {
    const v = parts[p];
    if (!v) continue;
    // 値が正の有限数（0や負は集計表からの転記ミス・タイプ別シート未記入のサイン）
    check(`A5-${t}/${p} 正の数値`, Number.isFinite(v.area_or_length) && v.area_or_length > 0,
      `${v.area_or_length}`);
    // 単位: 長さ部位はm・面積部位はm2
    const expectUnit = (p === '際根太' || p === '巾木') ? 'm' : 'm2';
    check(`A6-${t}/${p} 単位=${expectUnit}`, v.unit === expectUnit, `実際 ${v.unit}`);
  }
}

// ============================================================
// B. 換算係数の物件不変性（本eval最大の目的）
// ============================================================
console.log('--- B. 換算係数（別府XLS X列 vs エンジンのハードコード） ---');

for (const t of TYPES) {
  const parts = truth.types?.[t]?.parts || {};
  for (const p of PARTS) {
    const v = parts[p];
    if (!v) continue;
    if (NO_FACTOR_PARTS.includes(p)) {
      check(`B1-${t}/${p} 係数なし（XLS X列に係数行が無い部位）`, v.factor == null,
        `実際 ${v.factor}`);
      check(`B2-${t}/${p} 枚数換算なし`, v.sheets_converted == null, `実際 ${v.sheets_converted}`);
      continue;
    }
    // 別府の係数がアルファと同値であること = エンジンが係数を物件固定してよい根拠
    check(`B3-${t}/${p} 係数=${XLS_FACTORS[p]}（アルファと同値）`, v.factor === XLS_FACTORS[p],
      `実際 ${v.factor}`);
    // 枚数 = 面積 ÷ 係数（正解JSON内部の自己整合。丸め3桁）
    const expectSheets = v.area_or_length / XLS_FACTORS[p];
    near(`B4-${t}/${p} 枚数=面積÷係数`, v.sheets_converted, expectSheets, 0.002);
  }
}

// メタの係数表とタイプ別の係数が食い違っていないか
for (const [p, f] of Object.entries(truth._meta?.factors_read_from_X_column || {})) {
  const expected = NO_FACTOR_PARTS.includes(p) ? null : XLS_FACTORS[p];
  check(`B5 メタ係数 ${p}=${f}`, f === expected, `期待 ${expected}`);
}

// ============================================================
// C. 部位間の物理整合（過剰に狭くしない＝正解を疑う側のサニティ）
// ============================================================
console.log('--- C. 部位間の物理整合（帯は広め・明らかな転記事故のみ検出） ---');

for (const t of TYPES) {
  const parts = truth.types?.[t]?.parts || {};
  const val = (p) => parts[p]?.area_or_length;
  const ceil = val('天井PB'), floor = val('フローリング'), habaki = val('巾木');
  const kiwa = val('際根太'), wall = val('壁PB'), sound = val('遮音壁PB');
  const gw = val('間仕切GW'), sagari = val('天井下り');

  // C1 天井PB ≧ フローリング: 天井は住戸全室（水回り・玄関含む）、床上貼りは居室のみ
  check(`C1-${t} 天井PB(${ceil}) ≧ フローリング(${floor})`, ceil >= floor);
  // C2 天井PB は床の1.0〜1.6倍帯（水回り・玄関の分だけ天井が広い。1.6超は転記事故を疑う）
  check(`C2-${t} 天井/床 が1.0〜1.6倍`, ceil / floor >= 1.0 && ceil / floor <= 1.6,
    `比 ${(ceil / floor).toFixed(3)}`);
  // C3 巾木(m) は床面積(㎡)の0.8〜1.6倍帯（矩形室の周長/面積の実務レンジ）
  check(`C3-${t} 巾木/床 が0.8〜1.6`, habaki / floor >= 0.8 && habaki / floor <= 1.6,
    `比 ${(habaki / floor).toFixed(3)}`);
  // C4 際根太(m) は巾木(m)と同オーダー（どちらも室の周長系。0.6〜1.5倍）
  check(`C4-${t} 際根太/巾木 が0.6〜1.5`, kiwa / habaki >= 0.6 && kiwa / habaki <= 1.5,
    `比 ${(kiwa / habaki).toFixed(3)}`);
  // C5 GWは壁1枚1回・PBは両面なので「間仕切GW ≧ 遮音壁PB÷2」が下限として成り立つ。
  //    別府の間仕切GWは遮音壁以外の間仕切も含むため上限は設けない。
  //    ※実測の余裕は2.0〜2.8倍と大きく、この項は「符号違い・桁違いの転記事故」しか検出しない
  //      （狭くすると正解データ側を疑う根拠が無いのに落ちるため、意図的に緩い下限のみ）
  check(`C5-${t} 間仕切GW ≧ 遮音壁PB÷2`, gw >= sound / 2 - 0.01,
    `GW ${gw} vs 遮音PB/2 ${(sound / 2).toFixed(3)}`);
  // C6 下り天井は天井PBを超えない（下り天井は天井の一部の見切り）
  check(`C6-${t} 下り天井 ≦ 天井PB`, sagari <= ceil, `${sagari} vs ${ceil}`);
  // C7 壁PBは0.3〜3.0㎡/床㎡（壁の拾いが床に対して極端でないこと）
  check(`C7-${t} 壁PB/床 が0.3〜3.0`, wall / floor >= 0.3 && wall / floor <= 3.0,
    `比 ${(wall / floor).toFixed(3)}`);
}

// ============================================================
// 結果表
// ============================================================
console.log('\n=== 別府9タイプ 正解値一覧（戸当・XLS集計表より） ===');
// 全角は等幅コンソールで2桁幅のため表示幅で揃える（padEndは文字数基準でずれる）
const isWideCp = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf)
  || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff)
  || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6);
const dispWidth = (s) => [...String(s)].reduce((w, ch) => w + (isWideCp(ch.codePointAt(0)) ? 2 : 1), 0);
const padDisp = (s, w) => String(s) + ' '.repeat(Math.max(1, w - dispWidth(s)));
const head = padDisp('部位', 20) + TYPES.map((t) => t.padStart(9)).join('') + '  単位';
console.log(head);
console.log('-'.repeat(head.length));
for (const p of PARTS) {
  const cells = TYPES.map((t) => {
    const v = truth.types?.[t]?.parts?.[p]?.area_or_length;
    return (Number.isFinite(v) ? v.toFixed(1) : '-').padStart(9);
  }).join('');
  const unit = truth.types?.A?.parts?.[p]?.unit || '';
  const f = XLS_FACTORS[p];
  console.log(padDisp(p, 20) + cells + `  ${unit}` + (f ? ` ÷${f}` : ''));
}
console.log('\n' + padDisp('戸数', 20) + TYPES.map((t) => String(truth.types?.[t]?.households ?? '-').padStart(9)).join(''));

console.log(`\n判定: ✅ ${ok} / ✗ ${fail}`);
if (fail > 0) {
  console.log('\n--- 失敗詳細 ---');
  failures.forEach((f) => console.log('  ✗ ' + f));
}
process.exit(fail > 0 ? 1 : 0);
