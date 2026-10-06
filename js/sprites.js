// js/sprites.js
// Загрузка внешних PNG из js/assets/. Белый фон → прозрачность,
// кроп по контенту, ресайз до целевого размера (nearest-neighbor).
// API: window.Sprites (TILE_W, TILE_H, getTile, getDecor, drawPlayer, ready).
(function () {
  'use strict';

  const TILE_W = 32;
  const TILE_H = 16;
  const PCW = 24, PCH = 32;
  const ASSETS = 'js/assets/';
  const WHITE = 240;   // порог "белый → прозрачный"

  // ---------- utilities ----------
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload  = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Failed to load ' + src)); };
      img.src = src;
    });
  }

  function toCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0);
    return c;
  }

  function keyWhite(canvas) {
    const cx = canvas.getContext('2d');
    const id = cx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > WHITE && d[i + 1] > WHITE && d[i + 2] > WHITE) {
        d[i + 3] = 0;
      }
    }
    cx.putImageData(id, 0, 0);
  }

  function contentBounds(canvas) {
    const cx = canvas.getContext('2d');
    const id = cx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const a = d[(y * canvas.width + x) * 4 + 3];
        if (a > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { x: 0, y: 0, w: canvas.width, h: canvas.height };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function crop(canvas, b) {
    const c = document.createElement('canvas');
    c.width = b.w; c.height = b.h;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return c;
  }

  function resize(src, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(src, 0, 0, w, h);
    return c;
  }

  function processOne(img, w, h) {
    const base = toCanvas(img);
    keyWhite(base);
    const b = contentBounds(base);
    return resize(crop(base, b), w, h);
  }

  // Солидный ромб — заглушка пока грузится PNG
  function solidDiamond(color) {
    const c = document.createElement('canvas');
    c.width = TILE_W; c.height = TILE_H;
    const cx = c.getContext('2d');
    cx.fillStyle = color;
    cx.beginPath();
    cx.moveTo(TILE_W / 2, 0);
    cx.lineTo(TILE_W,     TILE_H / 2);
    cx.lineTo(TILE_W / 2, TILE_H);
    cx.lineTo(0,          TILE_H / 2);
    cx.closePath();
    cx.fill();
    return c;
  }

  function emptyCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w || 1; c.height = h || 1;
    return c;
  }

  // ---------- public ----------
  const Sprites = {
    TILE_W: TILE_W,
    TILE_H: TILE_H,
    playerCellW: PCW,
    playerCellH: PCH,
    playerCols: 4,
    playerRows: 4,
    tiles: {},
    decor: {},
    playerSheet: null,
    ready: false,

    init: function () {
      if (this._started) return;
      this._started = true;

      // 1) Сразу ставим заглушки, чтобы рендер не падал и было видно мир.
      this.tiles.grass = solidDiamond('#4a8a3a');
      this.tiles.sand  = solidDiamond('#d8c070');
      this.tiles.water = solidDiamond('#2a5ab0');
      this.tiles.stone = solidDiamond('#6a6a72');
      this.tiles.snow  = solidDiamond('#e8eef4');

      const e = emptyCanvas(1, 1);
      this.decor.tree   = e;
      this.decor.bush   = e;
      this.decor.rock   = e;
      this.decor.ore    = e;
      this.decor.flower = e;

      // 2) Асинхронно грузим настоящие PNG.
      this._loadAll();
    },

    _loadAll: function () {
      const self = this;

      const jobs = [
        ['tile_grass', 32, 16, function (c) { self.tiles.grass = c; }],
        ['tile_sand',  32, 16, function (c) { self.tiles.sand  = c; }],
        ['tile_water', 32, 16, function (c) { self.tiles.water = c; }],
        ['tile_stone', 32, 16, function (c) { self.tiles.stone = c; }],
        ['tile_snow',  32, 16, function (c) { self.tiles.snow  = c; }],
        ['tree',       40, 52, function (c) { self.decor.tree   = c; }],
        ['bush',       28, 24, function (c) { self.decor.bush   = c; }],
        ['rock',       26, 20, function (c) { self.decor.rock   = c; }],
        ['ore',        26, 20, function (c) { self.decor.ore    = c; }],
        ['flower',     14, 18, function (c) { self.decor.flower = c; }]
      ];

      const promises = jobs.map(function (j) {
        const name = j[0], w = j[1], h = j[2], apply = j[3];
        return loadImage(ASSETS + name + '.png')
          .then(function (img) { apply(processOne(img, w, h)); })
          .catch(function (err) { console.warn('[sprites]', err.message); });
      });

      // Игрок — отдельно: там 4×4 сетка, кроп не нужен.
      promises.push(
        loadImage(ASSETS + 'player.png')
          .then(function (img) {
            const base = toCanvas(img);
            keyWhite(base);
            self.playerSheet = base;
          })
          .catch(function (err) { console.warn('[sprites]', err.message); })
      );

      Promise.all(promises).then(function () {
        self.ready = true;
        console.log('[sprites] all assets loaded');
      });
    },

    getTile:  function (name) { return this.tiles[name] || this.tiles.grass; },
    getDecor: function (name) { return this.decor[name] || null; },

    drawPlayer: function (ctx, x, y, dir, frame) {
      if (!this.playerSheet) return;
      const cw = this.playerSheet.width  / this.playerCols;
      const ch = this.playerSheet.height / this.playerRows;
      const sx = (frame & 3) * cw;
      const sy = (dir   & 3) * ch;
      ctx.drawImage(this.playerSheet,
                    sx, sy, cw, ch,
                    Math.round(x), Math.round(y), PCW, PCH);
    }
  };

  window.Sprites = Sprites;
})();
