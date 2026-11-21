// What stands in each destination's turnout: the project itself, at full size, facing the road.
// The models are procedural (models/); what moves in them is real: the arm solves its inverse kinematics, the
// scale building replays a recorded MARSChair run, the rover replays a recorded MuJoCo walk and jump, and the
// neuron display plots the published recipe.
import * as THREE from 'three';
import { Builder, box, cyl, defineMaterial } from '../models/kit.js';
const clamp = THREE.MathUtils.clamp;

/** How many places the driver looks from at a stop, where it is not one. (drive/main.js gives each stop room for them.) */
export const VIEWS = { marschair: 2, software: 2 };

defineMaterial('exhibit:oak', () => new THREE.MeshStandardMaterial({ color: 0xc8a57a, roughness: 0.58 }));
defineMaterial('exhibit:concrete', () => new THREE.MeshStandardMaterial({ color: 0xa9a59d, roughness: 0.85 }));
const load = name => import('../models/' + name + '.js').catch(e => { console.warn('model', name, e); return {}; });
const make = async (mod, fn, ...args) => { try { const f = mod[fn] || (fn === 'default' && mod.default); return f ? await f(...args) : null; } catch (e) { console.warn('model', fn, e); return null; } };
const shadows = o => o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const mono = 'ui-monospace, "SF Mono", Menlo, monospace', sans = 'Archivo, system-ui, -apple-system, Arial, sans-serif';

