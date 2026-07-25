# リファクタリング計画書

対象: **共有ルール層の抽出（Phase A）** ＋ **`resolveAction` の分割（Phase B）**

- 作成日: 2026-07-25
- 基準コミット: `fc6cde8`（着手時点は `532dcda` にドリフト。§1.6 の実測値を更新済み）
- 実施タイミング: **BS04 の残23枚の構造化を完了させてから着手する**（ユーザー確定）
  → **達成（2026-07-25）**: BS04 は効果文持ち 97枚中 91枚を構造化し、残る6枚は意図的な見送りとして SPEC.md に理由を明記。着手可
- 位置づけ: 仕様は [SPEC.md](./SPEC.md)、変更履歴は [CHANGELOG.md](./CHANGELOG.md)。
  本ファイルは着手時に参照する実施手順書で、**完了したら削除して CHANGELOG.md に成果を1エントリ残す**

---

## 0. なぜやるか（3行）

1. サーバーとクライアントで**ルール判定が二重実装**されており、ズレても型エラーにならず実対戦でしか露見しない。**現に1件バグっている**（§1.3）
2. その追随コストを避けるために**実装するカードを選別する事態**がすでに起きている（コミット `cb325c9`）
3. `resolveAction` が3028行・100 case の単一関数で、カードバッチのたびに追記するため**並行作業の衝突とサブエージェントのトークン浪費**が確定的

---

## 1. 現状の計測値と問題（基準コミット `fc6cde8` 時点）

### 1.1 ファイル規模

| ファイル | 行数 | 内訳 |
| :-- | --: | :-- |
| `server/src/logic/EffectModules.ts` | 5469 | うち `resolveAction` = **3189行・105 case**（着手時点の実測。基準コミット時は5263行・3028行・100 case） |
| `public/src/renderer.ts` | 1731 | うち **53〜768行がサーバーロジックのミラー**（DOM描画は770行〜） |
| `server/src/logic/RuleValidator.ts` | 803 | 34〜202行のコスト計算がクライアントと重複 |
| `public/dist/main.js` | 79,400 bytes | Phase A 後の比較基準（着手時点の実測） |

### 1.2 二重実装の一覧

`state`→`view`、`getCard`→`master`、`currentLevel`→`levelOf` の機械的置換だけの差分になっている。

| クライアント（`renderer.ts`） | サーバー |
| :-- | :-- |
| `levelOf` (59) | `GameState.currentLevel` (258) |
| `countAuraCounter` (88) / `checkAuraCondition` (109) / `auraAppliesTo` (135) / `auraAmount` (193) / `effectiveBp` (207) | `EffectModules` 同名 (398/427/456/516/531) |
| `spiritHasKeywordView` (234) / `instHasColorView` (265) / `spiritHasFamilyView` (273) / `matchesFamilyFilterView` (310) | `EffectModules.spiritHasKeyword` (123) / `instHasColor` (632) / `spiritHasFamily` (339) / `matchesFamilyFilter` (378) |
| `hasGlobalConstraint` (324) / `cantActByCost` (346) / `activeConstraints` (356) / `isUntargetableByOpponent` (385) / `hasArmorAgainst` (393) / `hasMagicImmunityView` (455) | `EffectModules` 同名 (799/–/559/594/613/656)、`cantActByCost` は `RuleValidator` (637) |
| `costModTotal` (483) / `reductionGrantSymbols` (510) / `hasMagicRestriction` (549) / `hasMagicFreeGrant` (573) / `ownFieldSymbolColors` (593) / `effectiveCost` (602) | `RuleValidator` 同名 (34/64/108/138/169/182) |
| `canBlockAttacker` (412) | `RuleValidator.validateBlock` (555) |
| `isVanillaCard` (49) / `instHasCost` (44) | `EffectModules` 同名 (101/107) |

**型は共有されている**（`renderer.ts` は `server/src/type` を import 済み）ため、ロジックだけがズレる。

### 1.3 現存する乖離バグ（本計画で解消される）

- **ミカファール Lv2 のクライアント表示バグ**
  `renderer.ts:573 hasMagicFreeGrant` が `effect.scope === "allMagicHandAndTegamoto"` を見ておらず、
  `effect.colorFilter !== card.color` だけで弾いている。サーバー（`RuleValidator.ts:138`）は scope を見る。
  → 大天使ミカファール（BS02）Lv2 が場にあるとき、**色の合わない手札マジックが
  クライアント上でコスト0表示・使用可能ハイライトにならない**（サーバーは無償で受理する）。

