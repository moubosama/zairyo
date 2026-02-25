# ZAIRYO - 資材拾いアシスタント

## プロジェクト概要

ZAIRYOは、工務店向けのリノベーション資材拾い自動化システムです。
AI（Claude API）による図面解析と自社標準仕様テンプレートを組み合わせ、資材リスト作成を大幅に効率化します。

## 技術スタック

- **フロントエンド**: Vue.js 3 + Tailwind CSS
- **バックエンド**: Laravel 11 (PHP 8.3)
- **AI解析**: Claude API (Sonnet 4.5) - 図面読み取りのみ
- **データベース**: MySQL 8.0
- **ファイルストレージ**: Laravel Storage (S3 or local)
- **Excel出力**: PhpSpreadsheet / Laravel Excel

## ディレクトリ構成

```
zairyo/
├── backend/                 # Laravel バックエンド
│   ├── app/
│   │   ├── Http/
│   │   │   └── Controllers/
│   │   │       ├── PackageController.php
│   │   │       ├── ProjectController.php
│   │   │       └── MaterialController.php
│   │   ├── Models/
│   │   │   ├── Package.php
│   │   │   ├── Project.php
│   │   │   ├── AiReading.php
│   │   │   ├── Override.php
│   │   │   ├── MaterialList.php
│   │   │   └── ActualResult.php
│   │   └── Services/
│   │       ├── ClaudeApiService.php
│   │       └── MaterialCalculatorService.php
│   ├── database/
│   │   └── migrations/
│   └── routes/
│       └── api.php
├── frontend/                # Vue.js フロントエンド
│   ├── src/
│   │   ├── components/
│   │   ├── views/
│   │   ├── stores/
│   │   └── services/
│   └── tailwind.config.js
└── CLAUDE.md
```

## 全体フロー

1. **Step 1: パッケージ選択** - スタンダード/ミドル/ハイグレードから選択
2. **Step 2: 図面アップロード** - PDF/PNG/JPGをアップロード、Claude APIで解析
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
| POST | /api/projects | 新規プロジェクト作成 |
| POST | /api/projects/{id}/upload | 図面アップロード+AI解析 |
| POST | /api/projects/{id}/overrides | 仕様変更保存 |
| POST | /api/projects/{id}/calculate | 資材計算実行 |
| GET | /api/projects/{id}/materials | 資材リスト取得 |
| GET | /api/projects/{id}/export | Excelダウンロード |

## 計算ロジック

AIは図面読み取りのみ。資材数量の計算はLaravel側で実行。

### 主要計算式

| 資材 | 計算式 | ロス率 |
|-----|-------|-------|
| PB 12.5 | 壁面積(㎡) ÷ 1.6562 × 1.05 | +5% |
| PB 9.5 | 天井面積(㎡) ÷ 1.6562 × 1.05 | +5% |
| Mクロス | 固定: 7枚 | — |
| フローリング | 居室床面積(㎡) × 1.1 | +10% |
| CF | 水回り床面積(㎡) × 1.1 | +10% |
| 巾木 | 壁延長(m) − 開口部幅合計 | — |
| ラワンベニヤ | 固定: 4枚 | — |

### 壁面積計算

```
壁面積 = (間仕切壁延長 × 天井高 × 2) + (躯体壁延長 × 天井高 × 1) − 開口部面積
開口部面積 = ドア数 × (0.8m × 2.0m) + 窓数 × (1.5m × 1.2m)
```

## Claude API プロンプト

### システムプロンプト
```
あなたは建築図面を解析する専門家です。アップロードされた計画平面図から、以下の情報をJSON形式で抽出してください。
```

### 期待するJSON出力形式
```json
{
  "property_name": "物件名",
  "layout_type": "2LDK",
  "total_dimensions": { "width_mm": 10000, "depth_mm": 8000 },
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
```

## 標準パッケージ

### スタンダード (620万円～)
- 対象: 1LDK～2LDK
- UB: TOTO WT
- トイレ: TOTO ZJ2
- キッチン: LIXIL ES

### ミドル (650万円～)
- 対象: 2LDK
- UB: TOTO WT 1317～
- トイレ: TOTO ZJ2
- キッチン: LIXIL ES 2550
- 床暖房: 電気式

### ハイグレード (735万円～)
- 対象: 2LDK～
- UB: LIXIL リノビオP
- トイレ: Panasonic アラウーノS160
- 床暖房: ガス温水式
- エアコン: 天カセマルチ

## 固定値（3現場実績から確定）

- Mクロス: 7枚（洗面室+トイレ）
- ラワンベニヤ: 4枚
- 巾木: 約30m

## 開発コマンド

```bash
# バックエンド
cd backend
composer install
php artisan migrate
php artisan serve

# フロントエンド
cd frontend
npm install
npm run dev
```

## 環境変数

```env
# .env (Laravel)
CLAUDE_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-5-20241022
```
