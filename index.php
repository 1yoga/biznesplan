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

$apiKey = "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";
$orgId = "org-ALAo7jBvLczBCPT91tLB7hXP";

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
$error = curl_error($ch);
curl_close($ch);

echo $response ?: json_encode(["error" => $error]);
