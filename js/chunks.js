// js/chunks.js
// Чанки 16×16, ленивая генерация, детерминированная по seed.
(function () {
  'use strict';

  const TILE  = 16;
  const CHUNK = 16;

  const cache = new Map();

  function key(cx, cy) { return cx + ',' + cy; }

  function biomeAt(wx, wy, seed) {
    const n = RNG.fbm(wx * 0.02, wy * 0.02, seed, 4);
    const m = RNG.fbm(wx * 0.01 + 100, wy * 0.01 + 100, seed + 7, 3);
    if (n < 0.32) return 'water';
    if (n < 0.36) return 'sand';
    if (m > 0.72) return 'stone';
    if (m < 0.15) return 'snow';
    return 'grass';
  }

  function decorateAt(wx, wy, seed, biome) {
    if (biome === 'water' || biome === 'stone') return null;
    const r = RNG.rand2(wx, wy, seed + 999);
    if (r >= 0.05) return null;           // ~5% тайлов с декором
    const t = RNG.rand2(wx, wy, seed + 1234);
    if (t < 0.45) return { type: 'tree',   hp: 5, maxHp: 5 };
    if (t < 0.65) return { type: 'bush',   hp: 3, maxHp: 3 };
    if (t < 0.85) return { type: 'rock',   hp: 6, maxHp: 6 };
    if (t < 0.97) return { type: 'flower', hp: 1, maxHp: 1 };
    return { type: 'ore', hp: 8, maxHp: 8 };
  }

  function generateChunk(cx, cy, seed) {
    const tiles = new Array(CHUNK * CHUNK);
    const decor = new Array(CHUNK * CHUNK);
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = cx * CHUNK + x;
        const wy = cy * CHUNK + y;
        const b = biomeAt(wx, wy, seed);
        tiles[y * CHUNK + x] = b;
        decor[y * CHUNK + x] = decorateAt(wx, wy, seed, b);
      }
    }
    return { cx: cx, cy: cy, tiles: tiles, decor: decor };
  }

  function getChunk(cx, cy, seed) {
    const k = key(cx, cy);
    let c = cache.get(k);
    if (!c) {
      c = generateChunk(cx, cy, seed);
      cache.set(k, c);
    }
    return c;
  }

  function local(wx, wy) {
    const cx = Math.floor(wx / CHUNK);
    const cy = Math.floor(wy / CHUNK);
    const lx = ((wx % CHUNK) + CHUNK) % CHUNK;
    const ly = ((wy % CHUNK) + CHUNK) % CHUNK;
    return { cx: cx, cy: cy, lx: lx, ly: ly };
  }

  function getTile(wx, wy, seed) {
    const p = local(wx, wy);
    return getChunk(p.cx, p.cy, seed).tiles[p.ly * CHUNK + p.lx];
  }

  function getDecor(wx, wy, seed) {
    const p = local(wx, wy);
    return getChunk(p.cx, p.cy, seed).decor[p.ly * CHUNK + p.lx];
  }

  function setDecor(wx, wy, seed, val) {
    const p = local(wx, wy);
    getChunk(p.cx, p.cy, seed).decor[p.ly * CHUNK + p.lx] = val;
  }

  window.Chunks = {
    TILE: TILE,
    CHUNK: CHUNK,
    biomeAt: biomeAt,
    getChunk: getChunk,
    getTile: getTile,
    getDecor: getDecor,
    setDecor: setDecor
  };
})();
