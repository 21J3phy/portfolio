// The sound of the drive: engine, road, wind, the sea below, and the small noises of stopping and getting out.
// One module, no dependencies. Everything is built on the Web Audio API the first time enable() is called.
//
//   const sound = createSound();
//   button.onclick = () => sound.on ? sound.disable() : sound.enable();   // enable() must be called from a click
//   each frame: sound.update(state);                                      // rpm, throttle, speed, camera… see update()
//   now and then: sound.event('doorClose'), sound.event('footstep', { gain, pan }), 'doorOpen', 'shift', 'handbrake'
//
// The recordings and where they came from are listed in assets/audio/CREDITS.md. All the numbers that describe
// them (which stretch of each file to use, what engine speed a recording really is, how loud each layer sits)
// are in the tables below, so the mix can be changed without reading the rest.

// ── Engine recordings ─────────────────────────────────────────────────────────────────────────────────────────────
// A 2.3 litre naturally aspirated inline four on a dyno, recorded at the exhaust outlet ('exh') and under the
// bonnet ('bay'), with the engine working hard ('on') and with the throttle shut or barely open ('off').
// rpm is the measured speed of each recording (firing frequency × 30), not the label on the file.
// at/len: the stretch of the file that becomes the loop, in seconds. The files keep 0.1 s of spare audio either
// side, because mp3 decoders disagree about how much padding they strip.
const ENGINE = [
  // file                    mic    load   rpm    at    len
  ['engine-exh-off-1032', 'exh', 'off', 1032, 0.10, 5.9419],
  ['engine-exh-off-1600', 'exh', 'off', 1600, 0.10, 2.4000],
  ['engine-exh-off-2427', 'exh', 'off', 2427, 0.10, 3.5573],
  ['engine-exh-off-3400', 'exh', 'off', 3400, 0.10, 2.0118],
  ['engine-exh-off-4700', 'exh', 'off', 4700, 0.10, 1.9915],
  ['engine-exh-off-6294', 'exh', 'off', 6294, 0.10, 1.5917],
  ['engine-exh-on-1290', 'exh', 'on', 1290, 0.10, 1.3948],
  ['engine-exh-on-2556', 'exh', 'on', 2556, 0.10, 3.5684],
  ['engine-exh-on-6213', 'exh', 'on', 6213, 0.10, 1.3143],
  ['engine-bay-off-1032', 'bay', 'off', 1032, 0.10, 5.9421],
  ['engine-bay-off-2427', 'bay', 'off', 2427, 0.10, 3.5572],
  ['engine-bay-off-3400', 'bay', 'off', 3400, 0.10, 2.0118],
  ['engine-bay-off-4700', 'bay', 'off', 4700, 0.10, 1.9915],
  ['engine-bay-off-6294', 'bay', 'off', 6294, 0.10, 1.6012],
  ['engine-bay-on-1290', 'bay', 'on', 1290, 0.10, 1.3947],
  ['engine-bay-on-2556', 'bay', 'on', 2556, 0.10, 3.5684],
  ['engine-bay-on-3450', 'bay', 'on', 3450, 0.10, 2.0174],
  ['engine-bay-on-4650', 'bay', 'on', 4650, 0.10, 2.0129],
  ['engine-bay-on-6213', 'bay', 'on', 6213, 0.10, 1.3144],
];
const ENGINE_SEAM = 0.06;     // seconds of crossfade at each loop's join
const ENGINE_RMS = 0.1;       // every loop is brought to this level when loaded; the level law below does the rest

// ── One-shots: [file, start, length] in seconds inside the shipped file, then the peak each is brought to ───────────
const SHOTS = {
  doorOpen: ['door-open', 0.18, 1.20, 0.45],
  doorClose: ['door-close', 0.19, 0.85, 0.75],
  handbrake: ['handbrake', 0.24, 0.92, 0.22],
  chirp: ['tyre-chirp', 0.24, 0.60, 0.30],
  tick: ['indicator', 0.132, 0.09, 0.10],
  tock: ['indicator', 0.481, 0.09, 0.085],
};
const STEPS = [[0.128, 0.30], [0.676, 0.30], [1.010, 0.42], [1.612, 0.30], [2.088, 0.31], [2.658, 0.30], [3.130, 0.30]];   // in footsteps.mp3
const STEP_PEAK = 0.32;       // the loudest footstep; the others keep their own level relative to it
const GULLS = [['gull-1', 0.03, 3.45], ['gull-2', 0.10, 0.75], ['gull-2', 1.31, 0.61], ['gull-3', 0.17, 0.85], ['gull-3', 1.47, 1.00]];
const GULL_PEAK = 0.4;
const SEA = ['sea', 0.5, 42.5, 3.0];        // file, start, loop length, crossfade
const GRASS = ['grass', 0.3, 10.2, 1.2];

