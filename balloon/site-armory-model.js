import { TextureLoader, NearestFilter } from '../mapmaker/js/three.module.js';
import { parsePie } from '../mapmaker/js/pie.js';
import { drawSoftwareUnit } from '../mapmaker/js/softwareUnitPreview.js?v=20261010-software-3d-1';
import { TECH_PATHS, turretFor, createTierLoader, buildTurret, disposeTurret } from './site-armory-model-utils.mjs?v=20261027-models-1';
import { cachedLoad, retryLoad, validateUnitGeometry } from './site-armory-unit-model-utils.mjs?v=20261025-recovery-1';
import { createModelPreloader, publishModelState, createRenderCheck, boundedAsset } from './site-armory-preload.mjs?v=20261027-models-1';

const rack = document.getElementById('siteArmory');
if (rack) mountTurrets();

function mountTurrets() {
  const items = [], textures = new Map(), geometries = new Map(), models = new Map();
  let frame = null, lastFrame = -Infinity, phase = -.65, previous = null, visible = true, disposed = false;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  // Local rotation is explicitly requested; public visitors retain reduced motion.
  const canRotate = () => !disposed && rack.dataset.started === 'true' && !!rack.dataset.armed && !document.hidden && visible && (localPreview || !motion.matches)
    && !document.body.classList.contains('site-news-open')
    && !document.body.classList.contains('radio-playlist-open')
    && !document.body.classList.contains('replay-analyzer-modal-open');
  const stop = () => { if (frame != null) cancelAnimationFrame(frame); frame = null; previous = null; };
  const draw = () => {
    for (const [index, item] of items.entries()) {
      if (!item.model) continue;
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
  overlays.observe(rack, { attributes: true, attributeFilter: ['data-started', 'data-armed'] });
  const tiers = new MutationObserver(() => { for (const item of items) item.loader.select(turretFor(item.weapon, Number(item.button.dataset.level) || 1)); });
  tiers.observe(rack, { attributes: true, subtree: true, attributeFilter: ['data-definition'] });
  const resize = new ResizeObserver(draw); resize.observe(rack);
  document.addEventListener('visibilitychange', sync); motion.addEventListener('change', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', event => {
    stop();
    if (event.persisted) return;
    disposed = true; observer.disconnect(); overlays.disconnect(); tiers.disconnect(); resize.disconnect();
    items.forEach(item => item.loader.dispose());
    for (const pending of models.values()) pending.then(disposeTurret).catch(() => {});
    for (const pending of geometries.values()) pending.then(geometry => geometry.dispose()).catch(() => {});
    for (const pending of textures.values()) pending.then(texture => texture?.dispose());
  });
  const loadGeometry = async name => {
    return cachedLoad(geometries, name, () => retryLoad(async () => {
      const response = await fetch(new URL('../mapmaker/pies/components/weapons/' + name, import.meta.url), {signal: AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('Turret model unavailable.');
      return validateUnitGeometry(parsePie(await response.text()));
    }, {active: () => !disposed}));
  };
  const loadTexture = name => {
    if (!/^[a-z0-9_-]+\.png$/i.test(name || '')) return Promise.reject(Error('Invalid turret texture.'));
    return cachedLoad(textures, name, () => retryLoad(() => boundedAsset(new TextureLoader().loadAsync(new URL('../mapmaker/classic/texpages/texpages/' + name, import.meta.url).href))
      .then(texture => { texture.magFilter = NearestFilter; return texture; }), {active: () => !disposed}));
  };
  const loadModel = files => {
    return cachedLoad(models, files.definition, async () => {
      const [mount, barrel] = await Promise.all([loadGeometry(files.mount), loadGeometry(files.barrel)]);
      const texture = await loadTexture(mount.userData.textureName);
      // Each cached model owns its geometry clones; shared texture ownership is
      // retained by the texture cache until page exit.
      return buildTurret(mount.clone(), barrel.clone(), texture);
    });
  };
  for (const weapon of Object.keys(TECH_PATHS)) {
    const button = rack.querySelector(`[data-weapon="${weapon}"]`), stage = button?.querySelector('.armory-gun-preview');
    if (!stage) continue;
    const canvas = document.createElement('canvas'); canvas.dataset.engine = 'software-3d'; stage.append(canvas);
    const item = { weapon, button, stage, canvas, model: null, loader: null }; items.push(item);
    item.loader = createTierLoader(loadModel, result => {
      stage.dataset.modelState = result.status;
      if (result.status === 'loading') return; // Keep the old model until the new tier is ready.
      item.model = result.model || null;
      stage.dataset.modelDefinition = result.model ? result.definition : '';
      canvas.dataset.definition = result.model ? result.definition : '';
      if (!result.model) stage.classList.remove('has-model');
      draw(); sync();
    });
    item.loader.select(turretFor(weapon, Number(button.dataset.level) || 1));
  }
  const prepare = createModelPreloader({items: async () => Object.values(TECH_PATHS).flat(), load: loadModel,
    validate: createRenderCheck(drawSoftwareUnit), active: () => !disposed,
    onState: state => publishModelState(rack, 'Weapons', state)});
  const warm = () => prepare().then(() => {
    for (const item of items) item.loader.select(turretFor(item.weapon, Number(item.button.dataset.level) || 1));
    draw(); sync();
  }).catch(error => console.warn('Weapon models could not be prepared.', error));
  rack.addEventListener('boha:armory-preload-retry', warm);
  warm();
}
