<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('material_lists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->onDelete('cascade');
            $table->json('items_json'); // 計算された資材リスト
            $table->decimal('total_wall_area', 10, 2)->nullable(); // 壁面積（㎡）
            $table->decimal('total_ceiling_area', 10, 2)->nullable(); // 天井面積（㎡）
            $table->decimal('total_floor_area', 10, 2)->nullable(); // 床面積（㎡）
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('material_lists');
    }
};
