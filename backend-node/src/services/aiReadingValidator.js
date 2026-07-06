/**
 * AI解析結果のサーバー側検証・正規化
 *
 * 設計方針: AIは「転記」のみ信頼し、換算・妥当性判断はすべてここで行う。
 * プロンプト内のルール（帖数優先、間仕切壁上限、床暖房上限）は
 * AIが守らない前提で、サーバー側で強制する。
 */

const JOU_TO_SQM = 1.65; // 中京間相当（実績データに合わせた値。不動産表示規約は1畳=1.62㎡以上）

// 間取りタイプ別の間仕切壁延長バンド（実績データより）
const PARTITION_WALL_BANDS = {
  '1LDK': { min: 12, max: 18, fallback: 15 },
  '2LDK': { min: 15, max: 25, fallback: 20 },
  '3LDK': { min: 20, max: 30, fallback: 22 }, // アルファステイツ67戸平均≒22m
  '4LDK': { min: 25, max: 35, fallback: 28 },
};

// 床暖房はLDK面積に対する敷設率で検証
const FLOOR_HEATING_MAX_RATIO = 0.7;

/**
 * 帖数文字列を数値化（"約14.5帖" "14.5" "6帖" 等に対応）
 */
function parseJou(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const m = String(value).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * 外形寸法（寸法線の転記値）から専有面積の推定アンカーを計算
 * 外形（壁外々）×0.93 ≒ 壁芯ベース専有面積の近似
 */
function grossAreaAnchor(data) {
  const dims = data.outer_dimensions_mm;
  if (!dims?.width || !dims?.depth) return null;
  const gross = (dims.width / 1000) * (dims.depth / 1000);
  if (gross < 20 || gross > 200) return null; // 転記ミスの排除
  // 外壁厚約200mm → 壁芯ベース専有面積 ≒ (W-0.2)×(D-0.2)
  const wallCenter = ((dims.width - 200) / 1000) * ((dims.depth - 200) / 1000);
  return {
    gross: Math.round(gross * 10) / 10,
    estimated: Math.round(wallCenter * 10) / 10,
    min: Math.round(wallCenter * 0.93 * 10) / 10,
    max: Math.round(gross * 10) / 10,
  };
}

/**
 * メイン: AI解析結果を検証・正規化して返す
 * @returns { data: 正規化済み結果, warnings: [{field, message, before, after}], isRejected: boolean }
 */
export function validateAndNormalize(raw, options = {}) {
  const data = JSON.parse(JSON.stringify(raw));
  const warnings = [];

  // ---------- 0. 図面種別ゲート: 平面図以外は解析拒否 ----------
  const docType = data.document_type;
  const isAnalyzable = data.is_analyzable;

  // document_type が明示的に非平面図の場合
  if (docType && docType !== 'floor_plan') {
    const docTypeLabels = {
      'finish_schedule': '仕上表',
      'elevation': '展開図・立面図',
      'other': '平面図以外の図面',
    };
    const label = docTypeLabels[docType] || docType;
    warnings.push({
      field: 'document_type',
      message: `この画像は「${label}」と判定されました。資材計算には計画平面図をアップロードしてください`,
      before: docType,
      after: null,
    });
    data.document_type_needs_review = true;

    // 両方のAIが非平面図と判定した場合は拒否（isRejected: true）
    // ※ reconcileDualResults で両AI結果を見て判定するため、ここでは警告のみ
  }

  // is_analyzable が明示的に false の場合
  if (isAnalyzable === false) {
    warnings.push({
      field: 'is_analyzable',
      message: 'この画像からは資材計算に必要な情報（寸法・間取り）を読み取れませんでした',
      before: false,
      after: null,
    });
    data.document_type_needs_review = true;
  }

  // ---------- 1. 部屋面積: 帖数記載があれば帖数×1.65で強制上書き ----------
  if (Array.isArray(data.rooms)) {
    for (const room of data.rooms) {
      const jou = parseJou(room.area_jou);
      if (jou) {
        const jouBasedSqm = Math.round(jou * JOU_TO_SQM * 10) / 10;
        const aiSqm = room.area_sqm;
        if (aiSqm && Math.abs(aiSqm - jouBasedSqm) / jouBasedSqm > 0.1) {
          warnings.push({
            field: `rooms.${room.name}.area_sqm`,
            message: `AI目測(${aiSqm}㎡)が帖数記載(${jou}帖=${jouBasedSqm}㎡)と10%以上乖離。帖数を採用`,
            before: aiSqm,
            after: jouBasedSqm,
          });
        }
        room.area_sqm = jouBasedSqm;
        room.area_source = 'jou_label'; // 由来を記録
      } else if (room.area_sqm) {
        room.area_source = 'ai_estimate';
      }
    }
  }

  // ---------- 2. 総床面積: ユーザー入力 > 外形寸法アンカー > 部屋合計照合 ----------
  const anchor = grossAreaAnchor(data);
  if (options.userTotalAreaSqm) {
    if (data.total_floor_area_sqm !== options.userTotalAreaSqm) {
      warnings.push({
        field: 'total_floor_area_sqm',
        message: `ユーザー入力の専有面積を採用`,
        before: data.total_floor_area_sqm,
        after: options.userTotalAreaSqm,
      });
    }
    data.total_floor_area_sqm = options.userTotalAreaSqm;
    data.total_area_source = 'user_input';
  } else if (anchor) {
    const total = data.total_floor_area_sqm;
    if (!total || total < anchor.min || total > anchor.max) {
      warnings.push({
        field: 'total_floor_area_sqm',
        message: `AI値(${total}㎡)が外形寸法${data.outer_dimensions_mm.width}×${data.outer_dimensions_mm.depth}由来の範囲(${anchor.min}〜${anchor.max}㎡)外。寸法ベース推定値を採用`,
        before: total,
        after: anchor.estimated,
      });
      data.total_floor_area_sqm = anchor.estimated;
      data.total_area_source = 'outer_dimensions';
      data.total_floor_area_needs_review = true;
    } else {
      data.total_area_source = 'ai_estimate_verified'; // 寸法と整合
    }
  } else if (Array.isArray(data.rooms) && data.rooms.length > 0) {
    const roomSum = data.rooms.reduce((s, r) => s + (r.area_sqm || 0), 0);
    const total = data.total_floor_area_sqm;
    // 部屋合計は廊下・収納の欠落で総面積の8〜9割程度になるのが普通。
    // 総面積 < 部屋合計 は物理的にありえないので部屋合計ベースに補正
    if (total && roomSum > total * 1.02) {
      const corrected = Math.round(roomSum * 1.1 * 10) / 10; // 廊下等の補正
      warnings.push({
        field: 'total_floor_area_sqm',
        message: `総床面積(${total}㎡)が部屋面積合計(${Math.round(roomSum * 10) / 10}㎡)より小さい。補正値を採用`,
        before: total,
        after: corrected,
      });
      data.total_floor_area_sqm = corrected;
    }
  }

  // ---------- 3. 間仕切壁延長: 間取りタイプ別バンドでクランプ ----------
  const layout = (data.layout_type || '').toUpperCase().replace(/[^0-9LDKS]/g, '');
  const band = PARTITION_WALL_BANDS[layout];
  if (band && data.partition_wall_length_m) {
    const len = data.partition_wall_length_m;
    if (len > band.max) {
      warnings.push({
        field: 'partition_wall_length_m',
        message: `${layout}の実績上限(${band.max}m)を超過。躯体壁を含めている可能性が高いため上限値に丸め`,
        before: len,
        after: band.max,
      });
      data.partition_wall_length_m = band.max;
      data.partition_wall_needs_review = true; // フロントで要確認表示
    } else if (len < band.min) {
      warnings.push({
        field: 'partition_wall_length_m',
        message: `${layout}の実績下限(${band.min}m)未満。読み落としの可能性`,
        before: len,
        after: len, // 下振れは丸めず警告のみ（意図的に壁が少ない間取りもある）
      });
      data.partition_wall_needs_review = true;
    }
  }

  // ---------- 4. 床暖房: LDK面積×敷設率上限でクランプ ----------
  if (Array.isArray(data.special)) {
    const ldk = (data.rooms || []).find((r) => r.name?.includes('LDK'));
    const ldkArea = ldk?.area_sqm || null;
    for (const sp of data.special) {
      const isFloorHeating = sp.type === '床暖房' || sp.type === 'floor_heating';
      if (isFloorHeating && sp.area_sqm && ldkArea) {
        const maxArea = Math.round(ldkArea * FLOOR_HEATING_MAX_RATIO * 10) / 10;
        if (sp.area_sqm > maxArea) {
          warnings.push({
            field: 'special.床暖房.area_sqm',
            message: `床暖房面積(${sp.area_sqm}㎡)がLDK面積(${ldkArea}㎡)の${FLOOR_HEATING_MAX_RATIO * 100}%を超過。上限値に丸め`,
            before: sp.area_sqm,
            after: maxArea,
          });
          sp.area_sqm = maxArea;
          sp.needs_review = true;
        }
      }
    }
  }

  // ---------- 5. 天井高: 常識範囲チェック ----------
  if (data.ceiling_height_mm && (data.ceiling_height_mm < 2200 || data.ceiling_height_mm > 2800)) {
    warnings.push({
      field: 'ceiling_height_mm',
      message: `天井高(${data.ceiling_height_mm}mm)が通常範囲(2200〜2800)外。2400に補正`,
      before: data.ceiling_height_mm,
      after: 2400,
    });
    data.ceiling_height_mm = 2400;
  }

  data._validated = true; // calculator側の重複クランプを無効化するフラグ
  return { data, warnings };
}

/**
 * デュアルAI結果のフィールド単位照合
 * 平均化ではなく「一致なら採用、乖離なら信頼できる方+警告」
 */
export function reconcileDualResults(geminiResult, claudeResult) {
  const results = [geminiResult, claudeResult].filter(Boolean);
  if (results.length === 0) return { merged: null, disagreements: [], isRejected: false };
  if (results.length === 1) return { merged: results[0], disagreements: [], isRejected: false };

  const [a, b] = results;
  const merged = JSON.parse(JSON.stringify(a));
  const disagreements = [];

  // ---------- 図面種別ゲート: 両AIが非平面図と判定したら拒否 ----------
  const docTypeA = a.document_type;
  const docTypeB = b.document_type;
  const analyzableA = a.is_analyzable !== false; // undefined も true 扱い
  const analyzableB = b.is_analyzable !== false;

  // 両方が非平面図を返した場合、または両方がis_analyzable=falseの場合
  const bothNonFloorPlan = docTypeA && docTypeA !== 'floor_plan' &&
                            docTypeB && docTypeB !== 'floor_plan';
  const bothNotAnalyzable = !analyzableA && !analyzableB;

  if (bothNonFloorPlan || bothNotAnalyzable) {
    disagreements.push({
      field: 'document_type',
      gemini: docTypeA || 'floor_plan',
      claude: docTypeB || 'floor_plan',
      message: '両AIが平面図ではないと判定。アップロードされた画像を確認してください',
    });
    merged.is_rejected = true;
    merged.rejection_reason = bothNonFloorPlan
      ? `この画像は平面図ではありません（Gemini: ${docTypeA}, Claude: ${docTypeB}）`
      : '両AIとも資材計算に必要な情報を読み取れませんでした';
  }

  // 一方のみが非平面図と判定した場合は警告
  const oneNonFloorPlan = (docTypeA && docTypeA !== 'floor_plan') !==
                          (docTypeB && docTypeB !== 'floor_plan');
  if (oneNonFloorPlan && !bothNonFloorPlan) {
    disagreements.push({
      field: 'document_type',
      gemini: docTypeA || 'floor_plan',
      claude: docTypeB || 'floor_plan',
      message: 'AIの図面種別判定が不一致。平面図でない可能性があります',
    });
    merged.document_type_needs_review = true;
  }

  // 部屋: 帖数ラベルがある方を優先。両方帖数ありで一致→採用、不一致→警告
  if (Array.isArray(merged.rooms)) {
    merged.rooms.forEach((room) => {
      const other = (b.rooms || []).find((r) => r.name === room.name);
      if (!other) return;
      const jouA = parseJou(room.area_jou);
      const jouB = parseJou(other.area_jou);
      if (jouA && jouB && jouA !== jouB) {
        disagreements.push({
          field: `rooms.${room.name}.area_jou`,
          gemini: jouA,
          claude: jouB,
          message: '両AIの帖数読み取りが不一致。要確認',
        });
      } else if (!jouA && jouB) {
        room.area_jou = other.area_jou; // 読めた方を採用
      }
    });
  }

  // 外形寸法: 読めた方を採用。両方読めて不一致なら警告
  if (!merged.outer_dimensions_mm?.width && b.outer_dimensions_mm?.width) {
    merged.outer_dimensions_mm = b.outer_dimensions_mm;
  } else if (
    merged.outer_dimensions_mm?.width &&
    b.outer_dimensions_mm?.width &&
    merged.outer_dimensions_mm.width !== b.outer_dimensions_mm.width
  ) {
    disagreements.push({
      field: 'outer_dimensions_mm',
      gemini: JSON.stringify(a.outer_dimensions_mm),
      claude: JSON.stringify(b.outer_dimensions_mm),
      message: '両AIの外形寸法読み取りが不一致。要確認',
    });
  }

  const anchor = grossAreaAnchor(merged);

  // 総床面積: アンカーがあれば乖離率に関わらずアンカーに近い方を採用
  if (anchor && a.total_floor_area_sqm && b.total_floor_area_sqm) {
    const va = a.total_floor_area_sqm;
    const vb = b.total_floor_area_sqm;
    merged.total_floor_area_sqm =
      Math.abs(va - anchor.estimated) <= Math.abs(vb - anchor.estimated) ? va : vb;
    if (Math.abs(va - vb) / Math.max(va, vb) > 0.15) {
      disagreements.push({
        field: 'total_floor_area_sqm',
        gemini: va,
        claude: vb,
        message: '両AIの読み取りが15%以上乖離。外形寸法に近い方を採用',
      });
      merged.total_floor_area_sqm_needs_review = true;
    }
  }

  // 数値フィールド: 15%以上乖離したら要確認フラグ（平均はしない）
  const numericFields = anchor && a.total_floor_area_sqm && b.total_floor_area_sqm
    ? ['partition_wall_length_m']
    : ['total_floor_area_sqm', 'partition_wall_length_m'];
  numericFields.forEach((field) => {
    const va = a[field];
    const vb = b[field];
    if (va && vb && Math.abs(va - vb) / Math.max(va, vb) > 0.15) {
      disagreements.push({
        field,
        gemini: va,
        claude: vb,
        message: '両AIの読み取りが15%以上乖離。要確認',
      });
      if (field === 'total_floor_area_sqm' && anchor) {
        merged[field] =
          Math.abs(va - anchor.estimated) <= Math.abs(vb - anchor.estimated) ? va : vb;
      } else {
        merged[field] = Math.min(va, vb); // 過大計上を避け小さい方を仮採用
      }
      merged[`${field}_needs_review`] = true;
    }
  });

  // 建具: 検出数が多い方を採用（見落とし防止・従来通り）
  const openingsA = a.openings || [];
  const openingsB = b.openings || [];
  merged.openings = openingsA.length >= openingsB.length ? openingsA : openingsB;

  return { merged, disagreements, isRejected: !!merged.is_rejected };
}
