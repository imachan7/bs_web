// smoke パート257（BS10青バッチ：俊星流れるコロッセオ／蒼天大聖モンゴクウの2枚を新規構造化。2026-08-28）
//
// 新設した機構:
//   - kind:"trashNameAs"（トラッシュにあるカードを別名として扱う。shared/rules.trashCardNameMatchesに集約）
//   - kind:"levelAs" target:"ownSpiritsAll"（発生源の持ち主のスピリットすべて。既存の levelAs 器への追加）
//   - globalConstraint type:"voidCoreBlockedOutsideCoreStep"（EffectModules.voidCorePlacementBlocked）
// それ以外は既存の器（magicRestriction colorLockOpponent／bpBuffSuppression／lendSelfThisTurn）で書けた。
// ⚠️ cardId はハードコードせず、名前をカードデータで機械検証してから使う。
import {
    act,
    assert,
    createGame,
    createInstance,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { getCard } from "../../server/src/logic/GameState"
import { currentLevel } from "../../shared/rules"
import { trashCardNameMatches } from "../../shared/rules"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-095").name === "俊星流れるコロッセオ", "BS10-095 は俊星流れるコロッセオ")
    assert(getCard("BS10-056").name === "蒼天大聖モンゴクウ", "BS10-056 は蒼天大聖モンゴクウ")
    assert(getCard("BS03-071").name === "戦闘獣ブルトップ" && getCard("BS03-071").symbol.includes("blue"), "BS03-071は青シンボル")
    assert(getCard("BS03-141").name === "ビルドアップ" && getCard("BS03-141").colors.includes("blue"), "BS03-141は青マジック")
    assert(getCard("BS01-135").name === "パワーオーラ" && getCard("BS01-135").colors.includes("green"), "BS01-135は緑マジック")
    assert(getCard("BS01-016").name === "スケルトン・ジョウ" && getCard("BS01-016").levels.length === 3, "BS01-016は3レベル")
}

console.log("=== BS10-095 Lv1：相手は自分のフィールドの色と一致しないマジックを使用できない ===")
{
    const s = base("t257-095-colorlock")
    putNexus(s, "p1", "BS10-095", 0) // Lv1
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了（p2ターンへ）")
    s.players.p2.hand[0] = "BS01-135" // 緑マジック
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) !== null,
        "p2フィールドに青シンボルが無いため緑マジックは使用できない",
    )
    s.players.p2.field.spirits.push(createInstance("BS03-071", s.turn, 1)) // 青シンボルを得る
    s.players.p2.hand[0] = "BS03-141" // 青マジック
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "青シンボルを得たので青マジックは使用できる",
    )
}

console.log("=== BS10-095 Lv2：自分のアタックステップ中、相手のBP増加効果は発揮されない ===")
{
    const s = base("t257-095-bpsup")
    putNexus(s, "p1", "BS10-095", 1) // Lv2
    s.turnPlayer = "p1"
    s.phase = "attack"
    const oppTarget = put(s, "p2", "BS01-001", 1)
    resolveAction(s, "p2", null, { type: "bpBuff", amount: 1000 }, oppTarget.instanceId)
    assert(oppTarget.tempBpBuff === 0, "相手（p2）の効果によるBP増加は発揮されない")

    const ownTarget = put(s, "p1", "BS01-001", 1)
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 1000 }, ownTarget.instanceId)
    assert(ownTarget.tempBpBuff === 1000, "自分（p1）の効果によるBP増加は普通に発揮される")
}

console.log("=== BS10-095 Lv2：自分のアタックステップ以外では相手のBP増加は普通に効く ===")
{
    const s = base("t257-095-bpsup-off")
    putNexus(s, "p1", "BS10-095", 1) // Lv2
    s.turnPlayer = "p1"
    s.phase = "main" // アタックステップ以外
    const oppTarget = put(s, "p2", "BS01-001", 1)
    resolveAction(s, "p2", null, { type: "bpBuff", amount: 1000 }, oppTarget.instanceId)
    assert(oppTarget.tempBpBuff === 1000, "アタックステップ以外では相手のBP増加も発揮される")
}

console.log("=== BS10-056 節1：トラッシュにあるこのカードは[猿人モンゴクウ]として一致する ===")
{
    assert(trashCardNameMatches("BS10-056", "猿人モンゴクウ") === true, "BS10-056はトラッシュで「猿人モンゴクウ」に一致")
    assert(trashCardNameMatches("BS10-056", "存在しない名前") === false, "無関係な名前には一致しない")

    const s = base("t257-056-trashname")
    s.players.p1.trashCards.push("BS10-056")
    resolveAction(s, "p1", null, { type: "recoverSpiritFromTrash", count: 1, nameIncludes: "猿人モンゴクウ" })
    assert(s.players.p1.hand.includes("BS10-056"), "recoverSpiritFromTrashのnameIncludesがtrashNameAs別名にも一致し回収できる")
    assert(!s.players.p1.trashCards.includes("BS10-056"), "回収後はトラッシュから消える")
}

console.log("=== BS10-056 節2：召喚時、自分のスピリットすべてが最高Lv扱いになる（解決後の召喚にも効く） ===")
{
    const s = base("t257-056-levelas")
    const oldSpirit = put(s, "p1", "BS01-016", 1) // Lv1（cores1）。最高Lv3
    assert(currentLevel(oldSpirit).level === 1, "召喚前はLv1のまま")

    s.players.p1.hand[0] = "BS10-056"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "BS10-056の召喚に成功")
    refreshLevelAsOverrides(s)
    assert(currentLevel(oldSpirit).level === 3, "既存の自分のスピリットは召喚時に最高Lv扱いになる")

    s.players.p1.hand[0] = "BS01-016"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "2体目の召喚に成功")
    refreshLevelAsOverrides(s)
    const newSpirit = s.players.p1.field.spirits[s.players.p1.field.spirits.length - 1]!
    assert(getCard(newSpirit.cardId).cardId === "BS01-016", "2体目は同じカード")
    assert(currentLevel(newSpirit).level === 3, "解決より後にこのターン召喚したスピリットにも効く")

    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了（p2ターンへ）")
    refreshLevelAsOverrides(s)
    assert(currentLevel(oldSpirit).level === 1, "次のターンにはlevelAsの貸与が切れてLv1に戻る")
}

console.log("=== BS10-056 節3：コアステップ以外はボイドからフィールド/リザーブへコアを置けない ===")
{
    const s = base("t257-056-voidcore")
    put(s, "p1", "BS10-056", 1) // Lv1
    const reserveBefore = s.players.p1.reserve
    s.phase = "main"
    resolveAction(s, "p1", null, { type: "coreGain", count: 2 })
    assert(s.players.p1.reserve === reserveBefore, "コアステップ以外はボイドからリザーブへ置けない")

    s.phase = "core"
    resolveAction(s, "p1", null, { type: "coreGain", count: 2 })
    assert(s.players.p1.reserve === reserveBefore + 2, "コアステップならボイドからリザーブへ置ける")
}

console.log("=== BS10-056 節3：ボイドからライフへ置くのは対象外（フィールド/リザーブ限定） ===")
{
    const s = base("t257-056-voidlife")
    const spirit = put(s, "p1", "BS10-056", 1) // Lv1
    s.phase = "main" // コアステップ以外でも
    const lifeBefore = s.players.p1.life
    resolveAction(s, "p1", spirit, { type: "lifeCharge", count: 1, from: "void" })
    assert(s.players.p1.life === lifeBefore + 1, "ボイドからライフへの補充はコアステップ以外でも通る")
}

console.log("すべてのチェックに合格しました 🎉（part257）")
