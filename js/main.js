// Boot and game loop: a 25fps fixed timestep over the 256-screen world.

import {
  TILE, FRAME_MS, MAX_CATCHUP_FRAMES, START_SCREEN, START_TILE, VIEW_W, VIEW_H,
} from './config.js';
import { loadAssets } from './assets.js';
import { World, MOD } from './map.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Saric, DIR_VECTORS } from './saric.js';
import { spawnScreen, makeMover, Corpse, ATTR, createEnemyFromTemplate } from './enemy.js';
import { BOSS_NAMES, AI } from './enemy_ai.js';
import { overlaps, box } from './collision.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { initItems, getItem, FLAG } from './items.js';
import { TouchControls } from './touch.js';
import { t, getLang, setLang, localizeBossName, applyDocumentStrings } from './i18n.js';

// How close Saric has to stand to read a signpost.
const READ_RANGE = 40;

// Fire, Earth, Water, Air, Force.
const MANTRA_CODES = [100, 101, 102, 103, 104];

// Bronze and Copper Pennies are pocketed on the spot rather than left on the
// ground as a visible drop.
const POCKETED_COINS = new Set([200, 201]);

// Grid (7,5). Five separate signposts (text.json #17,52,55,67,68) all name
// this screen as Castle Blednock, and its two dungeon doors match the
// "great labyrinth" / "Balther's maze" the labyrinth signs describe
// (text.json #45, #48) - there's no explicit "Castle Blednock" tag in the
// extracted data, so this is triangulated from the signpost directions.
const CASTLE_BLEDNOCK_SCREEN = 87;

class Game {
  constructor(assets, canvas) {
    this.world = new World(assets);
    this.renderer = new Renderer(canvas, assets);
    this.gfx = assets.gfx;
    this.textMsgs = assets.textMsgs || [];
    this.stores = assets.stores || [];
    this.templates = assets.templates || new Map();
    this.currentStore = null;
    this.input = new Input();
    this.audio = new Audio();
    this.touch = new TouchControls(this.input);

    this.defeatedMasks = new Uint16Array(256);

    this.player = new Saric(
      START_TILE.x * TILE + TILE / 2,
      START_TILE.y * TILE + TILE / 2,
    );

    this.ui = new UI(this);

    this.screenIndex = START_SCREEN;
    this.corpses = [];
    this.victory = false;
    this.mantrasReady = false;
    this.doorLatch = null;
    this.enter(START_SCREEN);

    this.frame = 0;
    this.hudNote = '';

    // Key handlers
    this.input.on('KeyM', () => {
      this.hudNote = this.audio.toggle() ? t('SOUND ON') : t('SOUND OFF');
      this.noteUntil = this.frame + 40;
    });

    this.input.on('KeyI', () => this.ui.toggleInventory());
    this.input.on('Tab', () => this.ui.toggleInventory());
    this.input.on('KeyV', () => this.ui.toggleSave());
    this.input.on('KeyH', () => this.ui.toggleHelp());

    this.input.on('Escape', () => {
      if (this.ui.helpOpen) this.ui.toggleHelp(false);
      else if (this.ui.inventoryOpen) this.ui.toggleInventory(false);
      else if (this.ui.shopOpen) this.ui.toggleShop(false);
      else if (this.ui.saveOpen) this.ui.toggleSave(false);
      else if (this.ui.dialogActive) this.ui.hideDialog();
    });

    // Space is the sword. It only doubles as "dismiss" while a panel is up,
    // and then the press is swallowed so closing a box does not also swing.
    this.input.on('Space', () => {
      if (this.ui.helpOpen) {
        this.ui.toggleHelp(false);
        this.input.consumeAttack();
      } else if (this.ui.dialogActive) {
        this.ui.hideDialog();
        this.input.consumeAttack();
      }
    });

    this.input.on('KeyE', () => {
      if (this.ui.dialogActive) this.ui.hideDialog();
      else this.checkInteract();
    });

    this.input.on('Enter', () => {
      if (this.ui.helpOpen) this.ui.toggleHelp(false);
      else if (this.ui.dialogActive) this.ui.hideDialog();
    });
  }

