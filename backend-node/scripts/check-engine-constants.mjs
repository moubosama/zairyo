/**
 * エンジン定数の物件横断チェック（実AI呼び出しゼロ・XLS読み不要）
 *
 * 目的: エンジンにハードコードされた定数が「物件不変（どの現場でも使える）」なのか
 *   「物件依存（アルファステイツ新宮町でしか成立しない）」なのかを機械的に判定し、
 *   物件依存のものについて **overrideで吸収できるか / まだ未対応か** を一覧化する。
 *   ＝「どの定数がまだ危険か」の棚卸し表。
 *
 * 【データの出どころ】比較値は2つのプロの拾い出しXLSの実セルを人手で転記した定数表（下記）。
 *   このスクリプトはXLSを読まない（backend-nodeはxlsxパッケージを依存から外しているため。
 *   セキュリティ方針: CLAUDE.md「npm既知脆弱性0件（xlsxパッケージは未使用のため削除済み）」）。
 *   転記元セルは各エントリの source に明記してあり、原本と突合できる。
 *     アルファ: ②(仮称)アルファステイツ新宮町（木及び_建材）R6,09,19.XLS
 *     別府:     (仮称)別府4丁目プロジェクト（木及び_建材）R7,03,08.XLS
 *
 * 【判定の定義】※ n=2（アルファ・別府の2物件のみ）の弱い証拠であることに注意
 *   2物件一致  : 両物件で同値。ただし**両XLSはシート構成・行番号レイアウトが完全同一＝
 *                同一テンプレートの使い回し**であり、テンプレート値は物件ごとに上書きされている
 *                （X9が別府で0、X73が1.45→1.5、X81が1.4→1.45等）。「2物件で同値」は
 *                「このテンプレートの既定値」を示すにすぎず、業界標準・真の物件不変を意味しない。
 *                3物件目で崩れうる（回帰ガードとして扱い、過信しない）
 *   物件依存    : 両物件で値が違う。ハードコードのままだと別物件で必ずずれる
 *   要確認      : 片方の物件にしか対応部位が無く、判定材料が足りない
 *
 * 【重要】「2物件一致」でもエンジンの値がXLSと一致しているとは限らない（別問題）。
 *   両方を別々に出す: engine_vs_xls（エンジン値の正しさ）と 2物件一致/依存（汎用性）。
 *
 * 実行: node scripts/check-engine-constants.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import {
  MAJIKIRI_TIMBER_M_PER_SQM, CEILING_FRAME_M_PER_SQM, DOBUCHI_M_PER_SQM, TIMBER_SECTIONS,
} from '../src/services/timberVolume.js';
import { DEFAULT_SOUND_WALL_PAIRS } from '../src/services/buildupCalculator.js';

// ============================================================
// XLS実測値（両物件の集計表X列・タイプ別シートを2026-07-24にダンプして転記）
// ============================================================
// 集計表の「行番号」は両物件で同じテンプレートだが**ラベルは行ごとに違う**
// （例: 81行はアルファ=遮音壁耐水PB(1.4) / 別府=天井（耐水ＰＢ）(1.45)）。
// よって行番号ではなく**ラベルで突合**した値をここに置く。
const XLS = {
  // --- 換算係数（面積㎡ → 発注枚数） ---
  '壁PB 換算': { alpha: 1.4, beppu: 1.4, unit: '㎡/枚', source: "集計表X56「壁（ボード）ＰＢ ｔ-9.5」両物件" },
  '壁耐水PB 換算': { alpha: 1.4, beppu: 1.4, unit: '㎡/枚', source: '集計表X58「壁（ﾎﾞ-ﾄﾞ）耐水ＰＢ ｔ-9.5」両物件' },
  '遮音壁PB 換算': { alpha: 1.4, beppu: 1.4, unit: '㎡/枚', source: '集計表X54「遮音壁ＰＢ張り t9.5+GW」両物件' },
  '天井PB 換算': { alpha: 1.45, beppu: 1.45, unit: '㎡/枚', source: '集計表X77「天井（ボード）ＰＢ ｔ-9.5」両物件' },
  '下り天井PB 換算': { alpha: 1.45, beppu: 1.45, unit: '㎡/枚', source: '集計表X75「天井(下り）」両物件' },
  '界壁PB 換算': { alpha: 1.5, beppu: 1.5, unit: '㎡/枚', source: 'アルファX85「界壁面」/ 別府X85「部分界壁」（※エンジンは固定3枚・面積換算せず）' },
  '防露壁PB 換算': { alpha: 1.5, beppu: 1.5, unit: '㎡/枚', source: 'アルファX62「防露壁面」/ 別府X62「防露ふかし壁（ＰＢ）」（※エンジンは固定1枚・面積換算せず）' },
  '収納面PB 換算': { alpha: 1.45, beppu: null, unit: '㎡/枚', source: "アルファX73「ｸﾛｰｾﾞｯﾄ内RC面」/ 別府の同行は「界壁（耐水ＰＢ）」1.5で別部位（※エンジンは固定5枚・面積換算せず）" },
  // 実測置換されるEV/防露壁面。XLS X62=1.5だがエンジンは1.4流用 → -6.7%（既知A-4）
  'EV廻り壁PB 換算': { alpha: 1.5, beppu: 1.5, unit: '㎡/枚', source: 'アルファX62「防露壁面」(1.5) / 別府X30「EV面遮音壁（界壁）」(1.5)・X62「防露ふかし壁」(1.5)' },

  // --- 材積係数（拾い面積㎡ → 発注材積m³） ---
  '間仕切下地 材積係数': { alpha: 0.0116, beppu: 0.0116, unit: 'm³/㎡', source: '集計表X52「間仕切下地(木) ４５ｘ30＠４５０」両物件' },
  '天井下地 材積係数': { alpha: 0.0081, beppu: 0.0081, unit: 'm³/㎡', source: '集計表X76/X78（天井ボード行の直下）両物件' },
  '木胴縁 材積係数': { alpha: 0.0098, beppu: 0.0098, unit: 'm³/㎡', source: '集計表X63/X86（界壁・防露の直下）両物件' },
  '際根太 材積係数': { alpha: 0.00135, beppu: null, unit: 'm³/m', source: 'アルファX9「際根太(木) ４５ｘ３0」/ 別府X9=0（係数行なし・規格H110）' },

  // --- 下地高（床仕上げ面〜上階スラブ下端） ---
  '下地高（一般部）': { alpha: 2.57, beppu: 2.72, unit: 'm', source: "アルファ'Ａタイプ'!E123等 / 別府Ａ〜Ｇタイプ（Ｈ・Ｉは2.86）" },
  '下地高（水回り）': { alpha: 2.77, beppu: 2.82, unit: 'm', source: "アルファ'Ａタイプ'!H339等 / 別府Ａ〜Ｇタイプ（Ｈ・Ｉは2.86）" },

  // --- 仕様・部位構成 ---
  // 【木製巾木 高さは「物件依存」ではない（2026-07-24再検証・両XLSのＡタイプ巾木ブロックを全数照合）】
  //   アルファ0919 'Ａタイプ': r14=H=40(P4.8m) / r122=H=60 / r176=H=60 / r230=H=60 / r283=H=60
  //   別府      'Ａタイプ': r14=H=60(P9.05) / r122=H=60 / r176=H=60 / r230=H=60 / r283=H=60
  //   → **両物件とも主要部はH=60**。アルファでH=40なのは玄関ブロック(r14)の4.8m
  //     （巾木合計56.44m中8.5%）のみ。集計表46行のラベルは「H=40」だが、そのC46=56.44mは
  //     H=40(4.8m)+H=60(51.64m)を合算した値（値の内訳はブロックがH=60主体）。
  //   よって旧「物件依存（アルファ40/別府60）」ラベルは誤り。物件依存カテゴリからは外し、
  //   下記の別枠ノート（HABAKI_HEIGHT_NOTE）で「集計表ラベルH=40 vs ブロック実態H=60主体」の
  //   **表記食い違い**として要けいとさん確認事項に回す。ここでは判定用テーブルに巾木高さは載せない。
  '際根太 規格': { alpha: '45×30', beppu: 'H110', unit: '', source: 'アルファ集計表9行 / 別府9行「際根太 H110」' },
  '天井PB ﾊﾟｳﾀﾞｰ･ﾄｲﾚ加算': { alpha: 4, beppu: 0, unit: '枚/戸', source: 'アルファ集計表74行「ﾊﾟｳﾀﾞｰﾙｰﾑ・ﾄｲﾚ天井ﾎﾞｰﾄﾞ」X=36-29=7 / 別府74行=空' },
};

// ============================================================
// 転記元XLSの陳腐化検知（md5・S3）
//   xlsx依存は戻さない（package.json/lockに不在＝Render/CIには存在しないため読み込むと本番ビルドで落ちる）。
//   md5はnode:crypto（Node標準）で計算できるのでxlsx不要。転記元が原本ファイルと一致することだけ確認し、
//   出力ヘッダに source_xls_verified を出す（原本が改訂されたらmd5がずれ、この定数表の陳腐化に気づける）。
//   md5は 2026-07-24 に scripts/check-engine-constants.mjs 実装時点の原本から node:crypto で算出（下記）:
//     alpha0919 (②…R6,09,19.XLS・Gタイプ正解の原本): b874c5bffaba5af31fa925f910944f99 (2298880 bytes)
//     beppu     ((仮称)別府4丁目…R7,03,08.XLS)       : 0961157ad4e984e2d1cb80295ff34b57 (2484224 bytes)
//   原本パスは開発者PC固有（Pictures/zairyoの資料/）で本番には無いため、存在すればmd5を再計算して照合、
//   無ければ記録値をそのまま表示する（CI/本番でも落ちない）。
const SOURCE_XLS = (() => {
  const verified_at = '2026-07-24';
  const recorded = {
    alpha0919: { md5: 'b874c5bffaba5af31fa925f910944f99', bytes: 2298880,
      path: 'C:/Users/81804/Pictures/zairyoの資料/②(仮称)アルファステイツ新宮町（木及び_建材）R6,09,19.XLS' },
    beppu: { md5: '0961157ad4e984e2d1cb80295ff34b57', bytes: 2484224,
      path: 'C:/Users/81804/Pictures/zairyoの資料/20260723084638/(仮称)別府4丁目プロジェクト（木及び_建材）R7,03,08.XLS' },
  };
  // 原本が手元にあれば md5 を再計算して照合（無ければ記録値を表示・落ちない）
  for (const k of Object.keys(recorded)) {
    const e = recorded[k];
    try {
      if (fs.existsSync(e.path)) {
        const actual = crypto.createHash('md5').update(fs.readFileSync(e.path)).digest('hex');
        e.match = actual === e.md5;
        if (!e.match) e.actual = actual; // ずれたら陳腐化の合図（定数表の再転記が必要）
      } else {
        e.match = null; // 原本なし（CI/本番。記録値のまま扱う）
      }
    } catch {
      e.match = null;
    }
  }
  return { ...recorded, verified_at };
})();

// ============================================================
// エンジンの実値（importして計算・定数表の写しではない）
// ============================================================
const engineMajikiriM3PerSqm = MAJIKIRI_TIMBER_M_PER_SQM * TIMBER_SECTIONS.majikiri.h * TIMBER_SECTIONS.majikiri.d * 1e-6;
const engineCeilingM3PerSqm = CEILING_FRAME_M_PER_SQM * TIMBER_SECTIONS.ceiling.h * TIMBER_SECTIONS.ceiling.d * 1e-6;
const engineDobuchiM3PerSqm = DOBUCHI_M_PER_SQM * TIMBER_SECTIONS.dobuchi.h * TIMBER_SECTIONS.dobuchi.d * 1e-6;
const engineKiwanetaM3PerM = TIMBER_SECTIONS.kiwaneta.h * TIMBER_SECTIONS.kiwaneta.d * 1e-6;

/**
 * チェック対象定数の定義
 *   key            : XLSテーブルのキー
 *   engineName     : エンジン内の定数名（grepできる名前）
 *   engineValue    : エンジンの実値
 *   override       : 物件依存だった場合の吸収手段（null=未対応）
 */
