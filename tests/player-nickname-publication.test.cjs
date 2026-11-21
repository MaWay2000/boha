const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {buildNicknameHistory} = require('../stats/player-nickname-publication.cjs');

const key = value => Buffer.alloc(32, value).toString('base64');
const id = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const time = day => Date.UTC(2026, 10, day);
const mainGame = (day, slots, replayUrl = '') => ({id: 'main:' + day, startDate: time(day), slots, replayUrl});
const arcGame = (day, participants, replaySha256) => ({
  id: String(day), startedAt: new Date(time(day)).toISOString(), participants, replaySha256
});

test('the last three distinct matches mix modes, keep repeated names, and link only verified keys', () => {
  const keyA = key(1), alternate = key(2), keyB = key(3);
  const staleArcId = id(alternate), guest = 'f'.repeat(20);
  const mainSlot = (key, name, userType = 'winner') => ({id: key, name, userType});
  const arcPlayer = (id, name) => ({id, name});
  const replay = 'a'.repeat(64);
  const main = {format: 1, leaderboards: {Global: {players: [
    {id: keyA, mainPublicKey: keyA, publicKeys: [keyA, alternate]},
    {id: keyB, mainPublicKey: keyB}
  ]}}, games: [
    mainGame(1, [mainSlot(keyA, 'Older')]),
    mainGame(3, [{...mainSlot(keyA, 'Stock'), nickname: 'Stock_2'}, mainSlot(keyB, 'Same name')]),
    mainGame(4, [mainSlot(keyA, 'Same name')], 'https://example.com/replay/' + replay),
    mainGame(6, [mainSlot(keyA, 'Spectator', 'spectator')])
  ]};
  const arc = {format: 1, groups: [{players: [
    {id: staleArcId, identityVerified: true, publicKeys: [alternate]},
    {id: guest, identityVerified: false, publicKeys: []}
  ]}], games: [
    arcGame(4, [arcPlayer(staleArcId, 'Same name')], replay),
    arcGame(5, [arcPlayer(staleArcId, 'Same name'), arcPlayer(guest, 'Same name')])
  ]};
  const result = buildNicknameHistory(main, arc);
  assert.deepEqual(result.players[id(keyA)].map(game => [game.name, game.time]), [
    ['Same name', time(5)], ['Same name', time(4)], ['Stock_2', time(3)]
  ]);
  assert.deepEqual(result.players[id(keyA)].map(game => game.mode), ['arc', 'main', 'main']);
  assert.deepEqual(result.players[id(keyB)], [{name: 'Same name', time: time(3), mode: 'main'}]);
  assert.equal(result.aliases[staleArcId], id(keyA));
  assert.equal(result.players[guest], undefined);
});
