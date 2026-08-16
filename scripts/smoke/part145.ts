// smoke パート145（第八弾「戦嵐」紫15枚：新規エンジン拡張の経路確認）
//
// BS08の紫15枚取り込みで追加したエンジン拡張を実カード経由で1回ずつ通す:
//   fieldEvent.maxBp（anySpiritAttacked。BS08-012）／coreRemove.filter（TargetFilter。BS08-058）／
//   globalConstraint"singleCoreCantAttack"（BS08-057）／coreRemoveMulti.keywordExclude（BS08-015）／
//   summonFromTrashFree.nameIncludes（BS08-013）／recoverSpiritFromTrash.keywordFilter（BS08-070）／
//   millUntilFamilyToHand（BS08-014）／costOwnSpiritCoresToTrashThenOpponent（BS08-072）／
//   fieldEvent"ownTensho".nameIncludes経由のeventInfo.names（BS08-X30）／
//   onSummon＋ownTenshoの加算ドロー1+2=3（BS08-016）
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    destroySpirit,
    fireStepTriggers,
    hasKeyword,
    refreshLevelAsOverrides,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    family?: string[]
    symbol?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function entryOf(c: CardRow, pred: (e: Record<string, unknown>) => boolean): Record<string, unknown> {
    const found = (c.effects ?? []).find(pred)
    if (!found) throw new Error(`${c.name} に該当エントリがありません`)
    return found
}
function coresFor(c: CardRow, level: number): number {
    return c.levels?.[level - 1]?.cores ?? 1
}
function bpAt(c: CardRow, level: number): number {
    return c.levels?.[level - 1]?.bp ?? 0
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 40
    s.players.p2.reserve = 40
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)!

console.log("=== BS08ダークスカルデーモン：fieldEvent.maxBp（anySpiritAttacked） ===")
{
    const dark = findByEffect(
        (e) => e["kind"] === "fieldEvent" && e["event"] === "anySpiritAttacked" && e["maxBp"] !== undefined,
    )
    const entry = entryOf(dark, (e) => e["kind"] === "fieldEvent" && e["event"] === "anySpiritAttacked")
    const level = (entry["levels"] as number[])[0]!
    const maxBp = Number(entry["maxBp"])
    const weak = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) <= maxBp && c.cardId !== dark.cardId)!
    const strong = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) > maxBp)!

    const s = base("dark-weak")
    s.turnPlayer = "p2"
    s.phase = "attack"
    put(s, "p1", dark.cardId, coresFor(dark, level))
    const weakAttacker = put(s, "p2", weak.cardId, coresFor(weak, 1) + 2)
    const weakCoresBefore = weakAttacker.cores
    assert(act(s, "p2", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "BP低いスピリットでアタック")
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける")
    assert(
        weakAttacker.cores === weakCoresBefore - 1,
        `BP${maxBp}以下でアタックしたとき、そのスピリットのコアが1個トラッシュへ`,
    )

    const s2 = base("dark-strong")
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    put(s2, "p1", dark.cardId, coresFor(dark, level))
    const strongAttacker = put(s2, "p2", strong.cardId, coresFor(strong, 1) + 2)
    const strongCoresBefore = strongAttacker.cores
    assert(act(s2, "p2", { type: "attack", instanceId: strongAttacker.instanceId }) === null, "BP高いスピリットでアタック")
    assert(takeLifeAndResolve(s2, "p1") === null, "ライフで受ける")
    assert(strongAttacker.cores === strongCoresBefore, `対照実験：BP${maxBp}超のアタックではコアが減らない`)
}

