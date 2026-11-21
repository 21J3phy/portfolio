import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, box, cyl, sphere, torus, tube } from './kit.js';

const PI = Math.PI;

// Metres, +Y up. The doorway origin stays on the floor; do not floorCenter it.
// Room-side drywall is z=0, outside is -Z. Rotation -Y opens into +Z.
export const DOOR = Object.freeze({ width: 0.915, height: 2.032, hingeX: -0.4595, openSign: -1 });
export const OPENING = Object.freeze({ width: 0.967, height: 2.070 });
export const PHONE_SCREEN = Object.freeze({ w: 0.0667, h: 0.1428 });

const paint = new THREE.MeshStandardMaterial({ name: 'fixtures:eggshellPaint', color: 0xe9e6de, roughness: 0.57 });
const titanium = new THREE.MeshStandardMaterial({ name: 'fixtures:naturalTitanium', color: 0xada79a, metalness: 1, roughness: 0.36 });
const polishedTitanium = new THREE.MeshStandardMaterial({ name: 'fixtures:machinedTitanium', color: 0xc1bcaf, metalness: 1, roughness: 0.22 });
const backGlass = new THREE.MeshPhysicalMaterial({ name: 'fixtures:frostedGlass', color: 0xb4b0a6, roughness: 0.63, metalness: 0.08, clearcoat: 0.25, clearcoatRoughness: 0.40 });
const frontGlass = new THREE.MeshPhysicalMaterial({ name: 'fixtures:frontGlass', color: 0x111316, roughness: 0.10, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.06 });
const sapphire = new THREE.MeshPhysicalMaterial({ name: 'fixtures:sapphire', color: 0x14222d, metalness: 0.40, roughness: 0.13, clearcoat: 1, clearcoatRoughness: 0.05 });
const flashGlass = new THREE.MeshStandardMaterial({ name: 'fixtures:flashGlass', color: 0xded5b5, roughness: 0.26 });
const screenMaterial = new THREE.MeshBasicMaterial({ name: 'fixtures:screen', color: 0x000000 });
let oakMaterial;

function customMesh(geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// Builder owns the hierarchy; these batches let it use module-shared custom materials.
function surfaces(builder) {
  const batches = new Map();
  return {
    add(geometry, material, t = {}) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...(t.position || [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.rotation || [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1),
      );
      g.applyMatrix4(matrix);
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push(g);
      geometry.dispose();
    },
    finish() {
      for (const [material, gs] of batches) {
        const geometry = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
        if (gs.length > 1) for (const g of gs) g.dispose();
        builder.object(customMesh(geometry, material, builder.name + ':' + material.name));
      }
      batches.clear();
    },
  };
}

function oak() {
  if (oakMaterial) return oakMaterial;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 1024;
  const c = canvas.getContext('2d');
  let seed = 70429;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  c.fillStyle = '#c39c6e'; c.fillRect(0, 0, 512, 1024);
  // Long, softly wandering pores and growth bands, with a seamless Y repeat.
  for (let i = 0; i < 760; i++) {
    const x = rand() * 512, wave = 1.2 + rand() * 4.8, phase = rand() * PI * 2;
    c.strokeStyle = `rgba(${rand() < 0.64 ? '87,53,28' : '242,214,163'},${0.025 + rand() * 0.085})`;
    c.lineWidth = i < 50 ? 3 + rand() * 7 : 0.35 + rand() * 1.1;
    c.beginPath();
    for (let y = 0; y <= 1024; y += 16) {
      const xx = x + Math.sin(y / 1024 * PI * 2 + phase) * wave;
      if (y === 0) c.moveTo(xx, y); else c.lineTo(xx, y);
    }
    c.stroke();
  }
  for (let i = 0; i < 1200; i++) {
    c.fillStyle = `rgba(76,46,24,${0.025 + rand() * 0.095})`;
    c.fillRect(rand() * 512, rand() * 1024, 0.45 + rand() * 0.8, 1 + rand() * 11);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'quarterSawnOak'; texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  oakMaterial = new THREE.MeshStandardMaterial({ name: 'fixtures:oak', map: texture, bumpMap: texture, bumpScale: 0.00005, color: 0xeee0cb, roughness: 0.46 });
  return oakMaterial;
}

// Physical-scale UVs keep grain vertical on stiles/panels and horizontal on rails.
function oakBox(w, h, d, horizontal = false, offset = 0) {
  const g = box(w, h, d, 0.0014, 1);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (horizontal) uv.setXY(i, (Math.abs(n.getY(i)) > 0.65 ? z : y) / 0.20 + offset, x / 1.1 + offset * 0.37);
    else uv.setXY(i, (Math.abs(n.getX(i)) > 0.65 ? z : x) / 0.20 + offset, y / 1.1 + offset * 0.37);
  }
  return g;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2);
  s.absarc(x, -y, r, -PI / 2, 0, false); s.lineTo(w / 2, y);
  s.absarc(x, y, r, 0, PI / 2, false); s.lineTo(-x, h / 2);
  s.absarc(-x, y, r, PI / 2, PI, false); s.lineTo(-w / 2, -y);
  s.absarc(-x, -y, r, PI, PI * 1.5, false); s.closePath();
  return s;
}

