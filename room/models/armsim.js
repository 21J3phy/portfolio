import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, box, cyl, sphere, torus, tube, lathe, triangles } from './kit.js';
import { MeshoptDecoder } from '../../vendor/meshopt/meshopt_decoder.module.js';

await MeshoptDecoder.ready;

const PI = Math.PI;
const TABLE_Y = 0.76;
// MuJoCo (x forward, y left, z up) -> room (y, z, x).
const BASE_POSITION = [0, 0.76261, -0.22];
const BASE_QUATERNION = new THREE.Quaternion(-0.5, -0.5, -0.5, 0.5);
const JOINT_KEYS = ['pan', 'lift', 'elbow', 'wflex', 'wroll', 'grip'];
const TIP_LOCAL = [0, -0.0002, -0.101];
export const TIP = 'armGripperTip';
export const HOME = Object.freeze({ pan: 0, lift: -1.7, elbow: 0.2, wflex: 1.6, wroll: 0, grip: 0 });
const OBJECT_SPECS = [
  ['the red cube',     'cube',     0.027, 0.190, -0.105, '#d43832',  0.15],
  ['the blue sphere',  'sphere',   0.029, 0.275, -0.045, '#3678da',  0],
  ['the green cylinder','cylinder',0.030,0.200,  0.015, '#37a95d',  0],
  ['the yellow cube',  'cube',     0.025, 0.150,  0.105, '#e8c331', -0.22],
  ['the purple sphere','sphere',  0.024, 0.275,  0.105, '#9555bc',  0],
];
export const TARGETS = Object.freeze(OBJECT_SPECS.map(([label, shape, r, x, y, color]) =>
  Object.freeze({ label, position: Object.freeze([y, TABLE_Y + r, BASE_POSITION[2] + x]), color })));

// Materials are shared by every instance of this module.
const yellowPLA = new THREE.MeshStandardMaterial({ color: 0xeac329, roughness: 0.53, metalness: 0.025 });
yellowPLA.name = 'armsim:yellow-PLA';
const optics = new THREE.MeshStandardMaterial({ color: 0x234352, metalness: 0.45, roughness: 0.12 });
optics.name = 'armsim:coated-optics';
const tableMaterial = new THREE.MeshStandardMaterial({ color: 0xbca582, roughness: 0.82 });
tableMaterial.name = 'armsim:speckled-laminate';
const targetMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66 });
targetMaterial.name = 'armsim:colored-speckle';
const labelMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 });
labelMaterial.name = 'armsim:equipment-markings';
const geometryCache = new Map();
const rigs = new WeakMap();

function mjQuaternion(q) { return new THREE.Quaternion(q[1], q[2], q[3], q[0]).normalize(); }
function mjRotation(q) { const e = new THREE.Euler().setFromQuaternion(mjQuaternion(q)); return [e.x, e.y, e.z]; }
function mesh(geometry, material, name) {
  const m = new THREE.Mesh(geometry, material); m.name = name;
  m.castShadow = m.receiveShadow = true; return m;
}
function transformGeometry(g, position = [0, 0, 0], quaternion = new THREE.Quaternion()) {
  g.applyQuaternion(quaternion); g.translate(...position); return g;
}
function addBox(b, size, material, position, radius = 0.001, rotation) {
  b.add(box(...size, radius, 1), material, { position, rotation });
}
function rod(b, a, z, radius = 0.003, material = 'blackMetal', segments = 12) {
  const p = new THREE.Vector3(...a), end = new THREE.Vector3(...z);
  const g = cyl(radius, radius, p.distanceTo(end), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(p).normalize()));
  b.add(g, material, { position: p.add(end).multiplyScalar(0.5).toArray() });
}
function bolt(b, p, normal = [0, 1, 0], r = 0.0025, material = 'steel') {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...normal));
  b.add(cyl(r, r, 0.0018, 6).applyQuaternion(q), material, { position: p });
}
function customBatch(b, gs, material, name) {
  if (!gs.length) return;
  const merged = mergeGeometries(gs.map(g => g.index ? g.toNonIndexed() : g), false);
  b.object(mesh(merged, material, name));
}
function bytes(s) {
  const binary = atob(s), out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function robotGeometry(name) {
  if (geometryCache.has(name)) return geometryCache.get(name);
  // meshopt-compressed: n vertices of [x, y, z, pad] uint16 (quantized over lo..lo+span), c uint16 indices
  const src = ROBOT_MESHES[name], q = new Uint16Array(src.n * 4), index = new Uint16Array(src.c);
  MeshoptDecoder.decodeVertexBuffer(new Uint8Array(q.buffer), src.n, 8, bytes(src.v));
  MeshoptDecoder.decodeIndexBuffer(new Uint8Array(index.buffer), src.c, 2, bytes(src.i));
  const positions = new Float32Array(src.n * 3);
  for (let i = 0; i < src.n; i++) for (let k = 0; k < 3; k++) positions[3 * i + k] = src.lo[k] + q[4 * i + k] * src.span[k] / 65535;
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3)); g.setIndex(new THREE.BufferAttribute(index, 1));
  g = toCreasedNormals(g, PI / 5);
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[2 * i] = p.getX(i) * 35; uv[2 * i + 1] = p.getZ(i) * 35; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometryCache.set(name, g); return g;
}

function initializeTextures() {
  if (tableMaterial.map) return;
  let seed = 107;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function speckle(n, density, dark) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#ededeb'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < n * n * density; i++) {
      const v = Math.round(dark + random() * 28);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.floor(random() * n), Math.floor(random() * n), 1, 1);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  tableMaterial.map = speckle(512, 0.3, 153); tableMaterial.map.repeat.set(3, 3);
  targetMaterial.map = speckle(64, 0.15, 205);
  const bump = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const n = 4 * (y * 64 + x), v = Math.round(128 + 25 * Math.cos(y * PI / 2) + random() * 8);
    bump[n] = bump[n + 1] = bump[n + 2] = v; bump[n + 3] = 255;
  }
  const t = new THREE.DataTexture(bump, 64, 64); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  yellowPLA.bumpMap = t; yellowPLA.bumpScale = 0.000045;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#22282b'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#e9c438'; ctx.fillRect(0, 0, 12, 128);
  ctx.textBaseline = 'middle'; ctx.fillStyle = '#e2e2da'; ctx.font = '600 42px monospace';
  ctx.fillText('SO–101  /  VISION LAB', 35, 47);
  ctx.fillStyle = '#a4b4b9'; ctx.font = '24px monospace'; ctx.fillText('STEREO → TARGET → IK', 36, 96);
  ctx.fillStyle = '#ddd9d0'; ctx.fillRect(0, 128, 1024, 128);
  ctx.fillStyle = '#262b2d'; ctx.font = 'bold 53px Arial'; ctx.fillText('FEETECH', 47, 169);
  ctx.font = '600 27px monospace'; ctx.fillText('STS3215', 47, 218);
  ctx.fillStyle = '#bc3931'; ctx.fillRect(430, 144, 50, 87);
  labelMaterial.map = new THREE.CanvasTexture(c); labelMaterial.map.colorSpace = THREE.SRGBColorSpace;
  labelMaterial.map.anisotropy = 8;
}

function bench(b) {
  b.object(mesh(box(1, 0.032, 0.6, 0.004, 2), tableMaterial, 'speckledTabletop'), { position: [0, TABLE_Y - 0.016, 0] });
  // Welded 30 mm square-tube frame; adjustable steel levelling feet.
  for (const x of [-0.445, 0.445]) for (const z of [-0.245, 0.245]) {
    addBox(b, [0.03, 0.69, 0.03], 'blackMetal', [x, 0.377, z], 0.0018);
    b.add(cyl(0.008, 0.008, 0.022, 12), 'steel', { position: [x, 0.026, z] });
    b.add(cyl(0.021, 0.024, 0.019, 20), 'plasticBlack', { position: [x, 0.0095, z] });
    b.add(cyl(0.012, 0.012, 0.005, 6), 'steel', { position: [x, 0.03, z] });
    for (const dz of [-0.01, 0.01]) bolt(b, [x, 0.697, z + dz]);
  }
  for (const z of [-0.245, 0.245]) addBox(b, [0.92, 0.047, 0.028], 'blackMetal', [0, 0.704, z], 0.0015);
  for (const x of [-0.445, 0.445]) {
    addBox(b, [0.028, 0.047, 0.49], 'blackMetal', [x, 0.704, 0], 0.0015);
    addBox(b, [0.026, 0.026, 0.49], 'blackMetal', [x, 0.20, 0], 0.0015);
  }
  addBox(b, [0.89, 0.026, 0.026], 'blackMetal', [0, 0.20, -0.245], 0.0015);
  rod(b, [-0.435, 0.22, -0.248], [0.435, 0.677, -0.248], 0.005, 'steel');
  // Rear arm clamps have top straps, lower pads and threaded pressure screws.
  for (const x of [-0.049, 0.049]) {
    addBox(b, [0.013, 0.005, 0.07], 'steel', [x, 0.769, -0.273], 0.001);
    addBox(b, [0.013, 0.064, 0.008], 'steel', [x, 0.738, -0.304], 0.001);
    addBox(b, [0.013, 0.006, 0.043], 'steel', [x, 0.707, -0.286], 0.001);
    b.add(cyl(0.0035, 0.0035, 0.045, 12), 'steel', { position: [x, 0.710, -0.272] });
    b.add(cyl(0.009, 0.009, 0.004, 16), 'plasticBlack', { position: [x, 0.725, -0.272] });
    rod(b, [x - 0.017, 0.689, -0.272], [x + 0.017, 0.689, -0.272], 0.003, 'steel');
  }
  // Compact power supply and USB connection, tucked behind the robot.
  addBox(b, [0.075, 0.024, 0.047], 'plasticBlack', [0.16, 0.772, -0.243], 0.003);
  for (let i = 0; i < 8; i++) addBox(b, [0.002, 0.001, 0.025], 'blackMetal', [0.135 + i * 0.006, 0.7844, -0.243], 0);
  b.add(tube([[0.122, 0.773, -0.243], [0.095, 0.765, -0.27], [0.063, 0.764, -0.26], [0.042, 0.795, -0.24]], 0.0022, 20, 6), 'plasticBlack');
  b.add(tube([[0.19, 0.77, -0.25], [0.21, 0.768, -0.295], [0.22, 0.70, -0.31], [0.22, 0.55, -0.273], [0.20, 0.55, -0.255]], 0.0027, 20, 6), 'plasticBlack');
  const sign = new THREE.PlaneGeometry(0.19, 0.026);
  const uv = sign.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5);
  b.object(mesh(sign, labelMaterial, 'armLabNameplate'), { position: [-0.302, 0.705, 0.2595] });
}

