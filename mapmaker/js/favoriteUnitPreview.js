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
      display: block;
      margin: 10px 0;
      border: 1px solid rgba(109, 232, 255, .2);
      border-radius: 12px;
      background: linear-gradient(115deg, rgba(9, 31, 43, .82), rgba(3, 11, 18, .58));
      box-shadow: inset 0 0 30px rgba(52, 205, 234, .035);
    }
    .stats-favorite-unit-heading {
      display: block;
      padding: 14px 16px 0;
    }
    .stats-favorite-unit-category-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 16px 0;
    }
    .stats-favorite-unit-category-tab {
      padding: 5px 12px;
      border: 1px solid rgba(109, 232, 255, .2);
      border-radius: 999px;
      color: var(--steel);
      background: rgba(3, 11, 18, .72);
      cursor: pointer;
      font: 600 .7rem "Oxanium", sans-serif;
    }
    .stats-favorite-unit-category-tab:hover,
    .stats-favorite-unit-category-tab:focus-visible,
    .stats-favorite-unit-category-tab.is-active {
      color: #fff;
      border-color: rgba(109, 232, 255, .68);
      background: rgba(49, 183, 210, .2);
      outline: none;
      box-shadow: 0 0 13px rgba(73, 221, 247, .12);
    }
    .stats-favorite-unit-gallery {
      display: grid;
      grid-template-columns: repeat(5, minmax(145px, 1fr));
      gap: 10px;
      padding: 12px 16px 16px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-color: rgba(83, 216, 241, .65) rgba(4, 18, 27, .7);
      scrollbar-width: thin;
    }
    .stats-favorite-unit-gallery::-webkit-scrollbar { height: 7px; }
    .stats-favorite-unit-gallery::-webkit-scrollbar-track { background: rgba(4, 18, 27, .7); }
    .stats-favorite-unit-gallery::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: rgba(83, 216, 241, .65);
    }
    .stats-favorite-unit-card {
      position: relative;
      min-width: 145px;
      height: 168px;
      overflow: hidden;
      border: 1px solid rgba(109, 232, 255, .14);
      border-radius: 10px;
      background:
        radial-gradient(circle at 50% 57%, rgba(71, 222, 245, .12), transparent 49%),
        rgba(3, 11, 18, .45);
    }
    .stats-favorite-unit-card:hover,
    .stats-favorite-unit-card:focus-visible {
      border-color: rgba(109, 232, 255, .58);
      outline: none;
      box-shadow: 0 0 16px rgba(73, 221, 247, .13);
    }
    .stats-favorite-unit-stage {
      position: absolute;
      inset: 0;
    }
    .stats-favorite-unit-stage canvas { display: block; width: 100%; height: 100%; }
    .stats-favorite-unit-message:not([hidden]) {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      margin: 0;
      padding: 14px;
      color: var(--muted);
      text-align: center;
      font-size: .72rem;
    }
    .stats-favorite-unit-card-info {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 2;
      display: flex;
      padding: 10px;
      flex-direction: column;
      justify-content: flex-start;
      opacity: 1;
      color: var(--text);
      background: linear-gradient(rgba(2, 10, 16, .96), transparent 58%);
      transform: translateY(0);
      pointer-events: none;
    }
    .stats-favorite-unit-card-info strong {
      display: flex;
      flex-direction: column;
      line-height: 1.15;
    }
    .stats-favorite-unit-card-info strong span {
      display: block;
    }
    .stats-favorite-unit-card-info strong {
      font: 700 .74rem "Oxanium", sans-serif;
      line-height: 1.25;
    }
    .stats-favorite-unit-count {
      margin-top: auto;
      color: var(--steel);
      font-size: .68rem;
    }
    .stats-favorite-unit-empty {
      margin: 0;
      padding: 28px 16px 32px;
      color: var(--muted);
      text-align: center;
      font-size: .78rem;
    }
    @media (max-width: 560px) {
      .stats-favorite-unit-gallery { grid-template-columns: repeat(5, minmax(138px, 1fr)); }
      .stats-favorite-unit-card { min-width: 138px; height: 154px; }
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

function definitionName(collection, id) {
  if (!id) return "";
  const item = collection?.[id] || Object.values(collection || {}).find((entry) => entry.id === id);
  return item?.name || "";
}

function getComponentIds(unit, signature = unit?.signature) {
  const parts = String(signature || "").split(":");
  const numberOrFallback = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : Number.parseInt(fallback, 10);
  };
  return {
    bodyId: numberOrFallback(unit?.bodyId, parts[1]),
    propulsionId: numberOrFallback(unit?.propulsionId, parts[3]),
    weaponIds: Array.isArray(unit?.weaponIds) && unit.weaponIds.length
      ? unit.weaponIds.map((value) => Number.parseInt(value, 10)).filter(Number.isFinite)
      : [Number.parseInt(parts[8], 10)].filter(Number.isFinite)
  };
}

