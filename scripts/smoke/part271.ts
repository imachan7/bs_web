// smoke パート271（BS11 で足した軸 その1）
//
// docs/design/BS11_PLAN.md §2.3 A のうち、この回で足したもの:
//   - destroy.drawPerDestroyed：**実際に破壊できた**1体につき1枚ドローする（BS11-006 獅龍皇子レオグルス）
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}
const leo = byName("獅龍皇子レオグルス")
const summonEffect = leo.effects.find((e) => e.kind === "triggered" && e.trigger === "onSummon")
assert(summonEffect !== undefined && "action" in summonEffect, "テスト前提: レオグルスは『召喚時』効果を持つ")
const action = (summonEffect as { action: Parameters<typeof resolveAction>[3] }).action
assert(
    (action as { drawPerDestroyed?: true }).drawPerDestroyed === true,
    "テスト前提: 『破壊したときドロー』が drawPerDestroyed で書かれている",
)
// BP5000以下の相手（破壊される側）と、BP5000より大きい相手（破壊されない側）をデータから引く
const lowBp = ALL_CARDS.find((c) => c.type === "spirit" && (c.levels[0]?.bp ?? 0) <= 5000 && c.effects.length === 0)
const highBp = ALL_CARDS.find((c) => c.type === "spirit" && (c.levels[0]?.bp ?? 0) > 5000 && c.effects.length === 0)
assert(lowBp !== undefined && highBp !== undefined, "テスト前提: BP5000以下と5000超のバニラがいる")

function game(): GameState {
    const s = createGame("bs11-axis-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== §A 破壊できたときだけ1枚ドローする ===")
{
    const s = game()
    const self = put(s, "p1", leo.cardId, 2)
    put(s, "p2", lowBp!.cardId, 1)
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", self, action)
    assert(s.players.p2.field.spirits.length === 0, "BP5000以下の相手が破壊される")
    assert(s.players.p1.hand.length === handBefore + 1, "破壊できたので1枚引く")
}

console.log("=== §B 破壊できなければ引かない ===")
{
    const s = game()
    const self = put(s, "p1", leo.cardId, 2)
    put(s, "p2", highBp!.cardId, 1) // BP5000より大きいので対象外
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", self, action)
    assert(s.players.p2.field.spirits.length === 1, "対象外なので破壊されない")
    assert(s.players.p1.hand.length === handBefore, "破壊できなかったので引かない")
}

console.log("=== §C 相手がいなければ引かない ===")
{
    const s = game()
    const self = put(s, "p1", leo.cardId, 2)
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", self, action)
    assert(s.players.p1.hand.length === handBefore, "対象がいなければ引かない")
}

console.log("=== §D バスターハンマー：色を指定して、その色のネクサスすべてを破壊する ===")
{
    const hammer = byName("バスターハンマー")
    const e = hammer.effects.find((x) => x.kind === "magic")
    assert(e !== undefined && "action" in e, "テスト前提: バスターハンマーはマジック効果を持つ")
    const hammerAction = (e as { action: Parameters<typeof resolveAction>[3] }).action
    const nexusOf = (color: string) => {
        const c = ALL_CARDS.find((x) => x.type === "nexus" && x.colors.length === 1 && x.colors[0] === color)
        assert(c !== undefined, `テスト前提: ${color}の単色ネクサスがいる`)
        return c!.cardId
    }

    // 対話：色を選ばせ、選んだ色だけが両陣営から破壊される
    const s = game()
    s.interactiveTargets = true
    const putNexus = (pid: PlayerId, cardId: string) => {
        const inst = createInstance(cardId, s.turn, 1)
        s.players[pid].field.nexuses.push(inst)
        return inst
    }
    putNexus("p1", nexusOf("red"))
    putNexus("p2", nexusOf("red"))
    putNexus("p2", nexusOf("blue"))
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, hammerAction)
    assert(s.pendingChoice?.kind === "option", "色の選択待ちが立つ")
    assert((s.pendingChoice?.options ?? []).length === 6, "6色から選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", option: "red" }) === null, "赤を指定する")
    assert(s.players.p1.field.nexuses.length === 0, "自分の赤ネクサスも破壊される（指定した色すべて）")
    assert(s.players.p2.field.nexuses.length === 1, "相手は赤だけ破壊され、青は残る")
    assert(s.players.p1.hand.length === handBefore + 2, "破壊できた2つぶん引く")
}

console.log("すべてのチェックに合格しました 🎉（part271）")
