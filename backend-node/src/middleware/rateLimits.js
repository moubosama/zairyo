import rateLimit from 'express-rate-limit';

/**
 * レートリミットの共通ファクトリ
 * ヘッダ方針（standardHeaders/legacyHeaders）とエラー形式（{error}）を全リミッターで統一する
 * ※ IPキーの正確性は index.js の app.set('trust proxy', 1) に依存
 */
export function makeLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}
