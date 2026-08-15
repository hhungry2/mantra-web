# 実装不足の是正: 引き継ぎ指示書

> **ステータス:** 本文書に記載されたタスク（A, B, C, D, E, F, G）はすべて実装およびコミットが完了しました。
> 各機能の仕様詳細・数式・Cソース引用は `docs/PORT_NOTES.md` にも整理されています。

この文書は、Mac OS 向け 1995年オリジナル版 Mantra (`original-source/`) の C ソースコードを網羅的に精査し、Web 版 (`mantra-web/`) との間に見つかった実装の抜け漏れ・挙動の差異を整理した引き継ぎ用ドキュメントである。

---

## 完了したタスク一覧

- ✅ **タスクB**: 未抽出敵・アイテムフィールドの抽出 (`immunities`, `damageType`, `movePhase`, `target`, `pushableSpeed`) (`09879eb`)
- ✅ **タスクA**: 通常敵の弾丸発射 (`canFire` / `legCounter >= 32` 周期判定) (`1a3f92c`)
- ✅ **タスクC**: 敵テンプレート (`enemies.json`) の読み込みとミサイルの敵インスタンス化 (`f0e6d94`)
- ✅ **タスクD**: ショップオープン (`message < 0`) および会話接触 (`message > 0`) トリガー (`f9719ad`)
- ✅ **タスクE-1**: Saric 初期ステータスとレベルアップ計算式 (`e1fd41c`)
- ✅ **タスクE-2**: 30フレームスタミナ増減と走行速度 6px (`d3debbd`)
- ✅ **タスクE-3**: `incrementalDamageCounter` と属性耐性計算 (`c6de7ab`)
- ✅ **タスクE-4**: 敵被弾時 8px ノックバックと `woundCounter` の統一 (`50f15aa`)
- ✅ **タスクE-5**: 武器連打制御 (`hadHitEnemy`)・スタミナ消費・チャージ・HP回復 (`96bf0b4`)
- ✅ **タスクF**: 撃破済み `permanent` 敵の画面突入時 1/16 復活 (`7f57967`)
- ✅ **タスクG-1**: 死亡時効果音の修正と勝利時ファンファーレ 131+138 (`fd4eb19`)
- ✅ **タスクG-2**: 未使用の売却 i18n 文字列削除 (`9325df5`)
- ✅ **タスクG-3**: 死体ドロップの全タイル非standable判定 (`b3e577d`)
- ✅ **タスクG-4**: Hキーでのヘルプ画面表示 (`bafeb1e`)

## 0. 最初に読むもの・前提

### 0-1. プロジェクトの性格

1995年 Mac 用アクションRPG「Mantra」(Syzygy Cult) のブラウザ移植。**原作の挙動を忠実に再現する**のが目的であり、「面白くする」「今風にする」ための創作は入れない。判断に迷ったら常に `original-source/src/*.c` が正である。

- `original-source/` — 原作Cソース (SourceForge `syzygymantra` スナップショット)。**唯一の仕様書**。
- `analysis/*.md` — 上記Cソースの日本語解析。既に精度が高いので、Cを読む前にこちらを見ると速い。特に `analysis/11_bugs_notes.md` は原作側のバグ・意図的挙動の一覧。
- `docs/PLAN.md` — 移植の全体計画。
- `docs/PORT_NOTES.md` — 実装済み箇所の根拠メモ。**新たに実装した箇所は、同じ書式でここに追記すること。**
- `js/` — 移植先。ESモジュール、ビルド不要、素の Canvas 2D。

### 0-2. 動かし方

ビルドステップはない。静的サーバを立てて `index.html` を開くだけ。

```bash
python -m http.server 8000
```

ブラウザ確認は Browser ペイン (`preview_start` → `read_console_messages` / `computer` screenshot) を使う。`window.mantra` にGameインスタンスが露出しているので、コンソールから状態を直接叩ける。

```js
mantra.player.hp = 999; mantra.enter(87);   // 例
```

### 0-3. 元データと再抽出（検証済み・実行可能）

