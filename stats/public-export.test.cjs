const test = require('node:test');
const assert = require('node:assert/strict');
const {sanitizeLeaderboards, sanitizeMatches} = require('./public-export.cjs');
function fixture() {
  return {format: 1, generatedAt: '2026-10-21', games: [{id: 'game', slots: [{id: 'visible', name: 'Visible'}, {id: 'private', name: 'Historical alias'}]}],
    leaderboards: {Global: {players: [{id: 'visible', name: 'Visible', elo: 1600, banned: false}, {id: 'private', name: 'Private', banned: true}],
      gameIds: ['game'], ratingEvents: {game: {visible: {elo: 1600, eloDelta: 10}, private: {elo: -2000}}}}}};
}
test('public profiles and events omit excluded accounts and all ban flags; facts and other ratings stay intact', () => {
  const original = fixture(), result = sanitizeLeaderboards(original);
  assert.deepEqual(result.leaderboards.Global.players.map(p => p.id), ['visible']);
  assert.equal(result.leaderboards.Global.players[0].elo, 1600);
  assert.equal(result.leaderboards.Global.ratingEvents.game.visible.eloDelta, 10);
  assert.ok(!Object.hasOwn(result.leaderboards.Global.ratingEvents.game, 'private'));
  assert.deepEqual(result.games, original.games);
  assert.ok(!JSON.stringify(result).includes('banned'));
  assert.equal(original.leaderboards.Global.players.length, 2);
});
test('forbidden private fields fail closed', () => {
  for (const key of ['password', 'ip_address', 'visitorId', 'adminNotes', 'banReason']) {
    const source = fixture(); source.leaderboards.Global.players[0][key] = 'not-for-public';
    assert.throws(() => sanitizeLeaderboards(source), /Private field rejected/);
  }
  assert.throws(() => sanitizeMatches({format: 1, matches: [{players: [{name: 'p', sessionId: 'secret'}]}]}), /Private field rejected/);
});
test('ELO at or below minus 2000 excludes an identity from every board without a ban flag', () => {
  const source = fixture();
  source.leaderboards.Global.players = [
    {id: 'threshold', elo: -2000}, {id: 'lower', elo: '-2500'},
    {id: 'visible', elo: -1999.99}, {id: 'zero', elo: 0},
    {id: 'provisional', elo: null, discounted: true}
  ];
  source.leaderboards['1v1'] = {
    players: [{id: 'threshold', elo: 1700}, {id: 'visible', elo: 1600}],
    ratingEvents: {game: {threshold: {elo: 1700}, visible: {elo: 1600}}}
  };
  const result = sanitizeLeaderboards(source);
  assert.deepEqual(result.leaderboards.Global.players.map(p => p.id), ['visible', 'zero', 'provisional']);
  assert.deepEqual(result.leaderboards['1v1'].players.map(p => p.id), ['visible']);
  assert.deepEqual(Object.keys(result.leaderboards['1v1'].ratingEvents.game), ['visible']);
  assert.deepEqual(result.games, source.games);
  assert.equal(source.leaderboards.Global.players.length, 5);
});
test('unknown profile properties are not exported and nickname map keys are not schema fields', () => {
  const source = fixture(); source.leaderboards.Global.players[0].internalDetail = 'private';
  source.leaderboards.Global.players[0].names = {password: 5};
  const p = sanitizeLeaderboards(source).leaderboards.Global.players[0];
  assert.ok(!Object.hasOwn(p, 'internalDetail')); assert.equal(p.names.password, 5);
});
test('restored loopback replay links retain their established public address', () => {
  const source = fixture(), hash = 'a'.repeat(64);
  source.games[0].replayUrl = `http://127.0.0.1:8787/wzstats/api/v1/replays/${hash}`;
  const publicUrl = `https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/replays/${hash}`;
  assert.equal(sanitizeLeaderboards(source).games[0].replayUrl, publicUrl);
  assert.equal(sanitizeMatches({format: 1, matches: [{replay_url: source.games[0].replayUrl, players: []}]}).matches[0].replay_url, publicUrl);
  assert.ok(source.games[0].replayUrl.startsWith('http://127.0.0.1:8787/'));
  for (const url of ['http://127.0.0.1:8787/private', 'http://192.168.1.74/replay', 'https://owner:secret@example.com/replay']) {
    source.games[0].replayUrl = url;
    assert.throws(() => sanitizeLeaderboards(source), /replay URL/);
  }
});
test('the frontend keeps historical participants out of profile lists when their profile is omitted', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, 'live-stats.js'), 'utf8');
  const start = source.indexOf('function hydratePublishedBoard(name)');
  const end = source.indexOf('function getFavoriteUnitNameCandidates()', start);
  const context = vm.createContext({leaderboardData: sanitizeLeaderboards(fixture()), bannedAccountIds: new Set(),
    isCrashedPublishedGame: () => false, isKnownBotName: () => false});
  const banStart = source.indexOf('function isBannedAccount(');
  vm.runInContext(source.slice(banStart, source.indexOf('function filterVisibleAccounts(', banStart)), context);
  vm.runInContext(source.slice(start, end), context);
  const result = vm.runInContext('hydratePublishedBoard("Global")', context);
  assert.equal(result.accounts.size, 1);
  assert.ok(result.accounts.has('visible'));
  assert.equal(result.games[0].slots.length, 2);
});
