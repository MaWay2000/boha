(function (root, factory) {
  const definitions = typeof module === 'object' && module.exports ? {
    bodies: require('./mapmaker/pies/components/bodies/body.json'),
    propulsions: require('./mapmaker/pies/components/prop/propulsion.json'),
    weapons: require('./mapmaker/pies/components/weapons/weapons.json'),
    templates: require('./mapmaker/pies/components/templates.json')
  } : null;
  const api = factory(definitions);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteArmoryBattle = api;
})(typeof globalThis === 'object' ? globalThis : this, function (definitions) {
  'use strict';
  const START_BANK = 500, MAX_UNITS = 8;
  const MAX_ALLIES = 4, ALLY_HEALTH = 120, ALLY_KEY = 'A-Python-Trk-HC';
  function createAllies() { return { units: [], reserves: 0, created: 0, lost: 0, nextId: 1 }; }
  function deployAllies(state) {
    const next = { ...state, units: [...state.units] };
    while (next.reserves > 0 && next.units.length < MAX_ALLIES) {
      next.reserves--;
      next.units.push({ id: next.nextId++, key: ALLY_KEY, health: ALLY_HEALTH, maxHealth: ALLY_HEALTH });
    }
    return next;
  }
  function recruitAlly(state) { return deployAllies({ ...state, reserves: state.reserves + 1, created: state.created + 1 }); }
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
      const propulsion = body.propulsionExtraModels?.[template.propulsion]?.left || prop.model;
      const part = (path, role, folder) => ({ path: folder + '/' + path.toLowerCase(), role });
      const parts = [part(body.model, 'body', 'bodies'), part(propulsion, 'propulsion', 'prop')];
      if (weapon.mountModel) parts.push(part(weapon.mountModel, 'mount', 'weapons'));
      if (weapon.model && weapon.model !== weapon.mountModel) parts.push(part(weapon.model, 'weapon', 'weapons'));
      // Target-practice health is deliberately simplified, not upgraded match HP.
      return { key, name: template.name, cost, maxHealth: 40 + Math.round(cost / 5), parts };
    });
  }
  const CATALOG = definitions ? makeCatalog(definitions) : [];
  let catalogPromise;
  function loadCatalog(win) {
    if (CATALOG.length) return Promise.resolve(CATALOG);
    if (!catalogPromise) catalogPromise = Promise.all(['bodies/body.json', 'prop/propulsion.json', 'weapons/weapons.json', 'templates.json'].map(async path => {
      const response = await win.fetch(new URL('mapmaker/pies/components/' + path, win.document.baseURI));
      if (!response.ok) throw Error('Unit catalog unavailable.');
      return response.json();
    })).then(([bodies, propulsions, weapons, templates]) => makeCatalog({ bodies, propulsions, weapons, templates }));
    return catalogPromise;
  }
  function createBattle() { return { active: false, score: 0, unitKills: 0, bank: 0, earned: 0, spent: 0, units: [], nextId: 1, lastReward: 0 }; }
  function spawnAffordable(state, catalog, random = Math.random) {
    if (!state.active) return state;
    const next = { ...state, units: [...state.units] };
    while (next.units.length < MAX_UNITS) {
      const affordable = catalog.filter(unit => Number.isSafeInteger(unit.cost) && unit.cost > 0 && unit.cost <= next.bank);
      if (!affordable.length) break;
      const pick = Math.max(0, Math.min(affordable.length - 1, Math.floor(random() * affordable.length)));
      const type = affordable[pick];
      next.bank -= type.cost; next.spent += type.cost;
      next.units.push({ id: next.nextId++, key: type.key, cost: type.cost, health: type.maxHealth, maxHealth: type.maxHealth });
    }
    return next;
  }
  function startBattle(catalog, random = Math.random) {
    return spawnAffordable({ ...createBattle(), active: true, score: 1, bank: START_BANK }, catalog, random);
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
    return { state: spawnAffordable(next, catalog, random), killed: true, reward, damage: dealt };
  }
  return { START_BANK, MAX_UNITS, MAX_ALLIES, ALLY_HEALTH, ALLY_KEY, createAllies, recruitAlly, damageAlly,
    CATALOG, PRESETS, makeCatalog, loadCatalog, createBattle, startBattle, spawnAffordable, damageUnit };
});
