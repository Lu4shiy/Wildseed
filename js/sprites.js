// js/sprites.js
// PNG-загрузчик + top-down процедурные листы для вида сверху.
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
    // лёгкий шум
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

  // ---------- classic sheet (side view) ----------
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

  // ---------- top-down sheets ----------
  function makePlayerTopSheet() {
    const CW = PCW, CH = PCH;
    const c = newCanvas(CW * 4, CH * 4);
    const cx = c.getContext('2d');
    for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 4; f++) {
      const ox = f * CW, oy = dir * CH;
      const cx0 = ox + CW / 2;
      const bob = (f === 1 || f === 3) ? -1 : 0;
      const cy0 = oy + CH / 2 + bob;

      // Тень-подложка (мягкая)
      fillEllipse(cx, cx0, cy0 + 4, 8, 5, 'rgba(0,0,0,0.22)');

      // Плечи (синяя туника)
      fillEllipse(cx, cx0, cy0 + 1, 7, 5, '#3a6cb8');
      // Руки (кожа)
      fillEllipse(cx, cx0 - 7, cy0 + 1, 2, 3, '#e8b088');
      fillEllipse(cx, cx0 + 7, cy0 + 1, 2, 3, '#e8b088');

      // Голова
      fillCircle(cx, cx0, cy0 - 2, 5, '#e8b088');
      // Волосы — в зависимости от направления
      if (dir === 0) {
        // смотрим вверх (от зрителя) — вся голова в волосах
        fillCircle(cx, cx0, cy0 - 3, 5, '#5a3a1a');
      } else if (dir === 1) {
        // смотрим вниз (на зрителя) — чёлка сверху
        fillEllipse(cx, cx0, cy0 - 5, 5, 3, '#5a3a1a');
      } else if (dir === 2) {
        // влево — волосы справа
        fillEllipse(cx, cx0 + 2, cy0 - 3, 4, 5, '#5a3a1a');
      } else {
        // вправо — волосы слева
        fillEllipse(cx, cx0 - 2, cy0 - 3, 4, 5, '#5a3a1a');
      }

      // Глаза
      cx.fillStyle = '#000';
      if (dir === 1) {
        cx.fillRect(cx0 - 2, cy0 - 1, 1, 1);
        cx.fillRect(cx0 + 1, cy0 - 1, 1, 1);
      } else if (dir === 2) {
        cx.fillRect(cx0 - 4, cy0 - 1, 1, 1);
      } else if (dir === 3) {
        cx.fillRect(cx0 + 3, cy0 - 1, 1, 1);
      }

      // Ноги
      cx.fillStyle = '#5a3010';
      if (dir === 0) {          // смотрим вверх — ноги спереди (сверху экрана)
        cx.fillRect(cx0 - 3, cy0 - 7, 2, 3);
        cx.fillRect(cx0 + 1, cy0 - 7, 2, 3);
      } else if (dir === 1) {   // смотрим вниз — ноги снизу
        cx.fillRect(cx0 - 3, cy0 + 5, 2, 3);
        cx.fillRect(cx0 + 1, cy0 + 5, 2, 3);
      } else if (dir === 2) {   // влево
        cx.fillRect(cx0 - 6, cy0 + 3, 3, 2);
      } else {                  // вправо
        cx.fillRect(cx0 + 3, cy0 + 3, 3, 2);
      }
    }
    return c;
  }

  function makeRabbitTopSheet() {
    const CW = RCW, CH = RCH;
    const c = newCanvas(CW * 4, CH * 4);
    const cx = c.getContext('2d');
    for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 4; f++) {
      const ox = f * CW, oy = dir * CH;
      const cx0 = ox + CW / 2;
      const hop = (f === 1 || f === 3) ? -1 : 0;
      const cy0 = oy + CH / 2 + hop;

      // Тень
      fillEllipse(cx, cx0, cy0 + 3, 6, 3, 'rgba(0,0,0,0.22)');

      // Тело
      fillEllipse(cx, cx0, cy0 + 1, 6, 4, '#a87850');
      // Хвостик
      if (dir === 0) fillCircle(cx, cx0, cy0 + 5, 2, '#f4f0e8');
      else if (dir === 1) fillCircle(cx, cx0, cy0 - 3, 2, '#f4f0e8');
      else if (dir === 2) fillCircle(cx, cx0 + 5, cy0 + 1, 2, '#f4f0e8');
      else fillCircle(cx, cx0 - 5, cy0 + 1, 2, '#f4f0e8');

      // Голова
      const hx = dir === 2 ? cx0 - 5 : dir === 3 ? cx0 + 5 : cx0;
      const hy = dir === 0 ? cy0 - 3 : dir === 1 ? cy0 + 3 : cy0;
      fillCircle(cx, hx, hy, 3, '#b88860');

      // Уши
      cx.fillStyle = '#8a5c3a';
      if (dir === 0) {
        cx.fillRect(hx - 2, hy - 5, 1, 4);
        cx.fillRect(hx + 1, hy - 5, 1, 4);
      } else if (dir === 1) {
        cx.fillRect(hx - 2, hy + 2, 1, 4);
        cx.fillRect(hx + 1, hy + 2, 1, 4);
      } else if (dir === 2) {
        cx.fillRect(hx - 5, hy - 2, 4, 1);
        cx.fillRect(hx - 5, hy + 1, 4, 1);
      } else {
        cx.fillRect(hx + 2, hy - 2, 4, 1);
        cx.fillRect(hx + 2, hy + 1, 4, 1);
      }

      // Глаз (с точки зрения камеры сверху не виден, но пусть будет точка)
      cx.fillStyle = '#000';
      if (dir === 2) cx.fillRect(hx - 1, hy, 1, 1);
      else if (dir === 3) cx.fillRect(hx + 1, hy, 1, 1);
      else if (dir === 1) {
        cx.fillRect(hx - 1, hy - 1, 1, 1);
        cx.fillRect(hx + 1, hy - 1, 1, 1);
      }
    }
    return c;
  }

  function makeSheepSheet() {
    const CW = 24, CH = 20;
    const c = newCanvas(CW * 4, CH * 4);
    const cx = c.getContext('2d');
    for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 4; f++) {
      const ox = f * CW, oy = dir * CH;
      const bob = (f === 1 || f === 3) ? -1 : 0;
      const bodyY = oy + 11 + bob;

      // Тело — пух
      fillEllipse(cx, ox + 12, bodyY, 9, 6, '#d8d8e0');
      fillEllipse(cx, ox + 12, bodyY - 1, 8, 5, '#f0f0f8');

      // Голова
      const hx = dir === 2 ? ox + 4 : dir === 3 ? ox + 20 : ox + 12;
      const hy = dir === 0 ? bodyY - 6 : bodyY - 2;
      if (dir !== 0) {
        fillEllipse(cx, hx, hy, 3, 3, '#4a4a52');
        // Уши
        cx.fillStyle = '#3a3a42';
        cx.fillRect(hx - 3, hy - 4, 2, 3);
        cx.fillRect(hx + 1, hy - 4, 2, 3);
        // Глаз
        cx.fillStyle = '#000';
        if (dir === 1) { cx.fillRect(hx - 1, hy, 1, 1); cx.fillRect(hx + 1, hy, 1, 1); }
        else if (dir === 2) cx.fillRect(hx - 2, hy, 1, 1);
        else                cx.fillRect(hx + 2, hy, 1, 1);
      } else {
        fillEllipse(cx, hx, hy, 3, 3, '#4a4a52');
      }

      // Ноги
      cx.fillStyle = '#3a3a42';
      cx.fillRect(ox + 6,  bodyY + 5, 2, 4);
      cx.fillRect(ox + 10, bodyY + 5, 2, 4);
      cx.fillRect(ox + 14, bodyY + 5, 2, 4);
      cx.fillRect(ox + 17, bodyY + 5, 2, 4);
    }
    return c;
  }

  function makeSheepTopSheet() {
    const CW = 22, CH = 18;
    const c = newCanvas(CW * 4, CH * 4);
    const cx = c.getContext('2d');
    for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 4; f++) {
      const ox = f * CW, oy = dir * CH;
      const cx0 = ox + CW / 2;
      const bob = (f === 1 || f === 3) ? -1 : 0;
      const cy0 = oy + CH / 2 + bob;

      fillEllipse(cx, cx0, cy0 + 3, 9, 6, 'rgba(0,0,0,0.22)');
      fillEllipse(cx, cx0, cy0, 9, 6, '#d8d8e0');
      fillEllipse(cx, cx0, cy0 - 1, 8, 5, '#f0f0f8');

      // Голова
      const hx = dir === 2 ? cx0 - 8 : dir === 3 ? cx0 + 8 : cx0;
      const hy = dir === 0 ? cy0 - 7 : dir === 1 ? cy0 + 7 : cy0;
      fillEllipse(cx, hx, hy, 3, 3, '#4a4a52');

      // Уши
      cx.fillStyle = '#3a3a42';
      if (dir === 0) { cx.fillRect(hx - 3, hy - 4, 2, 3); cx.fillRect(hx + 1, hy - 4, 2, 3); }
      else if (dir === 1) { cx.fillRect(hx - 3, hy + 2, 2, 3); cx.fillRect(hx + 1, hy + 2, 2, 3); }
      else if (dir === 2) { cx.fillRect(hx - 5, hy - 2, 3, 2); cx.fillRect(hx - 5, hy + 1, 3, 2); }
      else                { cx.fillRect(hx + 2, hy - 2, 3, 2); cx.fillRect(hx + 2, hy + 1, 3, 2); }
    }
    return c;
  }

  // ---------- procedural decor (top view) ----------
  function makeOakTreeTop() {
    const c = newCanvas(32, 32);
    const cx = c.getContext('2d');
    fillCircle(cx, 16, 18, 14, 'rgba(0,0,0,0.22)');
    fillCircle(cx, 16, 16, 13, '#2a6a20');
    fillCircle(cx, 14, 14, 10, '#3a8a30');
    fillCircle(cx, 12, 12, 6,  '#4aa040');
    cx.fillStyle = '#5a3a1a';
    cx.fillRect(14, 14, 4, 4);
    return c;
  }
  function makeBushTop() {
    const c = newCanvas(24, 24);
    const cx = c.getContext('2d');
    fillCircle(cx, 12, 14, 8, 'rgba(0,0,0,0.22)');
    fillCircle(cx, 12, 12, 9, '#3a7a28');
    fillCircle(cx, 10, 10, 5, '#4a9a38');
    // ягоды
    cx.fillStyle = '#c03030';
    cx.fillRect(8, 10, 1, 1);
    cx.fillRect(14, 9, 1, 1);
    cx.fillRect(11, 14, 1, 1);
    return c;
  }
  function makeRockTop() {
    const c = newCanvas(24, 24);
    const cx = c.getContext('2d');
    fillEllipse(cx, 12, 14, 9, 6, 'rgba(0,0,0,0.22)');
    fillEllipse(cx, 12, 12, 9, 7, '#5a5a62');
    fillEllipse(cx, 10, 10, 5, 4, '#7a7a82');
    return c;
  }
  function makeGoldenOreTop() {
    const c = newCanvas(24, 24);
    const cx = c.getContext('2d');
    fillEllipse(cx, 12, 14, 9, 6, 'rgba(0,0,0,0.22)');
    fillEllipse(cx, 12, 12, 9, 7, '#5a5a62');
    cx.fillStyle = '#e8b830';
    cx.fillRect(8, 8, 2, 2);
    cx.fillRect(13, 10, 2, 2);
    cx.fillRect(10, 14, 2, 2);
    cx.fillRect(14, 14, 1, 1);
    cx.fillStyle = '#f8d858';
    cx.fillRect(8, 8, 1, 1);
    cx.fillRect(13, 10, 1, 1);
    return c;
  }
  function makeFlowerTop() {
    const c = newCanvas(16, 16);
    const cx = c.getContext('2d');
    fillEllipse(cx, 8, 12, 5, 3, 'rgba(0,0,0,0.20)');
    // стебель
    cx.fillStyle = '#3a8a30';
    cx.fillRect(7, 8, 2, 4);
    // листики
    cx.fillStyle = '#4aa040';
    cx.fillRect(5, 10, 2, 1);
    cx.fillRect(9, 10, 2, 1);
    // цветок
    cx.fillStyle = '#e84a5f';
    cx.fillRect(6, 4, 4, 4);
    cx.fillStyle = '#f8d858';
    cx.fillRect(7, 5, 2, 2);
    return c;
  }
  function makeOakLogTop() {
    const c = newCanvas(24, 24);
    const cx = c.getContext('2d');
    fillEllipse(cx, 12, 14, 9, 6, 'rgba(0,0,0,0.22)');
    fillEllipse(cx, 12, 12, 9, 7, '#6a4220');
    // годовые кольца
    fillEllipse(cx, 12, 12, 6, 4, '#8a5a2a');
    fillEllipse(cx, 12, 12, 3, 2, '#a87850');
    return c;
  }
  function makeRespawnBlockTop() {
    const c = newCanvas(24, 24);
    const cx = c.getContext('2d');
    fillEllipse(cx, 12, 14, 9, 6, 'rgba(0,0,0,0.22)');
    fillEllipse(cx, 12, 12, 9, 7, '#4a3220');
    fillEllipse(cx, 12, 12, 6, 5, '#6a4830');
    fillEllipse(cx, 12, 12, 4, 3, '#ffd060');
    fillEllipse(cx, 12, 12, 2, 1, '#fff4c0');
    return c;
  }

  // ---------- white bed ----------
  function makeWhiteBed() {
    const c = newCanvas(24, 26);
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    // Деревянная рама
    cx.fillStyle = '#6a4220'; cx.fillRect(2, 20, 20, 5);
    cx.fillStyle = '#8a5a2a'; cx.fillRect(2, 20, 20, 2);
    // Матрас
    cx.fillStyle = '#e8e8f0'; cx.fillRect(3, 13, 18, 8);
    // Подушка
    cx.fillStyle = '#f8f8ff'; cx.fillRect(3, 6, 18, 7);
    // Складка пледа
    cx.fillStyle = '#c8c8d8'; cx.fillRect(3, 17, 18, 1);
    // Контур
    cx.strokeStyle = 'rgba(0,0,0,0.6)'; cx.lineWidth = 1;
    cx.strokeRect(3.5, 6.5, 17, 17);
    return c;
  }
  function makeWhiteBedTop() {
    const c = newCanvas(24, 24);
    const cx = c.getContext('2d');
    // Рама
    cx.fillStyle = '#6a4220'; cx.fillRect(0, 0, 24, 24);
    // Матрас
    cx.fillStyle = '#e8e8f0'; cx.fillRect(2, 2, 20, 20);
    // Подушка
    cx.fillStyle = '#f8f8ff'; cx.fillRect(3, 3, 18, 7);
    // Одеяло
    cx.fillStyle = '#d8d8e0'; cx.fillRect(3, 11, 18, 10);
    // Контур
    cx.strokeStyle = 'rgba(0,0,0,0.6)'; cx.lineWidth = 1;
    cx.strokeRect(2.5, 2.5, 19, 19);
    return c;
  }

  // Процедурный спрайт блока возрождения (side view, для изо-ракурсов).
  function makeRespawnBlock() {
    const c = newCanvas(20, 24);
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.fillStyle = '#2a1a10'; cx.fillRect(2, 19, 16, 4);
    cx.fillStyle = '#4a3220'; cx.fillRect(3, 8, 14, 12);
    cx.fillStyle = '#6a4830'; cx.fillRect(2, 6, 16, 3);
    cx.fillStyle = '#a07040'; cx.fillRect(6, 11, 8, 7);
    cx.fillStyle = '#ffd060'; cx.fillRect(7, 12, 6, 5);
    cx.fillStyle = '#fff4c0'; cx.fillRect(9, 14, 2, 2);
    cx.strokeStyle = 'rgba(0,0,0,0.65)'; cx.lineWidth = 1;
    cx.strokeRect(3.5, 8.5, 13, 11);
    cx.fillStyle = 'rgba(255,215,80,0.55)';
    cx.fillRect(6, 10, 8, 1);
    return c;
  }

  const Sprites = {
    TILE_W, TILE_H,
    playerCellW: PCW, playerCellH: PCH,
    playerCols: 4, playerRows: 4,
    rabbitCellW: RCW, rabbitCellH: RCH,
    tiles: {}, tilesSquare: {},
    decor: {}, decorTop: {},
    items: {},
    playerSheet: null,
    playerTop: null,
    rabbit: null, rabbitTint: null,
    rabbitTop: null, rabbitTopTint: null,
    // Словарь овец: { white_sheep: { canvas, cellW, cellH, tint, top, topCellW, topCellH, topTint } }
    sheepSheets: {},
    ready: false, loaded: 0, total: 0,

    init: function () {
      if (this._started) return;
      this._started = true;

      // Iso tiles (side view)
      this.tiles.grass = solidDiamond('#4a8a3a');
      this.tiles.sand  = solidDiamond('#d8c070');
      this.tiles.water = solidDiamond('#2a5ab0');
      this.tiles.stone = solidDiamond('#6a6a72');
      this.tiles.snow  = solidDiamond('#e8eef4');

      // Square tiles (top view)
      this.tilesSquare.grass = makeSquareTile('#4a8a3a');
      this.tilesSquare.sand  = makeSquareTile('#d8c070');
      this.tilesSquare.water = makeSquareTile('#2a5ab0');
      this.tilesSquare.stone = makeSquareTile('#6a6a72');
      this.tilesSquare.snow  = makeSquareTile('#e8eef4');

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

      // Procedural top-down decor (готовы сразу)
      this.decorTop.oak_tree   = makeOakTreeTop();
      this.decorTop.bush       = makeBushTop();
      this.decorTop.rock       = makeRockTop();
      this.decorTop.golden_ore = makeGoldenOreTop();
      this.decorTop.flower     = makeFlowerTop();
      this.decorTop.oak_log    = makeOakLogTop();
      this.decorTop.respawn_block = makeRespawnBlockTop();

      // Procedural top-down player/rabbit (готовы сразу)
      this.playerTop = makePlayerTopSheet();
      this.rabbitTop = makeRabbitTopSheet();
      this.rabbitTopTint = tintRed(this.rabbitTop);

      // Словарь овец по цветам. Здесь только fallback-заготовка для white_sheep;
      // PNG-версии подгрузятся в _loadAll и перезапишут эти записи.
      this.sheepSheets = {
        white_sheep: {
          canvas: makeSheepSheet(),
          cellW: 24, cellH: 20, cols: 4, rows: 4,
          top: makeSheepTopSheet(),
          topCellW: 22, topCellH: 18
        }
      };
      this.sheepSheets.white_sheep.tint    = tintRed(this.sheepSheets.white_sheep.canvas);
      this.sheepSheets.white_sheep.topTint = tintRed(this.sheepSheets.white_sheep.top);

      // Side-view respawn_block — процедурный (в PNG его нет)
      const rb = makeRespawnBlock();
      this.decor.respawn_block = rb;
      this.items.respawn_block = rb;

      // Процедурная кровать (side + top). Если white_bed.png загрузится — перезапишет side.
      const wb = makeWhiteBed();
      this.decor.white_bed = wb;
      this.items.white_bed = wb;
      this.decorTop.white_bed = makeWhiteBedTop();

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
        ['oak_tree',    40, 52, c => { self.decor.oak_tree = c; self.decorTop.oak_tree = c; }],
        ['bush',        28, 24, c => { self.decor.bush = c; }],
        ['rock',        26, 20, c => { self.decor.rock = c; }],
        ['golden_ore',  26, 20, c => { self.decor.golden_ore = c; }],
        ['flower',      14, 18, c => { self.decor.flower = c; }],
        ['raw_rabbit_meat', 16, 16, c => self.items.raw_rabbit_meat = c],
        ['rabbit_skin',     16, 16, c => self.items.rabbit_skin     = c],
        ['oak_log',         16, 16, c => { self.items.oak_log = c; self.decor.oak_log = c; }],
        ['white_bed',       24, 26, c => { self.decor.white_bed = c; self.items.white_bed = c; }]
      ];
      self.total = jobs.length + 3;   // +player +rabbit +sheep
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

      // Овца: side-лист white_sheep.png (опционально white_sheep_top.png).
      // Если PNG нет — остаётся процедурный fallback из init().
      promises.push(
        loadImage(ASSETS + 'white_sheep.png')
          .then(img => {
            const canvas = processSheet(img, 4, 4, 24, 20);
            const s = self.sheepSheets.white_sheep;
            s.canvas = canvas;
            s.cellW = 24; s.cellH = 20; s.cols = 4; s.rows = 4;
            s.tint = tintRed(canvas);
            self.loaded++;
          })
          .catch(err => { console.warn('[sprites]', err.message); self.loaded++; })
      );
      promises.push(
        loadImage(ASSETS + 'white_sheep_top.png')
          .then(img => {
            const canvas = processSheet(img, 4, 4, 22, 18);
            const s = self.sheepSheets.white_sheep;
            s.top = canvas;
            s.topCellW = 22; s.topCellH = 18;
            s.topTint = tintRed(canvas);
            self.loaded++;
          })
          .catch(err => { console.warn('[sprites] (top) ', err.message); self.loaded++; })
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

    getTile:        name => Sprites.tiles[name] || Sprites.tiles.grass,
    getTileSquare:  name => Sprites.tilesSquare[name] || Sprites.tilesSquare.grass,
    getDecor:       name => Sprites.decor[name] || null,
    getDecorTop:    name => Sprites.decorTop[name] || Sprites.decor[name] || null,
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
    },

    // Top-down draw — «якорь» (x, y) — центр клетки на экране.
    drawPlayerTop: function (ctx, cx, cy, dir, frame) {
      if (!this.playerTop) return;
      const sx = (frame & 3) * PCW;
      const sy = (DIR_ROW[dir & 3]) * PCH;
      ctx.drawImage(this.playerTop, sx, sy, PCW, PCH,
                    Math.round(cx - PCW / 2), Math.round(cy - PCH / 2), PCW, PCH);
    },
    drawRabbitTop: function (ctx, cx, cy, dir, frame, tint) {
      if (!this.rabbitTop) return;
      const sheet = tint && this.rabbitTopTint ? this.rabbitTopTint : this.rabbitTop;
      const sx = (frame & 3) * RCW;
      const sy = (DIR_ROW[dir & 3]) * RCH;
      ctx.drawImage(sheet, sx, sy, RCW, RCH,
                    Math.round(cx - RCW / 2), Math.round(cy - RCH / 2), RCW, RCH);
    },
    // Универсальный API: скин выбирается по типу существа (например 'white_sheep').
    drawSheep: function (ctx, x, y, dir, frame, tint, type) {
      const s = this.sheepSheets[type || 'white_sheep'];
      if (!s || !s.canvas) return;
      const sheet = tint && s.tint ? s.tint : s.canvas;
      const sx = (frame & 3) * s.cellW;

      // Лист овцы: row0=UP(спина), row1=DOWN(морда), row2=LEFT, row3=LEFT(дубль).
      // Для RIGHT (dir=3) берём row3 и флипаем по X.
      if (dir === 3) {
        const sy = 3 * s.cellH;
        ctx.save();
        ctx.translate(Math.round(x) + s.cellW, Math.round(y));
        ctx.scale(-1, 1);
        ctx.drawImage(sheet, sx, sy, s.cellW, s.cellH, 0, 0, s.cellW, s.cellH);
        ctx.restore();
      } else {
        const sy = dir * s.cellH;
        ctx.drawImage(sheet, sx, sy, s.cellW, s.cellH,
                      Math.round(x), Math.round(y), s.cellW, s.cellH);
      }
    },
    drawSheepTop: function (ctx, cx, cy, dir, frame, tint, type) {
      const s = this.sheepSheets[type || 'white_sheep'];
      if (!s || !s.top) return;
      const sheet = tint && s.topTint ? s.topTint : s.top;
      const sx = (frame & 3) * s.topCellW;
      const sy = (DIR_ROW[dir & 3]) * s.topCellH;
      ctx.drawImage(sheet, sx, sy, s.topCellW, s.topCellH,
                    Math.round(cx - s.topCellW / 2),
                    Math.round(cy - s.topCellH / 2),
                    s.topCellW, s.topCellH);
    }
  };

  window.Sprites = Sprites;
})();