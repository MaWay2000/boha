const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'live-stats.js'), 'utf8');
const helpers = source.slice(source.indexOf('function setPlayerGameRowExpanded('),
  source.indexOf('function renderPlayerGameActions('));

function fixture() {
  const nodes = [];
  let detailsRendered = 0;
  let copiesBound = 0;
  let fullRenders = 0;
  function makeRow(key) {
    const classes = new Set(['stats-player-game-row']);
    const glyph = { textContent: '+' };
    const label = { textContent: 'Open match details' };
    const toggle = {
      expanded: 'false',
      setAttribute(name, value) { assert.equal(name, 'aria-expanded'); this.expanded = value; },
      querySelector(selector) { return selector === '[aria-hidden="true"]' ? glyph : label; }
    };
    const row = {
      dataset: { playerGameKey: key }, toggle, glyph, label,
      classList: {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      querySelector() { return toggle; },
      get nextElementSibling() { return nodes[nodes.indexOf(row) + 1]; },
      after(detail) { nodes.splice(nodes.indexOf(row) + 1, 0, detail); }
    };
    nodes.push(row);
    return row;
  }
  const rows = [makeRow('one'), makeRow('two')];
  const playerGamesElement = {
    set innerHTML(_) { throw new Error('Must not rebuild the match table'); },
    querySelector() { return nodes.find(row => row.classList.contains('is-expanded')); }
  };
  const context = vm.createContext({
    activeExpandedPlayerGameKey: null, playerGamesElement,
    document: {
      createElement(tag) {
        assert.equal(tag, 'tr');
        const detail = {
          className: '', innerHTML: '',
          classList: { contains: name => detail.className === name },
          querySelectorAll() { return []; },
          remove() { nodes.splice(nodes.indexOf(detail), 1); }
        };
        return detail;
      }
    },
    getPlayerGameKey: game => game.key,
    renderPlayerGameDetails(game, account) {
      detailsRendered++;
      return `${game.key}:${account.name}`;
    },
    bindCopyButtons() { copiesBound++; },
    renderPlayerProfile() { throw new Error('Must not rebuild profile or 3D models'); },
    renderPlayerGames() { throw new Error('Must not rerender games on expansion'); },
    render() { fullRenders++; },
    getAccountExpandKey: account => account.key,
    filterVisibleAccounts: accounts => accounts,
    playerSearchElement: { value: '' }, playerSearchClearElement: { hidden: true },
    playerSearchQuery: '', visiblePlayerCount: 1, showingAllPlayerGames: true,
    activeExpandedAccountKey: 'original', expandedAccounts: new Set(['original'])
  });
  vm.runInContext(helpers, context);
  return {
    context, nodes, rows,
    toggle(index) {
      context.togglePlayerGameDetails(rows[index], { key: rows[index].dataset.playerGameKey },
        { name: 'Lace' }, []);
    },
    get detailsRendered() { return detailsRendered; },
    get copiesBound() { return copiesBound; },
    get fullRenders() { return fullRenders; }
  };
}

test('opening and closing change only the detail row and accessible toggle state', () => {
  const f = fixture();
  f.toggle(0);
  assert.equal(f.nodes.length, 3);
  assert.equal(f.nodes[1].innerHTML, '<td colspan="6">one:Lace</td>');
  assert.equal(f.context.activeExpandedPlayerGameKey, 'one');
  assert.equal(f.rows[0].toggle.expanded, 'true');
  assert.equal(f.rows[0].glyph.textContent, '-');
  assert.equal(f.rows[0].label.textContent, 'Close match details');
  assert.equal(f.copiesBound, 1);
  f.toggle(0);
  assert.deepEqual(f.nodes, f.rows);
  assert.equal(f.context.activeExpandedPlayerGameKey, null);
  assert.equal(f.rows[0].toggle.expanded, 'false');
  assert.equal(f.rows[0].glyph.textContent, '+');
  assert.equal(f.rows[0].label.textContent, 'Open match details');
  assert.equal(f.detailsRendered, 1, 'closing needs no detail rendering');
});

test('switching games closes the previous details without replacing either match row', () => {
  const f = fixture();
  f.toggle(0);
  const oldDetail = f.nodes[1];
  f.toggle(1);
  assert.equal(f.nodes.length, 3);
  assert.equal(f.nodes[0], f.rows[0]);
  assert.equal(f.nodes[1], f.rows[1]);
  assert.equal(f.nodes.includes(oldDetail), false);
  assert.equal(f.rows[0].toggle.expanded, 'false');
  assert.equal(f.rows[1].toggle.expanded, 'true');
  assert.equal(f.context.activeExpandedPlayerGameKey, 'two');
});

test('repeated expansion preserves match rows and never invokes profile/model rebuilds', () => {
  const f = fixture();
  for (let i = 0; i < 100; i++) {
    f.toggle(i % 2);
    f.toggle(i % 2);
  }
  assert.deepEqual(f.nodes, f.rows);
  assert.equal(f.fullRenders, 0);
  assert.equal(f.detailsRendered, 100);
});

test('newly inserted player tiles still navigate to the selected player and match', () => {
  const f = fixture();
  let click;
  const tile = {
    dataset: { jumpAccount: 'teammate', jumpGame: 'two' },
    addEventListener(name, handler) { assert.equal(name, 'click'); click = handler; }
  };
  f.context.bindPlayerGameJumpLinks({ querySelectorAll: () => [tile] },
    [{ key: 'original', name: 'Lace' }, { key: 'teammate', name: 'Other player' }]);
  let stopped = false;
  click({ preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(f.context.activeExpandedAccountKey, 'teammate');
  assert.equal(f.context.activeExpandedPlayerGameKey, 'two');
  assert.equal(f.context.playerSearchElement.value, 'Other player');
  assert.equal(f.context.visiblePlayerCount, 2);
  assert.equal(f.context.showingAllPlayerGames, false);
  assert.equal(f.fullRenders, 1, 'changing players should still render the new profile');
});

test('row-click handler uses incremental expansion and leaves links alone', () => {
  const handler = source.slice(source.indexOf('  playerGamesElement.querySelectorAll(".stats-player-game-row")'),
    source.indexOf('function setPlayerGameRowExpanded('));
  assert.match(handler, /event\.target\.closest\("a"\)/);
  assert.match(handler, /togglePlayerGameDetails\(row, game, activeAccount, accounts\)/);
  assert.doesNotMatch(handler, /renderPlayerGames\(|renderPlayerProfile\(/);
});