- **フォクシンの制限がクライアントに出ない**
  `renderer.ts:549 hasMagicRestriction` は `"oncePerTurnAll"` を引数に取れるが、
  `GameView` に `magicUsedThisTurn` が無いため実際のゲートに使えていない。
  → 作戦参謀フォクシン（BS03-069）下で1枚使用後、2枚目が使用不可として表示されない。

### 1.4 根本原因

`server/src/logic/GameState.ts:33` がモジュール読み込み時に `fs.readFileSync(cards.json)` を実行するため、
esbuild のクライアントバンドルからサーバーロジックを import できない。**カードマスタ参照を注入可能にすれば解消する。**

### 1.5 分割の障害が無いことの確認

`resolveAction` の case 本体が参照する closure ローカルは **5個のみ**
（`opp` 71回 / `sourceName` 198回 / `srcColor` 33回 / `srcType` 28回 / `destroyContext` 5回）、
再帰呼び出しは **6箇所**。コンテキストオブジェクト1個を渡せば分割できる。

### 1.6 安全網

- `npm run smoke:quiet` → **2137件 全合格**（着手前ベースライン。2026-07-25 実測。基準コミット時は2055件）
- `tsconfig.json` は `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- `public/src` も型検査対象なのでクライアント側の破壊も `npm run typecheck` で捕まる

---

## 2. Phase A：共有ルール層の抽出

### A-0. 着手前の必須調整

Phase A は `renderer.ts` の約715行を削除するため、Gemini 側の UI 作業（`bs_web-ui` worktree）と**確実に衝突する**。

1. `chatbox.md` で renderer.ts の作業凍結を依頼する
2. 先方の未マージ分をすべて取り込む
3. 取り込み後に着手する

### A-1. `shared/` ディレクトリを新設

**制約: `shared/` は `node:fs` 等の node 組み込みモジュールを一切 import しない**（esbuild でバンドルするため）。
`tsconfig.json` の `include` に `"shared/**/*.ts"` を追加する。

#### `shared/cardDb.ts` — カードマスタ参照の注入

```ts
import type { CardData } from "../server/src/type"

let lookup: ((cardId: string) => CardData) | null = null

// サーバーは GameState.getCard、クライアントは renderer.setCardDb 内の master を注入する
export function setCardLookup(fn: (cardId: string) => CardData): void {
    lookup = fn
}

export function card(cardId: string): CardData {
    if (!lookup) throw new Error("カードマスタが未設定です（setCardLookup を先に呼ぶこと）")
    return lookup(cardId)
}
```

- サーバー: `GameState.ts` の `getCard` 定義直後に `setCardLookup(getCard)` を呼ぶ
- クライアント: `renderer.ts:23 setCardDb` の中で `setCardLookup(master)` を呼ぶ

#### `shared/board.ts` — `GameState` と `GameView` が両方満たす読み取り専用インターフェース

```ts
export interface BoardPlayer {
    id: PlayerId
    reserve: number
    trashCores: number
    trashCards: string[]
    tegamoto: string[]
    field: { spirits: CardInstance[]; nexuses: CardInstance[] }
}