function monitor(b) {
  const p = new THREE.Vector3(-0.323, TABLE_Y, -0.177), rotation = new THREE.Euler(0, 0.24, 0);
  const q = new THREE.Quaternion().setFromEuler(rotation);
  const pos = v => new THREE.Vector3(...v).applyQuaternion(q).add(p).toArray();
  const geom = (g, m, v) => b.add(g.applyQuaternion(q), m, { position: pos(v) });
  geom(box(0.132, 0.008, 0.105, 0.004, 2), 'blackMetal', [0, 0.004, 0.012]);
  geom(box(0.024, 0.117, 0.022, 0.003, 1), 'blackMetal', [0, 0.062, -0.014]);
  geom(box(0.306, 0.198, 0.017, 0.005, 2), 'plasticBlack', [0, 0.194, 0]);
  geom(box(0.153, 0.088, 0.010, 0.003, 1), 'plasticBlack', [0, 0.184, -0.012]);
  for (let i = 0; i < 14; i++) geom(box(0.004, 0.013, 0.002), 'blackMetal', [-0.059 + i * 0.009, 0.209, -0.018]);
  const display = mesh(new THREE.PlaneGeometry(0.288, 0.18), new THREE.MeshBasicMaterial({ color: 0x000000 }), 'armScreen');
  b.object(display, { position: pos([0, 0.196, 0.0087]), rotation: [0, 0.24, 0] });
  display.userData = { textureUV: '0..1', aspect: '16:10', purpose: 'instruction and camera image', size: [0.288, 0.18] };
  b.add(tube([pos([0.045, 0.153, -0.020]), pos([0.039, 0.08, -0.029]), pos([0.036, 0.01, -0.05]), [-0.16, 0.764, -0.28], [-0.05, 0.773, -0.26]], 0.0025, 26, 6), 'plasticBlack');
}

function stereo(b) {
  // Camera pose follows configs/cameras.yaml: across the workspace from the
  // robot, 0.45 m above it, aimed at base x=0.20 (56.3 degrees down).
  const centre = new THREE.Vector3(0, BASE_POSITION[1] + 0.45, BASE_POSITION[2] + 0.5);
  const aim = new THREE.Vector3(0, BASE_POSITION[1], BASE_POSITION[2] + 0.2);
  const forward = aim.clone().sub(centre).normalize();
  const back = forward.clone().negate(), right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
  const world = p => new THREE.Vector3(...p).applyQuaternion(q).add(centre).toArray();
  addBox(b, [0.042, 0.019, 0.05], 'blackMetal', [0.405, 0.767, 0.252], 0.003);
  addBox(b, [0.042, 0.062, 0.008], 'blackMetal', [0.405, 0.738, 0.297], 0.002);
  addBox(b, [0.042, 0.008, 0.045], 'blackMetal', [0.405, 0.708, 0.278], 0.002);
  b.add(cyl(0.004, 0.004, 0.038, 12), 'steel', { position: [0.405, 0.714, 0.275] });
  b.add(cyl(0.013, 0.013, 0.008, 16), 'plasticBlack', { position: [0.405, 0.695, 0.275] });
  rod(b, [0.405, 0.779, 0.252], [0.405, 1.273, 0.252], 0.0075, 'steel', 20);
  rod(b, [0.405, 1.262, 0.252], [0, 1.262, 0.252], 0.0065, 'steel', 20);
  rod(b, [0, 1.262, 0.252], world([0, 0.010, 0.004]), 0.005, 'blackMetal');
  for (const x of [0, 0.405]) {
    addBox(b, [0.023, 0.023, 0.023], 'blackMetal', [x, 1.262, 0.252], 0.002);
    bolt(b, [x, 1.262, 0.266], [0, 0, 1], 0.004);
  }
  b.add(box(0.104, 0.028, 0.019, 0.006, 2).applyQuaternion(q), 'plasticBlack', { position: centre.toArray() });
  b.add(box(0.099, 0.023, 0.002, 0.004, 2).applyQuaternion(q), 'blackMetal', { position: world([0, 0, -0.0096]) });
  const optical = [];
  for (const x of [-0.0375, 0.0375]) {
    const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2, 0, 0));
    b.add(cyl(0.0085, 0.0085, 0.0035, 24).applyQuaternion(q.clone().multiply(local)), 'blackMetal', { position: world([x, 0, -0.0115]) });
    optical.push(transformGeometry(cyl(0.0061, 0.0061, 0.0010, 24), world([x, 0, -0.0136]), q.clone().multiply(local)));
    b.add(torus(0.0064, 0.00055, 5, 24).applyQuaternion(q), 'steel', { position: world([x, 0, -0.014]) });
    const eye = new THREE.Object3D(); eye.name = x < 0 ? 'headLeftCamera' : 'headRightCamera';
    eye.position.fromArray(world([x, 0, -0.014])); eye.quaternion.copy(q);
    eye.userData = { baseline: 0.075, opticalAxis: '-Z', fovy: 60, width: 640, height: 480 };
    b.object(eye);
  }
  b.add(box(0.016, 0.009, 0.001, 0.001, 1).applyQuaternion(q), 'plasticBlack', { position: world([0, 0, -0.011]) });
  customBatch(b, optical, optics, 'headCameraLenses');
  b.add(tube([[0.049, centre.y, centre.z], [0.072, 1.243, 0.253], [0.21, 1.25, 0.252], [0.395, 1.25, 0.252], [0.414, 1.20, 0.252], [0.414, 0.79, 0.252], [0.39, 0.765, 0.10], [0.25, 0.765, -0.23], [0.19, 0.773, -0.24]], 0.002, 48, 6), 'plasticBlack');
  for (const y of [0.87, 1.02, 1.17]) b.add(torus(0.0082, 0.001, 5, 16), 'plasticBlack', { position: [0.405, y, 0.252], rotation: [PI / 2, 0, 0] });
}

function targets(b) {
  const gs = [];
  OBJECT_SPECS.forEach(([label, shape, radius, x, y, color, yaw], i) => {
    let g = shape === 'cube' ? box(radius * 2, radius * 2, radius * 2, 0.0016, 2) :
      shape === 'sphere' ? sphere(radius, 28, 18) : lathe([
        [0, -radius], [radius - 0.0012, -radius], [radius - 0.00035, -radius + 0.00035],
        [radius, -radius + 0.0012], [radius, radius - 0.0012],
        [radius - 0.00035, radius - 0.00035], [radius - 0.0012, radius], [0, radius],
      ], 40);
    if (g.index) g = g.toNonIndexed();
    if (shape === 'cylinder') {
      // Lathe's default V is profile-index based: restore a uniform physical
      // texel scale along the long wall and planar UVs on the end faces.
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let k = 0; k < p.count; k++) {
        if (Math.abs(n.getY(k)) > 0.7) uv.setXY(k, p.getX(k) / (2 * radius) + 0.5, p.getZ(k) / (2 * radius) + 0.5);
        else uv.setY(k, p.getY(k) / (2 * radius) + 0.5);
      }
    }
    g.rotateY(yaw); g.translate(...TARGETS[i].position);
    const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < colors.length; k += 3) { colors[k] = c.r; colors[k + 1] = c.g; colors[k + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); gs.push(g);
    const marker = new THREE.Object3D(); marker.name = 'target_' + shape + '_' + i;
    marker.position.fromArray(TARGETS[i].position); marker.userData = { ...TARGETS[i], shape, size: radius, baseXY: [x, y] };
    b.object(marker);
  });
  customBatch(b, gs, targetMaterial, 'armTargets');
}

function wristCamera(b) {
  const q = mjQuaternion([0.958280, -0.285792, -0.001556, 0.004547]);
  b.add(box(0.038, 0.038, 0.001, 0.0006, 1).applyQuaternion(q), 'plasticBlack', { position: [-0.00101, 0.05958, -0.04515] });
  b.add(cyl(0.007, 0.007, 0.0095, 24).applyQuaternion(q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2, 0, 0)))), 'plasticBlack', { position: [-0.00298, 0.05669, -0.04954] });
  const lens = new THREE.CircleGeometry(0.0054, 24); lens.rotateY(PI); lens.applyQuaternion(q);
  const front = new THREE.Vector3(0, 0, -0.00485).applyQuaternion(q).add(new THREE.Vector3(-0.00298, 0.05669, -0.04954));
  b.object(mesh(lens, optics, 'wristCameraLens'), { position: front.toArray() });
  for (const x of [-0.016, 0.016]) for (const y of [-0.016, 0.016]) {
    const p = new THREE.Vector3(x, y, -0.0008).applyQuaternion(q).add(new THREE.Vector3(-0.00101, 0.05958, -0.04515));
    bolt(b, p.toArray(), new THREE.Vector3(0, 0, -1).applyQuaternion(q).toArray(), 0.0017, 'plasticBlack');
  }
  b.add(tube([[0.015, 0.055, -0.045], [0.024, 0.044, -0.030], [0.026, 0.012, -0.016], [0.015, 0, -0.008]], 0.0018, 18, 6), 'plasticBlack');
  const camera = new THREE.Object3D(); camera.name = 'wristCamera';
  camera.position.set(-0.00296, 0.05436, -0.05310); camera.quaternion.copy(q);
  camera.userData = { opticalAxis: '-Z', fovy: 61, simulationFovy: 70, width: 320, height: 240 }; b.object(camera);
}

function arm(b) {
  let body = b.part('so101_base', { position: BASE_POSITION });
  const baseEuler = new THREE.Euler().setFromQuaternion(BASE_QUATERNION);
  body.transform.rotation = [baseEuler.x, baseEuler.y, baseEuler.z];
  ROBOT_BODIES.forEach((spec, i) => {
    if (i) {
      const frame = body.part(spec.name + ':frame', { position: spec.position, rotation: mjRotation(spec.quaternion) });
      body = frame.part(spec.name);
    }
    const yellow = [];
    for (const [name, p, q] of spec.meshes) {
      const g = transformGeometry(robotGeometry(name).clone(), p, mjQuaternion(q));
      if (name.startsWith('sts3215')) {
        body.add(g, 'plasticBlack');
        // Three readable servo labels, batched per moving assembly. The other
        // servos face into their brackets; their moulded housings stay visible.
        if (['shoulder_pan', 'shoulder_lift', 'wrist_roll'].includes(spec.name)) {
          const decal = new THREE.PlaneGeometry(0.026, 0.011);
          const uv = decal.attributes.uv;
          for (let k = 0; k < uv.count; k++) { uv.setX(k, uv.getX(k) * 0.5); uv.setY(k, uv.getY(k) * 0.5); }
          decal.rotateX(PI / 2); decal.translate(-0.002, -0.01255, -0.002);
          transformGeometry(decal, p, mjQuaternion(q));
          body.object(mesh(decal, labelMaterial, spec.name + ':servoLabel'));
        }
      }
      else yellow.push(g);
    }
    customBatch(body, yellow, yellowPLA, spec.name + ':printed');
    if (['shoulder_lift', 'elbow_flex'].includes(spec.name)) {
      body.add(tube([[-0.014, -0.006, 0.035], [-0.04, -0.009, 0.039],
        [-0.077, -0.010, 0.039], [-0.095, -0.007, 0.034]], 0.0012, 20, 6), 'plasticBlack');
    }
    if (spec.name === 'wrist_roll') {
      wristCamera(body);
      const tip = new THREE.Object3D(); tip.name = TIP; tip.position.fromArray(TIP_LOCAL);
      tip.userData = { definition: 'midpoint of closed jaw tips; MuJoCo gripper_tip', approachAxis: '-Z', jawReferenceRadians: 0 };
      body.object(tip);
    }
  });
}

