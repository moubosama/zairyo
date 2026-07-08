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

/**
 * 実効単価一覧（標準単価+自社カスタムのマージ）を構築する
 * /effective と /export の共通ロジック
 */
async function getEffectiveRows(prisma, companyId) {
  const [defaults, customs] = await Promise.all([
    prisma.defaultUnitPrice.findMany({
      orderBy: [{ category: 'asc' }, { materialName: 'asc' }]
    }),
    prisma.unitPrice.findMany({
      where: { companyId },
      orderBy: { id: 'asc' }
    })
  ]);

  const key = (p) => `${p.materialName}|${p.spec || ''}`;
  const customMap = new Map(customs.map(c => [key(c), c]));

  const rows = defaults.map(d => {
    const custom = customMap.get(key(d));
    if (custom) customMap.delete(key(d));
    return {
      materialName: d.materialName,
      spec: d.spec,
      category: d.category,
      unit: d.unit,
      defaultPrice: d.unitPrice,
      customPrice: custom ? custom.unitPrice : null,
      customId: custom ? custom.id : null,
    };
  });

  // 標準単価に存在しない自社独自の資材も末尾に含める
  for (const c of customMap.values()) {
    rows.push({
      materialName: c.materialName,
      spec: c.spec,
      category: c.category,
      unit: c.unit,
      defaultPrice: null,
      customPrice: c.unitPrice,
      customId: c.id,
    });
  }

  return rows;
}

// GET /api/unit-prices/effective - 実効単価一覧（標準単価+自社カスタムのマージ表示）
router.get('/effective', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    res.json(await getEffectiveRows(prisma, req.companyId));
  } catch (error) {
    console.error('Get effective unit prices error:', error);
    res.status(500).json({ error: '単価の取得に失敗しました' });
  }
});

// PUT /api/unit-prices/bulk - 自社単価の一括保存（1トランザクション）
// body: { prices: [{ materialName, spec, category, unit, unitPrice }] }
// unitPriceがnullの行はカスタム解除（削除）として扱う
router.put('/bulk', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const prices = req.body.prices;
    if (!Array.isArray(prices) || prices.length === 0) {
      return res.status(400).json({ error: 'prices must be a non-empty array' });
    }
    if (prices.length > 500) {
      return res.status(400).json({ error: '一度に保存できるのは500件までです' });
    }

    // 事前バリデーション（1件でも不正なら何も書き込まない）
    for (const p of prices) {
      if (!p.materialName || !p.unit) {
        return res.status(400).json({ error: '資材名と単位は必須です' });
      }
      if (p.unitPrice !== null && p.unitPrice !== undefined) {
        const n = parseInt(p.unitPrice);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: `単価が不正です: ${p.materialName}` });
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const p of prices) {
        const where = {
          companyId: req.companyId,
          materialName: p.materialName,
          spec: p.spec || null,
        };
        if (p.unitPrice === null || p.unitPrice === undefined) {
          // カスタム解除 = 自社行を削除して標準単価に戻す
          await tx.unitPrice.deleteMany({ where });
        } else {
          // 重複行（過去の非アトミックな作成で生じたもの）も掃除してから1行に統一
          await tx.unitPrice.deleteMany({ where });
          await tx.unitPrice.create({
            data: {
              ...where,
              category: p.category || null,
              unitPrice: parseInt(p.unitPrice),
              unit: p.unit,
            }
          });
        }
      }
    });

    res.json({ message: `${prices.length}件の単価を保存しました`, saved: prices.length });
  } catch (error) {
    console.error('Bulk upsert unit prices error:', error);
    res.status(500).json({ error: '単価の一括保存に失敗しました' });
  }
});

