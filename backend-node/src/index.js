import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';

dotenv.config();

// configはdotenv後にimport（JWT_SECRETの本番チェックが走る）
const { ALLOWED_ORIGINS, isProduction } = await import('./config.js');
const { default: packagesRouter } = await import('./routes/packages.js');
const { default: projectsRouter } = await import('./routes/projects.js');
const { default: authRouter } = await import('./routes/auth.js');
const { default: unitPricesRouter } = await import('./routes/unitPrices.js');
const { default: adminRouter } = await import('./routes/admin.js');
const { default: productsRouter } = await import('./routes/products.js');
const { startGuestCleanup } = await import('./services/projectCleanup.js');
const { makeLimiter } = await import('./middleware/rateLimits.js');
const { removeCopiedDefaults } = await import('../scripts/migrate-remove-copied-defaults.js');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8000;

// Render等のリバースプロキシ配下でクライアントIPを正しく取得（レートリミット用）
app.set('trust proxy', 1);

// Middleware
// セキュリティヘッダ（API専用サーバーのためデフォルト設定で十分）
app.use(helmet());
// ALLOWED_ORIGINS（カンマ区切り）が設定されていればそのオリジンのみ許可
app.use(cors(ALLOWED_ORIGINS ? { origin: ALLOWED_ORIGINS } : {}));
app.use(express.json());

// 認証エンドポイントのレートリミット（ブルートフォース対策）
app.use('/api/auth', makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: '試行回数が多すぎます。しばらく待ってから再試行してください。',
}));

// Make prisma available to routes
app.set('prisma', prisma);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/unit-prices', unitPricesRouter);
app.use('/api/products', productsRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  // 本番では内部エラーの詳細をクライアントに返さない
  const message = isProduction ? 'Internal server error' : err.message;
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// ゲストプロジェクトの定期削除（起動時+6時間ごと、24時間経過分を削除）
startGuestCleanup(prisma);

// 旧仕様（登録時に標準単価をコピー）の残骸を掃除（冪等・2回目以降は対象0件）
removeCopiedDefaults(prisma).catch(e => {
  console.error('単価コピー移行エラー:', e.message);
});
