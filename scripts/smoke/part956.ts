// smoke パート956（戻す待機：誘発を1本の列で解決してから移す／戻す待機のスピリットが破壊されたら破壊の待機に変わる。
// PENDING_STATE §3 C3・C4。2026-11-15 ユーザー確認）
// 待機は実際の「戻す」（markBounce → flushBounces）で作り、選択への回答は handleAction（act）経由
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance, EffectDef } from "../../server/src/type"
import { flushBounces, markBounce } from "../../server/src/logic/removal"

const VOLCANO = "BS06-074" // 紅玉の火山弾（地竜の自分のスピリットが手札に戻ったとき、BP3000以下の相手のスピリット1体を破壊する）
const ROKU = "BS01-002" // ロクケラトプス（地竜・効果なし）
const GORADON = "BS01-001" // ゴラドン（Lv1 BP1000・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（Lv1 BP3000・効果なし）。効果を手で差し替えて使う

console.log("=== 前提: カードの機械確認 ===")
{
    const e = getCard(VOLCANO).effects.find((x) => x.kind === "fieldEvent" && x.event === "ownSpiritReturnedToHand")
    assert(getCard(VOLCANO).name === "紅玉の火山弾" && e?.kind === "fieldEvent" && e.action.type === "destroy" && JSON.stringify(e.subjectFilter).includes("地竜") && JSON.stringify(e.action).includes('"maxBp":3000'), "火山弾は、地竜が手札に戻ったとき BP3000以下の相手1体を破壊する")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).family.includes("地竜") && getCard(ROKU).effects.length === 0, "ロクケラトプスは地竜・効果なし")
    assert(getCard(GORADON).name === "ゴラドン" && (getCard(GORADON).levels[0]?.bp ?? 9999) <= 3000 && getCard(GORADON).effects.length === 0, "ゴラドンは BP3000以下・効果なし")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).effects.length === 0, "ベルは効果なし")
}

// 「自分のスピリットが手札に戻ったとき、1枚ドローする」
const OWN_RETURNED_DRAW = { id: "t956-r", kind: "fieldEvent", event: "ownSpiritReturnedToHand", levels: [1, 2, 3], action: { type: "draw", count: 1 } } as EffectDef

