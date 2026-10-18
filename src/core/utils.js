export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// Gameplay randomness goes through rng() so a run can be replayed exactly from a seed
// (used by the balance bots). Unseeded it is plain Math.random.
let rngState = null;
export function seedRandom(seed) { rngState = seed == null ? null : (seed >>> 0) || 1; }
export function rng() {
  if (rngState === null) return Math.random();
  // mulberry32
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rand = (a, b) => a + rng() * (b - a);
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];

/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Smoothly rotate angle `a` toward `b` along the shortest arc. */
export function dampAngle(a, b, lambda, dt) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export const Ease = {
  linear: (t) => t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/** Minimal tween runner: tweens.add({ duration, update(k), ease, delay, onComplete }). */
export class Tweens {
  constructor() { this.list = []; }

  add({ duration = 0.3, update, ease = Ease.outCubic, delay = 0, onComplete }) {
    const tw = { t: 0, duration, update, ease, delay, onComplete, dead: false };
    this.list.push(tw);
    return tw;
  }

  wait(seconds, fn) {
    return this.add({ duration: seconds, update: () => {}, ease: Ease.linear, onComplete: fn });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.dead) { this.list.splice(i, 1); continue; }
      tw.t += dt;
      if (tw.t < tw.delay) continue;
      const k = clamp((tw.t - tw.delay) / tw.duration, 0, 1);
      tw.update?.(tw.ease(k));
      if (k >= 1) {
        this.list.splice(i, 1);
        tw.onComplete?.();
      }
    }
  }

  clear() { this.list.length = 0; }
}
