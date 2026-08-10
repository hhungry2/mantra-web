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

function readMask(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  const solid = new Uint8Array(img.width * img.height);
  for (let i = 0; i < solid.length; i++) solid[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  return { width: img.width, height: img.height, solid };
}

export async function loadAssets() {
  const [tiles, maskImage, sprites, bosses, map, gfx, enemies] = await Promise.all([
    loadImage(BASE + 'tiles.png'),
    loadImage(BASE + 'tile_masks.png'),
    loadImage(BASE + 'sprites.png'),
    loadImage(BASE + 'bosses.png'),
    loadJSON(BASE + 'data/map.json'),
    loadJSON(BASE + 'data/gfx.json'),
    loadJSON(BASE + 'data/enemies.json'),
  ]);

  const tileIndex = new Map(gfx.tiles.ids.map((id, i) => [id, i]));
  const spriteIndex = new Map(gfx.sprites.ids.map((id, i) => [id, i]));

  return {
    tiles, sprites, bosses, map, gfx,
    templates: enemies.templates,
    mask: readMask(maskImage),
    tileIndex, spriteIndex,
  };
}
