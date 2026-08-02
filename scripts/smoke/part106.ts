// smoke パート106（マジックのメイン側・実装漏れ埋め）
// 対象: BS01-132 ストームドロー（メイン：3枚引いて2枚破棄）／
//       BS04-088 栄光の表彰台（Lv2：自分のフィールドにネクサスが配置されるたびリザーブへコア1個）
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== BS01-132 ストームドロー：メインは3枚ドロー→手札2枚破棄 ===")
{
    const s = createGame("stormdraw-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const before = s.players.p1.hand.length
    const trashBefore = s.players.p1.trashCards.length
    resolveMagic(s, "p1", "BS01-132", "main")
    // 3枚引いて2枚破棄なので手札は差し引き+1枚、トラッシュは+2枚
    assert(s.players.p1.hand.length === before + 1, "手札は3枚引いて2枚破棄で差し引き+1枚")
    assert(s.players.p1.trashCards.length === trashBefore + 2, "破棄した2枚がトラッシュへ")
}

console.log("=== BS01-132 ストームドロー：フラッシュ側は従来どおりBP+3000 ===")
{
    const s = createGame("stormdraw-flash", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const target = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p1.field.spirits.push(target)
    resolveMagic(s, "p1", "BS01-132", "flash", target.instanceId)
    assert(target.tempBpBuff === 3000, "フラッシュ側でBP+3000")
}

console.log("=== BS04-088 栄光の表彰台：Lv2はネクサス配置のたびにリザーブへコア1個 ===")
{
    const s = createGame("hyoshodai-deploy", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS04-088", 3) // Lv2（コア3個）
    // 手札に燃えさかる戦場（コスト3）を仕込み、リザーブを十分に用意して配置する
    s.players.p1.hand.push("BS01-098")
    const handIndex = s.players.p1.hand.length - 1
    s.players.p1.reserve = 8
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "setNexus", handIndex }) === null,
        "ネクサスを配置できる",
    )
    // コスト3を支払い（-3）、配置の誘発でボイドからコア1個が戻る（+1）
    assert(
        s.players.p1.reserve === reserveBefore - 3 + 1,
        `配置コスト3を払いつつ誘発で+1個（実際: ${String(s.players.p1.reserve)}）`,
    )
}

console.log("=== BS04-088 栄光の表彰台：Lv1では発揮されない ===")
{
    const s = createGame("hyoshodai-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS04-088", 0) // Lv1（コア0個）
    s.players.p1.hand.push("BS01-098")
    const handIndex = s.players.p1.hand.length - 1
    s.players.p1.reserve = 8
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "setNexus", handIndex }) === null, "ネクサスを配置できる")
    assert(s.players.p1.reserve === reserveBefore - 3, "Lv1なので誘発せずコストぶんだけ減る")
}
