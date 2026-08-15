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

    this.weaponFireCounter = 999;
    this.offhandFireCounter = 999;
    this.hadHitEnemy = false;
    this.swordOut = false;
    this.wasSwordOut = false;
    this.offhandOut = false;
    this.wasOffhandOut = false;

    this.swungThisFrame = false;
    this.firedThisFrame = null;
    this.offhandFiredThisFrame = null;
    this.specialRoutineThisFrame = null;

    this.woundCounter = 0;
    this.incrementalDamageCounter = 0;
    this.messageCounter = 0;
    this.debugMode = false;
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

  // Input.c:782-799, 973-990: charges consumption
  consumeItemCharge(item) {
    if (item.currentCharges === undefined) item.currentCharges = item.charges || 1;
    item.currentCharges--;
    if (item.currentCharges <= 0) {
      item.quantity = (item.quantity || 1) - 1;
      item.currentCharges = item.charges || 1;
      if (item.quantity <= 0) {
        const idx = this.inventory.indexOf(item);
        if (idx >= 0) this.inventory.splice(idx, 1);
        if (this.weapon === item) this.weapon = null;
        if (this.offhand === item) this.offhand = null;
        if (this.armor === item) this.armor = null;
      }
    }
  }

  // A potion's stamina figure is signed: negative restores fatigue, which is
  // what the Fatigue Restoration and All Salve potions do.
  useItem(item) {
    const idx = this.inventory.indexOf(item);
    if (idx < 0) return { success: false, reason: 'not_found' };
    if (!item.heal && item.stamina >= 0) return { success: false, reason: 'not_usable' };

    const hpNeeded = item.heal > 0 && this.hp < this.hpMax;
    const stNeeded = item.stamina < 0 && this.stamina < this.staminaMax;

    if (!hpNeeded && !stNeeded && (item.heal > 0 || item.stamina < 0)) {
      return { success: false, reason: 'full' };
    }

    let healedHp = 0;
    let restoredStamina = 0;

    if (item.heal) {
      const oldHp = this.hp;
      this.hp = Math.min(this.hpMax, this.hp + item.heal);
      healedHp = this.hp - oldHp;
    }
    if (item.stamina < 0) {
      const oldStamina = this.stamina;
      this.stamina = Math.min(this.staminaMax, this.stamina - item.stamina);
      restoredStamina = this.stamina - oldStamina;
    }

    if (item.currentCharges === undefined) item.currentCharges = item.charges || 1;
    item.currentCharges--;
    if (item.currentCharges <= 0) {
      item.quantity = (item.quantity || 1) - 1;
      item.currentCharges = item.charges || 1;
      if (item.quantity <= 0) {
        this.inventory.splice(idx, 1);
      }
    }
    return { success: true, healedHp, restoredStamina };
  }

  // Money is never carried: picking a coin up banks its face value.
  addItem(item) {
    if (item.attributes & FLAG.MONEY) {
      this.gold += item.quantity;
    } else {
      const existing = this.inventory.find((i) => i.code === item.code);
      if (existing && !(existing.attributes & (FLAG.WEAPON | FLAG.ARMOR))) {
        existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
      } else {
        this.inventory.push({
          ...item,
          quantity: item.quantity || 1,
          currentCharges: item.charges || 1,
        });
      }
    }
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

  // EnemyCollision.c:512-571
  hurt(rawDamage, damageType = 0, enemyFacing = 0, isDying = false, world = null, screen = null) {
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

      // EnemyCollision.c:547-571: 8px bump in enemy facing direction
      if (world && screen) {
        let kx = 0;
        let ky = 0;
        if (enemyFacing === 1) kx = 8;
        else if (enemyFacing === 2) ky = 8;
        else if (enemyFacing === 3) kx = -8;
        else if (enemyFacing === 4) ky = -8;

        if (kx !== 0 || ky !== 0) {
          this.step(world, screen, kx, ky);
        }
      }
      return true;
    }
    return false;
  }

  update(input, world, screen) {
    this.swungThisFrame = false;
    this.firedThisFrame = null;
    this.offhandFiredThisFrame = null;
    this.specialRoutineThisFrame = null;

    // Input.c:693-701: woundCounter
    if (this.woundCounter > 0) {
      this.woundCounter++;
      if (this.woundCounter > 30) this.woundCounter = 0;
    }
    if (this.messageCounter > 0) {
      this.messageCounter++;
      if (this.messageCounter > 10) this.messageCounter = 0; // Input.c:704-712
    }
    if (this.swing > 0) this.swing--;
    if (this.dead) return;

    this.weaponFireCounter++;
    this.offhandFireCounter++;

    // Input.c:749-935: Main Weapon (Sword)
    this.swordOut = false;
    if (input.attack) {
      const weapon = this.weapon;
      if (!this.hadHitEnemy && weapon) {
        if (this.weaponFireCounter >= (weapon.rate || 0)) {
          const canSwing = this.debugMode || (weapon.stamina || 0) <= 0 || this.stamina >= weapon.stamina;
          if (canSwing) {
            this.swordOut = true;
            this.swing = SWING_FRAMES;
            if (!this.wasSwordOut) {
              if (!this.debugMode && (weapon.stamina || 0) > 0) {
                this.stamina = Math.max(0, this.stamina - weapon.stamina);
              }
              if (weapon.attributes & FLAG.HAS_CHARGES) {
                this.consumeItemCharge(weapon);
              }
              if (weapon.heal > 0) {
                this.hp = Math.min(this.hpMax, this.hp + weapon.heal);
              }
              if (weapon.fires) {
                this.firedThisFrame = weapon;
              }
              this.swungThisFrame = true;
            }
          }
        }
      }
    } else {
      this.hadHitEnemy = false;
    }

    if (this.wasSwordOut && !this.swordOut) {
      this.weaponFireCounter = 0;
    }
    this.wasSwordOut = this.swordOut;

    // Input.c:941-1030: Offhand Weapon / Item
    this.offhandOut = false;
    if (input.ranged) {
      const offhand = this.offhand;
      if (offhand) {
        if (this.offhandFireCounter >= (offhand.rate || 0)) {
          const canUse = this.debugMode || (offhand.stamina || 0) <= 0 || this.stamina >= offhand.stamina;
          if (canUse) {
            this.offhandOut = true;
            if (!this.wasOffhandOut) {
              if (!this.debugMode && (offhand.stamina || 0) > 0) {
                this.stamina = Math.max(0, this.stamina - offhand.stamina);
              }
              if (offhand.attributes & FLAG.HAS_CHARGES) {
                this.consumeItemCharge(offhand);
              }
              if (offhand.heal > 0) {
                this.hp = Math.min(this.hpMax, this.hp + offhand.heal);
              }
              if (offhand.fires) {
                this.offhandFiredThisFrame = offhand;
              }
              if (offhand.attributes & FLAG.SPECIAL_ROUTINE) {
                this.specialRoutineThisFrame = offhand;
              }
            }
          }
        }
      }
    }

    if (this.wasOffhandOut && !this.offhandOut) {
      this.offhandFireCounter = 0;
    }
    this.wasOffhandOut = this.offhandOut;

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
