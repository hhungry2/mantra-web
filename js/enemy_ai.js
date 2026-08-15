// The movement routines, by the numbers the map data actually stores.
//
// The names and ids are the original's (GameTypes.h): every enemy on a screen
// carries a movementType, and the eight above 50 are the bosses.

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

function fireAtPlayer(enemy, ctx, speed = 3) {
  const dx = ctx.player.x - enemy.x;
  const dy = ctx.player.y - enemy.y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.spawnProjectile(enemy.x, enemy.y, (dx / len) * speed, (dy / len) * speed,
                      enemy.damage, enemy.fires);
}

function ring(enemy, ctx, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + (enemy.animTimer || 0) * 0.05;
    ctx.spawnProjectile(enemy.x, enemy.y, Math.cos(a) * speed, Math.sin(a) * speed,
                        enemy.damage, enemy.fires);
  }
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
    if (distanceToPlayer(enemy, ctx) < 160) ROUTINES[AI.HOMING](enemy, ctx);
    else ROUTINES[AI.RANDOM](enemy, ctx);
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
    if (!enemy.vx && !enemy.vy) enemy.vx = 1;
    if (!step(enemy, ctx)) { enemy.vx = -enemy.vx; enemy.vy = -enemy.vy; }
  },

  [AI.SEMI_BUMP_TURN]: (enemy, ctx) => {
    if (!enemy.vx && !enemy.vy) pickDirection(enemy);
    if (!step(enemy, ctx)) {
      if (Math.random() < 0.5) { enemy.vx = -enemy.vx; enemy.vy = -enemy.vy; }
      else { const vx = enemy.vx; enemy.vx = -enemy.vy; enemy.vy = vx; }
    }
  },

  // Sits still, then starts wandering after a while.
  [AI.WAITING_FOR_TIME]: (enemy, ctx) => {
    enemy.wait = (enemy.wait || 0) + 1;
    if (enemy.wait > 100) ROUTINES[AI.RANDOM](enemy, ctx);
  },

  // Sits still until Saric comes close, then never stops chasing.
  [AI.WAITING_FOR_SARIC]: (enemy, ctx) => {
    if (enemy.woken || distanceToPlayer(enemy, ctx) < 96) {
      enemy.woken = true;
      ROUTINES[AI.HOMING](enemy, ctx);
    }
  },

  [AI.DIRECT_FIRE]: (enemy, ctx) => {
    ROUTINES[AI.SEMI_HOMING](enemy, ctx);
  },

  [AI.DYING]: () => {},

  // Signposts and shopkeepers: they stand where they are put.
  [AI.DOOR]: () => {},

  // --- bosses ---

  [AI.HIVE_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.RANDOM](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 70; ring(enemy, ctx, 6, 3); }
  },

  [AI.CRAB_BOSS]: (enemy, ctx) => {
    if (!enemy.vx) enemy.vx = 1;
    if (!ctx.move(enemy, enemy.vx * enemy.speed * 1.5, 0)) enemy.vx = -enemy.vx;
    ctx.move(enemy, 0, Math.sin((enemy.animTimer || 0) * 0.08) * enemy.speed);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 55; fireAtPlayer(enemy, ctx, 3.5); }
  },

  [AI.BLOB_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.HOMING](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 90; ring(enemy, ctx, 8, 2.5); }
  },

  // Stays home and shoots.
  [AI.SENTRY_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.CIRCULAR](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 45; fireAtPlayer(enemy, ctx, 4); }
  },

  [AI.LINEAR_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.LINEAR](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 40; ring(enemy, ctx, 4, 3); }
  },

  // Charges: winds up, then runs Saric down.
  [AI.RHINO_BOSS]: (enemy, ctx) => {
    if (enemy.cooldown-- <= 0) {
      enemy.cooldown = 90;
      towards(enemy, ctx.player.x, ctx.player.y);
      enemy.charging = 45;
    }
    if (enemy.charging > 0) { enemy.charging--; if (!step(enemy, ctx, 3)) enemy.charging = 0; }
  },

  [AI.ELEMENTAL_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.SEMI_HOMING](enemy, ctx);
    if (enemy.cooldown-- <= 0) { enemy.cooldown = 60; ring(enemy, ctx, 5, 3.2); }
  },

  [AI.FINAL_BOSS]: (enemy, ctx) => {
    ROUTINES[AI.HOMING](enemy, ctx);
    if (enemy.cooldown-- <= 0) {
      enemy.cooldown = 50;
      ring(enemy, ctx, 10, 4);
      fireAtPlayer(enemy, ctx, 5);
    }
  },
};

export function run(enemy, ctx) {
  if (enemy.ai !== AI.DYING && enemy.ai < 50) {
    // EnemyUpdate.c:371-395: Common shooting block and walking shuffle
    enemy.legCounter++;
    if (enemy.legCounter >= 32) {
      if ((enemy.attributes & 8) === 8 && enemy.fires) {
        const rate = enemy.rate || 0;
        // shortRand() % (17 - rateOfFire) == 0 (EnemyUpdate.c:374)
        const denom = Math.max(1, 17 - rate);
        if (Math.floor(Math.random() * denom) === 0) {
          fireAtPlayer(enemy, ctx);
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
