import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, mat, box, cyl, lathe, extrude, tube } from './kit.js';

// Procedural interpretation of MARSChair's frozen 2026-10-25 model.
// No vendor mesh data is embedded. MuJoCo (x,y,z) -> THREE (y,z,x):
// a proper cyclic rotation (det +1), +X LEFT, +Y UP, +Z FORWARD.
// Origin: floor below base_link. Retain the URDF's 1.2914 mm axle offset.
export const WHEEL_RADIUS = 0.0603;
export const TRACK_WIDTH = 0.37476;
export const CHAIR_SEATED = Object.freeze({ position: Object.freeze([0, 0, 0.5789]), yaw: 0 });
export const STOW = Object.freeze({
  L: Object.freeze([0, -0.15, -0.30, 0, 0, 0]),
  R: Object.freeze([0, -0.15, -0.30, 0, 0, 0]),
});
// [width, height, depth], measured from the default seated/STOW geometry.
export const SIZE = Object.freeze([0.6264, 0.9996842, 1.1334253]);
const PI = Math.PI, TAU = 2 * PI;
const FLOOR_OFFSET = 0.004975, TOP = 0.3589 + FLOOR_OFFSET;
const MOUNT = 0.6598, CROSSBAR = 0.6338;
const C = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
const CQ = new THREE.Quaternion().setFromRotationMatrix(C);
const v = p => new THREE.Vector3(...p);
const mapped = ([x, y, z]) => [y, z, x];

// One PBR material per moving link instead of multiple draws per motor/bolt.
// Colour AND roughness/metalness are batched per vertex. Fixed structure uses
// kit materials; these values come from the same shared material instances.
const assemblyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
assemblyMaterial.name = 'marschair:batched-hardware';
assemblyMaterial.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>',
    '#include <common>\nattribute vec2 finish; varying vec2 vFinish;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinish = finish;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
    '#include <common>\nvarying vec2 vFinish;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vFinish.x;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vFinish.y;');
};
assemblyMaterial.customProgramCacheKey = () => 'marschair-pbr-batch-v1';
const estopMaterial = new THREE.MeshStandardMaterial({ color: 0xb82e24, roughness: 0.38 });
estopMaterial.name = 'marschair:estop-red';

function mesh(g, material, name) {
  const m = new THREE.Mesh(g, material); m.name = name;
  m.castShadow = m.receiveShadow = true; return m;
}
function transform(g, t = {}) {
  g.applyMatrix4(new THREE.Matrix4().compose(v(t.position || [0, 0, 0]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.rotation || [0, 0, 0]))),
    v(t.scale || [1, 1, 1])));
  return g;
}
class Batch {
  constructor(builder, native = false) { this.b = builder; this.native = native; this.gs = []; }
  add(geometry, material, t = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    transform(g, t); if (this.native) g.applyMatrix4(C);
    const m = mat(material), n = g.attributes.position.count;
    const colors = new Float32Array(n * 3), finish = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      colors.set(m.color.toArray(), 3 * i); finish.set([m.roughness, m.metalness], 2 * i);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('finish', new THREE.BufferAttribute(finish, 2));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.gs.push(g); geometry.dispose(); return this;
  }
  build() {
    const g = mergeGeometries(this.gs, false); g.computeBoundingSphere();
    this.b.object(mesh(g, assemblyMaterial, this.b.name + ':hardware'));
    this.gs.forEach(g => g.dispose());
  }
}
function block(b, size, material, position, r = 0.001, rotation) {
  b.add(box(...size, Math.min(...size) <= .002 ? 0 : r, 1), material, { position, rotation });
}
function axial(b, radius, length, material, position, axis = [0, 1, 0], segments = 24) {
  const g = cyl(radius, radius, length, segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v([0, 1, 0]), v(axis)));
  b.add(g, material, { position });
}
function bolt(b, p, axis = [0, 1, 0], r = 0.003) {
  axial(b, r * 1.4, 0.0007, 'aluminumDark', p, axis, 8);
  axial(b, r, 0.002, 'aluminum', v(p).addScaledVector(v(axis), 0.001).toArray(), axis, 6);
  axial(b, r * 0.42, 0.0002, 'blackMetal', v(p).addScaledVector(v(axis), 0.0021).toArray(), axis, 6);
}
function polygon(points) {
  const s = new THREE.Shape(); s.moveTo(...points[0]);
  for (const p of points.slice(1)) s.lineTo(...p);
  s.closePath(); return s;
}
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y); return s;
}

