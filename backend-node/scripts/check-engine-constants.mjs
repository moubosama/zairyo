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
  MAJIKIRI_M3_PER_SQM, CEILING_M3_PER_SQM, DOBUCHI_M3_PER_SQM, TIMBER_SECTIONS,
} from '../src/services/timberVolume.js';
import {
  DEFAULT_SOUND_WALL_PAIRS, KAIBE_FACE_HEIGHT_M, KAIBE_WALL_SQM_ALPHA,
  CLOSET_PB_SQM_PER_SHEET,
} from '../src/services/buildupCalculator.js';
// クランプ判定は定数表の転記ではなく**実際にエンジンを走らせて**行う（2026-07-24）
import { calculateMaterials, KIWANETA_RATIO_ALPHA } from '../src/services/materialCalculator.js';

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
  // 2026-07-25 面積換算化: エンジンは固定5枚→収納面RC拾い面積÷X73(1.45)へ。別府は収納面PBの概念が無く
  //   同行は「界壁（耐水ＰＢ）」1.5で別部位＝物件依存。別府は overrides.closet_rc_sqm='0' で0枚にする
  '収納面PB 換算': { alpha: 1.45, beppu: null, unit: '㎡/枚', source: "アルファX73「ｸﾛｰｾﾞｯﾄ内RC面」/ 別府の同行は「界壁（耐水ＰＢ）」1.5で別部位（別府は収納面PB無し＝override closet_rc_sqm=0）" },
  // 実測置換されるEV/防露壁面。XLS X62=1.5だがエンジンは1.4流用 → -6.7%（既知A-4）
  'EV廻り壁PB 換算': { alpha: 1.5, beppu: 1.5, unit: '㎡/枚', source: 'アルファX62「防露壁面」(1.5) / 別府X30「EV面遮音壁（界壁）」(1.5)・X62「防露ふかし壁」(1.5)' },

  // --- 材積係数（拾い面積㎡ → 発注材積m³） ---
  '間仕切下地 材積係数': { alpha: 0.0116, beppu: 0.0116, unit: 'm³/㎡', source: '集計表X52「間仕切下地(木) ４５ｘ30＠４５０」両物件' },
  '天井下地 材積係数': { alpha: 0.0081, beppu: 0.0081, unit: 'm³/㎡', source: '集計表X76/X78（天井ボード行の直下）両物件' },
  // 適用先まで確定（2026-07-24）: 集計表X86は界壁面行r85に Y85{=W85*X$86} で掛かる。
  //   アルファ W85=45.423㎡（C85='Ａタイプ'!P158+P212+P264+P321=5.047㎡/戸）→ 0.4451454m³（AJ列=軸組み）
  //   別府     W85=122.1288㎡（行ラベル「部分界壁 ｔ9.5+木胴縁」）→ 1.19686224m³
  //   ※X63も同値0.0098だが適用先は防露壁面行(r62)で、木胴縁の行ではない
  '木胴縁 材積係数': { alpha: 0.0098, beppu: 0.0098, unit: 'm³/㎡', source: '集計表X86→界壁面r85（アルファ「界壁面」/別府「部分界壁」）両物件' },
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
  // 界壁面（木胴縁の拾い対象）の高さ。アルファは界壁専用の2.45（下地高2.57とも壁CH+40=2.44とも違う）、
  // 別府はその物件の下地高をそのまま使う（Ａ〜Ｇ 2.72〜2.73 / Ｈ・Ｉ 2.86）→ 物件依存
  '界壁面 拾い高さ': { alpha: 2.45, beppu: 2.72, unit: 'm', source: "アルファ'Ａタイプ'!K261/K318=2.45 / 別府Ａ〜Ｇタイプ 部分界壁行=2.72（Ｈ・Ｉは2.86）" },
  // 界壁面の拾い**面積**（戸当）。高さ以上に物件・タイプ差が大きく、**界壁が存在しないタイプもある**
  //   アルファG: 'Ａタイプ'!P158+P212+P264+P321 = 5.047㎡/戸
  //   別府 r85「部分界壁 ｔ9.5+木胴縁」戸当: Ａ2.266 / Ｂ0.000 / Ｄ2.040 / Ｅ2.448 / Ｈ17.332 / Ｉ15.902
  //   → エンジンの固定5.047は別府Ａで+123%・Ｈで-71%、Ｂでは実在しない材を計上する（S-2で override 化）
  '界壁面 拾い面積': { alpha: 5.047, beppu: 2.266, unit: '㎡/戸',
    source: "アルファ'Ａタイプ'!P158+P212+P264+P321=5.047（集計表C85）/ 別府r85 戸当 Ａ2.266・Ｂ0.000・Ｄ2.040・Ｅ2.448・Ｈ17.332・Ｉ15.902" },
  // 際根太は「規格」だけでなく**長さ係数・材積換算の有無もセットで物件依存**（2026-07-24）。
  //   規格だけ差し替えても数量が-60〜76%のままになるため、3項目を1プロファイルとして扱う
  //   （materialCalculator.resolveKiwanetaProfile）。
  '際根太 規格': { alpha: '45×30', beppu: 'H110', unit: '', source: 'アルファ集計表9行「際根太(木) ４５ｘ３0」/ 別府9行「際根太 H110」' },
  // 長さ係数: 床面積あたりの際根太m。**入れる範囲の設計思想が違う**（アルファ=水回り+玄関の段差部だけ /
  //   別府=住戸のほぼ全周。別府はkiwaneta/巾木=1.05〜1.31で巾木と同オーダー）＝3.5〜4.6倍差。
  //   床面積は別府正解JSONに専有が無いため天井PB面積÷0.88で逆算（CEILING_TO_FLOORと同じ根拠）
  '際根太 長さ係数': { alpha: 0.2768, beppu: 1.066, unit: 'm/㎡',
    source: 'アルファ集計表C9=18.2m÷床65.76㎡（内訳 玄関5.7+便所4.0+洗面8.5）'
      + ' / 別府集計表9行 戸当 Ａ80.9・Ｂ47.2・Ｃ67.0・Ｄ67.9・Ｅ72.7・Ｆ74.2・Ｇ96.4・Ｈ136.9・Ｉ134.18m'
      + '（床面積比 Ａ1.066/Ｂ0.970/Ｃ1.066/Ｄ1.087/Ｅ1.195/Ｆ1.112/Ｇ1.176/Ｈ1.272/Ｉ1.149）' },
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
// 間仕切下地・天井下地の材積は「材長×断面」ではなくXLSの材積係数(m³/㎡)を直接持つ（2026-07-25・案B）。
// 旧: MAJIKIRI_TIMBER_M_PER_SQM(8.89)×断面=0.0120 / CEILING_FRAME_M_PER_SQM(7.05)×断面=0.008457 で
//   XLS 0.0116/0.0081 に対し +3.4%/+4.4% だった → 木胴縁と同じ「拾い面積×材積係数」方式に統一。
const engineMajikiriM3PerSqm = MAJIKIRI_M3_PER_SQM;
const engineCeilingM3PerSqm = CEILING_M3_PER_SQM;
// 木胴縁は「材長×断面」ではなくXLSの材積係数(m³/㎡)を直接持つ（2026-07-24是正）。
// 旧: DOBUCHI_M_PER_SQM(1/0.455)×断面=0.00297 でXLS 0.0098 に対し-69.7%だった
const engineDobuchiM3PerSqm = DOBUCHI_M3_PER_SQM;
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
  { key: '天井PB 換算', engineName: 'CEILING_PB_SQM_PER_SHEET (materialCalculator:991)', engineValue: 1.45, override: null },
  { key: '下り天井PB 換算', engineName: 'CEILING_PB_SQM_PER_SHEET (下り天井も同係数)', engineValue: 1.45, override: null },
  // 【重要・2026-07-24是正】以下2行は「エンジンに1.5の換算係数がある」わけではない。
  //   materialCalculator.jsをgrepしても1.5の換算係数は存在しない（1.5のヒットは
  //   WINDOW_OPENING_AREA(96行)とKUTSUZURI_SLIDE_LENGTH(120行)のみで換算とは無関係）。
  //   実体は面積÷係数ではなく **67戸実績からの固定枚数ハードコード**:
  //     一部界壁 石膏ボード     = 3枚 '標準3枚（67戸実績）'
  //     一部界壁 耐水石膏ボード = 1枚 '標準1枚（67戸実績）'
  //   （行番号は grep '標準N枚（67戸実績' で実測。実装を動かしたら取り直すこと）
  //   面積からの換算をしていない＝XLS係数と比較する対象が無いのでengineValue:null（差は「—」）。
  //   旧版はここに1.5/1.45を書いて「差+0.0%・物件不変」と出力しており、
  //   **A-4（EV廻り÷1.4 vs XLS 1.5）が解決済みだと誤認させる捏造値だった**。
  { key: '界壁PB 換算', engineName: '（換算なし）一部界壁 石膏ボード=固定3枚 materialCalculator.js', engineValue: null, override: null },
  { key: '防露壁PB 換算', engineName: '（換算なし）一部界壁 耐水石膏ボード=固定1枚 materialCalculator.js', engineValue: null, override: null },
  // 収納面PBは 2026-07-25 に面積換算化（固定5枚→収納面RC拾い面積÷X73=1.45）。
  //   推定パス: materialCalculator.js（CLOSET_PB_SQM_PER_SHEET・overrides.closet_rc_sqm='0'で別府0枚）
  //   実測パス: buildupCalculator.js applyElevationTakeoff（konpane_sqm÷1.45）
  { key: '収納面PB 換算', engineName: 'CLOSET_PB_SQM_PER_SHEET 1.45 (収納面RC÷X73・overrides.closet_rc_sqm)', engineValue: CLOSET_PB_SQM_PER_SHEET, override: 'closet_rc_sqm' },
  // 実測置換される唯一の1.5系部位。2026-07-24にA-4是正: 専用定数 EV_WALL_PB_SQM_PER_SHEET=1.5 を新設し
  // XLS X62(=1.5・アルファ「防露壁面」/ 別府「防露ふかし壁（ＰＢ）」)と一致させた（旧: PB_SQM_PER_SHEET 1.4 流用）
  { key: 'EV廻り壁PB 換算', engineName: 'EV_WALL_PB_SQM_PER_SHEET 1.5 (buildupCalculator.js applyElevationTakeoff)', engineValue: 1.5, override: null },

  { key: '間仕切下地 材積係数', engineName: 'MAJIKIRI_M3_PER_SQM (timberVolume・XLS X52直接)', engineValue: engineMajikiriM3PerSqm, override: null },
  { key: '天井下地 材積係数', engineName: 'CEILING_M3_PER_SQM (timberVolume・XLS X78直接)', engineValue: engineCeilingM3PerSqm, override: null },
  { key: '木胴縁 材積係数', engineName: 'DOBUCHI_M3_PER_SQM (timberVolume)', engineValue: engineDobuchiM3PerSqm, override: null },
  // 別府はX9=0＝**材積換算そのものをしない**（mのまま発注）。係数を0にするのではなく
  // 材積(m³)行を出さないのが正 → overrides.kiwaneta_volume='なし' で行ごと抑止できる（2026-07-24）
  { key: '際根太 材積係数', engineName: 'TIMBER_SECTIONS.kiwaneta 45×30 (timberVolume)', engineValue: engineKiwanetaM3PerM,
    override: "overrides.kiwaneta_volume='なし'（別府X9=0＝材積行を出さない）" },

  { key: '下地高（一般部）', engineName: 'STUD_HEIGHT_M (buildupCalculator)', engineValue: 2.57, override: 'opts.studHeight.default_mm' },
  { key: '下地高（水回り）', engineName: 'STUD_HEIGHT_WET_M (buildupCalculator)', engineValue: 2.77, override: 'opts.studHeight.wet_mm / by_room' },

  // 木製巾木 高さは物件依存ではない（両物件H=60主体）ので判定テーブルから除外。HABAKI_HEIGHT_NOTE参照
  // 配線（S-3・2026-07-24）: どちらも Override テーブル → parseKaibeWallOverrides（projects.js）→
  //   computeElevationTakeoff の opts.kaibeWall として本番 /calculate 経路に届く。
  //   面積は materialCalculator の推定行（実測なし時）も overrides.kaibe_wall_sqm で同時に差し替わる。
  { key: '界壁面 拾い高さ', engineName: 'KAIBE_FACE_HEIGHT_M (buildupCalculator)', engineValue: KAIBE_FACE_HEIGHT_M, override: 'opts.kaibeWall.height_m（Override itemKey=kaibe_wall_height）' },
  { key: '界壁面 拾い面積', engineName: 'KAIBE_WALL_SQM_ALPHA (buildupCalculator・木胴縁の拾い対象)', engineValue: KAIBE_WALL_SQM_ALPHA, override: 'opts.kaibeWall.area_sqm / overrides.kaibe_wall_sqm（別府Ｂ/Ｊは0を指定＝計上しない）' },
  // 際根太は3項目セットでoverride可能（規格だけ直しても数量が-60〜76%のまま＝「対応済み」に見えて危険）。
  // 配線: Override テーブル（itemKey=kiwaneta_*）→ overridesObj → calculateMaterials → resolveKiwanetaProfile
  { key: '際根太 規格', engineName: "際根太行の spec（resolveKiwanetaProfile・既定 KIWANETA_SPEC_ALPHA）", engineValue: '45×30 米栂1等',
    override: "overrides.kiwaneta_spec（別府='H110'）" },
  { key: '際根太 長さ係数', engineName: 'KIWANETA_RATIO_ALPHA / KIWANETA_MIN_M_ALPHA (materialCalculator)', engineValue: KIWANETA_RATIO_ALPHA,
    override: "overrides.kiwaneta_ratio / kiwaneta_min_m（別府='1.07'/'0'。下限18mもアルファ実績で物件依存）" },
  { key: '天井PB ﾊﾟｳﾀﾞｰ･ﾄｲﾚ加算', engineName: 'POWDER_TOILET_PB_SHEETS (materialCalculator)', engineValue: 4, override: 'overrides.ceiling_pb_extra_sheets（別府=0）' },
];

