import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// トークン総当たり対策（管理APIは人間が使う頻度しかない）
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});
router.use(adminLimiter);

/** タイミング攻撃を避けた固定時間比較 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 運営者用の最小admin API（管理画面なし・curl/スクリプトから利用）
 *
 * 有効化: 環境変数 ADMIN_TOKEN を設定（未設定なら全エンドポイント404）
 * 認証:   リクエストヘッダ X-Admin-Token にADMIN_TOKENと同じ値を付与
 *
 * 使用例:
 *   curl -H "X-Admin-Token: $ADMIN_TOKEN" https://<backend>/api/admin/companies
 *   curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" \
 *        https://<backend>/api/admin/companies/1/reset-password
 */
router.use((req, res, next) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    // 機能自体を無効化（存在も明かさない）
    return res.status(404).json({ error: 'Not found' });
  }
  if (!safeEqual(req.headers['x-admin-token'] || '', adminToken)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// GET /api/admin/companies - 会社一覧+利用状況
router.get('/companies', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        projects: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, name: true, createdAt: true },
        },
      },
    });

    // ゲスト利用状況も添える
    const guestProjectCount = await prisma.project.count({ where: { companyId: null } });

    res.json({
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        createdAt: c.createdAt,
        projectCount: c.projects.length,
        lastProjectAt: c.projects[0]?.createdAt || null,
        recentProjects: c.projects.slice(0, 5).map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt })),
      })),
      guestProjectCount,
    });
  } catch (error) {
    console.error('Admin companies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/companies/:id/reset-password - パスワードリセット
// bodyに { "new_password": "..." } を渡せばその値に、省略時はランダム生成して一度だけ返す
router.post('/companies/:id/reset-password', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid company id' });
    }

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const newPassword = req.body?.new_password || crypto.randomBytes(9).toString('base64url');
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'パスワードは6文字以上にしてください' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.company.update({ where: { id }, data: { passwordHash } });

    // 生成パスワードはこのレスポンスでのみ返す（DBには平文を残さない）
    res.json({
      message: `${company.name} のパスワードをリセットしました`,
      companyId: company.id,
      email: company.email,
      newPassword,
    });
  } catch (error) {
    console.error('Admin reset-password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
