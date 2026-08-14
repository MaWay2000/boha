<?php

declare(strict_types=1);

final class LegacyOutcomeImporter
{
    public function __construct(private PDO $pdo)
    {
    }

    public function import(string $path): array
    {
        if (!is_file($path)) {
            throw new RuntimeException('Legacy outcome artifact is missing.');
        }
        $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (($payload['format'] ?? null) !== 1 || !is_array($payload['matches'] ?? null)) {
            throw new RuntimeException('Unsupported legacy outcome artifact.');
        }

        $sources = [];
        foreach ($this->pdo->query('SELECT id, source_key FROM sources')->fetchAll() as $source) {
            $sources[(string) $source['source_key']] = (int) $source['id'];
        }
        $statement = $this->pdo->prepare(
            'INSERT INTO match_outcome_facts
                (source_id, source_match_id, result_source, legacy_order, game_json, players_json, imported_at)
             VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE result_source = VALUES(result_source), legacy_order = VALUES(legacy_order), game_json = VALUES(game_json),
                players_json = VALUES(players_json), imported_at = VALUES(imported_at)'
        );
        $imported = 0;
        $skipped = 0;
        $this->pdo->beginTransaction();
        try {
            foreach ($payload['matches'] as $match) {
                $sourceId = $sources[(string) ($match['source'] ?? '')] ?? null;
                if ($sourceId === null || empty($match['sourceMatchId'])) {
                    $skipped++;
                    continue;
                }
                $statement->execute([
                    $sourceId,
                    (string) $match['sourceMatchId'],
                    (string) ($match['resultSource'] ?? 'legacy'),
                    (int) ($match['legacyOrder'] ?? 0),
                    json_encode($match['game'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                    json_encode($match['players'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                ]);
                $imported++;
            }
            $this->pdo->commit();
        } catch (Throwable $error) {
            $this->pdo->rollBack();
            throw $error;
        }
        return ['imported' => $imported, 'skipped' => $skipped];
    }
}
