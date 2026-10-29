// smoke パート670（破壊の統一の回帰：選択者・続きの節・「すべて」の範囲。効果文だけから書いた期待値）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1。Lv1 BP1000／Lv3 BP4000）
const NX = ["BS01-098", "BS01-099", "BS01-100"] // ネクサス（赤）。「ただの的」として使う
const PURPLE_NX = "BS01-102" // 主無き古城（紫）
const GREEN_NX = "BS02-080" // エメラルドに輝く鍾乳洞（緑）
const COST2 = "BS01-005" // アイバーン（赤・コスト2）
const COST4 = "BS05-005" // ワイアーム（赤・コスト4）

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    for (const p of ["p1", "p2"] as const) {
        s.players[p].reserve = 10
        s.players[p].deck = Array.from({ length: 40 }, () => VANILLA)
        s.players[p].hand = []
    }
    return s
}
const spirit = (s: GameState, pid: PlayerId, card: string, cores = 1) => {
    const i = createInstance(card, s.turn - 1, cores)
    s.players[pid].field.spirits.push(i)
    refreshLevelAsOverrides(s)
    return i
}
const nexus = (s: GameState, pid: PlayerId, card: string, cores = 2) => {
    const i = createInstance(card, s.turn - 1, cores)
    s.players[pid].field.nexuses.push(i)
    refreshLevelAsOverrides(s)
    return i
}

console.log("=== BS07-084 アームズインパクト：「ブロックしているとき」を満たさなければ使用できない ===")
{
    const s = game("p671-block")
    s.turnPlayer = "p2"; s.priorityPlayer = "p2"; s.phase = "main"
    const blocker = spirit(s, "p1", VANILLA)
    spirit(s, "p1", COST2)
    const atk = spirit(s, "p2", VANILLA)
    s.players.p1.hand = ["BS07-084"]
    act(s, "p2", { type: "nextPhase" })
    act(s, "p2", { type: "attack", instanceId: atk.instanceId })
    // ブロック前のフラッシュ：条件を満たさないので使えない
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "ブロックしていないときは使用できない")
    assert(s.players.p1.hand.length === 1, "手札に残る")
    while (s.isFlashTiming && s.battle) act(s, s.priorityPlayer, { type: "pass" })
    act(s, "p1", { type: "block", instanceId: blocker.instanceId })
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "ブロックしているときは使用できる")
}

console.log("すべてのチェックに合格しました 🎉（part671）")
