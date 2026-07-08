import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

/**
 * オプショナル認証: トークンがあれば検証してreq.companyIdをセット、なくても通す
 * （ログインなしでも使える現行UXを維持しつつ、データはcompanyId単位で分離する）
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.companyId = decoded.companyId;
    } catch {
      // 無効なトークンは無視して未認証として扱う
    }
  }
  next();
}

/**
 * 必須認証: トークンがなければ401
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.companyId = decoded.companyId;
    next();
  } catch {
    return res.status(401).json({ error: 'トークンが無効です' });
  }
}

/**
 * プロジェクトの所有スコープ条件
 * ログイン中: 自社のプロジェクトのみ
 * 未ログイン: ゲスト（companyId null）かつ作成時に発行されたX-Guest-Tokenが一致するもののみ
 * （ゲスト全員が同一スコープを共有するとID総当たりで他人のプロジェクトを操作できてしまう）
 */
export function projectScope(req) {
  if (req.companyId) {
    return { companyId: req.companyId };
  }
  const guestToken = req.headers['x-guest-token'];
  return {
    companyId: null,
    // トークン未提示は何にもマッチさせない（guestToken: undefined だとPrismaが条件自体を無視するため）
    guestToken: typeof guestToken === 'string' && guestToken.length > 0 ? guestToken : '__no_token__',
  };
}
