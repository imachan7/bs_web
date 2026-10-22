// smoke パート647（BS18 部品：fieldEvent lifeCorePlaced）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const WATCH = "BS01-002" // ロクケラトプス（赤・コスト1）
const OTHER = "BS01-003" // テラノセイバー（赤・コスト2）
assert(getCard(WATCH).name === "ロクケラトプス" && getCard(OTHER).name === "テラノセイバー", "カード名の機械確認")

function game(seed: string) {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    const w = createInstance(WATCH, 1, 1)
    const o = createInstance(OTHER, 1, 2)
    s.players.p1.field.spirits.push(w)
    s.players.p2.field.spirits.push(o)
    s.players.p1.reserve = 5
    s.players.p2.reserve = 5
    return { s, w, o }
}

// 「このスピリットは回復する」を、疲労状態から確かめる
const withEffect = <T>(f: () => T): T => {
    const effects = getCard(WATCH).effects as unknown[]
    effects.push({ id: "tmp-lc", kind: "fieldEvent", event: "lifeCorePlaced", levels: [1, 2, 3], selfMode: "source", action: { type: "refreshSelf" } })
    try {
        return f()
    } finally {
        effects.pop()
    }
}

console.log("=== 自分のライフ・相手のライフ・出所を問わず発火 ===")
for (const [label, actor, from, to] of [
    ["自分のライフ（ボイドから）", "p1", "void", "p1"],
    ["相手のライフ（ボイドから）", "p2", "void", "p2"],
    ["自分のライフ（リザーブから）", "p1", "reserve", "p1"],
] as const) {
    const { s, w, o } = game(`lc-${label}`)
    w.isRested = true
    withEffect(() => resolveAction(s, actor, actor === "p1" ? w : o, { type: "placeCores", from, to: "life", count: 1 }))
    assert(s.players[to].life > 0 && (w.isRested as boolean) === false, `${label}：回復した`)
}

console.log("=== ライフが増えなければ発火しない ===")
{
    const { s, w, o } = game("lc-no")
    w.isRested = true
    withEffect(() => resolveAction(s, "p2", o, { type: "placeCores", from: "void", to: "reserve", count: 2 }))
    assert(w.isRested === true, "リザーブへの配置では発火しない")
}

console.log("すべてのチェックに合格しました 🎉（part647）")
