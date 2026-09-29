import * as THREE from 'three';
import { Builder, box, cyl, torus, lathe, extrude, tube } from './kit.js';

// Metres; +Z is the visitor's side of the bench. Air travels from +X to -X.
// The three animation pivots remain separate even though static geometry batches.
export const RIG = Object.freeze({
  cylinderCenter: [-0.100, 1.018, 0.015],
  finPivot: [-0.300, 0.951, 0.015],
  carriagePivot: [-0.300, 0.931, 0.015],
  fanPivot: [0.180, 1.049, 0.015],
  flowDirection: [-1, 0, 0],
  cylinderDiameter: 0.075,
  cylinderHeight: 0.180,
  finChord: 0.060,
  finSpan: 0.178,
});

const TAU = Math.PI * 2;
const RX = [0, 0, -Math.PI / 2]; // Cylinder's native Y axis -> +X.

function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function painted(b, geometry, texture, transform, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.65, ...extra });
  const mesh = new THREE.Mesh(geometry, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  b.object(mesh, transform);
  return mesh;
}

// A deterministic grain pattern, so successive create() calls give the same rig.
function randomGenerator(seed) {
  return () => {
    seed = Math.imul(1664525, seed) + 1013904223 | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function woodTexture() {
  return canvasTexture(2048, 1024, (g, w, h) => {
    const rnd = randomGenerator(728);
    g.fillStyle = '#aa7950'; g.fillRect(0, 0, w, h);
    const rows = 12, row = h / rows;
    for (let j = 0; j < rows; j++) {
      const light = 47 + rnd() * 9;
      g.fillStyle = `hsl(30, 37%, ${light}%)`;
      g.fillRect(0, j * row, w, row);
      g.fillStyle = 'rgba(64, 33, 12, 0.16)';
      g.fillRect(0, j * row, w, 1.5);
      const joint = 150 + rnd() * 1650;
      g.fillRect(joint, j * row, 1.5, row);
      for (let k = 0; k < 28; k++) {
        const y = (j + rnd()) * row;
        g.strokeStyle = `rgba(67, 34, 14, ${0.025 + rnd() * 0.095})`;
        g.lineWidth = 0.4 + rnd() * 1.5;
        g.beginPath(); g.moveTo(0, y);
        g.bezierCurveTo(w * 0.28, y + rnd() * 14 - 7,
          w * 0.66, y + rnd() * 20 - 10, w, y + rnd() * 5);
        g.stroke();
      }
    }
  });
}

function pegTexture() {
  // 44 x 20 holes, on exactly 25 mm centres. Painted recesses save 880 booleans.
  return canvasTexture(2200, 1000, (g, w, h) => {
    g.fillStyle = '#e5e2d9'; g.fillRect(0, 0, w, h);
    for (let y = 25; y < h; y += 50) for (let x = 25; x < w; x += 50) {
      g.fillStyle = '#c8c4b8'; g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill();
      g.fillStyle = '#62594b'; g.beginPath(); g.arc(x, y - 0.6, 3.8, 0, TAU); g.fill();
      g.fillStyle = '#2b2824'; g.beginPath(); g.arc(x, y - 1.2, 2.8, 0, TAU); g.fill();
    }
  });
}

function bolt(b, x, y, z, radius = 0.003, material = 'steel') {
  b.add(cyl(radius, radius, 0.0015, 12), material, { position: [x, y, z] });
  b.add(cyl(radius * 0.42, radius * 0.42, 0.00025, 6), 'blackMetal', {
    position: [x, y + 0.00086, z],
  });
}

function rod(b, a, c, radius, material = 'blackMetal', sides = 6) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...c);
  const d = end.clone().sub(start);
  const g = cyl(radius, radius, d.length(), sides);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(...start.add(end).multiplyScalar(0.5).toArray());
  b.add(g, material);
}

