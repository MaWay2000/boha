import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeArcRecentGames, mergeRecentGames} from './recent-games.mjs';

const hash = 'a'.repeat(64);
const game = (overrides = {}) => ({id: '20261111_075642_7885', group: 'td', map: 'TowerDefense3_v',
  startedAt: '2026-11-11T07:56:42Z', durationMilliseconds: 600000, replaySha256: hash, status: 'confirmed',
  participants: [{id: 'p', name: 'Player', result: 'loser'}], ...overrides});
const snapshot = (games = [game()]) => ({format: 1, source: 'WaveHoster', groups: [{id: 'td', players: [
  {id: 'p', name: 'Player', names: [{name: 'Older name', games: 2}], publicKeys: ['saved-key']}
]}], games});

test('Arc records preserve dates, results, saved identities and direct Analyze URLs', () => {
  const input = snapshot(), before = JSON.stringify(input);
  const [row] = normalizeArcRecentGames(input);
  assert.equal(row.endDate, Date.parse(input.games[0].startedAt) + 600000);
  assert.equal(row.players[0].userType, 'loser');
  assert.equal(row.players[0].account.names.get('Older name'), 2);
  assert.ok(row.players[0].account.publicKeys.has('saved-key'));
  assert.match(row.players[0].account.arcProfileUrl, /tab=wavehoster&ruleset=td&player=p/);
  assert.equal(row.replayUrl, 'https://api.wavehoster.net/v1/replays/' + input.games[0].id);
  assert.equal(row.replaySha256, hash);
  assert.equal(JSON.stringify(input), before);
});

test('bad replay rows cannot stop the list; unconfirmed short games remain hidden', () => {
  const games = [null, game({startedAt: 'bad'}), game({group: 'absent'}), game({durationMilliseconds: -1}),
    game({status: 'pending', durationMilliseconds: 75000}), game({durationMilliseconds: 75000}),
    game({status: 'pending', durationMilliseconds: 300000})];
  const rows = normalizeArcRecentGames(snapshot(games));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].duration, 75000);
  assert.equal(rows[1].players[0].userType, null);
  assert.throws(() => normalizeArcRecentGames({games: []}), /Invalid Arc/);
});

test('fallback participant names do not guess an identity or result', () => {
  const [row] = normalizeArcRecentGames(snapshot([game({participants: [], players: ['Someone'], status: 'pending'})]));
  assert.equal(row.players[0].account.arcProfileUrl, null);
  assert.equal(row.players[0].userType, null);
  assert.equal(row.players[0].account.name, 'Someone');
});

test('promoted main games win over cached Arc duplicates by source ID and replay hash', () => {
  const promoted = {source: 'wavehoster', sourceMatchId: '20261111_075642_7885', replayUrl: 'https://host/replays/' + hash};
  const main = [promoted], arc = normalizeArcRecentGames(snapshot([
    game(), game({id: '20261111_075643_7886'}),
    game({id: '20261111_075644_7887', replaySha256: 'b'.repeat(64)}),
    game({id: '20261111_075644_7887', replaySha256: 'c'.repeat(64)})
  ]));
  const rows = mergeRecentGames(main, arc);
  assert.equal(rows.length, 2);
  assert.equal(rows[0], promoted);
  assert.equal(main.length, 1);
  assert.equal(arc.length, 4);
});

const source = readFileSync(new URL('./live-stats.js', import.meta.url), 'utf8');
function loadFunction(context, name, end) {
  vm.runInContext(source.slice(source.indexOf('function ' + name + '('), source.indexOf('function ' + end + '(')), context);
}

test('source filters exclude other sources and power filters never invent Arc strength', () => {
  const context = vm.createContext({matchesSourceElement: {}, matchesSource: 'arc', matchesDateFrom: '', matchesDateTo: '',
    matchesMap: '', matchesMinDuration: '', matchesMaxDuration: '', matchesMinPlayers: '', matchesMaxPlayers: '',
    matchesMinPowerGap: '', matchesUpsetsOnly: false, parseFilterDate: () => null,
    parseOptionalNumber: value => value === '' ? null : Number(value), getPlayerCount: row => row.players.length,
    getMatchTeamPowerDifference: row => row.arcMatch ? null : 20, isUpsetMatch: () => false});
  loadFunction(context, 'matchesAdvancedFilters', 'getActiveMatchFilterCount');
  const [arc] = normalizeArcRecentGames(snapshot());
  assert.equal(context.matchesAdvancedFilters(arc), true);
  assert.equal(context.matchesAdvancedFilters({...arc, arcMatch: undefined}), false);
  context.matchesSource = 'main';
  assert.equal(context.matchesAdvancedFilters(arc), false);
  context.matchesSource = 'all';
  context.matchesMinPowerGap = '10';
  assert.equal(context.matchesAdvancedFilters(arc), false);
});

test('Arc map summaries keep a loss as a loss and tolerate unknown identities', () => {
  const context = vm.createContext({getNormalizedTeamUserType: () => 'neutral', getAccountExpandKey: () => {throw Error('Main identity path');}});
  loadFunction(context, 'getSuccessfulMapPlayers', 'renderMapSummary');
  const rows = normalizeArcRecentGames(snapshot([game({participants: [{name: 'Unknown', result: 'loser'}]})]));
  const [record] = context.getSuccessfulMapPlayers(rows);
  assert.equal(record.games, 1);
  assert.equal(record.wins, 0);
});