// PUT /api/unit-prices/upsert - 資材名+規格で自社単価を登録/更新
// （※ PUT /:id より先に定義すること。後だと "upsert" が :id にマッチする）
router.put('/upsert', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { materialName, spec, category, unit, unitPrice } = req.body;

    const price = parseInt(unitPrice);
    if (!materialName || !unit || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: '資材名、単位、0以上の単価は必須です' });
    }

    // specがnullの行はPostgresの複合uniqueで重複を防げない（NULLは非重複扱い）ため、
    // 既存行を全取得→2件以上あれば古い重複を掃除→1行に統一する自己修復方式にする
    const where = {
      companyId: req.companyId,
      materialName,
      spec: spec || null,
    };
    const existing = await prisma.unitPrice.findMany({
      where,
      orderBy: { id: 'asc' }
    });

    let result;
    if (existing.length > 0) {
      if (existing.length > 1) {
        await prisma.unitPrice.deleteMany({
          where: { id: { in: existing.slice(1).map(e => e.id) } }
        });
      }
      result = await prisma.unitPrice.update({
        where: { id: existing[0].id },
        data: { unitPrice: price }
      });
    } else {
      result = await prisma.unitPrice.create({
        data: {
          ...where,
          category: category || null,
          unitPrice: price,
          unit,
        }
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Upsert unit price error:', error);
    res.status(500).json({ error: '単価の保存に失敗しました' });
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

    // セルの表示テキストを取得（.valueはリッチテキストや数式でオブジェクトになるため.textを使う）
    const cellText = (row, col) => {
      const text = row.getCell(col).text;
      return (text ?? '').toString().trim();
    };

    // ヘッダー行をスキップして2行目から読み込み
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // ヘッダースキップ

      const materialName = cellText(row, 1);
      const spec = cellText(row, 2) || null;
      const category = cellText(row, 3) || null;
      // '¥1,500' のような表記も数値として読む
      const unitPrice = parseInt(cellText(row, 4).replace(/[^\d]/g, ''), 10) || 0;
      const unit = cellText(row, 5);

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

    // 有効な行が1件もない場合は何も書き込まない
    // （検証前にdeleteManyすると、不正なファイルで既存カスタム単価が全消しされる）
    if (imported.length === 0) {
      return res.status(400).json({
        error: '有効な単価データがありませんでした。既存の単価は変更していません。',
        errors
      });
    }

    // 標準単価と同額の行はカスタム登録しない
    // （エクスポートは実効単価の全行を出すため、そのまま取り込むと全行がカスタム化し
    //   標準単価の更新に追従できなくなる。差分だけをカスタムとして保持する）
    const defaults = await prisma.defaultUnitPrice.findMany();
    const defaultMap = new Map(defaults.map(d => [`${d.materialName}|${d.spec || ''}`, d.unitPrice]));
    const customsOnly = imported.filter(item =>
      defaultMap.get(`${item.materialName}|${item.spec || ''}`) !== item.unitPrice
    );

    // 既存の単価を削除して新規作成（上書きモード）
    // 途中失敗で「消えたが入っていない」状態にならないよう1トランザクションで実行
    await prisma.$transaction([
      prisma.unitPrice.deleteMany({
        where: { companyId: req.companyId }
      }),
      ...(customsOnly.length > 0 ? [prisma.unitPrice.createMany({
        data: customsOnly.map(item => ({
          companyId: req.companyId,
          ...item
        }))
      })] : [])
    ]);

    res.json({
      message: `${customsOnly.length}件のカスタム単価を登録しました（標準単価と同額の${imported.length - customsOnly.length}件は標準のまま）`,
      imported: customsOnly.length,
      errors
    });
  } catch (error) {
    console.error('Import unit prices error:', error);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

// GET /api/unit-prices/export - Excelエクスポート
// 自社カスタム行だけでなく実効単価（標準+カスタムのマージ）を出力する
// （カスタム行のみだと未カスタマイズの会社は空のExcelになり、編集→再インポートのフローが成立しない）
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');

    const rows = await getEffectiveRows(prisma, req.companyId);

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

    // データ追加（実効単価 = カスタムがあればカスタム、なければ標準）
    rows.forEach(row => {
      worksheet.addRow({
        materialName: row.materialName,
        spec: row.spec || '',
        category: row.category || '',
        unitPrice: row.customPrice ?? row.defaultPrice ?? 0,
        unit: row.unit
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
// 自社カスタム単価を全削除する（計算時は標準単価に自社単価を重ねる方式のため、
// 削除すれば自動的に標準単価が適用される。以前の「標準をコピー」方式は
// 標準単価の更新に追従できなくなるため廃止）
router.post('/reset', authenticateToken, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');

    await prisma.unitPrice.deleteMany({
      where: { companyId: req.companyId }
    });

    res.json({ message: '標準単価にリセットしました' });
  } catch (error) {
    console.error('Reset unit prices error:', error);
    res.status(500).json({ error: 'リセットに失敗しました' });
  }
});

export default router;
