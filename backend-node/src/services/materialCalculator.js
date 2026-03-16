/**
 * 資材計算サービス
 * 7現場の実績データに基づいて最適化された計算ロジック
 *
 * 実績データ参照:
 * - 朝日パリオ北千住305号室 (2LDK, 620万) - PB12.5:40枚, PB9.5:30枚, 垂木:20束
 * - 新物件ミドル (2LDK, 665万) - PB12.5:50枚, PB9.5:35枚, 垂木:25束
 * - 寿マンション401号室 (2LDK, 840万)
 * - ハイグレード物件 (3LDK, 682万) - PB12.5:30枚, PB9.5:40枚, 垂木:20束
 * - ハイグレード物件2 (2LDK, 735万) - PB12.5:30枚, PB9.5:30枚, 垂木:20束
 * - 目白テラスドハウス3A (722万) - PB12.5:40枚, PB9.5:35枚, 垂木:27束, 天井CL:75㎡, 壁CL:270㎡
 * - 別現場 (660万/713万) - PB12.5:40-60枚, PB9.5:30-40枚, 垂木:29-30束
 */

const PB_SHEET_SIZE = 1.6562; // ㎡ (910mm × 1820mm = 3×6)
const DOOR_OPENING_AREA = 0.8 * 2.0; // 1.6㎡
const WINDOW_OPENING_AREA = 1.5 * 1.2; // 1.8㎡
const TARUKI_PER_BUNDLE = 12; // 垂木1束=12本

