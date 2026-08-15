# ローカル起動・プレイ手順書

本プロジェクト（`mantra-web`）は ES Modules および静的データファイル（JSON, PNG, MOD音声等）を使用しているため、HTTP サーバー経由でブラウザから開く必要があります（`file://` 直接開きはブラウザのセキュリティ制限により動作しません）。

---

## 1. サーバーの起動方法

リポジトリ直下（`mantra-web`）で以下のいずれかのコマンドを実行してください。

### 【推奨】方法A: Node.js サーバー（キャッシュ無効化・IPv4/IPv6 両対応）
ファイル編集後もブラウザに最新コードが確実に配信される開発用サーバーです。

```bash
node tools/server.js
```

### 方法B: Python 組み込みサーバー
```bash
python -m http.server 8123
```

### 方法C: npx serve
```bash
npx serve -l 8123
```

---

## 2. ブラウザでアクセス

サーバー起動後、ブラウザで以下の URL にアクセスしてください。

- **URL**: [http://localhost:8123/](http://localhost:8123/)
- **代替URL**: [http://127.0.0.1:8123/](http://127.0.0.1:8123/)

---

## 3. 基本操作方法（キーバインド）

| キー | 動作 |
|---|---|
| **`↑` `↓` `←` `→`** / **`W` `A` `S` `D`** | Saric の移動 |
| **`Shift`**（押しながら移動） | ダッシュ（走る） |
| **`Space`** | 剣を振る / ダイアログ・パネルを閉じる |
| **`F`** | 遠距離武器・オフハンド特殊アイテム（鍵・マントラ等）の使用 |
| **`E`** / **接触** | 看板を読む / NPC と会話する |
| **`I`** / **`Tab`** | 所持品（インベントリ・装備）の開閉 |
| **`V`** | セーブ画面の開閉 |
| **`M`** | BGM / 効果音の ON / OFF 切替 |
| **`H`** | ヘルプ画面の開閉 |
| **`ESC`** | メニュー・ダイアログを閉じる |

※ タッチデバイス（スマートフォン・タブレット）では画面上のバーチャルパッドとボタンで操作可能です。

---

## 4. デバッグ・検証機能（ブラウザコンソール）

ブラウザの開発者ツール（`F12`）のコンソールから `window.mantra` を通じてゲーム状態を直接操作できます。

```js
// 任意の画面（0〜255）へワープ
window.mantra.enter(31);

// 無敵・スタミナ消費なしデバッグモード
window.mantra.player.debugMode = true;

// HP全回復
window.mantra.player.hp = window.mantra.player.hpMax;

// 所持金を増やす
window.mantra.player.gold += 1000;

// 全敵の位置や状態を確認
console.log(window.mantra.enemies);
```

---

## 5. トラブルシューティング

### Q1. `EADDRINUSE: address already in use :::8123` と表示される
ポート 8123 を使用中のプロセスが存在します。PowerShell で以下を実行して停止してください。

```powershell
Get-NetTCPConnection -LocalPort 8123 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Q2. コードを編集したのにブラウザの挙動が変わらない
- `python -m http.server` のキャッシュが残っている場合があります。`node tools/server.js` を使用するか、ブラウザ側で強力再読み込み（`Ctrl + F5` または `Shift + 再読み込み`）を行ってください。
