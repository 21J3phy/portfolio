// Nirav Surabhi — the room.
// A studio you can look around. Each station is a project; clicking one flies the camera in and
// opens its panel. Content lives in the page's HTML (so it also works as a plain list view).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, box } from './models/kit.js';
import { buildShell, pinCards, blob, place, onWall, ROOM, WINDOW } from './shell.js';
import { FramePacer } from './frame-pacing.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const tier = new URLSearchParams(location.search).get('tier') || (coarse || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high');   // ?tier=low previews the phone settings
const X0 = -ROOM.W / 2, X1 = ROOM.W / 2, Z0 = -ROOM.D / 2, Z1 = ROOM.D / 2;

// ------------------------------------------------------------------ stations
// In the order you meet them, clockwise from the first wall (the dock, the numbers and Next all follow it), robotics
// and machine learning first: back wall 01 Arm sim, 02 MARSChair, 03 FTC; right wall 04 LEGO engine (on the window
// ledge), 05 Research;
// front wall 06 SpareMe and 07 Silk (the desk), 08 More (pinboard above it), 09 About, 10 B-side; left wall 11, the door.
// MARSChair's run crosses the room: it takes the chair from staging on the first wall to the desk.
// view.pos = where the camera flies; view.look = what it looks at; fit = the [w, h] that must stay in frame.
// Views marked null are aimed at their object once it's placed.
const STATIONS = {
  armsim:    { label: 'Arm sim', sub: 'Words → 3D targets', disc: 'sw', view: { pos: [-2.22, 1.5, -1.3], look: [-1.9, 0.94, -2.42] }, fit: [1.1, 0.78] },
  marschair: { label: 'MARSChair', sub: 'A robot that sets up rooms', disc: 'me', view: { pos: [-1.7, 2.45, -1.85], look: [0.75, 0.25, 0.55] }, fit: [3.4, 2.0] },
  robotics:  { label: 'Robotics', sub: 'FTC #12096', disc: 'me', view: { pos: [1.0, 1.02, -1.0], look: [1.75, 0.28, -1.95] }, fit: [0.8, 0.6] },
  engine:    { label: 'LEGO engine', sub: 'Runs on a vacuum', disc: 'me', view: null, fit: [0.34, 0.36] },
  research:  { label: 'Research', sub: 'Passive vortex propulsion', disc: 'me', view: { pos: [1.45, 1.55, -0.3], look: [3.0, 1.35, 0.9] }, fit: [1.9, 1.35] },
  spareme:   { label: 'SpareMe', sub: 'AI phone agent', disc: 'sw', view: null, fit: [0.17, 0.2] },
  silk:      { label: 'Silk', sub: 'Agent-to-agent messaging', disc: 'sw', view: null, fit: [0.64, 0.4] },
  more:      { label: 'More projects', sub: '30k users in a month', disc: '', view: { pos: [1.8, 1.85, 1.2], look: [1.8, 1.9, 2.77] }, fit: [1.4, 0.9] },
  about:     { label: 'About', sub: 'Experience', disc: '', view: { pos: [-0.1, 1.48, 1.05], look: [-0.1, 1.48, 2.8] }, fit: [1.62, 1.62] },
  guitar:    { label: 'B-side', sub: 'Classical guitar', disc: '', view: { pos: [-0.5, 1.2, 1.45], look: [-1.35, 0.62, 2.45] }, fit: [0.6, 1.1] },
  contact:   { label: 'Contact', sub: 'Open the door', disc: '', view: { pos: [-0.75, 1.5, 0.95], look: [-3.0, 1.1, 1.55] }, fit: [1.5, 2.3] },
};
// a little in front of the middle, facing the first wall: name, welcome note and 01–03 all in view
const HOME = { pos: new THREE.Vector3(0, 1.6, 1.0), yaw: 0, pitch: -0.15 };

// ------------------------------------------------------------------ boot
const canvas = $('#room');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) { window.listOnly?.(); throw e; }
// Resolution: the screen's, inside a pixel budget (a 5K display at 1.75× would push 11 million pixels a frame),
// and capped lower at run time if frames run long (see frame pacing).
const DPR = { max: tier === 'high' ? 1.75 : 2, min: devicePixelRatio > 1 ? 1.25 : 1, budget: tier === 'high' ? 3.4e6 : 1.4e6, cap: Infinity };
const minDpr = () => Math.min(DPR.min, devicePixelRatio, Math.sqrt(DPR.budget / (innerWidth * innerHeight)));
const pickDpr = () => Math.max(minDpr(), Math.min(devicePixelRatio, DPR.max, DPR.cap, Math.sqrt(DPR.budget / (innerWidth * innerHeight))));
renderer.setPixelRatio(pickDpr());
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e6e0);
const halfFloat = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
let environmentTarget;
function rebuildEnvironment() {
  if (!halfFloat) return;   // PMREM itself needs float color buffers, even with an 8-bit composer
  environmentTarget?.dispose();
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  environmentTarget = pmrem.fromScene(room, 0.04);
  scene.environment = environmentTarget.texture;
  room.dispose(); pmrem.dispose();
}
rebuildEnvironment();
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(innerWidth < 760 ? 70 : 58, innerWidth / innerHeight, 0.02, 30);
camera.position.copy(HOME.pos); camera.layers.enable(1);   // layer 1: what moves through the sunbeam (see MARSChair)

// post: a little bloom for screens and daylight, a thin outline on whatever the pointer is over
// half-float targets keep the lighting smooth; a few GPUs can't render to them, so fall back to 8-bit there
const gl = renderer.getContext();
const sampleCounts = gl.getInternalformatParameter(gl.RENDERBUFFER, halfFloat ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES);
const samples = Math.max(0, ...Array.from(sampleCounts).filter(n => n <= (tier === 'high' ? 4 : 2)));
const rt = new THREE.WebGLRenderTarget(1, 1, { type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, samples });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);   // resize supplies integer physical pixels, including at fractional display scales
composer.addPass(new RenderPass(scene, camera));
const outline = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
outline.edgeStrength = 3.4; outline.edgeGlow = 0.2; outline.edgeThickness = 1.2; outline.pulsePeriod = 0;
outline.visibleEdgeColor.set(0x2a2c31); outline.hiddenEdgeColor.set(0x8a8c90);
if (!coarse && halfFloat) composer.addPass(outline);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.55, 2.4);   // only real light sources: LEDs, daylight through the door
{ const set = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => set(w / 2, h / 2); }   // the glow is soft anyway: half resolution looks the same at a quarter of the cost
if (halfFloat) composer.addPass(bloom);
composer.addPass(new OutputPass());
// Keep smoothing when MSAA is unavailable or too expensive. FXAA expects the sRGB output above.
const edgeAA = new ShaderPass(FXAAShader);
edgeAA.enabled = samples === 0;
edgeAA.setSize = (w, h) => edgeAA.uniforms.resolution.value.set(1 / w, 1 / h);
composer.addPass(edgeAA);

// ------------------------------------------------------------------ loading
const loader = $('#loader'), bar = $('#loadbar');
let loaded = 0; const TOTAL = 6;
function progress(label) { loaded++; bar.style.transform = `scaleX(${Math.min(1, loaded / TOTAL)})`; if (label) $('#loadlabel').textContent = label; }

// procedural models (built in parallel modules); a missing module falls back to a stand-in block
async function load(path) { try { return await import(path); } catch (e) { console.warn('model', path, e); return {}; } }
const modules = Promise.all(['./models/windtunnel.js', './models/robot.js', './models/props.js', './models/marschair.js', './models/armsim.js', './models/legoengine.js', './models/fixtures.js'].map(load));
const photoReady = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'img/room/face.webp'; });
// canvas text needs the web fonts; never wait on them for long
const fontsLoaded = Promise.all([document.fonts.load('500 40px Archivo'), document.fonts.load('600 40px Archivo'), document.fonts.load('600 20px "JetBrains Mono"')]).catch(() => {});
await Promise.race([fontsLoaded, new Promise(r => setTimeout(r, 2500))]);
progress('Wiring the lights');
function standin(stand) { const b = new Builder('standin'); b.add(box(...stand, 0.02), 'plasticGrey', { position: [0, stand[1] / 2, 0] }); return b.build(); }
async function make(mod, fn, stand) {
  const t = performance.now();
  try { const f = mod[fn] || (fn === 'default' && mod.default); if (f) { const m = await f(); performance.measure('model:' + (m.name || fn), { start: t }); return m; } } catch (e) { console.warn('model', fn, e); }
  return standin(stand);
}
const [mWind, mRobot, mProps, mMars, mArm, mLego, mFix] = await modules;
performance.mark('room:modules');
const [rig, robot, desk, guitar, plant, mars, arm, lego, door, phone] = await Promise.all([
  make(mWind, 'default', [1.8, 0.9, 0.72]),
  make(mRobot, 'default', [0.45, 0.4, 0.45]),
  make(mProps, 'createDesk', [1.5, 0.74, 0.72]),
  make(mProps, 'createGuitar', [0.4, 1.0, 0.3]),
  make(mProps, 'createPlant', [0.4, 1.6, 0.4]),
  make(mMars, 'default', [0.55, 1.1, 1.1]),
  make(mArm, 'default', [1.0, 0.76, 0.6]),
  make(mLego, 'default', [0.3, 0.2, 0.2]),
  make(mFix, 'createDoor', [0.92, 2.03, 0.05]),
  make(mFix, 'createPhone', [0.0715, 0.1476, 0.0078]),
]);
progress('Framing the room');
performance.mark('room:models');

