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

const PB_SQM_PER_SHEET = 1.4; // XLS集計表の換算係数（3×6板・ロス込み）

// 床まで達する開口（巾木・壁下部から引く）とみなす高さ
const FLOOR_OPENING_MIN_HEIGHT_MM = 1800;

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
 */
export function computeElevationTakeoff(elevations, doorSchedule = []) {
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
    partition_face_length_m: 0, // 間仕切系下地の面延長（両面計上・間仕切下地(木)用）
    skirting_m: { 木製: 0, ソフト: 0, 樹脂: 0 },
    // 参考
    opening_area_sqm: 0,
    rooms: [],
  };

  for (const room of rooms) {
    const ch = (room.ceiling_height_mm || 2400) / 1000;
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
      for (const raw of face.openings || []) {
        const op = resolveOpening(raw, doorIndex);
        const ow = (op.width_mm || 0) / 1000;
        const oh = (op.height_mm || 0) / 1000;
        if (ow <= 0) continue;
        // 高さ不明の開口: 窓=腰窓標準1.1m / 戸=2.0m。面の高さは超えない
        const fallbackH = isWindow(op) ? 1.1 : 2.0;
        const effH = Math.min(oh > 0 ? oh : fallbackH, h);
        openingArea += ow * effH;
        const reachesFloor = !isWindow(op) || (op.height_mm || 0) >= FLOOR_OPENING_MIN_HEIGHT_MM;
        if (reachesFloor) floorOpeningWidth += ow;
      }

      const net = Math.max(0, w * h - openingArea);
      t.opening_area_sqm += openingArea;
      roomWallNet += net;

      // 部位振り分け（面の記号 > 部屋の単一記号 > 間仕切+PB9.5+クロスのデフォルト）
      const code = parseWallCode(face.wall_code) || roomDefaultCode || { base: 'G', mid: 1, surf: 4 };

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
  // 間仕切下地(木)は「@450ピッチの下地材長」であり面延長とは単位が異なる（G正解84m vs 面延長≈50m）。
  // 材積換算層を実装するまで上書きしない（推定値のままにする）

  // サマリーにも反映
  if (result.summary) {
    result.summary.wall_area = takeoff.cloth_sqm;
    result.summary.takeoff_applied = true;
  }
  return result;
}
