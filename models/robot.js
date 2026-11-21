import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, box, cyl, torus, lathe, extrude, tube, labelTexture } from './kit.js';

// FTC 12096, Absolute Zero. Metres; front is +Z. Only the slide carriage and
// its head translate: slides.position.z = extension, in the range 0 ... 0.22.
const TAU = Math.PI * 2;
const AXLE = [0, 0, -Math.PI / 2];
const SIDE = [0, -Math.PI / 2, 0];

function outline(points) {
  const s = new THREE.Shape();
  s.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) s.lineTo(...points[i]);
  s.closePath();
  return s;
}

function drill(s, x, y, r, n = 8) {
  const h = new THREE.Path();
  for (let i = 0; i < n; i++) {
    const a = -i * TAU / n;
    const p = [x + r * Math.cos(a), y + r * Math.sin(a)];
    i ? h.lineTo(...p) : h.moveTo(...p);
  }
  h.closePath();
  s.holes.push(h);
}

function pocket(s, points) {
  const h = new THREE.Path();
  h.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) h.lineTo(...points[i]);
  h.closePath();
  s.holes.push(h);
}

function rect(w, h) {
  return outline([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
}

function addBox(b, dimensions, material, position, radius = 0.001, rotation) {
  b.add(box(...dimensions, radius, 1), material, { position, rotation });
}

function axle(b, r, length, material, position, n = 16) {
  b.add(cyl(r, r, length, n), material, { position, rotation: AXLE });
}

function bolt(b, position, normal = [0, 1, 0], radius = 0.0023) {
  const g = cyl(radius, radius, 0.0017, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(...normal)));
  b.add(g, 'aluminum', { position });
}

function wire(b, points, radius = 0.0016, material = 'rubber', segments = 22) {
  b.add(tube(points, radius, segments, 6), material);
}

function spur(radius, root, teeth, bore = 0) {
  const p = [];
  for (let i = 0; i < teeth; i++) {
    for (const [fraction, r] of [[0, root], [0.20, radius], [0.62, radius], [0.82, root]]) {
      const a = TAU * (i + fraction) / teeth;
      p.push([r * Math.cos(a), r * Math.sin(a)]);
    }
  }
  const s = outline(p);
  if (bore) drill(s, 0, 0, bore, 48);
  return s;
}

// A U-channel with real through-holes in the web and both flanges.
function crossChannel(b, z) {
  const web = rect(0.301, 0.038);
  for (let x = -0.136; x < 0.14; x += 0.016) {
    drill(web, x, -0.008, 0.0025);
    drill(web, x, 0.008, 0.0025);
  }
  b.add(extrude(web, 0.0025), 'aluminum', {
    position: [0, 0.095, z], rotation: [-Math.PI / 2, 0, 0],
  });
  const flange = rect(0.301, 0.029);
  for (let x = -0.136; x < 0.14; x += 0.016) drill(flange, x, 0, 0.0032);
  for (const edge of [-1, 1]) b.add(extrude(flange, 0.0025), 'aluminum', {
    position: [0, 0.1085, z + edge * 0.019],
  });
}

function wheel(b, name, x, z, handedness) {
  const w = b.part(name, { position: [x, 0.052, z] });
  const outside = Math.sign(x);

  // Nine barrel-shaped rollers, with alternating wheel handedness. The
  // barrel's middle is exactly at a 52 mm rolling radius above the floor.
  const barrel = lathe([
    [0.0038, -0.022], [0.0080, -0.017], [0.0113, -0.009],
    [0.0123, 0], [0.0113, 0.009], [0.0080, 0.017], [0.0038, 0.022],
  ], 10);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + i * TAU / 9;
    const axis = new THREE.Vector3(handedness, -Math.sin(a), Math.cos(a)).normalize();
    const radial = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
    const across = new THREE.Vector3().crossVectors(axis, radial);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, axis, radial));
    const roller = barrel.clone().applyQuaternion(q);
    w.add(roller, 'rubber', { position: [0, 0.0397 * Math.cos(a), 0.0397 * Math.sin(a)] });
    const pin = cyl(0.0021, 0.0021, 0.047, 6).applyQuaternion(q);
    w.add(pin, 'aluminum', { position: [0, 0.0397 * Math.cos(a), 0.0397 * Math.sin(a)] });
  }

  const hub = new THREE.Shape();
  hub.absarc(0, 0, 0.032, 0, TAU, false);
  drill(hub, 0, 0, 0.005, 12);
  for (let i = 0; i < 9; i++) {
    const a = i * TAU / 9;
    drill(hub, Math.cos(a) * 0.023, Math.sin(a) * 0.023, 0.0045);
  }
  for (const s of [-1, 1]) w.add(extrude(hub, 0.002), 'brass', {
    position: [s * 0.014, 0, 0], rotation: SIDE,
  });
  axle(w, 0.014, 0.039, 'aluminum', [0, 0, 0]);
  axle(w, 0.009, 0.003, 'brass', [outside * 0.021, 0, 0], 12);
  bolt(w, [outside * 0.024, 0, 0], [outside, 0, 0], 0.0043);
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    bolt(w, [outside * 0.017, 0.018 * Math.cos(a), 0.018 * Math.sin(a)], [outside, 0, 0], 0.0017);
  }
}

