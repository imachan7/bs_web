// smoke パート312（バーストの軸3本。docs/design/BURST.md／BS14取り込み前の器）
// BS14はまだカードデータに無いため、**テスト用の合成カードを CARD_DB に登録して**進める
// （part238と同じ形）。今回足した byOpponentEffectOnly / destroyedColorFilter / condition を確認する。
import { assert, createGame, createInstance, destroySpirit, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS, CARD_DB } from "../../server/src/logic/GameState"
import type { CardData } from "../../server/src/type"

function makeBurstCard(cardId: string, over: Partial<CardData> = {}): CardData {
    const c: CardData = {
        cardId, name: `テストバースト${cardId}`, type: "spirit", colors: ["purple"], cost: 3,
        reduction: [], family: [],
        levels: [{ level: 1, cores: 1, bp: 1000 }],
        symbol: ["purple"], flash: false, rarity: "C", limited: false, effect: "（テスト用）", effects: [],
        ...over,
    }
    CARD_DB.set(cardId, c)
    return c
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
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

console.log("=== byOpponentEffectOnly：相手による破壊でのみ発火する ===")
{
    const BURST = makeBurstCard("TEST-BURST-OPP", {
        effects: [{ id: "b1", kind: "burst", event: "ownSpiritDestroyed", byOpponentEffectOnly: true, action: { type: "draw", count: 1 } }],
    }).cardId

    const s = game("burst-byOpponent-yes")
    s.players.p1.burst = BURST
    s.players.p1.burstSet = true
    const target = putSpirit(s, "p1", "BS01-001", 1)
    const before = s.players.p1.deck.length
    destroySpirit(s, "p1", target.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.deck.length === before - 1, "相手の効果による破壊では発火する")

    const s2 = game("burst-byOpponent-no")
    s2.players.p1.burst = BURST
    s2.players.p1.burstSet = true
    const target2 = putSpirit(s2, "p1", "BS01-001", 1)
    const before2 = s2.players.p1.deck.length
    destroySpirit(s2, "p1", target2.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })
    assert(s2.players.p1.deck.length === before2, "自分の効果による破壊では発火しない")
}

console.log("=== destroyedColorFilter：破壊されたスピリットの色で絞る ===")
{
    const BURST = makeBurstCard("TEST-BURST-COLOR", {
        effects: [{ id: "b1", kind: "burst", event: "ownSpiritDestroyed", destroyedColorFilter: "purple", action: { type: "draw", count: 1 } }],
    }).cardId
    assert(getCard("BS01-001").colors.includes("red") && !getCard("BS01-001").colors.includes("purple"), "テスト前提: BS01-001は赤（紫を含まない）")

    const s = game("burst-color-match")
    s.players.p1.burst = BURST
    s.players.p1.burstSet = true
    const purple = putSpirit(s, "p1", "TEST-BURST-OPP", 1) // 紫のテストカードを流用（破壊対象として使うだけ）
    const before = s.players.p1.deck.length
    destroySpirit(s, "p1", purple.instanceId)
    assert(s.players.p1.deck.length === before - 1, "紫のスピリットが破壊されたときは発火する")

    const s2 = game("burst-color-mismatch")
    s2.players.p1.burst = BURST
    s2.players.p1.burstSet = true
    const red = putSpirit(s2, "p1", "BS01-001", 1)
    const before2 = s2.players.p1.deck.length
    destroySpirit(s2, "p1", red.instanceId)
    assert(s2.players.p1.deck.length === before2, "赤のスピリットが破壊されたときは発火しない")
}

console.log("=== condition：満たさないときは burst は消費されるが action は解決しない ===")
{
    const BURST = makeBurstCard("TEST-BURST-COND", {
        effects: [{
            id: "b1", kind: "burst", event: "ownSpiritDestroyed",
            condition: { ownLifeAtMost: 3 },
            action: { type: "draw", count: 1 },
        }],
    }).cardId

    const s = game("burst-condition-met")
    s.players.p1.life = 3
    s.players.p1.burst = BURST
    s.players.p1.burstSet = true
    const t1 = putSpirit(s, "p1", "BS01-001", 1)
    const before = s.players.p1.deck.length
    destroySpirit(s, "p1", t1.instanceId)
    assert(s.players.p1.deck.length === before - 1, "ライフ3以下ならactionが解決する")
    assert(s.players.p1.burst === null, "発動後はバーストエリアが空になる")

    const s2 = game("burst-condition-unmet")
    s2.players.p1.life = 4
    s2.players.p1.burst = BURST
    s2.players.p1.burstSet = true
    const t2 = putSpirit(s2, "p1", "BS01-001", 1)
    const before2 = s2.players.p1.deck.length
    destroySpirit(s2, "p1", t2.instanceId)
    assert(s2.players.p1.deck.length === before2, "ライフ4はcondition未達なのでactionは解決しない（drawは起きない）")
    assert(s2.players.p1.burst === null, "conditionを満たさなくてもバースト自体は消費される（宣言済みのため）")
    assert(s2.players.p1.trashCards.includes(BURST), "actionが不発でも既定どおりトラッシュへ置かれる")
}

console.log("=== キーワード登録：呪滅撃／大粉砕の名前だけ引ける ===")
{
    assert(getCard("BS01-001").cardId === "BS01-001", "前提カードのロード確認")
    // KEYWORDS レジストリに新規2件が登録されている（shared/rules.ts）ことを型経由で間接確認する。
    // validate:cards の VALID_KEYWORDS は KEYWORDS 由来なので、ここではカードデータ側を汚さず
    // 型が Keyword を受理することだけを確認する（コンパイルが通ること自体が検査）
    const dummy = makeBurstCard("TEST-KEYWORD-CHECK", {
        effects: [
            { id: "k1", kind: "keyword", keyword: "jumetsugeki", levels: null },
        ],
    })
    assert(dummy.effects[0]!.kind === "keyword", "呪滅撃キーワードを型エラー無く宣言できる")
    const dummy2 = makeBurstCard("TEST-KEYWORD-CHECK2", {
        effects: [
            { id: "k1", kind: "keyword", keyword: "daifunsai", levels: null },
        ],
    })
    assert(dummy2.effects[0]!.kind === "keyword", "大粉砕キーワードを型エラー無く宣言できる")
}

// ALL_CARDS は起動時にロードした実データの参照。CARD_DB へ合成カードを足しても
// ALL_CARDS自体（配列）は変わらないため、他パートのvalidate系処理に影響しないことの確認
assert(!ALL_CARDS.some((c) => c.cardId.startsWith("TEST-BURST")), "合成カードはALL_CARDSに混入しない（CARD_DBのみ）")

console.log("すべてのチェックに合格しました 🎉（part312）")
