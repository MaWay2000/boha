import * as THREE from "./three.module.js";
import { buildDroidGroup, updateDroidAnimations } from "./droidGroup.js";

const PIES_BASE = new URL("../pies/", import.meta.url).href;
const TEX_BASE = new URL("../classic/texpages/texpages/", import.meta.url).href;
let definitionsPromise = null;
let activePreview = null;

function addPreviewStyles() {
  if (document.getElementById("favoriteUnitPreviewStyles")) return;
  const style = document.createElement("style");
  style.id = "favoriteUnitPreviewStyles";
  style.textContent = `
    .stats-favorite-unit-preview {
      display: grid;
      grid-template-columns: minmax(190px, .75fr) minmax(0, 1.25fr);
      min-height: 154px;
      margin: 10px 0;
      overflow: hidden;
      border: 1px solid rgba(109, 232, 255, .2);
      border-radius: 12px;
      background: linear-gradient(115deg, rgba(9, 31, 43, .82), rgba(3, 11, 18, .58));
      box-shadow: inset 0 0 30px rgba(52, 205, 234, .035);
    }
    .stats-favorite-unit-stage {
      position: relative;
      min-height: 154px;
      background:
        radial-gradient(circle at 50% 60%, rgba(71, 222, 245, .12), transparent 48%),
        linear-gradient(90deg, transparent 49.5%, rgba(109, 232, 255, .04) 50%, transparent 50.5%);
    }
    .stats-favorite-unit-stage canvas { display: block; width: 100%; height: 100%; }
    .stats-favorite-unit-message:not([hidden]) {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      margin: 0;
      padding: 16px;
      color: var(--muted);
      text-align: center;
      font-size: .78rem;
    }
    .stats-favorite-unit-info {
      display: flex;
      min-width: 0;
      padding: 16px;
      flex-direction: column;
      justify-content: center;
      border-left: 1px solid rgba(109, 232, 255, .1);
    }
    .stats-favorite-unit-info strong {
      margin-top: 6px;
      color: var(--text);
      font: 700 1rem "Oxanium", sans-serif;
    }
    .stats-favorite-unit-count { margin-top: 3px; color: var(--steel); font-size: .74rem; }
    .stats-favorite-unit-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 13px; }
    .stats-favorite-unit-tab {
      min-width: 0;
      padding: 6px 9px;
      overflow: hidden;
      border: 1px solid rgba(109, 232, 255, .16);
      border-radius: 999px;
      color: var(--muted);
      background: rgba(3, 11, 18, .58);
      cursor: pointer;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: 600 .7rem "Oxanium", sans-serif;
    }
    .stats-favorite-unit-tab:hover,
    .stats-favorite-unit-tab:focus-visible,
    .stats-favorite-unit-tab.is-active {
      color: #fff;
      border-color: rgba(109, 232, 255, .58);
      background: rgba(49, 183, 210, .15);
      outline: none;
      box-shadow: 0 0 13px rgba(73, 221, 247, .1);
    }
    @media (max-width: 560px) {
      .stats-favorite-unit-preview { grid-template-columns: 1fr; }
      .stats-favorite-unit-info { border-top: 1px solid rgba(109, 232, 255, .1); border-left: 0; }
    }
  `;
  document.head.appendChild(style);
}

async function fetchJson(path) {
  const response = await fetch(new URL(path, PIES_BASE));
  if (!response.ok) throw new Error(`Unable to load unit model data (${response.status}).`);
  return response.json();
}

function loadDefinitions() {
  if (!definitionsPromise) {
    definitionsPromise = Promise.all([
      fetchJson("components/bodies/body.json"),
      fetchJson("components/prop/propulsion.json"),
      fetchJson("components/weapons/weapons.json"),
      fetchJson("components/templates.json")
    ]).then(([bodies, propulsions, weapons, templates]) => ({ bodies, propulsions, weapons, templates }));
  }
  return definitionsPromise;
}