function bumperProfile() {
  // Open wheel arches deliberately expose the roller barrels, as well as
  // the brass carrier plates. The middle belly is the curved blue fairing.
  const s = new THREE.Shape();
  s.moveTo(-0.224, 0.026);
  s.lineTo(-0.196, 0.026);
  s.absarc(-0.148, 0.054, 0.0555, Math.PI + 0.53, -0.53, true);
  s.bezierCurveTo(-0.075, 0.040, -0.058, 0.053, 0, 0.049);
  s.bezierCurveTo(0.052, 0.051, 0.075, 0.040, 0.100, 0.026);
  s.absarc(0.148, 0.054, 0.0555, Math.PI + 0.53, -0.53, true);
  s.lineTo(0.224, 0.026);
  s.lineTo(0.224, 0.087);
  s.bezierCurveTo(0.223, 0.125, 0.191, 0.150, 0.154, 0.151);
  s.lineTo(0.113, 0.151);
  s.lineTo(0.093, 0.174);
  s.lineTo(-0.100, 0.174);
  s.lineTo(-0.120, 0.151);
  s.bezierCurveTo(-0.182, 0.158, -0.220, 0.127, -0.224, 0.087);
  s.closePath();
  return s;
}

// All fixed printed markings share one runtime canvas atlas and one draw.
function labels(b) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#142455'; ctx.fillRect(0, 0, 1024, 1024);
  const number = labelTexture('12096', {
    w: 768, h: 256, bg: '#142455', fg: '#fffdf4',
    font: '900 238px "Arial Narrow", Arial, sans-serif',
  });
  ctx.drawImage(number.image, 0, 0, 1024, 256);
  number.dispose();
  ctx.strokeStyle = '#7086b4'; ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, 1012, 244);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8eef4'; ctx.font = '700 61px Arial, sans-serif';
  ctx.fillText('ABSOLUTE ZERO', 512, 330);
  ctx.fillStyle = '#8eaddf'; ctx.font = '500 30px Arial, sans-serif';
  ctx.fillText('FIRST TECH CHALLENGE   /   12096', 512, 394);

  ctx.fillStyle = '#181b20'; ctx.fillRect(0, 448, 1024, 256);
  ctx.fillStyle = '#ff641f'; ctx.fillRect(0, 448, 22, 256);
  ctx.textAlign = 'left'; ctx.fillStyle = '#f4f3ed';
  ctx.font = '900 69px Arial, sans-serif'; ctx.fillText('REV', 62, 502);
  ctx.font = '700 43px Arial, sans-serif'; ctx.fillText('CONTROL HUB', 62, 568);
  ctx.font = '400 25px monospace'; ctx.fillStyle = '#949ca8';
  ctx.fillText('12V DC     USB     RS485', 62, 630);
  ctx.fillText('MOTOR  0   1   2   3     SERVO  0—5', 62, 674);
  ctx.fillStyle = '#21262e'; ctx.fillRect(0, 736, 1024, 224);
  ctx.fillStyle = '#f3efe7'; ctx.font = '700 63px Arial, sans-serif';
  ctx.fillText('12V  /  NiMH', 62, 793);
  ctx.font = '400 37px monospace'; ctx.fillStyle = '#a9b1bb';
  ctx.fillText('3000 mAh  ·  FTC 12096', 62, 860);
  ctx.fillStyle = '#ff641f'; ctx.fillRect(62, 908, 380, 7);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.58, metalness: 0 });
  material.name = 'robot:printed-plates';
  const gs = [];
  function decal(w, h, y0, y1, position, rotation = [0, 0, 0]) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (y1 - uv.getY(i) * (y1 - y0)) / 1024);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1)));
    gs.push(g);
  }
  decal(0.268, 0.067, 0, 256, [0, 0.141, 0.2212]);
  for (const sign of [-1, 1]) {
    decal(0.169, 0.0423, 0, 256, [sign * 0.2236, 0.143, 0], [0, sign * Math.PI / 2, 0]);
  }
  decal(0.235, 0.040, 264, 431, [0, 0.116, -0.2213], [0, Math.PI, 0]);
  decal(0.098, 0.025, 448, 704, [0.059, 0.1673, -0.139], [-Math.PI / 2, 0, 0]);
  decal(0.045, 0.061, 736, 960, [-0.087, 0.170, -0.140], [-Math.PI / 2, 0, Math.PI / 2]);
  const mesh = new THREE.Mesh(mergeGeometries(gs, false), material);
  mesh.name = 'robot:labels';
  b.object(mesh);
}

