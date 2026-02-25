/**
 * 資材計算サービス
 * CLAUDE.md に記載された計算式に基づいて資材数量を計算
 */

const PB_SHEET_SIZE = 1.6562; // ㎡ (910mm × 1820mm)
const DOOR_OPENING_AREA = 0.8 * 2.0; // 1.6㎡
const WINDOW_OPENING_AREA = 1.5 * 1.2; // 1.8㎡

export function calculateMaterials(aiReading, packageSpecs, overrides = {}) {
  const data = typeof aiReading === 'string' ? JSON.parse(aiReading) : aiReading;
  const materials = [];

  // 天井高 (デフォルト2400mm)
  const ceilingHeight = (overrides.ceiling_height_mm || data.ceiling_height_mm || 2400) / 1000;

  // 部屋データを集計
  const rooms = data.rooms || [];
  const openings = data.openings || [];

  // 床面積の計算
  let flooringArea = 0; // フローリング用
  let cfArea = 0; // CF用

  rooms.forEach(room => {
    const area = room.area_sqm || 0;
    if (room.floor_type === 'flooring') {
      flooringArea += area;
    } else if (room.floor_type === 'cf') {
      cfArea += area;
    }
  });

  // 天井面積 (全部屋の合計)
  const totalCeilingArea = rooms.reduce((sum, room) => sum + (room.area_sqm || 0), 0);

  // 壁延長の計算
  let partitionWallLength = 0; // 間仕切壁
  let structuralWallLength = 0; // 躯体壁

  rooms.forEach(room => {
    const width = (room.width_mm || 0) / 1000;
    const depth = (room.depth_mm || 0) / 1000;
    const perimeter = (width + depth) * 2;

    if (room.wall_type === 'partition') {
      partitionWallLength += perimeter;
    } else {
      structuralWallLength += perimeter;
    }
  });

  // 開口部の面積と幅を計算
  let doorCount = 0;
  let windowCount = 0;
  let totalOpeningWidth = 0;

  openings.forEach(opening => {
    if (opening.type === 'door') {
      doorCount++;
      totalOpeningWidth += (opening.width_mm || 800) / 1000;
    } else if (opening.type === 'window') {
      windowCount++;
    }
  });

  const openingArea = doorCount * DOOR_OPENING_AREA + windowCount * WINDOW_OPENING_AREA;

  // 壁面積の計算
  // 壁面積 = (間仕切壁延長 × 天井高 × 2) + (躯体壁延長 × 天井高 × 1) − 開口部面積
  const wallArea = (partitionWallLength * ceilingHeight * 2) +
    (structuralWallLength * ceilingHeight * 1) -
    openingArea;

  // --- 資材計算 ---

  // PB 12.5mm (壁用) - ロス率+5%
  const pb125Sheets = Math.ceil((wallArea / PB_SHEET_SIZE) * 1.05);
  materials.push({
    category: '下地材',
    name: 'プラスターボード 12.5mm',
    unit: '枚',
    quantity: pb125Sheets,
    calculation: `壁面積 ${wallArea.toFixed(1)}㎡ ÷ ${PB_SHEET_SIZE}㎡ × 1.05`
  });

  // PB 9.5mm (天井用) - ロス率+5%
  const pb95Sheets = Math.ceil((totalCeilingArea / PB_SHEET_SIZE) * 1.05);
  materials.push({
    category: '下地材',
    name: 'プラスターボード 9.5mm',
    unit: '枚',
    quantity: pb95Sheets,
    calculation: `天井面積 ${totalCeilingArea.toFixed(1)}㎡ ÷ ${PB_SHEET_SIZE}㎡ × 1.05`
  });

  // Mクロス (固定7枚)
  materials.push({
    category: '下地材',
    name: 'Mクロス',
    unit: '枚',
    quantity: 7,
    calculation: '固定値（洗面室+トイレ）'
  });

  // フローリング - ロス率+10%
  const flooringQty = Math.ceil(flooringArea * 1.1 * 10) / 10;
  materials.push({
    category: '床材',
    name: 'フローリング',
    unit: '㎡',
    quantity: flooringQty,
    calculation: `居室床面積 ${flooringArea.toFixed(1)}㎡ × 1.1`
  });

  // CF (クッションフロア) - ロス率+10%
  const cfQty = Math.ceil(cfArea * 1.1 * 10) / 10;
  materials.push({
    category: '床材',
    name: 'クッションフロア',
    unit: '㎡',
    quantity: cfQty,
    calculation: `水回り床面積 ${cfArea.toFixed(1)}㎡ × 1.1`
  });

  // 巾木 - 壁延長から開口部幅を引く
  const totalWallLength = partitionWallLength + structuralWallLength;
  const habakiLength = Math.ceil(totalWallLength - totalOpeningWidth);
  materials.push({
    category: '造作材',
    name: '巾木',
    unit: 'm',
    quantity: habakiLength,
    calculation: `壁延長 ${totalWallLength.toFixed(1)}m − 開口部幅 ${totalOpeningWidth.toFixed(1)}m`
  });

  // ラワンベニヤ (固定4枚)
  materials.push({
    category: '下地材',
    name: 'ラワンベニヤ',
    unit: '枚',
    quantity: 4,
    calculation: '固定値'
  });

  // 設備関連
  const equipment = data.equipment || {};

  if (equipment.ub_size) {
    materials.push({
      category: '設備',
      name: 'ユニットバス',
      unit: '台',
      quantity: 1,
      calculation: `サイズ: ${equipment.ub_size}`
    });
  }

  if (equipment.kitchen) {
    materials.push({
      category: '設備',
      name: 'キッチン',
      unit: '台',
      quantity: 1,
      calculation: equipment.kitchen
    });
  }

  if (equipment.washstand) {
    materials.push({
      category: '設備',
      name: '洗面台',
      unit: '台',
      quantity: 1,
      calculation: equipment.washstand
    });
  }

  // 収納関連（枕棚）
  const storages = data.storage || [];
  const makuradanaCount = storages.filter(s => s.has_makuradana).length;
  if (makuradanaCount > 0) {
    const totalStorageWidth = storages
      .filter(s => s.has_makuradana)
      .reduce((sum, s) => sum + (s.width_mm || 0), 0);

    materials.push({
      category: '造作材',
      name: '枕棚',
      unit: 'm',
      quantity: Math.ceil(totalStorageWidth / 1000 * 10) / 10,
      calculation: `収納 ${makuradanaCount}箇所`
    });
  }

  return {
    materials,
    summary: {
      flooringArea,
      cfArea,
      wallArea,
      ceilingArea: totalCeilingArea,
      doorCount,
      windowCount
    }
  };
}
