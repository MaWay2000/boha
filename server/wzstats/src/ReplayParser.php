<?php

declare(strict_types=1);

final class ReplayParser
{
    public const VERSION = '1.0.0';

    public function parse(string $bytes): array
    {
        $length = strlen($bytes);
        if ($length < 16) {
            throw new RuntimeException('Replay is too small.');
        }
        if (substr($bytes, 0, 4) !== 'WZrp') {
            throw new RuntimeException('Invalid replay header.');
        }

        $headerLength = $this->uint32($bytes, 4);
        $headerOffset = 8;
        $this->assertRange($headerOffset, $headerLength, $length, 'header');
        $header = $this->decodeJson(substr($bytes, $headerOffset, $headerLength), 'header');
        $replayFormat = (int) ($header['replayFormatVer'] ?? 0);
        $messageOffset = $headerOffset + $headerLength;
        $embeddedMapVersion = null;
        $embeddedMapBytes = 0;

        if ($replayFormat >= 2) {
            $this->assertRange($messageOffset, 8, $length, 'embedded map header');
            $embeddedMapVersion = $this->uint32($bytes, $messageOffset);
            $embeddedMapBytes = $this->uint32($bytes, $messageOffset + 4);
            $messageOffset += 8;
            $this->assertRange($messageOffset, $embeddedMapBytes, $length, 'embedded map');
            $messageOffset += $embeddedMapBytes;
        }

        $endJsonLength = $this->uint32($bytes, $length - 4);
        $endJsonOffset = $length - 4 - $endJsonLength;
        $this->assertRange($endJsonOffset - 4, $endJsonLength + 8, $length, 'end information');
        if ($this->uint32($bytes, $endJsonOffset - 4) !== $endJsonLength) {
            throw new RuntimeException('Replay end information is malformed.');
        }
        $endInfo = $this->decodeJson(substr($bytes, $endJsonOffset, $endJsonLength), 'end information');
        $messageEnd = $endJsonOffset - 4;

        $messageCounts = [];
        $messageCount = 0;
        $cursor = $messageOffset;
        while ($cursor < $messageEnd) {
            $this->assertRange($cursor, 4, $messageEnd, 'network message header');
            $player = ord($bytes[$cursor]);
            $type = ord($bytes[$cursor + 1]);
            $payloadLength = $this->uint16($bytes, $cursor + 2);
            $cursor += 4;
            $this->assertRange($cursor, $payloadLength, $messageEnd, 'network message payload');
            $key = (string) $type;
            if (!isset($messageCounts[$key])) {
                $messageCounts[$key] = ['type' => $type, 'count' => 0, 'payloadBytes' => 0, 'players' => []];
            }
            $messageCounts[$key]['count']++;
            $messageCounts[$key]['payloadBytes'] += $payloadLength;
            $messageCounts[$key]['players'][(string) $player] = true;
            $messageCount++;
            $cursor += $payloadLength;
        }
        if ($cursor !== $messageEnd) {
            throw new RuntimeException('Replay message stream does not end cleanly.');
        }

        foreach ($messageCounts as &$message) {
            $message['players'] = array_map('intval', array_keys($message['players']));
            sort($message['players'], SORT_NUMERIC);
        }
        unset($message);
        ksort($messageCounts, SORT_NUMERIC);

        $gameOptions = is_array($header['gameOptions'] ?? null) ? $header['gameOptions'] : [];
        $game = is_array($gameOptions['game'] ?? null) ? $gameOptions['game'] : [];
        $rawPlayers = is_array($gameOptions['netplay.players'] ?? null) ? $gameOptions['netplay.players'] : [];
        $players = [];
        foreach ($rawPlayers as $player) {
            if (!is_array($player) || empty($player['allocated']) && empty($player['name'])) {
                continue;
            }
            $players[] = [
                'name' => $player['name'] ?? 'Unnamed',
                'position' => $player['position'] ?? null,
                'team' => $player['team'] ?? null,
                'colour' => $player['colour'] ?? null,
                'faction' => $player['faction'] ?? null,
                'ai' => $player['ai'] ?? null,
                'spectator' => (bool) ($player['isSpectator'] ?? false),
            ];
        }

        return [
            'parserVersion' => self::VERSION,
            'format' => [
                'magic' => 'WZrp',
                'replayFormat' => $replayFormat,
                'netcodeMajor' => $header['major'] ?? null,
                'netcodeMinor' => $header['minor'] ?? null,
                'gameVersion' => $gameOptions['versionString'] ?? null,
            ],
            'file' => [
                'bytes' => $length,
                'headerBytes' => $headerLength,
                'embeddedMapVersion' => $embeddedMapVersion,
                'embeddedMapBytes' => $embeddedMapBytes,
                'networkMessageBytes' => $messageEnd - $messageOffset,
            ],
            'match' => [
                'name' => $game['name'] ?? null,
                'map' => $game['map'] ?? null,
                'maxPlayers' => $game['maxPlayers'] ?? null,
                'type' => $game['type'] ?? null,
                'alliance' => $game['alliance'] ?? null,
                'base' => $game['base'] ?? null,
                'power' => $game['power'] ?? null,
                'scavengers' => $game['scavengers'] ?? null,
                'techLevel' => $game['techLevel'] ?? null,
                'elapsedMilliseconds' => $endInfo['gameTimeElapsed'] ?? null,
            ],
            'players' => $players,
            'messages' => [
                'count' => $messageCount,
                'types' => array_values($messageCounts),
            ],
        ];
    }

    private function uint32(string $bytes, int $offset): int
    {
        $this->assertRange($offset, 4, strlen($bytes), 'uint32');
        return (int) unpack('Nvalue', substr($bytes, $offset, 4))['value'];
    }

    private function uint16(string $bytes, int $offset): int
    {
        $this->assertRange($offset, 2, strlen($bytes), 'uint16');
        return (int) unpack('nvalue', substr($bytes, $offset, 2))['value'];
    }

    private function assertRange(int $offset, int $size, int $total, string $label): void
    {
        if ($offset < 0 || $size < 0 || $offset + $size > $total) {
            throw new RuntimeException('Replay is truncated while reading ' . $label . '.');
        }
    }

    private function decodeJson(string $json, string $label): array
    {
        try {
            $value = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new RuntimeException('Invalid replay ' . $label . ' JSON.', 0, $error);
        }
        if (!is_array($value)) {
            throw new RuntimeException('Replay ' . $label . ' must be a JSON object.');
        }
        return $value;
    }
}

