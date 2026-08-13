# 7. 敵システム

`src/Enemies.c`(620行)、`src/EnemyUpdate.c`(2,106行)、`src/EnemyCollision.c`(1,097行)の仕様。

## 7-1. 敵の管理(Enemies.c)

### 7-1-1. リンクリストとハンドル

- 敵は `EnemyHandle`(== `Enemy**`)による**双方向リンクリスト**で管理。
- `g_FirstEnemy` が常設のヘッダノード。`clearEnemies()`(L41-54)はヘッダの次から辿って全敵を `freeHandle` で解放し、`nextEnemy = NULL` に戻す。

### 7-1-2. `updateEnemies()`(Enemies.c:145-289)

**第1パス(死亡処理)**:
- `health <= 0` の敵: `isEnemy` なら `g_EnemiesInRoom--`。
- `originalToRoom` 属性なら **`g_DeathRecord[g_CurrentScreen] &= ~(1 << originalNumber)`**(撃破記録のビットクリア)。
- `dyingEnemy` でも `isMissile` でも `canBeHeld` でもない敵は `killCurrentEnemy()` で死亡アニメ敵を生成(飛び道具は即消滅、拾える物はアイテム化)。
- リンクを外し `freeHandle`。

**第2パス(AIディスパッチ)**:
- `movementType` の switch で各AI関数を呼ぶ(詳細は7-2)。
- 各更新後に `if(!g_GameInProgress) return;`(ゲーム中断時は即処理中止)。

### 7-1-3. `killCurrentEnemy()`(Enemies.c:95-142) — 死亡アニメ

- `doorEnemy` は即 return(扉は消えない)。
- テンプレート **2056**(インデックス56「瀕死/死」)からコピーし、リスト先頭へ挿入。
- 初期化: `movementType = dyingEnemy`、`attributes |= insubstantial`、`facing = 0`、`deadItem = 元の敵のdeadItem`、`theta = 0`、`disFromUnitCircle = 100`。
- 効果音 `playSoundEffect(131)`、`g_EnemiesInRoom++`。

### 7-1-4. `fireEnemy()`(Enemies.c:291-435) — 敵の発射

- `g_EnemiesInRoom > MAX_ENEMIES_ON_SCREEN(16)` なら発射しない。
- テンプレート `g_TmplEnemies[currentEnemy->firedEnemy - 2000]` からコピーして新敵を生成。
- 発射位置は親の `facing` と `whichOutlet = abs(shortRand()%2)` で決定:
  - facing 0/1: 通常は右に+32。ボスは右に+64、上下に32×whichOutlet。
  - facing 2: 通常は下に+32。ボスは下に+64、左右に32×whichOutlet。
  - facing 3: 通常は左に-32。ボスはさらに上下に32×whichOutlet。
  - facing 4: 通常は上に-32。ボスはさらに左右に32×whichOutlet。
- 生成位置が立地不可なら破棄。親の直後へリンク挿入、`g_EnemiesInRoom++`。

### 7-1-5. `bossFireEnemy()`(Enemies.c:438-530) — ボスの発射

- 位置は `curTemp->where + 32 * whereIndex`(whereIndex.v×32 が縦、.h×32 が横)。
- `attributes |= isBossEnemy * createdIsBoss` で新敵をボス扱いにするか制御。
- `testStuck` が true のときのみ立地判定。成功時 true。

### 7-1-6. `saricFireEnemy(short id)`(Enemies.c:532-633) — プレイヤーの弾

- テンプレート `id` からコピーし、`attributes &= ~isEnemy`(敵扱いを外す)。
- 死んでいる `dyingEnemy` がリストにいればその位置を再利用、いなければ末尾に追加。
- 開始位置は Saric の位置から `facing` に応じて32pxずらす(弾の向きも設定)。

### 7-1-7. 敵の描画(`drawEnemiesWithBitmap`, Enemies.c:61-93)

- タイルインデックス: `tileIndex = spriteRef + legState - 2000`。
- `isMultiFacing` なら `tileIndex += (facing-1)*2`、`facing == 0` なら更に `+2`。
- `isBossEnemy` は `g_BossIcons`、それ以外は `g_EnemyIcons` から描画。
- アニメーションはスプライトを差し替えるのではなく、タイルインデックスの加算でフレームを切り替える。