  enter(index, spawnX = null, spawnY = null) {
    this.doorLatch = null;
    this.screenIndex = index;
    this.screen = this.world.screen(index);
    // Bosses need no special casing: they sit in the screen's own enemy slots
    // with a movementType of 50 or above.
    this.enemies = spawnScreen(this.screen, this.defeatedMasks[index], (slotIndex) => {
      this.defeatedMasks[index] &= ~(1 << slotIndex);
    });
    this.corpses = [];
    // Locked doors keep their bodies on the movement collision layer until
    // a key opens them. Bodies are captured once and reused by reference.
    this.world.closedDoors = [];
    for (const e of this.enemies) {
      if (e.ai !== AI.DOOR) continue;
      const body = e.body;
      e.doorBlock = body;
      this.world.closedDoors.push(body);
    }
    this.move = makeMover(this.world, this.screen);

    if (this.audio.ctx) this.audio.playMusic(this.world.musicIndexAt(this.screen));
    if (spawnX !== null && this.player) this.player.x = spawnX;
    if (spawnY !== null && this.player) this.player.y = spawnY;
  }

  loadGameData(d) {
    this.victory = false;
    this.player.dead = false;
    this.player.woundCounter = 0;
    this.player.swing = 0;
    this.player.cooldown = 0;
    this.player.rangedCooldown = 0;

    this.player.level = d.level;
    this.player.hp = d.hp;
    this.player.hpMax = d.hpMax;
    this.player.stamina = d.stamina;
    this.player.staminaMax = d.staminaMax || 10;
    this.player.xp = d.xp;
    this.player.nextXp = d.nextXp;
    this.player.gold = d.gold;
    this.player.baseAttack = d.baseAttack;
    this.player.baseDefense = d.baseDefense;

    this.player.weapon = d.weaponCode ? getItem(d.weaponCode) : null;
    this.player.offhand = d.offhandCode ? getItem(d.offhandCode) : null;
    this.player.armor = d.armorCode ? getItem(d.armorCode) : null;

    if (d.inventoryCodes) {
      this.player.inventory = d.inventoryCodes.map((code) => getItem(code)).filter(Boolean);
    }

    if (d.defeatedMasks) {
      this.defeatedMasks = new Uint16Array(d.defeatedMasks);
    }

    const position = d.playerPos || {};
    const startX = START_TILE.x * TILE + TILE / 2;
    const startY = START_TILE.y * TILE + TILE / 2;
    this.enter(d.screenIndex ?? START_SCREEN, position.x ?? startX, position.y ?? startY);
    this.hudNote = t('GAME LOADED!');
    this.noteUntil = this.frame + 60;
  }

  checkInteract() {
    const player = this.player;
    // Signposts and speaking NPCs carry a message number into textMsgs
    const speaker = this.enemies.find((e) => e.message > 0
      && Math.hypot(e.x - player.x, e.y - player.y) < READ_RANGE);
    if (speaker) {
      let text = this.textMsgs[speaker.message - 1] || '';
      // Dialogs.c:186: message 5 appends deadItem name
      if (speaker.message === 5 && speaker.drop) {
        const dropItem = getItem(speaker.drop);
        if (dropItem) text += dropItem.name;
      }
      if (text) {
        this.ui.showDialog('', text);
        return;
      }
    }

    this.hudNote = t('NOTHING HERE');
    this.noteUntil = this.frame + 25;
  }

  // Chests and the things lying about are enemies flagged canBeHeld: walking
  // into one hands over whatever deadItem names.
  //
  // A few of them are people rather than props - the dying man on the first
  // screen presses his dagger on you - and those carry a message as well. It
  // is their one chance to speak, since taking the item is what removes them,
  // so say it here rather than leaving it to the read key.
  collect(enemy) {
    enemy.dead = true;
    if (enemy.slotIndex >= 0) {
      this.defeatedMasks[this.screenIndex] |= (1 << enemy.slotIndex);
    }
    const item = getItem(enemy.drop);
    if (!item) return;
    const isMoney = !!(item.attributes & FLAG.MONEY);
    this.player.addItem(item);
    this.audio.play(isMoney ? 'money' : 'item');
    this.hudNote = t('FOUND {name}', { name: item.name.toUpperCase() });
    this.noteUntil = this.frame + 50;

    let text = enemy.message > 0 ? (this.textMsgs[enemy.message - 1] || '') : null;
    // Dialogs.c:186: message 5 appends deadItem name
    if (text && enemy.message === 5 && enemy.drop) {
      const dropItem = getItem(enemy.drop);
      if (dropItem) text += dropItem.name;
    }
    if (text) this.ui.showDialog('', text);
  }

