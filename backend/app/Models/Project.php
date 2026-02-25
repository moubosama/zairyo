<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'package_id',
        'plan_image',
        'status',
    ];

    /**
     * プロジェクトのパッケージ
     */
    public function package(): BelongsTo
    {
        return $this->belongsTo(Package::class);
    }

    /**
     * AI解析結果
     */
    public function aiReading(): HasOne
    {
        return $this->hasOne(AiReading::class);
    }

    /**
     * 仕様変更（オーバーライド）
     */
    public function overrides(): HasMany
    {
        return $this->hasMany(Override::class);
    }

    /**
     * 資材リスト
     */
    public function materialList(): HasOne
    {
        return $this->hasOne(MaterialList::class);
    }

    /**
     * 実績データ
     */
    public function actualResult(): HasOne
    {
        return $this->hasOne(ActualResult::class);
    }

    /**
     * 特定のオーバーライド値を取得
     */
    public function getOverride(string $key, $default = null)
    {
        $override = $this->overrides()->where('key', $key)->first();
        return $override ? $override->value : $default;
    }

    /**
     * 最終的な仕様を取得（パッケージ標準 + オーバーライド）
     */
    public function getFinalSpec(string $key)
    {
        // オーバーライドがあればそれを使用
        $override = $this->getOverride($key);
        if ($override !== null) {
            return $override;
        }

        // なければパッケージの標準仕様を使用
        return $this->package->getSpec($key);
    }
}
