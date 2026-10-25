import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Box3, Vector3, BufferGeometry, Float32BufferAttribute } from '../mapmaker/js/three.module.js';
import { parsePie } from '../mapmaker/js/pie.js';
import { buildUnit, cachedLoad, retryLoad, validateUnitGeometry } from '../balloon/site-armory-unit-model-utils.mjs';
const require = createRequire(import.meta.url), { CATALOG } = require('../balloon/site-armory-battle.js');

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

test('all nine unit designs have finite triangles, exact-case asset paths and real bundled PNG textures', async () => {
  assert.equal(CATALOG.length, 9);
  for (const type of CATALOG) for (const part of type.parts) {
    const url = new URL('../mapmaker/pies/components/' + part.path, import.meta.url);
    const filename = part.path.split('/').at(-1);
    assert.ok((await readdir(new URL('./', url))).includes(filename), `${type.name}: case-sensitive model path`);
    const geometry = validateUnitGeometry(parsePie(await readFile(url, 'utf8')));
    const textureName = geometry.userData.textureName;
    assert.match(textureName, /^[a-z0-9_-]+\.png$/i);
    const texture = new URL('../mapmaker/classic/texpages/texpages/' + textureName, import.meta.url);
    assert.ok((await readdir(new URL('./', texture))).includes(textureName), `${type.name}: case-sensitive texture path`);
    const bytes = await readFile(texture);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
    geometry.dispose();
  }
});

test('successful asset requests are shared while rejected requests are evicted and can recover', async () => {
  const cache = new Map(); let calls = 0;
  const broken = () => cachedLoad(cache, 'pulse', () => { calls++; throw Error('Temporary 503'); });
  const first = broken(), second = broken(); assert.equal(first, second);
  await assert.rejects(first, /503/); await assert.rejects(second, /503/);
  assert.equal(calls, 1); assert.equal(cache.has('pulse'), false);
  const model = { name: 'Pulse Laser' };
  const loaded = cachedLoad(cache, 'pulse', () => { calls++; return model; });
  assert.equal(await loaded, model); assert.equal(await cachedLoad(cache, 'pulse', () => { throw Error('must not reload'); }), model);
  assert.equal(calls, 2);
});

test('late failed requests never delete a newer cached asset', async () => {
  let rejectOld; const cache = new Map();
  const stale = cachedLoad(cache, 'pulse', () => new Promise((_, reject) => { rejectOld = reject; }));
  await Promise.resolve(); const replacement = Promise.resolve('new model'); cache.set('pulse', replacement);
  rejectOld(Error('stale')); await assert.rejects(stale, /stale/);
  assert.equal(cache.get('pulse'), replacement);
});

test('Pulse Laser template recovers from a failed barrel request and reuses every successful part', async () => {
  const pulse = CATALOG.find(type => type.key === 'A-Mantis-Trk-Pulse');
  const assets = new Map(), models = new Map(), calls = new Map(), delays = [];
  const model = await cachedLoad(models, pulse.key, () => retryLoad(async () => {
    const parts = await Promise.all(pulse.parts.map(async part => ({ ...part, geometry: await cachedLoad(assets, part.path, async () => {
      calls.set(part.path, (calls.get(part.path) || 0) + 1);
      if (part.path.endsWith('/gnmlas.pie') && calls.get(part.path) === 1) throw Error('Temporary model failure');
      return validateUnitGeometry(parsePie(await readFile(new URL('../mapmaker/pies/components/' + part.path, import.meta.url), 'utf8')));
    }) })));
    return buildUnit(parts);
  }, { wait: async ms => { delays.push(ms); } }));
  assert.deepEqual(delays, [300]); assert.equal(new Box3().setFromObject(model).isEmpty(), false);
  for (const part of pulse.parts) assert.equal(calls.get(part.path), part.path.endsWith('/gnmlas.pie') ? 2 : 1);
  model.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
});

test('retry attempts are bounded and disposal cancels pending retries', async () => {
  let calls = 0; const delays = [];
  await assert.rejects(retryLoad(() => { calls++; throw Error('offline'); }, { wait: async ms => { delays.push(ms); } }), /offline/);
  assert.equal(calls, 3); assert.deepEqual(delays, [300, 1000]);
  let active = true; calls = 0;
  await assert.rejects(retryLoad(() => { calls++; throw Error('offline'); }, {
    wait: async () => { active = false; }, active: () => active
  }), /stopped/);
  assert.equal(calls, 1);
});

test('empty, malformed and non-finite meshes cannot hide the fallback behind a blank canvas', () => {
  for (const vertices of [[], [0, 0, 0], [0, 0, 0, 1, 0, 0, NaN, 1, 0]]) {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    assert.throws(() => validateUnitGeometry(geometry), /Invalid/); geometry.dispose();
  }
});

test('unit renderer caches template assets, uses the existing 3D renderer, and pauses with the game', async () => {
  const code = await readFile(new URL('../balloon/site-armory-units.js', import.meta.url), 'utf8');
  assert.match(code, /drawSoftwareUnit/); assert.match(code, /model.clone\(true\)/);
  assert.match(code, /templates = new Map/); assert.match(code, /document.hidden \|\| layer.hidden/);
  assert.match(code, /now - last >= 50/); assert.match(code, /pagehide/);
  assert.match(code, /cachedLoad\(geometries/); assert.match(code, /cachedLoad\(textures/); assert.match(code, /cachedLoad\(templates/);
  assert.match(code, /retryLoad\(load/); assert.match(code, /online', recoverFailed/); assert.match(code, /controller.abort\(\)/);
  assert.match(code, /items.get\(node\) !== item/); assert.match(code, /canvas.dataset.triangles/);
  assert.match(code, /attributeOldValue: true/); assert.match(code, /record.oldValue !== layer.getAttribute\(record.attributeName\)/);
  assert.doesNotMatch(code, /https:\/\/|new .*WebGLRenderer|innerHTML/);
});