// ---------------------------------------------------------------- the sign at each destination
// What the page says about a project is printed on a board that stands beside it: its heading, the opening paragraph,
// the first picture and the headline numbers, read from the page's own markup so the two never disagree.
const SIGN = { w: 2.8, h: 1.75, mid: 1.6, px: [1600, 1000] };
function wrap(c, text, width, maxLines) {
  const words = text.replace(/\s+/g, ' ').trim().split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (l && c.measureText(l + '…').width > width) l = l.slice(0, l.lastIndexOf(' ')); lines[maxLines - 1] = l + '…'; }
  return lines;
}
function readCard(st) {
  const card = st.el.querySelector('.dest') || st.el, txt = sel => card.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() || '';
  const media = card.querySelector('img[src], video[data-poster], img[data-src]');
  return {
    kicker: txt('.k'), n: card.querySelector('.k b')?.textContent.trim() || st.n, title: txt('h2'), lead: txt('.lead'),
    brief: [...card.querySelectorAll('.brief > div')].map(d => [d.querySelector('dt')?.textContent.trim() || '', d.querySelector('dd')?.textContent.replace(/\s+/g, ' ').trim() || '']),
    stats: [...card.querySelectorAll('.stats > div')].slice(0, 4).map(d => ({ v: d.querySelector('b')?.textContent.replace(/\s+/g, ' ').trim() || '', l: d.querySelector('span')?.textContent.replace(/\s+/g, ' ').trim() || '' })),
    rows: [...card.querySelectorAll('.contact > *')].slice(0, 4).map(r => ({ l: r.querySelector('.lab')?.textContent.trim() || '', v: r.querySelector('.v')?.textContent.replace(/\s+/g, ' ').trim() || '' })),
    image: media ? media.getAttribute('src') && media.tagName === 'IMG' ? media.getAttribute('src') : media.dataset.poster || media.dataset.src || '' : '',
  };
}
function drawSign(c, d, img) {
  const [W, H] = SIGN.px, ink = '#17191d', soft = '#4a4f57', faint = '#7d838c', accent = '#d9571a', M = 78;
  c.fillStyle = '#f5f2eb'; c.fillRect(0, 0, W, H); c.fillStyle = accent; c.fillRect(0, 0, W, 14);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.font = `600 38px ${sans}`; c.fillStyle = accent; c.fillText(d.n, M, 104); const nw = c.measureText(d.n + ' ').width;
  c.fillStyle = faint; c.font = `500 38px ${sans}`; c.fillText(d.kicker.replace(d.n, '').trim(), M + nw, 104);
  const big = d.brief.length ? 86 : 100; c.fillStyle = ink; c.font = `600 ${big}px ${sans}`; let y = d.brief.length ? 204 : 216;
  for (const l of wrap(c, d.title, W - 2 * M, 2)) { c.fillText(l, M, y); y += big + 4; }
  const top = y - 50, hasBottom = d.stats.length || d.rows.length, bottom = hasBottom ? 742 : 912;
  if (d.brief.length) {
    // three plain lines: why, what, how it came out. The label on the left, the sentence beside it.
    // (set as large as will fit what there is to say)
    const x = M + 250, w = W - M - x; let size = 54, lh, rows, used;
    do { size -= 2; lh = Math.round(size * 1.27); c.font = `400 ${size}px ${sans}`; rows = d.brief.map(([k, v]) => [k, wrap(c, v, w, 4)]); used = rows.reduce((a, [, l]) => a + l.length * lh, 0) + (rows.length - 1) * 18; } while (used > bottom - top - 36 && size > 30);
    const gap = Math.min(40, 18 + (bottom - top - 36 - used) / Math.max(1, rows.length - 1));
    y = top + 30 + size;
    for (const [k, lines] of rows) {
      c.fillStyle = accent; c.font = `600 ${Math.round(size * 0.78)}px ${sans}`; c.fillText(k, M, y);
      c.fillStyle = ink; c.font = `400 ${size}px ${sans}`; for (const l of lines) { c.fillText(l, x, y); y += lh; }
      y += gap;
    }
  } else {
    const colW = img ? 800 : W - 2 * M;
    c.fillStyle = soft; c.font = `400 47px ${sans}`; y = top + 48;
    for (const l of wrap(c, d.lead, colW, Math.max(1, Math.floor((bottom - top) / 64)))) { c.fillText(l, M, y); y += 64; }
    if (img) {
      // the card's first picture, cropped to fill its window
      const x = 940, w = W - M - x, h = Math.min(bottom - top - 6, 430), r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r;
      c.save(); c.beginPath(); c.roundRect(x, top, w, h, 20); c.clip(); c.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, top, w, h); c.restore();
      c.strokeStyle = 'rgba(23,25,29,.16)'; c.lineWidth = 2; c.beginPath(); c.roundRect(x, top, w, h, 20); c.stroke();
    }
  }
  if (hasBottom) { c.fillStyle = 'rgba(23,25,29,.16)'; c.fillRect(M, d.rows.length ? 742 : 768, W - 2 * M, 2); }
  const cw = (W - 2 * M) / Math.max(d.stats.length, 1);
  d.stats.forEach((s, i) => {
    const x = M + i * cw; c.fillStyle = ink; c.font = `600 62px ${sans}`; c.fillText(s.v, x, 846);
    c.fillStyle = soft; c.font = `400 28px ${sans}`; wrap(c, s.l, cw - 34, 2).forEach((l, k) => c.fillText(l, x, 890 + k * 34));
  });
  d.rows.forEach((r, i) => {   // two by two: an address needs the width
    const x = M + (i % 2) * (W - 2 * M) / 2, y0 = 806 + Math.floor(i / 2) * 92; c.fillStyle = soft; c.font = `400 28px ${sans}`; c.fillText(r.l, x, y0);
    c.fillStyle = ink; c.font = `600 38px ${sans}`; c.fillText(r.v, x, y0 + 44);
  });
  c.fillStyle = faint; c.font = `500 25px ${sans}`; c.textAlign = 'right'; c.fillText('Click the sign for the full story', W - M, H - 22);
}
const steel = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55, metalness: 0.7 });
function makeSign(st) {
  const g = new THREE.Group(), d = readCard(st), cv = document.createElement('canvas'); [cv.width, cv.height] = SIGN.px;
  const c = cv.getContext('2d'); drawSign(c, d, null);
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 16;
  if (d.image && !d.brief.length) { const im = new Image(); im.onload = () => { drawSign(c, d, im); map.needsUpdate = true; }; im.src = d.image; }   // (a board with the three lines has no room for a picture, and the thing itself is standing next to it)
  // a printed board: lit by the day like everything else, with a little of its own light so it reads in the shade
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SIGN.w, SIGN.h), new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.3 }));
  face.position.set(0, SIGN.mid, 0.031); face.name = 'placard'; face.userData.stop = st; face.receiveShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(SIGN.w + 0.08, SIGN.h + 0.08, 0.06), steel); back.position.set(0, SIGN.mid, 0); back.castShadow = true;
  g.add(face, back);
  for (const x of [-SIGN.w / 2 + 0.22, SIGN.w / 2 - 0.22]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, SIGN.mid, 12), steel); post.position.set(x, SIGN.mid / 2, -0.06); post.castShadow = true; g.add(post); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.34), steel); foot.position.set(x, 0.015, -0.06); g.add(foot); }
  return g;
}

