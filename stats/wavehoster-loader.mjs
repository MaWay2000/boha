export const LIVE_URL = 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/data/wavehoster-live.json';
const BACKUP_URL = 'stats/published/wavehoster.json';

function validSnapshot(data) {
  const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');
  const identity = player => player && typeof player.id === 'string' && typeof player.name === 'string' &&
    (!player.names || (Array.isArray(player.names) && player.names.every(alias => typeof alias.name === 'string'))) &&
    (!player.publicKeys || strings(player.publicKeys));
  return data?.format === 1 && data.source === 'WaveHoster' && data.ranking === 'wins-then-best-score' &&
    Number.isFinite(Date.parse(data.generatedAt)) && Array.isArray(data.groups) && Array.isArray(data.games) &&
    data.groups.every(group => group && typeof group.id === 'string' && strings(group.mods) &&
      Array.isArray(group.players) && group.players.every(identity)) &&
    data.games.every(game => game && typeof game.id === 'string' && typeof game.group === 'string' && typeof game.map === 'string' &&
      typeof game.status === 'string' && Number.isFinite(game.durationMilliseconds) && game.durationMilliseconds >= 0 &&
      strings(game.players) && Array.isArray(game.participants) && game.participants.every(identity));
}

// Initial requests run together so saved results can appear while live data connects.
// Later refreshes contact GitHub only when the live service is unavailable or older.
export async function refreshWaveHoster({current = null, fetcher = fetch, onUpdate = () => {}, timeoutMs = 5000} = {}) {
  let best = current;
  let liveAvailable = false;
  let backupPromise;
  async function read(url, source) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {signal: controller.signal, cache: 'no-cache', credentials: 'omit'});
      if (!response.ok) throw Error('Arc Mod data is temporarily unavailable.');
      if (Number(response.headers?.get('content-length')) > 32 * 1024 * 1024) throw Error('Arc Mod data exceeds the size limit.');
      const text = (await response.text()).replace(/^\uFEFF/, '').trim();
      if (text.length > 32 * 1024 * 1024) throw Error('Arc Mod data exceeds the size limit.');
      const snapshot = text === best?.text ? best.snapshot : JSON.parse(text);
      if (!validSnapshot(snapshot)) throw Error('Arc Mod data could not be read.');
      const next = {snapshot, text, source};
      if (!best || Date.parse(snapshot.generatedAt) > Date.parse(best.snapshot.generatedAt) ||
          (Date.parse(snapshot.generatedAt) === Date.parse(best.snapshot.generatedAt) && source === 'live')) {
        const changed = snapshot !== best?.snapshot;
        best = next;
        if (changed) onUpdate(next);
      }
      return next;
    } finally { clearTimeout(timeout); }
  }
  function backup() {
    if (!backupPromise) backupPromise = read(BACKUP_URL, 'github').catch(() => null);
    return backupPromise;
  }
  const jobs = [];
  if (!current) jobs.push(backup());
  jobs.push(read(LIVE_URL, 'live').then(record => {
    liveAvailable = true;
    if (best && Date.parse(record.snapshot.generatedAt) < Date.parse(best.snapshot.generatedAt)) return backup();
  }).catch(() => backup()));
  await Promise.all(jobs);
  if (!best) throw Error('Arc Mod results are temporarily unavailable. Please try again shortly.');
  return {record: best, liveAvailable};
}
