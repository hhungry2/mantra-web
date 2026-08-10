// Shared numbers. The originals come from the 1995 Mantra sources: a screen is
// 16x10 tiles of 32px with a 24px status bar under it, and the game loop slept
// 40ms between frames.

export const TILE = 32;
export const SCREEN_COLS = 16;
export const SCREEN_ROWS = 10;
export const VIEW_W = SCREEN_COLS * TILE;   // 512
export const VIEW_H = SCREEN_ROWS * TILE;   // 320
export const HUD_H = 24;
export const CANVAS_W = VIEW_W;
export const CANVAS_H = VIEW_H + HUD_H;

export const FRAME_MS = 40;                 // 25 fps fixed timestep
export const MAX_CATCHUP_FRAMES = 5;

export const WORLD_COLS = 16;
export const WORLD_ROWS = 16;
export const TOTAL_SCREENS = WORLD_COLS * WORLD_ROWS; // 256

// Screen 61 (world grid 13,3) sits in the largest region you can cross on foot:
// 47 built screens across the north-east overworld. Screen 17, the phase 1
// slice, turned out to be a walled compound of four screens whose only ways out
// are cave mouths, and those need the warp targets decoded first.
export const START_SCREEN = 61;
export const START_TILE = { x: 13, y: 5 };

// Sprite ids inside sprites.png. Saric is four poses x [left, right, down, up].
export const SARIC_WALK_A = 1000;
export const SARIC_WALK_B = 1004;
export const SARIC_SWING_A = 1008;
export const SARIC_SWING_B = 1012;
export const SWORD_SPRITE = 1500;

export const DIR_LEFT = 0;
export const DIR_RIGHT = 1;
export const DIR_DOWN = 2;
export const DIR_UP = 3;