function addComponentCandidate(candidates, numericId, definitionId) {
  if (!Number.isFinite(numericId) || !definitionId) return;
  if (!candidates.has(numericId)) candidates.set(numericId, new Map());
  const counts = candidates.get(numericId);
  counts.set(definitionId, (counts.get(definitionId) || 0) + 1);
}

function strongestComponentCandidates(candidates) {
  return new Map([...candidates].map(([numericId, counts]) => [
    numericId,
    [...counts].sort((left, right) => right[1] - left[1])[0]?.[0]
  ]));
}

function buildComponentLookups(definitions, nameCandidatesBySignature) {
  const bodyCandidates = new Map();
  const propulsionCandidates = new Map();
  const weaponCandidates = new Map();
  for (const [signature, names] of nameCandidatesBySignature || []) {
    const componentIds = getComponentIds(null, signature);
    for (const name of new Set((names || []).filter(Boolean))) {
      const design = findDesign({ name }, definitions);
      if (!design) continue;
      addComponentCandidate(bodyCandidates, componentIds.bodyId, design.body);
      addComponentCandidate(propulsionCandidates, componentIds.propulsionId, design.propulsion);
      componentIds.weaponIds.forEach((weaponId, index) => {
        addComponentCandidate(weaponCandidates, weaponId, design.weapons?.[index] || design.weapons?.[0]);
      });
    }
  }
  const lookups = {
    bodies: strongestComponentCandidates(bodyCandidates),
    propulsions: strongestComponentCandidates(propulsionCandidates),
    weapons: strongestComponentCandidates(weaponCandidates)
  };
  Object.keys(definitions.bodies).sort().forEach((id, index) => lookups.bodies.set(index, id));
  Object.keys(definitions.propulsions).sort().forEach((id, index) => lookups.propulsions.set(index, id));
  Object.keys(definitions.weapons).sort().forEach((id, index) => lookups.weapons.set(index, id));
  return lookups;
}

function canonicalComponentName(unit, body, propulsion, weapons) {
  const droidType = Number.parseInt(String(unit?.signature || "").split(":", 1)[0], 10);
  const weaponName = weapons.map((weapon) => weapon?.name || weapon?.id).filter(Boolean).join(" / ");
  if ([5, 10, 11, 12].includes(droidType) && weaponName) return weaponName;
  const cleanWeaponName = weaponName.replace(/^VTOL\s+/i, "");
  return [cleanWeaponName, body?.name || body?.id, propulsion?.name || propulsion?.id]
    .filter(Boolean)
    .join(" ");
}

function findDesignByComponentIds(unit, definitions, componentLookups) {
  const componentIds = getComponentIds(unit);
  const bodyId = componentLookups.bodies.get(componentIds.bodyId);
  const propulsionId = componentLookups.propulsions.get(componentIds.propulsionId);
  const weaponIds = componentIds.weaponIds.map((id) => componentLookups.weapons.get(id)).filter(Boolean);
  if (!bodyId || !propulsionId || (componentIds.weaponIds.length && !weaponIds.length)) return null;

  const template = Object.values(definitions.templates).find((item) => {
    const templateWeapons = Array.isArray(item.weapons) ? item.weapons : [];
    return item.body === bodyId
      && item.propulsion === propulsionId
      && templateWeapons.length === weaponIds.length
      && templateWeapons.every((weaponId, index) => weaponId === weaponIds[index]);
  });
  if (template) return template;

  const body = definitions.bodies[bodyId];
  const propulsion = definitions.propulsions[propulsionId];
  const weapons = weaponIds.map((id) => definitions.weapons[id]).filter(Boolean);
  return {
    name: canonicalComponentName(unit, body, propulsion, weapons),
    body: bodyId,
    propulsion: propulsionId,
    weapons: weaponIds,
    type: "DROID"
  };
}

