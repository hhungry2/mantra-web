// Lightweight localization: English is the built-in default, Japanese is a
// dictionary overlay. The chrome strings in the code double as English keys,
// so t('For Sale') read back as-is unless the current language overrides it.
//
// The bulk of the game text (TextData messages, item names/descriptions, shop
// greetings) ships as English in the extracted JSON; the localize* helpers
// hand back Japanese equivalents when the current language provides them.

import ja from './i18n-ja.js';

export const LANGS = ['en', 'ja'];

const LANG_KEY = 'mantra_web_lang';

export function getLang() {
  try {
    return LANGS.includes(localStorage.getItem(LANG_KEY)) ? localStorage.getItem(LANG_KEY) : 'en';
  } catch {
    return 'en';
  }
}

export function setLang(code) {
  try {
    localStorage.setItem(LANG_KEY, LANGS.includes(code) ? code : 'en');
  } catch {
    // storage unavailable: the setting just won't persist
  }
}

export function isJa() {
  return getLang() === 'ja';
}

export function t(key, params) {
  let str = isJa() && ja.ui[key] ? ja.ui[key] : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.split(`{${k}}`).join(v);
    }
  }
  return str;
}

// TextData is an array of messages referenced by number; translate in place
// only when the translation covers the same count.
export function localizeMessages(base) {
  if (!isJa()) return base;
  const msgs = ja.messages;
  if (!msgs || msgs.length !== base.length) return base;
  return base.map((m, i) => msgs[i] ?? m);
}

// Item records are keyed by code; swap in translated name/description.
export function localizeItem(record) {
  if (!isJa()) return record;
  const x = ja.items && ja.items[record.code];
  return x ? { ...record, name: x.name, desc: x.desc } : record;
}

// Shop greetings come in here by store index.
export function localizeStores(base) {
  if (!isJa()) return base;
  return (base || []).map((s, i) => {
    const g = ja.storeGreetings && ja.storeGreetings[i];
    return g ? { ...s, greeting: g } : s;
  });
}

// Boss names sit in enemy_ai.js keyed by ai number.
export function localizeBossName(fallback, ai) {
  if (!isJa()) return fallback;
  return (ja.bosses && ja.bosses[ai]) || fallback;
}

// Wires data-i18n attributes on static HTML (title buttons, story button,
// language label) to their translations.
export function applyDocumentStrings() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
  document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
    el.setAttribute('alt', t(el.dataset.i18nAlt));
  });
  document.documentElement.lang = getLang() === 'ja' ? 'ja' : 'en';
}
