import {createPublishedLoader as createBaseLoader} from './published-loader.mjs?v=20261121-host-sync-1#base';
import {
  calculatePersonalRatings, CURRENT_SETTINGS, mountPersonalRatings as mountBaseRatings
} from './personal-ratings.mjs?v=20261113-lazy-performance-1#base';
import {
  appendLeaderboardSelection, buildCombinedLeaderboard, countCombinedResults,
  normalizeLeaderboardSelection, toggleLeaderboardSelection
} from './leaderboard-selection.mjs';

const combinedName = 'Combined';
const categoryParam = 'gameCategory';
const storageKey = 'boha.combinedGameCategories';
const buttons = document.getElementById('statsLeaderboardButtons');
let publication;
let selection = ['Global'];
let boardKey;
let combinedBoard;

function availableCategories() {
  return publication && Object.keys(publication.leaderboards).filter(name => name !== combinedName);
}

function savedCategories() {
  try {
    const names = JSON.parse(window.sessionStorage.getItem(storageKey));
    return Array.isArray(names) ? names.filter(name => typeof name === 'string' && name !== combinedName) : [];
  } catch {
    return [];
  }
}

function writeSelection(url) {
  url.searchParams.delete('leaderboard');
  url.searchParams.delete(categoryParam);
  if (selection.length > 1) {
    url.searchParams.set('leaderboard', combinedName);
    for (const name of selection) url.searchParams.append(categoryParam, name);
  } else {
    appendLeaderboardSelection(url.searchParams, selection);
  }
}

function refreshCombinedBoard() {
  if (!publication) return;
  const key = JSON.stringify(selection.length > 1 ? [...selection].sort() : []);
  if (key === boardKey) return;
  const board = buildCombinedLeaderboard(publication, selection.length > 1 ? selection : []);
  combinedBoard = {...board, matches: board.gameIds.size};
  publication.leaderboards[combinedName] = combinedBoard;
  boardKey = key;
}

function restoreSelection() {
  const url = new URL(window.location.href);
  const active = url.searchParams.get('leaderboard') || 'Global';
  const categories = url.searchParams.getAll(categoryParam).filter(name => name !== combinedName);
  const names = active === combinedName ? (categories.length ? categories : savedCategories()) : [active];
  selection = normalizeLeaderboardSelection(names, availableCategories());
  refreshCombinedBoard();
  // A stale combined link may refer to categories that the publication no longer contains.
  if (active === combinedName && selection.length < 2) {
    writeSelection(url);
    window.history.replaceState(window.history.state, '', url);
  }
}

export function createPublishedLoader(options) {
  const loader = createBaseLoader(options);
  return {
    ...loader,
    async load() {
      const result = await loader.load();
      if (publication !== result.payload) {
        publication = result.payload;
        boardKey = null;
        restoreSelection();
      }
      return result;
    }
  };
}

export function mountPersonalRatings(...args) {
  const ratings = mountBaseRatings(...args);
  let sourceBoard;
  let defaultBoard;
  return {
    ...ratings,
    getBoard(name, data, hydrate) {
      if (name !== combinedName) return ratings.getBoard(name, data, hydrate);
      if (sourceBoard !== combinedBoard) {
        const hydrated = hydrate(name);
        // The existing hydrator has already excluded crashes and omitted profiles.
        countCombinedResults(hydrated.games);
        defaultBoard = calculatePersonalRatings(hydrated, CURRENT_SETTINGS);
        sourceBoard = combinedBoard;
      }
      return ratings.getBoard(`${combinedName}:${boardKey}`, data, () => defaultBoard);
    }
  };
}

function syncRenderedSelection() {
  const url = new URL(window.location.href);
  const active = url.searchParams.get('leaderboard') || 'Global';
  if (active !== combinedName) {
    selection = [active];
    refreshCombinedBoard();
  } else if (selection.length < 2) {
    writeSelection(url);
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    return;
  }

  if (active === combinedName && selection.length > 1) {
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(selection)); } catch {}
    const originalSearch = url.search;
    writeSelection(url);
    if (url.search !== originalSearch) {
      window.history.replaceState(window.history.state, '', url);
      window.bohaEmbeddedPage?.postState(url.search);
    }
  }

  for (const button of buttons?.querySelectorAll('button[data-leaderboard]') || []) {
    const name = button.dataset.leaderboard;
    button.hidden = name === combinedName;
    const pressed = selection.includes(name);
    button.classList.toggle('is-active', pressed);
    button.setAttribute('aria-pressed', String(pressed));
  }
}

buttons?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-leaderboard]');
  if (!button || button.hidden) return;
  event.stopPropagation();
  const name = button.dataset.leaderboard;
  if (name === 'Global' && selection[0] === 'Global') return;

  const restoreFocus = document.activeElement === button;
  selection = toggleLeaderboardSelection(selection, name);
  refreshCombinedBoard();
  const url = new URL(window.location.href);
  writeSelection(url);
  for (const param of ['players', 'game', 'playerGames']) url.searchParams.delete(param);
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));

  if (restoreFocus) {
    [...buttons.children].find(candidate => candidate.dataset.leaderboard === name)?.focus({preventScroll: true});
  }
}, true);

restoreSelection();
window.addEventListener('popstate', restoreSelection);
const renderTarget = buttons || document.getElementById('statsMatches');
if (renderTarget) new MutationObserver(syncRenderedSelection).observe(renderTarget, {childList: true});
