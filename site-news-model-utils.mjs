import { Group, Matrix4, Mesh } from './mapmaker/js/three.module.js';
import { mergeBufferGeometries } from './assets/vendor/three-r149/BufferGeometryUtils.js';

export function cameraFrame(size, aspect, padding = 1.14) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const halfHeight = Math.max(size.y, size.x / ratio) * padding / 2;
  return { left: -halfHeight * ratio, right: halfHeight * ratio, top: halfHeight, bottom: -halfHeight };
}

// Merge only static children of the exported animation rig. Keep the rig's
// name and transform intact so the original Blender animation still binds.
export function batchStaticRig(source, clips = []) {
  const rig = source.children.length === 1 ? source.children[0] : null;
  if (!rig || !rig.children.length || clips.some(clip => clip.tracks.some(track => !track.name.startsWith(rig.name + '.')))) return source;
  const meshes = [];
  rig.traverse(object => { if (object.isMesh) meshes.push(object); });
  if (!meshes.length || meshes.some(mesh => mesh.isSkinnedMesh || Array.isArray(mesh.material)
    || Object.keys(mesh.geometry.morphAttributes).length || mesh.visible === false)) return source;
  source.updateMatrixWorld(true);
  const inverseRig = new Matrix4().copy(rig.matrixWorld).invert();
  const buckets = new Map();
  for (const mesh of meshes) {
    const matrix = new Matrix4().multiplyMatrices(inverseRig, mesh.matrixWorld);
    const geometry = mesh.geometry.clone().applyMatrix4(matrix);
    if (matrix.determinant() < 0) {
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
      const indices = geometry.index;
      for (let i = 0; i < indices.count; i += 3) {
        const first = indices.getX(i); indices.setX(i, indices.getX(i + 2)); indices.setX(i + 2, first);
      }
    }
    const signature = JSON.stringify([mesh.material.uuid, Boolean(geometry.index),
      Object.entries(geometry.attributes).map(([name, attr]) => [name, attr.itemSize, attr.normalized]).sort()]);
    if (!buckets.has(signature)) buckets.set(signature, { material: mesh.material, geometries: [] });
    buckets.get(signature).geometries.push(geometry);
  }
  const optimized = source.clone(false);
  const optimizedRig = new Group();
  optimizedRig.name = rig.name;
  optimizedRig.position.copy(rig.position); optimizedRig.quaternion.copy(rig.quaternion); optimizedRig.scale.copy(rig.scale);
  optimized.add(optimizedRig);
  for (const { material, geometries } of buckets.values()) {
    const geometry = mergeBufferGeometries(geometries);
    if (!geometry) {
      for (const bucket of buckets.values()) for (const part of bucket.geometries) part.dispose();
      optimized.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
      return source;
    }
    geometries.forEach(part => part.dispose());
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Balloon batch: ' + material.name;
    optimizedRig.add(mesh);
  }
  const originals = new Set(meshes.map(mesh => mesh.geometry));
  originals.forEach(geometry => geometry.dispose());
  return optimized;
}
