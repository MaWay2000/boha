<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

$isCli = PHP_SAPI === 'cli';
if (!$isCli) {
    header('Content-Type: application/json; charset=utf-8');
}

function resetRespond(array $payload, int $status = 200): never
{
    global $isCli;
    if (!$isCli) {
        http_response_code($status);
    }
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
    exit($status >= 400 ? 1 : 0);
}

function resetCounts(PDO $pdo): array
{
    return [
        'matches' => (int) $pdo->query('SELECT COUNT(*) FROM matches WHERE replay_id IS NOT NULL')->fetchColumn(),
        'players' => (int) $pdo->query(
            'SELECT COUNT(*) FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE m.replay_id IS NOT NULL'
        )->fetchColumn(),
        'replayEnginePlayers' => (int) $pdo->query(
            "SELECT COUNT(*) FROM match_players mp JOIN matches m ON m.id = mp.match_id
             WHERE m.replay_id IS NOT NULL AND mp.stats_source = 'replay-engine'"
        )->fetchColumn(),
        'engineAnalyses' => (int) $pdo->query(
            "SELECT COUNT(*) FROM matches WHERE replay_id IS NOT NULL
             AND JSON_EXTRACT(telemetry_json, '$.engineAnalysis.status') IS NOT NULL"
        )->fetchColumn(),
        'legacyOutcomeFacts' => (int) $pdo->query('SELECT COUNT(*) FROM match_outcome_facts')->fetchColumn(),
        'replaysPreserved' => (int) $pdo->query('SELECT COUNT(*) FROM replays')->fetchColumn(),
        'remoteReplayRecordsPreserved' => (int) $pdo->query('SELECT COUNT(*) FROM remote_replays')->fetchColumn(),
    ];
}

function outdatedAnalysisWhere(): string
{
    return "m.replay_id IS NOT NULL
        AND JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.status') IS NOT NULL
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.analyzerVersion')), '') <> :target_version";
}

function outdatedCounts(PDO $pdo, string $targetVersion): array
{
    $matches = $pdo->prepare('SELECT COUNT(*) FROM matches m WHERE ' . outdatedAnalysisWhere());
    $matches->execute(['target_version' => $targetVersion]);
    $players = $pdo->prepare(
        'SELECT COUNT(*) FROM match_players mp JOIN matches m ON m.id = mp.match_id
         WHERE ' . outdatedAnalysisWhere() . " AND mp.stats_source = 'replay-engine'"
    );
    $players->execute(['target_version' => $targetVersion]);
    return [
        'matches' => (int) $matches->fetchColumn(),
        'replayEnginePlayers' => (int) $players->fetchColumn(),
    ];
}

