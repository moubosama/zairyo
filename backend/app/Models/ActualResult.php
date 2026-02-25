<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActualResult extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'items_json',
        'notes',
    ];

    protected $casts = [
        'items_json' => 'array',
    ];

    /**
     * 実績データのプロジェクト
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * 予測値との差分を計算
     */
    public function calculateDifference(): array
    {
        $materialList = $this->project->materialList;
        if (!$materialList) {
            return [];
        }

        $differences = [];
        $predicted = collect($materialList->items_json)->keyBy('name');
        $actual = collect($this->items_json)->keyBy('name');

        foreach ($actual as $name => $item) {
            $predictedItem = $predicted->get($name);
            if ($predictedItem) {
                $diff = $item['quantity'] - $predictedItem['quantity'];
                $diffPercent = $predictedItem['quantity'] > 0
                    ? round(($diff / $predictedItem['quantity']) * 100, 1)
                    : 0;

                $differences[] = [
                    'name' => $name,
                    'predicted' => $predictedItem['quantity'],
                    'actual' => $item['quantity'],
                    'difference' => $diff,
                    'difference_percent' => $diffPercent,
                ];
            }
        }

        return $differences;
    }
}
