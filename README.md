# mantra-web

1995年にMacintosh向けに公開されたアクションRPG **Mantra**(開発: [Syzygy Cult](https://sourceforge.net/projects/syzygymantra/))を、ブラウザで動くように移植するプロジェクトです。

嵐で難破した船から浜辺に流れ着いた Saric を操作し、Zarin の地で主を探す — というゼルダ風の見下ろし型アクションRPGです。

## 現状

| 項目 | 状態 |
|---|---|
| BGM(MOD形式 全9曲) | 完了 — [ブラウザ用プレイヤーを開く](https://hhungry2.github.io/mantra-web/music/) |
| データファイルの解析 | 完了(全 `.dat` の復号・インベントリ把握) |
| グラフィック/マップの抽出 | 完了(フェイズ0) — タイル116枚・スプライト211枚・全256画面 |
| ゲームエンジン | フェイズ1完了 — 1画面の垂直スライスが遊べる状態 |

フェイズ1では、実データの1画面(画面17)の中で Saric を8方向に動かし、タイルのピクセル単位マスクで地形に当たり、剣で敵を倒せます。画面遷移とアイテム/店/ボスはこれからです。

ローカルで動かすには、リポジトリ直下で HTTP サーバを立ててブラウザで開いてください(ESモジュールのため `file://` では動きません)。

```bash
python -m http.server 8123
```

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
