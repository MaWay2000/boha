import test from 'node:test';
import assert from 'node:assert/strict';
import {combineRulesets, combineModNames, moddedArcSnapshot, modMedals, rankAllMods, replaySource, matchResults} from '../stats/wavehoster-data.mjs';

test('ALL ranks by combined medal points, then games, then kills, ignoring wins and score as tiebreakers', () => {
  const players = [
    {id: 'gold', games: 2, kills: 900, wins: 2, bestScore: 9000},
    {id: 'silver-bronze', games: 3, kills: 5, wins: 0, bestScore: 10},
    {id: 'active', games: 20, kills: 2, wins: 0, bestScore: null},
    {id: 'high-kills', games: 20, kills: 50, wins: 0, bestScore: 0},
    {id: 'high-score', games: 20, kills: 2, wins: 19, bestScore: 999999}
  ].map(player => ({...player, name: player.id, losses: 0, draws: 0}));
  const medals = new Map([
    ['gold', [{metal: 'gold'}]],
    ['silver-bronze', [{metal: 'silver'}, {metal: 'bronze'}]]
  ]);
  const all = rankAllMods({groups: [{players}], games: []}, medals);
  assert.deepEqual(all.players.map(player => [player.id, player.medalPoints]),
    [['silver-bronze', 3], ['gold', 3], ['high-kills', 0], ['active', 0], ['high-score', 0]]);
});

test('recent match results distinguish co-op outcomes, opposing players and unconfirmed results', () => {
  const player = (name, result) => ({name, result});
  assert.deepEqual(matchResults({status: 'confirmed', participants: [player('A', 'loser'), player('B', 'loser')]}), [{label: 'Lost', result: 'loser'}]);
  assert.deepEqual(matchResults({status: 'confirmed', participants: [player('A', 'winner'), player('B', 'loser')]}).map(row => row.label), ['A: Win', 'B: Lost']);
  assert.equal(matchResults({status: 'confirmed', participants: [player('A', 'contender')]})[0].label, 'Draw');
  for (const status of ['pending', 'unknown', 'incomplete', 'unverified', 'error']) {
    assert.equal(matchResults({status, participants: [player('A', 'winner')]})[0].label, status === 'pending' ? 'Awaiting analysis' : 'Result unavailable');
  }
  assert.equal(matchResults({status: 'confirmed', participants: []})[0].label, 'Result unavailable');
});

test('ALL combines the same identity across rulesets without merging equal nicknames', () => {
  const player = {id: 'one', name: 'Current', identityVerified: true, games: 2, wins: 1, losses: 1, draws: 0,
    bestScore: 50, kills: 8, names: [{name: 'Current', games: 2}], publicKeys: ['key-1']};
  const snapshot = {groups: [
    {players: [player]},
    {players: [{...player, name: 'Earlier', games: 1, wins: 1, losses: 0, kills: 3, bestScore: 30,
      names: [{name: 'Earlier', games: 1}], publicKeys: ['key-1', 'key-2']},
      {...player, id: 'two', games: 1, wins: 1, losses: 0, bestScore: 999, publicKeys: ['other-key']}]}
  ], games: [{status: 'confirmed'}, {status: 'confirmed'}, {status: 'unknown'}]};
  const original = structuredClone(snapshot);
  const all = combineRulesets(snapshot);
  assert.deepEqual(all.players.map(row => row.id), ['one', 'two']);
  const combined = all.players[0];
  assert.deepEqual([combined.games, combined.wins, combined.losses, combined.kills, combined.bestScore], [3, 2, 1, 11, 50]);
  assert.deepEqual(combined.names, [{name: 'Current', games: 2}, {name: 'Earlier', games: 1}]);
  assert.deepEqual(combined.publicKeys, ['key-1', 'key-2']);
  assert.deepEqual([all.matches, all.confirmed], [3, 2]);
  assert.deepEqual(snapshot, original);
});

test('ALL keeps missing scores distinct from zero and ranks tied wins by best score', () => {
  const player = {name: 'Player', identityVerified: true, games: 1, wins: 0, losses: 1, draws: 0, kills: 0};
  const all = combineRulesets({groups: [{players: [
    {...player, id: 'missing', bestScore: null}, {...player, id: 'negative', bestScore: -10}, {...player, id: 'zero', bestScore: 0}
  ]}], games: []});
  assert.deepEqual(all.players.map(row => row.id), ['zero', 'negative', 'missing']);
  assert.equal(all.players[2].bestScore, null);
  assert.deepEqual(combineRulesets({groups: [], games: []}).players, []);
});

