<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Override extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'key',
        'value',
    ];

    /**
     * 利用可能なオーバーライドキーと選択肢
     */
    public const AVAILABLE_OVERRIDES = [
        'water_floor_finish' => [
            'question' => '水回りの床はCFでいいですか？',
            'options' => ['CF', 'タイル', '長尺シート'],
            'default' => 'CF',
        ],
        'interior_window' => [
            'question' => '室内窓はありますか？',
            'options' => ['なし', 'あり'],
            'default' => 'なし',
        ],
        'ceiling_height' => [
            'question' => '天井高は？',
            'options' => ['2400mm', '2500mm', '2600mm', 'その他'],
            'default' => '2400mm',
        ],
        'exterior_wall' => [
            'question' => '躯体壁の処理は？',
            'options' => ['GL工法', '木軸ふかし+ボード', '既存利用'],
            'default' => 'GL工法',
        ],
        'floor_heating' => [
            'question' => '床暖房はありますか？',
            'options' => ['なし', 'あり（1箇所）', 'あり（2箇所以上）'],
            'default' => 'なし',
        ],
        'floor_method' => [
            'question' => '床の工法は？',
            'options' => ['直貼り', '二重床（スラブ直床張り）'],
            'default' => '直貼り',
        ],
    ];

    /**
     * オーバーライドのプロジェクト
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * 利用可能なオーバーライド一覧を取得
     */
    public static function getAvailableOverrides(): array
    {
        return self::AVAILABLE_OVERRIDES;
    }
}
