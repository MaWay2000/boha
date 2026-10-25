const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const battle = require('../balloon/site-armory-battle.js');
const loot = require('../balloon/site-armory-loot.js');
const rollFor = id => (loot.CATALOG.findIndex(item => item.id === id) + .5) / loot.CATALOG.length;

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

test('every unit keeps its own bundled weapon range, scaled consistently into the arena', () => {
  const weapons = require('../mapmaker/pies/components/weapons/weapons.json');
  const templates = require('../mapmaker/pies/components/templates.json');
  for (const unit of battle.CATALOG) {
    const id = templates[unit.key].weapons[0], weapon = weapons[id];
    assert.equal(unit.weapon, id);
    assert.equal(unit.range, weapon.longRange / 128 * 24);
    assert.equal(unit.minRange, (weapon.minRange || 0) / 128 * 24);
  }
  assert.equal(battle.CATALOG.find(unit => unit.key === battle.ALLY_KEY).range, 216);
  assert.equal(battle.CATALOG[0].range, 144);
  assert.equal(battle.CATALOG.find(unit => unit.key === 'A-Mantis-Trk-Pulse').range, 336);
  assert.equal(battle.CATALOG.find(unit => unit.key === 'A-Mantis-Trk-Lancer').minRange, 24);
  const defs = { templates, weapons: { ...weapons },
    bodies: require('../mapmaker/pies/components/bodies/body.json'), propulsions: require('../mapmaker/pies/components/prop/propulsion.json') };
  for (const longRange of [undefined, NaN, Infinity, 0, -1, '768']) {
    defs.weapons.MG1Mk1 = { ...weapons.MG1Mk1, longRange };
    assert.throws(() => battle.makeCatalog(defs), /weapon range/);
  }
  for (const minRange of [-1, NaN, Infinity, 769]) {
    defs.weapons.MG1Mk1 = { ...weapons.MG1Mk1, minRange };
    assert.throws(() => battle.makeCatalog(defs), /weapon range/);
  }
});