export interface Board {
    turn: number
    turnPlayer: PlayerId
    phase: Phase
    battle: BattleState | null
    turnConstraints: TurnConstraintDef[]
    magicUsedThisTurn: Record<PlayerId, number>
    players: Record<PlayerId, BoardPlayer>
}
```

- `PlayerState` / `PlayerView` は上記フィールドを**すでに全て持っている**ため既存型の変更は不要
- 唯一の追加: **`GameView` に `magicUsedThisTurn: Record<PlayerId, number>` を足し、
  `GameState.viewFor` でそのまま配信する**（隠匿情報なし。§1.3 のフォクシンのバグもこれで直る）

### A-2. 純粋述語を `shared/` へ移設

| 新ファイル | 移す関数（移動元） |
| :-- | :-- |
| `shared/rules.ts` | `KEYWORDS` / `hasKeyword` / `effectActiveAtLevel` / `isVanillaCard` / `instHasCost` / `instHasColor` / `currentLevel`（`GameState.ts` から）/ `spiritHasKeyword` / `hasContinuousKeywordGrant` / `spiritHasFamily` / `matchesFamilyFilter` / `isSpiritOnField` / `countAuraCounter` / `checkAuraCondition` / `auraAppliesTo` / `auraAmount` / `effectiveBp` / `activeConstraints` / `isUntargetableByOpponent` / `hasArmorAgainst` / `hasGlobalConstraint` / `hasMagicImmunity` / `instanceSymbolCount` / `countSymbols`（`GameState.ts` から）/ `cantActByCost` |
| `shared/cost.ts` | `costModTotal` / `reductionGrantSymbols` / `hasMagicRestriction` / `hasMagicFreeGrant` / `ownFieldSymbolColors` / `effectiveCost`（すべて `RuleValidator.ts:34-202` から） |
| `shared/block.ts` | `renderer.ts:412 canBlockAttacker` と `RuleValidator.ts:555 validateBlock` の共通判定を `canBlock(board, ...): string \| null` に一本化（`validateBlock` はエラー文言を返す薄いラッパにする） |

**移設ルール（重要）**: 一方にしか無い機能は**必ずサーバー側を正として採用する**。具体的には
`hasMagicFreeGrant` の `scope: "allMagicHandAndTegamoto"` 分岐と `requireTegamotoScope` 引数を残すこと。
クライアント側の「簡易版」コメントが付いた実装を正にしてはいけない。

### A-3. 呼び出し側の差し替え

- `EffectModules.ts` / `RuleValidator.ts` / `GameState.ts`: 自前定義を削除して `shared/` から import。
  **外部から import されている名前は再エクスポートで残す**
  （例: `export { effectiveBp } from "../../../shared/rules"`）。
  `EffectModules.effectiveBp` などを import している箇所が多数あるため、これで既存 import を壊さない
- `public/src/renderer.ts`: 53〜768行のミラー群を削除して `shared/` から import。
  `levelOf` / `spiritHasKeywordView` / `instHasColorView` / `spiritHasFamilyView` は
  `main.ts` からの import を壊さないよう**再エクスポートで名前を残す**

### A-4. 初期化順序の確認

`shared/` はカード実体を持たず注入に依存するため、クライアントで `setCardDb`（→ `setCardLookup`）が
呼ばれる前に `shared/` の関数が走らないことを `main.ts` の初期化順序で確認する。

---

## 3. Phase B：`resolveAction` の分割

### B-1. コンテキスト型とレジストリ型

**`server/src/logic/actions/types.ts`**

```ts
export interface ActionCtx {
    state: GameState
    owner: PlayerId
    opp: PlayerId
    self: CardInstance | null
    sourceName: string
    srcColor: Color | undefined
    srcType: "spirit" | "nexus" | "magic" | undefined
    destroyContext: DestroyContext
    targetInstanceId: string | undefined
    chosenOption: string | undefined
    chosenCardIndex: number | undefined
    // 既存の6箇所の再帰呼び出し用。self を差し替えて再入できる
    resolve: (action: EffectAction, selfOverride?: CardInstance | null) => void
}