export function calculateMaterials(aiReading, packageSpecs, overrides = {}) {
  // aiReadingがnull/undefined/空の場合のガード
  if (!aiReading) {
    return {
      materials: [],
      summary: {
        totalFloorArea: 0,
        flooringArea: 0,
        cfArea: 0,
        tileArea: 0,
        wallArea: 0,
        ceilingArea: 0,
        doorCount: 0,
        windowCount: 0,
        partitionWallLength: 0,
        structuralWallLength: 0
      }
    };
  }

  let data;
  try {
    data = typeof aiReading === 'string' ? JSON.parse(aiReading) : aiReading;
  } catch (e) {
    console.error('Failed to parse aiReading:', e);
    data = {};
  }

  const materials = [];

  // 天井高 (デフォルト2400mm)
  // フロントエンドから "2400mm" 形式で送られるため、数値部分を抽出
  let ceilingHeightMm = data.ceiling_height_mm || 2400;
  if (overrides.ceiling_height) {
    const parsed = parseInt(overrides.ceiling_height.replace(/[^0-9]/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      ceilingHeightMm = parsed;
    }
  }
  const ceilingHeight = ceilingHeightMm / 1000;

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

    if (room.floor_type === 'flooring' || room.name?.includes('LDK') || room.name?.includes('洋室') || room.name?.includes('リビング') || room.name?.includes('廊下') || room.name?.includes('ホール')) {
      flooringArea += area;
    } else if (room.floor_type === 'cf' || room.name?.includes('洗面') || room.name?.includes('トイレ') || room.name?.includes('UB') || room.name?.includes('脱衣')) {
      cfArea += area;
    } else if (room.floor_type === 'tile' || room.name?.includes('玄関')) {
      tileArea += area;
    } else {
      flooringArea += area; // デフォルトはフローリング
    }
  });

  // 天井面積 (UB・CLを除く)
  const ubArea = rooms.filter(r => r.name?.includes('UB') || r.name?.includes('浴室')).reduce((sum, r) => sum + (r.area_sqm || 0), 0);
  const closetArea = rooms.filter(r => r.name?.includes('クローゼット') || r.name?.includes('CL') || r.name?.includes('収納') || r.name?.includes('物入')).reduce((sum, r) => sum + (r.area_sqm || 0), 0);
  let ceilingArea = totalFloorArea - ubArea - closetArea;
  // 天井面積が0以下の場合、床面積の90%として推定（最低50㎡）
  if (ceilingArea <= 0) {
    ceilingArea = totalFloorArea > 0 ? totalFloorArea * 0.9 : 50;
  }

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
    if (opening.type === 'door' || opening.type === '開き戸' || opening.type === '引戸' || opening.type === '折戸' || opening.type === '片引戸') {
      doorCount++;
      totalOpeningWidth += (opening.width_mm || 800) / 1000;
    } else if (opening.type === 'window' || opening.type === '窓') {
      windowCount++;
    }
  });

  // 建具数が不足している場合、間取りから推定
  // 7現場実績: 1LDK=7枚, 2LDK=10枚, 3LDK=15枚
  if (doorCount === 0) {
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
  // 壁面積 = (間仕切壁延長 × 天井高 × 2) + (躯体壁延長 × 天井高 × 係数) − 開口部面積
  // 躯体壁処理: GL工法=片面のみ、木軸ふかし=両面、既存利用=0
  let structuralWallMultiplier = 1; // デフォルトGL工法
  const exteriorWall = overrides.exterior_wall || '';
  if (exteriorWall.includes('木軸ふかし')) {
    structuralWallMultiplier = 2;
  } else if (exteriorWall.includes('既存利用')) {
    structuralWallMultiplier = 0;
  }

  let wallArea = (partitionWallLength * ceilingHeight * 2) +
    (structuralWallLength * ceilingHeight * structuralWallMultiplier) -
    openingArea;

  // 壁面積が計算できない場合、床面積から推定
  // 7現場実績: 壁クロス187～270㎡ → 床面積の約3.5～4倍
  if (wallArea <= 0 || isNaN(wallArea)) {
    wallArea = totalFloorArea > 0 ? totalFloorArea * 3.8 : 200; // 最低200㎡
  }

  // --- 資材計算 ---

  // PB 12.5mm (壁用) - ロス率+5%
  // 7現場実績: 30～60枚（平均40枚）
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
  // 7現場実績: 30～40枚（天井面積に依存）
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
  // 7現場実績: 全て7枚固定
  materials.push({
    category: '下地材',
    name: 'Mクロス 12.5mm 3×6',
    spec: '耐水ボード',
    unit: '枚',
    quantity: 7,
    calculation: '固定値（洗面室+トイレ）'
  });

  // 垂木 (赤松KD 30×40 L3000 入数12)
  // 7現場実績: 20～30束（平均25束）
  // 計算式: (間仕切壁延長÷0.303×2 + 天井面積÷0.303) ÷ 12
  let tarukiBundles = 20; // デフォルト20束
  if (partitionWallLength > 0 || ceilingArea > 0) {
    const tarukiCount = ((partitionWallLength / 0.303 * 2) + (ceilingArea / 0.303)) / TARUKI_PER_BUNDLE;
    tarukiBundles = Math.ceil(tarukiCount);
    if (isNaN(tarukiBundles) || tarukiBundles <= 0) {
      tarukiBundles = 20;
    }
  }
  materials.push({
    category: '下地材',
    name: '垂木 赤松KD 30×40 L3000',
    spec: '入数12本/束',
    unit: '束',
    quantity: Math.max(tarukiBundles, 10), // 最低10束
    calculation: `壁下地 + 天井下地 @303ピッチ`
  });

  // フローリング - ロス率+10%
  // 7現場実績: 22～70㎡（間取りによる）
  const flooringQty = Math.ceil(flooringArea * 1.1 * 10) / 10;
  if (flooringQty > 0) {
    materials.push({
      category: '床材',
      name: 'フローリング',
      spec: packageSpecs?.flooring || 'DAIKEN MYフロア (1×6)',
      unit: '㎡',
      quantity: flooringQty,
      calculation: `居室床面積 ${flooringArea.toFixed(1)}㎡ × 1.1`
    });
  }

  // 床見切り（DAIKEN MYフロア用）
  materials.push({
    category: '床材',
    name: '床見切り',
    spec: 'DAIKEN MYフロア用',
    unit: '本',
    quantity: 4,
    calculation: '標準4本'
  });

  // CF (クッションフロア) または フロアタイル
  // 7現場実績: 水回りフロアタイル貼り 1式
  const waterFloorFinish = overrides.water_floor_finish || 'CF';
  const waterproofFloorType = waterFloorFinish.includes('タイル') ? 'tile' : 'cf';
  materials.push({
    category: '床材',
    name: waterproofFloorType === 'tile' ? '水回りフロアタイル貼り' : 'クッションフロア貼り',
    spec: '洗面室・トイレ',
    unit: '式',
    quantity: 1,
    calculation: '水回り一式'
  });

  // 玄関土間フロアタイル
  if (tileArea > 0 || overrides.entrance_floor === 'tile') {
    materials.push({
      category: '床材',
      name: '玄関土間フロアタイル貼り',
      spec: '面積増',
      unit: '式',
      quantity: 2,
      calculation: '玄関土間'
    });
  }

  // ラワンベニヤ 9mm 3×6 (水回りフロアタイル下地)
  // 7現場実績: 4～12枚
  const rawanSheets = Math.max(Math.ceil((cfArea / PB_SHEET_SIZE) * 1.1), 4);
  materials.push({
    category: '下地材',
    name: 'ラワンベニヤ 9mm 3×6',
    spec: '水回りフロアタイル下地',
    unit: '枚',
    quantity: rawanSheets,
    calculation: `水回り床面積から算出（最低4枚）`
  });

  // ラワンランバー 24mm 3×8（フローリング下地用）
  // 7現場実績: 1～2枚
  materials.push({
    category: '下地材',
    name: 'ラワンランバー 24mm 3×8',
    spec: 'フローリング下地',
    unit: '枚',
    quantity: 2,
    calculation: '標準2枚'
  });

  // 巾木 - 壁延長から開口部幅を引く
  // 7現場実績: 10～40m（ソフト巾木または木製巾木）
  const totalWallLength = partitionWallLength + structuralWallLength;
  let habakiLength = Math.ceil(totalWallLength - totalOpeningWidth);
  if (habakiLength <= 0 || isNaN(habakiLength)) {
    habakiLength = 30; // デフォルト30m
  }
  materials.push({
    category: '造作材',
    name: '巾木',
    spec: packageSpecs?.habaki || 'ソフト巾木',
    unit: 'm',
    quantity: Math.max(habakiLength, 10),
    calculation: `壁延長 ${totalWallLength.toFixed(1)}m − 開口部幅 ${totalOpeningWidth.toFixed(1)}m`
  });

  // 天井クロス（量産品番）
  // 7現場実績: 52～75㎡
  materials.push({
    category: '仕上材',
    name: '天井クロス貼り',
    spec: '量産品番',
    unit: '㎡',
    quantity: Math.ceil(ceilingArea),
    calculation: `天井面積 ${ceilingArea.toFixed(1)}㎡`
  });

  // 壁クロス（量産品番）
  // 7現場実績: 187～270㎡
  materials.push({
    category: '仕上材',
    name: '壁クロス貼り',
    spec: '量産品番',
    unit: '㎡',
    quantity: Math.ceil(wallArea),
    calculation: `壁面積 ${wallArea.toFixed(1)}㎡`
  });

  // アクセントクロス（1000番）
  // 7現場実績: 10㎡が標準
  materials.push({
    category: '仕上材',
    name: 'アクセントクロス貼り',
    spec: '1000番',
    unit: '㎡',
    quantity: 10,
    calculation: '標準10㎡'
  });

  // クロス新規下地処理
  materials.push({
    category: '仕上材',
    name: 'クロス新規下地処理',
    spec: '',
    unit: '人工',
    quantity: 2,
    calculation: '標準2人工'
  });

  // ダイノックシート貼り（玄関扉）
  materials.push({
    category: '仕上材',
    name: 'ダイノックシート貼り',
    spec: '玄関扉',
    unit: 'm',
    quantity: 2,
    calculation: '玄関扉'
  });

  // ダイノックシート貼り（窓枠）
  // 7現場実績: 4～5m
  materials.push({
    category: '仕上材',
    name: 'ダイノックシート貼り',
    spec: '窓枠',
    unit: 'm',
    quantity: 5,
    calculation: '窓枠'
  });

  // 建具
  // 7現場実績: Panasonic ベリティス PA型 H2035 または ダイケンリノベセレクション
  materials.push({
    category: '建具',
    name: '建具一式',
    spec: packageSpecs?.doors || 'Panasonic ベリティス',
    unit: '枚',
    quantity: doorCount,
    calculation: `図面から ${doorCount}枚`
  });

  // 下駄箱（トール 2070×800）
  materials.push({
    category: '建具',
    name: '下駄箱',
    spec: 'トール 2070×800 Panasonic ベリティス',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  // 設備関連
  const equipment = data.equipment || {};

  // UB（ユニットバス）
  const ubSize = equipment.ub_size || '1216';
  let ubSpec = packageSpecs?.ub || 'TOTO WT';
  if (ubSize.includes('1616') || ubSize.includes('1618')) {
    ubSpec = packageSpecs?.ub || 'LIXIL リノビオP 1616';
  } else if (ubSize.includes('1317') || ubSize.includes('1418')) {
    ubSpec = packageSpecs?.ub || 'TOTO WT 1317';
  }
  materials.push({
    category: '設備',
    name: 'ユニットバス',
    spec: ubSpec,
    unit: '台',
    quantity: 1,
    calculation: `サイズ: ${ubSize}`
  });

  // キッチン
  const kitchenType = equipment.kitchen || 'I型 2550';
  let kitchenSpec = packageSpecs?.kitchen || 'LIXIL ES 2550 スライド・食洗機あり';
  if (kitchenType.includes('L型')) {
    kitchenSpec = 'LIXIL ES L型 シンク側1800×コンロ側2100 スライド・食洗機あり';
  }
  materials.push({
    category: '設備',
    name: 'システムキッチン本体',
    spec: kitchenSpec,
    unit: '台',
    quantity: 1,
    calculation: kitchenType
  });

  // キッチンパネル
  materials.push({
    category: '設備',
    name: 'キッチンパネル',
    spec: '3×8',
    unit: '枚',
    quantity: 2,
    calculation: '標準2枚'
  });

  // 洗面台
  const washstandSize = equipment.washstand || 'W750';
  let washstandSpec = packageSpecs?.washstand || 'LIXIL EV1000 (D500) フルスライド+三面鏡（スリムLED）ミドルグレード';
  if (washstandSize.includes('640') || washstandSize.includes('600')) {
    washstandSpec = 'TOTO 640角 PWP640N2W';
  }
  materials.push({
    category: '設備',
    name: '洗面化粧台',
    spec: washstandSpec,
    unit: '台',
    quantity: 1,
    calculation: washstandSize
  });

  // 洗面タオルレール
  materials.push({
    category: '設備',
    name: '洗面タオルレール',
    spec: 'カワジュン SC-611-XC',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // 洗濯パン
  materials.push({
    category: '設備',
    name: '洗濯パン',
    spec: 'TOTO 640角 PWP640N2W',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  // 洗濯機横引きトラップ
  materials.push({
    category: '設備',
    name: '洗濯機横引きトラップ',
    spec: 'TOTO PJ2008NW',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // 洗濯機用水栓
  materials.push({
    category: '設備',
    name: '洗濯機用水栓',
    spec: 'LIXIL LF-WJ50KQA',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // ランドリー収納
  materials.push({
    category: '設備',
    name: 'ランドリー収納',
    spec: 'アイカ YCGB51H',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // トイレ
  materials.push({
    category: '設備',
    name: 'トイレ本体',
    spec: packageSpecs?.toilet || 'TOTO 一体型便器ZJ2 (ZR2)',
    unit: '台',
    quantity: 1,
    calculation: 'パッケージ仕様'
  });

  // トイレペーパーホルダー
  materials.push({
    category: '設備',
    name: 'トイレペーパーホルダー',
    spec: 'カワジュン SC-613-XC',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // トイレタオルレール
  materials.push({
    category: '設備',
    name: 'トイレタオルレール',
    spec: 'カワジュン SC-611-XC',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // トイレ吊戸棚
  materials.push({
    category: '設備',
    name: 'トイレ吊戸棚',
    spec: 'ワンド STO-60EN W600×D201×H600',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // 給湯器
  materials.push({
    category: '設備',
    name: '給湯器',
    spec: '20号追い焚き RUF-A2005SAW',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  // マルチリモコン
  materials.push({
    category: '設備',
    name: 'マルチリモコン',
    spec: 'MBC-240V(A)',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  // 収納関連（枕棚+ハンガーパイプ）
  const storages = data.storage || [];
  let closetCount = storages.filter(s => s.type === 'closet' || s.has_makuradana).length;
  if (closetCount === 0) {
    closetCount = 3; // デフォルト3箇所
  }

  materials.push({
    category: '造作材',
    name: '枕棚取付',
    spec: '',
    unit: '箇所',
    quantity: closetCount,
    calculation: `収納 ${closetCount}箇所`
  });

  materials.push({
    category: '造作材',
    name: 'ハンガーパイプ取付',
    spec: '',
    unit: '箇所',
    quantity: closetCount,
    calculation: `収納 ${closetCount}箇所`
  });

  // 床暖房（オプション）
  // フロントエンドから 'あり（1箇所）' や 'あり（2箇所以上）' で送られる
  const hasFloorHeating = (overrides.floor_heating && overrides.floor_heating.includes('あり')) ||
    data.special?.some(s => s.type === 'floor_heating' || s.type === '床暖房');
  if (hasFloorHeating) {
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

  // カーテンレール設置
  materials.push({
    category: '内装材',
    name: 'カーテンレール設置',
    spec: '',
    unit: '箇所',
    quantity: 4,
    calculation: '標準4箇所'
  });

  // カーテンレール ダブル2m
  materials.push({
    category: '内装材',
    name: 'カーテンレール',
    spec: 'ダブル2m ホワイト トーソーAJ606',
    unit: '本',
    quantity: 4,
    calculation: '標準4本'
  });

  // レジスター
  materials.push({
    category: '内装材',
    name: 'レジスター',
    spec: 'Φ150',
    unit: '個',
    quantity: 3,
    calculation: '標準3個'
  });

  // スリーブキャップ
  materials.push({
    category: '内装材',
    name: 'スリーブキャップ',
    spec: 'Φ75 311-313',
    unit: '個',
    quantity: 3,
    calculation: '標準3個'
  });

  // 電気工事
  // 7現場実績: 照明器具が各現場で必須

  // ダウンライト（間取りから推定）
  let downlightCount = 20; // デフォルト2LDK
  const layoutType = data.layout_type || '';
  if (layoutType.includes('3LDK') || layoutType.includes('4LDK')) {
    downlightCount = 30;
  } else if (layoutType.includes('1LDK') || totalFloorArea < 40) {
    downlightCount = 15;
  }
  materials.push({
    category: '電気工事',
    name: 'ダウンライト',
    spec: '非調光 100W 電球色',
    unit: '台',
    quantity: downlightCount,
    calculation: `間取り ${layoutType} から推定`
  });

  // シーリングライト（部屋数+1）
  const ceilingLightCount = Math.max(rooms.length > 0 ? rooms.length + 1 : 4, 3);
  materials.push({
    category: '電気工事',
    name: 'シーリングライト',
    spec: 'ODELIC 調光調色 6～8畳',
    unit: '台',
    quantity: ceilingLightCount,
    calculation: `部屋数 ${rooms.length}室 + 共用部1台`
  });

  // 照明器具取付工事
  materials.push({
    category: '電気工事',
    name: '照明器具取付',
    spec: 'ダウンライト・シーリング含む',
    unit: '式',
    quantity: 1,
    calculation: '全照明取付工事'
  });

  // スイッチ・コンセント工事
  materials.push({
    category: '電気工事',
    name: 'スイッチ・コンセント工事',
    spec: '配線器具一式',
    unit: '式',
    quantity: 1,
    calculation: '全室配線器具'
  });

  // 単室換気扇（水回り用）
  materials.push({
    category: '電気工事',
    name: '単室換気扇',
    spec: '水回り用 三菱 VD-10ZC14',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  // ルームクリーニング
  materials.push({
    category: '諸経費',
    name: 'ルームクリーニング',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  // 検査費
  materials.push({
    category: '諸経費',
    name: '検査費',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

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
