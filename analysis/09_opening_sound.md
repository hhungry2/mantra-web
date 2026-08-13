# 9. オープニング画面とサウンド

`src/OpeningScreen.c`(694行)と `src/Sound.c`(246行)の仕様。

## 9-1. タイトル画面 `showOpeningScreen()`(OpeningScreen.c:379-702)

### 9-1-1. 画面構成

- 回転する剣(`g_SwordAnimData[]`)を画面左側に配置。サイズは `g_SwordAnimData[0]->w/h`。
- MANTRAロゴ(`g_MantraBitmap`)を剣の右に配置。
- ボタン5つ: **New / Open / Save / Resume / Quit**。画面右側、全ボタン共通幅。
- `first != 0`(初回起動)のとき Save / Resume はグレーアウト描画かつ入力不可。

### 9-1-2. 操作

- キー: N=New、O=Open、S=Save(!first時)、R=Resume(!first時)、Q=Quit。マウスでも同機能。
- Quit 確定時、`g_GameDirty` が真なら `showAlertDialog("Are you sure you want to quit?...")` で確認。

### 9-1-3. アニメーション(回転剣)

- 毎フレーム `swordIndex++` し、NULLフレームはスキップ(`while(!g_SwordAnimData[swordIndex] && ...)`)。末尾で0に戻す。

### 9-1-4. フェード

- 開始時に `fade_interpolate(black_palette, g_SystemPalette, ...)` で黒→パレットを補間(`FADE_LENGTH`=24ステップ、10ms間隔)。
- ボタン選択後は `fadeToBlack()`。

### 9-1-5. 画面遷移

| 戻り値 | 遷移 |
|---|---|
| 1 | `newGame()` 新規開始 |
| 2 | `showOpenGameScreen()` 成功時 break |
| 3 | `showSaveGameScreen()` 成功時 break |
| 4 | Resume(ゲーム続行) |
| 5 | 終了(`return 0`) |

> 補足: OpeningScreen.c にはストーリー演出は無い。New 選択で直接 `newGame()` へ。

## 9-2. セーブ/ロード共通選択画面 `showSavedGameChoiceDialog()`(OpeningScreen.c:41-336)

- スロット数: `MAX_SAVED_GAMES` = 4。
- 各スロット表示内容:
  - プレイ時間 `%02d:%02d:%02d`(時:分:秒)。
  - 名前(Pascal文字列 → C文字列に変換)。
  - **プレビュー**: 64×40px のミニマップ(`drawScreenPreview(i, previews[i])` で生成)。
- レイアウト: ダイアログ枠+リスト領域(プレビュー+名前+時間)。選択行は背景色で塗り。
- ボタン: Load/Save + "Cancel"。
- 操作: UP/DOWN=選択、ESC/ENTER=キャンセル/確定。マウスでも操作可。
- 確認(warn):
  - `warn == 1` → `showAlertDialog("Are you sure you want to load a new game?...")`(ロード時)
  - `warn == 2` → `showAlertDialog("Are you sure you want to overwrite?...")`(セーブ時)
- 開始時 `fadeFromBlack()`、終了時 `fadeToBlack()`。

## 9-3. `showOpenGameScreen()`(OpeningScreen.c:338-354)

- `showSavedGameChoiceDialog("Load", g_GameDirty != 0)` を呼び、`result >= 0` なら `importSavedGame(result)` して 1。

## 9-4. `showSaveGameScreen()`(OpeningScreen.c:356-377)

- `showSavedGameChoiceDialog("Save", 2)`。`game >= 0` なら `exportSavedGame(game, ...)` を呼び、`g_GameDirty = 0`。

## 9-5. サウンドシステム(Sound.c)

### 9-5-1. 定数(Sound.h)

```
NUM_MUSIC_SONGS = 9
NUM_SOUND_EFFECTS = 11
MIN_VOLUME = 0
MAX_VOLUME = 7
```

### 9-5-2. `initSoundData()`(Sound.c:48-108)

