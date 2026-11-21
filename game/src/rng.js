// SOLMAR BAY — a small seeded random number generator.
//
// The city, the traffic and the staged screenshot scenes are all built from
// one seed so a given seed always produces the same bay. mulberry32 is the
// core: tiny, fast and good enough for placing buildings and picking cars.

export class Rng {
  constructor(seed) {
    this.state = seed >>> 0 || 1;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.next();
  }

  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }

  chance(p) {
    return this.next() < p;
  }

  // A fresh independent stream derived from this one, so subsystems can
  // draw numbers without disturbing each other's sequences.
  fork(salt) {
    return new Rng((this.state ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0);
  }
}
