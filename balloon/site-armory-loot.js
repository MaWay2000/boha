(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteArmoryLoot = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const reward = (id, name, description, kind, amount = 1, key = id) => Object.freeze({ id, name, description, kind, amount, key });
  const CATALOG = Object.freeze([
    reward('power250', 'Power Cache', '+250 power.', 'power', 250),
    reward('power500', 'Power Chest', '+500 power.', 'power', 500),
    reward('power750', 'Power Vault', '+750 power.', 'power', 750),
    reward('power1000', 'Jackpot', '+1,000 power.', 'power', 1000),
    reward('fighter1', 'Wingman', '+250 power and 1 friendly fighter.', 'fighters', 1),
    reward('fighter2', 'Backup Pair', '+250 power and 2 friendly fighters.', 'fighters', 2),
    reward('fighter3', 'Strike Team', '+250 power and 3 friendly fighters.', 'fighters', 3),
    reward('fighter4', 'Full Squad', '+250 power and 4 friendly fighters; surplus goes to reserves.', 'fighters', 4),
    reward('repair', 'Field Workshop', '+250 power and a full repair for all living friendlies.', 'repair'),
    reward('heal50', 'Repair Kit', '+250 power and +50 HP for each living friendly, capped at max HP.', 'heal', 50),
    reward('reload', 'Ammo Drop', '+250 power and an instant reload for all guns.', 'reload'),
    reward('doubleDamage', 'Double Damage', '+250 power and ×2 player gun damage for 30 active seconds.', 'timed'),
    reward('rapidFire', 'Rapid Fire', '+250 power and 50% shorter player reloads for 30 active seconds.', 'timed'),
    reward('allyFury', 'Army Fury', '+250 power and ×2 friendly damage for 30 active seconds.', 'timed'),
    reward('allyHaste', 'Army Overdrive', '+250 power and 50% shorter friendly firing intervals for 30 active seconds.', 'timed'),
    reward('shield', 'Army Shield', '+250 power and invulnerable friendlies for 30 active seconds.', 'timed'),
    reward('slowEnemies', 'Stasis Field', '+250 power and 50% slower enemies for 30 active seconds.', 'timed'),
    reward('weakenEnemies', 'Enemy Jammer', '+250 power and 50% less enemy damage for 30 active seconds.', 'timed'),
    reward('wideBlast', 'Wide Blast', '+250 power and 50% larger cannon splash radius for 30 active seconds.', 'timed'),
    reward('wideFlame', 'Firestorm', '+250 power and 50% larger flame cone and splash for 30 active seconds.', 'timed'),
    reward('mgBoost', 'Machinegun Boost', '+250 power and 50% more machinegun damage for 30 active seconds.', 'timed'),
    reward('cannonBoost', 'Cannon Boost', '+250 power and 50% more cannon damage for 30 active seconds.', 'timed'),
    reward('laserBoost', 'Laser Boost', '+250 power and 50% more laser damage for 30 active seconds.', 'timed'),
    reward('rocketBoost', 'Rocket Boost', '+250 power and 50% more rocket damage for 30 active seconds.', 'timed'),
    reward('flamerBoost', 'Flamer Boost', '+250 power and 50% more flamer damage for 30 active seconds.', 'timed'),
    reward('health10', 'Reinforced Hulls', '+250 power and passive +10 max/current HP for all living and future friendlies (cap +200).', 'passive', 10, 'health'),
    reward('damage10', 'Weapon Tuning', '+250 power and passive +10% player damage (cap +100%).', 'passive', 10, 'damage'),
    reward('allyDamage10', 'Veteran Crews', '+250 power and passive +10% friendly damage (cap +100%).', 'passive', 10, 'allyDamage'),
    reward('reload5', 'Quick Loaders', '+250 power and passive 5 percentage points shorter player reloads (cap 40%).', 'passive', 5, 'reload'),
    reward('armor5', 'Reactive Armor', '+250 power and passive 5 percentage points less damage to friendlies (cap 50%).', 'passive', 5, 'armor')
  ]);
  const BY_ID = Object.freeze(Object.fromEntries(CATALOG.map(item => [item.id, item])));
  const CAPS = Object.freeze({ health: 200, damage: 100, allyDamage: 100, reload: 40, armor: 50 });
  const GUN_BOOSTS = Object.freeze({ machinegun: 'mgBoost', cannon: 'cannonBoost', laser: 'laserBoost', rockets: 'rocketBoost', flamer: 'flamerBoost' });
  const createEffects = () => ({ timed: {}, passive: { health: 0, damage: 0, allyDamage: 0, reload: 0, armor: 0 } });
  const validRewards = counts => !!counts && typeof counts === 'object' && !Array.isArray(counts) &&
    Object.entries(counts).every(([id, count]) => Object.hasOwn(BY_ID, id) && Number.isSafeInteger(count) && count > 0);
  function roll(random = Math.random) {
    const value = random(), fraction = Number.isFinite(value) ? Math.max(0, Math.min(.999999999, value)) : 0;
    return CATALOG[Math.floor(fraction * CATALOG.length)];
  }
  function apply(effects, counts) {
    if (!validRewards(counts)) return effects;
    const next = { timed: { ...effects.timed }, passive: { ...effects.passive } };
    for (const [id, count] of Object.entries(counts)) {
      const item = BY_ID[id];
      if (item.kind === 'timed') next.timed[id] = 30000; // Refresh, never multiply the magnitude or bank duration.
      if (item.kind === 'passive') next.passive[item.key] = Math.min(CAPS[item.key], next.passive[item.key] + count * item.amount);
    }
    return next;
  }
  function tick(effects, elapsed) {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return effects;
    return { ...effects, timed: Object.fromEntries(Object.entries(effects.timed).map(([key, remaining]) => [key, Math.max(0, remaining - elapsed)]).filter(([, remaining]) => remaining > 0)) };
  }
  function modifiers(effects = createEffects(), weapon) {
    const active = id => (effects.timed[id] || 0) > 0, p = effects.passive;
    const slot = GUN_BOOSTS[weapon];
    return { damage: (1 + p.damage / 100) * (active('doubleDamage') ? 2 : 1) * (active(slot) ? 1.5 : 1),
      reload: (1 - p.reload / 100) * (active('rapidFire') ? .5 : 1),
      allyDamage: (1 + p.allyDamage / 100) * (active('allyFury') ? 2 : 1),
      allyReload: active('allyHaste') ? .5 : 1,
      enemyDamage: active('shield') ? 0 : (1 - p.armor / 100) * (active('weakenEnemies') ? .5 : 1),
      enemySpeed: active('slowEnemies') ? .5 : 1,
      cannonRadius: active('wideBlast') ? 1.5 : 1, flameArea: active('wideFlame') ? 1.5 : 1 };
  }
  function summary(effects) {
    return [...Object.entries(effects.timed).map(([id, time]) => `${BY_ID[id].name} ${Math.ceil(time / 1000)}s`),
      ...Object.entries(effects.passive).filter(([, amount]) => amount > 0).map(([key, amount]) => ({
        health: `Army +${amount} HP`, damage: `Guns +${amount}%`, allyDamage: `Army +${amount}% damage`,
        reload: `Reload −${amount}%`, armor: `Army armor ${amount}%`
      })[key])].join(' · ');
  }
  return { CATALOG, BY_ID, CAPS, GUN_BOOSTS, createEffects, validRewards, roll, apply, tick, modifiers, summary };
});
