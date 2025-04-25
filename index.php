<?php
// 🔓 CORS preflight для браузеров
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  header('Access-Control-Max-Age: 86400');
  http_response_code(200);
  exit;
}

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$input = json_decode(file_get_contents("php://input"), true);
$prompt = $input["prompt"] ?? null;

if (!$prompt) {
  http_response_code(400);
  echo json_encode(["error" => "Пустой запрос"]);
  exit;
}

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
  "messages" => [
    ["role" => "system", "content" => "Ты профессиональный бизнес-консультант."],
    ["role" => "user", "content" => $prompt]
  ]
]));

$response = curl_exec($ch);
if (!$response) {
  echo json_encode(["error" => $error ?: "Нет ответа от OpenAI"]);
  exit;
}

// Декодируем ответ, чтобы отловить ошибки OpenAI
$decoded = json_decode($response, true);

if (isset($decoded["error"])) {
  http_response_code(500);
  echo json_encode([
    "error" => $decoded["error"]["message"] ?? "Неизвестная ошибка от OpenAI"
  ]);
  exit;
}

// Всё хорошо — отдаём ответ как есть
http_response_code(200);
echo json_encode($decoded);

