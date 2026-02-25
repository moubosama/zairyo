import { Router } from 'express';

const router = Router();

// GET /api/packages - パッケージ一覧取得
router.get('/', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const packages = await prisma.package.findMany({
      orderBy: { basePrice: 'asc' }
    });

    const formatted = packages.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      code: pkg.code,
      description: pkg.description,
      base_price: Math.floor(pkg.basePrice / 10000), // 万円単位
      target_layout: pkg.code === 'standard' ? '1LDK〜2LDK' : pkg.code === 'middle' ? '2LDK' : '2LDK〜',
      specs_json: JSON.parse(pkg.specs),
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/packages/:id
router.get('/:id', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const pkg = await prisma.package.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    res.json({
      ...pkg,
      specs: JSON.parse(pkg.specs)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
