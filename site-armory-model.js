import { TextureLoader, NearestFilter } from './mapmaker/js/three.module.js';
import { parsePie } from './mapmaker/js/pie.js';
import { drawSoftwareUnit } from './mapmaker/js/softwareUnitPreview.js?v=20261010-software-3d-1';
import { TURRETS, buildTurret, disposeTurret } from './site-armory-model-utils.mjs?v=20261024-rockets-1';

const rack = document.getElementById('siteArmory');
if (rack) mountTurrets();

function mountTurrets() {
  const items = [], textures = new Map();
  let frame = null, lastFrame = -Infinity, phase = -.65, previous = null, visible = true, disposed = false;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  // Local rotation is explicitly requested; public visitors retain reduced motion.
  const canRotate = () => !disposed && !document.hidden && visible && (localPreview || !motion.matches)
    && !document.body.classList.contains('site-news-open')
    && !document.body.classList.contains('radio-playlist-open')
    && !document.body.classList.contains('replay-analyzer-modal-open');
  const stop = () => { if (frame != null) cancelAnimationFrame(frame); frame = null; previous = null; };
  const draw = () => {
    for (const [index, item] of items.entries()) {
      item.model.rotation.y = phase + index * .2;
      try {
        drawSoftwareUnit(item.model, item.canvas);
        item.canvas.dataset.rotation = item.model.rotation.y.toFixed(3);
        item.stage.classList.add('has-model'); item.stage.dataset.modelState = 'ready';
      } catch {
        item.stage.classList.remove('has-model'); item.stage.dataset.modelState = 'fallback';
      }
    }
  };
  const tick = now => {
    frame = null;
    if (!canRotate()) { previous = null; return; }
    if (now - lastFrame >= 50) {
      if (previous != null) phase += Math.min((now - previous) / 1000, .1) * .42;
      previous = now; lastFrame = now; draw();
    }
    frame = requestAnimationFrame(tick);
  };
  const sync = () => { stop(); if (items.length && canRotate()) frame = requestAnimationFrame(tick); };
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
  observer.observe(rack);
  const overlays = new MutationObserver(sync);
  overlays.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const resize = new ResizeObserver(draw); resize.observe(rack);
  document.addEventListener('visibilitychange', sync); motion.addEventListener('change', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', event => {
    stop();
    if (event.persisted) return;
    disposed = true; observer.disconnect(); overlays.disconnect(); resize.disconnect();
    items.forEach(item => disposeTurret(item.model));
    for (const pending of textures.values()) pending.then(texture => texture?.dispose());
  });
  const loadGeometry = async name => {
    const response = await fetch(new URL('./mapmaker/pies/components/weapons/' + name, import.meta.url));
    if (!response.ok) throw new Error('Turret model unavailable.');
    return parsePie(await response.text());
  };
  const loadTexture = name => {
    if (!/^[a-z0-9_-]+\.png$/i.test(name || '')) return Promise.resolve(null);
    if (!textures.has(name)) {
      textures.set(name, new TextureLoader().loadAsync(new URL('./mapmaker/classic/texpages/texpages/' + name, import.meta.url).href)
        .then(texture => { texture.magFilter = NearestFilter; return texture; }).catch(() => null));
    }
    return textures.get(name);
  };
  for (const [weapon, files] of Object.entries(TURRETS)) {
    const stage = rack.querySelector(`[data-weapon="${weapon}"] .armory-gun-preview`);
    if (!stage) continue;
    stage.dataset.modelState = 'loading';
    (async () => {
      const [mount, barrel] = await Promise.all([loadGeometry(files.mount), loadGeometry(files.barrel)]);
      const texture = await loadTexture(mount.userData.textureName);
      const model = buildTurret(mount, barrel, texture);
      if (disposed) { disposeTurret(model); return; }
      const canvas = document.createElement('canvas'); canvas.dataset.engine = 'software-3d';
      stage.append(canvas); items.push({ stage, canvas, model }); draw(); sync();
    })().catch(error => {
      stage.dataset.modelState = 'fallback'; stage.classList.remove('has-model');
      console.warn('Armory turret preview unavailable; using the icon.', error);
    });
  }
}
