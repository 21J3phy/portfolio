import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, box, cyl, sphere, torus, extrude, tube } from './kit.js';

const PI = Math.PI;
const radians = THREE.MathUtils.degToRad;

function beam(b, a, z, radius, material = 'blackMetal', segments = 12) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...z);
  const g = cyl(radius, radius, start.distanceTo(end), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()));
  b.add(g, material, { position: start.add(end).multiplyScalar(0.5).toArray() });
}

function customMesh(geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// Normalize the footprint without moving any geometry relative to its named pivots.
function floorCentered(group) {
  group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(group);
  const shift = new THREE.Vector3(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  for (const child of group.children) child.position.add(shift);
  group.updateMatrixWorld(true);
  return group;
}

export function createDesk() {
  const b = new Builder('desk');
  b.add(box(1.5, 0.032, 0.72, 0.004), 'woodDark', { position: [0, 0.724, 0] });
  for (const x of [-0.668, 0.668]) {
    for (const z of [-0.288, 0.288]) {
      b.add(box(0.032, 0.7, 0.032, 0.002), 'blackMetal', { position: [x, 0.366, z] });
      b.add(box(0.038, 0.016, 0.038, 0.003), 'rubber', { position: [x, 0.008, z] });
    }
    b.add(box(0.032, 0.045, 0.60, 0.002), 'blackMetal', { position: [x, 0.68, 0] });
  }
  b.add(box(1.37, 0.045, 0.025, 0.002), 'blackMetal', { position: [0, 0.68, -0.288] });
  b.add(box(0.68, 0.035, 0.11, 0.004), 'blackMetal', { position: [0, 0.675, -0.235] });
  // Monitor: native full-plane UVs, front is +Z. Screen center is y=1.09.
  b.add(box(0.24, 0.009, 0.16, 0.004), 'blackMetal', { position: [0, 0.7445, -0.17] });
  b.add(box(0.037, 0.215, 0.028, 0.003), 'blackMetal', { position: [0, 0.856, -0.225] });
  b.add(box(0.618, 0.362, 0.029, 0.004), 'plasticBlack', { position: [0, 1.086, -0.211] });
  b.add(box(0.30, 0.19, 0.025, 0.009), 'plasticBlack', { position: [0, 1.073, -0.235] });
  const screen = customMesh(new THREE.PlaneGeometry(0.597, 0.336), new THREE.MeshBasicMaterial({ color: 0x000000 }), 'screen');
  b.object(screen, { position: [0, 1.090, -0.1959] });
  b.add(sphere(0.0012, 8, 6), 'ledWarm', { position: [0.287, 0.913, -0.195] });
  for (let i = 0; i < 20; i++) b.add(box(0.014, 0.0015, 0.002), 'blackMetal', { position: [-0.19 + i * 0.02, 1.239, -0.226] });
  b.add(tube([[0, 0.99, -0.263], [0.025, 0.83, -0.277], [0.03, 0.733, -0.31], [0.03, 0.66, -0.30]], 0.003, 20, 6), 'rubber');
  b.add(box(0.76, 0.003, 0.30, 0.008), 'fabric', { position: [0.035, 0.742, 0.12] });
  b.add(box(0.36, 0.015, 0.125, 0.005), 'plasticBlack', { position: [-0.075, 0.751, 0.124] });
  // Low profile keys, with a real stagger and a separate navigation column.
  for (let row = 0; row < 4; row++) for (let col = 0; col < 14; col++) {
    const x = -0.241 + col * 0.023 + (row % 2) * 0.003;
    b.add(box(0.020, 0.004, 0.019, 0.0008, 1), 'plasticGrey', { position: [x, 0.762, 0.076 + row * 0.022] });
  }
  b.add(box(0.129, 0.004, 0.018, 0.001, 1), 'plasticGrey', { position: [-0.095, 0.762, 0.165] });
  for (const x of [-0.233, -0.209, 0.02, 0.046, 0.072]) b.add(box(0.021, 0.004, 0.018, 0.001, 1), 'plasticGrey', { position: [x, 0.762, 0.165] });
  b.add(sphere(1, 20, 12), 'plasticBlack', { position: [0.288, 0.747, 0.123], scale: [0.031, 0.021, 0.052] });
  b.add(box(0.001, 0.001, 0.031), 'plasticGrey', { position: [0.288, 0.768, 0.105] });
  b.add(cyl(0.006, 0.006, 0.007, 12), 'rubber', { position: [0.288, 0.768, 0.095], rotation: [0, 0, PI / 2] });
  // Phone and dock. Keep the display an unmodified plane for integration.
  b.add(box(0.091, 0.009, 0.09, 0.005), 'blackMetal', { position: [0.486, 0.745, -0.093] });
  b.add(box(0.04, 0.066, 0.009, 0.003), 'blackMetal', { position: [0.486, 0.779, -0.115], rotation: [radians(-15), 0, 0] });
  const phonePosition = new THREE.Vector3(0.486, 0.842, -0.078);
  const phoneRotation = new THREE.Euler(radians(-15), 0, 0);
  b.add(box(0.077, 0.158, 0.009, 0.0044), 'plasticBlack', { position: phonePosition.toArray(), rotation: [phoneRotation.x, 0, 0] });
  const phoneScreen = customMesh(new THREE.PlaneGeometry(0.068, 0.147), new THREE.MeshBasicMaterial({ color: 0x000000 }), 'phoneScreen');
  b.object(phoneScreen, { position: new THREE.Vector3(0, 0, 0.0047).applyEuler(phoneRotation).add(phonePosition).toArray(), rotation: [phoneRotation.x, 0, 0] });
  b.add(box(0.014, 0.0035, 0.001, 0.001), 'plasticBlack', { position: new THREE.Vector3(0, 0.068, 0.0053).applyEuler(phoneRotation).add(phonePosition).toArray(), rotation: [phoneRotation.x, 0, 0] });
  b.add(box(0.08, 0.012, 0.012, 0.002), 'blackMetal', { position: [0.486, 0.758, -0.059] });
  // The whole lamp can swivel about its base around Y.
  const lamp = b.part('lamp', { position: [-0.579, 0.74, -0.173] });
  lamp.add(cyl(0.075, 0.077, 0.012, 32), 'blackMetal', { position: [0, 0.006, 0] });
  beam(lamp, [0, 0.012, 0], [0, 0.31, -0.016], 0.008);
  beam(lamp, [0, 0.31, -0.016], [0.087, 0.39, 0.038], 0.007);
  lamp.add(sphere(0.013, 12, 8), 'blackMetal', { position: [0, 0.31, -0.016] });
  lamp.add(cyl(0.025, 0.064, 0.065, 32), 'blackMetal', { position: [0.087, 0.368, 0.038] });
  lamp.add(cyl(0.056, 0.056, 0.002, 32), 'ledWarm', { position: [0.087, 0.335, 0.038] });
  return floorCentered(b.build());
}

export function createChair() {
  const b = new Builder('chair');
  for (let i = 0; i < 5; i++) {
    const a = i * PI * 2 / 5;
    const x = Math.sin(a), z = Math.cos(a);
    beam(b, [0, 0.135, 0], [x * 0.29, 0.075, z * 0.29], 0.018);
    beam(b, [x * 0.29, 0.075, z * 0.29], [x * 0.29, 0.040, z * 0.29], 0.008, 'steel');
    for (const offset of [-0.019, 0.019]) b.add(cyl(0.03, 0.03, 0.018, 16), 'rubber', { position: [x * 0.29 + Math.cos(a) * offset, 0.030, z * 0.29 - Math.sin(a) * offset], rotation: [0, a, PI / 2] });
  }
  b.add(cyl(0.025, 0.031, 0.20, 20), 'plasticBlack', { position: [0, 0.22, 0] });
  b.add(cyl(0.014, 0.014, 0.13, 16), 'steel', { position: [0, 0.365, 0] });
  b.add(box(0.30, 0.034, 0.27, 0.01), 'blackMetal', { position: [0, 0.403, 0] });
  b.add(box(0.47, 0.063, 0.445, 0.03, 3), 'fabric', { position: [0, 0.429, 0.025] });
  for (const x of [-0.17, 0.17]) beam(b, [x, 0.4, -0.16], [x, 0.83, -0.272], 0.013);
  b.add(box(0.425, 0.44, 0.036, 0.018, 3), 'plasticBlack', { position: [0, 0.746, -0.241], rotation: [radians(-9), 0, 0] });
  b.add(box(0.372, 0.38, 0.021, 0.01, 3), 'fabric', { position: [0, 0.748, -0.216], rotation: [radians(-9), 0, 0] });
  // Subtle woven horizontal relief on the backrest, batched with the shell.
  for (let i = 0; i < 33; i++) b.add(box(0.35, 0.0014, 0.0014), 'plasticBlack', { position: [0, 0.574 + i * 0.0106, -0.203 - i * 0.00168] });
  for (const x of [-0.269, 0.269]) {
    beam(b, [Math.sign(x) * 0.205, 0.405, 0.00], [x, 0.61, -0.045], 0.014);
    b.add(box(0.065, 0.028, 0.24, 0.012), 'plasticBlack', { position: [x, 0.62, 0.015] });
  }
  beam(b, [0.1, 0.393, 0], [0.265, 0.385, 0.08], 0.006);
  b.add(box(0.054, 0.013, 0.03, 0.005), 'plasticBlack', { position: [0.264, 0.385, 0.08] });
  return floorCentered(b.build());
}

function guitarOutline() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-0.110, -0.002, -0.184, 0.045, -0.185, 0.132);
  s.bezierCurveTo(-0.186, 0.204, -0.135, 0.237, -0.116, 0.275);
  s.bezierCurveTo(-0.099, 0.310, -0.143, 0.330, -0.145, 0.379);
  s.bezierCurveTo(-0.147, 0.435, -0.085, 0.479, 0, 0.480);
  s.bezierCurveTo(0.085, 0.479, 0.147, 0.435, 0.145, 0.379);
  s.bezierCurveTo(0.143, 0.330, 0.099, 0.310, 0.116, 0.275);
  s.bezierCurveTo(0.135, 0.237, 0.186, 0.204, 0.185, 0.132);
  s.bezierCurveTo(0.184, 0.045, 0.110, -0.002, 0, 0);
  return s;
}

function spruceTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1536;
  const c = canvas.getContext('2d');
  c.fillStyle = '#dbaa64'; c.fillRect(0, 0, 1024, 1536);
  let seed = 91237;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 1500; i++) {
    const x = rand() * 1024;
    c.strokeStyle = `rgba(${rand() > 0.5 ? '115,70,29' : '255,227,175'},${0.025 + rand() * 0.075})`;
    c.lineWidth = 0.4 + rand(); c.beginPath(); c.moveTo(x, 0);
    c.bezierCurveTo(x + rand() * 5, 480, x - rand() * 5, 1024, x + rand() * 3, 1536); c.stroke();
  }
  // Rosette is baked onto the soundboard, with a repeating mosaic between fine rings.
  const cx = 512, cy = (1 - 0.345 / 0.48) * 1536;
  c.save(); c.translate(cx, cy); c.scale(1024 / 0.374, 1536 / 0.48);
  for (const [r, width, col] of [[0.063, 0.0012, '#46321d'], [0.0607, 0.0008, '#f3d897'], [0.059, 0.002, '#554529'], [0.053, 0.001, '#493521'], [0.0506, 0.0008, '#61452a'], [0.0484, 0.0007, '#38291a']]) {
    c.beginPath(); c.arc(0, 0, r, 0, 2 * PI); c.strokeStyle = col; c.lineWidth = width; c.stroke();
  }
  for (let i = 0; i < 88; i++) {
    c.save(); c.rotate(i * PI * 2 / 88); c.fillStyle = i % 2 ? '#735333' : '#ece0ae';
    c.translate(0.056, 0); c.rotate(PI / 4); c.fillRect(-0.0018, -0.0018, 0.0036, 0.0036); c.restore();
  }
  c.restore();
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function createGuitar() {
  const b = new Builder('guitarStand');
  for (const x of [-0.15, 0.15]) {
    beam(b, [x, 0.014, 0.15], [x * 0.65, 0.34, -0.075], 0.012);
    beam(b, [x, 0.014, -0.18], [x * 0.65, 0.34, -0.075], 0.012);
    for (const z of [-0.18, 0.15]) b.add(sphere(0.016, 12, 8), 'rubber', { position: [x, 0.016, z], scale: [1, 1, 1.5] });
    b.add(tube([[x, 0.20, -0.04], [x, 0.139, 0.067], [x, 0.144, 0.136], [x, 0.172, 0.145]], 0.013, 16, 8), 'rubber');
  }
  beam(b, [-0.10, 0.30, -0.07], [0.10, 0.30, -0.07], 0.012);
  b.add(box(0.18, 0.04, 0.035, 0.012), 'rubber', { position: [0, 0.288, -0.049] });
  const g = b.part('guitar', { position: [0, 0.099, 0.065], rotation: [radians(-12), 0, 0] });
  const outline = guitarOutline();
  const shell = guitarOutline();
  const inner = new THREE.Path();
  const boundary = outline.getPoints(20);
  inner.setFromPoints(boundary.map(p => new THREE.Vector2(p.x * 0.968, (p.y - 0.24) * 0.975 + 0.24)));
  shell.holes.push(inner);
  const shellGeometry = extrude(shell, 0.092, 0.0006);
  shellGeometry.deleteAttribute('normal');
  const smoothShell = mergeVertices(shellGeometry);
  smoothShell.computeVertexNormals();
  g.add(smoothShell, 'woodDark');
  g.add(extrude(outline, 0.003, 0.0005), 'woodDark', { position: [0, 0, -0.047] });
  const topShape = guitarOutline();
  const soundHole = new THREE.Path(); soundHole.absarc(0, 0.345, 0.047, 0, PI * 2, false); topShape.holes.push(soundHole);
  const topGeo = extrude(topShape, 0.003, 0.0005);
  const uv = topGeo.attributes.uv, pos = topGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.374 + 0.5, pos.getY(i) / 0.48);
  const spruce = new THREE.MeshStandardMaterial({ map: spruceTexture(), color: 0xe5bd88, roughness: 0.43 });
  g.object(customMesh(topGeo, spruce, 'spruceSoundboard'), { position: [0, 0, 0.047] });
  // Recessed dark interior remains legible with the room's broad environment light.
  g.add(new THREE.ShapeGeometry(guitarOutline(), 16), 'plasticBlack', { position: [0, 0, -0.044] });
  for (const z of [-0.048, 0.049]) {
    const curve = new THREE.CatmullRomCurve3(boundary.slice(0, -1).map(p => new THREE.Vector3(p.x, p.y, z)), true);
    g.add(new THREE.TubeGeometry(curve, 180, 0.0012, 5, true), 'plasticWhite');
  }
  g.add(torus(0.047, 0.0011, 6, 64), 'woodDark', { position: [0, 0.345, 0.048] });
  // A rounded neck, heel, flat ebony fingerboard, and 650 mm scale.
  g.add(box(0.048, 0.329, 0.027, 0.012, 3), 'woodDark', { position: [0, 0.640, 0.025] });
  g.add(box(0.047, 0.067, 0.07, 0.012), 'woodDark', { position: [0, 0.474, -0.001] });
  g.add(box(0.054, 0.437, 0.006, 0.0008), 'plasticBlack', { position: [0, 0.5825, 0.052] });
  g.add(box(0.054, 0.006, 0.009, 0.0008), 'plasticWhite', { position: [0, 0.801, 0.054] });
  g.add(box(0.148, 0.028, 0.007, 0.002), 'woodDark', { position: [0, 0.14, 0.0535] });
  g.add(box(0.078, 0.015, 0.006, 0.001), 'woodDark', { position: [0, 0.132, 0.059] });
  g.add(box(0.078, 0.0025, 0.009, 0.0005), 'plasticWhite', { position: [0, 0.151, 0.060] });
  for (let n = 1; n <= 19; n++) {
    const y = 0.801 - 0.650 * (1 - 2 ** (-n / 12));
    beam(g, [-0.027, y, 0.056], [0.027, y, 0.056], 0.00055, 'steel', 6);
  }
  // Slotted headstock: real through openings, rollers, side plates and buttons.
  const headShape = new THREE.Shape();
  headShape.moveTo(-0.025, 0); headShape.lineTo(-0.036, 0.143);
  headShape.quadraticCurveTo(-0.038, 0.16, -0.022, 0.167);
  headShape.quadraticCurveTo(0, 0.174, 0.022, 0.167);
  headShape.quadraticCurveTo(0.038, 0.16, 0.036, 0.143); headShape.lineTo(0.025, 0); headShape.closePath();
  for (const x of [-0.0185, 0.0185]) {
    const slot = new THREE.Path();
    slot.moveTo(x - 0.006, 0.038); slot.lineTo(x - 0.006, 0.132);
    slot.absarc(x, 0.132, 0.006, PI, 0, true); slot.lineTo(x + 0.006, 0.038);
    slot.absarc(x, 0.038, 0.006, 0, PI, true); headShape.holes.push(slot);
  }
  const headOrigin = new THREE.Vector3(0, 0.806, 0.04), headTilt = new THREE.Euler(radians(-11), 0, 0);
  const hp = (p) => new THREE.Vector3(...p).applyEuler(headTilt).add(headOrigin).toArray();
  g.add(extrude(headShape, 0.018, 0.001), 'woodDark', { position: headOrigin.toArray(), rotation: [headTilt.x, 0, 0] });
  for (const side of [-1, 1]) {
    g.add(box(0.002, 0.118, 0.020, 0.001), 'brass', { position: hp([side * 0.032, 0.085, 0]), rotation: [headTilt.x, 0, 0] });
    for (let i = 0; i < 3; i++) {
      const y = 0.046 + i * 0.037;
      beam(g, hp([side * 0.010, y, 0]), hp([side * 0.041, y, 0]), 0.0033, 'plasticWhite');
      g.add(cyl(0.007, 0.007, 0.0025, 12), 'brass', { position: hp([side * 0.035, y, 0]), rotation: [headTilt.x, 0, PI / 2] });
      beam(g, hp([side * 0.041, y, 0]), hp([side * 0.052, y, 0]), 0.002, 'steel', 8);
      g.add(sphere(1, 12, 8), 'plasticWhite', { position: hp([side * 0.054, y, 0]), rotation: [headTilt.x, 0, 0], scale: [0.005, 0.009, 0.006] });
    }
    for (const y of [0.03, 0.14]) g.add(cyl(0.0022, 0.0022, 0.003, 8), 'steel', { position: hp([side * 0.0335, y, 0.006]), rotation: [0, 0, PI / 2] });
  }
  for (let i = 0; i < 6; i++) {
    const xb = (i - 2.5) * 0.0112, xn = (i - 2.5) * 0.0089;
    const material = i < 3 ? 'copper' : 'plasticWhite';
    const radius = i < 3 ? 0.00048 - i * 0.00006 : 0.00030 - (i - 3) * 0.000025;
    beam(g, [xb, 0.125, 0.0635], [xb, 0.151, 0.065], radius, material, 6);
    beam(g, [xb, 0.151, 0.065], [xn, 0.801, 0.0595], radius, material, 6);
    const roller = hp([i < 3 ? -0.0185 : 0.0185, 0.046 + (i < 3 ? i : 5 - i) * 0.037, 0.004]);
    beam(g, [xn, 0.801, 0.0595], roller, radius, material, 6);
    g.add(tube([[xb, 0.126, 0.063], [xb + 0.002, 0.122, 0.059], [xb, 0.128, 0.056], [xb - 0.002, 0.139, 0.063]], radius, 10, 5), material);
  }
  return floorCentered(b.build());
}