function bench(b) {
  // The upper surface is exactly y=.900; feet touch y=0.
  b.add(box(1.8, 0.052, 0.72, 0.004), 'wood', { position: [0, 0.874, 0] });
  const top = painted(b, new THREE.PlaneGeometry(1.792, 0.712), woodTexture(), {
    position: [0, 0.9001, 0], rotation: [-Math.PI / 2, 0, 0],
  }, { roughness: 0.64 });
  top.name = 'butcher-block-grain';

  for (const x of [-0.794, 0.794]) for (const z of [-0.266, 0.266]) {
    b.add(box(0.046, 0.806, 0.046, 0.002), 'blackMetal', { position: [x, 0.445, z] });
    b.add(box(0.051, 0.011, 0.051, 0.003), 'plasticBlack', { position: [x, 0.042, z] });
    b.add(cyl(0.010, 0.010, 0.024, 12), 'steel', { position: [x, 0.022, z] });
    b.add(cyl(0.021, 0.023, 0.012, 16), 'rubber', { position: [x, 0.006, z] });
    // Small gusset plates and exposed socket screws at each welded leg.
    b.add(box(0.065, 0.071, 0.003, 0.001), 'blackMetal', {
      position: [x, 0.791, z + Math.sign(z) * 0.024],
    });
    for (const dy of [-0.021, 0.021]) {
      b.add(cyl(0.0035, 0.0035, 0.002, 6), 'steel', {
        position: [x, 0.791 + dy, z + Math.sign(z) * 0.026], rotation: [Math.PI / 2, 0, 0],
      });
    }
  }
  for (const z of [-0.266, 0.266]) {
    b.add(box(1.63, 0.061, 0.036, 0.002), 'blackMetal', { position: [0, 0.817, z] });
    b.add(box(1.63, 0.033, 0.030, 0.0015), 'blackMetal', { position: [0, 0.190, z] });
  }
  for (const x of [-0.794, 0.794]) {
    b.add(box(0.038, 0.061, 0.55, 0.002), 'blackMetal', { position: [x, 0.817, 0] });
    b.add(box(0.030, 0.033, 0.55, 0.0015), 'blackMetal', { position: [x, 0.190, 0] });
  }
  b.add(box(1.57, 0.021, 0.511, 0.002), 'woodDark', { position: [0, 0.215, 0] });
  // Rear stretcher leaves the front open for the visitor's view.
  b.add(box(1.54, 0.030, 0.023, 0.001), 'blackMetal', { position: [0, 0.507, -0.266] });
}

function baseboard(b) {
  for (const x of [-0.50, 0.50]) for (const z of [-0.208, 0.208]) {
    b.add(cyl(0.012, 0.013, 0.004, 16), 'rubber', { position: [x, 0.902, z] });
    b.add(cyl(0.005, 0.005, 0.004, 12), 'steel', { position: [x, 0.906, z] });
  }
  b.add(box(1.103, 0.006, 0.503, 0.001), 'wood', { position: [0, 0.911, 0] });
  b.add(box(1.1, 0.006, 0.5, 0.0008), 'pegboard', { position: [0, 0.917, 0] });
  painted(b, new THREE.PlaneGeometry(1.1, 0.5), pegTexture(), {
    position: [0, 0.9201, 0], rotation: [-Math.PI / 2, 0, 0],
  }, { roughness: 0.88 });
  for (const x of [-0.50, 0.50]) for (const z of [-0.208, 0.208]) bolt(b, x, 0.921, z, 0.0035);
}

function bluffBody(b) {
  const [x, y, z] = RIG.cylinderCenter;
  b.add(box(0.069, 0.006, 0.094, 0.002), 'plasticBlack', { position: [x, 0.923, z] });
  for (const dz of [-0.041, 0.041]) bolt(b, x, 0.927, z + dz, 0.0025);
  // Open-ended PVC/printed tube, not a capped solid cylinder: matches the photo.
  const shell = lathe([
    [0.0357, -0.090], [0.0370, -0.090], [0.0375, -0.0893],
    [0.0375, 0.0893], [0.0370, 0.090], [0.0357, 0.090],
    [0.0357, -0.090],
  ], 48);
  b.add(shell, 'plasticBlack', { position: [x, y, z] });
  b.add(cyl(0.0357, 0.0357, 0.0015, 40), 'plasticBlack', { position: [x, 0.929, z] });
  for (const dz of [-0.0375, 0.0375]) {
    b.add(box(0.019, 0.016, 0.008, 0.001), 'plasticBlack', { position: [x, 0.934, z + dz] });
  }
}