// Four genuine open T-slots and central bore; no painted groove stripes.
function extrusionProfile(size = 0.04) {
  const a = size / 2, k = size / 0.04, points = [];
  const edge = [[-a, -a], [-.0041*k, -a], [-.0041*k, -.017*k],
    [-.0072*k, -.017*k], [-.0072*k, -.011*k], [-.0037*k, -.0074*k],
    [.0037*k, -.0074*k], [.0072*k, -.011*k], [.0072*k, -.017*k],
    [.0041*k, -.017*k], [.0041*k, -a], [a, -a]];
  for (let i = 0; i < 4; i++) for (const [x, y] of edge) {
    const a = i * PI / 2; points.push([x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
  }
  const s = polygon(points), hole = new THREE.Path();
  hole.absarc(0, 0, .0034*k, 0, TAU, true); s.holes.push(hole); return s;
}
function extrusion(b, start, end, size = 0.04) {
  const a = v(start), z = v(end), delta = z.clone().sub(a);
  const g = new THREE.ExtrudeGeometry(extrusionProfile(size), {
    depth: delta.length(), bevelEnabled: false, curveSegments: 6,
  });
  g.translate(0, 0, -delta.length() / 2);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v([0, 0, 1]), delta.normalize()));
  b.add(g, 'aluminum', { position: a.add(z).multiplyScalar(.5).toArray() });
}
function frame(b) {
  block(b, [.46, .006, .40], 'aluminum', [0, TOP + .003, -.05], .0012);
  for (let x = -.20; x <= .201; x += .05) for (let z = -.20; z <= .151; z += .05) {
    axial(b, .0025, .0004, 'blackMetal', [x, TOP + .0062, z], [0, 1, 0], 8);
  }
  extrusion(b, [-.24, CROSSBAR, 0], [.24, CROSSBAR, 0]);
  for (const s of [-1, 1]) {
    const x = s * .20;
    extrusion(b, [x, TOP + .006, 0], [x, CROSSBAR - .02, 0]);
    extrusion(b, [x, TOP + .006, -.20], [x, CROSSBAR - .02, 0], .02);
    block(b, [.12, .006, .12], 'aluminum', [x, MOUNT - .003, 0], .001);
    // L-brackets at post feet and adapter, with washer/socket hardware.
    for (const y of [TOP + .009, CROSSBAR - .025]) {
      block(b, [.066, .005, .062], 'aluminum', [x, y, -.008], .0008);
      block(b, [.063, .042, .004], 'aluminum', [x, y + .020, -.023], .0008);
      for (const dx of [-.024, .024]) bolt(b, [x + dx, y + .003, -.012]);
      for (const dx of [-.022, .022]) bolt(b, [x + dx, y + .026, -.025], [0, 0, -1], .0025);
    }
    for (const dx of [-.045, .045]) for (const z of [-.045, .045]) bolt(b, [x + dx, MOUNT + .0005, z], [0, 1, 0], .0025);
    // Cradle drops stay behind the scan and outside the body; 15-degree mouth.
    extrusion(b, [x, TOP + .01, .05], [s * .29, TOP + .01, .05]);
    extrusion(b, [s * .29, TOP + .01, .05], [s * .29, .08, .05]);
    extrusion(b, [s * .29, .08, .05], [s * .29, .08, .2964]);
    extrusion(b, [s * .29, .08, .2964], [s * .26, .08, .2964]);
    extrusion(b, [s * .26, .08, .3164], [s * .26, .08, .4664]);
    extrusion(b, [s * .26, .08, .4664], [s * (.26 + .06 * Math.sin(PI / 12)), .08, .4664 + .06 * Math.cos(PI / 12)]);
    for (const z of [.075, .269, .345, .445]) bolt(b, [s * .26, .101, z], [0, 1, 0], .0024);
    for (const y of [.12, TOP - .03]) bolt(b, [s * .311, y, .05], [s, 0, 0], .0028);
    // Electronics harness secured to each rear post, safely above scan plane.
    b.add(tube([[x, MOUNT, -.04], [x + s*.027, .58, -.028], [x + s*.027, .43, -.028], [x*.8, .383, -.105]], .0035, 22, 6), 'blackMetal');
    for (const y of [.44, .53, .60]) block(b, [.045, .004, .003], 'blackMetal', [x, y, -.021], .0005);
  }
  extrusion(b, [-.26, .08, .2964], [.26, .08, .2964]);
}

