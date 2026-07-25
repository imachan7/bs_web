// smoke パート29（第三弾 BS03：任意コスト支払い系5枚の構造化）
// 収録セクション:
//   - activated + grantKeywordToHandCard: 手札の系統/種別一致カードに神速を一時付与（BS03-033 ビートプリースト）
//   - triggered optional + selfBuffByHandDiscard: 手札のネクサス1枚破棄でBP+（アタック時=BS03-088／ブロック時=BS03-092）
//   - reviveOnDestroy: keywordFilter（静的神速のみ）・cost.reserveOneToTrash・phaseTurn turn:"both"（BS03-107 果て無き地平線）
//   - magic + coreTradeToOpponentTrash: 自分と相手のリザーブから同数だけトラッシュへ（BS03-124 ポイズンミスト）
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    getCard,
    resolveAction,
    runTurnStart,
} from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"
import { validateSummon } from "../../server/src/logic/RuleValidator"

console.log("=== BS03-033 ビートプリースト：起動能力で手札の殻虫スピリットに神速を一時付与 ===")
{
    const s = createGame(
        "beatpriest-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const beatPriest = createInstance("BS03-033", s.turn, 4) // Lv2
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(beatPriest, attacker)
    s.players.p1.hand.push("BS01-050") // ビートビートル（殻虫）
    s.players.p1.reserve = 3
    act(s, "p1", { type: "nextPhase" }) // main → attack
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    // アタック直後は防御側(p2)に優先権 → p2がパスしてp1に優先権を渡す
    act(s, "p2", { type: "pass" })

    const effectId = getCard("BS03-033").effects.find((e) => e.kind === "activated")!.id
    const handIndex = s.players.p1.hand.indexOf("BS01-050")
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: beatPriest.instanceId, effectId }) === null,
        "優先権保持側はコアを払って起動できる",
    )
    assert(s.players.p1.reserve === reserveBefore - 1, "リザーブのコアが1個減る")
    assert(
        (s.players.p1.tempHandKeywordGrants ?? []).some(
            (g) => g.cardId === "BS01-050" && g.keyword === "soku",
        ),
        "手札のビートビートルに神速が一時付与される",
    )
    // 起動後はp1→p2へ優先権が移るため、p2がパスして再びp1に戻す
    act(s, "p2", { type: "pass" })
    assert(
        validateSummon(s, "p1", handIndex) === null,
        "神速扱いによりフラッシュタイミングで手札から召喚できる",
    )
}

