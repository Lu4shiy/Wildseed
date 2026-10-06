// js/world.js
// Изометрия + прыжки (вверх) + Shift/Ctrl-спринт + коллизии + инвентарь.
(function () {
  'use strict';

  const TILE_W = 32;
  const TILE_H = 16;
  const W = 480;
  const H = 270;

  // ---------------- worldCfg ----------------
  let worldCfg = { seed: 12345, name: 'World', size: 512, difficulty: 'Normal', keepInventory: false };
  try {
    const s = localStorage.getItem('wildseed.worldCfg');
    if (s) worldCfg = Object.assign(worldCfg, JSON.parse(s));
  } catch (e) {}
  const SEED = (parseInt(worldCfg.seed, 10) | 0) || 12345;

  // ---------------- canvas ----------------
  const canvas = document.getElementById('game');
  if (!canvas) { console.error('[world] canvas #game not found'); return; }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = 'top';

  if (!window.Sprites) { console.error('[world] Sprites not loaded'); return; }
  Sprites.init();

  // ---------------- items ----------------
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
  const DECOR_HEIGHT = { tree: 2, bush: 1, rock: 1, ore: 1, flower: 0 };
  const PLACEABLE    = { wood: 'tree', stone: 'rock' };

  // ---------------- inventory ----------------
  const HOTBAR   = 10;
  const INV_COLS = 10;
  const INV_ROWS = 4;
  const INV_SIZE = INV_COLS * INV_ROWS;

  const inventory = {
    hotbar: new Array(HOTBAR).fill(null),
    grid:   new Array(INV_SIZE).fill(null),
    selected: 0,
    open: false,
    drag: null
  };

  function addItem(id, count) {
    count = count || 1;
    const def = ITEMS[id]; if (!def) return 0;
    let left = count;
    for (let i = 0; i < HOTBAR && left > 0; i++) {
      const s = inventory.hotbar[i];
      if (s && s.id === id && s.count < def.max) {
        const a = Math.min(def.max - s.count, left); s.count += a; left -= a;
      }
    }
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      const s = inventory.grid[i];
      if (s && s.id === id && s.count < def.max) {
        const a = Math.min(def.max - s.count, left); s.count += a; left -= a;
      }
    }
    for (let i = 0; i < HOTBAR && left > 0; i++) {
      if (!inventory.hotbar[i]) {
        const a = Math.min(def.max, left);
        inventory.hotbar[i] = { id: id, count: a }; left -= a;
      }
    }
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      if (!inventory.grid[i]) {
        const a = Math.min(def.max, left);
        inventory.grid[i] = { id: id, count: a }; left -= a;
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

  // ---------------- player ----------------
  const PLAYER_R_TILE = 0.35;
  const GRAVITY       = 450;    // px/сек², тянет ВНИЗ (уменьшает z)
  const JUMP_VELOCITY = 150;    // px/сек вверх, макс. высота ≈ 25 px ≈ 1.5 тайла
  const SPEED_WALK    = 80;
  const SPEED_SPRINT  = 128;

  const player = {
    tx: 0, ty: 0,
    z: 0, vz: 0, onGround: true,   // z > 0 — над землёй
    dir: 0, frame: 0, animTime: 0, moving: false,
    hp: 100, maxHp: 100,
    st: 100, maxSt: 100,
    th: 100, maxTh: 100
  };

  // ---------------- camera ----------------
  const camera = { x: 0, y: 0 };

  // ---------------- проекции ----------------
  function worldToScreen(wx, wy) {
    return {
      x: (wx - wy) * (TILE_W / 2),
      y: (wx + wy) * (TILE_H / 2)
    };
  }
  function screenToWorld(sx, sy) {
    const wx = sx + camera.x;
    const wy = sy + camera.y;
    const a = wx / (TILE_W / 2);
    const b = wy / (TILE_H / 2);
    return { tx: (a + b) / 2, ty: (b - a) / 2 };
  }

  // ---------------- коллизии ----------------
  // zTiles — высота игрока над землёй в тайлах
  function collides(nx, ny, zTiles) {
    const cx = Math.round(nx);
    const cy = Math.round(ny);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = cx + dx, ty = cy + dy;
        const ddx = nx - tx, ddy = ny - ty;
        if (ddx * ddx + ddy * ddy > 0.85 * 0.85) continue;
        const d = Chunks.getDecor(tx, ty, SEED);
        if (d) {
          const h = DECOR_HEIGHT[d.type] || 0;
          if (h > 0 && zTiles < h) return true;
        }
        if (Chunks.getTile(tx, ty, SEED) === 'water' && zTiles < 1) return true;
      }
    }
    return false;
  }

  // ---------------- spawn ----------------
  (function findSpawn() {
    for (let r = 0; r < 80; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (Chunks.biomeAt(dx, dy, SEED) === 'water') continue;
          if (collides(dx, dy, 0)) continue;
          player.tx = dx; player.ty = dy;
          return;
        }
      }
    }
  })();

  // ---------------- mining ----------------
  const MINING_RANGE       = 2.4;
  const MINING_TIME_PER_HP = 0.35;
  let miningTarget = null;
  let miningProgress = 0;

  // ---------------- input ----------------
  Input.attach(canvas);

  function fit() {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
    canvas.style.width  = (W * s) + 'px';
    canvas.style.height = (H * s) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  // ---------------- update ----------------
  let wasE = false, wasSpace = false;
  const wasDigit = new Array(10).fill(false);
  let lastWheel = 0;

  function updateMovement(dt) {
    let sx = 0, sy = 0;
    if (Input.keys['KeyW'] || Input.keys['ArrowUp'])    sy -= 1;
    if (Input.keys['KeyS'] || Input.keys['ArrowDown'])  sy += 1;
    if (Input.keys['KeyA'] || Input.keys['ArrowLeft'])  sx -= 1;
    if (Input.keys['KeyD'] || Input.keys['ArrowRight']) sx += 1;

    const len = Math.hypot(sx, sy);
    if (len > 0) { sx /= len; sy /= len; }

    // Shift ИЛИ Ctrl — ускорение
    const sprintKey = Input.keys['ShiftLeft'] || Input.keys['ShiftRight']
                   || Input.keys['ControlLeft'] || Input.keys['ControlRight'];
    const sprinting = sprintKey && player.st > 0 && len > 0;
    const screenSpeed = sprinting ? SPEED_SPRINT : SPEED_WALK;

    if (sprinting) player.st = Math.max(0, player.st - 14 * dt);
    else           player.st = Math.min(player.maxSt, player.st + 8 * dt);

    player.moving = len > 0 && !inventory.open;

    if (player.moving) {
      if (Math.abs(sy) >= Math.abs(sx)) player.dir = sy > 0 ? 1 : 0;
      else                              player.dir = sx > 0 ? 3 : 2;
      player.animTime += dt * (sprinting ? 1.5 : 1);
      player.frame = Math.floor(player.animTime * 8) % 4;
    } else {
      player.animTime = 0;
      player.frame = 0;
    }

    // Прыжок: vz > 0 = вверх
    const sp = !!Input.keys['Space'];
    if (sp && !wasSpace && player.onGround && !inventory.open) {
      player.vz = JUMP_VELOCITY;
      player.onGround = false;
    }
    wasSpace = sp;

    // Гравитация: всегда тянет вниз (уменьшает vz, потом z)
    if (!player.onGround || player.z > 0 || player.vz !== 0) {
      player.vz -= GRAVITY * dt;
      player.z  += player.vz * dt;
      if (player.z <= 0) {
        player.z = 0;
        player.vz = 0;
        player.onGround = true;
      }
    }

    // Движение с коллизиями по осям в мире
    if (!inventory.open && len > 0) {
      const dScreenX = sx * screenSpeed * dt;
      const dScreenY = sy * screenSpeed * dt;
      const dtx = ( dScreenX / (TILE_W / 2) + dScreenY / (TILE_H / 2)) / 2;
      const dty = (-dScreenX / (TILE_W / 2) + dScreenY / (TILE_H / 2)) / 2;

      const zTiles = player.z / TILE_H;
      const ntx = player.tx + dtx;
      if (!collides(ntx, player.ty, zTiles)) player.tx = ntx;
      const nty = player.ty + dty;
      if (!collides(player.tx, nty, zTiles)) player.ty = nty;
    }
  }

  function updateInventoryToggle() {
    const eNow = !!Input.keys['KeyE'];
    if (eNow && !wasE) inventory.open = !inventory.open;
    wasE = eNow;
    if (Input.keys['Escape'] && inventory.open) {
      inventory.open = false;
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

  // ---------------- HUD layout ----------------
  function getHudLayout() {
    const slot = 18, gap = 2;
    const totalW = HOTBAR * slot + (HOTBAR - 1) * gap;
    const hx = Math.floor((W - totalW) / 2);
    const hy = H - slot - 6;
    return { slot, gap, hx, hy, totalW };
  }
  function getInvLayout() {
    const sSize = 22, sGap = 2;
    const panelW = INV_COLS * sSize + (INV_COLS - 1) * sGap + 16;
    const panelH = INV_ROWS * sSize + (INV_ROWS - 1) * sGap + 16 + 22;
    const px = Math.floor((W - panelW) / 2);
    const py = Math.floor((H - panelH) / 2);
    return { sSize, sGap, px, py, panelW, panelH };
  }
  function hitTestHotbar(mx, my) {
    const L = getHudLayout();
    for (let i = 0; i < HOTBAR; i++) {
      const x = L.hx + i * (L.slot + L.gap);
      if (mx >= x && mx < x + L.slot && my >= L.hy && my < L.hy + L.slot)
        return { area: 'hotbar', index: i };
    }
    return null;
  }
  function hitTestInventory(mx, my) {
    if (!inventory.open) return null;
    const L = getInvLayout();
    const gx = L.px + 8, gy = L.py + 22;
    for (let r = 0; r < INV_ROWS; r++) for (let c = 0; c < INV_COLS; c++) {
      const idx = r * INV_COLS + c;
      const x = gx + c * (L.sSize + L.sGap);
      const y = gy + r * (L.sSize + L.sGap);
      if (mx >= x && mx < x + L.sSize && my >= y && my < y + L.sSize)
        return { area: 'grid', index: idx };
    }
    return null;
  }
  function hitTestAnySlot(mx, my) {
    return hitTestHotbar(mx, my) || hitTestInventory(mx, my);
  }

  function handleInventoryClick() {
    const mx = Input.mouse.x, my = Input.mouse.y;
    const hotHit = hitTestHotbar(mx, my);
    const invHit = hitTestInventory(mx, my);
    const hit = invHit || hotHit;
    if (!hit) return;

    if (!inventory.open) {
      if (hotHit) inventory.selected = hotHit.index;
      return;
    }

    if (inventory.drag) {
      const drag = inventory.drag;
      const target = getStackAt(hit.area, hit.index);
      if (!target) {
        setStackAt(hit.area, hit.index, drag.stack);
        setStackAt(drag.from, drag.index, null);
        inventory.drag = null;
        return;
      }
      if (target.id === drag.stack.id) {
        const def = ITEMS[target.id];
        if (Input.mouse.right) {
          if (target.count < def.max) {
            target.count += 1; drag.stack.count -= 1;
            if (drag.stack.count <= 0) {
              setStackAt(drag.from, drag.index, null);
              inventory.drag = null;
            }
          }
        } else {
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
      const tmp = getStackAt(drag.from, drag.index);
      setStackAt(drag.from, drag.index, target);
      setStackAt(hit.area, hit.index, drag.stack);
      inventory.drag = tmp;
      return;
    }

    const stack = getStackAt(hit.area, hit.index);
    if (!stack) return;

    if (Input.mouse.right) { useItem(hit.area, hit.index); return; }

    if (Input.keys['ShiftLeft'] || Input.keys['ShiftRight']) {
      const half = Math.ceil(stack.count / 2);
      inventory.drag = { from: hit.area, index: hit.index, stack: { id: stack.id, count: half } };
      stack.count -= half;
      if (stack.count <= 0) setStackAt(hit.area, hit.index, null);
    } else {
      inventory.drag = { from: hit.area, index: hit.index, stack: stack };
      setStackAt(hit.area, hit.index, null);
    }
  }

  function useItem(area, index) {
    const stack = getStackAt(area, index);
    if (!stack) return;
    const def = ITEMS[stack.id];

    if (def && def.food) {
      player.th = Math.min(player.maxTh, player.th + def.food);
      player.hp = Math.min(player.maxHp, player.hp + Math.floor(def.food * 0.25));
      stack.count -= 1;
      if (stack.count <= 0) setStackAt(area, index, null);
      return;
    }

    if (PLACEABLE[stack.id]) {
      const w = screenToWorld(Input.mouse.x, Input.mouse.y);
      const tx = Math.round(w.tx), ty = Math.round(w.ty);
      const ptx = Math.round(player.tx), pty = Math.round(player.ty);
      if (tx === ptx && ty === pty) return;
      const ddx = tx - player.tx, ddy = ty - player.ty;
      if (ddx * ddx + ddy * ddy > 4) return;
      if (Chunks.getDecor(tx, ty, SEED)) return;
      if (Chunks.getTile(tx, ty, SEED) === 'water') return;

      const type = PLACEABLE[stack.id];
      const hp = type === 'tree' ? 5 : 6;
      Chunks.setDecor(tx, ty, SEED, { type: type, hp: hp, maxHp: hp });
      stack.count -= 1;
      if (stack.count <= 0) setStackAt(area, index, null);
    }
  }

  function updateMining(dt) {
    if (inventory.open || !Input.mouse.left || inventory.drag) {
      miningTarget = null; miningProgress = 0; return;
    }
    if (hitTestHotbar(Input.mouse.x, Input.mouse.y)) {
      miningTarget = null; miningProgress = 0; return;
    }
    const w = screenToWorld(Input.mouse.x, Input.mouse.y);
    const tx = Math.round(w.tx), ty = Math.round(w.ty);
    const d = Chunks.getDecor(tx, ty, SEED);
    if (!d) { miningTarget = null; miningProgress = 0; return; }
    const dx = tx - player.tx, dy = ty - player.ty;
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

    const pc = worldToScreen(player.tx, player.ty);
    camera.x = Math.round(pc.x - W / 2);
    camera.y = Math.round(pc.y - H / 2);

    player.th = Math.max(0, player.th - 0.4 * dt);
  }

  // ---------------- render ----------------
  let fpsAcc = 0, fpsCount = 0, fps = 0;
  const ping = 0;

  function visibleTileBounds() {
    const corners = [
      screenToWorld(-TILE_W / 2, -TILE_H / 2),
      screenToWorld(W + TILE_W / 2, -TILE_H / 2),
      screenToWorld(-TILE_W / 2, H + TILE_H / 2),
      screenToWorld(W + TILE_W / 2, H + TILE_H / 2)
    ];
    return {
      minTx: Math.floor(Math.min(corners[0].tx, corners[1].tx, corners[2].tx, corners[3].tx)),
      maxTx: Math.ceil (Math.max(corners[0].tx, corners[1].tx, corners[2].tx, corners[3].tx)),
      minTy: Math.floor(Math.min(corners[0].ty, corners[1].ty, corners[2].ty, corners[3].ty)),
      maxTy: Math.ceil (Math.max(corners[0].ty, corners[1].ty, corners[2].ty, corners[3].ty))
    };
  }

  function render() {
    ctx.fillStyle = '#0d0b08';
    ctx.fillRect(0, 0, W, H);

    const B = visibleTileBounds();

    for (let ty = B.minTy; ty <= B.maxTy; ty++) {
      for (let tx = B.minTx; tx <= B.maxTx; tx++) {
        const b = Chunks.getTile(tx, ty, SEED);
        const img = Sprites.getTile(b);
        const p = worldToScreen(tx, ty);
        const sx = Math.round(p.x - TILE_W / 2 - camera.x);
        const sy = Math.round(p.y - camera.y);
        ctx.drawImage(img, sx, sy);
      }
    }

    const items = [];
    for (let ty = B.minTy; ty <= B.maxTy; ty++) {
      for (let tx = B.minTx; tx <= B.maxTx; tx++) {
        const d = Chunks.getDecor(tx, ty, SEED);
        if (!d) continue;
        items.push({ kind: 'decor', tx, ty, d, depth: tx + ty });
      }
    }
    items.push({ kind: 'player', depth: player.tx + player.ty });
    items.sort((a, b) => a.depth - b.depth);

    for (const it of items) {
      if (it.kind === 'player') {
        const pc = worldToScreen(player.tx, player.ty);
        const shadowX = Math.round(pc.x - camera.x);
        const shadowY = Math.round(pc.y - camera.y);
        // тень остаётся на земле
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(shadowX, shadowY + 2, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // спрайт поднимается вверх по экрану на player.z
        const sx = Math.round(pc.x - camera.x - Sprites.playerCellW / 2);
        const sy = Math.round(pc.y - camera.y - Sprites.playerCellH - player.z);
        Sprites.drawPlayer(ctx, sx, sy, player.dir, player.frame);
      } else {
        const img = Sprites.getDecor(it.d.type);
        if (!img) continue;
        const p = worldToScreen(it.tx, it.ty);
        const sx = Math.round(p.x - camera.x - img.width / 2);
        const sy = Math.round(p.y - camera.y - img.height + 8);
        ctx.drawImage(img, sx, sy);

        if (miningTarget && miningTarget.tx === it.tx && miningTarget.ty === it.ty) {
          const need = MINING_TIME_PER_HP * (it.d.maxHp || 3);
          const pr = Math.min(1, miningProgress / need);
          const barW = 16;
          const bx = Math.round(p.x - camera.x - barW / 2);
          const by = Math.round(p.y - camera.y - img.height + 8 - 6);
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(bx, by, barW, 3);
          ctx.fillStyle = '#f9d54f';
          ctx.fillRect(bx, by, Math.max(1, Math.round(barW * pr)), 3);
        }
      }
    }

    if (!inventory.open) {
      const w = screenToWorld(Input.mouse.x, Input.mouse.y);
      const tx = Math.round(w.tx), ty = Math.round(w.ty);
      const p = worldToScreen(tx, ty);
      const cx = Math.round(p.x - camera.x);
      const cy = Math.round(p.y - camera.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx,             cy - TILE_H / 2 + 0.5);
      ctx.lineTo(cx + TILE_W / 2, cy + 0.5);
      ctx.lineTo(cx,             cy + TILE_H / 2 + 0.5);
      ctx.lineTo(cx - TILE_W / 2, cy + 0.5);
      ctx.closePath();
      ctx.stroke();
    }

    drawHUD();

    if (inventory.drag) {
      drawSlotContent(inventory.drag.stack, Input.mouse.x - 9, Input.mouse.y - 9, 18);
    }
  }

  // ---------------- HUD ----------------
  function drawHUD() {
    ctx.textBaseline = 'top';

    const lines = [
      'PING ' + ping + 'ms',
      'FPS  ' + fps,
      'X ' + Math.round(player.tx) + '  Y ' + Math.round(player.ty),
      'SEED ' + SEED
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(4, 4, 110, lines.length * 10 + 6);
    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 8 | 0, (7 + i * 10) | 0);
    }

    drawBar(8, H - 48, 84, 8, player.hp / player.maxHp, '#e04040', 'HP');
    drawBar(8, H - 36, 84, 8, player.st / player.maxSt, '#40c0e0', 'ST');
    drawBar(8, H - 24, 84, 8, player.th / player.maxTh, '#40b0f0', 'TH');

    const L = getHudLayout();
    for (let i = 0; i < HOTBAR; i++) {
      const x = L.hx + i * (L.slot + L.gap);
      const sel = i === inventory.selected;
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(x | 0, L.hy | 0, L.slot, L.slot);
      ctx.strokeStyle = sel ? '#f9d54f' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, L.hy + 0.5, L.slot - 1, L.slot - 1);

      const isDragged = inventory.drag &&
                        inventory.drag.from === 'hotbar' &&
                        inventory.drag.index === i;
      if (!isDragged) drawSlotContent(inventory.hotbar[i], x, L.hy, L.slot);

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '6px monospace';
      ctx.fillText(String((i + 1) % 10), (x + 2) | 0, (L.hy + 2) | 0);
    }

    if (inventory.open) drawInventoryPanel();
  }

  function drawBar(x, y, w, h, p, color, label) {
    p = Math.max(0, Math.min(1, p));
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * p), h - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#fff';
    ctx.font = '6px monospace';
    ctx.fillText(label, (x + 2) | 0, (y + h + 1) | 0);
  }

  function drawSlotContent(s, x, y, size) {
    if (!s) return;
    const def = ITEMS[s.id];
    if (!def) return;
    const pad = 3;
    ctx.fillStyle = def.color;
    ctx.fillRect((x + pad) | 0, (y + pad) | 0, size - pad * 2, size - pad * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad + 0.5, y + pad + 0.5, size - pad * 2 - 1, size - pad * 2 - 1);
    if (s.count > 1) {
      ctx.fillStyle = '#fff';
      ctx.font = '7px monospace';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(s.count), (x + size - 3 - String(s.count).length * 5) | 0, (y + size - 2) | 0);
      ctx.textBaseline = 'top';
    }
  }

  function drawInventoryPanel() {
    const L = getInvLayout();
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(L.px, L.py, L.panelW, L.panelH);
    ctx.strokeStyle = '#f9d54f';
    ctx.lineWidth = 1;
    ctx.strokeRect(L.px + 0.5, L.py + 0.5, L.panelW - 1, L.panelH - 1);

    ctx.fillStyle = '#f9d54f';
    ctx.font = '8px monospace';
    ctx.fillText('INVENTORY', (L.px + 8) | 0, (L.py + 6) | 0);

    const gx = L.px + 8, gy = L.py + 22;
    for (let r = 0; r < INV_ROWS; r++) for (let c = 0; c < INV_COLS; c++) {
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

  // ---------------- main loop ----------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    update(dt);
    render();
    Input.endFrame();

    fpsAcc += dt; fpsCount++;
    if (fpsAcc >= 0.5) { fps = Math.round(fpsCount / fpsAcc); fpsAcc = 0; fpsCount = 0; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
