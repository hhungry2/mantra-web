# 3. データファイル形式の完全仕様

`src/LoadData.c`(2,639行)による `.dat` ファイルの読み込み仕様。

## 3-1. 共通仕組み

### 3-1-1. XOR難読化(パスワード)

```
packfile_password("musicman3320");
```

- すべてのデータファイル(`GameData.dat` / `Images.dat` / `Music.dat` / `Sound.dat`)は **Allegro の `packfile_password` による繰り返しXOR**で難読化されている。鍵は `"musicman3320"`。
- セーブ系(`Saved.dat` 等)は `packfile_password(NULL)` で開く(難読化なし)。
- `Music.dat` 内のMODデータについても、この鍵で展開される(Allegro datafile 形式)。

### 3-1-2. エンディアン

- データファイルは **Macintosh ビッグエンディアン**で保存。
- `ALLEGRO_LITTLE_ENDIAN` 環境では `bitswap()`(LoadData.c:74-89)で読み込み時にリトルエンディアンへ変換する。
- `bitswap` はバイト列を in-place 反転(1バイト=無変換、2バイト=short、4バイト=long)。

### 3-1-3. PackBits圧縮

- グラフィック系は **Macintosh PackBits** 圧縮(1995年の68k Mac由来)。
- `myUnpackBitsSrc()`(LoadData.c:91-150): 制御バイト <0 なら「(-byte)+1 回リピート」、>=0 なら「byte+1 バイトのリテラル」。ソースバイト数で境界判定。
- `myUnpackBitsDest()`(LoadData.c:152-204): デスト先バイト数で境界判定するバリエーション。
- Allegro標準のRLE圧縮ではない(README/PLANの注記と一致)。

### 3-1-4. IconHeader(アイコン/リソースレコードのヘッダ)

```c
typedef struct { short id; long len; } IconHeader;   // 6バイト
```

- `id` = リソースID、`len` = 続くデータ長。
- id=-1 がリソースの終端。

## 3-2. 各オブジェクトの形式

### 3-2-1. `GameData.dat#ItemData` — アイテム定義(readItemData, L946-1112)

- 形式: IconHeaderの連続。
  - `id == -1` → 終端。
  - `id ∈ [16000, 16000+250)` → アイテム `index = id - 16000`。
  - それ以外 → `header.len` バイトをスキップ。
- アイテム1個のデータ = `DataFileItem` 構造体(535〜536バイト)。レイアウト:

| オフセット | サイズ | フィールド |
|---|---|---|
| 0x000 | 256 | name(Str255 Pascal文字列) |
| 0x100 | 256 | description(Str255) |
| 0x200 | 4 | attributes(long) |
| 0x204 | 1 | armor |
| 0x205 | 1 | damage |
| 0x206 | 1 | speed |
| 0x207 | 1 | rateOfFire |
| 0x208 | 1 | fireCounter |
| (0x209 | 1 | パディング) |
| 0x20A | 2 | charges |
| 0x20C | 1 | stamina |
| 0x20D | 1 | damageHealed |
| 0x20E | 2 | quantity |
| 0x210 | 2 | spriteRef |
| 0x212 | 2 | firedMonsterID |
| 0x214 | 2 | immunities |
| 0x216 | 2 | damageType |

- name/description はPascal文字列(先頭1バイト=長さ)で、C文字列に変換して `g_ItemTemplates[idx]` に格納。

### 3-2-2. `GameData.dat#MapArea` — 地域情報(readMapData, L1120-1148)

- `NUM_SCREENS`(256)個の `RegionCell`(2バイト: `musicIndex` + `nameIndex`)を一括読み。エンディアン変換なし。
- 合計512バイト。

### 3-2-3. `GameData.dat#MapData` — マップ(readMapData, L1150-1188)

256画面それぞれについて:

| 内容 | バイト数 | 合計 |
|---|---|---|
| タイル160個 × readMapItem(8バイト) | 1280 | ×256画面 |
| 敵16体 × readEnemy(64バイト) | 1024 | ×256画面 |
| **1画面あたり** | **2304** | **589,824バイト全体** |

- **MapItem(8バイト)** の読み込み(readMapItem, L289-310):

| オフセット | サイズ | フィールド |
|---|---|---|
| 0x00 | 1 | modifiers |
| 0x01 | 1 | garbage(読み捨て) |
| 0x02 | 2 | special |
| 0x04 | 2 | spriteRef |
| 0x06 | 2 | expansion |

- **Enemy(64バイト)** の読み込み(readEnemy, L206-287): 構造体フィールドを逐次読み。先頭8バイト(`previousEnemy`/`nextEnemy`)はMac実行時ハンドルで、ゲーム初期化時に NULL に置き換えられる(実際のロード時は無視/上書き)。

### 3-2-4. `GameData.dat#TmplData` — 敵テンプレート(readTmplEnemyData, L1193-1274)

- 形式: IconHeaderの連続。id=-1 で終端。
  - `id ∈ [2000, 2000+250)` → 敵テンプレート `index = id - 2000`。1体64バイトの `Enemy` 構造体。
