# mantra-web

1995年にMacintosh向けに公開されたアクションRPG **Mantra**(開発: [Syzygy Cult](https://sourceforge.net/projects/syzygymantra/))を、ブラウザで動くように移植するプロジェクトです。

嵐で難破した船から浜辺に流れ着いた Saric を操作し、Zarin の地で主を探す — というゼルダ風の見下ろし型アクションRPGです。

## 現状

| 項目 | 状態 |
|---|---|
| BGM(MOD形式 全9曲) | 完了 — [ブラウザ用プレイヤーを開く](https://hhungry2.github.io/mantra-web/music/) |
| データファイルの解析 | 完了(全 `.dat` の復号・インベントリ把握) |
| グラフィック/マップの抽出 | 完了 — タイル116枚・スプライト211枚・アイコン75枚・全256画面 |
| ゲームデータの解読 | 完了 — アイテム39種・店5軒・敵586体(ボス11体)・看板99箇所・扉60箇所 |
| ゲームエンジン | フェイズ4まで実装 — 256画面を歩き回り、装備・店・セーブ・ボスまで動作 |

データ形式はオリジナルのCソース([SourceForge の syzygymantra](https://sourceforge.net/p/syzygymantra/code/))の構造体定義と照合済みです。タイルの `modifiers`(standable / isDoor / doesDamage / leadsToUnderWorld)、扉の行き先のビット詰め、敵の `movementType` 22種と `messageID`・`deadItem` は、すべて元のヘッダのとおりに実装しています。

ローカルで動かすには、リポジトリ直下で HTTP サーバを立ててブラウザで開いてください(ESモジュールのため `file://` では動きません)。

```bash
# 【推奨】Node.js サーバー (キャッシュ無効化・デュアルスタック対応)
node tools/server.js

# または Python サーバー
python -m http.server 8123
```

ブラウザで `http://localhost:8123/` を開きます。
詳細な操作方法やデバッグコマンドは [docs/START_GUIDE.md](docs/START_GUIDE.md) を参照してください。
移植の詳細な計画は [docs/PLAN.md](docs/PLAN.md) を参照してください。

## オリジナルについて

Mantra は1995年、メイン州ポートランドの高校生6人からなる Syzygy Cult によって開発されました。グラフィックはユタ州の イラストレーター Brett Thayer、音楽は Ben Birney が担当しています。

2009年、Chris O'Neill によって Allegro ゲームライブラリを用いた移植版が作られ、Mac OS X と Windows で動作するようになり、ソースコードが GPLv2 で公開されました。

- オリジナルのソース: https://sourceforge.net/projects/syzygymantra/
- 保存サイト: [Macintosh Repository](https://www.macintoshrepository.org/3741-mantra) / [Macintosh Garden](https://macintoshgarden.org/games/mantra)

## 技術メモ

ゲームのアセットは Allegro の datafile 形式で `.dat` にまとめられており、`packfile_password("musicman3320")` による繰り返しXORで難読化されています(`GameData.dat` / `Images.dat` / `Sound.dat` / `Music.dat` すべて同じ鍵)。

`GameData.dat` の中身は Allegro の標準オブジェクトではなくゲーム独自形式のバイナリブロブで、マップ・スプライト・アイテム・敵テンプレート等がそれぞれ個別の形式で格納されています。

## ライセンス

GPLv2 — オリジナルの Mantra が GPLv2 で公開されているため、本移植もこれを継承します。詳細は [LICENSE](LICENSE) を参照してください。