`GameData.dat` は `C:\Users\USER\Downloads\Mantra-Windows\` に存在する。以前 `tools/extract_gamedata.py:42` の `INPUT_DAT` がフォルダ二重 (`Mantra-Windows\Mantra-Windows\`) の存在しないパスを指していたが、**修正済み**。

検証結果:

- 復号後の全13ブロブのサイズが `docs/PLAN.md` の記載と完全一致（`MapData` 589,824 / `BossData` 208,896 / `ItemData` 21,144 ほか）。データは無傷。
- **再抽出の再現性を確認済み。** スクラッチ領域で `python tools/extract_gamedata.py` を実行し、生成された12ファイル（PNG 6 + JSON 6）が**コミット済みのものとバイト単位で完全一致**した。差分ゼロ。

これにより、タスクBでフィールドを追加した後の `git diff assets/data/` は、**追加フィールド由来の差分だけ**が出る。既存の値が1つでも動いていたらオフセットの解釈ミスと即断できる。

同フォルダには `Images.dat` / `Sound.dat` / `Music.dat` / `Saved.dat` / `Mantra.exe` も揃っている。

### 0-4. コミット規約

- 1タスク1コミット。タスクを跨いだ変更を混ぜない。
- コミットメッセージは英語の命令形・現在形（既存履歴に合わせる）。例: `Make ordinary enemies fire the missiles their data names`
- 末尾に以下を付ける:

  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

- `main` に直接コミットせず、ブランチを切ること。

### 0-5. 進め方の原則

- **推測でマジックナンバーを置かない。** 現行コードの問題の大半は「原作に値があるのに、それらしい数字を創作した」ことに起因する。値が見つからなければ、創作せずにユーザーに聞く。
- 原作の値を採用したら、**必ずコード中のコメントに `EnemyUpdate.c:374` 形式で出典を書く。** 既存コードはこの慣習を守っている。
- 各タスクの「受け入れ条件」を満たしたことをブラウザ上で実際に確認してから次に進む。テストコードは存在しないので、実機確認が唯一の検証手段。

---

## 1. 用語と座標系の対応表

原作とJSで表現が違う。読み違えると全部ずれるので最初に頭に入れること。

| 概念 | 原作C | 現行JS |
|---|---|---|
| 敵/自機の位置 | `Rect where`（左上基準、32×32） | `x, y`（**中心**基準）+ `body` ゲッタが箱を返す |
| 当たり判定 | `testIntercept()` によるピクセルマスク照合 | AABB (`js/collision.js`) |
| 向き `facing` | Saric: 0=左,1=右,2=下,3=上<br>敵: 0=中立,1=右,2=下,3=左,4=上 | 同じ（**Saricと敵で意味が違う点に注意**） |
| 画面 | `g_CurrentScreen` (0..255) | `game.screenIndex` |
| 撃破記録 | `g_DeathRecord[screen]` ビット**が立っている＝生存** | `defeatedMasks[screen]` ビット**が立っている＝撃破済み**（反転） |
| タイル配列 | 列優先 `[x * 10 + y]` | 行優先 `[y * 16 + x]`（抽出時に並べ替え済み） |
| 1フレーム | `rest(40)` = 25fps | 固定タイムステップ 40ms |

**特に注意:** 原作のタイル添字 `tiles[(j * 10) + i]` は `j`=x, `i`=y である。Cを読むとき `i`/`j` が直感と逆なので毎回確認すること。

### 敵構造体の主要定数

```
kBaseNextLevel        = 20     (GameDefines.h:34)
SWORD_OFFSET          = 16     (GameDefines.h:35)
MAX_ENEMIES_ON_SCREEN = 16     (GameDefines.h:37)
NUM_SCREENS           = 256    (GameDefines.h:20)
```

---

## 2. タスク一覧

優先度順。**A → C → D → E → F** の順で進めるのが自然。**Bは着手可能**（0-3 で検証済み）で、他タスクと独立しているのでいつ入れてもよいが、Dの `waitingForSaric` 修正はBの `target`/`movePhase` に依存する。
FとGは独立しているのでいつでもよい。

---

### タスクA: 通常の敵に弾を撃たせる 🔴最優先

#### 現状

`js/enemy_ai.js:78` の `maybeFire()` は**定義されているだけで、どこからも呼ばれていない**。

```js
// rateOfFire counts down in frames; 0 means the enemy never shoots.
function maybeFire(enemy, ctx, speed) { ... }   // ← 呼び出し元ゼロ
```

射撃を行うのは `AI.HIVE_BOSS` 以降のボス用ルーチンのみ。結果、**マップ上の `canFire` 属性を持つ敵241体が一発も撃たない**。

#### 原作の仕様

射撃は個別AIの機能ではなく、**ほぼ全ての移動ルーチンが共通して持つ定型ブロック**。`randomMonster` / `homingMonster` / `bumpTurnMonster` / `semihomingMonster` / `directFireMonster` / `standingMonster` / `linearMonster` / `gaurdianMonster` などに、以下がそのままコピペされている（例: `EnemyUpdate.c:371-395`）。

```c
temp->legCounter++;

if (temp->legCounter >= 32)
{
    if ((temp->attributes & canFire) == canFire)
    {
        if ((shortRand() % (17 - temp->rateOfFire)) == 0)
        {
            fireEnemy(currentEnemy);
        }
    }
    temp->legCounter = 16;      // 0 ではなく 16 に戻る
}

