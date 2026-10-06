// ===== Логика страницы мира: загрузка конфига, цикл, рендер =====

// ---------- Виртуальное разрешение (пиксельный канвас) ----------
const VW = 480;
const VH = 270;

// ---------- Загрузка конфигурации мира ----------
// Конфиг кладёт главная страница в localStorage под ключ "wildseed:current"
let worldCfg;
try {
  worldCfg = JSON.parse(localStorage.getItem('wildseed:current') || 'null');
} catch (e) { worldCfg = null; }

if (!worldCfg) {
  // Если зашли в world.html напрямую — создаём дефолтный мир
  worldCfg = {
    name: 'Dev World',
    seed: 'dev' + Math.floor(Math.random() * 1e6),
    size: 1024,
    difficulty: 'normal',
    keepInventory: false,
    isPublic: true,
  };
}

// ---------- Инициализация ----------
const canvas = document.getElementById('game');
canvas.width  = VW;
canvas.height = VH;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

Input.init(canvas);

function resize() {
  const scale = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  canvas.style.width  = Math.floor(VW * scale) + 'px';
  canvas.style.height = Math.floor(VH * scale) + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---------- Мир и игрок ----------
const world = new World(worldCfg.seed, worldCfg.size);
const spawn = world.findSpawn();

const player = {
  x: spawn.x, y: spawn.y,
  w: 12, h: 12,
  speed: 90,
  dir: 'down',
  hp: 10, hpMax: 10,
  stamina: 100, staminaMax: 100,
  thirst: 100, thirstMax: 100,
  strength: 1,
};

const camera = { x: 0, y: 0 };

// ---------- Коллизии ----------
function collides(x, y) {
  const hw = player.w / 2, hh = player.h / 2;
  return world.isSolidAtPixel(x - hw, y - hh)
      || world.isSolidAtPixel(x + hw, y - hh)
      || world.isSolidAtPixel(x - hw, y + hh)
      || world.isSolidAtPixel(x + hw, y + hh);
}

// ---------- Update ----------
function update(dt) {
  let dx = 0, dy = 0;
  if (Input.isDown('KeyW') || Input.isDown('ArrowUp'))    dy -= 1;
  if (Input.isDown('KeyS') || Input.isDown('ArrowDown'))  dy += 1;
  if (Input.isDown('KeyA') || Input.isDown('ArrowLeft'))  dx -= 1;
  if (Input.isDown('KeyD') || Input.isDown('ArrowRight')) dx += 1;

  const sprint = Input.isDown('ShiftLeft') && player.stamina > 0;
  const speed = sprint ? player.speed * 1.6 : player.speed;

  if (sprint && (dx || dy)) {
    player.stamina = Math.max(0, player.stamina - 25 * dt);
  } else {
    player.stamina = Math.min(player.staminaMax, player.stamina + 15 * dt);
  }

  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    if (Math.abs(dx) > Math.abs(dy)) player.dir = dx < 0 ? 'left' : 'right';
    else                              player.dir = dy < 0 ? 'up'   : 'down';
  }

  const nx = player.x + dx * speed * dt;
  const ny = player.y + dy * speed * dt;

  if (!collides(nx, player.y)) player.x = nx;
  if (!collides(player.x, ny)) player.y = ny;
}

function updateCamera() {
  camera.x = player.x - VW / 2;
  camera.y = player.y - VH / 2;

  // Для фиксированного мира — не выпускаем камеру за границы
  if (worldCfg.size > 0) {
    const worldPx = worldCfg.size * TILE;
    camera.x = Math.max(0, Math.min(worldPx - VW, camera.x));
    camera.y = Math.max(0, Math.min(worldPx - VH, camera.y));
    // Если мир меньше экрана — центрируем
    if (worldPx < VW) camera.x = (worldPx - VW) / 2;
    if (worldPx < VH) camera.y = (worldPx - VH) / 2;
  }
}

// ---------- Render ----------
let fps = 0;

function render() {
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, VW, VH);

  const tx0 = Math.floor(camera.x / TILE) - 1;
  const ty0 = Math.floor(camera.y / TILE) - 1;
  const tx1 = Math.ceil((camera.x + VW) / TILE) + 1;
  const ty1 = Math.ceil((camera.y + VH) / TILE) + 1;

  // Тайлы
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = world.getTile(tx, ty);
      if (t < 0) continue;
      ctx.fillStyle = TILE_COLORS[t];
      ctx.fillRect(
        Math.floor(tx * TILE - camera.x),
        Math.floor(ty * TILE - camera.y),
        TILE, TILE
      );
    }
  }

  // Игрок — пока красный квадрат
  const px = Math.floor(player.x - player.w / 2 - camera.x);
  const py = Math.floor(player.y - player.h / 2 - camera.y);
  ctx.fillStyle = '#ff3b3b';
  ctx.fillRect(px, py, player.w, player.h);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, player.w - 1, player.h - 1);

  // HUD (левая верхняя часть)
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 190, 44);
  ctx.fillStyle = '#fff';
  ctx.font = '8px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`PING: -- ms`, 4, 4);
  ctx.fillText(`FPS:  ${fps}`, 4, 14);
  const tx = Math.floor(player.x / TILE);
  const ty = Math.floor(player.y / TILE);
  ctx.fillText(`X: ${tx}  Y: ${ty}`, 4, 24);
  ctx.fillText(`SEED: ${worldCfg.seed}`, 4, 34);

  // Мини-панель ресурсов (HP/Stamina/Thirst) справа снизу
  const bw = 90, bh = 6, gap = 4;
  const bx = VW - bw - 8;
  const by = VH - (bh * 3 + gap * 2) - 8;
  drawBar(bx, by,                       bw, bh, player.hp / player.hpMax,               '#e53935', 'HP');
  drawBar(bx, by + bh + gap,            bw, bh, player.stamina / player.staminaMax,     '#fdd835', 'ST');
  drawBar(bx, by + (bh + gap) * 2,      bw, bh, player.thirst / player.thirstMax,       '#29b6f6', 'TH');
}

function drawBar(x, y, w, h, v, color, label) {
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, (w - 2) * v, h - 2);
  ctx.fillStyle = '#fff';
  ctx.font = '7px monospace';
  ctx.fillText(label, x - 16, y - 1);
}

// ---------- Main loop ----------
let lastT = 0, fpsAccum = 0, fpsCount = 0;

function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000) || 0;
  lastT = t;

  update(dt);
  updateCamera();
  render();

  fpsAccum += dt; fpsCount++;
  if (fpsAccum >= 0.5) {
    fps = Math.round(fpsCount / fpsAccum);
    fpsAccum = 0; fpsCount = 0;
  }
  requestAnimationFrame(loop);
}

requestAnimationFrame(t => { lastT = t; loop(t); });