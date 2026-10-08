// js/chunks.js
// Чанки 16×16 + overlay изменений + стриминг (unload далёких чанков).
// + Биомы-регионы (regionAt) + plains + структуры (палатки поселенцев).
(function () {
  'use strict';

  const TILE = 16;
  const CHUNK = 16;
  const STREAM_KEEP = 8; // чанков (8 × 16 = 128 тайлов) — держим вокруг игрока

  const cache = new Map();
  const modified = {};

  function key(cx, cy) { return cx + ',' + cy; }

  // ---------- Биом-регион (большая область) ----------
  function regionAt(wx, wy, seed) {
    // Пока весь мир — plains. Точка расширения.
    // Будущий второй слой шума (закомментировано):
    //
    //   const n = RNG.fbm(wx * 0.003, wy * 0.003, seed + 3333, 3);
    //   if (n < 0.30) return 'tundra';
    //   if (n < 0.50) return 'forest';
    //   if (n < 0.65) return 'mountains';
    //   if (n < 0.80) return 'desert';
    //   return 'plains';
    return 'plains';
  }

  // ---------- Тайл (что рисуется) ----------
  function biomeAt(wx, wy, seed) {
    const n = RNG.fbm(wx * 0.02, wy * 0.02, seed, 4);
    const m = RNG.fbm(wx * 0.01 + 100, wy * 0.01 + 100, seed + 7, 3);
    if (n < 0.32) return 'water';
    if (n < 0.36) return 'sand';
    if (m > 0.72) return 'stone';
    if (m < 0.15) return 'snow';
    return 'grass';
  }
  function tileForRegion(wx, wy, seed, region) {
    if (region === 'plains') return 'grass';
    return biomeAt(wx, wy, seed);
  }

  // ---------- Декор по биому ----------
  function decorateAt(wx, wy, seed, tile, region) {
    if (region === 'plains') {
      if (tile !== 'grass') return null;
      const r = RNG.rand2(wx, wy, seed + 999);
      if (r >= 0.02) return null;                 // 2% плотности
      const t = RNG.rand2(wx, wy, seed + 1234);
      if (t < 0.55) return { type: 'flower',   hp: 1, maxHp: 1 };
      if (t < 0.80) return { type: 'bush',     hp: 3, maxHp: 3 };
      if (t < 0.94) return { type: 'oak_tree', hp: 5, maxHp: 5 };
      return          { type: 'rock',     hp: 6, maxHp: 6 };
    }
    // Legacy (для будущих не-plains биомов).
    if (tile === 'water' || tile === 'stone') return null;
    const r = RNG.rand2(wx, wy, seed + 999);
    if (r >= 0.05) return null;
    const t = RNG.rand2(wx, wy, seed + 1234);
    if (t < 0.45) return { type: 'oak_tree',   hp: 5, maxHp: 5 };
    if (t < 0.65) return { type: 'bush',       hp: 3, maxHp: 3 };
    if (t < 0.85) return { type: 'rock',       hp: 6, maxHp: 6 };
    if (t < 0.97) return { type: 'flower',     hp: 1, maxHp: 1 };
    return { type: 'golden_ore', hp: 8, maxHp: 8 };
  }

  // ---------- Структуры: палатки поселенцев ----------
  // Сетка 20×20 тайлов на «слот структуры». Сама структура — 10×10.
  // Offset 0..10 внутри слота → две соседние структуры никогда не пересекаются.
  // Для тайла (wx, wy) достаточно проверить ОДИН слот: floor(wx / 20), floor(wy / 20).
  const STRUCT_CELL = 256;
  const STRUCT_CELL = 48;
  const STRUCT_SIZE = 10;
  const STRUCT_BUFFER = 20;   // мин. зазор между поселениями из соседних cells

  // Раскладка (относительно верхнего-левого угла 10×10):
  //
  //   row 0:  . . T . . . . T . .
  //   row 1:  . . . . . . . . . .
  //   row 2:  . . . . F . . . . .
  //   row 3:  . C . . F . . C . .
  //   row 4:  . . . . F . . . . .
  //   row 5:  . . . . B . . . . .
  //
  // T — палатка (1×1 визуально, «высотой» чуть выше тайла).
  // F — костёр (3 тайла вертикально: 2,3,4).
  // C — ящик.
  // B — спальник.
  //
  // Примечание: в спеке §4.2 палатка 2×2. Здесь 1×1 — компромисс
  // под текущую архитектуру «один тайл = один декор-объект». Спрайт
  // палатки при этом на 12px выше тайла, поэтому визуально читается.
  const STRUCT_DECOR = {
    '2,0': 'tent',  '6,0': 'tent',
    '4,2': 'campfire', '4,3': 'campfire', '4,4': 'campfire',
    '1,3': 'crate', '7,3': 'crate',
    '4,5': 'bedroll'
  };
  const STRUCT_HP = { tent: 4, campfire: 3, crate: 5, bedroll: 2 };

  // Информация о структуре в слоте (scx, scy). null — структуры нет.
  function structureCellInfo(scx, scy, seed) {
    const r = RNG.rand2(scx, scy, seed + 55555);
    if (r >= 0.40) return null;                          // 40% cells занято
    // Offset 0..(CELL - SIZE - BUFFER). Буфер держит два соседних
    // поселения на расстоянии минимум BUFFER+SIZE+BUFFER = 50 тайлов.
    const maxOff = STRUCT_CELL - STRUCT_SIZE - STRUCT_BUFFER;
    const ox = Math.floor(RNG.rand2(scx, scy, seed + 55556) * (maxOff + 1));
    const oy = Math.floor(RNG.rand2(scx, scy, seed + 55557) * (maxOff + 1));
    return { tx: scx * STRUCT_CELL + ox, ty: scy * STRUCT_CELL + oy };
  }

  // Возвращает тип декора структуры для тайла, либо null.
  function structureAt(wx, wy, seed) {
    const scx = Math.floor(wx / STRUCT_CELL);
    const scy = Math.floor(wy / STRUCT_CELL);
    const info = structureCellInfo(scx, scy, seed);
    if (!info) return null;
    const relX = wx - info.tx;
    const relY = wy - info.ty;
    if (relX < 0 || relX >= STRUCT_SIZE || relY < 0 || relY >= STRUCT_SIZE) return null;
    return STRUCT_DECOR[relX + ',' + relY] || null;
  }

  // ---------- Генерация чанка ----------
  function generateChunk(cx, cy, seed) {
    const tiles = new Array(CHUNK * CHUNK);
    const decor = new Array(CHUNK * CHUNK);
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const wx = cx * CHUNK + x;
        const wy = cy * CHUNK + y;
        const region = regionAt(wx, wy, seed);
        const tile   = tileForRegion(wx, wy, seed, region);
        tiles[y * CHUNK + x] = tile;

        // Приоритет: структура → биом-декор.
        const sType = structureAt(wx, wy, seed);
        if (sType) {
          const hp = STRUCT_HP[sType] || 3;
          decor[y * CHUNK + x] = { type: sType, hp, maxHp: hp };
        } else {
          decor[y * CHUNK + x] = decorateAt(wx, wy, seed, tile, region);
        }
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

  let lastCx = 999999, lastCy = 999999;
  function stream(px, py) {
    const pcx = Math.floor(px / CHUNK);
    const pcy = Math.floor(py / CHUNK);
    if (pcx === lastCx && pcy === lastCy) return 0;
    lastCx = pcx; lastCy = pcy;
    let unloaded = 0;
    for (const k of cache.keys()) {
      const i = k.indexOf(',');
      const cx = +k.slice(0, i);
      const cy = +k.slice(i + 1);
      if (Math.abs(cx - pcx) > STREAM_KEEP || Math.abs(cy - pcy) > STREAM_KEEP) {
        cache.delete(k);
        unloaded++;
      }
    }
    return unloaded;
  }

  window.Chunks = {
    TILE, CHUNK,
    biomeAt, regionAt, tileForRegion,
    structureAt,
    getChunk, getTile, getDecor, setDecor,
    getModified, setModified, stream
  };
})();