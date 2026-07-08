import { Router } from 'express';
import crypto from 'crypto';
import fsPromises from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeLimiter } from '../middleware/rateLimits.js';
import { optionalAuth, projectScope } from '../middleware/auth.js';
import { analyzeDrawing } from '../services/claudeApi.js';
import { calculateMaterials } from '../services/materialCalculator.js';
import { deleteProjectDeep } from '../services/projectCleanup.js';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// 全ルートでトークンがあれば検証（ゲスト利用も可、データはcompanyId単位で分離）
router.use(optionalAuth);

/**
 * 所有権チェック付きでプロジェクトを取得
 * 他社（または他ゲスト⇔ログイン間）のプロジェクトは404として扱う
 */
async function findOwnedProject(prisma, req, include = undefined) {
  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) return null;
  return prisma.project.findFirst({
    where: { id, ...projectScope(req) },
    include,
  });
}

// ファイルアップロード設定
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/**
 * ファイル先頭のマジックバイトで実際の形式を検証する
 * （拡張子・MIMEタイプはクライアント申告のため偽装可能）
 */
async function isValidFileSignature(filePath) {
  const fd = await fsPromises.open(filePath, 'r');
  try {
    const { buffer } = await fd.read(Buffer.alloc(4), 0, 4, 0);
    if (buffer.length < 4) return false;
    const isPdf = buffer.subarray(0, 4).toString('latin1') === '%PDF';
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    return isPdf || isPng || isJpeg;
  } finally {
    await fd.close();
  }
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB（フロントだけでなくAPI側でも強制）
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext) && ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// GET /api/projects - プロジェクト一覧取得
router.get('/', async (req, res) => {
  try {
    // ゲスト（未ログイン）には履歴を提供しない
    // ゲストのプロジェクトはセッション中の画面遷移のためだけにDBに存在する
    if (!req.companyId) {
      return res.json([]);
    }

    const prisma = req.app.get('prisma');
    const projects = await prisma.project.findMany({
      where: projectScope(req),
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

    // ゲストには所有権トークンを発行（以降のAPIはX-Guest-Tokenヘッダで照合）
    const guestToken = req.companyId ? null : crypto.randomUUID();

    const project = await prisma.project.create({
      data: {
        name,
        status: 'draft',
        companyId: req.companyId ?? null,
        guestToken
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
    const project = await findOwnedProject(prisma, req, {
      package: true,
      aiReadings: { orderBy: { createdAt: 'desc' } },
      overrides: true,
      materialLists: { orderBy: { createdAt: 'desc' } }
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

// アップロードのレートリミット（デュアルAI課金の防御）
// IPあたり1時間に20回まで。上限は環境変数で調整可能
const uploadLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: parseInt(process.env.UPLOAD_RATE_LIMIT || '20', 10),
  message: 'アップロード回数の上限に達しました。しばらく待ってから再試行してください。',
});

// POST /api/projects/:id/upload - 図面アップロード+AI解析
router.post('/:id/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    // 簡易アップロードガード（テスト版の課金露出対策）
    // UPLOAD_GUARD_TOKEN が設定されている場合のみ有効
    const guardToken = process.env.UPLOAD_GUARD_TOKEN;
    if (guardToken && req.headers['x-upload-token'] !== guardToken) {
      return res.status(403).json({ error: 'アップロードが許可されていません' });
    }

    const prisma = req.app.get('prisma');
    const project = await findOwnedProject(prisma, req);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const projectId = project.id;
    console.log('Upload request for project:', projectId);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log('File uploaded:', req.file.path);

    // マジックバイト検証: 拡張子偽装（例: exeを.pdfにリネーム）を拒否
    if (!(await isValidFileSignature(req.file.path))) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'ファイルの内容がPDF/PNG/JPGではありません' });
    }

    // Claude APIで解析（専有面積のユーザー入力があれば最優先で採用）
    const userTotalAreaSqm = req.body.total_area_sqm
      ? parseFloat(req.body.total_area_sqm)
      : null;
    console.log('Starting AI analysis...', userTotalAreaSqm ? `(専有面積入力: ${userTotalAreaSqm}㎡)` : '');
    const analysisResult = await analyzeDrawing(req.file.path, {
      userTotalAreaSqm: userTotalAreaSqm && userTotalAreaSqm > 0 ? userTotalAreaSqm : undefined,
    });
    console.log('AI analysis complete');

    // AIが両方応答しなかった場合は503（一時的な障害・再試行可能）
    if (analysisResult._ai_unavailable) {
      // 保存していないアップロードファイルは掃除する
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(503).json({
        error: 'ai_unavailable',
        message: analysisResult.rejection_reason,
      });
    }

    // 図面種別ゲート: 両AIが非平面図と判定した場合は400エラー
    if (analysisResult.is_rejected) {
      console.log('Image rejected:', analysisResult.rejection_reason);
      // 拒否された図面ファイルも掃除（孤児ファイル防止）
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        error: 'invalid_document_type',
        message: analysisResult.rejection_reason || 'この画像は計画平面図ではありません。資材計算には計画平面図をアップロードしてください。',
        document_type: analysisResult.document_type,
      });
    }

    // AI生テキストはrawResponseへ、正規化済みJSONはparsedDataへ
    // （生テキストは後日のevalセット作成・デバッグの一次資料になる）
    const rawResponses = analysisResult._raw_responses || null;
    delete analysisResult._raw_responses;

    const aiReading = await prisma.aiReading.create({
      data: {
        projectId,
        fileName: req.file.originalname,
        filePath: req.file.path,
        rawResponse: JSON.stringify(rawResponses),
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

// DELETE /api/projects/:id - プロジェクト削除（関連データ+アップロードファイルも削除）
router.delete('/:id', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const project = await findOwnedProject(prisma, req);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await deleteProjectDeep(prisma, project.id);
    res.json({ deleted: true, id: project.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/projects/:id/overrides - 仕様変更保存
router.post('/:id/overrides', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const project = await findOwnedProject(prisma, req);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const projectId = project.id;
    const { overrides } = req.body;

    // 検証を削除より先に（不正bodyで既存オーバーライドが消える事故を防ぐ）
    if (!Array.isArray(overrides)) {
      return res.status(400).json({ error: 'overrides must be an array' });
    }
    if (overrides.length > 100) {
      return res.status(400).json({ error: 'overridesは100件までです' });
    }
    const rows = overrides.map((o) => ({
      projectId,
      category: String(o?.category ?? 'spec').slice(0, 50),
      itemKey: String(o?.itemKey ?? '').slice(0, 100),
      value: String(o?.value ?? '').slice(0, 200),
    }));
    if (rows.some((r) => !r.itemKey)) {
      return res.status(400).json({ error: 'itemKeyは必須です' });
    }

    // 全置換を1トランザクションで（途中失敗で中途半端に残らない）
    await prisma.$transaction([
      prisma.override.deleteMany({ where: { projectId } }),
      ...rows.map((data) => prisma.override.create({ data })),
    ]);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/projects/:id/calculate - 資材計算実行
router.post('/:id/calculate', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');

    // プロジェクトと関連データを取得（所有権チェック込み）
    const project = await findOwnedProject(prisma, req, {
      package: true,
      aiReadings: { orderBy: { createdAt: 'desc' }, take: 1 },
      overrides: true
    });
    const projectId = project?.id;

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

    // 単価を適用（標準単価をベースに、ログイン会社のカスタム単価を重ねる）
    // ※ 自社単価を「1件だけ」登録した場合でも他の資材は標準単価が使われる
    const companyId = req.companyId; // 認証ミドルウェアから取得
    let companyPrices = [];

    if (companyId) {
      companyPrices = await prisma.unitPrice.findMany({
        where: { companyId }
      });
    }

    const defaultPrices = await prisma.defaultUnitPrice.findMany();
    // findは先頭一致を返すため、自社単価を前に置いて優先させる
    const unitPrices = [...companyPrices, ...defaultPrices];

    // 資材に単価と金額を追加
    let totalAmount = 0;
    const materialsWithPrice = result.materials.map(material => {
      // 単価マッチング（2段階）
      // 1. 資材名+規格の完全一致を優先（自社単価が配列先頭のため自社優先）
      // 2. なければ規格未指定同士のゆるい一致にフォールバック
      //    ※ 1段のゆるい一致だと、規格なしのカスタム単価1件が
      //      同名の全規格違い（例: ダイノックシート貼り 玄関扉/窓枠）を乗っ取る
      const priceInfo =
        unitPrices.find(p => p.materialName === material.name && p.spec === material.spec) ||
        unitPrices.find(p => p.materialName === material.name && (!p.spec || !material.spec));
      const unitPrice = priceInfo?.unitPrice || 0;

      const amount = unitPrice * material.quantity;
      totalAmount += amount;
      return {
        ...material,
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
    const project = await findOwnedProject(prisma, req);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const projectId = project.id;

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

// PUT /api/projects/:id/materials - 数量・単価の手動編集を保存
// クライアントから送られた materials 配列のうち quantity / unitPrice のみを
// 保存済みリストにマージする（名前・計算根拠等の改変は受け付けない）
router.put('/:id/materials', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const project = await findOwnedProject(prisma, req);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const materialList = await prisma.materialList.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' }
    });
    if (!materialList) {
      return res.status(404).json({ error: 'Material list not found. Please run calculation first.' });
    }

    const edits = req.body.materials;
    if (!Array.isArray(edits)) {
      return res.status(400).json({ error: 'materials must be an array' });
    }

    // 編集元のリストIDを照合し、並行する再計算による上書き事故を防ぐ
    // （行数だけの比較では「行数が同じで値が違う」再計算を検出できない）
    const editedListId = parseInt(req.body.materialListId);
    if (!Number.isFinite(editedListId)) {
      return res.status(400).json({ error: 'materialListId is required' });
    }
    if (editedListId !== materialList.id) {
      return res.status(409).json({ error: '資材リストが更新されています。再読み込みしてください。' });
    }

    const stored = JSON.parse(materialList.materials);
    if (edits.length !== stored.length) {
      return res.status(409).json({ error: '資材リストが更新されています。再読み込みしてください。' });
    }

    // 空文字/null/undefinedは「編集なし」として元の値を維持する
    // （Number('')===0 のため、そのままだと入力欄をクリアしただけで数量0が保存される）
    const parseEdit = (value) => {
      if (value === '' || value === null || value === undefined) return null;
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    let totalAmount = 0;
    const merged = stored.map((item, i) => {
      const quantity = parseEdit(edits[i]?.quantity);
      const unitPrice = parseEdit(edits[i]?.unitPrice);
      const next = {
        ...item,
        quantity: quantity !== null ? quantity : item.quantity,
        unitPrice: unitPrice !== null ? unitPrice : (item.unitPrice || 0),
      };
      // 手動調整された行は計算根拠に明示（Excelにもそのまま出る）
      if (next.quantity !== item.quantity && !item.edited) {
        next.edited = true;
        const base = item.calculation ? `${item.calculation} ／ ` : '';
        next.calculation = `${base}手動調整（元: ${item.quantity}${item.unit || ''}）`;
      }
      next.amount = Math.round(next.unitPrice * next.quantity);
      totalAmount += next.amount;
      return next;
    });

    // 手動追加行（特注造作等、計算対象外の独自項目）
    const added = Array.isArray(req.body.added) ? req.body.added : [];
    if (added.length > 20) {
      return res.status(400).json({ error: '一度に追加できる行は20件までです' });
    }
    for (const row of added) {
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const quantity = parseEdit(row.quantity);
      const unitPrice = parseEdit(row.unitPrice) ?? 0;
      if (!name) {
        return res.status(400).json({ error: '追加行の資材名は必須です' });
      }
      if (quantity === null) {
        return res.status(400).json({ error: `追加行の数量が不正です: ${name}` });
      }
      const amount = Math.round(unitPrice * quantity);
      totalAmount += amount;
      merged.push({
        category: (typeof row.category === 'string' && row.category.trim() ? row.category.trim() : '追加項目').slice(0, 50),
        name: name.slice(0, 100),
        spec: (typeof row.spec === 'string' ? row.spec.trim() : '').slice(0, 100),
        quantity,
        unit: (typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : '式').slice(0, 20),
        unitPrice,
        amount,
        custom: true,
        edited: true,
        calculation: '手動追加',
      });
    }

    const updated = await prisma.materialList.update({
      where: { id: materialList.id },
      data: {
        materials: JSON.stringify(merged),
        totalAmount
      }
    });

    res.json({
      ...updated,
      materials: merged,
      totalAmount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/projects/:id/export - Excelダウンロード
router.get('/:id/export', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    const project = await findOwnedProject(prisma, req, {
      package: true,
      materialLists: { orderBy: { createdAt: 'desc' }, take: 1 }
    });
    const projectId = project?.id;

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
