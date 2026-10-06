// js/animals.js
// Животные: зайцы. Wander AI + flee от игрока. Хранит состояние в массиве.
(function () {
  'use strict';

  const TILE_W = 32, TILE_H = 16;

  const animals = [];

  function spawn(type, tx, ty) {
    animals.push({
      type: type,
      tx: tx, ty: ty,
      hp: 20, maxHp: 20,
      dir: 1,
      frame: 0, animTime: 0,
      vx: 0, vy: 0,
      moving: false,
      wanderTimer: Math.random() * 2,
      speed: 34,
      hurtTimer: 0
    });
  }

  function clear() { animals.length = 0; }

  function get() { return animals; }

  function toJSON() {
    return animals.map(a => ({
      type: a.type, tx: a.tx, ty: a.ty, hp: a.hp
    }));
  }
  function fromJSON(arr) {
    clear();
    if (!arr) return;
    for (const a of arr) {
      spawn(a.type, a.tx, a.ty);
      animals[animals.length - 1].hp = a.hp;
    }
  }

  // ctx = { collides(ntx, nty, zTiles), player }
  function update(dt, ctx) {
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];
      if (a.hp <= 0) { animals.splice(i, 1); continue; }

      if (a.hurtTimer > 0) a.hurtTimer -= dt;

      // Flee от игрока
      const pdx = a.tx - ctx.player.tx;
      const pdy = a.ty - ctx.player.ty;
      const pd2 = pdx * pdx + pdy * pdy;
      let fleeing = false;
      if (pd2 < 25 && pd2 > 0.001) {
        fleeing = true;
        const d = Math.sqrt(pd2);
        a.vx = pdx / d; a.vy = pdy / d;
        a.moving = true;
      } else {
        a.wanderTimer -= dt;
        if (a.wanderTimer <= 0) {
          a.wanderTimer = 1.5 + Math.random() * 3;
          if (Math.random() < 0.35) { a.moving = false; a.vx = 0; a.vy = 0; }
          else {
            a.moving = true;
            const ang = Math.random() * Math.PI * 2;
            a.vx = Math.cos(ang); a.vy = Math.sin(ang);
          }
        }
      }

      if (a.moving) {
        const sp = fleeing ? a.speed * 1.8 : a.speed;
        const dSX = a.vx * sp * dt, dSY = a.vy * sp * dt;
        const dtx = ( dSX / (TILE_W / 2) + dSY / (TILE_H / 2)) / 2;
        const dty = (-dSX / (TILE_W / 2) + dSY / (TILE_H / 2)) / 2;

        const ntx = a.tx + dtx;
        if (!ctx.collides(ntx, a.ty, 0)) a.tx = ntx;
        else { a.vx = -a.vx; }

        const nty = a.ty + dty;
        if (!ctx.collides(a.tx, nty, 0)) a.ty = nty;
        else { a.vy = -a.vy; }

        // направление
        if (Math.abs(a.vx) > Math.abs(a.vy)) a.dir = a.vx > 0 ? 3 : 2;
        else                                 a.dir = a.vy > 0 ? 1 : 0;

        a.animTime += dt * (fleeing ? 2.5 : 1.4);
        a.frame = Math.floor(a.animTime * 8) % 2;
      } else {
        a.frame = 0; a.animTime = 0;
      }
    }
  }

  function hit(a, dmg) {
    a.hp -= dmg;
    a.hurtTimer = 0.25;
    return a.hp <= 0;
  }

  // Найти ближайшее животное под курсором в радиусе rangeTile.
  function findAt(worldX, worldY, rangeTile, player) {
    let best = null, bestD = Infinity;
    for (const a of animals) {
      const d2 = (a.tx - worldX) * (a.tx - worldX) + (a.ty - worldY) * (a.ty - worldY);
      if (d2 < 0.7 * 0.7 && d2 < bestD) {
        const pd = (a.tx - player.tx) * (a.tx - player.tx) + (a.ty - player.ty) * (a.ty - player.ty);
        if (pd <= rangeTile * rangeTile) { best = a; bestD = d2; }
      }
    }
    return best;
  }

  window.Animals = {
    spawn, clear, get, update, hit, findAt, toJSON, fromJSON
  };
})();
