// js/animals.js
// Заяц: группы 1–3, wander вокруг home (≤5 тайлов), flee 4 тайла,
// knockback, анимация смерти, респавнер.
(function () {
  'use strict';

  const TILE_W = 32, TILE_H = 16;
  const HOME_LIMIT2      = 25;    // 5 тайлов² — не разбредаются
  const FLEE_R2          = 16;    // 4 тайла²
  const DEATH_ANIM_DUR   = 0.5;
  const TARGET_COUNT     = 10;    // сколько живых хотим вокруг игрока
  const RESPAWN_INTERVAL = 5;     // проверка раз в 5 сек (было 15)
  const MIN_SPAWN_DIST   = 8;     // ближе к краю кадра (было 12)
  const MAX_SPAWN_DIST   = 14;    // (было 25)
  const LOW_POP_THRESH   = 4;     // если живых мало — спавним больше сразу

  const animals = [];
  let respawnTimer = 2;   // первый чек через 2 сек

  function spawn(type, tx, ty) {
    animals.push({
      type, tx, ty,
      home: { tx, ty },
      hp: 20, maxHp: 20,
      dir: 1, frame: 0, animTime: 0,
      vx: 0, vy: 0,
      kx: 0, ky: 0,
      moving: false,
      wanderTimer: Math.random() * 2,
      speed: 34,
      hurtTimer: 0,
      dying: false,
      deathTimer: 0
    });
  }

  function spawnGroup(cx, cy, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 2;
      spawn('rabbit', Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r));
    }
  }

  function clear() { animals.length = 0; }
  function get() { return animals; }

  function toJSON() {
    return animals.filter(a => !a.dying).map(a => ({
      type: a.type, tx: a.tx, ty: a.ty, hp: a.hp,
      homeTx: a.home.tx, homeTy: a.home.ty
    }));
  }
  function fromJSON(arr) {
    clear();
    if (!arr) return;
    for (const a of arr) {
      spawn(a.type, a.tx, a.ty);
      const inst = animals[animals.length - 1];
      inst.hp = a.hp;
      if (typeof a.homeTx === 'number') inst.home.tx = a.homeTx;
      if (typeof a.homeTy === 'number') inst.home.ty = a.homeTy;
    }
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

      if (a.hurtTimer > 0) a.hurtTimer -= dt;

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

      const pdx = a.tx - ctx.player.tx;
      const pdy = a.ty - ctx.player.ty;
      const pd2 = pdx * pdx + pdy * pdy;

      const hdx = a.tx - a.home.tx;
      const hdy = a.ty - a.home.ty;
      const hd2 = hdx * hdx + hdy * hdy;

      let mode = 'wander';

      if (pd2 < FLEE_R2 && pd2 > 0.001 && hd2 < HOME_LIMIT2) {
        mode = 'flee';
        const d = Math.sqrt(pd2);
        a.vx = pdx / d; a.vy = pdy / d;
        a.moving = true;
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
        if (mode === 'flee') sp = a.speed * 1.7;
        else if (mode === 'home') sp = a.speed * 0.8;

        const dSX = a.vx * sp * dt, dSY = a.vy * sp * dt;
        const dtx = ( dSX / (TILE_W / 2) + dSY / (TILE_H / 2)) / 2;
        const dty = (-dSX / (TILE_W / 2) + dSY / (TILE_H / 2)) / 2;

        const ntx = a.tx + dtx;
        if (!ctx.collides(ntx, a.ty, 0)) a.tx = ntx; else a.vx = -a.vx;
        const nty = a.ty + dty;
        if (!ctx.collides(a.tx, nty, 0)) a.ty = nty; else a.vy = -a.vy;

        if (Math.abs(a.vx) > Math.abs(a.vy)) a.dir = a.vx > 0 ? 3 : 2;
        else                                 a.dir = a.vy > 0 ? 1 : 0;

        a.animTime += dt * (mode === 'flee' ? 2.3 : 1.4);
        a.frame = Math.floor(a.animTime * 6) % 4;
      } else {
        a.frame = 0; a.animTime = 0;
      }
    }
  }

  function trySpawnOne(ctx) {
    for (let tries = 0; tries < 40; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = MIN_SPAWN_DIST + Math.random() * (MAX_SPAWN_DIST - MIN_SPAWN_DIST);
      const tx = Math.round(ctx.player.tx + Math.cos(ang) * dist);
      const ty = Math.round(ctx.player.ty + Math.sin(ang) * dist);
      if (ctx.isWater(tx, ty)) continue;
      if (ctx.collides(tx, ty, 0)) continue;
      spawn('rabbit', tx, ty);
      return true;
    }
    return false;
  }

  // Респавнер: держим популяцию ~TARGET_COUNT.
  function updateSpawner(dt, ctx) {
    respawnTimer -= dt;
    if (respawnTimer > 0) return;
    respawnTimer = RESPAWN_INTERVAL;

    const alive = animals.filter(a => !a.dying).length;
    if (alive >= TARGET_COUNT) return;

    // Чем меньше живых — тем агрессивнее спавним за один тик.
    let perTick;
    if (alive === 0)                 perTick = 4;
    else if (alive < LOW_POP_THRESH) perTick = 2;
    else                             perTick = 1;
    const need = Math.min(perTick, TARGET_COUNT - alive);

    let spawned = 0;
    for (let i = 0; i < need; i++) {
      if (trySpawnOne(ctx)) spawned++;
    }
    if (spawned > 0) {
      console.log('[animals] respawn +', spawned, '| alive:', alive + spawned);
    }
  }

  function hit(a, dmg, fromTx, fromTy) {
    if (a.dying) return false;
    a.hp -= dmg;
    a.hurtTimer = 0.25;
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
    hit, findAt, toJSON, fromJSON, DEATH_ANIM_DUR
  };
})();
