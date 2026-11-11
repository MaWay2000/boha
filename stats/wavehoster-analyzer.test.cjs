const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../replay-analyzer.js'), 'utf8');
const code = source.slice(source.indexOf('  async function loadWzstatsResult('), source.indexOf('  function attachPublishedPlayerStats('));
const hash = 'a'.repeat(64);
const wave = {format: 1, source: 'WaveHoster', games: [{id: '20261109_083951_7715', matchId: 42, replaySha256: hash}]};
const detail = {replay_sha256: hash, telemetry: {engineAnalysis: {status: 'confirmed'}}, players: [
  {position_number: 1, stats_source: 'replay-engine', result: 'loser', score: 475, kills: 12, raw_json: '{}'}]};
function runner({wavePayload = wave, waveError = false, match = detail} = {}) {
  const calls = [];
  const context = vm.createContext({URL, document: {baseURI: 'https://example.test/boha/replay-analyzer.html'},
    wzstatsPublishedUrl: 'main-index', expandCompressedEngineAnalysis: async () => {}, normalizeTacticalReplayPlayerOwners() {},
    fetch: async value => {
      const url = String(value); calls.push(url);
      if (url.includes('wavehoster.json')) { if (waveError) throw Error('modded index offline'); return {ok: true, json: async () => wavePayload}; }
      if (url === 'main-index') return {ok: true, json: async () => ({matches: [{id: 9, replay_sha256: hash, source_match_id: '1234567890123'}]})};
      return {ok: true, json: async () => ({match})};
    }});
  vm.runInContext(code, context);
  return {calls, load: context.loadWzstatsResult};
}
test('modded Analyze attaches the cached engine result without fetching the main match index', async () => {
  const {calls, load} = runner();
  const result = await load(hash, '');
  assert.equal(result.playerData[0].usertype, 'loser');
  assert.equal(result.playerData[0].score, 475);
  assert.equal(result.engineAnalysis.status, 'confirmed');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endsWith('/matches/42'));
  assert.ok(!calls.includes('main-index'));
});
test('a failed modded index leaves main leaderboard analysis working', async () => {
  const {calls, load} = runner({waveError: true});
  const result = await load(hash, '1234567890123');
  assert.equal(result.playerData[0].kills, 12);
  assert.ok(calls.includes('main-index'));
  assert.ok(calls.at(-1).endsWith('/matches/9'));
});
test('a mismatched detail result cannot attach another replay’s players or analysis', async () => {
  const {load} = runner({match: {...detail, replay_sha256: 'b'.repeat(64)}});
  const result = await load(hash, '');
  assert.equal(result.engineAnalysis, null);
  assert.equal(result.playerData.length, 0);
  assert.ok(result.detailError);
});
