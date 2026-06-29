import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 標準単価データ（一般的な相場）
const defaultUnitPrices = [
  // 下地材
  { materialName: 'PB 12.5mm 吉野 3×6', spec: '910×1820mm', category: '下地材', unitPrice: 650, unit: '枚' },
  { materialName: 'PB 9.5mm 吉野 3×6', spec: '910×1820mm', category: '下地材', unitPrice: 550, unit: '枚' },
  { materialName: 'Mクロス 12.5mm 3×6', spec: '耐水ボード', category: '下地材', unitPrice: 900, unit: '枚' },
  { materialName: '垂木 赤松KD 30×40 L3000', spec: '入数12本/束', category: '下地材', unitPrice: 2800, unit: '束' },
  { materialName: 'ラワンベニヤ 9mm 3×6', spec: '水回りフロアタイル下地', category: '下地材', unitPrice: 1200, unit: '枚' },
  { materialName: 'ラワンランバー 24mm 3×8', spec: 'フローリング下地', category: '下地材', unitPrice: 3500, unit: '枚' },

  // 床材
  { materialName: 'フローリング', spec: 'DAIKEN MYフロア (1×6)', category: '床材', unitPrice: 5000, unit: '㎡' },
  { materialName: '床見切り', spec: 'DAIKEN MYフロア用', category: '床材', unitPrice: 800, unit: '本' },
  { materialName: 'クッションフロア貼り', spec: '洗面室・トイレ', category: '床材', unitPrice: 25000, unit: '式' },
  { materialName: '水回りフロアタイル貼り', spec: '洗面室・トイレ', category: '床材', unitPrice: 35000, unit: '式' },
  { materialName: '玄関土間フロアタイル貼り', spec: '面積増', category: '床材', unitPrice: 15000, unit: '式' },

  // 造作材
  { materialName: '巾木', spec: 'ソフト巾木', category: '造作材', unitPrice: 350, unit: 'm' },
  { materialName: '枕棚取付', spec: '', category: '造作材', unitPrice: 8000, unit: '箇所' },
  { materialName: 'ハンガーパイプ取付', spec: '', category: '造作材', unitPrice: 5000, unit: '箇所' },

  // 仕上材
  { materialName: '天井クロス貼り', spec: '量産品番', category: '仕上材', unitPrice: 1150, unit: '㎡' },
  { materialName: '壁クロス貼り', spec: '量産品番', category: '仕上材', unitPrice: 1150, unit: '㎡' },
  { materialName: 'アクセントクロス貼り', spec: '1000番', category: '仕上材', unitPrice: 1500, unit: '㎡' },
  { materialName: 'クロス新規下地処理', spec: '', category: '仕上材', unitPrice: 15000, unit: '人工' },
  { materialName: 'ダイノックシート貼り', spec: '玄関扉', category: '仕上材', unitPrice: 25000, unit: 'm' },
  { materialName: 'ダイノックシート貼り', spec: '窓枠', category: '仕上材', unitPrice: 8000, unit: 'm' },

  // 建具
  { materialName: '建具一式', spec: 'Panasonic ベリティス', category: '建具', unitPrice: 45000, unit: '枚' },
  { materialName: '下駄箱', spec: 'トール 2070×800 Panasonic ベリティス', category: '建具', unitPrice: 85000, unit: '台' },

  // 設備
  { materialName: 'ユニットバス', spec: 'TOTO WT 1216', category: '設備', unitPrice: 450000, unit: '台' },
  { materialName: 'システムキッチン本体', spec: 'LIXIL ES 2550 スライド・食洗機あり', category: '設備', unitPrice: 380000, unit: '台' },
  { materialName: 'キッチンパネル', spec: '3×8', category: '設備', unitPrice: 12000, unit: '枚' },
  { materialName: '洗面化粧台', spec: 'LIXIL EV1000 (D500) フルスライド+三面鏡', category: '設備', unitPrice: 120000, unit: '台' },
  { materialName: '洗面タオルレール', spec: 'カワジュン SC-611-XC', category: '設備', unitPrice: 3500, unit: '個' },
  { materialName: '洗濯パン', spec: 'TOTO 640角 PWP640N2W', category: '設備', unitPrice: 8500, unit: '台' },
  { materialName: '洗濯機横引きトラップ', spec: 'TOTO PJ2008NW', category: '設備', unitPrice: 4500, unit: '個' },
  { materialName: '洗濯機用水栓', spec: 'LIXIL LF-WJ50KQA', category: '設備', unitPrice: 6500, unit: '個' },
  { materialName: 'ランドリー収納', spec: 'アイカ YCGB51H', category: '設備', unitPrice: 25000, unit: '個' },
  { materialName: 'トイレ本体', spec: 'TOTO 一体型便器ZJ2 (ZR2)', category: '設備', unitPrice: 95000, unit: '台' },
  { materialName: 'トイレペーパーホルダー', spec: 'カワジュン SC-613-XC', category: '設備', unitPrice: 3000, unit: '個' },
  { materialName: 'トイレタオルレール', spec: 'カワジュン SC-611-XC', category: '設備', unitPrice: 3500, unit: '個' },
  { materialName: 'トイレ吊戸棚', spec: 'ワンド STO-60EN W600×D201×H600', category: '設備', unitPrice: 18000, unit: '個' },
  { materialName: '給湯器', spec: '20号追い焚き RUF-A2005SAW', category: '設備', unitPrice: 185000, unit: '台' },
  { materialName: 'マルチリモコン', spec: 'MBC-240V(A)', category: '設備', unitPrice: 25000, unit: '個' },
  { materialName: '床暖房', spec: '電気式床暖房', category: '設備', unitPrice: 35000, unit: '㎡' },
  { materialName: '室内窓', spec: 'Panasonic 暮らし&リフォーム', category: '造作', unitPrice: 85000, unit: '箇所' },

  // 内装材
  { materialName: 'カーテンレール設置', spec: '', category: '内装材', unitPrice: 3500, unit: '箇所' },
  { materialName: 'カーテンレール', spec: 'ダブル2m ホワイト トーソーAJ606', category: '内装材', unitPrice: 4500, unit: '本' },
  { materialName: 'レジスター', spec: 'Φ150', category: '内装材', unitPrice: 2500, unit: '個' },
  { materialName: 'スリーブキャップ', spec: 'Φ75 311-313', category: '内装材', unitPrice: 800, unit: '個' },

  // 電気工事
  { materialName: 'ダウンライト', spec: '非調光 100W 電球色', category: '電気工事', unitPrice: 3500, unit: '台' },
  { materialName: 'シーリングライト', spec: 'ODELIC 調光調色 6～8畳', category: '電気工事', unitPrice: 12000, unit: '台' },
  { materialName: '照明器具取付', spec: 'ダウンライト・シーリング含む', category: '電気工事', unitPrice: 50000, unit: '式' },
  { materialName: 'スイッチ・コンセント工事', spec: '配線器具一式', category: '電気工事', unitPrice: 120000, unit: '式' },
  { materialName: '単室換気扇', spec: '水回り用 三菱 VD-10ZC14', category: '電気工事', unitPrice: 18000, unit: '台' },

  // 諸経費
  { materialName: 'ルームクリーニング', spec: '', category: '諸経費', unitPrice: 45000, unit: '式' },
  { materialName: '検査費', spec: '', category: '諸経費', unitPrice: 30000, unit: '式' }
];

