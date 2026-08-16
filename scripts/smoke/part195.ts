// smoke パート195（キーワードを持つカードを、**カード固有の条件込みで**1枚ずつ働かせる）
//
// `npm run coverage:effects` が「カードデータに書いてあるのに一度も発火していない」と挙げた
// キーワードのエントリを、**振る舞いが正しいところまで**確かめて潰すためのパート。
// キーワードの基本的な動きは既存パート（強襲=part149／氷壁=part161／不死=part183 ほか）が見ているので、
// ここが見るのは**カードごとに違う指定**が効いているか:
//   - 【強襲：N】… ターン中に回復できる回数 N がカードごとに違う（1・2・3）
//   - 【氷壁：色】… 無効にできるマジックの色がカードごとに違う
//   - 【不死：コスト】… 引き金になるスピリットのコスト範囲がカードごとに違う
import { act, assert, createGame, createInstance, declareBlock, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireTrigger, findMagicNegateSource } from "../../server/src/logic/EffectModules"
import { fushiCandidates } from "../../server/src/logic/removal"
import { getCard } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    effects?: Record<string, unknown>[]
    levels?: { cores: number; bp: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

// 強襲のコストとして疲労させる駒。**効果を持たないネクサスは実データに存在しない**ので、
// 盤面に干渉する kind を持たないもので代用する（part149 と同じ選び方）
const PLAIN_NEXUS = CARDS.find(
    (c) =>
        c.type === "nexus" &&
        !(c.effects ?? []).some((e) =>
            ["fieldEvent", "globalConstraint", "step", "triggered", "onMilledFromDeck", "constraintGrant"].includes(
                String(e["kind"]),
            ),
        ),
)
if (!PLAIN_NEXUS) throw new Error("盤面に干渉しないネクサスが見つかりません")

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
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
function putNexus(s: GameState, pid: PlayerId, card: CardRow): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, 0)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// そのレベルに必要なコア数
const coresFor = (c: CardRow, level: number): number => c.levels?.[level - 1]?.cores ?? 1
// キーワードのエントリが有効な**最も高いレベル**（levels:null は常時有効なので最高Lv）
function activeLevel(c: CardRow, entry: Record<string, unknown>): number {
    const levels = entry["levels"] as number[] | null
    if (levels && levels.length > 0) return Math.max(...levels)
    return c.levels?.length ?? 1
}
function entriesOf(c: CardRow, keyword: string): Record<string, unknown>[] {
    return (c.effects ?? []).filter((e) => e["kind"] === "keyword" && e["keyword"] === keyword)
}

console.log("=== パート195：【強襲：N】は、カードごとの回数 N まで回復できる ===")
{
    const cards = CARDS.filter((c) => c.type === "spirit" && entriesOf(c, "kyoshu").length > 0)
    assert(cards.length > 0, "【強襲】を持つスピリットが実データにある")
    for (const card of cards) {
        const entry = entriesOf(card, "kyoshu")[0]!
        const count = Number(entry["count"] ?? 1)
        const level = activeLevel(card, entry)
        const s = base(`kyoshu-${card.cardId}`)
        const inst = put(s, "p1", card, coresFor(card, level))
        // 回復のコストに使うネクサスを、上限より1つ多く置く
        //（「回数の上限で止まる」ことを、ネクサス切れと区別して確かめるため）
        for (let i = 0; i < count + 1; i++) putNexus(s, "p1", PLAIN_NEXUS!)
        refreshLevelAsOverrides(s)

        for (let i = 1; i <= count; i++) {
            inst.isRested = true
            fireTrigger(s, "p1", inst, "onAttack")
            // アタック時の他の効果が選択待ちを立てることがあるので、立っていたら解消する
            while (s.pendingChoice) {
                const pc = s.pendingChoice
                s.pendingChoice = null
                if (pc === s.pendingChoice) break
            }
            assert(!inst.isRested, `${card.name}：${i}回目の【強襲】で回復する（上限${count}）`)
        }
        inst.isRested = true
        fireTrigger(s, "p1", inst, "onAttack")
        assert(
            inst.isRested,
            `${card.name}：${count + 1}回目は回復しない（ネクサスは残っているので回数の上限で止まっている）`,
        )
        assert(
            s.players.p1.field.nexuses.filter((n) => n.isRested).length === count,
            `${card.name}：疲労したネクサスは回復した回数と同じ${count}つ`,
        )
    }
}

