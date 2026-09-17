// smoke パート343（メインステップから直接ターンを終了しても、アタックステップを経由する。2026-09-17）
//
// アタックする／しないに関わらず、アタックステップは必ず経由する（2026-09-17 ユーザー確認）。
// 以前の endTurn は phase が "attack" のときだけアタックステップ終了時の誘発を出し、メインステップから
// 直接呼ばれるとアタックステップを丸ごと飛ばしていた（クライアントの「ターン終了」ボタンも AI もメインから直接呼ぶ）。
// 「アタックステップは行えず」（BS10-108 ルナティックシール）のときだけ経由しない。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS01-113").name === "侵食されゆく銀世界", "BS01-113 は侵食されゆく銀世界（『相手のアタックステップ』開始時）")
    assert(getCard("BS02-079").name === "紫水晶の森", "BS02-079 は紫水晶の森（Lv2『自分のアタックステップ』終了時）")
}

function setupSilver(s: GameState) {
    s.players.p2.field.nexuses.push(createInstance("BS01-113", s.turn, 0))
    s.players.p2.trashCores = 3
}
function setupForest(s: GameState) {
    s.players.p1.field.nexuses.push(createInstance("BS02-079", s.turn, 3)) // Lv2
    for (let i = 0; i < 3; i++) s.players.p1.field.spirits.push(createInstance("BS01-001", s.turn, 1))
}
const silverFired = (s: GameState) => s.log.some((l) => typeof l === "string" && l.includes("侵食されゆく銀世界"))

console.log("=== §A メインから直接ターン終了：相手の『相手のアタックステップ』開始時効果が発揮する ===")
{
    const s = game("p343-a")
    setupSilver(s)
    assert(s.phase === "main", "前提：メインステップ")
    assert(act(s, "p1", { type: "endTurn" }) === null, "メインステップから直接ターンを終了できる")
    assert(silverFired(s), "侵食されゆく銀世界が発揮した（アタックステップを経由した）")
}

console.log("=== §B メインから直接ターン終了：自分の『自分のアタックステップ』終了時効果が発揮する ===")
{
    const s = game("p343-b")
    setupForest(s)
    const hand = s.players.p1.hand.length
    assert(act(s, "p1", { type: "endTurn" }) === null, "メインステップから直接ターンを終了できる")
    assert(s.players.p1.hand.length === hand + 2, `紫水晶の森で2枚ドローした（${s.players.p1.hand.length - hand}枚）`)
}

console.log("=== §C 「アタックステップは行えず」のときは経由しない ===")
{
    const s = game("p343-c")
    setupSilver(s)
    setupForest(s)
    s.endStepLocks.push({ pid: "p2", remaining: 2, cardId: "BS10-108", locks: ["attackStep"] } as never)
    const hand = s.players.p1.hand.length
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターンを終了できる")
    assert(!silverFired(s), "侵食されゆく銀世界は発揮しない")
    assert(s.players.p1.hand.length === hand, "紫水晶の森も発揮しない")
}

console.log("すべてのチェックに合格しました 🎉（part343）")
