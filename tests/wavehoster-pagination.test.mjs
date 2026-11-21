import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as dataFunctions from '../stats/wavehoster-data.mjs';
import {refreshWaveHoster} from '../stats/wavehoster-loader.mjs';

// Exercise the actual page module and event handlers with deterministic row geometry.
async function page(width = 1400, search = '', feedFactory = null) {
  const frames = [];
  const elements = new Map();
  const listeners = new Map();
  const documentListeners = new Map();
  class Element {
    children = [];
    hidden = false;
    value = '';
    style = {};
    dataset = {};
    events = new Map();
    classList = {toggle() {}, add() {}};
    constructor(id = '') { this.id = id; }
    append(...children) {
      for (const child of children) { child.parent = this; this.children.push(child); }
    }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(type, handler) { this.events.set(type, handler); }
    fire(type) { const event = {button: 0, target: this, preventDefault() {}, stopPropagation() {this.stopped = true;}}; this.events.get(type)?.(event); return event; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    get clientTop() { return 1; }
    get offsetHeight() { return this.getBoundingClientRect().height; }
    get clientHeight() { return this.offsetHeight - 2; }
    getBoundingClientRect() {
      if (this.id === 'wavePlayersWrap') {
        return {top: 0, height: 42 + elements.get('wavePlayers').children.length * 40};
      }
      if (this.id === 'waveMatchesWrap') {
        const count = elements.get('waveMatches').children.filter(row => !row.hidden).length;
        return {top: 0, height: Math.max(42 + count * 60, parseFloat(this.style.minHeight) || 0)};
      }
      if (this.parent?.id === 'waveMatches') {
        return {bottom: 41 + (this.parent.children.indexOf(this) + 1) * 60};
      }
      return {top: 0, left: 0, bottom: 0, width: 240, height: 100};
    }
  }
  const html = readFileSync(new URL('../wavehoster.html', import.meta.url), 'utf8');
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element(id));
  const policy = JSON.parse(readFileSync(new URL('../stats/arc-beta.json', import.meta.url)));
  const players = Array.from({length: 150}, (_, i) => ({id: `p${i}`, name: `Player ${i}`,
    identityVerified: true, games: 1, wins: 1, losses: 0, draws: 0, bestScore: 150 - i, kills: 1}));
  const snapshot = {format: 1, source: 'WaveHoster', ranking: 'wins-then-best-score', generatedAt: '2026-11-17T00:00:00Z', groups: [{id: 'recorded-group',
    version: policy.gameVersion, mods: [policy.modHash], players},
    {id: 'older-release', version: '4.6.3', mods: ['old-mod-hash'], players}], games: Array.from({length: 260}, (_, i) => ({
    id: `game${i}`, group: i % 2 ? 'older-release' : 'recorded-group',
    map: i % 2 ? 'BOHA-Wave-Defense' : 'Wave-Defense', status: 'confirmed',
    startedAt: new Date(Date.UTC(2026, 10, 17, 0, i)).toISOString(), durationMilliseconds: 600000, players: ['Player 0'],
    participants: [{id: 'p0', name: 'Player 0', result: 'winner', score: 1, kills: 1}]
  }))};
  const window = {innerWidth: width, innerHeight: 900, scrollY: 0, location: {href: 'https://example.test/wavehoster.html' + search,
    search, origin: 'https://example.test'}, history: {replaceState(state, title, url) {
      window.location.href = String(url);
      window.location.search = new URL(url).search;
    }}, scrollTo() {},
    matchMedia: () => ({matches: window.innerWidth >= 1121}),
    addEventListener: (type, handler) => listeners.set(type, handler)};
  window.parent = window;
  const fetcher = feedFactory ? feedFactory(snapshot) : async () => ({ok: true, text: async () => JSON.stringify(snapshot)});
  const context = vm.createContext({...dataFunctions, refreshWaveHoster: options => refreshWaveHoster({...options, fetcher}), window, URL, URLSearchParams,
    mountGameNicknames(panel, {arcId}) { panel.dataset.arcId = arcId; },
    document: {hidden: false, addEventListener: (type, handler) => documentListeners.set(type, handler), getElementById: id => {
      assert.ok(elements.has(id), `Missing HTML element ${id}`);
      return elements.get(id);
    }, createElement: () => new Element()},
    requestAnimationFrame: handler => { frames.push(handler); return frames.length; }, setInterval() {},
    fetch: fetcher});
  const source = readFileSync(new URL('../stats/wavehoster.mjs', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/\nload\(\);/, '\nglobalThis.ready = load();');
  vm.runInContext(source, context);
  await context.ready;
  function flush() {
    for (let count = 0; frames.length; count++) {
      assert.ok(count < 10, 'Layout must settle');
      frames.shift()();
    }
  }
  const get = id => elements.get(id);
  const games = () => get('waveMatches').children.filter(row => !row.hidden);
  flush();
  return {get, games, flush, documentEvent(type, event) {documentListeners.get(type)?.(event);}, url: () => new URL(window.location.href), resize(value) {window.innerWidth = value; listeners.get('resize')(); flush();},
    async refresh() {await context.load(); flush();}};
}

test('medals collect across mods, filter with the selected mod, and disclose details without selecting a player', async () => {
  const ui = await page(800, '', snapshot => {
    const players = snapshot.groups[0].players;
    const extra = {...snapshot, groups: [...snapshot.groups, {id: 'trident-pack', version: '4.7.0', mods: ['trident'],
      players: [{...players[1], wins: 3}, players[0]]}], games: [...snapshot.games,
      {...snapshot.games[0], id: 'trident-game', group: 'trident-pack', map: 'Trident_mf'}]};
    return async () => ({ok: true, text: async () => JSON.stringify(extra)});
  });
  const playerCell = () => ui.get('wavePlayers').children.find(row => row.children[1].children[0].textContent === 'Player 0').children[1];
  assert.equal(ui.get('waveRankingScore').textContent, 'Medal pts ↓');
  assert.equal(playerCell().parent.children[2].textContent, (5.9).toLocaleString());
  let medals = playerCell().children.find(child => child.className === 'wave-medals').children;
  assert.equal(medals.length, 3);
  const silver = medals.find(button => button['aria-label'].includes('Trident_mf'));
  assert.match(silver['aria-label'], /2nd place.*silver/);
  assert.equal(silver.fire('click').stopped, true);
  assert.equal(ui.get('waveMedalTip').hidden, false);
  assert.match(ui.get('waveMedalTip').children.map(line => line.textContent).join(' '), /Trident_mf.*1 win.*150/);
  assert.equal(ui.get('waveProfile').hidden, true);
  ui.documentEvent('keydown', {key: 'Escape'});
  assert.equal(ui.get('waveMedalTip').hidden, true);
  assert.equal(silver['aria-expanded'], 'false');
  silver.fire('focus');
  assert.equal(ui.get('waveMedalTip').hidden, false);
  silver.fire('blur');
  assert.equal(ui.get('waveMedalTip').hidden, true);
  ui.get('waveRuleset').value = 'mod:Wave-Defense';
  ui.get('waveRuleset').fire('change'); ui.flush();
  assert.equal(ui.get('waveRankingScore').textContent, 'Best score');
  assert.equal(ui.get('waveRankingWin')['aria-sort'], 'none');
  assert.match(ui.get('waveRankingNote').textContent, /newest version won/);
  medals = playerCell().children.find(child => child.className === 'wave-medals').children;
  assert.equal(medals.length, 2);
  assert.match(medals[0]['aria-label'], /Wave-Defense.*1st place.*gold/);
  assert.match(medals[1].className, /wave-medal-tester/);
  assert.match(medals[1]['aria-label'], /gold tester medal/);
  medals[1].fire('focus');
  assert.match(ui.get('waveMedalTip').children.at(-1).textContent, /Tester podium.*30%/);
  medals[0].fire('click');
  ui.documentEvent('pointerdown', {target: ui.get('wavePlayers')});
  assert.equal(ui.get('waveMedalTip').hidden, true);
});

test('an older initial backup cannot clear the requested player before live data arrives', async () => {
  const ui = await page(800, '?ruleset=mod%3AWave-Defense&player=p0', snapshot => async url => {
    const data = url.startsWith('https:') ? snapshot : {...snapshot,
      groups: snapshot.groups.map(group => ({...group, players: []})), games: []};
    return {ok: true, text: async () => JSON.stringify(data)};
  });
  assert.equal(ui.get('waveProfile').hidden, false);
  assert.equal(ui.get('waveProfileName').textContent, 'Player 0');
  const identityRow = ui.get('wavePlayers').children.find(row => row.id === 'waveIdentity-p0');
  assert.ok(identityRow.children[0].children[0].children.some(panel => panel.dataset.arcId === 'p0'));
  assert.equal(ui.games().length, 100);
});

test('host sync follows the displayed feed even when an older live snapshot is reachable', async () => {
  let live = 'older';
  const ui = await page(800, '', snapshot => async url => {
    const fromHost = url.startsWith('https:');
    if (fromHost && live === 'offline') throw Error('offline');
    const data = fromHost && live === 'older' ? {...snapshot, generatedAt: '2026-11-16T00:00:00Z'} : snapshot;
    return {ok: true, text: async () => JSON.stringify(data)};
  });
  assert.equal(ui.get('waveHostSync').textContent, 'False');
  live = 'current';
  await ui.refresh();
  assert.equal(ui.get('waveHostSync').textContent, 'True');
  live = 'offline';
  await ui.refresh();
  assert.equal(ui.get('waveHostSync').textContent, 'False');
});

test('an older build deep link filters standings and replays and can return to all builds', async () => {
  const query = '?ruleset=mod%3AWave-Defense&build=older-release';
  const ui = await page(800, query);
  assert.equal(ui.get('waveBuildControl').hidden, false);
  assert.equal(ui.get('waveBuild').value, 'older-release');
  assert.equal(ui.get('waveTotal').textContent, '130');
  assert.equal(ui.get('waveRankingWin')['aria-sort'], 'descending');
  assert.match(ui.get('wavePlayers').children[0].children[1].children[0].href, /build=older-release/);
  await ui.refresh();
  assert.equal(ui.get('waveBuild').value, 'older-release');
  ui.get('waveBuild').value = '';
  ui.get('waveBuild').fire('change');
  ui.flush();
  assert.equal(ui.get('waveTotal').textContent, '260');
  assert.equal(ui.url().searchParams.has('build'), false);
});

for (const legacy of ['beta', 'mod:BOHA-Wave-Defense', 'older-release']) {
test(`${legacy} links open one combined Wave-Defense entry, including both current and older games`, async () => {
  const ui = await page(800, '?ruleset=' + encodeURIComponent(legacy));
  assert.equal(ui.get('waveError').textContent, '');
  assert.deepEqual(ui.get('waveRuleset').children.map(option => option.textContent), ['ALL', 'Wave-Defense']);
  assert.equal(ui.get('waveRuleset').value, 'mod:Wave-Defense');
  if (legacy !== 'older-release') assert.equal(ui.url().searchParams.get('ruleset'), 'mod:Wave-Defense');
  assert.equal(ui.get('waveTotal').textContent, '260');
  assert.equal(ui.get('waveProfile').hidden, true);
  ui.get('waveMore').fire('click'); ui.flush();
  ui.get('waveMore').fire('click'); ui.flush();
  assert.equal(ui.games().length, 260);
  await ui.refresh();
  assert.equal(ui.get('waveRuleset').value, 'mod:Wave-Defense');
  assert.equal(ui.games().length, 260);
});
}

test('100 players and fitted whole game rows have independent, gap-free Show more controls', async () => {
  const ui = await page();
  assert.equal(ui.get('waveError').textContent, '');
  assert.equal(ui.get('wavePlayers').children.length, 100);
  assert.equal(ui.games().length, 66);
  assert.equal(ui.get('waveMatchesWrap').style.minHeight, '4042px');
  assert.equal(ui.get('wavePlayersMore').hidden, false);
  assert.equal(ui.get('waveMore').hidden, false);
  const nextDate = ui.get('waveMatches').children[66].children[0].textContent;
  ui.get('waveMore').fire('click'); ui.flush();
  assert.equal(ui.games().length, 166);
  assert.equal(ui.games()[66].children[0].textContent, nextDate);
  assert.equal(new Set(ui.games().map(row => row.children[0].textContent)).size, 166);
  assert.equal(ui.get('wavePlayers').children.length, 100);
  ui.get('wavePlayersMore').fire('click'); ui.flush();
  assert.equal(ui.get('wavePlayers').children.length, 150);
  assert.equal(ui.get('wavePlayersMore').hidden, true);
  assert.equal(ui.games().length, 166);
  ui.get('waveMore').fire('click'); ui.flush();
  assert.equal(ui.games().length, 260);
  assert.equal(ui.get('waveMore').hidden, true);
  await ui.refresh();
  assert.equal(ui.games().length, 260);
  assert.equal(ui.get('wavePlayers').children.length, 150);
});

test('expanding players extends automatic game fitting and preserves a full boundary row', async () => {
  const ui = await page();
  ui.get('wavePlayersMore').fire('click'); ui.flush();
  assert.equal(ui.get('wavePlayers').children.length, 150);
  assert.equal(ui.games().length, 100);
  assert.equal(ui.get('waveMatchesWrap').style.minHeight, '6042px');
  assert.equal(ui.games().at(-1).getBoundingClientRect().bottom, 6041);
  assert.equal(ui.get('waveMore').hidden, false);
});

test('filter resets, profile history and narrow layouts retain usable pagination', async () => {
  const ui = await page(800);
  assert.equal(ui.games().length, 100);
  ui.resize(1400);
  assert.equal(ui.games().length, 66);
  ui.resize(800);
  assert.equal(ui.games().length, 100);
  ui.get('wavePlayers').children[0].children[1].fire('click'); ui.flush();
  assert.equal(ui.get('waveProfile').hidden, false);
  assert.equal(ui.games().length, 100);
  ui.get('waveMore').fire('click'); ui.flush();
  assert.equal(ui.games().length, 200);
  ui.get('waveRuleset').value = 'mod:Wave-Defense';
  ui.get('waveRuleset').fire('change'); ui.flush();
  assert.equal(ui.get('waveProfile').hidden, true);
  assert.equal(ui.games().length, 100);
  ui.get('wavePlayerSearch').value = 'Player 149';
  ui.get('wavePlayerSearch').fire('input'); ui.flush();
  assert.equal(ui.get('wavePlayers').children.length, 1);
  assert.equal(ui.get('wavePlayersMore').hidden, true);
});

test('FactionsMod match rows link to the guide and selecting the mod shows a shortcut', async () => {
  const fixture = snapshot => {
    const factions = {id: 'factions', version: '4.7.0', mods: ['factions-hash'], players: snapshot.groups[0].players};
    const games = [{...snapshot.games.at(-1), id: 'factions-match', group: factions.id, map: 'FactionsMod'}, ...snapshot.games];
    return async () => ({ok: true, text: async () => JSON.stringify({...snapshot, groups: [...snapshot.groups, factions], games})});
  };
  const all = await page(800, '', fixture);
  const links = all.get('waveMatches').children.flatMap(row => row.children[1].children);
  assert.equal(links.length, 1);
  assert.equal(links[0].textContent, 'FactionsMod');
  assert.equal(links[0].href, 'factionsmod.html');
  assert.equal(links[0].target, '_blank');
  assert.equal(all.get('waveFactionsGuide').hidden, true);
  const selected = await page(800, '?ruleset=mod%3AFactionsMod', fixture);
  assert.equal(selected.get('waveFactionsGuide').hidden, false);
  assert.match(readFileSync(new URL('../factionsmod.html', import.meta.url), 'utf8'), /Compare all three factions/);
});
