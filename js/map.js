// Screen data, terrain queries, and screen transitions.
//
// Terrain collision is per pixel: every map tile ships a mask (MapGraphics
// 3000+, extracted to assets/tile_masks.png) marking which of its pixels block
// movement. That is what lets the original put a walkable strip of grass under
// the canopy of a tree tile. The tile modifier says nothing about terrain; it
// carries the non-terrain meanings (doors, warps, shops) instead.

import { TILE, SCREEN_COLS, VIEW_W, VIEW_H, WORLD_COLS, WORLD_ROWS } from './config.js';

const SAMPLE_STEP = 4;

// Bridges and doorways are drawn over water or through a wall, so their art is
// masked solid and the modifier is what makes them passable. Both halves have
// to match: the same modifiers also sit on the blank filler tile (1059) that
// fills the unused screens, and walking out into those is not intended.
const WALK_OVER_MODIFIERS = new Set([260, 772, 775, 1284, 4868, 5080]);
const WALK_OVER_TILES = new Set([1020, 1021, 1052, 1023, 1030, 1031, 1032, 1033, 1036]);

export class World {
  constructor(assets) {
    this.screens = assets.map.screens;
    // map.json stores screens positionally, so hand each one its index.
    this.screens.forEach((screen, index) => { screen.index = index; });
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

  // Is this exact pixel impassable? Off the screen counts as solid only at the
  // rim of the world; everywhere else it is the hand-off to the next screen.
  isSolidPixel(screen, px, py) {
    if (px < 0 || py < 0 || px >= VIEW_W || py >= VIEW_H) {
      const index = screen && screen.index !== undefined ? screen.index : 0;
      const gridX = index % WORLD_COLS;
      const gridY = Math.floor(index / WORLD_COLS);
      if (px < 0 && gridX === 0) return true;
      if (px >= VIEW_W && gridX === WORLD_COLS - 1) return true;
      if (py < 0 && gridY === 0) return true;
      if (py >= VIEW_H && gridY === WORLD_ROWS - 1) return true;
      return false;
    }

    const tx = px >> 5;
    const ty = py >> 5;
    const tile = this.tileAt(screen, tx, ty);
    if (WALK_OVER_TILES.has(tile)
        && WALK_OVER_MODIFIERS.has(this.modifierAt(screen, tx, ty))) return false;

    const atlas = this.tileIndex.get(tile);
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
    // Door / Portal warp modifiers (e.g. 772, 1284, 4868, 4950)
    if ((mod & 0x100) && mod !== 260 && mod !== 264 && mod !== 342) {
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
