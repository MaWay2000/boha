const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const telemetry = require('./replay-telemetry.js');

const start = { schemaVersion: 1, type: 'start', timeMilliseconds: 2 };
const object = (id = 1, kind = 'unit', cost = 100) => ({ id, player: 0, kind, cost, name: 'Test', x: 4, y: 5 });
const event = (type, fields = {}, time = 100) => ({ schemaVersion: 1, type, timeMilliseconds: time, ...fields });
const compile = records => telemetry.compile([start, ...records], { complete: true, durationMilliseconds: 1000 });

test('serialized telemetry round-trips through the browser validator', () => {
  const original = compile([event('unitBuilt', { object: object() })]);
  const roundTrip = telemetry.compile(JSON.parse(JSON.stringify(original.events)), {
    complete: original.complete, durationMilliseconds: original.durationMilliseconds
  });
  assert.deepEqual(roundTrip, original);
  assert.equal(roundTrip.players[0].completedUnits, 1);
});

test('unknown costs are never silently converted to zero or partial value totals', () => {
  const result = compile([event('unitBuilt', { object: object() }),
    event('unitBuilt', { object: object(2, 'unit', null) })]);
  assert.equal(result.players[0].completedUnits, 2);
  assert.equal(result.players[0].completedUnitValue, null);
});

test('duplicate instances and repeated destruction callbacks do not inflate totals', () => {
  const build = event('unitBuilt', { object: object(), sequence: 1 });
  const result = compile([build, { ...build, sequence: 50 },
    event('destroyed', { object: object() }, 200), event('destroyed', { object: object() }, 300)]);
  assert.equal(result.players[0].completedUnits, 1);
  assert.equal(result.players[0].observedDestroyedUnits, 1);
});

test('destruction and attacks cannot establish killers, damage, repairs or combat value', () => {
  const result = compile([event('destroyed', { object: object(), cause: 'combat', killer: object(9) }),
    event('attackNotice', { object: object(), attacker: object(9), damage: 500 })]);
  assert.equal(result.events[1].cause, 'unknown');
  assert.equal('killer' in result.events[1], false);
  assert.equal('damage' in result.events[2], false);
  for (const key of ['killHistory', 'combatValue', 'damage', 'repairs'])
    assert.equal(result.availability[key].available, false);
});

test('ownership changes retain unknown cause rather than invent confirmed gifts', () => {
  const result = compile([event('ownershipTransfer', { object: object(), from: 1, to: 0, reason: 'gift' })]);
  assert.equal(result.events[1].reason, 'unknown');
  assert.equal(result.players.find(p => p.player === 0).ownershipTransfersIn, 1);
  assert.equal(result.players.find(p => p.player === 1).ownershipTransfersOut, 1);
  assert.equal(result.availability.donations.available, false);
  assert.equal(telemetry.normalize(event('ownershipTransfer', { object: object(), from: 1, to: 2 })), null);
});

test('shared or unattributed research does not count as own lab completion', () => {
  const result = compile([event('researchCompleted', { player: 0, research: 'R-Test', labId: 8, locallyCompleted: true }),
    event('researchCompleted', { player: 0, research: 'R-Shared', labId: null, locallyCompleted: true })]);
  assert.equal(result.players[0].locallyCompletedResearch, 1);
});

test('only matching completed construction after destruction counts as a replacement', () => {
  const result = compile([event('structureBuilt', { object: object(1, 'structure') }, 100),
    event('destroyed', { object: object(1, 'structure') }, 200),
    event('structureBuilt', { object: object(2, 'structure') }, 300),
    event('structureBuilt', { object: { ...object(3, 'structure'), x: 20 } }, 400)]);
  assert.equal(result.players[0].structuresReplaced, 1);
  assert.equal(result.players[0].completedStructures, 3);
});

test('balance and army samples are observations, never exact economy flows', () => {
  const sample = event('sample', { players: [{ player: 3, units: 2, structures: 1,
    unitValue: 200, structureValue: 100, powerBalance: 500 }] });
  const result = compile([sample]);
  assert.equal(result.players[0].player, 3, 'preserve engine index, not array position');
  assert.equal(result.availability.armyValueHistory.available, true);
  assert.equal(result.availability.powerBalanceHistory.available, true);
  assert.equal(result.availability.economy.available, false);
  sample.players[0].unitValue = null;
  assert.equal(compile([sample]).availability.armyValueHistory.available, false);
});