function chassis(b) {
  // 1/8-inch custom aluminum side plates, with machined windows and a
  // sparse, genuine 8/16 mm hole grid rather than a dotted solid surface.
  const plate = rect(0.380, 0.073);
  for (const center of [-0.107, 0, 0.107]) {
    pocket(plate, [[center - 0.036, -0.017], [center - 0.029, 0.020],
      [center + 0.028, 0.020], [center + 0.037, -0.017]]);
  }
  for (let z = -0.176; z < 0.18; z += 0.016) {
    drill(plate, z, 0.029, 0.0022);
    drill(plate, z, -0.029, 0.0022);
  }
  for (const side of [-1, 1]) {
    b.add(extrude(plate, 0.003175), 'aluminum', { position: [side * 0.153, 0.078, 0], rotation: SIDE });
    for (const z of [-0.148, 0.148]) {
      axle(b, 0.017, 0.043, 'aluminum', [side * 0.119, 0.059, z]);
      axle(b, 0.019, 0.022, 'blackMetal', [side * 0.150, 0.059, z]);
      axle(b, 0.011, 0.006, 'plasticBlack', [side * 0.095, 0.059, z]);
      axle(b, 0.004, 0.035, 'aluminum', [side * 0.166, 0.052, z]);
      bolt(b, [side * 0.156, 0.083, z + 0.021], [side, 0, 0]);
      wire(b, [[side * 0.096, 0.060, z], [side * 0.083, 0.079, z],
        [side * 0.13, 0.118, z * 0.62], [side * 0.120, 0.150, -0.11]], 0.0017);
    }
  }
  crossChannel(b, -0.122);
  crossChannel(b, 0.046);
  // Rear perforated electronics tray, still open under the front intake.
  const tray = rect(0.268, 0.113);
  for (let x = -0.120; x < 0.13; x += 0.024) {
    for (const z of [-0.042, 0.042]) drill(tray, x, z, 0.003);
  }
  b.add(extrude(tray, 0.002), 'blackMetal', { position: [0, 0.123, -0.139], rotation: [-Math.PI / 2, 0, 0] });

  const panel = bumperProfile();
  for (const side of [-1, 1]) {
    b.add(extrude(panel, 0.0048, 0.0008), 'robotBlue', { position: [side * 0.219, 0, 0], rotation: SIDE });
    // Raised front/rear returns and a dark seam down the split molded shell.
    for (const z of [-0.206, 0.206]) {
      addBox(b, [0.057, 0.030, 0.014], 'robotBlue', [side * 0.194, 0.121, z], 0.003);
      bolt(b, [side * 0.2231, 0.119, z * 0.88], [side, 0, 0], 0.0019);
    }
    addBox(b, [0.0008, 0.070, 0.0012], 'robotNavy', [side * 0.2224, 0.087, 0.021], 0);
    addBox(b, [0.178, 0.049, 0.0025], 'robotNavy', [side * 0.2221, 0.143, 0], 0.0012, [0, side * Math.PI / 2, 0]);
  }
  addBox(b, [0.326, 0.084, 0.010], 'robotBlue', [0, 0.142, 0.2148], 0.0025);
  addBox(b, [0.278, 0.074, 0.002], 'robotNavy', [0, 0.141, 0.220], 0.001);
  addBox(b, [0.431, 0.071, 0.009], 'robotBlue', [0, 0.112, -0.215], 0.003);
  addBox(b, [0.257, 0.049, 0.002], 'robotNavy', [0, 0.116, -0.220], 0.001);
  for (const x of [-0.147, 0.147]) for (const y of [0.114, 0.172]) bolt(b, [x, y, 0.221], [0, 0, 1], 0.002);
  // Low front toe rail protects the roller without closing off its mouth.
  addBox(b, [0.250, 0.012, 0.012], 'robotNavy', [0, 0.022, 0.2171], 0.002);
}

