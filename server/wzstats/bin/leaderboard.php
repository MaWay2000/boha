<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

const LEADERBOARD_CRON_TOKEN_HASH = '3a491c1ff89e25a54f8ba06b011c9309e01723d0b6ddd78870de89ff4195a140';

$isCli = PHP_SAPI === 'cli';
if (!$isCli && !hash_equals(LEADERBOARD_CRON_TOKEN_HASH, hash('sha256', (string) ($_GET['key'] ?? '')))) {
    http_response_code(404);
    exit;
}
if (!$isCli) {
    ignore_user_abort(true);
    set_time_limit(1500);
    header('Content-Type: application/json; charset=utf-8');
}

$exitCode = 0;
try {
    $config = wzstats_config();
    $pdo = Database::connect($config['db']);
    if ((int) $pdo->query("SELECT GET_LOCK('maway2000-leaderboard', 0)")->fetchColumn() !== 1) {
        throw new RuntimeException('Another leaderboard build is already running.');
    }
    $migrations = Database::migrate($pdo, dirname(__DIR__) . '/migrations');
    $publish = (new LeaderboardCalculator($pdo))->publish(dirname(__DIR__) . '/data/leaderboards.json');
    $manifest = (new Publisher($pdo, dirname(__DIR__) . '/data'))->publish();
    echo json_encode(['migrations' => $migrations, 'publish' => $publish, 'manifest' => $manifest], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $error) {
    $exitCode = 1;
    if (!$isCli) http_response_code(500);
    $message = '[leaderboard] ' . $error->getMessage();
    if ($isCli) fwrite(STDERR, $message . PHP_EOL);
    else echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES) . PHP_EOL;
} finally {
    if (isset($pdo) && $pdo instanceof PDO) $pdo->query("SELECT RELEASE_LOCK('maway2000-leaderboard')");
}
exit($exitCode);