console.log("=== BS08倒逆ピラミッド群：coreRemove.filter（TargetFilter） ===")
{
    const pyramid = findByEffect(
        (e) =>
            e["kind"] === "step" &&
            e["step"] === "end" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "coreRemove" &&
            ((e["action"] as Record<string, unknown>)["filter"] as Record<string, unknown> | undefined)?.[
                "maxBp"
            ] !== undefined,
    )
    const entry = entryOf(
        pyramid,
        (e) => e["kind"] === "step" && (e["action"] as Record<string, unknown> | undefined)?.["type"] === "coreRemove",
    )
    const level = (entry["levels"] as number[])[0]!
    const maxBp = Number(((entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["maxBp"])
    const weak = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) <= maxBp)!
    const strong = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) > maxBp)!

    const s = base("pyramid-weak")
    s.turnPlayer = "p2"
    putNexus(s, "p1", pyramid.cardId, coresFor(pyramid, level))
    const weakSpirit = put(s, "p2", weak.cardId, coresFor(weak, 1) + 2)
    const before = weakSpirit.cores
    fireStepTriggers(s, "end")
    assert(weakSpirit.cores === before - 1, `BP${maxBp}以下の相手のスピリットのコア1個をリザーブへ`)

    const s2 = base("pyramid-strong")
    s2.turnPlayer = "p2"
    putNexus(s2, "p1", pyramid.cardId, coresFor(pyramid, level))
    const strongSpirit = put(s2, "p2", strong.cardId, coresFor(strong, 1) + 2)
    const before2 = strongSpirit.cores
    fireStepTriggers(s2, "end")
    assert(strongSpirit.cores === before2, `対照実験：BP${maxBp}超の相手のスピリットは対象にならない`)
}

console.log("=== BS08赤き砂の座：globalConstraint singleCoreCantAttack（ブロックは可能） ===")
{
    const sands = findByEffect(
        (e) =>
            e["kind"] === "globalConstraint" &&
            (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "singleCoreCantAttack",
    )
    const entry = entryOf(
        sands,
        (e) => e["kind"] === "globalConstraint" && (e["constraint"] as Record<string, unknown>)?.["type"] === "singleCoreCantAttack",
    )
    const level = (entry["levels"] as number[])[0]!

    // コア1個のスピリットはアタックできない（両陣営に効く。所有者を問わず判定される）
    const s = base("sands-cantattack")
    s.turnPlayer = "p2"
    s.phase = "attack"
    putNexus(s, "p1", sands.cardId, coresFor(sands, level))
    const oneCore = put(s, "p2", FILLER.cardId, 1)
    assert(act(s, "p2", { type: "attack", instanceId: oneCore.instanceId }) !== null, "コア1個のスピリットはアタックできない")

    // コア2個ならアタックできる（対照実験）
    const s2 = base("sands-canattack")
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    putNexus(s2, "p1", sands.cardId, coresFor(sands, level))
    const twoCore = put(s2, "p2", FILLER.cardId, 2)
    assert(act(s2, "p2", { type: "attack", instanceId: twoCore.instanceId }) === null, "対照実験：コア2個ならアタックできる")

    // コア1個でもブロックはできる（singleCoreCantActと違いブロックには効かない）
    const s3 = base("sands-canblock")
    putNexus(s3, "p1", sands.cardId, coresFor(sands, level))
    const attacker = put(s3, "p1", FILLER.cardId, coresFor(FILLER, 1) + 1)
    const blocker = put(s3, "p2", FILLER.cardId, 1)
    assert(act(s3, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s3, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s3, "p2", blocker.instanceId) === null, "対照実験：コア1個でもブロックはできる")
}

console.log("=== BS08闇帝竜騎サブナ・ルーク：coreRemoveMulti.keywordExclude（【転召】を持たない相手すべて） ===")
{
    const sabna = findByEffect(
        (e) =>
            e["kind"] === "fieldEvent" &&
            e["event"] === "anySpiritAttacked" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "coreRemoveMulti" &&
            (e["action"] as Record<string, unknown>)["keywordExclude"] !== undefined,
    )
    const entry = entryOf(
        sabna,
        (e) => e["kind"] === "fieldEvent" && (e["action"] as Record<string, unknown> | undefined)?.["type"] === "coreRemoveMulti",
    )
    const level = (entry["levels"] as number[])[0]!
    const family = String(entry["familyFilter"])
    const attackerCard = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(family))!
    const withTensho = CARDS.find((c) => c.type === "spirit" && hasKeyword(c.cardId, "tensho"))!
    const withoutTensho = FILLER

    const s = base("sabna")
    put(s, "p1", sabna.cardId, coresFor(sabna, level))
    const attacker = put(s, "p1", attackerCard.cardId, coresFor(attackerCard, 1))
    const withT = put(s, "p2", withTensho.cardId, coresFor(withTensho, 1) + 1)
    const withoutT = put(s, "p2", withoutTensho.cardId, coresFor(withoutTensho, 1) + 1)
    const withTBefore = withT.cores
    const withoutTBefore = withoutT.cores
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `系統「${family}」でアタック宣言`)
    assert(withT.cores === withTBefore, "【転召】を持つ相手は対象から除外される")
    assert(withoutT.cores === withoutTBefore - 1, "【転召】を持たない相手はコア1個をリザーブに置かれる")
}