// legCounter % 4 == 0 で歩行アニメを切り替え
if ((temp->legCounter / 4) * 4 == temp->legCounter)
{
    temp->legState = 1 - temp->legState;
}
```

読み解き:

- `legCounter` は 16→32 を往復するカウンタ。つまり**16フレームに1回**、射撃の抽選が走る。
- 抽選確率は `1 / (17 - rateOfFire)`。`rateOfFire` が大きいほど頻繁。`rateOfFire = 16` だと `17-16 = 1` で毎回必中、`rateOfFire = 0` だと 1/17。
  - `rateOfFire >= 17` だと `% 0` でゼロ除算になるが、**実データを確認済みで問題なし**。配置敵586体・テンプレート65種のいずれも `rateOfFire` は 0〜8 の範囲。防御的にクランプしてもよいが必須ではない。
- `legCounter` は被弾時に 0 にリセットされる（`Input.c:879`）。これがそのまま無敵時間の代わりになっている（`Input.c:864` の `next->legCounter > 15` が「直前に斬られていない」判定）。

#### 実装手順

1. `js/enemy_ai.js` に、全ルーチン共通の前処理として上記ブロックを実装する。個々の `ROUTINES` に散らすのではなく、`run()` の冒頭か `Enemy.update()` に置くのが妥当（原作が全ルーチンに同じコードを持っているため、意味的に等価）。
   - ただし `AI.DYING` (13) と `AI.NONE`/`AI.DOOR` の扱いは原作を確認すること。`standingMonster` (= `none` と `doorEnemy`) は射撃ブロックを**持つ**（`EnemyUpdate.c:58-74`）。`dyingMonster` は**持たない**。
2. `js/enemy.js` の `legCounter` の扱いを原作に合わせる。現行 `enemy.js:119-120` は
   ```js
   this.legCounter++;
   if (this.legCounter % 4 === 0) this.legState = 1 - this.legState;
   ```
   と単調増加しており、16↔32 の往復になっていない。`legState` の切り替えタイミングも実質変わるので合わせる。
3. `Enemy.hurt()` (`js/enemy.js:103`) で `legCounter = 0` にする。併せて `js/main.js:449` の被弾ゲート `enemy.flash === 0` を、原作の `legCounter > 15` に置き換えるか検討する（タスクEと関連）。
4. 射撃の実体は**タスクC**に依存する。Cを先に終わらせるか、暫定的に現行 `EnemyProjectile` を使い、Cで差し替える。

#### 受け入れ条件

- 弓兵・砲台系の敵がいる画面で、実際に弾が飛んでくる。
- `rateOfFire` の大きい敵が明らかに頻繁に撃つ。
- `rateOfFire = 0` の敵も稀に撃つ（撃たないのが正しいわけではない — 1/17 で撃つ）。

#### 落とし穴

- 現行 `js/enemy.js:72` の `this.fireCounter = record.rate || 0` は原作に対応物がない。`maybeFire` 専用の創作なので、実装し直す際に整理すること。
- `shortRand()` は `Utils.c:56`。単なる `rand()` のラッパなので、JS側は `Math.random()` で構わない。

---

### タスクB: 抽出漏れフィールドの追加 🟠高（着手可能・検証済み）

> 0-3 のとおり、元データも再現性も検証済み。そのまま着手してよい。

#### 現状

`tools/extract_gamedata.py:148-171` の `read_enemy()` が、64バイトの `Enemy` 構造体のうち**5つの必要フィールドを読んでいない**。

#### 追加すべきフィールド（5件）

オフセットは `LoadData.c:206-245` の `readEnemy()` の読み出し順から確定させ、**実データをデコードして妥当性を確認済み**。

| フィールド | offset | C型 | struct書式 | 用途 | 実データでの検証結果 |
|---|---|---|---|---|---|
| `immunities` | 28 | `short` | `>h` | ダメージ属性耐性 | 586体中308体が非ゼロ。実際に機能している |
| `damageType` | 30 | `short` | `>h` | 与ダメージ属性 | 475体が非ゼロ（最頻値 12 が240体） |
| `movePhase` | 33 | `char` | `>b` | `waitingForSaric` の変身先 movementType | 該当5体すべて **2**（= `homing`）。有効なAI値 |
| `target` | 43 | `char` | `>b` | `waitingForSaric` の起動マンハッタン距離 | 該当5体すべて **32**（= 1タイル） |
| `pushableSpeed` | 50 | `short` | `>h` | 押せる敵の1回あたり移動量 | 該当5体で 6/4/4/2/2。すべて非ゼロ |

`target = 32` は重要。現行 `js/enemy_ai.js:176` の `distanceToPlayer(...) < 96`（ユークリッド96px）に対し、**原作はマンハッタン距離32**。3倍近く広く、しかも距離の定義自体が違う。

#### ⚠️ `disFromUnitCircle` は抽出してはいけない

当初この6件目も候補に挙げていたが、**誤り**。`Map.c:144-145` の `loadScreen()` は敵の生成時に

```c
(*creationEnemy)->theta = 0;
(*creationEnemy)->disFromUnitCircle = 100;      // ← マップデータの値を使わず定数
```

としており、マップデータ上の値（実測 120/123/172）は**一切参照されない**。`circular` AI の半径は実行時定数 **100** から始まる。抽出せず、`circlingMonster` (`EnemyUpdate.c:992-1065`) の実装時に初期値100として扱うこと。

`loadScreen` が同様にマップデータを無視して定数を入れるフィールド: `originalPosition`(0,0) / `legCounter`(0) / `legState`(false) / `originalNumber`(**= スロット番号 i**) / `theta`(0) / `angledCourse`(0,0) / `stuckCounter`(0)。

> 補足: `originalNumber` が実行時に `i`（スロット番号）で上書きされることは、**現行 `defeatedMasks` がスロット番号でビットを立てているのが正しい**ことの裏付けになる。ここは変更不要。

#### `CHECK_IMMUNITIES` の定義

```c
// Utils.h:27
#define CHECK_IMMUNITIES(a,b)  ((b) & (~(a)))
```

`a` = 受け手の `immunities`、`b` = 与え手の `damageType`。**耐性でカバーされていない属性ビットが1つでも残れば真**（＝ダメージが通る）。値が真であることだけを見ており、残ったビット数でダメージ量を変えたりはしない。

使用箇所は2つ:
- `Input.c:869` — Saricの剣が敵に通るか（`CHECK_IMMUNITIES(next->immunities, g_Saric.damageType)`）
- `EnemyCollision.c:533` — 敵の接触ダメージがSaricに通るか（`CHECK_IMMUNITIES(g_Saric.immunities, temp->damageType)`）

Saric側の `immunities` / `damageType` は `initSaric()` で 0 に初期化され (`Saric.c:72-73`)、装備の `itemEffects` から供給される。**`ItemData` 側にも `immunities` / `damageType` がある** (`GameTypes.h:120-121`) ので、`extract_items()` がこれを読んでいるか確認し、抜けていれば併せて追加すること。

参考: 完全なレイアウト（合計64バイト）

```
0  prevEnemy(4)   4  nextEnemy(4)   8  top(2)   10 left(2)  12 bottom(2) 14 right(2)
16 legCounter(1)  17 legState(1)   18 health(2) 20 armor(1) 21 damage(1) 22 xp(2)
24 attributes(4)  28 immunities(2) 30 damageType(2) 32 speed(1) 33 movePhase(1)
34 gaurdianRange(1) 35 facing(1)   36 rateOfFire(1) 37 originalNumber(1)
38 spriteRef(2)   40 movementType(2) 42 deadItem(1) 43 target(1)
44 origPos.v(2)   46 origPos.h(2)  48 firedEnemy(2) 50 pushableSpeed(2)
52 disFromUnitCircle(2) 54 angledCourse.v(2) 56 angledCourse.h(2)
58 messageID(2)   60 stuckCounter(1) 61 theta(1)  62 expansion2(2)
```

`ItemData` 側にも `immunities` / `damageType` があり (`GameTypes.h:120-121`)、`extract_items()` が読んでいない可能性が高い。併せて確認すること。

#### 実装手順

1. `read_enemy()` に上記**5フィールド**を追加（`disFromUnitCircle` は入れない）。`read_enemy()` は `extract_map()` と `extract_templates()` の両方から使われるので、`map.json` と `enemies.json` の双方に反映される。
2. `extract_items()` の `immunities` / `damageType` の有無を確認し、抜けていれば追加する。
3. `python tools/extract_gamedata.py` を実行。
4. **`git diff assets/data/` で、既存フィールドの値が1つも変わっていないことを確認する。** 0-3 のとおり再現性は検証済みなので、**追加フィールド以外の差分はゼロになるはず**。1つでも動いていたらオフセットの解釈を誤っている。
5. 生成物（PNG含む）をコミット。抽出結果はリポジトリにコミットする方針（`extract_gamedata.py` の docstring 参照）。

#### 受け入れ条件

既に実データでデコード検証済みなので、**下記の具体値がそのまま出れば正解**。

- `assets/data/map.json` の各敵に5フィールドが増えている。
- 追加フィールド以外に差分がない（PNG 6枚 + `gfx.json` / `text.json` / `stores.json` / `items.json` は `immunities` 追加分を除き無変更）。
- `ai == 11` の敵5体（画面 50 スロット0・50 スロット1・51 スロット0・66 スロット1・67 スロット0）が、**すべて `target: 32`, `movePhase: 2`**。
- `pushable` 属性 (16) を持つ敵5体が、**画面31 スロット0→6 / 31 スロット1→4 / 58 スロット0→4 / 223 スロット0→2 / 223 スロット1→2** の `pushableSpeed`。
- `immunities` が非ゼロの敵が308体、`damageType` が非ゼロの敵が475体。

---

### タスクC: 敵テンプレートを読み込み、飛び道具を実体化する 🔴最優先

#### 現状

- `assets/data/enemies.json`（敵テンプレート65種）が**`js/assets.js` のロード対象に入っておらず、ゲームから一度も参照されていない**。
- `js/enemy_ai.js:69-75` の `fireAtPlayer()` は、**撃った側の `damage`** と、`enemy.fires`（テンプレートID）を**スプライトIDとして**使って `EnemyProjectile` を作っている。
  - 全65テンプレートで `id == sprite` が偶然一致しているため描画は通っているが、**damage / speed / HP はすべて誤った値**。

#### 原作の仕様

飛び道具は独立したクラスではなく、**テンプレートから生成された完全な `Enemy`** である (`Enemies.c:291-435` `fireEnemy()`)。

```c
new  = mallocHandle(sizeof(Enemy));
**new = g_TmplEnemies[(*currentEnemy)->firedEnemy - 2000];   // テンプレ丸ごとコピー
temp->where  = curTemp->where;
temp->facing = curTemp->facing;                              // 撃った側の向きを継承
temp->attributes &= ~originalToRoom;
temp->legCounter = 0;  temp->legState = false;
temp->theta = 0;  temp->disFromUnitCircle = 100;
temp->angledCourse.h = temp->angledCourse.v = 0;
```

初期位置は撃った側の `facing` に応じて 32px ずらす（ボスは 64px + `whichOutlet` による 32px の振り分け）。生成位置が `enemyStandableRect()` を満たさなければ**生成をキャンセル**する。`g_EnemiesInRoom > MAX_ENEMIES_ON_SCREEN (16)` でも生成しない。

重要な帰結:

- 飛び道具は `movementType`（多くは `directFire`=12、一部 `linear`=8 / `linearBoss`=55 / `semibumpTurn`=9）を持ち、**自前のAIで動く**。
- 飛び道具は `health` を持ち、**斬って壊せる**。
- `isMissile` (128) が立っているものは、何かに衝突した時点で `health = 0` になる（各AIの `if(stopped)` 節）。
- 撃った側が **`facing` を持つ**ことが前提。原作の `directFireMonster` は初回に `angledCourse` を Saric へのベクトルとして算出する（`EnemyUpdate.c:254-296`）。

抽出済みテンプレートの実例（`isMissile` 属性を持つもの）:

```
id 2014  ai 12  dmg 3   hp 4  spd 4    id 2024  ai 12  dmg 4   hp 1  spd 10
id 2040  ai 12  dmg 5   hp 1  spd 5     id 2042  ai 8   dmg 4   hp 1  spd 5
id 2044  ai 12  dmg 12  hp 1  spd 10    id 2046  ai 12  dmg 10  hp 2  spd 10
id 2035  ai 55  dmg 20  hp 4  spd 16    id 2007  ai 55  dmg 8   hp 4  spd 10
```

#### 実装手順

1. `js/assets.js` の `loadAssets()` に `data/enemies.json` を追加し、`templates` を `id → template` の `Map` にして返す。
2. `js/enemy.js` に、テンプレートから `Enemy` を生成するファクトリを追加する。`Enemy` のコンストラクタは現在マップの敵レコード（`r`/`c` タイル座標を持つ）を前提にしているので、**ピクセル座標を直接指定できる経路**が必要。
3. `enemy_ai.js` の `fireAtPlayer` / `maybeFire` / `ring` を、`EnemyProjectile` ではなく**実体の `Enemy` を敵リストに追加する**方式に置き換える。
   - `ctx` に `spawnEnemy(template, x, y, facing)` を渡すのが素直。`js/main.js:429-435` の `ctx` 構築箇所を変更する。
4. `EnemyProjectile` クラスは役目を失うので削除する。`PlayerProjectile` も同様（後述）。
5. 生成上限 16体、および生成位置が壁なら生成中止、を実装する。
6. `js/main.js` の当たり判定ループは既に「敵」を総なめしているので、飛び道具が敵になれば被弾・撃破処理は自動的に効く。ただし:
   - **`xp` の二重取得に注意。** 原作は `Input.c:873` で `next->health <= 0 && !(next->attributes & isMissile)` の時だけ経験値を与える。飛び道具を壊しても経験値は入らない。
   - 同様に `killCurrentEnemy` (`Enemies.c:172`) は `isMissile` の敵に死体を残さない。

7. **プレイヤー側も同じ仕組みに乗る。** `Input.c:806-809` は
   ```c
   if (g_Saric.itemEffects[0].attributes & isMissile) {
       saricFireEnemy(g_Saric.itemEffects[0].firedMonsterID);
   }
   ```
   で、`saricFireEnemy()` (`Enemies.c:532`) が同じくテンプレートから敵を生成する。`items.json` の `fires` はテンプレートIDである。現行 `js/main.js:391-398` の `PlayerProjectile` 直接生成を置き換える。
   - ⚠️ プレイヤーの弾が敵として生成されると、そのままでは Saric 自身に当たる。`saricFireEnemy()` が `attributes` をどう加工しているか (`Enemies.c:532` 以降) を必ず読んでから実装すること。

#### 受け入れ条件

- 敵の弾のダメージが、撃った敵の接触ダメージではなくテンプレートの値になっている。
- 敵の弾を剣で壊せる。壊しても経験値は入らない。
- 弾が壁に当たって消える。
- 画面上の敵+弾の総数が16を超えない。
- プレイヤーの飛び道具も同じ経路を通り、自分には当たらない。

---

### タスクD: 店と会話を原作の駆動方式に戻す 🟠高

#### D-1. 店

##### 現状

`js/main.js:20-22, 171-176` が「店先タイルID 1030 からのオフセットで店を決める」という**推測ベースの実装**になっており、コメントにも「map-door association は記録されていない」とある。**これは誤りで、記録されている。**

##### 原作の仕様

店主は**負の `messageID` を持つ敵**である。Saricが接触すると:

```c
// EnemyCollision.c:462-474
if (temp->messageID && !g_Saric.messageCounter)
{
    g_Saric.messageCounter = 1;
    if (temp->messageID > 0)
        displayMessage(8000, temp->messageID, temp->deadItem);
    else
        gameDialog(dialogStore, temp->messageID);     // ← 店
}
```

店インデックスへの変換は `Dialogs.c:1762`:

```c
param = -(param + 1);      // messageID -1 → 店0,  -5 → 店4
```

**データによる裏付け（確認済み）:** `assets/data/map.json` 全256画面を走査したところ、`message` が負の敵は **ちょうど5体、値は -1, -2, -3, -4, -5 が各1体ずつ**。`assets/data/stores.json` の店数は5。完全に一致する。

##### 実装手順

1. `js/main.js` の `SHOP_TILE_BASE` と `storeAt()` を削除する。
2. 敵との接触処理（`js/main.js:439-460` のループ内）で、`enemy.message < 0` なら `currentStore = stores[-(enemy.message + 1)]` として `ui.toggleShop(true)` を呼ぶ。
3. `js/main.js:197-202` の `checkInteract()` 内の店判定を削除する。

##### 受け入れ条件

- 5軒の店が、店主に接触することで開く。
- 店先タイルに乗っても何も起きない（そこに店主がいなければ）。
- 5軒それぞれ異なる品揃え（`stores.json` の順）が出る。

#### D-2. 会話

##### 現状

`js/main.js:187-195` — E キーを押し、かつ話者との距離が `READ_RANGE`(40px) 以内のとき表示。

##### 原作の仕様

**接触した瞬間**に自動表示（上記 `EnemyCollision.c:462`）。E キーに相当するものは原作に存在しない。

`messageCounter` による再表示抑止がある（`Input.c:704-712`）:

```c
if (g_Saric.messageCounter) g_Saric.messageCounter++;
if (g_Saric.messageCounter > 10) g_Saric.messageCounter = 0;
```

＝一度表示したら**10フレーム**は再表示しない。

`displayMessage(8000, index, itemNum)` の中身 (`Dialogs.c:186`) にも仕様がある:

```c
sprintf(message, "%s%s", g_Messages[index - 1], (index == 5) ? g_ItemTemplates[itemNum].name : "");
```

＝**メッセージ番号5のときだけ、末尾に `deadItem` のアイテム名を連結する**。現行の `js/main.js:189` は `textMsgs[speaker.message - 1]` を出すだけでこの特例がない。

##### 実装手順

1. 敵との接触ループで、`enemy.message > 0` かつ `messageCounter === 0` なら `ui.showDialog()`。
2. `Saric` に `messageCounter` を追加し、原作どおり 10 フレームで解除する。
3. メッセージ番号5の特例を実装する。
4. E キーの扱いを決める。原作に無い機能だが、看板を読み返す手段としてタッチ操作では有用かもしれない。**独断で残さず、ユーザーに確認すること。** 削除する場合は `index.html` の操作説明と `js/touch.js` からも除く。

##### 受け入れ条件

- 看板・町人に触れると自動で文章が出る。
- 連続で何度も開き直さない。
- メッセージ5がアイテム名付きで出る。

##### 落とし穴

- ダイアログ表示中は `js/main.js:381` で tick 全体が止まる。接触駆動にすると「閉じた瞬間まだ重なっていて即再表示」になりやすい。`messageCounter` はまさにこの対策なので、閉じた**後**からカウントを始めること。

---

### タスクE: 戦闘とステータスの数値を原作に合わせる 🟠高

創作された数値がいくつもある。**まとめて1コミットにせず、E-1〜E-5 を個別コミットにすること**（挙動が大きく変わるので、問題が出たとき切り分けられるように）。

#### E-1. Saric の初期値とレベルアップ

`Saric.c:40-99` `initSaric()` / `Saric.c:101-118` `levelUpSaric()`

| 項目 | 原作 | 現行 `js/saric.js:35-49` |
|---|---|---|
| `health` / `maxHealth` | 10 / 10 | 20 / 20 |
| `damage` | 1 | 4 (`baseAttack`) |
| `armorValue` | 0 | 0 ✓ |
| `money` | 0 | 50 |
| `stamina` / `maxStamina` | 10 / 10（整数） | 100（0〜100のfloatバー） |
| `speed` | 2 | 2 ✓ |
| `level` | 0 | 1 |
| `nextLevel` | `kBaseNextLevel` = **20** | 30 |

レベルアップ:

```c
g_Saric.health += 5;  g_Saric.maxHealth += 5;
g_Saric.level++;
g_Saric.stamina += 5; g_Saric.maxStamina += 5;