- テンプレートID 2056(インデックス56)は「瀕死/死のアニメーション用」敵テンプレートとして `killCurrentEnemy` が参照。

### 3-2-5. `GameData.dat#TextData` — メッセージ(readMessageData, L1276-1310)

- 80本のメッセージ。各メッセージはEOFまたは0までバイトを読み、`g_Messages[i][j] = tempchar - 126` で復号。
- **文字は「実文字 + 126」のオフセットでエンコード**されている。

### 3-2-6. `GameData.dat#SystemPalette` — パレット(readPalette, L1312-1342)

- 256エントリ × RGB各1バイト = 768バイト(ヘッダなし固定レイアウト)。
- 8bit値(0-255)を `/4` して6bit値(0-63)に変換し `g_SystemPalette` に格納。
- 変換後、`g_BlackColor = makecol(0,0,0)`、`g_RedColor = makecol(63,0,0)`。

### 3-2-7. `GameData.dat#MapGraphics` — タイル(readGraphicsData, L1373-1476)

- IconHeader連続。PackBits展開して1024バイト(32×32)の一時バッファへ。
  - `id ∈ [1000, 1000+200)` → タイル画像 → `tileIcons[id-1000]`
  - `id ∈ [3000, 3000+200)` → タイル透過マスク → `tileMasks[id-3000]`
  - 他 → スキップ

### 3-2-8. `GameData.dat#GameSprites` — スプライト(readGraphicsData, L1482-1644)

- IconHeader連続。PackBits展開。
  - `id ∈ [2000, 2000+187)` → 敵アイコン(32×32)
  - `id ∈ [1000, 1000+16)` → Saricアイコン(32×32)
  - `id ∈ [995, 995+4)` → 剣マスク(32×32)
  - `id ∈ [1500, 1500+4)` → 剣アイコン(32×32)
  - `id == 999` → Saricマスク(32×32)

### 3-2-9. `GameData.dat#BossData` — ボス(readGraphicsData, L1652-1680)

- **ヘッダなし・PackBitsなしの生データ**。51枚 × 4096バイト(64×64) = 208,896バイトを一括読み。
- マスクはファイルから読まず、**画素が0か否か**で自動生成(`g_BossMasks`)。

### 3-2-10. `GameData.dat#IconData` — アイコン(readGraphicsData, L1682-1821)

- IconHeader連続。**PackBitsなし**(生データ)。
  - `id ∈ [132, 132+10)` → 免疫アイコン(16×16)
  - `id ∈ [15000, 15000+250)` → アイテム小アイコン(16×16)
  - `id ∈ [16000, 16000+250)` → アイテム大アイコン(32×32)
- **ファイルデータは列優先(転置)で格納**されており、`putpixel(bitmap, j, k, buf[(k*16)+j])` で転置してビットマップ化。

### 3-2-11. `GameData.dat#FontData` — フォント(readFontData, L1977-2064)

- 先頭4バイト = フォントデータ長 `size`(ビッグエンディアン)。
- 続く `size` バイトを `alfont_load_font_from_mem` で読み、`g_Font`/`g_DialogFont`/`g_LargeFont` の3つに同じデータをロード。
- フォントサイズ: 6 / 6 / 15。

### 3-2-12. `GameData.dat#StoreData` — 店(readStoreData, L2066-2140)

- ヘッダなし固定順。5軒分:
  - `quote`: Str255(256バイト、Pascal文字列)
  - `count`: short(商品数)
  - `item`: count × `StoreItem`(short index + short price = 4バイト)
- 計1,350バイト。

### 3-2-13. `GameData.dat#AnimData` — 剣アニメ(readAnimData, L2142-2251)

- `NUM_SWORD_FRAMES`(1000)フレームまで、EOFまで続行。
- 各フレーム: 300×300ビットマップを黒クリア。
  - 制御バイト0 → フレーム終了、EOF → ファイル終了。
  - 制御バイト `i`(7〜36) → ポリゴン:
    - 続く `r, g, b`(各unsigned short)、`readSize`(short)、`readRect`(short×4)を読み。
    - `i -= 6` し、`readSize == i` でなければエラー。
    - `numpoints = (readSize - 2 - 8) / 4`。
    - 各点(short×2)を読み、`polygonPoints[i*2] = h + 150`(+150で300×300中央へ)。
    - `polygon()` で塗りつぶし。色は `makecol(r/256, g/256, b/256)`。

### 3-2-14. `Images.dat` — 静止画(readImagesData, L2394-2491)

- `load_datafile` で読み、`find_datafile_object` で名前で探す:
  - `"win"` → g_WinBitmap
  - `"lose"` → g_LoseBitmap
  - `"story"` → g_StoryBitmap
  - `"mantra"` → g_MantraBitmap
  - `"cursor"` → g_CursorBitmap
  - `"help"` → g_HelpBitmap
- 単純な `[bpp][w][h]+画素` 形式(実データで確認済み)。

