# 実装不足の是正: 引き継ぎ指示書（第2次）

> **ステータス: 未着手**
>
> 第1次（[`docs/HANDOFF_GAPS.md`](HANDOFF_GAPS.md)）のタスク A〜G は完了済み。本文書は
> **その完了後に行った再精査で新たに判明した残作業**をまとめたものである。

第1次の指示書は「データはあるのに読んでいない」「数式が創作されている」といった**離散的な抜け漏れ**を対象としていた。本文書が扱うのはその次の層、すなわち**移動・AIの挙動そのものの忠実度**と、**抽出したのに消費側が無いデータ**である。

---

## 0. 前提

**第1次の 0-1〜0-5 をそのまま引き継ぐ。**着手前に必ず読むこと。要点だけ再掲する。

- `original-source/src/*.c` が唯一の仕様書。創作は入れない。値が見つからなければユーザーに聞く。
- 原作の値を採用したら、コード中コメントに `EnemyUpdate.c:374` 形式で出典を書く。
- ビルド不要。`python -m http.server 8123`（`.claude/launch.json` に `mantra` として登録済み）。
- `window.mantra` に Game インスタンスが露出。コンソールから状態を直接叩ける。
- テストコードは無い。実機確認が唯一の検証手段。
- `main` に直接コミットせず、1タスク1コミット。

### 0-1. ⚠️ 検証時の落とし穴（第1次で実際に踏んだもの）

- **`python -m http.server` はファイル編集後も古い JS を配信し続けることがある。**
  「直したはずなのに挙動が変わらない」ときは、まず `preview_stop` → `preview_start` で
  サーバを再起動して確認すること。ブラウザ側のリロードだけでは解消しない場合がある。
- **`catch` で握りつぶされた例外に注意。** 第1次では `audio.js` の `playMusic()` が
  存在しないメソッドを呼んで毎回例外を投げていたが、`console.warn` に落ちるだけだったため
  「音楽が鳴らない」以外の症状が出ず、完了扱いのまま残っていた。
  実装後は必ず `read_console_messages`（`onlyErrors: false`）で warn も確認する。
- **「実装した」と「動いている」は別。** 第1次では `maybeFire()` が定義済み・呼び出し元ゼロ、
  `pushableSpeed` が抽出済み・消費側ゼロ、という状態が発生した。
  実装後は必ず**実機で数える**（後述の各タスクの受け入れ条件はその形式で書いてある）。

### 0-2. 座標系（第1次 第1節の再掲・最重要）

| 概念 | 原作C | 現行JS |
|---|---|---|
| 位置 | `Rect where`（**左上**基準、32×32） | `x, y`（**中心**基準） |
| 敵の `facing` | 0=中立, 1=右, 2=下, 3=左, 4=上 | 同じ |
| Saricの `facing` | 0=左, 1=右, 2=下, 3=上（**敵と別体系**） | 同じ |
| タイル添字 | `tiles[(j * 10) + i]`（`j`=x, `i`=y） | `[y * 16 + x]` |

原作の座標を移植する際、**左上基準↔中心基準の 16px オフセット**を必ず考慮すること。
例: 原作の `where.left = 256` は、移植版では `x = 256 + 16 = 272` に相当する。

---

## 1. タスク一覧

| # | 内容 | 優先度 | 規模 |
|---|---|---|---|
| H | 敵を画面内に拘束する | 🔴高 | 小 |
| I | 押せる敵（`pushable`）の実装 | 🟠中 | 小 |
| J | 剣のノックバックを原作準拠に | 🟠中 | 小 |
| K | `checkProximityToSword`（剣への反応） | 🟠中 | 小 |
| L | メッセージアイテム取得時の即時表示 | 🟢低 | 小 |
| M | `insubstantial` 同士の衝突ガード | 🟢低 | 極小 |
| N | 敵の移動を4方向に戻す | 🔴高 | 大 |
| O | ボスAI 8種を原作実装に置き換える | 🟠中 | 大 |

**推奨順序: H → I → J → K → L → M → N → O**

H〜M は独立した小タスクで、既存の挙動を壊しにくい。N と O は移植版の手触りを大きく変えるため、
前半を片付けて安定させてから、独立した作業として着手すること。

第2節の「ユーザー判断が必要な項目」5件は、本タスク一覧には**含めていない**。着手前に確認すること。