const photo = await photoReady;
const shell = buildShell(scene, renderer, { tier, photo, touch: coarse, halfFloat, samples, door: { model: door, opening: mFix.OPENING } });
progress('Placing the work');
performance.mark('room:shell');

place(arm, 'back', -1.9, 0, 0.32);                     // 01
robot.position.set(1.75, 0.016, -1.95); robot.rotation.y = -0.55;   // 03, on its tiles, turned toward the visitor
place(lego, WINDOW.wall, WINDOW.u, WINDOW.y0, 0.22);         // 04, on the window ledge
place(rig, 'right', 0.9, 0, 0.37);                     // 05, under the live-flow display
place(desk, 'front', -1.8, 0, 0.38);                    // 06 and 07, under the pinboard (08); MARSChair brings its chair
place(guitar, 'front', 1.35, 0, 0.35, 0.5);             // 10
plant.position.set(X0 + 0.34, 0, 0.05); plant.rotation.y = 0.6;   // the one plant, on the otherwise quiet left wall
scene.add(rig, robot, desk, guitar, plant, lego, arm, mars);
for (const o of [rig, robot, desk, guitar, plant, lego, arm, mars, door, phone]) o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

// soft contact shadows where things meet the floor
for (const [o, w, d, op] of [[plant, 0.55, 0.55, 0.4], [rig, 1.95, 0.9, 0.35], [desk, 1.6, 0.85, 0.3], [arm, 1.1, 0.72, 0.32], [guitar, 0.5, 0.5, 0.3]]) {
  const s = blob(w, d, op); s.position.x = o.position.x; s.position.z = o.position.z; s.rotation.z = o.rotation.y; scene.add(s);
}

// the phone sits on the desk's dock
desk.updateMatrixWorld(true);
const dock = desk.getObjectByName('phoneDock');
if (dock) { dock.matrixWorld.decompose(phone.position, phone.quaternion, phone.scale); phone.scale.setScalar(1); }
scene.add(phone);
function aim(id, look, offset) { STATIONS[id].view = { look: look.toArray(), pos: look.clone().add(new THREE.Vector3(...offset)).toArray() }; }
const phonePos = phone.getWorldPosition(new THREE.Vector3());
aim('spareme', phonePos, [-0.07, 0.09, -0.3]);
const monitor = desk.getObjectByName('screen');
const monitorPos = monitor ? monitor.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(1.8, 1.09, Z1 - 0.2);
aim('silk', monitorPos, [0, 0.06, -0.78]);
// the engine itself (not the vacuum beside it) is what the camera frames
const engineBox = new THREE.Box3();
lego.updateMatrixWorld(true);
lego.traverse(o => { if (o.isMesh) { let p = o, inVac = false; while (p && p !== lego) { if (p.name === 'vacuum') inVac = true; p = p.parent; } if (!inVac) engineBox.expandByObject(o); } });
const enginePos = engineBox.isEmpty() ? onWall(WINDOW.wall, WINDOW.u, WINDOW.y0 + 0.08, 0.22) : engineBox.getCenter(new THREE.Vector3());
aim('engine', enginePos.clone().add(new THREE.Vector3(0, 0.07, 0)), [-0.5, 0.08, 0.14]);   // eye level with the ledge: the Bell Tower stands in the window behind it

// ------------------------------------------------------------------ screens (canvases redrawn as their story plays)
const sysFont = 'system-ui, -apple-system, "Helvetica Neue", Archivo, Arial, sans-serif';
const monoFont = '"JetBrains Mono", ui-monospace, Menlo, monospace';
function canvasTex(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return { c, g: c.getContext('2d'), t }; }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function wrapLines(g, text, maxW) { const out = []; let line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }

// PC: Silk in a terminal, beside its live-relay status window
const SILK_LINES = [
  ['$ ', 'silk request @maya-codex --note "Coordinate the launch?"'],
  ['  ', 'postage paid · waiting for her owner to say yes'],
  ['$ ', 'silk inbox --wait 20'],
  ['✓ ', '@maya-codex accepted · 50 msgs · 7 days'],
  ['  ', 'ML-KEM-768 + X25519 handshake · ratchet on'],
  ['← ', '@maya-codex: "Draft is ready for review"'],
  ['$ ', 'silk send @maya-codex "On it."'],
  ['  ', 'sealed · relayed · receipt on the ledger'],
  ['$ ', 'silk audit'],
  ['✓ ', 'inclusion proofs verified'],
];
const silkScreen = canvasTex(1600, 900);
function drawSilk(n, cursor = false) {
  const { g, t } = silkScreen;
  const bg = g.createLinearGradient(0, 0, 1600, 900); bg.addColorStop(0, '#1d2433'); bg.addColorStop(1, '#2b1f2e');
  g.fillStyle = bg; g.fillRect(0, 0, 1600, 900);
  g.fillStyle = 'rgba(20,22,28,.85)'; g.fillRect(0, 0, 1600, 34);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `600 19px ${sysFont}`; g.textBaseline = 'middle'; g.fillText('  Terminal    Shell    Edit    View', 18, 17);
  g.textAlign = 'right'; g.fillText('Tue 4:20 PM', 1580, 17); g.textAlign = 'left';
  // terminal window
  g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 40; g.shadowOffsetY = 14;
  g.fillStyle = '#121418'; rrect(g, 50, 70, 1010, 790, 16); g.fill(); g.restore();
  g.fillStyle = '#23262d'; rrect(g, 50, 70, 1010, 44, [16, 16, 0, 0]); g.fill();
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(80 + i * 26, 92, 8, 0, 7); g.fill(); });
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `500 18px ${sysFont}`; g.textAlign = 'center'; g.fillText('nirav — silk — 96×30', 555, 92); g.textAlign = 'left';
  g.font = `500 30px ${monoFont}`;
  let y = 160;
  for (let i = 0; i < Math.min(n, SILK_LINES.length); i++) {
    const [p, s] = SILK_LINES[i];
    g.fillStyle = p === '$ ' ? '#7ee787' : p === '✓ ' ? '#7ee787' : p === '← ' ? '#79c0ff' : '#8b949e';
    g.fillText(p, 74, y);
    g.fillStyle = p === '$ ' ? '#e6edf3' : p === '← ' ? '#cfe6ff' : '#a9b1ba';
    for (const l of wrapLines(g, s, 900)) { g.fillText(l, 120, y); y += 42; }
    if (p === '$ ' || i === SILK_LINES.length - 1) y += 8;
  }
  if (n < SILK_LINES.length + 1 && cursor) { g.fillStyle = '#e6edf3'; g.fillRect(120, y - 17, 16, 32); }
  // status window
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 40; g.shadowOffsetY = 14;
  g.fillStyle = '#f6f4ef'; rrect(g, 1100, 110, 450, 560, 16); g.fill(); g.restore();
  g.fillStyle = '#1b1d22'; g.font = `300 86px Archivo, ${sysFont}`; g.fillText('Silk', 1136, 196);
  g.fillStyle = '#2fbf6f'; g.beginPath(); g.arc(1145, 252, 8, 0, 7); g.fill();
  g.fillStyle = '#3a3d44'; g.font = `600 20px ${sysFont}`; g.fillText('Live relay · v2', 1164, 253);
  const rows = [['Consent', 'owner says yes first'], ['Encryption', 'ML-KEM-768 + X25519'], ['Ledger', 'public, tamper-evident'], ['Spam', 'proof-of-work postage']];
  g.font = `500 19px ${sysFont}`;
  rows.forEach(([k, v], i) => { const yy = 312 + i * 48; g.fillStyle = '#8a8d94'; g.fillText(k, 1136, yy); g.fillStyle = '#1b1d22'; g.fillText(v, 1272, yy); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(1136, yy + 20, 380, 1); });
  g.fillStyle = '#8a8d94'; g.font = `500 17px ${sysFont}`; g.fillText('Messages / s, 16 clients', 1136, 528);
  g.fillStyle = '#2f8fe0'; g.fillRect(1136, 548, 360, 30); g.fillStyle = '#d9643a'; g.fillRect(1136, 590, 360 * 492 / 7825, 30);
  g.fillStyle = '#fff'; g.font = `700 17px ${sysFont}`; g.fillText('v2 (Go) 7,825', 1146, 564);
  g.fillStyle = '#3a3d44'; g.fillText('v1 492', 1136 + 360 * 492 / 7825 + 10, 606);
  t.needsUpdate = true;
}
if (monitor) {
  drawSilk(0);
  monitor.material = new THREE.MeshBasicMaterial({ map: silkScreen.t, toneMapped: false, color: 0xd8d8d8 });
  const glow = new THREE.SpotLight(0xc8d4ff, 0.8, 2.2, 1.2, 1, 2);   // the screen's spill onto the desk
  glow.position.set(0, 0, 0.03); glow.target.position.set(0, -0.35, 1);   // out of the screen (+Z) and down
  monitor.add(glow, glow.target);
}

