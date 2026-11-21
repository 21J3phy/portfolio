// L6_B600_R8. Dimensions in metres, from hopper/cad.py and hopper/rover.py.
// In a leg frame X is radial, Y is up and Z is opposite the MJCF tangent.
import { THREE, Builder, box, cyl, sphere, tube, extrude, defineMaterial } from './kit.js';

const PI = Math.PI, TAU = 2 * PI;
const AX = [0, 0, -PI / 2], AZ = [PI / 2, 0, 0];
const alloy = 'aluminumDark', carbon = 'blackMetal';
const springBase = 0.544, coilLength = 0.106;

function block(b, m, p, dims, radius = 0, rotation) {
  b.add(box(...dims, radius, 1), m, { position: p, rotation });
}
function drum(b, m, p, radius, length, rotation, sides = 24, lower = radius) {
  b.add(cyl(radius, lower, length, sides), m, { position: p, rotation });
}
function radial(angle, r, y) {
  return [Math.sin(angle) * r, y, Math.cos(angle) * r];
}

function chassis(b, hipZ) {
  const radius = 0.4 / Math.cos(PI / 12);
  const clock = [0, PI / 12, 0];
  drum(b, carbon, [0, 0.009, 0], radius, 0.202, clock, 12);
  drum(b, carbon, [0, -0.101, 0], radius, 0.018, clock, 12, radius - 0.018);
  drum(b, alloy, [0, -0.121, 0], 0.33, 0.022, undefined, 48);
  block(b, 'foilGold', [0, -0.131, 0], [0.12, 0.022, 0.2], 0.001);
  drum(b, 'foilGold', [0, 0.1115, 0], radius - 0.006, 0.003, clock, 12);
  drum(b, alloy, [0, 0.118, 0], 0.184, 0.009);
  drum(b, 'foilGold', [0, 0.125, 0], 0.24, 0.002, undefined, 48);

  // The MMRTG base is recessed into the electronics bay.
  drum(b, carbon, [0, 0.255, 0], 0.135, 0.69, undefined, 48);
  drum(b, carbon, [0, 0.6125, 0], 0.1053, 0.025, undefined, 40);
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * TAU / 8;
    block(b, carbon, radial(a, 0.229, 0.36), [0.006, 0.44, 0.192], 0.001, [0, a, 0]);
  }
  for (let i = 0; i < 6; i++) {
    const a = i * PI / 3, hip = a + PI / 6;
    block(b, 'paintWhite', radial(a, 0.4025, -0.005), [0.18, 0.13, 0.005], 0.002, [0, a, 0]);
    const axis = [0, a, 0, 'YXZ'];
    axis[0] = PI / 2;
    drum(b, carbon, radial(a, 0.411, 0.082), 0.015, 0.022, axis, 16);
    block(b, alloy, radial(hip, 0.399, hipZ - 0.024), [0.116, 0.15, 0.024], 0.003, [0, hip, 0]);
    drum(b, alloy, radial(hip, 0.41, hipZ), 0.056, 0.018, [PI / 2, hip, 0, 'YXZ']);
    drum(b, carbon, radial(hip, 0.427, hipZ), 0.048, 0.023, [PI / 2, hip, 0, 'YXZ']);
    for (const offset of [-0.08, 0.08]) {
      drum(b, 'steel', radial(a + offset, 0.38, 0.115), 0.006, 0.004, undefined, 6);
    }
  }

  const z = 0.36;
  drum(b, carbon, [0, 0.48, z], 0.020, 0.74);
  drum(b, alloy, [0, 0.125, z], 0.034, 0.03);
  block(b, 'paintWhite', [0, 0.6725, z], [0.14, 0.12, 0.14], 0.003);
  drum(b, 'screenOff', [0, 0.6725, z + 0.073], 0.042, 0.008, AZ);
  block(b, 'paintWhite', [0, 0.86, z], [0.27, 0.05, 0.05], 0.002);
  for (const side of [-1, 1]) {
    drum(b, 'screenOff', [side * 0.08, 0.86, z + 0.032], 0.016, 0.014, AZ, 18);
    drum(b, 'foilGold', [side * 0.12, 0.86, z + 0.03], 0.011, 0.01, AZ, 16);
    b.add(tube([[side * 0.016, 0.595, z], [side * 0.024, 0.48, z],
      [side * 0.022, 0.19, z], [side * 0.045, 0.119, z - 0.036]], 0.003, 18, 5), carbon);
  }
  drum(b, 'foilGold', [0, 0.9475, z], 0.012, 0.125, undefined, 16);
  block(b, 'paintWhite', [0, 0.117, -0.30], [0.08, 0.008, 0.08], 0.002);
}

