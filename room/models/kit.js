// Shared modeling kit for the room's procedural models.
// Units: metres, +Y up. Every model faces +Z and sits on y = 0 at its footprint centre.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE };

export const PALETTE = {
  me: 0xff5b1f,        // mechanical accent (orange)
  sw: 0x4fb4ff,        // software accent (blue)
  ink: 0x07080a,
};

// ---------------------------------------------------------------- materials
// One shared instance per name, so the whole room batches by material.
const defs = {
  aluminum:      () => new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 1, roughness: 0.34 }),
  aluminumDark:  () => new THREE.MeshStandardMaterial({ color: 0x70767e, metalness: 1, roughness: 0.42 }),
  steel:         () => new THREE.MeshStandardMaterial({ color: 0x8b9199, metalness: 1, roughness: 0.28 }),
  blackMetal:    () => new THREE.MeshStandardMaterial({ color: 0x1d1f23, metalness: 0.7, roughness: 0.45 }),
  plasticBlack:  () => new THREE.MeshStandardMaterial({ color: 0x151619, metalness: 0, roughness: 0.55 }),
  plasticGrey:   () => new THREE.MeshStandardMaterial({ color: 0x3a3d43, metalness: 0, roughness: 0.6 }),
  plasticWhite:  () => new THREE.MeshStandardMaterial({ color: 0xe6e3dc, metalness: 0, roughness: 0.5 }),
  robotBlue:     () => new THREE.MeshStandardMaterial({ color: 0x2f62d6, metalness: 0.05, roughness: 0.42 }),
  robotNavy:     () => new THREE.MeshStandardMaterial({ color: 0x1c2a5c, metalness: 0.05, roughness: 0.5 }),
  accentOrange:  () => new THREE.MeshStandardMaterial({ color: PALETTE.me, metalness: 0, roughness: 0.48 }),
  accentBlue:    () => new THREE.MeshStandardMaterial({ color: PALETTE.sw, metalness: 0, roughness: 0.48 }),
  rubber:        () => new THREE.MeshStandardMaterial({ color: 0x111112, metalness: 0, roughness: 0.92 }),
  wood:          () => new THREE.MeshStandardMaterial({ color: 0x9a6c45, metalness: 0, roughness: 0.66 }),
  woodDark:      () => new THREE.MeshStandardMaterial({ color: 0x4a3222, metalness: 0, roughness: 0.7 }),
  pegboard:      () => new THREE.MeshStandardMaterial({ color: 0xece8df, metalness: 0, roughness: 0.85 }),
  foamPurple:    () => new THREE.MeshStandardMaterial({ color: 0x7a5ad6, metalness: 0, roughness: 0.96 }),
  pcbGreen:      () => new THREE.MeshStandardMaterial({ color: 0x1f6b44, metalness: 0.1, roughness: 0.55 }),
  pcbBlue:       () => new THREE.MeshStandardMaterial({ color: 0x1b4f9c, metalness: 0.1, roughness: 0.55 }),
  copper:        () => new THREE.MeshStandardMaterial({ color: 0xc27a45, metalness: 1, roughness: 0.32 }),
  brass:         () => new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }),
  fabric:        () => new THREE.MeshStandardMaterial({ color: 0x2b2d33, metalness: 0, roughness: 1 }),
  paper:         () => new THREE.MeshStandardMaterial({ color: 0xf2efe8, metalness: 0, roughness: 0.92 }),
  screenOff:     () => new THREE.MeshStandardMaterial({ color: 0x040506, metalness: 0.2, roughness: 0.18 }),
  glass:         () => new THREE.MeshStandardMaterial({ color: 0xcfe6ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false }),
  ledWarm:       () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd6a0, emissiveIntensity: 3 }),
  ledOrange:     () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: PALETTE.me, emissiveIntensity: 3 }),
  ledBlue:       () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: PALETTE.sw, emissiveIntensity: 3 }),
  ledGreen:      () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3ddc84, emissiveIntensity: 3 }),
};
const cache = new Map();
export function mat(name) {
  if (!cache.has(name)) {
    if (!defs[name]) throw new Error('kit: unknown material "' + name + '"');
    const m = defs[name](); m.name = name; cache.set(name, m);
  }
  return cache.get(name);
}
export const MATERIALS = Object.keys(defs);

// ---------------------------------------------------------------- geometry helpers
export const box = (w, h, d, r = 0, seg = 2) =>
  r > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const sphere = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
export const torus = (r, tube, rs = 10, ts = 32, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, rs, ts, arc);
export const lathe = (points, seg = 32) => new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), seg);
/** Extrude a 2D shape (THREE.Shape, in the XY plane) by `depth` along +Z, centred on z = 0. */
export function extrude(shape, depth, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** Tube along a polyline or curve. */
export function tube(points, r, seg = 48, radial = 8) {
  const curve = points.isCurve ? points : new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, seg, r, radial, false);
}

/** A canvas texture with text on it, for labels, number plates and screens. */
export function labelTexture(text, { w = 512, h = 128, bg = '#000000', fg = '#ffffff', font = '600 72px Archivo, Arial, sans-serif', align = 'center' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = font; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(text, align === 'center' ? w / 2 : align === 'left' ? h * 0.2 : w - h * 0.2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- builder
// Collects geometry per material, then merges each material into one mesh.
// Parts (Builder.part) stay separate objects so the room can animate them.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function matrixOf(t = {}) {
  _p.fromArray(t.position || [0, 0, 0]);
  _q.setFromEuler(_e.set(...(t.rotation || [0, 0, 0])));
  const s = t.scale == null ? [1, 1, 1] : typeof t.scale === 'number' ? [t.scale, t.scale, t.scale] : t.scale;
  _s.fromArray(s);
  return _m.compose(_p, _q, _s).clone();
}

export class Builder {
  constructor(name = 'model') { this.name = name; this.items = []; this.parts = []; this.objects = []; }
  /** add(geometry, materialName, { position, rotation, scale }) */
  add(geometry, material, t) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    g.applyMatrix4(matrixOf(t));
    this.items.push({ g, material });
    return this;
  }
  /** A named, separately-transformable sub-assembly. Geometry added to it is local to its pivot. */
  part(name, t = {}) {
    const b = new Builder(name); b.transform = t; this.parts.push(b); return b;
  }
  /** Add a ready-made Object3D (e.g. a textured screen plane) with its own material. */
  object(obj, t = {}) {
    if (t.position) obj.position.fromArray(t.position);
    if (t.rotation) obj.rotation.set(...t.rotation);
    if (t.scale != null) typeof t.scale === 'number' ? obj.scale.setScalar(t.scale) : obj.scale.fromArray(t.scale);
    this.objects.push(obj); return obj;
  }
  build() {
    const group = new THREE.Group(); group.name = this.name;
    const byMat = new Map();
    for (const it of this.items) { if (!byMat.has(it.material)) byMat.set(it.material, []); byMat.get(it.material).push(it.g); }
    for (const [name, gs] of byMat) {
      const merged = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat(name));
      mesh.name = this.name + ':' + name; mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const o of this.objects) group.add(o);
    for (const p of this.parts) {
      const child = p.build();
      const t = p.transform || {};
      if (t.position) child.position.fromArray(t.position);
      if (t.rotation) child.rotation.set(...t.rotation);
      group.add(child);
    }
    return group;
  }
}

/** Count triangles in an object tree (for the performance budget). */
export function triangles(obj) {
  let n = 0;
  obj.traverse(o => { if (o.isMesh) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return Math.round(n);
}
