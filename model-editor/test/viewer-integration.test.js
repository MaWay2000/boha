import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import * as Three from "three";
import * as pie from "../src/pie-format.js";
import * as runtime from "../src/viewer-runtime.js";
import * as droid from "../src/droid-design.js";

const sample = readFileSync(new URL("../samples/trlcan.pie", import.meta.url), "utf8");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Exercise the actual application functions and Three.js geometry. Only browser
// boundaries (DOM, WebGL renderer, controls, image decoding and fetch) are fakes.
function application({ loadTexture = async () => new Three.Texture(), fetch = async () => { throw new Error("Offline"); } } = {}) {
  const nodes = new Map();
  class Node {
    constructor() {
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.attributes = new Map(); this.listeners = new Map();
      this.clientWidth = 800; this.clientHeight = 600; this.value = "";
      this.textContent = ""; this.validity = { badInput: false };
      this.children = [];
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Node()); return nodes.get(selector); }
    querySelectorAll() { return []; }
    closest() { return new Node(); }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = [...items]; }
    remove() {}
    click() {}
  }
  const document = new Node();
  document.createElement = () => new Node(); document.hidden = false;
  document.querySelector("#asset-kind").value = "module";
  const geometries = [];
  class BufferGeometry extends Three.BufferGeometry {
    constructor() { super(); this.disposed = false; geometries.push(this); }
    dispose() { this.disposed = true; super.dispose(); }
  }
  class WebGLRenderer {
    constructor() { this.domElement = new Node(); this.capabilities = { getMaxAnisotropy: () => 1 }; }
    setPixelRatio() {}
    setSize() {}
    render() {}
  }
  class OrbitControls extends Three.EventDispatcher {
    constructor() { super(); this.target = new Three.Vector3(); }
    update() { return false; }
  }
  const context = vm.createContext({
    ...pie, ...runtime, ...droid, URL, Blob, console, document, fetch, OrbitControls,
    window: { location: { href: "http://localhost/model-editor/" }, devicePixelRatio: 1, addEventListener() {} },
    THREE: { ...Three, WebGLRenderer, BufferGeometry, TextureLoader: class { loadAsync(url) { return loadTexture(url); } } },
    ResizeObserver: class { observe() {} }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  });
  let source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  source = source.replace(/^import .*;\n/gm, "").replaceAll("import.meta.url", JSON.stringify(new URL("../src/main.js", import.meta.url).href));
  source = source.slice(0, source.indexOf("\nbindEvents();\n"));
  vm.runInContext(source + "\nglobalThis.app = { state, elements, modelGroup, sceneObjects, loadPieFromText, handleFiles, renderAll, selectPoint, updateSelectedPoint, commitCoordinateInput, runAction, initializeMapmakerBrowser, reportCatalogFailure, loadSample, loadTextureForModel, registerTexture, collectRetiredTextures, loadMapmakerModule, loadDroidDesign, changeDesignComponent, renderDesigner };", context);
  return { ...context.app, geometries };
}

async function designerApplication() {
  const root = new URL("../../mapmaker/", import.meta.url);
  const app = application({ fetch: async (address) => {
    const url = new URL(address);
    const path = url.protocol === "file:" ? url : new URL(url.pathname.split("/mapmaker/")[1], root);
    const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
  } });
  await app.initializeMapmakerBrowser();
  return app;
}

