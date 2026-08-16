// smoke パート201（ライフの減少量を「上限」として持つ仕組み）
//
// 2026-08-16 ユーザー提案で、ライフダメージを「減るか／減らないか」の二択から
// **上限を値で返す**形（shared/rules.lifeDamageLimit）へ変えた。
// これにより「〇しか減らない」（SD01-039 ブリザードウォール）が表せるようになり、
// 従来の「減らない」も max:0 として同じ入口に合流している。
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { lifeDamageLimit, instanceSymbolCount, effectiveBp, boardResistanceAgainst } from "../../shared/rules"
import { resolveAction } from "../../server/src/logic/EffectModules"
import type { Color } from "../../server/src/type"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    symbol?: string[]
    colors?: string[]
    reduction?: string[]
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

console.log("--- エメラルドブースト：軽減シンボル1つにつきBP+1000（対象自身のシンボル数で数える） ---")
{
    const card = byId("SD01-038")
    assert(card.name === "エメラルドブースト", "前提: SD01-038 はエメラルドブースト")
    // 軽減シンボルの数が違う2体を並べ、**それぞれの数に応じて**上がることを見る
    const many = CARDS.find((c) => c.type === "spirit" && ((c as unknown as { reduction?: string[] }).reduction?.length ?? 0) >= 2)!
    const few = CARDS.find((c) => c.type === "spirit" && ((c as unknown as { reduction?: string[] }).reduction?.length ?? 0) === 1)!
    const s = base("emerald-boost")
    s.phase = "attack"
    const big = put(s, "p1", many, coresFor(many, 1))
    const small = put(s, "p1", few, coresFor(few, 1))
    refreshLevelAsOverrides(s)
    // アタック中のスピリットだけが対象なので、バトルを成立させる
    s.battle = { attackerInstanceId: big.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    const bigBefore = effectiveBp(s, "p1", big)
    const smallBefore = effectiveBp(s, "p1", small)

    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined,
        (card.colors ?? ["green"]) as Color[], "magic", undefined, undefined, card.cardId)
    refreshLevelAsOverrides(s)

    const bigSymbols = (many as unknown as { reduction?: string[] }).reduction?.length ?? 0
    assert(
        effectiveBp(s, "p1", big) === bigBefore + 1000 * bigSymbols,
        `アタック中の駒は軽減シンボル${bigSymbols}つぶん上がる（${bigBefore}→${effectiveBp(s, "p1", big)}）`,
    )
    assert(
        effectiveBp(s, "p1", small) === smallBefore,
        "アタックしていない駒は上がらない",
    )
}

console.log("--- アーマーパージ：このターン、自分の装甲は一切働かない ---")
{
    const card = byId("SD01-040")
    assert(card.name === "アーマーパージ", "前提: SD01-040 はアーマーパージ")
    // 装甲を持つ自分のスピリットと、その装甲色を持つ相手の発生源を用意する
    const armored = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "armor" && Array.isArray(e["colors"])),
    )!
    const armorEntry = (armored.effects ?? []).find((e) => e["kind"] === "keyword" && e["keyword"] === "armor")!
    const armorColors = (armorEntry["colors"] as string[])
    const s = base("armor-purge")
    const mine = put(s, "p1", armored, coresFor(armored, (armorEntry["levels"] as number[] | null)?.[0] ?? 1))
    mine.isRested = true
    refreshLevelAsOverrides(s)

    // 装甲が効いている＝相手の同色の効果を受けない
    const attempt = {
        op: "destroy" as const, scope: "targeted" as const, actorPid: "p2" as const,
        sourceType: "spirit" as const, sourceColors: [armorColors[0]] as Color[],
    }
    assert(boardResistanceAgainst(s, "p1", mine, attempt) !== null, "前提: 装甲で防げている")

    s.players.p1.hand[0] = card.cardId
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, `${card.name}を使用`)
    assert(!mine.isRested, "【装甲】を持つ自分のスピリットが回復する")
    assert(
        boardResistanceAgainst(s, "p1", mine, attempt) === null,
        "その後、このターンは装甲が働かなくなる（自分から殴れる）",
    )
}