function withBellEffect(run: () => void): void {
    const card = getCard(BELL)
    const original = card.effects
    card.effects = [OWN_RETURNED_DRAW]
    try {
        run()
    } finally {
        card.effects = original
    }
}
function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p1.hand = []
    s.players.p2.hand = []
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string): CardInstance {
    const inst = createInstance(cardId, 1, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const onField = (s: GameState, pid: PlayerId, inst: CardInstance) => s.players[pid].field.spirits.includes(inst)
// 1つの効果でまとめて手札に戻す
function returnAll(s: GameState, targets: [PlayerId, CardInstance][]): void {
    for (const [pid, inst] of targets) markBounce(s, pid, inst, "hand")
    flushBounces(s)
}
function watchLog(s: GameState, part: string, see: () => void): void {
    const push = s.log.push.bind(s.log)
    s.log.push = (...items) => {
        for (const it of items) if ((typeof it === "string" ? it : (it as { message: string }).message).includes(part)) see()
        return push(...items)
    }
}

console.log("=== 1. 「手札に戻ったとき」は、戻るスピリットを場に残したまま解決し、その後で移す ===")
withBellEffect(() => {
    const s = game("order", false)
    put(s, "p1", BELL)
    const a = put(s, "p1", ROKU)
    let stillThere: boolean | undefined
    watchLog(s, "アキラは1枚ドローした", () => (stillThere = onField(s, "p1", a) && a.waiting?.kind === "return"))
    returnAll(s, [["p1", a]])
    assert(stillThere === true, "「手札に戻ったとき」のドローを解決する時点で、戻るスピリットはまだ戻す待機で場にいる")
    assert(!onField(s, "p1", a) && a.waiting === undefined && s.players.p1.hand.filter((c) => c === ROKU).length === 2, "解決し終えたら手札に戻る（ドローの1枚と合わせて2枚）")
})

console.log("=== 2. 2つの「手札に戻ったとき」は1本の列：ターンプレイヤーが順番を選び、列を解決し終えてから全員を移す ===")
withBellEffect(() => {
    const s = game("queue", true)
    s.players.p1.field.nexuses.push(createInstance(VOLCANO, 1, 0))
    const a = put(s, "p1", ROKU)
    put(s, "p2", BELL)
    const b = put(s, "p2", GORADON)
    const c = put(s, "p2", GORADON)
    returnAll(s, [["p1", a], ["p2", b]])
    const order = s.pendingChoice
    assert(order?.triggerOrder !== undefined && order.pid === s.turnPlayer && order.options?.length === 2, "火山弾（アキラ）とベル（ユウキ）の順番を、ターンプレイヤーが選ぶ")
    assert(onField(s, "p1", a) && onField(s, "p2", b) && a.waiting?.kind === "return" && b.waiting?.kind === "return" && a.waiting.event === b.waiting.event, "順番を聞く時点で、2体とも同じ出来事の戻す待機で場にいる")
    // ベル（ユウキの「手札に戻ったとき」）を先に解決する
    act(s, order!.pid, { type: "resolveChoice", option: order!.options!.find((t) => t.includes("デュアルキャノン・ベル"))! })
    assert(s.players.p2.hand.length === 1, "ユウキが1枚ドローする")
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.pid === "p1", "続けて、火山弾の破壊する対象を選ぶ")
    assert(onField(s, "p2", b) && b.waiting?.kind === "return", "この時点でも、戻るスピリットは場にいる")
    assert(pc !== null && pc !== undefined && pc.candidates.includes(b.instanceId) && pc.candidates.includes(c.instanceId), "同時に戻す待機に入った相手のスピリットも、待機でないスピリットも候補にある")
    act(s, "p1", { type: "resolveChoice", instanceId: c.instanceId })
    assert(s.pendingChoice === null && !onField(s, "p2", c) && s.players.p2.trashCards.includes(GORADON), "選んだスピリットは破壊される")
    assert(!onField(s, "p1", a) && s.players.p1.hand.includes(ROKU) && !onField(s, "p2", b) && s.players.p2.hand.includes(GORADON), "列を解決し終えたら、戻す待機の2体は手札に戻る")
})

console.log("=== 3. 戻す待機のスピリットが、その待機で誘発した効果で破壊された：破壊の待機に変わってトラッシュへ行き、前の待機の誘発は発揮しない ===")
withBellEffect(() => {
    const s = game("changed", true)
    s.players.p1.field.nexuses.push(createInstance(VOLCANO, 1, 0))
    const a = put(s, "p1", ROKU)
    put(s, "p2", BELL)
    const b = put(s, "p2", GORADON)
    put(s, "p2", GORADON)
    const from = s.log.length
    returnAll(s, [["p1", a], ["p2", b]])
    const order = s.pendingChoice
    // 火山弾を先に解決して、戻す待機の相手のスピリットを破壊する
    act(s, order!.pid, { type: "resolveChoice", option: order!.options!.find((t) => t.includes("紅玉の火山弾"))! })
    assert(s.pendingChoice?.kind === "target" && s.pendingChoice.candidates.includes(b.instanceId), "火山弾の候補に、戻す待機の相手のスピリットがある")
    act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId })
    assert(s.pendingChoice === null, "選択待ちが残らない")
    assert(!onField(s, "p2", b) && b.waiting === undefined && s.players.p2.trashCards.includes(GORADON), "破壊されたスピリットはトラッシュへ行く")
    assert(s.players.p2.hand.length === 0, "手札には戻らず、ユウキの「自分のスピリットが手札に戻ったとき」（ベル）も発揮しない")
    assert(s.log.slice(from).every((l) => !(typeof l === "string" ? l : (l as { message: string }).message).includes("ゴラドンは手札に戻った")), "「手札に戻った」のログは出ない")
    assert(!onField(s, "p1", a) && s.players.p1.hand.includes(ROKU), "破壊されなかった自分のスピリットは手札に戻る")
})

console.log("=== 4. 列が選択待ちで止まっている間に、戻す処理がもう一度呼ばれても、列を始め直さない ===")
withBellEffect(() => {
    const s = game("reentry", true)
    s.players.p1.field.nexuses.push(createInstance(VOLCANO, 1, 0))
    const a = put(s, "p1", ROKU)
    put(s, "p2", GORADON)
    put(s, "p2", GORADON)
    returnAll(s, [["p1", a]])
    assert(s.pendingChoice?.kind === "target", "火山弾の対象の選択で止まる")
    const stack = s.resumeStack.length
    flushBounces(s)
    assert(s.resumeStack.length === stack && onField(s, "p1", a), "もう一度呼んでも、続きは増えず、スピリットも移らない")
    act(s, "p1", { type: "resolveChoice", instanceId: s.pendingChoice!.candidates[0]! })
    assert(s.pendingChoice === null && !onField(s, "p1", a) && s.players.p1.hand.filter((c) => c === ROKU).length === 1 && s.players.p2.trashCards.length === 1, "選んだら1体だけ破壊され、スピリットは1回だけ手札に戻る")
})

console.log("すべてのチェックに合格しました 🎉（part956）")
