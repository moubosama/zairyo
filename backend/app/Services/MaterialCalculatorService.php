<?php

namespace App\Services;

use App\Models\Project;
use App\Models\AiReading;
use Exception;

class MaterialCalculatorService
{
    // 3×6板の面積（mm→㎡）: 910mm × 1820mm = 1.6562㎡
    private const BOARD_AREA_SQM = 1.6562;

    // ロス率
    private const LOSS_RATE_PB = 1.05;      // +5%
    private const LOSS_RATE_FLOOR = 1.10;   // +10%

    // 固定値（3現場実績から確定）
    private const FIXED_M_CLOTH = 7;         // Mクロス: 7枚
    private const FIXED_LAUAN = 4;           // ラワンベニヤ: 4枚
    private const FIXED_BASEBOARD = 30;      // 巾木: 約30m

    // 下地ピッチ
    private const BASE_PITCH = 0.303;        // @303mm

    // 開口部標準サイズ
    private const DOOR_WIDTH = 0.8;          // 800mm
    private const DOOR_HEIGHT = 2.0;         // 2000mm
    private const WINDOW_WIDTH = 1.5;        // 1500mm
    private const WINDOW_HEIGHT = 1.2;       // 1200mm

    private Project $project;
    private AiReading $aiReading;
    private array $specs;

    /**
     * 資材を計算
     */
    public function calculate(Project $project): array
    {
        $this->project = $project;
        $this->aiReading = $project->aiReading;
        $this->specs = $project->package->specs_json;

        if (!$this->aiReading) {
            throw new Exception('AI解析結果がありません');
        }

        $materials = [];

        // 面積計算
        $areas = $this->calculateAreas();

        // 壁材
        $materials = array_merge($materials, $this->calculateWallMaterials($areas));

        // 天井材
        $materials = array_merge($materials, $this->calculateCeilingMaterials($areas));

        // 床材
        $materials = array_merge($materials, $this->calculateFloorMaterials($areas));

        // 下地材
        $materials = array_merge($materials, $this->calculateBaseMaterials($areas));

        // 仕上げ材
        $materials = array_merge($materials, $this->calculateFinishMaterials($areas));

        // 建具
        $materials = array_merge($materials, $this->calculateDoors());

        // 固定資材
        $materials = array_merge($materials, $this->calculateFixedMaterials());

        // 設備
        $materials = array_merge($materials, $this->calculateEquipment());

        return [
            'items' => $materials,
            'areas' => $areas,
        ];
    }

    /**
     * 各種面積を計算
     */
    private function calculateAreas(): array
    {
        $rooms = $this->aiReading->getRooms();
        $openings = $this->aiReading->getOpenings();
        $ceilingHeight = $this->getCeilingHeight();

        // 部屋タイプ別の面積
        $floorArea = 0;        // 居室床面積
        $waterFloorArea = 0;   // 水回り床面積
        $ceilingArea = 0;      // 天井面積（UB・CL除く）
        $wallLength = 0;       // 間仕切壁延長
        $structuralWallLength = 0; // 躯体壁延長

        foreach ($rooms as $room) {
            $area = $room['area_sqm'] ?? 0;
            $name = $room['name'] ?? '';
            $isWaterArea = $this->isWaterArea($name);
            $isCloset = $this->isCloset($name);
            $isUB = $this->isUB($name);

            if ($isWaterArea) {
                $waterFloorArea += $area;
            } else {
                $floorArea += $area;
            }

            // 天井面積（UB・CLを除く）
            if (!$isUB && !$isCloset) {
                $ceilingArea += $area;
            }

            // 壁延長を計算（部屋の周長）
            $width = ($room['width_mm'] ?? 0) / 1000;
            $depth = ($room['depth_mm'] ?? 0) / 1000;
            if ($width > 0 && $depth > 0) {
                $perimeter = ($width + $depth) * 2;
                if (($room['wall_type'] ?? '') === 'structural') {
                    $structuralWallLength += $perimeter;
                } else {
                    $wallLength += $perimeter;
                }
            }
        }

        // 開口部面積を計算
        $openingArea = $this->calculateOpeningArea($openings);
        $openingWidth = $this->calculateOpeningWidth($openings);

        // 壁面積計算
        // 壁面積 = (間仕切壁延長 × 天井高 × 2) + (躯体壁延長 × 天井高 × 1) − 開口部面積
        $wallArea = ($wallLength * $ceilingHeight * 2)
            + ($structuralWallLength * $ceilingHeight * 1)
            - $openingArea;
        $wallArea = max(0, $wallArea);

        return [
            'floor_area' => round($floorArea, 2),
            'water_floor_area' => round($waterFloorArea, 2),
            'ceiling_area' => round($ceilingArea, 2),
            'wall_area' => round($wallArea, 2),
            'wall_length' => round($wallLength + $structuralWallLength, 2),
            'opening_area' => round($openingArea, 2),
            'opening_width' => round($openingWidth, 2),
            'ceiling_height' => $ceilingHeight,
        ];
    }