const CONSTANTS = [
  { key: '壁PB 換算', engineName: 'PB_SQM_PER_SHEET (buildupCalculator)', engineValue: 1.4, override: null },
  { key: '壁耐水PB 換算', engineName: 'PB_SQM_PER_SHEET (耐水も同係数)', engineValue: 1.4, override: null },
  { key: '遮音壁PB 換算', engineName: 'PB_SQM_PER_SHEET (遮音も同係数)', engineValue: 1.4, override: null },
  { key: '天井PB 換算', engineName: 'CEILING_PB_SQM_PER_SHEET (materialCalculator:801)', engineValue: 1.45, override: null },
  { key: '下り天井PB 換算', engineName: 'CEILING_PB_SQM_PER_SHEET (下り天井も同係数)', engineValue: 1.45, override: null },
  // 【重要・2026-07-24是正】以下3行は「エンジンに1.5/1.45の換算係数がある」わけではない。
  //   materialCalculator.jsをgrepしても1.5の換算係数は存在しない（1.5のヒットは
  //   WINDOW_OPENING_AREA(96行)とKUTSUZURI_SLIDE_LENGTH(120行)のみで換算とは無関係）。
  //   実体は面積÷係数ではなく **67戸実績からの固定枚数ハードコード**:
  //     materialCalculator.js:845  一部界壁 石膏ボード     = 3枚 '標準3枚（67戸実績）'
  //     materialCalculator.js:856  一部界壁 耐水石膏ボード = 1枚 '標準1枚（67戸実績）'
  //     materialCalculator.js:880  収納面（ｸﾛｾﾞｯﾄ内RC面）  = 5枚 '標準5枚（67戸実績340/67）'
  //   面積からの換算をしていない＝XLS係数と比較する対象が無いのでengineValue:null（差は「—」）。
  //   旧版はここに1.5/1.45を書いて「差+0.0%・物件不変」と出力しており、
  //   **A-4（EV廻り÷1.4 vs XLS 1.5）が解決済みだと誤認させる捏造値だった**。
  { key: '界壁PB 換算', engineName: '（換算なし）一部界壁 石膏ボード=固定3枚 materialCalculator.js:845', engineValue: null, override: null },
  { key: '防露壁PB 換算', engineName: '（換算なし）一部界壁 耐水石膏ボード=固定1枚 materialCalculator.js:856', engineValue: null, override: null },
  { key: '収納面PB 換算', engineName: '（換算なし）収納面PB=固定5枚 materialCalculator.js:880', engineValue: null, override: null },
  // 実測置換される唯一の1.5系部位。2026-07-24にA-4是正: 専用定数 EV_WALL_PB_SQM_PER_SHEET=1.5 を新設し
  // XLS X62(=1.5・アルファ「防露壁面」/ 別府「防露ふかし壁（ＰＢ）」)と一致させた（旧: PB_SQM_PER_SHEET 1.4 流用）
  { key: 'EV廻り壁PB 換算', engineName: 'EV_WALL_PB_SQM_PER_SHEET 1.5 (buildupCalculator.js applyElevationTakeoff)', engineValue: 1.5, override: null },

  { key: '間仕切下地 材積係数', engineName: 'MAJIKIRI_TIMBER_M_PER_SQM×断面 (timberVolume)', engineValue: engineMajikiriM3PerSqm, override: null },
  { key: '天井下地 材積係数', engineName: 'CEILING_FRAME_M_PER_SQM×断面 (timberVolume)', engineValue: engineCeilingM3PerSqm, override: null },
  { key: '木胴縁 材積係数', engineName: 'DOBUCHI_M_PER_SQM×断面 (timberVolume)', engineValue: engineDobuchiM3PerSqm, override: null },
  { key: '際根太 材積係数', engineName: 'TIMBER_SECTIONS.kiwaneta 45×30 (timberVolume)', engineValue: engineKiwanetaM3PerM, override: null },

  { key: '下地高（一般部）', engineName: 'STUD_HEIGHT_M (buildupCalculator)', engineValue: 2.57, override: 'opts.studHeight.default_mm' },
  { key: '下地高（水回り）', engineName: 'STUD_HEIGHT_WET_M (buildupCalculator)', engineValue: 2.77, override: 'opts.studHeight.wet_mm / by_room' },

  // 木製巾木 高さは物件依存ではない（両物件H=60主体）ので判定テーブルから除外。HABAKI_HEIGHT_NOTE参照
  { key: '際根太 規格', engineName: "TIMBER_SECTIONS.kiwaneta.spec 'LVL 30×45'", engineValue: '45×30', override: null },
  { key: '天井PB ﾊﾟｳﾀﾞｰ･ﾄｲﾚ加算', engineName: 'POWDER_TOILET_PB_SHEETS (materialCalculator)', engineValue: 4, override: null },
];

