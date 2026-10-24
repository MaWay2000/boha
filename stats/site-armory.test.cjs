const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { WEAPONS, MAX_MARKS, FLAME_SPRITE, BALLOON_MAX_HEALTH, BALLOON_RESPAWN_MS, UPGRADE_MILESTONES, upgradeProgress, weaponProfile, cannonBlast, flameShape, flameVictims, flameParticles, flameSplashParticles, homeRocket, createState, reloadState, documentPoint, hitBalloon, fire, crackPaths, mount } = require('../site-armory.js');

test('five distinct optional weapons start disarmed with no damage', () => {
  assert.deepEqual(Object.keys(WEAPONS), ['machinegun', 'cannon', 'laser', 'rockets', 'flamer']);
  const initial = createState();
  assert.equal(initial.weapon, null); assert.equal(initial.health, BALLOON_MAX_HEALTH);
  assert.equal(fire(initial, true, 100).fired, false);
  assert.equal(fire({ ...initial, weapon: 'constructor' }, true, 100).fired, false);
});

test('balloon hit testing excludes transparent corners, ropes, destroyed and invalid bounds', () => {
  const box = { left: 100, top: 50, width: 132, height: 184 };
  assert.equal(hitBalloon(166, 122, box), true);
  for (const [x, y] of [[100, 50], [232, 50], [166, 232], [99, 120], [NaN, 122]]) assert.equal(hitBalloon(x, y, box), false);
  assert.equal(hitBalloon(166, 122, box, true), false);
  assert.equal(hitBalloon(166, 122, { ...box, width: 0 }), false);
});

test('each weapon damages, respects cooldown, counts misses, and destroys only once', () => {
  for (const weapon of Object.keys(WEAPONS)) {
    let state = { ...createState(), weapon };
    const miss = fire(state, false, 0); assert.equal(miss.state.health, BALLOON_MAX_HEALTH); assert.equal(miss.state.hits, 0);
    assert.equal(fire(miss.state, true, 1).fired, false);
    assert.equal(fire(miss.state, true, NaN).fired, false);
    state = miss.state; let destructions = 0;
    const count = Math.ceil(BALLOON_MAX_HEALTH / weaponProfile(state, weapon).shotDamage) + 2;
    for (let i = 1; i <= count; i++) {
      const result = fire(state, true, i * WEAPONS[weapon].cooldown); state = result.state;
      if (result.destroyed) destructions++;
      assert.ok(state.health >= 0 && state.health <= BALLOON_MAX_HEALTH);
    }
    assert.equal(destructions, 1); assert.equal(state.health, 0); assert.equal(state.shots, count + 1);
  }
});

test('cracked glass geometry is bounded, variable, finite, and generated without HTML', () => {
  const paths = crackPaths(() => .5, 11);
  assert.equal(paths.length, 28);
  for (const path of paths) {
    assert.match(path, /^M[-\d .]+[Ll][-\d .Ll]+$/);
    for (const value of path.match(/-?\d+(?:\.\d+)?/g)) assert.ok(Math.abs(Number(value)) <= 100);
  }
  assert.notDeepEqual(crackPaths(() => .2), crackPaths(() => .8));
});

function fixture({ reduced = false, hostname = '' } = {}) {
  class Element {
    constructor(id) {
      this.id = id; this.listeners = {}; this.dataset = {}; this.children = []; this.attributes = {};
      this.hidden = false; this.inert = false; this.classes = new Set();
      this.classList = { add: (...values) => values.forEach(value => this.classes.add(value)), remove: value => this.classes.delete(value), contains: value => this.classes.has(value) };
      this.style = { setProperty: (key, value) => { this.style[key] = value; } };
    }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type, details = {}) {
      const e = { target: this, detail: 0, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...details };
      for (const fn of this.listeners[type] || []) fn(e);
      return e;
    }
    dispatchEvent(e) { this.emit(e.type); }
    append(...nodes) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parent = null; }); this.children = []; this.append(...nodes); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
    setAttribute(key, value) { this.attributes[key] = value; }
    querySelectorAll() { return buttons; }
    getBoundingClientRect() { return { left: 100, top: 50, width: 132, height: 184 }; }
    closest() { return null; }
    setPointerCapture(id) { this.pointerCapture = id; }
    hasPointerCapture(id) { return this.pointerCapture === id; }
    releasePointerCapture() { this.pointerCapture = null; }
  }
  const ids = ['siteArmory', 'siteNewsBalloon', 'armoryShield', 'armoryDamage', 'armoryHud', 'armoryStatus', 'armoryWeaponName', 'armoryFire', 'armoryOff', 'armoryRepair', 'armorySound'];
  ids.push('armoryTargets', 'armoryBattleStats', 'armoryScore', 'armoryBank', 'armoryTargetCount', 'armoryBattleNote');
  ids.push('armoryUnitDamage', 'armoryLastHit');
  ids.push('armoryBossHealth', 'armoryBossStatus');
  ids.push('armoryWave', 'armoryWaveTitle', 'armoryWaveDetail', 'armoryWaveProgress');
  ids.push('armoryAlliesStats', 'armoryAllyCount', 'armoryAllyReserves', 'armoryAllyKills', 'armoryAllyDamage');
  ids.push('armoryUpgradeNote', 'armoryUpgradeProgress', 'armoryUpgradeStatus');
  ids.push('armoryTech', 'armoryTechName', 'armoryTechNext', 'armoryTechPath');
  for (const weapon of Object.keys(WEAPONS)) ids.push('armoryReload-' + weapon, 'armoryReloadLabel-' + weapon, 'armoryDamage-' + weapon, 'armoryKills-' + weapon, 'armoryLevel-' + weapon, 'armoryLabel-' + weapon, 'armoryTier-' + weapon);
  const nodes = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  const buttons = Object.keys(WEAPONS).map(weapon => { const button = new Element(weapon); button.dataset.weapon = weapon; return button; });
  const doc = new Element('document'); doc.body = new Element('body'); doc.hidden = false;
  const frame = new Element('contentFrame');
  doc.getElementById = id => nodes[id]; doc.createElement = tag => new Element(tag); doc.createElementNS = (_, tag) => new Element(tag);
  doc.querySelectorAll = () => [frame]; doc.querySelector = () => doc.modalOpen ? new Element('dialog') : null;
  let now = 0, observer;
  const timers = new Map(); let timerId = 0;
  const win = new Element('window'); win.document = doc; win.performance = { now: () => now };
  win.innerHeight = 800; doc.documentElement = new Element('html'); doc.documentElement.clientWidth = 1200;
  win.location = { hostname };
  win.scrollTo = ({ left, top }) => { win.scrollX = left; win.scrollY = top; };
  const frames = new Map(); let frameId = 0;
  win.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
  win.cancelAnimationFrame = id => frames.delete(id);
  win.CustomEvent = class { constructor(type) { this.type = type; } };
  win.matchMedia = () => ({ matches: reduced });
  win.setTimeout = (fn, delay = 0) => { timers.set(++timerId, { fn, at: now + delay }); return timerId; }; win.clearTimeout = id => timers.delete(id);
  win.MutationObserver = class { constructor(fn) { observer = fn; } observe() {} };
  const controller = mount(win);
  return { ...controller, win, doc, nodes, buttons, timers, frame, frames,
    step(ms = 16) { now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); },
    next(ms = 1000) { now += ms; }, observe() { observer(); },
    fly(ms = 1600) { for (let remaining = ms; remaining > 0; remaining -= 16) { this.advance(Math.min(16, remaining)); this.step(0); } },
    advance(ms) {
      const until = now + ms;
      for (let count = 0; count < 10000; count++) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) { now = until; return; }
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      throw Error('Timer loop did not settle');
    } };
}

test('arming and disarming are reversible and preserve nested-frame keyboard state', () => {
  const f = fixture(); assert.equal(f.nodes.armoryShield.hidden, true); assert.equal(f.nodes.armoryHud.hidden, true);
  f.select('cannon'); assert.equal(f.nodes.armoryShield.hidden, false); assert.equal(f.frame.inert, true);
  assert.equal(f.buttons[1].attributes['aria-pressed'], 'true');
  f.select('not-a-weapon'); assert.equal(f.getState().weapon, 'cannon');
  f.select('cannon'); assert.equal(f.getState().weapon, null); assert.equal(f.frame.inert, false);
  mount(f.win); assert.equal(f.buttons[0].listeners.click.length, 1);
});

test('misses leave bounded visual-only damage; repair clears all marks and animation timers', () => {
  const f = fixture(); f.select('machinegun');
  for (let i = 0; i < 100; i++) { f.next(); f.shoot(400, 450); }
  assert.equal(f.getState().health, BALLOON_MAX_HEALTH);
  assert.equal(f.nodes.armoryDamage.children.filter(node => node.className === 'armory-mark').length, MAX_MARKS);
  assert.ok(f.nodes.armoryDamage.children.length <= MAX_MARKS + 32);
  f.select(null); assert.equal(f.nodes.armoryShield.hidden, true); assert.equal(f.nodes.armoryHud.hidden, true);
  f.reset(); assert.equal(f.nodes.armoryDamage.children.length, 0); assert.equal(f.timers.size, 0);
  assert.equal(f.nodes.armoryHud.hidden, true); assert.equal(f.getState().shots, 0);
});

test('boss requires sustained cannon fire; disarming restores news without silently clearing damage', () => {
  const f = fixture(); f.select('cannon'); f.shoot(400, 450); f.next(3000);
  f.nodes.armoryFire.emit('click'); assert.equal(f.getState().health, BALLOON_MAX_HEALTH - 55);
  for (let i = 1; i < Math.ceil(BALLOON_MAX_HEALTH / 55); i++) { f.next(3000); f.nodes.armoryFire.emit('click'); }
  assert.equal(f.getState().health, 0);
  assert.equal(f.nodes.siteNewsBalloon.dataset.destroyed, 'true'); assert.equal(f.nodes.armoryFire.disabled, false);
  assert.equal(f.getBattle().active, true); assert.equal(f.getBattle().score, 1);
  f.select(null); assert.equal(f.getState().health, BALLOON_MAX_HEALTH); assert.equal(f.nodes.siteNewsBalloon.dataset.destroyed, 'false');
  assert.equal(f.nodes.siteNewsBalloon.classes.has('is-shot-down'), false);
  assert.equal(f.nodes.armoryHud.hidden, true); assert.equal(f.nodes.armoryShield.hidden, true);
});

