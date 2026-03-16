import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeDrawing } from '../services/claudeApi.js';
import { calculateMaterials } from '../services/materialCalculator.js';
import ExcelJS from 'exceljs';

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
        package: true,
        aiReadings: { orderBy: { createdAt: 'desc' }, take: 1 },
        materialLists: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    const formatted = projects.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      packageName: p.package.name,
      layoutType: p.aiReadings[0] ? JSON.parse(p.aiReadings[0].parsedData).layout_type : null,
      hasMaterials: p.materialLists.length > 0,
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
    const { name, packageId } = req.body;

    const project = await prisma.project.create({
      data: {
        name,
        packageId: parseInt(packageId),
        status: 'draft'
      },
      include: {
        package: true
      }
    });

    res.json({
      ...project,
      package: {
        ...project.package,
        specs: JSON.parse(project.package.specs)
      }
    });
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
      package: {
        ...project.package,
        specs: JSON.parse(project.package.specs)
      },
      aiReadings: project.aiReadings.map(r => ({
        ...r,
        parsedData: JSON.parse(r.parsedData)
      })),
      materialLists: project.materialLists.map(m => ({
        ...m,
        materials: JSON.parse(m.materials)
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

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Claude APIで解析
    const analysisResult = await analyzeDrawing(req.file.path);

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
router.post('/:id/calculate', async (req, res) => {
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

    // 資材計算
    const result = calculateMaterials(
      project.aiReadings[0].parsedData,
      JSON.parse(project.package.specs),
      overridesObj
    );

    // 結果を保存
    const materialList = await prisma.materialList.create({
      data: {
        projectId,
        materials: JSON.stringify(result.materials)
      }
    });

    // プロジェクトステータス更新
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'calculated' }
    });

    res.json({
      ...materialList,
      materials: result.materials,
      summary: result.summary
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