test('Analyze uses the archived replay and older snapshots retain a safe WaveHoster fallback', () => {
  const hash = 'a'.repeat(64);
  assert.equal(replaySource({replaySha256: hash}).replayUrl, 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/replays/' + hash);
  assert.equal(replaySource({id: '20261109_083951_7715'}).replayUrl, 'https://api.wavehoster.net/v1/replays/20261109_083951_7715');
  assert.equal(replaySource({id: '../private', replaySha256: 'https://other.invalid/'}), null);
  assert.equal(replaySource({id: 'https://other.invalid/'}), null);
});


test('one mod entry combines versions, hashes and the BOHA alias without losing identities or replays', () => {
  const player = {id: 'one', name: 'Tester', identityVerified: true, games: 1, wins: 1, losses: 0, draws: 0,
    bestScore: 50, kills: 5, names: [{name: 'Tester', games: 1}], publicKeys: ['key']};
  const snapshot = {groups: [
    {id: 'old-hash', version: '4.6.3', mods: ['old'], players: [player]},
    {id: 'tower-hash', version: '4.7.0', mods: ['tower'], players: [{...player, id: 'other'}]},
    {id: 'new-hash', version: '4.7.0', mods: ['new'], players: [{...player, bestScore: 80}]},
    {id: 'stock-old', version: '4.6.3', mods: [], players: []},
    {id: 'stock-new', version: '4.7.0', mods: [], players: []}
  ], games: [
    {id: '1', group: 'new-hash', map: 'Wave-Defense', status: 'confirmed'},
    {id: '2', group: 'old-hash', map: 'BOHA-Wave-Defense', status: 'confirmed'},
    {id: '3', group: 'new-hash', map: 'Wave-Defense', status: 'pending'},
    {id: '4', group: 'tower-hash', map: 'TowerDefense3_v', status: 'confirmed'},
    {id: '5', group: 'stock-old', map: 'Map A', status: 'unknown'},
    {id: '6', group: 'stock-new', map: 'Map B', status: 'unknown'}
  ]};
  const original = structuredClone(snapshot);
  const view = combineModNames(snapshot);
  assert.deepEqual(view.groups.map(group => group.name), ['Wave-Defense', 'TowerDefense3_v', 'Unmodded']);
  const wave = view.groups.find(group => group.name === 'Wave-Defense');
  assert.deepEqual(wave.groupIds, ['old-hash', 'new-hash']);
  assert.deepEqual([wave.matches, wave.confirmed], [3, 2]);
  assert.deepEqual(view.games.filter(game => game.group === wave.id).map(game => game.id), ['1', '2', '3']);
  assert.deepEqual(wave.players.map(player => player.id), ['one']);
  assert.deepEqual([wave.players[0].games, wave.players[0].wins, wave.players[0].bestScore, wave.players[0].kills], [2, 2, 80, 10]);
  assert.deepEqual(wave.players[0].publicKeys, ['key']);
  assert.deepEqual(view.games.map(game => game.id), snapshot.games.map(game => game.id));
  assert.deepEqual(combineRulesets(view), combineRulesets(snapshot));
  assert.deepEqual(snapshot, original);
  const reordered = combineModNames({...snapshot, groups: [...snapshot.groups].reverse()});
  assert.equal(reordered.groups.find(group => group.name === wave.name).id, wave.id);
  const medals = modMedals(view.groups);
  assert.deepEqual(medals.get('one').map(m => [m.modName, m.place, m.wins, m.bestScore]), [['Wave-Defense', 1, 2, 80]]);
  assert.equal(medals.get('other')[0].modName, 'TowerDefense3_v');
  const mapMod = {id: 'embedded', version: '4.7.0', mods: [], isMapMod: true, players: []};
  const arcOnly = moddedArcSnapshot({...snapshot, groups: [...snapshot.groups, mapMod], games: [
    ...snapshot.games, {id: '7', group: 'embedded', map: 'Custom rules map', status: 'pending'}
  ]});
  assert.deepEqual(arcOnly.games.map(game => game.id), ['1', '2', '3', '4', '7']);
  assert.deepEqual(combineModNames(arcOnly).groups.map(group => group.name),
    ['Wave-Defense', 'TowerDefense3_v', 'Custom rules map']);
});

test('medals follow each mod ranking by identity, keep missing scores unknown, and refresh with standings', () => {
  const players = [
    {id: 'b', name: 'Same nickname', wins: 5, bestScore: 50},
    {id: 'a', name: 'Same nickname', wins: 4, bestScore: 200},
    {id: 'c', name: 'Another', wins: 3, bestScore: null},
    {id: 'd', name: 'Outside podium', wins: 2, bestScore: 900}
  ];
  const group = {id: 'mod:TowerDefense', name: 'TowerDefense', players};
  const other = {id: 'mod:Trident', name: 'Trident', players: [players[1]]};
  const before = structuredClone([group, other]);
  const awards = modMedals([group, other]);
  assert.equal(awards.get('b')[0].metal, 'gold');
  assert.deepEqual(awards.get('a').map(m => [m.modName, m.metal]), [['TowerDefense', 'silver'], ['Trident', 'gold']]);
  assert.equal(awards.get('c')[0].bestScore, null);
  assert.equal(awards.has('d'), false);
  assert.deepEqual([group, other], before);
  const refreshed = modMedals([{...group, players: [players[3], ...players.slice(0, 3)]}]);
  assert.equal(refreshed.get('d')[0].metal, 'gold');
  assert.equal(refreshed.has('c'), false);
  assert.equal(awards.has('d'), false, 'Previously displayed medals are not mutated');
  assert.equal(modMedals([]).size, 0);
});
