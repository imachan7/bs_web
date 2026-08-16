// smoke パート198（カバレッジに残った継続効果を、カードごとに働かせて確かめる）
//
// `npm run coverage:effects` が「盤面にあるのに一度も適用されていない」と挙げていた
// 継続効果を、**条件を満たす盤面で実際に働かせて**潰す。
// いずれも条件が細かく（レベル・色・シンボル数・自分のスピリット数）、
// 汎用の火入れでは作れなかったもの。
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveAction } from "../../server/src/logic/EffectModules"
import { canBlock } from "../../shared/block"
import { instanceSymbolCount } from "../../shared/rules"
import { loadAllCards } from "../../data/loadCards"
import type { Color } from "../../server/src/type"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    family?: string[]
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
const topLevel = (c: CardRow): number => c.levels?.length ?? 1

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}
function put(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// そのカードの effects から、指定 id 末尾のエントリを取る
function entryOf(card: CardRow, suffix: string): Record<string, unknown> {
    const e = (card.effects ?? []).find((x) => String(x["id"]).endsWith(`-${suffix}`))
    if (!e) throw new Error(`${card.name} に ${suffix} がありません`)
    return e
}

console.log("=== パート198：条件の細かい継続効果を、カードごとに働かせる ===")

console.log("--- unblockableBy（レベル指定）：指定レベルのスピリットにはブロックされない ---")
{
    const card = byId("BS02-019") // 悪魔デースペル
    assert(card.name === "悪魔デースペル", "前提: BS02-019 は悪魔デースペル")
    const entry = entryOf(card, "e1")
    const level = (entry["levels"] as number[])[0]!
    const filter = ((entry["constraint"] as Record<string, unknown>)["levelFilter"] as number[])[0]!

    const s = base("bs02-019")
    const attacker = put(s, "p1", card, coresFor(card, level))
    // ブロック役を2体：指定レベル（ブロックできない）と、それより上（ブロックできる）
    const plain = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && topLevel(c) >= filter + 1)!
    const low = put(s, "p2", plain, coresFor(plain, filter))
    const high = put(s, "p2", plain, coresFor(plain, filter + 1))
    refreshLevelAsOverrides(s)
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }

    assert(currentLevel(low).level === filter, `前提: 低い方はLv${filter}`)
    assert(currentLevel(high).level === filter + 1, `前提: 高い方はLv${filter + 1}`)
    assert(canBlock(s, "p2", low, "p1", attacker) !== null, `${card.name}：Lv${filter}のスピリットにはブロックされない`)
    assert(canBlock(s, "p2", high, "p1", attacker) === null, `${card.name}：Lv${filter + 1}なら通常どおりブロックできる`)
}

console.log("--- cantBlock：そのレベルの間はブロックできない ---")
{
    const card = byId("BS03-014") // スカル・フィッシュ
    assert(card.name === "スカル・フィッシュ", "前提: BS03-014 はスカル・フィッシュ")
    const entry = entryOf(card, "e1")
    const level = (entry["levels"] as number[])[0]!

    const s = base("bs03-014")
    const foe = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
    const attacker = put(s, "p1", foe, coresFor(foe, 1))
    const blocker = put(s, "p2", card, coresFor(card, level))
    refreshLevelAsOverrides(s)
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }

    assert(currentLevel(blocker).level === level, `前提: Lv${level}`)
    assert(canBlock(s, "p2", blocker, "p1", attacker) !== null, `${card.name}：Lv${level}ではブロックできない`)
}

console.log("--- unblockableBy（色指定）：指定色のスピリットにはブロックされない ---")
{
    const card = byId("BS05-018") // 魔界元帥ネガプルート
    assert(card.name === "魔界元帥ネガプルート", "前提: BS05-018 は魔界元帥ネガプルート")
    for (const suffix of ["e1", "e2", "e3"]) {
        const entry = entryOf(card, suffix)
        const level = (entry["levels"] as number[])[0]!
        const color = String((entry["constraint"] as Record<string, unknown>)["colorFilter"])
        // その色を持つブロック役と、持たないブロック役
        const same = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.colors ?? []).includes(color as Color))
        const other = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && !(c.colors ?? []).includes(color as Color))
        if (!same || !other) continue

        const s = base(`bs05-018-${suffix}`)
        const attacker = put(s, "p1", card, coresFor(card, level))
        const sameInst = put(s, "p2", same, coresFor(same, 1))
        const otherInst = put(s, "p2", other, coresFor(other, 1))
        refreshLevelAsOverrides(s)
        s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }

        assert(canBlock(s, "p2", sameInst, "p1", attacker) !== null, `${card.name} Lv${level}：${color}のスピリットにはブロックされない`)
        assert(canBlock(s, "p2", otherInst, "p1", attacker) === null, `${card.name} Lv${level}：${color}以外なら通常どおりブロックできる`)
    }
}