- `packfile_password("musicman3320")` で `Music.dat` を `load_datafile`。
- オブジェクト名 `"128"`〜`"136"` を探し、`g_SongFiles[0..8]` にコピー。→ **BGMはデータファイル内オブジェクトID 128〜136 の9曲(MOD形式)**。
- `Sound.dat` を `g_SoundEffectsDatafile` にロード。
- `g_MusicVolume = 7`、`g_MusicFadePercent = 100`。
- `set_volume_per_voice(2)`、`install_sound(DIGI_AUTODETECT, MIDI_NONE, NULL)`。

### 9-5-3. `playMusic(int song)`(Sound.c:150-200)

- `song != g_CurrentSong` のときのみ実行。
- `dumbfile_open_memory` + `dumb_read_mod()` でMODとして読み込み、`al_start_duh` で再生。
  - チャンネル数 `2`、ミックスバッファ `4096`、周波数 `44100`Hz。
  - ボリューム = `(volume * fadePercent) / (7 * 100)`。

### 9-5-4. 音量管理

- `setMusicVolume(int vol)`: 0〜7の7段階。即時反映(`al_duh_set_volume`)。キー0-7で調整。
- `setMusicFadePercent(int percent)`: フェード用。

### 9-5-5. `playSoundEffect(int num)`(Sound.c:242-255)

- `sprintf(buff, "%d", num)` でオブジェクト名を生成し、`g_SoundEffectsDatafile` から検索。
- `play_sample(tempfile->dat, (255 * volume) / 7, 128(中央), 1000, 0(ループなし))`。

### 効果音IDと呼び出し箇所

| ID | 呼び出し箇所 | 文脈 |
|---|---|---|
| 128 | Input.c:772, 963 | 攻撃・武器振り |
| 129 | EnemyCollision.c:331, 540 | 敵との接触・Saric被弾 |
| 130 | EnemyCollision.c:800, Input.c:904 | 敵ヒット |
| 131 | Enemies.c:138, Utils.c:556 | 敵死亡/勝利 |
| 133 | EnemyUpdate.c:193, EnemyCollision.c:480 | 敵関連 |
| 134 | Saric.c:296 | 鍵/アイテム |
| 137 | EnemyUpdate.c:203, EnemyCollision.c:491 | 敵関連/お金取得 |
| 138 | Utils.c:557 | 勝利/特殊 |

- 効果音の「何の音か」という意味付けは Sound.c 内に記述がなく、呼び出し箇所の文脈から推測するしかない(ブラウザ移植版の `js/audio.js` も再生時間の長さから対応を推測している)。

### 9-5-6. `updateSound()`(Sound.c:257-263)

- `g_DuhMusicPlayer` が存在すれば `al_poll_duh()` でMOD再生を進行。各ダイアログの終了ループからも呼ばれる。

## 9-6. クレジット表示(`showCredits()`、Utils.c:299-393)

- MANTRAロゴ + クレジット文字列をスクロール表示:
  - Programmers: Jake Beal / Dustin Mitchell / Macneil Shonle / Christopher O'Neill**
  - Graphics: Brett Thayer / Ernest Liu**
  - Game Design: Gabe Ganberg
  - Music: Ben Birney
  - ** = new version
- 1px/フレーム上スクロール、`rest(40/3≈13ms)`。キー/マウスでスキップ(その場合 `fadeToBlack()`)。

## 9-7. 勝利・敗北(`winGame()` / `loseGame()`、Utils.c:522-803)

- **`winGame()`**: パレットを白黒化 → `stopMusic` → 効果音131,138 → 白黒フェード → `g_WinBitmap` を中央表示 → `fadeFromBlack` → `waitForKeyPressed` → `g_GameInProgress = 0`。
- **`loseGame()`**: `stopMusic` → 赤へフェード → 赤→黒フェード → `g_LoseBitmap` を中央表示 → `fadeFromBlack` → `waitForKeyPressed` → `g_GameInProgress = 0`。
- 両者ともオリジナルMac版のウィンドウ演出コードがコメントで残っている。