  // A slain enemy stays slain, hands over its experience, and leaves a dying
  // body behind - the death animation in the original's killCurrentEnemy.
  defeat(enemy) {
    if (enemy.slotIndex >= 0) {
      this.defeatedMasks[this.screenIndex] |= (1 << enemy.slotIndex);
    }
    // Input.c:873: missiles do not award XP
    const isMissile = !!(enemy.attributes & ATTR.IS_MISSILE);
    const leveledUp = isMissile ? false : this.player.addXp(enemy.xp);
    // Door enemies and missiles vanish outright (Enemies.c:172) - no body left behind.
    // Copper pennies are pocketed on the spot too, without a visible drop.
    if (enemy.ai !== AI.DOOR && !isMissile) {
      const drop = getItem(enemy.drop);
      if (drop && POCKETED_COINS.has(drop.code)) this.giveDrop(drop);
      else this.corpses.push(new Corpse(enemy, drop));
    }

    if (enemy.boss) {
      const bossName = localizeBossName(BOSS_NAMES[enemy.ai] || t('BOSS'), enemy.ai);
      this.hudNote = t('{name} DEFEATED', { name: bossName.toUpperCase() });
      this.noteUntil = this.frame + 60;
      this.audio.play('fanfare');
    } else if (leveledUp) {
      this.hudNote = t('LEVEL UP!');
      this.noteUntil = this.frame + 60;
    }
  }

  giveDrop(item) {
    const isMoney = !!(item.attributes & FLAG.MONEY);
    this.player.addItem(item);
    this.audio.play(isMoney ? 'money' : 'item');
    this.hudNote = t('FOUND {name}', { name: item.name.toUpperCase() });
    this.noteUntil = this.frame + 50;
  }

  // Off-hand special items do their thing on the F key. The Key unlocks a
  // doorEnemy in front of Saric; the Force Mantra hurts every enemy on the
  // screen. This mirrors runItemSpecialRoutine in the original's Saric.c.
  useSpecialRoutine(item) {
    if (!item || !(item.attributes & FLAG.SPECIAL_ROUTINE)) return;
    if (item.code === 150) this.keyUse();
    else if (item.code === 104) this.powerMantra();
  }

  // keySpecialItem: the door one tile out along the facing - the same
  // SWORD_OFFSET rect the sword uses - gives way, one Key is spent, and the
  // original plays sound 134.
  keyUse() {
    const player = this.player;
    const [dx, dy] = DIR_VECTORS[player.dir];
    const reach = 16;
    const hit = box(player.x + dx * reach, player.y + dy * reach, 20, 16);
    const door = this.enemies.find((e) => !e.dead && e.ai === AI.DOOR && overlaps(hit, e.body));
    if (!door) {
      this.hudNote = t('NOTHING HERE');
      this.noteUntil = this.frame + 25;
      return;
    }
    door.dead = true;
    this.audio.play('key');
    this.defeatedMasks[this.screenIndex] |= (1 << door.slotIndex);
    this.world.closedDoors = this.world.closedDoors.filter((b) => b !== door.doorBlock);
    const keyIdx = player.inventory.findIndex((i) => i.code === 150);
    if (keyIdx >= 0) player.inventory.splice(keyIdx, 1);
    if (player.offhand?.code === 150 && !player.inventory.some((i) => i.code === 150)) {
      player.offhand = null;
    }
    this.hudNote = t('UNLOCKED!');
    this.noteUntil = this.frame + 50;
  }

  // powerMantraItem: the Force Mantra wounds every killable enemy on the
  // screen by 20, sparing the door guards, corpses and the final boss. The
  // original only plays the off-hand trigger sound (128) here.
  powerMantra() {
    const spared = new Set([AI.NONE, AI.DYING, AI.DOOR, AI.FINAL_BOSS]);
    for (const enemy of this.enemies) {
      if (enemy.dead || spared.has(enemy.ai)) continue;
      if (!(enemy.attributes & ATTR.IS_ENEMY) || !(enemy.attributes & ATTR.KILLABLE)) continue;
      const killed = enemy.hurt(20, 253, this.player.x, this.player.y);
      if (killed) this.defeat(enemy);
    }
    this.audio.play('sword');
  }

