// smoke パート141（第七弾 紫バッチ：新要素の発揮確認）
//
// 紫14枚が持ち込んだ新要素を**実カードデータ経由**で確かめる:
//   opponentHandToDeckTop ／ fireOwnDestroyTriggers ／ coreRemoveMulti の allTargets ／
//   summonFromTrashFree の familyFilter ／ recoverSpiritFromTrash の costDestroyOwnKeyword ／
//   reviveOnDestroy の millSelfOneMatching と fireDestroyTriggerFirst ／
//   globalConstraint の levelCantAct
//
// カードIDは直書きせず、**カードデータから条件で引いて**使う（IDズレ事故の予防）。
import {
    act,
    assert,
    createGame,
    createInstance,
    destroyNexus,
    destroySpirit,
    fireStepTriggers,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
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
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
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

const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)!

console.log("=== BS07 紫：破壊時に相手の手札1枚をデッキの上へ戻させる（魔札の占い師ディーシャ） ===")
{
    const seer = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "opponentHandToDeckTop",
    )
    const entry = entryOf(seer, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "opponentHandToDeckTop")
    const level = (entry["levels"] as number[])[0]!

    const s = base("hand-to-deck")
    const inst = put(s, "p1", seer.cardId, coresFor(seer, level))
    s.players.p2.hand = [FILLER.cardId, FILLER.cardId]
    const handBefore = s.players.p2.hand.length
    const deckBefore = s.players.p2.deck.length
    destroySpirit(s, "p1", inst.instanceId)
    assert(s.players.p2.hand.length === handBefore - 1, `相手の手札が1枚減る（${handBefore}→${s.players.p2.hand.length}）`)
    assert(s.players.p2.deck.length === deckBefore + 1, "相手のデッキが1枚増える")
    assert(s.players.p2.deck[0] === FILLER.cardId, "戻ったカードはデッキの一番上にある")

    // 対照実験：レベル条件を満たさなければ発揮しない
    const s2 = base("hand-to-deck-level")
    const inst2 = put(s2, "p1", seer.cardId, coresFor(seer, 1))
    s2.players.p2.hand = [FILLER.cardId]
    const before2 = s2.players.p2.hand.length
    destroySpirit(s2, "p1", inst2.instanceId)
    assert(s2.players.p2.hand.length === before2, "対照実験：Lv1では発揮しない")
}

console.log("=== BS07 紫：自分のスピリットすべての『破壊時』効果を、破壊させずに発揮させる（女教皇リル・サキュバス） ===")
{
    const pope = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "fireOwnDestroyTriggers",
    )
    // 『破壊時』効果が観測しやすいカード（コア除去）を隣に置く。
    // レベル条件があるので、そのエントリが有効になるレベルで立てる
    const bat = findByEffect(
        (e, c) =>
            c.type === "spirit" &&
            e["kind"] === "triggered" &&
            e["trigger"] === "onDestroy" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "coreRemove",
    )
    const batEntry = entryOf(bat, (e) => e["kind"] === "triggered" && e["trigger"] === "onDestroy")
    const batLevel = ((batEntry["levels"] as number[] | null) ?? [1])[0]!
    const s = base("fire-destroy-triggers")
    const src = put(s, "p1", pope.cardId, 1)
    const helper = put(s, "p1", bat.cardId, coresFor(bat, batLevel))
    const enemy = put(s, "p2", FILLER.cardId, 3)
    const coresBefore = enemy.cores
    resolveAction(s, "p1", src, { type: "fireOwnDestroyTriggers" })
    assert(enemy.cores === coresBefore - 1, `${bat.name}の『破壊時』効果が発揮し相手のコアが減る（${coresBefore}→${enemy.cores}）`)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === helper.instanceId),
        `${bat.name}は破壊されずフィールドに残る`,
    )
}

console.log("=== BS07 紫：ネクサス破壊で相手のスピリットすべてからコアを1個ずつ取り除く（腐りゆく湖沼） ===")
{
    const swamp = findByEffect(
        (e) =>
            ((e["action"] as Record<string, unknown> | undefined)?.["allTargets"] as boolean | undefined) === true,
    )
    const s = base("core-remove-all")
    putNexus(s, "p1", swamp.cardId, 0)
    const victimNexus = putNexus(s, "p1", CARDS.find((c) => c.type === "nexus" && c.cardId !== swamp.cardId)!.cardId, 0)
    const a = put(s, "p2", FILLER.cardId, 3)
    const b = put(s, "p2", FILLER.cardId, 2)
    const trashBefore = s.players.p2.trashCores
    // 発生源つきで破壊する：この誘発は「**相手の**スピリット/ネクサス/マジックの効果で
    // 破壊されたとき」限定（byOpponentEffectOnly）なので、相手(p2)の効果として渡す
    destroyNexus(s, "p1", victimNexus.instanceId, { sourcePid: "p2", sourceType: "magic" })
    assert(a.cores === 2 && b.cores === 1, `相手のスピリット全員からコアが1個ずつ減る（${a.cores}/${b.cores}）`)
    assert(s.players.p2.trashCores === trashBefore + 2, "取り除いたコアは相手のトラッシュへ置かれる")
}

