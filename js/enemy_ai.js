// The movement routines, by the numbers the map data actually stores.
//
// The names and ids are the original's (GameTypes.h): every enemy on a screen
// carries a movementType, and the eight above 50 are the bosses.

import { box } from './collision.js';
import { createEnemyFromTemplate, ATTR } from './enemy.js';

export const AI = {
  NONE: 0,
  RANDOM: 1,
  HOMING: 2,
  SMART: 3,
  GUARDIAN: 4,
  CIRCULAR: 5,
  BUMP_TURN: 6,
  SEMI_HOMING: 7,
  LINEAR: 8,
  SEMI_BUMP_TURN: 9,
  WAITING_FOR_TIME: 10,
  WAITING_FOR_SARIC: 11,
  DIRECT_FIRE: 12,
  DYING: 13,
  DOOR: 15,
  HIVE_BOSS: 50,
  CRAB_BOSS: 51,
  BLOB_BOSS: 53,
  SENTRY_BOSS: 54,
  LINEAR_BOSS: 55,
  RHINO_BOSS: 56,
  ELEMENTAL_BOSS: 57,
  FINAL_BOSS: 58,
};

export const BOSS_NAMES = {
  50: 'Hive', 51: 'Crab', 53: 'Blob', 54: 'Sentry',
  55: 'Sentinel', 56: 'Rhino', 57: 'Elemental', 58: 'Zarin',
};

export function isBoss(ai) {
  return ai >= 50;
}

const DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071],
];

function pickDirection(enemy) {
  const [dx, dy] = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  enemy.vx = dx;
  enemy.vy = dy;
  enemy.retarget = 15 + Math.floor(Math.random() * 30);
}

function towards(enemy, tx, ty) {
  const dx = tx - enemy.x;
  const dy = ty - enemy.y;
  const len = Math.hypot(dx, dy) || 1;
  enemy.vx = dx / len;
  enemy.vy = dy / len;
}

function step(enemy, ctx, scale = 1) {
  return ctx.move(enemy, enemy.vx * enemy.speed * scale, enemy.vy * enemy.speed * scale);
}

function distanceToPlayer(enemy, ctx) {
  return Math.hypot(ctx.player.x - enemy.x, ctx.player.y - enemy.y);
}

// fireEnemy (Enemies.c:291-435): spawns a full enemy from a template
export function fireEnemy(enemy, ctx, templateId = null, testStuck = true, isBossMissile = false) {
  const tid = templateId ?? enemy.fires;
  if (!tid) return null;
  const template = ctx.templates?.get(tid);
  if (!template) return null;

  // Enemies.c:300 - MAX_ENEMIES_ON_SCREEN = 16
  const activeCount = ctx.enemies ? ctx.enemies.filter((e) => !e.dead).length : 0;
  if (activeCount >= 16) return null;

  let sx = enemy.x;
  let sy = enemy.y;
  const whichOutlet = Math.floor(Math.random() * 2);

  // Enemies.c:352-405
  // enemy.facing: 0/1 right (+32), 2 down (+32), 3 left (-32), 4 up (-32)
  const isBoss = enemy.boss || (enemy.attributes & ATTR.IS_BOSS);
  switch (enemy.facing) {
    case 0:
    case 1:
      if (isBoss) {
        sx += 64;
        sy += 32 * whichOutlet;
      } else {
        sx += 32;
      }
      break;
    case 2:
      if (isBoss) {
        sy += 64;
        sx += 32 * whichOutlet;
      } else {
        sy += 32;
      }
      break;
    case 3:
      if (isBoss) {
        sy += 32 * whichOutlet;
      }
      sx -= 32;
      break;
    case 4:
      if (isBoss) {
        sx += 32 * whichOutlet;
      }
      sy -= 32;
      break;
  }

  // Check if missile will get stuck in wall (Enemies.c:411)
  if (testStuck) {
    const isBossSize = !!(template.attributes & ATTR.IS_BOSS) || isBossMissile;
    const size = isBossSize ? 64 : 20;
    const height = isBossSize ? 64 : 16;
    if (ctx.world.boxHitsWall(ctx.screen, box(sx, sy, size, height))) {
      return null;
    }
  }

  const missile = createEnemyFromTemplate(template, sx, sy, enemy.facing);
  if (isBossMissile) {
    missile.attributes |= ATTR.IS_BOSS;
    missile.boss = true;
  }
  if (ctx.enemies) ctx.enemies.push(missile);
  return missile;
}