// iPhone: SpareMe on a live call, the transcript filling in
const SPARE_LINES = [
  ['rep', 'Thanks for holding. How can I help you today?'],
  ['ai', "Hi, I'm calling on behalf of Nirav about this month's bill. It went up by $20."],
  ['rep', 'I see a promotion ended. I can add a new one for 12 months.'],
  ['ai', 'That works. Can you confirm the new monthly total?'],
  ['rep', "It's back to the original rate, starting next cycle."],
];
const pW = mFix.PHONE_SCREEN?.w || 0.0655, pH = mFix.PHONE_SCREEN?.h || 0.142;
const spare = canvasTex(600, Math.round(600 * pH / pW));
function drawSpare(n, holdSec) {
  const { g, c, t } = spare, W = c.width, H = c.height;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d1430'); bg.addColorStop(1, '#05070f');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.font = `600 30px ${sysFont}`; g.textBaseline = 'middle'; g.fillText('9:41', 56, 58);
  g.textAlign = 'right'; g.font = `600 24px ${sysFont}`; g.fillText('5G  ▮▮▮▮', W - 50, 58); g.textAlign = 'left';
  g.font = `700 46px ${sysFont}`; g.fillText('SpareMe', 40, 160);
  g.fillStyle = 'rgba(255,255,255,.1)'; rrect(g, 32, 200, W - 64, 132, 26); g.fill();
  g.fillStyle = '#3ddc84'; g.beginPath(); g.arc(68, 240, 9, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.62)'; g.font = `600 22px ${sysFont}`; g.fillText('ON THE CALL · BILLING', 88, 241);
  g.fillStyle = '#fff'; g.font = `600 34px ${sysFont}`;
  const mm = String(Math.floor(holdSec / 60)).padStart(1, '0'), ss = String(Math.floor(holdSec % 60)).padStart(2, '0');
  g.fillText(n === 0 ? `On hold · ${mm}:${ss}` : 'Talking with a rep', 56, 292);
  let y = 380;
  g.font = `500 25px ${sysFont}`;
  for (let i = 0; i < Math.min(n, SPARE_LINES.length); i++) {
    const [who, s] = SPARE_LINES[i], ai = who === 'ai';
    const lines = wrapLines(g, s, W - 190), bh = lines.length * 34 + 30, bw = Math.max(...lines.map(l => g.measureText(l).width)) + 44;
    const x = ai ? W - 32 - bw : 32;
    g.fillStyle = ai ? '#3b6cf6' : 'rgba(255,255,255,.12)'; rrect(g, x, y, bw, bh, 24); g.fill();
    g.fillStyle = '#fff'; lines.forEach((l, k) => g.fillText(l, x + 22, y + 32 + k * 34));
    y += bh + 16;
  }
  const btns = ['Listen in', 'Type', 'Take over'], bw = (W - 64 - 24) / 3;
  btns.forEach((b, i) => {
    const x = 32 + i * (bw + 12), yy = H - 170;
    g.fillStyle = i === 2 ? '#fff' : 'rgba(255,255,255,.14)'; rrect(g, x, yy, bw, 84, 42); g.fill();
    g.fillStyle = i === 2 ? '#0d1430' : '#fff'; g.font = `600 25px ${sysFont}`; g.textAlign = 'center'; g.fillText(b, x + bw / 2, yy + 43); g.textAlign = 'left';
  });
  g.fillStyle = 'rgba(255,255,255,.5)'; rrect(g, W / 2 - 80, H - 30, 160, 8, 4); g.fill();
  t.needsUpdate = true;
}
const phoneScreen = phone.getObjectByName('screen');
if (phoneScreen) { drawSpare(0, 754); phoneScreen.material = new THREE.MeshBasicMaterial({ map: spare.t, toneMapped: false, color: 0xd6d6d6 }); }

// arm sim: the instruction it was given and the point it chose
const armScreenMesh = arm.getObjectByName('armScreen');
const armScreen = canvasTex(800, 500);
function drawArm(label, p, stage) {
  const { g, t } = armScreen;
  g.fillStyle = '#0f1115'; g.fillRect(0, 0, 800, 500);
  g.fillStyle = '#8b949e'; g.font = `500 24px ${monoFont}`; g.textBaseline = 'middle';
  g.fillText('robot-arm-sim · SO-101 · MuJoCo', 34, 44);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(34, 72, 732, 1);
  g.fillStyle = '#8b949e'; g.font = `500 22px ${monoFont}`; g.fillText('INSTRUCTION', 34, 112);
  g.fillStyle = '#f2f2ee'; g.font = `400 46px Archivo, ${sysFont}`;
  const shown = stage === 0 ? label.slice(0, Math.max(1, Math.round(label.length * 0.6))) : label;
  g.fillText('“' + shown + (stage === 0 ? '' : '”'), 34, 170);
  if (stage >= 1 && p) {
    g.fillStyle = '#8b949e'; g.font = `500 22px ${monoFont}`; g.fillText('TARGET · BASE FRAME (m)', 34, 252);
    g.fillStyle = '#7ee787'; g.font = `500 32px ${monoFont}`;
    // bench frame → the arm's base frame (MuJoCo: x forward, y left, z up; base at [0, 0.7626, -0.22], see armsim.js)
    const b = [p[2] + 0.22, p[0], p[1] - 0.7626];
    g.fillText(`x ${b[0].toFixed(3)}   y ${b[1].toFixed(3)}   z ${b[2].toFixed(3)}`, 34, 300);
  }
  g.fillStyle = stage >= 2 ? '#7ee787' : '#d29922'; g.font = `500 24px ${monoFont}`;
  g.fillText(stage === 0 ? '● reading stereo pair…' : stage === 1 ? '● solving IK · moving' : '✓ hovering over target', 34, 380);
  g.fillStyle = '#8b949e'; g.font = `500 20px ${monoFont}`; g.fillText('head stereo 7.5 cm baseline · wrist cam · joints', 34, 450);
  t.needsUpdate = true;
}
if (armScreenMesh) { drawArm('the red cube', null, 0); armScreenMesh.material = new THREE.MeshBasicMaterial({ map: armScreen.t, toneMapped: false, color: 0xd8d8d8 }); }

// pinboard cards (the "more projects" teaser)
pinCards(shell.pinboard, [
  { note: 'Learn about my project that hit 30k users in a month', x: -0.52, y: 0.2, r: -0.05 },
  { src: 'img/room/shot-khali.webp', title: 'Khali', x: -0.02, y: 0.36, r: 0.04, dark: true },
  { src: 'img/room/shot-chad.webp', title: 'Chad vs. Chud', x: 0.5, y: 0.3, r: -0.06, dark: true },
  { src: 'img/room/motor-worn.webp', title: 'Resistance trainer', x: -0.06, y: -0.36, r: -0.03 },
  { src: 'img/room/shot-oh.webp', title: 'Oh', x: 0.44, y: -0.34, r: 0.05, dark: true },
]);
progress('Pinning projects');

