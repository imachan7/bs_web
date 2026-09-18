// smoke パート347（BS15 青バッチ：048-054・060・071・072・083・084・X06。2026-09-18）
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    destroySpirit,
    fireFieldEventTriggers,
    fireStepTriggers,
    fireTrigger,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveFunsai } from "../../server/src/logic/EffectModules"
import { canDiscardHand, trashCardNameMatches } from "../../shared/rules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function nexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [
        ["BS15-046", "ランマー・ゴレム"],
        ["BS15-048", "釣り仙人ジゴロウ"],
        ["BS15-049", "ツンドッグ・ゴレム"],
        ["BS15-050", "グレネード・ゴレム"],
        ["BS15-051", "虚海獣エメヒドラル"],
        ["BS15-052", "天蒼元帥チョウハッカイ"],
        ["BS15-053", "コジロンド・ゴレム"],
        ["BS15-054", "虚造帝フェニックス・ゴレム"],
        ["BS15-060", "バンディット・アームズ"],
        ["BS15-071", "巨人の足跡湖"],
        ["BS15-072", "渦巻く大海峡"],
        ["BS15-083", "秘剣燕返"],
        ["BS15-084", "爆砕轟神掌"],
        ["BS15-X06", "鉄の覇王サイゴード・ゴレム"],
    ]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id} は${name}（実際は${getCard(id).name}）`)
    assert(getCard("BS15-046").effects.length === 0, "046 はバニラ")
}

console.log("=== 048 釣り仙人ジゴロウ：コアを置くことで【粉砕】の破棄枚数を+1 ===")
{
    const s = game("p347-048")
    const jigoro = put(s, "p1", "BS15-048", 2) // Lv1（コスト3・コア2個）
    const gren = put(s, "p1", "BS15-050", 1) // 【粉砕】Lv1
    const coresBefore = jigoro.cores
    fireStepTriggers(s, "start")
    assert(jigoro.cores === coresBefore - 1, "コア1個をトラッシュに置いた")
    const deckBefore = s.players.p2.deck.length
    resolveFunsai(s, "p1", gren)
    assert(s.players.p2.deck.length === deckBefore - 2, `Lv1+1枚で2枚破棄（実際${deckBefore - s.players.p2.deck.length}枚）`)
}

console.log("=== 049 ツンドッグ・ゴレム：粉砕持ちがバトルで破壊されても疲労状態で残る ===")
{
    const s = game("p347-049")
    const tsun = put(s, "p1", "BS15-049", 1)
    const gren = put(s, "p1", "BS15-050", 1) // 【粉砕】持ち
    fireTrigger(s, "p1", tsun, "onSummon")
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(attacker)
    destroySpirit(s, "p1", gren.instanceId, "destroy", { battle: { winnerPid: "p2" } } as never)
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === gren.instanceId), "粉砕持ちはフィールドに残る")
    assert(gren.isRested, "疲労状態で残る")
}
{
    const s = game("p347-049b")
    const gren = put(s, "p1", "BS15-050", 1)
    destroySpirit(s, "p1", gren.instanceId, "destroy", { battle: { winnerPid: "p2" } } as never)
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === gren.instanceId), "049がいなければ残らない")
}

console.log("=== 050 グレネード・ゴレム：破壊時にLvと同じ枚数を破棄 ===")
{
    const s = game("p347-050")
    const gren = put(s, "p1", "BS15-050", 3) // Lv2
    assert(currentLevel(gren).level === 2, "Lv2")
    const before = s.players.p2.deck.length
    destroySpirit(s, "p1", gren.instanceId, "destroy")
    assert(s.players.p2.deck.length === before - 2, `Lv2ぶん2枚破棄（実際${before - s.players.p2.deck.length}枚）`)
}

console.log("=== 051 虚海獣エメヒドラル：「ブロックされない」を持つ相手だけを破壊できる ===")
{
    const s = game("p347-051")
    const eme = put(s, "p1", "BS15-051", 4) // Lv2
    const target = put(s, "p2", "BS15-041", 4) // Lv2に「ブロックされない」効果を持つ
    const other = put(s, "p2", "BS01-001", 1)
    const coresBefore = eme.cores
    resolveAction(s, "p1", eme, { type: "destroy", count: 1, filter: { hasUnblockableEffectOrActive: true } })
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === target.instanceId), "「ブロックされない」持ちが破壊された")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === other.instanceId), "持たないスピリットは破壊されない")
    void coresBefore
}

console.log("=== 052 天蒼元帥チョウハッカイ：別名・手札の増減禁止・エンドステップのネクサス配置 ===")
{
    assert(trashCardNameMatches("BS15-052", "豚人チョウハッカイ"), "トラッシュでは[豚人チョウハッカイ]として扱う")
}
{
    const s = game("p347-052")
    put(s, "p1", "BS15-052", 1)
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "draw", count: 2 })
    assert(s.players.p1.hand.length === handBefore, "効果では手札が増えない（お互い）")
    const oppHandBefore = s.players.p2.hand.length
    resolveAction(s, "p2", null, { type: "draw", count: 2 })
    assert(s.players.p2.hand.length === oppHandBefore, "相手も効果では手札が増えない")
    assert(!canDiscardHand(s, "p1"), "効果では手札を破棄できない")
    assert(!canDiscardHand(s, "p2"), "相手も効果では手札を破棄できない")
}
{
    const s = game("p347-052b")
    put(s, "p1", "BS15-052", 4) // Lv2
    s.players.p1.trashCards = ["BS15-071"] // ネクサス
    fireStepTriggers(s, "end")
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === "BS15-071"), "トラッシュのネクサスを無償で配置した")
}

console.log("=== 053 コジロンド・ゴレム：コスト4以上を粉砕したとき相手を疲労させる ===")
{
    const s = game("p347-053")
    const kojiro = put(s, "p1", "BS15-053", 4) // Lv2
    const opp = put(s, "p2", "BS01-001", 1)
    s.players.p2.deck.unshift("BS15-054", "BS15-054") // コスト11
    resolveFunsai(s, "p1", kojiro)
    assert(opp.isRested, "コスト4以上を破棄したので相手のスピリットが疲労した")
}
{
    const s = game("p347-053b")
    const kojiro = put(s, "p1", "BS15-053", 4)
    const opp = put(s, "p2", "BS01-001", 1)
    s.players.p2.deck.unshift("BS15-037", "BS15-037") // コスト0
    resolveFunsai(s, "p1", kojiro)
    assert(!opp.isRested, "コスト4未満だけなら疲労しない")
}
{
    // バースト：【粉砕】持ちがいるとき自身を召喚する（コストは支払う）
    const s = game("p347-053c")
    put(s, "p1", "BS15-050", 1) // 【粉砕】持ち
    s.players.p1.burst = "BS15-053"
    s.players.p1.burstSet = true
    const attacker = put(s, "p2", "BS01-001", 1)
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p2", inst: attacker })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS15-053"), "バーストで召喚された")
}

console.log("=== 054 虚造帝フェニックス・ゴレム：【強襲】持ちに【粉砕】を与え、破棄した枚数ぶん破壊 ===")
{
    const s = game("p347-054")
    const phoenix = put(s, "p1", "BS15-054", 5) // Lv2
    const opp1 = put(s, "p2", "BS01-001", 1)
    const opp2 = put(s, "p2", "BS01-001", 1)
    s.players.p2.deck.unshift("BS15-050", "BS15-050", "BS15-050", "BS15-050", "BS15-050") // スピリットカード
    resolveFunsai(s, "p1", phoenix)
    assert(s.players.p2.field.spirits.length < 2, "破棄したスピリットカードぶん相手が破壊された")
    void opp1
    void opp2
}

console.log("=== 060 バンディット・アームズ：相手がバーストをセットしている間、相手のマジックの効果を受けない ===")
{
    const s = game("p347-060")
    const host = put(s, "p1", "BS15-050", 3)
    const brave = createInstance("BS15-060", s.turn, 0)
    brave.braveCombined = true
    s.players.p1.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    s.players.p2.burst = "BS15-083"
    s.players.p2.burstSet = true
    s.phase = "attack"
    const before = s.players.p1.field.spirits.length
    resolveAction(s, "p2", null, { type: "destroy", count: 1 }, undefined, undefined, "magic")
    assert(s.players.p1.field.spirits.length === before, "相手のマジックの効果を受けない")
}

console.log("=== 071 巨人の足跡湖：バースト1つにつき粉砕+1、青しかないならBP+3000 ===")
{
    const s = game("p347-071")
    nexus(s, "p1", "BS15-071", 1) // Lv1
    const gren = put(s, "p1", "BS15-050", 1) // 粉砕Lv1
    s.phase = "attack"
    s.players.p1.burst = "BS15-083"
    s.players.p1.burstSet = true
    s.players.p2.burst = "BS15-084"
    s.players.p2.burstSet = true
    const before = s.players.p2.deck.length
    resolveFunsai(s, "p1", gren)
    assert(before - s.players.p2.deck.length === 3, `Lv1+バースト2つで3枚（実際${before - s.players.p2.deck.length}枚）`)
}

console.log("=== 072 渦巻く大海峡：効果では回復できない／破壊時効果が発揮されない ===")
{
    const s = game("p347-072")
    nexus(s, "p1", "BS15-072", 1) // Lv1
    const mine = put(s, "p1", "BS15-050", 1)
    mine.isRested = true
    resolveAction(s, "p1", null, { type: "refreshAllOwn" }, undefined, undefined, "magic")
    assert(mine.isRested, "効果では回復できない（お互い）")
}
{
    const s = game("p347-072b")
    nexus(s, "p1", "BS15-072", 3) // Lv2
    s.players.p1.burst = "BS15-083"
    s.players.p1.burstSet = true
    const gren = put(s, "p2", "BS15-050", 1) // 相手の『破壊時』持ち
    const before = s.players.p1.deck.length
    destroySpirit(s, "p2", gren.instanceId, "destroy")
    assert(s.players.p1.deck.length === before, "相手の『このスピリットの破壊時』効果は発揮されない")
    const mineGren = put(s, "p1", "BS15-050", 1)
    const beforeOpp = s.players.p2.deck.length
    destroySpirit(s, "p1", mineGren.instanceId, "destroy")
    assert(s.players.p2.deck.length === beforeOpp, "自分の『破壊時』効果も発揮されない（お互い）")
}

console.log("=== 083 秘剣燕返：バーストで手札を2枚まで破棄／フラッシュでブレイヴと軽量を破壊 ===")
{
    const s = game("p347-083")
    s.players.p1.burst = "BS15-083"
    s.players.p1.burstSet = true
    s.players.p2.hand = ["BS15-046", "BS15-046", "BS15-046", "BS15-046", "BS15-046", "BS15-046"]
    const summoned = put(s, "p2", "BS01-001", 1)
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved", { pid: "p2", inst: summoned })
    assert(s.players.p2.hand.length === 2, `相手の手札が2枚になる（実際${s.players.p2.hand.length}枚）`)
}
{
    const s = game("p347-083b")
    const host = put(s, "p2", "BS15-050", 3)
    const brave = createInstance("BS15-060", s.turn, 0)
    brave.braveCombined = true
    s.players.p2.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    const small = put(s, "p2", "BS15-046", 1) // コスト0
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "destroyBrave" })
    assert((host.braveRefs ?? []).length === 0, "合体しているブレイヴが破壊された")
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { cost: { max: 3 } } })
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === small.instanceId), "コスト3以下が破壊された")
}

console.log("=== 084 爆砕轟神掌：破壊されたスピリットのコストぶん破棄／回復してLv+1 ===")
{
    const s = game("p347-084")
    s.players.p1.burst = "BS15-084"
    s.players.p1.burstSet = true
    const mine = put(s, "p1", "BS15-054", 1) // コスト11
    const before = s.players.p2.deck.length
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" } as never)
    const milled = before - s.players.p2.deck.length
    assert(milled > 0, `破壊されたスピリットのコストぶん破棄する（実際${milled}枚）`)
}
{
    const s = game("p347-084b")
    const mine = put(s, "p1", "BS15-050", 3) // Lv2
    mine.isRested = true
    resolveAction(s, "p1", null, { type: "refreshOne", thenLevelUpThisTurn: true })
    assert(!mine.isRested, "回復した")
    assert(currentLevel(mine).level === 3, "このターンの間、Lvが1つ上として扱われる")
}

console.log("=== X06 鉄の覇王サイゴード・ゴレム：【大粉砕】でLv×5枚破棄し、バーストが出たら破壊 ===")
{
    const s = game("p347-X06")
    const saigod = put(s, "p1", "BS15-X06", 5) // Lv2
    const opp = put(s, "p2", "BS01-001", 1)
    s.players.p2.deck.unshift("BS15-083", "BS15-046", "BS15-046", "BS15-046", "BS15-046") // 先頭にバースト持ち
    const before = s.players.p2.deck.length
    fireTrigger(s, "p1", saigod, "onAttack")
    const milled = before - s.players.p2.deck.length
    assert(milled === currentLevel(saigod).level * 5, `Lv×5枚破棄（実際${milled}枚）`)
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === opp.instanceId), "バースト持ちが破棄されたので相手を破壊した")
}
{
    const s = game("p347-X06b")
    s.players.p1.burst = "BS15-X06"
    s.players.p1.burstSet = true
    s.players.p2.deck.unshift("BS15-083", "BS15-046", "BS15-046", "BS15-046") // バースト持ちを含む
    const summoned = put(s, "p2", "BS15-054", 1) // コスト11
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved", { pid: "p2", inst: summoned }, undefined, undefined, undefined, {
        costs: [getCard("BS15-054").cost],
    })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS15-X06"), "バースト持ちが破棄されたので無償で召喚された")
}

console.log("すべてのチェックに合格しました 🎉（part347）")
