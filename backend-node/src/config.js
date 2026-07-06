/**
 * アプリ設定の一元管理
 * JWT_SECRET はここでのみ解決する（各ルートでのデフォルト値フォールバック禁止）
 */

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

if (isProduction && !process.env.JWT_SECRET) {
  // 本番でシークレット未設定のまま起動するとトークン偽造が可能になるため即死させる
  console.error('FATAL: JWT_SECRET is not set. Refusing to start in production.');
  process.exit(1);
}

export const JWT_SECRET =
  process.env.JWT_SECRET || 'zairyo-dev-only-secret'; // 開発環境専用フォールバック

export const JWT_EXPIRES_IN = '7d';

// CORS許可オリジン（カンマ区切り）。未設定なら開発用に全許可
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : null;

export { isProduction };
