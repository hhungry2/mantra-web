"""
Render the extracted map back into PNGs so the format can be checked by eye
before any engine code trusts it (see docs/PLAN.md, phase 0 verification).

  assets/map_preview.png  the whole 16x16 world, scaled to 1/4
  world_screens.png       a handful of screens at full size, with the
                          collision mask and enemy placements drawn on top
"""

import os
import sys
import json
from PIL import Image, ImageDraw

ASSETS_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
DATA_DIR = os.path.join(ASSETS_DIR, 'data')

SCREEN_W, SCREEN_H = 16, 10
TILE = 32


def load():
    with open(os.path.join(DATA_DIR, 'map.json'), encoding='utf-8') as f:
        world = json.load(f)
    with open(os.path.join(DATA_DIR, 'gfx.json'), encoding='utf-8') as f:
        gfx = json.load(f)
    tiles = Image.open(os.path.join(ASSETS_DIR, 'tiles.png')).convert('RGBA')
    masks = Image.open(os.path.join(ASSETS_DIR, 'tile_masks.png')).convert('RGBA')
    sprites = Image.open(os.path.join(ASSETS_DIR, 'sprites.png')).convert('RGBA')
    return world, gfx, tiles, masks, sprites


def atlas_box(index, cols, size):
    x, y = (index % cols) * size, (index // cols) * size
    return (x, y, x + size, y + size)


def draw_screen(dest, at, screen, index_of, tiles, cols):
    for i, tid in enumerate(screen['tiles']):
        idx = index_of.get(tid)
        if idx is None:
            continue
        crop = tiles.crop(atlas_box(idx, cols, TILE))
        dest.paste(crop, (at[0] + (i % SCREEN_W) * TILE, at[1] + (i // SCREEN_W) * TILE), crop)


def main():
    world, gfx, tiles, masks, sprites = load()
    tile_cols = gfx['tiles']['cols']
    index_of = {tid: i for i, tid in enumerate(gfx['tiles']['ids'])}
    sprite_index = {sid: i for i, sid in enumerate(gfx['sprites']['ids'])}
    templates = json.load(open(os.path.join(DATA_DIR, 'enemies.json'), encoding='utf-8'))
    template_sprite = {t['id']: t['sprite'] for t in templates['templates']}

    # Whole world.
    full = Image.new('RGBA', (16 * SCREEN_W * TILE, 16 * SCREEN_H * TILE), (0, 0, 0, 255))
    for s, screen in enumerate(world['screens']):
        at = ((s % 16) * SCREEN_W * TILE, (s // 16) * SCREEN_H * TILE)
        draw_screen(full, at, screen, index_of, tiles, tile_cols)
    preview = full.resize((full.width // 4, full.height // 4), Image.LANCZOS)
    preview.save(os.path.join(ASSETS_DIR, 'map_preview.png'))
    print(f'map_preview.png {preview.width}x{preview.height}')

    # A few screens at 1:1 with collision and enemies overlaid.
    picks = [0, 17, 34, 51, 119, 136, 153, 170]
    sheet = Image.new('RGBA', (2 * SCREEN_W * TILE, 4 * SCREEN_H * TILE), (0, 0, 0, 255))
    draw = ImageDraw.Draw(sheet)
    for n, s in enumerate(picks):
        screen = world['screens'][s]
        at = ((n % 2) * SCREEN_W * TILE, (n // 2) * SCREEN_H * TILE)
        draw_screen(sheet, at, screen, index_of, tiles, tile_cols)
        for i, tid in enumerate(screen['tiles']):
            idx = index_of.get(tid)
            if idx is None:
                continue
            mask = masks.crop(atlas_box(idx, tile_cols, TILE))
            tint = Image.new('RGBA', (TILE, TILE), (255, 0, 0, 60))
            sheet.paste(tint, (at[0] + (i % SCREEN_W) * TILE,
                               at[1] + (i // SCREEN_W) * TILE), mask)
        for e in screen['enemies']:
            sid = template_sprite.get(e['t'])
            si = sprite_index.get(sid)
            if si is None:
                continue
            crop = sprites.crop(atlas_box(si, gfx['sprites']['cols'], TILE))
            sheet.paste(crop, (at[0] + e['c'] * TILE, at[1] + e['r'] * TILE), crop)
        draw.text((at[0] + 4, at[1] + 4), f'screen {s}', fill=(255, 255, 0))
    out = os.path.join(os.path.dirname(__file__), 'world_screens.png')
    sheet.save(out)
    print(f'world_screens.png {sheet.width}x{sheet.height}')


if __name__ == '__main__':
    main()
