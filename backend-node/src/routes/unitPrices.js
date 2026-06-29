import express from 'express';
import { authenticateToken } from './auth.js';
import ExcelJS from 'exceljs';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/unit-prices - 単価一覧取得
router.get('/', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');

    const unitPrices = await prisma.unitPrice.findMany({
      where: { companyId: req.companyId },
      orderBy: [
        { category: 'asc' },
        { materialName: 'asc' }
      ]
    });

    res.json(unitPrices);
  } catch (error) {
    console.error('Get unit prices error:', error);
    res.status(500).json({ error: '単価の取得に失敗しました' });
  }
});

// PUT /api/unit-prices/:id - 単価更新
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const priceId = parseInt(req.params.id);
    const { unitPrice } = req.body;

    // 自社の単価か確認
    const existing = await prisma.unitPrice.findFirst({
      where: {
        id: priceId,
        companyId: req.companyId
      }
    });

    if (!existing) {
      return res.status(404).json({ error: '単価が見つかりません' });
    }

    const updated = await prisma.unitPrice.update({
      where: { id: priceId },
      data: { unitPrice: parseInt(unitPrice) }
    });

    res.json(updated);
  } catch (error) {
    console.error('Update unit price error:', error);
    res.status(500).json({ error: '単価の更新に失敗しました' });
  }
});

// POST /api/unit-prices - 単価追加
router.post('/', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { materialName, spec, category, unitPrice, unit } = req.body;

    if (!materialName || !unitPrice || !unit) {
      return res.status(400).json({ error: '資材名、単価、単位は必須です' });
    }

    const newPrice = await prisma.unitPrice.create({
      data: {
        companyId: req.companyId,
        materialName,
        spec: spec || null,
        category: category || null,
        unitPrice: parseInt(unitPrice),
        unit
      }
    });

    res.status(201).json(newPrice);
  } catch (error) {
    console.error('Create unit price error:', error);
    res.status(500).json({ error: '単価の追加に失敗しました' });
  }
});

// DELETE /api/unit-prices/:id - 単価削除
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const priceId = parseInt(req.params.id);

    // 自社の単価か確認
    const existing = await prisma.unitPrice.findFirst({
      where: {
        id: priceId,
        companyId: req.companyId
      }
    });

    if (!existing) {
      return res.status(404).json({ error: '単価が見つかりません' });
    }

    await prisma.unitPrice.delete({
      where: { id: priceId }
    });

    res.json({ message: '削除しました' });
  } catch (error) {
    console.error('Delete unit price error:', error);
    res.status(500).json({ error: '単価の削除に失敗しました' });
  }
});

// POST /api/unit-prices/import - Excelインポート
router.post('/import', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const prisma = req.app.get('prisma');

    if (!req.file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];
    const imported = [];
    const errors = [];

    // ヘッダー行をスキップして2行目から読み込み
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // ヘッダースキップ

      const materialName = row.getCell(1).value?.toString()?.trim();
      const spec = row.getCell(2).value?.toString()?.trim() || null;
      const category = row.getCell(3).value?.toString()?.trim() || null;
      const unitPrice = parseInt(row.getCell(4).value) || 0;
      const unit = row.getCell(5).value?.toString()?.trim() || '';

      if (!materialName) {
        errors.push(`行${rowNumber}: 資材名が空です`);
        return;
      }

      if (unitPrice <= 0) {
        errors.push(`行${rowNumber}: 単価が無効です`);
        return;
      }

      imported.push({
        materialName,
        spec,
        category,
        unitPrice,
        unit
      });
    });

    // 既存の単価を削除して新規作成（上書きモード）
    await prisma.unitPrice.deleteMany({
      where: { companyId: req.companyId }
    });

    await prisma.unitPrice.createMany({
      data: imported.map(item => ({
        companyId: req.companyId,
        ...item
      }))
    });

    res.json({
      message: `${imported.length}件の単価をインポートしました`,
      imported: imported.length,
      errors
    });
  } catch (error) {
    console.error('Import unit prices error:', error);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

// GET /api/unit-prices/export - Excelエクスポート
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');

    const unitPrices = await prisma.unitPrice.findMany({
      where: { companyId: req.companyId },
      orderBy: [
        { category: 'asc' },
        { materialName: 'asc' }
      ]
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('単価表');

    // ヘッダー
    worksheet.columns = [
      { header: '資材名', key: 'materialName', width: 40 },
      { header: '規格', key: 'spec', width: 20 },
      { header: 'カテゴリ', key: 'category', width: 15 },
      { header: '単価', key: 'unitPrice', width: 12 },
      { header: '単位', key: 'unit', width: 8 }
    ];

    // ヘッダースタイル
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD4A853' }
    };

    // データ追加
    unitPrices.forEach(price => {
      worksheet.addRow({
        materialName: price.materialName,
        spec: price.spec || '',
        category: price.category || '',
        unitPrice: price.unitPrice,
        unit: price.unit
      });
    });

    // 単価列のフォーマット
    worksheet.getColumn('unitPrice').numFmt = '#,##0';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=unit_prices.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export unit prices error:', error);
    res.status(500).json({ error: 'エクスポートに失敗しました' });
  }
});

// POST /api/unit-prices/reset - 標準単価にリセット
router.post('/reset', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');

    // 現在の単価を削除
    await prisma.unitPrice.deleteMany({
      where: { companyId: req.companyId }
    });

    // 標準単価をコピー
    const defaultPrices = await prisma.defaultUnitPrice.findMany();

    if (defaultPrices.length > 0) {
      await prisma.unitPrice.createMany({
        data: defaultPrices.map(dp => ({
          companyId: req.companyId,
          materialName: dp.materialName,
          spec: dp.spec,
          category: dp.category,
          unitPrice: dp.unitPrice,
          unit: dp.unit
        }))
      });
    }

    res.json({ message: '標準単価にリセットしました' });
  } catch (error) {
    console.error('Reset unit prices error:', error);
    res.status(500).json({ error: 'リセットに失敗しました' });
  }
});

export default router;