console.log("=== BS07 紫：Lv1のスピリットはアタックもブロックもできない（腐りゆく湖沼Lv2） ===")
{
    const swamp = findByEffect(
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "levelCantAct",
    )
    const entry = entryOf(swamp, (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "levelCantAct")
    const lockedLevels = (entry["constraint"] as Record<string, unknown>)["levels"] as number[]
    const nexusCores = coresFor(swamp, (entry["levels"] as number[])[0]!)
    // Lv2まで育てられるバニラ（Lv1で止めた個体と、Lv2に上げた個体を比べる）
    const growable = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.levels?.length ?? 0) >= 2 &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )!
    const s = base("level-cant-act")
    putNexus(s, "p1", swamp.cardId, nexusCores)
    const lv1 = put(s, "p1", growable.cardId, 1)
    const lv2 = put(s, "p1", growable.cardId, growable.levels?.[1]?.cores ?? 2)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: lv1.instanceId }) !== null,
        `Lv${lockedLevels.join("/")}のスピリットはアタックできない`,
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: lv2.instanceId }) === null,
        "対照実験：レベルが条件から外れていればアタックできる",
    )
}

console.log("=== BS07 紫：【呪撃】持ちを破壊してトラッシュから回収する（ブリュナグオン） ===")
{
    const bruna = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["costDestroyOwnKeyword"] !== undefined,
    )
    const action = entryOf(bruna, (e) => (e["action"] as Record<string, unknown> | undefined)?.["costDestroyOwnKeyword"] !== undefined)[
        "action"
    ] as Record<string, unknown>
    const kw = String(action["costDestroyOwnKeyword"])
    const families = action["familyFilter"] as string[]
    const jugekiSpirit = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === kw) &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )!
    const recoverable = CARDS.find(
        (c) => c.type === "spirit" && families.some((f) => (c.family ?? []).includes(f)),
    )!

    const s = base("brunagon")
    const src = put(s, "p1", bruna.cardId, 1)
    const sacrifice = put(s, "p1", jugekiSpirit.cardId, 1)
    s.players.p1.trashCards.push(recoverable.cardId)
    resolveAction(s, "p1", src, {
        type: "recoverSpiritFromTrash",
        count: 1,
        familyFilter: families,
        costDestroyOwnKeyword: kw as never,
    })
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === sacrifice.instanceId),
        `コストとして【${kw}】持ちの${jugekiSpirit.name}が破壊される`,
    )
    assert(s.players.p1.hand.includes(recoverable.cardId), `${recoverable.name}を手札に戻す`)

    // 対照実験：【呪撃】持ちがいなければ不発（回収も起きない）
    const s2 = base("brunagon-no-cost")
    const src2 = put(s2, "p1", bruna.cardId, 1)
    s2.players.p1.trashCards.push(recoverable.cardId)
    resolveAction(s2, "p1", src2, {
        type: "recoverSpiritFromTrash",
        count: 1,
        familyFilter: families,
        costDestroyOwnKeyword: kw as never,
    })
    assert(!s2.players.p1.hand.includes(recoverable.cardId), `対照実験：【${kw}】持ちがいなければ回収しない`)
}

