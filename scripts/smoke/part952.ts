// smoke パート952（待機状態のカードを対象に取れるか・発揮できるかの判定。PENDING_STATE.md §3 P4・P5。公式 Q31574）
// 待機は手で印を付けて組む（召喚の支払いで消滅した体は、いまの実装では召喚時効果より前にトラッシュへ移るので、自然な流れでは場面にならない）
import { act, assert, createGame, createInstance, fireFieldEventTriggers, fireTrigger, getCard, placeBurst, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { pushResumeFrames, withWaitingEvent } from "../../server/src/logic/GameState"
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { canBeTargeted, canFireWhileWaiting, isVanishWaiting } from "../../shared/rules/waiting"
import type { CardInstance } from "../../server/src/type"

const EIR = "BS10-035" // 樹氷の女神エイル（召喚時：相手のスピリット1体を手札に戻す）
const DUCK = "BS16-030" // セリザワンド・ダック（破壊時：相手のスピリット1体を手札に戻す）
const GRAVE = "BS06-076" // 暴かれた墓石（ネクサス。アタックステップに自分のスピリットが破壊されたとき、1枚ドロー）
const JIGEN = "BS16-080" // 次元断（バースト：自分のライフ減少後、相手のスピリット1体を手札に戻す）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    const onlyTrigger = (id: string, trigger: string): boolean =>
        getCard(id).effects.some((e) => e.kind === "triggered" && e.trigger === trigger && e.action.type === "return" && e.action.to === "hand")
    assert(getCard(EIR).name === "樹氷の女神エイル" && onlyTrigger(EIR, "onSummon"), "EIR は召喚時に手札へ戻す")
    assert(getCard(DUCK).name === "セリザワンド・ダック" && onlyTrigger(DUCK, "onDestroy"), "DUCK は破壊時に手札へ戻す")
    assert(getCard(GRAVE).name === "暴かれた墓石" && getCard(GRAVE).effects.some((e) => e.kind === "fieldEvent" && e.event === "ownSpiritDestroyed" && e.phase === "attack"), "GRAVE は自分のスピリットの破壊で誘発する")
    assert(getCard(JIGEN).name === "次元断" && getCard(JIGEN).effects.some((e) => e.kind === "burst" && e.event === "ownLifeDamaged" && e.action.type === "return"), "JIGEN はライフ減少後に手札へ戻すバースト")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLA はロクケラトプス")
}

function game(seed: string, interactive = true): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, waiting?: CardInstance["waiting"]): CardInstance {
    const inst = createInstance(cardId, s.turn, 1)
    if (waiting !== undefined) inst.waiting = waiting
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const WAITINGS: { label: string; waiting: NonNullable<CardInstance["waiting"]> }[] = [
    { label: "破壊", waiting: { kind: "destroy", event: "ev" } },
    { label: "消滅", waiting: { kind: "vanish", event: "ev" } },
    { label: "戻す", waiting: { kind: "return", event: "ev", to: "hand" } },
]

console.log("=== 1. 判定関数 ===")
{
    const inst = createInstance(VANILLA, 1, 1)
    assert(canBeTargeted({}, inst) && canFireWhileWaiting(inst, "onSummon"), "待機でなければ、対象に取れて発揮もできる")
    for (const w of WAITINGS) {
        inst.waiting = w.waiting
        assert(!canBeTargeted({}, inst) && canBeTargeted({ waitingEvent: "ev" }, inst), `${w.label}の待機：その待機の出来事で誘発した効果の対象にだけなる`)
        assert(!canBeTargeted({ waitingEvent: "other" }, inst), `${w.label}の待機：別の待機の出来事で誘発した効果の対象にはならない（PENDING_STATE §3 C2）`)
        assert(!canFireWhileWaiting(inst, "onSummon") && !canFireWhileWaiting(inst, "opponentDrew"), `${w.label}の待機：関係ない誘発は発揮できない`)
        assert(canFireWhileWaiting(inst, "onDestroy") && canFireWhileWaiting(inst, "ownSpiritDestroyed") && canFireWhileWaiting(inst, "onBattleWin"), `${w.label}の待機：破壊時・破壊したときは発揮できる`)
    }
}

console.log("=== 2. 召喚時効果は、待機状態の体を対象に取れない（Q31574） ===")
for (const w of WAITINGS) {
    const s = game(`summon-${w.waiting.kind}`)
    const eir = put(s, "p1", EIR)
    const waiting = put(s, "p2", VANILLA, w.waiting)
    const y = put(s, "p2", VANILLA)
    const z = put(s, "p2", VANILLA)
    if (w.waiting.kind === "vanish") assert(isVanishWaiting(waiting), "対象を選ぶ時点で消滅の待機のまま場にいる")
    fireTrigger(s, "p1", eir, "onSummon")
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.pid === "p1", `${w.label}：対象の選択待ちが立つ`)
    assert(pc !== null && pc !== undefined && !pc.candidates.includes(waiting.instanceId), `${w.label}：待機状態の体は候補に無い`)
    assert(pc?.candidates.length === 2 && pc.candidates.includes(y.instanceId) && pc.candidates.includes(z.instanceId), `${w.label}：待機でない2体は候補にある`)
    assert(pc?.waitingEvent === undefined && s.waitingEvent === undefined, `${w.label}：待機の出来事は立たない`)
}
{
    const s = game("summon-only-waiting", false)
    const eir = put(s, "p1", EIR)
    const waiting = put(s, "p2", VANILLA, { kind: "vanish", event: "ev" })
    fireTrigger(s, "p1", eir, "onSummon")
    assert(s.players.p2.field.spirits.includes(waiting) && s.players.p2.hand.every((c) => c !== VANILLA) && s.pendingChoice == null, "待機状態の体しかいなければ、何も戻らない")
}