console.log("=== BS08アンドレアルファス：summonFromTrashFree.nameIncludes（カード名に「勇者」） ===")
{
    const andre = findByEffect(
        (e) =>
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "summonFromTrashFree" &&
            (e["action"] as Record<string, unknown>)["nameIncludes"] !== undefined,
    )
    const entry = entryOf(
        andre,
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "summonFromTrashFree",
    )
    const level = (entry["levels"] as number[])[0]!
    const nameIncludes = String((entry["action"] as Record<string, unknown>)["nameIncludes"])
    const target = CARDS.find((c) => c.type === "spirit" && c.name.includes(nameIncludes))!
    const outsider = FILLER

    const s = base("andre")
    put(s, "p1", andre.cardId, coresFor(andre, level))
    s.players.p1.trashCards.push(outsider.cardId, target.cardId)
    s.phase = "end"
    fireStepTriggers(s, "end")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === target.cardId),
        `カード名に「${nameIncludes}」を含む${target.name}がトラッシュから召喚される`,
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === outsider.cardId),
        "対照実験：カード名が一致しないカードは召喚されない",
    )
}

console.log("=== BS08ターンインフェルノ：recoverSpiritFromTrash.keywordFilter（【転召】持ち） ===")
{
    const inferno = findByEffect(
        (e) =>
            e["kind"] === "magic" &&
            e["timing"] === "main" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "recoverSpiritFromTrash" &&
            (e["action"] as Record<string, unknown>)["keywordFilter"] !== undefined,
    )
    const entry = entryOf(inferno, (e) => e["kind"] === "magic" && e["timing"] === "main")
    const kw = String((entry["action"] as Record<string, unknown>)["keywordFilter"])
    const withKw = CARDS.find((c) => c.type === "spirit" && hasKeyword(c.cardId, kw as never))!
    const withoutKw = FILLER

    const s = base("inferno")
    s.players.p1.trashCards.push(withoutKw.cardId, withKw.cardId)
    s.players.p1.hand.push(inferno.cardId)
    assert(act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null, "使用")
    assert(s.players.p1.hand.includes(withKw.cardId), "【転召】持ちがトラッシュから手札に戻る")
    assert(s.players.p1.trashCards.includes(withoutKw.cardId), "対照実験：【転召】を持たないカードは残る")
}