test('armed clicks cannot navigate through the iframe shield and game controls stay clickable', () => {
  const f = fixture(); f.select('laser');
  const shot = f.doc.emit('click', { clientX: 400, clientY: 450, button: 0 });
  assert.equal(shot.prevented, true); assert.equal(shot.stopped, true); assert.equal(f.getState().shots, 1);
  f.next();
  const control = f.doc.emit('click', { target: { closest: () => f.nodes.siteArmory }, button: 0 });
  assert.equal(control.prevented, undefined); assert.equal(f.getState().shots, 1);
  f.doc.emit('keydown', { key: 'Escape' }); assert.equal(f.getState().weapon, null);
  const unarmed = f.doc.emit('click', { clientX: 400, clientY: 450, button: 0 }); assert.equal(unarmed.prevented, undefined);
});

test('modal opening disarms, hidden tabs and invalid coordinates cannot fire, and typing does not arm', () => {
  const f = fixture(); f.select('cannon');
  f.doc.hidden = true; f.shoot(400, 450); assert.equal(f.getState().shots, 0); f.doc.hidden = false;
  f.shoot(NaN, 450); assert.equal(f.getState().shots, 0);
  f.doc.modalOpen = true; f.shoot(400, 450); assert.equal(f.getState().shots, 0);
  f.observe(); assert.equal(f.getState().weapon, null); assert.equal(f.frame.inert, false);
  f.doc.modalOpen = false;
  f.doc.emit('keydown', { key: '2', target: { closest: () => ({}) } }); assert.equal(f.getState().weapon, null);
  f.doc.emit('keydown', { key: '2', ctrlKey: true }); assert.equal(f.getState().weapon, null);
  f.doc.emit('keydown', { key: '2' }); assert.equal(f.getState().weapon, 'cannon');
});

test('reduced motion omits explosion animations while keeping weapon and repair actions usable', () => {
  const f = fixture({ reduced: true }); f.select('cannon'); f.shoot(400, 450);
  assert.equal(f.nodes.armoryDamage.children.length, 1); assert.equal(f.timers.size, 1); // Only the reload display timer.
  f.advance(3000); assert.equal(f.timers.size, 0);
  f.reset(); assert.equal(f.nodes.armoryDamage.children.length, 0); assert.equal(f.getState().weapon, 'cannon');
});

test('armory never writes site data or storage, posts gameplay, or injects into nested documents', () => {
  const script = fs.readFileSync(require.resolve('../site-armory.js'), 'utf8');
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|contentDocument|contentWindow|postMessage/);
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(html, /id="armoryShield" hidden/); assert.match(html, /id="armoryHud"[^>]*hidden/);
});

function hold(f, overrides = {}) {
  return f.doc.emit('pointerdown', { target: f.nodes.armoryShield, pointerId: 7, button: 0, buttons: 1, isPrimary: true, clientX: 400, clientY: 450, ...overrides });
}

test('holding each weapon repeats at its own rate and releasing prevents any further shots', () => {
  assert.equal(WEAPONS.laser.cooldown, 1000); assert.equal(WEAPONS.cannon.cooldown, 3000);
  for (const weapon of Object.keys(WEAPONS)) {
    const f = fixture(); f.select(weapon); const delay = WEAPONS[weapon].cooldown;
    assert.equal(hold(f).prevented, true); assert.equal(f.getState().shots, 1);
    assert.equal(f.nodes.armoryShield.pointerCapture, 7);
    f.advance(delay - 1); assert.equal(f.getState().shots, 1);
    f.advance(1); assert.equal(f.getState().shots, 2);
    f.advance(delay * 2); assert.equal(f.getState().shots, 4);
    f.doc.emit('pointerup', { pointerId: 7 });
    assert.equal(f.nodes.armoryShield.pointerCapture, null);
    assert.equal(f.nodes.siteArmory.dataset.firing, 'false');
    f.advance(10000); assert.equal(f.getState().shots, 4);
  }
});

test('pointer movement updates aim, secondary pointers cannot steal it, and click does not fire twice', () => {
  const f = fixture(); f.select('laser'); hold(f);
  f.doc.emit('pointerup', { pointerId: 8 }); f.advance(1000); assert.equal(f.getState().shots, 2);
  f.doc.emit('pointermove', { pointerId: 8, buttons: 1, clientX: 166, clientY: 122 });
  f.advance(1000); assert.equal(f.getState().health, BALLOON_MAX_HEALTH);
  f.doc.emit('pointermove', { pointerId: 7, buttons: 1, clientX: 166, clientY: 122 });
  f.advance(1000); assert.equal(f.getState().health, BALLOON_MAX_HEALTH - 34);
  f.doc.emit('pointerup', { pointerId: 7 }); f.advance(1000);
  f.doc.emit('click', { detail: 1, button: 0, clientX: 166, clientY: 122 });
  assert.equal(f.getState().shots, 4);
  f.doc.emit('click', { detail: 0, button: 0, clientX: 166, clientY: 122 }); assert.equal(f.getState().shots, 5);
});

test('every exit path cancels held fire, including lost capture, blur, hiding, repair and weapon changes', () => {
  for (const exit of ['cancel', 'lost', 'blur', 'hidden', 'repair', 'switch', 'escape', 'modal', 'pagehide', 'buttons-up']) {
    const f = fixture(); f.select('laser'); hold(f);
    if (exit === 'cancel') f.doc.emit('pointercancel', { pointerId: 7 });
    if (exit === 'lost') f.nodes.armoryShield.emit('lostpointercapture', { pointerId: 7 });
    if (exit === 'blur') f.win.emit('blur');
    if (exit === 'hidden') { f.doc.hidden = true; f.doc.emit('visibilitychange'); }
    if (exit === 'repair') f.reset();
    if (exit === 'switch') f.select('cannon');
    if (exit === 'escape') f.doc.emit('keydown', { key: 'Escape' });
    if (exit === 'modal') { f.doc.modalOpen = true; f.observe(); }
    if (exit === 'pagehide') f.win.emit('pagehide');
    if (exit === 'buttons-up') f.doc.emit('pointermove', { pointerId: 7, buttons: 0 });
    const shots = f.getState().shots;
    f.advance(20000); assert.equal(f.getState().shots, shots, exit);
    assert.equal(f.nodes.siteArmory.dataset.firing, 'false', exit);
  }
});

test('holding the accessible fire button unlocks unit hunt and release stops the next shot', () => {
  const f = fixture(); f.select('cannon'); hold(f, { target: f.nodes.armoryFire });
  assert.equal(f.getState().health, BALLOON_MAX_HEALTH - 55); assert.equal(f.nodes.armoryFire.pointerCapture, 7);
  f.advance(2999); assert.equal(f.getState().shots, 1);
  f.advance(1); assert.equal(f.getState().shots, 2);
  const shots = Math.ceil(BALLOON_MAX_HEALTH / 55); f.advance((shots - 2) * 3000);
  assert.equal(f.getState().health, 0); assert.equal(f.getState().shots, shots);
  assert.equal(f.getBattle().active, true); assert.equal(f.nodes.siteArmory.dataset.firing, 'true');
  f.doc.emit('pointerup', { pointerId: 7 });
  f.advance(9000); assert.equal(f.getState().shots, shots); assert.equal(f.getState().health, BALLOON_MAX_HEALTH);
});

test('controls, right clicks, non-primary touch and disarmed pointers do not start automatic fire', () => {
  const f = fixture(); hold(f); assert.equal(f.getState().shots, 0);
  f.select('machinegun');
  hold(f, { button: 2 }); hold(f, { isPrimary: false });
  hold(f, { target: { closest: selector => selector.includes('#siteArmory,') ? {} : null } });
  f.advance(10000); assert.equal(f.getState().shots, 0);
});

test('reload progress matches the firing gate and each gun keeps its own cooldown when switching', () => {
  let state = { ...createState(), weapon: 'cannon' };
  assert.deepEqual(reloadState(state, 'cannon', 0), { progress: 1, remainingMs: 0, ready: true });
  state = fire(state, false, 100).state;
  assert.equal(reloadState(state, 'cannon', 100).progress, 0);
  assert.equal(reloadState(state, 'cannon', 1600).progress, .5);
  assert.equal(reloadState(state, 'cannon', 3099).ready, false);
  assert.equal(reloadState(state, 'cannon', 3100).ready, true);
  const laser = fire({ ...state, weapon: 'laser' }, false, 200);
  assert.equal(laser.fired, true);
  assert.equal(fire({ ...laser.state, weapon: 'cannon' }, false, 201).fired, false);
  assert.equal(laser.state.lastShots.cannon, 100); assert.equal(laser.state.lastShots.laser, 200);
  assert.equal(reloadState(state, 'cannon', -1000).progress, 0);
});

test('reload bars fill, show the countdown, keep updating after disarm, and stop updating when ready', () => {
  const f = fixture({ reduced: true }); f.select('cannon'); f.shoot(400, 450);
  const bar = f.nodes['armoryReload-cannon'], label = f.nodes['armoryReloadLabel-cannon'];
  assert.equal(bar.value, 0); assert.equal(label.textContent, '3.0s');
  f.advance(1500); assert.equal(bar.value, .5); assert.equal(label.textContent, '1.5s');
  f.select('laser'); assert.equal(f.nodes['armoryReload-laser'].value, 1);
  assert.equal(f.buttons[1].dataset.loading, 'true');
  f.select(null); f.advance(1500);
  assert.equal(bar.value, 1); assert.equal(label.textContent, 'Ready');
  assert.equal(f.buttons[1].dataset.loading, 'false'); assert.equal(f.timers.size, 0);
});

test('repair resets reload bars and hidden pages reconcile elapsed cooldown without background polling', () => {
  const f = fixture({ reduced: true }); f.select('cannon'); f.shoot(400, 450);
  f.doc.hidden = true; f.doc.emit('visibilitychange'); assert.equal(f.timers.size, 0);
  f.advance(4000); f.doc.hidden = false; f.doc.emit('visibilitychange');
  assert.equal(f.nodes['armoryReload-cannon'].value, 1); assert.equal(f.timers.size, 0);
  f.shoot(400, 450); assert.equal(f.nodes['armoryReload-cannon'].value, 0);
  f.reset(); assert.equal(f.nodes['armoryReload-cannon'].value, 1); assert.equal(f.timers.size, 0);
});

test('impact coordinates keep their exact page location, including fractional and horizontal scroll', () => {
  assert.deepEqual(documentPoint(100, 200, 20, 900), { x: 120, y: 1100 });
  assert.deepEqual(documentPoint(10.25, 20.75, 5.5, 101.25), { x: 15.75, y: 122 });
  assert.deepEqual(documentPoint(100, 200), { x: 100, y: 200 });
});

