# 4. メインループと入力処理

`src/main.c`(354行)と `src/Input.c`(1,115行)の仕様。

## 4-1. メインループ(main.c)

### 4-1-1. ループ構造

```
for(;;) {                        // ゲーム全体
  if (!showOpeningScreen(first)) break;   // タイトル。false=終了
  g_GameInProgress = 1;
  playMusic(g_MapRegions[g_CurrentScreen].musicIndex);
  install_int(timerInc, 1000);   // 1秒毎に g_GameplayTime++

  for(;;) {                      // ゲームプレイ
    if (!checkKeys()) break;     // 入力処理。false=ポーズ
    updateEnemies();             // 敵AI
    if (!g_GameInProgress) break; // 勝利/敗北
    displayCurrentMapScreen();   // 描画(1フレーム目はフェード付き)
    updateSound();               // MOD再生進行
    rest(40);                    // 25fps
  }
  fadeToBlack(); stopMusic(); remove_int(timerInc);
}
showCredits();
```

### 4-1-2. フレームレート

- `rest(NUM_MILLISECONDS_BETWEEN_REFRESH)` = **rest(40ms)** → **25fps固定**。
- タイマ割り込み `install_int(timerInc, 1000)` で1秒ごとにプレイ時間を加算(セーブ用)。

## 4-2. 入力システム(Input.c)

### 4-2-1. ポーリング + 2バッファ方式

- Allegro の `key[]`(キー配列)と `key_shifts`(修飾キー)を毎フレームポーリングし、**前フレーム/現フレームの2バッファ** `g_PrevKeys[30]` / `g_NextKeys[30]`(Input.c:53-54)にコピー。
- `pollKeys()`(Input.c:132-170)が1回呼ぶごとに更新し、エッジはバッファ比較で検出。

| 関数 | 判定 |
|---|---|
| `keyDown(key)` | `g_NextKeys[key]`(押下中) |
| `keyUp(key)` | `!g_NextKeys[key]` |
| `keyPressed(key)` | `g_NextKeys && !g_PrevKeys`(押し下げエッジ) |
| `keyReleased(key)` | `!g_NextKeys && g_PrevKeys`(押し上げエッジ) |
| `keyHeld(key)` | `g_NextKeys && g_PrevKeys` |

- 修飾キー: `POLL_KEYFLAG` で `key_shifts` をビットマスク判定。`MANTRA_KEY_SHIFT`←`KB_SHIFT_FLAG`、`MANTRA_KEY_ALT`←`KB_ALT_FLAG`。
- `initInput()`(Input.c:102-112): 2回ポーリングして初期状態を確定させ、初回の誤エッジ検出を防止。
- マウスも同様にボタン(2個)/位置/縦ホイールを2バッファで追跡(`pollMouseButtons`/`pollMousePosition`/`pollMouseScrollWheel`)。

### 4-2-2. 注意点

- `anyKeyPressed()`/`anyKeyReleased()` は列挙から `MANTRA_KEY_E` が漏れている(Input.c:194-222, 226-253)。
- `mouseMoved()`(Input.c:415-422)は名前と異なり、実際は**縦ホイールの変化**を返す。
- `waitForKeyPressed()`/`waitForSpecificInput()` は `rest(40ms)` でポーリングするため、フレーム同期は25fpsが基準。

## 4-3. `checkKeys()`(Input.c:457-1166) — 1フレームの入力処理

### 4-3-1. 処理順序

1. **`checkForRoomChange()`**(Input.c:468)→ 部屋移動・ドア判定(詳細は05)
2. **`pollKeys()`**(Input.c:481)→ 入力更新
3. UIキー処理(Q/P/ESC/H/I/S/0-7/D)
4. Saricカウンタ更新(legCounter、スタミナ、死亡、レベルアップ、woundCounter、messageCounter)
5. 地形効果タイルの処理
6. 剣の振り(SPACE)
7. オフハンド武器(SHIFT)
8. 走り(ALT)+方向キー移動

### 4-3-2. UIキー

| キー | 処理 |
|---|---|
| Q / P / ESC | `return 0`(ポーズ・ゲームループ脱出) |
| H | `showHelp()` ヘルプ表示 |
| I | `gameDialog(dialogItems, 0)` アイテム一覧 |
| S | `gameDialog(dialogStats, 0)` ステータス |
| 0-7 | `setMusicVolume(n)` BGM音量 |
| D(デベロッパー版のみ) | HP/スタミナ全回復 |
| T(デベロッパー版のみ) | テレポート(未実装・コメントのみ) |

### 4-3-3. Saricの毎フレーム更新(Input.c:648-712)

- `legCounter++`、100超で0へ(足踏みアニメ基準)。
- **スタミナ回復**: `sitCounter > 30` で0リセットし、`stamina < maxStamina` なら `stamina++`。→ **非走行時31フレームに1回復**。
- **スタミナ消費**: `runCounter > 30` で0リセットし、`stamina > 0` なら `stamina--`。→ **走行時31フレームに1消費**。
- **死亡判定**: `health <= 0` → `killSaric(); return 0;`。
- **レベルアップ**: `experience >= nextLevel` → `levelUpSaric()`。
- **woundCounter**(地形/接触ダメージ無敵): 非0なら+1、**30超で0リセット**。
- **messageCounter**: 非0なら+1、**10超で0リセット**(メッセージ表示間隔)。

