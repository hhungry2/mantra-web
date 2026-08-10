// Movement and AI behaviors for enemies.
//
// Supports: randomMovement, homing, smart, guardian, circular, bumpTurn, linear, directFire

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

// 1. Drifts about randomly
export function randomMovement(enemy, ctx) {
  if (enemy.retarget <= 0) pickDirection(enemy);
  enemy.retarget--;
  if (!ctx.move(enemy, enemy.vx * enemy.speed, enemy.vy * enemy.speed)) {
    pickDirection(enemy);
  }
}

// 2. Chases Saric directly
export function homing(enemy, ctx) {
  const dx = ctx.player.x - enemy.x;
  const dy = ctx.player.y - enemy.y;
  const len = Math.hypot(dx, dy) || 1;
  enemy.vx = dx / len;
  enemy.vy = dy / len;
  ctx.move(enemy, enemy.vx * enemy.speed, enemy.vy * enemy.speed);
}

// 3. Smart: Chases player if in range (160px), otherwise wanders
export function smart(enemy, ctx) {
  const dx = ctx.player.x - enemy.x;
  const dy = ctx.player.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 160) {
    homing(enemy, ctx);
  } else {
    randomMovement(enemy, ctx);
  }
}

// 4. Guardian: Guards spawn point, chases player within 120px of spawn, returns if player leaves
export function guardian(enemy, ctx) {
  if (!enemy.spawnX) {
    enemy.spawnX = enemy.x;
    enemy.spawnY = enemy.y;
  }
  const distToPlayer = Math.hypot(ctx.player.x - enemy.spawnX, ctx.player.y - enemy.spawnY);
  if (distToPlayer < 120) {
    homing(enemy, ctx);
  } else {
    const dx = enemy.spawnX - enemy.x;
    const dy = enemy.spawnY - enemy.y;
    const len = Math.hypot(dx, dy);
    if (len > 5) {
      enemy.vx = dx / len;
      enemy.vy = dy / len;
      ctx.move(enemy, enemy.vx * enemy.speed, enemy.vy * enemy.speed);
    } else {
      enemy.vx = 0;
      enemy.vy = 0;
    }
  }
}

// 5. Circular: Orbits around spawn point
export function circular(enemy, ctx) {
  if (!enemy.angle) enemy.angle = Math.random() * Math.PI * 2;
  if (!enemy.spawnX) {
    enemy.spawnX = enemy.x;
    enemy.spawnY = enemy.y;
  }
  enemy.angle += 0.05;
  const radius = 35;
  const targetX = enemy.spawnX + Math.cos(enemy.angle) * radius;
  const targetY = enemy.spawnY + Math.sin(enemy.angle) * radius;
  const dx = targetX - enemy.x;
  const dy = targetY - enemy.y;
  ctx.move(enemy, dx * 0.2, dy * 0.2);
}

// 6. BumpTurn: Walks straight, turns 90deg or 180deg when hitting wall
export function bumpTurn(enemy, ctx) {
  if (enemy.vx === 0 && enemy.vy === 0) pickDirection(enemy);
  if (!ctx.move(enemy, enemy.vx * enemy.speed, enemy.vy * enemy.speed)) {
    // Turn 90 or 180 degrees
    const temp = enemy.vx;
    enemy.vx = -enemy.vy;
    enemy.vy = temp;
  }
}

// 7. Linear: Patrols back and forth on X axis
export function linear(enemy, ctx) {
  if (enemy.vx === 0) enemy.vx = 1;
  if (!ctx.move(enemy, enemy.vx * enemy.speed, 0)) {
    enemy.vx = -enemy.vx;
  }
}

// 8. DirectFire: Moves slowly and fires ranged projectiles at player
export function directFire(enemy, ctx) {
  homing(enemy, ctx);
  if (!enemy.fireCooldown) enemy.fireCooldown = 60 + Math.floor(Math.random() * 40);
  enemy.fireCooldown--;
  if (enemy.fireCooldown <= 0) {
    enemy.fireCooldown = 75;
    if (ctx.spawnProjectile) {
      const dx = ctx.player.x - enemy.x;
      const dy = ctx.player.y - enemy.y;
      const len = Math.hypot(dx, dy) || 1;
      ctx.spawnProjectile(enemy.x, enemy.y, (dx / len) * 3, (dy / len) * 3, 2);
    }
  }
}

export const BEHAVIOURS = {
  randomMovement,
  homing,
  smart,
  guardian,
  circular,
  bumpTurn,
  linear,
  directFire,
};

export const AI_NAMES = [
  'randomMovement', 'homing', 'smart', 'guardian',
  'circular', 'bumpTurn', 'linear', 'directFire',
];