test('even programmatic scrolling moves holes together and returning restores their exact page position', () => {
  const f = fixture({ reduced: true }); f.select('cannon');
  // Overflow locking prevents user scrolling, but scripts can still scroll.
  f.win.scrollX = 20; f.win.scrollY = 700; f.win.emit('scroll'); f.shoot(400, 450);
  const first = f.nodes.armoryDamage.children[0];
  assert.equal(first.style.left, 'calc(420px - var(--armory-scroll-x, 0px))');
  assert.equal(first.style.top, 'calc(1150px - var(--armory-scroll-y, 0px))');
  f.win.scrollX = 70; f.win.scrollY = 1000; f.win.emit('scroll');
  assert.equal(f.nodes.armoryDamage.style['--armory-scroll-x'], '70px');
  assert.equal(f.nodes.armoryDamage.style['--armory-scroll-y'], '1000px');
  f.next(3000); f.shoot(400, 450);
  const second = f.nodes.armoryDamage.children[1];
  assert.equal(second.style.top, 'calc(1450px - var(--armory-scroll-y, 0px))');
  assert.equal(first.style.top, 'calc(1150px - var(--armory-scroll-y, 0px))');
  f.win.scrollX = 20; f.win.scrollY = 700; f.win.emit('scroll');
  assert.equal(f.nodes.armoryDamage.style['--armory-scroll-y'], '700px');
  assert.equal(f.nodes.armoryDamage.children[0], first); assert.equal(f.nodes.armoryDamage.children[1], second);
});

test('all machine-gun holes and transient sparks share the page anchor; no extra per-hole scroll listeners', () => {
  const f = fixture(); f.win.scrollY = 123.5; f.win.emit('scroll'); f.select('machinegun'); f.shoot(400, 450);
  assert.equal(f.win.listeners.scroll.length, 1);
  for (const node of f.nodes.armoryDamage.children) {
    assert.match(node.style.top, /^calc\([\d.]+px - var\(--armory-scroll-y, 0px\)\)$/);
  }
  f.win.scrollY = 300; f.win.emit('scroll');
  assert.equal(f.nodes.armoryDamage.style['--armory-scroll-y'], '300px');
  f.reset(); assert.equal(f.nodes.armoryDamage.children.length, 0);
});

function popBalloon(f) {
  f.select('machinegun');
  for (let i = 0; i < Math.ceil(BALLOON_MAX_HEALTH / 36); i++) { f.next(160); f.nodes.armoryFire.emit('click'); }
}

test('balloon unlocks score and affordable units; killing a unit pays exactly its cost times 1.5', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
  const initial = f.getBattle(); assert.equal(initial.score, 1); assert.equal(initial.unitKills, 0);
  assert.ok(initial.units.length > 0 && initial.units.length <= 8);
  assert.equal(initial.bank + initial.spent, 500);
  assert.equal(f.nodes.armoryTargets.children.length, initial.units.length);
  const target = initial.units[0];
  for (let tries = 0; tries < 100 && f.getBattle().units.some(unit => unit.id === target.id); tries++) {
    f.next(160); f.shoot(target.point.x + 62, target.point.y + 40);
  }
  const next = f.getBattle();
  assert.equal(next.units.some(unit => unit.id === target.id), false);
  assert.equal(next.score, 2); assert.equal(next.unitKills, 1); assert.equal(next.earned, target.cost * 1.5);
  assert.equal(next.bank + next.spent, 500 + next.earned);
  assert.ok(next.bank >= 0 && next.units.length <= 8);
});

test('disarm pauses a round without spending money or reseeding; repair resets the round and restores news', async () => {
  const f = fixture(); await f.ready; popBalloon(f);
  const initial = f.getBattle(); assert.equal(f.frames.size, 1);
  f.select(null); assert.equal(f.frames.size, 0); assert.equal(f.nodes.armoryTargets.hidden, true);
  assert.equal(f.nodes.siteNewsBalloon.dataset.destroyed, 'false');
  assert.deepEqual(f.getBattle().units, initial.units); assert.equal(f.getBattle().bank, initial.bank);
  f.select('laser'); assert.equal(f.nodes.siteNewsBalloon.dataset.destroyed, 'false');
  assert.equal(f.getBattle().score, 1); assert.equal(f.getBattle().bank, initial.bank);
  assert.equal(f.nodes.armoryTargets.hidden, false);
  f.reset(); assert.equal(f.getBattle().active, false); assert.equal(f.getBattle().bank, 0);
  assert.equal(f.nodes.armoryTargets.children.length, 0); assert.equal(f.nodes.armoryBattleStats.hidden, true);
  assert.equal(f.getState().health, BALLOON_MAX_HEALTH); assert.equal(f.frames.size, 0);
});

test('every disarm action hides the whole panel and rearming restores the same progress', async () => {
  for (const action of ['off', 'escape', 'selected-weapon', 'modal']) {
    const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
    f.select('cannon'); f.shoot(1100, 700);
    const battle = f.getBattle(), allies = f.getAllies(), state = f.getState();
    assert.equal(f.nodes.armoryHud.hidden, false);
    if (action === 'off') f.nodes.armoryOff.emit('click');
    if (action === 'escape') f.doc.emit('keydown', { key: 'Escape' });
    if (action === 'selected-weapon') f.select('cannon');
    if (action === 'modal') { f.doc.modalOpen = true; f.observe(); }
    assert.equal(f.nodes.armoryHud.hidden, true, action);
    assert.equal(f.nodes.armoryTargets.hidden, true); assert.equal(f.nodes.armoryShield.hidden, true);
    f.advance(10000); assert.equal(f.nodes.armoryHud.hidden, true);
    assert.deepEqual(f.getBattle(), battle); assert.deepEqual(f.getAllies(), allies);
    assert.equal(f.getState().unitDamage, state.unitDamage); assert.equal(f.getState().powerEarned, state.powerEarned);
    f.doc.modalOpen = false; f.select('laser');
    assert.equal(f.nodes.armoryHud.hidden, false); assert.equal(f.nodes.armoryTargets.hidden, false);
    assert.deepEqual(f.getBattle(), battle); assert.deepEqual(f.getAllies(), allies);
  }
});

test('unit movement stays on screen, pauses in hidden tabs, and cannot produce extra money', async () => {
  const f = fixture(); await f.ready; popBalloon(f);
  const initial = f.getBattle(); f.step(); f.step(50);
  const moved = f.getBattle();
  assert.ok(moved.units.some((unit, i) => unit.point.x !== initial.units[i].point.x));
  for (const unit of moved.units) { assert.ok(unit.point.x >= 12 && unit.point.x <= 1064); assert.ok(unit.point.y >= 20 && unit.point.y + 100 <= 300); }
  assert.equal(moved.bank, initial.bank); assert.equal(moved.score, initial.score);
  f.doc.hidden = true; f.doc.emit('visibilitychange'); assert.equal(f.frames.size, 0); assert.equal(f.nodes.armoryTargets.hidden, true);
  f.doc.hidden = false; f.doc.emit('visibilitychange'); assert.equal(f.frames.size, 1);
});

test('arming locks scrolling at the top; switching guns keeps the saved browsing position', () => {
  const f = fixture(); f.win.scrollX = 25; f.win.scrollY = 700;
  f.select('machinegun');
  for (const root of [f.doc.documentElement, f.doc.body]) assert.equal(root.classList.contains('armory-scroll-locked'), true);
  assert.equal(f.win.scrollX, 0); assert.equal(f.win.scrollY, 0);
  f.select('laser'); assert.equal(f.win.scrollY, 0);
  f.select(null);
  for (const root of [f.doc.documentElement, f.doc.body]) assert.equal(root.classList.contains('armory-scroll-locked'), false);
  assert.equal(f.win.scrollX, 25); assert.equal(f.win.scrollY, 700);
  f.select('cannon'); f.doc.modalOpen = true; f.observe();
  assert.equal(f.getState().weapon, null); assert.equal(f.win.scrollY, 700);
  assert.equal(f.doc.documentElement.classList.contains('armory-scroll-locked'), false);
});

test('top arena keeps moving and bounded through resizing in the owner localhost preview', async () => {
  const f = fixture({ reduced: true, hostname: '127.0.0.1' }); await f.ready; popBalloon(f);
  const before = f.getBattle().units;
  f.step(); f.step(50);
  assert.ok(f.getBattle().units.some((unit, i) => unit.point.x !== before[i].point.x));
  for (let i = 0; i < 300; i++) f.step(50);
  for (const unit of f.getBattle().units) { assert.ok(unit.point.y >= 20 && unit.point.y + 100 <= 300); }
  f.win.innerHeight = 400; f.doc.documentElement.clientWidth = 320; f.win.emit('resize'); f.step();
  for (const unit of f.getBattle().units) {
    assert.ok(unit.point.x >= 12 && unit.point.x + 124 <= 320);
    assert.ok(unit.point.y >= 20 && unit.point.y + 100 <= 206);
  }
  const css = fs.readFileSync(require.resolve('../site-armory.css'), 'utf8');
  assert.match(css, /html\.armory-scroll-locked, body\.armory-scroll-locked \{ overflow: hidden !important/);
  assert.match(css, /\.armory-targets \{[^}]*height: min\(300px, 100dvh\)[^}]*overflow: hidden/);
});

test('weapon counters count actual unit HP removed, excluding balloon hits, manual misses, cooldown clicks and overkill', async () => {
  for (const weapon of Object.keys(WEAPONS)) {
    const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
    assert.equal(f.getState().unitDamage, 0);
    let total = 0;
    if (f.getState().weapon !== weapon) f.select(weapon);
    for (let shot = 0; shot < 5; shot++) {
      if (f.getBattle().waves.phase === 'break') f.advance(4000);
      f.next(WEAPONS[weapon].cooldown);
      const before = f.getBattle(), target = before.units[0], counters = f.getState().weaponStats[weapon];
      const profile = weaponProfile(f.getState(), weapon);
      f.shoot(target.point.x + 62, target.point.y + 40);
      const snapshot = f.getState(); f.shoot(target.point.x + 62, target.point.y + 40);
      assert.deepEqual(f.getState(), snapshot); // Cooldown rejects duplicate clicks.
      if (weapon === 'rockets') f.fly();
      const after = f.getBattle();
      const originalHPRemoved = before.units.reduce((sum, unit) => sum + unit.health - (after.units.find(next => next.id === unit.id)?.health || 0), 0);
      // Rocket two may now hit a fresh replacement after rocket one gets a kill.
      const removedHP = weapon === 'rockets' ? f.getState().unitDamage - total : originalHPRemoved;
      assert.ok(originalHPRemoved <= removedHP);
      const kills = after.unitKills - before.unitKills;
      const maximum = weapon === 'flamer' ? profile.shotDamage * before.units.length : profile.shotDamage + (weapon === 'cannon' ? (before.units.length - 1) * Math.round(profile.shotDamage * .5) : 0);
      assert.ok(removedHP > 0 && removedHP <= maximum);
      total += removedHP;
      assert.equal(f.getState().unitDamage, total);
      assert.equal(f.getState().weaponStats[weapon].damage, counters.damage + removedHP);
      assert.equal(f.getState().weaponStats[weapon].kills, counters.kills + kills);
      assert.ok(f.getState().weaponStats[weapon].hits > counters.hits && f.getState().weaponStats[weapon].hits <= counters.hits + (['cannon', 'flamer'].includes(weapon) ? before.units.length : weapon === 'rockets' ? 2 : 1));
      assert.equal(f.nodes['armoryDamage-' + weapon].textContent, String(counters.damage + removedHP));
      assert.ok(f.nodes.armoryLastHit.textContent.startsWith(profile.name + ' → '));
    }
    if (weapon !== 'rockets') {
      f.next(WEAPONS[weapon].cooldown); const beforeMiss = f.getState().unitDamage; f.shoot(900, 700);
      assert.equal(f.getState().unitDamage, beforeMiss);
    }
  assert.equal(f.nodes.armoryUnitDamage.textContent, String(total));
  assert.equal(Object.values(f.getState().weaponStats).reduce((sum, stats) => sum + stats.kills, 0), f.getBattle().unitKills);
  const copy = f.getState(); copy.weaponStats.rockets.damage = -100;
  if (weapon === 'rockets') assert.ok(f.getState().weaponStats.rockets.damage > 0);
  f.select(null); assert.equal(f.getState().unitDamage, total);
  f.select('rockets'); assert.equal(f.getState().unitDamage, total);
  f.reset(); assert.equal(f.getState().unitDamage, 0);
  assert.equal(f.getState().lastUnitHit, null);
  for (const stats of Object.values(f.getState().weaponStats)) assert.deepEqual(stats, { damage: 0, hits: 0, kills: 0 });
  }
});

