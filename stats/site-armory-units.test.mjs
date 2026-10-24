import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Box3, Vector3 } from '../mapmaker/js/three.module.js';
import { parsePie } from '../mapmaker/js/pie.js';
import { buildUnit } from '../site-armory-unit-model-utils.mjs';
const require = createRequire(import.meta.url), { CATALOG } = require('../site-armory-battle.js');

test('every affordable unit has complete renderable bundled parts and a centered full-unit model', async () => {
  for (const type of CATALOG) {
    const parts = await Promise.all(type.parts.map(async part => ({ ...part, geometry: parsePie(await readFile(new URL('../mapmaker/pies/components/' + part.path, import.meta.url), 'utf8')) })));
    const unit = buildUnit(parts), box = new Box3().setFromObject(unit);
    assert.equal(box.isEmpty(), false); assert.ok(box.getCenter(new Vector3()).length() < .00001);
    let meshes = 0; unit.traverse(node => { if (node.isMesh) { meshes++; node.geometry.dispose(); node.material.dispose(); } });
    assert.ok(meshes >= 3);
    assert.throws(() => buildUnit([]));
  }
});

test('unit renderer caches template assets, uses the existing 3D renderer, and pauses with the game', async () => {
  const code = await readFile(new URL('../site-armory-units.js', import.meta.url), 'utf8');
  assert.match(code, /drawSoftwareUnit/); assert.match(code, /model.clone\(true\)/);
  assert.match(code, /templates = new Map/); assert.match(code, /document.hidden \|\| layer.hidden/);
  assert.match(code, /now - last >= 50/); assert.match(code, /pagehide/);
  assert.doesNotMatch(code, /https:\/\/|new .*WebGLRenderer|innerHTML/);
});