test("selectors synchronize presets and automatically reconcile aircraft, cyborgs and second guns", async () => {
  const app = await designerApplication();
  const preset = Object.values(app.state.mapmaker.templates).find((item) => item.body === "Body1REC" && item.propulsion === "wheeled01" && item.weapons?.[0] === "MG1Mk1");
  await app.loadMapmakerModule(preset.id);
  assert.equal(app.elements.designBody.value, preset.body);
  assert.equal(app.elements.designPropulsion.value, preset.propulsion);
  assert.equal(app.elements.designGuns[0].value, preset.weapons[0]);
  assert.equal(app.state.assembly.length, 4, "a combined propulsion mesh must not acquire a legacy right-side duplicate");
  app.elements.designPropulsion.value = "V-Tol"; await app.changeDesignComponent("propulsion");
  assert.equal(app.state.design.weapons[0], "MG1-VTOL");
  assert.ok(app.elements.designGuns[0].children.every((item) => app.state.mapmaker.weapons[item.value].numAttackRuns > 0));
  assert.match(app.elements.designHelp.textContent, /Gun changed to a compatible option/);
  app.elements.designGuns[0].value = "Bomb1-VTOL-LtHE"; await app.changeDesignComponent("weapon");
  assert.equal(app.state.design.weapons[0], "Bomb1-VTOL-LtHE");
  assert.equal(app.state.assembly.length, 3);
  assert.match(app.elements.designHelp.textContent, /Bomb bays/);
  app.elements.designBody.value = "CyborgLightBody"; await app.changeDesignComponent("body");
  assert.equal(app.elements.designPropulsion.value, "CyborgLegs");
  assert.equal(app.state.design.weapons[0], "CyborgChaingun");
  assert.equal(app.state.assembly.length, 3);
  assert.match(app.state.textureUrls.get("page-33-cyborgs.png"), /page-14-droid-hubs\.png$/);
  app.elements.designBody.value = "CyborgHeavyBody"; await app.changeDesignComponent("body");
  assert.ok(app.elements.designGuns[0].children.every((item) => app.state.mapmaker.weapons[item.value].usageClass === "SuperCyborg"));
  app.elements.designBody.value = "Body14SUP"; await app.changeDesignComponent("body");
  assert.equal(app.elements.designGunFields[1].hidden, false);
  app.elements.designGuns[1].value = "Cannon1Mk1"; await app.changeDesignComponent("weapon", 1);
  assert.equal(app.state.design.weapons.length, 2);
  assert.ok(app.state.assembly.some((part) => part.role === "weapon" && part.slot === 1));
  app.elements.designBody.value = "Body1REC"; await app.changeDesignComponent("body");
  assert.equal(app.state.design.weapons.length, 1);
  assert.equal(app.elements.designGunFields[1].hidden, true);
  const special = Object.values(app.state.mapmaker.templates).find((item) => app.state.mapmaker.bodies[item.body]?.class === "Babas" && item.weapons?.length);
  await app.loadMapmakerModule(special.id);
  assert.equal(app.state.design.id, special.id);
  assert.match(app.elements.designHelp.textContent, /Special preset/);
  assert.equal(app.elements.designBody.disabled, false);
  assert.equal(app.elements.designPropulsion.disabled, true);
  const commander = Object.values(app.state.mapmaker.templates).find((item) => item.body === "Body1REC" && item.weapons?.[0] === "CommandTurret1");
  await app.loadMapmakerModule(commander.id);
  assert.equal(app.elements.designGuns[0].value, "CommandTurret1");
  assert.match(app.elements.designHelp.textContent, /Special preset gun/);
  assert.equal(app.elements.buildDroidButton.disabled, true);
  assert.equal(app.elements.designGuns[0].disabled, false);
  app.elements.designGuns[0].value = "MG1Mk1"; await app.changeDesignComponent("weapon");
  assert.equal(app.elements.buildDroidButton.disabled, false);
});

test("component changes retain untouched edits, and aircraft overlays follow their part transform", async () => {
  const app = await designerApplication();
  await app.loadDroidDesign({ body: "Body1REC", propulsion: "wheeled01", weapons: ["MG1Mk1"], name: "Test tank" }, { custom: true });
  const body = app.state.model;
  app.selectPoint(0); app.updateSelectedPoint("x", "-8.125");
  app.elements.designGuns[0].value = "MG3Mk1"; await app.changeDesignComponent("weapon");
  assert.equal(app.state.model, body);
  assert.equal(body.levels[0].points[0].x, -8.125);
  app.elements.designPropulsion.value = "V-Tol"; await app.changeDesignComponent("propulsion");
  const gun = app.state.assembly.find((part) => part.role === "weapon");
  await app.renderAll({ next: { model: gun.model, activeLevelIndex: 0, selectedPointIndex: null } });
  app.selectPoint(0);
  const objects = app.sceneObjects;
  assert.equal(objects.partGroup.rotation.z, Math.PI);
  for (const object of [objects.mesh, objects.pointCloud, objects.wireframe, objects.selectedPoint, objects.connectors].filter(Boolean)) assert.equal(object.parent, objects.partGroup);
  const point = app.state.model.levels[0].points[0];
  app.updateSelectedPoint("x", String(point.x + 0.125));
  app.modelGroup.updateMatrixWorld(true);
  const expected = new Three.Vector3(point.x, point.y, point.z).applyMatrix4(objects.partGroup.matrixWorld);
  assert.ok(objects.selectedPoint.getWorldPosition(new Three.Vector3()).distanceTo(expected) < 1e-6);
  const vertex = new Three.Vector3().fromBufferAttribute(objects.pointCloud.geometry.attributes.position, 0).applyMatrix4(objects.pointCloud.matrixWorld);
  assert.ok(vertex.distanceTo(expected) < 1e-6);
  assert.equal(pie.parsePie(pie.serializePie(app.state.model)).levels[0].points[0].x, point.x);
});