test('rocket hotkey launches a 150-damage paired salvo with one-second reload', () => {
  const f = fixture({ reduced: true });
  f.doc.emit('keydown', { key: '4' }); assert.equal(f.getState().weapon, 'rockets');
  assert.equal(WEAPONS.rockets.pellets, 2); assert.equal(WEAPONS.rockets.cooldown, 1000);
  assert.equal(weaponProfile(f.getState(), 'rockets').shotDamage, 150);
  f.nodes.armoryFire.emit('click'); assert.equal(f.getState().health, BALLOON_MAX_HEALTH - 150);
  for (let i = 1; i < Math.ceil(BALLOON_MAX_HEALTH / 150); i++) { f.next(1000); f.nodes.armoryFire.emit('click'); }
  assert.equal(f.getBattle().active, true);
  assert.equal(f.getState().unitDamage, 0);
  const shots = f.getState().shots;
  f.next(999); f.nodes.armoryFire.emit('click'); assert.equal(f.getState().shots, shots);
  f.next(1); f.nodes.armoryFire.emit('click'); assert.equal(f.getState().shots, shots + 1);
  assert.equal(f.getState().unitDamage, 0); f.fly();
  assert.ok(f.getState().unitDamage > 0);
});

test('rocket salvos auto-aim at the boss with two trails and two scorched impact holes', () => {
  const f = fixture({ reduced: true, hostname: '127.0.0.1' }); f.select('rockets'); f.shoot(400, 450);
  const rockets = f.nodes.armoryDamage.children.filter(node => node.className === 'armory-rocket');
  const marks = f.nodes.armoryDamage.children.filter(node => node.className === 'armory-mark');
  assert.equal(rockets.length, 2); assert.equal(marks.length, 2);
  assert.ok(marks.every(mark => mark.dataset.kind === 'rockets' && mark.children.length === 1));
  assert.deepEqual(rockets.map(node => node.dataset.projectileIndex), ['1', '2']);
  assert.deepEqual(rockets.map(node => node.style['--rocket-delay']), ['0ms', '70ms']);
  assert.notEqual(rockets[0].style.left, rockets[1].style.left);
  assert.equal(f.getState().health, BALLOON_MAX_HEALTH - 150);
  assert.equal(f.getState().shots, 1);
  f.shoot(400, 450); assert.equal(f.getState().shots, 1);
  f.advance(1000);
  assert.equal(f.nodes.armoryDamage.children.filter(node => node.className === 'armory-rocket').length, 0);
  assert.equal(f.getState().unitDamage, 0); assert.equal(f.getState().health, BALLOON_MAX_HEALTH - 150);
  f.shoot(400, 450); f.reset(); assert.equal(f.nodes.armoryDamage.children.length, 0);
  f.advance(5000); assert.equal(f.getState().shots, 0); assert.equal(f.getState().health, BALLOON_MAX_HEALTH);
  const reduced = fixture({ reduced: true }); reduced.select('rockets'); reduced.shoot(400, 450);
  assert.equal(reduced.nodes.armoryDamage.children.filter(node => node.className === 'armory-rocket').length, 0);
});

test('twenty upgrade levels preserve the early milestones and use exact power boundaries', () => {
  assert.equal(UPGRADE_MILESTONES.length, 20);
  assert.deepEqual(UPGRADE_MILESTONES.slice(0, 5), [0, 500, 1500, 3000, 6000]);
  assert.equal(UPGRADE_MILESTONES[5], 10000); assert.equal(UPGRADE_MILESTONES[19], 300000);
  for (const value of [-1, 0, NaN, Infinity, '500', undefined]) assert.equal(upgradeProgress(value).level, 1);
  for (let tier = 1; tier < UPGRADE_MILESTONES.length; tier++) {
    const threshold = UPGRADE_MILESTONES[tier];
    const before = upgradeProgress(threshold - .5), after = upgradeProgress(threshold);
    assert.equal(before.level, tier); assert.equal(before.remaining, .5);
    assert.equal(after.level, tier + 1); assert.equal(after.bonusPercent, tier * 25);
    assert.ok(threshold > UPGRADE_MILESTONES[tier - 1]);
    assert.equal(after.progress, tier === UPGRADE_MILESTONES.length - 1 ? 1 : 0);
  }
  const max = upgradeProgress(1000000);
  assert.equal(max.level, 20); assert.equal(max.bonusPercent, 475);
  assert.equal(max.next, null); assert.equal(max.remaining, 0); assert.equal(max.progress, 1);
  assert.equal(upgradeProgress(6000).next, 10000); assert.equal(upgradeProgress(8000).progress, .5);
  assert.equal(upgradeProgress(1000).progress, .5);
});

test('all gun upgrades apply rounded shot damage and never change the agreed reload rates', () => {
  for (const weapon of Object.keys(WEAPONS)) {
    for (let tier = 0; tier < UPGRADE_MILESTONES.length; tier++) {
      const state = { ...createState(), weapon, powerEarned: UPGRADE_MILESTONES[tier] };
      const profile = weaponProfile(state, weapon);
      const damage = Math.round(WEAPONS[weapon].damage * WEAPONS[weapon].pellets * (1 + tier * .25));
      assert.equal(profile.shotDamage, damage);
      assert.equal(profile.cooldown, WEAPONS[weapon].cooldown);
      const shot = fire(state, true, 0);
      assert.equal(shot.state.health, Math.max(0, BALLOON_MAX_HEALTH - damage));
      assert.equal(reloadState(shot.state, weapon, profile.cooldown - 1).ready, false);
      assert.equal(reloadState(shot.state, weapon, profile.cooldown).ready, true);
    }
  }
  assert.equal(weaponProfile(createState(), 'constructor'), null);
});

test('earning kill power upgrades every gun without spending the bank; disarm preserves and repair resets', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
  assert.equal(f.getBattle().earned, 0); assert.equal(f.getState().powerEarned, 0); // Initial 500 power is not a reward.
  assert.equal(f.nodes['armoryLevel-machinegun'].textContent, 'Lv 1');
  let previousLevel = 1;
  const lastMilestone = UPGRADE_MILESTONES.at(-1);
  for (let shot = 0; shot < 10000 && f.getState().powerEarned < lastMilestone; shot++) {
    if (f.getBattle().waves.phase === 'break') f.advance(4000);
    const before = f.getBattle(), oldProfile = weaponProfile(f.getState(), 'machinegun');
    f.next(160); f.nodes.armoryFire.emit('click');
    const after = f.getBattle(), upgrade = upgradeProgress(after.earned);
    const damage = before.units.reduce((sum, unit) => sum + unit.health - (after.units.find(next => next.id === unit.id)?.health || 0), 0);
    assert.ok(damage > 0 && damage <= oldProfile.shotDamage); // A threshold-crossing kill still uses the previous level.
    assert.equal(f.getState().powerEarned, after.earned);
    assert.equal(after.bank + after.spent, 500 + after.earned); // No upgrade cost is taken from the economy.
    assert.equal(f.nodes.armoryUpgradeProgress.value, upgrade.progress);
    for (const weapon of Object.keys(WEAPONS)) {
      assert.equal(f.nodes['armoryLevel-' + weapon].textContent, 'Lv ' + upgrade.level);
      assert.equal(f.buttons.find(button => button.dataset.weapon === weapon).dataset.level, String(upgrade.level));
    }
    if (upgrade.level > previousLevel) assert.match(f.nodes.armoryUpgradeStatus.textContent, new RegExp(`upgraded to Lv ${upgrade.level}`));
    previousLevel = upgrade.level;
  }
  assert.ok(f.getState().powerEarned >= lastMilestone); assert.equal(previousLevel, 20);
  assert.match(f.nodes.armoryUpgradeNote.textContent, /MAX LEVEL/);
  const earned = f.getState().powerEarned;
  f.select(null); f.select('rockets'); assert.equal(f.getState().powerEarned, earned);
  assert.equal(weaponProfile(f.getState(), 'rockets').shotDamage, 863);
  f.reset(); assert.equal(f.getState().powerEarned, 0);
  assert.equal(f.nodes['armoryLevel-rockets'].textContent, 'Lv 1');
  assert.equal(f.nodes.armoryUpgradeProgress.value, 0); assert.equal(f.nodes.armoryUpgradeStatus.textContent, '');
});