function electronics(b) {
  addBox(b, [0.111, 0.040, 0.078], 'plasticBlack', [0.059, 0.145, -0.139], 0.0025);
  addBox(b, [0.105, 0.004, 0.072], 'blackMetal', [0.059, 0.165, -0.139], 0.001);
  for (const x of [0.009, 0.109]) addBox(b, [0.008, 0.034, 0.072], 'accentOrange', [x, 0.145, -0.139], 0.001);
  for (let i = 0; i < 6; i++) {
    const x = 0.022 + i * 0.014;
    addBox(b, [0.010, 0.006, 0.009], 'plasticBlack', [x, 0.156, -0.096], 0.0005);
    addBox(b, [0.006, 0.002, 0.003], 'brass', [x, 0.157, -0.0915], 0);
  }
  for (let i = 0; i < 8; i++) addBox(b, [0.0015, 0.016, 0.0006], 'blackMetal', [0.022 + i * 0.010, 0.140, -0.1783], 0);
  for (const x of [0.017, 0.101]) for (const z of [-0.163, -0.115]) bolt(b, [x, 0.1677, z], [0, 1, 0], 0.0015);
  b.add(cyl(0.0023, 0.0023, 0.0014, 10), 'ledGreen', { position: [0.102, 0.1685, -0.115] });
  b.add(cyl(0.0016, 0.0016, 0.0014, 8), 'ledOrange', { position: [0.092, 0.1685, -0.115] });
  addBox(b, [0.054, 0.044, 0.119], 'plasticBlack', [-0.087, 0.147, -0.139], 0.003);
  for (const z of [-0.197, -0.081]) addBox(b, [0.049, 0.040, 0.004], 'accentOrange', [-0.087, 0.147, z], 0.001);
  for (const z of [-0.180, -0.108]) addBox(b, [0.059, 0.002, 0.008], 'rubber', [-0.087, 0.171, z], 0.0005);
  addBox(b, [0.018, 0.013, 0.022], 'accentOrange', [-0.046, 0.155, -0.086], 0.001);
  addBox(b, [0.014, 0.007, 0.014], 'blackMetal', [-0.046, 0.166, -0.086], 0.001);
  wire(b, [[-0.087, 0.149, -0.077], [-0.072, 0.179, -0.068], [-0.034, 0.179, -0.063],
    [-0.025, 0.153, -0.11], [0.002, 0.151, -0.137]], 0.0020, 'accentOrange');
  wire(b, [[-0.078, 0.147, -0.077], [-0.065, 0.174, -0.059], [-0.031, 0.174, -0.059],
    [-0.020, 0.148, -0.104], [0.002, 0.145, -0.136]], 0.0021);
  wire(b, [[0.061, 0.154, -0.094], [0.126, 0.178, -0.080], [0.142, 0.157, 0.016],
    [0.133, 0.114, 0.112], [0.117, 0.082, 0.173]], 0.0035);
  wire(b, [[0.082, 0.154, -0.092], [0.129, 0.188, -0.034], [0.127, 0.188, 0.083],
    [0.125, 0.192, 0.125]], 0.0013, 'accentOrange');
  for (const z of [-0.034, 0.014, 0.062]) addBox(b, [0.010, 0.002, 0.004], 'plasticBlack', [0.141, 0.169 - (z + 0.034) * 0.2, z], 0.0005);
}

