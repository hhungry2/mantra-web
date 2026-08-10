// Boot and game loop.
//
// Phase 2: World Connection
// Enables grid-wide screen transitions (16x16 world), door warps,
// persistent defeated enemy tracking via bitmasks, expanded enemy AI,
// and enemy ranged projectiles.

import {
  TILE, FRAME_MS, MAX_CATCHUP_FRAMES, START_SCREEN, START_TILE, VIEW_W, VIEW_H,
} from './config.js';
import { loadAssets } from './assets.js';
import { World } from './map.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Saric } from './saric.js';
import { spawnScreen, makeMover, EnemyProjectile } from './enemy.js';
import { overlaps } from './collision.js';
import { Audio } from './audio.js';

const SWORD_DAMAGE = 4;

class Game {
  constructor(assets, canvas) {
    this.world = new World(assets);
    this.renderer = new Renderer(canvas, assets);
    this.templates = assets.templates;
    this.input = new Input();
    this.audio = new Audio();

    // Track defeated enemies bitmask for all 256 screens
    this.defeatedMasks = new Uint16Array(256);

    this.screenIndex = START_SCREEN;
    this.projectiles = [];
    this.enter(START_SCREEN);

    this.player = new Saric(
      START_TILE.x * TILE + TILE / 2,
      START_TILE.y * TILE + TILE / 2,
    );
    this.frame = 0;
    this.hudNote = '';

    this.input.on('KeyM', () => {
      this.hudNote = this.audio.toggle() ? 'SOUND ON' : 'SOUND OFF';
      this.noteUntil = this.frame + 40;
    });
  }

  enter(index, spawnX = null, spawnY = null) {
    this.screenIndex = index;
    this.screen = this.world.screen(index);
    this.enemies = spawnScreen(this.screen, this.templates, this.defeatedMasks[index]);
    this.projectiles = [];
    this.move = makeMover(this.world, this.screen);

    if (spawnX !== null && this.player) this.player.x = spawnX;
    if (spawnY !== null && this.player) this.player.y = spawnY;
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
    } else if (player.x >= VIEW_W) {
      const nextIdx = this.world.getNeighbor(currIdx, 'right');
      if (nextIdx !== null) this.enter(nextIdx, 12, player.y);
    } else if (player.y < 0) {
      const nextIdx = this.world.getNeighbor(currIdx, 'up');
      if (nextIdx !== null) this.enter(nextIdx, player.x, VIEW_H - 12);
    } else if (player.y >= VIEW_H) {
      const nextIdx = this.world.getNeighbor(currIdx, 'down');
      if (nextIdx !== null) this.enter(nextIdx, player.x, 12);
    }
  }

  tick() {
    this.frame++;
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

    // Update Enemies
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.update(ctx);

      if (sword && enemy.flash === 0 && overlaps(sword, enemy.body)) {
        const killed = enemy.hurt(SWORD_DAMAGE, player.x, player.y);
        this.audio.play(killed ? 'kill' : 'hit');
        if (killed) {
          // Record defeated enemy in screen's bitmask
          this.defeatedMasks[this.screenIndex] |= (1 << enemy.slotIndex);
          player.gold += 5;
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
      r.drawBanner(['YOU DIED', 'reload to try again']);
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

  const game = new Game(assets, canvas);
  window.mantra = game; // handle for debugging from console
  game.draw();
  message.textContent = 'Phase 2: Explore the 256-screen world grid, fight unique AI, & clear screens.';
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
