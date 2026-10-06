// =============================================================
//  SPRITES — программная генерация пиксель-арт текстур
//  Всё рисуется 1 раз при загрузке и складывается в canvas'ы.
//  Потом в рендере просто drawImage — быстро даже на мобилке.
// =============================================================

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Хэш от координат — чтобы текстуры были стабильны на одном тайле
function tileHash(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------- ТАЙЛЫ ----------
// На каждый тип — 4 варианта текстуры, чтобы соседние тайлы отличались
function makeTileVariants() {
  const variants = 4;
  const result = {};

  // --- ТРАВА ---
  result.grass = [];
  for (let v = 0; v < variants; v++) {
    const c = makeCanvas(16, 16);
    const g = c.getContext('2d');
    const rnd = mulberry32(100 + v);
    // база
    g.fillStyle = '#5ba244'; g.fillRect(0, 0, 16, 16);
    // тёмные пятна
    g.fillStyle = '#4d8c39';
    for (let i = 0; i < 28; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    // светлые пятна
    g.fillStyle = '#6cb254';
    for (let i = 0; i < 18; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    // травинки (вертикальные чёрточки)
    g.fillStyle = '#3f7a2e';
    for (let i = 0; i < 5; i++) {
      const x = 1 + ((rnd() * 14) | 0);
      const y = 2 + ((rnd() * 12) | 0);
      g.fillRect(x, y, 1, 2);
    }
    // светлые кончики травинок
    g.fillStyle = '#7bc454';
    for (let i = 0; i < 4; i++) {
      const x = 1 + ((rnd() * 14) | 0);
      const y = 1 + ((rnd() * 13) | 0);
      g.fillRect(x, y, 1, 1);
    }
    result.grass.push(c);
  }

  // --- ВОДА ---
  result.water = [];
  for (let v = 0; v < variants; v++) {
    const c = makeCanvas(16, 16);
    const g = c.getContext('2d');
    const rnd = mulberry32(200 + v);
    g.fillStyle = '#3b7dd8'; g.fillRect(0, 0, 16, 16);
    // тёмные горизонтальные полосы
    g.fillStyle = '#2f66b8';
    for (let i = 0; i < 3; i++) {
      const y = (rnd() * 16) | 0;
      g.fillRect(0, y, 16, 1);
    }
    // блики
    g.fillStyle = '#5da0f0';
    for (let i = 0; i < 12; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    // самые яркие блики
    g.fillStyle = '#a0d0ff';
    for (let i = 0; i < 3; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    result.water.push(c);
  }

  // --- ПЕСОК ---
  result.sand = [];
  for (let v = 0; v < variants; v++) {
    const c = makeCanvas(16, 16);
    const g = c.getContext('2d');
    const rnd = mulberry32(300 + v);
    g.fillStyle = '#e8d18e'; g.fillRect(0, 0, 16, 16);
    // тёмные крупинки
    g.fillStyle = '#c9a961';
    for (let i = 0; i < 25; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    // ещё темнее
    g.fillStyle = '#a88b4a';
    for (let i = 0; i < 6; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    // светлые точки
    g.fillStyle = '#f5e5b0';
    for (let i = 0; i < 8; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    result.sand.push(c);
  }

  // --- КАМЕНЬ ---
  result.stone = [];
  for (let v = 0; v < variants; v++) {
    const c = makeCanvas(16, 16);
    const g = c.getContext('2d');
    const rnd = mulberry32(400 + v);
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, 16, 16);
    // тёмные пятна
    g.fillStyle = '#6b6b6b';
    for (let i = 0; i < 22; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    // светлые
    g.fillStyle = '#a8a8a8';
    for (let i = 0; i < 18; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    // трещины (линии из 2-3 пикселей)
    g.fillStyle = '#5a5a5a';
    for (let i = 0; i < 3; i++) {
      const x = 2 + ((rnd() * 12) | 0);
      const y = 2 + ((rnd() * 12) | 0);
      g.fillRect(x, y, 3, 1);
      g.fillRect(x + 1, y + 1, 1, 2);
    }
    result.stone.push(c);
  }

  // --- СНЕГ ---
  result.snow = [];
  for (let v = 0; v < variants; v++) {
    const c = makeCanvas(16, 16);
    const g = c.getContext('2d');
    const rnd = mulberry32(500 + v);
    g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, 16, 16);
    // голубоватые тени
    g.fillStyle = '#d0dce8';
    for (let i = 0; i < 20; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    // светлые блестки
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    // синие точки
    g.fillStyle = '#b0c8dc';
    for (let i = 0; i < 4; i++) {
      g.fillRect((rnd() * 16) | 0, (rnd() * 16) | 0, 1, 1);
    }
    result.snow.push(c);
  }

  return result;
}

// ---------- ДЕРЕВО (32×48 = 2×3 тайла) ----------
function makeTree() {
  const c = makeCanvas(32, 48);
  const g = c.getContext('2d');

  // Ствол (внизу по центру)
  g.fillStyle = '#5a3a1e';
  g.fillRect(13, 32, 6, 16);
  // Тень на стволе
  g.fillStyle = '#3d2814';
  g.fillRect(13, 32, 2, 16);
  g.fillRect(17, 32, 2, 16);
  // Светлая полоска
  g.fillStyle = '#7a5030';
  g.fillRect(15, 32, 1, 16);

  // Крона — рисуем пиксельную «шапку» из нескольких кругов
  const leavesDark = '#2f6b1e';
  const leavesMid = '#3f8a2a';
  const leavesLight = '#5ba244';
  const leavesHi = '#7bc454';

  function leafBlob(cx, cy, r) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x*x + y*y <= r*r) {
          g.fillStyle = leavesMid;
          g.fillRect(cx + x, cy + y, 1, 1);
        }
      }
    }
  }
  // Рисуем несколько пятен, чтобы получилась «шапка»
  leafBlob(16, 18, 13);
  leafBlob(9, 12, 8);
  leafBlob(23, 12, 8);
  leafBlob(16, 8, 7);

  // Тени и блики на кроне
  const rnd = mulberry32(777);
  for (let i = 0; i < 100; i++) {
    const x = (rnd() * 32) | 0;
    const y = (rnd() * 32) | 0;
    // попали в крону?
    const dx = x - 16, dy = y - 18;
    if (dx*dx + dy*dy > 13*13) continue;
    // верх-право — свет, низ-лево — тень
    if (x + y < 22) {
      g.fillStyle = leavesLight;
      g.fillRect(x, y, 1, 1);
    } else if (x + y > 38) {
      g.fillStyle = leavesDark;
      g.fillRect(x, y, 1, 1);
    }
  }
  // Пара самых ярких бликов
  for (let i = 0; i < 8; i++) {
    const x = 8 + ((rnd() * 20) | 0);
    const y = 4 + ((rnd() * 12) | 0);
    const dx = x - 16, dy = y - 18;
    if (dx*dx + dy*dy > 13*13) continue;
    g.fillStyle = leavesHi;
    g.fillRect(x, y, 1, 1);
  }
  // Тёмный контур
  g.fillStyle = '#1a3d10';
  // (упрощённо — не буду обводить пиксель за пикселем, просто добавим затенение снизу)
  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 32; y++) {
      if ((x - 16) * (x - 16) + (y - 18) * (y - 18) > 12 * 12) continue;
      // нижняя часть кроны
      if (y > 26) {
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

// ---------- КУСТ (16×16) ----------
function makeBush() {
  const c = makeCanvas(16, 16);
  const g = c.getContext('2d');
  const rnd = mulberry32(888);

  // Основа
  g.fillStyle = '#3f8a2a';
  for (let y = 8; y < 15; y++) {
    for (let x = 2; x < 14; x++) {
      if ((x - 8) * (x - 8) / 36 + (y - 12) * (y - 12) / 16 <= 1) {
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  // Светлые пятна
  g.fillStyle = '#5ba244';
  for (let i = 0; i < 20; i++) {
    const x = 3 + ((rnd() * 10) | 0);
    const y = 9 + ((rnd() * 5) | 0);
    g.fillRect(x, y, 1, 1);
  }
  // Тени
  g.fillStyle = '#2a5a16';
  for (let i = 0; i < 12; i++) {
    const x = 3 + ((rnd() * 10) | 0);
    const y = 12 + ((rnd() * 3) | 0);
    g.fillRect(x, y, 1, 1);
  }
  // Пара ягод
  g.fillStyle = '#e83a3a';
  g.fillRect(5, 10, 1, 1);
  g.fillRect(10, 11, 1, 1);
  return c;
}

// ---------- КАМЕНЬ (16×16) ----------
function makeRock() {
  const c = makeCanvas(16, 16);
  const g = c.getContext('2d');
  const rnd = mulberry32(999);

  // Основа — серый овал
  g.fillStyle = '#7a7a7a';
  for (let y = 4; y < 15; y++) {
    for (let x = 2; x < 14; x++) {
      const nx = (x - 8) / 6, ny = (y - 9.5) / 5;
      if (nx*nx + ny*ny <= 1) g.fillRect(x, y, 1, 1);
    }
  }
  // Светлые блики сверху
  g.fillStyle = '#a8a8a8';
  for (let i = 0; i < 14; i++) {
    const x = 3 + ((rnd() * 10) | 0);
    const y = 5 + ((rnd() * 4) | 0);
    g.fillRect(x, y, 1, 1);
  }
  // Тёмные тени снизу
  g.fillStyle = '#4a4a4a';
  for (let i = 0; i < 12; i++) {
    const x = 3 + ((rnd() * 10) | 0);
    const y = 11 + ((rnd() * 4) | 0);
    g.fillRect(x, y, 1, 1);
  }
  return c;
}

// ---------- ЦВЕТОК (16×16) ----------
function makeFlower(color) {
  const c = makeCanvas(16, 16);
  const g = c.getContext('2d');
  // Стебель
  g.fillStyle = '#3f8a2a';
  g.fillRect(8, 8, 1, 6);
  g.fillRect(6, 10, 2, 1);
  g.fillRect(9, 12, 2, 1);
  // Лепестки
  g.fillStyle = color;
  g.fillRect(7, 6, 3, 1);
  g.fillRect(7, 7, 1, 3);
  g.fillRect(9, 7, 1, 3);
  g.fillRect(7, 9, 3, 1);
  // Центр
  g.fillStyle = '#ffd54f';
  g.fillRect(8, 7, 1, 1);
  return c;
}

// ---------- ИГРОК (16×16) ----------
// Возвращает { [dir]: [frame0, frame1, frame2, frame3] }
function makePlayerSprites() {
  const P = {
    out: '#1a1008',     // контур
    skin: '#f2c896',    // кожа
    hair: '#4a2e14',    // волосы
    shirt: '#5ba244',   // рубаха
    shirtDark: '#3f7a2e',
    pants: '#3b6ea5',
    boot: '#4a2e14',
    eye: '#1a1a1a',
    hand: '#e8b888',
  };

  // Универсальная отрисовка «тела» + разные ноги по кадру
  function draw(dir, frame) {
    const c = makeCanvas(16, 16);
    const g = c.getContext('2d');

    // bob — легкое покачивание при ходьбе
    const bob = (frame === 1 || frame === 3) ? -1 : 0;

    // --- НОГИ (зависят от кадра) ---
    const legTop = 12 + bob;
    g.fillStyle = P.pants;
    g.fillStyle = P.pants;
    if (frame === 0) {
      g.fillRect(5, legTop, 2, 2);
      g.fillRect(9, legTop, 2, 2);
    } else if (frame === 1) {
      g.fillRect(4, legTop, 2, 2);
      g.fillRect(9, legTop, 2, 2);
    } else if (frame === 2) {
      g.fillRect(5, legTop, 2, 2);
      g.fillRect(9, legTop, 2, 2);
    } else {
      g.fillRect(5, legTop, 2, 2);
      g.fillRect(10, legTop, 2, 2);
    }
    // Ботинки
    g.fillStyle = P.boot;
    g.fillRect(4, legTop + 2, 3, 2);
    g.fillRect(9, legTop + 2, 3, 2);

    // --- ТЕЛО (рубаха) ---
    g.fillStyle = P.shirt;
    g.fillRect(4, 7 + bob, 8, 6);
    // Тень на рубахе
    g.fillStyle = P.shirtDark;
    g.fillRect(4, 11 + bob, 8, 2);

    // --- РУКИ (зависят от направления) ---
    g.fillStyle = P.shirt;
    if (dir === 'down' || dir === 'up') {
      g.fillRect(3, 8 + bob, 1, 4);
      g.fillRect(12, 8 + bob, 1, 4);
      g.fillStyle = P.hand;
      g.fillRect(3, 12 + bob, 1, 1);
      g.fillRect(12, 12 + bob, 1, 1);
    } else if (dir === 'left') {
      g.fillRect(4, 8 + bob, 1, 4);
      g.fillStyle = P.hand;
      g.fillRect(3, 12 + bob, 2, 1);
    } else { // right
      g.fillRect(11, 8 + bob, 1, 4);
      g.fillStyle = P.hand;
      g.fillRect(11, 12 + bob, 2, 1);
    }

    // --- ГОЛОВА ---
    // Форма головы
    g.fillStyle = P.skin;
    g.fillRect(5, 1 + bob, 6, 6);
    // Убираем углы, чтобы голова была овальной
    g.clearRect(5, 1 + bob, 1, 1);
    g.clearRect(10, 1 + bob, 1, 1);

    // Волосы
    g.fillStyle = P.hair;
    if (dir === 'down') {
      g.fillRect(5, 1 + bob, 6, 2);
      g.fillRect(4, 2 + bob, 1, 3);
      g.fillRect(11, 2 + bob, 1, 3);
      // Глаза
      g.fillStyle = P.eye;
      g.fillRect(6, 4 + bob, 1, 1);
      g.fillRect(9, 4 + bob, 1, 1);
    } else if (dir === 'up') {
      g.fillRect(4, 1 + bob, 8, 4);
      g.fillRect(4, 5 + bob, 1, 1);
      g.fillRect(11, 5 + bob, 1, 1);
    } else if (dir === 'left') {
      g.fillRect(5, 1 + bob, 6, 2);
      g.fillRect(4, 2 + bob, 2, 4);
      g.fillRect(11, 2 + bob, 1, 3);
      g.fillStyle = P.eye;
      g.fillRect(5, 4 + bob, 1, 1);
    } else { // right
      g.fillRect(5, 1 + bob, 6, 2);
      g.fillRect(10, 2 + bob, 2, 4);
      g.fillRect(4, 2 + bob, 1, 3);
      g.fillStyle = P.eye;
      g.fillRect(10, 4 + bob, 1, 1);
    }

    // Общий контур (по краям силуэта)
    // Простой вариант: чёрная рамка по контуру рубахи и головы
    g.fillStyle = P.out;
    // (не будем делать полный outline — слишком длинно, добавим ключевые места)
    g.fillRect(4, 7 + bob, 1, 6);          // левая стенка тела
    g.fillRect(11, 7 + bob, 1, 6);         // правая стенка тела
    g.fillRect(4, 6 + bob, 8, 1);          // верх тела
    g.fillRect(4, 13 + bob, 8, 1);         // низ тела

    return c;
  }

  const frames = [];
  for (let f = 0; f < 4; f++) frames.push(f); // [0,1,2,3]

  return {
    down:  frames.map(f => draw('down',  f)),
    up:    frames.map(f => draw('up',    f)),
    left:  frames.map(f => draw('left',  f)),
    right: frames.map(f => draw('right', f)),
  };
}

// ---------- Экспорт всех спрайтов ----------
const Sprites = {
  tiles: null,
  tree: null,
  bush: null,
  rock: null,
  flowers: null,
  player: null,

  init() {
    this.tiles = makeTileVariants();
    this.tree = makeTree();
    this.bush = makeBush();
    this.rock = makeRock();
    this.flowers = [
      makeFlower('#ff5a5a'),
      makeFlower('#ffd54f'),
      makeFlower('#e8a0e0'),
      makeFlower('#ffffff'),
    ];
    this.player = makePlayerSprites();
  },

  // Выбрать тайл-вариант по мировым координатам тайла
  tileSprite(type, tx, ty) {
    const arr = this.tiles[type];
    if (!arr) return null;
    const idx = tileHash(tx, ty, type * 13) % arr.length;
    return arr[idx];
  },
};
