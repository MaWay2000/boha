import test from 'node:test';
import assert from 'node:assert/strict';
import {combineRulesets, replaySource, matchResults} from '../stats/wavehoster-data.mjs';

test('recent match results distinguish co-op outcomes, opposing players and unconfirmed results', () => {
  const player = (name, result) => ({name, result});
  assert.deepEqual(matchResults({status: 'confirmed', participants: [player('A', 'loser'), player('B', 'loser')]}), [{label: 'Lost', result: 'loser'}]);
  assert.deepEqual(matchResults({status: 'confirmed', participants: [player('A', 'winner'), player('B', 'loser')]}).map(row => row.label), ['A: Win', 'B: Lost']);
  assert.equal(matchResults({status: 'confirmed', participants: [player('A', 'contender')]})[0].label, 'Draw');
  for (const status of ['pending', 'unknown', 'incomplete', 'unverified', 'error']) {
    assert.equal(matchResults({status, participants: [player('A', 'winner')]})[0].label, 'Unknown');
  }
  assert.equal(matchResults({status: 'confirmed', participants: []})[0].label, 'Unknown');
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
