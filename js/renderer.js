// All canvas drawing: terrain, then entities back-to-front, then the status bar.

import {
  TILE, SCREEN_COLS, SCREEN_ROWS, VIEW_W, VIEW_H, HUD_H,
} from './config.js';

const SPRITE = 32;
const SPRITE_OFFSET_Y = -22;   // sprite top relative to the body centre

export class Renderer {
  constructor(canvas, assets) {
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.tiles = assets.tiles;
    this.sprites = assets.sprites;
    this.tileIndex = assets.tileIndex;
    this.spriteIndex = assets.spriteIndex;
    this.tileCols = assets.gfx.tiles.cols;
    this.spriteCols = assets.gfx.sprites.cols;
  }

  drawTile(id, x, y) {
    const atlas = this.tileIndex.get(id);
    if (atlas === undefined) return;
    this.ctx.drawImage(
      this.tiles,
      (atlas % this.tileCols) * TILE, Math.floor(atlas / this.tileCols) * TILE, TILE, TILE,
      x, y, TILE, TILE,
    );
  }

  drawSprite(id, x, y) {
    const atlas = this.spriteIndex.get(id);
    if (atlas === undefined) return;
    this.ctx.drawImage(
      this.sprites,
      (atlas % this.spriteCols) * SPRITE, Math.floor(atlas / this.spriteCols) * SPRITE, SPRITE, SPRITE,
      Math.round(x), Math.round(y), SPRITE, SPRITE,
    );
  }

  drawScreen(screen) {
    for (let ty = 0; ty < SCREEN_ROWS; ty++) {
      for (let tx = 0; tx < SCREEN_COLS; tx++) {
        this.drawTile(screen.tiles[ty * SCREEN_COLS + tx], tx * TILE, ty * TILE);
      }
    }
  }

  drawEntities(player, enemies) {
    const drawables = [];
    for (const e of enemies) {
      if (e.dead) continue;
      // A struck enemy blinks rather than tinting: the artwork is paletted and
      // a tint would need an offscreen pass every frame.
      if (e.flash > 0 && e.flash % 2 === 1) continue;
      drawables.push({ y: e.y, draw: () => this.drawSprite(e.sprite, e.x - SPRITE / 2, e.y + SPRITE_OFFSET_Y) });
    }

    if (!player.dead && !(player.invuln > 0 && player.invuln % 4 < 2)) {
      const frames = player.frames();
      drawables.push({
        y: player.y,
        draw: () => {
          this.drawSprite(frames.body, player.x - SPRITE / 2, player.y + SPRITE_OFFSET_Y);
          // The blade art is already placed inside its own 32x32 cell so that it
          // reaches out of Saric's hand, so it shares his origin exactly.
          if (frames.sword !== null) {
            this.drawSprite(frames.sword, player.x - SPRITE / 2, player.y + SPRITE_OFFSET_Y);
          }
        },
      });
    }

    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
  }

  drawProjectiles(projectiles) {
    if (!projectiles) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#ff4d4d';
    for (const p of projectiles) {
      if (p.dead) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffff66';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4d4d';
    }
  }

  drawHud(player, info) {
    const ctx = this.ctx;
    const top = VIEW_H;
    ctx.fillStyle = '#1f2833';
    ctx.fillRect(0, top, VIEW_W, HUD_H);
    ctx.fillStyle = '#45a29e';
    ctx.fillRect(0, top, VIEW_W, 1);

    ctx.font = '10px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c5c6c7';
    ctx.fillText('HP', 8, top + 12);
    ctx.fillText('ST', 130, top + 12);

    meter(ctx, 28, top + 7, 90, 10, player.hp / player.hpMax, '#e63946');
    meter(ctx, 150, top + 7, 90, 10, player.stamina / 100, '#48cae4');

    ctx.fillStyle = '#c5c6c7';
    ctx.fillText(`LV ${player.level}`, 252, top + 12);
    ctx.fillStyle = '#ffb703';
    ctx.fillText(`GOLD ${player.gold}`, 300, top + 12);
    ctx.fillStyle = '#8892b0';
    ctx.fillText(info, 396, top + 12);
  }

  drawBanner(lines) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(11, 12, 16, 0.78)';
    ctx.fillRect(0, VIEW_H / 2 - 40, VIEW_W, 80);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#66fcf1';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(lines[0], VIEW_W / 2, VIEW_H / 2 - 12);
    ctx.fillStyle = '#c5c6c7';
    ctx.font = '12px monospace';
    ctx.fillText(lines[1] || '', VIEW_W / 2, VIEW_H / 2 + 14);
    ctx.textAlign = 'left';
  }

  clear() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, VIEW_W, VIEW_H + HUD_H);
  }
}

function meter(ctx, x, y, w, h, value, colour) {
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * value)), h - 2);
  ctx.strokeStyle = '#45a29e';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
