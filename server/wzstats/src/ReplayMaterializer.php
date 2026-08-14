<?php

declare(strict_types=1);

final class ReplayMaterializer
{
    public function __construct(private PDO $pdo)
    {
    }

    public function materialize(int $limit): array
    {
        $statement = $this->pdo->prepare(
            "SELECT rr.id AS remote_replay_id, rr.remote_id, rr.filename, rr.source_url, rr.replay_id,
                    s.id AS source_id, s.source_key, ra.parser_version, ra.metadata_json
             FROM remote_replays rr
             JOIN sources s ON s.id = rr.source_id
             JOIN replay_analysis ra ON ra.replay_id = rr.replay_id
             LEFT JOIN matches m ON m.source_id = rr.source_id AND m.source_match_id = rr.remote_id
             WHERE rr.status = 'downloaded' AND m.id IS NULL
             ORDER BY rr.downloaded_at DESC, rr.id DESC
             LIMIT :limit"
        );
        $statement->bindValue('limit', max(1, min(200, $limit)), PDO::PARAM_INT);
        $statement->execute();
        $records = $statement->fetchAll();
        $result = ['found' => count($records), 'created' => 0, 'errors' => []];

        foreach ($records as $record) {
            try {
                $analysis = json_decode((string) $record['metadata_json'], true, 512, JSON_THROW_ON_ERROR);
                $this->store($record, $analysis);
                $result['created']++;
            } catch (Throwable $error) {
                $result['errors'][] = [
                    'source' => $record['source_key'],
                    'remoteId' => $record['remote_id'],
                    'message' => $error->getMessage(),
                ];
            }
        }
        return $result;
    }

    private function store(array $record, array $analysis): void
    {
        $match = is_array($analysis['match'] ?? null) ? $analysis['match'] : [];
        $players = is_array($analysis['players'] ?? null) ? $analysis['players'] : [];
        $durationMs = isset($match['elapsedMilliseconds']) && is_numeric($match['elapsedMilliseconds'])
            ? (int) $match['elapsedMilliseconds']
            : null;
        $startedAt = $this->startedAt((string) $record['filename'], (string) $record['remote_id']);
        $endedAt = $startedAt !== null && $durationMs !== null
            ? $startedAt->modify('+' . $durationMs . ' milliseconds')
            : null;
        $metadata = [
            'canonicalSource' => 'replay',
            'remoteReplayId' => $record['remote_id'],
            'remoteReplayUrl' => $record['source_url'],
            'parserVersion' => $record['parser_version'],
        ];

        $this->pdo->beginTransaction();
        try {
            $matchStatement = $this->pdo->prepare(
                'INSERT INTO matches
                    (source_id, source_match_id, replay_id, started_at, ended_at, duration_ms, map_name,
                     game_type, status, metadata_json, parser_version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $matchStatement->execute([
                (int) $record['source_id'],
                (string) $record['remote_id'],
                (int) $record['replay_id'],
                $startedAt?->format('Y-m-d H:i:s'),
                $endedAt?->format('Y-m-d H:i:s'),
                $durationMs,
                isset($match['map']) ? (string) $match['map'] : null,
                'Replay',
                'completed',
                json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                (string) $record['parser_version'],
            ]);
            $matchId = (int) $this->pdo->lastInsertId();
            $playerStatement = $this->pdo->prepare(
                'INSERT INTO match_players
                    (match_id, position_number, player_name, team_number, stats_source, raw_json)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            foreach ($players as $fallbackPosition => $player) {
                if (!is_array($player) || !empty($player['spectator'])) {
                    continue;
                }
                $position = isset($player['position']) && is_numeric($player['position'])
                    ? (int) $player['position']
                    : $fallbackPosition;
                $playerStatement->execute([
                    $matchId,
                    $position,
                    (string) ($player['name'] ?? 'Unknown player'),
                    isset($player['team']) && is_numeric($player['team']) ? (int) $player['team'] : null,
                    'replay',
                    json_encode($player, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
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

    private function startedAt(string $filename, string $remoteId): ?DateTimeImmutable
    {
        if (preg_match('/^(\d{8}_\d{6})_/', $filename, $match)) {
            $date = DateTimeImmutable::createFromFormat('!Ymd_His', $match[1], new DateTimeZone('UTC'));
            return $date instanceof DateTimeImmutable ? $date : null;
        }
        if (preg_match('/^\d{13}$/', $remoteId)) {
            return (new DateTimeImmutable('@' . intdiv((int) $remoteId, 1000)))->setTimezone(new DateTimeZone('UTC'));
        }
        return null;
    }
}
