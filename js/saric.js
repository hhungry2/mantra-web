// Saric: movement, stamina, XP/Level progression, inventory & equipment.

import {
  DIR_LEFT, DIR_RIGHT, DIR_DOWN, DIR_UP,
  SARIC_WALK_A, SARIC_WALK_B, SARIC_SWING_A, SARIC_SWING_B, SWORD_SPRITE,
} from './config.js';
import { box, overlaps } from './collision.js';
import {
  ITEM_TYPES, FLAG, getEquipmentSlot, isRangedItem,
} from './items.js';
import { ATTR } from './enemy.js';

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
    // Dialogs.c:1520-1580: itemEffects[0] is the one equipped sword,
    // itemEffects[1] the one equipped special item (wand/mantra/key/...),
    // itemEffects[2] the equipped armor plus every equipped ring summed
    // together - rings toggle independently and don't compete with each
    // other or with the special slot.
    this.weapon = null;
    this.special = null;
    this.armor = null;
    this.rings = [];
    this.inventory = [];

    this.walkTimer = 0;
    this.moving = false;
    this.running = false;
    this.sitCounter = 0;
    this.runCounter = 0;
    this.swing = 0;

    this.weaponFireCounter = 999;
    this.specialFireCounter = 999;
    this.hadHitEnemy = false;
    this.swordOut = false;
    this.wasSwordOut = false;
    this.specialOut = false;
    this.wasSpecialOut = false;

    this.swungThisFrame = false;
    this.firedThisFrame = null;
    this.specialFiredThisFrame = null;
    this.specialRoutineThisFrame = null;

    this.woundCounter = 0;
    this.incrementalDamageCounter = 0;
    this.messageCounter = 0;
    this.debugMode = false;
    this.dead = false;
  }

  // Input.c:823: i = g_Saric.damage + itemEffects[0].damage + itemEffects[1].damage + itemEffects[2].damage
  get attack() {
    return this.baseAttack + this.weaponBonus('damage') + this.specialBonus('damage') + this.armorAndRingsBonus('damage');
  }

  get defense() {
    return this.baseDefense + this.weaponBonus('armor') + this.specialBonus('armor') + this.armorAndRingsBonus('armor');
  }

  get speedBonus() {
    return this.weaponBonus('speed') + this.specialBonus('speed') + this.armorAndRingsBonus('speed');
  }

  // Dialogs.c:1584-1585
  get immunities() {
    return (this.weapon?.immunities || 0) | (this.special?.immunities || 0) | this.armorAndRingsBonus('immunities');
  }

  get damageType() {
    return (this.weapon?.damageType || 0) | (this.special?.damageType || 0) | this.armorAndRingsBonus('damageType');
  }

  weaponBonus(field) {
    return this.weapon ? (this.weapon[field] || 0) : 0;
  }

  specialBonus(field) {
    return this.special ? (this.special[field] || 0) : 0;
  }

  // Dialogs.c:1561-1580 (itemEffects[2]): the armor slot and every equipped
  // ring are summed (or OR'd, for the bitmask fields) into one bucket -
  // rings stack with each other and with the armor, unlike the exclusive
  // weapon/special slots.
  armorAndRingsBonus(field) {
    const isMask = field === 'immunities' || field === 'damageType';
    let total = 0;
    if (this.armor) total = isMask ? (total | (this.armor[field] || 0)) : total + (this.armor[field] || 0);
    for (const ring of this.rings) {
      total = isMask ? (total | (ring[field] || 0)) : total + (ring[field] || 0);
    }
    return total;
  }

  isEquipped(item) {
    const slot = getEquipmentSlot(item);
    if (slot === 'ring') return this.rings.some((r) => r.code === item.code);
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

  // Dialogs.c:1109-1129: isSelectable (rings) just toggles membership and
  // never deselects anything else; isSword/isArmor/isSpecialItem each
  // replace whatever was already in their own single slot.
  equip(item) {
    const slot = getEquipmentSlot(item);
    if (!slot) return false;
    if (slot === 'ring') {
      const idx = this.rings.findIndex((r) => r.code === item.code);
      if (idx >= 0) this.rings.splice(idx, 1);
      else this.rings.push(item);
      return true;
    }
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
        if (this.special === item) this.special = null;
        if (this.armor === item) this.armor = null;
        const ringIdx = this.rings.indexOf(item);
        if (ringIdx >= 0) this.rings.splice(ringIdx, 1);
      }
    }
  }

  // A potion's stamina figure is signed: negative restores fatigue, which is
  // what the Fatigue Restoration and All Salve potions do.
  useItem(item) {
    const idx = this.inventory.indexOf(item);
    if (idx < 0) return { success: false, reason: 'not_found' };
    if (!item.heal && item.stamina >= 0) return { success: false, reason: 'not_usable' };

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
  //
  // How many you get depends on where it came from, and the original is
  // deliberate about the difference: something found in the world hands over
  // the template's whole `quantity` (EnemyCollision.c:484, EnemyUpdate.c:196),
  // while a shop sells them one at a time - both purchase paths in the
  // original do a bare `itemQuantities[...]++` (Dialogs.c:2000, 2132).
  // Healing potions carry quantity 10, so passing the default at a shop hands
  // over ten for the price of one.
  addItem(item, count = item.quantity || 1) {
    if (item.attributes & FLAG.MONEY) {
      this.gold += count;
    } else {
      const existing = this.inventory.find((i) => i.code === item.code);
      if (existing && !(existing.attributes & (FLAG.WEAPON | FLAG.ARMOR))) {
        existing.quantity = (existing.quantity || 1) + count;
      } else {
        this.inventory.push({
          ...item,
          quantity: count,
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

  update(input, world, screen, enemies = []) {
    this.swungThisFrame = false;
    this.firedThisFrame = null;
    this.specialFiredThisFrame = null;
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
    this.specialFireCounter++;

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

    // Input.c:941-1030: Special-slot Weapon / Item (itemEffects[1])
    this.specialOut = false;
    if (input.ranged) {
      const special = this.special;
      if (special) {
        if (this.specialFireCounter >= (special.rate || 0)) {
          const canUse = this.debugMode || (special.stamina || 0) <= 0 || this.stamina >= special.stamina;
          if (canUse) {
            this.specialOut = true;
            if (!this.wasSpecialOut) {
              if (!this.debugMode && (special.stamina || 0) > 0) {
                this.stamina = Math.max(0, this.stamina - special.stamina);
              }
              if (special.attributes & FLAG.HAS_CHARGES) {
                this.consumeItemCharge(special);
              }
              if (special.heal > 0) {
                this.hp = Math.min(this.hpMax, this.hp + special.heal);
              }
              if (special.fires) {
                this.specialFiredThisFrame = special;
              }
              if (special.attributes & FLAG.SPECIAL_ROUTINE) {
                this.specialRoutineThisFrame = special;
              }
            }
          }
        }
      }
    }

    if (this.wasSpecialOut && !this.specialOut) {
      this.specialFireCounter = 0;
    }
    this.wasSpecialOut = this.specialOut;

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
      this.step(world, screen, (dx / len) * speed, (dy / len) * speed, enemies);
      this.walkTimer++;
    } else {
      this.walkTimer = 0;
    }
  }

  // EnemyCollision.c:236-431 (standableRect): the original blocks Saric's
  // own movement against every non-insubstantial enemy, not just tiles - a
  // signpost or a boulder is exactly as solid as a wall. Scoped here to
  // enemies with no interaction of their own (no message, not something you
  // walk over to pick up, not a door - doors already block via
  // world.closedDoors): those carry an overlap-based trigger elsewhere in
  // the tick loop, and the original's version of that trigger runs off a
  // per-pixel sprite mask, which tolerates a body sitting flush against
  // another without needing the two AABBs this port uses to ever register as
  // overlapping. Extending the same blocking to message-bearing or holdable
  // enemies would leave a standing gap that overlaps() (strict `<`) can
  // never close, so a shop or signpost approached head-on would go silent.
  blockedByEnemy(candidate, enemies) {
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (enemy.attributes & ATTR.INSUBSTANTIAL) continue;
      if (enemy.attributes & ATTR.CAN_BE_HELD) continue;
      if (enemy.ai === 15) continue; // AI.DOOR: handled via world.closedDoors
      if (enemy.message) continue;
      if (overlaps(candidate, enemy.body)) return true;
    }
    return false;
  }

  step(world, screen, dx, dy, enemies = []) {
    if (dx !== 0) {
      const nx = this.x + dx;
      const candidate = box(nx, this.y, BODY_W, BODY_H);
      if (!world.boxHitsWall(screen, candidate) && !this.blockedByEnemy(candidate, enemies)) this.x = nx;
    }
    if (dy !== 0) {
      const ny = this.y + dy;
      const candidate = box(this.x, ny, BODY_W, BODY_H);
      if (!world.boxHitsWall(screen, candidate) && !this.blockedByEnemy(candidate, enemies)) this.y = ny;
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
