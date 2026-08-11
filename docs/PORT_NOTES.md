# Mantra移植メモ

## 湖・回復泉

原作の`src/Input.c`では、毎フレームSaricの矩形が重なっているタイルを走査し、次の条件を満たすタイルに対して`special`を適用する。

- `modifiers & doesDamage`が立っている
- 扉ではない
- `woundCounter == 0`

処理は`health -= special`であるため、`special`は符号付きの効果量になる。

- `special = -1`: HPを1回復
- `special = -2`: HPを2回復
- `special = -5`: HPを5回復
- 正値: その値だけHPを減らす
- 回復後も最大HPを超えない
- 適用後は`woundCounter`が約30フレーム経過するまで再適用しない

抽出済みマップでは、扉を除く効果タイルに`-1`が37箇所、`-2`が2箇所、`-5`が3箇所、`+10`が1箇所ある。

現行実装では`js/map.js`がSaricの矩形に重なる最初の効果タイルを返し、`js/main.js`が負値を回復、正値を地形ダメージとして30フレーム間隔で適用する。原作ソースにある下2行（`y >= 8`）を走査しない挙動も保持している。

参照:

- `src/Input.c:692-701` — `woundCounter`の進行と解除
- `src/Input.c:714-740` — 効果タイルの走査、回復/ダメージ、最大HP制限
- `include/GameTypes.h:174-180` — `doesDamage`の定義
