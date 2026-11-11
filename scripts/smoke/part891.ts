// smoke パート891（「相手のスピリットのコアN個を置く」（N≧2）は何体からでも合計N個。トーテンタンツの裁定にそろえる。2026-11-11 ユーザー確認。グリーディコア Q26083）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const GREEDY = "BSC05-022" // グリーディコア（紫・マジック・フラッシュ）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(GREEDY).name === "グリーディコア" && getCard(GREEDY).type === "magic", "GREEDYはグリーディコア")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).type === "spirit", "VANはロクケラトプス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        s.players[pid].reserve = 20
        s.players[pid].hand = []
        s.players[pid].burst = null
        s.players[pid].field.spirits = []
        s.players[pid].field.nexuses = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. 2体から1個ずつ置ける（Q26083） ===")
{
    const s = game("greedy-spread")
    const a = put(s, "p2", VAN, 3)
    const b = put(s, "p2", VAN, 3)
    s.players.p1.hand = [GREEDY]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "グリーディコアを使える")
    for (let i = 0; i < 5 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        const pick = (pc.candidates ?? []).includes(a.instanceId) && a.cores === 3 ? a.instanceId : b.instanceId
        act(s, pc.pid, { type: "resolveChoice", instanceId: pick })
    }
    assert(a.cores === 2 && b.cores === 2, `1個ずつ取り除かれる（${a.cores}/${b.cores}）`)
    assert(s.players.p2.reserve === 22, "合計2個が相手のリザーブへ")
}

console.log("すべてのチェックに合格しました 🎉（part891）")
