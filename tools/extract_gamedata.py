"""
Extract GameData.dat into the PNG atlases and JSON files the web port loads.

Formats worked out from the raw bytes (see docs/PLAN.md for the sizing proof):

  MapGraphics   id-tagged chunks, each a PackBits-compressed 32x32 8bpp tile.
                ids 1000..1115 are the tile images, 3000..3115 the matching
                per-pixel collision masks (non-zero byte = impassable pixel).
  GameSprites   same chunk format; 1000..1015 is Saric (4 poses x
                left/right/down/up), 1500..1503 his sword, 2000+ the enemies.
  IconData      chunks of raw 8bpp pixels, 256 bytes (16x16) or 1024 (32x32).
  BossData      51 raw 64x64 frames back to back.
  MapData       256 screens x (160 tiles x 8 bytes + 16 enemies x 64 bytes).
                A tile is four big-endian int16: modifier, extra, tileId, 0,
                and the 160 tiles are stored column-major (index = x * 10 + y).
                An enemy slot is a dumped runtime struct; the fields that
                survive as data are template index (u16 @0), row (u16 @44)
                and column (u16 @46). A slot is empty when the index is 0.
  TmplData      65 enemy templates of 70 bytes; sprite id at @0, hit points
                at @24, sprite id repeated at @44.

Run once; the PNG/JSON output is committed so the browser never sees a .dat.
"""

import os
import sys
import json
import struct
from PIL import Image

sys.path.append(os.path.dirname(__file__))
from unpack_dat import load_dat_file, unpackbits, parse_chunks

INPUT_DAT = r'C:\Users\USER\Downloads\Mantra-Windows\Mantra-Windows\GameData.dat'
ASSETS_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
DATA_DIR = os.path.join(ASSETS_DIR, 'data')

SCREENS = 256
TILES_PER_SCREEN = 160
ENEMY_SLOTS = 16
SCREEN_BYTES = TILES_PER_SCREEN * 8 + ENEMY_SLOTS * 64
TEMPLATE_BYTES = 70


def blob(objects, name):
    return [o for o in objects if o['name'] == name][0]['data']


