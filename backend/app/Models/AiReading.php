<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiReading extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'reading_json',
        'model_used',
        'input_tokens',
        'output_tokens',
    ];

    protected $casts = [
        'reading_json' => 'array',
        'input_tokens' => 'integer',
        'output_tokens' => 'integer',
    ];

    /**
     * AI解析結果のプロジェクト
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /**
     * 物件名を取得
     */
    public function getPropertyName(): ?string
    {
        return $this->reading_json['property_name'] ?? null;
    }

    /**
     * 間取りタイプを取得
     */
    public function getLayoutType(): ?string
    {
        return $this->reading_json['layout_type'] ?? null;
    }

    /**
     * 部屋情報を取得
     */
    public function getRooms(): array
    {
        return $this->reading_json['rooms'] ?? [];
    }

    /**
     * 開口部情報を取得
     */
    public function getOpenings(): array
    {
        return $this->reading_json['openings'] ?? [];
    }

    /**
     * 設備情報を取得
     */
    public function getEquipment(): array
    {
        return $this->reading_json['equipment'] ?? [];
    }

    /**
     * 収納情報を取得
     */
    public function getStorage(): array
    {
        return $this->reading_json['storage'] ?? [];
    }

    /**
     * 特殊要素を取得
     */
    public function getSpecial(): array
    {
        return $this->reading_json['special'] ?? [];
    }

    /**
     * 総床面積（㎡）を計算
     */
    public function getTotalFloorArea(): float
    {
        $total = 0;
        foreach ($this->getRooms() as $room) {
            $total += $room['area_sqm'] ?? 0;
        }
        return $total;
    }

    /**
     * ドア数をカウント
     */
    public function getDoorCount(): int
    {
        return count(array_filter($this->getOpenings(), fn($o) => $o['type'] === 'door'));
    }

    /**
     * 窓数をカウント
     */
    public function getWindowCount(): int
    {
        return count(array_filter($this->getOpenings(), fn($o) => $o['type'] === 'window'));
    }
}