test('partial, missing-start, malformed, late and truncated logs withhold totals', () => {
  const build = event('unitBuilt', { object: object() });
  const parsed = telemetry.parseLogs(['__BOHATELEMETRY__{bad}__ENDBOHATELEMETRY__\n__BOHATELEMETRY__{']);
  assert.equal(parsed.malformedRecords, 2);
  for (const result of [
    telemetry.compile([start, build], { complete: false, durationMilliseconds: 1000 }),
    telemetry.compile([build], { complete: true, durationMilliseconds: 1000 }),
    telemetry.compile([start, build], { complete: true, durationMilliseconds: 1000, malformedRecords: 1 }),
    compile([{ ...build, timeMilliseconds: 2000 }]),
    compile([build, { schemaVersion: 1, type: 'overflow' }])
  ]) {
    assert.equal(result.complete, false);
    assert.equal(result.players[0].completedUnits, null);
    assert.equal(result.availability.construction.available, false);
  }
});

test('strict records reject coercions, invalid kinds and broken samples', () => {
  for (const raw of [null, { ...start, schemaVersion: 2 }, { ...start, timeMilliseconds: null },
    event('unitBuilt', { object: object(1, 'structure') }), event('structureBuilt', { object: object() }),
    event('unitBuilt', { object: { ...object(), id: '1' } }),
    event('sample', { players: [null] }), event('sample', { players: [] }),
    event('sample', { players: [{ player: 0, units: null, structures: 0 }] })])
    assert.equal(telemetry.normalize(raw), null);
});

test('normalization allowlists public fields and ignores private payloads', () => {
  const result = compile([event('unitBuilt', { object: { ...object(), ip: 'private' },
    token: 'private', admin: { secret: 'private' } })]);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('collector uses read-only APIs, separates event kinds and samples attack notices', () => {
  const records = [], timers = [];
  const context = vm.createContext({ DROID: 0, STRUCTURE: 1, gameTime: 2, maxPlayers: 1,
    namespace() {}, receiveAllEvents() {}, setTimer: (...args) => timers.push(args),
    dump: line => records.push(line), enumDroid: () => [{ cost: 120 }], enumStruct: () => [], playerPower: () => 600 });
  vm.runInContext(fs.readFileSync(require.resolve('./replay-telemetry-hook.js'), 'utf8'), context);
  context._bohaTelemetry_eventStartLevel();
  const unit = { type: 0, id: 1, player: 0, name: 'Test', cost: 100, x: 4, y: 5 };
  context.gameTime = 100;
  context._bohaTelemetry_eventDroidBuilt(unit, null);
  context._bohaTelemetry_eventAttacked(unit, unit);
  context._bohaTelemetry_eventAttacked(unit, unit);
  const parsed = telemetry.parseLogs(records);
  assert.equal(parsed.malformedRecords, 0);
  assert.equal(parsed.records.filter(r => r.type === 'attackNotice').length, 1);
  assert.equal(compile(parsed.records).players[0].completedUnits, 1);
  assert.equal(timers[0][1], 10000);
  context._bohaTelemetry_sequence = 100000;
  context._bohaTelemetry_eventDestroyed(unit);
  context._bohaTelemetry_eventDestroyed(unit);
  const overflow = telemetry.parseLogs(records);
  assert.equal(overflow.records.filter(r => r.type === 'overflow').length, 1);
  assert.equal(compile(overflow.records).complete, false);
});

test('frontend expands compressed telemetry before rendering without touching legacy results', async () => {
  const source = fs.readFileSync(require.resolve('../replay-analyzer.js'), 'utf8');
  const first = source.indexOf('  async function expandCompressedEngineAnalysis(');
  const last = source.indexOf('\n  function ', first);
  const context = vm.createContext({ console, decodeGzipBase64Json: async value =>
    JSON.parse(require('node:zlib').gunzipSync(Buffer.from(value, 'base64'))) });
  vm.runInContext(source.slice(first, last), context);
  const original = compile([event('unitBuilt', { object: object() })]);
  const analysis = { extended: { telemetryEncoding: 'gzip+base64',
    telemetryGzipBase64: require('node:zlib').gzipSync(JSON.stringify(original)).toString('base64') } };
  await context.expandCompressedEngineAnalysis(analysis);
  assert.deepEqual(analysis.extended.telemetry, original);
  assert.equal('telemetryGzipBase64' in analysis.extended, false);
  const legacy = { extended: {} };
  await context.expandCompressedEngineAnalysis(legacy);
  assert.deepEqual(legacy, { extended: {} });
});
