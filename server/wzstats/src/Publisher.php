<?php

declare(strict_types=1);

final class Publisher
{
    public const FORMAT = 1;

    public function __construct(private PDO $pdo, private string $directory)
    {
    }

    public function publish(): array
    {
        if (!is_dir($this->directory)
            && !mkdir($this->directory, 0775, true)
            && !is_dir($this->directory)) {
            throw new RuntimeException('Unable to create published-data directory.');
        }

        $cleanup = $this->cleanupProcessedReplays(20);
        $payload = [
            'format' => self::FORMAT,
            'matches' => $this->matches(),
        ];
        $matchesJson = $this->encode($payload);
        $matchesHash = hash('sha256', $matchesJson);
        $matchesPath = $this->directory . DIRECTORY_SEPARATOR . 'matches.json';
        $changed = !is_file($matchesPath) || hash_file('sha256', $matchesPath) !== $matchesHash;

        if ($changed) {
            $this->atomicWrite($matchesPath, $matchesJson);
        }

        $leaderboardsPath = $this->directory . DIRECTORY_SEPARATOR . 'leaderboards.json';
        $leaderboardsHash = is_file($leaderboardsPath) ? hash_file('sha256', $leaderboardsPath) : null;
        $leaderboardsBytes = is_file($leaderboardsPath) ? filesize($leaderboardsPath) : null;

        $manifestPath = $this->directory . DIRECTORY_SEPARATOR . 'manifest.json';
        $currentManifest = is_file($manifestPath)
            ? json_decode((string) file_get_contents($manifestPath), true)
            : null;
        $previousLeaderboardHash = $currentManifest['files']['leaderboards.json']['sha256'] ?? null;
        $leaderboardsChanged = $leaderboardsHash !== $previousLeaderboardHash;
        $publishedAt = $changed || $leaderboardsChanged || !is_array($currentManifest)
            ? gmdate('c')
            : (string) ($currentManifest['publishedAt'] ?? gmdate('c'));
        $manifest = [
            'format' => self::FORMAT,
            'publishedAt' => $publishedAt,
            'files' => [
                'matches.json' => [
                    'sha256' => $matchesHash,
                    'bytes' => strlen($matchesJson),
                    'matchesCount' => count($payload['matches']),
                ],
            ],
        ];
        if ($leaderboardsHash !== null) {
            $manifest['files']['leaderboards.json'] = [
                'sha256' => $leaderboardsHash,
                'bytes' => $leaderboardsBytes,
            ];
        }
        $manifestJson = $this->encode($manifest);
        if (!is_file($manifestPath) || file_get_contents($manifestPath) !== $manifestJson) {
            $this->atomicWrite($manifestPath, $manifestJson);
        }

        return [
            'changed' => $changed || $leaderboardsChanged,
            'publishedAt' => $publishedAt,
            'matches' => count($payload['matches']),
            'sha256' => $matchesHash,
            'leaderboardsSha256' => $leaderboardsHash,
            'cleanup' => $cleanup,
        ];
    }

    private function cleanupProcessedReplays(int $keepNewest): array
    {
        $statement = $this->pdo->query(
            'SELECT DISTINCT r.id, r.sha256, r.storage_path, r.size_bytes, r.downloaded_at
             FROM replays r
             JOIN replay_analysis ra ON ra.replay_id = r.id
             JOIN matches m ON m.replay_id = r.id
             ORDER BY r.downloaded_at DESC, r.id DESC'
        );
        $result = ['kept' => 0, 'deleted' => 0, 'bytesFreed' => 0, 'errors' => []];

        foreach ($statement->fetchAll() as $replay) {
            $path = (string) $replay['storage_path'];
            if (!is_file($path)) {
                continue;
            }
            if ($result['kept'] < $keepNewest) {
                $result['kept']++;
                continue;
            }
            if (basename($path) !== ((string) $replay['sha256'] . '.wzrp')) {
                $result['errors'][] = ['replayId' => (int) $replay['id'], 'message' => 'Unexpected replay storage path.'];
                continue;
            }
            if (!@unlink($path)) {
                $result['errors'][] = ['replayId' => (int) $replay['id'], 'message' => 'Unable to delete processed replay file.'];
                continue;
            }
            $result['deleted']++;
            $result['bytesFreed'] += (int) $replay['size_bytes'];
        }

        return $result;
    }

    private function matches(): array
    {
        $matches = $this->pdo->query(
            'SELECT m.id, s.source_key AS source, s.display_name AS source_label,
                    m.source_match_id, m.started_at, m.ended_at, m.duration_ms, m.map_name AS map,
                    m.game_type AS game, r.sha256 AS replay_sha256, r.filename AS replay_filename
             FROM matches m
             JOIN sources s ON s.id = m.source_id
             LEFT JOIN replays r ON r.id = m.replay_id
             WHERE r.sha256 IS NOT NULL
             ORDER BY m.started_at DESC, m.id DESC'
        )->fetchAll();
        if ($matches === []) {
            return [];
        }

        $ids = array_map('intval', array_column($matches, 'id'));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $playersStatement = $this->pdo->prepare(
            "SELECT match_id, position_number AS position, player_name AS name, team_number AS team, result,
                    score, kills, droids_built, droids_lost, structures_built, structures_lost,
                    structures_destroyed, research_complete, power, oil_rigs, remaining_droids,
                    remaining_structures, stats_source
             FROM match_players WHERE match_id IN ($placeholders) ORDER BY match_id, position_number"
        );
        $playersStatement->execute($ids);
        $playersByMatch = [];
        foreach ($playersStatement->fetchAll() as $player) {
            $playersByMatch[(int) $player['match_id']][] = $player;
        }

        foreach ($matches as &$match) {
            $match['players'] = $playersByMatch[(int) $match['id']] ?? [];
            $match['replay_url'] = 'https://onit.lt/wzstats/api/v1/replays/' . $match['replay_sha256'];
        }
        unset($match);
        return $matches;
    }

    private function encode(array $payload): string
    {
        return json_encode(
            $payload,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
        ) . "\n";
    }

    private function atomicWrite(string $path, string $contents): void
    {
        $temporaryPath = $path . '.tmp-' . bin2hex(random_bytes(4));
        if (file_put_contents($temporaryPath, $contents, LOCK_EX) === false
            || !rename($temporaryPath, $path)) {
            @unlink($temporaryPath);
            throw new RuntimeException('Unable to publish ' . basename($path) . '.');
        }
    }
}