// A pierced side plate with round bearing ends and true through-holes.
function plate(length, radius, holes, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -radius);
  shape.lineTo(length, -radius);
  shape.absarc(length, 0, radius, -PI/2, PI/2, false);
  shape.lineTo(0, radius);
  shape.absarc(0, 0, radius, PI/2, 3*PI/2, false);
  for (const [x, r] of holes) {
    const hole = new THREE.Path();
    for (let i = 0; i <= 16; i++) {
      const a = -TAU * i / 16;
      hole[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), r * Math.sin(a));
    }
    shape.holes.push(hole);
  }
  return extrude(shape, thickness);
}
function motor(b, material, x, z, length) {
  drum(b, material, [x, 0, z], 0.046, length, AZ);
  for (const end of [-1, 1]) {
    const face = z + end * (length / 2 + 0.002);
    drum(b, material, [x, 0, face], 0.042, 0.004, AZ);
    for (let i = 0; i < 6; i++) {
      const a = TAU * i / 6;
      drum(b, material, [x + 0.034 * Math.cos(a), 0.034 * Math.sin(a), face + end * 0.003],
        0.0035, 0.003, AZ, 6);
    }
  }
}
function legPrototype() {
  const root = new Builder('socket');
  const c = root.part('roll');
  drum(c, alloy, [0.005, 0, 0], 0.045, 0.01, AX);
  block(c, alloy, [0.016, 0, 0], [0.012, 0.08, 0.132], 0.002);
  const cheek = plate(0.104, 0.035, [[0.046, 0.019]], 0.008);
  for (const side of [-1, 1]) c.add(cheek, alloy, { position: [0.026, 0, side * 0.062] });
  motor(c, alloy, 0.13, 0.114, 0.092);

  const f = c.part('pitch', { position: [0.13, 0, 0] });
  const channel = plate(0.36, 0.034, [0.09, 0.15, 0.21, 0.27].map(x => [x, 0.015]), 0.006);
  for (const side of [-1, 1]) f.add(channel, carbon, { position: [0, 0, side * 0.044] });
  block(f, carbon, [0.21, 0.034, 0], [0.24, 0.005, 0.094], 0.001);
  motor(f, carbon, 0.36, -0.093, 0.092);
  f.add(tube([[0, 0.02, -0.05], [0.045, 0.049, -0.045], [0.17, 0.043, -0.034],
    [0.31, 0.043, -0.034], [0.355, 0.03, -0.065]], 0.004, 26, 6), carbon);

  const t = f.part('knee', { position: [0.36, 0, 0] });
  drum(t, alloy, [0, 0, 0], 0.03, 0.081, AZ);
  drum(t, alloy, [0.277, 0, 0], 0.031, 0.534, AX);
  drum(t, alloy, [springBase - 0.01, 0, 0], 0.036, 0.02, AX);
  block(t, alloy, [0.09, 0.048, 0], [0.08, 0.033, 0.044], 0.003);
  drum(t, alloy, [0.145, 0.048, 0], 0.016, 0.030, AX);
  const spring = t.part('spring', { position: [springBase, 0, 0] });
  // Expose a short helical representation at the dust boot for the exhibit.
  const points = [];
  for (let j = 0; j <= 90; j++) {
    const u = j / 90, a = TAU * 7 * u;
    points.push([coilLength * u, 0.025 * Math.sin(a), 0.025 * Math.cos(a)]);
  }
  spring.add(tube(points, 0.005, 100, 7), 'steel');

  const foot = t.part('plunger', { position: [0.704, 0, 0] });
  drum(foot, 'steel', [-0.158, 0, 0], 0.0125, 0.316, AX);
  drum(foot, 'steel', [-0.055, 0, 0], 0.032, 0.012, AX);
  foot.add(sphere(0.045, 20, 12), 'steel');
  const pad = foot.part('pad');
  drum(pad, carbon, [0, -0.026, 0], 0.11, 0.005, undefined, 32, 0.108);
  drum(pad, carbon, [0, -0.02, 0], 0.05, 0.014);
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * PI / 4;
    block(pad, carbon, radial(a, 0.077, -0.0365), [0.006, 0.017, 0.057], 0, [0, a, 0]);
  }
  return root.build();
}