// 遮音壁ルールは「定数」ではなく部屋ペア表だが、最もタイプ依存が強いので別枠で報告する
const SOUND_RULE_NOTE = {
  engineName: 'DEFAULT_SOUND_WALL_PAIRS (buildupCalculator)',
  value: DEFAULT_SOUND_WALL_PAIRS.map((p) => `${p.roomA}↔${p.roomB} ${p.width_mm}mm`).join(' / '),
  override: 'opts.soundWallRule.pairs',
};

// 別府にしか存在しない部位行（アルファ基準で作られたエンジンに対応行が無い）。
// 「際根太本体はoverride対応済み」で片付けると**この行の丸ごと欠落**が見えなくなるため別項目で立てる。
//
// 【2026-07-25 対応】定数のoverrideでは埋まらない（＝行そのものが無い）ケースのために、
//   物件固有の**追加部位行**を外から与える汎用の器 resolveExtraParts を新設した。
//   スラブ下り際根太はその第1号であり、専用のハードコードは作っていない
//   （将来ほかの物件固有部位が出ても extra_part_N_* の指定だけで載る）。
const BEPPU_ONLY_PARTS = [
  {
    key: 'スラブ下り際根太 H=210',
    engineName: 'resolveExtraParts (materialCalculator・物件固有の追加部位行)',
    finding: '別府タイプ別シート r10「スラブ下り際根太 H=210」戸当 Ａ23.3 Ｂ24.1 Ｃ25.7 Ｄ17.9 '
      + 'Ｅ17.3 Ｆ17.4 Ｇ24.3 Ｈ0 Ｉ0 m。際根太本体（r9・H110）とは別の材で、'
      + '水回り等のスラブ下がり部の立ち上がりに入る。集計表X10=0＝材積換算せずmのまま発注',
    alpha: 'アルファには存在しない部位（集計表9行=際根太のみ・B10="" C10=0＝行そのものが無い）',
    status: '✅ override対応済み: overrides.extra_part_1_name/_spec/_qty/_unit'
      + "（別府='ｽﾗﾌﾞ下り際根太'/'H=210'/'23.3'/'m'。Ｈ・Ｉタイプは _qty='0' で行を出力しない）",
    action: 'kiwaneta_spec の流用ではなく独立した追加部位行として実装（H=210は際根太H110と別材・'
      + '数量も別拾いのため兼用してはいけない）。材積は既定で出さず、必要な物件だけ '
      + '_volume=あり + _volume_m3_per_unit で出せる（別府はX10=0なので指定しない）',
    resolved: true,
  },
];

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
    console.log('        「一部界壁」の固定枚数(3/1枚)は面積換算していないため差は「—」だが、');
    console.log('        別府では固定3枚が9タイプ全部に一律で出る（別府は部分界壁X85=1.5が実在するのに未反映）。');
    console.log('        ※収納面PBは2026-07-25に面積換算化済み（÷X73=1.45・別府はoverride closet_rc_sqm=0で0枚）。');
  }
}

