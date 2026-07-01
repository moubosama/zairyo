# ZAIRYO - 資材拾いアシスタント

## プロジェクト概要

ZAIRYOは、工務店向けのリノベーション資材拾い自動化システムです。
AI（Gemini + Claude API）による図面解析で、資材リスト作成を大幅に効率化します。

## 技術スタック

- **フロントエンド**: Vue.js 3 + Vite + Tailwind CSS
- **バックエンド**: Node.js + Express + Prisma ORM
- **AI解析**: Google Gemini API (gemini-2.5-flash) + Claude API (claude-opus-4-8) - デュアルAI解析
- **データベース**: SQLite
- **Excel出力**: ExcelJS

## ディレクトリ構成

```
zairyo/
├── backend-node/            # Node.js バックエンド
│   ├── src/
│   │   ├── routes/
│   │   │   └── projects.js
│   │   └── services/
│   │       ├── claudeApi.js      # デュアルAI解析
│   │       └── materialCalculator.js  # 資材計算ロジック
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
├── frontend/                # Vue.js フロントエンド
│   ├── src/
│   │   ├── components/
│   │   ├── views/
│   │   ├── stores/
│   │   └── services/
│   └── vite.config.js
└── CLAUDE.md
```

## 全体フロー

1. **Step 1: 図面アップロード** - PDF/PNG/JPGをアップロード、Gemini + Claude APIで解析
2. **Step 2: 資材リスト出力** - 計算結果を表示、Excel出力

## デザインガイドライン