// ------------------------------------------------------------------ MARSChair: capture, push, place, release, return
// The robot pushes only forward, turning on a 1.5 m arc (it never turns in place or reverses with a chair);
// it backs up only when empty. Robot-origin path: from staging in front of the first wall, right along it, a 90°
// right arc on that radius, then straight to the desk, where the chair's seat tucks under the desktop. The route
// clears the FTC tiles, the arm bench and the window ledge, and keeps 1.5 m from where visitors stand.
const MARS = (() => {
  const robotG = mars.getObjectByName('robot') || mars, chairG = mars.getObjectByName('chair');
  const seat = mMars.CHAIR_SEATED || { position: [0, 0, 0.62], yaw: 0 };
  const R = 1.5, BACK = 0.5, APPROACH = 0.45;
  const S = new THREE.Vector2(-0.65, -1.05), P1 = new THREE.Vector2(0.3, -1.05);   // staging, and where the turn starts
  const C = new THREE.Vector2(P1.x, P1.y + R), P2 = new THREE.Vector2(C.x + R, C.y);   // the arc's centre (to the robot's right), and its end
  desk.updateMatrixWorld(true);
  const deskFront = new THREE.Box3().setFromObject(desk).min.z;
  const L1 = P1.x - S.x, LA = R * Math.PI / 2, L2 = deskFront + 0.25 - 0.265 - seat.position[2] - P2.y, L = L1 + LA + L2;   // seat 25 cm under the desk
  function pose(s) {   // → [x, z, heading (rotation.y): π/2 drives +x, 0 drives +z, a right turn lowers it]
    if (s <= L1) return [S.x + s, S.y, Math.PI / 2];
    if (s <= L1 + LA) { const h = Math.PI / 2 - (s - L1) / R; return [C.x + R * Math.cos(h), C.y - R * Math.sin(h), h]; }
    return [P2.x, P2.y + (s - L1 - LA), 0];
  }
  // floor markings: staging tape, the planned chair path, and the target outline (turns green when placed)
  const sp = new THREE.Vector3(...seat.position);
  const chairAt = s => { const [x, z, h] = pose(s); const o = sp.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), h); return [x + o.x, z + o.z, h + (seat.yaw || 0)]; };
  const box2 = { x0: -1.6, x1: 2.6, z0: -1.7, z1: 2.4 }, PX = 200;
  const c = document.createElement('canvas'); c.width = Math.round((box2.x1 - box2.x0) * PX); c.height = Math.round((box2.z1 - box2.z0) * PX);
  const g = c.getContext('2d'); const toC = (x, z) => [(x - box2.x0) * PX, (z - box2.z0) * PX];
  g.setLineDash([22, 16]); g.lineWidth = 5; g.strokeStyle = 'rgba(47,143,224,.75)'; g.beginPath();
  for (let s = 0; s <= L; s += 0.02) { const [x, z] = chairAt(s); const [u, v] = toC(x, z); s === 0 ? g.moveTo(u, v) : g.lineTo(u, v); }
  g.stroke(); g.setLineDash([]);
  const tapeRect = (x, z, h, w, d, color, dash) => {
    const [u, v] = toC(x, z); g.save(); g.translate(u, v); g.rotate(-h);
    g.strokeStyle = color; g.lineWidth = 12; if (dash) g.setLineDash(dash); g.strokeRect(-w * PX / 2, -d * PX / 2, w * PX, d * PX); g.restore();
  };
  const [sx, sz, sh] = chairAt(0);
  tapeRect(sx, sz, sh, 0.9, 1.0, 'rgba(242,190,40,.95)');
  { const [u, v] = toC(sx, sz + 0.6); g.fillStyle = 'rgba(40,36,30,.62)'; g.font = `600 34px ${monoFont}`; g.textAlign = 'center'; g.fillText('STAGING', u, v); }
  { const [u, v] = toC(sx + 0.25, sz - 0.66); g.fillStyle = 'rgba(47,110,200,.78)'; g.font = `600 19px ${monoFont}`; g.textAlign = 'center';
    g.fillText('GHOSTS: OTHER RANDOMIZED RUNS', u, v); g.fillText('±30% FRICTION · MASS · CENTER OF MASS', u, v + 24); }
  const marks = new THREE.Mesh(new THREE.PlaneGeometry(box2.x1 - box2.x0, box2.z1 - box2.z0), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, roughness: 0.6, depthWrite: false }));
  marks.material.map.colorSpace = THREE.SRGBColorSpace; marks.material.map.anisotropy = 8;
  marks.rotation.x = -Math.PI / 2; marks.position.set((box2.x0 + box2.x1) / 2, 0.003, (box2.z0 + box2.z1) / 2); marks.renderOrder = 1; scene.add(marks);
  // target outline as its own decal, so it can change colour
  const tc = document.createElement('canvas'); tc.width = 360; tc.height = 420; const tg = tc.getContext('2d');
  const tTex = new THREE.CanvasTexture(tc); tTex.colorSpace = THREE.SRGBColorSpace;
  function drawTarget(done) {
    tg.clearRect(0, 0, 360, 420); const col = done ? '#2fbf6f' : 'rgba(255,255,255,.95)';
    tg.strokeStyle = col; tg.lineWidth = 8; tg.setLineDash([26, 14]); tg.strokeRect(30, 30, 300, 300); tg.setLineDash([]);
    tg.lineWidth = 6; tg.beginPath(); tg.moveTo(180, 150); tg.lineTo(180, 210); tg.moveTo(150, 180); tg.lineTo(210, 180); tg.stroke();
    tg.fillStyle = done ? '#2fbf6f' : 'rgba(40,36,30,.72)'; tg.font = `600 30px ${monoFont}`; tg.textAlign = 'center';
    tg.fillText(done ? 'PLACED ✓' : 'TARGET ±5 cm', 180, 384);
    tTex.needsUpdate = true;
  }
  drawTarget(false);
  const [tx, tz, th] = chairAt(L);
  const target = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.875), new THREE.MeshStandardMaterial({ map: tTex, transparent: true, roughness: 0.6, depthWrite: false }));
  target.rotation.set(-Math.PI / 2, 0, th + Math.PI); target.position.set(tx, 0.004, tz); target.renderOrder = 2; scene.add(target);
  // contact shadows that ride along
  const rShadow = blob(0.75, 0.8, 0.4), cShadow = blob(0.7, 0.75, 0.32); scene.add(rShadow, cShadow);
  // the chair fades between runs: give it its own materials
  const chairMats = [];
  chairG?.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.transparent = true; chairMats.push(m.material); } });
  const wheels = [robotG.getObjectByName('wheelL'), robotG.getObjectByName('wheelR')];
  const wr = mMars.WHEEL_RADIUS || 0.0603, track = mMars.TRACK_WIDTH || 0.37;
  if (mMars.STOW && mMars.setArm) { mMars.setArm(robotG, 'L', mMars.STOW.L, 0); mMars.setArm(robotG, 'R', mMars.STOW.R, 0); }
  if (chairG && chairG.parent !== scene) scene.attach(chairG);
  // Everything that moves through the window's sunbeam lives on layer 1: the camera, the picker and the station
  // spotlights see it, the sun's shadow doesn't, so that shadow is drawn once and never again (redrawing it every
  // frame cost Chrome 20+ ms a frame).
  for (const root of [mars, chairG]) root?.traverse(o => o.layers.set(1));
  // Ghosts: other runs of the same delivery with the physics randomized (±30% friction, mass and center of mass,
  // as in the acceptance tests), each on a slightly different line and at its own pace, all landing inside the
  // target. They ride along during the push as light silhouettes: the robot's base and frame, the chair's seat.
  function silhouette(root, keep) {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), gs = [];
    root.traverse(o => {
      if (!o.isMesh || !keep(o)) return;
      for (let p = o.parent; p && p !== root; p = p.parent) if (/^arm/i.test(p.name)) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      gs.push(g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
    });
    return gs.length ? mergeGeometries(gs) : null;
  }
  const ghostRobot = silhouette(robotG, o => /:(plasticGrey|aluminum)$/.test(o.name)), ghostChair = chairG && silhouette(chairG, o => /:plasticGrey$/.test(o.name));
  // [mid-route sway (m, + = inside the turn), sway frequency, phase, landing offset (m), pace]; cleared against
  // the tiles, the benches and the ledge, and kept 1.4 m from where visitors stand
  const GHOST = [[0.2, 0.8, 0.3, 0.02, 0.8], [0.1, 1.3, 1.9, -0.02, 1.12], [-0.03, 0.7, 4.2, -0.015, 1.25], [0.15, 1.0, 5.3, 0.03, 0.9]].slice(0, tier === 'high' ? 4 : 2);
  const ghosts = ghostRobot ? GHOST.map(g => {
    const m = new THREE.MeshStandardMaterial({ color: 0x8dbaff, emissive: 0x1f56b8, emissiveIntensity: 0.55, roughness: 0.55, transparent: true, opacity: 0, depthWrite: false });
    const r = new THREE.Mesh(ghostRobot, m), c = ghostChair ? new THREE.Mesh(ghostChair, m) : null;
    r.layers.set(1); c?.layers.set(1);
    r.visible = false; scene.add(r); if (c) { c.visible = false; scene.add(c); }
    return { g, m, r, c };
  }) : [];
  const sway = (g, u) => g[0] * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(2 * Math.PI * g[1] * u + g[2])) + g[3] * u * u;
  function ghostsAt(tp) {   // tp: seconds since the push began (negative: not yet)
    for (const { g, m, r, c } of ghosts) {
      const dur = T.push / g[4], k = tp / dur, op = tp < 0 || k > 1.4 ? 0 : 0.34 * Math.min(1, tp / 0.6) * (k < 1 ? 1 : Math.max(0, 1 - (k - 1) / 0.35));
      r.visible = op > 0.005; if (c) c.visible = r.visible; m.opacity = op;
      if (!r.visible) continue;
      const u = easeIO(Math.min(1, k)), s = L * u, [x, z, h] = pose(s), o = sway(g, u);
      const slope = (sway(g, Math.min(1, u + 1e-3)) - sway(g, Math.max(0, u - 1e-3))) / (2e-3 * L);
      const gx = x - Math.cos(h) * o, gz = z + Math.sin(h) * o, gh = h - Math.atan(slope);   // offset to the robot's right, turned to match
      r.position.set(gx, robotG.position.y, gz); r.rotation.y = gh;
      if (c) { const oo = sp.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), gh); c.position.set(gx + oo.x, chairG.position.y, gz + oo.z); c.rotation.y = gh + (seat.yaw || 0); }
    }
  }
  const easeIO = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  // timeline (seconds): approach, push, verify, back off, return
  const T = { approach: 3.2, push: L / 0.26, verify: 1.6, back: 2.6, ret: (L + APPROACH - BACK) / 0.5 + 0.8, pause: 0.8 };
  const TOTAL = Object.values(T).reduce((a, b) => a + b, 0);
  let last = null, placed = false;
  function place(obj, x, z, h) { obj.position.set(x, obj.position.y, z); obj.rotation.y = h; }
  function update(time) {
    let t = time % TOTAL, s, chairS = 0, fade = 1, isPlaced = false;
    if ((t -= T.approach) < 0) { s = -APPROACH * (1 - easeIO(1 + t / T.approach)); }
    else if ((t -= T.push) < 0) { s = chairS = L * easeIO(1 + t / T.push); }
    else if ((t -= T.verify) < 0) { s = chairS = L; isPlaced = true; }
    else if ((t -= T.back) < 0) { s = L - BACK * easeIO(1 + t / T.back); chairS = L; isPlaced = true; }
    else if ((t -= T.ret) < 0) { const k = 1 + t / T.ret; s = (L - BACK) - (L - BACK + APPROACH) * easeIO(k); chairS = L; fade = Math.min(1, (1 - k) / 0.15); isPlaced = fade > 0.5; }
    else { s = -APPROACH; fade = Math.min(1, (T.pause + t) / T.pause); }
    const [x, z, h] = pose(Math.max(0, s));
    const back = Math.min(0, s);   // the stretch behind the start line
    place(robotG, x + Math.sin(h) * back, z + Math.cos(h) * back, h);
    rShadow.position.set(robotG.position.x, 0.002, robotG.position.z); rShadow.rotation.z = h;
    if (chairG) {
      const [cx, cz, ch] = chairAt(chairS);
      place(chairG, cx, cz, ch); cShadow.position.set(cx, 0.002, cz); cShadow.rotation.z = ch;
      for (const m of chairMats) m.opacity = fade;
      chairG.visible = fade > 0.01; cShadow.material.opacity = 0.32 * fade;
    }
    ghostsAt((time % TOTAL) - T.approach);
    if (isPlaced !== placed) { placed = isPlaced; drawTarget(placed); }
    if (last) {
      const ds = robotG.position.distanceTo(last.p) * Math.sign(s - last.s || 0), dh = h - last.h;
      wheels.forEach((w, i) => { if (w) w.rotation.x += (ds + (i ? 1 : -1) * dh * track / 2) / wr; });
    }
    last = { p: robotG.position.clone(), s, h };
  }
  update(0);
  return { update, anchor: new THREE.Vector3(), robot: robotG, chair: chairG };
})();

