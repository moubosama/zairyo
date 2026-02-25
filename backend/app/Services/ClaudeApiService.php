<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Exception;

class ClaudeApiService
{
    private string $apiKey;
    private string $model;
    private string $apiUrl = 'https://api.anthropic.com/v1/messages';

    public function __construct()
    {
        $this->apiKey = config('services.claude.api_key');
        $this->model = config('services.claude.model', 'claude-sonnet-4-5-20241022');
    }

    /**
     * 図面を解析してJSONを返す
     */
    public function analyzePlan(string $imagePath): array
    {
        $imageData = $this->getImageData($imagePath);
        $mediaType = $this->getMediaType($imagePath);

        $systemPrompt = $this->getSystemPrompt();
        $userPrompt = $this->getUserPrompt();

        $response = Http::withHeaders([
            'x-api-key' => $this->apiKey,
            'anthropic-version' => '2023-06-01',
            'content-type' => 'application/json',
        ])->timeout(120)->post($this->apiUrl, [
            'model' => $this->model,
            'max_tokens' => 4096,
            'system' => $systemPrompt,
            'messages' => [
                [
                    'role' => 'user',
                    'content' => [
                        [
                            'type' => 'image',
                            'source' => [
                                'type' => 'base64',
                                'media_type' => $mediaType,
                                'data' => $imageData,
                            ],
                        ],
                        [
                            'type' => 'text',
                            'text' => $userPrompt,
                        ],
                    ],
                ],
            ],
        ]);

        if (!$response->successful()) {
            Log::error('Claude API Error', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            throw new Exception('Claude API リクエストに失敗しました: ' . $response->body());
        }

        $result = $response->json();

        return [
            'reading_json' => $this->parseResponse($result),
            'input_tokens' => $result['usage']['input_tokens'] ?? 0,
            'output_tokens' => $result['usage']['output_tokens'] ?? 0,
            'model_used' => $this->model,
        ];
    }

    /**
     * システムプロンプトを取得
     */
    private function getSystemPrompt(): string
    {
        return <<<PROMPT
あなたは建築図面を解析する専門家です。アップロードされた計画平面図から、以下の情報をJSON形式で抽出してください。

必ず以下のJSON形式で出力してください。JSONのみを出力し、それ以外のテキストは含めないでください。

読み取れない情報がある場合は、該当フィールドをnullまたは空配列としてください。
寸法はmm単位で記載してください。
畳数は図面に記載があれば読み取り、なければ面積から概算してください（1畳≈1.62㎡）。
PROMPT;
    }

    /**
     * ユーザープロンプトを取得
     */
    private function getUserPrompt(): string
    {
        return <<<PROMPT
この計画平面図から以下の情報を読み取り、JSON形式で出力してください。

出力形式:
{
  "property_name": "物件名（図面タイトルブロックから）",
  "layout_type": "間取りタイプ（1LDK, 2LDK等）",
  "total_dimensions": {
    "width_mm": 総幅（mm）,
    "depth_mm": 総奥行（mm）
  },
  "rooms": [
    {
      "name": "部屋名",
      "area_tsubo": 畳数,
      "area_sqm": 面積（㎡）,
      "width_mm": 幅（mm）,
      "depth_mm": 奥行（mm）,
      "floor_type": "flooring" または "cf" または "tile",
      "wall_type": "partition"（間仕切壁） または "structural"（躯体壁）
    }
  ],
  "openings": [
    {
      "type": "door" または "window" または "sliding_door" または "folding_door",
      "width_mm": 幅（mm）,
      "height_mm": 高さ（mm）,
      "room": "設置部屋名"
    }
  ],
  "equipment": {
    "ub_size": "UBサイズ（1317, 1418等）",
    "kitchen": "キッチンタイプ（I型 2550等）",
    "washstand": "洗面台サイズ（W750等）"
  },
  "storage": [
    {
      "type": "closet" または "walk_in_closet" または "shoe_box",
      "width_mm": 幅（mm）,
      "has_makuradana": 枕棚の有無（true/false）
    }
  ],
  "special": [
    {
      "type": "floor_heating" または "interior_window" または "counter" 等,
      "details": "詳細情報"
    }
  ]
}

JSONのみを出力してください。
PROMPT;
    }

    /**
     * APIレスポンスをパースしてJSONを抽出
     */
    private function parseResponse(array $result): array
    {
        $content = $result['content'][0]['text'] ?? '';

        // JSONブロックを抽出
        if (preg_match('/```json\s*(.*?)\s*```/s', $content, $matches)) {
            $content = $matches[1];
        } elseif (preg_match('/```\s*(.*?)\s*```/s', $content, $matches)) {
            $content = $matches[1];
        }

        // JSON文字列をトリム
        $content = trim($content);

        $decoded = json_decode($content, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            Log::error('JSON Parse Error', [
                'error' => json_last_error_msg(),
                'content' => $content,
            ]);
            throw new Exception('Claude APIからの応答をJSONとしてパースできませんでした');
        }

        return $decoded;
    }

    /**
     * 画像をBase64エンコード
     */
    private function getImageData(string $imagePath): string
    {
        if (Storage::exists($imagePath)) {
            $content = Storage::get($imagePath);
        } elseif (file_exists($imagePath)) {
            $content = file_get_contents($imagePath);
        } else {
            throw new Exception('画像ファイルが見つかりません: ' . $imagePath);
        }

        return base64_encode($content);
    }

    /**
     * 画像のメディアタイプを取得
     */
    private function getMediaType(string $imagePath): string
    {
        $extension = strtolower(pathinfo($imagePath, PATHINFO_EXTENSION));

        return match ($extension) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'pdf' => 'application/pdf',
            default => 'image/jpeg',
        };
    }
}
