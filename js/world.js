// js/world.js
// Шаг 3: добыча ресурсов (ЛКМ) + инвентарь (хотбар 10 + сетка 10×4 = 50, открытие на E).
(function () {
  'use strict';

  const TILE = 16;
  const W = 480;
  const H = 270;

  // ------------------ worldCfg (fallback, если localStorage пуст) ------------------
  let worldCfg = {
    seed: 12345,
    name: 'World',
    size: 512,
    difficulty: 'Normal',
    keepInventory: false
  };
  try {
    const s = localStorage.getItem('wildseed.worldCfg');
    if (s) worldCfg = Object.assign(worldCfg, JSON.parse(s));
  } catch (e) { /* ignore */ }

  const SEED = (parseInt(worldCfg.seed, 10) | 0) || 12345;

  // ------------------ canvas ------------------
  const canvas = document.getElementById('game');
  if (!canvas) { console.error('[world] canvas #game not found'); return; }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  if (!window.Sprites) {
    console.error('[world] window.Sprites is undefined — проверь порядок <script> в world.html');
    return;
  }
  Sprites.init();

  // ------------------ items ------------------
  const ITEMS = {
    wood:   { name: 'Wood',   color: '#8a5a2a', max: 99 },
    stone:  { name: 'Stone',  color: '#7a7a82', max: 99 },
    ore:    { name: 'Ore',    color: '#d8a030', max: 99 },
    fiber:  { name: 'Fiber',  color: '#5a9a48', max: 99 },
    berry:  { name: 'Berry',  color: '#d04040', max: 99 },
    flower: { name: 'Flower', color: '#e84a5f', max: 99 }
  };

  const DECOR_DROPS = {
    tree:   { id: 'wood',   count: 3 },
    bush:   { id: 'berry',  count: 2 },
    rock:   { id: 'stone',  count: 2 },
    ore:    { id: 'ore',    count: 2 },
    flower: { id: 'flower', count: 1 }
  };

  // ------------------ inventory ------------------
  const HOTBAR = 10;
  const INV_COLS = 10;
  const INV_ROWS = 4;
  const INV_SIZE = INV_COLS * INV_ROWS; // 50

  const inventory = {
    hotbar: new Array(HOTBAR).fill(null),
    grid:   new Array(INV_SIZE).fill(null),
    selected: 0,
    open: false
  };

  function addItem(id, count) {
    count = count || 1;
    const def = ITEMS[id];
    if (!def) return 0;
    let left = count;

    // 1) докладываем в существующие стаки хотбара
    for (let i = 0; i < HOTBAR && left > 0; i++) {
      const s = inventory.hotbar[i];
      if (s && s.id === id && s.count < def.max) {
        const add = Math.min(def.max - s.count, left);
        s.count += add; left -= add;
      }
    }
    // 2) то же для сетки
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      const s = inventory.grid[i];
      if (s && s.id === id && s.count < def.max) {
        const add = Math.min(def.max - s.count, left);
        s.count += add; left -= add;
      }
    }
    // 3) новые стаки: сначала хотбар
    for (let i = 0; i < HOTBAR && left > 0; i++) {
      if (!inventory.hotbar[i]) {
        const add = Math.min(def.max, left);
        inventory.hotbar[i] = { id: id, count: add };
        left -= add;
      }
    }
    // 4) потом сетка
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      if (!inventory.grid[i]) {
        const add = Math.min(def.max, left);
        inventory.grid[i] = { id: id, count: add };
        left -= add;
      }
    }
    return count - left;
  }

  // ------------------ player ------------------
  const player = {
    x: 0, y: 0,
    dir: 0,               // 0=down 1=up 2=left 3=right
    frame: 0,
    animTime: 0,
    moving: false,
    speed: 72,            // px/sec
    hp: 100, maxHp: 100,
    st: 100, maxSt: 100,
    th: 100, maxTh: 100
  };

  (function findSpawn() {
    for (let r = 0; r < 48; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (Chunks.biomeAt(dx, dy, SEED) !== 'water') {
            player.x = dx * TILE;
            player.y = dy * TILE;
            return;
          }
        }
      }
    }
  })();

  // ------------------ camera ------------------
  const camera = { x: 0, y: 0 };

  // ------------------ mining ------------------
  const MINING_RANGE = 44; // px
  const MINING_TIME_PER_HP = 0.35; // сек на 1 hp
  let miningTarget = null;         // {tx, ty}
  let miningProgress = 0;

  // ------------------ input ------------------
  Input.attach(canvas);

  // ------------------ fit canvas (CSS) ------------------
  function fit() {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
    canvas.style.width  = (W * s) + 'px';
    canvas.style.height = (H * s) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  // ------------------ update ------------------
  let wasE = false;
  const wasDigit = new Array(10).fill(false);
  let lastWheel = 0;

  function screenToWorld(sx, sy) {
    return { x: sx + camera.x, y: sy + camera.y };
  }

  function update(dt) {
    // ---- движение ----
    let mx = 0, my = 0;
    if (Input.keys['KeyW'] || Input.keys['ArrowUp'])    my -= 1;
    if (Input.keys['KeyS'] || Input.keys['ArrowDown'])  my += 1;
    if (Input.keys['KeyA'] || Input.keys['ArrowLeft'])  mx -= 1;
    if (Input.keys['KeyD'] || Input.keys['ArrowRight']) mx += 1;

    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }

    const sprinting = Input.keys['ShiftLeft'] || Input.keys['ShiftRight'];
    const speed = player.speed * (sprinting ? 1.6 : 1);

    // если открыт инвентарь — блокируем движение
    if (!inventory.open) {
      player.x += mx * speed * dt;
      player.y += my * speed * dt;
    }
    player.moving = (len > 0) && !inventory.open;

    if (player.moving) {
      if (Math.abs(mx) > Math.abs(my)) player.dir = mx > 0 ? 3 : 2;
      else                             player.dir = my > 0 ? 0 : 1;
      player.animTime += dt;
      player.frame = Math.floor(player.animTime * 8) % 4;
    } else {
      player.animTime = 0;
      player.frame = 0;
    }

    // ---- камера ----
    camera.x = player.x + 8 - W / 2;
    camera.y = player.y + 8 - H / 2;

    // ---- открытие/закрытие инвентаря ----
    const eNow = !!Input.keys['KeyE'];
    if (eNow && !wasE) inventory.open = !inventory.open;
    wasE = eNow;
    if (Input.keys['Escape'] && inventory.open) inventory.open = false;

    // ---- выбор слота хотбара (1..9,0) ----
    for (let i = 0; i < 10; i++) {
      const code = i === 9 ? 'Digit0' : ('Digit' + (i + 1));
      const now = !!Input.keys[code];
      if (now && !wasDigit[i]) inventory.selected = i;
      wasDigit[i] = now;
    }

    // ---- колесо мыши ----
    if (Input.mouse.wheel !== lastWheel && !inventory.open) {
      const dir = Input.mouse.wheel > lastWheel ? 1 : -1;
      inventory.selected = (inventory.selected + dir + HOTBAR) % HOTBAR;
    }
    lastWheel = Input.mouse.wheel;

    // ---- добыча ЛКМ ----
    if (inventory.open || !Input.mouse.left) {
      miningTarget = null;
      miningProgress = 0;
    } else {
      const w = screenToWorld(Input.mouse.x, Input.mouse.y);
      const tx = Math.floor(w.x / TILE);
      const ty = Math.floor(w.y / TILE);
      const d = Chunks.getDecor(tx, ty, SEED);

      if (!d) {
        miningTarget = null;
        miningProgress = 0;
      } else {
        const dx = (tx * TILE + 8) - (player.x + 8);
        const dy = (ty * TILE + 8) - (player.y + 8);
        if (dx * dx + dy * dy > MINING_RANGE * MINING_RANGE) {
          miningTarget = null;
          miningProgress = 0;
        } else {
          if (!miningTarget || miningTarget.tx !== tx || miningTarget.ty !== ty) {
            miningTarget = { tx: tx, ty: ty };
            miningProgress = 0;
          }
          miningProgress += dt;
          const need = MINING_TIME_PER_HP * (d.maxHp || 3);
          if (miningProgress >= need) {
            const drop = DECOR_DROPS[d.type];
            if (drop) addItem(drop.id, drop.count);
            Chunks.setDecor(tx, ty, SEED, null);
            miningTarget = null;
            miningProgress = 0;
          }
        }
      }
    }
  }

  // ------------------ render ------------------
  let fpsAcc = 0, fpsCount = 0, fps = 0;
  const ping = 0; // TODO: замер в мультиплеере

  function render() {
    // фон (чёрный — если чанк пуст, будет видно)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const startX = Math.floor(camera.x / TILE) - 1;
    const startY = Math.floor(camera.y / TILE) - 1;
    const endX   = Math.ceil((camera.x + W) / TILE) + 1;
    const endY   = Math.ceil((camera.y + H) / TILE) + 1;

    // ---- земля ----
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const b = Chunks.getTile(tx, ty, SEED);
        const img = Sprites.getTile(b);
        const sx = Math.round(tx * TILE - camera.x);
        const sy = Math.round(ty * TILE - camera.y);
        ctx.drawImage(img, sx, sy);
      }
    }

    // ---- декор + игрок: Y-сортировка ----
    const drawList = [];
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const d = Chunks.getDecor(tx, ty, SEED);
        if (!d) continue;
        // "низ" спрайта для сортировки = низ тайла
        drawList.push({ kind: 'decor', tx: tx, ty: ty, d: d, baseY: ty * TILE + TILE });
      }
    }
    drawList.push({ kind: 'player', baseY: player.y + 16 });
    drawList.sort(function (a, b) { return a.baseY - b.baseY; });

    for (let i = 0; i < drawList.length; i++) {
      const it = drawList[i];
      if (it.kind === 'player') {
        Sprites.drawPlayer(ctx, player.x - camera.x, player.y - camera.y, player.dir, player.frame);
      } else {
        const img = Sprites.getDecor(it.d.type);
        if (!img) continue;
        const sx = Math.round(it.tx * TILE - camera.x + 8 - img.width  / 2);
        const sy = Math.round(it.ty * TILE - camera.y + TILE - img.height);
        ctx.drawImage(img, sx, sy);

        // прогресс добычи
        if (miningTarget && miningTarget.tx === it.tx && miningTarget.ty === it.ty) {
          const need = MINING_TIME_PER_HP * (it.d.maxHp || 3);
          const p = Math.min(1, miningProgress / need);
          const barW = 12;
          const bx = Math.round(it.tx * TILE - camera.x + 2);
          const by = Math.round(it.ty * TILE - camera.y - 5);
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(bx, by, barW, 2);
          ctx.fillStyle = '#f9d54f';
          ctx.fillRect(bx, by, Math.max(1, Math.round(barW * p)), 2);
        }
      }
    }

    drawHUD();
  }

  // ------------------ HUD ------------------
  function drawHUD() {
    ctx.textBaseline = 'top';

    // PING / FPS / X / Y / SEED
    const lines = [
      'PING ' + ping + 'ms',
      'FPS  ' + fps,
      'X ' + Math.round(player.x) + '  Y ' + Math.round(player.y),
      'SEED ' + SEED
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(4, 4, 110, lines.length * 10 + 6);
    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 8, 7 + i * 10);
    }

    // Полоски HP / ST / TH
    drawBar(8, H - 48, 84, 8, player.hp / player.maxHp, '#e04040', 'HP');
    drawBar(8, H - 36, 84, 8, player.st / player.maxSt, '#40c0e0', 'ST');
    drawBar(8, H - 24, 84, 8, player.th / player.maxTh, '#40b0f0', 'TH');

    // Хотбар
    const slot = 18, gap = 2;
    const totalW = HOTBAR * slot + (HOTBAR - 1) * gap;
    const hx = Math.floor((W - totalW) / 2);
    const hy = H - slot - 6;

    for (let i = 0; i < HOTBAR; i++) {
      const x = hx + i * (slot + gap);
      const sel = i === inventory.selected;
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, hy, slot, slot);
      ctx.strokeStyle = sel ? '#f9d54f' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, hy + 0.5, slot - 1, slot - 1);

      drawSlotContent(inventory.hotbar[i], x, hy, slot);

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '6px monospace';
      ctx.fillText(String((i + 1) % 10), x + 2, hy + 2);
    }

    // Инвентарь
    if (inventory.open) {
      drawInventoryPanel();
    }
  }

  function drawBar(x, y, w, h, p, color, label) {
    p = Math.max(0, Math.min(1, p));
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * p), h - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#fff';
    ctx.font = '6px monospace';
    ctx.fillText(label, x + 2, y + h + 1);
  }

  function drawSlotContent(s, x, y, size) {
    if (!s) return;
    const def = ITEMS[s.id];
    if (!def) return;
    const pad = 3;
    ctx.fillStyle = def.color;
    ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad + 0.5, y + pad + 0.5, size - pad * 2 - 1, size - pad * 2 - 1);

    if (s.count > 1) {
      ctx.fillStyle = '#fff';
      ctx.font = '7px monospace';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(s.count), x + size - 3 - String(s.count).length * 5, y + size - 2);
      ctx.textBaseline = 'top';
    }
  }

  function drawInventoryPanel() {
    const sSize = 22, sGap = 2;
    const panelW = INV_COLS * sSize + (INV_COLS - 1) * sGap + 16;
    const panelH = INV_ROWS * sSize + (INV_ROWS - 1) * sGap + 16 + 22;
    const px = Math.floor((W - panelW) / 2);
    const py = Math.floor((H - panelH) / 2);

    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = '#f9d54f';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);

    ctx.fillStyle = '#f9d54f';
    ctx.font = '8px monospace';
    ctx.fillText('INVENTORY  (E — закрыть)', px + 8, py + 6);

    const gx = px + 8;
    const gy = py + 22;

    for (let r = 0; r < INV_ROWS; r++) {
      for (let c = 0; c < INV_COLS; c++) {
        const idx = r * INV_COLS + c;
        const x = gx + c * (sSize + sGap);
        const y = gy + r * (sSize + sGap);

        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, y, sSize, sSize);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.strokeRect(x + 0.5, y + 0.5, sSize - 1, sSize - 1);

        drawSlotContent(inventory.grid[idx], x, y, sSize);
      }
    }
  }

  // ------------------ main loop ------------------
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    update(dt);
    render();
    Input.endFrame();

    fpsAcc += dt; fpsCount++;
    if (fpsAcc >= 0.5) {
      fps = Math.round(fpsCount / fpsAcc);
      fpsAcc = 0;
      fpsCount = 0;
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
