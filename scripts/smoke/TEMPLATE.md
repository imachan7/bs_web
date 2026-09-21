# smoke パートのテンプレート

**既存の part を読んで書き方を覚え直さないこと。** 下をコピーして `partN.ts` にし、`// ▼` の所だけ埋める。
番号は `git ls-tree --name-only HEAD scripts/smoke/ | sort -V | tail -1` の次。`smoke.ts` への import は不要。

合否は `npx tsx scripts/smoke/partN.ts 2>&1 | grep -c "❌"` が **0**（`assert` は失敗しても例外を投げず、末尾のバナーは出る）。

```ts
// smoke パートN（▼弾・カード番号：何を確かめるか。設計の参照先）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const TARGET = "▼BS16-001" // ▼カード名（色・種別・コスト）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    // cardId は記憶で書かない。名前・種別・色・コストをここで必ず確かめる
    assert(getCard(TARGET).name === "▼カード名" && getCard(TARGET).type === "spirit", "TARGETは▼")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive // true＝選択を PendingChoice で止める／false＝自動で選ぶ
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    // シャッフルは Math.random。山札に依存するなら中身をここで固定する
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. ▼成立する場面 ===")
{
    const s = game("case1")
    const me = put(s, "p1", TARGET, 1)
    // ▼操作：handleAction(s, "p1", { type: ... }) など
    assert(▼条件, "▼期待する結果")
}

console.log("=== 2. ▼成立しない場面（条件を1つだけ外す） ===")
{
    const s = game("case2")
    // ▼
}

console.log("すべてのチェックに合格しました 🎉（partN）")
```

## helpers から import できるもの（`scripts/smoke/helpers.ts` 末尾の export）

| 用途 | 関数 |
| :-- | :-- |
| 盤面を作る | `createGame` `createInstance` `runTurnStart` `engineRunTurnStart` `endTurn` `refreshLevelAsOverrides` `refreshSpirit` `placeBurst` `draw` |
| 操作する | `handleAction` `act` `resolveAction` `declareBlock` `takeLifeAndResolve` `autoPickTarget` |
| 誘発を直接起こす | `fireTrigger` `fireSummonTrigger` `fireStepTriggers` `fireFieldEventTriggers` `resolveFunsai` |
| 除去 | `destroySpirit` `destroyNexus`（同時破壊は `server/src/logic/removal` の `destroyTargetsBatch`） |
| 読む | `getCard` `effectiveBp` `effectiveCost` `currentLevel` `minLevelCores` `hasKeyword` `spiritHasKeyword` `spiritHasFamily` `cardHasColor` `hasArmorAgainst` `canAwaken` `costCantAct` `viewFor` `effectSources` |
| 判定 | `assert` |

## よくある形

- **選択を挟む**：`game(seed, true)` にして操作 → `s.pendingChoice` を見る → `handleAction` で答える
- **「〜ことで」**：払える場面と、後半が解決できず**払えない**場面の2つを必ず書く（COST_MODEL.md）
- **「〜できる」**：任意なので、断った場面も1つ書く
- **既知のバグの再発防止**：直す前のコードで ❌ になることを確かめてから入れる