console.log("=== 3. 破壊時効果は、待機状態の体を対象に取れる ===")
{
    const s = game("destroy-related")
    // ダックと同時に待機に入ったスピリット（同じ出来事）と、別の出来事で待機に入ったスピリット
    const duck = put(s, "p1", DUCK, { kind: "destroy", event: "ev" })
    const waiting = put(s, "p2", VANILLA, { kind: "destroy", event: "ev" })
    const other = put(s, "p2", VANILLA, { kind: "destroy", event: "other" })
    const y = put(s, "p2", VANILLA)
    const handBefore = s.players.p2.hand.length
    fireTrigger(s, "p1", duck, "onDestroy")
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.candidates.includes(waiting.instanceId) && pc.candidates.includes(y.instanceId), "破壊時効果の候補に、待機状態の体と待機でない体の両方がある")
    assert(pc !== null && pc !== undefined && !pc.candidates.includes(other.instanceId), "別の出来事で待機に入ったスピリットは候補に無い（PENDING_STATE §3 C2）")
    assert(pc?.waitingEvent === "ev", "選択待ちが、待機の出来事を持ち回る")
    assert(s.waitingEvent === undefined, "誘発の入口を出たら、外側の値（無し）に戻る")
    act(s, "p1", { type: "resolveChoice", instanceId: y.instanceId })
    assert(!s.players.p2.field.spirits.includes(y) && s.players.p2.hand.length === handBefore + 1, "選んだ体が手札に戻る")
    assert(s.waitingEvent === undefined && s.pendingChoice == null, "解決し終えたら待機の出来事は残らない")
}

console.log("=== 4. 待機状態の体は、関係ない誘発を発揮できない ===")
{
    const s = game("waiting-source")
    const eir = put(s, "p1", EIR, { kind: "destroy", event: "ev" })
    const y = put(s, "p2", VANILLA)
    put(s, "p2", VANILLA)
    fireTrigger(s, "p1", eir, "onSummon")
    assert(s.pendingChoice == null && s.players.p2.field.spirits.includes(y), "破壊待機の体の『召喚時』は発揮しない")
}

console.log("=== 5. 関係する効果の中で起きた別の誘発は、自分の種類で判定する ===")
{
    const s = game("nested")
    const eir = put(s, "p1", EIR)
    const waiting = put(s, "p2", VANILLA, { kind: "destroy", event: "ev" })
    put(s, "p2", VANILLA)
    put(s, "p2", VANILLA)
    withWaitingEvent(s, "ev", () => {
        fireTrigger(s, "p1", eir, "onSummon")
        assert(s.waitingEvent === "ev", "入れ子の誘発を出たら、外側の値に戻る")
    })
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && !pc.candidates.includes(waiting.instanceId) && pc.waitingEvent === undefined, "破壊時効果の中で起きた召喚時効果は、待機状態の体を対象に取れない")
}

