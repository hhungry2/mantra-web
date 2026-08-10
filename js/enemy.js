// Spawning and updating the enemies a screen carries.
//
// A screen's 16 enemy slots give a template index and a tile position. The
// template (TmplData) supplies the sprite and hit points. Speed, contact damage
// and which of the 22 movement routines to run are still undecoded, so phase 1
// derives them from the template index; phase 2 replaces that with real data.

import { TILE } from './config.js';
import { box } from './collision.js';
import { BEHAVIOURS } from './enemy_ai.js';

const BODY_W = 20;
const BODY_H = 16;
const HIT_FLASH = 6;
const KNOCK_FRAMES = 5;

export class Enemy {
  constructor(template, tileX, tileY) {
    this.x = tileX * TILE + TILE / 2;
    this.y = tileY * TILE + TILE / 2;
    this.sprite = template.sprite;
    this.hp = Math.max(1, template.hp);
    this.speed = template.hp >= 20 ? 0.9 : 1.4;
    this.damage = template.hp >= 20 ? 3 : 2;
    // Provisional: alternating so both phase 1 behaviours are on screen.
    this.behaviour = template.id % 2 === 0 ? 'randomMovement' : 'homing';
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
      return;   // staggered enemies do not also walk
    }
    BEHAVIOURS[this.behaviour](this, ctx);
  }
}

export function spawnScreen(screen, templates) {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const enemies = [];
  for (const slot of screen.enemies) {
    const template = byId.get(slot.t);
    if (!template) continue;
    enemies.push(new Enemy(template, slot.c, slot.r));
  }
  return enemies;
}

// Shared movement helper: axis-separated, so an enemy pinned on one axis can
// still slide along the other.
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