test('1000-HP boss respawns after five seconds and repeat defeats preserve the ongoing economy and targets', async () => {
  const f = fixture({ reduced: true }); await f.ready;
  assert.equal(BALLOON_MAX_HEALTH, 1000); assert.equal(BALLOON_RESPAWN_MS, 5000);
  assert.equal(f.nodes.armoryBossHealth.max, 1000); assert.equal(f.nodes.armoryBossHealth.value, 1000);
  popBalloon(f); const round = f.getBattle();
  assert.equal(f.getState().bossKills, 1); assert.equal(f.nodes.armoryBossHealth.value, 0);
  assert.match(f.nodes.armoryBossStatus.textContent, /respawning in 5s/);
  f.advance(4999); assert.equal(f.getState().health, 0);
  assert.equal(f.nodes.siteNewsBalloon.dataset.destroyed, 'true');
  f.advance(1); assert.equal(f.getState().health, 1000);
  assert.equal(f.nodes.siteNewsBalloon.dataset.destroyed, 'false');
  assert.equal(f.nodes.siteNewsBalloon.classes.has('is-shot-down'), false);
  assert.deepEqual(f.getBattle(), round);
  f.select('cannon'); assert.equal(f.getState().health, 1000); // Switching never hides a living boss.
  f.nodes.siteNewsBalloon.getBoundingClientRect = () => ({ left: 1300, top: 50, width: 132, height: 184 });
  for (let i = 0; i < Math.ceil(1000 / 55); i++) { f.next(3000); f.shoot(1366, 122); }
  assert.equal(f.getState().health, 0); assert.equal(f.getState().bossKills, 2);
  const next = f.getBattle(); assert.equal(next.score, round.score + 1);
  for (const key of ['units', 'bank', 'spent', 'earned', 'unitKills', 'nextId']) assert.deepEqual(next[key], round[key]);
  assert.equal(f.getState().powerEarned, 0); assert.equal(f.getState().unitDamage, 0);
  f.advance(5000); assert.equal(f.getState().health, 1000); assert.equal(f.getState().bossKills, 2);
});

test('boss respawn is cancelled on repair/disarm/page exit and rearming retains a restored boss', async () => {
  for (const exit of ['repair', 'disarm', 'pagehide', 'modal']) {
    const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
    if (exit === 'repair') f.reset();
    if (exit === 'disarm') f.select(null);
    if (exit === 'pagehide') f.win.emit('pagehide');
    if (exit === 'modal') { f.doc.modalOpen = true; f.observe(); f.doc.modalOpen = false; }
    assert.equal(f.getState().health, 1000); assert.equal(f.nodes.siteNewsBalloon.dataset.destroyed, 'false');
    if (f.getState().weapon !== 'laser') f.select('laser');
    f.nodes.siteNewsBalloon.getBoundingClientRect = () => ({ left: 1300, top: 50, width: 132, height: 184 });
    f.next(1000); f.shoot(1366, 122); assert.equal(f.getState().health, 966);
    f.advance(10000); assert.equal(f.getState().health, 966, exit);
    assert.equal(f.timers.size, 0, exit); // No abandoned respawn or reload timer.
  }
});

test('shooting a unit overlapping the live boss never damages both targets', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.advance(5000);
  const target = f.getBattle().units[0], x = target.point.x + 62, y = target.point.y + 40;
  f.nodes.siteNewsBalloon.getBoundingClientRect = () => ({ left: x - 66, top: y - 72, width: 132, height: 184 });
  f.next(160); f.shoot(x, y);
  assert.ok(f.getState().unitDamage > 0); assert.equal(f.getState().health, 1000);
});

test('homing steering turns toward changing targets, clamps long frame gaps, and stops at impact', () => {
  const first = homeRocket({ x: 0, y: 0 }, { x: 100, y: 0 }, .016);
  assert.equal(first.x, 25.6); assert.equal(first.y, 0); assert.equal(first.arrived, false);
  const turned = homeRocket(first, { x: 100, y: 100 }, .016);
  assert.ok(turned.x > first.x && turned.y > first.y && turned.angle > 0);
  const capped = homeRocket({ x: 0, y: 0 }, { x: 1000, y: 0 }, 10);
  assert.equal(capped.x, 80); assert.equal(capped.arrived, false);
  const impact = homeRocket({ x: 99, y: 99 }, { x: 100, y: 100 }, .016);
  assert.equal(impact.arrived, true); assert.equal(impact.x, 100); assert.equal(impact.y, 100);
});

test('rockets auto-lock off-target clicks, follow moving tanks, and credit damage only on impact', async () => {
  const f = fixture({ reduced: true, hostname: '127.0.0.1' }); await f.ready; popBalloon(f); f.select('rockets');
  // Put the launcher far enough away to observe flight before either impact.
  f.buttons.find(button => button.dataset.weapon === 'rockets').getBoundingClientRect = () => ({ left: -600, top: 500, width: 80, height: 80 });
  const before = f.getBattle();
  const expected = before.units.reduce((a, b) => Math.hypot(a.point.x + 62 - 1100, a.point.y + 40 - 700) <= Math.hypot(b.point.x + 62 - 1100, b.point.y + 40 - 700) ? a : b);
  f.shoot(1100, 700); // No tank under the pointer.
  assert.equal(f.getState().unitDamage, 0); assert.equal(f.getProjectiles().length, 2);
  assert.ok(f.getProjectiles().every(rocket => rocket.targetId === expected.id));
  assert.equal(f.getProjectiles().reduce((sum, rocket) => sum + rocket.damage, 0), 150);
  const trails = f.nodes.armoryDamage.children.filter(node => node.className === 'armory-rocket is-homing');
  assert.equal(trails.length, 2);
  const initial = f.getProjectiles()[0]; f.step(16); f.step(16);
  const moved = f.getProjectiles()[0]; assert.notEqual(moved.x, initial.x);
  assert.notDeepEqual(f.getBattle().units.find(unit => unit.id === expected.id).point, expected.point);
  f.fly(2200);
  assert.equal(f.getProjectiles().length, 0);
  const after = f.getBattle();
  const removedHP = before.units.reduce((sum, unit) => sum + unit.health - (after.units.find(next => next.id === unit.id)?.health || 0), 0);
  assert.ok(removedHP > 0 && removedHP <= f.getState().unitDamage);
  assert.ok(f.getState().unitDamage <= 150);
  assert.equal(f.getState().weaponStats.rockets.damage, f.getState().unitDamage);
  assert.equal(f.getState().weaponStats.rockets.hits, 2);
  assert.equal(after.bank + after.spent, 500 + after.earned);
  assert.equal(f.nodes.armoryDamage.children.filter(node => node.className === 'armory-mark' && node.dataset.kind === 'rockets').length, 2);
});

test('rockets still hit replacements after every launch-time enemy dies and the player switches guns', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.select('rockets');
  const original = f.getBattle(), ids = new Set(original.units.map(unit => unit.id));
  const point = original.units[0].point;
  f.next(1000); f.shoot(point.x + 62, point.y + 40);
  f.select('machinegun');
  for (const id of ids) {
    for (let attempt = 0; attempt < 100 && f.getBattle().units.some(unit => unit.id === id); attempt++) {
      const target = f.getBattle().units.find(unit => unit.id === id);
      f.next(160); f.shoot(target.point.x + 62, target.point.y + 40);
    }
    assert.equal(f.getBattle().units.some(unit => unit.id === id), false);
  }
  const rocketDamage = f.getState().weaponStats.rockets.damage;
  f.fly(2200);
  assert.equal(f.getProjectiles().length, 0);
  assert.ok(f.getState().weaponStats.rockets.damage > rocketDamage);
  assert.equal(f.getState().weaponStats.rockets.hits, 2);
});

test('every safe exit cancels homing rockets without delayed hits, and other guns stay manual', async () => {
  for (const exit of ['disarm', 'repair', 'blur', 'hidden', 'modal', 'pagehide']) {
    const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.select('rockets');
    f.shoot(1100, 700); assert.equal(f.getProjectiles().length, 2);
    if (exit === 'disarm') f.select(null);
    if (exit === 'repair') f.reset();
    if (exit === 'blur') f.win.emit('blur');
    if (exit === 'hidden') { f.doc.hidden = true; f.doc.emit('visibilitychange'); }
    if (exit === 'modal') { f.doc.modalOpen = true; f.observe(); }
    if (exit === 'pagehide') f.win.emit('pagehide');
    assert.equal(f.getProjectiles().length, 0, exit); f.fly(4000);
    assert.equal(f.getState().unitDamage, 0, exit); assert.equal(f.getState().weaponStats.rockets.damage, 0, exit);
  }
  for (const gun of ['machinegun', 'cannon', 'laser']) {
    const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
    if (f.getState().weapon !== gun) f.select(gun);
    f.next(3000); f.shoot(1100, 700); f.fly(500);
    assert.equal(f.getState().unitDamage, 0); assert.equal(f.getProjectiles().length, 0);
  }
});

test('each accepted cannon shot recruits exactly one ally, including before the round, and queues extra recruits', async () => {
  const f = fixture({ reduced: true }); await f.ready; f.select('cannon');
  f.shoot(900, 700); assert.equal(f.getAllies().created, 1);
  assert.equal(f.getAllies().units.length, 1); assert.equal(f.nodes.armoryTargets.hidden, false);
  assert.equal(f.nodes.armoryTargets.children[0].dataset.team, 'ally');
  assert.equal(f.nodes.armoryTargets.children[0].dataset.unitKey, 'A-Python-Trk-HC');
  f.shoot(900, 700); assert.equal(f.getAllies().created, 1); // Cooldown is not another shot.
  for (let i = 1; i < 20; i++) { f.next(3000); f.shoot(900, 700); }
  assert.equal(f.getAllies().created, 20); assert.equal(f.getAllies().units.length, 4); assert.equal(f.getAllies().reserves, 16);
  assert.equal(f.getBattle().active, false); assert.equal(f.getBattle().bank, 0);
  assert.equal(f.nodes.armoryAllyCount.textContent, '4'); assert.equal(f.nodes.armoryAllyReserves.textContent, '16');
  f.select('machinegun'); f.next(1000); f.shoot(900, 700); assert.equal(f.getAllies().created, 20);
  const copy = f.getAllies(); copy.units[0].health = -1; assert.equal(f.getAllies().units[0].health, 120);
  f.reset(); assert.equal(f.getAllies().created, 0); assert.equal(f.getAllies().units.length, 0);
  assert.equal(f.nodes.armoryAlliesStats.hidden, true); assert.equal(f.nodes.armoryTargets.children.length, 0);
});

test('friendly fighters attack automatically, take return fire, and credit rewards only once', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.select('cannon');
  for (let i = 0; i < 5; i++) { f.next(3000); f.shoot(900, 700); }
  assert.equal(f.getAllies().units.length, 4); assert.equal(f.getAllies().reserves, 1);
  f.fly(40000);
  const army = f.getAllies(), round = f.getBattle(), state = f.getState();
  assert.ok(state.allyStats.damage > 0); assert.ok(state.allyStats.kills > 0); assert.ok(army.lost > 0);
  assert.equal(army.created, 5); assert.equal(army.units.length + army.reserves + army.lost, 5);
  assert.equal(round.unitKills, state.allyStats.kills); assert.equal(round.score, 1 + state.allyStats.kills);
  assert.equal(state.unitDamage, state.allyStats.damage);
  assert.equal(Object.values(state.weaponStats).reduce((sum, gun) => sum + gun.damage + gun.kills, 0), 0);
  assert.equal(round.bank + round.spent, 500 + round.earned);
  assert.equal(state.powerEarned, round.earned);
});

