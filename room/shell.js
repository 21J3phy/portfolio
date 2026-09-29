// The room itself: architecture, lighting, and the wall-mounted pieces that carry content
// (name sign, live-flow display, pinboard, whiteboard, FTC field tiles).
// World: metres, +Y up. Room spans x ∈ [-W/2, W/2], z ∈ [-D/2, D/2], floor y = 0.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Builder, box, cyl, mat, PALETTE } from './models/kit.js';

export const ROOM = { W: 6.4, D: 5.6, H: 3.0 };
const X0 = -ROOM.W / 2, X1 = ROOM.W / 2, Z0 = -ROOM.D / 2, Z1 = ROOM.D / 2;

// ---------------------------------------------------------------- canvas textures
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// value noise, blurred by canvas scaling — cheap, organic
function noise(g, w, h, cells, alpha, light = true) {
  const [n, ng] = canvas(cells, cells);
  const img = ng.createImageData(cells, cells);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  ng.putImageData(img, 0, 0);
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = light ? 'overlay' : 'multiply';
  g.imageSmoothingEnabled = true; g.drawImage(n, 0, 0, w, h); g.restore();
}

function concreteTextures() {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#26282c'; g.fillRect(0, 0, 1024, 1024);
  noise(g, 1024, 1024, 16, 0.5); noise(g, 1024, 1024, 64, 0.35); noise(g, 1024, 1024, 256, 0.25); noise(g, 1024, 1024, 1024, 0.18);
  // saw-cut control joints every 1.2 m (texture covers 2.4 m)
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
  for (const p of [0, 512]) { g.beginPath(); g.moveTo(p + 1, 0); g.lineTo(p + 1, 1024); g.stroke(); g.beginPath(); g.moveTo(0, p + 1); g.lineTo(1024, p + 1); g.stroke(); }
  const [r, rg] = canvas(512, 512);
  rg.fillStyle = '#9a9a9a'; rg.fillRect(0, 0, 512, 512); noise(rg, 512, 512, 32, 0.6); noise(rg, 512, 512, 256, 0.4);
  const map = tex(c, { repeat: [ROOM.W / 2.4, ROOM.D / 2.4] });
  const rough = tex(r, { repeat: [ROOM.W / 2.4, ROOM.D / 2.4], srgb: false });
  return { map, rough };
}

function wallTexture(base) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  noise(g, 512, 512, 64, 0.08); noise(g, 512, 512, 512, 0.06);
  return tex(c, { repeat: [3, 2] });
}

