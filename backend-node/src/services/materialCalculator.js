/**
 * 資材計算サービス
 * 5現場の実績データに基づいて最適化された計算ロジック
 *
 * 実績データ参照:
 * - 朝日パリオ北千住305号室 (2LDK, 620万)
 * - 新物件ミドル (2LDK, 665万)
 * - 寿マンション401号室 (2LDK, 840万)
 * - ハイグレード物件 (3LDK, 682万)
 * - ハイグレード物件2 (2LDK, 735万)
 */

const PB_SHEET_SIZE = 1.6562; // ㎡ (910mm × 1820mm = 3×6)
const DOOR_OPENING_AREA = 0.8 * 2.0; // 1.6㎡
const WINDOW_OPENING_AREA = 1.5 * 1.2; // 1.8㎡
const TARUKI_PER_BUNDLE = 12; // 垂木1束=12本

export function calculateMaterials(aiReading, packageSpecs, overrides = {}) {
  const data = typeof aiReading === 'string' ? JSON.parse(aiReading) : aiReading;
  const materials = [];

  // 天井高 (デフォルト2400mm)
  const ceilingHeight = (overrides.ceiling_height || data.ceiling_height_mm || 2400) / 1000;

  // 部屋データを集計
  const rooms = data.rooms || [];
  const openings = data.openings || [];

  // 床面積の計算
  let flooringArea = 0; // フローリング用（居室）
  let cfArea = 0; // CF用（水回り）
  let tileArea = 0; // タイル用（玄関等）
  let totalFloorArea = 0; // 総床面積

  rooms.forEach(room => {
    const area = room.area_sqm || (room.area_tsubo ? room.area_tsubo * 3.306 : 0);
    totalFloorArea += area;

    if (room.floor_type === 'flooring' || room.name?.includes('LDK') || room.name?.includes('洋室') || room.name?.includes('リビング')) {
      flooringArea += area;
    } else if (room.floor_type === 'cf' || room.name?.includes('洗面') || room.name?.includes('トイレ') || room.name?.includes('UB')) {
      cfArea += area;
    } else if (room.floor_type === 'tile' || room.name?.includes('玄関')) {
      tileArea += area;
    } else {
      flooringArea += area; // デフォルトはフローリング
    }
  });

  // 天井面積 (UB・CLを除く)
  const ubArea = rooms.filter(r => r.name?.includes('UB') || r.name?.includes('浴室')).reduce((sum, r) => sum + (r.area_sqm || 0), 0);
  const closetArea = rooms.filter(r => r.name?.includes('クローゼット') || r.name?.includes('CL') || r.name?.includes('収納')).reduce((sum, r) => sum + (r.area_sqm || 0), 0);
  const ceilingArea = totalFloorArea - ubArea - closetArea;

  // 壁延長の計算
  let partitionWallLength = 0; // 間仕切壁
  let structuralWallLength = 0; // 躯体壁（外周壁）

  rooms.forEach(room => {
    const width = (room.width_mm || 0) / 1000;
    const depth = (room.depth_mm || 0) / 1000;
    const perimeter = (width + depth) * 2;

    if (room.wall_type === 'structural' || room.wall_type === 'external') {
      structuralWallLength += perimeter;
    } else {
      partitionWallLength += perimeter;
    }
  });

  // 総寸法から壁延長を推定（部屋データが不完全な場合）
  if (partitionWallLength === 0 && structuralWallLength === 0 && data.total_dimensions) {
    const totalWidth = (data.total_dimensions.width_mm || 0) / 1000;
    const totalDepth = (data.total_dimensions.depth_mm || 0) / 1000;
    structuralWallLength = (totalWidth + totalDepth) * 2;
    // 間仕切壁は床面積から推定（実績: 50㎡で約20m程度）
    partitionWallLength = totalFloorArea * 0.4;
  }

  // 開口部の面積と幅を計算
  let doorCount = 0;
  let windowCount = 0;
  let totalOpeningWidth = 0;

  openings.forEach(opening => {
    if (opening.type === 'door' || opening.type === '開き戸' || opening.type === '引戸' || opening.type === '折戸') {
      doorCount++;
      totalOpeningWidth += (opening.width_mm || 800) / 1000;
    } else if (opening.type === 'window' || opening.type === '窓') {
      windowCount++;
    }
  });

  // 建具数が不足している場合、間取りから推定
  if (doorCount === 0) {
    // 実績: 2LDKで約10枚、3LDKで約15枚
    const layoutType = data.layout_type || '';
    if (layoutType.includes('3LDK')) {
      doorCount = 15;
    } else if (layoutType.includes('2LDK')) {
      doorCount = 10;
    } else if (layoutType.includes('1LDK')) {
      doorCount = 7;
    } else {
      doorCount = Math.max(rooms.length + 2, 5);
    }
    totalOpeningWidth = doorCount * 0.8;
  }

  const openingArea = doorCount * DOOR_OPENING_AREA + windowCount * WINDOW_OPENING_AREA;

  // 壁面積の計算
  // 壁面積 = (間仕切壁延長 × 天井高 × 2) + (躯体壁延長 × 天井高 × 1) − 開口部面積
  // 躯体壁処理: GL工法=片面のみ、木軸ふかし=両面
  const structuralWallMultiplier = overrides.structural_wall_treatment === 'fukashi' ? 2 : 1;
  let wallArea = (partitionWallLength * ceilingHeight * 2) +
    (structuralWallLength * ceilingHeight * structuralWallMultiplier) -
    openingArea;

  // 壁面積が計算できない場合、床面積から推定（実績: 50㎡で約200㎡）
  if (wallArea <= 0 || isNaN(wallArea)) {
    wallArea = totalFloorArea * 4;
  }

  // --- 資材計算 ---

  // PB 12.5mm (壁用) - ロス率+5%
  // 実績: 305号室40枚、新物件50枚、HG30枚（壁面積に依存）
  const pb125Sheets = Math.ceil((wallArea / PB_SHEET_SIZE) * 1.05);
  materials.push({
    category: '下地材',
    name: 'PB 12.5mm 吉野 3×6',
    spec: '910×1820mm',
    unit: '枚',
    quantity: pb125Sheets,
    calculation: `壁面積 ${wallArea.toFixed(1)}㎡ ÷ ${PB_SHEET_SIZE}㎡ × 1.05`
  });

  // PB 9.5mm (天井用) - ロス率+5%
  // 実績: 30～40枚（天井面積に依存）
  const pb95Sheets = Math.ceil((ceilingArea / PB_SHEET_SIZE) * 1.05);
  materials.push({
    category: '下地材',
    name: 'PB 9.5mm 吉野 3×6',
    spec: '910×1820mm',
    unit: '枚',
    quantity: pb95Sheets,
    calculation: `天井面積 ${ceilingArea.toFixed(1)}㎡ ÷ ${PB_SHEET_SIZE}㎡ × 1.05`
  });

  // Mクロス (水回りボード)
  // 実績: 2～7枚（洗面室+トイレの面積に依存、スタンダードは7枚固定が多い）
  const mCrossSheets = cfArea > 0 ? Math.ceil((cfArea / PB_SHEET_SIZE) * 1.1) : 7;
  const mCrossQty = Math.max(mCrossSheets, 2); // 最低2枚
  materials.push({
    category: '下地材',
    name: 'Mクロス 12.5mm 3×6',
    spec: '耐水ボード',
    unit: '枚',
    quantity: Math.min(mCrossQty, 7), // 最大7枚
    calculation: cfArea > 0 ? `水回り面積 ${cfArea.toFixed(1)}㎡から算出` : '固定値（洗面室+トイレ）'
  });

  // 垂木 (赤松KD 30×40 L3000 入数12)
  // 計算式: (間仕切壁延長÷0.303×2 + 天井面積÷0.303) ÷ 12
  // 実績: 10～25束
  const tarukiCount = ((partitionWallLength / 0.303 * 2) + (ceilingArea / 0.303)) / TARUKI_PER_BUNDLE;
  const tarukiBundles = Math.ceil(tarukiCount);
  materials.push({
    category: '下地材',
    name: '垂木 赤松KD 30×40 L3000',
    spec: '入数12本/束',
    unit: '束',
    quantity: Math.max(tarukiBundles, 10), // 最低10束
    calculation: `壁下地 + 天井下地 @303ピッチ`
  });

  // フローリング - ロス率+10%
  // 実績: DAIKEN MYオトユカ/MYフロア、Panasonic ウスイータ
  const flooringQty = Math.ceil(flooringArea * 1.1 * 10) / 10;
  if (flooringQty > 0) {
    materials.push({
      category: '床材',
      name: 'フローリング',
      spec: packageSpecs?.flooring || 'DAIKEN MYフロア',
      unit: '㎡',
      quantity: flooringQty,
      calculation: `居室床面積 ${flooringArea.toFixed(1)}㎡ × 1.1`
    });
  }

  // CF (クッションフロア) または フロアタイル
  // 実績: 水回り床面積 × 1.1
  const waterproofFloorType = overrides.waterproof_floor || 'cf';
  if (cfArea > 0) {
    const cfQty = Math.ceil(cfArea * 1.1 * 10) / 10;
    materials.push({
      category: '床材',
      name: waterproofFloorType === 'tile' ? 'フロアタイル' : 'クッションフロア',
      spec: '水回り用',
      unit: '㎡',
      quantity: cfQty,
      calculation: `水回り床面積 ${cfArea.toFixed(1)}㎡ × 1.1`
    });
  }

  // ラワンベニヤ 9mm 3×6 (水回りフロアタイル下地)
  // 実績: 4～15枚（床面積に依存）
  const rawanSheets = Math.ceil((cfArea / PB_SHEET_SIZE) * 1.1);
  materials.push({
    category: '下地材',
    name: 'ラワンベニヤ 9mm 3×6',
    spec: '水回り床下地',
    unit: '枚',
    quantity: Math.max(rawanSheets, 4), // 最低4枚
    calculation: `水回り床面積から算出（最低4枚）`
  });

  // 巾木 - 壁延長から開口部幅を引く
  // 実績: 10～30m（ソフト巾木または木製巾木）
  const totalWallLength = partitionWallLength + structuralWallLength;
  const habakiLength = Math.ceil(totalWallLength - totalOpeningWidth);
  materials.push({
    category: '造作材',
    name: '巾木',
    spec: packageSpecs?.habaki || 'ソフト巾木 or 木製',
    unit: 'm',
    quantity: Math.max(habakiLength, 10), // 最低10m
    calculation: `壁延長 ${totalWallLength.toFixed(1)}m − 開口部幅 ${totalOpeningWidth.toFixed(1)}m`
  });

  // 天井クロス（量産品番）
  // 実績: 55～75㎡
  materials.push({
    category: '仕上材',
    name: '天井クロス',
    spec: '量産品番 1000番台',
    unit: '㎡',
    quantity: Math.ceil(ceilingArea),
    calculation: `天井面積 ${ceilingArea.toFixed(1)}㎡`
  });

  // 壁クロス（量産品番）
  // 実績: 198～270㎡
  materials.push({
    category: '仕上材',
    name: '壁クロス',
    spec: '量産品番 1000番台',
    unit: '㎡',
    quantity: Math.ceil(wallArea),
    calculation: `壁面積 ${wallArea.toFixed(1)}㎡`
  });

  // アクセントクロス（1000番）
  // 実績: 10㎡固定
  materials.push({
    category: '仕上材',
    name: 'アクセントクロス',
    spec: '1000番',
    unit: '㎡',
    quantity: 10,
    calculation: '固定値'
  });

  // 建具
  // 実績: Panasonic ベリティス PA型 H2035 または ダイケンリノベセレクション
  materials.push({
    category: '建具',
    name: '建具一式',
    spec: packageSpecs?.doors || 'Panasonic ベリティス',
    unit: '枚',
    quantity: doorCount,
    calculation: `図面から ${doorCount}枚`
  });

  // 設備関連
  const equipment = data.equipment || {};

  // UB（ユニットバス）
  if (equipment.ub_size) {
    const ubSpec = packageSpecs?.ub || (equipment.ub_size.includes('1317') ? 'TOTO WT 1317' : 'TOTO WT 1216');
    materials.push({
      category: '設備',
      name: 'ユニットバス',
      spec: ubSpec,
      unit: '台',
      quantity: 1,
      calculation: `サイズ: ${equipment.ub_size}`
    });
  }

  // キッチン
  if (equipment.kitchen) {
    materials.push({
      category: '設備',
      name: 'システムキッチン',
      spec: packageSpecs?.kitchen || 'LIXIL ES 2550 スライド・食洗機あり',
      unit: '台',
      quantity: 1,
      calculation: equipment.kitchen
    });
  }

  // 洗面台
  if (equipment.washstand) {
    materials.push({
      category: '設備',
      name: '洗面化粧台',
      spec: packageSpecs?.washstand || 'LIXIL CLINE W750',
      unit: '台',
      quantity: 1,
      calculation: equipment.washstand
    });
  }

  // トイレ
  materials.push({
    category: '設備',
    name: 'トイレ本体',
    spec: packageSpecs?.toilet || 'TOTO 一体型便器ZJ2 (ZR2)',
    unit: '台',
    quantity: 1,
    calculation: 'パッケージ仕様'
  });

  // トイレ吊戸棚
  materials.push({
    category: '設備',
    name: 'トイレ吊戸棚',
    spec: 'ワンド STO-60EN W600×D201×H600',
    unit: '個',
    quantity: 1,
    calculation: '標準仕様'
  });

  // 収納関連（枕棚+ハンガーパイプ）
  const storages = data.storage || [];
  const closetCount = storages.filter(s => s.type === 'closet' || s.has_makuradana).length;
  if (closetCount > 0) {
    const totalStorageWidth = storages
      .filter(s => s.type === 'closet' || s.has_makuradana)
      .reduce((sum, s) => sum + (s.width_mm || 1800), 0);

    materials.push({
      category: '造作材',
      name: '枕棚+ハンガーパイプ',
      spec: 'Panasonic フロート',
      unit: 'm',
      quantity: Math.ceil(totalStorageWidth / 1000 * 10) / 10,
      calculation: `収納 ${closetCount}箇所`
    });
  }

  // 床暖房（オプション）
  if (overrides.floor_heating === 'あり' || data.special?.some(s => s.type === 'floor_heating')) {
    const floorHeatingArea = overrides.floor_heating_area || 2.7;
    const floorHeatingType = packageSpecs?.floor_heating || '電気式';
    materials.push({
      category: '設備',
      name: '床暖房',
      spec: floorHeatingType === 'ガス温水式' ? 'ガス温水式床暖房' : '電気式床暖房',
      unit: '㎡',
      quantity: floorHeatingArea,
      calculation: `${floorHeatingType} ${floorHeatingArea}㎡`
    });
  }

  // 室内窓（オプション）
  if (overrides.interior_window === 'あり' || data.special?.some(s => s.type === 'interior_window' || s.type === '室内窓')) {
    materials.push({
      category: '造作',
      name: '室内窓',
      spec: 'Panasonic 暮らし&リフォーム',
      unit: '箇所',
      quantity: 1,
      calculation: 'オプション'
    });
  }

  return {
    materials,
    summary: {
      totalFloorArea,
      flooringArea,
      cfArea,
      tileArea,
      wallArea,
      ceilingArea,
      doorCount,
      windowCount,
      partitionWallLength,
      structuralWallLength
    }
  };
}
