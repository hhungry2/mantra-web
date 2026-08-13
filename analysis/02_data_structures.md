# 2. 主要構造体と定数

`include/GameTypes.h`(351行)と `include/GameDefines.h`(57行)、`src/GameConstants.h`(125行)に定義されている型と定数の完全な仕様。

## 2-1. 基本型(GameTypes.h)

| 型 | 定義 | 説明 |
|---|---|---|
| `Str255` | `char[256]` | Pascal文字列。先頭1バイトが長さ、続いて文字列 |
| `StringPtr` | `char *` | 文字列ポインタ |
| `Ptr` | `unsigned char *` | 生バイトポインタ |
| `Boolean` | `unsigned char` | `false`=0 / `true`=1 |
| `Point` | `{ short v; short h; }` | 縦(v)/横(h)。v=Y, h=X |
| `Rect` | `{ short top, left, bottom, right; }` | 矩形。top-left基点 |

## 2-2. キー入力定数(GameTypes.h:31-61)

`MANTRA_KEY_0`=0 から `MANTRA_KEY_ALT`=28 までの連番。

| 値 | 定数 | 用途 |
|---|---|---|
| 0-7 | `MANTRA_KEY_0`〜`MANTRA_KEY_7` | BGM音量0-7設定 |
| 8-11 | `UP`/`DOWN`/`RIGHT`/`LEFT` | 移動 |
| 12 | `S` | ステータスダイアログ |
| 13 | `I` | アイテム一覧 |
| 14 | `Q` | ポーズ |
| 15 | `P` | ポーズ |
| 16 | `ESC` | ポーズ |
| 17 | `H` | ヘルプ表示 |
| 18 | `D` | デベロッパー用(HP/スタミナ全回復) |
| 19 | `E` | (ポーリングのみ・ゲーム内未使用) |
| 20 | `T` | デベロッパー用(テレポート、未実装) |
| 21-24 | `B`/`N`/`O`/`R` | (ポーリングのみ) |
| 25 | `SPACE` | 剣(メイン武器) |
| 26 | `ENTER` | (ポーリングのみ) |
| 27 | `SHIFT` | オフハンド武器 |
| 28 | `ALT` | 走り(ランモディファイア) |

## 2-3. マウス定数(GameTypes.h:63-87)

- `MANTRA_MOUSE_LEFT`=0 / `MANTRA_MOUSE_RIGHT`=1
- `MANTRA_MOUSE_X`/`MANTRA_MOUSE_Y` / `MANTRA_MOUSE_WHEEL_H`/`MANTRA_MOUSE_WHEEL_V`

## 2-4. ダイアログ種別(GameTypes.h:81-87)

```
dialogClose = 0, dialogStore = 1, dialogStats = 2, dialogItems = 3
```

## 2-5. 店データ型(GameTypes.h:89-101)

```c
typedef struct {
    short index;    // アイテムテンプレート番号(16000+item#基準)
    short price;    // 価格
} StoreItem;

typedef struct {
    Str255    quote;   // 店主のセリフ(Pascal文字列)
    short     count;   // 商品数
    StoreItem *item;   // 商品リスト
} Store;
```

## 2-6. アイテム構造体(GameTypes.h:104-142)

```c
struct Item {
    StringPtr       name;         // 名前
    StringPtr       description;  // 説明
    long            attributes;   // 属性ビットフィールド
    char            armor;        // 防御力
    char            damage;       // 攻撃力
    char            speed;        // 速度補正
    unsigned char   rateOfFire;   // 射撃間隔
    unsigned char   fireCounter;  // 射撃カウンタ(実行時)
    short           charges;      // チャージ数
    char            stamina;      // スタミナ消費量
    char            damageHealed; // 回復量
    short           quantity;     // 数量
    short           spriteRef;    // スプライト参照番号
    short           firedMonsterID; // 発射する敵テンプレート番号
    short           immunities;   // 免疫ビット
    short           damageType;   // ダメージタイプビット
};

struct DataFileItem {   // ファイル保存版。name/description が Str255(256バイト)
    Str255 name;
    Str255 description;
    long   attributes;
    ...(以下 Item と同じ)...
};
```

### アイテム属性フラグ(GameTypes.h:147-158)

| 値 | フラグ | 動作 |
|---|---|---|
| 1 | `isSword` | 剣。この型の他の装備を外す |
| 2 | `isArmor` | 防具。この型の他の装備を外す |
| 4 | `isMoney` | お金。チェックなし |
| 8 | `isMessage` | メッセージ。チェックなし |
| 16 | `isNotSelectable` | 選択不可 |
| 32 | `isSelectable` | チェックマークのトグル |
| 64 | `isSpecialItem` | 特殊アイテム。他の特殊アイテムを外す |
| 128 | `isMissle` | 飛び道具(発射フラグ) |
| 256 | `hasCharges` | チャージ数を持つ |
| 512 | `hasSpecialRoutine` | 特殊ルーチンを持つ |

