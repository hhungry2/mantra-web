// The movement routines, by the numbers the map data actually stores.
//
// The names and ids are the original's (GameTypes.h): every enemy on a screen
// carries a movementType, and the eight above 50 are the bosses.

import { box, overlaps } from './collision.js';
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

// EnemyUpdate.c:371-385: common firing logic
function maybeFire(enemy, ctx) {
  if ((enemy.attributes & ATTR.CAN_FIRE) === ATTR.CAN_FIRE && enemy.fires) {
    const rate = enemy.rate || 0;
    const denom = Math.max(1, 17 - rate);
    if (Math.floor(Math.random() * denom) === 0) {
      fireEnemy(enemy, ctx);
    }
  }
}

// Moves 1 axis based on enemy.facing (1=Right, 2=Down, 3=Left, 4=Up, 0=Neutral)
export function stepFacing(enemy, ctx, speedMultiplier = 1) {
  const speed = enemy.speed * speedMultiplier;
  let dx = 0;
  let dy = 0;
  switch (enemy.facing) {
    case 1: dx = speed; break;
    case 2: dy = speed; break;
    case 3: dx = -speed; break;
    case 4: dy = -speed; break;
    case 0:
    default:
      return true;
  }
  const moved = ctx.move(enemy, dx, dy);
  enemy.vx = dx;
  enemy.vy = dy;
  return moved;
}

// EnemyUpdate.c:436-478: common collision handling across wanderers
export function handleEnemyCollision(enemy, ctx, oldX, oldY) {
  if (enemy.attributes & ATTR.IS_MISSILE) {
    enemy.hp = 0;
    enemy.dead = true;
    return;
  }

  // Random multiplier (+1 or -1)
  const i = Math.random() < 0.5 ? -1 : 1;

  // Bump perpendicular to facing
  let bumpX = 0;
  let bumpY = 0;
  const speed = enemy.speed;
  switch (enemy.facing) {
    case 1: bumpY = speed * i; break;
    case 2: bumpX = speed * i; break;
    case 3: bumpY = -speed * i; break;
    case 4: bumpX = -speed * i; break;
  }

  const moved = ctx.move(enemy, bumpX, bumpY);
  if (!moved) {
    enemy.x = oldX;
    enemy.y = oldY;
  }

  enemy.facing = Math.floor(Math.random() * 5);
}

// EnemyCollision.c:889-975: checkProximityToSword
export function checkProximityToSword(enemy, ctx) {
  const player = ctx.player;
  if (!player || !player.swordOut || enemy.legCounter <= 15) return false;

  // Calculate sword proximity rect (48px ahead of Saric)
  // Saric facing: 0=Left, 1=Right, 2=Down, 3=Up
  let sx = player.x;
  let sy = player.y;
  switch (player.dir) {
    case 0: sx -= 48; break; // Left
    case 1: sx += 48; break; // Right
    case 2: sy += 48; break; // Down
    case 3: sy -= 48; break; // Up
  }
  const swordHitBox = box(sx, sy, 32, 32);

  if (!overlaps(swordHitBox, enemy.body)) return false;

  // Manhattan distance filter: only trigger if enemy was approaching Saric
  let oldX = enemy.x;
  let oldY = enemy.y;
  switch (enemy.facing) {
    case 1: oldX -= enemy.speed; break;
    case 2: oldY -= enemy.speed; break;
    case 3: oldX += enemy.speed; break;
    case 4: oldY += enemy.speed; break;
  }

  const oldDist = Math.abs(player.x - oldX) + Math.abs(player.y - oldY);
  const curDist = Math.abs(player.x - enemy.x) + Math.abs(player.y - enemy.y);
  return oldDist > curDist;
}

