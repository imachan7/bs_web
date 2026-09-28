// smoke パート444（BS17部品バッチ3。カードデータ非依存のテスト用合成カードで確認する）
// reviveOnDestroy.cost.exhaustSelf（BS17-069）／reviveOnDestroy.blockingOnly（BS17-079）／
// triggered.burstSummonOnly（BS17-044）／reveal.countCounter + EffectCounter.ownKeyword配列（BS17-041）
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    destroySpirit,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { CARD_DB } from "../../server/src/logic/GameState"
import type { CardData } from "../../server/src/type"
import { fireBurstOnEvent } from "../../server/src/logic/keywords/burst"

function makeCard(cardId: string, over: Partial<CardData> = {}): CardData {
    const c: CardData = {
        cardId,
        name: `テスト${cardId}`,
        type: "spirit",
        colors: ["red"],
        cost: 3,
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

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== reviveOnDestroy.cost.exhaustSelf：発生源（ネクサス）を疲労させて破壊を防ぐ ===")
{
    const NEXUS = makeCard("T444-NEXUS", {
        type: "nexus",
        effects: [
            {
                id: "n1",
                kind: "reviveOnDestroy",
                levels: null,
                scope: "ownAll",
                when: {},
                cost: { exhaustSelf: true },
                revived: { rested: true },
            },
        ],
    }).cardId

    console.log("--- 発生源が回復状態：破壊を防ぎ、発生源が疲労する ---")
    {
        const s = game("exhaustSelf-ok")
        const nexus = createInstance(NEXUS, s.turn, 1)
        s.players.p1.field.nexuses.push(nexus)
        const target = putSpirit(s, "p1", "BS01-001", 1)
        destroySpirit(s, "p1", target.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
        assert(
            s.players.p1.field.spirits.some((x) => x.instanceId === target.instanceId && x.isRested === true),
            "対象は疲労状態で場に残っている",
        )
        assert(nexus.isRested === true, "コストとして発生源（ネクサス）が疲労した")
    }

    console.log("--- 発生源が既に疲労状態：支払えず不発（通常どおり破壊される） ---")
    {
        const s = game("exhaustSelf-ng")
        const nexus = createInstance(NEXUS, s.turn, 1)
        nexus.isRested = true
        s.players.p1.field.nexuses.push(nexus)
        const target = putSpirit(s, "p1", "BS01-001", 1)
        const destroyed = destroySpirit(s, "p1", target.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
        assert(destroyed === true, "コストを支払えないため通常どおり破壊される")
        assert(
            s.players.p1.field.spirits.every((x) => x.instanceId !== target.instanceId),
            "対象は場に残っていない",
        )
    }
}

console.log("=== reviveOnDestroy.blockingOnly + lendSelfThisBattle：ブロッカーだけが残る ===")
{
    const MAGIC = makeCard("T444-MAGIC", {
        type: "magic",
        levels: [],
        effects: [
            { id: "m1", kind: "magic", timing: "flash", action: { type: "lendSelfThisBattle" } },
            {
                id: "m2",
                kind: "reviveOnDestroy",
                levels: null,
                scope: "ownAll",
                when: {},
                lentOnly: true,
                blockingOnly: true,
                revived: { rested: true },
            },
        ],
    }).cardId
    const ATTACKER = makeCard("T444-ATK", { levels: [{ level: 1, cores: 1, bp: 3000 }] }).cardId
    const BLOCKER = makeCard("T444-BLK", { levels: [{ level: 1, cores: 1, bp: 3000 }] }).cardId

    const s = game("blockingOnly")
    const attacker = putSpirit(s, "p1", ATTACKER, 1)
    const blocker = putSpirit(s, "p2", BLOCKER, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "p2がブロック宣言")
    // フラッシュ②：p2がこのバトルの間だけ効果を貸す（このバトルの間、ブロックしている自分のスピリットが
    // 破壊されたとき、そのスピリットを疲労状態で自分のフィールドに残す＝BS17-079）
    resolveAction(s, "p2", null, { type: "lendSelfThisBattle" }, undefined, undefined, "magic", undefined, undefined, MAGIC)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（BP同値で相討ち）")
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId && x.isRested === true),
        "ブロッカーは破壊されず疲労状態で場に残る",
    )
    assert(
        s.players.p1.field.spirits.every((x) => x.instanceId !== attacker.instanceId),
        "アタッカーはblockingOnlyの対象外なので通常どおり破壊される",
    )
}

console.log("=== triggered.burstSummonOnly：バーストでの召喚でのみ発火する ===")
{
    const CARD = makeCard("T444-BURST", {
        cost: 1,
        effects: [
            { id: "b1", kind: "burst", event: "ownLifeDamaged", action: { type: "summonBurstCardFree" } },
            {
                id: "b2",
                kind: "triggered",
                trigger: "onSummon",
                levels: null,
                optional: false,
                burstSummonOnly: true,
                action: { type: "draw", count: 1 },
            },
        ],
    }).cardId

    console.log("--- バーストで自分自身を召喚：onSummonが発火する ---")
    {
        const s = game("burstSummonOnly-yes")
        s.players.p1.burst = CARD
        s.players.p1.burstSet = true
        const beforeHand = s.players.p1.hand.length
        fireBurstOnEvent(s, "p1", "ownLifeDamaged", undefined, undefined, undefined)
        assert(
            s.players.p1.field.spirits.some((x) => x.cardId === CARD),
            "バーストとして自分自身を召喚した",
        )
        assert(s.players.p1.hand.length === beforeHand + 1, "burstSummonOnlyの召喚時効果（1枚ドロー）が発火した")
    }

    console.log("--- 手札からの通常召喚：onSummonは発火しない ---")
    {
        const s = game("burstSummonOnly-no")
        s.players.p1.hand = [CARD]
        const beforeHand = s.players.p1.hand.length - 1 // 召喚で手札から出る1枚を差し引いた基準
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "手札から通常召喚")
        assert(
            s.players.p1.field.spirits.some((x) => x.cardId === CARD),
            "場に召喚された",
        )
        assert(s.players.p1.hand.length === beforeHand, "burstSummonOnlyの召喚時効果（1枚ドロー）は発火しない")
    }
}

console.log("=== reveal.countCounter + EffectCounter.ownKeyword配列：OR判定・重複1回 ===")
{
    const KOBO_ONLY = makeCard("T444-KOBO", {
        effects: [{ id: "k1", kind: "keyword", keyword: "kobo", levels: [1] }],
    }).cardId
    const SEIMEI_ONLY = makeCard("T444-SEIMEI", {
        effects: [{ id: "k1", kind: "keyword", keyword: "seimei", levels: [1] }],
    }).cardId
    const BOTH = makeCard("T444-BOTH", {
        effects: [
            { id: "k1", kind: "keyword", keyword: "kobo", levels: [1] },
            { id: "k2", kind: "keyword", keyword: "seimei", levels: [1] },
        ],
    }).cardId
    const NEITHER = makeCard("T444-NEITHER").cardId
    const FILLER = makeCard("T444-FILLER").cardId

    const s = game("countCounter-ownKeyword")
    putSpirit(s, "p1", KOBO_ONLY, 1)
    putSpirit(s, "p1", SEIMEI_ONLY, 1)
    putSpirit(s, "p1", BOTH, 1) // 両方持ち：1体としてのみ数える
    putSpirit(s, "p1", NEITHER, 1)
    s.players.p1.deck = Array.from({ length: 10 }, () => FILLER)
    const beforeDeck = s.players.p1.deck.length
    const beforeHand = s.players.p1.hand.length
    resolveAction(
        s,
        "p1",
        null,
        { type: "reveal", from: "ownDeck", countCounter: { ownKeyword: ["kobo", "seimei"] }, pickCount: "all", dest: "hand" },
    )
    assert(s.players.p1.deck.length === beforeDeck - 3, "【光芒】/【聖命】持ち3体ぶん（重複1体は1回）だけオープンした")
    assert(s.players.p1.hand.length === beforeHand + 3, "オープンした3枚は手札へ（pickCount:allですべて選んだ）")
}

console.log("すべてのチェックに合格しました 🎉（part444）")
