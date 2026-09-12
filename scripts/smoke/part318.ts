// smoke パート318（BS14 青バッチ20枚：BS14-056〜066/072/088〜090/111〜114/X06）
// 新設した器: effectDef kind:"freeSummonFromHandOnOwnNexusDeployed"（手札のカード自身がネクサス配置時に
// 無償召喚できる。triggers.notifyNexusDeployedが発火点）／battleWon.loserCostAtMost／
// action:"summonBurstCardFreeIfOwnNexusAtLeast"／cost.exhaustOwnNexusOne（reviveOnDestroy）／
// AuraDef.keywordsFilterへの"daifunsai"参照（実体を持たない参照専用キーワード）／
// attackTriggersAsBlockGrant.target:"self"／globalConstraint:"attackOncePerTurnByCost"／
// globalConstraint noSummonTriggerByCost.side:"opponent"／action:"discardSelfDownTo"／
// action:"destroyNexus.chooserIsTarget"／action:"millThenDestroyByCardType"／
// cantUseHandCardsForPid.cardType／globalConstraint:"braveBpBonusZero"／
// action:"opponentTrashCardToDeckBottom"／action:"destroyAllByChosenCost"／
// action:"revealOpponentDeckPickBottomRestTop"／globalConstraint noOpponentTriggerByColor.color省略（全色）
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    destroySpirit,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    spiritHasKeyword,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"
import { fireFieldEventTriggers, fireTrigger, notifyNexusDeployed, fireStepTriggers, fireBattleWonTriggers } from "../../server/src/logic/triggers"
import { attachBrave } from "../../server/src/logic/removal"
import { braveBpBonus, attackOncePerTurnByCostLimitApplies, noSummonTriggerByCost } from "../../shared/rules"
import { hasMagicRestriction } from "../../shared/cost"
import { validateCastMagic } from "../../server/src/logic/RuleValidator"

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

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: BS14青カード定義（cardIdのズレ検出） ===")
{
    assert(getCard("BS14-057").name === "ディープフィッシャー", "BS14-057はディープフィッシャー")
    assert(getCard("BS14-060").name === "ティンダロ・ハウンド", "BS14-060はティンダロ・ハウンド")
    assert(getCard("BS14-061").name === "ヤギュード・ジューベイ", "BS14-061はヤギュード・ジューベイ")
    assert(getCard("BS14-062").name === "ロック・ゴレム・カスタム", "BS14-062はロック・ゴレム・カスタム")
    assert(getCard("BS14-064").name === "レボルシング・ゼヨン", "BS14-064はレボルシング・ゼヨン")
    assert(getCard("BS14-065").name === "クロフネ・ゴレム", "BS14-065はクロフネ・ゴレム")
    assert(getCard("BS14-066").name === "虎拳聖タイガ", "BS14-066は虎拳聖タイガ")
    assert(getCard("BS14-072").name === "グランガッチ", "BS14-072はグランガッチ")
    assert(getCard("BS14-088").name === "青玉の巨大迷宮", "BS14-088は青玉の巨大迷宮")
    assert(getCard("BS14-089").name === "爆発する海底火山", "BS14-089は爆発する海底火山")
    assert(getCard("BS14-090").name === "勇壮なる船上都市", "BS14-090は勇壮なる船上都市")
    assert(getCard("BS14-111").name === "エクスキューションデストロイ", "BS14-111はエクスキューションデストロイ")
    assert(getCard("BS14-112").name === "封渦斬", "BS14-112は封渦斬")
    assert(getCard("BS14-113").name === "退魔絶刀角", "BS14-113は退魔絶刀角")
    assert(getCard("BS14-114").name === "雷神轟招来", "BS14-114は雷神轟招来")
    assert(getCard("BS14-X06").name === "千貌の魔神ニャルラ・トラップ", "BS14-X06は千貌の魔神ニャルラ・トラップ")
}

