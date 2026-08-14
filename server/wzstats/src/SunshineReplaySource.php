<?php

declare(strict_types=1);

final class SunshineReplaySource
{
    public function __construct(private Wz2100UkClient $client, private int $scanLimit = 50)
    {
    }

    public function key(): string
    {
        return 'wz2100.uk';
    }

    public function displayName(): string
    {
        return 'Sunshine / wz2100.uk';
    }

    public function baseUrl(): string
    {
        return 'https://wz2100.uk';
    }

    public function discover(): array
    {
        return array_map(function (array $match): array {
            $matchId = (string) $match['sourceMatchId'];
            return [
                'remoteId' => $matchId,
                'filename' => 'wz2100uk-' . $matchId . '.wzrp',
                'sourceUrl' => $this->baseUrl() . '/1v1/replay/' . rawurlencode($matchId),
            ];
        }, $this->client->recentMatches(max(1, min(50, $this->scanLimit))));
    }
}