// 遮音壁ルールは「定数」ではなく部屋ペア表だが、最もタイプ依存が強いので別枠で報告する
const SOUND_RULE_NOTE = {
  engineName: 'DEFAULT_SOUND_WALL_PAIRS (buildupCalculator)',
  value: DEFAULT_SOUND_WALL_PAIRS.map((p) => `${p.roomA}↔${p.roomB} ${p.width_mm}mm`).join(' / '),
  override: 'opts.soundWallRule.pairs',
};

// 木製巾木の高さは「物件依存」ではなく別論点（集計表ラベルと拾いブロック実態の食い違い）
const HABAKI_HEIGHT_NOTE = {
  engineName: "巾木の名称・摘要 'H=40'（materialCalculator）",
  // 両物件ともＡタイプの巾木ブロックはH=60主体（r122/r176/r230/r283）。
  // アルファはr14の玄関ブロックのみH=40（0919: P14=4.8m / 巾木合計56.44mの8.5%）。
  finding: '両物件ともH=60主体。アルファの玄関ブロック(r14=4.8m・約8.5%)のみH=40',
  conflict: '集計表46行のラベルは「H=40」だがそのC46=56.44mはH=40(4.8m)+H=60(51.64m)の合算。'
    + '見積明細/CLAUDE.mdの「木製巾木 H=40」3,615mとも整合しない（集計表ブロック実態はH=60主体）。',
  action: 'エンジンの摘要H=40が主要部H=60と食い違う → **要けいとさん確認**。物件依存ではないので'
    + '物件別overrideではなく「正しい高さ表記の確定」が論点',
};