  checkScreenTransitions() {
    const player = this.player;
    const currIdx = this.screenIndex;

    const playerTileX = Math.floor(player.x / TILE);
    const playerTileY = Math.floor(player.y / TILE);
    if (this.doorLatch) {
      const stillOnDoor = this.doorLatch.screen === currIdx
        && this.doorLatch.tileX === playerTileX
        && this.doorLatch.tileY === playerTileY;
      if (stillOnDoor) return;
      this.doorLatch = null;
    }

    const door = this.world.doorAt(this.screen, player.x, player.y);
    if (door && door.screen !== this.screenIndex) {
      // The original C source plays no effect when warping through a door,
      // so the transition is silent here too.
      this.enter(door.screen, door.tileX * TILE + TILE / 2, door.tileY * TILE + TILE / 2);
      this.doorLatch = {
        screen: door.screen,
        tileX: door.tileX,
        tileY: door.tileY,
      };
      return;
    }

    // Check Grid transitions (screen boundaries)
    if (player.x < 0) {
      const nextIdx = this.world.getNeighbor(currIdx, 'left');
      if (nextIdx !== null) this.enter(nextIdx, VIEW_W - 12, player.y);
      else player.x = 8;
    } else if (player.x >= VIEW_W) {
      const nextIdx = this.world.getNeighbor(currIdx, 'right');
      if (nextIdx !== null) this.enter(nextIdx, 12, player.y);
      else player.x = VIEW_W - 8;
    } else if (player.y < 0) {
      const nextIdx = this.world.getNeighbor(currIdx, 'up');
      if (nextIdx !== null) this.enter(nextIdx, player.x, VIEW_H - 12);
      else player.y = 8;
    } else if (player.y >= VIEW_H) {
      const nextIdx = this.world.getNeighbor(currIdx, 'down');
      if (nextIdx !== null) this.enter(nextIdx, player.x, 12);
      else player.y = VIEW_H - 8;
    }
  }