---

### タスクH: 敵を画面内に拘束する 🔴高

#### 現状

敵が画面外へ歩き去る。**実測で176体中8体が脱出**（最悪例: 画面56で `x = -35`。画面幅は512px）。

原因は `js/enemy.js` の `makeMover()` が `world.boxHitsWall()` しか見ていないこと。
`World.isSolidPixel()`（`js/map.js:62-74`）は画面外を**世界の縁でのみ**通行不可と返すため、
内陸の画面では敵が縁を越えて視界外へ出てしまう。

#### 原作の仕様

`checkEnemyInterceptWithMap()`（`EnemyCollision.c:585-672`）が画面外を「衝突」として扱う。

```c
rect = temp->where;

// 上端・左端の判定は 32 で割る前に行う
if(rect.top < 0 || rect.left < 0) return true;

rect.left   = (rect.left / 32);
rect.top    = (rect.top / 32);
rect.right  = (rect.right - 1) / 32;
rect.bottom = (rect.bottom - 1) / 32;

if(rect.bottom > 9 || rect.right > 15) return true;

if(temp->attributes & isBossEnemy) { rect.right++; rect.bottom++; }

// insubstantial な敵は地形を無視してすり抜ける
if(temp->attributes & insubstantial) return false;
```

読み解きの要点:

- 画面外は**無条件で通行不可**。敵は 16×10 タイルの中に完全に閉じ込められる。
- **`insubstantial`（32）の敵は地形判定そのものをスキップする**（`EnemyCollision.c:620-623`）。
  ただし上の画面外判定は `insubstantial` チェックより**手前**にあるので、
  すり抜ける敵でも画面外へは出られない。この順序を守ること。
- タイル判定は `spriteRef` が 1000〜1100 の範囲外なら `continue`（`EnemyCollision.c:657-660`）。

#### 実装手順

1. `js/enemy.js` の `makeMover()` に画面境界チェックを追加する。敵の矩形が
   0 ≤ left, 0 ≤ top, right ≤ 512, bottom ≤ 320 に収まらない移動を拒否する。
2. `insubstantial` の敵はタイル衝突を無視するが**画面境界は無視しない**、という順序を実装する。
   現行 `makeMover` は `solid` フラグを一切見ていないので、ここで併せて反映してよい。
3. プレイヤーの移動（`Saric.step`）には**この変更を波及させない**。Saricは画面外へ出ることで
   画面遷移する仕様であり、`checkScreenTransitions()` がそれに依存している。

#### 受け入れ条件

以下をコンソールで実行し、`escapedOffScreen` が **0** になること（修正前は8）。

```js
(() => {
  const g = window.mantra; g.player.debugMode = true;
  let escaped = 0, checked = 0;
  for (let s = 0; s < 60; s++) {
    g.ui.toggleShop(false); g.ui.hideDialog(); g.enter(s);
    for (let i = 0; i < 120; i++) g.tick();
    for (const e of g.enemies) {
      if (e.dead) continue; checked++;
      if (e.x < 0 || e.x > 512 || e.y < 0 || e.y > 320) escaped++;
    }
  }
  return JSON.stringify({ checked, escapedOffScreen: escaped });
})();
```

#### 落とし穴

- 敵の当たり矩形は 20×16（ボスは 64×64）だが、原作の `where` は 32×32。
  拘束範囲をどちらに合わせるかで見た目が変わる。原作準拠なら 32×32 相当。
- 拘束を厳しくしすぎると、スポーン地点が既に壁に埋まっている敵が動けなくなる。
  原作の `randomMonster` は衝突時に「垂直方向へランダム符号でバンプ」して脱出を試みる
  （`EnemyUpdate.c:442-467`）。タスクNと併せて実装するのが本筋。

---

### タスクI: 押せる敵（`pushable`）の実装 🟠中

#### 現状

第1次タスクBで `pushableSpeed` の抽出は完了し、`js/enemy.js:59` が値を保持している。
しかし**消費する側のコードが存在しない**（`grep` で `pushableSpeed` の参照はこの1箇所のみ）。
該当5体は押しても動かない。

| 画面 | スロット | `pushableSpeed` |
|---|---|---|
| 31 | 0 | 6 |
| 31 | 1 | 4 |
| 58 | 0 | 4 |
| 223 | 0 | 2 |
| 223 | 1 | 2 |

