// rng.js — a small seeded random generator. The whole city is built from
// one seed so a screenshot scene, a test run and a player's first visit all
// raise the same streets. mulberry32: tiny, fast, good enough for rooftops.

export class RNG {
  constructor(seed = 1) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }

  chance(p) {
    return this.next() < p;
  }

  // A soft bell around the middle of a range — building heights and crowd
  // speeds look wrong when they are uniformly random.
  bell(min, max) {
    const t = (this.next() + this.next() + this.next()) / 3;
    return min + (max - min) * t;
  }
}

// The world RNG is swapped in by main.js before the city is built, so every
// module that asks for `worldRNG` decorates the same city.
let shared = new RNG(20261117);
export function setWorldRNG(rng) { shared = rng; }
export function worldRNG() { return shared; }
