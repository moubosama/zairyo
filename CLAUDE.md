# ZAIRYO - 資材拾いアシスタント

## プロジェクト概要

ZAIRYOは、工務店向けのリノベーション資材拾い自動化システムです。
AI（Gemini API）による図面解析と自社標準仕様テンプレートを組み合わせ、資材リスト作成を大幅に効率化します。

## 技術スタック

- **フロントエンド**: Vue.js 3 + Vite + Tailwind CSS
- **バックエンド**: Node.js + Express + Prisma ORM
- **AI解析**: Google Gemini API (gemini-2.5-flash) - 図面読み取りのみ
- **データベース**: SQLite
- **Excel出力**: ExcelJS

## ディレクトリ構成

```
zairyo/
├── backend-node/            # Node.js バックエンド
│   ├── src/
│   │   ├── routes/
│   │   │   ├── packages.js
│   │   │   └── projects.js
│   │   └── services/
│   │       ├── claudeApi.js
│   │       └── materialCalculator.js
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

1. **Step 1: パッケージ選択** - スタンダード/ミドル/ハイグレードから選択
2. **Step 2: 図面アップロード** - PDF/PNG/JPGをアップロード、Gemini APIで解析
3. **Step 3: 仕様確認** - 標準仕様との差分をボタン選択で確認
4. **Step 4: 資材リスト出力** - 計算結果を表示、Excel出力

## デザインガイドライン

- **テーマ**: ダークテーマ
- **アクセントカラー**: ゴールド (#D4A853)
- **フォント**: Noto Sans JP + DM Mono

## APIエンドポイント

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| GET | /api/packages | パッケージ一覧取得 |
| GET | /api/projects | プロジェクト一覧取得 |
| POST | /api/projects | 新規プロジェクト作成 |
| POST | /api/projects/{id}/upload | 図面アップロード+AI解析 |
| POST | /api/projects/{id}/overrides | 仕様変更保存 |
| POST | /api/projects/{id}/calculate | 資材計算実行 |
| GET | /api/projects/{id}/materials | 資材リスト取得 |
| GET | /api/projects/{id}/export | Excelダウンロード |

## 計算ロジック（5現場実績データに基づく）

AIは図面読み取りのみ。資材数量の計算はNode.js側で実行。

### 主要計算式

| 資材 | 計算式 | ロス率 | 実績値 |
|-----|-------|-------|-------|
| PB 12.5 | 壁面積(㎡) ÷ 1.6562 × 1.05 | +5% | 8～50枚 |
| PB 9.5 | 天井面積(㎡) ÷ 1.6562 × 1.05 | +5% | 30～40枚 |
| Mクロス | 水回り面積から算出（最大7枚） | — | 2～7枚 |
| 垂木 | (間仕切壁延長÷0.303×2 + 天井面積÷0.303) ÷ 12 | — | 10～25束 |
| フローリング | 居室床面積(㎡) × 1.1 | +10% | 16～70㎡ |
| CF | 水回り床面積(㎡) × 1.1 | +10% | 変動 |
| 巾木 | 壁延長(m) − 開口部幅合計 | — | 10～30m |
| ラワンベニヤ | 水回り床面積から算出（最低4枚） | — | 4～15枚 |
| 天井クロス | 天井面積(㎡) | — | 55～75㎡ |
| 壁クロス | 壁面積(㎡) | — | 198～270㎡ |
| 建具 | 図面から自動カウント | — | 7～15枚 |

### 壁面積計算

```
壁面積 = (間仕切壁延長 × 天井高 × 2) + (躯体壁延長 × 天井高 × 係数) − 開口部面積
開口部面積 = ドア数 × (0.8m × 2.0m) + 窓数 × (1.5m × 1.2m)
※ 躯体壁処理: GL工法=片面(係数1)、木軸ふかし=両面(係数2)
```

## Gemini API プロンプト

### システムプロンプト
```
あなたは建築図面を解析する専門家です。アップロードされたリノベーション計画平面図から、資材計算に必要な情報をJSON形式で抽出してください。

【重要な解析ポイント】
1. 各部屋の面積（畳数・㎡）と寸法（mm単位）を正確に読み取る
2. UBサイズ（1216、1317、1418等）を確認
3. キッチンサイズ（I型2100、2550等）を確認
4. 洗面台の幅（W750、W900等）を確認
5. 収納（クローゼット）の幅と枕棚+ハンガーパイプの有無
6. 室内窓、床暖房などの特殊仕様
```

### 期待するJSON出力形式
```json
{
  "property_name": "物件名",
  "layout_type": "2LDK",
  "total_dimensions": { "width_mm": 10000, "depth_mm": 8000 },
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
    "ub_spec": "TOTO WT",
    "kitchen": "I型 2550",
    "kitchen_spec": "LIXIL ES 食洗機あり",
    "washstand": "W750",
    "washstand_spec": "LIXIL CLINE 三面鏡LED"
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

## 標準パッケージ（5現場実績に基づく）

### スタンダード (620万円～)
- 対象: 1LDK～2LDK
- UB: TOTO WT 1216～1317（浴室乾燥機あり）
- トイレ: TOTO 一体型便器ZJ2 (ZR2)
- キッチン: LIXIL ES 2550 スライド・食洗機あり
- 洗面台: LIXIL CLINE / EV W750～900（三面鏡LED）
- 床: DAIKEN MYオトユカ / MYフロア
- 建具: Panasonic ベリティス PA型 H2035

### ミドル (650万円～)
- 対象: 2LDK
- UB: TOTO WT 1317～（浴室乾燥機あり）
- トイレ: TOTO ZJ2
- キッチン: LIXIL ES 2550
- 洗面台: LIXIL EV1000 (D500) フルスライド+三面鏡（スリムLED）
- 床暖房: 電気式
- 床: Panasonic ウスイータ 1.5mmリフォームフローリング

### ハイグレード (735万円～)
- 対象: 2LDK～
- UB: LIXIL リノビオP 1317（4面アクセントパネル）施工費込み約60万
- トイレ: Panasonic アラウーノS160 タイプ1 + TOTO コンフォートM手洗器別置き
- 床暖房: ガス温水式 RUFH-EP2408AT2-6(A) 約34万 + リビング2.7㎡
- エアコン: 天カセマルチ MXZ6821AS + MLZGX5022ASIN×2台
- 玄関: 大理石タイル（名古屋セラミック 400角 @9,800/㎡）
- 床: NODA カナエル C12 Jベース

## 実績データ（5現場分）

| 物件名 | 間取り | 合計金額 | PB12.5 | PB9.5 | 垂木 | フローリング | 壁クロス |
|-------|------|---------|--------|-------|------|------------|---------|
| 朝日パリオ北千住305号室 | 2LDK | 620万 | 40枚 | 30枚 | 20束 | 50㎡ | 198㎡ |
| 新物件（ミドル） | 2LDK | 665万 | 50枚 | 35枚 | 25束 | 61㎡ | 234㎡ |
| 寿マンション401号室 | 2LDK | 840万 | — | 30枚 | — | — | 198㎡ |
| ハイグレード物件（3LDK） | 3LDK | 682万 | 30枚 | 40枚 | 20束 | 70㎡ | 270㎡ |
| ハイグレード物件（天カセ・大理石） | 2LDK | 735万 | 30枚 | 30枚 | 20束 | 50㎡ | 198㎡ |

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
- Start Command: `npx prisma generate && npx prisma db push && node prisma/seed.js && npm start`
- 環境変数: `GOOGLE_GEMINI_API_KEY`, `DATABASE_URL`
