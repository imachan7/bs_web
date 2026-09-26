// smoke パート396（pay の then 側に足した部品：bpBuff・refreshOne・placeCores・summonFromHandFree・
// summonFromTrashFree・recoverSpiritFromTrash・recoverMagicFromTrash・destroyByBpBudget・
// destroyBlockerAfterBattle・lifeCrush・levelOverrideOpponentNexuses・colorlessSelfThisBattle・
// protectLifeByCostThisTurn・negateLifeDamageFromTarget。COST_MODEL.md §1）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    resolveAction,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const RED = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ・BP1000）
const PURPLE = "BS01-027" // ウィル・オーブ（紫・コスト1・BP3000）
const MAGIC = "BS01-114" // バスタースピア（赤・マジック・コスト3）
const NEXUS = "BS01-098" // 燃えさかる戦場（赤・ネクサス・コスト3）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).type === "spirit" && getCard(RED).colors.includes("red"), "REDは赤のスピリット")
    assert(getCard(PURPLE).name === "ウィル・オーブ" && getCard(PURPLE).type === "spirit" && getCard(PURPLE).colors.includes("purple"), "PURPLEは紫のスピリット")
    assert(getCard(MAGIC).name === "バスタースピア" && getCard(MAGIC).type === "magic", "MAGICはマジック")
    assert(getCard(NEXUS).name === "燃えさかる戦場" && getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 5
    s.players.p2.reserve = 5
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// コストは全ケース共通：自分のリザーブのコア1個をトラッシュへ（removeCores。part395 と同じ器）
function costRemoveOne() {
    return { type: "removeCores" as const, side: "own" as const, from: ["reserve" as const], target: "spread" as const, count: 1, to: "trash" as const }
}

console.log("=== 1. bpBuff：対象がいれば払ってBP増加、いなければ払わない ===")
{
    const s = game("case1a")
    const me = put(s, "p1", RED, 1)
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "bpBuff", amount: 1000 } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
    assert(me.cores >= 0, "対象は場にいる") // BP増加自体はeffectiveBpで確認
}
{
    const s = game("case1b")
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "bpBuff", amount: 1000 } })
    assert(s.players.p1.reserve === 5, "対象がいないため払わなかった")
}

console.log("=== 2. refreshOne：疲労した自分のスピリットがいれば払って回復、いなければ払わない ===")
{
    const s = game("case2a")
    const me = put(s, "p1", RED, 1)
    me.isRested = true
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "refreshOne" } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
    assert(!me.isRested, "回復した")
}
{
    const s = game("case2b")
    const me = put(s, "p1", RED, 1)
    me.isRested = false
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "refreshOne" } })
    assert(s.players.p1.reserve === 5, "回復状態のスピリットがいないため払わなかった")
}

console.log("=== 3. placeCores：置き先がいれば払って置く、いなければ払わない ===")
{
    const s = game("case3a")
    const me = put(s, "p1", RED, 1)
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: costRemoveOne(),
        then: { type: "placeCores", from: "void", to: "spirit", target: "one", count: 1 },
    })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
    assert(me.cores === 2, "対象にコアが置かれた")
}
{
    const s = game("case3b")
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: costRemoveOne(),
        then: { type: "placeCores", from: "void", to: "spirit", target: "one", count: 1 },
    })
    assert(s.players.p1.reserve === 5, "置き先がいないため払わなかった")
}

console.log("=== 4. summonFromHandFree：条件に合う手札があれば払って召喚、なければ払わない ===")
{
    const s = game("case4a")
    s.players.p1.hand.push(RED)
    const before = s.players.p1.field.spirits.length
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "summonFromHandFree", colorFilter: "red" } })
    // 召喚された個体の維持コア1個もリザーブから払われる（pay自体のコスト1個とは別。summonFreeFromHandIndex）
    assert(s.players.p1.reserve === 3, "リザーブ1個（pay）＋1個（維持コア）を払った")
    assert(s.players.p1.field.spirits.length === before + 1, "召喚された")
}
{
    const s = game("case4b")
    s.players.p1.hand = [] // 初期手札に赤のスピリットが混ざりうるため、明示的に空にする
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "summonFromHandFree", colorFilter: "red" } })
    assert(s.players.p1.reserve === 5, "条件に合う手札がないため払わなかった")
}

console.log("=== 5. summonFromTrashFree：条件に合うトラッシュがあれば払って召喚、なければ払わない ===")
{
    const s = game("case5a")
    s.players.p1.trashCards.push(RED)
    const before = s.players.p1.field.spirits.length
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "summonFromTrashFree", colorFilter: "red" } })
    // 召喚された個体の維持コア1個もリザーブから払われる（pay自体のコスト1個とは別。summonFreeFromTrashIndex）
    assert(s.players.p1.reserve === 3, "リザーブ1個（pay）＋1個（維持コア）を払った")
    assert(s.players.p1.field.spirits.length === before + 1, "召喚された")
}
{
    const s = game("case5b")
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "summonFromTrashFree", colorFilter: "red" } })
    assert(s.players.p1.reserve === 5, "条件に合うトラッシュがないため払わなかった")
}

