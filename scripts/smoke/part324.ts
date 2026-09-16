// smoke パート324（coverage:effects で「実行実績0」の11エントリに発火テストを足す）
// 対象: BS12-081-e2 / BS13-005-e3 / BS13-034-e1 / BS13-038-e1 / BS13-040-e2 / X006-e2 /
//       BS14-019-e3 / BS14-040-e1 / BS14-049-e1 / BS14-077-e1 / BS14-109-e2
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    spiritHasKeyword,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { millDeck } from "../../server/src/logic/EffectModules"
import { attachBrave, removeCoresToTrash } from "../../server/src/logic/removal"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = false
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS12-081").name === "メロディアスハープ", "BS12-081 はメロディアスハープ")
    assert(getCard("BS13-005").name === "強暴竜ディラノ・レックス", "BS13-005 は強暴竜ディラノ・レックス")
    assert(getCard("BS13-034").name === "ミノガメン", "BS13-034 はミノガメン")
    assert(getCard("BS13-038").name === "魔女タランダ", "BS13-038 は魔女タランダ")
    assert(getCard("BS13-040").name === "金星神龍ヴィーナ・フェーザー", "BS13-040 は金星神龍ヴィーナ・フェーザー")
    assert(getCard("X006").name === "太陽極龍セブンス・アポロドラゴン", "X006 は太陽極龍セブンス・アポロドラゴン")
    assert(getCard("BS14-019").name === "シュテン・ドーガ", "BS14-019 はシュテン・ドーガ")
    assert(getCard("BS14-040").name === "勇機リュードロイド", "BS14-040 は勇機リュードロイド")
    assert(getCard("BS14-049").name === "執事ペンタン", "BS14-049 は執事ペンタン")
    assert(getCard("BS14-077").name === "骸の斜塔", "BS14-077 は骸の斜塔")
    assert(getCard("BS14-109").name === "アルターミラージュ", "BS14-109 はアルターミラージュ")
    assert(getCard("BS02-040").name === "ロブスターク", "BS02-040 はロブスターク（テスト用の【装甲：赤】持ち）")
}

console.log("=== BS12-081-e2/e3 メロディアスハープ：選んだ1体は効果すべてを失いバニラ扱いになる ===")
{
    const s = base("t324-melodious")
    const target = createInstance("BS02-040", s.turn, 4) // ロブスターク Lv2（【装甲：赤】を静的に持つ）
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p2", target, "armor"), "貸与前は【装甲】を持つ")

    resolveAction(s, "p1", null, { type: "targetChoiceLendThisTurn" }, undefined, undefined, "magic", undefined, undefined, "BS12-081")
    refreshLevelAsOverrides(s)

    assert(target.lentChoiceInstanceId === undefined, "対象インスタンス自身にはlentChoiceInstanceIdは載らない（仮想発生源側）")
    assert(target.effectsDisabledContinuous === true, "選ばれた1体は効果すべてを発揮しない状態になる")
    assert(target.treatedAsVanillaContinuous === true, "同時に効果の記述を持たないスピリットとしても扱われる")
    assert(!spiritHasKeyword(s, "p2", target, "armor"), "spiritHasKeyword経由でも【装甲】は発揮されない")
}

console.log("=== BS13-005-e3 強暴竜ディラノ・レックスLv3【合体時】：系統「地竜」の自分の合体スピリットに【超覚醒】を配る ===")
{
    const s = base("t324-diranorex")
    const host = createInstance("BS13-005", s.turn, 4) // Lv3（cores4）
    s.players.p1.field.spirits.push(host)
    refreshLevelAsOverrides(s)
    assert(!spiritHasKeyword(s, "p1", host, "superAwaken"), "合体していない間は【超覚醒】を持たない")

    // attachBraveが実戦の合体経路（braveRefs）。braveCombinedの手書きフラグはrefreshLevelAsOverrides
    // （GameEngine.handleActionが毎アクション後に呼ぶ）が無条件でリセットしてしまうため使わない
    const brave = createInstance("BS10-061", s.turn, 1)
    attachBrave(s, "p1", host, brave)
    assert(spiritHasKeyword(s, "p1", host, "superAwaken"), "合体すると自分自身（系統「地竜」）にも【超覚醒】が付く")
}

