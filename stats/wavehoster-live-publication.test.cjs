const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {publishLive} = require('./wavehoster-live-publication.cjs');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-live-'));
  const source = path.join(directory, 'source.json'), destination = path.join(directory, 'public/wavehoster.json');
  const seed = path.join(directory, 'seed.json'), policyPath = path.join(directory, 'policy.json');
  const policy = {gameVersion: '4.7.0', modHash: 'a'.repeat(64), archiveModHashes: []};
  const now = Date.parse('2026-11-17T12:00:00Z');
  const human = {id: 'known', name: 'Tester', identityVerified: true, games: 1, wins: 1, losses: 0,
    draws: 0, bestScore: 50, kills: 3, names: [{name: 'Tester', games: 1}], publicKeys: ['public-key']};
  const game = n => ({id: `replay${n}`, matchId: n, replaySha256: String(n).repeat(64), group: 'group',
    map: 'Wave-Defense', startedAt: '2026-11-17T11:59:00Z', durationMilliseconds: 600000,
    status: 'unknown', modsVerified: true, players: [n === 3 ? 'New human' : 'Tester'], participants: []});
  const raw = {format: 1, source: 'WaveHoster', ranking: 'wins-then-best-score', generatedAt: new Date(now).toISOString(),
    groups: [{id: 'group', version: '4.7.0', mods: [policy.modHash], players: [human]}], games: [game(1), game(2), game(3)]};
  const previous = structuredClone(raw);
  previous.games.pop();
  previous.games[0].status = 'confirmed';
  previous.games[0].participants = [{id: human.id, name: human.name, result: 'winner', score: 50, kills: 3}];
  previous.games[1].departureCheckedAt = new Date(now).toISOString();
  previous.games[1].participants = [{id: human.id, name: human.name, result: 'loser', resultReason: 'departure',
    leftAtMilliseconds: 50000, score: null, kills: null}];
  fs.writeFileSync(source, JSON.stringify(raw)); fs.writeFileSync(seed, JSON.stringify(previous));
  fs.writeFileSync(policyPath, JSON.stringify(policy));
  const evidence = {match: {id: 3, replay_sha256: game(3).replaySha256,
    replay_analysis: {format: {gameVersion: '4.7.0'}, match: {modHashes: [policy.modHash]},
      players: [{position: 0, ai: -2, spectator: false, name: 'New human'}]},
    telemetry: {engineAnalysis: {status: 'unknown', game: {version: '4.7.0', timeout: false, cheated: false},
      extended: {recordedNetwork: {playerDepartures: [{player: 0, timeMilliseconds: 60000}]}}}},
    players: [], ip_address: '192.0.2.1'}};
  const options = {source, destination, seed, policyPath, apiBase: 'http://127.0.0.1:8787/wzstats/api/v1', now};
  return {directory, options, raw, evidence, read: () => JSON.parse(fs.readFileSync(destination))};
}

test('live publication retains saved wins and departures before fetching new evidence, then updates safely', async () => {
  const f = fixture();
  try {
    let calls = 0;
    const fetcher = async url => {
      calls++;
      assert.equal(url, 'http://127.0.0.1:8787/wzstats/api/v1/matches/3');
      const interim = f.read();
      assert.equal(interim.games.length, 3);
      assert.equal(interim.games.find(game => game.id === 'replay1').status, 'confirmed');
      assert.equal(interim.groups[0].players.find(player => player.id === 'known').losses, 1);
      return {ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(f.evidence))};
    };
    assert.equal(await publishLive({...f.options, fetcher}), true);
    const data = f.read();
    assert.equal(data.games.find(game => game.id === 'replay3').participants[0].result, 'loser');
    const known = data.groups[0].players.find(player => player.id === 'known');
    assert.deepEqual([known.wins, known.losses, known.bestScore, known.kills], [1, 1, 50, 3]);
    assert.deepEqual(known.publicKeys, ['public-key']);
    assert.ok(!JSON.stringify(data).includes('192.0.2.1'));
    assert.equal(await publishLive({...f.options, fetcher, now: f.options.now + 30000}), false);
    assert.equal(calls, 1);
  } finally { fs.rmSync(f.directory, {recursive: true, force: true}); }
});

test('bad input cannot replace the last good publication; failed evidence keeps results and permits retry', async () => {
  const f = fixture();
  try {
    let calls = 0;
    const fetcher = async () => {calls++; throw Error('offline');};
    await publishLive({...f.options, fetcher});
    assert.equal(f.read().groups[0].players.find(player => player.id === 'known').wins, 1);
    assert.equal(f.read().games.find(game => game.id === 'replay3').participants.length, 0);
    await publishLive({...f.options, fetcher, now: f.options.now + 30000});
    assert.equal(calls, 2);
    const saved = fs.readFileSync(f.options.destination, 'utf8');
    f.raw.games[0].password = 'private';
    fs.writeFileSync(f.options.source, JSON.stringify(f.raw));
    await assert.rejects(publishLive({...f.options, fetcher}), /Private field/);
    assert.equal(fs.readFileSync(f.options.destination, 'utf8'), saved);
  } finally { fs.rmSync(f.directory, {recursive: true, force: true}); }
});