console.log("=== BS03-088 城壊しのデニス：アタック時、手札のネクサス1枚破棄でBP+5000（任意） ===")
{
    const s = createGame(
        "dennis-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const dennis = createInstance("BS03-088", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(dennis)
    s.players.p1.hand.push("BS01-098") // ネクサスカード
    const handBefore = s.players.p1.hand.length
    fireTrigger(s, "p1", dennis, "onAttack")
    assert(dennis.tempBpBuff === 5000, "手札のネクサスを破棄してBP+5000（ターン終了時まで）")
    assert(s.players.p1.hand.length === handBefore - 1, "手札のネクサスが1枚減る")
    assert(s.players.p1.trashCards.includes("BS01-098"), "破棄したネクサスはトラッシュへ")

    // 手札にネクサスがなければ不発でBP据え置き
    const s2 = createGame(
        "dennis-none-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s2)
    const dennis2 = createInstance("BS03-088", s2.turn, 1)
    s2.players.p1.field.spirits.push(dennis2)
    s2.players.p1.hand = ["BS01-001"] // ネクサスなし
    fireTrigger(s2, "p1", dennis2, "onAttack")
    assert(dennis2.tempBpBuff === 0, "手札にネクサスがなければ不発でBPは据え置き")
}

console.log("=== BS03-092 島持ちのフランシス：ブロック時、手札のネクサス1枚破棄でBP+5000（任意） ===")
{
    const s = createGame(
        "francis-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const francis = createInstance("BS03-092", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(francis)
    s.players.p1.hand.push("BS01-098")
    fireTrigger(s, "p1", francis, "onBlock")
    assert(francis.tempBpBuff === 5000, "手札のネクサスを破棄してBP+5000（ターン終了時まで）")
    assert(s.players.p1.trashCards.includes("BS01-098"), "破棄したネクサスはトラッシュへ")
}

console.log("=== BS03-107 果て無き地平線：神速持ちがバトル破壊時に手札へ戻る（Lv2・お互いのアタックステップ） ===")
{
    // 通常ケース：自分のターンの相手アタックステップでも発火する（turn:"both"）
    const s = createGame(
        "horizon-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "blue" },
    )
    runTurnStart(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    const nexus = createInstance("BS03-107", s.turn, 3) // Lv2
    const sokuSpirit = createInstance("BS03-028", s.turn, 2) // モグランナー（神速持ち、コア2個）
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.field.spirits.push(sokuSpirit)
    s.players.p1.reserve = 3
    destroySpirit(s, "p1", sokuSpirit.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 2 },
    })
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === sokuSpirit.instanceId),
        "フィールドから除去される",
    )
    assert(s.players.p1.hand.includes("BS03-028"), "手札に戻る")
    assert(s.players.p1.trashCores === 1, "コスト：リザーブのコア1個がトラッシュへ")
    assert(s.players.p1.reserve === 3 - 1 + 2, "リザーブはコスト-1後、コア2個ぶん+2される")

    // 相手のターン（turnPlayer=p2）でも phase:"attack" なら turn:"both" で発火する
    const s2 = createGame(
        "horizon-opponentturn-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "blue" },
    )
    runTurnStart(s2)
    s2.phase = "attack"
    s2.turnPlayer = "p2"
    const nexus2 = createInstance("BS03-107", s2.turn, 3)
    const sokuSpirit2 = createInstance("BS03-028", s2.turn, 1)
    s2.players.p1.field.nexuses.push(nexus2)
    s2.players.p1.field.spirits.push(sokuSpirit2)
    s2.players.p1.reserve = 1
    destroySpirit(s2, "p1", sokuSpirit2.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 2 },
    })
    assert(s2.players.p1.hand.includes("BS03-028"), "相手のターンでも turn:both のため手札に戻る")

    // リザーブ0ならコストを支払えず不発（通常通りトラッシュへ）
    const s3 = createGame(
        "horizon-noreserve-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "blue" },
    )
    runTurnStart(s3)
    s3.phase = "attack"
    s3.turnPlayer = "p1"
    const nexus3 = createInstance("BS03-107", s3.turn, 3)
    const sokuSpirit3 = createInstance("BS03-028", s3.turn, 2)
    s3.players.p1.field.nexuses.push(nexus3)
    s3.players.p1.field.spirits.push(sokuSpirit3)
    s3.players.p1.reserve = 0
    destroySpirit(s3, "p1", sokuSpirit3.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 2 },
    })
    assert(s3.players.p1.trashCards.includes("BS03-028"), "リザーブ不足で不発、通常通りトラッシュへ")
    assert(!s3.players.p1.hand.includes("BS03-028"), "手札には戻らない")
    assert(s3.players.p1.reserve === 2, "通常の破壊処理でコア2個がリザーブへ")

    // 神速を持たないスピリットはkeywordFilterで対象外（通常通りトラッシュへ）
    const s4 = createGame(
        "horizon-nonsoku-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "blue" },
    )
    runTurnStart(s4)
    s4.phase = "attack"
    s4.turnPlayer = "p1"
    const nexus4 = createInstance("BS03-107", s4.turn, 3)
    const plain = createInstance("BS01-001", s4.turn, 1) // 神速なし
    s4.players.p1.field.nexuses.push(nexus4)
    s4.players.p1.field.spirits.push(plain)
    s4.players.p1.reserve = 5
    destroySpirit(s4, "p1", plain.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["blue"], attackerLevel: 2 },
    })
    assert(s4.players.p1.trashCards.includes("BS01-001"), "神速を持たないため対象外、通常通りトラッシュへ")
}

console.log("=== BS03-124 ポイズンミスト：min(自分,相手)のリザーブを両者トラッシュへ ===")
{
    const s = createGame(
        "poisonmist-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 5
    s.players.p2.reserve = 3
    resolveAction(s, "p1", null, { type: "coreTradeToOpponentTrash" })
    assert(s.players.p1.reserve === 5 - 3, "自分のリザーブはmin(5,3)=3個減る")
    assert(s.players.p2.reserve === 3 - 3, "相手のリザーブも同数減る")
    assert(s.players.p1.trashCores === 3, "自分のトラッシュへ3個")
    assert(s.players.p2.trashCores === 3, "相手のトラッシュへも3個")

    // どちらかのリザーブが0なら不発
    const s2 = createGame(
        "poisonmist-none-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s2)
    s2.players.p1.reserve = 0
    s2.players.p2.reserve = 5
    resolveAction(s2, "p1", null, { type: "coreTradeToOpponentTrash" })
    assert(s2.players.p1.reserve === 0, "自分のリザーブが0のため不発（据え置き）")
    assert(s2.players.p2.reserve === 5, "相手のリザーブも据え置き")
}
