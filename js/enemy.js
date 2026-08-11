// Spawning and updating the enemies a screen carries, and their projectiles.
//
// Every field an enemy needs is in the map: hit points, contact damage,
// armour, speed, experience, which of the movement routines to run, what it
// drops, and for a signpost which message it carries.

import { TILE } from './config.js';
import { box } from './collision.js';
import { run } from './enemy_ai.js';

// Enemy attribute bits, from GameTypes.h.
export const ATTR = {
  IS_ENEMY: 1,
  CAN_BE_HELD: 2,
  KILLABLE: 4,
  CAN_FIRE: 8,
  PUSHABLE: 16,
  INSUBSTANTIAL: 32,
  PERMANENT: 64,
  IS_MISSILE: 128,
  ORIGINAL_TO_ROOM: 256,
  IS_MULTI_FACING: 512,
  IS_BOSS: 1024,
};

const BODY_W = 20;
const BODY_H = 16;
const BOSS_BODY = 64;
const HIT_FLASH = 6;
const KNOCK_FRAMES = 5;

// The data stores speed in the original's units; a plain wanderer is 1.
const SPEED_SCALE = 0.7;

export class Enemy {
  constructor(record, slotIndex) {
    this.slotIndex = slotIndex;
    this.sprite = record.sprite;
    this.hp = Math.max(1, record.hp);
    this.armor = record.armor;
    // Signposts, shopkeepers and townspeople are enemies with no damage.
    this.damage = record.damage;
    this.xp = record.xp;
    // speed:0 in the data means "stands still" (signposts, the wounded man at
    // the start) - `|| 1` would treat that explicit zero as "unset" and the
    // 0.4 floor would make it creep anyway, so zero has to bypass both.
    this.speed = record.speed === 0 ? 0 : Math.max(0.4, Math.abs(record.speed || 1) * SPEED_SCALE);
    this.ai = record.ai;
    this.range = record.range;
    this.rate = record.rate;
    this.fires = record.fires;
    this.drop = record.drop;
    this.message = record.message;
    this.attributes = record.attributes;
    this.boss = !!(this.attributes & ATTR.IS_BOSS);
    this.killable = !!(record.attributes & ATTR.KILLABLE);
    this.solid = !(record.attributes & ATTR.INSUBSTANTIAL);
    this.holdable = !!(record.attributes & ATTR.CAN_BE_HELD);
    this.multiFacing = !!(record.attributes & ATTR.IS_MULTI_FACING);
    this.facing = Number.isFinite(record.facing) ? record.facing : 0;
    this.x = record.c * TILE + (this.boss ? TILE : TILE / 2);
    this.y = record.r * TILE + (this.boss ? TILE : TILE / 2);
    this.spawnX = this.x;
    this.spawnY = this.y;
    this.legCounter = 0;
    this.legState = 0;

    this.vx = 0;
    this.vy = 0;
    this.retarget = 0;
    this.cooldown = 0;
    this.fireCounter = record.rate || 0;
    this.animTimer = 0;
    this.flash = 0;
    this.knock = null;
    this.dead = false;
  }

  get body() {
    const size = this.boss ? BOSS_BODY : BODY_W;
    return box(this.x, this.y, size, this.boss ? BOSS_BODY : BODY_H);
  }

  // The original stores two frames per facing after the spriteRef. BossData
  // uses the same offset, but starts at frame zero instead of sprite id 2000.
  get frameOffset() {
    let offset = this.legState;
    if (this.multiFacing) {
      offset += (this.facing - 1) * 2;
      if (this.facing === 0) offset += 2;
    }
    return offset;
  }

  get frame() {
    return this.sprite + this.frameOffset;
  }

  get currentFrame() {
    return this.sprite - 2000 + this.frameOffset;
  }

  hurt(amount, fromX, fromY) {
    if (!this.killable) return false;
    const actual = Math.max(1, amount - Math.max(0, this.armor));
    this.hp -= actual;
    this.flash = HIT_FLASH;
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    this.knock = { x: (dx / len) * 4, y: (dy / len) * 4, frames: KNOCK_FRAMES };
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  update(ctx) {
    this.animTimer++;
    // legState flips every fourth frame, which is the walking shuffle.
    this.legCounter++;
    if (this.legCounter % 4 === 0) this.legState = 1 - this.legState;
    if (this.flash > 0) this.flash--;
    if (this.knock) {
      ctx.move(this, this.knock.x, this.knock.y);
      this.knock.frames--;
      if (this.knock.frames <= 0) this.knock = null;
      return;   // staggered enemies do not also walk
    }
    const wasX = this.x;
    const wasY = this.y;
    run(this, ctx);
    this.face(this.x - wasX, this.y - wasY);
  }

  // Facings are 1 right, 2 down, 3 left, 4 up; zero is neutral.
  face(dx, dy) {
    if (!dx && !dy) return;
    if (Math.abs(dx) >= Math.abs(dy)) this.facing = dx > 0 ? 1 : 3;
    else this.facing = dy > 0 ? 2 : 4;
  }
}

export class EnemyProjectile {
  constructor(x, y, vx, vy, damage, sprite) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = Math.max(1, damage);
    this.sprite = sprite || 0;
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

export function spawnScreen(screen, defeatedMask = 0) {
  const enemies = [];
  if (!screen || !screen.enemies) return enemies;
  screen.enemies.forEach((record, index) => {
    const slotIndex = record.slot ?? index;
    if (defeatedMask & (1 << slotIndex)) return;
    enemies.push(new Enemy(record, slotIndex));
  });
  return enemies;
}

// Shared movement helper: axis-separated, so an enemy pinned on one axis can
// still slide along the other.
export function makeMover(world, screen) {
  return (entity, dx, dy) => {
    const size = entity.boss ? BOSS_BODY : BODY_W;
    const height = entity.boss ? BOSS_BODY : BODY_H;
    let moved = false;
    if (dx !== 0) {
      const nx = entity.x + dx;
      if (!world.boxHitsWall(screen, box(nx, entity.y, size, height))) {
        entity.x = nx;
        moved = true;
      }
    }
    if (dy !== 0) {
      const ny = entity.y + dy;
      if (!world.boxHitsWall(screen, box(entity.x, ny, size, height))) {
        entity.y = ny;
        moved = true;
      }
    }
    return moved;
  };
}
