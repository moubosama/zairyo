import express from 'express'
import { PrismaClient } from '@prisma/client'
import multer from 'multer'
import ExcelJS from 'exceljs'
import { authenticateToken } from './auth.js'

const router = express.Router()
const prisma = new PrismaClient()
const upload = multer({ storage: multer.memoryStorage() })

// 商品カタログ一覧取得（カテゴリ別）
router.get('/catalog', async (req, res) => {
  try {
    const { category } = req.query
    const where = category ? { category } : {}

    const products = await prisma.productCatalog.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { manufacturer: 'asc' },
        { productName: 'asc' }
      ]
    })

    res.json(products)
  } catch (error) {
    console.error('Failed to fetch product catalog:', error)
    res.status(500).json({ error: 'Failed to fetch product catalog' })
  }
})

// カテゴリ一覧取得
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.productCatalog.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' }
    })

    res.json(categories.map(c => c.category))
  } catch (error) {
    console.error('Failed to fetch categories:', error)
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// 商品追加
router.post('/catalog', authenticateToken, async (req, res) => {
  try {
    const { category, manufacturer, productName, modelNumber, spec, unitPrice, unit, description } = req.body

    const product = await prisma.productCatalog.create({
      data: {
        category,
        manufacturer,
        productName,
        modelNumber,
        spec,
        unitPrice: parseInt(unitPrice),
        unit,
        description
      }
    })

    res.json(product)
  } catch (error) {
    console.error('Failed to create product:', error)
    res.status(500).json({ error: 'Failed to create product' })
  }
})

// 商品更新
router.put('/catalog/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { category, manufacturer, productName, modelNumber, spec, unitPrice, unit, description } = req.body

    const product = await prisma.productCatalog.update({
      where: { id: parseInt(id) },
      data: {
        category,
        manufacturer,
        productName,
        modelNumber,
        spec,
        unitPrice: parseInt(unitPrice),
        unit,
        description
      }
    })

    res.json(product)
  } catch (error) {
    console.error('Failed to update product:', error)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// 商品削除
router.delete('/catalog/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.productCatalog.delete({
      where: { id: parseInt(id) }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Failed to delete product:', error)
    res.status(500).json({ error: 'Failed to delete product' })
  }
})

// Excelインポート
router.post('/catalog/import', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(req.file.buffer)

    const worksheet = workbook.worksheets[0]
    const products = []

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // ヘッダースキップ

      const category = row.getCell(1).value?.toString() || ''
      const manufacturer = row.getCell(2).value?.toString() || ''
      const productName = row.getCell(3).value?.toString() || ''
      const modelNumber = row.getCell(4).value?.toString() || ''
      const spec = row.getCell(5).value?.toString() || ''
      const unitPrice = parseInt(row.getCell(6).value) || 0
      const unit = row.getCell(7).value?.toString() || ''
      const description = row.getCell(8).value?.toString() || ''

      if (category && productName) {
        products.push({
          category,
          manufacturer,
          productName,
          modelNumber: modelNumber || null,
          spec: spec || null,
          unitPrice,
          unit,
          description: description || null
        })
      }
    })

    // 一括登録（重複は更新）
    for (const product of products) {
      await prisma.productCatalog.upsert({
        where: {
          category_manufacturer_productName_spec: {
            category: product.category,
            manufacturer: product.manufacturer,
            productName: product.productName,
            spec: product.spec || ''
          }
        },
        update: product,
        create: product
      })
    }

    res.json({ success: true, count: products.length })
  } catch (error) {
    console.error('Failed to import products:', error)
    res.status(500).json({ error: 'Failed to import products' })
  }
})

// Excelエクスポート
router.get('/catalog/export', authenticateToken, async (req, res) => {
  try {
    const products = await prisma.productCatalog.findMany({
      orderBy: [
        { category: 'asc' },
        { manufacturer: 'asc' },
        { productName: 'asc' }
      ]
    })

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('商品カタログ')

    worksheet.columns = [
      { header: 'カテゴリ', key: 'category', width: 15 },
      { header: 'メーカー', key: 'manufacturer', width: 15 },
      { header: '商品名', key: 'productName', width: 25 },
      { header: '型番', key: 'modelNumber', width: 20 },
      { header: '仕様', key: 'spec', width: 15 },
      { header: '単価', key: 'unitPrice', width: 12 },
      { header: '単位', key: 'unit', width: 10 },
      { header: '説明', key: 'description', width: 30 }
    ]

    products.forEach(product => {
      worksheet.addRow(product)
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=product_catalog.xlsx')

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('Failed to export products:', error)
    res.status(500).json({ error: 'Failed to export products' })
  }
})

// ========== 会社の商品選択 ==========

// 会社の選択商品一覧取得
router.get('/selections', authenticateToken, async (req, res) => {
  try {
    const selections = await prisma.companyProductSelection.findMany({
      where: { companyId: req.companyId },
      orderBy: { category: 'asc' }
    })

    // 商品情報も取得
    const selectionsWithProducts = await Promise.all(
      selections.map(async (sel) => {
        const product = await prisma.productCatalog.findUnique({
          where: { id: sel.productCatalogId }
        })
        return {
          ...sel,
          product
        }
      })
    )

    res.json(selectionsWithProducts)
  } catch (error) {
    console.error('Failed to fetch selections:', error)
    res.status(500).json({ error: 'Failed to fetch selections' })
  }
})

// 商品選択を保存
router.post('/selections', authenticateToken, async (req, res) => {
  try {
    const { category, productCatalogId, customPrice } = req.body

    const selection = await prisma.companyProductSelection.upsert({
      where: {
        companyId_category: {
          companyId: req.companyId,
          category
        }
      },
      update: {
        productCatalogId: parseInt(productCatalogId),
        customPrice: customPrice ? parseInt(customPrice) : null
      },
      create: {
        companyId: req.companyId,
        category,
        productCatalogId: parseInt(productCatalogId),
        customPrice: customPrice ? parseInt(customPrice) : null
      }
    })

    res.json(selection)
  } catch (error) {
    console.error('Failed to save selection:', error)
    res.status(500).json({ error: 'Failed to save selection' })
  }
})

// 商品選択を削除
router.delete('/selections/:category', authenticateToken, async (req, res) => {
  try {
    const { category } = req.params

    await prisma.companyProductSelection.delete({
      where: {
        companyId_category: {
          companyId: req.companyId,
          category
        }
      }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Failed to delete selection:', error)
    res.status(500).json({ error: 'Failed to delete selection' })
  }
})

export default router