/** Set MuJoCo qpos angles (radians). Missing joints retain their current angle.
 * Each named joint rotates about its local +Z, after its exact fixed MJCF frame.
 * Values outside the source ranges clamp; non-finite values throw.
 */
export function setJoints(group, angles = {}) {
  const rig = getRig(group);
  for (const [i, key] of JOINT_KEYS.entries()) {
    if (angles[key] === undefined) continue;
    if (!Number.isFinite(angles[key])) throw new TypeError('armsim: non-finite ' + key);
  }
  for (const [i, key] of JOINT_KEYS.entries()) {
    if (angles[key] === undefined) continue;
    const [lo, hi] = ROBOT_BODIES[i + 1].range;
    rig.joints[i].rotation.set(0, 0, THREE.MathUtils.clamp(angles[key], lo, hi));
  }
  group.updateMatrixWorld(true); return group;
}
function getRig(group) {
  let rig = rigs.get(group);
  if (!rig) {
    const joints = ROBOT_BODIES.slice(1).map(s => group.getObjectByName(s.name));
    const base = group.getObjectByName('so101_base');
    if (!base || joints.some(j => !j)) throw new TypeError('armsim: expected a create() group');
    rig = { joints, base }; rigs.set(group, rig);
  }
  return rig;
}

/** Analytic position IK from the actual MJCF link vectors, not nominal lengths.
 * targetLocal is in the armsim group's coordinates; hover is along group +Y.
 * Tries vertical first, then finds the steepest feasible tilt at the joint limits.
 * Leaves the model untouched. Throws RangeError for unreachable targets.
 * wrist roll stays at qpos zero; axial roll does not change approach direction.
 */
export function solveIK(group, targetLocal, hover = 0.05) {
  if (!targetLocal || targetLocal.length !== 3 || !Array.from(targetLocal).every(Number.isFinite) || !Number.isFinite(hover)) {
    throw new TypeError('armsim: finite target [x,y,z] and hover required');
  }
  const { base } = getRig(group);
  base.updateMatrix();
  const p = new THREE.Vector3(...targetLocal).add(new THREE.Vector3(0, hover, 0)).applyMatrix4(base.matrix.clone().invert());
  const upper = ROBOT_BODIES[3].position, lower = ROBOT_BODIES[4].position;
  const a = Math.hypot(upper[0], upper[1]), b = Math.hypot(lower[0], lower[1]);
  const alpha = Math.atan2(-upper[1], -upper[0]), beta = Math.atan2(lower[1], -lower[0]);
  const distal = new THREE.Vector3(...TIP_LOCAL).applyQuaternion(mjQuaternion(ROBOT_BODIES[5].quaternion)).add(new THREE.Vector3(...ROBOT_BODIES[5].position));
  const shoulder = ROBOT_BODIES[1].position, liftOffset = ROBOT_BODIES[2].position;
  const lateral = liftOffset[1] + distal.z;
  const dx = p.x - shoulder[0], dy = p.y, radius2 = dx * dx + dy * dy - lateral * lateral;
  if (radius2 <= 0) throw new RangeError('armsim: target is inside the pan-axis offset');
  const radial = Math.sqrt(radius2), z = p.z - (shoulder[2] - liftOffset[2]);
  let pan = Math.atan2(lateral, radial) - Math.atan2(dy, dx);
  pan = Math.atan2(Math.sin(pan), Math.cos(pan));
  const ranges = ROBOT_BODIES.slice(1, 6).map(s => s.range);
  const within = (v, i) => v >= ranges[i][0] - 1e-10 && v <= ranges[i][1] + 1e-10;
  if (!within(pan, 0)) throw new RangeError('armsim: target exceeds shoulder_pan range');
  function atPitch(pitch) {
    const s = Math.sin(pitch), c = Math.cos(pitch);
    const r = radial + liftOffset[0] + distal.x * s + distal.y * c;
    const h = z + distal.x * c - distal.y * s;
    const cosDelta = (r * r + h * h - a * a - b * b) / (2 * a * b);
    if (cosDelta < -1 - 1e-12 || cosDelta > 1 + 1e-12) return null;
    const angle = Math.acos(THREE.MathUtils.clamp(cosDelta, -1, 1));
    for (const delta of [-angle, angle]) {
      const theta = Math.atan2(h, r) - Math.atan2(b * Math.sin(delta), a + b * Math.cos(delta));
      const lift = PI / 2 - alpha - theta, elbow = alpha + beta - PI / 2 - delta;
      const wflex = pitch - lift - elbow;
      if (within(lift, 1) && within(elbow, 2) && within(wflex, 3)) return { pan, lift, elbow, wflex, wroll: 0 };
    }
    return null;
  }
  const down = atPitch(PI / 2); if (down) return down;
  // Half-degree scan brackets the first feasible approach on both sides of
  // vertical. Refine both branches and choose the smaller departure angle.
  const step = PI / 360;
  for (let angle = step; angle <= PI / 2 + 1e-10; angle += step) {
    const candidates = [];
    for (const direction of [-1, 1]) {
      let answer = atPitch(PI / 2 + direction * angle);
      if (!answer) continue;
      let lo = angle - step, hi = angle;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2, q = atPitch(PI / 2 + direction * mid);
        if (q) { hi = mid; answer = q; } else lo = mid;
      }
      candidates.push({ angle: hi, answer });
    }
    if (candidates.length) return candidates.sort((a, b) => a.angle - b.angle)[0].answer;
  }
  throw new RangeError('armsim: target is unreachable with a downward approach within the SO-101 joint ranges');
}

export default function create() {
  initializeTextures();
  const b = new Builder('armsim');
  bench(b); monitor(b); stereo(b); targets(b); arm(b);
  const group = b.build();
  group.userData = {
    title: 'Robot arm simulation · SO-101', units: 'metres', front: '+Z',
    description: 'Stereo and wrist vision, language-directed target localization, and SO-101 inverse kinematics.',
    footprint: [1, 0.6], tabletopHeight: TABLE_Y, baseFrameMap: '(x,y,z) -> (y,z,x) + basePosition',
    basePosition: [...BASE_POSITION], targets: TARGETS, tip: TIP,
    geometrySource: 'The Robot Studio / I2RT Robotics SO101, MuJoCo Menagerie, Apache-2.0; decimated embedded meshes',
    sourceLicense: 'Apache-2.0 (full text in this module)',
  };
  ROBOT_BODIES.slice(1).forEach((spec, i) => {
    const joint = group.getObjectByName(spec.name);
    joint.userData = { motion: 'rotation', axis: 'Z', jointAxis: [0, 0, 1], range: [...spec.range],
      space: 'local after fixed MJCF frame', pivot: [0, 0, 0], parentBodyOffset: [...spec.position],
      parentBodyQuaternionWXYZ: [...spec.quaternion], qposKey: JOINT_KEYS[i], zero: 'MuJoCo qpos = 0' };
  });
  group.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  setJoints(group, HOME);
  group.userData.triangles = triangles(group);
  let draws = 0; group.traverse(o => { if (o.isMesh) draws++; }); group.userData.drawCalls = draws;
  return group;
}

