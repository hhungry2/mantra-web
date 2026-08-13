# 8. ダイアログ・UI

`src/Dialogs.c`(2,437行)と `src/Dialogs.h`(57行)の仕様。

## 8-1. ダイアログ全体の状態機械 `gameDialog()`(Dialogs.c:2401-2449)

- `gameDialog(display, param)` で表示するダイアログ種別を指定。
- `Boolean canDoStore = (display == dialogStore)` — 店に入れるのは「開始が dialogStore だった場合」だけ。
- `while(flag)` + `switch(display)` で遷移:
  - `dialogClose` → 終了
  - `dialogStats` → `doStatsDialog(canDoStore)` の戻り値で続行
  - `dialogStore` → `doStoreDialog(param)`
  - `dialogItems` → `doItemsDialog(canDoStore)`
- 安全策: `canDoStore == false` の状態で戻り値が `dialogStore` になった場合、`dialogClose` に強制置換。
- ダイアログ中は `g_CursorBitmap` をマウスカーソルとして表示(位置(4,2))。

## 8-2. ダイアログの描画共通仕様

- サイズ: `DIALOG_WIDTH = 487`、`DIALOG_HEIGHT = 304`(画面512×344に上下左右中央)。
- 配色: 黒(0,0,0)、グレー(210,210,210)、ボタン(180)、ボタン押下(90)、グレーアウト背景(140)/テキスト(90)、選択行(210)。
- 枠: 外側2px黒 + 内側グレーの二重枠。
- フォント: 大見出し・ステータス・詳細は `g_DialogFont`、ボタン・リストは `g_Font`。`TEXT_HEIGHT_EXTRA`=2で縦位置補正。
- 入力待ちは `waitForSpecificInput(INPUT_KEY | INPUT_MOUSE_BUTTONS | INPUT_MOUSE_POSITION)`、閉じた後は `rest(40×3=120ms)`。

## 8-3. `showAlertDialog()`(Dialogs.c:39-170) — OK/Cancel確認

- 汎用確認ダイアログ。戻り値: OK=1, Cancel=0。
- キー: ESC=Cancel、ENTER=OK。マウス: ボタン上押下→離しで確定。
- ボタンは押下中 `buttonPressedColor` に変化。

## 8-4. `displayMessage(resID, index, itemNum)`(Dialogs.c:172-263) — メッセージ表示

- `g_Messages[index - 1]` を表示(80件、1始まり)。
- `index == 5` の場合のみアイテム名 `g_ItemTemplates[itemNum].name` を末尾に連結。
- 折返し: 1行40文字、単語境界で折り返し、最大10行。
- 画面中央に黒枠+グレー内側のボックスを描画(背景はマップ表示を残したまま `displayCurrentMapScreenBlit(true, false)` で復帰)。
- 進行: `waitForKeyPressed()`。

## 8-5. `displayItemMessage(itemID)`(Dialogs.c:265-355)

- `displayMessage` と同構造だが、テキストは `g_ItemTemplates[itemID].description`。

## 8-6. 統計画面 `doStatsDialog()`(Dialogs.c:357-651)

表示項目(左カラムラベル → 値の式):

| ラベル | 値 |
|---|---|
| Health | `health / maxHealth` |
| Stamina | `stamina / maxStamina` |
| Experience | `experience / nextLevel` |
| Armor | `armorValue + itemEffects[0..2].armor` |
| Level | `level` |
| Money | `money` |
| Damage | `damage + itemEffects[0].damage + itemEffects[2].damage` |

追加表示:
- "Your Damage Is:": `damageType` のビットが立つ分だけ免疫アイコンを横並び描画。
- 現在装備: "Sword:"(isSword)/"Other:"(isSpecialItem)/"Armor:"(isArmor) の3スロット。大アイコン+名前。
- "You Are Immune To:": `immunities` のビットで免疫アイコン描画。

ボタン: `(D)one` / `(I)tems` / `S(t)ore`(canDoStore=falseならStoreはグレーアウト)。キー D/Q=閉じる、I=Itemsへ、T=Storeへ。