## 7-2. 敵AI全22種(EnemyUpdate.c)

### 共通パターン

- **発射ゲート(ほぼ全AI共通)**: `legCounter >= 32` のとき、`attributes & canFire` かつ `shortRand() % (17 - rateOfFire) == 0` なら `fireEnemy()`。その後 `legCounter = 16`。
- **歩行アニメ**: `(legCounter/4)*4 == legCounter` のとき `legState = 1 - legState`(legCounterが4の倍数でトグル)。
- **衝突チェック4連**: `checkEnemyInterceptWithSaric + checkEnemyInterceptWithMap + checkEnemyInterceptWithEnemies + checkEnemyPushing` の戻り値を加算して `stopped` に(コメントで「||にすべき」と注記あり)。
- **ミサイルの死亡**: `stopped` 時に `(attributes & isMissile) == isMissile` なら `health = 0`。
- **剣リアクション**: `checkProximityToSword` が true なら `facing = ランダム`、`legCounter = 250`(HP制限用)等。

### 7-2-1. `none=0` / `doorEnemy=15` → `standingMonster`(L45-77)

- 移動なし。Saric接触判定 + 押し判定のみ。発射ゲートあり。

### 7-2-2. `waitingForSaric=11` → `waitingForSaricMonster`(L79-99)

- 移動なし。Saric とのマンハッタン距離 `|top差|+|left差| <= target` で `movementType = movePhase`(近づいたら別のAIに変身)。

### 7-2-3. `directFire=12` → `directFireMonster`(L240-355)

- 初回のみ弾道計算: `x = Saric.left - enemy.left`、`y = Saric.top - enemy.top` から
  `angledCourse.h = abs(speed*x/(abs(x)+abs(y)))`、同様に v(斜辺比例で速度分解)。
- 符号を復元。facing決定: `|h|-|v|>0` なら h の符号で右(1)/左(3)、それ以外は v の符号で下(2)/上(4)。
- `offsetRect(&where, angledCourse.h, angledCourse.v)` で移動。
- 衝突時: ミサイルは死亡、位置を戻し `angledCourse` をリセット。

### 7-2-4. `randomMovement=1` → `randomMonster`(L359-479)

- 発射ゲート + ランダムfacing(`abs(shortRand()%5)`)。facing 1〜4 の方向に `speed` 移動。
- 衝突時: ミサイル死亡 → `i = ±1` ランダム → 進行方向と**垂直方向に speed*i だけ跳ねる** → 立地不可なら復帰 → facing再ランダム。
- 剣接触で facingランダム・`legCounter=250`。

### 7-2-5. `homing=2` → `homingMonster`(L484-620)

- **縦横軸優先のホーミング**(斜め移動なし)。
- `facing=0` にリセット後、Saric との縦差分で上(2)/下(4)を仮設定し、`|横差| > |縦差|` のとき横差の符号で右(1)/左(3)に上書き。
- 衝突時: 垂直方向への跳ね + 復帰 + facingランダム。剣接触で `legCounter=16`(他AIと違い250でない)。

### 7-2-6. `smart=3` → `smartMonster`(L1066-1103)

- **一切移動しない**(コメントに「even appear to move」とある)。Saric接触と押し判定の戻り値を無視して呼ぶだけ。発射ゲートあり。

### 7-2-7. `gaurdian=4` → `gaurdianMonster`(L900-990)

- `gaurdianRange` は6にクランプ。
- **発射は `legCounter >= 16 + 16*gaurdianRange` のときのみ**(レンジが大きいほど間隔が空く)。
- 発射後 `facing = facing+2` で**Uターン**(facing>4なら-4)、`legCounter=16`。
- 移動速度は `speed*2`。
- 衝突時: ミサイル死亡 + 位置を戻すだけ。

### 7-2-8. `circular=5` → `circlingMonster`(L992-1061)

- 発射ゲートあり。
- 円運動: `facing = ((legCounter/2)%4)+1`、`legState = legCounter%2`、`legCounter%16 > 7` なら `facing=5-facing`(往復)。
- `theta += speed`。**目標点**: `dest.left = 256 + cosof[theta]*disFromUnitCircle/32768`、`dest.top = 160 + sineof[theta]*disFromUnitCircle/32768` = 画面中央(256,160)を中心とする円周上。
- 移動は `where += (dest - where)/2`(円へ追従)。衝突時: ミサイル死亡のみ。

