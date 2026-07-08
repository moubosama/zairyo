import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

const router = express.Router();
const JWT_EXPIRES_IN = '7d';

// POST /api/auth/register - 会社登録
router.post('/register', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { name, email, password, invite_code } = req.body;

    // 招待コードチェック（REGISTRATION_CODE設定時のみ有効）
    // アカウント発行を運営者の管理下に置くためのゲート
    if (process.env.REGISTRATION_CODE && invite_code !== process.env.REGISTRATION_CODE) {
      return res.status(403).json({ error: '招待コードが正しくありません' });
    }

    // バリデーション
    if (!name || !email || !password) {
      return res.status(400).json({ error: '会社名、メールアドレス、パスワードは必須です' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'パスワードは8文字以上で入力してください' });
    }

    // メールアドレスの重複チェック
    const existing = await prisma.company.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(400).json({ error: 'このメールアドレスは既に登録されています' });
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, 10);

    // 会社作成
    // ※ 標準単価のコピーはしない。計算時に標準単価へ自社単価を重ねる方式のため、
    //   カスタムしない限り常に最新の標準単価が適用される
    const company = await prisma.company.create({
      data: {
        name,
        email,
        passwordHash
      }
    });

    // JWT発行
    const token = jwt.sign(
      { companyId: company.id, email: company.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      message: '登録が完了しました',
      token,
      company: {
        id: company.id,
        name: company.name,
        email: company.email
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: '登録に失敗しました' });
  }
});

// POST /api/auth/login - ログイン
router.post('/login', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { email, password } = req.body;

    // バリデーション
    if (!email || !password) {
      return res.status(400).json({ error: 'メールアドレスとパスワードを入力してください' });
    }

    // 会社検索
    const company = await prisma.company.findUnique({
      where: { email }
    });

    if (!company) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが間違っています' });
    }

    // パスワード検証
    const isValid = await bcrypt.compare(password, company.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが間違っています' });
    }

    // JWT発行
    const token = jwt.sign(
      { companyId: company.id, email: company.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: 'ログインしました',
      token,
      company: {
        id: company.id,
        name: company.name,
        email: company.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'ログインに失敗しました' });
  }
});

// GET /api/auth/me - 現在のユーザー情報
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    });

    if (!company) {
      return res.status(404).json({ error: '会社が見つかりません' });
    }

    res.json(company);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: '情報の取得に失敗しました' });
  }
});

// POST /api/auth/change-password - パスワード変更（本人用）
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: '現在のパスワードと新しいパスワードを入力してください' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ error: '新しいパスワードは8文字以上で入力してください' });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.companyId }
    });

    if (!company) {
      return res.status(404).json({ error: '会社が見つかりません' });
    }

    const isValid = await bcrypt.compare(current_password, company.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: '現在のパスワードが間違っています' });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await prisma.company.update({
      where: { id: company.id },
      data: { passwordHash }
    });

    res.json({ message: 'パスワードを変更しました' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'パスワードの変更に失敗しました' });
  }
});

// 認証ミドルウェア
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'トークンが無効です' });
    }
    req.companyId = decoded.companyId;
    req.companyEmail = decoded.email;
    next();
  });
}

export default router;
