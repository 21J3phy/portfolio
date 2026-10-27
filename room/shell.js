// The room itself: architecture, daylight and lighting, and the wall-mounted pieces that carry
// content (name sign, live-flow display, pinboard, the LEGO wall, FTC field tiles, the door, the window).
// World: metres, +Y up. Room spans x ∈ [-W/2, W/2], z ∈ [-D/2, D/2], floor y = 0.
// Visitors start a little in front of the middle, facing the back wall (-Z), and the stations run clockwise
// from there, robotics and machine learning first: back wall 01–03, right wall 04–05, front wall 06–10, and
// the door (11) on the left wall.
import * as THREE from 'three';
import { Builder, box, cyl, lathe, mat, PALETTE } from './models/kit.js';
import createBellTower, { HEIGHT as TOWER_H } from './models/belltower.js';

export const ROOM = { W: 6.0, D: 5.6, H: 2.8 };
const X0 = -ROOM.W / 2, X1 = ROOM.W / 2, Z0 = -ROOM.D / 2, Z1 = ROOM.D / 2;
// The walls from inside. n points into the room, t runs to your right as you face the wall, and ry turns
// anything built facing +Z (every model, every plane) to face into the room. A spot on a wall is u metres
// along t from its centre, y up, d out into the room.
export const WALLS = {
  back:  { c: [0, Z0], n: [0, 1],  t: [1, 0],  ry: 0,            len: ROOM.W },
  right: { c: [X1, 0], n: [-1, 0], t: [0, 1],  ry: -Math.PI / 2, len: ROOM.D },
  front: { c: [0, Z1], n: [0, -1], t: [-1, 0], ry: Math.PI,      len: ROOM.W },
  left:  { c: [X0, 0], n: [1, 0],  t: [0, -1], ry: Math.PI / 2,  len: ROOM.D },
};
export function onWall(wall, u, y = 0, d = 0, v = new THREE.Vector3()) {
  const w = WALLS[wall]; return v.set(w.c[0] + w.t[0] * u + w.n[0] * d, y, w.c[1] + w.t[1] * u + w.n[1] * d);
}
/** Stand `obj` against a wall (u along it, d out from it), facing into the room. */
export function place(obj, wall, u, y = 0, d = 0, turn = 0) { onWall(wall, u, y, d, obj.position); obj.rotation.y = WALLS[wall].ry + turn; return obj; }
// The openings. The door's size comes from the door model when it loads; the LEGO engine sits on the window's ledge.
export const DOORWAY = { wall: 'left', u: -1.55 };
export const WINDOW = { wall: 'right', u: -0.9, y0: 0.95, w: 1.4, h: 1.55, ledge: 0.44 };

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

