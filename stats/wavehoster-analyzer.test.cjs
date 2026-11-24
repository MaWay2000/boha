const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../replay-analyzer.js'), 'utf8');
const code = source.slice(source.indexOf('  async function loadArcBattlefield('), source.indexOf('  function attachPublishedPlayerStats('));
const hash = 'a'.repeat(64);
const wave = {format: 1, source: 'WaveHoster', games: [{id: '20261109_083951_7715', matchId: 42, replaySha256: hash}]};
const detail = {replay_sha256: hash, telemetry: {engineAnalysis: {status: 'confirmed'}}, players: [
  {position_number: 1, stats_source: 'replay-engine', result: 'loser', score: 475, kills: 12, raw_json: '{}'}]};
function runner({wavePayload = wave, livePayload = wavePayload, waveError = false, liveError = waveError,
  liveHang = false, match = detail, detailStatus = 200, battlefield = null, research = null} = {}) {
  const calls = [];
  const context = vm.createContext({URL, AbortController, AbortSignal,
    setTimeout: (callback, time) => setTimeout(callback, liveHang ? 5 : time), clearTimeout,
    formatDuration: time => `${Math.floor(time / 60000)}:${String(Math.floor(time / 1000) % 60).padStart(2, '0')}`,
    document: {baseURI: 'https://example.test/boha/replay-analyzer.html'},
    wzstatsPublishedUrl: 'main-index', arcBattlefieldRelayUrl: 'https://example.test/arc-battlefield.php',
    expandCompressedEngineAnalysis: async () => {}, normalizeTacticalReplayPlayerOwners() {},
    fetch: async (value, options) => {
      const url = String(value); calls.push(url);
      if (url.endsWith('?feed=1')) {
        if (liveHang) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('live request timed out')), {once: true}));
        if (liveError) throw Error('live index offline');
        return {ok: true, json: async () => livePayload};
      }
      if (url.includes('wavehoster.json')) { if (waveError) throw Error('modded index offline'); return {ok: true, json: async () => wavePayload}; }
      if (url === 'main-index') return {ok: true, json: async () => ({matches: [{id: 9, source: 'bohan', replay_sha256: hash, source_match_id: '1234567890123'}]})};
      if (url.includes('?research=')) return {ok: Boolean(research), json: async () => research};
      if (url.includes('/arc-battlefield.php?')) return {ok: Boolean(battlefield), status: battlefield ? 200 : 404, json: async () => battlefield};
      return {ok: detailStatus === 200, status: detailStatus, json: async () => ({match})};
    }});
  vm.runInContext(code, context);
  return {calls, load: context.loadWzstatsResult, context};
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
  assert.ok(calls[0].endsWith('/arc-battlefield.php?feed=1'));
  assert.ok(!calls.some(url => url.includes('stats/published/wavehoster.json')));
});

test('a new live replay loads hosting analysis even when absent from GitHub', async () => {
  const {load, calls} = runner({wavePayload: {...wave, games: []}, livePayload: wave});
  assert.equal((await load(hash, '')).playerData[0].score, 475);
  assert.equal(calls.length, 2);
});

test('GitHub remains a fallback when live hosting fails or lacks the replay', async () => {
  for (const options of [{liveError: true}, {liveHang: true}, {livePayload: {...wave, games: []}}, {livePayload: {format: 2}}]) {
    const {load, calls} = runner(options);
    assert.equal((await load(hash, '')).engineAnalysis.status, 'confirmed');
    assert.ok(calls.some(url => url.includes('stats/published/wavehoster.json')));
  }
});

const snapshot = (timeMilliseconds, players) => ({timeMilliseconds, players});
const sampled = (position, score, extra = {}) => ({position, score, kills: 12, droidsBuilt: 5,
  droidsLost: 2, droidsAlive: 3, structuresBuilt: 7, structuresLost: 1,
  structureKills: 0, structuresAlive: 6, ...extra});
const unknownMatch = snapshots => ({...detail, started_at: '2026-11-17 18:37:41',
  telemetry: {engineAnalysis: {status: 'unknown', game: {elapsedMilliseconds: 1800000},
    extended: {snapshots, tacticalReplay: {positionFrames: [{timeMilliseconds: 0}]}, telemetry: {observedRecords: 2778}}}},
  players: [{position_number: 1, stats_source: 'replay', result: null, score: null}]});