### 7-2-9. `bumpTurn=6` / `semibumpTurn=9` → `bumpTurnMonster`(L624-749)

- 発射ゲート + legStateトグル。`semibumpTurn` のみ、1/100の確率でランダム方向転換。
- 移動: `facing==0` ならランダム化してそのまま case 1(右)にフォールスルー。
- 衝突時: 垂直跳ね + 復帰 + facingランダム。剣接触で `legCounter=250` + facingランダム。

### 7-2-10. `semihoming=7` → `semihomingMonster`(L752-896)

- 発射ゲート後に `facing = abs(shortRand()%7)`(0〜6)。`facing > 4` のときだけ homingMonster と同じ追尾計算 =「たまにだけホーミング」。
- 移動・衝突・剣は bumpTurn とほぼ同型。

### 7-2-11. `linear=8` → `linearMonster`(L1106-1180)

- 発射ゲート + legStateトグル。`facing` 方向に `speed` で直進、`facing==0` はランダム化して右へ。
- 衝突時: ミサイル死亡、位置復帰、facingランダム(跳ね返しなし)。

### 7-2-12. `dyingEnemy=13` → `dyingMonster`

- 死亡アニメ専用。`killCurrentEnemy()` が生成。

### 7-2-13. `waitingForTime=10`

- `updateEnemies()` 内で **実装がコメントアウトされており何も動作しない**(Enemies.c:240-242)。

### 7-2-14. ボス8種

#### `hiveBoss=50` → `hiveBossMonster`(L1331-1405)

- 発射: `canFire && (movePhase & 12)` のとき (2,2) 方向へ `bossFireEnemy(..., testStuck=true, createdIsBoss=false)`(movePhaseのbit2/bit3で発射)。
- 円運動: `circlingMonster` と同型だが**中心がSaricの座標**: `dest.left = Saric.left-16 + cosof[theta]*disFromUnitCircle/32768`、移動は `(dest-where)/8`。
- 衝突時: ミサイル死亡のみ。

#### `crabBoss=51` → `crabBossMonster`(L1407-1585)

- 発射: `canFire && (movePhase & 4)==0` のときテンプレート **2024** を (1,1) と (0,1) の2連射。
- 移動は2フェーズ:
  - `movePhase & 3`(bit0/bit1)が立っているとき: `angledCourse` リセットし facing 方向へ `speed` で移動。
  - 立っていないとき: Saric へ**速度10**の弾道計算で斜め移動。
- 衝突時: 垂直跳ね → **最後に `where = oldRect` で必ず元位置へ戻す**(コメント「previous part pointless」)。剣接触で facingランダム・`legCounter=250`。

#### `blobBoss=53` → `blobBossMonster`(L1185-1326)

- **瀕死分裂**: `health <= 10` で4体の小型ブラブを (0,0),(0,1),(1,0),(1,1) に `bossFireEnemy(firedEnemy, testStuck=false, createdIsBoss=false)`、直後に `health=0`。
- 発射: `canFire && !(movePhase & 4)` のとき (-1,-1),(-1,2),(2,-1),(2,2) の4方向(bit2が立つと休止)。
- その後 facingランダム、`legCounter=16`、`movePhase++`。移動・衝突・剣は bumpTurn 系と同型。

#### `sentryBoss=54` → `sentryBossMonster`(L1588-1678)

- `legCounter++` と同時に `theta++`。`facing = 4`(上向き固定)。
- 発射: **`theta == 12`** のとき、`canFire && !(movePhase % 2)` ならテンプレート **2007** を (1,-2) へ `bossFireEnemy(..., testStuck=false, createdIsBoss=true)`(ボス扱いの弾)。
- `theta >= 16` で `movePhase++`、`theta=0`。
- 移動: `movePhase % 2` で左へ `speed*2`、それ以外は右へ `speed*2`(左右往復)。
- 衝突時: Saric接触と敵接触の戻り値は無視し、Map接触と押しのみを `stopped` に。stopped なら位置復帰。

#### `linearBoss=55` → `linearBossMonster`(L1681-1758)