function naca0012() {
  // Analytic closed-trailing-edge NACA 0012. Cosine spacing resolves the nose.
  // u=0 is leading edge at +15mm; u=1 is trailing edge at -45mm.
  const chord = RIG.finChord, p = [];
  const halfThickness = u => 5 * 0.12 * chord * (0.2969 * Math.sqrt(u)
    - 0.1260 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
  for (let i = 0; i <= 40; i++) {
    const u = (1 - Math.cos(Math.PI * i / 40)) / 2;
    p.push(new THREE.Vector2(chord * (0.25 - u), halfThickness(u)));
  }
  for (let i = 39; i > 0; i--) {
    const u = (1 - Math.cos(Math.PI * i / 40)) / 2;
    p.push(new THREE.Vector2(chord * (0.25 - u), -halfThickness(u)));
  }
  const geometry = extrude(new THREE.Shape(p), RIG.finSpan);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, RIG.finSpan / 2, 0);
  const pos = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / chord + 0.75, pos.getY(i) / 0.00025);
  return geometry;
}

function railAndFin(b) {
  const z = RIG.finPivot[2];
  // B: 7mm miniature linear guide, protruding 255mm past the board's left edge.
  b.add(box(0.595, 0.003, 0.018, 0.0006), 'aluminum', { position: [-0.5075, 0.922, z] });
  b.add(box(0.590, 0.005, 0.007, 0.0005), 'steel', { position: [-0.5075, 0.926, z] });
  for (const dz of [-0.0036, 0.0036]) {
    b.add(box(0.585, 0.001, 0.0007), 'blackMetal', { position: [-0.5075, 0.926, z + dz] });
  }
  for (let x = -0.7775; x < -0.23; x += 0.050) bolt(b, x, 0.929, z, 0.0016);
  for (const x of [-0.775, -0.695, -0.585]) {
    b.add(box(0.018, 0.020, 0.029, 0.001), 'plasticWhite', { position: [x, 0.910, z] });
  }
  for (const x of [-0.796, -0.220]) {
    b.add(box(0.008, 0.009, 0.012, 0.001), 'plasticBlack', { position: [x, 0.928, z] });
  }

  // K + L: carriage includes the real, vertically oriented bearing axis.
  const carriage = b.part('carriage', { position: RIG.carriagePivot });
  carriage.add(box(0.0225, 0.009, 0.017, 0.001), 'aluminum', { position: [0, 0.002, 0] });
  for (const x of [-0.012, 0.012]) {
    carriage.add(box(0.003, 0.009, 0.018, 0.0006), 'pcbGreen', { position: [x, 0.002, 0] });
    carriage.add(box(0.0008, 0.008, 0.017), 'plasticBlack', { position: [x * 1.16, 0.002, 0] });
  }
  carriage.add(cyl(0.0113, 0.0113, 0.005, 32, true), 'steel', { position: [0, 0.0105, 0] });
  carriage.add(torus(0.0098, 0.0016, 6, 40), 'steel', { position: [0, 0.013, 0], rotation: [Math.PI / 2, 0, 0] });
  carriage.add(torus(0.0073, 0.0010, 6, 32), 'plasticBlack', { position: [0, 0.0134, 0], rotation: [Math.PI / 2, 0, 0] });
  carriage.add(torus(0.0047, 0.0010, 6, 32), 'steel', { position: [0, 0.0137, 0], rotation: [Math.PI / 2, 0, 0] });
  carriage.add(cyl(0.003, 0.003, 0.010, 16), 'steel', { position: [0, 0.015, 0] });
  for (const x of [-0.008, 0.008]) for (const dz of [-0.0065, 0.0065]) bolt(carriage, x, 0.0073, dz, 0.0011);

  const fin = carriage.part('fin', { position: [0, 0.020, 0] });
  const layer = canvasTexture(16, 16, (g, w, h) => {
    g.fillStyle = '#dfded8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8d7d1'; g.fillRect(0, 0, w, 2);
  });
  layer.wrapT = THREE.RepeatWrapping;
  painted(fin, naca0012(), layer, {}, { roughness: 0.62 });

  // E: relieved TAL221 bar, anchored at its downstream end. Its near end is
  // 23.5mm ahead of the carriage pivot; a slender link bridges the remaining gap.
  for (const x of [-0.369, -0.332]) {
    b.add(box(0.012, 0.017, 0.024, 0.001), 'plasticWhite', { position: [x, 0.929, z] });
  }
  b.add(box(0.043, 0.004, 0.022, 0.001), 'blackMetal', { position: [-0.350, 0.932, z] });
  const cell = new THREE.Shape();
  cell.moveTo(-0.0235, -0.004); cell.lineTo(0.0235, -0.004);
  cell.lineTo(0.0235, 0.004); cell.lineTo(-0.0235, 0.004); cell.closePath();
  for (const x of [-0.005, 0.005]) {
    const hole = new THREE.Path(); hole.absarc(x, 0, 0.0028, 0, TAU, true); cell.holes.push(hole);
  }
  b.add(extrude(cell, 0.012, 0.00025), 'aluminum', { position: [-0.347, 0.942, z] });
  for (const x of [-0.365, -0.328]) bolt(b, x, 0.947, z, 0.0018);
  b.add(box(0.012, 0.0015, 0.004, 0.0003), 'steel', { position: [-0.3175, 0.942, z] });
  b.add(box(0.009, 0.002, 0.010, 0.0004), 'plasticWhite', { position: [-0.347, 0.947, z] });
}