console.log("=== BS14-057ディープフィッシャー：自分のバーストをセットしているとき、召喚時にトラッシュの青ネクサスを無償配置 ===")
{
    const s = game("t318-057-a")
    s.players.p1.trashCards.push("BS14-088")
    const fisher = put(s, "p1", "BS14-057", 1)
    placeBurst(s, "p1", "BS14-030")
    fireTrigger(s, "p1", fisher, "onSummon")
    assert(
        s.players.p1.field.nexuses.some((n) => n.cardId === "BS14-088"),
        "バーストをセットしている間はトラッシュの青ネクサスを無償配置する",
    )
    assert(!s.players.p1.trashCards.includes("BS14-088"), "配置したネクサスはトラッシュから消える")
}
{
    const s = game("t318-057-b")
    s.players.p1.trashCards.push("BS14-088")
    const fisher = put(s, "p1", "BS14-057", 1)
    fireTrigger(s, "p1", fisher, "onSummon")
    assert(
        !s.players.p1.field.nexuses.some((n) => n.cardId === "BS14-088"),
        "バーストをセットしていなければ配置しない",
    )
}

console.log("=== BS14-059リペアリング・セーラス：アタック時にデッキ破棄1枚、バースト中はさらにコア設置 ===")
{
    const s = game("t318-059-a")
    s.players.p2.deck.unshift("BS01-001")
    const sea = put(s, "p1", "BS14-059", 1)
    placeBurst(s, "p1", "BS14-030")
    const before = sea.cores
    fireTrigger(s, "p1", sea, "onAttack")
    assert(s.players.p2.trashCards.includes("BS01-001"), "相手のデッキを上から1枚破棄する")
    assert(sea.cores === before + 1, "バースト中はさらにボイドからコア1個をこのスピリットに置く")
}
{
    const s = game("t318-059-b")
    s.players.p2.deck.unshift("BS01-001")
    const sea = put(s, "p1", "BS14-059", 1)
    const before = sea.cores
    fireTrigger(s, "p1", sea, "onAttack")
    assert(s.players.p2.trashCards.includes("BS01-001"), "バースト無しでも破棄はする")
    assert(sea.cores === before, "バーストが無ければコアは増えない")
}

console.log("=== BS14-060ティンダロ・ハウンド：手札のカード自身がネクサス配置時に無償召喚できる ===")
{
    const s = game("t318-060-a")
    s.players.p1.hand.push("BS14-060")
    s.interactiveTargets = false
    notifyNexusDeployed(s, "p1")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-060"),
        "自分のネクサスが配置されたとき、手札のこのカードをコストを支払わずに召喚できる",
    )
}
console.log("=== BS14-060 Lv2：BPを比べコスト3以下の相手のスピリットだけを破壊したとき回復する ===")
{
    const s = game("t318-060-b")
    const dog = put(s, "p1", "BS14-060", 3)
    dog.isRested = true
    refreshLevelAsOverrides(s)
    assert(currentLevel(dog).level === 2, "コア3個でLv2")
    s.lastBattleDestroyedCost = 3
    fireBattleWonTriggers(s, "p1", dog, "attacker")
    assert((dog.isRested as boolean) === false, "コスト3以下を破壊したとき回復する")
}
{
    const s = game("t318-060-c")
    const dog = put(s, "p1", "BS14-060", 3)
    dog.isRested = true
    refreshLevelAsOverrides(s)
    s.lastBattleDestroyedCost = 4
    fireBattleWonTriggers(s, "p1", dog, "attacker")
    assert(dog.isRested === true, "コスト4を破壊しても回復しない")
}