// ============================================================
// 判定
// ============================================================
function classify(x) {
  if (x.alpha == null || x.beppu == null) return '要確認';
  // n=2の弱い証拠。「物件不変」ではなく「2物件一致（同一テンプレート由来の可能性）」と表現する
  return String(x.alpha) === String(x.beppu) ? '2物件一致' : '物件依存';
}

function diffPct(engine, xls) {
  if (typeof engine !== 'number' || typeof xls !== 'number' || xls === 0) return null;
  return (engine / xls - 1) * 100;
}

const rows = CONSTANTS.map((c) => {
  const x = XLS[c.key];
  const verdict = classify(x);
  // エンジン値との照合はアルファ基準（エンジンはアルファで作られたため）。
  // アルファに対応部位が無い場合は別府を基準にする
  const base = x.alpha != null ? x.alpha : x.beppu;
  const d = diffPct(c.engineValue, base);
  return { ...c, xls: x, verdict, diff: d, base };
});

const fmt = (v) => {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
  return String(v);
};

// 全角文字は等幅コンソールで2桁分の幅を取るため、表示幅で右詰めする
// （String.padEndは文字数基準なので日本語ラベルの列がずれる）
const isWideCp = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf)
  || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff)
  || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6);
const dispWidth = (s) => [...String(s)].reduce((w, ch) => w + (isWideCp(ch.codePointAt(0)) ? 2 : 1), 0);
const padDisp = (s, w) => String(s) + ' '.repeat(Math.max(1, w - dispWidth(s)));

