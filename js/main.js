// Boot and game loop.
//
// Phase 4: Full Game Release & Polish
// Integrates 64x64 Bosses & AI, Title/Story/Win/Lose screens,
// 4-slot localStorage Save & Load, Touch virtual pad, & final polish.

import {
  TILE, FRAME_MS, MAX_CATCHUP_FRAMES, START_SCREEN, START_TILE, VIEW_W, VIEW_H,
} from './config.js';
import { loadAssets } from './assets.js';
import { World } from './map.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Saric } from './saric.js';
import { spawnScreen, makeMover, EnemyProjectile } from './enemy.js';
import { Boss } from './boss.js';
import { overlaps } from './collision.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { initItems, getItem } from './items.js';
import { TouchControls } from './touch.js';

// Doorways that lead into a shop. 1030..1034 are the shopfront tiles.
const SHOP_MODIFIERS = new Set([772, 775, 4868, 5080]);
const SHOP_TILE_BASE = 1030;

// screen index -> { id, tileX, tileY }. Empty until boss placement is decoded.
const BOSS_SCREENS = new Map();

// Fire, Earth, Water, Air, Force.
const MANTRA_CODES = [100, 101, 102, 103, 104];

class Game {
  constructor(assets, canvas) {
    this.world = new World(assets);
    this.renderer = new Renderer(canvas, assets);
    this.templates = assets.templates;
    this.gfx = assets.gfx;
    this.textMsgs = assets.textMsgs || [];
    this.stores = assets.stores || [];
    this.currentStore = null;
    this.input = new Input();
    this.audio = new Audio();
    this.touch = new TouchControls(this.input);

    this.defeatedMasks = new Uint16Array(256);

    this.player = new Saric(
      START_TILE.x * TILE + TILE / 2,
      START_TILE.y * TILE + TILE / 2,
    );

    this.ui = new UI(this);

    this.screenIndex = START_SCREEN;
    this.projectiles = [];
    this.victory = false;
    this.enter(START_SCREEN);

    this.frame = 0;
    this.hudNote = '';

    // Key handlers
    this.input.on('KeyM', () => {
      this.hudNote = this.audio.toggle() ? 'SOUND ON' : 'SOUND OFF';
      this.noteUntil = this.frame + 40;
    });

    this.input.on('KeyI', () => this.ui.toggleInventory());
    this.input.on('Tab', () => this.ui.toggleInventory());
    this.input.on('KeyV', () => this.ui.toggleSave());

    // Space is the sword. It only doubles as "dismiss" while a panel is up,
    // and then the press is swallowed so closing a box does not also swing.
    this.input.on('Space', () => {
      if (this.ui.dialogActive) {
        this.ui.hideDialog();
        this.input.consumeAttack();
      }
    });

    this.input.on('KeyE', () => {
      if (this.ui.dialogActive) this.ui.hideDialog();
      else this.checkInteract();
    });

    this.input.on('Enter', () => {
      if (this.ui.dialogActive) this.ui.hideDialog();
    });
  }

  enter(index, spawnX = null, spawnY = null) {
    this.screenIndex = index;
    this.screen = this.world.screen(index);
    this.enemies = spawnScreen(this.screen, this.templates, this.defeatedMasks[index]);

    // No bosses yet. Where they belong is not in anything we can read: the
    // enemy templates only reference the 32x32 sprite sheet, and the one screen
    // with its own area id is a solid block of filler. Guessing put them on
    // blank screens and inside walls, so they stay out until #9 finds them.
    const boss = BOSS_SCREENS.get(index);
    if (boss && !(this.defeatedMasks[index] & 1)) {
      this.enemies.push(new Boss(boss.id, boss.tileX, boss.tileY));
    }

    this.projectiles = [];
    this.move = makeMover(this.world, this.screen);

    if (spawnX !== null && this.player) this.player.x = spawnX;
    if (spawnY !== null && this.player) this.player.y = spawnY;
  }