// Freight's oval/cut-off-rear shell is reconstructed from measured overall
// bounds and broad sections, not from copied/decimated STL vertices.
function freightOutline(scale = 1) {
  const s = new THREE.Shape();
  s.moveTo(-.150, -.284); s.bezierCurveTo(-.222, -.284, -.264, -.211, -.264, -.122);
  s.lineTo(-.264, .048); s.bezierCurveTo(-.264, .182, -.160, .2864, 0, .2864);
  s.bezierCurveTo(.160, .2864, .264, .182, .264, .048);
  s.lineTo(.264, -.122); s.bezierCurveTo(.264, -.211, .222, -.284, .150, -.284);
  s.lineTo(-.150, -.284); s.closePath();
  if (scale === 1) return s;
  return new THREE.Shape(s.getPoints(32).map(p => p.multiplyScalar(scale)));
}
function shellLayer(b, bottom, height, scale, material, bevel) {
  // Shape XY represents width/forward; rotate extrusion to world +Y.
  const g = extrude(freightOutline(scale), height, bevel);
  g.rotateX(PI / 2); // shape +Y -> +Z, depth -> -Y (centred, symmetric).
  b.add(g, material, { position: [0, bottom + height / 2 + FLOOR_OFFSET, 0] });
}
function freight(b) {
  // Underbody leaves rolling surfaces exposed; broad round-sided shell above.
  shellLayer(b, .070, .169, .99, 'plasticGrey', .004);
  shellLayer(b, .242, .023, 1, 'plasticGrey', .002);
  shellLayer(b, .268, .036, .965, 'blackMetal', .0015);
  shellLayer(b, .307, .037, 1, 'plasticGrey', .003);
  shellLayer(b, .347, .010, .978, 'aluminumDark', .0015);
  shellLayer(b, .057, .013, .955, 'blackMetal', .001);
  // Scanning aperture, with a real inset SICK sensor and two status lenses.
  block(b, [.106, .036, .027], 'blackMetal', [0, .292775, .261], .005);
  block(b, [.067, .024, .027], 'rubber', [0, .292775, .276], .005);
  block(b, [.049, .004, .004], 'aluminumDark', [0, .312, .273], .001);
  for (const x of [-.039, .039]) bolt(b, [x, .315, .273], [0, 0, 1], .0015);
  // Access panel, hinge, connector recess and cooling louvers at rear.
  block(b, [.213, .135, .002], 'blackMetal', [0, .172, -.2835], .008);
  block(b, [.201, .122, .003], 'plasticGrey', [0, .172, -.285], .006);
  for (const x of [-.086, .086]) for (const y of [.123, .222]) bolt(b, [x, y, -.287], [0, 0, -1], .0022);
  for (let i = 0; i < 6; i++) block(b, [.089, .004, .002], 'blackMetal', [0, .147 + .009*i, -.287], .001);
  block(b, [.062, .019, .005], 'blackMetal', [0, .221, -.287], .002);
  block(b, [.025, .008, .005], 'aluminumDark', [0, .221, -.290], .001);
  for (const s of [-1, 1]) {
    block(b, [.002, .136, .0015], 'blackMetal', [s * .261, .170, -.091], 0);
    for (const y of [.095, .229]) bolt(b, [s*.263, y, -.104], [s, 0, 0], .002);
  }
  // Rear LEFT mushroom switch: axis outward along +X, per Fetch URDF.
  axial(b, .021, .006, 'brass', [.261, .316245, -.12465], [1, 0, 0]);
  axial(b, .011, .012, 'blackMetal', [.268, .316245, -.12465], [1, 0, 0]);
  const cap = lathe([[0, -.008], [.013, -.008], [.018, -.004], [.019, .003], [.016, .008], [0, .009]], 24);
  cap.rotateZ(-PI / 2);
  b.object(mesh(cap, estopMaterial, 'robot:emergency-stop'), { position: [.281, .316245, -.12465] });
  // Four small passive casters; no invented steering actuators.
  for (const x of [-.118, .118]) for (const z of [-.210, .166]) {
    axial(b, .035, .022, 'rubber', [x, .035, z], [1, 0, 0], 20);
    for (const dx of [-.014, .014]) block(b, [.003, .041, .027], 'aluminumDark', [x + dx, .052, z], .002);
    axial(b, .009, .031, 'aluminum', [x, .035, z], [1, 0, 0], 12);
  }
  for (const s of [-1, 1]) {
    const p = b.part(s === 1 ? 'wheelL' : 'wheelR', { position: [s * TRACK_WIDTH / 2, WHEEL_RADIUS, .0012914] });
    const w = new Batch(p);
    const tire = lathe([[.036, -.024], [.052, -.023], [.058, -.017], [WHEEL_RADIUS, -.008],
      [WHEEL_RADIUS, .008], [.058, .017], [.052, .023], [.036, .024]], 40);
    tire.rotateZ(PI / 2); w.add(tire, 'rubber');
    axial(w, .039, .048, 'aluminumDark', [0, 0, 0], [1, 0, 0], 32);
    for (const side of [-1, 1]) {
      axial(w, .027, .002, 'aluminum', [side*.025, 0, 0], [1, 0, 0]);
      axial(w, .011, .004, 'blackMetal', [side*.027, 0, 0], [1, 0, 0]);
      for (let j = 0; j < 6; j++) {
        const a = j*TAU/6; bolt(w, [side*.027, .021*Math.cos(a), .021*Math.sin(a)], [side, 0, 0], .0016);
      }
    }
    w.build();
  }
}

