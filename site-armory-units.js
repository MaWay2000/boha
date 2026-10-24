import { TextureLoader, NearestFilter } from './mapmaker/js/three.module.js';
import { parsePie } from './mapmaker/js/pie.js';
import { drawSoftwareUnit } from './mapmaker/js/softwareUnitPreview.js?v=20261010-software-3d-1';
import { buildUnit } from './site-armory-unit-model-utils.mjs';

const layer = document.getElementById('armoryTargets');
if (layer && window.SiteArmoryBattle) mountUnits();

function mountUnits() {
  const geometries = new Map(), textures = new Map(), templates = new Map(), items = new Map();
  const catalog = window.SiteArmoryBattle.loadCatalog(window);
  let frame = null, last = -Infinity, disposed = false;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => { if (frame != null) cancelAnimationFrame(frame); frame = null; };
  const draw = now => {
    for (const item of items.values()) {
      if (!item.model || !item.node.isConnected) continue;
      if (!motion.matches) item.model.rotation.y = now * .0003 + (Number(item.node.dataset.renderSeed ?? item.node.dataset.unitId) || 0) * .4;
      try {
        drawSoftwareUnit(item.model, item.canvas);
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
  function geometry(path) {
    if (!geometries.has(path)) geometries.set(path, (async () => {
      const response = await fetch(new URL('./mapmaker/pies/components/' + path, import.meta.url));
      if (!response.ok) throw Error('Unit part unavailable.');
      return parsePie(await response.text());
    })());
    return geometries.get(path);
  }
  function texture(name) {
    if (!/^[a-z0-9_-]+\.png$/i.test(name || '')) return Promise.resolve(null);
    if (!textures.has(name)) textures.set(name, new TextureLoader().loadAsync(new URL('./mapmaker/classic/texpages/texpages/' + name, import.meta.url).href)
      .then(value => { value.magFilter = NearestFilter; return value; }).catch(() => null));
    return textures.get(name);
  }
  function template(key) {
    if (!templates.has(key)) templates.set(key, (async () => {
      const type = (await catalog).find(type => type.key === key);
      if (!type) throw Error('Unknown unit design.');
      const parts = await Promise.all(type.parts.map(async part => {
        const geo = await geometry(part.path);
        return { role: part.role, geometry: geo, texture: await texture(geo.userData.textureName) };
      }));
      return buildUnit(parts);
    })());
    return templates.get(key);
  }
  function reconcile() {
    for (const [node] of items) if (!node.isConnected || node.parentElement !== layer) items.delete(node);
    for (const node of layer.children) {
      if (items.has(node)) continue;
      const visual = node.querySelector('.armory-unit-visual');
      const canvas = document.createElement('canvas'); canvas.dataset.engine = 'software-3d';
      const item = { node, visual, canvas, model: null }; items.set(node, item); node.dataset.modelState = 'loading';
      template(node.dataset.unitKey).then(model => {
        if (disposed || !node.isConnected || !items.has(node)) return;
        // Templates are cached; kills remove only an instance, never shared assets.
        item.model = model.clone(true); item.model.rotation.y = -.6;
        visual.append(canvas); draw(performance.now()); sync();
      }).catch(error => { node.dataset.modelState = 'fallback'; console.warn('Unit target preview unavailable; using its silhouette.', error); });
    }
    sync();
  }
  const observer = new MutationObserver(reconcile);
  observer.observe(layer, { childList: true, attributes: true, attributeFilter: ['hidden', 'data-armed'] });
  document.addEventListener('visibilitychange', sync); window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', event => {
    stop(); if (event.persisted) return;
    disposed = true; observer.disconnect();
    for (const pending of geometries.values()) pending.then(value => value.dispose()).catch(() => {});
    for (const pending of textures.values()) pending.then(value => value?.dispose()).catch(() => {});
    for (const pending of templates.values()) pending.then(value => value.traverse(mesh => { if (mesh.isMesh) mesh.material.dispose(); })).catch(() => {});
  });
  reconcile();
}
