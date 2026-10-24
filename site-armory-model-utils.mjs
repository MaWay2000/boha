import { Group, Mesh, Box3, Vector3, MeshLambertMaterial } from './mapmaker/js/three.module.js';

// The same bundled classic components used by the player-profile unit gallery.
export const TURRETS = Object.freeze({
  machinegun: Object.freeze({ definition: 'MG3Mk1', mount: 'trmmg.pie', barrel: 'gnmmg1.pie' }),
  cannon: Object.freeze({ definition: 'Cannon375mmMk1', mount: 'trhcan.pie', barrel: 'gnhcan.pie' }),
  laser: Object.freeze({ definition: 'Laser2PULSEMk1', mount: 'trmlas.pie', barrel: 'gnmlas.pie' }),
  rockets: Object.freeze({ definition: 'Rocket-LtA-T', mount: 'trmrckta.pie', barrel: 'gnmrckta.pie' })
});

export function buildTurret(mountGeometry, barrelGeometry, texture = null) {
  for (const geometry of [mountGeometry, barrelGeometry]) {
    if (!geometry?.getAttribute('position')?.count) throw new Error('Empty turret geometry.');
  }
  const material = new MeshLambertMaterial({ color: 0xe2edf4, map: texture });
  const parts = new Group();
  const mount = new Mesh(mountGeometry, material), barrel = new Mesh(barrelGeometry, material);
  const connector = mountGeometry.userData.connectors?.[0];
  if (connector) barrel.position.set(connector[0], connector[2], connector[1]);
  parts.add(mount, barrel);
  const box = new Box3().setFromObject(parts);
  if (box.isEmpty() || !Number.isFinite(box.max.length())) throw new Error('Invalid turret bounds.');
  parts.position.sub(box.getCenter(new Vector3()));
  // An outer pivot keeps the centered turret from orbiting as it rotates.
  const pivot = new Group(); pivot.add(parts);
  return pivot;
}

export function disposeTurret(model) {
  const geometries = new Set(), materials = new Set();
  model?.traverse(node => {
    if (!node.isMesh) return;
    geometries.add(node.geometry);
    (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
}
