# Mantra移植メモ

## 1. 湖・回復泉・地形ダメージ

原作の `src/Input.c` では、毎フレームSaricの矩形が重なっているタイルを走査し、次の条件を満たすタイルに対して `special` を適用する。

- `modifiers & doesDamage` が立っている
- 扉ではない
- `woundCounter == 0`

処理は `health -= special` であるため、`special` は符号付きの効果量になる。

- `special = -1`: HPを1回復
- `special = -2`: HPを2回復
- `special = -5`: HPを5回復
- 正値: その値だけHPを減らす
- 回復後も最大HPを超えない
- 適用後は `woundCounter` が30フレーム経過するまで再適用しない（被弾無敵と共有）

抽出済みマップでは、扉を除く効果タイルに `-1` が37箇所、`-2` が2箇所、`-5` が3箇所、`+10` が1箇所ある。

現行実装では `js/map.js` がSaricの矩形に重なる最初の効果タイルを返し、`js/main.js` が負値を回復、正値を地形ダメージとして30フレーム間隔で適用する。原作ソースにある下2行（`y >= 8`）を走査しない挙動（`Input.c:721`）も保持している。

参照:
- `src/Input.c:692-701` — `woundCounter` の進行と解除
- `src/Input.c:714-740` — 効果タイルの走査、回復/ダメージ、最大HP制限
- `include/GameTypes.h:174-180` — `doesDamage` の定義

---

## 2. 敵の飛び道具発射 (`canFire` / `fireEnemy`)

通常敵の射撃は、毎フレームではなく歩行アニメーション周期 `legCounter >= 32` に達した瞬間（歩行アニメーション1周＝約32フレーム）に判定される。

- 発射条件: `(attributes & canFire) && (legCounter >= 32)`
- 射撃確率:
  - `firePhase == 0`: `(generateRand() & 0x0F) == 0` (1/16)
  - `firePhase != 0`: `(generateRand() & 0x07) == 0` (1/8)
- 敵の弾丸は敵テンプレート（`enemies.json`）からインスタンス化され、`isMissile` 属性が付与される。

参照:
- `src/EnemyUpdate.c:138-164` — 射撃ゲートと発射処理
- `src/EnemyUpdate.c:30-76` — `fireEnemy()` 関数

---

## 3. ショップおよび会話の接触トリガー

マップ上の NPC・看板・店主との接触判定は `EnemyCollision.c` で処理される。

- `enemy.message < 0`:
  - 店主。インデックス `-(enemy.message + 1)` のショップを開く。
  - `Dialogs.c:1762`
- `enemy.message > 0`:
  - 会話NPC / 看板。`TextData` からメッセージを表示。
  - `enemy.message == 5` の場合はメッセージ末尾に `deadItem` のアイテム名を付加して表示（「〜を授けよう」）。
  - `Dialogs.c:186-210`
- 閉じた直後の即時再オープンを防ぐため、`messageCounter = 1`（10フレーム間隔）を設定。
  - `src/Input.c:704-712`

---

## 4. 戦闘・ステータス計算式

### 4-1. 初期ステータスとレベルアップ
- 初期値: `hp = 10`, `hpMax = 10`, `stamina = 10`, `staminaMax = 10`, `xp = 0`, `level = 0`, `gold = 0`, `baseAttack = 1`, `baseDefense = 0`。
- レベルアップ (`levelUpSaric`):
  - `hp += 5`, `hpMax += 5`, `stamina += 5`, `staminaMax += 5`
  - 攻撃力・防御力の底上げは行われない（装備のみで上昇）。
  - 必要XP: `nextXp` は 640 まではレベルごとに倍増（20 → 40 → 80 → 160 → 320 → 640）、以降は 640 ずつ加算。
- 参照: `src/Saric.c:40-99` (`initSaric`), `src/Saric.c:101-118` (`levelUpSaric`)

### 4-2. スタミナと移動速度
- 歩行速度: 2 + `speedBonus`
- 走行速度: 6 + `speedBonus`（歩行の3倍速）
- 走行中は `runCounter` が毎フレーム加算され、`runCounter > 30` で `stamina--`。
- 非走行中は `sitCounter` が毎フレーム加算され、`sitCounter > 30` で `stamina++`（最大値まで回復）。
- 参照: `src/Input.c:655-675`, `src/Input.c:1032-1060`

### 4-3. ダメージ計算と `incrementalDamageCounter`
- 正味ダメージ: `i = temp->damage - armor`
- 攻撃が防御を貫通しない場合 (`i <= 0`):
  - `incrementalDamageCounter++`
  - `incrementalDamageCounter >= 5` に達すると 1 ダメージを与え、カウンターを 0 にリセット。
- 耐性判定:
  - `#define CHECK_IMMUNITIES(a,b) ((b)&(~(a)))`
  - 属性ダメージが対象の耐性ビットマスクに阻まれる場合、ダメージは 0。
- 参照: `src/EnemyCollision.c:512-535`, `src/Input.c:868-871`

### 4-4. 被弾ノックバックと `woundCounter`
- 敵接触でダメージを受けた場合、加害敵の `facing` 方向へ固定 8px のノックバック（移動先が歩行可能タイルの場合のみ）。
- 被弾時 `woundCounter = 1`（30フレーム硬直/無敵）。0ダメージ接触時は `woundCounter = 10`（20フレーム）。
- 参照: `src/EnemyCollision.c:544-571`, `src/Input.c:693-701`

### 4-5. 武器の連打制御・スタミナ消費・チャージ・HP回復
- 1押下1ヒット: 抜刀中に敵に当たると `hadHitEnemy = true` となり、ボタンを離すまで次のヒット判定が発生しない。
- `rateOfFire`: `fireCounter >= item.rate` に達するまで再抜刀・再使用不可。
- スタミナ消費: 抜刀時に `item.stamina` を消費。不足している場合は抜刀不可。
- チャージ消費 (`attributes & 256`): 使用ごとに `currentCharges--`。0になると `quantity--` され、初期チャージにリセット。数量が0になるとインベントリから消滅・装備解除。
- HP回復 (`item.heal`): 抜刀/使用時に `health += item.heal`。
- 参照: `src/Input.c:749-1030`

---

## 5. 撃破済み敵の再出現 (`ATTR.PERMANENT`)

- `attributes & permanent` (64) を持つ敵は、撃破済み（`defeatedMask` にビットが立っている）であっても、画面突入時に 1/16 の確率（`generateRand() & 0x0F == 0`）で復活する。
- 復活時は `defeatedMask` の該当ビットがクリアされる。
- 参照: `src/Map.c:96-107`

---

## 6. その他・細部の挙動

- **死体ドロップ自動取得**: 死体の矩形に重なるすべてのタイルが歩行不可（`standable == 0`）の場合に限り、即時にドロップが回収される（`src/EnemyUpdate.c:177-190`）。
- **効果音**: 死亡音は鳴らさず、勝利時は 131（敵撃破）と 138（ファンファーレ）が続けて鳴らされる（`src/Utils.c:556-557`）。
- **ヘルプ画面**: Hキーで `assets/ui/help.png` を表示し、Escapeやクリック等で閉じる（`src/Utils.c:281-297`）。
