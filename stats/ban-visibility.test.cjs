const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'live-stats.js'), 'utf8');
function declaration(name) {
  let start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing actual renderer function ${name}`);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  const next = /\r?\n(?:async )?function /g;
  next.lastIndex = start + 1;
  const match = next.exec(source);
  return source.slice(start, match ? match.index : source.length);
}
function fixture(extra = {}, functions = []) {
  const context = vm.createContext({
    bannedAccountIds: new Set(), leaderboardData: null, personalRatings: null,
    publishedLoaderOptions: {},
    runtime: {}, ensureSelectedLeaderboard() {}, renderButtons() {},
    getAccountExpandKey: account => account.id,
    getCompactAccountKey: key => `p${key}`,
    ...extra,
  });
  vm.runInContext(['isBannedAccount', ...functions].map(declaration).join('\n'), context);
  return context;
}
function account(id, elo, extra = {}) {
  return {id, elo, name: id, names: new Map([[`${id}-alias`, 1]]),
    publicKeys: new Set([`${id}-key`]), games: [{}, {}], banned: false,
    discounted: false, bot: false, ...extra};
}
const ids = accounts => Array.from(accounts, value => value.id);

test('only explicit bans or finite numeric ratings at/below -2000 are hidden', () => {
  const f = fixture();
  for (const elo of [-2000, -2500, '-2000', ' -2001.25 ']) {
    assert.equal(f.isBannedAccount({elo}), true, `${elo} must be hidden`);
  }
  for (const elo of [-1999.99, 0, '0', null, undefined, '', ' ', NaN, Infinity, -Infinity, 'unrated']) {
    assert.equal(f.isBannedAccount({elo}), false, `${String(elo)} must not create a ban`);
  }
  assert.equal(f.isBannedAccount({banned: true, elo: 1800}), true);
});

test('public ranking, search and selector candidates exclude legacy rating bans', () => {
  const f = fixture({}, ['filterVisibleAccounts', 'filterRankedAccounts',
    'matchesPlayerSearch', 'matchesRecentGameSearch', 'buildGlobalRankMap']);
  const entries = [account('zero', 0), account('null', null), account('negative', -1999),
    account('provisional', null, {discounted: true}), account('score-ban', -2000),
    account('flag-ban', 2200, {banned: true})];
  assert.deepEqual(ids(f.filterVisibleAccounts(entries)), ['zero', 'null', 'negative', 'provisional']);
  assert.deepEqual(ids(f.filterRankedAccounts(entries)), ['zero', 'null', 'negative']);
  assert.deepEqual(Array.from(f.buildGlobalRankMap(entries), pair => Array.from(pair)), [['zero', 1], ['null', 2], ['negative', 3]]);
  for (const entry of entries.slice(-2)) {
    for (const query of ['', entry.name, `${entry.id}-alias`, `${entry.id}-key`]) {
      assert.equal(f.matchesPlayerSearch(entry, query), false);
    }
    const game = {mapName: 'Historical map', players: [{account: entry}]};
    assert.equal(f.matchesRecentGameSearch(game, entry.name), false);
    assert.equal(f.matchesRecentGameSearch(game, 'historical'), true, 'Keep searchable historical matches');
  }
  assert.equal(f.matchesPlayerSearch(entries[0], 'zero'), true);
});

test('Global bans and rating exclusions propagate to every board identity', async () => {
  const payload = {leaderboards: {
    Global: {players: [{id: 'flag', elo: 1900, banned: true}, {id: 'rating', elo: '-2000'}, {id: 'category-only', elo: 1600}, {id: 'safe', elo: 0}]},
    '2v2': {players: [{id: 'flag', elo: 2200}, {id: 'rating', elo: 2300}, {id: 'category-only', elo: -2100}, {id: 'safe', elo: 0}], gameIds: []},
  }, games: []};
  const f = fixture({publishedLoader: {async load() {return {changed: true, payload};}}},
    ['ensureLeaderboardData', 'hydratePublishedBoard', 'isKnownBotName', 'isCrashedPublishedGame']);
  f.KNOWN_BOT_NAMES = new Set();
  await f.ensureLeaderboardData();
  assert.equal(f.mainLiveAvailable, true, 'Same-origin local data is an available host source');
  assert.deepEqual(Array.from(f.bannedAccountIds), ['flag', 'rating', 'category-only']);
  const board = f.hydratePublishedBoard('2v2');
  assert.deepEqual(Array.from(board.accounts.keys()), ['safe']);
  assert.deepEqual(Array.from(f.hydratePublishedBoard('Global').accounts.keys()), ['safe']);
});

test('publicly omitted profiles stay absent while historical slots and known provisional players survive', () => {
  const global = [{id: 'known', name: 'Known', elo: null}];
  const games = ['one', 'two'].map(id => ({id, slots: [
    {id: 'known', name: 'Known', userType: 'winner', team: 0},
    {id: 'omitted', name: 'Omitted', userType: 'loser', team: 1},
  ]}));
  const payload = {leaderboards: {
    Global: {players: global},
    '2v2': {players: [], gameIds: ['one', 'two']},
  }, games};
  const f = fixture({leaderboardData: payload, KNOWN_BOT_NAMES: new Set()},
    ['hydratePublishedBoard', 'isKnownBotName', 'isCrashedPublishedGame', 'filterVisibleAccounts']);
  const board = f.hydratePublishedBoard('2v2');
  assert.deepEqual(Array.from(board.accounts.keys()), ['known']);
  assert.equal(board.accounts.get('known').discounted, true);
  assert.equal(f.filterVisibleAccounts([...board.accounts.values()]).length, 1);
  assert.equal(board.games.length, 2);
  assert.equal(board.games[0].slots.length, 2);
  assert.equal(board.games[0].slots[1].account.banned, true);
  assert.equal(board.games[0].slots[1].account.name, 'Omitted', 'Historical result is preserved');
  payload.leaderboards.Global.players = [];
  assert.equal(f.hydratePublishedBoard('2v2').accounts.size, 0, 'An empty authoritative Global list must not be bypassed');
});

test('compact player links never resolve banned profiles from an unfiltered list', () => {
  const f = fixture({activeExpandedAccountKey: 'pscore', expandedAccounts: new Set()}, ['resolveActivePlayerShareKey']);
  const entries = [account('score', -2000), account('safe', 0)];
  f.resolveActivePlayerShareKey(entries);
  assert.equal(f.expandedAccounts.size, 0);
  f.activeExpandedAccountKey = 'psafe';
  f.resolveActivePlayerShareKey(entries);
  assert.equal(f.activeExpandedAccountKey, 'safe');
  assert.deepEqual(Array.from(f.expandedAccounts), ['safe']);
});

test('direct raw-key profile selection cannot bypass the active/global visibility checks', () => {
  for (const banned of [account('hidden', -2000), account('hidden', 1800, {banned: true})]) {
    const profiles = [];
    const f = fixture({
      activeExpandedAccountKey: 'hidden', expandedAccounts: new Set(['hidden']),
      playerGamesElement: {closest() {return null;}, innerHTML: ''},
      playerGamesTitleElement: {}, playerGamesMetaElement: {},
      playerGamesActionsElement: null, leaderboardRecentMatchesElement: null,
      playerRecentLabelElement: null, playerRecentTableElement: null,
      document: {querySelector() {return null;}},
      resetPlayerGamesView() {}, renderPlayerProfile(value) {profiles.push(value);},
    }, ['renderPlayerGames']);
    f.renderPlayerGames([banned], [banned]);
    assert.equal(f.activeExpandedAccountKey, null);
    assert.equal(f.expandedAccounts.size, 0);
    assert.deepEqual(profiles, [null]);
    assert.match(f.playerGamesElement.innerHTML, /Use \+ on a player/);
  }
});

test('loopback views use only same-origin publications while public hosting keeps its live source', () => {
  const start = source.indexOf('const publishedLoaderOptions =');
  const end = source.indexOf('const INITIAL_PLAYER_LIMIT', start);
  assert.notEqual(start, -1);
  const constructor = source.slice(start, end)
    .replaceAll('import.meta.url', JSON.stringify('https://example.invalid/stats/live-stats.js'));
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', '::1', 'maway2000.github.io']) {
    let options;
    vm.runInNewContext(constructor, {URL, window: {location: {hostname}},
      createPublishedLoader(value) {options = value;}});
    assert.equal(options.baseUrl.href, 'https://example.invalid/stats/published/');
    if (hostname === 'maway2000.github.io') {
      assert.equal(options.liveBaseUrl.href, 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/live/');
    } else {
      assert.equal(Object.hasOwn(options, 'liveBaseUrl'), false);
    }
  }
});