function corkTexture() {
  const [c, g] = canvas(1024, 640);
  g.fillStyle = '#8a6440'; g.fillRect(0, 0, 1024, 640);
  noise(g, 1024, 640, 128, 0.55); noise(g, 1024, 640, 512, 0.5, false);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${40 + Math.random() * 40},${25 + Math.random() * 20},10,${Math.random() * 0.35})`; g.fillRect(Math.random() * 1024, Math.random() * 640, 2 + Math.random() * 3, 2 + Math.random() * 3); }
  return tex(c);
}

// foam FTC field tiles: grey, lightly textured, with gaffer-tape lines
function tileTexture() {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#5f6268'; g.fillRect(0, 0, 1024, 1024);
  noise(g, 1024, 1024, 256, 0.25); noise(g, 1024, 1024, 1024, 0.2);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(512, 0); g.lineTo(512, 1024); g.moveTo(0, 512); g.lineTo(1024, 512); g.stroke();
  // interlocking teeth along the seams
  g.fillStyle = 'rgba(0,0,0,.25)';
  for (let i = 0; i < 1024; i += 64) { g.fillRect(508, i + 16, 8, 32); g.fillRect(i + 16, 508, 32, 8); }
  g.fillStyle = '#c8322a'; g.fillRect(60, 60, 380, 22); g.fillRect(60, 60, 22, 380);   // red alliance tape
  g.fillStyle = '#2f5fd0'; g.fillRect(584, 942, 380, 22); g.fillRect(942, 584, 22, 380); // blue alliance tape
  return tex(c);
}

// ---------------------------------------------------------------- content surfaces
function signTexture() {
  const [c, g] = canvas(2048, 400);
  g.clearRect(0, 0, 2048, 400);
  g.font = '300 150px Archivo, Arial, sans-serif';
  if ('fontStretch' in g) g.fontStretch = 'ultra-expanded';
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.shadowColor = 'rgba(255,236,214,.9)'; g.shadowBlur = 18;
  g.fillStyle = '#fff3e4';
  g.fillText('NIRAV SURABHI', 200, 170);
  // the vortex-street mark: a cylinder and one vortex of each sign
  g.shadowBlur = 16;
  g.lineWidth = 12; g.strokeStyle = '#fff3e4'; g.beginPath(); g.arc(70, 170, 36, 0, Math.PI * 2); g.stroke();
  g.shadowColor = '#ff5b1f'; g.fillStyle = '#ff5b1f'; g.beginPath(); g.arc(142, 126, 20, 0, Math.PI * 2); g.fill();
  g.shadowColor = '#4fb4ff'; g.fillStyle = '#4fb4ff'; g.beginPath(); g.arc(142, 214, 20, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
  g.font = '500 44px "JetBrains Mono", ui-monospace, monospace';
  g.fillStyle = 'rgba(255,243,228,.62)';
  g.fillText('MECHANICAL ENGINEERING  ·  PURDUE ’29', 206, 318);
  return tex(c);
}

// wall lettering on the first wall visitors see: what this place is and how to use it
function welcomeTexture(touch) {
  const W = 1600, H = 900, [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  // kicker
  g.fillStyle = '#ff5b1f'; g.beginPath(); g.arc(16, 44, 13, 0, Math.PI * 2); g.fill();
  g.font = '500 50px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(236,235,230,.72)';
  g.fillText('WELCOME TO MY LAB', 52, 62);
  // the instruction, as large as fits in three lines
  const text = 'Look around 360° and ' + (touch ? 'tap' : 'click') + ' on things to learn more about me.';
  if ('fontStretch' in g) g.fontStretch = 'semi-expanded';
  let size = 150, lines;
  for (; size > 70; size -= 4) {
    g.font = `300 ${size}px Archivo, Arial, sans-serif`;
    lines = []; let line = '';
    for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > W - 8 && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    if (lines.length <= 3) break;
  }
  g.fillStyle = '#ecebe6';
  lines.forEach((l, i) => g.fillText(l, 0, 110 + size + i * size * 1.06));
  // how, in one line
  const y = 110 + size + (lines.length - 1) * size * 1.06 + 120;
  g.font = '500 42px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(236,235,230,.66)';
  g.fillText((touch ? 'SWIPE TO TURN' : 'DRAG TO TURN') + '  ·  ' + (touch ? 'TAP A LABEL' : 'CLICK A LABEL') + '  ·  OR USE THE MENU', 0, y);
  return tex(c);
}

function whiteboardTexture(photo) {
  const [c, g] = canvas(1600, 1000);
  g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, 1600, 1000);
  const grd = g.createLinearGradient(0, 0, 1600, 1000); grd.addColorStop(0, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(0,0,0,.06)');
  g.fillStyle = grd; g.fillRect(0, 0, 1600, 1000);
  noise(g, 1600, 1000, 400, 0.04);
  // ghosting of old, half-erased marker
  g.globalAlpha = 0.07; g.strokeStyle = '#223'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(980, 700); g.bezierCurveTo(1100, 600, 1250, 820, 1450, 690); g.stroke(); g.globalAlpha = 1;
  const marker = (txt, x, y, size, color, weight = 500) => { g.font = `${weight} ${size}px Archivo, Arial, sans-serif`; g.fillStyle = color; g.fillText(txt, x, y); };
  g.textBaseline = 'alphabetic';
  if (photo) {                         // taped-up photo
    g.save(); g.translate(1200, 110); g.rotate(0.04);
    g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 14; g.fillRect(-10, -10, 300, 330); g.shadowBlur = 0;
    g.drawImage(photo, 0, 0, 280, 280);
    g.fillStyle = 'rgba(230,220,180,.8)'; g.fillRect(100, -26, 90, 34);
    g.restore();
  }
  marker('about me', 90, 150, 92, '#1b1d22', 600);
  g.strokeStyle = '#ff5b1f'; g.lineWidth = 8; g.beginPath(); g.moveTo(90, 178); g.quadraticCurveTo(300, 168, 470, 184); g.stroke();
  const lines = [
    ['I3 Simulations', 'CAD intern · haptics for medical sims', '#ff5b1f'],
    ['The Bike Lane', 'mechanic · 4 years, frame-up builds', '#ff5b1f'],
    ['Ember Learning', 'AI engineer · LLM tutors, $1M+ valuation', '#2f8fe0'],
    ['Purdue', 'B.S. Mechanical Engineering · 2029', '#1b1d22'],
  ];
  lines.forEach((l, i) => {
    const y = 300 + i * 118;
    g.fillStyle = l[2]; g.beginPath(); g.arc(104, y - 20, 12, 0, Math.PI * 2); g.fill();
    marker(l[0], 140, y, 56, '#1b1d22', 600);
    marker(l[1], 140, y + 46, 34, '#555a63', 500);
  });
  marker('niravsurabhi@gmail.com', 90, 900, 50, '#2f8fe0', 600);
  marker('→ say hi', 1250, 900, 50, '#ff5b1f', 600);
  return tex(c);
}

// ---------------------------------------------------------------- the room
export function buildShell(scene, renderer, { tier = 'high', photo, touch = false } = {}) {
  RectAreaLightUniformsLib.init();
  const out = { anchors: {}, hit: {}, update: [] };
  const hi = tier === 'high';

  // ---------- floor, walls, ceiling
  const conc = concreteTextures();
  const floorMat = new THREE.MeshStandardMaterial({ map: conc.map, roughnessMap: conc.rough, roughness: 0.62, metalness: 0.0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.W, ROOM.D), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture('#2a2c31'), roughness: 0.92 });
  const accentWall = new THREE.MeshStandardMaterial({ map: wallTexture('#1d1f24'), roughness: 0.95 });
  const walls = [
    [ROOM.W, [0, ROOM.H / 2, Z0], [0, 0, 0], accentWall],             // back
    [ROOM.W, [0, ROOM.H / 2, Z1], [0, Math.PI, 0], wallMat],          // front
    [ROOM.D, [X0, ROOM.H / 2, 0], [0, Math.PI / 2, 0], wallMat],      // left
    [ROOM.D, [X1, ROOM.H / 2, 0], [0, -Math.PI / 2, 0], wallMat],     // right
  ];
  for (const [w, p, r, m] of walls) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.H), m);
    mesh.position.set(...p); mesh.rotation.set(...r); mesh.receiveShadow = true; scene.add(mesh);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.W, ROOM.D), new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM.H; scene.add(ceil);

  // baseboards + ceiling track (the lights hang off it)
  const trim = new Builder('trim');
  trim.add(box(ROOM.W, 0.09, 0.018, 0.003), 'plasticBlack', { position: [0, 0.045, Z0 + 0.009] });
  trim.add(box(ROOM.W, 0.09, 0.018, 0.003), 'plasticBlack', { position: [0, 0.045, Z1 - 0.009] });
  trim.add(box(0.018, 0.09, ROOM.D, 0.003), 'plasticBlack', { position: [X0 + 0.009, 0.045, 0] });
  trim.add(box(0.018, 0.09, ROOM.D, 0.003), 'plasticBlack', { position: [X1 - 0.009, 0.045, 0] });
  trim.add(box(0.035, 0.03, ROOM.D - 0.8, 0.004), 'blackMetal', { position: [-1.5, ROOM.H - 0.015, 0] });
  trim.add(box(0.035, 0.03, ROOM.D - 0.8, 0.004), 'blackMetal', { position: [1.5, ROOM.H - 0.015, 0] });
  trim.add(box(2.965, 0.03, 0.035, 0.004), 'blackMetal', { position: [0, ROOM.H - 0.015, 0] });
  scene.add(trim.build());

  // ---------- lighting: dim ambience, warm track spots on each station, coloured practicals
  scene.add(new THREE.HemisphereLight(0x3a4050, 0x0c0b0a, 0.35));
  const fixtures = new Builder('fixtures');
  function spot({ at, to, intensity, angle = 0.5, pen = 0.75, shadow = false, color = 0xffd8b0 }) {
    const l = new THREE.SpotLight(color, intensity, 0, angle, pen, 2);
    l.position.set(...at); l.target.position.set(...to);
    if (shadow && hi) {
      l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0005; l.shadow.normalBias = 0.03; l.shadow.radius = 4;
      l.shadow.camera.near = 0.3; l.shadow.camera.far = 6;
    }
    scene.add(l, l.target);
    // the fixture: a small black can pointed at its target
    const dir = new THREE.Vector3(...to).sub(new THREE.Vector3(...at)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(q);
    fixtures.add(cyl(0.045, 0.05, 0.14, 20), 'blackMetal', { position: [at[0], at[1] + 0.02, at[2]], rotation: [e.x, e.y, e.z] });
    fixtures.add(cyl(0.036, 0.036, 0.004, 20), 'ledWarm', { position: [at[0] + dir.x * 0.07, at[1] + 0.02 + dir.y * 0.07, at[2] + dir.z * 0.07], rotation: [e.x, e.y, e.z] });
    fixtures.add(cyl(0.006, 0.006, 0.07, 6), 'blackMetal', { position: [at[0], at[1] + 0.07 + 0.035 - 0.02, at[2]] });
    return l;
  }
  const T = ROOM.H - 0.16;
  out.spots = {
    research: spot({ at: [-1.5, T, -0.6], to: [-2.85, 0.9, -0.6], intensity: 26, angle: 0.62, shadow: true }),
    robot:    spot({ at: [-1.5, T, -1.5], to: [-1.55, 0.0, -1.95], intensity: 22, angle: 0.5, shadow: true }),
    board:    spot({ at: [0.55, T, -1.5], to: [0.55, 1.45, Z0], intensity: 16, angle: 0.55 }),
    desk:     spot({ at: [1.5, T, 0.0], to: [2.85, 0.74, 0.0], intensity: 16, angle: 0.6, shadow: true }),
    guitar:   spot({ at: [1.5, T, 1.8], to: [2.45, 0.5, 2.15], intensity: 10, angle: 0.45 }),
    about:    spot({ at: [-0.8, T, 1.4], to: [-0.8, 1.45, Z1], intensity: 12, angle: 0.62 }),
    center:   hi ? spot({ at: [0, T, 0.2], to: [0, 0, 0.4], intensity: 5, angle: 0.9, pen: 1 }) : null,
  };
  scene.add(fixtures.build());

  // ---------- window (front wall, right of centre): night sky + campus glow for depth and cool fill
  {
    const wx = 1.25, wy = 1.62, ww = 1.3, wh = 1.25;
    const [c, g] = canvas(512, 512);
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#05070d'); sky.addColorStop(0.62, '#0e1628'); sky.addColorStop(0.8, '#1d2438'); sky.addColorStop(1, '#0a0b10');
    g.fillStyle = sky; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * 512, Math.random() * 300, 1.2, 1.2); }
    // distant building silhouettes with a few lit windows
    g.fillStyle = '#07080c';
    for (let x = 0; x < 512; x += 30 + Math.random() * 40) { const h = 40 + Math.random() * 90; g.fillRect(x, 512 - h - 40, 26 + Math.random() * 40, h + 40); }
    for (let i = 0; i < 70; i++) { g.fillStyle = Math.random() < 0.7 ? 'rgba(255,200,130,.75)' : 'rgba(170,210,255,.6)'; g.fillRect(Math.random() * 512, 400 + Math.random() * 100, 3, 4); }
    const view = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: tex(c), toneMapped: false, color: 0x9aa6c0 }));
    view.position.set(wx, wy, Z1 - 0.005); view.rotation.y = Math.PI; scene.add(view);
    const wf = new Builder('window');
    const fz = Z1 - 0.03;
    wf.add(box(ww + 0.08, 0.06, 0.06, 0.004), 'blackMetal', { position: [wx, wy + wh / 2, fz] });
    wf.add(box(ww + 0.08, 0.06, 0.06, 0.004), 'blackMetal', { position: [wx, wy - wh / 2, fz] });
    wf.add(box(0.06, wh, 0.06, 0.004), 'blackMetal', { position: [wx - ww / 2, wy, fz] });
    wf.add(box(0.06, wh, 0.06, 0.004), 'blackMetal', { position: [wx + ww / 2, wy, fz] });
    wf.add(box(0.03, wh, 0.03, 0.003), 'blackMetal', { position: [wx, wy, fz] });
    wf.add(box(ww, 0.03, 0.03, 0.003), 'blackMetal', { position: [wx, wy, fz] });
    wf.add(box(ww + 0.2, 0.03, 0.16, 0.005), 'blackMetal', { position: [wx, wy - wh / 2 - 0.05, Z1 - 0.08] });
    scene.add(wf.build());
    if (hi) { const moon = new THREE.RectAreaLight(0x6f86b8, 1.4, ww, wh); moon.position.set(wx, wy, Z1 - 0.02); moon.lookAt(wx, wy - 0.4, 0); scene.add(moon); }
  }

  // ---------- welcome note: vinyl lettering under the name sign (first thing in view)
  {
    const w = 1.28, h = w * 900 / 1600;
    const note = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: welcomeTexture(touch), transparent: true, toneMapped: false, color: 0xd2d0ca, depthWrite: false }));
    note.position.set(-1.5 + w / 2, 1.47, Z0 + 0.006); note.renderOrder = 1; scene.add(note);
  }

  // ---------- backlit name sign, back wall, high
  {
    const t = signTexture();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.508), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, color: 0xffffff }));
    sign.position.set(-0.45, 2.38, Z0 + 0.012); scene.add(sign);
    if (hi) { const glow = new THREE.RectAreaLight(0xffe2c4, 3.2, 2.2, 0.25); glow.position.set(-0.45, 2.38, Z0 + 0.05); glow.lookAt(-0.45, 2.0, 0); scene.add(glow); }
  }

  // ---------- live-flow display above the research bench (left wall)
  {
    const w = 1.36, h = w * 8 / 21, cx = X0 + 0.035, cy = 1.78, cz = -0.62;
    const f = new Builder('flowDisplay');
    f.add(box(0.03, h + 0.04, w + 0.04, 0.006), 'plasticBlack', { position: [cx, cy, cz] });
    f.add(box(0.02, 0.12, 0.2, 0.004), 'blackMetal', { position: [X0 + 0.01, cy, cz] });
    scene.add(f.build());
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
    screen.position.set(cx + 0.016, cy, cz); screen.rotation.y = Math.PI / 2; scene.add(screen);
    out.flowScreen = screen;
    // caption plate under the display
    const [c, g] = canvas(1400, 90);
    g.font = '500 30px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(236,235,230,.72)'; g.textBaseline = 'middle';
    g.fillStyle = '#3ddc84'; g.beginPath(); g.arc(18, 45, 9, 0, 7); g.fill();
    g.fillStyle = 'rgba(236,235,230,.72)';
    g.fillText('LIVE  ·  2D LATTICE-BOLTZMANN  ·  FIN FREE TO PIVOT ON ITS BEARING', 44, 46);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.07), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, toneMapped: false }));
    cap.position.set(X0 + 0.02, cy - h / 2 - 0.08, cz + 0.12); cap.rotation.y = Math.PI / 2; scene.add(cap);
    const glow = new THREE.RectAreaLight(0x9fb8d8, 2.2, w, h);
    glow.position.set(X0 + 0.06, cy, cz); glow.lookAt(0, cy - 0.3, cz); scene.add(glow);
    out.flowGlow = glow;
    out.anchors.research = new THREE.Vector3(X0 + 0.4, 1.2, -0.6);
  }

  // ---------- pegboard wall panel behind the bench, with a few tools
  {
    const [c, g] = canvas(1024, 512);
    g.fillStyle = '#d9d4ca'; g.fillRect(0, 0, 1024, 512);
    noise(g, 1024, 512, 256, 0.12);
    g.fillStyle = 'rgba(30,26,20,.8)';
    for (let x = 16; x < 1024; x += 26) for (let y = 16; y < 512; y += 26) { g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill(); }
    const pb = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.85 }));
    pb.position.set(X0 + 0.012, 1.42, -0.6); pb.rotation.y = Math.PI / 2; pb.receiveShadow = true; scene.add(pb);
    const tools = new Builder('tools');
    const tx = X0 + 0.03;
    // wrench set, calipers, a spool of solder
    for (let i = 0; i < 6; i++) tools.add(box(0.012, 0.16 + i * 0.018, 0.022, 0.004), 'steel', { position: [tx, 1.28 + i * 0.009, 0.1 - i * 0.045] });
    tools.add(box(0.012, 0.03, 0.26, 0.004), 'steel', { position: [tx, 1.72, -1.28] });
    tools.add(box(0.012, 0.09, 0.02, 0.003), 'steel', { position: [tx, 1.66, -1.36] });
    tools.add(box(0.014, 0.05, 0.07, 0.005), 'plasticBlack', { position: [tx + 0.002, 1.72, -1.2] });
    tools.add(cyl(0.05, 0.05, 0.03, 24), 'plasticGrey', { position: [tx + 0.02, 1.3, -1.35], rotation: [0, 0, Math.PI / 2] });
    tools.add(cyl(0.032, 0.032, 0.032, 24), 'brass', { position: [tx + 0.02, 1.3, -1.35], rotation: [0, 0, Math.PI / 2] });
    // orange LED strip under the display: the mechanical side of the room
    tools.add(box(0.012, 0.012, 1.6, 0.003), 'ledOrange', { position: [X0 + 0.02, 1.02, -0.6] });
    scene.add(tools.build());
    if (hi) { const strip = new THREE.RectAreaLight(PALETTE.me, 2.4, 1.6, 0.05); strip.position.set(X0 + 0.04, 1.02, -0.6); strip.lookAt(0, 0.4, -0.6); scene.add(strip); }
  }

  // ---------- FTC field tiles for the robot (back-left)
  {
    const t = tileTexture();
    const tiles = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.016, 1.22), [
      mat('plasticGrey'), mat('plasticGrey'), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }), mat('plasticGrey'), mat('plasticGrey'), mat('plasticGrey'),
    ]);
    tiles.position.set(-1.55, 0.008, -1.95); tiles.receiveShadow = true; scene.add(tiles);
    out.anchors.robotics = new THREE.Vector3(-1.55, 0.55, -1.95);
  }

  // ---------- pinboard: "more projects" (back wall, right of centre)
  {
    const bw = 1.5, bh = 0.95, bx = 0.62, by = 1.42, bz = Z0 + 0.03;
    const frame = new Builder('pinboardFrame');
    frame.add(box(bw + 0.05, bh + 0.05, 0.03, 0.006), 'woodDark', { position: [bx, by, bz - 0.005] });
    scene.add(frame.build());
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshStandardMaterial({ map: corkTexture(), roughness: 1 }));
    cork.position.set(bx, by, bz + 0.012); cork.receiveShadow = true; scene.add(cork);
    const board = new THREE.Group(); board.name = 'pinboard'; scene.add(board);
    board.add(cork);
    out.pinboard = { group: board, center: new THREE.Vector3(bx, by, bz + 0.02), w: bw, h: bh };
    out.anchors.more = new THREE.Vector3(bx, by + 0.1, bz + 0.2);
  }

  // ---------- whiteboard: "about me" (front wall, left)
  {
    const ww = 1.6, wh = 1.0, wx = -0.9, wy = 1.5, wz = Z1 - 0.03;
    const f = new Builder('whiteboardFrame');
    f.add(box(ww + 0.04, wh + 0.04, 0.025, 0.006), 'aluminum', { position: [wx, wy, wz + 0.005] });
    f.add(box(ww * 0.8, 0.02, 0.07, 0.005), 'aluminum', { position: [wx, wy - wh / 2 - 0.03, wz - 0.03] });
    f.add(box(0.12, 0.018, 0.018, 0.006), 'accentBlue', { position: [wx - 0.4, wy - wh / 2 - 0.012, wz - 0.03], rotation: [0, 0.2, 0] });
    f.add(box(0.12, 0.018, 0.018, 0.006), 'accentOrange', { position: [wx - 0.22, wy - wh / 2 - 0.012, wz - 0.035], rotation: [0, -0.1, 0] });
    scene.add(f.build());
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshStandardMaterial({ map: whiteboardTexture(photo), roughness: 0.35, metalness: 0 }));
    wb.position.set(wx, wy, wz - 0.009); wb.rotation.y = Math.PI; wb.name = 'whiteboard'; scene.add(wb);
    out.whiteboard = wb;
    out.anchors.about = new THREE.Vector3(wx, wy + 0.2, wz - 0.2);
  }

  // ---------- rug under the reading chair area (centre)
  {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#1f2126'; g.fillRect(0, 0, 512, 512); noise(g, 512, 512, 512, 0.35); noise(g, 512, 512, 128, 0.2);
    g.strokeStyle = 'rgba(255,91,31,.55)'; g.lineWidth = 4; g.strokeRect(22, 22, 468, 468);
    g.strokeStyle = 'rgba(79,180,255,.45)'; g.strokeRect(34, 34, 444, 444);
    const rug = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.01, 1.6), [mat('fabric'), mat('fabric'), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 1 }), mat('fabric'), mat('fabric'), mat('fabric')]);
    rug.position.set(0.2, 0.005, 0.5); rug.receiveShadow = true; scene.add(rug);
  }

  return out;
}

export async function pinCards(board, items) {
  // Polaroid-style cards pinned to the cork, each a canvas composed from a project image + caption
  const { center, w, h } = board;
  const loads = items.map(it => it.src ? new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = it.src; }) : Promise.resolve(null));
  const imgs = await Promise.all(loads);
  items.forEach((it, i) => {
    const im = imgs[i];
    const cw = 420, chh = it.note ? 420 : 380;
    const [c, g] = canvas(cw, chh);
    if (it.note) {
      g.fillStyle = '#f7d154'; g.fillRect(0, 0, cw, chh);
      g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(0, 0, cw, 36);
      g.fillStyle = '#1b1d22'; g.textBaseline = 'top';
      g.font = '700 30px "JetBrains Mono", ui-monospace, monospace'; g.fillText('MORE PROJECTS', 34, 58);
      g.font = '600 54px Archivo, Arial, sans-serif';
      wrap(g, it.note, 34, 118, cw - 68, 60);
      g.fillStyle = '#c8321a'; g.font = '700 40px Archivo, Arial, sans-serif'; g.fillText('→', cw - 80, chh - 80);
    } else {
      g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, cw, chh);
      if (im) {
        const iw = cw - 36, ih = 280;
        const s = Math.max(iw / im.width, ih / im.height), dw = im.width * s, dh = im.height * s;
        g.save(); g.beginPath(); g.rect(18, 18, iw, ih); g.clip();
        g.fillStyle = it.dark ? '#111' : '#ddd'; g.fillRect(18, 18, iw, ih);
        g.drawImage(im, 18 + (iw - dw) / 2, 18 + (ih - dh) / (it.top ? 1e9 : 2), dw, dh); g.restore();
      }
      g.fillStyle = '#1b1d22'; g.font = '600 34px Archivo, Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(it.title, 22, 336);
    }
    const t = tex(c);
    const sc = it.note ? 0.36 : 0.3;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(sc, sc * chh / cw), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    card.position.set(center.x + it.x * w / 2, center.y + it.y * h / 2, center.z + 0.004 + i * 0.0015);
    card.rotation.z = it.r || 0; card.castShadow = true; card.receiveShadow = true;
    board.group.add(card);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), mat(it.note ? 'accentBlue' : 'accentOrange'));
    pin.position.set(card.position.x + Math.sin(-card.rotation.z) * 0.1, card.position.y + (sc * chh / cw) / 2 - 0.02, card.position.z + 0.01);
    pin.castShadow = true; board.group.add(pin);
  });
}

function wrap(g, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '';
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = wd; } else line = test;
  }
  if (line) g.fillText(line, x, y);
}
