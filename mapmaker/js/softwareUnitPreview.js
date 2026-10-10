import * as THREE from "./three.module.js";

// A small, static Canvas 2D renderer for browsers where WebGL cannot start.
// It uses the same assembled PIE meshes as the rotating preview, but samples
// one texture colour per triangle rather than trying to emulate WebGL.
const texturePixels = new WeakMap();
const lightDirection = new THREE.Vector3(0.35, 0.9, 0.55).normalize();

function pixelsFor(image) {
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null;
  if (texturePixels.has(image)) return texturePixels.get(image);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    texturePixels.set(image, pixels);
    return pixels;
  } catch {
    texturePixels.set(image, null);
    return null;
  }
}

function triangleColor(material, uv, lighting) {
  const image = material?.map?.image;
  const pixels = image && pixelsFor(image);
  let red = 150;
  let green = 161;
  let blue = 166;
  if (pixels && uv) {
    const u = ((uv.x % 1) + 1) % 1;
    const v = ((uv.y % 1) + 1) % 1;
    const x = Math.min(pixels.width - 1, Math.floor(u * pixels.width));
    const y = Math.min(pixels.height - 1, Math.floor((1 - v) * pixels.height));
    const offset = (y * pixels.width + x) * 4;
    if (pixels.data[offset + 3] < 20) return null;
    red = pixels.data[offset];
    green = pixels.data[offset + 1];
    blue = pixels.data[offset + 2];
  } else if (material?.color) {
    red = material.color.r * 255;
    green = material.color.g * 255;
    blue = material.color.b * 255;
  }
  const base = 0.55 + 0.45 * lighting;
  return `rgb(${Math.round(red * base)}, ${Math.round(green * base)}, ${Math.round(blue * base)})`;
}

export function drawSoftwareUnit(model, canvas) {
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D unavailable");
  context.scale(scale, scale);
  context.clearRect(0, 0, width, height);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 1000);
  const distance = maxDimension * 1.95;
  camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.75, distance));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  model.updateMatrixWorld(true);

  const triangles = [];
  const worldA = new THREE.Vector3();
  const worldB = new THREE.Vector3();
  const worldC = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const projectedA = new THREE.Vector3();
  const projectedB = new THREE.Vector3();
  const projectedC = new THREE.Vector3();
  const uvPoint = new THREE.Vector2();

  model.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible) return;
    const positions = mesh.geometry?.getAttribute("position");
    if (!positions) return;
    const uvs = mesh.geometry.getAttribute("uv");
    const index = mesh.geometry.index;
    const count = index ? index.count : positions.count;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = index ? index.getX(i) : i;
      const b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;
      worldA.fromBufferAttribute(positions, a).applyMatrix4(mesh.matrixWorld);
      worldB.fromBufferAttribute(positions, b).applyMatrix4(mesh.matrixWorld);
      worldC.fromBufferAttribute(positions, c).applyMatrix4(mesh.matrixWorld);
      edgeA.subVectors(worldB, worldA);
      edgeB.subVectors(worldC, worldA);
      normal.crossVectors(edgeA, edgeB).normalize();
      if (!Number.isFinite(normal.x)) continue;
      projectedA.copy(worldA).project(camera);
      projectedB.copy(worldB).project(camera);
      projectedC.copy(worldC).project(camera);
      if ([projectedA, projectedB, projectedC].some((point) => !Number.isFinite(point.x) || point.z < -1 || point.z > 1)) continue;
      if (uvs) {
        uvPoint.set((uvs.getX(a) + uvs.getX(b) + uvs.getX(c)) / 3,
          (uvs.getY(a) + uvs.getY(b) + uvs.getY(c)) / 3);
      }
      const color = triangleColor(material, uvs ? uvPoint : null, Math.abs(normal.dot(lightDirection)));
      if (!color) continue;
      triangles.push({
        depth: (projectedA.z + projectedB.z + projectedC.z) / 3,
        color,
        points: [projectedA, projectedB, projectedC].map((point) => [
          (point.x * 0.5 + 0.5) * width,
          (-point.y * 0.5 + 0.5) * height
        ])
      });
    }
  });

  triangles.sort((left, right) => right.depth - left.depth);
  for (const triangle of triangles) {
    context.beginPath();
    context.moveTo(...triangle.points[0]);
    context.lineTo(...triangle.points[1]);
    context.lineTo(...triangle.points[2]);
    context.closePath();
    context.fillStyle = triangle.color;
    context.fill();
  }
}
