// The neuron-steering display: a wall screen that plots the real Lazy Genius recipe (data/lazy-recipe.json, the 344
// [layer, neuron, dose] entries from github.com/21J3phy/lazy-genius-qwen) and plays what the edit does: the neurons
// are nudged only while the model writes the first six tokens of an answer, and the answer comes out shorter.
// Back at z = 0, centred, facing +Z. userData.draw(time) redraws the screen; call it while it's in view.
import * as THREE from 'three';
import { Builder, box } from './kit.js';

export const SIZE = Object.freeze([1.7, 0.956]);
const W = 1600, H = 900, LAYERS = [3, 30], WIDTH = 9216;   // Qwen3.5-4B's MLP width
const ORANGE = '#ff7a2f', BLUE = '#5ab8ff', INK = '#f2efe8', DIM = 'rgba(242,239,232,.55)', FAINT = 'rgba(242,239,232,.14)';
const sans = 'Archivo, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
// Sealed test 1 (2026-10-29): words per answer and what the controls did, as reported in the repository's README.
const NORMAL = 208, STEERED = 131;

export default async function createNeuronWall() {
  const b = new Builder('neuronWall');
  const [w, h] = SIZE;
  b.add(box(w + 0.03, h + 0.03, 0.028, 0.006), 'plasticBlack', { position: [0, 0, 0.03] });
  b.add(box(0.3, 0.2, 0.016, 0.004), 'blackMetal', { position: [0, 0, 0.008] });
  const group = b.build();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xdddddd }));
  screen.position.z = 0.0445; screen.name = 'neuronScreen'; group.add(screen);

  let neurons = [];
  try { neurons = (await (await fetch(new URL('../data/lazy-recipe.json', import.meta.url))).json()).neurons; } catch (e) { console.warn('recipe', e); }
  const core = neurons.filter(n => Math.abs(n[2]) > 0.05), rest = neurons.filter(n => Math.abs(n[2]) <= 0.05);
  const maxSmall = Math.max(1e-6, ...rest.map(n => Math.abs(n[2])));

  // layout: the layer grid on the left, the answer on the right
  const GX = 70, GY = 150, GW = 900, GH = 640, rowH = GH / (LAYERS[1] - LAYERS[0] + 1);
  const pos = n => [GX + 46 + (n[1] / WIDTH) * (GW - 60), GY + (n[0] - LAYERS[0] + 0.5) * rowH];
  // the static layer: tracks, labels and the dim recipe
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  {
    const s = base.getContext('2d');
    const bg = s.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0d0f13'); bg.addColorStop(1, '#14161c');
    s.fillStyle = bg; s.fillRect(0, 0, W, H);
    s.textBaseline = 'alphabetic';
    s.fillStyle = INK; s.font = `600 44px ${sans}`; s.fillText('Lazy Genius', GX, 78);
    s.fillStyle = DIM; s.font = `400 26px ${sans}`; s.fillText('344 neurons in Qwen3.5-4B, nudged for the first 6 tokens of each answer', GX, 118);
    for (let l = LAYERS[0]; l <= LAYERS[1]; l++) {
      const y = GY + (l - LAYERS[0] + 0.5) * rowH;
      s.fillStyle = FAINT; s.fillRect(GX + 46, y - 0.5, GW - 60, 1);
      if (l % 3 === 0) { s.fillStyle = DIM; s.font = `400 17px ${sans}`; s.textAlign = 'right'; s.fillText(String(l), GX + 34, y + 6); s.textAlign = 'left'; }
    }
    s.save(); s.translate(GX - 18, GY + GH / 2); s.rotate(-Math.PI / 2); s.fillStyle = DIM; s.font = `400 18px ${sans}`; s.textAlign = 'center'; s.fillText('MLP layer', 0, 0); s.restore();
    s.fillStyle = DIM; s.font = `400 18px ${sans}`; s.fillText('neuron index →', GX + 46, GY + GH + 32);
    // legend
    const ly = GY + GH + 26;
    s.fillStyle = ORANGE; s.beginPath(); s.arc(GX + 430, ly, 7, 0, 7); s.fill(); s.fillStyle = DIM; s.fillText('pushed up', GX + 446, ly + 6);
    s.fillStyle = BLUE; s.beginPath(); s.arc(GX + 580, ly, 7, 0, 7); s.fill(); s.fillStyle = DIM; s.fillText('pushed down', GX + 596, ly + 6);
    s.strokeStyle = INK; s.lineWidth = 2; s.beginPath(); s.arc(GX + 752, ly, 9, 0, 7); s.stroke(); s.fillStyle = DIM; s.fillText('8 core neurons', GX + 770, ly + 6);
    for (const n of rest) { const [x, y] = pos(n); s.fillStyle = n[2] > 0 ? 'rgba(255,122,47,.34)' : 'rgba(90,184,255,.34)'; s.beginPath(); s.arc(x, y, 2.4 + 3.2 * Math.abs(n[2]) / maxSmall, 0, 7); s.fill(); }
    for (const n of core) { const [x, y] = pos(n); s.fillStyle = n[2] > 0 ? 'rgba(255,122,47,.5)' : 'rgba(90,184,255,.5)'; s.beginPath(); s.arc(x, y, 9, 0, 7); s.fill(); s.strokeStyle = 'rgba(242,239,232,.6)'; s.lineWidth = 2; s.beginPath(); s.arc(x, y, 14, 0, 7); s.stroke(); }
    // right column frame
    s.fillStyle = 'rgba(242,239,232,.06)'; s.fillRect(1030, 150, 500, 640);
    s.fillStyle = DIM; s.font = `400 20px ${sans}`; s.fillText('Sealed test 1 · 96 questions × 4 seeds · blind-graded', 1030, 826);
  }

  // one loop: 6 steered tokens, then the rest of the answer with the edit off; the normal answer runs alongside
  const LOOP = 11, TOK = 0.42;
  function draw(time) {
    const t = ((time % LOOP) + LOOP) % LOOP, tok = Math.floor(t / TOK), on = tok < 6;
    g.drawImage(base, 0, 0);
    // lit neurons while the edit is on (they fade as it switches off)
    const k = on ? 1 : Math.max(0, 1 - (t - 6 * TOK) / 0.8);
    if (k > 0) {
      g.globalCompositeOperation = 'lighter';
      const pulse = 0.75 + 0.25 * Math.sin(t * 14);
      for (const n of rest) { const [x, y] = pos(n); g.fillStyle = n[2] > 0 ? `rgba(255,122,47,${0.5 * k})` : `rgba(90,184,255,${0.5 * k})`; g.beginPath(); g.arc(x, y, 2.4 + 3.2 * Math.abs(n[2]) / maxSmall, 0, 7); g.fill(); }
      for (const n of core) {
        const [x, y] = pos(n), col = n[2] > 0 ? '255,122,47' : '90,184,255';
        const gr = g.createRadialGradient(x, y, 0, x, y, 46); gr.addColorStop(0, `rgba(${col},${0.55 * k * pulse})`); gr.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gr; g.fillRect(x - 46, y - 46, 92, 92);
        g.fillStyle = `rgba(${col},${k})`; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    // token strip
    g.textBaseline = 'alphabetic'; g.font = `500 22px ${sans}`;
    g.fillStyle = on ? ORANGE : DIM; g.fillText(on ? `Edit on · token ${Math.min(6, tok + 1)} of 6` : 'Edit off · the model finishes on its own', 1056, 196);
    for (let i = 0; i < 6; i++) { g.fillStyle = i < Math.min(tok + (on ? 1 : 0), 6) ? ORANGE : FAINT; g.fillRect(1056 + i * 34, 214, 26, 8); }
    for (let i = 6; i < 13; i++) { g.fillStyle = !on && i < tok ? 'rgba(242,239,232,.7)' : FAINT; g.fillRect(1056 + i * 34, 214, 26, 8); }
    // two answers growing: the normal one keeps going, the steered one stops early
    const grow = Math.min(1, t / (LOOP - 3.2));
    const bar = (y, label, words, col) => {
      const n = Math.round(words * Math.min(1, grow * NORMAL / words)), full = 440, wpx = full * n / NORMAL;
      g.fillStyle = DIM; g.font = `400 22px ${sans}`; g.fillText(label, 1056, y);
      g.fillStyle = FAINT; g.fillRect(1056, y + 16, full, 30);
      g.fillStyle = col; g.fillRect(1056, y + 16, wpx, 30);
      g.fillStyle = INK; g.font = `600 52px ${sans}`; g.fillText(String(n), 1056, y + 112);
      const nw = g.measureText(String(n)).width;
      g.fillStyle = DIM; g.font = `400 22px ${sans}`; g.fillText('words', 1056 + nw + 12, y + 112);
    };
    bar(300, 'Normal answer', NORMAL, 'rgba(242,239,232,.6)');
    bar(470, 'With the edit', STEERED, ORANGE);
    const done = grow >= 1;
    g.fillStyle = done ? INK : DIM; g.font = `600 64px ${sans}`; g.fillText(done ? '37% shorter' : '', 1056, 700);
    g.fillStyle = DIM; g.font = `400 22px ${sans}`;
    if (done) { g.fillText('Core accuracy 86.2% → 87.2%. Not a clean pass:', 1056, 742); g.fillText('each sealed test missed one pre-registered check.', 1056, 772); }
    tex.needsUpdate = true;
  }
  draw(LOOP - 0.5);
  group.userData = { draw, screen, size: [SIZE[0], SIZE[1], 0.05], loop: LOOP };
  return group;
}
