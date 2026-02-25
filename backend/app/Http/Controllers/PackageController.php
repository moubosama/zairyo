<?php

namespace App\Http\Controllers;

use App\Models\Package;
use Illuminate\Http\JsonResponse;

class PackageController extends Controller
{
    /**
     * パッケージ一覧を取得
     */
    public function index(): JsonResponse
    {
        $packages = Package::all();

        return response()->json([
            'success' => true,
            'data' => $packages,
        ]);
    }

    /**
     * パッケージ詳細を取得
     */
    public function show(int $id): JsonResponse
    {
        $package = Package::findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $package,
        ]);
    }
}