// fireEnemy (Enemies.c:291-435): spawns a full enemy from a template
export function fireEnemy(enemy, ctx, templateId = null, testStuck = true, isBossMissile = false) {
  const tid = templateId ?? enemy.fires;
  if (!tid) return null;
  const template = ctx.templates?.get(tid);
  if (!template) return null;

  const activeCount = ctx.enemies ? ctx.enemies.filter((e) => !e.dead).length : 0;
  if (activeCount >= 16) return null;

  let sx = enemy.x;
  let sy = enemy.y;
  const whichOutlet = Math.floor(Math.random() * 2);

  const isBoss = enemy.boss || (enemy.attributes & ATTR.IS_BOSS);
  switch (enemy.facing) {
    case 0:
    case 1:
      if (isBoss) { sx += 64; sy += 32 * whichOutlet; } else { sx += 32; }
      break;
    case 2:
      if (isBoss) { sy += 64; sx += 32 * whichOutlet; } else { sy += 32; }
      break;
    case 3:
      if (isBoss) { sy += 32 * whichOutlet; }
      sx -= 32;
      break;
    case 4:
      if (isBoss) { sx += 32 * whichOutlet; }
      sy -= 32;
      break;
  }

  const isBossSize = !!(template.attributes & ATTR.IS_BOSS) || isBossMissile;
  const size = isBossSize ? 64 : 20;
  const height = isBossSize ? 64 : 16;

  // EnemyCollision.c:595-610: Spawning off screen is blocked by checkEnemyInterceptWithMap
  const left = sx - size / 2;
  const right = sx + size / 2;
  const top = sy - height / 2;
  const bottom = sy + height / 2;
  if (left < 0 || right > 512 || top < 0 || bottom > 320) {
    return null;
  }

  if (testStuck) {
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

// Enemies.c:438-531: bossFireEnemy spawns an enemy at tile offset from boss
export function bossFireEnemy(enemy, ctx, whereIndex, templateId = null, testStuck = true, isBossMissile = false) {
  const tid = templateId ?? enemy.fires;
  if (!tid) return null;
  const template = ctx.templates?.get(tid);
  if (!template) return null;

  const activeCount = ctx.enemies ? ctx.enemies.filter((e) => !e.dead).length : 0;
  if (activeCount >= 16) return null;

  const sx = enemy.x + (whereIndex.h || 0) * 32;
  const sy = enemy.y + (whereIndex.v || 0) * 32;

  const isBossSize = !!(template.attributes & ATTR.IS_BOSS) || isBossMissile;
  const size = isBossSize ? 64 : 20;
  const height = isBossSize ? 64 : 16;

  // EnemyCollision.c:595-610: Spawning off screen is blocked by checkEnemyInterceptWithMap
  const left = sx - size / 2;
  const right = sx + size / 2;
  const top = sy - height / 2;
  const bottom = sy + height / 2;
  if (left < 0 || right > 512 || top < 0 || bottom > 320) {
    return null;
  }

  if (testStuck) {
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

  // EnemyUpdate.c:359-479: randomMonster
  [AI.RANDOM]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;
    if (enemy.legCounter >= 32) {
      maybeFire(enemy, ctx);
      enemy.facing = Math.floor(Math.random() * 5);
      enemy.legCounter = 16;
    }
    if (!stepFacing(enemy, ctx)) {
      handleEnemyCollision(enemy, ctx, oldX, oldY);
    }
    if (checkProximityToSword(enemy, ctx)) {
      enemy.facing = Math.floor(Math.random() * 5);
      enemy.legCounter = 250;
    }
  },

  // EnemyUpdate.c:484-620: homingMonster
  [AI.HOMING]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;
    if (enemy.legCounter >= 32) {
      maybeFire(enemy, ctx);
      enemy.legCounter = 16;
    }
    // 4-directional facing calculation
    enemy.facing = 0;
    const dy = ctx.player.y - enemy.y;
    const dx = ctx.player.x - enemy.x;
    if (dy > 0) enemy.facing = 2; // Down
    if (dy < 0) enemy.facing = 4; // Up
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) enemy.facing = 1; // Right
      if (dx < 0) enemy.facing = 3; // Left
    }
    if (!stepFacing(enemy, ctx)) {
      handleEnemyCollision(enemy, ctx, oldX, oldY);
    }
    if (checkProximityToSword(enemy, ctx)) {
      enemy.legCounter = 16;
    }
  },

  // EnemyUpdate.c:1066-1103: smartMonster in original does not move
  [AI.SMART]: (enemy, ctx) => {
    if (enemy.legCounter >= 32) {
      maybeFire(enemy, ctx);
      enemy.legCounter = 16;
    }
  },

  // EnemyUpdate.c:900-991: gaurdianMonster
  [AI.GUARDIAN]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;
    const range = Math.min(6, enemy.range || 4);
    if (enemy.legCounter >= 16 + 16 * range) {
      maybeFire(enemy, ctx);
      let f = enemy.facing + 2;
      if (f > 4) f -= 4;
      enemy.facing = f;
      enemy.legCounter = 16;
    }
    if (enemy.facing === 0) {
      enemy.facing = Math.floor(Math.random() * 5);
    }
    if (!stepFacing(enemy, ctx, 2)) {
      if (enemy.attributes & ATTR.IS_MISSILE) {
        enemy.hp = 0;
        enemy.dead = true;
      }
      enemy.x = oldX;
      enemy.y = oldY;
    }
  },

  // EnemyUpdate.c:992-1065: circlingMonster
  [AI.CIRCULAR]: (enemy, ctx) => {
    if (enemy.legCounter >= 32) {
      maybeFire(enemy, ctx);
      enemy.legCounter = 16;
    }
    enemy.facing = (Math.floor(enemy.legCounter / 2) % 4) + 1;
    enemy.legState = enemy.legCounter % 2;
    if ((enemy.legCounter % 16) > 7) {
      enemy.facing = 5 - enemy.facing;
      enemy.legState = 1 - enemy.legState;
    }

    enemy.theta = (enemy.theta + enemy.speed) & 0xFF;
    const angle = (enemy.theta / 256) * Math.PI * 2;
    const destX = 256 + Math.cos(angle) * (enemy.disFromUnitCircle || 100);
    const destY = 160 + Math.sin(angle) * (enemy.disFromUnitCircle || 100);
    const dx = (destX - enemy.x) / 2;
    const dy = (destY - enemy.y) / 2;
    enemy.vx = dx;
    enemy.vy = dy;
    if (!ctx.move(enemy, dx, dy)) {
      if (enemy.attributes & ATTR.IS_MISSILE) {
        enemy.hp = 0;
        enemy.dead = true;
      }
    }
  },

  // EnemyUpdate.c:624-751: bumpTurnMonster / semibumpTurn
  [AI.BUMP_TURN]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;
    if (enemy.legCounter >= 32) {
      maybeFire(enemy, ctx);
      enemy.legCounter = 16;
    }
    if (enemy.ai === AI.SEMI_BUMP_TURN && Math.floor(Math.random() * 100) === 0) {
      enemy.facing = Math.floor(Math.random() * 5);
    }
    if (enemy.facing === 0) {
      enemy.facing = Math.floor(Math.random() * 5);
    }
    if (!stepFacing(enemy, ctx)) {
      handleEnemyCollision(enemy, ctx, oldX, oldY);
    }
    if (checkProximityToSword(enemy, ctx)) {
      enemy.legCounter = 250;
      enemy.facing = Math.floor(Math.random() * 5);
    }
  },

  // EnemyUpdate.c:752-899: semihomingMonster
  [AI.SEMI_HOMING]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;
    if (enemy.legCounter >= 32) {
      maybeFire(enemy, ctx);
      let f = Math.floor(Math.random() * 7);
      if (f > 4) {
        const dy = ctx.player.y - enemy.y;
        const dx = ctx.player.x - enemy.x;
        f = dy > 0 ? 2 : (dy < 0 ? 4 : 0);
        if (Math.abs(dx) > Math.abs(dy)) {
          f = dx > 0 ? 1 : 3;
        }
      }
      enemy.facing = f;
      enemy.legCounter = 16;
    }
    if (!stepFacing(enemy, ctx)) {
      handleEnemyCollision(enemy, ctx, oldX, oldY);
    }
    if (checkProximityToSword(enemy, ctx)) {
      enemy.legCounter = 250;
      enemy.facing = Math.floor(Math.random() * 5);
    }
  },

  // EnemyUpdate.c:1106-1184: linearMonster
  [AI.LINEAR]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;
    if (enemy.legCounter >= 32) {
      maybeFire(enemy, ctx);
      enemy.legCounter = 16;
    }
    if (enemy.facing === 0) {
      enemy.facing = Math.floor(Math.random() * 5);
    }
    if (!stepFacing(enemy, ctx)) {
      if (enemy.attributes & ATTR.IS_MISSILE) {
        enemy.hp = 0;
        enemy.dead = true;
      }
      enemy.x = oldX;
      enemy.y = oldY;
      enemy.facing = Math.floor(Math.random() * 5);
    }
  },

  [AI.SEMI_BUMP_TURN]: (enemy, ctx) => {
    ROUTINES[AI.BUMP_TURN](enemy, ctx);
  },

  [AI.WAITING_FOR_TIME]: () => {},

  // EnemyUpdate.c:79-99: Sits still until Manhattan distance <= target, then transforms
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

    enemy.vx = enemy.angledCourse.h;
    enemy.vy = enemy.angledCourse.v;
    const moved = ctx.move(enemy, enemy.angledCourse.h, enemy.angledCourse.v);
    if (!moved && (enemy.attributes & ATTR.IS_MISSILE)) {
      enemy.hp = 0;
      enemy.dead = true;
    }
  },

  [AI.DYING]: () => {},
  [AI.DOOR]: () => {},

  // --- Boss AI Routines (EnemyUpdate.c:1185-2135) ---

  // EnemyUpdate.c:1331-1405: hiveBossMonster
  [AI.HIVE_BOSS]: (enemy, ctx) => {
    if (enemy.legCounter >= 32) {
      if ((enemy.attributes & ATTR.CAN_FIRE) && (enemy.movePhase & 12)) {
        bossFireEnemy(enemy, ctx, { h: 2, v: 2 }, enemy.fires, true, false);
      }
      enemy.legCounter = 16;
      enemy.movePhase++;
    }

    enemy.facing = (Math.floor(enemy.legCounter / 2) % 4) + 1;
    enemy.legState = enemy.legCounter % 2;
    if ((enemy.legCounter % 16) > 7) {
      enemy.facing = 5 - enemy.facing;
      enemy.legState = 1 - enemy.legState;
    }

    enemy.theta = (enemy.theta + enemy.speed) & 0xFF;
    const angle = (enemy.theta / 256) * Math.PI * 2;
    const destX = ctx.player.x - 16 + Math.cos(angle) * (enemy.disFromUnitCircle || 100);
    const destY = ctx.player.y - 16 + Math.sin(angle) * (enemy.disFromUnitCircle || 100);

    const dx = (destX - enemy.x) / 8;
    const dy = (destY - enemy.y) / 8;
    enemy.vx = dx;
    enemy.vy = dy;
    if (!ctx.move(enemy, dx, dy)) {
      if (enemy.attributes & ATTR.IS_MISSILE) {
        enemy.hp = 0;
        enemy.dead = true;
      }
    }
  },

  // EnemyUpdate.c:1407-1587: crabBossMonster
  [AI.CRAB_BOSS]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;

    if (enemy.legCounter >= 32) {
      if ((enemy.attributes & ATTR.CAN_FIRE) && (enemy.movePhase & 4) === 0) {
        bossFireEnemy(enemy, ctx, { h: 1, v: 1 }, 2024, true, false);
        bossFireEnemy(enemy, ctx, { h: 0, v: 1 }, 2024, true, false);
      }
      enemy.facing = Math.floor(Math.random() * 5);
      enemy.legCounter = 16;
      enemy.movePhase++;
    }

    if (enemy.movePhase & 3) {
      enemy.angledCourse = null;
      if (!stepFacing(enemy, ctx)) {
        handleEnemyCollision(enemy, ctx, oldX, oldY);
      }
    } else {
      if (!enemy.angledCourse) {
        const dx = ctx.player.x - enemy.x;
        const dy = ctx.player.y - enemy.y;
        const total = Math.abs(dx) + Math.abs(dy) || 1;
        const h = Math.abs(Math.round((10 * dx) / total)) * (dx < 0 ? -1 : 1);
        const v = Math.abs(Math.round((10 * dy) / total)) * (dy < 0 ? -1 : 1);
        enemy.angledCourse = { h, v };
        if (Math.abs(h) > Math.abs(v)) {
          enemy.facing = h > 0 ? 1 : 3;
        } else {
          enemy.facing = v > 0 ? 2 : 4;
        }
      }
      enemy.vx = enemy.angledCourse.h;
      enemy.vy = enemy.angledCourse.v;
      if (!ctx.move(enemy, enemy.angledCourse.h, enemy.angledCourse.v)) {
        handleEnemyCollision(enemy, ctx, oldX, oldY);
      }
    }

    if (checkProximityToSword(enemy, ctx)) {
      enemy.facing = Math.floor(Math.random() * 5);
      enemy.legCounter = 250;
    }
  },

  // EnemyUpdate.c:1185-1330: blobBossMonster
  [AI.BLOB_BOSS]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;

    if (enemy.hp <= 10) {
      for (let i = 0; i <= 1; i++) {
        for (let j = 0; j <= 1; j++) {
          bossFireEnemy(enemy, ctx, { h: i, v: j }, enemy.fires, false, false);
        }
      }
      enemy.hp = 0;
      enemy.dead = true;
      return;
    }

    if (enemy.legCounter >= 32) {
      if ((enemy.attributes & ATTR.CAN_FIRE) && !(enemy.movePhase & 4)) {
        for (let i = -1; i <= 2; i += 3) {
          for (let j = -1; j <= 2; j += 3) {
            bossFireEnemy(enemy, ctx, { h: i, v: j }, enemy.fires, true, false);
          }
        }
      }
      enemy.facing = Math.floor(Math.random() * 5);
      enemy.legCounter = 16;
      enemy.movePhase++;
    }

    if (!stepFacing(enemy, ctx)) {
      handleEnemyCollision(enemy, ctx, oldX, oldY);
    }
    if (checkProximityToSword(enemy, ctx)) {
      enemy.facing = Math.floor(Math.random() * 5);
      enemy.legCounter = 250;
    }
  },

  // EnemyUpdate.c:1588-1680: sentryBossMonster
  [AI.SENTRY_BOSS]: (enemy, ctx) => {
    const oldX = enemy.x;
    enemy.theta++;
    enemy.facing = 4;

    if (enemy.legCounter >= 32) {
      enemy.legCounter = 16;
    }

    if (enemy.theta === 12 && (enemy.attributes & ATTR.CAN_FIRE) && !(enemy.movePhase % 2)) {
      bossFireEnemy(enemy, ctx, { h: 1, v: -2 }, 2007, false, true);
    }

    if (enemy.theta >= 16) {
      enemy.movePhase++;
      enemy.theta = 0;
    }

    const dx = (enemy.movePhase % 2 ? -1 : 1) * enemy.speed * 2;
    enemy.vx = dx;
    enemy.vy = 0;
    if (!ctx.move(enemy, dx, 0)) {
      if (enemy.attributes & ATTR.IS_MISSILE) {
        enemy.hp = 0;
        enemy.dead = true;
      }
      enemy.x = oldX;
    }
  },

  // EnemyUpdate.c:1681-1759: linearBossMonster
  [AI.LINEAR_BOSS]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;

    if (enemy.legCounter >= 32) {
      maybeFire(enemy, ctx);
      enemy.legCounter = 16;
    }

    if (enemy.facing === 0) {
      enemy.facing = Math.floor(Math.random() * 5);
    }

    if (!stepFacing(enemy, ctx)) {
      if (enemy.attributes & ATTR.IS_MISSILE) {
        enemy.hp = 0;
        enemy.dead = true;
      }
      enemy.x = oldX;
      enemy.y = oldY;
      enemy.facing = Math.floor(Math.random() * 5);
    }
  },

  // EnemyUpdate.c:1760-1943: rhinoBossMonster
  [AI.RHINO_BOSS]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;

    if (enemy.legCounter >= 32) {
      if ((enemy.attributes & ATTR.CAN_FIRE) && (enemy.movePhase & 4) === 0) {
        let whereIndex = { h: 2, v: 0 };
        switch (enemy.facing) {
          case 0:
          case 1: whereIndex = { h: 2, v: 0 }; break;
          case 2: whereIndex = { h: 0, v: 2 }; break;
          case 3: whereIndex = { h: -1, v: 0 }; break;
          case 4: whereIndex = { h: 0, v: -1 }; break;
        }
        bossFireEnemy(enemy, ctx, whereIndex, 2040, true, false);
      }
      enemy.facing = Math.floor(Math.random() * 5);
      enemy.legCounter = 16;
      enemy.movePhase++;
    }

    if (enemy.movePhase & 3) {
      enemy.angledCourse = null;
      if (!stepFacing(enemy, ctx)) {
        handleEnemyCollision(enemy, ctx, oldX, oldY);
      }
    } else {
      if (!enemy.angledCourse) {
        const dx = ctx.player.x - enemy.x;
        const dy = ctx.player.y - enemy.y;
        const total = Math.abs(dx) + Math.abs(dy) || 1;
        const h = Math.abs(Math.round((7 * dx) / total)) * (dx < 0 ? -1 : 1);
        const v = Math.abs(Math.round((7 * dy) / total)) * (dy < 0 ? -1 : 1);
        enemy.angledCourse = { h, v };
        if (Math.abs(h) > Math.abs(v)) {
          enemy.facing = h > 0 ? 1 : 3;
        } else {
          enemy.facing = v > 0 ? 2 : 4;
        }
      }
      enemy.vx = enemy.angledCourse.h;
      enemy.vy = enemy.angledCourse.v;
      if (!ctx.move(enemy, enemy.angledCourse.h, enemy.angledCourse.v)) {
        handleEnemyCollision(enemy, ctx, oldX, oldY);
      }
    }

    if (checkProximityToSword(enemy, ctx)) {
      enemy.facing = Math.floor(Math.random() * 5);
      enemy.legCounter = 250;
    }
  },

  // EnemyUpdate.c:1944-2024: elementalBossMonster
  [AI.ELEMENTAL_BOSS]: (enemy, ctx) => {
    const oldX = enemy.x;
    const oldY = enemy.y;

    if (enemy.legCounter >= 32) {
      maybeFire(enemy, ctx);
      enemy.legCounter = 16;
    }

    if (enemy.facing === 0) {
      enemy.facing = Math.floor(Math.random() * 5);
    }

    if (!stepFacing(enemy, ctx)) {
      enemy.hp = 0;
      enemy.dead = true;
      enemy.attributes |= ATTR.IS_MISSILE;
    }
  },

  // EnemyUpdate.c:2025-2135: finalBossMonster (Zarin)
  [AI.FINAL_BOSS]: (enemy, ctx) => {
    enemy.facing = 2;
    enemy.theta++;

    if (enemy.legCounter >= 32) {
      enemy.legCounter = 16;
    }

    // Floor blocking gimmick and guard spawn
    if (!enemy.stuckCounter && (Math.floor(ctx.player.y / 32) < 9)) {
      enemy.stuckCounter = 1;
      if (ctx.screen && ctx.screen.mods) {
        for (const tx of [6, 7, 8, 9]) {
          const idx = 9 * 16 + tx;
          if (idx < ctx.screen.mods.length) {
            ctx.screen.mods[idx] &= ~1; // remove standable (MOD.STANDABLE = 1)
          }
        }
      }
      bossFireEnemy(enemy, ctx, { h: 0, v: 6 }, 2020, false, false);
      bossFireEnemy(enemy, ctx, { h: 1, v: 6 }, 2020, false, false);
    }

    if (enemy.theta >= 15) {
      if (!(enemy.movePhase % 4)) {
        bossFireEnemy(enemy, ctx, { h: 0, v: 2 }, 2108, true, false);
        bossFireEnemy(enemy, ctx, { h: 1, v: 2 }, 2108, true, false);
      }
      if (!((enemy.movePhase + 2) % 4)) {
        bossFireEnemy(enemy, ctx, { h: 0, v: 2 }, 2035, false, true);
        bossFireEnemy(enemy, ctx, { h: 1, v: 2 }, 2035, false, true);
      }
      enemy.theta = 0;
      enemy.movePhase++;
    }

    if (enemy.movePhase >= 32) {
      enemy.movePhase = 0;
    }

    // EnemyUpdate.c:2130: win game if boss health <= 10
    if (enemy.hp <= 10 && ctx.onWinGame) {
      ctx.onWinGame();
    }
  },
};

export function run(enemy, ctx) {
  if (enemy.ai !== AI.DYING) {
    enemy.legCounter++;
    if (enemy.legCounter % 4 === 0) {
      enemy.legState = 1 - enemy.legState;
    }
  }
  (ROUTINES[enemy.ai] || ROUTINES[AI.RANDOM])(enemy, ctx);
}
