const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'live-stats.js'), 'utf8');

test('right panel switches between recent matches, a profile and selected-player no-data state', () => {
  const heading = {textContent: ''};
  const nicknamePanel = {};
  const context = vm.createContext({
    playerGamesElement: {innerHTML: '', closest: () => null}, playerGamesTitleElement: {innerHTML: ''},
    playerGamesMetaElement: {textContent: ''}, playerGamesActionsElement: {innerHTML: ''},
    playerRecentLabelElement: {}, playerRecentTableElement: {}, leaderboardRecentMatchesElement: {},
    playerProfileElement: {innerHTML: '', querySelector: () => nicknamePanel}, document: {querySelector: () => heading},
    mountGameNicknames(panel, identity) { context.nicknameHistory = {panel, identity}; },
    activeExpandedAccountKey: null, expandedAccounts: new Set(), selectedLeaderboard: '2v2',
    getAccountExpandKey: account => account.id, escapeHtml: value => String(value),
    resetPlayerGamesView() {}, renderPlayerProfile(account) { context.profile = account; },
    renderPlayerRankMenu: () => '', bindPlayerRankMenu() {}, filterVisibleAccounts: accounts => accounts,
    showingAllPlayerGames: false, PLAYER_GAME_LIMIT: 10, activeExpandedPlayerGameKey: null,
    getPlayerGameKey: game => game.id,
    renderPlayerGameActions() {},
    comparePlayerGames: (left, right) => right.endDate - left.endDate,
    getPlayerGameOutcome: () => ({label: 'Won', className: 'stats-win'}),
    getReplaySource: () => ({replayUrl: 'https://replay.test/game.wzrp', label: 'Bohan', pageUrl: ''}),
    getReplayAnalyzerUrl: () => 'replay-analyzer.html',
    renderMatchup(game, options) { context.matchupOptions = options; return '<div class="stats-team-inline-power">Team roster</div>'; },
    renderMapFilterLink: name => name, formatMatchDate: () => '2026.11.24',
    formatMatchTime: () => '2:53 AM', formatDuration: () => '26:00',
    bindCopyButtons() {}, bindPlayerGameJumpLinks() {}
  });
  const banStart = source.indexOf('function isBannedAccount(');
  vm.runInContext(source.slice(banStart, source.indexOf('function filterVisibleAccounts(', banStart)), context);
  vm.runInContext(source.slice(source.indexOf('function renderPlayerGames('), source.indexOf('function setPlayerGameRowExpanded(')), context);
  const player = {id: 'one', name: 'Player', mainPublicKey: 'player-key', games: []};
  context.renderPlayerGames([player]);
  assert.equal(context.leaderboardRecentMatchesElement.hidden, false);
  assert.equal(context.playerRecentTableElement.hidden, true);
  assert.equal(context.profile, null);
  assert.equal(heading.textContent, 'Recent matches');
  assert.match(context.playerGamesTitleElement.innerHTML, /2v2/);
  context.activeExpandedAccountKey = 'one';
  context.renderPlayerGames([player]);
  assert.equal(context.leaderboardRecentMatchesElement.hidden, true);
  assert.equal(context.playerRecentTableElement.hidden, false);
  assert.equal(context.profile, player);
  player.games.push({id: 'game', endDate: 1, mapName: 'NTW', duration: 1560,
    teams: [{players: [{account: player, eloDelta: 1.65}]}]});
  context.playerGamesElement.querySelectorAll = () => [];
  context.renderPlayerGames([player]);
  assert.equal(context.matchupOptions.variant, 'inline-power');
  assert.equal(context.matchupOptions.highlightedAccountKey, 'one');
  assert.equal(context.matchupOptions.clickablePlayerTiles, true);
  assert.match(context.playerGamesElement.innerHTML, /stats-matchup"><div class="stats-team-inline-power">Team roster/);
  assert.match(context.playerGamesElement.innerHTML, /stats-recent-map-duration">26:00/);
  assert.match(context.playerGamesElement.innerHTML, />\+1\.65</);
  assert.match(context.playerGamesElement.innerHTML, />Analyze</);
  assert.doesNotMatch(context.playerGamesElement.innerHTML, /stats-player-game-detail-row/);
  context.renderPlayerGames([], [player]);
  assert.equal(context.leaderboardRecentMatchesElement.hidden, true);
  assert.match(context.playerGamesTitleElement.innerHTML, /No data/);
  assert.equal(context.nicknameHistory.panel, nicknamePanel);
  assert.equal(context.nicknameHistory.identity.publicKey, player.mainPublicKey);
  context.activeExpandedAccountKey = null;
  context.renderPlayerGames([player]);
  assert.equal(context.leaderboardRecentMatchesElement.hidden, false);
  assert.equal(context.profile, null);
});

function matchFixture(sidebar) {
  const actions = [];
  const context = vm.createContext({
    matchesElement: {innerHTML: '', querySelectorAll: () => []}, leaderboardRecentMatchesElement: sidebar ? {hidden: false} : null,
    matchesSourceElement: sidebar ? null : {}, arcRecentGames: [], mergeRecentGames: (main, arc) => [...main, ...arc],
    renderMatchMapOptions() {}, getActiveMatchFilterCount: () => 1, matchFilterCountElement: null,
    matchesSearchQuery: 'keep', normalizeSearchQuery: value => value,
    matchesRecentGameSearch: (game, query) => !query || game.mapName.includes(query),
    matchesAdvancedFilters: game => game.allowed,
    compareMatches: (a, b) => b.endDate - a.endDate, visibleMatchCount: 2,
    INITIAL_MATCH_LIMIT: 30, MATCH_LIMIT_STEP: 30,
    renderMapSummary() {}, renderMatchActions: (...values) => actions.push(values),
    getReplaySource: game => ({replayUrl: game.replayUrl, label: 'Replay source', pageUrl: 'https://source.test/'}),
    escapeHtml: value => String(value), formatMatchDate: value => String(value), formatMatchTime: () => 'time',
    renderMapFilterLink: name => name, formatDuration: value => String(value), renderMatchup: () => 'players',
    getReplayAnalyzerUrl: url => 'analyzer?replay=' + url
  });
  vm.runInContext(source.slice(source.indexOf('function renderMatches('), source.indexOf('function getSuccessfulMapPlayers(')), context);
  return {context, actions};
}

test('desktop sidebar extends past the first batch and stops at the last whole row', () => {
  const {context, actions} = matchFixture(true);
  const children = [];
  let tableBottom = 3049;
  const insert = (html) => {
    for (const _ of html.matchAll(/<tr>/g)) {
      const height = children.length % 2 ? 80 : 60;
      const bottom = (children.at(-1)?.getBoundingClientRect().bottom ?? 50) + height;
      const row = {
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({bottom}),
        remove: () => children.splice(children.indexOf(row), 1)
      };
      children.push(row);
    }
  };
  context.matchesElement = {
    children,
    querySelectorAll: () => children,
    get lastElementChild() { return children.at(-1); },
    set innerHTML(html) { children.length = 0; insert(html); },
    insertAdjacentHTML: (_, html) => insert(html)
  };
  context.window = {matchMedia: () => ({matches: true})};
  context.ranksElement = {closest: () => ({getBoundingClientRect: () => ({bottom: tableBottom})})};
  context.visibleMatchCount = 30;
  const games = Array.from({length: 90}, (_, endDate) => ({
    mapName: 'Map', endDate, duration: 300000, replayUrl: 'https://source.test/replay'
  }));

  context.renderMatches(games);
  assert.deepEqual(actions.at(-1), [90, 42]);
  assert.equal(children.at(-1).getBoundingClientRect().bottom, 2990);
  tableBottom = 250;
  context.renderMatches(games);
  assert.deepEqual(actions.at(-1), [90, 3]);
  context.visibleMatchCount = 33;
  context.renderMatches(games);
  assert.deepEqual(actions.at(-1), [90, 33]);
  context.visibleMatchCount = 30;
  context.window.matchMedia = () => ({matches: false});
  context.renderMatches(games);
  assert.deepEqual(actions.at(-1), [90, 30]);
});

test('leaderboard recents use the supplied category, sorting, pagination and working Analyze metadata', () => {
  const {context, actions} = matchFixture(true);
  const game = (mapName, endDate) => ({mapName, endDate, duration: 300000, allowed: false, sourceLabel: 'WaveHoster', replayUrl: 'https://source.test/' + mapName});
  context.renderMatches([game('old', 1), game('newest', 3), game('middle', 2)]);
  assert.deepEqual(actions[0], [3, 2]);
  assert.match(context.matchesElement.innerHTML, /newest/);
  assert.match(context.matchesElement.innerHTML, /middle/);
  assert.doesNotMatch(context.matchesElement.innerHTML, />old/);
  assert.ok(context.matchesElement.innerHTML.indexOf('newest') < context.matchesElement.innerHTML.indexOf('middle'));
  assert.match(context.matchesElement.innerHTML, /data-replay-analyzer-url="https:\/\/source.test\/newest"/);
  assert.match(context.matchesElement.innerHTML, /stats-recent-map-duration/);
  assert.doesNotMatch(context.matchesElement.innerHTML, /WaveHoster|class="stats-duration"/);
  assert.equal((context.matchesElement.innerHTML.match(/<td(?:\s|>)/g) || []).length, 8);
  const previous = context.matchesElement.innerHTML;
  context.leaderboardRecentMatchesElement.hidden = true;
  context.renderMatches([]);
  assert.equal(context.matchesElement.innerHTML, previous);
  assert.equal(actions.length, 1);
});

test('the separate Recent Matches page retains its search and advanced filters', () => {
  const {context, actions} = matchFixture(false);
  context.renderMatches([
    {mapName: 'keep', endDate: 3, allowed: true, replayUrl: 'https://source.test/one'},
    {mapName: 'keep blocked', endDate: 2, allowed: false},
    {mapName: 'other', endDate: 1, allowed: true}
  ]);
  assert.deepEqual(actions[0], [1, 1]);
  assert.match(context.matchesElement.innerHTML, /source.test\/one/);
  assert.doesNotMatch(context.matchesElement.innerHTML, /blocked|other/);
  assert.match(context.matchesElement.innerHTML, /class="stats-duration"/);
  assert.equal((context.matchesElement.innerHTML.match(/<td(?:\s|>)/g) || []).length, 6);
});

test('only the standalone list includes Arc games; the main rankings sidebar stays within its category', () => {
  for (const sidebar of [true, false]) {
    const {context} = matchFixture(sidebar);
    context.matchesSearchQuery = '';
    context.arcRecentGames = [{mapName: 'Arc game', endDate: 4, allowed: true,
      replayUrl: 'https://source.test/arc', arcMatch: {leaderboardUrl: 'index.html?tab=wavehoster'}}];
    context.renderMatches([{mapName: 'Main game', endDate: 3, allowed: true, replayUrl: 'https://source.test/main'}]);
    assert.match(context.matchesElement.innerHTML, /Main game/);
    assert.equal(context.matchesElement.innerHTML.includes('Arc game'), !sidebar);
    if (!sidebar) assert.match(context.matchesElement.innerHTML, /tab=wavehoster.*Arc Mod/);
  }
});

