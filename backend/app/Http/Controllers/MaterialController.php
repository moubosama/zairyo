<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\MaterialList;
use Illuminate\Http\Response;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;

class MaterialController extends Controller
{
    /**
     * Excel形式でエクスポート
     */
    public function export(int $projectId): Response
    {
        $project = Project::with(['package', 'materialList', 'aiReading'])->findOrFail($projectId);

        if (!$project->materialList) {
            abort(404, '資材リストがありません');
        }

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('資材リスト');

        // ヘッダー情報
        $sheet->setCellValue('A1', 'ZAIRYO 資材リスト');
        $sheet->setCellValue('A2', '物件名: ' . $project->name);
        $sheet->setCellValue('A3', 'パッケージ: ' . $project->package->name);
        $sheet->setCellValue('A4', '作成日: ' . now()->format('Y年m月d日'));

        // 面積情報
        $sheet->setCellValue('A6', '【面積情報】');
        $sheet->setCellValue('A7', '壁面積: ' . $project->materialList->total_wall_area . ' ㎡');
        $sheet->setCellValue('A8', '天井面積: ' . $project->materialList->total_ceiling_area . ' ㎡');
        $sheet->setCellValue('A9', '床面積: ' . $project->materialList->total_floor_area . ' ㎡');

        // テーブルヘッダー
        $row = 11;
        $headers = ['カテゴリ', '資材名', '規格', '数量', '単位', '備考'];
        $columns = ['A', 'B', 'C', 'D', 'E', 'F'];

        foreach ($headers as $index => $header) {
            $cell = $columns[$index] . $row;
            $sheet->setCellValue($cell, $header);
        }

        // ヘッダースタイル
        $headerRange = 'A' . $row . ':F' . $row;
        $sheet->getStyle($headerRange)->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => [
                'fillType' => Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'D4A853'],
            ],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
            'borders' => [
                'allBorders' => ['borderStyle' => Border::BORDER_THIN],
            ],
        ]);

        // データ行
        $row++;
        $currentCategory = '';
        foreach ($project->materialList->items_json as $item) {
            // カテゴリが変わったら空行を入れる
            if ($currentCategory !== '' && $currentCategory !== $item['category']) {
                $row++;
            }
            $currentCategory = $item['category'];

            $sheet->setCellValue('A' . $row, $item['category'] ?? '');
            $sheet->setCellValue('B' . $row, $item['name'] ?? '');
            $sheet->setCellValue('C' . $row, $item['spec'] ?? '');
            $sheet->setCellValue('D' . $row, $item['quantity'] ?? '');
            $sheet->setCellValue('E' . $row, $item['unit'] ?? '');
            $sheet->setCellValue('F' . $row, $item['notes'] ?? '');

            // データ行のスタイル
            $sheet->getStyle('A' . $row . ':F' . $row)->applyFromArray([
                'borders' => [
                    'allBorders' => ['borderStyle' => Border::BORDER_THIN],
                ],
            ]);

            $row++;
        }

        // 列幅の自動調整
        foreach ($columns as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        // タイトルスタイル
        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(16);

        // ファイル出力
        $writer = new Xlsx($spreadsheet);
        $filename = 'zairyo_' . $project->id . '_' . date('Ymd') . '.xlsx';

        ob_start();
        $writer->save('php://output');
        $content = ob_get_clean();

        return response($content)
            ->header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            ->header('Content-Disposition', 'attachment; filename="' . $filename . '"')
            ->header('Cache-Control', 'max-age=0');
    }
}
