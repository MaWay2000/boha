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

try {
    $config = wzstats_config();
    applyCors($config['cors_origins'] ?? []);
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        respond(['error' => 'Method not allowed.'], 405);
    }

    $pdo = Database::connect($config['db']);
    $requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $apiPosition = strpos($requestPath, '/api/');
    $path = $apiPosition === false ? '/' : substr($requestPath, $apiPosition + 4);

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
                "SELECT match_id, position_number AS position, player_name AS name, team_number AS team, result
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
        $record['metadata'] = $record['metadata_json'] ? json_decode($record['metadata_json'], true) : null;
        $record['telemetry'] = $record['telemetry_json'] ? json_decode($record['telemetry_json'], true) : null;
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
    respond(['error' => 'Service unavailable.'], 503);
}
