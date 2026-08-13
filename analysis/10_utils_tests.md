# 10. ユーティリティ・HUD・テスト

`src/Utils.c`(777行)、`src/Tests.c`(352行)、`src/GameConstants.c`(591行)の仕様。

## 10-1. ユーティリティ(Utils.c)

### 10-1-1. 汎用関数

| 関数 | 内容 |
|---|---|
| `offsetRect(Rect*, h, v)` | Rect を h/v だけ平行移動 |
| `generateRand()` | `rand() & 0xffffffff` の乱数 |
| `shortRand()` | `(short)generateRand()` |
| `mallocHandle(bytes)` | ハンドル(二重ポインタ)を割り当て。`void**` を返し、`*retHandle = malloc(bytes)` |
| `freeMallocHandle(handle)` | 中身とハンドル自体を解放 |
| `freeHandle(a)` | マクロ: `freeMallocHandle((void**)(a))` |

### 10-1-2. 画面・描画

- `createWindow()`(Utils.c:75-96): `set_gfx_mode(GFX_AUTODETECT, 512, 344, 0, 0)` + `g_ScreenBuffer = create_bitmap(512, 344)`。
- `drawBufferToScreen()`(Utils.c:98-101): `blit(g_ScreenBuffer, screen, ...)`。
- `drawFrame()`(Utils.c:276-279): 空(未実装)。

### 10-1-3. パラグラフ描画

- `textout_paragraph_callback_ex()`(Utils.c:121-208): 指定ピクセル幅で単語折返しし、コールバックで各行を描画。改行(`\n`)対応。
- `textout_paragraph_ex()` / `textout_paragraph_aa_ex()`(Utils.c:210-218): アンチエイリアス版/通常版。

## 10-2. HUD(ステータスバー)`drawStats()`(Utils.c:220-274)

- 高さ24px のバーをマップ下部(320-344px)に描画。
- 縦区切り: x=100, 256, 412 にグレーの垂直線。
- 表示項目:
  - **Money**: `Money: %ld`(黄色、x=6)
  - **スタミナ**: グリーン枠 + 緑のフィルバー(105-251 の幅142px)+ 数値
  - **Exp**: `Exp: %ld`(黄色、x=418)
  - **HP**: レッド枠 + 赤のフィルバー(261-407 の幅142px)+ 数値
- バーの塗りつぶし幅は `(現在値 * 142) / 最大値`。

## 10-3. フェード関数

| 関数 | 内容 |
|---|---|
| `fadeInFromColor(RGB)` | 単色パレット → システムパレットへフェードイン(音楽フェード付き) |
| `fadeOutToColor(RGB)` | システムパレット → 単色パレットへフェードアウト |
| `fadeFromColorToColor(from, to)` | 色→色へフェード |
| `fadeFromBlack()` | 黒からフェードイン |
| `fadeToBlack()` | 黒へフェードアウト+バッファクリア |
| `showBitmapCentered(pic)` | 画像を中央表示(黒背景) |

- 各フェードは `FADE_LENGTH`(24)ステップ、`FADE_REST_MILLISECONDS`(10ms)間隔。音楽の `setMusicFadePercent` も同時進行。

## 10-4. クレジット・ヘルプ

- 詳細は [09_opening_sound.md](09_opening_sound.md) の §9-6 / §8-9 参照。

## 10-5. 勝利・敗北

- 詳細は [09_opening_sound.md](09_opening_sound.md) の §9-7 参照。

## 10-6. 三角関数テーブル(GameConstants.c:97-615)

- `short sineof[256]` / `short cosof[256]`: 振幅32767の256要素整数LUT。
- 円運動や弾道計算で使用(`dest = 中心 + cosof[theta] * radius / 32768`)。
- GameConstants.h:120 のコメント「legacy trig funcs in LUTs (really need to fix this...)」のとおり旧式の実装。

## 10-7. テストコード(Tests.c)

デバッグ用の表示テスト関数群(本番では `#ifdef` やコメントで無効化)。

| 関数 | 内容 |
|---|---|
| `testPalette()` | 256色パレットを16×16に表示 |
| `testLoadedIconBitmaps()` | 免疫アイコン/小アイコン/大アイコンを一覧表示 |
| `testLoadedTileBitmaps()` | 200タイルを16×16に表示 |
| `testLoadedEnemyBitmaps()` | 187敵アイコンを一覧表示 |
| `testLoadedSaricBitmaps()` | 16 Saricアイコン表示 |
| `testLoadedSwordBitmaps()` | 4剣アイコン表示 |
| `testLoadedBossBitmaps()` | 51ボスアイコンを8×8に表示 |
| `testSwordAnimData()` | 剣アニメを1フレームずつ表示 |
| `testLoadedTileMasks()` | タイルマスク表示 |
| `testLoadedEnemyMasks()` | 敵マスク表示 |
| `testLoadedSaricMasks()` | Saricマスク表示 |
| `testLoadedSwordMasks()` | 剣マスク表示 |
| `testLoadedBossMasks()` | ボスマスク表示 |

- `testLoadedBitmaps()` / `testLoadedMasks()` は16×16タイル分の大きい画面(512×512)を開いて各テストを実行。