### 3-2-15. `Music.dat` — BGM(initSoundData, Sound.c)

- オブジェクト名 `"128"`〜`"136"`(`sprintf(buff, "%d", i + 128)`、i=0..8)を探す = **9曲、ID 128〜136**。
- `dumb_read_mod()` でMOD形式として再生。44100Hz、ミックスバッファ4096。

### 3-2-16. `Sound.dat` — 効果音(initSoundData, Sound.c)

- `g_SoundEffectsDatafile` にロード。オブジェクトIDで `play_sample`。
- ゲーム内で使用される効果音ID: 128, 129, 130, 131, 133, 134, 137, 138(8種)。

## 3-3. セーブデータ(`Saved.dat`)

### 3-3-1. SavedGame のファイル形式(readSavedGame, L654-684 / writeSavedGame, L686-717)

| 内容 | バイト数 | 備考 |
|---|---|---|
| name | 256 | Str255 Pascal文字列 |
| time | 8 | LONG_LONGプレイ時間 |
| Saric | 構造体分 | readSaric/writeSaric で読み書き |
| mapScreen | 4 | Point(v, h) |
| deathRecord | 512 | unsigned short ×256 |

### 3-3-2. Saric のファイルレイアウト(readSaric, L360-511)

| 内容 | サイズ |
|---|---|
| where(Rect) | 8 |
| legCounter | 1 |
| garbage(フィル) | 1 |
| health, maxHealth | 2+2 |
| armorValue, damage, legState | 1+1+1 |
| garbage(フィル) | 1 |
| spriteRef | 2 |
| oldPosition(v,h) | 4 |
| facing, speed | 1+1 |
| oldSword(v,h) | 4 |
| swordOut, wasSwordOut, logicalWasSwordOut, offHandOut, logicalOffHandWasOut, hadHitEnemy | 6 |
| experience, nextLevel | 4+4 |
| level, woundCounter | 2+2 |
| sitCounter, runCounter, incrementalDamageCounter, wasOnDoor | 4 |
| itemQuantities[250] | 500 |
| itemEquipped[250] | 250 |
| itemCharges[250] | 500 |
| itemEffects[0..2] | 3×sizeof(Item) |
| messageCounter, stamina, maxStamina, money, immunities, damageType | 2+2+2+4+2+2 |

### 3-3-3. セーブの流れ

- `Saved.dat`: `MAX_SAVED_GAMES`(4)件の SavedGame を単純連結したもの。
- `SavedOriginal.dat`: `createSavedGameData`(L2253-2290)が書き出す初期セーブ(4件とも "New Game"、deathRecord全0xFF)。
- `importSavedGame(game)`(L2349-2369): `g_SavedGames[game]` をゲーム状態へ反映。
- `exportSavedGame(game, name)`(L2371-2392): 現在状態をスロットへ保存し `writeSavedGameData()`。
- `openGame(filename)`(L744-820): 旧形式の単一セーブファイル読み込み(コメントアウトされたデバッグ用)。

## 3-4. データ量まとめ

| オブジェクト | ID範囲 | 個数 | 形式 |
|---|---|---|---|
| ItemData | 16000-16249 | 250 | IconHeader + DataFileItem |
| TmplData | 2000-2249 | 250 | IconHeader + Enemy(64B) |
| MapGraphics | 1000-1199 / 3000-3199 | 200+200 | IconHeader + PackBits(→1024B) |
| GameSprites | 2000-2186 / 1000-1015 / 995-998 / 1500-1503 / 999 | 187+16+4+4+1 | IconHeader + PackBits |
| BossData | — | 51 | 生データ 4096B×51 |
| IconData | 132-141 / 15000-15249 / 16000-16249 | 10+250+250 | IconHeader + 生データ(転置) |
| FontData | — | 1 | 4B長 + alfontフォント |
| StoreData | — | 5 | Str255 + short + StoreItem×count |
| AnimData | — | ≤1000 | ポリゴン列 |
| TextData | — | 80 | ヌル終端 +126オフセット文字列 |
| SystemPalette | — | 256 | RGB×3B |
| MapArea | — | 256 | RegionCell×2B |
| MapData | — | 256画面 | (160×8)+(16×64)=2304B/画面 |

**実データの総量(ブラウザ移植の抽出結果との対応)**:
- MapData 589,824B / BossData 208,896B / FontData 190,448B / GameSprites 84,381B / MapGraphics 76,614B / AnimData 54,246B / IconData 48,840B / ItemData 21,144B / TmplData 4,556B / TextData 3,953B / StoreData 1,350B / SystemPalette 768B / MapArea 512B

## 3-5. 読み込み順序とリソース解放

- `initGameData()`(main.c)が 3-1 の順で全オブジェクトを読み込む。
- 失敗時は `freeXxxData()` で順次解放(LoadData.h:64-73)。
- 解放漏れの既知バグ: `freeImagesData()` は `g_HelpBitmap` を解放しない(L2663-2694)。
