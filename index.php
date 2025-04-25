<?php
// ✅ Обработка preflight запроса (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  http_response_code(200);
  exit;
}

// ✅ Заголовки CORS для обычных POST-запросов
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

$input = json_decode(file_get_contents("php://input"), true);
$prompt = $input["prompt"] ?? null;

if (!$prompt) {
  http_response_code(400);
  echo json_encode(["error" => "Пустой запрос"]);
  exit;
}

// 🔑 API-ключ в .env
$apiKey = getenv("OPENAI_API_KEY");
$orgId = getenv("OPENAI_ORG_ID");

$ch = curl_init("https://api.openai.com/v1/chat/completions");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  "Content-Type: application/json",
  "Authorization: Bearer $apiKey",
  "OpenAI-Organization: $orgId"
]);

curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
  "model" => "gpt-4o",
  "temperature" => 0.5,
  "messages" => [
    ["role" => "system", "content" => "Ты профессиональный бизнес-консультант."],
    ["role" => "user", "content" => $prompt]
  ]
]));

$response = curl_exec($ch);
$error = curl_error($ch);
curl_close($ch);

// ✅ Вернём либо ответ, либо ошибку
echo $response ?: json_encode(["error" => $error]);
