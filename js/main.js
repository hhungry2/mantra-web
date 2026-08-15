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
    this.lastMessageEntity = null;
    this.screenIndex = index;
    this.screen = this.world.screen(index);
    // Bosses need no special casing: they sit in the screen's own enemy slots
    // with a movementType of 50 or above.
    this.enemies = spawnScreen(this.screen, this.defeatedMasks[index], (slotIndex) => {
      this.defeatedMasks[index] &= ~(1 << slotIndex);
    });
    this.corpses = [];
    // Locked doors keep their bodies on the movement collision layer until
    // a key opens them. Bodies cover the full 32x32 tile to prevent slipping past.
    this.world.closedDoors = [];
    for (const e of this.enemies) {
      if (e.ai !== AI.DOOR) continue;
      const body = box(e.x, e.y, TILE, TILE);
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
    this.player.special = d.specialCode ? getItem(d.specialCode) : null;
    this.player.armor = d.armorCode ? getItem(d.armorCode) : null;
    this.player.rings = (d.ringCodes || []).map((code) => getItem(code)).filter(Boolean);

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
    // Also clear any duplicate chests/items at the exact same location
    for (const other of this.enemies) {
      if (other !== enemy && other.holdable && other.x === enemy.x && other.y === enemy.y) {
        other.dead = true;
        if (other.slotIndex >= 0) {
          this.defeatedMasks[this.screenIndex] |= (1 << other.slotIndex);
        }
      }
    }

    const item = getItem(enemy.drop);
    if (!item) return;
    const isMoney = !!(item.attributes & FLAG.MONEY);
    this.player.addItem(item);
    // EnemyCollision.c:479-493: 133 always plays, money adds 137 on top.
    this.audio.play('item');
    if (isMoney) this.audio.play('money');
    this.hudNote = t('FOUND {name}', { name: item.name.toUpperCase() });
    this.noteUntil = this.frame + 50;

    let text = enemy.message > 0 ? (this.textMsgs[enemy.message - 1] || '') : null;
    // Dialogs.c:186: message 5 appends deadItem name
    if (text && enemy.message === 5 && enemy.drop) {
      const dropItem = getItem(enemy.drop);
      if (dropItem) text += dropItem.name;
    }
    // EnemyCollision.c:496-499: isMessage items immediately display item description
    if (text) {
      this.ui.showDialog('', text);
    } else if (item && (item.attributes & FLAG.MESSAGE) && item.desc) {
      this.ui.showDialog('', item.desc);
    }
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
    //
    // Everything else leaves a body carrying whatever deadItem named, money
    // included. The original hands nothing over on the spot: the corpse
    // template (2056) is spawned with canBeHeld set, so the drop is only
    // collected once Saric actually walks onto the body and
    // checkEnemyInterceptWithSaric fires (EnemyCollision.c:477-509). Coins
    // are not a special case there - isMoney only decides that the value is
    // banked rather than carried, and that sound 137 plays on top of 133.
    if (enemy.ai !== AI.DOOR && !isMissile) {
      this.corpses.push(new Corpse(enemy, getItem(enemy.drop)));
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
    // EnemyCollision.c:479-493: 133 always plays for a pickup, and money
    // stacks 137 on top of it rather than replacing it.
    this.audio.play('item');
    if (isMoney) this.audio.play('money');
    this.hudNote = t('FOUND {name}', { name: item.name.toUpperCase() });
    this.noteUntil = this.frame + 50;

    // EnemyCollision.c:496-499: isMessage items immediately display item description
    if (item && (item.attributes & FLAG.MESSAGE) && item.desc) {
      this.ui.showDialog('', item.desc);
    }
  }

  collectDrop(corpse) {
    if (!corpse || !corpse.drop) return;
    const drop = corpse.drop;
    corpse.drop = null;
    this.giveDrop(drop);
  }

  winGame() {
    if (this.victory) return;
    this.victory = true;
    this.audio.play('fanfare');
    this.ui.showDialog(t('VICTORY!'), t('Congratulations! You defeated Zarin and restored peace to Mantra!'));
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
    const hit = box(player.x + dx * reach, player.y + dy * reach, 28, 28);
    const doors = this.enemies.filter((e) => !e.dead && e.ai === AI.DOOR && overlaps(hit, e.doorBlock || e.body));
    if (doors.length === 0) {
      this.hudNote = t('NOTHING HERE');
      this.noteUntil = this.frame + 25;
      return false;
    }

    // Unlock ALL door entities at this location (handles duplicate door slots in map data)
    for (const door of doors) {
      door.dead = true;
      if (door.slotIndex >= 0) {
        this.defeatedMasks[this.screenIndex] |= (1 << door.slotIndex);
      }
      this.world.closedDoors = this.world.closedDoors.filter((b) => b !== door.doorBlock);
    }

    this.audio.play('key');

    // Consume 1 key from inventory quantity
    const keyItem = player.inventory.find((i) => i.code === 150);
    if (keyItem) {
      keyItem.quantity = (keyItem.quantity || 1) - 1;
      if (keyItem.quantity <= 0) {
        const idx = player.inventory.indexOf(keyItem);
        if (idx >= 0) player.inventory.splice(idx, 1);
      }
    }
    if (player.special?.code === 150 && !player.inventory.some((i) => i.code === 150)) {
      player.special = null;
    }

    this.hudNote = t('UNLOCKED!');
    this.noteUntil = this.frame + 50;

    if (this.ui && this.ui.inventoryOpen) {
      this.ui.renderInventoryItems();
      this.ui.updateStatsDisplay();
    }
    return true;
  }

  // powerMantraItem: the Force Mantra wounds every killable enemy on the
  // screen by 20, sparing the door guards, corpses and the final boss. The
  // original only plays the off-hand trigger sound (128) here.
  powerMantra() {
    const spared = new Set([AI.NONE, AI.DYING, AI.DOOR, AI.FINAL_BOSS]);
    for (const enemy of this.enemies) {
      if (enemy.dead || spared.has(enemy.ai)) continue;
      if (!(enemy.attributes & ATTR.IS_ENEMY) || !(enemy.attributes & ATTR.KILLABLE)) continue;
      const killed = enemy.hurt(20, 253);
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
    const onDifferentDoorTile = door
      && (door.screen !== this.screenIndex
        || door.tileX !== playerTileX
        || door.tileY !== playerTileY);
    if (onDifferentDoorTile) {
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
    player.update(this.input, this.world, this.screen, this.enemies);
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

    if (player.specialFiredThisFrame) {
      const item = player.specialFiredThisFrame;
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
      onWinGame: () => this.winGame(),
      onSelfDefeat: (e) => this.defeat(e),
    };
    const sword = player.swordBox;

    // Update Enemies & Bosses
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.update(ctx);
      if (enemy.dead) continue;

      // Pushable enemies (EnemyCollision.c:980-1076: checkEnemyPushing)
      if (enemy.attributes & ATTR.PUSHABLE) {
        let bumpX = enemy.x;
        let bumpY = enemy.y;
        switch (player.dir) {
          case 0: bumpX += 4; break;
          case 1: bumpX -= 4; break;
          case 2: bumpY -= 4; break;
          case 3: bumpY += 4; break;
        }
        const bumpBox = box(bumpX, bumpY, enemy.body.w, enemy.body.h);
        if (overlaps(bumpBox, player.body)) {
          let pushDx = 0;
          let pushDy = 0;
          const speed = enemy.pushableSpeed || 2;
          switch (player.dir) {
            case 0: pushDx = -speed; break;
            case 1: pushDx = speed; break;
            case 2: pushDy = speed; break;
            case 3: pushDy = -speed; break;
          }
          this.move(enemy, pushDx, pushDy);
        }
      }

      // Player-fired missiles hit enemies (EnemyCollision.c:678-793:
      // checkEnemyInterceptWithEnemies). Gated on the explicit flag, not on
      // a missing isEnemy bit - that bit is also absent on ordinary
      // signposts, shopkeepers and item props, which must still fall
      // through to the checks below.
      if (enemy.firedByPlayer) {
        for (const target of this.enemies) {
          if (target.dead || target === enemy || !(target.attributes & ATTR.IS_ENEMY)) continue;
          if (!target.killable || target.ai === AI.DOOR) continue;
          // EnemyCollision.c:723: insubstantial missiles don't affect insubstantial enemies
          if ((enemy.attributes & ATTR.INSUBSTANTIAL) && (target.attributes & ATTR.INSUBSTANTIAL)) continue;
          if (overlaps(enemy.body, target.body)) {
            const result = target.hurt(enemy.damage, enemy.damageType);
            // EnemyCollision.c:738-769: armor or immunity blocking the hit
            // entirely (result === null) leaves the target untouched - no
            // knockback, no sound.
            if (result !== null) {
              // Input.c:881-899 & EnemyCollision.c:749-769: 16px knockback along attacker facing
              let kx = 0;
              let ky = 0;
              switch (enemy.facing) {
                case 1: kx = 16; break;
                case 2: ky = 16; break;
                case 3: kx = -16; break;
                case 4: ky = -16; break;
              }
              if (kx !== 0 || ky !== 0) this.move(target, kx, ky);

              this.audio.play(result ? 'kill' : 'hit');
              if (result) this.defeat(target);
            }
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
      if (enemy.message < 0) {
        const isTouching = overlaps(player.body, enemy.body);
        if (isTouching) {
          if (this.lastMessageEntity !== enemy && !player.messageCounter) {
            this.lastMessageEntity = enemy;
            player.messageCounter = 1;
            const storeIdx = -(enemy.message + 1);
            if (this.stores[storeIdx]) {
              this.currentStore = this.stores[storeIdx];
              this.ui.toggleShop(true);
            }
          }
          continue;
        } else if (this.lastMessageEntity === enemy) {
          this.lastMessageEntity = null;
        }
      }

      // Dialog contact trigger (EnemyCollision.c:462-474, Dialogs.c:186)
      if (enemy.message > 0 && !enemy.holdable) {
        const isTouching = overlaps(player.body, enemy.body);
        if (isTouching) {
          if (this.lastMessageEntity !== enemy && !player.messageCounter) {
            this.lastMessageEntity = enemy;
            player.messageCounter = 1;
            let text = this.textMsgs[enemy.message - 1] || '';
            if (enemy.message === 5 && enemy.drop) {
              const dropItem = getItem(enemy.drop);
              if (dropItem) text += dropItem.name;
            }
            if (text) {
              this.ui.showDialog('', text);
            }
          }
          continue;
        } else if (this.lastMessageEntity === enemy) {
          this.lastMessageEntity = null;
        }
      }

      // Locked door interaction: auto-unlock if player has key and touches/faces door
      if (enemy.ai === AI.DOOR && !enemy.dead) {
        const [dx, dy] = DIR_VECTORS[player.dir];
        const reach = 16;
        const hit = box(player.x + dx * reach, player.y + dy * reach, 28, 28);
        const isNearDoor = overlaps(hit, enemy.doorBlock || enemy.body) || overlaps(player.body, enemy.doorBlock || enemy.body);
        if (isNearDoor) {
          const hasKey = player.inventory.some((i) => i.code === 150);
          if (hasKey) {
            this.keyUse();
            if (this.ui.inventoryOpen) {
              this.ui.renderInventoryItems();
              this.ui.updateStatsDisplay();
            }
          } else if (this.hudNote !== t('LOCKED DOOR') && this.frame >= this.noteUntil) {
            this.hudNote = t('LOCKED DOOR');
            this.noteUntil = this.frame + 30;
          }
        }
        continue;
      }

      // Locked doors cannot be cut or shot open; only a key opens them.
      // Input.c:756, 901: 1 hit per swing with hadHitEnemy
      if (sword && enemy.killable && enemy.ai !== AI.DOOR && enemy.flash === 0 && overlaps(sword, enemy.body)) {
        const result = enemy.hurt(player.attack, player.damageType);
        // Input.c:868-916: armor or immunity that blocks the hit entirely
        // (result === null) leaves the swing with no effect whatsoever - no
        // knockback, no hadHitEnemy, no sound, same as bouncing off a wall.
        // A boulder with more armor than the swing can clear must stay
        // exactly where it is, not get shoved down the corridor it's
        // blocking by a swing that never actually hurt it.
        if (result !== null) {
          // Input.c:881-899: instantaneous 16px knockback in Saric's facing direction
          let kx = 0;
          let ky = 0;
          switch (player.dir) {
            case 0: kx = -16; break;
            case 1: kx = 16; break;
            case 2: ky = 16; break;
            case 3: ky = -16; break;
          }
          if (kx !== 0 || ky !== 0) this.move(enemy, kx, ky);

          player.hadHitEnemy = true;
          this.audio.play(result ? 'kill' : 'hit');
          if (result) this.defeat(enemy);
        }
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

    this.updateDebugMantras();
  }

  updateDebugMantras() {
    if (!this.player) return;
    let mask = 0;
    MANTRA_CODES.forEach((c, idx) => {
      if (this.player.inventory.some((i) => i.code === c)) {
        mask |= (1 << idx);
      }
    });
    if (mask === this.lastMantraMask) return;
    this.lastMantraMask = mask;
    const slots = document.querySelectorAll('.debug-mantra-slot');
    slots.forEach((slot, idx) => {
      if (mask & (1 << idx)) {
        slot.classList.add('active');
      } else {
        slot.classList.remove('active');
      }
    });
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

  const lvlupButton = document.getElementById('debug-lvlup-btn');
  if (lvlupButton) {
    lvlupButton.addEventListener('click', async () => {
      applyDebugMode();
      overlay.classList.add('hidden');
      story.classList.add('hidden');
      if (!gameStarted) {
        await startGame();
      }
      const needed = Math.max(1, game.player.nextXp - game.player.xp);
      game.player.addXp(needed);
      game.audio.play('level');
      game.hudNote = t('LEVEL UP!');
      game.noteUntil = game.frame + 40;
      game.ui.updateStatsDisplay();
    });
  }

  const screenInput = document.getElementById('debug-screen-input');
  const warpButton = document.getElementById('debug-warp-btn');

  const handleWarp = async () => {
    if (!screenInput) return;
    const target = parseInt(screenInput.value, 10);
    if (!isNaN(target) && target >= 0 && target < game.world.screens.length) {
      applyDebugMode();
      overlay.classList.add('hidden');
      story.classList.add('hidden');
      if (!gameStarted) {
        await startGame();
      }
      game.enter(target);
      game.audio.playMusic(game.world.musicIndexAt(game.screen));
      game.hudNote = t('SCREEN {n} ({x},{y})', {
        n: target,
        x: target % 16,
        y: Math.floor(target / 16),
      });
      game.noteUntil = game.frame + 60;
    }
  };

  if (warpButton) warpButton.addEventListener('click', handleWarp);
  if (screenInput) {
    screenInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleWarp();
    });
  }

  const mantraContainer = document.getElementById('debug-mantras');
  if (mantraContainer) {
    mantraContainer.addEventListener('click', async (e) => {
      const slot = e.target.closest('.debug-mantra-slot');
      if (!slot) return;
      applyDebugMode();
      overlay.classList.add('hidden');
      story.classList.add('hidden');
      if (!gameStarted) {
        await startGame();
      }
      const code = parseInt(slot.dataset.code, 10);
      const existingIdx = game.player.inventory.findIndex((i) => i.code === code);
      if (existingIdx >= 0) {
        const removed = game.player.inventory.splice(existingIdx, 1)[0];
        game.hudNote = t('LOST {name}', { name: removed.name });
        game.audio.play('hit');
      } else {
        const item = getItem(code);
        if (item) {
          game.player.addItem(item);
          game.hudNote = t('FOUND {name}', { name: item.name });
          game.audio.play('mantra');
        }
      }
      game.noteUntil = game.frame + 50;
      game.updateDebugMantras();
      game.ui.updateStatsDisplay();
    });
  }

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

  // Stop/pause audio when tab is backgrounded, hidden, or page is navigating away
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.audio.pause();
    } else {
      game.audio.resume();
    }
  });

  window.addEventListener('pagehide', () => {
    game.audio.pause();
  });

  window.addEventListener('blur', () => {
    game.audio.pause();
  });

  window.addEventListener('focus', () => {
    if (!document.hidden) {
      game.audio.resume();
    }
  });
}

function run(game) {
  let previous = performance.now();
  let accumulator = 0;

  function loop(now) {
    try {
      accumulator += now - previous;
      previous = now;
      let steps = Math.min(Math.floor(accumulator / FRAME_MS), MAX_CATCHUP_FRAMES);
      accumulator -= steps * FRAME_MS;
      if (accumulator > FRAME_MS * MAX_CATCHUP_FRAMES) accumulator = 0;
      while (steps-- > 0) game.tick();
      game.draw();
    } catch (err) {
      console.error('Unhandled game loop error:', err);
    } finally {
      requestAnimationFrame(loop);
    }
  }

  requestAnimationFrame(loop);
}

boot();