console.log("=== BS13-034-e1 ミノガメン：相手のデッキ破棄効果で破棄されたら無償召喚できる ===")
{
    const s = base("t324-minogamen")
    s.players.p1.deck = ["BS13-034", ...s.players.p1.deck]
    const before = s.players.p1.field.spirits.length
    const reserveBefore = s.players.p1.reserve
    millDeck(s, "p1", 1, "p2")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS13-034"), "コストを支払わず場に出る")
    assert(s.players.p1.field.spirits.length === before + 1, "召喚された分だけ場が増える")
    assert(s.players.p1.reserve === reserveBefore, "コストは支払っていない（リザーブは減らない）")
    assert(!s.players.p1.trashCards.includes("BS13-034"), "トラッシュには残らない")
    assert(
        s.turnConstraints.some((c) => c.type === "noDeckMillForPidThisTurn" && c.pid === "p1"),
        "召喚成立時だけ、このターンの間デッキが相手の効果で破棄されなくなる",
    )
}

console.log("--- 対照：自分の効果で破棄されても発揮しない（byの限定） ---")
{
    const s = base("t324-minogamen-self")
    s.players.p1.deck = ["BS13-034", ...s.players.p1.deck]
    millDeck(s, "p1", 1, "p1")
    assert(!s.players.p1.field.spirits.some((sp) => sp.cardId === "BS13-034"), "自分のデッキ破棄では発揮しない")
    assert(s.players.p1.trashCards.includes("BS13-034"), "トラッシュに残ったまま")
}

console.log("=== BS13-038-e1 魔女タランダ：手札のスピリットカード1枚を破棄して「導魔」を復活させる ===")
{
    const s = base("t324-taranda")
    // scope:"ownAll"のreviveOnDestroyは、破壊される個体自身は発生源から除外される
    // （removal.tsのownAllループが `source.instanceId === inst.instanceId` をskipする）。
    // そのため効果を出す側ともう1体、破壊される側の2体が要る（どちらも系統「導魔」）
    const tanda = createInstance("BS13-038", s.turn, 1) // 破壊される側 Lv1
    const source = createInstance("BS13-038", s.turn, 1) // 効果を出し続ける側（生存）Lv1
    s.players.p1.field.spirits.push(tanda, source)
    s.players.p1.hand = ["BS01-001"] // 手札にスピリットカード1枚（コストとして破棄される）
    destroySpirit(s, "p1", tanda.instanceId, "destroy")
    assert(s.players.p1.field.spirits.includes(tanda), "破壊される代わりに場に残る")
    assert(tanda.isRested === true, "戻るのは疲労状態")
    assert(s.players.p1.hand.length === 0, "手札のスピリットカードがコストとして破棄される")
    assert(s.players.p1.trashCards.includes("BS01-001"), "破棄したカードはトラッシュへ行く")
}

console.log("=== BS13-038-e1 魔女タランダ：手札にスピリットカードが無ければ支払えず、そのまま破壊される ===")
{
    const s = base("t324-taranda-nopay")
    const tanda = createInstance("BS13-038", s.turn, 1)
    const source = createInstance("BS13-038", s.turn, 1)
    s.players.p1.field.spirits.push(tanda, source)
    s.players.p1.hand = ["BS01-126"] // マジックカードだけ＝コストを支払えない
    destroySpirit(s, "p1", tanda.instanceId, "destroy")
    assert(!s.players.p1.field.spirits.includes(tanda), "コストを支払えないので復活しない")
    assert(s.players.p1.hand.length === 1, "手札は減らない")
}