function fan(b) {
  const [x, y, z] = RIG.fanPivot, radius = 0.121;
  const hoop = (r, thickness, dx, material = 'blackMetal') => {
    b.add(torus(r, thickness, 5, 64), material, { position: [x + dx, y, z], rotation: [0, Math.PI / 2, 0] });
  };
  // G: thick molded rim, two domed wire guards and a short cylindrical shroud.
  const rim = lathe([[0.115, -0.026], [0.125, -0.026], [0.125, 0.024],
    [0.115, 0.024], [0.115, -0.026]], 56);
  b.add(rim, 'plasticBlack', { position: [x, y, z], rotation: RX });
  hoop(radius, 0.004, -0.030, 'plasticBlack'); hoop(radius, 0.004, 0.030, 'plasticBlack');
  for (const side of [-1, 1]) {
    for (const r of [0.025, 0.039, 0.053, 0.067, 0.081, 0.095, 0.109, 0.120]) {
      hoop(r, 0.0008, side * (0.031 + 0.021 * (1 - (r / radius) ** 2)));
    }
    for (let i = 0; i < 24; i++) {
      const angle = i * TAU / 24, points = [];
      for (let j = 0; j <= 5; j++) {
        const r = 0.020 + (radius - 0.020) * j / 5;
        points.push([x + side * (0.031 + 0.021 * (1 - (r / radius) ** 2)),
          y + r * Math.cos(angle), z + r * Math.sin(angle)]);
      }
      b.add(tube(points, 0.0008, 6, 5), 'blackMetal');
    }
    b.add(cyl(0.022, 0.022, 0.004, 32), 'plasticBlack', {
      position: [x + side * 0.053, y, z], rotation: RX,
    });
  }
  // Front and back rim clips, tension screws and compact original desk stand.
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    b.add(box(0.058, 0.009, 0.006, 0.001), 'plasticBlack', {
      position: [x, y + 0.124 * Math.cos(a), z + 0.124 * Math.sin(a)], rotation: [a, 0, 0],
    });
  }
  b.add(box(0.089, 0.006, 0.10, 0.004), 'plasticBlack', { position: [x, 0.924, z] });
  for (const dz of [-0.050, 0.050]) {
    rod(b, [x + 0.014, 0.927, z + dz * 0.65], [x + 0.029, 0.956, z + dz], 0.004, 'plasticBlack');
  }
  b.add(cyl(0.034, 0.042, 0.047, 24), 'plasticBlack', { position: [x + 0.049, y, z], rotation: RX });

  const blades = b.part('fanBlades', { position: RIG.fanPivot });
  const blade = new THREE.Shape();
  blade.moveTo(-0.005, 0.019);
  blade.bezierCurveTo(0.020, 0.024, 0.050, 0.061, 0.042, 0.098);
  blade.quadraticCurveTo(0.028, 0.117, 0.002, 0.106);
  blade.bezierCurveTo(-0.011, 0.087, -0.018, 0.043, -0.005, 0.019);
  for (let i = 0; i < 5; i++) {
    const g = extrude(blade, 0.0022, 0.0005);
    g.rotateY(Math.PI / 2);
    // A small pitch puts real depth into the otherwise stamped blade outline.
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) p.setX(j, p.getX(j) + p.getZ(j) * 0.23);
    g.computeVertexNormals(); g.rotateX(i * TAU / 5);
    blades.add(g, 'plasticGrey');
  }
  blades.add(cyl(0.023, 0.020, 0.026, 32), 'plasticGrey', { rotation: RX });
}

