import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, box, cyl, torus, lathe } from './kit.js';

// IMG_0309.MOV reconstruction. Metres, Y up; recognisable engine face is +Z.
// The 1/4/16 s views establish the stand, rim, deck and tyre connector;
// 26/34/42/56 s establish the striped face, clear course and bent blue arm.
// Hidden internals are a constrained reconstruction, NOT measured engineering
// dimensions. Keep those assumptions together here so they can be corrected.
const P = 0.008, B = 0.0096, H = 0.0032, TAU = 2 * Math.PI;
const Z_AXIS = [Math.PI / 2, 0, 0];
const K = Object.freeze({ r: P, rod: 4 * P, axleY: 0.0272, planeZ: 0.004,
  valveY: 0.1032, valveThrow: 0.0028, rockerX: -P, rockerY: 0.1192,
  rockerRadius: 2 * P, valveX: P, valveRod: 2 * P, linkageZ: -0.022 });
export const CYCLE = Object.freeze({
  stroke: 2 * P, bore: 4 * P, valveLeadDeg: 90,
  notes: 'Single cylinder and 90 degree timing are supplied by Nirav. Stroke 16 mm and square bore width 32 mm are stud-grid estimates, not visible measurements. The internal slider-crank and slide valve are inferred. The observed blue bent arm and green 3-hole link use exact circle-intersection linkage closure. A sinusoidal 90-degree valve law represents the occluded timing drive; its transmission cannot be established from the video. Vacuum body and short wand are a compact tabletop reconstruction; only the grey red-button coupling and tyre seal are clearly visible.'
});

const colour = {
  blue: 0x0055bf, azure: 0x36aebf, white: 0xf2f3f2, light: 0xa0a5a9,
  dark: 0x6c6e68, tan: 0xe4cd9e, red: 0xc91a09, yellow: 0xf2cd37,
  green: 0x237841, black: 0x212121, purple: 0x5a3587,
};
// Shared across every create(); no copies per brick or per animation frame.
const materials = Object.fromEntries(Object.entries(colour).map(([name, color]) => {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.29, metalness: 0,
    clearcoat: 0.20, clearcoatRoughness: 0.22 });
  m.name = `lego:${name}`;
  return [name, m];
}));
materials.clear = new THREE.MeshPhysicalMaterial({ color: 0xdce8e8, roughness: 0.16,
  transparent: true, opacity: 0.24, depthWrite: false, clearcoat: 0.4,
  side: THREE.FrontSide });
materials.clear.name = 'lego:trans-clear';
materials.rubber = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.76 });
materials.rubber.name = 'lego:tyre-rubber';

