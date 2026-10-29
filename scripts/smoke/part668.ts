// smoke パート667（破棄系16枚：誰が選ぶか・どのゾーンから・何枚・どちらの陣営か。効果文だけから書いた期待値）
import { assert, createGame, createInstance, destroyNexus, destroySpirit, endTurn, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"

const V = "BS01-002" // ロクケラトプス（バニラ）
const SPIRIT = "BS01-056" // マッチュラ（スピリット）の手札役。召喚はしない場面でのみ使う
const MAGIC_A = "BS01-138" // ハンドリバース
const MAGIC_B = "BS01-123" // リターンドロー

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        "BS10-111": "ハンドタイフーン", "BS04-X14": "魔界七将パンデミウム", "BS10-X02": "双魚賊神ピスケガレオン", "BS14-015": "トウダー",
        "BS01-138": "ハンドリバース", "BS12-053": "オオヅツナナフシ", "BS08-009": "関将龍皇ドラグロン", "BS12-072": "海賊王の秘宝島",
        "BS01-056": "マッチュラ", "BS13-064": "蛇教徒の宮殿", "BS03-095": "奇術師オリバー", "BS02-021": "髑髏騎士ズ・ガイン",
        "BS03-016": "透明人間エクリア", "BS01-099": "百識の谷", "BS03-019": "魔界軍師ヘルミア", "BS01-123": "リターンドロー",
        "BS01-002": "ロクケラトプス", "BS01-014": "ドラグノ祈祷師", "BS11-X05": "魔導双神ジェミナイズ", "BS11-003": "アクゥイラム",
    }
    for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n, `${id}は${n}`)
}

function game(seed: string, interactive = true): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    for (const pid of ["p1", "p2"] as const) {
        s.players[pid].reserve = 10
        s.players[pid].deck = Array.from({ length: 40 }, () => V)
        s.players[pid].hand = []
        s.players[pid].trashCards = []
    }
    return s
}
const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1")
function put(s: GameState, pid: PlayerId, cardId: string, cores: number, rested = false) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const names = (ids: string[]) => ids.map((c) => getCard(c).name).sort().join("、")
const eq = (a: string[], b: string[]) => names(a) === names(b)
function ok(s: GameState, pid: PlayerId, a: GameAction, msg: string) {
    const err = handleAction(s, pid, a)
    assert(err === null, `${msg}${err === null ? "" : `（拒否: ${err}）`}`)
}

// 選択待ちが無くなるまで答える。誰に何が立ったかを記録して返す（"p2:card:hand" など）
function drain(s: GameState): string[] {
    const seen: string[] = []
    for (let i = 0; i < 40 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        seen.push(`${pc.pid}:${pc.kind}${pc.cardZone ? ":" + pc.cardZone : ""}`)
        let a: GameAction
        if (pc.kind === "card") {
            const free = (pc.cardIndices ?? []).filter((x) => !(pc.selectedCardIndices ?? []).includes(x))
            a = free[0] !== undefined ? { type: "resolveChoice", cardIndex: free[0] } : { type: "resolveChoice" }
        } else if (pc.kind === "target") a = { type: "resolveChoice", instanceId: pc.candidates[0]! }
        else a = { type: "resolveChoice", option: pc.options?.[0]! }
        if (handleAction(s, pc.pid, a) !== null) break
    }
    return seen
}
const cnt = (xs: string[], x: string) => xs.filter((y) => y === x).length
console.log("=== 13. BS12-072 海賊王の秘宝島：Lv2 破壊時、相手が手札のマジック1枚を破棄。できなければ手札すべてを公開 ===")
{
    const s = game("p667-13")
    const nx = putNexus(s, "p1", "BS12-072", 1) // Lv2
    s.players.p2.hand = [SPIRIT, MAGIC_A, MAGIC_B]
    destroyNexus(s, "p1", nx.instanceId, { sourcePid: "p2", sourceType: "magic" })
    const pc = s.pendingChoice
    assert(pc?.pid === "p2" && pc.kind === "card" && pc.cardZone === "hand", "選ぶのは相手で、相手の手札から")
    assert(pc !== null && JSON.stringify([...(pc.cardIndices ?? [])].sort()) === "[1,2]", "候補はマジックの2枚だけ")
    ok(s, "p2", { type: "resolveChoice", cardIndex: 1 }, "相手がマジックを選ぶ")
    assert(eq(s.players.p2.trashCards, [MAGIC_A]) && s.players.p2.hand.length === 2, "選んだマジック1枚だけが破棄される")
    assert(s.revealedCards === undefined || s.revealedCards === null, "破棄できたので公開はしない")
}
{
    const s = game("p667-13b")
    const nx = putNexus(s, "p1", "BS12-072", 1)
    s.players.p2.hand = [SPIRIT, V]
    destroyNexus(s, "p1", nx.instanceId, { sourcePid: "p2", sourceType: "magic" })
    assert(s.players.p2.trashCards.length === 0 && s.players.p2.hand.length === 2, "マジックが無ければ何も破棄されない")
    // 公開はログに出すだけで状態は変えない（2026-09-07 ユーザー確認）
    assert(s.log.some((l) => String(l).includes("手札すべてを公開した")), "破棄できないので相手の手札すべてを公開する")
}
{
    const s = game("p667-13c")
    const nx = putNexus(s, "p1", "BS12-072", 0) // Lv1
    s.players.p2.hand = [MAGIC_A]
    destroyNexus(s, "p1", nx.instanceId, { sourcePid: "p2", sourceType: "magic" })
    assert(s.pendingChoice === null && s.players.p2.hand.length === 1, "Lv1では何も起きない")
}

console.log("すべてのチェックに合格しました 🎉（part668）")
