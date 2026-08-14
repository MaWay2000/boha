<?php

declare(strict_types=1);

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Wz2100UkClient.php';
require_once __DIR__ . '/Importer.php';
require_once __DIR__ . '/ReplayQueue.php';
require_once __DIR__ . '/BohanReplaySource.php';
require_once __DIR__ . '/SunshineReplaySource.php';
require_once __DIR__ . '/ReplayParser.php';
require_once __DIR__ . '/ReplayProcessor.php';
require_once __DIR__ . '/ReplayMaterializer.php';
require_once __DIR__ . '/Publisher.php';
require_once __DIR__ . '/LegacyOutcomeImporter.php';
require_once __DIR__ . '/LeaderboardCalculator.php';

function wzstats_config(): array
{
    $externalPath = getenv('WZSTATS_CONFIG');
    $configPath = is_string($externalPath) && $externalPath !== ''
        ? $externalPath
        : dirname(__DIR__) . '/config.local.php';

    if (!is_file($configPath)) {
        throw new RuntimeException('Missing wzstats configuration. Copy config.example.php to a private config path.');
    }

    $config = require $configPath;
    if (!is_array($config)) {
        throw new RuntimeException('The wzstats configuration must return an array.');
    }

    return $config;
}