#### 原作の仕様

`checkEnemyPushing()`（`EnemyCollision.c:980-1076`）。毎フレーム、全ての敵に対して呼ばれる。

```c
// 1. 判定用の矩形を、Saricの向きと「逆」に4pxずらす
//    ＝「敵が4px Saricに近づいたら重なるか」を調べている
bumpRect = temp->where;
switch (g_Saric.facing) {
    case 0: bumpRect.left += 4; bumpRect.right += 4; break;  // Saricが左向き
    case 1: bumpRect.left -= 4; bumpRect.right -= 4; break;  // 右向き
    case 2: bumpRect.top  -= 4; bumpRect.bottom -= 4; break; // 下向き
    case 3: bumpRect.top  += 4; bumpRect.bottom += 4; break; // 上向き
}

if(temp->attributes & pushable) {
    if(testIntercept(... &bumpRect, &g_Saric.where ...)) {
        oldRect = temp->where;
        // 2. Saricの向き「方向」へ pushableSpeed だけ動かす
        switch (g_Saric.facing) {
            case 0: temp->where.left -= pushableSpeed; break;  // 左へ押される
            case 1: temp->where.left += pushableSpeed; break;  // 右へ
            case 2: temp->where.top  += pushableSpeed; break;  // 下へ
            case 3: temp->where.top  -= pushableSpeed; break;  // 上へ
        }
        // 3. 押した先に立てなければ元に戻す
        if(!enemyStandableRect(currentEnemy)) temp->where = oldRect;
    }
}
```

**注意: Saricの `facing` は 0=左, 1=右, 2=下, 3=上**（敵の facing とは別体系）。
移植版の `DIR_LEFT/RIGHT/DOWN/UP` = 0/1/2/3 と一致しているので、そのまま使える。

#### 実装手順

1. `js/main.js` の敵ループ内に、`enemy.attributes & ATTR.PUSHABLE` の敵に対する押し出し処理を追加する。
2. 判定矩形は「敵の矩形を Saric の向きと逆に4pxずらしたもの」と Saric の矩形の重なり。
3. 押した先が `world.boxHitsWall()` に引っかかるなら押さない。
4. タスクHを先に実装している場合は、押し出し先の画面境界チェックも効くようにする。

#### 受け入れ条件

- 画面31・58・223 で、該当する敵に歩いて押し当てると、Saricの向きへ `pushableSpeed` 分だけ動く。
- 壁を背にした敵は押しても動かない。
- `pushable` 属性を持たない敵は押せない（＝すり抜けもしないし動きもしない）。

---

### タスクJ: 剣のノックバックを原作準拠に 🟠中

#### 現状

`js/enemy.js:118-121` が「加害者からの離反ベクトル×4」を `KNOCK_FRAMES`（5フレーム）継続する独自方式。

```js
const dx = this.x - fromX, dy = this.y - fromY;
const len = Math.hypot(dx, dy) || 1;
this.knock = { x: (dx/len) * 4, y: (dy/len) * 4, frames: KNOCK_FRAMES };
```

#### 原作の仕様

`Input.c:881-899`。**Saricの向きへ `SWORD_OFFSET`（＝16px）を一度だけ**、瞬間的に移動させる。

```c
switch (g_Saric.facing) {
    case 0: next->where.left -= SWORD_OFFSET; next->where.right -= SWORD_OFFSET; break;
    case 1: next->where.left += SWORD_OFFSET; next->where.right += SWORD_OFFSET; break;
    case 2: next->where.top  += SWORD_OFFSET; next->where.bottom += SWORD_OFFSET; break;
    case 3: next->where.top  -= SWORD_OFFSET; next->where.bottom -= SWORD_OFFSET; break;
}
g_Saric.hadHitEnemy = true;
playSoundEffect(130);
if(!enemyStandableRect(nextHandle)) next->where = oldEnemyRect;   // 立てなければ元に戻す
```

同じ処理が `checkEnemyInterceptWithEnemies()`（`EnemyCollision.c:749-769`）にもあり、
そちらは**加害側の `facing`** を使う（プレイヤーの弾が敵を弾く場合）。

#### 実装手順