    /**
     * 開口部面積を計算
     */
    private function calculateOpeningArea(array $openings): float
    {
        $area = 0;
        foreach ($openings as $opening) {
            $type = $opening['type'] ?? '';
            if ($type === 'door' || $type === 'sliding_door' || $type === 'folding_door') {
                $width = ($opening['width_mm'] ?? (self::DOOR_WIDTH * 1000)) / 1000;
                $height = ($opening['height_mm'] ?? (self::DOOR_HEIGHT * 1000)) / 1000;
                $area += $width * $height;
            } elseif ($type === 'window') {
                $width = ($opening['width_mm'] ?? (self::WINDOW_WIDTH * 1000)) / 1000;
                $height = ($opening['height_mm'] ?? (self::WINDOW_HEIGHT * 1000)) / 1000;
                $area += $width * $height;
            }
        }
        return $area;
    }

    /**
     * 開口部幅合計を計算
     */
    private function calculateOpeningWidth(array $openings): float
    {
        $width = 0;
        foreach ($openings as $opening) {
            $w = ($opening['width_mm'] ?? 800) / 1000;
            $width += $w;
        }
        return $width;
    }

    /**
     * 天井高を取得
     */
    private function getCeilingHeight(): float
    {
        // オーバーライドを確認
        $override = $this->project->getOverride('ceiling_height');
        if ($override) {
            // "2400mm" → 2.4
            return (float)preg_replace('/[^0-9]/', '', $override) / 1000;
        }

        // パッケージの標準値
        return ($this->specs['ceiling_height'] ?? 2400) / 1000;
    }

    /**
     * 壁材を計算
     */
    private function calculateWallMaterials(array $areas): array
    {
        $wallArea = $areas['wall_area'];

        // PB 12.5mm（壁用）
        $pb125Count = ceil(($wallArea / self::BOARD_AREA_SQM) * self::LOSS_RATE_PB);

        return [
            [
                'category' => '壁',
                'name' => 'PB 12.5',
                'spec' => '吉野 3×6',
                'quantity' => (int)$pb125Count,
                'unit' => '枚',
                'notes' => '壁面積から算出',
                'calculation' => sprintf('%.2f㎡ ÷ %.4f × %.2f', $wallArea, self::BOARD_AREA_SQM, self::LOSS_RATE_PB),
            ],
        ];
    }

    /**
     * 天井材を計算
     */
    private function calculateCeilingMaterials(array $areas): array
    {
        $ceilingArea = $areas['ceiling_area'];

        // PB 9.5mm（天井用）
        $pb95Count = ceil(($ceilingArea / self::BOARD_AREA_SQM) * self::LOSS_RATE_PB);

        return [
            [
                'category' => '天井',
                'name' => 'PB 9.5',
                'spec' => '吉野 3×6',
                'quantity' => (int)$pb95Count,
                'unit' => '枚',
                'notes' => '天井面積から算出',
                'calculation' => sprintf('%.2f㎡ ÷ %.4f × %.2f', $ceilingArea, self::BOARD_AREA_SQM, self::LOSS_RATE_PB),
            ],
        ];
    }

