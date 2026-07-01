/**
 * 資材計算サービス
 * 54ファイルの実績データに基づいて最適化された計算ロジック
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 【実績データサマリー（けいとさんの資料より）】
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * | 項目 | 実績範囲 | 固定/変動 | 備考 |
 * |------|----------|-----------|------|
 * | PB 12.5mm | 8〜60枚 | 変動 | 壁面積による |
 * | PB 9.5mm | 8〜40枚 | 変動 | 天井面積による |
 * | Mクロス | 2〜7枚 | 変動 | 水回り面積による |
 * | 垂木 | 10〜30束 | 変動 | 間取りによる |
 * | ラワンベニヤ | 4〜19枚 | 変動 | 水回り+床下地 |
 * | 天井クロス | 52〜75㎡ | 変動 | 天井面積 |
 * | 壁クロス | 187〜270㎡ | 変動 | 壁面積 |
 * | 巾木 | 10〜40m | 変動 | 壁延長−開口部 |
 * | フローリング | 50〜70㎡ | 変動 | 居室床面積 |
 *
 * 物件別実績:
 * - 朝日パリオ305 (2LDK, 620万): PB12.5=40枚, PB9.5=30枚, Mクロス=7枚, 垂木=25束
 * - 別物件ミドル (2LDK, 665万): PB12.5=50枚, PB9.5=35枚, Mクロス=7枚, 垂木=25束
 * - 寿401 HG (2LDK, 735万): PB9.5=30枚, Mクロス=7枚, 垂木=20束
 * - 3LDK 70㎡ (535万): PB12.5=35枚, PB9.5=30枚, Mクロス=7枚, 垂木=20束
 * - 目白テラスドハウス3A (722万): 天井CL=75㎡, 壁CL=270㎡, 巾木=15m
 * - 大型物件: PB12.5=60枚, PB9.5=40枚, 垂木=30束
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
  // AIが直接出力した間仕切壁延長を優先使用
  let partitionWallLength = data.partition_wall_length_m || 0;

  // AIから壁延長が取得できない場合、床面積から推定
  // 実績データ: 2LDK(50㎡)=約20m, 3LDK(70㎡)=約30m
  if (partitionWallLength === 0) {
    partitionWallLength = totalFloorArea * 0.4; // 床面積の0.4倍が目安
  }

  // 間仕切壁延長の妥当性チェック
  // AIが躯体壁（外周壁）を含めて計算している場合、値が大きすぎる
  // 実績: 2LDK(50㎡)=15-25m, 3LDK(70㎡)=20-30m
  // 上限: 床面積の0.45倍 (70㎡なら31.5m)
  // 下限: 床面積の0.25倍 (50㎡なら12.5m)
  const maxPartitionWallLength = totalFloorArea * 0.45;
  const minPartitionWallLength = totalFloorArea * 0.25;

  if (partitionWallLength > maxPartitionWallLength && totalFloorArea > 0) {
    console.log(`間仕切壁延長を補正: ${partitionWallLength}m → ${maxPartitionWallLength}m (AIが躯体壁を含めた可能性)`);
    partitionWallLength = maxPartitionWallLength;
  }
  if (partitionWallLength < minPartitionWallLength && totalFloorArea > 0) {
    console.log(`間仕切壁延長を補正: ${partitionWallLength}m → ${minPartitionWallLength}m (最小値)`);
    partitionWallLength = minPartitionWallLength;
  }

  // 躯体壁（外周壁）の延長を推定
  // リノベでは躯体壁にもクロスを貼る（GL工法で片面のみ）
  // マンションの外周 ≒ sqrt(床面積) × 4.5 として推定（長方形の部屋が多いため補正）
  // 7現場実績: 壁クロス187～270㎡を満たすよう調整
  let structuralWallLength = Math.sqrt(totalFloorArea) * 4.5;

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
  // 間仕切壁: 両面にボードを貼る（係数2）
  // 躯体壁: GL工法で片面のみ（係数1）
  // 壁面積 = (間仕切壁延長 × 天井高 × 2) + (躯体壁延長 × 天井高 × 1) − 開口部面積

  let wallArea = (partitionWallLength * ceilingHeight * 2) + (structuralWallLength * ceilingHeight * 1) - openingArea;

  // 壁面積が計算できない場合、床面積から推定
  // 7現場実績: 壁クロス187～270㎡ → 床面積の約4倍
  if (wallArea <= 0 || isNaN(wallArea)) {
    wallArea = totalFloorArea > 0 ? totalFloorArea * 4 : 200;
  }

  // 7現場実績に基づく範囲チェック
  // 最小: 床面積の3.5倍（50㎡なら175㎡）
  // 最大: 床面積の5.5倍（50㎡なら275㎡）
  const minWallArea = totalFloorArea * 3.5;
  const maxWallArea = totalFloorArea * 5.5;

  if (wallArea < minWallArea && totalFloorArea > 0) {
    wallArea = minWallArea;
  }
  if (wallArea > maxWallArea && totalFloorArea > 0) {
    wallArea = maxWallArea;
  }

  // --- 資材計算 ---

  // PB 12.5mm (壁用) - ロス率+5%
  // 54ファイル実績: 8〜60枚（壁面積による）
  // - 小型物件: 8〜15枚
  // - 2LDK: 30〜50枚
  // - 3LDK: 40〜60枚
  let pb125Sheets = Math.ceil((wallArea / PB_SHEET_SIZE) * 1.05);
  // 実績に基づく範囲制限: 8〜60枚
  pb125Sheets = Math.min(Math.max(pb125Sheets, 8), 60);
  materials.push({
    category: '下地材',
    name: 'PB 12.5mm 吉野 3×6',
    spec: '910×1820mm',
    unit: '枚',
    quantity: pb125Sheets,
    calculation: `壁面積 ${wallArea.toFixed(1)}㎡ ÷ ${PB_SHEET_SIZE}㎡ × 1.05（8〜60枚）`
  });

  // PB 9.5mm (天井用) - ロス率+5%
  // 54ファイル実績: 8〜40枚（天井面積に依存）
  // - 小型物件: 8〜15枚
  // - 2LDK: 20〜35枚
  // - 3LDK: 30〜40枚
  let pb95Sheets = Math.ceil((ceilingArea / PB_SHEET_SIZE) * 1.05);
  // 実績に基づく範囲制限: 8〜40枚
  pb95Sheets = Math.min(Math.max(pb95Sheets, 8), 40);
  materials.push({
    category: '下地材',
    name: 'PB 9.5mm 吉野 3×6',
    spec: '910×1820mm',
    unit: '枚',
    quantity: pb95Sheets,
    calculation: `天井面積 ${ceilingArea.toFixed(1)}㎡ ÷ ${PB_SHEET_SIZE}㎡ × 1.05（8〜40枚）`
  });

  // Mクロス (水回りボード)
  // 54ファイル実績: 2〜7枚（水回り面積による）
  // 計算式: 水回り壁面積から算出
  // 水回り = 洗面室(約2㎡) + トイレ(約1㎡) + 脱衣室(約1.5㎡)
  // 壁面積 ≒ 水回り床面積 × 周囲長係数(3) × 天井高(2.4) ÷ ボードサイズ
  let mCrossSheets = 7; // デフォルト最大値
  if (cfArea > 0) {
    // 水回り床面積が小さい場合は枚数を減らす
    const waterWallArea = cfArea * 3 * ceilingHeight;
    mCrossSheets = Math.ceil((waterWallArea / PB_SHEET_SIZE) * 1.05);
    mCrossSheets = Math.min(Math.max(mCrossSheets, 2), 7); // 2〜7枚の範囲
  }
  materials.push({
    category: '下地材',
    name: 'Mクロス 12.5mm 3×6',
    spec: '耐水ボード',
    unit: '枚',
    quantity: mCrossSheets,
    calculation: `水回り面積 ${cfArea.toFixed(1)}㎡から算出（2〜7枚）`
  });

  // 垂木 (赤松KD 30×40 L3000 入数12)
  // 54ファイル実績: 10〜30束
  // 計算式: (間仕切壁延長÷0.303×2 + 天井面積÷0.303) ÷ 12
  // 間取り別目安: 1LDK=10-15束, 2LDK=20-25束, 3LDK=25-30束
  let tarukiBundles = 20; // デフォルト20束
  if (partitionWallLength > 0 || ceilingArea > 0) {
    const tarukiCount = ((partitionWallLength / 0.303 * 2) + (ceilingArea / 0.303)) / TARUKI_PER_BUNDLE;
    tarukiBundles = Math.ceil(tarukiCount);
    if (isNaN(tarukiBundles) || tarukiBundles <= 0) {
      tarukiBundles = 20;
    }
    // 実績に基づく範囲制限: 10〜30束
    tarukiBundles = Math.min(Math.max(tarukiBundles, 10), 30);
  }
  materials.push({
    category: '下地材',
    name: '垂木 赤松KD 30×40 L3000',
    spec: '入数12本/束',
    unit: '束',
    quantity: tarukiBundles,
    calculation: `壁下地 + 天井下地 @303ピッチ（10〜30束）`
  });

  // フローリング - ロス率+10%
  // 54ファイル実績: 50〜70㎡（間取りによる）
  // - 1LDK: 約40㎡
  // - 2LDK: 50〜55㎡
  // - 3LDK: 60〜70㎡
  let flooringQty = Math.ceil(flooringArea * 1.1 * 10) / 10;
  // 最低50㎡、最大70㎡（ロス込み）
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

  // ラワンベニヤ 9mm 3×6 (水回りフロアタイル下地 + 床暖房下地 + フローリング下地更新)
  // 54ファイル実績: 4〜19枚（用途により変動）
  // - 水回りリフロアタイル下地: 4〜5枚
  // - 床暖房新規導入下地: 3〜4枚
  // - フローリング下地更新: 5〜12枚
  let rawanSheets = Math.max(Math.ceil((cfArea / PB_SHEET_SIZE) * 1.1), 4);
  // 床暖房がある場合は追加
  const hasFloorHeatingForRawan = (overrides.floor_heating && overrides.floor_heating.includes('あり')) ||
    data.special?.some(s => s.type === 'floor_heating' || s.type === '床暖房');
  if (hasFloorHeatingForRawan) {
    rawanSheets += 3; // 床暖房下地用
  }
  // 大型物件（70㎡以上）はフローリング下地更新分を追加
  if (totalFloorArea >= 70) {
    rawanSheets += 5;
  }
  // 実績に基づく範囲制限: 4〜19枚
  rawanSheets = Math.min(Math.max(rawanSheets, 4), 19);
  materials.push({
    category: '下地材',
    name: 'ラワンベニヤ 9mm 3×6',
    spec: '水回りフロアタイル下地',
    unit: '枚',
    quantity: rawanSheets,
    calculation: `水回り+床暖房+下地更新（4〜19枚）`
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
  // 54ファイル実績: 10〜40m（ソフト巾木または木製巾木）
  // 注意: 30m固定ではなく、間取りにより大きく変動
  // - 1LDK: 10〜15m
  // - 2LDK: 20〜30m
  // - 3LDK: 30〜40m
  const totalWallLength = partitionWallLength + structuralWallLength;
  let habakiLength = Math.ceil(totalWallLength - totalOpeningWidth);
  const layoutTypeForHabaki = data.layout_type || '';
  if (habakiLength <= 0 || isNaN(habakiLength)) {
    // 間取りから推定
    if (layoutTypeForHabaki.includes('3LDK') || layoutTypeForHabaki.includes('4LDK')) {
      habakiLength = 35;
    } else if (layoutTypeForHabaki.includes('2LDK')) {
      habakiLength = 25;
    } else if (layoutTypeForHabaki.includes('1LDK')) {
      habakiLength = 15;
    } else {
      habakiLength = 25; // デフォルト
    }
  }
  // 実績に基づく範囲制限: 10〜40m
  habakiLength = Math.min(Math.max(habakiLength, 10), 40);
  materials.push({
    category: '造作材',
    name: '巾木',
    spec: packageSpecs?.habaki || 'ソフト巾木',
    unit: 'm',
    quantity: habakiLength,
    calculation: `壁延長 ${totalWallLength.toFixed(1)}m − 開口部幅 ${totalOpeningWidth.toFixed(1)}m（10〜40m）`
  });

  // 天井クロス（量産品番）
  // 54ファイル実績: 52〜75㎡
  // 範囲制限を適用
  let ceilingClothArea = Math.ceil(ceilingArea);
  ceilingClothArea = Math.min(Math.max(ceilingClothArea, 52), 75);
  materials.push({
    category: '仕上材',
    name: '天井クロス貼り',
    spec: '量産品番',
    unit: '㎡',
    quantity: ceilingClothArea,
    calculation: `天井面積 ${ceilingArea.toFixed(1)}㎡（52〜75㎡）`
  });

  // 壁クロス（量産品番）
  // 54ファイル実績: 187〜270㎡
  // 範囲制限を適用
  let wallClothArea = Math.ceil(wallArea);
  wallClothArea = Math.min(Math.max(wallClothArea, 187), 270);
  materials.push({
    category: '仕上材',
    name: '壁クロス貼り',
    spec: '量産品番',
    unit: '㎡',
    quantity: wallClothArea,
    calculation: `壁面積 ${wallArea.toFixed(1)}㎡（187〜270㎡）`
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
  // 54ファイル実績: 1216, 1317, 1416, 1418 の4サイズが多い
  const ubSize = equipment.ub_size || '1216';
  let ubSpec = packageSpecs?.ub || 'TOTO WT';
  if (ubSize.includes('1616') || ubSize.includes('1618')) {
    ubSpec = packageSpecs?.ub || 'LIXIL リノビオP 1616 電気式浴室乾燥機あり 1面アクセントパネル';
  } else if (ubSize.includes('1418')) {
    ubSpec = packageSpecs?.ub || 'LIXIL リノビオP 1418';
  } else if (ubSize.includes('1416')) {
    ubSpec = packageSpecs?.ub || 'TOTO WT 1416';
  } else if (ubSize.includes('1317')) {
    ubSpec = packageSpecs?.ub || 'TOTO WT 1317';
  } else {
    ubSpec = packageSpecs?.ub || 'TOTO WT 1216';
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 【追加項目】54ファイル実績から確認された必須項目
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // === 解体工事 ===
  materials.push({
    category: '解体工事',
    name: '解体工事 表層 設備・建具',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '1式'
  });

  materials.push({
    category: '解体工事',
    name: '解体工事 表層 フローリング・カーペット',
    spec: '',
    unit: '式',
    quantity: 1.5,
    calculation: '1.5式'
  });

  materials.push({
    category: '解体工事',
    name: '解体廃材処分 表層 設備・建具',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '1式'
  });

  materials.push({
    category: '解体工事',
    name: '解体廃材処分 表層 フローリング・カーペット',
    spec: '',
    unit: '式',
    quantity: 1.5,
    calculation: '1.5式'
  });

  // === 仮設工事 ===
  materials.push({
    category: '仮設工事',
    name: '養生費',
    spec: '',
    unit: '基',
    quantity: 2,
    calculation: '標準2基'
  });

  // === 左官・タイル工事 ===
  materials.push({
    category: '左官工事',
    name: '玄関土間左官補修',
    spec: '',
    unit: '箇所',
    quantity: 1,
    calculation: '標準1箇所'
  });

  materials.push({
    category: '左官工事',
    name: '床左官補修',
    spec: 'レベラー無し',
    unit: '箇所',
    quantity: 1,
    calculation: '標準1箇所'
  });

  // === 大工工事（単価項目） ===
  // 天井下地工事
  materials.push({
    category: '大工工事',
    name: '天井下地',
    spec: 'PB9.5mm',
    unit: '㎡',
    quantity: Math.ceil(ceilingArea),
    calculation: `天井面積 ${ceilingArea.toFixed(1)}㎡`
  });

  // 壁下地工事
  materials.push({
    category: '大工工事',
    name: '壁下地',
    spec: 'PB12.5mm ※外周壁は既存下地',
    unit: '㎡',
    quantity: Math.ceil(wallArea * 0.3), // 間仕切壁部分のみ（約30%）
    calculation: `間仕切壁部分 約${(wallArea * 0.3).toFixed(1)}㎡`
  });

  // 玄関上がり框取付
  materials.push({
    category: '大工工事',
    name: '玄関上がり框取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  // 壁下地補強ベニヤ・合板貼り
  materials.push({
    category: '大工工事',
    name: '壁下地補強ベニヤ・合板貼り',
    spec: '',
    unit: '㎡',
    quantity: 10,
    calculation: '標準10㎡'
  });

  // 窓枠交換
  materials.push({
    category: '大工工事',
    name: '窓枠交換',
    spec: '',
    unit: '㎡',
    quantity: 1,
    calculation: '標準1㎡'
  });

  // === 設備工事 ===
  materials.push({
    category: '設備工事',
    name: '給排水配管部分更新',
    spec: '間仕切り残し同位置廻給排水',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: 'UB接続',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: '給湯器取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: 'トイレ取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: '洗面化粧台取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: '洗面所アクセサリー取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: '洗濯機パン取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: 'キッチンダクト配管工事',
    spec: '銀フレキ',
    unit: 'm',
    quantity: 3,
    calculation: '標準3m'
  });

  materials.push({
    category: '設備工事',
    name: 'トイレ・洗面・浴室ダクト配管工事',
    spec: 'アルミフレキ',
    unit: 'm',
    quantity: 2,
    calculation: '標準2m'
  });

  materials.push({
    category: '設備工事',
    name: '水回り用単室換気扇交換',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '設備工事',
    name: 'エアコンスリーブキャップ取付',
    spec: '',
    unit: '箇所',
    quantity: 3,
    calculation: '標準3箇所'
  });

  // === ガス工事 ===
  materials.push({
    category: 'ガス工事',
    name: '既存ガス管撤去',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: 'ガス工事',
    name: '新規ガス管基本工事費',
    spec: 'コック20A付',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: 'ガス工事',
    name: 'ガス新規配管',
    spec: '白ガス、フレキ対',
    unit: 'm',
    quantity: 3,
    calculation: '標準3m'
  });

  materials.push({
    category: 'ガス工事',
    name: 'ガスコンロ繋ぎ',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: 'ガス工事',
    name: '給湯器繋ぎ',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  // === 電気工事（追加項目） ===
  materials.push({
    category: '電気工事',
    name: '電気部分新規配線',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '分電盤交換',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: 'ダウンライト追加配線',
    spec: '',
    unit: '箇所',
    quantity: 6,
    calculation: '標準6箇所'
  });

  materials.push({
    category: '電気工事',
    name: '食洗機用専用回路追加',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '浴室換気乾燥機専用回路追加',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '人感センサー・DL連光器設置',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: 'モニターホン取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '給湯器リモコン取付',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: 'レジスタ取付',
    spec: '',
    unit: '箇所',
    quantity: 3,
    calculation: '標準3箇所'
  });

  materials.push({
    category: '電気工事',
    name: '照明器具付け',
    spec: '開梱姿図',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電気工事',
    name: '火災報知器取付',
    spec: '電池式',
    unit: '個',
    quantity: 4,
    calculation: '標準4個'
  });

  // === 電材 ===
  materials.push({
    category: '電材',
    name: '配線器具一式',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '電材',
    name: 'TV端子',
    spec: '',
    unit: '個',
    quantity: 4,
    calculation: '標準4個'
  });

  materials.push({
    category: '電材',
    name: '人感スイッチ',
    spec: 'コスモ WTK1811WK',
    unit: '個',
    quantity: 1,
    calculation: '標準1個'
  });

  materials.push({
    category: '電材',
    name: '両切スイッチダウンライト 100W 電球色',
    spec: 'OD261898',
    unit: '台',
    quantity: 20,
    calculation: '標準20台'
  });

  materials.push({
    category: '電材',
    name: '調光器',
    spec: 'OL291216R 2700K電球色 L600',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  materials.push({
    category: '電材',
    name: 'テレビドアホン',
    spec: 'Panasonic VL-SE30XL',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  materials.push({
    category: '電材',
    name: '分電盤',
    spec: 'テンパール MAG35122 住宅用分電盤(2ケ付、横三列タイプ、単3、12+2、50A)',
    unit: '台',
    quantity: 1,
    calculation: '標準1台'
  });

  materials.push({
    category: '電材',
    name: '火災報知器（熱）',
    spec: 'SHK48455K',
    unit: '個',
    quantity: 3,
    calculation: '標準3個'
  });

  materials.push({
    category: '電材',
    name: '火災報知器（煙）',
    spec: 'SHK48155K',
    unit: '個',
    quantity: 2,
    calculation: '標準2個'
  });

  // === サッシ工事 ===
  materials.push({
    category: 'サッシ工事',
    name: '網戸張替え',
    spec: '',
    unit: '枚',
    quantity: 4,
    calculation: '標準4枚'
  });

  // === 現場管理 ===
  materials.push({
    category: '現場管理',
    name: '施工管理費（工程管理）',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
  });

  materials.push({
    category: '現場管理',
    name: '現場諸経費',
    spec: '',
    unit: '式',
    quantity: 1,
    calculation: '標準1式'
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
      total_floor_area: totalFloorArea,
      floor_area: flooringArea,
      water_floor_area: cfArea,
      tile_area: tileArea,
      wall_area: wallArea,
      ceiling_area: ceilingArea,
      door_count: doorCount,
      window_count: windowCount,
      partition_wall_length: partitionWallLength,
      structural_wall_length: structuralWallLength
    }
  };
}