test("a slower older texture/scene cannot replace or join the newest model", async () => {
  const slow = deferred(), fast = deferred();
  const app = application({ loadTexture: (url) => url === "slow" ? slow.promise : fast.promise });
  await app.loadPieFromText(sample, "baseline.pie");
  const baselineMesh = app.sceneObjects.mesh;
  app.state.textureUrls.set("page-17-droid-weapons.png", "slow");
  const first = app.loadPieFromText(sample, "old.pie");
  assert.equal(app.state.model.sourceName, "baseline.pie");
  assert.equal(app.sceneObjects.mesh, baselineMesh, "keep the previous model visible during loading");
  app.state.textureUrls.set("page-17-droid-weapons.png", "fast");
  const second = app.loadPieFromText(sample, "new.pie");
  fast.resolve(new Three.Texture()); await second;
  const newestMesh = app.sceneObjects.mesh;
  slow.resolve(new Three.Texture()); await first;
  assert.equal(app.state.model.sourceName, "new.pie");
  assert.equal(app.sceneObjects.mesh, newestMesh);
  let meshes = 0; app.modelGroup.traverse((child) => { if (child.isMesh) meshes++; });
  assert.equal(meshes, 1);
  assert.ok(baselineMesh.geometry.disposed);
  assert.ok(app.geometries.filter((geometry) => geometry !== newestMesh.geometry && geometry !== app.sceneObjects.pointCloud.geometry).every((geometry) => geometry.disposed));
});

test("an earlier file read cannot supersede a newer file selection", async () => {
  const text = deferred(); const app = application();
  const first = app.handleFiles([{ name: "old.pie", text: () => text.promise }]);
  await app.handleFiles([{ name: "new.pie", text: async () => sample }]);
  text.resolve(sample); await first;
  assert.equal(app.state.model.sourceName, "new.pie");
});

test("point selection preserves meshes; coordinate drafts validate before changing geometry", async () => {
  const app = application(); await app.loadPieFromText(sample, "sample.pie");
  const mesh = app.sceneObjects.mesh, geometry = mesh.geometry;
  app.selectPoint(0); const marker = app.sceneObjects.selectedPoint;
  app.selectPoint(1); app.selectPoint(0);
  assert.equal(app.sceneObjects.mesh, mesh);
  assert.equal(mesh.geometry, geometry);
  assert.equal(app.sceneObjects.selectedPoint, marker);
  app.elements.pointX.value = "";
  app.commitCoordinateInput("x", app.elements.pointX);
  assert.equal(app.state.model.levels[0].points[0].x, -6);
  assert.equal(app.elements.pointX.value, "");
  assert.equal(app.elements.pointX.attributes.get("aria-invalid"), "true");
  assert.equal(mesh.geometry, geometry);
  app.elements.pointX.value = "-12.375";
  app.commitCoordinateInput("x", app.elements.pointX);
  assert.equal(app.state.model.levels[0].points[0].x, -12.375);
  assert.equal(app.elements.pointX.value, "-12.375");
  assert.equal(app.sceneObjects.mesh, mesh);
  assert.ok(geometry.disposed);
  assert.equal(app.sceneObjects.pointCloud.geometry.attributes.position.getX(0), -12.375);
  assert.equal(app.sceneObjects.selectedPoint.position.x, -12.375);
  assert.equal(pie.parsePie(pie.serializePie(app.state.model)).levels[0].points[0].x, -12.375);
});

test("file and sample failures are visible and retain the previously loaded model", async () => {
  const app = application(); await app.loadPieFromText(sample, "previous.pie");
  const mesh = app.sceneObjects.mesh;
  await app.runAction(() => app.handleFiles([{ name: "broken.pie", text: async () => "not a PIE" }]), "Could not open files");
  assert.match(app.elements.statusText.textContent, /Could not open files.*Missing PIE/);
  assert.equal(app.state.model.sourceName, "previous.pie");
  assert.equal(app.sceneObjects.mesh, mesh);
  await app.runAction(app.loadSample, "Could not load sample");
  assert.match(app.elements.statusText.textContent, /Could not load sample.*Offline/);
  assert.equal(app.sceneObjects.mesh, mesh);
  await app.initializeMapmakerBrowser().catch(app.reportCatalogFailure);
  assert.match(app.elements.assetStatus.textContent, /Could not load the model catalog.*Offline/);
});

test("texture failures show usable geometry and a warning; concurrent loads share one decode", async () => {
  let attempts = 0;
  const app = application({ loadTexture: async () => { attempts++; throw new Error("Bad image"); } });
  const model = pie.parsePie(sample);
  app.state.textureUrls.set(model.texture.name, "broken");
  const results = await Promise.allSettled([app.loadTextureForModel(model), app.loadTextureForModel(model)]);
  assert.equal(attempts, 1);
  assert.ok(results.every((result) => result.status === "rejected"));
  await app.loadPieFromText(sample, "textured.pie");
  assert.ok(app.sceneObjects.mesh);
  assert.equal(app.sceneObjects.mesh.material.map, null);
  assert.match(app.elements.statusText.textContent, /Could not load texture.*showing untextured geometry/);
});
