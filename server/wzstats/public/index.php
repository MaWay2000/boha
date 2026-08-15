<?php

declare(strict_types=1);

ini_set('display_errors', '0');

require_once dirname(__DIR__) . '/src/bootstrap.php';

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function applyCors(array $allowedOrigins): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 86400');
    }
}

function authorizeWorker(array $config): void
{
    $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    $token = str_starts_with($authorization, 'Bearer ') ? substr($authorization, 7) : '';
    $expectedHash = (string) ($config['worker']['token_hash'] ?? '');
    if ($expectedHash === '' || $token === '' || !hash_equals($expectedHash, hash('sha256', $token))) {
        respond(['error' => 'Not found.'], 404);
    }
}

function workerQueueStatus(PDO $pdo, string $targetVersion, bool $reanalysisEnabled): array
{
    $statement = $pdo->prepare(
        "SELECT COUNT(*) AS total,
                SUM(CASE WHEN JSON_EXTRACT(COALESCE(m.telemetry_json, JSON_OBJECT()), '$.engineAnalysis.status') IS NULL THEN 1 ELSE 0 END) AS unprocessed,
                SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.status')) = 'confirmed'
                    AND JSON_UNQUOTE(JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.analyzerVersion')) = :completed_version THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.status')) = 'unknown' THEN 1 ELSE 0 END) AS unknown_results,
                SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.status')) = 'error' THEN 1 ELSE 0 END) AS failed,
                SUM(CASE WHEN JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.status') IS NOT NULL
                    AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.analyzerVersion')), '') <> :outdated_version THEN 1 ELSE 0 END) AS outdated
         FROM matches m JOIN replays r ON r.id = m.replay_id"
    );
    $statement->execute([
        'completed_version' => $targetVersion,
        'outdated_version' => $targetVersion,
    ]);
    $row = $statement->fetch() ?: [];
    $status = [];
    foreach (['total', 'unprocessed', 'completed', 'unknown_results', 'failed', 'outdated'] as $key) {
        $status[$key === 'unknown_results' ? 'unknown' : $key] = (int) ($row[$key] ?? 0);
    }
    $status['pending'] = $status['unprocessed'] + ($reanalysisEnabled ? $status['outdated'] : 0);
    $status['targetAnalyzerVersion'] = $targetVersion;
    $status['reanalysisEnabled'] = $reanalysisEnabled;
    return $status;
}