- `linearMonster` と完全同型。衝突時: 位置復帰・facingランダム。

#### `rhinoBoss=56` → `rhinoBossMonster`(L1760-1942)

- 発射: `canFire && (movePhase&4)==0` のとき、facingに応じて発射位置を変える(facing 0/1→(2,0)、2→(0,2)、3→(-1,0)、4→(0,-1))。テンプレート **2040**。
- 移動: `crabBoss` と同じ2フェーズ。`movePhase & 3` で facing 直進、それ以外は Saric へ**速度7**の弾道計算で斜め追尾(突進)。
- 衝突時: 垂直跳ね → 位置復帰 → facingランダム。剣接触で facingランダム・`legCounter=250`。

#### `elementalBoss=57` → `elementalBossMonster`(L1944-2018)

- 発射ゲート + legStateトグル。facing 直進(`facing==0` はランダム化して右へ)。
- 衝突チェック: Saric と敵の接触は戻り値無視、**Mapと押しのみ**を `stopped` に。
- `stopped` なら **`health = 0` かつ `attributes |= isMissile`**(マップにぶつかるとミサイル化して消滅)。

#### `finalBoss=58` → `finalBossMonster`(L2025-2135)

- `facing = 2`(下向き固定)、`theta++`。
- **フィールド変形**: 初回かつ `!stuckCounter` かつ `Saric.bottom/32 < 9` のとき、マップタイル (x=6..9, y=9) の `modifiers &= ~standable` で通行不可化し `stuckCounter=1`、同時にテンプレート **2020** を (0,6),(1,6) に発射。
- 発射パターン(`theta >= 15` のとき):
  - `!(movePhase % 4)`: テンプレート **2108** を (0,2),(1,2) に `testStuck=true` で発射。
  - `!((movePhase+2) % 4)`: テンプレート **2035** を (0,2),(1,2) に `testStuck=false, createdIsBoss=true` で発射。
  - `theta=0`、`movePhase++`。`movePhase >= 32` でリセット。
- 衝突チェックは4つとも戻り値無視。
- **`health <= 10` で `winGame()`**(勝利)。

## 7-3. 衝突判定(EnemyCollision.c)

### 7-3-1. `testIntercept()`(EnemyCollision.c:65-225) — スプライトピクセルマスク判定

- 2つの矩形を32×32に正規化(ボスなら右/下を+32して64×64)。
- 水平・垂直分離チェックで早期false。
- 重なり領域の開始行・列と幅 `columns`/`rows` を算出。
- マスクを選択:
  - `testSaricIntercept` → `g_SaricMask`
  - `testEnemyIntercept` → ボスは `g_BossMasks[4096*sprite]`、通常は `g_EnemyMasks[1024*sprite]`
  - `testSwordIntercept` → `g_SwordMasks[1024*sprite]`
  - `testMapIntercept` → `g_TileMasks[1024*sprite]`
- `interceptAsm()`(L41-61)で重なり領域の全ピクセルを走査し、**両方のマスクが非ゼロなら true**。
- = 矩形判定 + 透過ピクセル判定の精密な当たり判定。

### 7-3-2. `standableRect(Rect)`(L236-431) — Saricの立地判定

- 対象Rectをタイル座標に変換し、**敵との衝突ループ**:
  - `insubstantial` の敵はスキップ。
  - `testIntercept` で敵とSaricのマスク判定。
  - 接触時、`woundCounter==0 && isEnemy` ならダメージ計算:
    - `i = next->damage - (armorValue + itemEffects[0..2].armor)`
    - `i <= 0` かつ `dyingEnemy` でないなら `incrementalDamageCounter++`、`woundCounter=1`、**5回で1ダメージ**(チクチクダメージ)。
    - `i > 0 && CHECK_IMMUNITIES(Saric.immunities, next->damageType)` で `Saric.health -= i`、効果音129、`woundCounter=1`。
    - **敵の facing 方向へ Saric を8pxノックバック**。
    - ノックバック先が立地不可なら再帰的に `standableRect` を呼んで復帰(`g_SaricStandableRectHasIterated` フラグで2重再帰防止)。
  - `messageID` があれば `displayMessage(8000,...)` または `gameDialog`(messageID>0で前者)。
  - 接触時は必ず `return false`。
