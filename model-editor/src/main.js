import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getUvMode, parsePie, serializePie, summarizeLevel } from "./pie-format.js";
import { createTaskGate, createRenderScheduler, parseCoordinateInput } from "./viewer-runtime.js";
import { selectableBodies, compatiblePropulsions, compatibleWeapons, reconcileDesign, validateDesign, designName, weaponSlotCount, isCyborgBody, isFlyingPropulsion, modulePartSpecs, assemblyPartTransform, DROID_TEXTURE_ALIASES } from "./droid-design.js";

const elements = {
  exportButton: document.querySelector("#export-button"),
  fileInput: document.querySelector("#file-input"),
  fitButton: document.querySelector("#fit-button"),
  levelSelect: document.querySelector("#level-select"),
  modelChip: document.querySelector("#model-chip"),
  modelSummary: document.querySelector("#model-summary"),
  notesList: document.querySelector("#notes-list"),
  pointEditor: document.querySelector("#point-editor"),
  pointEmpty: document.querySelector("#point-empty"),
  pointList: document.querySelector("#point-list"),
  pointX: document.querySelector("#point-x"),
  pointY: document.querySelector("#point-y"),
  pointZ: document.querySelector("#point-z"),
  sampleButton: document.querySelector("#sample-button"),
  selectedPointIndex: document.querySelector("#selected-point-index"),
  statusText: document.querySelector("#status-text"),
  textureChip: document.querySelector("#texture-chip"),
  toggleAxes: document.querySelector("#toggle-axes"),
  toggleConnectors: document.querySelector("#toggle-connectors"),
  toggleGrid: document.querySelector("#toggle-grid"),
  toggleInvertV: document.querySelector("#toggle-invert-v"),
  togglePoints: document.querySelector("#toggle-points"),
  toggleWireframe: document.querySelector("#toggle-wireframe"),
  uvBadge: document.querySelector("#uv-badge"),
  viewer: document.querySelector("#viewer"),
  connectorList: document.querySelector("#connector-list"),
};

const SAMPLE_PIE_URL = new URL("../samples/trlcan.pie", import.meta.url).href;
const MAPMAKER_ROOT = new URL("../mapmaker/", window.location.href).href.replace(/\/$/, "");
const MAPMAKER_PIE_ROOT = `${MAPMAKER_ROOT}/pies`;
const MAPMAKER_CATALOG_URL = new URL("../mapmaker-assets.json", import.meta.url).href;

const assetKindControls = document.createElement("div");
assetKindControls.className = "asset-kind-controls";
assetKindControls.setAttribute("aria-label", "Left panel mode");
assetKindControls.innerHTML = `
  <input id="asset-kind" type="hidden" value="module" />
  <button class="button asset-kind-button" type="button" data-asset-kind="pie" aria-pressed="false">
    Individual PIE files
  </button>
  <button class="button asset-kind-button active" type="button" data-asset-kind="module" aria-pressed="true">
    Complete droid modules
  </button>
  <button class="button asset-kind-button" id="viewport-menu-button" type="button" aria-pressed="false">
    View
  </button>
  <button class="button asset-kind-button" id="summary-menu-button" type="button" aria-pressed="false">
    Summary
  </button>
  <button class="button asset-kind-button" id="edit-menu-button" type="button" aria-pressed="false">
    Edit
  </button>
`;
document.querySelector(".topbar-actions")?.append(assetKindControls);

const viewportControls = elements.levelSelect.closest(".section");
viewportControls.classList.remove("section");
viewportControls.classList.add("viewport-menu-panel");
viewportControls.setAttribute("aria-label", "Viewport controls");
viewportControls.hidden = true;

const summaryPanel = elements.modelSummary.closest(".section");
summaryPanel.classList.remove("section");
summaryPanel.classList.add("summary-menu-panel");
summaryPanel.setAttribute("aria-label", "Model summary");
summaryPanel.hidden = true;

const editPanel = elements.pointEditor.closest(".section");
editPanel.classList.remove("section");
editPanel.classList.add("edit-menu-panel");
editPanel.setAttribute("aria-label", "Selected point editor");
editPanel.hidden = true;

const mapmakerBrowser = document.createElement("div");
mapmakerBrowser.className = "mapmaker-browser";
mapmakerBrowser.innerHTML = `
  <div class="droid-designer" id="droid-designer">
    <p class="section-kicker">Build a droid</p>
    <label class="field"><span>Body</span><select id="design-body" disabled></select></label>
    <label class="field"><span>Propulsion</span><select id="design-propulsion" disabled></select></label>
    <label class="field"><span>Gun</span><select id="design-gun" disabled></select></label>
    <label class="field" id="design-gun-2-field" hidden><span>Gun 2 (optional)</span><select id="design-gun-2" disabled></select></label>
    <label class="field" id="design-gun-3-field" hidden><span>Gun 3 (optional)</span><select id="design-gun-3" disabled></select></label>
    <button class="button ghost" id="build-droid-button" type="button" disabled>Build droid</button>
    <p class="designer-help" id="design-help" role="status">Loading components...</p>
  </div>
  <label class="field" for="asset-search"><span id="asset-library-label">Presets</span></label>
  <label class="field">
    <input id="asset-search" type="search" placeholder="cannon, body, wheels..." disabled />
  </label>
  <select class="asset-results" id="asset-results" size="5" aria-label="Presets" disabled></select>
  <p class="section-copy compact" id="asset-status" role="status">Loading model catalog...</p>
  <label class="field assembly-part-field" id="assembly-part-field" hidden>
    <span>Edit module part</span>
    <select id="assembly-part-select"></select>
  </label>
`;
document.querySelector(".library-section")?.append(
  mapmakerBrowser,
  viewportControls,
  summaryPanel,
  editPanel,
);