test('cannon recruits close a distant gap before attacking, including reduced-motion combat', async () => {
  const savedRandom = Math.random;
  try {
    for (const reduced of [false, true]) {
      Math.random = () => 0;
      const f = fixture({ reduced }); await f.ready; popBalloon(f);
      Math.random = () => .99;
      f.select('cannon'); f.shoot(1100, 700);
      const start = f.getAllies().units[0];
      f.next(2000); f.fly(1000);
      assert.equal(f.getState().allyStats.damage, 0); // Cooldown elapsed, but still far outside range.
      assert.equal(f.getAllies().units[0].health, 120);
      assert.ok(f.getAllies().units[0].point.x < start.point.x);
      assert.ok(f.getBattle().units.some(unit => unit.point.x > 12));
      f.fly(20000);
      assert.ok(f.getState().allyStats.damage > 0);
      const snapshot = f.getAllies(), damage = f.getState().allyStats.damage;
      f.select(null); f.fly(10000);
      assert.deepEqual(f.getAllies(), snapshot); assert.equal(f.getState().allyStats.damage, damage);
    }
  } finally { Math.random = savedRandom; }
});

test('a friendly Heavy Cannon can fire beyond an enemy Machinegun range, not vice versa', async () => {
  const savedRandom = Math.random;
  try {
    Math.random = () => 0;
    const f = fixture(); await f.ready; popBalloon(f);
    f.select('cannon'); f.shoot(1100, 700);
    // Enemy at (12,20), ally at (12,188): 168px, inside HC 216 but outside MG 144.
    f.next(2000); f.step(0);
    assert.equal(f.getState().allyStats.damage, 18);
    assert.equal(f.getAllies().units[0].health, 120);
    f.fly(1500);
    assert.ok(f.getAllies().units[0].health < 120); // Enemies now approached into their own range.
  } finally { Math.random = savedRandom; }
});

test('allied combat pauses safely, reinforcements persist on disarm, and friendly units cannot be shot or rocket-locked', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.select('cannon'); f.shoot(900, 700);
  f.fly(100); const ally = f.getAllies().units[0], beforeHP = ally.health;
  f.next(3000); f.shoot(ally.point.x + 62, ally.point.y + 40);
  assert.equal(f.getAllies().units.find(unit => unit.id === ally.id).health, beforeHP);
  f.select('rockets'); f.shoot(ally.point.x + 62, ally.point.y + 40);
  const enemies = new Set(f.getBattle().units.map(unit => unit.id));
  assert.ok(f.getProjectiles().every(rocket => enemies.has(rocket.targetId)));
  f.select(null); const paused = f.getAllies(), damage = f.getState().allyStats.damage, bank = f.getBattle().bank;
  f.fly(20000); assert.deepEqual(f.getAllies(), paused); assert.equal(f.getState().allyStats.damage, damage);
  assert.equal(f.getBattle().bank, bank);
  f.select('machinegun'); f.fly(16);
  assert.ok(f.getState().allyStats.hits <= paused.units.length); // At most one attack per unit, never a catch-up burst.
  f.doc.hidden = true; f.doc.emit('visibilitychange'); const hidden = f.getAllies();
  f.fly(10000); assert.deepEqual(f.getAllies(), hidden);
  f.doc.hidden = false; f.reset(); assert.equal(f.getAllies().units.length, 0); assert.equal(f.getAllies().reserves, 0);
  assert.deepEqual(f.getState().allyStats, { damage: 0, hits: 0, kills: 0 });
});

test('slow frames resolve guaranteed rocket impacts instead of silently expiring the projectiles', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.select('rockets');
  f.shoot(1100, 700); assert.equal(f.getProjectiles().length, 2);
  f.next(5000); f.step(16);
  assert.equal(f.getProjectiles().length, 0); assert.equal(f.getState().weaponStats.rockets.hits, 2);
  assert.ok(f.getState().unitDamage > 0 && f.getState().unitDamage <= 150);
});

test('the eight-projectile cap resolves legal hits and leftover rockets end safely when a wave clears', async () => {
  const savedRandom = Math.random;
  try {
  Math.random = () => 0;
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.select('rockets');
  for (let i = 0; i < 6; i++) {
    f.next(1000); f.shoot(1100, 700);
    assert.ok(f.getProjectiles().length <= 8);
  }
  f.next(5000); f.step(16);
  assert.equal(f.getProjectiles().length, 0); assert.equal(f.getState().weaponStats.rockets.hits, 8);
  assert.equal(f.getBattle().waves.phase, 'break'); assert.equal(f.getBattle().unitKills, 8);
  const round = f.getBattle(); assert.equal(round.bank + round.spent, 500 + round.earned);
  } finally { Math.random = savedRandom; }
});

test('cannon blast has full direct damage, half splash through 200px, and no double hit on the primary', () => {
  for (const power of UPGRADE_MILESTONES) {
    const profile = weaponProfile({ ...createState(), powerEarned: power }, 'cannon');
    const victims = cannonBlast([{ id: 1, x: 0, y: 0 }, { id: 2, x: 200, y: 0 }, { id: 3, x: 200.01, y: 0 }, { id: 4, x: 100, y: 100 }], 0, 0, 1, profile);
    assert.deepEqual(victims.map(unit => unit.id), [1, 2, 4]);
    assert.equal(victims[0].damage, profile.shotDamage);
    assert.equal(victims[1].damage, Math.round(profile.shotDamage * .5));
    assert.equal(victims[2].damage, Math.round(profile.shotDamage * .5));
  }
});

test('cannon splash damages only the original enemies, counts actual HP, and still recruits just one ally', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.select('cannon');
  const before = f.getBattle(), primary = before.units.at(-1), profile = weaponProfile(f.getState(), 'cannon');
  const x = primary.point.x + 62, y = primary.point.y + 40;
  const victims = cannonBlast(before.units.map(unit => ({ id: unit.id, x: unit.point.x + 62, y: unit.point.y + 40 })), x, y, primary.id, profile);
  f.shoot(x, y); const after = f.getBattle();
  let damage = 0, kills = 0;
  for (const unit of before.units) {
    const amount = victims.find(victim => victim.id === unit.id)?.damage || 0;
    const remaining = Math.max(0, unit.health - amount); damage += Math.min(unit.health, amount); kills += Number(remaining === 0);
    assert.equal(after.units.find(next => next.id === unit.id)?.health || 0, remaining);
  }
  assert.equal(f.getState().weaponStats.cannon.damage, damage);
  assert.equal(f.getState().weaponStats.cannon.hits, victims.length);
  assert.equal(f.getState().weaponStats.cannon.kills, kills);
  assert.equal(f.getState().unitDamage, damage); assert.equal(after.unitKills, kills);
  assert.equal(after.bank + after.spent, 500 + after.earned);
  for (const unit of after.units) if (!before.units.some(old => old.id === unit.id)) assert.equal(unit.health, unit.maxHealth);
  assert.equal(f.getAllies().created, 1); assert.equal(f.getAllies().units[0].health, 120);
});

test('a cannon ground blast still deals half damage to nearby tanks without a direct hit', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.select('cannon');
  const before = f.getBattle(), highest = before.units.reduce((a, b) => a.point.y <= b.point.y ? a : b);
  const x = highest.point.x + 62, y = highest.point.y + 40 - 180;
  const victims = cannonBlast(before.units.map(unit => ({ id: unit.id, x: unit.point.x + 62, y: unit.point.y + 40 })), x, y, null, weaponProfile(f.getState(), 'cannon'));
  assert.ok(victims.length > 0); f.shoot(x, y);
  assert.equal(f.getState().weaponStats.cannon.damage, victims.length * 28);
  assert.equal(f.getBattle().unitKills, 0); assert.equal(f.getAllies().created, 1);
});

test('flame cone geometry follows the aim, rejects targets behind/outside, and counts a direct hit only once', () => {
  const profile = { ...weaponProfile(createState(), 'flamer'), flameSplashRadius: 0 };
  const shape = flameShape(143, 0, 0, profile);
  assert.equal(shape.x, 0); assert.equal(shape.length, 220); assert.equal(shape.width, 160);
  const points = [{ id: 1, x: 143, y: 0 }, { id: 2, x: 220, y: 80 },
    { id: 3, x: 100, y: 40 }, { id: 4, x: -1, y: 0 }, { id: 5, x: 221, y: 0 }];
  assert.deepEqual(flameVictims(points, shape, 1).map(point => point.id), [1, 2]);
  const turned = flameShape(0, 143, Math.PI / 2, profile);
  assert.deepEqual(flameVictims([{ id: 1, x: 0, y: 150 }, { id: 2, x: 80, y: 50 }], turned).map(point => point.id), [1]);
});

test('flamer splash hits around the aim and contact with tank bodies counts without double damage', () => {
  const shape = flameShape(143, 0, 0, weaponProfile(createState(), 'flamer'));
  assert.equal(shape.splashRadius, 85);
  const points = [{ id: 1, x: 143, y: 0, radius: 28 }, // Cursor, cone and splash still select it once.
    { id: 2, x: 143, y: 85 }, { id: 3, x: 143, y: 85.01 },
    { id: 4, x: 143, y: 113, radius: 28 }, { id: 5, x: 143, y: 113.01, radius: 28 },
    { id: 6, x: 100, y: -50, radius: 20 }, // Body touches the cone, center is outside it.
    { id: 7, x: -40, y: 0, radius: 28 }, { id: 8, x: NaN, y: 0 }];
  assert.deepEqual(flameVictims(points, shape, 1).map(point => point.id), [1, 2, 4, 6]);
  const turned = flameShape(0, 143, Math.PI / 2, weaponProfile(createState(), 'flamer'));
  assert.deepEqual(flameVictims([{ id: 1, x: 85, y: 143 }, { id: 2, x: 113.01, y: 143, radius: 28 }], turned).map(point => point.id), [1]);
});

test('aiming at empty space scorches multiple nearby tanks without direct cursor hits or friendly fire', async () => {
  const savedRandom = Math.random;
  try {
    Math.random = () => 0;
    const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
    f.select('cannon'); f.shoot(1100, 700); const allies = f.getAllies();
    f.select('flamer'); const before = f.getBattle();
    assert.ok(before.units.length > 1);
    // Every enemy is at (12,20), center (74,60). Cursor is below their hit boxes
    // and their centers are outside this sideways jet, but inside its splash.
    f.shoot(74, 140);
    assert.equal(f.getState().weaponStats.flamer.hits, before.units.length);
    assert.equal(f.getState().weaponStats.flamer.damage, before.units.length * 24);
    for (const unit of f.getBattle().units) assert.equal(unit.health, unit.maxHealth - 24);
    assert.deepEqual(f.getAllies(), allies);
    const damage = f.getState().weaponStats.flamer.damage;
    f.shoot(74, 140); f.advance(1000);
    assert.equal(f.getState().weaponStats.flamer.damage, damage); // Rejected cooldown and cosmetic flames never tick damage.
    f.reset(); assert.equal(f.nodes.armoryDamage.children.length, 0);
  } finally { Math.random = savedRandom; }
});