## 8-7. インベントリ画面 `doItemsDialog()`(Dialogs.c:653-1588)

### タブ構成(`static int selectedTab`、ダイアログをまたいで保持)

- 0: "Sword" / 1: "Other" / 2: "Armor" / 3: "Messages"

### リスト構築(所有判定: `itemQuantities[i] > 0`)

- `isSword` → swordslist
- `isArmor` → armorslist
- `isMessage` → messageslist
- `(isNotSelectable | isSelectable | isSpecialItem)` → otherslist

### 操作

- キー: Left/Right=タブ切替、Up/Down=選択移動、D/Q/ESC=閉じる、S=Stats、T=Store(要canDoStore)、E/ENTER=Select。
- Select(E/ENTER)の実行ロジック:
  - `isMessage | isMoney | isNotSelectable` → 何もしない
  - `isSelectable` → `itemEquipped[]` をトグル
  - `isSword | isArmor | isSpecialItem` → 排他的装備。同マスクを持つ既装備をすべて外してから対象を装備
- マウス: リストクリック選択、スクロール上下矢印(キー9/10)、タブ(キー5-8)。

### リスト行の描画

- アイコン: `g_SmallIcons[]` があれば使用、なければ `g_LargeIcons[]` を16×16に縮小。
- 装備中はチェックマークを2本のlineで描画。名前(左)と所持数(右)。
- 行高 = max(小フォント高,16)、ギャップ4px。選択行は背景色で塗り。
- スクロールバー: リストが収まらないときだけ表示。

### アイテム詳細パネル

- 32px大アイコン + 名前 + description を折返し表示。
- 非Messageアイテム限定で Armor / Damage / Speed / Charges / Stamina / Dmg Healed の6属性を2カラム表示。

### 装備効果の再計算(ダイアログ終了時、L1520-1585)

- `itemEffects[0]` = 装備中の剣1本(isSword かつ itemEquipped)。
- `itemEffects[1]` = 装備中のスペシャルアイテム1個(isSpecialItem)。
- `itemEffects[2]` = 装備中の `(isSelectable + isArmor)` 全アイテムの**合算**。armor/damage/speed/rateOfFire/fireCounter/charges/stamina/damageHealed を加算、immunities/damageType はOR。
- `g_Saric.immunities` と `g_Saric.damageType` は3つの itemEffects のORで再構成。

## 8-8. 店 `doStoreDialog()`(Dialogs.c:1592-2399)

- `#define STORE_SHOULD_BE_RUN` が有効な場合のみ実装(無効なら `return dialogClose`)。
- 引数 `param` は店の messageID。`param = -(param + 1)` で店インデックス(0-4)に変換。敵の `messageID` から呼ばれる(EnemyCollision.c:394, 472)。
- タブ2種: 0="Store Items"(店の商品)、1="Your Items"(プレイヤー所持品)。
- storelist = `g_Stores[param].item[i].index`。mylist = `itemQuantities>0` かつ `(isNotSelectable|isSelectable|isSpecialItem)` のアイテム。
- ボタン: `(D)one` / `(I)tems` / `(S)tats` / `(B)uy`。
- **購入処理**:
  - 条件: `money >= 価格`。
  - 所持数が0なら mylist に昇順挿入。
  - `money -= price`、`itemQuantities[index]++`。
  - 購入時の効果音呼び出しはコメントのみ(実際には鳴らない)。
  - Buy ボタンは "Store Items" タブでのみ有効。
- **売却**: 本コードには**売却処理は実装されていない**("Your Items" タブは表示専用)。
- 所持金表示: "You have $%d."。
- 店の引用文 `g_Stores[param].quote` はこのファイル内では描画されない(コメントアウト)。

## 8-9. ヘルプ表示(`showHelp()`、Utils.c:281-297)

- `g_HelpBitmap` を画面中央に表示し、`waitForKeyPressed()` で待ち、元の画面に復帰。
