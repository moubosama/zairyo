import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

/**
 * 図面解析用AIプロンプト
 * 5現場の実績データに基づいて最適化
 */
const SYSTEM_PROMPT = `あなたは建築図面を解析する専門家です。アップロードされたリノベーション計画平面図から、資材計算に必要な情報をJSON形式で抽出してください。

【重要】リノベーション工事では既存躯体壁（外周のRC壁）にはボードを貼りません。新設する間仕切壁のみに下地材が必要です。

【重要な解析ポイント】
1. 各部屋の面積（畳数・㎡）と寸法（mm単位）を正確に読み取る
2. 間仕切壁の総延長（m）を計算する ← 重要！
3. UBサイズ（1216、1317、1418等）を確認
4. キッチンサイズ（I型2100、2550等）を確認
5. 洗面台の幅（W750、W900等）を確認
6. 建具（ドア・引戸・折戸）の数を正確にカウント
7. 収納（クローゼット）の幅と枕棚+ハンガーパイプの有無

【面積の換算】
- 1畳 = 約1.65㎡（中京間）
- 畳数が記載されている場合はそのまま使用
- 寸法のみの場合は面積を計算

【壁延長の計算方法】
- 間仕切壁延長 = 各間仕切壁の長さの合計（両面にボードを貼るため重要）
- 外周壁（躯体壁）は含めない（リノベでは通常GL工法で片面のみ、または既存利用）
- 一般的な2LDK（50㎡）では間仕切壁延長は15〜25m程度

必ず以下のJSON形式のみを返してください（説明文は不要）：

{
  "property_name": "物件名（図面タイトルから）",
  "layout_type": "2LDK",
  "total_floor_area_sqm": 55,
  "partition_wall_length_m": 20,
  "ceiling_height_mm": 2400,
  "rooms": [
    {
      "name": "LDK",
      "area_sqm": 21.5,
      "floor_type": "flooring"
    },
    {
      "name": "洋室1",
      "area_sqm": 9.9,
      "floor_type": "flooring"
    },
    {
      "name": "洋室2",
      "area_sqm": 9.2,
      "floor_type": "flooring"
    },
    {
      "name": "洗面室",
      "area_sqm": 3.0,
      "floor_type": "cf"
    },
    {
      "name": "トイレ",
      "area_sqm": 1.5,
      "floor_type": "cf"
    },
    {
      "name": "玄関・廊下",
      "area_sqm": 5.0,
      "floor_type": "flooring"
    }
  ],
  "openings": [
    { "type": "開き戸", "room": "LDK" },
    { "type": "引戸", "room": "洋室1" },
    { "type": "引戸", "room": "洋室2" },
    { "type": "折戸", "room": "クローゼット1" },
    { "type": "折戸", "room": "クローゼット2" },
    { "type": "開き戸", "room": "トイレ" },
    { "type": "開き戸", "room": "洗面室" }
  ],
  "equipment": {
    "ub_size": "1216",
    "kitchen": "I型 2550",
    "washstand": "W750"
  },
  "storage": [
    { "name": "クローゼット1", "has_makuradana": true, "has_hanger_pipe": true },
    { "name": "WIC", "has_makuradana": true, "has_hanger_pipe": true }
  ],
  "special": []
}

【floor_type の判定基準】
- "flooring": 居室（LDK、洋室、廊下、ホール等）
- "cf": 水回り（洗面室、トイレ、脱衣室等）※CFはクッションフロアの略
- "tile": 玄関土間

【wall_type の判定基準】
- "partition": 間仕切壁（新設の軽量下地壁）
- "structural": 躯体壁（既存RC壁・外周壁）

【建具種類】
- "開き戸": ドアノブ付きの一般的なドア
- "引戸": スライドするドア（片引き、引き込み等）
- "折戸": 折り畳みドア（主にクローゼット）
- "窓": 外部に面する窓
- "室内窓": 室内の間仕切りに設置された窓

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
    return parseJsonResponse(text);
  } catch (error) {
    console.error('Gemini API error:', error.message);
    return null;
  }
}

/**
 * Claude APIで図面解析
 */
async function analyzeWithClaude(filePath, base64Data, mimeType) {
  const claudeKey = process.env.ANTHROPIC_API_KEY;
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
    console.log('Calling Claude API with model: claude-sonnet-4-5-20250929');
    const anthropic = new Anthropic({ apiKey: claudeKey });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
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
    return parseJsonResponse(text);
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
 * 複数のAI結果をマージ（平均化）
 */
function mergeResults(results) {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  // 基本構造は最初の結果を使用
  const merged = JSON.parse(JSON.stringify(results[0]));

  // 数値フィールドを平均化
  const numericFields = ['total_floor_area_sqm', 'partition_wall_length_m', 'ceiling_height_mm'];
  numericFields.forEach(field => {
    const values = results.map(r => r[field]).filter(v => v !== undefined && v !== null);
    if (values.length > 0) {
      merged[field] = Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10;
    }
  });

  // 部屋の面積を平均化
  if (merged.rooms && merged.rooms.length > 0) {
    merged.rooms.forEach((room, i) => {
      const areas = results
        .map(r => r.rooms && r.rooms[i] ? r.rooms[i].area_sqm : null)
        .filter(v => v !== null);
      if (areas.length > 0) {
        room.area_sqm = Math.round(areas.reduce((a, b) => a + b, 0) / areas.length * 10) / 10;
      }
    });
  }

  // 建具数は最大値を採用（見落としを防ぐ）
  if (merged.openings) {
    const maxOpenings = Math.max(...results.map(r => (r.openings || []).length));
    // 最も多くの建具を検出した結果を採用
    const bestResult = results.find(r => (r.openings || []).length === maxOpenings);
    if (bestResult && bestResult.openings) {
      merged.openings = bestResult.openings;
    }
  }

  return merged;
}

/**
 * メイン解析関数
 * Gemini と Claude の両方で解析し、結果をマージ
 */
export async function analyzeDrawing(filePath) {
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;

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
  const [geminiResult, claudeResult] = await Promise.all([
    analyzeWithGemini(filePath, base64Data, mimeType),
    analyzeWithClaude(filePath, base64Data, mimeType)
  ]);

  console.log('Gemini result:', geminiResult ? 'OK' : 'Failed');
  console.log('Claude result:', claudeResult ? 'OK' : 'Failed');

  // 成功した結果を集める
  const results = [geminiResult, claudeResult].filter(r => r !== null);

  if (results.length === 0) {
    console.log('All APIs failed, using mock data...');
    return getMockAnalysisResult();
  }

  // 結果をマージ
  const merged = mergeResults(results);
  console.log('Merged result - partition_wall_length_m:', merged.partition_wall_length_m);

  return merged;
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
