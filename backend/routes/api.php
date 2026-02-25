<?php

use App\Http\Controllers\PackageController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\MaterialController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| ZAIRYO API エンドポイント
|
*/

// パッケージ関連
Route::get('/packages', [PackageController::class, 'index']);
Route::get('/packages/{id}', [PackageController::class, 'show']);

// プロジェクト関連
Route::get('/projects', [ProjectController::class, 'index']);
Route::post('/projects', [ProjectController::class, 'store']);
Route::get('/projects/{id}', [ProjectController::class, 'show']);
Route::post('/projects/{id}/upload', [ProjectController::class, 'upload']);
Route::post('/projects/{id}/overrides', [ProjectController::class, 'saveOverrides']);
Route::post('/projects/{id}/calculate', [ProjectController::class, 'calculate']);
Route::get('/projects/{id}/materials', [ProjectController::class, 'getMaterials']);
Route::get('/projects/{id}/export', [MaterialController::class, 'export']);

// オーバーライドオプション取得
Route::get('/override-options', [ProjectController::class, 'getOverrideOptions']);
