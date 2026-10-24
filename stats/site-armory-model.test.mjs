import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Vector3, Sphere, PerspectiveCamera, MathUtils } from '../mapmaker/js/three.module.js';
import { parsePie } from '../mapmaker/js/pie.js';
import { TURRETS, buildTurret, disposeTurret } from '../site-armory-model-utils.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
async function geometry(name) { return parsePie(await read('mapmaker/pies/components/weapons/' + name)); }

test('all four previews use the actual bundled weapon definitions and available local textures', async () => {
  const definitions = JSON.parse(await read('mapmaker/pies/components/weapons/weapons.json'));
  assert.deepEqual(Object.keys(TURRETS), ['machinegun', 'cannon', 'laser', 'rockets']);
  for (const definition of Object.values(TURRETS)) {
    const weapon = definitions[definition.definition];
    assert.equal(weapon.model.toLowerCase(), definition.barrel);
    assert.equal(weapon.mountModel.toLowerCase(), definition.mount);
    for (const file of [definition.mount, definition.barrel]) {
      const geo = await geometry(file); assert.ok(geo.getAttribute('position').count >= 24);
      assert.equal(geo.getAttribute('uv').count, geo.getAttribute('position').count);
      const texture = await readFile(new URL('mapmaker/classic/texpages/texpages/' + geo.userData.textureName, root));
      assert.equal(texture.subarray(1, 4).toString(), 'PNG');
      geo.dispose();
    }
  }
});

test('turrets contain the full barrel and mount, have finite bounds, and rotate around their own center', async () => {
  for (const definition of Object.values(TURRETS)) {
    const model = buildTurret(await geometry(definition.mount), await geometry(definition.barrel));
    let meshes = 0, vertices = 0;
    model.traverse(node => { if (node.isMesh) { meshes++; vertices += node.geometry.attributes.position.count; } });
    assert.equal(meshes, 2); assert.ok(vertices >= 60);
    const box = new Box3().setFromObject(model), center = box.getCenter(new Vector3());
    assert.ok(center.length() < .00001);
    const verticesBefore = vertices;
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      model.rotation.y = angle;
      const bounds = new Box3().setFromObject(model);
      assert.ok(bounds.getCenter(new Vector3()).length() < .00001);
      assert.ok(Number.isFinite(bounds.max.length()));
    }
    assert.equal(vertices, verticesBefore);
    disposeTurret(model);
  }
});

test('empty models fail safely and cleanup disposes shared materials only once', async () => {
  assert.throws(() => buildTurret(null, null));
  const model = buildTurret(await geometry('trhcan.pie'), await geometry('gnhcan.pie'));
  let materials = 0, geometries = 0;
  const material = model.children[0].children[0].material;
  material.addEventListener('dispose', () => materials++);
  model.traverse(node => { if (node.isMesh) node.geometry.addEventListener('dispose', () => geometries++); });
  disposeTurret(model); assert.equal(materials, 1); assert.equal(geometries, 2);
});

test('the enlarged canvas keeps the complete turret inside the compact stage throughout a revolution', async () => {
  for (const definition of Object.values(TURRETS)) {
    const model = buildTurret(await geometry(definition.mount), await geometry(definition.barrel));
    const sphere = new Box3().setFromObject(model).getBoundingSphere(new Sphere());
    const width = 68, height = 80, aspect = width / height, half = MathUtils.degToRad(18);
    const distance = sphere.radius / Math.sin(Math.min(half, Math.atan(Math.tan(half) * aspect))) * 1.12;
    const camera = new PerspectiveCamera(36, aspect, distance / 100, distance * 10);
    camera.position.copy(sphere.center).add(new Vector3(1, .72, 1).normalize().multiplyScalar(distance));
    camera.lookAt(sphere.center); camera.updateMatrixWorld();
    for (let angle = 0; angle < Math.PI * 2; angle += .1) {
      model.rotation.y = angle; model.updateMatrixWorld(true);
      model.traverse(mesh => {
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
          assert.ok(Math.abs(point.x) < 1);
          assert.ok(Math.abs(point.y) < 44 / height);
        }
      });
    }
    disposeTurret(model);
  }
});

test('preview reuses the existing textured 3D renderer without extra WebGL contexts or runtime CDN code', async () => {
  const source = await read('site-armory-model.js');
  assert.match(source, /import \{ drawSoftwareUnit \} from '.\/mapmaker\/js\/softwareUnitPreview.js/);
  assert.match(source, /import \{ parsePie \} from '.\/mapmaker\/js\/pie.js/);
  assert.match(source, /now - lastFrame >= 50/);
  assert.match(source, /IntersectionObserver/); assert.match(source, /document.hidden/);
  assert.match(source, /prefers-reduced-motion/); assert.match(source, /pagehide/);
  assert.match(source, /classList.remove\('has-model'\)/);
  assert.doesNotMatch(source, /new .*WebGLRenderer|https:\/\/|innerHTML/);
});

test('reload text has no visible layout row while progress bars and accessible descriptions remain', async () => {
  const css = await read('site-armory.css'), html = await read('index.html');
  assert.match(css, /\.armory-rack \.armory-reload-label \{[^}]*position: absolute;[^}]*height: 1px;[^}]*clip-path: inset\(50%\)/);
  assert.match(css, /width: 80px;/); assert.match(css, /height: 44px;/);
  for (const weapon of Object.keys(TURRETS)) {
    assert.ok(html.includes(`aria-describedby="armoryReloadLabel-${weapon}"`));
    assert.ok(html.includes(`id="armoryReload-${weapon}"`));
  }
  assert.equal((html.match(/class="armory-gun-preview"/g) || []).length, 4);
  assert.match(html, /src="site-armory-model.js[^>]*type="module"/);
  assert.doesNotMatch(html, /Balloon target practice · select to arm|class="armory-invitation"/);
});
