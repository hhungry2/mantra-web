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
import { ITEMS } from './items.js';
import { TouchControls } from './touch.js';

class Game {
  constructor(assets, canvas) {
    this.world = new World(assets);
    this.renderer = new Renderer(canvas, assets);
    this.templates = assets.templates;
    this.textMsgs = assets.textMsgs || [];
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

    this.input.on('Space', () => {
      if (this.ui.dialogActive) {
        this.ui.hideDialog();
      } else {
        this.checkInteract();
      }
    });

    this.input.on('Enter', () => {
      if (this.ui.dialogActive) this.ui.hideDialog();
    });
  }

  enter(index, spawnX = null, spawnY = null) {
    this.screenIndex = index;
    this.screen = this.world.screen(index);
    this.enemies = spawnScreen(this.screen, this.templates, this.defeatedMasks[index]);

    // Spawn Boss on specific boss screens
    if (index === 255 && !(this.defeatedMasks[index] & 1)) {
      this.enemies.push(new Boss(7, 8, 4)); // Final Boss Zarin
    } else if (index % 32 === 0 && index !== 0 && !(this.defeatedMasks[index] & 1)) {
      const bossType = Math.floor(index / 32) % 8;
      this.enemies.push(new Boss(bossType, 8, 4));
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

    if (d.weaponId && ITEMS[d.weaponId]) this.player.weapon = ITEMS[d.weaponId];
    if (d.armorId && ITEMS[d.armorId]) this.player.armor = ITEMS[d.armorId];

    if (d.inventoryIds) {
      this.player.inventory = d.inventoryIds.map((id) => ITEMS[id]).filter(Boolean);
    }

    if (d.defeatedMasks) {
      this.defeatedMasks = new Uint16Array(d.defeatedMasks);
    }

    this.enter(d.screenIndex || START_SCREEN, d.playerPos ? d.playerPos.x : 256, d.playerPos ? d.playerPos.y : 160);
    this.hudNote = 'GAME LOADED!';
    this.noteUntil = this.frame + 60;
  }

  checkInteract() {
    const player = this.player;
    const tx = Math.max(0, Math.min(15, Math.floor(player.x / TILE)));
    const ty = Math.max(0, Math.min(9, Math.floor(player.y / TILE)));
    const mod = this.world.modifierAt(this.screen, tx, ty);

    // Store / Shop modifier
    if ((mod & 0x300) === 0x300 || mod === 772) {
      this.ui.toggleShop(true);
      return;
    }

    // Signboard / Message trigger
    if (this.textMsgs.length > 0) {
      const msgIdx = (this.screenIndex + tx + ty) % this.textMsgs.length;
      const msg = this.textMsgs[msgIdx];
      if (msg) {
        this.ui.showDialog(`Notice`, msg);
      }
    }
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
            if (enemy.bossId === 7) {
              this.victory = true;
              this.audio.play('fanfare');
            }
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
      r.drawBanner(['GAME OVER', 'Press V to Load Game or Reload page']);
    } else if (this.victory) {
      r.drawBanner(['VICTORY!', 'You have slain Zarin and saved the realm!']);
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

  try {
    const res = await fetch('assets/data/text.json');
    if (res.ok) assets.textMsgs = await res.json();
  } catch (e) {
    assets.textMsgs = [];
  }

  const game = new Game(assets, canvas);
  window.mantra = game; // debug handle
  game.draw();
  message.textContent = 'Mantra Web Port (Full Release: 256 Screens, RPG Systems, Bosses, Saves, & Touch Controls)';
  button.disabled = false;

  button.addEventListener('click', async () => {
    overlay.classList.add('hidden');
    await game.audio.start();
    game.audio.playMusic(0);
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
