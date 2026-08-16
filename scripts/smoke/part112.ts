// smoke パート112（§5-C-2 マジックの「このターンの間」貸与：5枚）
//
// いずれも `lendSelfThisTurn` でマジック自身を仮想発生源として場に置き、
// 継続効果は同じカードの effects に levels:null / lentOnly:true で並べる形
// （docs/design/TURN_EFFECT_SOURCES.md）。
//
// 新設した機構:
//   - kind:"vanillaAsGrant" ＋ CardInstance.treatedAsVanillaContinuous ＋ 述語 instIsVanilla
//     （インスタンス単位のバニラ判定に一本化。スイッチヒッター）
//   - kind:"nexusEffectsDisabled"（effectSources が対象プレイヤーのネクサスを外す。ネクサスブロケイド）
//   - FieldEvent "ownSpiritReturnedToHand"（リターンドロー）
//   - fieldEvent の lentOnly ＋ fireFieldEventTriggers を effectSources 経由に変更（ソウルクラッシュ）
//   - nameAsGrant の lentOnly（パペットストリング）
//   - destroyExhausted の all（範囲効果として疲労スピリットをすべて破壊。ソウルクラッシュ）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic, returnSpiritToHand, fireFieldEventTriggers } from "../../server/src/logic/EffectModules"
import { cardNameContains, effectSources, instIsVanilla, spiritHasFamily } from "../../shared/rules"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number) {
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
    assert(getCard("BS03-134").name === "パペットストリング", "BS03-134 はパペットストリング")
    assert(getCard("BS04-109").name === "スイッチヒッター", "BS04-109 はスイッチヒッター")
    assert(getCard("BS05-070").name === "ソウルクラッシュ", "BS05-070 はソウルクラッシュ")
    assert(getCard("BS05-081").name === "ネクサスブロケイド", "BS05-081 はネクサスブロケイド")
    assert(getCard("BS01-123").name === "リターンドロー", "BS01-123 はリターンドロー")
    assert(getCard("BS02-056").family.includes("四道"), "BS02-056 アルカナビースト・ケンは系統「四道」")
    assert(getCard("BS03-080").family.includes("造兵"), "BS03-080 ロック・ゴレムは系統「造兵」")
    assert(getCard("BS03-080").effect !== "", "BS03-080 は効果の記述を持つ（バニラ扱い付与の検証前提）")
    assert(getCard("BS01-X02").name === "魔界七将デスペラード", "BS01-X02 は魔界七将デスペラード")
    assert(getCard("BS03-063").family.includes("想獣"), "BS03-063 ポニサスは系統「想獣」")
}

console.log("=== BS03-134 パペットストリング（メイン）：自分の黄に系統「四道」と「アルカナ」名を与える ===")
{
    const s = createGame("bs03-134-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const nonYellow = putSpirit(s, "p1", "BS01-076", 1) // レイ・ブレット（白）＝色が一致しない対照
    const target = putSpirit(s, "p1", "BS02-071", 1) // 宝石の獣カーバルク（黄・系統「想獣」）
    assert(!spiritHasFamily(s, "p1", target, "四道"), "使用前は「四道」を持たない")
    assert(!cardNameContains(target, "アルカナ"), "使用前は「アルカナ」を含まない")
    resolveMagic(s, "p1", "BS03-134", "main")
    refreshLevelAsOverrides(s)
    assert(spiritHasFamily(s, "p1", target, "四道") === true, "黄のスピリットに系統「四道」が付与される")
    assert(cardNameContains(target, "アルカナ") === true, "「アルカナ」入りとして扱われる（nameAsGrant の lentOnly）")
    assert(!spiritHasFamily(s, "p1", nonYellow, "四道"), "黄でないスピリットには付与されない（colorFilter）")
}

console.log("=== BS04-109 スイッチヒッター（メイン）：系統「造兵」をバニラとしても扱う ===")
{
    const s = createGame("bs04-109-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const golem = putSpirit(s, "p1", "BS03-080", 1) // ロック・ゴレム（造兵・効果あり）
    const other = putSpirit(s, "p1", "BS01-004", 1) // ドラグノ偵察兵（造兵でない・効果あり）
    assert(instIsVanilla(golem) === false, "使用前はバニラではない")
    resolveMagic(s, "p1", "BS04-109", "main")
    refreshLevelAsOverrides(s)
    assert(instIsVanilla(golem) === true, "系統「造兵」はバニラとしても扱われる")
    assert(instIsVanilla(other) === false, "造兵でないスピリットには付与されない（familyFilter）")
}

console.log("=== BS05-070 ソウルクラッシュ（メイン）：「魔界七将」召喚時に疲労スピリットをすべて破壊 ===")
{
    const s = createGame("bs05-070-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    const ownRested = putSpirit(s, "p1", "BS01-002", 3)
    const oppRested = putSpirit(s, "p2", "BS01-002", 3)
    const oppFresh = putSpirit(s, "p2", "BS01-001", 1)
    ownRested.isRested = true
    oppRested.isRested = true
    resolveMagic(s, "p1", "BS05-070", "main")
    // 「魔界七将」を含む名前のスピリットが召喚された体で ownSpiritSummoned を発火させる
    const seven = putSpirit(s, "p1", "BS01-X02", 1) // 魔界七将デスペラード
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned", { pid: "p1", inst: seven })
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === oppRested.instanceId),
        "相手の疲労スピリットが破壊される",
    )
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === ownRested.instanceId),
        "自分の疲労スピリットも破壊される（修飾なしの「スピリット」＝両陣営）",
    )
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === oppFresh.instanceId),
        "回復状態のスピリットは破壊されない",
    )
}

