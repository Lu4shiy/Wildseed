// js/sprites.js
// Изометрия. Тайл 32×16, проекция 2:1. Всё рисуется программно.
// API: window.Sprites с TILE_W, TILE_H, getTile, getDecor, drawPlayer.
(function () {
  'use strict';

  const TILE_W = 32;
  const TILE_H = 16;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
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

  function fillEllipse(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
          ctx.fillRect(cx + x, cy + y, 1, 1);
        }
      }
    }
  }

  function fillCircle(ctx, cx, cy, r, color) {
    fillEllipse(ctx, cx, cy, r, r, color);
  }

  // Мягкая тень-эллипс под декором
  function castShadow(ctx, cx, cy, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
          ctx.fillRect(cx + x, cy + y, 1, 1);
        }
      }
    }
  }

  // ---------- ромбовидный тайл 32×16 ----------
  function makeIsoTile(colors, seed) {
    const c = makeCanvas(TILE_W, TILE_H);
    const ctx = c.getContext('2d');
    for (let y = 0; y < TILE_H; y++) {
      for (let x = 0; x < TILE_W; x++) {
        const dx = Math.abs(x - 16) / 16;
        const dy = Math.abs(y - 8) / 8;
        if (dx + dy <= 1.0) {
          const r = hash(x, y, seed);
          let col = colors[0];
          if (r > 0.62)      col = colors[1];
          else if (r < 0.18) col = colors[2];
          else if (r > 0.88) col = colors[3] || colors[1];
          ctx.fillStyle = col;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return c;
  }

  // ---------- декор ----------
  function makeTree() {
    const W = 40, H = 52;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    castShadow(ctx, 20, 49, 11, 3);
    // ствол
    ctx.fillStyle = '#3d2716';
    ctx.fillRect(18, 30, 5, 19);
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(21, 30, 2, 19);
    ctx.fillStyle = '#2a1810';
    ctx.fillRect(18, 30, 1, 19);
    // крона: несколько слоёв эллипсов
    fillEllipse(ctx, 20, 20, 17, 13, '#1c3d1c');
    fillEllipse(ctx, 20, 17, 15, 11, '#2d5a2d');
    fillEllipse(ctx, 20, 14, 12, 9,  '#3d7a3d');
    fillEllipse(ctx, 18, 11, 8,  6,  '#4e9a4e');
    fillEllipse(ctx, 16, 9,  4,  3,  '#6ab86a');
    // подсветка
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let y = 0; y < 12; y++) for (let x = 6; x < 20; x++) {
      const dx = (x - 14) / 10, dy = (y - 6) / 8;
      if (dx * dx + dy * dy <= 1 && hash(x, y, 7) < 0.35) ctx.fillRect(x, y, 1, 1);
    }
    return c;
  }

  function makeBush() {
    const W = 28, H = 24;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    castShadow(ctx, 14, 21, 9, 2);
    fillEllipse(ctx, 14, 15, 11, 8, '#1c3d1c');
    fillEllipse(ctx, 14, 13, 9,  7, '#2d5a2d');
    fillEllipse(ctx, 12, 11, 6,  5, '#3d7a3d');
    fillEllipse(ctx, 11, 9,  3,  3, '#5aa85a');
    // ягоды
    ctx.fillStyle = '#c03838';
    ctx.fillRect(8,  12, 2, 2);
    ctx.fillRect(16, 13, 2, 2);
    ctx.fillRect(12, 8,  2, 2);
    ctx.fillStyle = '#e85858';
    ctx.fillRect(8,  12, 1, 1);
    ctx.fillRect(16, 13, 1, 1);
    return c;
  }

  function makeRock() {
    const W = 26, H = 20;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    castShadow(ctx, 13, 17, 9, 2);
    fillEllipse(ctx, 13, 12, 10, 7, '#3a3a42');
    fillEllipse(ctx, 13, 10, 8,  6, '#5a5a62');
    fillEllipse(ctx, 11, 8,  4,  3, '#7a7a82');
    // трещины
    ctx.fillStyle = '#26262c';
    ctx.fillRect(8, 10, 3, 1);
    ctx.fillRect(15, 12, 4, 1);
    return c;
  }

  function makeOre() {
    const W = 26, H = 20;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    castShadow(ctx, 13, 17, 9, 2);
    fillEllipse(ctx, 13, 12, 10, 7, '#2e2e36');
    fillEllipse(ctx, 13, 10, 8,  6, '#4a4a54');
    // золотые вкрапления
    ctx.fillStyle = '#a06a10';
    ctx.fillRect(8, 9,  3, 3);
    ctx.fillRect(14, 11, 3, 3);
    ctx.fillRect(11, 13, 2, 2);
    ctx.fillStyle = '#d8a030';
    ctx.fillRect(8, 9,  2, 2);
    ctx.fillRect(14, 11, 2, 2);
    ctx.fillStyle = '#f8d858';
    ctx.fillRect(8, 9,  1, 1);
    ctx.fillRect(14, 11, 1, 1);
    return c;
  }

  function makeFlower() {
    const W = 14, H = 18;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    // стебель
    ctx.fillStyle = '#3d7a3d';
    ctx.fillRect(6, 9, 1, 8);
    ctx.fillRect(4, 12, 3, 1);
    ctx.fillRect(7, 14, 4, 1);
    // лепестки
    ctx.fillStyle = '#c03850';
    ctx.fillRect(4, 5, 5, 4);
    ctx.fillStyle = '#e84a5f';
    ctx.fillRect(5, 5, 3, 3);
    ctx.fillStyle = '#f8d858';
    ctx.fillRect(6, 6, 1, 1);
    return c;
  }

  // ---------- игрок: 24×32, 4 направления × 4 кадра ----------
  const PCW = 24, PCH = 32;

  function drawPlayerFrame(ctx, ox, oy, dir, frame) {
    const skin   = '#f0c098';
    const skinD  = '#d8a880';
    const hair   = '#4a3020';
    const hairL  = '#6a4830';
    const shirt  = '#3b7dd8';
    const shirtD = '#2a5aa0';
    const pants  = '#2c3e50';
    const shoes  = '#1a1a1a';
    const eye    = '#101010';

    let lo = 0;
    if (frame === 1) lo = 1;
    else if (frame === 3) lo = -1;

    // ноги
    ctx.fillStyle = pants;
    ctx.fillRect(ox + 7, oy + 24, 3, 5 + lo);
    ctx.fillRect(ox + 14, oy + 24, 3, 5 - lo);
    ctx.fillStyle = shoes;
    ctx.fillRect(ox + 7, oy + 29 + lo, 3, 2);
    ctx.fillRect(ox + 14, oy + 29 - lo, 3, 2);

    // торс
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 6, oy + 15, 12, 10);
    ctx.fillStyle = shirtD;
    ctx.fillRect(ox + 6, oy + 24, 12, 1);
    ctx.fillRect(ox + 11, oy + 15, 2, 10);

    // руки
    ctx.fillStyle = skin;
    if (frame === 1 || frame === 3) {
      ctx.fillRect(ox + 3, oy + 17, 3, 6);
      ctx.fillRect(ox + 18, oy + 17, 3, 6);
    } else {
      ctx.fillRect(ox + 4, oy + 17, 2, 6);
      ctx.fillRect(ox + 18, oy + 17, 2, 6);
    }

    // голова
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 7, oy + 4, 10, 12);

    // волосы + лицо
    ctx.fillStyle = hair;
    if (dir === 0) {
      // спина (смотрит вверх-от камеры)
      ctx.fillRect(ox + 6, oy + 3, 12, 13);
      ctx.fillStyle = hairL;
      ctx.fillRect(ox + 8, oy + 4, 3, 3);
    } else if (dir === 1) {
      // лицом к камере
      ctx.fillRect(ox + 6, oy + 3, 12, 4);
      ctx.fillRect(ox + 6, oy + 6, 1, 8);
      ctx.fillRect(ox + 17, oy + 6, 1, 8);
      ctx.fillStyle = eye;
      ctx.fillRect(ox + 9, oy + 9, 2, 2);
      ctx.fillRect(ox + 14, oy + 9, 2, 2);
      ctx.fillStyle = skinD;
      ctx.fillRect(ox + 10, oy + 13, 5, 1);
    } else if (dir === 2) {
      // налево
      ctx.fillRect(ox + 6, oy + 3, 12, 4);
      ctx.fillRect(ox + 6, oy + 3, 5, 12);
      ctx.fillStyle = eye;
      ctx.fillRect(ox + 8, oy + 9, 2, 2);
      ctx.fillStyle = hairL;
      ctx.fillRect(ox + 6, oy + 4, 2, 4);
    } else {
      // направо
      ctx.fillRect(ox + 6, oy + 3, 12, 4);
      ctx.fillRect(ox + 13, oy + 3, 5, 12);
      ctx.fillStyle = eye;
      ctx.fillRect(ox + 15, oy + 9, 2, 2);
      ctx.fillStyle = hairL;
      ctx.fillRect(ox + 16, oy + 4, 2, 4);
    }
  }

  function buildPlayerSheet() {
    const c = makeCanvas(PCW * 4, PCH * 4);
    const ctx = c.getContext('2d');
    for (let dir = 0; dir < 4; dir++) {
      for (let frame = 0; frame < 4; frame++) {
        drawPlayerFrame(ctx, frame * PCW, dir * PCH, dir, frame);
      }
    }
    return c;
  }

  // ---------- API ----------
  const Sprites = {
    TILE_W: TILE_W,
    TILE_H: TILE_H,
    playerCellW: PCW,
    playerCellH: PCH,
    tiles: {},
    decor: {},
    player: null,
    ready: false,

    init: function () {
      if (this.ready) return;

      this.tiles.grass = makeIsoTile(['#4a8a3a', '#5a9a48', '#3d7a30', '#62a852'], 1);
      this.tiles.water = makeIsoTile(['#2a5ab0', '#3a6ac0', '#1e4a9a', '#4a7ad0'], 2);
      this.tiles.sand  = makeIsoTile(['#d8c070', '#e8d080', '#c0a850', '#f0dc98'], 3);
      this.tiles.stone = makeIsoTile(['#6a6a72', '#7a7a82', '#5a5a62', '#8a8a92'], 4);
      this.tiles.snow  = makeIsoTile(['#e8eef4', '#f4f8fc', '#d0d8e0', '#ffffff'], 5);

      this.decor.tree   = makeTree();
      this.decor.bush   = makeBush();
      this.decor.rock   = makeRock();
      this.decor.ore    = makeOre();
      this.decor.flower = makeFlower();

      this.player = buildPlayerSheet();
      this.ready = true;
    },

    getTile:  function (name) { return this.tiles[name] || this.tiles.grass; },
    getDecor: function (name) { return this.decor[name] || null; },

    drawPlayer: function (ctx, x, y, dir, frame) {
      const sx = (frame & 3) * PCW;
      const sy = (dir & 3) * PCH;
      ctx.drawImage(this.player, sx, sy, PCW, PCH, Math.round(x), Math.round(y), PCW, PCH);
    }
  };

  window.Sprites = Sprites;
})();
