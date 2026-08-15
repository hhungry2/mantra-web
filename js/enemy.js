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
    this.immunities = record.immunities || 0;
    this.damageType = record.damageType || 0;
    this.movePhase = record.movePhase || 0;
    this.target = record.target || 0;
    this.pushableSpeed = record.pushableSpeed || 0;
    this.boss = !!(this.attributes & ATTR.IS_BOSS);
    this.killable = !!(record.attributes & ATTR.KILLABLE);
    this.solid = !(record.attributes & ATTR.INSUBSTANTIAL);
    this.holdable = !!(record.attributes & ATTR.CAN_BE_HELD);
    this.multiFacing = !!(record.attributes & ATTR.IS_MULTI_FACING);
    this.isMissile = !!(this.attributes & ATTR.IS_MISSILE);
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
    this.animTimer = 0;
    this.flash = 0;
    this.dead = false;

    // Boss & specialized movement state (EnemyUpdate.c)
    this.theta = 0;
    this.disFromUnitCircle = 100;
    this.stuckCounter = 0;
    this.angledCourse = null;
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

  hurt(amount, damageType = 0) {
    if (!this.killable) return false;
    const netDamage = amount - Math.max(0, this.armor);
    // Input.c:869: CHECK_IMMUNITIES(next->immunities, g_Saric.damageType)
    const checkImmunity = (damageType & (~this.immunities)) !== 0;
    if (netDamage <= 0 || !checkImmunity) return false;

    this.hp -= netDamage;
    this.flash = HIT_FLASH;
    this.legCounter = 0; // Input.c:879: enemy legCounter reset to 0 on hit
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  update(ctx) {
    this.animTimer++;
    if (this.flash > 0) this.flash--;
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

export function createEnemyFromTemplate(template, x, y, facing, attributesMask = ~0) {
  const record = {
    ...template,
    r: 0,
    c: 0,
  };
  const enemy = new Enemy(record, -1);
  enemy.x = x;
  enemy.y = y;
  enemy.spawnX = x;
  enemy.spawnY = y;
  enemy.facing = facing;
  enemy.attributes = (enemy.attributes & ~ATTR.ORIGINAL_TO_ROOM) & attributesMask;
  enemy.solid = !(enemy.attributes & ATTR.INSUBSTANTIAL);
  enemy.killable = !!(enemy.attributes & ATTR.KILLABLE);
  enemy.isMissile = !!(enemy.attributes & ATTR.IS_MISSILE);
  return enemy;
}

// The dying body the original leaves when an enemy is killed: template 2056
// spins through its frames for a dozen frames, then settles. A body carrying a
// drop stays until the drop is walked over; one with nothing to drop fades
// after 250 frames. (killCurrentEnemy / dyingMonster in the original C source.)
const DEATH_TEMPLATE = 2056;

export class Corpse {
  constructor(enemy, drop) {
    this.x = enemy.x;
    this.y = enemy.y;
    this.drop = drop || null;
    this.legCounter = 0;
    this.dead = false;
  }

  get body() {
    return box(this.x, this.y, BODY_W, BODY_H);
  }

  // dyingMonster in EnemyUpdate.c: for the first eleven frames the facing
  // walks 1..3 (1 + legCounter/4) while legState is overwritten to 1, then it
  // settles on facing 4 with legState 0 while a drop waits, 1 once the drop
  // is gone. Picking the drop up does not remove the body; it only clears
  // the drop, and the body fades when legCounter reaches 250.
  get frame() {
    let facing;
    let legState;
    if (this.legCounter < 12) {
      facing = 1 + Math.floor(this.legCounter / 4);
      legState = 1;
    } else {
      facing = 4;
      legState = this.drop ? 0 : 1;
    }
    return DEATH_TEMPLATE + legState + (facing - 1) * 2;
  }

  update() {
    this.legCounter++;
    if (this.legCounter >= 250) {
      // The original keeps a body that still has a drop by resetting its
      // counter, so a missed drop stays put; one with nothing left to give
      // fades away.
      if (this.drop) this.legCounter = 16;
      else this.dead = true;
    }
  }
}

// Map.c:96-107: enemy spawning and permanent enemy 1/16 respawn
export function spawnScreen(screen, defeatedMask = 0, onRespawn = null) {
  const enemies = [];
  if (!screen || !screen.enemies) return enemies;
  screen.enemies.forEach((record, index) => {
    const slotIndex = record.slot ?? index;
    if (defeatedMask & (1 << slotIndex)) {
      // Map.c:99: if permanent and (rand & 0x0F == 0) (1/16 chance), respawn
      if ((record.attributes & ATTR.PERMANENT) && Math.floor(Math.random() * 16) === 0) {
        if (onRespawn) onRespawn(slotIndex);
      } else {
        return;
      }
    }
    enemies.push(new Enemy(record, slotIndex));
  });
  return enemies;
}

// Shared movement helper: axis-separated, so an enemy pinned on one axis can
// still slide along the other.
// EnemyCollision.c:594-623: Constrains all enemies to screen [0, 512] x [0, 320].
// Insubstantial enemies bypass wall checks, but NOT screen boundaries.
export function makeMover(world, screen) {
  return (entity, dx, dy) => {
    const size = entity.boss ? BOSS_BODY : BODY_W;
    const height = entity.boss ? BOSS_BODY : BODY_H;
    const isSubstantial = !(entity.attributes & ATTR.INSUBSTANTIAL) && entity.solid !== false;
    let moved = false;

    if (dx !== 0) {
      const nx = entity.x + dx;
      const left = nx - size / 2;
      const right = nx + size / 2;
      if (left >= 0 && right <= 512) {
        if (!isSubstantial || !world.boxHitsWall(screen, box(nx, entity.y, size, height))) {
          entity.x = nx;
          moved = true;
        }
      }
    }
    if (dy !== 0) {
      const ny = entity.y + dy;
      const top = ny - height / 2;
      const bottom = ny + height / 2;
      if (top >= 0 && bottom <= 320) {
        if (!isSubstantial || !world.boxHitsWall(screen, box(entity.x, ny, size, height))) {
          entity.y = ny;
          moved = true;
        }
      }
    }
    return moved;
  };
}
