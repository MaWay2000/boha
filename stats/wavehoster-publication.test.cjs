const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {sanitizeWaveHoster, sync} = require('./wavehoster-publication.cjs');
const fixture = () => ({format: 1, source: 'WaveHoster', ranking: 'wins-then-best-score', generatedAt: '2026-11-11T00:00:00Z',
 groups: [{id: 'group', version: '4.7.0', mods: ['hash'], label: 'Mod', matches: 1, confirmed: 1,
 players: [{id: 'player', name: 'Nickname', identityVerified: true, games: 1, wins: 0, losses: 1, draws: 0, bestScore: -20, kills: 2,
 names: [{name: 'Nickname', games: 1}], publicKeys: ['public-key']}]}],
 games: [{id: 'replay', matchId: 42, replaySha256: 'a'.repeat(64), group: 'group', map: 'TD', status: 'confirmed', players: ['Nickname'], modsVerified: true,
 participants: [{id: 'player', name: 'Nickname', result: 'loser', score: -20, kills: 2}]}], queue: {privateWorkerDetails: 'omit'}});
test('WaveHoster publication retains public identities and results and drops unknown fields', () => {
 const input = fixture(); input.groups[0].players[0].internalDetail = 'omit'; input.games[0].internalDetail = 'omit';
 const output = sanitizeWaveHoster(input);
 assert.equal(output.games[0].participants[0].score, -20);
 assert.equal(output.games[0].matchId, 42);
 assert.equal(output.games[0].replaySha256, 'a'.repeat(64));
 assert.deepEqual(output.groups[0].players[0].publicKeys, ['public-key']);
 assert.ok(!JSON.stringify(output).includes('omit'));
 assert.ok(Object.hasOwn(input, 'queue'));
});
test('WaveHoster publication rejects credentials and object-shaped scalar fields', () => {
 for (const key of ['token', 'password', 'ip_address', 'privateKey']) {
  const input = fixture(); input.games[0][key === 'token' ? 'access_token' : key] = 'secret';
  assert.throws(() => sanitizeWaveHoster(input), /Private field/);
 }
 const input = fixture(); input.groups[0].players[0].name = {internal: 'not public'};
 assert.throws(() => sanitizeWaveHoster(input), /Invalid WaveHoster field/);
});
test('failed downloads leave the last public snapshot intact', async () => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-publication-')), destination = path.join(directory, 'wavehoster.json');
 try {
  fs.writeFileSync(destination, 'previous');
  await assert.rejects(sync({destination, fetcher: async () => ({ok: false, status: 503})}), /503/);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'previous');
  assert.equal(await sync({destination, fetcher: async () => ({ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(fixture()))})}), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(destination)), sanitizeWaveHoster(fixture()));
 } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});
