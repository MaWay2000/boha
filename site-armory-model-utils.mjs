import { Group, Mesh, Box3, Vector3, MeshLambertMaterial } from './mapmaker/js/three.module.js';
import * as techSource from './site-armory-tech.js?v=20261024-tech-tiers-1';

// The same bundled classic components used by the player-profile unit gallery.
const tech = techSource.default || globalThis.SiteArmoryTech;
export const TECH_PATHS = tech.PATHS;
export const turretFor = tech.tierFor;
export const TURRETS = Object.freeze(Object.fromEntries(Object.keys(TECH_PATHS).map(key => [key, TECH_PATHS[key][0]])));

// Swapping tiers may race a slow old download against a newer tier/reset.
// Only the latest selection can change the displayed model. Ownership stays
// with the shared model cache, not with an individual weapon slot.
export function createTierLoader(loadModel, onState) {
  let generation = 0, requested = '', disposed = false;
  return {
    async select(files) {
      if (disposed || requested === files.definition) return;
      requested = files.definition;
      const token = ++generation;
      onState({ status: 'loading', definition: files.definition });
      try {
        const model = await loadModel(files);
        if (!disposed && token === generation) onState({ status: 'ready', definition: files.definition, model });
      } catch {
        if (!disposed && token === generation) onState({ status: 'fallback', definition: files.definition });
      }
    },
    dispose() { disposed = true; generation++; }
  };
}

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