console.log("=== BS08冥将アマイモン：millUntilFamilyToHand（系統が出るまで破棄・上限あり） ===")
{
    const amaimon = findByEffect(
        (e) =>
            e["kind"] === "triggered" &&
            e["trigger"] === "onDestroy" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "millUntilFamilyToHand",
    )
    const entry = entryOf(amaimon, (e) => e["kind"] === "triggered" && e["trigger"] === "onDestroy")
    const level = (entry["levels"] as number[])[0]!
    const family = String((entry["action"] as Record<string, unknown>)["family"])
    const maxCount = Number((entry["action"] as Record<string, unknown>)["maxCount"])
    const matchCard = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(family))!
    const filler = CARDS.find((c) => c.cardId === FILLER.cardId)!

    const s = base("amaimon-found")
    const inst = put(s, "p1", amaimon.cardId, coresFor(amaimon, level))
    s.players.p1.deck = [filler.cardId, filler.cardId, matchCard.cardId, ...s.players.p1.deck]
    destroySpirit(s, "p1", inst.instanceId, "destroy", { sourcePid: "p2" })
    assert(
        s.players.p1.hand.includes(matchCard.cardId),
        `系統「${family}」を持つ${matchCard.name}が出るまで破棄し、手札に戻す`,
    )
    assert(
        s.players.p1.trashCards.filter((id) => id === filler.cardId).length === 2,
        "系統が出るまでの2枚はトラッシュに残る",
    )

    const s2 = base("amaimon-notfound")
    const inst2 = put(s2, "p1", amaimon.cardId, coresFor(amaimon, level))
    s2.players.p1.deck = [...Array(maxCount).fill(filler.cardId), ...s2.players.p1.deck]
    const handBefore2 = s2.players.p1.hand.length
    destroySpirit(s2, "p1", inst2.instanceId, "destroy", { sourcePid: "p2" })
    assert(
        s2.players.p1.hand.length === handBefore2,
        `対照実験：上限${maxCount}枚以内に系統が出なければ手札は増えない`,
    )
}

console.log("=== BS08マインドブレイク：costOwnSpiritCoresToTrashThenOpponent（コストを払えたときだけ相手も支払う） ===")
{
    const mindbreak = findByEffect(
        (e) =>
            e["kind"] === "magic" &&
            e["timing"] === "main" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "costOwnSpiritCoresToTrashThenOpponent",
    )
    const entry = entryOf(mindbreak, (e) => e["kind"] === "magic" && e["timing"] === "main")
    const count = Number((entry["action"] as Record<string, unknown>)["count"])

    const s = base("mindbreak-pay")
    s.players.p1.hand.push(mindbreak.cardId)
    const p1a = put(s, "p1", FILLER.cardId, 3)
    const p1b = put(s, "p1", FILLER.cardId, 3)
    const p2a = put(s, "p2", FILLER.cardId, 3)
    const p2b = put(s, "p2", FILLER.cardId, 3)
    assert(
        act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null,
        "使用（自分のスピリットからコアを払える）",
    )
    assert(p1a.cores + p1b.cores === 6 - count, `自分のスピリットからコア${count}個をトラッシュへ`)
    assert(p2a.cores + p2b.cores === 6 - count, `相手のスピリットからもコア${count}個をトラッシュへ`)

    const s2 = base("mindbreak-insufficient")
    s2.players.p1.hand.push(mindbreak.cardId)
    const p1c = put(s2, "p1", FILLER.cardId, 2)
    const p2c = put(s2, "p2", FILLER.cardId, 3)
    assert(
        act(s2, "p1", { type: "castMagic", handIndex: s2.players.p1.hand.length - 1 }) === null,
        "使用（自分のスピリットのコアが足りない）",
    )
    assert(p1c.cores === 2 && p2c.cores === 3, "対照実験：自分が払えなければ相手も無傷のまま")
}

