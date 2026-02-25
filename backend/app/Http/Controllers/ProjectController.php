<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\AiReading;
use App\Models\Override;
use App\Models\MaterialList;
use App\Services\ClaudeApiService;
use App\Services\MaterialCalculatorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Exception;

class ProjectController extends Controller
{
    /**
     * プロジェクト一覧を取得
     */
    public function index(): JsonResponse
    {
        $projects = Project::with(['package', 'materialList'])->get();

        return response()->json([
            'success' => true,
            'data' => $projects,
        ]);
    }

    /**
     * 新規プロジェクト作成
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'package_id' => 'required|exists:packages,id',
        ]);

        $project = Project::create([
            'name' => $validated['name'],
            'package_id' => $validated['package_id'],
            'status' => 'draft',
        ]);

        return response()->json([
            'success' => true,
            'data' => $project->load('package'),
            'message' => 'プロジェクトを作成しました',
        ], 201);
    }

    /**
     * プロジェクト詳細を取得
     */
    public function show(int $id): JsonResponse
    {
        $project = Project::with([
            'package',
            'aiReading',
            'overrides',
            'materialList',
        ])->findOrFail($id);

        return response()->json([
            'success' => true,
            'data' => $project,
        ]);
    }

    /**
     * 図面アップロード + AI解析
     */
    public function upload(Request $request, int $id): JsonResponse
    {
        $project = Project::findOrFail($id);

        $request->validate([
            'plan_image' => 'required|file|mimes:pdf,png,jpg,jpeg|max:10240',
        ]);

        // ファイル保存
        $file = $request->file('plan_image');
        $filename = 'plans/' . $project->id . '_' . time() . '.' . $file->getClientOriginalExtension();
        $path = $file->storeAs('', $filename);

        $project->update([
            'plan_image' => $path,
            'status' => 'analyzing',
        ]);

        try {
            // Claude APIで図面解析
            $claudeService = new ClaudeApiService();
            $result = $claudeService->analyzePlan(storage_path('app/' . $path));

            // AI解析結果を保存
            AiReading::updateOrCreate(
                ['project_id' => $project->id],
                [
                    'reading_json' => $result['reading_json'],
                    'model_used' => $result['model_used'],
                    'input_tokens' => $result['input_tokens'],
                    'output_tokens' => $result['output_tokens'],
                ]
            );

            $project->update(['status' => 'confirmed']);

            return response()->json([
                'success' => true,
                'data' => [
                    'project' => $project->fresh(['aiReading']),
                    'ai_reading' => $result['reading_json'],
                ],
                'message' => '図面の解析が完了しました',
            ]);
        } catch (Exception $e) {
            $project->update(['status' => 'draft']);

            return response()->json([
                'success' => false,
                'message' => '図面解析に失敗しました: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * 仕様変更（オーバーライド）を保存
     */
    public function saveOverrides(Request $request, int $id): JsonResponse
    {
        $project = Project::findOrFail($id);

        $validated = $request->validate([
            'overrides' => 'required|array',
            'overrides.*.key' => 'required|string',
            'overrides.*.value' => 'required|string',
        ]);

        foreach ($validated['overrides'] as $override) {
            Override::updateOrCreate(
                [
                    'project_id' => $project->id,
                    'key' => $override['key'],
                ],
                [
                    'value' => $override['value'],
                ]
            );
        }

        return response()->json([
            'success' => true,
            'data' => $project->fresh(['overrides']),
            'message' => '仕様変更を保存しました',
        ]);
    }

    /**
     * 利用可能なオーバーライド項目を取得
     */
    public function getOverrideOptions(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => Override::getAvailableOverrides(),
        ]);
    }

    /**
     * 資材計算を実行
     */
    public function calculate(int $id): JsonResponse
    {
        $project = Project::with(['package', 'aiReading', 'overrides'])->findOrFail($id);

        if (!$project->aiReading) {
            return response()->json([
                'success' => false,
                'message' => '図面の解析が完了していません',
            ], 400);
        }

        try {
            $calculator = new MaterialCalculatorService();
            $result = $calculator->calculate($project);

            // 資材リストを保存
            MaterialList::updateOrCreate(
                ['project_id' => $project->id],
                [
                    'items_json' => $result['items'],
                    'total_wall_area' => $result['areas']['wall_area'] ?? null,
                    'total_ceiling_area' => $result['areas']['ceiling_area'] ?? null,
                    'total_floor_area' => $result['areas']['floor_area'] ?? null,
                ]
            );

            $project->update(['status' => 'completed']);

            return response()->json([
                'success' => true,
                'data' => [
                    'materials' => $result['items'],
                    'areas' => $result['areas'],
                ],
                'message' => '資材計算が完了しました',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => '資材計算に失敗しました: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * 資材リストを取得
     */
    public function getMaterials(int $id): JsonResponse
    {
        $project = Project::with('materialList')->findOrFail($id);

        if (!$project->materialList) {
            return response()->json([
                'success' => false,
                'message' => '資材リストがありません。先に計算を実行してください。',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'items' => $project->materialList->items_json,
                'areas' => [
                    'wall_area' => $project->materialList->total_wall_area,
                    'ceiling_area' => $project->materialList->total_ceiling_area,
                    'floor_area' => $project->materialList->total_floor_area,
                ],
            ],
        ]);
    }
}