// ── Mix: one number per layer. These were set from measured levels (see dev/sound.html to listen) ────────────────────
const MIX = {
  engine: 7.0,          // on top of ENGINE_RMS and the level law
  exhaust: 1.5,         // exhaust-outlet recordings against under-bonnet ones (they are mostly bass, so they need the help)
  road: 1.4,            // tyre roar
  grit: 0.6,            // crunch of the shoulder under slow tyres
  scrub: 1.0,           // tyres working sideways
  pads: 0.25,           // brake pads rubbing just before the car stops
  wind: 1.0,
  breeze: 1.75,
  sea: 0.38,
  grass: 0.3,
  gulls: 0.75,
  doors: 1.0,
  steps: 0.7,
  handbrake: 0.6,
  indicator: 1.1,
  reverse: 0.5,         // reverse-gear whine; 0 turns it off
};
const IDLE_RPM = 750, RELAY_PER_MIN = 85, CHASE_DIST = 6.5;

const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const step = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Smooth random wander between -1 and 1 that never repeats in practice (value noise): the breeze, the gusts.
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const wander = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1; };

export function createSound(options = {}) {
  // options.base: where the audio folder is. options.context: an OfflineAudioContext to render into, for tests.
  const base = options.base || new URL('./assets/audio/', import.meta.url);
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  const supported = !!(AC || options.context);
  let ctx = null, ready = false, wanted = false, loading = null, volume = 0.8, suspendTimer = 0;
  let hidden = typeof document !== 'undefined' && !options.context && document.hidden;
  let G = null;                                   // the graph, once built
  const mix = { engine: 1, road: 1, wind: 1, ambience: 1, foley: 1 };   // live multipliers, for auditioning layers on their own
  const warned = new Set();
  const warn = (what, e) => { if (!warned.has(what)) { warned.add(what); console.warn('sound: ' + what + ' unavailable', e && e.message || e || ''); } };

  // A parameter with a memory of where it was last sent, so update() only talks to the audio thread when something changed.
  const P = (param, v = param.value) => ({ p: param, v });
  const to = (q, v, tau) => { if (Math.abs(v - q.v) > 1e-4 + 1e-3 * Math.abs(q.v)) { q.v = v; q.p.setTargetAtTime(v, S.now, tau); } };

  // ── loading ──
  async function load(name) {
    try {
      const r = await fetch(new URL(name + '.mp3', base)); if (!r.ok) throw new Error(r.status);
      const data = await r.arrayBuffer();
      return await new Promise((res, rej) => { const p = ctx.decodeAudioData(data, res, rej); if (p && p.catch) p.catch(rej); });
    } catch (e) { warn(name, e); return null; }
  }
  // Cut [at, at+len) out of a decoded file into a loop, folding the audio that follows the cut back over its start so the
  // join is inaudible. The fold is weighted by how alike the two ends are, so the level does not dip or bump through it.
  function makeLoop(buf, at, len, seam, level) {
    const sr = buf.sampleRate, n = Math.round(len * sr), x = Math.round(seam * sr), s = Math.round(at * sr);
    if (n < x || s + n + x > buf.length) return null;
    const out = ctx.createBuffer(buf.numberOfChannels, n, sr); let sum = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c), dst = out.getChannelData(c);
      let ab = 0, aa = 0, bb = 0; for (let i = 0; i < x; i++) { const a = src[s + i], b = src[s + n + i]; ab += a * b; aa += a * a; bb += b * b; }
      const rho = clamp(ab / Math.sqrt(aa * bb + 1e-20), 0, 1);
      for (let i = 0; i < n; i++) dst[i] = src[s + i];
      for (let i = 0; i < x; i++) { const t = i / x, u = 1 - t; dst[i] = (src[s + i] * t + src[s + n + i] * u) / Math.sqrt(t * t + u * u + 2 * rho * t * u); }
      for (let i = 0; i < n; i++) sum += dst[i] * dst[i];
    }
    if (level) { const g = level / Math.sqrt(sum / (n * buf.numberOfChannels) + 1e-20); for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= g; } }
    return out;
  }
  // Cut a one-shot to mono with short fades. Decoders differ by a few tens of milliseconds in where a file starts, so when
  // `align` is set the cut is slid to where the sound actually begins.
  function cut(buf, at, len, align) {
    if (!buf) return null;
    const sr = buf.sampleRate, ch = buf.numberOfChannels; let s = Math.round(at * sr); const n = Math.round(len * sr);
    const mono = i => { let v = 0; for (let c = 0; c < ch; c++) v += buf.getChannelData(c)[i] || 0; return v / ch; };
    if (align) { const w = Math.round(0.05 * sr), a = Math.max(0, s - w), b = Math.min(buf.length, s + w + Math.round(0.03 * sr)); let pk = 0; for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(mono(i))); for (let i = a; i < b; i++) if (Math.abs(mono(i)) > 0.2 * pk) { s = Math.max(0, i - Math.round(0.006 * sr)); break; } }
    const out = ctx.createBuffer(1, n, sr), d = out.getChannelData(0), fi = Math.round(0.003 * sr), fo = Math.round(Math.min(0.04, len * 0.25) * sr);
    for (let i = 0; i < n; i++) d[i] = (s + i < buf.length ? mono(s + i) : 0) * Math.min(1, i / fi, (n - 1 - i) / fo);
    return out;
  }
  const peakOf = b => { let m = 0; if (b) { const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); } return m; };
  const scale = (b, g) => { if (b) { const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] *= g; } return b; };
  const toPeak = (b, p) => scale(b, p / (peakOf(b) || 1));

  // ── things that are better made than recorded ──
  function synth() {
    const sr = ctx.sampleRate; let seed = 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    // white noise, the raw material for tyre roar, wind and scrub (each reads it from a different place at a different speed)
    const noise = ctx.createBuffer(1, sr * 5, sr), nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = (rnd() + rnd() + rnd() - 1.5) * 0.6;
    // grit: loose stones under a slow tyre. A dense scatter of short, soft-edged bursts of noise, each with its own tone,
    // so it reads as a crunch and not as separate clicks.
    const grit = ctx.createBuffer(1, sr * 4, sr), gd = grit.getChannelData(0);
    for (let k = 0; k < 4 * 140; k++) { const at = Math.floor(rnd() * (gd.length - sr * 0.04)), len = Math.floor(sr * (0.005 + rnd() * rnd() * 0.028)), rise = Math.floor(sr * 0.0012), amp = 0.12 + 0.5 * rnd() * rnd(); let lp = 0; const a = 0.12 + rnd() * 0.4;
      for (let i = 0; i < len; i++) { const e = Math.min(1, i / rise) * (1 - i / len) ** 2; lp += a * ((rnd() * 2 - 1) - lp); gd[at + i] += lp * e * amp; } }
    // the body settling back on its springs as the car comes to rest: a soft low thump with a short creak on top
    const settle = ctx.createBuffer(1, Math.round(sr * 0.55), sr), sd = settle.getChannelData(0); let ph = 0, lp = 0;
    for (let i = 0; i < sd.length; i++) { const t = i / sr; ph += 2 * Math.PI * (38 + 30 * Math.exp(-t * 14)) / sr; lp += 0.08 * ((rnd() * 2 - 1) - lp);
      sd[i] = Math.sin(ph) * Math.exp(-t * 9) * Math.min(1, t * 200) * 0.6 + lp * Math.exp(-(((t - 0.07) / 0.045) ** 2)) * 0.5; }
    // gear lever going home: two small knocks 55 ms apart
    const knock = ctx.createBuffer(1, Math.round(sr * 0.14), sr), kd = knock.getChannelData(0);
    for (const [t0, amp, f] of [[0.004, 0.6, 210], [0.060, 1, 150]]) { let l = 0; for (let i = Math.round(t0 * sr); i < kd.length; i++) { const t = i / sr - t0; l += 0.3 * ((rnd() * 2 - 1) - l); kd[i] += amp * Math.exp(-t * 95) * (0.7 * Math.sin(2 * Math.PI * f * t) + 0.5 * l); } }
    return { noise, grit, settle, knock };
  }

  // ── the graph ──
  function build(files) {
    const g = {}, node = (type, o) => Object.assign(ctx['create' + type](), o || {}), gain = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    const filter = (type, f, q = 0.707, db = 0) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = db; return n; };
    const chain = (...nodes) => { for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]); return nodes[nodes.length - 1]; };
    const pan = v => { if (ctx.createStereoPanner) { const n = ctx.createStereoPanner(); n.pan.value = v; return n; } const n = gain(1); n.pan = gain(0).gain; return n; };   // very old browsers: no panning, the value goes nowhere
    const looped = (buffer, rate = 1, offset = 0) => { const n = ctx.createBufferSource(); n.buffer = buffer; n.loop = true; n.playbackRate.value = rate; g.starts.push([n, offset]); return n; };
    g.starts = [];
    const made = synth(); g.made = made;

    // out: everything → compressor → limiter → fade → volume
    g.volume = gain(volume); g.fade = gain(0);
    const comp = node('DynamicsCompressor'); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.3;
    const limit = node('DynamicsCompressor'); limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.12;
    // The browser's compressor adds make-up gain of its own (about 6.4 dB and 1.7 dB at these settings); the two trims take it back out.
    g.bus = gain(1); chain(g.bus, comp, gain(0.48), limit, gain(0.82), g.fade, g.volume, ctx.destination);

    // the car: one bus that carries distance, side and muffling for everything that comes from it
    g.car = gain(1); g.carLP = filter('lowpass', 16000, 0.5); g.carGain = gain(0); g.carPan = pan(0);
    chain(g.car, g.carLP, g.carGain, g.carPan, g.bus);
    g.pCarLP = P(g.carLP.frequency); g.pCarGain = P(g.carGain.gain); g.pCarPan = P(g.carPan.pan);

    // engine: every loop plays all the time; update() moves their speeds and levels
    g.eng = gain(0); g.shift = gain(1); chain(g.eng, g.shift, filter('highpass', 28), g.car); g.pEng = P(g.eng.gain);
    g.exh = gain(0); g.exhLP = filter('lowpass', 6000, 0.5); chain(g.exh, filter('highpass', 40), filter('lowshelf', 110, 0.707, -5), g.exhLP, g.eng);
    g.bay = gain(0); g.bay.connect(g.eng);
    g.pExh = P(g.exh.gain); g.pBay = P(g.bay.gain); g.pExhLP = P(g.exhLP.frequency);
    g.chains = [];
    for (const mic of ['exh', 'bay']) for (const load of ['off', 'on']) {
      const layers = [];
      for (const [file, m, l, rpm, at, len] of ENGINE) { if (m !== mic || l !== load) continue; const buffer = files[file] && makeLoop(files[file], at, len, ENGINE_SEAM, ENGINE_RMS); if (!buffer) continue;
        const src = looped(buffer, 1, hash(rpm) * len), out = gain(0); chain(src, out, mic === 'exh' ? g.exh : g.bay);
        layers.push({ rpm, lr: Math.log(rpm), rate: P(src.playbackRate), gain: P(out.gain), w: 0 }); }
      if (layers.length) g.chains.push({ on: load === 'on' ? 1 : 0, layers });
    }

    // road: tyre roar (a band that climbs with speed), the broad wash around it, the low rumble of the surface, and grit when slow
    g.road = gain(1); g.road.connect(g.car);
    const tyre = looped(made.noise, 1, 0.3);
    const tyreOut = filter('lowpass', 2600, 0.6); tyreOut.connect(g.road);                       // tyre noise has little above a few kHz
    g.roarBP = filter('bandpass', 500, 0.8); g.roar = gain(0); chain(tyre, g.roarBP, g.roar, tyreOut);
    g.rumble = gain(0); chain(tyre, filter('lowpass', 150, 0.6), g.rumble, g.road);
    g.washLP = filter('lowpass', 1000, 0.5); g.wash = gain(0); chain(tyre, g.washLP, g.wash, tyreOut);
    g.pRoar = P(g.roar.gain); g.pRoarF = P(g.roarBP.frequency); g.pRumble = P(g.rumble.gain); g.pWash = P(g.wash.gain); g.pWashF = P(g.washLP.frequency);
    const gritSrc = looped(made.grit, 1, 0); g.grit = gain(0); chain(gritSrc, filter('highpass', 900, 0.5), g.grit, g.road); g.pGrit = P(g.grit.gain); g.pGritRate = P(gritSrc.playbackRate);
    const scrubSrc = looped(made.noise, 0.83, 2.1); g.scrub = gain(0); const sb1 = filter('bandpass', 1350, 2.2), sb2 = filter('bandpass', 2700, 3);
    scrubSrc.connect(sb1); scrubSrc.connect(sb2); sb1.connect(g.scrub); sb2.connect(g.scrub); g.scrub.connect(g.road); g.pScrub = P(g.scrub.gain);
    g.pads = gain(0); chain(looped(made.noise, 0.71, 3.3), filter('bandpass', 3300, 5), g.pads, g.road); g.pPads = P(g.pads.gain);
    g.revBP = filter('bandpass', 600, 22); g.rev = gain(0); chain(looped(made.noise, 1.13, 1.2), g.revBP, g.rev, g.car); g.pRev = P(g.rev.gain); g.pRevF = P(g.revBP.frequency);

    // wind past the camera: two streams of the same noise read from different places, one per ear
    g.wind = gain(1); const merge = ctx.createChannelMerger(2); merge.connect(g.wind); g.wind.connect(g.bus);
    g.windLP = [filter('lowpass', 300, 0.5), filter('lowpass', 300, 0.5)]; g.windG = [gain(0), gain(0)];
    chain(looped(made.noise, 1, 0.9), g.windLP[0], g.windG[0]).connect(merge, 0, 0); chain(looped(made.noise, 0.91, 3.7), g.windLP[1], g.windG[1]).connect(merge, 0, 1);
    g.pWindF = [P(g.windLP[0].frequency), P(g.windLP[1].frequency)]; g.pWindG = [P(g.windG[0].gain), P(g.windG[1].gain)];

    // ambience: the sea twice over (second copy slower, later and mirrored, so the pair never lines up the same way twice)
    g.amb = gain(1); g.amb.connect(g.bus);
    g.seaLP = filter('lowpass', 2500, 0.5); g.sea = gain(0); g.seaPan = pan(0); chain(g.seaLP, g.sea, g.seaPan, g.amb);
    g.pSea = P(g.sea.gain); g.pSeaPan = P(g.seaPan.pan); g.pSeaLP = P(g.seaLP.frequency);
    const sea = files.sea && makeLoop(files.sea, SEA[1], Math.min(SEA[2], files.sea.duration - SEA[1] - SEA[3] - 0.2), SEA[3], 0.08);
    if (sea) { looped(sea, 1, 0).connect(g.seaLP);
      const b = looped(sea, 0.93, sea.duration * 0.47);
      if (sea.numberOfChannels === 2) { const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2); b.connect(sp); sp.connect(mg, 0, 1); sp.connect(mg, 1, 0); mg.connect(g.seaLP); } else b.connect(g.seaLP); }
    g.grass = gain(0); chain(g.grass, filter('highpass', 800, 0.5), g.amb); g.pGrass = P(g.grass.gain);
    const grass = files.grass && makeLoop(files.grass, GRASS[1], Math.min(GRASS[2], files.grass.duration - GRASS[1] - GRASS[3] - 0.1), GRASS[3], 0.05);
    if (grass) { const l = pan(-0.7), r = pan(0.7); looped(grass, 1, 0).connect(l); looped(grass, 0.94, grass.duration * 0.55).connect(r); l.connect(g.grass); r.connect(g.grass); }

    // one-shots
    g.shots = {};
    for (const k in SHOTS) { const [file, at, len, pk] = SHOTS[k]; g.shots[k] = toPeak(cut(files[file], at, len, k === 'tick' || k === 'tock'), pk); }
    g.steps = STEPS.map(([at, len]) => cut(files.footsteps, at, len, true)).filter(Boolean);
    { const m = Math.max(...g.steps.map(peakOf), 1e-9); g.steps.forEach(b => scale(b, STEP_PEAK / m)); }
    g.gulls = GULLS.map(([file, at, len]) => toPeak(cut(files[file], at, len, false), GULL_PEAK)).filter(Boolean);
    // the relay: one whole tick-tock cycle as a loop, so its timing never depends on the frame rate
    if (g.shots.tick && g.shots.tock) { const sr = ctx.sampleRate, n = Math.round(60 / RELAY_PER_MIN * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); d.set(g.shots.tick.getChannelData(0), Math.round(0.02 * sr)); d.set(g.shots.tock.getChannelData(0), Math.round(0.02 * sr) + (n >> 1)); g.relay = b; }
    // a few ready-made outputs for one-shots: level → lowpass → side. Only the short-lived source is made per sound.
    g.voices = []; for (let i = 0; i < 6; i++) { const v = { g: gain(0), lp: filter('lowpass', 18000, 0.5), pan: pan(0), free: 0 }; chain(v.g, v.lp, v.pan, g.bus); g.voices.push(v); }
    g.carShot = gain(1); g.carShot.connect(g.car);
    return g;
  }

  // Play a buffer once. `dest` null = through a free voice (its own level, side and muffling); otherwise straight into a bus.
  function shot(buffer, level, rate, panV, lp, dest, delay) {
    if (!buffer || level <= 0) return;
    const src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate; const t = ctx.currentTime + (delay || 0);
    if (dest) { const gn = ctx.createGain(); gn.gain.value = level; src.connect(gn); gn.connect(dest); src.onended = () => gn.disconnect(); }
    else { let v = G.voices[0]; for (const o of G.voices) if (o.free < v.free) v = o;                // the voice that has been idle longest
      v.free = t + buffer.duration / rate; v.g.gain.setValueAtTime(level, t); v.pan.pan.setValueAtTime(clamp(panV, -1, 1), t); v.lp.frequency.setValueAtTime(lp, t); src.connect(v.g); src.onended = () => src.disconnect(); }
    src.start(t);
  }

  // ── state that update() carries from frame to frame ──
  // (now and clock live here rather than in plain variables so that writing them every frame makes no garbage)
  const S = { now: 0.5, clock: 0.5, rpm: IDLE_RPM + 0.5, thr: 0.001, speed: 0, brake: 0, blink: false, relay: null, relayG: null, gull: 6, chirp: 0, settle: 0, moved: 0, lastStep: -1, decel: 0 };

  function update(s) {
    if (!ready || !wanted || hidden) return;
    const g = G, away = s.dt > 0.5, dt = clamp(s.dt, 0, 0.1), now = S.now = ctx.currentTime, clock = S.clock += dt;
    // Coming back after a pause (hidden tab): let everything glide to where it should be rather than jump, and trigger nothing.
    const tau = away ? 0.25 : 0.035, k = 1 - Math.exp(-dt / 0.045);
    const rpm = S.rpm += (clamp(s.rpm, 0, 9000) - S.rpm) * (away ? 1 : k);
    const thr = S.thr += (clamp(s.throttle, 0, 1) - S.thr) * (away ? 1 : 1 - Math.exp(-dt / (s.throttle > S.thr ? 0.05 : 0.11)));
    const v = s.speed, d = Math.max(2.5, s.view.dist), behind = clamp(s.view.behind, 0, 1);

    // car as a whole: level falls with distance, the top end with it; the side follows the camera
    to(g.pCarGain, Math.pow(CHASE_DIST / d, 1.1), tau);
    to(g.pCarLP, clamp(16000 * Math.pow(6 / d, 0.75), 5000, 18000), tau);
    to(g.pCarPan, clamp(s.view.pan, -1, 1) * 0.75, tau);

    // engine. load: how much of the working-hard recordings to use. Near idle there is no such thing as load, only idle.
    const load = thr * step(800, 1250, rpm), lr = Math.log(Math.max(rpm, 100));
    const levelDb = 6 * Math.log2(Math.max(rpm, 300) / 6500) - 11 * (1 - load) * step(900, 2200, rpm) + 2.5 * thr * (1 - step(800, 1250, rpm));
    to(g.pEng, MIX.engine * mix.engine * Math.pow(10, levelDb / 20) * step(200, 600, rpm), tau);
    to(g.pExh, MIX.exhaust * (0.45 + 0.55 * behind), tau); to(g.pBay, 0.95 - 0.5 * behind, tau);
    to(g.pExhLP, 1400 * Math.pow(5, behind), tau);                                   // from the front the exhaust is only its low end
    for (let c = 0; c < g.chains.length; c++) {
      const ch = g.chains[c], L = ch.layers, n = L.length, part = Math.sqrt(ch.on ? load : 1 - load);
      let i = 0; while (i < n - 2 && lr > L[i + 1].lr) i++;
      const t = n > 1 ? clamp((lr - L[i].lr) / (L[i + 1].lr - L[i].lr), 0, 1) : 0;
      for (let j = 0; j < n; j++) {
        const l = L[j], w = (j === i ? Math.cos(t * 1.5708) : j === i + 1 && n > 1 ? Math.sin(t * 1.5708) : 0) * part, rate = clamp(rpm / l.rpm, 0.3, 2.5);
        if (w > 0 || l.w > 0) { if (l.w > 0) to(l.rate, rate, 0.02); else { l.rate.v = rate; l.rate.p.setValueAtTime(rate, now); } }   // a silent loop jumps to speed, a sounding one glides
        to(l.gain, w, away ? 0.25 : 0.03); l.w = w;
      }
    }

    // road
    const u = v / 27, low = step(0.2, 1.5, v), road = MIX.road * mix.road;
    to(g.pRoar, road * 0.9 * Math.pow(u, 1.4), 0.08); to(g.pRoarF, 420 + 21 * v, 0.1);
    to(g.pRumble, road * 1.6 * u * low, 0.08); to(g.pWash, road * 0.45 * Math.pow(u, 1.5), 0.08); to(g.pWashF, 900 + 60 * v, 0.1);
    to(g.pGrit, MIX.grit * mix.road * low * (1 - step(4, 10, v)) * (s.blinker ? 1 : 0.4), 0.1); to(g.pGritRate, 0.5 + 0.22 * v, 0.1);
    const skid = step(8, 11, s.decel) * step(2, 6, v);
    to(g.pScrub, MIX.scrub * mix.road * Math.max(step(3.5, 8.5, s.lateral) * step(3, 9, v) * (0.75 + 0.25 * wander(clock * 5)), skid), 0.05);
    to(g.pPads, MIX.pads * mix.road * clamp(s.brake, 0, 1) * low * (1 - step(1.5, 5, v)), 0.06);
    to(g.pRev, s.reverse ? MIX.reverse * mix.road * step(0.2, 1.5, v) * 0.5 : 0, 0.08); to(g.pRevF, clamp(330 * v, 200, 2400), 0.05);

    // wind: air past the camera (square of speed) over a breeze that comes and goes
    const breeze = 0.55 + 0.3 * wander(clock * 0.13) + 0.15 * wander(clock * 0.47 + 9), rush = u * u, wl = MIX.wind * mix.wind;
    for (let e = 0; e < 2; e++) {
      const gust = 1 + 0.22 * wander(clock * (0.9 + 0.3 * e) + 40 * e) * step(4, 20, v);
      to(g.pWindG[e], wl * (1.4 * rush * gust + MIX.breeze * 0.5 * breeze * (1 + 0.3 * wander(clock * 0.31 + 17 * e))), 0.12);
      to(g.pWindF[e], 240 + 90 * breeze + 34 * v, 0.2);
    }

    // ambience: quieter and duller when the camera is turned away from the drop
    const open = clamp(s.sea.gain, 0, 1), amb = mix.ambience;
    to(g.pSea, MIX.sea * amb * (0.18 + 0.82 * open), 0.3); to(g.pSeaPan, clamp(s.sea.pan, -1, 1) * 0.55, 0.3); to(g.pSeaLP, 1300 + 2400 * open, 0.3);
    to(g.pGrass, MIX.grass * amb * (0.25 + 1.1 * breeze * breeze), 0.25);
    if (!away && g.gulls.length && (S.gull -= dt) <= 0) {
      S.gull = 7 + 22 * Math.random(); const far = Math.random();                                  // far: 0 close overhead … 1 a speck over the water
      shot(g.gulls[Math.floor(Math.random() * g.gulls.length)], MIX.gulls * amb * (0.9 - 0.7 * far) * (0.35 + 0.65 * open) / (1 + (v / 12) * (v / 12)), 0.92 + 0.16 * Math.random(), clamp(s.sea.pan * 0.5 + (Math.random() * 2 - 1) * 0.8, -1, 1), 6500 - 4200 * far, null, 0);
    }

    // things that happen on their own
    if (!away) {
      if (s.decel > 8 && v > 4 && clock - S.chirp > 1.5) { S.chirp = clock; shot(g.shots.chirp, mix.road * (0.5 + 0.5 * step(8, 11, s.decel)), 0.95 + 0.1 * Math.random(), 0, 0, g.carShot, 0); }
      if (v > 1) { S.moved = clock; S.decel = s.decel; }
      if (S.speed > 0.12 && v <= 0.12 && clock - S.moved < 3 && clock - S.settle > 2) { S.settle = clock; shot(g.made.settle, mix.road * clamp(0.15 + S.decel * 0.07, 0.15, 0.5), 1, 0, 0, g.carShot, 0.04); }
    }
    if (s.blinker !== S.blink) { S.blink = s.blinker; relay(s.blinker); }
    S.speed = v;
  }

  // The indicator relay: start the tick-tock loop on the beat, let the last tick finish when it stops.
  function relay(on) {
    if (S.relay) { const t = ctx.currentTime; S.relayG.gain.setTargetAtTime(0, t, 0.02); S.relay.stop(t + 0.15); S.relay = null; }
    if (!on || !G.relay) return;
    const src = ctx.createBufferSource(), gn = ctx.createGain(); src.buffer = G.relay; src.loop = true; gn.gain.value = MIX.indicator * mix.foley; src.connect(gn); gn.connect(G.car); src.onended = () => gn.disconnect(); src.start();
    S.relay = src; S.relayG = gn;
  }

  function event(name, o) {
    if (!ready || !wanted || hidden) return;
    const g = G, f = mix.foley;
    if (name === 'doorOpen') shot(g.shots.doorOpen, MIX.doors * f, 1, 0, 0, g.carShot, 0);
    else if (name === 'doorClose') shot(g.shots.doorClose, MIX.doors * f, 0.97 + 0.06 * Math.random(), 0, 0, g.carShot, 0);
    else if (name === 'handbrake') shot(g.shots.handbrake, MIX.handbrake * f, 1, 0, 0, g.carShot, 0);
    else if (name === 'footstep') {
      if (!g.steps.length) return; let i; do { i = Math.floor(Math.random() * g.steps.length); } while (g.steps.length > 1 && i === S.lastStep); S.lastStep = i;
      shot(g.steps[i], MIX.steps * f * (o && o.gain != null ? o.gain : 1) * (0.78 + 0.34 * Math.random()), 0.93 + 0.14 * Math.random(), o && o.pan || 0, 9000, null, 0);
    } else if (name === 'shift') {
      const t = ctx.currentTime, p = g.shift.gain; p.cancelScheduledValues(t); p.setTargetAtTime(0.3, t, 0.012); p.setTargetAtTime(1, t + 0.075, 0.03);   // about 120 ms of lifted throttle
      shot(g.made.knock, 0.06 * f, 0.95 + 0.1 * Math.random(), 0, 0, g.carShot, 0.02);
    }
  }

  // ── on and off ──
  async function start() {
    const names = [...new Set([...ENGINE.map(e => e[0]), ...Object.values(SHOTS).map(e => e[0]), ...GULLS.map(e => e[0]), 'footsteps', SEA[0], GRASS[0]])];
    const decoded = await Promise.all(names.map(load)), files = {}; names.forEach((n, i) => { files[n] = decoded[i]; });
    try { G = build(files); for (const [n, off] of G.starts) n.start(0, off % n.buffer.duration); G.starts = null; ready = true; }
    catch (e) { warn('audio graph', e); }
  }
  const fadeTo = (v, secs) => { if (!G) return; const t = ctx.currentTime, p = G.fade.gain; p.cancelScheduledValues(t); p.setTargetAtTime(v, t, secs / 3); };
  function enable() {
    if (!supported) return Promise.resolve();
    wanted = true; clearTimeout(suspendTimer);
    try {
      if (!ctx) { ctx = options.context || new AC({ latencyHint: 'interactive' }); loading = start(); }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});   // must happen inside the click that called us
    } catch (e) { warn('audio', e); return Promise.resolve(); }
    return loading.then(() => { if (wanted && ready && !hidden) fadeTo(1, 0.6); });
  }
  function disable() {
    wanted = false; if (!ctx) return;
    fadeTo(0, 0.3); if (S.relay) { relay(false); S.blink = false; }
    clearTimeout(suspendTimer); if (!options.context) suspendTimer = setTimeout(() => { if (!wanted && ctx.suspend && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 450);
  }
  // A hidden tab stops calling update(), which would leave the engine droning at whatever it was doing. Fade out instead.
  if (typeof document !== 'undefined' && !options.context) document.addEventListener('visibilitychange', () => {
    hidden = document.hidden; if (!ready) return;
    if (hidden) { fadeTo(0, 0.25); if (S.relay) { relay(false); S.blink = false; } } else if (wanted) fadeTo(1, 0.6);
  });

  return {
    supported, enable, disable, update, event, mix,
    get on() { return wanted && ready; },
    get volume() { return volume; },
    set volume(v) { volume = clamp(+v || 0, 0, 1); if (G) G.volume.gain.setTargetAtTime(volume, ctx.currentTime, 0.03); },
  };
}
