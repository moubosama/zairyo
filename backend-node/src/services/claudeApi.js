import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { validateAndNormalize, reconcileDualResults } from './aiReadingValidator.js';
import { collapseDoubledPlacements } from './buildupCalculator.js';
import fs from 'fs';
import path from 'path';

// 読み取りモデル（環境変数で切替可能。コスト比較用: claude-sonnet-5 はopusの約1/5）
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';

/**
 * AIプロバイダ切替（Anthropicクレジット枯渇時などの運用切替）
 * - dual（デフォルト・現行動作）: 平面図=Gemini+Claude照合、補助図面・タイル=Claude
 * - gemini: 全AI呼び出しをGeminiに（平面図はGemini単体）
 * - claude: 全AI呼び出しをClaudeに（テスト用）
 * 呼び出し時に評価する（スクリプトがimport後にenvを設定しても効くように）
 */
function aiProvider() {
  const p = (process.env.AI_PROVIDER || 'dual').toLowerCase();
  return ['dual', 'gemini', 'claude'].includes(p) ? p : 'dual';
}

/**
 * 図面解析用AIプロンプト
 * アルファスタイル新宮町67戸 + けいとさんの5現場実績データに基づいて最適化
 */
const SYSTEM_PROMPT = `あなたはマンションリノベーション専門の建築士です。計画平面図から資材計算に必要な情報をJSON形式で抽出してください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【最重要原則：あなたの仕事は「転記」であり「計測」ではない】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

図面に文字で書かれている情報（帖数、寸法値、UBサイズ、品番等）を
そのまま転記することを最優先してください。
画像から自分で長さや面積を目測することは、記載がない場合の最終手段です。

■ 部屋面積の扱い
  - 図面に「約14.5帖」のような帖数記載がある部屋は、必ず area_jou に
    その数値を文字列で転記する（例: "14.5"）
  - area_jou がある場合、area_sqm は area_jou × 1.65 の値を入れる
  - 帖数記載が見つからない部屋のみ、目測の area_sqm を入れ、area_jou は null

■ 部屋の列挙漏れ禁止（必須！）
  - rooms には居室だけでなく、住戸内の**すべての区画**を列挙する:
    LDK（またはリビング・ダイニングとキッチンが別なら両方）、洋室、
    廊下・ホール、洗面室・パウダールーム、トイレ、UB（浴室）、玄関、
    WIC・クローゼット・収納
  - 面積ラベルの無い区画（廊下・玄関・トイレ等）も省略せず、
    寸法線や目測から area_sqm を推定して必ず含める
  - 天井面積・水回り床面積の計算はこのリストが唯一の情報源のため、
    列挙漏れ＝そのまま数量の欠落になる

■ 壁仕上記号の転記（平面詳細図の各壁面にある楕円記号）
  - 各壁面付近の楕円内に「英字1文字+数字2桁」の記号（例: D14, C04, I14, L14, G24）が
    書かれていることがある。読み取れたものを部屋ごとに転記する
  - JSONの wall_finish_codes に [{"room": "洋室(1)", "codes": ["I14", "C04"]}] の形式で入れる
  - 読める記号だけ転記する（推測・補完禁止）。無ければ空配列

■ 寸法の扱い
  - 図面上の寸法線に書かれた数値（mm）を最優先で転記する
  - 目測による寸法推定は寸法線が読めない場合のみ

■ 外形寸法の転記（必須）
  - 図面の最も外側の寸法線から、住戸全体の横幅と奥行き（mm）を転記する
  - 縦方向が複数区間に分かれている場合（例: 2350+950+2700）は合計値を入れる
  - バルコニー・外部廊下・専用ポーチは含めない（住戸躯体の外形のみ）
  - JSON の outer_dimensions_mm に {"width": 12450, "depth": 6000} の形式で入れる

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【重要：面積換算ルール】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 帖数（畳数）→ ㎡変換（江戸間基準を使用）
  - 1帖 = 正確に1.65㎡ で計算する
  - 例: 14帖 = 14 × 1.65 = 23.1㎡
  - 例: 14.5帖 = 14.5 × 1.65 = 23.9㎡
  - 例: 6.0帖 = 6.0 × 1.65 = 9.9㎡

■ 計算結果の妥当性チェック（必須！）
  - 図面に「14.5帖」と記載された部屋 → 14.5 × 1.65 = 23.9㎡ を使用
  - 帖数の記載がある場合は、帖数ベースの計算を優先
  - AIの自動計測値より帖数記載を信頼する

■ LDK面積の検証（実績データより）
  - 2LDK（50〜65㎡）: LDK約16〜20㎡が標準
  - 3LDK（65〜80㎡）: LDK約18〜25㎡が標準
  - 参考実績:
    * 14.5帖のLDK → 14.5 × 1.65 = 23.9㎡
    * アルファステイツA型 71.90㎡ 3LDK → LDK 18.82㎡

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【図面の線種ルール（実際の図面凡例に基づく）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 躯体壁（外周壁・RC壁）= 間仕切壁に含めない！
  - 濃紺または黒で塗りつぶされた太い壁（グレー色も含む）
  - 図面の最も外側（バルコニー側、窓側、玄関側）
  - PS（パイプスペース）、MB（メーターボックス）も同様に塗りつぶし
  - 隣戸との境界壁（界壁）も躯体壁

■ 間仕切壁（LGS壁）= これだけをpartition_wall_length_mに含める！
  - 青色または水色の細い線で描かれた壁
  - 室内を仕切る壁（部屋と部屋の間）
  - 躯体壁より明らかに薄い
  - 二重線で描かれることが多い

■ 見分け方のポイント:
  1. 濃紺/黒/グレーの塗りつぶし壁 → 躯体壁 → 含めない
  2. 青/水色の細線壁・二重線 → 間仕切壁 → 含める
  3. 外周の壁は全て躯体壁 → 含めない
  4. 窓のある壁 → 躯体壁（外周） → 含めない

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【間仕切壁延長の計算方法】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

計算対象（含める）:
  - LDKと洋室を仕切る壁
  - 洋室と洋室を仕切る壁
  - 廊下と各部屋を仕切る壁
  - 水回り（洗面室・トイレ・脱衣室・パウダールーム）の壁
  - クローゼット・WIC・SIC・収納の壁
  - キッチンの腰壁・カウンター壁

計算対象外（含めない）:
  - 外周壁（バルコニー側、窓側、玄関側）
  - PS（パイプスペース）周囲の躯体壁
  - MB（メーターボックス）周囲の壁
  - 隣戸との界壁

■ 間仕切壁延長の実績目安（上限チェック必須！）
  - 1LDK（40〜50㎡）: 12〜18m
  - 2LDK（50〜65㎡）: 15〜25m
  - 3LDK（65〜80㎡）: 20〜30m
  ⚠ 30mを超える場合は躯体壁を含めている可能性が非常に高い！
  ⚠ 計算結果が30mを超えた場合は、躯体壁を除外して再計算すること

■ 実績データからの検証
  - アルファステイツ67戸平均: 約22m（67㎡タイプ）
  - 30m以上は異常値として扱う

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【床暖房・特殊仕様の判定ルール】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 床暖房の計上条件（図面に明記されている場合のみ）
  1. 図面に「床暖房」「FF」「床暖」等と明記されている
  2. 面積は通常 2〜5㎡ 程度（LDKの一部）
  3. 明記がない場合は計上しない

⚠ 床暖房面積が 10㎡ を超える場合は異常値
⚠ 図面に記載がなければ special に含めない

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【アルファステイツ新宮町 実績データ（意匠図①+見積明細より・67戸/7タイプ）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ 住戸タイプ別（意匠図より正確な数値）
| タイプ | 専有面積 | 間取り | UBサイズ | LDK面積 | 戸数 |
|--------|----------|--------|----------|---------|------|
| A | 71.90㎡ | 3LDK | 1416 | 18.82㎡ | 10戸 |
| B | 67.30㎡ | 3LDK | 1416 | - | 10戸 |
| C | 67.30㎡ | 3LDK | 1416 | - | 10戸 |
| D | 67.30㎡ | 3LDK | 1416 | - | 10戸 |
| E | 67.31㎡ | 3LDK | 1416 | 18.90㎡ | 9戸 |
| F | 50.74㎡ | 2LDK | 1216 | - | 9戸 |
| G | 67.30㎡ | 3LDK | 1416 | - | 9戸 |
※ UBサイズ: Fタイプのみ1216、他は全て1416

■ 1戸あたり実績（67戸平均・見積明細より）
| 項目 | 数量 | 備考 |
|------|------|------|
| 壁PB t-9.5 | 90枚 | 3'×6' |
| 天井PB t-9.5 | 42枚 | 3'×6' |
| 耐水PB t-9.5 | 4枚 | 水回り |
| キッチンパネル | 3枚 | 3'×8' |
| 木製巾木 H=40 | 54m | |
| 出隅コーナー | 6箇所 | |
| 建具合計 | 10枚 | 片開き+引戸+折戸 |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【解析ポイント】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 各部屋の面積（畳数・㎡）と寸法（mm単位）を正確に読み取る
2. 間仕切壁の総延長（m）を計算 ← 最重要！躯体壁は絶対に含めない
3. UBサイズ（1216、1317、1416、1418、1616、1618等）を確認
4. キッチンサイズ（I型2100、2250、2550、L型等）を確認
5. 洗面台の幅（W600、W750、W900、W1000等）を確認
6. 建具（ドア・引戸・折戸）の数と種類を正確にカウント
7. 収納（クローゼット・WIC・SIC）の幅と枕棚+ハンガーパイプの有無
8. 特殊仕様（床暖房、室内窓、カウンター等）の有無

【面積の換算】
- 1帖 = 1.65㎡ で統一（このシステムの実績データ基準）
- 1坪 = 3.306㎡
- 畳数が記載されている場合はそのまま使用
- 寸法のみの場合は面積を計算

必ず以下のJSON形式のみを返してください（説明文は不要）：

{
  "document_type": "floor_plan",
  "is_analyzable": true,
  "property_name": "物件名（図面タイトルから）",
  "layout_type": "2LDK",
  "outer_dimensions_mm": { "width": null, "depth": null },
  "total_floor_area_sqm": null,
  "partition_wall_length_m": null,
  "ceiling_height_mm": null,
  "rooms": [
    {
      "name": "（部屋名）",
      "area_jou": null,
      "area_sqm_label": null,
      "area_sqm": null,
      "floor_type": "flooring"
    }
  ],
  "openings": [
    { "type": "（建具種類）", "width_mm": null, "height_mm": null, "room": "（部屋名）" }
  ],
  "equipment": {
    "ub_size": null,
    "kitchen": null,
    "washstand": null
  },
  "storage": [
    { "name": "（収納名）", "width_mm": null, "has_makuradana": false, "has_hanger_pipe": false }
  ],
  "special": []
}

⚠️【重要】上記はフォーマット例です。例の数値やプレースホルダをそのまま出力にコピーしてはいけません。
  - 図面に帖数・寸法の記載が見つからない場合は、推測せず必ず null を返すこと
  - area_jou は図面に「○○帖」と明記されている場合のみ、その数値を文字列で転記する
  - area_sqm_label は図面に「9.72㎡」「16.75m2」のように面積が数値で明記されている場合のみ、
    その数値を転記する（平面詳細図では「9.72㎡(6.0帖)」の形式で併記されることが多い）
  - 記載がない場合に例の値（14.5, 6.0等）をコピーするのは絶対に禁止

【document_type の判定】
  - "floor_plan": 計画平面図・平面詳細図（部屋の間取り、寸法線、建具が描かれている）
  - "finish_schedule": 仕上表（部屋名と仕上材の一覧表）
  - "elevation": 展開図・立面図
  - "other": 上記以外（配置図、設備図、写真など）

【is_analyzable の判定】
  - true: 平面図であり、資材計算に必要な情報（寸法・間取り）が読み取れる
  - false: 平面図でない、または情報が不足していて資材計算ができない

【floor_type の判定基準】
- "flooring": 居室（LDK、洋室、廊下、ホール等）
- "cf": 水回り（洗面室、トイレ、脱衣室、パウダールーム等）※CFはクッションフロアの略
- "tile": 玄関土間

【建具種類（アルファスタイル新宮町建具表より）】
- "片開き戸": 一般的なドア（W600〜850×H2080〜2210）
- "片引き戸": スライドするドア（W660〜760×H2075〜2170）
- "引違い戸": 2枚が交差するドア
- "2枚折戸": クローゼット用折戸（W605〜983×H2080〜2320）
- "6枚折戸": WIC用大型折戸（W2091×H2320）
- "窓": 外部に面する窓（サッシ）
- "室内窓": 室内の間仕切りに設置された窓

【UBサイズの判定】
- 1216: 1坪サイズ（標準、1LDK〜2LDK向け）
- 1317: 1.25坪（2LDK向け）
- 1416: 1.25坪（2〜3LDK向け）
- 1418: 1.5坪（3LDK向け、広め）
- 1616: 1.5坪（3〜4LDK、ハイグレード）
- 1618: 1.75坪（4LDK以上、大型）

JSONのみを返してください。説明文やマークダウンは含めないでください。`;

