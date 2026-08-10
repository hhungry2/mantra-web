# mantra-web

1995年にMacintosh向けに公開されたアクションRPG **Mantra**(開発: [Syzygy Cult](https://sourceforge.net/projects/syzygymantra/))を、ブラウザで動くように移植するプロジェクトです。

嵐で難破した船から浜辺に流れ着いた Saric を操作し、Zarin の地で主を探す — というゼルダ風の見下ろし型アクションRPGです。

## 現状

| 項目 | 状態 |
|---|---|
| BGM(MOD形式 全9曲) | 完了 — [ブラウザ用プレイヤー](music/index.html) |
| データファイルの解析 | 完了(全 `.dat` の復号・インベントリ把握) |
| グラフィック/マップの抽出 | 着手前 |
| ゲームエンジン | 着手前 |

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
