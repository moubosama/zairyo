import { Router } from 'express';
import crypto from 'crypto';
import fsPromises from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeLimiter } from '../middleware/rateLimits.js';
import { optionalAuth, projectScope } from '../middleware/auth.js';
import { analyzeDrawing, analyzeAuxDrawing, analyzeWallCodesTiled, analyzeOpeningsTiled } from '../services/claudeApi.js';
import { calculateMaterials } from '../services/materialCalculator.js';
import {
  computeElevationTakeoff, applyElevationTakeoff, filterKenzaiScope,
  validateTakeoffSanity, hasNoWallCodes,
  normalizeDoorSymbol, normalizeRoomName,
} from '../services/buildupCalculator.js';
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

// アップロード3種: file=平面詳細図（必須）, elevation=展開図（任意）, door_schedule=建具表（任意）
const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'elevation', maxCount: 1 },
  { name: 'door_schedule', maxCount: 1 },
]);

// multerエラー（サイズ超過・不正フィールド等）は500でなく400+理由で返す
// ※ multer自身が保存済みファイルを削除するため孤児化はしない
const uploadFieldsWith400 = (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'ファイルサイズは10MB以下にしてください'
        : `アップロードエラー: ${err.message}`;
      return res.status(400).json({ error: message });
    }
    next();
  });
};

/**
 * 壁記号タイル解析の再実行が必要かの判定（純関数・test-wallcode-reread.mjsで検証）
 * 再実行する条件:
 *  1. wall_finish_codes が無い/空（初回）
 *  2. 前回が部分失敗（_wall_codes_partial。quota切れの部分結果が固定化される事故の回復手段）
 *  3. どのエントリにも寸法付きplacement（wall_length_mm>0）が1件も無い
 *     ← STEP1の全体図解析（analyzeDrawing）は部屋別のcodesのみを返しplacementsを持たない。
 *        これでタイル解析をスキップすると placementByFace が寸法マッチできず面割付が全滅し、
 *        全面デフォルトG14扱いで壁PBが暴発する（gemini-3.5-flash E2Eで148枚=+70%を実測・2026-07-19）
 */
export function wallCodesNeedTileReread(analysisResult) {
  const list = analysisResult.wall_finish_codes;
  if (!Array.isArray(list) || list.length === 0) return true;
  if (analysisResult._wall_codes_partial === true) return true;
  const hasDimensionedPlacement = list.some((w) =>
    Array.isArray(w?.placements) &&
    w.placements.some((p) => Number.isFinite(p?.wall_length_mm) && p.wall_length_mm > 0));
  return !hasDimensionedPlacement;
}

/**
 * タイル読取結果と既存wall_finish_codesのマージ（純関数・test-wallcode-reread.mjsで検証）
 * タイル結果（寸法付きplacements）を正とし、同一部屋の既存エントリ（STEP1由来のcodesのみ等）は上書き。
 * タイルに現れなかった部屋の既存エントリは残す（codesのみでもデフォルトG14回避に有効=害がない）。
 * 部屋名は正規化+包含で突合（plan_codesマージと同じゆれ対策）。タイル結果を先頭に置くため、
 * 後段のplan_codes突合（find=先勝ち）でも近縁名が残った場合はタイル側が勝つ
 */
/**
 * タイル失敗理由の内訳文字列（純関数・test-tile-failures.mjsで検証）
 * analyzeTilesのfailedReasons [{tile, kind, detail}] を「レート制限×2・解析失敗×1」形式に集計し、
 * repairedTiles（途切れ救済採用=結果はあるが欠落の可能性）は末尾に「途切れ救済×N」で足す。
 * 旧記録・テストモック等でどちらも無い場合は ''（呼び出し側で内訳なし文言にフォールバック）
 */