// ============================================================
// 展開図（室内立面）読み取りプロンプト
// 各部屋のA〜D面の壁幅・高さ・仕上げ・巾木種別を転記させる
// ============================================================
const ELEVATION_PROMPT = `あなたはマンションリノベーション専門の建築士です。展開図（室内立面図）から資材計算に必要な情報をJSON形式で抽出してください。

【展開図の読み方】
- 1部屋につきA〜D面（4方向の壁）の立面が並んでいる
- 各面の下に書かれた数字 = その壁の幅(mm)。複数区間に分かれる場合は合計する
- 左端の数字 = 高さ(mm)。最大値（2,810など）は**階高であり天井高ではない**。
  ceiling_height_mmには途中の値（居室2,400 / 水回り・玄関・キッチン2,200など）を入れる
- 左端の表 = 室名と仕上げ（床/巾木/壁/天井/備考）
- 面の中に描かれた建具（ドア・窓・引戸）は開口。寸法記載があれば転記する

【最重要】数値は図面の記載を転記すること。目測での推定は記載が無い場合のみ。

以下のJSON形式のみを返してください（説明文・マークダウン不要）:
{
  "drawing_type": "elevation",
  "unit_type": "Gタイプ",
  "rooms": [
    {
      "name": "洋室(1)",
      "ceiling_height_mm": 2400,
      "skirting": "木製巾木H=40",
      "wall_finish": "PB t9.5ノ上ビニールクロス貼",
      "faces": [
        { "face": "A", "width_mm": 2875, "wall_code": null,
          "openings": [ { "type": "片開き戸", "symbol": "WD-2A", "width_mm": 800, "height_mm": 2000 } ] },
        { "face": "B", "width_mm": 4840, "openings": [] },
        { "face": "C", "width_mm": 2875, "openings": [] },
        { "face": "D", "width_mm": 4840, "openings": [] }
      ]
    }
  ]
}

ルール:
- roomsにはページ内の全部屋を列挙（玄関・廊下、トイレ、キッチン、パウダールーム等も省略しない）
- 面が分割表記（例: 3,591+1,249 / 1,200+3,990）の場合は**合算した全幅**をwidth_mmに入れる
  （面の幅=その面の端から端までの全長。分割寸法の片方だけを転記しない）
- skirtingは表の記載を転記（木製巾木H=40 / ソフト巾木H=40 / 樹脂巾木H=35 等）。記載が無ければnull
- 開口の寸法が読めない場合は width_mm: null（捏造禁止）
- symbol: 開口の建具符号（WD-2A・SD-101A等の「英字+数字」。引出線の先・姿図の脇にある）が
  読めれば転記する。姿図に寸法が無くても符号があれば建具表と照合できるため、符号は必ず探すこと。
  読めなければ symbol: null（推測禁止）
- wall_code: 面に壁仕上記号（D14・C04・I14のような英字1+数字2の楕円記号）が読める場合のみ転記。無ければnull
- 展開図でないページの場合は {"drawing_type": "not_elevation"} を返す`;

