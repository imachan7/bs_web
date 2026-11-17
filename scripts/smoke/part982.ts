// smoke パート982（待機中のカードは効果の対象の候補から外す。候補は targetableSpirits を通る）
// 対象：combineOwnBrave（合体させるブレイヴ・合体先。hostSelf の合体先を含む）と、timedEffect の triggerSwap（『ブロック時』→『アタック時』）
// 待機中のカードは、待機を作った出来事で誘発した効果以外の対象にならない（shared/rules/waiting.ts の canBeTargeted）
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart, timedHas } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"

// 合体条件「バニラ」のブレイヴと、効果を持たないスピリット（＝バニラ）を、カードデータから引く
const braveCard = ALL_CARDS.find((c) => c.type === "brave" && JSON.stringify(c.braveCondition) === JSON.stringify({ vanilla: true }))
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
// 『ブロック時』効果を持つスピリット
const blockers = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.some((e) => e.kind === "triggered" && e.trigger === "onBlock"))
assert(braveCard !== undefined && vanilla.length >= 2 && blockers.length >= 2, "テスト前提: バニラのブレイヴ・バニラのスピリット・『ブロック時』のスピリットが揃っている")

function game(interactive: boolean): GameState {
    const s = createGame("waiting-candidates-rest", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, cardId: string, cores = 1): CardInstance {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// 破壊の待機（自分の出来事以外では対象にならない）
function waitDestroy(inst: CardInstance): void {
    inst.waiting = { kind: "destroy", event: inst.instanceId }
}

console.log("=== A 合体させるブレイヴの候補に、待機中のスピリット状態のブレイヴが入らない ===")
{
    const s = game(true)
    const host = put(s, vanilla[0]!.cardId, 2)
    const waitingBrave = put(s, braveCard!.cardId)
    waitDestroy(waitingBrave)
    const brave = put(s, braveCard!.cardId)
    resolveAction(s, "p1", null, { type: "combineOwnBrave" })
    assert(s.pendingChoice === null, "待機していないブレイヴは1体だけなので選択待ちが立たない")
    assert(s.players.p1.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "待機していないブレイヴが合体する")
    assert(!s.players.p1.field.combinedBraves.some((b) => b.instanceId === waitingBrave.instanceId), "待機中のブレイヴは合体しない")
    assert((host.braveRefs ?? []).length === 1, "合体先のスピリットが参照を持つ")
}

console.log("=== A2 合体先の候補に、待機中のスピリットが入らない ===")
{
    const s = game(true)
    put(s, braveCard!.cardId)
    const waitingHost = put(s, vanilla[0]!.cardId, 2)
    waitDestroy(waitingHost)
    const host = put(s, vanilla[1]!.cardId, 2)
    resolveAction(s, "p1", null, { type: "combineOwnBrave" })
    assert(s.pendingChoice === null, "待機していない合体先は1体だけなので選択待ちが立たない")
    assert((host.braveRefs ?? []).length === 1, "待機していない合体先に合体する")
    assert((waitingHost.braveRefs ?? []).length === 0, "待機中の合体先には付かない")
}

console.log("=== A3 hostSelf：合体させるブレイヴの候補に、待機中のブレイヴが入らない ===")
{
    const s = game(true)
    const self = put(s, vanilla[0]!.cardId, 2)
    const waitingBrave = put(s, braveCard!.cardId)
    waitDestroy(waitingBrave)
    put(s, braveCard!.cardId)
    resolveAction(s, "p1", self, { type: "combineOwnBrave", hostSelf: true })
    assert(s.pendingChoice === null, "待機していないブレイヴは1体だけなので選択待ちが立たない")
    assert((self.braveRefs ?? []).length === 1, "発生源に待機していないブレイヴが合体する")
    assert(!s.players.p1.field.combinedBraves.some((b) => b.instanceId === waitingBrave.instanceId), "待機中のブレイヴは合体しない")
}

console.log("=== B 『ブロック時』を『アタック時』に変えるスピリットの候補に、待機中のスピリットが入らない ===")
{
    const s = game(true)
    const waiting = put(s, blockers[0]!.cardId)
    waitDestroy(waiting)
    const other = put(s, blockers[1]!.cardId)
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "triggerSwap", from: "onBlock" }] } as Parameters<typeof resolveAction>[3])
    assert(s.pendingChoice === null, "待機していないスピリットは1体だけなので選択待ちが立たない")
    assert(timedHas(s, other, "triggerSwap"), "待機していない『ブロック時』のスピリットが『アタック時』に変わる")
    assert(!timedHas(s, waiting, "triggerSwap"), "待機中のスピリットは変わらない")
}

// 対話の選択は requestChoice の安全網（待機中を候補から落とす）で結果が同じになるため、
// 直した箇所を戻すと落ちるのは「非対話で先頭を取る」経路。待機中のものを先頭に置いて確かめる
console.log("=== A' 非対話：待機中のブレイヴを先頭に置いても、待機していないブレイヴが合体する ===")
{
    const s = game(false)
    const host = put(s, vanilla[0]!.cardId, 2)
    const waitingBrave = put(s, braveCard!.cardId)
    waitDestroy(waitingBrave)
    const brave = put(s, braveCard!.cardId)
    resolveAction(s, "p1", null, { type: "combineOwnBrave" })
    assert(s.players.p1.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "待機していないブレイヴが合体する")
    assert((host.braveRefs ?? []).length === 1, "合体先に1つ付く")
}

console.log("=== A2' 非対話：待機中の合体先を先頭に置いても、待機していない合体先に付く ===")
{
    const s = game(false)
    put(s, braveCard!.cardId)
    const waitingHost = put(s, vanilla[0]!.cardId, 2)
    waitDestroy(waitingHost)
    const host = put(s, vanilla[1]!.cardId, 2)
    resolveAction(s, "p1", null, { type: "combineOwnBrave" })
    assert((host.braveRefs ?? []).length === 1, "待機していない合体先に合体する")
    assert((waitingHost.braveRefs ?? []).length === 0, "待機中の合体先には付かない")
}

console.log("=== A3' 非対話 hostSelf：待機中のブレイヴを先頭に置いても、待機していないブレイヴが合体する ===")
{
    const s = game(false)
    const self = put(s, vanilla[0]!.cardId, 2)
    const waitingBrave = put(s, braveCard!.cardId)
    waitDestroy(waitingBrave)
    const brave = put(s, braveCard!.cardId)
    resolveAction(s, "p1", self, { type: "combineOwnBrave", hostSelf: true })
    assert(s.players.p1.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "発生源に待機していないブレイヴが合体する")
    assert(!s.players.p1.field.combinedBraves.some((b) => b.instanceId === waitingBrave.instanceId), "待機中のブレイヴは合体しない")
}

console.log("=== B' 非対話：待機中のスピリットを先頭に置いても、待機していないスピリットに変わる ===")
{
    // 同じカードを2体（BPが同じなので、先頭が自動で選ばれる）
    const s = game(false)
    const waiting = put(s, blockers[0]!.cardId)
    waitDestroy(waiting)
    const other = put(s, blockers[0]!.cardId)
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "triggerSwap", from: "onBlock" }] } as Parameters<typeof resolveAction>[3])
    assert(timedHas(s, other, "triggerSwap"), "待機していないスピリットが『アタック時』に変わる")
    assert(!timedHas(s, waiting, "triggerSwap"), "待機中のスピリットは変わらない")
}

console.log("すべてのチェックに合格しました 🎉（part982）")