try {
    $config = wzstats_config();
    $targetAnalyzerVersion = (string) ($config['worker']['analyzer_version'] ?? '3.2.0');
    $reanalysisEnabled = (bool) ($config['worker']['reanalysis_enabled'] ?? false);
    applyCors($config['cors_origins'] ?? []);
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    $pdo = Database::connect($config['db']);
    $requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $apiPosition = strpos($requestPath, '/api/');
    $path = $apiPosition === false ? '/' : substr($requestPath, $apiPosition + 4);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($path === '/v1/worker/status') {
        authorizeWorker($config);
        if ($method !== 'GET') {
            respond(['error' => 'Method not allowed.'], 405);
        }
        respond(['queue' => workerQueueStatus($pdo, $targetAnalyzerVersion, $reanalysisEnabled)]);
    }

    if ($path === '/v1/worker/jobs') {
        authorizeWorker($config);
        if ($method !== 'GET') {
            respond(['error' => 'Method not allowed.'], 405);
        }
        $limit = max(1, min(5, (int) ($_GET['limit'] ?? 1)));
        $reanalysisFilter = $reanalysisEnabled
            ? "OR (JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.status') IS NOT NULL
                AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(m.telemetry_json, '$.engineAnalysis.analyzerVersion')), '') <> :target_version)"
            : '';
        $statement = $pdo->prepare(
            "SELECT m.id, s.source_key AS source, m.source_match_id, m.started_at,
                    m.duration_ms, m.map_name AS map, r.sha256 AS replay_sha256,
                    r.filename AS replay_filename
             FROM matches m
             JOIN sources s ON s.id = m.source_id
             JOIN replays r ON r.id = m.replay_id
             WHERE (
                 EXISTS (
                     SELECT 1 FROM match_players mp
                     WHERE mp.match_id = m.id AND mp.stats_source = 'replay' AND mp.score IS NULL
                 )
                 AND JSON_EXTRACT(COALESCE(m.telemetry_json, JSON_OBJECT()), '$.engineAnalysis.status') IS NULL
                 $reanalysisFilter
             )
             ORDER BY m.started_at DESC, m.id DESC
             LIMIT :limit"
        );
        if ($reanalysisEnabled) {
            $statement->bindValue('target_version', $targetAnalyzerVersion);
        }
        $statement->bindValue('limit', $limit, PDO::PARAM_INT);
        $statement->execute();
        $jobs = $statement->fetchAll();
        foreach ($jobs as &$job) {
            $job['replay_url'] = 'https://onit.lt/wzstats/api/v1/replays/' . $job['replay_sha256'];
        }
        unset($job);
        respond([
            'jobs' => $jobs,
            'queue' => workerQueueStatus($pdo, $targetAnalyzerVersion, $reanalysisEnabled),
        ]);
    }

    if ($path === '/v1/worker/retry-failed') {
        authorizeWorker($config);
        if ($method !== 'POST') {
            respond(['error' => 'Method not allowed.'], 405);
        }
        $statement = $pdo->prepare(
            "UPDATE matches SET telemetry_json = JSON_REMOVE(telemetry_json, '$.engineAnalysis')
             WHERE JSON_UNQUOTE(JSON_EXTRACT(telemetry_json, '$.engineAnalysis.status')) IN ('error', 'unknown')"
        );
        $statement->execute();
        respond([
            'accepted' => true,
            'retried' => $statement->rowCount(),
            'queue' => workerQueueStatus($pdo, $targetAnalyzerVersion, $reanalysisEnabled),
        ]);
    }

    if ($path === '/v1/worker/results') {
        authorizeWorker($config);
        if ($method !== 'POST') {
            respond(['error' => 'Method not allowed.'], 405);
        }
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 8 * 1024 * 1024) {
            respond(['error' => 'Result is too large.'], 413);
        }
        $payload = json_decode((string) file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
        $matchId = (int) ($payload['matchId'] ?? 0);
        $analysis = is_array($payload['analysis'] ?? null) ? $payload['analysis'] : [];
        $status = (string) ($analysis['status'] ?? 'error');
        if ($matchId < 1 || !in_array($status, ['confirmed', 'unknown', 'error'], true)) {
            respond(['error' => 'Invalid worker result.'], 422);
        }
        if ($status !== 'error' && (string) ($analysis['analyzerVersion'] ?? '') !== $targetAnalyzerVersion) {
            respond(['error' => 'Analyzer version is not accepted by this server.'], 409);
        }

        $matchStatement = $pdo->prepare(
            'SELECT m.telemetry_json, r.sha256 FROM matches m
             JOIN replays r ON r.id = m.replay_id WHERE m.id = ?'
        );
        $matchStatement->execute([$matchId]);
        $matchRecord = $matchStatement->fetch();
        $reportedSha = strtolower((string) ($analysis['replay']['sha256'] ?? ''));
        if (!$matchRecord || !hash_equals((string) $matchRecord['sha256'], $reportedSha)) {
            respond(['error' => 'Replay does not match this job.'], 409);
        }

        $players = is_array($analysis['players'] ?? null) ? $analysis['players'] : [];
        if ($status === 'confirmed' && $players === []) {
            respond(['error' => 'Confirmed result has no players.'], 422);
        }
        $telemetry = $matchRecord['telemetry_json']
            ? json_decode((string) $matchRecord['telemetry_json'], true, 512, JSON_THROW_ON_ERROR)
            : [];
        $existingAnalysis = is_array($telemetry['engineAnalysis'] ?? null)
            ? $telemetry['engineAnalysis']
            : null;
        if ($existingAnalysis !== null
            && ($existingAnalysis['status'] ?? null) === $status
            && ($existingAnalysis['analyzerVersion'] ?? null) === ($analysis['analyzerVersion'] ?? null)
            && hash_equals((string) ($existingAnalysis['replaySha256'] ?? ''), $reportedSha)) {
            respond([
                'accepted' => true,
                'duplicate' => true,
                'matchId' => $matchId,
                'status' => $status,
                'updatedPlayers' => 0,
                'published' => false,
            ]);
        }
        $telemetry['engineAnalysis'] = [
            'status' => $status,
            'evidence' => $analysis['evidence'] ?? null,
            'replaySha256' => $reportedSha,
            'gameVersion' => $analysis['game']['version'] ?? null,
            'analyzerVersion' => $analysis['analyzerVersion'] ?? null,
            'analysisMilliseconds' => $analysis['analysisMilliseconds'] ?? null,
            'analyzedAt' => gmdate('c'),
            'error' => $analysis['error'] ?? null,
            'details' => is_array($analysis['details'] ?? null) ? $analysis['details'] : null,
            'extended' => is_array($analysis['extended'] ?? null) ? $analysis['extended'] : null,
        ];

        $updatedPlayers = 0;
        $pdo->beginTransaction();
        try {
            if ($status === 'confirmed') {
                $playerUpdate = $pdo->prepare(
                    "INSERT INTO match_players
                        (match_id, position_number, player_name, team_number, result, score, kills,
                         droids_built, droids_lost, structures_built, structures_lost, structures_destroyed,
                         research_complete, power, oil_rigs, remaining_droids, remaining_structures,
                         stats_source, raw_json)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'replay-engine', ?)
                     ON DUPLICATE KEY UPDATE
                        player_name = VALUES(player_name), team_number = VALUES(team_number),
                        result = VALUES(result), score = VALUES(score), kills = VALUES(kills),
                        droids_built = VALUES(droids_built), droids_lost = VALUES(droids_lost),
                        structures_built = VALUES(structures_built), structures_lost = VALUES(structures_lost),
                        structures_destroyed = VALUES(structures_destroyed),
                        research_complete = VALUES(research_complete), power = VALUES(power),
                        oil_rigs = VALUES(oil_rigs), remaining_droids = VALUES(remaining_droids),
                        remaining_structures = VALUES(remaining_structures),
                        stats_source = 'replay-engine', raw_json = VALUES(raw_json)"
                );
                foreach ($players as $player) {
                    if (!is_array($player) || !isset($player['position']) || !is_numeric($player['position'])) {
                        throw new RuntimeException('Worker result contains an invalid player position.');
                    }
                    $position = (int) $player['position'];
                    $playerUpdate->execute([
                        $matchId,
                        $position,
                        (string) ($player['name'] ?? 'Unknown player'),
                        isset($player['team']) && is_numeric($player['team']) ? (int) $player['team'] : null,
                        $player['state'] ?? null,
                        $player['score'] ?? null,
                        $player['kills'] ?? null,
                        $player['droidsBuilt'] ?? null,
                        $player['droidsLost'] ?? null,
                        $player['structuresBuilt'] ?? null,
                        $player['structuresLost'] ?? null,
                        $player['structureKills'] ?? null,
                        $player['researchComplete'] ?? null,
                        $player['power'] ?? null,
                        $player['oilRigs'] ?? null,
                        $player['droidsAlive'] ?? null,
                        $player['structuresAlive'] ?? null,
                        json_encode($player, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                    ]);
                    $updatedPlayers++;
                }
            }
            $updateMatch = $pdo->prepare('UPDATE matches SET telemetry_json = ? WHERE id = ?');
            $updateMatch->execute([
                json_encode($telemetry, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                $matchId,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        respond([
            'accepted' => true,
            'matchId' => $matchId,
            'status' => $status,
            'updatedPlayers' => $updatedPlayers,
            'published' => false,
            'publicationPending' => true,
        ]);
    }

    if ($method !== 'GET') {
        respond(['error' => 'Method not allowed.'], 405);
    }

    if ($path === '/v1/status') {
        $state = $pdo->query(
            "SELECT s.source_key, ss.cursor_value, ss.last_success_at, ss.last_error_at
             FROM sync_state ss JOIN sources s ON s.id = ss.source_id
             WHERE ss.sync_key = 'recent-1v1'"
        )->fetch() ?: null;
        respond(['ok' => true, 'service' => 'MaWay2000 wzstats', 'version' => 1, 'sync' => $state]);
    }

    if ($path === '/v1/matches') {
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 30)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));
        $source = trim((string) ($_GET['source'] ?? ''));
        $sourceFilter = $source !== '' ? ' WHERE s.source_key = :source' : '';
        $statement = $pdo->prepare(
            'SELECT m.id, s.source_key AS source, s.display_name AS source_label,
                    m.source_match_id, m.started_at, m.ended_at, m.duration_ms, m.map_name AS map,
                    m.game_type AS game, r.sha256 AS replay_sha256, r.filename AS replay_filename,
                    JSON_UNQUOTE(JSON_EXTRACT(m.metadata_json, "$.matchReportUrl")) AS match_report_url
             FROM matches m
             JOIN sources s ON s.id = m.source_id
             LEFT JOIN replays r ON r.id = m.replay_id
             ' . $sourceFilter . '
             ORDER BY m.started_at DESC, m.id DESC
             LIMIT :limit OFFSET :offset'
        );
        if ($source !== '') {
            $statement->bindValue('source', $source);
        }
        $statement->bindValue('limit', $limit, PDO::PARAM_INT);
        $statement->bindValue('offset', $offset, PDO::PARAM_INT);
        $statement->execute();
        $matches = $statement->fetchAll();

        if ($matches !== []) {
            $ids = array_column($matches, 'id');
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $playersStatement = $pdo->prepare(
                "SELECT match_id, position_number AS position, player_name AS name, team_number AS team,
                        CASE WHEN stats_source = 'replay-engine' THEN result ELSE NULL END AS result
                 FROM match_players WHERE match_id IN ($placeholders) ORDER BY match_id, position_number"
            );
            $playersStatement->execute($ids);
            $playersByMatch = [];
            foreach ($playersStatement->fetchAll() as $player) {
                $playersByMatch[$player['match_id']][] = $player;
            }
            foreach ($matches as &$match) {
                $match['players'] = $playersByMatch[$match['id']] ?? [];
                $match['replay_url'] = $match['replay_sha256']
                    ? '/wzstats/api/v1/replays/' . $match['replay_sha256']
                    : null;
            }
            unset($match);
        }
        respond(['matches' => $matches, 'limit' => $limit, 'offset' => $offset]);
    }

    if (preg_match('~^/v1/matches/(\d+)$~', $path, $match)) {
        $statement = $pdo->prepare(
            'SELECT m.*, s.source_key AS source, s.display_name AS source_label,
                    r.sha256 AS replay_sha256, r.filename AS replay_filename,
                    ra.parser_version AS replay_parser_version, ra.metadata_json AS replay_metadata_json,
                    ra.message_counts_json AS replay_message_counts_json
             FROM matches m
             JOIN sources s ON s.id = m.source_id
             LEFT JOIN replays r ON r.id = m.replay_id
             LEFT JOIN replay_analysis ra ON ra.replay_id = r.id
             WHERE m.id = ?'
        );
        $statement->execute([(int) $match[1]]);
        $record = $statement->fetch();
        if (!$record) {
            respond(['error' => 'Match not found.'], 404);
        }
        $players = $pdo->prepare('SELECT * FROM match_players WHERE match_id = ? ORDER BY position_number');
        $players->execute([(int) $record['id']]);
        $record['players'] = $players->fetchAll();
        $privateStatFields = [
            'result', 'score', 'kills', 'droids_built', 'droids_lost', 'structures_built',
            'structures_lost', 'structures_destroyed', 'research_complete', 'power', 'oil_rigs',
            'remaining_droids', 'remaining_structures', 'raw_json',
        ];
        foreach ($record['players'] as &$player) {
            if (($player['stats_source'] ?? null) !== 'replay-engine') {
                foreach ($privateStatFields as $field) {
                    $player[$field] = null;
                }
            }
        }
        unset($player);
        $record['metadata'] = $record['metadata_json'] ? json_decode($record['metadata_json'], true) : null;
        $record['telemetry'] = $record['telemetry_json'] ? json_decode($record['telemetry_json'], true) : null;
        if (is_array($record['telemetry']['engineAnalysis']['extended'] ?? null)) {
            $extended = &$record['telemetry']['engineAnalysis']['extended'];
            if (($extended['snapshotsEncoding'] ?? null) === 'gzip+base64'
                && is_string($extended['snapshotsGzipBase64'] ?? null)) {
                $compressedSnapshots = base64_decode($extended['snapshotsGzipBase64'], true);
                $snapshotJson = $compressedSnapshots === false ? false : @gzdecode($compressedSnapshots);
                if (is_string($snapshotJson)) {
                    $decodedSnapshots = json_decode($snapshotJson, true);
                    if (is_array($decodedSnapshots)) {
                        $extended['snapshots'] = $decodedSnapshots;
                    }
                }
                unset($extended['snapshotsGzipBase64']);
            }
            if (is_array($extended['tacticalReplay'] ?? null)) {
                $tactical = &$extended['tacticalReplay'];
                if (($tactical['positionFramesEncoding'] ?? null) === 'gzip+base64'
                    && is_string($tactical['positionFramesGzipBase64'] ?? null)) {
                    $compressedFrames = base64_decode($tactical['positionFramesGzipBase64'], true);
                    $frameJson = $compressedFrames === false ? false : @gzdecode($compressedFrames);
                    if (is_string($frameJson)) {
                        $decodedFrames = json_decode($frameJson, true);
                        if (is_array($decodedFrames)) {
                            $tactical['positionFrames'] = $decodedFrames;
                        }
                    }
                    unset($tactical['positionFramesGzipBase64']);
                }
                unset($tactical);
            }
            unset($extended);
        }
        $record['replay_analysis'] = $record['replay_metadata_json']
            ? json_decode($record['replay_metadata_json'], true)
            : null;
        if ($record['replay_analysis'] !== null) {
            $record['replay_analysis']['messages'] = $record['replay_message_counts_json']
                ? json_decode($record['replay_message_counts_json'], true)
                : null;
        }
        unset(
            $record['metadata_json'],
            $record['telemetry_json'],
            $record['replay_metadata_json'],
            $record['replay_message_counts_json']
        );
        respond(['match' => $record]);
    }

    if (preg_match('~^/v1/replays/([a-f0-9]{64})$~', $path, $match)) {
        $statement = $pdo->prepare('SELECT filename, storage_path, source_url, size_bytes FROM replays WHERE sha256 = ?');
        $statement->execute([$match[1]]);
        $replay = $statement->fetch();
        if (!$replay) {
            respond(['error' => 'Replay not found.'], 404);
        }
        if (is_file($replay['storage_path'])) {
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="' . str_replace('"', '', $replay['filename']) . '"');
            header('Content-Length: ' . (int) $replay['size_bytes']);
            header('Cache-Control: public, max-age=86400, immutable');
            readfile($replay['storage_path']);
            exit;
        }
        $sourceUrl = (string) $replay['source_url'];
        $scheme = strtolower((string) parse_url($sourceUrl, PHP_URL_SCHEME));
        if (!filter_var($sourceUrl, FILTER_VALIDATE_URL) || !in_array($scheme, ['http', 'https'], true)) {
            respond(['error' => 'Replay source is unavailable.'], 404);
        }
        $handle = curl_init($sourceUrl);
        if ($handle === false) {
            respond(['error' => 'Replay source is unavailable.'], 502);
        }
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_USERAGENT => 'MaWay2000-wzstats/1.0',
        ]);
        $bytes = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);
        if (!is_string($bytes) || $status < 200 || $status >= 300 || !str_starts_with($bytes, 'WZrp')) {
            respond(['error' => 'Replay source is unavailable.'], 502);
        }
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . str_replace('"', '', $replay['filename']) . '"');
        header('Content-Length: ' . strlen($bytes));
        header('Cache-Control: public, max-age=3600');
        echo $bytes;
        exit;
    }

    respond(['error' => 'Endpoint not found.'], 404);
} catch (Throwable $error) {
    error_log('[wzstats-api] ' . $error->getMessage());
    @file_put_contents(
        dirname(__DIR__) . '/storage/logs/api-error.log',
        '[' . gmdate('c') . '] ' . $error::class . ': ' . $error->getMessage() . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
    respond(['error' => 'Service unavailable.'], 503);
}