// ============================================================
// 建具表読み取りプロンプト
// 符号・名称・W×H・取付位置を転記させる
// ============================================================
const DOOR_SCHEDULE_PROMPT = `あなたはマンションリノベーション専門の建築士です。建具表から資材計算に必要な情報をJSON形式で抽出してください。

【建具表の読み方】
- 表の各列が1つの建具。符号（WD-1、SD-101A、AWD-102等）で識別される
- 形式欄の姿図の下や横に幅(mm)、左に高さ(mm)が書かれている
- 「取付位置」= どの部屋に付くか。「数量」= 箇所数

【最重要】数値は表の記載を転記すること。推定・捏造禁止。

以下のJSON形式のみを返してください（説明文・マークダウン不要）:
{
  "drawing_type": "door_schedule",
  "doors": [
    {
      "symbol": "WD-2A",
      "name": "片開き戸",
      "width_mm": 800,
      "height_mm": 2080,
      "location": "洋室",
      "quantity": 1,
      "material": "木製"
    }
  ]
}

ルール:
- ページ内の全建具を列挙する。共用部の建具（管理事務室・ゴミ置場・階段等）も含めてよい（locationで区別できる）
- materialは 木製/鋼製/アルミ を姿図・材質欄から判定。不明ならnull
- 建具表でないページの場合は {"drawing_type": "not_door_schedule"} を返す`;

/**
 * Gemini APIで図面解析
 * analyzeWithClaudeと同じシグネチャ（プロンプト差し替え+rethrowApiErrors対応）で、
 * AI_PROVIDER=gemini時に補助図面・タイル解析からも呼ばれる
 */
