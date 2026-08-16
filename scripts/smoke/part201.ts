// smoke パート201（ライフの減少量を「上限」として持つ仕組み）
//
// 2026-08-16 ユーザー提案で、ライフダメージを「減るか／減らないか」の二択から
// **上限を値で返す**形（shared/rules.lifeDamageLimit）へ変えた。
// これにより「〇しか減らない」（SD01-039 ブリザードウォール）が表せるようになり、
// 従来の「減らない」も max:0 として同じ入口に合流している。
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { lifeDamageLimit, instanceSymbolCount } from "../../shared/rules"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    symbol?: string[]
    effects?: Record<string, unknown>[]
    levels?: { cores: number; bp: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const byId = (id: string): CardRow => {
    const c = CARDS.find((x) => x.cardId === id)
    if (!c) throw new Error(`カードが見つかりません: ${id}`)
    return c
}
const coresFor = (c: CardRow, level: number): number => c.levels?.[level - 1]?.cores ?? 1

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== パート201：ライフの減少量を上限として持つ ===")

console.log("--- 制限が無ければ、シンボル数ぶん減る（回帰） ---")
{
    // シンボル2つのスピリットを使い、「上限なし」が Infinity で返ることと実際の減少量を見る
    const multi = CARDS.find((c) => c.type === "spirit" && (c.symbol?.length ?? 0) >= 2)!
    const s = base("life-nolimit")
    const attacker = put(s, "p1", multi, coresFor(multi, 1))
    refreshLevelAsOverrides(s)
    const limit = lifeDamageLimit(s, "p2", attacker)
    assert(limit.max === Number.POSITIVE_INFINITY, "制限が無ければ上限なし（Infinity）")

    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(
        s.players.p2.life === lifeBefore - instanceSymbolCount(attacker),
        `シンボル数ぶん減る（${lifeBefore}→${s.players.p2.life}）`,
    )
}

console.log("--- ブリザードウォール：このターンは1しか減らない ---")
{
    const card = byId("SD01-039")
    assert(card.name === "ブリザードウォール", "前提: SD01-039 はブリザードウォール")
    const multi = CARDS.find((c) => c.type === "spirit" && (c.symbol?.length ?? 0) >= 2)!
    const s = base("life-cap")
    const attacker = put(s, "p1", multi, coresFor(multi, 1))
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(attacker) >= 2, "前提: シンボル2つ以上のアタッカー")

    // 防御側（p2）がフラッシュで使う
    s.players.p2.hand[0] = card.cardId
    s.players.p2.reserve = 20
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, `${card.name}を使用`)

    const limit = lifeDamageLimit(s, "p2", attacker)
    assert(limit.max === 1, `上限が1になる（実際: ${limit.max}）`)
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(
        s.players.p2.life === lifeBefore - 1,
        `シンボル2つでも1しか減らない（${lifeBefore}→${s.players.p2.life}）`,
    )
    // 相手側（使っていない方）には効かない
    assert(
        lifeDamageLimit(s, "p1", attacker).max === Number.POSITIVE_INFINITY,
        "使った側のライフだけが守られる（相手には効かない）",
    )
}