console.log("=== BS14-061ヤギュード・ジューベイ：バースト（相手による自分のスピリット破壊後）＝青が破壊されていたら召喚 ===")
{
    const s = game("t318-061-a")
    placeBurst(s, "p1", "BS14-061")
    const dummy = createInstance("BS01-001", s.turn, 1)
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: dummy }, ["blue"], undefined, undefined, { byOpponentEffect: true })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-061"),
        "破壊されたのが青ならバーストのこのカードを召喚する",
    )
}
{
    const s = game("t318-061-b")
    placeBurst(s, "p1", "BS14-061")
    const dummy = createInstance("BS01-001", s.turn, 1)
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: dummy }, ["red"], undefined, undefined, { byOpponentEffect: true })
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-061"),
        "破壊されたのが青でなければ召喚しない",
    )
}
console.log("=== BS14-061 Lv2：系統「覇皇」を持つ自分のスピリットすべてを最高Lvとして扱う ===")
{
    const s = game("t318-061-c")
    const jubei = put(s, "p1", "BS14-061", 4)
    assert(getCard("BS14-010").family.includes("覇皇"), "テスト前提: BS14-010は系統「覇皇」を持つ")
    const bear = put(s, "p1", "BS14-010", 1) // コア1個＝素のLv1
    refreshLevelAsOverrides(s)
    assert(currentLevel(jubei).level === 2, "ジューベイ自身はコア4個でLv2")
    const maxLevel = Math.max(...getCard("BS14-010").levels.map((l) => l.level))
    assert(currentLevel(bear).level === maxLevel, "覇皇持ちの他のスピリットはコア数によらず最高Lvとして扱われる")
}

console.log("=== BS14-062ロック・ゴレム・カスタム：【粉砕】を持ち、バースト中は【粉砕】/【大粉砕】持ちすべてがBP+2000 ===")
{
    const s = game("t318-062-a")
    const golem = put(s, "p1", "BS14-062", 1)
    assert(spiritHasKeyword(s, "p1", golem, "funsai"), "【粉砕】を持つ")
    const before = effectiveBp(s, "p1", golem)
    placeBurst(s, "p1", "BS14-030")
    const after = effectiveBp(s, "p1", golem)
    assert(after === before + 2000, "自分のバーストをセットしている間、【粉砕】持ちの自分自身もBP+2000される")
}

console.log("=== BS14-064レボルシング・ゼヨン：バースト＝赤紫緑青のネクサスを配置、フィールドに3つ以上ならこのカードを召喚 ===")
{
    const s = game("t318-064-a")
    s.players.p1.trashCards.push("BS14-088")
    putNexus(s, "p1", "BS01-098", 0)
    putNexus(s, "p1", "BS01-098", 0)
    placeBurst(s, "p1", "BS14-064")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(!s.players.p1.trashCards.includes("BS14-088"), "トラッシュの青ネクサスを配置する")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-064"),
        "配置後にネクサスが3つ以上あるのでこのスピリットカードを召喚する",
    )
}
{
    const s = game("t318-064-b")
    placeBurst(s, "p1", "BS14-064")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-064"),
        "配置できるネクサスが無くフィールドに3つ以上そろわなければ召喚しない",
    )
}
console.log("=== BS14-064 Lv2：相手によって自分のスピリットが破壊されたとき、自分のネクサス1つを疲労させることで残す ===")
{
    const s = game("t318-064-c")
    const zeyon = put(s, "p1", "BS14-064", 4)
    refreshLevelAsOverrides(s)
    assert(currentLevel(zeyon).level === 2, "コア4個でLv2")
    const victim = put(s, "p1", "BS01-001", 1)
    const nexus = putNexus(s, "p1", "BS01-098", 0)
    s.phase = "attack"
    destroySpirit(s, "p1", victim.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" }, { allowSuspend: true })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === victim.instanceId && sp.isRested === true),
        "破壊されたスピリットは疲労状態で自分のフィールドに残る",
    )
    assert(nexus.isRested === true, "コストとして自分のネクサス1つを疲労させる")
}