// Exact unbaked vendor link origins. Geometry below is authored procedurally
// in those local frames. A joint's reference quaternion precedes its encoder
// rotation; this preserves the simulator's q values without Euler guessing.
// In this supplied MJCF J4 is a lateral hinge, not a generic forearm roll.
const JOINTS = [
  { p: [-.00008416, 0, .08465], r: [0, 0, 0], sign: 1 },
  { p: [.020084, .031625, .05555], r: [-PI/2, 0, 0], sign: -1 },
  { p: [-.264, 0, 0], r: [0, 0, 0], sign: 1 },
  { p: [.2426, -.054, -.001625], r: [0, 0, 0], sign: 1 },
  { p: [.078308, -.0375, -.03], r: [-PI/2, 0, 0], sign: 1 },
  { p: [.028008, 0, .04], r: [0, PI/2, 0], sign: 1 },
];
function mappedRotation(euler) {
  return CQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...euler))).multiply(CQ.clone().invert());
}
function nativePart(parent, name, p, r = [0, 0, 0]) {
  const q = mappedRotation(r), e = new THREE.Euler().setFromQuaternion(q);
  return parent.part(name, { position: mapped(p), rotation: [e.x, e.y, e.z] });
}
function motor(b, radius, height, z = -.03) {
  axial(b, radius, height, 'blackMetal', [0, 0, z], [0, 0, 1], 32);
  for (const f of [-1, 1]) {
    axial(b, radius + .001, .0028, 'aluminumDark', [0, 0, z + f*height/2], [0, 0, 1], 32);
    axial(b, radius * .59, .003, 'aluminum', [0, 0, z + f*(height/2 + .002)], [0, 0, 1], 24);
    for (let i = 0; i < 6; i++) {
      const a = i*TAU/6; bolt(b, [radius*.80*Math.cos(a), radius*.80*Math.sin(a), z + f*(height/2 + .002)], [0, 0, f], .0015);
    }
  }
}
function linkPlate(b, a, z, width, depth, height, material = 'aluminum') {
  const start = v(a), end = v(z), delta = end.clone().sub(start);
  const g = box(delta.length(), width, depth, .003, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v([1, 0, 0]), delta.normalize()));
  b.add(g, material, { position: start.add(end).multiplyScalar(.5).add(v([0, 0, height])).toArray() });
}
function arm(b, side, x) {
  const fixed = b.part('arm' + side + '_mount', { position: [x, MOUNT, 0] });
  const base = new Batch(fixed, true);
  axial(base, .041, .070, 'blackMetal', [0, 0, .039], [0, 0, 1], 32);
  axial(base, .044, .006, 'aluminum', [0, 0, .006], [0, 0, 1], 32);
  axial(base, .038, .007, 'aluminum', [0, 0, .080], [0, 0, 1], 32);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    block(base, [.022, .028, .006], 'aluminum', [sx*.035, sy*.035, .003], .002);
    bolt(base, [sx*.035, sy*.035, .008], [0, 0, 1], .0025);
  }
  for (let j = 0; j < 12; j++) {
    const a = j*TAU/12;
    block(base, [.002, .002, .049], 'aluminumDark', [.041*Math.cos(a), .041*Math.sin(a), .042], .0003, [0, 0, a]);
  }
  base.build();
  let parent = fixed;
  for (let j = 0; j < 6; j++) {
    const info = JOINTS[j], p = nativePart(parent, `arm${side}_j${j+1}`, info.p, info.r);
    const a = new Batch(p, true);
    if (j === 0) {
      // Rotating shoulder yoke with broad side cheeks and the J2 trunnion.
      axial(a, .036, .015, 'aluminum', [0, 0, .005], [0, 0, 1]);
      for (const y of [-.029, .029]) {
        const cheek = polygon([[-.033, .005], [.041, .005], [.048, .055], [.034, .078], [-.015, .079], [-.035, .045]]);
        const g = extrude(cheek, .005, .001); g.rotateX(PI/2);
        a.add(g, 'aluminum', { position: [0, y, 0] });
      }
      axial(a, .028, .060, 'blackMetal', [.020084, 0, .05555], [0, 1, 0]);
      for (const y of [-.033, .033]) axial(a, .018, .003, 'aluminum', [.020084, y, .05555], [0, 1, 0]);
    } else if (j === 1) {
      motor(a, .0275, .049, -.031);
      for (const z of [-.058, -.004]) {
        linkPlate(a, [-.010, 0, 0], [-.254, 0, 0], .041, .0045, z);
        for (const x of [-.045, -.222]) for (const y of [-.013, .013]) bolt(a, [x, y, z + .003], [0, 0, 1], .0016);
      }
      // Two structural ribs and a recessed central channel.
      for (const y of [-.018, .018]) block(a, [.190, .004, .047], 'aluminum', [-.132, y, -.031], .001);
      block(a, [.173, .022, .002], 'aluminumDark', [-.132, 0, -.0008], .003);
      for (const x of [-.264]) axial(a, .027, .057, 'aluminum', [x, 0, -.030], [0, 0, 1]);
    } else if (j === 2) {
      motor(a, .0275, .053, -.033);
      for (const z of [-.064, -.005]) linkPlate(a, [.009, -.005, 0], [.239, -.053, 0], .043, .004, z);
      linkPlate(a, [.045, -.010, 0], [.205, -.047, 0], .025, .049, -.034, 'aluminumDark');
      for (const t of [.22, .68, .88]) for (const offset of [-.013, .013]) {
        bolt(a, [.2426*t, -.054*t + offset, -.001], [0, 0, 1], .0017);
      }
      // Cabling follows this moving link; no cable spans two moving frames.
      a.add(tube([[.024, .018, -.038], [.07, .012, -.039], [.17, -.010, -.039], [.230, -.029, -.032]], .0028, 18, 6), 'blackMetal');
    } else if (j === 3) {
      motor(a, .025, .047, -.030);
      for (const z of [-.056, -.004]) linkPlate(a, [.012, 0, 0], [.078308, -.0375, 0], .033, .004, z);
      block(a, [.047, .037, .028], 'aluminum', [.078308, -.0375, -.030], .004);
      for (const x of [.037, .063]) bolt(a, [x, -.026, -.001], [0, 0, 1], .0017);
    } else if (j === 4) {
      motor(a, .030, .040, .020);
      block(a, [.038, .060, .006], 'aluminum', [.013, 0, .056], .003);
      for (const y of [-.028, .028]) block(a, [.057, .005, .035], 'aluminum', [.010, y, .042], .002);
      axial(a, .017, .056, 'aluminumDark', [.028008, 0, .040], [1, 0, 0]);
    } else {
      motor(a, .029, .041, .023);
      axial(a, .024, .007, 'aluminum', [0, 0, .049], [0, 0, 1]);
      // Parallel gripper palm is 184 mm across in the vendor assembly.
      block(a, [.062, .174, .030], 'blackMetal', [0, 0, .065], .004);
      block(a, [.047, .165, .004], 'aluminum', [0, 0, .082], .001);
      for (const y of [-.073, .073]) for (const x of [-.021, .021]) bolt(a, [x, y, .085], [0, 0, 1], .0018);
      for (const x of [-.019, .019]) block(a, [.006, .145, .005], 'aluminumDark', [x, 0, .087], .001);
      const grip = p.part(`arm${side}_grip`);
      for (const sign of [-1, 1]) {
        // Gripper local +X maps the vendor jaw slide axis +y.
        const finger = grip.part(`arm${side}_grip_${sign === 1 ? 'L' : 'R'}`, { position: [sign*.014, 0, 0] });
        const f = new Batch(finger, true);
        block(f, [.043, .014, .014], 'aluminum', [0, 0, .095], .0015);
        block(f, [.017, .012, .056], 'blackMetal', [0, 0, .126], .002);
        block(f, [.026, .011, .010], 'blackMetal', [0, -sign*.003, .151], .0015);
        for (let k = 0; k < 4; k++) block(f, [.024, .001, .001], 'aluminumDark', [0, -sign*.009, .137+k*.004], .0002);
        f.build();
      }
    }
    a.build(); parent = p;
  }
}