function spool(b) {
  const x = 0.460, y = 1.043, z = -0.167;
  // H: a reused white cable reel on its edge, with two broad flanges and a hub.
  b.add(lathe([[0.016, -0.0415], [0.043, -0.0415], [0.043, 0.0415],
    [0.016, 0.0415], [0.016, -0.0415]], 32), 'plasticWhite', {
    position: [x, y, z], rotation: [Math.PI / 2, 0, 0],
  });
  for (const dz of [-0.045, 0.045]) {
    const ring = lathe([[0.018, -0.0035], [0.083, -0.0035], [0.087, -0.002],
      [0.087, 0.002], [0.083, 0.0035], [0.018, 0.0035], [0.018, -0.0035]], 48);
    b.add(ring, 'plasticWhite', { position: [x, y, z + dz], rotation: [Math.PI / 2, 0, 0] });
    b.add(torus(0.019, 0.002, 6, 32), 'plasticGrey', { position: [x, y, z + dz] });
    b.add(torus(0.081, 0.0015, 5, 56), 'plasticWhite', { position: [x, y, z + dz * 1.085] });
    // Perforations on each flange use an annular mesh, leaving the hub open.
    const texture = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#deded6'; g.fillRect(0, 0, w, h);
      for (let yy = 22; yy < h; yy += 10) for (let xx = 22; xx < w; xx += 10) {
        const r = Math.hypot(xx - w / 2, yy - h / 2);
        if (r < 216 && r > 67) {
          g.fillStyle = '#8a8b84'; g.beginPath(); g.arc(xx, yy, 1.15, 0, TAU); g.fill();
        }
      }
      g.strokeStyle = '#999b92'; g.lineWidth = 1.5;
      for (const r of [61, 227, 238]) { g.beginPath(); g.arc(w / 2, h / 2, r, 0, TAU); g.stroke(); }
    });
    painted(b, new THREE.RingGeometry(0.020, 0.083, 48), texture, {
      position: [x, y, z + dz + Math.sign(dz) * 0.0036],
      rotation: [0, dz < 0 ? Math.PI : 0, 0],
    }, { roughness: 0.76 });
  }
  rod(b, [x, y, z], [0.454, 1.074, -0.066], 0.006, 'blackMetal', 12);
}