アイテムテンプレート番号の基準: **16000+item#**(GameTypes.h:160)。

## 2-7. MapItem 構造体(GameTypes.h:163-170)

```c
struct MapItem {
    char  modifiers;   // 通行・扉・ダメージ等のビット
    short special;     // 扉の行き先や地形効果量
    short spriteRef;   // タイルアイコン番号(g_TileIcons[this-1000])
    short expansion;   // 未使用(将来用)
};
```

**ファイル上の実際のレイアウト(8バイト)**: `modifiers(1) + garbage(1) + special(2) + spriteRef(2) + expansion(2)`。`modifiers` の直後には構造体が初期化しないパディング(garbage)が1バイトあり、読み捨てられる(`LoadData.c`)。

### タイルmodifiersビット(GameTypes.h:174-181)

| 値 | フラグ | 意味 |
|---|---|---|
| 1 | `standable` | 通行可能 |
| 2 | `isDoor` | 扉。地下でなければ `special` を使う |
| 4 | `doesDamage` | ダメージ地形。`special` を効果量として使う |
| 8 | `leadsToCastle` | 城へつながる(未実装) |
| 16 | `leadsToUnderWorld` | 地下世界へつながる |

## 2-8. マップデータファイルのコメント仕様(GameTypes.h:183-190)

> 旧フォーマットのコメント(実装と不一致):
> - 1画面 = 160個の**7バイト**MapItem(1120バイト) + 16体の敵(560バイト) = 1680バイト/部屋
> - 16×8=128部屋想定で 210KB

実際の実装では 8バイトMapItem + 64バイトEnemy で **2304バイト/画面**(詳細は03)。

## 2-9. Saric 構造体(GameTypes.h:203-242)

```c
struct Saric {
    Rect     where;             // 位置矩形(32×32)
    char     legCounter;        // 歩行アニメカウンタ
    short    health;            // HP
    short    maxHealth;         // 最大HP
    char     armorValue;        // 素の防御力
    char     damage;            // 素の攻撃力
    Boolean  legState;          // 歩行アニメ状態(2コマ)
    short    spriteRef;         // スプライト番号(1000基準)
    Point    oldPosition;       // 前フレーム位置
    char     facing;            // 向き(0=左,1=右,2=下,3=上)
    char     speed;             // 移動速度
    Point    oldSword;          // 剣の前フレーム位置
    Boolean  swordOut;          // 剣を出しているか
    Boolean  wasSwordOut;       // 前フレームで剣を出していたか
    Boolean  logicalWasSwordOut;
    Boolean  offHandOut;
    Boolean  logicalOffHandWasOut;
    Boolean  hadHitEnemy;       // この振りで敵に当たったか
    long     experience;        // 経験値
    long     nextLevel;         // 次のレベルに必要な経験値
    short    level;             // レベル
    short    woundCounter;      // ダメージ無敵カウンタ(地形/接触)
    char     sitCounter;        // 静止時間カウンタ(スタミナ回復用)
    char     runCounter;        // 走行時間カウンタ(スタミナ消費用)
    char     incrementalDamageCounter;
    Boolean  wasOnDoor;         // 扉の上にいたか
    short    itemQuantities[250]; // 各アイテムの所持数
    Boolean  itemEquipped[250];   // 各アイテムの装備フラグ
    short    itemCharges[250];    // 各アイテムの残チャージ数
    Item     itemEffects[3];      // 装備効果スロット[0]=剣,[1]=特殊,[2]=防具等の合算
    short    messageCounter;      // メッセージ表示間隔カウンタ
    short    stamina;             // スタミナ
    short    maxStamina;          // 最大スタミナ
    long     money;               // 所持金
    short    immunities;          // 免疫ビット
    short    damageType;          // 攻撃のダメージタイプ
};
```

## 2-10. Enemy 構造体(GameTypes.h:248-280) — 64バイト

