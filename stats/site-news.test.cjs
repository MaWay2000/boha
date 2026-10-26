const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { NEWS, normalizeArchive, bounds, createFlight, advanceFlight, mount } = require('../balloon/site-news.js');

test('all balloon/game source files live in balloon with no root compatibility copies', () => {
  const path = require('node:path'), root = path.resolve(__dirname, '..');
  const files = fs.readdirSync(path.join(root, 'balloon')).filter(name => /^site-(armory|news).*\.(js|mjs|css)$/.test(name));
  assert.equal(files.length, 16);
  for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), false, `Root copy remains: ${file}`);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const entrypoints = [...html.matchAll(/(?:src|href)="((?:balloon\/)?site-(?:armory|news)[^"?]+)(?:\?[^" ]*)?"/g)].map(match => match[1]);
  assert.equal(entrypoints.length, 12);
  for (const entry of entrypoints) {
    assert.ok(entry.startsWith('balloon/')); assert.ok(fs.existsSync(path.join(root, entry)));
    assert.equal(new URL(entry, 'https://example.test/boha/index.html').pathname, '/boha/' + entry);
  }
});

test('relocated module imports, resource prefixes and CSS assets resolve from the balloon folder', () => {
  const path = require('node:path'), directory = path.resolve(__dirname, '../balloon');
  let checked = 0;
  for (const file of fs.readdirSync(directory).filter(name => /\.(js|mjs|css)$/.test(name))) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    const references = [...source.matchAll(/(?:from\s+|require\(\s*|new URL\(\s*)(['"])(\.{1,2}\/[^'"]+)\1/g)].map(match => match[2]);
    if (file.endsWith('.css')) references.push(...[...source.matchAll(/url\(['"]?(\.\.\/[^)'"\s]+)['"]?\)/g)].map(match => match[1]));
    for (const reference of references) {
      const target = path.resolve(directory, reference.split('?')[0]);
      assert.ok(fs.existsSync(target), `${file} has an unresolved path: ${reference}`); checked++;
    }
  }
  assert.ok(checked >= 30);
});

test('flight is bounded to the viewport and a maximum 300px vertical range', () => {
  for (const dimensions of [[1440, 900, 132, 184], [375, 600, 108, 152], [80, 100, 132, 184]]) {
    const limits = bounds(...dimensions);
    let state = createFlight(limits, () => 0.9);
    for (let i = 0; i < 20000; i++) {
      state = advanceFlight(state, 1 / 60, limits, () => (i % 10) / 10);
      assert.ok(state.x >= 0 && state.x <= limits.maxX);
      assert.ok(state.y >= 0 && state.y <= limits.maxY && state.y <= 300);
    }
  }
});
test('balloon reverses at both horizontal edges', () => {
  const limits = bounds(800, 700, 132, 184);
  let state = createFlight(limits, () => 0.5);
  state.x = 0.1; state.direction = -1;
  state = advanceFlight(state, 0.05, limits);
  assert.equal(state.x, 0); assert.equal(state.direction, 1);
  state.x = limits.maxX - 0.1;
  state = advanceFlight(state, 0.05, limits);
  assert.equal(state.x, limits.maxX); assert.equal(state.direction, -1);
});
test('random vertical targets ease smoothly and long inactive intervals do not jump', () => {
  const limits = bounds(1400, 900, 132, 184);
  const state = createFlight(limits, () => 0.9);
  const next = advanceFlight(state, 600, limits);
  assert.ok(Math.abs(next.x - state.x) <= 1.401);
  assert.ok(Math.abs(next.y - state.y) < 1);
  assert.notEqual(next.y, state.y);
});
test('resizing clamps old flight coordinates into the new safe range', () => {
  const state = createFlight(bounds(1400, 1000, 132, 184), () => 0.9);
  state.x = 1200; state.y = 299;
  const limits = bounds(320, 240, 108, 152);
  const next = advanceFlight(state, 0.016, limits);
  assert.ok(next.x <= limits.maxX); assert.ok(next.y <= limits.maxY);
});
test('release notes are unique, dated newest-first and contain no HTML payloads', () => {
  assert.equal(new Set(NEWS.map(item => item.id)).size, NEWS.length);
  for (const [i, item] of NEWS.entries()) {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.title && item.text);
    assert.equal(/<|>/.test(item.text), false);
    if (i) assert.ok(NEWS[i - 1].date >= item.date);
  }
});
test('integration is shell-only with a native accessible dialog and safe text rendering', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const script = fs.readFileSync(require.resolve('../balloon/site-news.js'), 'utf8');
  assert.match(html, /<dialog[^>]+id="siteNewsDialog"[^>]+aria-labelledby="siteNewsTitle"/);
  assert.match(html, /aria-haspopup="dialog" aria-controls="siteNewsDialog"/);
  assert.match(script, /dialog\.showModal\(\)/);
  assert.match(script, /button\.focus\(\{ preventScroll: true \}\)/);
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(script, /visibilitychange/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML/);
});

function browserFixture({ reduced = false, blockedStorage = false, read = null, motion = null, url = null, records = NEWS, fetch = null } = {}) {
  class Element {
    constructor(id) { this.id = id; this.listeners = {}; this.dataset = {}; this.style = {}; this.attributes = {}; this.children = []; this.hidden = false; this.open = false; this.offsetWidth = 132; this.offsetHeight = 184; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type, details = {}) { for (const fn of this.listeners[type] || []) fn({ target: this, ...details }); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    focus() { doc.activeElement = this; this.emit('focus'); }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    getBoundingClientRect() { return { left: 100, right: 700, top: 50, bottom: 650 }; }
  }
  const ids = ['siteNewsBalloon', 'siteNewsDialog', 'siteNewsClose', 'siteNewsUnread', 'siteNewsList', 'siteNewsMotion', 'siteNewsArchiveStatus', 'siteNewsOlder'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  const bodyClasses = new Set();
  const doc = new Element('document');
  doc.documentElement = { clientWidth: 1200 }; doc.hidden = false;
  doc.getElementById = id => elements[id];
  doc.createElement = tag => new Element(tag);
  doc.body = { classList: { add: value => bodyClasses.add(value), remove: value => bodyClasses.delete(value) } };
  const media = new Element('media'); media.matches = reduced;
  const win = new Element('window'); win.document = doc; win.innerHeight = 800;
  doc.baseURI = url || 'http://localhost/index.html';
  if (fetch) win.fetch = fetch;
  if (url) {
    win.location = { href: url };
    win.history = { replaceState(_, __, next) { win.location.href = String(next); } };
  }
  win.matchMedia = () => media;
  const storage = new Map(read ? [['boha.siteNews.lastRead', read]] : []);
  if (motion != null) storage.set('boha.siteNews.motion', motion);
  win.localStorage = { getItem: key => { if (blockedStorage) throw Error('Blocked'); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (blockedStorage) throw Error('Blocked'); storage.set(key, value); } };
  const frames = new Map(); let id = 0, now = 0;
  win.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  win.cancelAnimationFrame = id => frames.delete(id);
  const timers = new Map();
  win.setTimeout = (fn, delay) => { timers.set(++id, { fn, delay }); return id; };
  win.clearTimeout = id => timers.delete(id);
  const controller = mount(win, records);
  return { win, doc, elements, bodyClasses, frames, storage, media, timers, ready: controller.ready,
    finishHoverPause() { const pending = [...timers.values()]; timers.clear(); pending.forEach(timer => timer.fn()); },
    step() { const pending = [...frames.values()]; frames.clear(); now += 16; pending.forEach(fn => fn(now)); } };
}

test('mounted balloon moves, pauses on hover/focus/hidden tabs, and avoids duplicate mounting', () => {
  const f = browserFixture();
  const button = f.elements.siteNewsBalloon;
  const initial = button.style.transform;
  f.step(); f.step(); assert.notEqual(button.style.transform, initial);
  button.emit('pointerenter'); assert.equal(f.frames.size, 0);
  button.emit('pointerleave'); assert.equal(f.frames.size, 1);
  f.doc.emit('keydown'); button.emit('focus'); assert.equal(f.frames.size, 0);
  button.emit('blur'); assert.equal(f.frames.size, 1);
  f.doc.hidden = true; f.doc.emit('visibilitychange'); assert.equal(f.frames.size, 0);
  f.doc.hidden = false; f.doc.emit('visibilitychange'); assert.equal(f.frames.size, 1);
  mount(f.win); assert.equal(button.listeners.click.length, 1);
});

test('popup pauses flight, marks news read, and restores focus on close even with blocked storage', () => {
  for (const blockedStorage of [false, true]) {
    const f = browserFixture({ blockedStorage });
    const { siteNewsBalloon: button, siteNewsDialog: dialog, siteNewsClose: close, siteNewsUnread: unread } = f.elements;
    button.emit('click');
    assert.equal(dialog.open, true); assert.equal(unread.hidden, true);
    assert.equal(f.frames.size, 0); assert.equal(f.doc.activeElement, close);
    assert.equal(f.bodyClasses.has('site-news-open'), true);
    close.emit('click');
    assert.equal(dialog.open, false); assert.equal(f.doc.activeElement, button);
    assert.equal(button.attributes['aria-expanded'], 'false');
    assert.equal(f.bodyClasses.has('site-news-open'), false);
  }
});

test('reduced-motion users can explicitly opt into animation and save that preference', () => {
  const f = browserFixture({ reduced: true });
  const control = f.elements.siteNewsMotion;
  assert.equal(control.checked, false); assert.equal(f.frames.size, 0);
  control.checked = true; control.emit('change');
  assert.equal(f.frames.size, 1); assert.equal(f.storage.get('boha.siteNews.motion'), 'on');
  control.checked = false; control.emit('change'); assert.equal(f.frames.size, 0);
});

test('clicking dialog padding does not dismiss it, while a real backdrop click does', () => {
  const f = browserFixture(); const dialog = f.elements.siteNewsDialog;
  f.elements.siteNewsBalloon.emit('click');
  dialog.emit('click', { clientX: 200, clientY: 60 }); assert.equal(dialog.open, true);
  dialog.emit('click', { clientX: 10, clientY: 10 }); assert.equal(dialog.open, false);
});

test('explicit flight preview starts moving even with reduced motion or a saved off preference', () => {
  for (const blockedStorage of [false, true]) {
    const f = browserFixture({ reduced: true, blockedStorage, motion: 'off', url: 'http://localhost/index.html?newsFlight=on' });
    assert.equal(f.elements.siteNewsMotion.checked, true);
    assert.equal(f.elements.siteNewsBalloon.dataset.flying, 'true');
    const before = f.elements.siteNewsBalloon.style.transform;
    f.step(); f.step();
    assert.notEqual(f.elements.siteNewsBalloon.style.transform, before);
  }
});

test('hover pauses only briefly, then flight resumes without needing the pointer to leave', () => {
  const f = browserFixture(), button = f.elements.siteNewsBalloon;
  button.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(f.frames.size, 0);
  assert.equal([...f.timers.values()][0].delay, 1200);
  f.finishHoverPause();
  assert.equal(f.frames.size, 1); assert.equal(button.dataset.flying, 'true');
  const before = button.style.transform; f.step(); f.step();
  assert.notEqual(button.style.transform, before);
});

test('touch does not create a sticky hover pause and leaving clears pending hover timers', () => {
  const f = browserFixture(), button = f.elements.siteNewsBalloon;
  button.emit('pointerenter', { pointerType: 'touch' });
  assert.equal(f.frames.size, 1); assert.equal(f.timers.size, 0);
  button.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(f.timers.size, 1);
  button.emit('pointerleave'); assert.equal(f.timers.size, 0);
});

test('disabling flight explicitly still wins over an opt-in preview on future reloads', () => {
  const f = browserFixture({ reduced: true, url: 'http://localhost/index.html?newsFlight=on&tab=compare' });
  f.elements.siteNewsMotion.checked = false; f.elements.siteNewsMotion.emit('change');
  assert.equal(f.frames.size, 0); assert.equal(f.storage.get('boha.siteNews.motion'), 'off');
  assert.equal(new URL(f.win.location.href).searchParams.has('newsFlight'), false);
  assert.equal(new URL(f.win.location.href).searchParams.get('tab'), 'compare');
});

test('plain localhost preview flies by default even when the browser prefers reduced motion', () => {
  for (const hostname of ['127.0.0.1', 'localhost', '[::1]']) {
    for (const blockedStorage of [false, true]) {
      const f = browserFixture({ reduced: true, blockedStorage, url: `http://${hostname}:4173/index.html` });
      const button = f.elements.siteNewsBalloon;
      assert.equal(f.elements.siteNewsMotion.checked, true);
      assert.equal(button.dataset.flying, 'true');
      const before = button.style.transform;
      f.step(); f.step();
      assert.notEqual(button.style.transform, before);
      f.media.emit('change'); assert.equal(button.dataset.flying, 'true');
    }
  }
});

test('public visitors still default to reduced motion and an explicit local off choice is honored', () => {
  const publicPage = browserFixture({ reduced: true, url: 'https://maway2000.github.io/boha/' });
  assert.equal(publicPage.elements.siteNewsMotion.checked, false);
  const local = browserFixture({ reduced: true, motion: 'off', url: 'http://127.0.0.1:4173/index.html' });
  assert.equal(local.elements.siteNewsMotion.checked, false);
  assert.equal(local.elements.siteNewsBalloon.dataset.flying, 'false');
  assert.match(local.elements.siteNewsMotion.title, /Flight is off/);
});

function archiveRecords(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `record-${i}`, date: '2026-10-23', category: 'Interface', title: `Update ${i}`, text: `Details ${i}`
  }));
}

test('archive validates complete records and real dates, rejects duplicate IDs, and keeps same-day order', () => {
  const records = archiveRecords(3);
  records[0].date = '2026-10-22';
  records[1].privateField = 'not part of a news record';
  const archive = { schemaVersion: 1, entries: records };
  assert.deepEqual(normalizeArchive(archive).map(entry => entry.id), ['record-1', 'record-2', 'record-0']);
  assert.equal('privateField' in normalizeArchive(archive)[0], false);
  for (const invalid of [null, { schemaVersion: 2, entries: [] },
    { schemaVersion: 1, entries: [{ ...records[0], date: '2026-02-30' }] },
    { schemaVersion: 1, entries: [{ ...records[0], text: ' ' }] },
    { schemaVersion: 1, entries: [records[0], records[0]] }]) {
    assert.throws(() => normalizeArchive(invalid));
  }
});

test('archive preserves all original published news records', () => {
  for (const id of ['2026-10-23-awards', '2026-10-23-telemetry', '2026-10-22-match-details']) {
    assert.equal(NEWS.filter(entry => entry.id === id).length, 1);
  }
  const f = browserFixture();
  assert.equal(f.elements.siteNewsList.children.length, 3);
  assert.equal(f.elements.siteNewsOlder.hidden, false);
  f.elements.siteNewsOlder.emit('click');
  assert.equal(f.elements.siteNewsList.children.length, NEWS.length);
  assert.equal(f.elements.siteNewsOlder.hidden, true);
});

test('load older news reaches the entire archive without replacing or duplicating existing cards', () => {
  const records = archiveRecords(14), f = browserFixture({ records });
  const { siteNewsList: list, siteNewsOlder: older, siteNewsArchiveStatus: status } = f.elements;
  const first = list.children[0];
  f.elements.siteNewsBalloon.emit('click');
  for (const count of [6, 9, 12, 14]) {
    older.emit('click');
    assert.equal(list.children.length, count);
    assert.equal(list.children[0], first);
    assert.equal(older.hidden, count === 14);
    assert.match(status.textContent, new RegExp(`Showing ${count} of 14`));
  }
  assert.deepEqual(list.children.map(item => item.children[1].textContent), records.map(item => item.title));
  f.elements.siteNewsClose.emit('click');
  f.elements.siteNewsBalloon.emit('click');
  assert.equal(list.children.length, 14);
  assert.equal(f.storage.get('boha.siteNews.lastRead'), records[0].id);
  assert.equal(records.length, 14);
});

test('browser loads the complete canonical archive with revalidation under the GitHub Pages subpath', async () => {
  let request;
  const f = browserFixture({ records: [], url: 'https://maway2000.github.io/boha/index.html?tab=compare',
    fetch: async (...args) => { request = args; return { ok: true, json: async () => ({ schemaVersion: 1, entries: archiveRecords(8) }) }; } });
  await f.ready;
  assert.deepEqual(request, ['https://maway2000.github.io/boha/news/records.json', { cache: 'no-cache', credentials: 'same-origin' }]);
  assert.equal(f.elements.siteNewsList.children.length, 3);
  f.elements.siteNewsOlder.emit('click'); f.elements.siteNewsOlder.emit('click');
  assert.equal(f.elements.siteNewsList.children.length, 8);
  assert.equal(f.elements.siteNewsOlder.hidden, true);
  assert.equal(f.elements.siteNewsUnread.hidden, false);
});

test('opening while news is loading marks the actual newest ID read only after it arrives', async () => {
  let complete;
  const response = new Promise(resolve => { complete = resolve; });
  const f = browserFixture({ records: [], fetch: () => response });
  f.elements.siteNewsBalloon.emit('click');
  assert.equal(f.storage.has('boha.siteNews.lastRead'), false);
  complete({ ok: true, json: async () => ({ schemaVersion: 1, entries: archiveRecords(5) }) });
  await f.ready;
  assert.equal(f.storage.get('boha.siteNews.lastRead'), 'record-0');
  assert.equal(f.elements.siteNewsUnread.hidden, true);
  assert.equal(f.elements.siteNewsList.children.length, 3);
});

test('failed archive loading offers a working retry without stopping balloon flight', async () => {
  let calls = 0;
  const f = browserFixture({ records: [], fetch: async () => {
    if (++calls === 1) return { ok: false };
    return { ok: true, json: async () => ({ schemaVersion: 1, entries: archiveRecords(7) }) };
  } });
  await f.ready;
  assert.match(f.elements.siteNewsArchiveStatus.textContent, /Could not load/);
  assert.equal(f.elements.siteNewsOlder.textContent, 'Retry loading news');
  assert.equal(f.elements.siteNewsBalloon.dataset.flying, 'true');
  f.elements.siteNewsOlder.emit('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.match(f.elements.siteNewsArchiveStatus.textContent, /Showing 3 of 7/);
  assert.equal(f.elements.siteNewsOlder.textContent, 'Load older news');
});

test('invalid fetched archive leaves already loaded records intact and empty archives have no unread badge', async () => {
  const f = browserFixture({ fetch: async () => ({ ok: true, json: async () => ({ schemaVersion: 1, entries: [NEWS[0], NEWS[0]] }) }) });
  const first = f.elements.siteNewsList.children[0];
  await f.ready;
  assert.equal(f.elements.siteNewsList.children[0], first);
  assert.match(f.elements.siteNewsArchiveStatus.textContent, /could not be refreshed/);
  const empty = browserFixture({ records: [] });
  assert.equal(empty.elements.siteNewsOlder.hidden, true);
  assert.equal(empty.elements.siteNewsUnread.hidden, true);
  empty.win.emit('storage', { key: 'boha.siteNews.lastRead' });
  assert.equal(empty.elements.siteNewsUnread.hidden, true);
});

test('destroying the balloon stops flight and repair resumes it without changing news records', () => {
  const f = browserFixture(), button = f.elements.siteNewsBalloon;
  const first = f.elements.siteNewsList.children[0];
  button.dataset.destroyed = 'true'; button.emit('boha:news-balloon-destroyed');
  assert.equal(f.frames.size, 0); assert.equal(button.dataset.flying, 'false');
  button.emit('click'); assert.equal(f.elements.siteNewsDialog.open, false);
  button.dataset.destroyed = 'false'; button.emit('boha:news-balloon-repaired');
  assert.equal(f.frames.size, 1); assert.equal(button.dataset.flying, 'true');
  button.emit('click'); assert.equal(f.elements.siteNewsDialog.open, true);
  assert.equal(f.elements.siteNewsList.children[0], first);
});

test('balloon is anchored to the top of the document and pauses while scrolled out of view', () => {
  const css = fs.readFileSync(require.resolve('../balloon/site-news.css'), 'utf8');
  assert.match(css, /\.news-balloon \{\s*position: absolute;/);
  const f = browserFixture(), button = f.elements.siteNewsBalloon;
  const original = button.style.transform;
  f.win.scrollY = 900; f.win.emit('scroll');
  assert.equal(f.frames.size, 0); assert.equal(button.dataset.flying, 'false');
  assert.equal(button.style.transform, original);
  f.win.scrollY = 0; f.win.emit('scroll');
  assert.equal(f.frames.size, 1); assert.equal(button.dataset.flying, 'true');
  f.step(); f.step(); assert.notEqual(button.style.transform, original);
});
