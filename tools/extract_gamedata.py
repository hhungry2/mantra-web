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
  MapData       256 screens x (160 tiles x 8 bytes + 16 enemies x 64 bytes),
                the tiles stored column-major (index = x * 10 + y).
                A tile is MapItem: char modifiers, a padding byte the struct
                never initialised, then int16 special, spriteRef, expansion.
                modifiers is a bit set - 1 standable, 2 isDoor, 4 doesDamage,
                8 leadsToCastle, 16 leadsToUnderWorld - and for a door,
                special packs the destination: tile x in bits 4-7, tile y in
                bits 0-3, screen row in bits 8-11 and column in bits 12-15.
                An enemy slot is the 64 byte Enemy struct; see read_enemy().
  TmplData      65 enemy templates: the same 6 byte header as the icons,
                then an Enemy.
  ItemData      39 items of 542 bytes: icon id, a length-prefixed name and
                description in 256 byte fields, then a stat block. See
                extract_items().
  StoreData     5 shops, each a greeting in a 256 byte field followed by its
                stock as (item code, price) pairs. See extract_stores().

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


def read_enemy(rec):
    """
    The 64 byte Enemy struct, in the order LoadData.c's readEnemy() writes it.
    The first eight bytes are two Macintosh handles that meant something only
    while the game was running; everything from there is real.
    """
    return {
        'hp': struct.unpack('>h', rec[18:20])[0],
        'armor': struct.unpack('>b', rec[20:21])[0],
        'damage': struct.unpack('>b', rec[21:22])[0],
        'xp': struct.unpack('>H', rec[22:24])[0],
        'attributes': struct.unpack('>i', rec[24:28])[0],
        'speed': struct.unpack('>b', rec[32:33])[0],
        'range': rec[34],                                    # gaurdianRange
        'facing': struct.unpack('>b', rec[35:36])[0],
        'rate': rec[36],                                     # rateOfFire
        'sprite': struct.unpack('>h', rec[38:40])[0],
        'ai': struct.unpack('>h', rec[40:42])[0],            # movementType
        'drop': rec[42],                                     # deadItem
        'r': struct.unpack('>h', rec[44:46])[0],             # originalPosition.v
        'c': struct.unpack('>h', rec[46:48])[0],             # originalPosition.h
        'fires': struct.unpack('>h', rec[48:50])[0],         # firedEnemy
        'message': struct.unpack('>h', rec[58:60])[0],
    }


def extract_map(gamedata):
    map_bytes = blob(gamedata, 'MapData')
    area_bytes = blob(gamedata, 'MapArea')
    areas = struct.unpack('>256h', area_bytes)

    screens = []
    for s in range(SCREENS):
        sb = map_bytes[s * SCREEN_BYTES:(s + 1) * SCREEN_BYTES]
        # Tiles are stored column-major (index = x * 10 + y); re-order to the
        # row-major layout the renderer walks.
        order = [x * 10 + y for y in range(10) for x in range(16)]
        mods, special, tiles = [], [], []
        for i in order:
            rec = sb[i * 8:(i + 1) * 8]
            # modifiers is a single char; the byte after it is padding the
            # struct never initialised, so only the first byte is meaningful.
            mods.append(rec[0])
            special.append(struct.unpack('>h', rec[2:4])[0])
            tiles.append(struct.unpack('>h', rec[4:6])[0])

        enemies = []
        for e in range(ENEMY_SLOTS):
            rec = sb[TILES_PER_SCREEN * 8 + e * 64:TILES_PER_SCREEN * 8 + (e + 1) * 64]
            enemy = read_enemy(rec)
            if enemy['sprite'] < 2000 or enemy['sprite'] > 2999:
                continue
            enemy['slot'] = e
            enemies.append(enemy)

        screens.append({
            'area': areas[s],
            'tiles': tiles,
            'mods': mods,
            'special': special,
            'enemies': enemies,
        })

    write_json(os.path.join(DATA_DIR, 'map.json'), {
        'width': 16, 'height': 16, 'tilesX': 16, 'tilesY': 10, 'screens': screens})
    print(f'map.json: {SCREENS} screens, '
          f'{sum(len(s["enemies"]) for s in screens)} enemies, '
          f'{sum(1 for s in screens for e in s["enemies"] if e["ai"] >= 50)} of them bosses')