console.log("=== 【氷壁：色】は、カードごとに指定された色のマジックだけ無効にできる ===")
{
    const cards = CARDS.filter((c) => c.type === "spirit" && entriesOf(c, "hyoheki").length > 0)
    assert(cards.length > 0, "【氷壁】を持つスピリットが実データにある")
    for (const card of cards) {
        const negate = (card.effects ?? []).find((e) => e["kind"] === "magicNegate")
        if (!negate) continue // 無効化の本体を持たないカードは対象外
        const colors = (negate["colors"] as string[] | undefined) ?? []
        if (colors.length === 0) continue // 色指定なし（何色でも無効にできる）はここでは見ない
        const level = activeLevel(card, entriesOf(card, "hyoheki")[0]!)

        // 指定色を持つマジックと、持たないマジックを実データから引く
        const hit = CARDS.find((c) => c.type === "magic" && (c.colors ?? []).some((col) => colors.includes(col)))
        // **全色を指定しているカード**（翼神機グラン・ウォーデン）では「指定外の色」が存在しない。
        // その場合も指定色の検証だけは行う
        const miss = CARDS.find((c) => c.type === "magic" && !(c.colors ?? []).some((col) => colors.includes(col)))
        if (!hit) continue

        const s2 = base(`hyoheki-${card.cardId}`)
        s2.turnPlayer = "p2" // 『相手のターン』に相手がマジックを使う場面
        s2.phase = "main"
        const inst = put(s2, "p1", card, coresFor(card, level))
        inst.isRested = false
        refreshLevelAsOverrides(s2)

        const found = findMagicNegateSource(s2, "p2", getCard(hit.cardId))
        assert(
            found !== null && found.inst.instanceId === inst.instanceId,
            `${card.name}：指定色（${colors.join("/")}）のマジック[${hit.name}]を無効にできる`,
        )
        if (miss) {
            const notFound = findMagicNegateSource(s2, "p2", getCard(miss.cardId))
            assert(
                notFound === null || notFound.inst.instanceId !== inst.instanceId,
                `${card.name}：指定外の色のマジック[${miss.name}]は無効にできない`,
            )
        }
    }
}

console.log("=== 【不死：コスト】は、カードごとに指定されたコストの破壊だけを引き金にする ===")
{
    const cards = CARDS.filter((c) => c.type === "spirit" && entriesOf(c, "fushi").length > 0)
    assert(cards.length > 0, "【不死】を持つスピリットが実データにある")
    for (const card of cards) {
        const entry = entriesOf(card, "fushi")[0]!
        const costs = (entry["triggerCosts"] as number[] | undefined) ?? []
        if (costs.length === 0) continue
        const s2 = base(`fushi-${card.cardId}`)
        s2.phase = "attack" // 『お互いのアタックステップ』
        s2.players.p1.trashCards.push(card.cardId)

        for (const cost of costs) {
            const cands = fushiCandidates(s2, "p1", cost)
            assert(
                cands.length > 0,
                `${card.name}：コスト${cost}のスピリットが破壊されたら召喚候補になる`,
            )
        }
        // 指定コストの外では候補にならない（範囲の上下どちらか、実在する値で確かめる）
        const outside = [Math.min(...costs) - 1, Math.max(...costs) + 1].filter((n) => n >= 0)
        for (const cost of outside) {
            const cands = fushiCandidates(s2, "p1", cost)
            assert(
                !cands.some((i) => s2.players.p1.trashCards[i] === card.cardId),
                `${card.name}：コスト${cost}（指定外）の破壊では候補にならない`,
            )
        }
    }
}