Object.assign(elements, {
  designer: mapmakerBrowser.querySelector("#droid-designer"),
  designBody: mapmakerBrowser.querySelector("#design-body"),
  designPropulsion: mapmakerBrowser.querySelector("#design-propulsion"),
  designGuns: ["#design-gun", "#design-gun-2", "#design-gun-3"].map((id) => mapmakerBrowser.querySelector(id)),
  designGunFields: [null, mapmakerBrowser.querySelector("#design-gun-2-field"), mapmakerBrowser.querySelector("#design-gun-3-field")],
  designHelp: mapmakerBrowser.querySelector("#design-help"),
  buildDroidButton: mapmakerBrowser.querySelector("#build-droid-button"),
  assetLibraryLabel: mapmakerBrowser.querySelector("#asset-library-label"),
  assemblyPartField: mapmakerBrowser.querySelector("#assembly-part-field"),
  assemblyPartSelect: mapmakerBrowser.querySelector("#assembly-part-select"),
  assetKind: assetKindControls.querySelector("#asset-kind"),
  assetKindButtons: assetKindControls.querySelectorAll("[data-asset-kind]"),
  assetResults: mapmakerBrowser.querySelector("#asset-results"),
  assetSearch: mapmakerBrowser.querySelector("#asset-search"),
  assetStatus: mapmakerBrowser.querySelector("#asset-status"),
  editMenuButton: assetKindControls.querySelector("#edit-menu-button"),
  summaryMenuButton: assetKindControls.querySelector("#summary-menu-button"),
  viewportMenuButton: assetKindControls.querySelector("#viewport-menu-button"),
});

const state = {
  activeLevelIndex: 0,
  assembly: [],
  assemblyName: "",
  design: null,
  designDraft: { body: "Body1REC", propulsion: "wheeled01", weapons: ["MG1Mk1"] },
  designNotice: "",
  model: null,
  mapmaker: {
    bodies: {},
    pathIndex: new Map(),
    piePaths: [],
    propulsions: {},
    templates: {},
    weapons: {},
  },
  selectedPointIndex: null,
  loadedTextures: new Map(),
  textureLoads: new Map(),
  retiredTextureUrls: new Set(),
  textureUrls: new Map(),
  view: {
    axes: true,
    connectors: true,
    grid: true,
    invertV: false,
    points: true,
    wireframe: true,
  },
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 4000);
camera.position.set(42, 32, 48);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(elements.viewer.clientWidth, elements.viewer.clientHeight);
elements.viewer.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 8, 0);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const modelGroup = new THREE.Group();
scene.add(modelGroup);

const gridHelper = new THREE.GridHelper(160, 16, 0x274046, 0x1b2f34);
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(18);
scene.add(axesHelper);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));

const keyLight = new THREE.DirectionalLight(0xffd0a3, 1.45);
keyLight.position.set(28, 40, 32);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x7dcfc6, 0.6);
fillLight.position.set(-24, 20, -22);
scene.add(fillLight);

const sceneObjects = {
  mesh: null,
  scale: 20,
  partGroup: null,
  connectors: null,
  pointCloud: null,
  selectedPoint: null,
  wireframe: null,
};

const modelLoads = createTaskGate();
const sceneBuilds = createTaskGate();
const frameScheduler = createRenderScheduler({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  update: () => controls.update(),
  render: () => renderer.render(scene, camera),
  isHidden: () => document.hidden,
});
controls.addEventListener("change", frameScheduler.request);
controls.addEventListener("start", frameScheduler.request);
controls.addEventListener("end", frameScheduler.request);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) frameScheduler.cancel();
  else frameScheduler.request();
});

const resizeObserver = new ResizeObserver(() => {
  const width = elements.viewer.clientWidth || 1;
  const height = elements.viewer.clientHeight || 1;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  frameScheduler.request();
});

resizeObserver.observe(elements.viewer);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function startModelLoad() {
  sceneBuilds.begin();
  return modelLoads.begin();
}

function reportLoaded(message) {
  setStatus([message, state.textureWarning].filter(Boolean).join(" "));
}

function reportCatalogFailure(error) {
  elements.assetStatus.textContent = `Could not load the model catalog: ${error.message} You can still open a local PIE file.`;
  elements.designHelp.textContent = "Components unavailable. You can still open local PIE files.";
}

async function runAction(action, label) {
  let token;
  try {
    const pending = action();
    token = modelLoads.current();
    return await pending;
  } catch (error) {
    if (token === undefined || modelLoads.isCurrent(token)) {
      setStatus(`${label}: ${error.message}`);
      renderChrome();
    }
    return false;
  }
}

function getActiveLevel() {
  return state.model?.levels?.[state.activeLevelIndex] ?? null;
}

function formatCoordinate(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const normalized = Math.abs(value) < 1e-9 ? 0 : value;

  if (Number.isInteger(normalized)) {
    return String(normalized);
  }

  return normalized.toFixed(4).replace(/\.?0+$/, "");
}

function normalizeTextureKey(value) {
  return value.replaceAll("\\", "/").split("/").pop().toLowerCase();
}

function modelTexture(model, levelIndex = 0) {
  return model?.levels?.[levelIndex]?.texture ?? model?.texture;
}

async function loadTextureForModel(model, levelIndex = 0) {
  const name = modelTexture(model, levelIndex)?.name;
  const url = name && state.textureUrls.get(normalizeTextureKey(name));
  if (!url) return null;
  if (state.loadedTextures.has(url)) return state.loadedTextures.get(url);
  if (!state.textureLoads.has(url)) {
    const pending = new THREE.TextureLoader().loadAsync(url).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      state.loadedTextures.set(url, texture);
      return texture;
    }).finally(() => state.textureLoads.delete(url));
    state.textureLoads.set(url, pending);
  }
  return state.textureLoads.get(url);
}

function collectRetiredTextures() {
  const active = new Set();
  modelGroup.traverse((node) => { if (node.material?.map) active.add(node.material.map); });
  const registered = new Set(state.textureUrls.values());
  for (const [url, texture] of state.loadedTextures) {
    if (!registered.has(url) && !active.has(texture)) {
      texture.dispose();
      state.loadedTextures.delete(url);
    }
  }
  for (const url of state.retiredTextureUrls) {
    if (!state.loadedTextures.has(url) && !state.textureLoads.has(url)) {
      URL.revokeObjectURL(url);
      state.retiredTextureUrls.delete(url);
    }
  }
}

function uvToThree(uv, model = state.model, levelIndex = state.activeLevelIndex) {
  const texture = modelTexture(model, levelIndex);
  if (!texture) {
    return [uv.u, uv.v];
  }

  const { width, height } = texture;
  const useNormalized = model.version >= 3 || width === 0 || height === 0;
  const u = useNormalized ? uv.u : uv.u / width;
  const v = useNormalized ? uv.v : uv.v / height;

  return [u, state.view.invertV ? 1 - v : v];
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children[group.children.length - 1];
    group.remove(child);

    child.traverse?.((node) => {
      node.geometry?.dispose?.();

      if (Array.isArray(node.material)) {
        node.material.forEach((material) => material.dispose?.());
      } else {
        node.material?.dispose?.();
      }
    });
  }
}

