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
import { Builder, box, mat } from './models/kit.js';
import { buildShell, pinCards, ROOM } from './shell.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const tier = coarse || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high';

// ------------------------------------------------------------------ stations
// view.pos = where the camera flies; view.look = what it looks at.
const STATIONS = {
  research: { n: '01', label: 'Research', sub: 'Passive vortex propulsion', disc: 'me', view: { pos: [-1.3, 1.52, -0.3], look: [-3.1, 1.4, -0.66] }, fit: [1.55, 1.35] },
  spareme:  { n: '02', label: 'SpareMe', sub: 'AI phone agent', disc: 'sw', view: { pos: [1.5, 1.38, 0.08], look: [3.1, 1.02, 0.0] }, fit: [1.25, 0.9] },
  robotics: { n: '03', label: 'Robotics', sub: 'FTC #12096', disc: 'me', view: { pos: [-0.78, 1.02, -0.95], look: [-1.55, 0.28, -1.95] }, fit: [0.8, 0.6] },
  more:     { n: '04', label: 'More projects', sub: '30k users in a month', disc: '', view: { pos: [0.62, 1.45, -1.2], look: [0.62, 1.42, -2.8] }, fit: [1.6, 1.05] },
  about:    { n: '05', label: 'About', sub: 'Experience & contact', disc: '', view: { pos: [-0.9, 1.5, 1.15], look: [-0.9, 1.45, 2.8] }, fit: [1.7, 1.08] },
  guitar:   { n: '06', label: 'B-side', sub: 'Classical guitar', disc: '', view: { pos: [1.55, 1.2, 1.15], look: [2.55, 0.62, 2.2] }, fit: [0.6, 1.1] },
};
// on narrow (portrait) screens, start turned slightly left so the name sign and welcome note are in frame
const HOME = { pos: new THREE.Vector3(0, 1.58, 0.75), yaw: innerWidth / innerHeight < 0.8 ? -0.17 : 0, pitch: -0.07 };

// ------------------------------------------------------------------ boot
const canvas = $('#room');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) { document.body.classList.add('list', 'no3d'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, tier === 'high' ? 1.75 : 1.5));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080a);
scene.fog = new THREE.Fog(0x07080a, 6, 11);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

const camera = new THREE.PerspectiveCamera(innerWidth < 760 ? 70 : 58, innerWidth / innerHeight, 0.03, 30);
camera.position.copy(HOME.pos);

// post: bloom for practicals and screens, a thin outline on whatever the pointer is over
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: tier === 'high' ? 4 : 2 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const outline = new OutlinePass(new THREE.Vector2(innerWidth, innerHeight), scene, camera);
outline.edgeStrength = 3.2; outline.edgeGlow = 0.35; outline.edgeThickness = 1.2; outline.pulsePeriod = 0;
outline.visibleEdgeColor.set(0xecebe6); outline.hiddenEdgeColor.set(0x2a2c31);
if (!coarse) composer.addPass(outline);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.55, 0.9);
if (tier === 'low') { const set = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => set(w / 2, h / 2); }   // half-res glow on phones
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ loading
const loader = $('#loader'), bar = $('#loadbar');
let loaded = 0; const TOTAL = 6;
function progress(label) { loaded++; bar.style.transform = `scaleX(${Math.min(1, loaded / TOTAL)})`; if (label) $('#loadlabel').textContent = label; }

await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]);
await Promise.all([document.fonts.load('300 40px Archivo'), document.fonts.load('600 40px Archivo'), document.fonts.load('500 20px "JetBrains Mono"')]).catch(() => {});
progress('Wiring the lights');

const photo = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'img/face.webp'; });
const shell = buildShell(scene, renderer, { tier, photo, touch: coarse });
progress('Framing the room');

