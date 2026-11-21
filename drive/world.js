// The world the car drives through: a two-lane road cut into a mountainside above the sea, late in the day.
//
// What is photographed and what is built:
//  - The sky, the sun, the far coast and the haze are a photograph: Poly Haven's "Table Mountain 1" HDRI (CC0),
//    shown on a dome around the camera and used, in its HDR form, to light and reflect in everything.
//  - The road, the rock and the scree use Poly Haven's scanned PBR textures (asphalt_02, cliff_side,
//    aerial_rocks_02; CC0) on geometry extruded along the route (route.js): a cross-section from the ridge above
//    the road down to the sea, displaced with noise, with a paved turnout at every destination.
//  - The guardrail, posts, lane paint, signs and scattered boulders are procedural.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const asset = name => new URL('./assets/' + name, import.meta.url).href;
export const SEA_Y = -235;
// where the sun is in the photograph (found from its brightest pixel): 13° up
const SUN_AZ = (0.637 - 0.5) * Math.PI * 2, SUN_EL = 13 * Math.PI / 180;
export const SUN_DIR = new THREE.Vector3(Math.cos(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), Math.sin(SUN_AZ) * Math.cos(SUN_EL));
export const SUN_COLOR = new THREE.Color(1.0, 0.78, 0.56);
export const HAZE = new THREE.Color(0.72, 0.77, 0.83);
export const ROAD = { half: 3.6, lane: 1.78, shoulder: 4.7, turnout: 6.4, turnoutLen: 34 };

// ---------------------------------------------------------------- noise
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v; }
function fbm(x, y, oct = 4) { let a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03; } return s; }
const smooth = (a, b, x) => { x = Math.max(0, Math.min(1, (x - a) / (b - a))); return x * x * (3 - 2 * x); };

