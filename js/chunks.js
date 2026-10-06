// js/chunks.js
// Чанки 16×16 + overlay изменений (срубленные деревья и т. д.) для сохранения.
(function () {
  'use strict';

  const TILE = 16;
  const CHUNK = 16;

  const cache = new Map();
  const modified = {}; // "wx,wy" → decor | null

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
    if (r >= 0.05) return null;
    const t = RNG.rand2(wx, wy, seed + 1234);
    if (t < 0.45) return { type: 'tree',       hp: 5, maxHp: 5 };
    if (t < 0.65) return { type: 'bush',       hp: 3, maxHp: 3 };
    if (t < 0.85) return { type: 'rock',       hp: 6, maxHp: 6 };
    if (t < 0.97) return { type: 'flower',     hp: 1, maxHp: 1 };
    return { type: 'golden_ore', hp: 8, maxHp: 8 };
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
    return { cx, cy, tiles, decor };
  }

  function applyMods(c) {
    const bx = c.cx * CHUNK, by = c.cy * CHUNK;
    for (const k in modified) {
      const i = k.indexOf(',');
      const wx = +k.slice(0, i);
      const wy = +k.slice(i + 1);
      if (wx >= bx && wx < bx + CHUNK && wy >= by && wy < by + CHUNK) {
        const lx = wx - bx, ly = wy - by;
        c.decor[ly * CHUNK + lx] = modified[k];
      }
    }
  }

  function getChunk(cx, cy, seed) {
    const k = key(cx, cy);
    let c = cache.get(k);
    if (!c) {
      c = generateChunk(cx, cy, seed);
      applyMods(c);
      cache.set(k, c);
    }
    return c;
  }

  function local(wx, wy) {
    const cx = Math.floor(wx / CHUNK);
    const cy = Math.floor(wy / CHUNK);
    const lx = ((wx % CHUNK) + CHUNK) % CHUNK;
    const ly = ((wy % CHUNK) + CHUNK) % CHUNK;
    return { cx, cy, lx, ly };
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
    modified[wx + ',' + wy] = val;
  }

  function getModified() { return Object.assign({}, modified); }

  function setModified(m) {
    for (const k in modified) delete modified[k];
    cache.clear();
    if (m) for (const k in m) modified[k] = m[k];
  }

  window.Chunks = {
    TILE, CHUNK,
    biomeAt, getChunk, getTile, getDecor, setDecor,
    getModified, setModified
  };
})();
