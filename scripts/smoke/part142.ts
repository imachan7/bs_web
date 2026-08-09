// smoke パート142（第七弾 白バッチ：新要素の発揮確認）
//
// 白14枚が持ち込んだ新要素を**実カードデータ経由**で確かめる:
//   lifeDamageMillGuard（デッキを1枚破棄してライフを守る）／
//   blockTriggersAsAttackGrant と blockTriggersAsAttackTargetThisTurn（『ブロック時』→『アタック時』）／
//   unblockableBy の maxBp ／ noRestWhenBlockingWithoutKeyword ／
//   returnToDeckTop の count ／ selfCoreToOwnLife
//
// カードIDは直書きせず、**カードデータから条件で引いて**使う（IDズレ事故の予防）。
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    destroyNexus,
    refreshLevelAsOverrides,
    resolveAction,
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
    colors?: string[]
    family?: string[]
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

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
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
function resolveBattle(s: GameState): void {
    let guard = 0
    while (s.battle && guard++ < 10) {
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
}

const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)!

console.log("=== BS07 白：デッキを1枚破棄し、白のマジックならライフが減らない（六花の司書長サーガ） ===")
{
    const saga = findByEffect((e) => e["kind"] === "lifeDamageMillGuard")
    const lv1Entry = entryOf(
        saga,
        (e) => e["kind"] === "lifeDamageMillGuard" && (e["levels"] as number[]).includes(1),
    )
    const match = (lv1Entry["match"] as Record<string, unknown>) as { color: string; cardType: string }
    const guardCard = CARDS.find(
        (c) => c.type === match.cardType && (c.colors ?? []).includes(match.color),
    )!
    const otherCard = CARDS.find(
        (c) => c.type !== match.cardType && (c.levels?.[0]?.cores ?? 99) === 1,
    )!

    // デッキの上が条件に合うとき：ライフが減らない
    const s = base("saga-guard")
    put(s, "p1", saga.cardId, coresFor(saga, 1))
    const attacker = put(s, "p2", FILLER.cardId, 1)
    s.players.p1.deck.unshift(guardCard.cardId)
    s.turnPlayer = "p2"
    s.phase = "main"
    const lifeBefore = s.players.p1.life
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける宣言")
    assert(
        s.players.p1.life === lifeBefore,
        `デッキの上が${match.color}の${match.cardType}（${guardCard.name}）ならライフが減らない`,
    )
    assert(s.players.p1.trashCards.includes(guardCard.cardId), "破棄した1枚はトラッシュへ置かれる（Lv1）")

    // 条件に合わないとき：通常どおりライフが減る
    const s2 = base("saga-miss")
    put(s2, "p1", saga.cardId, coresFor(saga, 1))
    const attacker2 = put(s2, "p2", FILLER.cardId, 1)
    s2.players.p1.deck.unshift(otherCard.cardId)
    s2.turnPlayer = "p2"
    s2.phase = "main"
    const life2 = s2.players.p1.life
    assert(act(s2, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s2, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "p2 がアタック")
    assert(takeLifeAndResolve(s2, "p1") === null, "ライフで受ける宣言")
    assert(s2.players.p1.life < life2, `対照実験：条件に合わない${otherCard.name}ならライフは減る`)
}
{
    // Lv2以上：破棄したカードがマジックなら手札に加える
    const saga = findByEffect((e) => e["kind"] === "lifeDamageMillGuard" && e["keepToHandIfType"] !== undefined)
    const entry = entryOf(saga, (e) => e["kind"] === "lifeDamageMillGuard" && e["keepToHandIfType"] !== undefined)
    const level = (entry["levels"] as number[])[0]!
    const keepType = String(entry["keepToHandIfType"])
    const magicCard = CARDS.find((c) => c.type === keepType)!

    const s = base("saga-keep")
    put(s, "p1", saga.cardId, coresFor(saga, level))
    const attacker = put(s, "p2", FILLER.cardId, 1)
    s.players.p1.deck.unshift(magicCard.cardId)
    s.turnPlayer = "p2"
    s.phase = "main"
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける宣言")
    assert(s.players.p1.hand.length === handBefore + 1, `破棄した${keepType}カードが手札に加わる`)
    assert(!s.players.p1.trashCards.includes(magicCard.cardId), "トラッシュには置かれない")
}

console.log("=== BS07 白：『ブロック時』効果をアタック時に発揮させる（大械獣ギガ・テリウム） ===")
{
    const giga = findByEffect((e) => e["kind"] === "blockTriggersAsAttackGrant")
    const grant = entryOf(giga, (e) => e["kind"] === "blockTriggersAsAttackGrant")
    const families = grant["familyFilter"] as string[]
    // 『ブロック時』にBP+するスピリット（該当系統）を用意する
    const blockBuffer = findByEffect(
        (e, c) =>
            c.type === "spirit" &&
            families.some((f) => (c.family ?? []).includes(f)) &&
            e["kind"] === "triggered" &&
            e["trigger"] === "onBlock" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "selfBuff",
    )
    const bufferEntry = entryOf(blockBuffer, (e) => e["kind"] === "triggered" && e["trigger"] === "onBlock")
    const bufferLevel = ((bufferEntry["levels"] as number[] | null) ?? [1])[0]!
    const amount = Number((bufferEntry["action"] as Record<string, unknown>)["amount"])

    const s = base("giga-shift")
    put(s, "p1", giga.cardId, coresFor(giga, 1))
    const attacker = put(s, "p1", blockBuffer.cardId, coresFor(blockBuffer, bufferLevel))
    put(s, "p2", FILLER.cardId, 1)
    const raw = 0
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${blockBuffer.name}がアタック`)
    assert(
        attacker.tempBpBuff === raw + amount,
        `『ブロック時』のBP+${amount}がアタック時に発揮される（実際+${attacker.tempBpBuff}）`,
    )

    // 対照実験：付与元がなければアタック時には発揮しない
    const s2 = base("giga-shift-off")
    const attacker2 = put(s2, "p1", blockBuffer.cardId, coresFor(blockBuffer, bufferLevel))
    put(s2, "p2", FILLER.cardId, 1)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "アタック")
    assert(attacker2.tempBpBuff === 0, "対照実験：付与元がなければアタック時には発揮しない")
}

console.log("=== BS07 白：指定した1体の『ブロック時』効果をアタック時に移す（マクラーンスラッシュ） ===")
{
    const maclean = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "blockTriggersAsAttackTargetThisTurn",
    )
    const blockBuffer = findByEffect(
        (e, c) =>
            c.type === "spirit" &&
            e["kind"] === "triggered" &&
            e["trigger"] === "onBlock" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "selfBuff",
    )
    const bufferEntry = entryOf(blockBuffer, (e) => e["kind"] === "triggered" && e["trigger"] === "onBlock")
    const bufferLevel = ((bufferEntry["levels"] as number[] | null) ?? [1])[0]!
    const amount = Number((bufferEntry["action"] as Record<string, unknown>)["amount"])

    const s = base("maclean")
    const attacker = put(s, "p1", blockBuffer.cardId, coresFor(blockBuffer, bufferLevel))
    put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand.push(maclean.cardId)
    assert(
        act(s, "p1", {
            type: "castMagic",
            handIndex: s.players.p1.hand.length - 1,
            targetInstanceId: attacker.instanceId,
        }) === null,
        `${maclean.name}をメインで使用`,
    )
    assert(attacker.blockTriggersAsAttackThisTurn === true, "指定した1体に印が付く")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(attacker.tempBpBuff === amount, `『ブロック時』のBP+${amount}がアタック時に発揮される`)
}

console.log("=== BS07 白：BP4000以下の相手からブロックされない（鋼翼魚オルカノン） ===")
{
    const orca = findByEffect(
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["maxBp"] !== undefined,
    )
    const grant = entryOf(orca, (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["maxBp"] !== undefined)
    const maxBp = Number((grant["constraint"] as Record<string, unknown>)["maxBp"])
    const family = String(grant["familyFilter"])
    const level = (grant["levels"] as number[])[0]!
    const attackerCard = CARDS.find(
        (c) => c.type === "spirit" && c.cardId !== orca.cardId && (c.family ?? []).includes(family),
    )!
    const weak = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.levels?.[0]?.cores ?? 99) === 1 &&
            (c.levels?.[0]?.bp ?? 99999) <= maxBp,
    )!
    const strong = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.levels?.[0]?.cores ?? 99) === 1 &&
            (c.levels?.[0]?.bp ?? 0) > maxBp,
    )!

    const s = base("orca-unblockable")
    // 付与元（オルカノン）を条件が有効になるレベルで立てる。アタッカーは同じ系統の別カードでよい
    put(s, "p1", orca.cardId, coresFor(orca, level))
    const attacker = put(s, "p1", attackerCard.cardId, coresFor(attackerCard, 1))
    const weakBlocker = put(s, "p2", weak.cardId, 1)
    const strongBlocker = put(s, "p2", strong.cardId, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "自分のアタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", weakBlocker.instanceId) !== null, `BP${maxBp}以下ではブロックできない`)
    assert(
        declareBlock(s, "p2", strongBlocker.instanceId) === null,
        `対照実験：BPが上回る${strong.name}ならブロックできる`,
    )
}

console.log("=== BS07 白：【転召】を持たない相手をブロックしても疲労しない（ブリシンガメンの首飾り） ===")
{
    const necklace = findByEffect(
        (e) =>
            (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "noRestWhenBlockingWithoutKeyword",
    )
    const grant = entryOf(necklace, (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "noRestWhenBlockingWithoutKeyword")
    const kw = String((grant["constraint"] as Record<string, unknown>)["keyword"])
    const nexusCores = coresFor(necklace, (grant["levels"] as number[])[0]!)
    const withKw = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === kw) &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )!

    // p2 のターン（＝ネクサスの持ち主 p1 から見て『相手のアタックステップ』）にブロックする
    const s = base("necklace")
    putNexus(s, "p1", necklace.cardId, nexusCores)
    const blocker = put(s, "p1", FILLER.cardId, 1)
    const attacker = put(s, "p2", FILLER.cardId, 1)
    s.turnPlayer = "p2"
    s.phase = "main"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "ブロック")
    resolveBattle(s)
    assert(!blocker.isRested, `【${kw}】を持たない相手をブロックしたので疲労しない`)

    // 対照実験：【転召】持ちをブロックすると疲労する
    const s2 = base("necklace-tensho")
    putNexus(s2, "p1", necklace.cardId, nexusCores)
    const blocker2 = put(s2, "p1", FILLER.cardId, 1)
    const attacker2 = put(s2, "p2", withKw.cardId, coresFor(withKw, 1))
    s2.turnPlayer = "p2"
    s2.phase = "main"
    assert(act(s2, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s2, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "p2 がアタック")
    assert(declareBlock(s2, "p1", blocker2.instanceId) === null, "ブロック")
    resolveBattle(s2)
    assert(blocker2.isRested, `対照実験：【${kw}】持ちをブロックすると疲労する`)
}

console.log("=== BS07 白：ネクサス破壊で相手のスピリット3体をデッキの上へ戻す（ブリシンガメンの首飾り） ===")
{
    const necklace = findByEffect(
        (e) =>
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "returnToDeckTop" &&
            (e["action"] as Record<string, unknown>)["count"] !== undefined,
    )
    const count = Number(
        (entryOf(necklace, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "returnToDeckTop")[
            "action"
        ] as Record<string, unknown>)["count"],
    )
    const s = base("necklace-bounce")
    putNexus(s, "p1", necklace.cardId, 0)
    const victimNexus = putNexus(s, "p1", CARDS.find((c) => c.type === "nexus" && c.cardId !== necklace.cardId)!.cardId, 0)
    for (let i = 0; i < count + 1; i++) put(s, "p2", FILLER.cardId, 1)
    const deckBefore = s.players.p2.deck.length
    destroyNexus(s, "p1", victimNexus.instanceId)
    assert(
        s.players.p2.field.spirits.length === 1,
        `相手のスピリット${count}体がデッキへ戻る（残り${s.players.p2.field.spirits.length}体）`,
    )
    assert(s.players.p2.deck.length === deckBefore + count, `相手のデッキが${count}枚増える`)
}

console.log("=== BS07 白：ブロックしたスピリットのコアを自分のライフに置く（ライフセービング） ===")
{
    const saving = findByEffect(
        (e) =>
            ((e["granted"] as Record<string, unknown> | undefined)?.["action"] as Record<string, unknown> | undefined)?.[
                "type"
            ] === "selfCoreToOwnLife",
    )
    const grant = entryOf(saving, (e) => e["kind"] === "effectGrant")
    const family = String(grant["familyFilter"])
    const blockerCard = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes(family) && (c.levels?.[0]?.cores ?? 99) === 1,
    )!

    const s = base("life-saving")
    const blocker = put(s, "p1", blockerCard.cardId, 3)
    const attacker = put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand.push(saving.cardId)
    s.turnPlayer = "p2"
    s.phase = "main"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null,
        `${saving.name}をフラッシュで使用`,
    )
    const lifeBefore = s.players.p1.life
    const coresBefore = blocker.cores
    assert(declareBlock(s, "p1", blocker.instanceId) === null, `系統「${family}」でブロック`)
    assert(
        s.players.p1.life === lifeBefore + 1 && blocker.cores === coresBefore - 1,
        `ブロックしたスピリットのコア1個が自分のライフへ（ライフ${lifeBefore}→${s.players.p1.life} / コア${coresBefore}→${blocker.cores}）`,
    )
}
