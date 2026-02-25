import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