1. `Enemy.hurt()` の `knock` を廃し、加害者の向きへ 16px の一度きりの移動に置き換える。
2. 移動先が壁なら移動をキャンセルする（`enemyStandableRect` 相当）。
3. `Enemy.update()` の `knock` 処理（`js/enemy.js:129-134`）と `KNOCK_FRAMES` 定数も除去する。
   ただし「ノックバック中は歩かない」という現行の挙動が失われる点に注意。原作にはその概念が無く、
   代わりに `legCounter = 0` が被弾硬直の役割を果たしている（`Input.c:879`）。
4. `hurt()` のシグネチャが `fromX, fromY` から「加害者の facing」に変わるため、
   呼び出し側3箇所（`main.js` の剣・プレイヤー弾・`powerMantra`）を併せて直すこと。

#### 受け入れ条件

- 敵を斬ると、Saricの向きへ 16px 瞬間的に飛ぶ。
- 壁際の敵を壁に向かって斬っても、めり込まない。
- ノックバック後、敵はすぐ通常の移動を再開する（滑らない）。

---

### タスクK: `checkProximityToSword`（剣への反応） 🟠中

#### 現状

未実装。原作では抜き身の剣が近づくと敵が反応するが、移植版では無反応。

#### 原作の仕様

`checkProximityToSword()`（`EnemyCollision.c:889-975`）。`randomMonster` と `homingMonster` の
末尾から呼ばれる。

判定矩形は Saric の矩形を向き方向へ **`SWORD_OFFSET + 32` = 48px** ずらしたもの。

```c
switch (g_Saric.facing) {
    case 0: rect.left = g_Saric.where.left - 48; rect.top = g_Saric.where.top; break;
    case 1: rect.left = g_Saric.where.left + 48; rect.top = g_Saric.where.top; break;
    case 2: rect.left = g_Saric.where.left; rect.top = g_Saric.where.top + 48; break;
    case 3: rect.left = g_Saric.where.left; rect.top = g_Saric.where.top - 48; break;
}
```

> ⚠️ **原作のバグ**: `rect.bottom` と `rect.right` は `temp->where`（敵の矩形）の値が
> 残ったままで更新されない（`EnemyCollision.c:919-920` に原作者自身のコメントあり）。
> 忠実に再現するか、素直に 32×32 の矩形として扱うかは判断が要る。**後者を推奨**し、
> その旨をコメントに書くこと。

成立条件は3つの AND:

- `temp->legCounter > 15`（直前に斬られていない）
- `g_Saric.swordOut`（剣が抜かれている）
- 矩形が重なっている

さらに「敵が Saric から遠ざかっている最中なら反応しない」フィルタがある（`EnemyCollision.c:944-970`）。
敵を `facing` と逆方向へ `speed` 分戻した仮想位置 `oldRect` を作り、

```
|Saric - oldRect| (マンハッタン距離) > |Saric - 現在位置|   のときだけ true
```

＝**近づいている最中の敵だけが反応する**。

呼び出し側の反応:

| 呼び出し元 | 反応 |
|---|---|
| `randomMonster`（`EnemyUpdate.c:474-478`） | `facing = shortRand() % 5`（向き再抽選）+ `legCounter = 250` |
| `homingMonster`（`EnemyUpdate.c:614-617`） | `legCounter = 16` |

> `randomMonster` の `legCounter = 250` は、次フレームで `>= 32` を満たすため
> **即座に射撃抽選が走り 16 に戻る**。原作者の意図は不明だが、そのまま再現すること。

#### 実装手順

1. `js/enemy_ai.js` に `checkProximityToSword(enemy, ctx)` を追加する。
   `ctx.player.swordOut`（`Saric` に既存）と `enemy.legCounter > 15` をゲートにする。
2. 「近づいている最中か」のマンハッタン距離フィルタを実装する。
3. `AI.RANDOM` と `AI.HOMING` の末尾から呼ぶ。**他のルーチンからは呼ばない**（原作もそうなっている）。

#### 受け入れ条件

- 剣を抜いてランダム移動の敵に近づくと、敵の向きが変わる。
- 剣をしまっている間は反応しない。
- 敵から離れていく方向に動いている場合は反応しない。

---

### タスクL: メッセージアイテム取得時の即時表示 🟢低

#### 現状

`isMessage`（8）属性のアイテムを拾っても何も表示されず、インベントリの「Messages」タブに入るだけ。

#### 原作の仕様

