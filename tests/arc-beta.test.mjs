import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {betaSnapshot, collectTesters} from '../stats/arc-beta.mjs';
import {participantResult, matchResults} from '../stats/wavehoster-data.mjs';
import departures from '../stats/arc-departures.cjs';
const {departureFacts, applyDepartures, rebuildArcRankings, mergeHistory} = departures;
const policy = JSON.parse(readFileSync(new URL('../stats/arc-beta.json', import.meta.url)));
const group = () => ({id: 'beta-group', version: policy.gameVersion, mods: [policy.modHash], players: [], matches: 1, confirmed: 0});
const game = () => ({id: 'replay', matchId: 42, replaySha256: 'a'.repeat(64), group: 'beta-group', map: 'Wave-Defense',
  status: 'unknown', modsVerified: true, durationMilliseconds: 600000, startedAt: '2026-11-14T20:00:00Z', players: ['Tester'], participants: []});
const detail = () => ({match: {id: 42, replay_sha256: 'a'.repeat(64),
  replay_analysis: {format: {gameVersion: policy.gameVersion}, match: {modHashes: [policy.modHash]},
    players: [{position: 0, name: 'Tester', ai: -2, spectator: false}]},
  telemetry: {engineAnalysis: {status: 'unknown', game: {version: policy.gameVersion, timeout: false, cheated: false},
    extended: {recordedNetwork: {playerDepartures: [{player: 0, timeMilliseconds: 300000}]}}}}, players: []}});

test('Beta is pinned to the complete release; later unrelated games and older packs cannot replace it', () => {
  const old = {...group(), id: 'old', mods: [policy.archiveModHashes[0]]};
  const other = {...group(), id: 'other', mods: ['b'.repeat(64)]};
  const mixed = {...group(), id: 'mixed', mods: [policy.modHash, 'c'.repeat(64)]};
  const version = {...group(), id: 'version', version: 'other-version'};
  const snapshot = {groups: [old, other, mixed, version, group()], games: [game(), {...game(), id: 'newest', group: 'other', startedAt: '2027-01-01T00:00:00Z'}]};
  assert.deepEqual(betaSnapshot(snapshot, policy).groups.map(group => group.id), ['beta-group']);
  assert.deepEqual(betaSnapshot(snapshot, policy).games.map(game => game.id), ['replay']);
  assert.equal(snapshot.groups.length, 5);
  assert.equal(betaSnapshot({groups: [old], games: []}, policy).groups.length, 0);
});

test('tester credits include unresolved and departed humans, preserve Unicode names, and survive refreshes', () => {
  const old = {...group(), id: 'old', mods: [policy.archiveModHashes[0]]};
  const snapshot = {groups: [group(), old, {...group(), id: 'unrelated', mods: ['b'.repeat(64)]}],
    games: [game(), {...game(), id: 'old-replay', replaySha256: 'b'.repeat(64), group: 'old', players: ['Лопата', 'Alias']},
      {...game(), id: 'foreign', group: 'unrelated', players: ['Other mod player']}]};
  const first = collectTesters(snapshot, policy);
  assert.deepEqual(first.testers.map(tester => tester.name), ['Alias', 'Tester', 'Лопата']);
  assert.deepEqual(collectTesters(snapshot, policy, first), first);
  assert.deepEqual(collectTesters({groups: [], games: []}, policy, first), first);
  const later = collectTesters({groups: [group()], games: [{...game(), replaySha256: 'c'.repeat(64), startedAt: '2026-11-15T20:00:00Z'}]}, policy, first);
  assert.equal(later.testers.find(tester => tester.name === 'Tester').replays.length, 2);
  assert.equal(later.testers.find(tester => tester.name === 'Tester').firstSeenAt, game().startedAt);
  assert.deepEqual(first.testers.find(tester => tester.name === 'Tester').replays, ['a'.repeat(64)]);
});

test('a recorded human departure produces a defeat without fabricating scores or a confirmed replay', () => {
  const facts = departureFacts(game(), group(), detail());
  assert.equal(facts.length, 1);
  assert.deepEqual([facts[0].result, facts[0].resultReason, facts[0].leftAtMilliseconds, facts[0].score, facts[0].kills], ['loser', 'departure', 300000, null, null]);
  const departed = {...game(), participants: facts};
  assert.equal(departed.status, 'unknown');
  assert.deepEqual(matchResults(departed), [{label: 'Left game (loss)', result: 'loser'}]);
  assert.deepEqual(matchResults({...departed, players: ['Tester', 'Still playing']}).map(result => result.label), ['Tester: Left game (loss)', 'Still playing: Result unavailable']);
});

test('departure evidence must match the replay and verified mods, exclude spectators/bots, and have valid timing', () => {
  for (const time of [0, -1, null, '300000', true, 600001, Infinity]) {
    const response = detail(); response.match.telemetry.engineAnalysis.extended.recordedNetwork.playerDepartures[0].timeMilliseconds = time;
    assert.deepEqual(departureFacts(game(), group(), response), []);
  }
  for (const mutate of [
    response => {response.match.replay_sha256 = 'b'.repeat(64);},
    response => {response.match.id = 99;},
    response => {response.match.replay_analysis.match.modHashes.push('other');},
    response => {response.match.replay_analysis.format.gameVersion = 'other';},
    response => {response.match.telemetry.engineAnalysis.game.cheated = true;},
    response => {response.match.telemetry.engineAnalysis.game.timeout = true;},
    response => {response.match.replay_analysis.players[0].spectator = true;},
    response => {response.match.replay_analysis.players[0].ai = 0;},
    response => {response.match.telemetry.engineAnalysis.extended.recordedNetwork.playerDepartures[0].player = 13;},
    response => {response.match.telemetry.engineAnalysis.extended.recordedNetwork.playerDepartures = [];}
  ]) {
    const response = detail(); mutate(response); assert.deepEqual(departureFacts(game(), group(), response), []);
  }
  for (const status of ['confirmed', 'error', 'pending', 'incomplete', 'unverified']) assert.deepEqual(departureFacts({...game(), status}, group(), detail()), []);
  assert.deepEqual(departureFacts({...game(), modsVerified: false}, group(), detail()), []);
  for (const result of ['winner', 'contender', 'loser']) {
    const response = detail(); response.match.players = [{position_number: 0, result}];
    assert.deepEqual(departureFacts(game(), group(), response), []);
  }
});