console.log("=== BS14-065クロフネ・ゴレム：【粉砕】を持ち、Lv2以上は破壊した相手のコストぶんデッキ破棄 ===")
{
    const s = game("t318-065-a")
    const golem = put(s, "p1", "BS14-065", 2)
    refreshLevelAsOverrides(s)
    assert(currentLevel(golem).level === 2, "コア2個でLv2")
    assert(spiritHasKeyword(s, "p1", golem, "funsai"), "【粉砕】を持つ")
    s.players.p2.deck.push("BS01-001", "BS01-001", "BS01-001")
    s.lastBattleDestroyedCost = 2
    const beforeTrash = s.players.p2.trashCards.length
    fireBattleWonTriggers(s, "p1", golem, "attacker")
    assert(s.players.p2.trashCards.length === beforeTrash + 2, "破壊した相手のコストと同じ枚数だけ相手のデッキを破棄する")
}

console.log("=== BS14-066虎拳聖タイガ：【強襲：2】を持ち、相手のアタックステップでは【強襲】がブロック時に発揮される ===")
{
    const s = game("t318-066-a")
    const tiga = put(s, "p1", "BS14-066", 1)
    assert(spiritHasKeyword(s, "p1", tiga, "kyoshu"), "【強襲】を持つ")
    tiga.isRested = true
    const nexus = putNexus(s, "p1", "BS01-098", 0)
    s.phase = "attack"
    s.turnPlayer = "p2"
    fireTrigger(s, "p1", tiga, "onBlock")
    assert((tiga.isRested as boolean) === false || nexus.isRested === true, "相手のアタックステップ中は【強襲】がブロック時に発揮される")
}

console.log("=== BS14-072グランガッチ：合体条件コスト4以上／【合体時】合体アタック時にコスト3以下を破壊 ===")
{
    const s = game("t318-072-a")
    const braveCondition = getCard("BS14-072").braveCondition
    const minCost = Array.isArray(braveCondition) ? braveCondition[0]?.minCost : braveCondition?.minCost
    assert(minCost === 4, "合体条件：コスト4以上")
    const host = put(s, "p1", "BS01-001", 1)
    const brave = createInstance("BS14-072", s.turn, 0)
    attachBrave(s, "p1", host, brave)
    refreshLevelAsOverrides(s)
    const foe = put(s, "p2", "BS01-001", 1)
    fireTrigger(s, "p1", host, "onAttack")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === foe.instanceId), "コスト3以下の相手のスピリット1体を破壊する")
}

console.log("=== BS14-088青玉の巨大迷宮：コスト3以下は1ターン1回しかアタックできない／Lv2は相手の召喚時効果を封じる ===")
{
    const s = game("t318-088-a")
    putNexus(s, "p1", "BS14-088", 0)
    const cheap = put(s, "p2", "BS01-001", 1)
    cheap.attackedThisTurn = true
    assert(attackOncePerTurnByCostLimitApplies(s, cheap), "コスト3以下のスピリットはターンに1回しかアタックできない（両陣営）")
}
{
    const s = game("t318-088-b")
    const nexus = putNexus(s, "p1", "BS14-088", 3)
    refreshLevelAsOverrides(s)
    assert(currentLevel(nexus).level === 2, "コア3個でLv2")
    s.phase = "main"
    s.turnPlayer = "p2"
    const foe = put(s, "p2", "BS01-001", 1)
    assert(noSummonTriggerByCost(s, foe, "p2"), "Lv2の間、相手のメインステップでは相手のスピリットの召喚時効果は発揮されない")
}

console.log("=== BS14-089爆発する海底火山：相手のエンドステップに、自分と相手それぞれ手札を4枚まで破棄する ===")
{
    const s = game("t318-089-a")
    putNexus(s, "p1", "BS14-089", 0)
    for (let i = 0; i < 6; i++) s.players.p1.hand.push("BS01-001")
    for (let i = 0; i < 6; i++) s.players.p2.hand.push("BS01-001")
    s.turnPlayer = "p2"
    fireStepTriggers(s, "end")
    assert(s.players.p1.hand.length === 4, "自分の手札が5枚以上のとき4枚になるまで破棄する")
    assert(s.players.p2.hand.length === 4, "相手の手札が5枚以上のとき4枚になるまで破棄する")
}
console.log("=== BS14-089 Lv2：相手のターン中、相手の手札のマジックの軽減シンボルは無いものとして扱う ===")
{
    const s = game("t318-089-b")
    const nexus = putNexus(s, "p1", "BS14-089", 1)
    refreshLevelAsOverrides(s)
    assert(currentLevel(nexus).level === 2, "コア1個でLv2")
    s.turnPlayer = "p2"
    assert(hasMagicRestriction(s, "p2", "noReductionOpponent"), "相手のターン中、相手は軽減シンボルによる軽減ができない")
}