test('Arc names are escaped and link to Arc profiles without PvP percentages', () => {
  const context = vm.createContext({escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    getTeamToneClass: () => 'is-loss'});
  loadFunction(context, 'renderMatchup', 'getLastUpdateTime');
  const [row] = normalizeArcRecentGames(snapshot([game({participants: [{id: 'p', name: '<Player>', result: 'loser'}]})]));
  const html = context.renderMatchup(row, {includePlayerPower: true, showTeamStrength: true});
  assert.match(html, /&lt;Player>/);
  assert.match(html, /tab=wavehoster&amp;ruleset=td&amp;player=p/);
  assert.match(html, /Lost/);
  assert.doesNotMatch(html, /Team power|Mega win|%|<Player>/);
});

test('either match feed can fail independently without hiding the available feed', async () => {
  for (const failed of ['main', 'arc']) {
    let renders = 0;
    const context = vm.createContext({Promise, pendingFeedRefresh: null, mainLiveAvailable: true, arcLiveAvailable: true, matchesSourceElement: {}, matchesFeedStatusElement: {}, hostSyncElement: {},
      leaderboardData: failed === 'main' ? null : {games: []}, arcRecentSignature: failed === 'arc' ? null : 'loaded',
      ensureLeaderboardData: async () => {if (failed === 'main') throw Error('offline'); return true;},
      ensureArcRecentData: async () => {if (failed === 'arc') throw Error('offline'); return true;},
      render: () => renders++, renderMatches: () => {throw Error('Should preserve available games');}});
    vm.runInContext(source.slice(source.indexOf('async function refreshFromMirror('), source.indexOf('function startRefreshLoop(')), context);
    await context.refreshFromMirror(true);
    assert.equal(renders, 1);
    assert.equal(context.hostSyncElement.textContent, 'False');
    assert.equal(context.matchesFeedStatusElement.hidden, false);
    assert.match(context.matchesFeedStatusElement.textContent, /Showing available results/);
  }
});

test('processed Arc departures refresh Recent Matches even when the source timestamp and count stay unchanged', async () => {
  const first = snapshot([game({status: 'unknown', modsVerified: true})]);
  first.generatedAt = '2026-11-17T10:00:00Z';
  const second = structuredClone(first);
  Object.assign(second.games[0].participants[0], {resultReason: 'departure', leftAtMilliseconds: 300000});
  const records = [first, second, second].map(payload => ({snapshot: payload, text: JSON.stringify(payload), source: 'live'}));
  let request = 0;
  const context = vm.createContext({matchesSourceElement: {}, arcRecentRecord: null, arcLiveAvailable: true,
    arcRecentSignature: null, arcRecentGames: [], normalizeArcRecentGames,
    refreshWaveHoster: async () => ({record: records[request++], liveAvailable: true})});
  vm.runInContext(source.slice(source.indexOf('async function ensureArcRecentData('), source.indexOf('function hydratePublishedBoard(')), context);
  assert.equal(await context.ensureArcRecentData(), true);
  assert.equal(context.arcRecentGames[0].players[0].userType, null);
  assert.equal(await context.ensureArcRecentData(), true);
  assert.equal(context.arcRecentGames[0].players[0].userType, 'loser');
  assert.equal(await context.ensureArcRecentData(), false);
});

test('overlapping page refreshes share work and saved data remains visible during live outages', async () => {
  let mainCalls = 0, arcCalls = 0, renders = 0;
  const context = vm.createContext({Promise, pendingFeedRefresh: null, mainLiveAvailable: false, arcLiveAvailable: false,
    matchesSourceElement: {}, matchesFeedStatusElement: {}, hostSyncElement: {}, leaderboardData: {games: []}, arcRecentSignature: 'saved',
    ensureLeaderboardData: async () => {mainCalls++; return true;}, ensureArcRecentData: async () => {arcCalls++; return true;},
    render: () => renders++});
  vm.runInContext(source.slice(source.indexOf('async function refreshFromMirror('), source.indexOf('function startRefreshLoop(')), context);
  await Promise.all([context.refreshFromMirror(), context.refreshFromMirror()]);
  assert.deepEqual([mainCalls, arcCalls, renders], [1, 1, 1]);
  assert.match(context.matchesFeedStatusElement.textContent, /Showing saved results/);
});

test('the host indicator updates on unchanged data and Recent Matches checks both feeds', async () => {
  const context = vm.createContext({Promise, pendingFeedRefresh: null, mainLiveAvailable: true, arcLiveAvailable: false,
    matchesSourceElement: null, matchesFeedStatusElement: null, hostSyncElement: {},
    ensureLeaderboardData: async () => false, ensureArcRecentData: async () => false,
    render: () => {throw Error('An unchanged snapshot should not rerender the tables');}});
  vm.runInContext(source.slice(source.indexOf('async function refreshFromMirror('), source.indexOf('function startRefreshLoop(')), context);
  await context.refreshFromMirror();
  assert.equal(context.hostSyncElement.textContent, 'True');
  context.matchesSourceElement = {};
  await context.refreshFromMirror();
  assert.equal(context.hostSyncElement.textContent, 'False');
  context.arcLiveAvailable = true;
  await context.refreshFromMirror();
  assert.equal(context.hostSyncElement.textContent, 'True');
});