console.log('=== エンジン定数の物件横断チェック ===');
console.log('比較元: アルファステイツ新宮町XLS / 別府4丁目プロジェクトXLS（集計表X列・タイプ別シート）');
console.log('※ 実AI呼び出しなし・XLS読み込みなし（転記済み定数表との突合）');
const xlsStatus = (e) => e.match === true ? 'md5一致✅' : e.match === false ? `md5不一致⚠(原本改訂=陳腐化: ${e.actual})` : '原本なし(記録値使用)';
console.log(`※ 転記元XLS: alpha0919 ${SOURCE_XLS.alpha0919.md5} [${xlsStatus(SOURCE_XLS.alpha0919)}]`);
console.log(`             beppu     ${SOURCE_XLS.beppu.md5} [${xlsStatus(SOURCE_XLS.beppu)}]`);
console.log(`  source_xls_verified: ${SOURCE_XLS.verified_at}（このmd5の原本から転記。md5がずれたら定数表を再転記）`);
console.log('※ **判定はn=2（2物件のみ）の弱い証拠**。両XLSは同一テンプレートの使い回しで、');
console.log('  「2物件一致」は業界標準ではなくテンプレート既定値を示すにすぎない（3物件目で崩れうる）\n');

const W = [30, 11, 11, 11, 10, 10];
const head = ['定数（部位）', 'アルファ', '別府', 'エンジン', '差', '判定'];
console.log(head.map((h, i) => padDisp(h, W[i])).join(''));
console.log('-'.repeat(W.reduce((a, b) => a + b, 0)));

