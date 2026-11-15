// Deterministic PRNG helpers. Every run with the same seed plays the same way.

// mulberry32: small, fast, well-distributed 32-bit PRNG.
// Returns a function that yields a float in [0, 1) on every call.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Float in [min, max).
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

// Integer in [min, max] inclusive.
export function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Uniform random element of a non-empty array.
export function randPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
