// Loads the PNG atlases and JSON data files.

const BASE = 'assets/';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

async function loadJSON(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`failed to load ${src}: ${res.status}`);
  return res.json();
}

export async function loadAssets() {
  const [tiles, sprites, bosses, icons, win, lose, map, gfx, items, stores, text] =
    await Promise.all([
      loadImage(BASE + 'tiles.png'),
      loadImage(BASE + 'sprites.png'),
      loadImage(BASE + 'bosses.png'),
      loadImage(BASE + 'icons32.png'),
      loadImage(BASE + 'ui/win.png'),
      loadImage(BASE + 'ui/lose.png'),
      loadJSON(BASE + 'data/map.json'),
      loadJSON(BASE + 'data/gfx.json'),
      loadJSON(BASE + 'data/items.json'),
      loadJSON(BASE + 'data/stores.json'),
      loadJSON(BASE + 'data/text.json'),
    ]);

  const tileIndex = new Map(gfx.tiles.ids.map((id, i) => [id, i]));
  const spriteIndex = new Map(gfx.sprites.ids.map((id, i) => [id, i]));
  const iconIndex = new Map(gfx.icons32.ids.map((id, i) => [id, i]));

  return {
    tiles, sprites, bosses, icons, win, lose, map, gfx,
    items: items.items,
    stores: stores.stores,
    textMsgs: text,
    tileIndex, spriteIndex, iconIndex,
  };
}