// White oak boards, 19 cm wide, random lengths, running front to back. The texture covers 4 m.
function oakTextures(S = 2048) {
  const B = 2048, M = 4, px = B / M, cols = 21, pw = B / cols, k = S / B;   // drawn in a 2048 px design space, scaled to S
  const [c, g] = canvas(S, S), [r, rg] = canvas(S / 2, S / 2);
  g.setTransform(k, 0, 0, k, 0, 0); rg.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = '#b68c60'; g.fillRect(0, 0, B, B);
  rg.fillStyle = '#7a7a7a'; rg.fillRect(0, 0, B / 2, B / 2);
  const plank = (x, y, len) => {
    const l = 53 + Math.random() * 9, h = 30 + Math.random() * 5, s = 22 + Math.random() * 12;
    g.fillStyle = `hsl(${h},${s}%,${l}%)`; g.fillRect(x, y, pw, len);
    // grain: long faint streaks, a few cathedral arcs
    for (let k = 0; k < 34; k++) {
      const gx = x + Math.random() * pw, dark = Math.random() < 0.65;
      g.strokeStyle = dark ? `rgba(92,58,28,${0.05 + Math.random() * 0.11})` : `rgba(240,214,170,${0.04 + Math.random() * 0.08})`;
      g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath(); g.moveTo(gx, y);
      g.bezierCurveTo(gx + (Math.random() - 0.5) * 9, y + len * 0.33, gx + (Math.random() - 0.5) * 9, y + len * 0.66, gx + (Math.random() - 0.5) * 6, y + len); g.stroke();
    }
    if (Math.random() < 0.5) {
      const cx = x + pw * (0.3 + Math.random() * 0.4), cy = y + len * Math.random();
      for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(96,60,30,${0.08 + k * 0.012})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(cx, cy, 4 + k * 5, 30 + k * 26, 0, 0, Math.PI * 2); g.stroke(); }
    }
    if (Math.random() < 0.12) { g.fillStyle = 'rgba(70,42,20,.55)'; g.beginPath(); g.ellipse(x + pw * Math.random(), y + len * Math.random(), 3 + Math.random() * 4, 6 + Math.random() * 6, 0, 0, Math.PI * 2); g.fill(); }
    // satin finish: each board a slightly different sheen; seams rough and dark
    const v = 92 + Math.random() * 40;
    rg.fillStyle = `rgb(${v},${v},${v})`; rg.fillRect(x / 2, y / 2, pw / 2, len / 2);
    g.fillStyle = 'rgba(52,32,16,.62)'; g.fillRect(x, y, 2, len); g.fillRect(x, y, pw, 2);
    rg.fillStyle = '#e0e0e0'; rg.fillRect(x / 2, y / 2, 1.5, len / 2); rg.fillRect(x / 2, y / 2, pw / 2, 1.5);
  };
  for (let i = 0; i < cols; i++) {
    let y = -Math.random() * 1.6 * px;
    while (y < B) {
      const len = (0.9 + Math.random() * 1.3) * px;
      plank(i * pw, y, len);
      if (y + len > B) plank(i * pw, y - B, len);   // wrap so the texture tiles front to back
      if (y < 0) plank(i * pw, y + B, len);
      y += len;
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  noise(g, S, S, 512 * k, 0.08); noise(g, S, S, 64, 0.06);
  const rep = [ROOM.W / M, ROOM.D / M];
  return { map: tex(c, { repeat: rep }), rough: tex(r, { repeat: rep, srgb: false }) };
}

// Painted drywall: warm white, a faint roller texture, and soft occlusion where it meets the floor,
// the ceiling and the corners.
function wallTexture(w, h) {
  const W = 1024, H = Math.round(1024 * h / w), [c, g] = canvas(W, H);
  g.fillStyle = '#eeebe5'; g.fillRect(0, 0, W, H);
  noise(g, W, H, 96, 0.05); noise(g, W, H, 512, 0.035);
  const ao = (x0, y0, x1, y1, a) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(70,58,46,${a})`); gr.addColorStop(1, 'rgba(70,58,46,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  const k = W / w;
  ao(0, H, 0, H - 0.35 * k, 0.16);       // floor
  ao(0, 0, 0, 0.4 * k, 0.12);            // ceiling
  ao(0, 0, 0.45 * k, 0, 0.12);           // left corner
  ao(W, 0, W - 0.45 * k, 0, 0.12);       // right corner
  return tex(c);
}

function ceilingTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#f1efea'; g.fillRect(0, 0, 512, 512);
  noise(g, 512, 512, 128, 0.04);
  const gr = g.createRadialGradient(256, 256, 60, 256, 256, 360); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,50,40,.16)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  return tex(c);
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
  g.fillStyle = '#6a6d73'; g.fillRect(0, 0, 1024, 1024);
  noise(g, 1024, 1024, 256, 0.25); noise(g, 1024, 1024, 1024, 0.2);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(512, 0); g.lineTo(512, 1024); g.moveTo(0, 512); g.lineTo(1024, 512); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.25)';
  for (let i = 0; i < 1024; i += 64) { g.fillRect(508, i + 16, 8, 32); g.fillRect(i + 16, 508, 32, 8); }
  g.fillStyle = '#c8322a'; g.fillRect(60, 60, 380, 22); g.fillRect(60, 60, 22, 380);   // red alliance tape
  g.fillStyle = '#2f5fd0'; g.fillRect(584, 942, 380, 22); g.fillRect(942, 584, 22, 380); // blue alliance tape
  return tex(c);
}

// ---------------------------------------------------------------- content surfaces
// Wall lettering: matte charcoal vinyl with a hint of shadow, so it reads under the spotlight.
function signTexture() {
  const [c, g] = canvas(2048, 400);
  g.clearRect(0, 0, 2048, 400);
  g.font = '300 150px Archivo, Arial, sans-serif';
  if ('fontStretch' in g) g.fontStretch = 'ultra-expanded';
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.shadowColor = 'rgba(40,30,20,.28)'; g.shadowBlur = 10; g.shadowOffsetY = 6;
  g.fillStyle = '#202227';
  g.fillText('NIRAV SURABHI', 200, 170);
  // the vortex-street mark: a cylinder and one vortex of each sign
  g.lineWidth = 12; g.strokeStyle = '#202227'; g.beginPath(); g.arc(70, 170, 36, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ff5b1f'; g.beginPath(); g.arc(142, 126, 20, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2f8fe0'; g.beginPath(); g.arc(142, 214, 20, 0, Math.PI * 2); g.fill();
  g.shadowColor = 'transparent';
  g.font = '500 44px "JetBrains Mono", ui-monospace, monospace';
  g.fillStyle = 'rgba(32,34,39,.62)';
  g.fillText('ROBOTICS & MACHINE LEARNING  ·  PURDUE ’30', 206, 318);
  return tex(c);
}

// wall lettering on the first wall visitors see: what this place is and how to use it
function welcomeTexture(touch) {
  const W = 1600, H = 900, [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.fillStyle = '#ff5b1f'; g.beginPath(); g.arc(16, 44, 13, 0, Math.PI * 2); g.fill();
  g.font = '500 50px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(32,34,39,.66)';
  g.fillText('WELCOME TO MY LAB', 52, 62);
  const text = 'Start at 01 on the left and follow the numbers around the room.';
  if ('fontStretch' in g) g.fontStretch = 'semi-expanded';
  let size = 150, lines;
  for (; size > 70; size -= 4) {
    g.font = `300 ${size}px Archivo, Arial, sans-serif`;
    lines = []; let line = '';
    for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > W - 8 && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    if (lines.length <= 3) break;
  }
  g.fillStyle = '#23252a';
  lines.forEach((l, i) => g.fillText(l, 0, 110 + size + i * size * 1.06));
  const y = 110 + size + (lines.length - 1) * size * 1.06 + 120;
  g.font = '500 42px "JetBrains Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(32,34,39,.6)';
  g.fillText((touch ? 'SWIPE TO TURN' : 'DRAG TO TURN') + '  ·  ' + (touch ? 'TAP A NUMBER' : 'CLICK A NUMBER') + '  ·  OR START THE TOUR', 0, y);
  return tex(c);
}

// ---------------------------------------------------------------- the LEGO wall ("about me")
// Blue baseplates, 192 × 192 studs (1.54 m square), with 1×1 plates on top as the pixels: the title, the four
// lines of experience with a pixel logo each, a LEGO-art mosaic of the photo, and the way to the door.
// One textured panel: a colour map and a stud normal map drawn once, instead of 36,864 modelled bricks.
const STUD = 0.008;   // LEGO's stud pitch, metres
const LEGO = {
  blue: '#0055bf', white: '#f4f4f4', black: '#1b2a34', yellow: '#f2cd37', orange: '#f57d20', red: '#c91a09', azure: '#36aebf',
  lightBlue: '#9fc3e9', gold: '#d8bd84', lbg: '#a0a5a9', dbg: '#6c6e68',
};
// 5×7 and 3×5 pixel fonts (rows top to bottom; '#' is a plate)
const FONT5 = (() => {
  const src = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
    D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
    J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
    3: '####.|....#|....#|.###.|....#|....#|####.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
    9: '.###.|#...#|#...#|.####|....#|...#.|.##..', '.': '.....|.....|.....|.....|.....|.##..|.##..', "'": '..#..|..#..|.#...|.....|.....|.....|.....',
    '-': '.....|.....|.....|.###.|.....|.....|.....', '·': '.....|.....|.....|..#..|.....|.....|.....', '→': '.....|..#..|...#.|#####|...#.|..#..|.....',
    '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..', ' ': '.....|.....|.....|.....|.....|.....|.....',
  };
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v.split('|')]));
})();
// the small one is 5 rows tall and variable-width (M and W get five columns so they don't read as H)
const FONT4 = (() => {
  const src = {
    A: '.##.|#..#|####|#..#|#..#', B: '###.|#..#|###.|#..#|###.', C: '.###|#...|#...|#...|.###', D: '###.|#..#|#..#|#..#|###.', E: '####|#...|###.|#...|####',
    F: '####|#...|###.|#...|#...', G: '.###|#...|#.##|#..#|.###', H: '#..#|#..#|####|#..#|#..#', I: '###|.#.|.#.|.#.|###', J: '..##|...#|...#|#..#|.##.',
    K: '#..#|#.#.|##..|#.#.|#..#', L: '#...|#...|#...|#...|####', M: '#...#|##.##|#.#.#|#...#|#...#', N: '#..#|##.#|#.##|#..#|#..#', O: '.##.|#..#|#..#|#..#|.##.',
    P: '###.|#..#|###.|#...|#...', Q: '.##.|#..#|#..#|#.#.|.#.#', R: '###.|#..#|###.|#.#.|#..#', S: '.###|#...|.##.|...#|###.', T: '###|.#.|.#.|.#.|.#.',
    U: '#..#|#..#|#..#|#..#|.##.', V: '#..#|#..#|#..#|.##.|.##.', W: '#...#|#...#|#.#.#|##.##|#...#', X: '#..#|#..#|.##.|#..#|#..#', Y: '#.#|#.#|.#.|.#.|.#.',
    Z: '####|...#|.##.|#...|####', 0: '.##.|#..#|#..#|#..#|.##.', 1: '.#.|##.|.#.|.#.|###', 2: '###.|...#|.##.|#...|####', 3: '###.|...#|.##.|...#|###.',
    4: '#..#|#..#|####|...#|...#', 5: '####|#...|###.|...#|###.', 6: '.##.|#...|###.|#..#|.##.', 7: '####|...#|..#.|.#..|.#..', 8: '.##.|#..#|.##.|#..#|.##.',
    9: '.##.|#..#|.###|...#|.##.', '.': '.|.|.|.|#', '·': '.|.|#|.|.', '-': '...|...|###|...|...', ' ': '..|..|..|..|..',
  };
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v.split('|')]));
})();

function legoDesign(photo) {
  const N = 192, grid = new Array(N * N).fill(null);
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = c; };
  const text = (str, x, y, c, font = FONT5, scale = 1) => {
    for (const ch of str.toUpperCase()) {
      const g = font[ch] || font[' '];
      g.forEach((row, j) => [...row].forEach((b, i) => { if (b === '#') for (let a = 0; a < scale; a++) for (let d = 0; d < scale; d++) set(x + i * scale + a, y + j * scale + d, c); }));
      x += ([...g[0]].length + 1) * scale;
    }
    return x;
  };
  const disc = (cx, cy, r, c, r0 = -1) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r && d > r0) set(x, y, c); } };
  const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2; for (let i = 0; i <= n; i++) set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); };
  const art = (rows, x, y, pal) => rows.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch]) set(x + i, y + j, pal[ch]); }));

  // title and the orange underline
  text('ABOUT ME', 8, 8, LEGO.white, FONT5, 2);
  for (let x = 8; x < 104; x++) { set(x, 25, LEGO.orange); set(x, 26, LEGO.orange); }

  // the photo, as a LEGO-art mosaic in a white frame (top right)
  const PX = 130, PY = 6, PS = 52;
  for (let y = PY; y < PY + PS + 4; y++) for (let x = PX; x < PX + PS + 4; x++) set(x, y, LEGO.white);
  if (photo) {
    const [c, g] = canvas(PS, PS); g.drawImage(photo, 0, 0, PS, PS);
    const px = g.getImageData(0, 0, PS, PS).data;
    const pal = ['#05131d', '#352100', '#582a12', '#7c503a', '#aa7d55', '#d09168', '#f6d7b3', '#e4cd9e', '#958a73', '#6c6e68', '#a0a5a9', '#f4f4f4',
      '#184632', '#237841', '#4b9f4a', '#9b9a5a', '#a0bcac']   // LEGO Art's skin, hair and greys, plus greens for the leaves behind
      .map(h => [h, parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    for (let y = 0; y < PS; y++) for (let x = 0; x < PS; x++) {
      const i = (y * PS + x) * 4, r = px[i], gg = px[i + 1], b = px[i + 2];
      let best = pal[0], bd = Infinity;
      for (const p of pal) { const d = 0.3 * (r - p[1]) ** 2 + 0.59 * (gg - p[2]) ** 2 + 0.11 * (b - p[3]) ** 2; if (d < bd) { bd = d; best = p; } }
      set(PX + 2 + x, PY + 2 + y, best[0]);
    }
  }

  // the four lines of experience, each with a pixel logo
  const gear = (x, y) => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const dx = i + 0.5 - 8, dy = j + 0.5 - 8, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx); if (r < 2.4) continue; if (r < 5.6 || (r < 7.6 && Math.cos(a * 8) > 0.15)) set(x + i, y + j, LEGO.orange); } };
  const heart = ['..##...##..', '.####.####.', '###########', '###########', '###########', '.#########.', '..#######..', '...#####...', '....###....', '.....#.....'];
  const bike = (x, y) => { disc(x + 3.8, y + 11, 3.6, LEGO.white, 2.4); disc(x + 12.2, y + 11, 3.6, LEGO.white, 2.4);
    line(x + 4, y + 11, x + 8, y + 11, LEGO.white); line(x + 8, y + 11, x + 6, y + 6, LEGO.white); line(x + 6, y + 6, x + 4, y + 11, LEGO.white);
    line(x + 6, y + 6, x + 11, y + 6, LEGO.white); line(x + 8, y + 11, x + 11, y + 6, LEGO.white); line(x + 11, y + 6, x + 12, y + 11, LEGO.white);
    line(x + 5, y + 5, x + 7, y + 5, LEGO.yellow); line(x + 10, y + 4, x + 12, y + 4, LEGO.yellow); };
  const purdueP = ['kkkkkkkkkk..', 'kggggggggk..', 'kggggggggkk.', 'kggkkkkgggk.', 'kggk..kgggk.', 'kggkkkkgggk.', 'kggggggggkk.', 'kggggggggk..', 'kggkkkkkk...', 'kggk........', 'kggk........', 'kggk........', 'kggk........', 'kkkk........'];
  const entries = [
    [x => gear(x, 34), 'PURDUE MARS LAB', 'UNDERGRAD RESEARCHER'],
    [x => art(heart, x + 2, 63, { '#': LEGO.red }), 'I3 SIMULATIONS', 'CAD INTERN · MEDICAL HAPTICS'],
    [x => bike(x, 84), 'THE BIKE LANE', 'MECHANIC · FRAME-UP BUILDS'],
    [x => art(purdueP, x + 2, 111, { k: LEGO.black, g: LEGO.gold }), 'PURDUE UNIVERSITY', 'B.S. MECHANICAL ENG · 2030'],
  ];
  entries.forEach(([logo, name, sub], k) => { const y = 34 + k * 26; logo(8); text(name, 30, y + 1, LEGO.white); text(sub, 30, y + 11, LEGO.lightBlue, FONT4); });

  // the way out, and the site's mark (a cylinder and one vortex of each sign)
  text('CONTACT → THE DOOR', 8, 150, LEGO.yellow);
  text('SAY HI!', 8, 163, LEGO.orange, FONT5, 2);
  disc(152, 168, 9.5, LEGO.white, 6.5); disc(167, 155, 6, LEGO.orange); disc(179, 177, 6, LEGO.azure);
  return { N, grid };
}

// The panel's colour and normal maps: blue baseplate studs everywhere, a raised 1×1 plate (with its own stud)
// wherever the design has a pixel. Each cell is copied, row by row, from a small pre-shaded tile.
function legoTextures(photo, px) {
  const { N, grid } = legoDesign(photo), S = N * px;
  const tiles = new Map();
  function tile(color, raised) {
    const key = color + raised;
    if (tiles.has(key)) return tiles.get(key);
    const col = new Uint8ClampedArray(px * px * 4), nor = new Uint8ClampedArray(px * px * 4);
    const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    const r = px * 0.31, cx = px / 2, cy = px / 2 - 0.3;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      const i = (y * px + x) * 4, dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      let nx = 0, ny = 0, shade = 1;
      if (raised) {   // the plate's bevelled edge, and a hairline seam to its neighbours
        const ex = Math.min(x + 0.5, px - x - 0.5), ey = Math.min(y + 0.5, px - y - 0.5), e = Math.min(ex, ey);
        if (e < 1.2) { if (ex <= ey) nx = x < px / 2 ? -0.55 : 0.55; if (ey <= ex) ny = y < px / 2 ? -0.55 : 0.55; shade = e < 0.6 ? 0.62 : 0.9; }
      }
      if (d < r + 0.6) {   // the stud: a flat top with a rounded rim; a soft shadow ring just outside it
        const k = Math.max(0, Math.min(1, (d - r * 0.55) / (r * 0.55)));
        if (d <= r) { nx = dx / d * k * 0.75; ny = dy / d * k * 0.75; shade *= 1.04 - 0.1 * k; } else shade *= 0.86;
      }
      col[i] = rgb[0] * shade; col[i + 1] = rgb[1] * shade; col[i + 2] = rgb[2] * shade; col[i + 3] = 255;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));   // tangent space, +y up the texture (canvas rows run down)
      nor[i] = (nx * 0.5 + 0.5) * 255; nor[i + 1] = (-ny * 0.5 + 0.5) * 255; nor[i + 2] = (nz * 0.5 + 0.5) * 255; nor[i + 3] = 255;
    }
    const t = [col, nor]; tiles.set(key, t); return t;
  }
  const [c, g] = canvas(S, S), [nc, ng] = canvas(S, S);
  const col = g.createImageData(S, S), nor = ng.createImageData(S, S), row = px * 4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = grid[y * N + x], [tc, tn] = tile(p || LEGO.blue, !!p);
    for (let j = 0; j < px; j++) {
      const o = ((y * px + j) * S + x * px) * 4;
      col.data.set(tc.subarray(j * row, j * row + row), o); nor.data.set(tn.subarray(j * row, j * row + row), o);
    }
  }
  g.putImageData(col, 0, 0); ng.putImageData(nor, 0, 0);
  return { map: tex(c), normal: tex(nc, { srgb: false }), size: N * STUD };
}

// ---------------------------------------------------------------- the view out of the window
// An October afternoon over campus from five floors up, with the Bell Tower 115 m away across the lawn.
// The window is a portal, not a poster: each pixel looks up the direction it sees (bearing a, + to the right
// as you look out; elevation e), so the view holds still like real distant scenery while the camera moves.
// The campus is a small scene projected into a panorama once; the tower is a 3D model rendered once into
// its own texture, with a mask for the trees that stand in front of it.
const VIEW = { a0: -80, a1: 80, e0: -35, e1: 45, eye: 20.8 };   // degrees covered; eye height above the lawn (m)
const BELL = { a: -27, dist: 120, turn: 0.72, fov: 27, hfov: 5, px: 256 };
const D2R = Math.PI / 180;
const dirOf = (a, e) => new THREE.Vector3(-Math.sin(a * D2R) * Math.cos(e * D2R), Math.sin(e * D2R), Math.cos(a * D2R) * Math.cos(e * D2R));
// campus ground: x to the left of the window's axis, z out from it (metres); bearing a and range r → [x, z]
const ground = (a, r) => [-Math.sin(a * D2R) * r, Math.cos(a * D2R) * r];

// the tower camera: where it points, and how a direction lands on its image (uv, v up)
function towerFrame() {
  const eb = Math.atan2(-VIEW.eye, BELL.dist), et = Math.atan2(TOWER_H - VIEW.eye, BELL.dist), ec = (eb + et) / 2 / D2R;
  const f = dirOf(BELL.a, ec), r = f.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(), u = r.clone().cross(f);
  const tanV = Math.tan(BELL.fov / 2 * D2R), aspect = Math.tan(BELL.hfov / 2 * D2R) / tanV;
  const scale = new THREE.Vector2(1 / (2 * aspect * tanV), 1 / (2 * tanV));
  const uv = d => { const z = f.dot(d); return z <= 0 ? null : [0.5 + r.dot(d) / z * scale.x, 0.5 + u.dot(d) / z * scale.y]; };
  return { ec, aspect, scale, matrix: new THREE.Matrix3().set(r.x, r.y, r.z, u.x, u.y, u.z, f.x, f.y, f.z), uv };
}

function campusView(W, frame) {
  const H = W / 2, k = W / (VIEW.a1 - VIEW.a0), X = a => (a - VIEW.a0) * k, Y = e => (VIEW.e1 - e) * k;
  const [c, g] = canvas(W, H);
  const MW = 64, MH = Math.round(MW / frame.aspect), [mc, mg] = canvas(MW, MH);   // what stands in front of the tower
  let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const sky = [223, 232, 238];
  const haze = (rgb, dist) => { const h = 1 - Math.exp(-dist / 1300); return `rgb(${rgb.map((v, i) => Math.round(v + (sky[i] - v) * h)).join(',')})`; };
  // a campus point (x, y, z) → canvas [px, py, distance]
  const proj = (x, y, z) => { const r = Math.hypot(x, z), a = Math.atan2(-x, z) / D2R, e = Math.atan2(y - VIEW.eye, r) / D2R; return [X(a), Y(e), Math.hypot(r, y - VIEW.eye), a, e]; };
  // fill a polygon given in campus coordinates (edges subdivided, so long walls follow the panorama's curves);
  // anything nearer than the tower also goes into the tower's mask
  function poly(pts, fill, n = 6, occludes = true) {
    const ring = [];
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; for (let s = 0; s < n; s++) { const t = s / n; ring.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); } });
    const pp = ring.map(p => proj(...p));
    g.fillStyle = fill; g.beginPath(); pp.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill();
    if (occludes && pp.some(p => p[2] < BELL.dist)) mask(pp.map(p => [p[3], p[4]]));
  }
  function mask(ae) {
    const uv = ae.map(([a, e]) => frame.uv(dirOf(a, e)));
    if (uv.some(p => !p)) return;
    mg.fillStyle = '#fff'; mg.beginPath(); uv.forEach(([u, v], i) => i ? mg.lineTo(u * MW, (1 - v) * MH) : mg.moveTo(u * MW, (1 - v) * MH)); mg.closePath(); mg.fill();
  }

  // sky: deeper overhead, pale at the horizon, brighter toward the sun (high, ahead and to the left)
  const sg = g.createLinearGradient(0, Y(45), 0, Y(0));
  sg.addColorStop(0, '#5d99d4'); sg.addColorStop(0.45, '#8bbae3'); sg.addColorStop(0.8, '#bcd6ec'); sg.addColorStop(1, '#e1eaf0');
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  { const sx = X(-19), sy = Y(37), sr = 30 * k, gl = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    gl.addColorStop(0, 'rgba(255,252,240,.55)'); gl.addColorStop(1, 'rgba(255,252,240,0)'); g.fillStyle = gl; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
  // fair-weather cumulus: flat bottoms, soft tops, smaller toward the horizon
  for (let i = 0; i < 34; i++) {
    const e = 3 + Math.pow(rnd(), 1.6) * 30, a = VIEW.a0 + rnd() * (VIEW.a1 - VIEW.a0), s = (1.2 + rnd() * 3) * (0.4 + e / 25) * k;
    for (let j = 0; j < 7; j++) {
      const x = X(a) + (rnd() - 0.5) * s * 3, y = Y(e) - rnd() * s * 0.7, r = s * (0.45 + rnd() * 0.6);
      const cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, 'rgba(255,255,255,.75)'); cg.addColorStop(0.6, 'rgba(250,251,253,.4)'); cg.addColorStop(1, 'rgba(245,248,252,0)');
      g.fillStyle = cg; g.beginPath(); g.ellipse(x, y, r * 1.4, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // lawn, darkening toward the foot of the building
  const lg = g.createLinearGradient(0, Y(-0.5), 0, H);
  lg.addColorStop(0, haze([96, 128, 70], 1500)); lg.addColorStop(0.12, '#6f8f4a'); lg.addColorStop(1, '#55733a');
  g.fillStyle = lg; g.fillRect(0, Y(-0.5), W, H);
  // walkways: a long one down the mall and diagonals crossing it toward the tower
  const walk = (x0, z0, x1, z1, w) => { const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = -dz / l * w / 2, nz = dx / l * w / 2; poly([[x0 + nx, 0, z0 + nz], [x1 + nx, 0, z1 + nz], [x1 - nx, 0, z1 - nz], [x0 - nx, 0, z0 - nz]], '#d8d2c6', 24, false); };
  const [tx, tz] = ground(BELL.a, BELL.dist);
  walk(-8, 20, -8, 600, 6); walk(-60, 30, tx, tz, 4); walk(60, 40, tx, tz, 4); walk(-120, 160, 120, 150, 4.5); walk(tx - 14, tz - 14, tx + 14, tz - 14, 5);
  // far skyline: a hazy tree line with pale buildings in it
  for (let a = VIEW.a0; a < VIEW.a1; a += 0.6 + rnd()) {
    const r = 900 + rnd() * 900, h = 12 + rnd() * 10, [x, z] = ground(a, r), [px, py, d] = proj(x, h, z), w = (14 + rnd() * 20) / d / D2R * k;
    g.fillStyle = haze([70, 90, 60], d); g.beginPath(); g.ellipse(px, py + w * 0.3, w, w * 0.55, 0, 0, Math.PI * 2); g.fill();
  }

  // the campus: red-brick buildings with limestone trim, and trees, drawn far to near
  const items = [];
  const facades = [[154, 76, 52], [142, 70, 50], [166, 88, 60], [150, 82, 58], [206, 196, 176]];
  const building = (a, r, len, dep, h, turn = 0) => items.push({ r, face: facades[Math.floor(rnd() * facades.length)], draw() {
    const face = this.face;
    const [cx, cz] = ground(a, r), ang = (a + turn) * D2R, ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
    const C = (s, t, y) => [cx + ux * s * len / 2 + vx * t * dep / 2, y, cz + uz * s * len / 2 + vz * t * dep / 2];
    const sides = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
    for (const [p, q] of sides) {
      const a0 = C(...p, 0), b0 = C(...q, 0), mx = (a0[0] + b0[0]) / 2, mz = (a0[2] + b0[2]) / 2, nx = (b0[2] - a0[2]), nz = -(b0[0] - a0[0]);
      if (nx * -mx + nz * -mz <= 0) continue;   // faces away from the window
      const lit = 0.72 + 0.28 * Math.max(0, nx / Math.hypot(nx, nz)), d = Math.hypot(mx, mz);
      const brick = face.map(v => v * lit), stone = [226, 218, 202].map(v => v * lit);
      poly([a0, b0, C(...q, h), C(...p, h)], haze(brick, d));
      poly([C(...p, h - 1.1), C(...q, h - 1.1), C(...q, h), C(...p, h)], haze(stone, d));
      poly([a0, b0, C(...q, 1.2), C(...p, 1.2)], haze(stone, d));
      const span = Math.hypot(b0[0] - a0[0], b0[2] - a0[2]), cols = Math.floor(span / 3.2), floors = Math.floor((h - 2.5) / 4);
      for (let f = 0; f < floors; f++) for (let i = 0; i < cols; i++) {
        const t0 = (i + 0.3) / cols, t1 = (i + 0.7) / cols, y0 = 2.4 + f * 4, y1 = y0 + 2.2;
        const L = (t, y) => [a0[0] + (b0[0] - a0[0]) * t, y, a0[2] + (b0[2] - a0[2]) * t];
        poly([L(t0, y0), L(t1, y0), L(t1, y1), L(t0, y1)], haze([58, 66, 78], d), 1);
      }
    }
    poly([C(-1, -1, h), C(1, -1, h), C(1, 1, h), C(-1, 1, h)], haze([136, 130, 122], r));
  } });
  const hues = [[88, 112, 58], [104, 124, 64], [150, 150, 72], [196, 160, 66], [206, 168, 74], [196, 120, 52], [182, 104, 48], [150, 60, 42], [128, 48, 36], [140, 98, 58]];
  const tree = (a, r, h, rad) => items.push({ r, draw() {
    const [x, z] = ground(a, r), [px, py, d] = proj(x, h - rad, z), s = rad / d / D2R * k, base = hues[Math.floor(rnd() * hues.length)];
    const sh = proj(x - 4, 0, z - 7);   // its shadow on the lawn, falling toward the window (the sun is ahead)
    g.fillStyle = 'rgba(28,38,20,.26)'; g.beginPath(); g.ellipse(sh[0], sh[1], s * 1.1, s * 0.45, 0, 0, Math.PI * 2); g.fill();
    // the crown: a shaded core, then clumps of leaves lit from the upper left
    g.fillStyle = haze(base.map(v => v * 0.5), d); g.beginPath(); g.ellipse(px, py + s * 0.08, s, s * 0.9, 0, 0, Math.PI * 2); g.fill();
    const n = Math.max(5, Math.min(40, Math.round(s * 1.2)));
    for (let j = 0; j < n; j++) {
      const t = rnd() * Math.PI * 2, q = Math.sqrt(rnd()) * 0.8, ox = Math.cos(t) * q, oy = Math.sin(t) * q * 0.9;
      const lit = Math.max(0.55, Math.min(1.25, 0.86 - ox * 0.3 - oy * 0.42 + (rnd() - 0.5) * 0.16)), rr = s * (0.2 + rnd() * 0.17);
      g.fillStyle = haze(base.map(v => Math.min(255, v * lit)), d); g.beginPath(); g.arc(px + ox * s, py + oy * s, rr, 0, Math.PI * 2); g.fill();
    }
    if (d < BELL.dist) { const ae = []; for (let j = 0; j < 16; j++) { const t = j / 16 * Math.PI * 2; ae.push([(px + Math.cos(t) * s * 1.02) / k + VIEW.a0, VIEW.e1 - (py + Math.sin(t) * s * 0.95) / k]); } mask(ae); }
  } });
  // the lawn isn't one flat green: mown patches, worn spots and shade
  for (let i = 0; i < 220; i++) {
    const a = VIEW.a0 + rnd() * (VIEW.a1 - VIEW.a0), r = 25 + Math.pow(rnd(), 1.5) * 600, rad = 4 + rnd() * 16, [x, z] = ground(a, r), ring = [];
    for (let j = 0; j < 12; j++) { const t = j / 12 * Math.PI * 2; ring.push([x + Math.cos(t) * rad, 0, z + Math.sin(t) * rad]); }
    poly(ring, rnd() < 0.55 ? 'rgba(40,62,26,.13)' : 'rgba(170,190,120,.1)', 1, false);
  }
  // buildings ringing the lawn (none in front of the tower)
  for (const b of [[-62, 120, 70, 22, 17, 70], [-44, 190, 60, 24, 19, 20], [-33, 330, 90, 26, 16, 10], [-8, 420, 110, 30, 20, 0], [12, 360, 70, 24, 18, -10],
    [28, 260, 80, 24, 17, -25], [46, 170, 70, 22, 16, -50], [64, 110, 60, 20, 15, -70], [-75, 260, 80, 24, 18, 80], [76, 260, 70, 22, 16, -80], [-20, 640, 130, 30, 22, 0], [30, 700, 100, 30, 20, 5],
    [-52, 520, 90, 28, 18, 15], [-12, 230, 46, 20, 14, 0], [4, 560, 80, 26, 19, 0], [18, 480, 60, 24, 16, 30], [40, 420, 90, 28, 18, -30], [58, 380, 70, 24, 17, -60], [-68, 420, 70, 24, 16, 60], [-30, 820, 120, 30, 20, 0], [52, 760, 110, 30, 22, 0]]) building(...b);
  // trees along the walks, in groves, and a stand of tall ones hiding the tower's foot
  for (let i = 0; i < 140; i++) tree(-78 + rnd() * 156, 40 + Math.pow(rnd(), 1.3) * 560, 11 + rnd() * 8, 2.8 + rnd() * 2.8);
  for (const [a, r, h] of [[-24.5, 92, 14], [-22.2, 98, 15], [-20, 90, 13.5], [-23.4, 80, 12.5], [-21, 76, 12], [-19.2, 104, 14.5]]) tree(a, r, h, 4.2);
  items.sort((p, q) => q.r - p.r).forEach(it => it.draw());

  // a bright afternoon seen from indoors: softened and a little washed out
  noise(g, W, H, 256, 0.05);
  const [c2, g2] = canvas(W, H);
  g2.filter = `blur(${(W / 2048).toFixed(2)}px)`; g2.drawImage(c, 0, 0); g2.filter = 'none';
  const hz = g2.createLinearGradient(0, 0, 0, H); hz.addColorStop(0, 'rgba(255,255,255,.06)'); hz.addColorStop(0.55, 'rgba(255,255,255,.16)'); hz.addColorStop(1, 'rgba(255,255,255,.06)');
  g2.fillStyle = hz; g2.fillRect(0, 0, W, H);
  mg.filter = 'blur(0.6px)'; mg.drawImage(mc, 0, 0); mg.filter = 'none';
  const front = tex(mc, { srgb: false }); front.anisotropy = 1;
  return { pano: tex(c2), front };
}

/** The window's material, and a promise that resolves once the tower has been rendered into it.
 *  `basis` turns a world direction into the window's frame: x to the left and z straight out as you look out. */
function windowView(renderer, hi, basis, halfFloat = true, samples = 0) {
  const frame = towerFrame(), { pano, front } = campusView(hi ? 2048 : 1280, frame);
  const rt = new THREE.WebGLRenderTarget(BELL.px, Math.round(BELL.px / frame.aspect), { type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, samples, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      pano: { value: pano }, range: { value: new THREE.Vector4(VIEW.a0 * D2R, VIEW.a1 * D2R, VIEW.e0 * D2R, VIEW.e1 * D2R) },
      tower: { value: rt.texture }, front: { value: front }, towerFrame: { value: frame.matrix }, towerScale: { value: frame.scale },
      haze: { value: new THREE.Color(0xdfe8ee) }, tint: { value: 0.89 }, viewBasis: { value: basis },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vDir = w.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D pano, tower, front;
      uniform vec4 range;
      uniform mat3 towerFrame;
      uniform vec2 towerScale;
      uniform vec3 haze;
      uniform float tint;
      uniform mat3 viewBasis;
      varying vec3 vDir;
      void main() {
        vec3 d = viewBasis * normalize(vDir);
        vec2 ae = vec2(atan(-d.x, d.z), asin(clamp(d.y, -1.0, 1.0)));
        vec3 col = texture2D(pano, clamp((ae - range.xz) / (range.yw - range.xz), 0.0, 1.0)).rgb;
        vec3 t = towerFrame * d;
        vec2 tuv = 0.5 + t.xy / max(t.z, 1e-3) * towerScale;
        vec4 tw = texture2D(tower, tuv);   // premultiplied (cleared to transparent, edges resolved by MSAA)
        float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0) * step(0.0, t.z);
        float vis = inside * (1.0 - texture2D(front, tuv).r);   // trees nearer than the tower hide its foot
        col = col * (1.0 - tw.a * vis) + mix(tw.rgb, haze * tw.a, 0.1) * vis;   // and a little air between here and there
        gl_FragColor = vec4(col * tint, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  // render the tower once: lit from the left like the afternoon outside, with its own shadows (belfry, cornice)
  const render = async () => {
    const scene = new THREE.Scene(), tower = createBellTower();
    tower.position.set(0, -VIEW.eye, -BELL.dist); tower.rotation.y = BELL.turn; scene.add(tower);
    const top = tower.position.clone().add(new THREE.Vector3(0, 40, 0));
    const sun = new THREE.DirectionalLight(0xfff1de, 4.2);
    sun.position.copy(top).add(new THREE.Vector3(-30, 36, 12)); sun.target.position.copy(top);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 12, bottom: -12, near: 1, far: 120 });
    scene.add(sun, sun.target, new THREE.HemisphereLight(0xd8e6f4, 0xa08a70, 2.2));
    const cam = new THREE.PerspectiveCamera(BELL.fov, frame.aspect, 40, 300); cam.rotation.x = frame.ec * D2R;
    const prev = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    const compiled = renderer.compileAsync(scene, cam);
    renderer.setRenderTarget(prev);
    await compiled.catch(() => {});
    try { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); }
    finally { renderer.setRenderTarget(prev); renderer.setClearColor(clear, alpha); tower.userData.dispose(); sun.shadow.dispose(); }
  };
  return { material, ready: render(), redraw: render };
}

// Beyond the door: open daylight, a little warmer at the bottom where the sun hits the ground.
function outsideTexture() {
  const [c, g] = canvas(256, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#dfeaf6'); gr.addColorStop(0.55, '#fffaf0'); gr.addColorStop(1, '#ffe8c4');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
  return tex(c);
}
function lightPatchTexture() {
  const [c, g] = canvas(256, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(1, 'rgba(255,236,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const side = g.createLinearGradient(0, 0, 256, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.08, 'rgba(0,0,0,0)'); side.addColorStop(0.92, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = side; g.fillRect(0, 0, 256, 256);
  return tex(c);
}

// soft contact shadow for things standing on the floor
let blobTex = null;
export function blob(w, d, opacity = 0.42) {
  if (!blobTex) {
    const [c, g] = canvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, color: 0x2a1e12 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002; m.renderOrder = 1;
  return m;
}

// A wall in its own frame: x along the wall (u), y up, facing +Z (into the room once placed). `notches` are
// openings from the floor (doors), `holes` are openings above it (windows). UVs span the whole wall 0..1.
function wallGeometry(len, { notches = [], holes = [] } = {}) {
  const H = ROOM.H, s = new THREE.Shape();
  s.moveTo(-len / 2, 0);
  for (const n of [...notches].sort((a, b) => a.x - b.x)) { s.lineTo(n.x - n.w / 2, 0); s.lineTo(n.x - n.w / 2, n.h); s.lineTo(n.x + n.w / 2, n.h); s.lineTo(n.x + n.w / 2, 0); }
  s.lineTo(len / 2, 0); s.lineTo(len / 2, H); s.lineTo(-len / 2, H); s.closePath();
  for (const o of holes) {
    const p = new THREE.Path(), x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, y0 = o.y0, y1 = o.y0 + o.h;
    p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.closePath(); s.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(s);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + len / 2) / len, pos.getY(i) / H);
  return g;
}

// ---------------------------------------------------------------- the room
// door: { model, opening: { width, height } } from models/fixtures.js (optional)
export function buildShell(scene, renderer, { tier = 'high', photo, touch = false, halfFloat = true, samples = 0, door = null } = {}) {
  const out = { anchors: {}, update: [] };
  const hi = tier === 'high';
  const doorW = door?.opening?.width || 1.0, doorH = door?.opening?.height || 2.08;
  // a group standing on a wall, so what's inside it can be built facing +Z with the wall at z = 0
  const onto = (wall, u, y = 0, d = 0) => { const g = new THREE.Group(); place(g, wall, u, y, d); scene.add(g); return g; };

  // ---------- floor, walls, ceiling
  const oak = oakTextures(hi ? 2048 : 1024);
  const floorMat = new THREE.MeshStandardMaterial({ map: oak.map, roughnessMap: oak.rough, roughness: 1, metalness: 0, envMapIntensity: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.W, ROOM.D), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const wallMat = (w) => new THREE.MeshStandardMaterial({ map: wallTexture(w, ROOM.H), roughness: 0.93, metalness: 0 });
  const openings = {
    [DOORWAY.wall]: { notches: [{ x: DOORWAY.u, w: doorW, h: doorH }] },
    [WINDOW.wall]: { holes: [{ x: WINDOW.u, y0: WINDOW.y0, w: WINDOW.w, h: WINDOW.h }] },
  };
  for (const [k, w] of Object.entries(WALLS)) {
    const mesh = place(new THREE.Mesh(wallGeometry(w.len, openings[k]), wallMat(w.len)), k, 0);
    mesh.receiveShadow = true; mesh.castShadow = true; scene.add(mesh);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.W, ROOM.D), new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.95, emissive: 0x6b6762 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM.H; ceil.castShadow = true; scene.add(ceil);   // the ceiling and walls keep the sun to the window

  // painted baseboards, with a gap for the door
  const trim = new Builder('trim');
  const bb = (wall, u0, u1) => trim.add(box(u1 - u0, 0.11, 0.016, 0.003), 'plasticWhite', { position: onWall(wall, (u0 + u1) / 2, 0.055, 0.008).toArray(), rotation: [0, WALLS[wall].ry, 0] });
  for (const [k, w] of Object.entries(WALLS)) {
    if (k !== DOORWAY.wall) { bb(k, -w.len / 2, w.len / 2); continue; }
    bb(k, -w.len / 2, DOORWAY.u - doorW / 2 - 0.075); bb(k, DOORWAY.u + doorW / 2 + 0.075, w.len / 2);
  }
  scene.add(trim.build());

  // ---------- the window (right wall, by the FTC corner): deep white reveals, a slim black frame with a low
  // transom, and a deep ledge the LEGO engine sits on, with campus and the Bell Tower beyond
  const win = onto(WINDOW.wall, WINDOW.u), outward = new THREE.Vector3(-WALLS[WINDOW.wall].n[0], 0, -WALLS[WINDOW.wall].n[1]);
  {
    const { y0, w, h, ledge } = WINDOW, D = 0.14, fz = -0.09, t = new Builder('window');
    t.add(box(w, 0.012, D), 'plasticWhite', { position: [0, y0 + h - 0.006, -D / 2] });
    t.add(box(0.012, h, D), 'plasticWhite', { position: [-w / 2 + 0.006, y0 + h / 2, -D / 2] });
    t.add(box(0.012, h, D), 'plasticWhite', { position: [w / 2 - 0.006, y0 + h / 2, -D / 2] });
    t.add(box(w, 0.045, 0.05, 0.004), 'blackMetal', { position: [0, y0 + h - 0.022, fz] });
    t.add(box(w, 0.045, 0.05, 0.004), 'blackMetal', { position: [0, y0 + 0.022, fz] });
    t.add(box(0.045, h, 0.05, 0.004), 'blackMetal', { position: [-w / 2 + 0.022, y0 + h / 2, fz] });
    t.add(box(0.045, h, 0.05, 0.004), 'blackMetal', { position: [w / 2 - 0.022, y0 + h / 2, fz] });
    t.add(box(0.035, h, 0.04, 0.003), 'blackMetal', { position: [0, y0 + h / 2, fz] });
    t.add(box(w, 0.035, 0.04, 0.003), 'blackMetal', { position: [0, y0 + 0.42, fz] });   // a low transom keeps the view clear
    win.add(t.build());
    const sill = new Builder('windowLedge');   // from the glass out into the room, on a slim apron
    sill.add(box(w + 0.16, 0.04, D + ledge, 0.006), 'plasticWhite', { position: [0, y0 - 0.02, (ledge - D) / 2] });
    sill.add(box(w + 0.16, 0.07, 0.018, 0.004), 'plasticWhite', { position: [0, y0 - 0.075, ledge - 0.012] });
    out.ledge = sill.build(); win.add(out.ledge);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat('glass')); glass.position.set(0, y0 + h / 2, fz + 0.005); win.add(glass);
    // the view: a portal just past the reveal (see windowView)
    const r = outward.clone().cross(new THREE.Vector3(0, 1, 0)), basis = new THREE.Matrix3().set(-r.x, -r.y, -r.z, 0, 1, 0, outward.x, outward.y, outward.z);
    const view = windowView(renderer, hi, basis, halfFloat, samples);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.12, h + 0.12), view.material); pane.position.set(0, y0 + h / 2, -0.15); win.add(pane);
    out.ready = view.ready; out.redrawTower = view.redraw; out.viewBasis = basis;
  }

  // ---------- daylight: the sun through the window, skylight spilling in, a soft fill
  scene.add(new THREE.HemisphereLight(0xf6f3ee, 0xc9b59c, hi ? 0.95 : 1.25));
  {
    // the sun is a distant narrow spot aimed through the window, so its shadow map only holds what the beam touches
    const c = onWall(WINDOW.wall, WINDOW.u, WINDOW.y0 + WINDOW.h / 2), a = -19 * D2R, e = 34 * D2R;
    const local = new THREE.Vector3(-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const toSun = local.applyMatrix3(out.viewBasis.clone().transpose());
    const sun = new THREE.SpotLight(0xfff0dc, 4.2, 0, 0.11, 0.2, 0);
    sun.position.copy(c).addScaledVector(toSun, 14); sun.target.position.copy(c).addScaledVector(toSun, -2);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    sun.shadow.camera.near = 11; sun.shadow.camera.far = 22;
    sun.shadow.autoUpdate = false;   // drawn once (main.js); what moves through the beam is kept out of it (layer 1)
    scene.add(sun, sun.target); out.sun = sun;
    // cool skylight from the window (a wide soft spot: far cheaper per pixel than an area light)
    const sky = new THREE.SpotLight(0xcfe0ff, 6, 9, 1.25, 1, 2);
    onWall(WINDOW.wall, WINDOW.u, WINDOW.y0 + WINDOW.h - 0.05, 0.04, sky.position); onWall(WINDOW.wall, WINDOW.u - 0.25, 0, 3.0, sky.target.position);
    scene.add(sky, sky.target);
  }

  // ---------- a hidden spot on each station: the three on the first wall brightest
  function spot({ at, to, intensity, angle = 0.5, pen = 0.8, shadow = false, color = 0xffe2c0 }) {
    const l = new THREE.SpotLight(color, intensity * 0.62, 0, angle, pen, 2);
    l.position.set(...at); l.target.position.set(...to);
    if (shadow && hi) {
      l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0005; l.shadow.normalBias = 0.03; l.shadow.radius = 4;
      l.shadow.camera.near = 0.3; l.shadow.camera.far = 6;
    }
    scene.add(l, l.target);
    return l;
  }
  const T = ROOM.H - 0.16;
  out.spots = {
    armsim:    spot({ at: [-1.9, T, -1.55], to: [-1.9, 0.76, -2.45], intensity: 16, angle: 0.55 }),
    marschair: spot({ at: [-0.15, T, -0.5], to: [0.0, 0, -1.05], intensity: 18, angle: 0.74, pen: 1, shadow: true }),
    robot:     spot({ at: [1.7, T, -1.1], to: [1.75, 0, -1.95], intensity: 15, angle: 0.5, shadow: true }),
    engine:    spot({ at: [2.1, T, WINDOW.u], to: [X1 - 0.2, WINDOW.y0, WINDOW.u], intensity: 6, angle: 0.42 }),
    research:  spot({ at: [2.0, T, 0.9], to: [X1, 1.1, 0.9], intensity: 14, angle: 0.62, shadow: true }),
    desk:      spot({ at: [1.8, T, 1.5], to: [1.8, 1.0, Z1], intensity: 10, angle: 0.66 }),
    about:     spot({ at: [-0.1, T, 1.7], to: [-0.1, 1.5, Z1], intensity: 8, angle: 0.62 }),
    guitar:    hi ? spot({ at: [-1.0, T, 1.6], to: [-1.35, 0.5, 2.45], intensity: 6, angle: 0.45 }) : null,
  };

  // ---------- the one ceiling fixture: a five-blade fan with an opal bowl light, centred in the room
  {
    const H = ROOM.H, fan = new Builder('ceilingFan');
    fan.add(cyl(0.05, 0.075, 0.05, 32), 'blackMetal', { position: [0, H - 0.025, 0] });                 // canopy
    fan.add(cyl(0.011, 0.011, 0.2, 12), 'blackMetal', { position: [0, H - 0.15, 0] });                  // downrod
    fan.add(lathe([[0, 0], [0.1, 0], [0.118, 0.03], [0.118, 0.075], [0.09, 0.11], [0.012, 0.12]], 40), 'blackMetal', { position: [0, H - 0.37, 0] });   // motor
    fan.add(cyl(0.075, 0.09, 0.04, 32), 'blackMetal', { position: [0, H - 0.39, 0] });                  // light-kit cup
    const blades = fan.part('ceilingFanBlades', { position: [0, H - 0.34, 0] });
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      blades.add(box(0.15, 0.012, 0.032, 0.003).translate(0.155, 0.012, 0).rotateY(-a), 'blackMetal');   // blade iron
      blades.add(box(0.5, 0.008, 0.125, 0.003).rotateX(0.16).translate(0.43, 0, 0).rotateY(-a), 'wood');
    }
    const bowlMat = new THREE.MeshStandardMaterial({ name: 'ceilingFan:opal', color: 0xf3eee6, roughness: 0.55, emissive: 0xffe6c4, emissiveIntensity: 2.2 });
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 40, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bowlMat);
    bowl.scale.y = 0.62; fan.object(bowl, { position: [0, H - 0.41, 0] });
    const model = fan.build(); scene.add(model);
    // a wide downward cone, so the bulb lights the room but not the blades just above it
    const bulb = new THREE.SpotLight(0xffe2c0, hi ? 8 : 10, 0, 1.25, 1, 2);
    bulb.position.set(0, H - 0.43, 0); bulb.target.position.set(0, 0, 0); scene.add(bulb, bulb.target);
  }

  // ---------- the door (left wall, toward the front: the last stop) and the daylight waiting behind it
  {
    const g = onto(DOORWAY.wall, DOORWAY.u);
    const outsideMat = new THREE.MeshBasicMaterial({ map: outsideTexture(), toneMapped: false, side: THREE.BackSide });
    const outside = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 2.4), outsideMat);
    outside.position.set(0, 1.5, -1.32); g.add(outside);
    if (door?.model) g.add(door.model);
    // light that pours in when it opens: a soft spot in the doorway and a bright patch on the floor
    const glow = new THREE.SpotLight(0xfff1dc, 0, 8, 1.15, 1, 2);   // main.js turns it up as the door opens
    glow.position.set(0, doorH - 0.05, 0.04); glow.target.position.set(0.2, 0, 2.6); g.add(glow, glow.target);
    const patchMat = new THREE.MeshBasicMaterial({ map: lightPatchTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pg = new THREE.BufferGeometry();
    const near = doorW * 0.46, far = doorW * 0.78, len = 2.1;
    pg.setAttribute('position', new THREE.Float32BufferAttribute([-near, 0, 0, near, 0, 0, -far, 0, -len, far, 0, -len], 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
    pg.setIndex([0, 1, 2, 1, 3, 2]);
    const patch = new THREE.Mesh(pg, patchMat); patch.position.set(-0.12, 0.003, 0); patch.rotation.y = Math.PI + 0.08; patch.renderOrder = 2; g.add(patch);
    out.door = { outsideMat, glow, patchMat };
    out.anchors.contact = onWall(DOORWAY.wall, DOORWAY.u - 0.15, 1.35, 0.2);
  }

  // ---------- name sign and the welcome note: the first wall, centred, above the MARSChair floor
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.508), new THREE.MeshStandardMaterial({ map: signTexture(), transparent: true, roughness: 0.7, depthWrite: false }));
    place(sign, 'back', 0.15, 2.32, 0.005); sign.renderOrder = 1; scene.add(sign);
    const w = 1.28, h = w * 900 / 1600;
    const note = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: welcomeTexture(touch), transparent: true, roughness: 0.8, depthWrite: false }));
    place(note, 'back', 0.15 - (2.6 - w) / 2 + 0.2, 1.66, 0.004); note.renderOrder = 1; scene.add(note);
  }

  // ---------- 05: live-flow display above the research bench (right wall, past the window)
  {
    const w = 1.36, h = w * 8 / 21, cy = 1.82, g = onto('right', 0.9);
    const f = new Builder('flowDisplay');
    f.add(box(w + 0.04, h + 0.04, 0.03, 0.006), 'plasticBlack', { position: [0, cy, 0.035] });
    f.add(box(0.2, 0.12, 0.02, 0.004), 'blackMetal', { position: [0, cy, 0.01] });
    g.add(f.build());
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }));
    screen.position.set(0, cy, 0.051); g.add(screen);
    out.flowScreen = screen;
    const [c, gg] = canvas(1400, 90);
    gg.font = '500 30px "JetBrains Mono", ui-monospace, monospace'; gg.textBaseline = 'middle';
    gg.fillStyle = '#2fbf6f'; gg.beginPath(); gg.arc(18, 45, 9, 0, 7); gg.fill();
    gg.fillStyle = 'rgba(32,34,39,.7)';
    gg.fillText('LIVE  ·  2D LATTICE-BOLTZMANN  ·  FIN FREE TO PIVOT ON ITS BEARING', 44, 46);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.07), new THREE.MeshStandardMaterial({ map: tex(c), transparent: true, roughness: 0.8 }));
    cap.position.set(0, cy - h / 2 - 0.08, 0.004); g.add(cap);
    out.anchors.research = onWall('right', 0.9, 1.3, 0.45);
  }

  // ---------- 03: FTC field tiles for the robot (back wall, right)
  {
    const t = tileTexture();
    const tiles = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.016, 1.22), [
      mat('plasticGrey'), mat('plasticGrey'), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }), mat('plasticGrey'), mat('plasticGrey'), mat('plasticGrey'),
    ]);
    tiles.position.set(1.75, 0.008, -1.95); tiles.receiveShadow = true; scene.add(tiles);
    out.anchors.robotics = new THREE.Vector3(1.75, 0.6, -1.95);
  }

  // ---------- 08: pinboard, "more projects" (front wall, over the desk)
  {
    const bw = 1.3, bh = 0.8, g = onto('front', -1.8, 1.9, 0.03);
    const frame = new Builder('pinboardFrame');
    frame.add(box(bw + 0.05, bh + 0.05, 0.03, 0.006), 'woodDark', { position: [0, 0, -0.005] });
    g.add(frame.build());
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshStandardMaterial({ map: corkTexture(), roughness: 1 }));
    cork.position.set(0, 0, 0.012); cork.receiveShadow = true; g.add(cork);
    g.name = 'pinboard';
    out.pinboard = { group: g, center: new THREE.Vector3(0, 0, 0.02), w: bw, h: bh };
    out.anchors.more = onWall('front', -1.8 + 0.35, 2.38, 0.2);
  }

  // ---------- 09: the LEGO wall, "about me" (front wall, behind where visitors start)
  {
    const { map, normal, size } = legoTextures(photo, hi ? 8 : 5), g = onto('front', 0.1, 1.48, 0);
    const abs = new THREE.MeshStandardMaterial({ color: LEGO.blue, roughness: 0.38, metalness: 0 });   // the plates' edges
    const face = new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(1, 1), roughness: 0.34, metalness: 0 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(size, size, 0.0064), [abs, abs, abs, abs, face, abs]);
    wall.position.z = 0.0032; wall.name = 'legoWall'; wall.castShadow = false; wall.receiveShadow = true; g.add(wall);
    out.aboutWall = wall;
    out.anchors.about = onWall('front', 0.1 + 0.84, 1.95, 0.15);   // just off the wall's right edge, clear of the lettering
  }

  // ---------- wool rug in the middle, where visitors stand
  {
    const [c, g] = canvas(512, 512);
    g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, 512, 512); noise(g, 512, 512, 512, 0.3); noise(g, 512, 512, 128, 0.15);
    g.strokeStyle = 'rgba(60,52,44,.35)'; g.lineWidth = 10; g.strokeRect(20, 20, 472, 472);
    g.strokeStyle = 'rgba(255,91,31,.45)'; g.lineWidth = 3; g.strokeRect(36, 36, 440, 440);
    const rug = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.01, 1.5), [mat('fabric'), mat('fabric'), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 1 }), mat('fabric'), mat('fabric'), mat('fabric')]);
    rug.position.set(-0.2, 0.005, 0.35); rug.receiveShadow = true; scene.add(rug);
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
