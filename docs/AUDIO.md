# 音楽再生の仕様

`Music.dat`から抽出したProTracker MODファイル(`assets/music/track_128.mod`〜`track_136.mod`、全9曲)を、外部ライブラリなしのJavaScriptで再生する。この文書は再生エンジンの仕様と、なぜ今の形になっているかの経緯をまとめる。

## ファイル構成

```
js/audio.js              ゲーム本体のSE/音楽マネージャ。js/vendor/js-mod-player/ を使う。
js/mod/
  parser.js               MODファイルパーサ（.mod → {channels, samples, order, patterns, ...}）
  worklet.js               AudioWorkletProcessor本体。tick/row/エフェクト処理とサンプル合成。
  player.js                メインスレッド側ラッパー（ModPlayer）。
music/index.html          9曲を試聴できるアーカイブページ。ENGINEボタンで3エンジンを聴き比べ可能。
old/
  mod.js                  退役: AudioBufferSourceNode版エンジン（ゲーム用コピー、メーターなし）
  music-mod-player.js     退役: 同エンジンのアーカイブページ版（メーター付き、今も"Node"として現役）
  node-adapter.js         music-mod-player.js を js/mod/player.js と同じAPI形に揃えるアダプタ
js/vendor/js-mod-player/  サードパーティ実装（atornblad/js-mod-player）。6ch対応パッチ済み。ゲーム本体で現在採用。
```

## 採用しているエンジン: `js/vendor/js-mod-player/`

ゲーム本体(`js/audio.js`)では `js/vendor/js-mod-player/` を使用しています。
試聴アーカイブページ(`music/index.html`)では引き続き `Worklet` / `Node` / `js-mod-player` の3種類を切り替えて聴き比べが可能です。

1. **`js/mod/parser.js`** — MODバイナリを読んでJSオブジェクトに変換するだけ。チャンネル数はフォーマットタグ(`M.K.`/`4CHN`/`6CHN`等)から判定するので4/6/8chいずれも扱える。
2. **`js/mod/worklet.js`** — `AudioWorkletProcessor`として音声レンダリングスレッドで動く。tick/row/エフェクト処理(period計算、アルペジオ、ポルタメント、ビブラート、ボリュームスライド等)は`old/music-mod-player.js`から**ロジックを変えずに**移植したもの。変えたのは「ノートをどう音にするか」だけ:
   - サンプル読み出しは**nearest-neighbor**（1サンプルごとにインデックスを進めて直接読む。補間なし）
   - チャンネル合算後に**`tanh`によるソフトクリップ**
   - Amiga風のLRRLパンニングをチャンネルごとの`gainLeft`/`gainRight`係数で実装

旧実装(`old/`)は`AudioBufferSourceNode`を1音につき1個生成し、ピッチ変更は`playbackRate`（ブラウザ内蔵のリサンプラーに依存）、音量変更は`GainNode`への`AudioParam`スケジューリングで行っていた。

### 既知の癖（意図的に再現している）

`js/mod/worklet.js`の`processTick()`で、ポルタメント/スライド系エフェクト(1/2/3/5)は、そのtickでの`chObj.period`更新前の値を使ってピッチを設定してしまうため、変化が1tick遅れる。旧実装に元からあった挙動で、移植時に修正せずそのまま残してある（移植の目的は音の作り方の比較であって、エフェクトロジックの修正ではないため）。

### ミキシングの較正

- **チャンネル数によるヘッドロープ**: 全チャンネルのピーク合計が4ch/6ch/8chで揃うよう、ミックスのスケールをチャンネル数に反比例させている(`js/mod/worklet.js`の`mixScale = 2 / count`)。これをやらないと6chの曲(`track_128`, `track_135`)だけ他より約1.8dB熱くなる。
- **旧実装との音量差**: `tanh`ソフトクリップは`DynamicsCompressor`より音を詰める。全9曲で実測したところ、旧実装(`old/`)に対して約+1.85dB。`js/audio.js`と`music/index.html`はどちらも`player.setVolume(0.82)`でこれを補正している。