function findCanonicalDesign(unit, definitions, nameCandidatesBySignature, componentLookups) {
  const componentDesign = findDesignByComponentIds(unit, definitions, componentLookups);
  if (componentDesign) return componentDesign;
  const candidateNames = [
    ...(nameCandidatesBySignature?.get(unit.signature) || []),
    unit.name
  ];
  for (const candidateName of new Set(candidateNames.filter(Boolean))) {
    const design = findDesign({ ...unit, name: candidateName }, definitions);
    if (design) return design;
  }
  return null;
}

function getFavoriteUnitCategory(unit, design, definitions) {
  const droidType = Number.parseInt(String(unit?.signature || "").split(":", 1)[0], 10);
  if ([5, 10, 11, 12].includes(droidType)) return "cyborgs";
  const propulsion = definitions.propulsions[design?.propulsion];
  const propulsionDescription = [
    design?.propulsion,
    propulsion?.id,
    propulsion?.name,
    propulsion?.type,
    unit?.name
  ].filter(Boolean).join(" ");
  return /(?:vtol|lift)/i.test(propulsionDescription) ? "vtols" : "tanks";
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
  activePreview.items.forEach((item) => {
    item.resizeObserver?.disconnect();
    disposeGroup(item.model);
    item.renderer?.dispose();
  });
  activePreview = null;
}

