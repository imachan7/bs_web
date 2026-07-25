# 設計: マジックが「このターンの間」継続効果を貸す機構

- 作成: 2026-07-25 / 依頼元: `chatbox.md`「[実装担当→設計担当] 横断機構の設計をお願いしたい」
- **この文書は設計のみ。実装は未着手。** 実装はどちらが持っても構わない
- 関連: [SPEC.md](./SPEC.md)（3章 3層設計）、[MULTICOLOR.md](./MULTICOLOR.md)（同じ「横断的な前提を1箇所へ寄せる」形の先例）

---

## 0. 結論（先に4行）

1. `GameState.turnEffectSources` に「**このターンだけ有効な仮想発生源**」を持たせる
2. 貸す効果は **`levels: null`（レベル不問）の既存 `EffectDef` をそのまま入れる**。
   これにより `mustBlockGrant` / `constraint` / `reviveOnDestroy` / `aura` などが**一斉に**マジックから使えるようになる
3. 走査は `effectSources(board, pid)` に寄せる。**ただし全31箇所ではなく「効果発生源の走査」22箇所だけ**。
   `countSymbols` / `ownFieldSymbolColors` は**物理的に場にあるカードを数える**処理なので寄せてはいけない
4. 移行は段階式。**必要な kind の走査から順に差し替える**（一括置換はしない）

---

## 1. 現状（実測）

「持ち主のフィールドのスピリット＋ネクサスを舐める」コードは **31箇所・24関数**に散っている。

| ファイル | 箇所数 |
| :-- | --: |
| `server/src/logic/EffectModules.ts` | 14 |
| `shared/rules.ts` | 8 |
| `shared/cost.ts` | 5 |
| `server/src/logic/RuleValidator.ts` | 2 |
| `server/src/logic/PhaseManager.ts` | 1 |
| `server/src/logic/actions/handDeck.ts` | 1 |

### ⚠️ ここが設計上の分岐点：走査には2種類ある

**一括で `effectSources()` に置き換えてはいけない。** マジックはトラッシュにあり、場にシンボルを
供給しない。物理的な存在を数える処理に仮想発生源が混ざると、**軽減シンボルが増える・
色ロックが誤判定する**といった別のバグを生む。

| 分類 | 仮想発生源を含める | 関数 |
| :-- | :-- | :-- |
| **A. 効果発生源の走査**（対象） | **含める** | `activeConstraints` ・ `checkAuraCondition` ・ `effectiveBp` ・ `hasContinuousKeywordGrant` ・ `hasGlobalConstraint` ・ `hasMagicImmunity` ・ `spiritHasFamily` ・ `costModTotal` ・ `hasMagicFreeGrant` ・ `hasMagicRestriction` ・ `reductionGrantSymbols` ・ `coreStepBonusFor` ・ `drawDoubleMultiplier` ・ `fireFieldEventTriggers` ・ `fireStepTriggers` ・ `funsaiBonusTotal` ・ `hasFunsaiOnBlock` ・ `hasLifeDamageNegate` ・ `hasOwnNexusIndestructible` ・ `isExhaustImmune` ・ `isTriggerSuppressed` ・ `tryReviveOnDestroy` ・ `refreshLevelAsOverrides` ・ `mustBlockGrant` 走査（`RuleValidator.ts:508`） |
| **B. 物理的な場の走査**（対象外） | **含めない** | `countSymbols`（軽減シンボル集計）・`ownFieldSymbolColors`（力奪う凱旋門の色ロック） |

**B は現状のまま `player.field` を直接見ること。** 混同を防ぐため、`effectSources` の JSDoc に
この区別を明記する。

---

## 2. データ構造

### 2.1 `GameState` への追加

```ts
// このターンの間だけ有効な仮想の効果発生源（マジックが貸した継続効果）。
// ターン終了でリセットする。フィールドには存在しないため、
// シンボル集計（countSymbols / ownFieldSymbolColors）の対象にはならない
turnEffectSources: TurnEffectSource[]

export interface TurnEffectSource {
    ownerPid: PlayerId   // 効果の持ち主（「自分の〜」の基準になる）
    cardId: string       // 貸し元のカード（ログ表示・色・種別の参照用）
    instanceId: string   // 仮想の一意ID（"turnsrc-1" など。既存コードが instanceId で同一性を見るため必要）
    effects: EffectDef[] // 貸す継続効果。**levels は必ず null（レベル不問）にする**
}
```

### 2.2 なぜ `levels: null` を必須にするか

既存の走査コードはすべてこの形をしている。

```ts
const sourceLevel = currentLevel(source).level
if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
```

マジックは `levels: []` なので `currentLevel()` は `level: 0` を返す。
`effectActiveAtLevel(null, 0)` は `true` なので、**貸す効果の `levels` を `null` にしておけば
走査側にレベルの特別扱いを一切入れずに済む**。これが本設計の要。

### 2.3 走査ヘルパー

```ts
// shared/rules.ts
//
// 継続効果の**発生源**を列挙する。フィールドのスピリット＋ネクサスに加え、
// このターンだけ有効な仮想発生源（マジックが貸した継続効果）を含む。
//
// ⚠️ 「場に実在するカードを数える」用途には使わないこと。
//    軽減シンボル集計（countSymbols）・色ロック（ownFieldSymbolColors）は
//    物理的な存在を見る処理なので、仮想発生源を混ぜると誤動作する
export function effectSources(board: Board, pid: PlayerId): EffectSource[]

export interface EffectSource {
    inst: CardInstance      // 仮想発生源は合成インスタンス（cores:0 / isRested:false / tempKeywords:[] …）
    effects: EffectDef[]    // card(inst.cardId).effects か、仮想発生源の effects
    virtual: boolean        // true なら仮想（self を参照する効果を弾く判定に使う）
}
```

