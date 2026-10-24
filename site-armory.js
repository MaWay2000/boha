(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./site-armory-audio.js') : root.SiteArmoryAudio,
    typeof module === 'object' && module.exports ? require('./site-armory-battle.js') : root.SiteArmoryBattle);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) api.mount(root);
})(typeof globalThis === 'object' ? globalThis : this, function (audioModule, battleModule) {
  'use strict';
  const WEAPONS = Object.freeze({
    machinegun: Object.freeze({ name: 'Machine gun', damage: 12, pellets: 3, radius: 43, hole: 14, cooldown: 160 }),
    cannon: Object.freeze({ name: 'Heavy cannon', damage: 55, pellets: 1, radius: 145, hole: 42, cooldown: 3000, splashRadius: 200, splashFraction: .5 }),
    laser: Object.freeze({ name: 'Pulse laser', damage: 34, pellets: 1, radius: 100, hole: 21, cooldown: 1000 }),
    rockets: Object.freeze({ name: 'Rockets', damage: 75, pellets: 2, radius: 125, hole: 34, cooldown: 1000 })
  });
  const MAX_MARKS = 48;
  const BALLOON_MAX_HEALTH = 1000, BALLOON_RESPAWN_MS = 5000;
  const ROCKET_SPEED = 1600, ROCKET_IMPACT_DEADLINE_MS = 3000;
  function homeRocket(point, target, elapsed) {
    const dx = target.x - point.x, dy = target.y - point.y, distance = Math.hypot(dx, dy);
    const step = ROCKET_SPEED * Math.max(0, Math.min(.05, elapsed));
    const arrived = distance <= Math.max(12, step);
    return { x: arrived ? target.x : point.x + dx / distance * step,
      y: arrived ? target.y : point.y + dy / distance * step, angle: Math.atan2(dy, dx), arrived };
  }
  const UPGRADE_MILESTONES = Object.freeze([
    0, 500, 1500, 3000, 6000, 10000, 15000, 22000, 30000, 40000,
    52000, 66000, 82000, 100000, 120000, 145000, 175000, 210000, 250000, 300000
  ]);
  function upgradeProgress(power = 0) {
    const earned = Number.isFinite(power) ? Math.max(0, power) : 0;
    let tier = 0;
    while (tier + 1 < UPGRADE_MILESTONES.length && earned >= UPGRADE_MILESTONES[tier + 1]) tier++;
    const current = UPGRADE_MILESTONES[tier], next = UPGRADE_MILESTONES[tier + 1] ?? null;
    return { level: tier + 1, bonusPercent: tier * 25, earned, next,
      remaining: next == null ? 0 : next - earned,
      progress: next == null ? 1 : (earned - current) / (next - current) };
  }
  function weaponProfile(state, weapon) {
    if (!Object.hasOwn(WEAPONS, weapon)) return null;
    const base = WEAPONS[weapon], upgrade = upgradeProgress(state.powerEarned);
    return { ...base, ...upgrade, shotDamage: Math.round(base.damage * base.pellets * (1 + upgrade.bonusPercent / 100)) };
  }
  function cannonBlast(targets, x, y, primaryId, profile) {
    const splash = Math.round(profile.shotDamage * profile.splashFraction);
    return targets.filter(target => target.id === primaryId || Math.hypot(target.x - x, target.y - y) <= profile.splashRadius)
      .map(target => ({ ...target, damage: target.id === primaryId ? profile.shotDamage : splash }));
  }
  function documentPoint(x, y, scrollX = 0, scrollY = 0) {
    return { x: x + (Number.isFinite(scrollX) ? scrollX : 0), y: y + (Number.isFinite(scrollY) ? scrollY : 0) };
  }
  function createState() {
    return { weapon: null, health: BALLOON_MAX_HEALTH, bossKills: 0, hits: 0, shots: 0, lastShot: -Infinity,
      lastShots: Object.fromEntries(Object.keys(WEAPONS).map(key => [key, -Infinity])),
      unitDamage: 0, lastUnitHit: null, powerEarned: 0, allyStats: { damage: 0, hits: 0, kills: 0 },
      weaponStats: Object.fromEntries(Object.keys(WEAPONS).map(key => [key, { damage: 0, hits: 0, kills: 0 }])) };
  }
  function reloadState(state, weapon, now) {
    const spec = Object.hasOwn(WEAPONS, weapon) ? WEAPONS[weapon] : null;
    if (!spec || !Number.isFinite(now)) return { progress: 1, remainingMs: 0, ready: true };
    const last = state.lastShots?.[weapon] ?? state.lastShot;
    const remainingMs = Math.max(0, Math.min(spec.cooldown, spec.cooldown - (now - last)));
    return { progress: 1 - remainingMs / spec.cooldown, remainingMs, ready: remainingMs === 0 };
  }
  function hitBalloon(x, y, box, destroyed = false) {
    if (destroyed || !box || box.width <= 0 || box.height <= 0) return false;
    // Ignore the transparent corners and narrow suspension ropes/basket.
    const nx = (x - box.left - box.width * .5) / (box.width * .42);
    const ny = (y - box.top - box.height * .39) / (box.height * .38);
    return nx * nx + ny * ny <= 1;
  }
  function fire(state, hit, now) {
    const weapon = weaponProfile(state, state.weapon);
    if (!weapon || !Number.isFinite(now) || !reloadState(state, state.weapon, now).ready) return { state, fired: false, destroyed: false };
    const damage = hit && state.health > 0 ? weapon.shotDamage : 0;
    const next = { ...state, shots: state.shots + 1, lastShot: now, lastShots: { ...state.lastShots, [state.weapon]: now },
      hits: state.hits + (damage > 0 ? 1 : 0), health: Math.max(0, state.health - damage) };
    return { state: next, fired: true, destroyed: state.health > 0 && next.health === 0 };
  }
  function crackPaths(random = Math.random, rays = 9) {
    const paths = [];
    for (let i = 0; i < rays; i++) {
      const angle = (i + random() * .5) * Math.PI * 2 / rays;
      const reach = 54 + random() * 41, mid = reach * .45;
      const x = Math.cos(angle), y = Math.sin(angle), bend = (random() - .5) * 13;
      const mx = x * mid - y * bend, my = y * mid + x * bend;
      paths.push(`M0 0 L${mx.toFixed(1)} ${my.toFixed(1)} L${(x * reach).toFixed(1)} ${(y * reach).toFixed(1)}`);
      const fork = angle + (random() > .5 ? .5 : -.5);
      paths.push(`M${mx.toFixed(1)} ${my.toFixed(1)} l${(Math.cos(fork) * reach * .3).toFixed(1)} ${(Math.sin(fork) * reach * .3).toFixed(1)}`);
      if (i % 2 === 0) {
        const next = angle + Math.PI * 2 / rays;
        paths.push(`M${(x * mid).toFixed(1)} ${(y * mid).toFixed(1)} L${(Math.cos(next) * mid * .8).toFixed(1)} ${(Math.sin(next) * mid * .8).toFixed(1)}`);
      }
    }
    return paths;
  }
  function mount(win) {
    const doc = win.document, rack = doc.getElementById('siteArmory');
    const balloon = doc.getElementById('siteNewsBalloon'), shield = doc.getElementById('armoryShield');
    if (!rack || !balloon || !shield || rack.dataset.mounted) return;
    rack.dataset.mounted = 'true';
    const damage = doc.getElementById('armoryDamage'), hud = doc.getElementById('armoryHud');
    const targetLayer = doc.getElementById('armoryTargets'), battleStats = doc.getElementById('armoryBattleStats');
    const unitNodes = new Map();
    const allyNodes = new Map();
    let allies = battleModule.createAllies();
    const rocketFlights = new Map();
    let rocketFrame = null, rocketPrevious = null, nextRocketId = 1;
    let battle = battleModule.createBattle(), catalog = battleModule.CATALOG, catalogError = false;
    let battleFrame = null, battlePrevious = null, browsingScroll = null, balloonRespawnTimer = null;
    const status = doc.getElementById('armoryStatus'), name = doc.getElementById('armoryWeaponName');
    const fireButton = doc.getElementById('armoryFire'), off = doc.getElementById('armoryOff'), repair = doc.getElementById('armoryRepair');
    const soundButton = doc.getElementById('armorySound');
    const sound = audioModule?.createAudio(win, info => {
      if (!soundButton) return;
      soundButton.disabled = !info.available;
      soundButton.textContent = !info.available ? 'Sound unavailable' : info.enabled ? 'Sound: on' : 'Sound: off';
      soundButton.setAttribute('aria-pressed', String(info.enabled && info.available));
      soundButton.dataset.audioState = info.state;
      if (info.lastSound) soundButton.dataset.lastSound = info.lastSound;
    });
    if (!sound && soundButton) { soundButton.disabled = true; soundButton.textContent = 'Sound unavailable'; }
    const weaponButtons = [...rack.querySelectorAll('[data-weapon]')];
    const reloadViews = weaponButtons.map(button => ({ button, weapon: button.dataset.weapon,
      bar: doc.getElementById('armoryReload-' + button.dataset.weapon),
      label: doc.getElementById('armoryReloadLabel-' + button.dataset.weapon) }));
    const frames = [...doc.querySelectorAll('iframe')].map(node => ({ node, inert: node.inert }));
    let state = createState();
    let displayedLevel = 1;
    let held = null, holdTimer = null, reloadTimer = null;
    const marks = [], transient = new Set(), timers = new Set();
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
    const localPreview = ['127.0.0.1', 'localhost', '[::1]'].includes(win.location?.hostname);
    const blocked = () => !!doc.querySelector('dialog[open]') || doc.body.classList.contains('replay-analyzer-modal-open') || doc.body.classList.contains('radio-playlist-open');
    const event = () => balloon.dispatchEvent(new win.CustomEvent('boha:news-balloon-state'));
    function syncScrollLock() {
      const roots = [doc.documentElement, doc.body];
      if (state.weapon && !browsingScroll) {
        browsingScroll = { x: win.scrollX || 0, y: win.scrollY || 0,
          locked: roots.map(root => root.classList.contains('armory-scroll-locked')) };
        roots.forEach(root => root.classList.add('armory-scroll-locked'));
        win.scrollTo?.({ left: 0, top: 0, behavior: 'instant' });
        syncDamageScroll();
      } else if (!state.weapon && browsingScroll) {
        const saved = browsingScroll; browsingScroll = null;
        roots.forEach((root, i) => { if (!saved.locked[i]) root.classList.remove('armory-scroll-locked'); });
        win.scrollTo?.({ left: saved.x, top: saved.y, behavior: 'instant' });
        syncDamageScroll();
      }
    }
    function arena() {
      return { maxX: Math.max(12, (doc.documentElement?.clientWidth || 1200) - 136),
        maxY: Math.max(20, Math.min(300, (win.innerHeight || 800) - (hud.offsetHeight || 170) - 24) - 112) };
    }
    function newPosition() {
      const limits = arena(); let point;
      for (let attempt = 0; attempt < 40; attempt++) {
        point = { x: 12 + Math.random() * Math.max(0, limits.maxX - 12), y: 20 + Math.random() * Math.max(0, limits.maxY - 20),
          vx: (Math.random() < .5 ? -1 : 1) * (14 + Math.random() * 16), vy: (Math.random() < .5 ? -1 : 1) * (6 + Math.random() * 12) };
        const toolbar = rack.getBoundingClientRect();
        const overlapsToolbar = point.x < toolbar.right && point.x + 124 > toolbar.left && point.y < toolbar.bottom && point.y + 100 > toolbar.top;
        const overlapsUnit = [...unitNodes.values(), ...allyNodes.values()].some(item => Math.abs(item.point.x - point.x) < 124 && Math.abs(item.point.y - point.y) < 100);
        if (!overlapsToolbar && !overlapsUnit) break;
      }
      return point;
    }
    function placeUnit(item) { item.node.style.transform = `translate3d(${item.point.x.toFixed(2)}px, ${item.point.y.toFixed(2)}px, 0)`; }
    function stopBattleMotion() {
      if (battleFrame != null) win.cancelAnimationFrame?.(battleFrame);
      battleFrame = null; battlePrevious = null;
    }
    function syncBattleMotion() {
      stopBattleMotion();
      if (!battle.active || !state.weapon || doc.hidden || blocked() || !unitNodes.size || !win.requestAnimationFrame) return;
      const tick = now => {
        battleFrame = null;
        if (!state.weapon || doc.hidden || blocked() || !battle.active) { battlePrevious = null; return; }
        const dt = battlePrevious == null ? 0 : Math.min((now - battlePrevious) / 1000, .05); battlePrevious = now;
        const limits = arena();
        for (const item of unitNodes.values()) {
          if (localPreview || !reduced.matches) { item.point.x += item.point.vx * dt; item.point.y += item.point.vy * dt; }
          if (item.point.x < 12 || item.point.x > limits.maxX) item.point.vx *= -1;
          if (item.point.y < 20 || item.point.y > limits.maxY) item.point.vy *= -1;
          item.point.x = Math.max(12, Math.min(limits.maxX, item.point.x)); item.point.y = Math.max(20, Math.min(limits.maxY, item.point.y));
          placeUnit(item);
        }
        if (stepArmy(now, dt)) { sync(); return; }
        battleFrame = win.requestAnimationFrame(tick);
      };
      battleFrame = win.requestAnimationFrame(tick);
    }
    function syncBattleView() {
      if (battleStats) battleStats.hidden = !battle.active;
      if (targetLayer) { targetLayer.hidden = (!battle.active && !allies.units.length) || !state.weapon || doc.hidden || blocked(); targetLayer.dataset.armed = String(!!state.weapon); }
      const text = (id, value) => { const node = doc.getElementById(id); if (node) node.textContent = String(value); };
      text('armoryScore', battle.score); text('armoryBank', battle.bank); text('armoryTargetCount', `${battle.units.length} / ${battleModule.MAX_UNITS}`);
      text('armoryUnitDamage', state.unitDamage);
      text('armoryAllyCount', allies.units.length); text('armoryAllyReserves', allies.reserves);
      text('armoryAllyKills', state.allyStats.kills); text('armoryAllyDamage', state.allyStats.damage);
      const armyStats = doc.getElementById('armoryAlliesStats'); if (armyStats) armyStats.hidden = !allies.created;
      text('armoryLastHit', state.lastUnitHit || 'Unit damage counts HP actually removed; misses and the balloon do not count.');
      for (const weapon of Object.keys(WEAPONS)) {
        text('armoryDamage-' + weapon, state.weaponStats[weapon].damage);
        text('armoryKills-' + weapon, state.weaponStats[weapon].kills);
      }
      text('armoryBattleNote', catalogError ? 'Unit data unavailable. Repair page to reset.'
        : battle.lastReward ? `Last kill +${battle.lastReward} power · new targets spend the bank · max 8 on screen`
          : 'Balloon +1 score · starting budget 500 power · unit kills pay 1.5× their cost');
      for (const [id, item] of unitNodes) if (!battle.units.some(unit => unit.id === id)) { item.node.remove(); unitNodes.delete(id); }
      for (const unit of battle.units) {
        let item = unitNodes.get(unit.id);
        if (!item && targetLayer) {
          const type = catalog.find(type => type.key === unit.key);
          const node = doc.createElement('div'); node.className = 'armory-unit'; node.dataset.unitId = String(unit.id); node.dataset.unitKey = unit.key; node.dataset.team = 'enemy';
          node.title = `${type?.name || unit.key} · ${unit.cost} power · kill reward ${unit.cost * 1.5}`;
          const visual = doc.createElement('span'); visual.className = 'armory-unit-visual';
          const placeholder = doc.createElement('i'); placeholder.className = 'armory-unit-placeholder'; visual.append(placeholder);
          const label = doc.createElement('span'); label.className = 'armory-unit-name'; label.textContent = type?.name || unit.key;
          const cost = doc.createElement('span'); cost.className = 'armory-unit-cost'; cost.textContent = unit.cost + ' power';
          const health = doc.createElement('progress'); health.className = 'armory-unit-health'; health.max = unit.maxHealth;
          node.append(visual, label, cost, health);
          item = { node, health, point: newPosition(), nextFire: win.performance.now() + 1500 }; unitNodes.set(unit.id, item); targetLayer.append(node); placeUnit(item);
        }
        if (item) item.health.value = unit.health;
      }
      for (const [id, item] of allyNodes) if (!allies.units.some(unit => unit.id === id)) { item.node.remove(); allyNodes.delete(id); }
      for (const unit of allies.units) {
        let item = allyNodes.get(unit.id);
        if (!item && targetLayer) {
          const node = doc.createElement('div'); node.className = 'armory-unit'; node.dataset.unitId = 'ally-' + unit.id;
          node.dataset.unitKey = unit.key; node.dataset.team = 'ally'; node.dataset.renderSeed = String(10000 + unit.id);
          node.title = 'Friendly Heavy Cannon · 120 HP · automatically fights enemy tanks';
          const visual = doc.createElement('span'); visual.className = 'armory-unit-visual';
          const placeholder = doc.createElement('i'); placeholder.className = 'armory-unit-placeholder'; visual.append(placeholder);
          const label = doc.createElement('span'); label.className = 'armory-unit-name'; label.textContent = 'ALLY · Heavy Cannon';
          const badge = doc.createElement('span'); badge.className = 'armory-unit-cost'; badge.textContent = 'ALLY';
          const health = doc.createElement('progress'); health.className = 'armory-unit-health'; health.max = unit.maxHealth;
          node.append(visual, label, badge, health);
          const point = newPosition(); point.y = arena().maxY;
          item = { node, health, point, nextFire: win.performance.now() + 1200 };
          allyNodes.set(unit.id, item); targetLayer.append(node); placeUnit(item);
        }
        if (item) item.health.value = unit.health;
      }
      syncBattleMotion();
    }
    function armyBeam(from, to, team) {
      if (reduced.matches) return;
      const beam = at(doc.createElement('i'), from.x + 62, from.y + 40);
      beam.className = 'armory-army-shot'; beam.dataset.team = team;
      beam.style.width = Math.hypot(to.x - from.x, to.y - from.y) + 'px';
      beam.style.transform = `rotate(${Math.atan2(to.y - from.y, to.x - from.x)}rad)`;
      ephemeral(beam, 140);
    }
    function stepArmy(now, dt) {
      let changed = false;
      for (const [id, item] of allyNodes) {
        if (!allies.units.some(unit => unit.id === id)) continue;
        const target = nearestTank(item.point.x + 62, item.point.y + 40);
        if (!target) continue;
        const dx = target[1].point.x - item.point.x, dy = target[1].point.y - item.point.y, distance = Math.hypot(dx, dy);
        if ((localPreview || !reduced.matches) && distance > 100) {
          const step = Math.min(distance - 100, 35 * dt), limits = arena();
          item.point.x = Math.max(12, Math.min(limits.maxX, item.point.x + dx / distance * step));
          item.point.y = Math.max(20, Math.min(limits.maxY, item.point.y + dy / distance * step)); placeUnit(item);
        }
        if (now >= item.nextFire) {
          item.nextFire = now + 1200; armyBeam(item.point, target[1].point, 'ally');
          const result = damageTank('allies', target[0], Math.round(18 * (1 + upgradeProgress(state.powerEarned).bonusPercent / 100)), target[1].point.x + 62, target[1].point.y + 40);
          if (result.killed) burst(target[1].point.x + 62, target[1].point.y + 40, true);
          changed ||= result.damage > 0;
        }
      }
      for (const [id, enemy] of unitNodes) {
        if (now < enemy.nextFire || !battle.units.some(unit => unit.id === id)) continue;
        let target = null, best = Infinity;
        for (const entry of allyNodes) {
          if (!allies.units.some(unit => unit.id === entry[0])) continue;
          const distance = Math.hypot(entry[1].point.x - enemy.point.x, entry[1].point.y - enemy.point.y);
          if (distance < best) { best = distance; target = entry; }
        }
        if (!target) continue;
        enemy.nextFire = now + 1500; armyBeam(enemy.point, target[1].point, 'enemy');
        const result = battleModule.damageAlly(allies, target[0], 12); allies = result.state; changed = true;
        if (result.killed) burst(target[1].point.x + 62, target[1].point.y + 40, true);
      }
      return changed;
    }
    function autoTarget() {
      if (battle.active) {
        const first = unitNodes.values().next().value;
        return first ? { x: first.point.x + 62, y: first.point.y + 40 } : null;
      }
      if (!state.health) return null;
      const box = balloon.getBoundingClientRect(); return { x: box.left + box.width * .5, y: box.top + box.height * .39 };
    }
    const restoreBalloon = () => {
      if (balloonRespawnTimer != null) win.clearTimeout(balloonRespawnTimer);
      balloonRespawnTimer = null;
      state = { ...state, health: BALLOON_MAX_HEALTH }; balloon.dataset.destroyed = 'false'; balloon.classList.remove('is-shot-down');
      balloon.dispatchEvent(new win.CustomEvent('boha:news-balloon-repaired')); event();
    };
    function respawnBalloonLater() {
      if (balloonRespawnTimer != null) win.clearTimeout(balloonRespawnTimer);
      balloonRespawnTimer = win.setTimeout(() => {
        balloonRespawnTimer = null;
        if (!state.health) { restoreBalloon(); sync(); }
      }, BALLOON_RESPAWN_MS);
    }
    function updateReload() {
      if (reloadTimer != null) win.clearTimeout(reloadTimer);
      reloadTimer = null;
      let loading = false;
      for (const view of reloadViews) {
        const reload = reloadState(state, view.weapon, win.performance.now());
        loading ||= !reload.ready;
        view.button.dataset.loading = String(!reload.ready);
        if (view.bar) view.bar.value = reload.progress;
        if (view.label) view.label.textContent = reload.ready ? 'Ready' : (Math.ceil(reload.remainingMs / 100) / 10).toFixed(1) + 's';
      }
      // Only update while a real cooldown is in progress; no permanent loop.
      if (loading && !doc.hidden) reloadTimer = win.setTimeout(updateReload, 50);
    }
    function sync() {
      syncScrollLock();
      shield.hidden = !state.weapon;
      hud.hidden = !state.weapon && !marks.length && !battle.active && !allies.created;
      fireButton.disabled = !state.weapon || (battle.active ? !battle.units.length : !state.health);
      fireButton.textContent = battle.active ? 'Fire at unit' : 'Fire at balloon';
      off.disabled = !state.weapon;
      // Keep keyboard focus out of nested documents while the shooting shield
      // covers them. Restore their original state immediately on disarm.
      for (const frame of frames) frame.node.inert = state.weapon ? true : frame.inert;
      name.textContent = state.weapon ? `${WEAPONS[state.weapon].name} · Lv ${upgradeProgress(state.powerEarned).level} · armed` : 'Target practice · safe';
      status.textContent = battle.active ? `${state.weapon ? 'Unit hunt' : 'Round paused — select a gun to resume'} · ${battle.unitKills} units destroyed · ${state.shots} shot${state.shots === 1 ? '' : 's'}`
        : state.health ? `Balloon boss ${state.health}/${BALLOON_MAX_HEALTH} · ${state.hits} hit${state.hits === 1 ? '' : 's'} · ${state.shots} shot${state.shots === 1 ? '' : 's'}${!state.weapon ? ' · normal browsing restored' : ''}`
        : 'Balloon boss defeated! Respawning in 5 seconds.';
      const bossHealth = doc.getElementById('armoryBossHealth'), bossStatus = doc.getElementById('armoryBossStatus');
      if (bossHealth) { bossHealth.max = BALLOON_MAX_HEALTH; bossHealth.value = state.health; }
      if (bossStatus) bossStatus.textContent = `Balloon boss · ${state.health}/${BALLOON_MAX_HEALTH} HP · ${state.bossKills} defeated${!state.health ? ' · respawning in 5s' : ''}`;
      for (const button of weaponButtons) button.setAttribute('aria-pressed', String(button.dataset.weapon === state.weapon));
      rack.dataset.armed = state.weapon || '';
      syncUpgrades();
      updateReload();
      syncBattleView();
    }
    function syncUpgrades() {
      const upgrade = upgradeProgress(state.powerEarned);
      for (const button of weaponButtons) {
        const profile = weaponProfile(state, button.dataset.weapon);
        button.dataset.level = String(upgrade.level);
        button.title = `${profile.name} · Lv ${profile.level} · ${profile.shotDamage} damage${button.dataset.weapon === 'rockets' ? ' per 2-rocket salvo · auto-lock tanks' : profile.pellets > 1 ? ' per burst' : ' per shot'} · ${profile.cooldown / 1000}s reload${button.dataset.weapon === 'cannon' ? ` · 50% splash (${Math.round(profile.shotDamage * profile.splashFraction)} damage) within ${profile.splashRadius}px · +1 friendly fighter` : ''} · hold to fire`;
        const badge = doc.getElementById('armoryLevel-' + button.dataset.weapon);
        if (badge) badge.textContent = 'Lv ' + upgrade.level;
      }
      const note = doc.getElementById('armoryUpgradeNote'), bar = doc.getElementById('armoryUpgradeProgress');
      if (note) note.textContent = `All guns Lv ${upgrade.level}/${UPGRADE_MILESTONES.length} · +${upgrade.bonusPercent}% damage · ${upgrade.earned} power earned · ${upgrade.next == null ? 'MAX LEVEL' : `${upgrade.remaining} to Lv ${upgrade.level + 1}`}`;
      if (bar) { bar.value = upgrade.progress; bar.setAttribute('aria-valuetext', upgrade.next == null ? 'Maximum weapon level' : `${upgrade.remaining} more earned power to level ${upgrade.level + 1}`); }
      if (upgrade.level !== displayedLevel) {
        const notice = doc.getElementById('armoryUpgradeStatus');
        if (notice) notice.textContent = upgrade.level > displayedLevel ? `All guns upgraded to Lv ${upgrade.level}! +${upgrade.bonusPercent}% damage.` : '';
        displayedLevel = upgrade.level;
      }
    }
    function select(weapon) {
      if (weapon !== null && !Object.hasOwn(WEAPONS, weapon)) return;
      stopHolding();
      state = { ...state, weapon: weapon === state.weapon ? null : weapon };
      if (!state.weapon) clearRocketFlights();
      if (state.weapon) sound?.select?.(state.weapon); else sound?.stop();
      if (!state.weapon && !state.health) restoreBalloon();
      sync();
    }
    const ephemeral = (node, duration) => {
      transient.add(node); damage.append(node);
      // Hard bounds even when timers are throttled in a background tab.
      if (transient.size > 32) { const oldest = transient.values().next().value; oldest.remove(); transient.delete(oldest); }
      const timer = win.setTimeout(() => { node.remove(); transient.delete(node); timers.delete(timer); }, duration);
      timers.add(timer);
    };
    const syncDamageScroll = () => {
      damage.style.setProperty('--armory-scroll-x', (win.scrollX || 0) + 'px');
      damage.style.setProperty('--armory-scroll-y', (win.scrollY || 0) + 'px');
    };
    const at = (node, x, y) => {
      // Store the page position at impact, not its temporary viewport position.
      // A shared scroll offset moves all holes together without growing the page
      // or creating horizontal scrollbars from effects near an edge.
      const point = documentPoint(x, y, win.scrollX, win.scrollY);
      node.style.left = `calc(${point.x}px - var(--armory-scroll-x, 0px))`;
      node.style.top = `calc(${point.y}px - var(--armory-scroll-y, 0px))`;
      return node;
    };
    function mark(x, y, weapon) {
      const spec = WEAPONS[weapon], node = at(doc.createElement('div'), x, y);
      node.className = 'armory-mark'; node.dataset.kind = weapon;
      node.style.width = node.style.height = spec.radius * 2 + 'px';
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '-100 -100 200 200'); svg.classList.add('armory-cracks');
      for (const [i, data] of crackPaths(Math.random, weapon === 'machinegun' ? 6 : 11).entries()) {
        const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', data); if (i % 3 === 0) path.classList.add('crack-core'); svg.append(path);
      }
      const hole = doc.createElement('span'); hole.className = 'armory-crater';
      hole.style.setProperty('--hole', spec.hole + 'px'); hole.style.setProperty('--rotation', Math.random() * 360 + 'deg');
      node.append(svg, hole); damage.append(node); marks.push(node);
      if (marks.length > MAX_MARKS) marks.shift().remove();
    }
    function burst(x, y, destroyed) {
      if (reduced.matches) return;
      const ring = at(doc.createElement('div'), x, y); ring.className = 'armory-burst'; ephemeral(ring, 400);
      for (let i = 0; i < (destroyed ? 12 : 5); i++) {
        const spark = at(doc.createElement('i'), x, y); spark.className = destroyed ? 'armory-debris' : 'armory-spark';
        const angle = Math.PI * 2 * i / (destroyed ? 12 : 5), length = destroyed ? 90 + Math.random() * 90 : 20 + Math.random() * 30;
        spark.style.setProperty('--dx', Math.cos(angle) * length + 'px');
        spark.style.setProperty('--dy', Math.sin(angle) * length + (destroyed ? 90 : 0) + 'px');
        spark.style.setProperty('--spin', Math.random() * 540 + 'deg'); ephemeral(spark, destroyed ? 950 : 450);
      }
    }
    function rocketSalvo(x, y) {
      if (reduced.matches && !localPreview) return;
      const button = weaponButtons.find(button => button.dataset.weapon === 'rockets');
      const origin = button.getBoundingClientRect();
      const startX = origin.left + origin.width / 2, startY = origin.top + Math.min(28, origin.height / 2);
      const dx = x - startX, dy = y - startY, angle = Math.atan2(dy, dx);
      for (let i = 0; i < 2; i++) {
        // Two separate launch trails, one from either side of the Lancer turret.
        const side = i === 0 ? -6 : 6;
        const rocket = at(doc.createElement('i'), startX - Math.sin(angle) * side, startY + Math.cos(angle) * side);
        rocket.className = 'armory-rocket'; rocket.dataset.projectileIndex = String(i + 1);
        rocket.style.setProperty('--rocket-dx', dx + 'px'); rocket.style.setProperty('--rocket-dy', dy + 'px');
        rocket.style.setProperty('--rocket-angle', angle + 'rad'); rocket.style.setProperty('--rocket-delay', (i * 70) + 'ms');
        ephemeral(rocket, 350 + i * 70);
      }
    }
    function cannonBlastEffect(x, y, radius) {
      if (reduced.matches && !localPreview) return;
      const ring = at(doc.createElement('div'), x, y); ring.className = 'armory-cannon-blast';
      ring.style.width = ring.style.height = radius * 2 + 'px'; ephemeral(ring, 500);
    }
    function nearestTank(x, y) {
      let closest = null, best = Infinity;
      for (const entry of unitNodes) {
        if (!battle.units.some(unit => unit.id === entry[0])) continue;
        const point = entry[1].point, distance = (point.x + 62 - x) ** 2 + (point.y + 40 - y) ** 2;
        if (distance < best) { best = distance; closest = entry; }
      }
      return closest;
    }
    function updateRocketLocks() {
      const locked = new Set([...rocketFlights.values()].map(rocket => rocket.targetId));
      for (const [id, item] of unitNodes) item.node.dataset.rocketLock = String(locked.has(id));
    }
    function clearRocketFlights() {
      if (rocketFrame != null) win.cancelAnimationFrame?.(rocketFrame);
      rocketFrame = null; rocketPrevious = null;
      for (const rocket of rocketFlights.values()) rocket.node?.remove();
      rocketFlights.clear(); updateRocketLocks();
    }
    function damageTank(weapon, id, amount, x, y) {
      const unit = battle.units.find(unit => unit.id === id);
      if (!unit) return { damage: 0, killed: false };
      const result = battleModule.damageUnit(battle, id, amount, catalog);
      battle = result.state;
      state = { ...state, powerEarned: battle.earned };
      if (result.damage > 0) {
        const friendly = weapon === 'allies', stats = friendly ? state.allyStats : state.weaponStats[weapon];
        const unitName = catalog.find(type => type.key === unit.key)?.name || unit.key;
        const totals = { damage: stats.damage + result.damage, hits: stats.hits + 1, kills: stats.kills + Number(result.killed) };
        state = { ...state, hits: state.hits + Number(!friendly), unitDamage: state.unitDamage + result.damage,
          ...(friendly ? { allyStats: totals } : { weaponStats: { ...state.weaponStats, [weapon]: totals } }),
          lastUnitHit: `${friendly ? 'Friendly tank' : WEAPONS[weapon].name} → ${unitName}: ${result.damage} damage · ${Math.max(0, unit.health - result.damage)}/${unit.maxHealth} HP${result.killed ? ' · destroyed' : ''}` };
        const number = at(doc.createElement('span'), x, y); number.className = 'armory-hit-number'; number.textContent = '−' + result.damage;
        ephemeral(number, 700);
      }
      return result;
    }
    function rocketTarget(rocket) {
      const current = unitNodes.get(rocket.targetId);
      return current && battle.units.some(unit => unit.id === rocket.targetId)
        ? [rocket.targetId, current] : nearestTank(rocket.x, rocket.y);
    }
    function impactRocket(rocket, target) {
      if (!target) return;
      rocket.node?.remove(); rocketFlights.delete(rocket.id);
      const x = target[1].point.x + 62, y = target[1].point.y + 40;
      const result = damageTank('rockets', target[0], rocket.damage, x, y);
      if (result.damage > 0) burst(x, y, result.killed);
      sync();
    }
    function launchHomingRockets(target, profile) {
      const origin = weaponButtons.find(button => button.dataset.weapon === 'rockets').getBoundingClientRect();
      const startX = origin.left + origin.width / 2, startY = origin.top + Math.min(28, origin.height / 2);
      const now = win.performance.now();
      for (let i = 0; i < 2; i++) {
        if (rocketFlights.size >= 8) {
          const oldest = rocketFlights.values().next().value;
          // Bound rendered projectiles without silently throwing away a hit.
          impactRocket(oldest, rocketTarget(oldest));
          if (rocketFlights.size >= 8) break; // No enemy available: keep existing locks waiting.
        }
        const id = nextRocketId++, node = !reduced.matches || localPreview ? doc.createElement('i') : null;
        const rocket = { id, targetId: target[0], x: startX + (i === 0 ? -6 : 6), y: startY,
          launchAt: now + i * 70, impactDeadline: now + ROCKET_IMPACT_DEADLINE_MS,
          damage: i === 0 ? Math.ceil(profile.shotDamage / 2) : Math.floor(profile.shotDamage / 2), node };
        if (node) {
          node.className = 'armory-rocket is-homing'; node.dataset.projectileIndex = String(i + 1);
          node.dataset.targetId = String(target[0]); node.style.opacity = '0'; damage.append(node);
        }
        rocketFlights.set(id, rocket);
      }
      updateRocketLocks();
      if (rocketFrame != null) return;
      rocketPrevious = now;
      const tick = time => {
        rocketFrame = null;
        if (!state.weapon || doc.hidden || blocked()) { clearRocketFlights(); return; }
        const dt = Math.max(0, Math.min((time - rocketPrevious) / 1000, .05)); rocketPrevious = time;
        for (const rocket of rocketFlights.values()) {
          if (time < rocket.launchAt) continue;
          const target = rocketTarget(rocket);
          if (!target) continue; // Wait for an enemy, never turn a lost lock into a miss.
          rocket.targetId = target[0]; const targetNode = target[1];
          // Slow frames or repeatedly dying targets must not discard a rocket.
          if (time >= rocket.impactDeadline) { impactRocket(rocket, target); continue; }
          const step = homeRocket(rocket, { x: targetNode.point.x + 62, y: targetNode.point.y + 40 }, dt);
          rocket.x = step.x; rocket.y = step.y;
          if (rocket.node) {
            at(rocket.node, rocket.x, rocket.y); rocket.node.style.opacity = '1';
            rocket.node.style.transform = `rotate(${step.angle}rad)`; rocket.node.dataset.targetId = String(rocket.targetId);
          }
          if (step.arrived) {
            impactRocket(rocket, target);
          }
        }
        updateRocketLocks();
        if (rocketFlights.size) rocketFrame = win.requestAnimationFrame(tick); else rocketPrevious = null;
      };
      rocketFrame = win.requestAnimationFrame(tick);
    }
    function shoot(x, y) {
      if (!state.weapon || blocked() || doc.hidden || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const pointedTank = battle.active ? [...unitNodes].reverse().find(([, item]) => x >= item.point.x + 8 && x <= item.point.x + 116 && y >= item.point.y + 8 && y <= item.point.y + 77) : null;
      const target = state.weapon === 'rockets' && battle.active ? pointedTank || nearestTank(x, y) : pointedTank;
      if (state.weapon === 'rockets' && !target) {
        if (!state.health) return; // No valid target yet: do not waste the salvo or its cooldown.
        const box = balloon.getBoundingClientRect(); x = box.left + box.width * .5; y = box.top + box.height * .39;
      }
      const hit = !target && hitBalloon(x, y, balloon.getBoundingClientRect(), !state.health);
      const result = fire(state, hit, win.performance.now());
      if (!result.fired) return;
      const weapon = state.weapon, profile = weaponProfile(state, weapon); state = result.state;
      if (weapon === 'cannon') allies = battleModule.recruitAlly(allies);
      sound?.play(weapon);
      if (weapon === 'rockets' && target) { launchHomingRockets(target, profile); sync(); return; }
      if (weapon === 'rockets') rocketSalvo(x, y);
      let unitDestroyed = false;
      if (weapon === 'cannon') {
        // Snapshot victims before any kill spawns replacements. The primary
        // takes full damage once, everyone else in the blast takes half.
        const victims = cannonBlast(battle.units.map(unit => ({ id: unit.id,
          x: unitNodes.get(unit.id).point.x + 62, y: unitNodes.get(unit.id).point.y + 40 })), x, y, target?.[0], profile);
        for (const victim of victims) {
          const impact = damageTank('cannon', victim.id, victim.damage, victim.x, victim.y);
          unitDestroyed ||= impact.killed;
        }
        cannonBlastEffect(x, y, profile.splashRadius);
      } else if (target) {
        unitDestroyed = damageTank(weapon, target[0], profile.shotDamage, x, y).killed;
      }
      if (!hit && !target) for (let i = 0; i < WEAPONS[weapon].pellets; i++) {
        const spread = weapon === 'machinegun' ? 18 : 0;
        const pairOffset = weapon === 'rockets' ? (i === 0 ? -7 : 7) : 0;
        mark(x + pairOffset + (Math.random() - .5) * spread, y + pairOffset * .5 + (Math.random() - .5) * spread, weapon);
      }
      burst(x, y, result.destroyed || unitDestroyed);
      if (result.destroyed) {
        balloon.dataset.destroyed = 'true'; balloon.classList.add('is-shot-down');
        balloon.dispatchEvent(new win.CustomEvent('boha:news-balloon-destroyed')); event();
        state = { ...state, bossKills: state.bossKills + 1 };
        // Only the first boss starts the economy. Later defeats never reseed it.
        battle = battle.active ? { ...battle, score: battle.score + 1 } : battleModule.startBattle(catalog);
        respawnBalloonLater();
      }
      sync();
    }
    function reset() {
      stopHolding();
      clearRocketFlights();
      sound?.stop();
      marks.splice(0).forEach(node => node.remove());
      for (const timer of timers) win.clearTimeout(timer); timers.clear();
      for (const node of transient) node.remove(); transient.clear();
      battle = battleModule.createBattle();
      allies = battleModule.createAllies();
      const weapon = state.weapon; state = { ...createState(), weapon }; restoreBalloon(); sync();
    }
    for (const button of weaponButtons) button.addEventListener('click', () => select(button.dataset.weapon));
    off.addEventListener('click', () => select(null)); repair.addEventListener('click', reset);
    soundButton?.addEventListener('click', () => sound?.setEnabled(!sound.isEnabled()));
    function stopHolding() {
      const previous = held; held = null;
      if (holdTimer != null) win.clearTimeout(holdTimer);
      holdTimer = null; rack.dataset.firing = 'false';
      try { if (previous?.capture.hasPointerCapture?.(previous.id)) previous.capture.releasePointerCapture(previous.id); } catch {}
    }
    function repeatShot() {
      holdTimer = null;
      if (!held || !state.weapon || doc.hidden || blocked()) { stopHolding(); return; }
      if (held.autoAim) {
        const target = autoTarget();
        if (!target) { stopHolding(); return; }
        shoot(target.x, target.y);
      } else shoot(held.x, held.y);
      // One shot per interval, never a catch-up burst after a stalled frame.
      if (held) holdTimer = win.setTimeout(repeatShot,
        Math.max(state.weapon === 'rockets' ? 100 : 8, reloadState(state, state.weapon, win.performance.now()).remainingMs));
    }
    doc.addEventListener('pointerdown', e => {
      if (!state.weapon || held || e.button !== 0 || e.isPrimary === false || doc.hidden || blocked()) return;
      const autoAim = e.target === fireButton || !!e.target.closest?.('#armoryFire');
      if (!autoAim && e.target.closest?.('#siteArmory, #armoryHud, dialog')) return;
      if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
      e.preventDefault();
      const capture = autoAim ? fireButton : shield;
      held = { id: e.pointerId, x: e.clientX, y: e.clientY, autoAim, capture };
      try { capture.setPointerCapture?.(e.pointerId); } catch {}
      rack.dataset.firing = 'true'; repeatShot();
    }, true);
    doc.addEventListener('pointermove', e => {
      if (!held || e.pointerId !== held.id) return;
      if ((e.buttons & 1) === 0) { stopHolding(); return; }
      if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) { held.x = e.clientX; held.y = e.clientY; }
    }, true);
    const release = e => { if (held && (e.pointerId == null || e.pointerId === held.id)) stopHolding(); };
    doc.addEventListener('pointerup', release, true);
    doc.addEventListener('pointercancel', release, true);
    shield.addEventListener('lostpointercapture', release);
    fireButton.addEventListener('lostpointercapture', release);
    win.addEventListener('blur', () => { stopHolding(); clearRocketFlights(); sound?.stop(); });
    fireButton.addEventListener('click', e => {
      // Mouse/touch already fired on pointerdown. Preserve keyboard activation.
      if (e.detail !== 0) return;
      const target = autoTarget(); if (target) shoot(target.x, target.y);
    });
    doc.addEventListener('click', e => {
      if (!state.weapon || blocked() || e.target.closest?.('#siteArmory, #armoryHud, dialog')) return;
      // The armed shield also covers nested frames, so shooting cannot follow a
      // leaderboard link or submit a form. No listeners are injected into frames.
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.button === 0 && e.detail === 0) shoot(e.clientX, e.clientY);
    }, true);
    doc.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.weapon) { select(null); e.preventDefault(); return; }
      if (blocked() || e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const key = ['machinegun', 'cannon', 'laser', 'rockets'][Number(e.key) - 1];
      if (key) { select(key); e.preventDefault(); }
    });
    // A modal can open programmatically while armed. Disarm before it appears;
    // native dialogs and the analyzer/radio must remain fully usable.
    const observer = new win.MutationObserver(() => { if (state.weapon && blocked()) select(null); });
    observer.observe(doc.body, { attributes: true, attributeFilter: ['class', 'open'], subtree: true });
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) { stopHolding(); clearRocketFlights(); sound?.stop(); } updateReload(); syncBattleView(); });
    win.addEventListener('pageshow', updateReload);
    win.addEventListener('scroll', syncDamageScroll, { passive: true });
    win.addEventListener('resize', syncDamageScroll);
    win.addEventListener('resize', syncBattleView);
    win.addEventListener('pageshow', syncDamageScroll);
    win.addEventListener('pagehide', () => { select(null); reset(); sound?.dispose(); });
    const ready = battleModule.loadCatalog(win).then(next => {
      catalog = next;
      if (battle.active) battle = battleModule.spawnAffordable(battle, catalog);
      sync();
    }).catch(() => { catalogError = true; sync(); });
    syncDamageScroll(); sync();
    return { select, shoot, reset, ready, getState: () => ({ ...state, lastShots: { ...state.lastShots }, allyStats: { ...state.allyStats },
      weaponStats: Object.fromEntries(Object.entries(state.weaponStats).map(([key, stats]) => [key, { ...stats }])) }),
      getBattle: () => ({ ...battle, units: battle.units.map(unit => ({ ...unit, point: { ...unitNodes.get(unit.id)?.point } })) }),
      getProjectiles: () => [...rocketFlights.values()].map(({ id, targetId, x, y, damage }) => ({ id, targetId, x, y, damage })),
      getAllies: () => ({ ...allies, units: allies.units.map(unit => ({ ...unit, point: { ...allyNodes.get(unit.id)?.point } })) }) };
  }
  return { WEAPONS, MAX_MARKS, BALLOON_MAX_HEALTH, BALLOON_RESPAWN_MS, UPGRADE_MILESTONES, upgradeProgress, weaponProfile, cannonBlast, homeRocket, createState, reloadState, documentPoint, hitBalloon, fire, crackPaths, mount };
});