// the island that carries the 1:10 building
function island(w, d, h) {
  const b = new Builder('island');
  b.add(box(w - 0.3, 0.08, d - 0.3), 'blackMetal', { position: [0, 0.04, 0] });
  b.add(box(w - 0.16, h - 0.14, d - 0.16, 0.012), 'paintCharcoal', { position: [0, 0.08 + (h - 0.14) / 2, 0] });
  b.add(box(w, 0.06, d, 0.014), 'exhibit:oak', { position: [0, h - 0.03, 0] });
  return b.build();
}
function plinth(w, h, d) { const b = new Builder('plinth'); b.add(box(w - 0.06, 0.05, d - 0.06), 'blackMetal', { position: [0, 0.025, 0] }); b.add(box(w, h - 0.05, d, 0.006), 'exhibit:concrete', { position: [0, 0.05 + (h - 0.05) / 2, 0] }); return b.build(); }

// Nothing is built here: each destination's exhibit is a builder that runs later (nearest first, in idle time), so the
// road and the car are on screen before any of this work starts. `prepare(groups)` is given the new groups to compile
// their shaders before they are first shown.
export function buildExhibits(scene, route, stops, { tier = 'high', shoulderAt, prepare, carEdgeAt = () => 4.3 } = {}) {
  const names = ['armsim', 'marsroom', 'hopper', 'neuronwall', 'robot', 'legoengine', 'windtunnel', 'props', 'fixtures', 'labkit'];
  const M = {}, modules = Promise.all(names.map(load)).then(ms => { ms.forEach((m, i) => { M[names[i]] = m; }); });
  const by = Object.fromEntries(stops.map(s => [s.id, s])), P = {}, list = [], root = new THREE.Group(); root.name = 'exhibits'; scene.add(root);
  const builders = [], add = (id, run) => { if (by[id]) builders.push({ st: by[id], run, started: false }); };
  // a group at a destination: +Z faces down the road, toward whoever is arriving (the driver walks up to it that way,
  // with the camera behind him), +X runs across toward the drop; y = 0 is the pavement. There is about three metres
  // of width for it between its sign and the rail. `turn` is for the odd thing that lies along the road instead.
  function at(id, { along = 0, d = 8.6, turn = 0 } = {}) {
    const st = by[id]; if (!st) return null;
    const a = route.at(st.s + along, P), g = new THREE.Group(); g.name = 'exhibit:' + id;
    g.position.copy(a.p).addScaledVector(a.r, d); g.position.y = a.p.y - Math.min(d, shoulderAt(st.s + along)) * 0.018 + 0.005;
    g.rotation.y = a.heading + Math.PI + turn; root.add(g);
    let e = list.find(x => x.st === st); if (!e) { e = { st, groups: [], updates: [], ready: false }; list.push(e); }
    g.visible = false; e.groups.push(g); return [g, e];
  }
  // How the driver looks a thing over, which is different for each. Most get one look; where there are two different
  // things to see (the MARS lab's model and its robot, the desk's terminal and its phone) he goes to both. The places he goes, in order, in the exhibit's own
  // frame ([x, z]: +z toward the arriving car, +x toward the drop; the sign is on the -x side). At each he faces `look`
  // and the view closes in on it: `low` has him get down to it, `r` is how far back the view stands (else it is sized
  // to the thing), `el` how high (radians), `side` which way round from him it sits, `off` a nudge to where it aims,
  // `via` the way there round whatever is in between. `home` is the way back to the car.
  const tour = (e, g, points, home = []) => { e.frame = g; e.tour = points.filter(p => p.look); e.home = home; };
  const put = (g, o, x = 0, y = 0, z = 0, ry = 0, s = 1) => { if (!o) return null; o.position.set(x, y, z); o.rotation.y = ry; if (s !== 1) o.scale.setScalar(s); shadows(o); g.add(o); return o; };

  // ---------- 01 arm sim: the SO-101 on its bench, reaching for each target the instruction names
  add('armsim', async () => {
    const [g, e] = at('armsim') || [], arm = g && await make(M.armsim, 'default');
    if (arm) {
      put(g, arm);
      // down to the bench, to watch it reach
      tour(e, g, [{ at: [-0.15, 1.15], look: arm, low: true, r: 1.7 }]);
      const A = M.armsim, targets = A.TARGETS || [], keys = ['pan', 'lift', 'elbow', 'wflex', 'wroll'], home = A.HOME || {};
      const screen = arm.getObjectByName('armScreen'); let last = -1;
      const draw = (label, stage) => canvasTex(800, 500, (c) => {
        c.fillStyle = '#0f1115'; c.fillRect(0, 0, 800, 500);
        c.fillStyle = '#8b949e'; c.font = `500 24px ${mono}`; c.textBaseline = 'middle'; c.fillText('robot-arm-sim · SO-101 · MuJoCo', 34, 44);
        c.fillStyle = '#8b949e'; c.font = `500 22px ${mono}`; c.fillText('INSTRUCTION', 34, 112);
        c.fillStyle = '#f2f2ee'; c.font = `400 46px ${sans}`; c.fillText('“' + label + '”', 34, 170);
        c.fillStyle = stage ? '#7ee787' : '#d29922'; c.font = `500 26px ${mono}`; c.fillText(stage ? '✓ hovering over target' : '● solving IK · moving', 34, 300);
        c.fillStyle = '#8b949e'; c.font = `500 20px ${mono}`; c.fillText('head stereo 7.5 cm baseline · wrist cam · joints', 34, 450);
      });
      if (A.solveIK && A.setJoints && targets.length) {
        const goals = targets.map(t => ({ ...A.solveIK(arm, t.position, 0.05), grip: 0.5 })), STEP = 4.6;
        const ease = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        e.updates.push(time => {
          const n = Math.floor(time / STEP), i = n % targets.length, t = time - n * STEP, from = n === 0 ? home : goals[(n - 1) % targets.length], to = goals[i], k = ease(Math.min(1, t / 1.9)), pose = {};
          for (const key of [...keys, 'grip']) pose[key] = (from[key] ?? 0) + ((to[key] ?? 0) - (from[key] ?? 0)) * k;
          A.setJoints(arm, pose);
          const key = i * 2 + (k >= 1 ? 1 : 0);
          if (screen && key !== last) { last = key; screen.material?.map?.dispose(); screen.material = new THREE.MeshBasicMaterial({ map: draw(targets[i].label, k >= 1), toneMapped: false, color: 0xd8d8d8 }); }
        });
      }
    }
  });

  // ---------- 02 MARSChair: the building at 1:10 with the recorded run playing in it, and the real hardware beside it
  add('marschair', async () => {
    const [g, e] = at('marschair', { d: 8.8 }) || [];
    if (g) {
      const W = 2.6, D = 1.3, H = 0.86, isl = island(W, D, H); put(g, isl, 0, 0, 0);
      const dio = await make(M.marsroom, 'createDiorama');
      if (dio) {
        const bb = new THREE.Box3().setFromObject(dio), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
        const s = Math.min((W - 0.28) / size.x, (D - 0.2) / size.z), holder = new THREE.Group();
        dio.position.set(-c.x, -bb.min.y, -c.z); holder.add(dio); holder.scale.setScalar(s); holder.position.set(0, H + 0.001, 0); shadows(dio);
        dio.traverse(o => { if (o.isLine || o.material?.transparent) o.castShadow = false; });
        g.add(holder); e.focus = holder;
        const u = dio.userData, SPEED = Math.max(12, u.duration / 34), loop = u.duration / SPEED + 5;
        e.state = { phase: '', sim: 0, duration: u.duration };
        e.updates.push(time => { const t = time % loop, sim = Math.min(u.duration, t * SPEED); u.setTime(sim); e.state.sim = sim; e.state.phase = sim >= u.duration ? 'Room set' : (u.phaseAt?.(sim) || ''); });
      }
      // behind the model of the building, the real thing at full size: the robot tucking a chair under a table, the
      // last half minute of one placement from the same recorded run, over and over
      const demo = await make(M.marsroom, 'createTuckDemo');
      if (demo) { put(g, demo, 0.35, 0, -5.0); const loop = demo.userData.duration + 2.5; e.updates.push(time => demo.userData.setTime(time % loop)); }
      // first the table with the model on it; then round the end of it to the robot, to watch it work
      tour(e, g, [{ at: [-0.45, 1.45], look: e.focus, r: 2.5, el: 0.62 }, { at: [1.75, -3.1], via: [[1.82, 1.0], [1.82, -1.3]], look: demo, r: 4.1, el: 0.3, side: -1 }], [[1.82, -1.3], [1.82, 1.0]]);
    }
  });

  // ---------- 03 HOPPER: the rover at full size, replaying the recorded walk and jump along the turnout
  add('hopper', async () => {
    const [g, e] = at('hopper', { d: 8.7 }) || [], hop = g && await make(M.hopper, 'createHopper');
    if (hop) {
      const u = hop.userData, ext = u.extent, mid = ext ? (ext.min.z + ext.max.z) / 2 : 0, holder = new THREE.Group();
      hop.position.set(0, 0, -mid); holder.add(hop); shadows(hop); g.add(holder); e.focus = u.body || hop;   // it walks and jumps down the road, toward whoever is watching
      if (ext) e.reach = (ext.max.z - ext.min.z) / 2 + 0.9;
      // from in front, as it walks and jumps toward him
      const R = e.reach || 3; tour(e, g, [{ at: [-0.6, R + 0.35], look: e.focus, r: 3.4, el: 0.26 }]);
      const loop = u.duration + 2.2; e.state = { phase: '' };
      e.updates.push(time => { const t = time % loop, s = Math.min(u.duration, t); u.setTime(s); hop.visible = t < loop - 0.18; e.state.phase = u.phaseAt?.(s) || ''; });
    }
  });

  // ---------- 04 neuron steering: the display, the size of a billboard
  add('neurons', async () => {
    const [g0, e] = at('neurons', { d: 8.7 }) || [], wall = g0 && await make(M.neuronwall, 'default'), g = g0 && new THREE.Group();
    if (wall) {
      const k = 2.3, frame = new Builder('billboard');
      for (const x of [-1.5, 1.5]) frame.add(box(0.14, 3.2, 0.14), 'blackMetal', { position: [x, 1.6, -0.12] });
      frame.add(box(3.4, 0.1, 0.1), 'blackMetal', { position: [0, 1.25, -0.12] });
      put(g, frame.build()); put(g, wall, 0, 2.45, 0, 0, k); g.scale.setScalar(0.52); g0.add(g);
      tour(e, g0, [{ at: [-0.5, 2.0], look: wall, r: 2.4, el: 0.1 }]);
      let lastAt = 0; e.updates.push(time => { if (Math.abs(time - lastAt) > 0.09) { lastAt = time; wall.userData.draw?.(time); } });
    }
  });

  // ---------- 05 FTC, 06 LEGO engine, 07 the vortex rig
  add('robotics', async () => {
    const [g, e] = at('robotics', { d: 8.2 }) || [], bot = g && await make(M.robot, 'default');
    if (bot) {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(1.83, 0.016, 1.83), new THREE.MeshStandardMaterial({ color: 0x5f6268, roughness: 0.95 })); mat.position.y = 0.008; mat.receiveShadow = true; g.add(mat);
      e.focus = put(g, bot, 0, 0.016, 0, 0.5);
      // it is small and on the floor: down to it
      tour(e, g, [{ at: [-0.35, 1.2], look: bot, low: true, r: 1.25 }]);
      const turret = bot.getObjectByName('turret'), fly = bot.getObjectByName('flywheel'), rollers = bot.getObjectByName('intakeRollers');
      e.updates.push((time, dt) => { if (turret) turret.rotation.y = Math.sin(time * 0.35) * 0.9; if (fly) fly.rotation.x += dt * 30; if (rollers) rollers.rotation.x += dt * 6; });
    }
  });
  add('engine', async () => {
    const [g, e] = at('engine', { d: 7.9 }) || [], lego = g && await make(M.legoengine, 'default');
    if (lego) { put(g, plinth(0.9, 0.95, 0.6)); e.focus = put(g, lego, 0, 0.95, 0, Math.PI); tour(e, g, [{ at: [-0.2, 1.05], look: lego, r: 0.85, el: 0.3 }]); let th = 0; e.updates.push((time, dt) => { th += dt * Math.PI * 2 * 2.2; M.legoengine.setCrank?.(lego, th); }); }
  });
  add('research', async () => {
    const [g, e] = at('research', { d: 8.5 }) || [], rig = g && await make(M.windtunnel, 'default');
    if (rig) { put(g, rig); tour(e, g, [{ at: [-0.4, 1.2], look: rig, low: true, r: 1.9 }]); const fan = rig.getObjectByName('fanBlades'), fin = rig.getObjectByName('fin'); e.updates.push((time, dt) => { if (fan) fan.rotation.x += dt * 38; if (fin) fin.rotation.y = Math.sin(time * 5.2) * 0.22; }); }
  });

  // ---------- 08 software: a desk with a view; Silk in the terminal, SpareMe on the phone
  add('software', async () => {
    const [g, e] = at('software', { d: 8.6 }) || [], desk = g && await make(M.props, 'createDesk');
    if (desk) {
      put(g, desk); desk.updateMatrixWorld(true);
      const screen = desk.getObjectByName('screen');
      if (screen) screen.material = new THREE.MeshBasicMaterial({ toneMapped: false, color: 0xd0d0d0, map: canvasTex(1600, 900, c => {
        const bg = c.createLinearGradient(0, 0, 1600, 900); bg.addColorStop(0, '#1d2433'); bg.addColorStop(1, '#2b1f2e'); c.fillStyle = bg; c.fillRect(0, 0, 1600, 900);
        c.fillStyle = 'rgba(12,13,17,.92)'; c.beginPath(); c.roundRect(90, 90, 1420, 720, 18); c.fill();
        c.font = `500 34px ${mono}`; c.textBaseline = 'middle';
        [['$ ', 'silk request @maya-codex --note "Coordinate the launch?"'], ['  ', 'postage paid · waiting for her owner to say yes'], ['✓ ', '@maya-codex accepted · 50 msgs · 7 days'], ['  ', 'ML-KEM-768 + X25519 handshake · ratchet on'], ['$ ', 'silk send @maya-codex "On it."'], ['  ', 'sealed · relayed · receipt on the ledger'], ['$ ', 'silk audit'], ['✓ ', 'inclusion proofs verified']].forEach(([p, t], i) => { c.fillStyle = p === '✓ ' ? '#7ee787' : p === '$ ' ? '#79c0ff' : '#8b949e'; c.fillText(p, 140, 180 + i * 62); c.fillStyle = p === '  ' ? '#8b949e' : '#e6edf3'; c.fillText(t, 190, 180 + i * 62); });
      }) });
      const dock = desk.getObjectByName('phoneDock'), phone = await make(M.fixtures, 'createPhone');
      if (dock && phone) { shadows(phone); g.attach(phone); dock.getWorldPosition(phone.position); g.worldToLocal(phone.position); phone.quaternion.copy(dock.quaternion); const ps = phone.getObjectByName('screen'); if (ps) ps.material = new THREE.MeshBasicMaterial({ toneMapped: false, color: 0xd0d0d0, map: canvasTex(600, 1280, (c, w, h) => { const b = c.createLinearGradient(0, 0, 0, h); b.addColorStop(0, '#0d1430'); b.addColorStop(1, '#05070f'); c.fillStyle = b; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `700 44px ${sans}`; c.fillText('SpareMe', 40, 150); c.fillStyle = '#7ee787'; c.font = `500 26px ${sans}`; c.fillText('● On the call · 12:41', 40, 210); [['rep', 'Thanks for holding. How can I help?'], ['ai', 'I’m calling on behalf of Nirav about this month’s bill.'], ['rep', 'I can add a new promotion for 12 months.']].forEach(([who, t], i) => { const ai = who === 'ai', y = 290 + i * 190; c.fillStyle = ai ? '#3b6cf6' : 'rgba(255,255,255,.12)'; c.beginPath(); c.roundRect(ai ? 110 : 40, y, 450, 150, 26); c.fill(); c.fillStyle = '#fff'; c.font = `400 27px ${sans}`; const words = t.split(' '); let line = '', ly = y + 48; for (const wd of words) { if (c.measureText(line + wd).width > 400) { c.fillText(line, (ai ? 110 : 40) + 24, ly); line = ''; ly += 36; } line += wd + ' '; } c.fillText(line, (ai ? 110 : 40) + 24, ly); }); }) }); }
      const chair = await make(M.props, 'createChair'); put(g, chair, 0.1, 0, 0.75, Math.PI + 0.3);
      // the terminal over the back of the chair, then down to the phone in its dock
      const ph = g.children.find(c => c !== desk && c !== chair) || desk;
      tour(e, g, [{ at: [-0.95, 1.2], look: screen || desk, r: 1.55, el: 0.14 }, { at: [1.1, 0.6], via: [[0.95, 1.35]], look: ph, low: true, r: 0.75, el: 0.3, side: -1 }], [[0.95, 1.4]]);
    }
  });

  // ---------- 09 more: the workshop end of things
  add('more', async () => {
    const [g, e] = at('more', { d: 9.0 }) || [];
    if (g) { const [shelf, cart, boxes] = await Promise.all([make(M.labkit, 'createShelving'), make(M.labkit, 'createToolCart'), make(M.labkit, 'createFloorBoxes')]); put(g, shelf, -0.55, 0, 0); put(g, cart, 0.85, 0, 0.05); put(g, boxes, 0.75, 0, 1.0, -0.3); tour(e, g, [{ at: [-0.75, 1.3], look: shelf, r: 2.3, el: 0.2 }]); }
  });
  // ---------- 10 about: a bike against the rail (four years as a bike mechanic)
  add('about', async () => {
    const st = by.about, [g, e] = st ? at('about', { d: shoulderAt(st.s) - 0.62, turn: -Math.PI / 2 }) : [];
    if (g) { const [bike, pack] = await Promise.all([make(M.labkit, 'createBike'), make(M.labkit, 'createBackpack')]); put(g, bike, 0, 0, 0.12, 0); put(g, pack, 1.35, 0, 0.3, 0.4); tour(e, g, [{ at: [-0.1, 1.45], look: bike, r: 2.2, el: 0.24, side: -1 }]); }
  });
  // ---------- 11 guitar
  add('guitar', async () => {
    const [g, e] = at('guitar', { d: 8.0 }) || [];
    if (g) { const [guitar, stool] = await Promise.all([make(M.props, 'createGuitar'), make(M.props, 'createStool')]); put(g, guitar, 0, 0, 0, 0.2); put(g, stool, 0.75, 0, -0.1); tour(e, g, [{ at: [-0.3, 1.2], look: guitar, low: true, r: 1.35 }]); }
  });

  const tmp = new THREE.Vector3();
  // The sign stands beside what it describes, on the road side of it and in line with its front, facing the same way:
  // down the road, at whoever is arriving (so the low sun over the sea is never behind it). The driver reads it from
  // in front, then steps across to stand in front of the thing itself.
  const bb = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();
  function placeSign(st) {
    const a = route.at(st.s, P), f = a.t.clone(), r = a.r.clone(), origin = a.p.clone(), limit = shoulderAt(st.s) - 0.85;
    let e = list.find(x => x.st === st), ca = 0, cr = Math.min(8.9, limit), ha = 0, hr = 0;
    const has = !!(e && e.groups.length);
    if (has) {
      bb.makeEmpty(); for (const g of e.groups) { g.updateMatrixWorld(true); bb.expandByObject(g); }
      if (!bb.isEmpty()) { bb.getCenter(mid); bb.getSize(size); mid.sub(origin); ca = mid.dot(f); cr = mid.dot(r); ha = Math.max((Math.abs(f.x) * size.x + Math.abs(f.z) * size.z) / 2, e.reach || 0); hr = (Math.abs(r.x) * size.x + Math.abs(r.z) * size.z) / 2; }
    }
    if (!e) { e = { st, groups: [], updates: [], ready: false }; list.push(e); }
    // (never so far back that he would be standing against the parked car; clear of the car as it pulls back onto the road)
    const front = Math.max(ca - ha, -3.2), along = front + 0.08, right = Math.max(clamp(cr - hr - 0.45 - SIGN.w / 2, 5.5, 6.9), carEdgeAt(st.s + along) + 0.45 + SIGN.w / 2);
    const g = makeSign(st), b = route.at(st.s + along, P);
    g.position.copy(b.p).addScaledVector(b.r, right); g.position.y = b.p.y - Math.min(right, shoulderAt(st.s + along)) * 0.018 + 0.005; g.rotation.y = b.heading + Math.PI; g.name = 'sign:' + st.id; g.visible = false;
    root.add(g); e.groups.push(g);
    // where he stands to read it; then where he stands to look at the thing (square on, in front of its left half), and
    // how tall it is, which decides whether he gets down to it
    e.sign = { stand: g.position.clone().addScaledVector(b.t, -2.05).addScaledVector(b.r, -1.1), face: g.position.clone().addScaledVector(b.r, 0.2).setY(g.position.y + 1.4) };
    if (has && !e.tour && e.focus) {
      const vr = clamp(cr - Math.max(Math.min(hr, 1.3) * 0.5, 0.6), right + SIGN.w / 2 + 0.55, limit - 0.9), w = origin.clone().addScaledVector(f, front - 1.15).addScaledVector(r, vr), frame = e.groups[0];
      frame.updateWorldMatrix(true, false); frame.worldToLocal(w); tour(e, frame, [{ at: [w.x, w.z], look: e.focus, low: true }]);
    }
  }
  for (const st of stops) if (st.i > 0 && !builders.some(b => b.st === st)) builders.push({ st, run: async () => {}, started: false });   // nothing stands here, but its sign does
  let chain = modules;
  function run(b) {
    b.started = true;
    return chain = chain.then(async () => {
      const t0 = performance.now();
      try { await b.run(); } catch (e) { console.warn('exhibit', b.st.id, e); }
      { const e = list.find(x => x.st === b.st); if (e && !e.focus && e.groups[0]) e.focus = e.groups[0].children[0] || e.groups[0]; }
      try { placeSign(b.st); } catch (e) { console.warn('sign', b.st.id, e); }
      const e = list.find(x => x.st === b.st);
      if (e) {
        // compile while the groups are (for this one call) visible; they are shown once their shaders are ready
        for (const g of e.groups) g.visible = true;
        const ready = prepare ? Promise.resolve(prepare(e.groups)).catch(() => {}) : null;
        for (const g of e.groups) g.visible = false;
        await ready; e.ready = true;
      }
      b.ms = performance.now() - t0;
    });
  }
  return {
    list, M, builders,
    stateOf: id => list.find(e => e.st.id === id)?.state,
    /** Build the unbuilt exhibit nearest to `s` (within `within` metres). Returns a promise, or null if there is none. */
    buildNext(s, within = Infinity) {
      let best = null, bd = within;
      for (const b of builders) if (!b.started) { const d = Math.abs(b.st.s - s); if (d < bd) { bd = d; best = b; } }
      return best ? run(best) : null;
    },
    /** Build everything that is left (tests, and the page-only fallback has no use for it). */
    buildAll() { for (const b of builders) if (!b.started) run(b); return chain; },
    /** Run what is near the car; hide what is far behind or ahead. Returns how many exhibits are animating. */
    update(time, dt, s) {
      let live = 0;
      for (const e of list) {
        const d = Math.abs(s - e.st.s), near = e.ready && d < 160;
        for (const g of e.groups) g.visible = near;
        if (near && d < 70 && e.updates.length) { live++; for (const u of e.updates) u(time, dt); }
      }
      return live;
    },
  };
}
