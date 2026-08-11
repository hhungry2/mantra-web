// RPG UI Overlays: Dialogue Textbox, Tabbed Inventory Modal, Shop Window, and Save/Load Manager.

import { ITEM_TYPES, getItem } from './items.js';
import { SaveManager } from './save.js';

// Items carry no price of their own - StoreData only prices what a shop
// sells. To let the player sell anything, price it off whichever shop (if
// any) already stocks it, and fall back to a stat-based guess for items no
// store carries. Selling always pays half of whatever that comes out to.
function baseValue(game, item) {
  for (const store of game.stores) {
    const entry = store.stock.find((s) => s.code === item.code);
    if (entry) return entry.price;
  }
  if (item.type === ITEM_TYPES.WEAPON) return 20 + (item.damage || 0) * 5;
  if (item.type === ITEM_TYPES.ARMOR) return 20 + (item.armor || 0) * 5;
  if (item.type === ITEM_TYPES.CONSUMABLE) return 10 + (item.heal || 0) * 2;
  return 5;
}

function sellPrice(game, item) {
  return Math.max(1, Math.floor(baseValue(game, item) / 2));
}

// isSpecialItem (64) turns out to be set on ordinary consumables too (e.g.
// the Healing Potion), so it can't tell quest items apart from goods; the
// Key and the five Mantras are named by code instead. Letters aren't goods
// either.
const QUEST_ITEM_CODES = new Set([150, 100, 101, 102, 103, 104]);
function isSellable(item) {
  return item.type !== ITEM_TYPES.MESSAGE && !QUEST_ITEM_CODES.has(item.code);
}