if (g_Saric.nextLevel < kBaseNextLevel * 32)   // 640
    g_Saric.nextLevel *= 2;
else
    g_Saric.nextLevel += kBaseNextLevel * 32;  // 8レベル以降は線形
```

現行 `js/saric.js:124-138` は `nextXp *= 2.2`、`baseAttack += 2`、`baseDefense += 1`。
**原作にはレベルアップによる攻撃力・防御力の上昇は存在しない。** 強さは装備でのみ伸びる。

実装上の注意:

- スタミナを整数 0..maxStamina に戻すと、`js/renderer.js:163` の `player.stamina / 100` 固定分母が壊れる。`/ player.staminaMax` にすること。
- `js/saric.js:19` の `STAMINA_PER_POINT = 5`（ポーションのスタミナ回復倍率）は、スタミナが0..100前提の創作。整数化に伴い削除し、`item.stamina` をそのまま使う。
- `js/ui.js:76-82` のプレースホルダ表示値（`hp: 20`, `next: 30`, `gold: 50`）も直す。

#### E-2. スタミナの増減

`Input.c:655-675`:

```c
if (g_Saric.sitCounter > 30) { g_Saric.sitCounter = 0; if (stamina < maxStamina) stamina++; }
if (g_Saric.runCounter > 30) { g_Saric.runCounter = 0; if (stamina)             stamina--; }
```

`sitCounter` は走っていないフレームで加算 (`Input.c:1048`)、`runCounter` は走りながら移動しているフレームで加算 (`Input.c:1060` ほか)。
＝**30フレームごとに1ポイント**増減。現行 `js/saric.js:16-17` は毎フレーム `1.6` 減 / `0.7` 増。

速度 (`Input.c:1032-1050`):

```c
走行時（stamina > 0）: speed = 6 + itemEffects[0..2].speed
それ以外:              speed = 2 + itemEffects[0..2].speed
```

現行は歩行2 / 走行3.5。**走行は歩行の3倍が正しい。**

#### E-3. `incrementalDamageCounter`（防御が通ったときの挙動）

`EnemyCollision.c:512-535`:

```c
i = temp->damage - (armorValue + itemEffects[0].armor + itemEffects[1].armor + itemEffects[2].armor);