// ---- 片方の物件にしか存在しない部位行（定数のoverrideでは埋まらない・行の欠落）----
// 【重要】ここのステータスは**手書きの文字列を信じない**。resolved:true と主張する項目は
//   実際に calculateMaterials を走らせ「指定すると行が出る／0なら出ない／未指定なら出ない」を
//   実測して✅を出す（表の更新忘れ・実装の後退で嘘の✅が残るのを防ぐ）。
console.log('\n=== 片方の物件にしか存在しない部位行（定数のoverrideでは埋まらない） ===');
let onlyPartsNg = 0;
// 検証用の最小入力（別府規模の住戸1戸。数量はoverride指定値がそのまま出るので図面精度に依存しない）
const extraPartPlan = {
  _validated: true, document_type: 'floor_plan', layout_type: '3LDK',
  total_floor_area_sqm: 75.9, total_area_source: 'user_input',
  partition_wall_length_m: 30, ceiling_height_mm: 2400,
  rooms: [{ name: 'リビング・ダイニング', area_sqm: 60, floor_type: 'flooring' },
    { name: 'トイレ', area_sqm: 3 }],
  openings: [], equipment: {},
};
const findRow = (ov, name) => calculateMaterials(extraPartPlan, {}, ov)
  .materials.find((m) => m.name === name && m.unit !== 'm³');
