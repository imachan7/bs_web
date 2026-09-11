// smoke パート310（起動能力のステップ・手番制限 = activated.phaseTurn）
// 印刷テキストが『自分のアタックステップ』『お互いのアタックステップ』とステップを明示している
// 起動能力は、timing:"flash" だけでは絞れず**相手ターンやメインステップでも撃ててしまう**ため、
// phaseTurn で縛る。SD06-005（自分のアタックステップ限定）で両方向を固定する。
import { assert, createGame, createInstance, getCard, handleAction, minLevelCores, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: SD06-005 の起動能力は『自分のアタックステップ』限定 ===")
{
    const card = getCard("SD06-005")
    assert(card.name === "ツインブレード・ドラゴン", "SD06-005はツインブレード・ドラゴン")
    const act = card.effects.find((e) => e.kind === "activated")
    assert(act !== undefined && act.kind === "activated", "SD06-005は起動能力を持つ")
    if (act && act.kind === "activated") {
        assert(
            act.phaseTurn?.phase === "attack" && act.phaseTurn.turn === "own",
            "phaseTurn は attack / own",
        )
    }
}

// 自分のアタックステップに置いた盤面を作る。バースト1つを破棄するのが発動コスト
function boardWithBurst(seed: string): { s: GameState; instanceId: string; effectId: string } {
    const s = game(seed)
    const inst = createInstance("SD06-005", s.turn, minLevelCores(getCard("SD06-005")) + 2)
    s.players.p1.field.spirits.push(inst)
    placeBurst(s, "p1", "SD06-007")
    const effectId = getCard("SD06-005").effects.find((e) => e.kind === "activated")!.id
    return { s, instanceId: inst.instanceId, effectId }
}

console.log("=== 自分のメインステップでは発動できない（フラッシュ全般に広がらない） ===")
{
    const { s, instanceId, effectId } = boardWithBurst("pt-main")
    s.phase = "main"
    const err = handleAction(s, "p1", { type: "activateAbility", instanceId, effectId })
    assert(err !== null, "メインステップでは拒否される")
}

console.log("=== 相手のアタックステップでは発動できない（『自分の』の縛り） ===")
{
    const { s, instanceId, effectId } = boardWithBurst("pt-opp")
    const attacker = createInstance("SD06-001", s.turn, minLevelCores(getCard("SD06-001")))
    s.players.p2.field.spirits.push(attacker)
    s.phase = "attack"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p1"
    s.isFlashTiming = true
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    const err = handleAction(s, "p1", { type: "activateAbility", instanceId, effectId })
    assert(err !== null && err.includes("ターン"), `相手のアタックステップでは拒否される（${err ?? "許可されてしまった"}）`)
    assert(s.players.p1.burst !== null, "拒否されたのでバーストは破棄されない")
}

console.log("=== 自分のアタックステップなら発動でき、バーストが破棄される ===")
{
    const { s, instanceId, effectId } = boardWithBurst("pt-own")
    const attacker = createInstance("SD06-001", s.turn, minLevelCores(getCard("SD06-001")))
    s.players.p1.field.spirits.push(attacker)
    s.phase = "attack"
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.isFlashTiming = true
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    const err = handleAction(s, "p1", { type: "activateAbility", instanceId, effectId })
    assert(err === null, `自分のアタックステップなら発動できる（${err ?? ""}）`)
    assert(s.players.p1.burst === null, "発動コストとしてバーストが破棄される")
}

console.log("すべてのチェックに合格しました 🎉（part310）")