console.log("=== BS08魔界七将アスモディオス：ownTenshoのnameIncludes（eventInfo.names経由） ===")
{
    const asmodeus = findByEffect(
        (e) =>
            e["kind"] === "fieldEvent" &&
            e["event"] === "ownTensho" &&
            Array.isArray(e["nameIncludes"]) &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "discardOpponent",
    )
    const entry = entryOf(asmodeus, (e) => e["kind"] === "fieldEvent" && e["event"] === "ownTensho")
    const names = entry["nameIncludes"] as string[]
    const tenshoEntry = entryOf(asmodeus, (e) => e["kind"] === "keyword" && e["keyword"] === "tensho")
    const minCost = Number(tenshoEntry["minCost"] ?? 0)
    const matchCard = CARDS.find((c) => c.name === names[0])!
    const otherCard = CARDS.find(
        (c) => c.type === "spirit" && c.cardId !== asmodeus.cardId && !names.includes(c.name) && (c.cost ?? 0) >= minCost,
    )!

    const s = base("asmodeus-match")
    s.players.p1.hand = [asmodeus.cardId]
    put(s, "p1", matchCard.cardId, coresFor(matchCard, 1))
    for (let i = 0; i < 5; i++) s.players.p2.hand.push(FILLER.cardId)
    const p2HandBefore = s.players.p2.hand.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, `${asmodeus.name}を召喚（【転召】は${matchCard.name}）`)
    assert(s.players.p2.hand.length === p2HandBefore - 4, `[${names.join("]/[")}]で【転召】したとき、相手は手札4枚を破棄する`)

    const s2 = base("asmodeus-other")
    s2.players.p1.hand = [asmodeus.cardId]
    put(s2, "p1", otherCard.cardId, coresFor(otherCard, 1))
    for (let i = 0; i < 5; i++) s2.players.p2.hand.push(FILLER.cardId)
    const p2HandBefore2 = s2.players.p2.hand.length
    assert(act(s2, "p1", { type: "summon", handIndex: 0 }) === null, `${asmodeus.name}を召喚（【転召】は${otherCard.name}）`)
    assert(s2.players.p2.hand.length === p2HandBefore2, "対照実験：指定カード以外で【転召】しても追加の破棄は起きない")
}

console.log("=== BS08冥蛇士ボティス：onSummon(draw1)＋ownTensho(draw2)の加算＝系統「冥主」で転召すると3枚 ===")
{
    const botis = findByEffect(
        (e) =>
            e["kind"] === "fieldEvent" &&
            e["event"] === "ownTensho" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "draw" &&
            Number((e["action"] as Record<string, unknown>)["count"]) === 2,
    )
    const tenshoEntry = entryOf(botis, (e) => e["kind"] === "keyword" && e["keyword"] === "tensho")
    const minCost = Number(tenshoEntry["minCost"] ?? 0)
    const tenshoFamilyEntry = entryOf(botis, (e) => e["kind"] === "fieldEvent" && e["event"] === "ownTensho")
    const family = String(tenshoFamilyEntry["familyFilter"])
    const sacrificeMatch = CARDS.find(
        (c) => c.type === "spirit" && c.cardId !== botis.cardId && (c.family ?? []).includes(family) && (c.cost ?? 0) >= minCost,
    )!
    const sacrificeOther = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.cardId !== botis.cardId &&
            !(c.family ?? []).includes(family) &&
            (c.cost ?? 0) >= minCost &&
            c.cardId !== sacrificeMatch.cardId,
    )!

    const s = base("botis-draw3")
    s.players.p1.hand = [botis.cardId]
    put(s, "p1", sacrificeMatch.cardId, coresFor(sacrificeMatch, 1))
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, `${botis.name}を召喚（【転召】は系統「${family}」）`)
    assert(deckBefore - s.players.p1.deck.length === 3, "系統「冥主」で【転召】したとき、ドローが3枚になる（1+2）")

    const s2 = base("botis-draw1")
    s2.players.p1.hand = [botis.cardId]
    put(s2, "p1", sacrificeOther.cardId, coresFor(sacrificeOther, 1))
    const deckBefore2 = s2.players.p1.deck.length
    assert(act(s2, "p1", { type: "summon", handIndex: 0 }) === null, `${botis.name}を召喚（【転召】は系統「${family}」以外）`)
    assert(deckBefore2 - s2.players.p1.deck.length === 1, "対照実験：系統が違うと通常のドロー1枚のまま")
}