function blower(b) {
  // J: separate front/rear foam blocks, visibly wider than the plastic housing.
  b.add(box(0.237, 0.030, 0.147, 0.006), 'foamPurple', { position: [0.461, 0.935, 0.066] });
  b.add(box(0.209, 0.038, 0.126, 0.005), 'foamPurple', { position: [0.466, 0.939, -0.163] });
  spool(b);
  // I: corded BLACK+DECKER blower, upright motor on a flattened volute casing.
  b.add(lathe([[0.036, 0], [0.089, 0], [0.102, 0.008], [0.105, 0.028],
    [0.096, 0.049], [0.062, 0.061], [0.033, 0.061]], 48), 'plasticBlack', {
    position: [0.459, 0.950, 0.010],
  });
  b.add(torus(0.100, 0.0022, 6, 48), 'plasticGrey', {
    position: [0.459, 0.970, 0.010], rotation: [Math.PI / 2, 0, 0],
  });
  b.add(lathe([[0.051, 0], [0.065, 0.008], [0.071, 0.039], [0.065, 0.094],
    [0.054, 0.123], [0.034, 0.137], [0.0, 0.139]], 40), 'plasticBlack', {
    position: [0.473, 0.997, 0.011],
  });
  // Discharge snout ends directly behind the flow-straightener's rear motor.
  const nozzle = lathe([[0.033, -0.080], [0.036, -0.080], [0.037, -0.066],
    [0.041, 0.030], [0.031, 0.030], [0.029, -0.076], [0.033, -0.080]], 32);
  b.add(nozzle, 'plasticBlack', { position: [0.356, 1.036, 0.015], rotation: RX });
  b.add(torus(0.0355, 0.002, 6, 32), 'plasticGrey', {
    position: [0.277, 1.036, 0.015], rotation: [0, Math.PI / 2, 0],
  });
  for (let i = 0; i < 8; i++) {
    const yy = 1.041 + i * 0.010;
    const r = 0.071 - Math.max(0, i - 1) * 0.0023;
    b.add(torus(r, 0.0022, 5, 40), 'plasticGrey', {
      position: [0.473, yy, 0.011], rotation: [Math.PI / 2, 0, 0],
    });
  }
  // Molded arch handle, with an actual open hand space and a subtle parting line.
  const handle = new THREE.Shape();
  handle.moveTo(-0.105, 0.014);
  handle.bezierCurveTo(-0.122, 0.092, -0.122, 0.168, -0.061, 0.177);
  handle.bezierCurveTo(0.015, 0.185, 0.100, 0.142, 0.128, 0.059);
  handle.quadraticCurveTo(0.144, 0.020, 0.123, 0.016);
  handle.lineTo(0.102, 0.028);
  handle.bezierCurveTo(0.090, 0.095, 0.016, 0.146, -0.055, 0.151);
  handle.bezierCurveTo(-0.094, 0.148, -0.093, 0.076, -0.082, 0.027);
  handle.closePath();
  b.add(extrude(handle, 0.024, 0.0018), 'plasticBlack', { position: [0.474, 1.003, 0.056] });
  b.add(box(0.031, 0.012, 0.019, 0.004), 'accentOrange', {
    position: [0.440, 1.154, 0.049], rotation: [0, 0, 0.10],
  });
  b.add(box(0.018, 0.007, 0.012, 0.002), 'accentOrange', { position: [0.355, 1.044, 0.052] });
  b.add(box(0.057, 0.036, 0.005, 0.004), 'plasticBlack', { position: [0.474, 1.030, 0.087] });
  const badge = canvasTexture(512, 320, (g, w, h) => {
    g.fillStyle = '#161717'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ed7027'; g.lineWidth = 15; g.strokeRect(16, 16, w - 32, h - 32);
    g.fillStyle = '#ed7027'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 88px Arial, sans-serif'; g.fillText('BLACK+', w / 2, 111);
    g.font = '900 84px Arial, sans-serif'; g.fillText('DECKER', w / 2, 219);
  });
  painted(b, new THREE.PlaneGeometry(0.049, 0.030), badge, { position: [0.474, 1.030, 0.0896] }, { roughness: 0.53 });
  for (const x of [0.397, 0.515]) bolt(b, x, 0.995, 0.071, 0.0028, 'blackMetal');
  // Main lead drops through a rubber worktop grommet to the lower shelf.
  b.add(cyl(0.0095, 0.0095, 0.001, 24), 'rubber', { position: [0.644, 0.9007, -0.331] });
  b.add(torus(0.0095, 0.0015, 6, 32), 'rubber', {
    position: [0.644, 0.901, -0.331], rotation: [Math.PI / 2, 0, 0],
  });
  b.add(tube([[0.558, 0.982, -0.002], [0.610, 0.975, -0.061], [0.646, 0.932, -0.225],
    [0.644, 0.912, -0.331], [0.644, 0.878, -0.331], [0.650, 0.811, -0.333], [0.637, 0.560, -0.330],
    [0.593, 0.380, -0.306], [0.520, 0.229, -0.212], [0.422, 0.234, -0.119]], 0.0032, 44, 8), 'rubber');
  b.add(box(0.031, 0.015, 0.014, 0.003), 'plasticBlack', { position: [0.416, 0.233, -0.119] });
  for (const z of [-0.122, -0.116]) b.add(box(0.011, 0.005, 0.0015), 'brass', { position: [0.395, 0.233, z] });
}

