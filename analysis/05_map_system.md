# 5. マップ・画面遷移・スクロール

`src/Map.c`(777行)の仕様。

## 5-1. 画面構成

- 1画面 = **16列 × 10行 = 160タイル**、タイルは32×32px。
- マップ領域は 512×320px、その下にステータスバー24px → 画面全体 512×344px。
- ワールドは 16×16 = **256画面**(`NUM_SCREENS`)。画面番号 `index = gridY * 16 + gridX`。
- 地下世界は 16×16 グリッドの**下半分(8行ぶん下)**。

## 5-2. マップデータの格納順

- `g_MapScreens[g_CurrentScreen].tiles[(x * 10) + y]`(列優先)が正しいアクセス(GameConstants.h:39)。
- 描画時は `blit(g_TileIcons[g_MapScreens[g_CurrentScreen].tiles[(x * 10) + y].spriteRef - 1000], ...)`(Map.c:215)で、**spriteRef-1000** が `g_TileIcons` のインデックス。

## 5-3. `initMapStuff()`(Map.c:42-62)

- `g_DeathRecord[i] = 0xFFFF`(全ビット1 = 全敵生存)を256画面分セット。
- `g_CurrentScreen` の特定タイル(6〜9,9)の `modifiers |= standable` を強制(テスト用の片付け)。
- `g_FirstEnemy` ヘッダノードを `mallocHandle(sizeof(Enemy))` で確保。

## 5-4. `loadScreen(int index)`(Map.c:65-158) — 敵の生成

1. `g_CurrentScreen = index` に更新。
2. `clearEnemies()` で前画面の敵を全消去。
3. 各画面の `enemies[16]` を走査:
   - `spriteRef < 2000` なら終端(16体すべてが使われているとは限らない)。
   - **撃破判定**: `!(g_DeathRecord[g_CurrentScreen] & (1 << i))` なら撃破済み:
     - `!permanent` または `generateRand() & 0x0F`(15/16の確率)なら生成スキップ。
     - `permanent` かつ乱数の下位4ビットが0(1/16)のときだけ再出現し、`g_DeathRecord |= (1 << i)` でビット再セット。
4. 生成した敵の初期化:
   - 位置: `originalPosition * 32`(タイル座標×32)。
   - テンプレート情報をコピーし `attributes |= originalToRoom`、`originalNumber = i`。
   - `theta = 0`、`disFromUnitCircle = 100`、`angledCourse = 0`、`stuckCounter = 0`。
5. `g_EnemiesInRoom = numEnemies`。

### 撃破記録(g_DeathRecord)の仕組み

- 1画面16体を16ビットのビットマスクで管理。**1=生存、0=死亡**。
- 敵が倒されると `updateEnemies`(Enemies.c:164)で `g_DeathRecord[g_CurrentScreen] &= ~(1 << originalNumber)` によりビットが0になる。
- `permanent` 属性の敵のみ、部屋再訪時に1/16の確率で復活し、ビットが再び1に戻る(ただし倒した直後の再訪では復活しない)。

## 5-5. 描画関数

| 関数 | 内容 |
|---|---|
| `displayCurrentMapScreen()` | `displayCurrentMapScreenBlit(true, true)` |
| `displayCurrentMapScreenSaric(Boolean)` | `displayCurrentMapScreenBlit(drawSaric, true)` |
| `displayCurrentMapScreenBlit(drawSaric, drawOnScreen)` | タイル(列優先)→敵(`drawEnemies`)→Saric(`drawSaric`)→`drawStats()`→(必要なら)`drawBufferToScreen()` |

- `drawScreenPreview(game, bitmap)`(Map.c:160-192): セーブ画面のプレビュー用。タイル + Saricを描画し、`stretch_blit` で縮小。

## 5-6. フェード・ウィンドウ演出

- `blackenInward(i, max)`(Map.c:237-245): 4辺から内側へ黒で塗りつぶす。
- `clearWindowInwards()`(Map.c:247-259): 20フレームかけて画面を中央へ閉じる(ブラックアウト)。
- `wipeWindowOutwards()`(Map.c:261-281): 20フレームかけて画面を外側へ開く。
- 各フレーム `updateSound()` + `rest(40ms)`。

