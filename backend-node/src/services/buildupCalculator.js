/**
 * ボトムアップ拾い出しエンジン（展開図・建具表ベース）
 *
 * プロの拾い出しXLS（部屋×A〜D面×部位で幅×高さを積み上げる方式）を踏襲する。
 * - 壁面積: Σ(面幅×(天井高+40mm)) − 開口面積（建具表の実寸を優先。+40mmはXLSの壁拾い高さ）
 * - 巾木: Σ周長 − 床まで達する開口の幅（種別: 木製/ソフト/樹脂）
 * - 部位振り分け: 平面詳細図の壁仕上記号（例 D14 = 下地D+中間1+表面4）
 *     下地: L/O/W=遮音壁系, G=間仕切, D=RC面木, C=打放, H/I=ウレタン(GL)
 *     中間: 1=PB9.5, 2=耐水PB9.5, 3=ラワンベニヤ, 4=PB9.5GL, 5=耐水PBGL, 6=コンパネ
 *     表面: 4=洋室クロス, 5=和室クロス, 6=キッチンパネル
 *   記号が無い面は「間仕切+PB+クロス」として扱う（安全側）
 *
 * 単位換算はXLS準拠: PB類 1.4㎡/枚（ロス込み）
 */

import {
  TIMBER_SECTIONS, timberVolumeM3, majikiriTimberLengthM, dobuchiLengthM,
} from './timberVolume.js';

const PB_SQM_PER_SHEET = 1.4; // XLS集計表の換算係数（3×6板・ロス込み）

// キッチンパネルの板面積: 3'×8'（910×2420mm）= 0.91×2.42 = 2.2022㎡/枚
// XLS集計表のKP行は枚数2.5/戸を手入力しており換算係数（X列）の行が無い → 実板寸で㎡→枚に換算する
const KP_SHEET_SQM = 2.2022;

// キッチンカウンター天板高（業務標準850mm）。キッチンパネルはカウンター上端から天井まで張る
// → 表面6の面は「面全面」ではなく「カウンター上の帯 = 面幅×(CH−0.85)」で拾う
const KITCHEN_COUNTER_H_M = 0.85;

// 床まで達する開口（巾木・壁下部から引く）とみなす高さ
const FLOOR_OPENING_MIN_HEIGHT_MM = 1800;

// 間仕切下地の立上り高さ = 天井高 + 370mm（床仕上げ面〜上階スラブ下端まで通す）
// XLSタイプ別シートの下地高 2.57/2.77 = CH2200/2400 + 370 を直接確認（G展開図の全高2810と整合:
// 居室 2810−直貼40−2400=370 / 水回り 2810−置床200−仕上40−2200=370）。timberVolume.js参照。
const STUD_PLENUM_M = 0.37;

// 壁ボード類の拾い高さ = 天井高 + 40mm（天井PBへの飲み込み代）
// XLSタイプ別シート（Gタイプ）の壁(ボード)行で直接確認: 玄関・廊下 4.84×2.24（CH2200+40）/
// 洋室 3.64×2.44（CH2400+40）。耐水PBも (0.95+1.925)×2.24=6.44 vs 正解6.4535（差は丸め）で整合。
// 優先規則: face.height_mm が明示されている面は展開図の実測としてそのまま使い、+40mmは乗せない
// （+40mmを適用するのは高さ未指定の面に天井高からデフォルトを立てる場合のみ）。
// ※ 下地高STUD_PLENUM_M(+370=スラブ下端まで)とは別物。巾木（周長ベース）には影響しない。
const WALL_PICKUP_EXTRA_MM = 40;

/**
 * 壁仕上記号のパース。 'D14' -> { base: 'D', mid: 1, surf: 4 }
 * 不正・欠落は null（デフォルト構成で扱う）
 */
// 図面凡例に存在する下地記号のみ有効（AIの誤読 T14 等を弾く）
const VALID_BASE_CODES = 'ZCDGHILSOW';

export function parseWallCode(code) {
  if (typeof code !== 'string') return null;
  const m = code.trim().toUpperCase().match(/^([A-Z])([0-9])([0-9])$/);
  if (!m) return null;
  if (!VALID_BASE_CODES.includes(m[1])) return null;
  return { base: m[1], mid: parseInt(m[2], 10), surf: parseInt(m[3], 10) };
}

// ============================================================
// 開口×建具表マッチング層
// 目的: タイル読取で増えた開口（寸法null多数）に建具表の実寸を補完する
// 優先順位: ①符号の正規化マッチ（確定） > ②type+寸法帯+取付位置の推定マッチ
// 安全側の原則:
//   - 推定マッチは matched_by:'inferred' を付け、符号確定（'symbol'）と区別する
//   - 図面から転記済みの寸法は上書きしない（補完のみ）
//   - 候補が複数あり値が矛盾する寸法は補完しない（null維持=既存のfallback高さで控除）
//   - 窓は推定対象外（住戸・面ごとにサイズ差が大きく誤マッチの害が大）
//   - 玄関ドア・SD系鋼製建具も推定対象外（WD建具表への誤マッチ防止。符号マッチは可）
// ============================================================

