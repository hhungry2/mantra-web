// Save & Load Manager using localStorage (4 slots)

import { getLang } from './i18n.js';

const SAVE_KEY_PREFIX = 'mantra_web_save_slot_';

export class SaveManager {
  static getSlots() {
    const slots = [];
    for (let i = 1; i <= 4; i++) {
      const dataStr = localStorage.getItem(SAVE_KEY_PREFIX + i);
      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          slots.push({ slot: i, empty: false, data: parsed });
        } catch (e) {
          slots.push({ slot: i, empty: true });
        }
      } else {
        slots.push({ slot: i, empty: true });
      }
    }
    return slots;
  }

  static save(slotId, game) {
    const p = game.player;
    const saveData = {
      level: p.level,
      hp: p.hp,
      hpMax: p.hpMax,
      stamina: p.stamina,
      staminaMax: p.staminaMax || 10,
      xp: p.xp,
      nextXp: p.nextXp,
      gold: p.gold,
      baseAttack: p.baseAttack,
      baseDefense: p.baseDefense,
      weaponCode: p.weapon ? p.weapon.code : null,
      specialCode: p.special ? p.special.code : null,
      armorCode: p.armor ? p.armor.code : null,
      ringCodes: p.rings.map((r) => r.code),
      inventoryCodes: p.inventory.map((item) => item.code),
      screenIndex: game.screenIndex,
      playerPos: { x: Math.round(p.x), y: Math.round(p.y) },
      defeatedMasks: Array.from(game.defeatedMasks),
      timestamp: new Date().toLocaleString(getLang() === 'ja' ? 'ja-JP' : 'en-US'),
    };
    localStorage.setItem(SAVE_KEY_PREFIX + slotId, JSON.stringify(saveData));
    return true;
  }

  static load(slotId) {
    const dataStr = localStorage.getItem(SAVE_KEY_PREFIX + slotId);
    if (!dataStr) return null;
    try {
      return JSON.parse(dataStr);
    } catch (e) {
      return null;
    }
  }

  static deleteSlot(slotId) {
    localStorage.removeItem(SAVE_KEY_PREFIX + slotId);
    return true;
  }
}
