// The Purdue Bell Tower (1995), for the view out of the window: a 160 ft red-brick shaft with corner piers and
// limestone bands, a white clock stage with a clock on each face, an open belfry with the four 1895 Heavilon
// bells, and a maroon standing-seam pyramid roof under a white spire. Proportions measured from photographs.
// Units: metres, +Y up, base at the origin, faces square to X and Z. It is never put in the room: the window
// renders it once into a texture (shell.js), so everything here is disposable.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WIDTH = 4.6, HEIGHT = 48.8;
const SHAFT = 33.4;   // top of the brick, with its limestone cap

function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// running-bond brick, 1.2 m square per tile
function brickTexture() {
  const t = canvasTexture(256, 256, (g, W, H) => {
    g.fillStyle = '#b3a294'; g.fillRect(0, 0, W, H);
    const rows = 18, cols = 6, bh = H / rows, bw = W / cols;
    for (let r = 0; r < rows; r++) for (let k = -1; k < cols; k++) {
      const x = k * bw + (r % 2) * bw / 2, l = 30 + Math.random() * 9;
      g.fillStyle = `hsl(${10 + Math.random() * 7},${44 + Math.random() * 12}%,${l}%)`;
      g.fillRect(x + 1, r * bh + 1, bw - 2, bh - 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// one face of the clock: white dial, black chapter ring and hour marks, hands at 4:20
function clockTexture() {
  return canvasTexture(256, 256, (g, W) => {
    const c = W / 2;
    g.fillStyle = '#f7f5ef'; g.beginPath(); g.arc(c, c, c - 2, 0, 7); g.fill();
    g.strokeStyle = '#1c1c1e'; g.lineWidth = 14; g.beginPath(); g.arc(c, c, c - 10, 0, 7); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(c, c, c - 46, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      g.save(); g.translate(c, c); g.rotate(a); g.fillStyle = '#1c1c1e'; g.fillRect(-5, -(c - 22), 10, 22); g.restore();
    }
    const hand = (a, len, w) => { g.save(); g.translate(c, c); g.rotate(a); g.fillStyle = '#1c1c1e'; g.fillRect(-w / 2, -len, w, len + 14); g.restore(); };
    hand((4 + 20 / 60) / 12 * Math.PI * 2, c * 0.5, 12);
    hand(20 / 60 * Math.PI * 2, c * 0.74, 8);
  });
}
// the roof's maroon panels with light standing seams; ConeGeometry's u runs around the four faces
function roofTexture() {
  return canvasTexture(512, 64, (g, W, H) => {
    g.fillStyle = '#7b2a31'; g.fillRect(0, 0, W, H);
    for (let f = 0; f < 4; f++) {
      const x0 = f * W / 4;
      g.fillStyle = 'rgba(214,208,200,.9)';
      for (let s = 1; s < 5; s++) g.fillRect(x0 + s * W / 20 - 1, 0, 2, H);
      g.fillStyle = '#e8e4dc'; g.fillRect(x0 - 3, 0, 6, H);   // hip caps
    }
    g.fillRect(W - 3, 0, 3, H);
  });
}

/** Planar, world-scaled UVs (1.2 m per brick tile) for boxes that share the brick texture. */
function brickUV(geometry) {
  const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
    uv.setXY(i, u / 1.2, p.getY(i) / 1.2);
  }
  return geometry;
}

export default function create() {
  const mats = {
    brick: new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.92 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xe6dfd2, roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.5, metalness: 0.1, flatShading: true }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x3e3229, roughness: 0.5, metalness: 0.25 }),
    plaque: new THREE.MeshStandardMaterial({ color: 0x5c4b36, roughness: 0.6 }),
    clock: new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.6 }),
  };
  const parts = Object.fromEntries(Object.keys(mats).map(k => [k, []]));
  const add = (k, g, x = 0, y = 0, z = 0, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); parts[k].push(g.index ? g.toNonIndexed() : g); };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const W = WIDTH, faces = [0, Math.PI / 2, Math.PI, -Math.PI / 2];   // rotations that turn +Z onto each face

  // ---- shaft: a recessed brick core between four corner piers, limestone plinth, bands and cap
  add('brick', brickUV(box(W - 0.3, SHAFT, W - 0.3).translate(0, SHAFT / 2, 0)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('brick', brickUV(box(0.8, SHAFT, 0.8).translate(sx * (W / 2 - 0.4), SHAFT / 2, sz * (W / 2 - 0.4))));
  add('stone', box(W + 0.2, 1.4, W + 0.2), 0, 0.7);
  for (const y of [SHAFT - 15.5, SHAFT - 5.2]) add('stone', box(W + 0.12, 0.45, W + 0.12), 0, y);
  add('stone', box(W + 0.26, 0.5, W + 0.26), 0, SHAFT - 0.25);
  add('stone', box(W + 0.1, 0.22, W + 0.1), 0, SHAFT - 0.66);

  // ---- clock stage (33.4 → 37.1): white block, corner pilasters, a clock and a bronze plaque on every face
  const C0 = SHAFT, CS = 4.0;
  add('white', box(4.45, 0.3, 4.45), 0, C0 + 0.15);
  add('white', box(CS, 3.4, CS), 0, C0 + 0.3 + 1.7);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('white', box(0.34, 3.4, 0.34), sx * (CS / 2 - 0.12), C0 + 2.0, sz * (CS / 2 - 0.12));
  add('white', box(CS + 0.18, 0.22, CS + 0.18), 0, C0 + 3.6);
  for (const ry of faces) {
    add('clock', new THREE.CircleGeometry(0.9, 40), 0, C0 + 2.35, 0, ry);
    add('plaque', box(1.0, 0.26, 0.04), 0, C0 + 0.85, 0, ry);
  }
  // push the clocks and plaques out onto their faces
  parts.clock.forEach((g, i) => { const a = faces[i]; g.translate(Math.sin(a) * (CS / 2 + 0.02), 0, Math.cos(a) * (CS / 2 + 0.02)); });
  parts.plaque.forEach((g, i) => { const a = faces[i]; g.translate(Math.sin(a) * (CS / 2 + 0.02), 0, Math.cos(a) * (CS / 2 + 0.02)); });

  // ---- belfry (37.1 → 42.0): an arched opening on each face, inner posts, tie beams, the bells
  const B0 = C0 + 3.7, BH = 4.65, open = 2.4, spring = 2.9, r = open / 2;
  add('white', box(4.2, 0.25, 4.2), 0, B0 + 0.125);
  for (let i = 0; i < 4; i++) {
    const width = i % 2 ? CS - 0.6 : CS;   // the X faces fit between the Z faces
    const s = new THREE.Shape(); s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, BH); s.lineTo(-width / 2, BH); s.closePath();
    const hole = new THREE.Path(); hole.moveTo(-r, 0); hole.lineTo(r, 0); hole.lineTo(r, spring); hole.absarc(0, spring, r, 0, Math.PI, false); hole.lineTo(-r, 0);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false, curveSegments: 20 }).translate(0, 0, -0.3);
    add('white', g, 0, 0, 0, faces[i]);
    parts.white[parts.white.length - 1].translate(Math.sin(faces[i]) * CS / 2, B0 + 0.25, Math.cos(faces[i]) * CS / 2);
    // slim posts just inside the opening, and two tie beams across it
    for (const sx of [-1, 1]) {
      const post = box(0.2, spring, 0.2).translate(sx * (r - 0.18), spring / 2, -0.45);
      add('white', post, 0, 0, 0, faces[i]); parts.white[parts.white.length - 1].translate(Math.sin(faces[i]) * CS / 2, B0 + 0.25, Math.cos(faces[i]) * CS / 2);
    }
    for (const y of [spring - 0.1, spring - 0.75]) {
      const beam = box(open, 0.16, 0.18).translate(0, y, -0.45);
      add('white', beam, 0, 0, 0, faces[i]); parts.white[parts.white.length - 1].translate(Math.sin(faces[i]) * CS / 2, B0 + 0.25, Math.cos(faces[i]) * CS / 2);
    }
  }
  add('white', box(3.5, 0.25, 3.5), 0, B0 + BH + 0.12);   // belfry ceiling
  // the four Heavilon bells (1,200, 600, 300 and 200 lb) on a dark frame
  const bell = (mouth, h) => new THREE.LatheGeometry([[0, h], [mouth * 0.42, h], [mouth * 0.5, h * 0.82], [mouth * 0.56, h * 0.45], [mouth * 0.74, h * 0.16], [mouth, 0.02], [mouth * 0.96, 0], [mouth * 0.6, 0.06]].map(p => new THREE.Vector2(...p)), 24);
  for (const [m, h, x, y, z] of [[0.52, 0.85, 0, 1.25, 0], [0.4, 0.66, 0.85, 1.55, 0.7], [0.32, 0.52, -0.85, 1.75, -0.7], [0.27, 0.45, 0.8, 1.85, -0.8]]) {
    add('bronze', bell(m, h), x, B0 + 0.25 + y, z);
    add('bronze', box(0.08, spring - y - h + 0.1, 0.08), x, B0 + 0.25 + y + h + (spring - y - h) / 2, z);
  }
  add('bronze', box(2.6, 0.14, 0.14), 0, B0 + 0.25 + spring - 0.05, 0);
  add('bronze', box(0.14, 0.14, 2.6), 0, B0 + 0.25 + spring - 0.05, 0);

  // ---- entablature and cornice (42.0 → 42.8)
  const E0 = B0 + 0.25 + BH;
  add('white', box(CS + 0.15, 0.5, CS + 0.15), 0, E0 + 0.25);
  add('white', box(CS + 0.55, 0.3, CS + 0.55), 0, E0 + 0.65);

  // ---- roof (42.8 → 46.8): a four-sided pyramid, its faces square to the walls
  const R0 = E0 + 0.8, RH = 4.0, side = CS + 0.4;
  const roof = new THREE.ConeGeometry(side / Math.SQRT2, RH, 4, 1, true).rotateY(Math.PI / 4).translate(0, R0 + RH / 2, 0);
  add('roof', roof);
  add('white', box(side + 0.08, 0.16, side + 0.08), 0, R0 + 0.04);   // fascia at the eave

  // ---- spire: collar, needle and ball, to 160 ft
  const S0 = R0 + RH;
  add('white', new THREE.CylinderGeometry(0.2, 0.32, 0.6, 16), 0, S0 - 0.15);
  add('white', new THREE.CylinderGeometry(0.03, 0.12, HEIGHT - S0 - 0.35, 12), 0, S0 + 0.15 + (HEIGHT - S0 - 0.35) / 2);
  add('white', new THREE.SphereGeometry(0.11, 12, 8), 0, HEIGHT - 0.32);

  const group = new THREE.Group(); group.name = 'bellTower';
  for (const [k, gs] of Object.entries(parts)) {
    if (!gs.length) continue;
    for (const g of gs) for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    const m = new THREE.Mesh(mergeGeometries(gs, false), mats[k]); m.castShadow = m.receiveShadow = true; group.add(m);
  }
  group.userData.dispose = () => group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  return group;
}
