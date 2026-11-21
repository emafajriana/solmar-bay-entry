// rng.js — a small seeded random number generator (mulberry32) plus the
// helpers the world builders reach for. Everything procedural in SOLMAR BAY
// draws from one of these, never from Math.random, so a given seed always
// builds the same city and the screenshot scenes render identically.

export function makeRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
    sign() {
      return next() < 0.5 ? -1 : 1;
    },
    // A fresh generator on an independent stream, for subsystems that must
    // not disturb the caller's sequence.
    fork(salt) {
      return makeRng((seed ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0);
    },
  };
}
