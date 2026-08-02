import * as THREE from "./three.module.js";
import { loadPieGeometry } from "./pie.js";

function normalizeTexPath(name) {
  let n = String(name || "").replace(/\\/g, "/").toLowerCase();
  n = n.replace(/^\.+\//, "");
  n = n.replace(/^(images|texpages)\//, "");
  n = n.replace(/^classic\/texpages\//, "");
  n = n.replace(/texpages\/texpages\//g, "texpages/");
  return n;
}

function makeDroidMaterial(geo, role = '') {
  if (geo.userData && geo.userData.textureName) {
    const tl = new THREE.TextureLoader();
    const requestedTexName = normalizeTexPath(geo.userData.textureName);
    const textureAliases = {
      'page-32-soldier.png': 'page-7-barbarians-arizona.png',
      'page-33-cyborgs.png': 'page-14-droid-hubs.png'
    };
    const tn = textureAliases[requestedTexName] || requestedTexName;
    const missingEffectTextures = new Set([
      'helirotor.png',
      'page-50-chopperblades.png',
      'page-51-chopperblades.png',
      'page-18-fx.png',
      'page-19-fx.png',
      'page-20-fx.png',
      'page-21-fx.png',
      'page-22-fx.png',
      'page-23-fx.png',
      'page-24-fx.png'
    ]);
    const missingDroidTextures = new Set([
      'page-0-scav.png',
      'page-1-icevan.png',
      'page-2-crane.png',
      'page-3-bababus.png',
      'page-4-scav.png',
      'page-32-soldier.png',
      'page-33-cyborgs.png',
      'page-401.png',
      'page-403-chopper.png'
    ]);
    if ((role === 'effect' || role === 'muzzle') && missingEffectTextures.has(tn)) {
      return new THREE.MeshBasicMaterial({
        color: tn.endsWith('-fx.png') ? 0xffdd88 : tn === 'helirotor.png' ? 0x99ddff : 0xe8e8e8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.55
      });
    }
    if (missingDroidTextures.has(tn)) {
      return new THREE.MeshLambertMaterial({ color: 0x9a9a90 });
    }
    const tex = tl.load(((typeof window !== 'undefined' && window.TEX_BASE) ? window.TEX_BASE : TEX_BASE) + tn, undefined, undefined, () => {});
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    if (role === 'effect' || role === 'muzzle') {
      return new THREE.MeshBasicMaterial({
        map: tex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: role === 'muzzle' ? 0.85 : 1
      });
    }
    return new THREE.MeshLambertMaterial({ map: tex });
  }
  if (role === 'effect' || role === 'muzzle') {
    return new THREE.MeshBasicMaterial({
      color: role === 'muzzle' ? 0xffdd88 : 0x88ccff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: role === 'muzzle' ? 0.85 : 0.65
    });
  }
  return new THREE.MeshLambertMaterial({ color: 0x8888ff });
}

function getConnectorVector(connectors, index = 0) {
  const c = connectors && connectors[index];
  return c ? new THREE.Vector3(c[0], c[2], c[1]) : null;
}

function getPartSlot(part) {
  return Number.isFinite(part?.slot) ? part.slot : 0;
}

function isToolPart(part) {
  return part?.kind && part.kind !== 'weapon';
}

function isCyborgType(type) {
  return String(type || '').includes('CYBORG');
}

function getEffectSpinSpeed(part) {
  const path = String(part?.path || '').toLowerCase();
  if (path.includes('rotor') || path.includes('blade') || path.includes('heli')) return part.effectState === 'still' ? 10 : 18;
  if (path.includes('fxvtl')) return 7;
  return 4;
}

function getBodyConnector(bodyPart, slot, meta) {
  if (!bodyPart) return null;
  const isVtolWeapon = meta.propulsionType === 'Lift' && meta.droidType === 'DROID' && slot >= 0;
  return getConnectorVector(bodyPart.geo.userData.connectors, isVtolWeapon ? 5 + slot : slot);
}

function getWeaponAnimMeta(part, bodyConnector, mountConnector, weaponConnector, isVtolWeapon) {
  return {
    role: part.role,
    slot: getPartSlot(part),
    bodyConnector: bodyConnector ? bodyConnector.clone() : new THREE.Vector3(),
    mountConnector: mountConnector ? mountConnector.clone() : new THREE.Vector3(),
    weaponConnector: weaponConnector ? weaponConnector.clone() : new THREE.Vector3(),
    isVtolWeapon,
    recoilValue: part.recoilValue || 0,
    rotateSpeed: part.rotateSpeed || 0,
    firePause: part.firePause || 20,
    phase: getPartSlot(part) * 0.7
  };
}

export async function buildDroidGroup(pieFiles) {
  const group = new THREE.Group();
  const parts = pieFiles.map(part => typeof part === 'string' ? { path: part, role: 'part' } : part);
  const meta = parts.find(part => part.role === 'meta') || {};
  const loadedParts = await Promise.all(
    parts.filter(part => part.role !== 'meta').map(part => loadPieGeometry(part.path).then(g => ({ ...part, geo: g.clone() })).catch(() => null))
  );
  const bodyPart = loadedParts.find(part => part && part.role === 'body');
  const mountsBySlot = new Map();
  const weaponsBySlot = new Map();
  loadedParts.forEach(part => {
    if (part && part.role === 'mount') mountsBySlot.set(getPartSlot(part), part);
    if (part && part.role === 'weapon') weaponsBySlot.set(getPartSlot(part), part);
  });
  loadedParts.forEach(part => {
    if (!part || !part.geo) return;
    const geo = part.geo;
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, makeDroidMaterial(geo, part.role));
    if (part.role === 'effect') {
      mesh.userData.droidEffectSpin = getEffectSpinSpeed(part);
    }
    if (part.role === 'mount' || part.role === 'weapon' || part.role === 'muzzle') {
      const slot = getPartSlot(part);
      const bodyConnector = getBodyConnector(bodyPart, isToolPart(part) ? 0 : slot, meta);
      if (bodyConnector) {
        mesh.position.copy(bodyConnector);
        const isVtolWeapon = !isToolPart(part) && meta.propulsionType === 'Lift' && meta.droidType === 'DROID';
        if (isVtolWeapon) mesh.rotation.z = Math.PI;
        const mount = mountsBySlot.get(slot);
        const shouldUseMountConnector = (part.role === 'weapon' || part.role === 'muzzle') && mount && (!isToolPart(part) || isCyborgType(meta.droidType));
        let mountConnector = null;
        if (shouldUseMountConnector) {
          mountConnector = getConnectorVector(mount.geo.userData.connectors, 0);
          if (mountConnector) {
            if (isVtolWeapon) mountConnector.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
            mesh.position.add(mountConnector);
          }
        }
        let weaponConnector = null;
        if (part.role === 'muzzle') {
          const weapon = weaponsBySlot.get(slot);
          weaponConnector = getConnectorVector(weapon?.geo.userData.connectors, 0);
          if (weaponConnector) {
            if (isVtolWeapon) weaponConnector.applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
            mesh.position.add(weaponConnector);
          }
        }
        if (part.kind === 'weapon' || part.role === 'muzzle') {
          mesh.userData.droidWeaponAnim = getWeaponAnimMeta(part, bodyConnector, mountConnector, weaponConnector, isVtolWeapon);
          if (part.role === 'muzzle') mesh.visible = false;
        }
      }
    }
    group.add(mesh);
  });
  group.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(group);
  group.userData.minY = bbox.min.y;
  const center = bbox.getCenter(new THREE.Vector3());
  group.userData.centerX = center.x;
  group.userData.centerY = center.y;
  group.userData.centerZ = center.z;
  const sphere = new THREE.Sphere();
  bbox.getBoundingSphere(sphere);
  group.userData.boundingSphere = sphere;
  group.userData.cullable = true;
  return group;
}

export function updateDroidAnimations(root, timeMs = 0) {
  if (!root) return;
  const seconds = timeMs / 1000;
  root.traverse(obj => {
    const spin = obj.userData?.droidEffectSpin;
    if (spin) obj.rotation.y = seconds * spin;
    const anim = obj.userData?.droidWeaponAnim;
    if (anim) {
      const yaw = anim.rotateSpeed ? Math.sin(seconds * 0.75 + anim.phase) * 0.35 : 0;
      const pitch = Math.sin(seconds * 1.1 + anim.phase) * 0.12;
      const cycle = (seconds * 1000 / Math.max(120, anim.firePause * 80) + anim.slot * 0.37) % 1;
      const pulse = cycle < 0.18 ? 1 - Math.abs(cycle - 0.09) / 0.09 : 0;
      const recoil = (anim.recoilValue || 0) / 1280 * pulse;
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), anim.isVtolWeapon ? -pitch : pitch);
      const muzzleOffset = anim.weaponConnector.clone().applyQuaternion(pitchQuat).applyQuaternion(yawQuat);
      const mountOffset = anim.mountConnector.clone().applyQuaternion(yawQuat);
      const recoilAmount = anim.role === 'mount' ? recoil / 3 : recoil;
      const recoilOffset = new THREE.Vector3(0, 0, recoilAmount).applyQuaternion(pitchQuat).applyQuaternion(yawQuat);
      obj.position.copy(anim.bodyConnector).add(mountOffset);
      if (anim.role === 'muzzle') obj.position.add(muzzleOffset);
      if (anim.role === 'mount' || anim.role === 'weapon' || anim.role === 'muzzle') obj.position.add(recoilOffset);
      obj.rotation.y = yaw;
      if (anim.isVtolWeapon) obj.rotation.z = Math.PI;
      if (anim.role === 'weapon' || anim.role === 'muzzle') obj.rotation.x = anim.isVtolWeapon ? -pitch : pitch;
      if (anim.role === 'muzzle') {
        obj.visible = pulse > 0;
        obj.scale.setScalar(0.75 + pulse * 0.65);
        if (obj.material) obj.material.opacity = 0.25 + pulse * 0.75;
      }
    }
  });
}
