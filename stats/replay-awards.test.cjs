const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../replay-analyzer.js'), 'utf8');
const context = vm.createContext({ formatDuration: time => String(time) });
for (const name of ['formatPlayerResult', 'playerStat', 'hasCompletePlayerDepartureHistory',
  'getPlayerDepartures', 'calculatePlayerAwards']) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  function ', start + 1);
  assert.ok(start >= 0 && end > start, `Find production function ${name}`);
  vm.runInContext(source.slice(start, end), context);
}

const player = (position, summary = {}) => ({
  position, spectator: false, team: position < 5 ? 0 : 1,
  summary: { statsSource: 'replay-engine', ...summary }
});
const left = (position, time = 1000) => ({
  player: position, time, messageType: 121, category: 'Player', action: 'Player left'
});
const labels = (players, events = [], complete = true) => {
  const awards = context.calculatePlayerAwards(players, events, complete);
  return players.map(p => awards.get(p).map(award => award.label));
};
const completeExtraction = (types = []) => ({
  match: { elapsedMilliseconds: 600000 }, messages: { types }
});

test('five-player team with three departures awards only its two remaining players', () => {
  const players = Array.from({ length: 10 }, (_, i) => player(i));
  const awards = labels(players, [left(5), left(6, 2000), left(7, 3000)]);
  assert.deepEqual(awards.map((list, i) => list.includes('Endurance Award') ? i : null)
    .filter(i => i != null), [0, 1, 2, 3, 4, 8, 9]);
  assert.equal(awards[7].includes('Last to Leave'), true);
});

test('summary departures and replay departures independently exclude players', () => {
  const players = [player(0, { playerLeftGameTime: 500 }), player(1), player(2)];
  const awards = labels(players, [left(1)]);
  assert.equal(awards[0].includes('Endurance Award'), false);
  assert.equal(awards[1].includes('Endurance Award'), false);
  assert.equal(awards[2].includes('Endurance Award'), true);
});

test('untimed and zero-time departures are not mistaken for survivors', () => {
  const players = [player(0), player(1), player(2, { playerLeftGameTime: 0 })];
  const awards = labels(players, [left(0, null), left(1, 0)]);
  assert.equal(awards.some(list => list.includes('Endurance Award')), false);
  assert.equal(awards[0].includes('Last to Leave'), false, 'unknown departure time cannot rank');
});

test('missing player identity never turns into a departure for player zero', () => {
  const players = [player(0)];
  assert.equal(labels(players, [left(null)])[0].includes('Endurance Award'), true);
  assert.equal(labels(players, [left('')])[0].includes('Endurance Award'), true);
});

test('unknown or incomplete departure history does not grant Endurance', () => {
  const players = [player(0), player(1, { playerLeftGameTime: null })];
  assert.equal(labels(players, [], false).some(list => list.includes('Endurance Award')), false);
  assert.equal(context.calculatePlayerAwards(players).get(players[0])
    .some(award => award.label === 'Endurance Award'), false);
});

test('spectators and partial non-engine statistics cannot receive Endurance', () => {
  const players = [
    { ...player(0), spectator: true },
    player(1, { partialStats: true, statsSource: null }), player(2)
  ];
  const awards = labels(players);
  assert.equal(awards[0].length, 0);
  assert.equal(awards[1].length, 0);
  assert.equal(awards[2].includes('Endurance Award'), true);
});

test('duplicate events retain earliest known departure and tolerate untimed events', () => {
  const p = player(0, { playerLeftGameTime: 6000 });
  const departures = context.getPlayerDepartures([p], [left(0, 2000), left(0, null), left(0, 3000)]);
  assert.equal(departures.get(p), 2000);
});

test('only completed parsing with all departure messages decoded establishes history', () => {
  assert.equal(context.hasCompletePlayerDepartureHistory(completeExtraction()), true);
  const message = { type: 121, count: 3, decodedEvents: 3, decodeErrors: 0 };
  assert.equal(context.hasCompletePlayerDepartureHistory(completeExtraction([message])), true);
  assert.equal(context.hasCompletePlayerDepartureHistory(completeExtraction([
    { ...message, decodedEvents: 2, decodeErrors: 1 }
  ])), false);
  assert.equal(context.hasCompletePlayerDepartureHistory(completeExtraction([
    { ...message, decodedEvents: 2 }
  ])), false);
  assert.equal(context.hasCompletePlayerDepartureHistory({ match: {} }), false);
  assert.equal(context.hasCompletePlayerDepartureHistory({
    match: { elapsedMilliseconds: 0 }, messages: { types: [] }
  }), false);
});

test('production rendering passes departure-history completeness into award calculation', () => {
  assert.match(source, /calculatePlayerAwards\(\s*extraction\.players,\s*extraction\.events\.records,\s*hasCompletePlayerDepartureHistory\(extraction\)/);
});