    /**
     * 床材を計算
     */
    private function calculateFloorMaterials(array $areas): array
    {
        $materials = [];

        // フローリング（居室）
        $floorArea = $areas['floor_area'];
        $flooringArea = round($floorArea * self::LOSS_RATE_FLOOR, 1);
        $materials[] = [
            'category' => '床',
            'name' => 'フローリング',
            'spec' => 'DAIKEN',
            'quantity' => $flooringArea,
            'unit' => '㎡',
            'notes' => '+10%ロス込',
            'calculation' => sprintf('%.2f㎡ × %.2f', $floorArea, self::LOSS_RATE_FLOOR),
        ];

        // CF（水回り）
        $waterFloorFinish = $this->project->getFinalSpec('water_floor_finish') ?? 'CF';
        if ($waterFloorFinish === 'CF' || $waterFloorFinish === 'CF（クッションフロア）') {
            $waterFloorArea = $areas['water_floor_area'];
            $cfArea = round($waterFloorArea * self::LOSS_RATE_FLOOR, 1);
            $materials[] = [
                'category' => '床',
                'name' => 'CF',
                'spec' => 'クッションフロア',
                'quantity' => $cfArea,
                'unit' => '㎡',
                'notes' => '+10%ロス込',
                'calculation' => sprintf('%.2f㎡ × %.2f', $waterFloorArea, self::LOSS_RATE_FLOOR),
            ];
        }

        return $materials;
    }

    /**
     * 下地材を計算
     */
    private function calculateBaseMaterials(array $areas): array
    {
        $wallLength = $areas['wall_length'];
        $ceilingArea = $areas['ceiling_area'];

        // 垂木（束）計算
        // (間仕切壁延長÷0.303×2 + 天井面積÷0.303) ÷ 12
        $taruCount = ceil(
            (($wallLength / self::BASE_PITCH * 2) + ($ceilingArea / self::BASE_PITCH)) / 12
        );

        return [
            [
                'category' => '下地',
                'name' => '垂木',
                'spec' => '赤松 KD 30×40',
                'quantity' => (int)$taruCount,
                'unit' => '束',
                'notes' => '@303ピッチで算出',
                'calculation' => sprintf('((%.2fm ÷ %.3f × 2) + (%.2f㎡ ÷ %.3f)) ÷ 12', $wallLength, self::BASE_PITCH, $ceilingArea, self::BASE_PITCH),
            ],
        ];
    }

    /**
     * 仕上げ材を計算
     */
    private function calculateFinishMaterials(array $areas): array
    {
        $materials = [];

        // 壁クロス
        $wallClothArea = $areas['wall_area'];
        $materials[] = [
            'category' => '仕上げ',
            'name' => 'クロス（壁）',
            'spec' => '量産品',
            'quantity' => round($wallClothArea, 1),
            'unit' => '㎡',
            'notes' => '壁面積',
        ];

        // 天井クロス
        $ceilingClothArea = $areas['ceiling_area'];
        $materials[] = [
            'category' => '仕上げ',
            'name' => 'クロス（天井）',
            'spec' => '量産品',
            'quantity' => round($ceilingClothArea, 1),
            'unit' => '㎡',
            'notes' => '天井面積',
        ];

        // 巾木
        $baseboardLength = min(
            $areas['wall_length'] - $areas['opening_width'],
            self::FIXED_BASEBOARD
        );
        $baseboardLength = max($baseboardLength, self::FIXED_BASEBOARD); // 約30mで固定
        $materials[] = [
            'category' => '仕上げ',
            'name' => '巾木',
            'spec' => '木製巾木 Panasonic ベリティス',
            'quantity' => round($baseboardLength, 1),
            'unit' => 'm',
            'notes' => '壁延長 − 開口部幅（≈30m）',
        ];

        return $materials;
    }

    /**
     * 建具を計算
     */
    private function calculateDoors(): array
    {
        $openings = $this->aiReading->getOpenings();
        $doorCount = 0;
        $slidingDoorCount = 0;
        $foldingDoorCount = 0;

        foreach ($openings as $opening) {
            $type = $opening['type'] ?? '';
            switch ($type) {
                case 'door':
                    $doorCount++;
                    break;
                case 'sliding_door':
                    $slidingDoorCount++;
                    break;
                case 'folding_door':
                    $foldingDoorCount++;
                    break;
            }
        }

        $materials = [];

        if ($doorCount > 0) {
            $materials[] = [
                'category' => '建具',
                'name' => '開き戸',
                'spec' => 'Panasonic ベリティス',
                'quantity' => $doorCount,
                'unit' => '枚',
                'notes' => '図面から自動カウント',
            ];
        }

        if ($slidingDoorCount > 0) {
            $materials[] = [
                'category' => '建具',
                'name' => '引戸',
                'spec' => 'Panasonic ベリティス',
                'quantity' => $slidingDoorCount,
                'unit' => '枚',
                'notes' => '図面から自動カウント',
            ];
        }

        if ($foldingDoorCount > 0) {
            $materials[] = [
                'category' => '建具',
                'name' => '折戸',
                'spec' => 'Panasonic ベリティス',
                'quantity' => $foldingDoorCount,
                'unit' => '枚',
                'notes' => '図面から自動カウント',
            ];
        }

        return $materials;
    }

