import { Group, Mesh, MeshLambertMaterial, Box3, Vector3 } from './mapmaker/js/three.module.js';

export function buildUnit(parts) {
  if (!parts.length || parts.some(part => !part.geometry?.attributes.position?.count)) throw Error('Incomplete unit geometry.');
  const body = parts.find(part => part.role === 'body'), mount = parts.find(part => part.role === 'mount');
  if (!body) throw Error('Missing unit body.');
  const inner = new Group();
  const vector = connector => connector ? new Vector3(connector[0], connector[2], connector[1]) : new Vector3();
  for (const part of parts) {
    const material = new MeshLambertMaterial({ color: 0xe5f0f8, map: part.texture || null });
    const mesh = new Mesh(part.geometry, material);
    if (['mount', 'weapon'].includes(part.role)) mesh.position.copy(vector(body.geometry.userData.connectors?.[0]));
    if (part.role === 'weapon') mesh.position.add(vector(mount?.geometry.userData.connectors?.[0]));
    inner.add(mesh);
  }
  const box = new Box3().setFromObject(inner);
  if (box.isEmpty() || !Number.isFinite(box.max.length())) throw Error('Invalid unit model.');
  inner.position.sub(box.getCenter(new Vector3()));
  const pivot = new Group(); pivot.add(inner); return pivot;
}