// Use Builder for hierarchy/pivots, with a separate colour batch per part.
// This keeps real holes, seams and studs without one draw call per LEGO piece.
class Batch {
  constructor(builder) { this.builder = builder; this.gs = new Map(); }
  add(geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1)));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.gs.has(color)) this.gs.set(color, []);
    this.gs.get(color).push(g);
    geometry.dispose();
  }
  finish() {
    for (const [color, gs] of this.gs) {
      const geometry = mergeGeometries(gs, false);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, materials[color]);
      mesh.name = `${this.builder.name}:${color}`;
      mesh.castShadow = mesh.receiveShadow = true;
      this.builder.object(mesh);
      gs.forEach(g => g.dispose());
    }
    this.gs.clear();
  }
}
function block(a, size, color, pos, radius = 0.00016, rot) {
  a.add(box(...size, radius, 1), color, pos, rot);
}
function cylinder(a, radius, length, color, pos, axis = 'Y', n = 16) {
  a.add(cyl(radius, radius, length, n), color, pos,
    axis === 'Z' ? Z_AXIS : axis === 'X' ? [0, 0, -Math.PI / 2] : [0, 0, 0]);
}
function stud(a, color, x, y, z) {
  a.add(cyl(0.00232, 0.0024, 0.0017, 12), color, [x, y + 0.00085, z]);
}
// Top y is the top of the brick, excluding studs. Tiny physical gaps, no
// painted seam grid, make the individually assembled bricks legible up close.
function brick(a, nx, nz, height, color, x, top, z, studs = false) {
  block(a, [nx * P - 0.00016, height - 0.00010, nz * P - 0.00016], color,
    [x, top - height / 2, z]);
  if (studs) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++)
    stud(a, color, x + (i - (nx - 1) / 2) * P, top, z + (j - (nz - 1) / 2) * P);
}
function polygon(points) {
  const s = new THREE.Shape(); s.moveTo(...points[0]);
  points.slice(1).forEach(p => s.lineTo(...p)); s.closePath(); return s;
}
function hole(s, x, y, r = 0.0024, n = 12) {
  const h = new THREE.Path();
  for (let i = 0; i < n; i++) { const t = -TAU * i / n;
    const p = [x + r * Math.cos(t), y + r * Math.sin(t)];
    i ? h.lineTo(...p) : h.moveTo(...p);
  }
  h.closePath(); s.holes.push(h);
}
function ext(shape, depth, bevel = 0.00010) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2,
    steps: 1, curveSegments: 8, bevelEnabled: bevel > 0, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2 + bevel); return g;
}
function beamShape(n, vertical = false) {
  const length = (n - 1) * P, r = 0.0038, s = new THREE.Shape();
  s.absarc(0, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  s.absarc(length, 0, r, -Math.PI / 2, Math.PI / 2, false); s.closePath();
  for (let i = 0; i < n; i++) hole(s, i * P, 0);
  return s;
}
function beam(a, n, color, pos, rot = [0, 0, 0], depth = 0.0076) {
  a.add(ext(beamShape(n), depth), color, pos, rot);
}
function ring(a, r, inner, depth, color, pos, rot = [0, 0, 0], seg = 32) {
  const s = new THREE.Shape();
  for (let i = 0; i < seg; i++) { const t = i * TAU / seg;
    i ? s.lineTo(r * Math.cos(t), r * Math.sin(t)) : s.moveTo(r * Math.cos(t), r * Math.sin(t)); }
  s.closePath(); hole(s, 0, 0, inner, seg);
  a.add(ext(s, depth, 0), color, pos, rot);
}
function pin(a, x, y, z, color = 'light', length = 0.009) {
  cylinder(a, 0.0023, length, color, [x, y, z], 'Z', 12);
}
function crossAxle(a, length, color, pos) {
  block(a, [0.0044, 0.0016, length], color, pos, 0.00008);
  block(a, [0.0016, 0.0044, length], color, pos, 0.00008);
}
function technicBrick(a, n, color, pos, rot = [0, 0, 0], studs = true) {
  const s = polygon([[-P / 2 + 0.00008, -B / 2], [(n - 0.5) * P - 0.00008, -B / 2],
    [(n - 0.5) * P - 0.00008, B / 2], [-P / 2 + 0.00008, B / 2]]);
  for (let i = 0; i < n - 1; i++) hole(s, (i + 0.5) * P, -0.0008);
  a.add(ext(s, P - 0.00016), color, pos, rot);
  if (studs) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot));
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3(i * P, B / 2 + 0.00085, 0).applyMatrix4(m).add(new THREE.Vector3(...pos));
      a.add(cyl(0.00232, 0.0024, 0.0017, 12), color, p.toArray(), rot);
    }
  }
}