`EnemyCollision.c:496-499`。アイテム取得処理の中で、`isMessage` なら即座に本文を表示する。

```c
if(g_ItemTemplates[temp->deadItem].attributes & isMessage)
{
    displayItemMessage(temp->deadItem);
}
```

`displayItemMessage()` は `Dialogs.c:265` にあり、**アイテムの `description` を表示する**
（`TextData` のメッセージ番号ではない点に注意。看板の `displayMessage()` とは別物）。

#### 実装手順

1. `js/main.js` の `collect()` に、`item.attributes & FLAG.MESSAGE` なら
   `ui.showDialog('', item.desc)` を呼ぶ処理を追加する。
2. 既存の「看板メッセージ」表示（`enemy.message` 由来）とは別経路なので、
   両方が同時に出ないよう順序を決めること。

#### 受け入れ条件

- 手紙系アイテムを拾うと、その場で本文が表示される。
- インベントリの Messages タブからも従来どおり読み返せる。

---

### タスクM: `insubstantial` 同士の衝突ガード 🟢低

#### 現状

`js/enemy.js:62` が `solid` を保持しているが、衝突判定で使われていない。

#### 原作の仕様

`EnemyCollision.c:723`。敵同士の衝突処理で、**双方が `insubstantial` なら何もしない**。

```c
if(!(temp->attributes & insubstantial && next->attributes & insubstantial))
{
    // ここで初めてダメージ・消滅処理に入る
}
```

#### 実装手順

`js/main.js:438` 付近（`firedByPlayer` の当たり判定ループ）に、
双方が `ATTR.INSUBSTANTIAL` を持つ場合はスキップする条件を追加する。

#### 受け入れ条件

- すり抜け属性同士のエンティティが重なっても、互いに影響しない。

---

### タスクN: 敵の移動を4方向に戻す 🔴高・大

#### 現状

**実測で176体中94体が斜め移動している。**原作の敵に斜め移動は存在しない。

原因は2つ:

- `js/enemy_ai.js:44-47` の `DIRECTIONS` 配列が斜め4方向を含む
- `towards()`（`js/enemy_ai.js:56-62`）が正規化ベクトルを返す

#### 原作の仕様

全ての移動ルーチンが `switch(facing)` で**1軸だけ**を `speed` 分ずらす。

```c
// EnemyUpdate.c:405-419 (randomMonster)
switch(temp->facing)
{
    case 1: offsetRect( &temp->where,  temp->speed, 0 ); break;   // 右
    case 2: offsetRect( &temp->where, 0,  temp->speed ); break;   // 下
    case 3: offsetRect( &temp->where, -temp->speed, 0 ); break;   // 左
    case 4: offsetRect( &temp->where, 0, -temp->speed ); break;   // 上
}
```

`facing == 0`（中立）のときは**動かない**（`case 0` が無い）。ただし `bumpTurnMonster` だけは
`case 0` で `facing` を再抽選してから `case 1` にフォールスルーする（`EnemyUpdate.c:677-681`）。

##### 各ルーチンの向き決定

**`randomMonster`（`EnemyUpdate.c:359-479`）**
`legCounter >= 32` のタイミングで `facing = abs(shortRand() % 5)`（0〜4）。

**`homingMonster`（`EnemyUpdate.c:484-620`）** — 毎フレーム、純粋な4方向で決める。

```c
temp->facing = 0;
if(g_Saric.where.top - temp->where.top > 0) temp->facing = 2;   // 下
if(g_Saric.where.top - temp->where.top < 0) temp->facing = 4;   // 上
// 横方向の差が縦より大きければ横を優先して上書き
if(abs(g_Saric.where.left - temp->where.left) > abs(g_Saric.where.top - temp->where.top))
{
    if(g_Saric.where.left - temp->where.left > 0) temp->facing = 1;   // 右
    if(g_Saric.where.left - temp->where.left < 0) temp->facing = 3;   // 左
}
```

**`bumpTurnMonster`（`EnemyUpdate.c:624-751`）**
`semibumpTurn`(9) の場合のみ、毎フレーム `shortRand() % 100 == 0` で `facing` 再抽選。

**`semihomingMonster`（`EnemyUpdate.c:752-899`）** — 未読。実装前に読むこと。

**`gaurdianMonster`（`EnemyUpdate.c:900-991`）** — 未読。`gaurdianRange` の使われ方を確認すること。

