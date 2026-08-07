// smoke パート119（§5-C-4 / §5-C-5：手札への継続付与と系統の抑止）
//
// 新設した機構:
//   - kind:"familySuppression"（条件に合うスピリットは系統をないものとして扱う。
//     shared/rules.spiritHasFamily の先頭で判定するので matchesFamilyFilter 経由もすべて false になる）
//   - kind:"handKeywordGrant"（手札のカードへの**継続**付与。手札には書き込まず、判定のたびに場の発生源を見る。
//     shared/rules.hasHandKeywordGrant を RuleValidator とクライアント表示が共用）
// 実装したカード:
//   - BS03-105 暗礁海域 Lv1（コア2個以下のスピリットは系統をないものとして扱う）
//   - BS02-081 緑芽吹く原野 Lv2（自分の手札の「怪虫」に【神速】を与える）
import { act, assert, createGame, createInstance, currentLevel, getCard, runTurnStart, spiritHasFamily } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { hasHandKeywordGrant, matchesFamilyFilter } from "../../shared/rules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS03-105").name === "暗礁海域" && getCard("BS03-105").type === "nexus", "BS03-105 は暗礁海域（ネクサス）")
    assert(getCard("BS02-081").name === "緑芽吹く原野" && getCard("BS02-081").type === "nexus", "BS02-081 は緑芽吹く原野（ネクサス）")
    assert(getCard("BS01-025").family.includes("機竜"), "要塞龍ギガは系統「機竜」")
    assert(getCard("BS03-029").name === "マッハフライ" && getCard("BS03-029").family.includes("怪虫"), "BS03-029 はマッハフライ（怪虫）")
    assert(getCard("BS03-029").cost === 3, "マッハフライのコストは3")
    assert((getCard("BS03-029").effects ?? []).length === 0, "マッハフライは効果の記述を持たない（【神速】を静的には持たない）")
    assert(!getCard("BS01-001").family.includes("怪虫"), "ゴラドンは怪虫でない")
}

console.log("=== BS03-105 暗礁海域 Lv1：コア2個以下のスピリットは系統をないものとして扱う ===")
{
    const s = createGame("t119-reef-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS03-105", 0) // Lv1
    assert(currentLevel(nexus).level === 1, `暗礁海域は0コアでLv1（実際: ${String(currentLevel(nexus).level)}）`)
    s.turnPlayer = "p1"

    const few = put(s, "p2", "BS01-025", 2) // 要塞龍ギガ（コア2個）
    const many = put(s, "p2", "BS01-025", 3) // 要塞龍ギガ（コア3個）
    assert(!spiritHasFamily(s, "p2", few, "機竜"), "コア2個以下は系統を持たない（相手のスピリットにも効く）")
    assert(spiritHasFamily(s, "p2", many, "機竜"), "コア3個以上は系統を持つ")
    assert(!matchesFamilyFilter(s, "p2", few, ["機竜"]), "matchesFamilyFilter 経由でも系統なし扱いになる")

    // 自分のスピリットにも効く（『すべては』）
    const ownFew = put(s, "p1", "BS01-025", 1)
    assert(!spiritHasFamily(s, "p1", ownFew, "機竜"), "自分のスピリットも対象になる")
}

console.log("=== BS03-105 暗礁海域：相手のターンでは働かない／ネクサスがなければ働かない ===")
{
    const s = createGame("t119-reef-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS03-105", 0)
    const few = put(s, "p2", "BS01-025", 2)
    s.turnPlayer = "p2" // 『自分のターン』＝発生源の持ち主p1のターンのみ
    assert(spiritHasFamily(s, "p2", few, "機竜"), "相手のターンでは系統を抑止しない")

    const s2 = createGame("t119-reef-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s2)
    const few2 = put(s2, "p2", "BS01-025", 2)
    s2.turnPlayer = "p1"
    assert(spiritHasFamily(s2, "p2", few2, "機竜"), "ネクサスがなければ通常どおり系統を持つ")
}

console.log("=== BS02-081 緑芽吹く原野 Lv2：手札の「怪虫」に【神速】を与える ===")
{
    const s = createGame("t119-field-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS02-081", 3) // Lv2
    assert(currentLevel(nexus).level === 2, `緑芽吹く原野は3コアでLv2（実際: ${String(currentLevel(nexus).level)}）`)
    s.phase = "attack"

    assert(hasHandKeywordGrant(s, "p1", getCard("BS03-029"), "soku"), "アタックステップ中、手札の「怪虫」は【神速】を得る")
    assert(!hasHandKeywordGrant(s, "p1", getCard("BS01-001"), "soku"), "「怪虫」でないカードは得ない")
    assert(!hasHandKeywordGrant(s, "p2", getCard("BS03-029"), "soku"), "相手の手札には与えない")

    s.phase = "main"
    assert(!hasHandKeywordGrant(s, "p1", getCard("BS03-029"), "soku"), "メインステップでは与えない（『お互いのアタックステップ』）")

    s.phase = "attack"
    nexus.cores = 0 // Lv1
    assert(!hasHandKeywordGrant(s, "p1", getCard("BS03-029"), "soku"), "Lv1では与えない")
}

console.log("=== BS02-081 緑芽吹く原野 Lv2：フラッシュタイミングに手札の「怪虫」を召喚できる（配線確認） ===")
{
    const s = createGame("t119-field-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS02-081", 3) // Lv2
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS03-029" // マッハフライ（怪虫・コスト3・キーワードなし）
    const before = s.players.p1.field.spirits.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "【神速】を得ているのでフラッシュ中に召喚できる")
    assert(
        s.players.p1.field.spirits.length === before + 1,
        `マッハフライが場に出る（実際: ${String(s.players.p1.field.spirits.length - before)}体）`,
    )

    // 対照：ネクサスがなければフラッシュ中には召喚できない
    const s2 = createGame("t119-field-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s2)
    s2.phase = "attack"
    s2.isFlashTiming = true
    s2.priorityPlayer = "p1"
    s2.players.p1.reserve = 20
    s2.players.p1.hand[0] = "BS03-029"
    assert(act(s2, "p1", { type: "summon", handIndex: 0 }) !== null, "ネクサスがなければフラッシュ中は召喚できない")
}