// ------------------------------------------------------------------ arm sim: instruction → 3D point → IK → hover
const ARM = (() => {
  const targets = mArm.TARGETS || [];
  if (!mArm.solveIK || !mArm.setJoints || !targets.length) return { update() {} };
  const home = mArm.HOME || { pan: 0, lift: 0, elbow: 0, wflex: 0, wroll: 0, grip: 0 };
  const keys = ['pan', 'lift', 'elbow', 'wflex', 'wroll'];
  const goals = targets.map(tg => ({ ...mArm.solveIK(arm, tg.position, 0.05), grip: 0.5 }));
  // a small ring on the table marks the point the model chose
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x2fbf6f, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 40), ringMat); ring.rotation.x = -Math.PI / 2; arm.add(ring);
  const lerpPose = (a, b, k) => { const o = {}; for (const key of [...keys, 'grip']) o[key] = (a[key] ?? 0) + ((b[key] ?? 0) - (a[key] ?? 0)) * k; return o; };
  const easeIO = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const STEP = 5.2;   // seconds per target: read 1.2, move 1.8, hover 2.2
  let lastStage = -1, lastIdx = -1;
  function update(time) {
    const n = Math.floor(time / STEP), i = n % targets.length, t = time - n * STEP;
    const from = n === 0 ? home : goals[(n - 1) % targets.length], to = goals[i];
    const stage = t < 1.2 ? 0 : t < 3.0 ? 1 : 2;
    const k = stage === 0 ? 0 : stage === 1 ? easeIO((t - 1.2) / 1.8) : 1;
    mArm.setJoints(arm, lerpPose(from, to, k));
    const p = targets[i].position;
    ring.position.set(p[0], (mArm.TABLE_TOP ?? 0.76) + 0.0015, p[2]);
    ringMat.opacity = stage === 0 ? 0 : Math.min(1, (t - 1.2) / 0.3) * 0.9;
    if (stage !== lastStage || i !== lastIdx) { lastStage = stage; lastIdx = i; if (armScreenMesh) drawArm(targets[i].label, p, stage); }
  }
  return { update };
})();

// ------------------------------------------------------------------ LEGO engine
const ENGINE = { theta: 0, rate: Math.PI * 2 * 2.2 };

// ------------------------------------------------------------------ the door
// the leaf swings on its hinge (DOOR.openSign takes it into the room); the lever turns about its spindle (+Z dips it)
const DOOR = { amt: 0, to: 0, leaf: door.getObjectByName('doorLeaf'), handle: door.getObjectByName('doorHandle'), sign: mFix.DOOR?.openSign || 1, dip: 0.55, axis: 'z' };
function updateDoor(dt) {
  const prev = DOOR.amt;
  DOOR.amt += Math.sign(DOOR.to - DOOR.amt) * Math.min(Math.abs(DOOR.to - DOOR.amt), dt / (DOOR.to ? 1.5 : 1.0));
  const k = DOOR.amt, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  if (DOOR.leaf) DOOR.leaf.rotation.y = DOOR.sign * 1.62 * e;
  if (DOOR.handle) DOOR.handle.rotation[DOOR.axis] = DOOR.dip * Math.sin(Math.min(1, k / 0.35) * Math.PI);   // the lever dips as the latch lets go
  if (prev !== DOOR.amt || DOOR.amt > 0) {
    shell.door.glow.intensity = 7.5 * e;
    shell.door.patchMat.opacity = 0.42 * e;
    shell.door.outsideMat.color.setScalar(1.1 + 2.3 * e);   // bright enough to bloom once it's open
  }
}

