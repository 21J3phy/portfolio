// Nirav Surabhi — the drive.
// An ordinary scrolling page, with a mountain road behind it. Scrolling drives the car: each section of the page is a
// destination along the road, with that project's model standing in a turnout. Between destinations the page's
// scroll position is a place on the road and the car goes there with real acceleration and braking, so how fast you
// scroll is how fast it drives; the dashboard shows it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildRoute } from './route.js';
import { buildWorld, ROAD, SUN_DIR } from './world.js';
import createCar from './car.js';
import { buildExhibits } from './exhibits.js';
import { loadPerson } from './person.js';
import { createMinimap } from './minimap.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const query = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const tier = query.get('tier') || window.__tier || (coarse || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high');
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

// ------------------------------------------------------------------ the destinations, in page order
const SPACING = 150, FIRST = 46, PARK = 9;   // metres between destinations; where the first is; how far short of one the car parks
const sections = $$('.stop');
const stops = sections.map((el, i) => ({
  el, id: el.dataset.stop, i, s: i === 0 ? 14 : FIRST + i * SPACING,
  label: el.dataset.label || '', sub: el.dataset.sub || '', n: i === 0 ? '' : String(i).padStart(2, '0'), sign: i > 0,
}));
const route = buildRoute(stops.at(-1).s + 90);

// ------------------------------------------------------------------ renderer
const canvas = $('#drive');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch (e) { window.pageOnly?.(); throw e; }
const DPR = { max: tier === 'high' ? 1.75 : 1.5, budget: tier === 'high' ? 3.2e6 : 1.3e6, cap: Infinity };
const pickDpr = () => Math.max(1, Math.min(devicePixelRatio, DPR.max, DPR.cap, Math.sqrt(DPR.budget / (innerWidth * innerHeight))));
renderer.setPixelRatio(pickDpr()); renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping }[query.get('tm')] ?? THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = +(query.get('ex') || 0.82);
renderer.debug.checkShaderErrors = query.has('debug');   // (checking makes every shader compile block the page)
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const halfFloat = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
const gl = renderer.getContext();
const sampleCounts = gl.getInternalformatParameter(gl.RENDERBUFFER, halfFloat ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES);
const samples = Math.max(0, ...Array.from(sampleCounts).filter(n => n <= (tier === 'high' ? 4 : 2)));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.12, 20000);
const progressEl = $('#loadbar'), labelEl = $('#loadlabel');
let loadedParts = 0; const progress = label => { loadedParts++; if (progressEl) progressEl.style.transform = `scaleX(${Math.min(1, loadedParts / 5)})`; if (label && labelEl) labelEl.textContent = label; };

// The car is the biggest download, so it starts first; the road is laid while it comes. What stands at the
// destinations is not built yet (see the end of this file).
const carLoading = createCar();
await Promise.race([Promise.all([document.fonts.load('500 40px Archivo'), document.fonts.load('700 40px Archivo')]).catch(() => {}), new Promise(r => setTimeout(r, 2500))]);
progress('Laying the road');
const world = buildWorld(scene, renderer, route, stops, { tier });
performance.mark('world'); progress('Fetching the car');
// compile for the buffer the scene is actually drawn into, without blocking on it
const precompile = o => { renderer.setRenderTarget(composer.readBuffer); const p = renderer.compileAsync(o, camera, scene).catch(() => {}); renderer.setRenderTarget(null); return p; };
const exhibits = buildExhibits(scene, route, stops, { tier, shoulderAt: world.shoulderAt, carEdgeAt: s => laneAt(s) + 0.92, prepare: groups => Promise.all(groups.map(precompile)) });
const car = await carLoading;
scene.add(car); performance.mark('car');
{
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 128, 10, 64, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.translate(64, 128); g.scale(0.5, 1); g.translate(-64, -128); g.fillStyle = gr; g.fillRect(-64, 0, 256, 256); g.restore();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 5.3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; blob.renderOrder = 2; car.add(blob);
}
progress('Waiting for the light');
await Promise.all([world.env.catch(e => console.warn('environment', e)), world.ready]); performance.mark('assets');
progress('Starting the engine');