// ---------------------------------------------------------------- loading
// Images are decoded off the main thread (createImageBitmap) and uploaded as they arrive, so neither the decode nor
// the upload lands in the first frame. `pending` settles when every texture asked for so far is on the GPU.
function textureLoader(renderer) {
  const pending = [];
  const viaImage = (t, url) => new Promise(done => { const im = new Image(); im.onload = () => { t.flipY = true; t.image = im; t.needsUpdate = true; done(); }; im.onerror = done; im.src = url; });
  const load = url => {
    const t = new THREE.Texture(); t.flipY = false;
    const job = typeof createImageBitmap !== 'function' ? viaImage(t, url)
      : fetch(url).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.blob(); })
        .then(b => createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
        .then(bmp => { t.image = bmp; t.needsUpdate = true; }, () => viaImage(t, url));
    pending.push(job.then(() => { try { if (t.image) renderer.initTexture(t); } catch {} }));
    return t;
  };
  return { load, pending };
}
function tex(loader, name, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = loader.load(asset(name)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const pbr = (loader, base, opts) => ({ map: tex(loader, base + '_diff.webp', { srgb: true, ...opts }), normalMap: tex(loader, base + '_nor.webp', opts), arm: tex(loader, base + '_arm.webp', opts) });
function standard({ map, normalMap, arm }, extra = {}) {
  return new THREE.MeshStandardMaterial({ map, normalMap, aoMap: arm, roughnessMap: arm, metalnessMap: null, roughness: 1, metalness: 0, ...extra });
}

// Scanned rock, used at two scales at once: the fine tile up close, a much larger copy of it far away, and the large
// copy modulating the fine one in between, so the repeat never reads. Colour is pulled toward the grey sandstone of
// the mountains in the photograph.
function rock(maps, { tint = 0xb9b3a8, sat = 0.42, normal = 1.3 } = {}) {
  const m = standard(maps, { vertexColors: true, normalScale: new THREE.Vector2(normal, normal) });
  const u = { uTint: { value: new THREE.Color(tint) }, uSat: { value: sat } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec3 uTint; uniform float uSat;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      {
        vec3 c1 = texture2D(map, vMapUv).rgb, c2 = texture2D(map, vMapUv * 0.137 + vec2(0.37, 0.11)).rgb, c3 = texture2D(map, vMapUv * 0.031 + vec2(0.71, 0.53)).rgb;
        float far = smoothstep(14.0, 150.0, length(vViewPosition));
        vec3 base = mix(c1 * (0.55 + c2 * 1.6), c2 * (0.6 + c3 * 1.5), far);
        float l = dot(base, vec3(0.3, 0.5, 0.2));
        diffuseColor.rgb *= mix(vec3(l), base, uSat) * uTint * 1.9;
      }`);
  };
  return m;
}

/** The sky: the photograph on a dome that follows the camera. The image is the panorama's upper band (down to −22.5°). */
function skyDome(map, lowQuality) {
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping; map.minFilter = THREE.LinearFilter; map.generateMipmaps = false; map.anisotropy = lowQuality ? 1 : 4;
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, sun: { value: SUN_DIR }, sunColor: { value: SUN_COLOR }, haze: { value: HAZE }, gain: { value: 1.0 } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 sun, sunColor, haze; uniform float gain; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float u = atan(d.z, d.x) * 0.15915494 + 0.5, v = asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5;
        float vt = 1.0 - (1.0 - v) * 1.6;                       // the image holds rows from the zenith down to −22.5°
        vec3 col = texture2D(map, vec2(u, max(vt, 0.004))).rgb;
        col = mix(haze * 0.9, col, smoothstep(-0.16, -0.06, d.y));   // well below the horizon the photograph's own foreground gives way to haze
        col = pow(col, vec3(1.12)) * gain;                      // the photograph is display-referred; open it up for the tone mapper
        float s = max(dot(d, sun), 0.0);
        col *= 1.0 - 0.3 * pow(s, 7.0);                         // (the photograph's own glare round the sun, taken down: it washed out whatever stood in front of it)
        col += sunColor * (pow(s, 2200.0) * 14.0 + pow(s, 140.0) * 0.12 + pow(s, 14.0) * 0.02);   // the sun itself, bright enough to bloom
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m); dome.scale.setScalar(6000); dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'sky';
  return dome;
}

// A green guide sign on two posts, like the ones that announce an exit.
function guideSign(lines, sub) {
  const W = 3.6, H = 1.5, c = document.createElement('canvas'); c.width = 1152; c.height = 480;
  const g = c.getContext('2d'), rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  g.fillStyle = '#0b5f37'; rr(0, 0, 1152, 480, 34); g.fill();
  g.strokeStyle = '#f2f4ef'; g.lineWidth = 9; rr(15, 15, 1122, 450, 24); g.stroke();
  g.fillStyle = '#f2f4ef'; g.textBaseline = 'alphabetic';
  g.font = '700 150px Archivo, Arial, sans-serif'; if ('fontStretch' in g) g.fontStretch = 'condensed';
  let size = 150; while (g.measureText(lines).width > 1040 && size > 70) { size -= 6; g.font = `700 ${size}px Archivo, Arial, sans-serif`; }
  g.fillText(lines, 56, 230);
  g.font = '500 66px Archivo, Arial, sans-serif'; if ('fontStretch' in g) g.fontStretch = 'normal';
  let s2 = 66; while (g.measureText(sub).width > 900 && s2 > 40) { s2 -= 3; g.font = `500 ${s2}px Archivo, Arial, sans-serif`; }
  g.fillText(sub, 58, 356);
  // the arrow: up and to the right
  g.save(); g.translate(1050, 380); g.rotate(-Math.PI / 4); g.fillRect(-52, -9, 84, 18); g.beginPath(); g.moveTo(52, 0); g.lineTo(14, -34); g.lineTo(14, 34); g.closePath(); g.fill(); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const group = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.06 }));
  face.position.y = 2.1 + H / 2; group.add(face);
  const steel = new THREE.MeshStandardMaterial({ color: 0x7d8288, roughness: 0.7, metalness: 0.3 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.03), steel); back.position.set(0, 2.1 + H / 2, -0.02); group.add(back);
  for (const x of [-1.1, 1.1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.1 + H + 0.6, 0.09), steel); p.position.set(x, (2.1 + H - 0.6) / 2, -0.08); p.castShadow = true; group.add(p); }
  face.castShadow = back.castShadow = true;
  return group;
}

/**
 * Build the world along `route`. `stops` are the destinations: { s, label, sub, n }.
 * Returns { group, sky, sun, env (promise), update(camera), shoulderAt(s) }.
 */
export function buildWorld(scene, renderer, route, stops, { tier = 'high' } = {}) {
  const hi = tier === 'high', loader = textureLoader(renderer), group = new THREE.Group(); group.name = 'world'; scene.add(group);
  const out = { group };
  const L = route.length;

  // ---------- sky, haze, sun, sea
  out.sky = skyDome(loader.load(asset(hi && renderer.capabilities.maxTextureSize >= 8192 ? 'sky_8k.webp' : 'sky_4k.webp')), !hi); scene.add(out.sky);
  scene.fog = new THREE.FogExp2(HAZE, 0.0001);
  const sun = new THREE.DirectionalLight(SUN_COLOR, 5.2);
  sun.castShadow = true; sun.shadow.mapSize.set(hi ? 2048 : 1536, hi ? 2048 : 1536); sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2.2;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 10, far: 260 });
  scene.add(sun, sun.target); out.sun = sun;
  scene.add(new THREE.HemisphereLight(0xcfe0f5, 0x7a6a58, 0.35));   // a little open-sky fill where the environment map's 8-bit shadows run short
  out.env = new HDRLoader().loadAsync(asset('sky_env.hdr')).then(hdr => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromEquirectangular(hdr); hdr.dispose(); pm.dispose();
    scene.environment = rt.texture; scene.environmentIntensity = 0.95; return rt;
  });
  {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), im = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) { const x = i % 256, y = Math.floor(i / 256), e = 0.9; const hgt = (px, py) => fbm(px / 9, py / 22, 4); const dx = hgt(x + e, y) - hgt(x - e, y), dy = hgt(x, y + e) - hgt(x, y - e); im.data[i * 4] = 128 + dx * 900; im.data[i * 4 + 1] = 128 + dy * 900; im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    const n = new THREE.CanvasTexture(c); n.wrapS = n.wrapT = THREE.RepeatWrapping; n.repeat.set(900, 900);
    // the built sea thins out with distance and lets the photograph's own sea and horizon take over
    const seaMat = new THREE.MeshStandardMaterial({ color: 0x23404f, roughness: 0.42, metalness: 0.0, normalMap: n, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.0, transparent: true, fog: false });
    seaMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tfloat seaD = length(vViewPosition); gl_FragColor.a *= exp(-seaD * seaD * 2.6e-8);'); };
    const sea = new THREE.Mesh(new THREE.CircleGeometry(30000, 64), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.y = SEA_Y; sea.name = 'sea'; group.add(sea); out.sea = sea; out.seaNormal = n;
  }

  // ---------- where the pavement ends on the valley side: wider at each destination's turnout
  const turnout = s => { let w = 0; for (const st of stops) { const d = Math.abs(s - st.s) / (ROAD.turnoutLen / 2); if (d < 1.35) w = Math.max(w, 1 - smooth(0.72, 1.35, d)); } return w; };
  const shoulderAt = s => ROAD.shoulder + (ROAD.turnout) * turnout(s);
  out.shoulderAt = shoulderAt;

  // ---------- the mountainside: rows every 4 m along the route, columns across it
  const rowStep = 4, rows = Math.floor(L / rowStep) + 1, P = {}, tmp = new THREE.Vector3(), v2 = new THREE.Vector3();
  const LEFT = { d: [-178, -150, -112, -78, -52, -34, -21.5, -14, -9.8, -7.3, -5.9, -5.0, -4.3, -3.6], h: [150, 166, 128, 88, 58, 37, 21.5, 11.5, 5.6, 2.3, 0.45, -0.2, -0.05, 0] };   // the first column drops behind the ridge
  const RIGHT = { d: [0, 0.8, 2.0, 5.5, 14, 34, 78, 150, 260, 420, 640], h: [-0.02, -0.22, -1.25, -4.4, -12, -29, -62, -112, -176, 0, 0] };   // d: beyond the pavement's edge; the last two reach the sea
  // far from the road the mountain follows a smoothed copy of the route, so tight bends don't fold it over itself
  const SM = 190, smP = [], smR = [];
  for (let r = 0; r < rows; r++) {
    const s0 = Math.min(L, r * rowStep), p = new THREE.Vector3(), rr = new THREE.Vector3(); let n = 0;
    for (let k = -SM; k <= SM; k += 15) { const a = route.at(Math.max(0, Math.min(L, s0 + k)), P); p.add(a.p); rr.add(a.r); n++; }
    smP.push(p.multiplyScalar(1 / n)); smR.push(rr.normalize());
  }
  function strip(cols, sideSign, getD, getH, uvScale, planar = false) {
    const nc = cols, pos = new Float32Array(rows * nc * 3), uv = new Float32Array(rows * nc * 2), col = new Float32Array(rows * nc * 3), idx = [];
    for (let r = 0; r < rows; r++) {
      const s = Math.min(L, r * rowStep), a = route.at(s, P);
      let arc = 0, pd = 0, ph = 0;
      for (let c = 0; c < nc; c++) {
        let d = getD(c, s), h = getH(c, s, a.p.y);
        const far = Math.abs(d) - ROAD.half, rocky = smooth(1.2, 5, far - (sideSign > 0 ? shoulderAt(s) - ROAD.half : 0));
        if (rocky > 0) {   // rock, not pavement: push it about
          const n1 = fbm(s / 23 + c * 3.1, c * 1.7 + sideSign * 9, 4) - 0.5, n2 = fbm(s / 6.5 + c * 7.7, c * 5.3 + sideSign * 3, 3) - 0.5;
          const amp = Math.min(sideSign > 0 ? 20 : 11, 0.5 + far * 0.15) * rocky;
          d += sideSign * (n1 * amp * 0.9 + n2 * Math.min(1.6, amp * 0.25)); h += n1 * amp * 0.75 + n2 * Math.min(1.2, amp * 0.2);
        }
        const blend = smooth(16, 70, far - (sideSign > 0 ? shoulderAt(s) - ROAD.half : 0));
        tmp.copy(a.p).addScaledVector(a.r, d); if (blend > 0) tmp.lerp(v2.copy(smP[r]).addScaledVector(smR[r], d), blend); const i = r * nc + c;
        pos[i * 3] = tmp.x; pos[i * 3 + 1] = a.p.y + h; pos[i * 3 + 2] = tmp.z;
        if (c) arc += Math.hypot(d - pd, h - ph); pd = d; ph = h;
        if (planar) { uv[i * 2] = tmp.x / uvScale; uv[i * 2 + 1] = tmp.z / uvScale; } else { uv[i * 2] = s / uvScale; uv[i * 2 + 1] = arc / uvScale; }
        // tint: weathering streaks, and scrub where the slope lets it hold
        const w = fbm(s / 60 + c, c * 2.2 + sideSign, 3), veg = smooth(0.52, 0.7, fbm(s / 34 + 40, c * 0.9 + sideSign * 5, 3)) * smooth(6, 20, far);
        const base = 0.78 + w * 0.42;
        col[i * 3] = base * (1 - veg * 0.42); col[i * 3 + 1] = base * (1 - veg * 0.2); col[i * 3 + 2] = base * (1 - veg * 0.6);
      }
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < nc - 1; c++) {
      const a = r * nc + c, b = a + 1, d = a + nc, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); g.userData.nc = nc; return g;
  }
  // a point on a strip: row r (fractional), column c (fractional)
  const onStrip = (g, r, c, out) => { const nc = g.userData.nc, p = g.attributes.position, r0 = Math.min(rows - 2, Math.floor(r)), c0 = Math.min(nc - 2, Math.floor(c)), fr = r - r0, fc = c - c0; const at2 = (rr, cc, v) => v.fromBufferAttribute(p, rr * nc + cc); at2(r0, c0, out).lerp(at2(r0, c0 + 1, v2), fc); at2(r0 + 1, c0, v4).lerp(at2(r0 + 1, c0 + 1, v2), fc); return out.lerp(v4, fr); };
  const v4 = new THREE.Vector3();
  const cliffTex = pbr(loader, 'cliff_side'), screeTex = pbr(loader, 'aerial_rocks_02');
  const cliffMat = rock(cliffTex, { tint: 0xbdb5a8, sat: 0.36, normal: 1.5 }), screeMat = rock(screeTex, { tint: 0xc4bdae, sat: 0.5, normal: 1.2 });
  // uphill: winding leaves (−d is left); the outermost columns are the ridge
  const leftGeo = strip(LEFT.d.length, -1, c => LEFT.d[c], c => LEFT.h[c], 9);
  const left = new THREE.Mesh(leftGeo, cliffMat); left.receiveShadow = true; left.castShadow = false; left.name = 'cliff'; group.add(left);
  const rightGeo = strip(RIGHT.d.length, 1, (c, s) => shoulderAt(s) + RIGHT.d[c], (c, s, y) => c >= RIGHT.d.length - 2 ? SEA_Y - 6 - y : Math.max(RIGHT.h[c], SEA_Y - 4 - y), 8);
  const right = new THREE.Mesh(rightGeo, screeMat); right.receiveShadow = true; right.name = 'slope'; group.add(right);

  // ---------- the pavement: two lanes and the shoulder (and each turnout), in scanned asphalt
  {
    const asph = pbr(loader, 'asphalt_02', { aniso: hi ? 16 : 8 });
    const nc = 6, pos = new Float32Array(rows * nc * 3), uv = new Float32Array(rows * nc * 2), col = new Float32Array(rows * nc * 3), idx = [];
    for (let r = 0; r < rows; r++) {
      const s = Math.min(L, r * rowStep), a = route.at(s, P), e = shoulderAt(s), ds = [-ROAD.half - 0.72, -ROAD.half, 0, ROAD.half, (ROAD.half + e) / 2, e + 0.04];
      for (let c = 0; c < nc; c++) {
        tmp.copy(a.p).addScaledVector(a.r, ds[c]); const i = r * nc + c;
        pos[i * 3] = tmp.x; pos[i * 3 + 1] = a.p.y - Math.abs(ds[c]) * 0.018 - (c === 0 ? 0.04 : 0); pos[i * 3 + 2] = tmp.z;   // a little crown
        uv[i * 2] = ds[c] / 4.2; uv[i * 2 + 1] = s / 4.2;
        // worn lighter in the wheel tracks, darker with grit at the edges
        const edge = c === 0 || c === nc - 1 ? 0.72 : c === 4 ? 0.86 : 1, patch = 0.92 + 0.16 * fbm(s / 30 + c * 2, c, 2);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = edge * patch;
      }
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < nc - 1; c++) { const a = r * nc + c, b = a + 1, d = a + nc, e = d + 1; idx.push(a, b, d, b, e, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const road = new THREE.Mesh(g, standard(asph, { vertexColors: true, color: 0xb8b8b8, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.9 })); road.receiveShadow = true; road.name = 'road'; group.add(road); out.road = road;
  }

  // ---------- paint: a double yellow centre line and white edge lines, worn
  {
    const c = document.createElement('canvas'); c.width = 64; c.height = 1024; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 1024);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; const w = 1 + Math.random() * 5; g.fillRect(Math.random() * 64, Math.random() * 1024, w, w * (1 + Math.random() * 6)); }
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(0, Math.random() * 1024, 64, 1 + Math.random() * 3); }
    const wear = new THREE.CanvasTexture(c); wear.wrapS = wear.wrapT = THREE.RepeatWrapping; wear.anisotropy = 8;
    const ribbon = (d, w, color) => {
      const pos = new Float32Array(rows * 2 * 3), uv = new Float32Array(rows * 2 * 2), idx = [];
      for (let r = 0; r < rows; r++) {
        const s = Math.min(L, r * rowStep), a = route.at(s, P);
        for (let k = 0; k < 2; k++) { const dd = d + (k ? w / 2 : -w / 2); tmp.copy(a.p).addScaledVector(a.r, dd); const i = r * 2 + k; pos[i * 3] = tmp.x; pos[i * 3 + 1] = a.p.y - Math.abs(dd) * 0.018 + 0.006; pos[i * 3 + 2] = tmp.z; uv[i * 2] = k; uv[i * 2 + 1] = s / 9; }
        if (r < rows - 1) { const a0 = r * 2; idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
      }
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g2.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g2.setIndex(idx); g2.computeVertexNormals();
      const m = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ color, roughness: 0.62, alphaMap: wear, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.receiveShadow = true; m.renderOrder = 1; group.add(m);
    };
    ribbon(-0.1, 0.11, 0xd6a11a); ribbon(0.1, 0.11, 0xd6a11a); ribbon(-ROAD.half + 0.22, 0.12, 0xe9e7df); ribbon(ROAD.half - 0.22, 0.12, 0xe9e7df);
  }

  // ---------- guardrail along the drop: a galvanised W-beam on posts
  {
    const prof = [[0.0, 0.0], [-0.045, 0.045], [-0.045, 0.105], [0.0, 0.155], [-0.045, 0.205], [-0.045, 0.265], [0.0, 0.31]], np = prof.length, base = 0.42;
    const pos = new Float32Array(rows * np * 3), uv = new Float32Array(rows * np * 2), idx = [];
    for (let r = 0; r < rows; r++) {
      const s = Math.min(L, r * rowStep), a = route.at(s, P), e = shoulderAt(s) - 0.28;
      for (let k = 0; k < np; k++) { tmp.copy(a.p).addScaledVector(a.r, e + prof[k][0]); const i = r * np + k; pos[i * 3] = tmp.x; pos[i * 3 + 1] = a.p.y - e * 0.018 + base + prof[k][1]; pos[i * 3 + 2] = tmp.z; uv[i * 2] = s / 2; uv[i * 2 + 1] = k / (np - 1); }
      if (r < rows - 1) for (let k = 0; k < np - 1; k++) { const a0 = r * np + k, b = a0 + 1, d = a0 + np, f = d + 1; idx.push(a0, d, b, b, d, f); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const steel = new THREE.MeshStandardMaterial({ color: 0xb4b9be, roughness: 0.58, metalness: 0.85, side: THREE.DoubleSide, envMapIntensity: 1.0 });   // (weathered galvanising: a mirror-bright rail throws the low sun straight into the lens)
    const rail = new THREE.Mesh(g, steel); rail.castShadow = true; rail.receiveShadow = true; rail.name = 'guardrail'; group.add(rail);
    const count = Math.floor(L / 3.8), posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.86, 0.15), new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.55, metalness: 0.85 }), count), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) { const s = i * 3.8 + 1, a = route.at(s, P), e = shoulderAt(s) - 0.2; tmp.copy(a.p).addScaledVector(a.r, e); tmp.y = a.p.y - e * 0.018 + 0.36; q.setFromAxisAngle(up, a.heading); posts.setMatrixAt(i, m.compose(tmp, q, one)); }
    posts.castShadow = true; posts.name = 'guardrailPosts'; group.add(posts);
  }

  // ---------- boulders and scrub on the slopes
  {
    const rockGeo = new THREE.IcosahedronGeometry(1, 2), rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) { tmp.fromBufferAttribute(rp, i); const k = 0.72 + 0.5 * fbm(tmp.x * 1.7 + 3, tmp.y * 1.7 + tmp.z * 1.3, 3); rp.setXYZ(i, tmp.x * k, tmp.y * k * 0.72, tmp.z * k); }
    rockGeo.computeVertexNormals(); rockGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(rp.count * 2).map((_, i) => i % 2 ? rp.getY(i >> 1) * 0.5 : rp.getX(i >> 1) * 0.5 + rp.getZ(i >> 1) * 0.3), 2));
    const N = hi ? 520 : 240, rocks = new THREE.InstancedMesh(rockGeo, standard(screeTex, { color: 0xd8d2c6 }), N), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
    let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) {
      const leftSide = rnd() < 0.4, k = rnd(), size = 0.16 + rnd() * rnd() * (leftSide ? 0.8 : 2.2);
      // near the road on the cliff side (columns just above the ditch), anywhere down the first stretch of the drop
      if (leftSide) onStrip(leftGeo, rnd() * (rows - 1), LEFT.d.length - 5 - k * k * 3.5, tmp); else onStrip(rightGeo, rnd() * (rows - 1), 2 + k * 3.6, tmp);
      tmp.y += size * 0.18;
      q.setFromEuler(e.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3)); sc.set(size * (0.8 + rnd() * 0.6), size * (0.6 + rnd() * 0.5), size * (0.8 + rnd() * 0.6));
      rocks.setMatrixAt(i, m.compose(tmp, q, sc));
    }
    rocks.castShadow = true; rocks.receiveShadow = true; rocks.name = 'boulders'; group.add(rocks);
    // scrub: low, dark, matte clumps well off the road, where the eye reads them as bushes
    const bush = new THREE.IcosahedronGeometry(1, 1), bp = bush.attributes.position;
    for (let i = 0; i < bp.count; i++) { tmp.fromBufferAttribute(bp, i); const k = 0.75 + 0.5 * hash(tmp.x * 9 + tmp.y * 5, tmp.z * 7); bp.setXYZ(i, tmp.x * k, Math.max(-0.2, tmp.y) * k * 0.7, tmp.z * k); }
    bush.computeVertexNormals();
    const NB = hi ? 900 : 360, bushes = new THREE.InstancedMesh(bush, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), NB), c = new THREE.Color();
    for (let i = 0; i < NB; i++) {
      const leftSide = rnd() < 0.5, k = rnd(), size = 0.25 + rnd() * 0.7;
      if (leftSide) onStrip(leftGeo, rnd() * (rows - 1), 1 + k * (LEFT.d.length - 10), tmp); else onStrip(rightGeo, rnd() * (rows - 1), 4.2 + k * 3.6, tmp);
      tmp.y += size * 0.12;
      q.setFromEuler(e.set(0, rnd() * 6.3, 0)); sc.set(size * (1 + rnd() * 0.8), size * (0.5 + rnd() * 0.4), size * (1 + rnd() * 0.8));
      bushes.setMatrixAt(i, m.compose(tmp, q, sc)); bushes.setColorAt(i, c.setHSL(0.19 + rnd() * 0.09, 0.3 + rnd() * 0.2, 0.05 + rnd() * 0.05));
    }
    bushes.receiveShadow = true; bushes.name = 'scrub'; group.add(bushes);
  }

  // ---------- a guide sign before each destination, on the shoulder
  out.signs = [];
  for (const st of stops) {
    if (!st.sign) continue;
    const s = st.s - 52, a = route.at(s, P), sign = guideSign(`${st.n ? st.n + '  ' : ''}${st.label}`, st.sub || '');
    tmp.copy(a.p).addScaledVector(a.r, shoulderAt(s) + 1.0); sign.position.set(tmp.x, a.p.y - 0.6, tmp.z); sign.rotation.y = a.heading + Math.PI - 0.12;
    group.add(sign); out.signs.push(sign);
  }

  /** Each frame: the sky stays around the camera, the sun's shadow box stays around the car. */
  const sp = new THREE.Vector3();
  out.update = (camera, focus) => {
    out.sky.position.copy(camera.position);
    out.sea.position.x = camera.position.x; out.sea.position.z = camera.position.z;
    out.seaNormal.offset.set(camera.position.x / 33.3, -camera.position.z / 33.3);   // the swell stays put while the disc follows
    sp.copy(focus); sun.target.position.copy(sp); sun.position.copy(sp).addScaledVector(SUN_DIR, 130); sun.target.updateMatrixWorld();
  };
  out.ready = Promise.all(loader.pending);   // every texture decoded and on the GPU
  return out;
}
function interp(xs, ys, x) { for (let i = 0; i < xs.length - 1; i++) if (x >= xs[i] && x <= xs[i + 1]) return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i]); return x < xs[0] ? ys[0] : ys[ys.length - 1]; }