**`linearMonster`（`EnemyUpdate.c:1106-1184`）** — 未読。

**`circlingMonster`（`EnemyUpdate.c:992-1065`）** — 下記タスクOと同じ三角関数方式。本タスクの対象外。

##### 衝突時の共通処理

全ルーチンが同じパターンを持つ。移動後に4つの判定を呼び、いずれかが真なら:

```c
// 1. ミサイルなら死ぬ
if(temp->attributes & isMissile) temp->health = 0;

// 2. ランダムな符号(+1 または -1)を作る
i = (abs(shortRand() % 2)) * 2 - 1;

// 3. 進行方向と「垂直」にバンプする
switch(temp->facing)
{
    case 1: offsetRect( &temp->where, 0,  temp->speed * i ); break;
    case 2: offsetRect( &temp->where,  temp->speed * i, 0 ); break;
    case 3: offsetRect( &temp->where, 0, -temp->speed * i ); break;
    case 4: offsetRect( &temp->where, -temp->speed * i, 0 ); break;
}

// 4. そこにも立てなければ、動かなかったことにする
if(!enemyStandableRect(currentEnemy)) temp->where = oldRect;

// 5. 向きを再抽選
temp->facing = abs(shortRand() % 5);
```

この「壁に当たったら垂直に滑って向きを変える」挙動が、原作の敵の徘徊感を作っている。
現行の「90°回転」「速度反転」とは体感が異なる。

#### 実装手順

1. `DIRECTIONS` から斜め4方向を除去する。`pickDirection()` は `facing`（0〜4）を返す形に変える。
2. `towards()` を廃し、`homingMonster` の4方向判定ロジックに置き換える。
3. `step()` を `facing` ベースの1軸移動に変える。
4. 上記「衝突時の共通処理」を共通ヘルパとして実装し、各ルーチンから呼ぶ。
5. 未読の3ルーチン（`semihoming`, `gaurdian`, `linear`）は**実装前に必ず原作を読む**こと。
   現行実装は推測で書かれている可能性が高い。

#### 受け入れ条件

タスクHの検証スクリプトを流用し、`movingDiagonally` が **0** になること（修正前は94）。

```js
// 上記タスクHのスクリプトの内側ループに以下を追加
if (e.vx && e.vy && Math.abs(e.vx) > 0.01 && Math.abs(e.vy) > 0.01) diagonal++;
```

加えて実機で、徘徊する敵が壁に当たったとき「垂直に滑ってから向きを変える」ことを目視確認する。

#### 落とし穴

- **配置データに存在する movementType は限られる。**
  `0:45 / 1:298 / 2:16 / 4:27 / 5:15 / 7:149 / 8:4 / 9:9 / 11:5 / 15:7`。
  `3`(smart), `6`(bumpTurn), `10`, `12`(directFire), `13` は配置ゼロなので、
  優先度は `1`(random) > `7`(semihoming) > `4`(gaurdian) > `2`(homing) > `5`(circular) の順。
- 移植版の `speed` には `SPEED_SCALE = 0.7` が掛かっている（`js/enemy.js:47`）。
  原作の `speed` は整数ピクセルなので、4方向化する際にこのスケールを残すか外すか決めること。
  外すと敵が明確に速くなる。**判断が要るのでユーザーに確認すること。**

---

### タスクO: ボスAI 8種を原作実装に置き換える 🟠中・大

#### 現状

`js/enemy_ai.js:287-338` の8種すべてが「`cooldown` を減らして一定間隔で撃つ」汎用パターンの創作。
原作は1種ずつ固有の実装を持つ。

#### 原作の該当関数

| AI | 移植版の現状 | 原作 | 配置数 |
|---|---|---|---|
| 50 hiveBoss | `RANDOM` + 70F間隔 | `EnemyUpdate.c:1331-1405` | 3 |
| 51 crabBoss | 横往復 + sin縦揺れ | `EnemyUpdate.c:1407-1587` | 1 |
| 53 blobBoss | `HOMING` + 90F間隔 | `EnemyUpdate.c:1185-1330` | 3 |
| 54 sentryBoss | `CIRCULAR` + 45F間隔 | `EnemyUpdate.c:1588-1680` | 1 |
| 55 linearBoss | `LINEAR` + 40F間隔 | `EnemyUpdate.c:1681-1759` | 0 |
| 56 rhinoBoss | 突進 | `EnemyUpdate.c:1760-1943` | 2 |
| 57 elementalBoss | `SEMI_HOMING` + 60F間隔 | `EnemyUpdate.c:1944-2024` | 0 |
| 58 finalBoss | `HOMING` + 50F間隔 | `EnemyUpdate.c:2025-2135` | 1 |

