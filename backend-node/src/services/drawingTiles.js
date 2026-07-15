/**
 * 図面画像のタイル分割
 *
 * A1図面を1枚のままAIに送ると長辺約1,500px程度に縮小され、
 * 壁仕上記号（楕円内の3文字）や建具の姿図が潰れて読めない。
 * 対策として画像を重なり付きで分割し、各タイルを拡大してから解析する。
 * （手動検証: page_45を6分割×拡大したところ全記号が判読できた）
 *
 * PDFはラスタライズが必要なため対象外（nullを返し、呼び出し側は全体解析のみ行う）
 */
import sharp from 'sharp';
import path from 'path';

const DEFAULT_OPTS = {
  cols: 3,
  rows: 2,
  overlap: 0.12,   // 隣接タイルとの重なり（境界の記号・建具の切断対策）
  maxTileEdge: 1500, // 拡大後の長辺上限（AI側の再縮小を避ける）
};

/**
 * @returns [{ base64Data, mimeType, label }] | null（PDF等で分割不可）
 */
export async function makeTiles(filePath, opts = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return null;

  const { cols, rows, overlap, maxTileEdge } = { ...DEFAULT_OPTS, ...opts };
  const image = sharp(filePath);
  const meta = await image.metadata();
  if (!meta.width || !meta.height) return null;

  const tileW = Math.floor(meta.width / cols);
  const tileH = Math.floor(meta.height / rows);
  const padW = Math.floor(tileW * overlap);
  const padH = Math.floor(tileH * overlap);

  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = Math.max(0, c * tileW - padW);
      const top = Math.max(0, r * tileH - padH);
      const width = Math.min(meta.width - left, tileW + padW * 2);
      const height = Math.min(meta.height - top, tileH + padH * 2);

      // 拡大率: 長辺がmaxTileEdgeになるまで（最大3倍）
      const scale = Math.min(3, maxTileEdge / Math.max(width, height));
      const buffer = await sharp(filePath)
        .extract({ left, top, width, height })
        .resize(Math.round(width * Math.max(1, scale)))
        .png()
        .toBuffer();

      tiles.push({
        base64Data: buffer.toString('base64'),
        mimeType: 'image/png',
        label: `tile-r${r}c${c}`,
      });
    }
  }
  return tiles;
}