// procedural models (built in parallel modules); a missing module falls back to a stand-in block
async function model(path, fn = 'default', stand = [0.4, 0.4, 0.4]) {
  try {
    const m = await import(path);
    const g = await (m[fn] || m.default)();
    return g;
  } catch (e) {
    console.warn('model', path, fn, e);
    const b = new Builder('standin'); b.add(box(...stand, 0.02), 'plasticGrey', { position: [0, stand[1] / 2, 0] }); return b.build();
  }
}
const [rig, robot, desk, chair, guitar, stool, shelf] = await Promise.all([
  model('./models/windtunnel.js', 'default', [1.8, 0.9, 0.72]),
  model('./models/robot.js', 'default', [0.45, 0.4, 0.45]),
  model('./models/props.js', 'createDesk', [1.5, 0.74, 0.72]),
  model('./models/props.js', 'createChair', [0.6, 1.0, 0.6]),
  model('./models/props.js', 'createGuitar', [0.4, 1.0, 0.3]),
  model('./models/props.js', 'createStool', [0.4, 0.62, 0.4]),
  model('./models/props.js', 'createShelf', [0.9, 1.6, 0.28]),
]);
progress('Placing the work');

const X0 = -ROOM.W / 2, X1 = ROOM.W / 2, Z0 = -ROOM.D / 2;
rig.position.set(X0 + 0.38, 0, -0.62); rig.rotation.y = Math.PI / 2;
robot.position.set(-1.55, 0.016, -1.95); robot.rotation.y = 0.55;
desk.position.set(X1 - 0.38, 0, 0); desk.rotation.y = -Math.PI / 2;
chair.position.set(2.02, 0, 0.12); chair.rotation.y = Math.PI / 2 - 0.25;
guitar.position.set(2.58, 0, 2.2); guitar.rotation.y = -2.2;
stool.position.set(-2.12, 0, 0.35); stool.rotation.y = 0.4;
shelf.position.set(2.55, 0, Z0 + 0.16);
scene.add(rig, robot, desk, chair, guitar, stool, shelf);
for (const o of [rig, robot, desk, chair, guitar, stool, shelf]) o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

// ------------------------------------------------------------------ screens
const texLoader = new THREE.TextureLoader();
function screenTexture(src, cb) {
  const t = texLoader.load(src, cb); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// monitor: SpareMe
const monitor = desk.getObjectByName('screen');
if (monitor) {
  monitor.material = new THREE.MeshBasicMaterial({ map: screenTexture('img/shot-spareme.webp'), toneMapped: false, color: 0xd8d8d8 });
  const glow = new THREE.RectAreaLight(0xaab8ff, 3, 0.6, 0.34);
  glow.position.set(0, 0, 0.02); glow.rotation.set(0, Math.PI, 0);   // lights face -Z; turn it to shine out of the screen (+Z)
  monitor.add(glow);
}
// phone: SpareMe's handset art, cropped to a phone screen
const phone = desk.getObjectByName('phoneScreen');
if (phone) {
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = 340; c.height = 736; const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 736); bg.addColorStop(0, '#141a3a'); bg.addColorStop(1, '#070914');
    g.fillStyle = bg; g.fillRect(0, 0, 340, 736);
    g.drawImage(im, 330, 310, 540, 360, -110, 300, 560, 373);
    g.fillStyle = '#fff'; g.font = '700 46px Archivo, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('SpareMe', 170, 150);
    g.font = '500 20px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('CALLS YOU DREAD, HANDLED', 170, 196);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    phone.material = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: 0xcfcfcf });
  };
  im.src = 'img/shot-spareme.webp';
}

// pinboard cards (the "more projects" teaser)
pinCards(shell.pinboard, [
  { note: 'Learn about my project that hit 30k users in a month', x: -0.52, y: 0.2, r: -0.05 },
  { src: 'img/shot-khali.webp', title: 'Khali', x: -0.02, y: 0.36, r: 0.04, dark: true },
  { src: 'img/shot-chad.webp', title: 'Chad vs. Chud', x: 0.5, y: 0.3, r: -0.06, dark: true },
  { src: 'img/motor-worn.webp', title: 'Resistance trainer', x: -0.06, y: -0.36, r: -0.03 },
  { src: 'img/shot-oh.webp', title: 'Oh', x: 0.44, y: -0.34, r: 0.05, dark: true },
]);
progress('Pinning projects');

