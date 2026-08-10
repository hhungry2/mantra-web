// Spawning and updating enemies and enemy projectiles on a screen.

import { TILE } from './config.js';
import { box } from './collision.js';
import { BEHAVIOURS, AI_NAMES } from './enemy_ai.js';

const BODY_W = 20;
const BODY_H = 16;
const HIT_FLASH = 6;
const KNOCK_FRAMES = 5;

export class Enemy {
  constructor(template, slotIndex, tileX, tileY) {
    this.slotIndex = slotIndex;
    this.x = tileX * TILE + TILE / 2;
    this.y = tileY * TILE + TILE / 2;
    this.sprite = template.sprite;
    this.hp = Math.max(1, template.hp);
    this.speed = template.hp >= 20 ? 0.9 : 1.4;
    this.damage = template.hp >= 20 ? 3 : 2;

    // Pick AI behavior based on template ID
    const aiIndex = Math.abs(template.id) % AI_NAMES.length;
    this.behaviourName = AI_NAMES[aiIndex];
    this.behaviour = BEHAVIOURS[this.behaviourName] || BEHAVIOURS.randomMovement;

    this.vx = 0;
    this.vy = 0;
    this.retarget = 0;
    this.flash = 0;
    this.knock = null;
    this.dead = false;
  }

  get body() {
    return box(this.x, this.y, BODY_W, BODY_H);
  }

  hurt(amount, fromX, fromY) {
    this.hp -= amount;
    this.flash = HIT_FLASH;
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    this.knock = { x: (dx / len) * 4, y: (dy / len) * 4, frames: KNOCK_FRAMES };
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  update(ctx) {
    if (this.flash > 0) this.flash--;
    if (this.knock) {
      ctx.move(this, this.knock.x, this.knock.y);
      this.knock.frames--;
      if (this.knock.frames <= 0) this.knock = null;
      return;
    }
    this.behaviour(this, ctx);
  }
}

export class EnemyProjectile {
  constructor(x, y, vx, vy, damage = 2) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.lifetime = 120;
    this.dead = false;
  }

  get body() {
    return box(this.x, this.y, 8, 8);
  }

  update(world, screen) {
    this.x += this.vx;
    this.y += this.vy;
    this.lifetime--;
    if (this.lifetime <= 0 || world.isSolidPixel(screen, Math.round(this.x), Math.round(this.y))) {
      this.dead = true;
    }
  }
}

export function spawnScreen(screen, templates, defeatedMask = 0) {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const enemies = [];
  if (!screen || !screen.enemies) return enemies;

  for (let idx = 0; idx < screen.enemies.length; idx++) {
    const slot = screen.enemies[idx];
    if (defeatedMask & (1 << idx)) continue; // Enemy was defeated, do not spawn

    const template = byId.get(slot.t);
    if (!template) continue;
    enemies.push(new Enemy(template, idx, slot.c, slot.r));
  }
  return enemies;
}

export function makeMover(world, screen) {
  return (entity, dx, dy) => {
    let moved = false;
    if (dx !== 0) {
      const nx = entity.x + dx;
      if (!world.boxHitsWall(screen, box(nx, entity.y, BODY_W, BODY_H))) {
        entity.x = nx;
        moved = true;
      }
    }
    if (dy !== 0) {
      const ny = entity.y + dy;
      if (!world.boxHitsWall(screen, box(entity.x, ny, BODY_W, BODY_H))) {
        entity.y = ny;
        moved = true;
      }
    }
    return moved;
  };
}
