// Screen data, terrain queries, and screen transitions.
//
// Collision is per pixel: every map tile ships a mask (MapGraphics 3000+) that
// marks which of its pixels block movement. Phase 2 enables grid-wide screen
// transitions (16x16 world) and door/warp tile handling.

import { TILE, SCREEN_COLS, VIEW_W, VIEW_H, WORLD_COLS, WORLD_ROWS } from './config.js';

const SAMPLE_STEP = 4;

export class World {
  constructor(assets) {
    this.screens = assets.map.screens;
    this.mask = assets.mask;
    this.tileIndex = assets.tileIndex;
    this.maskCols = assets.gfx.tiles.cols;
  }

  screen(index) {
    return this.screens[index] || this.screens[0];
  }

  tileAt(screen, tx, ty) {
    if (!screen || !screen.tiles) return 1000;
    const idx = ty * SCREEN_COLS + tx;
    return screen.tiles[idx] !== undefined ? screen.tiles[idx] : 1000;
  }

  modifierAt(screen, tx, ty) {
    if (!screen || !screen.mods) return 0;
    const idx = ty * SCREEN_COLS + tx;
    return screen.mods[idx] || 0;
  }

  // Check if pixel is solid. World outer boundaries are solid.
  isSolidPixel(screen, px, py) {
    const screenIdx = screen ? screen.screenId : 0;
    const gridX = screenIdx % WORLD_COLS;
    const gridY = Math.floor(screenIdx / WORLD_COLS);

    // World outer edges are solid
    if (px < 0 && gridX === 0) return true;
    if (px >= VIEW_W && gridX === WORLD_COLS - 1) return true;
    if (py < 0 && gridY === 0) return true;
    if (py >= VIEW_H && gridY === WORLD_ROWS - 1) return true;

    // Interior screen boundaries allow passage for screen transition
    if (px < 0 || py < 0 || px >= VIEW_W || py >= VIEW_H) return false;

    const tx = px >> 5;
    const ty = py >> 5;
    const atlas = this.tileIndex.get(this.tileAt(screen, tx, ty));
    if (atlas === undefined) return false;
    const ax = (atlas % this.maskCols) * TILE + (px & 31);
    const ay = Math.floor(atlas / this.maskCols) * TILE + (py & 31);
    return this.mask.solid[ay * this.mask.width + ax] === 1;
  }

  boxHitsWall(screen, b) {
    const right = b.x + b.w - 1;
    const bottom = b.y + b.h - 1;
    for (let y = b.y; ; y += SAMPLE_STEP) {
      const py = Math.min(y, bottom);
      for (let x = b.x; ; x += SAMPLE_STEP) {
        const px = Math.min(x, right);
        if (this.isSolidPixel(screen, Math.round(px), Math.round(py))) return true;
        if (px >= right) break;
      }
      if (py >= bottom) break;
    }
    return false;
  }

  getNeighbor(screenIndex, dir) {
    const gridX = screenIndex % WORLD_COLS;
    const gridY = Math.floor(screenIndex / WORLD_COLS);

    if (dir === 'left' && gridX > 0) return screenIndex - 1;
    if (dir === 'right' && gridX < WORLD_COLS - 1) return screenIndex + 1;
    if (dir === 'up' && gridY > 0) return screenIndex - WORLD_COLS;
    if (dir === 'down' && gridY < WORLD_ROWS - 1) return screenIndex + WORLD_COLS;
    return null;
  }

  checkWarp(screen, px, py) {
    if (px < 0 || py < 0 || px >= VIEW_W || py >= VIEW_H) return null;
    const tx = px >> 5;
    const ty = py >> 5;
    const mod = this.modifierAt(screen, tx, ty);
    if (mod & 0x100) {
      // Warp tile modifier (e.g. door/portal)
      const idx = ty * SCREEN_COLS + tx;
      const extra = screen.extra ? screen.extra[idx] : 0;
      if (extra && extra !== 0) {
        let targetScreen = Math.abs(extra) % 256;
        return { targetScreen, targetTileX: 8, targetTileY: 5 };
      }
    }
    return null;
  }
}
