// ===== Логика страницы мира =====

const VW = 480;
const VH = 270;

let worldCfg;
try {
  worldCfg = JSON.parse(localStorage.getItem('wildseed:current') || 'null');
} catch (e) { worldCfg = null; }
if (!worldCfg) {
  worldCfg = {
    name: 'Dev World',
    seed: 'dev' + Math.floor(Math.random() * 1e6),
    size: 1024,
    difficulty: 'normal',
    keepInventory: false,
    isPublic: true,
  };
}

const canvas = document.getElementById('game');
canvas.width  = VW;
canvas.height = VH;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function resize() {
  const scale = Math.min(window.innerWidth / VW, window.innerHeight / VH);
  canvas.style.width  = Math.floor(VW * scale) + 'px';
  canvas.style.height = Math.floor(VH * scale) + 'px';
}
window.addEventListener('resize', resize);
resize();

Input.init(canvas);
Sprites.init();

const world = new World(worldCfg.seed, worldCfg.size);
const spawn = world.findSpawn();

const player = {
  x: spawn.x, y: spawn.y,
  w: 10, h: 12,
  speed: 90,
  dir: 'down',
  animFrame: 0,
  animTime: 0,
  moving: false,
  hp: 10, hpMax: 10,
  stamina: 100, staminaMax: 100,
  thirst: 100, thirstMax: 100,
  strength: 1,
};

const camera = { x: 0, y: 0 };

function collides(x, y) {
  const hw = player.w / 2, hh = player.h / 2;
  return world.isSolidAtPixel(x - hw, y - hh)
      || world.isSolidAtPixel(x + hw, y - hh)
      || world.isSolidAtPixel(x - hw, y + hh)
      || world.isSolidAtPixel(x + hw, y + hh);
}

function update(dt) {
  let dx = 0, dy = 0;
  if (Input.isDown('KeyW') || Input.isDown('ArrowUp'))    dy -= 1;
  if (Input.isDown('KeyS') || Input.isDown('ArrowDown'))  dy += 1;
  if (Input.isDown('KeyA') || Input.isDown('ArrowLeft'))  dx -= 1;
  if (Input.isDown('KeyD') || Input.isDown('ArrowRight')) dx += 1;

  player.moving = !!(dx || dy);

  const sprint = Input.isDown('ShiftLeft') && player.stamina > 0;
  const speed = sprint ? player.speed * 1.6 : player.speed;

  if (sprint && player.moving) {
    player.stamina = Math.max(0, player.stamina - 25 * dt);
  } else {
    player.stamina = Math.min(player.staminaMax, player.stamina + 15 * dt);
  }

  if (player.moving) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    if (Math.abs(dx) > Math.abs(dy)) player.dir = dx < 0 ? 'left' : 'right';
    else                              player.dir = dy < 0 ? 'up'   : 'down';
  }

  const nx = player.x + dx * speed * dt;
  const ny = player.y + dy * speed * dt;
  if (!collides(nx, player.y)) player.x = nx;
  if (!collides(player.x, ny)) player.y = ny;

  if (player.moving) {
    player.animTime += dt * (sprint ? 12 : 8);
    if (player.animTime >= 1) {
      player.animTime -= 1;
      player.animFrame = (player.animFrame + 1) % 4;
    }
  } else {
    player.animFrame = 0;
    player.animTime = 0;
  }
}

function updateCamera() {
  camera.x = player.x - VW / 2;
  camera.y = player.y - VH / 2;
  if (worldCfg.size > 0) {
    const worldPx = worldCfg.size * TILE;
    camera.x = Math.max(0, Math.min(worldPx - VW, camera.x));
    camera.y = Math.max(0, Math.min(worldPx - VH, camera.y));
    if (worldPx < VW) camera.x = (worldPx - VW) / 2;
    if (worldPx < VH) camera.y = (worldPx - VH) / 2;
  }
}

let fps = 0;

const TILE_SPRITE_NAME = ['water', 'sand', 'grass', 'stone', 'snow'];

function render() {
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, VW, VH);

  const tx0 = Math.floor(camera.x / TILE) - 2;
  const ty0 = Math.floor(camera.y / TILE) - 3;
  const tx1 = Math.ceil((camera.x + VW) / TILE) + 1;
  const ty1 = Math.ceil((camera.y + VH) / TILE) + 1;

  // Тайлы
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = world.getTile(tx, ty);
      if (t < 0) continue;
      const spr = Sprites.tileSprite(TILE_SPRITE_NAME[t], tx, ty);
      if (spr) {
        ctx.drawImage(spr,
          Math.floor(tx * TILE - camera.x),
          Math.floor(ty * TILE - camera.y));
      }
    }
  }

  // Декорации + игрок — сортировка по Y
  const drawables = [];
  for (let ty = ty0 - 3; ty <= ty1 + 1; ty++) {
    for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
      const deco = world.getDecoration(tx, ty);
      if (!deco) continue;
      drawables.push({
        y: ty * TILE + TILE,
        kind: 'deco',
        deco, tx, ty,
      });
    }
  }
  drawables.push({ y: player.y + player.h / 2, kind: 'player' });
  drawables.sort((a, b) => a.y - b.y);

  for (const d of drawables) {
    if (d.kind === 'deco') {
      const px = Math.floor(d.tx * TILE - camera.x);
      const py = Math.floor(d.ty * TILE - camera.y);
      if (d.deco === 'tree') {
        ctx.drawImage(Sprites.tree, px - 8, py - 32);
      } else if (d.deco === 'bush') {
        ctx.drawImage(Sprites.bush, px, py);
      } else if (d.deco === 'rock') {
        ctx.drawImage(Sprites.rock, px, py);
      } else if (d.deco === 'flower') {
        const idx = (tileHash(d.tx, d.ty, 55) % Sprites.flowers.length);
        ctx.drawImage(Sprites.flowers[idx], px, py);
      }
    } else {
      const spr = Sprites.player[player.dir][player.animFrame];
      const px = Math.floor(player.x - 8 - camera.x);
      const py = Math.floor(player.y - 14 - camera.y);
      ctx.drawImage(spr, px, py);
    }
  }

  // HUD
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 190, 44);
  ctx.fillStyle = '#fff';
  ctx.font = '8px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`PING: -- ms`, 4, 4);
  ctx.fillText(`FPS:  ${fps}`, 4, 14);
  const ptx = Math.floor(player.x / TILE);
  const pty = Math.floor(player.y / TILE);
  ctx.fillText(`X: ${ptx}  Y: ${pty}`, 4, 24);
  ctx.fillText(`SEED: ${worldCfg.seed}`, 4, 34);

  const bw = 90, bh = 6, gap = 4;
  const bx = VW - bw - 8;
  const by = VH - (bh * 3 + gap * 2) - 8;
  drawBar(bx, by,                  bw, bh, player.hp / player.hpMax,           '#e53935', 'HP');
  drawBar(bx, by + bh + gap,       bw, bh, player.stamina / player.staminaMax, '#fdd835', 'ST');
  drawBar(bx, by + (bh + gap) * 2, bw, bh, player.thirst / player.thirstMax,   '#29b6f6', 'TH');
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