function electronics(b) {
  // C: interface PCB with mounting standoffs, terminal blocks, IC and USB socket.
  const x = -0.442, y = 0.929, z = -0.133;
  for (const dx of [-0.020, 0.020]) for (const dz of [-0.025, 0.025]) {
    b.add(cyl(0.002, 0.002, 0.008, 10), 'brass', { position: [x + dx, 0.925, z + dz] });
    bolt(b, x + dx, 0.931, z + dz, 0.002);
  }
  b.add(box(0.046, 0.0016, 0.058, 0.001), 'pcbGreen', { position: [x, y, z] });
  b.add(box(0.015, 0.002, 0.019, 0.0004), 'plasticBlack', { position: [x, y + 0.002, z] });
  for (const dx of [-0.017, 0.017]) {
    b.add(box(0.008, 0.009, 0.036, 0.001), 'pcbGreen', { position: [x + dx, y + 0.005, z + 0.004] });
    for (let i = 0; i < 5; i++) {
      bolt(b, x + dx, y + 0.010, z - 0.009 + i * 0.0065, 0.0015);
      b.add(box(0.0008, 0.003, 0.003), 'plasticBlack', { position: [x + dx * 1.245, y + 0.004, z - 0.009 + i * 0.0065] });
    }
  }
  for (let i = 0; i < 9; i++) for (const dx of [-0.0086, 0.0086]) {
    b.add(box(0.002, 0.0006, 0.0007), 'steel', { position: [x + dx, y + 0.0015, z - 0.008 + i * 0.002] });
  }
  for (const dz of [-0.022, 0.020]) {
    b.add(box(0.006, 0.002, 0.003, 0.0002), 'plasticBlack', { position: [x, y + 0.002, z + dz] });
  }
  b.add(box(0.009, 0.006, 0.012, 0.0006), 'steel', { position: [x, y + 0.004, z - 0.028] });
  b.add(box(0.007, 0.004, 0.015, 0.001), 'plasticBlack', { position: [x, y + 0.004, z - 0.038] });
  b.add(cyl(0.0012, 0.0012, 0.001, 10), 'ledGreen', { position: [x + 0.006, y + 0.002, z + 0.023] });
  // Fine coloured leads are intentionally slack, so carriage travel remains plausible.
  const wireColors = ['plasticWhite', 'pcbGreen', 'copper', 'plasticBlack'];
  wireColors.forEach((material, i) => {
    b.add(tube([[-0.365, 0.944, 0.012 + i * 0.002], [-0.389, 0.940, 0.032 + i * 0.007],
      [-0.414 - i * 0.004, 0.924, -0.023], [-0.414, 0.924, -0.074 - i * 0.003],
      [-0.425, 0.935, -0.130 + i * 0.0065]], 0.00065, 24, 5), material);
  });
  b.add(tube([[x, 0.934, -0.173], [-0.454, 0.931, -0.226], [-0.504, 0.926, -0.261],
    [-0.583, 0.917, -0.290], [-0.684, 0.917, -0.284], [-0.734, 0.934, -0.256],
    [-0.708, 0.958, -0.194], [-0.660, 0.959, -0.178], [-0.622, 0.925, -0.203]], 0.0022, 40, 7), 'rubber');
  b.add(box(0.022, 0.007, 0.011, 0.0015), 'plasticBlack', { position: [-0.614, 0.924, -0.203] });
  b.add(box(0.012, 0.005, 0.009, 0.0005), 'steel', { position: [-0.598, 0.924, -0.203] });
  // Fan supply lead and small inline speed switch are kept behind the apparatus.
  b.add(tube([[0.218, 1.005, -0.030], [0.244, 0.935, -0.077], [0.302, 0.924, -0.158],
    [0.292, 0.925, -0.218], [0.200, 0.925, -0.236], [0.125, 0.925, -0.189]], 0.0018, 26, 6), 'rubber');
  b.add(box(0.028, 0.010, 0.015, 0.002), 'plasticBlack', { position: [0.120, 0.927, -0.188] });
  b.add(box(0.009, 0.003, 0.006, 0.001), 'plasticGrey', { position: [0.119, 0.933, -0.188] });
}