  loadGameData(d) {
    this.victory = false;
    this.player.dead = false;
    this.player.invuln = 0;
    this.player.swing = 0;
    this.player.cooldown = 0;

    this.player.level = d.level;
    this.player.hp = d.hp;
    this.player.hpMax = d.hpMax;
    this.player.stamina = d.stamina;
    this.player.xp = d.xp;
    this.player.nextXp = d.nextXp;
    this.player.gold = d.gold;
    this.player.baseAttack = d.baseAttack;
    this.player.baseDefense = d.baseDefense;

    if (d.weaponCode) this.player.weapon = getItem(d.weaponCode) || this.player.weapon;
    if (d.armorCode) this.player.armor = getItem(d.armorCode);

    if (d.inventoryCodes) {
      this.player.inventory = d.inventoryCodes.map((code) => getItem(code)).filter(Boolean);
    }

    if (d.defeatedMasks) {
      this.defeatedMasks = new Uint16Array(d.defeatedMasks);
    }

    this.enter(d.screenIndex || START_SCREEN, d.playerPos ? d.playerPos.x : 256, d.playerPos ? d.playerPos.y : 160);
    this.hudNote = 'GAME LOADED!';
    this.noteUntil = this.frame + 60;
  }

  // Which of the five shops a doorway leads to is not recorded anywhere we can
  // read yet: the tile's second field, which would hold the target, survives in
  // the data as a truncated pointer. Until that is decoded (#11) the shopfront
  // art picks the shop, so a given door at least always opens the same one.
  storeAt(tile, mod) {
    if (!SHOP_MODIFIERS.has(mod)) return null;
    const index = tile - SHOP_TILE_BASE;
    if (index < 0 || index >= this.stores.length) return null;
    return this.stores[index];
  }

  checkInteract() {
    const player = this.player;
    const tx = Math.max(0, Math.min(15, Math.floor(player.x / TILE)));
    const ty = Math.max(0, Math.min(9, Math.floor(player.y / TILE)));
    const mod = this.world.modifierAt(this.screen, tx, ty);
    const tile = this.world.tileAt(this.screen, tx, ty);

    const store = this.storeAt(tile, mod);
    if (store) {
      this.currentStore = store;
      this.ui.toggleShop(true);
      return;
    }

    this.hudNote = 'NOTHING HERE';
    this.noteUntil = this.frame + 25;
  }

  checkScreenTransitions() {
    const player = this.player;
    const currIdx = this.screenIndex;

    // Check Warp tiles
    const warp = this.world.checkWarp(this.screen, player.x, player.y);
    if (warp) {
      const targetX = warp.targetTileX * TILE + TILE / 2;
      const targetY = warp.targetTileY * TILE + TILE / 2;
      this.audio.play('door');
      this.enter(warp.targetScreen, targetX, targetY);
      return;
    }

    // Check Grid transitions (screen boundaries)
    if (player.x < 0) {
      const nextIdx = this.world.getNeighbor(currIdx, 'left');
      if (nextIdx !== null) this.enter(nextIdx, VIEW_W - 12, player.y);
      else player.x = 8;
    } else if (player.x >= VIEW_W) {
      const nextIdx = this.world.getNeighbor(currIdx, 'right');
      if (nextIdx !== null) this.enter(nextIdx, 12, player.y);
      else player.x = VIEW_W - 8;
    } else if (player.y < 0) {
      const nextIdx = this.world.getNeighbor(currIdx, 'up');
      if (nextIdx !== null) this.enter(nextIdx, player.x, VIEW_H - 12);
      else player.y = 8;
    } else if (player.y >= VIEW_H) {
      const nextIdx = this.world.getNeighbor(currIdx, 'down');
      if (nextIdx !== null) this.enter(nextIdx, player.x, 12);
      else player.y = VIEW_H - 8;
    }
  }

