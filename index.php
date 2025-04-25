<?php
// ✅ Preflight-запрос от браузера (CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  http_response_code(200);
  exit;
}

// ✅ Основные заголовки CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// ✅ Получаем тело запроса
$input = json_decode(file_get_contents("php://input"), true);
$prompt = $input["prompt"] ?? null;

if (!$prompt || !is_string($prompt)) {
  http_response_code(400);
  echo json_encode(["error" => "Пустой или некорректный prompt"]);
  exit;
}

// 🔐 Подгружаем переменные окружения
$apiKey = getenv("OPENAI_API_KEY");
$orgId = getenv("OPENAI_ORG_ID");

// 🛑 Проверка наличия ключей
if (!$apiKey || !$orgId) {
  http_response_code(500);
  echo json_encode(["error" => "Ключ или организация не указаны в .env"]);
  exit;
}

// 🧠 Готовим запрос к OpenAI
$payload = json_encode([
  "model" => "gpt-4o",
  "temperature" => 0.5,
  "max_tokens" => 4096, // 🔧 максимально возможный размер
  "messages" => [
    ["role" => "system", "content" => "Ты профессиональный бизнес-консультант."],
    ["role" => "user", "content" => $prompt]
  ]
]);

$ch = curl_init("https://api.openai.com/v1/chat/completions");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "Content-Type: application/json",
    "Authorization: Bearer $apiKey",
    "OpenAI-Organization: $orgId"
  ],
  CURLOPT_POSTFIELDS => $payload
]);

$response = curl_exec($ch);
$error = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// 🧾 Возврат
if ($error) {
  echo json_encode(["error" => "CURL ошибка: $error"]);
} elseif ($httpCode !== 200) {
  echo json_encode(["error" => "OpenAI вернул код $httpCode", "response" => $response]);
} else {
  echo $response;
}