console.log("=== BS13-040-e2 金星神龍ヴィーナ・フェーザーLv2：デッキ上3枚破棄で疲労状態で戻る ===")
{
    const s = base("t324-venus")
    const venus = createInstance("BS13-040", s.turn, 2) // Lv2
    s.players.p1.field.spirits.push(venus)
    s.players.p1.deck = ["BS01-001", "BS01-002", "BS01-003", "BS01-004", "BS01-005"]
    const trashBefore = s.players.p1.trashCards.length
    destroySpirit(s, "p1", venus.instanceId, "destroy")
    assert(s.players.p1.field.spirits.includes(venus), "破壊される代わりに場に残る")
    assert(venus.isRested === true, "戻るのは疲労状態")
    assert(s.players.p1.trashCards.length === trashBefore + 3, "デッキ上から3枚破棄がコストとして成立する")
    assert(s.players.p1.deck.length === 2, "デッキは3枚減る")
}

console.log("=== X006-e2 太陽極龍セブンス・アポロドラゴンLv3【合体時】：系統「神星」は自分のアタックステップに指定アタックできる ===")
{
    const s = base("t324-apollo")
    const apollo = createInstance("X006", s.turn, 5) // Lv3（cores5）
    s.players.p1.field.spirits.push(apollo)
    const targetA = createInstance("BS01-001", s.turn, 1)
    const targetB = createInstance("BS01-002", s.turn, 1)
    s.players.p2.field.spirits.push(targetA, targetB)
    // attachBraveが実戦の合体経路。act()経由のnextPhaseがrefreshLevelAsOverridesを呼び直すため、
    // 手書きのbraveCombinedフラグ（part252のショートカット）ではなくbraveRefsを使う
    const brave = createInstance("BS10-061", s.turn, 1)
    attachBrave(s, "p1", apollo, brave)
    s.turnPlayer = "p1"
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: apollo.instanceId, targetSpiritInstanceId: targetB.instanceId }) ===
            null,
        "targetFilter:anyなので、BPに関わらずどちらでも指定アタックできる",
    )
    assert(s.battle?.directedTargetInstanceId === targetB.instanceId, "指定した相手が控えられる")
}

