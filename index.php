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

if (!$apiKey || !$orgId) {
  http_response_code(500);
  echo json_encode(["error" => "Ключ или организация не указаны в .env"]);
  exit;
}

// 🧠 Отправляем запрос в OpenAI
$payload = json_encode([
  "model" => "gpt-4o",
  "presence_penalty" => 1.2,
  "frequency_penalty" => 0.8,
  "temperature" => 0.5,
  "max_tokens" => 8192,
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

if ($error) {
  echo json_encode(["error" => "CURL ошибка: $error"]);
  exit;
} elseif ($httpCode !== 200) {
  echo json_encode(["error" => "OpenAI вернул код $httpCode", "response" => $response]);
  exit;
}

// 📥 Распаковываем ответ
$data = json_decode($response, true);
$content = $data['choices'][0]['message']['content'] ?? 'Ответ отсутствует';

// 📄 Генерация PDF (DomPDF)
require 'vendor/autoload.php';
use Dompdf\Dompdf;

$dompdf = new Dompdf();
$dompdf->loadHtml("<pre style='font-family: Arial; font-size: 12px;'>" . htmlspecialchars($content) . "</pre>");
$dompdf->setPaper('A4');
$dompdf->render();
$pdf = $dompdf->output();

// 💾 Сохраняем PDF во временный файл
$tmpPath = tempnam(sys_get_temp_dir(), 'plan') . '.pdf';
file_put_contents($tmpPath, $pdf);

// 📧 Отправляем по почте
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$mail = new PHPMailer(true);

try {
  $mail->setFrom('noreply@biznesplan.online', 'AI Бизнес-План');
  $mail->addAddress('1yoga@mail.ru');
  $mail->Subject = 'Ваш бизнес-план готов';
  $mail->Body = 'Во вложении находится сгенерированный бизнес-план.';
  $mail->addAttachment($tmpPath, 'business-plan.pdf');
  $mail->send();
  echo json_encode(["success" => true, "message" => "Письмо отправлено"]);
} catch (Exception $e) {
  echo json_encode(["error" => "Ошибка при отправке письма: {$mail->ErrorInfo}"]);
} finally {
  unlink($tmpPath);
}
