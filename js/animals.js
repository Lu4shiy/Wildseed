// js/animals.js
// Поведения + обход препятствий + стриминг по дистанции.
(function () {
  'use strict';

  const TILE_W = 32, TILE_H = 16;

  const HOME_LIMIT2      = 25;
  const DEATH_ANIM_DUR   = 0.5;
  const TARGET_COUNT     = 10;
  const RESPAWN_INTERVAL = 5;
  const MIN_SPAWN_DIST   = 8;
  const MAX_SPAWN_DIST   = 14;
  const LOW_POP_THRESH   = 4;
  const FREEZE_DIST2     = 40 * 40;   // дальше — не тикаем (стриминг)

  const BEHAVIORS = {
    shy:        { fleeRadius2: 9, fleeWhenHurt: true,  fleeHurtTime: 6, attackRange2: 0,    aggression: 0 },
    calm:       { fleeRadius2: 0, fleeWhenHurt: true,  fleeHurtTime: 6, attackRange2: 0,    aggression: 0 },
    neutral:    { fleeRadius2: 0, fleeWhenHurt: false, fleeHurtTime: 0, attackRange2: 2.25, aggression: 0, provokeTime: 8 },
    aggressive: { fleeRadius2: 0, fleeWhenHurt: false, fleeHurtTime: 0, attackRange2: 2.25, aggression: 1 }
  };

  const TYPE_DEFAULT_BEHAVIOR = { rabbit: 'shy', white_sheep: 'calm' };
  function defaultBehavior(type) { return TYPE_DEFAULT_BEHAVIOR[type] || 'calm'; }

  const animals = [];
  let respawnTimer = 2;

  function spawn(type, tx, ty, behavior) {
    behavior = behavior || defaultBehavior(type);
    animals.push({
      type, behavior,
      tx, ty,
      home: { tx, ty },
      hp: 20, maxHp: 20,
      dir: 1, frame: 0, animTime: 0,
      vx: 0, vy: 0,
      kx: 0, ky: 0,
      moving: false,
      wanderTimer: Math.random() * 2,
      speed: 34,
      hurtTimer: 0,
      fleeHurtTimer: 0,
      provokedTimer: 0,
      attackCd: 0,
      stuckTimer: 0,
      dying: false,
      deathTimer: 0
    });
  }

  function spawnGroup(cx, cy, count, type) {
    type = type || 'rabbit';
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 2;
      spawn(type, Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r));
    }
  }

  function clear() { animals.length = 0; }
  function get() { return animals; }

  function toJSON() {
    return animals.filter(a => !a.dying).map(a => ({
      type: a.type, behavior: a.behavior,
      tx: a.tx, ty: a.ty, hp: a.hp,
      homeTx: a.home.tx, homeTy: a.home.ty
    }));
  }
  function fromJSON(arr) {
    clear();
    if (!arr) return;
    for (const a of arr) {
      spawn(a.type, a.tx, a.ty, a.behavior);
      const inst = animals[animals.length - 1];
      inst.hp = a.hp;
      if (typeof a.homeTx === 'number') inst.home.tx = a.homeTx;
      if (typeof a.homeTy === 'number') inst.home.ty = a.homeTy;
    }
  }

  // Ищет ближайшее к желаемому направлению свободное направление.
  // Возвращает {x, y} — единичный вектор, либо null если всё занято.
  function pickFreeDirection(a, ctx, wantX, wantY) {
    const wl = Math.hypot(wantX, wantY);
    if (wl < 1e-4) return null;
    const wx = wantX / wl, wy = wantY / wl;

    // 16 направлений (каждые 22.5°)
    const dirs = [];
    for (let i = 0; i < 16; i++) {
      const ang = i * (Math.PI / 8);
      const dx = Math.cos(ang), dy = Math.sin(ang);
      dirs.push({ x: dx, y: dy, dot: dx * wx + dy * wy });
    }
    // Сортируем: сначала направления с наибольшим dot (ближе к желаемому).
    dirs.sort((p, q) => q.dot - p.dot);

    // Небольшой look-ahead, чтобы не идти вплотную к стене.
    const LOOK = 0.7;
    for (const d of dirs) {
      const nx = a.tx + d.x * LOOK;
      const ny = a.ty + d.y * LOOK;
      if (!ctx.collides(nx, ny, 0)) return d;
    }
    return null;
  }

  function update(dt, ctx) {
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];

      if (a.dying) {
        a.deathTimer -= dt;
        if (a.deathTimer <= 0) animals.splice(i, 1);
        continue;
      }

      if (a.hp <= 0) {
        a.dying = true;
        a.deathTimer = DEATH_ANIM_DUR;
        continue;
      }

      // Стриминг: очень далёких мобов не тикаем (они «зависают»).
      const pdxF = a.tx - ctx.player.tx;
      const pdyF = a.ty - ctx.player.ty;
      if (pdxF * pdxF + pdyF * pdyF > FREEZE_DIST2) continue;

      if (a.hurtTimer > 0)     a.hurtTimer -= dt;
      if (a.fleeHurtTimer > 0) a.fleeHurtTimer -= dt;
      if (a.provokedTimer > 0) a.provokedTimer -= dt;
      if (a.attackCd > 0)      a.attackCd -= dt;

      // Knockback
      if (a.kx !== 0 || a.ky !== 0) {
        const ntx = a.tx + a.kx * dt;
        const nty = a.ty + a.ky * dt;
        if (!ctx.collides(ntx, a.ty, 0)) a.tx = ntx;
        if (!ctx.collides(a.tx, nty, 0)) a.ty = nty;
        a.kx *= Math.pow(0.02, dt);
        a.ky *= Math.pow(0.02, dt);
        if (Math.abs(a.kx) < 0.3) a.kx = 0;
        if (Math.abs(a.ky) < 0.3) a.ky = 0;
      }

      const beh = BEHAVIORS[a.behavior] || BEHAVIORS.calm;

      const pdx = a.tx - ctx.player.tx;
      const pdy = a.ty - ctx.player.ty;
      const pd2 = pdx * pdx + pdy * pdy;

      const hdx = a.tx - a.home.tx;
      const hdy = a.ty - a.home.ty;
      const hd2 = hdx * hdx + hdy * hdy;

      const fleeForced = a.fleeHurtTimer > 0;
      const fleeFromPlayer =
        beh.fleeRadius2 > 0 && pd2 < beh.fleeRadius2 && pd2 > 0.001;

      const isProvoked = a.behavior === 'neutral' && a.provokedTimer > 0;
      const wantsAttack = beh.aggression > 0 || isProvoked;

      let mode = 'wander';

      if (fleeForced || (fleeFromPlayer && hd2 < HOME_LIMIT2)) {
        mode = 'flee';
        const d = Math.max(0.001, Math.sqrt(pd2));
        a.vx = pdx / d; a.vy = pdy / d;
        a.moving = true;
      } else if (wantsAttack && pd2 < 64 && pd2 > 0.001) {
        mode = 'chase';
        const d = Math.sqrt(pd2);
        if (pd2 > beh.attackRange2) {
          a.vx = -pdx / d; a.vy = -pdy / d;
          a.moving = true;
        } else {
          a.moving = false; a.vx = 0; a.vy = 0;
          if (a.attackCd <= 0) {
            ctx.player.hp = Math.max(0, (ctx.player.hp || 0) - 5);
            ctx.player.hurtTimer = 0.3;
            a.attackCd = 1.0;
          }
        }
      } else if (hd2 > HOME_LIMIT2) {
        mode = 'home';
        const d = Math.sqrt(hd2);
        a.vx = -hdx / d; a.vy = -hdy / d;
        a.moving = true;
      } else {
        a.wanderTimer -= dt;
        if (a.wanderTimer <= 0) {
          a.wanderTimer = 2 + Math.random() * 3.5;
          if (Math.random() < 0.45) { a.moving = false; a.vx = 0; a.vy = 0; }
          else {
            a.moving = true;
            const ang = Math.random() * Math.PI * 2;
            a.vx = Math.cos(ang); a.vy = Math.sin(ang);
          }
        }
      }

      if (a.moving) {
        let sp = a.speed;
        if (mode === 'flee')       sp = a.speed * 1.7;
        else if (mode === 'home')  sp = a.speed * 0.8;
        else if (mode === 'chase') sp = a.speed * 1.4;

        const dSX = a.vx * sp * dt, dSY = a.vy * sp * dt;
        const dtx = ( dSX / (TILE_W / 2) + dSY / (TILE_H / 2)) / 2;
        const dty = (-dSX / (TILE_W / 2) + dSY / (TILE_H / 2)) / 2;

        // Пробуем прямое движение с раздельными осями (slide вдоль стены).
        let movedX = false, movedY = false;
        const ntx = a.tx + dtx;
        if (!ctx.collides(ntx, a.ty, 0)) { a.tx = ntx; movedX = true; }
        const nty = a.ty + dty;
        if (!ctx.collides(a.tx, nty, 0)) { a.ty = nty; movedY = true; }

        if (movedX && !movedY) a.vy = 0;
        if (movedY && !movedX) a.vx = 0;

        if (!movedX && !movedY) {
          // Полностью застряли: ищем обход (лучшее приближение к желаемому).
          a.stuckTimer = (a.stuckTimer || 0) + dt;
          if (a.stuckTimer > 0.05) {
            a.stuckTimer = 0;
            const alt = pickFreeDirection(a, ctx, a.vx, a.vy);
            if (alt) { a.vx = alt.x; a.vy = alt.y; }
            else {
              a.moving = false; a.vx = 0; a.vy = 0;
              a.wanderTimer = 1 + Math.random() * 2;
            }
          }
        } else {
          a.stuckTimer = 0;
        }

        if (Math.abs(a.vx) > Math.abs(a.vy)) a.dir = a.vx > 0 ? 3 : 2;
        else                                 a.dir = a.vy > 0 ? 1 : 0;

        const animMul = mode === 'flee' ? 2.3 : mode === 'chase' ? 1.9 : 1.4;
        a.animTime += dt * animMul;
        a.frame = Math.floor(a.animTime * 6) % 4;
      } else {
        a.frame = 0; a.animTime = 0;
      }
    }
  }

  function trySpawnOne(ctx) {
    const p = ctx.player;
    const mvx = p.lastMoveWX || 0;
    const mvy = p.lastMoveWY || 0;
    const moving = (mvx * mvx + mvy * mvy) > 0.01;
    const baseAng = moving ? Math.atan2(mvy, mvx) : 0;

    for (let tries = 0; tries < 40; tries++) {
      let ang;
      if (moving) ang = baseAng + (Math.random() - 0.5) * (Math.PI * 0.78);
      else        ang = Math.random() * Math.PI * 2;
      const dist = MIN_SPAWN_DIST + Math.random() * (MAX_SPAWN_DIST - MIN_SPAWN_DIST);
      const tx = Math.round(p.tx + Math.cos(ang) * dist);
      const ty = Math.round(p.ty + Math.sin(ang) * dist);
      if (ctx.isWater(tx, ty)) continue;
      if (ctx.collides(tx, ty, 0)) continue;
      const type = Math.random() < 0.3 ? 'white_sheep' : 'rabbit';
      spawn(type, tx, ty);
      return true;
    }
    return false;
  }

  function updateSpawner(dt, ctx) {
    respawnTimer -= dt;
    if (respawnTimer > 0) return;
    respawnTimer = RESPAWN_INTERVAL;

    const alive = animals.filter(a => !a.dying).length;
    if (alive >= TARGET_COUNT) return;

    let perTick;
    if (alive === 0)                 perTick = 4;
    else if (alive < LOW_POP_THRESH) perTick = 2;
    else                             perTick = 1;
    const need = Math.min(perTick, TARGET_COUNT - alive);

    let spawned = 0;
    for (let i = 0; i < need; i++) if (trySpawnOne(ctx)) spawned++;
    if (spawned > 0) console.log('[animals] respawn +' + spawned + ' | alive now ' + (alive + spawned));
  }

  function hit(a, dmg, fromTx, fromTy) {
    if (a.dying) return false;
    const beh = BEHAVIORS[a.behavior] || BEHAVIORS.calm;

    a.hp -= dmg;
    a.hurtTimer = 0.25;

    if (beh.fleeWhenHurt) a.fleeHurtTimer = beh.fleeHurtTime;
    if (a.behavior === 'neutral') a.provokedTimer = beh.provokeTime || 8;

    const dx = a.tx - fromTx, dy = a.ty - fromTy;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    const kb = 7;
    a.kx = dx / d * kb;
    a.ky = dy / d * kb;

    if (a.hp <= 0) {
      a.dying = true;
      a.deathTimer = DEATH_ANIM_DUR;
      return true;
    }
    return false;
  }

  function findAt(worldX, worldY, rangeTile, player) {
    let best = null, bestD = Infinity;
    for (const a of animals) {
      if (a.dying) continue;
      const d2 = (a.tx - worldX) ** 2 + (a.ty - worldY) ** 2;
      if (d2 < 0.7 * 0.7 && d2 < bestD) {
        const pd = (a.tx - player.tx) ** 2 + (a.ty - player.ty) ** 2;
        if (pd <= rangeTile * rangeTile) { best = a; bestD = d2; }
      }
    }
    return best;
  }

  window.Animals = {
    spawn, spawnGroup, clear, get, update, updateSpawner,
    hit, findAt, toJSON, fromJSON, DEATH_ANIM_DUR, BEHAVIORS
  };
})();