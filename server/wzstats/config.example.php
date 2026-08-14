<?php

declare(strict_types=1);

return [
    'db' => [
        'dsn' => 'mysql:host=localhost;dbname=CHANGE_ME;charset=utf8mb4',
        'username' => 'CHANGE_ME',
        'password' => 'CHANGE_ME',
    ],
    'source' => [
        'base_url' => 'https://wz2100.uk',
        'recent_limit' => 10,
        'timeout_seconds' => 30,
        'user_agent' => 'MaWay2000-wzstats/1.0 (+https://maway2000.github.io/boha/)',
    ],
    'storage' => [
        'replay_dir' => __DIR__ . '/storage/replays',
    ],
    'cors_origins' => [
        'https://maway2000.github.io',
        'https://onit.lt',
        'https://www.onit.lt',
        'http://127.0.0.1:8765',
        'http://localhost:8765',
    ],
];
