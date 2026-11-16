// smoke パート959（相手に選ばせる破壊で、相手の候補が1体でも、破壊したのは効果を使った側のまま。issue #559）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance, EffectAction } from "../../server/src/type"

const DEADLY = "BS01-125" // デッドリィバランス（お互い、それぞれのスピリット1体を破壊する）
const OSHIN = "BS20-030" // 氷楯の守護者オーシン（コスト3以下の自分のスピリットは、相手の効果で破壊されたとき疲労状態で残れる）
const ROKU = "BS01-002" // ロクケラトプス（効果なし）

console.log("=== 前提: カードの機械確認 ===")
const magic = getCard(DEADLY).effects.find((e) => e.kind === "magic")
const DEADLY_ACTION = (magic?.kind === "magic" ? magic.action : undefined) as EffectAction
{
    assert(getCard(DEADLY).name === "デッドリィバランス" && DEADLY_ACTION?.type === "mutualDestroyChoice", "デッドリィバランスは、お互いに1体ずつ破壊する")
    const e = getCard(OSHIN).effects.find((x) => x.kind === "reviveOnDestroy")
    assert(getCard(OSHIN).name === "氷楯の守護者オーシン" && getCard(OSHIN).cost <= 3 && e?.kind === "reviveOnDestroy" && e.when?.byOpponentEffect === true && e.optional === true, "オーシンは、相手の効果で破壊されたコスト3以下の自分のスピリットを残せる")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).effects.length === 0, "ロクケラトプスは効果なし")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string): CardInstance {
    const inst = createInstance(cardId, 1, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const onField = (s: GameState, pid: PlayerId, inst: CardInstance) => s.players[pid].field.spirits.includes(inst)
// 選択待ちが「残るか」の確認になるまで、対象の選択に最初の候補で答える
function answerTargets(s: GameState): void {
    for (let i = 0; i < 5 && s.pendingChoice?.kind === "target"; i++) act(s, s.pendingChoice.pid, { type: "resolveChoice", instanceId: s.pendingChoice.candidates[0]! })
}

console.log("=== 1. 相手がデッドリィバランスを使い、自分の候補がオーシン1体だけ：オーシンの「残る」の確認が出る ===")
{
    const s = game("one-candidate")
    const oshin = put(s, "p1", OSHIN)
    put(s, "p2", ROKU)
    put(s, "p2", ROKU)
    resolveAction(s, "p2", null, DEADLY_ACTION)
    answerTargets(s)
    const pc = s.pendingChoice
    assert(pc?.pid === "p1" && pc.kind === "option" && onField(s, "p1", oshin), "オーシンの持ち主に、疲労状態で残るかを聞く")
    act(s, "p1", { type: "resolveChoice", option: pc!.options![0]! })
    assert(onField(s, "p1", oshin) && oshin.isRested && oshin.waiting === undefined, "残ると答えたら、オーシンは疲労状態で場に残る")
}

console.log("=== 2. 相手が使い、お互いの候補が1体ずつ（選択待ちが1度も立たない）：オーシンの確認が出る ===")
{
    const s = game("no-choice")
    const oshin = put(s, "p1", OSHIN)
    const enemy = put(s, "p2", ROKU)
    resolveAction(s, "p2", null, DEADLY_ACTION)
    const pc = s.pendingChoice
    assert(pc?.pid === "p1" && pc.kind === "option" && onField(s, "p1", oshin), "オーシンの持ち主に、疲労状態で残るかを聞く")
    act(s, "p1", { type: "resolveChoice", option: pc!.options![0]! })
    assert(onField(s, "p1", oshin) && oshin.isRested && !onField(s, "p2", enemy), "オーシンは残り、相手のスピリットは破壊される")
}

console.log("=== 3. 自分がデッドリィバランスを使い、相手の候補が1体だけ：自分の効果での破壊なので、オーシンの確認は出ない ===")
{
    const s = game("own-effect")
    const oshin = put(s, "p1", OSHIN)
    put(s, "p1", ROKU)
    const enemy = put(s, "p2", ROKU)
    resolveAction(s, "p1", null, DEADLY_ACTION)
    assert(s.pendingChoice?.kind === "target" && s.pendingChoice.pid === "p1", "自分の破壊するスピリットを選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: oshin.instanceId })
    assert(s.pendingChoice === null, "「残る」の確認は出ない")
    assert(!onField(s, "p1", oshin) && s.players.p1.trashCards.includes(OSHIN) && !onField(s, "p2", enemy), "オーシンも相手のスピリットも破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part959）")
