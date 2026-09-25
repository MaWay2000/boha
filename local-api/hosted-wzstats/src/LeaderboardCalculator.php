<?php

declare(strict_types=1);

final class LeaderboardCalculator
{
    private const ELO_BASE = 1500.0;
    private const ELO_THRESHOLD = 5;
    private const BOHAN_PLAYER_KEYS_URL = 'https://warzone2100.retropaganda.info/player-public-keys.json';
    private const BOHAN_PLAYER_KEYS_CACHE_SECONDS = 3600;
    private const KNOWN_BOT_NAMES = ['wave', 'generic', 'da_bot', 'scavengers'];
    private const BOARDS = [
        'Global', '1v1', '1v1 High Oil', '1v1 Classic', 'FFA', '2v2v2v2', '3v3v3',
        '2v2', '3v3', '4v4', '5v5', 'Shtorm', 'Matrix', 'NTW >= 6 Players',
        'Team Shared Research', 'Longer than 45 minutes',
    ];

    private array $canonicalPublicKeys = [];
    private array $activeBannedKeys = [];

    public function __construct(private PDO $pdo)
    {
    }

    public function publish(string $path): array
    {
        $this->canonicalPublicKeys = $this->loadBohanPublicKeys();
        $this->activeBannedKeys = $this->loadActiveBannedKeys();
        $facts = array_values(array_filter(
            $this->facts(),
            fn(array $fact): bool => !$this->isCrashedFact($fact)
        ));
        $boards = [];
        foreach (self::BOARDS as $name) {
            $boards[$name] = $this->calculateBoard($facts, $name);
        }
        $payload = [
            'format' => 1,
            'generatedAt' => gmdate('c'),
            'resultPolicy' => [
                'historicalFacts' => 'replay-engine-only',
                'unknownOutcomes' => 'crashed',
                'eloBase' => self::ELO_BASE,
                'minimumGamesForRating' => self::ELO_THRESHOLD,
            ],
            'coverage' => [
                'attributedMatches' => count($facts),
                'byResultSource' => array_count_values(array_column($facts, 'resultSource')),
            ],
            'games' => $this->publishedGames($facts),
            'leaderboards' => $boards,
        ];
        $current = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (is_array($current)) {
            $candidateCore = $payload;
            $currentCore = $current;
            unset($candidateCore['generatedAt'], $currentCore['generatedAt']);
            if (json_encode($candidateCore, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)
                === json_encode($currentCore, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) {
                return [
                    'changed' => false, 'matches' => count($facts), 'boards' => count($boards),
                    'bytes' => filesize($path), 'sha256' => hash_file('sha256', $path),
                ];
            }
        }
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
        $temporary = $path . '.tmp-' . bin2hex(random_bytes(4));
        if (file_put_contents($temporary, $json, LOCK_EX) === false || !rename($temporary, $path)) {
            @unlink($temporary);
            throw new RuntimeException('Unable to publish leaderboards.json.');
        }
        return ['changed' => true, 'matches' => count($facts), 'boards' => count($boards), 'bytes' => strlen($json), 'sha256' => hash('sha256', $json)];
    }

    private function facts(): array
    {
        $facts = [];
        $sourceMatches = $this->pdo->query(
            "SELECT m.id, m.source_match_id, m.started_at, m.ended_at, m.duration_ms, m.map_name, m.game_type,
                    s.source_key, s.display_name, r.sha256 AS replay_sha256, rws.analysis_status,
                    ra.metadata_json AS replay_metadata_json,
                    mof.players_json AS source_players_json
             FROM matches m JOIN sources s ON s.id = m.source_id
             LEFT JOIN replays r ON r.id = m.replay_id
             LEFT JOIN replay_analysis ra ON ra.replay_id = r.id
             LEFT JOIN replay_worker_state rws ON rws.match_id = m.id
             LEFT JOIN match_outcome_facts mof ON mof.source_id = m.source_id
                    AND mof.source_match_id = m.source_match_id AND s.source_key = 'bohan'
             WHERE COALESCE(rws.engine_game_version, '')
                    = JSON_UNQUOTE(JSON_EXTRACT(ra.metadata_json, '$.format.gameVersion'))
               AND (rws.analysis_status = 'unknown' OR EXISTS (
                   SELECT 1 FROM match_players mp
                   WHERE mp.match_id = m.id AND mp.stats_source = 'replay-engine'
                     AND LOWER(mp.result) IN ('winner', 'loser', 'contender')
               ))"
        )->fetchAll();
        if ($sourceMatches !== []) {
            $sourcePlayers = [];
            $unitProduction = [];
            $archivedPlayers = null;
            foreach ($sourceMatches as $match) {
                $decoded = json_decode((string) ($match['source_players_json'] ?? ''), true);
                if ((!is_array($decoded) || $decoded === []) && $match['source_key'] === 'bohan') {
                    $archivedPlayers ??= $this->loadArchivedBohanPlayers();
                    $decoded = $archivedPlayers[(string) $match['source_match_id']] ?? [];
                }
                $sourcePlayers[(int) $match['id']] = is_array($decoded) ? $decoded : [];
                $replayMetadata = json_decode((string) ($match['replay_metadata_json'] ?? ''), true);
                $unitProduction[(int) $match['id']] = [
                    'units' => is_array($replayMetadata['unitProduction'] ?? null)
                        ? $replayMetadata['unitProduction']
                        : [],
                    'source' => (string) ($replayMetadata['unitProductionSource'] ?? 'legacy-manufacture-commands'),
                ];
            }
            $ids = array_map('intval', array_column($sourceMatches, 'id'));
            $statement = $this->pdo->prepare(
                'SELECT match_id, position_number, player_name, team_number, result, kills,
                        structures_destroyed, stats_source, raw_json
                 FROM match_players WHERE match_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')
                 ORDER BY match_id, position_number'
            );
            $statement->execute($ids);
            $players = [];
            $resultSources = [];
            foreach ($statement->fetchAll() as $player) {
                $matchId = (int) $player['match_id'];
                $rawPlayer = json_decode((string) ($player['raw_json'] ?? ''), true);
                $publicKey = is_array($rawPlayer) ? trim((string) ($rawPlayer['publicKey'] ?? '')) : '';
                if ($publicKey === '') {
                    $publicKey = $this->recoverBohanPublicKey($player, $sourcePlayers[$matchId] ?? []);
                }
                $productionRecord = $unitProduction[$matchId] ?? ['units' => [], 'source' => ''];
                $unitPlayer = $productionRecord['source'] === 'engine-completed-droids'
                    ? (int) $player['position_number']
                    : (is_array($rawPlayer) && isset($rawPlayer['index']) && is_numeric($rawPlayer['index'])
                        ? (int) $rawPlayer['index']
                        : (int) $player['position_number']);
                $players[$matchId][] = [
                    'name' => (string) $player['player_name'],
                    'publicKey' => $publicKey !== '' ? $publicKey : null,
                    'canonicalPublicKey' => $publicKey !== ''
                        ? ($this->canonicalPublicKeys[$publicKey] ?? $publicKey)
                        : null,
                    'position' => (int) $player['position_number'],
                    'team' => (int) $player['team_number'],
                    'usertype' => $player['result'] === null ? null : strtolower((string) $player['result']),
                    'totalKills' => (int) ($player['kills'] ?? 0) + (int) ($player['structures_destroyed'] ?? 0),
                    'favoriteUnits' => $this->unitsForPosition(
                        $productionRecord['units'],
                        $unitPlayer
                    ),
                ];
                if ($player['result'] !== null) $resultSources[$matchId] = (string) $player['stats_source'];
            }
            foreach ($sourceMatches as $match) {
                $matchId = (int) $match['id'];
                $start = $match['started_at'] ? strtotime((string) $match['started_at'] . ' UTC') * 1000 : 0;
                $crashed = (string) ($match['analysis_status'] ?? '') === 'unknown';
                $matchPlayers = $players[$matchId] ?? [];
                if ($crashed) {
                    foreach ($matchPlayers as &$player) {
                        $player['usertype'] = 'loser';
                    }
                    unset($player);
                }
                $facts[] = [
                    'resultSource' => $crashed ? 'replay-engine-crash' : ($resultSources[$matchId] ?? 'source'),
                    'key' => (string) $match['source_key'] . ':' . (string) $match['source_match_id'],
                    'source' => (string) $match['source_key'],
                    'sourceLabel' => (string) $match['display_name'],
                    'sourceMatchId' => (string) $match['source_match_id'],
                    'replayUrl' => $match['replay_sha256'] ? 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/replays/' . $match['replay_sha256'] : '',
                    'game' => [
                        'version' => '', 'startDate' => $start,
                        'endDate' => $match['ended_at'] ? strtotime((string) $match['ended_at'] . ' UTC') * 1000 : null,
                        'duration' => (int) $match['duration_ms'], 'mapName' => (string) $match['map_name'],
                        'mods' => '', 'alliancesType' => str_starts_with((string) $match['game_type'], '1v1') ? 0 : 2,
                        'timeout' => false, 'cheated' => false,
                    ],
                    'crashed' => $crashed,
                    'players' => $matchPlayers,
                ];
            }
        }
        usort($facts, static fn(array $a, array $b): int => ((int) ($a['game']['startDate'] ?? 0)) <=> ((int) ($b['game']['startDate'] ?? 0)));
        return $facts;
    }

    private function loadArchivedBohanPlayers(): array
    {
        $path = dirname(__DIR__) . '/data/legacy-outcomes.json';
        if (!is_file($path)) return [];
        $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (($payload['format'] ?? null) !== 1 || !is_array($payload['matches'] ?? null)) {
            throw new RuntimeException('Invalid archived Bohan identity source.');
        }
        $players = [];
        foreach ($payload['matches'] as $match) {
            if (($match['source'] ?? '') === 'bohan' && is_array($match['players'] ?? null)) {
                $players[(string) $match['sourceMatchId']] = $match['players'];
            }
        }
        return $players;
    }

    private function recoverBohanPublicKey(array $player, array $sourcePlayers): string
    {
        // Source outcome fields are deliberately ignored: this fallback restores identity only.
        $matching = array_values(array_filter($sourcePlayers, static fn($source): bool =>
            is_array($source) && isset($source['position'], $source['name'])
            && (int) $source['position'] === (int) $player['position_number']
            && (string) $source['name'] === (string) $player['player_name']
        ));
        if (count($matching) !== 1 || !is_string($matching[0]['publicKey'] ?? null)) {
            return '';
        }
        $key = trim($matching[0]['publicKey']);
        return strlen($key) === 44 && strlen((string) base64_decode($key, true)) === 32 ? $key : '';
    }

    private function loadBohanPublicKeys(): array
    {
        $cachePath = dirname(__DIR__) . '/data/bohan-player-public-keys.json';
        $cached = $this->readPublicKeyMap($cachePath);
        if ($cached !== [] && (int) @filemtime($cachePath) >= time() - self::BOHAN_PLAYER_KEYS_CACHE_SECONDS) {
            return $cached;
        }

        try {
            $handle = curl_init(self::BOHAN_PLAYER_KEYS_URL);
            if ($handle === false) {
                throw new RuntimeException('Unable to initialize the Bohan player-key request.');
            }
            curl_setopt_array($handle, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_USERAGENT => 'MaWay2000-wzstats/1.0',
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
            ]);
            $body = curl_exec($handle);
            $error = curl_error($handle);
            $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
            curl_close($handle);
            if (!is_string($body) || $status !== 200 || strlen($body) > 1048576) {
                throw new RuntimeException('Bohan player-key request failed with HTTP ' . $status
                    . ($error !== '' ? ': ' . $error : '.'));
            }

            $downloaded = $this->normalizePublicKeyMap(json_decode($body, true, 512, JSON_THROW_ON_ERROR));
            if ($downloaded === []) {
                throw new RuntimeException('Bohan returned an empty player-key map.');
            }

            $temporary = $cachePath . '.tmp-' . bin2hex(random_bytes(4));
            try {
                $json = json_encode($downloaded, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
                if (@file_put_contents($temporary, $json, LOCK_EX) !== false) {
                    @rename($temporary, $cachePath);
                }
            } finally {
                @unlink($temporary);
            }
            return $downloaded;
        } catch (Throwable $error) {
            error_log('[wzstats] Unable to refresh Bohan player identities: ' . $error->getMessage());
            if ($cached === []) {
                throw new RuntimeException('No valid Bohan player-key map is available; keeping the existing leaderboard.', 0, $error);
            }
            return $cached;
        }
    }

    private function readPublicKeyMap(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }
        try {
            return $this->normalizePublicKeyMap(json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR));
        } catch (Throwable) {
            return [];
        }
    }

    private function normalizePublicKeyMap(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $normalized = [];
        foreach ($value as $publicKey => $canonicalPublicKey) {
            if (!is_string($publicKey) || !is_string($canonicalPublicKey)) {
                return [];
            }
            $publicKey = trim($publicKey);
            $canonicalPublicKey = trim($canonicalPublicKey);
            if (strlen($publicKey) !== 44 || strlen((string) base64_decode($publicKey, true)) !== 32
                || strlen($canonicalPublicKey) !== 44 || strlen((string) base64_decode($canonicalPublicKey, true)) !== 32) {
                return [];
            }
            $normalized[$publicKey] = $canonicalPublicKey;
        }
        return $normalized;
    }

    private function calculateBoard(array $facts, string $board): array
    {
        $accounts = [];
        $games = [];
        foreach ($facts as $fact) {
            $gameData = $fact['game'];
            $game = [
                'key' => (string) $fact['key'],
                'duration' => (int) ($gameData['duration'] ?? 0),
                'mapName' => (string) ($gameData['mapName'] ?? ''),
                'alliancesType' => (int) ($gameData['alliancesType'] ?? 0),
                'timeout' => !empty($gameData['timeout']),
                'cheated' => !empty($gameData['cheated']),
                'crashed' => !empty($fact['crashed']),
                'slots' => [], 'players' => [], 'teams' => [], 'valid' => false,
            ];
            $players = $fact['players'];
            usort($players, static fn(array $a, array $b): int => ((int) ($a['position'] ?? 0)) <=> ((int) ($b['position'] ?? 0)));
            foreach ($players as $index => $player) {
                [$id, $name, $publicKey, $bot, $discounted] = $this->identity($player);
                if (!isset($accounts[$id])) {
                    $accounts[$id] = [
                        'id' => $id, 'mainPublicKey' => $publicKey ? ((string) ($player['canonicalPublicKey'] ?? $publicKey)) : null,
                        'publicKeys' => [], 'name' => null, 'names' => [], 'bot' => $bot,
                        'allGames' => 0, 'games' => 0, 'elo' => self::ELO_BASE,
                        'wins' => 0, 'losses' => 0, 'draws' => 0, 'discounted' => $discounted,
                        'totalKills' => 0, 'favoriteUnits' => [],
                    ];
                }
                if ($publicKey) $accounts[$id]['publicKeys'][$publicKey] = true;
                $accounts[$id]['names'][$name] = ($accounts[$id]['names'][$name] ?? 0) + 1;
                $accounts[$id]['allGames']++;
                $teamIndex = $game['alliancesType'] ? (int) ($player['team'] ?? 0) : $index;
                if (!isset($game['teams'][$teamIndex])) {
                    $game['teams'][$teamIndex] = ['userType' => null, 'players' => [], 'slots' => 0];
                }
                $game['teams'][$teamIndex]['slots']++;
                $userType = $player['usertype'] ?? null;
                $game['slots'][] = [
                    'id' => $id,
                    'userType' => $userType,
                    'totalKills' => (int) ($player['totalKills'] ?? 0),
                    'favoriteUnits' => is_array($player['favoriteUnits'] ?? null) ? $player['favoriteUnits'] : [],
                ];
                if (in_array($userType, ['winner', 'loser', 'contender'], true)) {
                    $slot = ['id' => $id, 'userType' => $userType];
                    $game['players'][] = $slot;
                    $game['teams'][$teamIndex]['players'][] = $slot;
                }
            }
            $game['teams'] = array_values($game['teams']);
            foreach ($game['teams'] as &$team) {
                $types = array_values(array_unique(array_column($team['players'], 'userType')));
                $team['userType'] = count($types) === 1 ? $types[0] : null;
            }
            unset($team);
            if (!$game['timeout']) {
                $contenders = array_keys(array_filter($game['teams'], static fn(array $team): bool => $team['userType'] === 'contender'));
                if (count($contenders) === 1) {
                    $teamIndex = $contenders[0];
                    $game['teams'][$teamIndex]['userType'] = 'winner';
                    foreach ($game['teams'][$teamIndex]['players'] as &$slot) $slot['userType'] = 'winner';
                    unset($slot);
                }
            }
            $games[] = $game;
        }

        foreach ($accounts as &$account) {
            arsort($account['names']);
            $account['name'] = (string) array_key_first($account['names']);
            if ($account['allGames'] < self::ELO_THRESHOLD) $account['discounted'] = true;
        }
        unset($account);
        $games = array_values(array_filter($games, fn(array $game): bool => $this->matchesBoard($board, $game)));

        $validMatches = 0;
        $ratingEvents = [];
        foreach ($games as &$game) {
            if ($game['cheated'] || $game['crashed'] || $game['duration'] < 180000 || $this->allTeamsAreLosers($game['teams'])) continue;
            $outcomeTeams = array_values(array_filter(
                $game['teams'],
                static fn(array $team): bool => count($team['players']) > 0
            ));
            if (count($outcomeTeams) < 2 || !array_filter(
                $outcomeTeams,
                static fn(array $team): bool => in_array($team['userType'], ['winner', 'contender'], true)
            )) continue;
            $sizes = array_map(static fn(array $team): int => count($team['players']), $outcomeTeams);
            if ($sizes !== [] && min($sizes) !== max($sizes)) continue;

            foreach ($game['slots'] as $slot) {
                if (!in_array($slot['userType'], ['winner', 'loser', 'contender'], true)) continue;
                $accounts[$slot['id']]['games']++;
                $accounts[$slot['id']]['totalKills'] += $slot['totalKills'];
                $this->mergeFavoriteUnits($accounts[$slot['id']]['favoriteUnits'], $slot['favoriteUnits']);
            }

            $ratedTeams = [];
            foreach ($game['teams'] as $team) {
                $ids = array_values(array_filter(array_column($team['players'], 'id'), static fn(string $id): bool => !$accounts[$id]['discounted']));
                if ($ids !== []) {
                    $ratedTeams[] = ['userType' => $team['userType'], 'ids' => $ids,
                        'elo' => array_sum(array_map(static fn(string $id): float => $accounts[$id]['elo'], $ids)) / count($ids), 'delta' => 0.0];
                }
            }
            $winners = $losers = $contenders = [];
            foreach ($ratedTeams as $i => $team) {
                if ($team['userType'] === 'winner') $winners[] = $i;
                elseif ($team['userType'] === 'loser') $losers[] = $i;
                elseif ($team['userType'] === 'contender') $contenders[] = $i;
            }
            $survivors = $winners ?: $contenders;
            foreach ($losers as $loserIndex) {
                $best = null;
                foreach (array_keys($ratedTeams) as $candidate) {
                    if ($candidate === $loserIndex) continue;
                    if ($best === null || $ratedTeams[$candidate]['elo'] > $ratedTeams[$best]['elo']) $best = $candidate;
                }
                if ($best === null || $survivors === []) continue;
                $delta = $this->eloDelta(1.0, $ratedTeams[$best]['elo'], $ratedTeams[$loserIndex]['elo']) * count($ratedTeams[$loserIndex]['ids']);
                $ratedTeams[$loserIndex]['delta'] = -$delta;
                foreach ($survivors as $survivor) $ratedTeams[$survivor]['delta'] += $delta / count($survivors);
            }
            foreach ($contenders as $left => $first) for ($right = $left + 1; $right < count($contenders); $right++) {
                $second = $contenders[$right];
                $delta = $this->eloDelta(0.5, $ratedTeams[$first]['elo'], $ratedTeams[$second]['elo'])
                    * (count($ratedTeams[$first]['ids']) + count($ratedTeams[$second]['ids'])) / 2;
                $ratedTeams[$first]['delta'] += $delta;
                $ratedTeams[$second]['delta'] -= $delta;
            }
            foreach ($ratedTeams as $team) foreach ($team['ids'] as $id) {
                $delta = $team['delta'] / count($team['ids']);
                $ratingEvents[$game['key']][$id] = ['elo' => round($accounts[$id]['elo'], 2), 'eloDelta' => round($delta, 2)];
                $accounts[$id]['elo'] += $delta;
            }
            foreach ($game['teams'] as $team) foreach ($team['players'] as $slot) {
                if ($team['userType'] === 'winner') $accounts[$slot['id']]['wins']++;
                elseif ($team['userType'] === 'loser') $accounts[$slot['id']]['losses']++;
                elseif ($team['userType'] === 'contender') $accounts[$slot['id']]['draws']++;
            }
            $game['valid'] = true;
            $validMatches++;
        }
        unset($game);

        $players = array_values(array_filter($accounts, static fn(array $account): bool => $account['games'] > 0));
        usort($players, static function (array $a, array $b): int {
            $aKey = !$a['discounted'] ? $a['elo'] : -1000000000 + $a['games'];
            $bKey = !$b['discounted'] ? $b['elo'] : -1000000000 + $b['games'];
            return $bKey <=> $aKey;
        });
        foreach ($players as &$player) {
            $player['banned'] = isset($this->activeBannedKeys[(string) ($player['mainPublicKey'] ?? '')]);
            if (!$player['banned']) {
                foreach ($player['publicKeys'] as $key => $_present) {
                    if (isset($this->activeBannedKeys[$key])) {
                        $player['banned'] = true;
                        break;
                    }
                }
            }
            if ($player['banned']) $player['elo'] = -2000;
            $player['elo'] = round($player['elo'], 2);
            $player['invalid'] = $player['games'] - $player['wins'] - $player['losses'] - $player['draws'];
            $player['publicKeys'] = array_keys($player['publicKeys']);
            $player['favoriteUnits'] = $this->rankFavoriteUnits(
                $player['favoriteUnits'],
                $board === 'Global' ? null : 15
            );
            unset($player['allGames']);
        }
        unset($player);
        usort($players, static function (array $a, array $b): int {
            if ($a['banned'] !== $b['banned']) return $a['banned'] ? 1 : -1;
            $aKey = !$a['discounted'] ? $a['elo'] : -1000000000 + $a['games'];
            $bKey = !$b['discounted'] ? $b['elo'] : -1000000000 + $b['games'];
            return $bKey <=> $aKey;
        });
        return [
            'matches' => count($games), 'validMatches' => $validMatches,
            'gameIds' => array_column($games, 'key'), 'ratingEvents' => $ratingEvents, 'players' => $players,
        ];
    }

    private function loadActiveBannedKeys(): array
    {
        $path = dirname(__DIR__, 2) . '/private/player-bans.json';
        if (!is_file($path)) return [];
        $data = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data) || !is_array($data['bans'] ?? null)) {
            throw new RuntimeException('Player ban list is invalid; keeping the current leaderboard.');
        }
        $keys = [];
        foreach ($data['bans'] as $ban) {
            if (!is_array($ban) || empty($ban['active'])) continue;
            $key = (string) ($ban['publicKey'] ?? '');
            if (strlen($key) !== 44 || strlen((string) base64_decode($key, true)) !== 32) {
                throw new RuntimeException('Player ban list contains an invalid public key.');
            }
            $keys[$key] = true;
        }
        return $keys;
    }

    private function unitsForPosition(array $unitProduction, int $position): array
    {
        $units = $unitProduction[(string) $position] ?? $unitProduction[$position] ?? [];
        if (!is_array($units)) return [];

        $normalized = [];
        foreach ($units as $unit) {
            if (!is_array($unit)) continue;
            $signature = $this->normalizeUnitSignature(trim((string) ($unit['signature'] ?? '')));
            $count = max(0, (int) ($unit['count'] ?? 0));
            if ($signature === '' || $count === 0) continue;
            $normalized[] = [
                'signature' => $signature,
                'name' => trim((string) ($unit['name'] ?? '')) ?: 'Unknown unit',
                'bodyId' => isset($unit['bodyId']) ? (int) $unit['bodyId'] : null,
                'propulsionId' => isset($unit['propulsionId']) ? (int) $unit['propulsionId'] : null,
                'weaponIds' => is_array($unit['weaponIds'] ?? null)
                    ? array_values(array_map('intval', $unit['weaponIds']))
                    : [],
                'count' => $count,
            ];
        }
        return $normalized;
    }

    private function normalizeUnitSignature(string $signature): string
    {
        $parts = explode(':', $signature);
        if (count($parts) < 9) return $signature;

        // Some replay versions serialize the absent repair component as the
        // ZNULLREPAIR table entry (5), while others serialize it as 0. It is
        // not a real turret and must not split one design into two totals.
        if ((int) $parts[4] === 5) $parts[4] = '0';

        return implode(':', $parts);
    }

    private function mergeFavoriteUnits(array &$totals, array $units): void
    {
        foreach ($units as $unit) {
            if (!is_array($unit)) continue;
            $signature = (string) ($unit['signature'] ?? '');
            $count = max(0, (int) ($unit['count'] ?? 0));
            if ($signature === '' || $count === 0) continue;
            if (!isset($totals[$signature])) {
                $totals[$signature] = $unit;
                $totals[$signature]['count'] = 0;
            }
            $totals[$signature]['count'] += $count;
        }
    }

    private function rankFavoriteUnits(array $units, ?int $limit = 15): array
    {
        $ranked = array_values($units);
        usort($ranked, static fn(array $left, array $right): int =>
            ((int) ($right['count'] ?? 0) <=> (int) ($left['count'] ?? 0))
            ?: strcmp((string) ($left['signature'] ?? ''), (string) ($right['signature'] ?? ''))
        );
        return $limit === null ? $ranked : array_slice($ranked, 0, $limit);
    }

    private function publishedGames(array $facts): array
    {
        $games = [];
        foreach ($facts as $fact) {
            $gameData = $fact['game'];
            $slots = [];
            $teams = [];
            $players = $fact['players'];
            usort($players, static fn(array $a, array $b): int => ((int) ($a['position'] ?? 0)) <=> ((int) ($b['position'] ?? 0)));
            foreach ($players as $index => $player) {
                [$id, $name] = $this->identity($player);
                $userType = $player['usertype'] ?? null;
                $team = (int) ($player['team'] ?? (!empty($gameData['alliancesType']) ? 0 : $index));
                $slots[] = ['id' => $id, 'name' => $name, 'position' => (int) ($player['position'] ?? $index), 'team' => $team, 'userType' => $userType];
                if (in_array($userType, ['winner', 'loser', 'contender'], true)) $teams[$team][] = count($slots) - 1;
            }
            if (empty($gameData['timeout'])) {
                $contenderTeams = [];
                foreach ($teams as $team => $indexes) {
                    $types = array_values(array_unique(array_map(static fn(int $slot): mixed => $slots[$slot]['userType'], $indexes)));
                    if ($types === ['contender']) $contenderTeams[] = $team;
                }
                if (count($contenderTeams) === 1) {
                    foreach ($teams[$contenderTeams[0]] as $slot) $slots[$slot]['userType'] = 'winner';
                }
            }
            $games[] = [
                'id' => (string) $fact['key'], 'source' => (string) $fact['source'],
                'sourceLabel' => (string) $fact['sourceLabel'], 'sourceMatchId' => (string) $fact['sourceMatchId'],
                'resultSource' => (string) $fact['resultSource'], 'replayUrl' => (string) $fact['replayUrl'],
                'startDate' => (int) ($gameData['startDate'] ?? 0), 'endDate' => (int) ($gameData['endDate'] ?? 0),
                'duration' => (int) ($gameData['duration'] ?? 0), 'mapName' => (string) ($gameData['mapName'] ?? ''),
                'mods' => (string) ($gameData['mods'] ?? ''), 'alliancesType' => (int) ($gameData['alliancesType'] ?? 0),
                'timeout' => !empty($gameData['timeout']), 'cheated' => !empty($gameData['cheated']),
                'crashed' => !empty($fact['crashed']), 'slots' => $slots,
            ];
        }
        return $games;
    }

    private function isCrashedFact(array $fact): bool
    {
        if (!empty($fact['crashed']) || ($fact['resultSource'] ?? '') === 'replay-engine-crash') {
            return true;
        }

        $players = array_values(array_filter(
            $fact['players'] ?? [],
            static fn(array $player): bool => in_array(
                $player['usertype'] ?? null,
                ['winner', 'loser', 'contender'],
                true
            )
        ));
        return $players !== [] && array_reduce(
            $players,
            static fn(bool $allLosers, array $player): bool =>
                $allLosers && ($player['usertype'] ?? null) === 'loser',
            true
        );
    }

    private function identity(array $player): array
    {
        $name = (string) ($player['name'] ?? '');
        if (preg_match('/_[2-5]$/', $name)) $name = substr($name, 0, -2);
        $publicKey = $player['publicKey'] ?? null;
        if ($publicKey) {
            $canonical = (string) ($player['canonicalPublicKey'] ?? $publicKey);
            $valid = strlen((string) $publicKey) === 44 && base64_decode((string) $publicKey, true) !== false;
            return [$canonical, $name, (string) $publicKey, !$valid, false];
        }
        $userType = $player['usertype'] ?? null;
        foreach (['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Grey', 'Black'] as $colour) {
            if (str_starts_with($name, $colour . '-')) $name = substr($name, strlen($colour) + 1);
        }
        if ($name === '') $name = $userType === 'spectator' ? 'spectator' : ($userType ? 'generic' : 'empty slot');
        $bot = in_array(strtolower(trim($name)), self::KNOWN_BOT_NAMES, true);
        return [$name, $name, null, (bool) $bot, true];
    }

    private function matchesBoard(string $board, array $game): bool
    {
        $count = count($game['players']);
        $allTeamSize = static fn(int $size): bool => array_reduce($game['teams'], static fn(bool $carry, array $team): bool => $carry && count($team['players']) === $size, true);
        return match ($board) {
            '1v1' => $count === 2,
            '1v1 High Oil' => $count === 2 && in_array($game['mapName'], ['RO_1v1Full', 'RB_RQNTW_1v1'], true),
            '1v1 Classic' => $count === 2 && in_array($game['mapName'], ['Calamity', 'Vertigo', 'OutskirtsM', 'Sunlight', 'Roughness-1-03', 'Snowbridge2b'], true),
            '2v2' => $game['alliancesType'] >= 2 && $count === 4 && $allTeamSize(2),
            '3v3' => $game['alliancesType'] >= 2 && $count === 6 && $allTeamSize(3),
            '4v4' => $game['alliancesType'] >= 2 && $count === 8 && $allTeamSize(4),
            '5v5' => $game['alliancesType'] >= 2 && $count === 10 && $allTeamSize(5),
            '2v2v2v2' => $game['alliancesType'] >= 2 && $count === 8 && $allTeamSize(2),
            '3v3v3' => $game['alliancesType'] >= 2 && $count === 9 && $allTeamSize(3),
            'FFA' => $count >= 3 && ($game['alliancesType'] <= 1 || $allTeamSize(1)),
            'Shtorm' => str_contains(strtolower($game['mapName']), 'shtorm'),
            'Matrix' => str_contains(strtolower($game['mapName']), 'matrix'),
            'NTW >= 6 Players' => str_contains(strtolower($game['mapName']), 'ntw') && $count >= 6,
            'Team Shared Research' => $game['alliancesType'] === 2 && $count > 2 && array_reduce($game['teams'], static fn(bool $carry, array $team): bool => $carry && count($team['players']) > 1, true),
            'Longer than 45 minutes' => $game['duration'] > 2700000,
            default => true,
        };
    }

    private function allTeamsAreLosers(array $teams): bool
    {
        foreach ($teams as $team) if ($team['userType'] !== 'loser') return false;
        return true;
    }

    private function eloDelta(float $actual, float $elo1, float $elo2): float
    {
        return 20 * ($actual - 1 / (1 + 10 ** (($elo2 - $elo1) / 400)));
    }
}