export async function createHopper() {
  const response = await fetch(new URL('../data/hopper-run.json', import.meta.url));
  if (!response.ok) throw new Error('HOPPER replay HTTP ' + response.status);
  const { meta, position, quaternion, joints } = await response.json();
  const b = new Builder('HOPPER'), torso = b.part('chassis');
  chassis(torso, meta.hipZ);
  const proto = legPrototype();
  for (let i = 0; i < 6; i++) {
    const a = (i + 0.5) * PI / 3;
    const leg = proto.clone();
    leg.name = 'leg' + i;
    torso.object(leg, { position: radial(a, 0.44, meta.hipZ), rotation: [0, a - PI / 2, 0] });
  }
  const group = b.build(), body = group.getObjectByName('chassis');
  const legs = Array.from({length: 6}, (_, i) => {
    const leg = body.getObjectByName('leg' + i);
    return ['roll','pitch','knee','plunger','spring','pad'].map(n => leg.getObjectByName(n));
  });
  const { duration, fps, scale } = meta;
  const extent = new THREE.Box3(), v = new THREE.Vector3();
  // Cyclic basis permutation preserves handedness. Quaternion vector parts
  // transform by the same basis change, with scalar w unchanged.
  function pos(i, out) {
    return out.set(position[i+1], position[i+2], position[i]).multiplyScalar(scale);
  }
  function rot(i, out) {
    return out.set(quaternion[i+2], quaternion[i+3], quaternion[i+1], quaternion[i]).normalize();
  }
  for (let i = 0; i < position.length; i += 3) extent.expandByPoint(pos(i, v));
  const q = new THREE.Quaternion(), level = new THREE.Quaternion();
  const airborne = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), PI/2);
  function setTime(t) {
    const frame = THREE.MathUtils.clamp(t, 0, duration) * fps;
    const last = position.length / 3 - 1;
    const a = Math.min(last, Math.floor(frame)), b = Math.min(last, a + 1), u = frame - a;
    pos(a*3, body.position).lerp(pos(b*3, v), u);
    rot(a*4, body.quaternion).slerp(rot(b*4, q), u);
    function joint(j) {
      return THREE.MathUtils.lerp(joints[a*24+j], joints[b*24+j], u) * scale;
    }
    // Compute ankle heights in rover-group space, independent of plinth scale.
    body.updateMatrix();
    for (let i = 0; i < 6; i++) {
      const [roll, pitch, knee, foot, spring, pad] = legs[i], j = i * 4;
      roll.rotation.x = joint(j);
      pitch.rotation.z = joint(j+1);
      knee.rotation.z = -joint(j+2);
      const extension = joint(j+3);
      foot.position.x = 0.704 + extension;
      spring.scale.x = 1 + extension / coilLength;
      v.copy(foot.position);
      level.identity();
      for (const link of [knee, pitch, roll, roll.parent, body]) {
        v.applyQuaternion(link.quaternion).add(link.position);
        level.premultiply(link.quaternion);
      }
      // Visual ball joint, as in hopper.render.level_pads; smooth its transition.
      pad.quaternion.copy(level.invert()).slerp(airborne, THREE.MathUtils.smoothstep(v.y, 0.09, 0.15));
    }
  }
  function phaseAt(t) {
    return meta.phases.findLast(p => p.t <= Math.max(0, t)).label;
  }
  group.userData = { duration, setTime, extent, meta, body, phaseAt };
  setTime(0);
  return group;
}