**55 と 57 は配置ゼロ**なので後回しでよい。

#### 実装の鍵: 三角関数テーブル

複数のボスが `sineof[]` / `cosof[]` を使う。実体は `GameConstants.c:97`（sine）と
`GameConstants.c:357`（cosine）の **256要素 short 配列**で、値は ±32768 スケール。
`theta` は `unsigned char`（0〜255 が一周）。

JS では以下で等価に置き換えられる（テーブルを移植する必要はない）。

```js
// theta は 0..255 で一周。原作は unsigned char なので自然に wrap する
enemy.theta = (enemy.theta + enemy.speed) & 0xFF;
const angle = (enemy.theta / 256) * Math.PI * 2;
const dx = Math.cos(angle) * enemy.disFromUnitCircle;   // 原作の /32768 はスケール戻し
const dy = Math.sin(angle) * enemy.disFromUnitCircle;
```

`disFromUnitCircle` は `loadScreen()` が生成時に **100 固定**で設定する（`Map.c:145`）。
マップデータ上の値（120/123/172）は**使われない**ので、抽出も参照も不要。

#### 実装例: hiveBoss（`EnemyUpdate.c:1331-1405`）

```c
// 射撃: legCounter >= 32 かつ movePhase & 12 のときだけ
if(temp->legCounter >= 32) {
    if((temp->attributes & canFire) && (temp->movePhase & 12)) {
        where.h = 2; where.v = 2;
        bossFireEnemy(currentEnemy, &where, temp->firedEnemy, true, false);
    }
    temp->legCounter = 16;
    temp->movePhase++;
}

// 見た目のアニメーション（facing を機械的に回す）
temp->facing = ((temp->legCounter / 2) % 4) + 1;
temp->legState = temp->legCounter % 2;
if((temp->legCounter % 16) > 7) {
    temp->facing = 5 - temp->facing;
    temp->legState = !temp->legState;
}

// 移動: Saric の周囲を旋回し、目標へ 1/8 ずつ near づける
temp->theta += temp->speed;
dest.left = g_Saric.where.left - 16 + (cosof[temp->theta] * disFromUnitCircle) / 32768;
dest.top  = g_Saric.where.top  - 16 + (sineof[temp->theta] * disFromUnitCircle) / 32768;
temp->where.left += (dest.left - temp->where.left) / 8;
temp->where.top  += (dest.top  - temp->where.top ) / 8;
```

`circlingMonster`（AI 5）はほぼ同じだが、**中心が Saric ではなく画面中央 `(256, 160)` 固定**で、
補間が `/8` ではなく `/2`（`EnemyUpdate.c:1034-1037`）。現行の「spawn地点まわり・半径40・
theta += 0.06」は中心も半径も速度も違うので、これも併せて直すこと。

#### 実装手順

1. 配置数の多い順（hive 3 → blob 3 → rhino 2 → crab/sentry/final 各1）に着手する。
2. `bossFireEnemy()`（`Enemies.c:438-531`）は `fireEnemy()` と別関数で、
   発射位置を `whereIndex`（タイル単位のオフセット）で指定できる。
   現行の `js/enemy_ai.js:73` の `fireEnemy()` はこの引数に対応していないので拡張が要る。
3. 各ボスの `movePhase` / `theta` / `stuckCounter` の使われ方は個別に読むこと。
   移植版の `Enemy` はこれらを保持していない可能性がある。

#### 受け入れ条件

- hiveBoss がプレイヤーの周囲を旋回する（ランダム徘徊しない）。
- circlingMonster（AI 5、15体）が画面中央を中心に半径100で回る。
- 各ボスが原作と同じテンプレートIDの弾を撃つ。

#### 落とし穴

- **finalBoss は勝利条件と密結合している。**`EnemyUpdate.c:2130` の `health <= 10` で
  `winGame()` が呼ばれる。下記「ユーザー判断が必要な項目」の1番と併せて設計すること。