// ------------------------------------------------------------------ live flow on the wall display
let sim = null, flowTex = null, flowCond = 'both';
try {
  sim = new window.Wake($('#flowCanvas'), { mode: 1, preserveDrawingBuffer: reduce, maxFPS: tier === 'high' ? 60 : 30, fixed: [1050, 400], cells: tier === 'high' ? 62000 : 36000, cyl: [0.17, 0.5], d: 0.15, re: 150, fin: { x: 4.2, chord: 1.5 }, decay: 0.9985 });
  flowTex = new THREE.CanvasTexture($('#flowCanvas'));
  flowTex.colorSpace = THREE.SRGBColorSpace; flowTex.wrapS = THREE.RepeatWrapping;
  flowTex.repeat.x = -1; flowTex.offset.x = 1;   // mirror so the on-wall flow runs the same way as the rig beneath it
  shell.flowScreen.material = new THREE.MeshBasicMaterial({ map: flowTex, toneMapped: false, color: 0xe6e6e6 });
  if (reduce) sim.tick(performance.now());   // a still frame, also for visitors who disable animation
  $('#flowCanvas').addEventListener('webglcontextrestored', () => {
    if (reduce) sim.tick(performance.now());
    flowTex.needsUpdate = true;
  });
} catch (e) { console.warn('flow sim unavailable', e); }
function setCondition(c) {
  flowCond = c;
  $$('[data-cond]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cond === c)));
  if (sim) {
    sim.setObstacles(c !== 'fin', c !== 'cyl');
    if (reduce && !sim.lost) { sim.tick(performance.now()); flowTex.needsUpdate = true; }
  }
}
$$('[data-cond]').forEach(b => b.addEventListener('click', () => setCondition(b.dataset.cond)));
progress('Starting the flow');

// ------------------------------------------------------------------ station registry: hit targets + label anchors
const hitRoots = {
  research: [rig, shell.flowScreen], marschair: [mars, ...(MARS.chair ? [MARS.chair] : [])], armsim: [arm], robotics: [robot], engine: [lego, shell.ledge],
  silk: [desk], spareme: [phone], more: [shell.pinboard.group], about: [shell.aboutWall], guitar: [guitar], contact: [door],
};
const anchors = {
  ...shell.anchors,
  marschair: MARS.anchor,
  armsim: onWall('back', -1.9, 1.3, 0.45),
  engine: enginePos.clone().add(new THREE.Vector3(0, 0.2, 0)),
  spareme: phonePos.clone().add(new THREE.Vector3(0, 0.12, -0.04)),
  silk: monitorPos.clone().add(new THREE.Vector3(0.2, 0.27, -0.05)),
  guitar: new THREE.Vector3(-1.3, 1.2, 2.4),
};
const hitList = [], meshToStation = new Map();
for (const [id, roots] of Object.entries(hitRoots)) for (const r of roots) r.traverse(o => { if (o.isMesh) { if (!meshToStation.has(o)) hitList.push(o); meshToStation.set(o, id); } });

// number the stations in dock order, and build the floating labels
const ids = Object.keys(STATIONS);
ids.forEach((id, i) => { STATIONS[id].n = String(i + 1).padStart(2, '0'); });
const hotspots = $('#hotspots');
const hsEls = {};
for (const [id, s] of Object.entries(STATIONS)) {
  const b = document.createElement('button');
  b.className = 'hs ' + (s.disc || ''); b.type = 'button'; b.dataset.st = id;
  b.innerHTML = `<i></i><span><b><em>${s.n}</em>${s.label}</b><small>${s.sub}</small></span>`;
  b.addEventListener('click', () => openStation(id));
  hotspots.appendChild(b); hsEls[id] = b;
}

// ------------------------------------------------------------------ camera: look around from the middle of the room
const look = { yaw: HOME.yaw, pitch: HOME.pitch, vy: 0, vp: 0 };
const cam = { pos: HOME.pos.clone(), target: new THREE.Vector3(), mode: 'home', station: null, off: new THREE.Vector2(), offTarget: new THREE.Vector2() };
let intro = null;   // the opening pan: from 01 on the left toward the middle, the way the numbers run
let nowMs = 0;      // the loop's own clock, so flights can be stepped by hand too
let flight = null;   // { from, to, fromT, toT, t0, dur }
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function dirFrom(yaw, pitch, out = new THREE.Vector3()) { return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }
function homeTarget() { return HOME.pos.clone().add(dirFrom(look.yaw, look.pitch)); }
function fly(toPos, toLook, dur = 1.25) {
  const fromLook = cam.target.clone();
  flight = { from: camera.position.clone(), to: toPos.clone(), fromT: fromLook, toT: toLook.clone(), t0: nowMs, dur: reduce ? 0.001 : dur * 1000 };
}

// pointer: drag to look (home), click to open
let drag = null, pointer = new THREE.Vector2(-9, -9), pointerMoved = false;
canvas.addEventListener('pointerdown', e => {
  intro = null;
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); pointerMoved = true;
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (cam.mode === 'home') {
    const k = (coarse ? 0.0055 : 0.0038) * (camera.fov / 60);
    look.vy = -dx * k; look.vp = dy * k;
    look.yaw += look.vy; look.pitch = THREE.MathUtils.clamp(look.pitch + look.vp, -0.6, 0.5);
    document.body.classList.add('looked');
  }
});
canvas.addEventListener('pointerup', e => {
  if (!drag) return;
  const click = drag.moved < 7 && performance.now() - drag.t < 600;
  drag = null;
  if (click) {
    const id = pick(e.clientX, e.clientY);
    if (id) openStation(id); else if (cam.mode === 'station') closeStation();
  }
});
canvas.addEventListener('pointerleave', () => { pointer.set(-9, -9); });

const ray = new THREE.Raycaster(); ray.layers.enable(1);
function pick(x, y) {
  ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const h = ray.intersectObjects(hitList, false)[0];
  return h ? meshToStation.get(h.object) : null;
}

addEventListener('keydown', e => {
  if (document.body.classList.contains('list') || e.target.closest('input,textarea') || $('#lb').classList.contains('open')) return;
  if (e.key === 'Escape') closeStation();
  if (cam.mode === 'home' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { look.vy = (e.key === 'ArrowLeft' ? 1 : -1) * 0.06; }
  else if (cam.mode === 'station' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); stepTour(e.key === 'ArrowRight' ? 1 : -1); }
  const i = e.key === '0' ? 9 : +e.key - 1;
  if (!e.metaKey && !e.ctrlKey && i >= 0 && i < ids.length && !e.target.closest('#panel')) openStation(ids[i]);
});