`Board` に `turnEffectSources` を足す必要がある（`GameState` と `GameView` の双方が持つ。
クライアントもブロック可否ハイライト等で参照するため **`viewFor` で配信する**。隠匿情報なし）。

---

## 3. 効果を貸すアクション

```ts
| { type: "grantTurnEffects"; effects: EffectDef[] } // このターンの間、自分の仮想発生源として effects を有効にする
```

データの書き方（例: 「このターンの間、相手は◯◯を必ずブロックする」）:

```jsonc
{
  "kind": "magic", "timing": "main",
  "action": {
    "type": "grantTurnEffects",
    "effects": [
      { "id": "BS05-0XX-t1", "kind": "mustBlockGrant", "levels": null, /* 既存 kind の中身をそのまま */ }
    ]
  }
}
```

**新しい kind を作らずに済むのが最大の利点**で、`mustBlockGrant` / `constraint`（`canDirectAttack`）/
`reviveOnDestroy` / `aura` / `keywordGrant` などが一度に使えるようになる。
実装担当の挙げた3例はすべてこれで表現できる。

---

## 4. 制約（実装時に必ず守ること）

### 4.1 貸す効果は `self` を参照してはいけない

多くの効果は発生源インスタンス（`self`）を参照する（`refreshSelf` ・ `destroySelf` ・
`selfBuff` ・ aura の `target:"self"` など）。仮想発生源は場に存在しないため、
これらは意味を成さないか、最悪クラッシュする。

- `resolveAction` に渡す `self` は **`null`** にする（`EffectSource.virtual` で判定）
- `aura` の `target:"self"` は仮想発生源では**常に不成立**として扱う
- **`validate-cards.ts` に「`grantTurnEffects.effects` に self 参照アクションが入っていないか」の検査を足す**
  （データで踏みやすい罠なので、実行時ではなく検証で落とす）

### 4.2 リセット位置

`PhaseManager.ts` のターン終了処理、`state.turnConstraints = []`（158行付近）・
`state.triggerSuppressionThisTurn = []`（160行付近）と同じ場所に
`state.turnEffectSources = []` を足す。**`tempKeywords` のリセット（131行付近）と同じタイミング**。

### 4.3 発生源の色・種別

装甲（`hasArmorAgainst`）やマジック効果耐性（`hasMagicImmunity`）の判定に発生源の色が要る。
仮想発生源は `cardId` を持つので `card(cardId).colors` から取れる。
**貸し元がマジックなので `sourceType` は `"magic"` になる**点に注意（＝マジック効果耐性を持つ
相手には効かない）。これは原作挙動としても妥当。

---

## 5. 移行手順（段階式。一括置換はしない）

各段で `npm run typecheck && npm run smoke:quiet` が緑であること。
**既存 smoke を書き換えずに通ることが挙動保存の根拠**になる（第1段階・軽減バグ修正と同じ方式）。

| 段 | 内容 | 検証 |
| --: | :-- | :-- |
| 1 | 型・`turnEffectSources`・`effectSources()`・リセット処理を追加。**走査側はまだ差し替えない** | 既存 smoke が無変更で通る（何も変わらないため） |
| 2 | `grantTurnEffects` アクションを追加。`effectSources()` を **A分類のうち対象カードが必要とする kind の走査だけ**差し替える（`mustBlockGrant` ・ `activeConstraints` ・ `tryReviveOnDestroy` ・ `effectiveBp`） | 新規 smoke で貸与が効くこと＋既存が無変更で通ること |
| 3 | 対象カード（赤・紫5枚＋BS05 各色の同型）を構造化 | カードごとの smoke |
| 4 | 残る A分類の走査を順次 `effectSources()` へ寄せる（急がない） | 各回 smoke 緑 |

**B分類（`countSymbols` ・ `ownFieldSymbolColors`）は最後まで差し替えない。**

---

## 6. 代替案と却下理由

| 案 | 内容 | 判定 |
| :-- | :-- | :-- |
| **A. 仮想発生源**（本設計） | `GameState` にターン限定の発生源を持つ | **採用**。既存 kind をそのまま再利用でき、走査側の変更が最小 |
| B. インスタンスへの個別付与 | `tempKeywords` のように各スピリットへ効果を配る | 却下。「相手全体」「これから場に出るもの」に効かない（貸与時に存在しないインスタンスを拾えない） |
| C. kind ごとに `thisTurn` フラグ付き配列を増やす | `turnConstraints` の方式を kind の数だけ増やす | 却下。`turnConstraints` ・ `triggerSuppressionThisTurn` で既に2つあり、これ以上増やすと同じ形の配列が乱立する |

---

## 7. 未解決（実装時に判断が要る点）

- **フィールドの発生源と仮想発生源の適用順序**。現状の走査は「スピリット→ネクサス」順で、
  同種の効果が複数あっても順序に依存しない実装になっている（加算・OR判定のみ）。
  ただし `reviveOnDestroy` は**最初に一致したものが勝つ**ため、仮想発生源を
  前に置くか後ろに置くかで挙動が変わる。**フィールドを先、仮想を後**を推奨（既存挙動を変えないため）
- 相手に効果を貸すケース（「このターン、**相手は**必ずブロックする」）は
  `ownerPid` を使用者にしたまま `mustBlockGrant` 側の対象指定で表現できるはずだが、
  対象カードのテキストを見て確定すること
