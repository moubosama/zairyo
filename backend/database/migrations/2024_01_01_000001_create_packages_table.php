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
        Schema::create('packages', function (Blueprint $table) {
            $table->id();
            $table->string('name'); // スタンダード, ミドル, ハイグレード
            $table->string('type'); // standard, middle, high_grade
            $table->string('target_layout'); // 1LDK～2LDK, 2LDK, 2LDK～
            $table->integer('base_price'); // 基準価格（万円）
            $table->text('description')->nullable();
            $table->json('specs_json'); // 標準仕様をJSON形式で保持
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('packages');
    }
};