// ------------------------------------------------------------------ panels
const panel = $('#panel'), pscroll = $('#pscroll');
let homeLook = null;
// Wide screens (and phones held sideways) get a side panel; portrait phones get a bottom sheet.
function sideMode() { return innerWidth >= 900 || innerWidth > innerHeight; }
function panelWidth() { return sideMode() ? $('#panel').offsetWidth : 0; }   // matches the CSS width at every breakpoint
function sheetFrac() { return sideMode() ? 0 : 0.58; }
function viewOffset() { return cam.offTarget.set(panelWidth() / 2, sheetFrac() * innerHeight / 2); }
function stationPose(s) {
  const look = new THREE.Vector3(...s.view.look), dir = new THREE.Vector3(...s.view.pos).sub(look);
  const base = dir.length(); dir.normalize();
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const needW = (s.fit[0] / 2) / (t * camera.aspect * (1 - panelWidth() / innerWidth));
  const needH = (s.fit[1] / 2) / (t * (1 - sheetFrac()));
  let d = Math.max(base, needW, needH);
  const lim = { x: [X0 + 0.12, X1 - 0.12], y: [0.3, ROOM.H - 0.15], z: [Z0 + 0.12, Z1 - 0.12] };   // never back through a wall
  for (const k of ['x', 'y', 'z']) { const v = dir[k]; if (Math.abs(v) > 1e-4) { const m = ((v > 0 ? lim[k][1] : lim[k][0]) - look[k]) / v; if (m > 0) d = Math.min(d, m); } }
  return { pos: look.clone().addScaledVector(dir, d), look };
}
function openStation(id) {
  const s = STATIONS[id]; if (!s) return;
  if (document.body.classList.contains('list')) { $('#p-' + id)?.scrollIntoView(); return; }
  if (cam.mode === 'home') homeLook = { yaw: look.yaw, pitch: look.pitch };
  cam.mode = 'station'; cam.station = id;
  intro = null;
  const pose = stationPose(s);
  fly(pose.pos, pose.look);
  DOOR.to = id === 'contact' ? 1 : 0;
  $$('.sec', pscroll).forEach(sec => sec.hidden = sec.id !== 'p-' + id);
  pscroll.scrollTop = 0;
  panel.classList.add('open'); document.body.classList.add('in-station');
  panel.setAttribute('aria-hidden', 'false');
  $$('#dock button').forEach(b => b.classList.toggle('on', b.dataset.st === id));
  viewOffset();
  history.replaceState(null, '', '#' + id);
  outline.selectedObjects = [];
  $$('video', pscroll).forEach(v => { if (!v.closest('#p-' + id)) v.pause(); });
  showPosters($('#p-' + id));
  setTimeout(() => $('#pclose').focus({ preventScroll: true }), 50);
  tour.at = ids.indexOf(id); updateTour();
}
function showPosters(root = pscroll) { $$('video[data-poster]', root).forEach(v => { v.poster = v.dataset.poster; v.removeAttribute('data-poster'); }); }
function closeStation() {
  if (cam.mode !== 'station') return;
  cam.mode = 'home'; cam.station = null;
  DOOR.to = 0;
  if (homeLook) { look.yaw = homeLook.yaw; look.pitch = homeLook.pitch; }
  fly(HOME.pos, homeTarget());
  panel.classList.remove('open'); document.body.classList.remove('in-station');
  panel.setAttribute('aria-hidden', 'true');
  $$('#dock button').forEach(b => b.classList.remove('on'));
  cam.offTarget.set(0, 0);
  history.replaceState(null, '', location.pathname);
  $$('video', pscroll).forEach(v => v.pause());
}
$('#pclose').addEventListener('click', closeStation);