console.log("=== BS14-019-e3 シュテン・ドーガ：自分のバースト効果で相手からトラッシュに置かれるコアが+1個 ===")
{
    const s = base("t324-shuten")
    const shuten = createInstance("BS14-019", s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(shuten)
    const victim = createInstance("BS01-001", s.turn, 3)
    s.players.p2.field.spirits.push(victim)
    refreshLevelAsOverrides(s)
    s.resolvingBurstPid = "p1" // バースト効果を解決している間だけ立つ目印
    const trashBefore = s.players.p2.trashCores
    const removed = removeCoresToTrash(s, "p2", victim, 1, "p1")
    assert(removed === 2, "指定した1個に、シュテン・ドーガのボーナス+1個が乗って2個取り除かれる")
    assert(s.players.p2.trashCores === trashBefore + 2, "相手のトラッシュコアが2個増える")
    assert(victim.cores === 1, "対象のコアは2個減る（3→1）")
}

console.log("--- 対照：バースト解決中でなければボーナスは乗らない ---")
{
    const s = base("t324-shuten-nonburst")
    const shuten = createInstance("BS14-019", s.turn, 3)
    s.players.p1.field.spirits.push(shuten)
    const victim = createInstance("BS01-001", s.turn, 3)
    s.players.p2.field.spirits.push(victim)
    refreshLevelAsOverrides(s)
    const removed = removeCoresToTrash(s, "p2", victim, 1, "p1")
    assert(removed === 1, "バースト解決中でなければボーナスは乗らない")
}

console.log("=== BS14-040-e1 勇機リュードロイド：相手のスピリットの効果で手札から破棄されたら無償召喚できる ===")
{
    const s = base("t324-ryudroid")
    s.players.p1.hand = ["BS14-040"]
    const before = s.players.p1.field.spirits.length
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p2", null, { type: "discardOpponent", count: 1, random: true }, undefined, undefined, "spirit")
    assert(s.players.p1.hand.length === 0, "手札から破棄された")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-040"), "コストを支払わず場に出る")
    assert(s.players.p1.field.spirits.length === before + 1, "召喚された分だけ場が増える")
    // summonFreeFromTrashIndexは「コストを支払わず」＝軽減コストは免除するが、維持コア（Lv1・1個）は
    // 通常どおりリザーブから置く（minogamenのapplySpiritMillFreeSummonとは別の実装経路）
    assert(s.players.p1.reserve === reserveBefore - 1, "軽減コストは免除されるが、維持コア1個はリザーブから置かれる")
    assert(!s.players.p1.trashCards.includes("BS14-040"), "トラッシュには残らない")
}

console.log("=== BS14-049-e1 執事ペンタン：相手のデッキ破棄効果で破棄されたら無償召喚できる ===")
{
    const s = base("t324-pentan")
    s.players.p1.deck = ["BS14-049", ...s.players.p1.deck]
    const before = s.players.p1.field.spirits.length
    millDeck(s, "p1", 1, "p2")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-049"), "コストを支払わず場に出る")
    assert(s.players.p1.field.spirits.length === before + 1, "召喚された分だけ場が増える")
    assert(
        s.turnConstraints.some((c) => c.type === "noDeckMillForPidThisTurn" && c.pid === "p1"),
        "召喚成立時だけ、このターンの間デッキが相手の効果で破棄されなくなる",
    )
}

console.log("=== BS14-077-e1 骸の斜塔：スピリット等の効果以外でコアを置いた相手のスピリットを疲労させる ===")
{
    const s = base("t324-hone-tower")
    const nest = createInstance("BS14-077", s.turn, 0) // Lv1
    s.players.p2.field.nexuses.push(nest)
    const spirit = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(spirit)
    refreshLevelAsOverrides(s)
    assert(!spirit.isRested, "初期状態は回復状態")
    assert(
        act(s, "p1", { type: "moveCore", instanceId: spirit.instanceId, direction: "add" }) === null,
        "p1が自分のメインステップにコアを1個手動追加",
    )
    assert(spirit.isRested, "ネクサス持ち主(p2)から見て相手(p1)の手動コア追加のため疲労する")
}

console.log("--- 対照：ネクサス持ち主自身の操作では疲労しない ---")
{
    const s = base("t324-hone-tower-own")
    const nest = createInstance("BS14-077", s.turn, 0)
    s.players.p1.field.nexuses.push(nest) // p1（ターンプレイヤー）自身が持ち主
    const spirit = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(spirit)
    refreshLevelAsOverrides(s)
    assert(
        act(s, "p1", { type: "moveCore", instanceId: spirit.instanceId, direction: "add" }) === null,
        "p1が自分のメインステップにコアを1個追加",
    )
    assert(!spirit.isRested, "ネクサス持ち主自身の操作では疲労しない")
}

console.log("=== BS14-109-e1/e2 アルターミラージュ：このターンの間、コスト3以上の自分のスピリットはBP比較で破壊されず回復状態で残る ===")
{
    const s = base("t324-altermirage")
    const big = createInstance("BS01-062", s.turn, 4) // ハングリートゥリー：コスト4
    s.players.p1.field.spirits.push(big)
    refreshLevelAsOverrides(s)

    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, undefined, "magic", undefined, undefined, "BS14-109")

    destroySpirit(s, "p1", big.instanceId, "destroy", { battle: { attackerColors: ["red"] } })
    assert(s.players.p1.field.spirits.includes(big), "BPバトルで破壊される代わりに場に残る")
    assert(big.isRested === true, "戻るのは回復状態ではなく疲労状態（revived.rested:true）")
}

console.log("--- 対照：コスト3未満は対象外 ---")
{
    const s = base("t324-altermirage-lowcost")
    const small = createInstance("BS01-001", s.turn, 1) // ゴラドン：コスト1
    s.players.p1.field.spirits.push(small)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, undefined, "magic", undefined, undefined, "BS14-109")
    destroySpirit(s, "p1", small.instanceId, "destroy", { battle: { attackerColors: ["red"] } })
    assert(!s.players.p1.field.spirits.includes(small), "コスト3未満はminCostで対象外のため通常どおり破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part324）")
