<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

try {
    $config = wzstats_config();
    $pdo = Database::connect($config['db']);
    $command = $argv[1] ?? 'help';

    if ($command === 'migrate') {
        $count = Database::migrate($pdo, dirname(__DIR__) . '/migrations');
        fwrite(STDOUT, "Migration complete ({$count} statements).\n");
        exit(0);
    }

    if ($command === 'status') {
        $status = [
            'phpVersion' => PHP_VERSION,
            'databaseVersion' => $pdo->getAttribute(PDO::ATTR_SERVER_VERSION),
            'database' => $pdo->query('SELECT DATABASE()')->fetchColumn(),
        ];
        fwrite(STDOUT, json_encode($status, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
        exit(0);
    }

    if ($command === 'parse') {
        $requestedLimit = isset($argv[2]) ? (int) $argv[2] : 25;
        $processor = new ReplayProcessor($pdo, new ReplayParser());
        $result = $processor->processPending(max(1, min(100, $requestedLimit)));
        fwrite(STDOUT, json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL);
        exit($result['errors'] === [] ? 0 : 2);
    }

    fwrite(STDOUT, "Usage:\n  php bin/wzstats.php migrate\n  php bin/wzstats.php status\n  php bin/wzstats.php parse [limit]\n");
    exit($command === 'help' ? 0 : 1);
} catch (Throwable $error) {
    fwrite(STDERR, '[wzstats] ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
