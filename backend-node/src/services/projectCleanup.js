import fs from 'fs/promises';

/**
 * プロジェクトを関連データごと完全削除する
 * スキーマにonDelete: Cascadeが無いため、子テーブルを先に消す
 * アップロードファイルの削除はベストエフォート（失敗してもDB削除は続行）
 */
export async function deleteProjectDeep(prisma, projectId) {
  const readings = await prisma.aiReading.findMany({
    where: { projectId },
    select: { filePath: true },
  });

  await prisma.$transaction([
    prisma.aiReading.deleteMany({ where: { projectId } }),
    prisma.override.deleteMany({ where: { projectId } }),
    prisma.materialList.deleteMany({ where: { projectId } }),
    prisma.project.delete({ where: { id: projectId } }),
  ]);

  for (const r of readings) {
    if (!r.filePath) continue;
    try {
      await fs.unlink(r.filePath);
    } catch (e) {
      // 既に無い・権限等は無視（DB上の削除が主目的）
      if (e.code !== 'ENOENT') {
        console.warn(`アップロードファイル削除失敗: ${r.filePath} (${e.message})`);
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

  for (const p of stale) {
    try {
      await deleteProjectDeep(prisma, p.id);
    } catch (e) {
      console.error(`ゲストプロジェクト削除失敗 (id=${p.id}):`, e.message);
    }
  }

  if (stale.length > 0) {
    console.log(`ゲストプロジェクトを${stale.length}件削除しました（${GUEST_RETENTION_HOURS}時間以上経過）`);
  }
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