  tick() {
    this.frame++;

    if (this.ui.inventoryOpen || this.ui.shopOpen || this.ui.saveOpen || this.ui.dialogActive || this.ui.helpOpen) return;

    const player = this.player;
    player.update(this.input, this.world, this.screen);
    if (player.swungThisFrame) this.audio.play('sword');

    if (player.firedThisFrame) {
      const item = player.firedThisFrame;
      const template = this.templates.get(item.fires);
      if (template) {
        const [dx, dy] = DIR_VECTORS[player.dir];
        const missileFacing = player.dir === 1 ? 1 : (player.dir === 2 ? 2 : (player.dir === 0 ? 3 : 4));
        const missile = createEnemyFromTemplate(template, player.x + dx * 32, player.y + dy * 32, missileFacing, ~ATTR.IS_ENEMY);
        missile.damage = item.damage || template.damage;
        // Enemies.c:597: saricFireEnemy() strips isEnemy, but that bit is not
        // a reliable "did Saric fire this" flag - 110 of the 586 placed
        // entities (signposts, shopkeepers, props) lack it too. Tag it
        // explicitly instead of inferring it from the bit's absence.
        missile.firedByPlayer = true;
        this.enemies.push(missile);
      }
    }

    if (player.offhandFiredThisFrame) {
      const item = player.offhandFiredThisFrame;
      const template = this.templates.get(item.fires);
      if (template) {
        const [dx, dy] = DIR_VECTORS[player.dir];
        const missileFacing = player.dir === 1 ? 1 : (player.dir === 2 ? 2 : (player.dir === 0 ? 3 : 4));
        const missile = createEnemyFromTemplate(template, player.x + dx * 32, player.y + dy * 32, missileFacing, ~ATTR.IS_ENEMY);
        missile.damage = item.damage || template.damage;
        missile.firedByPlayer = true;
        this.enemies.push(missile);
        this.audio.play('sword');
      }
    }

    if (player.specialRoutineThisFrame) {
      this.useSpecialRoutine(player.specialRoutineThisFrame);
    }

    this.checkScreenTransitions();

    // Map special values are signed: negative values are healing springs,
    // positive values are hazards. Input.c:715-742: checks woundCounter == 0.
    const terrainEffect = this.world.terrainEffectAt(this.screen, player.body);
    if (terrainEffect !== null && player.woundCounter === 0) {
      player.woundCounter = 1;
      if (terrainEffect < 0) {
        player.hp = Math.min(player.hpMax, player.hp - terrainEffect);
      } else if (terrainEffect > 0 && !player.debugMode) {
        player.hp = Math.max(0, player.hp - terrainEffect);
        if (player.hp === 0) player.dead = true;
        this.audio.play('hurt');
      }
    }

    const ctx = {
      world: this.world,
      screen: this.screen,
      player,
      templates: this.templates,
      enemies: this.enemies,
      move: this.move,
    };
    const sword = player.swordBox;

    // Update Enemies & Bosses
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.update(ctx);
      if (enemy.dead) continue;

      // Player-fired missiles hit enemies (EnemyCollision.c:678-793:
      // checkEnemyInterceptWithEnemies). Gated on the explicit flag, not on
      // a missing isEnemy bit - that bit is also absent on ordinary
      // signposts, shopkeepers and item props, which must still fall
      // through to the checks below.
      if (enemy.firedByPlayer) {
        for (const target of this.enemies) {
          if (target.dead || target === enemy || !(target.attributes & ATTR.IS_ENEMY)) continue;
          if (!target.killable || target.ai === AI.DOOR) continue;
          if (overlaps(enemy.body, target.body)) {
            const killed = target.hurt(enemy.damage, enemy.damageType, enemy.x, enemy.y);
            this.audio.play(killed ? 'kill' : 'hit');
            if (killed) this.defeat(target);
            // EnemyCollision.c:727-730: only a missile dies on impact.
            if (enemy.attributes & ATTR.IS_MISSILE) enemy.dead = true;
            break;
          }
        }
        continue;
      }

      if (enemy.holdable && overlaps(player.body, enemy.body)) {
        this.collect(enemy);
        continue;
      }

      // Shop contact trigger (EnemyCollision.c:462-474, Dialogs.c:1762)
      if (enemy.message < 0 && !player.messageCounter && overlaps(player.body, enemy.body)) {
        player.messageCounter = 1;
        const storeIdx = -(enemy.message + 1);
        if (this.stores[storeIdx]) {
          this.currentStore = this.stores[storeIdx];
          this.ui.toggleShop(true);
        }
        continue;
      }

      // Dialog contact trigger (EnemyCollision.c:462-474, Dialogs.c:186)
      if (enemy.message > 0 && !enemy.holdable && !player.messageCounter && overlaps(player.body, enemy.body)) {
        player.messageCounter = 1;
        let text = this.textMsgs[enemy.message - 1] || '';
        if (enemy.message === 5 && enemy.drop) {
          const dropItem = getItem(enemy.drop);
          if (dropItem) text += dropItem.name;
        }
        if (text) {
          this.ui.showDialog('', text);
        }
        continue;
      }

      // Locked doors cannot be cut or shot open; only a key opens them.
      // Input.c:756, 901: 1 hit per swing with hadHitEnemy
      if (sword && enemy.killable && enemy.ai !== AI.DOOR && enemy.flash === 0 && overlaps(sword, enemy.body)) {
        const killed = enemy.hurt(player.attack, player.damageType, player.x, player.y);
        player.hadHitEnemy = true;
        this.audio.play(killed ? 'kill' : 'hit');
        if (killed) this.defeat(enemy);
      }

      if (!enemy.dead && enemy.damage > 0 && overlaps(player.body, enemy.body)) {
        if (player.hurt(enemy.damage, enemy.damageType, enemy.facing, enemy.ai === AI.DYING, this.world, this.screen)) {
          this.audio.play('hurt');
        }
        if (enemy.attributes & ATTR.IS_MISSILE) {
          enemy.dead = true;
        }
      }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);

    // Dying bodies from defeated enemies.
    // EnemyUpdate.c:177-190: auto-pickup if all overlapping tiles are non-standable
    for (const corpse of this.corpses) {
      if (corpse.dead) continue;
      corpse.update();
      if (corpse.dead) continue;
      if (corpse.drop && corpse.legCounter === 14 && this.world.isBoxFullyUnstandable(this.screen, corpse.body)) {
        this.collectDrop(corpse);
        continue;
      }
      if (corpse.drop && overlaps(player.body, corpse.body)) {
        this.collectDrop(corpse);
      }
    }
    this.corpses = this.corpses.filter((c) => !c.dead);