export async function initFavoriteUnitPreview(container, units, nameCandidatesBySignature = null) {
  if (!container) return;
  destroyFavoriteUnitPreview();
  addPreviewStyles();
  const favorites = Array.isArray(units) ? units.filter((unit) => {
    const droidType = Number.parseInt(String(unit?.signature || "").split(":", 1)[0], 10);
    return droidType !== 3 && droidType !== 10;
  }) : [];
  container.className = "stats-favorite-unit-preview";

  const label = document.createElement("span");
  label.className = "stats-detail-label stats-favorite-unit-heading";
  label.textContent = "Favorite units";

  const categoryTabs = document.createElement("div");
  categoryTabs.className = "stats-favorite-unit-category-tabs";
  const gallery = document.createElement("div");
  gallery.className = "stats-favorite-unit-gallery";
  container.append(label, categoryTabs, gallery);
  if (!favorites.length) {
    const empty = document.createElement("p");
    empty.className = "stats-favorite-unit-empty";
    empty.textContent = "No unit history";
    gallery.replaceWith(empty);
    return;
  }

  window.PIES_BASE = PIES_BASE;
  window.TEX_BASE = TEX_BASE;
  const preview = { items: [], frameId: 0, loadToken: 0 };
  activePreview = preview;

  const definitions = await loadDefinitions();
  const componentLookups = buildComponentLookups(definitions, nameCandidatesBySignature);
  const designs = favorites.map((unit) => findCanonicalDesign(
    unit,
    definitions,
    nameCandidatesBySignature,
    componentLookups
  ));
  const displayNames = favorites.map((unit, index) => designs[index]?.name || unit.name || "Unknown unit");
  const displayNameLines = favorites.map((unit, index) => {
    const design = designs[index];
    const weaponId = Array.isArray(design?.weapons) ? design.weapons[0] : design?.weapon;
    const weapon = definitionName(definitions.weapons, weaponId) || displayNames[index];
    const body = definitionName(definitions.bodies, design?.body);
    const propulsion = definitionName(definitions.propulsions, design?.propulsion);
  return {
    weapon,
    body: body || "Unknown body",
    propulsion: propulsion || "Unknown propulsion"
  };
});
  const categories = [
    { key: "tanks", label: "Tanks", indexes: [] },
    { key: "cyborgs", label: "Cyborgs", indexes: [] },
    { key: "vtols", label: "VTOLs", indexes: [] }
  ];
  favorites.forEach((unit, index) => {
    const category = getFavoriteUnitCategory(unit, designs[index], definitions);
    categories.find((item) => item.key === category)?.indexes.push(index);
  });
  categories.forEach((category) => { category.indexes = category.indexes.slice(0, 5); });
  if (activePreview !== preview) return;

  const clearItems = () => {
    preview.items.forEach((item) => {
      item.resizeObserver?.disconnect();
      disposeGroup(item.model);
      item.renderer?.dispose();
    });
    preview.items = [];
  };

  const createUnitCard = async (unitIndex, token) => {
    const unit = favorites[unitIndex];
    const card = document.createElement("article");
    card.className = "stats-favorite-unit-card";
    card.tabIndex = 0;
    card.setAttribute("aria-label", `${displayNames[unitIndex]}, ${Number(unit.count || 0).toLocaleString()} produced`);

    const stage = document.createElement("div");
    stage.className = "stats-favorite-unit-stage";
    const message = document.createElement("p");
    message.className = "stats-favorite-unit-message";
    message.textContent = "Loading 3D model...";
    stage.appendChild(message);

    const info = document.createElement("div");
    info.className = "stats-favorite-unit-card-info";
    const name = document.createElement("strong");
    const weaponName = document.createElement("span");
    weaponName.textContent = displayNameLines[unitIndex].weapon;
    const bodyName = document.createElement("span");
    bodyName.textContent = displayNameLines[unitIndex].body;
    const propulsionName = document.createElement("span");
    propulsionName.textContent = displayNameLines[unitIndex].propulsion;
    name.append(weaponName, bodyName);
    if (!/cyborg|vtol/i.test(displayNameLines[unitIndex].propulsion)) {
      name.append(propulsionName);
    }
    const count = document.createElement("span");
    count.className = "stats-favorite-unit-count";
    count.textContent = `${Number(unit.count || 0).toLocaleString()} produced`;
    info.append(name, count);
    card.append(stage, info);
    gallery.appendChild(card);

    const design = designs[unitIndex];
    if (!design) {
      message.textContent = "3D model unavailable";
      return;
    }

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
    const item = { renderer, scene, camera, model: null, resizeObserver: null };
    preview.items.push(item);

    const resize = () => {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    item.resizeObserver = new ResizeObserver(resize);
    item.resizeObserver.observe(stage);
    resize();

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
      item.model = model;
      scene.add(model);
      const maxDimension = Math.max(size.x, size.y, size.z, 1);
      const distance = maxDimension * 1.65;
      camera.position.set(distance, distance * .72, distance);
      camera.lookAt(0, 0, 0);
      message.hidden = true;
    } catch (error) {
      console.warn("Favorite unit preview failed:", error);
      message.textContent = "Unable to load 3D model";
    }
  };

  const selectCategory = (category) => {
    categoryTabs.querySelectorAll("button").forEach((button) => button.classList.toggle("is-active", button.dataset.category === category.key));
    const token = ++preview.loadToken;
    clearItems();
    gallery.replaceChildren();
    if (category.indexes.length) {
      category.indexes.forEach((unitIndex) => { createUnitCard(unitIndex, token); });
      return;
    }
    const empty = document.createElement("p");
    empty.className = "stats-favorite-unit-empty";
    empty.textContent = `No ${category.label.toLowerCase()} history`;
    gallery.appendChild(empty);
  };

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stats-favorite-unit-category-tab";
    button.dataset.category = category.key;
    button.textContent = category.label;
    button.addEventListener("click", () => selectCategory(category));
    categoryTabs.appendChild(button);
  });

  const render = (time) => {
    if (activePreview !== preview) return;
    preview.items.forEach((item, index) => {
      if (item.model) {
        item.model.rotation.y = time * 0.00042 + index * 0.22;
        updateDroidAnimations(item.model, time);
      }
      item.renderer.render(item.scene, item.camera);
    });
    preview.frameId = requestAnimationFrame(render);
  };
  preview.frameId = requestAnimationFrame(render);
  selectCategory(categories[0]);
}
