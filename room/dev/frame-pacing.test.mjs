import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FramePacer } from '../frame-pacing.js';

for (const hz of [60, 75, 90, 120, 144, 165, 240]) {
  for (const fps of [30, 60]) {
    test(`${hz} Hz display sustains ${fps} fps without reducing quality`, () => {
      const p = new FramePacer(); let frames = 0;
      for (let n = 0; n < hz * 10; n++) {
        const t = n * 1000 / hz;
        if (p.due(t, 1000 / fps)) { frames++; assert.ok(p.sample(t) >= 0.8); }
      }
      assert.ok(Math.abs(frames - fps * 10) <= 1, `${frames} frames`);
    });
  }
}
test('a slow renderer triggers adaptation after elapsed warm-up, even below 10 fps', () => {
  const p = new FramePacer(); let detected = null;
  for (let t = 0; t <= 3000; t += 150) {
    if (p.due(t, 1000 / 60) && p.sample(t) < 0.8) { detected = t; break; }
  }
  assert.ok(detected >= 2500 && detected <= 3000, `detected at ${detected}`);
});
test('idle and visibility transitions do not produce a catch-up burst or false downgrade', () => {
  const p = new FramePacer();
  for (let n = 0; n < 600; n++) {
    const t = n * 1000 / 144, gap = n < 300 ? 1000 / 60 : 1000 / 30;
    if (p.due(t, gap)) assert.ok(p.sample(t) >= 0.8);
  }
  p.reset();
  assert.equal(p.due(60000, 1000 / 60), true);
  assert.equal(p.due(60001, 1000 / 60), false);
  assert.equal(p.sample(60000), 1);
});