### 4-3-4. 地形効果タイル(doesDamage)の処理(Input.c:714-742)

```
mapRect = g_Saric.where;
for(i = mapRect.top/32; i <= mapRect.bottom/32; i++)   // 行
  for(j = mapRect.left/32; j <= mapRect.right/32; j++) // 列
```

- タイル範囲: `j < 0 || j > 15 || i < 0 || i > 7` なら continue。→ **列は0-15、行は0-7のみ**(下2行(行8-9)のダメージタイルは判定対象外)。
- 条件: `modifiers & doesDamage` **かつ** `woundCounter == 0` **かつ** `!(modifiers & isDoor)`。
- 適用: `g_Saric.health -= tile.special;`、`woundCounter = 1;`、`health > maxHealth` ならクランプ。
  - **special が正 = ダメージ地形、負 = 回復泉**(HPが回復し maxHealth でクランプ)。
- `woundCounter` は毎フレーム+1されるため、30フレームの無敵期間を挟んで再適用。

### 4-3-5. 剣(メイン武器)の振り(Input.c:749-929)

- トリガー: `keyDown(MANTRA_KEY_SPACE)`(押しっぱなしで連射)。
- `m = itemEffects[0].spriteRef - 16000`(装備中の剣のアイテム番号)。
- 条件: `!hadHitEnemy && itemEquipped[m]`。
- **射撃間隔**: `fireCounter >= rateOfFire` でなければ振らない。
- **スタミナチェック**: 振り始めに `stamina - itemEffects[0].stamina < 0 && stamina > 0` なら不可。
- 振り開始フレームのみ:
  - 効果音 `playSoundEffect(128)`
  - `swordOut = true`、`stamina -= itemEffects[0].stamina`
  - **チャージ武器**(`hasCharges`): `itemCharges[m]--`、0以下なら `quantity--`、数量0で装備解除、`itemCharges[m] = g_ItemTemplates[m].charges` に復元
  - **飛び道具**(`isMissile`): `saricFireEnemy(firedMonsterID)` を発射
  - 回復: `health += itemEffects[0].damageHealed`、maxHealth クランプ
- **攻撃判定**(振りフレーム毎に実行):
  - 合計ダメージ: `i = g_Saric.damage + itemEffects[0].damage + itemEffects[2].damage`
  - 剣のヒットボックス: SaricのRectを `facing` 方向へ `SWORD_OFFSET`(=16)px平行移動した矩形(サイズ拡張なし)
  - 敵リンクリスト走査:
    - `enemyModNum = legState + (isMultiFacing ? (facing-1)*2 + (facing==0?2:0) : 0)`
    - ヒット条件: `legCounter > 15` かつ `testIntercept(...)`(**敵のlegCounterは被弾無敵タイマー**)
    - ダメージ適用: `i - armorValue > 0` かつ `isEnemy` かつ `killable` かつ `CHECK_IMMUNITIES(immunities, damageType)` なら `health -= (i - armorValue)`
    - 討伐: `health <= 0 && !(isMissile)` なら `experience += xp; drawStats();`
    - `legCounter = 0`、向き方向へ `SWORD_OFFSET` 分ノックバック
    - `hadHitEnemy = true`、効果音 `playSoundEffect(130)`
    - `!enemyStandableRect` なら位置を戻す(壁埋め回避)
- スペース非押下時: `hadHitEnemy = false`。

### 4-3-6. オフハンド武器(SHIFT)(Input.c:941-1030)

- 剣と同構造だが**敵への直接ヒット判定ループは無い**。
- `attributes & hasSpecialRoutine` なら `runItemSpecialRoutine(spriteRef - 16000)` を呼ぶ。
  - アイテム番号104 → `powerMantraItem()`(全画面の敵にダメージ+黄色フラッシュ)
  - アイテム番号150 → `keySpecialItem()`(向き先の扉を開ける)

### 4-3-7. 走りと移動(Input.c:1032-1163)

- **走り判定**: `key_shifts & KB_ALT_FLAG`。
  - 走り+スタミナ>0: `isRunning=true; speed = 6 + itemEffects[0..2].speed 合計`
  - 走り+スタミナ0: `speed = 2 + 装備ボーナス`(通常速度)
  - 非走り: `sitCounter++; speed = 2 + 装備ボーナス`
- **方向移動**: 矢印キーの if-else 連鎖で**1フレームに1方向のみ**(4方向、対角なし)。共通処理:
  1. 走行中は `runCounter++`
  2. `oldRect` 保存 → `offsetRect(&where, ±speed, 0)` または `(0, ±speed)`
  3. `!standableRect(g_Saric.where)` なら元に戻す(衝突)
  4. `spriteRef` を向きに応じて設定(左=1000, 右=1001, 下=1002, 上=1003 に `legState*4` 加算)
  5. `facing` 設定(0=左, 1=右, 2=下, 3=上)
  6. `legCounter > 4` なら `legState` を反転し `legCounter = 0`(5フレーム毎の足踏み切替)