test('combat gates both range edges and moves toward firing range without overshoot or mutation', () => {
  const type = { range: 216, minRange: 24 }, origin = { x: 400, y: 100, vx: 20 };
  const bounds = { maxX: 1064, maxY: 188 };
  for (const [distance, expected] of [[0, false], [23.99, false], [24, true], [216, true], [216.01, false], [1000, false], [NaN, false]]) {
    assert.equal(battle.inWeaponRange(type, origin, { x: 400 + distance, y: 100 }), expected);
  }
  for (const bad of [null, {}, { range: Infinity, minRange: 0 }, { range: 10, minRange: 11 }]) {
    assert.equal(battle.inWeaponRange(bad, origin, origin), false);
  }
  const far = { x: 900, y: 100 };
  const moved = battle.moveIntoRange(type, origin, far, 35, .05, bounds);
  assert.equal(moved.x, 401.75); assert.equal(moved.y, 100); assert.equal(moved.vx, 20);
  const reached = battle.moveIntoRange(type, origin, far, 35, 100, bounds);
  assert.ok(battle.inWeaponRange(type, reached, far));
  assert.deepEqual(battle.moveIntoRange(type, reached, far, 35, 1, bounds), reached);
  const retreat = battle.moveIntoRange(type, origin, { x: 410, y: 100 }, 35, 1, bounds);
  assert.ok(retreat.x < origin.x); assert.ok(battle.inWeaponRange(type, retreat, { x: 410, y: 100 }));
  const overlap = battle.moveIntoRange(type, origin, origin, 35, 1, bounds);
  assert.ok(battle.inWeaponRange(type, overlap, origin));
  const edge = battle.moveIntoRange(type, { x: 12, y: 20 }, { x: 13, y: 20 }, 35, 10, bounds);
  assert.equal(edge.x, 12); assert.equal(edge.y, 20);
  for (const dt of [0, -1, Infinity, NaN]) assert.deepEqual(battle.moveIntoRange(type, origin, far, 35, dt, bounds), origin);
  assert.deepEqual(origin, { x: 400, y: 100, vx: 20 });
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

test('finite waves retain the bank, rest exactly four seconds and strengthen the next wave', () => {
  let state = battle.startWaveBattle(battle.CATALOG, () => 0);
  const initial = state;
  assert.equal(state.waves.number, 1); assert.equal(state.waves.limit, 8); assert.equal(state.units.length, 8);
  for (let i = 0; i < 8; i++) state = battle.damageUnit(state, state.units[0].id, 10000, battle.CATALOG, () => 0).state;
  assert.equal(state.waves.phase, 'break'); assert.equal(state.waves.kills, 8); assert.equal(state.units.length, 0);
  assert.equal(initial.waves.kills, 0); assert.equal(state.bank + state.spent, 500 + state.earned);
  assert.equal(battle.spawnAffordable(state, battle.CATALOG), state);
  for (const elapsed of [NaN, Infinity, -1, 0]) assert.equal(battle.advanceWave(state, elapsed, battle.CATALOG), state);
  const rest = battle.advanceWave(state, 3999, battle.CATALOG);
  assert.equal(rest.waves.remainingMs, 1); assert.equal(rest.units.length, 0);
  state = battle.advanceWave(rest, 1, battle.CATALOG, () => 0);
  assert.equal(state.waves.number, 2); assert.equal(state.waves.limit, 10);
  assert.equal(state.waves.kills, 0); assert.equal(state.waves.phase, 'combat');
  assert.equal(state.units[0].maxHealth, Math.round(battle.CATALOG[0].maxHealth * 1.15));
  assert.equal(state.bank + state.spent, 500 + state.earned);
  assert.equal(battle.advanceWave(state, 10000, battle.CATALOG), state);
});

test('boss calls respect the eight-enemy cap, wave quota and original budget, including queued break calls', () => {
  const initial = battle.startWaveBattle(battle.CATALOG, () => 0);
  let state = battle.callReinforcements(initial, battle.CATALOG, () => 0);
  assert.equal(state.waves.limit, 10); assert.equal(state.waves.calls, 1); assert.equal(state.units.length, 8);
  assert.equal(initial.waves.limit, 8); assert.equal(state.bank + state.spent, 500);
  while (state.waves.phase === 'combat') state = battle.damageUnit(state, state.units[0].id, 10000, battle.CATALOG, () => 0).state;
  assert.equal(state.waves.kills, 10);
  const money = state.bank + state.spent;
  state = battle.callReinforcements(state, battle.CATALOG);
  assert.equal(state.units.length, 0); assert.equal(state.waves.pending, 2);
  assert.equal(state.bank + state.spent, money);
  state = battle.advanceWave(state, 4000, battle.CATALOG, () => 0);
  assert.equal(state.waves.number, 2); assert.equal(state.waves.limit, 12);
  assert.ok(state.units.length <= 8); assert.equal(state.bank + state.spent, money);
  assert.equal(battle.callReinforcements(battle.createBattle(), battle.CATALOG).waves, null);
});

test('long wave campaigns keep difficulty bounded, unique units and exact money/reward conservation', () => {
  let state = battle.startWaveBattle(battle.CATALOG, () => 0), kills = 0;
  for (let wave = 1; wave <= 60; wave++) {
    assert.equal(state.waves.number, wave);
    assert.ok(state.waves.limit <= 32); assert.ok(battle.waveStrength(state) <= 20);
    for (let guard = 0; state.waves.phase === 'combat' && guard < 100; guard++) {
      assert.ok(state.units.length > 0 && state.units.length <= 8);
      assert.equal(new Set(state.units.map(unit => unit.id)).size, state.units.length);
      const id = state.units[0].id;
      state = battle.damageUnit(state, id, 10000, battle.CATALOG, () => 0).state; kills++;
      assert.equal(state.bank + state.spent, 500 + state.earned);
      assert.equal(state.unitKills, kills); assert.equal(state.score, 1 + kills);
      assert.equal(battle.damageUnit(state, id, 10000, battle.CATALOG).state, state);
    }
    assert.equal(state.waves.phase, 'break');
    state = battle.advanceWave(state, 4000, battle.CATALOG, () => 0);
  }
});

test('each defeated boss drops 250 power; uncollected drops stack and pay exactly once', () => {
  const initial = battle.startWaveBattle(battle.CATALOG, () => 0);
  let state = battle.dropBossLoot(initial, () => 0);
  assert.equal(initial.loot, 0); assert.equal(state.loot, 250);
  assert.equal(state.bank, initial.bank); assert.equal(state.earned, 0);
  state = battle.dropBossLoot(state, () => 0); assert.equal(state.loot, 500);
  const collected = battle.collectBossLoot(state, battle.CATALOG, () => 0);
  assert.equal(collected.loot, 0); assert.equal(collected.bonusEarned, 500);
  assert.equal(collected.earned, 500); assert.equal(collected.bank, initial.bank + 500);
  assert.equal(collected.bank + collected.spent, 500 + collected.earned);
  assert.equal(collected.score, initial.score); assert.equal(collected.unitKills, 0);
  assert.equal(battle.collectBossLoot(collected, battle.CATALOG), collected);
  const killed = battle.damageUnit(collected, collected.units[0].id, 10000, battle.CATALOG).state;
  assert.equal(killed.loot, 0); assert.equal(killed.bonusEarned, 500);
  assert.equal(killed.bank + killed.spent, 500 + killed.earned);
});

test('crate collection funds pending enemies but never interrupts a rest or changes the wave quota', () => {
  let state = battle.startWaveBattle(battle.CATALOG, () => .99);
  const initial = state;
  state = battle.collectBossLoot(battle.dropBossLoot(state, () => 0), battle.CATALOG, () => 0);
  assert.ok(state.units.length > initial.units.length); assert.ok(state.units.length <= 8);
  assert.equal(state.waves.limit, initial.waves.limit);
  assert.equal(state.bank + state.spent, 500 + state.earned);
  while (state.waves.phase === 'combat') state = battle.damageUnit(state, state.units[0].id, 10000, battle.CATALOG, () => 0).state;
  const rest = state;
  state = battle.collectBossLoot(battle.dropBossLoot(state, () => 0), battle.CATALOG);
  assert.equal(state.units.length, 0); assert.deepEqual(state.waves, rest.waves);
  assert.equal(state.bank, rest.bank + 250); assert.equal(state.earned, rest.earned + 250);
});

test('invalid, inactive or overflowing loot cannot mint power', () => {
  const inactive = battle.createBattle();
  assert.equal(battle.dropBossLoot(inactive), inactive);
  assert.equal(battle.collectBossLoot(inactive, battle.CATALOG), inactive);
  const active = battle.startWaveBattle(battle.CATALOG);
  for (const loot of [NaN, Infinity, -1, 0, .5, '250', Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = { ...active, loot };
    assert.equal(battle.collectBossLoot(invalid, battle.CATALOG), invalid);
  }
  const huge = { ...active, loot: Number.MAX_SAFE_INTEGER };
  assert.equal(battle.dropBossLoot(huge), huge);
  const overflow = { ...active, loot: 250, bank: Number.MAX_SAFE_INTEGER };
  assert.equal(battle.collectBossLoot(overflow, battle.CATALOG), overflow);
});

test('all 30 random rewards have unique IDs, explicit effects, equal roll intervals and safe boundaries', () => {
  assert.equal(loot.CATALOG.length, 30); assert.equal(new Set(loot.CATALOG.map(item => item.id)).size, 30);
  for (const [index, item] of loot.CATALOG.entries()) {
    assert.ok(item.name && item.description && Object.isFrozen(item));
    assert.equal(loot.roll(() => (index + .5) / 30).id, item.id);
    assert.equal(loot.roll(() => index / 30).id, item.id);
    const rolled = battle.rollBossDrop(() => rollFor(item.id));
    assert.equal(rolled.id, item.id); assert.ok(rolled.power >= 250);
    assert.ok(['power', 'fighters', 'repair', 'heal', 'reload', 'timed', 'passive'].includes(item.kind));
  }
  assert.equal(loot.roll(() => 1).id, loot.CATALOG.at(-1).id);
  for (const roll of [-1, NaN, Infinity, '0.5']) assert.deepEqual(battle.rollBossDrop(() => roll), battle.rollBossDrop(() => 0));
  for (let i = 0; i < 1000; i++) {
    const drop = battle.rollBossDrop(() => i / 1000);
    assert.ok([250, 500, 750, 1000].includes(drop.power));
    assert.ok(drop.fighters <= 4 && drop.repairs <= 1 && drop.reloads <= 1);
    assert.ok(Number(!!drop.fighters) + drop.repairs + drop.reloads <= 1);
  }
  const withoutArmy = battle.dropBossLoot(battle.startWaveBattle(battle.CATALOG), () => rollFor('repair'), false);
  assert.deepEqual(withoutArmy.extraLoot, { fighters: 1, repairs: 0, reloads: 0 });
});

test('mixed uncollected rewards stack immutably into one bounded bundle and clear exactly once', () => {
  const initial = battle.startWaveBattle(battle.CATALOG, () => 0);
  let state = initial;
  for (const id of ['fighter1', 'fighter2', 'repair', 'reload', 'power750']) state = battle.dropBossLoot(state, () => rollFor(id));
  assert.equal(state.loot, 1750); assert.deepEqual(state.extraLoot, { fighters: 3, repairs: 1, reloads: 1 });
  assert.deepEqual(initial.extraLoot, { fighters: 0, repairs: 0, reloads: 0 });
  assert.match(battle.lootDescription(state), /1750 power.*3 fighters.*Full army repair.*Reload all guns/);
  const next = battle.collectBossLoot(state, battle.CATALOG, () => 0);
  assert.equal(next.loot, 0); assert.deepEqual(next.extraLoot, { fighters: 0, repairs: 0, reloads: 0 });
  assert.equal(next.bonusEarned, 1750); assert.equal(next.bank + next.spent, 500 + next.earned);
  assert.equal(battle.collectBossLoot(next, battle.CATALOG), next);
  const bad = { ...state, extraLoot: { fighters: -1, repairs: 0, reloads: 0 } };
  assert.equal(battle.collectBossLoot(bad, battle.CATALOG), bad); assert.equal(battle.dropBossLoot(bad), bad);
});

test('fighter drops use bounded bulk recruitment, and army repairs never resurrect dead units', () => {
  const initial = battle.createAllies(), army = battle.recruitAllies(initial, 1000000);
  assert.equal(initial.created, 0); assert.equal(army.units.length, 4); assert.equal(army.reserves, 999996);
  assert.equal(army.created, army.units.length + army.reserves + army.lost);
  for (const count of [0, -1, NaN, Infinity, .5, '2']) assert.equal(battle.recruitAllies(army, count), army);
  const wounded = battle.damageAlly(army, army.units[0].id, 35).state;
  const healed = battle.repairAllies(wounded);
  assert.equal(wounded.units[0].health, 85); assert.equal(healed.units[0].health, 120);
  assert.equal(healed.created, wounded.created); assert.equal(healed.reserves, wounded.reserves);
  assert.equal(healed.lost, wounded.lost); assert.equal(healed.units.length, wounded.units.length);
});

test('every timed reward changes its intended combat modifier, refreshes once and expires at 30 seconds', () => {
  const fields = { doubleDamage: ['damage', 2], rapidFire: ['reload', .5], allyFury: ['allyDamage', 2], allyHaste: ['allyReload', .5],
    shield: ['enemyDamage', 0], slowEnemies: ['enemySpeed', .5], weakenEnemies: ['enemyDamage', .5],
    wideBlast: ['cannonRadius', 1.5], wideFlame: ['flameArea', 1.5], mgBoost: ['damage', 1.5, 'machinegun'],
    cannonBoost: ['damage', 1.5, 'cannon'], laserBoost: ['damage', 1.5, 'laser'], rocketBoost: ['damage', 1.5, 'rockets'], flamerBoost: ['damage', 1.5, 'flamer'] };
  assert.equal(loot.CATALOG.filter(item => item.kind === 'timed').length, Object.keys(fields).length);
  for (const [id, [field, value, weapon]] of Object.entries(fields)) {
    const fresh = loot.createEffects(), applied = loot.apply(fresh, { [id]: 50 });
    assert.equal(applied.timed[id], 30000); assert.deepEqual(fresh.timed, {});
    assert.equal(loot.modifiers(applied, weapon)[field], value, id);
    const almost = loot.tick(applied, 29999); assert.equal(almost.timed[id], 1);
    assert.equal(loot.modifiers(almost, weapon)[field], value);
    const expired = loot.tick(almost, 1); assert.deepEqual(expired.timed, {});
    assert.equal(loot.modifiers(expired, weapon)[field], 1);
    assert.equal(loot.apply(almost, { [id]: 1 }).timed[id], 30000);
  }
  for (const value of [NaN, Infinity, -1, 0]) { const initial = loot.createEffects(); assert.equal(loot.tick(initial, value), initial); }
});

test('passive upgrades stack with explicit caps, and hull upgrades affect existing and future friendlies', () => {
  const effects = loot.apply(loot.createEffects(), { health10: 1000, damage10: 1000, allyDamage10: 1000, reload5: 1000, armor5: 1000 });
  assert.deepEqual(effects.passive, loot.CAPS);
  const m = loot.modifiers(effects);
  assert.equal(m.damage, 2); assert.equal(m.allyDamage, 2); assert.equal(m.reload, .6); assert.equal(m.enemyDamage, .5);
  let army = battle.recruitAlly(battle.createAllies()); army = battle.damageAlly(army, 1, 50).state;
  const fortified = battle.fortifyAllies(army, 10);
  assert.equal(army.units[0].health, 70); assert.equal(fortified.units[0].health, 80); assert.equal(fortified.units[0].maxHealth, 130);
  const recruits = battle.recruitAllies(fortified, 5);
  assert.ok(recruits.units.every(unit => unit.maxHealth === 130));
  const capped = battle.fortifyAllies(recruits, 10000);
  assert.equal(capped.healthBonus, 200); assert.ok(capped.units.every(unit => unit.maxHealth === 320));
  const healed = battle.healAllies(fortified, 50); assert.equal(healed.units[0].health, 130);
  assert.equal(healed.units[0].maxHealth, 130); assert.equal(healed.created, fortified.created);
  for (const counts of [{ unknown: 1 }, { health10: -1 }, { health10: Infinity }, { health10: .5 }, { constructor: 1 }]) {
    const initial = loot.createEffects(); assert.equal(loot.apply(initial, counts), initial);
  }
});
