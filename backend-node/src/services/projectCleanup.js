import fs from 'fs/promises';

/**
 * プロジェクトを関連データごと完全削除する
 * 子テーブル（AiReading/Override/MaterialList）はスキーマのonDelete: Cascadeで削除される
 * アップロードファイルの削除はベストエフォート（失敗してもDB削除は続行）
 */
export async function deleteProjectDeep(prisma, projectId) {
  const readings = await prisma.aiReading.findMany({
    where: { projectId },
    select: { filePath: true },
  });

  await prisma.project.delete({ where: { id: projectId } });

  await unlinkFiles(readings.map(r => r.filePath));
}

async function unlinkFiles(filePaths) {
  for (const filePath of filePaths) {
    if (!filePath) continue;
    try {
      await fs.unlink(filePath);
    } catch (e) {
      // 既に無い・権限等は無視（DB上の削除が主目的）
      if (e.code !== 'ENOENT') {
        console.warn(`アップロードファイル削除失敗: ${filePath} (${e.message})`);
      }
    }
  }
}

// ゲスト（未ログイン）プロジェクトの保持期間
// ゲストは履歴機能が無く、セッション中の画面遷移のためだけにDBに存在する
const GUEST_RETENTION_HOURS = 24;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6時間ごと

/**
 * 保持期間を過ぎたゲストプロジェクトを削除する（1回分）
 */
export async function cleanupGuestProjects(prisma) {
  const cutoff = new Date(Date.now() - GUEST_RETENTION_HOURS * 60 * 60 * 1000);
  const stale = await prisma.project.findMany({
    where: { companyId: null, createdAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  const staleIds = stale.map(p => p.id);
  const readings = await prisma.aiReading.findMany({
    where: { projectId: { in: staleIds } },
    select: { filePath: true },
  });

  // 件数に関わらず一括削除（子テーブルはonDelete: Cascade）
  await prisma.project.deleteMany({ where: { id: { in: staleIds } } });
  await unlinkFiles(readings.map(r => r.filePath));

  console.log(`ゲストプロジェクトを${stale.length}件削除しました（${GUEST_RETENTION_HOURS}時間以上経過）`);
  return stale.length;
}

/**
 * 定期クリーンアップを開始（起動時に1回+6時間ごと）
 */
export function startGuestCleanup(prisma) {
  const run = () => cleanupGuestProjects(prisma).catch(e => {
    console.error('ゲストクリーンアップ実行エラー:', e.message);
  });
  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref(); // クリーンアップのためだけにプロセスを生かさない
  return timer;
}
