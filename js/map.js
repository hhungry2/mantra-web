// Screen data and terrain queries.
//
// Collision is per pixel: every map tile ships a mask (MapGraphics 3000+) that
// marks which of its pixels block movement, which is how the original could put
// a walkable strip of grass under the canopy of a tree tile.

import { TILE, SCREEN_COLS, VIEW_W, VIEW_H } from './config.js';

const SAMPLE_STEP = 4;

export class World {
  constructor(assets) {
    this.screens = assets.map.screens;
    this.mask = assets.mask;
    this.tileIndex = assets.tileIndex;
    this.maskCols = assets.gfx.tiles.cols;
  }

  screen(index) {
    return this.screens[index];
  }

  tileAt(screen, tx, ty) {
    return screen.tiles[ty * SCREEN_COLS + tx];
  }

  modifierAt(screen, tx, ty) {
    return screen.mods[ty * SCREEN_COLS + tx];
  }

  // Is this exact pixel of the screen impassable? Off-screen counts as solid so
  // nothing can leave the view; phase 2 replaces that with screen transitions.
  isSolidPixel(screen, px, py) {
    if (px < 0 || py < 0 || px >= VIEW_W || py >= VIEW_H) return true;
    const tx = px >> 5;
    const ty = py >> 5;
    const atlas = this.tileIndex.get(this.tileAt(screen, tx, ty));
    if (atlas === undefined) return false;
    const ax = (atlas % this.maskCols) * TILE + (px & 31);
    const ay = Math.floor(atlas / this.maskCols) * TILE + (py & 31);
    return this.mask.solid[ay * this.mask.width + ax] === 1;
  }

  // Sample a grid over the box rather than only its corners, or a thin wall
  // would slip between the corners of a 16px-wide body.
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
}