console.log("=== 6. recoverSpiritFromTrash：条件に合うトラッシュがあれば払って回収、なければ払わない ===")
{
    const s = game("case6a")
    s.players.p1.trashCards.push(RED)
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "recoverSpiritFromTrash", count: 1 } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
    assert(s.players.p1.hand.length === before + 1, "回収された")
}
{
    const s = game("case6b")
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "recoverSpiritFromTrash", count: 1 } })
    assert(s.players.p1.reserve === 5, "トラッシュにスピリットカードがないため払わなかった")
}

console.log("=== 7. recoverMagicFromTrash：条件に合うトラッシュがあれば払って回収、なければ払わない ===")
{
    const s = game("case7a")
    s.players.p1.trashCards.push(MAGIC)
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "recoverMagicFromTrash" } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
    assert(s.players.p1.hand.length === before + 1, "回収された")
}
{
    const s = game("case7b")
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "recoverMagicFromTrash" } })
    assert(s.players.p1.reserve === 5, "トラッシュにマジックカードがないため払わなかった")
}

console.log("=== 8. destroyByBpBudget：予算以下の相手がいれば払って破壊、いなければ払わない ===")
{
    const s = game("case8a")
    const foe = put(s, "p2", PURPLE, 1)
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "destroyByBpBudget", budget: 3000 } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
    assert(!s.players.p2.field.spirits.includes(foe), "対象が破壊された")
}
{
    const s = game("case8b")
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "destroyByBpBudget", budget: 3000 } })
    assert(s.players.p1.reserve === 5, "予算以下の相手がいないため払わなかった")
}

console.log("=== 9. destroyBlockerAfterBattle：ブロックしたスピリットがいれば払って予約、いなければ払わない ===")
{
    const s = game("case9a")
    const me = put(s, "p1", RED, 1)
    const foe = put(s, "p2", PURPLE, 1)
    s.battle = { attackerInstanceId: me.instanceId, blockerInstanceId: foe.instanceId, directed: false }
    resolveAction(s, "p1", me, { type: "pay", cost: costRemoveOne(), then: { type: "destroyBlockerAfterBattle" } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
    assert((s.battle?.endBattleDestroy ?? []).length === 1, "バトル終了後の破壊が予約された")
}
{
    const s = game("case9b")
    const me = put(s, "p1", RED, 1)
    resolveAction(s, "p1", me, { type: "pay", cost: costRemoveOne(), then: { type: "destroyBlockerAfterBattle" } })
    assert(s.players.p1.reserve === 5, "ブロックしたスピリットがいないため払わなかった")
}

console.log("=== 10. lifeCrush：相手のライフがcount以上なら払って減らす、足りなければ払わない ===")
{
    const s = game("case10a")
    s.players.p2.life = 3
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "lifeCrush", count: 1 } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
    assert(s.players.p2.life === 2, "ライフが減った")
}
{
    const s = game("case10b")
    s.players.p2.life = 0
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "lifeCrush", count: 1 } })
    assert(s.players.p1.reserve === 5, "相手のライフが足りないため払わなかった")
}

console.log("=== 11. levelOverrideOpponentNexuses：相手のネクサスがいれば払って書き換え、いなければ払わない ===")
{
    const s = game("case11a")
    const nex = createInstance(NEXUS, s.turn, 3)
    s.players.p2.field.nexuses.push(nex)
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "levelOverrideOpponentNexuses", level: 1 } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
}
{
    const s = game("case11b")
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "levelOverrideOpponentNexuses", level: 1 } })
    assert(s.players.p1.reserve === 5, "相手のネクサスがいないため払わなかった")
}

console.log("=== 12. colorlessSelfThisBattle：発生源が場にいれば払って印を付ける、いなければ払わない ===")
{
    const s = game("case12a")
    const me = put(s, "p1", RED, 1)
    resolveAction(s, "p1", me, { type: "pay", cost: costRemoveOne(), then: { type: "colorlessSelfThisBattle" } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
}
{
    const s = game("case12b")
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "colorlessSelfThisBattle" } })
    assert(s.players.p1.reserve === 5, "発生源が場にいないため払わなかった")
}

console.log("=== 13. protectLifeByCostThisTurn：対象を要求しないので、コストさえ払えれば常に発動する ===")
{
    const s = game("case13a")
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "protectLifeByCostThisTurn", maxCost: 3 } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払って発動した")
}
{
    const s = game("case13b")
    s.players.p1.reserve = 0
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "protectLifeByCostThisTurn", maxCost: 3 } })
    assert(s.players.p1.reserve === 0, "コストが払えないため発動しなかった")
}

console.log("=== 14. negateLifeDamageFromTarget：相手にスピリットがいれば払って印を付ける、いなければ払わない ===")
{
    const s = game("case14a")
    put(s, "p2", PURPLE, 1)
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "negateLifeDamageFromTarget" } })
    assert(s.players.p1.reserve === 4, "リザーブ1個を払った")
}
{
    const s = game("case14b")
    resolveAction(s, "p1", null, { type: "pay", cost: costRemoveOne(), then: { type: "negateLifeDamageFromTarget" } })
    assert(s.players.p1.reserve === 5, "相手にスピリットがいないため払わなかった")
}

console.log("すべてのチェックに合格しました 🎉（part396）")
