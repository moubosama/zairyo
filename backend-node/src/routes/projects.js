import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { analyzeDrawing } from '../services/claudeApi.js';
import { calculateMaterials } from '../services/materialCalculator.js';
import ExcelJS from 'exceljs';

const JWT_SECRET = process.env.JWT_SECRET || 'zairyo-secret-key-change-in-production';

// オプショナル認証ミドルウェア（トークンがあれば検証、なくても通す）
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (!err) {
        req.companyId = decoded.companyId;
      }
    });
  }
  next();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// ファイルアップロード設定
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// GET /api/projects - プロジェクト一覧取得
router.get('/', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        aiReadings: { orderBy: { createdAt: 'desc' }, take: 1 },
        materialLists: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    const formatted = projects.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      layoutType: p.aiReadings[0] ? JSON.parse(p.aiReadings[0].parsedData).layout_type : null,
      hasMaterials: p.materialLists.length > 0,
      totalAmount: p.materialLists[0]?.totalAmount || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/projects - 新規プロジェクト作成
router.post('/', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const { name } = req.body;

    const project = await prisma.project.create({
      data: {
        name,
        status: 'draft'
      }
    });

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const project = await prisma.project.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        package: true,
        aiReadings: true,
        overrides: true,
        materialLists: true
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      ...project,
      package: project.package ? {
        ...project.package,
        specs: JSON.parse(project.package.specs)
      } : null,
      aiReadings: project.aiReadings.map(r => ({
        ...r,
        parsedData: JSON.parse(r.parsedData)
      })),
      materialLists: project.materialLists.map(m => ({
        ...m,
        materials: JSON.parse(m.materials),
        summary: m.summary ? JSON.parse(m.summary) : null
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/projects/:id/upload - 図面アップロード+AI解析
router.post('/:id/upload', upload.single('file'), async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const projectId = parseInt(req.params.id);
    console.log('Upload request for project:', projectId);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log('File uploaded:', req.file.path);

    // Claude APIで解析
    console.log('Starting AI analysis...');
    const analysisResult = await analyzeDrawing(req.file.path);
    console.log('AI analysis complete');

    // 解析結果を保存
    const aiReading = await prisma.aiReading.create({
      data: {
        projectId,
        fileName: req.file.originalname,
        filePath: req.file.path,
        rawResponse: JSON.stringify(analysisResult),
        parsedData: JSON.stringify(analysisResult)
      }
    });

    // プロジェクトステータス更新
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'analyzed' }
    });

    res.json({
      ...aiReading,
      parsedData: analysisResult
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/projects/:id/overrides - 仕様変更保存
router.post('/:id/overrides', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const projectId = parseInt(req.params.id);
    const { overrides } = req.body;

    // 既存のオーバーライドを削除して新規作成
    await prisma.override.deleteMany({ where: { projectId } });

    const createdOverrides = [];
    for (const override of overrides) {
      const created = await prisma.override.create({
        data: {
          projectId,
          category: override.category,
          itemKey: override.itemKey,
          value: override.value
        }
      });
      createdOverrides.push(created);
    }

    res.json(createdOverrides);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/projects/:id/calculate - 資材計算実行
router.post('/:id/calculate', optionalAuth, async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const projectId = parseInt(req.params.id);

    // プロジェクトと関連データを取得
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        package: true,
        aiReadings: { orderBy: { createdAt: 'desc' }, take: 1 },
        overrides: true
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.aiReadings.length === 0) {
      return res.status(400).json({ error: 'No AI reading found. Please upload a drawing first.' });
    }

    // オーバーライドをオブジェクトに変換
    const overridesObj = {};
    project.overrides.forEach(o => {
      overridesObj[o.itemKey] = o.value;
    });

    // 資材計算（パッケージは空のオブジェクトで代用）
    const packageSpecs = project.package ? JSON.parse(project.package.specs) : {};
    console.log('Calculating materials with aiReading:', project.aiReadings[0].parsedData);
    const result = calculateMaterials(
      project.aiReadings[0].parsedData,
      packageSpecs,
      overridesObj
    );
    console.log('Calculation result:', JSON.stringify(result.summary));

    // 単価を適用（ログインユーザーの単価、なければ標準単価）
    const companyId = req.companyId; // 認証ミドルウェアから取得
    let unitPrices = [];
    let productSelections = [];

    if (companyId) {
      unitPrices = await prisma.unitPrice.findMany({
        where: { companyId }
      });

      // 会社の商品選択を取得
      productSelections = await prisma.companyProductSelection.findMany({
        where: { companyId }
      });
    }

    // 単価がない場合は標準単価を使用
    if (unitPrices.length === 0) {
      unitPrices = await prisma.defaultUnitPrice.findMany();
    }

    // 選択商品のカタログ情報を取得
    const selectedProducts = {};
    for (const sel of productSelections) {
      const product = await prisma.productCatalog.findUnique({
        where: { id: sel.productCatalogId }
      });
      if (product) {
        selectedProducts[sel.category] = {
          ...product,
          customPrice: sel.customPrice
        };
      }
    }

    // 資材に単価と金額を追加（選択商品があればそれを優先）
    let totalAmount = 0;
    const materialsWithPrice = result.materials.map(material => {
      // 設備カテゴリの場合、選択商品をチェック
      const categoryMap = {
        'トイレ': '設備',
        'ユニットバス': '設備',
        'キッチン': '設備',
        '洗面台': '設備',
        'フローリング': '床材',
        '建具': '建具'
      };

      let unitPrice = 0;
      let productName = material.name;
      let productSpec = material.spec;

      // 選択商品があるかチェック
      const selectedProduct = selectedProducts[material.category];
      if (selectedProduct) {
        // 選択商品の情報で置き換え
        productName = `${selectedProduct.manufacturer} ${selectedProduct.productName}`;
        productSpec = selectedProduct.spec;
        unitPrice = selectedProduct.customPrice || selectedProduct.unitPrice;
      } else {
        // 通常の単価マッチング
        const priceInfo = unitPrices.find(p =>
          p.materialName === material.name &&
          (p.spec === material.spec || !p.spec || !material.spec)
        );
        unitPrice = priceInfo?.unitPrice || 0;
      }

      const amount = unitPrice * material.quantity;
      totalAmount += amount;
      return {
        ...material,
        name: selectedProduct ? productName : material.name,
        spec: selectedProduct ? productSpec : material.spec,
        unitPrice,
        amount
      };
    });

    // 結果を保存
    const materialList = await prisma.materialList.create({
      data: {
        projectId,
        materials: JSON.stringify(materialsWithPrice),
        summary: JSON.stringify(result.summary),
        totalAmount
      }
    });

    // プロジェクトステータス更新
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'calculated' }
    });

    res.json({
      ...materialList,
      materials: materialsWithPrice,
      summary: result.summary,
      totalAmount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/projects/:id/materials - 資材リスト取得
router.get('/:id/materials', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const projectId = parseInt(req.params.id);

    const materialList = await prisma.materialList.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });

    if (!materialList) {
      return res.status(404).json({ error: 'Material list not found. Please run calculation first.' });
    }

    res.json({
      ...materialList,
      materials: JSON.parse(materialList.materials)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/projects/:id/export - Excelダウンロード
router.get('/:id/export', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const projectId = parseInt(req.params.id);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        package: true,
        materialLists: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    if (!project || project.materialLists.length === 0) {
      return res.status(404).json({ error: 'Material list not found' });
    }

    const materials = JSON.parse(project.materialLists[0].materials);

    // Excel作成
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('資材リスト');

    // ヘッダー
    worksheet.columns = [
      { header: 'カテゴリ', key: 'category', width: 15 },
      { header: '資材名', key: 'name', width: 30 },
      { header: '仕様', key: 'spec', width: 35 },
      { header: '数量', key: 'quantity', width: 10 },
      { header: '単位', key: 'unit', width: 10 },
      { header: '計算根拠', key: 'calculation', width: 40 }
    ];

    // データ追加
    materials.forEach(m => {
      worksheet.addRow({
        category: m.category || '',
        name: m.name || '',
        spec: m.spec || '',
        quantity: m.quantity || 0,
        unit: m.unit || '',
        calculation: m.calculation || ''
      });
    });

    // スタイル
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD4A853' } // ゴールド
    };

    // レスポンス
    // ファイル名をURLエンコードして日本語対応
    const fileName = encodeURIComponent(`${project.name}_材料リスト.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
