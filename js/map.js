// Screen data, terrain queries, and screen transitions.
//
// A tile's `modifiers` byte is what governs movement, exactly as it did in the
// original: a tile blocks unless it is marked standable. Doors carry their
// destination packed into the tile's `special` field.

import { TILE, SCREEN_COLS, VIEW_W, VIEW_H, WORLD_COLS, WORLD_ROWS } from './config.js';

const SAMPLE_STEP = 4;

export const MOD = {
  STANDABLE: 1,
  IS_DOOR: 2,
  DOES_DAMAGE: 4,
  LEADS_TO_CASTLE: 8,
  LEADS_TO_UNDERWORLD: 16,
};

// The underworld is the bottom half of the 16x16 grid, eight rows down.
const UNDERWORLD_OFFSET = 8 * WORLD_COLS;

export class World {
  constructor(assets) {
    this.screens = assets.map.screens;
    // map.json stores screens positionally, so hand each one its index.
    this.screens.forEach((screen, index) => { screen.index = index; });
    this.tileIndex = assets.tileIndex;
  }

  screen(index) {
    return this.screens[index] || this.screens[0];
  }

  tileAt(screen, tx, ty) {
    const tile = screen && screen.tiles ? screen.tiles[ty * SCREEN_COLS + tx] : undefined;
    return tile === undefined ? 1000 : tile;
  }

  modifierAt(screen, tx, ty) {
    const mod = screen && screen.mods ? screen.mods[ty * SCREEN_COLS + tx] : undefined;
    return mod === undefined ? 0 : mod;
  }

  specialAt(screen, tx, ty) {
    const special = screen && screen.special ? screen.special[ty * SCREEN_COLS + tx] : undefined;
    return special === undefined ? 0 : special;
  }

  // MapArea stores the original music number in the high byte of `area`.
  // The C player numbers songs 1..9 while the web player indexes 0..8.
  musicIndexAt(screen) {
    const area = Number(screen && screen.area);
    if (!Number.isFinite(area)) return 0;
    return Math.max(0, Math.min(8, ((area & 0xffff) >>> 8) - 1));
  }

  // Off the screen counts as solid only at the rim of the world; everywhere
  // else it is the hand-off to the next screen.
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
    return !(this.modifierAt(screen, px >> 5, py >> 5) & MOD.STANDABLE);
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

  // Standing on a damage tile hurts, which is how the game fences off water.
  damageAt(screen, px, py) {
    if (px < 0 || py < 0 || px >= VIEW_W || py >= VIEW_H) return 0;
    const mod = this.modifierAt(screen, px >> 5, py >> 5);
    return (mod & MOD.DOES_DAMAGE) ? this.specialAt(screen, px >> 5, py >> 5) : 0;
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

  // A door either drops straight into the underworld directly below, or
  // teleports somewhere the tile's `special` field spells out:
  //   bits 0-3   destination tile y      bits 4-7   destination tile x
  //   bits 8-11  destination screen row  bits 12-15 destination screen column
  doorAt(screen, px, py) {
    if (px < 0 || py < 0 || px >= VIEW_W || py >= VIEW_H) return null;
    const tx = px >> 5;
    const ty = py >> 5;
    const mod = this.modifierAt(screen, tx, ty);
    if (!(mod & MOD.IS_DOOR)) return null;

    if (mod & MOD.LEADS_TO_UNDERWORLD) {
      // The original toggles between the overworld and the underworld; it
      // does not only descend. Bottom-half doors therefore subtract 128.
      const target = screen.index < UNDERWORLD_OFFSET
        ? screen.index + UNDERWORLD_OFFSET
        : screen.index - UNDERWORLD_OFFSET;
      if (target < 0 || target >= this.screens.length) return null;
      return { screen: target, tileX: tx, tileY: ty };
    }

    const special = this.specialAt(screen, tx, ty) & 0xffff;
    if (!special) return null;
    return {
      screen: (((special & 0x0f00) >> 8) * WORLD_COLS) + ((special & 0xf000) >> 12),
      tileX: (special & 0x00f0) >> 4,
      tileY: special & 0x000f,
    };
  }
}
