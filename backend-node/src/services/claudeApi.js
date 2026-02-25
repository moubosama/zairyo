import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const SYSTEM_PROMPT = `あなたは建築図面を解析する専門家です。アップロードされた計画平面図から、以下の情報をJSON形式で抽出してください。

必ず以下の形式でJSONのみを返してください（説明文は不要）：
{
  "property_name": "物件名",
  "layout_type": "2LDK",
  "total_dimensions": { "width_mm": 10000, "depth_mm": 8000 },
  "ceiling_height_mm": 2400,
  "rooms": [
    {
      "name": "リビング",
      "area_tsubo": 8.5,
      "area_sqm": 28.1,
      "width_mm": 5000,
      "depth_mm": 5620,
      "floor_type": "flooring",
      "wall_type": "partition"
    }
  ],
  "openings": [
    { "type": "door", "width_mm": 800, "height_mm": 2000, "room": "リビング" }
  ],
  "equipment": {
    "ub_size": "1317",
    "kitchen": "I型 2550",
    "washstand": "W750"
  },
  "storage": [
    { "type": "closet", "width_mm": 1800, "has_makuradana": true }
  ],
  "special": [
    { "type": "floor_heating", "details": "リビング" }
  ]
}

注意事項：
- floor_typeは "flooring"（フローリング）または "cf"（クッションフロア）を指定
- wall_typeは "partition"（間仕切壁）または "structural"（躯体壁）を指定
- 面積が読み取れない場合は、寸法から計算
- 水回り（洗面室、トイレ、浴室）は通常 floor_type: "cf"
- 居室は通常 floor_type: "flooring"
- JSONのみを返し、説明文は含めないでください`;

export async function analyzeDrawing(filePath) {
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;

  if (!geminiKey) {
    // デモ用のモックデータを返す
    return getMockAnalysisResult();
  }

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

  // JSONを抽出
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('JSON parse error:', e);
      console.error('Raw text:', text);
      throw new Error('Failed to parse JSON from Gemini response');
    }
  }

  throw new Error('Failed to extract JSON from Gemini response');
}

function getMockAnalysisResult() {
  return {
    property_name: "サンプルマンション 101号室",
    layout_type: "2LDK",
    total_dimensions: { width_mm: 10000, depth_mm: 8000 },
    ceiling_height_mm: 2400,
    rooms: [
      {
        name: "リビング・ダイニング",
        area_tsubo: 10.0,
        area_sqm: 33.0,
        width_mm: 6000,
        depth_mm: 5500,
        floor_type: "flooring",
        wall_type: "partition"
      },
      {
        name: "洋室1",
        area_tsubo: 6.0,
        area_sqm: 19.8,
        width_mm: 3600,
        depth_mm: 5500,
        floor_type: "flooring",
        wall_type: "partition"
      },
      {
        name: "洋室2",
        area_tsubo: 5.0,
        area_sqm: 16.5,
        width_mm: 3300,
        depth_mm: 5000,
        floor_type: "flooring",
        wall_type: "partition"
      },
      {
        name: "キッチン",
        area_tsubo: 3.0,
        area_sqm: 9.9,
        width_mm: 3000,
        depth_mm: 3300,
        floor_type: "cf",
        wall_type: "partition"
      },
      {
        name: "洗面室",
        area_tsubo: 1.5,
        area_sqm: 5.0,
        width_mm: 1800,
        depth_mm: 2700,
        floor_type: "cf",
        wall_type: "partition"
      },
      {
        name: "トイレ",
        area_tsubo: 0.8,
        area_sqm: 2.6,
        width_mm: 1200,
        depth_mm: 2200,
        floor_type: "cf",
        wall_type: "partition"
      }
    ],
    openings: [
      { type: "door", width_mm: 800, height_mm: 2000, room: "リビング・ダイニング" },
      { type: "door", width_mm: 800, height_mm: 2000, room: "洋室1" },
      { type: "door", width_mm: 800, height_mm: 2000, room: "洋室2" },
      { type: "door", width_mm: 700, height_mm: 2000, room: "洗面室" },
      { type: "door", width_mm: 700, height_mm: 2000, room: "トイレ" },
      { type: "window", width_mm: 1800, height_mm: 1200, room: "リビング・ダイニング" },
      { type: "window", width_mm: 1200, height_mm: 1200, room: "洋室1" },
      { type: "window", width_mm: 1200, height_mm: 1200, room: "洋室2" }
    ],
    equipment: {
      ub_size: "1317",
      kitchen: "I型 2550",
      washstand: "W750"
    },
    storage: [
      { type: "closet", width_mm: 1800, has_makuradana: true },
      { type: "closet", width_mm: 900, has_makuradana: false }
    ],
    special: []
  };
}
