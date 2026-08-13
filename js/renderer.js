// All canvas drawing: terrain, then entities back-to-front, bosses, then status bar.

import {
  TILE, SCREEN_COLS, SCREEN_ROWS, VIEW_W, VIEW_H, HUD_H,
  DIR_LEFT, DIR_RIGHT, DIR_DOWN, DIR_UP,
} from './config.js';

const SPRITE = 32;
const SPRITE_OFFSET_Y = -22;

// The sword hangs a whole tile out along the facing, off the same top-left
// the body is drawn from. This is drawSword() in the original's Saric.c,
// where SWORD_OFFSET is 16 and the four cases are left -16, right +16,
// down +16 and up -16 - the same 16 the sword's hit rect uses.
const SWORD_REACH = 16;
const SWORD_OFFSET = {
  [DIR_LEFT]: { x: -SWORD_REACH, y: 0 },
  [DIR_RIGHT]: { x: SWORD_REACH, y: 0 },
  [DIR_DOWN]: { x: 0, y: SWORD_REACH },
  [DIR_UP]: { x: 0, y: -SWORD_REACH },
};

export class Renderer {
  constructor(canvas, assets) {
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.tiles = assets.tiles;
    this.win = assets.win;
    this.lose = assets.lose;
    this.sprites = assets.sprites;
    this.bosses = assets.bosses;
    this.icons = assets.icons;
    this.tileIndex = assets.tileIndex;
    this.spriteIndex = assets.spriteIndex;
    this.iconIndex = assets.iconIndex;
    this.tileCols = assets.gfx.tiles.cols;
    this.spriteCols = assets.gfx.sprites.cols;
    this.iconCols = assets.gfx.icons32.cols;
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

  drawBossSprite(frameIndex, x, y) {
    if (!this.bosses) return;
    const col = frameIndex % 8;
    const row = Math.floor(frameIndex / 8);
    this.ctx.drawImage(
      this.bosses,
      col * 64, row * 64, 64, 64,
      Math.round(x - 32), Math.round(y - 32), 64, 64,
    );
  }

  drawScreen(screen) {
    for (let ty = 0; ty < SCREEN_ROWS; ty++) {
      for (let tx = 0; tx < SCREEN_COLS; tx++) {
        this.drawTile(screen.tiles[ty * SCREEN_COLS + tx], tx * TILE, ty * TILE);
      }
    }
  }

  // Dying bodies lie on the ground beneath everything else, and a drop sits
  // on the body so it can be seen and walked over.
  drawCorpses(corpses) {
    for (const c of corpses) {
      if (c.dead) continue;
      this.drawSprite(c.frame, c.x - SPRITE / 2, c.y + SPRITE_OFFSET_Y);
      if (!c.drop) continue;
      const icon = this.iconIndex.get(c.drop.icon);
      if (icon === undefined) continue;
      const size = 32;
      const col = icon % this.iconCols;
      const row = Math.floor(icon / this.iconCols);
      this.ctx.drawImage(
        this.icons,
        col * size, row * size, size, size,
        Math.round(c.x - size / 2), Math.round(c.y - size / 2), size, size,
      );
    }
  }

  drawEntities(player, enemies) {
    const drawables = [];
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.flash > 0 && e.flash % 2 === 1) continue;

      if (e.boss) {
        drawables.push({ y: e.y, draw: () => this.drawBossSprite(e.currentFrame, e.x, e.y) });
      } else {
        drawables.push({ y: e.y, draw: () => this.drawSprite(e.frame, e.x - SPRITE / 2, e.y + SPRITE_OFFSET_Y) });
      }
    }

    if (!player.dead && !(player.invuln > 0 && player.invuln % 4 < 2)) {
      const frames = player.frames();
      drawables.push({
        y: player.y,
        draw: () => {
          // drawSaric() lays the sword down before the body, so the hand that
          // holds it stays in front of the blade.
          const x = player.x - SPRITE / 2;
          const y = player.y + SPRITE_OFFSET_Y;
          if (frames.sword !== null) {
            const offset = SWORD_OFFSET[player.dir];
            this.drawSprite(frames.sword, x + offset.x, y + offset.y);
          }
          this.drawSprite(frames.body, x, y);
        },
      });
    }

    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
  }

  drawProjectiles(projectiles) {
    for (const p of projectiles) {
      if (p.dead) continue;
      if (p.sprite) {
        this.drawSprite(p.sprite, p.x - SPRITE / 2, p.y - SPRITE / 2);
      } else {
        this.ctx.fillStyle = '#ffb703';
        this.ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6);
      }
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
    ctx.fillText('ST', 125, top + 12);
    ctx.fillText('XP', 242, top + 12);

    meter(ctx, 28, top + 7, 85, 10, player.hp / player.hpMax, '#e63946');
    meter(ctx, 145, top + 7, 85, 10, player.stamina / 100, '#48cae4');
    meter(ctx, 262, top + 7, 50, 10, player.xp / player.nextXp, '#a855f7');

    meterValue(ctx, 28, top + 7, 85, 10, Math.ceil(player.hp));
    meterValue(ctx, 145, top + 7, 85, 10, Math.ceil(player.stamina));

    ctx.font = '10px monospace';
    ctx.fillStyle = '#c5c6c7';
    ctx.fillText(`LV${player.level}`, 320, top + 12);
    ctx.fillStyle = '#ffb703';
    ctx.fillText(`$${player.gold}`, 355, top + 12);
    ctx.fillStyle = '#8892b0';
    ctx.fillText(info, 410, top + 12);
  }

  // The original's win and lose cards, centred over the darkened field.
  drawEndCard(image, subtitle) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(11, 12, 16, 0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const x = Math.round((VIEW_W - image.width) / 2);
    const y = Math.round((VIEW_H - image.height) / 2) - 12;
    ctx.drawImage(image, x, y);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c5c6c7';
    ctx.font = '12px monospace';
    ctx.fillText(subtitle, VIEW_W / 2, y + image.height + 18);
    ctx.textAlign = 'left';
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

// The current number, centred on top of its meter.
function meterValue(ctx, x, y, w, h, value) {
  ctx.textAlign = 'center';
  ctx.font = '9px monospace';
  ctx.fillStyle = '#000';
  ctx.fillText(String(value), x + w / 2 + 1, y + h / 2 + 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(value), x + w / 2, y + h / 2);
  ctx.textAlign = 'left';
}