// ------------------------------------------------------------------ live flow on the wall display
let sim = null, flowTex = null, flowCond = 'both';
try {
  sim = new window.Wake($('#flowCanvas'), { mode: 1, fixed: [1050, 400], cells: tier === 'high' ? 62000 : 36000, cyl: [0.17, 0.5], d: 0.15, re: 150, fin: { x: 4.2, chord: 1.5 }, decay: 0.9985 });
  flowTex = new THREE.CanvasTexture($('#flowCanvas'));
  flowTex.colorSpace = THREE.SRGBColorSpace; flowTex.wrapS = THREE.RepeatWrapping;
  flowTex.repeat.x = -1; flowTex.offset.x = 1;   // mirror so the on-wall flow runs the same way as the rig beneath it
  shell.flowScreen.material = new THREE.MeshBasicMaterial({ map: flowTex, toneMapped: false, color: 0xe6e6e6 });
} catch (e) { console.warn('flow sim unavailable', e); }
function setCondition(c) {
  flowCond = c;
  $$('[data-cond]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cond === c)));
  if (sim) sim.setObstacles(c !== 'fin', c !== 'cyl');
}
$$('[data-cond]').forEach(b => b.addEventListener('click', () => setCondition(b.dataset.cond)));
progress('Starting the flow');

// ------------------------------------------------------------------ station registry: hit targets + label anchors
const hitRoots = {
  research: [rig, shell.flowScreen], robotics: [robot], spareme: [desk, chair],
  more: [shell.pinboard.group], about: [shell.whiteboard], guitar: [guitar],
};
const anchors = {
  ...shell.anchors,
  spareme: new THREE.Vector3(X1 - 0.5, 1.35, 0),
  guitar: new THREE.Vector3(2.5, 1.2, 2.15),
  more: new THREE.Vector3(0.2, 2.0, -2.6),     // top-left of the pinboard, by the teaser note (in frame on phones)
};
const hitList = [], meshToStation = new Map();
for (const [id, roots] of Object.entries(hitRoots)) for (const r of roots) r.traverse(o => { if (o.isMesh) { hitList.push(o); meshToStation.set(o, id); } });

// HTML labels that float at each station
const hotspots = $('#hotspots');
const hsEls = {};
for (const [id, s] of Object.entries(STATIONS)) {
  const b = document.createElement('button');
  b.className = 'hs ' + (s.disc || ''); b.type = 'button'; b.dataset.st = id;
  b.innerHTML = `<i></i><span><b>${s.label}</b><small>${s.sub}</small></span>`;
  b.addEventListener('click', () => openStation(id));
  hotspots.appendChild(b); hsEls[id] = b;
}

// ------------------------------------------------------------------ camera: look around from the middle of the room
const look = { yaw: HOME.yaw, pitch: HOME.pitch, vy: 0, vp: 0 };
const cam = { pos: HOME.pos.clone(), target: new THREE.Vector3(), mode: 'home', station: null, off: new THREE.Vector2(), offTarget: new THREE.Vector2() };
let intro = null;   // the opening pan that shows the room is 360°
let flight = null;   // { from, to, fromT, toT, t0, dur, then }
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function dirFrom(yaw, pitch, out = new THREE.Vector3()) { return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }
function homeTarget() { return HOME.pos.clone().add(dirFrom(look.yaw, look.pitch)); }
function fly(toPos, toLook, dur = 1.25) {
  const fromLook = cam.target.clone();
  flight = { from: camera.position.clone(), to: toPos.clone(), fromT: fromLook, toT: toLook.clone(), t0: performance.now(), dur: reduce ? 0.001 : dur * 1000 };
}

// pointer: drag to look (home), click to open; small parallax drag while at a station
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

const ray = new THREE.Raycaster();
function pick(x, y) {
  ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const h = ray.intersectObjects(hitList, false)[0];
  return h ? meshToStation.get(h.object) : null;
}

addEventListener('keydown', e => {
  if (e.target.closest('input,textarea')) return;
  if (e.key === 'Escape') { if (lb.classList.contains('open')) return; closeStation(); }
  if (cam.mode === 'home' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { look.vy = (e.key === 'ArrowLeft' ? 1 : -1) * 0.06; }
  const ids = Object.keys(STATIONS), i = +e.key - 1;
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
  const lim = { x: [-3.05, 3.05], y: [0.3, 2.8], z: [-2.65, 2.65] };   // never back through a wall
  for (const k of ['x', 'y', 'z']) { const v = dir[k]; if (Math.abs(v) > 1e-4) { const m = ((v > 0 ? lim[k][1] : lim[k][0]) - look[k]) / v; if (m > 0) d = Math.min(d, m); } }
  return { pos: look.clone().addScaledVector(dir, d), look };
}
function openStation(id) {
  const s = STATIONS[id]; if (!s) return;
  if (cam.mode === 'home') homeLook = { yaw: look.yaw, pitch: look.pitch };
  cam.mode = 'station'; cam.station = id;
  intro = null;
  const pose = stationPose(s);
  fly(pose.pos, pose.look);
  $$('.sec', pscroll).forEach(sec => sec.hidden = sec.id !== 'p-' + id);
  pscroll.scrollTop = 0;
  panel.classList.add('open'); document.body.classList.add('in-station');
  panel.setAttribute('aria-hidden', 'false');
  $$('#dock button').forEach(b => b.classList.toggle('on', b.dataset.st === id));
  viewOffset();
  history.replaceState(null, '', '#' + id);
  outline.selectedObjects = [];
  setTimeout(() => $('#pclose').focus({ preventScroll: true }), 50);
}
function closeStation() {
  if (cam.mode !== 'station') return;
  cam.mode = 'home'; cam.station = null;
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
$$('#dock button').forEach(b => b.addEventListener('click', () => openStation(b.dataset.st)));
$$('[data-open]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); openStation(b.dataset.open); }));

// ------------------------------------------------------------------ lightbox (images, PDFs as page images, video)
const lb = $('#lb'), lbMedia = $('#lbMedia'), lbCap = $('#lbCap'), lbExtra = $('#lbExtra');
function lbOpen(html, cap, extra) { lbMedia.innerHTML = html; lbCap.innerHTML = cap || ''; lbExtra.innerHTML = extra || ''; lb.classList.add('open'); $('#lbX').focus(); }
function lbClose() { lb.classList.remove('open'); lbMedia.innerHTML = ''; }
$('#lbX').addEventListener('click', lbClose);
lb.addEventListener('click', e => { if (e.target === lb) lbClose(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && lb.classList.contains('open')) lbClose(); });
document.addEventListener('click', e => {
  const im = e.target.closest('[data-lb]');
  if (im) { e.preventDefault(); lbOpen(`<img src="${im.dataset.lb}" alt=""${im.hasAttribute('data-cad') ? ' class="cad"' : ''}>`, im.dataset.cap ? `<b>${im.dataset.cap}</b>` : ''); return; }
  const doc = e.target.closest('[data-doc]');
  if (doc && !(e.metaKey || e.ctrlKey || e.shiftKey)) {
    e.preventDefault();
    let pages = ''; for (let i = 1; i <= +doc.dataset.pages; i++) pages += `<img src="img/docs/${doc.dataset.doc}-${i}.webp" alt="${doc.dataset.title}, page ${i}" loading="lazy">`;
    lbOpen(`<div class="lb-pages">${pages}</div>`, `<b>${doc.dataset.title}</b>`, `<a class="lb-dl" href="${doc.getAttribute('href')}" download>Download PDF ↓</a>`);
  }
});

// ------------------------------------------------------------------ resize
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  camera.aspect = w / h; camera.fov = w < 760 ? 70 : 58; camera.updateProjectionMatrix();
  if (cam.mode === 'station' && !flight) { viewOffset(); const p = stationPose(STATIONS[cam.station]); fly(p.pos, p.look, 0.35); }
}
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), v3 = new THREE.Vector3();
const parts = {
  fin: rig.getObjectByName('fin'), fan: rig.getObjectByName('fanBlades'),
  turret: robot.getObjectByName('turret'), flywheel: robot.getObjectByName('flywheel'),
  rollers: robot.getObjectByName('intakeRollers'), lamp: desk.getObjectByName('lamp'),
};
let hovered = null, simReady = false, frames = 0;
cam.target.copy(homeTarget());
camera.lookAt(cam.target);

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  // camera
  if (flight) {
    const k = Math.min(1, (performance.now() - flight.t0) / flight.dur), e = ease(k);
    camera.position.lerpVectors(flight.from, flight.to, e);
    cam.target.lerpVectors(flight.fromT, flight.toT, e);
    if (k >= 1) flight = null;
  } else if (cam.mode === 'home') {
    if (intro) {
      const k = Math.max(0, Math.min(1, (performance.now() - intro.t0) / intro.dur));
      look.yaw = intro.from + (intro.to - intro.from) * (1 - Math.pow(1 - k, 3));
      if (k >= 1) intro = null;
    }
    if (!drag && !intro) { look.yaw += look.vy; look.pitch = THREE.MathUtils.clamp(look.pitch + look.vp, -0.6, 0.5); look.vy *= 0.9; look.vp *= 0.9; }
    camera.position.copy(HOME.pos);
    cam.target.copy(homeTarget());
    // a touch of parallax from the pointer, so the room feels present even when still
    if (!coarse && !reduce && pointer.x > -2) cam.target.add(v3.set(pointer.x * 0.05, pointer.y * 0.03, 0).applyQuaternion(camera.quaternion));
  }
  camera.lookAt(cam.target);
  // shift the projection so the station sits in the space left of the panel
  cam.off.lerp(cam.offTarget, reduce ? 1 : 0.12);
  if (cam.off.lengthSq() > 0.25) camera.setViewOffset(innerWidth, innerHeight, cam.off.x, cam.off.y, innerWidth, innerHeight); else camera.clearViewOffset();

  // live flow: only while the display is on screen, or the research panel is open
  pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
  if (sim && (frustum.intersectsObject(shell.flowScreen) || cam.station === 'research')) {
    const ready = sim.tick(performance.now());
    if (ready && !simReady) { simReady = true; }
    flowTex.needsUpdate = true;
    if (parts.fin) parts.fin.rotation.y = flowCond === 'cyl' ? 0 : sim.finAngle;
  }
  if (!reduce) {
    if (parts.fan) parts.fan.rotation.x += dt * 38;
    if (parts.turret) parts.turret.rotation.y = Math.sin(t * 0.35) * 0.9;
    if (parts.flywheel) parts.flywheel.rotation.x += dt * 30;
    if (parts.rollers) parts.rollers.rotation.x += dt * 6;
  }

  // hover: outline + cursor
  if (pointerMoved && !drag && !flight) {
    pointerMoved = false;
    ray.setFromCamera(pointer, camera);
    const h = pointer.x > -2 ? ray.intersectObjects(hitList, false)[0] : null;
    const id = h ? meshToStation.get(h.object) : null;
    if (id !== hovered) {
      hovered = id;
      canvas.style.cursor = id ? 'pointer' : '';
      outline.selectedObjects = id && id !== cam.station ? hitRoots[id] : [];
      outline.visibleEdgeColor.set(id && STATIONS[id].disc === 'me' ? 0xff7a45 : id && STATIONS[id].disc === 'sw' ? 0x7cc8ff : 0xecebe6);
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
    if (vis) el.classList.toggle('flip', v3.x > 0.3);   // near the right edge, the label reads leftward
  }

  composer.render(dt);
  if (++frames === 3) enter();
}

function enter() {
 
  if (!reduce && !STATIONS[location.hash.slice(1)]) { intro = { t0: performance.now() + 250, from: HOME.yaw + 0.62, to: HOME.yaw, dur: 2600 }; look.yaw = intro.from; }
  progress('');
  loader.classList.add('done');
  document.body.classList.add('ready');
  setTimeout(() => loader.remove(), 1200);
  const id = location.hash.slice(1);
  if (STATIONS[id]) setTimeout(() => openStation(id), reduce ? 0 : 700);
}

// list view (and the no-WebGL fallback share it)
$('#listBtn').addEventListener('click', () => {
  const on = document.body.classList.toggle('list');
  $('#listBtn').textContent = on ? '3D room' : 'List view';
  if (on) { renderer.setAnimationLoop(null); $$('.sec', pscroll).forEach(s => s.hidden = false); scrollTo(0, 0); }
  else { closeStation(); renderer.setAnimationLoop(frame); }
});
document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden || document.body.classList.contains('list') ? null : frame));
renderer.setAnimationLoop(frame);
window.__room = { scene, camera, renderer, sim, openStation, closeStation, look };