// Bevels are included in the stated dimensions, not added outside them.
function plate(w, h, d, radius, bevel = 0.00025, segments = 6) {
  const shape = roundedRect(w - 2 * bevel, h - 2 * bevel, radius - bevel);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: d < 0.0035 ? 1 : 2, curveSegments: segments, steps: 1 });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  g.deleteAttribute('normal');
  const smooth = mergeVertices(g, 0.000001); smooth.computeVertexNormals(); g.dispose();
  return smooth;
}

function polygon(points, depth, z) {
  const shape = new THREE.Shape(); shape.moveTo(...points[0]);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, z); return g;
}

function casing(batch, innerX, innerY, width, depth, z) {
  // Mitred corners at each profile tier; no coplanar overlapping boxes.
  const outerX = innerX + width, outerY = innerY + width;
  for (const side of [-1, 1]) batch.add(polygon([
    [side * innerX, 0], [side * outerX, 0], [side * outerX, outerY], [side * innerX, innerY],
  ], depth, z), paint);
  batch.add(polygon([[-outerX, outerY], [outerX, outerY], [innerX, innerY], [-innerX, innerY]], depth, z), paint);
}

/** Door set only: surrounding drywall and the bright exterior belong to the room. */
export function createDoor() {
  const b = new Builder('door'), trim = surfaces(b);
  const width = DOOR.width, height = DOOR.height;
  const leafBottom = 0.012, leafFront = -0.003, leafDepth = 0.045;
  const hingeZ = 0.012, innerX = 0.4615, innerTop = 2.048;
  const localX = (x) => x - DOOR.hingeX;
  const localZ = (z) => z - hingeZ;
  // 22 mm jambs occupy precisely z=[-0.12,0], with a 4 mm leaf reveal.
  for (const side of [-1, 1]) {
    trim.add(box(0.022, innerTop, 0.12, 0.0007, 1), paint, { position: [side * (innerX + 0.011), innerTop / 2, -0.06] });
    trim.add(box(0.012, innerTop - 0.012, 0.017, 0.001, 1), paint, { position: [side * (innerX - 0.006), (innerTop + 0.012) / 2, -0.0575] });
  }
  trim.add(box(OPENING.width, 0.022, 0.12, 0.0007, 1), paint, { position: [0, innerTop + 0.011, -0.06] });
  trim.add(box(innerX * 2, 0.012, 0.017, 0.001, 1), paint, { position: [0, innerTop - 0.006, -0.0575] });
  casing(trim, innerX + 0.008, innerTop + 0.008, 0.070, 0.010, 0);
  casing(trim, innerX + 0.017, innerTop + 0.017, 0.050, 0.005, 0.010);
  casing(trim, innerX + 0.022, innerTop + 0.022, 0.038, 0.002, 0.015);
  casing(trim, innerX + 0.008, innerTop + 0.008, 0.060, 0.010, -0.130);
  b.add(box(innerX * 2, 0.004, 0.12, 0.001, 1), 'aluminum', { position: [0, 0.002, -0.060] });
  for (const z of [-0.108, -0.098]) b.add(box(innerX * 2 - 0.012, 0.00035, 0.001), 'aluminumDark', { position: [0, 0.0041, z] });

  const leaf = b.part('doorLeaf', { position: [DOOR.hingeX, 0, hingeZ] });
  const wood = surfaces(leaf), oakMat = oak();
  const centerZ = localZ(leafFront - leafDepth / 2), stile = 0.116;
  for (const side of [-1, 1]) wood.add(oakBox(stile, height, leafDepth, false, side === -1 ? 0.13 : 0.69), oakMat,
    { position: [localX(side * (width - stile) / 2), leafBottom + height / 2, centerZ] });
  const railWidth = width - 2 * stile, bottomRail = 0.190, topRail = 0.136, crossRail = 0.092;
  const panelHeight = (height - bottomRail - topRail - 2 * crossRail) / 3;
  wood.add(oakBox(railWidth, bottomRail, leafDepth, true, 0.33), oakMat, { position: [localX(0), leafBottom + bottomRail / 2, centerZ] });
  wood.add(oakBox(railWidth, topRail, leafDepth, true, 0.81), oakMat, { position: [localX(0), leafBottom + height - topRail / 2, centerZ] });
  for (let i = 0; i < 3; i++) {
    const bottom = leafBottom + bottomRail + i * (panelHeight + crossRail);
    wood.add(oakBox(railWidth + 0.004, panelHeight + 0.004, 0.019, false, 0.17 + i * 0.31), oakMat, { position: [localX(0), bottom + panelHeight / 2, centerZ] });
    if (i < 2) wood.add(oakBox(railWidth, crossRail, leafDepth, true, i * 0.37), oakMat, { position: [localX(0), bottom + panelHeight + crossRail / 2, centerZ] });
  }
  // Hinges have interleaved fixed/moving knuckles; the pins share doorLeaf's Y axis.
  for (const y of [0.235, 1.030, 1.825]) {
    b.add(box(0.002, 0.088, 0.035, 0.0005, 1), 'steel', { position: [-innerX + 0.0002, y, -0.013] });
    leaf.add(box(0.002, 0.088, 0.035, 0.0005, 1), 'steel', { position: [0.0025, y, -0.025] });
    for (let i = 0; i < 5; i++) {
      const moving = i % 2 === 1, owner = moving ? leaf : b;
      owner.add(cyl(0.0055, 0.0055, 0.0164, 16), 'steel', { position: [moving ? 0 : DOOR.hingeX, y - 0.034 + i * 0.017, moving ? 0 : hingeZ] });
    }
    for (const end of [-1, 1]) b.add(sphere(0.0056, 12, 6), 'steel', { position: [DOOR.hingeX, y + end * 0.044, hingeZ], scale: [1, 0.4, 1] });
    for (const dy of [-0.028, 0, 0.028]) {
      b.add(cyl(0.0028, 0.0028, 0.0007, 10), 'steel', { position: [-innerX + 0.0017, y + dy, -0.018], rotation: [0, 0, PI / 2] });
      b.add(box(0.0008, 0.0007, 0.0033), 'aluminumDark', { position: [-innerX + 0.0021, y + dy, -0.018] });
      leaf.add(cyl(0.0028, 0.0028, 0.0007, 10), 'steel', { position: [0.0009, y + dy, -0.030], rotation: [0, 0, PI / 2] });
      leaf.add(box(0.0008, 0.0007, 0.0033), 'aluminumDark', { position: [0.0005, y + dy, -0.030] });
    }
  }

  const handleX = width / 2 - 0.065, handleY = 1.020;
  // Both lever grips share the spindle. Positive rotation.z dips the room-side grip.
  const handle = leaf.part('doorHandle', { position: [localX(handleX), handleY, localZ(leafFront)] });
  for (const face of [-1, 1]) {
    const faceZ = face === 1 ? leafFront : leafFront - leafDepth;
    leaf.add(cyl(0.025, 0.025, 0.0055, 32), 'steel', { position: [localX(handleX), handleY, localZ(faceZ + face * 0.00275)], rotation: [PI / 2, 0, 0] });
    leaf.add(torus(0.0241, 0.0006, 5, 32), 'aluminumDark', { position: [localX(handleX), handleY, localZ(faceZ + face * 0.0056)] });
    const origin = face === 1 ? 0 : -leafDepth;
    handle.add(cyl(0.009, 0.009, 0.034, 20), 'steel', { position: [0, 0, origin + face * 0.023], rotation: [PI / 2, 0, 0] });
    handle.add(tube([[0, 0, origin + face * 0.034], [-0.010, 0, origin + face * 0.045], [-0.040, 0, origin + face * 0.048], [-0.108, 0, origin + face * 0.048]], 0.0076, 16, 8), 'steel');
    handle.add(sphere(0.0076, 12, 8), 'steel', { position: [-0.108, 0, origin + face * 0.048] });
    leaf.add(cyl(0.014, 0.014, 0.0035, 24), 'steel', { position: [localX(handleX), 0.942, localZ(faceZ + face * 0.00175)], rotation: [PI / 2, 0, 0] });
    leaf.add(cyl(0.0028, 0.0028, 0.0006, 12), 'plasticBlack', { position: [localX(handleX), 0.943, localZ(faceZ + face * 0.0037)], rotation: [PI / 2, 0, 0] });
    leaf.add(box(0.0032, 0.006, 0.0006, 0.0003, 1), 'plasticBlack', { position: [localX(handleX), 0.939, localZ(faceZ + face * 0.0037)] });
  }
  // Latch face plate and strike on the opposite jamb, revealed when open.
  leaf.add(box(0.0012, 0.057, 0.024, 0.0005, 1), 'steel', { position: [localX(width / 2), handleY, centerZ] });
  leaf.add(box(0.0018, 0.012, 0.012, 0.0008, 1), 'aluminumDark', { position: [localX(width / 2 + 0.0007), handleY, centerZ] });
  b.add(box(0.0012, 0.061, 0.034, 0.0005, 1), 'steel', { position: [innerX - 0.0007, handleY, -0.025] });
  b.add(box(0.0007, 0.019, 0.013), 'plasticBlack', { position: [innerX - 0.0014, handleY, -0.025] });
  for (const dy of [-0.022, 0.022]) {
    leaf.add(cyl(0.0025, 0.0025, 0.0007, 10), 'steel', { position: [localX(width / 2 + 0.001), handleY + dy, centerZ], rotation: [0, 0, PI / 2] });
    b.add(cyl(0.0025, 0.0025, 0.0007, 10), 'steel', { position: [innerX - 0.0016, handleY + dy, -0.025], rotation: [0, 0, PI / 2] });
  }
  trim.finish(); wood.finish();
  const group = b.build();
  group.userData.opening = { ...OPENING };
  group.userData.hingeAxis = [DOOR.hingeX, 0, hingeZ];
  return group;
}

