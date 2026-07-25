# 設計: マジックが「このターンの間」継続効果を貸す機構

- 作成: 2026-07-25 / 依頼元: `chatbox.md`「[実装担当→設計担当] 横断機構の設計をお願いしたい」
- **この文書は設計のみ。実装は未着手。** 実装はどちらが持っても構わない
- 関連: [SPEC.md](./SPEC.md)（3章 3層設計）、[MULTICOLOR.md](./MULTICOLOR.md)（同じ「横断的な前提を1箇所へ寄せる」形の先例）

---

> **改訂履歴**: 初版は `GameState.turnEffectSources` に `EffectDef[]` を直接持つ案だったが、
> chatbox に別案（`PlayerState.turnVirtualInstances: CardInstance[]`）が寄せられたため、
> **両案を統合した**のが本版。統合の判断根拠は §7 を参照。

## 0. 結論（先に4行）

1. `PlayerState.turnVirtualInstances: CardInstance[]` に「**このターンだけ有効な仮想発生源**」を持たせる。
   保存する値は**通常の `CardInstance`**（合成したマジックのインスタンス）
2. 貸す継続効果は**そのマジックカード自身の `effects` に `levels: null` で書く**。
   これにより `mustBlockGrant` / `constraint` / `reviveOnDestroy` / `aura` などが**一斉に**マジックから使えるようになる。
   **`levels: null` は必須**（理由は §2.2。ここを外すと無言で発火しなくなる）
3. 走査は `effectSources(board, pid): CardInstance[]` に寄せる。**「効果発生源の走査」22関数が対象**で、
   `countSymbols` / `ownFieldSymbolColors` の2つは寄せない（§1 の分類）
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

### 2.1 `PlayerState` への追加

```ts
// このターンの間だけ「フィールドにあるもの」として扱う仮想の効果発生源
// （マジックが貸した継続効果）。ターン終了でリセットする。
// フィールドには実在しないため、シンボル集計（countSymbols / ownFieldSymbolColors）の対象にはならない
turnVirtualInstances: CardInstance[]
```

値は `createInstance(cardId, turn, 0)` で作った**通常の `CardInstance`**。
デバッグしやすいよう `instanceId` に `virtual-` 接頭辞を付ける。

`Board`（`GameState` / `GameView` 共通のビュー型）にも足す。クライアントもブロック可否ハイライト等で
参照するため **`viewFor` で配信する**（隠匿情報なし）。

### 2.2 ⚠️ 貸す効果の `levels` は **必ず `null`**

**ここが本設計で最も踏みやすい罠。** 既存の走査はすべてこの形をしている。

```ts
const sourceLevel = currentLevel(source).level
if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
```

マジックの `CardData.levels` は `[]` なので `currentLevel()` は `{ level: 0 }` を返す。
そこに `effectActiveAtLevel(effect.levels, 0)` が掛かる。**実測値**:

```
effectActiveAtLevel(null, 0) = true    ← levels:null は常に有効
effectActiveAtLevel([],   0) = false   ← 空配列は false
effectActiveAtLevel([1],  0) = false   ← Lv指定は仮想発生源では絶対に成立しない
```

つまり **`levels: null` 以外で書くと、エラーも出ずに一度も発火しない**。
スピリットのカードから `"levels": [1, 2]` の形をコピーしてくると確実に踏む。

> 補足: 「空配列は常に true」という記述が chatbox の別案にあったが、実測のとおり **false** である。

### 2.3 走査ヘルパー

```ts
// shared/rules.ts
//
// 継続効果の**発生源**を列挙する。フィールドのスピリット＋ネクサスに加え、
// このターンだけ有効な仮想発生源（マジックが貸した継続効果）を含む。
//
// ⚠️ 「場に実在するカードを数える」用途には使わないこと。
//    軽減シンボル集計（countSymbols）・色ロック（ownFieldSymbolColors）は
//    物理的な存在を見る処理であり、意味的に発生源とは別物（§1 の分類B）
export function effectSources(board: Board, pid: PlayerId): CardInstance[] {
    const player = board.players[pid]
    return [...player.field.spirits, ...player.field.nexuses, ...player.turnVirtualInstances]
}
```

**戻り値を `CardInstance[]` にするのが要点**で、既存の 22箇所は
`[...field.spirits, ...field.nexuses]` を `effectSources(board, pid)` に置き換えるだけで済む
（ループ本体は無変更）。

### 2.4 仮想かどうかの判定

`self` の扱い（§4.1）とデバッグのために、仮想発生源を見分ける述語を用意する。