function stand(a) {
  // Asymmetric open ladder stand. The broad grey platform lies to the right
  // in the 26–42 s front views; the tan rim shelf projects toward the viewer.
  brick(a, 14, 6, H, 'dark', 0.016, H, -0.026, true);
  brick(a, 6, 6, H, 'light', 0.056, 2 * H, 0.022, true);
  brick(a, 8, 6, H, 'tan', 0, H, 0.068, true);
  for (const z of [-0.048, 0.032]) technicBrick(a, 16, 'dark', [-0.044, 0.008, z]);
  // Perpendicular open ends, not a filled slab under the cylinder.
  for (const x of [-0.048, 0.032, 0.076])
    technicBrick(a, 10, x === 0.076 ? 'light' : 'dark', [x, 0.008, -0.044], [0, -Math.PI / 2, 0]);
  brick(a, 2, 10, H, 'blue', 0, 0.0096, -0.016, true);
  brick(a, 6, 4, H, 'red', 0, 0.0128, -0.004);
  // Bushes at the exposed ends of the stand's Technic cross-axles.
  for (const x of [-0.056, 0.082]) {
    cylinder(a, 0.0022, 0.020, 'light', [x, 0.008, 0.032], 'X', 12);
    cylinder(a, 0.0031, 0.004, 'light', [x, 0.008, 0.032], 'X', 12);
  }
}
function enclosure(a) {
  const base = 0.0128;
  // Front is six studs; five opaque brick courses, then a two-course window.
  const rows = [
    [['white', 1], ['azure', 4], ['white', 1]],
    [['azure', 1], ['white', 4], ['white', 1]],
    [['blue', 1], ['azure', 4], ['yellow', 1]],
    [['white', 2], ['azure', 4]],
    [['white', 3], ['azure', 3]],
  ];
  rows.forEach((row, i) => {
    let x = -0.024;
    for (const [color, n] of row) {
      if (i === 1 && n === 4) {
        // Real shaft passage through the lower white front brick.
        const face = polygon([[-0.01592,-0.00475],[0.01592,-0.00475],[0.01592,0.00475],[-0.01592,0.00475]]);
        hole(face,0,0,0.0025,16);
        a.add(ext(face,P-0.00016),color,[0,base+(i+0.5)*B,0.028]);
      } else brick(a, n, 1, B, color, x + n * P / 2, base + (i + 1) * B, 0.028);
      x += n * P;
    }
    for (const side of [-1, 1]) {
      // Two staggered bricks per side leave a true hollow working chamber.
      const widths = i % 2 ? [2, 4] : [3, 3]; let z = -0.024;
      widths.forEach(n => {
        brick(a, 1, n, B, 'white', side * 0.020, base + (i + 1) * B, z + n * P / 2);
        z += n * P;
      });
    }
    brick(a, 6, 1, B, i % 2 ? 'white' : 'blue', 0, base + (i + 1) * B, -0.028);
  });
  // Small side telltales and the azure bracket at the window's right edge.
  brick(a, 2, 1, H, 'azure', 0.024, 0.0608, 0.028, true);
  for (const side of [-1, 1]) {
    brick(a, 1, 1, H, 'yellow', side * 0.024, 0.061, -0.008, true);
    block(a, [0.001, 0.0032, 0.016], 'yellow', [side * 0.0242, 0.034, 0.014]);
  }
  // Thin-walled trans-clear bricks: four surfaces but no stacked internal
  // faces. They show the piston without a second render/transmission pass.
  for (let x = -0.016; x <= 0.016; x += 0.016) {
    block(a, [0.01584, 2 * B - 0.0001, 0.0012], 'clear', [x, 0.0704, 0.0313]);
    for (const dx of [-0.0071, 0.0071]) block(a, [0.0013, 2 * B - 0.0001, 0.006], 'clear', [x + dx, 0.0704, 0.0279]);
    stud(a, 'clear', x - 0.004, 0.080, 0.028);
    stud(a, 'clear', x + 0.004, 0.080, 0.028);
  }
  for (const x of [-0.0233, 0.0233]) for (let z = -0.016; z <= 0.016; z += 0.016)
    block(a, [0.0012, 2 * B - 0.0001, 0.01584], 'clear', [x, 0.0704, z]);
  brick(a, 6, 1, 2 * B, 'white', 0, 0.080, -0.028);
  brick(a, 6, 6, H, 'clear', 0, 0.0832, 0.008);
  // Three outward-facing hollow studs on the blue front window bracket.
  brick(a, 3, 1, B, 'blue', -0.004, 0.0704, 0.0315, true);
  for (let i = 0; i < 3; i++) ring(a, 0.0024, 0.00165, 0.0017, 'blue', [-0.012 + i * P, 0.0656, 0.0364], [0, 0, 0], 12);
  for (const x of [-0.020, 0.020]) brick(a, 1, 2, 2 * B, 'light', x, 0.0832, 0.024, true);
  // A lightly detailed cylinder guide only at the rear. No solid internal
  // dummy cylinder that would hide/intersect the sliding square LEGO piston.
  for (const x of [-0.014, 0.014]) block(a, [0.001, 0.040, 0.002], 'light', [x, 0.043, -0.021]);
  // Short socket joins the rear chamber to the tyre adapter without a gap.
  ring(a, 0.015, 0.011, 0.012, 'black', [0, 0.052, -0.035]);
  ring(a, 0.0038, 0.0025, 0.009, 'white', [0, K.axleY, 0.034]);
  ring(a, 0.0030, 0.0025, 0.0032, 'tan', [0, K.axleY, 0.042]);
}
function deckAndTower(batch) {
  // The 34/56 s close-ups resolve two courses in the window: the lower
  // blue side-stud brick and the clear opening above it.
  const a = { add(g, color, p = [0,0,0], r) { batch.add(g, color, [p[0], p[1] + B, p[2]], r); } };
  brick(a, 6, 6, H, 'blue', 0, 0.0768, 0.008);
  // Exposed perimeter studs only, preserving budget and clean deck objects.
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++)
    if (i === 0 || i === 5 || j === 0 || j === 5)
      stud(a, 'blue', (i - 2.5) * P, 0.0768, 0.008 + (j - 2.5) * P);
  brick(a, 4, 1, H, 'red', 0.004, 0.080, 0.020, false);
  // The 1x4 red tile runs across the front, as seen at 34/56 s.
  cylinder(a, 0.0039, 0.0017, 'white', [-0.012, 0.07765, 0.020]);
  brick(a, 2, 2, H, 'azure', 0, 0.080, 0.004);
  for (const x of [-0.012, 0.012]) beam(a, 2, 'light', [x, 0.0816, -0.004], [-Math.PI / 2, 0, Math.PI / 2], 0.0032);
  block(a, [0.008, 0.0032, 0.026], 'light', [0.008, 0.0816, 0.004]);
  block(a, [0.006, 0.012, 0.004], 'light', [-0.008, 0.0844, 0.008], 0.0002, [-0.12, 0, 0]);
  a.add(torus(0.0049, 0.0007, 6, 18), 'black', [-0.008, 0.091, 0.006], [-0.18, 0, 0]);
  for (let i = 0; i < 3; i++) block(a, [0.00085, 0.0048, 0.001], 'black',
    [-0.008 + Math.sin(i * TAU / 3) * 0.0024, 0.091 + Math.cos(i * TAU / 3) * 0.0024, 0.006], 0.00005, [0, 0, -i * TAU / 3]);
  // Raised light-grey crossbar beneath the valve gear; small protruding ears.
  for (const x of [-0.024, 0.024]) brick(a, 1, 2, H, 'white', x, 0.080, -0.020, true);
  brick(a, 4, 1, B, 'white', 0, 0.0864, -0.020, true);
  for (const x of [-0.020, 0.020]) brick(a, 1, 2, H, 'light', x, 0.0736, 0.040, true);
  // Rear blue/white wall and bearing tower, with actual Technic bores.
  brick(a, 6, 2, B, 'white', 0, 0.0864, -0.032);
  brick(a, 2, 2, B, 'blue', -0.016, 0.096, -0.032);
  brick(a, 2, 2, B, 'blue', 0.016, 0.096, -0.032);
  brick(a, 2, 1, B, 'white', 0, 0.096, -0.036);
  technicBrick(a, 3, 'light', [-0.016, 0.1008, -0.030], [0, 0, 0], false);
  technicBrick(a, 2, 'black', [-0.012, 0.1104, -0.030], [0, 0, 0], true);
  brick(a, 3, 1, H, 'black', 0.012, 0.1008, -0.036, true);
  block(a,[0.00784,0.0048,0.02384],'light',[0.016,0.1032,-0.032]);
  for (const z of [-0.040, -0.024]) stud(a, 'light', 0.016, 0.1056, z);
  cylinder(a, 0.0023, 0.024, 'tan', [K.rockerX, K.rockerY - B, K.linkageZ - 0.006], 'Z');
  // Static slide rails flank the moving white valve block.
  for (const x of [0.003, 0.013]) block(a, [0.0018, 0.020, 0.0076], 'light', [x, 0.090, -0.033]);
}
function flywheel(builder) {
  const b = builder.part('flywheel', { position: [0, K.axleY, 0.066] }), a = new Batch(b);
  // Tyreless LBG rim, with raised flanges and twin bead grooves. Profile
  // taken from 20/26 s; nominal outside diameter 43.2 mm, width 26 mm.
  const profile = [[0.0152,-0.013],[0.0210,-0.013],[0.0216,-0.0125],
    [0.0216,-0.0110],[0.0201,-0.0105],[0.0201,-0.0093],[0.0211,-0.0088],
    [0.0211,-0.0076],[0.0198,-0.0070],[0.0198,0.0070],[0.0211,0.0076],
    [0.0211,0.0088],[0.0201,0.0093],[0.0201,0.0105],[0.0216,0.0110],
    [0.0216,0.0125],[0.0210,0.013],[0.0152,0.013],[0.0152,-0.013]];
  a.add(lathe(profile, 48), 'light', [0,0,0], Z_AXIS);
  ring(a, 0.0153, 0.0055, 0.0020, 'light', [0, 0, -0.005]);
  cylinder(a, 0.0055, 0.021, 'light', [0,0,0], 'Z', 24);
  for (let i=0;i<6;i++) {
    const t=i*TAU/6;
    block(a,[0.0024,0.010,0.004], 'light', [Math.sin(t)*0.010,Math.cos(t)*0.010,0.006],0.0002,[0,0,-t]);
  }
  // The shaft ends at the back of the crank cheek: the rod passes behind
  // it at bottom dead centre, never through a continuous axle.
  crossAxle(a, 0.0856, 'light', [0, 0, -0.0208]);
  a.finish();
}
function movingParts(builder) {
  flywheel(builder);
  const c = new Batch(builder.part('crank', { position: [0, K.axleY, K.planeZ] }));
  // Main crank and visible azure axle connector rotate together about +Z.
  for (const z of [0, 0.039]) {
    beam(c, 2, 'azure', [0,0,z], [0,0,Math.PI/2], 0.0032);
    pin(c, 0, P, z + (z === 0 ? -0.003 : 0.003), 'azure', 0.008);
  }
  c.finish();
  const rod = new Batch(builder.part('conrod'));
  beam(rod, 5, 'light', [0,0,0], [0,0,Math.PI/2], 0.0030);
  rod.finish();
  const piston = new Batch(builder.part('piston'));
  // Hollow underside gives the small-end eye 0.2 mm clearance at its top.
  block(piston,[0.0304,0.0024,0.0304],'azure',[0,0.0052,0],0.00016);
  for(const x of [-0.010,0.010]) block(piston,[0.0104,0.0008,0.0304],'azure',[x,0.0036,0],0.00008);
  for(const z of [-0.004,0.004]) {
    block(piston,[0.008,0.0048,0.0024],'azure',[0,0.0016,z],0.00018);
  }
  pin(piston,0,0,0,'azure',0.0104);
  piston.finish();
  const v = new Batch(builder.part('valve'));
  block(v,[0.006,0.008,0.0046],'white',[0,0,-0.007],0.00016);
  pin(v,0,0,0,'white',0.014);
  v.finish();
  const link = new Batch(builder.part('valveLink'));
  beam(link,3,'green',[0,0,0],[0,0,Math.PI/2],0.0032);
  link.finish();
  const lever = new Batch(builder.part('startLever', { position: [K.rockerX, K.rockerY, K.linkageZ-0.0158] }));
  // Thin bent liftarm: horizontal 5-hole run and a 3-hole oblique extension.
  // The video shows genuine holes, not a blue solid bar.
  const pts = [[0.0198,0.0038],[-0.022,0.0038],[-0.037,0.0298],[-0.0436,0.026],[-0.0264,-0.0038],[0.0198,-0.0038]];
  const shape=polygon(pts);
  for(let i=-3;i<=2;i++)hole(shape,i*P,0);
  for(let i=1;i<=3;i++)hole(shape,-0.024-i*0.004, i*0.00693);
  lever.add(ext(shape,0.0038),'blue');
  pin(lever,0.016,0,0.008,'tan',0.022);
  cylinder(lever,0.003,0.008,'light',[-0.036,0.02079,0.004],'Z');
  lever.finish();
}

