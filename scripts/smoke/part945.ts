// smoke パート945（コストを支払わずに使うマジックにも、螺旋の塔の余分が掛かる。Q20060・#543。COST_MODEL §11 の召喚と同じ払い方）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const TOWER = "BS02-086" // 螺旋の塔（Lv1『自分のアタックステップ』相手はマジックの使用に1コスト余分／Lv2 コストはすべてリザーブから）
const PERYU = "BS11-058" // 神弓鳥ペリュトーン（オープンしたマジックのフラッシュ効果をコストを支払わずに即時に使用できる）
const GEMINI = "BS11-X05" // 魔導双神ジェミナイズ（手札/手元のマジック1枚をコストを支払わずに使用できる）
const DRAW = "SD01-035" // サドンデスドロー（フラッシュ：1枚ドロー）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TOWER).name === "螺旋の塔" && getCard(TOWER).levels[1]?.cores === 3, "TOWERは螺旋の塔（Lv2はコア3）")
    assert(getCard(PERYU).name === "神弓鳥ペリュトーン", "PERYUはペリュトーン")
    assert(getCard(GEMINI).name === "魔導双神ジェミナイズ", "GEMINIはジェミナイズ")
    assert(getCard(DRAW).name === "サドンデスドロー" && getCard(DRAW).type === "magic", "DRAWはサドンデスドロー")
}

// 螺旋の塔の持ち主（p2）のアタックステップに、p1 がコストを支払わずにマジックを使う
function game(seed: string, towerCores: number | null, reserve: number): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = false
    s.turn = 4
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.players.p1.deck = [DRAW, ...Array.from({ length: 39 }, () => VANILLA)]
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = []
    s.players.p1.reserve = reserve
    if (towerCores !== null) s.players.p2.field.nexuses.push(createInstance(TOWER, s.turn, towerCores))
    refreshLevelAsOverrides(s)
    return s
}
const peryuEntry = getCard(PERYU).effects[0]
const peryuAction = peryuEntry?.kind === "triggered" ? peryuEntry.action : null

console.log("=== ペリュトーン：螺旋の塔があればリザーブから1コスト余分に払って使う ===")
{
    const s = game("peryu-pay", 0, 3)
    const host = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    resolveAction(s, "p1", host, peryuAction!)
    assert(s.players.p1.reserve === 2, `余分の1コストを払った（リザーブ 3 → ${s.players.p1.reserve}）`)
    assert(s.players.p1.trashCards.includes(DRAW) && s.players.p1.hand.length === 1 && !s.players.p1.hand.includes(DRAW), `使用してトラッシュへ、効果で1枚ドロー（手札 ${s.players.p1.hand.join(",")}）`)
}
{
    const s = game("peryu-free", null, 3)
    const host = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    resolveAction(s, "p1", host, peryuAction!)
    assert(s.players.p1.reserve === 3 && s.players.p1.trashCards.includes(DRAW), "螺旋の塔が無ければ何も払わずに使う")
}
{
    const s = game("peryu-cannot", 0, 0)
    const host = createInstance(VANILLA, s.turn, 0)
    s.players.p1.field.spirits.push(host)
    resolveAction(s, "p1", host, peryuAction!)
    assert(s.players.p1.hand.includes(DRAW) && !s.players.p1.trashCards.includes(DRAW), `払えなければ使用せず手札に加える（手札 ${s.players.p1.hand.join(",")}）`)
}
{
    // Lv2「コストはすべてリザーブから」：フィールドのコアでは余分を払えない
    const s = game("peryu-reserve-only", 3, 0)
    const host = createInstance(VANILLA, s.turn, 3)
    s.players.p1.field.spirits.push(host)
    resolveAction(s, "p1", host, peryuAction!)
    assert(host.cores === 3 && s.players.p1.hand.includes(DRAW), `Lv2ではフィールドのコアから払えず、使用しない（コア ${host.cores}）`)
}
{
    const s = game("peryu-field", 0, 0)
    const host = createInstance(VANILLA, s.turn, 3)
    s.players.p1.field.spirits.push(host)
    resolveAction(s, "p1", host, peryuAction!)
    assert(host.cores === 2 && s.players.p1.trashCards.includes(DRAW), `Lv1ならフィールドのコアから払える（コア 3 → ${host.cores}）`)
}

console.log("=== 対話中は、余分の支払い元を選ぶ待ちが立つ ===")
{
    const s = game("peryu-ask2", 0, 1)
    s.interactiveTargets = true
    const host = createInstance(VANILLA, s.turn, 3)
    s.players.p1.field.spirits.push(host)
    resolveAction(s, "p1", host, peryuAction!)
    // 任意の確認（オープンできる・使用できる）は承諾し、支払い待ちまで進める
    for (let i = 0; i < 5 && s.pendingChoice && s.pendingChoice.effectCostPay === undefined; i++) {
        const pc = s.pendingChoice
        if (pc.cardIndices?.length) act(s, "p1", { type: "resolveChoice", cardIndex: pc.cardIndices[0]! })
        else act(s, "p1", { type: "resolveChoice", option: pc.options?.find((o) => o.includes("使用") || o === "はい" || o === "発動する") ?? pc.options?.[0] ?? "" })
    }
    assert(s.pendingChoice?.effectCostPay?.need === 1, `余分1コストの支払い待ち（${s.pendingChoice?.prompt ?? "なし"}）`)
    assert(!s.players.p1.hand.includes(DRAW) && !s.players.p1.trashCards.includes(DRAW), "支払いを待つ間、カードは手札にもトラッシュにも無い（使用中）")
    act(s, "p1", { type: "resolveChoice", option: "支払う", paySources: [{ instanceId: host.instanceId, count: 1 }] })
    assert(host.cores === 2 && s.players.p1.reserve === 1, `選んだフィールドのコアから払った（コア ${host.cores}・リザーブ ${s.players.p1.reserve}）`)
    assert(s.players.p1.trashCards.includes(DRAW) && s.players.p1.hand.length === 1, `払ったあと使用してトラッシュへ、1枚ドロー（手札 ${s.players.p1.hand.join(",")}）`)
}

console.log("=== ジェミナイズ（手札/手元からコストを支払わずに使用）にも掛かる ===")
{
    const s = game("gemini-pay", 0, 2)
    const self = createInstance(GEMINI, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    s.players.p1.hand = [DRAW]
    resolveAction(s, "p1", self, { type: "magicFreeUseFromHandOrTegamoto" })
    assert(s.players.p1.reserve === 1 && s.players.p1.trashCards.includes(DRAW), `余分1コストを払って使った（リザーブ 2 → ${s.players.p1.reserve}）`)
}
{
    const s = game("gemini-cannot", 0, 0)
    const self = createInstance(GEMINI, s.turn, 0)
    s.players.p1.field.spirits.push(self)
    s.players.p1.hand = [DRAW]
    resolveAction(s, "p1", self, { type: "magicFreeUseFromHandOrTegamoto" })
    assert(s.players.p1.hand.includes(DRAW) && !s.players.p1.trashCards.includes(DRAW), "余分を払えないマジックは候補に出ず、手札に残る")
}

console.log("すべてのチェックに合格しました 🎉（part945）")