// post: the sun and its glints bloom a little; then one pass develops the picture (tone mapping, colour space) and
// adds the lens: slight vignette, grain, and a smear toward the edges at speed
const rt = new THREE.WebGLRenderTarget(1, 1, { type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, samples });
const composer = new EffectComposer(renderer, rt); composer.setPixelRatio(1);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.16, 0.5, 1.5);
{ const set = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => set(w / 2, h / 2); }
// (The sun and its glints on chrome are hundreds of times brighter than white. Blooming them at full strength lays
// a veil over the whole frame when the road points at the sun, so what bloom is given is capped.)
bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); texel.rgb = min( texel.rgb, vec3( 2.6 ) );');
if (halfFloat) composer.addPass(bloom);
const lens = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, speed: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time, speed; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      // at speed the edges of the frame smear outward a little
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (speed > 0.01) { vec3 a = vec3(0.0); for (int i = 1; i <= 4; i++) a += texture2D(tDiffuse, vUv - c * r2 * speed * 0.05 * float(i)).rgb; col = mix(col, (col + a) / 5.0, smoothstep(0.05, 0.3, r2)); }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      gl_FragColor.rgb *= 1.0 - 0.42 * smoothstep(0.12, 0.72, r2);
      gl_FragColor.rgb += (h(vUv * vec2(1920.0, 1080.0)) - 0.5) * 0.022;
    }`,
});
composer.addPass(lens);

// ------------------------------------------------------------------ the film, and the scroll that runs it
// Where everything is depends only on how far the film has run: the camera coming round the car at the start, the car
// on its way to the next destination, then parked while the driver gets out, walks to the sign and to the exhibit,
// looks, walks back and gets in. Scrolling runs the film. At a destination it runs exactly as far as it is scrolled:
// stop and it stops, scroll back and it runs backwards. On the road the car does not need pushing: once it has
// pulled away it drives itself to the next destination and brakes into it, and scrolling only hurries it.
//
// The page itself does not scroll (a page long enough to hold the film would be a hundred screens tall, and a
// browser's own scrolling cannot be nudged along without fighting it). Wheel, touch and keys move the film instead,
// through a spring, so nothing starts or stops with a jerk.
let introY = 1;                                   // how much scroll the opening takes
const LEG = coarse ? 2300 : 3000, HALT = coarse ? 5400 : 7200, CRUISE = 430;   // px of scroll for a stretch of road and for a stop; px/s the car drives itself at
const VCAP = 38, WALKCAP = 520;                   // the car's top speed, m/s (85 mph), however hard it is scrolled; and the fastest a stop will play, px/s (a jog)
const tl = { u: 0, set: false, snapped: false, film: 0, dFilm: 0 };
const FILM = 1 / 620;                             // seconds of the exhibits' own motion per pixel scrolled
// when in a stop each thing happens, as fractions of the stop's stretch of scroll
const BEAT = { out: [0.03, 0.085], sign: [0.085, 0.24], pts: [0.29, 0.81], back: [0.81, 0.95], in: [0.95, 0.985], end: 0.275 };
const seg = (x, [a, b]) => clamp((x - a) / (b - a), 0, 1);
const ease = k => k * k * (3 - 2 * k) * 0.6 + k * 0.4;
// a leg of road: pull away, cruise, brake to the mark
const legAt = k => { const a = 0.24, b = 0.3, vm = 1 / (1 - a / 2 - b / 2); return k < a ? vm * k * k / (2 * a) : k > 1 - b ? 1 - vm * (1 - k) * (1 - k) / (2 * b) : vm * (k - a / 2); };
const vs = { pos: 0, target: 0, vel: 0, max: 1, dir: 1, cutNow: true, touched: 0 };
function measure() {
  introY = Math.max(1, innerHeight * 0.62);
  let from = introY, fromS = stops[0].s;
  for (const st of stops.slice(1)) { st.from = from; st.fromS = fromS; st.y0 = from + LEG; st.y1 = st.y0 + HALT * (['marschair', 'software'].includes(st.id) ? 1 : 0.68); st.last = st === stops.at(-1); from = st.y1; fromS = st.s - PARK; }
  vs.max = stops.at(-1).y0 + (stops.at(-1).y1 - stops.at(-1).y0) * BEAT.end;     // the road ends at the last stop: he stays by its sign
}
/** Jump the film to u: a cut, not a fast-forward. */
function cutTo(u) { vs.pos = vs.target = clamp(u, 0, vs.max); vs.vel = 0; vs.cutNow = true; }
const push = d => { if (!d) return; vs.dir = Math.sign(d); vs.target = clamp(vs.target + d, 0, vs.max); vs.touched = performance.now(); };
function stepScroll(dt) {
  // on the road, the car carries on by itself to the next destination (forwards only: backing up is done by hand),
  // and scrolling harder cannot take it past the stop it is driving to
  let cap = 1400;
  for (const st of stops) if (st.i && vs.pos > st.from && vs.pos < st.y0) {
    cap = VCAP / ((st.s - PARK - st.fromS) / (st.y0 - st.from) * 1.37);
    if (vs.dir > 0 && vs.pos > st.from + 2 && !reduce) vs.target = clamp(Math.max(vs.target, vs.pos) + (vs.target < st.y0 ? CRUISE * dt : 0), vs.pos, st.y0);
    break;
  } else if (st.i && vs.pos >= st.y0 && vs.pos <= st.y1) { cap = WALKCAP; break; }
  if (vs.cutNow || reduce) { vs.pos = vs.target; vs.vel = 0; return; }
  vs.target = clamp(vs.target, vs.pos - 700, vs.pos + 700);   // (so nothing is still catching up long after the scrolling stopped)
  // a critically damped spring from where the film is to where the scroll has asked for, held to the speed limit
  const w = 7.5, n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
  for (let i = 0; i < n; i++) { vs.vel = clamp(vs.vel + (w * w * (vs.target - vs.pos) - 2 * w * vs.vel) * h, -cap, cap); vs.pos += vs.vel * h; }
  if (Math.abs(vs.target - vs.pos) < 0.05 && Math.abs(vs.vel) < 0.5) { vs.pos = vs.target; vs.vel = 0; }
  vs.pos = clamp(vs.pos, 0, vs.max);
}
{
  // wheel, touch and keys; anything inside an open write-up (or the lightbox) scrolls that instead
  const inside = e => e.target.closest?.('.dest.open, #lightbox, .lb, input, textarea, select');
  const active = () => mode !== 'page';
  addEventListener('wheel', e => {
    if (!active() || inside(e)) return; e.preventDefault(); if (e.ctrlKey || mode !== 'tour') return;
    const d = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1);
    push(clamp(d * (Math.abs(d) >= 90 ? 2.2 : 1.25), -520, 520));   // (a mouse wheel's notch is worth more than a trackpad's trickle, or a stop would take sixty clicks)
  }, { passive: false });
  let touch = null;
  addEventListener('touchstart', e => { if (!active() || mode !== 'tour' || inside(e) || e.touches.length !== 1) { touch = null; return; } const t = e.touches[0]; touch = { y: t.clientY, x: t.clientX, t: performance.now(), v: 0, axis: 0 }; }, { passive: true });
  addEventListener('touchmove', e => {
    if (!touch || !active()) return; if (e.cancelable) e.preventDefault();
    const t = e.touches[0], dy = touch.y - t.clientY, dx = touch.x - t.clientX, now = performance.now();
    if (!touch.axis && Math.abs(dx) + Math.abs(dy) > 8) touch.axis = Math.abs(dy) >= Math.abs(dx) ? 1 : 2;   // up and down runs the film; side to side looks around
    if (touch.axis === 1) { push(dy * 1.8); touch.v = touch.v * 0.6 + (dy * 1.8 / Math.max(1, now - touch.t) * 1000) * 0.4; }
    touch.y = t.clientY; touch.x = t.clientX; touch.t = now;
  }, { passive: false });
  addEventListener('touchend', () => { if (touch && touch.axis === 1 && performance.now() - touch.t < 80) push(clamp(touch.v * 0.2, -900, 900)); touch = null; }, { passive: true });
  addEventListener('keydown', e => {
    if (!active() || mode !== 'tour' || inside(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key, d = k === 'ArrowDown' ? 170 : k === 'ArrowUp' ? -170 : k === 'PageDown' || (k === ' ' && !e.shiftKey) ? 800 : k === 'PageUp' || (k === ' ' && e.shiftKey) ? -800 : 0;
    if (k === ' ' && e.target.closest?.('button, a, summary')) return;
    if (d) { e.preventDefault(); push(d); } else if (k === 'Home') { e.preventDefault(); cutTo(0); } else if (k === 'End') { e.preventDefault(); cutTo(vs.max); }
  });
  // links to a section (the Contact button, a #hash in the address) cut to that destination
  const alias = { spareme: 'software', silk: 'software', lazygenius: 'neurons', top: 'start' };
  const toHash = () => { const id = decodeURIComponent(location.hash.slice(1)), st = stops.find(x => x.id === (alias[id] || id)); if (st && mode !== 'page') goStop(st); };
  addEventListener('hashchange', toHash); addEventListener('click', e => { const a = e.target.closest?.('a[href^="#"]'); if (a && a.getAttribute('href') === location.hash) toHash(); });
  addEventListener('drive:ready', toHash, { once: true });
}
/** Where the film is at scroll position u: metres along the route, and (while parked) which stop and how far through it. */
const NOW = { s: 0, st: null, q: 0 }, hero = stops[0].el;
function timeline(u, out = NOW) {
  out.st = null; out.q = 0;
  if (u <= introY) { out.s = stops[0].s; return out; }
  for (const st of stops) {
    if (!st.i) continue;
    if (u < st.y0) { out.s = st.fromS + (st.s - PARK - st.fromS) * legAt((u - st.from) / (st.y0 - st.from)); return out; }
    if (u <= st.y1 || st.last) { out.s = st.s - PARK; out.st = st; out.q = clamp((u - st.y0) / (st.y1 - st.y0), 0, 1); return out; }
  }
  out.s = stops.at(-1).s - PARK; return out;
}
const targetS = y => timeline(y, {}).s;

// ------------------------------------------------------------------ the car
const P = {}, Q = {}, v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), v3c = new THREE.Vector3(), v3d = new THREE.Vector3(), A3 = [0, 0, 0];
const drive = { s: stops[0].s, v: 0, a: 0, gear: 0, rpm: 0.12, pedal: 0, view: null, steer: 0, wheel: 0, pitch: 0, roll: 0, brake: 0, trip: 0, lane: ROAD.lane };
const wheels = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'].map(n => car.getObjectByName(n)).filter(Boolean);
const steers = ['steerFL', 'steerFR'].map(n => car.getObjectByName(n)).filter(Boolean);
const wheelR = car.userData.wheelRadius || 0.31, wheelbase = car.userData.dimensions?.wheelbase || 2.62;
const VMAX = 58;   // m/s: about 130 mph, where the dial ends
function nearestStop(s) { let best = stops[0], d = Infinity; for (const st of stops) { const k = Math.abs(s - (st.i ? st.s - PARK : st.s)); if (k < d) { d = k; best = st; } } return [best, d]; }
// pulled onto the shoulder at a destination, in the lane between them
const laneAt = s => {
  const [, distance] = nearestStop(s);
  // Leave a metre beside the open driver's door. Start steering back before the turnout narrows.
  const parked = ROAD.half + 2.3;
  const offset = (parked - ROAD.lane) * (1 - smooth(3, 23, distance));
  return Math.min(ROAD.lane + offset, world.shoulderAt(s) - 1.35);
};
// The car is where the film says it is. Its speed is how fast that is changing, which is how fast the page is being
// scrolled: that is what the speedometer, the gears, the nose dipping under braking and the brake lamps all read.
function stepCar(dt, sT) {
  const ds = clamp(sT, 2, route.length - 4) - drive.s; drive.s += ds;
  if (tl.snapped || dt <= 0) { drive.v = 0; drive.a = 0; }
  else { const v0 = drive.v; drive.v += (ds / dt - drive.v) * (1 - Math.exp(-dt * 9)); if (Math.abs(drive.v) < 0.02) drive.v = 0; drive.a = lerp(drive.a, clamp((drive.v - v0) / dt, -25, 25), 1 - Math.exp(-dt * 8)); drive.trip += Math.abs(ds); }
  // the lane change onto the shoulder shows as a little yaw
  const lane = laneAt(drive.s), ahead = laneAt(drive.s + 3 * Math.sign(drive.v || 1)), yawOff = Math.atan2(ahead - lane, 3) * 0.9 * Math.sign(drive.v || 1);
  poseCar(dt, ds, lane, yawOff, Math.atan(wheelbase * route.at(drive.s, P).curvature) - yawOff * 1.6);
  drive.view = route.at(drive.s, P).heading;
}
// put the car on the road: `lane` metres right of the centreline, turned `yaw` to the right of the road's heading
function poseCar(dt, ds, lane, yaw, steer) {
  const a = route.at(drive.s, P); drive.lane = lane;
  car.position.copy(a.p).addScaledVector(a.r, lane); car.position.y = a.p.y - Math.min(lane, world.shoulderAt(drive.s)) * 0.018;
  drive.pitch = lerp(drive.pitch, -Math.atan(a.grade) + clamp(drive.a, -15, 9) * -0.0042, 1 - Math.exp(-dt * 6));
  drive.roll = lerp(drive.roll, clamp(Math.min(drive.v * drive.v, 3400) * a.curvature, -6, 6) * 0.006, 1 - Math.exp(-dt * 5));
  car.rotation.set(drive.pitch, a.heading - yaw, drive.roll, 'YXZ');
  drive.wheel += ds / wheelR; for (const w of wheels) w.rotation.x = drive.wheel;
  drive.steer = lerp(drive.steer, steer, 1 - Math.exp(-dt * 8)); for (const st of steers) st.rotation.y = drive.steer;
  drive.brake = lerp(drive.brake, (drive.a * Math.sign(drive.v || 1) < -1.2 && Math.abs(drive.v) > 0.3) || drive.pedal > 0.2 ? 1 : 0, 1 - Math.exp(-dt * 14));
  car.userData.setLights?.({ brake: drive.brake });
}

// ------------------------------------------------------------------ free driving
// The same road without the film: the keys drive the car. It is a car on a ribbon: it has a speed, an angle to the
// road and a place across it, and the road's edges are walls. Stopped, E (or the button) gets the driver out, and
// then the same keys walk him about (see "on foot" below).
const keys = new Set(), free = { yaw: 0, steer: 0, q: 0, goal: 0, st: null, step: 0 };
const pressed = (...k) => k.some(x => keys.has(x));
function stepFree(dt) {
  const walking = man.on;
  const gas = walking ? 0 : (pressed('w', 'arrowup') ? 1 : 0), brk = walking ? 1 : (pressed('s', 'arrowdown', ' ') ? 1 : 0), turn = walking ? 0 : (pressed('d', 'arrowright') ? 1 : 0) - (pressed('a', 'arrowleft') ? 1 : 0);
  const v0 = drive.v, fwd = drive.v >= -0.05;
  // engine, brakes, drag; S from a standstill backs up
  let acc = gas * (fwd ? 8.5 * (1 - Math.max(0, drive.v) / (VCAP * 1.06)) : 9) - 0.25 - 0.0011 * drive.v * Math.abs(drive.v) * 1.0;
  if (brk) acc = drive.v > 0.3 ? -11 : pressed('s', 'arrowdown') && !walking ? -3.2 : -drive.v * 6;
  if (!gas && !brk && Math.abs(drive.v) < 0.4) acc = -drive.v * 4;
  drive.v = clamp(drive.v + acc * dt, -6, VCAP); drive.a = lerp(drive.a, (drive.v - v0) / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 8)); drive.pedal = brk && drive.v > 0.3 ? 1 : 0;
  // steering: less lock the faster it is going
  free.steer = lerp(free.steer, turn * (0.5 / (1 + Math.abs(drive.v) * 0.16)), 1 - Math.exp(-dt * 6));
  const a = route.at(drive.s, P), ds = drive.v * Math.cos(free.yaw) * dt;
  // (its angle is kept relative to the road, so left alone it follows the bends and straightens up; steering moves it across)
  free.yaw += drive.v / wheelbase * Math.tan(free.steer) * dt;
  if (!turn) free.yaw *= Math.exp(-dt * 2.2 * Math.min(1, Math.abs(drive.v) / 5));
  free.yaw = clamp(free.yaw, -1.1, 1.1);
  let lane = drive.lane + drive.v * Math.sin(free.yaw) * dt; const lo = -(ROAD.half - 1.0), hi = world.shoulderAt(drive.s) - 1.15;
  if (lane < lo || lane > hi) { lane = clamp(lane, lo, hi); free.yaw *= Math.exp(-dt * 8); drive.v *= Math.exp(-dt * 1.2); }   // the rock wall and the guardrail
  drive.s = clamp(drive.s + ds, 6, route.length - 12); if (drive.s <= 6 || drive.s >= route.length - 12) drive.v *= Math.exp(-dt * 6);
  drive.trip += Math.abs(ds);
  poseCar(dt, ds, lane, free.yaw, free.steer);
  drive.view = turnTo(drive.view ?? a.heading, a.heading - free.yaw * 0.85, 1 - Math.exp(-dt * 3.5));   // the camera swings in behind it
  const near = man.on && man.phase === 'walk' && Math.hypot(man.pos.x - man.door.x, man.pos.z - man.door.z) < 2.3;
  show('freebtn', !person ? '' : !man.on ? (Math.abs(drive.v) < 0.3 ? 'Get out' : '') : near ? 'Get in' : '', t => { const b = $('#outBtn'); if (b) { b.hidden = !t; b.firstChild.textContent = t + ' '; } });
  man.near = near;
  show('onfoot', man.on && man.phase === 'walk', on => { document.body.classList.toggle('onfoot', on); const h = $('#freehint'); if (h) h.innerHTML = on ? '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> run · <kbd>C</kbd> crouch · click for mouse look · <kbd>E</kbd> at the car' : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys drive · <kbd>E</kbd> gets out'; for (const b of $$('#pad button')) { const t = { w: on ? 'Walk' : 'Go', s: on ? 'Back' : 'Brake' }[b.dataset.key]; if (t) b.textContent = t; } });
}
function freeAct() {
  if (!person) return;
  if (!man.on) { if (Math.abs(drive.v) < 0.3) getOut(); }
  else if (man.near) { man.phase = 'in'; man.down = false; document.exitPointerLock?.(); }
}

// ------------------------------------------------------------------ on foot (free drive)
// Out of the car the same keys walk him: W/A/S/D relative to where the camera is looking, Shift to run, C to crouch
// (near an exhibit that brings the close view of it), and the mouse turns the camera: click once to give it the
// mouse, Escape to take it back. The rock wall, the rail, the car and whatever stands at the stops are solid.
const man = { on: false, phase: '', out: 0, pos: new THREE.Vector3(), door: new THREE.Vector3(), s: 0, yaw: 0, v: 0, crouch: 0, down: false, near: false, yaw0: 0, pitch0: 0, obstAt: -1e9 };
const obst = [], tbox = new THREE.Box3(), m4 = new THREE.Matrix4(), carBox = new THREE.Box3(new THREE.Vector3(-0.95, 0, -2.3), new THREE.Vector3(0.95, 1.5, 2.3));
function doorAt(out) { const h = car.rotation.y, fx = Math.sin(h), fz = Math.cos(h); out.set(car.position.x + fx * 0.2 + fz * 1.42, 0, car.position.z + fz * 0.2 - fx * 1.42); out.y = groundAt(out); return out; }
function getOut() {
  man.on = true; man.phase = 'out'; man.out = 0; man.v = 0; man.crouch = 0; man.down = false; man.s = drive.s + 0.2; man.yaw = car.rotation.y; doorAt(man.door); man.pos.copy(man.door);
  look.yaw = 0; look.pitch = 0; look.zoom = 1; seq.camYaw = car.rotation.y; seq.shoulder = 0.62; seq.focus = null; seq.focusSet = false; man.obstAt = -1e9;
  sound?.event('handbrake'); sound?.event('doorOpen');
}
function endMan() { man.on = false; man.phase = ''; man.out = 0; man.crouch = 0; seq.st = null; seq.out = 0; seq.low = 0; seq.v = 0; seq.focus = null; document.exitPointerLock?.(); }
// what is solid near him: each thing put down at the nearby stops, as a box in its own frame, and the car
function findObstacles() {
  obst.length = 0;
  for (const e of exhibits.list) {
    if (!e.ready || Math.abs(e.st.s - man.s) > 45) continue;
    for (const g of e.groups) {
      g.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      for (const c of g.children) {
        const b = new THREE.Box3();
        c.traverse(o => { if (!o.isMesh || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(tbox.copy(o.geometry.boundingBox).applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld))); });
        if (!b.isEmpty() && b.min.y < 1.5 && b.max.y > 0.12) obst.push({ inv, mat: g.matrixWorld, b });   // (not what is overhead, nor a mat on the ground)
      }
    }
  }
  car.updateWorldMatrix(true, false); obst.push({ inv: new THREE.Matrix4().copy(car.matrixWorld).invert(), mat: car.matrixWorld, b: carBox });
}
function pushOut(p) {
  const R = 0.3;
  for (const o of obst) {
    v3.copy(p).applyMatrix4(o.inv); const b = o.b;
    if (v3.x <= b.min.x - R || v3.x >= b.max.x + R || v3.z <= b.min.z - R || v3.z >= b.max.z + R) continue;
    const x0 = v3.x - (b.min.x - R), x1 = b.max.x + R - v3.x, z0 = v3.z - (b.min.z - R), z1 = b.max.z + R - v3.z, m = Math.min(x0, x1, z0, z1);
    if (m === x0) v3.x = b.min.x - R; else if (m === x1) v3.x = b.max.x + R; else if (m === z0) v3.z = b.min.z - R; else v3.z = b.max.z + R;
    v3.applyMatrix4(o.mat); p.x = v3.x; p.z = v3.z;
  }
}
function stepMan(dt) {
  doorAt(man.door);
  if (man.phase === 'out') { const was = man.out; man.out = Math.min(1, man.out + dt / 1.1); man.pos.copy(man.door); if (was < 0.8 && man.out >= 0.8) sound?.event('doorClose'); if (man.out >= 1) man.phase = 'walk'; }
  else if (man.phase === 'in') {
    const dx = man.door.x - man.pos.x, dz = man.door.z - man.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.08) { const k = Math.min(1, 2.2 * dt / d); man.pos.x += dx * k; man.pos.z += dz * k; man.v = 2.2; man.yaw = turnTo(man.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8)); }
    else { const was = man.out; man.v = 0; man.yaw = turnTo(man.yaw, car.rotation.y, 1 - Math.exp(-dt * 8)); man.out -= dt / 0.95; if (was >= 1) sound?.event('doorOpen'); if (man.out <= 0) { sound?.event('doorClose'); endMan(); return; } }
  } else {
    const f = (pressed('w', 'arrowup') ? 1 : 0) - (pressed('s', 'arrowdown') ? 1 : 0), r = (pressed('d', 'arrowright') ? 1 : 0) - (pressed('a', 'arrowleft') ? 1 : 0), go = f || r;
    if (go) man.down = false;
    const cy = seq.camYaw + look.yaw, dx = Math.sin(cy) * f - Math.cos(cy) * r, dz = Math.cos(cy) * f + Math.sin(cy) * r, n = Math.hypot(dx, dz) || 1;
    man.v += ((go && man.crouch < 0.3 ? (keys.has('shift') ? 3.3 : 1.6) : 0) - man.v) * (1 - Math.exp(-dt * 9));
    if (go) { man.pos.x += dx / n * man.v * dt; man.pos.z += dz / n * man.v * dt; man.yaw = turnTo(man.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10)); }
    // solid things, then the road's edges (found in the road's own terms: how far along, how far across)
    if (simTime - man.obstAt > 1) { man.obstAt = simTime; findObstacles(); }
    pushOut(man.pos);
    let a = route.at(man.s, P); man.s = clamp(man.s + (man.pos.x - a.p.x) * a.t.x + (man.pos.z - a.p.z) * a.t.z, Math.max(6, drive.s - 120), Math.min(route.length - 12, drive.s + 120));
    a = route.at(man.s, P); const lat = clamp((man.pos.x - a.p.x) * a.r.x + (man.pos.z - a.p.z) * a.r.z, -(ROAD.half - 0.4), world.shoulderAt(man.s) - 0.55);
    man.pos.x = a.p.x + a.r.x * lat; man.pos.z = a.p.z + a.r.z * lat;
  }
  man.pos.y = groundAt(man.pos);
  // crouching: by whatever is nearest, which he turns to face and the camera closes in on
  const wasDown = man.crouch > 0.02; man.crouch = clamp(man.crouch + (man.down ? dt / 0.45 : -dt / 0.4), 0, 1);
  if (man.down && !wasDown) {
    let best = null, bd = 4.6;
    for (const e of exhibits.list) { if (!e.ready || !e.focus || Math.abs(e.st.s - man.s) > 30) continue; e.focus.updateWorldMatrix(true, true); fbox.setFromObject(e.focus); if (fbox.isEmpty()) continue; fbox.getCenter(v3b); const d = Math.hypot(v3b.x - man.pos.x, v3b.z - man.pos.z) - Math.hypot(fbox.max.x - fbox.min.x, fbox.max.z - fbox.min.z) / 2; if (d < bd) { bd = d; best = e; } }
    seq.focus = best ? best.focus : null; seq.focusSet = false; seq.focusR0 = 0; seq.since = 1; man.yaw0 = look.yaw; man.pitch0 = look.pitch;
  }
  if (man.crouch <= 0 && !man.down) seq.focus = null;
  // what the camera and the figure read
  seq.st = stops[0]; seq.out = man.out; seq.pos.copy(man.pos); seq.v = man.v; seq.low = man.crouch * man.crouch * (3 - 2 * man.crouch); seq.yaw = man.yaw; seq.shoulder = 0.62;
  trackFocus(dt);
  if (seq.focus && seq.focusSet && man.crouch > 0) man.yaw = turnTo(man.yaw, Math.atan2(seq.focusAt.x - man.pos.x, seq.focusAt.z - man.pos.z), 1 - Math.exp(-dt * 6));
  show('inspect', man.phase === 'walk', on => document.body.classList.toggle('inspect', on));
  const g = person.group;
  if (man.out < 0.45) { if (g.parent !== car) car.add(g); g.position.set(SEAT[0], SEAT[1], SEAT[2]); g.rotation.set(0, 0, 0); person.update(dt, 1, 0, 0, dt); return; }
  if (g.parent !== scene) scene.add(g);
  const up = smooth(0.45, 1, man.out); g.position.copy(man.pos); g.position.x -= Math.cos(car.rotation.y) * (1 - up) * 0.5; g.position.z += Math.sin(car.rotation.y) * (1 - up) * 0.5; g.position.y -= (1 - up) * 0.42;
  g.rotation.set(0, man.yaw, 0);
  const steps = person.update(dt, 0, man.v, 0, dt, seq.low);
  if (steps && sound?.on) sound.event('footstep', { gain: 0.8, pan: 0 });
}

// ------------------------------------------------------------------ three ways to see it
// The tour (scrolling runs the film), free driving (the keys drive the car), and the page (the same content as an
// ordinary scrolling page, no road).
let mode = 'tour';
function goStop(st) {
  if (mode === 'free') { if (man.on) endMan(); drive.s = st.i ? st.s - PARK : st.s; drive.lane = laneAt(drive.s); drive.v = 0; free.yaw = 0; free.st = null; free.q = 0; camState.ready = false; }
  else cutTo(st.i ? st.y0 + (st.y1 - st.y0) * (st.last ? BEAT.end : BEAT.sign[1] + 0.03) : 0);
}
function setMode(m) {
  if (m === mode) return; const was = mode; mode = m;
  if (man.on) endMan(); closePanel(); keys.clear(); { const b = $('#outBtn'); if (b) b.hidden = true; delete shownAs.freebtn; } free.st = null; free.q = 0; free.goal = 0; free.yaw = 0; seq.st = null; seq.out = 0; seq.d = 0; drive.pedal = 0;
  document.body.classList.toggle('no3d', m === 'page'); document.body.classList.toggle('free', m === 'free');
  for (const b of $$('#modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  for (const c of ['inspect', 'looking', 'onsign', 'atend']) document.body.classList.remove(c); for (const k of ['inspect', 'signhover', 'atend']) delete shownAs[k];
  if (m === 'page') { $('#loader')?.remove(); if (sound?.on) $('#soundBtn')?.click(); hero.style.transform = ''; hero.style.visibility = ''; delete shownAs.heroY; scrollTo(0, 0); }
  else {
    scrollTo(0, 0);
    if (m === 'tour') {
      // pick the film up where the car is: the place in it that puts the car there
      let lo = 0, hi = vs.max; const s = was === 'free' ? drive.s : timeline(vs.pos, {}).s; if (was === 'free') { for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (timeline(mid, {}).s < s) lo = mid; else hi = mid; } cutTo(hi); } else cutTo(vs.pos);
    } else { drive.v = 0; drive.a = 0; hero.style.visibility = 'hidden'; delete shownAs.heroY; if (drive.s < stops[0].s + 1) drive.s = stops[0].s; camState.ready = false; }
  }
  try { history.replaceState(null, '', m === 'tour' ? location.pathname + location.hash : '?mode=' + m + location.hash); } catch {}
  activity();
}
for (const b of $$('#modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));
addEventListener('keydown', e => {
  if (mode !== 'free' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('.dest.open, input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(k)) { keys.add(k); if (k !== 'shift') e.preventDefault(); }
  else if (k === 'c' && !e.repeat) toggleCrouch();
  else if ((k === 'e' || k === 'enter') && !e.repeat && !e.target.closest?.('button, a')) { e.preventDefault(); freeAct(); }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase())); addEventListener('blur', () => keys.clear());
$('#outBtn')?.addEventListener('click', freeAct);
function toggleCrouch() { if (man.on && man.phase === 'walk') man.down = !man.down; }
// on a touch screen: four buttons that are the four keys
for (const b of $$('#pad button')) { const k = b.dataset.key, up = () => keys.delete(k); b.addEventListener('pointerdown', e => { e.preventDefault(); if (k === 'c') return toggleCrouch(); keys.add(k); b.setPointerCapture?.(e.pointerId); }); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up); }

// ------------------------------------------------------------------ the camera
// On the road the camera rides behind the car, the way a driving game's chase camera does: low, close, the road ahead
// over the roof; speed pulls it back and opens the lens. At a destination it goes ahead of the car and looks back, so
// the exhibit and the car are lit from the side with the sea behind them. Positions are (along, right, up) from the
// car, or from the destination.
const CHASE = { pos: [-6.3, 0, 2.0], look: [6, 0, 1.05], fov: 47 };
// The opening. The page loads on the car from the front; scrolling walks the camera round it to the chase position
// (out over the drop: that is the sunlit side, and the other way round looks straight into the sun), and only then
// does the car pull away.
const OPEN = { a0: Math.atan2(5.1, 11.5), a1: Math.PI, r0: 12.6, h0: 1.25, look0: [-2.2, -3.0, 0.78], look0tall: [-0.4, 0, 3.3], mid: [0, 0, 0.8], fov0: 30 };
const intro = { k: 0, set: false, pos: [0, 0, 0], look: [0, 0, 0], fov: 30 };
function opening(e) {
  const a = lerp(OPEN.a0, OPEN.a1, e), r = lerp(OPEN.r0, Math.hypot(CHASE.pos[0], CHASE.pos[1]), smooth(0, 0.62, e)), h = lerp(OPEN.h0, CHASE.pos[2], e) + Math.sin(Math.PI * e) * 0.25;
  intro.pos[0] = Math.cos(a) * r; intro.pos[1] = Math.sin(a) * r; intro.pos[2] = h;
  const k1 = smooth(0, 0.45, e), k2 = smooth(0.66, 1, e), l0 = camera.aspect < 0.9 ? OPEN.look0tall : OPEN.look0;   // on a phone the car sits under the words, not beside them
  for (let i = 0; i < 3; i++) intro.look[i] = lerp(lerp(l0[i], OPEN.mid[i], k1), CHASE.look[i], k2);
  intro.fov = lerp(OPEN.fov0, CHASE.fov, smooth(0.12, 0.6, e));
}
const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, ready: false, off: 0 };
const frameOf = (s, pos, out) => { const a = route.at(s, Q); return out.copy(a.p).addScaledVector(a.t, pos[0]).addScaledVector(a.r, pos[1]).setY(a.p.y + pos[2]); };
function carFrame(pos, out) { const h = drive.view ?? route.at(drive.s, Q).heading, sn = Math.sin(h), cs = Math.cos(h); out.set(car.position.x + sn * pos[0] - cs * pos[1], car.position.y + pos[2], car.position.z + cs * pos[0] + sn * pos[1]); return out; }
const side = () => innerWidth >= 900;
function directCamera(dt) {
  if (window.__drive?.cam) { const f = window.__drive.cam; frameOf(f.s ?? drive.s, f.pos, camera.position); frameOf(f.s ?? drive.s, f.look, v3); camera.lookAt(v3); camera.fov = f.fov || 45; camera.clearViewOffset(); camera.updateProjectionMatrix(); return; }   // dev: a camera pinned to the road
  const [st, d] = nearestStop(drive.s);
  const sp = Math.min(1.15, Math.abs(drive.v) / VMAX), e = intro.k * intro.k * (3 - 2 * intro.k);
  // on the road: behind the car
  v3.set(CHASE.pos[0] - sp * 1.7, CHASE.pos[1], CHASE.pos[2] + sp * 0.2); const travelPos = carFrame(v3.toArray(A3), v3c), travelLook = carFrame(CHASE.look, v3d);
  let fov = CHASE.fov;
  // at the start, wherever the opening has got to
  const w = st.i === 0 ? 1 - smooth(10, 46, d) : 0;
  if (w > 0) { opening(e); travelPos.lerp(carFrame(intro.pos, v3b), w); travelLook.lerp(carFrame(intro.look, v3b), w); fov = lerp(fov, intro.fov, w); }
  // on foot: behind the driver and over his right shoulder, the way a third-person game follows its character. It
  // keeps facing up the road while he walks about in front of it (he turns, it does not); only a drag turns it.
  const kp = seq.st ? smooth(0.3, 1, seq.out) : 0;
  if (kp > 0) {
    // (on a tall screen it stands further back, square behind his shoulder, so the sign fits across)
    const tall = camera.aspect < 0.9, near = man.on ? 1 : 1 - seq.study, yaw = seq.camYaw + look.yaw * near, pitch = clamp(0.1 + look.pitch * near, -0.35, 1.0), dist = (tall ? 3.1 : 2.5) * look.zoom, fx = Math.sin(yaw), fz = Math.cos(yaw), sx = -fz, sz = fx;   // (sx, sz): his right
    const p = seq.pos, back = Math.cos(pitch) * dist;
    v3b.set(p.x - fx * back + sx * seq.shoulder, p.y + 1.62 - seq.low * 0.5 + Math.sin(pitch) * dist, p.z - fz * back + sz * seq.shoulder);   // (it comes down with him when he crouches)
    v3b.y = Math.max(v3b.y, groundAt(v3b) + 0.3);
    travelPos.lerp(v3b, kp);
    const lead = seq.shoulder * (tall ? 1 : 0.7); v3b.set(p.x + fx * 6 + sx * lead, p.y + 1.5 - seq.low * 0.75 - Math.sin(pitch) * 6, p.z + fz * 6 + sz * lead); travelLook.lerp(v3b, kp);
    fov = lerp(fov, 50, kp);
    // When he stops to look at something, so does the view: the camera goes in past his shoulder and shows the thing
    // itself, close, from his side of it and a little round from him. Here a drag goes round the thing, and a pinch
    // goes in and out.
    const ks = man.on ? seq.low : seq.study, kc = ks * ks * (3 - 2 * ks), I = man.on ? null : seq.at;
    if (kc > 0.001 && seq.focus && seq.focusSet) {
      const az = Math.atan2(seq.pos.x - seq.focusAt.x, seq.pos.z - seq.focusAt.z) + (I?.side || 1) * 0.85 + look.yaw - (man.on ? man.yaw0 : 0), el = clamp((I?.el ?? 0.32) + look.pitch - (man.on ? man.pitch0 : 0), 0.04, 1.25), r = (I?.r || seq.focusR) * look.zoom * (camera.aspect < 0.9 ? 1.3 : 1), c = seq.focusAt;
      v3b.set(c.x + Math.sin(az) * Math.cos(el) * r, Math.max(c.y + Math.sin(el) * r, seq.pos.y + 0.3), c.z + Math.cos(az) * Math.cos(el) * r);
      travelPos.lerp(v3b, kc); travelLook.lerp(c, kc); fov = lerp(fov, 40, kc);
    }
  }
  // speed opens the lens and shakes it a little
  fov += sp * 13 * (1 - w);
  const kf = camState.ready ? 1 - Math.exp(-dt * lerp(3.2, 12, kp)) : 1;
  // (smoothed relative to the car, so the camera never falls behind at speed)
  camState.pos.lerp(travelPos.sub(car.position), kf); camState.look.lerp(travelLook.sub(car.position), camState.ready ? 1 - Math.exp(-dt * lerp(5, 12, kp)) : 1); camState.fov = lerp(camState.fov, fov, kf); camState.ready = true;
  camera.position.copy(camState.pos).add(car.position); v3b.copy(camState.look).add(car.position);
  if (!reduce) { const t = performance.now() / 1000, j = sp * sp * 0.035; camera.position.x += Math.sin(t * 31) * j; camera.position.y += Math.sin(t * 47 + 1) * j; }
  camera.position.y = Math.max(camera.position.y, route.at(drive.s, Q).p.y - 40);
  camera.lookAt(v3b);
  // on a narrow screen fit the wider of the frame's needs by opening the lens; on a wide one leave room for the card
  const portrait = camera.aspect < 0.9; camera.fov = clamp(camState.fov * (portrait ? 1.55 : 1), 20, 82);
  camState.off = lerp(camState.off, side() && w > 0.5 ? -innerWidth * 0.2 * (1 - smooth(0.05, 0.7, e)) : 0, 1 - Math.exp(-dt * 6));   // (the opening leaves room for the name)
  if (Math.abs(camState.off) > 1) camera.setViewOffset(innerWidth, innerHeight, camState.off, 0, innerWidth, innerHeight); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ at a destination: the driver gets out
// The car parks; scroll on and the driver gets out, walks round the bonnet and up to the sign that stands beside the
// exhibit, with the camera following behind him. A drag looks around from where he is. Scrolling on sends him back
// to the car, and the car waits for him. Like the car, he is not scrubbed by the scroll: the scroll says where he
// should be and he walks there.
const SEAT = [0.36, -0.2, 0.02];     // the driver's seat, in the car's own frame (x is the car's left)
const seq = { st: null, built: false, fresh: false, q: 0, out: 0, d: 0, v: 0, L: 0, pts: [], len: [0], yaw: 0, camYaw: 0, shoulder: 0.62, pos: new THREE.Vector3(), face: new THREE.Vector3(), marks: [0], info: [], at: null, k: -1, study: 0, low: 0, focus: null, focusAt: new THREE.Vector3(), focusGoal: new THREE.Vector3(), focusR: 2, focusR0: 0, focusSet: false, since: 1 };
const fbox = new THREE.Box3();
const look = { yaw: 0, pitch: 0, zoom: 1, drag: null, used: false, moved: 0 };
let person = null;
const groundAt = p => { const a = route.at(drive.s, P), fwd = (p.x - car.position.x) * a.t.x + (p.z - car.position.z) * a.t.z, lat = drive.lane + (p.x - car.position.x) * a.r.x + (p.z - car.position.z) * a.r.z; return route.at(drive.s + fwd, Q).p.y - Math.min(lat, world.shoulderAt(drive.s + fwd)) * 0.018 + 0.005; };
// His way round a stop: out of the driver's door, forward along the car, round the bonnet, to the spot in front of the
// sign; then to each place this exhibit asks to be looked at from, in order (drive/exhibits.js: every one is
// different); then back to the door. It is one line, walked from end to end as the stop is scrolled through.
function planWalk(st) {
  const a = route.at(drive.s, P), c = car.position, at = (fwd, right) => new THREE.Vector3().copy(c).addScaledVector(a.t, fwd).addScaledVector(a.r, right);
  const e = exhibits.list.find(x => x.st === st && x.ready), door = at(0.2, -1.42), w1 = at(2.95, -1.25), w2 = at(3.6, 0.75);
  seq.focus = null; seq.focusSet = false; seq.focusR0 = 0; seq.since = 1; seq.info = []; seq.k = -1; seq.study = 0;
  const local = ([x, z]) => e.frame.localToWorld(new THREE.Vector3(x, 0, z)), stand = [];
  let sign;
  if (e?.sign) { sign = e.sign.stand.clone(); seq.face.copy(e.sign.face); }
  else { sign = at(7.5, Math.min(2.6, world.shoulderAt(st.s) - 0.9 - drive.lane)); seq.face.copy(sign).addScaledVector(a.r, 30); }   // not built yet: he goes and looks out over the drop
  const out = [door, w1, w2, sign];
  if (e?.tour?.length && e.frame) {
    e.frame.updateWorldMatrix(true, false);
    for (const p of e.tour) { for (const v of p.via || []) out.push(local(v)); const w = local(p.at); out.push(w); stand.push(w); seq.info.push({ ...p, off: p.off ? new THREE.Vector3(...p.off).applyQuaternion(e.frame.getWorldQuaternion(new THREE.Quaternion())) : null }); }
  }
  const last = out.at(-1), home = [last, ...(seq.info.length ? (e.home || []).map(local) : []), w2, w1, door];
  const goes = new THREE.CatmullRomCurve3(out, false, 'centripetal', 0.5), comes = new THREE.CatmullRomCurve3(home, false, 'centripetal', 0.5);
  const A = goes.getSpacedPoints(Math.max(48, Math.round(goes.getLength() * 7))), B = comes.getSpacedPoints(Math.max(32, Math.round(comes.getLength() * 7)));
  seq.pts = A.concat(B.slice(1)); for (const p of seq.pts) p.y = groundAt(p);
  seq.L = 0; seq.len = [0]; for (let i = 1; i < seq.pts.length; i++) { seq.L += Math.hypot(seq.pts[i].x - seq.pts[i - 1].x, seq.pts[i].z - seq.pts[i - 1].z); seq.len.push(seq.L); }
  // how far along that line each place is (searched in order, since the line may pass near a place twice)
  seq.marks = []; let from = 0;
  for (const w of [sign, ...stand]) { let best = 1e9, at1 = from; for (let i = from; i < A.length; i++) { const k = Math.hypot(A[i].x - w.x, A[i].z - w.z); if (k < best) { best = k; at1 = i; } } seq.marks.push(seq.len[at1]); from = at1; }
  seq.v = 0; seq.yaw = seq.camYaw = a.heading; seq.pos.copy(seq.pts[0]); seq.shoulder = 0.62;
}
// how far along that line he is at q of the way through the stop; also which place he is at (seq.k: 0 the sign, 1.. the
// exhibit's own, -1 on his way) and how far into looking at it (seq.study)
function walkAt(q) {
  const m = seq.marks, n = m.length - 1;
  let d = m[0] * ease(seg(q, BEAT.sign)), k = q >= BEAT.sign[1] ? 0 : -1, study = 0;
  if (n > 0) {
    const [a, b] = BEAT.pts, w = (b - a) / n, go = 0.34;
    for (let i = 0; i < n; i++) {
      const q0 = a + i * w, q1 = q0 + w * go; d += (m[i + 1] - m[i]) * ease(seg(q, [q0, q1]));
      if (q > q0) k = -1;
      if (q >= q1 && q <= q0 + w) { k = i + 1; const u = (q - q1) / (w - w * go); study = smooth(0, 0.2, u) * (1 - smooth(0.86, 1, u)); }
    }
  }
  d += (seq.L - m[n]) * ease(seg(q, BEAT.back)); if (q > BEAT.back[0]) k = -1;
  seq.k = k; seq.study = study; return d;
}
// where the film has him: how far out of his seat, how far along his way, by how far through the stop the scroll is
function stepSeq(dt, now) {
  const st = person && !reduce ? now.st : null, q = now.q;
  if (!st) { if (seq.st) { seq.st = null; seq.out = 0; seq.d = 0; seq.v = 0; seq.low = 0; seq.study = 0; seq.k = -1; seq.focus = null; } look.yaw = 0; look.pitch = 0; look.zoom = 1; show('inspect', false, on => document.body.classList.toggle('inspect', on)); if (panel.open) closePanel(); return; }
  const built = !!exhibits.list.find(x => x.st === st && x.ready)?.sign;
  if (seq.st !== st || seq.built !== built) { seq.st = st; seq.built = built; planWalk(st); seq.fresh = true; }
  const out = seg(q, BEAT.out) * (1 - seg(q, BEAT.in)), d = walkAt(q);
  // the door, heard as he passes through it either way
  if (!seq.fresh && !tl.snapped) { for (const k of [0.12, 0.88]) if ((seq.out < k) !== (out < k)) sound?.event((out > seq.out) === (k < 0.5) ? 'doorOpen' : 'doorClose'); }
  seq.v = seq.fresh || tl.snapped || dt <= 0 ? 0 : seq.v + ((d - seq.d) / dt - seq.v) * (1 - Math.exp(-dt * 10)); if (Math.abs(seq.v) < 0.03) seq.v = 0;
  seq.out = out; seq.d = d; seq.q = q; seq.fresh = false;
  // what he is looking at now
  const info = seq.k > 0 ? seq.info[seq.k - 1] : null, focus = info?.look || null;
  if (focus !== seq.focus && (focus || seq.study === 0)) { seq.focus = focus; seq.focusSet = false; seq.focusR0 = 0; seq.since = 1; seq.at = info; }
  seq.low = info?.low ? seq.study : 0;
  const afoot = out > 0.9;
  if ((!afoot || (seq.wasLow && seq.study === 0)) && !look.drag) { look.yaw = 0; look.pitch = 0; look.zoom = 1; } else if (q > BEAT.back[0] && !look.drag) { const k = Math.exp(-dt * 3); look.yaw *= k; look.pitch *= k; look.zoom = 1 + (look.zoom - 1) * k; }
  seq.wasLow = seq.study > 0;
  show('inspect', afoot && q < BEAT.back[0] + 0.04, on => document.body.classList.toggle('inspect', on));
  if (panel.open && (panel.open !== st || q > BEAT.back[0] + 0.04 || q < BEAT.sign[0])) closePanel();
}
const turnTo = (from, to, k) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;
function placePerson(dt) {
  if (!person) return;
  const g = person.group;
  if (!seq.st || seq.out < 0.45) {
    if (g.parent !== car) car.add(g);
    g.position.set(SEAT[0], SEAT[1], SEAT[2]); g.rotation.set(0, 0, 0); person.update(dt, 1, 0, 0, dt);
    if (seq.st) seq.pos.copy(seq.pts[0]);
    return;
  }
  if (g.parent !== scene) scene.add(g);
  // where he is on his way
  let i = 1; while (i < seq.len.length - 1 && seq.len[i] < seq.d) i++;
  const a = seq.pts[i - 1], b = seq.pts[i], k = clamp((seq.d - seq.len[i - 1]) / (seq.len[i] - seq.len[i - 1] || 1), 0, 1);
  seq.pos.lerpVectors(a, b, k);
  // getting out: he comes up out of the seat and steps clear of the door
  const up = smooth(0.45, 1, seq.out), ca = route.at(drive.s, Q);
  g.position.copy(seq.pos).addScaledVector(ca.r, (1 - up) * 0.5); g.position.y -= (1 - up) * 0.42;
  // he faces the way he is going (scroll back and he turns round and goes back); stopped somewhere, he faces what is there
  const moving = Math.abs(seq.v) > 0.12, arrived = seq.k >= 0 && !moving, f = seq.k > 0 ? (seq.focusSet ? seq.focusAt : seq.pos) : seq.face, atDoor = seq.d < 0.06 || seq.d > seq.L - 0.06;
  const to = moving ? Math.atan2((b.x - a.x) * Math.sign(seq.v), (b.z - a.z) * Math.sign(seq.v)) : arrived && f !== seq.pos ? Math.atan2(f.x - seq.pos.x, f.z - seq.pos.z) : atDoor ? ca.heading : seq.yaw;
  seq.yaw = tl.snapped ? to : turnTo(seq.yaw, to, 1 - Math.exp(-dt * (moving ? 7 : 4))); g.rotation.set(0, seq.yaw, 0);
  // standing still, the camera sits further off his shoulder so he is not between it and the sign
  seq.shoulder += ((arrived ? 1.1 : 0.62) - seq.shoulder) * (1 - Math.exp(-dt * 1.6));
  trackFocus(dt);
  const steps = person.update(dt, 0, Math.min(Math.abs(seq.v), 6), arrived ? 1 : 0, dt, seq.low);
  if (steps && sound?.on) { v3.copy(g.position).project(camera); sound.event('footstep', { gain: clamp(5 / camera.position.distanceTo(g.position), 0.3, 1), pan: clamp(v3.x, -1, 1) }); }
}
// what the close view is of may be moving (the rover walks and jumps): measure it a few times a second
function trackFocus(dt) {
  if (seq.focus && (seq.k > 0 || seq.low > 0) && (seq.since += dt) > 0.2) {
    seq.since = 0; seq.focus.updateWorldMatrix(true, true); fbox.setFromObject(seq.focus);
    if (!fbox.isEmpty()) { fbox.getCenter(seq.focusGoal); if (!man.on && seq.at?.off) seq.focusGoal.add(seq.at.off); fbox.getSize(v3); seq.focusR = seq.focusR0 || (seq.focusR0 = clamp(Math.hypot(v3.x, v3.y, v3.z) * 0.92 + 0.45, 1.0, 5.2)); if (!seq.focusSet) { seq.focusAt.copy(seq.focusGoal); seq.focusSet = true; } }
  }
  if (seq.focusSet) seq.focusAt.lerp(seq.focusGoal, 1 - Math.exp(-dt * 3));
}
// ---- the full write-up, on request: clicking the sign opens that project's card as a panel (it never opens itself)
const panel = { open: null };
function closePanel() { if (!panel.open) return; panel.open.el.querySelector('.dest')?.classList.remove('open'); panel.open = null; document.body.classList.remove('reading'); }
function openPanel(st) {
  if (panel.open === st) return closePanel(); closePanel();
  const card = st.el.querySelector('.dest'); if (!card) return;
  if (!card.querySelector('.shut')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'shut'; b.setAttribute('aria-label', 'Close'); b.textContent = '×'; b.addEventListener('click', closePanel); card.prepend(b); }
  card.classList.add('open'); card.scrollTop = 0; panel.open = st; document.body.classList.add('reading');
}
addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
// dragging looks around from where he stands; a pinch (or ctrl + wheel) moves the camera in and out; a click on the
// sign opens the write-up. Scrolling stays scrolling.
{
  const ui = '.dest, .top, #dash, #map, #lightbox, a, button, summary, video, input, textarea, select, label';
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const signUnder = e => { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObject(scene.getObjectByName('exhibits'), true).find(h => h.object.visible); return hit && hit.object.name === 'placard' && hit.distance < 14 ? hit.object.userData.stop : null; };
  addEventListener('pointerdown', e => { if (e.button || e.target.closest?.(ui)) return; look.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, can: document.body.classList.contains('inspect') }; look.moved = 0; if (look.drag.can) document.body.classList.add('looking'); });
  addEventListener('pointermove', e => {
    const d = look.drag; if (!d || e.pointerId !== d.id) return;
    look.moved += Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y);
    if (d.can) { look.yaw -= (e.clientX - d.x) * 0.0052; if (e.pointerType !== 'touch') look.pitch = clamp(look.pitch + (e.clientY - d.y) * 0.0036, -0.45, 0.9); if (!look.used && look.moved > 12) { look.used = true; document.body.classList.add('looked'); } }
    d.x = e.clientX; d.y = e.clientY;
  });
  addEventListener('pointerup', e => {
    if (!look.drag || e.pointerId !== look.drag.id) return; look.drag = null; document.body.classList.remove('looking');
    if (look.moved < 6 && !e.target.closest?.(ui)) { const st = signUnder(e); if (st) openPanel(st); else if (panel.open) closePanel(); }
  });
  addEventListener('pointercancel', e => { if (look.drag && e.pointerId === look.drag.id) { look.drag = null; document.body.classList.remove('looking'); } });
  addEventListener('wheel', e => { if (!e.ctrlKey || !document.body.classList.contains('inspect') || e.target.closest?.('.dest.open')) return; e.preventDefault(); look.zoom = clamp(look.zoom * Math.exp(e.deltaY * 0.01), 0.5, 1.8); }, { passive: false });
  // free drive on foot: a click gives the mouse to the camera (Escape takes it back); then a click reads the sign in the middle of the view
  const locked = () => !!document.pointerLockElement;
  addEventListener('mousedown', e => {
    if (mode !== 'free' || !man.on || man.phase !== 'walk' || e.button) return;
    if (locked()) { const st = signUnder({ clientX: innerWidth / 2, clientY: innerHeight / 2 }); if (st) { document.exitPointerLock(); openPanel(st); } }
    else if (!e.target.closest?.(ui) && !panel.open) { try { const p = document.body.requestPointerLock?.(); p?.catch?.(() => {}); } catch {} }
  });
  addEventListener('mousemove', e => { if (!locked() || mode !== 'free') return; look.yaw -= e.movementX * 0.0026; look.pitch = clamp(look.pitch + e.movementY * 0.0021, -0.45, 0.9); });
  document.addEventListener('pointerlockchange', () => document.body.classList.toggle('locked', locked()));
  let hoverAt = 0;
  addEventListener('pointermove', e => { if (look.drag || e.pointerType === 'touch' || performance.now() - hoverAt < 90) return; hoverAt = performance.now(); show('signhover', !e.target.closest?.(ui) && !!signUnder(e), on => document.body.classList.toggle('onsign', on)); });
}

// ------------------------------------------------------------------ sound (off until asked for; the code and the recordings load then)
let sound = null;
const heard = { dt: 0, rpm: 750, throttle: 0, speed: 0, reverse: false, brake: 0, decel: 0, lateral: 0, blinker: false, view: { dist: 8, pan: 0, behind: 1 }, sea: { pan: 0, gain: 0.7 } };
{
  const btn = $('#soundBtn'); let loading = null;
  const set = on => { btn?.setAttribute('aria-pressed', String(on)); document.body.classList.toggle('sound', on); try { localStorage.setItem('sound', on ? '1' : '0'); } catch {} };
  const turnOn = () => (loading ||= import('./sound.js').then(m => { sound = m.createSound(); return sound; })).then(s => s.supported ? s.enable().then(() => set(true)) : null).catch(e => { console.warn('sound', e); loading = null; });
  btn?.addEventListener('click', () => { if (sound?.on) { sound.disable(); set(false); } else turnOn(); });
  // someone who had it on last time gets it back on their first click or key (a browser will not start sound before one)
  let again = false; try { again = localStorage.getItem('sound') === '1'; } catch {}
  if (again && btn) { const once = e => { removeEventListener('pointerdown', once, true); removeEventListener('keydown', once, true); if (!e.target.closest?.('#soundBtn')) turnOn(); }; addEventListener('pointerdown', once, true); addEventListener('keydown', once, true); }
}
let lastGear = 0;
function updateSound(dt) {
  if (!sound?.on) return;
  const v = Math.abs(drive.v), a = route.at(drive.s, Q), h = heard, along = drive.a * Math.sign(drive.v || 1);
  h.dt = dt; h.speed = v; h.reverse = drive.v < -0.05; h.brake = drive.brake; h.decel = Math.max(0, -along); h.lateral = v * v * Math.abs(a.curvature);
  h.rpm = drive.rpm * 6750;
  h.throttle = v < 0.2 ? 0 : clamp(Math.max(along / 8.5, along > -0.6 ? 0.14 + a.grade * 2.5 + v / VMAX * 0.25 : 0), 0, 1);
  h.blinker = v > 0.4 && (Math.abs(laneAt(drive.s) - drive.lane) > 0.12 || Math.abs(laneAt(drive.s + drive.v * 1.6) - laneAt(drive.s)) > 0.06);
  v3.subVectors(camera.position, car.position); h.view.dist = v3.length(); h.view.behind = clamp(0.5 - 0.5 * (v3.x * a.t.x + v3.z * a.t.z) / (Math.hypot(v3.x, v3.z) || 1), 0, 1);
  v3b.copy(car.position).project(camera); h.view.pan = clamp(v3b.x, -1, 1);
  // the sea is on the driver's right; how much of it the camera faces decides where it sits
  v3c.setFromMatrixColumn(camera.matrixWorld, 0); h.sea.pan = clamp(v3c.x * a.r.x + v3c.z * a.r.z, -1, 1);
  h.sea.gain = clamp(0.55 + 0.03 * ((camera.position.x - a.p.x) * a.r.x + (camera.position.z - a.p.z) * a.r.z), 0.4, 1);
  if (drive.gear !== lastGear) { if (lastGear && drive.gear && v > 2) sound.event('shift'); lastGear = drive.gear; }
  sound.update(h);
}

// ------------------------------------------------------------------ the dashboard
const dash = { needle: $('#needle'), mph: $('#mph'), gear: $('#gear'), rpm: $('#rpm'), next: $('#nextStop'), dist: $('#nextDist'), trip: $('#trip'), alt: $('#alt'), el: $('#dash'), shown: -1, brake: $('#brakeLamp'), map: $('#map'), togo: $('#togo'), stopn: $('#stopN') };
const minimap = $('#mapCanvas') ? createMinimap($('#mapCanvas'), route, stops) : null;
const GEAR_RATIOS = [0, 3.45, 2.05, 1.48, 1.1, 0.87, 0.71];
const GEARS = [0, 9, 17, 26, 36, 47, 62];   // m/s where each gear ends
// (only what changed is written: every write to the page costs a style pass, and most frames nothing changes)
const shownAs = {}, show = (key, v, apply) => { if (shownAs[key] !== v) { shownAs[key] = v; apply(v); } };
function updateDash() {
  const v = Math.abs(drive.v), mph = v * 2.23694;
  show('needle', Math.round((-120 + Math.min(mph, 140) / 140 * 240) * 5) / 5, a => dash.needle?.setAttribute('transform', `rotate(${a} 100 100)`));
  show('mph', Math.round(mph), n => { if (dash.mph) dash.mph.textContent = n; });
  // Hold the gear across small speed fluctuations. Shaft speed follows wheel speed
  // through the selected ratio, so an upshift drops revs in proportion to the ratio change.
  let g = Math.max(1, drive.gear);
  while (g < 6 && v > GEARS[g]) g++;
  while (g > 1 && v < GEARS[g - 1] * 0.78) g--;
  const ratio = drive.v < 0 ? 3.15 : GEAR_RATIOS[g];
  const shaftRpm = v * 60 / (2 * Math.PI * wheelR) * 4.3 * ratio;
  const launchSlip = 500 * smooth(0.1, 2, v) * (1 - smooth(2, 6, v));
  const rpm = clamp((Math.max(750, shaftRpm) + launchSlip) / 6750, 750 / 6750, 1);
  drive.gear = v < 0.2 ? 0 : g; drive.rpm = rpm;
  show('gear', v < 0.2 ? 'P' : drive.v < 0 ? 'R' : 'D' + g, t => { if (dash.gear) dash.gear.textContent = t; });
  show('rpm', Math.round(151 * (1 - rpm) * 2) / 2, o => { if (dash.rpm) dash.rpm.style.strokeDashoffset = String(o); });
  show('brake', drive.brake > 0.5, on => dash.brake?.classList.toggle('on', on));
  const nxt = stops.find(st => st.s - PARK > drive.s + 1.5);
  show('next', nxt ? `${nxt.n} ${nxt.label}` : 'You’ve arrived', t => { if (dash.next) dash.next.textContent = t; });
  const m = nxt ? nxt.s - PARK - drive.s : 0, ft = m * 3.28084;
  show('dist', nxt ? (ft > 950 ? (m / 1609.34).toFixed(2) + ' mi' : Math.round(ft / 10) * 10 + ' ft') : '', t => { if (dash.dist) dash.dist.textContent = t; });
  show('trip', (drive.trip / 1609.34).toFixed(2) + ' mi', t => { if (dash.trip) dash.trip.textContent = t; });
  show('alt', Math.round((route.at(drive.s, Q).p.y + 235) * 3.28084), n => { if (dash.alt) dash.alt.textContent = n.toLocaleString() + ' ft'; });
  // the map: hidden while the opening plays and while a write-up is open over its corner
  const end = stops.at(-1).s - PARK, left = Math.max(0, end - drive.s);
  show('togo', (left / 1609.34).toFixed(2) + ' mi', t => { if (dash.togo) dash.togo.textContent = t; });
  show('stopn', (nxt ? nxt.i - 1 : stops.length - 1) + ' / ' + (stops.length - 1), t => { if (dash.stopn) dash.stopn.textContent = t; });
  if (dash.map) {
    const covered = intro.k < 0.6 || !!panel.open;
    show('maphide', covered, on => dash.map.classList.toggle('hide', on));
    if (!covered) minimap?.draw(drive.s, route.at(drive.s, Q).heading, nxt ? nxt.i : -1);
  }
}

// ------------------------------------------------------------------ resize
function resize() {
  const w = innerWidth, h = innerHeight, d = pickDpr();
  if (d !== renderer.getPixelRatio()) renderer.setPixelRatio(d);
  renderer.setSize(w, h, false); composer.setSize(Math.floor(w * d), Math.floor(h * d));
  camera.aspect = w / h; camera.updateProjectionMatrix();
  measure();
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
let frames = 0, simTime = 0, slow = 0, running = false, lastTick = 0;
const seen = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 0, off: 0, drawn: 0 };
function frame(dtFixed) {
  if (mode === 'page') return;   // (the classic view is a page; nothing here runs)
  if (dtFixed == null) timer.update();
  const dt = dtFixed ?? Math.min(timer.getDelta(), 0.05);
  simTime += dt;
  let film;
  if (mode === 'free') {
    tl.snapped = !camState.ready; tl.dFilm = 0; intro.k = 1; stepFree(dt);
    film = NOW; film.s = drive.s; film.st = null; film.q = 0;
    show('atend', false, on => document.body.classList.toggle('atend', on));
  } else {
    // the film's time
    stepScroll(dt); tl.snapped = vs.cutNow || !tl.set; vs.cutNow = false; if (tl.snapped) camState.ready = false;
    tl.u = vs.pos; tl.set = true; const ft = tl.u * FILM; tl.dFilm = tl.snapped ? 0 : Math.abs(ft - tl.film); tl.film = ft;
    // the name and the buttons ride up out of the way as the film starts; the credits come up when it ends
    show('heroY', Math.round(Math.min(tl.u, innerHeight * 1.4)), y => { hero.style.transform = `translate3d(0,${-y}px,0)`; hero.style.visibility = y >= innerHeight * 1.4 ? 'hidden' : ''; });
    show('atend', tl.u > vs.max - 60, on => document.body.classList.toggle('atend', on));
    intro.k = clamp(tl.u / introY, 0, 1);
    film = timeline(tl.u);
    stepCar(dt, film.s);
  }
  if (mode === 'free' && man.on) stepMan(dt); else { stepSeq(dt, film); placePerson(dt); }
  directCamera(dt);
  world.update(camera, car.position);
  const live = exhibits.update(simTime, dt, drive.s, camera);   // (what stands at the stops runs on its own clock, scrolled or not)
  lens.uniforms.time.value = simTime % 10; lens.uniforms.speed.value = reduce || window.__drive?.cam ? 0 : smooth(0.35, 1, Math.abs(drive.v) / VMAX);
  updateDash(); updateSound(dt);
  // When nothing is moving (car parked, camera settled, no exhibit running) the picture only shimmers: sea and grain.
  // Drawing that at a quarter of the rate leaves the GPU mostly idle while someone reads.
  const o = camera.view, moved = dtFixed != null || frames < 4 || live > 0 || tl.dFilm > 0 || Math.abs(drive.v) > 0.01 || Math.abs(seq.v) > 0.01
    || camera.position.distanceToSquared(seen.pos) > 1e-8 || 1 - Math.abs(camera.quaternion.dot(seen.quat)) > 1e-10
    || Math.abs(camera.fov - seen.fov) > 1e-3 || (o && o.enabled ? o.offsetX : 0) !== seen.off;
  seen.pos.copy(camera.position); seen.quat.copy(camera.quaternion); seen.fov = camera.fov; seen.off = o && o.enabled ? o.offsetX : 0;
  const now = performance.now();
  if (moved || now - seen.drawn > 62) { seen.drawn = now; composer.render(dt); }
  if (++frames === 2) { performance.mark('first-frame'); document.body.classList.add('ready'); $('#loader')?.classList.add('done'); setTimeout(() => $('#loader')?.remove(), 1200); idle(pump); }
}
// If frames come late for a while (measured between frames, so a slow GPU counts, not just slow script), give up
// resolution first, then bloom, then the rest of the resolution, then shadow detail. If a step buys nothing, the
// screen itself is running slowly (a phone in low-power mode draws at 30): the step is undone and this stops.
const gov = { avg: 16.7, last: null, off: false };
function tick(time) {
  const gap = time - lastTick; lastTick = time;
  frame();
  if (gov.off || gap > 120) return;
  gov.avg += (gap - gov.avg) * 0.05;
  slow = gap > 21 ? slow + 1 : Math.max(0, slow - 0.5);
  if (slow <= 45) return;
  slow = 0;
  if (gov.last && gov.avg > gov.last.avg * 0.93) { gov.last.undo(); gov.off = true; return; }
  const d = renderer.getPixelRatio(), cap = DPR.cap, size = world.sun.shadow.mapSize.x;
  const shadows = n => { world.sun.shadow.mapSize.set(n, n); world.sun.shadow.map?.dispose(); world.sun.shadow.map = null; };
  if (d > 1.26) { DPR.cap = Math.max(1.25, d - 0.3); resize(); gov.last = { avg: gov.avg, undo() { DPR.cap = cap; resize(); } }; }
  else if (bloom.enabled) { bloom.enabled = false; gov.last = { avg: gov.avg, undo() { bloom.enabled = true; } }; }
  else if (d > 1) { DPR.cap = 1; resize(); gov.last = { avg: gov.avg, undo() { DPR.cap = cap; resize(); } }; }
  else if (size > 1024) { shadows(1024); gov.last = { avg: gov.avg, undo() { shadows(size); } }; }
  else gov.off = true;
}
// What stands at the destinations is built now, one exhibit at a time in idle moments, nearest to where the page is
// first. While the car is moving only what it is about to reach is built, so the drive does not hitch.
const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 400 }) : f => setTimeout(f, 60);
// The driver is fetched once the road is on screen, and takes his seat when his shaders are ready.
loadPerson().then(async p => { p.group.visible = true; await precompile(p.group); person = p; }).catch(e => console.warn('driver', e));
function pump() {
  const busy = Math.abs(drive.v) > 0.5 || (intro.k > 0.02 && intro.k < 0.98);
  const job = exhibits.buildNext(mode === 'free' ? drive.s : targetS(vs.target), busy ? 380 : Infinity);   // (nearest to where the car is heading)
  if (job) job.then(() => idle(pump)); else if (exhibits.builders.some(b => !b.started)) setTimeout(pump, 300);
}
function activity() { const run = !document.hidden && mode !== 'page' && !document.body.classList.contains('no3d'); if (run !== running) { running = run; timer.reset(); renderer.setAnimationLoop(run ? tick : null); } }
document.addEventListener('visibilitychange', activity);
await precompile(scene); performance.mark('compiled');
canvas.addEventListener('webglcontextrestored', () => { world.env.then?.(() => {}); activity(); });
document.body.classList.add('can3d'); if (query.get('mode') === 'free' || query.get('mode') === 'page') setMode(query.get('mode'));
dispatchEvent(new Event('drive:ready'));
activity();
// dev hook: step the loop by hand (headless browsers barely tick requestAnimationFrame)
window.__drive = { scene, camera, renderer, drive, route, stops, car, world, exhibits, camState, intro, OPEN, seq, look, panel, openPanel, freeDrive: free, man, keys, freeAct, setMode, get mode() { return mode; }, get person() { return person; }, get sound() { return sound; }, composer, bloom, lens, built: () => exhibits.buildAll(), advance(sec, step = 1 / 30) { for (let t = 0; t < sec; t += step) frame(step); }, vs, cutTo, push, HALT, LEG, BEAT, goto(i, settle = 0.2, q = 0.37) { const st = stops[i]; cutTo(i ? st.y0 + (st.y1 - st.y0) * q : 0); for (let t = 0; t < settle * 30; t++) frame(1 / 30); }, run(px, rate = 600, step = 1 / 30) { for (let left = Math.abs(px); left > 0; left -= rate * step) { push(Math.sign(px) * Math.min(left, rate * step)); frame(step); } } };
