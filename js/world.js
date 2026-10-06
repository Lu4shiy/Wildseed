// js/world.js
// Шаг 3.5: прыжки (высота 1 блок), ускорение Shift, коллизии с декором,
//          взаимодействие с предметами в хотбаре и инвентаре.
(function () {
  'use strict';

  const TILE = 16;
  const W = 480;
  const H = 270;

  // ------------------ worldCfg ------------------
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
    wood:   { name: 'Wood',   color: '#8a5a2a', max: 99, stackable: true },
    stone:  { name: 'Stone',  color: '#7a7a82', max: 99, stackable: true },
    ore:    { name: 'Ore',    color: '#d8a030', max: 99, stackable: true },
    fiber:  { name: 'Fiber',  color: '#5a9a48', max: 99, stackable: true },
    berry:  { name: 'Berry',  color: '#d04040', max: 99, stackable: true, food: 12 },
    flower: { name: 'Flower', color: '#e84a5f', max: 99, stackable: true }
  };

  const DECOR_DROPS = {
    tree:   { id: 'wood',   count: 3 },
    bush:   { id: 'berry',  count: 2 },
    rock:   { id: 'stone',  count: 2 },
    ore:    { id: 'ore',    count: 2 },
    flower: { id: 'flower', count: 1 }
  };

  // Высота препятствия в тайлах. 1 — можно перепрыгнуть, 2 — нельзя.
  const DECOR_HEIGHT = {
    tree:   2,
    bush:   1,
    rock:   1,
    ore:    1,
    flower: 0
  };

  // Можно ли поставить декор на этот тайл (используется при выбрасывании)
  const PLACEABLE = {
    wood:  'wood',
    stone: 'rock'
  };

  // ------------------ inventory ------------------
  const HOTBAR = 10;
  const INV_COLS = 10;
  const INV_ROWS = 4;
  const INV_SIZE = INV_COLS * INV_ROWS;

  const inventory = {
    hotbar: new Array(HOTBAR).fill(null),
    grid:   new Array(INV_SIZE).fill(null),
    selected: 0,
    open: false,
    drag: null   // { from: 'hotbar'|'grid', index: number, stack: {...} }
  };

  function addItem(id, count) {
    count = count || 1;
    const def = ITEMS[id];
    if (!def) return 0;
    let left = count;

    for (let i = 0; i < HOTBAR && left > 0; i++) {
      const s = inventory.hotbar[i];
      if (s && s.id === id && s.count < def.max) {
        const add = Math.min(def.max - s.count, left);
        s.count += add; left -= add;
      }
    }
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      const s = inventory.grid[i];
      if (s && s.id === id && s.count < def.max) {
        const add = Math.min(def.max - s.count, left);
        s.count += add; left -= add;
      }
    }
    for (let i = 0; i < HOTBAR && left > 0; i++) {
      if (!inventory.hotbar[i]) {
        const add = Math.min(def.max, left);
        inventory.hotbar[i] = { id: id, count: add };
        left -= add;
      }
    }
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      if (!inventory.grid[i]) {
        const add = Math.min(def.max, left);
        inventory.grid[i] = { id: id, count: add };
        left -= add;
      }
    }
    return count - left;
  }

  function getStackAt(area, index) {
    return area === 'hotbar' ? inventory.hotbar[index] : inventory.grid[index];
  }
  function setStackAt(area, index, stack) {
    if (area === 'hotbar') inventory.hotbar[index] = stack;
    else                   inventory.grid[index]   = stack;
  }

  // Обмен/слияние двух стаков
  function swapStacks(aArea, aIdx, bArea, bIdx) {
    const a = getStackAt(aArea, aIdx);
    const b = getStackAt(bArea, bIdx);
    if (!a && !b) return;
    if (a && b && a.id === b.id) {
      const def = ITEMS[a.id];
      const total = a.count + b.count;
      if (total <= def.max) {
        b.count = total;
        setStackAt(aArea, aIdx, null);
        return;
      }
      const moved = def.max - b.count;
      if (moved > 0) {
        b.count = def.max;
        a.count -= moved;
        return;
      }
    }
    setStackAt(aArea, aIdx, b);
    setStackAt(bArea, bIdx, a);
  }

  // ------------------ player ------------------
  const PLAYER_W = 12;   // hitbox
  const PLAYER_H = 12;

  const player = {
    x: 0, y: 0,           // top-left hitbox
    vx: 0, vy: 0,
    z: 0, vz: 0,          // вертикальная позиция (прыжок)
    onGround: true,
    dir: 0,
    frame: 0,
    animTime: 0,
    moving: false,
    speed: 72,
    sprintSpeed: 118,
    hp: 100, maxHp: 100,
    st: 100, maxSt: 100,
    th: 100, maxTh: 100
  };

  // ------------------ camera ------------------
  const camera = { x: 0, y: 0 };

  // ------------------ helpers: tiles ------------------
  function tileAtWorld(wx, wy) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    return { tx: tx, ty: ty, biome: Chunks.getTile(tx, ty, SEED), decor: Chunks.getDecor(tx, ty, SEED) };
  }

  // Препятствие: есть декор с высотой > 0
  function isBlockingTile(tx, ty) {
    const d = Chunks.getDecor(tx, ty, SEED);
    if (!d) return false;
    const h = DECOR_HEIGHT[d.type];
    return typeof h === 'number' && h > 0;
  }

  function isWaterTile(tx, ty) {
    return Chunks.getTile(tx, ty, SEED) === 'water';
  }

  // Проверка AABB игрока против «стенных» тайлов.
  // playerZ — текущая высота прыжка. Если игрок выше высоты препятствия — не блокирует.
  function collides(nx, ny, playerZ) {
    const x0 = Math.floor(nx / TILE);
    const y0 = Math.floor(ny / TILE);
    const x1 = Math.floor((nx + PLAYER_W - 1) / TILE);
    const y1 = Math.floor((ny + PLAYER_H - 1) / TILE);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const d = Chunks.getDecor(tx, ty, SEED);
        if (d) {
          const h = DECOR_HEIGHT[d.type] || 0;
          if (h > 0 && playerZ < h) return true;
        }
        // вода — блокирует, если игрок не в прыжке
        if (isWaterTile(tx, ty) && playerZ < 1) return true;
      }
    }
    return false;
  }

  // Спавн
  (function findSpawn() {
    for (let r = 0; r < 64; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (Chunks.biomeAt(dx, dy, SEED) === 'water') continue;
          if (isBlockingTile(dx, dy)) continue;
          player.x = dx * TILE + (TILE - PLAYER_W) / 2;
          player.y = dy * TILE + (TILE - PLAYER_H) / 2;
          return;
        }
      }
    }
  })();

  // ------------------ mining ------------------
  const MINING_RANGE = 44;
  const MINING_TIME_PER_HP = 0.35;
  let miningTarget = null;
  let miningProgress = 0;

  // ------------------ input ------------------
  Input.attach(canvas);

  function fit() {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
    canvas.style.width  = (W * s) + 'px';
    canvas.style.height = (H * s) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  // ------------------ update ------------------
  const GRAVITY = 420;         // px/sec^2
  const JUMP_VELOCITY = 180;   // px/sec
  const JUMP_HEIGHT_TILES = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY); // ~38.5px = 2.4 тайла

  let wasE = false;
  let wasSpace = false;
  let wasRight = false;
  const wasDigit = new Array(10).fill(false);
  let lastWheel = 0;

  function screenToWorld(sx, sy) {
    return { x: sx + camera.x, y: sy + camera.y };
  }

  function updateMovement(dt) {
    let mx = 0, my = 0;
    if (Input.keys['KeyW'] || Input.keys['ArrowUp'])    my -= 1;
    if (Input.keys['KeyS'] || Input.keys['ArrowDown'])  my += 1;
    if (Input.keys['KeyA'] || Input.keys['ArrowLeft'])  mx -= 1;
    if (Input.keys['KeyD'] || Input.keys['ArrowRight']) mx += 1;

    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }

    const sprinting = (Input.keys['ShiftLeft'] || Input.keys['ShiftRight'])
                      && player.st > 0 && (mx !== 0 || my !== 0);
    const speed = sprinting ? player.sprintSpeed : player.speed;

    // расход стамины при спринте
    if (sprinting) {
      player.st = Math.max(0, player.st - 14 * dt);
    } else {
      player.st = Math.min(player.maxSt, player.st + 8 * dt);
    }

    player.moving = (len > 0) && !inventory.open;

    if (player.moving) {
      if (Math.abs(mx) > Math.abs(my)) player.dir = mx > 0 ? 3 : 2;
      else                             player.dir = my > 0 ? 0 : 1;
      player.animTime += dt * (sprinting ? 1.4 : 1);
      player.frame = Math.floor(player.animTime * 8) % 4;
    } else {
      player.animTime = 0;
      player.frame = 0;
    }

    // Прыжок
    const spaceNow = !!Input.keys['Space'];
    if (spaceNow && !wasSpace && player.onGround && !inventory.open) {
      player.vz = -JUMP_VELOCITY;
      player.onGround = false;
    }
    wasSpace = spaceNow;

    // Гравитация
    if (!player.onGround || player.z > 0 || player.vz !== 0) {
      player.vz += GRAVITY * dt;
      player.z  += player.vz * dt;
      if (player.z >= 0) {
        player.z = 0;
        player.vz = 0;
        player.onGround = true;
      }
    }

    // Движение с коллизиями по осям отдельно
    if (!inventory.open) {
      const dx = mx * speed * dt;
      const dy = my * speed * dt;

      if (dx !== 0) {
        const nx = player.x + dx;
        if (!collides(nx, player.y, player.z / TILE)) player.x = nx;
      }
      if (dy !== 0) {
        const ny = player.y + dy;
        if (!collides(player.x, ny, player.z / TILE)) player.y = ny;
      }
    }
  }

  function updateInventoryToggle() {
    const eNow = !!Input.keys['KeyE'];
    if (eNow && !wasE) inventory.open = !inventory.open;
    wasE = eNow;
    if (Input.keys['Escape'] && inventory.open) {
      inventory.open = false;
      // вернуть перетаскиваемый стак обратно
      if (inventory.drag) {
        const st = inventory.drag.stack;
        if (!getStackAt(inventory.drag.from, inventory.drag.index)) {
          setStackAt(inventory.drag.from, inventory.drag.index, st);
        } else {
          addItem(st.id, st.count);
        }
        inventory.drag = null;
      }
    }

    for (let i = 0; i < 10; i++) {
      const code = i === 9 ? 'Digit0' : ('Digit' + (i + 1));
      const now = !!Input.keys[code];
      if (now && !wasDigit[i]) inventory.selected = i;
      wasDigit[i] = now;
    }

    if (Input.mouse.wheel !== lastWheel && !inventory.open) {
      const dir = Input.mouse.wheel > lastWheel ? 1 : -1;
      inventory.selected = (inventory.selected + dir + HOTBAR) % HOTBAR;
    }
    lastWheel = Input.mouse.wheel;
  }

  // Геометрия слотов для кликов
  function getHudLayout() {
    const slot = 18, gap = 2;
    const totalW = HOTBAR * slot + (HOTBAR - 1) * gap;
    const hx = Math.floor((W - totalW) / 2);
    const hy = H - slot - 6;
    return { slot: slot, gap: gap, hx: hx, hy: hy, totalW: totalW };
  }

  function getInvLayout() {
    const sSize = 22, sGap = 2;
    const panelW = INV_COLS * sSize + (INV_COLS - 1) * sGap + 16;
    const panelH = INV_ROWS * sSize + (INV_ROWS - 1) * sGap + 16 + 22;
    const px = Math.floor((W - panelW) / 2);
    const py = Math.floor((H - panelH) / 2);
    return { sSize: sSize, sGap: sGap, px: px, py: py, panelW: panelW, panelH: panelH };
  }

  function hitTestHotbar(mx, my) {
    const L = getHudLayout();
    for (let i = 0; i < HOTBAR; i++) {
      const x = L.hx + i * (L.slot + L.gap);
      if (mx >= x && mx < x + L.slot && my >= L.hy && my < L.hy + L.slot) {
        return { area: 'hotbar', index: i };
      }
    }
    return null;
  }

  function hitTestInventory(mx, my) {
    if (!inventory.open) return null;
    const L = getInvLayout();
    const gx = L.px + 8;
    const gy = L.py + 22;
    for (let r = 0; r < INV_ROWS; r++) {
      for (let c = 0; c < INV_COLS; c++) {
        const idx = r * INV_COLS + c;
        const x = gx + c * (L.sSize + L.sGap);
        const y = gy + r * (L.sSize + L.sGap);
        if (mx >= x && mx < x + L.sSize && my >= y && my < y + L.sSize) {
          return { area: 'grid', index: idx };
        }
      }
    }
    return null;
  }

  function hitTestAnySlot(mx, my) {
    return hitTestHotbar(mx, my) || hitTestInventory(mx, my);
  }

  // Взаимодействие с предметом: ЛКМ — взять/положить/переставить, ПКМ — использовать/разделить
  function handleInventoryClick() {
    const mx = Input.mouse.x;
    const my = Input.mouse.y;

    // Клик по хотбару (в т.ч. когда инвентарь закрыт — просто выбор слота)
    const hotHit = hitTestHotbar(mx, my);
    const invHit = hitTestInventory(mx, my);
    const hit = invHit || hotHit;

    if (!hit) return;

    // Если инвентарь закрыт — клик по хотбару только выбирает слот
    if (!inventory.open) {
      if (hotHit) inventory.selected = hotHit.index;
      return;
    }

    // ---- Сначала: если есть drag-стак ----
    if (inventory.drag) {
      const drag = inventory.drag;
      const target = getStackAt(hit.area, hit.index);

      if (!target) {
        // положить всё
        setStackAt(hit.area, hit.index, drag.stack);
        setStackAt(drag.from, drag.index, null);
        inventory.drag = null;
        return;
      }

      if (target.id === drag.stack.id) {
        const def = ITEMS[target.id];
        if (Input.mouse.right) {
          // ПКМ: положить один
          if (target.count < def.max) {
            target.count += 1;
            drag.stack.count -= 1;
            if (drag.stack.count <= 0) {
              setStackAt(drag.from, drag.index, null);
              inventory.drag = null;
            }
          }
        } else {
          // ЛКМ: слить
          const total = target.count + drag.stack.count;
          if (total <= def.max) {
            target.count = total;
            setStackAt(drag.from, drag.index, null);
            inventory.drag = null;
          } else {
            const moved = def.max - target.count;
            target.count = def.max;
            drag.stack.count -= moved;
          }
        }
        return;
      }

      // Разные предметы — обмен
      const tmpFrom = getStackAt(drag.from, drag.index);
      setStackAt(drag.from, drag.index, target);
      setStackAt(hit.area, hit.index, drag.stack);
      inventory.drag = tmpFrom;
      return;
    }

    // ---- drag отсутствует ----
    const stack = getStackAt(hit.area, hit.index);
    if (!stack) return;

    if (Input.mouse.right) {
      // ПКМ без drag — использовать предмет
      useItem(hit.area, hit.index);
      return;
    }

    // ЛКМ — взять стак (или половину, если Shift)
    if (Input.keys['ShiftLeft'] || Input.keys['ShiftRight']) {
      const half = Math.ceil(stack.count / 2);
      inventory.drag = {
        from: hit.area,
        index: hit.index,
        stack: { id: stack.id, count: half }
      };
      stack.count -= half;
      if (stack.count <= 0) setStackAt(hit.area, hit.index, null);
    } else {
      inventory.drag = { from: hit.area, index: hit.index, stack: stack };
      setStackAt(hit.area, hit.index, null);
    }
  }

  // Использование предмета ПКМ
  function useItem(area, index) {
    const stack = getStackAt(area, index);
    if (!stack) return;
    const def = ITEMS[stack.id];

    // 1) Еда
    if (def && def.food) {
      player.th = Math.min(player.maxTh, player.th + def.food);
      player.hp = Math.min(player.maxHp, player.hp + Math.floor(def.food * 0.25));
      stack.count -= 1;
      if (stack.count <= 0) setStackAt(area, index, null);
      return;
    }

    // 2) Установка блока (wood -> дерево, stone -> камень)
    if (PLACEABLE[stack.id]) {
      const w = screenToWorld(Input.mouse.x, Input.mouse.y);
      const tx = Math.floor(w.x / TILE);
      const ty = Math.floor(w.y / TILE);

      // не ставить рядом с игроком
      const ptx0 = Math.floor(player.x / TILE);
      const pty0 = Math.floor(player.y / TILE);
      const ptx1 = Math.floor((player.x + PLAYER_W - 1) / TILE);
      const pty1 = Math.floor((player.y + PLAYER_H - 1) / TILE);
      const onPlayer = tx >= ptx0 && tx <= ptx1 && ty >= pty0 && ty <= pty1;
      if (onPlayer) return;

      const dist = Math.hypot(tx * TILE + 8 - (player.x + PLAYER_W / 2),
                              ty * TILE + 8 - (player.y + PLAYER_H / 2));
      if (dist > 56) return;

      if (Chunks.getDecor(tx, ty, SEED)) return;
      if (isWaterTile(tx, ty)) return;

      Chunks.setDecor(tx, ty, SEED, {
        type: PLACEABLE[stack.id],
        hp: stack.id === 'wood' ? 5 : 6,
        maxHp: stack.id === 'wood' ? 5 : 6
      });
      stack.count -= 1;
      if (stack.count <= 0) setStackAt(area, index, null);
      return;
    }
  }

  function updateMining(dt) {
    if (inventory.open || !Input.mouse.left || inventory.drag) {
      miningTarget = null;
      miningProgress = 0;
      return;
    }

    // Клик по слоту — не добыча
    if (hitTestHotbar(Input.mouse.x, Input.mouse.y)) {
      miningTarget = null;
      miningProgress = 0;
      return;
    }

    const w = screenToWorld(Input.mouse.x, Input.mouse.y);
    const tx = Math.floor(w.x / TILE);
    const ty = Math.floor(w.y / TILE);
    const d = Chunks.getDecor(tx, ty, SEED);

    if (!d) { miningTarget = null; miningProgress = 0; return; }

    const dx = (tx * TILE + 8) - (player.x + PLAYER_W / 2);
    const dy = (ty * TILE + 8) - (player.y + PLAYER_H / 2);
    if (dx * dx + dy * dy > MINING_RANGE * MINING_RANGE) {
      miningTarget = null; miningProgress = 0; return;
    }

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

  function update(dt) {
    updateInventoryToggle();

    // Клик по слотам (обрабатываем только по нажатию)
    if (Input.mouse.leftPressed || (Input.mouse.rightPressed && inventory.open)) {
      const hit = hitTestAnySlot(Input.mouse.x, Input.mouse.y);
      if (hit) {
        handleInventoryClick();
        Input.mouse.leftPressed = false;
        Input.mouse.rightPressed = false;
      }
    }

    updateMovement(dt);
    updateMining(dt);

    // камера
    camera.x = player.x + PLAYER_W / 2 - W / 2;
    camera.y = player.y + PLAYER_H / 2 - H / 2;

    // голод/жажда — минимальный дрейф (будет расширено на шаге 6)
    player.th = Math.max(0, player.th - 0.4 * dt);
  }

  // ------------------ render ------------------
  let fpsAcc = 0, fpsCount = 0, fps = 0;
  const ping = 0;

  function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const startX = Math.floor(camera.x / TILE) - 1;
    const startY = Math.floor(camera.y / TILE) - 1;
    const endX   = Math.ceil((camera.x + W) / TILE) + 1;
    const endY   = Math.ceil((camera.y + H) / TILE) + 1;

    // земля
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const b = Chunks.getTile(tx, ty, SEED);
        const img = Sprites.getTile(b);
        const sx = Math.round(tx * TILE - camera.x);
        const sy = Math.round(ty * TILE - camera.y);
        ctx.drawImage(img, sx, sy);
      }
    }

    // сортировка по Y (декор + игрок + hovered)
    const drawList = [];
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const d = Chunks.getDecor(tx, ty, SEED);
        if (!d) continue;
        drawList.push({ kind: 'decor', tx: tx, ty: ty, d: d, baseY: ty * TILE + TILE });
      }
    }
    drawList.push({
      kind: 'player',
      baseY: player.y + PLAYER_H - player.z
    });
    drawList.sort(function (a, b) { return a.baseY - b.baseY; });

    for (let i = 0; i < drawList.length; i++) {
      const it = drawList[i];
      if (it.kind === 'player') {
        const px = Math.round(player.x - camera.x - (TILE - PLAYER_W) / 2);
        const py = Math.round(player.y - camera.y - (TILE - PLAYER_H) - player.z);
        Sprites.drawPlayer(ctx, px, py, player.dir, player.frame);
        if (player.z > 0) {
          // тень
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(player.x + PLAYER_W / 2 - camera.x,
                      player.y + PLAYER_H - camera.y,
                      6, 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const img = Sprites.getDecor(it.d.type);
        if (!img) continue;
        const sx = Math.round(it.tx * TILE - camera.x + 8 - img.width / 2);
        const sy = Math.round(it.ty * TILE - camera.y + TILE - img.height);
        ctx.drawImage(img, sx, sy);

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

    // подсветка тайла под курсором
    if (!inventory.open) {
      const w = screenToWorld(Input.mouse.x, Input.mouse.y);
      const tx = Math.floor(w.x / TILE);
      const ty = Math.floor(w.y / TILE);
      const sx = Math.round(tx * TILE - camera.x);
      const sy = Math.round(ty * TILE - camera.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
    }

    drawHUD();

    // drag-стак поверх всего
    if (inventory.drag) {
      drawSlotContent(inventory.drag.stack, Input.mouse.x - 9, Input.mouse.y - 9, 18);
    }
  }

  function drawHUD() {
    ctx.textBaseline = 'top';

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

    drawBar(8, H - 48, 84, 8, player.hp / player.maxHp, '#e04040', 'HP');
    drawBar(8, H - 36, 84, 8, player.st / player.maxSt, '#40c0e0', 'ST');
    drawBar(8, H - 24, 84, 8, player.th / player.maxTh, '#40b0f0', 'TH');

    const L = getHudLayout();
    for (let i = 0; i < HOTBAR; i++) {
      const x = L.hx + i * (L.slot + L.gap);
      const sel = i === inventory.selected;
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, L.hy, L.slot, L.slot);
      ctx.strokeStyle = sel ? '#f9d54f' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, L.hy + 0.5, L.slot - 1, L.slot - 1);

      // если этот стак сейчас в drag — не рисуем
      const isDragged = inventory.drag &&
                        inventory.drag.from === 'hotbar' &&
                        inventory.drag.index === i;
      if (!isDragged) drawSlotContent(inventory.hotbar[i], x, L.hy, L.slot);

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '6px monospace';
      ctx.fillText(String((i + 1) % 10), x + 2, L.hy + 2);
    }

    if (inventory.open) drawInventoryPanel();
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
    const L = getInvLayout();
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(L.px, L.py, L.panelW, L.panelH);
    ctx.strokeStyle = '#f9d54f';
    ctx.lineWidth = 1;
    ctx.strokeRect(L.px + 0.5, L.py + 0.5, L.panelW - 1, L.panelH - 1);

    ctx.fillStyle = '#f9d54f';
    ctx.font = '8px monospace';
    ctx.fillText('INVENTORY  (E — закрыть | ЛКМ — взять/положить | Shift+ЛКМ — половина | ПКМ — использовать)', L.px + 8, L.py + 6);

    const gx = L.px + 8;
    const gy = L.py + 22;

    for (let r = 0; r < INV_ROWS; r++) {
      for (let c = 0; c < INV_COLS; c++) {
        const idx = r * INV_COLS + c;
        const x = gx + c * (L.sSize + L.sGap);
        const y = gy + r * (L.sSize + L.sGap);

        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, y, L.sSize, L.sSize);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.strokeRect(x + 0.5, y + 0.5, L.sSize - 1, L.sSize - 1);

        const isDragged = inventory.drag &&
                          inventory.drag.from === 'grid' &&
                          inventory.drag.index === idx;
        if (!isDragged) drawSlotContent(inventory.grid[idx], x, y, L.sSize);
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
