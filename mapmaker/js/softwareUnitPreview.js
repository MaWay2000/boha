import * as THREE from "./three.module.js";

// Project the real PIE meshes onto Canvas when the browser cannot use WebGL.
// Draw texture images directly: pixel readback is blocked by some browsers.
const views = new WeakMap();
const lightDirection = new THREE.Vector3(0.35, 0.9, 0.55).normalize();

function textureTriangle(context, image, points, uv) {
  const source = uv.map(([u, v]) => [
    Math.max(0, Math.min(1, u)) * image.naturalWidth,
    Math.max(0, Math.min(1, v)) * image.naturalHeight
  ]);
  const sx1 = source[1][0] - source[0][0];
  const sy1 = source[1][1] - source[0][1];
  const sx2 = source[2][0] - source[0][0];
  const sy2 = source[2][1] - source[0][1];
  const determinant = sx1 * sy2 - sx2 * sy1;
  if (Math.abs(determinant) < 0.00001) return;
  const dx1 = points[1][0] - points[0][0];
  const dy1 = points[1][1] - points[0][1];
  const dx2 = points[2][0] - points[0][0];
  const dy2 = points[2][1] - points[0][1];
  const a = (dx1 * sy2 - dx2 * sy1) / determinant;
  const b = (dy1 * sy2 - dy2 * sy1) / determinant;
  const c = (dx2 * sx1 - dx1 * sx2) / determinant;
  const d = (dy2 * sx1 - dy1 * sx2) / determinant;
  context.save();
  context.clip();
  context.transform(a, b, c, d,
    points[0][0] - a * source[0][0] - c * source[0][1],
    points[0][1] - b * source[0][0] - d * source[0][1]);
  context.drawImage(image, 0, 0);
  context.restore();
}

export function drawSoftwareUnit(model, canvas) {
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * scale);
  const pixelHeight = Math.round(height * scale);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);

  let view = views.get(canvas);
  if (!view || view.model !== model) {
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    view = { model, center: sphere.center, radius: Math.max(sphere.radius, 0.01) };
    views.set(canvas, view);
  }
  const aspect = width / height;
  const halfFov = THREE.MathUtils.degToRad(18);
  const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * aspect));
  const distance = view.radius / Math.sin(limitingFov) * 1.12;
  const camera = new THREE.PerspectiveCamera(36, aspect, distance / 100, distance * 10);
  camera.position.copy(view.center).add(new THREE.Vector3(1, 0.72, 1).normalize().multiplyScalar(distance));
  camera.lookAt(view.center);
  camera.updateMatrixWorld();
  model.updateMatrixWorld(true);

  const triangles = [];
  const world = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const projected = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();

  model.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry?.getAttribute("position");
    if (!positions) return;
    const uvs = mesh.geometry.getAttribute("uv");
    const index = mesh.geometry.index;
    const count = index ? index.count : positions.count;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    for (let i = 0; i + 2 < count; i += 3) {
      const indices = [0, 1, 2].map((offset) => index ? index.getX(i + offset) : i + offset);
      indices.forEach((vertex, offset) => {
        world[offset].fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld);
        projected[offset].copy(world[offset]).project(camera);
      });
      if (projected.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.z < -1 || point.z > 1)) continue;
      edgeA.subVectors(world[1], world[0]);
      edgeB.subVectors(world[2], world[0]);
      normal.crossVectors(edgeA, edgeB).normalize();
      const lighting = 0.65 + 0.35 * Math.abs(normal.dot(lightDirection));
      const color = material?.color || new THREE.Color(0x96a1a6);
      triangles.push({
        depth: (projected[0].z + projected[1].z + projected[2].z) / 3,
        color: `rgb(${Math.round(color.r * 180 * lighting)}, ${Math.round(color.g * 195 * lighting)}, ${Math.round(color.b * 205 * lighting)})`,
        shade: (1 - lighting) * 0.65,
        opacity: material?.opacity ?? 1,
        image: material?.map?.image,
        uv: uvs ? indices.map((vertex) => [uvs.getX(vertex), material.map?.flipY === false ? uvs.getY(vertex) : 1 - uvs.getY(vertex)]) : null,
        points: projected.map((point) => [(point.x * 0.5 + 0.5) * width, (-point.y * 0.5 + 0.5) * height])
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
    context.globalAlpha = triangle.opacity;
    // Always draw geometry, even when textures are unavailable or transparent.
    context.fillStyle = triangle.color;
    context.fill();
    if (triangle.image?.complete && triangle.image.naturalWidth && triangle.uv) {
      textureTriangle(context, triangle.image, triangle.points, triangle.uv);
      context.fillStyle = `rgba(0, 0, 0, ${triangle.shade})`;
      context.fill();
    }
  }
  context.globalAlpha = 1;
  const count = String(triangles.length);
  if (canvas.dataset.triangles !== count) canvas.dataset.triangles = count;
}