```ts
export function isVirtualSource(inst: CardInstance): boolean {
    return inst.instanceId.startsWith("virtual-")
}
```

## 3. 効果の貸し方

### 3.1 データの書き方

**貸す継続効果は、そのマジックカード自身の `effects` に `levels: null` で並べる。**
`kind: "magic"` のエントリは `resolveMagic` だけが読み、継続効果の走査は無視するので共存できる。

```jsonc
// 例: 「このターンの間、相手は◯◯を必ずブロックする」マジック
"effects": [
  { "id": "BS05-0XX-e1", "kind": "magic", "timing": "main",
    "action": { "type": "lendSelfThisTurn" } },        // ← 貸与を発動する
  { "id": "BS05-0XX-e2", "kind": "mustBlockGrant", "levels": null, /* 既存 kind の中身をそのまま */ }
]                                                       // ↑ 貸される継続効果
```

### 3.2 アクション

```ts
| { type: "lendSelfThisTurn" } // このマジック自身を、このターンの間だけ自分の仮想発生源として場に置いたものとして扱う
```

### 3.3 ⚠️ **マジックの `self` は `null`**。ハンドラは `self` から cardId を取れない

**実装で最も踏みやすい罠。** `resolveMagic` はマジックの効果をこう解決している
（`EffectModules.ts:2030`、実測で確認）。

```ts
resolveAction(state, owner, null, effect.action, targetInstanceId, card.colors, "magic")
//                          ^^^^ マジックの self は常に null
```

したがって `lendSelfThisTurn` のハンドラを

```ts
if (!self) return                                   // ❌ これを書くと
const inst = createInstance(self.cardId, ...)       //    唯一の用途で必ず no-op になる
```

の形で書くと、**マジックから使ったときに必ず何もせずに終了する**。
エラーも警告も出ず、smoke を書いても「効果が出ない」ことしか分からない。

**対処**: 発生源の cardId を `ActionCtx` に載せて渡すこと。

```ts
// server/src/logic/actions/types.ts
export interface ActionCtx {
    // ...既存
    sourceCardId: string | undefined // 発生源のカードID。マジックは self が null のため、
                                     // resolveMagic が使用中のカードの cardId をここに入れる
}
```

`resolveAction` のシグネチャに `sourceCardId?: string` を足し、`resolveMagic` が
`card.cardId` を渡す。スピリット/ネクサス発生源では `self?.cardId` をそのまま入れればよい。

ハンドラ側は `ctx.sourceCardId` を使う（`self` は参照しない）。

```ts
const cardId = ctx.sourceCardId
if (cardId === undefined) return
const inst = createInstance(cardId, state.turn, 0)
inst.instanceId = `virtual-${inst.instanceId}`
state.players[owner].turnVirtualInstances.push(inst)
```

**この経路は必ず smoke で押さえること**（実際にマジックを使って継続効果が有効になることを確認する）。
「ハンドラが呼ばれる」だけのテストでは no-op を見逃す。

**新しい kind を作らずに済むのが最大の利点**で、`mustBlockGrant` / `constraint`（`canDirectAttack`）/
`reviveOnDestroy` / `aura` / `keywordGrant` などが一度に使えるようになる。
実装担当の挙げた3例はすべてこれで表現できる。

---

## 4. 制約（実装時に必ず守ること）

### 4.1 貸す効果は `self` を参照してはいけない

多くの効果は発生源インスタンス（`self`）を参照する（`refreshSelf` ・ `destroySelf` ・
`selfBuff` ・ aura の `target:"self"` など）。仮想発生源は場に存在しないため、
これらは意味を成さないか、最悪クラッシュする。

- `resolveAction` に渡す `self` は **`null`** にする（`isVirtualSource()` で判定）
- `aura` の `target:"self"` は仮想発生源では**常に不成立**として扱う
- **`validate-cards.ts` に検査を足す**: `lendSelfThisTurn` を持つカードの継続効果エントリが
  すべて `levels: null` であること、および self 参照アクションを含まないこと
  （データで踏みやすい罠なので、実行時ではなく検証で落とす）

### 4.2 リセット位置