/** Nominal 71.5 x 147.6 x 7.8 mm body; camera lenses/buttons extend beyond it. */
export function createPhone() {
  const b = new Builder('phone'), finish = surfaces(b);
  const w = 0.0715, h = 0.1476;
  // The glass stack completes the 7.8 mm body. Separate planes by at least
  // 0.15 mm so a room camera's near/far range does not cause depth flicker.
  finish.add(plate(w, h, 0.0072, 0.010, 0.00055, 8), titanium);
  finish.add(plate(w - 0.0010, h - 0.0010, 0.00045, 0.0095, 0.00012, 8), frontGlass, { position: [0, 0, 0.003525] });
  finish.add(plate(w - 0.0010, h - 0.0010, 0.00065, 0.0095, 0.00012, 8), backGlass, { position: [0, 0, -0.003565] });

  const screenGeometry = new THREE.ShapeGeometry(roundedRect(PHONE_SCREEN.w, PHONE_SCREEN.h, 0.0076), 12);
  const position = screenGeometry.attributes.position, uv = screenGeometry.attributes.uv;
  screenGeometry.computeBoundingBox();
  const screenBounds = screenGeometry.boundingBox;
  for (let i = 0; i < uv.count; i++) uv.setXY(i,
    (position.getX(i) - screenBounds.min.x) / (screenBounds.max.x - screenBounds.min.x),
    (position.getY(i) - screenBounds.min.y) / (screenBounds.max.y - screenBounds.min.y));
  b.object(customMesh(screenGeometry, screenMaterial, 'screen'), { position: [0, 0, 0.00391] });
  // The island remains distinct when the integrator puts content on the screen.
  finish.add(plate(0.0218, 0.0061, 0.00030, 0.00305, 0.00006, 6), frontGlass, { position: [0, 0.0617, 0.00412] });
  finish.add(new THREE.CircleGeometry(0.0015, 20), sapphire, { position: [0.0073, 0.0617, 0.00429] });
  b.add(box(0.011, 0.00045, 0.00025, 0.0001, 1), 'plasticBlack', { position: [0, 0.07285, 0.00391] });

  // Buttons: action + two volume on the left; side + camera control on the right.
  const buttons = [[-1, 0.044, 0.0060], [-1, 0.026, 0.0110], [-1, 0.010, 0.0110], [1, 0.027, 0.018], [1, -0.036, 0.014]];
  for (let i = 0; i < buttons.length; i++) {
    const [side, y, length] = buttons[i];
    const t = { position: [side * (w / 2 + 0.00017), y, 0], rotation: [0, side * PI / 2, 0] };
    b.add(new THREE.ShapeGeometry(roundedRect(0.00285, length + 0.00065, 0.0014), 4), 'plasticBlack', t);
    finish.add(plate(0.00245, length, 0.00065, 0.0012, 0.00012, 2), i === 4 ? polishedTitanium : titanium,
      { position: [side * (w / 2 + 0.00040), y, 0], rotation: t.rotation });
    if (i === 4) finish.add(plate(0.00165, 0.0118, 0.00015, 0.0008, 0.00004, 4), sapphire,
      { position: [side * (w / 2 + 0.00076), y, 0], rotation: t.rotation });
  }
  // Fine antenna separators wrap the exposed side band.
  for (const x of [-w / 2, w / 2]) for (const y of [-0.056, 0.057]) {
    b.add(box(0.00016, 0.00065, 0.0058, 0.00006, 1), 'plasticGrey', { position: [x, y, 0] });
  }
  // Bottom USB-C recess and two rows of bored speaker/microphone apertures.
  b.add(plate(0.0083, 0.0026, 0.0003, 0.0012, 0.00005, 4), 'plasticBlack', { position: [0, -h / 2 - 0.00004, 0], rotation: [PI / 2, 0, 0] });
  finish.add(box(0.0058, 0.00018, 0.0006, 0.00008, 1), titanium, { position: [0, -h / 2 - 0.00023, 0] });
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) b.add(cyl(0.00065, 0.00065, 0.00018, 10), 'plasticBlack', { position: [side * (0.010 + i * 0.00225), -h / 2 - 0.00003, 0] });

  // Rear camera island is at +X when seen from the front (-X in the rear view).
  const island = [0.0138, 0.0498];
  finish.add(plate(0.0357, 0.0368, 0.0022, 0.008, 0.00045, 8), backGlass, { position: [...island, -0.00475] });
  for (const [x, y] of [[0.0230, 0.0590], [0.0230, 0.0408], [0.0052, 0.0499]]) {
    finish.add(cyl(0.00765, 0.00765, 0.00245, 24), polishedTitanium, { position: [x, y, -0.00630], rotation: [PI / 2, 0, 0] });
    b.add(cyl(0.00695, 0.00695, 0.00040, 24), 'plasticBlack', { position: [x, y, -0.00758], rotation: [PI / 2, 0, 0] });
    finish.add(torus(0.00664, 0.00028, 4, 24), sapphire, { position: [x, y, -0.00784] });
    finish.add(new THREE.CircleGeometry(0.00635, 32), sapphire, { position: [x, y, -0.00782], rotation: [0, PI, 0] });
    b.add(cyl(0.0034, 0.0034, 0.00007, 24), 'plasticBlack', { position: [x, y, -0.00787], rotation: [PI / 2, 0, 0] });
    finish.add(new THREE.CircleGeometry(0.00235, 24), sapphire, { position: [x, y, -0.00793], rotation: [0, PI, 0] });
  }
  finish.add(cyl(0.0033, 0.0033, 0.00040, 24), polishedTitanium, { position: [0.005, 0.0637, -0.00592], rotation: [PI / 2, 0, 0] });
  finish.add(cyl(0.00285, 0.00285, 0.00024, 24), flashGlass, { position: [0.005, 0.0637, -0.00621], rotation: [PI / 2, 0, 0] });
  b.add(cyl(0.0025, 0.0025, 0.00030, 24), 'plasticBlack', { position: [0.005, 0.0365, -0.00597], rotation: [PI / 2, 0, 0] });
  finish.add(new THREE.CircleGeometry(0.0017, 20), sapphire, { position: [0.005, 0.0365, -0.00614], rotation: [0, PI, 0] });
  b.add(cyl(0.00065, 0.00065, 0.00015, 10), 'plasticBlack', { position: [-0.0009, 0.0368, -0.00589], rotation: [PI / 2, 0, 0] });
  finish.finish();
  const phone = b.build();
  phone.userData.bodySize = [w, h, 0.0078];
  phone.userData.screenSize = { ...PHONE_SCREEN };
  return phone;
}

/** Preview composition only: exported constructors above always use real metres. */
export default function createFixtures() {
  const group = new THREE.Group(); group.name = 'fixtures';
  const door = createDoor(); door.position.x = -0.35;
  const phone = createPhone(); phone.scale.setScalar(6); phone.position.set(0.64, 0.445, 0.06);
  group.add(door, phone); return group;
}
