<?php

declare(strict_types=1);

$apiRoot = dirname(__DIR__);
$hostedRoot = $apiRoot . DIRECTORY_SEPARATOR . 'hosted-wzstats';
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

const VISITOR_DASHBOARD_CONFIG = __DIR__ . '/../private/config.local.php';

function jsonError(string $message, int $status): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function visitorDashboardDatabase(array $config): mysqli
{
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $database = new mysqli(
        (string) $config['db_host'],
        (string) $config['db_user'],
        (string) $config['db_password'],
        (string) $config['db_name'],
        (int) ($config['db_port'] ?? 3306)
    );
    $database->set_charset('utf8mb4');
    return $database;
}

function visitorDashboardConfig(array $applicationConfig): array
{
    $databaseConfig = $applicationConfig['db'] ?? null;
    if (!is_array($databaseConfig)) {
        return $applicationConfig;
    }

    $dsn = (string) ($databaseConfig['dsn'] ?? '');
    $dsnFields = [];
    if (str_starts_with($dsn, 'mysql:')) {
        parse_str(str_replace(';', '&', substr($dsn, 6)), $dsnFields);
    }

    return [
        'db_host' => (string) ($dsnFields['host'] ?? '127.0.0.1'),
        'db_port' => (int) ($dsnFields['port'] ?? 3306),
        'db_name' => (string) ($dsnFields['dbname'] ?? ''),
        'db_user' => (string) ($databaseConfig['username'] ?? ''),
        'db_password' => (string) ($databaseConfig['password'] ?? ''),
    ];
}

if ($requestPath === '/healthz') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo "{\"status\":\"ok\"}\n";
    exit;
}

if (preg_match('~^/wzstats/data/(matches|leaderboards|manifest)\.json$~', $requestPath, $match)) {
    $dataPath = $hostedRoot . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . $match[1] . '.json';
    if (!is_file($dataPath)) {
        jsonError('Publication file not found.', 404);
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Length: ' . filesize($dataPath));
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');
    readfile($dataPath);
    exit;
}

if ($requestPath === '/wzstats/visitor-dashboard.js') {
    header('Content-Type: application/javascript; charset=utf-8');
    header('Cache-Control: no-store');
    readfile(__DIR__ . DIRECTORY_SEPARATOR . 'visitor-dashboard.js');
    exit;
}

if (preg_match('~^/wzstats/flags/([a-z]{2})\.svg$~', $requestPath, $flagMatch)) {
    $flagPath = __DIR__ . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'flags'
        . DIRECTORY_SEPARATOR . '4x3' . DIRECTORY_SEPARATOR . $flagMatch[1] . '.svg';
    if (!is_file($flagPath)) {
        jsonError('Flag not found.', 404);
    }
    header('Content-Type: image/svg+xml; charset=utf-8');
    header('Content-Length: ' . filesize($flagPath));
    header('Cache-Control: public, max-age=31536000, immutable');
    readfile($flagPath);
    exit;
}

if ($requestPath === '/wzstats/visitors' || $requestPath === '/wzstats/visitors/') {
    if (!is_file(VISITOR_DASHBOARD_CONFIG)) {
        jsonError('Visitor dashboard configuration is missing.', 503);
    }
    $applicationConfig = require VISITOR_DASHBOARD_CONFIG;
    if (!is_array($applicationConfig)) {
        jsonError('Visitor dashboard configuration is invalid.', 503);
    }
    $config = visitorDashboardConfig($applicationConfig);
    function database(array $databaseConfig): mysqli
    {
        return visitorDashboardDatabase($databaseConfig);
    }
    require __DIR__ . DIRECTORY_SEPARATOR . 'visitor-dashboard.php';
    exit;
}

if ($requestPath === '/wzstats/player-bans' || $requestPath === '/wzstats/player-bans/') {
    require __DIR__ . DIRECTORY_SEPARATOR . 'player-bans.php';
    exit;
}

if (str_starts_with($requestPath, '/wzstats/api/')) {
    require $hostedRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php';
    exit;
}

jsonError('Endpoint not found.', 404);