$pdo = null;
$locked = false;
try {
    $config = wzstats_config();
    $targetVersion = (string) ($config['worker']['analyzer_version'] ?? '3.3.0');
    $scope = $isCli
        ? (in_array('--outdated-only', $argv, true) ? 'outdated' : 'all')
        : (string) ($_GET['scope'] ?? 'all');
    if (!in_array($scope, ['all', 'outdated'], true)) {
        resetRespond(['error' => 'Unknown reset scope.'], 422);
    }
    $confirmation = ($scope === 'outdated' ? 'HIDE-OUTDATED-ANALYSIS-' : 'RESET-REPLAY-ANALYSIS-') . $targetVersion;

    if (!$isCli) {
        $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        $token = str_starts_with($authorization, 'Bearer ') ? substr($authorization, 7) : '';
        $expectedHash = (string) ($config['worker']['token_hash'] ?? '');
        if ($token === '' || $expectedHash === ''
            || !hash_equals($expectedHash, hash('sha256', $token))) {
            resetRespond(['error' => 'Not found.'], 404);
        }
        if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'POST'], true)) {
            resetRespond(['error' => 'Method not allowed.'], 405);
        }
    }

    $execute = $isCli
        ? in_array('--execute', $argv, true)
        : ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
    $confirmIndex = $isCli ? array_search('--confirm', $argv, true) : false;
    $providedConfirmation = $confirmIndex !== false
        ? (string) ($argv[$confirmIndex + 1] ?? '')
        : (string) ($_GET['confirm'] ?? '');

    $pdo = Database::connect($config['db']);
    $before = $scope === 'outdated' ? outdatedCounts($pdo, $targetVersion) : resetCounts($pdo);
    if (!$execute) {
        resetRespond([
            'mode' => 'preview',
            'scope' => $scope,
            'targetAnalyzerVersion' => $targetVersion,
            'requiredConfirmation' => $confirmation,
            'counts' => $before,
            'preserves' => ['sources', 'remote_replays', 'replays', 'replay_analysis', 'matches', 'player identities'],
            'deferredReanalysis' => $scope === 'outdated',
        ]);
    }
    if ($providedConfirmation !== $confirmation) {
        resetRespond(['error' => 'Confirmation does not match.', 'requiredConfirmation' => $confirmation], 422);
    }
    if (!empty($config['worker']['reanalysis_enabled'])) {
        resetRespond(['error' => 'Disable historical reanalysis before resetting.'], 409);
    }
    if ((int) $pdo->query("SELECT GET_LOCK('maway2000-analysis-reset', 0)")->fetchColumn() !== 1) {
        resetRespond(['error' => 'Another reset is already running.'], 409);
    }
    $locked = true;

    $pdo->beginTransaction();
    try {
        $playerWhere = $scope === 'outdated'
            ? outdatedAnalysisWhere() . " AND mp.stats_source = 'replay-engine'"
            : 'm.replay_id IS NOT NULL';
        $playerReset = $pdo->prepare(
            "UPDATE match_players mp JOIN matches m ON m.id = mp.match_id
             SET mp.result = NULL, mp.score = NULL, mp.kills = NULL,
                 mp.droids_built = NULL, mp.droids_lost = NULL,
                 mp.structures_built = NULL, mp.structures_lost = NULL,
                 mp.structures_destroyed = NULL, mp.research_complete = NULL,
                 mp.power = NULL, mp.oil_rigs = NULL, mp.remaining_droids = NULL,
                 mp.remaining_structures = NULL, mp.stats_source = 'replay', mp.raw_json = NULL
             WHERE " . $playerWhere
        );
        $playerReset->execute($scope === 'outdated' ? ['target_version' => $targetVersion] : []);

        $analysisReset = null;
        $legacyReset = null;
        if ($scope === 'all') {
            $analysisReset = $pdo->prepare(
                "UPDATE matches
                 SET telemetry_json = CASE
                     WHEN JSON_LENGTH(JSON_REMOVE(telemetry_json, '$.engineAnalysis')) = 0 THEN NULL
                     ELSE JSON_REMOVE(telemetry_json, '$.engineAnalysis')
                 END
                 WHERE replay_id IS NOT NULL
                   AND JSON_EXTRACT(telemetry_json, '$.engineAnalysis.status') IS NOT NULL"
            );
            $analysisReset->execute();

            $legacyReset = $pdo->prepare('DELETE FROM match_outcome_facts');
            $legacyReset->execute();
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    $leaderboards = (new LeaderboardCalculator($pdo))->publish(dirname(__DIR__) . '/data/leaderboards.json');
    $publication = (new Publisher($pdo, dirname(__DIR__) . '/data'))->publish();
    resetRespond([
        'mode' => 'executed',
        'scope' => $scope,
        'targetAnalyzerVersion' => $targetVersion,
        'before' => $before,
        'reset' => [
            'players' => $playerReset->rowCount(),
            'engineAnalyses' => $analysisReset?->rowCount() ?? 0,
            'legacyOutcomeFacts' => $legacyReset?->rowCount() ?? 0,
        ],
        'after' => $scope === 'outdated' ? outdatedCounts($pdo, $targetVersion) : resetCounts($pdo),
        'deferredReanalysis' => $scope === 'outdated',
        'leaderboards' => $leaderboards,
        'publication' => $publication,
    ]);
} catch (Throwable $error) {
    resetRespond(['error' => $error->getMessage()], 500);
} finally {
    if ($locked && $pdo instanceof PDO) {
        $pdo->query("SELECT RELEASE_LOCK('maway2000-analysis-reset')");
    }
}

