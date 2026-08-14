<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

const CRON_TOKEN_HASH = '3a491c1ff89e25a54f8ba06b011c9309e01723d0b6ddd78870de89ff4195a140';

$isCli = PHP_SAPI === 'cli';
if (!$isCli && !hash_equals(CRON_TOKEN_HASH, hash('sha256', (string) ($_GET['key'] ?? '')))) {
    http_response_code(404);
    exit;
}
if (!$isCli) {
    ignore_user_abort(true);
    set_time_limit(1500);
    header('Content-Type: application/json; charset=utf-8');
}

$pdo = null;
$exitCode = 0;
try {
    $config = wzstats_config();
    $pdo = Database::connect($config['db']);
    if ((int) $pdo->query("SELECT GET_LOCK('maway2000-bohan-sync', 0)")->fetchColumn() !== 1) {
        throw new RuntimeException('Another Bohan synchronization is already running.');
    }
    $requestedLimit = $isCli ? ($argv[1] ?? 100) : ($_GET['limit'] ?? 100);
    $requestedParseLimit = $isCli ? ($argv[2] ?? 100) : ($_GET['parse'] ?? 100);
    $limit = max(1, min(100, (int) $requestedLimit));
    $parseLimit = max(1, min(100, (int) $requestedParseLimit));
    $source = new BohanReplaySource();
    $queue = new ReplayQueue($pdo, $config['storage']['replay_dir'], 20);
    $scan = $queue->discover($source, $source->discover());
    $downloads = $queue->downloadPending($source->key(), $limit);
    $parse = (new ReplayProcessor($pdo, new ReplayParser()))->processPending($parseLimit);
    $matches = (new ReplayMaterializer($pdo))->materialize($parseLimit);
    $publish = (new Publisher($pdo, dirname(__DIR__) . '/data'))->publish();
    $leaderboards = (new LeaderboardCalculator($pdo))->publish(dirname(__DIR__) . '/data/leaderboards.json');
    $result = ['source' => 'bohan', 'scan' => $scan, 'downloads' => $downloads, 'parse' => $parse, 'matches' => $matches, 'publish' => $publish, 'leaderboards' => $leaderboards];
    $exitCode = $downloads['errors'] === [] && $parse['errors'] === [] && $matches['errors'] === [] ? 0 : 2;
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
} catch (Throwable $error) {
    $exitCode = 1;
    if (!$isCli) {
        http_response_code(500);
        echo json_encode(['error' => $error->getMessage()], JSON_UNESCAPED_SLASHES) . PHP_EOL;
    } else {
        fwrite(STDERR, '[bohan-sync] ' . $error->getMessage() . PHP_EOL);
    }
} finally {
    if ($pdo instanceof PDO) {
        $pdo->query("SELECT RELEASE_LOCK('maway2000-bohan-sync')");
    }
}
exit($exitCode);