function intake(b) {
  const side = outline([[-0.039, -0.025], [0.045, -0.026], [0.045, 0.010],
    [0.015, 0.029], [-0.039, 0.020]]);
  drill(side, 0.011, 0, 0.006, 12);
  pocket(side, [[-0.031, -0.017], [-0.031, 0.009], [-0.008, 0.009], [-0.008, -0.017]]);
  for (const x of [-0.107, 0.107]) b.add(extrude(side, 0.003, 0.0005), 'aluminum', {
    position: [x, 0.065, 0.174], rotation: SIDE,
  });
  for (const x of [-0.107, 0.107]) {
    addBox(b, [0.011, 0.022, 0.010], 'aluminum', [x, 0.033, 0.214], 0.0007);
    bolt(b, [x, 0.024, 0.22395], [0, 0, 1], 0.0018);
  }
  const rollers = b.part('intakeRollers', { position: [0, 0.063, 0.194] });
  axle(rollers, 0.004, 0.226, 'aluminum', [0, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.027;
    axle(rollers, 0.0225, 0.019, 'rubber', [x, 0, 0], 12);
    for (let j = 0; j < 8; j++) {
      const a = j * TAU / 8 + i * 0.15;
      rollers.add(box(0.018, 0.006, 0.008, 0.001, 1), 'rubber', {
        position: [x, 0.0235 * Math.cos(a), 0.0235 * Math.sin(a)], rotation: [a, 0, 0],
      });
    }
  }
  // Feed ramp leads back from the roller into the low carriage bay.
  addBox(b, [0.193, 0.002, 0.073], 'blackMetal', [0, 0.078, 0.146], 0, [-0.22, 0, 0]);
  for (const z of [0.139, 0.194]) {
    b.add(extrude(spur(0.014, 0.0115, 14, 0.003), 0.002), 'aluminum', {
      position: [0.114, 0.063, z], rotation: SIDE,
    });
  }
  axle(b, 0.014, 0.044, 'aluminum', [0.139, 0.063, 0.139]);
  axle(b, 0.015, 0.014, 'blackMetal', [0.112, 0.063, 0.139]);
  const chainPath = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * i / 12;
    chainPath.push([0.117, 0.063 + 0.0147 * Math.cos(a), 0.194 + 0.0147 * Math.sin(a)]);
  }
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + Math.PI * i / 12;
    chainPath.push([0.117, 0.063 + 0.0147 * Math.cos(a), 0.139 + 0.0147 * Math.sin(a)]);
  }
  chainPath.push(chainPath[0]);
  wire(b, chainPath, 0.0022, 'blackMetal', 48);
  for (let i = 0; i < 11; i++) for (const sign of [-1, 1]) {
    axle(b, 0.0016, 0.005, 'aluminum', [0.117, 0.063 + sign * 0.0147, 0.143 + i * 0.0048], 6);
  }
}