if (i <= 0 && temp->movementType != dyingEnemy)
{
    g_Saric.incrementalDamageCounter++;
    g_Saric.woundCounter = 10;
    if (g_Saric.incrementalDamageCounter >= 5) { i = 1; g_Saric.incrementalDamageCounter = 0; }
}

if (i > 0 && CHECK_IMMUNITIES(...)) { g_Saric.health -= i; ... }
```

＝ダメージが防御で完全に受け止められる場合、**5回接触するごとに1ダメージ**だけ通る。
現行 `js/saric.js:185` は `Math.max(1, raw - defense)` で毎回最低1ダメージ。防具を固める意味がほぼ無くなっている。

#### E-4. ノックバックと `woundCounter`

ノックバック (`EnemyCollision.c:544-571`): **加害敵の `facing` 方向へ固定8px**、1回だけ。移動先が `standableRect()` でなければ移動しない。
現行 `js/saric.js:191` は加害者からの離反ベクトル×5＋毎フレーム0.7倍減衰。

`woundCounter` (`Input.c:693-701`): 0以外なら毎フレーム加算、30を超えたら0に戻る。
**重要: 地形ダメージと敵接触ダメージが同じ `woundCounter` を共有している。** `Input.c:726` の地形判定も `woundCounter == 0` を条件にしている。
現行は `invuln`(25フレーム) と `terrainCooldown`(30フレーム) に分離されており、溶岩の上で敵に殴られると両方通る。統合すること。

なお被弾時は `woundCounter = 1`、ノーダメージ接触時は `woundCounter = 10` と初期値が異なる（＝ノーダメージ接触の方が硬直が短い）。

#### E-5. 剣の連打制御・スタミナ消費・チャージ

`Input.c:749-935`。現行実装が主武器についてほぼ丸ごと落としている部分。

1. **1押下1ヒット。** `hadHitEnemy` が立つと、スペースを離すまで剣の判定ブロック全体をスキップする（`Input.c:756` の条件、`Input.c:901` でセット、`Input.c:928` の `else` でクリア）。
   現行 `js/main.js:449` は敵ごとの `flash`(6フレーム) しか制約がなく、押しっぱなしで複数体を継続的に切り続けられる。
2. **`rateOfFire` によるゲート。** `fireCounter >= rateOfFire` を満たすまで振れない (`Input.c:758`)。
3. **スタミナ消費。** 抜刀の瞬間だけ `stamina -= itemEffects[0].stamina`。足りなければ抜刀自体がキャンセル (`Input.c:762-766`)。
4. **`hasCharges` (256) の消費。** `Input.c:782-799`。チャージを使い切ると所持数が1減り、0になったら装備解除、チャージはテンプレート値に戻る。
   現行は `items.json` の `charges` を `js/ui.js:26` で表示するだけで、**一度も減らない**。
5. **`damageHealed` によるHP回復。** `Input.c:811`。抜刀時に `health += damageHealed`（`maxHealth` でクランプ）。
6. **`isMissile` なら `saricFireEnemy()`。** タスクC参照。

これらは全て**オフハンド (`Input.c:941-1030`) にも同じ形で存在する**。現行はオフハンドにだけ部分実装がある状態なので、共通の「装備品を使う」処理に括り出すのが妥当。

⚠️ 原作の仕様として: **オフハンド武器には敵への直接ヒット判定が無い**（`analysis/11_bugs_notes.md` 11-3-3）。飛び道具か特殊ルーチンのみ。現行もそうなっているので変えないこと。

#### 受け入れ条件（E全体）

- 新規開始時 HP 10/10、所持金 0、レベル 0、次レベルまで 20。
- レベルアップで HP・スタミナが +5 され、攻撃力は変わらない。
- 走行が歩行の3倍速で、スタミナが30フレームに1ずつ減る。
- 防具が敵の攻撃力を上回るとき、5回に1回しかダメージを受けない。
- 剣は押しっぱなしで連打できず、離して押し直す必要がある。
- チャージ制アイテムの残チャージが減り、尽きると消える。

---

### タスクF: 撃破した `permanent` 敵の再出現 🟡中

#### 現状

`js/main.js:53` の `defeatedMasks` は一度立てたビットを二度と下ろさない。撃破した敵は永久に消える。

#### 原作の仕様

`Map.c:97-107` `loadScreen()`:

```c
if (!(g_DeathRecord[g_CurrentScreen] & (1 << i)))        // ビットが降りている = 撃破済み
{
    if (!(readingEnemy->attributes & permanent) || generateRand() & 0x0F)
        continue;                                        // 出現させない
    else
        g_DeathRecord[g_CurrentScreen] |= (1 << i);      // 復活させてビットを戻す
}
```

＝撃破済みでも、`permanent` 属性 (64) を持つ敵は**画面に入るたび 1/16 の確率で復活**する。

**データ:** `permanent` 属性を持つ敵は **531体**で、配置敵の大半を占める。この仕様が無いと、進行に伴って世界から敵がいなくなる。

#### 実装手順

`js/enemy.js:243` の `spawnScreen()` に抽選を実装し、復活したらマスクのビットを下ろす。マスクを書き換えるので、`spawnScreen` に `defeatedMasks` 配列と画面indexを渡すか、戻り値で「復活したスロット」を返して `js/main.js:108` 側で反映する。

ビットの向きが原作と反転している（1-1の表参照）ことに注意。JS側は「立っている＝撃破済み」なので、復活時は `&= ~(1 << slot)`。

#### 受け入れ条件

- 敵を倒した画面を何度も出入りすると、`permanent` な敵がたまに復活する。
- `permanent` でない敵は復活しない。
- 復活はセーブデータに反映される（`defeatedMasks` を保存しているので自動的にそうなるはず）。

#### 落とし穴

- `js/main.js:114-120` で `AI.DOOR` の敵から `closedDoors` を作っている。鍵で開けた扉が復活すると通れなくなる。扉の敵が `permanent` を持つか **データで確認**し、持つなら扉だけ除外すべきか原作の挙動を再確認すること。

---

### タスクG: 小粒な修正 🟢低

独立しているので、他のタスクの合間に片付けてよい。**1件1コミットにする必要はない**が、G-1 と G-2 は分けること。

#### G-1. `die` 効果音の誤マッピング

`js/audio.js:22` が `die: 'assets/sfx/sfx_134.wav'` になっている。134 は鍵を使う音 (`Saric.c:296`)。
原作の `loseGame()` (`Utils.c:687-725`) は**効果音を一切鳴らさない**（赤フェード → 暗転 → lose画像）。
`die` エントリを削除し、`js/main.js:421, 457, 504` の `player.dead ? 'die' : 'hurt'` を見直す。

なお `winGame()` は `Utils.c:556-557` で **131 と 138 を続けて鳴らす**。現行は `fanfare`(138) のみ。

#### G-2. 死語になったi18n文字列の削除

`js/i18n-ja.js:62, 65` の `'Nothing to sell.'` / `'Sell'`。
原作の店に売却機能は無い（`analysis/11_bugs_notes.md` 11-3-4: 「"Your Items" タブは表示専用」）ため、コミット `52cfe44` で売却UIが意図的に削除された。その残骸。

#### G-3. 死体ドロップの自動取得条件

`EnemyUpdate.c:177-190`:

```c
for (i = nrect.top; i <= nrect.bottom; i++)
  for (j = nrect.left; j <= nrect.right; j++)
  {
      if ((tiles[(j*10)+i].modifiers & standable) == 0) numIntercepts++;
      numTests++;
  }