function buildLevelGeometry(level, model = state.model, levelIndex = state.activeLevelIndex) {
  const positions = [];
  const uvs = [];

  for (const polygon of level.polygons) {
    for (let triangleIndex = 1; triangleIndex < polygon.vertexCount - 1; triangleIndex += 1) {
      for (const vertexIndex of [0, triangleIndex, triangleIndex + 1]) {
        const point = level.points[polygon.indices[vertexIndex]];

        if (!point) throw new Error(`Polygon references missing point ${polygon.indices[vertexIndex]}.`);

        positions.push(point.x, point.y, point.z);
        const uv = polygon.uvs[vertexIndex] ?? { u: 0, v: 0 };
        const [u, v] = uvToThree(uv, model, levelIndex);
        uvs.push(u, v);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildPointGeometry(level) {
  const positions = level.points.flatMap((point) => [point.x, point.y, point.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildConnectorGeometry(level) {
  const positions = level.connectors.flatMap((point) => [point.x, point.y, point.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function computeModelScale(level) {
  if (!level.points.length) {
    return 20;
  }

  const box = new THREE.Box3().setFromPoints(
    level.points.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
  );

  return Math.max(box.getSize(new THREE.Vector3()).length(), 8);
}



function fitCameraToAssembly() {
  if (!state.assembly.length || !modelGroup.children.length) {
    return;
  }

  modelGroup.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(modelGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 10);
  const distance = maxSize * 1.8;

  camera.position.set(center.x + distance, center.y + distance * 0.7, center.z + distance);
  controls.target.copy(center);
  controls.update();
}

function fitCameraToCurrentLevel() {
  if (state.assembly.length) {
    fitCameraToAssembly();
    return;
  }

  const level = getActiveLevel();

  if (!level) {
    return;
  }

  const box = new THREE.Box3().setFromPoints(
    level.points.map((point) => new THREE.Vector3(point.x, point.y, point.z)),
  );

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 10);
  const distance = maxSize * 1.8;

  camera.position.set(center.x + distance, center.y + distance * 0.7, center.z + distance);
  controls.target.copy(center);
  controls.update();
}

function updateSelectedPointMarker() {
  const level = getActiveLevel();
  const point = level?.points[state.selectedPointIndex];
  if (!point) {
    if (sceneObjects.selectedPoint) sceneObjects.selectedPoint.visible = false;
    return;
  }
  if (!sceneObjects.selectedPoint) {
    sceneObjects.selectedPoint = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff9656 }),
    );
    sceneObjects.partGroup.add(sceneObjects.selectedPoint);
  }
  const marker = sceneObjects.selectedPoint;
  marker.visible = state.view.points;
  marker.scale.setScalar(Math.max(sceneObjects.scale * 0.02, 0.45));
  marker.position.set(point.x, point.y, point.z);
}

function updateOverlayVisibility() {
  gridHelper.visible = state.view.grid;
  axesHelper.visible = state.view.axes;
  if (sceneObjects.wireframe) sceneObjects.wireframe.visible = state.view.wireframe;
  if (sceneObjects.pointCloud) sceneObjects.pointCloud.visible = state.view.points;
  if (sceneObjects.connectors) sceneObjects.connectors.visible = state.view.connectors;
  updateSelectedPointMarker();
  frameScheduler.request();
}

function captureModelState() {
  const { model, assembly, assemblyName, activeLevelIndex, selectedPointIndex, design } = state;
  return { model, assembly, assemblyName, activeLevelIndex, selectedPointIndex, design };
}

async function prepareScene(snapshot) {
  const group = new THREE.Group();
  const objects = { mesh: null, connectors: null, pointCloud: null, selectedPoint: null, wireframe: null, scale: 20, partGroup: null };
  const warnings = [];
  const parts = snapshot.assembly.length ? snapshot.assembly : [{ model: snapshot.model }];
  try {
    const textures = await Promise.all(parts.map(async (part) => {
      const index = part.model === snapshot.model ? snapshot.activeLevelIndex : 0;
      try { return await loadTextureForModel(part.model, index); }
      catch { warnings.push(`Could not load texture ${modelTexture(part.model, index)?.name}; showing untextured geometry.`); return null; }
    }));
    for (const [index, part] of parts.entries()) {
      if (!part.model) continue;
      const level = part.model.levels[part.model === snapshot.model ? snapshot.activeLevelIndex : 0];
      if (!level) continue;
      const transform = assemblyPartTransform(part, snapshot.assembly);
      const partGroup = new THREE.Group();
      partGroup.position.copy(transform.position);
      partGroup.rotation.z = transform.rotationZ;
      partGroup.userData.part = { role: part.role, slot: part.slot, path: part.path };
      group.add(partGroup);
      const geometry = buildLevelGeometry(level, part.model, part.model === snapshot.model ? snapshot.activeLevelIndex : 0);
      const material = new THREE.MeshStandardMaterial({
        color: textures[index] ? 0xffffff : 0x90a8ad, map: textures[index],
        flatShading: true, metalness: 0.1, roughness: 0.72, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      partGroup.add(mesh);
      if (part.model !== snapshot.model) continue;
      objects.mesh = mesh;
      objects.scale = computeModelScale(level);
      objects.partGroup = partGroup;
      const wireframe = new THREE.LineSegments(new THREE.WireframeGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0xff9656, opacity: 0.72, transparent: true }));
      objects.wireframe = wireframe; partGroup.add(wireframe);
      const pointCloud = new THREE.Points(buildPointGeometry(level), new THREE.PointsMaterial({
        color: 0xffd2b2, size: Math.max(objects.scale * 0.03, 0.8), sizeAttenuation: true,
      }));
      objects.pointCloud = pointCloud; partGroup.add(pointCloud);
      if (level.connectors.length) {
        const connectors = new THREE.Points(buildConnectorGeometry(level), new THREE.PointsMaterial({
          color: 0x7dcfc6, size: Math.max(objects.scale * 0.035, 0.85), sizeAttenuation: true,
        }));
        objects.connectors = connectors; partGroup.add(connectors);
      }
    }
    return { group, objects, warnings, textured: Boolean(objects.mesh?.material.map) };
  } catch (error) { clearGroup(group); throw error; }
}

async function rebuildScene({ fitCamera = false, next = {}, loadToken = null } = {}) {
  if (loadToken !== null && !modelLoads.isCurrent(loadToken)) return false;
  const token = sceneBuilds.begin();
  const snapshot = { ...captureModelState(), ...next };
  const prepared = await prepareScene(snapshot);
  if (!sceneBuilds.isCurrent(token) || (loadToken !== null && !modelLoads.isCurrent(loadToken))) {
    clearGroup(prepared.group); collectRetiredTextures(); return false;
  }
  if (!("selectedPointIndex" in next)) snapshot.selectedPointIndex = state.selectedPointIndex;
  // Neither state nor the displayed scene changes until preparation succeeds.
  Object.assign(state, snapshot);
  if ("design" in next && next.design) {
    state.designDraft = { body: next.design.body, propulsion: next.design.propulsion, weapons: [...next.design.weapons] };
  }
  clearGroup(modelGroup);
  for (const child of [...prepared.group.children]) modelGroup.add(child);
  Object.assign(sceneObjects, prepared.objects);
  raycaster.params.Points.threshold = Math.max(sceneObjects.scale * 0.05, 1.2);
  updateOverlayVisibility();
  renderChrome();
  if (fitCamera) fitCameraToCurrentLevel();
  const expected = modelTexture(state.model, state.activeLevelIndex)?.name;
  elements.textureChip.textContent = state.assembly.length ? `${state.assembly.length} PIE parts in module`
    : prepared.textured ? `Texture: ${expected}` : expected ? `Texture missing: ${expected}` : "Texture not defined";
  state.textureWarning = prepared.warnings.join(" ");
  collectRetiredTextures();
  frameScheduler.request();
  return true;
}

function renderSummary() {
  const level = getActiveLevel();

  if (!state.model || !level) {
    elements.modelSummary.innerHTML =
      '<article class="stat-card"><span>Status</span><strong>Awaiting PIE file</strong></article>';
    return;
  }

  const levelStats = summarizeLevel(level);
  const summaryItems = [
    ["File", state.model.sourceName],
    ["PIE", state.model.version],
    ["Type", state.model.type?.toString(16) ?? "N/A"],
    ["Levels", state.model.levels.length],
    ["Points", levelStats.points],
    ["Polygons", levelStats.polygons],
    ["Connectors", levelStats.connectors],
    ["Frames", levelStats.frames],
  ];

  elements.modelSummary.innerHTML = summaryItems
    .map(
      ([label, value]) =>
        `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`,
    )
    .join("");
}

function renderNotes() {
  if (!state.model) {
    elements.notesList.innerHTML = '<div class="empty-state">Model notes will appear here.</div>';
    return;
  }

  const level = getActiveLevel();
  const notes = [{ title: "UV Mode", detail: getUvMode(state.model) }];

  if (state.model.texture?.name) {
    notes.push({ title: "Texture Page", detail: state.model.texture.name });
  }

  if (state.model.events.length) {
    notes.push({
      title: "Events",
      detail: state.model.events.map((event) => `${event.index}: ${event.name}`).join(" | "),
    });
  }

  if (level?.animObject) {
    notes.push({
      title: "AnimObject",
      detail: `${level.animObject.headerTokens.join(" ")} | ${level.animObject.frames.length} frames`,
    });
  }

  elements.notesList.innerHTML = notes
    .map(
      (note) =>
        `<div class="note-item"><strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.detail)}</span></div>`,
    )
    .join("");
}

function renderLevelOptions() {
  if (!state.model) {
    elements.levelSelect.innerHTML = "";
    elements.levelSelect.disabled = true;
    return;
  }

  elements.levelSelect.innerHTML = state.model.levels
    .map(
      (level, index) =>
        `<option value="${index}" ${index === state.activeLevelIndex ? "selected" : ""}>Level ${level.index}</option>`,
    )
    .join("");

  elements.levelSelect.disabled = false;
}

function renderPointEditor() {
  const level = getActiveLevel();
  const point =
    level && state.selectedPointIndex !== null ? level.points[state.selectedPointIndex] : null;

  if (!point) {
    elements.pointEditor.hidden = true;
    elements.pointEmpty.hidden = false;
    return;
  }

  elements.pointEditor.hidden = false;
  elements.pointEmpty.hidden = true;
  elements.selectedPointIndex.textContent = String(state.selectedPointIndex);
  elements.pointX.value = String(point.x);
  elements.pointY.value = String(point.y);
  elements.pointZ.value = String(point.z);
  for (const input of [elements.pointX, elements.pointY, elements.pointZ]) input.removeAttribute("aria-invalid");
}

function renderPointList() {
  const level = getActiveLevel();

  if (!level) {
    elements.pointList.innerHTML = '<div class="empty-state">No point data loaded.</div>';
    return;
  }

  elements.pointList.innerHTML = level.points.length
    ? level.points
        .map(
          (point, index) =>
            `<button class="list-item ${state.selectedPointIndex === index ? "active" : ""}" type="button" data-point-index="${index}"><strong>Point ${index}</strong><span>${escapeHtml(`X ${formatCoordinate(point.x)} | Y ${formatCoordinate(point.y)} | Z ${formatCoordinate(point.z)}`)}</span></button>`,
        )
        .join("")
    : '<div class="empty-state">This level has no points.</div>';
}

function renderConnectorList() {
  const level = getActiveLevel();

  if (!level) {
    elements.connectorList.innerHTML = '<div class="empty-state">No connector data loaded.</div>';
    return;
  }

  elements.connectorList.innerHTML = level.connectors.length
    ? level.connectors
        .map(
          (connector, index) =>
            `<div class="note-item"><strong>Connector ${index}</strong><span>${escapeHtml(`X ${formatCoordinate(connector.x)} | Y ${formatCoordinate(connector.y)} | Z ${formatCoordinate(connector.z)}`)}</span></div>`,
        )
        .join("")
    : '<div class="empty-state">This level does not define any connectors.</div>';
}

function renderAssemblyPartOptions() {
  elements.assemblyPartField.hidden = !state.assembly.length;

  if (!state.assembly.length) {
    elements.assemblyPartSelect.innerHTML = "";
    return;
  }

  elements.assemblyPartSelect.innerHTML = state.assembly
    .map((part, index) => {
      const label = `${part.label} — ${part.model.sourceName}`;
      return `<option value="${index}" ${part.model === state.model ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderChrome() {
  const level = getActiveLevel();

  elements.exportButton.disabled = !state.model;
  elements.modelChip.textContent = state.assembly.length
    ? `${state.assemblyName} | Editing ${state.model?.sourceName ?? "-"}`
    : state.model
      ? `${state.model.sourceName} | Level ${level?.index ?? "-"}`
      : "No model loaded";
  elements.uvBadge.textContent = state.model ? getUvMode(state.model) : "No file";

  renderAssemblyPartOptions();
  renderLevelOptions();
  renderSummary();
  renderNotes();
  renderPointEditor();
  renderPointList();
  renderConnectorList();
  renderDesigner();
}

async function renderAll(options = {}) {
  return rebuildScene(options);
}

function selectPoint(index) {
  const level = getActiveLevel();
  if (!level?.points[index]) return;
  elements.pointList.querySelector(".active")?.classList.remove("active");
  state.selectedPointIndex = index;
  elements.pointList.querySelector(`[data-point-index="${index}"]`)?.classList.add("active");
  renderPointEditor();
  updateSelectedPointMarker();
  frameScheduler.request();
}

function updateSelectedPoint(axis, rawValue) {
  const level = getActiveLevel();
  const point = level?.points[state.selectedPointIndex];
  const value = parseCoordinateInput(rawValue);
  if (!point || value === null) return false;
  if (point[axis] === value) return true;
  point[axis] = value;
  // Only the edited part changes; other module parts, materials and textures stay.
  const geometry = buildLevelGeometry(level);
  sceneObjects.mesh.geometry.dispose();
  sceneObjects.mesh.geometry = geometry;
  sceneObjects.wireframe.geometry.dispose();
  sceneObjects.wireframe.geometry = new THREE.WireframeGeometry(geometry);
  const points = sceneObjects.pointCloud.geometry;
  points.attributes.position.setXYZ(state.selectedPointIndex, point.x, point.y, point.z);
  points.attributes.position.needsUpdate = true;
  points.computeBoundingBox(); points.computeBoundingSphere();
  const row = elements.pointList.querySelector(`[data-point-index="${state.selectedPointIndex}"] span`);
  if (row) row.textContent = `X ${formatCoordinate(point.x)} | Y ${formatCoordinate(point.y)} | Z ${formatCoordinate(point.z)}`;
  updateSelectedPointMarker();
  frameScheduler.request();
  setStatus(`Updated point ${state.selectedPointIndex} ${axis.toUpperCase()} to ${formatCoordinate(value)}.`);
  return true;
}

function commitCoordinateInput(axis, input) {
  if (input.validity.badInput || !updateSelectedPoint(axis, input.value)) {
    input.setAttribute("aria-invalid", "true");
    setStatus(`Enter a finite ${axis.toUpperCase()} coordinate. The saved point has not changed.`);
    return;
  }
  input.removeAttribute("aria-invalid");
}

function mapmakerUrl(base, path) {
  const encodedPath = String(path)
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/${encodedPath}`;
}

function resolveMapmakerPiePath(value, prefix = "") {
  if (!value) {
    return null;
  }

  let candidate = String(value).replaceAll("\\", "/").replace(/^\/?pies\//i, "");

  if (!candidate.toLowerCase().endsWith(".pie")) {
    candidate += ".pie";
  }

  const prefixed = candidate.includes("/") ? candidate : `${prefix}${candidate}`;
  const exact = state.mapmaker.pathIndex.get(prefixed.toLowerCase());

  if (exact) {
    return exact;
  }

  const rootMatch = state.mapmaker.pathIndex.get(candidate.toLowerCase());

  if (rootMatch) {
    return rootMatch;
  }

  const fileName = candidate.split("/").pop().toLowerCase();
  return state.mapmaker.piePaths.find((path) => path.toLowerCase().endsWith(`/${fileName}`)) ?? null;
}

function getModulePartSpecs(template) {
  return modulePartSpecs(template, state.mapmaker, resolveMapmakerPiePath);
}

async function fetchMapmakerJson(path) {
  const response = await fetch(mapmakerUrl(MAPMAKER_PIE_ROOT, path));

  if (!response.ok) {
    throw new Error(`Mapmaker returned ${response.status} for ${path}.`);
  }

  return response.json();
}

async function loadMapmakerModel(path) {
  const response = await fetch(mapmakerUrl(MAPMAKER_PIE_ROOT, path));

  if (!response.ok) {
    throw new Error(`Mapmaker returned ${response.status} for ${path}.`);
  }

  const sourceName = path.split("/").pop();
  const model = parsePie(await response.text(), sourceName);

  for (const texture of [model.texture, ...model.levels.map((level) => level.texture)]) {
    if (!texture?.name) continue;
    const textureKey = normalizeTextureKey(texture.name);
    if (!state.textureUrls.has(textureKey)) {
      state.textureUrls.set(textureKey, mapmakerUrl(`${MAPMAKER_ROOT}/classic/texpages/texpages`, DROID_TEXTURE_ALIASES[textureKey] ?? texture.name));
    }
  }

  return model;
}

async function loadMapmakerPie(path) {
  const token = startModelLoad();
  setStatus(`Loading ${path} from Mapmaker...`);
  const model = await loadMapmakerModel(path);
  const committed = await renderAll({ fitCamera: true, loadToken: token, next: {
    model, assembly: [], assemblyName: "", design: null, activeLevelIndex: 0, selectedPointIndex: null,
  } });
  if (committed) reportLoaded(`Loaded Mapmaker PIE ${path}.`);
}

async function loadDroidDesign(template, { custom = false } = {}) {
  const token = startModelLoad();
  if (custom) validateDesign(template, state.mapmaker);
  const specs = getModulePartSpecs(template);
  if (!specs.length) throw new Error(`No PIE parts were found for ${template.name}.`);
  setStatus(`Assembling ${template.name} from ${specs.length} PIE files...`);
  const parts = await Promise.all(specs.map(async (spec) => {
    const previous = custom && state.assembly.find((part) => part.path === spec.path && part.role === spec.role && part.slot === spec.slot);
    return { ...spec, model: previous ? previous.model : await loadMapmakerModel(spec.path) };
  }));
  const active = custom && parts.find((part) => part.model === state.model);
  const model = active?.model ?? parts.find((part) => part.role === "body")?.model ?? parts[0].model;
  const committed = await renderAll({ fitCamera: true, loadToken: token, next: {
    assembly: parts, assemblyName: template.name, design: template, model,
    activeLevelIndex: active ? state.activeLevelIndex : 0,
    selectedPointIndex: active ? state.selectedPointIndex : null,
  } });
  if (committed) reportLoaded(`Loaded ${state.assemblyName}. Choose a module part to inspect or edit it.`);
  return committed;
}

async function loadMapmakerModule(templateId) {
  const template = state.mapmaker.templates[templateId];
  if (!template) throw new Error(`Unknown droid module ${templateId}.`);
  state.designNotice = "";
  return loadDroidDesign(template);
}

function setDesignOptions(control, items, value, { optional = false, special = false, specialLabel = value } = {}) {
  control.replaceChildren();
  if (optional) {
    const none = document.createElement("option"); none.value = ""; none.textContent = "None"; control.append(none);
  }
  if (special) {
    const option = document.createElement("option"); option.value = value;
    option.textContent = `${specialLabel} (preset only)`;
    option.disabled = true; control.append(option);
  }
  for (const item of items) {
    const option = document.createElement("option"); option.value = item.id;
    option.textContent = item.id === "CyborgLegs" ? "Cyborg legs" : item.name ?? item.id;
    control.append(option);
  }
  control.value = value ?? "";
}

function renderDesigner() {
  if (!Object.keys(state.mapmaker.bodies).length) return;
  const draft = state.designDraft;
  const body = state.mapmaker.bodies[draft.body];
  const bodies = selectableBodies(state.mapmaker);
  const specialBody = !bodies.some((item) => item.id === draft.body);
  setDesignOptions(elements.designBody, bodies, draft.body, { special: specialBody, specialLabel: body?.name ?? draft.body });
  elements.designBody.disabled = false;
  const props = compatiblePropulsions(draft.body, state.mapmaker);
  const weapons = compatibleWeapons(draft.body, draft.propulsion, state.mapmaker);
  const specialPropulsion = !props.some((item) => item.id === draft.propulsion);
  const specialGuns = draft.weapons.some((id) => !weapons.some((item) => item.id === id));
  const special = specialBody || specialPropulsion || specialGuns;
  elements.buildDroidButton.disabled = special || !weapons.length;
  setDesignOptions(elements.designPropulsion, props, draft.propulsion, { special: specialPropulsion, specialLabel: state.mapmaker.propulsions[draft.propulsion]?.name });
  elements.designPropulsion.disabled = specialBody || !props.length;
  for (const [slot, control] of elements.designGuns.entries()) {
    const id = draft.weapons[slot];
    setDesignOptions(control, weapons, id, { optional: slot > 0, special: Boolean(id) && !weapons.some((item) => item.id === id), specialLabel: state.mapmaker.weapons[id]?.name });
    control.disabled = specialBody || specialPropulsion || !weapons.length;
    if (slot > 0) elements.designGunFields[slot].hidden = specialBody || slot >= weaponSlotCount(body) || (slot === 2 && !draft.weapons[1]);
  }
  if (special) {
    elements.designHelp.textContent = specialBody ? "Special preset. Choose a standard body to customize; the preset remains available below."
      : specialPropulsion ? "Special preset propulsion. Choose compatible propulsion to customize this droid."
      : "Special preset gun. Choose a compatible gun to customize this droid; the original preset remains available below.";
    return;
  }
  const propulsion = state.mapmaker.propulsions[draft.propulsion];
  const family = isCyborgBody(body) ? body.usageClass === "SuperCyborg" ? "Super cyborg guns only." : "Cyborg guns only."
    : isFlyingPropulsion(propulsion) ? "VTOL propulsion uses aircraft guns." : "Ground and naval propulsion use ground guns.";
  const bombs = draft.weapons.some((id) => !state.mapmaker.weapons[id]?.model) ? "Bomb bays can have a mount without a separate gun mesh." : "";
  elements.designHelp.textContent = [!state.design ? "Build this droid or change a component to preview it." : "", state.designNotice, family, body.weaponSlots > 1 ? `${body.weaponSlots} gun slots available.` : "", bombs].filter(Boolean).join(" ");
}

async function buildDraftDesign() {
  validateDesign(state.designDraft, state.mapmaker);
  return loadDroidDesign({ ...state.designDraft, weapons: [...state.designDraft.weapons], name: designName(state.designDraft, state.mapmaker) }, { custom: true });
}

async function changeDesignComponent(component, slot = 0) {
  const previous = state.designDraft;
  const draft = { body: previous.body, propulsion: previous.propulsion, weapons: [...previous.weapons] };
  if (component === "body") draft.body = elements.designBody.value;
  else if (component === "propulsion") draft.propulsion = elements.designPropulsion.value;
  else {
    const value = elements.designGuns[slot].value;
    if (slot > 0 && !value) draft.weapons = draft.weapons.slice(0, slot);
    else draft.weapons[slot] = value;
  }
  const next = reconcileDesign(draft, state.mapmaker);
  const notices = [];
  if (next.propulsion !== draft.propulsion) notices.push("Propulsion changed to match the body.");
  if (next.weapons[0] !== draft.weapons[0]) notices.push("Gun changed to a compatible option.");
  if (draft.weapons.length > next.weapons.length) notices.push("Incompatible extra guns were removed.");
  state.designNotice = notices.join(" ");
  state.designDraft = next;
  elements.assetResults.selectedIndex = -1;
  renderDesigner();
  await buildDraftDesign();
}

function getFilteredAssets() {
  const query = elements.assetSearch.value.trim().toLowerCase();

  if (elements.assetKind.value === "module") {
    return Object.values(state.mapmaker.templates)
      .filter((template) => template.body && template.propulsion && template.weapons?.length)
      .filter((template) =>
        [template.id, template.name, template.body, template.propulsion, ...(template.weapons ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  }

  return state.mapmaker.piePaths.filter((path) => path.toLowerCase().includes(query));
}

function renderAssetResults() {
  const isModule = elements.assetKind.value === "module";
  elements.designer.hidden = !isModule;
  mapmakerBrowser.setAttribute("data-mode", isModule ? "module" : "pie");
  elements.assetLibraryLabel.textContent = isModule ? "Presets" : "Individual PIE files";
  elements.assetResults.setAttribute("aria-label", isModule ? "Presets" : "Individual PIE files");
  elements.assetSearch.placeholder = isModule ? "Search presets..." : "Search PIE files...";
  const matches = getFilteredAssets();
  const visibleMatches = matches.slice(0, 200);
  elements.assetResults.innerHTML = "";

  for (const item of visibleMatches) {
    const option = document.createElement("option");
    option.value = isModule ? item.id : item;
    option.textContent = isModule ? item.name ?? item.id : item;
    option.title = isModule
      ? `${item.body} / ${item.propulsion} / ${item.weapons.join(", ")}`
      : item;
    elements.assetResults.append(option);
  }

}

async function initializeMapmakerBrowser() {
  const [packageData, bodies, propulsions, weapons, templates] = await Promise.all([
    fetch(MAPMAKER_CATALOG_URL).then(
      (response) => {
        if (!response.ok) {
          throw new Error(`Mapmaker returned ${response.status} for the model catalog.`);
        }
        return response.json();
      },
    ),
    fetchMapmakerJson("components/bodies/body.json"),
    fetchMapmakerJson("components/prop/propulsion.json"),
    fetchMapmakerJson("components/weapons/weapons.json"),
    fetchMapmakerJson("components/templates.json"),
  ]);

  state.mapmaker.piePaths = packageData.files
    .map((file) => file.name)
    .filter((name) => /^\/pies\/.*\.pie$/i.test(name))
    .map((name) => name.slice("/pies/".length))
    .sort((a, b) => a.localeCompare(b));
  state.mapmaker.pathIndex = new Map(
    state.mapmaker.piePaths.map((path) => [path.toLowerCase(), path]),
  );
  state.mapmaker.bodies = bodies;
  state.mapmaker.propulsions = propulsions;
  state.mapmaker.weapons = weapons;
  state.mapmaker.templates = templates;
  state.designDraft = reconcileDesign(state.designDraft, state.mapmaker);
  elements.assetStatus.textContent = "";
  elements.assetSearch.disabled = false;
  elements.assetResults.disabled = false;
  renderAssetResults();
  renderDesigner();
}

async function loadPieFromText(text, sourceName, token = startModelLoad()) {
  const model = parsePie(text, sourceName);
  const committed = await renderAll({ fitCamera: true, loadToken: token, next: {
    model, assembly: [], assemblyName: "", design: null, activeLevelIndex: 0, selectedPointIndex: null,
  } });
  if (committed) reportLoaded(`Loaded ${sourceName}.`);
}

async function loadSample() {
  const token = startModelLoad();
  const response = await fetch(SAMPLE_PIE_URL);
  if (!response.ok) throw new Error(`Sample returned HTTP ${response.status}.`);
  await loadPieFromText(await response.text(), "trlcan.pie", token);
}

function registerTexture(file) {
  const key = normalizeTextureKey(file.name);
  const previousUrl = state.textureUrls.get(key);
  if (previousUrl?.startsWith("blob:")) state.retiredTextureUrls.add(previousUrl);
  // The currently displayed scene can still use the previous texture.
  state.textureUrls.set(key, URL.createObjectURL(file));
}

async function handleFiles(fileList) {
  const token = startModelLoad();
  const files = Array.from(fileList);
  const pieFiles = files.filter((file) => file.name.toLowerCase().endsWith(".pie"));
  const textures = files.filter((file) => /\.(png|jpe?g|webp|bmp)$/i.test(file.name));
  if (pieFiles.length > 1) throw new Error("Choose one PIE file and its textures at a time.");
  if (!pieFiles.length && !textures.length) throw new Error("Choose a PIE file or a supported texture image.");
  let model;
  if (pieFiles.length) model = parsePie(await pieFiles[0].text(), pieFiles[0].name);
  if (!modelLoads.isCurrent(token)) return;
  textures.forEach(registerTexture);
  const committed = await renderAll({ fitCamera: Boolean(model), loadToken: token, next: model ? {
    model, assembly: [], assemblyName: "", design: null, activeLevelIndex: 0, selectedPointIndex: null,
  } : {} });
  if (committed) reportLoaded(model ? `Loaded ${model.sourceName}.` : `Registered ${textures.length} texture file(s).`);
}

function exportCurrentPie() {
  if (!state.model) {
    return;
  }

  const blob = new Blob([serializePie(state.model)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const baseName = state.model.sourceName.replace(/\.pie$/i, "");

  link.href = url;
  link.download = `${baseName}-edited.pie`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(`Exported ${baseName}-edited.pie.`);
}

function pickPointFromPointer(event) {
  if (!sceneObjects.pointCloud || !state.view.points) {
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(sceneObjects.pointCloud);

  if (hits.length) {
    selectPoint(hits[0].index);
  }
}

function bindEvents() {
  elements.buildDroidButton.addEventListener("click", () => runAction(buildDraftDesign, "Could not assemble droid"));
  elements.designBody.addEventListener("change", () => runAction(() => changeDesignComponent("body"), "Could not assemble droid"));
  elements.designPropulsion.addEventListener("change", () => runAction(() => changeDesignComponent("propulsion"), "Could not assemble droid"));
  for (const [slot, control] of elements.designGuns.entries()) {
    control.addEventListener("change", () => runAction(() => changeDesignComponent("weapon", slot), "Could not assemble droid"));
  }
  elements.fileInput.addEventListener("change", async (event) => {
    try {
      if (event.target.files?.length) await runAction(() => handleFiles(event.target.files), "Could not open files");
    } finally { event.target.value = ""; }
  });

  elements.sampleButton.addEventListener("click", () => runAction(loadSample, "Could not load sample"));

  elements.exportButton.addEventListener("click", () => runAction(exportCurrentPie, "Could not export PIE"));
  elements.fitButton.addEventListener("click", fitCameraToCurrentLevel);

  elements.levelSelect.addEventListener("change", async (event) => {
    await runAction(async () => {
      const committed = await renderAll({ fitCamera: true, next: { activeLevelIndex: Number(event.target.value), selectedPointIndex: null } });
      if (committed) reportLoaded(`Viewing level ${getActiveLevel()?.index ?? "-"}.`);
    }, "Could not change level");
  });

  elements.toggleWireframe.addEventListener("change", (event) => {
    state.view.wireframe = event.target.checked;
    updateOverlayVisibility();
  });

  elements.togglePoints.addEventListener("change", (event) => {
    state.view.points = event.target.checked;
    updateOverlayVisibility();
  });

  elements.toggleConnectors.addEventListener("change", (event) => {
    state.view.connectors = event.target.checked;
    updateOverlayVisibility();
  });

  elements.toggleGrid.addEventListener("change", (event) => {
    state.view.grid = event.target.checked;
    updateOverlayVisibility();
  });

  elements.toggleAxes.addEventListener("change", (event) => {
    state.view.axes = event.target.checked;
    updateOverlayVisibility();
  });

  elements.toggleInvertV.addEventListener("change", async (event) => {
    state.view.invertV = event.target.checked;
    await runAction(async () => {
      if (await rebuildScene()) reportLoaded("Updated texture V orientation.");
    }, "Could not update texture orientation");
  });

  for (const [axis, input] of [["x", elements.pointX], ["y", elements.pointY], ["z", elements.pointZ]]) {
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
    input.addEventListener("change", () => commitCoordinateInput(axis, input));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); commitCoordinateInput(axis, input); }
      if (event.key === "Escape") { event.preventDefault(); renderPointEditor(); }
    });
  }

  elements.pointList.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-point-index]");

    if (trigger) {
      selectPoint(Number(trigger.dataset.pointIndex));
    }
  });

  for (const button of elements.assetKindButtons) {
    button.addEventListener("click", () => {
      elements.assetKind.value = button.dataset.assetKind;
      editPanel.hidden = true;
      mapmakerBrowser.hidden = false;
      summaryPanel.hidden = true;
      viewportControls.hidden = true;
      elements.editMenuButton.classList.remove("active");
      elements.editMenuButton.setAttribute("aria-pressed", "false");
      elements.summaryMenuButton.classList.remove("active");
      elements.summaryMenuButton.setAttribute("aria-pressed", "false");
      elements.viewportMenuButton.classList.remove("active");
      elements.viewportMenuButton.setAttribute("aria-pressed", "false");

      for (const kindButton of elements.assetKindButtons) {
        const isActive = kindButton === button;
        kindButton.classList.toggle("active", isActive);
        kindButton.setAttribute("aria-pressed", String(isActive));
      }

      renderAssetResults();
    });
  }
  elements.viewportMenuButton.addEventListener("click", () => {
    editPanel.hidden = true;
    mapmakerBrowser.hidden = true;
    summaryPanel.hidden = true;
    viewportControls.hidden = false;
    elements.summaryMenuButton.classList.remove("active");
    elements.summaryMenuButton.setAttribute("aria-pressed", "false");
    elements.editMenuButton.classList.remove("active");
    elements.editMenuButton.setAttribute("aria-pressed", "false");
    elements.viewportMenuButton.classList.add("active");
    elements.viewportMenuButton.setAttribute("aria-pressed", "true");

    for (const kindButton of elements.assetKindButtons) {
      kindButton.classList.remove("active");
      kindButton.setAttribute("aria-pressed", "false");
    }
  });
  elements.summaryMenuButton.addEventListener("click", () => {
    editPanel.hidden = true;
    mapmakerBrowser.hidden = true;
    summaryPanel.hidden = false;
    viewportControls.hidden = true;
    elements.summaryMenuButton.classList.add("active");
    elements.summaryMenuButton.setAttribute("aria-pressed", "true");
    elements.editMenuButton.classList.remove("active");
    elements.editMenuButton.setAttribute("aria-pressed", "false");
    elements.viewportMenuButton.classList.remove("active");
    elements.viewportMenuButton.setAttribute("aria-pressed", "false");

    for (const kindButton of elements.assetKindButtons) {
      kindButton.classList.remove("active");
      kindButton.setAttribute("aria-pressed", "false");
    }
  });
  elements.editMenuButton.addEventListener("click", () => {
    editPanel.hidden = false;
    mapmakerBrowser.hidden = true;
    summaryPanel.hidden = true;
    viewportControls.hidden = true;
    elements.editMenuButton.classList.add("active");
    elements.editMenuButton.setAttribute("aria-pressed", "true");
    elements.summaryMenuButton.classList.remove("active");
    elements.summaryMenuButton.setAttribute("aria-pressed", "false");
    elements.viewportMenuButton.classList.remove("active");
    elements.viewportMenuButton.setAttribute("aria-pressed", "false");

    for (const kindButton of elements.assetKindButtons) {
      kindButton.classList.remove("active");
      kindButton.setAttribute("aria-pressed", "false");
    }
  });
  elements.assetSearch.addEventListener("input", renderAssetResults);
  elements.assetResults.addEventListener("change", async () => {
    const selection = elements.assetResults.value;

    if (!selection) {
      return;
    }

    elements.assetResults.disabled = true;

    try {
      await runAction(() => elements.assetKind.value === "module" ? loadMapmakerModule(selection) : loadMapmakerPie(selection), "Could not load the Mapmaker selection");
    } finally {
      elements.assetResults.disabled = false;
    }
  });

  elements.assemblyPartSelect.addEventListener("change", async (event) => {
    const part = state.assembly[Number(event.target.value)];

    if (!part) {
      return;
    }

    await runAction(async () => {
      if (await renderAll({ next: { model: part.model, activeLevelIndex: 0, selectedPointIndex: null } })) {
        reportLoaded(`Editing ${part.label} (${part.model.sourceName}) inside ${state.assemblyName}.`);
      }
    }, "Could not change module part");
  });

  let pointerDown = null;

  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });

  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!pointerDown) {
      return;
    }

    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    pointerDown = null;

    if (distance < 4) {
      pickPointFromPointer(event);
    }
  });

  window.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  window.addEventListener("drop", async (event) => {
    event.preventDefault();

    if (event.dataTransfer?.files?.length) {
      await runAction(() => handleFiles(event.dataTransfer.files), "Could not open dropped files");
    }
  });
}



bindEvents();
frameScheduler.request();
renderChrome();

initializeMapmakerBrowser().catch(reportCatalogFailure);

runAction(loadSample, "Could not load sample");