for (const p of BEPPU_ONLY_PARTS) {
  console.log(`  ・${p.key}  ${p.engineName}`);
  console.log(`      所見: ${p.finding}`);
  console.log(`      アルファ: ${p.alpha}`);
  if (p.resolved) {
    // 実測1: 指定すると行が出て、数量が指定値どおり（丸めなし）
    const NAME = 'ｽﾗﾌﾞ下り際根太';
    const spec = { extra_part_1_name: NAME, extra_part_1_spec: 'H=210', extra_part_1_unit: 'm' };
    const got = findRow({ ...spec, extra_part_1_qty: '23.3' }, NAME);
    // 実測2: 0指定なら行そのものが出ない（別府Ｈ・Ｉタイプ＝P104=0）
    const zero = findRow({ ...spec, extra_part_1_qty: '0' }, NAME);
    // 実測3: 未指定なら行が増えない（アルファの既定動作）
    const none = findRow({}, NAME);
    const ok = got && got.quantity === 23.3 && got.spec === 'H=210' && got.unit === 'm'
      && !zero && !none;
    if (ok) {
      console.log(`      ${p.status}`);
      console.log(`      実測: 指定23.3m→行あり(${got.quantity}${got.unit} ${got.spec}) / `
        + '0指定→行なし / 未指定→行なし ✅');
    } else {
      onlyPartsNg++;
      console.log('      ❌ **実測NG**（表では対応済みだが実装が伴っていない）: '
        + `指定=${got ? `${got.quantity}${got.unit}` : 'なし'} / 0指定=${zero ? 'あり' : 'なし'} / `
        + `未指定=${none ? 'あり' : 'なし'}`);
    }
  } else {
    onlyPartsNg++;
    console.log(`      ${p.status}`);
  }
  console.log(`      → ${p.action}`);
}
console.log(`\n  片方の物件にしか無い部位行の判定: ❌ ${onlyPartsNg} 件（0件が完了条件）`);

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
  // 「判定材料不足」でもoverrideで吸収済みのものがある（例: 際根太の材積換算は別府X9=0＝
  // 換算しないという**運用の違い**であって係数の大小ではない）。overrideの有無を必ず併記する
  if (r.override) console.log(`      ✅ override対応済み: ${r.override}`);
}

