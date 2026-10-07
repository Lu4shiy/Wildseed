// js/sprites.js
// PNG-загрузчик + items + заяц (4×4) + red-tint + процедурный respawn_block.
(function () {
  'use strict';

  const TILE_W = 32, TILE_H = 16;
  const PCW = 24, PCH = 32;
  const RCW = 18, RCH = 16;
  const ASSETS = 'js/assets/';
  const WHITE = 245;
  const DIR_ROW = [0, 1, 2, 3];

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Failed to load ' + src));
      img.src = src;
    });
  }
  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').imageSmoothingEnabled = false;
    return c;
  }
  function toCanvas(img) {
    const c = newCanvas(img.width, img.height);
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }
  function keyWhite(c) {
    const cx = c.getContext('2d');
    const id = cx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > WHITE && d[i + 1] > WHITE && d[i + 2] > WHITE) d[i + 3] = 0;
    }
    cx.putImageData(id, 0, 0);
  }
  function contentBounds(c) {
    const cx = c.getContext('2d');
    const id = cx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (y < y0) y0 = y;
        if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return { x: 0, y: 0, w: c.width, h: c.height };
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function crop(c, b) {
    const o = newCanvas(b.w, b.h);
    o.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return o;
  }
  function resize(src, w, h) {
    const o = newCanvas(w, h);
    o.getContext('2d').drawImage(src, 0, 0, w, h);
    return o;
  }
  function processOne(img, w, h) {
    const base = toCanvas(img);
    keyWhite(base);
    return resize(crop(base, contentBounds(base)), w, h);
  }
  function processSheet(img, cols, rows, outW, outH) {
    const base = toCanvas(img);
    keyWhite(base);
    const cw = Math.floor(base.width / cols);
    const ch = Math.floor(base.height / rows);
    const out = newCanvas(outW * cols, outH * rows);
    const ocx = out.getContext('2d');
    ocx.imageSmoothingEnabled = false;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = newCanvas(cw, ch);
      cell.getContext('2d').drawImage(base, c * cw, r * ch, cw, ch, 0, 0, cw, ch);
      const b = contentBounds(cell);
      const sc = Math.min(outW / b.w, outH / b.h);
      const dw = Math.max(1, Math.round(b.w * sc));
      const dh = Math.max(1, Math.round(b.h * sc));
      const dx = c * outW + Math.floor((outW - dw) / 2);
      const dy = r * outH + (outH - dh);
      ocx.drawImage(cell, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
    }
    return out;
  }
  function tintRed(src) {
    const c = newCanvas(src.width, src.height);
    const cx = c.getContext('2d');
    cx.drawImage(src, 0, 0);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = 'rgba(255,40,40,0.55)';
    cx.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function solidDiamond(color) {
    const c = newCanvas(TILE_W, TILE_H);
    const cx = c.getContext('2d');
    cx.fillStyle = color;
    cx.beginPath();
    cx.moveTo(TILE_W / 2, 0); cx.lineTo(TILE_W, TILE_H / 2);
    cx.lineTo(TILE_W / 2, TILE_H); cx.lineTo(0, TILE_H / 2);
    cx.closePath(); cx.fill();
    return c;
  }
  function makeSquareTile(color) {
    const c = newCanvas(32, 32);
    const cx = c.getContext('2d');
    cx.fillStyle = color;
    cx.fillRect(0, 0, 32, 32);
    // лёгкий шум, чтобы не было плоско
    let seed = 1;
    for (let i = 0; i < 80; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const x = seed % 32;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const y = seed % 32;
      cx.fillStyle = 'rgba(0,0,0,0.06)';
      cx.fillRect(x, y, 1, 1);
    }
    return c;
  }
  function fillEllipse(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  function fillCircle(ctx, cx, cy, r, color) { fillEllipse(ctx, cx, cy, r, r, color); }

  function makeRabbitSheet() {
    const CW = RCW, CH = RCH;
    const c = newCanvas(CW * 4, CH * 4);
    const ctx = c.getContext('2d');
    for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 4; f++) {
      const ox = f * CW, oy = dir * CH;
      const hop = (f === 1 || f === 3) ? -1 : 0;
      fillEllipse(ctx, ox + 9, oy + 11 + hop, 5, 3, '#a87850');
      const hx = dir === 2 ? ox + 4 : dir === 3 ? ox + 14 : ox + 9;
      fillEllipse(ctx, hx, oy + 9 + hop, 3, 3, '#b88860');
      ctx.fillStyle = '#8a5c3a';
      if (dir === 2) {
        ctx.fillRect(ox + 3, oy + 4 + hop, 1, 5);
        ctx.fillRect(ox + 5, oy + 4 + hop, 1, 5);
      } else if (dir === 3) {
        ctx.fillRect(ox + 12, oy + 4 + hop, 1, 5);
        ctx.fillRect(ox + 14, oy + 4 + hop, 1, 5);
      } else {
        ctx.fillRect(ox + 8,  oy + 4 + hop, 1, 5);
        ctx.fillRect(ox + 10, oy + 4 + hop, 1, 5);
      }
      if (dir !== 0) {
        ctx.fillStyle = '#000';
        const ex = dir === 2 ? ox + 4 : dir === 3 ? ox + 13 : ox + 8;
        ctx.fillRect(ex, oy + 9 + hop, 1, 1);
      }
      const tx = dir === 2 ? ox + 14 : ox + 4;
      fillCircle(ctx, tx, oy + 11 + hop, 2, '#f4f0e8');
    }
    return c;
  }

  // Процедурный спрайт блока возрождения (20×24).
  function makeRespawnBlock() {
    const c = newCanvas(20, 24);
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;

    // тень/основание
    cx.fillStyle = '#2a1a10';
    cx.fillRect(2, 19, 16, 4);

    // корпус
    cx.fillStyle = '#4a3220';
    cx.fillRect(3, 8, 14, 12);

    // верхний борт
    cx.fillStyle = '#6a4830';
    cx.fillRect(2, 6, 16, 3);

    // внутренняя ниша
    cx.fillStyle = '#a07040';
    cx.fillRect(6, 11, 8, 7);

    // свечение
    cx.fillStyle = '#ffd060';
    cx.fillRect(7, 12, 6, 5);
    cx.fillStyle = '#fff4c0';
    cx.fillRect(9, 14, 2, 2);

    // контур корпуса
    cx.strokeStyle = 'rgba(0,0,0,0.65)';
    cx.lineWidth = 1;
    cx.strokeRect(3.5, 8.5, 13, 11);

    // тонкая золотая окантовка (намёк на функцию)
    cx.fillStyle = 'rgba(255,215,80,0.55)';
    cx.fillRect(6, 10, 8, 1);

    return c;
  }

  const Sprites = {
    TILE_W, TILE_H,
    playerCellW: PCW, playerCellH: PCH,
    playerCols: 4, playerRows: 4,
    rabbitCellW: RCW, rabbitCellH: RCH,
    tiles: {}, decor: {}, items: {},
    playerSheet: null, rabbit: null, rabbitTint: null,
    ready: false, loaded: 0, total: 0,

    init: function () {
      if (this._started) return;
      this._started = true;

      this.tiles.grass = solidDiamond('#4a8a3a');
      this.tiles.sand  = solidDiamond('#d8c070');
      this.tiles.water = solidDiamond('#2a5ab0');
      this.tiles.stone = solidDiamond('#6a6a72');
      this.tiles.snow  = solidDiamond('#e8eef4');

      // Квадратные тайлы для вида сверху.
      this.tilesSquare = {
        grass: makeSquareTile('#4a8a3a'),
        sand:  makeSquareTile('#d8c070'),
        water: makeSquareTile('#2a5ab0'),
        stone: makeSquareTile('#6a6a72'),
        snow:  makeSquareTile('#e8eef4')
      };

      const e = newCanvas(1, 1);
      this.decor.oak_tree   = e;
      this.decor.oak_log    = e;
      this.decor.bush       = e;
      this.decor.rock       = e;
      this.decor.golden_ore = e;
      this.decor.flower     = e;
      this.items.raw_rabbit_meat = e;
      this.items.rabbit_skin     = e;
      this.items.oak_log         = e;

      // Процедурный блок возрождения — сразу готов.
      const rb = makeRespawnBlock();
      this.decor.respawn_block = rb;
      this.items.respawn_block = rb;

      this._loadAll();
    },

    _loadAll: function () {
      const self = this;
      const jobs = [
        ['tile_grass',  32, 16, c => self.tiles.grass = c],
        ['tile_sand',   32, 16, c => self.tiles.sand  = c],
        ['tile_water',  32, 16, c => self.tiles.water = c],
        ['tile_stone',  32, 16, c => self.tiles.stone = c],
        ['tile_snow',   32, 16, c => self.tiles.snow  = c],
        ['oak_tree',    40, 52, c => self.decor.oak_tree   = c],
        ['bush',        28, 24, c => self.decor.bush       = c],
        ['rock',        26, 20, c => self.decor.rock       = c],
        ['golden_ore',  26, 20, c => self.decor.golden_ore = c],
        ['flower',      14, 18, c => self.decor.flower     = c],
        ['raw_rabbit_meat', 16, 16, c => self.items.raw_rabbit_meat = c],
        ['rabbit_skin',     16, 16, c => self.items.rabbit_skin     = c],
        ['oak_log',         16, 16, c => { self.items.oak_log = c; self.decor.oak_log = c; }]
      ];
      self.total = jobs.length + 2;
      self.loaded = 0;

      const promises = jobs.map(j =>
        loadImage(ASSETS + j[0] + '.png')
          .then(img => { j[3](processOne(img, j[1], j[2])); self.loaded++; })
          .catch(err => { console.warn('[sprites]', err.message); self.loaded++; })
      );

      promises.push(
        loadImage(ASSETS + 'player.png')
          .then(img => { self.playerSheet = processSheet(img, 4, 4, PCW, PCH); self.loaded++; })
          .catch(err => { console.warn('[sprites]', err.message); self.loaded++; })
      );

      promises.push(
        loadImage(ASSETS + 'rabbit.png')
          .then(img => {
            const canvas = processSheet(img, 4, 4, RCW, RCH);
            self.rabbit = { canvas, cellW: RCW, cellH: RCH, cols: 4, rows: 4 };
            self.rabbitTint = tintRed(canvas);
            self.loaded++;
          })
          .catch(() => {
            const canvas = makeRabbitSheet();
            self.rabbit = { canvas, cellW: RCW, cellH: RCH, cols: 4, rows: 4 };
            self.rabbitTint = tintRed(canvas);
            self.loaded++;
          })
      );

      Promise.all(promises).then(() => {
        self.ready = true;
        console.log('[sprites] all assets loaded');
      });
    },

    getTileSquare: name => (Sprites.tilesSquare && Sprites.tilesSquare[name]) || (Sprites.tilesSquare && Sprites.tilesSquare.grass),
    getDecor: name => Sprites.decor[name] || null,
    getIcon: function (name) {
      if (!name) return null;
      if (this.items[name] && this.items[name].width > 1) return this.items[name];
      return this.decor[name] || null;
    },

    drawPlayer: function (ctx, x, y, dir, frame) {
      if (!this.playerSheet) return;
      const sx = (frame & 3) * PCW;
      const sy = (DIR_ROW[dir & 3]) * PCH;
      ctx.drawImage(this.playerSheet, sx, sy, PCW, PCH,
                    Math.round(x), Math.round(y), PCW, PCH);
    },
    drawRabbit: function (ctx, x, y, dir, frame, tint) {
      if (!this.rabbit) return;
      const r = this.rabbit;
      const sheet = tint && this.rabbitTint ? this.rabbitTint : r.canvas;
      const sx = (frame & 3) * r.cellW;
      const sy = (DIR_ROW[dir & 3]) * r.cellH;
      ctx.drawImage(sheet, sx, sy, r.cellW, r.cellH,
                    Math.round(x), Math.round(y), r.cellW, r.cellH);
    }
  };

  window.Sprites = Sprites;
})();