console.log("=== 6. 後回しのフレームの印 ===")
{
    const s = game("frames")
    const frame = { kind: "action" as const, selfInstanceId: null, action: { type: "noop" as const } }
    s.waitingEvent = "ev"
    pushResumeFrames(s, [frame, { ...frame, waitingEvent: null }])
    delete s.waitingEvent
    pushResumeFrames(s, [frame])
    const flags = s.resumeStack.map((f) => (f.kind === "action" ? f.waitingEvent : "other"))
    assert(flags[0] === "ev", "未指定の続きは、積んだ時点の待機の出来事を引き継ぐ")
    assert(flags[1] === null, "誘発の入口が「無し」と明示した値は書き換えない")
    assert(flags[2] === undefined, "関係ない効果の続きには付かない")
}

console.log("=== 7. 破壊の列（順番の選択 → 後回しのフレーム）でも、破壊時効果は待機状態の体を対象に取れる ===")
{
    const s = game("batch")
    s.phase = "attack"
    const duck = put(s, "p1", DUCK)
    s.players.p1.field.nexuses.push(createInstance(GRAVE, s.turn, 0))
    refreshLevelAsOverrides(s)
    // ダックと相手のスピリットを同時に破壊する（同じ出来事で待機に入る）
    const x = put(s, "p2", VANILLA)
    const y = put(s, "p2", VANILLA)
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: duck.instanceId }, { pid: "p2", instanceId: x.instanceId }])
    const order = s.pendingChoice
    assert(order?.kind === "option" && order.triggerOrder !== undefined, "ダックの破壊で2種の効果が誘発するので、解決順の選択待ちが立つ")
    const pick = order?.options?.find((o) => o.includes("セリザワンド・ダック"))
    assert(pick !== undefined, "列にダックの破壊時がある")
    act(s, order!.pid, { type: "resolveChoice", option: pick! })
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.pid === "p1", "ダックの破壊時効果の対象の選択待ちが立つ")
    assert(x.waiting?.kind === "destroy" && s.players.p2.field.spirits.includes(x), "相手の体は、破壊待機のまま場にいる")
    assert(pc !== null && pc !== undefined && pc.candidates.includes(x.instanceId) && pc.candidates.includes(y.instanceId), "破壊待機の相手の体も候補にある")
    assert(pc?.waitingEvent !== undefined && pc.waitingEvent === duck.waiting?.event && pc.waitingEvent === x.waiting?.event, "フレームから再開した効果の選択待ちも、同時破壊の待機の出来事を持つ")
}

console.log("=== 8. 後回しにした続きは、消化するときに印を戻して解決する ===")
{
    const s = game("drain")
    const duck = put(s, "p1", DUCK, { kind: "destroy", event: "ev" })
    const x = put(s, "p2", VANILLA, { kind: "destroy", event: "ev" })
    const y = put(s, "p2", VANILLA)
    const z = put(s, "p2", VANILLA)
    fireTrigger(s, "p1", duck, "onDestroy")
    // 破壊時効果の続き（同じ効果がもう1体戻す）を、選択待ちの後ろに積む
    withWaitingEvent(s, "ev", () => pushResumeFrames(s, [{ kind: "action", selfInstanceId: duck.instanceId, action: { type: "return", to: "hand", count: 1 }, actorPid: "p1" }]))
    act(s, "p1", { type: "resolveChoice", instanceId: y.instanceId })
    const pc = s.pendingChoice
    assert(pc?.kind === "target" && pc.candidates.length === 2 && pc.candidates.includes(x.instanceId) && pc.candidates.includes(z.instanceId), "続きの候補に、待機状態の体と待機でない体の両方がある")
    assert(pc?.waitingEvent === "ev", "続きの選択待ちも、待機の出来事を持つ")
}

console.log("=== 9. 待機状態のカードがいる間は、バーストは宣言だけで、効果は適用しない（列を解決しきってから。part953） ===")
{
    const s = game("burst", false)
    s.players.p2.reserve = 10
    const x = put(s, "p1", VANILLA)
    placeBurst(s, "p2", JIGEN)
    x.waiting = { kind: "destroy", event: "ev" }
    // 破壊時効果が相手のライフを減らした、という状況
    withWaitingEvent(s, "ev", () => fireFieldEventTriggers(s, "p2", "ownLifeLost"))
    assert(s.declaredBursts?.length === 1 && s.players.p2.burstSet && s.players.p1.field.spirits.includes(x), "宣言はするが効果は適用せず、待機状態の体は手札に戻らない")
}

console.log("すべてのチェックに合格しました 🎉（part952）")
