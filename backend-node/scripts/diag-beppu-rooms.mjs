/**
 * 別府A〜D 壁PB/遮音PB残差の部屋単位分解 診断スクリプト（判定なし・情報表示のみ）
 *
 * 【目的】beppu-room-truth.json（タイプ別シートの部屋×面×部位正解・eval-beppu-rooms.mjsで
 *   1845項目検証済み）を使い、別府の壁PB残差（A+31%/B+75%/C-15%/D±0%）・遮音PB残差
 *   （A-26%/B+101%/C+36%/D+33%）が**どの部屋のどの機構**（AI欠落/AI過大/フィルタ棄却）から
 *   来ているかを分解する。アルファGで効いた「部屋ブロック突合」の別府初適用。
 *
 * 【診断であって答え合わせではない】このスクリプトはexitコード常に0・閾値判定なし。
 *   結果を見て次の修正方針を決めるための一次資料（不都合な結果もそのまま出す）。
 *
 * 【手法】
 *   1. 面幅突合: AI展開図の面幅(width_mm) / 平面タイルのセグメント長(plan_placements) を
 *      正解の壁セグメント幅w（壁ボード/遮音壁PB/耐水/界壁/防露/不燃の各ブロック・h>=2.0mの面）と
 *      部屋名対応表で突合（±80mm=エンジンのPLACEMENT_TOL_MMと同値）。
 *   2. 部屋別寄与: **leave-one-out差分法** = 全室のcomputeElevationTakeoffから部屋iを除いた
 *      再計算を引き算。グローバルフィルタ（面ラベル混同N>=3・面数上限6/戸）との相互作用を含む
 *      「その部屋が実際に総量へ効かせている量」になる（Σ部屋差分≠総量になりうる→残差行で明示）。
 *   3. 遮/G枠検出の分類: エンジンのプレパス（buildupCalculator.js 1157-1208 soundFaceCap /
 *      1086-1112 faceLabelConfusion / NON_PARTY_WALL_ROOM_RE 136-137）をミラー実装し
 *      検出単位ごとに kept/nonparty/face_label/face_cap を付与。**ミラーの正しさは
 *      takeoffの実カウンタ（beppu_sound_*_dropped）との一致で自己検算**（ズレたら⚠表示）。
 *
 * 実行: node scripts/diag-beppu-rooms.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeElevationTakeoff, parseWallCode, normalizeRoomName,
  collapseDoubledPlacements, resolveStudHeightM,
} from '../src/services/buildupCalculator.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const roomTruth = JSON.parse(fs.readFileSync(path.join(HERE, 'beppu-room-truth.json'), 'utf8'));
const aggTruth = JSON.parse(fs.readFileSync(path.join(HERE, 'beppu-9types-ground-truth.json'), 'utf8'));

// replay-beppu.mjs と同一のtakeoffオプション（別府物件プロファイル）
const TAKEOFF_OPTS_BASE = {
  studHeight: { default_mm: 2720, wet_mm: 2820 },
  soundWallRule: { pairs: [] },
};

const TOL_MM = 80; // エンジンPLACEMENT_TOL_MMと同値

// ============================================================
// ミラー定数（buildupCalculator.js非export定数の複製・診断専用）
// 出典行: NON_PARTY_WALL_ROOM_RE=136-137 / UB_ROOM_NAME_RE=115 /
//         FACE_LABEL_CONFUSION_MIN_ROOMS=1086 / SOUND_FACE_CAP_*=1157-1158
// ミラーの陳腐化は下の自己検算（実カウンタ突合）で検出される
// ============================================================
const NON_PARTY_RE = /バルコニ|ベランダ|倉庫|パントリ|クロゼット|SCL|WCL|WIC|(?:^|[^A-Za-z])CL(?![A-Za-z])|押入|物入|トイレ|便所|洗面|パウダ|(?:^|[^A-Za-z])UB(?![A-Za-z])|浴/i;
const UB_RE = /^(UB|ユニットバス|浴室)$/;
// 別府スコープ整合2件（2026-07-26）のミラー: 収納室=部屋ごと除外（isBeppuLayout時） /
// 水回りの遮/G枠=遮音壁耐水PBバケットへ振替（出典: BEPPU_CLOSET_SCOPE_ROOM_RE / SOUND_WET_ROOM_RE）
const CLOSET_RE = /パントリ|クロゼット|SCL|WCL|WIC|(?:^|[^A-Za-z])CL(?![A-Za-z])|押入|物入/i;
const WET_RE = /トイレ|便所|洗面|パウダ|(?:^|[^A-Za-z])UB(?![A-Za-z])|浴/i;
const CONFUSION_MIN_ROOMS = 3;
const CAP_PER_ROOM = 2;
const CAP_PER_DWELLING = 6;

// AI読み部屋名（正規化後）→ 正解JSONの部屋名 の対応表（実データ突合で作成）。
// 正解シートは全タイプ同一の部屋ラベル（玄関/和室/洋室(1)(2)(3)/台所/便所/洗面所/押入/物入(1)。
// 和室・押入・物入はテンプレート行で全ブロック空）。LDK→台所はXLSの台所ブロックが
// LDK全体の壁を拾っているため（アルファと同じ「台所ブロック=LDK系壁」の流儀）。
const ROOM_MAP = new Map(Object.entries({
  '玄関': '玄関', '玄関・廊下': '玄関', '玄関廊下': '玄関', '廊下': '玄関',
  'LDK': '台所',
  '洋室1': '洋室(１)', '洋室(1)': '洋室(１)',
  '洋室2': '洋室(2)', '洋室(2)': '洋室(2)',
  '洋室3': '洋室(3)', '洋室(3)': '洋室(3)',
  '洗面': '洗面所', '洗面室': '洗面所', '洗面所': '洗面所',
  'トイレ': '便所', '便所': '便所',
  // 収納系（正解シートに壁PB/遮音の部屋ブロックなし → 対応なしとして扱う）
  'WCL': null, 'SCL': null, 'WIC': null, 'パントリ': null, '押入': '押入', '物入(1)': '物入(1)',
}));
const mapElevToTruth = (elevName) => {
  const n = normalizeRoomName(elevName);
  if (ROOM_MAP.has(n)) return ROOM_MAP.get(n);
  return undefined; // 対応表に無い（未知の部屋名）
};

// 正解の「壁面」ブロック分類（面幅突合・部屋別小計の対象）
const partClass = (b) => {
  const p = String(b.part || '').replace(/[\s　]/g, '');
  const spec = String(b.spec || '');
  if (/^遮音壁ＰＢ張り/.test(p)) return 'sound';        // 遮音壁PB張り（エンジンsound_wall_pb対応）
  if (/^遮音壁耐水/.test(p)) return 'soundWet';         // 遮音壁耐水PB（エンジン未実装部位）
  if (/^壁（(ボ|ﾎﾞ)/.test(p)) return /耐水/.test(spec) ? 'wallWet' : 'wall'; // 壁（ボード）
  if (/^部分界壁/.test(p)) return 'kaibe';
  if (/^防露ふかし壁/.test(p)) return 'boro';
  if (/^壁（不燃材）/.test(p)) return 'funen';
  return null;
};

// 正解ブロックから壁セグメント（面幅w・高さh>=2.0の加算面）を収集
const truthWallSegments = (room) => {
  const segs = [];
  for (const b of room.blocks || []) {
    const cls = partClass(b);
    if (!cls || b.kind !== 'faces') continue;
    for (const label of ['A', 'B', 'C', 'D']) {
      for (const f of b.faces?.[label] || []) {
        if (f.ded) continue;
        if (!(f.h >= 2.0)) continue; // 巾木・見切等の低い拾いを除外
        segs.push({ label, w_mm: Math.round(f.w * 1000), h: f.h, cls, part: b.part });
      }
    }
  }
  return segs;
};

const truthRoomSubtotal = (room, clsSet) => {
  let s = 0;
  for (const b of room.blocks || []) {
    const cls = partClass(b);
    if (cls && clsSet.includes(cls)) s += b.subtotal_P;
  }
  return s;
};

// ============================================================
// 遮/G枠検出の列挙+フィルタ分類（エンジンプレパスのミラー）
// ============================================================
function classifySoundDetections(rooms, opts) {
  const units = []; // {roomIdx, room, kind:'seg'|'face', code, len_m, status}
  // (1) 全検出の列挙（nonparty/UBも含めて生を全部見る＝「AIが読んだか」の一次資料）
  rooms.forEach((room, roomIdx) => {
    const rn = normalizeRoomName(room.name);
    const isUB = UB_RE.test(rn);
    const isCloset = CLOSET_RE.test(rn); // ①部屋ごと除外（別府記録=isBeppuLayout前提）
    const isWet = WET_RE.test(rn);       // ②耐水振替
    const isNonParty = NON_PARTY_RE.test(rn);
    const faces = Array.isArray(room.faces) ? room.faces : [];
    if (Array.isArray(room.plan_placements) && faces.length >= 1) {
      collapseDoubledPlacements(room.plan_placements).forEach((pl, plIdx) => {
        const c = parseWallCode(pl?.code);
        const len = pl?.wall_length_mm;
        if (!c || !Number.isFinite(len) || len <= 0) return;
        if (!(c.beppu === '遮' || c.beppu === 'G枠')) return;
        units.push({
          roomIdx, room, kind: 'seg', plIdx, code: c.beppu, len_m: len / 1000,
          status: isUB ? 'UB室スキップ' : isCloset ? 'closet除外'
            : isWet ? '耐水振替' : isNonParty ? 'nonparty棄却' : 'pool',
        });
      });
    }
    faces.forEach((face, faceIdx) => {
      const c = parseWallCode(face?.wall_code);
      if (!c || !(c.beppu === '遮' || c.beppu === 'G枠')) return;
      units.push({
        roomIdx, room, kind: 'face', faceIdx, faceLabel: face?.face || null,
        code: c.beppu, len_m: (face.width_mm || 0) / 1000,
        status: isUB ? 'UB室スキップ' : isCloset ? 'closet除外'
          : !((face.width_mm || 0) > 0) ? '幅0不計上'
          : isWet ? '耐水振替' : isNonParty ? 'nonparty棄却' : 'pool',
      });
    });
  });

  // (2) 面ラベル混同集合（エンジン1086-1112ミラー: 居室・動線のみ・1室内dedup・N>=3）
  const labelCounts = new Map();
  rooms.forEach((room) => {
    const rn = normalizeRoomName(room.name);
    if (UB_RE.test(rn) || NON_PARTY_RE.test(rn)) return;
    const seen = new Set();
    for (const face of (Array.isArray(room.faces) ? room.faces : [])) {
      const label = face?.face;
      if (!label) continue;
      const c = parseWallCode(face.wall_code);
      if (!c || !(c.beppu === '遮' || c.beppu === 'G枠')) continue;
      const key = `${String(label).trim().toUpperCase()}|${c.beppu}`;
      if (seen.has(key)) continue;
      seen.add(key);
      labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
    }
  });
  const confusionSet = new Set([...labelCounts].filter(([, n]) => n >= CONFUSION_MIN_ROOMS).map(([k]) => k));
  for (const u of units) {
    if (u.status !== 'pool' || u.kind !== 'face') continue;
    if (u.faceLabel && confusionSet.has(`${String(u.faceLabel).trim().toUpperCase()}|${u.code}`)) {
      u.status = 'face_label棄却';
    }
  }

  // (3) 面数上限（エンジン1157-1208ミラー: pool残から寄与降順・部屋2/住戸6）
  const pool = units.filter((u) => u.status === 'pool')
    .map((u, i) => ({ u, i }))
    .sort((a, b) => (b.u.len_m - a.u.len_m) || (a.i - b.i));
  const perRoom = new Map();
  for (const { u } of pool) {
    const n = perRoom.get(u.roomIdx) || 0;
    if (n >= CAP_PER_ROOM) { u.status = 'face_cap棄却(部屋2)'; continue; }
    perRoom.set(u.roomIdx, n + 1);
  }
  let kept = 0;
  for (const { u } of pool) {
    if (u.status !== 'pool') continue;
    if (kept >= CAP_PER_DWELLING) { u.status = 'face_cap棄却(住戸6)'; continue; }
    kept++;
    u.status = '採用';
  }
  // 採用単位の計上量（エンジン: seg=len×studH / face=面幅×studH−開口。開口控除は近似省略→表示に注記）
  for (const u of units) {
    if (u.status === '採用') {
      u.sqm = u.len_m * resolveStudHeightM(u.room, opts, null);
    }
  }
  return { units, confusionSet };
}

// ============================================================
// メイン
// ============================================================
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const pct = (got, exp) => (exp > 0 && Number.isFinite(got) ? `${got >= exp ? '+' : ''}${((got / exp - 1) * 100).toFixed(0)}%` : '-');
const isWideCp = (cp) => (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x3000 && cp <= 0x303f);
const padD = (s, w) => { const str = String(s); const dw = [...str].reduce((a, ch) => a + (isWideCp(ch.codePointAt(0)) ? 2 : 1), 0); return str + ' '.repeat(Math.max(0, w - dw)); };

console.log('=== 別府A〜D 壁PB/遮音PB残差の部屋単位分解（診断・判定なし） ===');
console.log('正解: beppu-room-truth.json（部屋×面×部位・XLSタイプ別シート） / AI読み: recordings/beppu-{a..d}-gemini-read-*.json');
console.log('エンジン寄与: leave-one-out差分法（全室takeoff − 部屋i除外takeoff。グローバルフィルタ相互作用込み）\n');

for (const T of ['A', 'B', 'C', 'D']) {
  const rec = JSON.parse(fs.readFileSync(
    path.join(HERE, 'recordings', `beppu-${T.toLowerCase()}-gemini-read-gemini-2.5-flash.json`), 'utf8'));
  const truthRooms = roomTruth.types[T].rooms;
  const truthByName = new Map(truthRooms.map((r) => [r.name, r]));
  const opts = {
    ...TAKEOFF_OPTS_BASE,
    planRooms: rec.rooms || [],
    closetInteriors: rec.closet_interiors || [],
  };
  const elevRooms = rec.elevations.rooms;

  // ベースライン+leave-one-out
  const base = computeElevationTakeoff(rec.elevations, rec.door_schedule || [], opts);
  const loo = elevRooms.map((_, i) => {
    const sub = { ...rec.elevations, rooms: elevRooms.filter((__, j) => j !== i) };
    const tk = computeElevationTakeoff(sub, rec.door_schedule || [], opts);
    return {
      wall: base.wall_pb_sqm - tk.wall_pb_sqm,
      sound: base.sound_wall_pb_sqm - tk.sound_wall_pb_sqm,
      wet: base.waterproof_pb_sqm - tk.waterproof_pb_sqm,
    };
  });

  const aggParts = aggTruth.types[T]?.parts || {};
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`【${T}タイプ】専有${rec.total_floor_area_sqm}㎡ / 展開図${elevRooms.length}室 / `
    + `平面${(rec.rooms || []).length}室`);
  console.log(`  エンジン総量: 壁PB ${fmt(base.wall_pb_sqm)}㎡（正解${fmt(aggParts['壁PB']?.area_or_length)}㎡ ${pct(base.wall_pb_sqm, aggParts['壁PB']?.area_or_length)}）`
    + ` / 遮音PB ${fmt(base.sound_wall_pb_sqm)}㎡（正解${fmt(aggParts['遮音壁PB']?.area_or_length)}㎡ ${pct(base.sound_wall_pb_sqm, aggParts['遮音壁PB']?.area_or_length)}）`
    + ` / 耐水 ${fmt(base.waterproof_pb_sqm)}㎡`);

  // ── 1. 面幅突合 ────────────────────────────────────────────
  console.log('\n── 1. 面幅突合（正解セグメント幅 vs AI展開図面幅/平面タイルセグメント・±80mm） ──');
  const elevByTruthName = new Map(); // truth室名 -> [elev room…]（玄関+廊下の合流に対応）
  for (const er of elevRooms) {
    const tn = mapElevToTruth(er.name);
    if (tn === undefined) console.log(`  ⚠ 対応表に無いAI部屋名: 「${er.name}」（突合対象外）`);
    if (!tn) continue;
    if (!elevByTruthName.has(tn)) elevByTruthName.set(tn, []);
    elevByTruthName.get(tn).push(er);
  }
  for (const tr of truthRooms) {
    const segs = truthWallSegments(tr);
    if (segs.length === 0) continue; // 和室・押入等のテンプレート空ブロック
    const ers = elevByTruthName.get(tr.name) || [];
    const aiFaces = ers.flatMap((er) => (er.faces || [])
      .filter((f) => (f.width_mm || 0) > 0)
      .map((f) => ({ label: f.face || '?', w: f.width_mm, code: f.wall_code || '' })));
    const aiPlacements = ers.flatMap((er) => collapseDoubledPlacements(er.plan_placements || [])
      .filter((p) => Number.isFinite(p?.wall_length_mm) && p.wall_length_mm > 0)
      .map((p) => ({ code: p.code, w: p.wall_length_mm })));
    if (ers.length === 0) {
      console.log(`  ▼ ${tr.name} — ⚠AI展開図に対応部屋なし（欠落）: 正解壁 `
        + segs.map((s) => `${s.label}${s.w_mm}(${s.cls})`).join(' '));
      continue;
    }
    const usedFace = new Set();
    const usedPl = new Set();
    let matched = 0; let plOnly = 0; const missing = [];
    for (const s of segs) {
      // ①AI面幅（未使用）±80 ②平面セグメント長±80 ③どちらも無ければ欠落
      let hit = aiFaces.findIndex((f, i) => !usedFace.has(i) && Math.abs(f.w - s.w_mm) <= TOL_MM);
      if (hit >= 0) { usedFace.add(hit); matched++; continue; }
      hit = aiPlacements.findIndex((p, i) => !usedPl.has(i) && Math.abs(p.w - s.w_mm) <= TOL_MM);
      if (hit >= 0) { usedPl.add(hit); plOnly++; continue; }
      missing.push(s);
    }
    const extraFaces = aiFaces.filter((_, i) => !usedFace.has(i));
    console.log(`  ▼ ${tr.name}（AI:${ers.map((e) => e.name).join('+')}） 正解${segs.length}セグ`
      + ` → 面幅一致${matched} / 平面ｾｸﾞのみ一致${plOnly} / 欠落${missing.length}`);
    console.log(`     正解幅: ${segs.map((s) => `${s.label}${s.w_mm}${s.cls === 'sound' ? '遮' : s.cls === 'soundWet' ? '遮耐' : s.cls === 'wallWet' ? '耐' : s.cls === 'wall' ? '' : '(' + s.cls + ')'}`).join(' ')}`);
    console.log(`     AI面幅: ${aiFaces.map((f) => `${f.label}${f.w}${f.code ? '[' + f.code + ']' : ''}`).join(' ') || 'なし'}`);
    if (aiPlacements.length) console.log(`     AI平面ｾｸﾞ: ${aiPlacements.map((p) => `${p.code}@${p.w}`).join(' ')}`);
    if (missing.length) console.log(`     ⚠欠落（AIに±80mm対応なし）: ${missing.map((s) => `${s.label}${s.w_mm}(${s.part.replace(/[\s　]/g, '')})`).join(' ')}`);
    if (extraFaces.length) console.log(`     AI過大/合算疑い（正解に対応なし）: ${extraFaces.map((f) => `${f.label}${f.w}`).join(' ')}`);
  }

  // ── 2. 壁PB（ボード）の部屋別 ──────────────────────────────
  console.log('\n── 2. 壁PB（通常ボード㎡）の部屋別: 正解 vs エンジンLOO寄与 ──');
  console.log('  ' + padD('部屋(正解名)', 16) + padD('正解㎡', 9) + padD('エンジン㎡', 11) + padD('差㎡', 9) + '備考');
  const wallRows = [];
  const looByTruth = new Map(); // truth名 -> {wall, sound, wet, elevNames[]}
  elevRooms.forEach((er, i) => {
    const tn = mapElevToTruth(er.name) ?? `?${er.name}`;
    const cur = looByTruth.get(tn) || { wall: 0, sound: 0, wet: 0, elevNames: [] };
    cur.wall += loo[i].wall; cur.sound += loo[i].sound; cur.wet += loo[i].wet;
    cur.elevNames.push(er.name);
    looByTruth.set(tn, cur);
  });
  const seenTruth = new Set();
  for (const tr of truthRooms) {
    const truthWall = truthRoomSubtotal(tr, ['wall']);
    const eng = looByTruth.get(tr.name);
    seenTruth.add(tr.name);
    if (truthWall === 0 && !eng) continue;
    const engWall = eng ? eng.wall : NaN;
    const note = !eng ? '⚠AI展開図に部屋なし'
      : (truthRoomSubtotal(tr, ['wallWet']) > 0 ? `(別途 正解耐水${fmt(truthRoomSubtotal(tr, ['wallWet']))}㎡/ｴﾝｼﾞﾝ耐水${fmt(eng.wet)}㎡)` : '');
    wallRows.push({ name: tr.name, truth: truthWall, eng: engWall, diff: (engWall || 0) - truthWall });
    console.log('  ' + padD(tr.name, 16) + padD(fmt(truthWall), 9) + padD(fmt(engWall), 11)
      + padD(fmt((Number.isFinite(engWall) ? engWall : 0) - truthWall), 9) + note);
  }
  for (const [tn, eng] of looByTruth) {
    if (seenTruth.has(tn)) continue;
    wallRows.push({ name: `${tn}(正解ブロックなし)`, truth: 0, eng: eng.wall, diff: eng.wall });
    console.log('  ' + padD(String(tn) + '※', 16) + padD('0(なし)', 9) + padD(fmt(eng.wall), 11)
      + padD(fmt(eng.wall), 9) + `※正解に部屋ブロックなし（AI:${eng.elevNames.join('+')}）`);
  }
  const truthWallTotal = truthRooms.reduce((s, r) => s + truthRoomSubtotal(r, ['wall']), 0);
  const looWallSum = [...looByTruth.values()].reduce((s, e) => s + e.wall, 0);
  console.log('  ' + padD('合計', 16) + padD(fmt(truthWallTotal), 9) + padD(fmt(base.wall_pb_sqm), 11)
    + padD(fmt(base.wall_pb_sqm - truthWallTotal), 9)
    + `(ΣLOO=${fmt(looWallSum)}㎡・総量との差${fmt(base.wall_pb_sqm - looWallSum)}㎡=フィルタ相互作用)`);

  // ── 3. 遮音壁PBの部屋別+検出機構 ──────────────────────────
  console.log('\n── 3. 遮音壁PB（㎡）の部屋別: 正解 vs エンジンLOO寄与 / 遮・G枠検出の分類 ──');
  const { units } = classifySoundDetections(elevRooms, opts);
  // 自己検算: ミラー分類の棄却数 vs takeoff実カウンタ
  const cnt = (st) => units.filter((u) => u.status.startsWith(st)).length;
  const mirrorNonparty = cnt('nonparty');
  const mirrorFaceLabel = cnt('face_label');
  const mirrorCap = units.filter((u) => u.status.startsWith('face_cap')).length;
  const mirrorWet = cnt('耐水振替');
  const selfCheckOk = mirrorNonparty === base.beppu_sound_nonparty_dropped
    && mirrorFaceLabel === base.beppu_sound_face_label_dropped
    && mirrorCap === base.beppu_sound_face_cap_dropped
    && mirrorWet === base.beppu_sound_wet_rerouted;
  console.log(`  検出計${units.length}件 / ミラー分類: nonparty=${mirrorNonparty} face_label=${mirrorFaceLabel} face_cap=${mirrorCap} 耐水振替=${mirrorWet}`
    + ` / takeoff実カウンタ: ${base.beppu_sound_nonparty_dropped}/${base.beppu_sound_face_label_dropped}/${base.beppu_sound_face_cap_dropped}/${base.beppu_sound_wet_rerouted}`
    + (selfCheckOk ? ' ✅一致' : ' ⚠不一致（ミラー陳腐化の疑い・分類表示は参考値）'));
  console.log('  ' + padD('部屋(正解名)', 16) + padD('正解㎡', 9) + padD('エンジン㎡', 11) + padD('差㎡', 9) + '検出内訳（遮/G枠）');
  const soundRows = [];
  const unitsByRoomIdx = new Map();
  units.forEach((u) => {
    if (!unitsByRoomIdx.has(u.roomIdx)) unitsByRoomIdx.set(u.roomIdx, []);
    unitsByRoomIdx.get(u.roomIdx).push(u);
  });
  const detStrByTruth = new Map();
  elevRooms.forEach((er, i) => {
    const tn = mapElevToTruth(er.name) ?? `?${er.name}`;
    const us = unitsByRoomIdx.get(i) || [];
    if (us.length === 0) return;
    const s = us.map((u) => `${u.code}${u.kind === 'seg' ? '@' : `[${u.faceLabel}面]`}${Math.round(u.len_m * 1000)}${u.status === '採用' ? '✓' : `✗${u.status}`}`).join(' ');
    detStrByTruth.set(tn, (detStrByTruth.get(tn) ? detStrByTruth.get(tn) + ' ' : '') + s);
  });
  const seenTruth2 = new Set();
  for (const tr of truthRooms) {
    const truthSound = truthRoomSubtotal(tr, ['sound']);
    const eng = looByTruth.get(tr.name);
    seenTruth2.add(tr.name);
    if (truthSound === 0 && !(eng && Math.abs(eng.sound) > 0.005) && !detStrByTruth.has(tr.name)) continue;
    const engSound = eng ? eng.sound : NaN;
    const det = detStrByTruth.get(tr.name)
      || (eng ? '（遮/G枠の検出なし=AI未読）' : '⚠AI展開図に部屋なし');
    soundRows.push({ name: tr.name, truth: truthSound, eng: Number.isFinite(engSound) ? engSound : 0, diff: (Number.isFinite(engSound) ? engSound : 0) - truthSound });
    console.log('  ' + padD(tr.name, 16) + padD(fmt(truthSound), 9) + padD(fmt(engSound), 11)
      + padD(fmt((Number.isFinite(engSound) ? engSound : 0) - truthSound), 9) + det);
  }
  for (const [tn, eng] of looByTruth) {
    if (seenTruth2.has(tn)) continue;
    if (Math.abs(eng.sound) < 0.005 && !detStrByTruth.has(tn)) continue;
    soundRows.push({ name: `${tn}(正解ブロックなし)`, truth: 0, eng: eng.sound, diff: eng.sound });
    console.log('  ' + padD(String(tn) + '※', 16) + padD('0(なし)', 9) + padD(fmt(eng.sound), 11)
      + padD(fmt(eng.sound), 9) + (detStrByTruth.get(tn) || '') + ' ※正解に部屋ブロックなし');
  }
  const truthSoundTotal = truthRooms.reduce((s, r) => s + truthRoomSubtotal(r, ['sound']), 0);
  const looSoundSum = [...looByTruth.values()].reduce((s, e) => s + e.sound, 0);
  console.log('  ' + padD('合計', 16) + padD(fmt(truthSoundTotal), 9) + padD(fmt(base.sound_wall_pb_sqm), 11)
    + padD(fmt(base.sound_wall_pb_sqm - truthSoundTotal), 9)
    + `(ΣLOO=${fmt(looSoundSum)}㎡・フィルタ相互作用差${fmt(base.sound_wall_pb_sqm - looSoundSum)}㎡)`);
  const truthSoundWetTotal = truthRooms.reduce((s, r) => s + truthRoomSubtotal(r, ['soundWet']), 0);
  console.log(`  遮音壁耐水PB（②振替バケット・表示スコープ外）: エンジン${fmt(base.sound_wall_waterproof_pb_sqm)}㎡`
    + ` vs 正解${fmt(truthSoundWetTotal)}㎡ (${pct(base.sound_wall_waterproof_pb_sqm, truthSoundWetTotal)})`
    + ` — 振替${base.beppu_sound_wet_rerouted}件・過少はAIの水回り検出限界（受容）`);
  console.log(`  収納室スコープ除外（①）: ${base.beppu_closet_rooms_excluded}室（XLSに部屋ブロックなし=何も拾わない）`);

  // ── 4. 残差の主因TOP3 ─────────────────────────────────────
  const top3 = (rows) => rows.filter((r) => Number.isFinite(r.diff))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 3)
    .map((r) => `${r.name} ${r.diff >= 0 ? '+' : ''}${fmt(r.diff)}㎡`).join(' / ');
  console.log(`\n  ★壁PB残差の主因TOP3: ${top3(wallRows) || 'なし'}`);
  console.log(`  ★遮音PB残差の主因TOP3: ${top3(soundRows) || 'なし'}`);
  console.log();
}

console.log('（診断専用スクリプト・判定なし・exit 0）');
process.exit(0);
