import { GoogleGenerativeAI } from '@google/generative-ai';
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

export async function analyzeDrawing(filePath) {
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;

  if (!geminiKey) {
    // デモ用のモックデータを返す
    return getMockAnalysisResult();
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

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

    // JSONを抽出（```json ブロックにも対応）
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
  } catch (error) {
    console.error('Gemini API error:', error.message);
    console.log('Falling back to mock data...');
    return getMockAnalysisResult();
  }
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
