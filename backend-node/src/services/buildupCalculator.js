/**
 * ボトムアップ拾い出しエンジン（展開図・建具表ベース）
 *
 * プロの拾い出しXLS（部屋×A〜D面×部位で幅×高さを積み上げる方式）を踏襲する。
 * - 壁面積: Σ(面幅×天井高) − 開口面積（建具表の実寸を優先）
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

// 床まで達する開口（巾木・壁下部から引く）とみなす高さ
const FLOOR_OPENING_MIN_HEIGHT_MM = 1800;

// 間仕切下地の立上り高さ = 天井高 + 370mm（床仕上げ面〜上階スラブ下端まで通す）
// XLSタイプ別シートの下地高 2.57/2.77 = CH2200/2400 + 370 を直接確認（G展開図の全高2810と整合:
// 居室 2810−直貼40−2400=370 / 水回り 2810−置床200−仕上40−2200=370）。timberVolume.js参照。
const STUD_PLENUM_M = 0.37;

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

/**
 * 建具表から開口寸法を補完する
 * openingにwidth/heightが無く、symbolがある場合に建具表の実寸を使う
 */
function resolveOpening(opening, doorIndex) {
  const resolved = { ...opening };
  if (opening.symbol && doorIndex.has(String(opening.symbol).toUpperCase())) {
    const d = doorIndex.get(String(opening.symbol).toUpperCase());
    if (!resolved.width_mm) resolved.width_mm = d.width_mm;
    if (!resolved.height_mm) resolved.height_mm = d.height_mm;
    if (!resolved.type) resolved.type = d.name;
  }
  return resolved;
}

function isWindow(opening) {
  const t = String(opening.type || '');
  return t === 'window' || t.includes('窓') || t.includes('サッシ') || t.includes('AW');
}

/**
 * メイン: 展開図データから部位別数量を積み上げる
 * @param elevations { rooms: [{ name, ceiling_height_mm, skirting, faces: [{ width_mm, height_mm?, wall_code?, openings: [] }] }] }
 * @param doorSchedule [{ symbol, name, width_mm, height_mm }]
 * @param opts { planRooms?: [{ name, area_sqm }] } 平面図の部屋一覧（展開図に現れない収納内の下地推定に使う）
 */
export function computeElevationTakeoff(elevations, doorSchedule = [], opts = {}) {
  const rooms = elevations?.rooms || [];
  const doorIndex = new Map(
    (doorSchedule || [])
      .filter((d) => d.symbol)
      .map((d) => [String(d.symbol).toUpperCase(), d])
  );

  const t = {
    // 面積系（㎡）
    wall_pb_sqm: 0,          // 壁PB t9.5（通常間仕切・GL含む）
    waterproof_pb_sqm: 0,    // 耐水PB t9.5
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
      const isStandardPb = c && ['G', 'I', 'H', 'L', 'O', 'W', 'S'].includes(c.base) && [1, 2, 4, 5].includes(c.mid);
      if (isStandardPb) roomDefaultCode = c;
    }

    for (const face of faces) {
      const w = (face.width_mm || 0) / 1000;
      if (w <= 0) continue;
      const h = (face.height_mm ? face.height_mm : room.ceiling_height_mm || 2400) / 1000;
      perimeter += w;

      // 開口控除
      let openingArea = 0;
      let openingAreaStud = 0; // 下地用（下地高=CH+370まで見るので面の仕上げ高でキャップしない）
      for (const raw of face.openings || []) {
        const op = resolveOpening(raw, doorIndex);
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

      // 部位振り分け（面の記号 > 部屋の単一記号 > 間仕切+PB9.5+クロスのデフォルト）
      const code = parseWallCode(face.wall_code) || roomDefaultCode || { base: 'G', mid: 1, surf: 4 };

      // 間仕切下地(木)の拾い（XLS方式: G下地のみ。遮音壁L/O/Wは「遮音壁PB張り」の部位で別拾い）
      if (code.base === 'G') {
        majikiriDouble += Math.max(0, w * studH - openingAreaStud);
        // UB隣接面（耐水=中間2/5）は反対面がUB内で展開図に現れない → 鏡像分を加算（÷2で1枚に戻る）
        if (code.mid === 2 || code.mid === 5) majikiriDouble += w * studH;
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
          case 1: case 4: t.wall_pb_sqm += net; break;
          case 2: case 5: t.waterproof_pb_sqm += net; break;
          case 3: t.rawan_veneer_sqm += net; break;
          case 6: t.konpane_sqm += net; break;
          default: break; // 0=ナシ（打放し等）
        }
      }

      // 表面
      if (code.surf === 4 || code.surf === 5) t.cloth_sqm += net;
      else if (code.surf === 6) t.kitchen_panel_sqm += net;
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

  // 収納（WIC/CL等）の内側は展開図に現れないが間仕切下地は必要 → 平面図の部屋面積から推定する。
  // 内側3面（両側+奥）≒ 3×√面積（正方形近似）。うちRC面（D6*で実測済み）は胴縁の部位なので幅を控除。
  // 部屋側の面は上のループで拾い済み（÷2対象）なので、収納側の面も両面計上の山に足してから÷2する。
  const CLOSET_NAME_RE = /クローゼット|クロゼット|WIC|CL|収納|物入|押入/;
  const elevRoomNames = new Set(rooms.map((r) => r.name).filter(Boolean));
  let closetSideWidth = 0;
  for (const pr of opts.planRooms || []) {
    if (!pr?.name || !CLOSET_NAME_RE.test(pr.name)) continue;
    if (elevRoomNames.has(pr.name)) continue; // 展開図に実測がある収納は二重計上しない
    const a = pr.area_sqm || 0;
    if (a > 0) closetSideWidth += 3 * Math.sqrt(a);
  }
  closetSideWidth = Math.max(0, closetSideWidth - d6FaceWidth);
  majikiriDouble += closetSideWidth * (2.4 + STUD_PLENUM_M);

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
  set((m) => m.name.includes('遮音壁PB'),
    takeoff.sound_wall_pb_sqm, `遮音壁面 Σ幅×高さ−開口`);
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
  const dobuchiLen = dobuchiLengthM(takeoff.rc_furring_sqm);
  set((m) => m.name === '木胴縁（界壁面）',
    timberVolumeM3(TIMBER_SECTIONS.dobuchi, dobuchiLen),
    `RC面木 ${takeoff.rc_furring_sqm}㎡ × 横胴縁@455 = ${Math.round(dobuchiLen)}m × 断面45×30`);

  // サマリーにも反映
  if (result.summary) {
    result.summary.wall_area = takeoff.cloth_sqm;
    result.summary.takeoff_applied = true;
  }
  return result;
}
