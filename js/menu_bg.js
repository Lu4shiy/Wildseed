// js/menu_bg.js
// Процедурный пиксель-арт фон для главного меню.
// Внутреннее разрешение 480×270 (как у игры), CSS растягивает до экрана
// с image-rendering: pixelated. Рисуется один раз — статичная сцена.
(function () {
  'use strict';

  const canvas = document.getElementById('menuBg');
  if (!canvas) return;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ---------- palette ----------
  const C = {
    grass1:  '#4a8a3a',
    grass2:  '#3a7a2a',
    grass3:  '#2a5a1a',
    grassL:  '#5a9a48',
    dirt:    '#3a2010',
    dirtL:   '#5a3820',
    treeD:   '#1e5a18',
    treeM:   '#2a6a20',
    treeL:   '#3a8a30',
    treeH:   '#4aa040',
    trunkD:  '#2a1608',
    trunk:   '#4a2a10',
    trunkL:  '#6a4220',
    waterD:  '#1a3a80',
    water:   '#2a5ab0',
    waterL:  '#4a8ad0',
    sand:    '#d8c070',
    sandD:   '#b8a050',
    rockD:   '#3a3a42',
    rock:    '#5a5a62',
    rockL:   '#7a7a82',
    rockH:   '#9a9aa2',
    tentD:   '#a89878',
    tent:    '#c8b898',
    tentL:   '#e8dcc0',
    tentOut: '#5a4830',
    fireD:   '#c03010',
    fire:    '#e84a20',
    fireM:   '#f8a030',
    fireL:   '#f8e050',
    woodD:   '#3a2008',
    wood:    '#6a4220',
    woodL:   '#8a5a2a',
    flagD:   '#2a3a80',
    flag:    '#4a6ab0',
    flagL:   '#6a8ad0',
    gold:    '#f9d54f',
    goldL:   '#fff4c0',
    iron:    '#3a3a42',
    ironL:   '#6a6a72',
    outline: '#1a1a2a'
  };

  // ---------- helpers ----------
  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
  }
  function px(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }
  function ellipse(cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    const rxc = Math.max(0.5, rx), ryc = Math.max(0.5, ry);
    for (let y = -Math.ceil(ryc); y <= Math.ceil(ryc); y++) {
      for (let x = -Math.ceil(rxc); x <= Math.ceil(rxc); x++) {
        if ((x * x) / (rxc * rxc) + (y * y) / (ryc * ryc) <= 1) {
          ctx.fillRect((cx + x) | 0, (cy + y) | 0, 1, 1);
        }
      }
    }
  }
  function circle(cx, cy, r, color) {
    ellipse(cx, cy, r, r, color);
  }

  // Детерминированный PRNG (чтобы фон не мигал при перезагрузке).
  let seed = 0x9e3779b9;
  function rnd() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
  }
  function rint(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

  // ============================================================
  // 1. GRASS BASE
  // ============================================================
  rect(0, 0, W, H, C.grass1);

  // Тёмные пятна-вариации
  for (let i = 0; i < 600; i++) {
    px(rint(0, W - 1), rint(0, H - 1), C.grass2);
  }
  for (let i = 0; i < 400; i++) {
    px(rint(0, W - 1), rint(0, H - 1), C.grass3);
  }
  for (let i = 0; i < 300; i++) {
    px(rint(0, W - 1), rint(0, H - 1), C.grassL);
  }
  // Немного земли-проплешин
  for (let i = 0; i < 60; i++) {
    const x = rint(0, W - 1), y = rint(0, H - 1);
    px(x, y, C.dirt);
    if (rnd() < 0.5) px(x + 1, y, C.dirtL);
  }

  // ============================================================
  // 2. STREAM (bottom-left corner, diagonal)
  //    Протекает из левого края вниз-вправо.
  // ============================================================
  function drawStream() {
    // Проходим по X, рисуем вертикальные полосы с наклоном.
    const xEnd = 150;
    for (let x = 0; x < xEnd; x++) {
      // верхняя кромка струи (её центр)
      const topY = 170 + Math.floor(x * 0.55);
      if (topY >= H) break;
      // песчаный берег сверху
      const bankW = 4 + Math.floor(rnd() * 3);
      rect(x, topY - bankW, 1, bankW, C.sandD);
      rect(x, topY - bankW + 1, 1, bankW - 2, C.sand);
      // вода — от topY до низа canvas (условно до H)
      const wDepth = 30 + Math.floor(rnd() * 6);
      const wBottom = Math.min(H, topY + wDepth);
      rect(x, topY, 1, wBottom - topY, C.waterD);
      if (wBottom - topY > 2) {
        rect(x, topY + 1, 1, wBottom - topY - 2, C.water);
      }
      // блик по центру
      if (x % 5 === 0) {
        rect(x, topY + 4, 1, 2, C.waterL);
      }
      if (x % 9 === 0) {
        rect(x, topY + 9, 1, 1, C.waterL);
      }
      // Нижний берег (если вода кончается выше H)
      if (wBottom < H) {
        rect(x, wBottom, 1, 4, C.sand);
        rect(x, wBottom + 4, 1, 2, C.sandD);
      }
    }
  }
  drawStream();

  // ============================================================
  // 3. BRIDGE over stream (bottom-left)
  //    Горизонтальные доски, две опоры.
  // ============================================================
  function drawBridge() {
    const y = 205;                 // верхняя кромка настила
    const x0 = 0, x1 = 115;

    // Опоры
    rect(x0 + 8,  y - 12, 4, 34, C.woodD);
    rect(x0 + 100, y - 12, 4, 34, C.woodD);
    rect(x0 + 8,  y - 12, 2, 34, C.wood);
    rect(x0 + 100, y - 12, 2, 34, C.wood);

    // Верхние перила
    rect(x0 + 6, y - 12, x1 - x0 - 8, 3, C.woodD);
    rect(x0 + 6, y - 11, x1 - x0 - 8, 1, C.woodL);
    // Нижние перила
    rect(x0 + 6, y + 20, x1 - x0 - 8, 3, C.woodD);
    rect(x0 + 6, y + 20, x1 - x0 - 8, 1, C.wood);

    // Доски настила
    for (let x = x0 + 4; x < x1; x += 5) {
      rect(x, y - 8, 4, 27, C.wood);
      rect(x, y - 8, 4, 1, C.woodL);
      rect(x, y + 18, 4, 1, C.woodD);
    }
    // Тонкая тень под мостом
    rect(x0 + 4, y + 23, x1 - x0 - 4, 2, 'rgba(0,0,0,0.25)');
  }
  drawBridge();

  // ============================================================
  // 4. TREES
  // ============================================================
  function drawTree(cx, cy, size) {
    // тень на земле
    ellipse(cx, cy + 6, size * 0.55, size * 0.18, 'rgba(0,0,0,0.28)');

    // ствол
    const tW = Math.max(3, Math.round(size * 0.16));
    const tH = Math.round(size * 0.5);
    const tx = cx - Math.floor(tW / 2);
    rect(tx, cy - tH + 8, tW, tH, C.trunk);
    rect(tx, cy - tH + 8, Math.max(1, Math.floor(tW / 2)), tH, C.trunkL);
    rect(tx + tW - 1, cy - tH + 8, 1, tH, C.trunkD);
    // контур ствола
    rect(tx - 1, cy - tH + 8, 1, tH, C.outline);
    rect(tx + tW, cy - tH + 8, 1, tH, C.outline);

    // крона: слоями, тёмная → средняя → светлая → блики
    const c0 = cy - Math.round(size * 0.35);
    circle(cx,                 c0,                          Math.round(size * 0.62), C.treeD);
    circle(cx - size * 0.32,   c0 + size * 0.08,            Math.round(size * 0.45), C.treeD);
    circle(cx + size * 0.32,   c0 + size * 0.08,            Math.round(size * 0.45), C.treeD);

    circle(cx,                 c0 - size * 0.08,            Math.round(size * 0.52), C.treeM);
    circle(cx - size * 0.22,   c0 - size * 0.18,            Math.round(size * 0.34), C.treeL);
    circle(cx + size * 0.22,   c0 - size * 0.16,            Math.round(size * 0.34), C.treeL);

    circle(cx - size * 0.12,   c0 - size * 0.28,            Math.round(size * 0.20), C.treeH);
    circle(cx + size * 0.14,   c0 - size * 0.24,            Math.round(size * 0.18), C.treeH);
    circle(cx,                 c0 - size * 0.34,            Math.round(size * 0.14), C.treeH);
  }

  // Крупные одиночные деревья по краям (центр закрыт панелью).
  drawTree( 58,  90, 55);
  drawTree(128,  42, 38);
  drawTree(430,  58, 45);
  drawTree(462, 112, 34);
  drawTree( 22, 200, 30);

  // ============================================================
  // 5. ROCKS / BUSHES / FLOWERS / GRASS TUFTS
  // ============================================================
  function drawRock(cx, cy, size) {
    ellipse(cx, cy + size * 0.4, size * 0.95, size * 0.28, 'rgba(0,0,0,0.3)');
    ellipse(cx, cy, size, size * 0.7, C.rockD);
    ellipse(cx, cy - 1, size, size * 0.65, C.rock);
    ellipse(cx - size * 0.18, cy - size * 0.15, size * 0.55, size * 0.4, C.rockL);
    ellipse(cx - size * 0.28, cy - size * 0.25, size * 0.24, size * 0.16, C.rockH);
  }
  function drawBush(cx, cy, size) {
    ellipse(cx, cy + size * 0.55, size * 0.9, size * 0.22, 'rgba(0,0,0,0.28)');
    circle(cx, cy, size * 0.7, C.treeD);
    circle(cx - size * 0.33, cy - size * 0.05, size * 0.5, C.treeM);
    circle(cx + size * 0.33, cy - size * 0.05, size * 0.5, C.treeM);
    circle(cx, cy - size * 0.15, size * 0.42, C.treeL);
    // ягоды
    px(cx - 3, cy + 2, '#c03030');
    px(cx + 2, cy + 1, '#c03030');
    px(cx + 3, cy + 3, '#c03030');
  }
  function drawFlower(cx, cy) {
    px(cx, cy + 1, C.treeM);
    px(cx, cy + 2, C.treeM);
    rect(cx - 1, cy - 1, 3, 2, '#e84a5f');
    px(cx, cy - 1, '#f8e050');
  }
  function drawGrassTuft(cx, cy) {
    px(cx,     cy,     C.grass3);
    px(cx + 1, cy - 1, C.grass3);
    px(cx + 2, cy,     C.grass3);
    px(cx + 1, cy + 1, C.grass3);
  }

  // Размещаем декор преимущественно по краям и вне зоны панели.
  drawBush(  20, 135, 10);
  drawBush( 250, 240,  8);
  drawBush( 160, 245,  9);
  drawBush( 320, 240,  7);
  drawRock( 260,  30,  6);
  drawRock( 210, 250,  6);
  drawRock( 340,  20,  5);
  drawRock( 300, 250,  5);
  drawRock( 180, 140,  5);

  for (let i = 0; i < 18; i++) {
    drawFlower(rint(0, W - 1), rint(0, H - 1));
  }
  for (let i = 0; i < 40; i++) {
    drawGrassTuft(rint(0, W - 1), rint(0, H - 1));
  }

  // ============================================================
  // 6. SETTLER CAMP (right side)
  // ============================================================

  // --- 6.1 flag pole with blue banner ---
  function drawFlag(cx, cy) {
    // тень под столбом
    ellipse(cx, cy + 24, 4, 1, 'rgba(0,0,0,0.3)');
    // столб
    rect(cx - 1, cy - 40, 2, 60, C.wood);
    rect(cx - 1, cy - 40, 1, 60, C.woodL);
    rect(cx + 1, cy - 40, 1, 60, C.woodD);
    // навершие
    circle(cx, cy - 41, 3, C.gold);
    circle(cx, cy - 41, 2, C.goldL);
    // полотнище
    rect(cx - 20, cy - 36, 20, 22, C.outline);
    rect(cx - 19, cy - 35, 18, 20, C.flagD);
    rect(cx - 19, cy - 35, 18, 18, C.flag);
    rect(cx - 17, cy - 33, 14, 12, C.flagL);
    // герб — золотое солнце
    circle(cx - 10, cy - 26, 4, C.gold);
    circle(cx - 10, cy - 26, 3, C.goldL);
    circle(cx - 10, cy - 26, 1, C.gold);
    // язычок полотнища
    rect(cx - 20, cy - 14, 20, 2, C.flag);
    rect(cx - 20, cy - 12, 14, 2, C.flag);
  }
  drawFlag(430, 120);

  // --- 6.2 tent ---
  function drawTent(cx, cy) {
    // тень
    ellipse(cx, cy + 3, 34, 5, 'rgba(0,0,0,0.32)');

    // Левая (тёмная) половина
    ctx.fillStyle = C.tentD;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 32);
    ctx.lineTo(cx - 36, cy + 2);
    ctx.lineTo(cx, cy + 2);
    ctx.closePath();
    ctx.fill();

    // Правая (светлая) половина
    ctx.fillStyle = C.tentL;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 32);
    ctx.lineTo(cx + 36, cy + 2);
    ctx.lineTo(cx, cy + 2);
    ctx.closePath();
    ctx.fill();

    // Затемнение под пологом справа (объём)
    ctx.fillStyle = C.tent;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 32);
    ctx.lineTo(cx + 20, cy - 12);
    ctx.lineTo(cx + 36, cy + 2);
    ctx.lineTo(cx + 8, cy + 2);
    ctx.closePath();
    ctx.fill();

    // Вход (тёмный треугольник)
    ctx.fillStyle = C.trunk;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 22);
    ctx.lineTo(cx - 6, cy + 2);
    ctx.lineTo(cx + 6, cy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.trunkD;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx - 3, cy + 2);
    ctx.lineTo(cx + 3, cy + 2);
    ctx.closePath();
    ctx.fill();

    // Контур палатки
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 36.5, cy + 2.5);
    ctx.lineTo(cx + 0.5, cy - 32.5);
    ctx.lineTo(cx + 36.5, cy + 2.5);
    ctx.stroke();

    // Шест на вершине
    rect(cx - 1, cy - 37, 2, 6, C.wood);
    px(cx, cy - 38, C.gold);
  }
  drawTent(390, 115);

  // --- 6.3 crate ---
  function drawCrate(cx, cy) {
    ellipse(cx, cy + 10, 11, 3, 'rgba(0,0,0,0.3)');
    rect(cx - 9, cy - 9, 18, 18, C.wood);
    rect(cx - 9, cy - 9, 18, 4, C.woodL);
    rect(cx - 9, cy + 5, 18, 4, C.woodD);
    // крестовина
    ctx.strokeStyle = C.woodD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 9);
    ctx.lineTo(cx + 9, cy + 9);
    ctx.moveTo(cx + 9, cy - 9);
    ctx.lineTo(cx - 9, cy + 9);
    ctx.stroke();
    // контур
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 9.5, cy - 9.5, 19, 19);
  }
  drawCrate(335, 175);

  // --- 6.4 barrel ---
  function drawBarrel(cx, cy) {
    ellipse(cx, cy + 11, 9, 2, 'rgba(0,0,0,0.3)');
    // тело — сужающееся к краям
    for (let y = -10; y <= 10; y++) {
      const t = Math.abs(y) / 10;
      const w = Math.round(9 - t * 2);
      rect(cx - w, cy + y, w * 2, 1, C.wood);
      if (y < -2) rect(cx - w, cy + y, w * 2, 1, C.woodL);
      if (y > 2)  rect(cx - w, cy + y, w * 2, 1, C.woodD);
    }
    // крышка
    ellipse(cx, cy - 10, 7, 2, C.woodL);
    ellipse(cx, cy - 10, 5, 1, C.wood);
    // обручи
    rect(cx - 9, cy - 6, 18, 2, C.iron);
    rect(cx - 9, cy + 5, 18, 2, C.iron);
    // контур
    rect(cx - 9, cy - 10, 1, 20, C.outline);
    rect(cx + 8, cy - 10, 1, 20, C.outline);
  }
  drawBarrel(460, 150);

  // --- 6.5 fallen log ---
  function drawLog(cx, cy, len) {
    ellipse(cx, cy + 6, len / 2 + 2, 3, 'rgba(0,0,0,0.3)');
    rect(cx - len / 2, cy - 4, len, 10, C.wood);
    rect(cx - len / 2, cy - 4, len, 3, C.woodL);
    rect(cx - len / 2, cy + 4, len, 2, C.woodD);
    // торцы
    ellipse(cx - len / 2, cy + 1, 2, 5, C.woodL);
    ellipse(cx + len / 2, cy + 1, 2, 5, C.woodL);
    ellipse(cx + len / 2, cy + 1, 1, 3, C.wood);
    // контур
    rect(cx - len / 2, cy - 5, len, 1, C.outline);
    rect(cx - len / 2, cy + 6, len, 1, C.outline);
  }
  drawLog(415, 200, 50);

  // --- 6.6 campfire ---
  function drawCampfire(cx, cy) {
    // тень
    ellipse(cx, cy + 4, 14, 3, 'rgba(0,0,0,0.32)');

    // кольцо камней
    ellipse(cx, cy + 2, 12, 5, C.rockD);
    ellipse(cx, cy + 1, 11, 4, C.rock);
    ellipse(cx, cy + 1, 8,  3, C.rockL);
    // пепел
    ellipse(cx, cy + 1, 6, 2, '#2a1a10');

    // поленья крест-накрест
    rect(cx - 7, cy - 1, 14, 2, C.woodD);
    rect(cx - 7, cy - 1, 14, 1, C.wood);
    rect(cx - 1, cy - 4, 2, 8, C.woodD);

    // Пламя: три слоя
    // Внешний
    ctx.fillStyle = C.fire;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 1);
    ctx.lineTo(cx,     cy - 17);
    ctx.lineTo(cx + 6, cy - 1);
    ctx.closePath();
    ctx.fill();
    // Средний
    ctx.fillStyle = C.fireM;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 1);
    ctx.lineTo(cx,     cy - 12);
    ctx.lineTo(cx + 4, cy - 1);
    ctx.closePath();
    ctx.fill();
    // Внутренний
    ctx.fillStyle = C.fireL;
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 1);
    ctx.lineTo(cx,     cy - 8);
    ctx.lineTo(cx + 2, cy - 1);
    ctx.closePath();
    ctx.fill();
    // Искры
    px(cx - 3, cy - 19, C.fireM);
    px(cx + 2, cy - 21, C.fire);
    px(cx + 1, cy - 24, C.fireM);
  }
  drawCampfire(385, 180);

  // ============================================================
  // 7. RABBIT (right-bottom)
  // ============================================================
  function drawRabbit(cx, cy) {
    ellipse(cx, cy + 5, 7, 2, 'rgba(0,0,0,0.3)');
    // тело
    ellipse(cx, cy + 1, 6, 4, '#a87850');
    ellipse(cx, cy - 1, 5, 3, '#b88860');
    // хвост
    circle(cx - 5, cy + 2, 2, '#f4f0e8');
    // голова
    circle(cx + 4, cy - 2, 3, '#b88860');
    // уши
    rect(cx + 2, cy - 9, 1, 5, '#8a5c3a');
    rect(cx + 5, cy - 9, 1, 5, '#8a5c3a');
    // глаз
    px(cx + 5, cy - 2, '#000');
    // нос
    px(cx + 7, cy - 1, '#3a1f0a');
  }
  drawRabbit(455, 210);

  // ============================================================
  // 8. FRONT GRASS TUFTS — поверх всего, для глубины
  // ============================================================
  for (let i = 0; i < 30; i++) {
    const x = rint(0, W - 1);
    const y = rint(H - 20, H - 1);
    // пропускаем мост
    if (x < 130 && y > 195) continue;
    drawGrassTuft(x, y);
  }

})();