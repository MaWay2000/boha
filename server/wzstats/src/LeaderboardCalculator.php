<?php

declare(strict_types=1);

final class LeaderboardCalculator
{
    private const ELO_BASE = 1500.0;
    private const ELO_THRESHOLD = 5;
    private const BOARDS = [
        'Global', '1v1', '1v1 High Oil', '1v1 Classic', 'FFA', '2v2v2v2', '3v3v3',
        '2v2', '3v3', '4v4', '5v5', 'Shtorm', 'Matrix', 'NTW >= 6 Players',
        'Team Shared Research', 'Longer than 45 minutes',
    ];

    public function __construct(private PDO $pdo)
    {
    }

    public function publish(string $path): array
    {
        $facts = $this->facts();
        $boards = [];
        foreach (self::BOARDS as $name) {
            $boards[$name] = $this->calculateBoard($facts, $name);
        }
        $payload = [
            'format' => 1,
            'generatedAt' => gmdate('c'),
            'resultPolicy' => [
                'historicalFacts' => 'replay-engine-only',
                'unknownOutcomes' => 'excluded',
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
                    s.source_key, s.display_name, r.sha256 AS replay_sha256
             FROM matches m JOIN sources s ON s.id = m.source_id
             LEFT JOIN replays r ON r.id = m.replay_id
             WHERE EXISTS (
                 SELECT 1 FROM match_players mp
                 WHERE mp.match_id = m.id AND mp.stats_source = 'replay-engine'
                   AND LOWER(mp.result) IN ('winner', 'loser', 'contender')
             )"
        )->fetchAll();
        if ($sourceMatches !== []) {
            $ids = array_map('intval', array_column($sourceMatches, 'id'));
            $statement = $this->pdo->prepare(
                'SELECT match_id, position_number, player_name, team_number, result, stats_source
                 FROM match_players WHERE stats_source = \'replay-engine\'
                   AND match_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')
                 ORDER BY match_id, position_number'
            );
            $statement->execute($ids);
            $players = [];
            $resultSources = [];
            foreach ($statement->fetchAll() as $player) {
                $matchId = (int) $player['match_id'];
                $players[$matchId][] = [
                    'name' => (string) $player['player_name'],
                    'publicKey' => null,
                    'canonicalPublicKey' => null,
                    'position' => (int) $player['position_number'],
                    'team' => (int) $player['team_number'],
                    'usertype' => $player['result'] === null ? null : strtolower((string) $player['result']),
                ];
                if ($player['result'] !== null) $resultSources[$matchId] = (string) $player['stats_source'];
            }
            foreach ($sourceMatches as $match) {
                $matchId = (int) $match['id'];
                $start = $match['started_at'] ? strtotime((string) $match['started_at'] . ' UTC') * 1000 : 0;
                $facts[] = [
                    'resultSource' => $resultSources[$matchId] ?? 'source',
                    'key' => (string) $match['source_key'] . ':' . (string) $match['source_match_id'],
                    'source' => (string) $match['source_key'],
                    'sourceLabel' => (string) $match['display_name'],
                    'sourceMatchId' => (string) $match['source_match_id'],
                    'replayUrl' => $match['replay_sha256'] ? 'https://onit.lt/wzstats/api/v1/replays/' . $match['replay_sha256'] : '',
                    'game' => [
                        'version' => '', 'startDate' => $start,
                        'endDate' => $match['ended_at'] ? strtotime((string) $match['ended_at'] . ' UTC') * 1000 : null,
                        'duration' => (int) $match['duration_ms'], 'mapName' => (string) $match['map_name'],
                        'mods' => '', 'alliancesType' => str_starts_with((string) $match['game_type'], '1v1') ? 0 : 2,
                        'timeout' => false, 'cheated' => false,
                    ],
                    'players' => $players[$matchId] ?? [],
                ];
            }
        }
        usort($facts, static fn(array $a, array $b): int => ((int) ($a['game']['startDate'] ?? 0)) <=> ((int) ($b['game']['startDate'] ?? 0)));
        return $facts;
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
                $game['slots'][] = ['id' => $id, 'userType' => $userType];
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
        foreach ($games as $game) foreach ($game['slots'] as $slot) $accounts[$slot['id']]['games']++;

        $validMatches = 0;
        $ratingEvents = [];
        foreach ($games as &$game) {
            if ($game['cheated'] || $game['duration'] < 180000 || $this->allTeamsAreLosers($game['teams'])) continue;
            $sizes = array_map(static fn(array $team): int => count($team['players']), array_filter($game['teams'], static fn(array $team): bool => count($team['players']) > 0));
            if ($sizes !== [] && min($sizes) !== max($sizes)) continue;

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
            $player['elo'] = round($player['elo'], 2);
            $player['invalid'] = $player['games'] - $player['wins'] - $player['losses'] - $player['draws'];
            $player['publicKeys'] = array_keys($player['publicKeys']);
            unset($player['allGames']);
        }
        unset($player);
        return [
            'matches' => count($games), 'validMatches' => $validMatches,
            'gameIds' => array_column($games, 'key'), 'ratingEvents' => $ratingEvents, 'players' => $players,
        ];
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
                'timeout' => !empty($gameData['timeout']), 'cheated' => !empty($gameData['cheated']), 'slots' => $slots,
            ];
        }
        return $games;
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
        $bot = $name !== '' || ($userType && $userType !== 'spectator');
        foreach (['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Grey', 'Black'] as $colour) {
            if (str_starts_with($name, $colour . '-')) $name = substr($name, strlen($colour) + 1);
        }
        if ($name === '') $name = $userType === 'spectator' ? 'spectator' : ($userType ? 'generic' : 'empty slot');
        $syntheticPublicKey = $bot ? $name : null;
        return [$name, $name, $syntheticPublicKey, (bool) $bot, !$syntheticPublicKey];
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
