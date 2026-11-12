// smoke パート900（timedEffect の「N体までを指定する」＝count:"any"＋anyMax。BS18-033 アウトロー・キッド）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const KID = "BS18-033" // アウトロー・キッド
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KID).name === "アウトロー・キッド", "KIDはアウトロー・キッド")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
    const e = getCard(KID).effects.find((x) => x.id === "BS18-033-e1") as { action: { count?: unknown; anyMax?: number } }
    assert(e.action.count === "any" && e.action.anyMax === 2, "BS18-033-e1 は「2体まで」")
}

function game(seed: string, interactive: boolean): { s: GameState; ids: string[] } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
        const inst = createInstance(VANILLA, s.turn, 1)
        inst.isRested = true
        s.players.p2.field.spirits.push(inst)
        ids.push(inst.instanceId)
    }
    refreshLevelAsOverrides(s)
    return { s, ids }
}
const action = (getCard(KID).effects.find((x) => x.id === "BS18-033-e1") as unknown as { action: Parameters<typeof resolveAction>[3] }).action
const marked = (s: GameState) => s.log.filter((l) => l.includes("ロクケラトプス")).length

console.log("=== 1. 対話：3体目は選べず、2体で確定する ===")
{
    const { s, ids } = game("p900-1", true)
    resolveAction(s, "p1", null, action)
    for (const id of ids) handleAction(s, "p1", { type: "resolveChoice", instanceId: id })
    assert(s.pendingChoice?.selectedIds?.length === 2, `選べるのは2体まで（${s.pendingChoice?.selectedIds?.length}）`)
    const before = marked(s)
    handleAction(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null, "確定で終わる")
    assert(marked(s) - before === 2, `2体に掛かる（${marked(s) - before}）`)
}

console.log("=== 2. 対話：1体だけで確定できる ===")
{
    const { s, ids } = game("p900-2", true)
    resolveAction(s, "p1", null, action)
    handleAction(s, "p1", { type: "resolveChoice", instanceId: ids[0]! })
    const before = marked(s)
    handleAction(s, "p1", { type: "resolveChoice" })
    assert(marked(s) - before === 1, `1体に掛かる（${marked(s) - before}）`)
}

console.log("=== 3. 非対話：上限の2体に掛かる ===")
{
    const { s } = game("p900-3", false)
    const before = marked(s)
    resolveAction(s, "p1", null, action)
    assert(marked(s) - before === 2, `2体に掛かる（${marked(s) - before}）`)
}

console.log("すべてのチェックに合格しました 🎉（part900）")