function chair(b) {
  // D2 supersedes the old collision builder's top rail and vertical rear legs.
  // Preserve its dimensions and capture section at y=.08, z=-.25. Bends are
  // tangent-continuous quadratics; the straight ski sits directly on the floor.
  for (const s of [-1, 1]) {
    const path = new THREE.CurvePath();
    const A = [s*.1975, .748, -.220], B = [s*.1975, .46, -.185];
    const D = [s*.1975, .080, -.250], E = [s*.22, .040, -.250];
    const F = [s*.22, .0125, -.220], G = [s*.22, .0125, .220];
    const H = [s*.22, .040, .250], I = [s*.1975, .438, .210];
    path.add(new THREE.QuadraticBezierCurve3(v(A), v([s*.1975, .57, -.177]), v(B)));
    path.add(new THREE.LineCurve3(v(B), v(D)));
    path.add(new THREE.QuadraticBezierCurve3(v(D), v([s*.22, .060, -.254]), v(E)));
    path.add(new THREE.QuadraticBezierCurve3(v(E), v([s*.22, .0125, -.250]), v(F)));
    path.add(new THREE.LineCurve3(v(F), v(G)));
    path.add(new THREE.QuadraticBezierCurve3(v(G), v([s*.22, .0125, .250]), v(H)));
    path.add(new THREE.LineCurve3(v(H), v(I)));
    b.add(new THREE.TubeGeometry(path, 100, .0125, 12, false), 'steel');
    // Side seat-support tubes and shell attachment bosses.
    b.add(tube([[s*.1975, .435, -.186], [s*.1975, .428, .015], [s*.1975, .438, .211]], .010, 24, 10), 'steel');
    for (const z of [-.145, .160]) {
      block(b, [.035, .012, .027], 'plasticGrey', [s*.177, .437, z], .003);
      axial(b, .004, .002, 'steel', [s*.18, .431, z], [0, -1, 0], 12);
    }
    for (const y of [.592, .728]) axial(b, .006, .004, 'steel', [s*.185, y, -.229], [0, 0, -1], 16);
  }
  // Sculpted injection-moulded seat: subtle dish, upturned edges and waterfall
  // front lip. Subdivision is for curvature, not a high-poly tessellation.
  const seat = box(.44, .060, .46, .029, 4); seat.scale(1, .3, 1);
  const sp = seat.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i);
    const edge = Math.pow(Math.abs(x)/.22, 4);
    const dish = -.009*(1-Math.pow(x/.22,2))*(1-Math.pow(z/.23,2));
    const lip = -.010*Math.pow(Math.max(0, z/.23), 8);
    sp.setY(i, sp.getY(i) + .451 + dish + .004*edge + lip);
  }
  seat.computeVertexNormals(); b.add(seat, 'plasticGrey');
  const back = box(.44, .24, .050, .024, 6); back.scale(1, 1, .3);
  const bp = back.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), t = (bp.getY(i)+.12)/.24;
    // Curves away toward top; wings wrap forward around the sitter.
    const z = -.204 - .049*t*t + .022*Math.pow(x/.22, 2);
    bp.setXYZ(i, x*(.96+.04*Math.sin(PI*t)), bp.getY(i)+.680, bp.getZ(i)+z);
  }
  back.computeVertexNormals(); b.add(back, 'plasticGrey');
}

