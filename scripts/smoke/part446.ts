// smoke パート446（BS17 部品バッチ5：exhaust.untilRefreshedCount／returnToHand.nexus／battleBpAsLevel.useLevel:"max"・maxCost）
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import { battleBp } from "../../server/src/logic/triggers"
import type { CardData } from "../../server/src/type"

const BASE_SPIRIT = "BS01-001" // ゴラドン（赤・コスト0）
const BASE_NEXUS = "BS01-098" // 燃えさかる戦場（赤ネクサス・コスト3）
const baseSpirit = getCard(BASE_SPIRIT)
const baseNexus = getCard(BASE_NEXUS)

function makeSpirit(cardId: string, over: Partial<CardData>): string {
    CARD_DB.set(cardId, { ...baseSpirit, cardId, name: `テスト${cardId}`, effects: [], ...over } as never)
    return cardId
}

function game(interactive = false): GameState {
    const s = createGame(`part446-${interactive}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

console.log("=== 1. exhaust.untilRefreshedCount：非対話・回復5体を3体になるまで疲労（2体疲労） ===")
{
    const s = game()
    const self = createInstance(BASE_SPIRIT, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    for (let i = 0; i < 5; i++) s.players.p2.field.spirits.push(createInstance(BASE_SPIRIT, s.turn, 1))
    resolveAction(s, "p1", self, { type: "exhaust", count: 0, untilRefreshedCount: 3 })
    const ready = s.players.p2.field.spirits.filter((sp) => !sp.isRested).length
    assert(ready === 3, `回復状態が3体になるまで疲労させる（実際: ${ready}体）`)
}

console.log("=== 2. exhaust.untilRefreshedCount：すでに条件を満たす（回復2体・指定3）なら不発 ===")
{
    const s = game()
    const self = createInstance(BASE_SPIRIT, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    for (let i = 0; i < 2; i++) s.players.p2.field.spirits.push(createInstance(BASE_SPIRIT, s.turn, 1))
    resolveAction(s, "p1", self, { type: "exhaust", count: 0, untilRefreshedCount: 3 })
    const ready = s.players.p2.field.spirits.filter((sp) => !sp.isRested).length
    assert(ready === 2, "すでに条件を満たしているので誰も疲労しない")
}

console.log("=== 3. exhaust.untilRefreshedCount：chooserIsTarget:true では相手が選ぶ（対話） ===")
{
    const s = game(true)
    const self = createInstance(BASE_SPIRIT, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    for (let i = 0; i < 5; i++) s.players.p2.field.spirits.push(createInstance(BASE_SPIRIT, s.turn, 1))
    resolveAction(s, "p1", self, { type: "exhaust", count: 0, untilRefreshedCount: 3, chooserIsTarget: true })
    assert(s.pendingChoice?.pid === "p2", "疲労させられる側（p2）が選ぶ")
    assert(s.pendingChoice?.actorPid === "p1", "解決は発生源の持ち主（p1）の効果として行う")
    const c1 = s.pendingChoice!.candidates[0]!
    assert(act(s, "p2", { type: "resolveChoice", instanceId: c1 }) === null, "1体目をp2が選ぶ")
    assert(s.pendingChoice?.pid === "p2", "2体目もp2が選ぶ")
    const c2 = s.pendingChoice!.candidates[0]!
    assert(act(s, "p2", { type: "resolveChoice", instanceId: c2 }) === null, "2体目をp2が選ぶ")
    assert(s.pendingChoice === null, "2体選んで終わる")
    const ready = s.players.p2.field.spirits.filter((sp) => !sp.isRested).length
    assert(ready === 3, "対話でも回復状態が3体になるまでで止まる")
}

console.log("=== 4. returnToHand.nexus:\"also\"：スピリットが候補にいなければネクサスを手札に戻す ===")
{
    const s = game()
    const self = createInstance(BASE_SPIRIT, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    const nexus = createInstance(BASE_NEXUS, s.turn, 0)
    s.players.p2.field.nexuses.push(nexus)
    resolveAction(s, "p1", self, { type: "returnToHand", count: 1, nexus: "also" })
    assert(s.players.p2.field.nexuses.length === 0, "ネクサスは場から消えた")
    assert(s.players.p2.hand.includes(BASE_NEXUS), "ネクサスは手札に戻った")
}

console.log("=== 5. returnToHand.nexus:\"also\"：非対話は実効BP最大のスピリット優先でネクサスは残る ===")
{
    const s = game()
    const self = createInstance(BASE_SPIRIT, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    const spirit = createInstance(BASE_SPIRIT, s.turn, 1)
    s.players.p2.field.spirits.push(spirit)
    s.players.p2.field.nexuses.push(createInstance(BASE_NEXUS, s.turn, 0))
    resolveAction(s, "p1", self, { type: "returnToHand", count: 1, nexus: "also" })
    assert(s.players.p2.field.spirits.length === 0, "スピリットが優先して手札に戻る")
    assert(s.players.p2.field.nexuses.length === 1, "ネクサスは残る")
}

console.log("=== 6. returnToHand.nexus:\"also\"：対話でネクサスを名指しで選べる ===")
{
    const s = game(true)
    const self = createInstance(BASE_SPIRIT, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    s.players.p2.field.spirits.push(createInstance(BASE_SPIRIT, s.turn, 1))
    const nexus = createInstance(BASE_NEXUS, s.turn, 0)
    s.players.p2.field.nexuses.push(nexus)
    resolveAction(s, "p1", self, { type: "returnToHand", count: 1, nexus: "also" })
    assert(s.pendingChoice?.candidates.includes(nexus.instanceId) === true, "候補にネクサスも含まれる")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: nexus.instanceId }) === null, "ネクサスを選ぶ")
    assert(s.players.p2.field.nexuses.length === 0, "選んだネクサスが手札に戻った")
    assert(s.players.p2.field.spirits.length === 1, "選ばなかったスピリットは場に残る")
}

console.log("=== 7. battleBpAsLevel：useLevel:\"max\"はそのスピリットが持つ最高LvのBPを使う ===")
{
    const HOST = makeSpirit("T446-HOST-MAX", {
        effects: [{ id: "T446-HOST-MAX-e1", kind: "battleBpAsLevel", levels: null, useLevel: "max", maxCost: 3 }],
    })
    const TARGET = makeSpirit("T446-TARGET", {
        cost: 3,
        levels: [
            { level: 1, cores: 1, bp: 1000 },
            { level: 2, cores: 3, bp: 5000 },
        ],
    })
    const s = game()
    s.phase = "attack"
    s.turnPlayer = "p1"
    s.players.p1.field.spirits.push(createInstance(HOST, s.turn, 1))
    const target = createInstance(TARGET, s.turn, 1) // Lv1（コア1）
    s.players.p1.field.spirits.push(target)
    assert(battleBp(s, "p1", target) === 5000, "Lv1のままLv2（最高Lv）のBPを使う")
}

console.log("=== 8. battleBpAsLevel：maxCostを超えるスピリットには効かない ===")
{
    const HOST = makeSpirit("T446-HOST-MAX2", {
        effects: [{ id: "T446-HOST-MAX2-e1", kind: "battleBpAsLevel", levels: null, useLevel: "max", maxCost: 3 }],
    })
    const EXPENSIVE = makeSpirit("T446-EXPENSIVE", {
        cost: 4,
        levels: [
            { level: 1, cores: 1, bp: 1000 },
            { level: 2, cores: 3, bp: 5000 },
        ],
    })
    const s = game()
    s.phase = "attack"
    s.turnPlayer = "p1"
    s.players.p1.field.spirits.push(createInstance(HOST, s.turn, 1))
    const target = createInstance(EXPENSIVE, s.turn, 1)
    s.players.p1.field.spirits.push(target)
    assert(battleBp(s, "p1", target) === 1000, "コスト3を超えるためLv1のBPのまま")
}

console.log("=== 9. battleBpAsLevel：fromLevel指定時の既存挙動は変わらない（指定Lvのときだけ効く） ===")
{
    const HOST = makeSpirit("T446-HOST-FROM", {
        effects: [{ id: "T446-HOST-FROM-e1", kind: "battleBpAsLevel", levels: null, fromLevel: 1, useLevel: 2 }],
    })
    const TARGET = makeSpirit("T446-TARGET-FROM", {
        cost: 3,
        levels: [
            { level: 1, cores: 1, bp: 1000 },
            { level: 2, cores: 3, bp: 5000 },
        ],
    })
    const s = game()
    s.phase = "attack"
    s.turnPlayer = "p1"
    s.players.p1.field.spirits.push(createInstance(HOST, s.turn, 1))
    const atLv1 = createInstance(TARGET, s.turn, 1) // Lv1
    const atLv2 = createInstance(TARGET, s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(atLv1, atLv2)
    assert(battleBp(s, "p1", atLv1) === 5000, "fromLevel:1と一致するLv1はLv2のBPを使う")
    assert(battleBp(s, "p1", atLv2) === 5000, "Lv2はもともとLv2のBPなので変化なし")
}

console.log("すべてのチェックに合格しました 🎉（part446）")
