// smoke パート1067（アルティメットの土台 段2：field.ultimates と battlers。docs/design/ULTIMATE.md §2・§3）
import { assert, createGame, createInstance } from "./helpers"
import { battlers } from "../../shared/rules"
import { viewFor } from "../../server/src/logic/GameState"

const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== field.ultimates ===")
{
    const s = createGame("ult-stage2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    for (const pid of ["p1", "p2"] as const) {
        assert(Array.isArray(s.players[pid].field.ultimates) && s.players[pid].field.ultimates.length === 0, `${pid} の ultimates は空`)
    }

    const p = s.players.p1
    const sp = createInstance(VANILLA, 1, 1)
    p.field.spirits.push(sp)
    assert(battlers(p).length === 1 && battlers(p)[0] === sp, "スピリットだけならスピリットの並びと同じ")
    const ult = createInstance(VANILLA, 1, 3)
    p.field.ultimates.push(ult)
    const b = battlers(p)
    assert(b.length === 2 && b[0] === sp && b[1] === ult, "ultimates は最後に加わる")

    const v = viewFor(s, "p2")
    assert(v.players.p1.field.ultimates.length === 1 && v.players.p1.field.ultimates[0]?.instanceId === ult.instanceId, "相手の盤面にも ultimates が載る")
    assert(v.players.p2.field.ultimates.length === 0, "自分の ultimates も載る（空）")
}

console.log("すべてのチェックに合格しました 🎉（part1067）")
