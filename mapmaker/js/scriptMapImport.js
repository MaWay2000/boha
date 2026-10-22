// Script-generated WZ maps use gameRand / setMapData instead of game.map.
export function validateScriptMapData(data) {
  const {width, height, textures, heights} = data || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 2 || height < 2 || width > 256 || height > 256) {
    throw new Error('Script map dimensions must be between 2 and 256.');
  }
  const count = width * height;
  if (!Array.isArray(textures) || !Array.isArray(heights) ||
      textures.length !== count || heights.length !== count) {
    throw new Error('Script map texture/height arrays do not match its dimensions.');
  }
  const valid = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;
  const result = {width, height, textures:[], heights:[]};
  for (let i = 0; i < count; i++) {
    if (!valid(textures[i], 65535) || !valid(heights[i], 0xffffffff)) {
      throw new Error('Invalid script map tile at ' + i + '.');
    }
    result.textures.push(Math.trunc(textures[i]));
    result.heights.push(Math.min(1023, Math.trunc(heights[i])));
  }
  for (const kind of ['structures', 'droids', 'features']) {
    const entries = data[kind];
    if (!Array.isArray(entries) || entries.length > 65535) throw new Error('Invalid script map ' + kind + '.');
    result[kind] = entries.map(entry => {
      if (!entry || typeof entry.name !== 'string' || !entry.name || entry.name.length > 256 ||
          !Array.isArray(entry.position) || entry.position.length !== 2 ||
          !entry.position.every(v => Number.isFinite(v) && Math.abs(v) <= 0x7fffffff) ||
          !valid(entry.direction ?? 0, 65535)) {
        throw new Error('Invalid script map ' + kind + ' entry.');
      }
      const item = {
        name:entry.name,
        position:entry.position.map(Math.trunc),
        direction:Math.trunc(entry.direction ?? 0)
      };
      if (kind !== 'features') {
        const player = entry.player ?? 0;
        if (!Number.isInteger(player) || player < -1 || player > 10) throw new Error('Invalid script map player.');
        item.player = player === -1 ? 10 : player;
      }
      if (kind === 'structures') {
        if (!valid(entry.modules ?? 0, 255)) throw new Error('Invalid script map modules.');
        item.modules = Math.trunc(entry.modules ?? 0);
      }
      return item;
    });
  }
  return result;
}

// Serialized into a dedicated worker, never run in the editor's JS realm.
function scriptMapWorker(validate) {
  const send = self.postMessage.bind(self);
  self.onmessage = event => {
    self.onmessage = null;
    try {
      const {source, seed} = event.data;
      // std::mt19937-compatible sequence, as used by Warzone's map script API.
      const state = new Uint32Array(624);
      state[0] = seed >>> 0;
      for (let i = 1; i < 624; i++) {
        state[i] = (Math.imul(1812433253, state[i - 1] ^ (state[i - 1] >>> 30)) + i) >>> 0;
      }
      let index = 624;
      function gameRand(mod = 0) {
        if (index === 624) {
          for (let i = 0; i < 624; i++) {
            const bits = (state[i] & 0x80000000) | (state[(i + 1) % 624] & 0x7fffffff);
            state[i] = state[(i + 397) % 624] ^ (bits >>> 1) ^ ((bits & 1) ? 0x9908b0df : 0);
          }
          index = 0;
        }
        let value = state[index++];
        value ^= value >>> 11;
        value ^= (value << 7) & 0x9d2c5680;
        value ^= (value << 15) & 0xefc60000;
        value = (value ^ (value >>> 18)) >>> 0;
        mod = mod >>> 0;
        return mod ? value % mod : value;
      }
      let output = null;
      function setMapData(width, height, textures, heights, structures, droids, features) {
        if (output) throw new Error('Map script called setMapData more than once.');
        output = validate({width, height, textures, heights, structures, droids, features});
        return true;
      }
      // The opaque-origin frame and CSP are the security boundary. These also
      // disable unused host APIs so map scripts cannot launch work or requests.
      for (const name of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts',
        'Worker','SharedWorker','indexedDB','caches']) {
        Object.defineProperty(self, name, {value:undefined, writable:false, configurable:false});
      }
      const run = new Function('gameRand','setMapData','log','preview',
        'XFLIP','YFLIP','ROTMASK','ROTSHIFT','TRIFLIP', source);
      run(gameRand, setMapData, () => {}, false, 0x8000, 0x4000, 0x3000, 12, 0x0800);
      if (!output) throw new Error('Map script did not call setMapData.');
      send({data:output});
    } catch (error) {
      send({error:String(error?.message || error).slice(0,1000)});
    }
  };
}

export function getScriptMapWorkerSource() {
  return '(' + scriptMapWorker.toString() + ')(' + validateScriptMapData.toString() + ');';
}

// This bridge contains only trusted code. Map source arrives as data and is
// executed in a worker owned by an opaque-origin, network-blocked iframe.
function scriptMapBridge(workerSource) {
  let worker = null, workerUrl = null, timer = null;
  function cleanup() {
    if (worker) worker.terminate();
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    clearTimeout(timer);
    worker = null;
    workerUrl = null;
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'script-map-run' || worker) return;
    const {source, seed, token, timeoutMs} = event.data;
    const finish = result => {
      cleanup();
      parent.postMessage({type:'script-map-result', token, data:result?.data, error:result?.error}, '*');
    };
    try {
      workerUrl = URL.createObjectURL(new Blob([workerSource], {type:'text/javascript'}));
      worker = new Worker(workerUrl);
      worker.onmessage = event => finish(event.data);
      worker.onerror = event => {
        event.preventDefault();
        finish({error:event.message || 'Map script worker failed.'});
      };
      timer = setTimeout(() => finish({error:'Map script timed out.'}), timeoutMs);
      worker.postMessage({source, seed});
    } catch (error) {
      finish({error:String(error?.message || error)});
    }
  });
  window.addEventListener('pagehide', cleanup);
  parent.postMessage({type:'script-map-ready'}, '*');
}

