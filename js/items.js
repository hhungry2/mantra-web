// The item roster, straight out of ItemData.
//
// Every item carries the original `attributes` bit field, which is what the
// original used to decide how it behaves. Items are keyed by their code (the icon id minus
// 16000), the same number StoreData uses to name its stock.

export const FLAG = {
  WEAPON: 1,
  ARMOR: 2,
  MONEY: 4,
  MESSAGE: 8,
  RING: 32,
  CARRY: 64,
  MAGIC: 128,
};

export const ITEM_TYPES = {
  WEAPON: 'weapon',
  ARMOR: 'armor',
  CONSUMABLE: 'consumable',
  MESSAGE: 'message',
  MONEY: 'money',
  MISC: 'misc',
};

// Which inventory tab an item lands in. Rings sit with armour because that is
// what they do here: "Provides Magical Protection".
function typeOf(item) {
  const attributes = item.attributes || 0;
  if (attributes & (FLAG.WEAPON | FLAG.MAGIC)) return ITEM_TYPES.WEAPON;
  if (attributes & (FLAG.ARMOR | FLAG.RING)) return ITEM_TYPES.ARMOR;
  if (attributes & FLAG.MONEY) return ITEM_TYPES.MONEY;
  if (attributes & FLAG.MESSAGE) return ITEM_TYPES.MESSAGE;
  if (item.heal > 0 || item.stamina < 0) return ITEM_TYPES.CONSUMABLE;
  return ITEM_TYPES.MISC;
}

const byCode = new Map();

export function initItems(records) {
  byCode.clear();
  for (const record of records) {
    byCode.set(record.code, Object.freeze({ ...record, type: typeOf(record) }));
  }
  return byCode;
}

export function getItem(code) {
  return byCode.get(code) || null;
}

export function allItems() {
  return [...byCode.values()];
}

// Named codes the engine needs by hand: Saric's starting kit.
export const ITEM_CODES = {
  WOODEN_SWORD: 1,
  HEALING_POTION: 51,
};