// ---- クランプ帯（materialCalculatorの実績レンジ）の別府適合性 ----
// 従来パス（展開図なし）の頭打ちが別府9タイプの実測を弾かないかを見る。
// 【2026-07-24 の改修】旧版は「エンジンのクランプ帯」をこのファイルに転記した定数表と
//   別府実測を突き合わせるだけで、**実装を見ていなかった**（実装を直しても表を更新しなければ
//   古い帯を報告し続ける／実装に無いクランプを報告しうる）。
//   → クランプを比率型サニティへ置換したのを機に、**実際に materialCalculator を実行して
//     出力が別府実測に届くか**を判定する方式へ変更した（定数表の転記ではなく実測）。
console.log('\n=== 実績レンジのクランプが別府9タイプに当たるか（従来パス・materialCalculator実行） ===');
const here = path.dirname(fileURLToPath(import.meta.url));
const truth = JSON.parse(fs.readFileSync(path.join(here, 'beppu-9types-ground-truth.json'), 'utf8'));
const TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

// 別府タイプの床面積: 正解JSONには専有面積が無いため、天井面積÷0.88 で逆算する。
//   天井/専有比0.88は両物件で収束（アルファG 59.087/67.3=0.878・別府H 94.71/107.9=0.878・
//   別府I 102.786/117.1=0.878。test-ceiling-pb-clamp.mjs のコメント参照）。
const CEILING_TO_FLOOR = 0.88;
const floorSqmOf = (t) => truth.types[t].parts['天井PB'].area_or_length / CEILING_TO_FLOOR;

// 「頭打ちしていないか」を実測するための入力。部位の推定式が使う入力
// （床面積・水回り面積・間仕切壁延長）を別府タイプの規模で与える。
//   ※ これは**エンジンの出力が正解に一致するかの精度検証ではない**（別府の図面読み取り結果は
//     存在せず、合成入力で正解を再現したと言うのは答え合わせになる）。ここで見るのは
//     「上限に張り付いて実測値へ到達できない状態か否か」だけ。
function beppuLikeFloorPlan(t) {
  const floor = floorSqmOf(t);
  // 水回り面積は壁耐水PBの実測から逆算せず、住戸規模に対する一般的な比（床の10%）を置く。
  //   正解から作ると答え合わせになるため。
  const wetSqm = floor * 0.10;
  return {
    _validated: true,
    layout_type: '3LDK',
    total_floor_area_sqm: floor,
    total_area_source: 'user_input',   // 専有面積を入力した通常運用（sanityBase=declared）
    partition_wall_length_m: floor * 0.4, // 推定式と同じ目安（PARTITION_WALL_RATIO）
    ceiling_height_mm: 2400,
    rooms: [
      { name: 'リビング・ダイニング', area_sqm: floor - wetSqm, floor_type: 'flooring' },
      { name: 'パウダールーム', area_sqm: wetSqm * 0.5 },
      { name: 'トイレ', area_sqm: wetSqm * 0.5 },
    ],
    openings: [], equipment: {},
  };
}