console.log("=== BS05-070：「魔界七将」以外の召喚では発火しない ===")
{
    const s = createGame("bs05-070-name", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    const oppRested = putSpirit(s, "p2", "BS01-002", 3)
    oppRested.isRested = true
    resolveMagic(s, "p1", "BS05-070", "main")
    const other = putSpirit(s, "p1", "BS01-001", 1)
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned", { pid: "p1", inst: other })
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === oppRested.instanceId),
        "名前が一致しない召喚では破壊されない（fieldEvent の nameIncludes）",
    )
}

console.log("=== BS05-081 ネクサスブロケイド（メイン）：想獣3体以上で相手ネクサスの効果を止める ===")
{
    const s = createGame("bs05-081-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const oppNexus = putNexus(s, "p2", "BS01-099", 3) // 百識の谷
    assert(
        effectSources(s, "p2").some((x) => x.instanceId === oppNexus.instanceId),
        "使用前は相手のネクサスが発生源に含まれる",
    )
    putSpirit(s, "p1", "BS03-063", 1) // 想獣
    putSpirit(s, "p1", "BS03-063", 1)
    putSpirit(s, "p1", "BS03-063", 1)
    resolveMagic(s, "p1", "BS05-081", "main")
    assert(
        !effectSources(s, "p2").some((x) => x.instanceId === oppNexus.instanceId),
        "相手のネクサスが発生源の一覧から外れる（効果が発揮されない）",
    )
    assert(
        effectSources(s, "p1").some((x) => x.cardId === "BS05-081"),
        "貸与した仮想発生源は自分側に残る",
    )
}

console.log("=== BS05-081：想獣が3体未満なら発動しない（magic の condition） ===")
{
    const s = createGame("bs05-081-cond", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const oppNexus = putNexus(s, "p2", "BS01-099", 3)
    putSpirit(s, "p1", "BS03-063", 1)
    putSpirit(s, "p1", "BS03-063", 1) // 2体しかいない
    resolveMagic(s, "p1", "BS05-081", "main")
    assert(
        effectSources(s, "p2").some((x) => x.instanceId === oppNexus.instanceId),
        "条件を満たさないので相手のネクサスは止まらない",
    )
}

console.log("=== BS01-123 リターンドロー（メイン）：自分のスピリットが手札に戻るたび1枚ドロー ===")
{
    const s = createGame("bs01-123-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const a = putSpirit(s, "p1", "BS01-002", 1)
    const b = putSpirit(s, "p1", "BS01-001", 1)
    resolveMagic(s, "p1", "BS01-123", "main")
    const handBefore = s.players.p1.hand.length
    returnSpiritToHand(s, "p1", a)
    // 戻ったカード1枚＋ドロー1枚で手札は+2
    assert(
        s.players.p1.hand.length === handBefore + 2,
        `1体戻るごとに1枚ドローする（実際+${s.players.p1.hand.length - handBefore}）`,
    )
    const handMid = s.players.p1.hand.length
    returnSpiritToHand(s, "p1", b)
    assert(
        s.players.p1.hand.length === handMid + 2,
        `2体目でもドローする（実際+${s.players.p1.hand.length - handMid}）`,
    )
}

console.log("=== BS01-123：使用していなければドローしない（lentOnly＋levels:null の確認） ===")
{
    const s = createGame("bs01-123-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const a = putSpirit(s, "p1", "BS01-002", 1)
    const handBefore = s.players.p1.hand.length
    returnSpiritToHand(s, "p1", a)
    assert(
        s.players.p1.hand.length === handBefore + 1,
        "マジックを使っていなければ戻ったカードの分だけ増える",
    )
}