function vacuum(builder) {
  const b=builder.part('vacuum'),a=new Batch(b);
  // Compact, straight short wand behind the engine. The vacuum motor/handle
  // are set to one side, like a cordless handheld body resting on its battery.
  // The video only resolves the coupler; no model/brand is asserted here.
  const y=0.052;
  ring(a,0.022,0.014,0.019,'rubber',[0,y,-0.049]);
  for(let k=0;k<3;k++)a.add(torus(0.021,0.0014,5,36),'rubber',[0,y,-0.042-k*0.006]);
  for(let k=0;k<36;k++) {
    const t=k*TAU/36;
    block(a,[0.0011,0.0014,0.017],'rubber',[Math.cos(t)*0.022, y+Math.sin(t)*0.022,-0.049],0.00025,[0,0,t-Math.PI/2]);
  }
  cylinder(a,0.0178,0.052,'dark',[0,y,-0.082],'Z',36);
  ring(a,0.0184,0.017,0.003,'black',[0,y,-0.102]);
  cylinder(a,0.0068,0.002,'red',[0,y+0.0175,-0.080]);
  a.add(torus(0.007,0.0006,6,24),'black',[0,y+0.017,-0.080],[Math.PI/2,0,0]);
  cylinder(a,0.0155,0.102,'light',[0,y,-0.158],'Z',40);
  ring(a,0.0165,0.014,0.008,'dark',[0,y,-0.209]);
  // Inlet elbow is integral to the vacuum, keeping the wand straight.
  block(a,[0.070,0.034,0.040],'dark',[0.021,y,-0.232],0.013);
  cylinder(a,0.031,0.096,'clear',[0.048,0.050,-0.261],'X',40);
  cylinder(a,0.015,0.087,'light',[0.048,0.050,-0.261],'X',32);
  for(const x of [0.002,0.094])ring(a,0.0318,0.027,0.004,'dark',[x,0.050,-0.261],[0,Math.PI/2,0]);
  ring(a,0.0311,0.028,0.003,'red',[0.093,0.050,-0.261],[0,Math.PI/2,0]);
  // Grey cyclone shell, radial small cones, purple rear filter cap.
  cylinder(a,0.0315,0.057,'dark',[0.126,0.063,-0.261],'X',40);
  for(let k=0;k<10;k++){
    const t=k*TAU/10;
    a.add(cyl(0.0074,0.0042,0.026,12),'light',
      [0.105,0.063+Math.cos(t)*0.022,-0.261+Math.sin(t)*0.022],[0,0,Math.PI/2]);
  }
  cylinder(a,0.0305,0.016,'purple',[0.162,0.063,-0.261],'X',40);
  for(let k=0;k<28;k++) {
    const t=k*TAU/28;
    block(a,[0.010,0.0013,0.003],'black',[0.171,0.063+Math.cos(t)*0.024,-0.261+Math.sin(t)*0.024],0.00035,[t,0,0]);
  }
  // Open pistol handle: no solid infill. Battery is the tabletop contact.
  block(a,[0.055,0.018,0.037],'dark',[0.167,0.084,-0.261],0.007);
  block(a,[0.017,0.065,0.030],'dark',[0.194,0.048,-0.261],0.006,[0,0,0.20]);
  block(a,[0.060,0.015,0.055],'dark',[0.176,0.0075,-0.261],0.004);
  block(a,[0.015,0.008,0.012],'red',[0.176,0.068,-0.240],0.002,[0,0,-0.25]);
  block(a,[0.043,0.003,0.050],'black',[0.178,0.0016,-0.261],0.0015);
  // A low molded skid beneath the bin supplies a second real table contact.
  block(a,[0.036,0.019,0.034],'dark',[0.030,0.0095,-0.261],0.004);
  a.finish();
}