function slides(b) {
  for (const x of [-0.113, 0.113]) {
    // Fixed extrusion, running fore/aft. Black raceways keep the individual
    // stages legible under the turret, even in the fully nested pose.
    addBox(b, [0.024, 0.022, 0.329], 'aluminum', [x, 0.190, -0.024], 0.001);
    addBox(b, [0.012, 0.0016, 0.312], 'blackMetal', [x, 0.2018, -0.024], 0.0004);
    for (const dx of [-0.008, 0.008]) addBox(b, [0.003, 0.003, 0.313], 'aluminum', [x + dx, 0.203, -0.024], 0.0006);
    for (const z of [-0.176, -0.08, 0.031, 0.126]) {
      bolt(b, [x, 0.2025, z], [0, 1, 0], 0.002);
    }
    for (const z of [-0.167, 0.092]) {
      addBox(b, [0.031, 0.052, 0.019], 'blackMetal', [x, 0.152, z], 0.001);
      bolt(b, [x, 0.18, z], [0, 1, 0]);
    }
    addBox(b, [0.027, 0.025, 0.005], 'robotBlue', [x, 0.193, -0.190], 0.001);
  }
  const s = b.part('slides', { position: [0, 0.211, 0] });
  for (const x of [-0.113, 0.113]) {
    addBox(s, [0.014, 0.010, 0.292], 'aluminum', [x, 0, 0.019], 0.0007);
    addBox(s, [0.006, 0.003, 0.281], 'blackMetal', [x, 0.006, 0.020], 0.0003);
    addBox(s, [0.009, 0.007, 0.264], 'aluminum', [x, 0.011, 0.032], 0.0005);
    for (const z of [-0.110, -0.030, 0.065, 0.144]) bolt(s, [x, 0.0155, z], [0, 1, 0], 0.0015);
  }
  addBox(s, [0.251, 0.010, 0.026], 'aluminum', [0, 0.016, 0.154], 0.001);
  addBox(s, [0.134, 0.016, 0.024], 'blackMetal', [0, 0.030, 0.163], 0.001);
  axle(s, 0.0045, 0.142, 'aluminum', [0, 0.033, 0.177]);
  wire(s, [[0.114, 0.008, 0.124], [0.114, 0.026, 0.145], [0.091, 0.034, 0.157],
    [0.078, 0.033, 0.167]], 0.0012, 'blackMetal', 16);
  const head = s.part('headPivot', { position: [0, 0.033, 0.177] });
  const finger = new THREE.Shape();
  finger.moveTo(-0.021, -0.010);
  finger.lineTo(-0.022, 0.012);
  finger.bezierCurveTo(-0.010, 0.036, 0.019, 0.036, 0.035, 0.014);
  finger.lineTo(0.044, -0.020);
  finger.lineTo(0.033, -0.026);
  finger.lineTo(0.025, 0.005);
  finger.bezierCurveTo(0.013, 0.020, -0.001, 0.016, -0.007, 0.005);
  finger.lineTo(-0.007, -0.009);
  finger.closePath();
  drill(finger, -0.014, 0.005, 0.003, 8);
  for (const x of [-0.053, 0.053]) {
    head.add(extrude(finger, 0.009, 0.0007), 'robotBlue', { position: [x, 0, 0], rotation: SIDE });
    addBox(head, [0.014, 0.010, 0.017], 'blackMetal', [x, -0.020, 0.034], 0.001, [0.28, 0, 0]);
  }
  addBox(head, [0.029, 0.029, 0.021], 'blackMetal', [0.078, 0.001, -0.001], 0.0012);
  axle(head, 0.010, 0.009, 'robotBlue', [0.061, 0.001, 0], 14);
  addBox(head, [0.106, 0.012, 0.009], 'robotBlue', [0, 0.003, -0.012], 0.001);
}