- **マップタイルとの衝突**: 非 standable タイルごとに `testIntercept(タイル vs Saric)`。クリアなら true。

### 7-3-3. `checkEnemyInterceptWithSaric()`(L434-581)

- 敵 vs Saric の接触。接触時:
  1. メッセージ表示。
  2. **アイテム取得**: `deadItem && canBeHeld` なら `itemQuantities[deadItem] += quantity`。`isMoney` なら `money += quantity` + 効果音137。`isMessage` なら `displayItemMessage`。`deadItem = 0`、`dyingEnemy` でなければ `health = 0`。
  3. ダメージ処理(standableRect とほぼ同型、ただし `i<=0` 時の `woundCounter=10`)。
- 接触したら true。

### 7-3-4. `checkEnemyInterceptWithMap()`(L585-672)

- 画面外判定(`top<0||left<0` / `bottom>9||right>15`)。
- ボスは矩形を+1タイル拡張。`insubstantial` は常に false。
- 非 standable タイルのみ `testIntercept`(spriteRef が1000〜1100の範囲外はスキップ)。

### 7-3-5. `checkEnemyInterceptWithEnemies()`(L678-886)

**第1パス(敵同士のダメージ付き接触)**:
- 接触があり、一方が `isEnemy` でもう一方が非 isEnemy(ミサイルvs敵等)かつ両方 `insubstantial` でないとき:
  - `temp` が `isMissile` なら即 `health=0`。
  - `i = temp->damage - next->armorValue`。`i>0 && nextがkillable && next->legCounter > 15 && CHECK_IMMUNITIES` なら `next->health -= i`。
  - 死亡時 `isEnemy` なら `experience += next->xp`。`next->legCounter = 0`、temp の facing 方向へ `SWORD_OFFSET`(16)px ノックバック。
  - 再帰ガード付きで `enemyStandableRect` 確認→不可なら復帰。効果音130。

**第2パス(立ち位置衝突のみ)**: `insubstantial` をスキップし、`temp != next` のとき `testIntercept` で接触なら true。

### 7-3-6. `checkProximityToSword()`(L889-975)

- 剣の矩形を Saric の facing から `SWORD_OFFSET+32`(=48)先に置く。
- 判定条件: `temp->legCounter > 15 && g_Saric.swordOut && testIntercept(敵 vs 剣マスク)`。
- 接触時、敵の oldRect(直前位置)と比較し、**Saricからold位置への距離 > Saricから現在位置への距離**(=敵がSaricに向かって動いている)場合のみ true。離れて行く敵には当たらない。

### 7-3-7. `checkEnemyPushing()`(L980-1076)

- `bumpRect = where` を Saric の facing と逆方向に4pxシフト。
- `pushable` 属性の敵が Saric と重なる場合、敵を Saric の facing 方向へ `pushableSpeed` だけ実際に移動。再帰ガード付き `enemyStandableRect` 不可なら復帰。

### 7-3-8. `enemyStandableRect()`(L1082-1122)

- `pushable` なら `checkEnemyPushing`。
- `checkEnemyInterceptWithSaric` / `checkEnemyInterceptWithMap` / `checkEnemyInterceptWithEnemies` のどれかが true(=接触あり)なら false(立地不可)。

## 7-4. ダメージ計算と免疫のまとめ

- **Saricへのダメージ**: `敵のdamage - (Saric.armorValue + itemEffects[0..2].armor)`。`i<=0` の場合は5回に1回のチクチクダメージ。
- **敵へのダメージ(剣)**: `(Saric.damage + itemEffects[0].damage + itemEffects[2].damage) - 敵armorValue`。
- **敵へのダメージ(敵弾)**: `temp.damage - next.armorValue`。
- **免疫判定**: `CHECK_IMMUNITIES(防御側.immunities, 攻撃側.damageType)` = `攻撃type & ~防御immunities`。非ゼロでダメージが通る。
- **被弾無敵**: 敵は `legCounter > 15` のときのみヒット(被弾で `legCounter = 0`)。Saricは `woundCounter`(30フレーム)。
- **経験値**: 敵を倒すと `g_Saric.experience += enemy.xp`(剣、敵弾、敵同士の死亡すべてで加算される)。