console.log("=== BS14-090勇壮なる船上都市：合体スピリットすべての「合体時BP+」を0にする ===")
{
    const s = game("t318-090-a")
    const host = put(s, "p2", "BS01-001", 3)
    const brave = createInstance("BS10-050", s.turn, 0)
    const braveCard = getCard("BS10-050")
    if (braveCard.type === "brave" && (braveCard.braveLevels?.some((l) => l.bp > 0) ?? false)) {
        attachBrave(s, "p2", host, brave)
        refreshLevelAsOverrides(s)
        const before = braveBpBonus(s, s.players.p2, host)
        putNexus(s, "p1", "BS14-090", 0)
        const after = braveBpBonus(s, s.players.p2, host)
        assert(before > 0, "テスト前提: 合体時BP+が発生している")
        assert(after === 0, "船上都市がある間は両陣営の合体時BP+が0になる")
    } else {
        console.log("（スキップ：合体時BP+を持つブレイヴが見つからなかった）")
    }
}

console.log("=== BS14-111エクスキューションデストロイ：メインで破棄したカード種別に応じて相手が破壊、フラッシュはBP+2000 ===")
{
    const s = game("t318-111-a")
    s.players.p2.deck.unshift("BS01-001")
    const foe = put(s, "p2", "BS01-001", 1)
    resolveAction(s, "p1", null, { type: "millThenDestroyByCardType" })
    assert(s.players.p2.trashCards.includes("BS01-001"), "相手のデッキを上から1枚破棄する")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === foe.instanceId), "破棄がスピリットカードなら相手のスピリット1体を破壊する（相手が選ぶ）")
}
{
    const s = game("t318-111-b")
    s.players.p2.deck.unshift("BS01-098")
    const foeNexus = putNexus(s, "p2", "BS01-098", 0)
    resolveAction(s, "p1", null, { type: "millThenDestroyByCardType" })
    assert(!s.players.p2.field.nexuses.some((n) => n.instanceId === foeNexus.instanceId), "破棄がネクサスカードなら相手のネクサス1つを破壊する（相手が選ぶ）")
}
{
    const s = game("t318-111-c")
    const target = put(s, "p1", "BS01-001", 1)
    const before = effectiveBp(s, "p1", target)
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 2000, anySide: true }, target.instanceId)
    assert(effectiveBp(s, "p1", target) === before + 2000, "フラッシュ：このターンの間スピリット1体をBP+2000する")
}

console.log("=== BS14-112封渦斬：バースト＝このターン相手はマジックを使用できない、フラッシュはLv+1 ===")
{
    const s = game("t318-112-a")
    placeBurst(s, "p1", "BS14-112")
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved")
    s.players.p2.hand.push("BS01-133")
    const result = validateCastMagic(s, "p2", s.players.p2.hand.length - 1)
    assert(typeof result === "string", "このターンの間、相手はマジックカードを使用できない")
}
{
    const s = game("t318-112-b")
    const target = put(s, "p1", "BS01-001", 1)
    resolveAction(s, "p1", null, { type: "levelUpThisTurn" }, target.instanceId)
    assert(target.levelOverrideThisTurn !== undefined, "フラッシュ：このターンの間、自分のスピリット1体のLvを1つ上として扱う")
}

