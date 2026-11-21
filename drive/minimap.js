// The map in the corner: the road from above, turned so the car always points up, the way a driving game draws it.
// The mountain is on one side and the sea on the other; the way ahead is orange and what is behind is grey, as a
// navigation display draws a route; destinations are numbered, and a compass rim turns with the car.

const STEP = 5;   // metres between the points the road is drawn through

export function createMinimap(canvas, route, stops) {
  const n = Math.ceil(route.length / STEP), X = new Float32Array(n + 1), Z = new Float32Array(n + 1), RX = new Float32Array(n + 1), RZ = new Float32Array(n + 1), P = {};
  for (let i = 0; i <= n; i++) { const a = route.at(Math.min(route.length, i * STEP), P); X[i] = a.p.x; Z[i] = a.p.z; RX[i] = a.r.x; RZ[i] = a.r.z; }
  const marks = stops.filter(st => st.i > 0).map(st => { const a = route.at(st.s, P); return { x: a.p.x + a.r.x * 3, z: a.p.z + a.r.z * 3, n: String(st.i), i: st.i }; });
  const g = canvas.getContext('2d'), W = canvas.width, S = W / 168;   // drawn at the canvas's own resolution; 168 is its size on the page
  const SCALE = 0.4 * S, CX = W / 2, CY = W * 0.62, REACH = 260;       // px per metre; where the car sits; how far the road is drawn
  let last = { s: -1e9, h: 0, next: -1 };

  return {
    /** s: metres along the route; heading: the car's, radians; next: index of the next destination (or -1). Redraws only when something moved. */
    draw(s, heading, next) {
      if (Math.abs(s - last.s) < 0.25 && Math.abs(heading - last.h) < 0.003 && next === last.next) return false;
      last = { s, h: heading, next };
      const a = route.at(s, P), ox = a.p.x, oz = a.p.z, fx = Math.sin(heading), fz = Math.cos(heading), rx = -fz, rz = fx;
      const px = (x, z) => CX + ((x - ox) * rx + (z - oz) * rz) * SCALE, py = (x, z) => CY - ((x - ox) * fx + (z - oz) * fz) * SCALE;
      const i0 = Math.max(0, Math.floor((s - REACH) / STEP)), i1 = Math.min(n, Math.ceil((s + REACH * 1.5) / STEP));
      // (past either end of the route the land and the road carry straight on, so the map never shows where they stop)
      const line = (from, to, off, open = true) => {
        g.beginPath();
        if (open && from === 0) { const x = X[0] + RX[0] * off - (X[1] - X[0]) * 120, z = Z[0] + RZ[0] * off - (Z[1] - Z[0]) * 120; g.moveTo(px(x, z), py(x, z)); }
        for (let i = from; i <= to; i++) { const x = X[i] + RX[i] * off, z = Z[i] + RZ[i] * off; if (i === from && !(open && from === 0)) g.moveTo(px(x, z), py(x, z)); else g.lineTo(px(x, z), py(x, z)); }
        if (open && to === n) { const x = X[n] + RX[n] * off + (X[n] - X[n - 1]) * 120, z = Z[n] + RZ[n] * off + (Z[n] - Z[n - 1]) * 120; g.lineTo(px(x, z), py(x, z)); }
      };
      g.save(); g.clearRect(0, 0, W, W);
      g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#101317'; g.fillRect(0, 0, W, W);
      g.lineCap = 'round'; g.lineJoin = 'round';
      // the mountain on the driver's left, the sea on the right, the shoulder between
      line(i0, i1, -152); g.strokeStyle = '#2c2a27'; g.lineWidth = 300 * SCALE; g.stroke();
      line(i0, i1, -30); g.strokeStyle = '#34312d'; g.lineWidth = 34 * SCALE; g.stroke();          // the foot of the slope, a shade lighter
      line(i0, i1, 154); g.strokeStyle = '#143247'; g.lineWidth = 300 * SCALE; g.stroke();
      line(i0, i1, 12); g.strokeStyle = '#1b4460'; g.lineWidth = 8 * SCALE; g.stroke();           // surf along the foot of the drop
      line(i0, i1, 6); g.strokeStyle = '#23262b'; g.lineWidth = 9 * SCALE; g.stroke();
      // the road: a dark bed, the stretch behind in grey, the way ahead in the accent
      line(i0, i1, 0); g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 9 * S; g.stroke();
      line(i0, i1, 0); g.strokeStyle = '#7d848c'; g.lineWidth = 4.4 * S; g.stroke();
      const here = Math.max(i0, Math.min(i1, Math.ceil(s / STEP)));
      if (here < i1) { g.beginPath(); g.moveTo(CX, CY); for (let i = here; i <= i1; i++) g.lineTo(px(X[i], Z[i]), py(X[i], Z[i])); if (i1 === n) { const x = X[n] + (X[n] - X[n - 1]) * 120, z = Z[n] + (Z[n] - Z[n - 1]) * 120; g.lineTo(px(x, z), py(x, z)); } g.strokeStyle = '#ff7a3d'; g.lineWidth = 4.4 * S; g.stroke(); }
      // destinations: the next one lit, the ones behind dimmed
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${9.5 * S}px Archivo, system-ui, sans-serif`;
      for (const m of marks) {
        const x = px(m.x, m.z), y = py(m.x, m.z); if (x < -20 || y < -20 || x > W + 20 || y > W + 20) continue;
        const on = m.i === next, past = m.i < next || next < 0;
        if (on) { g.beginPath(); g.arc(x, y, 14 * S, 0, Math.PI * 2); g.fillStyle = 'rgba(255,122,61,.22)'; g.fill(); }
        g.beginPath(); g.arc(x, y, (on ? 9.5 : 8) * S, 0, Math.PI * 2); g.fillStyle = on ? '#ff7a3d' : past ? '#565c64' : '#f6f3ed'; g.fill();
        g.lineWidth = 1.6 * S; g.strokeStyle = '#0b0d10'; g.stroke();
        g.fillStyle = on ? '#fff' : past ? '#c9cdd2' : '#12161b'; g.fillText(m.n, x, y + 0.5 * S);
      }
      // the car, with a soft pool of light under it
      const glow = g.createRadialGradient(CX, CY, 0, CX, CY, 26 * S); glow.addColorStop(0, 'rgba(255,255,255,.2)'); glow.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = glow; g.fillRect(CX - 26 * S, CY - 26 * S, 52 * S, 52 * S);
      g.translate(CX, CY); g.beginPath(); g.moveTo(0, -9.5 * S); g.lineTo(6.6 * S, 7.4 * S); g.lineTo(0, 3.8 * S); g.lineTo(-6.6 * S, 7.4 * S); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.6 * S; g.strokeStyle = '#0b0d10'; g.stroke();
      g.restore();
      // a compass rim: a tick every 30 degrees, and north named
      g.save(); g.translate(W / 2, W / 2); g.rotate(-heading);
      for (let k = 0; k < 12; k++) { g.rotate(Math.PI / 6); g.fillStyle = 'rgba(255,255,255,.34)'; g.fillRect(-0.6 * S, -W / 2 + 2 * S, 1.2 * S, (k % 3 === 2 ? 6 : 3.5) * S); }
      g.restore();
      const nx = W / 2 - Math.sin(heading) * (W / 2 - 15 * S), ny = W / 2 - Math.cos(heading) * (W / 2 - 15 * S);
      g.fillStyle = '#ff7a3d'; g.font = `700 ${9.5 * S}px Archivo, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny);
      return true;
    },
  };
}