let invariant = 0, dependent = 0, unknown = 0;
for (const r of rows) {
  const d = r.diff == null ? '—' : ((r.diff >= 0 ? '+' : '') + r.diff.toFixed(1) + '%');
  console.log([
    r.key, fmt(r.xls.alpha), fmt(r.xls.beppu), fmt(r.engineValue), d, r.verdict,
  ].map((c, i) => padDisp(c, W[i])).join(''));
  if (r.verdict === '2物件一致') invariant++;
  else if (r.verdict === '物件依存') dependent++;
  else unknown++;
}

console.log(`\n集計: 2物件一致 ${invariant} / 物件依存 ${dependent} / 要確認 ${unknown}（いずれもn=2）`);

// ---- 物件依存の定数: overrideの有無 ----
console.log('\n=== 物件依存の定数（他物件に出すと必ずずれる） ===');
const deps = rows.filter((r) => r.verdict === '物件依存');
if (deps.length === 0) console.log('  なし');
for (const r of deps) {
  const status = r.override ? `✅ override対応済み: ${r.override}` : '❌ **未対応**（ハードコードのまま）';
  console.log(`  ・${r.key}  ${r.engineName}`);
  console.log(`      アルファ ${fmt(r.xls.alpha)} / 別府 ${fmt(r.xls.beppu)} ${r.xls.unit}   ${status}`);
  console.log(`      出典: ${r.xls.source}`);
}
console.log(`  ・住戸内遮音壁ルール  ${SOUND_RULE_NOTE.engineName}`);
console.log(`      現在値: ${SOUND_RULE_NOTE.value}（アルファGタイプ専用の部屋ペア）`);
console.log(`      ✅ override対応済み: ${SOUND_RULE_NOTE.override}（未指定だと他物件で誤発火しうる）`);