const states = new WeakMap();
/** Pose the complete cycle in radians. Theta=0 is piston top dead centre.
 * Parts remain rigid: only group rotation/translation changes, never scales.
 * The piston uses the exact slider-crank equation; the green link and blue
 * arm are solved by intersecting two circles, not independently oscillated.
 */
export function setCrank(group, theta) {
  const s=states.get(group);
  if(!s)throw new TypeError('setCrank expects a group returned by legoengine.create()');
  if(!Number.isFinite(theta))throw new TypeError('Crank angle must be finite radians');
  theta=THREE.MathUtils.euclideanModulo(theta,TAU);
  const x=-K.r*Math.sin(theta), y=K.axleY+K.r*Math.cos(theta);
  const py=y+Math.sqrt(K.rod*K.rod-x*x);
  s.flywheel.rotation.z=theta; s.crank.rotation.z=theta;
  s.conrod.position.set(x,y,K.planeZ-0.0045);
  s.conrod.rotation.z=Math.atan2(x,py-y);
  s.piston.position.set(0,py,K.planeZ-0.0045);
  const vy=K.valveY+K.valveThrow*Math.cos(theta+Math.PI/2);
  s.valve.position.set(K.valveX,vy,K.linkageZ);
  // Circle A = blue output pin orbit; circle B = green link about valve pin.
  const dx=K.valveX-K.rockerX, dy=vy-K.rockerY, d=Math.hypot(dx,dy);
  const along=(K.rockerRadius**2-K.valveRod**2+d*d)/(2*d);
  const h=Math.sqrt(Math.max(0,K.rockerRadius**2-along**2));
  const qx=K.rockerX+along*dx/d-h*dy/d;
  const qy=K.rockerY+along*dy/d+h*dx/d;
  s.startLever.rotation.z=Math.atan2(qy-K.rockerY,qx-K.rockerX);
  s.valveLink.position.set(K.valveX,vy,K.linkageZ);
  s.valveLink.rotation.z=Math.atan2(-(qx-K.valveX),qy-vy);
  group.userData.crankAngle=theta;
  return group;
}

