// Saric: movement, stamina, XP/Level progression, inventory & equipment.

import {
  DIR_LEFT, DIR_RIGHT, DIR_DOWN, DIR_UP,
  SARIC_WALK_A, SARIC_WALK_B, SARIC_SWING_A, SARIC_SWING_B, SWORD_SPRITE,
} from './config.js';
import { box } from './collision.js';
import { ITEMS } from './items.js';

const WALK_SPEED = 2;
const RUN_SPEED = 3.5;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 1.6;
const STAMINA_REGEN = 0.7;
const STAMINA_FLOOR = 6;

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
    this.hp = 20;
    this.hpMax = 20;
    this.stamina = STAMINA_MAX;
    this.gold = 50;

    // Progression
    this.level = 1;
    this.xp = 0;
    this.nextXp = 30;

    // Stats
    this.baseAttack = 4;
    this.baseDefense = 0;

    // Inventory & Equipment
    this.weapon = ITEMS.wooden_sword;
    this.armor = null;
    this.inventory = [
      ITEMS.wooden_sword,
      ITEMS.potion,
      ITEMS.potion,
    ];

    this.walkTimer = 0;
    this.moving = false;
    this.running = false;
    this.swing = 0;
    this.cooldown = 0;
    this.invuln = 0;
    this.knock = null;
    this.dead = false;
  }

  get attack() {
    const wBonus = this.weapon ? (this.weapon.attack || 0) : 0;
    return this.baseAttack + wBonus;
  }

  get defense() {
    const aBonus = this.armor ? (this.armor.defense || 0) : 0;
    return this.baseDefense + aBonus;
  }

  get body() {
    return box(this.x, this.y, BODY_W, BODY_H);
  }

  get swordBox() {
    if (this.swing <= 0) return null;
    const [dx, dy] = DIR_VECTORS[this.dir];
    return box(this.x + dx * SWORD_REACH, this.y + dy * SWORD_REACH, SWORD_BOX, SWORD_BOX);
  }

  addXp(amount) {
    this.xp += amount;
    let leveledUp = false;
    while (this.xp >= this.nextXp) {
      this.level++;
      this.nextXp = Math.round(this.nextXp * 2.2);
      this.hpMax += 5;
      this.hp = this.hpMax;
      this.stamina = STAMINA_MAX;
      this.baseAttack += 2;
      this.baseDefense += 1;
      leveledUp = true;
    }
    return leveledUp;
  }

  addItem(item) {
    this.inventory.push(item);
  }

  equip(item) {
    if (item.type === 'weapon') {
      this.weapon = item;
    } else if (item.type === 'armor') {
      this.armor = item;
    }
  }

  useItem(item) {
    const idx = this.inventory.indexOf(item);
    if (idx < 0) return false;

    if (item.healFull) {
      this.hp = this.hpMax;
      this.stamina = STAMINA_MAX;
      this.inventory.splice(idx, 1);
      return true;
    } else if (item.heal) {
      this.hp = Math.min(this.hpMax, this.hp + item.heal);
      this.inventory.splice(idx, 1);
      return true;
    }
    return false;
  }

  hurt(rawAmount, fromX, fromY) {
    if (this.invuln > 0 || this.dead) return false;
    const actualDamage = Math.max(1, rawAmount - this.defense);
    this.hp = Math.max(0, this.hp - actualDamage);
    this.invuln = INVULN_FRAMES;
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    this.knock = { x: (dx / len) * 5, y: (dy / len) * 5 };
    if (this.hp === 0) this.dead = true;
    return true;
  }

  update(input, world, screen) {
    if (this.invuln > 0) this.invuln--;
    if (this.cooldown > 0) this.cooldown--;
    if (this.swing > 0) this.swing--;
    if (this.dead) return;

    if (input.attack && this.swing === 0 && this.cooldown === 0) {
      this.swing = SWING_FRAMES;
      this.cooldown = SWING_FRAMES + SWING_COOLDOWN;
      input.consumeAttack();
      this.swungThisFrame = true;
    } else {
      this.swungThisFrame = false;
    }

    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;

    this.moving = (dx !== 0 || dy !== 0) && this.swing === 0;
    this.running = this.moving && input.run && this.stamina > STAMINA_FLOOR;

    if (this.running) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN);
    } else {
      this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN);
    }

    if (this.moving) {
      if (dy < 0) this.dir = DIR_UP;
      else if (dy > 0) this.dir = DIR_DOWN;
      if (dx < 0) this.dir = DIR_LEFT;
      else if (dx > 0) this.dir = DIR_RIGHT;

      const speed = this.running ? RUN_SPEED : WALK_SPEED;
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
