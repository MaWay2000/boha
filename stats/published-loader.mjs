// Keep large publication downloads and JSON parsing off the UI thread.
export function createJsonReader({fetchImpl = globalThis.fetch, workerFactory = () => new Worker(new URL('./published-json-worker.js?v=20261117-main-live-1', import.meta.url), {type: 'module'})} = {}) {
  return async function read(url, {background = true, cache = 'default', sha256, timeoutMs = 60000} = {}) {
    if (background) {
      let worker;
      try { worker = workerFactory(); } catch {}
      if (worker) return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('Published data loading timed out.')), timeoutMs);
        const finish = (error, value) => { clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(value); };
        worker.onmessage = event => event.data.error ? finish(new Error(event.data.error)) : finish(null, event.data.value);
        worker.onerror = () => finish(Object.assign(new Error('Published data worker unavailable.'), {workerUnavailable: true}));
        worker.postMessage({url: String(url), cache, sha256});
      }).catch(error => {
        if (error.workerUnavailable) return read(url, {background: false, cache, sha256, timeoutMs});
        throw error;
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let text;
    try {
      const response = await fetchImpl(url, {cache, credentials: 'omit', signal: controller.signal});
      if (!response.ok) throw new Error('Unable to load published data (' + response.status + ').');
      text = (await response.text()).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    } finally { clearTimeout(timer); }
    if (sha256 && globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      if ([...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') !== sha256) throw new Error('Publication is still updating. Please retry shortly.');
    }
    // Browsers without workers retain a functioning reader.
    await new Promise(resolve => setTimeout(resolve, 0));
    return JSON.parse(text);
  };
}

export function createPublishedLoader({baseUrl, liveBaseUrl, read = createJsonReader()} = {}) {
  if (liveBaseUrl) return createLivePublishedLoader({baseUrl, liveBaseUrl, read});
  let version = null, payload = null, pending = null;
  const performanceLoads = new WeakMap();
  async function load() {
    const manifest = await read(new URL('manifest.json', baseUrl), {background: false, cache: 'no-cache'});
    const hash = manifest?.files?.['leaderboards.json']?.sha256;
    if (manifest?.format !== 1 || !/^[a-f0-9]{64}$/.test(hash || '')) throw new Error('Invalid publication manifest.');
    if (payload && hash === version) return {payload, changed: false};
    const url = new URL('leaderboards.json', baseUrl); url.searchParams.set('v', hash);
    const next = await read(url, {sha256: hash});
    if (!next?.leaderboards || !Array.isArray(next.games)) throw new Error('Published leaderboard data is incomplete.');
    next.ratingPerformance = {};
    payload = next; version = hash;
    return {payload, changed: true};
  }
  return {
    load() {
      if (!pending) pending = load().finally(() => { pending = null; });
      return pending;
    },
    loadPerformance(data) {
      if (!data) return Promise.resolve();
      if (!performanceLoads.has(data)) {
        const url = new URL('rating-performance.json', baseUrl);
        url.searchParams.set('v', data.generatedAt || version || 'performance');
        const request = read(url).then(value => {
          if (value?.format !== 2 || !value.games || typeof value.games !== 'object' || Array.isArray(value.games)) throw new Error('Invalid performance publication.');
          data.ratingPerformance = value.games;
        }).catch(error => { performanceLoads.delete(data); throw error; });
        performanceLoads.set(data, request);
      }
      return performanceLoads.get(data);
    }
  };
}

function createLivePublishedLoader({baseUrl, liveBaseUrl, read}) {
  let payload = null, version = null, snapshotTime = 0, pending = null;
  const metadata = new WeakMap(), performanceLoads = new WeakMap();
  async function manifest(base, source) {
    const value = await read(new URL('manifest.json', base), {background: false, cache: 'no-cache', timeoutMs: 5000});
    const hash = value?.files?.['leaderboards.json']?.sha256;
    const time = Date.parse(value?.publishedAt);
    if (value?.format !== 1 || !/^[a-f0-9]{64}$/.test(hash || '') || !Number.isFinite(time)) throw Error('Invalid publication manifest.');
    return {base, source, manifest: value, hash, time};
  }
  async function load() {
    let backupPromise;
    const backup = () => backupPromise ||= manifest(baseUrl, 'github').catch(() => null);
    const livePromise = manifest(liveBaseUrl, 'live').catch(() => null);
    let candidates;
    if (!payload) candidates = await Promise.all([livePromise, backup()]);
    else {
      const live = await livePromise;
      candidates = live && live.time >= snapshotTime ? [live] : [live, await backup()];
    }
    candidates = candidates.filter(Boolean).sort((a, b) => b.time - a.time || (a.source === 'live' ? -1 : 1));
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.time < snapshotTime) continue;
      if (payload && candidate.hash === version) {
        const old = metadata.get(payload);
        const prefer = candidate.source === 'live' || old?.source !== 'live';
        const performanceChanged = prefer && old?.manifest.files['rating-performance.json']?.sha256 !== candidate.manifest.files['rating-performance.json']?.sha256;
        const changed = performanceChanged && Object.keys(payload.ratingPerformance).length > 0;
        if (prefer) metadata.set(payload, candidate);
        if (performanceChanged) {performanceLoads.delete(payload); payload.ratingPerformance = {};}
        snapshotTime = Math.max(snapshotTime, candidate.time);
        return {payload, changed, liveAvailable: candidate.source === 'live'};
      }
      try {
        const url = new URL('leaderboards.json', candidate.base); url.searchParams.set('v', candidate.hash);
        const next = await read(url, {sha256: candidate.hash});
        if (next?.format !== 1 || !Array.isArray(next.leaderboards?.Global?.players) || !Array.isArray(next.games)) {
          throw Error('Published leaderboard data is incomplete.');
        }
        next.ratingPerformance = {};
        payload = next; version = candidate.hash; snapshotTime = candidate.time;
        metadata.set(next, candidate);
        return {payload, changed: true, liveAvailable: candidate.source === 'live'};
      } catch {
        if (candidate.source === 'live') {
          const saved = await backup();
          if (saved && !candidates.some(item => item.source === 'github')) candidates.push(saved);
        }
      }
    }
    if (payload) return {payload, changed: false, liveAvailable: false};
    throw Error('Live and saved leaderboard results are temporarily unavailable.');
  }
  return {
    load() {
      if (!pending) pending = load().finally(() => {pending = null;});
      return pending;
    },
    loadPerformance(data) {
      if (!data) return Promise.resolve();
      if (!performanceLoads.has(data)) {
        const info = metadata.get(data);
        const hash = info?.manifest.files['rating-performance.json']?.sha256;
        const url = new URL('rating-performance.json', info?.base || baseUrl);
        url.searchParams.set('v', hash || data.generatedAt || version);
        const request = read(url, {sha256: hash}).catch(error => {
          if (info?.source !== 'live' || !hash) throw error;
          const saved = new URL('rating-performance.json', baseUrl); saved.searchParams.set('v', hash);
          // The backup must match this exact performance generation, never mix scores.
          return read(saved, {sha256: hash});
        }).then(value => {
          if (value?.format !== 2 || !value.games || typeof value.games !== 'object' || Array.isArray(value.games)) throw Error('Invalid performance publication.');
          data.ratingPerformance = value.games;
        }).catch(error => {performanceLoads.delete(data); throw error;});
        performanceLoads.set(data, request);
      }
      return performanceLoads.get(data);
    }
  };
}
