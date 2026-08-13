# 1. プロジェクト概要

## 1-1. ゲームの概要

Mantra は1995年に **Syzygy Cult**(メイン州ポートランドの高校生6人組)によって開発されたアクションRPG。嵐で難破した船から浜辺に流れ着いた主人公 **Saric** を操作し、Zarin の地で主を探す、ゼルダ風の見下ろし型(トップビュー)アクションRPG。

- 2009年、Chris O'Neill によって **Allegro** ゲームライブラリを用いた移植版が制作され、Mac OS X と Windows で動作するようになり、ソースコードが **GPLv2** で公開された。
- 本解析の対象はこの Allegro 移植版のCソースである。1995年のオリジナル68k Mac版のロジックを引き継いでいる(コメントに多数の痕跡がある)。

## 1-2. ソースの入手元

SourceForge プロジェクト `syzygymantra` のSVNリポジトリ。

```
https://sourceforge.net/p/syzygymantra/code/
```

リビジョン履歴:
- r1 (2009-12-23): 初期コード追加
- r5 (2009-12-24): ビルドエラー修正、静的リンク化
- r6 (2010-02-16): ソースヘッダのライセンス修正
- r8: `build` ディレクトリ追加

## 1-3. ディレクトリ構成

```
Mantra.xcodeproj/     Xcodeプロジェクト(旧Mac開発用)
Makefile              ビルド用Makefile
Readme                リードミー
build/                ビルド成果物
dats/                 ゲームデータファイル一式
  ├─ GameData.dat     ゲームデータ本体(Allegro datafile + XOR難読化)
  ├─ Images.dat       静止画データファイル
  ├─ Music.dat        BGM(MOD)データファイル
  ├─ Saved.dat        セーブデータ
  └─ Sound.dat        効果音データファイル
include/
  ├─ GameDefines.h    定義定数
  ├─ GameTypes.h      構造体・列挙型のすべて
  ├─ aldumb.h         音楽再生ライブラリ(DUMB)用ヘッダ
  ├─ alfont.h         TrueTypeフォントライブラリ用ヘッダ
  └─ dumb.h           DUMB(MOD再生)ライブラリヘッダ
libs/
  ├─ osx/             Mac用静的ライブラリ(allegro/dumb/alfont)
  └─ windows/         Windows用静的ライブラリ
src/
  ├─ main.c           エントリポイント、初期化、メインループ
  ├─ GameConstants.c  グローバル変数の定義
  ├─ LoadData.c       データファイル読み込み(最大のファイル)
  ├─ Map.c            マップ描画・画面遷移・スクロール
  ├─ Saric.c          主人公Saricの初期化・描画・特殊アイテム
  ├─ Input.c          入力処理・ゲームプレイ入力(移動/剣/地形)
  ├─ Enemies.c        敵の生成・破棄・描画・更新ディスパッチ
  ├─ EnemyUpdate.c    敵AI全22種の実装
  ├─ EnemyCollision.c 当たり判定(ピクセルマスク)・ダメージ
  ├─ Dialogs.c        ダイアログ(統計/インベントリ/店)
  ├─ OpeningScreen.c  タイトル画面・セーブ/ロード選択
  ├─ Sound.c          サウンド再生(BGM/効果音)
  ├─ Utils.c          ユーティリティ(HUD・フェード・クレジット・勝敗)
  ├─ Tests.c          デバッグ用テスト表示
  └─ (各.h)           関数プロトタイプ
```

## 1-4. ビルドと実行環境

- `Makefile` は `MANTRA_WINDOWS` を定義した場合は `<allegro.h>`、それ以外は `<Allegro/allegro.h>` をインクルードする。
- 依存ライブラリ: **Allegro**(2Dゲームライブラリ)、**DUMB/aldumb**(MOD音楽再生)、**alfont**(TrueTypeフォント描画)。
- Windows版 `Mantra.exe` はすべて静的リンク(`libs/windows/` 配下の `.a` ファイル)。

## 1-5. 初期化の流れ(`main.c`)

### 1-5-1. `initGameData()` (main.c:46-207)

Allegro初期化(`allegro_init` / `install_keyboard` / `install_mouse` / `install_timer`)の後、以下の順でデータを読み込む。失敗時はそれまで確保したデータを解放して戻る。

1. `createWindow()` — 512×344ウィンドウ + `g_ScreenBuffer` 作成
2. `packfile_password("musicman3320")` — データファイルのXORパスワード設定
3. `readItemData()` — アイテム定義 (`GameData.dat#ItemData`)
4. `readMapData()` — マップ (`GameData.dat#MapData` / `#MapArea`)
5. `readTmplEnemyData()` — 敵テンプレート (`GameData.dat#TmplData`)
6. `readMessageData()` — メッセージ (`GameData.dat#TextData`)
7. `readGraphicsData()` — グラフィック (`GameData.dat#MapGraphics` / `#GameSprites` / `#BossData` / `#IconData` / `#SystemPalette`)
8. `readFontData()` — フォント (`GameData.dat#FontData`)
9. `readStoreData()` — 店 (`GameData.dat#StoreData`)
10. `readAnimData()` — 剣アニメーション (`GameData.dat#AnimData`)
11. `readImagesData()` — 静止画 (`Images.dat`)
12. `initSoundData()` — 音楽・効果音 (`Music.dat` / `Sound.dat`)
13. `readSavedGameData()` — セーブデータ (`Saved.dat`)
14. `initInput()` — 入力初期化(2回ポーリングして初期状態確定)

### 1-5-2. `main()` (main.c:215-362)

```
initGameData() 成功後:
  LOCK_FUNCTION/LOCK_VARIABLE でタイマ割り込みを登録

for(;;) {   // ゲーム全体のループ
  showOpeningScreen(first)  → タイトル画面。false なら終了
  g_GameInProgress = 1
  playMusic(現在画面の音楽)
  install_int(timerInc, 1000)   // 1秒ごとに g_GameplayTime++

  for(;;) {   // ゲームプレイのループ
    checkKeys()      → 入力処理。false ならポーズで内側ループ脱出
    updateEnemies()  → 敵AI更新
    g_GameInProgress が false → 勝利/敗北で脱出
    displayCurrentMapScreen() / drawBufferToScreen()   // 描画
    updateSound()    → MOD再生の進行
    rest(40)         → 25fps固定待ち
  }

  fadeToBlack(); stopMusic(); remove_int(timerInc);
}

showCredits();  // 終了時クレジット
各種 free 関数で後始末
```

- `timerInc()` (main.c:209-213): 1秒ごとに `g_GameplayTime++` する割り込みハンドラ(セーブデータのプレイ時間計測用)。
- ゲーム内ループは `checkKeys()` が false を返す(Q/P/ESCでポーズ)と脱出する。

## 1-6. コーディング上の特徴

- 旧Mac(Human Interface Toolbox)由来の**ハンドル**(`mallocHandle`/`freeHandle`)による二重ポインタでリンクリスト管理。
- `Rect`(top/left/bottom/right)構造体を当たり判定・位置管理に使用。
- 三角関数を256要素のルックアップテーブル `sineof[]`/`cosof[]` で実装(GameConstants.c:97-615)。「本当に直す必要がある」(GameConstants.h:120)。
- `Boolean` は `unsigned char` の typedef(`true`=1 / `false`=0)。
- 全マルチバイトデータはビッグエンディアンで保存され、読込時に `bitswap()` でリトルエンディアンに変換(Windows/Allegro対応)。
