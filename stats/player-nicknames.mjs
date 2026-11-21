const liveUrl = 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/data/player-nicknames.json';
const savedUrl = new URL('./published/player-nicknames.json', import.meta.url);
const dateFormat = new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
let cached;
let refreshAfter = 0;
let pending;

async function readHistory(url) {
  const response = await fetch(url, {credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(4000)});
  if (!response.ok) throw Error('Recent game nicknames are unavailable.');
  const data = await response.json();
  if (data?.format !== 1 || !data.players || !data.aliases) throw Error('Invalid game nickname history.');
  return data;
}

function loadHistory() {
  if (Date.now() < refreshAfter) return Promise.resolve(cached);
  pending ||= readHistory(liveUrl).catch(() => cached || readHistory(savedUrl))
    .then(data => {
      cached = data;
      refreshAfter = Date.now() + 30_000;
      return data;
    }).finally(() => { pending = null; });
  return pending;
}

async function lookupId({publicKey, arcId}) {
  if (typeof arcId === 'string' && /^[a-f0-9]{20}$/.test(arcId)) return arcId;
  if (typeof publicKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(publicKey)) return '';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicKey));
  return Array.from(new Uint8Array(bytes, 0, 10), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function mountGameNicknames(container, identity, {heading = true} = {}) {
  if (!container) return;
  const label = document.createElement('span');
  label.className = 'stats-detail-label';
  label.textContent = 'Last 3 game nicknames';
  const status = document.createElement('small');
  status.textContent = 'Loading…';
  container.replaceChildren(...(heading ? [label, status] : [status]));
  try {
    const id = await lookupId(identity);
    const data = id ? await loadHistory() : null;
    const entries = data?.players[data.aliases[id] || id] || [];
    if (!entries.length) {
      status.textContent = heading ? 'No verified game nicknames available.' : '—';
      return;
    }
    const list = document.createElement('ol');
    list.className = 'stats-nickname-list';
    for (const game of entries.slice(0, 3)) {
      const item = document.createElement('li');
      const name = document.createElement('bdi');
      name.textContent = game.name;
      const details = document.createElement('small');
      details.textContent = dateFormat.format(game.time) + ' · ' + (game.mode === 'arc' ? 'ARC MOD' : 'Main');
      item.append(name, details);
      list.append(item);
    }
    status.replaceWith(list);
  } catch {
    status.textContent = 'Recent game nicknames unavailable.';
  }
}