function notebook(b) {
  // A small, quiet research notebook; the apparatus remains the main object.
  b.add(box(0.175, 0.013, 0.118, 0.003), 'blackMetal', { position: [-0.672, 0.907, 0.235], rotation: [0, -0.10, 0] });
  b.add(box(0.166, 0.008, 0.111, 0.001), 'plasticWhite', { position: [-0.672, 0.910, 0.235], rotation: [0, -0.10, 0] });
  const notes = canvasTexture(1024, 640, (g, w, h) => {
    g.fillStyle = '#ebe8dd'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d6d9d7'; g.lineWidth = 1;
    for (let yy = 44; yy < h; yy += 38) { g.beginPath(); g.moveTo(40, yy); g.lineTo(w - 40, yy); g.stroke(); }
    g.fillStyle = '#454d55'; g.font = '600 36px monospace'; g.fillText('PASSIVE VORTEX PROPULSION', 53, 72);
    g.font = '25px monospace'; g.fillText('NACA 0012   /   AIR', 53, 122);
    g.fillText('c = 60 mm   b = 178 mm', 53, 165);
    g.strokeStyle = '#566c7b'; g.lineWidth = 3; g.beginPath();
    g.moveTo(100, 510); g.lineTo(100, 245); g.moveTo(100, 475); g.lineTo(925, 475); g.stroke();
    g.beginPath();
    for (let xx = 105; xx < 920; xx += 4) {
      const yy = 395 - 55 * Math.sin(xx / 38) * Math.exp(-(xx - 105) / 1500);
      xx === 105 ? g.moveTo(xx, yy) : g.lineTo(xx, yy);
    }
    g.stroke(); g.font = '22px monospace'; g.fillText('wake response', 130, 260);
  });
  painted(b, new THREE.PlaneGeometry(0.166, 0.110), notes, {
    position: [-0.672, 0.9142, 0.235], rotation: [-Math.PI / 2, 0, 0.10],
  }, { roughness: 0.93 });
  // Hexagonal pencil resting across the notebook.
  const pencil = cyl(0.0025, 0.0025, 0.135, 6);
  pencil.rotateZ(Math.PI / 2); pencil.rotateY(-0.18);
  b.add(pencil, 'accentOrange', { position: [-0.665, 0.918, 0.279] });
  b.add(cyl(0.0025, 0, 0.012, 6), 'wood', {
    position: [-0.737, 0.918, 0.266], rotation: [0, 0, -Math.PI / 2],
  });
}

export default function create() {
  const b = new Builder('windtunnel');
  bench(b); baseboard(b); railAndFin(b); bluffBody(b);
  fan(b); blower(b); electronics(b); notebook(b);
  const group = b.build();
  group.userData.flowVisualization = {
    direction: [...RIG.flowDirection],
    cylinderCenter: [...RIG.cylinderCenter],
    finPivot: [...RIG.finPivot],
    cylinderDiameter: RIG.cylinderDiameter,
    cylinderHeight: RIG.cylinderHeight,
    finChord: RIG.finChord,
    finSpan: RIG.finSpan,
  };
  group.getObjectByName('carriage').userData = { translationAxis: 'X', restPosition: [...RIG.carriagePivot] };
  group.getObjectByName('fin').userData = { rotationAxis: 'Y', modelPivot: [...RIG.finPivot], localPivot: [0, 0.020, 0] };
  group.getObjectByName('fanBlades').userData = { rotationAxis: 'X', modelPivot: [...RIG.fanPivot] };
  return group;
}