if (numIntercepts == numTests && numIntercepts > 0)   // 全タイルが非standable
```

＝重なっているタイルが**全て**通行不可のときだけ、ドロップを自動取得する。
現行 `js/main.js:471` は `world.boxHitsWall()` を使っており、これは**いずれか**が壁なら true。条件が緩すぎる。

#### G-4. ヘルプ画面

`assets/ui/help.png` を抽出済みだが、**どこからも参照されていない**（`index.html` の favicon が `cursor.png` を使っているのみ）。
原作は H キーで表示 (`Utils.c:281-297` `showHelp()`)。キー入力があるまで待って閉じる。

同様に未実装の原作キー: ポーズ/終了 `P` `Q` `ESC` (`Input.c:485`)、音量 `0`〜`7` (`Input.c:542-634`)、ステータス `S` (`Input.c:637`／現行はインベントリ画面に統合済みなので実質OK)。

**ヘルプ以外を実装するかはユーザーに確認すること。** 現行は `M` で音のオン/オフというブラウザ向けの独自割当になっており、原作の音量0〜7と衝突する。

---

## 3. 触ってはいけないもの / 既知の意図的差分

以下は「バグ」ではなく、**原作にそう書いてある**か、移植上の意図的判断である。勝手に直さないこと。

| 箇所 | 内容 | 根拠 |
|---|---|---|
| `js/map.js:104` | 地形効果の走査が下2行(y=8,9)を見ない | `Input.c:721` の `i > 7` continue。原作の挙動 |
| 剣の判定 | Saricの矩形を向き方向へ16px平行移動しただけ（拡大なし） | `Input.c:825-843`、`analysis` 11-3-2 |
| オフハンド | 敵への直接ヒット判定を持たない | `Input.c:941-1030`、`analysis` 11-3-3 |
| 店 | 売却できない | `Dialogs.c`、`analysis` 11-3-4 |
| 店 | 購入時に効果音が鳴らない | `Dialogs.c:2002`、`analysis` 11-3-5 |
| 扉のワープ | 効果音が鳴らない | コミット `56945ba` で原作準拠に修正済み |
| `AI.SMART` (3) | 原作の `smartMonster` は**移動しない**（射撃のみ） | `EnemyUpdate.c:1066-1103`、`analysis` 11-3-7 |
| `AI.WAITING_FOR_TIME` (10) | 原作で `updateEnemies` の case がコメントアウトされ**何もしない** | `Enemies.c:240-242`、`analysis` 11-1-7 |
| `runItemSpecialRoutine` | 原作は 104 の後 `break` が無く 150 にフォールスルーするバグ持ち | `Saric.c:182-192`、`analysis` 11-1-4。現行JSは `else if` で修正済み。**この修正は維持してよい** |

`AI.SMART` / `AI.WAITING_FOR_TIME` / `AI.BUMP_TURN` / `AI.LINEAR_BOSS` / `AI.ELEMENTAL_BOSS` は**マップデータ上に1体も配置がない**（確認済み）。実装の優先度は最低。

---

## 4. 未解決の設計判断（ユーザー確認が必要）

独断で決めず、着手前に確認すること。

1. **勝利条件。** 原作は最終ボスの `health <= 10` で `winGame()` (`EnemyUpdate.c:2130`)。現行は「5つのマントラ収集 + 画面87(Castle Blednock)到達」という創作 (`js/main.js:39, 513-522`)。最終ボス戦そのもの（床封鎖ギミック `EnemyUpdate.c:2063-2066`、テンプレート 2020/2108/2035 の三段召喚）も未実装。原作準拠に戻すか、現行を維持するか。

2. **移動が8方向であること。** 原作は LEFT→RIGHT→DOWN→UP の順に判定し、**最初に成立した1方向で `return`**（`Input.c:1055-1163`）。斜め移動は存在しない。現行 `js/saric.js:215-245` は正規化ベクトルによる8方向。原作準拠に戻すとかなり操作感が変わる。

3. **E キーによる会話（タスクD-2）。** 原作に無い。タッチ操作との兼ね合いで残すか。

4. **原作キー割当（タスクG-4）。** 音量0〜7 を実装すると現行の `M` トグルと衝突する。

5. **画面切り替えのスクロール演出。** 原作は `scrollFromScreenToScreen()` (`Map.c:284-406`) でスクロールする。現行は即座に切り替え。演出の再現優先度。

---

## 5. 精査の根拠となったデータ集計

再確認したくなったとき用。`assets/data/map.json` 全256画面を走査した結果。

```
配置敵の属性別体数:
  isEnemy 476 / killable 449 / permanent 531 / canFire 241 / multiFacing 226
  insubstantial 98 / canBeHeld 31 / pushable 5 / isBossEnemy 11
  originalToRoom 0  ← 配置データには立っておらず、loadScreen() が付与する (Map.c:128)