export function getScriptMapSandboxHtml() {
  const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  const bridge = '(' + scriptMapBridge.toString() + ')(' + JSON.stringify(getScriptMapWorkerSource()) + ');';
  return '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + policy + '">' +
    '<script>' + bridge.replace(/<\/script/gi, '<\\/script') + '</script>';
}

export function runMapScript(source, {seed = 0, timeoutMs = 10000} = {}) {
  if (typeof source !== 'string' || !source.length || source.length > 2 * 1024 * 1024) {
    return Promise.reject(new Error('Map script is empty or too large.'));
  }
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.style.display = 'none';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    const token = crypto.randomUUID();
    const duration = Math.max(100, Math.min(30000, timeoutMs));
    let sent = false;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.remove();
    };
    const fail = error => { cleanup(); reject(error); };
    const onMessage = event => {
      if (event.source !== frame.contentWindow || event.origin !== 'null') return;
      const message = event.data;
      if (message?.type === 'script-map-ready' && !sent) {
        sent = true;
        frame.contentWindow.postMessage({type:'script-map-run', token, source, seed, timeoutMs:duration}, '*');
      } else if (message?.type === 'script-map-result' && message.token === token) {
        if (message.error) { fail(new Error(String(message.error))); return; }
        try {
          const data = validateScriptMapData(message.data);
          cleanup();
          resolve(data);
        } catch (error) { fail(error); }
      }
    };
    const timer = setTimeout(() => fail(new Error('Map script timed out.')), duration + 1000);
    window.addEventListener('message', onMessage);
    frame.srcdoc = getScriptMapSandboxHtml();
    document.body.appendChild(frame);
  });
}

export function buildScriptMapFiles(data, scriptName) {
  const map = validateScriptMapData(data);
  const count = map.width * map.height;
  const grid = new Uint8Array(16 + count * 4 + 8);
  grid.set([0x6d, 0x61, 0x70, 0x20]);
  const view = new DataView(grid.buffer);
  view.setUint32(4, 40, true);
  view.setUint32(8, map.width, true);
  view.setUint32(12, map.height, true);
  for (let i = 0; i < count; i++) {
    view.setUint16(16 + i * 4, map.textures[i], true);
    view.setUint16(18 + i * 4, map.heights[i], true);
  }
  view.setUint32(16 + count * 4, 1, true); // Empty gateway table.
  const base = scriptName.slice(0, -'game.js'.length);
  const entity = (entry, kind) => {
    const result = {...entry, position:[...entry.position, 0]};
    result.rotation = kind === 'droid' ? [0, entry.direction, 0] : entry.direction * 360 / 65536;
    if (kind === 'droid') result.template = entry.name;
    delete result.direction;
    return result;
  };
  return {
    mapName:base + 'game.map',
    files:[
      [base + 'game.map', grid],
      [base + 'struct.json', JSON.stringify(map.structures.map(e => entity(e, 'structure')))],
      [base + 'droid.json', JSON.stringify(map.droids.map(e => entity(e, 'droid')))],
      [base + 'feature.json', JSON.stringify(map.features.map(e => entity(e, 'feature')))]
    ]
  };
}

export function normalizeMapScriptSource(value) {
  if (!value || typeof value.filename !== 'string' || typeof value.source !== 'string' ||
      value.source.length > 2 * 1024 * 1024 || value.filename.length > 1024) return null;
  const filename = value.filename.replace(/\\/g, '/');
  const parts = filename.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes('\0')) ||
      parts[parts.length - 1].toLowerCase() !== 'game.js') return null;
  return {filename, source:value.source, pendingChanges:!!value.pendingChanges};
}

export async function readMapScriptSource(zip) {
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  const original = names.find(name => /(^|[\\/])game\.js$/i.test(name));
  if (original) {
    return normalizeMapScriptSource({
      filename:original,
      source:(await zip.files[original].async('string')).replace(/\0+$/, '')
    });
  }
  const saved = zip.file('mapmaker-script.json');
  if (!saved) return null;
  try { return normalizeMapScriptSource(JSON.parse(await saved.async('string'))); }
  catch { return null; }
}

export function writeMapScriptSource(zip, value) {
  const script = normalizeMapScriptSource(value);
  if (script) zip.file('mapmaker-script.json', JSON.stringify({version:1, ...script}));
}

export async function materializeScriptMap(zip, execute = runMapScript) {
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  // Leave existing fixed-grid imports exactly as they were.
  if (names.some(name => /\.map$/i.test(name))) return false;
  const scriptName = names.find(name => /(^|[\\/])game\.js$/i.test(name));
  if (!scriptName) return false;
  const source = (await zip.files[scriptName].async('string')).replace(/\0+$/, '');
  const generated = buildScriptMapFiles(await execute(source), scriptName);
  // Only the working in-memory archive changes; the original .wz stays intact.
  // Drop the script so exported edits use the materialized grid, not regenerate.
  zip.remove(scriptName);
  for (const [name, data] of generated.files) zip.file(name, data);
  writeMapScriptSource(zip, {filename:scriptName, source, pendingChanges:false});
  return true;
}