export function createStool() {
  const b = new Builder('stool');
  b.add(cyl(0.177, 0.177, 0.036, 48), 'woodDark', { position: [0, 0.602, 0] });
  b.add(torus(0.174, 0.003, 6, 48), 'woodDark', { position: [0, 0.618, 0], rotation: [PI / 2, 0, 0] });
  b.add(cyl(0.145, 0.145, 0.018, 32), 'blackMetal', { position: [0, 0.575, 0] });
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + i * PI / 2, x = Math.cos(a), z = Math.sin(a);
    beam(b, [x * 0.20, 0.014, z * 0.20], [x * 0.12, 0.57, z * 0.12], 0.014);
    b.add(cyl(0.02, 0.021, 0.018, 12), 'rubber', { position: [x * 0.20, 0.009, z * 0.20] });
    b.add(cyl(0.003, 0.003, 0.001, 8), 'blackMetal', { position: [x * 0.128, 0.6205, z * 0.128] });
  }
  b.add(torus(0.171, 0.009, 8, 40), 'blackMetal', { position: [0, 0.225, 0], rotation: [PI / 2, 0, 0] });
  return floorCentered(b.build());
}

export function createShelf() {
  const b = new Builder('shelf');
  for (const x of [-0.437, 0.437]) for (const z of [-0.125, 0.125]) {
    b.add(box(0.024, 1.60, 0.024, 0.0015), 'blackMetal', { position: [x, 0.80, z] });
    b.add(box(0.028, 0.009, 0.028, 0.002), 'rubber', { position: [x, 0.0045, z] });
  }
  const levels = [0.12, 0.48, 0.84, 1.20, 1.57];
  for (const y of levels) {
    b.add(box(0.87, 0.022, 0.28, 0.002), 'woodDark', { position: [0, y, 0] });
    b.add(box(0.855, 0.024, 0.014, 0.001), 'blackMetal', { position: [0, y - 0.021, -0.123] });
    for (const x of [-0.435, 0.435]) b.add(cyl(0.003, 0.003, 0.0015, 8), 'steel', { position: [x, y - 0.02, 0.138], rotation: [PI / 2, 0, 0] });
  }
  beam(b, [-0.42, 0.16, -0.131], [0.42, 1.55, -0.131], 0.004);
  beam(b, [0.42, 0.16, -0.131], [-0.42, 1.55, -0.131], 0.004);
  const book = (x, y, w, h, material, lean = 0) => {
    const rotation = [0, 0, lean];
    b.add(box(w, h, 0.174, 0.001), material, { position: [x, y + h / 2, 0.008], rotation });
    b.add(box(w - 0.005, h - 0.010, 0.164), 'paper', { position: [x, y + h / 2, 0.004], rotation });
    // Spines on the visitor side; spare foil rules make the books read at room distance.
    b.add(box(w, h, 0.005, 0.001), material, { position: [x, y + h / 2, 0.097], rotation });
    for (const dy of [-h * 0.32, h * 0.33]) b.add(box(w * 0.65, 0.002, 0.001), 'paper', { position: [x - dy * Math.sin(lean), y + h / 2 + dy * Math.cos(lean), 0.100], rotation });
  };
  let x = -0.377;
  for (const [w, h, m] of [[0.036, 0.235, 'robotNavy'], [0.031, 0.26, 'fabric'], [0.046, 0.215, 'wood'], [0.024, 0.247, 'accentOrange'], [0.041, 0.266, 'robotNavy']]) {
    book(x + w / 2, 0.851, w, h, m); x += w + 0.005;
  }
  book(-0.13, 0.855, 0.027, 0.222, 'fabric', radians(-10));
  for (let i = 0; i < 3; i++) {
    const x = -0.31 + i * 0.067;
    b.add(box(0.057, 0.292, 0.22, 0.002), i === 1 ? 'robotNavy' : 'fabric', { position: [x, 0.637, 0] });
    b.add(box(0.028, 0.059, 0.001), 'paper', { position: [x, 0.671, 0.111] });
    b.add(torus(0.008, 0.002, 6, 16), 'steel', { position: [x, 0.555, 0.112] });
  }
  // A horizontal filament spool, its winding and flanges sharing existing batches.
  b.add(cyl(0.095, 0.095, 0.073, 40), 'accentOrange', { position: [0.236, 0.906, 0] });
  for (const y of [0.859, 0.951]) b.add(cyl(0.105, 0.105, 0.006, 40), 'plasticBlack', { position: [0.236, y, 0] });
  for (let i = 0; i < 13; i++) b.add(torus(0.095, 0.0008, 4, 40), 'accentOrange', { position: [0.236, 0.869 + i * 0.0058, 0], rotation: [PI / 2, 0, 0] });
  b.add(cyl(0.025, 0.025, 0.001, 24), 'paper', { position: [0.236, 0.955, 0] });
  b.add(cyl(0.016, 0.016, 0.0015, 20), 'plasticBlack', { position: [0.236, 0.956, 0] });
  // Printed bracket and a small turbine-like test piece on the next shelf.
  b.add(box(0.14, 0.014, 0.09, 0.002), 'accentOrange', { position: [0.27, 0.498, 0.005] });
  b.add(box(0.14, 0.105, 0.012, 0.002), 'accentOrange', { position: [0.27, 0.544, -0.034] });
  for (const x of [0.22, 0.32]) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.065, 0); s.lineTo(0, 0.087); s.closePath();
    b.add(extrude(s, 0.006), 'accentOrange', { position: [x, 0.505, -0.025], rotation: [0, -PI / 2, 0] });
  }
  b.add(cyl(0.018, 0.035, 0.069, 20), 'paper', { position: [0.048, 0.526, 0.014] });
  for (let i = 0; i < 9; i++) b.add(box(0.066, 0.047, 0.005, 0.001), 'paper', { position: [0.048 + Math.cos(i * 2 * PI / 9) * 0.037, 0.53, 0.014 + Math.sin(i * 2 * PI / 9) * 0.037], rotation: [0.35, -i * 2 * PI / 9, 0] });
  b.add(box(0.31, 0.17, 0.215, 0.008), 'fabric', { position: [0.22, 0.216, 0] });
  b.add(box(0.325, 0.015, 0.223, 0.003), 'plasticBlack', { position: [0.22, 0.308, 0] });
  b.add(box(0.065, 0.022, 0.003, 0.002), 'blackMetal', { position: [0.22, 0.26, 0.109] });
  for (let i = 0; i < 3; i++) b.add(box(0.245 - i * 0.015, 0.025, 0.18, 0.001), i === 1 ? 'paper' : 'robotNavy', { position: [-0.235, 0.145 + i * 0.027, 0] });
  // Plant is below the top rail, preserving the 1.6 m total height.
  b.add(cyl(0.065, 0.048, 0.105, 32), 'wood', { position: [-0.284, 1.2635, 0.015] });
  b.add(torus(0.064, 0.004, 8, 32), 'wood', { position: [-0.284, 1.316, 0.015], rotation: [PI / 2, 0, 0] });
  b.add(cyl(0.060, 0.060, 0.004, 24), 'woodDark', { position: [-0.284, 1.306, 0.015] });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = 0.032 + (i % 3) * 0.014, y = 1.39 + (i % 3) * 0.045;
    const end = [-0.284 + Math.cos(a) * r, y, 0.015 + Math.sin(a) * r];
    beam(b, [-0.284, 1.308, 0.015], end, 0.002, 'pcbGreen', 6);
    b.add(sphere(1, 12, 8), 'pcbGreen', { position: end, rotation: [0.25 * Math.cos(a), a, 0.45 * Math.sin(a)], scale: [0.020, 0.048, 0.004] });
  }
  book(-0.01, 1.211, 0.031, 0.26, 'wood'); book(0.033, 1.211, 0.046, 0.24, 'robotNavy');
  b.add(torus(0.06, 0.012, 8, 32), 'accentOrange', { position: [0.252, 1.285, 0.015], rotation: [0, radians(20), 0] });
  b.add(box(0.145, 0.012, 0.085, 0.002), 'plasticBlack', { position: [0.252, 1.217, 0.015] });
  return floorCentered(b.build());
}

export default function createProps() {
  const group = new THREE.Group(); group.name = 'props';
  const entries = [[createDesk(), -1.82], [createChair(), -0.60], [createGuitar(), 0.22], [createStool(), 0.91], [createShelf(), 1.86]];
  for (const [prop, x] of entries) { prop.position.x = x; group.add(prop); }
  return floorCentered(group);
}