const ROUTINES = {
  [AI.NONE]: () => {},

  [AI.RANDOM]: (enemy, ctx) => {
    if (enemy.retarget <= 0) pickDirection(enemy);
    enemy.retarget--;
    if (!step(enemy, ctx)) pickDirection(enemy);
  },

  [AI.HOMING]: (enemy, ctx) => {
    towards(enemy, ctx.player.x, ctx.player.y);
    step(enemy, ctx);
  },

  // Chases while Saric is in sight, wanders otherwise.
  [AI.SMART]: (enemy, ctx) => {
    // EnemyUpdate.c:1066-1103: smartMonster in original does not move
    // It only stands and shoots per common firing block.
  },

  // Holds a post: chases inside gaurdianRange of where it started, walks back
  // out of it.
  [AI.GUARDIAN]: (enemy, ctx) => {
    const range = (enemy.range || 4) * 32;
    const home = Math.hypot(ctx.player.x - enemy.spawnX, ctx.player.y - enemy.spawnY);
    if (home < range) {
      towards(enemy, ctx.player.x, ctx.player.y);
      step(enemy, ctx);
    } else if (Math.hypot(enemy.spawnX - enemy.x, enemy.spawnY - enemy.y) > 4) {
      towards(enemy, enemy.spawnX, enemy.spawnY);
      step(enemy, ctx);
    }
  },

  [AI.CIRCULAR]: (enemy, ctx) => {
    enemy.theta = (enemy.theta || 0) + 0.06;
    const radius = 40;
    const tx = enemy.spawnX + Math.cos(enemy.theta) * radius;
    const ty = enemy.spawnY + Math.sin(enemy.theta) * radius;
    ctx.move(enemy, (tx - enemy.x) * 0.25, (ty - enemy.y) * 0.25);
  },

  // Walks straight until it hits something, then turns a quarter circle.
  [AI.BUMP_TURN]: (enemy, ctx) => {
    if (!enemy.vx && !enemy.vy) pickDirection(enemy);
    if (!step(enemy, ctx)) {
      const vx = enemy.vx;
      enemy.vx = -enemy.vy;
      enemy.vy = vx;
    }
  },

  // Heads Saric's way, but only re-aims now and then, so it drifts.
  [AI.SEMI_HOMING]: (enemy, ctx) => {
    if (enemy.retarget <= 0) {
      towards(enemy, ctx.player.x, ctx.player.y);
      enemy.retarget = 25 + Math.floor(Math.random() * 20);
    }
    enemy.retarget--;
    if (!step(enemy, ctx)) pickDirection(enemy);
  },

  [AI.LINEAR]: (enemy, ctx) => {
    if (!enemy.vx && !enemy.vy) {
      if (enemy.facing === 1) enemy.vx = 1;
      else if (enemy.facing === 2) enemy.vy = 1;
      else if (enemy.facing === 3) enemy.vx = -1;
      else if (enemy.facing === 4) enemy.vy = -1;
      else enemy.vx = 1;
    }
    if (!step(enemy, ctx)) {
      if (enemy.attributes & ATTR.IS_MISSILE) {
        enemy.health = 0;
        enemy.dead = true;
      } else {
        enemy.vx = -enemy.vx;
        enemy.vy = -enemy.vy;
      }
    }
  },

  [AI.SEMI_BUMP_TURN]: (enemy, ctx) => {
    if (!enemy.vx && !enemy.vy) pickDirection(enemy);
    if (!step(enemy, ctx)) {
      if (Math.random() < 0.5) { enemy.vx = -enemy.vx; enemy.vy = -enemy.vy; }
      else { const vx = enemy.vx; enemy.vx = -enemy.vy; enemy.vy = vx; }
    }
  },

  // Sits still, then starts wandering after a while (Enemies.c:240 commented out in original)
  [AI.WAITING_FOR_TIME]: () => {},

  // EnemyUpdate.c:79-99: Sits still until Manhattan distance <= target, then transforms to movePhase
  [AI.WAITING_FOR_SARIC]: (enemy, ctx) => {
    const manhattan = Math.abs(ctx.player.x - enemy.x) + Math.abs(ctx.player.y - enemy.y);
    const targetDist = enemy.target > 0 ? enemy.target : 32;
    if (manhattan <= targetDist) {
      enemy.ai = enemy.movePhase || AI.HOMING;
    }
  },

  // EnemyUpdate.c:240-355: directFireMonster
  [AI.DIRECT_FIRE]: (enemy, ctx) => {
    if (!enemy.angledCourse) {
      const isSaricMissile = !(enemy.attributes & ATTR.IS_ENEMY);
      if (isSaricMissile) {
        let vx = 0;
        let vy = 0;
        const speed = enemy.speed || 5;
        if (enemy.facing === 1) vx = speed;
        else if (enemy.facing === 2) vy = speed;
        else if (enemy.facing === 3) vx = -speed;
        else if (enemy.facing === 4) vy = -speed;
        else vx = speed;
        enemy.angledCourse = { h: vx, v: vy };
      } else {
        const dx = ctx.player.x - enemy.x;
        const dy = ctx.player.y - enemy.y;
        const total = Math.abs(dx) + Math.abs(dy) || 1;
        const speed = enemy.speed || 3;
        const h = Math.abs(Math.round((speed * dx) / total)) * (dx < 0 ? -1 : 1);
        const v = Math.abs(Math.round((speed * dy) / total)) * (dy < 0 ? -1 : 1);
        enemy.angledCourse = { h, v };
        if (Math.abs(h) > Math.abs(v)) {
          enemy.facing = h > 0 ? 1 : 3;
        } else {
          enemy.facing = v > 0 ? 2 : 4;
        }
      }
    }

    const moved = ctx.move(enemy, enemy.angledCourse.h, enemy.angledCourse.v);
    // EnemyUpdate.c:337-343: if stopped and isMissile, die
    if (!moved && (enemy.attributes & ATTR.IS_MISSILE)) {
      enemy.health = 0;
      enemy.dead = true;
    }
  },

  [AI.DYING]: () => {},

  // Signposts and shopkeepers: they stand where they are put.
  [AI.DOOR]: () => {},

  // --- bosses ---

  [AI.HIVE_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.RANDOM](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 70; fireEnemy(enemy, ctx); }
  },

  [AI.CRAB_BOSS]: (enemy, ctx) => {
    if (!enemy.vx) enemy.vx = 1;
    if (!ctx.move(enemy, enemy.vx * enemy.speed * 1.5, 0)) enemy.vx = -enemy.vx;
    ctx.move(enemy, 0, Math.sin((enemy.animTimer || 0) * 0.08) * enemy.speed);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 55; fireEnemy(enemy, ctx, 2024); }
  },

  [AI.BLOB_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.HOMING](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 90; fireEnemy(enemy, ctx); }
  },

  // Stays home and shoots.
  [AI.SENTRY_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.CIRCULAR](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 45; fireEnemy(enemy, ctx, 2007, false, true); }
  },

  [AI.LINEAR_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.LINEAR](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 40; fireEnemy(enemy, ctx); }
  },

  // Charges: winds up, then runs Saric down.
  [AI.RHINO_BOSS]: (enemy, ctx) => {
    if (enemy.cooldown-- <= 0) {
      enemy.cooldown = 90;
      towards(enemy, ctx.player.x, ctx.player.y);
      enemy.charging = 45;
      fireEnemy(enemy, ctx, 2040);
    }
    if (enemy.charging > 0) { enemy.charging--; if (!step(enemy, ctx, 3)) enemy.charging = 0; }
  },

  [AI.ELEMENTAL_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.SEMI_HOMING](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 60; fireEnemy(enemy, ctx); }
  },

  [AI.FINAL_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.HOMING](enemy, ctx);
    if (enemy.cooldown-- <= 0) {
      enemy.cooldown = 50;
      fireEnemy(enemy, ctx, 2108);
      fireEnemy(enemy, ctx, 2035, false, true);
    }
  },
};

export function run(enemy, ctx) {
  if (enemy.ai !== AI.DYING && enemy.ai < 50) {
    // EnemyUpdate.c:371-395: Common shooting block and walking shuffle
    enemy.legCounter++;
    if (enemy.legCounter >= 32) {
      if ((enemy.attributes & ATTR.CAN_FIRE) === ATTR.CAN_FIRE && enemy.fires) {
        const rate = enemy.rate || 0;
        // shortRand() % (17 - rateOfFire) == 0 (EnemyUpdate.c:374)
        const denom = Math.max(1, 17 - rate);
        if (Math.floor(Math.random() * denom) === 0) {
          fireEnemy(enemy, ctx);
        }
      }
      enemy.legCounter = 16;
    }
    if (enemy.legCounter % 4 === 0) {
      enemy.legState = 1 - enemy.legState;
    }
  }
  (ROUTINES[enemy.ai] || ROUTINES[AI.RANDOM])(enemy, ctx);
}
