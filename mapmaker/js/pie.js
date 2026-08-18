import * as THREE from "./three.module.js";
const pieCache = {};
export function parsePie(data) {
  const lines = data.split(/\r?\n/);
  let i = 0;
  const points = [];
  const triIndices = [];
  const triUVs = [];
  const connectors = [];
  let textureName = null;
  let typeFlags = 0;
  let texWidth = null;
  let texHeight = null;
  let currentLevel = 1;
  const nextLine = () => {
    i += 1;
    return i < lines.length ? lines[i] : null;
  };
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('TYPE')) {
      const parts = line.split(/\s+/);
      typeFlags = parseInt(parts[1], 16) || 0;
    } else if (line.startsWith('TEXTURE')) {
      const parts = line.split(/\s+/);
      textureName = parts[2] || null;
      if (parts.length >= 5) {
        const w = parseInt(parts[3], 10);
        const h = parseInt(parts[4], 10);
        texWidth = w > 0 ? w : null;
        texHeight = h > 0 ? h : null;
      }
    } else if (/^LEVEL\s+/.test(line)) {
      currentLevel = parseInt(line.split(/\s+/)[1], 10) || 1;
    } else if (line.startsWith('POINTS')) {
      const parts = line.split(/\s+/);
      const count = parseInt(parts[1], 10);
      for (let j = 0; j < count; j++) {
        const pointLine = nextLine();
        if (!pointLine || currentLevel !== 1) {
          continue;
        }
        const coords = pointLine.trim().split(/\s+/).map(Number);
        if (coords.length >= 3) {
          points.push([coords[0] / 128, coords[1] / 128, coords[2] / 128]);
        }
      }
    } else if (line.startsWith('POLYGONS')) {
      const count = parseInt(line.split(/\s+/)[1], 10);
      const isValidPolygonLine = (values) => (
        Array.isArray(values)
          && values.length >= 2
          && Number.isFinite(values[1])
          && values[1] >= 3
      );
      for (let j = 0; j < count; j++) {
        const polygonLine = nextLine();
        if (currentLevel !== 1 || !polygonLine) {
          continue;
        }
        const nums = polygonLine.trim().split(/\s+/).map(Number);
        if (!isValidPolygonLine(nums)) {
          continue;
        }
        const vertCount = Math.floor(nums[1]);
        const uvNeeded = 2 + (vertCount * 3);
        if (nums.length < uvNeeded) {
          continue;
        }
        if (currentLevel !== 1) continue;
        const startIdx = 2;
        const indices = nums.slice(startIdx, startIdx + vertCount);
        const uvStart = startIdx + vertCount;
        const uvPairs = nums.slice(uvStart);
        const isNumberIndex = (value) => Number.isFinite(value) && Number.isInteger(value);
        const isValidUVPair = (index) => (
          index * 2 + 1 < uvPairs.length
          && Number.isFinite(uvPairs[index * 2])
          && Number.isFinite(uvPairs[(index * 2) + 1])
        );

        for (let k = 1; k < vertCount - 1; k++) {
          const a = indices[0];
          const b = indices[k];
          const c = indices[k + 1];
          if (![a, b, c].every((vertex) => isNumberIndex(vertex) && points[vertex])) {
            continue;
          }
          if (!isValidUVPair(0) || !isValidUVPair(k) || !isValidUVPair(k + 1)) {
            continue;
          }
          triIndices.push([a, b, c]);
          const uvA = [uvPairs[0], uvPairs[1]];
          const uvB = [uvPairs[2 * k], uvPairs[2 * k + 1]];
          const uvC = [uvPairs[2 * (k + 1)], uvPairs[2 * (k + 1) + 1]];
          triUVs.push([uvA, uvB, uvC]);
        }
      }
    } else if (line.startsWith('CONNECTORS')) {
      const count = parseInt(line.split(/\s+/)[1], 10);
      for (let j = 0; j < count; j++) {
        const pointLine = nextLine();
        if (!pointLine) {
          continue;
        }
        const coords = pointLine.trim().split(/\s+/).map(Number);
        if (currentLevel === 1 && coords.length >= 3) {
          connectors.push([coords[0] / 128, coords[1] / 128, coords[2] / 128]);
        }
      }
    }
    i++;
  }
  const positions = [];
  const uvs = [];
  const normalizeUv = (value, size) => {
    if (Math.abs(value) <= 1) return value;
    if (size) return value / size;
    return value / 256;
  };
  triIndices.forEach((face, idx) => {
    const uvSet = triUVs[idx];
    if (!face || !uvSet) {
      return;
    }
    if (face.length !== 3 || uvSet.length !== 3) {
      return;
    }
    for (let j = 0; j < 3; j++) {
      const p = points[face[j]];
      const uv = uvSet[j];
      if (!p || !uv || !Number.isFinite(uv[0]) || !Number.isFinite(uv[1])) {
        return;
      }
      positions.push(p[0], p[1], p[2]);
      const u = normalizeUv(uv[0], texWidth);
      const v = 1 - normalizeUv(uv[1], texHeight);
      uvs.push(u, v);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvs.length > 0) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (textureName) geo.userData.textureName = textureName;
  }
  geo.userData.connectors = connectors;
  geo.userData.teamColorMask = !!(typeFlags & 0x10000);
  geo.computeVertexNormals();
  return geo;
}
export function loadPieGeometry(filename) {
  if (!filename) return Promise.reject(new Error('No file'));
  const key = filename.toLowerCase();
  if (pieCache[key]) {
    return Promise.resolve(pieCache[key]);
  }
  const base = (typeof window !== 'undefined' && window.PIES_BASE) ? window.PIES_BASE : 'pies/';
  const candidates = [key];
  const slash = key.lastIndexOf('/');
  if (slash >= 0 && key.startsWith('components/')) {
    const rootCandidate = key.slice(slash + 1);
    if (rootCandidate && !candidates.includes(rootCandidate)) candidates.push(rootCandidate);
  }
  let loadedKey = key;
  return candidates.reduce((promise, candidate) => {
    return promise.catch(() => fetch(base + candidate).then(res => {
      if (!res.ok) throw new Error('Failed to load ' + candidate);
      loadedKey = candidate;
      return res.text();
    }));
  }, Promise.reject()).then(text => {
    if (pieCache[loadedKey]) {
      pieCache[key] = pieCache[loadedKey];
      return pieCache[loadedKey];
    }
    const geo = parsePie(text);
    pieCache[key] = geo;
    pieCache[loadedKey] = geo;
    return geo;
  });
}
