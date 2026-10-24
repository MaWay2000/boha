const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const battle = require('../site-armory-battle.js');

test('catalog uses bundled component costs with propulsion as a percentage of body cost', () => {
  assert.equal(battle.CATALOG.length, 9);
  assert.equal(battle.CATALOG.find(type => type.key === 'A-Viper-Wheels-MG').cost, 55); // 30 + floor(30*50/100) + 10.
  assert.equal(battle.CATALOG.find(type => type.key === 'A-Python-Trk-HC').cost, 385); // 60 + 75 + 250.
  for (const unit of battle.CATALOG) {
    assert.ok(unit.cost > 0 && Number.isSafeInteger(unit.cost));
    assert.ok(unit.maxHealth > 0);
    for (const part of unit.parts) assert.ok(fs.existsSync(require('node:path').join(__dirname, '../mapmaker/pies/components', part.path)));
  }
});

test('balloon awards one score and spends a 500-power budget only on affordable units', () => {
  assert.equal(battle.createBattle().active, false);
  const state = battle.startBattle(battle.CATALOG, () => .99);
  assert.equal(state.score, 1); assert.equal(state.bank + state.spent, battle.START_BANK);
  assert.equal(state.units.length, 2); assert.equal(state.units[0].cost, 317); assert.equal(state.units[1].cost, 153); assert.equal(state.bank, 30);
  assert.ok(state.units.every(unit => unit.health === unit.maxHealth));
});

test('partial damage gives no reward; a kill pays exact 1.5 times cost and spends remaining affordable bank again', () => {
  const start = battle.startBattle(battle.CATALOG, () => .99), target = start.units[0];
  const partial = battle.damageUnit(start, target.id, 1, battle.CATALOG, () => .99);
  assert.equal(partial.killed, false); assert.equal(partial.state.bank, start.bank); assert.equal(partial.state.score, 1);
  const killed = battle.damageUnit(partial.state, target.id, 10000, battle.CATALOG, () => .99);
  assert.equal(killed.killed, true); assert.equal(killed.reward, 475.5);
  assert.equal(killed.state.score, 2); assert.equal(killed.state.unitKills, 1);
  assert.equal(killed.state.bank, 35.5); assert.equal(killed.state.units.length, 3);
  assert.equal(killed.state.bank + killed.state.spent, 500 + killed.state.earned);
  assert.equal(start.units[0].health, target.maxHealth); // Inputs are not mutated.
});

test('a dead unit cannot pay twice; invalid damage and unknown IDs do not change score or money', () => {
  const start = battle.startBattle(battle.CATALOG, () => .99), id = start.units[0].id;
  const dead = battle.damageUnit(start, id, 10000, battle.CATALOG).state;
  assert.equal(battle.damageUnit(dead, id, 10000, battle.CATALOG).state, dead);
  for (const amount of [NaN, Infinity, -10, 0, '100']) assert.equal(battle.damageUnit(start, id, amount, battle.CATALOG).state, start);
  assert.equal(battle.damageUnit(start, -1, 10000, battle.CATALOG).state, start);
});

test('spawn limits retain surplus bank rather than losing money, and no unaffordable or zero-cost spawns occur', () => {
  const capped = battle.startBattle(battle.CATALOG, () => 0);
  assert.equal(capped.units.length, 8); assert.equal(capped.bank, 60);
  assert.equal(battle.spawnAffordable(capped, battle.CATALOG).bank, 60);
  const low = battle.spawnAffordable({ ...battle.createBattle(), active: true, bank: 54.5 }, battle.CATALOG);
  assert.equal(low.units.length, 0); assert.equal(low.bank, 54.5);
  const empty = battle.spawnAffordable({ ...low, bank: 500 }, [{ cost: 0 }, { cost: -1 }]);
  assert.equal(empty.units.length, 0); assert.equal(empty.bank, 500);
});

test('long random rounds preserve money conservation, unique instance IDs and the eight-unit limit', () => {
  let seed = 12345;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let state = battle.startBattle(battle.CATALOG, random);
  for (let i = 0; i < 1000; i++) {
    const target = state.units[Math.floor(random() * state.units.length)];
    state = battle.damageUnit(state, target.id, 100000, battle.CATALOG, random).state;
    assert.equal(state.bank + state.spent, battle.START_BANK + state.earned);
    assert.ok(state.bank >= 0 && state.units.length > 0 && state.units.length <= 8);
    assert.equal(new Set(state.units.map(unit => unit.id)).size, state.units.length);
  }
  assert.equal(state.score, 1001); assert.equal(state.unitKills, 1000);
});

test('damage reporting is actual HP removed, capped at remaining health with no duplicate damage', () => {
  const initial = battle.startBattle(battle.CATALOG, () => .99), id = initial.units[0].id;
  const maxHealth = initial.units[0].health;
  const first = battle.damageUnit(initial, id, maxHealth - 1, battle.CATALOG);
  assert.equal(first.damage, maxHealth - 1); assert.equal(first.killed, false);
  const last = battle.damageUnit(first.state, id, 75, battle.CATALOG);
  assert.equal(last.damage, 1); assert.equal(last.killed, true);
  assert.equal(battle.damageUnit(last.state, id, 75, battle.CATALOG).damage, 0);
  for (const amount of [NaN, Infinity, -1, 0]) assert.equal(battle.damageUnit(initial, id, amount, battle.CATALOG).damage, 0);
  assert.equal(battle.damageUnit(battle.createBattle(), id, 75, battle.CATALOG).damage, 0);
});

test('friendly recruitment conserves every cannon recruit between field, reserves and casualties', () => {
  const empty = battle.createAllies(); let state = empty;
  for (let i = 0; i < 100; i++) state = battle.recruitAlly(state);
  assert.equal(empty.created, 0); assert.equal(state.created, 100);
  assert.equal(state.units.length, 4); assert.equal(state.reserves, 96);
  assert.ok(state.units.every(unit => unit.key === battle.ALLY_KEY && unit.health === 120));
  for (let i = 0; i < 100; i++) {
    const id = state.units[0].id;
    const partial = battle.damageAlly(state, id, 12); assert.equal(partial.killed, false);
    assert.equal(partial.state.units.find(unit => unit.id === id).health, 108);
    const result = battle.damageAlly(partial.state, id, 100000); assert.equal(result.killed, true);
    state = result.state;
    assert.equal(state.created, state.units.length + state.reserves + state.lost);
    assert.ok(state.units.length <= 4); assert.equal(battle.damageAlly(state, id, 100000).state, state);
  }
  assert.equal(state.units.length, 0); assert.equal(state.reserves, 0); assert.equal(state.lost, 100);
  for (const amount of [0, -1, NaN, Infinity]) assert.equal(battle.damageAlly(empty, 1, amount).state, empty);
});
