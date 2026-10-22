// smoke パート646（BS18 部品：fieldEvent coresGainedFromVoid・eventSourceAsTarget・voidGainedCores）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const WATCH = "BS01-002" // ロクケラトプス（赤・コスト1）
const SRC = "BS01-003" // テラノセイバー（赤・コスト2）

assert(getCard(WATCH).name === "ロクケラトプス" && getCard(SRC).name === "テラノセイバー", "カード名の機械確認")

function game(seed: string) {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 5
    s.players.p2.reserve = 5
    const watcher = createInstance(WATCH, 1, 1)
    const src = createInstance(SRC, 1, 2)
    s.players.p1.field.spirits.push(watcher)
    s.players.p2.field.spirits.push(src)
    return { s, watcher, src }
}

const withEffect = <T>(entry: Record<string, unknown>, f: () => T): T => {
    const effects = getCard(WATCH).effects as unknown[]
    effects.push({ id: "tmp-cg", kind: "fieldEvent", levels: [1, 2, 3], ...entry })
    try {
        return f()
    } finally {
        effects.pop()
    }
}

const gain = (s: GameState, pid: "p1" | "p2", src: ReturnType<typeof createInstance>, n: number, to: "reserve" | "life" = "reserve") =>
    resolveAction(s, pid, src, { type: "placeCores", from: "void", to, count: n })

console.log("=== 1. BS18-001型：相手のスピリットの効果で増えたら、疲労して発生源を破壊 ===")
const e1 = {
    event: "coresGainedFromVoid",
    opponentEffectSourceTypes: ["spirit"],
    eventSourceAsTarget: true,
    action: { type: "pay", cost: { type: "exhaust", target: "self", count: 1 }, then: { type: "destroy", count: 1 } },
}
{
    const { s, watcher, src } = game("cg1")
    withEffect(e1, () => gain(s, "p2", src, 3))
    assert(s.players.p2.field.spirits.every((i) => i.instanceId !== src.instanceId), "発生源スピリットが破壊された")
    assert(watcher.isRested === true, "コストで疲労した")
}
{
    const { s, watcher, src } = game("cg2")
    withEffect(e1, () => gain(s, "p1", watcher, 3))
    assert(s.players.p1.field.spirits.includes(watcher) && watcher.isRested !== true, "自分の効果では発火しない")
    void src
}
{
    const { s, watcher, src } = game("cg3")
    withEffect(e1, () => resolveAction(s, "p2", src, { type: "placeCores", from: "reserve", to: "spirit", count: 1, target: "self" } as never))
    assert(watcher.isRested !== true && s.players.p2.field.spirits.includes(src), "ボイドからでない移動では発火しない")
}
{
    const { s, watcher, src } = game("cg4")
    withEffect({ ...e1, action: { type: "pay", cost: { type: "exhaust", target: "self", count: 1 }, then: { type: "destroy", count: 1 } } }, () => {
        s.players.p2.field.spirits.length = 0 // 発生源が場にいない
        gain(s, "p2", src, 1)
    })
    assert(watcher.isRested !== true, "発生源が場にいなければ払わず不発")
}

console.log("=== 2. BS18-013型：増えたコアとその発生源のコアをすべてボイドへ ===")
const e2 = {
    event: "coresGainedFromVoid",
    eventSourceAsTarget: true,
    action: { type: "sequence", passEventTarget: true, actions: [{ type: "voidGainedCores" }, { type: "removeCores", target: "event", side: "opponent", to: "void", count: "all" }] },
}
{
    const { s, src } = game("cg5")
    withEffect(e2, () => gain(s, "p2", src, 3))
    assert(s.players.p2.reserve === 5, `増えた3個がリザーブから戻る（${s.players.p2.reserve}）`)
    assert(src.cores === 0 || !s.players.p2.field.spirits.includes(src), "発生源のコアもすべてボイドへ")
}
{
    const { s, src } = game("cg6")
    withEffect({ ...e2, subjectSide: "own" }, () => gain(s, "p2", src, 3))
    assert(s.players.p2.reserve === 8, "subjectSide:own は相手に増えたときは発火しない")
}
{
    const { s, src } = game("cg7")
    const b = s.players.p1.hand.length
    const life = s.players.p2.life
    withEffect({ event: "coresGainedFromVoid", subjectSide: "opponent", action: { type: "draw", count: 1 } }, () => gain(s, "p2", src, 2, "life"))
    assert(s.players.p2.life === life + 2 && s.players.p1.hand.length - b === 1, "ライフに置かれても数える")
}
{
    const { s, src } = game("cg7b")
    const b = s.players.p1.hand.length
    resolveAction(s, "p2", src, { type: "placeCores", from: "reserve", to: "life", count: 1 })
    withEffect({ event: "coresGainedFromVoid", action: { type: "draw", count: 1 } }, () => resolveAction(s, "p2", src, { type: "placeCores", from: "reserve", to: "life", count: 1 }))
    assert(s.players.p1.hand.length === b, "リザーブからライフへ移しても（ボイドからでないので）数えない")
}

console.log("=== 3. 1回の解決につき1回・個数は eventCount ===")
{
    const { s, src } = game("cg8")
    let n = 0
    const before = s.players.p1.hand.length
    withEffect({ event: "coresGainedFromVoid", repeatPerCount: true, action: { type: "draw", count: 1 } }, () => gain(s, "p2", src, 3))
    n = s.players.p1.hand.length - before
    assert(n === 3, `repeatPerCount で個数ぶん（${n}）`)
    const { s: s2, src: src2 } = game("cg9")
    const b2 = s2.players.p1.hand.length
    withEffect({ event: "coresGainedFromVoid", action: { type: "draw", count: 1 } }, () => gain(s2, "p2", src2, 3))
    assert(s2.players.p1.hand.length - b2 === 1, "repeatPerCount なしなら3個でも1回")
}

console.log("すべてのチェックに合格しました 🎉（part646）")