    /**
     * 固定資材を計算
     */
    private function calculateFixedMaterials(): array
    {
        return [
            [
                'category' => '壁',
                'name' => 'Mクロス',
                'spec' => '12.5mm 3×6',
                'quantity' => self::FIXED_M_CLOTH,
                'unit' => '枚',
                'notes' => '洗面室+トイレ（固定）',
            ],
            [
                'category' => '床',
                'name' => 'ラワンベニヤ',
                'spec' => '9mm 3×6',
                'quantity' => self::FIXED_LAUAN,
                'unit' => '枚',
                'notes' => '水回り床下地（固定）',
            ],
        ];
    }

    /**
     * 設備を計算
     */
    private function calculateEquipment(): array
    {
        $equipment = $this->aiReading->getEquipment();
        $materials = [];

        // UB
        $ubSize = $equipment['ub_size'] ?? '1317';
        $ubSpec = $this->specs['ub'] ?? 'TOTO WT';
        $materials[] = [
            'category' => '設備',
            'name' => 'ユニットバス',
            'spec' => $ubSpec . ' ' . $ubSize,
            'quantity' => 1,
            'unit' => '台',
            'notes' => 'パッケージによる',
        ];

        // キッチン
        $kitchenType = $equipment['kitchen'] ?? 'I型 2550';
        $kitchenSpec = $this->specs['kitchen'] ?? 'LIXIL ESシリーズ';
        $materials[] = [
            'category' => '設備',
            'name' => 'キッチン',
            'spec' => $kitchenSpec . ' ' . $kitchenType,
            'quantity' => 1,
            'unit' => '台',
            'notes' => 'パッケージによる',
        ];

        // 洗面台
        $washstandSize = $equipment['washstand'] ?? 'W750';
        $washstandSpec = $this->specs['washstand'] ?? 'LIXIL CLINE';
        $materials[] = [
            'category' => '設備',
            'name' => '洗面台',
            'spec' => $washstandSpec . ' ' . $washstandSize,
            'quantity' => 1,
            'unit' => '台',
            'notes' => 'パッケージによる',
        ];

        // トイレ
        $toiletSpec = $this->specs['toilet'] ?? 'TOTO ZJ2';
        $materials[] = [
            'category' => '設備',
            'name' => 'トイレ',
            'spec' => $toiletSpec,
            'quantity' => 1,
            'unit' => '台',
            'notes' => 'パッケージによる',
        ];

        return $materials;
    }

    /**
     * 水回りエリアかどうかを判定
     */
    private function isWaterArea(string $roomName): bool
    {
        $waterRooms = ['洗面', '脱衣', 'トイレ', 'WC', 'UB', '浴室', 'バス'];
        foreach ($waterRooms as $water) {
            if (str_contains($roomName, $water)) {
                return true;
            }
        }
        return false;
    }

    /**
     * クローゼットかどうかを判定
     */
    private function isCloset(string $roomName): bool
    {
        $closetNames = ['CL', 'クローゼット', 'WIC', 'ウォークイン', '収納', '押入', '納戸'];
        foreach ($closetNames as $name) {
            if (str_contains($roomName, $name)) {
                return true;
            }
        }
        return false;
    }

    /**
     * UBかどうかを判定
     */
    private function isUB(string $roomName): bool
    {
        $ubNames = ['UB', '浴室', 'バス', 'ユニットバス'];
        foreach ($ubNames as $name) {
            if (str_contains($roomName, $name)) {
                return true;
            }
        }
        return false;
    }
}