- finalBoss は床タイルを通行不可に書き換えるギミックを持つ（`EnemyUpdate.c:2063-2066`）。
  移植版の `World` はタイルの実行時書き換えに対応していない可能性がある。

---

## 2. ユーザー判断が必要な項目

**独断で決めず、着手前に確認すること。**第1次から持ち越しで、5件とも未着手のまま。

| # | 項目 | 現状 | 原作 |
|---|---|---|---|
| 1 | 勝利条件 | 5つのマントラ収集 + 画面87到達（`main.js:24,35,515-522`） | 最終ボス `health <= 10` で `winGame()`（`EnemyUpdate.c:2130`）。床封鎖ギミックと 2020/2108/2035 の三段召喚も未実装 |
| 2 | プレイヤーの斜め移動 | あり（実測 dx=1.41, dy=1.41） | 4方向のみ。`Input.c:1055-1163` が最初に成立した1方向で `return` |
| 3 | E キーによる会話 | 残存（`KeyE` 登録済み） | 原作に存在しない。第1次タスクDで接触トリガーを実装済みなので、現在は二重の導線になっている |
| 4 | 原作キー割当 | 未登録。現行は `M`(音), `I`/`Tab`(所持品), `V`(セーブ), `H`(ヘルプ), `E`(調べる) | `P`/`Q`/`ESC` ポーズ（`Input.c:485`）、音量 `0`〜`7`（`Input.c:542-634`）。音量キーは現行の `M` と衝突する |
| 5 | 画面切替演出 | 即座に切替 | `scrollFromScreenToScreen()` でスクロール（`Map.c:284-406`） |

**2番は特に影響が大きい。** タスクN（敵の4方向化）を実施すると、
「敵は4方向・プレイヤーだけ8方向」という非対称が際立つ。同時に決めるのが望ましい。

---

## 3. 触ってはいけないもの（第1次から継続）

原作にそう書いてあるか、移植上の意図的判断。**勝手に「修正」しないこと。**

| 箇所 | 内容 | 根拠 |
|---|---|---|
| `js/map.js` の地形効果 | 下2行（y=8,9）を走査しない | `Input.c:721` の `i > 7` continue |
| 剣の判定 | Saricの矩形を向きへ16px平行移動しただけ（拡大なし） | `Input.c:825-843` |
| オフハンド | 敵への直接ヒット判定を持たない | `Input.c:941-1030` |
| 店 | 売却できない / 購入時に効果音が鳴らない | `Dialogs.c`、`analysis/11_bugs_notes.md` 11-3-4, 11-3-5 |
| 扉のワープ | 効果音が鳴らない | コミット `56945ba` |
| `AI.SMART`(3) | **移動しない**（射撃のみ） | `EnemyUpdate.c:1066-1103` |
| `AI.WAITING_FOR_TIME`(10) | **何もしない** | `Enemies.c:240-242` でcase がコメントアウト |
| `runItemSpecialRoutine` | 原作は 104 の後に `break` が無く 150 へフォールスルーするバグ持ち。移植版は `else if` で修正済み | `Saric.c:182-192`。**この修正は維持してよい** |
| ダメージ属性 | `damageType == 0` の敵30体は原作でも無害になる | `CHECK_IMMUNITIES(a,b) = (b) & (~(a))`、`Utils.h:27` |
| `disFromUnitCircle` | マップデータの値は使わない（実行時に100固定） | `Map.c:145` |

---

## 4. 精査に使ったデータ集計

`assets/data/map.json` 全256画面の走査結果。再確認したくなったとき用。

```
配置敵 586体
  属性別: isEnemy 476 / killable 449 / permanent 531 / canFire 241
          multiFacing 226 / insubstantial 98 / canBeHeld 31 / pushable 5 / isBossEnemy 11
          isEnemy を持たない 110 ← 第1次の進行不能バグの原因
  movementType別: 0:45 1:298 2:16 4:27 5:15 7:149 8:4 9:9 11:5 15:7
                  50:3 51:1 53:3 54:1 56:2 58:1
                  （3, 6, 10, 12, 13, 52, 55, 57 は配置ゼロ）

実機計測（60画面 × 120フレーム、対象176体）
  画面外へ脱出: 8体      ← タスクH
  斜め移動:     94体     ← タスクN
```
