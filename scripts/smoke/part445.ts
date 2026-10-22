// smoke パート445（BS17部品バッチ4。新キーワード【魔光芒】＝【光芒】＋マジック再発揮の合成）
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    destroySpirit,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import type { CardData } from "../../server/src/type"
import { matchesTarget } from "../../shared/rules"

function makeCard(cardId: string, over: Partial<CardData> = {}): CardData {
    const c: CardData = {
        cardId,
        name: `テスト${cardId}`,
        type: "spirit",
        colors: ["red"],
        cost: 2,
        reduction: [],
        family: [],
        levels: [{ level: 1, cores: 1, bp: 3000 }],
        symbol: ["red"],
        flash: false,
        rarity: "C",
        limited: false,
        effect: "（テスト用）",
        effects: [],
        ...over,
    }
    CARD_DB.set(cardId, c)
    return c
}

const FILLER = makeCard("T445-FILLER").cardId
const MAKOBO = makeCard("T445-MAKOBO", {
    effects: [{ id: "k1", kind: "keyword", keyword: "makobo", levels: null }],
}).cardId
const KOBO = makeCard("T445-KOBO", {
    effects: [{ id: "k1", kind: "keyword", keyword: "kobo", levels: null }],
}).cardId
const PLAIN = makeCard("T445-PLAIN").cardId
const MAGIC = makeCard("T445-MAGIC", {
    type: "magic",
    colors: ["red"],
    cost: 1,
    levels: [],
    symbol: [],
    flash: true,
    effects: [{ id: "g1", kind: "magic", timing: "flash", action: { type: "draw", count: 1 } }],
}).cardId

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => FILLER)
    s.players.p2.deck = Array.from({ length: 40 }, () => FILLER)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== 1. 【魔光芒】：非対話ではアタック中に使ったマジックが自動で2回発揮される ===")
{
    const s = game("makobo-auto")
    const attacker = put(s, "p1", MAKOBO)
    put(s, "p2", FILLER)
    s.players.p1.hand = [MAGIC]
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "魔光芒持ちがアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パスで攻撃側に優先権")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "アタック中にマジックを使用")
    assert(s.players.p1.deck.length === deckBefore - 2, "ドロー2回ぶん＝もう1度自動で発揮されている")
    assert(s.players.p1.trashCards.includes(MAGIC), "使ったマジックはいったんトラッシュへ")

    console.log("--- バトル終了時：使用したマジックが手札へ戻る（【魔光芒】は【光芒】の回収を内包） ---")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受けてバトルを終える")
    assert(s.players.p1.hand.includes(MAGIC), "バトル終了時にマジックが手札に戻る")
}

console.log("=== 2. 対話時は再発揮の確認が出て、「発揮しない」を選べば1回だけ ===")
{
    const s = game("makobo-ask", true)
    const attacker = put(s, "p1", MAKOBO)
    put(s, "p2", FILLER)
    s.players.p1.hand = [MAGIC]
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "魔光芒持ちがアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "マジックを使用")
    const pc = s.pendingChoice
    assert(pc !== null && pc.magicRepeat !== undefined, "再発揮の確認が出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "発揮しない" }) === null, "「発揮しない」を選ぶ")
    assert(s.players.p1.deck.length === deckBefore - 1, "発揮は1回だけ")
}

console.log("=== 3. 【魔光芒】持ちがブロッカー側のときは再発揮しない ===")
{
    const s = game("makobo-blocker")
    const attacker = put(s, "p1", PLAIN)
    const blocker = put(s, "p2", MAKOBO)
    s.players.p2.hand = [MAGIC]
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "魔光芒を持たない側がアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "魔光芒持ちがブロック宣言")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "ブロッカー側がマジックを使用")
    assert(s.players.p2.deck.length === deckBefore - 1, "アタッカーでないので再発揮しない")
}

console.log("=== 4. 【光芒】だけの持ち主は従来どおり再発揮しない ===")
{
    const s = game("kobo-only")
    const attacker = put(s, "p1", KOBO)
    put(s, "p2", FILLER)
    s.players.p1.hand = [MAGIC]
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "光芒持ちがアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "マジックを使用")
    assert(s.players.p1.deck.length === deckBefore - 1, "光芒だけでは再発揮しない")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受けてバトルを終える")
    assert(s.players.p1.hand.includes(MAGIC), "【光芒】の回収自体は変わらない")
}

console.log("=== 5. TargetFilter.keyword の配列はOR、単数はkoboをmakoboに当てない ===")
{
    const s = game("filter-array")
    const makoboSpirit = put(s, "p1", MAKOBO)
    const koboSpirit = put(s, "p1", KOBO)
    const plainSpirit = put(s, "p1", PLAIN)
    assert(
        matchesTarget(s, "p1", makoboSpirit, { keyword: ["kobo", "makobo"] }, undefined),
        "配列指定はmakobo単独持ちにも当たる",
    )
    assert(
        matchesTarget(s, "p1", koboSpirit, { keyword: ["kobo", "makobo"] }, undefined),
        "配列指定はkobo単独持ちにも当たる",
    )
    assert(
        !matchesTarget(s, "p1", plainSpirit, { keyword: ["kobo", "makobo"] }, undefined),
        "どちらも持たなければ配列指定でも当たらない",
    )
    assert(
        !matchesTarget(s, "p1", makoboSpirit, { keyword: "kobo" }, undefined),
        "単数指定の\"kobo\"はmakobo持ちに当たらない（別キーワード）",
    )
}

console.log("=== 6. reviveOnDestroy.keywordFilter の配列は、いずれかのキーワード持ちを対象にする ===")
{
    const GUARD_NEXUS = makeCard("T445-GUARD", {
        type: "nexus",
        effects: [
            {
                id: "n1",
                kind: "reviveOnDestroy",
                levels: null,
                scope: "ownAll",
                when: {},
                revived: { rested: true },
                keywordFilter: ["kobo", "makobo"],
            },
        ],
    }).cardId
    const s = game("revive-filter")
    const guard = createInstance(GUARD_NEXUS, s.turn, 1)
    s.players.p1.field.nexuses.push(guard)
    const makoboSpirit = put(s, "p1", MAKOBO)
    const koboSpirit = put(s, "p1", KOBO)
    const plainSpirit = put(s, "p1", PLAIN)
    destroySpirit(s, "p1", makoboSpirit.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    destroySpirit(s, "p1", koboSpirit.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    destroySpirit(s, "p1", plainSpirit.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === makoboSpirit.instanceId), "makobo持ちは破壊を防がれる")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === koboSpirit.instanceId), "kobo持ちも破壊を防がれる")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === plainSpirit.instanceId), "どちらも持たなければ破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part445）")
