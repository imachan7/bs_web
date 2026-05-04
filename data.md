# データ仕様書

## 1. システム構成（推奨）

- **Frontend:** HTML / TypeScript (Vanilla or React/Vue)
- **Backend:** Node.js + Socket.io (リアルタイム双方向通信)
- **Communication:** JSONオブジェクトを用いたメッセージパッシング

---

## 2. ゲーム全体状態 (GameState)

サーバー側で一元管理し、更新のたびに両プレイヤーへ送信するデータ。

| プロパティ名     | 型      | 説明                                                                         |
| :--------------- | :------ | :--------------------------------------------------------------------------- |
| `gameId`         | String  | 対戦ルームの一意な識別子                                                     |
| `turnPlayer`     | String  | 現在のターンプレイヤー ("p1" or "p2")                                        |
| `phase`          | String  | 現在のステップ (`start`, `core`, `draw`, `refresh`, `main`, `attack`, `end`) |
| `priorityPlayer` | String  | 現在操作権を持っているプレイヤー (フラッシュタイミング等の制御用)            |
| `isFlashTiming`  | Boolean | フラッシュタイミングが発生しているか                                         |
| `flashCount`     | Number  | フラッシュタイミングのパス回数 (両者パスで終了判定用)                        |
| `players`        | Object  | `p1`, `p2` の PlayerState を格納                                             |
| `log`            | Array   | 対戦ログ（「プレイヤー1が召喚」等）の文字列配列                              |

---

## 3. プレイヤー状態 (PlayerState)

各プレイヤーの個別データ。

| プロパティ名 | 型     | 説明                                                |
| :----------- | :----- | :-------------------------------------------------- |
| `id`         | String | プレイヤー識別子                                    |
| `life`       | Number | ライフ（初期値: 5）                                 |
| `reserve`    | Number | リザーブにあるコアの数                              |
| `trashCores` | Number | トラッシュにあるコアの数                            |
| `deck`       | Array  | カードオブジェクトの配列                            |
| `hand`       | Array  | 手札にあるカードオブジェクトの配列                  |
| `trashCards` | Array  | トラッシュにあるカードオブジェクトの配列            |
| `field`      | Object | `spirits` (Array), `nexus` (Array) を含む盤面データ |

---

## 4. カードオブジェクト (Card Object)

カード1枚が持つ不変のマスターデータ。

```json
{
    "cardId": "BS01-001",
    "name": "ゴラドン",
    "type": "spirit",
    "color": "red",
    "cost": 0,
    "reduction": ["red"],
    "family": ["爬獣"],
    "levels": [
        { "level": 1, "cores": 1, "bp": 1000 },
        { "level": 2, "cores": 3, "bp": 3000 }
    ],
    "symbol": ["red"],
    "effect": ""
}
```

---

## 5. キーワード効果の実装方針（初期弾対応 + 拡張前提）

初期弾を最優先で実装しつつ、後続弾の追加に耐えるため、以下の3層で設計する。

1. **イベント層（固定）**
2. **効果データ層（準固定）**
3. **効果ハンドラ層（拡張）**

### 5.1 イベント層（固定）

ゲーム内の効果判定は、下記の標準イベントを起点に行う。

- `onSummon`（召喚成立時）
- `onAttackDeclare`（アタック宣言時）
- `onBlockDeclare`（ブロック宣言時）
- `onBattleResolve`（バトル解決時）
- `onDestroy`（破壊された時）
- `onTurnStart`（ターン開始時）
- `onFlashStart` / `onFlashEnd`（フラッシュ開始/終了）
- `onPhaseChange`（フェーズ遷移時）

> ルール追加時は、まずイベントを増やすのではなく、既存イベント上で表現できるかを優先して検討する。

### 5.2 効果データ層（準固定）

カードテキストを文字列で直接実行せず、構造化データとして保持する。  
`effect`（表示用テキスト）は残し、判定は `effects` 配列を参照する。

```json
{
  "cardId": "BS01-001",
  "name": "ゴラドン",
  "effect": "【激突】",
  "effects": [
    {
      "id": "bs01-001-clash",
      "kind": "keyword",
      "keyword": "clash",
      "timing": "onAttackDeclare",
      "condition": {},
      "action": { "type": "grant_clash" },
      "duration": "whileOnField"
    }
  ]
}
```

#### 効果オブジェクトの共通項目

| 項目 | 型 | 説明 |
| :-- | :-- | :-- |
| `id` | String | カード内で一意な効果ID |
| `kind` | String | `keyword` / `continuous` / `triggered` など |
| `keyword` | String? | キーワード効果名（例: `clash`, `armor`） |
| `timing` | String | 発火イベント名 |
| `condition` | Object | 発動条件（対象、色、BP比較など） |
| `action` | Object | 実行内容（破壊、BP増減、状態付与など） |
| `duration` | String | 効果期間（`instant`、`untilEndOfTurn`、`whileOnField` など） |

### 5.3 効果ハンドラ層（拡張）

キーワードごとにハンドラを分離して実装する。

- `effects/keywords/clash.*`
- `effects/keywords/armor.*`
- `effects/keywords/awaken.*`

新キーワード追加時は「データ定義 + 対応ハンドラ追加」で完結させ、既存処理への影響を最小化する。

---

## 6. 実体カード（盤面インスタンス）とマスターデータの分離

将来拡張のため、カードマスター（不変）と盤面カード（可変）を分離する。

### 6.1 カードマスター（不変）

- `cardId`, `name`, `cost`, `levels`, `effects` など
- カードDB（JSON）に保存

### 6.2 盤面インスタンス（可変）

```json
{
  "instanceId": "inst-000001",
  "ownerPlayerId": "p1",
  "cardId": "BS01-001",
  "zone": "field.spirits",
  "currentCores": 1,
  "isRested": false,
  "summonedTurn": 3,
  "tempFlags": [],
  "appliedEffects": []
}
```

---

## 7. 初期弾実装時のスコープ方針

- まずは**初期弾に登場するキーワードのみ**を対象にする
- 汎用化は「イベント」「効果データ形式」「ハンドラ分離」に限定する
- それ以外（将来弾専用の特殊タイミングや高度な例外処理）は後続で追加する

この方針により、初期弾の実装速度を維持しながら、後続弾追加時の破綻を防ぐ。
