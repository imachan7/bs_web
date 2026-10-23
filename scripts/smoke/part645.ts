// smoke パート645（BS18 部品：globalConstraint noReductionGrantToHand・playerRule activeWhile.handAtLeast）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart, effectiveCost } from "./helpers"
import type { GameState } from "./helpers"
import { timedPlayerRules } from "../../shared/rules"

const BIG = "BS01-021" // 焔竜魔人マ・グー（赤・コスト6・軽減赤2・古竜）
const NEXUS = "BS14-074" // 千識の渓谷（覇皇/古竜のスピリットに赤の軽減を付与するネクサス）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(BIG).name === "焔竜魔人マ・グー" && getCard(BIG).family.includes("古竜"), "BIGは古竜")
assert(getCard(NEXUS).name === "千識の渓谷" && getCard(NEXUS).type === "nexus", "NEXUSは千識の渓谷")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.hand = [BIG]
    for (let i = 0; i < 5; i++) s.players.p1.field.spirits.push(createInstance(VANILLA, 1, 1))
    s.players.p1.field.nexuses.push(createInstance(NEXUS, 1, 1))
    return s
}

const withConstraint = <T>(sourceTypes: ("spirit" | "nexus")[], f: () => T): T => {
    const effects = getCard(NEXUS).effects as unknown[]
    effects.push({ id: "tmp-nrg", kind: "globalConstraint", levels: [1, 2, 3], constraint: { type: "noReductionGrantToHand", sourceTypes } })
    try {
        return f()
    } finally {
        effects.pop()
    }
}

console.log("=== 1. noReductionGrantToHand ===")
{
    const s = game("ng1")
    const granted = effectiveCost(s, "p1", getCard(BIG))
    const printedOnly = withConstraint(["nexus"], () => effectiveCost(s, "p1", getCard(BIG)))
    assert(printedOnly > granted, `ネクサスの付与を止めると高くなる（${granted} → ${printedOnly}）`)
    assert(withConstraint(["spirit"], () => effectiveCost(s, "p1", getCard(BIG))) === granted, "発生源の種別が違う制約（spirit）は付与を止めない")
    const none = effectiveCost(s, "p1", getCard(BIG))
    assert(none === granted, "制約を戻せば元の軽減")
    assert(printedOnly < getCard(BIG).cost, "印刷の軽減は止まらない")
}

console.log("=== 2. activeWhile.handAtLeast：制限を受ける側の手札枚数で毎回判定 ===")
{
    const s = game("aw1")
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "noBurstEffectForPid" }, activeWhile: { handAtLeast: 3 } }], duration: "turn" })
    const rules = () => timedPlayerRules(s, "p2").length
    s.players.p2.hand = ["BS01-002", "BS01-002"]
    assert(rules() === 0, "手札2枚（<3）では効かない")
    s.players.p2.hand = ["BS01-002", "BS01-002", "BS01-002"]
    assert(rules() === 1, "手札3枚で効く")
    s.players.p2.hand.pop()
    assert(rules() === 0, "枚数が下がればまた効かない")
    s.players.p2.hand.push("BS01-002", "BS01-002")
    assert(rules() === 1, "増えればまた効く")
    assert(timedPlayerRules(s, "p1").length === 0, "自分には掛かっていない")
}

console.log("すべてのチェックに合格しました 🎉（part645）")
