import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { validateAndNormalize, reconcileDualResults } from './aiReadingValidator.js';
import fs from 'fs';
import path from 'path';

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

/**
 * Gemini APIで図面解析
 */
async function analyzeWithGemini(filePath, base64Data, mimeType) {
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!geminiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Data
        }
      },
      { text: SYSTEM_PROMPT + '\n\nこの図面を解析して、JSON形式で情報を抽出してください。' }
    ]);

    const response = await result.response;
    const text = response.text();
    return { parsed: parseJsonResponse(text), rawText: text };
  } catch (error) {
    console.error('Gemini API error:', error.message);
    return null;
  }
}

/**
 * Claude APIで図面解析
 */
async function analyzeWithClaude(filePath, base64Data, mimeType) {
  const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  console.log('Claude API key exists:', !!claudeKey);
  console.log('Claude API key length:', claudeKey ? claudeKey.length : 0);

  if (!claudeKey) {
    console.log('Claude API key not found, skipping...');
    return null;
  }

  // ClaudeはPDFを直接サポートしていないので、画像のみ
  if (mimeType === 'application/pdf') {
    console.log('Claude does not support PDF directly, skipping...');
    return null;
  }

  try {
    console.log('Calling Claude API with model: claude-opus-4-8');
    const anthropic = new Anthropic({ apiKey: claudeKey });

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Data
              }
            },
            {
              type: 'text',
              text: SYSTEM_PROMPT + '\n\nこの図面を解析して、JSON形式で情報を抽出してください。'
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
    return null;
  }
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
export async function analyzeDrawing(filePath, options = {}) {
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  if (!geminiKey && !claudeKey) {
    console.log('No API keys found, using mock data...');
    return getMockAnalysisResult();
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

  // 両方のAPIを並行して呼び出し
  const [geminiRes, claudeRes] = await Promise.all([
    analyzeWithGemini(filePath, base64Data, mimeType),
    analyzeWithClaude(filePath, base64Data, mimeType)
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
    console.log('All APIs failed, using mock data...');
    return getMockAnalysisResult();
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
