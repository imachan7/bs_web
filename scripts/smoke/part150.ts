// smoke パート150（デッキ破棄への割り込み：BS06ディスコンティニュー／BS08鳳翼の聖剣）
//
// これまで「デッキ破棄の経路に割り込む器が無い」として未実装にしていた2枚を通す:
//   globalConstraint"noDeckMillByOpponent"（自分のデッキは破棄されない。
//     whileSourceDeployedTurnOnly＝配置されたターンの間だけ有効な版も）／
//   kind"onMilledFromDeck"（**そのカード自身が**デッキから破棄されたときに発揮する。
//     castThisMagicFree＝マジックを無償で即時発揮／deployThisNexusFree＝ネクサスを無償で配置）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"
import { millDeck, resolveFunsai } from "../../server/src/logic/EffectModules"

interface CardRow {
    cardId: string
    name: string
    type?: string
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const FILLER = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!

console.log("=== BS06ディスコンティニュー：このターンの間、自分のデッキは破棄されない ===")
{
    const disco = findByEffect(
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "noDeckMillByOpponent",
    )
    assert(disco.type === "magic", "この形（貸与つき）で引けるのはマジックのディスコンティニュー")

    // 貸与前：相手の効果で普通に破棄される
    const s = base("disco-before")
    s.players.p1.deck = new Array<string>(20).fill(FILLER.cardId)
    const before = s.players.p1.trashCards.length
    assert(millDeck(s, "p1", 3, "p2") === 3, "貸与前は3枚破棄される")
    assert(s.players.p1.trashCards.length === before + 3, "トラッシュが3枚増える")

    // 貸与後：相手の効果では1枚も破棄されない
    const s2 = base("disco-after")
    s2.players.p1.deck = new Array<string>(20).fill(FILLER.cardId)
    s2.players.p1.turnVirtualInstances.push(createInstance(disco.cardId, s2.turn, 0))
    const deckBefore = s2.players.p1.deck.length
    assert(millDeck(s2, "p1", 3, "p2") === 0, "相手の効果では1枚も破棄されない")
    assert(s2.players.p1.deck.length === deckBefore, "デッキが減っていない")

    // 自分の効果・コスト支払いによる破棄は止めない（millCap と同じ範囲）
    assert(millDeck(s2, "p1", 2) === 2, "自分側の破棄（actorPid省略）は通常どおり通る")
}

console.log("=== BS06ディスコンティニュー：相手の効果でデッキから破棄されたら、コストを支払わず即時に発揮される ===")
{
    const disco = findByEffect((e) => e["kind"] === "onMilledFromDeck" && e["then"] === "castThisMagicFree")
    const s = base("disco-milled")
    // デッキの一番上にディスコンティニューを仕込み、相手の効果で破棄させる
    s.players.p1.deck = [disco.cardId, ...new Array<string>(20).fill(FILLER.cardId)]
    const reserveBefore = s.players.p1.reserve
    millDeck(s, "p1", 1, "p2", { sourceType: "magic" })
    assert(s.players.p1.reserve === reserveBefore, "コストを支払わない")
    // 発揮された結果、このターンの間デッキが守られる（＝貸与が立っている）
    assert(s.players.p1.turnVirtualInstances.length > 0, "効果が発揮され、仮想発生源が立つ")
    const deckBefore = s.players.p1.deck.length
    assert(millDeck(s, "p1", 3, "p2") === 0, "以降このターンは相手の効果で破棄されない")
    assert(s.players.p1.deck.length === deckBefore, "デッキが減っていない")

    // 自分の効果で破棄した場合は発揮しない（「相手の効果で」の限定）
    const s2 = base("disco-milled-by-self")
    s2.players.p1.deck = [disco.cardId, ...new Array<string>(20).fill(FILLER.cardId)]
    millDeck(s2, "p1", 1)
    assert(s2.players.p1.turnVirtualInstances.length === 0, "自分側の破棄では発揮しない")
    assert(s2.players.p1.trashCards.includes(disco.cardId), "発揮しないのでトラッシュに残る")
}

console.log("=== BS08鳳翼の聖剣：相手のスピリットの効果でデッキから破棄されたら、コストを支払わず配置される ===")
{
    const sword = findByEffect((e) => e["kind"] === "onMilledFromDeck" && e["then"] === "deployThisNexusFree")
    const s = base("sword-milled-by-spirit")
    s.players.p1.deck = [sword.cardId, ...new Array<string>(20).fill(FILLER.cardId)]
    const nexusBefore = s.players.p1.field.nexuses.length
    const reserveBefore = s.players.p1.reserve
    millDeck(s, "p1", 1, "p2", { sourceType: "spirit" })
    assert(s.players.p1.field.nexuses.length === nexusBefore + 1, "ネクサスとして配置される")
    assert(s.players.p1.reserve === reserveBefore, "コストを支払わない")
    assert(!s.players.p1.trashCards.includes(sword.cardId), "配置されたのでトラッシュには残らない")

    // 「相手の**スピリット**の効果で」なので、マジックによる破棄では配置されない
    const s2 = base("sword-milled-by-magic")
    s2.players.p1.deck = [sword.cardId, ...new Array<string>(20).fill(FILLER.cardId)]
    const nexus2 = s2.players.p1.field.nexuses.length
    millDeck(s2, "p1", 1, "p2", { sourceType: "magic" })
    assert(s2.players.p1.field.nexuses.length === nexus2, "マジックの効果による破棄では配置されない")
    assert(s2.players.p1.trashCards.includes(sword.cardId), "トラッシュに残る")

    // 発生源の種別が渡らない呼び出しでも配置しない（限定を緩めない側に倒す）
    const s3 = base("sword-milled-unknown-source")
    s3.players.p1.deck = [sword.cardId, ...new Array<string>(20).fill(FILLER.cardId)]
    const nexus3 = s3.players.p1.field.nexuses.length
    millDeck(s3, "p1", 1, "p2")
    assert(s3.players.p1.field.nexuses.length === nexus3, "発生源不明では配置されない")
}

console.log("=== BS08鳳翼の聖剣：デッキを守るのは「配置されたターンの間」だけ ===")
{
    const sword = findByEffect(
        (e) =>
            (e["constraint"] as Record<string, unknown> | undefined)?.["whileSourceDeployedTurnOnly"] === true,
    )
    const s = base("sword-guard-this-turn")
    s.players.p1.deck = new Array<string>(20).fill(FILLER.cardId)
    const inst = putNexus(s, "p1", sword.cardId, 0) // このターンに配置
    assert(inst.summonedTurn === s.turn, "このターンに配置された状態")
    assert(millDeck(s, "p1", 3, "p2") === 0, "配置されたターンは相手の効果で破棄されない")

    // ターンが進めば守られない
    s.turn += 1
    assert(millDeck(s, "p1", 3, "p2") === 3, "次のターン以降は通常どおり破棄される")
}

console.log("=== 【粉砕】経由でも同じ経路を通る（実カードのアクションから） ===")
{
    const sword = findByEffect((e) => e["kind"] === "onMilledFromDeck" && e["then"] === "deployThisNexusFree")
    const funsaiSpirit = CARDS.find((c) =>
        (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "funsai"),
    )!
    const s = base("sword-milled-by-funsai")
    const attacker = createInstance(funsaiSpirit.cardId, s.turn, funsaiSpirit.levels?.[0]?.cores ?? 1)
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    s.players.p1.deck = [sword.cardId, ...new Array<string>(20).fill(FILLER.cardId)]
    const nexusBefore = s.players.p1.field.nexuses.length
    // resolveFunsai は sourceType:"spirit" を渡すので、聖剣の条件を満たす
    resolveFunsai(s, "p2", attacker)
    assert(
        s.players.p1.field.nexuses.length === nexusBefore + 1,
        `【粉砕】（${getCard(funsaiSpirit.cardId).name}）による破棄でも配置される`,
    )
}