movementType 別体数:
  0:45  1:298  2:16  4:27  5:15  7:149  8:4  9:9  11:5  15:7
  50:3  51:1  53:3  54:1  56:2  58:1
  （3, 6, 10, 12, 13, 52, 55, 57 は配置ゼロ）

firedEnemy が非ゼロの敵: 243体
messageID が負の敵: 5体（-1〜-5 が各1体）→ stores.json の5軒と一致
messageID が正の敵: 99体

敵テンプレート: 65種、全て id == spriteRef
```

`GameData.dat` を直接デコードして得た、未抽出フィールドの実測値（タスクBの期待値）:

```
immunities   非ゼロ 308体 / 586体   最頻値: 0(278) 255(38) 13(31) 61(28) 52(25)
damageType   非ゼロ 475体 / 586体   最頻値: 12(240) 0(111) 4(40) 128(34) 132(28)

ai == 11 (waitingForSaric) の5体 — 全て target=32, movePhase=2(homing)
  screen 50 slot 0 / 50 slot 1 / 51 slot 0 / 66 slot 1 / 67 slot 0

pushable (attr & 16) の5体 の pushableSpeed
  screen 31 slot 0 → 6    screen 31 slot 1 → 4    screen 58 slot 0 → 4
  screen 223 slot 0 → 2   screen 223 slot 1 → 2

disFromUnitCircle  マップ上は 120/123/172 だが loadScreen が 100 で上書き → 抽出不要

rateOfFire   配置敵・テンプレートとも 0〜8。17以上は存在せず、ゼロ除算リスクなし
originalNumber  マップ上の値は無意味。loadScreen が スロット番号 i で上書きする
```

集計に使ったスクリプトはリポジトリに残していない。必要なら `assets/data/map.json` を読んで数え直すこと（未抽出フィールドは `GameData.dat` を `tools/unpack_dat.py` の `load_dat_file()` で開き、`MapData` を 2304バイト/画面・160タイル×8バイトの後ろに 16スロット×64バイトで読む）。
