<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MaterialList extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'items_json',
        'total_wall_area',
        'total_ceiling_area',
        'total_floor_area',
    ];

    protected $casts = [
        'items_json' => 'array',
        'total_wall_area' => 'decimal:2',
        'total_ceiling_area' => 'decimal:2',
        'total_floor_area' => 'decimal:2',
    ];

    /**
     * 資材リストのプロジェクト
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * カテゴリ別に資材を取得
     */
    public function getItemsByCategory(string $category): array
    {
        return array_filter($this->items_json ?? [], fn($item) => $item['category'] === $category);
    }

    /**
     * 全カテゴリを取得
     */
    public function getCategories(): array
    {
        $categories = [];
        foreach ($this->items_json ?? [] as $item) {
            if (!in_array($item['category'], $categories)) {
                $categories[] = $item['category'];
            }
        }
        return $categories;
    }

    /**
     * Excel出力用のデータ形式に変換
     */
    public function toExcelFormat(): array
    {
        $data = [];
        $data[] = ['カテゴリ', '資材名', '規格', '数量', '単位', '備考'];

        foreach ($this->items_json ?? [] as $item) {
            $data[] = [
                $item['category'] ?? '',
                $item['name'] ?? '',
                $item['spec'] ?? '',
                $item['quantity'] ?? '',
                $item['unit'] ?? '',
                $item['notes'] ?? '',
            ];
        }

        return $data;
    }
}
