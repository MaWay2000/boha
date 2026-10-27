import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Vector3, AnimationMixer } from '../mapmaker/js/three.module.js';
import { GLTFLoader } from '../assets/vendor/three-r149/GLTFLoader.js';
import { batchStaticRig, cameraFrame } from '../balloon/site-news-model-utils.mjs';

const path = new URL('../assets/news-balloon-v01.glb', import.meta.url);
async function load() {
  const bytes = await readFile(path);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const stats = scene => {
  let meshes = 0, triangles = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  });
  return { meshes, triangles };
};

test('exported balloon is a valid self-contained GLB without scene lights or cameras', async () => {
  const bytes = await readFile(path);
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(json.meshes.length > 0);
  assert.ok(!json.cameras?.length);
  assert.ok(!json.extensions?.KHR_lights_punctual);
  assert.ok(json.buffers.every(buffer => !buffer.uri));
  assert.ok((json.images || []).every(image => !image.uri));
});

test('batching keeps all balloon triangles and bounds while reducing draw objects', async () => {
  const gltf = await load();
  const original = stats(gltf.scene);
  const before = new Box3().setFromObject(gltf.scene);
  const optimized = batchStaticRig(gltf.scene, gltf.animations);
  const after = new Box3().setFromObject(optimized);
  const batched = stats(optimized);
  assert.equal(batched.triangles, original.triangles);
  assert.ok(batched.meshes < original.meshes / 10, JSON.stringify({ original, batched }));
  assert.ok(batched.meshes <= 20);
  assert.ok(before.min.distanceTo(after.min) < 0.0001);
  assert.ok(before.max.distanceTo(after.max) < 0.0001);
});

test('original Blender rig animation still binds after batching', async () => {
  const gltf = await load();
  assert.ok(gltf.animations.length > 0);
  const optimized = batchStaticRig(gltf.scene, gltf.animations);
  const rig = optimized.getObjectByName('NEWS_BALLOON_FLOAT_RIG');
  assert.ok(rig);
  const before = rig.position.clone(), rotation = rig.quaternion.clone();
  const mixer = new AnimationMixer(optimized);
  gltf.animations.forEach(clip => mixer.clipAction(clip).play());
  mixer.update(1);
  assert.ok(before.distanceTo(rig.position) > 0.001 || rotation.angleTo(rig.quaternion) > 0.001);
});

test('camera fitting keeps the complete balloon visible at both button sizes', () => {
  for (const [width, height] of [[132, 184], [108, 152]]) {
    const size = new Vector3(1.3, 2, 1.3), fit = cameraFrame(size, width / height);
    assert.ok(fit.right - fit.left > size.x);
    assert.ok(fit.top - fit.bottom > size.y);
    assert.equal(fit.left, -fit.right); assert.equal(fit.bottom, -fit.top);
  }
});

test('renderer reveals only a rendered 3D balloon and pauses when flight pauses', async () => {
  const source = await readFile(new URL('../balloon/site-news-model.js', import.meta.url), 'utf8');
  assert.match(source, /alpha: true, antialias: true/);
  assert.match(source, /setClearColor\(0x000000, 0\)/);
  assert.match(source, /dataset\.flying === 'true'/);
  assert.match(source, /boha:news-balloon-state/);
  assert.match(source, /1 \/ 30/);
  assert.match(source, /webglcontextlost/);
  assert.match(source, /classList\.remove\('has-3d'\)/);
  assert.match(source, /renderer\.info\.render\.calls > 0/);
  const css = await readFile(new URL('../balloon/site-news.css', import.meta.url), 'utf8');
  assert.match(css, /\.news-balloon \{[^}]*visibility: hidden;/);
  assert.match(css, /\.news-balloon:where\(\.has-3d\[data-model-state="ready"\]\) \{ visibility: visible; \}/);
  assert.match(css, /\.news-balloon img \{ display: none; \}/);
  assert.doesNotMatch(source, /https:\/\/|unpkg|jsdelivr/);
});
