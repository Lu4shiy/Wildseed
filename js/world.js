// js/world.js
// Изометрия + Shift-спринт + прыжки + коллизии + инвентарь + сохранение +
// тултипы (grid + hotbar) + перенос цифрами + животные.
(function () {
  'use strict';

  const TILE_W = 32, TILE_H = 16, W = 480, H = 270;
  const RANGE = 4;

  // ---------- worldCfg ----------
  let worldCfg = { seed: 12345, name: 'World', size: 512, difficulty: 'Normal', keepInventory: false };
  try {
    const s = localStorage.getItem('wildseed.worldCfg');
    if (s) worldCfg = Object.assign(worldCfg, JSON.parse(s));
  } catch (e) {}
  const SEED = (parseInt(worldCfg.seed, 10) | 0) || 12345;
  const SAVE_KEY = 'wildseed.save.v1.' + SEED;

  // ---------- canvas ----------
  const canvas = document.getElementById('game');
  if (!canvas) { console.error('[world] canvas not found'); return; }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let SCALE = 1;
  function resizeCanvas() {
    SCALE = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
    canvas.width = W * SCALE; canvas.height = H * SCALE;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  if (!window.Sprites) { console.error('[world] Sprites not loaded'); return; }
  Sprites.init();
  Input.setLogicalSize(W, H);
  Input.attach(canvas);

  // ---------- items ----------
  const ITEMS = {
    wood:            { color: '#8a5a2a', max: 99 },
    stone:           { color: '#7a7a82', max: 99 },
    golden_ore:      { color: '#d8a030', max: 99 },
    fiber:           { color: '#5a9a48', max: 99 },
    berry:           { color: '#d04040', max: 99, food: 12 },
    flower:          { color: '#e84a5f', max: 99 },
    raw_rabbit_meat: { color: '#c06060', max: 99, food: 20 },
    rabbit_skin:     { color: '#a87850', max: 99 }
  };
  const ITEM_ICON = {
    wood: 'tree', stone: 'rock', ore: 'ore',
    berry: 'bush', flower: 'flower', fiber: null,
    meat: null, leather: null
  };
  const TOOLTIPS = {
    wood:    ['WOOD', 'MATERIAL', 'BREAK IN 1.8S'],
    stone:   ['STONE', 'MATERIAL', 'BREAK IN 2.1S'],
    ore:     ['ORE', 'MATERIAL', 'BREAK IN 2.8S'],
    fiber:   ['FIBER', 'MATERIAL'],
    berry:   ['BERRY', 'FOOD +12', 'HEAL +3'],
    flower:  ['FLOWER', 'DECORATION'],
    meat:    ['MEAT', 'FOOD +20', 'HEAL +5'],
    leather: ['LEATHER', 'MATERIAL']
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

  // ---------- inventory ----------
  const HOTBAR = 10, INV_COLS = 10, INV_ROWS = 4, INV_SIZE = INV_COLS * INV_ROWS;
  const inventory = {
    hotbar: new Array(HOTBAR).fill(null),
    grid:   new Array(INV_SIZE).fill(null),
    selected: 0, open: false, drag: null
  };

  let dirty = false;
  function markDirty() { dirty = true; }

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
        inventory.hotbar[i] = { id, count: a }; left -= a;
      }
    }
    for (let i = 0; i < INV_SIZE && left > 0; i++) {
      if (!inventory.grid[i]) {
        const a = Math.min(def.max, left);
        inventory.grid[i] = { id, count: a }; left -= a;
      }
    }
    markDirty();
    return count - left;
  }
  const getStackAt = (a, i) => a === 'hotbar' ? inventory.hotbar[i] : inventory.grid[i];
  function setStackAt(a, i, s) {
    if (a === 'hotbar') inventory.hotbar[i] = s; else inventory.grid[i] = s;
    markDirty();
  }

  // ---------- player ----------
  const PLAYER_R_TILE = 0.35;
  const GRAVITY = 450, JUMP_VELOCITY = 150;
  const SPEED_WALK = 80, SPEED_SPRINT = 128;

  const player = {
    tx: 0, ty: 0, z: 0, vz: 0, onGround: true,
    dir: 0, frame: 0, animTime: 0, moving: false,
    hp: 100, maxHp: 100,
    th: 100, maxTh: 100
  };

  const camera = { x: 0, y: 0 };

  function worldToScreen(wx, wy) {
    return { x: (wx - wy) * (TILE_W / 2), y: (wx + wy) * (TILE_H / 2) };
  }
  function screenToWorld(sx, sy) {
    const wx = sx + camera.x, wy = sy + camera.y;
    const a = wx / (TILE_W / 2), b = wy / (TILE_H / 2);
    return { tx: (a + b) / 2, ty: (b - a) / 2 };
  }

  function collides(nx, ny, zTiles) {
    const cx = Math.round(nx), cy = Math.round(ny);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
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
    return false;
  }

  // ---------- save/load ----------
  function saveGame() {
    try {
      const data = {
        v: 1,
        inv: { hotbar: inventory.hotbar, grid: inventory.grid, selected: inventory.selected },
        player: { tx: player.tx, ty: player.ty, hp: player.hp, th: player.th },
        decor: Chunks.getModified(),
        animals: Animals.toJSON()
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      dirty = false;
    } catch (e) { console.warn('[save]', e.message); }
  }
  function loadGame() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (!s) return false;
      const d = JSON.parse(s);
      if (d.inv) {
        if (Array.isArray(d.inv.hotbar)) inventory.hotbar = d.inv.hotbar;
        if (Array.isArray(d.inv.grid))   inventory.grid   = d.inv.grid;
        inventory.selected = d.inv.selected || 0;
      }
      if (d.player) {
        if (typeof d.player.tx === 'number') player.tx = d.player.tx;
        if (typeof d.player.ty === 'number') player.ty = d.player.ty;
        if (typeof d.player.hp === 'number') player.hp = d.player.hp;
        if (typeof d.player.th === 'number') player.th = d.player.th;
      }
      if (d.decor) Chunks.setModified(d.decor);
      if (d.animals) Animals.fromJSON(d.animals);
      return true;
    } catch (e) { console.warn('[load]', e.message); return false; }
  }
  window.addEventListener('beforeunload', saveGame);

  // ---------- spawn ----------
  function findSpawn() {
    for (let r = 0; r < 80; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (Chunks.biomeAt(dx, dy, SEED) === 'water') continue;
        if (collides(dx, dy, 0)) continue;
        player.tx = dx; player.ty = dy; return;
      }
    }
  }

  findSpawn();
  const loaded = loadGame();
  if (!loaded) {
    for (let i = 0; i < 8; i++) {
      let ax = 0, ay = 0;
      for (let tries = 0; tries < 30; tries++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 4 + Math.random() * 8;
        ax = Math.round(player.tx + Math.cos(ang) * dist);
        ay = Math.round(player.ty + Math.sin(ang) * dist);
        if (Chunks.getTile(ax, ay, SEED) !== 'water' && !collides(ax, ay, 0)) break;
      }
      Animals.spawn('rabbit', ax, ay);
    }
    markDirty();
  }

  // ---------- mining/attack ----------
  const MINING_TIME_PER_HP = 0.35;
  let miningTarget = null, miningProgress = 0;
  let attackCooldown = 0;
  let autoSaveTimer = 0;

  // ---------- menu ----------
  const menu = { open: false, selected: 0, options: ['RESUME', 'EXIT TO MENU'] };

  // ---------- update ----------
  let wasE = false, wasSpace = false, wasEscape = false;
  let wasEnter = false, wasArrowUp = false, wasArrowDown = false;
  const wasDigit = new Array(10).fill(false);

  function updateMovement(dt) {
    let sx = 0, sy = 0;
    if (Input.keys['KeyW'] || Input.keys['ArrowUp'])    sy -= 1;
    if (Input.keys['KeyS'] || Input.keys['ArrowDown'])  sy += 1;
    if (Input.keys['KeyA'] || Input.keys['ArrowLeft'])  sx -= 1;
    if (Input.keys['KeyD'] || Input.keys['ArrowRight']) sx += 1;
    const len = Math.hypot(sx, sy);
    if (len > 0) { sx /= len; sy /= len; }

    const sprinting = (Input.keys['ShiftLeft'] || Input.keys['ShiftRight']) && len > 0.01;
    const blocked = inventory.open || menu.open;
    player.moving = len > 0 && !blocked;

    if (player.moving) {
      if (Math.abs(sy) >= Math.abs(sx)) player.dir = sy > 0 ? 1 : 0;
      else                              player.dir = sx > 0 ? 3 : 2;
      player.animTime += dt * (sprinting ? 1.5 : 1);
      player.frame = Math.floor(player.animTime * 8) % 4;
    } else { player.animTime = 0; player.frame = 0; }

    const sp = !!Input.keys['Space'];
    if (sp && !wasSpace && player.onGround && !blocked) {
      player.vz = JUMP_VELOCITY; player.onGround = false;
    }
    wasSpace = sp;

    if (!player.onGround || player.z > 0 || player.vz !== 0) {
      player.vz -= GRAVITY * dt; player.z += player.vz * dt;
      if (player.z <= 0) { player.z = 0; player.vz = 0; player.onGround = true; }
    }

    if (!blocked && len > 0) {
      const spd = sprinting ? SPEED_SPRINT : SPEED_WALK;
      const dSX = sx * spd * dt, dSY = sy * spd * dt;
      const dtx = ( dSX / (TILE_W / 2) + dSY / (TILE_H / 2)) / 2;
      const dty = (-dSX / (TILE_W / 2) + dSY / (TILE_H / 2)) / 2;
      const zT = player.z / TILE_H;
      const ntx = player.tx + dtx;
      if (!collides(ntx, player.ty, zT)) player.tx = ntx;
      const nty = player.ty + dty;
      if (!collides(player.tx, nty, zT)) player.ty = nty;
    }
  }

  function closeInventory() {
    inventory.open = false;
    if (inventory.drag) {
      const st = inventory.drag.stack;
      if (!getStackAt(inventory.drag.from, inventory.drag.index))
        setStackAt(inventory.drag.from, inventory.drag.index, st);
      else addItem(st.id, st.count);
      inventory.drag = null;
    }
    saveGame();
  }

  // #4: swap-перенос между любым слотом инвентаря и хотбаром[N].
  function swapWithHotbar(fromArea, fromIdx, hotbarIdx) {
    if (fromArea === 'hotbar' && fromIdx === hotbarIdx) return;
    const src = getStackAt(fromArea, fromIdx);
    const dst = inventory.hotbar[hotbarIdx];
    // если источник — сам хотбар, сначала поставим туда dst
    if (fromArea === 'hotbar') inventory.hotbar[fromIdx] = dst;
    else                       setStackAt(fromArea, fromIdx, dst);
    inventory.hotbar[hotbarIdx] = src;
    markDirty();
    saveGame();
  }

  function updateMenusAndKeys() {
    const escNow = !!Input.keys['Escape'];
    if (escNow && !wasEscape) {
      if (menu.open) { menu.open = false; saveGame(); }
      else if (inventory.open) closeInventory();
      else { menu.open = true; menu.selected = 0; saveGame(); }
    }
    wasEscape = escNow;

    const eNow = !!Input.keys['KeyE'];
    if (eNow && !wasE && !menu.open) {
      if (inventory.open) closeInventory(); else inventory.open = true;
    }
    wasE = eNow;

    if (menu.open) {
      const upNow = !!Input.keys['KeyW'] || !!Input.keys['ArrowUp'];
      const dnNow = !!Input.keys['KeyS'] || !!Input.keys['ArrowDown'];
      if (upNow && !wasArrowUp) menu.selected = (menu.selected - 1 + menu.options.length) % menu.options.length;
      if (dnNow && !wasArrowDown) menu.selected = (menu.selected + 1) % menu.options.length;
      wasArrowUp = upNow; wasArrowDown = dnNow;
      const en = !!Input.keys['Enter'] || !!Input.keys['NumpadEnter'];
      if (en && !wasEnter) menuConfirm();
      wasEnter = en;
    } else { wasArrowUp = wasArrowDown = wasEnter = false; }

    // Цифры 0..9: с открытым инвентарём и наведением на слот — перенос,
    // иначе — обычный выбор слота хотбара.
    for (let i = 0; i < 10; i++) {
      const code = i === 9 ? 'Digit0' : ('Digit' + (i + 1));
      const now = !!Input.keys[code];
      if (now && !wasDigit[i] && !menu.open) {
        if (inventory.open) {
          const hit = hitTestAnySlot(Input.mouse.x, Input.mouse.y);
          if (hit) swapWithHotbar(hit.area, hit.index, i);
          else inventory.selected = i;
        } else {
          inventory.selected = i;
        }
      }
      wasDigit[i] = now;
    }
  }

  function menuConfirm() {
    if (menu.selected === 0) { menu.open = false; saveGame(); }
    else { window.location.href = 'index.html'; }
  }

  function handleWheel() {
    if (inventory.open || menu.open) return;
    const w = Input.mouse.wheel;
    if (w === 0) return;
    const dir = w > 0 ? 1 : -1;
    inventory.selected = (inventory.selected + dir + HOTBAR) % HOTBAR;
  }

  // ---------- layouts ----------
  function getHudLayout() {
    const slot = 18, gap = 2;
    const totalW = HOTBAR * slot + (HOTBAR - 1) * gap;
    return { slot, gap, hx: Math.floor((W - totalW) / 2), hy: H - slot - 6, totalW };
  }
  function getInvLayout() {
    const sSize = 22, sGap = 2;
    const panelW = INV_COLS * sSize + (INV_COLS - 1) * sGap + 16;
    const panelH = INV_ROWS * sSize + (INV_ROWS - 1) * sGap + 16 + 22;
    return { sSize, sGap, panelW, panelH,
             px: Math.floor((W - panelW) / 2), py: Math.floor((H - panelH) / 2) };
  }
  function getMenuLayout() {
    const pw = 150, ph = 78;
    return { pw, ph, px: Math.floor((W - pw) / 2), py: Math.floor((H - ph) / 2) };
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
  const hitTestAnySlot = (mx, my) => hitTestHotbar(mx, my) || hitTestInventory(mx, my);
  function hitTestMenu(mx, my) {
    if (!menu.open) return -1;
    const L = getMenuLayout();
    for (let i = 0; i < menu.options.length; i++) {
      const oy = L.py + 28 + i * 14;
      if (mx >= L.px + 8 && mx < L.px + L.pw - 8 && my >= oy - 2 && my < oy + 10) return i;
    }
    return -1;
  }

  function handleInventoryClick() {
    const mx = Input.mouse.x, my = Input.mouse.y;
    const hotHit = hitTestHotbar(mx, my);
    const invHit = hitTestInventory(mx, my);
    const hit = invHit || hotHit;
    if (!hit) return;
    if (!inventory.open) { if (hotHit) inventory.selected = hotHit.index; return; }

    if (inventory.drag) {
      const drag = inventory.drag;
      const target = getStackAt(hit.area, hit.index);
      if (!target) {
        setStackAt(hit.area, hit.index, drag.stack);
        setStackAt(drag.from, drag.index, null);
        inventory.drag = null; return;
      }
      if (target.id === drag.stack.id) {
        const def = ITEMS[target.id];
        if (Input.mouse.right) {
          if (target.count < def.max) {
            target.count += 1; drag.stack.count -= 1;
            if (drag.stack.count <= 0) {
              setStackAt(drag.from, drag.index, null); inventory.drag = null;
            }
            markDirty();
          }
        } else {
          const total = target.count + drag.stack.count;
          if (total <= def.max) {
            target.count = total;
            setStackAt(drag.from, drag.index, null);
            inventory.drag = null;
          } else {
            const moved = def.max - target.count;
            target.count = def.max; drag.stack.count -= moved;
          }
          markDirty();
        }
        return;
      }
      const tmp = getStackAt(drag.from, drag.index);
      setStackAt(drag.from, drag.index, target);
      setStackAt(hit.area, hit.index, drag.stack);
      inventory.drag = tmp; return;
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

  function playerOverlapsTile(tx, ty) {
    const r = PLAYER_R_TILE + 0.5;
    return Math.abs(player.tx - tx) <= r && Math.abs(player.ty - ty) <= r;
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
      markDirty(); saveGame();
      return;
    }
    if (PLACEABLE[stack.id]) {
      const w = screenToWorld(Input.mouse.x, Input.mouse.y);
      const tx = Math.round(w.tx), ty = Math.round(w.ty);
      if (playerOverlapsTile(tx, ty)) return;
      const ddx = tx - player.tx, ddy = ty - player.ty;
      if (ddx * ddx + ddy * ddy > RANGE * RANGE) return;
      if (Chunks.getDecor(tx, ty, SEED)) return;
      if (Chunks.getTile(tx, ty, SEED) === 'water') return;
      const type = PLACEABLE[stack.id];
      const hp = type === 'tree' ? 5 : 6;
      Chunks.setDecor(tx, ty, SEED, { type, hp, maxHp: hp });
      stack.count -= 1;
      if (stack.count <= 0) setStackAt(area, index, null);
      markDirty(); saveGame();
    }
  }

  function updateMining(dt) {
    if (inventory.open || menu.open || !Input.mouse.left || inventory.drag) {
      miningTarget = null; miningProgress = 0; return;
    }
    if (hitTestHotbar(Input.mouse.x, Input.mouse.y)) {
      miningTarget = null; miningProgress = 0; return;
    }

    const w = screenToWorld(Input.mouse.x, Input.mouse.y);

    if (attackCooldown <= 0) {
      const a = Animals.findAt(w.tx, w.ty, RANGE, player);
      if (a) {
        if (Animals.hit(a, 5)) {
          addItem('meat', 1);
          if (Math.random() < 0.6) addItem('leather', 1);
        }
        attackCooldown = 0.4;
        miningTarget = null; miningProgress = 0;
        markDirty(); saveGame();
        return;
      }
    }

    const tx = Math.round(w.tx), ty = Math.round(w.ty);
    const d = Chunks.getDecor(tx, ty, SEED);
    if (!d) { miningTarget = null; miningProgress = 0; return; }
    const dx = tx - player.tx, dy = ty - player.ty;
    if (dx * dx + dy * dy > RANGE * RANGE) { miningTarget = null; miningProgress = 0; return; }
    if (!miningTarget || miningTarget.tx !== tx || miningTarget.ty !== ty) {
      miningTarget = { tx, ty }; miningProgress = 0;
    }
    miningProgress += dt;
    const need = MINING_TIME_PER_HP * (d.maxHp || 3);
    if (miningProgress >= need) {
      const drop = DECOR_DROPS[d.type];
      if (drop) addItem(drop.id, drop.count);
      Chunks.setDecor(tx, ty, SEED, null);
      miningTarget = null; miningProgress = 0;
      markDirty(); saveGame();
    }
  }

  function handleMouseClicks() {
    const mx = Input.mouse.x, my = Input.mouse.y;

    if (menu.open) {
      if (Input.mouse.leftPressed) {
        const idx = hitTestMenu(mx, my);
        if (idx >= 0) { menu.selected = idx; menuConfirm(); }
      }
      Input.mouse.leftPressed = false;
      Input.mouse.rightPressed = false;
      return;
    }

    if (Input.mouse.leftPressed || Input.mouse.rightPressed) {
      const hit = hitTestAnySlot(mx, my);
      if (hit) {
        handleInventoryClick();
        Input.mouse.leftPressed = false;
        Input.mouse.rightPressed = false;
        return;
      }
      if (Input.mouse.rightPressed && !inventory.open) {
        useItem('hotbar', inventory.selected);
        Input.mouse.rightPressed = false;
      }
    }
  }

  function update(dt) {
    if (attackCooldown > 0) attackCooldown -= dt;
    updateMenusAndKeys();
    handleWheel();
    handleMouseClicks();

    if (!menu.open) {
      updateMovement(dt);
      updateMining(dt);
      Animals.update(dt, { collides, player });
    }

    const pc = worldToScreen(player.tx, player.ty);
    camera.x = Math.round(pc.x - W / 2);
    camera.y = Math.round(pc.y - H / 2);

    player.th = Math.max(0, player.th - 0.4 * dt);

    autoSaveTimer += dt;
    if (autoSaveTimer >= 5 && dirty) { autoSaveTimer = 0; saveGame(); }
  }

  // ---------- render ----------
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

  function drawLoader() {
    ctx.fillStyle = '#0d0b08'; ctx.fillRect(0, 0, W, H);
    const title = 'WILDSEED';
    Font.draw(ctx, title, (W - Font.width(title, 2)) / 2, H / 2 - 34, '#f9d54f', 2);
    const total = Math.max(1, Sprites.total);
    const loadedN = Sprites.loaded;
    const st = 'LOADING ' + loadedN + ' / ' + total;
    Font.draw(ctx, st, (W - Font.width(st, 1)) / 2, H / 2 - 4, '#fff', 1);
    const bw = 140, bh = 8, bx = Math.floor((W - bw) / 2), by = H / 2 + 14;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#f9d54f'; ctx.fillRect(bx, by, Math.floor(bw * loadedN / total), bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  }

  function render() {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (!Sprites.ready) { drawLoader(); return; }

    ctx.fillStyle = '#0d0b08'; ctx.fillRect(0, 0, W, H);
    const B = visibleTileBounds();

    for (let ty = B.minTy; ty <= B.maxTy; ty++) for (let tx = B.minTx; tx <= B.maxTx; tx++) {
      const img = Sprites.getTile(Chunks.getTile(tx, ty, SEED));
      const p = worldToScreen(tx, ty);
      ctx.drawImage(img, Math.round(p.x - TILE_W / 2 - camera.x), Math.round(p.y - camera.y));
    }

    const items = [];
    for (let ty = B.minTy; ty <= B.maxTy; ty++) for (let tx = B.minTx; tx <= B.maxTx; tx++) {
      const d = Chunks.getDecor(tx, ty, SEED);
      if (!d) continue;
      items.push({ kind: 'decor', tx, ty, d, depth: tx + ty });
    }
    for (const a of Animals.get()) {
      items.push({ kind: 'animal', a, depth: a.tx + a.ty });
    }
    items.push({ kind: 'player', depth: player.tx + player.ty + 0.001 });
    items.sort((a, b) => a.depth - b.depth);

    for (const it of items) {
      if (it.kind === 'player') {
        const pc = worldToScreen(player.tx, player.ty);
        const feetX = pc.x - camera.x;
        const feetY = pc.y + TILE_H / 2 - camera.y;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(feetX, feetY + 1, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        Sprites.drawPlayer(ctx,
          Math.round(feetX - Sprites.playerCellW / 2),
          Math.round(feetY - Sprites.playerCellH - player.z),
          player.dir, player.frame);
      } else if (it.kind === 'animal') {
        const a = it.a;
        const pc = worldToScreen(a.tx, a.ty);
        const feetX = pc.x - camera.x;
        const feetY = pc.y + TILE_H / 2 - camera.y;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(feetX, feetY + 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
        const sx = Math.round(feetX - Sprites.rabbitCellW / 2);
        const sy = Math.round(feetY - Sprites.rabbitCellH);
        if (a.hurtTimer > 0) {
          ctx.save();
          Sprites.drawRabbit(ctx, sx, sy, a.dir, a.frame);
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#e04040';
          ctx.fillRect(sx, sy, Sprites.rabbitCellW, Sprites.rabbitCellH);
          ctx.restore();
        } else {
          Sprites.drawRabbit(ctx, sx, sy, a.dir, a.frame);
        }
        if (a.hp < a.maxHp) {
          const bw = 12;
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(Math.round(feetX - bw / 2), sy - 4, bw, 2);
          ctx.fillStyle = '#e04040';
          ctx.fillRect(Math.round(feetX - bw / 2), sy - 4,
                       Math.max(1, Math.round(bw * a.hp / a.maxHp)), 2);
        }
      } else {
        const img = Sprites.getDecor(it.d.type);
        if (!img || img.width <= 1) continue;
        const p = worldToScreen(it.tx, it.ty);
        const sx = Math.round(p.x - camera.x - img.width / 2);
        const sy = Math.round(p.y - camera.y - img.height + TILE_H / 2);
        ctx.drawImage(img, sx, sy);

        if (miningTarget && miningTarget.tx === it.tx && miningTarget.ty === it.ty) {
          const need = MINING_TIME_PER_HP * (it.d.maxHp || 3);
          const pr = Math.min(1, miningProgress / need);
          const barW = 16;
          const bx = Math.round(p.x - camera.x - barW / 2);
          const by = Math.round(p.y - camera.y - img.height + TILE_H / 2 - 6);
          ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx, by, barW, 3);
          ctx.fillStyle = '#f9d54f'; ctx.fillRect(bx, by, Math.max(1, Math.round(barW * pr)), 3);
        }
      }
    }

    if (!inventory.open && !menu.open) {
      const w = screenToWorld(Input.mouse.x, Input.mouse.y);
      const tx = Math.round(w.tx), ty = Math.round(w.ty);
      const p = worldToScreen(tx, ty);
      const cx = Math.round(p.x - camera.x), cy = Math.round(p.y - camera.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 0.5);
      ctx.lineTo(cx + TILE_W / 2, cy + TILE_H / 2 + 0.5);
      ctx.lineTo(cx, cy + TILE_H + 0.5);
      ctx.lineTo(cx - TILE_W / 2, cy + TILE_H / 2 + 0.5);
      ctx.closePath(); ctx.stroke();
    }

    drawHUD();
    if (inventory.drag) drawSlotContent(inventory.drag.stack, Input.mouse.x - 9, Input.mouse.y - 9, 18);
    if (inventory.open) drawInventoryTooltip();
    if (menu.open) drawPauseMenu();
  }

  // ---------- HUD ----------
  const HEART_PATTERN = ['0110110','1111111','1111111','0111110','0011100','0001000'];
  const DROP_PATTERN  = ['0001000','0011100','0111110','1111111','1111111','0111110','0011100'];
  function drawPattern(x, y, pattern, color) {
    ctx.fillStyle = color;
    for (let r = 0; r < pattern.length; r++) {
      const row = pattern[r];
      for (let c = 0; c < row.length; c++) {
        if (row.charCodeAt(c) === 49) ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
  }

  function drawHUD() {
    const lines = [
      'PING ' + ping + 'MS',
      'FPS  ' + fps,
      'X ' + Math.round(player.tx) + ' Y ' + Math.round(player.ty),
      'SEED ' + SEED
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(4, 4, 110, lines.length * 10 + 6);
    for (let i = 0; i < lines.length; i++) Font.draw(ctx, lines[i], 8, 7 + i * 10, '#fff', 1);

    const L = getHudLayout();

    const maxHearts = 10, heartW = 7, heartGap = 1;
    const heartsX = L.hx, heartsY = L.hy - 14;
    const filledHearts = Math.round(player.hp / player.maxHp * maxHearts);
    for (let i = 0; i < maxHearts; i++) {
      drawPattern(heartsX + i * (heartW + heartGap), heartsY, HEART_PATTERN,
                  i < filledHearts ? '#e04040' : 'rgba(60,20,20,0.9)');
    }

    const maxDrops = 10, dropW = 7, dropGap = 1;
    const dropsTotalW = maxDrops * dropW + (maxDrops - 1) * dropGap;
    const dropsX = L.hx + L.totalW - dropsTotalW;
    const dropsY = L.hy - 14;
    const filledDrops = Math.round(player.th / player.maxTh * maxDrops);
    for (let i = 0; i < maxDrops; i++) {
      drawPattern(dropsX + i * (dropW + dropGap), dropsY, DROP_PATTERN,
                  i < filledDrops ? '#40a0e0' : 'rgba(15,40,60,0.9)');
    }

    for (let i = 0; i < HOTBAR; i++) {
      const x = L.hx + i * (L.slot + L.gap);
      const sel = i === inventory.selected;
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, L.hy, L.slot, L.slot);
      ctx.strokeStyle = sel ? '#f9d54f' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, L.hy + 0.5, L.slot - 1, L.slot - 1);
      const isDragged = inventory.drag && inventory.drag.from === 'hotbar' && inventory.drag.index === i;
      if (!isDragged) drawSlotContent(inventory.hotbar[i], x, L.hy, L.slot);
      Font.draw(ctx, String((i + 1) % 10), x + 2, L.hy + 2, 'rgba(255,255,255,0.85)', 1);
    }

    if (inventory.open) drawInventoryPanel();
  }

  function drawSlotContent(s, x, y, size) {
    if (!s) return;
    const def = ITEMS[s.id]; if (!def) return;
    const iconName = ITEM_ICON[s.id];
    const icon = iconName ? Sprites.getDecor(iconName) : null;
    if (icon && icon.width > 1) {
      const pad = 2, inner = size - pad * 2;
      const sc = Math.min(inner / icon.width, inner / icon.height);
      const dw = Math.max(1, Math.round(icon.width * sc));
      const dh = Math.max(1, Math.round(icon.height * sc));
      ctx.drawImage(icon, x + Math.floor((size - dw) / 2), y + Math.floor((size - dh) / 2), dw, dh);
    } else {
      const pad = 3;
      ctx.fillStyle = def.color;
      ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + pad + 0.5, y + pad + 0.5, size - pad * 2 - 1, size - pad * 2 - 1);
    }
    if (s.count > 1) {
      const txt = String(s.count);
      Font.draw(ctx, txt, x + size - 2 - Font.width(txt, 1), y + size - 8, '#fff', 1);
    }
  }

  function drawInventoryPanel() {
    const L = getInvLayout();
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(L.px, L.py, L.panelW, L.panelH);
    ctx.strokeStyle = '#f9d54f'; ctx.lineWidth = 1;
    ctx.strokeRect(L.px + 0.5, L.py + 0.5, L.panelW - 1, L.panelH - 1);
    Font.draw(ctx, 'INVENTORY', L.px + 8, L.py + 6, '#f9d54f', 1);
    const gx = L.px + 8, gy = L.py + 22;
    for (let r = 0; r < INV_ROWS; r++) for (let c = 0; c < INV_COLS; c++) {
      const idx = r * INV_COLS + c;
      const x = gx + c * (L.sSize + L.sGap);
      const y = gy + r * (L.sSize + L.sGap);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, L.sSize, L.sSize);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(x + 0.5, y + 0.5, L.sSize - 1, L.sSize - 1);
      const isDragged = inventory.drag && inventory.drag.from === 'grid' && inventory.drag.index === idx;
      if (!isDragged) drawSlotContent(inventory.grid[idx], x, y, L.sSize);
    }
  }

  // #3: тултип работает и для хотбара и для сетки, НО только при открытом инвентаре.
  function drawInventoryTooltip() {
    if (!inventory.open || inventory.drag) return;
    const hit = hitTestAnySlot(Input.mouse.x, Input.mouse.y);
    if (!hit) return;
    const stack = getStackAt(hit.area, hit.index);
    if (!stack) return;
    const lines = TOOLTIPS[stack.id];
    if (!lines) return;

    let w = 0;
    for (const l of lines) w = Math.max(w, Font.width(l, 1));
    const pad = 6;
    const boxW = w + pad * 2;
    const boxH = lines.length * 10 + pad * 2 - 2;

    let bx = Input.mouse.x + 8;
    let by = Input.mouse.y + 8;
    if (bx + boxW > W - 4) bx = Input.mouse.x - boxW - 4;
    if (by + boxH > H - 4) by = Input.mouse.y - boxH - 4;

    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = '#f9d54f';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

    for (let i = 0; i < lines.length; i++) {
      let col = '#fff';
      if (i === 0) col = '#f9d54f';
      else if (lines[i].indexOf('FOOD') === 0 || lines[i].indexOf('HEAL') === 0) col = '#7ee07e';
      Font.draw(ctx, lines[i], bx + pad, by + pad + i * 10, col, 1);
    }
  }

  function drawPauseMenu() {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    const L = getMenuLayout();
    ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.fillRect(L.px, L.py, L.pw, L.ph);
    ctx.strokeStyle = '#f9d54f'; ctx.lineWidth = 1;
    ctx.strokeRect(L.px + 0.5, L.py + 0.5, L.pw - 1, L.ph - 1);
    const t = 'PAUSED';
    Font.draw(ctx, t, L.px + Math.floor((L.pw - Font.width(t, 1)) / 2), L.py + 8, '#f9d54f', 1);
    for (let i = 0; i < menu.options.length; i++) {
      const oy = L.py + 28 + i * 14;
      const sel = i === menu.selected;
      Font.draw(ctx, (sel ? '> ' : '  ') + menu.options[i], L.px + 10, oy,
                sel ? '#ffffff' : '#8a8a8a', 1);
    }
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (Sprites.ready) update(dt);
    render();
    Input.endFrame();
    fpsAcc += dt; fpsCount++;
    if (fpsAcc >= 0.5) { fps = Math.round(fpsCount / fpsAcc); fpsAcc = 0; fpsCount = 0; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