test('unknown outcomes display the newest recorded per-player counters and keep telemetry', async () => {
  const match = unknownMatch([snapshot(1785000, [sampled(1, -475, {power: 0, recentPowerWon: 100})]),
    snapshot(15000, [sampled(1, 20)]), snapshot(1786000, []),
    snapshot(1800001, [sampled(1, 99999)])]);
  const {load, context} = runner({match});
  const result = await load(hash, '');
  const player = result.playerData[0];
  assert.equal(player.score, -475);
  assert.equal(player.kills, 12);
  assert.equal(player.droids, 3);
  assert.equal(player.structs, 6);
  assert.equal(player.power, 0);
  assert.equal(player.structureKills, 0);
  assert.equal(player.usertype, null, 'sampled contender/winner states never create a final result');
  assert.equal(player.statsSource, 'replay-snapshot');
  assert.equal(player.sampledAtMilliseconds, 1785000);
  assert.equal(player.powerWon, null, 'recent power is not a lifetime total');
  assert.equal(result.engineAnalysis.extended.tacticalReplay.positionFrames.length, 1);
  assert.equal(result.engineAnalysis.extended.telemetry.observedRecords, 2778);
  assert.equal(result.endDate, '2026-11-17T18:37:41Z');
  const notice = context.recordedSummaryNotice({players: [{summary: player}]});
  assert.match(notice, /29:45/);
  assert.match(notice, /may precede the replay end/);
  assert.match(notice, /Win\/loss remains unknown/);
});

test('snapshot fields are validated independently and never supplied by another player', async () => {
  const match = unknownMatch([snapshot(100, [sampled(7, 9999),
    sampled(1, 10, {kills: null, droidsBuilt: -1, structuresAlive: '6'})])]);
  const {load} = runner({match});
  const player = (await load(hash, '')).playerData[0];
  assert.equal(player.score, 10);
  assert.equal(player.kills, null);
  assert.equal(player.droidsBuilt, null);
  assert.equal(player.structs, null);
});

test('verified final statistics take precedence over sampled counters', async () => {
  const match = {...detail, telemetry: unknownMatch([snapshot(100, [sampled(1, 9999)])]).telemetry};
  const {load} = runner({match});
  const result = await load(hash, '');
  assert.equal(result.playerData[0].score, 475);
  assert.equal(result.playerData[0].usertype, 'loser');
  assert.equal(result.playerData[0].statsSource, 'replay-engine');
});

test('no snapshots or an unavailable detail API leave statistics unknown', async () => {
  for (const options of [{match: unknownMatch([])}, {detailStatus: 503}]) {
    const {load} = runner(options);
    const result = await load(hash, '');
    if (result.playerData.length) assert.equal(result.playerData[0].score, null);
    else assert.ok(result.detailError);
  }
});

test('saved Arc results match a unique human name when the detail API is unavailable', async () => {
  const game = {...wave.games[0], status: 'confirmed', modsVerified: true,
    participants: [{name: 'Arc player', result: 'loser', score: 475, kills: 12}]};
  const {load, context} = runner({liveError: true, detailStatus: 404, wavePayload: {...wave, games: [game]}});
  const result = await load(hash, game.id);
  assert.equal(result.replayUrl, 'https://api.wavehoster.net/v1/replays/' + game.id);
  assert.equal(result.engineAnalysis, null);
  const start = source.indexOf('  function attachPublishedPlayerStats(');
  vm.runInContext(source.slice(start, source.indexOf('  function decodeGameTime(', start)), context);
  const extraction = {players: [{name: 'Arc player', position: 7, ai: -1}, {name: 'Arc player', position: 1, ai: 0}]};
  context.attachPublishedPlayerStats(extraction, result);
  assert.equal(extraction.players[0].summary.result, 'loser');
  assert.equal(extraction.players[0].summary.kills, 12);
  assert.equal(extraction.players[1].summary, null);
  extraction.players[1].ai = -1;
  context.attachPublishedPlayerStats(extraction, result);
  assert.ok(extraction.players.every(player => player.summary === null));
});