export default createHopper;

// ---------------------------------------------------------------- the plinth
// A painted plinth with a tray of regolith on top: gently rolling, a few small craters and rocks toward the edges,
// and level along the middle, where the rover's recorded path runs.
defineMaterial('hopper:plinth', () => new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.62 }));
defineMaterial('hopper:regolith', () => new THREE.MeshStandardMaterial({ color: 0x8a867f, roughness: 1, flatShading: false }));
defineMaterial('hopper:rock', () => new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 1, flatShading: true }));
export function createMoonPlinth({ w = 1.75, d = 0.78, h = 0.9 } = {}) {
  const b = new Builder('moonPlinth'), lip = 0.018, rim = 0.012;
  b.add(box(w - 0.06, 0.05, d - 0.06), carbon, { position: [0, 0.025, 0] });                          // shadow gap at the floor
  b.add(box(w, h - 0.05 - lip - 0.02, d, 0.004), 'hopper:plinth', { position: [0, 0.05 + (h - 0.05 - lip - 0.02) / 2, 0] });
  b.add(box(w - 0.004, 0.022, d - 0.004), carbon, { position: [0, h - lip - 0.011, 0] });   // the tray's dark underside, below the deepest crater
  // the tray's rim
  for (const [x, z, bw, bd] of [[0, d / 2 - rim / 2, w, rim], [0, -d / 2 + rim / 2, w, rim], [w / 2 - rim / 2, 0, rim, d], [-w / 2 + rim / 2, 0, rim, d]]) b.add(box(bw, lip + 0.004, bd), carbon, { position: [x, h - lip / 2 + 0.002, z] });
  // terrain
  const tw = w - 2 * rim, td = d - 2 * rim, sx = 96, sz = 44, g = new THREE.PlaneGeometry(tw, td, sx, sz); g.rotateX(-PI / 2);
  let seed = 31; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const craters = Array.from({ length: 7 }, () => ({ x: (rnd() - 0.5) * tw * 0.92, z: (rnd() < 0.5 ? -1 : 1) * (0.2 + rnd() * 0.14) * td, r: 0.03 + rnd() * 0.045 }));
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), edge = Math.min(1, Math.abs(z) / (td * 0.5)), off = Math.max(0, (edge - 0.28) / 0.72);   // 0 along the path, 1 at the long edges
    let y = (Math.sin(x * 9.1 + 1.3) * Math.cos(z * 13.7) * 0.004 + Math.sin(x * 23 + z * 17) * 0.0016) * off;
    for (const c of craters) { const r = Math.hypot(x - c.x, z - c.z) / c.r; if (r < 1.5) y += (r < 1 ? -0.007 * (1 - r * r) : 0.003 * (1.5 - r) * 2) * Math.min(1, off * 2); }
    P.setY(i, h - lip + 0.009 + y);
  }
  g.computeVertexNormals();
  b.add(g, 'hopper:regolith');
  for (let i = 0; i < 26; i++) {
    const s = 0.004 + rnd() * 0.011, x = (rnd() - 0.5) * tw * 0.95, z = (rnd() < 0.5 ? -1 : 1) * (0.17 + rnd() * 0.3) * td;
    b.add(new THREE.IcosahedronGeometry(s, 0), 'hopper:rock', { position: [x, h - lip + 0.009 + s * 0.35, z], rotation: [rnd() * 3, rnd() * 3, rnd() * 3], scale: [1, 0.6 + rnd() * 0.4, 1 + rnd() * 0.5] });
  }
  const group = b.build();
  group.userData = { top: h - lip + 0.009, tray: [tw, td], size: [w, h, d] };
  return group;
}