## 5-7. 画面スクロール(`scrollFromScreenToScreen`, Map.c:284-404)

- 2画面分のスクロールビットマップを作成し、5px(上下)または6px(左右)ずつスクロールしながら描画。
- 方向: 1=下, 2=上, 3=左, 4=右。
- スクロール中も `updateSound()` + `rest(NUM_MILLISECONDS_BETWEEN_REFRESH / 4)`(10ms)。

## 5-8. `checkForRoomChange()`(Map.c:407-650) — 部屋移動判定

### 5-8-1. 画面端の判定(50%以上はみ出したら)

```
bottom > 320 + 16 → 下へ(handleTheRoomChange(1))
top    <  -16     → 上へ(2)
left   <  -16     → 左へ(3)
right  >  512+16  → 右へ(4)
```

### 5-8-2. ドアの判定

Saricの矩形が重なるタイルを走査し、`modifiers & isDoor` のタイルについて、Saricがタイルの中心(±12px以内)にいれば:

**地下世界ドア(`leadsToUnderWorld`)**:
- `wasOnDoor` が true なら `stillOnDoor=true`(再判定防止)。
- `clearWindowInwards()`(ブラックアウト)。
- ドアが `doesDamage` なら `health -= tile.special`(この場合は `woundCounter = 1` をセット)。
- `g_CurrentScreen / 16 < 8`(地上)なら `g_CurrentScreen += 8 * 16`(地下へ)、それ以外は `-= 8 * 16`。
- Saricの位置をドアタイルの位置にセット。
- `loadScreen` → `displayCurrentMapScreenBlit(true, false)` → `drawStats()` → `wipeWindowOutwards()`。
- 移動先が立地不可(`!standableRect`)なら再度上下どちらかに移動し、`loadScreen` し直す(逆側のドア)。
- `wasOnDoor = true`、`playMusic(新しい画面の音楽)`。

**テレポートドア(通常の扉、`special` 使用)**:
- `wasOnDoor` が true なら `stillOnDoor=true`。
- `clearWindowInwards()`。
- 行き先を `special` から分解:
  ```
  newLoc.h = (special & 0xF0) >> 4;   // 行き先タイルx
  newLoc.v =  special & 0xF;          // 行き先タイルy
  g_CurrentScreen = ((special & 0xF00) >> 8) * 16 + ((special & 0xF000) >> 12);
  // 画面列 = specialビット12-15、画面行 = specialビット8-11
  ```
- Saricの位置を `newLoc * 32` にセット → `loadScreen` → 描画 → `wipeWindowOutwards()`。
- 移動先が立地不可なら `g_CurrentScreen` と `g_Saric.where` を**元に戻す**。
- `wasOnDoor = true`、`playMusic(新しい画面の音楽)`。

### 5-8-3. `wasOnDoor` のリセット

- ドア判定がなければ `g_Saric.wasOnDoor = stillOnDoor`。

## 5-9. `handleTheRoomChange(char direction)`(Map.c:653-795)

- 隣接画面の番号を計算(端では変化しない):
  - 下(1): `g_CurrentScreen / 16 < 16` なら +16
  - 上(2): `> 0` なら -16
  - 左(3): `% 16 > 0` なら -1
  - 右(4): `% 16 < 16` なら +1
- `scrollFromScreenToScreen(g_CurrentScreen, nextScreen, direction)` でスクロール。
- SaricのRectを1画面分オフセット(下=0,-320 / 上=0,+320 / 左=+512 / 右=-512)。
- `g_CurrentScreen = nextScreen`、`displayCurrentMapScreen()`、`drawStats()`、`playMusic()`。
- **安全ガード**: 移動先で立地不可なら `g_Saric.where = oldSaricRect` に戻し、さらに1画面分+20px戻す。

## 5-10. 音楽の切り替え

- 画面遷移のたびに `playMusic(g_MapRegions[g_CurrentScreen].musicIndex)` を呼ぶ。
- `g_MapRegions` は `MapArea` データ(各画面の `musicIndex`)。BGM番号は1-9。
