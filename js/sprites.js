// js/sprites.js
// Все текстуры рисуются программно, без внешних файлов.
// Публичный API: window.Sprites
(function () {
  'use strict';

  const TILE = 16;

  // ---------- helpers ----------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    return c;
  }

  function hash(x, y, s) {
    let n = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  // Круг пиксель-в-пиксель (без антиалиасинга)
  function fillCircle(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    const r2 = r * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r2) ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }

  function ellipseShadow(ctx, cx, cy, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
          ctx.fillRect(cx + x, cy + y, 1, 1);
        }
      }
    }
  }

  // ---------- ground tiles ----------
  function makeGroundTile(base, variants, seed) {
    const c = makeCanvas(TILE, TILE);
    const ctx = c.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, TILE, TILE);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const r = hash(x, y, seed);
        if (r < 0.30) {
          const v = variants[(hash(x, y, seed + 17) * variants.length) | 0];
          ctx.fillStyle = v;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return c;
  }

  // ---------- decorations ----------
  function makeTree() {
    const c = makeCanvas(16, 24);
    const ctx = c.getContext('2d');
    ellipseShadow(ctx, 8, 22, 5, 2);
    // trunk
    ctx.fillStyle = '#4a2f18';
    ctx.fillRect(7, 16, 2, 7);
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(9, 16, 1, 7);
    // foliage layers
    fillCircle(ctx, 8, 11, 7, '#1e4a1e');
    fillCircle(ctx, 8,  9, 6, '#2d6a2d');
    fillCircle(ctx, 8,  7, 4, '#3d8a3d');
    fillCircle(ctx, 6,  6, 2, '#4ea84e');
    return c;
  }

  function makeBush() {
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d');
    ellipseShadow(ctx, 8, 13, 5, 2);
    fillCircle(ctx, 8, 10, 5, '#1e4a1e');
    fillCircle(ctx, 8,  9, 4, '#2d6a2d');
    fillCircle(ctx, 7,  8, 2, '#4ea84e');
    // berries
    ctx.fillStyle = '#d04040';
    ctx.fillRect(5, 9, 1, 1);
    ctx.fillRect(10, 10, 1, 1);
    ctx.fillRect(8, 7, 1, 1);
    return c;
  }

  function makeRock() {
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d');
    ellipseShadow(ctx, 8, 13, 5, 2);
    fillCircle(ctx, 8, 10, 5, '#4a4a52');
    fillCircle(ctx, 7,  9, 3, '#6a6a72');
    fillCircle(ctx, 6,  8, 1, '#8a8a92');
    return c;
  }

  function makeOre() {
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d');
    ellipseShadow(ctx, 8, 13, 5, 2);
    fillCircle(ctx, 8, 10, 5, '#3a3a42');
    fillCircle(ctx, 7,  9, 3, '#5a5a62');
    // золотые вкрапления
    ctx.fillStyle = '#d8a030';
    ctx.fillRect(6,  8, 2, 2);
    ctx.fillRect(10, 10, 1, 1);
    ctx.fillRect(8,  11, 1, 1);
    ctx.fillStyle = '#f0c050';
    ctx.fillRect(6,  8, 1, 1);
    return c;
  }

  function makeFlower() {
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d');
    // стебель
    ctx.fillStyle = '#3d8a3d';
    ctx.fillRect(8,  9, 1, 5);
    ctx.fillRect(6, 11, 3, 1);
    ctx.fillRect(9, 12, 3, 1);
    // лепестки
    ctx.fillStyle = '#e84a5f';
    ctx.fillRect(6, 6, 5, 5);
    // серединка
    ctx.fillStyle = '#f9d54f';
    ctx.fillRect(8, 8, 1, 1);
    return c;
  }

  // ---------- player sprite ----------
  // dir: 0=down, 1=up, 2=left, 3=right
  // frame: 0..3 (0 и 2 — стойка, 1/3 — шаг)
  function drawPlayerFrame(ctx, ox, oy, dir, frame) {
    const skin   = '#f0c098';
    const skinD  = '#d8a880';
    const hair   = '#4a3020';
    const shirt  = '#3b7dd8';
    const shirtD = '#2a5aa0';
    const pants  = '#2c3e50';
    const shoes  = '#1a1a1a';
    const eye    = '#101010';

    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(ox + 3, oy + 15, 10, 1);

    // походка: смещение ног
    let lo = 0;
    if (frame === 1) lo = 1;
    else if (frame === 3) lo = -1;

    // ноги
    ctx.fillStyle = pants;
    ctx.fillRect(ox + 5, oy + 12, 2, 3 + lo);
    ctx.fillRect(ox + 9, oy + 12, 2, 3 - lo);
    ctx.fillStyle = shoes;
    ctx.fillRect(ox + 5, oy + 14 + lo, 2, 1);
    ctx.fillRect(ox + 9, oy + 14 - lo, 2, 1);

    // туловище
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 4, oy + 8, 8, 5);
    ctx.fillStyle = shirtD;
    ctx.fillRect(ox + 4, oy + 12, 8, 1);

    // руки (только в шаге)
    ctx.fillStyle = skin;
    if (frame === 1 || frame === 3) {
      ctx.fillRect(ox + 3,  oy + 9, 1, 3);
      ctx.fillRect(ox + 12, oy + 9, 1, 3);
    }

    // голова
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 4, oy + 2, 8, 7);

    // волосы
    ctx.fillStyle = hair;
    if (dir === 1) {
      ctx.fillRect(ox + 4, oy + 2, 8, 7);
    } else {
      ctx.fillRect(ox + 4, oy + 2, 8, 2);
      ctx.fillRect(ox + 3, oy + 3, 1, 3);
      ctx.fillRect(ox + 12, oy + 3, 1, 3);
    }

    // глаза
    ctx.fillStyle = eye;
    if (dir === 0) {
      ctx.fillRect(ox + 6, oy + 5, 1, 1);
      ctx.fillRect(ox + 9, oy + 5, 1, 1);
    } else if (dir === 2) {
      ctx.fillRect(ox + 5, oy + 5, 1, 1);
    } else if (dir === 3) {
      ctx.fillRect(ox + 10, oy + 5, 1, 1);
    }

    // подбородок
    ctx.fillStyle = skinD;
    ctx.fillRect(ox + 5, oy + 8, 6, 1);
  }

  function buildPlayerSheet() {
    // 4 колонки = кадры (frame 0..3), 4 ряда = направления (dir 0..3)
    const c = makeCanvas(16 * 4, 16 * 4);
    const ctx = c.getContext('2d');
    for (let dir = 0; dir < 4; dir++) {
      for (let frame = 0; frame < 4; frame++) {
        drawPlayerFrame(ctx, frame * 16, dir * 16, dir, frame);
      }
    }
    return c;
  }

  // ---------- public object ----------
  const Sprites = {
    TILE: TILE,
    tiles: {},
    decor: {},
    player: null,
    ready: false,

    init: function () {
      if (this.ready) return;

      this.tiles.grass = makeGroundTile('#4a8a3a', ['#3d7a30', '#5a9a48', '#3a7028'], 1);
      this.tiles.water = makeGroundTile('#2a5ab0', ['#1e4a9a', '#3a6ac0', '#2a5ab0'], 2);
      this.tiles.sand  = makeGroundTile('#d8c070', ['#c8b060', '#e8d080', '#c0a850'], 3);
      this.tiles.stone = makeGroundTile('#6a6a72', ['#5a5a62', '#7a7a82', '#4a4a52'], 4);
      this.tiles.snow  = makeGroundTile('#e8eef4', ['#d8dee4', '#f4f8fc', '#c8ced4'], 5);

      this.decor.tree   = makeTree();
      this.decor.bush   = makeBush();
      this.decor.rock   = makeRock();
      this.decor.ore    = makeOre();
      this.decor.flower = makeFlower();

      this.player = buildPlayerSheet();
      this.ready = true;
    },

    getTile: function (name) {
      return this.tiles[name] || this.tiles.grass;
    },

    getDecor: function (name) {
      return this.decor[name] || null;
    },

    // Рисует игрока. (x,y) — верхний левый угол кадра 16×16.
    drawPlayer: function (ctx, x, y, dir, frame) {
      const sx = (frame & 3) * 16;
      const sy = (dir & 3) * 16;
      ctx.drawImage(this.player, sx, sy, 16, 16, Math.round(x), Math.round(y), 16, 16);
    }
  };

  window.Sprites = Sprites;
})();
