// Boot and game loop.
//
// Phase 1 vertical slice: one screen of the real world, Saric walking it with
// the real collision masks, and the screen's own enemies to fight.

import {
  TILE, FRAME_MS, MAX_CATCHUP_FRAMES, START_SCREEN, START_TILE,
} from './config.js';
import { loadAssets } from './assets.js';
import { World } from './map.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Saric } from './saric.js';
import { spawnScreen, makeMover } from './enemy.js';
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
    this.screenIndex = START_SCREEN;
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

  enter(index) {
    this.screenIndex = index;
    this.screen = this.world.screen(index);
    this.enemies = spawnScreen(this.screen, this.templates);
    this.move = makeMover(this.world, this.screen);
  }

  tick() {
    this.frame++;
    const player = this.player;
    player.update(this.input, this.world, this.screen);
    if (player.swungThisFrame) this.audio.play('sword');

    const ctx = { world: this.world, screen: this.screen, player, move: this.move };
    const sword = player.swordBox;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.update(ctx);

      if (sword && enemy.flash === 0 && overlaps(sword, enemy.body)) {
        const killed = enemy.hurt(SWORD_DAMAGE, player.x, player.y);
        this.audio.play(killed ? 'kill' : 'hit');
      }

      if (!enemy.dead && overlaps(player.body, enemy.body)) {
        if (player.hurt(enemy.damage, enemy.x, enemy.y)) {
          this.audio.play(player.dead ? 'die' : 'hurt');
        }
      }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  draw() {
    const r = this.renderer;
    r.clear();
    r.drawScreen(this.screen);
    r.drawEntities(this.player, this.enemies);

    let note = `SCREEN ${this.screenIndex}`;
    if (this.noteUntil > this.frame) note = this.hudNote;
    r.drawHud(this.player, note);

    if (this.player.dead) {
      r.drawBanner(['YOU DIED', 'reload to try again']);
    } else if (this.enemies.length === 0) {
      r.drawBanner(['SCREEN CLEAR', 'phase 2 opens the rest of the world']);
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
  window.mantra = game;   // handle for debugging from the console
  game.draw();
  message.textContent = 'Phase 1 vertical slice: one screen, real map data, real enemies.';
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
    // Cap catch-up so a backgrounded tab does not fast-forward the game.
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