// SO-101 tabletop research scene. Units: metres, +Y up, front +Z.
// Embedded robot geometry derived from The Robot Studio / I2RT Robotics
// SO101 MJCF assets, Apache-2.0, via MuJoCo Menagerie robotstudio_so101.
// Modified 2026-10-27: planar dissolution, quadric decimation (then simplified to
// ~60% with meshoptimizer), 12-bit vertex quantization, meshopt compression,
// creased shading, and per-link material batching.
// Original body transforms, joint axes and limits are retained verbatim.
/*
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

*/
const ROBOT_BODIES = [{"name":"so101_base","position":[0.0,0.0,0.0],"quaternion":[1.0,0.0,0.0,0.0],"range":null,"meshes":[["base_motor_holder_so101_v1",[-0.006365,-9.9e-05,-0.0024],[1.0,1.0,1.0,1.0]],["base_so101_v2",[-0.006365,0.0,-0.0024],[1.0,1.0,1.0,1.0]],["sts3215_03a_v1",[0.0263353,0.0,0.0437],[1.0,0.0,0.0,0.0]],["waveshare_mounting_plate_so101_v2",[-0.0309827,-0.000199,0.0474],[1.0,1.0,1.0,1.0]]]},{"name":"shoulder_pan","position":[0.0388353,0.0,0.0624],"quaternion":[0.0,0.0,-1.0,0.0],"range":[-1.91986,1.91986],"meshes":[["sts3215_03a_v1",[-0.030399,0.000422,-0.0417],[1.0,1.0,1.0,-1.0]],["motor_holder_so101_base_v1",[-0.067599,-0.0001778,0.01585],[1.0,1.0,-1.0,1.0]],["rotation_pitch_so101_v1",[0.012201,2.2e-05,0.0464],[1.0,-1.0,0.0,0.0]]]},{"name":"shoulder_lift","position":[-0.0303992,-0.0182778,-0.0542],"quaternion":[1.0,-1.0,-1.0,-1.0],"range":[-1.7453293,1.7453293],"meshes":[["sts3215_03a_v1",[-0.11257,-0.0155,0.0187],[0.0,-1.0,1.0,0.0]],["upper_arm_so101_v1",[-0.065085,0.012,0.0182],[0.0,1.0,0.0,0.0]]]},{"name":"elbow_flex","position":[-0.11257,-0.028,0.0],"quaternion":[1.0,0.0,0.0,1.0],"range":[-1.69,1.69],"meshes":[["under_arm_so101_v1",[-0.06485,-0.032,0.0182],[0.0,1.0,0.0,0.0]],["motor_holder_so101_wrist_v1",[-0.06485,-0.032,0.018],[0.0,-1.0,0.0,0.0]],["sts3215_03a_v1",[-0.1224,0.0052,0.0187],[0.0,0.0,1.0,0.0]]]},{"name":"wrist_flex","position":[-0.1349,0.0052,0.0],"quaternion":[1.0,0.0,0.0,-1.0],"range":[-1.658063,1.658063],"meshes":[["sts3215_03a_no_horn_v1",[0.0,-0.0424,0.0306],[1.0,1.0,1.0,-1.0]],["wrist_roll_pitch_so101_v2",[0.0,-0.028,0.0181],[1.0,-1.0,-1.0,-1.0]]]},{"name":"wrist_roll","position":[5.55112e-17,-0.0611,0.0181],"quaternion":[0.0172091,-0.0172091,0.706897,0.706897],"range":[-2.7438473,2.8412063],"meshes":[["sts3215_03a_v1",[0.0077,0.0001,-0.0234],[1.0,-1.0,0.0,0.0]],["wrist_roll_follower_so101_v1",[0.0,-0.000218,0.00095],[0.0,1.0,0.0,0.0]],["wrist_roll_follower_so101_camera_mount",[0.0,-0.000218,0.00095],[0.0,1.0,0.0,0.0]]]},{"name":"gripper","position":[0.0202,0.0188,-0.0234],"quaternion":[1.0,1.0,0.0,0.0],"range":[-0.174533,1.7453292],"meshes":[["moving_jaw_so101_v1",[0.0,0.0,0.0189],[1.0,0.0,0.0,0.0]]]}];
const ROBOT_MESHES = {"base_so101_v2":{"lo":[-0.05532960221171379,-0.0003550085530150682,-0.01604883372783661],"span":[0.11064063385128975,0.07237207473372109,0.08702582120895386],"n":739,"c":5208,"v":"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","i":"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"},"base_motor_holder_so101_v1":{"lo":[-0.022350026294589043,0.038104649633169174,-0.020800000056624413],"span":[0.04764731414616108,0.0313895009458065,0.0801821444183588],"n":656,"c":3960,"v":"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","i":"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"},"sts3215_03a_v1":{"lo":[-0.022682663053274155,-0.01243602205067873,-0.01940000057220459],"span":[0.04553133063018322,0.024875995703041553,0.03965035453438759],"n":393,"c":2442,"v":"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","i":"4fAAAAMwBDPQAXAAAhAABTATIAAIEAcQAAgwEwACMBAXABAaABwgFQQAFCAVJBX7IAAQEBAVIAAEEAAHEA8QDxAAAAAPMBAQFiADMAAFEBAAGggwFCogFgAQGiAQEAAQFQAfAB8AHQAdIAAHMDARIBIsIBUHBgACMA8dIB8AGCAZIBooGv4nEA8TDRAULxAAAAANEA0wEBYAGAAQECARIAAQAAAIEAowABcVKAAABBAPEBAFMBUAEBgDABAHAAM3Cw8ABTAQHQ8QLS8QDxMXEAkQAAwQAA8wEBUAFyAQEBogAxAGMAczOBAUAB8NAAQQDx0QDzAWAAAADwYQHw4AHiAADx8UEAYwFQAPAz4/AAwaFBIQEiAQFCAAAAgfEA8OPxAQEBgAGg8AAz8NABAdDwAfDQAQHQAQAAQwFAAfIBEkGE0AChAAMAEwAjU/DxAfIA8fDg8fDxAfAB4vBR0CHw8FE1//IA0QEBUAABAQIAAABxAJ/iAAAAQQEAYwFAAWABgAGgAVAAADEAAAAAAJEAAMEBAQADAQFwAAAAQwGQgwFC8gHyAWGiUABRAFHxAADTAwESAPEAAQEBUAABkQCTAZIAsQCx8DPj8ABRQSEBIvLw8PAAQfEBAUABAfDwAfDwAdAAAPAAgQAA83FhAUJh8GMAoUEAQQDzAwESANEA0wARAPEBMAEBkKAAAcIyAEPzAHEAkwFAAUDwADFBAADx8QAA0fDQAPFgkPGw4QBRQZGBAHHx8fHhUPHi/wEAAABTAQFCAQFgAQAjowABIgBhEACTAQFgAfAAMUEAYfEA0QAA//EAgQBxAGMAAIEAgwEAADEQAVBgAQGg8PPx8PHw8QHyAADzABMBYgADAwESAABxAJEA8QAA8QADABMAIUHncwGAoADwM+Hw8fDxAQHwAQHQAdIAUQCBAACz8AHwAAMAACEAAHEAoQDxAADx0QDxkOGwAfLyABPzAPHx8PMA8QDRAPEA8fHx4aEBcp/kABMAI6Av4AHx8gHwAFGBAIEBIgDxIPHhAXARj+EBAULhUjLxQPDxAQIBEuEgX+HwAEPwUU/g0/EBUvDTAFGBMkAw9KCSwEjy0mA0YICgQEEhQKGQQJODU8AzUtA14fLxFRBYICgwKCAg8MCQgDERkeJf5YtQEh4gEWFwwuAwgPDwQsLQQOGQNST04PLgMpAzc4OwZcBiYlNgoJGALNA0CXAdQEzQSeBIUEtAS7BBAKnAK0AqcCpgKfAp4CDxlEswIEygLHAsYCwwIRkgLRA9ADBwtcFIr/SQUwNzYlIg8cCQYD8OUEBA8PC5QClQIAdodWZ3iphmWJaJgBaQAA"},"sts3215_03a_no_horn_v1":{"lo":[-0.022684460505843163,-0.012436007149517536,-0.01940000057220459],"span":[0.04538446292281151,0.02487598080188036,0.039662258699536324],"n":327,"c":1998,"v":"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","i":"4fAgEAAQFgAVABAYABAYABAYABAZIAAEEAAHMAAAAAswMBASABAWAA85MBogDRAQFCAABDAHDzAFMBAWBwATLwMbABgAFwAQHw8fLwAeDx8gFwYAAAAACBAPHRANMDAAFCANEA8QDR8QEBYAEBAEMBwgBwY/DjAADxANEBAAAxANEg8eEBYgFy4eEAAPEAAOEAAUBjAUDx4XAA8wFQAfFigaLw0AAAYfHR8UDY8AFy8vDT8cAA4QHy8fEAMU/wAPPzAgAT0AAz8+BzEQAAAFEAAAAAYwEBQgEBYAGAAAAxAQADABMAI2NBAJMBgAHw0AEB0gEBATAB0AEB8AHgAfIBEmIB4AHwAAEBMgFCUgHgAeAB4AEB8AEB4AEB4AEB4gAAYwMAAKMAAMEA8QDRANEA05CzAWKSAwESASKxATKhP0IA0QABAUABAXABAfABAAAAUQABAQFAAQEBgBEBogGyQgHwAfAB8OABAfIAYQAAALMAAPMAEwFiADMBgAAjowBj8PPxAfDQAQHQAQHwAdAAAFODAHMAg6CNAVLCAfIBAgAA8wAAIQEAAFMBACF1UwDTAAAhASIBMvIBgPDQAfIBASAB8AHgAQECARABAWAB8AEB8AHgAQHiAQIBEgEiglBFogCxAPEA0QAA0QDRAADRIADxANEBQtIBkLDwAEEx0QEwFvHwAPHxAOnwATIAQR/wAPMB8PDgAeIAgwEAAQEBcAFyAgATAeDwAQHi8AHwAABzAIMzsuDBAPMAE/AAM/AB4AHwAQAz4AHg8AHg8AHgAeIBEnLDogCx/wEAAEMBQPFgAQEBAWIAMQBTAGMzAIMBUPHAsNEA0QHyAPEwIN/i0gHA8cLwQTH38wADABPwIV/h0QFC0fEBclFxgUFRQMDxIFGUAFBj0DEjoEBAc2HQYAKh8EDgkInxotJDMFWgwEEgQkJgANAwNOCwgJGFMrngEtUAMDA7EB6gEFLPsB+gH/AfwBAK8lzwHOAcsBCDh+BGAVBgQEFAT5ARKEAo8CG3hu5wF8fQ8mIgB2h1ZneKmGZYlomAFpAAA="},"motor_holder_so101_base_v1":{"lo":[-0.05385517328977585,-0.05509328842163086,-0.028879862278699875],"span":[0.028005272150039673,0.038093287497758865,0.05508001334965229],"n":620,"c":3957,"v":"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","i":"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"},"rotation_pitch_so101_v1":{"lo":[-0.05987685173749924,0.00016947420954238623,-0.023000001907348633],"span":[0.059926283629465615,0.08423052397847641,0.046000003814697266],"n":606,"c":3852,"v":"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","i":"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"},"upper_arm_so101_v1":{"lo":[-0.06508498638868332,-1.6566609195578508e-16,-0.03558764606714249],"span":[0.14219891279935837,0.024511436000466513,0.06732267141342163],"n":752,"c":4860,"v":"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","i":"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"},"under_arm_so101_v1":{"lo":[-0.053873371332883835,-0.044051382690668106,-0.034187640994787216],"span":[0.13075221702456474,0.024051383137702942,0.06441659107804298],"n":772,"c":4860,"v":"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","i":"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"},"motor_holder_so101_wrist_v1":{"lo":[-0.05385921150445938,-0.053916238248348236,-0.030193304643034935],"span":[0.02800931967794895,0.03691623918712139,0.05639351159334183],"n":440,"c":2880,"v":"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","i":"4fAQAAAFMAAQEAAAAAUbGSAfIAoQAjYHMAYwFSAQBBYrAB8AHyAgEB0AHyAQEAoHMAkwEBcAFwAdIAYQDxAQEBUAGCAgAAYAAzYwABAEGiUABxAKMBAHFhAFMBULAAADEBcGAB8gBxAADx8fEBAQFwAPDz8QEB8ADw8ABj8PAA8KOBcvAA8fEAcWHBAUBQ9vEQ8LPz8HH38gFy8vHwAPHxANGAY3HxUG8AAAAAAFMAYzBAAQFwAQEBAcAAAfJBAABzAQAjUwABIHABcsBTAPEAANMAAAAzAQFCAgARAABRAACDATIBAQLx8vBxAAMBAQHgAAEBAUIAAEMBAgEAAQHBAWKSAWIAAMEAwQCj8TLwAPPzAIAAAwDw8DEB4HHx/+DwAAEBAADwQwPQAACxAPEAUUGRggBD8/DwYfDwYQHx4gAAAMHxAOEAAQEBAWABAaIBUENhAcABAQAAAABRAACDAAEAAIFyAaJRAPEA8QEBAWAAAABB8PPw8wFgsKMBgAFAIAAj8PHw8aDx8PzzAJPw8fLw8fDxAfBwAQGA8HAAM2DwQfBx8JPx8AABAfAAMQAAgQAA8QAA8wAAgAAzAbIAAAEiAIEA4fHi8fLw8QDz8wDzATAB8AEB0gBRAAAAkQDBAAECAQEiAAAA8fEA4QDx8ULSAPMBsAAAQQAAUQDzAUIAAABBAOEA8QDjAQFwAZABsAHwAdAAAFHwcfCRodDBAdLy8wDxAWABQLHwtPAxAfJi8AHQAQEAAQFQAdABAfDQAQHQ8ABBAIMBMgCjAVIA8PEA0QAA0QAAANEA0/Dj8QGAkAEB8PHy8PDw8IHwAADBAPMBAQFiAABBAHEAcwAAAKEA8QEy8QDx8QFS8QDzAZIAIQEi0QDR8fDw8ffx8PDxl/Hw8fDxAKHx4QDxAVLy8ZIAIfEA8/FS0AAzAdAB8gBRAACh8SDhAQIBAAGyAGMB8gESAKMAswABAMDzAPEA8QFCwfEAAACR8MEA8QAA8QDhAPMBYgFwAZCw8fLwAFPwYdChAACx8QDxAPHhAADxAADhAOMAACEAAOMBAVABcAEB8AAz0AHSAHEAkQCxASLyAVBwIQFyAYIx0fEAAPEA4QEBUAAAMQAAYeEAAPHx8QAA4cDw8QEB8AAAAFMBAUIAAEEAoQDDAPNAAWABgMAAADMAAFEAASKSAKNDkQDjABNwACOjAgAT8PAAQ9DwY+Ov4gDzABEAAOEAAPHhAADhAOEA4fEA8QFS4QDhAOHh4fEBcvHhkLDhAfDQ0PBT8bCgAMAxIWKgYTGwcEB1RzJgMHUAgFCxBvLggFBAAYDxobBgxOEgMLDkgEDAMTBCIfch4jNgYXCxwECRQmDXcQKl/MASksIwNjYgAdCg4hYncHBnZ5cncFdKsBUiZ7IEtOWhp5jgGTAeIBSyLLAQYM6gEuiQEDngGPAVhZoAEZBQlAS1ylAwPGA6cEpgSbBGAVFw82SwNUygMlAx5jA2prChFSPRGwAa0BqgGnAXClBCyoBBsKDgMDLAQEBgvXAfABRSrZAQQFEYYCBgQEIhArgQLxAdQBsAI2MzIxTh0r/0ABBA0+BLMDC8IDuwMEAHaHVmd4qYZliWiYAWkAAA=="},"wrist_roll_pitch_so101_v2":{"lo":[-0.027121325954794884,-0.019983965903520584,-0.03782838582992554],"span":[0.06233401782810688,0.03563777543604374,0.07788298651576042],"n":810,"c":5040,"v":"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","i":"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"},"wrist_roll_follower_so101_v1":{"lo":[-0.035210128873586655,-0.024218769744038582,-0.00005035622962168418],"span":[0.06520910561084747,0.052000558003783226,0.10541361345894984],"n":796,"c":5037,"v":"oP////8AvwAfwKBgfx9f4CCgn19/gOCAYCC/n3+AAH/AP98/H3/gv6AfAH+g/yBfgD9AP9+goF8fn6BgP4D/PyC/f79fn6C/IH8/v0DfIB+gwKB/P19gP7//gCAgvwB/4J8AYP/f3+D/398/359/wGAA/4AA34A/gAA/AD9/4B9/QCCgAJ+/AN8fXwD//2AA/wDg/1/AwF9gH/9gAGCfQKBAoCD/wP8gAODf4L8fX9+gP1//f19AIOC/4GC/f39g/z9f4D9AwKAg4D8gIH9gAL/g/8CAoL9/v+BgYB/fgN9/n4AfX79gQCC/f/+fPz9Avx8/AEDA//9f3/+fICBA37//gAAA7m7rqwoLGv/R//M/FBMmERURCxYXERAcEhAMAxEWDgAGCahRYDH7DM/PE4AR4DY1NgoJCSsrO1RXUBr8Af9sYBgF+/+fEBoPF/BZOQMBgnlCIgAjJhoBLAAPEf/QFhMyqP//Sz06SkEW/8/TPC4wUHkFgw8DHoYFSjYSGzsMABENAwAXEgYGAzIIJv/89N//rDoiEhUTO/8P9AVb9fWkOjdgEmkRBg8RCh0DPE4cFAgDDwQJAA8HBgEVQQBMCUEATk0lDQX6L/7L0aDGvREVFPAf+/FGz/ezERQRHhYV+8tv9TBVJu4vFiP///3/AIAAP9+AoMCfAH+/X7+fv1/gn0Af/78AIP9AwECff59fH/9AQP+AP78AQD8AYB9AgCCAAKDAv58AgABgQD9A/yDfvyCAv18gfx+fYMA/AD8gYOA/P2D/34AA4F8fAOCAP7//gD/ff+BfAKBAAH+AH8AAAL/gH7/f/x/AoKBAn8D//A/D35/fv2Df/19g//8A//8AAP8goL+fX//AwGDfgIDAP+D/gF8ggICfYAD/X58gP6Cg3+A/oD/AfyBfX3+AgACA4MD/oEDgf3/g4KCfv1/fX6DAX0C/n8AggD8/f2B/ACBfnx+fAP9/gD+gAODA//9/X+BgAJ8f33+AnyB//qe5ug0NCf+QX48VGBofGwAPAwYFBAgkABEPFhYMJCoHIRkLIiIWDBYAAAwReLAvEWhCQRIEGhIAU1NCRwkCBQgIECAY3x4ZzhMdCwsBBEw/3/cPEA6qXhQKEygbMhL3nfuW/bMP8EH7ED9A8Yr/Nm/w9485LCgTJhMn/zwPwwkpIRADKisHAzgP8A8E5v/78zc4NxwSGRMSADQPGgDdBBYIqTEnFiAo9f8v+N/8ysMuHhAYWg8TLxWDgABdL8QQe28I8t4eQD/fFyUZIRYrLhcXAwkAEgADGRkDEhA97b//pv4/dBodEhMP1f/fVz/AMA+foJ+gn7/AwMwMw7/f4N/gwMM/PPO/3+Df4ODf36BAX38AX7/AAABgIF//wD/A4EBAvwBgH2Cfv5+AoKA/Px9gIEDggD8/YGCgoB8gHwD/YKDg4CDfH4AgQAAAP7+fv6BgoKAg3+DA/x8AYJ8/AOAAv+C/QB8AX0DfYCCgf0CAAKCgYL+f/z/f36Af3z8f38//PDAfIN+ffx+A/6BAP0AAP0A/Hz9gH4AgAH/gICAfgP8AH/9fn8CAIB+/4N/MAwPM4MCg3+CfDDMwMz9AoN/gnwwA8MCgn6DfVmaqVg3t4AANAAA0wMwMwwMcGxwbBMM/PMIDHBscGwQDHEPwyocXAwQYBjRRICBAIiMANQC88wcEFRAPHAchIGIPALBmjt43P/MFBiYDHx4sFQ0lAP8HCAVdfzInIE1iJXDWAxYkEEABN0YCIAkAqQqaAwUXXClYaAJ1EFEQ/xsczAMDzBsEDh4dDQwzMDMsKw4eHQ0MAPDADg0OHgAAAAAAAAAA////fZ+gwP9fn78AICDfoKBgH58gAJ+gf+B/f7//PwCAwL+ff8Afvx8fQKCAv1+gv0BgQKBf4GA/QJ+AX59gX6AgAL+f33/fH38AQJ8fH19/nwAAPwCgQL8gfwBgf58AYCDfwF8AYF8AX0AAPwDA/2DgP7+/IKCfXz8/AABfoJ8fAN+fP2BAAL8/f0Ag/wAfYF9AAN8AAJ8AvyDfP2Cff0CAf8AgH2DA4N8gf0A/P/+fIN8AgGDfIGBfYL8fH2D/X39/gM//PDOgP19fYGCAfz+gn6CfAKCfIGDgn99/n38AgCA/IJ+AIF8gXz/AAKCf//8ADMwDA5+gn6Cfuqqrbb+AhC/z94X4GyIVQBzXMNELuQX/nxQaIwsNIQcWMCaDDhAHFSQCFhT/tTAcVgosBRARWwhjBvcDdsAQ8P9j8PCgqP8QGxBHNhAS8Hj58BD/9PRvPEoPNxQg3//yUZQs4L8VQyY1JhY0CAIkBSEzFRosNwkKBQDwDw8jH2p/CSkeQxIRgGQWY80xn/8WEGTP0wAJLoRxD3cU2v/wMyEMB1FDCweenZ6dAJ6dAAgMUDSFCQckA3ho909RHw//8GcllI+QkZIMzAMDnZ6dnp3//1f/P4BAQGAgwECAn18gQH/fvwDAPz+fIEBA/wDA/78goACfv9/foIBAQIAg/5+fACBg4IAggN8/gIC/3x9/P2Ag/4Bg4N+/QF8/gGAg4MBfgAAAACC/4CC/AIB/n4DAn5+fQIAAPx9/oOAA3wDf4CAfQABgID9/ID9AX39gAP//gF+gYOC/IB+/YJ8//wC/AADADP/8D7//wOC/wF9/v8D/Aw8AHyDf4EA/QA8wAPA/QD9AP+DAYP+AgAB/wACg/z/ff5+gf2B/IIAfHwCfP79/QAB/f2CfgMCg4H+/PyDAoH/g34D/n59gYCAgP6DfwF+g/+C+pVar//CrDJD/p/8XGigPEDZrIRIYABIOARQEDAALGREpVgQDBRsnHQEbjB4makkjDzH8SOr1P3nUDBoYEX/P87wKCgoQFBoPIQsaKQ/8z6MNEwgDGkIPFIDx97n7DA/4/yEaREMWJhuQABKYUfD/9S8sKyjxYEPQ/PDwDxQXIRMUDP/sDxPGyywKCiUuBb8DDwApKCcVFhUPMADwFhUWFRYyAS80BDcTAAcVexMPEBwK8KBP+AD/8+gQTBYRFw94kfXwuikRShFJcwwLFPUstvAlGlVV//8DDDDA4J+g3/MMPAM/QODfQD/gMwA8MN8/QD9ADDDAPODf4N/gwzPMw5+g3z9A4J+gPD88/N9AP0BgX7/f4N8/8Mz8H78fP7/f4N8fIAzM/89g4OCgoN9g3z9/4B8A4ADfAL+gH3+/YF9gAKCfAL8AYAAgQKBAQF+foB+AH/8goN9fgN+/oL//4IB//2Dgn5+gQP+/34Bfnx/fX1+ff39AgD8A3wA/P9/foJ8/XwB/HwAAAH+Af7+/nyBfAAD/vyBAgAB//4BAnx+/X39A4P9gwL9AoCBgXwCAHx9VVqu1AwwwwB0NDh7zDDwDCgkdHissHTMAPDAeCgkKCQwwwDwdHh0eHdAODwqQ8NAOHh08Pzz8HissKxgXAxwbHD/AzPwPHAUFHh0GBhIPP/DOCkpBUk9MBAoIIVUAHQAeAFYoJUtgEA8DAP8PBgExKVAKWVoQEEJ0ADVAzwBp2kEwQUYXMTr1T4z2Bgl2hzQGA8zwb38ECApCEBAsFQ0AABQELisJAwAhBiIhHiMHAAAxIfm3j6A3FgAAAAAAAAAA9f/ffwMAM/+gn5/fQMC/zMAAM6C/gF+AP4C/gL/gwIBgAMCfAOAAYJ/gH2Bf4GCfAODfn9/gf8DfwB9AnwDggKD/H7///+CfIOBfPwD/wB9gAN+fXx8A/z8gACAgf2CfAECfH4B/PyAAXyBg4L/AHz8gAOAfIGAA/yDAn8C/QKDfH+DAYEBfnz8gP59/AKAgIF8AX/+g30AwM8APwL+gIN/gAB+AQH+gn/+AoGAAAJ+gAB8gAABfYEBAfx9Av7+AAKBA/4Dg/wDgn4BAgD8A4J8AAN/ggJ9fQKBA3z8AH99AH///zAD/H//fvz/ff/9fpWpWqQMAN/+eLgYKXBUW/MzM/xIXkTgWFRYWFBZGD3b4df8XFTw5DykfVuf2dCr/P/l/RjU6Rf//+PQvSFUIISAcOHlSFDNM/l/g/vD2MRssQxg6BV9+ATf/zyorEhQ+/fo9EBADEwsOGAUX9CX9KP+Q0D8YExghLp/7/zwrFxosOzoSBBEDBjAzgA8nKA89Pj7DHDxBFwMXamtsYMbf84OEbwMIBgnygLQmQPP9/+odEjIWD1cPvw8A9BwVICYlgwpjy0rw8A/wEhQWFvX//3///AAD/19AoIDgXyAAAw/Af4B/gB+/AGBfYABfAJ9fX2C/wAAAAAAAwF//oMDAoB+/wL/foGCfPwCAIEDgH+DfXx+fv0C//x/goB+fID+/4GC/QB+AAH9/QH/gn6A/3x+fIKDfQD9AIAAAP/9/gACgvx+fP//AH7+fICCgH2BAwMB/oEB/f2AAwF8fAP+fwKB/QJ8fHwBgQD9/n59/fyB/n+AgIGCfv+CA3z9/4KA/QOAf318gX//gn2CAgKBAH0DAgICAnyCAnyAAoB/AXx9fv6BAHwDfYOAA/2BgH+Dg39///wDDDzMM/2BfYIB/gHaWmlr/w53wAAAACxAgsQADD8AfIB8gDE0AIiEiACEACDAvMC0uAADz7T1atrOyBRC7Gg0/97z72wAUJhbtU/68hokFpKMDpJ39Pfn7mJeYCgWZkgYPCPoI9j91f/EKhxAUDzKl9X//pQ/zZRgPEBIZFQ4AMl+BP9//NGmKETVnb/I9CjiBPgoHA0GnxZKGOSgvU/9osYYf8gDxH2Zo1dD6rw8X4JD//zEZD1QUNxk/Py/8GQwP5BAKCww6NzjDDzMMNyIhIiAfIPff/9e/H5/fYF/fIAC/QL//f///wPz8z8AgXx8gYCAfIL8gYH//YOD/P4Agf79ggKBfgP+/f2CAQOBAQN//X6BfYP//P6AAgCBfAICAP+Df339AAKCf////oJ8AfwAgAH+/8/Az/z9/n2Agf/+/IL/AACAAv18gf3//QH+/359//0DgAN+gn3+/P6A/gMDfAB/fwB8g4H///58AAAB/AIB/v6C//79f/wCg3z/gYD+/oMDfAGAff2B//3+g30BAoL+AIP8AIN/fH6AAn/8AYABf/w8zPEDg3+Df4J8/P0DA/8z/4N8/4N/g37/g4B9gYF+fn/9g3x9fAABgIB9fmpemliVyZP/6oD3/Jl1EHh3/D/+Af3CAfxUUQxoQDxE/p7AtIggDAyQEgjXxQiP/b/OAGhBPIA80CkkFJpgCCyQWARUlAwY390zMBQkTBy0RFigjcDP/BEFgCh0yCBcPD/R4Q3/yACIQFiEuEPpAOdZ/8zcPEBf/88DPBAMKKTAJExgvMBNWUGXw8G9C7xU/Lg8+8DEvAfBf/icpFRgT/0HxNP/2IwRfHh4hGRT/DzM8yR0eHR4dDSwKCcD/zO8dHgodHh0eEgUED4FNEA8A948oEA8QAAAAAAAAAAAPAGBffz+g4EAA3x//n9+AAMBAYF/AIICffyBAYAAAAAAK/7BP959a8M8VKSYpTBMWn7vnCLUPAABTegUwwAwAf19gMAwDAKA/XwUwwAwAHyEiMAwDABYWKw8fIJ+fP39fwABgP0Bg/z8g4H8fv+CgP1/fgN+/AAAAAAqHOWEx/wIm5ykqn3JkA1RPAAAvKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKGAZLAJAAA=","i":"4fAQAAAAAAcQAAgQAAgQCDAQIBEAEAAAEBAUABgAHAAAAxAFMBAUAB8NABAdIAAHEAkQCzATABUgIAEwGgAAAAQQBhAJEAsQDx0fEA0QDTAwESAPEBMtIBAXABwAEAAQHwAQHSAgATAQEB0AEB0AAAQQBxAJEAsQDxANEA8QDRANEAAPEA0QDTAAABAQFCAABBAACjAQFAAWABgAHwAQHwAQHQAdIAUQCDAUABQAEB0AHSAFEBAUAAAABBALHBAAAA8QAA0wEBYAGAAaABwAHwAQHQAQHQAABDAQFAAQEB8AHw0AEBAAAAAFMBAUABYAGgAdABAdAB0AHQ0AAAYYEAALEA8wFCAgATAYCQAQHAACPzAFMAAHEAAKEBAQEBUAFyAQEBogEBAfABAdABAfAAM/DQAfIAgQCzAUABQgAxAPEA0wARANMBAYCQAAAzAQHw0PAAU9AB0AHSAGMBATAB0gIAEwEB8gBBAQEAAwATAYABgAHyAgMBASABAWABAdAB0AEBAdAB0AHQAfAB8AHwAeICABEAAwEBYAHiAABTAAAAgQCxALMBMAFQAXABogIAEwHw8ADwAABz8TDR8OAA8wHwAeIB8dEwAfHw8fDx8ADxAPMBAWDwAeAB8AHgAEPwAfDgAfAB8gAAAJEAwfHR0dEB8XDxAaLx8PMA8dEA8QDRAADRAPDzAPHR8QFwkKAB8AHSAABjAQFQAVAB0NDw0AHSAIEAAAAA8QDTAQFgAQGQoAEB8AHSAABhAIEAALEA8QDRANEA8QDTAQFwAaAB8AHQAPAAYQCBAACz8eFA4QFy4QEBogDxgvBR8ADz8/IB8gESAEHxAPMBUAFyAEMBkvDgcWfxwAEB8AHgAeIAYQAAAKEAASABAVBv4wGQADPDAFFhAPMBAVDwAABDAQICAAAhAAAAAJMAAADBAPEA0QDxAPEA8wFgAZCwAQHyAEEBAUAAAAAAUQEBACNAAWBw8fICAQEB8AEB0AHQAfAB0AHQAdAB8gAAcwFA8OAAQ+MA8wEwAfIAUwEgAeABgJAAM1PyABPxcNFwAADxAPEBQvIBcAEB8PAAAABjAwESAAAAwQDxoZGBATABAWDx8ZDxsADjABPz8gHyADHxAMHx0QFQcGDQL/AA8wHw4AEB4PABAQIBEgAAgwAAoQEBMgDxAADR0QDRAPHR0QDTAYCwAfAAAABRAIEAgwEwAQEBcIABAQEAAABBAGMAAPFg8wFCcvFw8fGgAUABAVIAAEEAYQDxUuK1AGMBUGDx8fGgQNEAAPEA8QDjAWABgAEB8AAz4AEB8NAAQ9MAAJHBAfEwUEDx8PDQ8fAB4AHg4MABAQHx8PQBAHPwAeIBEAAAYfDjAADzAQEBggAAQQAAgwAAAADBAADz8dHw8fDxAQADAAAjAQEBkPEB8AHiAFMAAPCD0QFC0gGSACHRANEA0fEAgfCD8VDRgNGwPwABAAEBAQFg8YABUEMAgwHAAQGwAUABQAFA8QFS0dEBAQGiAABDAQFAAQIBAQEwAQGwAfIBASAB4PHRAQHwAAAAUQGBoQDDAUIBAWDw8ABDAeABkHDwswFS8dEA8wADAQHwAeDxAfDw8PAAAHHxANEAAPEA0QAAAADRAPMBUAFwAZABwgAxAFEAgwCTAUABAAAxAFEA8wEBUAFyADEAAHFhAADxAQEBUgAxAABjkQEwAVAAI7Ahz/AB8PAz8PHwAPMB8AHw0AHw0AHQ8bLi8PPxAfLyAfDg4AEB4gEAAUIAYwBzY7IAweH3gAAT8PDwA/PgAQGQAQEBsvAzAQHwADPAgHABUkIAAbDjAZLi8wBBAGGBwfDz8UABgAEBggAAQQAAfPAAUzPwUQBT8NAAg/MAcQABATAA8QFi8QDzAaKAcPFiL/0AwfHx8fDj8fHi8dHw8QDxAABRAEMA8GHgUQBRMfAz8T8B8PPxAPMBggIAEQAAYQBhAPDz8QDh8fGw8PEB8vEA0fDz8XDRcPDxANPzARAB4vBR9QEwAfIAUQDx8PPxUOGAcOHw8VDhf+Dg8fDw9gHw4AHw4PDAAHPwAdIBErEf4OAB4gBRAABh8QDzAwEQ8QFwAZIA4EPxAOEAAOEAAOEAAOHw8wAA8cDw8QDj8/DzATLyAfIAMQDzAVABUPDwAdIAYYEBAPDQAPMAEfHR8WIB0PAB0vBz8QDx8PHw8QHyAPEA0wFgUAHyARIAYQAAcQBRQfDwUfBR8FFBP+DQ0PDwU/FiQJBUImAwM6AzYWBz2cAZ0BxAEDvQExlgIWpQITKxAGTIIDgQPcAhYRDgsJZ3Z3ent+fxOWATgEUUSfA7oDIxMFLjEqAzw9JNsBgAIHKAoQEzDdAdQBHy3DA5QE2wPeA8sD4gPzAQUD4wFhgAQGHB+fAgXmAv0DkAQRA7EE8gQGA+EB0AEDCwdG+wGKAnsGBH6vBawFpQG6Aa87/QTwBO0ECsIFW4ABtQXEBbsFxAWVAasEqgUOwwUhyAVSQ02BAsoCA8sCqAPTATAxpQSOBgMAyQU/PDkoEw0KyAZBBkvPBY4HCxAgBAQ5BkojJg1BrwHYAQUHYmFNwQHKAjk4NTQxJgsROzAzMlxdYGcrEBoDWCiHA8IBmgGxCIYJrQEVLZEH4gULsAM/sQOSAqIBrwFRtwEDwAOFCYwHjQeQB8MBtAGxAZUEBAUH9AH1AYICLyj+BY0GkgaTBtIBiQLrAU5RVmK9AV4K5gfnB+oH8Qf0Bw+tBZ0DoANU9QMgBgS0CA+nCQ24Bh8EHZ0GoAbQA8UDwgMHtwMgngOfA54DCxwSuwOqAwyzAwMD0APlCeQJ5Qm0CbUJtgnNAzL7BYoC/9AHHxwKDQB2h1ZneKmGZYlomAFpAAA="},"moving_jaw_so101_v1":{"lo":[-0.012294868007302284,-0.08200106024742126,-0.024000003933906555],"span":[0.02232446800917387,0.09199376311153173,0.04800001345574856],"n":537,"c":3414,"v":"oF9///8AwL9A4ACfAF8AXx9gf8BfPwAfQH8fIECAXwDAQP+f4D/zPD//QH/fP6CfoJ+gf/wA//NgX1+/Xz8gX3+A37//IIAAgCDff2DfwCDAoIAg31/AwJ+fnyAAIMC/H4B/4N9/gGAgH98AX98AYF/gzw/w/GC/wODfIB9gIH///yBgYACgQACgP0Cg38AfYJ8Anx8fYD+fIGBAYIBgwAB/YJ8AwMCA4P+gIKA/P8AgP/9ff38gf+B/P/8ggADfv3+AAB+g/18Anz8/AD//gCC//6C/30BfQOA/AN8/ICDgAP9gHx8gH7/g4F/ggAAgAIBfgCDfwGDfPyC/QIB/IF9//98AMgMhBzY0XQ0QPCAuJRdLDwEGAAgwXC0dIBAcJnIrHz/TPD8QkycLdHN0c3Rz8AD/8w4g5gQFB2GagwkHdwQDCwR6eX4HMJGUQhw8LTkOMBIrSBIUBhc3AjZPi6g0Dh8kCgeUAJcTARcVFM8P8CTIxcbDxK+wlZYAEgDZ2tUoEAIBDxWeFgYKxw+oCJEHHA4ZCA0YFBMUIyEBEJ4KrSwSFxMYFGEAPUM0YhpEQwQNJh8nBC0AJgNTbi9GNT86JCYiDxEbAB48CIsAPV8UBwgnDhcZFBc2d/7/MwYWGnCOA0xsKTkmAAxkHQ0dUg4qACdDRAEmO9////8AAAAA//+/P98/X8C/gN//wL8fQODgH7/gP38fn8DfHzwP/P8/X79A35+An7/fPwAA4GAff///gD//ACCAAKCAX+AgQAC/oACgQF/fYGDAYL8fnwDf39//H2Dg//8/Xx/A4CAgYEBA4F8AQH8foAD/338/wP9Af/8/YCAg4D///39fP18gQED/319goMAAgGBgAJ//fyCAAAAgIF/fvz/fv2D/ACB/34CgIOCAAAAf3z9/nwCAYH/fX2CAX78AYH+/H2AA/1/AICCAYP8/IB8AgAD/H8Bgn2DgoL8/P8B/YCAgwIAAH7+/wIAgP78AAABA3x/goN+AgL8Af19/X19pvqpqAP9//B8gHREDBAQWGQMo//9f1C7/EiwlFhAhJEgE8A9jQgFSDxUfHg777/MOBhgbGwMDL0w/U/IVL/OPrkEQDxAioD0MBB4eByAFDAI3fQKCm0WmYAYGCxoVCgcJLwM1MzCEfw9Y+GP//ys2KBAqNTJeD6JAaO1zAQ/aYAQWH6OGQhT91QBGWIPwABQSUA9Pk3a0XwgSFBADRnjdFArEA59P2+mvxQEoJBkPSA//Vf8CDgAmEBcPHT+Df9oNCyAEIh8QEP//f1UAfwBfIF/fQD9fv9/gIID/YP/gX5+/Xx8/H+BgYH9foGAgYH+/XwDAQIAAnz/fwD9g4OAfn6Dfvz8fIF9///8Af6DggEBfn1/gX0BfH1/f31+AoP8/XyC////AfyB/IL9fAP9gfwCAIP//P+BgQGAAnz8fv1/AoD8Af/8AAP//gN/AQJ/A31/gwECfQF+fnx+AQGBg3+Df33+AfwD/wN8A/9+fX6BfP5/g4N8gv4AAAAADAA+/wL/DwAAAwCDfAAAAMMDAA/wAv8DgQCDA88PzwL/AoJ/Av6CfrqpulQ/1/++kk/+scnEUExQPIhEgIhcSCAMXFQINGCIUAAD/Ul9hAzVlD52eQTt2/rHBvEmP/EAsZfkmh4sfmRMqKC36MVct5e/+/x8aREgP3/X//6AXwpMiFiB7ipdpCICRHCv/8lnWfTT+tfEqn0QfexE9qxMSGCwBEAUKBTsF3BURFxJ8//X8j/VqDxAa4RIYEQ8MAwAPECQjJMDDAMwjJCAfIAADADAfI8wzc8wkIB8TNh8gH/AA/wpgA0UJIyQjAAAAAAAAAAD/////378/n4BgYMDA//8AwL+f/z+f/x8fH/+goH+/3x9gYODg3z+Af6Afv6B/AOBgnwAgv3+/IF9g36DfH6A/n+AAIF/g4J9gQGAAYGAAoID/AMCfH1/AAADg/7/fP5+AX2A/318g/z8AgKA/HyAAQD8fX2Dgv7/gXyBgH4A//5///0BgoECAYJ9/oF9g30D/n3+///9AX4CAvyBfwCBA/yAAHwBAPyBgYH//H59gX2DAgIAAH+C/H+Bg3wCggL8gX98fvwAfIICAQCCAH8AgwF/AYD8f/wB/IADf4CAgID/AQN9A/8DAnwDAH2A/H9+/wGDAgCDfX0D/v0C/gH8ggIDA4Lf///9NISIsKyEhQgYVaIE2WQkF83/yv2YQHy4YI18XEJ8gLCsfDhIFOAAJPwdFIb4DAfJ//zD3m/mvuSofHR4ZG1Q+JSoFIyIaGgAJIzQzPQ/fAgsRAAAeA3RDSQqEIhUADyAdKgAehjckGC8rICQ9SgwVRcIJCk8GAhYBFwcZHRMEFRIOCBURmRI1AEw9LAIIGgcIFxcUMhchQUtKHCUAJQA8EAIQJENBB71ROjk+Kh4lAaQAAgEGcgwsJGYsKWUxHikJIAgbAAkDHiRsOkgIf2sRAgwjLQAfAE0iCiIsIAo1IQYGKQHCBhokGA4ODg8EFiERCwQNASNXHBsaCMEQ0v////9ffx8fICCg3/8gYD/gv4D//2AAoF/g/8BgH6AgwJ+fQH8AYGDgAL+AAB8fQABAv2AfIH+AIKBAIED/AMC/AH+g4H9f38AgH9//33/gAB/fv18/nx8fgMDAXyBAgB8gQB9f32A//x9//x+/n79AID8/v19/YN/gH+A/YODAX8CfoD9gAD8/gABg4P9AAOAfYL/fAGDfYJ+A34BgAD+foAAAAJ+fAGDAH6AgQL/AvyCgH4A/AJ8AgGDgQJ8AIN9Af8B/P0DfwCAgAP9fPx8gwH9f4MAggCAAAACfQOD/H1/g4H///98gAAAfIB+/X2Cg3wBgv2DAX79fH79APz/A339fpqqqqv9yGCYmz691ERoRF/A/vysbBhoEAwkvS0jxsqr/DWgPZhAcFRD/mmNwkxEnAw8QEnkogDkdAFC7N+346g9iQBI4j/AC+HA2avUUExESsP9lgkglLvESJ5sEQBI/IAJCBj4VqjPyKgBoAB8OUGEv8P3uAxw5EPUC9cELdQ//EzIaGBH/YscGL/+BVhIVFA8XJwVwAPbJch8SJD8qe/D3Ak5TDxwbgSwLCfQzDy/WXBBVXVXVAMDzD7/Av8C/wMAA/P+/X99/oGDfPwMzwA///7/foJ8AAw/PX2BfYL/AAMAM8KCff4CAIF9AgD/gH8AAAKCgAADADADAML/AvzDzzM/Av8C/wL/AXyDzM/8P/0AfwMD/////n6AzMAAM//+foPPz8wD//5+g/4A/P/8PPMAAH3+fv/8wD/AM/5+gn6CfPA8MML/Av8CgnwzPMwOgn6CfoJ+gAACfAKAAn6D/YH+g/6Dg/1VVVVUAwPMPJCMkIyQjz8zz8yQgHyAfIAUtbg8nAzPAzxAPJhAPFRYDMw/PEA8lJiUmBAwAwAzvJSYODxC//4/DDhIPEasIBhA+GSMM8MAwJCAfIyQz88zPIxAUIyQjJCMcVOjL/w9VThcPEA8QJiUzM/MMDxAmEA8QDyXz8AMADxAmJQ8QDzzAAAkwLwoPMA/wDBAmJSYlJjwPDDALAwQMJSYMzzMDJSYlJiUmJQzP9/8mJSYlmqypqgwEBgAAAAAAAAAAB18AYJ9gn19/X/8gYIB/QADP/wAAP59fgD9goAcRABRKCj0X3egKJxUUNjka/78AABUTHxYYFdsHAABAfz8/4MD/X39fPz//v///wACAP7+A4L/AH98GQG/0T/LzOf8QFxsSLyc2/HvAAAQDazjiKQe/nyDfoL+fwCCAIL+/YKA//z/AAJ/AoGDgX99gBg/2tPpfsQE21djX1O/zwAC7Dp6dB/0FAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgANAboGQAAA==","i":"4fAAADAwESAACDAQFAAQAAMQBRAACBASLxAOMBYgAAMwEwAaABwAAjAfIAUQBxAJEAAQAAAPEA8QAA4wABAQFiAAEiQQCBAIMBMBFQAKPDAPMB8NDQAQIAAQEAQwFiAABxgQAzAEMBQFABAQFCAQEBACODAgATACPxsvCggABRgZvQAPMB8NDwAQHiAACBALGhAQEwAAAAQQECARIBAAChAPEAANEAAADw0/FA4QFwAQADAwEBIAEBAQEB8AEB0gABAQHRYAEBclBDAKEA8wBxgvFyADPTAADzkQFScQDx8fDw8eHw8QDh8fAA8fDz8eEBcDABUPDwAEEAYQEA8QEBUgAA8FMAwQDDAUABACNwgAHwAdDx0vHyAADxIgAAAPMBAVIBAXDxkgHg8AEBAQEB4gECARIAcQCRALMAAADxANEA0wEBcgAAUwEBQgFQAABBAGEAAPMBAQFiAQEBkgEBsAABAQHyAEMA8OAAg+MAwQDxAADxANMAACEAscEAswDDAUABYgAxAADx4QDhAQFiAQICABEAAQEyAgEBgAGwAfAB0AEBAdABAdDw8/Hw8fAA8wHw8PAB8gCBAQFAAUDwAQHQAfHw8QHwAeIAUQDxAADx8PPxAQFwAaIAMwAAUwFAAfDQAAAAYwEBQgIAEwMBAgEBIkCwAHEAowHw8PEB8AHwAeIAYfCD0QFS0gFg8AAAAGFR8QAA8QDRAPEA0QDxAADzAQAAAABhAABxAPEBAQFQAQGAAAAAQwADAAAAAEEAAIEAAPMAACEAAQBRANEA0wFQAAAAUQAAYQDRAADxAaIA4wATAfIAQQDxAOEA8QFAAXLwAEHxAOEA8fEA8PPxAXIA0fHwAPPwEdDx8ADzAfIAMQDzABEB8fHRAYLyABPAsAHwIQBD4AHiAQEAAAAAUQChAPMBAQFgAfGQ0bDxAPHRAPMB8NABQAFiAABhgQAxADEAM/Ey4vEBcEAg8PAz8fHy/wECARIAAFMAYzBAAHFfAQQEABEBAgESAACTAQFAAQFw8PPxAOEA4wHyADEA8wFQQAHwADMB8AEB4gBRAACD8QFC0QDTAYCgAQGw8AHwAXIBAPMAEeHhAADh8PPz8ADx8eEBUPDx8vBR9vHw0AHQ8AHw4PAB8gCRwfEBQgAA0QDRAPHwAPPz8vMA8eHx4QGgYPABAAPwA+PwAABxAHMBMAAAMwMAAPHxANHw8wAA8QDxAOEA4QAA4QDh8QFS4fDT8QGgACPD8QDx8PPxAADxAAAA4fFwAPEBoPDQ8NBRAPEAANEAAPFQcwBT8UDhcAEy4fHhYF/i8gHwAdABAQHS8gATAeIAAFEhAEMBMAFgAQFAMAEwATDxMNEw8QFC4vFS4CHg/wABAfEBUvHw8/EAAAECAADx8QDTAWABkIABAcABYEPwAQHQAQHwAPDw8ABzoAGgAZDxMOEw4fFC4PHw8ODx8XDx8PPwAPDz8/AB0PDwUfIAg6Cw8PCjAVBg8AHQ8EHw8H/g8AAz0NDx4vCB0AGBAnBj4PGWRvVhpDBIIBICEiDASDAQhOTXwKIQQaGyJDGh8EUjEsJwlUT0YeIhQECgMYGE0YOWRlYmVkHAgGBFVaV1o/BEplZB4YFwkIJRoTDKcBCwMmBJgCkQLEAsECBO4B6wEIDIIBf34+FBUUJSQlPzgaBwZLSBUJI4ACCA4DBgfHAa4BwwEabgcefHNwBRQTEpcBR0pHA04NQ44CkwKYAssBxgGTAnCMAQQMCCWtAd4B4QHoAekB7AGTAiKCAgMSA50CDxIIhAL7AQQErAEcHUAEFggiCQ8EIgePDCkMAzQ3OjvTBiKUAY0BtAFXA7oGB7cHiAHGBuMG5gbjBuYGB90GWA1fNY4HrwdaVwXiByOzB7IH2QbWBh4U/Qb/kAQBA3MDAHaHVmd4qYZliWiYAWkAAA=="},"wrist_roll_follower_so101_camera_mount":{"lo":[-0.021590104326605797,-0.08067121356725693,0.01940878853201866],"span":[0.04112797789275646,0.05650603771209717,0.03470112010836601],"n":190,"c":1212,"v":"oP///wDfgIBA319AH39AoH+AoN//AOB/gGBgX3+fH3/A/x8AQF9fP6B/gGBfQMAf3x9gYN+fwCD/AGBAP2Cf379g4H/foL//32C/oODgf6C/oEBAHz+gQH/gAJ//X+D/QH9fACA/X7+AwKBfQGBfvwBgP2BAAGBfn18ff59A4ACfwIDAAAD/wL/fYD+fYL/gv9+/f1/fv//g/4AfQF+AXz/fn39gAICgnwBAX78ggN8/QP9AICB/v6Bf4EAAIMAA30AAAJ2rqjL39/8DPEsJT0xHrmZJBwkPaklKAlcGFQEDPwNh6+zcDz/47XQEdlQFCllzEz+adpIwtHM7Dw37FxsKECEDQUgFAAwOEICAOPwRvf87GS4TQNI1VY6sChZVb/mCCOEZGhXXoF+L8P+PKb8UEkRQEBEjoo9L80zPXxIPZU0r/xN58NnwQxEiFhHA/yWGQP//ABMWJRTwMf///wC/wL9/oMCfn5+/oKB/YMAgAH9An///oEC/wGCfYGAAgEC/n0CAf8Ag4MAfwP8/X/9/X19fn1//v+D/AH+AoJ/A3z8AgEB/f38f31/g/2CfvyBfPx/gf9+A4D9gH4BgP//f/79AIH+ggIBAoEBgAOAA4ODAgGDAX+C/H19AH9+gH99gf98fwIC/oCBf34DfIKCfACD//+Dgv99fvx/AgL//34BfP+Df32DAYOC/oP8gYKB/gJ8gX6Dgv4CAv+AAALXv6j8PzAMaGRoZGhcYGQA7PM4YGRoZGhGFGwEXNC8EMHwYGQCVGRoc8f/Ej/9uRrxD8voTFRARFAIPARAABROvoBQIAgYDBA0HChOdlBIMHQQAGCUiJ/UI//f02trUJCMsxRgXFgcVBioZEA8WCQ4HCQ0GF99/Rf/CowAQEDEg33hh9UpEHx8cMTk4tU/lL/xPW/8sI7QkDxIGHx4nJAURDgYjmxkcqgAA////ACCAnwB/H0DfoD8fXyBgYJ9fIL+AgL+fQIAf4P//ACDAvx8gwH9gYGCfv4BfQB/AoKAAYD9/H2Dgn4DfYP+/4H9/QL8/P4C/oEA/QKDA3+BAX+DgQH/gwOAfAB9AAIAfP5//QP9AYB/f358/n0AfH4DAP3/g/8CgIL9/oGDgP+Agf5+AIGDAwF+gICBAH/8fvx+Av6D/v3/AQABgQB9fXz+fn2C/X8BAf4CfIJ//HwDfQMAAn0Bgf6AgAN//YAAA2//rAAcAGAsTAAQ1PAZBNjVCCzr///ETni+gO1A2PGVocMD/w0NEQysDBipEOwGN9gssBxYbIgcNAwchJB0VABICIAAGGbyrHAkABwYFIwomG6qdHg1hBQIZKGBXXAYAB11UpAgYAyMmISghLBcaCBkHKxwgEBUnJAgKDgMCBiEgJyIFKzojJAAJBAEA/4kw9jlTLw8fEks+O+Zf2D/9P4//VFu/XiUQHgNhHypeBh8kB1umHBm1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAc+DysCEAAA==","i":"4fAgAAADEBAgIAEwEBYAGCAFMBAQEB8qAAQ2MAYwGAAYABMAEyAUIBAJGh8TLy8QGi//ABQsEA8QDTAwESAQADAAFSIgEBgAHw8PPxAfICABGA8FNn8ULwAPPwAfIAQQDxIEABAVDQAQEAAQIAAGMBAVABUAEBkAAAMwEB8PAB4AEAAAMBAWAB8gAAAGEAkQCRAADxANEBQAFiAABDAQFAAbABAfAB0gBRAHEAkwAAsQDzABMBUAAAMfHi8HHQ8QEAAAAAUwAAcwAAkwADAAAhAABhAPMBAQIAAGMBAQFgUAGyAQEBAfIAQwMBASAB8XABcPABAQHQAdIAUQAAgQCx8fEBQuIBcgAhAOEA8fHxAPEA4eEA8QDhAOEA4QDj8BPxcJABwPABUvBB9fHRAQEBAfLw4PBhAIPgAeIAwwDxAADxAfAAM+AB8AHgAeDwAABhAJEAwQDzAUABYAGAAaIAMQAAYQCT8TDw4/FwgNHx8fDz8/Dx8PEA4/Py8BPz8AHw8PDQ8PCh8Pny8WDx0fAA8/PxEPCAMMDwbxLCkiEiMFBCQlJA0mCwQGHh0UJhgSFQMYAD6DAYIBTzwEBAg2CGNnzgEdfS3KAS0KMNsBFAZohwHuAdsBAwuqARlUXQxWU1ZVei9FLmMJAzMmQGcA4gGBAlYSLTAxAHaHVmd4qYZliWiYAWkAAA=="},"waveshare_mounting_plate_so101_v2":{"lo":[-0.02549406886100769,-0.020976664498448372,-7.648578493647806e-13],"span":[0.050988733768463135,0.04196116141974926,0.007600000128914844],"n":129,"c":810,"v":"oP//AAAfIB8A4N8gAN9fAGBf4EBg4F8fP6C/vwAAAJ8fIP8A/6Cfn1+fX18fYACfAB8/gEC/IB+fQODggKAgvwDAIKAAP+Agn5+AQEDAQMDgX78Af38foH+/X/9gHwBgYAD/YF9fn19gQKAfPyDf/yD/wB9f/0AfP6BAX4C/Xz9foP9g+VcBPz88/La1tgsMtQyenZ5SQfPWr0L///AWEDIxE0YrLAMtIA4rHgsRFQAYDwB+mQC6Hw8YJwYiGAG7ArgHClQAXQ0HBTVGFK8BB7QIAhcXsP/xzwMhFAsNAy4rLCc98788DiAdKAsSBgkQjffP/4cJGhEIKAsTIA4pLsAAAAAv/f8BA/wwPx8gf2Bgv2Ag4L//IOCgwB9gH/8foP8gv1+g/yAgQICgnz8AwD8AAL9//0BAv+DfAH9AX2BfQH/gAL/gH7/fv5/AwD9A4EAAQH+AH6CfIKDgP+BgYL8gH0C/Hx+AgABgn4D/AOAf3/8A34CA/99fQJ9gvx+gYJ/gP8AAAAD/+dsBA/wwP9rZDM4LwfEF2P90QzH//0Ih9KsjGdIHGxAnGg4nCwsmACMDAABCAApLBCQZBSAkFAMEx9YNPgAvBAEDrz0aKgAPEg0FMSJ+ZP+/1fPQjygYGaojvPuzPBkoJ1U0MzY3ODUyAjMBASAMMSYZEwUDCRrAAAAAI1VVADD/8wDAv6CfwL+gXzwz8MOgn6CfoJ+gnwDDzPCgn6CfoJ/ADDPMoJ+gn6Cf/wAwPGBfoJ+gn6DPDAMwn6CfoJ+g8zzPw5+gn6CfoJ+gn6AM8wz8n6CfoJ+gn6BVVQAw//MASklNTkpJTVk8M/DD9PP08/Tz9PMAw8zw9PP08/TzwAwzzPTz9PP08/8AMDxaWfTz9PP0zwwDMPP08/Tz9PM8z8Pz9PP08/Tz9PP0DPMM/PP08/Tz9PP0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgFIASZDaAAA=","i":"4fAQEBQAAAMQBRASKCAJMBUgFiAgMBAQIBEAFwUAEAAAFSAQFyAABxgQAAsUEAAFEAAGExASABQgAAcWEAMwEwAVIAMQBxADEAMQAzATICABMBcEABAUAAADMBAYABAZJBcQCRALEA8EPxMOHxAQGAAaABcPAB8PBB8ABxgQCjATIBAQFgAQHwAQHwAQHwADORAfLCAPEA0wATAAAxAQAAAHEBYQEyZsAB8PABAeABgGABQgBBAGMBAUCAATABMPEy4DHgUfA/4fHxAADhcFMAcQBD8QFQYAEwATDwADFP8dEBQgDTAXAP8EAAM2ABUgBRAACBMQAzATABAWAwAAAzAQFwYFDxMvLxQAFC4VAxoOBxcJEgYEBlYMCAUEHwUPSgsEFQRfAwGvTE1ZBgMAdodWZ3iphmWJaJgBaQAA"}};
