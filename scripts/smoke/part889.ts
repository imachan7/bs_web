// smoke パート889（BS09-X39 魔導女皇アンブロシウス Lv2：選択のあるマジックでも「マジックカードを使用したとき」が発火する。2026-11-11 の報告）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const AMBRO = "BS09-X39" // 魔導女皇アンブロシウス（黄）
const TOTEN = "BS11-075" // トーテンタンツ（紫・フラッシュ・手札破棄でコア2個）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(AMBRO).name === "魔導女皇アンブロシウス" && getCard(AMBRO).colors[0] === "yellow", "AMBROはアンブロシウス")
    assert(getCard(TOTEN).name === "トーテンタンツ" && getCard(TOTEN).type === "magic" && getCard(TOTEN).colors[0] === "purple", "TOTENはトーテンタンツ（紫）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).type === "spirit", "VANはロクケラトプス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.hand = []
        p.burst = null
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.field.spirits = []
        p.field.nexuses = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function settle(s: GameState): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        else if (pc.candidates?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

console.log("=== 1. 選択のある他色のマジック（トーテンタンツ）でも回復する ===")
{
    const s = game("ambro-toten")
    const ambro = put(s, "p1", AMBRO, 4)
    ambro.isRested = true
    put(s, "p2", VAN, 1)
    put(s, "p2", VAN, 1)
    s.players.p1.hand = [TOTEN, VAN]
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    assert(err === null, `トーテンタンツを使える（${String(err)}）`)
    assert(s.pendingChoice !== null && s.pendingChoice !== undefined, "途中で選択待ちになる")
    settle(s)
    assert(!s.pendingChoice, "選択を解決し終える")
    assert(s.players.p1.trashCards.includes(TOTEN), "トーテンタンツはトラッシュへ")
    assert(!ambro.isRested, "アンブロシウスが回復する")
}

console.log("すべてのチェックに合格しました 🎉（part889）")
