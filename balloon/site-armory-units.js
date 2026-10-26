import { TextureLoader, NearestFilter } from '../mapmaker/js/three.module.js';
import { parsePie } from '../mapmaker/js/pie.js';
import { drawSoftwareUnit } from '../mapmaker/js/softwareUnitPreview.js?v=20261010-software-3d-1';
import { buildUnit, cachedLoad, retryLoad, validateUnitGeometry } from './site-armory-unit-model-utils.mjs?v=20261025-recovery-1';
import { createModelPreloader, publishModelState, createRenderCheck, boundedAsset } from './site-armory-preload.mjs?v=20261027-models-1';

const layer = document.getElementById('armoryTargets');
if (layer && window.SiteArmoryBattle) mountUnits();

function mountUnits() {
  const geometries = new Map(), textures = new Map(), templates = new Map(), items = new Map();
  const waits = new Map(), requests = new Set();
  const catalog = () => window.SiteArmoryBattle.loadCatalog(window);
  let frame = null, last = -Infinity, disposed = false;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => { if (frame != null) cancelAnimationFrame(frame); frame = null; };
  const draw = now => {
    for (const item of items.values()) {
      if (!item.model || !item.node.isConnected) continue;
      if (!motion.matches) item.model.rotation.y = now * .0003 + (Number(item.node.dataset.renderSeed ?? item.node.dataset.unitId) || 0) * .4;
      try {
        drawSoftwareUnit(item.model, item.canvas);
        if (!(Number(item.canvas.dataset.triangles) > 0)) throw Error('Unit model has no visible triangles.');
        item.visual.classList.add('has-model'); item.node.dataset.modelState = 'ready';
      } catch { item.visual.classList.remove('has-model'); item.node.dataset.modelState = 'fallback'; }
    }
  };
  const tick = now => {
    frame = null;
    if (disposed || document.hidden || layer.hidden || !items.size) return;
    if (now - last >= 50) { last = now; draw(now); }
    frame = requestAnimationFrame(tick);
  };
  const sync = () => { stop(); if (!disposed && !document.hidden && !layer.hidden && items.size) frame = requestAnimationFrame(tick); };
  const wait = ms => new Promise(resolve => {
    const timer = setTimeout(() => { waits.delete(timer); resolve(); }, ms); waits.set(timer, resolve);
  });
  const retry = load => retryLoad(load, { wait, active: () => !disposed });
  function geometry(path) {
    return cachedLoad(geometries, path, async () => {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000); requests.add(controller);
      try {
        const response = await fetch(new URL('../mapmaker/pies/components/' + path, import.meta.url), { signal: controller.signal, cache: 'no-cache' });
        if (!response.ok) throw Error(`Unit part unavailable (${response.status}): ${path}`);
        const parsed = parsePie(await response.text());
        try { return validateUnitGeometry(parsed); } catch (error) { parsed.dispose(); throw error; }
      } finally { clearTimeout(timeout); requests.delete(controller); }
    });
  }
  function texture(name) {
    if (!/^[a-z0-9_-]+\.png$/i.test(name || '')) return Promise.reject(Error('Invalid unit texture.'));
    return cachedLoad(textures, name, () => retry(() => boundedAsset(new TextureLoader().loadAsync(new URL('../mapmaker/classic/texpages/texpages/' + name, import.meta.url).href))
      .then(value => { value.magFilter = NearestFilter; return value; })));
  }
  function template(key) {
    return cachedLoad(templates, key, () => retry(async () => {
      const type = (await catalog()).find(type => type.key === key);
      if (!type) throw Error('Unknown unit design.');
      const parts = await Promise.all(type.parts.map(async part => {
        const geo = await geometry(part.path);
        // A template is ready only when every part and its texture are ready.
        return { role: part.role, geometry: geo, texture: await texture(geo.userData.textureName) };
      }));
      return buildUnit(parts);
    }));
  }
  function loadItem(item) {
    const { node, visual, canvas } = item; node.dataset.modelState = 'loading';
    template(node.dataset.unitKey).then(model => {
      if (disposed || !node.isConnected || items.get(node) !== item) return;
      // Templates are cached; kills remove only an instance, never shared assets.
      item.model = model.clone(true); item.model.rotation.y = -.6;
      visual.append(canvas); draw(performance.now()); sync();
    }).catch(error => {
      if (disposed || !node.isConnected || items.get(node) !== item) return;
      node.dataset.modelState = 'fallback';
      console.warn('Unit target model unavailable; keeping it hidden.', node.dataset.unitKey, error);
    });
  }
  function recoverFailed() {
    if (disposed || document.hidden || layer.hidden) return;
    for (const item of items.values()) if (!item.model && item.node.dataset.modelState === 'fallback') loadItem(item);
    sync();
  }
  function reconcile() {
    for (const [node] of items) if (!node.isConnected || node.parentElement !== layer) items.delete(node);
    for (const node of layer.children) {
      if (items.has(node)) continue;
      const visual = node.querySelector('.armory-unit-visual');
      const canvas = document.createElement('canvas'); canvas.dataset.engine = 'software-3d';
      const item = { node, visual, canvas, model: null }; items.set(node, item); loadItem(item);
    }
    sync();
  }
  const observer = new MutationObserver(records => {
    reconcile();
    // The game rewrites data-armed during routine HUD updates. Only a real
    // visibility/armed transition may start another recovery batch.
    if (records.some(record => record.type === 'attributes' && record.oldValue !== layer.getAttribute(record.attributeName))) recoverFailed();
  });
  observer.observe(layer, { childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'data-armed'] });
  document.addEventListener('visibilitychange', recoverFailed); document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', recoverFailed); window.addEventListener('online', recoverFailed);
  window.addEventListener('pagehide', event => {
    stop(); if (event.persisted) return;
    disposed = true; observer.disconnect();
    for (const controller of requests) controller.abort();
    for (const [timer, resolve] of waits) { clearTimeout(timer); resolve(); } waits.clear();
    for (const pending of geometries.values()) pending.then(value => value.dispose()).catch(() => {});
    for (const pending of textures.values()) pending.then(value => value?.dispose()).catch(() => {});
    for (const pending of templates.values()) pending.then(value => value.traverse(mesh => { if (mesh.isMesh) mesh.material.dispose(); })).catch(() => {});
  });
  reconcile();
  const rack = document.getElementById('siteArmory');
  if (rack) {
    const prepare = createModelPreloader({items: catalog, load: type => template(type.key),
      validate: createRenderCheck(drawSoftwareUnit), active: () => !disposed,
      onState: state => publishModelState(rack, 'Units', state)});
    const warm = () => prepare().catch(error => console.warn('Unit models could not be prepared.', error));
    rack.addEventListener('boha:armory-preload-retry', warm); warm();
  }
}