console.log("=== BS14-113退魔絶刀角：バースト＝相手のデッキ5枚破棄、フラッシュは相手のトラッシュ1枚をデッキの下へ ===")
{
    const s = game("t318-113-a")
    for (let i = 0; i < 5; i++) s.players.p2.deck.push("BS01-001")
    placeBurst(s, "p1", "BS14-113")
    const dummy = createInstance("BS01-001", s.turn, 1)
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: dummy }, undefined, undefined, undefined, { byOpponentEffect: true })
    // その後コストを支払ってフラッシュ効果（トラッシュ1枚をデッキの下に戻す）まで発揮するため、
    // 最終的なトラッシュ枚数は5から1減る。ミル自体が起きたことはログで確かめる
    assert(s.log.some((l) => l.includes("デッキを上から5枚トラッシュへ送った")), "相手のデッキを上から5枚破棄する")
}
{
    const s = game("t318-113-b")
    s.players.p2.trashCards.push("BS01-001")
    const beforeDeck = s.players.p2.deck.length
    resolveAction(s, "p1", null, { type: "opponentTrashCardToDeckBottom" })
    assert(!s.players.p2.trashCards.includes("BS01-001"), "相手のトラッシュにあるカードが1枚戻る")
    assert(s.players.p2.deck[s.players.p2.deck.length - 1] === "BS01-001", "相手のデッキの下に戻る")
    assert(s.players.p2.deck.length === beforeDeck + 1, "デッキ枚数が1増える")
}

console.log("=== BS14-114雷神轟招来：バースト＝コスト4以下から1つ指定して全破壊、フラッシュはコスト5以下を1体破壊 ===")
{
    const s = game("t318-114-a")
    const foe1 = put(s, "p2", "BS01-001", 1)
    const cost = getCard(foe1.cardId).cost
    placeBurst(s, "p1", "BS14-114")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(cost <= 4, "テスト前提: BS01-001のコストは4以下")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === foe1.instanceId), "指定したコストの相手のスピリットすべてを破壊する")
}
{
    const s = game("t318-114-b")
    const foe = put(s, "p2", "BS01-001", 1)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { cost: { max: 5 } } })
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === foe.instanceId), "フラッシュ：コスト5以下の相手のスピリット1体を破壊する")
}

console.log("=== BS14-X06千貌の魔神ニャルラ・トラップ：召喚時に相手のデッキ5枚オープン→1枚下、残りは上に戻す ===")
{
    const s = game("t318-x06-a")
    for (let i = 0; i < 5; i++) s.players.p2.deck.push("BS01-001")
    const before = s.players.p2.deck.length
    const nyarla = put(s, "p1", "BS14-X06", 1)
    fireTrigger(s, "p1", nyarla, "onSummon")
    assert(s.players.p2.deck.length === before, "5枚オープンして1枚下・4枚上に戻すのでデッキ枚数は変わらない")
}
console.log("=== BS14-X06：相手のスピリットすべての『破壊時』効果は発揮されない（色を問わない） ===")
{
    const s = game("t318-x06-b")
    put(s, "p1", "BS14-X06", 1)
    const foe = put(s, "p2", "BS01-133", 1)
    const before = s.log.length
    fireTrigger(s, "p2", foe, "onDestroy")
    assert(
        s.log.slice(before).some((l) => l.includes("発揮されなかった")),
        "相手のスピリットの『このスピリットの破壊時』効果は発揮されない",
    )
}
console.log("=== BS14-X06 Lv2：破壊時にこのスピリットのコスト以下の相手のスピリット1体を破壊する ===")
{
    const s = game("t318-x06-c")
    const nyarla = put(s, "p1", "BS14-X06", 4)
    refreshLevelAsOverrides(s)
    assert(currentLevel(nyarla).level === 2, "コア4個でLv2")
    const foe = put(s, "p2", "BS01-001", 1)
    fireTrigger(s, "p1", nyarla, "onDestroy")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === foe.instanceId), "このスピリットのコスト以下の相手のスピリット1体を破壊する")
}

console.log("すべてのチェックに合格しました 🎉（part318）")
