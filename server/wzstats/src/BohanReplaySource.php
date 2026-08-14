<?php

declare(strict_types=1);

final class BohanReplaySource
{
    private const MANIFEST_URL = 'https://raw.githubusercontent.com/MaWay2000/boha/main/stats/upstream-manifest.json';

    public function key(): string
    {
        return 'bohan';
    }

    public function displayName(): string
    {
        return 'Bohan / Retropaganda';
    }

    public function baseUrl(): string
    {
        return 'https://warzone2100.retropaganda.info';
    }

    public function discover(): array
    {
        $handle = curl_init(self::MANIFEST_URL);
        if ($handle === false) {
            throw new RuntimeException('Unable to initialize Bohan replay-list request.');
        }
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_USERAGENT => 'MaWay2000-wzstats/1.0',
        ]);
        $body = curl_exec($handle);
        $error = curl_error($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);
        if (!is_string($body) || $status !== 200) {
            throw new RuntimeException('Bohan replay list failed with HTTP ' . $status . ($error !== '' ? ': ' . $error : '.'));
        }

        $manifest = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        $offsets = $manifest['files']['results-snapshot.json']['replayOffsets'] ?? null;
        if (!is_array($offsets)) {
            throw new RuntimeException('Bohan replay list has no replay IDs.');
        }

        $entries = [];
        foreach (array_keys($offsets) as $replayId) {
            $replayId = (string) $replayId;
            $entries[] = [
                'remoteId' => $replayId,
                'filename' => $replayId . '.wzrp',
                'sourceUrl' => $this->baseUrl() . '/replays/' . rawurlencode($replayId) . '.wzrp',
            ];
        }
        return $entries;
    }
}