// 商品カタログ（メーカー・製品一覧）
const productCatalog = [
  // トイレ
  { category: 'トイレ', manufacturer: 'TOTO', productName: 'ZJ2 (ZR2)', modelNumber: 'CES9152', spec: '一体型', unitPrice: 95000, unit: '台', description: '一体型便器' },
  { category: 'トイレ', manufacturer: 'TOTO', productName: 'GG', modelNumber: 'CES9415', spec: '一体型', unitPrice: 125000, unit: '台', description: 'ウォシュレット一体型' },
  { category: 'トイレ', manufacturer: 'TOTO', productName: 'ネオレスト AS', modelNumber: 'CES9710', spec: 'タンクレス', unitPrice: 280000, unit: '台', description: 'タンクレス便器' },
  { category: 'トイレ', manufacturer: 'TOTO', productName: 'ネオレスト RS', modelNumber: 'CES9520', spec: 'タンクレス', unitPrice: 220000, unit: '台', description: 'タンクレス便器' },
  { category: 'トイレ', manufacturer: 'Panasonic', productName: 'アラウーノ S160', modelNumber: 'XCH1601WS', spec: 'タイプ1', unitPrice: 180000, unit: '台', description: 'タンクレス全自動おそうじ' },
  { category: 'トイレ', manufacturer: 'Panasonic', productName: 'アラウーノ L150', modelNumber: 'XCH1500WS', spec: 'タイプ0', unitPrice: 350000, unit: '台', description: '最上位モデル' },
  { category: 'トイレ', manufacturer: 'LIXIL', productName: 'サティスS', modelNumber: 'YBC-S40S', spec: 'タンクレス', unitPrice: 250000, unit: '台', description: 'コンパクトタンクレス' },
  { category: 'トイレ', manufacturer: 'LIXIL', productName: 'ベーシア', modelNumber: 'YBC-BA20S', spec: '一体型', unitPrice: 85000, unit: '台', description: '一体型便器' },

  // ユニットバス
  { category: 'ユニットバス', manufacturer: 'TOTO', productName: 'WT', modelNumber: 'WTV1216', spec: '1216', unitPrice: 450000, unit: '台', description: '戸建・マンション兼用' },
  { category: 'ユニットバス', manufacturer: 'TOTO', productName: 'WT', modelNumber: 'WTV1317', spec: '1317', unitPrice: 520000, unit: '台', description: '戸建・マンション兼用' },
  { category: 'ユニットバス', manufacturer: 'TOTO', productName: 'WT', modelNumber: 'WTV1418', spec: '1418', unitPrice: 580000, unit: '台', description: '戸建・マンション兼用' },
  { category: 'ユニットバス', manufacturer: 'TOTO', productName: 'サザナ', modelNumber: 'HTシリーズ', spec: '1317', unitPrice: 650000, unit: '台', description: '高級シリーズ' },
  { category: 'ユニットバス', manufacturer: 'LIXIL', productName: 'リノビオP', modelNumber: 'BZW-1216', spec: '1216', unitPrice: 480000, unit: '台', description: 'マンションリフォーム用' },
  { category: 'ユニットバス', manufacturer: 'LIXIL', productName: 'リノビオP', modelNumber: 'BZW-1317', spec: '1317', unitPrice: 550000, unit: '台', description: 'マンションリフォーム用' },
  { category: 'ユニットバス', manufacturer: 'LIXIL', productName: 'リノビオV', modelNumber: 'BLW-1216', spec: '1216', unitPrice: 420000, unit: '台', description: 'リーズナブル' },
  { category: 'ユニットバス', manufacturer: 'Panasonic', productName: 'オフローラ', modelNumber: 'BY-1216', spec: '1216', unitPrice: 500000, unit: '台', description: 'Panasonicバスルーム' },

  // キッチン
  { category: 'キッチン', manufacturer: 'LIXIL', productName: 'ES', modelNumber: 'ES-K-A', spec: 'I型2100', unitPrice: 280000, unit: '台', description: 'シンプルキッチン' },
  { category: 'キッチン', manufacturer: 'LIXIL', productName: 'ES', modelNumber: 'ES-K-B', spec: 'I型2550', unitPrice: 350000, unit: '台', description: 'シンプルキッチン' },
  { category: 'キッチン', manufacturer: 'LIXIL', productName: 'ES', modelNumber: 'ES-K-C', spec: 'I型2550 食洗機あり', unitPrice: 420000, unit: '台', description: '食洗機付き' },
  { category: 'キッチン', manufacturer: 'LIXIL', productName: 'シエラS', modelNumber: 'SIERRA-S', spec: 'I型2550', unitPrice: 450000, unit: '台', description: 'ベーシックキッチン' },
  { category: 'キッチン', manufacturer: 'LIXIL', productName: 'リシェルSI', modelNumber: 'RICHELLE', spec: 'I型2550', unitPrice: 650000, unit: '台', description: '高級キッチン' },
  { category: 'キッチン', manufacturer: 'クリナップ', productName: 'ラクエラ', modelNumber: 'RAKUERA', spec: 'I型2550', unitPrice: 380000, unit: '台', description: 'ベーシックキッチン' },
  { category: 'キッチン', manufacturer: 'クリナップ', productName: 'ステディア', modelNumber: 'STEDIA', spec: 'I型2550', unitPrice: 550000, unit: '台', description: 'ステンレスキッチン' },
  { category: 'キッチン', manufacturer: 'Panasonic', productName: 'ラクシーナ', modelNumber: 'LACUCINA', spec: 'I型2550', unitPrice: 480000, unit: '台', description: 'Panasonicキッチン' },

  // 洗面台
  { category: '洗面台', manufacturer: 'LIXIL', productName: 'CLINE', modelNumber: 'CLINE-750', spec: 'W750 三面鏡LED', unitPrice: 85000, unit: '台', description: 'コンパクト洗面' },
  { category: '洗面台', manufacturer: 'LIXIL', productName: 'CLINE', modelNumber: 'CLINE-900', spec: 'W900 三面鏡LED', unitPrice: 95000, unit: '台', description: 'コンパクト洗面' },
  { category: '洗面台', manufacturer: 'LIXIL', productName: 'EV', modelNumber: 'EV-750', spec: 'W750 一面鏡', unitPrice: 65000, unit: '台', description: 'エコノミー洗面' },
  { category: '洗面台', manufacturer: 'LIXIL', productName: 'EV', modelNumber: 'EV-1000', spec: 'W1000 三面鏡スリムLED', unitPrice: 120000, unit: '台', description: 'フルスライド収納' },
  { category: '洗面台', manufacturer: 'LIXIL', productName: 'ルミシス', modelNumber: 'LUMISIS', spec: 'W900', unitPrice: 180000, unit: '台', description: '高級洗面' },
  { category: '洗面台', manufacturer: 'TOTO', productName: 'オクターブ', modelNumber: 'OCTAVE', spec: 'W750', unitPrice: 110000, unit: '台', description: 'TOTOスタンダード' },
  { category: '洗面台', manufacturer: 'Panasonic', productName: 'シーライン', modelNumber: 'C-LINE', spec: 'W750', unitPrice: 95000, unit: '台', description: 'Panasonic洗面' },

  // フローリング
  { category: 'フローリング', manufacturer: 'DAIKEN', productName: 'MYフロア', modelNumber: 'MYFLOOR', spec: '1×6 遮音', unitPrice: 5000, unit: '㎡', description: 'マンション用遮音' },
  { category: 'フローリング', manufacturer: 'DAIKEN', productName: 'MYオトユカ', modelNumber: 'MYOTOYUKA', spec: '1×6 LL45', unitPrice: 6500, unit: '㎡', description: '高遮音' },
  { category: 'フローリング', manufacturer: 'Panasonic', productName: 'ウスイータ', modelNumber: 'USUITA', spec: '1.5mm リフォーム用', unitPrice: 4500, unit: '㎡', description: '上張り用' },
  { category: 'フローリング', manufacturer: 'Panasonic', productName: 'ベリティスフロアー', modelNumber: 'VERITIS', spec: '12mm', unitPrice: 5500, unit: '㎡', description: 'スタンダード' },
  { category: 'フローリング', manufacturer: 'NODA', productName: 'カナエル', modelNumber: 'KANAERU-C12', spec: 'Jベース 12mm', unitPrice: 7000, unit: '㎡', description: '高級床材' },
  { category: 'フローリング', manufacturer: '朝日ウッドテック', productName: 'ライブナチュラル', modelNumber: 'LIVE-NATURAL', spec: '12mm', unitPrice: 8500, unit: '㎡', description: '天然木突板' },

  // 建具
  { category: '建具', manufacturer: 'Panasonic', productName: 'ベリティス', modelNumber: 'PA型', spec: 'H2035', unitPrice: 45000, unit: '枚', description: 'スタンダード建具' },
  { category: '建具', manufacturer: 'Panasonic', productName: 'ベリティス', modelNumber: 'PB型', spec: 'H2035', unitPrice: 55000, unit: '枚', description: 'ガラス入り建具' },
  { category: '建具', manufacturer: 'LIXIL', productName: 'ラシッサS', modelNumber: 'LASISWA-S', spec: 'H2035', unitPrice: 42000, unit: '枚', description: 'スタンダード建具' },
  { category: '建具', manufacturer: 'LIXIL', productName: 'ラシッサD', modelNumber: 'LASISWA-D', spec: 'H2035', unitPrice: 52000, unit: '枚', description: 'デザイン建具' },
  { category: '建具', manufacturer: 'DAIKEN', productName: 'ハピア', modelNumber: 'HAPIA', spec: 'H2035', unitPrice: 48000, unit: '枚', description: 'DAIKEN建具' }
];