console.log("=== 【激突】は、相手にブロックできる個体がいる限りライフ受けを許さない ===")
{
    const cards = CARDS.filter((c) => c.type === "spirit" && entriesOf(c, "clash").length > 0)
    assert(cards.length > 0, "【激突】を持つスピリットが実データにある")
    // ブロック役（効果を持たない素のスピリット）
    const plain = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!

    // 立っている選択待ちを先頭で解消する（アタック時の効果が中断することがある）
    const drain = (s2: GameState): void => {
        for (let i = 0; i < 20 && s2.pendingChoice; i++) {
            const pc = s2.pendingChoice
            const res: Record<string, unknown> = { type: "resolveChoice" }
            if (pc.kind === "target") res["instanceId"] = pc.candidates[0]
            else if (pc.kind === "option") res["option"] = pc.options?.[0]
            else res["cardIndex"] = pc.cardIndices?.[0]
            if (act(s2, pc.pid, res as never) !== null) break
        }
    }

    for (const card of cards) {
        const level = activeLevel(card, entriesOf(card, "clash")[0]!)
        const s2 = base(`clash-${card.cardId}`)
        const attacker = put(s2, "p1", card, coresFor(card, level))
        const blk = put(s2, "p2", plain, coresFor(plain, 1))
        refreshLevelAsOverrides(s2)

        assert(act(s2, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${card.name}でアタック`)
        drain(s2)
        if (!s2.players.p2.field.spirits.some((x) => x.instanceId === blk.instanceId && !x.isRested)) continue
        // **フラッシュを閉じてから**ライフ受けを試す（閉じる前は「フラッシュ中」で弾かれ、
        // 【激突】が理由かどうか分からない）
        assert(
            takeLifeAndResolve(s2, "p2") !== null,
            `${card.name}：【激突】でブロックできる個体がいる間はライフ受けできない`,
        )
        assert(declareBlock(s2, "p2", blk.instanceId) === null, `${card.name}：ブロックは宣言できる`)
    }
}

console.log("=== 【激突】は装甲で防げる（装甲持ちしかいなければライフで受けられる） ===")
{
    // 【激突】と、その持ち主の色に対する【装甲】を持つスピリットの組み合わせを実データから探す
    const clashCards = CARDS.filter((c) => c.type === "spirit" && entriesOf(c, "clash").length > 0)
    let checked = 0
    for (const card of clashCards) {
        const colors = card.colors ?? []
        // 「相手のスピリットの効果を受けない」装甲を、アタッカーの色に対して持つスピリット
        const armored = CARDS.find(
            (c) =>
                c.type === "spirit" &&
                (c.effects ?? []).some(
                    (e) =>
                        e["kind"] === "keyword" &&
                        e["keyword"] === "armor" &&
                        ((e["colors"] as string[] | undefined) ?? []).some((col) => colors.includes(col)),
                ),
        )
        if (!armored) continue
        const armorEntry = (armored.effects ?? []).find((e) => e["kind"] === "keyword" && e["keyword"] === "armor")!
        const armorLevel = activeLevel(armored, armorEntry)

        const s2 = base(`clash-armor-${card.cardId}`)
        const attacker = put(s2, "p1", card, coresFor(card, activeLevel(card, entriesOf(card, "clash")[0]!)))
        put(s2, "p2", armored, coresFor(armored, armorLevel))
        refreshLevelAsOverrides(s2)

        assert(act(s2, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${card.name}でアタック`)
        for (let i = 0; i < 20 && s2.pendingChoice; i++) {
            const pc = s2.pendingChoice
            const res: Record<string, unknown> = { type: "resolveChoice" }
            if (pc.kind === "target") res["instanceId"] = pc.candidates[0]
            else if (pc.kind === "option") res["option"] = pc.options?.[0]
            else res["cardIndex"] = pc.cardIndices?.[0]
            if (act(s2, pc.pid, res as never) !== null) break
        }
        if (s2.players.p2.field.spirits.length === 0 || s2.winner) continue
        assert(
            takeLifeAndResolve(s2, "p2") === null,
            `${card.name} × ${armored.name}：装甲を持つ個体しかいなければ【激突】でも**ライフで受けられる**`,
        )
        checked++
    }
    assert(checked > 0, "【激突】と装甲の組み合わせを1つ以上検証した")
}