// ------------------------------------------------------------------ the tour: always one clear next step
// From the room, a button over the dock starts it (then offers the next station); every panel has
// previous / next, and the arrow keys walk it too.
const tour = { at: -1, btn: $('#tour'), prev: $('#pprev'), next: $('#pnext'), count: $('#pcount') };
function stepTour(d) { const i = ids.indexOf(cam.station); openStation(ids[((i < 0 ? -1 : i) + d + ids.length) % ids.length]); }
function updateTour() {
  const i = ids.indexOf(cam.station), N = ids.length;
  if (i >= 0) {
    tour.prev.querySelector('span').textContent = STATIONS[ids[(i - 1 + N) % N]].label;
    tour.next.querySelector('span').textContent = i === N - 1 ? 'Back to 01' : 'Next: ' + STATIONS[ids[i + 1]].label;
    tour.count.textContent = STATIONS[ids[i]].n + ' / ' + N;
  }
  const n = (tour.at + 1) % N;
  tour.btn.dataset.st = ids[n];
  tour.btn.innerHTML = tour.at < 0 ? 'Start the tour <span aria-hidden="true">→</span>'
    : tour.at === N - 1 ? 'Take the tour again <span aria-hidden="true">↺</span>'
    : `Next: <b>${STATIONS[ids[n]].n}</b> ${STATIONS[ids[n]].label} <span aria-hidden="true">→</span>`;
}
tour.btn.addEventListener('click', () => openStation(tour.btn.dataset.st));
tour.prev.addEventListener('click', () => stepTour(-1));
tour.next.addEventListener('click', () => stepTour(1));
updateTour();
// in-page hash changes (edited URL, the logo's href="#") open or leave stations too
addEventListener('hashchange', () => { const id = location.hash.slice(1); if (STATIONS[id]) openStation(id); else closeStation(); });
$$('#dock button').forEach(b => b.addEventListener('click', () => openStation(b.dataset.st)));
$$('[data-open]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); if (document.body.classList.contains('list')) { const t = $('#p-' + b.dataset.open); t && t.scrollIntoView({ behavior: 'smooth' }); } else openStation(b.dataset.open); }));

// ------------------------------------------------------------------ resize
function resize() {
  const w = innerWidth, h = innerHeight, d = pickDpr();
  if (d !== renderer.getPixelRatio()) renderer.setPixelRatio(d);
  renderer.setSize(w, h, false); composer.setSize(Math.floor(w * d), Math.floor(h * d));
  camera.aspect = w / h; camera.fov = w < 760 ? 70 : 58; camera.updateProjectionMatrix();
  if (cam.mode === 'station' && !flight) { viewOffset(); const p = stationPose(STATIONS[cam.station]); fly(p.pos, p.look, 0.35); }
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), v3 = new THREE.Vector3();
const parts = {
  fin: rig.getObjectByName('fin'), fan: rig.getObjectByName('fanBlades'),
  turret: robot.getObjectByName('turret'), flywheel: robot.getObjectByName('flywheel'),
  rollers: robot.getObjectByName('intakeRollers'),
};
const sphereOf = o => { const b = new THREE.Box3().setFromObject(o); return b.getBoundingSphere(new THREE.Sphere()); };
const zones = { mars: new THREE.Sphere(new THREE.Vector3(0.6, 0.6, 0.45), 2.3), arm: sphereOf(arm), lego: sphereOf(lego), phone: sphereOf(phone), monitor: monitor ? sphereOf(monitor) : null, rig: sphereOf(rig), robot: sphereOf(robot) };
let hovered = null, hoverAt = 0, flowAt = 0, frames = 0, simTime = 0;
// shadows: the sun's is drawn once; a station spot's shadow redraws only while its station is on screen (high tier)
shell.sun.shadow.needsUpdate = true;
const shadowSpots = [['research', 'rig'], ['robot', 'robot'], ['marschair', 'mars']].map(([l, z]) => [shell.spots[l], zones[z]]).filter(([l]) => l && l.castShadow);
for (const [l] of shadowSpots) { l.shadow.autoUpdate = false; l.shadow.needsUpdate = true; l.shadow.camera.layers.enable(1); }
const screenClock = { silk: -1, spare: -1 };

function frame(dtFixed) {
  if (dtFixed == null) timer.update();
  const dt = dtFixed ?? Math.min(timer.getDelta(), 0.05);
  nowMs += dt * 1000;
  if (!reduce || dtFixed) simTime += dt;
  // camera
  if (flight) {
    const k = Math.min(1, (nowMs - flight.t0) / flight.dur), e = ease(k);
    camera.position.lerpVectors(flight.from, flight.to, e);
    cam.target.lerpVectors(flight.fromT, flight.toT, e);
    if (k >= 1) flight = null;
  } else if (cam.mode === 'home') {
    if (intro) {
      const k = Math.max(0, Math.min(1, (nowMs - intro.t0) / intro.dur));
      look.yaw = intro.from + (intro.to - intro.from) * (1 - Math.pow(1 - k, 3));
      if (k >= 1) intro = null;
    }
    if (!drag && !intro) { look.yaw += look.vy; look.pitch = THREE.MathUtils.clamp(look.pitch + look.vp, -0.6, 0.5); look.vy *= 0.9; look.vp *= 0.9; }
    camera.position.copy(HOME.pos);
    cam.target.copy(homeTarget());
    if (!coarse && !reduce && pointer.x > -2) cam.target.add(v3.set(pointer.x * 0.05, pointer.y * 0.03, 0).applyQuaternion(camera.quaternion));
  }
  camera.lookAt(cam.target);
  cam.off.lerp(cam.offTarget, reduce ? 1 : 0.12);
  if (cam.off.lengthSq() > 0.25) camera.setViewOffset(innerWidth, innerHeight, cam.off.x, cam.off.y, innerWidth, innerHeight); else camera.clearViewOffset();
  camera.updateMatrixWorld();

  pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
  const seen = (sph, id) => cam.station === id || (sph && frustum.intersectsSphere(sph));
  // live flow: only while the display is on screen, or the research panel is open
  if (sim && !sim.lost && !reduce && (frustum.intersectsObject(shell.flowScreen) || cam.station === 'research') && (tier === 'high' || nowMs - flowAt > 30)) {   // phones: 30 Hz is plenty
    flowAt = nowMs;
    sim.tick(performance.now());
    flowTex.needsUpdate = true;
    if (parts.fin) parts.fin.rotation.y = flowCond === 'cyl' ? 0 : sim.finAngle;
  }
  for (const [l, z] of shadowSpots) if (frustum.intersectsSphere(z)) l.shadow.needsUpdate = true;
  if (!reduce || dtFixed) {
    if (parts.fan) parts.fan.rotation.x += dt * 38;
    if (parts.turret) parts.turret.rotation.y = Math.sin(simTime * 0.35) * 0.9;
    if (parts.flywheel) parts.flywheel.rotation.x += dt * 30;
    if (parts.rollers) parts.rollers.rotation.x += dt * 6;
    if (seen(zones.mars, 'marschair')) MARS.update(simTime);
    if (seen(zones.arm, 'armsim')) ARM.update(simTime);
    if (mLego.setCrank && seen(zones.lego, 'engine')) { ENGINE.theta += dt * ENGINE.rate; mLego.setCrank(lego, ENGINE.theta); }
  }
  MARS.anchor.copy(MARS.robot.position).y = 1.45;
  updateDoor(dt);
  // screens tell their story on a loop while they're in view
  if (monitor && seen(zones.monitor, 'silk')) {
    const blink = cam.station === 'silk' ? Math.floor(performance.now() / 500) % 2 : 0;   // the cursor blinks only up close
    const n = Math.min(SILK_LINES.length + 1, Math.floor((simTime % 24) / 1.5)), key = n * 2 + blink;
    if (key !== screenClock.silk) { screenClock.silk = key; drawSilk(n, blink === 1); }
  }
  if (phoneScreen && seen(zones.phone, 'spareme')) {
    const c = simTime % 20, n = Math.max(0, Math.min(SPARE_LINES.length, Math.floor((c - 2.5) / 2.8) + 1)), key = n ? n * 1000 : Math.floor(c);
    if (key !== screenClock.spare) { screenClock.spare = key; drawSpare(n, 754 + c); }
  }

  // hover: outline + cursor
  if (pointerMoved && !drag && !flight && nowMs - hoverAt > 50) {   // raycasts against the detailed models: 20 Hz is enough
    pointerMoved = false; hoverAt = nowMs;
    ray.setFromCamera(pointer, camera);
    const h = pointer.x > -2 ? ray.intersectObjects(hitList, false)[0] : null;
    const id = h ? meshToStation.get(h.object) : null;
    if (id !== hovered) {
      hovered = id;
      canvas.style.cursor = id ? 'pointer' : '';
      outline.selectedObjects = id && id !== cam.station ? hitRoots[id] : [];
      outline.visibleEdgeColor.set(id && STATIONS[id].disc === 'me' ? 0xff5b1f : id && STATIONS[id].disc === 'sw' ? 0x2f8fe0 : 0x2a2c31);
      $$('.hs').forEach(el => el.classList.toggle('hot', el.dataset.st === id));
    }
  }

  // floating labels
  const showHs = cam.mode === 'home' && !flight;
  for (const [id, el] of Object.entries(hsEls)) {
    v3.copy(anchors[id]).project(camera);
    const vis = showHs && v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
    el.classList.toggle('vis', vis);
    if (vis) el.style.transform = `translate3d(${(v3.x * 0.5 + 0.5) * innerWidth}px, ${(-v3.y * 0.5 + 0.5) * innerHeight}px, 0)`;
    if (vis) el.classList.toggle('flip', v3.x > 0.3);
  }

  composer.render(dt);
  if (++frames === 3) enter();
}

function enter() {
  if (!reduce && !STATIONS[location.hash.slice(1)]) { intro = { t0: nowMs + 250, from: HOME.yaw - 0.55, to: HOME.yaw, dur: 2600 }; look.yaw = intro.from; }
  progress('');
  loader.classList.add('done');
  document.body.classList.add('ready');
  setTimeout(() => loader.remove(), 1200);
  const id = location.hash.slice(1);
  if (STATIONS[id]) setTimeout(() => openStation(id), reduce ? 0 : 700);
}

// ------------------------------------------------------------------ frame pacing
// At most 60 fps (a 120 Hz screen would otherwise do twice the work), 30 on a phone left alone. If frames still
// run long, drop decorative glow first, then use cheaper edge smoothing before reducing resolution.
// Even the lightest mode keeps anti-aliasing and a readable resolution floor.
const pace = { clock: new FramePacer(), input: 0, lean: false };
function lean() {
  pace.lean = true; bloom.enabled = false; edgeAA.enabled = true;
  for (const t of [composer.renderTarget1, composer.renderTarget2]) { t.samples = 0; t.dispose(); }   // reallocated on next use
}
for (const t of ['pointerdown', 'pointermove', 'keydown', 'wheel']) addEventListener(t, () => { pace.input = performance.now(); }, { passive: true });
function tick(t) {
  const busy = drag || flight || intro || Math.abs(look.vy) + Math.abs(look.vp) > 1e-4 || DOOR.amt !== DOOR.to;
  const idle = !busy && t - pace.input > 4000;   // phones idle at 30 fps; with reduced motion nothing moves, so 10 is plenty
  const gap = idle && reduce ? 100 : idle && tier === 'low' ? 1000 / 30 : 1000 / 60;
  if (!pace.clock.due(t, gap)) return;
  frame();
  const rate = pace.clock.sample(t);
  if (rate < 0.8) {
    const now = renderer.getPixelRatio(), floor = minDpr();
    if (bloom.enabled) bloom.enabled = false;
    else if (!pace.lean) lean();
    else if (now > floor + 1e-3) { DPR.cap = Math.max(floor, now - (rate < 0.5 ? 0.5 : 0.25)); resize(); }
  }
}

// list view (and the no-WebGL fallback share it)
let flowInView = false, roomRunning = false, initialized = false;
function updateActivity() {
  if (!initialized) return;
  const list = document.body.classList.contains('list'), available = !document.hidden && !document.body.classList.contains('no3d');
  const run = available && !list && !renderer.getContext().isContextLost();
  if (run !== roomRunning) { roomRunning = run; pace.clock.reset(); timer.reset(); renderer.setAnimationLoop(run ? tick : null); }
  if (sim) { if (available && list && flowInView && !reduce) sim.start(); else sim.stop(); }
}
const flowObserver = new IntersectionObserver(([entry]) => { flowInView = entry.isIntersecting; updateActivity(); });
flowObserver.observe($('#flowCanvas'));
$('#listBtn').addEventListener('click', () => {
  const on = !document.body.classList.contains('list');
  if (on) closeStation();
  document.body.classList.toggle('list', on);
  $('#listBtn').textContent = on ? '3D room' : 'List view';
  panel.setAttribute('aria-hidden', String(!on));
  if (on) { $$('.sec', pscroll).forEach(s => s.hidden = false); showPosters(); scrollTo(0, 0); }
  updateActivity();
});
document.addEventListener('visibilitychange', updateActivity);
addEventListener('pageonly', updateActivity);
// compile every shader before the first frame (in parallel where the browser can), for the composer's
// linear render target rather than the screen, so nothing stalls as the room comes into view
performance.mark('room:setup');
renderer.setRenderTarget(composer.readBuffer);
const compiled = renderer.compileAsync(scene, camera);
renderer.setRenderTarget(null);
await Promise.all([compiled.catch(() => {}), Promise.resolve(shell.ready).catch(e => console.warn('window view', e))]);
performance.mark('room:compiled');
// a phone can drop the GPU context (backgrounded, low memory); three.js restores it, and the things drawn only
// once (the shadow maps, the Bell Tower) are drawn again
canvas.addEventListener('webglcontextrestored', () => {
  rebuildEnvironment();
  shell.sun.shadow.needsUpdate = true; for (const [l] of shadowSpots) l.shadow.needsUpdate = true;
  shell.redrawTower?.().catch(() => {});
  updateActivity();
});
canvas.addEventListener('webglcontextlost', () => {
  // Release the old target while the context is lost; its handles are invalid after restoration.
  environmentTarget?.dispose(); environmentTarget = null; scene.environment = null;
  updateActivity();
});
// the slow-load fallback (index.html) may have switched to the page while this was loading
initialized = true;
updateActivity();
// dev hook: step the loop by hand (headless browsers barely tick requestAnimationFrame)
window.__room = { scene, camera, renderer, sim, openStation, closeStation, look, STATIONS, tier, lean, get frames() { return frames; }, advance(sec, step = 1 / 30) { for (let t = 0; t < sec; t += step) frame(step); } };