const packages = [
  {
    name: 'スタンダード',
    code: 'standard',
    description: '1LDK〜2LDK向け基本パッケージ',
    basePrice: 6200000,
    specs: JSON.stringify({
      ub: 'TOTO WT',
      toilet: 'TOTO ZJ2',
      kitchen: 'LIXIL ES',
      floorHeating: null,
      aircon: '壁掛け'
    })
  },
  {
    name: 'ミドル',
    code: 'middle',
    description: '2LDK向け充実パッケージ',
    basePrice: 6500000,
    specs: JSON.stringify({
      ub: 'TOTO WT 1317〜',
      toilet: 'TOTO ZJ2',
      kitchen: 'LIXIL ES 2550',
      floorHeating: '電気式',
      aircon: '壁掛け'
    })
  },
  {
    name: 'ハイグレード',
    code: 'highgrade',
    description: '2LDK〜向けプレミアムパッケージ',
    basePrice: 7350000,
    specs: JSON.stringify({
      ub: 'LIXIL リノビオP',
      toilet: 'Panasonic アラウーノS160',
      kitchen: 'LIXIL リシェル',
      floorHeating: 'ガス温水式',
      aircon: '天カセマルチ'
    })
  }
];

async function main() {
  console.log('Seeding packages...');

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { code: pkg.code },
      update: pkg,
      create: pkg
    });
  }

  console.log('Seeding default unit prices...');

  for (const price of defaultUnitPrices) {
    await prisma.defaultUnitPrice.upsert({
      where: {
        materialName_spec: {
          materialName: price.materialName,
          spec: price.spec || ''
        }
      },
      update: price,
      create: price
    });
  }

  console.log('Seeding product catalog...');

  for (const product of productCatalog) {
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
    });
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