function shooter(b) {
  const pivot = [0, 0.235, -0.066];
  // This bridge supports the stationary slewing bearing from the fixed
  // slide extrusions. The narrow moving races pass underneath its ends.
  addBox(b, [0.209, 0.008, 0.080], 'aluminum', [0, 0.204, -0.066], 0.001);
  for (const x of [-0.081, 0.081]) {
    addBox(b, [0.012, 0.023, 0.074], 'blackMetal', [x, 0.189, -0.066], 0.001);
    bolt(b, [x, 0.209, -0.091], [0, 1, 0]);
    bolt(b, [x, 0.209, -0.041], [0, 1, 0]);
  }
  b.add(cyl(0.070, 0.070, 0.020, 48), 'blackMetal', { position: [0, 0.218, -0.066] });
  b.add(torus(0.074, 0.003, 6, 48), 'aluminum', { position: [0, 0.225, -0.066], rotation: [-Math.PI / 2, 0, 0] });
  const t = b.part('turret', { position: pivot });
  t.add(extrude(spur(0.094, 0.090, 64, 0.057), 0.009, 0.00025), 'aluminum', {
    position: [0, -0.00475, 0], rotation: [-Math.PI / 2, 0, 0],
  });
  t.add(cyl(0.068, 0.068, 0.008, 40), 'blackMetal', { position: [0, 0.005, 0] });
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    bolt(t, [0.078 * Math.cos(a), 0.001, 0.078 * Math.sin(a)], [0, 1, 0], 0.002);
  }
  const cheek = outline([[-0.059, 0.013], [0.051, 0.013], [0.069, 0.123],
    [0.035, 0.157], [-0.055, 0.156], [-0.063, 0.120]]);
  drill(cheek, 0.023, 0.090, 0.010, 16);
  pocket(cheek, [[-0.049, 0.029], [-0.049, 0.067], [0.004, 0.029]]);
  pocket(cheek, [[-0.043, 0.084], [-0.043, 0.131], [-0.013, 0.130], [-0.012, 0.113]]);
  for (const sign of [-1, 1]) {
    t.add(extrude(cheek, 0.003, 0.0006), 'robotBlue', { position: [sign * 0.056, 0, 0], rotation: SIDE });
    axle(t, 0.013, 0.005, 'aluminum', [sign * 0.059, 0.090, 0.023], 20);
    for (const [z, y] of [[-0.050, 0.021], [0.036, 0.023], [-0.047, 0.145], [0.045, 0.131]]) {
      bolt(t, [sign * 0.0587, y, z], [sign, 0, 0], 0.002);
    }
    addBox(t, [0.008, 0.012, 0.097], 'aluminum', [sign * 0.053, 0.016, -0.001], 0.0007);
  }
  // A rolled, 4 mm hood sheet. Open at +Z; the flywheel and its hub remain
  // visible from the mouth and through the side-plate lightening windows.
  const hood = new THREE.Shape();
  const cz = 0.018, cy = 0.090, start = 0.78, end = 3.10;
  hood.moveTo(cz + 0.079 * Math.cos(start), cy + 0.079 * Math.sin(start));
  hood.absarc(cz, cy, 0.079, start, end, false);
  hood.lineTo(cz + 0.075 * Math.cos(end), cy + 0.075 * Math.sin(end));
  hood.absarc(cz, cy, 0.075, end, start, true);
  hood.closePath();
  const hoodGeometry = extrude(hood, 0.111, 0.0004);
  // Smooth the rolled surfaces while retaining hard cut edges and bevels.
  const hp = hoodGeometry.attributes.position, hn = hoodGeometry.attributes.normal;
  for (let i = 0; i < hp.count; i++) {
    if (Math.abs(hn.getZ(i)) > 0.0001) continue;
    const dx = hp.getX(i) - cz, dy = hp.getY(i) - cy, r = Math.hypot(dx, dy);
    const dot = (dx * hn.getX(i) + dy * hn.getY(i)) / r;
    if (Math.abs(dot) > 0.95) hn.setXYZ(i, Math.sign(dot) * dx / r, Math.sign(dot) * dy / r, 0);
  }
  t.add(hoodGeometry, 'robotBlue', { rotation: SIDE });
  addBox(t, [0.112, 0.006, 0.010], 'blackMetal', [0, 0.146, 0.071], 0.001, [-0.7, 0, 0]);
  addBox(t, [0.093, 0.003, 0.060], 'blackMetal', [0, 0.034, 0.008], 0.0006, [-0.30, 0, 0]);
  axle(t, 0.019, 0.042, 'aluminum', [0.082, 0.053, -0.012]);
  axle(t, 0.0192, 0.006, 'blackMetal', [0.106, 0.053, -0.012]);
  for (const [z, y, r] of [[0.023, 0.090, 0.020], [-0.012, 0.053, 0.0105]]) {
    axle(t, r, 0.006, 'blackMetal', [0.066, y, z], 24);
    axle(t, r * 0.7, 0.007, 'aluminum', [0.069, y, z], 20);
  }
  wire(t, [[0.069, 0.110, 0.023], [0.069, 0.090, 0.044], [0.069, 0.045, -0.001],
    [0.069, 0.043, -0.017], [0.069, 0.055, -0.024], [0.069, 0.103, 0.007], [0.069, 0.110, 0.023]], 0.0024, 'blackMetal', 36);
  wire(t, [[0.108, 0.050, -0.012], [0.105, 0.025, -0.051], [0.055, 0.023, -0.073],
    [0.032, 0.008, -0.047]], 0.0025, 'blackMetal');

  const f = t.part('flywheel', { position: [0, 0.090, 0.023] });
  axle(f, 0.042, 0.073, 'rubber', [0, 0, 0], 36);
  axle(f, 0.033, 0.074, 'aluminum', [0, 0, 0], 32);
  axle(f, 0.008, 0.128, 'aluminum', [0, 0, 0], 16);
  // Shallow tread grooves and a drilled, bolted side hub give the flywheel
  // a distinct silhouette without dense radial segmentation.
  for (const x of [-0.025, 0, 0.025]) f.add(torus(0.0419, 0.0007, 4, 36), 'rubber', {
    position: [x, 0, 0], rotation: [0, Math.PI / 2, 0],
  });
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      axle(f, 0.004, 0.0006, 'rubber', [sign * 0.0376, 0.024 * Math.cos(a), 0.024 * Math.sin(a)], 8);
      bolt(f, [sign * 0.0385, 0.014 * Math.cos(a), 0.014 * Math.sin(a)], [sign, 0, 0], 0.0016);
    }
  }
}

