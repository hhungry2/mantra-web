# Mantra オリジナルC言語ソース 仕様解析書

本ドキュメント群は、1995年にSyzygy Cultが制作したMac用アクションRPG **Mantra** のオリジナルC言語ソースコード(SourceForge `syzygymantra` プロジェクト、Chris O'NeillによるAllegro移植版 2009/2010年)を、日本語で詳細に解析した結果です。

## 解析対象

- ソース: SourceForge `syzygymantra` SVNリポジトリ(r8)のスナップショット
- ライセンス: GPLv2
- オリジナル作者: Syzygy Cult(Jake Beal / Dustin Mitchell / Macneil Shonle / Christopher O'Neill ほか)
- 移植元: Chris O'Neill による Allegro 移植版(Mac OS X / Windows 対応)

## ファイル構成

| ファイル | 内容 |
|---|---|
| [01_overview.md](01_overview.md) | プロジェクト概要、ディレクトリ構成、ビルドシステム、初期化の流れ |
| [02_data_structures.md](02_data_structures.md) | 主要構造体(`MapItem`/`Enemy`/`Saric`/`Item`/`Store`/`SavedGame`)と定数・列挙型 |
| [03_data_files.md](03_data_files.md) | `.dat` データファイルの完全なバイナリ形式仕様(`LoadData.c`) |
| [04_game_loop.md](04_game_loop.md) | メインループと入力処理(`main.c` / `Input.c`) |
| [05_map_system.md](05_map_system.md) | マップ・画面遷移・スクロール・ドア(`Map.c`) |
| [06_player.md](06_player.md) | プレイヤー(Saric)の仕様(`Saric.c`) |
| [07_enemies.md](07_enemies.md) | 敵システム: 生成・AI全22種・衝突(`Enemies.c` / `EnemyUpdate.c` / `EnemyCollision.c`) |
| [08_dialogs_ui.md](08_dialogs_ui.md) | ダイアログ・インベントリ・店・メッセージ(`Dialogs.c`) |
| [09_opening_sound.md](09_opening_sound.md) | オープニング画面・セーブ選択・サウンド(`OpeningScreen.c` / `Sound.c`) |
| [10_utils_tests.md](10_utils_tests.md) | ユーティリティ・HUD・フェード・クレジット・テスト(`Utils.c` / `Tests.c`) |
| [11_bugs_notes.md](11_bugs_notes.md) | コード上で確認されたバグ・不一致・実装上の注意点 |

## ゲーム基本仕様(要約)

| 項目 | 値 |
|---|---|
| 画面解像度 | 512×344px(マップ 512×320 = 32px×16×10 + ステータスバー24px) |
| ワールド | 16×16 = 256画面 |
| フレームレート | 40ms = 25fps固定(`NUM_MILLISECONDS_BETWEEN_REFRESH`) |
| タイル | 32×32px、1画面160タイル |
| 敵 | 1画面最大16体、テンプレート250種(実データ65種) |
| アイテム | テンプレート250種(実データ39種) |
| メッセージ | 80件 |
| 店 | 5軒 |
| BGM | MOD形式9曲(`Music.dat` オブジェクトID 128〜136) |
| 効果音 | 8種(`Sound.dat` オブジェクトID 128〜138) |
| セーブ | 4スロット |
| データ難読化 | Allegro `packfile_password("musicman3320")`(繰り返しXOR) |
| エンディアン | データファイルはMacintoshビッグエンディアン、読込時にリトルエンディアンへ変換 |

## コード量の内訳

| ファイル | 行数 |
|---|---|
| `include/GameTypes.h` | 351 |
| `include/GameDefines.h` | 57 |
| `src/LoadData.c` | 2,639 |
| `src/Dialogs.c` | 2,437 |
| `src/EnemyUpdate.c` | 2,106 |
| `src/Input.c` | 1,115 |
| `src/EnemyCollision.c` | 1,097 |
| `src/Map.c` | 777 |
| `src/Utils.c` | 777 |
| `src/OpeningScreen.c` | 694 |
| `src/Enemies.c` | 620 |
| `src/GameConstants.c` | 591 |
| `src/Tests.c` | 352 |
| `src/main.c` | 354 |
| `src/Saric.c` | 303 |
| `src/Sound.c` | 246 |
| 合計 | 約16,500行 |

## 解析方針・注意

- すべての記述は**コードに書かれている事実**に基づいています。行番号を併記しています。
- オリジナルのMac版とこのAllegro移植版では一部の挙動が異なる可能性があります(本解析はAllegro移植版のソースが対象)。
- コード内で確認された明らかなバグや未使用コードは [11_bugs_notes.md](11_bugs_notes.md) にまとめています。
- 本解析書は、`mantra-web` プロジェクトのブラウザ移植実装(`js/`)と照合するためのリファレンスとしても利用できます。
