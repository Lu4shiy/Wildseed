// ===== Система чанков. Мир = набор чанков 16×16 тайлов =====

const TILE = 16;         // размер тайла в пикселях
const CHUNK = 16;        // размер чанка в тайлах
const CHUNK_PX = TILE * CHUNK;

// Типы тайлов
const T_WATER = 0, T_SAND = 1, T_GRASS = 2, T_STONE = 3, T_SNOW = 4;

const TILE_COLORS = [
  '#3b7dd8', // water
  '#e8d18e', // sand
  '#5ba244', // grass
  '#8a8a8a', // stone
  '#f0f0f0', // snow
];

const TILE_SOLID = [true, false, false, false, false]; // пока только вода непроходима

class World {
  /**
   * @param {string} seedStr  строка сида
   * @param {number} sizeTiles  0 = бесконечный; иначе размер стороны в тайлах
   */
  constructor(seedStr, sizeTiles) {
    this.seed = seedStr;
    this.sizeTiles = sizeTiles; // 0 = бесконечный
    const seed = strToSeed(seedStr);
    this.noise = makeNoise2D(seed);
    this.chunks = new Map();    // key "cx,cy" → Uint8Array(256)
  }

  key(cx, cy) { return cx + ',' + cy; }

  // Сгенерировать чанк, если ещё не сгенерирован
  ensureChunk(cx, cy) {
    // Для конечного мира — проверяем границы
    if (this.sizeTiles > 0) {
      const maxC = Math.ceil(this.sizeTiles / CHUNK);
      if (cx < 0 || cy < 0 || cx >= maxC || cy >= maxC) return null;
    }
    const k = this.key(cx, cy);
    let c = this.chunks.get(k);
    if (c) return c;

    c = new Uint8Array(CHUNK * CHUNK);
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const wx = cx * CHUNK + tx;
        const wy = cy * CHUNK + ty;
        const e = fbm(this.noise, wx / 48, wy / 48, 4, 0.5);
        let t;
        if (e < 0.38) t = T_WATER;
        else if (e < 0.45) t = T_SAND;
        else if (e < 0.72) t = T_GRASS;
        else if (e < 0.85) t = T_STONE;
        else t = T_SNOW;
        c[ty * CHUNK + tx] = t;
      }
    }
    this.chunks.set(k, c);
    return c;
  }

  // Получить тип тайла по мировым координатам тайла
  getTile(tx, ty) {
    if (this.sizeTiles > 0) {
      if (tx < 0 || ty < 0 || tx >= this.sizeTiles || ty >= this.sizeTiles) return -1;
    }
    const cx = Math.floor(tx / CHUNK);
    const cy = Math.floor(ty / CHUNK);
    const c = this.ensureChunk(cx, cy);
    if (!c) return -1;
    const lx = ((tx % CHUNK) + CHUNK) % CHUNK;
    const ly = ((ty % CHUNK) + CHUNK) % CHUNK;
    return c[ly * CHUNK + lx];
  }

  // Солиден ли тайл в пиксельных мировых координатах?
  isSolidAtPixel(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    const t = this.getTile(tx, ty);
    if (t === -1) return true; // за границей мира — стена
    return TILE_SOLID[t];
  }

  // Ближайший свободный тайл от центра (для спавна)
  findSpawn() {
    const cx = this.sizeTiles > 0 ? this.sizeTiles >> 1 : 0;
    const cy = this.sizeTiles > 0 ? this.sizeTiles >> 1 : 0;
    for (let r = 0; r < 200; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = cx + dx, ty = cy + dy;
          const t = this.getTile(tx, ty);
          if (t !== -1 && !TILE_SOLID[t]) {
            return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
          }
        }
      }
    }
    return { x: TILE / 2, y: TILE / 2 };
  }
}