// 全 EffectAction.type を網羅する型。分割モジュールは Partial<ActionRegistry> を返し、
// 合成結果を ActionRegistry として型注釈することで【網羅性をコンパイル時に検証】する
export type ActionRegistry = {
    [K in EffectAction["type"]]: (
        ctx: ActionCtx,
        action: Extract<EffectAction, { type: K }>,
    ) => void
}
```

> **現在の switch が持っている網羅性チェックを失わないことが最重要。**
> `ActionRegistry` への代入により、case の書き漏れが typecheck エラーになる状態を維持する。

### B-2. ドメイン別モジュールへ分割（`server/src/logic/actions/`）

各ファイルは `Partial<ActionRegistry>` を default export する。

| ファイル | 担当する `type`（概数） |
| :-- | :-- |
| `destroy.ts` | `destroy` / `destroyAll` / `destroyExhausted` / `destroyNexus` / `destroySelf` / `destroyOwnByCost` / `destroyAllExceptChosenColors` / `destroyAllNexuses*` / `sacrificeNexusThenWipeEnemyNexusCores` ほか（約14） |
| `cores.ts` | `coreRemove*` / `coreCharge` / `coreGain*` / `voidCoreTo*` / `coreSqueeze*` / `coreToVoidOwn` / `coreToTrash*` / `trashCoresTo*` / `reclaimTrashCores` / `coreDrainAllOthers` / `coreTradeToOpponentTrash` / `tenshoCoreDump` / `linkNexusCoresChoice`（約24） |
| `buff.ts` | `selfBuff` / `selfBuffPer` / `bpBuff` / `bpBuffAll` / `bpBuffPer` / `bpBuffByExhaustOwn` / `selfBuffByHandDiscard`（約8） |
| `exhaustRefresh.ts` | `exhaust*` / `refresh*`（約13） |
| `handDeck.ts` | `draw*` / `discard*` / `deckReveal` / `recover*` / `mill*` / `handMagicToTegamotoDraw` / `return*ToHand` / `returnToDeckTop`（約18） |
| `grant.ts` | `grantKeyword*` / `grantColor*` / `grantFamilyChoiceAll` / `grantAlsoCostAll` / `levelOverride*` / `levelUpThisTurn` / `levelMaxAllOwnThisTurn` / `addSymbolThisTurn` / `suppressTriggerThisTurn` / `banActByCostThisTurn` / `grantBlockerImmunity` / `negateOwnBlockConstraint`（約16） |
| `battleFlow.ts` | `endBattle` / `endAttackStep*` / `swapBattler` / `battleCompareByLevel` / `lockFlash` / `lifeCrush` / `lifeCharge` / `deployNexus` / `summonFromHandFree` / `refireSummonEffect`（約12） |

`server/src/logic/actions/index.ts` が全モジュールを合成して `ACTION_HANDLERS: ActionRegistry` を作る。

### B-3. `resolveAction` を薄いディスパッチャにする

**シグネチャ（9引数）は変更しない**（呼び出し元が多数あるため）。中身を約30行に置き換える:
ctx を組み立てる → `ACTION_HANDLERS[action.type]` を引く → 呼ぶ。

`pickEnemyByBp` / `pickEnemyCandidates` / `tryInteractiveTargetChoice` / `tryInteractiveCardChoice` /
`requestChoice` / `placeCoresOnSpirit` などの共有ヘルパーは `EffectModules.ts` に残し、
`actions/*` から import する。循環参照が問題になる場合のみ `server/src/logic/actionHelpers.ts` へ切り出す。

**結果の見込み**: `EffectModules.ts` 5263行 → 約1200行、`actions/*` 各300〜600行。

---

## 4. 実施順序・検証・コミット

### 順序

**Phase A → Phase B。** A は `EffectModules.ts` の 393〜830行付近、B は 1681〜4708行を触るため直接は競合しないが、
A を先にやると `actions/*` が最初から `shared/` を import できて手戻りが無い。

### 検証（Phase ごと、できれば各モジュール移設ごとに実行）

```
npm run typecheck && npm run smoke:quiet && npm run build:client
```

| 項目 | 合格条件 |
| :-- | :-- |
| typecheck | 0エラー（`ActionRegistry` により case 漏れも検出される） |
| smoke | **2137件 全合格**。件数が減っていたらテストの取りこぼし |
| build:client | 成功 ＝ `shared/` に node 依存が混入していないことの証明 |

### バンドルサイズ確認（Phase A 必須）

```
ls -l public/dist/main.js   # 基準: 79,400 bytes
```

大幅増加はサーバーコード（`cards.json` 読み込み等）がバンドルに漏れたサイン。

### E2E

```
PORT=3100 npx tsx server/src/index.ts   # 別ターミナル
PORT=3100 npx tsx scripts/e2e.ts
```

### 回帰テストの追加（Phase A）

§1.3 の2件を新しい smoke パート（part56 以降）にサーバー側の等価アサーションとして追加する。

1. ミカファール Lv2 が場にあるとき、色の合わない手札マジックの `effectiveCost` が 0 になる
2. フォクシン下でマジック1枚使用後、`validateCastMagic` が2枚目を拒否する

クライアント表示そのものは smoke で検証できないが、**共有関数が同一実装になれば
サーバー側テストがクライアント挙動の保証になる** ＝ これが本リファクタの主目的。

加えて手動確認:
1. 大天使ミカファールを Lv2 で場に出し、色の合わない手札マジックがクライアント上でコスト0表示・使用可能ハイライトになること
2. フォクシン下でマジック1枚使用後、2枚目がクライアント上で使用不可表示になること

### コミット規律

**各 Phase 完了時（できれば各モジュール移設ごと）に必ず全緑でコミットする。**
巨大な未コミット diff は中断→再開のたびにトークンを浪費する（CLAUDE.md のコミット規律）。

---

## 5. 本計画の対象外（直さないと判断したもの）

| 対象 | 理由 |
| :-- | :-- |
| `type.ts` の `EffectAction` 100分岐ユニオン | データスキーマなので1箇所集約が正しい |
| `scripts/smoke/part1〜55` の分割構成 | CLAUDE.md のトークン規律どおりに機能している |
| `GameEngine.ts` / `RuleValidator.ts` の関数分割粒度 | 適切 |
| 効果の3層設計（`type.ts` → `EffectModules.ts` → `cards.json`） | 妥当な設計。本計画は3層目の**実装ファイルの物理配置**だけを変える |
