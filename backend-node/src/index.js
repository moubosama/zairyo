import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

// configはdotenv後にimport（JWT_SECRETの本番チェックが走る）
const { ALLOWED_ORIGINS, isProduction } = await import('./config.js');
const { default: packagesRouter } = await import('./routes/packages.js');
const { default: projectsRouter } = await import('./routes/projects.js');
const { default: authRouter } = await import('./routes/auth.js');
const { default: unitPricesRouter } = await import('./routes/unitPrices.js');
const { default: productsRouter } = await import('./routes/products.js');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8000;

// Middleware
// ALLOWED_ORIGINS（カンマ区切り）が設定されていればそのオリジンのみ許可
app.use(cors(ALLOWED_ORIGINS ? { origin: ALLOWED_ORIGINS } : {}));
app.use(express.json());

// Make prisma available to routes
app.set('prisma', prisma);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/unit-prices', unitPricesRouter);
app.use('/api/products', productsRouter);

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
