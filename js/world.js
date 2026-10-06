// js/world.js
// Изометрия + голод/жажда по сложности + пополнение жажды у воды +
// еда 2.5 сек с анимацией + реген HP + зайцы группами + tint+knockback.
(function () {
  'use strict';

  const TILE_W = 32, TILE_H = 16, W = 480, H = 270;
  const RANGE = 4;

  let worldCfg = { seed: 12345, name: 'World', size: 512, difficulty: 'Normal', keepInventory: false };
  try {
    const s = localStorage.getItem('wildseed.worldCfg');
    if (s) worldCfg = Object.assign(worldCfg, JSON.parse(s));
  } catch (e) {}
  const SEED = (parseInt(worldCfg.seed, 10) | 0) || 12345;
  const SAVE_KEY = 'wildseed.save.v4.' + SEED;

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
    berry:           { color: '#d04040', max: 99, food: 0.5 },
    flower:          { color: '#e84a5f', max: 99 },
    raw_rabbit_meat: { color: '#c06060', max: 99, food: 1.0 },
    rabbit_skin:     { color: '#a87850', max: 99 }
  };
  const ITEM_ICON = {
    wood: 'wood_log',
    stone: 'rock',
    golden_ore: 'golden_ore',
    berry: 'bush',
    flower: 'flower',
    fiber: null,
    raw_rabbit_meat: 'raw_rabbit_meat',
    rabbit_skin:     'rabbit_skin'
  };
  const TOOLTIPS = {
    wood:            ['WOOD', 'MATERIAL', 'BREAK IN 1.8S'],
    stone:           ['STONE', 'MATERIAL', 'BREAK IN 2.1S'],
    golden_ore:      ['GOLDEN ORE', 'MATERIAL', 'BREAK IN 2.8S'],
    fiber:           ['FIBER', 'MATERIAL'],
    berry:           ['BERRY', 'FOOD +0.5'],
    flower:          ['FLOWER', 'DECORATION'],
    raw_rabbit_meat: ['RAW RABBIT MEAT', 'FOOD +1.0'],
    rabbit_skin:     ['RABBIT SKIN', 'MATERIAL']
  };
  const DECOR_DROPS = {
    tree:       { id: 'wood',       count: 3 },
    bush:       { id: 'berry',      count: 2 },
    rock:       { id: 'stone',      count: 2 },
    golden_ore: { id: 'golden_ore', count: 2 },
    flower:     { id: 'flower',     count: 1 }
  };
  const DECOR_HEIGHT = { tree: 2, bush: 1, rock: 1, golden_ore: 1, flower: 0 };
  const PLACEABLE    = { wood: 'tree', stone: 'rock', flower: 'flower' };

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
  const ST_SPRINT_COST = 14;
  const ST_REGEN = 8;
  const HUNGER_STAMINA_LOCK = 4;   // единиц (не >4)

  // Голод/жажда — шкала 0..10. Extreme: голод 10/600s бега, жажда 10/420s бега.
  // При ходьбе ×0.4, стоя 0. Другие сложности — мягче.
  const DIFF_HUNGER = { Easy: 0.4, Normal: 0.6, Hard: 0.8, Extreme: 1.0 };
  const DIFF_THIRST = { Easy: 0.4, Normal: 0.6, Hard: 0.8, Extreme: 1.0 };
  const HUNGER_RUN_RATE = 10 / 600;   // units/sec at Extreme+run
  const THIRST_RUN_RATE = 10 / 420;
  const WALK_MULT       = 0.4;
  const WATER_THIRST_REGEN = 0.5;     // +0.5 единиц/сек стоя в воде

  const player = {
    tx: 0, ty: 0, z: 0, vz: 0, onGround: true,
    dir: 0, frame: 0, animTime: 0, moving: false, sprinting: false,
    hp: 100, maxHp: 100,
    hunger: 10, maxHunger: 10,
    thirst: 10, maxThirst: 10,
    stamina: 100, maxStamina: 100,
    healTimer: 0,
    inWater: false
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
        v: 4,
        inv: { hotbar: inventory.hotbar, grid: inventory.grid, selected: inventory.selected },
        player: {
          tx: player.tx, ty: player.ty, hp: player.hp,
          hunger: player.hunger, thirst: player.thirst
        },
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
        if (typeof d.player.hunger === 'number') player.hunger = d.player.hunger;
        if (typeof d.player.thirst === 'number') player.thirst = d.player.thirst;
      }
      if (d.decor) Chunks.setModified(d.decor);
      if (d.animals) Animals.fromJSON(d.animals);
      return true;
    } catch (e) { console.warn('[load]', e.message); return false; }
  }
  window.addEventListener('beforeunload', saveGame);

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

  // #12: первый заход — полные статы, спавн групп зайцев.
  if (!loaded) {
    player.hp = player.maxHp;
    player.hunger = player.maxHunger;
    player.thirst = player.maxThirst;
    player.stamina = player.maxStamina;

    // #2: 3 группы по 1–3 зайца.
    for (let g = 0; g < 3; g++) {
      let ax = 0, ay = 0;
      for (let tries = 0; tries < 30; tries++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 6 + Math.random() * 10;
        ax = Math.round(player.tx + Math.cos(ang) * dist);
        ay = Math.round(player.ty + Math.sin(ang) * dist);
        if (Chunks.getTile(ax, ay, SEED) !== 'water' && !collides(ax, ay, 0)) break;
      }
      const n = 1 + Math.floor(Math.random() * 3);  // 1..3
      Animals.spawnGroup(ax, ay, n);
    }
    markDirty();
  }

  const MINING_TIME_PER_HP = 0.35;
  let miningTarget = null, miningProgress = 0;
  let attackCooldown = 0;
  let autoSaveTimer = 0;
  let sprintLocked = false;

  // #6: еда — 2.5 сек, прерывается движением/ЛКМ/выпусканием ПКМ.
  const EAT_DURATION = 2.5;
  let eating = null;   // { area, index, progress }

  const menu = { open: false, selected: 0, options: ['RESUME', 'EXIT TO MENU'] };

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

    const holdSprint = Input.keys['ShiftLeft'] || Input.keys['ShiftRight'];
    if (sprintLocked) {
      if (!holdSprint) sprintLocked = false;
      else if (player.stamina >= player.maxStamina * 0.25) sprintLocked = false;
    }

    // #11: спринт запрещён при hunger <= 4
    const canSprint = player.hunger > HUNGER_STAMINA_LOCK;
    const sprinting = holdSprint && !sprintLocked && len > 0.01 && player.stamina > 1 && canSprint;

    if (sprinting) {
      player.stamina = Math.max(0, player.stamina - ST_SPRINT_COST * dt);
      if (player.stamina <= 0.01) { player.stamina = 0; sprintLocked = true; }
    } else if (player.hunger > HUNGER_STAMINA_LOCK) {
      player.stamina = Math.min(player.maxStamina, player.stamina + ST_REGEN * dt);
    }

    const blocked = inventory.open || menu.open;
    player.moving = len > 0 && !blocked;
    player.sprinting = sprinting;

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

    // #4: если игрок стоит на воде (или около) и стоит — жажда восстанавливается.
    const ptx = Math.round(player.tx), pty = Math.round(player.ty);
    let nearWater = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (Chunks.getTile(ptx + dx, pty + dy, SEED) === 'water') { nearWater = true; break; }
    }
    if (nearWater) {
      player.inWater = true;
      if (!player.moving) {
        player.thirst = Math.min(player.maxThirst, player.thirst + WATER_THIRST_REGEN * dt);
      }
    } else player.inWater = false;
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

  function swapWithHotbar(fromArea, fromIdx, hotbarIdx) {
    if (fromArea === 'hotbar' && fromIdx === hotbarIdx) return;
    const src = getStackAt(fromArea, fromIdx);
    const dst = inventory.hotbar[hotbarIdx];
    if (fromArea === 'hotbar') inventory.hotbar[fromIdx] = dst;
    else                       setStackAt(fromArea, fromIdx, dst);
    inventory.hotbar[hotbarIdx] = src;
    markDirty(); saveGame();
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
    if (Input.mouse.right) { /* ПКМ в инвентаре — использовать/съесть стартует ниже */ return; }
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

  // Кладём блок. Еда — не сюда, еда через eatUpdate.
  function tryPlace(area, index) {
    const stack = getStackAt(area, index);
    if (!stack) return false;
    if (!PLACEABLE[stack.id]) return false;
    const w = screenToWorld(Input.mouse.x, Input.mouse.y);
    const tx = Math.round(w.tx), ty = Math.round(w.ty);
    if (playerOverlapsTile(tx, ty)) return false;
    const ddx = tx - player.tx, ddy = ty - player.ty;
    if (ddx * ddx + ddy * ddy > RANGE * RANGE) return false;
    if (Chunks.getDecor(tx, ty, SEED)) return false;
    if (Chunks.getTile(tx, ty, SEED) === 'water') return false;
    const type = PLACEABLE[stack.id];
    const hp = type === 'tree' ? 5 : type === 'rock' ? 6 : 1;
    Chunks.setDecor(tx, ty, SEED, { type, hp, maxHp: hp });
    stack.count -= 1;
    if (stack.count <= 0) setStackAt(area, index, null);
    markDirty(); saveGame();
    return true;
  }

  function startEat(area, index) {
    const stack = getStackAt(area, index);
    if (!stack) return false;
    const def = ITEMS[stack.id];
    if (!def || !def.food) return false;
    eating = { area, index, progress: 0 };
    return true;
  }

  function cancelEat() { eating = null; }

  function updateEating(dt) {
    if (!eating) return;
    const stack = getStackAt(eating.area, eating.index);
    if (!stack || !ITEMS[stack.id] || !ITEMS[stack.id].food) { eating = null; return; }

    // прерывание
    if (player.moving || inventory.open || menu.open || !Input.mouse.right) {
      eating = null; return;
    }

    eating.progress += dt;
    if (eating.progress >= EAT_DURATION) {
      const def = ITEMS[stack.id];
      player.hunger = Math.min(player.maxHunger, player.hunger + def.food);
      stack.count -= 1;
      if (stack.count <= 0) setStackAt(eating.area, eating.index, null);
      eating = null;
      markDirty(); saveGame();
    }
  }

  function updateMining(dt) {
    if (inventory.open || menu.open || !Input.mouse.left || inventory.drag || eating) {
      miningTarget = null; miningProgress = 0; return;
    }
    if (hitTestHotbar(Input.mouse.x, Input.mouse.y)) {
      miningTarget = null; miningProgress = 0; return;
    }

    const w = screenToWorld(Input.mouse.x, Input.mouse.y);

    if (attackCooldown <= 0) {
      const a = Animals.findAt(w.tx, w.ty, RANGE, player);
      if (a) {
        if (Animals.hit(a, 5, player.tx, player.ty)) {
          addItem('raw_rabbit_meat', 1);
          if (Math.random() < 0.6) addItem('rabbit_skin', 1);
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

    // Инвентарь открыт: ЛКМ — слоты, ПКМ — использовать из сетки (еда стартует)
    if (inventory.open) {
      if (Input.mouse.leftPressed) {
        const hit = hitTestAnySlot(mx, my);
        if (hit) handleInventoryClick();
      }
      if (Input.mouse.rightPressed) {
        const hit = hitTestInventory(mx, my);
        if (hit) {
          const st = getStackAt(hit.area, hit.index);
          if (st && ITEMS[st.id] && ITEMS[st.id].food) startEat(hit.area, hit.index);
          else tryPlace(hit.area, hit.index);
        }
      }
      Input.mouse.leftPressed = false;
      Input.mouse.rightPressed = false;
      return;
    }

    // Инвентарь закрыт.
    if (Input.mouse.leftPressed) {
      const hotHit = hitTestHotbar(mx, my);
      if (hotHit) inventory.selected = hotHit.index;
    }

    // #9: ПКМ где угодно — используем выбранный слот хотбара.
    //     Если курсор на слоте N, сперва делаем N активным.
    if (Input.mouse.rightPressed) {
      const hotHit = hitTestHotbar(mx, my);
      if (hotHit) inventory.selected = hotHit.index;
      const sel = inventory.selected;
      const st = inventory.hotbar[sel];
      if (st) {
        if (ITEMS[st.id] && ITEMS[st.id].food) startEat('hotbar', sel);
        else tryPlace('hotbar', sel);
      }
    }

    Input.mouse.leftPressed = false;
    Input.mouse.rightPressed = false;
  }

  function updateHungerThirst(dt) {
    const hm = DIFF_HUNGER[worldCfg.difficulty] || 0.6;
    const tm = DIFF_THIRST[worldCfg.difficulty] || 0.6;

    let moveMult = 0;
    if (player.moving) moveMult = player.sprinting ? 1.0 : WALK_MULT;

    player.hunger = Math.max(0, player.hunger - HUNGER_RUN_RATE * hm * moveMult * dt);
    player.thirst = Math.max(0, player.thirst - THIRST_RUN_RATE * tm * moveMult * dt);

    if (player.hunger <= 0) player.hp = Math.max(0, player.hp - 1 * dt);

    // #10: реген HP — только при ПОЛНОМ голоде, 1 HP / 10 сек, потом −1 голод.
    if (player.hunger >= player.maxHunger && player.hp < player.maxHp) {
      player.healTimer += dt;
      player.hp = Math.min(player.maxHp, player.hp + dt * 0.1);
      if (player.healTimer >= 10) {
        player.healTimer = 0;
        player.hunger = Math.max(0, player.hunger - 1);
      }
      if (player.hp >= player.maxHp) player.healTimer = 0;
    } else {
      player.healTimer = 0;
    }
  }

  function update(dt) {
    if (attackCooldown > 0) attackCooldown -= dt;
    updateMenusAndKeys();
    handleWheel();
    handleMouseClicks();

    if (!menu.open) {
      updateMovement(dt);
      updateEating(dt);
      updateMining(dt);
      Animals.update(dt, { collides, player });
      updateHungerThirst(dt);
    }

    const pc = worldToScreen(player.tx, player.ty);
    camera.x = Math.round(pc.x - W / 2);
    camera.y = Math.round(pc.y - H / 2);

    autoSaveTimer += dt;
    if (autoSaveTimer >= 5 && dirty) { autoSaveTimer = 0; saveGame(); }
  }

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
    const st = 'LOADING ' + Sprites.loaded + ' / ' + total;
    Font.draw(ctx, st, (W - Font.width(st, 1)) / 2, H / 2 - 4, '#fff', 1);
    const bw = 140, bh = 8, bx = Math.floor((W - bw) / 2), by = H / 2 + 14;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#f9d54f'; ctx.fillRect(bx, by, Math.floor(bw * Sprites.loaded / total), bh);
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
    for (const a of Animals.get()) items.push({ kind: 'animal', a, depth: a.tx + a.ty });
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
        Sprites.drawRabbit(ctx, sx, sy, a.dir, a.frame, a.hurtTimer > 0);
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
    if (eating) drawEatProgress();
    if (inventory.drag) drawSlotContent(inventory.drag.stack, Input.mouse.x - 9, Input.mouse.y - 9, 18);
    if (inventory.open) drawInventoryTooltip();
    if (menu.open) drawPauseMenu();
  }

  const HEART_PATTERN  = ['0110110','1111111','1111111','0111110','0011100','0001000'];
  const DROP_PATTERN   = ['0001000','0011100','0111110','1111111','1111111','0111110','0011100'];
  const HUNGER_PATTERN = ['0011100','0111110','1111111','1111111','0111110','0011100','0001000'];

  function drawPattern(x, y, pattern, color) {
    ctx.fillStyle = color;
    for (let r = 0; r < pattern.length; r++) {
      const row = pattern[r];
      for (let c = 0; c < row.length; c++) {
        if (row.charCodeAt(c) === 49) ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
  }
  // Рисует иконку с частичной заливкой по vertical fill: 0..1 — сколько заполнено снизу.
  function drawPatternPartial(x, y, pattern, fillColor, emptyColor, fill) {
    const h = pattern.length;
    const w = pattern[0].length;
    // пусто
    for (let r = 0; r < h; r++) {
      const row = pattern[r];
      for (let c = 0; c < w; c++) {
        if (row.charCodeAt(c) === 49) ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
    // заполненная часть — сверху вниз, fill сверху вниз = 0 снизу -> empty, 1 сверху -> full
    ctx.fillStyle = fillColor;
    const filledRows = Math.round(fill * h);
    for (let r = 0; r < filledRows; r++) {
      const row = pattern[r];
      for (let c = 0; c < w; c++) {
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
    const slotW = 7, slotGap = 1;

    // Hearts (left, bottom row)
    const heartsY = L.hy - 14;
    const hpFull = player.hp / player.maxHp;
    for (let i = 0; i < 10; i++) {
      const fill = Math.max(0, Math.min(1, hpFull * 10 - i));
      drawPatternPartial(L.hx + i * (slotW + slotGap), heartsY, HEART_PATTERN,
                         '#e04040', 'rgba(60,20,20,0.9)', fill);
    }

    // Right column: thirst (top), hunger (bottom)
    const rightX = L.hx + L.totalW - (10 * slotW + 9 * slotGap);

    const thirstY = L.hy - 24;
    const thFull = player.thirst / player.maxThirst;
    for (let i = 0; i < 10; i++) {
      const fill = Math.max(0, Math.min(1, thFull * 10 - i));
      drawPatternPartial(rightX + i * (slotW + slotGap), thirstY, DROP_PATTERN,
                         '#40a0e0', 'rgba(15,40,60,0.9)', fill);
    }

    const hungerY = L.hy - 14;
    const hnFull = player.hunger / player.maxHunger;
    for (let i = 0; i < 10; i++) {
      const fill = Math.max(0, Math.min(1, hnFull * 10 - i));
      drawPatternPartial(rightX + i * (slotW + slotGap), hungerY, HUNGER_PATTERN,
                         '#e08030', 'rgba(60,30,10,0.9)', fill);
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

  // #6: прогресс-бар еды над хотбаром.
  function drawEatProgress() {
    const L = getHudLayout();
    const p = Math.min(1, eating.progress / EAT_DURATION);
    const barW = 60, barH = 4;
    const bx = Math.floor((W - barW) / 2);
    const by = L.hy - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#7ee07e';
    ctx.fillRect(bx, by, Math.floor(barW * p), barH);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, barW - 1, barH - 1);
    const txt = 'EATING...';
    Font.draw(ctx, txt, bx + Math.floor((barW - Font.width(txt, 1)) / 2), by - 9, '#fff', 1);
  }

  function drawSlotContent(s, x, y, size) {
    if (!s) return;
    const def = ITEMS[s.id]; if (!def) return;
    const icon = Sprites.getIcon(ITEM_ICON[s.id]);
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
    let bx = Input.mouse.x + 8, by = Input.mouse.y + 8;
    if (bx + boxW > W - 4) bx = Input.mouse.x - boxW - 4;
    if (by + boxH > H - 4) by = Input.mouse.y - boxH - 4;

    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = '#f9d54f'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

    for (let i = 0; i < lines.length; i++) {
      let col = '#fff';
      if (i === 0) col = '#f9d54f';
      else if (lines[i].indexOf('FOOD') === 0) col = '#7ee07e';
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