// 判定対象: 旧クランプが掛かっていた4部位。
//   engine  = materialCalculator の出力（従来パス）
//   truthVal= 別府XLSの実測（この値に「届きうるか」＝上限で潰されていないか を見る）
//   fields  = **この部位に紐づく**警告フィールド（2026-07-24 S-1）。
//     旧版は /excessive|floor_area_inflated/ で全警告を横断マッチしていたため
//     ①1部位が抑制されると無関係の3部位も❌になり ②部位の抑制を検出したつもりが
//     実際は別部位の警告を見ていた。fieldを部位に紐づけて判定する。
const CLAMPED_PARTS = [
  { label: '壁PB 枚数', row: '壁 石膏ボード',
    // MF-1で部位絶対上限 wall_pb_absolute_cap を追加したので抑制検出の対象に含める
    // （含め忘れると「上限が実在物件を弾いている」のを検出できず、M-2で撤去した旧クランプと同じ事故になる）
    fields: ['wall_pb_sheets_excessive', 'wall_pb_absolute_cap'],
    truthVal: (t) => truth.types[t].parts['壁PB'].area_or_length / 1.4,
    was: '[30, 90]枚', now: '層1（床面積の是正）+ 絶対上限120枚（MF-1。床面積比capは到達不能のため撤去・M-2）' },
  { label: '壁耐水PB 枚数', row: '壁 耐水石膏ボード',
    fields: ['waterproof_pb_sheets_excessive'],
    truthVal: (t) => truth.types[t].parts['壁耐水PB'].area_or_length / 1.4,
    was: '[2, 7]枚', now: '床面積比 0.4㎡/㎡ ÷1.6562（+絶対上限40枚）' },
  { label: '巾木 長さ(m)', row: '木製巾木',
    fields: ['habaki_length_excessive', 'habaki_absolute_cap'], // MF-1の絶対上限も検出対象に
    truthVal: (t) => truth.types[t].parts['巾木'].area_or_length,
    was: '[30, 60]m', now: '層1（床面積の是正）+ 絶対上限130m（MF-1。床面積比capは到達不能のため撤去・M-2）' },
  { label: '間仕切GW(㎡)', row: '間仕切 グラスウール充填',
    fields: ['glasswool_area_excessive'],
    truthVal: (t) => truth.types[t].parts['間仕切GW'].area_or_length,
    was: '[5, 15]㎡', now: '床面積比 1.2㎡/㎡（+絶対上限150㎡）' },
];

// 各タイプを1回だけ計算して使い回す
const beppuCalc = Object.fromEntries(TYPES.map((t) => [t, calculateMaterials(beppuLikeFloorPlan(t), {}, {})]));
const rowQty = (calc, name) => calc.materials.find((m) => m.name === name)?.quantity;

// 「その部位の数量がガードによって書き換えられた（＝上限に張り付いた）」ときの上限値を得る。
//   警告の before/after で判定するのが最も確実（applyRatioCap は抑制時に必ず before/after を積む）。
const capWarningOf = (calc, fields) => (calc._warnings || [])
  .find((w) => fields.includes(w.field || ''));

// 90%ルール(b)で使う「ガードが無ければ出るはずの値」（unguarded）。
//   materialCalculator の**推定式そのもの**をここで再現し、実出力と突き合わせる。
//   宣言された上限値（0.4/1.2）との一致を見る方式だと「実装が別の値で黙って切っている」バグを
//   取り逃がすため（2026-07-24にフォールト注入で確認: 0.15で黙って切っても上限1.2と一致せず素通り）、
//   **式の生値より小さければ何かが切っている**という向きで判定する。式が変わればここも変える。
const PB_SHEET_SIZE_3x6 = 1.6562;
const UNGUARDED = {
  // 壁PB   = ceil(ceil(床 × 1.37) × 0.6)
  '壁PB 枚数': (fp) => Math.ceil(Math.ceil(fp.floor * 1.37) * 0.6),
  // 耐水PB = ceil(水回り床 ÷ 1.6562 × 1.2)
  '壁耐水PB 枚数': (fp) => Math.ceil(fp.wet / PB_SHEET_SIZE_3x6 * 1.2),
  // 巾木   = max(ceil(床 × 0.82), 間取り別最低値)。3LDK固定入力なので最低50m
  '巾木 長さ(m)': (fp) => Math.max(Math.ceil(fp.floor * 0.82), 50),
  // GW     = ceil(間仕切壁 × 天井高 × 充填率既定0.135)
  '間仕切GW(㎡)': (fp) => Math.ceil(fp.part * fp.ch * 0.135),
};
const unguardedOf = (c, t) => {
  const fn = UNGUARDED[c.label];
  if (!fn) return null;
  const floor = floorSqmOf(t);
  return fn({ floor, wet: floor * 0.10, part: floor * 0.4, ch: 2.4 });
};

