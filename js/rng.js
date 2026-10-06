// js/rng.js
(function () {
  'use strict';

  function hash32(x, y, seed) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2246822519;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
  }

  function rand2(x, y, seed) {
    return hash32(x, y, seed) / 4294967295;
  }

  function valueNoise2(x, y, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const n00 = rand2(x0,     y0,     seed);
    const n10 = rand2(x0 + 1, y0,     seed);
    const n01 = rand2(x0,     y0 + 1, seed);
    const n11 = rand2(x0 + 1, y0 + 1, seed);
    const a = n00 + (n10 - n00) * sx;
    const b = n01 + (n11 - n01) * sx;
    return a + (b - a) * sy;
  }

  function fbm(x, y, seed, octaves) {
    let v = 0, amp = 1, freq = 1, tot = 0;
    for (let i = 0; i < octaves; i++) {
      v += valueNoise2(x * freq, y * freq, seed + i * 1013) * amp;
      tot += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return v / tot;
  }

  window.RNG = { hash32, rand2, valueNoise2, fbm };
})();