test('flamer snapshots enemy victims and upgraded damage, excludes allies/replacements, and conserves rewards', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
  f.select('cannon'); f.shoot(900, 700); f.select('flamer');
  const ally = f.getAllies();
  for (let shot = 0; shot < 10; shot++) {
    if (f.getBattle().waves.phase === 'break') f.advance(4000);
    f.next(180);
    const before = f.getBattle(), primary = before.units.at(-1), profile = weaponProfile(f.getState(), 'flamer');
    const x = primary.point.x + 62, y = primary.point.y + 40;
    const shape = flameShape(x, y, Math.atan2(y - 142, x - 166), profile);
    const victims = flameVictims(before.units.map(unit => ({ id: unit.id, x: unit.point.x + 62, y: unit.point.y + 40, radius: 28 })), shape, primary.id);
    const stats = f.getState().weaponStats.flamer;
    f.shoot(x, y); const after = f.getBattle(); let removed = 0, kills = 0;
    for (const unit of before.units) {
      const amount = victims.some(victim => victim.id === unit.id) ? profile.shotDamage : 0;
      const remaining = Math.max(0, unit.health - amount);
      removed += Math.min(unit.health, amount); kills += Number(remaining === 0);
      assert.equal(after.units.find(next => next.id === unit.id)?.health || 0, remaining);
    }
    assert.equal(f.getState().weaponStats.flamer.damage, stats.damage + removed);
    assert.equal(f.getState().weaponStats.flamer.kills, stats.kills + kills);
    for (const unit of after.units) if (!before.units.some(old => old.id === unit.id)) assert.equal(unit.health, unit.maxHealth);
    assert.equal(after.bank + after.spent, 500 + after.earned);
    assert.deepEqual(f.getAllies(), ally);
  }
  assert.ok(f.getState().weaponStats.flamer.kills > 0);
});

function clearWave(f) {
  if (f.getState().weapon !== 'machinegun') f.select('machinegun');
  for (let tries = 0; tries < 1000 && f.getBattle().waves.phase === 'combat'; tries++) {
    const unit = f.getBattle().units[0]; assert.ok(unit);
    f.next(160); f.shoot(unit.point.x + 62, unit.point.y + 40);
  }
  assert.equal(f.getBattle().waves.phase, 'break');
}

test('mounted waves clear, rest for four active seconds, pause on safe exits, and reset completely', async () => {
  const f = fixture({ reduced: true }); await f.ready;
  assert.equal(f.nodes.armoryWave.hidden, true); popBalloon(f);
  assert.equal(f.nodes.armoryWaveTitle.textContent, 'Wave 1');
  const copy = f.getBattle(); copy.waves.limit = -1; assert.equal(f.getBattle().waves.limit, 8);
  clearWave(f);
  assert.equal(f.nodes.armoryWaveTitle.textContent, 'Wave 1 cleared!');
  assert.equal(f.nodes.armoryWaveProgress.value, 8); assert.equal(f.getBattle().units.length, 0);
  f.advance(1000); assert.equal(f.getBattle().waves.remainingMs, 3000);
  for (const exit of ['disarm', 'hidden', 'blur', 'modal']) {
    if (exit === 'disarm') f.select(null);
    if (exit === 'hidden') { f.doc.hidden = true; f.doc.emit('visibilitychange'); }
    if (exit === 'blur') f.win.emit('blur');
    if (exit === 'modal') { f.doc.modalOpen = true; f.observe(); }
    f.advance(10000); assert.equal(f.getBattle().waves.remainingMs, 3000, exit);
    assert.equal(f.getBattle().units.length, 0);
    if (exit === 'hidden') { f.doc.hidden = false; f.doc.emit('visibilitychange'); }
    if (exit === 'blur') f.win.emit('focus');
    if (exit === 'modal') { f.doc.modalOpen = false; }
    if (!f.getState().weapon) f.select('machinegun');
  }
  f.advance(2999); assert.equal(f.getBattle().waves.number, 1);
  f.advance(1); assert.equal(f.getBattle().waves.number, 2);
  assert.equal(f.getBattle().waves.limit, 10); assert.ok(f.getBattle().units.length > 0);
  assert.match(f.nodes.armoryWaveDetail.textContent, /enemy HP \+15%/);
  assert.equal(f.getBattle().bank + f.getBattle().spent, 500 + f.getBattle().earned);
  f.reset(); assert.equal(f.getBattle().waves, null); assert.equal(f.nodes.armoryWave.hidden, true);
  f.advance(10000); assert.equal(f.getBattle().active, false); assert.equal(f.getBattle().units.length, 0);
});

test('returning bosses enrage once at half HP, call budgeted enemies, and reset phase on respawn', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.advance(5000);
  f.nodes.siteNewsBalloon.getBoundingClientRect = () => ({ left: 1300, top: 50, width: 132, height: 184 });
  f.select('laser'); const initial = f.getBattle();
  for (let i = 0; i < 14; i++) { f.next(1000); f.shoot(1366, 122); }
  assert.equal(f.getState().health, 524); assert.equal(f.getState().bossEnraged, false);
  assert.equal(f.getBattle().waves.calls, 0);
  f.next(1000); f.shoot(1366, 122);
  assert.equal(f.getState().health, 490); assert.equal(f.getState().bossEnraged, true);
  assert.equal(f.getBattle().waves.calls, 1); assert.equal(f.getBattle().waves.limit, 10);
  assert.equal(f.nodes.siteNewsBalloon.dataset.bossPhase, 'enraged');
  assert.match(f.nodes.armoryBossStatus.textContent, /ENRAGED.*2 enemies called/);
  assert.equal(f.getBattle().bank + f.getBattle().spent, initial.bank + initial.spent);
  for (let i = 0; i < 15; i++) { f.next(1000); f.shoot(1366, 122); }
  assert.equal(f.getState().health, 0); assert.equal(f.getBattle().waves.calls, 1);
  assert.equal(f.getBattle().score, 2); assert.equal(f.getState().unitDamage, 0);
  f.advance(5000);
  assert.equal(f.getState().bossEnraged, false); assert.equal(f.getState().health, 1000);
  assert.equal(f.nodes.siteNewsBalloon.dataset.bossPhase, 'patrolling');
  f.reset(); assert.equal(f.getBattle().waves, null);
});

test('boss reinforcements during a break wait for the next wave instead of interrupting rest', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
  f.select(null); f.select('machinegun'); // Restore the defeated boss for news, retaining Wave 1.
  clearWave(f);
  f.nodes.siteNewsBalloon.getBoundingClientRect = () => ({ left: 1300, top: 50, width: 132, height: 184 });
  f.select('laser'); const before = f.getBattle();
  while (f.getState().health > 500) { f.next(1000); f.shoot(1366, 122); }
  assert.equal(f.getBattle().waves.phase, 'break'); assert.equal(f.getBattle().waves.pending, 2);
  assert.equal(f.getBattle().units.length, 0); assert.equal(f.getBattle().earned, before.earned);
  assert.equal(f.getBattle().bank + f.getBattle().spent, before.bank + before.spent);
  f.advance(4000);
  assert.equal(f.getBattle().waves.number, 2); assert.equal(f.getBattle().waves.limit, 12);
  assert.equal(f.getBattle().waves.pending, 0);
});

test('held accessible fire waits through an empty break and resumes on the next wave without extra shots', async () => {
  const savedRandom = Math.random;
  try {
    Math.random = () => 0;
    const f = fixture({ reduced: true }); await f.ready; popBalloon(f);
    hold(f, { target: f.nodes.armoryFire }); f.advance(2600);
    assert.equal(f.getBattle().waves.phase, 'break'); assert.equal(f.getState().health, 0);
    const shots = f.getState().shots;
    f.advance(500); assert.equal(f.getState().shots, shots);
    assert.equal(f.nodes.siteArmory.dataset.firing, 'true');
    f.advance(4000); assert.equal(f.getBattle().waves.number, 2);
    assert.ok(f.getState().shots > shots);
    f.doc.emit('pointerup', { pointerId: 7 }); const released = f.getState().shots;
    f.advance(2000); assert.equal(f.getState().shots, released);
  } finally { Math.random = savedRandom; }
});

test('flamer key 5 holds at 180ms, stops damage on release/exits, and keeps all heat effects bounded and repairable', () => {
  for (const exit of ['up', 'cancel', 'blur', 'hidden', 'modal', 'disarm', 'repair', 'pagehide']) {
    const f = fixture({ reduced: true }); f.doc.emit('keydown', { key: '5' });
    assert.equal(f.getState().weapon, 'flamer'); hold(f);
    f.advance(179); assert.equal(f.getState().shots, 1);
    f.advance(1); assert.equal(f.getState().shots, 2);
    if (exit === 'up') f.doc.emit('pointerup', { pointerId: 7 });
    if (exit === 'cancel') f.doc.emit('pointercancel', { pointerId: 7 });
    if (exit === 'blur') f.win.emit('blur');
    if (exit === 'hidden') { f.doc.hidden = true; f.doc.emit('visibilitychange'); }
    if (exit === 'modal') { f.doc.modalOpen = true; f.observe(); }
    if (exit === 'disarm') f.select(null);
    if (exit === 'repair') f.reset();
    if (exit === 'pagehide') f.win.emit('pagehide');
    const before = f.getState(); f.advance(4000);
    assert.equal(f.getState().shots, before.shots); assert.equal(f.getState().health, before.health);
    assert.equal(f.nodes.armoryDamage.children.filter(node => node.className === 'armory-flame-jet').length, 0);
  }
  const f = fixture({ reduced: true }); f.select('flamer');
  for (let i = 0; i < 100; i++) { f.next(180); f.shoot(900, 700); }
  const marks = f.nodes.armoryDamage.children.filter(node => node.className === 'armory-mark');
  assert.equal(marks.length, MAX_MARKS); assert.ok(marks.every(mark => mark.dataset.kind === 'flamer'));
  assert.ok(f.nodes.armoryDamage.children.length <= MAX_MARKS + 32);
  f.reset(); assert.equal(f.nodes.armoryDamage.children.length, 0); assert.equal(f.timers.size, 0);
});

