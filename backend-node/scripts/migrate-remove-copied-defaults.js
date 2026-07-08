/**
 * 移行スクリプト: 登録時にコピーされた「標準単価と同一」の自社単価行を削除する
 *
 * 背景:
 *   以前は会社登録時にDefaultUnitPriceの全行をUnitPriceへコピーしていた。
 *   計算ロジックが「標準単価に自社カスタムを重ねる」方式に変わったため、
 *   このコピー行は (1) 全資材がカスタム扱いで表示され、(2) 標準単価の更新を
 *   永遠に受け取れない、という害しかない。
 *
 * 削除対象: materialName+spec が標準単価と一致し、かつ unitPrice も同額の行
 * 保持対象: 単価が標準と異なる行（= ユーザーが実際にカスタマイズした行）と
 *           標準単価に存在しない自社独自の資材行
 *
 * 実行方法（1回だけ）:
 *   DATABASE_URL=<本番のURL> node scripts/migrate-remove-copied-defaults.js
 *   （Render Freeプランの場合はBuild Commandに一時的に追記→1回デプロイ→戻す）
 *
 * 冪等: 何度実行しても安全（対象が無ければ何もしない）
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const defaults = await prisma.defaultUnitPrice.findMany();
  const defaultMap = new Map(defaults.map(d => [`${d.materialName}|${d.spec || ''}`, d.unitPrice]));

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  let totalDeleted = 0;

  for (const company of companies) {
    const prices = await prisma.unitPrice.findMany({ where: { companyId: company.id } });
    const copiedIds = prices
      .filter(p => defaultMap.get(`${p.materialName}|${p.spec || ''}`) === p.unitPrice)
      .map(p => p.id);

    if (copiedIds.length > 0) {
      await prisma.unitPrice.deleteMany({ where: { id: { in: copiedIds } } });
      console.log(`${company.name} (id=${company.id}): コピー行${copiedIds.length}件を削除、カスタム${prices.length - copiedIds.length}件を保持`);
      totalDeleted += copiedIds.length;
    }
  }

  console.log(`完了: 合計${totalDeleted}件のコピー単価行を削除しました`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
