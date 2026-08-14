<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

const CRON_TOKEN_HASH = 'f18e2954f5d17277af132365ea51e8c6ac8c44d75dce170828569b7fa27df400';

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
    if ((int) $pdo->query("SELECT GET_LOCK('maway2000-sun-sync', 0)")->fetchColumn() !== 1) {
        throw new RuntimeException('Another Sunshine synchronization is already running.');
    }

    $requestedLimit = $isCli ? ($argv[1] ?? 100) : ($_GET['limit'] ?? 100);
    $requestedParseLimit = $isCli ? ($argv[2] ?? 100) : ($_GET['parse'] ?? 100);
    $syncLimit = max(1, min(100, (int) $requestedLimit));
    $parseLimit = max(1, min(100, (int) $requestedParseLimit));
    $source = new SunshineReplaySource(new Wz2100UkClient($config['source']), 50);
    $queue = new ReplayQueue($pdo, $config['storage']['replay_dir'], 20);
    $scan = $queue->discover($source, $source->discover());
    $downloads = $queue->downloadPending($source->key(), $syncLimit);
    $parse = (new ReplayProcessor($pdo, new ReplayParser()))->processPending($parseLimit);
    $matches = (new ReplayMaterializer($pdo))->materialize($parseLimit);
    $publish = (new Publisher($pdo, dirname(__DIR__) . '/data'))->publish();
    $result = ['source' => 'wz2100.uk', 'scan' => $scan, 'downloads' => $downloads, 'parse' => $parse, 'matches' => $matches, 'publish' => $publish];
    $exitCode = $downloads['errors'] === [] && $parse['errors'] === [] && $matches['errors'] === [] ? 0 : 2;
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
} catch (Throwable $error) {
    $exitCode = 1;
    if (!$isCli) {
        http_response_code(500);
        echo json_encode(['error' => $error->getMessage()], JSON_UNESCAPED_SLASHES) . PHP_EOL;
    } else {
        fwrite(STDERR, '[sun-sync] ' . $error->getMessage() . PHP_EOL);
    }
} finally {
    if ($pdo instanceof PDO) {
        $pdo->query("SELECT RELEASE_LOCK('maway2000-sun-sync')");
    }
}
exit($exitCode);
