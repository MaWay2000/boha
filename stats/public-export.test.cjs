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
test('unknown profile properties are not exported and nickname map keys are not schema fields', () => {
  const source = fixture(); source.leaderboards.Global.players[0].internalDetail = 'private';
  source.leaderboards.Global.players[0].names = {password: 5};
  const p = sanitizeLeaderboards(source).leaderboards.Global.players[0];
  assert.ok(!Object.hasOwn(p, 'internalDetail')); assert.equal(p.names.password, 5);
});
test('the frontend keeps historical participants out of profile lists when their profile is omitted', () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, 'live-stats.js'), 'utf8');
  const start = source.indexOf('function hydratePublishedBoard(name)');
  const end = source.indexOf('function getFavoriteUnitNameCandidates()', start);
  const context = vm.createContext({leaderboardData: sanitizeLeaderboards(fixture()), bannedAccountIds: new Set(),
    isCrashedPublishedGame: () => false, isKnownBotName: () => false});
  vm.runInContext(source.slice(start, end), context);
  const result = vm.runInContext('hydratePublishedBoard("Global")', context);
  assert.equal(result.accounts.size, 1);
  assert.ok(result.accounts.has('visible'));
  assert.equal(result.games[0].slots.length, 2);
});
