// Keep large publication downloads and JSON parsing off the UI thread.
export function createJsonReader({fetchImpl = globalThis.fetch, workerFactory = () => new Worker(new URL('./published-json-worker.js?v=20261113-efficient-1', import.meta.url), {type: 'module'})} = {}) {
  return async function read(url, {background = true, cache = 'default', sha256} = {}) {
    if (background) {
      let worker;
      try { worker = workerFactory(); } catch {}
      if (worker) return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('Published data loading timed out.')), 60000);
        const finish = (error, value) => { clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(value); };
        worker.onmessage = event => event.data.error ? finish(new Error(event.data.error)) : finish(null, event.data.value);
        worker.onerror = () => finish(Object.assign(new Error('Published data worker unavailable.'), {workerUnavailable: true}));
        worker.postMessage({url: String(url), cache, sha256});
      }).catch(error => {
        if (error.workerUnavailable) return read(url, {background: false, cache, sha256});
        throw error;
      });
    }
    const response = await fetchImpl(url, {cache});
    if (!response.ok) throw new Error('Unable to load published data (' + response.status + ').');
    const text = (await response.text()).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (sha256 && globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      if ([...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') !== sha256) throw new Error('Publication is still updating. Please retry shortly.');
    }
    // Browsers without workers retain a functioning reader.
    await new Promise(resolve => setTimeout(resolve, 0));
    return JSON.parse(text);
  };
}

export function createPublishedLoader({baseUrl, read = createJsonReader()} = {}) {
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
