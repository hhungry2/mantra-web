// RPG UI Overlays: Dialogue Textbox, Tabbed Inventory Modal, and Shop Window.

import { ITEM_TYPES, ITEMS } from './items.js';

export class UI {
  constructor(game) {
    this.game = game;
    this.activeTab = ITEM_TYPES.WEAPON;
    this.dialogText = null;
    this.dialogTitle = null;
    this.dialogActive = false;

    this.inventoryOpen = false;
    this.shopOpen = false;

    this.createElements();
  }

  createElements() {
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
    document.getElementById('game-container').appendChild(this.dialogEl);

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
              <button class="tab-btn" data-tab="key">🔑 Key</button>
            </div>
            <div id="item-list" class="item-list"></div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('game-container').appendChild(this.invEl);

    // 3. Shop Modal
    this.shopEl = document.createElement('div');
    this.shopEl.id = 'shop-modal';
    this.shopEl.className = 'ui-overlay hidden';
    this.shopEl.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h2>FLAN TOWN STORE</h2>
          <button id="shop-close-btn" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="shop-list-container">
            <h3>Items for Sale</h3>
            <div id="shop-items-list" class="item-list"></div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('game-container').appendChild(this.shopEl);

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('inv-close-btn').addEventListener('click', () => this.toggleInventory(false));
    document.getElementById('shop-close-btn').addEventListener('click', () => this.toggleShop(false));

    this.invEl.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
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
      this.shopEl.classList.add('hidden');
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
      this.invEl.classList.add('hidden');
      this.hideDialog();
      this.renderShopItems();
      this.shopEl.classList.remove('hidden');
    } else {
      this.shopEl.classList.add('hidden');
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
      const isEquipped = (p.weapon && p.weapon.id === item.id) || (p.armor && p.armor.id === item.id);
      
      row.innerHTML = `
        <div class="item-name">${item.name} ${isEquipped ? '<span class="equipped-tag">[Equipped]</span>' : ''}</div>
        <div class="item-desc">${item.desc || ''}</div>
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
      }
      listEl.appendChild(row);
    });
  }

  renderShopItems() {
    const listEl = document.getElementById('shop-items-list');
    listEl.innerHTML = '';
    const shopStock = [
      ITEMS.bronze_sword,
      ITEMS.silver_sword,
      ITEMS.leather_armor,
      ITEMS.iron_shield,
      ITEMS.potion,
      ITEMS.super_potion,
      ITEMS.small_key,
    ];

    shopStock.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <div class="item-name">${item.name} - <span class="gold-text">${item.price} Gold</span></div>
        <div class="item-desc">${item.desc}</div>
        <div class="item-actions">
          <button class="action-btn buy-btn">Buy</button>
        </div>
      `;
      row.querySelector('.buy-btn').addEventListener('click', () => {
        if (this.game.player.gold >= item.price) {
          this.game.player.gold -= item.price;
          this.game.player.addItem(item);
          this.game.audio.play('hit');
          this.renderShopItems();
        }
      });
      listEl.appendChild(row);
    });
  }
}