```c
struct Enemy {
    EnemyHandle   previousEnemy;      // リンクリスト前(実行時ハンドル)
    EnemyHandle   nextEnemy;          // リンクリスト次(実行時ハンドル)
    Rect          where;              // 位置矩形
    unsigned char legCounter;         // アニメカウンタ(被弾無敵としても使用)
    Boolean       legState;           // アニメ状態(0/1)
    short         health;             // HP
    char          armorValue;         // 防御力
    char          damage;             // 接触ダメージ
    unsigned short xp;                // 経験値
    long          attributes;         // 属性ビットフィールド
    short         immunities;         // 免疫ビット
    short         damageType;         // 攻撃のダメージタイプ
    char          speed;              // 移動速度
    char          movePhase;          // フェーズカウンタ(ボスで多用)
    char          gaurdianRange;      // ガーディアンの守備範囲
    char          facing;             // 向き(0=中立,1=右,2=下,3=左,4=上)
    char          rateOfFire;         // 発射間隔
    char          originalNumber;     // 画面内スロット番号(0-15)
    short         spriteRef;          // スプライト番号(2000基準)
    short         movementType;       // 移動AI番号
    unsigned char deadItem;           // 死亡時のドロップアイテム番号
    char          target;             // ターゲット(メッセージ番号を兼ねる)
    Point         originalPosition;   // 初期位置(タイル座標)
    short         firedEnemy;         // 発射する敵テンプレート番号
    short         pushableSpeed;      // 押される速度
    short         disFromUnitCircle;  // 円運動の半径
    Point         angledCourse;       // 斜め移動ベクトル
    short         messageID;          // 看板等のメッセージID
    char          stuckCounter;       // 詰まりカウンタ
    unsigned char theta;              // 円運動角度/発射タイマー
    short         expansion2;         // 未使用
};
```

### 敵属性フラグ(GameTypes.h:282-296)

| 値 | フラグ | 意味 |
|---|---|---|
| 1 | `isEnemy` | 敵として扱う |
| 2 | `canBeHeld` | 拾える(宝箱・置物等) |
| 4 | `killable` | 倒せる |
| 8 | `canFire` | 発射できる |
| 16 | `pushable` | 押せる |
| 32 | `insubstantial` | 実体なし(当たり判定なし) |
| 64 | `permanent` | 撃破後も復活し得る |
| 128 | `isMissile` | 飛び道具 |
| 256 | `originalToRoom` | この部屋オリジナル(撃破記録対象) |
| 512 | `isMultiFacing` | 複数向きスプライトを持つ |
| 1024 | `isBossEnemy` | ボス |

## 2-11. 敵の移動タイプ列挙(GameTypes.h:298-325)

```
none=0, randomMovement=1, homing=2, smart=3, gaurdian=4,
circular=5, bumpTurn=6, semihoming=7, linear=8, semibumpTurn=9,
waitingForTime=10, waitingForSaric=11, directFire=12, dyingEnemy=13,
doorEnemy=15, hiveBoss=50, crabBoss=51, blobBoss=53, sentryBoss=54,
linearBoss=55, rhinoBoss=56, elementalBoss=57, finalBoss=58
```

- 14(worm)と52(lizardBoss)はコメントアウトで無効化。
- 50以上がボス。
- 実装詳細は [07_enemies.md](07_enemies.md)。

## 2-12. RegionCell(MapArea)(GameTypes.h:335-339)

```c
typedef struct RegionCell {
    char musicIndex;   // BGM番号(1-9)
    char nameIndex;    // 地域名インデックス(未使用)
} RegionCell;
```

## 2-13. セーブデータ構造体(GameTypes.h:341-348)

```c
typedef struct {
    Str255 name;                    // セーブ名(Pascal文字列)
    LONG_LONG time;                 // プレイ時間(秒)
    Saric saric;                    // Saric の全状態
    Point mapScreen;                // 現在画面(v=Y, h=X)
    unsigned short deathRecord[NUM_SCREENS];  // 256画面の敵撃破記録
} SavedGame;
```

## 2-14. 定数定義(GameDefines.h)

| 定数 | 値 | 意味 |
|---|---|---|
| `NUM_TILE_ICONS` | 200 | タイルアイコン数 |
| `NUM_SARIC_ICONS` | 16 | Saricアイコン数 |
| `NUM_ENEMY_ICONS` | 187 | 敵アイコン数 |
| `NUM_BOSS_ICONS` | 51 | ボスアイコン数 |
| `NUM_SWORD_ICONS` | 4 | 剣アイコン数 |
| `NUM_SWORD_FRAMES` | 1000 | 剣アニメフレーム数 |
| `NUM_SCREENS` | 16×16=256 | 画面数 |
| `NUM_ITEM_TEMPLATES` | 250 | アイテムテンプレート数 |
| `NUM_IMMUNITY_ICONS` | 10 | 免疫アイコン数 |
| `NUM_TMPL_ENEMIES` | 250 | 敵テンプレート数 |
| `NUM_MESSAGES` | 80 | メッセージ数 |
| `NUM_STORES` | 5 | 店の数 |
| `NUM_KEYS` | 30 | キー数 |
| `MAX_SAVED_GAMES` | 4 | セーブスロット数 |
| `kBaseNextLevel` | 20 | 初期の次レベル経験値 |
| `SWORD_OFFSET` | 16 | 剣のオフセット/リーチ |
| `MAX_ENEMIES_ON_SCREEN` | 16 | 1画面の最大敵数 |
| `NUM_MILLISECONDS_BETWEEN_REFRESH` | 40 | フレーム間隔(25fps) |
| `STATS_HEIGHT` | 24 | ステータスバー高さ |
| `SCREEN_WIDTH` | 32×16=512 | 画面幅 |
| `SCREEN_HEIGHT` | (32×10)+24=344 | 画面高さ |
| `DIALOG_WIDTH` | 512-(512/20)=487 | ダイアログ幅 |
| `DIALOG_HEIGHT` | 344-24-(320/20)=304 | ダイアログ高さ |
| `TEXT_HEIGHT_EXTRA` | 2 | テキスト縦位置補正 |
| `FADE_LENGTH` | 24 | フェードのステップ数 |
| `FADE_REST_MILLISECONDS` | 10 | フェード間隔 |
| `MAX_SAVED_GAMES` | 4 | セーブスロット |

