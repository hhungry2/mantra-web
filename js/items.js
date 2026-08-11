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
  NOT_SELECTABLE: 16,
  SELECTABLE: 32,
  SPECIAL: 64,
  MISSILE: 128,
  HAS_CHARGES: 256,
  SPECIAL_ROUTINE: 512,
};

export const ITEM_TYPES = {
  WEAPON: 'weapon',
  ARMOR: 'armor',
  CONSUMABLE: 'consumable',
  MESSAGE: 'message',
  MONEY: 'money',
  MISC: 'misc',
};

// The original separates main-hand swords, armor and selectable/special items;
// the latter are the off-hand "Other" equipment in this port.
function typeOf(item) {
  const attributes = item.attributes || 0;
  if (attributes & FLAG.WEAPON) return ITEM_TYPES.WEAPON;
  if (attributes & FLAG.ARMOR) return ITEM_TYPES.ARMOR;
  if (attributes & FLAG.MONEY) return ITEM_TYPES.MONEY;
  if (attributes & FLAG.MESSAGE) return ITEM_TYPES.MESSAGE;
  if (item.heal > 0 || item.stamina < 0) return ITEM_TYPES.CONSUMABLE;
  return ITEM_TYPES.MISC;
}

export function isEquipable(item) {
  if (!item) return false;
  if (item.type === ITEM_TYPES.WEAPON || item.type === ITEM_TYPES.ARMOR) return true;
  return item.type === ITEM_TYPES.MISC
    && !!(item.attributes & (FLAG.SELECTABLE | FLAG.SPECIAL));
}

export function isRangedItem(item) {
  return isEquipable(item) && !!(item.attributes & FLAG.MISSILE) && !!item.fires;
}

export function getEquipmentSlot(item) {
  if (!isEquipable(item)) return null;
  if (item.type === ITEM_TYPES.WEAPON) return 'weapon';
  if (item.type === ITEM_TYPES.ARMOR) return 'armor';
  return 'offhand';
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