console.log("--- aura（マジックが貸すBP増加。シンボル数の条件つき） ---")
{
    const card = byId("BS05-008") // 一角竜ヴォルスング
    assert(card.name === "一角竜ヴォルスング", "前提: BS05-008 は一角竜ヴォルスング")
    const entry = entryOf(card, "e3")
    const aura = entry["aura"] as Record<string, unknown>
    const minSymbols = Number(aura["minSymbols"])
    const amount = Number(aura["amount"])

    const s = base("bs05-008")
    // シンボルを条件数以上持つ駒と、満たさない駒。
    // **効果なしのスピリットにシンボル2つ以上は存在しない**ので、
    // 「BPに影響しない効果しか持たない」ものまで許す
    const bpNeutral = (c: CardRow): boolean =>
        !(c.effects ?? []).some((e) => ["aura", "levelAs", "constraint", "coreBonus"].includes(String(e["kind"])))
    const many = CARDS.find(
        (c) => c.type === "spirit" && bpNeutral(c) && (c.symbol?.length ?? 0) >= minSymbols,
    )
    const few = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.symbol?.length ?? 0) < minSymbols,
    )
    assert(many !== undefined && few !== undefined, `前提: シンボル${minSymbols}つ以上の駒と、満たさない駒がある`)
    if (many && few) {
        const big = put(s, "p1", many, coresFor(many, topLevel(many)))
        const small = put(s, "p1", few, coresFor(few, topLevel(few)))
        refreshLevelAsOverrides(s)
        assert(instanceSymbolCount(big) >= minSymbols, `前提: シンボル${minSymbols}つ以上の駒がいる`)
        const bigBefore = effectiveBp(s, "p1", big)
        const smallBefore = effectiveBp(s, "p1", small)

        // このターンの間だけ効果を貸す（lentOnly）
        resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined,
            (card.colors ?? ["red"]) as Color[], "spirit", undefined, undefined, card.cardId)
        refreshLevelAsOverrides(s)

        assert(
            effectiveBp(s, "p1", big) === bigBefore + amount,
            `${card.name}：シンボル${minSymbols}つ以上の自分のスピリットがBP+${amount}される`,
        )
        assert(
            effectiveBp(s, "p1", small) === smallBefore,
            `${card.name}：シンボルが足りない駒は上がらない`,
        )
    }
}

console.log("--- levelAs：自分のスピリットが少ないときだけ高いレベルとして扱う ---")
{
    const card = byId("BS08-004") // 恐竜人ティラノイド
    assert(card.name === "恐竜人ティラノイド", "前提: BS08-004 は恐竜人ティラノイド")
    const entry = entryOf(card, "e1")
    const treatAs = Number(entry["treatAs"])
    const maxOwn = Number((entry["condition"] as Record<string, unknown>)["maxOwnSpirits"])

    const s = base("bs08-004")
    const self = put(s, "p1", card, coresFor(card, 1))
    refreshLevelAsOverrides(s)
    assert(currentLevel(self).level === treatAs, `${card.name}：自分のスピリットが${maxOwn}体以下ならLv${treatAs}として扱う`)

    // 条件を超えるまで増やすと、通常のレベルに戻る
    const filler = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
    for (let i = s.players.p1.field.spirits.length; i <= maxOwn; i++) put(s, "p1", filler, coresFor(filler, 1))
    refreshLevelAsOverrides(s)
    assert(
        currentLevel(self).level !== treatAs,
        `${card.name}：${maxOwn}体を超えると通常のレベルに戻る（実際Lv${currentLevel(self).level}）`,
    )
}