function normalized(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findNamedDefinition(definitions, designName) {
  const target = normalized(designName);
  return Object.values(definitions)
    .filter((definition) => {
      const name = normalized(definition.name || definition.id);
      return name.length >= 3 && target.includes(name);
    })
    .sort((left, right) => normalized(right.name || right.id).length - normalized(left.name || left.id).length)[0] || null;
}

function findDesign(unit, definitions) {
  const target = normalized(unit.name);
  const template = Object.values(definitions.templates).find((item) => normalized(item.name || item.id) === target);
  if (template) return template;
  const body = findNamedDefinition(definitions.bodies, unit.name);
  const propulsion = findNamedDefinition(definitions.propulsions, unit.name);
  const weapon = findNamedDefinition(definitions.weapons, unit.name);
  if (!body || !propulsion || !weapon) return null;
  return {
    name: unit.name,
    body: body.id,
    propulsion: propulsion.id,
    weapons: [weapon.id],
    type: "DROID"
  };
}

function piePath(value, prefix = "") {
  let name = String(value || "");
  if (!name.toLowerCase().endsWith(".pie")) name += ".pie";
  return name.includes("/") ? name : `${prefix}${name}`;
}

function getRightPropulsionModel(leftModel) {
  const left = String(leftModel || "");
  if (/^prmvtl/i.test(left)) return "";
  const right = left.replace(/^pr([lmh])(whl|trk|htr|vtl)/i, "pr$1r$2");
  return right === left ? "" : right;
}

function getDroidParts(design, definitions) {
  const body = definitions.bodies[design.body];
  const propulsion = definitions.propulsions[design.propulsion];
  const parts = [{ role: "meta", propulsionType: propulsion?.type, droidType: design.type || body?.droidType || "DROID" }];
  if (design.body) parts.push({ role: "body", path: piePath(body?.model || design.body, "components/bodies/") });

  let bodySpecificPropulsion = false;
  const propulsionModels = body?.propulsionExtraModels?.[design.propulsion];
  const leftModel = typeof propulsionModels === "string" ? propulsionModels : propulsionModels?.left;
  if (leftModel) {
    parts.push({ role: "propulsion", path: piePath(leftModel, "components/prop/"), side: "left" });
    const rightModel = getRightPropulsionModel(leftModel);
    if (rightModel) parts.push({ role: "propulsion", path: piePath(rightModel, "components/prop/"), side: "right" });
    bodySpecificPropulsion = true;
  }
  if (design.propulsion && !bodySpecificPropulsion) {
    parts.push({ role: "propulsion", path: piePath(propulsion?.model || design.propulsion, "components/prop/") });
  }

  (design.weapons || []).forEach((weaponId, slot) => {
    const weapon = definitions.weapons[weaponId];
    if (!weapon) return;
    const meta = { slot, kind: "weapon", recoilValue: weapon.recoilValue || 0, rotateSpeed: weapon.rotate || 0, firePause: weapon.firePause || 20 };
    if (weapon.mountModel) parts.push({ role: "mount", path: piePath(weapon.mountModel, "components/weapons/"), ...meta });
    if (weapon.model && weapon.model !== weapon.mountModel) parts.push({ role: "weapon", path: piePath(weapon.model, "components/weapons/"), ...meta });
    if (weapon.muzzleGfx) parts.push({ role: "muzzle", path: piePath(weapon.muzzleGfx), ...meta });
  });
  return parts;
}

function disposeGroup(group) {
  group?.traverse((item) => {
    item.geometry?.dispose?.();
    const materials = Array.isArray(item.material) ? item.material : [item.material];
    materials.filter(Boolean).forEach((material) => material.dispose?.());
  });
}

export function destroyFavoriteUnitPreview() {
  if (!activePreview) return;
  cancelAnimationFrame(activePreview.frameId);
  activePreview.resizeObserver?.disconnect();
  disposeGroup(activePreview.model);
  activePreview.renderer?.dispose();
  activePreview = null;
}

export async function initFavoriteUnitPreview(container, units) {
  if (!container) return;
  addPreviewStyles();
  const favorites = Array.isArray(units) ? units.slice(0, 3) : [];
  container.className = "stats-favorite-unit-preview";

  const stage = document.createElement("div");
  stage.className = "stats-favorite-unit-stage";
  const message = document.createElement("p");
  message.className = "stats-favorite-unit-message";
  message.textContent = favorites.length ? "Loading favorite unit..." : "No unit history";
  stage.appendChild(message);

  const info = document.createElement("div");
  info.className = "stats-favorite-unit-info";
  const label = document.createElement("span");
  label.className = "stats-detail-label";
  label.textContent = "Favorite Unit Preview";
  const name = document.createElement("strong");
  name.textContent = favorites[0]?.name || "No favorite unit available";
  const count = document.createElement("span");
  count.className = "stats-favorite-unit-count";
  count.textContent = favorites[0] ? `${Number(favorites[0].count || 0).toLocaleString()} produced` : "Run the updated analyzer to collect unit history.";
  const tabs = document.createElement("div");
  tabs.className = "stats-favorite-unit-tabs";
  info.append(label, name, count, tabs);
  container.append(stage, info);
  if (!favorites.length) return;

  window.PIES_BASE = PIES_BASE;
  window.TEX_BASE = TEX_BASE;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  stage.insertBefore(renderer.domElement, message);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbdefff, 0x10202a, 1.45));
  const light = new THREE.DirectionalLight(0xffffff, 1.4);
  light.position.set(4, 6, 5);
  scene.add(light);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(3, 2, 3);
  camera.lookAt(0, 0, 0);
  const preview = { renderer, scene, camera, model: null, frameId: 0, loadToken: 0, resizeObserver: null };
  activePreview = preview;

  const resize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  preview.resizeObserver = new ResizeObserver(resize);
  preview.resizeObserver.observe(stage);
  resize();

  const definitions = await loadDefinitions();
  if (activePreview !== preview) return;

  const selectUnit = async (index) => {
    const unit = favorites[index];
    const token = ++preview.loadToken;
    name.textContent = unit.name || "Unknown unit";
    count.textContent = `${Number(unit.count || 0).toLocaleString()} produced`;
    tabs.querySelectorAll("button").forEach((button, buttonIndex) => button.classList.toggle("is-active", buttonIndex === index));
    message.hidden = false;
    message.textContent = "Loading favorite unit...";
    disposeGroup(preview.model);
    if (preview.model) scene.remove(preview.model);
    preview.model = null;
    const design = findDesign(unit, definitions);
    if (!design) {
      message.textContent = "3D model unavailable for this design";
      return;
    }
    try {
      const model = await buildDroidGroup(getDroidParts(design, definitions));
      if (activePreview !== preview || token !== preview.loadToken) {
        disposeGroup(model);
        return;
      }
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      preview.model = model;
      scene.add(model);
      const maxDimension = Math.max(size.x, size.y, size.z, 1);
      const distance = maxDimension * 1.65;
      camera.position.set(distance, distance * .72, distance);
      camera.lookAt(0, 0, 0);
      message.hidden = true;
    } catch (error) {
      console.warn("Favorite unit preview failed:", error);
      message.hidden = false;
      message.textContent = "Unable to load this 3D model";
    }
  };

  favorites.forEach((unit, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stats-favorite-unit-tab";
    button.textContent = `${index + 1}. ${unit.name || "Unknown unit"}`;
    button.title = unit.name || "Unknown unit";
    button.addEventListener("click", () => selectUnit(index));
    tabs.appendChild(button);
  });

  const render = (time) => {
    if (activePreview !== preview) return;
    if (preview.model) {
      preview.model.rotation.y = time * 0.00042;
      updateDroidAnimations(preview.model, time);
    }
    renderer.render(scene, camera);
    preview.frameId = requestAnimationFrame(render);
  };
  preview.frameId = requestAnimationFrame(render);
  selectUnit(0);
}
