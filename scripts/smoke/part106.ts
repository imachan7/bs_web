// smoke パート106（マジックのメイン側・実装漏れ埋め）
// 対象: BS01-132 ストームドロー／BS04-088 栄光の表彰台／BS03-146 ネクサスレジスター／
//       BS02-098 キャストオフ／BS02-096 ディバインウィンド／BS04-108 ストレートフラッシュ／
//       BS02-088 クロスファイア／BS02-090 マインドフレア
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
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

console.log("=== BS03-146 ネクサスレジスター：メインは手札のネクサスを全破棄して枚数ぶんドロー ===")
{
    const s = createGame("nexusregister-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = ["BS01-098", "BS01-098", "BS01-001"] // ネクサス2枚＋スピリット1枚
    const trashBefore = s.players.p1.trashCards.length
    resolveMagic(s, "p1", "BS03-146", "main")
    // ネクサス2枚を破棄して2枚ドロー → 手札はスピリット1枚＋引いた2枚＝3枚
    assert(s.players.p1.hand.length === 3, `手札は3枚（実際: ${String(s.players.p1.hand.length)}）`)
    assert(s.players.p1.trashCards.length === trashBefore + 2, "破棄したネクサス2枚がトラッシュへ")
    assert(s.players.p1.hand.filter((c) => c === "BS01-098").length === 0, "手札にネクサスは残らない")
}

console.log("=== BS03-146 ネクサスレジスター：手札にネクサスが無ければ不発 ===")
{
    const s = createGame("nexusregister-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = ["BS01-001"]
    resolveMagic(s, "p1", "BS03-146", "main")
    assert(s.players.p1.hand.length === 1, "ネクサスが無いのでドローしない")
}

console.log("=== BS02-098 キャストオフ：怪虫1体を破壊してコスト5のスピリットをノーコスト召喚 ===")
{
    const s = createGame("castoff-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS01-055", 1) // エメアント（系統：怪虫）
    s.players.p1.hand = ["BS01-017"] // ランスラプトル（コスト5）
    s.players.p1.reserve = 5
    resolveMagic(s, "p1", "BS02-098", "main")
    assert(s.players.p1.field.spirits.length === 1, "怪虫が破壊され、代わりに1体召喚されている")
    assert(
        s.players.p1.field.spirits[0]!.cardId === "BS01-017",
        "召喚されたのはコスト5のランスラプトル",
    )
}

console.log("=== BS02-098 キャストオフ：怪虫がいなければ不発（手札も減らない） ===")
{
    const s = createGame("castoff-nocost", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = ["BS01-017"]
    s.players.p1.reserve = 5
    resolveMagic(s, "p1", "BS02-098", "main")
    assert(s.players.p1.field.spirits.length === 0, "召喚されない")
    assert(s.players.p1.hand.length === 1, "手札は減らない")
}

console.log("=== BS02-096 ディバインウィンド：トラッシュのコア数以下のコストだけ召喚できる ===")
{
    const s = createGame("divinewind-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = ["BS01-017"] // コスト5
    s.players.p1.reserve = 5
    s.players.p1.trashCores = 4 // コスト5には足りない
    resolveMagic(s, "p1", "BS02-096", "main")
    assert(s.players.p1.field.spirits.length === 0, "トラッシュのコアが4個ならコスト5は召喚できない")
    s.players.p1.trashCores = 5
    resolveMagic(s, "p1", "BS02-096", "main")
    assert(s.players.p1.field.spirits.length === 1, "5個あればコスト5を召喚できる")
}

console.log("=== BS04-108 ストレートフラッシュ：四道5体以上で自分の四道と相手のスピリットを全破壊 ===")
{
    const s = createGame("straightflush-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    for (let i = 0; i < 4; i++) put(s, "p1", "BS02-056", 1) // アルカナビースト・ケン（四道）
    put(s, "p1", "BS01-001", 1) // 四道でないスピリット（残るはず）
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-017", 1)
    resolveMagic(s, "p1", "BS04-108", "main")
    assert(s.players.p1.field.spirits.length === 5, "四道が5体未満なので発動しない")

    put(s, "p1", "BS02-056", 1) // 5体目の四道
    resolveMagic(s, "p1", "BS04-108", "main")
    assert(
        s.players.p1.field.spirits.length === 1 &&
            s.players.p1.field.spirits[0]!.cardId === "BS01-001",
        "自分の四道だけ全滅し、四道でないスピリットは残る",
    )
    assert(s.players.p2.field.spirits.length === 0, "相手のスピリットは全滅する")
}

console.log("=== BS02-088 クロスファイア：お互いのネクサスを1つずつ破壊。片方に無ければ不発 ===")
{
    const s = createGame("crossfire-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS01-098", 0)
    resolveMagic(s, "p1", "BS02-088", "main")
    assert(s.players.p1.field.nexuses.length === 1, "相手にネクサスが無ければ発動しない")

    putNexus(s, "p2", "BS01-098", 0)
    putNexus(s, "p2", "BS01-098", 0)
    resolveMagic(s, "p1", "BS02-088", "main")
    assert(s.players.p1.field.nexuses.length === 0, "自分のネクサスも1つ破壊される")
    assert(s.players.p2.field.nexuses.length === 1, "相手のネクサスも1つだけ破壊される")
}

console.log("=== BS02-090 マインドフレア：同名スピリットを1体だけ残して破壊 ===")
{
    const s = createGame("mindflare-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-017", 1)
    resolveMagic(s, "p1", "BS02-090", "main")
    assert(s.players.p2.field.spirits.length === 2, "同名3体は1体だけ残る（＋別名1体）")
    assert(
        s.players.p2.field.spirits.filter((x) => x.cardId === "BS01-001").length === 1,
        "ゴラドンは1体だけ残る",
    )
}
