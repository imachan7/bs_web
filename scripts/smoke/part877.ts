// smoke パート877（期間つき効果を発生源自身に置くとき、中身が2種類あっても両方置く。以前はシンボル追加の置き方が先に拾い、ブロックされないを捨てていた）
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"

const VANILLA = "BS01-002"

console.log("=== 1. 自身に「黄のシンボル追加」と「Lv1/Lv2 からブロックされない」を1つの期間つき効果で置くと、両方が記録される ===")
{
    const s = createGame("timed-multi", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    const self = createInstance(VANILLA, 2, 1)
    s.players.p1.field.spirits.push(self)
    refreshLevelAsOverrides(s)
    const before = s.timedEffects.length
    resolveAction(s, "p1", self, {
        type: "timedEffect",
        target: "self",
        duration: "turn",
        content: [{ type: "symbolAdd", color: "yellow", count: 1 }, { type: "unblockable", opponentOnly: true, from: { level: [1, 2] } }],
    })
    const types = new Set(s.timedEffects.slice(before).flatMap((r) => r.content.map((c) => c.type)))
    assert(types.has("symbolAdd"), "シンボル追加が記録される")
    assert(types.has("unblockable"), "ブロックされないも記録される")
}

console.log("すべてのチェックに合格しました 🎉（part877）")
