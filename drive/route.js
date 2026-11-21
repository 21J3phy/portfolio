// The road: a centreline that winds up a mountainside, sampled every 2 m. The mountain is on the driver's left and
// the drop to the sea on the right, the whole way. Headings: 0 faces +Z; the driver's right is −X when facing +Z.
import * as THREE from 'three';

export const STEP = 2;
const HEADING0 = 1.32;   // sets the route against the fixed sky: the low sun stays ahead and to the right

export function buildRoute(length) {
  const n = Math.ceil(length / STEP) + 1, x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), h = new Float32Array(n), g = new Float32Array(n), k = new Float32Array(n);
  let th = HEADING0;
  for (let i = 0; i < n; i++) {
    const s = i * STEP;
    k[i] = 0.0050 * Math.sin(s / 118 + 0.6) + 0.0027 * Math.sin(s / 47 + 2.1) + 0.0015 * Math.sin(s / 230 + 4.0);   // radius never under about 110 m
    g[i] = 0.034 + 0.02 * Math.sin(s / 160 + 1.0);                                                                // a steady climb, 1.4% to 5.4%
    h[i] = th;
    if (i < n - 1) { x[i + 1] = x[i] + Math.sin(th) * STEP; z[i + 1] = z[i] + Math.cos(th) * STEP; y[i + 1] = y[i] + g[i] * STEP; th += k[i] * STEP; }
  }
  const lerp = (a, f, i, j) => a[i] + (a[j] - a[i]) * f;
  /** Position, forward, right, heading, grade and curvature at distance s along the centreline. */
  function at(s, out = {}) {
    const f0 = Math.max(0, Math.min(n - 1.0001, s / STEP)), i = Math.floor(f0), j = i + 1, f = f0 - i;
    const th = lerp(h, f, i, j);
    (out.p ||= new THREE.Vector3()).set(lerp(x, f, i, j), lerp(y, f, i, j), lerp(z, f, i, j));
    (out.t ||= new THREE.Vector3()).set(Math.sin(th), 0, Math.cos(th));
    (out.r ||= new THREE.Vector3()).set(-Math.cos(th), 0, Math.sin(th));
    out.heading = th; out.grade = lerp(g, f, i, j); out.curvature = lerp(k, f, i, j);
    return out;
  }
  /** A point d metres to the right of the centreline (negative: left) and u metres above the road. */
  const tmp = {};
  function point(s, d = 0, u = 0, v = new THREE.Vector3()) { at(s, tmp); return v.copy(tmp.p).addScaledVector(tmp.r, d).setY(tmp.p.y + u); }
  return { length: (n - 1) * STEP, n, at, point };
}
