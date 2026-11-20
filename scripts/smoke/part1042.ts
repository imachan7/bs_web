// smoke パート1042（AI がアタックステップの前に、ほかのスピリットの余りのコアを移してレベルを上げ、BP で勝てる個体を増やす。server/src/ai/attackPlan.ts の levelPick）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { decideAiAction } from "../../server/src/ai/index"
import { DEFAULT_POLICY as CANDIDATE_POLICY, SUMMON_POLICY } from "../../server/src/ai/policy"

const ROKU = "BS01-002" // ロクケラトプス（Lv2=2コア BP3000、Lv3=3コア BP4000）
const HERA = "BS01-058" // ヘラクレス・ジオ（Lv1=1コア BP4000、Lv2=3コア BP6000）
assert(getCard(ROKU).name === "ロクケラトプス" && getCard(HERA).name === "ヘラクレス・ジオ", "cardId の機械確認")

// p1 のメインステップ（召喚できる手札なし・リザーブ0）。p1：ロクケラトプス2コア（BP3000）・ヘラクレス・ジオ3コア（BP6000、余り2）。
// p2：ロクケラトプス2コア（BP3000、回復）だけ、手札0。ロクケラトプスは相打ちになるのでアタックできないが、ヘラクレスから1コア移して Lv3（BP4000）にすれば2体とも行ける
function scene(): GameState {
    const s = createGame("level", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 5
    s.turnPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.deck = Array.from({ length: 40 }, () => ROKU)
        p.hand = []
        p.burst = null
        p.reserve = 0
        p.trashCores = 0
    }
    s.players.p1.field.spirits = [createInstance(ROKU, 1, 2), createInstance(HERA, 1, 3)]
    s.players.p2.field.spirits = [createInstance(ROKU, 1, 2)]
    refreshLevelAsOverrides(s)
    return s
}

console.log("=== 1. 変更前は何もせずアタックステップへ ===")
assert(decideAiAction(scene(), "p1", new Set(), SUMMON_POLICY)?.action.type === "nextPhase", "変更前の方針はコアを動かさない")

console.log("=== 2. 余りのコアを移してからアタックステップへ ===")
{
    const s = scene()
    const [roku, hera] = s.players.p1.field.spirits
    const types: string[] = []
    for (let i = 0; i < 6 && s.phase === "main"; i++) {
        const m = decideAiAction(s, "p1", new Set(), CANDIDATE_POLICY)!
        types.push(`${m.action.type}${"direction" in m.action ? ":" + m.action.direction : ""}`)
        assert(handleAction(s, "p1", m.action) === null, `${m.reason} をサーバーが受け付ける`)
    }
    assert(types.join(",") === "moveCore:remove,moveCore:add,nextPhase", `外す→置く→アタックステップへ（実際=${types.join(",")}）`)
    assert(roku!.cores === 3 && hera!.cores === 2, `ロクケラトプス3コア・ヘラクレス2コア（実際=${roku!.cores}・${hera!.cores}）`)
    const atk = decideAiAction(s, "p1", new Set(), CANDIDATE_POLICY)
    assert(atk?.action.type === "attack", "アタックステップでアタックする")
}

console.log("すべてのチェックに合格しました 🎉（part1042）")
