// smoke パート390（マジックの使用条件 useCondition と解決時の条件 condition の区別。2026-09-26 ユーザー確認：
// 「この効果は〜ないと使えない」は使う前に見て使えなくする。「〜とき、〜する」は使えて、解決の時点で満たさなければ発揮しない）
import { act, assert, createGame, createInstance, getCard } from "./helpers"
import type { GameState } from "./helpers"

function setupMain(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as const) {
        s.players[pid].field.spirits = []
        s.players[pid].field.nexuses = []
        s.players[pid].reserve = 10
    }
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS02-088").name === "クロスファイア", "BS02-088 はクロスファイア")
    assert(getCard("BS03-149").name === "デルタクラッシュ", "BS03-149 はデルタクラッシュ")
    assert(getCard("BS01-104").type === "nexus", "BS01-104 はネクサス")
}

console.log("=== クロスファイア：どちらのフィールドにもネクサスが無いと使えない ===")
{
    const s = setupMain("p390-cross-ng")
    s.players.p1.hand = ["BS02-088"]
    s.players.p1.field.nexuses.push(createInstance("BS01-104", s.turn, 0)) // 自分だけ
    const reserve = s.players.p1.reserve
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null, "相手にネクサスが無いので使用できない")
    assert(s.players.p1.hand.includes("BS02-088") && s.players.p1.reserve === reserve, "手札もコアも動かない")

    const t = setupMain("p390-cross-ok")
    t.players.p1.hand = ["BS02-088"]
    t.players.p1.field.nexuses.push(createInstance("BS01-104", t.turn, 0))
    t.players.p2.field.nexuses.push(createInstance("BS01-104", t.turn, 0))
    assert(act(t, "p1", { type: "castMagic", handIndex: 0 }) === null, "両方にネクサスがあれば使用できる")
}

console.log("=== デルタクラッシュ（「〜とき」）：条件を満たさなくても使え、効果は発揮しない ===")
{
    const s = setupMain("p390-delta")
    s.players.p1.hand = ["BS03-149"]
    const enemy = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(!s.players.p1.hand.includes("BS03-149"), "マジックは使われて手札から離れる")
    assert(s.players.p2.field.spirits.includes(enemy), "闘神が3体いないので破壊は発揮しない")
}

console.log("すべてのチェックに合格しました 🎉（part390）")