async function analyzeWithGemini(filePath, base64Data, mimeType, promptText = SYSTEM_PROMPT, options = {}) {
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!geminiKey) {
    if (options.rethrowApiErrors) {
      const err = new Error('GOOGLE_GEMINI_API_KEY is not configured');
      err.status = 500;
      throw err;
    }
    return null;
  }

  // 一時的エラー（429=レート制限/503=高負荷）の再試行回数。デフォルト0
  // 本番（Render・AI_PROVIDER=gemini）でも GEMINI_RETRY_MAX=4 を設定して運用中
  // （12並列タイルが無料枠RPMに当たるため。待機15/30/45/60秒=1呼び出し最大150秒。
  //  日次上限quotaの429は待っても回復しないため再試行せず即諦める）
  // options.retryMax = 呼び出し内リトライの上書き（analyzeTilesの第2スイープが0を渡す。
  // スイープ自体が再試行層なので、二重リトライで直列待機が積み上がるのを防ぐ）
  const maxRetries = Number.isInteger(options.retryMax)
    ? options.retryMax
    : parseInt(process.env.GEMINI_RETRY_MAX || '0', 10) || 0;

  for (let attempt = 0; ; attempt++) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        // 読み取りモデル（環境変数で切替可能。flash/proの読み質比較用）
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        generationConfig: { temperature: 0 }, // 転記タスクの再現性優先
      });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Data
          }
        },
        { text: promptText + '\n\nこの図面を解析して、JSON形式で情報を抽出してください。' }
      ]);

      const response = await result.response;
      const text = response.text();
      return { parsed: parseJsonResponse(text), rawText: text };
    } catch (error) {
      // 429/503は時間をおけば通ることが多い（無料枠のRPM制限・混雑）。
      // ただし日次上限（quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier）は
      // 当日中は待っても回復しないため再試行しない（PerMinute等のRPM系のみリトライ）
      const isDailyQuota = error.status === 429 && /PerDay/.test(String(error.message || ''));
      if ((error.status === 429 || error.status === 503) && !isDailyQuota && attempt < maxRetries) {
        const waitMs = 15000 * (attempt + 1); // 15/30/45/60秒（RETRY_MAX=4で1呼び出し最大150秒）
        console.warn(`Gemini ${error.status} — ${waitMs / 1000}s待って再試行 (${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (isDailyQuota) {
        console.error('Gemini 429（日次上限quota）— 再試行せず諦めます');
      }
      console.error('Gemini API error:', error.message);
      // API起因の失敗（429/401/503等・fetch失敗）を「図面が読めなかった」と区別する
      // （JSONパース失敗はstatusを持たずSDKクラスでもないので従来どおりnull返し）
      // ネットワーク断（DNS/ECONNREFUSED）はGemini SDKが name='Error' のまま
      // GoogleGenerativeAIError（message="Error fetching from <url>: ..."）に包んで投げるため、
      // クラス名とメッセージの両方で判定する（Claude側のAPIConnectionError分岐と対称）
      const isGeminiSdkError = /GoogleGenerativeAI/.test(String(error.constructor?.name || ''));
      const isFetchFailure = /Error fetching from/i.test(String(error.message || ''));
      if (options.rethrowApiErrors && (error.status || isGeminiSdkError || isFetchFailure)) {
        throw error;
      }
      // 障害原因の切り分け用にステータスを持ち帰る（429=レート制限/401=キー無効 等）
      return { parsed: null, rawText: null, error: { status: error.status ?? null, message: String(error.message).slice(0, 200) } };
    }
  }
}

/**
 * Claude APIで図面解析
 */
async function analyzeWithClaude(filePath, base64Data, mimeType, promptText = SYSTEM_PROMPT, options = {}) {
  const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  console.log('Claude API key exists:', !!claudeKey);

  if (!claudeKey) {
    console.log('Claude API key not found, skipping...');
    if (options.rethrowApiErrors) {
      const err = new Error('ANTHROPIC_API_KEY is not configured');
      err.status = 500;
      throw err;
    }
    return null;
  }

  try {
    console.log(`Calling Claude API with model: ${CLAUDE_MODEL}`);
    const anthropic = new Anthropic({ apiKey: claudeKey });

    // PDFはdocumentブロック、画像はimageブロックで送信
    const mediaBlock = mimeType === 'application/pdf'
      ? {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64Data
          }
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64Data
          }
        };

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      temperature: 0, // 図面の転記タスク: 同一図面で読み取りが回ごとにブレるのを抑える
      messages: [
        {
          role: 'user',
          content: [
            mediaBlock,
            {
              type: 'text',
              text: promptText + '\n\nこの図面を解析して、JSON形式で情報を抽出してください。'
            }
          ]
        }
      ]
    });

    console.log('Claude API response received');
    const text = response.content[0].text;
    return { parsed: parseJsonResponse(text), rawText: text };
  } catch (error) {
    console.error('Claude API error:', error.message);
    console.error('Claude API error details:', JSON.stringify(error, null, 2));
    // API起因の失敗（401/429/529等・ネットワーク）を「図面が読めなかった」と区別したい
    // 呼び出し元がある場合のみ再スロー（JSONパース失敗はstatusを持たないのでnullのまま）
    if (options.rethrowApiErrors && (error.status || error.name === 'APIConnectionError')) {
      throw error;
    }
    // 障害原因の切り分け用にステータスを持ち帰る
    return { parsed: null, rawText: null, error: { status: error.status ?? null, message: String(error.message).slice(0, 200) } };
  }
}

/**
 * 単発解析のプロバイダ振り分け（補助図面・タイル解析用）
 * dual/claude=Claude単体（現行動作）、gemini=Gemini単体。プロンプトは共通
 */
function analyzeSingle(filePath, base64Data, mimeType, promptText, options = {}) {
  return aiProvider() === 'gemini'
    ? analyzeWithGemini(filePath, base64Data, mimeType, promptText, options)
    : analyzeWithClaude(filePath, base64Data, mimeType, promptText, options);
}

/**
 * JSONレスポンスをパース
 */
function parseJsonResponse(text) {
  let jsonText = text;

  // ```json ... ``` ブロックがある場合は抽出
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1];
  } else {
    // 直接JSONオブジェクトを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
  }

  return JSON.parse(jsonText);
}

/**
 * メイン解析関数
 * Gemini と Claude の両方で解析し、結果をマージ
 */
// ============================================================
// タイル解析（詳細読み取りパス）
// A1図面全体だとAI側で縮小され記号・建具が潰れるため、
// 分割+拡大したタイルごとに読み、結果を統合する
// ============================================================
const PLAN_CODE_TILE_PROMPT = `これはマンションの平面詳細図の一部（拡大タイル）です。

この範囲に写っている「壁仕上記号」をすべて抽出してください。
- 壁仕上記号 = 壁面の近くにある楕円の中の「英字1文字+数字2桁」（例: D14, C04, I14, L14, G24, D64）
- 記号がどの部屋のどの壁に付いているか、周囲の室名表記と壁の位置から判定する

【重要な業務知識（読み落とし防止）】
- 1つの部屋に記号は通常2〜4個ある。1個見つけて満足せず、部屋の四方の壁すべてを確認する
- C04（コンクリート打放）は界壁だけでなく**窓のあるバルコニー側の壁にも付く**。
  「窓がある壁＝外周だから記号なし」という思い込みは誤り
- G24（耐水）はUB・トイレ・洗面まわりの壁、L14（遮音）は居室間の壁、D64は収納内に付く
- 同じ記号（例: C04）が同じ部屋の複数の壁に付くことも多い。全部列挙する

【wall_length_mm = その記号が付いている壁の長さ】
- 記号が付いている壁に沿った寸法値（例: 2,575 / 5,190 / 3,540）を図面から**転記**する
- 壁が複数区間に分かれる場合は合計。寸法値が読めない場合は null（目測での推測は禁止）
- **壁そのものの長さ寸法だけ**を転記すること。器具寸法（洗面台のW・UBサイズ1416等）・
  開口（ドア・窓）の寸法・通り芯間の細かい寸法は壁長ではないので使わない
- 同じ記号は1部屋につき最大4件まで（部屋の四方A〜D面が上限。同一記号の反復書き出し防止）。
  異なる記号の組み合わせ（例: C04×4+I14）はこの上限に含めない

- 図面右欄の凡例表の中の記号は対象外（実際の壁面に付いたものだけ）
- WD-2TAのような建具符号、通り芯記号は対象外

以下のJSONのみを返す（説明不要）:
{"codes": [
  {"room": "洋室(1)", "code": "C04", "wall_length_mm": 5190},
  {"room": "洋室(1)", "code": "C04", "wall_length_mm": 2575},
  {"room": "洋室(1)", "code": "I14", "wall_length_mm": 2575}
]}
このタイルに記号が無ければ {"codes": []} を返す。推測での補完は禁止。`;

const ELEV_OPENING_TILE_PROMPT = `これはマンションの展開図（室内立面図）の一部（拡大タイル）です。

この範囲に写っている立面の「開口（ドア・引戸・折戸・窓）」をすべて抽出してください。
- 各立面の下のアルファベット（A/B/C/D）が面の記号、左の表の室名がその部屋
- 立面の中に描かれた建具姿図（ドアの矩形+開き勝手、窓、折戸）が開口
- 建具符号は最重要。姿図の中や脇・引出線の先・開口上部の「英字+数字」表記
  （WD-2TA / WD-120A / SD-101A / AWD-102 等）を必ず探して転記する
  （姿図に寸法が無くても、符号があれば建具表から実寸を引ける）
- 符号が読めない・無い場合は symbol: null（推測・創作禁止。読めた文字のまま転記でよい）
- 寸法（W=800, H=2,175等）が読めれば転記
- 収納の中の棚・ハンガーパイプ・手摺下地は開口ではない

以下のJSONのみを返す（説明不要）:
{"openings": [
  {"room": "洋室(1)", "face": "B", "type": "片開き戸", "symbol": "WD-2TA", "width_mm": 800, "height_mm": 2175}
]}
このタイルに開口が無ければ {"openings": []} を返す。寸法が読めない場合はnull（捏造禁止）。`;

// タイル解析の同時実行本数。壁記号タイルと開口タイルは呼び出し元（attachElevationData）が
// 並列に走らせるため、実効の同時API呼び出しは最大 3+3=6本（旧: 全タイル一斉発射=6+6=12本）。
// 12本の同時着弾がRPMバーストを踏み、課金Tier1でも毎回1〜2タイル失敗していた対策（2026-07-20本番実測）
const TILE_CONCURRENCY = 3;
// 各呼び出し直前のジッター（同一msに3本が同時着弾するのを避ける）
const TILE_JITTER_MIN_MS = 100;
const TILE_JITTER_MAX_MS = 300;
// 第2スイープ（失敗タイルの拾い直し）前の待機。RPM窓（分単位）が空くのを少し待つ
const TILE_SWEEP_DELAY_MS = 5000;

/**
 * タイルをAI解析し、結果と失敗タイル数を返す
 * 呼び先はAI_PROVIDERに従う（dual/claude=Claude、gemini=Gemini）
 * API障害（429/quota切れ・キー未設定等）は「このタイルに記号なし=[]」と区別して
 * failedTilesに数える（黙って空にすると部分結果が「成功」として保存され、
 * quota復活後の再アップロードでも再読取されない事故になるため）
 *
 * 実行モデル（2026-07-20）:
 * - 第1スイープ: 同時TILE_CONCURRENCY本のプール+タイルごとに100〜300msジッター。
 *   呼び出し内リトライ（GEMINI_RETRY_MAX）は従来どおり有効
 * - 第2スイープ: 失敗タイルだけを5秒おいて直列で1回ずつ再試行（回復分はfailedTilesから除外）。
 *   analyzeWithGemini内のGEMINI_RETRY_MAX（1呼び出し内の429/503リトライ）とは独立の層:
 *   呼び出し内リトライは他タイルが並走したままの再試行なので窓が塞がったままのことがあり、
 *   全タイル完了後（=自分たちの負荷が下がった後）に拾い直すのがこの層の役目。
 *   スイープ中は retryMax:0 で呼び出し内リトライを無効化する（スイープ自体が再試行層。
 *   有効のままだと直列×最悪約300秒/呼=失敗6タイルで30分級になり、リトライ暴走抑制の意図に反する）
 * - 所要時間の目安（課金Tier・1タイル1試行10〜30秒想定）:
 *   通常（失敗なし）: 6タイル÷3並列=2巡で約20〜60秒/系統（壁記号・開口の2系統並列でも同じ壁時計）
 *   第1スイープで呼び出し内リトライ発動時: その呼び出しは最大+150秒待機（15/30/45/60秒）+試行時間。
 *   並列3本なので他タイルは先に進む
 *   第2スイープ発動時: +5秒+失敗数×1試行（リトライ無効=10〜30秒/呼）
 *   → 失敗2タイルなら+約1分、全滅6タイルでも+約3分5秒が上限
 *
 * @param deps ユニットテスト用の注入口（scripts/test-tile-pool.mjs。本番は既定値で動く）
 * @returns { results, failedTiles, totalTiles } | null（PDF等でタイル分割不可）
 */
export async function analyzeTiles(filePath, prompt, resultKey, deps = {}) {
  const {
    analyze = analyzeSingle,
    loadTiles = async () => {
      const { makeTiles } = await import('./drawingTiles.js');
      return makeTiles(filePath);
    },
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    jitterMs = () => TILE_JITTER_MIN_MS
      + Math.floor(Math.random() * (TILE_JITTER_MAX_MS - TILE_JITTER_MIN_MS + 1)),
  } = deps;

  const tiles = await loadTiles().catch((e) => {
    console.error('タイル分割失敗:', e.message);
    return null;
  });
  if (!tiles) return null; // PDF等は分割不可

  // 1タイルの解析。成功: {items:[...]} / 失敗: {failed:true}
  // r.error = API障害の持ち帰り（analyzeWithGemini/Claudeのrethrowなし時）、
  // r = null はキー未設定。いずれも「読めた結果が空=[]」ではないので失敗に数える
  const runTile = async (i, phase) => {
    try {
      // スイープ時は呼び出し内リトライ（GEMINI_RETRY_MAX）を無効化: retryMax:0。
      // スイープ自体が再試行層なので二重リトライは不要（直列で待機が積み上がるのを防ぐ）。
      // Claude経路は呼び出し内リトライを持たないためretryMaxは無視される（無害）
      const r = await analyze(filePath, tiles[i].base64Data, tiles[i].mimeType, prompt,
        phase === 'sweep' ? { retryMax: 0 } : {});
      if (!r || r.error) {
        console.warn(`タイル${i + 1}/${tiles.length} 解析失敗(${phase}):`, r?.error?.status ?? '', r?.error?.message ?? 'no result');
        return { failed: true };
      }
      // どのタイルから読めたかを付記（_tile）。壁記号の集約で「タイル重なりの二重検出」と
      // 「同一タイル内に実在する等寸の別壁（対面）」を区別するのに使う。
      // 呼び出し側（aggregateWallCodeItems / analyzeOpeningsTiled）で消費し、外へは出さない
      return {
        items: (r.parsed?.[resultKey] || []).map((item) =>
          (item && typeof item === 'object' ? { ...item, _tile: i } : item)),
      };
    } catch (e) {
      console.warn(`タイル${i + 1}/${tiles.length} 解析失敗(${phase}):`, e?.message);
      return { failed: true };
    }
  };

  // 第1スイープ: 同時TILE_CONCURRENCY本のワーカープール（シングルスレッドなのでnextIndex++は安全）
  const outcomes = new Array(tiles.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < tiles.length) {
      const i = nextIndex++;
      await sleep(jitterMs()); // バースト回避のジッター（呼び出し直前）
      outcomes[i] = await runTile(i, '1st');
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(TILE_CONCURRENCY, tiles.length) }, () => worker()));

  // 第2スイープ: 失敗タイルだけを直列で1回ずつ再試行（上記JSDoc参照）
  const failedIdx = outcomes.flatMap((o, i) => (o.failed ? [i] : []));
  if (failedIdx.length > 0) {
    await sleep(TILE_SWEEP_DELAY_MS);
    for (const i of failedIdx) {
      const retry = await runTile(i, 'sweep');
      if (!retry.failed) outcomes[i] = retry; // 回復 → failedTilesから除外
    }
  }

  return {
    results: outcomes.flatMap((o) => o.items || []), // タイル順を維持（旧Promise.allと同じ）
    failedTiles: outcomes.filter((o) => o.failed).length,
    totalTiles: tiles.length,
  };
}

/**
 * 平面詳細図から壁仕上記号を抽出（タイル分割・詳細パス）
 * @returns { results: [{room, codes:[...], placements}], failedTiles, totalTiles } |
 *          null（タイル分割不可）。failedTiles>0 のとき results は部分結果
 *          （呼び出し元で _wall_codes_partial の保存と再読取判定に使う）
 */
export async function analyzeWallCodesTiled(filePath, context = {}) {
  const tiled = await analyzeTiles(filePath, PLAN_CODE_TILE_PROMPT + roomContextNote(context.roomNames), 'codes');
  if (!tiled) return null;
  const results = aggregateWallCodeItems(tiled.results);
  return { results, failedTiles: tiled.failedTiles, totalTiles: tiled.totalTiles };
}

/**
 * タイル読取の壁記号アイテムを部屋ごとに集約する（純関数・test-buildup-placement.mjsで検証）
 *
 * 課題: 「タイル重なりの二重検出（同じ壁が隣接タイルから2回読まれる）」と
 * 「実在する等寸の別壁（矩形部屋の対面2枚が同記号・同寸=標準形）」を区別する必要がある。
 * 旧実装はキー `${code}|${len}` で部屋内の同記号・同寸を無条件に1件へ潰しており、
 * 対面2枚の片方が消えていた（2026-07-18レビュー確定バグ）。
 *
 * 区別のルール（_tile = analyzeTilesが付けるタイル番号）:
 * - 1つのタイルは同じ壁の楕円を1回しか写さない → 同一タイル内の同記号・同寸N件は実在N本
 * - 隣接タイルの重なりで読まれた重複は「別タイルから各1件」になる
 * → クラスタ（同記号・寸法差≤100mm）ごとに「同一タイルからの読取件数の最大値」を実在本数とする。
 *   上限2本（対面想定。プロンプト逸脱の反復書き出しをキャップ）。
 * - _tileが無いアイテム（旧経路・保険）は各々を別タイル扱い → 従来どおり1件に統合（安全側）
 * ※ 離れた別タイルに写った等寸の別壁は max=1 に統合され拾えないが、過少除外
 *   （C04を1本分しか除外しない=壁PB過大側）で止まり、二重除外（過少側）にはならない
 */
export function aggregateWallCodeItems(raw) {
  const byRoom = new Map(); // room -> [{code, len, tile}]
  for (const item of raw) {
    if (!item?.room || !item?.code) continue;
    const code = String(item.code).toUpperCase().trim();
    if (!/^[A-Z][0-9][0-9]$/.test(code)) continue;
    const len = Number.isFinite(item.wall_length_mm) && item.wall_length_mm > 0
      ? Math.round(item.wall_length_mm) : null;
    if (!byRoom.has(item.room)) byRoom.set(item.room, []);
    byRoom.get(item.room).push({ code, len, tile: item._tile });
  }

  const TILE_DUP_TOL_MM = 100; // 同一壁の読み取り揺れとみなす寸法差（実例: トイレG24@950と@965）
  const MAX_SAME_WALL = 2;     // 同記号・同寸クラスタの実在上限（矩形部屋の対面2枚を想定）
  const results = [];
  for (const [room, items] of byRoom) {
    const placements = [];
    // 寸法nullは同記号で寸法ありが1件でもあれば捨てる。全てnullなら記号ごと1件だけ残す
    const nullSeen = new Set();
    for (const p of items) {
      if (p.len) continue;
      if (items.some((q) => q.code === p.code && q.len)) continue;
      if (nullSeen.has(p.code)) continue;
      nullSeen.add(p.code);
      placements.push({ code: p.code, wall_length_mm: null });
    }
    // 同記号・寸法差≤100mmでクラスタ化（代表値=先勝ちの寸法。平均は取らない）
    const clusters = [];
    for (const p of items) {
      if (!p.len) continue;
      const c = clusters.find((cl) => cl.code === p.code
        && Math.abs(cl.len - p.len) <= TILE_DUP_TOL_MM);
      if (c) c.members.push(p);
      else clusters.push({ code: p.code, len: p.len, members: [p] });
    }
    for (const cl of clusters) {
      // タイルごとの読取件数の最大値 = 実在本数（_tile未付与は各々別タイル扱い→1件に統合）。
      // 同一タイル内の複数計上は「寸法ラベル完全一致」に限定する: 実在の等幅対面2枚なら
      // 寸法ラベルは同一値が2回書かれる。僅差（例: C04@2360とC04@2410）は同じ楕円の
      // 再転記ノイズの疑いが強いため1件扱い（過大除外＝壁PB過少側に振らない）
      const perTile = new Map(); // tileKey -> Map(len -> 件数)
      cl.members.forEach((p, idx) => {
        const key = p.tile != null ? `t${p.tile}` : `u${idx}`;
        if (!perTile.has(key)) perTile.set(key, new Map());
        const byLen = perTile.get(key);
        byLen.set(p.len, (byLen.get(p.len) || 0) + 1);
      });
      let maxSameLen = 1;
      for (const byLen of perTile.values()) {
        for (const n of byLen.values()) maxSameLen = Math.max(maxSameLen, n);
      }
      const count = Math.min(MAX_SAME_WALL, maxSameLen);
      for (let n = 0; n < count; n++) placements.push({ code: cl.code, wall_length_mm: cl.len });
    }
    // 二重転記ノイズの縮退（2026-07-19）: 部屋内に「同記号・完全等寸のペア」が2クラスタ以上ある回は
    // 「ほぼ全記号を二重に書き出す癖」の読取とみなし、全ペアを1件へ縮退する（等寸×2保持の適用は
    // 対面C04想定の1クラスタまで）。詳細な根拠は buildupCalculator.collapseDoubledPlacements のコメント参照
    const finalPlacements = collapseDoubledPlacements(placements);
    results.push({ room, codes: [...new Set(finalPlacements.map((p) => p.code))], placements: finalPlacements });
  }
  return results;
}

/**
 * 展開図から開口を抽出（タイル分割・詳細パス）
 * @returns { results: [{room, face, type, symbol, width_mm, height_mm}], failedTiles, totalTiles } |
 *          null（タイル分割不可）
 */
export async function analyzeOpeningsTiled(filePath, context = {}) {
  const tiled = await analyzeTiles(filePath, ELEV_OPENING_TILE_PROMPT + roomContextNote(context.roomNames), 'openings');
  if (!tiled) return null;

  // 重複排除（タイルの重なりで同じ開口が2回出る）: room+face+type+width で同一視
  const seen = new Set();
  const openings = [];
  for (const rawOp of tiled.results) {
    if (!rawOp?.room) continue;
    const { _tile, ...op } = rawOp; // タイル番号は集約用の内部情報 → 保存データに漏らさない
    const key = `${op.room}|${op.face || ''}|${op.type || ''}|${op.width_mm || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    openings.push(op);
  }
  return { results: openings, failedTiles: tiled.failedTiles, totalTiles: tiled.totalTiles };
}

/**
 * ファイルをBase64+mimeTypeに読み込む共通ヘルパー
 */
function readDrawingFile(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.pdf') mimeType = 'application/pdf';
  return { base64Data, mimeType };
}

/**
 * 平面詳細図の読み取り結果（部屋一覧）をプロンプトに添付するヘルパー
 * 段階式アップロードで①の結果を②③に渡すと、部屋名の表記ゆれと読み落としが減る
 */
function roomContextNote(roomNames) {
  if (!Array.isArray(roomNames) || roomNames.length === 0) return '';
  return `\n\n【この住戸の部屋一覧（平面詳細図の読み取り結果・確定情報）】\n${roomNames.join('、')}\n` +
    '- 図面内の室がこの一覧のどれに当たるか対応づけ、部屋名(name/room)は上記の表記に揃えること' +
    '（例: 図面が「LD」でも一覧に「リビング・ダイニング」があればそちらを使う）\n' +
    '- 一覧にある部屋がページ内に描かれていれば読み落とさないこと（一覧に無い室があれば図面の表記のまま追加してよい）';
}

/**
 * 補助図面（展開図・建具表）の解析
 * 表形式の転記は読み取りブレが小さいため単体AIで解析する（コスト・時間の抑制）
 * 呼び先はAI_PROVIDERに従う（dual/claude=Claude、gemini=Gemini）
 * @param kind 'elevation' | 'door_schedule'
 * @param context { roomNames?: string[] } 平面図から得た部屋一覧（展開図の読み取り精度向上用）
 * @returns { parsed, rawText } | null（失敗時）
 */
export async function analyzeAuxDrawing(filePath, kind, context = {}) {
  let prompt = kind === 'elevation' ? ELEVATION_PROMPT : DOOR_SCHEDULE_PROMPT;
  if (kind === 'elevation') prompt += roomContextNote(context.roomNames);
  const { base64Data, mimeType } = readDrawingFile(filePath);
  // API障害はthrowで伝播させ、ルート側で503（再試行可能）として返す
  const res = await analyzeSingle(filePath, base64Data, mimeType, prompt, { rethrowApiErrors: true });
  if (!res?.parsed) return null;
  return res;
}

export async function analyzeDrawing(filePath, options = {}) {
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const provider = aiProvider();

  // 選択プロバイダで使えるキーが無ければモックを返さず503で顕在化させる
  const hasUsableKey = provider === 'gemini' ? !!geminiKey
    : provider === 'claude' ? !!claudeKey
    : !!(geminiKey || claudeKey);
  if (!hasUsableKey) {
    // キー未設定でもモック（架空物件）は返さない。設定ミスを503で顕在化させる
    console.error('No AI API keys configured — refusing to fabricate analysis');
    return {
      is_rejected: true,
      document_type: 'unknown',
      rejection_reason: 'AI解析の設定が完了していません（APIキー未設定）。運営者にご連絡ください。',
      _ai_unavailable: true,
    };
  }

  // ファイルを読み込んでBase64エンコード
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  // 拡張子からメディアタイプを判定
  const ext = path.extname(filePath).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') {
    mimeType = 'image/jpeg';
  } else if (ext === '.pdf') {
    mimeType = 'application/pdf';
  }

  // プロバイダに応じて呼び出し（dual=両方並行・照合、gemini/claude=単体）
  const [geminiRes, claudeRes] = await Promise.all([
    provider !== 'claude' ? analyzeWithGemini(filePath, base64Data, mimeType) : Promise.resolve(null),
    provider !== 'gemini' ? analyzeWithClaude(filePath, base64Data, mimeType) : Promise.resolve(null)
  ]);

  const geminiResult = geminiRes?.parsed || null;
  const claudeResult = claudeRes?.parsed || null;

  console.log('=== AI解析結果の比較 ===');
  console.log('Gemini result:', geminiResult ? 'OK' : 'Failed');
  console.log('Claude result:', claudeResult ? 'OK' : 'Failed');

  // 各AIの詳細結果をログ出力
  if (geminiResult) {
    console.log('--- Gemini 詳細 ---');
    console.log('  partition_wall_length_m:', geminiResult.partition_wall_length_m);
    console.log('  total_floor_area_sqm:', geminiResult.total_floor_area_sqm);
    console.log('  ceiling_height_mm:', geminiResult.ceiling_height_mm);
    console.log('  openings数:', geminiResult.openings ? geminiResult.openings.length : 0);
    console.log('  rooms数:', geminiResult.rooms ? geminiResult.rooms.length : 0);
  }

  if (claudeResult) {
    console.log('--- Claude 詳細 ---');
    console.log('  partition_wall_length_m:', claudeResult.partition_wall_length_m);
    console.log('  total_floor_area_sqm:', claudeResult.total_floor_area_sqm);
    console.log('  ceiling_height_mm:', claudeResult.ceiling_height_mm);
    console.log('  openings数:', claudeResult.openings ? claudeResult.openings.length : 0);
    console.log('  rooms数:', claudeResult.rooms ? claudeResult.rooms.length : 0);
  }

  // 成功した結果を集める
  const results = [geminiResult, claudeResult].filter(r => r !== null);

  if (results.length === 0) {
    // 両AIが失敗（APIキー失効・障害・レスポンス解析失敗）した場合、
    // モックの架空物件を返すと本物の見積として保存されてしまう。
    // 明示的に拒否して、アップロード側で500として扱わせる。
    console.error('All AI APIs failed — refusing to fabricate analysis');
    // 原因コードを明示（429=レート制限/401=キー無効/529=混雑）— 運用時の切り分け用
    const errCode = (r) => r?.error?.status || (r?.error?.message ? 'ERR' : 'キー未設定');
    const geminiPart = provider === 'claude' ? '未使用' : errCode(geminiRes);
    const claudePart = provider === 'gemini' ? '未使用' : errCode(claudeRes);
    return {
      is_rejected: true,
      document_type: 'unknown',
      rejection_reason: `AI解析に失敗しました（Gemini: ${geminiPart} / Claude: ${claudePart}）。時間をおいて再試行してください。`,
      _ai_unavailable: true,
    };
  }

  // 結果を照合（平均化ではなくフィールド単位の突き合わせ）
  const { merged, disagreements } = reconcileDualResults(geminiResult, claudeResult, options);

  // サーバー側で検証・正規化を強制（帖数優先、実績バンドでクランプ等）
  const { data: validated, warnings } = validateAndNormalize(merged, options);

  // 警告・不一致を結果に添付（フロントのSpecConfirmで表示可能）
  validated._warnings = warnings;
  validated._ai_disagreements = disagreements;

  // AI生テキスト（DB保存用: evalセット作成・デバッグの一次資料）
  validated._raw_responses = {
    gemini: geminiRes?.rawText || null,
    claude: claudeRes?.rawText || null,
  };

  console.log('--- 照合・検証結果 ---');
  console.log('  partition_wall_length_m:', validated.partition_wall_length_m);
  console.log('  total_floor_area_sqm:', validated.total_floor_area_sqm);
  console.log('  警告数:', warnings.length);
  warnings.forEach(w => console.log(`  ⚠ ${w.field}: ${w.message} (${w.before} → ${w.after})`));
  disagreements.forEach(d => console.log(`  ⚡ ${d.field}: Gemini=${d.gemini} / Claude=${d.claude}`));
  console.log('========================');

  return validated;
}

/**
 * デモ用モックデータ
 * マンションフロイント麻布309号室の図面を参考に作成
 */
function getMockAnalysisResult() {
  return {
    property_name: "マンションフロイント麻布 309号室",
    layout_type: "1LDK",
    total_dimensions: { width_mm: 6325, depth_mm: 7500 },
    ceiling_height_mm: 2400,
    rooms: [
      {
        name: "LDK",
        area_tsubo: 8.1,
        area_sqm: 26.8,
        width_mm: 3525,
        depth_mm: 7500,
        floor_type: "flooring",
        wall_type: "partition"
      },
      {
        name: "洋室",
        area_tsubo: 4.1,
        area_sqm: 13.5,
        width_mm: 2800,
        depth_mm: 4830,
        floor_type: "flooring",
        wall_type: "partition"
      },
      {
        name: "洗面室",
        area_tsubo: 1.5,
        area_sqm: 5.0,
        width_mm: 1650,
        depth_mm: 3000,
        floor_type: "cf",
        wall_type: "partition"
      },
      {
        name: "トイレ",
        area_tsubo: 0.5,
        area_sqm: 1.65,
        width_mm: 1200,
        depth_mm: 1400,
        floor_type: "cf",
        wall_type: "partition"
      },
      {
        name: "玄関",
        area_tsubo: 1.0,
        area_sqm: 3.3,
        width_mm: 1200,
        depth_mm: 2700,
        floor_type: "tile",
        wall_type: "partition"
      },
      {
        name: "ホール",
        area_tsubo: 1.0,
        area_sqm: 3.3,
        width_mm: 1200,
        depth_mm: 2700,
        floor_type: "flooring",
        wall_type: "partition"
      }
    ],
    openings: [
      { type: "開き戸", width_mm: 800, height_mm: 2035, room: "LDK" },
      { type: "引戸", width_mm: 1600, height_mm: 2035, room: "洋室" },
      { type: "折戸", width_mm: 900, height_mm: 2035, room: "クローゼット1" },
      { type: "折戸", width_mm: 900, height_mm: 2035, room: "クローゼット2" },
      { type: "開き戸", width_mm: 700, height_mm: 2035, room: "トイレ" },
      { type: "開き戸", width_mm: 700, height_mm: 2035, room: "洗面室" },
      { type: "開き戸", width_mm: 800, height_mm: 2035, room: "玄関" },
      { type: "窓", width_mm: 1800, height_mm: 1200, room: "LDK" },
      { type: "窓", width_mm: 1200, height_mm: 1200, room: "洋室" }
    ],
    equipment: {
      ub_size: "1216",
      ub_spec: "TOTO WT 浴室乾燥機あり",
      kitchen: "I型 2550",
      kitchen_spec: "LIXIL ES 2550 スライド・食洗機あり",
      washstand: "W750",
      washstand_spec: "LIXIL EV 三面鏡LED"
    },
    storage: [
      { type: "closet", name: "クローゼット", width_mm: 1800, depth_mm: 600, has_makuradana: true, has_hanger_pipe: true },
      { type: "closet", name: "物入", width_mm: 900, depth_mm: 450, has_makuradana: false, has_hanger_pipe: false }
    ],
    special: []
  };
}
