// Générateur pseudo-aléatoire déterministe (mulberry32) — permet de rejouer
// une partie à l'identique et de sauvegarder l'état du hasard.

export class RNG {
  constructor(seed = 1) {
    this.state = seed >>> 0;
  }
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
  int(min, max) {
    // bornes incluses
    return Math.floor(this.range(min, max + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // Distribution approximativement normale, bornée à [0, 1]
  trait(mean = 0.5, spread = 0.2) {
    const g = (this.next() + this.next() + this.next() - 1.5) / 1.5;
    return Math.min(1, Math.max(0, mean + g * spread * 1.7));
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
