// smoke パート980（対象の候補から待機中のカードを一律に外す。docs/design/PENDING_STATE.md §3 C2。
// 待機中の個体は、待機を誘発した出来事以外の効果の対象にならない。候補を作る関数が targetableSpirits を通ることの確認）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import { requestChoice } from "../../server/src/logic/targeting"
import type { GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
assert(getCard(VAN).name === "ロクケラトプス", "VAN はロクケラトプス")

function game(interactive: boolean): { s: GameState; put: (pid: PlayerId, waiting: boolean) => ReturnType<typeof createInstance> } {
    const s = createGame("p980", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = interactive
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].field.spirits = []
        s.players[pid].reserve = 10
    }
    const put = (pid: PlayerId, waiting: boolean) => {
        const i = createInstance(VAN, s.turn, 1)
        if (waiting) i.waiting = { kind: "destroy", event: "ev-old" }
        s.players[pid].field.spirits.push(i)
        refreshLevelAsOverrides(s)
        return i
    }
    return { s, put }
}

console.log("=== 1. 自分の BP+（選択式）：待機中の自分のスピリットは候補に出ない ===")
{
    const { s, put } = game(true)
    const w = put("p1", true)
    const a = put("p1", false)
    const b = put("p1", false)
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "bp", amount: 2000 }], duration: "turn", side: "own", count: 1 })
    const pc = s.pendingChoice
    assert(pc !== null && pc.candidates.includes(a.instanceId) && pc.candidates.includes(b.instanceId), "待機していない2体は候補")
    assert(pc !== null && !pc.candidates.includes(w.instanceId), "待機中の1体は候補に出ない")
}

console.log("=== 2. 相手の疲労（自動選択）：待機中の相手は選ばれない ===")
{
    const { s, put } = game(false)
    const w = put("p2", true)
    const a = put("p2", false)
    w.cores = 5 // 待機側のほうが BP が高い＝待機を無視すれば先に選ばれる
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "exhaust", count: 1 })
    assert(w.isRested !== true, "待機中の相手は疲労しない")
    assert(a.isRested === true, "待機していない相手が疲労する")
}

console.log("=== 3. 相手の破壊（自動選択）：待機中の相手は選ばれない ===")
{
    const { s, put } = game(false)
    const w = put("p2", true)
    const a = put("p2", false)
    w.cores = 5
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "destroy", count: 1 })
    assert(w.waiting?.event === "ev-old", "待機中の相手はあらためて破壊されない")
    assert(a.waiting !== undefined || !s.players.p2.field.spirits.includes(a), "待機していない相手が破壊される")
}

console.log("=== 4. 安全網：requestChoice は待機中の id を落とす ===")
{
    const { s, put } = game(true)
    const w = put("p2", true)
    const a = put("p2", false)
    const b = put("p2", false)
    requestChoice(s, "p1", "テスト", [w.instanceId, a.instanceId, b.instanceId], false, { type: "exhaust", count: 1 }, null)
    const pc = s.pendingChoice
    assert(pc !== null && !pc.candidates.includes(w.instanceId) && pc.candidates.length === 2, "待機中の id は選択肢から落ちる")
    const g = game(true)
    const w2 = g.put("p2", true)
    requestChoice(g.s, "p1", "テスト", [w2.instanceId], false, { type: "exhaust", count: 1 }, null)
    assert(g.s.pendingChoice === null && w2.isRested !== true, "候補が待機中だけなら「対象なし」になり何も起きない")
}

console.log("すべてのチェックに合格しました 🎉（part980）")
