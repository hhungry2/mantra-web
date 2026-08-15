// Saric: movement, stamina, XP/Level progression, inventory & equipment.

import {
  DIR_LEFT, DIR_RIGHT, DIR_DOWN, DIR_UP,
  SARIC_WALK_A, SARIC_WALK_B, SARIC_SWING_A, SARIC_SWING_B, SWORD_SPRITE,
} from './config.js';
import { box } from './collision.js';
import {
  ITEM_TYPES, FLAG, getEquipmentSlot, isRangedItem,
} from './items.js';

const WALK_SPEED = 2;
const RUN_SPEED = 6;

const SWING_FRAMES = 8;
const SWING_COOLDOWN = 4;
const INVULN_FRAMES = 25;

const BODY_W = 16;
const BODY_H = 12;

const SWORD_REACH = 16;
const SWORD_BOX = 22;

export class Saric {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.dir = DIR_DOWN;
    // Saric.c:40-99 initSaric()
    this.hp = 10;
    this.hpMax = 10;
    this.stamina = 10;
    this.staminaMax = 10;
    this.gold = 0;

    // Progression
    this.level = 0;
    this.xp = 0;
    this.nextXp = 20; // kBaseNextLevel = 20

    // Stats (Saric.c:56-57: armorValue = 0, damage = 1)
    this.baseAttack = 1;
    this.baseDefense = 0;

    // Saric starts empty-handed. The dagger is received from the wounded man
    // on the opening screen, matching the original game's initSaric().
    this.weapon = null;
    this.offhand = null;
    this.armor = null;
    this.inventory = [];