// ---- 2物件一致だがエンジン値がXLSと違うもの（＝精度のズレ） ----
console.log('\n=== 2物件一致だがエンジン値がXLSとズレている定数（汎用性ではなく精度の問題） ===');
const mism = rows.filter((r) => r.verdict === '2物件一致' && r.diff != null && Math.abs(r.diff) > 0.5);
if (mism.length === 0) console.log('  なし');
for (const r of mism) {
  console.log(`  ・${r.key}  エンジン ${fmt(r.engineValue)} vs XLS ${fmt(r.base)} ${r.xls.unit} = ${(r.diff >= 0 ? '+' : '') + r.diff.toFixed(1)}%`);
  console.log(`      ${r.engineName}`);
  console.log(`      出典: ${r.xls.source}`);
  if (r.key === 'EV廻り壁PB 換算') {
    console.log('      ⚠ 既知A-4: EV/防露壁面PBの実測置換が PB_SQM_PER_SHEET(1.4) で割られている（正: X62=1.5）。');
    console.log('        「一部界壁/収納面」の固定枚数(3/1/5枚)は面積換算していないため差は「—」だが、');
    console.log('        別府では固定3枚が9タイプ全部に一律で出る（別府は部分界壁X85=1.5が実在するのに未反映）。');
  }
}

// ---- 木製巾木 高さ（物件依存ではない別論点）----
console.log('\n=== 木製巾木の高さ（物件依存ではない・集計表ラベルと拾い実態の食い違い） ===');
console.log(`  ・${HABAKI_HEIGHT_NOTE.engineName}`);
console.log(`      所見: ${HABAKI_HEIGHT_NOTE.finding}`);
console.log(`      食い違い: ${HABAKI_HEIGHT_NOTE.conflict}`);
console.log(`      → ${HABAKI_HEIGHT_NOTE.action}`);

// ---- 要確認 ----
console.log('\n=== 要確認（片方の物件にしか対応部位が無く判定材料が足りない） ===');
const unk = rows.filter((r) => r.verdict === '要確認');
if (unk.length === 0) console.log('  なし');
for (const r of unk) {
  console.log(`  ・${r.key}  ${r.engineName}`);
  console.log(`      アルファ ${fmt(r.xls.alpha)} / 別府 ${fmt(r.xls.beppu)}   出典: ${r.xls.source}`);
}

// ---- クランプ帯（materialCalculatorの実績レンジ）の別府適合性 ----
// 従来パス（展開図なし）の Math.min(Math.max(...)) はアルファ/けいとさん実績のレンジ。
// 別府の正解値がこの帯に収まるかを見ると「他物件で頭打ちになる定数」が分かる
console.log('\n=== 実績レンジのクランプが別府9タイプに当たるか（従来パス・materialCalculator） ===');
const here = path.dirname(fileURLToPath(import.meta.url));
const truth = JSON.parse(fs.readFileSync(path.join(here, 'beppu-9types-ground-truth.json'), 'utf8'));
const TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

const CLAMPS = [
  { label: '天井PB 枚数', line: 'materialCalculator.js:817', min: 20, max: 50,
    value: (t) => truth.types[t].parts['天井PB'].area_or_length / 1.45 },
  { label: '壁PB 枚数', line: 'materialCalculator.js:769', min: 30, max: 90,
    value: (t) => truth.types[t].parts['壁PB'].area_or_length / 1.4 },
  { label: '壁耐水PB 枚数', line: 'materialCalculator.js:783', min: 2, max: 7,
    value: (t) => truth.types[t].parts['壁耐水PB'].area_or_length / 1.4 },
  { label: '巾木 長さ(m)', line: 'materialCalculator.js:1238', min: 30, max: 60,
    value: (t) => truth.types[t].parts['巾木'].area_or_length },
  { label: '間仕切GW(㎡)', line: 'materialCalculator.js:912', min: 5, max: 15,
    value: (t) => truth.types[t].parts['間仕切GW'].area_or_length },
];

