// js/sprites.js
// PNG-загрузчик + процедурный заяц (2×4 layout, как у игрока).
(function () {
  'use strict';

  const TILE_W = 32, TILE_H = 16;
  const PCW = 24, PCH = 32;
  const ASSETS = 'js/assets/';
  const WHITE = 245;
  const DIR_ROW = [0, 1, 2, 3];

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load ' + src));
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
  function keyWhite(canvas) {
    const cx = canvas.getContext('2d');
    const id = cx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > WHITE && d[i + 1] > WHITE && d[i + 2] > WHITE) d[i + 3] = 0;
    }
    cx.putImageData(id, 0, 0);
  }
  function contentBounds(canvas) {
    const cx = canvas.getContext('2d');
    const id = cx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (d[(y * canvas.width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return { x: 0, y: 0, w: canvas.width, h: canvas.height };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  function crop(canvas, b) {
    const c = newCanvas(b.w, b.h);
    c.getContext('2d').drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return c;
  }
  function resize(src, w, h) {
    const c = newCanvas(w, h);
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c;
  }
  function processOne(img, w, h) {
    const base = toCanvas(img);
    keyWhite(base);
    return resize(crop(base, contentBounds(base)), w, h);
  }
  function processPlayerSheet(img) {
    const base = toCanvas(img); keyWhite(base);
    const cellW = Math.floor(base.width / 4), cellH = Math.floor(base.height / 4);
    const out = newCanvas(PCW * 4, PCH * 4);
    const ocx = out.getContext('2d'); ocx.imageSmoothingEnabled = false;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const cell = newCanvas(cellW, cellH);
      cell.getContext('2d').drawImage(base, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
      const b = contentBounds(cell);
      const sc = Math.min(PCW / b.w, PCH / b.h);
      const dw = Math.max(1, Math.round(b.w * sc));
      const dh = Math.max(1, Math.round(b.h * sc));
      const dx = col * PCW + Math.floor((PCW - dw) / 2);
      const dy = row * PCH + (PCH - dh);
      ocx.drawImage(cell, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
    }
    return out;
  }
  // Спрайт-лист зайца (2 колонки × 4 строки): 4 строки = 4 направления,
  // 2 колонки = кадры анимации. Нормализуем любой вход под этот формат.
  function processRabbitSheet(img) {
    const base = toCanvas(img); keyWhite(base);
    const cols = 2, rows = 4;
    const cellW = Math.floor(base.width / cols);
    const cellH = Math.floor(base.height / rows);
    const outW = 18, outH = 14;
    const out = newCanvas(outW * cols, outH * rows);
    const ocx = out.getContext('2d'); ocx.imageSmoothingEnabled = false;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = newCanvas(cellW, cellH);
      cell.getContext('2d').drawImage(base, c * cellW, r * cellH, cellW, cellH, 0, 0, cellW, cellH);
      const b = contentBounds(cell);
      const sc = Math.min(outW / b.w, outH / b.h);
      const dw = Math.max(1, Math.round(b.w * sc));
      const dh = Math.max(1, Math.round(b.h * sc));
      const dx = c * outW + Math.floor((outW - dw) / 2);
      const dy = r * outH + (outH - dh);
      ocx.drawImage(cell, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
    }
    return { canvas: out, cellW: outW, cellH: outH, cols, rows };
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
  function fillEllipse(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  function fillCircle(ctx, cx, cy, r, color) { fillEllipse(ctx, cx, cy, r, r, color); }

  // Процедурный заяц, 2 колонки × 4 строки. dir: 0=вверх 1=вниз 2=влево 3=вправо.
  function makeRabbitSheet() {
    const CW = 18, CH = 14;
    const c = newCanvas(CW * 2, CH * 4);
    const ctx = c.getContext('2d');
    for (let dir = 0; dir < 4; dir++) {
      for (let f = 0; f < 2; f++) {
        const ox = f * CW;
        const oy = dir * CH;
        const hop = f === 1 ? -1 : 0;

        // тело
        fillEllipse(ctx, ox + 9, oy + 9 + hop, 5, 3, '#a87850');
        // голова
        const hx = dir === 2 ? ox + 4 : dir === 3 ? ox + 14 : ox + 9;
        fillEllipse(ctx, hx, oy + 7 + hop, 3, 3, '#b88860');
        // уши
        ctx.fillStyle = '#8a5c3a';
        if (dir === 2) {
          ctx.fillRect(ox + 3, oy + 2 + hop, 1, 5);
          ctx.fillRect(ox + 5, oy + 2 + hop, 1, 5);
        } else if (dir === 3) {
          ctx.fillRect(ox + 12, oy + 2 + hop, 1, 5);
          ctx.fillRect(ox + 14, oy + 2 + hop, 1, 5);
        } else {
          ctx.fillRect(ox + 8,  oy + 2 + hop, 1, 5);
          ctx.fillRect(ox + 10, oy + 2 + hop, 1, 5);
        }
        // глаз
        if (dir !== 0) {
          ctx.fillStyle = '#000';
          const ex = dir === 2 ? ox + 4 : dir === 3 ? ox + 13 : ox + 8;
          ctx.fillRect(ex, oy + 7 + hop, 1, 1);
        }
        // хвост
        const tx = dir === 2 ? ox + 14 : ox + 4;
        fillCircle(ctx, tx, oy + 9 + hop, 2, '#f4f0e8');
      }
    }
    return { canvas: c, cellW: CW, cellH: CH, cols: 2, rows: 4 };
  }

  const Sprites = {
    TILE_W, TILE_H,
    playerCellW: PCW, playerCellH: PCH,
    playerCols: 4, playerRows: 4,
    tiles: {}, decor: {}, playerSheet: null,
    rabbit: null, rabbitCellW: 18, rabbitCellH: 14,
    ready: false, loaded: 0, total: 0,

    init: function () {
      if (this._started) return;
      this._started = true;

      this.tiles.grass = solidDiamond('#4a8a3a');
      this.tiles.sand  = solidDiamond('#d8c070');
      this.tiles.water = solidDiamond('#2a5ab0');
      this.tiles.stone = solidDiamond('#6a6a72');
      this.tiles.snow  = solidDiamond('#e8eef4');

      const e = newCanvas(1, 1);
      this.decor.tree       = e;
      this.decor.bush       = e;
      this.decor.rock       = e;
      this.decor.golden_ore = e;
      this.decor.flower     = e;

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
        ['tree',        40, 52, c => self.decor.tree       = c],
        ['bush',        28, 24, c => self.decor.bush       = c],
        ['rock',        26, 20, c => self.decor.rock       = c],
        ['golden_ore',  26, 20, c => self.decor.golden_ore = c],
        ['flower',      14, 18, c => self.decor.flower     = c]
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
          .then(img => { self.playerSheet = processPlayerSheet(img); self.loaded++; })
          .catch(err => { console.warn('[sprites]', err.message); self.loaded++; })
      );

      promises.push(
        loadImage(ASSETS + 'rabbit.png')
          .then(img => {
            const r = processRabbitSheet(img);
            self.rabbit = r;
            self.rabbitCellW = r.cellW;
            self.rabbitCellH = r.cellH;
            self.loaded++;
          })
          .catch(() => {
            const r = makeRabbitSheet();
            self.rabbit = r;
            self.rabbitCellW = r.cellW;
            self.rabbitCellH = r.cellH;
            self.loaded++;
          })
      );

      Promise.all(promises).then(() => {
        self.ready = true;
        console.log('[sprites] all assets loaded');
      });
    },

    getTile:  name => Sprites.tiles[name] || Sprites.tiles.grass,
    getDecor: name => Sprites.decor[name] || null,

    drawPlayer: function (ctx, x, y, dir, frame) {
      if (!this.playerSheet) return;
      const sx = (frame & 3) * PCW;
      const sy = (DIR_ROW[dir & 3]) * PCH;
      ctx.drawImage(this.playerSheet, sx, sy, PCW, PCH,
                    Math.round(x), Math.round(y), PCW, PCH);
    },

    drawRabbit: function (ctx, x, y, dir, frame) {
      if (!this.rabbit) return;
      const r = this.rabbit;
      // 2 колонки × 4 строки: X = frame, Y = dir
      const sx = (frame & 1) * r.cellW;
      const sy = (dir & 3) * r.cellH;
      ctx.drawImage(r.canvas, sx, sy, r.cellW, r.cellH,
                    Math.round(x), Math.round(y), r.cellW, r.cellH);
    }
  };

  window.Sprites = Sprites;
})();