test('compressed network evidence and engine departure timestamps are supported', () => {
  const response = detail(), extended = response.match.telemetry.engineAnalysis.extended;
  extended.recordedNetworkGzipBase64 = gzipSync(JSON.stringify(extended.recordedNetwork)).toString('base64');
  extended.recordedNetworkEncoding = 'gzip+base64'; delete extended.recordedNetwork;
  assert.equal(departureFacts(game(), group(), response).length, 1);
  const engine = detail(); engine.match.telemetry.engineAnalysis.extended = {};
  engine.match.players = [{position_number: 0, result: 'unknown', stats_source: 'replay-engine', raw_json: JSON.stringify({leftAtMilliseconds: 500000})}];
  assert.equal(departureFacts(game(), group(), engine)[0].leftAtMilliseconds, 500000);
  const known = {...group(), players: [{id: 'known', identityVerified: true, publicKeys: ['verified-key']}]};
  engine.match.players[0].raw_json = JSON.stringify({leftAtMilliseconds: 500000, publicKey: 'verified-key'});
  assert.equal(departureFacts(game(), known, engine)[0].id, 'known');
});

test('departures add exactly one loss on repeated publications, while verified scores remain intact', async () => {
  const final = {id: 'verified', name: 'Winner', identityVerified: true, publicKeys: ['public-key']};
  const facts = departureFacts(game(), group(), detail());
  const snapshot = {groups: [{...group(), players: [final]}], games: [{...game(), participants: [...facts, ...facts]},
    {...game(), id: 'final', status: 'confirmed', participants: [{id: final.id, name: final.name, result: 'winner', score: -20, kills: 3}]}]};
  await rebuildArcRankings(snapshot, policy);
  const before = structuredClone(snapshot.groups[0].players);
  await rebuildArcRankings(snapshot, policy);
  assert.deepEqual(snapshot.groups[0].players, before);
  const departed = before.find(player => player.name === 'Tester');
  assert.deepEqual([departed.games, departed.losses, departed.wins, departed.bestScore, departed.kills, departed.identityVerified], [1, 1, 0, null, 0, false]);
  assert.equal(before[0].bestScore, -20);
  assert.equal(before[0].identityVerified, true);
});

test('history survives upstream omissions and verification regressions; cached departures survive refresh', () => {
  const oldGame = {...game(), status: 'confirmed', participants: [{id: 'one', name: 'Tester', result: 'winner', score: 100}]};
  const previous = {groups: [group()], games: [oldGame]};
  assert.deepEqual(mergeHistory(previous, {groups: [], games: []}).games, [oldGame]);
  assert.deepEqual(mergeHistory(previous, {groups: [group()], games: [game()]}).games, [oldGame]);
  const facts = departureFacts(game(), group(), detail());
  const cached = {...game(), participants: facts, departureCheckedAt: '2026-11-15T00:00:00Z'};
  assert.deepEqual(mergeHistory({groups: [group()], games: [cached]}, {groups: [group()], games: [game()]}).games[0].participants, facts);
  const identity = {id: 'known', identityVerified: true, publicKeys: ['public-key']};
  const retained = mergeHistory({groups: [{...group(), players: [identity]}], games: [oldGame]}, {groups: [group()], games: []});
  assert.deepEqual(retained.groups[0].players, [identity]);
});

test('evidence failures preserve results and permit retry; successful checks are cached', async () => {
  const snapshot = {groups: [group()], games: [game()]};
  let requests = 0;
  const fetcher = async () => {requests++; return {ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(detail()))};};
  await applyDepartures(snapshot, policy, {fetcher, now: Date.parse('2026-11-15T00:00:00Z')});
  await applyDepartures(snapshot, policy, {fetcher, now: Date.parse('2026-11-15T00:01:00Z')});
  assert.equal(requests, 1);
  assert.equal(snapshot.games[0].participants.length, 1);
  const failed = {groups: [group()], games: [game()]};
  await applyDepartures(failed, policy, {fetcher: async () => {throw Error('offline');}, warn: () => {}});
  assert.deepEqual(failed.games[0].participants, []);
  assert.equal(failed.games[0].departureCheckedAt, undefined);
});

test('invalid or unsupported departure facts cannot turn an unknown result into defeat', () => {
  const player = departureFacts(game(), group(), detail())[0];
  for (const leftAtMilliseconds of [0, '300000', null, NaN, 700000]) assert.equal(participantResult(game(), {...player, leftAtMilliseconds}), 'unknown');
  assert.equal(participantResult({...game(), status: 'error'}, player), 'unknown');
  assert.equal(participantResult({...game(), modsVerified: false}, player), 'unknown');
  assert.equal(participantResult(game(), {...player, resultReason: 'guess'}), 'unknown');
});