- **テーマ**: ダークテーマ
- **アクセントカラー**: ゴールド (#D4A853)
- **フォント**: Noto Sans JP + DM Mono

## APIエンドポイント

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| GET | /api/projects | プロジェクト一覧取得 |
| POST | /api/projects | 新規プロジェクト作成 |
| POST | /api/projects/{id}/upload | 図面アップロード+AI解析 |
| POST | /api/projects/{id}/overrides | 仕様変更保存 |
| POST | /api/projects/{id}/calculate | 資材計算実行 |
| GET | /api/projects/{id}/materials | 資材リスト取得 |
| GET | /api/projects/{id}/export | Excelダウンロード |

## 計算ロジック（54ファイル実績データに基づく）

AIは図面読み取りのみ。資材数量の計算はNode.js側で実行。

### 実績データサマリー（けいとさんの資料より）

| 項目 | 実績範囲 | 固定/変動 | 備考 |
|------|----------|-----------|------|
| PB 12.5mm | 8〜60枚 | 変動 | 壁面積による |
| PB 9.5mm | 8〜40枚 | 変動 | 天井面積による |
| Mクロス | 2〜7枚 | 変動 | 水回り面積による |
| 垂木 | 10〜30束 | 変動 | 間取りによる |
| ラワンベニヤ | 4〜19枚 | 変動 | 水回り+床下地 |
| 天井クロス | 52〜75㎡ | 変動 | 天井面積 |
| 壁クロス | 187〜270㎡ | 変動 | 壁面積 |
| 巾木 | 10〜40m | 変動 | 壁延長−開口部 |
| フローリング | 50〜70㎡ | 変動 | 居室床面積 |

### 主要計算式

| 資材 | 計算式 | ロス率 |
|-----|-------|-------|
| PB 12.5mm | 壁面積(㎡) ÷ 1.6562 × 1.05 | +5% |
| PB 9.5mm | 天井面積(㎡) ÷ 1.6562 × 1.05 | +5% |
| Mクロス | 水回り壁面積 ÷ 1.6562 × 1.05 | +5% |
| 垂木 | (間仕切壁延長÷0.303×2 + 天井面積÷0.303) ÷ 12 | — |
| フローリング | 居室床面積(㎡) × 1.1 | +10% |
| 巾木 | 壁延長(m) − 開口部幅合計 | — |
| ラワンベニヤ | 水回り床面積 + 床暖房下地 + 下地更新 | — |
| 天井クロス | 天井面積(㎡) | — |
| 壁クロス | 壁面積(㎡) | — |
| 建具 | 図面から自動カウント（1LDK=7枚, 2LDK=10枚, 3LDK=15枚） | — |

### 壁面積計算

```
壁面積 = (間仕切壁延長 × 天井高 × 2) + (躯体壁延長 × 天井高 × 1) − 開口部面積
開口部面積 = ドア数 × (0.8m × 2.0m) + 窓数 × (1.5m × 1.2m)
※ 躯体壁処理: GL工法=片面(係数1)
```

### 間仕切壁延長の目安

- 1LDK（40〜50㎡）: 12〜18m
- 2LDK（50〜65㎡）: 15〜25m
- 3LDK（65〜80㎡）: 20〜30m
※ 30mを超える場合は躯体壁を含めている可能性が高い

## AI解析プロンプト

### 図面の線種ルール（実際の図面凡例に基づく）

■ 躯体壁（外周壁・RC壁）= 間仕切壁に含めない！
  - 濃紺または黒で塗りつぶされた太い壁
  - 図面の最も外側（バルコニー側、窓側、玄関側）
  - PS（パイプスペース）、MB（メーターボックス）も同様に塗りつぶし

■ 間仕切壁（LGS壁）= これだけをpartition_wall_length_mに含める！
  - 青色または水色の細い線で描かれた壁
  - 室内を仕切る壁（部屋と部屋の間）
  - 躯体壁より明らかに薄い

### 期待するJSON出力形式
```json
{
  "property_name": "物件名",
  "layout_type": "2LDK",
  "total_floor_area_sqm": 55,
  "partition_wall_length_m": 20,
  "ceiling_height_mm": 2400,
  "rooms": [
    {
      "name": "LDK",
      "area_tsubo": 8.1,
      "area_sqm": 26.8,
      "width_mm": 5000,
      "depth_mm": 5360,
      "floor_type": "flooring",
      "wall_type": "partition"
    }
  ],
  "openings": [
    { "type": "開き戸", "width_mm": 800, "height_mm": 2035, "room": "LDK" }
  ],
  "equipment": {
    "ub_size": "1216",
    "kitchen": "I型 2550",
    "washstand": "W750"
  },
  "storage": [
    { "type": "closet", "width_mm": 1800, "has_makuradana": true, "has_hanger_pipe": true }
  ],
  "special": [
    { "type": "室内窓", "details": "LDK-洋室間" },
    { "type": "床暖房", "details": "リビング", "area_sqm": 2.7 }
  ]
}
```

## 実績データ（54ファイルより抽出）

| 物件名 | 間取り | 合計金額 | PB12.5 | PB9.5 | Mクロス | 垂木 | 天井CL | 壁CL | 巾木 |
|-------|------|---------|--------|-------|--------|------|--------|------|------|
| 朝日パリオ305 | 2LDK | 620万 | 40枚 | 30枚 | 7枚 | 25束 | 55㎡ | 198㎡ | — |
| 別物件ミドル | 2LDK | 665万 | 50枚 | 35枚 | 7枚 | 25束 | 65㎡ | 234㎡ | — |
| 寿401 HG | 2LDK | 735万 | — | 30枚 | 7枚 | 20束 | 55㎡ | 198㎡ | — |
| 3LDK 70㎡ | 3LDK | 535万 | 35枚 | 30枚 | 7枚 | 20束 | 75㎡ | 270㎡ | 10m |
| 目白テラスドハウス3A | — | 722万 | 40枚 | 35枚 | 7枚 | 27束 | 75㎡ | 270㎡ | 15m |
| 大型物件 | — | — | 60枚 | 40枚 | 7枚 | 30束 | — | — | 40m |

### UBサイズ実績

- 1216: スタンダード（1LDK〜2LDK）
- 1317: ミドル（2LDK）
- 1416: 中型（3LDK）
- 1418: 大型（3LDK〜4LDK）
- 1616: ハイグレード大型

## 資材カテゴリ一覧

計算で出力される資材カテゴリ:

1. **解体工事**: 解体工事、解体廃材処分
2. **仮設工事**: 養生費
3. **左官工事**: 玄関土間左官補修、床左官補修
4. **大工工事**: 天井下地、壁下地、玄関上がり框、壁下地補強
5. **下地材**: PB 12.5mm、PB 9.5mm、Mクロス、垂木、ラワンベニヤ、ラワンランバー
6. **床材**: フローリング、床見切り、水回りフロアタイル、玄関土間タイル
7. **造作材**: 巾木、枕棚、ハンガーパイプ
8. **仕上材**: 天井クロス、壁クロス、アクセントクロス、ダイノックシート
9. **建具**: 建具一式、下駄箱
10. **設備**: UB、キッチン、洗面台、トイレ、給湯器、床暖房
11. **設備工事**: 給排水配管、UB接続、各種取付工事
12. **ガス工事**: ガス配管、コンロ繋ぎ、給湯器繋ぎ
13. **電気工事**: 分電盤、配線、ダウンライト、火災報知器
14. **電材**: 配線器具、TV端子、人感スイッチ、照明器具
15. **サッシ工事**: 網戸張替え
16. **内装材**: カーテンレール、レジスター、スリーブキャップ
17. **現場管理**: 施工管理費、現場諸経費
18. **諸経費**: ルームクリーニング、検査費

## 開発コマンド

```bash
# バックエンド
cd backend-node
npm install
npm run dev

# フロントエンド
cd frontend
npm install
npm run dev
```

## 環境変数

```env
# backend-node/.env
DATABASE_URL="file:./dev.db"
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
CLAUDE_API_KEY=your_claude_api_key
PORT=8000
```

## デプロイ

### フロントエンド (Vercel)
- Root Directory: `frontend`
- Framework: Vite
- 環境変数: `VITE_API_URL=https://your-backend.onrender.com/api`

### バックエンド (Render)
- Root Directory: `backend-node`
- Build Command: `npm install`
- Start Command: `npx prisma generate && npx prisma db push && npm start`
- 環境変数: `GOOGLE_GEMINI_API_KEY`, `CLAUDE_API_KEY`, `DATABASE_URL`
