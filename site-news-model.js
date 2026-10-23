import * as THREE from './mapmaker/js/three.module.js';
import { GLTFLoader } from './assets/vendor/three-r149/GLTFLoader.js';
import { RoomEnvironment } from './assets/vendor/three-r149/RoomEnvironment.js';
import { batchStaticRig, cameraFrame } from './site-news-model-utils.mjs';

const button = document.getElementById('siteNewsBalloon');
if (button) mountModel().catch(error => {
  button.dataset.modelState = 'fallback';
  button.classList.remove('has-3d');
  console.warn('News balloon 3D preview unavailable; using its image.', error);
});

async function mountModel() {
  let renderer, environment, model, scene, mixer, observer, resizeObserver;
  let frame = null, previous = null, phase = 0, disposed = false;
  const canvas = document.createElement('canvas');
  canvas.className = 'news-balloon-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const stop = () => { if (frame != null) cancelAnimationFrame(frame); frame = null; previous = null; };
  const dispose = () => {
    if (disposed) return;
    disposed = true; stop(); observer?.disconnect(); resizeObserver?.disconnect();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene?.traverse(object => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
    environment?.dispose(); renderer?.dispose(); canvas.remove();
    button.classList.remove('has-3d');
  };
  try {
    button.dataset.modelState = 'loading';
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    // Supersample the small canvas so embossed text and suspension ropes stay
    // sharp even on a standard-density display. Keep GPU work capped at 2x.
    renderer.setPixelRatio(2);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    const gltf = await new GLTFLoader().loadAsync(new URL('./assets/news-balloon-v01.glb', import.meta.url).href);
    scene = new THREE.Scene();
    model = batchStaticRig(gltf.scene, gltf.animations);
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) throw new Error('The balloon model contains no visible geometry.');
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Invalid balloon dimensions.');
    const normalized = new THREE.Group();
    normalized.add(model);
    normalized.scale.setScalar(2 / size.y);
    model.position.sub(center);
    // Preserve the Blender float-rig animation; the outer button owns the
    // 0–300px screen-space flight, independent of model-space motion.
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) mixer.clipAction(clip).play();
    const facing = new THREE.Group(); facing.add(normalized); scene.add(facing);
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
    environment = pmrem.fromScene(room, 0.04); scene.environment = environment.texture;
    room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xe2f4ff, 0x3b4755, 0.9));
    const key = new THREE.DirectionalLight(0xf1f8ff, 2.5); key.position.set(-3, 5, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0x86c9ff, 1.2); fill.position.set(4, 1, 3); scene.add(fill);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
    camera.position.set(0, 0.1, 8); camera.lookAt(0, 0, 0);
    const render = () => {
      facing.rotation.y = -0.13 + Math.sin(phase * 0.25) * 0.14;
      renderer.render(scene, camera);
      button.dataset.modelDrawCalls = String(renderer.info.render.calls);
    };
    const resize = () => {
      const width = button.clientWidth, height = button.clientHeight;
      if (!width || !height || disposed) return;
      renderer.setSize(width, height, false);
      const fit = cameraFrame(size.clone().multiplyScalar(2 / size.y), width / height);
      Object.assign(camera, fit); camera.updateProjectionMatrix(); render();
    };
    const canAnimate = () => !disposed && !document.hidden && button.dataset.flying === 'true'
      && !document.body.classList.contains('replay-analyzer-modal-open')
      && !document.body.classList.contains('radio-playlist-open');
    const tick = now => {
      frame = null;
      if (!canAnimate()) { previous = null; return; }
      if (previous == null) previous = now;
      const dt = (now - previous) / 1000;
      if (dt >= 1 / 30) {
        const step = Math.min(dt, 0.1); phase += step; mixer.update(step); render(); previous = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => { stop(); if (canAnimate()) frame = requestAnimationFrame(tick); };
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); button.dataset.modelState = 'fallback'; dispose();
    });
    button.append(canvas); resize();
    button.classList.add('has-3d'); button.dataset.modelState = 'ready';
    button.dataset.modelAnimationClips = String(gltf.animations.length);
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(button);
    observer = new MutationObserver(sync); observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    button.addEventListener('boha:news-balloon-state', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', event => { if (event.persisted) stop(); else dispose(); });
    window.addEventListener('pageshow', sync);
    sync();
  } catch (error) { dispose(); throw error; }
}
