// smoke パート955（待機状態のカードを対象に取れるのは、その待機の出来事で誘発した効果だけ。PENDING_STATE §3 C2。2026-11-15 ユーザー確認）
// 待機は手で組まず、実際の破壊（destroyTargetsBatch）と選択への回答（act）で作る
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance, EffectDef } from "../../server/src/type"
import { destroyTargetsBatch } from "../../server/src/logic/removal"

const DUCK = "BS16-030" // セリザワンド・ダック（破壊時：相手のスピリット1体を手札に戻す）
const BELL = "BS01-089" // デュアルキャノン・ベル（効果なし）。破壊時効果を手で差し替えて使う
const ROKU = "BS01-002" // ロクケラトプス（効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(DUCK).name === "セリザワンド・ダック" && getCard(DUCK).effects.some((e) => e.kind === "triggered" && e.trigger === "onDestroy" && e.action.type === "return"), "ダックは破壊時に相手のスピリット1体を手札に戻す")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).effects.length === 0 && getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).effects.length === 0, "ベル・ロクケラトプスは効果なし")
}

// 「破壊時：相手のスピリット1体を破壊する」
const ON_DESTROY_DESTROY = { id: "t955-d", kind: "triggered", trigger: "onDestroy", levels: [1, 2, 3], optional: false, action: { type: "destroy", count: 1 } } as EffectDef

function withBellEffect(run: () => void): void {
    const card = getCard(BELL)
    const original = card.effects
    card.effects = [ON_DESTROY_DESTROY]
    try {
        run()
    } finally {
        card.effects = original
    }
}
function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string): CardInstance {
    const inst = createInstance(cardId, 1, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const onField = (s: GameState, pid: PlayerId, inst: CardInstance) => s.players[pid].field.spirits.includes(inst)

console.log("=== 1. A の破壊時効果で B を破壊した：B の破壊時効果は、破壊待機の A を対象に取れない ===")
withBellEffect(() => {
    const s = game("later-event")
    const a = put(s, "p1", BELL)
    const mine = put(s, "p1", ROKU)
    const mine2 = put(s, "p1", ROKU)
    const b = put(s, "p2", DUCK)
    put(s, "p2", ROKU)
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: a.instanceId }], { sourcePid: "p2", sourceType: "spirit" })
    assert(s.pendingChoice?.kind === "target" && s.pendingChoice.pid === "p1" && s.pendingChoice.candidates.includes(b.instanceId), "A の破壊時効果で、破壊する相手のスピリットを選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId })
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.pid === "p2", "B（ダック）の破壊時効果で、手札に戻すスピリットを選ぶ")
    assert(onField(s, "p1", a) && a.waiting?.kind === "destroy" && onField(s, "p2", b) && b.waiting?.kind === "destroy", "この時点で A も B も破壊待機で場にいる")
    assert(a.waiting?.event !== b.waiting?.event, "A と B は別の出来事で待機に入っている")
    assert(pc !== null && pc !== undefined && !pc.candidates.includes(a.instanceId), "先に待機に入っていた A は候補に無い")
    assert(pc?.candidates.length === 2 && pc.candidates.includes(mine.instanceId) && pc.candidates.includes(mine2.instanceId), "待機でないスピリットだけが候補")
    act(s, "p2", { type: "resolveChoice", instanceId: mine.instanceId })
    assert(s.pendingChoice === null && !onField(s, "p1", a) && !onField(s, "p2", b) && !onField(s, "p1", mine) && onField(s, "p1", mine2), "解決し終えたら A・B はトラッシュ、選ばれたスピリットは手札")
    assert(s.players.p1.trashCards.includes(BELL) && s.players.p2.trashCards.includes(DUCK) && s.players.p1.hand.includes(ROKU), "行き先はそれぞれトラッシュと手札")
})

console.log("=== 2. 同時に破壊された A と B：A の破壊時効果は、破壊待機の B を対象に取れる ===")
{
    const s = game("same-event")
    const a = put(s, "p1", DUCK)
    const b = put(s, "p2", ROKU)
    const other = put(s, "p2", ROKU)
    destroyTargetsBatch(s, "p1", [{ pid: "p1", instanceId: a.instanceId }, { pid: "p2", instanceId: b.instanceId }])
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.pid === "p1", "A（ダック）の破壊時効果で、手札に戻すスピリットを選ぶ")
    assert(a.waiting?.event !== undefined && a.waiting.event === b.waiting?.event, "A と B は同じ出来事で待機に入っている")
    assert(pc !== null && pc !== undefined && pc.candidates.includes(b.instanceId) && pc.candidates.includes(other.instanceId), "同時に破壊された B も、待機でないスピリットも候補にある")
}

console.log("すべてのチェックに合格しました 🎉（part955）")