let clampNg = 0;
for (const c of CLAMPED_PARTS) {
  // 「上限に張り付いて実測へ到達できないタイプ」を検出する。判定は2条件（S-1でコメント通りに実装）:
  //   (a) **この部位の**抑制警告が出ている（= applyRatioCap が数量を書き換えた）
  //   (b) 警告は出ていないが、エンジン出力が実測の90%未満**かつ**推定式の生値より小さい
  //       （= 実装バグで警告を出し忘れたまま何かに切られているケース。警告への全依存を避ける）
  //   ※ 推定式そのものの精度不足（式の生値が実測より小さい）は別問題なのでここでは扱わない。
  //     見るのは「ガードが実測到達を妨げているか」だけ → (b)は「式の生値 > 実出力」を必須にしている。
  const capped = [];
  for (const t of TYPES) {
    const calc = beppuCalc[t];
    const q = rowQty(calc, c.row);
    const truthVal = c.truthVal(t);
    const w = capWarningOf(calc, c.fields);
    if (w) {
      capped.push(`${t}=${q}(抑制警告 ${w.before}→${w.after})`);
      continue;
    }
    // (b) 90%ルール: 警告なしでも「実測の90%未満」かつ「式の生値より小さい」なら黙って切られている
    const raw = unguardedOf(c, t);
    if (raw != null && q < truthVal * 0.9 && q < raw) {
      capped.push(`${t}=${q}(警告なしで式の生値${raw}から減っている・実測${truthVal.toFixed(1)}の90%未満)`);
    }
  }
  const truthVals = TYPES.map((t) => c.truthVal(t));
  const range = `${Math.min(...truthVals).toFixed(1)}〜${Math.max(...truthVals).toFixed(1)}`;
  const engineVals = TYPES.map((t) => rowQty(beppuCalc[t], c.row));
  const engRange = `${Math.min(...engineVals)}〜${Math.max(...engineVals)}`;
  if (capped.length === 0) {
    console.log(`  ✅ ${padDisp(c.label, 20)} 別府実測 ${range} / エンジン出力 ${engRange} → 抑制ゼロ（上限に張り付くタイプなし）`);
    console.log(`       旧クランプ ${c.was} を撤去 → 現行ガード: ${c.now}`);
  } else {
    clampNg++;
    console.log(`  ❌ ${padDisp(c.label, 20)} 別府実測 ${range} → ${capped.length}/9タイプが抑制される: ${capped.join(' ')}`);
    console.log(`       現行ガード: ${c.now}  上限が実在物件を弾いている（見直しが必要）`);
  }
}
console.log(`\n  クランプ判定: ❌ ${clampNg} 件（0件が完了条件）`);
// 【重要・誤読防止】この判定は「ガードが実測到達を妨げていないか」だけを見る。
//   ✅でも推定式そのものが実測から外れていることはある（=精度の問題で別軸）。
//   特にGWは充填率が物件依存で、既定（アルファ基準0.135）のままだと別府は大幅な過少になる。
//   ここを黙って✅とだけ出すと「別府もこの数量で出せる」と誤読されるので実差を併記する。
{
  const gw = CLAMPED_PARTS.find((c) => c.label === '間仕切GW(㎡)');
  console.log('\n  ── 参考: ガードとは別軸の「推定式の精度」（✅でも実測から外れうる） ──');
  for (const t of TYPES) {
    const q = rowQty(beppuCalc[t], gw.row);
    const tv = gw.truthVal(t);
    console.log(`    別府${t} 間仕切GW エンジン既定 ${String(q).padStart(3)}㎡ vs 実測 ${tv.toFixed(1)}㎡`
      + ` = ${(((q / tv) - 1) * 100).toFixed(0)}%（充填率既定0.135=アルファ基準のため）`);
  }
  console.log('    → 別府を計算するときは overrides.glasswool_coverage=0.5 を指定すること');
  console.log('      （0.5指定時のエンジン出力 24〜57㎡ で実測35.0〜53.6㎡の帯に入る）。');
  console.log('      物件プロファイル（充填率・下地高・天井PB加算の組）としての整備は次サイクル。');
}
console.log('\n  ※ 2026-07-24 に上記4件の絶対値クランプを撤去し、2層のガードへ置換（M-2で設計やり直し済み）。');
console.log('    層1 floor_area_inflated: 「数量計算に使う床面積 vs 信頼できる床面積(sanityBase)」が');
console.log('      比1.25超なら床面積そのものを是正（totalFloorArea/flooringArea/cfArea/tileAreaを一括縮小）。');
console.log('      **全部位が同じ基準になる**唯一の層で、床面積由来の暴走はここで潰す。');
console.log('    層2 部位cap: 床面積とは独立した入力を持つ部位だけに置く。');
console.log('      耐水PB ← cfArea（0.4㎡/㎡・実測max0.161の2.5倍）/ GW ← 間仕切壁延長（1.2㎡/㎡・実測max0.775の1.55倍）。');
console.log('      **壁PB・巾木の「床面積比」capは撤去**: 出力が床面積の固定倍（0.822枚/㎡・0.82m/㎡）で');
console.log('      上限（1.509枚/㎡・1.5m/㎡）と常に比54%＝到達不能な死んだガードだった。');
console.log('      巾木では間取り別の最低値(3LDK=50m)を打ち消す誤発火のみが起きていた（床20㎡で50m→30m）。');
console.log('\n  ※ 層3 部位絶対上限（2026-07-24 MF-1で新設・壁PB120枚 / 巾木130m）:');
console.log('    層0は sanityBase>150㎡、層1は totalFloorArea>sanityBase×1.25 でしか発火しないため、');
console.log('    **declared≤150 かつ roomsSum≤declared×1.25** の帯が両層をすり抜けていた');
console.log('    （実測: decl=150/rooms=187 で壁PB155枚・巾木154mが床面積警告ゼロ。decl=130/rooms=160でも132枚）。');
console.log('    天井PBには絶対上限100枚があり唯一鳴っていたが、壁PB・巾木には防波堤が無かった＝MF-1の穴。');
console.log('    絶対上限は床面積比と違い床面積が伸びれば必ず到達する＝死なない（天井PBの100枚capが機能中なのが実証）。');
console.log('    上限値は別府実測max（壁PB98.4枚・巾木106.9m）の約1.22倍で、9タイプ全てが上限の内側（上表✅）。');
console.log('    ユーザー入力の桁違い（1000㎡→旧790枚・5000㎡→旧3947枚）もここで常識的範囲に収まる（SF-1）。');
console.log('    下限は撤去（別府B 壁PB23.6枚・耐水2.5枚のように実在物件が旧下限を下回る）。');
console.log('      過少側は数量を書き換えず警告のみ（*_small。天井PBの ceiling_pb_area_small と同じ扱い）。');
console.log('    抑制時は _warnings（waterproof_pb_sheets_excessive 等）に出す＝黙って書き換えない。');
console.log('    GWの充填率は物件依存（アルファ=遮音壁のみ0.135 / 別府=全間仕切0.41〜0.78＝7〜8倍差）のため');
console.log('      overrides.glasswool_coverage で差し替え可（既定はアルファ基準0.135）。');
console.log('\n  ※ 天井PB 枚数クランプ[20,50]も 2026-07-24 に撤去済み（41155a2）:');
console.log('    別府H=65.3枚/I=70.9枚を上限50で頭打ちさせ-23.4%/-29.5%の過少を出していたため。');
console.log('    【S-4是正】天井PB独自の「天井面積÷床面積>1.3で床面積×0.88へ抑制」ブランチは');
console.log('    その後のM-1で層1へ統合され**撤去済み**（ceiling_pb_area_inflated は出ない）。');
console.log('    現行の天井PBのガードは (a) 層0/層1で是正された床面積を入力に使う（部位横断の共通是正）');
console.log('    (b) 分母不明時の絶対上限100枚 ceiling_pb_absolute_cap (c) 過少側の情報提供 ceiling_pb_area_small のみ。');
console.log('    別府H/Iは面積換算値そのままで通る（test-ceiling-pb-clamp.mjs）。');
console.log('    パウダー・トイレ加算4枚は overrides.ceiling_pb_extra_sheets で物件別に変更可（別府=0）。');
console.log('\n  ※ 層0 floor_area_implausible（2026-07-24 M-4で新設・層1の非発火経路を塞ぐ）:');
console.log('    層1は「計算に使う床面積 vs sanityBase」の相対比なので、床面積の根拠が片方しか無い');
console.log('    （部屋0件 or 専有面積の入力なし）と sanityBase が検査対象自身になり比が常に≈1.0＝発火不能だった。');
console.log('    → 住戸1戸の物理上限 PLAUSIBLE_MAX_FLOOR_SQM=150㎡ を絶対上限として先に適用する。');
console.log('    未検証の床面積が150㎡超なら150へ丸めて floor_area_implausible を出し、以降の全部位が150ベースになる。');
console.log('    ユーザーが自分で入力した値（total_area_source=user_input）は書き換えず警告のみ');
console.log('    （floor_area_implausible_trusted。大型住戸・二戸一の正当な入力を機械が握り潰さないため）。');
console.log('    実測: 部屋合計200㎡誤読+専有未入力で 壁PB165枚→120枚 / declared1000㎡で790枚→120枚');
console.log('    （層3の部位絶対上限120枚/130mが最終防波堤。3経路とも120枚に収束）。');
console.log('    別府I(床116.8㎡)・別府H(107.6㎡)は150の内側なので実在物件は一切弾かれない（test-clamp-ratio-sanity.mjs 12/13）。');
console.log('\n  ※ ガードの効き方（2026-07-24是正・「展開図ありなら影響しない」は不正確だった）:');
console.log('    (1) 上記4件は従来パス（展開図なし）で常時効く。展開図ありでも実測置換の無い部位は同様。');
console.log('    (2) サニティNG時（projects.js のvalidateTakeoffSanity不合格）は実測を採用せず');
console.log('        materialCalculatorの推定値へフォールバック → その経路では壁PB/巾木/GW等の');
console.log('        ガードも効く（アルファAタイプで発火実績あり）。');
console.log('    → 「展開図あり＝ガード無効」は誤り。実測置換の無い部位は常時、他部位もサニティNG時に効く。');
console.log('\n  ※ 残るハードコード帯（今回スコープ外・実測が無く動かせないもの）:');
console.log('    ・巾木の1LDK上限35m（materialCalculator の間取り別調整）。別府9タイプに1LDKが無く');
console.log('      帯外の実測を確認できないため据え置き。1LDKの拾い出し実測が入り次第見直す。');

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
