# 11. コード上で確認されたバグ・不一致・注意点

解析中にコード上で確認された明らかなバグ、実装とコメントの不一致、仕様の注意点をまとめる。

## 11-1. 確実なバグ

### 11-1-1. `readSaric`/`writeSaric` の itemEffects エンディアン変換漏れ(LoadData.c:480, 560)

- `itemEffects` の BITSWAP ループが `for(i = 0; i < 2; i++)` になっており、**itemEffects[2] だけエンディアン変換されない**。読み書き自体は [0..2] の3つを扱う(429-431, 637-639行)ため、リトルエンディアン環境で3番目の装備効果が壊れる可能性がある。

### 11-1-2. `readSavedGame` の deathRecord 変換先ミス(LoadData.c:677-680)

- `deathRecord` は `game->deathRecord` に読み込むが、BITSWAP ループは**グローバル配列 `g_DeathRecord[i]`** に対して実行される。実際のフィールドはエンディアン変換されない。

### 11-1-3. `freeImagesData` の解放漏れ(LoadData.c:2663-2694)

- `g_HelpBitmap` を解放しない(readImagesData では読み込む)。

### 11-1-4. `runItemSpecialRoutine` のフォールスルー(Saric.c:182-192)

- アイテム104 → `powerMantraItem()` の後に **break がなく**、150 → `keySpecialItem()` にフォールスルーする。アイテム104使用時は鍵の特殊処理も実行されてしまう。

### 11-1-5. `mouseMoved()` の実装と名前の不一致(Input.c:415-422)

- マウス移動ではなく**縦ホイールの変化**を返す。水平ホイール分はコメントアウト。

### 11-1-6. `anyKeyPressed()`/`anyKeyReleased()` の漏れ(Input.c:194-253)

- 判定列挙から `MANTRA_KEY_E` が含まれていない。

### 11-1-7. `waitingForTime=10` のAIが未実装(Enemies.c:240-242)

- `updateEnemies` 内で該当ケースがコメントアウトされており、このmovementTypeの敵は何もしない。

### 11-1-8. `worm=14` / `lizardBoss=52` が無効化(Enemies.c:246-261)

- コメントアウトで無効化。

## 11-2. 実装とコメント・旧仕様の不一致

### 11-2-1. MapData のタイル形式

- GameTypes.h:183-190 のコメントでは「160個の7バイトMapItem(1120バイト)+16敵(560バイト)=1680バイト/部屋」と記述。
- 実際の実装は **8バイトMapItem + 64バイトEnemy = 2304バイト/画面**。実データサイズ(589,824バイト)と一致するのは**後者**。

### 11-2-2. `waitingForSaric` の `target`

- `target` フィールドはコメントで「may also store message number」とあるが、実際はマンハッタン距離の閾値として使われている。

## 11-3. 仕様・挙動の注意点

### 11-3-1. 地形ダメージの走査範囲(Input.c:721)

- `i > 7` で continue のため、**縦10行の部屋の下2行(行8-9)のダメージタイルは判定されない**。オリジナルの意図的挙動かバグかは不明だが、ブラウザ移植版(`js/map.js`)はこの挙動を再現している。

### 11-3-2. 剣のヒットボックス(Input.c:825-843)

- Saricの矩形を向き方向へ16px平行移動しただけ(サイズ拡張なし)。

### 11-3-3. オフハンド武器は敵への直接ヒット判定がない(Input.c:941-1030)

- 剣のみ直接ヒット判定ループを持つ。オフハンド武器は飛び道具(`saricFireEnemy`)か特殊ルーチン(`runItemSpecialRoutine`)経由のみ。

### 11-3-4. 店の売却は未実装(Dialogs.c)

- "Your Items" タブは表示専用。売却処理はコメントのみ。

### 11-3-5. 購入時の効果音なし(Dialogs.c:2002, 2006)

- 購入/失敗とも効果音呼び出しはコメントのみ。

### 11-3-6. 店の引用文は表示されない(Dialogs.c:1764-1765)

- `g_Stores[param].quote` の描画はコメントアウト。

### 11-3-7. `smart=3` AIは移動しない(EnemyUpdate.c:1066-1103)

- コメント「even appear to move」のとおり、smart タイプの敵は一切移動しない(発射のみ)。

### 11-3-8. `crabBoss` の衝突時は必ず元位置に戻す(EnemyUpdate.c:1557-1575)

- 垂直跳ね後に `where = oldRect` で戻す(コメント「previous part pointless」)。

### 11-3-9. `checkEnemyInterceptWithEnemies` の呼び出し

- 衝突チェック4連は `+=` で加算しており、全関数が毎回呼ばれる(コメントで「||にすべき」と注記、EnemyUpdate.c:421-425)。

### 11-3-10. アイテムテンプレートの初期化

- `initSaric` で全250種の `itemCharges[i] = g_ItemTemplates[i].charges` をコピーしている。

## 11-4. データ解読の重要なポイント

- **メッセージ**: TextData は `実文字 + 126` のオフセットでエンコード(LoadData.c:1296)。
- **タイル**: `spriteRef - 1000` が `g_TileIcons` のインデックス。
- **敵**: `spriteRef - 2000` が `g_EnemyIcons` のインデックス。
- **剣アニメ用の敵テンプレート**: 2056(インデックス56)。
- **ボススプライト**: `g_BossIcons[spriteRef - 2000]`(64×64)。
- **アイテム**: `spriteRef - 16000` がアイテム番号。

## 11-5. ブラウザ移植版(mantra-web)との主な対応・差分

| 項目 | 本Cソース | mantra-web(js/) |
|---|---|---|
| フレームレート | 25fps(`rest(40)`) | 25fps固定タイムステップ |
| タイル通行 | `modifiers & standable` | `MOD.STANDABLE` |
| ドア行き先 | `special` ビット詰め | `doorAt()` で同様に分解 |
| 地下世界 | `screenIndex ± 8*16` | `UNDERWORLD_OFFSET = 8*16` |
| 地形効果 | `health -= special`、woundCounter30 | `terrainEffectAt()` + 30フレーム |
| 敵AI | 22種(ボス8種) | `enemy_ai.js` の `AI` |
| 撃破記録 | `g_DeathRecord` ビットマスク | `defeatedMasks`(Uint16Array) |
| アイテム属性 | `isSword` 等のビット | `FLAG` |
| 装備効果 | `itemEffects[3]` | `weapon/offhand/armor` |
| セーブ | 4スロット + deathRecord | localStorage + スロット |
| 勝利条件 | finalBoss `health<=10` で `winGame()` | 5 Mantra 収集 + Castle Blednock |

- ブラウザ移植版は、床の透過マスクを当たり判定に使わず `modifiers` を信用する点、地形効果の下2行スキップ、敵の `speed:0` は停止、など本Cソースの挙動を忠実に再現しようとしている。
