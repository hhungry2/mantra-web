# 6. プレイヤー(Saric)の仕様

`src/Saric.c`(303行)と `src/Saric.h`(37行)。

## 6-1. `initSaric()`(Saric.c:40-99) — 初期状態

| 項目 | 初期値 |
|---|---|
| 位置 `where` | (256,160)-(288,192) = タイル中心(8,5)相当 |
| `spriteRef` | 1000 |
| `health` / `maxHealth` | 10 / 10 |
| `armorValue` | 0 |
| `damage` | 1 |
| `facing` | 0(左) |
| `speed` | 2 |
| `experience` / `nextLevel` | 0 / 20(`kBaseNextLevel`) |
| `level` | 0 |
| `money` | 0 |
| `stamina` / `maxStamina` | 10 / 10 |
| `woundCounter` / `messageCounter` | 0 / 0 |
| `wasOnDoor` | false |

- `itemCharges[i] = g_ItemTemplates[i].charges`(250種すべてに初期チャージをコピー)。
- `itemQuantities[i] = 0`、`itemEquipped[i] = false`。
- `itemEffects[0..2]` をクリア(`spriteRef = 16000`、`quantity = 0` は「存在しない」フラグ)。

> 注意: ブラウザ移植版(mantra-web)では開始地点を画面124(12,7)、HP20/スタミナ100/金50で実装しているが、本Cソースの `initSaric` はHP10/スタミナ10/金0/レベル0である。開始HP等は `newGame()` やセーブデータ側で調整されている可能性がある(コード上 `initSaric` の初期値は上記のとおり)。

## 6-2. `levelUpSaric()`(Saric.c:101-118)

- `health += 5`、`maxHealth += 5`、`level++`、`stamina += 5`、`maxStamina += 5`。
- 次のレベル経験値 `nextLevel`:
  - `nextLevel < kBaseNextLevel * 32`(=640)なら `nextLevel *= 2`(2倍)。
  - 以降は `nextLevel += kBaseNextLevel * 32`(+640、8レベル以降の天井)。

## 6-3. 描画

### 6-3-1. `drawSword()`(Saric.c:120-154)

- `SWORD_OFFSET`(=16)px だけ向き方向へずらした位置に剣スプライト `g_SwordIcons[facing]` を描画。
  - facing 0(左): x = left-16
  - facing 1(右): x = left+16
  - facing 2(下): y = top+16
  - facing 3(上): y = top-16
- 描画位置を `g_Saric.oldSword` に保存。

### 6-3-2. `drawSaric()`(Saric.c:157-180)

- `swordOut` が true なら先に `drawSword()`(剣を体の手前に描く)。
- `wasSwordOut = swordOut` を退避し、`swordOut = false` にリセット(1フレームだけ有効)。
- スプライト: `g_SaricIcons[g_Saric.spriteRef - 1000 + (wasSwordOut * 8)]`。
  - **spriteRef-1000** が基本。剣を出している間は **+8**(8枚分ずれる)。
- `oldPosition` に現在位置を保存。

## 6-4. 特殊アイテムルーチン

### 6-4-1. `runItemSpecialRoutine(itemNumber)`(Saric.c:182-192)

- アイテム104 → `powerMantraItem()`(**breakがないため**そのまま150にフォールスルーして `keySpecialItem()` も実行される)。
- アイテム150 → `keySpecialItem()`。

### 6-4-2. `powerMantraItem()`(Saric.c:194-239) — Mantraの力

- 画面を黄色パレットにフェード(32ステップ×2)。
- 敵リンクリストを走査し、`movementType` が 0/58/13/15 以外で `killable && isEnemy` の敵に **health -= 20**。

### 6-4-3. `keySpecialItem()`(Saric.c:241-308) — 鍵

- Saricの向きに `SWORD_OFFSET` 先の矩形(剣のヒットボックスと同じ位置)を作る。
- 敵リンクリストを走査し、`testIntercept` で当たった敵が `movementType == doorEnemy` なら:
  - `next->health = 0`(扉が開く)
  - 効果音 `playSoundEffect(134)`
  - `itemQuantities[150]--`、0以下なら `itemEquipped[150] = false`(鍵の消費)

## 6-5. `killSaric()`(Saric.c:310-317)

- `loseGame()` を呼び、ゲーム終了(敗北画面へ)。