export default function create() {
  const root=new Builder('legoengine');
  const engine=root.part('engine'); const a=new Batch(engine);
  stand(a); enclosure(a); deckAndTower(a); a.finish();
  movingParts(engine); vacuum(root);
  const group=root.build();
  const names=['flywheel','crank','conrod','piston','valve','valveLink','startLever'];
  const state=Object.fromEntries(names.map(n=>[n,group.getObjectByName(n)]));
  states.set(group,state);
  group.userData={title:'LEGO vacuum engine',units:'metres',front:'+Z',
    description:'Single-cylinder suction engine; striped LEGO chamber, clear window, tyreless flywheel and bent Technic valve arm.',
    cycle:CYCLE, evidence:{
      '1–16 s':'Open grey stand, tan flywheel shelf, blue deck, red tile, white round tile, black steering wheel, tyre coupler and red vacuum button.',
      '20–26 s':'Twin-groove light grey rim, azure crank fittings, striped six-stud-wide front.',
      '31–42 s, 12/15 fps bursts':'Bent blue Technic arm, green 3-hole link, black/light-grey bearing tower. Timing drive is obscured.',
      '50–56 s':'Clear-brick window and three outward-facing blue hollow studs.',
      inferred:CYCLE.notes,
    }};
  for(const name of ['flywheel','crank','startLever'])state[name].userData={motion:'rotation',axis:'Z',pivot:state[name].position.toArray(),space:'parent'};
  for(const name of ['piston','valve'])state[name].userData={motion:'translation',axis:'Y',space:'parent',stroke:name==='piston'?CYCLE.stroke:K.valveThrow*2};
  for(const name of ['conrod','valveLink'])state[name].userData={motion:'planar linkage',axis:'Z',space:'parent',pinDistance:name==='conrod'?K.rod:K.valveRod};
  group.getObjectByName('vacuum').userData={motion:'fixed',source:'Coupler observed; handheld body and compact wand inferred.'};
  setCrank(group,1.3);
  // Centre the complete footprint without moving animation pivots relative
  // to the engine. All coordinates in setCrank are engine-local.
  const bb=new THREE.Box3().setFromObject(group, true),center=bb.getCenter(new THREE.Vector3());
  for(const child of group.children) {child.position.x-=center.x;child.position.z-=center.z;child.position.y-=bb.min.y;}
  group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group, true);
  group.userData.footprint={width:bounds.max.x-bounds.min.x,depth:bounds.max.z-bounds.min.z};
  group.userData.height=bounds.max.y;
  group.userData.engineCenter=group.getObjectByName('engine').position.toArray();
  group.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  return group;
}
