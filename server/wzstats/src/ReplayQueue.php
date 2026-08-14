<?php

declare(strict_types=1);

final class ReplayQueue
{
    public function __construct(private PDO $pdo, private string $replayDirectory, private int $timeoutSeconds = 60)
    {
    }

    public function discover(object $source, array $entries): array
    {
        $sourceId = $this->sourceId($source->key(), $source->displayName(), $source->baseUrl());
        $existingStatement = $this->pdo->prepare(
            'SELECT rr.id, rr.status FROM remote_replays rr WHERE rr.source_id = ? AND rr.remote_id = ?'
        );
        $matchStatement = $this->pdo->prepare(
            'SELECT replay_id FROM matches WHERE source_id = ? AND source_match_id = ? AND replay_id IS NOT NULL LIMIT 1'
        );
        $insertStatement = $this->pdo->prepare(
            'INSERT INTO remote_replays
                (source_id, remote_id, filename, source_url, status, replay_id, discovered_at, last_seen_at, downloaded_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $updateStatement = $this->pdo->prepare(
            'UPDATE remote_replays SET filename = ?, source_url = ?, last_seen_at = ? WHERE id = ?'
        );
        $now = gmdate('Y-m-d H:i:s');
        $result = ['source' => $source->key(), 'found' => count($entries), 'new' => 0, 'known' => 0];

        foreach ($entries as $entry) {
            $remoteId = (string) ($entry['remoteId'] ?? '');
            $filename = basename((string) ($entry['filename'] ?? ''));
            $sourceUrl = (string) ($entry['sourceUrl'] ?? '');
            if ($remoteId === '' || $filename === '' || !filter_var($sourceUrl, FILTER_VALIDATE_URL)) {
                continue;
            }

            $existingStatement->execute([$sourceId, $remoteId]);
            $existing = $existingStatement->fetch();
            if ($existing) {
                $updateStatement->execute([$filename, $sourceUrl, $now, (int) $existing['id']]);
                $result['known']++;
                continue;
            }

            $matchStatement->execute([$sourceId, $remoteId]);
            $replayId = $matchStatement->fetchColumn();
            $downloaded = $replayId !== false;
            $insertStatement->execute([
                $sourceId,
                $remoteId,
                $filename,
                $sourceUrl,
                $downloaded ? 'downloaded' : 'pending',
                $downloaded ? (int) $replayId : null,
                $now,
                $now,
                $downloaded ? $now : null,
            ]);
            $result['new']++;
        }
        return $result;
    }

    public function downloadPending(string $sourceKey, int $limit): array
    {
        $statement = $this->pdo->prepare(
            "SELECT rr.id, rr.remote_id, rr.filename, rr.source_url
             FROM remote_replays rr
             JOIN sources s ON s.id = rr.source_id
             WHERE s.source_key = :source AND rr.status IN ('pending', 'retry')
             ORDER BY CAST(rr.remote_id AS UNSIGNED) DESC, rr.id DESC
             LIMIT :limit"
        );
        $statement->bindValue('source', $sourceKey);
        $statement->bindValue('limit', max(1, min(100, $limit)), PDO::PARAM_INT);
        $statement->execute();
        $pending = $statement->fetchAll();
        $result = ['source' => $sourceKey, 'found' => count($pending), 'downloaded' => 0, 'deduplicated' => 0, 'missing' => 0, 'errors' => []];

        foreach ($pending as $remote) {
            $remoteId = (int) $remote['id'];
            $this->pdo->prepare(
                "UPDATE remote_replays SET status = 'downloading', attempts = attempts + 1, last_attempt_at = ? WHERE id = ?"
            )->execute([gmdate('Y-m-d H:i:s'), $remoteId]);
            try {
                $download = $this->download((string) $remote['source_url']);
                if ($download['status'] === 404) {
                    $this->markFailed($remoteId, 'missing', 'Remote replay returned HTTP 404.');
                    $result['missing']++;
                    continue;
                }
                if ($download['status'] < 200 || $download['status'] >= 300) {
                    throw new RuntimeException('Remote replay returned HTTP ' . $download['status'] . '.');
                }
                if (!str_starts_with($download['body'], 'WZrp')) {
                    throw new RuntimeException('Downloaded file has no WZrp header.');
                }

                $filename = $download['filename'] !== null
                    ? basename($download['filename'])
                    : (string) $remote['filename'];
                $sha256 = hash('sha256', $download['body']);
                $known = $this->pdo->prepare('SELECT id FROM replays WHERE sha256 = ?');
                $known->execute([$sha256]);
                $knownReplayId = $known->fetchColumn();
                $replayId = $knownReplayId !== false
                    ? (int) $knownReplayId
                    : $this->storeReplay($sha256, $filename, (string) $remote['source_url'], $download['body']);
                $this->pdo->prepare(
                    "UPDATE remote_replays
                     SET status = 'downloaded', filename = ?, replay_id = ?, downloaded_at = ?, last_error = NULL
                     WHERE id = ?"
                )->execute([$filename, $replayId, gmdate('Y-m-d H:i:s'), $remoteId]);
                $knownReplayId === false ? $result['downloaded']++ : $result['deduplicated']++;
            } catch (Throwable $error) {
                $this->markFailed($remoteId, 'retry', $error->getMessage());
                $result['errors'][] = ['remoteId' => $remote['remote_id'], 'message' => $error->getMessage()];
            }
        }
        return $result;
    }

    private function sourceId(string $key, string $displayName, string $baseUrl): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO sources (source_key, display_name, base_url)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), display_name = VALUES(display_name), base_url = VALUES(base_url)'
        );
        $statement->execute([$key, $displayName, $baseUrl]);
        return (int) $this->pdo->lastInsertId();
    }

    private function download(string $url): array
    {
        $filename = null;
        $handle = curl_init($url);
        if ($handle === false) {
            throw new RuntimeException('Unable to initialize replay download.');
        }
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
            CURLOPT_USERAGENT => 'MaWay2000-wzstats/1.0',
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$filename): int {
                if (preg_match('/^Content-Disposition:.*filename="?([^";]+)"?/i', trim($line), $match)) {
                    $filename = $match[1];
                }
                return strlen($line);
            },
        ]);
        $body = curl_exec($handle);
        $error = curl_error($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);
        if (!is_string($body)) {
            throw new RuntimeException('Replay download failed' . ($error !== '' ? ': ' . $error : '.'));
        }
        return ['status' => $status, 'body' => $body, 'filename' => $filename];
    }

    private function storeReplay(string $sha256, string $filename, string $sourceUrl, string $bytes): int
    {
        if (!is_dir($this->replayDirectory)
            && !mkdir($this->replayDirectory, 0770, true)
            && !is_dir($this->replayDirectory)) {
            throw new RuntimeException('Unable to create replay storage directory.');
        }
        $storagePath = rtrim($this->replayDirectory, '/\\') . DIRECTORY_SEPARATOR . $sha256 . '.wzrp';
        if (!is_file($storagePath)) {
            $temporaryPath = $storagePath . '.tmp-' . bin2hex(random_bytes(4));
            if (file_put_contents($temporaryPath, $bytes, LOCK_EX) === false || !rename($temporaryPath, $storagePath)) {
                @unlink($temporaryPath);
                throw new RuntimeException('Unable to store replay file.');
            }
        }
        $statement = $this->pdo->prepare(
            'INSERT INTO replays (sha256, filename, storage_path, source_url, size_bytes) VALUES (?, ?, ?, ?, ?)'
        );
        $statement->execute([$sha256, $filename, $storagePath, $sourceUrl, strlen($bytes)]);
        return (int) $this->pdo->lastInsertId();
    }

    private function markFailed(int $remoteId, string $status, string $message): void
    {
        $this->pdo->prepare('UPDATE remote_replays SET status = ?, last_error = ? WHERE id = ?')
            ->execute([$status, mb_substr($message, 0, 4000), $remoteId]);
    }
}