const TILE_FAILURE_KIND_LABELS = {
  rate_limit: 'レート制限', // 429（RPM/日次quota）
  server: 'サーバーエラー', // 5xx
  parse: '解析失敗',        // JSONパース失敗（出力途切れの救済不能を含む）
  empty: '応答なし',        // r=null（キー未設定等）
  error: 'その他',          // 401/403・ネットワーク断等
};
export function tileFailureBreakdown(failedReasons, repairedTiles = 0) {
  const parts = [];
  if (Array.isArray(failedReasons) && failedReasons.length > 0) {
    const counts = new Map();
    for (const f of failedReasons) {
      const kind = f?.kind || 'error';
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    parts.push(...[...counts].map(([kind, n]) => `${TILE_FAILURE_KIND_LABELS[kind] || kind}×${n}`));
  }
  if (repairedTiles > 0) parts.push(`途切れ救済×${repairedTiles}`);
  return parts.join('・');
}

export function mergeWallFinishCodes(prev, tiledResults) {
  const prevList = Array.isArray(prev) ? prev : [];
  const kept = prevList.filter((w) => {
    const wn = normalizeRoomName(w?.room);
    if (!wn) return false;
    return !tiledResults.some((t) => {
      const tn = normalizeRoomName(t?.room);
      return tn && (tn === wn || tn.includes(wn) || wn.includes(tn));
    });
  });
  return [...tiledResults, ...kept];
}

/**
 * 展開図の解析結果をparsedDataへ統合する共通処理
 * （タイル詳細パスの実行と、壁記号・開口のマージ。一括uploadと段階式auxの両方から使う。
 *  E2E測定スクリプト scripts/e2e-gemini.mjs からも再利用するためexport）
 * @param analysisResult 平面図の解析結果（elevations等を書き込む）
 * @param elevParsed 展開図の解析結果（rooms必須）
 * @param planPath 平面詳細図のファイルパス（壁記号タイル読取に使用。無ければスキップ）
 * @param elevPath 展開図のファイルパス（開口タイル読取に使用）
 * @param deps テスト用の解析関数注入（省略時は本物。test-wallcode-reread.mjsが使用）
 * @returns タイル読取の統計 { wall_codes: {failedTiles,totalTiles}|null, openings: 同|null }
 *          （E2Eスクリプトの表示用。本番ルートは戻り値を使わずanalysisResult側のフラグを見る）
 */
export async function attachElevationData(analysisResult, elevParsed, planPath, elevPath, deps = {}) {
  const {
    wallCodesAnalyzer = analyzeWallCodesTiled,
    openingsAnalyzer = analyzeOpeningsTiled,
  } = deps;
  analysisResult.elevations = elevParsed;
  const roomNames = (analysisResult.rooms || []).map((r) => r.name).filter(Boolean);

  // タイル詳細パス: 全体画像では潰れる壁記号・開口を分割拡大で読み取る
  // （失敗しても全体パスの結果で続行）
  const planReadable = planPath
    ? await fsPromises.access(planPath).then(() => true).catch(() => false)
    : false;
  // 壁記号は寸法付きの既存読取があればスキップ。無い/空・部分失敗・codesのみ（placements欠落）
  // なら再実行する（判定の詳細は wallCodesNeedTileReread のコメント参照）
  const needWallCodes = planReadable && wallCodesNeedTileReread(analysisResult);
  const [tiledCodes, tiledOpenings] = await Promise.all([
    needWallCodes
      ? wallCodesAnalyzer(planPath, { roomNames }).catch(() => null)
      : Promise.resolve(null),
    openingsAnalyzer(elevPath, { roomNames }).catch(() => null),
  ]);
  const tileStats = { wall_codes: null, openings: null };
  if (tiledCodes) {
    tileStats.wall_codes = { failedTiles: tiledCodes.failedTiles, totalTiles: tiledCodes.totalTiles };
    if (tiledCodes.results.length > 0) {
      analysisResult.wall_finish_codes = mergeWallFinishCodes(analysisResult.wall_finish_codes, tiledCodes.results);
      console.log('壁記号タイル読取:', JSON.stringify(tiledCodes.results));
    }
    // 部分失敗の顕在化: API制限（429/quota切れ）で空になったタイルを「記号なし」と区別して
    // フラグ+警告に残す。全タイル成功でフラグ・警告とも解除（再読取ループを止める）。
    // 途切れ救済採用（repairedTiles）も「不完全」に含める（結果はあるが要素欠落の可能性が
    // あるため、警告表示+再アップロードでの再読取対象にする・レビューS-2）
    const otherWarnings = (analysisResult._warnings || []).filter((w) => w.field !== 'wall_codes_partial');
    const repairedTiles = tiledCodes.repairedTiles || 0;
    if (tiledCodes.failedTiles > 0 || repairedTiles > 0) {
      analysisResult._wall_codes_partial = true;
      // 失敗理由の内訳を文言に含める（旧文言はAPI制限決め打ちで、パース失敗（出力途切れ）等を
      // 診断できなかった・2026-07-20）。failedReasonsが無い旧経路は内訳なしで従来相当
      const breakdown = tileFailureBreakdown(tiledCodes.failedReasons, repairedTiles);
      analysisResult._warnings = [...otherWarnings, {
        field: 'wall_codes_partial',
        message: `壁記号の読取タイル ${tiledCodes.failedTiles + repairedTiles}/${tiledCodes.totalTiles}件が不完全です` +
          `${breakdown ? `（内訳: ${breakdown}）` : ''}。` +
          '壁数量が過大になる可能性があります。展開図を再アップロードすると再読取します',
        before: null,
        after: null,
      }];
    } else {
      delete analysisResult._wall_codes_partial;
      if (analysisResult._warnings && otherWarnings.length !== analysisResult._warnings.length) {
        analysisResult._warnings = otherWarnings;
      }
    }
  }
  if (tiledOpenings) {
    tileStats.openings = { failedTiles: tiledOpenings.failedTiles, totalTiles: tiledOpenings.totalTiles };
  }
  if (tiledOpenings && tiledOpenings.results.length > 0) {
    // 部屋名+面でマッチする面に開口をマージ（タイル読取の方が詳細）
    // 部屋名は正規化して突合（全角「洋室（１）」vs「洋室(1)」等のゆれで丸ごと落ちるのを防ぐ・2026-07-18）
    let mergedCount = 0;
    for (const op of tiledOpenings.results) {
      const opRoom = normalizeRoomName(op.room);
      const room = analysisResult.elevations.rooms.find((r) => {
        const rn = normalizeRoomName(r.name);
        return rn && opRoom && (rn === opRoom || rn.includes(opRoom) || opRoom.includes(rn));
      });
      if (!room) continue;
      const face = (room.faces || []).find((f) => f.face === op.face) || (room.faces || [])[0];
      if (!face) continue;
      face.openings = face.openings || [];
      // 同一面に同タイプ・同幅の開口が既にあればスキップ
      const dup = face.openings.some((o) => o.type === op.type && o.width_mm === op.width_mm);
      if (!dup) {
        face.openings.push({ type: op.type, symbol: op.symbol, width_mm: op.width_mm, height_mm: op.height_mm });
        mergedCount++;
      }
    }
    console.log(`開口タイル読取: ${tiledOpenings.results.length}件中${mergedCount}件をマージ`);
  }

  // 平面詳細図から抽出した壁仕上記号を部屋名でマージ（buildupの部位振り分けに使う）
  // 部屋名は正規化して突合（表記ゆれでplan_codesが落ちると全面デフォルトG14=壁PB過大の残存経路・2026-07-18）
  if (Array.isArray(analysisResult.wall_finish_codes)) {
    for (const room of analysisResult.elevations.rooms) {
      const rn = normalizeRoomName(room.name);
      const match = analysisResult.wall_finish_codes.find((w) => {
        const wn = normalizeRoomName(w.room);
        return wn && rn && (wn === rn || rn.includes(wn) || wn.includes(rn));
      });
      if (match && Array.isArray(match.codes)) {
        room.plan_codes = match.codes;
        // タイル読取の「記号＋長辺/短辺」割付（buildupが面幅とマッチングして面単位に割り付ける）
        if (Array.isArray(match.placements)) room.plan_placements = match.placements;
      }
    }
  }
  return tileStats;
}

/**
 * 建具表の符号単位マージ（複数ページ対応）
 * 既存符号は保持し、寸法が欠けている場合のみ新しい読み取りで埋める
 * （段階式auxとE2E測定スクリプトの両方から使う）
 * キーは正規化符号（normalizeDoorSymbol）: 生symbolキーだと全角・ハイフンの表記ゆれで同一建具が
 * 別エントリのまま残り、下流buildDoorLookupの正規化キーで衝突する（2026-07-18修正）。
 * 既存保存データに生キー重複が残っていても、ここを通れば同一符号に統合される
 * 補完はフィールド単位（buildDoorLookupと同方針・2026-07-19）:
 *   - 丸ごとspreadは新規行のnullフィールドが既存の実寸を消し（開口控除が落ち壁PBが過大化）、
 *     表示symbolも後勝ちの表記（全角等）に化けるため、既存を土台に欠けたフィールドだけ埋める
 *   - 非null同士の寸法矛盾は該当フィールドをnull化して警告に出す（=buildDoorLookupの毒化
 *     セーフティと同じ「符号マッチ不成立→fallback高さ」へ倒す安全側。黙って片方を採ると
 *     矛盾情報が保存データから消え、下流の毒化検出が本番経路で不達になる）。
 *     null化した寸法は後続行の値でも復活させない（どちらが正か確定できないままのため）
 * @returns { doors: マージ後の配列, added: 新規追加された符号数,
 *            warnings: _warnings形式の矛盾警告 [{field:'door_schedule_conflict', message, before, after}] }
 */
export function mergeDoorSchedule(existing, incoming) {
  const bySymbol = new Map();
  const conflicted = new Map(); // 正規化符号 → Set(矛盾確定フィールド)。復活防止用
  const warnings = [];
  // 既存側優先の登録: 新規符号ならtrue。既存符号は保持し、欠けたフィールドのみ埋める
  const put = (d) => {
    const key = normalizeDoorSymbol(d?.symbol);
    if (!key) return false;
    const prev = bySymbol.get(key);
    if (!prev) {
      bySymbol.set(key, d);
      return true;
    }
    const merged = { ...prev }; // symbolは既存表記を維持
    const cset = conflicted.get(key) || new Set();
    const conflictNotes = [];
    for (const f of ['width_mm', 'height_mm']) {
      if (cset.has(f)) continue; // 矛盾確定済み（null維持）
      if (prev[f] != null && d[f] != null && prev[f] !== d[f]) {
        conflictNotes.push(`${f === 'width_mm' ? '幅' : '高さ'}${prev[f]}↔${d[f]}`);
        merged[f] = null;
        cset.add(f);
      } else if (merged[f] == null && d[f] != null) {
        merged[f] = d[f];
      }
    }
    for (const f of ['name', 'location']) {
      if (merged[f] == null && d[f] != null) merged[f] = d[f];
    }
    if (conflictNotes.length > 0) {
      conflicted.set(key, cset);
      warnings.push({
        field: 'door_schedule_conflict',
        message: `建具表の符号${prev.symbol || d.symbol}の寸法がページ間で矛盾しています` +
          `（${conflictNotes.join('・')}）。該当寸法は未確定として扱います（開口はfallback高さで控除）`,
        before: null,
        after: null,
      });
    }
    bySymbol.set(key, merged);
    return false;
  };
  for (const d of (Array.isArray(existing) ? existing : [])) put(d);
  let added = 0;
  for (const d of incoming || []) {
    if (put(d)) added++;
  }
  return { doors: [...bySymbol.values()], added, warnings };
}

/**
 * /aux のAI障害を「一時的（再試行で直る）」と「恒久（設定・認証の問題）」に分類してレスポンスを組む。
 * 恒久エラーに「1分待って再アップロード」と案内すると、直らないリトライをユーザーに強いるため文言を分ける
 * （メインupload経路のキー未設定文言 claudeApi.js analyzeDrawing と揃える）。
 * - キー未設定: analyzeWithClaude/Gemini が 'xxx is not configured'（status 500）を投げる → メッセージで識別
 * - キー無効・権限なし: Claude等はAPIの401/403が err.status に入る → 恒久扱い。
 *   Geminiの無効/失効キーは HTTP 400 + message「API key not valid」/ API_KEY_INVALID で返るため
 *   （本番AI_PROVIDER=gemini稼働中の主経路）、ステータスではなくメッセージでも識別する
 * - それ以外（429/529/接続断/タイムアウト）: 一時的 → 従来どおり再試行を誘導
 * ステータスはメインupload経路のAI障害と同じ503で統一（フロントの扱いを変えない）
 * @returns { status, body: { error, message } }
 */
export function auxAiErrorResponse(e) {
  const msg = String(e?.message || '');
  if (msg.includes('is not configured')) {
    return { status: 503, body: {
      error: 'ai_not_configured',
      message: 'AI解析の設定が完了していません（APIキー未設定）。運営者にご連絡ください。',
    } };
  }
  if (e?.status === 401 || e?.status === 403 || /API key not valid|API_KEY_INVALID/i.test(msg)) {
    return { status: 503, body: {
      error: 'ai_auth_error',
      message: `AI解析の認証に失敗しました（コード${e?.status ?? '不明'}）。時間を置いても解消しない場合は運営者にご連絡ください。`,
    } };
  }
  return { status: 503, body: {
    error: 'ai_unavailable',
    message: `AI解析が一時的に失敗しました（コード${e?.status || '接続'}）。1分ほど待って再アップロードしてください。`,
  } };
}

/**
 * /aux の書き込み直前マージ: AI解析（数十秒）の間に /calculate 等が parsedData を更新していた場合、
 * 冒頭で読んだスナップショットを丸ごと書き戻すと相手の変更が消える（lost update）。
 * そこで最新版（freshObj）を土台に、このリクエストが変更したフィールドだけを移植する。
 * ※ DBの行ロック・トランザクション排他は使っていないため完全な排他ではない
 *   （読み→書きの窓をAI待ちの数十秒からms級へ縮小する対処。残る競合窓では後勝ち）
 * @param freshObj 書き込み直前に再読取した最新の parsedData
 * @param baseObj  このリクエスト開始時に読んだ parsedData（変更前スナップショット）
 * @param myObj    このリクエストが変更を加えた parsedData
 * @param kind     'elevation' | 'door_schedule'
 * @returns freshObj（破壊的に更新して返す）
 */
export function mergeAuxIntoFresh(freshObj, baseObj, myObj, kind) {
  if (kind === 'elevation') {
    // 展開図は再アップロードで丸ごと差し替える仕様（attachElevationData参照）のため上書きでよい
    freshObj.elevations = myObj.elevations;
    if ('wall_finish_codes' in myObj) freshObj.wall_finish_codes = myObj.wall_finish_codes;
    // タイル部分失敗フラグは有無ごと自分の結果に合わせる（全成功時はdeleteされる）
    if (myObj._wall_codes_partial === true) freshObj._wall_codes_partial = true;
    else delete freshObj._wall_codes_partial;
  } else {
    // 建具表は符号単位マージ済みの結果で置き換え（並行して建具表を触るのは自分だけの前提。
    // /calculate は door_schedule を変更しない）
    freshObj.door_schedule = myObj.door_schedule;
  }
  // _warnings は (field,message) キーの3方向マージ:
  // 自分が追加した警告を足し、自分が消した警告（例: 部分失敗解消時の wall_codes_partial）を除き、
  // 並行して追加された警告（例: /calculate の source:'calculate' 警告）は保持する
  const key = (w) => JSON.stringify([w?.field ?? null, w?.message ?? null]);
  const baseKeys = new Set((baseObj._warnings || []).map(key));
  const myKeys = new Set((myObj._warnings || []).map(key));
  const kept = (freshObj._warnings || []).filter((w) => myKeys.has(key(w)) || !baseKeys.has(key(w)));
  const keptKeys = new Set(kept.map(key));
  const addedByMe = (myObj._warnings || []).filter((w) => !baseKeys.has(key(w)) && !keptKeys.has(key(w)));
  const next = [...kept, ...addedByMe];
  if (next.length > 0 || freshObj._warnings) freshObj._warnings = next;
  return freshObj;
}

// POST /api/projects/:id/upload - 図面アップロード+AI解析
router.post('/:id/upload', uploadLimiter, uploadFieldsWith400, async (req, res) => {
  // エラー時に全アップロードファイルを掃除するためのヘルパー
  const allFiles = () => ['file', 'elevation', 'door_schedule']
    .map((k) => req.files?.[k]?.[0])
    .filter(Boolean);
  const cleanupFiles = async (files) => {
    for (const f of files) await fsPromises.unlink(f.path).catch(() => {});
  };
  let mainFilePersisted = false; // aiReading保存後はメインファイルを消さない
  try {
    // 簡易アップロードガード（テスト版の課金露出対策）
    // UPLOAD_GUARD_TOKEN が設定されている場合のみ有効
    const guardToken = process.env.UPLOAD_GUARD_TOKEN;
    if (guardToken && req.headers['x-upload-token'] !== guardToken) {
      await cleanupFiles(allFiles()); // multerは保存済みのため掃除必須
      return res.status(403).json({ error: 'アップロードが許可されていません' });
    }

    const prisma = req.app.get('prisma');
    const project = await findOwnedProject(prisma, req);
    if (!project) {
      await cleanupFiles(allFiles());
      return res.status(404).json({ error: 'Project not found' });
    }
    const projectId = project.id;
    console.log('Upload request for project:', projectId);

    const mainFile = req.files?.file?.[0];
    const elevationFile = req.files?.elevation?.[0];
    const doorScheduleFile = req.files?.door_schedule?.[0];

    if (!mainFile) {
      await cleanupFiles(allFiles());
      return res.status(400).json({ error: '平面詳細図（file）は必須です' });
    }
    console.log('File uploaded:', mainFile.path,
      elevationFile ? '+展開図' : '', doorScheduleFile ? '+建具表' : '');

    // マジックバイト検証: 拡張子偽装（例: exeを.pdfにリネーム）を拒否（全ファイル）
    for (const f of allFiles()) {
      if (!(await isValidFileSignature(f.path))) {
        await cleanupFiles(allFiles());
        return res.status(400).json({ error: `ファイルの内容がPDF/PNG/JPGではありません: ${f.originalname}` });
      }
    }

    // Claude APIで解析（専有面積のユーザー入力があれば最優先で採用）
    const userTotalAreaSqm = req.body.total_area_sqm
      ? parseFloat(req.body.total_area_sqm)
      : null;
    console.log('Starting AI analysis...', userTotalAreaSqm ? `(専有面積入力: ${userTotalAreaSqm}㎡)` : '');
    const analysisResult = await analyzeDrawing(mainFile.path, {
      userTotalAreaSqm: userTotalAreaSqm && userTotalAreaSqm > 0 ? userTotalAreaSqm : undefined,
    });
    console.log('AI analysis complete');

    // AIが両方応答しなかった場合は503（一時的な障害・再試行可能）
    if (analysisResult._ai_unavailable) {
      await cleanupFiles(allFiles());
      return res.status(503).json({
        error: 'ai_unavailable',
        message: analysisResult.rejection_reason,
      });
    }

    // 図面種別ゲート: 両AIが非平面図と判定した場合は400エラー
    if (analysisResult.is_rejected) {
      console.log('Image rejected:', analysisResult.rejection_reason);
      await cleanupFiles(allFiles());
      return res.status(400).json({
        error: 'invalid_document_type',
        message: analysisResult.rejection_reason || 'この画像は計画平面図ではありません。資材計算には計画平面図をアップロードしてください。',
        document_type: analysisResult.document_type,
      });
    }

    // 補助図面（展開図・建具表）の解析。失敗しても平面図の結果は生かす（警告のみ）
    const auxWarnings = [];
    if (elevationFile) {
      const planRoomNames = (analysisResult.rooms || []).map((r) => r.name).filter(Boolean);
      const elevRes = await analyzeAuxDrawing(elevationFile.path, 'elevation', { roomNames: planRoomNames }).catch(() => null);
      if (elevRes?.parsed?.drawing_type === 'elevation' &&
          Array.isArray(elevRes.parsed.rooms) && elevRes.parsed.rooms.length > 0) {
        await attachElevationData(analysisResult, elevRes.parsed, mainFile.path, elevationFile.path);
      } else {
        auxWarnings.push({
          field: 'elevation',
          message: '展開図の読み取りに失敗したため、壁面積は平面図からの推定値を使用します',
          before: elevationFile.originalname, after: null,
        });
      }
    }
    if (doorScheduleFile) {
      const doorRes = await analyzeAuxDrawing(doorScheduleFile.path, 'door_schedule').catch(() => null);
      if (doorRes?.parsed?.drawing_type === 'door_schedule' && Array.isArray(doorRes.parsed.doors)) {
        analysisResult.door_schedule = doorRes.parsed.doors;
      } else {
        auxWarnings.push({
          field: 'door_schedule',
          message: '建具表の読み取りに失敗したため、開口は標準サイズを使用します',
          before: doorScheduleFile.originalname, after: null,
        });
      }
    }
    if (auxWarnings.length > 0) {
      analysisResult._warnings = [...(analysisResult._warnings || []), ...auxWarnings];
    }
    // 補助図面ファイルはデータ抽出後に削除（AiReadingはfilePathを1つしか持たないため孤児化を防ぐ）
    await cleanupFiles([elevationFile, doorScheduleFile].filter(Boolean));

    // AI生テキストはrawResponseへ、正規化済みJSONはparsedDataへ
    // （生テキストは後日のevalセット作成・デバッグの一次資料になる）
    const rawResponses = analysisResult._raw_responses || null;
    delete analysisResult._raw_responses;

    const aiReading = await prisma.aiReading.create({
      data: {
        projectId,
        fileName: mainFile.originalname,
        filePath: mainFile.path,
        rawResponse: JSON.stringify(rawResponses),
        parsedData: JSON.stringify(analysisResult)
      }
    });
    mainFilePersisted = true;

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
    // 例外パスでも孤児ファイルを残さない（DB保存済みのメインファイルは残す）
    if (!mainFilePersisted) {
      await cleanupFiles(allFiles());
    }
    res.status(500).json({ error: error.message });
  }
});

// POST /api/projects/:id/aux - 補助図面の段階式アップロード（展開図 or 建具表を1枚ずつ）
// 平面詳細図の解析済みプロジェクトに対して追加解析する。
// ①の読み取り結果（部屋一覧）をプロンプトに渡すため、一括アップロードより部屋名の対応づけ精度が高い。
// 建具表は符号単位でマージするため複数ページを順にアップロードできる。
router.post('/:id/aux', uploadLimiter, uploadFieldsWith400, async (req, res) => {
  const allFiles = () => ['file', 'elevation', 'door_schedule']
    .map((k) => req.files?.[k]?.[0])
    .filter(Boolean);
  const cleanup = async () => {
    for (const f of allFiles()) await fsPromises.unlink(f.path).catch(() => {});
  };
  try {
    const guardToken = process.env.UPLOAD_GUARD_TOKEN;
    if (guardToken && req.headers['x-upload-token'] !== guardToken) {
      await cleanup();
      return res.status(403).json({ error: 'アップロードが許可されていません' });
    }

    const prisma = req.app.get('prisma');
    const project = await findOwnedProject(prisma, req);
    if (!project) {
      await cleanup();
      return res.status(404).json({ error: 'Project not found' });
    }

    const elevationFile = req.files?.elevation?.[0];
    const doorScheduleFile = req.files?.door_schedule?.[0];
    const auxFile = elevationFile || doorScheduleFile;
    const kind = elevationFile ? 'elevation' : (doorScheduleFile ? 'door_schedule' : null);
    if (!auxFile || (elevationFile && doorScheduleFile)) {
      await cleanup();
      return res.status(400).json({ error: '展開図（elevation）か建具表（door_schedule）をどちらか1枚指定してください' });
    }
    if (!(await isValidFileSignature(auxFile.path))) {
      await cleanup();
      return res.status(400).json({ error: `ファイルの内容がPDF/PNG/JPGではありません: ${auxFile.originalname}` });
    }

    const aiReading = await prisma.aiReading.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!aiReading) {
      await cleanup();
      return res.status(400).json({ error: 'plan_required', message: '先に平面詳細図をアップロードしてください' });
    }
    const parsedData = JSON.parse(aiReading.parsedData);
    const roomNames = (parsedData.rooms || []).map((r) => r.name).filter(Boolean);

    // API障害（529等）と「図面種別が違う」を区別する。前者は503で再試行を促す
    let summary;
    let auxApiError = null;
    const analyzeWithErrorCapture = (kindArg, context) =>
      analyzeAuxDrawing(auxFile.path, kindArg, context).catch((e) => {
        auxApiError = e;
        console.error(`Aux analyze API error (${kindArg}):`, e?.status || '', e?.message);
        return null;
      });

    if (kind === 'elevation') {
      const elevRes = await analyzeWithErrorCapture('elevation', { roomNames });
      if (auxApiError) {
        await cleanup();
        // キー未設定・認証エラーは再試行では直らないため文言を分ける（auxAiErrorResponse参照）
        const { status, body } = auxAiErrorResponse(auxApiError);
        return res.status(status).json(body);
      }
      if (!(elevRes?.parsed?.drawing_type === 'elevation' &&
            Array.isArray(elevRes.parsed.rooms) && elevRes.parsed.rooms.length > 0)) {
        console.error('elevation_unreadable. drawing_type:', elevRes?.parsed?.drawing_type,
          '/ rooms:', elevRes?.parsed?.rooms?.length,
          '/ rawText先頭200字:', (elevRes?.rawText || '(なし)').slice(0, 200));
        await cleanup();
        return res.status(400).json({
          error: 'elevation_unreadable',
          message: '展開図として読み取れませんでした。展開図のページか確認して再アップロードしてください。',
        });
      }
      // 再アップロード時は前回の展開図を丸ごと置き換える（読み直しのリトライを可能にする）
      await attachElevationData(parsedData, elevRes.parsed, aiReading.filePath, auxFile.path);
      summary = {
        kind,
        rooms: parsedData.elevations.rooms.length,
        room_names: parsedData.elevations.rooms.map((r) => r.name),
        openings: parsedData.elevations.rooms.reduce(
          (s, r) => s + (r.faces || []).reduce((t, f) => t + (f.openings || []).length, 0), 0),
        wall_code_rooms: Array.isArray(parsedData.wall_finish_codes) ? parsedData.wall_finish_codes.length : 0,
        // タイル部分失敗（quota切れ等）の顕在化。trueなら再アップロードで再読取される
        wall_codes_partial: parsedData._wall_codes_partial === true,
      };
    } else {
      const doorRes = await analyzeWithErrorCapture('door_schedule');
      if (auxApiError) {
        await cleanup();
        // キー未設定・認証エラーは再試行では直らないため文言を分ける（auxAiErrorResponse参照）
        const { status, body } = auxAiErrorResponse(auxApiError);
        return res.status(status).json(body);
      }
      if (!(doorRes?.parsed?.drawing_type === 'door_schedule' && Array.isArray(doorRes.parsed.doors))) {
        console.error('door_schedule_unreadable. drawing_type:', doorRes?.parsed?.drawing_type,
          '/ rawText先頭200字:', (doorRes?.rawText || '(なし)').slice(0, 200));
        await cleanup();
        return res.status(400).json({
          error: 'door_schedule_unreadable',
          message: '建具表として読み取れませんでした。建具表のページか確認して再アップロードしてください。',
        });
      }
      // 複数ページ対応: 符号単位でマージ（既存符号は保持し欠けたフィールドのみ補完）
      const { doors, added, warnings: doorWarnings } =
        mergeDoorSchedule(parsedData.door_schedule, doorRes.parsed.doors);
      parsedData.door_schedule = doors;
      // 寸法矛盾の警告を_warningsへ追記（同一メッセージの重複は追加しない。
      // 矛盾でnull化済みの符号は再マージで矛盾を再検出できないため、過去の警告は消さず残す）
      if (doorWarnings.length > 0) {
        const prevWarnings = parsedData._warnings || [];
        const newOnes = doorWarnings.filter(
          (w) => !prevWarnings.some((p) => p.field === w.field && p.message === w.message));
        parsedData._warnings = [...prevWarnings, ...newOnes];
      }
      summary = { kind, doors_total: doors.length, added, door_conflicts: doorWarnings.length };
    }

    // 書き込み直前に再読取し、最新版を土台に自分の変更フィールドだけを移植して書き戻す
    // （AI解析の数十秒の間に /calculate が警告を追記した場合等の lost update 対策。
    //  完全な排他ではなくms級の競合窓は残る。詳細は mergeAuxIntoFresh のコメント参照）
    let writeData = parsedData;
    try {
      const fresh = await prisma.aiReading.findUnique({ where: { id: aiReading.id } });
      if (fresh && fresh.parsedData !== aiReading.parsedData) {
        writeData = mergeAuxIntoFresh(
          JSON.parse(fresh.parsedData),        // 最新版（並行更新を含む）
          JSON.parse(aiReading.parsedData),    // 開始時スナップショット（変更前）
          parsedData, kind);
      }
    } catch (e) {
      // 再読取・パース失敗時は自分のスナップショットを書く（従来動作にフォールバック）
      console.warn('Aux fresh-merge skipped:', e?.message);
    }
    await prisma.aiReading.update({
      where: { id: aiReading.id },
      data: { parsedData: JSON.stringify(writeData) },
    });
    // 補助図面ファイルはデータ抽出後に削除（AiReadingはfilePathを1つしか持たない）
    await cleanup();

    res.json({ aux: summary, parsedData: writeData });
  } catch (error) {
    console.error('Aux upload error:', error);
    await cleanup();
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

    // 展開図データがあればボトムアップ実測で壁・巾木・PB・クロス系を置き換える
    // （プロの拾い出しと同じ「部屋×面×部位」方式。buildupCalculator参照）
    let parsedObj = null;
    try { parsedObj = JSON.parse(project.aiReadings[0].parsedData); } catch { /* 破損時は推定のまま */ }
    if (parsedObj?.elevations?.rooms?.length) {
      const takeoff = computeElevationTakeoff(parsedObj.elevations, parsedObj.door_schedule || [],
        { planRooms: parsedObj.rooms || [],       // 収納内の間仕切下地推定に平面図の部屋一覧を渡す
          closetInteriors: parsedObj.closet_interiors || [] }); // 収納内側の実寸（家具工事シート等・任意）

      // サニティチェック: 展開図の読み取りが破綻している場合は実測値を採用しない
      // （破綻した読みを盲信して壁PB+92%の異常値を出していた事故の再発防止。
      //  不採用時は materialCalculator の推定値がそのまま残る＝従来動作にフォールバック）
      const sanity = validateTakeoffSanity(takeoff, {
        totalFloorAreaSqm: parsedObj.total_floor_area_sqm,
        elevations: parsedObj.elevations,
      });
      if (sanity.ok) {
        applyElevationTakeoff(result, takeoff);
        console.log('展開図実測モード適用:', JSON.stringify({
          wall_pb_sqm: takeoff.wall_pb_sqm,
          wall_pb_sheets: Math.ceil(takeoff.wall_pb_sqm / 1.4),
          cloth: takeoff.cloth_sqm,
          skirting: takeoff.skirting_m,
        }));
      } else {
        console.warn('展開図実測モード: サニティNG → 推定値を使用:',
          JSON.stringify({ wall_pb_sqm: takeoff.wall_pb_sqm, reasons: sanity.reasons.map((r) => r.code) }));
        // 警告の形は既存（opening_guard等）と揃える: field/message/before/after の4キー。
        // 検出理由の詳細（reasons）はmessageへ畳み込む（フロントの警告パネルは固定フィールドで
        // レンダリングするため、独自キーを増やさない）。生のreasonsはサーバーログ側に出している。
        result._warnings = [...(result._warnings || []), {
          field: 'elevation_takeoff_rejected',
          message: '展開図の読み取りに問題があるため実測値を採用せず推定値を表示しています'
            + `（${sanity.reasons.map((r) => r.message).join('／')}）。`
            + '展開図を再アップロードすると改善する場合があります',
          before: null, after: null,
        }];
      }
      // 記号が1つも読めていない場合の情報提供（実測モード自体は止めない。
      // 記号ゼロ=全面デフォルトPB扱いで過大側に出やすいことを利用者に知らせる）
      if (sanity.ok && hasNoWallCodes(parsedObj.elevations)) {
        result._warnings = [...(result._warnings || []), {
          field: 'wall_codes_empty',
          message: '壁仕上記号が1つも読み取れていません。記号の無い壁面は石膏ボード張りとして計上するため、'
            + '打放し・GL工法の壁がある場合は数量が過大になっている可能性があります',
          before: null, after: null,
        }];
      }
    }

    // 計算由来の警告（applyElevationTakeoffが result._warnings に積む。例: 木胴縁の部分実測疑い）を
    // AiReading.parsedData._warnings へマージして永続化する
    // （フロントの警告パネルは aiReading の _warnings を参照するため、auxWarnings と同じ導線に乗せる）。
    // /calculate は繰り返し実行されるので、計算由来分は source:'calculate' で識別して前回分を置換する
    // （重複蓄積させない・警告が解消されたら消える）。展開図なしパスでは何も追加しない。
    // lost update対策: 冒頭で読んだ parsedObj を丸ごと書き戻すと、計算中に /aux が書いた
    // 展開図・建具表データを巻き戻すため、書き込み直前に再読取した最新版へ警告だけをマージする
    // （読み→計算→書きの窓を、読み→マージ→書きのms級へ縮小。行ロックなしのため完全排他ではない）
    let latestWarnings = parsedObj?._warnings || []; // レスポンス同梱用（マージ後に差し替え）
    if (parsedObj) {
      const CALC_WARNING_SOURCE = 'calculate';
      const calcWarnings = (result._warnings || []).map((w) => ({ ...w, source: CALC_WARNING_SOURCE }));
      let freshObj = null;
      try {
        const fresh = await prisma.aiReading.findUnique({ where: { id: project.aiReadings[0].id } });
        freshObj = fresh ? JSON.parse(fresh.parsedData) : null;
      } catch (e) {
        // 再読取・パース失敗時は書き戻さない（計算結果の返却は続行。次回calculateで再試行される）
        console.warn('Calc warning persistence skipped:', e?.message);
      }
      if (freshObj) {
        const prevWarnings = freshObj._warnings || [];
        const otherWarnings = prevWarnings.filter((w) => w?.source !== CALC_WARNING_SOURCE);
        const nextWarnings = [...otherWarnings, ...calcWarnings];
        latestWarnings = nextWarnings;
        // 内容が同一なら書き戻しをスキップ（恒常的な計算警告が1件あるだけで毎回
        // parsedData全体のstringify+updateが走るのを防ぐ。マージ順は決定的
        // =[その他, 計算由来]のためJSON文字列比較で同一性判定できる）
        if (JSON.stringify(nextWarnings) !== JSON.stringify(prevWarnings)) {
          freshObj._warnings = nextWarnings;
          await prisma.aiReading.update({
            where: { id: project.aiReadings[0].id },
            data: { parsedData: JSON.stringify(freshObj) },
          });
        }
      }
    }
    // 【一旦】表示は建材リスト（PB・パネル・GW・下地合板）のみに絞る（ユーザー指定 2026-07-10）
    result.materials = filterKenzaiScope(result.materials);
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
      //    ※ ゆるい一致には単位一致も要求（UnitPrice/DefaultUnitPriceともunit列は必須）。
      //      将来木材スコープを表示に開いた際、同名で単位違いの行（例: 際根太のm単価が
      //      材積換算のm³行へ）が誤適用されて金額が桁違いになるのを防ぐ。
      //      単位欠落時は従来動作（マッチ許可）に倒し、既存の¥0→有価の挙動を変えない
      const priceInfo =
        unitPrices.find(p => p.materialName === material.name && p.spec === material.spec) ||
        unitPrices.find(p => p.materialName === material.name && (!p.spec || !material.spec)
          && (!p.unit || !material.unit || p.unit === material.unit));
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
      totalAmount,
      // 最新の警告一覧（AI読取由来+計算由来のマージ済み。フロントが直接使えるよう同梱）
      warnings: latestWarnings
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
      { header: '名称', key: 'name', width: 30 },
      { header: '摘要', key: 'spec', width: 35 },
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
