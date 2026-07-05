import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

/**
 * 図面解析用AIプロンプト
 * アルファスタイル新宮町67戸 + けいとさんの5現場実績データに基づいて最適化
 */
const SYSTEM_PROMPT = `あなたはマンションリノベーション専門の建築士です。計画平面図から資材計算に必要な情報をJSON形式で抽出してください。

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

実績目安（重要！この範囲内であるべき）:
  - 1LDK（40〜50㎡）: 12〜18m
  - 2LDK（50〜65㎡）: 15〜25m
  - 3LDK（65〜80㎡）: 20〜30m
  ※ 30mを超える場合は躯体壁を含めている可能性が高い！

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
- 1畳 = 約1.65㎡（中京間）
- 1坪 = 3.306㎡
- 畳数が記載されている場合はそのまま使用
- 寸法のみの場合は面積を計算

必ず以下のJSON形式のみを返してください（説明文は不要）：

{
  "property_name": "物件名（図面タイトルから）",
  "layout_type": "2LDK",
  "total_floor_area_sqm": 65,
  "partition_wall_length_m": 22,
  "ceiling_height_mm": 2400,
  "rooms": [
    {
      "name": "LDK",
      "area_sqm": 16.5,
      "floor_type": "flooring"
    },
    {
      "name": "洋室1",
      "area_sqm": 6.6,
      "floor_type": "flooring"
    },
    {
      "name": "洋室2",
      "area_sqm": 5.8,
      "floor_type": "flooring"
    },
    {
      "name": "パウダールーム",
      "area_sqm": 3.5,
      "floor_type": "cf"
    },
    {
      "name": "トイレ",
      "area_sqm": 1.8,
      "floor_type": "cf"
    },
    {
      "name": "玄関",
      "area_sqm": 2.0,
      "floor_type": "tile"
    },
    {
      "name": "廊下・ホール",
      "area_sqm": 4.5,
      "floor_type": "flooring"
    }
  ],
  "openings": [
    { "type": "片開き戸", "width_mm": 800, "height_mm": 2080, "room": "LDK" },
    { "type": "片開き戸", "width_mm": 800, "height_mm": 2175, "room": "洋室1" },
    { "type": "片引き戸", "width_mm": 760, "height_mm": 2075, "room": "洋室2" },
    { "type": "2枚折戸", "width_mm": 803, "height_mm": 2320, "room": "クローゼット1" },
    { "type": "2枚折戸", "width_mm": 983, "height_mm": 2320, "room": "クローゼット2" },
    { "type": "6枚折戸", "width_mm": 2091, "height_mm": 2320, "room": "WIC" },
    { "type": "片開き戸", "width_mm": 600, "height_mm": 2080, "room": "トイレ" },
    { "type": "片開き戸", "width_mm": 700, "height_mm": 2175, "room": "パウダールーム" }
  ],
  "equipment": {
    "ub_size": "1216",
    "kitchen": "I型 2550",
    "washstand": "W750"
  },
  "storage": [
    { "name": "クローゼット1", "width_mm": 1600, "has_makuradana": true, "has_hanger_pipe": true },
    { "name": "WIC", "width_mm": 2400, "has_makuradana": true, "has_hanger_pipe": true },
    { "name": "SIC", "width_mm": 900, "has_makuradana": true, "has_hanger_pipe": false }
  ],
  "special": [
    { "type": "床暖房", "area_sqm": 3.5, "room": "LDK" },
    { "type": "カウンター", "width_mm": 2000, "room": "LDK" }
  ]
}

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

  // 結果をマージ
  const merged = mergeResults(results);
  console.log('--- マージ結果 ---');
  console.log('  partition_wall_length_m:', merged.partition_wall_length_m);
  console.log('  total_floor_area_sqm:', merged.total_floor_area_sqm);
  console.log('  ceiling_height_mm:', merged.ceiling_height_mm);
  console.log('  openings数:', merged.openings ? merged.openings.length : 0);
  console.log('========================');

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
