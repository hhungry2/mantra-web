// Movement behaviours.
//
// The original has 22 of these plus 8 boss routines. Phase 1 implements the two
// the plan calls for; the rest arrive in phase 2 once the AI id inside the
// enemy template is decoded.

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

// Drifts about, changing its mind on a timer and whenever it walks into terrain.
export function randomMovement(enemy, ctx) {
  if (enemy.retarget <= 0) pickDirection(enemy);
  enemy.retarget--;
  if (!ctx.move(enemy, enemy.vx * enemy.speed, enemy.vy * enemy.speed)) {
    pickDirection(enemy);
  }
}

// Walks straight at Saric, sliding along whatever it scrapes on the way.
export function homing(enemy, ctx) {
  const dx = ctx.player.x - enemy.x;
  const dy = ctx.player.y - enemy.y;
  const len = Math.hypot(dx, dy) || 1;
  enemy.vx = dx / len;
  enemy.vy = dy / len;
  ctx.move(enemy, enemy.vx * enemy.speed, enemy.vy * enemy.speed);
}

export const BEHAVIOURS = { randomMovement, homing };