for (const c of CLAMPS) {
  const hits = TYPES.map((t) => ({ t, v: c.value(t) })).filter((x) => x.v < c.min || x.v > c.max);
  const vals = TYPES.map((t) => c.value(t));
  const range = `${Math.min(...vals).toFixed(1)}〜${Math.max(...vals).toFixed(1)}`;
  if (hits.length === 0) {
    console.log(`  ✅ ${padDisp(c.label, 20)} クランプ[${c.min}, ${c.max}] 別府実測 ${range} → 全9タイプ帯内`);
  } else {
    const detail = hits.map((h) => `${h.t}=${h.v.toFixed(1)}`).join(' ');
    console.log(`  ❌ ${padDisp(c.label, 20)} クランプ[${c.min}, ${c.max}] 別府実測 ${range} → ${hits.length}/9タイプが帯外: ${detail}`);
    console.log(`       ${c.line}  ハードコードのクランプで頭打ち/底上げされる`);
  }
}
console.log('\n  ※ クランプの効き方（2026-07-24是正・「展開図ありなら影響しない」は不正確だった）:');
console.log('    (1) 天井PB(materialCalculator.js:817 min20/max50)は**展開図があっても必ず効く**。');
console.log('        applyElevationTakeoffは天井PB行にset()を持たない（buildupCalculator.js:1212-1312に');
console.log('        「天井」への置換は0件）ため、実測モードでも天井PBは従来パスの枚数＝クランプ後の値。');
console.log('        別府H=65.3枚/I=70.9枚は展開図ありでも50枚で頭打ち（-23.4%/-29.5%）。');
console.log('    (2) サニティNG時（projects.js:978-1000のvalidateTakeoffSanity不合格）は実測を採用せず');
console.log('        materialCalculatorの推定値へフォールバック → その経路では壁PB/巾木/GW等の');
console.log('        クランプも効く（アルファAタイプで発火実績あり）。');
console.log('    → 「展開図あり＝クランプ無効」は誤り。天井PBは常時、他部位もサニティNG時に効く。');

// このスクリプトはレポートであり合否判定はしない（exit 0固定）。
// 「物件依存が増えた/減った」を検知したい場合はCONSTANTS表を更新すること
//
// 【次サイクル申し送り（src変更を要する・今回はレポートのみ）】
//  - S2: buildupCalculator.js:66 のコメント「業界標準で物件不変のため」も同じ過信。
//    n=2かつ同一テンプレート由来なので「2物件のXLSで一致（テンプレート既定値）」へ表現を弱めるべき。
//  - M2/A-4: 【2026-07-24 是正済み】EV/防露壁面PBの換算に EV_WALL_PB_SQM_PER_SHEET=1.5 を新設し
//    XLS X62=1.5 に一致させた（旧: PB_SQM_PER_SHEET 1.4 流用）。
//    【残・別府固有の申し送り】別府では部分界壁X85=1.5が実在するのに未反映（一部界壁が9タイプ一律固定3枚）。
//    今回のスコープ外（アルファのEV廻り換算のみ是正）。別府の界壁の面積換算化は別サイクル。
//  - M1: 木製巾木の摘要 'H=40'（materialCalculator）が集計表ブロック実態のH=60主体と食い違う。
//    正しい高さ表記の確定（要けいとさん確認）→ 摘要修正。
//  - S1: 天井PBのクランプ[20,50]が別府H/Iで頭打ち。物件横断で使うなら上限の見直し or override化。
process.exit(0);
