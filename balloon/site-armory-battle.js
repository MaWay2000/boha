(function (root, factory) {
  const definitions = typeof module === 'object' && module.exports ? {
    bodies: require('../mapmaker/pies/components/bodies/body.json'),
    propulsions: require('../mapmaker/pies/components/prop/propulsion.json'),
    weapons: require('../mapmaker/pies/components/weapons/weapons.json'),
    templates: require('../mapmaker/pies/components/templates.json')
  } : null;
  const api = factory(definitions, typeof module === 'object' && module.exports ? require('./site-armory-loot.js') : root.SiteArmoryLoot);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteArmoryBattle = api;
})(typeof globalThis === 'object' ? globalThis : this, function (definitions, lootModule) {
  'use strict';
  const START_BANK = 500, MAX_UNITS = 8;
  const BOSS_LOOT_POWER = 250;
  const WAVE_BREAK_MS = 4000;
  function waveStrength(state) { return Math.min(20, Math.max(0, (state.waves?.number || 1) - 1)); }
  const MAX_ALLIES = 4, ALLY_HEALTH = 120, ALLY_KEY = 'A-Python-Trk-HC';
  // Warzone distances use 128 world units per tile; this arena uses 24 CSS px.
  const WORLD_UNITS_PER_TILE = 128, PIXELS_PER_TILE = 24;
  function inWeaponRange(type, from, to) {
    if (!type || !Number.isFinite(type.range) || type.range <= 0 || !Number.isFinite(type.minRange) || type.minRange < 0 || type.minRange > type.range) return false;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    return distance >= type.minRange && distance <= type.range;
  }
  function moveIntoRange(type, from, to, speed, dt, bounds) {
    if (!type || !Number.isFinite(type.range) || type.range <= 0 || !Number.isFinite(type.minRange) ||
        type.minRange < 0 || type.minRange > type.range || !Number.isFinite(dt) || dt <= 0 ||
        !Number.isFinite(speed) || speed <= 0 || inWeaponRange(type, from, to)) return { ...from };
    const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance)) return { ...from };
    const retreat = distance < type.minRange;
    const desired = retreat ? Math.min(type.range, type.minRange + 8) : Math.max(type.minRange, type.range * .9);
    const step = Math.min(Math.abs(distance - desired), speed * dt) * (retreat ? -1 : 1);
    return { ...from,
      x: Math.max(12, Math.min(bounds.maxX, from.x + (distance ? dx / distance : 1) * step)),
      y: Math.max(20, Math.min(bounds.maxY, from.y + (distance ? dy / distance : 0) * step)) };
  }
  function createAllies() { return { units: [], reserves: 0, created: 0, lost: 0, nextId: 1, healthBonus: 0 }; }
  function deployAllies(state) {
    const next = { ...state, units: [...state.units] };
    while (next.reserves > 0 && next.units.length < MAX_ALLIES) {
      next.reserves--;
      const health = ALLY_HEALTH + next.healthBonus;
      next.units.push({ id: next.nextId++, key: ALLY_KEY, health, maxHealth: health });
    }
    return next;
  }
  function recruitAllies(state, count) {
    if (!Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(state.created + count) || !Number.isSafeInteger(state.reserves + count)) return state;
    return deployAllies({ ...state, reserves: state.reserves + count, created: state.created + count });
  }
  function recruitAlly(state) { return recruitAllies(state, 1); }
  function repairAllies(state) { return { ...state, units: state.units.map(unit => ({ ...unit, health: unit.maxHealth })) }; }
  function fortifyAllies(state, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return state;
    const bonus = Math.min(200, state.healthBonus + amount), gained = bonus - state.healthBonus;
    return { ...state, healthBonus: bonus, units: state.units.map(unit => ({ ...unit, maxHealth: unit.maxHealth + gained, health: unit.health + gained })) };
  }
  function healAllies(state, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return state;
    return { ...state, units: state.units.map(unit => ({ ...unit, health: Math.min(unit.maxHealth, unit.health + amount) })) };
  }
  function damageAlly(state, id, amount) {
    const target = state.units.find(unit => unit.id === id);
    if (!target || !Number.isFinite(amount) || amount <= 0) return { state, killed: false };
    const health = Math.max(0, target.health - amount);
    if (health > 0) return { state: { ...state, units: state.units.map(unit => unit.id === id ? { ...unit, health } : unit) }, killed: false };
    return { state: deployAllies({ ...state, units: state.units.filter(unit => unit.id !== id), lost: state.lost + 1 }), killed: true };
  }
  const PRESETS = ['A-Viper-Wheels-MG', 'A-Viper-Wheels-TMG', 'A-Viper-Wheels-HMG', 'A-Cobra-Wheels-HMG',
    'A-Cobra-Trk-HMG', 'A-Cobra-Hover-MC', 'A-Python-Trk-HC', 'A-Mantis-Trk-Lancer', 'A-Mantis-Trk-Pulse'];
  function makeCatalog(defs) {
    return PRESETS.map(key => {
      const template = defs.templates[key], body = defs.bodies[template?.body], prop = defs.propulsions[template?.propulsion];
      const weapon = defs.weapons[template?.weapons?.[0]];
      if (!body || !prop || !weapon || ![body.buildPower, prop.buildPower, weapon.buildPower].every(Number.isFinite)) throw Error('Missing unit power data.');
      // Warzone calcPower: floor(body * (100 + propulsion%) / 100) + weapons.
      // https://github.com/Warzone2100/warzone2100/blob/master/src/droid.cpp
      const cost = Math.floor(body.buildPower * (100 + prop.buildPower) / 100) + weapon.buildPower;
      if (!Number.isSafeInteger(cost) || cost <= 0) throw Error('Invalid unit power cost.');
      if (!Number.isFinite(weapon.longRange) || weapon.longRange <= 0 ||
          (weapon.minRange != null && (!Number.isFinite(weapon.minRange) || weapon.minRange < 0 || weapon.minRange > weapon.longRange))) throw Error('Invalid unit weapon range.');
      const propulsion = body.propulsionExtraModels?.[template.propulsion]?.left || prop.model;
      const part = (path, role, folder) => ({ path: folder + '/' + path.toLowerCase(), role });
      const parts = [part(body.model, 'body', 'bodies'), part(propulsion, 'propulsion', 'prop')];
      if (weapon.mountModel) parts.push(part(weapon.mountModel, 'mount', 'weapons'));
      if (weapon.model && weapon.model !== weapon.mountModel) parts.push(part(weapon.model, 'weapon', 'weapons'));
      // Target-practice health is deliberately simplified, not upgraded match HP.
      return { key, name: template.name, cost, maxHealth: 40 + Math.round(cost / 5), parts,
        weapon: template.weapons[0], range: weapon.longRange / WORLD_UNITS_PER_TILE * PIXELS_PER_TILE,
        minRange: (weapon.minRange || 0) / WORLD_UNITS_PER_TILE * PIXELS_PER_TILE };
    });
  }
  const CATALOG = definitions ? makeCatalog(definitions) : [];
  let catalogPromise;
  function loadCatalog(win) {
    if (CATALOG.length) return Promise.resolve(CATALOG);
    if (!catalogPromise) catalogPromise = Promise.all(['bodies/body.json', 'prop/propulsion.json', 'weapons/weapons.json', 'templates.json'].map(async path => {
      const response = await win.fetch(new URL('mapmaker/pies/components/' + path, win.document.baseURI), {signal: win.AbortSignal?.timeout?.(8000)});
      if (!response.ok) throw Error('Unit catalog unavailable.');
      return response.json();
    })).then(([bodies, propulsions, weapons, templates]) => makeCatalog({ bodies, propulsions, weapons, templates }))
      .catch(error => { catalogPromise = null; throw error; });
    return catalogPromise;
  }
  function rollBossDrop(random = Math.random) {
    const item = lootModule.roll(random);
    return { power: item.kind === 'power' ? item.amount : BOSS_LOOT_POWER,
      fighters: item.kind === 'fighters' ? item.amount : 0, repairs: Number(item.kind === 'repair'), reloads: Number(item.kind === 'reload'), id: item.id };
  }
  function lootDescription(state) {
    const extras = state.extraLoot;
    return [`+${state.loot} power`, extras.fighters ? `+${extras.fighters} fighter${extras.fighters === 1 ? '' : 's'}` : '',
      extras.repairs ? 'Full army repair' : '', extras.reloads ? 'Reload all guns' : '',
      ...Object.entries(state.lootRewards).filter(([id]) => !['power', 'fighters', 'repair', 'reload'].includes(lootModule.BY_ID[id].kind))
        .map(([id, count]) => `${lootModule.BY_ID[id].name}${lootModule.BY_ID[id].kind === 'timed' ? ' (30s)' : ''}${count > 1 ? ' ×' + count : ''}`)].filter(Boolean).join(' · ');
  }
  function validExtras(extras) { return !!extras && ['fighters', 'repairs', 'reloads'].every(key => Number.isSafeInteger(extras[key]) && extras[key] >= 0); }
  function createBattle() { return { active: false, score: 0, unitKills: 0, bank: 0, earned: 0, spent: 0, loot: 0,
    extraLoot: { fighters: 0, repairs: 0, reloads: 0 }, lootRewards: {}, bonusEarned: 0, units: [], nextId: 1, lastReward: 0, waves: null }; }
  function dropBossLoot(state, random = Math.random, canRepair = true) {
    if (!state.active || !Number.isSafeInteger(state.loot) || state.loot < 0 || !validExtras(state.extraLoot) || !lootModule.validRewards(state.lootRewards)) return state;
    const drop = rollBossDrop(random), extraLoot = { ...state.extraLoot };
    // A repair roll without a friendly army becomes a fighter, not an empty perk.
    if ((drop.repairs || drop.id === 'heal50') && !canRepair) { drop.repairs = 0; drop.fighters = 1; drop.id = 'fighter1'; }
    const lootRewards = { ...state.lootRewards, [drop.id]: (state.lootRewards[drop.id] || 0) + 1 };
    for (const key of ['fighters', 'repairs', 'reloads']) extraLoot[key] += drop[key];
    if (!Number.isSafeInteger(state.loot + drop.power) || !validExtras(extraLoot) || !lootModule.validRewards(lootRewards)) return state;
    return { ...state, loot: state.loot + drop.power, extraLoot, lootRewards };
  }
  function collectBossLoot(state, catalog, random = Math.random) {
    const amount = state.loot;
    if (!state.active || !Number.isSafeInteger(amount) || amount <= 0 || !validExtras(state.extraLoot) || !lootModule.validRewards(state.lootRewards) ||
        ![state.bank, state.earned, state.bonusEarned].every(value => Number.isFinite(value) && value >= 0 && value + amount <= Number.MAX_SAFE_INTEGER)) return state;
    return spawnAffordable({ ...state, loot: 0, extraLoot: { fighters: 0, repairs: 0, reloads: 0 }, lootRewards: {}, bank: state.bank + amount, earned: state.earned + amount,
      bonusEarned: state.bonusEarned + amount }, catalog, random);
  }
  function spawnAffordable(state, catalog, random = Math.random) {
    if (!state.active || state.waves?.phase === 'break') return state;
    const next = { ...state, units: [...state.units], waves: state.waves ? { ...state.waves } : null };
    while (next.units.length < MAX_UNITS && (!next.waves || next.waves.spawned < next.waves.limit)) {
      const affordable = catalog.filter(unit => Number.isSafeInteger(unit.cost) && unit.cost > 0 && unit.cost <= next.bank);
      if (!affordable.length) break;
      const pick = Math.max(0, Math.min(affordable.length - 1, Math.floor(random() * affordable.length)));
      const type = affordable[pick];
      next.bank -= type.cost; next.spent += type.cost;
      const health = Math.round(type.maxHealth * (1 + waveStrength(next) * .15));
      next.units.push({ id: next.nextId++, key: type.key, cost: type.cost, health, maxHealth: health });
      if (next.waves) next.waves.spawned++;
    }
    return next;
  }
  function startBattle(catalog, random = Math.random) {
    return spawnAffordable({ ...createBattle(), active: true, score: 1, bank: START_BANK }, catalog, random);
  }
  function startWaveBattle(catalog, random = Math.random) {
    return spawnAffordable({ ...createBattle(), active: true, score: 1, bank: START_BANK,
      waves: { number: 1, phase: 'combat', limit: 8, spawned: 0, kills: 0, remainingMs: 0, pending: 0, calls: 0 } }, catalog, random);
  }
  function advanceWave(state, elapsed, catalog, random = Math.random) {
    if (state.waves?.phase !== 'break' || !Number.isFinite(elapsed) || elapsed <= 0) return state;
    const remainingMs = Math.max(0, state.waves.remainingMs - elapsed);
    if (remainingMs) return { ...state, waves: { ...state.waves, remainingMs } };
    const number = state.waves.number + 1;
    return spawnAffordable({ ...state, waves: { number, phase: 'combat', limit: Math.min(32, 8 + (number - 1) * 2) + state.waves.pending,
      spawned: 0, kills: 0, remainingMs: 0, pending: 0, calls: state.waves.calls } }, catalog, random);
  }
  function callReinforcements(state, catalog, random = Math.random) {
    if (!state.active || !state.waves) return state;
    const waves = { ...state.waves, calls: state.waves.calls + 1 };
    // Reinforcements use the same bank and slot limit, never free power. During
    // a rest they queue for the next wave instead of interrupting the break.
    if (waves.phase === 'break') waves.pending = Math.min(8, waves.pending + 2);
    else waves.limit = Math.min(40, waves.limit + 2);
    return spawnAffordable({ ...state, waves }, catalog, random);
  }
  function damageUnit(state, id, damage, catalog, random = Math.random) {
    const target = state.units.find(unit => unit.id === id);
    if (!state.active || !target || !Number.isFinite(damage) || damage <= 0) return { state, killed: false, damage: 0 };
    const dealt = Math.min(target.health, damage);
    const health = Math.max(0, target.health - damage);
    if (health > 0) return { state: { ...state, units: state.units.map(unit => unit.id === id ? { ...unit, health } : unit) }, killed: false, damage: dealt };
    // Integer unit costs produce exact half-power payouts; no rounding away money.
    const reward = target.cost * 1.5;
    const next = { ...state, units: state.units.filter(unit => unit.id !== id), score: state.score + 1,
      unitKills: state.unitKills + 1, bank: state.bank + reward, earned: state.earned + reward, lastReward: reward };
    if (state.waves) next.waves = { ...state.waves, kills: state.waves.kills + 1 };
    const spawned = spawnAffordable(next, catalog, random);
    if (spawned.waves && !spawned.units.length && spawned.waves.spawned >= spawned.waves.limit) {
      spawned.waves = { ...spawned.waves, phase: 'break', remainingMs: WAVE_BREAK_MS };
    }
    return { state: spawned, killed: true, reward, damage: dealt };
  }
  return { START_BANK, MAX_UNITS, BOSS_LOOT_POWER, rollBossDrop, lootDescription, dropBossLoot, collectBossLoot,
    MAX_ALLIES, ALLY_HEALTH, ALLY_KEY, createAllies, recruitAlly, recruitAllies, repairAllies, fortifyAllies, healAllies, damageAlly,
    WORLD_UNITS_PER_TILE, PIXELS_PER_TILE, inWeaponRange, moveIntoRange,
    WAVE_BREAK_MS, waveStrength, startWaveBattle, advanceWave, callReinforcements,
    CATALOG, PRESETS, makeCatalog, loadCatalog, createBattle, startBattle, spawnAffordable, damageUnit };
});
