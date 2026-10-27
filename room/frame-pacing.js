// Keep the fractional deadline across refreshes (75/90/144 Hz included).
// Measure sustained throughput, not individual skipped animation callbacks.
export class FramePacer {
  constructor() { this.reset(); }
  reset() { this.deadline = null; this.started = null; this.gap = 0; this.sampleAt = null; this.count = 0; }
  due(now, gap) {
    if (this.started === null) this.started = now;
    if (this.gap !== gap) { this.gap = gap; this.deadline = now; this.sampleAt = null; this.count = 0; }
    if (now + 0.2 < this.deadline) return false;
    this.deadline += (Math.floor(Math.max(0, now - this.deadline) / gap) + 1) * gap;
    return true;
  }
  sample(now) {
    if (now - this.started < 1500) return 1;
    if (this.sampleAt === null) { this.sampleAt = now; this.count = 0; return 1; }
    this.count++;
    const elapsed = now - this.sampleAt;
    if (elapsed < 1000) return 1;
    const rate = this.count * this.gap / elapsed;
    this.sampleAt = now; this.count = 0;
    return rate;
  }
}