// 建具表と図面読取の寸法ズレ許容。幅30mm=折戸803を800と読む等の作図/読取差、
// 高さ15mm=2075と2080を別建具として区別できる幅（WD-8A/WD-2A実在寸法より）
const OPENING_WIDTH_TOL_MM = 30;
const OPENING_HEIGHT_TOL_MM = 15;

/**
 * 建具符号の正規化。'WD-2A' / 'WD2A' / 'wd-2a' / 'ＷＤ－２Ａ' / 長音・全角ハイフン → 'WD2A'
 */
export function normalizeDoorSymbol(sym) {
  if (sym == null) return null;
  const s = String(sym)
    .replace(/[ａ-ｚＡ-Ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toUpperCase()
    .replace(/[\s　]/g, '')
    .replace(/[-‐‑–—―ー−－_]/g, ''); // ハイフン類（全角・長音・ダッシュ）を除去
  return s || null;
}

/**
 * 開口タイプの分類（推定マッチ用）。片開き戸/片引き戸/引違い戸/折戸N/窓 等に正規化
 * 分類できない表記（「開口」等）は null = 推定マッチしない
 */
function openingTypeClass(t) {
  const s = String(t || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!s) return null;
  if (/窓|サッシ|ガラリ|AW/.test(s)) return '窓';
  const fold = s.match(/([0-9]+)\s*枚\s*折/);
  if (fold) return `折戸${fold[1]}`;
  if (s.includes('折戸') || s.includes('折れ戸')) return '折戸';
  if (s.includes('引違')) return '引違い戸';
  if (s.includes('引込')) return '引込み戸';
  if (/両開/.test(s)) return '両開き戸';
  if (/片引|引戸|引き戸/.test(s)) return '片引き戸';
  if (/片開|開き戸|開戸|ドア/.test(s)) return '開き戸';
  return null;
}

/** 「折戸」（枚数不明）と「折戸2」等は互換とみなす */
function classCompatible(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith('折戸') && b.startsWith('折戸') && (a === '折戸' || b === '折戸');
}

/**
 * 建具表から検索構造を作る
 * - bySymbol: 正規化符号 → 建具。同符号が複数ページ等で重複した場合、寸法一致なら1件扱い、
 *   矛盾したら null を立てて符号マッチ不可にする（どちらの寸法か確定できないため安全側）
 * - doors: 全建具（符号なし行も推定マッチの候補に含める）
 */
export function buildDoorLookup(doorSchedule) {
  const bySymbol = new Map();
  const doors = [];
  for (const d of doorSchedule || []) {
    if (!d) continue;
    doors.push(d);
    const key = normalizeDoorSymbol(d.symbol);
    if (!key) continue;
    if (!bySymbol.has(key)) {
      bySymbol.set(key, d);
    } else {
      const prev = bySymbol.get(key);
      if (prev && !(prev.width_mm === d.width_mm && prev.height_mm === d.height_mm)) {
        bySymbol.set(key, null); // 同符号で寸法矛盾 → マッチ失敗として扱う
      }
    }
  }
  return { bySymbol, doors };
}

/**
 * 建具表から開口寸法を補完する
 * @param opening { type?, symbol?, width_mm?, height_mm?, room? }
 * @param doorLookup buildDoorLookup() の戻り値
 * @param roomName 開口が属する部屋名（openingにroomが無い場合の取付位置マッチ用）
 * @returns 補完済みコピー。補完・確定マッチ時は matched_by: 'symbol'|'inferred' が付く
 */
// 推定マッチの対象外とする建具タイプ（確定符号マッチは可）
// 玄関ドア・SD系鋼製建具はWD建具表のみの典型運用で内部ドア（WD-1TA 850×2175等）に
// 誤マッチし、fallback高さ2.0mより悪化する（玄関SD-101A真値は850×1900）ため推定しない
const INFERENCE_EXCLUDE_RE = /玄関|SD|鋼製/;

export function resolveOpening(opening, doorLookup, roomName = null) {
  const resolved = { ...opening };
  delete resolved.matched_by; // 再解決時に古い印を引き継がない
  const lookup = doorLookup || { bySymbol: new Map(), doors: [] };

  // ① 符号の正規化マッチ（確定）
  const key = normalizeDoorSymbol(opening.symbol);
  const hit = key ? lookup.bySymbol.get(key) : undefined;
  if (hit) {
    if (!resolved.width_mm) resolved.width_mm = hit.width_mm;
    if (!resolved.height_mm) resolved.height_mm = hit.height_mm;
    if (!resolved.type) resolved.type = hit.name;
    resolved.matched_by = 'symbol';
    return resolved;
  }

  // ② 推定マッチ（寸法が欠けている開口のみ。窓・玄関/SD/鋼製・分類不能タイプは対象外）
  if (resolved.width_mm && resolved.height_mm) return resolved;
  if (INFERENCE_EXCLUDE_RE.test(String(resolved.type || ''))) return resolved;
  const cls = openingTypeClass(resolved.type);
  if (!cls || cls === '窓' || isWindow(resolved)) return resolved;

  let candidates = lookup.doors.filter((d) => d && classCompatible(openingTypeClass(d.name), cls));
  // 取付位置照合（候補1件でも適用）:
  //   - 対応する候補があればそちらに絞る
  //   - 全候補が取付位置を持ち、どれも開口の部屋と対応しない → 推定しない（安全側）
  //   - 取付位置未記載の候補は対象に残す（建具表のlocation欠落で推定を殺さない）
  const rn = normalizeRoomName(resolved.room || roomName);
  if (rn && candidates.length > 0) {
    const locOf = (d) => normalizeRoomName(d.location);
    const byLoc = candidates.filter((d) => {
      const ln = locOf(d);
      return ln && (ln.includes(rn) || rn.includes(ln));
    });
    if (byLoc.length > 0) candidates = byLoc;
    else if (candidates.every((d) => locOf(d))) candidates = [];
  }
  // 読めている寸法で絞る
  if (resolved.width_mm) {
    candidates = candidates.filter((d) => d.width_mm != null &&
      Math.abs(d.width_mm - resolved.width_mm) <= OPENING_WIDTH_TOL_MM);
  }
  if (resolved.height_mm) {
    candidates = candidates.filter((d) => d.height_mm != null &&
      Math.abs(d.height_mm - resolved.height_mm) <= OPENING_HEIGHT_TOL_MM);
  }
  if (candidates.length === 0) return resolved;

  // 候補間で値が一意な寸法だけ採用（矛盾する寸法は補完しない）
  const uniq = (vals) => {
    const set = new Set(vals.filter((v) => v != null));
    return set.size === 1 ? [...set][0] : null;
  };
  let filled = false;
  if (!resolved.width_mm) {
    const w = uniq(candidates.map((d) => d.width_mm));
    if (w) { resolved.width_mm = w; filled = true; }
  }
  if (!resolved.height_mm) {
    const h = uniq(candidates.map((d) => d.height_mm));
    if (h) { resolved.height_mm = h; filled = true; }
  }
  if (filled) resolved.matched_by = 'inferred';
  return resolved;
}

function isWindow(opening) {
  const t = String(opening.type || '');
  return t === 'window' || t.includes('窓') || t.includes('サッシ') || t.includes('AW');
}

/**
 * 部屋名の表記ゆれ吸収（平面図と展開図の突合用）
 * 空白（全角含む）除去・長音「ー」除去（クローゼット/クロゼット）・括弧と数字の全角→半角
 * ※ (1)等の番号は区別に必要なので除去しない（クロゼット(1)とクロゼット(2)は別部屋）
 */
function normalizeRoomName(name) {
  return String(name || '')
    .replace(/[\s　]/g, '')
    .replace(/ー/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * メイン: 展開図データから部位別数量を積み上げる
 * @param elevations { rooms: [{ name, ceiling_height_mm, skirting, faces: [{ width_mm, height_mm?, wall_code?, openings: [] }] }] }
 * @param doorSchedule [{ symbol, name, width_mm, height_mm }]
 * @param opts { planRooms?: [{ name, area_sqm }], closetInteriors?: [{ room, inner_width_mm }] }
 *   planRooms: 平面図の部屋一覧（展開図に現れない収納内の下地推定に使う）
 *   closetInteriors: 収納内側の下地幅実寸mm（見積明細の家具工事シート等。部屋名でplanRoomsと突合し、
 *     実寸がある収納は3×√面積の推定を実寸で置き換える。タイプ別に入力で与える=ハードコードしない）
 */
export function computeElevationTakeoff(elevations, doorSchedule = [], opts = {}) {
  const rooms = elevations?.rooms || [];
  const doorLookup = buildDoorLookup(doorSchedule);

  const t = {
    // 面積系（㎡）
    wall_pb_sqm: 0,          // 壁PB t9.5（通常間仕切・GL含む）
    waterproof_pb_sqm: 0,    // 耐水PB t9.5
    ev_wall_pb_sqm: 0,       // EV廻り・防露壁面のPB t9.5（D下地×中間1/4。XLSは壁(ボード)と別部位で拾う）
    sound_wall_pb_sqm: 0,    // 遮音壁PB張り t9.5+GW（下地L/O/W）
    gw_sqm: 0,               // グラスウール充填（下地L/S/W）
    sound_sheet_sqm: 0,      // 遮音シート（下地O）
    rawan_veneer_sqm: 0,     // ラワンベニヤ（中間3）
    konpane_sqm: 0,          // コンパネ下地（中間6）
    cloth_sqm: 0,            // 壁クロス（表面4/5）
    kitchen_panel_sqm: 0,    // キッチンパネル（表面6）
    // 延長系（m）
    partition_face_length_m: 0, // 間仕切系下地の面延長（両面計上・参考値）
    // 間仕切下地(木)の拾い量。XLS慣行の"m"表記だが実態は「壁1枚あたり片面の下地面積(㎡)」
    // = Σ(間仕切面幅×下地高(CH+370)−開口) を壁1枚換算(÷2)したもの。timberVolume.js解読メモ参照
    majikiri_shitaji_m: 0,
    rc_furring_sqm: 0,       // RC面木(D下地)の面積 — 木胴縁の材積換算用（D14防露/EV面・D64収納内）
    skirting_m: { 木製: 0, ソフト: 0, 樹脂: 0 },
    // 参考
    opening_area_sqm: 0,
    // 開口×建具表マッチの内訳。symbol=符号確定 / inferred=推定補完 /
    // unresolved=解決後も寸法欠けのままの開口数（符号マッチしたが建具表行に寸法が無い場合も含む）
    opening_match: { symbol: 0, inferred: 0, unresolved: 0 },
    rooms: [],
  };

  // 間仕切下地(木): 部屋間の壁は両部屋の展開図に現れる（ドア開口が両側の面に出ることを実データで確認）
  // ため、面ごとの拾いを合算して最後に÷2し「壁1枚1回」のXLS方式に合わせる。
  // UB隣接面(耐水記号)は反対面がUB内で展開図に現れない → 鏡像分をもう一度足して÷2で相殺する。
  let majikiriDouble = 0; // 両面計上の下地面積（後で÷2）
  let d6FaceWidth = 0;    // D6*（収納内RC面コンパネ）の面幅合計 — 収納推定からの重複控除用

  for (const room of rooms) {
    const ch = (room.ceiling_height_mm || 2400) / 1000;
    const studH = ch + STUD_PLENUM_M; // 下地はスラブまで通す（XLSの下地高2.57/2.77と同義）
    const faces = Array.isArray(room.faces) ? room.faces : [];
    let perimeter = 0;
    let floorOpeningWidth = 0;
    let roomWallNet = 0;

    // 平面詳細図から抽出した部屋の壁記号（plan_codes）。
    // その部屋の記号が1種類だけなら、記号未指定の面のデフォルトとして使う。
    // ただし「PBを張らない/特殊な構成」（C=打放, D6*=コンパネ, Z=ナシ等）を全面に
    // 適用するのは危険（記号の部屋帰属はタイル境界で誤りうる。トイレ全面コンパネ等の
    // 誤分類を実測で確認済み）ため、全面適用は標準的なPB構成のみに限定する。
    const planCodes = Array.isArray(room.plan_codes)
      ? [...new Set(room.plan_codes.map((c) => String(c).toUpperCase()).filter((c) => parseWallCode(c)))]
      : [];
    let roomDefaultCode = null;
    if (planCodes.length === 1) {
      const c = parseWallCode(planCodes[0]);
      // 全面適用は「通常PB（中間1/4）」のみ。耐水（2/5）はUB隣接の特定面にしか
      // 張らないため全面適用しない（トイレ全面耐水などの過大計上を防ぐ。面単位の
      // 割付はplan_placementsの寸法マッチで行う）
      const isStandardPb = c && ['G', 'I', 'H', 'L', 'O', 'W', 'S'].includes(c.base) && [1, 4].includes(c.mid);
      if (isStandardPb) roomDefaultCode = c;
    }

    // 平面図タイル読取の「記号＋壁寸法mm」を面に割り付ける。
    // 展開図のA〜D面の向きは作図者次第でルールが無い（2026-07-14打ち合わせで確認）ため
    // 方角ではなく「平面図の壁寸法 ≒ 展開図の面幅」の数値マッチで面を特定する
    // （AIの転記のみで成立し、長辺/短辺のような幾何判断をさせない）。
    // 面積の計算には「対面のどちらか」までの特定は不要（同じ幅の対面なら面積が同じ）。
    // これでC04（打放・PBなし）等の面がデフォルトPB扱いで過大計上されるのを防ぐ。
    const PLACEMENT_TOL_MM = 80; // 平面図の壁寸法と展開図の面幅の許容差（芯/内法の差を吸収）
    const placementByFace = new Map(); // faceIndex -> parsed code
    if (Array.isArray(room.plan_placements) && faces.length >= 1) {
      const used = new Set();
      // 寸法差が小さい割付から確定させる（曖昧なマッチが確実なマッチの面を奪わないように）
      const cands = [];
      for (const pl of room.plan_placements) {
        const c = parseWallCode(pl?.code);
        const len = pl?.wall_length_mm;
        if (!c || !Number.isFinite(len) || len <= 0) continue;
        for (let i = 0; i < faces.length; i++) {
          const fw = faces[i].width_mm || 0;
          if (fw <= 0 || parseWallCode(faces[i].wall_code)) continue; // 展開図の面記号は実測として優先
          const d = Math.abs(fw - len);
          if (d <= PLACEMENT_TOL_MM) cands.push({ pl, c, i, d });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      const usedPl = new Set();
      for (const cand of cands) {
        if (used.has(cand.i) || usedPl.has(cand.pl)) continue;
        used.add(cand.i);
        usedPl.add(cand.pl);
        placementByFace.set(cand.i, cand.c);
      }
    }

    for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
      const face = faces[faceIdx];
      const w = (face.width_mm || 0) / 1000;
      if (w <= 0) continue;
      // 面の高さ: 展開図の実測(height_mm)があればそのまま、無ければCH+40mm（XLSの壁拾い高さ）
      const h = (face.height_mm ? face.height_mm : (room.ceiling_height_mm || 2400) + WALL_PICKUP_EXTRA_MM) / 1000;
      perimeter += w;

      // 開口控除
      let openingArea = 0;
      let openingAreaStud = 0; // 下地用（下地高=CH+370まで見るので面の仕上げ高でキャップしない）
      for (const raw of face.openings || []) {
        const op = resolveOpening(raw, doorLookup, room.name);
        // マッチ結果の印を元データにも残す（デバッグ・要確認表示用の観測点。寸法は書き戻さない）
        // 再計算でマッチ結果が変わった場合に備え、マッチしなかったら古い印は消す
        if (op.matched_by) raw.matched_by = op.matched_by;
        else delete raw.matched_by;
        if (op.matched_by === 'symbol') t.opening_match.symbol++;
        else if (op.matched_by === 'inferred') t.opening_match.inferred++;
        // 寸法欠けは符号マッチの成否と独立に数える（符号は合ったが建具表行に寸法が無い場合も含む）
        if (!op.width_mm || !op.height_mm) t.opening_match.unresolved++;
        const ow = (op.width_mm || 0) / 1000;
        const oh = (op.height_mm || 0) / 1000;
        if (ow <= 0) continue;
        // 高さ不明の開口: 窓=腰窓標準1.1m / 戸=2.0m。面の高さは超えない
        const fallbackH = isWindow(op) ? 1.1 : 2.0;
        const effH = Math.min(oh > 0 ? oh : fallbackH, h);
        openingArea += ow * effH;
        openingAreaStud += ow * Math.min(oh > 0 ? oh : fallbackH, studH);
        const reachesFloor = !isWindow(op) || (op.height_mm || 0) >= FLOOR_OPENING_MIN_HEIGHT_MM;
        if (reachesFloor) floorOpeningWidth += ow;
      }

      const net = Math.max(0, w * h - openingArea);
      t.opening_area_sqm += openingArea;
      roomWallNet += net;

      // 部位振り分け（面の記号 > 長辺/短辺割付 > 部屋の単一記号 > 間仕切+PB9.5+クロスのデフォルト）
      const code = parseWallCode(face.wall_code) || placementByFace.get(faceIdx)
        || roomDefaultCode || { base: 'G', mid: 1, surf: 4 };

      // 間仕切下地(木)の拾い（XLS方式: G下地のみ。遮音壁L/O/Wは「遮音壁PB張り」の部位で別拾い）
      if (code.base === 'G') {
        majikiriDouble += Math.max(0, w * studH - openingAreaStud);
        // 鏡像加算: 「耐水記号(中間2/5)の面=UB隣接で、反対面はUB内=展開図に現れない」という
        // Gタイプ実測に基づく仮定で、不可視の反対面分を足す（÷2で壁1枚に戻る）。
        // ※ 既知の限界: 両面とも展開図に現れる耐水壁（トイレ−洗面間等）ではこの加算が
        //   壁2枚分の二重計上になる。面の隣接情報が無く反対面の可視判定はできないため、
        //   開口分を鏡像からも控除して過大側を抑える（開口はUB側の面にも同様に無い想定）。
        if (code.mid === 2 || code.mid === 5) {
          majikiriDouble += Math.max(0, w * studH - openingAreaStud);
        }
      }
      // RC面木(D下地)は木胴縁の対象面（D14=防露/EV面、D64=収納内コンパネ）
      if (code.base === 'D') {
        t.rc_furring_sqm += net;
        if (code.mid === 6) d6FaceWidth += w;
      }

      // 下地
      if (['L', 'O', 'W'].includes(code.base)) {
        t.sound_wall_pb_sqm += net;
        t.partition_face_length_m += w;
        if (code.base !== 'O') t.gw_sqm += net;
        if (code.base === 'O') t.sound_sheet_sqm += net;
      } else {
        if (code.base === 'G') t.partition_face_length_m += w;
        if (code.base === 'S') t.gw_sqm += net;
        // 中間材（遮音壁系はPB込みのためelse側のみ）
        switch (code.mid) {
          case 1: case 4:
            // D下地（RC面木=EV廻り・防露壁面。例 D14）のPBはXLSでは「EV廻り壁」の部位で別拾い
            // （プロは玄関のEV側D14面0.965mを壁(ボード)に入れない）。耐水(2/5)・コンパネ(6)は現状どおり
            // ※既知の近似（Gタイプでのみ検証済み 2026-07-16）: 「D下地×中間1/4は全てEV廻り行」は
            //   GのD14がEV側1面だけのため成立している。他タイプで窓廻り防露壁面や収納内のD14が
            //   ある場合もEV行に積まれてしまう（防露壁面/EV面の区別には部屋名や面の位置情報が必要）。
            //   他タイプの正解データで検証する際に部屋名/面情報での分岐を検討すること。
            if (code.base === 'D') t.ev_wall_pb_sqm += net;
            else t.wall_pb_sqm += net;
            break;
          case 2: case 5: t.waterproof_pb_sqm += net; break;
          case 3: t.rawan_veneer_sqm += net; break;
          case 6: t.konpane_sqm += net; break;
          default: break; // 0=ナシ（打放し等）
        }
      }

      // 表面
      if (code.surf === 4 || code.surf === 5) t.cloth_sqm += net;
      else if (code.surf === 6) {
        // キッチンパネル（表面6）は面全面ではなくカウンター上の帯のみ張る。
        // XLSの正解式（'Ａタイプ'!P310〜P313 = 3.925㎡/戸）:
        //   2.5×1.35 + 0.7×2.2 + 0.7×2.2 − 2.2×1.15
        //   = 正面幅×(CH−カウンター高0.85) + 側面袖壁2本×CH − 吊戸裏の控除
        // 図面から機械的に取れるのは「KP面の幅」と「CH」だけなので正面帯のみモデル化し、
        // 側面袖壁(+3.08)と吊戸控除(−2.53)は未モデル（ほぼ相殺する前提の近似）。
        // G実測: 2.575×(2.2−0.85)=3.476 vs XLS 3.925 = −11.4%（eval許容20%内）
        t.kitchen_panel_sqm += Math.max(0, w * Math.max(0, ch - KITCHEN_COUNTER_H_M) - openingArea);
      }
    }

    // 巾木（種別ごと・開口幅を控除）
    const skirtingLen = Math.max(0, perimeter - floorOpeningWidth);
    const sk = String(room.skirting || '');
    if (sk.includes('木製')) t.skirting_m.木製 += skirtingLen;
    else if (sk.includes('ソフト')) t.skirting_m.ソフト += skirtingLen;
    else if (sk.includes('樹脂')) t.skirting_m.樹脂 += skirtingLen;
    // skirting未記載（UB等）は計上しない

    t.rooms.push({
      name: room.name,
      perimeter_m: Math.round(perimeter * 100) / 100,
      wall_net_sqm: Math.round(roomWallNet * 100) / 100,
      ceiling_height_mm: room.ceiling_height_mm || 2400,
    });
  }

  // 収納（WIC/CL等）の内側は展開図に現れないが間仕切下地は必要。
  // 優先順位: ①実寸（opts.closetInteriors。見積明細 家具工事シートの固定棚実寸から
  //   「棚に沿う内側3辺」= コ型W(w1+w2+w3)なら w1+w2+w3 / 単棚W×Dなら W+D×2 に換算した幅mmを入力で受ける）
  //   > ②3×√面積の推定（正方形近似のフォールバック）
  // 部屋側の面は上のループで拾い済み（÷2対象）なので、収納側の面も両面計上の山に足してから÷2する。
  // RC面（D6*で実測済み・胴縁の部位）の幅控除は②推定分のみに適用する。
  // 根拠（拾い出しXLS Ａタイプ(=Gデータ)シート精査 2026-07-16）: 間仕切下地の正解84.082 =
  //   洋室(1)9.7341+洋室(2)17.8474+洋室(3)7.6896+食事室・台所12.1005+便所15.789+洗面20.9214 の
  //   6室ブロック合計と完全一致（玄関・物入(1)〜(3)ブロックの間仕切下地行は空欄）で、
  //   収納内RC面を控除する行は存在しない → 実寸には控除を掛けない
  //   （②推定は面積由来でRC面と重複しうるため控除を維持する）
  const CLOSET_NAME_RE = /クローゼット|クロゼット|WIC|CL|収納|物入|押入/;
  const elevRoomNames = new Set(rooms.map((r) => normalizeRoomName(r.name)).filter(Boolean));
  const interiorByRoom = new Map(); // 正規化部屋名 → 収納内側の下地幅mm（実寸）
  for (const ci of opts.closetInteriors || []) {
    const key = normalizeRoomName(ci?.room);
    if (key && Number.isFinite(ci?.inner_width_mm) && ci.inner_width_mm > 0) {
      interiorByRoom.set(key, ci.inner_width_mm);
    }
  }
  let closetActualWidth = 0; // ①実寸の合計（m）
  let closetEstWidth = 0;    // ②3×√面積推定の合計（m）
  for (const pr of opts.planRooms || []) {
    if (!pr?.name || !CLOSET_NAME_RE.test(pr.name)) continue;
    // 展開図に実測がある収納は二重計上しない（表記ゆれを正規化して比較）
    if (elevRoomNames.has(normalizeRoomName(pr.name))) continue;
    const actualMm = interiorByRoom.get(normalizeRoomName(pr.name));
    if (actualMm) { closetActualWidth += actualMm / 1000; continue; }
    const a = pr.area_sqm || 0;
    if (a > 0) closetEstWidth += 3 * Math.sqrt(a);
  }
  closetEstWidth = Math.max(0, closetEstWidth - d6FaceWidth);
  majikiriDouble += (closetActualWidth + closetEstWidth) * (2.4 + STUD_PLENUM_M);

  // 両面計上 → 壁1枚換算（XLSの拾い方に一致。検証: Gタイプ 77.6 vs XLS正解84.082 = −7.7%）
  t.majikiri_shitaji_m = majikiriDouble / 2;

  // 丸め
  for (const k of Object.keys(t)) {
    if (typeof t[k] === 'number') t[k] = Math.round(t[k] * 100) / 100;
  }
  for (const k of Object.keys(t.skirting_m)) {
    t.skirting_m[k] = Math.round(t.skirting_m[k] * 10) / 10;
  }
  return t;
}

/**
 * 【一旦の表示スコープ】建材リストのみ表示する
 * ユーザー指定（2026-07-10）: 見積明細の「建材」ブロックの項目以外は当面非表示。
 * 精度検証の焦点を建材（PB・パネル・GW・下地合板）に絞るため。
 * このフィルタを外せば全項目（約130）の表示に戻る。
 */
const KENZAI_SCOPE_PATTERNS = [
  '石膏ボード',            // 壁・耐水・天井・下り天井・一部界壁・EV廻り・収納面すべて
  '遮音壁PB',              // 遮音壁PB張り（t9.5+GW）— PB系なので建材スコープに含める
  'キッチンパネル',        // 本体+見切り
  'グラスウール充填',      // 間仕切+EV廻り
  '下地補強合板',
  'エアコン下地補強合板',
];

export function filterKenzaiScope(materials) {
  return materials.filter((m) =>
    m.category === '下地材' && KENZAI_SCOPE_PATTERNS.some((p) => String(m.name).includes(p))
  );
}

/**
 * 計算結果（materialCalculatorの出力）に展開図実測値を反映する
 * 該当する資材行の数量を実測ベースで置き換え、計算根拠に「展開図実測」を記す
 */
export function applyElevationTakeoff(result, takeoff) {
  if (!result?.materials || !takeoff) return result;

  const set = (match, quantity, basis) => {
    for (const m of result.materials) {
      if (match(m) && quantity > 0) {
        m.quantity = quantity;
        m.calculation = `展開図実測: ${basis}`;
        m.takeoff = true;
      }
    }
  };

  const wallPbSheets = Math.ceil(takeoff.wall_pb_sqm / PB_SQM_PER_SHEET);
  const waterPbSheets = Math.ceil(takeoff.waterproof_pb_sqm / PB_SQM_PER_SHEET);

  set((m) => m.name === '壁 石膏ボード',
    wallPbSheets, `壁PB ${takeoff.wall_pb_sqm}㎡ ÷ ${PB_SQM_PER_SHEET}㎡/枚`);
  set((m) => m.name === '壁 耐水石膏ボード',
    waterPbSheets, `耐水PB ${takeoff.waterproof_pb_sqm}㎡ ÷ ${PB_SQM_PER_SHEET}㎡/枚`);
  // EV廻り・防露壁面（D下地×中間1/4）。実測0（EV面が展開図に写らないタイプ）は
  // set()のquantity>0ガードにより既存の実績推定（標準3枚）を維持する
  const evPbSqm = takeoff.ev_wall_pb_sqm || 0;
  set((m) => m.name === 'EV廻り壁 石膏ボード',
    Math.ceil(evPbSqm / PB_SQM_PER_SHEET), `EV面実測 ${evPbSqm}㎡ ÷ ${PB_SQM_PER_SHEET}㎡/枚`);
  set((m) => m.name.includes('遮音壁PB'),
    takeoff.sound_wall_pb_sqm, `遮音壁面 Σ幅×高さ−開口`);
  // キッチンパネル: カウンター上帯の実測㎡（表面6）→ 3'×8'板（2.2022㎡/枚）で枚数化
  // ※ 完全一致（'壁 キッチンパネル見切り' への誤マッチ防止）。実測0はset()のガードで既存推定を維持
  const kpSqm = takeoff.kitchen_panel_sqm || 0;
  const kpSheets = Math.ceil(kpSqm / KP_SHEET_SQM);
  set((m) => m.name === '壁 キッチンパネル',
    kpSheets, `キッチンパネル面 ${kpSqm}㎡ ÷ ${KP_SHEET_SQM}㎡/枚（3'×8' 910×2420mm）`);

  if (result.summary) {
    result.summary.wall_pb_sqm = takeoff.wall_pb_sqm;
    result.summary.wall_pb_sheets = wallPbSheets;
    result.summary.waterproof_pb_sqm = takeoff.waterproof_pb_sqm;
    result.summary.waterproof_pb_sheets = waterPbSheets;
    result.summary.ev_wall_pb_sqm = evPbSqm;
    result.summary.ev_wall_pb_sheets = Math.ceil(evPbSqm / PB_SQM_PER_SHEET);
    result.summary.sound_wall_pb_sqm = takeoff.sound_wall_pb_sqm;
    result.summary.kitchen_panel_sqm = kpSqm;
    result.summary.kp_sheets = kpSheets;
  }
  // ※ 'EV廻り壁 グラスウール充填' への誤マッチを防ぐため完全一致
  set((m) => m.name === '間仕切 グラスウール充填',
    Math.round(takeoff.gw_sqm), `GW充填面 Σ幅×高さ−開口`);
  set((m) => m.name.includes('壁クロス'),
    Math.ceil(takeoff.cloth_sqm), `クロス面 Σ幅×高さ−開口`);
  set((m) => m.name === '木製巾木' || (m.name.includes('巾木') && m.name.includes('木製')),
    Math.round(takeoff.skirting_m.木製), `Σ周長−開口幅（木製巾木の部屋）`);
  set((m) => m.name.includes('樹脂巾木'),
    Math.round(takeoff.skirting_m.樹脂 * 10) / 10, `Σ周長−開口幅（樹脂巾木の部屋）`);

  // 間仕切下地(木): XLSの拾い量（壁1枚あたり片面の下地面積。"m"表記はXLS慣行）を実測で上書き
  set((m) => m.name === '間仕切下地(木)',
    Math.round(takeoff.majikiri_shitaji_m * 10) / 10,
    `間仕切面 Σ幅×下地高(CH+370mm)−開口 の壁1枚換算`);
  // 間仕切木軸の材積: 拾い面積 → 両面×縦横@450の実材長 → 断面45×30で材積化（timberVolume.js）
  const majikiriLen = majikiriTimberLengthM(takeoff.majikiri_shitaji_m);
  set((m) => m.name === '間仕切木軸',
    timberVolumeM3(TIMBER_SECTIONS.majikiri, majikiriLen),
    `間仕切下地 ${Math.round(takeoff.majikiri_shitaji_m * 10) / 10} × 両面縦横@450 = ${Math.round(majikiriLen)}m × 断面45×30`);
  // 木胴縁: RC面木(D下地)の実測面積 → 横胴縁@455の材長 → 材積
  // ※ 界壁・EV面が展開図に現れないタイプでは実測が過少になりうる（Gは界壁C04=胴縁なしで正）
  //   実測が従来推定の50%を切る場合は部分実測の疑いとして _warnings で要確認にする（実測値は採用）
  const dobuchiLen = dobuchiLengthM(takeoff.rc_furring_sqm);
  const dobuchiVol = timberVolumeM3(TIMBER_SECTIONS.dobuchi, dobuchiLen);
  const dobuchiRow = result.materials.find((m) => m.name === '木胴縁（界壁面）');
  if (dobuchiRow && dobuchiVol > 0 && dobuchiRow.quantity > 0 && dobuchiVol < dobuchiRow.quantity * 0.5) {
    result._warnings = result._warnings || [];
    result._warnings.push({
      field: '木胴縁（界壁面）',
      message: `展開図実測の木胴縁材積(${dobuchiVol}m³)が実績ベース推定(${dobuchiRow.quantity}m³)の50%未満です。`
        + '界壁・EV廻りのRC面が展開図に写っていない可能性があります（実測値を採用済み・要確認）',
      before: dobuchiRow.quantity,
      after: dobuchiVol,
    });
  }
  set((m) => m.name === '木胴縁（界壁面）', dobuchiVol,
    `RC面木 ${takeoff.rc_furring_sqm}㎡ × 横胴縁@455 = ${Math.round(dobuchiLen)}m × 断面45×30`);

  // サマリーにも反映
  if (result.summary) {
    result.summary.wall_cloth_area = takeoff.cloth_sqm;
    result.summary.takeoff_applied = true;
  }
  return result;
}
