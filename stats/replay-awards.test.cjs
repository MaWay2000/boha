const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../replay-analyzer.js'), 'utf8');
const context = vm.createContext({ formatDuration: time => String(time) });
for (const name of ['formatPlayerResult', 'playerStat', 'calculateResearchActivity', 'hasCompletePlayerDepartureHistory',
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
const labels = (players, events = [], complete = true,
  match = { alliance: 2, elapsedMilliseconds: 600000 }, messageTypes = []) => {
  const awards = context.calculatePlayerAwards(players, events, complete, match, messageTypes);
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
  assert.match(source, /calculatePlayerAwards\(\s*extraction\.players,\s*extraction\.events\.records,\s*hasCompletePlayerDepartureHistory\(extraction\),\s*extraction\.match/);
});

test('step-one names appear in both awarded badges and the guide', () => {
  const p = player(0, { kills: 100, droidsBuilt: 100, structuresBuilt: 50,
    researchComplete: 50, labResearchPerformance: 90, labResearchPotential: 100,
    droidsLost: 25, structuresDestroyed: 20, remainingDroids: 75 });
  const names = labels([p])[0];
  const guide = source.slice(source.indexOf('  const playerAwardGuide = ['),
    source.indexOf('  let playerAwardsGuideDialog'));
  const replacements = {
    'War Machine': 'War Factory', 'Master Builder': 'Master engineer',
    'Research Pioneer': 'Mad scientist', 'Combat Efficiency': 'Combat veteran',
    'Siege Efficiency': 'Siege expert', 'Army Preservation': 'No Soldier Left Behind'
  };
  for (const [oldName, newName] of Object.entries(replacements)) {
    assert.equal(names.includes(newName), true, newName);
    assert.equal(names.includes(oldName), false, oldName);
    assert.equal(guide.includes(`"${newName}"`), true);
    assert.equal(guide.includes(`"${oldName}"`), false);
  }
});

test('Match MVP awards the highest negative score and shares negative ties', () => {
  const awards = labels([player(0, { score: -10 }), player(1, { score: -10 }),
    player(2, { score: -20 }), player(3)]);
  assert.deepEqual(awards.map(list => list.includes('Match MVP')), [true, true, false, false]);
});

test('known zero scores can tie for Match MVP; missing and invalid scores cannot', () => {
  const invalid = [undefined, null, '', ' ', false, [], {}, NaN, Infinity, 'not a score'];
  for (const score of invalid) {
    const awards = labels([player(0, { score }), player(1, { score: -10 })]);
    assert.equal(awards[0].includes('Match MVP'), false, String(score));
    assert.equal(awards[1].includes('Match MVP'), true, String(score));
  }
  assert.deepEqual(labels([player(0, { score: 0 }), player(1, { score: '0' })])
    .map(list => list.includes('Match MVP')), [true, true]);
  assert.equal(labels([player(0)])[0].includes('Match MVP'), false);
});

test('positive count awards share recorded ties and reject unknown or malformed counts', () => {
  const counters = {
    kills: 'Slayer', structuresDestroyed: 'Demolition Expert',
    droidsBuilt: 'War Factory', structuresBuilt: 'Master engineer'
  };
  for (const [key, label] of Object.entries(counters)) {
    const players = [player(0, { [key]: 10 }), player(1, { [key]: '10' }),
      player(2, { [key]: 5 }), player(3)];
    assert.deepEqual(labels(players).map(list => list.includes(label)), [true, true, false, false], label);
    for (const value of [null, '', ' ', false, [], -1, 0.5, Infinity, 'bad']) {
      assert.equal(labels([player(0, { [key]: value })])[0].includes(label), false, `${key}=${value}`);
    }
    assert.equal(labels([player(0, { [key]: 0 })])[0].includes(label), false,
      'zero activity does not earn a count award');
  }
});

test('combat and siege ratios require known numerators and at least 25 known unit losses', () => {
  const players = [
    player(0, { kills: 100, structuresDestroyed: 20, droidsLost: 50 }),
    player(1, { kills: 50, structuresDestroyed: 10, droidsLost: 25 }),
    player(2, { kills: 1000, structuresDestroyed: 1000, droidsLost: 24 }),
    player(3, { kills: 1000, structuresDestroyed: 1000 }),
    player(4, { droidsLost: 25 })
  ];
  for (const label of ['Combat veteran', 'Siege expert']) {
    assert.deepEqual(labels(players).map(list => list.includes(label)), [true, true, false, false, false], label);
  }
  for (const losses of [0, null, '', false, [], -25, 25.5, Infinity]) {
    const awards = labels([player(0, { kills: 100, structuresDestroyed: 10, droidsLost: losses })])[0];
    assert.equal(awards.includes('Combat veteran'), false, String(losses));
    assert.equal(awards.includes('Siege expert'), false, String(losses));
  }
});

test('survival award uses the ratio, shares ties, and enforces the 25-unit minimum', () => {
  const players = [
    player(0, { remainingDroids: 80, droidsLost: 20 }),
    player(1, { remainingDroids: 40, droidsLost: 10 }),
    player(2, { remainingDroids: 24, droidsLost: 0 }),
    player(3, { remainingDroids: 100, droidsLost: 100 })
  ];
  assert.deepEqual(labels(players).map(list => list.includes('No Soldier Left Behind')),
    [true, true, false, false]);
  assert.equal(labels([player(0, { remainingDroids: 25, droidsLost: 0 })])[0]
    .includes('No Soldier Left Behind'), true, 'known zero losses is a valid perfect record');
});

test('missing or invalid survival fields cannot masquerade as a perfect record', () => {
  for (const value of [undefined, null, '', ' ', false, [], -1, 0.5, Infinity]) {
    for (const summary of [{ remainingDroids: 100, droidsLost: value },
      { remainingDroids: value, droidsLost: 25 }]) {
      assert.equal(labels([player(0, summary)])[0].includes('No Soldier Left Behind'), false);
    }
  }
});

test('survival award excludes early leavers and unverified end-of-match participation', () => {
  const p = player(0, { remainingDroids: 100, droidsLost: 0 });
  assert.equal(labels([p], [], false)[0].includes('No Soldier Left Behind'), false);
  assert.equal(labels([p], [left(0, null)])[0].includes('No Soldier Left Behind'), false);
  p.summary.playerLeftGameTime = 1000;
  assert.equal(labels([p])[0].includes('No Soldier Left Behind'), false);
});

test('Team MVP supports negative scores, ties, and separate fixed teams', () => {
  const players = [player(0, { score: -10 }), player(1, { score: -10 }),
    { ...player(2, { score: -1 }), team: 1 }, { ...player(3, { score: -2 }), team: 1 }];
  for (const alliance of [2, 3]) {
    assert.deepEqual(labels(players, [], true, { alliance }).map(list => list.includes('Team MVP')),
      [true, true, true, false]);
  }
});

test('Team MVP is disabled for FFA, dynamic/unknown alliances, and solo teams', () => {
  const players = [player(0, { score: 100 }), player(1, { score: 50 })];
  for (const alliance of [undefined, null, 0, 1, 'bad']) {
    assert.equal(labels(players, [], true, { alliance }).some(list => list.includes('Team MVP')), false);
  }
  players[1].team = 1;
  assert.equal(labels(players).some(list => list.includes('Team MVP')), false);
});

test('spectators and invalid team identifiers do not create a Team MVP team', () => {
  const a = player(0, { score: 100 }), b = { ...player(1, { score: 200 }), spectator: true };
  assert.equal(labels([a, b]).some(list => list.includes('Team MVP')), false);
  b.spectator = false;
  for (const team of [null, undefined, '', ' ', false, [], -1, 0.5, 'bad']) {
    b.team = team;
    assert.equal(labels([a, b]).some(list => list.includes('Team MVP')), false, String(team));
  }
});

test('step-two names replace the old names in both badges and guide', () => {
  const p = player(0, { kills: 50, droidsLost: 0, result: 'winner', structuresLost: 0,
    structuresBuilt: 25, remainingStructures: 25, remainingDroids: 50 });
  const ally = player(1);
  const gift = { player: 0, time: null, category: 'Gift',
    data: { from: 0, to: 1, giftType: 4, objectId: 100 } };
  const awards = labels([p, ally], [gift])[0];
  const guide = source.slice(source.indexOf('  const playerAwardGuide = ['),
    source.indexOf('  let playerAwardsGuideDialog'));
  for (const [oldName, name] of Object.entries({
    'Killing Streak': 'Flawless Combat', 'Perfect Defense': 'Hold the Line',
    'Last Army Standing': 'Supreme Force', 'Clean Sweep': 'Rat Hunter', 'Generous Ally': 'Brother in Arms'
  })) {
    assert.equal(awards.includes(name), true, name);
    assert.equal(awards.includes(oldName), false);
    assert.equal(guide.includes(`"${name}"`), true);
    assert.equal(guide.includes(`"${oldName}"`), false);
  }
});

test('Flawless Combat needs 25 kills, explicitly known zero losses, and shares ties', () => {
  const players = [player(0, { kills: 25, droidsLost: 0 }), player(1, { kills: 25, droidsLost: '0' }),
    player(2, { kills: 24, droidsLost: 0 }), player(3, { kills: 100 }),
    player(4, { kills: 100, droidsLost: 1 })];
  assert.deepEqual(labels(players).map(list => list.includes('Flawless Combat')),
    [true, true, false, false, false]);
  for (const droidsLost of [null, '', ' ', false, [], -1, Infinity]) {
    assert.equal(labels([player(0, { kills: 100, droidsLost })])[0].includes('Flawless Combat'), false);
  }
});

test('Hold the Line uses known structure survival ratios, not raw remaining totals', () => {
  const players = [player(0, { remainingStructures: 80, structuresLost: 20 }),
    player(1, { remainingStructures: 40, structuresLost: 10 }),
    player(2, { remainingStructures: 24, structuresLost: 0 }),
    player(3, { remainingStructures: 100 }),
    player(4, { remainingStructures: 200, structuresLost: 100 })];
  assert.deepEqual(labels(players).map(list => list.includes('Hold the Line')),
    [true, true, false, false, false]);
  assert.equal(labels([player(0, { remainingStructures: 25, structuresLost: 0 })])[0]
    .includes('Hold the Line'), true);
});

test('Supreme Force ignores missing totals and early-leaver snapshots; ties share the award', () => {
  const players = [player(0, { remainingDroids: 50 }), player(1, { remainingDroids: 50 }),
    player(2, { remainingDroids: 100, playerLeftGameTime: 1000 }), player(3)];
  assert.deepEqual(labels(players).map(list => list.includes('Supreme Force')), [true, true, false, false]);
});

test('all step-two final-state awards require verified end-of-match participation', () => {
  const p = player(0, { result: 'winner', remainingDroids: 100, structuresBuilt: 25,
    remainingStructures: 25, structuresLost: 0 });
  const endAwards = ['Supreme Force', 'Hold the Line', 'Rat Hunter'];
  for (const awards of [labels([p], [], false)[0], labels([p], [left(0, null)])[0]]) {
    assert.equal(endAwards.some(label => awards.includes(label)), false);
  }
});

test('Rat Hunter requires a winner, known zero losses, and meaningful recorded base activity', () => {
  const won = { result: 'winner', structuresLost: 0 };
  const players = [player(0, { ...won, structuresBuilt: 25 }),
    player(1, { ...won, remainingStructures: 25 }),
    player(2, { ...won, structuresBuilt: 24, remainingStructures: 24 }),
    player(3, { result: 'winner', structuresBuilt: 50 }),
    player(4, { ...won, result: 'loser', structuresBuilt: 50 }),
    player(5, { ...won, structuresBuilt: 50, structuresLost: 1 })];
  assert.deepEqual(labels(players).map(list => list.includes('Rat Hunter')),
    [true, true, false, false, false, false]);
});

function gift(from, to, giftType = 4, objectId = 100, time = 1000) {
  return { player: from, time, category: 'Gift', data: { from, to, giftType, objectId } };
}

test('Brother in Arms counts valid teammate gifts even without timestamps or sender summaries', () => {
  const a = player(0), b = player(1), c = player(2);
  a.summary = null;
  const awards = labels([a, b, c], [gift(0, 1, 4, 100, null), gift(0, 2, 2, 123, null), gift(1, 2)]);
  assert.equal(awards[0].includes('Brother in Arms'), true);
  assert.equal(awards[0].includes('Team Support'), true);
  assert.equal(awards[1].includes('Brother in Arms'), false);
});

test('gift awards exclude self, enemy, spectator, unknown recipients and invalid gift payloads', () => {
  const players = [player(0), player(1), { ...player(2), team: 1 },
    { ...player(3), spectator: true }];
  const invalid = [gift(0, 0), gift(0, 2), gift(0, 3), gift(0, 255),
    gift(0, null), gift(0, ''), gift(0, false), gift(0, 1, 6), gift(0, 1, 99),
    gift(0, 1, 2, 0), gift(0, 1, 4, 0), gift(0, 1, 5, null),
    { ...gift(0, 1), data: { from: 1, to: 1, giftType: 4, objectId: 100 } },
    { ...gift(0, 1), player: null }];
  const awards = labels(players, invalid);
  for (const label of ['Brother in Arms', 'Team Support']) {
    assert.equal(awards.some(list => list.includes(label)), false, label);
  }
  for (const alliance of [0, 1, null, undefined]) {
    assert.equal(labels(players, [gift(0, 1)], true, { alliance })
      .some(list => list.includes('Brother in Arms')), false);
  }
});

test('Team Support counts distinct valid teammates, not repeated gifts', () => {
  const players = [player(0), player(1), player(2), player(3)];
  const events = [...Array.from({ length: 5 }, () => gift(0, 3)), gift(1, 2), gift(1, 3)];
  const awards = labels(players, events);
  assert.equal(awards[0].includes('Brother in Arms'), true);
  assert.equal(awards[1].includes('Team Support'), true);
  assert.equal(awards[0].includes('Team Support'), false);
});

test('recorded radar and research teammate gifts can count without an asset ID', () => {
  const awards = labels([player(0), player(1)], [gift(0, 1, 1, 0), gift(0, 1, 3, 0)]);
  assert.equal(awards[0].includes('Brother in Arms'), true);
});

const firstCategories = [
  { label: 'Research Sprinter', category: 'Research', action: 'Research started', type: 114 },
  { label: 'Early Industrialist', category: 'Production', action: 'Manufacture', type: 113 }
];

test('first-action awards include players without summary stats and share tied first times', () => {
  const a = player(0), b = player(1), c = player(2);
  a.summary = null;
  for (const { label, category, action } of firstCategories) {
    const events = [{ player: 0, time: 0, category, action },
      { player: 1, time: 0, category, action }, { player: 2, time: 1000, category, action }];
    assert.deepEqual(labels([a, b, c], events).map(list => list.includes(label)), [true, true, false], label);
  }
});

test('first-action awards withhold claims when relevant decoding, identity, or timestamps are incomplete', () => {
  for (const { label, category, action, type } of firstCategories) {
    const players = [player(0), player(1)];
    const events = [{ player: 0, time: 1000, category, action },
      { player: 1, time: 2000, category, action }];
    const broken = [{ type, count: 3, decodedEvents: 2, decodeErrors: 1 }];
    assert.equal(labels(players, events, true, { elapsedMilliseconds: 600000 }, broken)
      .some(list => list.includes(label)), false, label);
    assert.equal(labels(players, events, true, {}, [])
      .some(list => list.includes(label)), false, 'unknown match coverage');
    assert.equal(labels(players, events, true, { elapsedMilliseconds: 600000 }, null)
      .some(list => list.includes(label)), false, 'unknown decode coverage');
    for (const time of [null, undefined, '', ' ', false, -1, Infinity]) {
      assert.equal(labels(players, [{ ...events[0], time }, events[1]])
        .some(list => list.includes(label)), false, `unknown first timestamp ${time}`);
    }
    assert.equal(labels(players, [{ ...events[0], player: null }, events[1]])
      .some(list => list.includes(label)), false, 'unknown first actor');
  }
});

test('irrelevant untimed events and spectators do not block first-action awards', () => {
  const players = [player(0), player(1), { ...player(2), spectator: true }];
  const events = [
    { player: 2, time: 0, category: 'Research', action: 'Research started' },
    { player: 0, time: null, category: 'Research', action: 'Research stopped' },
    { player: 1, time: 1000, category: 'Research', action: 'Research started' }
  ];
  assert.equal(labels(players, events)[1].includes('Research Sprinter'), true);
});

test('count-based order awards include untimed commands rather than picking a later timed player', () => {
  const events = [...Array.from({ length: 10 }, () => ({
    player: 0, time: null, category: 'Droid order', action: 'Attack'
  })), { player: 1, time: 1000, category: 'Droid order', action: 'Attack' }];
  const awards = labels([player(0), player(1)], events);
  assert.equal(awards[0].includes('Most Aggressive'), true);
  assert.equal(awards[1].includes('Most Aggressive'), false);
});

test('production rendering supplies decoding metadata for first-action awards', () => {
  assert.match(source, /hasCompletePlayerDepartureHistory\(extraction\),\s*extraction\.match,\s*extraction\.messages\.types/);
});

test('Mad scientist ranks lab activity rather than the number of completed topics', () => {
  const players = [player(0, { researchComplete: 1000, labResearchPerformance: 50, labResearchPotential: 100 }),
    player(1, { researchComplete: 10, labResearchPerformance: 90, labResearchPotential: 100 })];
  assert.deepEqual(labels(players).map(list => list.includes('Mad scientist')), [false, true]);
});

test('Mad scientist requires at least 10 known completed topics and shares activity ties', () => {
  const telemetry = { labResearchPerformance: 90, labResearchPotential: 100 };
  const players = [player(0, { ...telemetry, researchComplete: 9, labResearchPerformance: 100 }),
    player(1, { ...telemetry, researchComplete: 10 }),
    player(2, { labResearchPerformance: 180, labResearchPotential: 200, researchComplete: '20' }),
    player(3, telemetry)];
  assert.deepEqual(labels(players).map(list => list.includes('Mad scientist')), [false, true, true, false]);
  for (const researchComplete of [null, '', false, [], -1, 10.5, Infinity, 'bad']) {
    assert.equal(labels([player(0, { ...telemetry, researchComplete })])[0].includes('Mad scientist'), false);
  }
});

test('Mad scientist never invents activity from missing or invalid lab telemetry', () => {
  for (const value of [undefined, null, '', ' ', false, [], {}, -1, Infinity, NaN, 'bad']) {
    for (const telemetry of [{ labResearchPerformance: value, labResearchPotential: 100 },
      { labResearchPerformance: 50, labResearchPotential: value }]) {
      assert.equal(labels([player(0, { researchComplete: 20, ...telemetry })])[0]
        .includes('Mad scientist'), false, String(value));
    }
  }
  assert.equal(labels([player(0, { researchComplete: 20, labResearchPerformance: 0,
    labResearchPotential: 0 })])[0].includes('Mad scientist'), false);
});

test('Mad scientist requires engine telemetry and excludes spectators', () => {
  const telemetry = { researchComplete: 20, labResearchPerformance: 100, labResearchPotential: 100 };
  for (const statsSource of [null, undefined, 'published']) {
    assert.equal(labels([player(0, { ...telemetry, statsSource })])[0].includes('Mad scientist'), false);
  }
  assert.equal(labels([{ ...player(0, telemetry), spectator: true }])[0].includes('Mad scientist'), false);
});

test('Mad scientist uses the same percentage as the displayed research-lab activity', () => {
  const p = player(0, { researchComplete: 10, labResearchPerformance: '12.5', labResearchPotential: '50' });
  const activity = context.calculateResearchActivity([p], [], 600000).get(p);
  assert.equal(activity, 25);
  const awards = context.calculatePlayerAwards([p], [], true);
  const badge = awards.get(p).find(award => award.label === 'Mad scientist');
  assert.match(badge.details, /25\.00%/);
  assert.match(badge.details, /10 topics completed/);
  assert.equal(awards.get(p).filter(award => award.label === 'Mad scientist').length, 1);
});

test('known zero lab activity remains distinct from unavailable data', () => {
  const p = player(0, { researchComplete: 10, labResearchPerformance: 0, labResearchPotential: 100 });
  assert.equal(context.calculateResearchActivity([p], [], 600000).get(p), 0);
  assert.equal(labels([p])[0].includes('Mad scientist'), true, 'highest known percentage follows the rule even if zero');
  const other = player(1, { researchComplete: 10, labResearchPerformance: 1, labResearchPotential: 100 });
  assert.deepEqual(labels([p, other]).map(list => list.includes('Mad scientist')), [false, true]);
});

test('unsupported achievement claims are absent from the guide and award calculation', () => {
  const removed = ['First Blood', 'Comeback Survivor', 'Rebuild Master', 'Industrial Recovery', 'Underdog Victor'];
  for (const name of removed) {
    assert.equal(source.includes(`"${name}"`), false, name);
  }
  // This fixture used to trigger every removed formula: earliest attack with
  // eventual kills, losing survivors, construction/loss products, and low-score victory.
  const players = [
    player(0, { result: 'loser', kills: 200, structuresDestroyed: 100, droidsLost: 200,
      structuresBuilt: 200, structuresLost: 100, remainingDroids: 1, remainingStructures: 1 }),
    player(1, { result: 'winner', score: 1, kills: 1 }),
    player(2, { result: 'winner', score: 1000 })
  ];
  const before = JSON.stringify(players);
  const awards = labels(players, [{ player: 0, time: 1000, category: 'Droid order', action: 'Attack' }]);
  assert.equal(awards.some(list => list.some(name => removed.includes(name))), false);
  assert.equal(awards[0].includes('First Mobilization'), true, 'honest first-order badge is unaffected');
  assert.equal(awards[0].includes('Slayer'), true, 'recorded combat awards are unaffected');
  assert.equal(JSON.stringify(players), before, 'underlying player statistics are not modified');
});

test('every remaining awarded label has exactly one matching guide entry', () => {
  const guideStart = source.indexOf('  const playerAwardGuide = [');
  const guideEnd = source.indexOf('  let playerAwardsGuideDialog', guideStart);
  const guide = source.slice(guideStart, guideEnd);
  const guideNames = [...guide.matchAll(/^    \["[^"]+", "([^"]+)"/gm)].map(match => match[1]);
  const bodyStart = source.indexOf('  function calculatePlayerAwards(');
  const bodyEnd = source.indexOf('  function createPlayerAwardsCell(', bodyStart);
  const body = source.slice(bodyStart, bodyEnd);
  const named = [...body.matchAll(/label: "([^"]+)"/g)].map(match => match[1]);
  const positional = [...body.matchAll(/(?:giveAward|addCountAward|addEarliestEventAward)\(\s*(?:player,\s*)?"[^"]+",\s*"([^"]+)"/g)]
    .map(match => match[1]);
  assert.equal(guideNames.length, 41);
  assert.equal(new Set(guideNames).size, guideNames.length, 'no duplicate guide entries');
  assert.deepEqual([...new Set([...named, ...positional])].sort(), [...guideNames].sort());
});

test('Slayer rewards enemy unit kills, not own losses or structures destroyed', () => {
  const players = [player(0, { kills: 100, droidsLost: 2, structuresDestroyed: 0 }),
    player(1, { kills: 10, droidsLost: 1000, structuresDestroyed: 500 }),
    player(2, { kills: 100, droidsLost: 50, structuresDestroyed: 2 })];
  const awards = context.calculatePlayerAwards(players, [], true);
  assert.deepEqual(players.map(p => awards.get(p).some(award => award.label === 'Slayer')),
    [true, false, true]);
  for (const p of [players[0], players[2]]) {
    const badges = awards.get(p).filter(award => award.label === 'Slayer');
    assert.equal(badges.length, 1, 'one Slayer badge per tied winner');
    assert.equal(badges[0].details, 'Most enemy units destroyed: 100');
  }
  assert.equal(source.includes('"Top Fragger"'), false, 'duplicate kill award is merged into Slayer');
  assert.equal(source.includes('"Army Grinder"'), false, 'old loss award is removed');
});

test('Gladiator renames All-Out Assault and keeps the highest combined losses among winners', () => {
  const players = [player(0, { result: 'winner', droidsLost: 80, structuresLost: 20 }),
    player(1, { result: 'winner', droidsLost: 50, structuresLost: 10 }),
    player(2, { result: 'loser', droidsLost: 500, structuresLost: 200 })];
  const awards = context.calculatePlayerAwards(players, [], true);
  assert.deepEqual(players.map(p => awards.get(p).some(award => award.label === 'Gladiator')),
    [true, false, false]);
  assert.equal(awards.get(players[0]).find(award => award.label === 'Gladiator').details,
    'Winner with most combined losses: 100');
  assert.equal(source.includes('"All-Out Assault"'), false);
});

test('Camper Hill renames Structure Casualty and still counts structures lost', () => {
  const players = [player(0, { structuresLost: 50, structuresDestroyed: 0 }),
    player(1, { structuresLost: 10, structuresDestroyed: 500 }),
    player(2, { structuresLost: 50, structuresDestroyed: 1 })];
  const awards = context.calculatePlayerAwards(players, [], true);
  assert.deepEqual(players.map(p => awards.get(p).some(award => award.label === 'Camper Hill')),
    [true, false, true]);
  assert.equal(awards.get(players[0]).find(award => award.label === 'Camper Hill').details,
    'Most structures lost: 50');
  assert.equal(source.includes('"Structure Casualty"'), false);
});

test('Made in China renames Overproducer without changing the production-gap formula', () => {
  const players = [player(0, { droidsBuilt: 100, structuresBuilt: 20,
    remainingDroids: 15, remainingStructures: 5 }),
    player(1, { droidsBuilt: 200, structuresBuilt: 100,
      remainingDroids: 150, remainingStructures: 100 })];
  const awards = context.calculatePlayerAwards(players, [], true);
  assert.deepEqual(players.map(p => awards.get(p).some(award => award.label === 'Made in China')),
    [true, false]);
  assert.equal(awards.get(players[0]).find(award => award.label === 'Made in China').details,
    'Production exceeded remaining assets by 100');
  assert.equal(source.includes('"Overproducer"'), false);
});
