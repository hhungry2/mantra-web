// Boss class and 8 Boss AI routines (64x64 sprites, bosses.png)

import { box } from './collision.js';
import { EnemyProjectile } from './enemy.js';

const BOSS_W = 44;
const BOSS_H = 44;
const HIT_FLASH = 8;

export class Boss {
  constructor(bossId, tileX, tileY) {
    this.bossId = bossId; // 0..7
    this.x = tileX * 32 + 16;
    this.y = tileY * 32 + 16;
    this.hpMax = 100 + bossId * 40;
    this.hp = this.hpMax;
    this.damage = 5 + bossId * 2;
    this.speed = 1.2 + bossId * 0.15;
    this.frameStart = bossId * 6; // 6 frames per boss in bosses.png
    this.frameIndex = 0;
    this.animTimer = 0;

    this.vx = 0;
    this.vy = 0;
    this.flash = 0;
    this.cooldown = 0;
    this.shield = false;
    this.dead = false;
    this.isBoss = true;
  }

  get body() {
    return box(this.x, this.y, BOSS_W, BOSS_H);
  }

  get currentFrame() {
    return this.frameStart + (Math.floor(this.animTimer / 8) % 6);
  }

  hurt(amount, fromX, fromY) {
    if (this.shield) return false;
    this.hp -= amount;
    this.flash = HIT_FLASH;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return this.dead;
  }

  update(ctx) {
    this.animTimer++;
    if (this.flash > 0) this.flash--;
    if (this.cooldown > 0) this.cooldown--;

    const aiFunc = BOSS_AIS[this.bossId] || BOSS_AIS[0];
    aiFunc(this, ctx);
  }
}

// 8 Unique Boss AI Routines
function bossFireDemon(boss, ctx) {
  // Boss 0: 3-way spread fireballs + charge
  const player = ctx.player;
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.move(boss, (dx / len) * boss.speed, (dy / len) * boss.speed);

  if (boss.cooldown <= 0) {
    boss.cooldown = 70;
    const angles = [-0.3, 0, 0.3];
    const baseAngle = Math.atan2(dy, dx);
    for (const a of angles) {
      const vx = Math.cos(baseAngle + a) * 3.5;
      const vy = Math.sin(baseAngle + a) * 3.5;
      ctx.spawnProjectile(boss.x, boss.y, vx, vy, boss.damage);
    }
  }
}

function bossIceSerpent(boss, ctx) {
  // Boss 1: Orbits center, 5-way ice wave
  if (!boss.angle) boss.angle = 0;
  boss.angle += 0.04;
  const targetX = 256 + Math.cos(boss.angle) * 120;
  const targetY = 160 + Math.sin(boss.angle) * 80;
  ctx.move(boss, (targetX - boss.x) * 0.1, (targetY - boss.y) * 0.1);

  if (boss.cooldown <= 0) {
    boss.cooldown = 80;
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5;
      ctx.spawnProjectile(boss.x, boss.y, Math.cos(a) * 3, Math.sin(a) * 3, boss.damage);
    }
  }
}

function bossShadowKnight(boss, ctx) {
  // Boss 2: Teleports near player and slashes
  if (boss.cooldown <= 0) {
    boss.cooldown = 90;
    boss.x = Math.max(32, Math.min(480, ctx.player.x + (Math.random() - 0.5) * 100));
    boss.y = Math.max(32, Math.min(280, ctx.player.y + (Math.random() - 0.5) * 100));
    // Shoot 4 directional blasts
    for (const [vx, vy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
      ctx.spawnProjectile(boss.x, boss.y, vx, vy, boss.damage);
    }
  }
}

function bossGolem(boss, ctx) {
  // Boss 3: Shielding + Stomp shockwave
  if (!boss.shieldTimer) boss.shieldTimer = 0;
  boss.shieldTimer++;
  boss.shield = (boss.shieldTimer % 120) < 40; // Shielded 1/3 of the time

  const dx = ctx.player.x - boss.x;
  const dy = ctx.player.y - boss.y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.move(boss, (dx / len) * (boss.shield ? 0.4 : boss.speed * 1.5), (dy / len) * (boss.shield ? 0.4 : boss.speed * 1.5));

  if (boss.cooldown <= 0 && !boss.shield) {
    boss.cooldown = 100;
    // 8-directional stomp wave
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      ctx.spawnProjectile(boss.x, boss.y, Math.cos(a) * 2.5, Math.sin(a) * 2.5, boss.damage);
    }
  }
}

function bossStormWarlock(boss, ctx) {
  // Boss 4: Homing lightning strikes
  const dx = ctx.player.x - boss.x;
  const dy = ctx.player.y - boss.y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.move(boss, (dx / len) * boss.speed, (dy / len) * boss.speed);

  if (boss.cooldown <= 0) {
    boss.cooldown = 60;
    ctx.spawnProjectile(boss.x, boss.y, (dx / len) * 4.5, (dy / len) * 4.5, boss.damage);
  }
}

function bossEarthTitan(boss, ctx) {
  // Boss 5: Heavy rock bursts
  if (boss.cooldown <= 0) {
    boss.cooldown = 75;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5);
      ctx.spawnProjectile(boss.x, boss.y, Math.cos(a) * 3.2, Math.sin(a) * 3.2, boss.damage);
    }
  }
}

function bossDarkDragon(boss, ctx) {
  // Boss 6: 8-directional flame ring + pursuit
  const dx = ctx.player.x - boss.x;
  const dy = ctx.player.y - boss.y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.move(boss, (dx / len) * boss.speed, (dy / len) * boss.speed);

  if (boss.cooldown <= 0) {
    boss.cooldown = 65;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      ctx.spawnProjectile(boss.x, boss.y, Math.cos(a) * 3.8, Math.sin(a) * 3.8, boss.damage);
    }
  }
}

function bossZarinFinal(boss, ctx) {
  // Boss 7: Zarin Final Boss - Rapid bullet hell + charge
  const dx = ctx.player.x - boss.x;
  const dy = ctx.player.y - boss.y;
  const len = Math.hypot(dx, dy) || 1;
  ctx.move(boss, (dx / len) * (boss.speed * 1.3), (dy / len) * (boss.speed * 1.3));

  if (boss.cooldown <= 0) {
    boss.cooldown = 45;
    const numBullets = 10;
    for (let i = 0; i < numBullets; i++) {
      const a = (Math.PI * 2 * i) / numBullets + (boss.animTimer * 0.1);
      ctx.spawnProjectile(boss.x, boss.y, Math.cos(a) * 4.0, Math.sin(a) * 4.0, boss.damage);
    }
  }
}

const BOSS_AIS = [
  bossFireDemon,
  bossIceSerpent,
  bossShadowKnight,
  bossGolem,
  bossStormWarlock,
  bossEarthTitan,
  bossDarkDragon,
  bossZarinFinal,
];