test('published Arc matches load exact positions without requesting private match details', async () => {
  const game = {...wave.games[0], status: 'confirmed', modsVerified: true,
    participants: [{name: 'Arc player', result: 'loser', score: 475, kills: 12}]};
  const engineAnalysis = {extended: {tacticalReplay: {exactObjectPositions: true,
    positionFrames: [{time: 0, droids: [[12, 1, 128, 256, 100, 0, 0, 0]], structures: []}]}}};
  const {load, calls} = runner({liveError: true, wavePayload: {...wave, games: [game]},
    battlefield: {replaySha256: hash, engineAnalysis}});
  const result = await load(hash, game.id);
  assert.equal(result.engineAnalysis, engineAnalysis);
  assert.equal(result.playerData[0].score, 475);
  assert.ok(calls.at(-1).endsWith('/arc-battlefield.php?sha=' + hash));
  assert.ok(!calls.some(url => url.includes('/matches/')));

  const mismatched = runner({liveError: true, wavePayload: {...wave, games: [game]},
    battlefield: {replaySha256: 'b'.repeat(64), engineAnalysis}});
  const fallback = await mismatched.load(hash, game.id);
  assert.equal(fallback.engineAnalysis, null);
  assert.equal(fallback.playerData[0].score, 475);

  const pending = {...game, status: 'pending', modsVerified: false, participants: []};
  const beforePublish = runner({wavePayload: {...wave, games: [pending]}, livePayload: {...wave, games: [game]},
    battlefield: {replaySha256: hash, engineAnalysis}});
  assert.equal((await beforePublish.load(hash, game.id)).engineAnalysis, engineAnalysis);
  assert.equal(beforePublish.calls.some(url => url.includes('stats/published/wavehoster.json')), false);

  const missing = runner({wavePayload: {...wave, games: []}, livePayload: {...wave, games: []},
    battlefield: {replaySha256: hash, engineAnalysis}});
  assert.equal((await missing.load(hash, game.id)).engineAnalysis, engineAnalysis);
  assert.ok(!missing.calls.includes('main-index'));
});

test('sampled statistics survive attachment without becoming award-eligible final stats', async () => {
  const {context, load} = runner({match: unknownMatch([snapshot(15000, [sampled(1, 100)])])});
  const start = source.indexOf('  function attachPublishedPlayerStats(');
  const end = source.indexOf('  function decodeGameTime(', start);
  vm.runInContext(source.slice(start, end), context);
  const extraction = {players: [{position: 1}]};
  context.attachPublishedPlayerStats(extraction, await load(hash, ''));
  assert.equal(extraction.players[0].summary.score, 100);
  assert.equal(extraction.players[0].summary.partialStats, true);
  assert.equal(extraction.players[0].summary.statsSource, 'replay-snapshot');
  assert.equal(extraction.players[0].summary.sampledAtMilliseconds, 15000);
  assert.equal(extraction.players[0].summary.result, '');
  assert.equal(extraction.engineAnalysis.status, 'unknown');
});
test('a failed modded index leaves main leaderboard analysis working', async () => {
  const {calls, load} = runner({waveError: true});
  const result = await load(hash, '1234567890123');
  assert.equal(result.playerData[0].kills, 12);
  assert.ok(calls.includes('main-index'));
  assert.ok(calls.at(-1).endsWith('/matches/9'));
});
test('Bohan research percentages work without match detail and stay attached to the correct slots', async () => {
  const research = {replaySha256: hash, researchActivity: [
    {position: 1, percent: 91.68}, {position: 2, percent: 0}, {position: 3, percent: 105}, {position: 4, percent: 85}
  ]};
  const {load, context} = runner({waveError: true, detailStatus: 404, research});
  const start = source.indexOf('  function attachPublishedPlayerStats(');
  const metric = source.indexOf('  function calculateResearchActivity(');
  vm.runInContext(source.slice(start, source.indexOf('  function decodeGameTime(', start))
    + source.slice(metric, source.indexOf('  function createResearchCell(', metric)), context);
  const extraction = {players: [{position: 1}, {position: 2}, {position: 3}, {position: 4, spectator: true}]};
  context.attachPublishedPlayerStats(extraction, await load(hash, '1234567890123'));
  assert.deepEqual(Array.from(context.calculateResearchActivity(extraction.players).values()), [91.68, 0, null, null]);
  const wrongReplay = runner({waveError: true, detailStatus: 404, research: {...research, replaySha256: 'b'.repeat(64)}});
  assert.equal((await wrongReplay.load(hash, '1234567890123')).researchActivity.length, 0);
});
test('a mismatched detail result cannot attach another replay’s players or analysis', async () => {
  const {load} = runner({match: {...detail, replay_sha256: 'b'.repeat(64)}});
  const result = await load(hash, '');
  assert.equal(result.engineAnalysis, null);
  assert.equal(result.playerData.length, 0);
  assert.ok(result.detailError);
});