export default function create() {
  const b = new Builder('robot');
  chassis(b);
  wheel(b, 'wheel_fl', -0.184, 0.148, 1);
  wheel(b, 'wheel_fr', 0.184, 0.148, -1);
  wheel(b, 'wheel_rl', -0.184, -0.148, -1);
  wheel(b, 'wheel_rr', 0.184, -0.148, 1);
  electronics(b);
  intake(b);
  slides(b);
  shooter(b);
  labels(b);
  const model = b.build();
  model.userData = {
    title: '12096 · Absolute Zero', units: 'metres', front: '+Z',
    description: 'Procedural FTC robot with mecanum drive, linear carriage, roller intake and turret shooter.',
  };
  for (const name of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'intakeRollers', 'flywheel', 'headPivot']) {
    const p = model.getObjectByName(name);
    p.userData = { motion: 'rotation', axis: 'X', pivot: p.position.toArray(), space: 'parent' };
  }
  const turret = model.getObjectByName('turret');
  turret.userData = { motion: 'rotation', axis: 'Y', pivot: turret.position.toArray(), space: 'parent' };
  const carriage = model.getObjectByName('slides');
  carriage.userData = { motion: 'translation', axis: '+Z', range: [0, 0.22], stowedPosition: carriage.position.toArray(), space: 'parent' };
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return model;
}