def extract_templates(gamedata):
    """TmplData is the same id + length header as the icons, then an Enemy."""
    data = blob(gamedata, 'TmplData')
    templates = []
    for i in range(len(data) // TEMPLATE_BYTES):
        rec = data[i * TEMPLATE_BYTES:(i + 1) * TEMPLATE_BYTES]
        template = read_enemy(rec[6:])
        template['id'] = struct.unpack('>H', rec[0:2])[0]
        templates.append(template)
    write_json(os.path.join(DATA_DIR, 'enemies.json'), {'templates': templates})
    print(f'enemies.json: {len(templates)} templates')


ITEM_BYTES = 542
ITEM_NAME_AT = 6
ITEM_DESC_AT = 262
ITEM_STATS_AT = 518


def pascal(data, offset):
    """Length-prefixed string, the Mac convention the game was written to."""
    length = data[offset]
    return data[offset + 1:offset + 1 + length].decode('latin1', 'ignore').replace('\0', '').strip()


def extract_items(gamedata):
    """
    ItemData: 39 records of 542 bytes.

    Each record is the 6 byte id/length header the icons use, then the 536
    byte DataFileItem that LoadData.c reads:

      @0   u16 id (16001+), u32 length      the header
      @6   Str255 name                      256 bytes
      @262 Str255 description               256 bytes
      @518 i32 attributes    1 isSword, 2 isArmor, 4 isMoney, 8 isMessage,
                             16 isNotSelectable, 32 isSelectable,
                             64 isSpecialItem, 128 isMissle, 256 hasCharges,
                             512 hasSpecialRoutine
      @522 u8 armor          @523 u8 damage
      @524 i8 speed          @525 u8 rateOfFire
      @528 i16 charges       @530 i8 stamina    (a cost when positive, a
                                                 restore when negative: the
                                                 fatigue potions are -5/-10/-15
                                                 and the mantras cost 5..50)
      @531 i8 damageHealed   @532 i16 quantity  (a coin's face value)
      @534 u16 spriteRef     @536 u16 firedMonsterID

    Items are keyed by id minus 16000, which is how StoreData names its stock.
    """
    data = blob(gamedata, 'ItemData')
    items = []
    for i in range(len(data) // ITEM_BYTES):
        rec = data[i * ITEM_BYTES:(i + 1) * ITEM_BYTES]
        icon = struct.unpack('>H', rec[0:2])[0]
        items.append({
            'code': icon - 16000,
            'icon': icon,
            'name': pascal(rec, ITEM_NAME_AT),
            'desc': pascal(rec, ITEM_DESC_AT),
            'attributes': struct.unpack('>i', rec[518:522])[0],
            'armor': rec[522],
            'damage': rec[523],
            'speed': struct.unpack('>b', rec[524:525])[0],
            'rate': rec[525],
            'charges': struct.unpack('>h', rec[528:530])[0],
            'stamina': struct.unpack('>b', rec[530:531])[0],
            'heal': struct.unpack('>b', rec[531:532])[0],
            'quantity': struct.unpack('>h', rec[532:534])[0],
            'fires': struct.unpack('>H', rec[536:538])[0],
        })
    write_json(os.path.join(DATA_DIR, 'items.json'), {'items': items})
    print(f'items.json: {len(items)} items')


def extract_stores(gamedata):
    """
    StoreData: a greeting in a 256 byte field, then u16 stock count and that
    many (item code, price) pairs. The five records pack end to end and consume
    the blob exactly.
    """
    data = blob(gamedata, 'StoreData')
    stores = []
    pos = 0
    while pos + 258 <= len(data):
        greeting = pascal(data, pos)
        body = pos + 256
        count = struct.unpack('>H', data[body:body + 2])[0]
        stock = []
        pos = body + 2
        for _ in range(count):
            code, price = struct.unpack('>HH', data[pos:pos + 4])
            stock.append({'code': code, 'price': price})
            pos += 4
        stores.append({'greeting': greeting, 'stock': stock})
    write_json(os.path.join(DATA_DIR, 'stores.json'), {'stores': stores})
    print(f'stores.json: {len(stores)} stores, '
          f'{sum(len(s["stock"]) for s in stores)} entries')


def extract_text(gamedata):
    data = blob(gamedata, 'TextData')
    decoded = bytes((b & 0x7f) + 2 if (b & 0x7f) else 0 for b in data)
    messages = [m.decode('latin1', 'ignore') for m in decoded.split(b'\x00') if m]
    write_json(os.path.join(DATA_DIR, 'text.json'), messages)
    print(f'text.json: {len(messages)} messages')




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
    extract_items(gamedata)
    extract_stores(gamedata)

    print('done')


if __name__ == '__main__':
    main()