`PhaseManager.ts` のターン終了処理、`state.turnConstraints = []`（158行付近）・
`state.triggerSuppressionThisTurn = []`（160行付近）と同じ場所に
各プレイヤーの `turnVirtualInstances = []` を足す。**`tempKeywords` のリセット（131行付近）と同じタイミング**。

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
| 1 | 型・`turnVirtualInstances`・`effectSources()`・`isVirtualSource()`・リセット処理を追加。**走査側はまだ差し替えない** | 既存 smoke が無変更で通る（何も変わらないため） |
| 2 | `lendSelfThisTurn` アクションを追加。`effectSources()` を **A分類のうち対象カードが必要とする kind の走査だけ**差し替える（`mustBlockGrant` ・ `activeConstraints` ・ `tryReviveOnDestroy` ・ `effectiveBp`） | 新規 smoke で貸与が効くこと＋既存が無変更で通ること |
| 3 | 対象カード（赤・紫5枚＋BS05 各色の同型）を構造化 | カードごとの smoke |
| 4 | 残る A分類の走査を順次 `effectSources()` へ寄せる（急がない） | 各回 smoke 緑 |

**B分類（`countSymbols` ・ `ownFieldSymbolColors`）は最後まで差し替えない。**

---

## 6. 代替案と却下理由

| 案 | 内容 | 判定 |
| :-- | :-- | :-- |
| **仮想発生源**（本設計） | ターン限定の `CardInstance` を発生源の走査に混ぜる | **採用** |
| インスタンスへの個別付与 | `tempKeywords` のように各スピリットへ効果を配る | 却下。「相手全体」「これから場に出るもの」に効かない（貸与時に存在しないインスタンスを拾えない） |
| kind ごとに `thisTurn` 配列を増やす | `turnConstraints` の方式を kind の数だけ増やす | 却下。`turnConstraints` ・ `triggerSuppressionThisTurn` で既に2つあり、これ以上増やすと同じ形の配列が乱立する |

---

## 7. 2案の統合について（判断根拠）

同じ問題に対して chatbox に2つの設計が並んだため、統合した。

### 別案から採用した点（そちらが優れていた）

1. **保存する値を `CardInstance` にし、`effectSources()` の戻り値を `CardInstance[]` にする**。
   初版は `{ inst, effects, virtual }` というラッパ型を返す設計だったが、それだと
   **22箇所すべてのループ本体を書き換える**必要があった。`CardInstance[]` を返せば
   `[...field.spirits, ...field.nexuses]` を `effectSources(...)` に置換するだけで済む。
   移行コストが大幅に小さく、差分も読みやすい
2. **保存先を `PlayerState` にする**。持ち主が構造から自明になり、`GameState` に横断的な配列を
   増やすより素直
3. **貸す効果をカード自身の `effects` に書く**。初版はアクションに `EffectDef[]` を埋める形だったが、
   「データに効果を書き、エンジンが読む」という3層設計の原則に沿うのはこちら

### 初版から維持した点（安全性のため必須）

1. **`levels: null` の必須化**（§2.2）。別案には「空配列は常に true」という記述があったが、
   実測では **false**。この誤解のまま `"levels": []` や `[1]` で書くと**無言で発火しない**
2. **走査の A/B 分類**（§1）。別案は置換対象を「`activeConstraints` など」と例示するに留まり、
   `countSymbols` / `ownFieldSymbolColors` を除外する指示が無かった。
   マジックは `symbol: []` なので実害は出にくいが、**意味的に別物**であり、
   将来スピリットを発生源にする拡張が入ると壊れる。境界は明示しておく
3. **`self` の禁止**（§4.1）と `validate-cards.ts` での検査。別案には言及が無かった
4. **段階移行**（§5）。一括置換ではなく、各段で既存 smoke が無変更で通ることを確認する

### 訂正（初版の記述の行き過ぎ）

初版で「B分類に仮想発生源が混ざると**軽減シンボルが増える**」と書いたが、
**マジックの `symbol` は空配列なので、マジック由来の仮想発生源では実害は出ない**。
分類を維持する理由は「実害が出るから」ではなく「**意味的に別物で、将来の拡張で壊れるから**」が正確。

---

## 8. 未解決（実装時に判断が要る点）

- **フィールドの発生源と仮想発生源の適用順序**。現状の走査は「スピリット→ネクサス」順で、
  同種の効果が複数あっても順序に依存しない実装になっている（加算・OR判定のみ）。
  ただし `reviveOnDestroy` は**最初に一致したものが勝つ**ため、仮想発生源を
  前に置くか後ろに置くかで挙動が変わる。**フィールドを先、仮想を後**を推奨（既存挙動を変えないため）
- 相手に効果を貸すケース（「このターン、**相手は**必ずブロックする」）は
  `ownerPid` を使用者にしたまま `mustBlockGrant` 側の対象指定で表現できるはずだが、
  対象カードのテキストを見て確定すること
