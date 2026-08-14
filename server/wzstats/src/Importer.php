<?php

declare(strict_types=1);

final class Importer
{
    private const SOURCE_KEY = 'wz2100.uk';

    public function __construct(
        private PDO $pdo,
        private Wz2100UkClient $client,
        private string $replayDirectory
    ) {
    }

    public function sync(int $limit): array
    {
        $sourceId = $this->sourceId();
        $archive = $this->client->recentMatches($limit);
        $result = ['found' => count($archive), 'imported' => 0, 'skipped' => 0, 'errors' => []];

        foreach ($archive as $entry) {
            $matchId = (string) $entry['sourceMatchId'];
            try {
                if ($this->hasMatch($sourceId, $matchId)) {
                    $result['skipped']++;
                    continue;
                }

                $detail = $this->client->matchDetail($matchId);
                $replay = $this->client->replay($matchId);
                $this->store($sourceId, $entry, $detail, $replay);
                $result['imported']++;
            } catch (Throwable $error) {
                $result['errors'][] = ['sourceMatchId' => $matchId, 'message' => $error->getMessage()];
            }
        }

        $this->recordSync($sourceId, $archive, $result);
        return $result;
    }

    private function sourceId(): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO sources (source_key, display_name, base_url)
             VALUES (:source_key, :display_name, :base_url)
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), display_name = VALUES(display_name), base_url = VALUES(base_url)'
        );
        $statement->execute([
            'source_key' => self::SOURCE_KEY,
            'display_name' => 'Sunshine / wz2100.uk',
            'base_url' => 'https://wz2100.uk',
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    private function hasMatch(int $sourceId, string $matchId): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM matches WHERE source_id = ? AND source_match_id = ? LIMIT 1');
        $statement->execute([$sourceId, $matchId]);
        return (bool) $statement->fetchColumn();
    }

    private function store(int $sourceId, array $archive, array $detail, array $replay): void
    {
        if (!is_dir($this->replayDirectory) && !mkdir($this->replayDirectory, 0770, true) && !is_dir($this->replayDirectory)) {
            throw new RuntimeException('Unable to create replay storage directory.');
        }

        $storageName = $replay['sha256'] . '.wzrp';
        $storagePath = rtrim($this->replayDirectory, '/\\') . DIRECTORY_SEPARATOR . $storageName;
        if (!is_file($storagePath)) {
            $temporaryPath = $storagePath . '.tmp-' . bin2hex(random_bytes(4));
            if (file_put_contents($temporaryPath, $replay['bytes'], LOCK_EX) === false || !rename($temporaryPath, $storagePath)) {
                @unlink($temporaryPath);
                throw new RuntimeException('Unable to store replay ' . $replay['filename'] . '.');
            }
        }

        [$startedAt, $endedAt] = $this->matchTimes($replay['filename'], $detail['durationMs']);
        $metadata = $detail['rawMetadata'];
        $metadata['archive'] = $archive;
        $metadata['matchReportUrl'] = $detail['matchReportUrl'];
        $metadata['replayFilename'] = $replay['filename'];

        $this->pdo->beginTransaction();
        try {
            $replayStatement = $this->pdo->prepare(
                'INSERT INTO replays (sha256, filename, storage_path, source_url, size_bytes)
                 VALUES (:sha256, :filename, :storage_path, :source_url, :size_bytes)
                 ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), filename = VALUES(filename), source_url = VALUES(source_url)'
            );
            $replayStatement->execute([
                'sha256' => $replay['sha256'],
                'filename' => $replay['filename'],
                'storage_path' => $storagePath,
                'source_url' => $replay['sourceUrl'],
                'size_bytes' => $replay['sizeBytes'],
            ]);
            $replayId = (int) $this->pdo->lastInsertId();

            $matchStatement = $this->pdo->prepare(
                'INSERT INTO matches
                    (source_id, source_match_id, replay_id, started_at, ended_at, duration_ms, map_name, game_type, status, metadata_json, telemetry_json)
                 VALUES
                    (:source_id, :source_match_id, :replay_id, :started_at, :ended_at, :duration_ms, :map_name, :game_type, :status, :metadata_json, :telemetry_json)'
            );
            $matchStatement->execute([
                'source_id' => $sourceId,
                'source_match_id' => $detail['sourceMatchId'],
                'replay_id' => $replayId,
                'started_at' => $startedAt,
                'ended_at' => $endedAt,
                'duration_ms' => $detail['durationMs'],
                'map_name' => $detail['map'],
                'game_type' => '1v1 Human',
                'status' => 'completed',
                'metadata_json' => json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                'telemetry_json' => json_encode($detail['telemetry'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ]);
            $matchDatabaseId = (int) $this->pdo->lastInsertId();

            $playerStatement = $this->pdo->prepare(
                'INSERT INTO match_players
                    (match_id, position_number, player_name, team_number, result, score, kills, droids_built, droids_lost,
                     structures_built, structures_lost, structures_destroyed, research_complete, power, oil_rigs,
                     remaining_droids, remaining_structures, stats_source, raw_json)
                 VALUES
                    (:match_id, :position_number, :player_name, :team_number, :result, :score, :kills, :droids_built, :droids_lost,
                     :structures_built, :structures_lost, :structures_destroyed, :research_complete, :power, :oil_rigs,
                     :remaining_droids, :remaining_structures, :stats_source, :raw_json)'
            );
            foreach ($detail['players'] as $player) {
                $playerStatement->execute([
                    'match_id' => $matchDatabaseId,
                    'position_number' => $player['position'],
                    'player_name' => $player['name'],
                    'team_number' => $player['position'],
                    'result' => $player['result'],
                    'score' => $player['score'],
                    'kills' => $player['kills'],
                    'droids_built' => $player['droidsBuilt'],
                    'droids_lost' => $player['droidsLost'],
                    'structures_built' => null,
                    'structures_lost' => null,
                    'structures_destroyed' => $player['structuresDestroyed'],
                    'research_complete' => $player['researchComplete'],
                    'power' => $player['power'],
                    'oil_rigs' => $player['oilRigs'],
                    'remaining_droids' => null,
                    'remaining_structures' => null,
                    'stats_source' => self::SOURCE_KEY,
                    'raw_json' => json_encode($player, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                ]);
            }

            $this->pdo->commit();
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    private function matchTimes(string $filename, ?int $durationMs): array
    {
        $startedAt = null;
        $endedAt = null;
        if (preg_match('/^(\d{8}_\d{6})_/', $filename, $match)) {
            $date = DateTimeImmutable::createFromFormat('!Ymd_His', $match[1], new DateTimeZone('UTC'));
            if ($date instanceof DateTimeImmutable) {
                $startedAt = $date->format('Y-m-d H:i:s');
                if ($durationMs !== null) {
                    $endedAt = $date->modify('+' . $durationMs . ' milliseconds')->format('Y-m-d H:i:s');
                }
            }
        }
        return [$startedAt, $endedAt];
    }

    private function recordSync(int $sourceId, array $archive, array $result): void
    {
        $latestId = $archive[0]['sourceMatchId'] ?? null;
        $lastError = $result['errors'] === [] ? null : json_encode($result['errors'], JSON_UNESCAPED_UNICODE);
        $statement = $this->pdo->prepare(
            'INSERT INTO sync_state (source_id, sync_key, cursor_value, last_success_at, last_error_at, last_error)
             VALUES (:source_id, :sync_key, :cursor_value, :last_success_at, :last_error_at, :last_error)
             ON DUPLICATE KEY UPDATE cursor_value = VALUES(cursor_value), last_success_at = VALUES(last_success_at),
                 last_error_at = VALUES(last_error_at), last_error = VALUES(last_error)'
        );
        $statement->execute([
            'source_id' => $sourceId,
            'sync_key' => 'recent-1v1',
            'cursor_value' => $latestId,
            'last_success_at' => $result['errors'] === [] ? gmdate('Y-m-d H:i:s') : null,
            'last_error_at' => $result['errors'] === [] ? null : gmdate('Y-m-d H:i:s'),
            'last_error' => $lastError,
        ]);
    }
}