  tick() {
    this.frame++;

    if (this.ui.inventoryOpen || this.ui.shopOpen || this.ui.saveOpen || this.ui.dialogActive) return;

    const player = this.player;
    player.update(this.input, this.world, this.screen);
    if (player.swungThisFrame) this.audio.play('sword');

    this.checkScreenTransitions();

    const spawnProj = (x, y, vx, vy, damage) => {
      this.projectiles.push(new EnemyProjectile(x, y, vx, vy, damage));
    };

    const ctx = {
      world: this.world,
      screen: this.screen,
      player,
      move: this.move,
      spawnProjectile: spawnProj,
    };
    const sword = player.swordBox;

    // Update Enemies & Bosses
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.update(ctx);

      if (sword && enemy.flash === 0 && overlaps(sword, enemy.body)) {
        const killed = enemy.hurt(player.attack, player.x, player.y);
        this.audio.play(killed ? 'kill' : 'hit');
        if (killed) {
          if (enemy.slotIndex !== undefined) {
            this.defeatedMasks[this.screenIndex] |= (1 << enemy.slotIndex);
          } else if (enemy.isBoss) {
            this.defeatedMasks[this.screenIndex] |= 1;
          }
          player.gold += enemy.isBoss ? 200 : 5;
          const xpReward = enemy.isBoss ? 150 : Math.max(5, enemy.hp * 2);
          const leveledUp = player.addXp(xpReward);
          if (leveledUp) {
            this.audio.play('kill');
            this.hudNote = 'LEVEL UP!';
            this.noteUntil = this.frame + 60;
          }
        }
      }

      if (!enemy.dead && overlaps(player.body, enemy.body)) {
        if (player.hurt(enemy.damage, enemy.x, enemy.y)) {
          this.audio.play(player.dead ? 'die' : 'hurt');
        }
      }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);

    // Update Projectiles
    for (const proj of this.projectiles) {
      if (proj.dead) continue;
      proj.update(this.world, this.screen);
      if (!proj.dead && overlaps(player.body, proj.body)) {
        if (player.hurt(proj.damage, proj.x, proj.y)) {
          this.audio.play(player.dead ? 'die' : 'hurt');
        }
        proj.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    // The Ambassador's letters set the quest: find the five Mantras. That is
    // the one ending the data actually spells out.
    if (!this.victory && MANTRA_CODES.every((c) => player.inventory.some((i) => i.code === c))) {
      this.victory = true;
      this.audio.play('fanfare');
    }
  }

  draw() {
    const r = this.renderer;
    r.clear();
    r.drawScreen(this.screen);
    r.drawEntities(this.player, this.enemies);
    r.drawProjectiles(this.projectiles);

    const gridX = this.screenIndex % 16;
    const gridY = Math.floor(this.screenIndex / 16);
    let note = `SCREEN ${this.screenIndex} (${gridX},${gridY})`;
    if (this.noteUntil > this.frame) note = this.hudNote;
    r.drawHud(this.player, note);

    if (this.player.dead) {
      r.drawEndCard(this.renderer.lose, 'Press V to load a saved game');
    } else if (this.victory) {
      r.drawEndCard(this.renderer.win, 'Bring them to Castle Blednock');
    }
  }
}

async function boot() {
  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('overlay-screen');
  const message = document.getElementById('overlay-msg');
  const button = document.getElementById('start-btn');

  message.textContent = 'Loading assets...';
  button.disabled = true;

  let assets;
  try {
    assets = await loadAssets();
  } catch (err) {
    message.textContent = `Could not load assets: ${err.message}`;
    return;
  }

  initItems(assets.items);
  const game = new Game(assets, canvas);
  window.mantra = game; // debug handle
  game.draw();
  message.textContent = 'Mantra Web Port (Full Release: 256 Screens, RPG Systems, Bosses, Saves, & Touch Controls)';
  button.disabled = false;

  const story = document.getElementById('story-screen');
  const storyButton = document.getElementById('story-btn');

  button.addEventListener('click', async () => {
    overlay.classList.add('hidden');
    story.classList.remove('hidden');
    await game.audio.start();
    game.audio.playMusic(0);
  });

  storyButton.addEventListener('click', () => {
    story.classList.add('hidden');
    run(game);
  });
}

function run(game) {
  let previous = performance.now();
  let accumulator = 0;

  function loop(now) {
    accumulator += now - previous;
    previous = now;
    let steps = Math.min(Math.floor(accumulator / FRAME_MS), MAX_CATCHUP_FRAMES);
    accumulator -= steps * FRAME_MS;
    if (accumulator > FRAME_MS * MAX_CATCHUP_FRAMES) accumulator = 0;
    while (steps-- > 0) game.tick();
    game.draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

boot();