/** Set encoder angles in radians; grip=0 closed, 1 fully open (50 mm/side).
 * Fixed MJCF frame rotations precede joint rotations. +q has the same sign
 * as MuJoCo. Pass either the robot group or the enclosing marschair group.
 */
export function setArm(robotGroup, side, q, grip = 0) {
  if (side !== 'L' && side !== 'R') throw new RangeError('setArm: side must be L or R');
  if (!q || q.length !== 6 || !Array.from(q).every(Number.isFinite)) throw new TypeError('setArm: six finite joint angles required');
  if (!Number.isFinite(grip)) throw new TypeError('setArm: finite grip required');
  const joints = JOINTS.map((j, i) => robotGroup.getObjectByName(`arm${side}_j${i+1}`));
  if (joints.some(p => !p)) throw new Error('setArm: MARSChair arm parts missing');
  joints.forEach((p, i) => {
    p.quaternion.copy(mappedRotation(JOINTS[i].r)).multiply(
      new THREE.Quaternion().setFromAxisAngle(v([0, JOINTS[i].sign, 0]), q[i]));
    p.userData.angle = q[i];
  });
  const opening = THREE.MathUtils.clamp(grip, 0, 1);
  for (const [suffix, sign] of [['L', 1], ['R', -1]]) {
    robotGroup.getObjectByName(`arm${side}_grip_${suffix}`).position.x = sign*(.014+.05*opening);
  }
  robotGroup.getObjectByName(`arm${side}_grip`).userData.opening = opening;
}