    this.walkTimer = 0;
    this.moving = false;
    this.running = false;
    this.sitCounter = 0;
    this.runCounter = 0;
    this.swing = 0;
    this.cooldown = 0;
    this.rangedCooldown = 0;
    this.woundCounter = 0;
    this.incrementalDamageCounter = 0;
    this.terrainCooldown = 0;
    this.messageCounter = 0;
    this.debugMode = false;
    this.knock = null;
    this.dead = false;
  }

  get attack() {
    return this.baseAttack + this.weaponBonus('damage') + this.offhandBonus('damage');
  }

  get defense() {
    return this.baseDefense + this.armorBonus('armor') + this.offhandBonus('armor');
  }

  get speedBonus() {
    return this.weaponBonus('speed') + this.offhandBonus('speed') + this.armorBonus('speed');
  }

  // Dialogs.c:1584-1585
  get immunities() {
    return (this.weapon?.immunities || 0) | (this.offhand?.immunities || 0) | (this.armor?.immunities || 0);
  }

  get damageType() {
    return (this.weapon?.damageType || 0) | (this.offhand?.damageType || 0) | (this.armor?.damageType || 0);
  }

  weaponBonus(field) {
    return this.weapon ? (this.weapon[field] || 0) : 0;
  }

  offhandBonus(field) {
    return this.offhand ? (this.offhand[field] || 0) : 0;
  }

  armorBonus(field) {
    return this.armor ? (this.armor[field] || 0) : 0;
  }

  canFireRanged() {
    const item = this.offhand;
    return isRangedItem(item)
      && this.rangedCooldown === 0
      && (this.debugMode || this.stamina >= (item.stamina || 0));
  }

  fireRanged() {
    if (!this.canFireRanged()) return null;
    const item = this.offhand;
    if (!this.debugMode) this.stamina = Math.max(0, this.stamina - (item.stamina || 0));
    this.rangedCooldown = Math.max(1, item.rate || 1);
    return item;
  }

  isEquipped(item) {
    const slot = getEquipmentSlot(item);
    return !!slot && this[slot]?.code === item.code;
  }

  get body() {
    return box(this.x, this.y, BODY_W, BODY_H);
  }

  get swordBox() {
    if (this.swing <= 0) return null;
    const [dx, dy] = DIR_VECTORS[this.dir];
    return box(this.x + dx * SWORD_REACH, this.y + dy * SWORD_REACH, SWORD_BOX, SWORD_BOX);
  }

  // Saric.c:101-118 levelUpSaric()
  addXp(amount) {
    this.xp += amount;
    let leveledUp = false;
    while (this.xp >= this.nextXp) {
      this.level++;
      this.hp += 5;
      this.hpMax += 5;
      this.stamina += 5;
      this.staminaMax += 5;
      if (this.nextXp < 20 * 32) { // 640
        this.nextXp *= 2;
      } else {
        this.nextXp += 20 * 32;
      }
      leveledUp = true;
    }
    return leveledUp;
  }

  equip(item) {
    const slot = getEquipmentSlot(item);
    if (!slot) return false;
    if (this[slot]?.code === item.code) {
      this[slot] = null;
    } else {
      this[slot] = item;
    }
    return true;
  }

  // A potion's stamina figure is signed: negative restores fatigue, which is
  // what the Fatigue Restoration and All Salve potions do.
  useItem(item) {
    const idx = this.inventory.indexOf(item);
    if (idx < 0) return false;
    if (!item.heal && item.stamina >= 0) return false;
    if (item.heal) this.hp = Math.min(this.hpMax, this.hp + item.heal);
    if (item.stamina < 0) {
      this.stamina = Math.min(this.staminaMax, this.stamina - item.stamina);
    }
    this.inventory.splice(idx, 1);
    return true;
  }

  // Money is never carried: picking a coin up banks its face value.
  addItem(item) {
    if (item.attributes & FLAG.MONEY) this.gold += item.quantity;
    else this.inventory.push(item);
  }

  recover(amount) {
    if (this.dead) return;
    this.hp = Math.min(this.hpMax, this.hp + Math.max(0, amount));
  }

  terrainHurt(amount) {
    if (this.debugMode || this.dead) return false;
    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    if (this.hp === 0) this.dead = true;
    return true;
  }

  // EnemyCollision.c:512-540
  hurt(rawDamage, damageType = 0, fromX = null, fromY = null, isDying = false) {
    if (this.debugMode || this.dead) return false;
    if (this.woundCounter > 0) return false;

    let i = rawDamage - this.defense;

    // EnemyCollision.c:518-528: incrementalDamageCounter for absorbed hits
    if (i <= 0 && !isDying) {
      this.incrementalDamageCounter++;
      this.woundCounter = 10;
      if (this.incrementalDamageCounter >= 5) {
        i = 1;
        this.incrementalDamageCounter = 0;
      }
    }

    // EnemyCollision.c:533: damage done if i > 0 and not immune
    const checkImmunity = (damageType & (~this.immunities)) !== 0;
    if (i > 0 && checkImmunity) {
      this.hp = Math.max(0, this.hp - i);
      this.woundCounter = 1;
      if (this.hp === 0) this.dead = true;
      if (fromX !== null && fromY !== null) {
        const dx = this.x - fromX;
        const dy = this.y - fromY;
        const len = Math.hypot(dx, dy) || 1;
        this.knock = { x: (dx / len) * 5, y: (dy / len) * 5 };
      }
      return true;
    }
    return false;
  }

  update(input, world, screen) {
    // Input.c:693-701: woundCounter
    if (this.woundCounter > 0) {
      this.woundCounter++;
      if (this.woundCounter > 30) this.woundCounter = 0;
    }
    if (this.terrainCooldown > 0) this.terrainCooldown--;
    if (this.messageCounter > 0) {
      this.messageCounter++;
      if (this.messageCounter > 10) this.messageCounter = 0; // Input.c:704-712
    }
    if (this.cooldown > 0) this.cooldown--;
    if (this.rangedCooldown > 0) this.rangedCooldown--;
    if (this.swing > 0) this.swing--;
    if (this.dead) return;

    // Holding space keeps the sword drawn for as long as the key is down,
    // instead of a single edge-triggered burst; the cooldown only gates the
    // "swing" sound/hit so it doesn't refire every frame of the hold.
    if (input.attack) {
      this.swungThisFrame = this.swing === 0 && this.cooldown === 0;
      if (this.swungThisFrame) this.cooldown = SWING_COOLDOWN;
      this.swing = SWING_FRAMES;
    } else {
      this.swungThisFrame = false;
    }

    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;

    this.moving = dx !== 0 || dy !== 0;
    this.running = this.moving && input.run && this.stamina > 0;

    // Input.c:1048, 1060: counter increments
    if (this.running) {
      this.runCounter++;
      this.sitCounter = 0;
    } else {
      this.sitCounter++;
      this.runCounter = 0;
    }

    // Input.c:655-675: 30-frame stamina increment/decrement
    if (this.debugMode) {
      this.stamina = this.staminaMax;
    } else {
      if (this.sitCounter > 30) {
        this.sitCounter = 0;
        if (this.stamina < this.staminaMax) this.stamina++;
      }
      if (this.runCounter > 30) {
        this.runCounter = 0;
        if (this.stamina > 0) this.stamina--;
      }
    }

    if (this.moving) {
      if (dy < 0) this.dir = DIR_UP;
      else if (dy > 0) this.dir = DIR_DOWN;
      if (dx < 0) this.dir = DIR_LEFT;
      else if (dx > 0) this.dir = DIR_RIGHT;

      // Input.c:1032-1050: speed 6 when running, 2 when walking (+ speedBonus)
      const baseSpeed = this.running ? RUN_SPEED : WALK_SPEED;
      const speed = this.debugMode
        ? (baseSpeed + this.speedBonus) * 2
        : (baseSpeed + this.speedBonus);
      const len = Math.hypot(dx, dy) || 1;
      this.step(world, screen, (dx / len) * speed, (dy / len) * speed);
      this.walkTimer++;
    } else {
      this.walkTimer = 0;
    }

    if (this.knock) {
      this.step(world, screen, this.knock.x, this.knock.y);
      this.knock.x *= 0.7;
      this.knock.y *= 0.7;
      if (Math.abs(this.knock.x) + Math.abs(this.knock.y) < 0.4) this.knock = null;
    }
  }

  step(world, screen, dx, dy) {
    if (dx !== 0) {
      const nx = this.x + dx;
      if (!world.boxHitsWall(screen, box(nx, this.y, BODY_W, BODY_H))) this.x = nx;
    }
    if (dy !== 0) {
      const ny = this.y + dy;
      if (!world.boxHitsWall(screen, box(this.x, ny, BODY_W, BODY_H))) this.y = ny;
    }
  }

  frames() {
    if (this.swing > 0) {
      const base = this.swing > SWING_FRAMES / 2 ? SARIC_SWING_A : SARIC_SWING_B;
      return { body: base + this.dir, sword: SWORD_SPRITE + this.dir };
    }
    const stride = this.running ? 3 : 5;
    const base = this.moving && Math.floor(this.walkTimer / stride) % 2 ? SARIC_WALK_B : SARIC_WALK_A;
    return { body: base + this.dir, sword: null };
  }
}

export const DIR_VECTORS = {
  [DIR_LEFT]: [-1, 0],
  [DIR_RIGHT]: [1, 0],
  [DIR_DOWN]: [0, 1],
  [DIR_UP]: [0, -1],
};