    // The Ambassador's letters set the quest: find the five Mantras and bring
    // them to Castle Blednock.
    const hasAllMantras = MANTRA_CODES.every((c) => player.inventory.some((i) => i.code === c));
    if (!this.victory && hasAllMantras && !this.mantrasReady) {
      this.mantrasReady = true;
      this.hudNote = t('The five Mantras are yours. Bring them to Castle Blednock!');
      this.noteUntil = this.frame + 150;
    }
    if (!this.victory && hasAllMantras && this.screenIndex === CASTLE_BLEDNOCK_SCREEN) {
      this.victory = true;
      // Utils.c:556-557: play sound 131 and 138
      this.audio.play('kill');
      this.audio.play('fanfare');
    }
  }

  draw() {
    const r = this.renderer;
    r.clear();
    r.drawScreen(this.screen);
    r.drawCorpses(this.corpses);
    r.drawEntities(this.player, this.enemies);

    const gridX = this.screenIndex % 16;
    const gridY = Math.floor(this.screenIndex / 16);
    let note = t('SCREEN {n} ({x},{y})', { n: this.screenIndex, x: gridX, y: gridY });
    if (this.noteUntil > this.frame) note = this.hudNote;
    r.drawHud(this.player, note);

    if (this.player.dead) {
      r.drawEndCard(this.renderer.lose, t('Press V to load a saved game'));
    } else if (this.victory) {
      r.drawEndCard(this.renderer.win, t('You brought the five Mantras to Castle Blednock'));
    }
  }
}

async function boot() {
  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('overlay-screen');
  const message = document.getElementById('overlay-msg');
  const button = document.getElementById('start-btn');
  const openButton = document.getElementById('open-btn');
  const debugToggle = document.getElementById('debug-mode');

  message.textContent = t('Loading assets...');
  button.disabled = true;

  applyDocumentStrings();
  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.value = getLang();
    langSelect.addEventListener('change', () => {
      setLang(langSelect.value);
      location.reload();
    });
  }

  let assets;
  try {
    assets = await loadAssets();
  } catch (err) {
    message.hidden = false;
    message.textContent = t('Could not load assets: {err}', { err: err.message });
    return;
  }

  initItems(assets.items);
  const game = new Game(assets, canvas);
  window.mantra = game; // debug handle
  game.draw();
  message.hidden = true;
  button.disabled = false;

  const story = document.getElementById('story-screen');
  const storyButton = document.getElementById('story-btn');
  let gameStarted = false;

  const startGame = async () => {
    if (gameStarted) return;
    gameStarted = true;
    game.touch.setVisible(true);
    await game.audio.start();
    await game.audio.playMusic(game.world.musicIndexAt(game.screen));
    run(game);
  };
  game.startGame = startGame;

  const applyDebugMode = () => {
    game.debugMode = debugToggle.checked;
    game.player.debugMode = debugToggle.checked;
    if (debugToggle.checked) {
      game.player.hp = game.player.hpMax;
      game.player.stamina = game.player.staminaMax;
    }
  };

  debugToggle.addEventListener('change', applyDebugMode);

  button.addEventListener('click', () => {
    applyDebugMode();
    overlay.classList.add('hidden');
    story.classList.remove('hidden');
  });

  openButton.addEventListener('click', () => {
    applyDebugMode();
    overlay.classList.add('hidden');
    game.ui.toggleSave(true);
  });

  storyButton.addEventListener('click', async () => {
    story.classList.add('hidden');
    await startGame();
  });
}

function run(game) {
  let previous = performance.now();
  let accumulator = 0;

  function loop(now) {
    accumulator += now - previous;
    previous = now;
    let steps = Math.min(Math.floor(accumulator / FRAME_MS), MAX_CATCHUP_FRAMES);
    accumulator -= steps * FRAME_MS;
    if (accumulator > FRAME_MS * MAX_CATCHUP_FRAMES) accumulator = 0;
    while (steps-- > 0) game.tick();
    game.draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

boot();