// Items carry the icon id their artwork sits under in icons32.png; a few of
// them (the Rapier, for one) have no icon in the file, so this can come back
// empty and the row just goes without.
function iconStyle(item, gfx) {
  const index = gfx.icons32.ids.indexOf(item.icon);
  if (index < 0) return '';
  const x = (index % gfx.icons32.cols) * gfx.icons32.size;
  const y = Math.floor(index / gfx.icons32.cols) * gfx.icons32.size;
  return `background-image:url(assets/icons32.png);background-position:-${x}px -${y}px`;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.gfx = game.gfx;
    this.activeTab = ITEM_TYPES.WEAPON;
    this.dialogText = null;
    this.dialogTitle = null;
    this.dialogActive = false;

    this.inventoryOpen = false;
    this.shopOpen = false;
    this.saveOpen = false;

    this.createElements();
  }

  createElements() {
    const container = document.getElementById('game-container');

    // 1. Dialogue overlay
    this.dialogEl = document.createElement('div');
    this.dialogEl.id = 'dialog-overlay';
    this.dialogEl.className = 'ui-overlay hidden';
    this.dialogEl.innerHTML = `
      <div class="dialog-box">
        <div id="dialog-speaker" class="dialog-speaker">Signboard</div>
        <div id="dialog-body" class="dialog-body"></div>
        <div class="dialog-prompt">Press Space / Enter to continue...</div>
      </div>
    `;
    container.appendChild(this.dialogEl);

    // 2. Inventory Modal
    this.invEl = document.createElement('div');
    this.invEl.id = 'inventory-modal';
    this.invEl.className = 'ui-overlay hidden';
    this.invEl.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h2>INVENTORY & EQUIPMENT</h2>
          <button id="inv-close-btn" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="stats-panel">
            <h3>SARIC</h3>
            <div id="stat-level">Level: 1</div>
            <div id="stat-hp">HP: 20 / 20</div>
            <div id="stat-st">Stamina: 100</div>
            <div id="stat-atk">Attack: 4</div>
            <div id="stat-def">Defense: 0</div>
            <div id="stat-xp">XP: 0 / 30</div>
            <div id="stat-gold">Gold: 50</div>
          </div>
          <div class="items-panel">
            <div class="tabs">
              <button class="tab-btn active" data-tab="weapon">⚔️ Weapon</button>
              <button class="tab-btn" data-tab="armor">🛡️ Armor</button>
              <button class="tab-btn" data-tab="consumable">🧪 Items</button>
              <button class="tab-btn" data-tab="misc">🔑 Other</button>
              <button class="tab-btn" data-tab="message">✉️ Messages</button>
            </div>
            <div id="item-list" class="item-list"></div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(this.invEl);

    // 3. Shop Modal
    this.shopEl = document.createElement('div');
    this.shopEl.id = 'shop-modal';
    this.shopEl.className = 'ui-overlay hidden';
    this.shopEl.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h2>STORE</h2>
          <button id="shop-close-btn" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="shop-list-container">
            <p id="shop-greeting" class="shop-greeting"></p>
            <h3>For Sale</h3>
            <div id="shop-items-list" class="item-list"></div>
            <h3>Your Items</h3>
            <div id="shop-sell-list" class="item-list"></div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(this.shopEl);

    // 4. Save / Load Modal
    this.saveEl = document.createElement('div');
    this.saveEl.id = 'save-modal';
    this.saveEl.className = 'ui-overlay hidden';
    this.saveEl.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h2>SAVE / LOAD GAME</h2>
          <button id="save-close-btn" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div id="save-slots-list" class="save-slots-grid"></div>
        </div>
      </div>
    `;
    container.appendChild(this.saveEl);

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('inv-close-btn').addEventListener('click', () => this.toggleInventory(false));
    document.getElementById('shop-close-btn').addEventListener('click', () => this.toggleShop(false));
    document.getElementById('save-close-btn').addEventListener('click', () => this.toggleSave(false));

    this.invEl.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.invEl.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.tab;
        this.renderInventoryItems();
      });
    });
  }

  showDialog(title, text) {
    this.dialogTitle = title;
    this.dialogText = text;
    this.dialogActive = true;
    document.getElementById('dialog-speaker').textContent = title || 'Message';
    document.getElementById('dialog-body').textContent = text;
    this.dialogEl.classList.remove('hidden');
  }

  hideDialog() {
    this.dialogActive = false;
    this.dialogEl.classList.add('hidden');
  }

  toggleInventory(show) {
    this.inventoryOpen = show !== undefined ? show : !this.inventoryOpen;
    if (this.inventoryOpen) {
      this.shopOpen = false;
      this.saveOpen = false;
      this.shopEl.classList.add('hidden');
      this.saveEl.classList.add('hidden');
      this.hideDialog();
      this.updateStatsDisplay();
      this.renderInventoryItems();
      this.invEl.classList.remove('hidden');
    } else {
      this.invEl.classList.add('hidden');
    }
  }

  toggleShop(show) {
    this.shopOpen = show !== undefined ? show : !this.shopOpen;
    if (this.shopOpen) {
      this.inventoryOpen = false;
      this.saveOpen = false;
      this.invEl.classList.add('hidden');
      this.saveEl.classList.add('hidden');
      this.hideDialog();
      this.renderShopItems();
      this.shopEl.classList.remove('hidden');
    } else {
      this.shopEl.classList.add('hidden');
    }
  }

  toggleSave(show) {
    this.saveOpen = show !== undefined ? show : !this.saveOpen;
    if (this.saveOpen) {
      this.inventoryOpen = false;
      this.shopOpen = false;
      this.invEl.classList.add('hidden');
      this.shopEl.classList.add('hidden');
      this.hideDialog();
      this.renderSaveSlots();
      this.saveEl.classList.remove('hidden');
    } else {
      this.saveEl.classList.add('hidden');
    }
  }

  updateStatsDisplay() {
    const p = this.game.player;
    document.getElementById('stat-level').textContent = `Level: ${p.level}`;
    document.getElementById('stat-hp').textContent = `HP: ${p.hp} / ${p.hpMax}`;
    document.getElementById('stat-st').textContent = `Stamina: ${Math.round(p.stamina)}`;
    document.getElementById('stat-atk').textContent = `Attack: ${p.attack}`;
    document.getElementById('stat-def').textContent = `Defense: ${p.defense}`;
    document.getElementById('stat-xp').textContent = `XP: ${p.xp} / ${p.nextXp}`;
    document.getElementById('stat-gold').textContent = `Gold: ${p.gold}`;
  }

  renderInventoryItems() {
    const p = this.game.player;
    const listEl = document.getElementById('item-list');
    listEl.innerHTML = '';

    const filtered = p.inventory.filter((item) => item.type === this.activeTab);
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-msg">No items in this category.</div>';
      return;
    }

    filtered.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      const isEquipped = (p.weapon && p.weapon.code === item.code)
        || (p.armor && p.armor.code === item.code);

      row.innerHTML = `
        <div class="item-icon" style="${iconStyle(item, this.gfx)}"></div>
        <div class="item-text">
          <div class="item-name">${item.name} ${isEquipped ? '<span class="equipped-tag">[Equipped]</span>' : ''}</div>
          <div class="item-desc">${item.desc || ''}</div>
        </div>
        <div class="item-actions"></div>
      `;

      const actionsEl = row.querySelector('.item-actions');
      if (item.type === ITEM_TYPES.WEAPON || item.type === ITEM_TYPES.ARMOR) {
        if (!isEquipped) {
          const btn = document.createElement('button');
          btn.className = 'action-btn';
          btn.textContent = 'Equip';
          btn.addEventListener('click', () => {
            p.equip(item);
            this.updateStatsDisplay();
            this.renderInventoryItems();
          });
          actionsEl.appendChild(btn);
        }
      } else if (item.type === ITEM_TYPES.CONSUMABLE) {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.textContent = 'Use';
        btn.addEventListener('click', () => {
          if (p.useItem(item)) {
            this.updateStatsDisplay();
            this.renderInventoryItems();
          }
        });
        actionsEl.appendChild(btn);
      } else if (item.type === ITEM_TYPES.MESSAGE) {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.textContent = 'Read';
        btn.addEventListener('click', () => {
          this.toggleInventory(false);
          this.showDialog(item.name, item.desc);
        });
        actionsEl.appendChild(btn);
      }
      listEl.appendChild(row);
    });
  }

  renderShopItems() {
    const listEl = document.getElementById('shop-items-list');
    listEl.innerHTML = '';

    const store = this.game.currentStore;
    if (!store) {
      listEl.innerHTML = '<div class="empty-msg">Nothing for sale here.</div>';
      return;
    }

    const greetingEl = document.getElementById('shop-greeting');
    if (greetingEl) greetingEl.textContent = store.greeting;

    store.stock.forEach((entry) => {
      const item = getItem(entry.code);
      if (!item) return;
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <div class="item-icon" style="${iconStyle(item, this.gfx)}"></div>
        <div class="item-text">
          <div class="item-name">${item.name} - <span class="gold-text">${entry.price} Gold</span></div>
          <div class="item-desc">${item.desc}</div>
        </div>
        <div class="item-actions">
          <button class="action-btn buy-btn">Buy</button>
        </div>
      `;
      row.querySelector('.buy-btn').addEventListener('click', () => {
        if (this.game.player.gold >= entry.price) {
          this.game.player.gold -= entry.price;
          this.game.player.addItem(item);
          this.game.audio.play('hit');
          this.renderShopItems();
        }
      });
      listEl.appendChild(row);
    });

    this.renderSellList();
  }

  renderSellList() {
    const p = this.game.player;
    const listEl = document.getElementById('shop-sell-list');
    listEl.innerHTML = '';

    const sellable = p.inventory.filter((item) => isSellable(item)
      && p.weapon?.code !== item.code && p.armor?.code !== item.code);
    if (sellable.length === 0) {
      listEl.innerHTML = '<div class="empty-msg">Nothing to sell.</div>';
      return;
    }

    sellable.forEach((item) => {
      const price = sellPrice(this.game, item);
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <div class="item-icon" style="${iconStyle(item, this.gfx)}"></div>
        <div class="item-text">
          <div class="item-name">${item.name} - <span class="gold-text">${price} Gold</span></div>
          <div class="item-desc">${item.desc || ''}</div>
        </div>
        <div class="item-actions">
          <button class="action-btn sell-btn">Sell</button>
        </div>
      `;
      row.querySelector('.sell-btn').addEventListener('click', () => {
        const idx = p.inventory.indexOf(item);
        if (idx < 0) return;
        p.inventory.splice(idx, 1);
        p.gold += price;
        this.game.audio.play('hit');
        this.renderShopItems();
      });
      listEl.appendChild(row);
    });
  }

  renderSaveSlots() {
    const listEl = document.getElementById('save-slots-list');
    listEl.innerHTML = '';

    const slots = SaveManager.getSlots();
    slots.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'save-card';

      if (s.empty) {
        card.innerHTML = `
          <div class="save-title">Slot ${s.slot}: Empty</div>
          <div class="save-actions">
            <button class="action-btn save-btn">Save</button>
          </div>
        `;
        card.querySelector('.save-btn').addEventListener('click', () => {
          SaveManager.save(s.slot, this.game);
          this.renderSaveSlots();
        });
      } else {
        const d = s.data;
        card.innerHTML = `
          <div class="save-title">Slot ${s.slot}: LV ${d.level} (Screen ${d.screenIndex})</div>
          <div class="save-meta">HP: ${d.hp}/${d.hpMax} | Gold: ${d.gold} | Saved: ${d.timestamp}</div>
          <div class="save-actions">
            <button class="action-btn save-btn">Overwrite</button>
            <button class="action-btn load-btn">Load</button>
            <button class="action-btn del-btn">Delete</button>
          </div>
        `;
        card.querySelector('.save-btn').addEventListener('click', () => {
          SaveManager.save(s.slot, this.game);
          this.renderSaveSlots();
        });
        card.querySelector('.load-btn').addEventListener('click', () => {
          this.game.loadGameData(d);
          this.toggleSave(false);
          this.game.startGame?.();
        });
        card.querySelector('.del-btn').addEventListener('click', () => {
          SaveManager.deleteSlot(s.slot);
          this.renderSaveSlots();
        });
      }
      listEl.appendChild(card);
    });
  }
}