def write_json(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def build_atlas(frames, size, cols, palette, transparent_index=None):
    """Lay out 8bpp frames into an RGBA atlas, row-major."""
    rows = (len(frames) + cols - 1) // cols
    img = Image.new('RGBA', (cols * size, rows * size))
    px = img.load()
    for idx, pixels in enumerate(frames):
        ox = (idx % cols) * size
        oy = (idx // cols) * size
        for y in range(size):
            row = y * size
            for x in range(size):
                v = pixels[row + x]
                if v == transparent_index:
                    px[ox + x, oy + y] = (0, 0, 0, 0)
                else:
                    px[ox + x, oy + y] = (palette[v * 3], palette[v * 3 + 1],
                                          palette[v * 3 + 2], 255)
    return img


def build_mask_atlas(masks, size, cols):
    """White where the pixel blocks movement, transparent elsewhere."""
    rows = (len(masks) + cols - 1) // cols
    img = Image.new('RGBA', (cols * size, rows * size))
    px = img.load()
    for idx, pixels in enumerate(masks):
        ox = (idx % cols) * size
        oy = (idx // cols) * size
        for y in range(size):
            row = y * size
            for x in range(size):
                solid = pixels[row + x] != 0
                px[ox + x, oy + y] = (255, 255, 255, 255) if solid else (0, 0, 0, 0)
    return img


def extract_tiles(gamedata, palette, gfx):
    chunks = parse_chunks(blob(gamedata, 'MapGraphics'))
    tile_ids = sorted(i for i in chunks if i < 2000)
    images, masks = [], []
    for tid in tile_ids:
        images.append(unpackbits(chunks[tid]))
        mask = chunks.get(2000 + tid)
        masks.append(unpackbits(mask) if mask else bytes(1024))

    cols = 16
    build_atlas(images, 32, cols, palette).save(os.path.join(ASSETS_DIR, 'tiles.png'))
    build_mask_atlas(masks, 32, cols).save(os.path.join(ASSETS_DIR, 'tile_masks.png'))
    gfx['tiles'] = {'cols': cols, 'size': 32, 'ids': tile_ids}
    print(f'tiles.png / tile_masks.png: {len(tile_ids)} tiles')


def extract_sprites(gamedata, palette, gfx):
    chunks = parse_chunks(blob(gamedata, 'GameSprites'))
    sprite_ids = sorted(chunks)
    frames = [unpackbits(chunks[sid]) for sid in sprite_ids]
    cols = 16
    # Palette index 0 is white and unused inside sprites, so it is the key colour.
    build_atlas(frames, 32, cols, palette, transparent_index=0).save(
        os.path.join(ASSETS_DIR, 'sprites.png'))
    gfx['sprites'] = {'cols': cols, 'size': 32, 'ids': sprite_ids}
    print(f'sprites.png: {len(sprite_ids)} sprites')


def extract_bosses(gamedata, palette, gfx):
    data = blob(gamedata, 'BossData')
    frames = [data[i * 4096:(i + 1) * 4096] for i in range(len(data) // 4096)]
    cols = 8
    build_atlas(frames, 64, cols, palette, transparent_index=0).save(
        os.path.join(ASSETS_DIR, 'bosses.png'))
    gfx['bosses'] = {'cols': cols, 'size': 64, 'count': len(frames)}
    print(f'bosses.png: {len(frames)} frames')


def extract_icons(gamedata, palette, gfx):
    chunks = parse_chunks(blob(gamedata, 'IconData'))
    for size, name in ((16, 'icons16.png'), (32, 'icons32.png')):
        ids = sorted(i for i in chunks if len(chunks[i]) == size * size)
        frames = [chunks[i] for i in ids]
        cols = 16
        build_atlas(frames, size, cols, palette, transparent_index=0).save(
            os.path.join(ASSETS_DIR, name))
        gfx[f'icons{size}'] = {'cols': cols, 'size': size, 'ids': ids}
        print(f'{name}: {len(ids)} icons')


def extract_map(gamedata):
    map_bytes = blob(gamedata, 'MapData')
    area_bytes = blob(gamedata, 'MapArea')
    areas = struct.unpack('>256h', area_bytes)

    screens = []
    for s in range(SCREENS):
        sb = map_bytes[s * SCREEN_BYTES:(s + 1) * SCREEN_BYTES]
        fields = struct.unpack('>%dh' % (TILES_PER_SCREEN * 4), sb[:TILES_PER_SCREEN * 8])
        # Tiles are stored column-major (index = x * 10 + y); re-order to the
        # row-major layout the renderer walks.
        order = [x * 10 + y for y in range(10) for x in range(16)]
        mods = [fields[i * 4 + 0] for i in order]
        extra = [fields[i * 4 + 1] for i in order]
        tiles = [fields[i * 4 + 2] for i in order]

        enemies = []
        for e in range(ENEMY_SLOTS):
            rec = sb[TILES_PER_SCREEN * 8 + e * 64:TILES_PER_SCREEN * 8 + (e + 1) * 64]
            template, row, col = struct.unpack('>H', rec[0:2])[0], rec[45], rec[47]
            if template == 0 or template >= 65:
                continue
            enemies.append({'t': template, 'c': col, 'r': row})

        screens.append({
            'area': areas[s],
            'tiles': tiles,
            'mods': mods,
            'extra': extra,
            'enemies': enemies,
        })

    write_json(os.path.join(DATA_DIR, 'map.json'), {
        'width': 16, 'height': 16, 'tilesX': 16, 'tilesY': 10, 'screens': screens})
    print(f'map.json: {SCREENS} screens, '
          f'{sum(len(s["enemies"]) for s in screens)} enemy placements')


def extract_templates(gamedata):
    data = blob(gamedata, 'TmplData')
    templates = []
    for i in range(len(data) // TEMPLATE_BYTES):
        rec = data[i * TEMPLATE_BYTES:(i + 1) * TEMPLATE_BYTES]
        sprite, hp = struct.unpack('>H', rec[0:2])[0], struct.unpack('>H', rec[24:26])[0]
        templates.append({
            'id': i,
            'sprite': sprite,
            'hp': hp,
            # Not yet decoded; kept verbatim so phase 2 can work out the AI ids.
            'raw': rec.hex(),
        })
    write_json(os.path.join(DATA_DIR, 'enemies.json'), {'templates': templates})
    print(f'enemies.json: {len(templates)} templates')


def extract_text(gamedata):
    data = blob(gamedata, 'TextData')
    decoded = bytes((b & 0x7f) + 2 if (b & 0x7f) else 0 for b in data)
    messages = [m.decode('latin1', 'ignore') for m in decoded.split(b'\x00') if m]
    write_json(os.path.join(DATA_DIR, 'text.json'), messages)
    print(f'text.json: {len(messages)} messages')


def extract_raw(gamedata, name, filename, key):
    data = blob(gamedata, name)
    write_json(os.path.join(DATA_DIR, filename), {key: data.hex()})
    print(f'{filename}: {len(data)} bytes (undecoded)')


def main():
    os.makedirs(ASSETS_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)

    gamedata = load_dat_file(INPUT_DAT)
    palette = blob(gamedata, 'SystemPalette')

    gfx = {}
    extract_tiles(gamedata, palette, gfx)
    extract_sprites(gamedata, palette, gfx)
    extract_bosses(gamedata, palette, gfx)
    extract_icons(gamedata, palette, gfx)
    write_json(os.path.join(DATA_DIR, 'gfx.json'), gfx)

    extract_map(gamedata)
    extract_templates(gamedata)
    extract_text(gamedata)
    extract_raw(gamedata, 'ItemData', 'items.json', 'raw')
    extract_raw(gamedata, 'StoreData', 'stores.json', 'raw')

    print('done')


if __name__ == '__main__':
    main()
