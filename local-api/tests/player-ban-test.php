<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/hosted-wzstats/src/LeaderboardCalculator.php';

$canonicalKey = base64_encode(str_repeat('A', 32));
$aliasKey = base64_encode(str_repeat('B', 32));
$otherKey = base64_encode(str_repeat('C', 32));
$reflection = new ReflectionClass(LeaderboardCalculator::class);
$calculator = $reflection->newInstanceWithoutConstructor();
$reflection->getProperty('activeBannedKeys')->setValue($calculator, [$aliasKey => true]);
$board = $reflection->getMethod('calculateBoard')->invoke($calculator, [[
    'key' => 'test:1',
    'game' => ['duration' => 300000, 'mapName' => 'Test', 'alliancesType' => 2],
    'players' => [
        ['name' => 'Banned', 'publicKey' => $aliasKey, 'canonicalPublicKey' => $canonicalKey,
            'position' => 0, 'team' => 0, 'usertype' => 'winner'],
        ['name' => 'Allowed', 'publicKey' => $otherKey, 'canonicalPublicKey' => $otherKey,
            'position' => 1, 'team' => 1, 'usertype' => 'loser'],
    ],
]], 'Global');

$players = $board['players'];
if (count($players) !== 2 || $players[0]['name'] !== 'Allowed'
    || $players[0]['banned'] !== false || $players[0]['elo'] !== 1500.0
    || $players[1]['name'] !== 'Banned' || $players[1]['banned'] !== true
    || $players[1]['elo'] !== -2000.0) {
    throw new RuntimeException('Player-ban publication policy failed.');
}
echo "Player-ban publication policy passed.\n";
