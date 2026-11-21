// The map in the corner: the road from above, turned so the car always points up, the way a driving game draws it.
// The mountain is on one side and the sea on the other; the part already driven is orange; destinations are numbered.

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
      g.beginPath(); g.arc(W / 2, W / 2, W / 2 - S, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#12161b'; g.fillRect(0, 0, W, W);
      g.lineCap = 'round'; g.lineJoin = 'round';
      // the mountain on the driver's left, the sea on the right
      line(i0, i1, -152); g.strokeStyle = '#4a3b30'; g.lineWidth = 300 * SCALE; g.stroke();
      line(i0, i1, 154); g.strokeStyle = '#1d3a52'; g.lineWidth = 300 * SCALE; g.stroke();
      line(i0, i1, 7); g.strokeStyle = '#3d4a4f'; g.lineWidth = 9 * SCALE; g.stroke();          // the shoulder and the drop's edge
      // the road, then the part already driven
      line(i0, i1, 0); g.strokeStyle = '#0b0d10'; g.lineWidth = 8.5 * S; g.stroke();
      line(i0, i1, 0); g.strokeStyle = '#d9dcdf'; g.lineWidth = 4.6 * S; g.stroke();
      const here = Math.min(i1, Math.floor(s / STEP));
      if (here > i0) { line(i0, here, 0, false); g.lineTo(CX, CY); g.strokeStyle = '#ff7a3d'; g.lineWidth = 4.6 * S; g.stroke(); }
      // destinations
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${9.5 * S}px Archivo, system-ui, sans-serif`;
      for (const m of marks) {
        const x = px(m.x, m.z), y = py(m.x, m.z); if (x < -20 || y < -20 || x > W + 20 || y > W + 20) continue;
        const on = m.i === next;
        g.beginPath(); g.arc(x, y, (on ? 9.5 : 8) * S, 0, Math.PI * 2); g.fillStyle = on ? '#ff7a3d' : m.i < next || next < 0 ? '#8d949b' : '#f3f1ec'; g.fill();
        g.lineWidth = 1.6 * S; g.strokeStyle = '#0b0d10'; g.stroke();
        g.fillStyle = on ? '#fff' : '#12161b'; g.fillText(m.n, x, y + 0.5 * S);
      }
      // the car
      g.translate(CX, CY); g.beginPath(); g.moveTo(0, -9 * S); g.lineTo(6.2 * S, 7 * S); g.lineTo(0, 3.6 * S); g.lineTo(-6.2 * S, 7 * S); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.6 * S; g.strokeStyle = '#0b0d10'; g.stroke();
      g.restore();
      // north, on the rim
      const na = heading, nx = W / 2 + Math.sin(na) * (W / 2 - 11 * S), ny = W / 2 - Math.cos(na) * (W / 2 - 11 * S);
      g.fillStyle = 'rgba(255,255,255,.72)'; g.font = `600 ${9 * S}px Archivo, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny);
      return true;
    },
  };
}
