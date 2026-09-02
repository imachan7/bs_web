// smoke パート278（BS11 グループA/B の小さな軸：070 / 081 / 075）
import { assert, createGame, createInstance, effectiveBp, refreshLevelAsOverrides, resolveAction, runTurnStart, spiritHasKeyword } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { resolveMagic } from "../../server/src/logic/EffectModules"

const ISLAND = "BS11-070" // 彷徨う無重力島（Lv2＝系統「戯狩」に【聖命】を与える）
const DELIVERY = "BS11-081" // ライトニングデリバリー（【光芒】/【聖命】持ちをBP+1000）
const TOTEN = "BS11-075" // トーテンタンツ（手札1枚を破棄してコア2個）
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
const gagari = ALL_CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes("戯狩"))
assert(gagari !== undefined && vanilla.length >= 2, "テスト前提: 系統「戯狩」のスピリットがいる")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.phase = "attack"
    return s
}

console.log("=== §A BS11-070 Lv2：系統「戯狩」に【聖命】を与える（アタックステップ中だけ） ===")
{
    const s = game("island")
    const island = createInstance(ISLAND, s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(island)
    const target = createInstance(gagari!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(target)
    const other = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", target, "seimei"), "戯狩は【聖命】を持つ")
    assert(!spiritHasKeyword(s, "p1", other, "seimei"), "系統が違えば与えられない")
    s.phase = "main"
    assert(!spiritHasKeyword(s, "p1", target, "seimei"), "アタックステップ以外では与えられない")
}

console.log("=== §B BS11-081：【光芒】/【聖命】のいずれかを持つ自分のスピリットをBP+1000 ===")
{
    const s = game("delivery")
    const seimei = ALL_CARDS.find((c) =>
        c.type === "spirit" && c.effects.some((e) => e.kind === "keyword" && e.keyword === "seimei"),
    )
    const kobo = ALL_CARDS.find((c) =>
        c.type === "spirit" && c.effects.some((e) => e.kind === "keyword" && e.keyword === "kobo"),
    )
    assert(seimei !== undefined && kobo !== undefined, "テスト前提: 【聖命】と【光芒】のスピリットがいる")
    const a = createInstance(seimei!.cardId, s.turn, 3)
    const b = createInstance(kobo!.cardId, s.turn, 3)
    const c = createInstance(vanilla[0]!.cardId, s.turn, 3)
    s.players.p1.field.spirits.push(a, b, c)
    refreshLevelAsOverrides(s)
    const before = [a, b, c].map((x) => effectiveBp(s, "p1", x))
    resolveMagic(s, "p1", DELIVERY, "flash")
    refreshLevelAsOverrides(s)
    const after = [a, b, c].map((x) => effectiveBp(s, "p1", x))
    assert(after[0]! === before[0]! + 1000, "【聖命】持ちはBP+1000")
    assert(after[1]! === before[1]! + 1000, "【光芒】持ちもBP+1000")
    assert(after[2]! === before[2]!, "どちらも持たなければ変わらない")
}

console.log("=== §C BS11-075：手札のスピリット/ブレイヴ1枚を破棄してコア2個を取り除く ===")
{
    const s = game("totentanz")
    const target = createInstance(vanilla[0]!.cardId, s.turn, 5)
    s.players.p2.field.spirits.push(target)
    s.players.p1.hand = [vanilla[1]!.cardId]
    const before = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "costDiscardHandTypeThenCoreRemove", cardTypes: ["spirit", "brave"], count: 2 })
    assert(s.players.p1.hand.length === 0, "コストとして手札を破棄する")
    assert(target.cores === 3, "コアが2個減る")
    assert(s.players.p2.reserve === before + 2, "取り除いたコアは相手のリザーブへ")
}
{
    const s = game("totentanz-nocost")
    const target = createInstance(vanilla[0]!.cardId, s.turn, 5)
    s.players.p2.field.spirits.push(target)
    s.players.p1.hand = [] // コストにできる手札が無い
    resolveAction(s, "p1", null, { type: "costDiscardHandTypeThenCoreRemove", cardTypes: ["spirit", "brave"], count: 2 })
    assert(target.cores === 5, "コストを払えなければ発揮しない（COST_MODEL §1）")
}

console.log("すべてのチェックに合格しました 🎉（part278）")