## 2-15. MapScreen 構造体(GameConstants.h:37-42)

```c
struct MapScreen {
    MapItem tiles[160];    // 160タイル。map[x][y] = tiles[(x*10)+y] (列優先)
    Enemy   enemies[16];   // 最大16体の敵データ
};
```

- タイルは **列優先**(`index = x * 10 + y`)で格納される(行優先で読むと砂嵐になる)。
- この `enemies[16]` は実行時のEnemyハンドルではなく、ファイルから読んだ初期データ。先頭の `previousEnemy`/`nextEnemy`(8バイト)はMac実行時ハンドルで意味を持たない。

## 2-16. グローバル変数一覧(GameConstants.h:49-122)

| 変数 | 型 | 用途 |
|---|---|---|
| `g_SystemPalette` | PALETTE | システムパレット |
| `g_BlackColor` / `g_RedColor` | int | 色インデックス |
| `g_CurrentScreenX/Y` | int | 現在画面のグリッド座標 |
| `g_MapScreens[256]` | MapScreen | 全256画面 |
| `g_MapRegions[256]` | RegionCell | 各部屋の音楽/名前 |
| `g_TileIcons[200]` ほか | BITMAP* | 各種グラフィック配列 |
| `g_BossMasks[4096×51]` ほか | uchar | 各種当たり判定マスク |
| `g_ItemTemplates[250]` | Item | アイテム定義 |
| `g_SmallIcons[250]` / `g_LargeIcons[250]` | BITMAP* | アイテムアイコン |
| `g_ImmunityIcons[10]` | BITMAP* | 免疫アイコン |
| `g_TmplEnemies[250]` | Enemy | 敵テンプレート |
| `g_Messages[80]` | Str255 | メッセージ |
| `g_CurrentScreen` | int | 現在の画面番号(0-255) |
| `g_FirstEnemy`/`g_CurrentEnemy` | EnemyHandle | 敵リンクリスト |
| `g_EnemiesInRoom` | int | 現在の部屋の敵数 |
| `g_Saric` | Saric | 主人公 |
| `g_DeathRecord[256]` | uchar | 敵撃破記録(1=生存,0=死亡) |
| `g_ScreenBuffer` | BITMAP* | オフスクリーンバッファ |
| `g_Font`/`g_DialogFont`/`g_LargeFont` | ALFONT_FONT* | フォント |
| `g_Stores[5]` | Store | 店データ |
| `g_SwordAnimData[1000]` | BITMAP* | 剣アニメ |
| `g_WinBitmap`/`g_LoseBitmap`/`g_StoryBitmap`/`g_MantraBitmap`/`g_CursorBitmap`/`g_HelpBitmap` | BITMAP* | 静止画 |
| `g_GameInProgress`/`g_GameDirty` | char | ゲーム状態フラグ |
| `g_GameplayTime` | volatile LONG_LONG | プレイ時間(秒) |
| `g_SavedGames[4]` | SavedGame | セーブデータ |
| `sineof[256]`/`cosof[256]` | short | 三角関数LUT |

## 2-17. ダメージタイプ・免疫(Dialogs.h:25-34)

| 値 | タイプ | アイコンID |
|---|---|---|
| 1 | fire(炎) | 132 |
| 2 | magic(魔法) | 133 |
| 4 | blunt(殴打) | 134 |
| 8 | sharp(斬撃) | 135 |
| 16 | cold(冷気) | 136 |
| 32 | electricity(電気) | 137 |
| 64 | silver(銀) | 138 |
| 128 | poisonous(毒) | 139 |

- `CHECK_IMMUNITIES(a,b)` マクロ(Utils.h:27): `((b)&(~(a)))`。攻撃側`damageType`のうち防御側`immunities`で防がれていないビットを返し、非ゼロならダメージが通る。