console.log("=== BS07 紫：デッキを1枚破棄し、紫のスピリットなら回復状態で残る（冥勇士デスカラビア） ===")
{
    const carabia = findByEffect(
        (e) => (e["cost"] as Record<string, unknown> | undefined)?.["millSelfOneMatching"] !== undefined,
    )
    const spec = (entryOf(carabia, (e) => (e["cost"] as Record<string, unknown> | undefined)?.["millSelfOneMatching"] !== undefined)[
        "cost"
    ] as Record<string, unknown>)["millSelfOneMatching"] as { color: string; cardType: string }
    const matching = CARDS.find(
        (c) => c.type === spec.cardType && (c.colors ?? []).includes(spec.color),
    )!
    const notMatching = CARDS.find(
        (c) => c.type === spec.cardType && !(c.colors ?? []).includes(spec.color),
    )!

    // デッキの一番上が条件に合うとき：破壊されず回復状態で残る
    const s = base("carabia-hit")
    const inst = put(s, "p1", carabia.cardId, 1)
    inst.isRested = true
    s.players.p1.deck.unshift(matching.cardId)
    destroySpirit(s, "p1", inst.instanceId)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === inst.instanceId),
        `デッキの上が${spec.color}の${spec.cardType}（${matching.name}）なら場に残る`,
    )
    assert(!inst.isRested, "回復状態で残る")
    assert(s.players.p1.trashCards.includes(matching.cardId), "破棄した1枚はトラッシュへ置かれる")

    // 条件に合わないとき：通常どおり破壊される
    const s2 = base("carabia-miss")
    const inst2 = put(s2, "p1", carabia.cardId, 1)
    s2.players.p1.deck.unshift(notMatching.cardId)
    destroySpirit(s2, "p1", inst2.instanceId)
    assert(
        !s2.players.p1.field.spirits.some((sp) => sp.instanceId === inst2.instanceId),
        `対照実験：条件に合わない${notMatching.name}なら破壊される`,
    )
}

console.log("=== BS07 紫：相手の効果で破壊されたとき、破壊時効果を発揮してから手札に戻る（ブラックリチュアル） ===")
{
    const ritual = findByEffect(
        (e) => e["kind"] === "reviveOnDestroy" && e["fireDestroyTriggerFirst"] === true,
    )
    // 『破壊時』効果を持つ自分のスピリット（効果が発揮されたことを観測する）
    const withTrigger = findByEffect(
        (e, c) =>
            c.type === "spirit" &&
            e["kind"] === "triggered" &&
            e["trigger"] === "onDestroy" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "coreRemove",
    )
    const triggerEntry = entryOf(withTrigger, (e) => e["kind"] === "triggered" && e["trigger"] === "onDestroy")
    const triggerLevel = ((triggerEntry["levels"] as number[] | null) ?? [1])[0]!
    const s = base("black-ritual")
    const mine = put(s, "p1", withTrigger.cardId, coresFor(withTrigger, triggerLevel))
    const enemy = put(s, "p2", FILLER.cardId, 3)
    s.players.p1.hand.push(ritual.cardId)
    assert(
        act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null,
        `${ritual.name}をメインで使用`,
    )
    const coresBefore = enemy.cores
    const handBefore = s.players.p1.hand.length
    // 相手（p2）の効果として破壊する
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    assert(enemy.cores === coresBefore - 1, "『破壊時』効果が先に発揮される")
    assert(s.players.p1.hand.length === handBefore + 1, "そのあとカードが手札に戻る")
    assert(!s.players.p1.trashCards.includes(withTrigger.cardId), "トラッシュには置かれない")

    // 対照実験：自分の効果による破壊では戻らない（when.byOpponentEffect）
    const s2 = base("black-ritual-own")
    const mine2 = put(s2, "p1", withTrigger.cardId, coresFor(withTrigger, triggerLevel))
    s2.players.p1.hand.push(ritual.cardId)
    assert(act(s2, "p1", { type: "castMagic", handIndex: s2.players.p1.hand.length - 1 }) === null, "使用")
    destroySpirit(s2, "p1", mine2.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })
    assert(
        s2.players.p1.trashCards.includes(withTrigger.cardId),
        "対照実験：自分の効果による破壊では手札に戻らない",
    )
}

console.log("=== BS07 紫：エンドステップにトラッシュの「夜族」を召喚する（常闇の聖堂） ===")
{
    const cathedral = findByEffect(
        (e) =>
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "summonFromTrashFree" &&
            (e["action"] as Record<string, unknown>)["familyFilter"] !== undefined,
    )
    const action = entryOf(cathedral, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "summonFromTrashFree")[
        "action"
    ] as Record<string, unknown>
    const family = String(action["familyFilter"])
    const maxCost = Number((action["costFilter"] as Record<string, unknown>)["max"])
    const target = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes(family) && (c.cost ?? 99) <= maxCost,
    )!
    const outsider = CARDS.find(
        (c) => c.type === "spirit" && !(c.family ?? []).includes(family) && (c.cost ?? 99) <= maxCost,
    )!

    const s = base("cathedral")
    putNexus(s, "p1", cathedral.cardId, 0)
    s.players.p1.trashCards.push(outsider.cardId, target.cardId)
    s.phase = "end"
    fireStepTriggers(s, "end")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === target.cardId),
        `系統「${family}」の${target.name}がトラッシュから召喚される`,
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === outsider.cardId),
        `対照実験：系統が違う${outsider.name}は召喚されない`,
    )
}
