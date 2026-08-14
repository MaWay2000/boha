<?php

declare(strict_types=1);

final class ReplayProcessor
{
    public function __construct(private PDO $pdo, private ReplayParser $parser)
    {
    }

    public function processPending(int $limit): array
    {
        $statement = $this->pdo->prepare(
            'SELECT r.id, r.storage_path FROM replays r
             LEFT JOIN replay_analysis ra ON ra.replay_id = r.id
             WHERE ra.replay_id IS NULL ORDER BY r.id LIMIT :limit'
        );
        $statement->bindValue('limit', max(1, min(100, $limit)), PDO::PARAM_INT);
        $statement->execute();
        $result = ['found' => 0, 'parsed' => 0, 'errors' => []];

        foreach ($statement->fetchAll() as $replay) {
            $result['found']++;
            $startedAt = gmdate('Y-m-d H:i:s');
            $run = $this->pdo->prepare(
                'INSERT INTO parser_runs (replay_id, parser_version, status, started_at) VALUES (?, ?, ?, ?)'
            );
            $run->execute([(int) $replay['id'], ReplayParser::VERSION, 'running', $startedAt]);
            $runId = (int) $this->pdo->lastInsertId();

            try {
                $bytes = file_get_contents($replay['storage_path']);
                if ($bytes === false) {
                    throw new RuntimeException('Unable to read stored replay.');
                }
                $analysis = $this->parser->parse($bytes);
                $messages = $analysis['messages'];
                unset($analysis['messages']);

                $this->pdo->beginTransaction();
                $insert = $this->pdo->prepare(
                    'INSERT INTO replay_analysis (replay_id, parser_version, metadata_json, message_counts_json, parsed_at)
                     VALUES (?, ?, ?, ?, ?)'
                );
                $insert->execute([
                    (int) $replay['id'],
                    ReplayParser::VERSION,
                    json_encode($analysis, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    json_encode($messages, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                    gmdate('Y-m-d H:i:s'),
                ]);
                $finish = $this->pdo->prepare(
                    'UPDATE parser_runs SET status = ?, finished_at = ? WHERE id = ?'
                );
                $finish->execute(['completed', gmdate('Y-m-d H:i:s'), $runId]);
                $this->pdo->commit();
                $result['parsed']++;
            } catch (Throwable $error) {
                if ($this->pdo->inTransaction()) {
                    $this->pdo->rollBack();
                }
                $finish = $this->pdo->prepare(
                    'UPDATE parser_runs SET status = ?, error_message = ?, finished_at = ? WHERE id = ?'
                );
                $finish->execute(['failed', $error->getMessage(), gmdate('Y-m-d H:i:s'), $runId]);
                $result['errors'][] = ['replayId' => (int) $replay['id'], 'message' => $error->getMessage()];
            }
        }

        return $result;
    }
}

