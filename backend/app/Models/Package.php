<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Package extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'type',
        'target_layout',
        'base_price',
        'description',
        'specs_json',
    ];

    protected $casts = [
        'specs_json' => 'array',
        'base_price' => 'integer',
    ];

    /**
     * パッケージに紐づくプロジェクト
     */
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    /**
     * 標準仕様を取得
     */
    public function getSpec(string $key, $default = null)
    {
        return $this->specs_json[$key] ?? $default;
    }

    /**
     * スタンダードパッケージの標準仕様
     */
    public static function getStandardSpecs(): array
    {
        return [
            'wall_board' => 'PB 12.5mm 吉野 3×6 両面張り',
            'ceiling_board' => 'PB 9.5mm 吉野 3×6',
            'water_board' => 'Mクロス 12.5mm 3×6 / 7枚固定',
            'wall_base' => '垂木 赤松 KD 30×40 L3000 @303',
            'ceiling_base' => '野縁 30×40 @303',
            'floor' => 'DAIKEN MYオトユカ/MYフロア（直貼り or 二重床）',
            'water_floor_base' => 'ラワンベニヤ 9mm 3×6 / 4枚固定',
            'water_floor_finish' => 'CF（クッションフロア）',
            'baseboard' => '木製巾木 Panasonic ベリティス',
            'wallpaper' => '量産品番 1000番台 @1,150/㎡',
            'door' => 'Panasonic ベリティス PA型 H2035',
            'kitchen' => 'LIXIL ESシリーズ（食洗機あり）',
            'ub' => 'TOTO WT',
            'washstand' => 'LIXIL CLINE / EV / EV1000（三面鏡LED）',
            'toilet' => 'TOTO ZJ2 (ZR2)',
            'floor_heating' => 'なし',
            'air_conditioner' => '壁掛け',
            'entrance_floor' => 'フロアタイル',
            'ceiling_height' => 2400,
        ];
    }

    /**
     * ミドルパッケージの標準仕様
     */
    public static function getMiddleSpecs(): array
    {
        $specs = self::getStandardSpecs();
        $specs['ub'] = 'TOTO WT 1317～';
        $specs['kitchen'] = 'LIXIL ES 2550';
        $specs['floor_heating'] = '電気式床暖房';
        return $specs;
    }

    /**
     * ハイグレードパッケージの標準仕様
     */
    public static function getHighGradeSpecs(): array
    {
        $specs = self::getStandardSpecs();
        $specs['ub'] = 'LIXIL リノビオP（浴室乾燥機あり）';
        $specs['toilet'] = 'Panasonic アラウーノS160';
        $specs['floor_heating'] = 'ガス温水式床暖房';
        $specs['air_conditioner'] = '天カセマルチ';
        $specs['entrance_floor'] = '大理石タイル';
        $specs['floor'] = 'NODA カナエル C12 Jベース';
        return $specs;
    }
}