test('rocket soot is created at impact only, survives disarm/scroll, and repair clears every mark', async () => {
  const f = fixture({ reduced: true }); await f.ready; popBalloon(f); f.select('rockets');
  f.shoot(1100, 700);
  const soot = () => f.nodes.armoryDamage.children.filter(node => node.className === 'armory-mark' && node.dataset.kind === 'rockets');
  assert.equal(soot().length, 0);
  f.select(null); f.fly(4000); assert.equal(soot().length, 0);
  f.select('rockets'); f.next(1000); f.shoot(1100, 700); f.fly(1600);
  assert.equal(soot().length, 2);
  for (const mark of soot()) { assert.equal(mark.children.length, 1); assert.match(mark.style.left, /var\(--armory-scroll-x/); }
  f.select(null); const marks = soot(); f.win.scrollY = 600; f.win.emit('scroll');
  assert.deepEqual(soot(), marks); assert.equal(f.nodes.armoryDamage.style['--armory-scroll-y'], '600px');
  f.reset(); assert.equal(soot().length, 0); assert.equal(f.nodes.armoryDamage.children.length, 0);
});

test('flamer uses the original projectile model atlas frames, with an unmodified local texture and license', () => {
  const definition = JSON.parse(fs.readFileSync(require.resolve('../mapmaker/pies/components/weapons/weapons.json'), 'utf8')).Flame1Mk1;
  assert.equal(FLAME_SPRITE.model.split('/').at(-1), definition.flightGfx.toLowerCase());
  const pie = fs.readFileSync(require.resolve('../' + FLAME_SPRITE.model), 'utf8');
  const polygon = pie.split(/\r?\n/).find(line => /^\s*4200 /.test(line)).trim().split(/\s+/).map(Number);
  const offset = 2 + polygon[1];
  assert.equal(polygon[offset], FLAME_SPRITE.frames);
  assert.equal(polygon[offset + 2], FLAME_SPRITE.width); assert.equal(polygon[offset + 3], FLAME_SPRITE.height);
  const uv = polygon.slice(offset + 4);
  assert.equal(Math.min(...uv.filter((_, i) => i % 2 === 0)), FLAME_SPRITE.x);
  assert.equal(Math.min(...uv.filter((_, i) => i % 2 === 1)), FLAME_SPRITE.y);
  assert.match(pie, /TEXTURE 0 page-21-fx.png 256 256/);
  const image = fs.readFileSync(require.resolve('../' + FLAME_SPRITE.texture));
  assert.equal(image.readUInt32BE(16), FLAME_SPRITE.atlasSize); assert.equal(image.readUInt32BE(20), FLAME_SPRITE.atlasSize);
  assert.equal(require('node:crypto').createHash('sha256').update(image).digest('hex'), '20e3aa2a9ade8448e87c26edcb96e04d7dc3196d080544e3414119253cffc4d1');
  assert.ok(FLAME_SPRITE.x + FLAME_SPRITE.width * FLAME_SPRITE.frames <= FLAME_SPRITE.atlasSize);
  assert.match(fs.readFileSync(require.resolve('../assets/vendor/warzone-effects/COPYING'), 'utf8'), /GNU GENERAL PUBLIC LICENSE/);
  const css = fs.readFileSync(require.resolve('../site-armory.css'), 'utf8');
  assert.ok(css.includes(FLAME_SPRITE.texture)); assert.match(css, /\.462s steps\(7\) infinite/);
  assert.match(css, /mix-blend-mode: screen/);
  const containerRule = css.match(/\.armory-flame-jet \{([^}]+)\}/)[1];
  assert.doesNotMatch(containerRule, /clip-path|background|radial-gradient/);
});

test('textured flame particles are finite, bounded and finish before their container cleanup', () => {
  const shape = flameShape(300, 200, .8, weaponProfile(createState(), 'flamer'));
  for (const value of [0, .5, .999]) {
    const particles = flameParticles(shape, () => value);
    assert.equal(particles.length, 9);
    assert.equal(new Set(particles.map(particle => particle.frame)).size, 7);
    for (const particle of particles) {
      assert.ok(Object.values(particle).every(Number.isFinite));
      assert.ok(particle.x + particle.dx > 0 && particle.x + particle.dx <= shape.length);
      assert.ok(Math.abs(particle.y + particle.dy) < shape.width / 2);
      assert.ok(particle.delay + particle.duration < 500);
      assert.ok(particle.scale >= 2.5 && particle.scale <= 4);
    }
    assert.equal(flameParticles(shape, () => value, false).length, 3);
  }
});

test('mounted flame stream uses real textured particles, respects reduced motion and cleans up without changing damage', () => {
  for (const [hostname, reduced, expectedMotion, count] of [['', false, true, 16], ['', true, false, 6], ['127.0.0.1', true, true, 16]]) {
    const f = fixture({ hostname, reduced }); f.select('flamer'); f.shoot(400, 450);
    const jet = f.nodes.armoryDamage.children.find(node => node.className === 'armory-flame-jet');
    assert.equal(jet.dataset.motion, String(expectedMotion)); assert.equal(jet.dataset.effectModel, FLAME_SPRITE.model);
    assert.equal(jet.children.length, count);
    assert.ok(jet.children.every(node => node.className === 'armory-flame-particle' && node.children[0].className === 'armory-flame-sprite'));
    assert.equal(f.getState().shots, 1); assert.equal(f.getState().unitDamage, 0);
    const health = f.getState().health; f.advance(500);
    assert.equal(f.nodes.armoryDamage.children.includes(jet), false); assert.equal(f.getState().health, health);
    f.shoot(400, 450); f.reset(); assert.equal(f.nodes.armoryDamage.children.length, 0);
  }
});

test('splash flames use bounded original sprites and finish with the jet, also in reduced motion', () => {
  const shape = flameShape(300, 200, 1, weaponProfile(createState(), 'flamer'));
  for (const motion of [true, false]) {
    const particles = flameSplashParticles(shape, motion);
    assert.equal(particles.length, motion ? 7 : 3);
    for (const particle of particles) {
      assert.ok(Object.values(particle).every(Number.isFinite));
      assert.ok(particle.frame >= 0 && particle.frame < FLAME_SPRITE.frames);
      assert.ok(particle.duration + particle.delay < 500);
      assert.ok(Math.hypot(particle.x - shape.length * .65, particle.y) <= shape.splashRadius);
      if (motion) assert.ok(Math.hypot(particle.dx, particle.dy) <= shape.splashRadius);
    }
  }
});

test('research tiers use real unlocks and models, with sorted mini-game thresholds and safe boundaries', () => {
  const tech = require('../site-armory-tech.js'), reference = require('./armory-tech-research.json');
  const weapons = JSON.parse(fs.readFileSync(require.resolve('../mapmaker/pies/components/weapons/weapons.json'), 'utf8'));
  assert.equal(Object.values(tech.PATHS).flat().length, 21);
  for (const [weapon, path] of Object.entries(tech.PATHS)) {
    assert.equal(path[0].level, 1); assert.equal(path.at(-1).level, 20);
    for (const [i, stage] of path.entries()) {
      assert.ok(reference.topics[stage.research].resultComponents.includes(stage.definition));
      assert.equal(weapons[stage.definition].model.toLowerCase(), stage.barrel);
      assert.equal(weapons[stage.definition].mountModel.toLowerCase(), stage.mount);
      assert.equal(weapons[stage.definition].name, stage.name);
      assert.ok(i === 0 || stage.level > path[i - 1].level);
      const power = UPGRADE_MILESTONES[stage.level - 1];
      const profile = weaponProfile({ ...createState(), powerEarned: power }, weapon);
      assert.equal(profile.definition, stage.definition); assert.equal(profile.tier, i + 1);
      assert.equal(profile.tierCount, path.length); assert.equal(profile.cooldown, WEAPONS[weapon].cooldown);
      assert.equal(tech.tierFor(weapon, stage.level - .01).definition, (path[Math.max(0, i - 1)]).definition);
      assert.equal(profile.nextTier?.definition || null, path[i + 1]?.definition || null);
    }
    assert.equal(tech.tierFor(weapon, -10).tier, 1); assert.equal(tech.tierFor(weapon, NaN).tier, 1);
    assert.equal(tech.tierFor(weapon, 999).tier, path.length);
  }
  assert.equal(tech.tierFor('__proto__'), null);
});

test('earned power changes labels, model selection and next-tier hints; disarm preserves tech and Repair resets it', async () => {
  const f = fixture({ reduced: true }); await f.ready;
  assert.equal(f.nodes.armoryTech.hidden, true);
  f.select('flamer');
  assert.equal(f.nodes.armoryTechName.textContent, 'Tier 1/3 · Flamer');
  assert.match(f.nodes.armoryTechNext.textContent, /Inferno.*Lv 10.*40000 more earned power/);
  assert.equal(f.nodes.armoryTechPath.children.length, 3);
  const samePath = f.nodes.armoryTechPath.children[0]; f.shoot(900, 700);
  assert.equal(f.nodes.armoryTechPath.children[0], samePath);
  f.select(null); popBalloon(f);
  for (let shot = 0; shot < 2000 && upgradeProgress(f.getState().powerEarned).level < 5; shot++) {
    if (f.getBattle().waves.phase === 'break') f.advance(4000);
    const target = f.getBattle().units.at(-1); f.next(160); f.shoot(target.point.x + 62, target.point.y + 40);
  }
  assert.ok(upgradeProgress(f.getState().powerEarned).level >= 5);
  const mg = f.buttons.find(button => button.dataset.weapon === 'machinegun');
  const cannon = f.buttons.find(button => button.dataset.weapon === 'cannon');
  assert.equal(mg.dataset.definition, 'MG2Mk1'); assert.equal(f.nodes['armoryLabel-machinegun'].textContent, 'Twin Machinegun');
  assert.equal(cannon.dataset.definition, 'Cannon2A-TMk1'); assert.equal(f.nodes['armoryTier-cannon'].textContent, 'T2');
  assert.match(f.nodes.armoryTechName.textContent, /Tier 2\/5.*Twin Machinegun/);
  assert.equal(f.nodes.armoryTechPath.children[0].dataset.state, 'complete');
  assert.equal(f.nodes.armoryTechPath.children[1].attributes['aria-current'], 'step');
  const earned = f.getState().powerEarned; f.select(null);
  assert.equal(f.nodes.armoryTech.hidden, true); assert.equal(mg.dataset.definition, 'MG2Mk1');
  f.select('machinegun'); assert.equal(f.getState().powerEarned, earned);
  f.reset(); assert.equal(mg.dataset.definition, 'MG1Mk1'); assert.equal(cannon.dataset.definition, 'Cannon1Mk1');
  assert.equal(f.nodes['armoryTier-machinegun'].textContent, 'T1');
  assert.equal(f.nodes.armoryTechPath.children[0].attributes['aria-current'], 'step');
});