### 既知のバグ修正

`track_128.mod`のパターン1・行0・チャンネル2に、範囲外の楽器番号`64`（MODは31個までしか持てない）が入っている。ProTrackerはこれを無視するが、素直に配列参照すると`undefined`になる。`js/mod/worklet.js`の`triggerNote()`は`sampleNum <= 31`をチェックして無視するようになっている（`js/vendor/js-mod-player`側にも同種の修正を入れている。後述）。

## シーク/再生位置の単位

MODには曲の「長さ（秒）」という概念がない。BPMやSpeedが曲中で変わり、曲自体も無限ループする。そのため再生位置は**行（row）**で表す: `1オーダー = 64行`、`絶対位置 = オーダー位置 × 64 + 行`。`music/index.html`のシークバーはこの絶対行数を目盛りにしている。`ModPlayer.setRow(position, row)`で任意の位置に飛べる（先読み中の音も含めて全チャンネルを一旦無音化してから移動するので、ジャンプ前の音を引きずらない）。

## アーカイブページの3エンジン比較 (`music/index.html`)

同じ曲・同じ再生位置のまま、以下3つを切り替えて聴き比べられる:

| ボタン | 実装 | 方式 |
|---|---|---|
| **Node** | `old/music-mod-player.js`（`old/node-adapter.js`経由） | AudioBufferSourceNode 1音1ノード、ブラウザのリサンプラー、DynamicsCompressor |
| **Worklet** | `js/mod/`（ゲーム本体と同一） | 同じtick/effectロジックをAudioWorklet内でnearest-neighbor + tanhに移植 |
| **js-mod-player** | `js/vendor/js-mod-player/` | サードパーティ実装(atornblad/js-mod-player)。6ch対応パッチ済み |

3エンジンとも「1サンプルもの間音が途切れない」ようNode基準で音量を実測校正している(Node比: Worklet +0.02dB、js-mod-player −0.2dB、曲ごとの±1dB程度のばらつきは各エンジン固有の音の違い)。

`Node`エンジンは`music-mod-player.js`のModPlayerが自前でAudioContextを持つ設計（外部からdestinationを注入できない）ため、`node-adapter.js`で音量スライダーとトリムを1つのゲインノードにまとめている。メーターも`levels()`が同期プルAPIなので、`requestAnimationFrame`ループでpush型に変換している。

## `js/vendor/js-mod-player` について

[atornblad/js-mod-player](https://github.com/atornblad/js-mod-player)（CC BY-NC 4.0）をフォークして`js/vendor/`配下に置いている。上流は4チャンネル固定の実装で、行/パターンのバイト境界とサンプルオフセットの計算が全て4chベタ書きだったため、6ch曲(`track_128`, `track_135`)が壊れて再生されていた。フォークではフォーマットタグからチャンネル数を読んでストライドを可変にし、ステレオ出力・パンニング・楽器番号の範囲チェック（前述の`track_128`のバグ）を追加している。詳細は`js/vendor/js-mod-player/README.md`を参照。

**ライセンス注記**: 本リポジトリ全体はGPLv2だが、`js/vendor/js-mod-player`はCC BY-NC 4.0（非商用限定）。GPLは追加制限を許さないため、本来は両立しない組み合わせ。個人利用の範囲では実害はないが、再配布を考える場合は要検討（ゲーム本体は`js/mod/`のみを使い、この依存を持たない）。

## ゲーム本体でのSE

`js/audio.js`はMOD再生とは別に、`assets/sfx/*.wav`を`AudioContext.decodeAudioData`で読み込み、`AudioBufferSourceNode`で単発再生している（`sword`/`hurt`/`hit`/`kill`/`door`/`item`/`die`/`fanfare`の8種）。どの効果音がどれかを識別する情報が元データに残っていないため、再生時間の長さから対応関係を推測して割り当てている（`js/audio.js`冒頭のコメント参照）。
