# ZAIRYO - 資材拾いアシスタント

工務店向けのリノベーション資材拾い自動化システムです。
AI（Gemini API）による図面解析と自社標準仕様テンプレートを組み合わせ、資材リスト作成を効率化します。


## ⚠️ 本番運用の注意（データ永続化）

現在の構成（Render + SQLite `file:./dev.db`）では、**Renderのディスクがエフェメラルなため、再デプロイのたびにプロジェクト履歴・登録会社・アップロード画像がすべて消えます**。本番運用する場合は以下の移行が必要です。

1. **DB**: Render PostgreSQL（またはNeon等）を作成し、`schema.prisma` の `provider` を `postgresql` に変更、`DATABASE_URL` を差し替えて `npx prisma migrate deploy`
2. **アップロード画像**: S3 / Cloudflare R2 等のオブジェクトストレージへ移行

## 環境変数（backend-node/.env.example 参照）

| 変数 | 必須 | 説明 |
|------|------|------|
| DATABASE_URL | ✅ | DB接続文字列 |
| ANTHROPIC_API_KEY | 推奨 | Claude解析用（Geminiとのデュアル照合） |
| GOOGLE_GEMINI_API_KEY | 推奨 | Gemini解析用 |
| JWT_SECRET | ✅（本番） | 未設定だと本番では起動しません |
| ALLOWED_ORIGINS | 推奨（本番） | CORS許可オリジン（カンマ区切り） |

## デモ

- **フロントエンド**: https://zairyo.vercel.app
- **バックエンドAPI**: https://zairyo.onrender.com

## 技術スタック

- **フロントエンド**: Vue.js 3 + Vite + Tailwind CSS
- **バックエンド**: Node.js + Express + Prisma ORM
- **データベース**: SQLite
- **AI解析**: Google Gemini API (gemini-2.5-flash)
- **Excel出力**: ExcelJS

## ローカル開発

### 必要環境

- Node.js 18以上
- npm

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/moubosama/zairyo.git
cd zairyo
```

### バックエンド起動

```bash
cd backend-node
npm install

# .envファイルを作成
# GEMINI_API_KEY=your_gemini_api_key

# データベース初期化
npm run build
npm run db:seed

# 開発サーバー起動
npm run dev
```

バックエンドは http://localhost:8000 で起動します。

### フロントエンド起動

```bash
cd frontend
npm install
npm run dev
```

フロントエンドは http://localhost:3000 で起動します。

## 環境変数

### バックエンド (.env)

```env
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY=your_gemini_api_key
PORT=8000
```

### フロントエンド

ローカル開発時は環境変数不要（vite.config.jsでプロキシ設定済み）

本番環境では以下を設定:
```env
VITE_API_URL=https://your-backend-url.com/api
```

## デプロイ方法

### フロントエンド (Vercel)

1. GitHubリポジトリをVercelに接続
2. Root Directory: `frontend`
3. Framework Preset: `Vite`
4. 環境変数を設定:
   - `VITE_API_URL`: `https://your-backend-url.com/api`
5. デプロイ

### バックエンド (Render)

1. GitHubリポジトリをRenderに接続
2. Service Type: `Web Service`
3. Root Directory: `backend-node`
4. Build Command: `npm install`
5. Start Command: `npx prisma generate && npx prisma db push && node prisma/seed.js && npm start`
6. 環境変数を設定:
   - `GEMINI_API_KEY`: Google Gemini APIキー
   - `DATABASE_URL`: `file:./dev.db`
7. デプロイ

## 使い方

1. **パッケージ選択**: スタンダード/ミドル/ハイグレードから選択
2. **図面アップロード**: PDF/PNG/JPGをアップロード、AIで解析
3. **仕様確認**: 標準仕様との差分をボタン選択で確認
4. **資材リスト出力**: 計算結果を表示、Excelダウンロード

## APIエンドポイント

| メソッド | エンドポイント | 説明 |
|---------|--------------|------|
| GET | /api/packages | パッケージ一覧取得 |
| GET | /api/projects | プロジェクト一覧取得 |
| POST | /api/projects | 新規プロジェクト作成 |
| POST | /api/projects/:id/upload | 図面アップロード+AI解析 |
| POST | /api/projects/:id/overrides | 仕様変更保存 |
| POST | /api/projects/:id/calculate | 資材計算実行 |
| GET | /api/projects/:id/materials | 資材リスト取得 |
| GET | /api/projects/:id/export | Excelダウンロード |

## ライセンス

MIT

## 作成者

株式会社マイニングアーツ