export default function create() {
  const root = new THREE.Group(); root.name = 'marschair';
  const rb = new Builder('robot'); freight(rb); frame(rb);
  arm(rb, 'L', .20); arm(rb, 'R', -.20);
  const robot = rb.build(), cb = new Builder('chair'); chair(cb);
  const chairGroup = cb.build(); chairGroup.position.fromArray(CHAIR_SEATED.position);
  chairGroup.rotation.y = CHAIR_SEATED.yaw; root.add(robot, chairGroup);
  for (const side of ['L', 'R']) {
    for (let i = 0; i < 6; i++) {
      const p = robot.getObjectByName(`arm${side}_j${i+1}`);
      p.userData = { motion: 'rotation', axis: JOINTS[i].sign === 1 ? 'Y' : '-Y',
        axisVector: [0, JOINTS[i].sign, 0], space: 'local', pivot: p.position.toArray(),
        referenceQuaternion: mappedRotation(JOINTS[i].r).toArray(), encoderUnits: 'radians' };
    }
    const grip = robot.getObjectByName(`arm${side}_grip`);
    grip.userData = { motion: 'gripper', range: [0, 1], travelPerFinger: .05 };
    for (const [suffix, sign] of [['L', 1], ['R', -1]]) {
      robot.getObjectByName(`arm${side}_grip_${suffix}`).userData = {
        motion: 'translation', axis: sign === 1 ? '+X' : '-X', range: [0, .05], space: 'parent',
      };
    }
    const w = robot.getObjectByName('wheel' + side);
    w.userData = { motion: 'rotation', axis: 'X', radius: WHEEL_RADIUS, pivot: w.position.toArray(), space: 'local' };
    setArm(robot, side, STOW[side]);
  }
  robot.userData = { title: 'MARSChair', units: 'metres', front: '+Z', left: '+X',
    origin: 'floor under base_link', wheelRadius: WHEEL_RADIUS, trackWidth: TRACK_WIDTH };
  chairGroup.userData = { units: 'metres', front: '+Z', origin: 'ski-footprint centre', seated: CHAIR_SEATED };
  root.userData = { title: 'MARSChair · Purdue MARS Lab', units: 'metres', front: '+Z',
    description: 'Freight base, 4040 cradle and portal, two stowed reBot arms, captured sled chair.',
    assumptions: 'Procedural visual geometry; chair dimensions and mount grid unmeasured. D2 chair appearance takes precedence over older collision geometry. No vendor mesh assets.' };
  root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  root.userData.size = bounds.getSize(new THREE.Vector3()).toArray(); root.userData.bounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
  return root;
}
