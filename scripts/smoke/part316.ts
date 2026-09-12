// smoke パート316（BS14 白バッチ20枚：BS14-034〜044/070/082〜084/103〜106/X04）
// 新設した器: AuraCounter { ownColor: Color }／kind:"blockTriggersAsAttackGrant".whileOwnBurstSet／
// action:"markSuppressTriggerThisTurn"（CardInstance.suppressedTriggersThisTurn）／
// globalConstraint "handImmuneForPid".includeNexus／
// globalConstraint "ownLifeFloor".costSelfToTrash/then（EffectModules.tryOwnLifeFloorByCost）／
// kind:"fieldEvent" event:"ownBurstActivated" condition.ownBurstSet／action:"returnToHandCostBudget"
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    fireStepTriggers,
    getCard,
    hasKeyword,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { placeBurst, hasBlockTriggersAsAttack } from "../../server/src/logic/EffectModules"
import { fireFieldEventTriggers, fireTrigger, resolveMagic } from "../../server/src/logic/triggers"
import { destroySpirit } from "../../server/src/logic/removal"
import { activeConstraints, hasHeavyArmorAgainst } from "../../shared/rules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: BS14白カード定義（cardIdのズレ検出） ===")
{
    assert(getCard("BS14-034").name === "スリー・レッガー", "BS14-034はスリー・レッガー")
    assert(getCard("BS14-041").name === "バスター・フェンリルキャノン", "BS14-041はバスター・フェンリルキャノン")
    assert(getCard("BS14-043").name === "月光姫マーニ", "BS14-043は月光姫マーニ")
    assert(getCard("BS14-084").name === "永久凍土の王都", "BS14-084は永久凍土の王都")
    assert(getCard("BS14-X04").name === "氷の覇王ミブロック・バラガン", "BS14-X04は氷の覇王ミブロック・バラガン")
}

console.log("=== BS14-034 スリー・レッガー：アタック不可 + バースト中BP+3000 ===")
{
    const s = game("t316-034")
    const spirit = put(s, "p1", "BS14-034", 1)
    assert(activeConstraints(s, "p1", spirit).some((c) => c.type === "cantAttack"), "アタックできない")
    assert(effectiveBp(s, "p1", spirit) === 2000, "バースト未セット時はBP2000のまま")
    placeBurst(s, "p1", "BS14-104")
    assert(effectiveBp(s, "p1", spirit) === 5000, "バーストをセットしている間BP+3000")
}

console.log("=== BS14-035 ラクーンガード：Lv2【重装甲：白】 ===")
{
    const s = game("t316-035")
    const spirit = put(s, "p1", "BS14-035", 2)
    refreshLevelAsOverrides(s)
    assert(currentLevel(spirit).level === 2, "コア2個でLv2")
    assert(hasHeavyArmorAgainst(spirit, ["white"]), "白の【重装甲】を持つ")
    assert(!hasHeavyArmorAgainst(spirit, ["red"]), "赤には【重装甲】が効かない")
}

console.log("=== BS14-037 エゾノ・アウル：相手のアタックで回復 + バースト中ブロック時コア追加 ===")
{
    const s = game("t316-037")
    const owl = put(s, "p1", "BS14-037", 1)
    owl.isRested = true
    const attacker = put(s, "p2", "BS01-001", 1)
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p2", inst: attacker })
    assert(!owl.isRested, "相手のスピリットがアタックしたとき回復する")

    const s2 = game("t316-037b")
    const owl2 = put(s2, "p1", "BS14-037", 1)
    placeBurst(s2, "p1", "BS14-104")
    fireTrigger(s2, "p1", owl2, "onBlock")
    assert(owl2.cores === 2, "自分のバーストをセットしている間、ブロック時にボイドからコア1個")
}

console.log("=== BS14-039 ミブロック・ソルジャー：召喚時バウンス + バースト中『ミブロック』BP+2000 ===")
{
    const s = game("t316-039")
    const enemy = put(s, "p2", "BS01-001", 1)
    const handBefore = s.players.p2.hand.length
    const ministry = put(s, "p1", "BS14-039", 1)
    fireTrigger(s, "p1", ministry, "onSummon")
    assert(s.players.p2.hand.length === handBefore + 1, "召喚時に相手のスピリット1体を手札に戻す")

    const s2 = game("t316-039b")
    const mibrock = put(s2, "p1", "BS14-039", 3) // Lv2
    refreshLevelAsOverrides(s2)
    placeBurst(s2, "p1", "BS14-104")
    s2.phase = "attack"
    assert(effectiveBp(s2, "p1", mibrock) === getCard("BS14-039").levels[1]!.bp + 2000, "バースト中『ミブロック』を含む自分のスピリットはBP+2000")
}

console.log("=== BS14-040 勇機リュードロイド：破棄で無償召喚 + BP以下は自ライフ減らない + 氷壁 ===")
{
    const s = game("t316-040")
    const ryu = put(s, "p1", "BS14-040", 1)
    const weakEnemy = put(s, "p2", "BS01-001", 1) // BP1000級のはず（弱いバニラ）
    weakEnemy.isRested = false
    assert(
        activeConstraints(s, "p1", ryu).some((c) => c.type === "protectOwnLifeByBpUpToSelf"),
        "自分のBP以下の未ブロックアタックではライフが減らない、の制約を持つ",
    )
    assert(hasKeyword(ryu.cardId, "hyoheki"), "Lv2で【氷壁】を持つ（Lv2固定データなのでカード静的には常に載る）")
}

console.log("=== BS14-041 バスター・フェンリルキャノン：白1体につきブロック時BP+2000 + バースト中ブロック→アタック移し替え ===")
{
    const s = game("t316-041")
    const cannon = put(s, "p1", "BS14-041", 4) // Lv2
    refreshLevelAsOverrides(s)
    put(s, "p1", "BS14-035", 1) // 白のスピリットもう1体
    assert(effectiveBp(s, "p1", cannon) === currentLevel(cannon).bp, "ブロックしていない間はBP+されない")
    s.battle = { attackerInstanceId: "dummy", blockerInstanceId: cannon.instanceId, flashLockedPlayer: null, directed: false }
    assert(effectiveBp(s, "p1", cannon) === currentLevel(cannon).bp + 4000, "ブロック中は白2体ぶんBP+2000×2")
    s.battle = null

    const s2 = game("t316-041b")
    const cannon2 = put(s2, "p1", "BS14-041", 4) // Lv2
    refreshLevelAsOverrides(s2)
    assert(!hasBlockTriggersAsAttack(s2, "p1", cannon2), "バースト未セット時はブロック時→アタック時の移し替えが無い")
    placeBurst(s2, "p1", "BS14-104")
    assert(hasBlockTriggersAsAttack(s2, "p1", cannon2), "バースト中は系統「機獣」のブロック時効果がアタック時に発揮される")
}

console.log("=== BS14-042 鉄の機人モージ：【重装甲：緑/青】+ 同色BP比較で破壊された代わりに回復状態で残る ===")
{
    const s = game("t316-042")
    const moji = put(s, "p1", "BS14-042", 3) // Lv2
    refreshLevelAsOverrides(s)
    assert(hasHeavyArmorAgainst(moji, ["green"]) && hasHeavyArmorAgainst(moji, ["blue"]), "緑/青に【重装甲】")
    moji.isRested = true
    destroySpirit(s, "p1", moji.instanceId, "destroy", {
        sourcePid: "p2",
        battle: { attackerColors: ["green"] },
    })
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === moji.instanceId) && !moji.isRested,
        "重装甲の色とのBP比較で破壊されたとき、回復状態でフィールドに残る",
    )

    const s2 = game("t316-042b")
    const moji2 = put(s2, "p1", "BS14-042", 3) // Lv2
    refreshLevelAsOverrides(s2)
    destroySpirit(s2, "p1", moji2.instanceId, "destroy", {
        sourcePid: "p2",
        battle: { attackerColors: ["red"] },
    })
    assert(!s2.players.p1.field.spirits.some((sp) => sp.instanceId === moji2.instanceId), "重装甲を持たない色に破壊されたときは通常どおり破壊される")
}

console.log("=== BS14-043 月光姫マーニ：【氷壁：赤/緑/白/青】+ 指定スピリットのアタック時効果を封じる ===")
{
    const s = game("t316-043")
    const marni = put(s, "p1", "BS14-043", 2) // Lv2
    refreshLevelAsOverrides(s)
    assert(hasKeyword(marni.cardId, "hyoheki"), "【氷壁】を持つ")
    const target = put(s, "p2", "BS01-004", 1) // ドラグノ偵察兵：『このスピリットのアタック時』BP+2000
    const baseBp = effectiveBp(s, "p2", target)
    s.phase = "attack"
    resolveAction(s, "p1", marni, { type: "markSuppressTriggerThisTurn", trigger: "onAttack" }, target.instanceId)
    assert(target.suppressedTriggersThisTurn?.includes("onAttack") === true, "指定した相手のスピリットのonAttackを抑止する印が付く")
    fireTrigger(s, "p2", target, "onAttack")
    assert(effectiveBp(s, "p2", target) === baseBp, "指定されたスピリットの『アタック時』効果は発揮されない")
}

console.log("=== BS14-044 氷河竜グレイセウス：バースト中は相手スピリット効果を受けない + コスト8以外にブロックされない ===")
{
    const s = game("t316-044")
    const dragon = put(s, "p1", "BS14-044", 3) // Lv2
    refreshLevelAsOverrides(s)
    assert(
        activeConstraints(s, "p1", dragon).some((c) => c.type === "unblockableBy" && c.costNot === 8),
        "コスト8以外のスピリットからブロックされない",
    )
    assert(
        !activeConstraints(s, "p1", dragon).some((c) => c.type === "immuneToOpponentEffects"),
        "バースト未セット時は相手スピリット効果への免疫を持たない",
    )
    placeBurst(s, "p1", "BS14-104")
    assert(
        activeConstraints(s, "p1", dragon).some((c) => c.type === "immuneToOpponentEffects" && c.against === "spirit"),
        "バーストをセットしている間、相手のスピリットの効果を受けない",
    )
}

console.log("=== BS14-070 ダイヤドカリ：スピリット状態でアタック不可 + 合体時ブロックでBP+5000 ===")
{
    const s = game("t316-070")
    const brave = put(s, "p1", "BS14-070", 1)
    assert(activeConstraints(s, "p1", brave).some((c) => c.type === "cantAttack"), "スピリット状態のときアタックできない")
}

console.log("=== BS14-082 五角形の砦：手札はネクサス含め相手の効果を受けない + ドロー以外の相手ドローで1枚ドロー ===")
{
    const s = game("t316-082")
    const nexus = createInstance("BS14-082", s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    s.turnPlayer = "p2"
    const deckBefore = s.players.p1.deck.length
    fireFieldEventTriggers(s, "p1", "opponentDrewByEffect")
    assert(s.players.p1.deck.length === deckBefore - 1, "ドローステップ以外で相手がドローしたとき自分もドローできる")
}

console.log("=== BS14-083 氷結した瀑布：BP3000以下のバトル終了でアタックステップ終了 + 自分のスタートステップで相手ネクサスを手札に ===")
{
    const s = game("t316-083")
    const nexus = createInstance("BS14-083", s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    const weakAttacker = put(s, "p2", "BS01-001", 1) // BP1000（3000以下）
    s.phase = "attack"
    s.battle = { attackerInstanceId: weakAttacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p2", inst: weakAttacker })
    assert(s.endAttackStepAfterBattle === true, "BP3000以下のスピリットのバトルが終了したときアタックステップを終了する")
    s.battle = null

    const enemyNexus = createInstance("BS01-098", s.turn, 0)
    s.players.p2.field.nexuses.push(enemyNexus)
    fireStepTriggers(s, "start")
    assert(!s.players.p2.field.nexuses.some((n) => n.instanceId === enemyNexus.instanceId), "相手のネクサス1つを（その持ち主である相手の）手札に戻す")
    assert(s.players.p2.hand.includes("BS01-098"), "戻ったネクサスは持ち主（相手）の手札に入る")
}

console.log("=== BS14-084 永久凍土の王都：トラッシュで一切の効果を受けない + ライフ0回避（コストでこのネクサスをトラッシュへ） ===")
{
    const s = game("t316-084")
    const nexus = createInstance("BS14-084", s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    s.players.p1.life = 3
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p2", null, { type: "lifeCrush", count: 10 }, undefined, undefined, "spirit")
    assert(s.players.p1.life === 1, "ライフは0にならず1で止まる")
    assert(!s.winner, "支払えたので敗北しない")
    assert(!s.players.p1.field.nexuses.some((n) => n.instanceId === nexus.instanceId), "このネクサスは自分のトラッシュに置かれた")
    assert(s.players.p1.trashCards.includes("BS14-084"), "トラッシュにBS14-084が入っている")
    // reserveBefore + 3（lifeCrush自体がライフから減らした3個をリザーブへ） + 0（このネクサス上のコア） + 1（thenのcoreGain）
    assert(s.players.p1.reserve === reserveBefore + 4, "その後ボイドからコア1個を自分のリザーブに置く")
}

console.log("=== BS14-103 幻影氷結晶：バースト（破壊されたスピリットを手札に）その後payでフラッシュ ===")
{
    const s = game("t316-103")
    placeBurst(s, "p1", "BS14-103")
    const destroyed = createInstance("BS01-001", s.turn, 0)
    s.players.p1.trashCards.push(destroyed.cardId)
    const handBefore = s.players.p1.hand.length
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: destroyed }, undefined, undefined, undefined, {
        byOpponentEffect: true,
    })
    assert(s.players.p1.hand.length === handBefore + 1, "このバースト発動時に破壊された自分のトラッシュのスピリットカードを手札に戻す")
}

console.log("=== BS14-104 ドリームスパイラル：このターンの間、自分のスピリット破壊のたび相手を1体デッキ上へ ===")
{
    const s = game("t316-104")
    const enemy = put(s, "p2", "BS01-001", 1)
    resolveMagic(s, "p1", "BS14-104", "flash")
    const before = s.players.p2.deck.length
    const own = put(s, "p1", "BS01-001", 1)
    destroySpirit(s, "p1", own.instanceId, "destroy")
    assert(s.players.p2.deck.length === before + 1, "このターンの間、自分のスピリットが破壊されたとき相手のスピリット1体をデッキの上に戻す")
    void enemy
}

console.log("=== BS14-105 氷河零刀斬：バースト（デッキ上へ）その後payでフラッシュ（全回復・回復した個体はアタック不可） ===")
{
    const s = game("t316-105")
    placeBurst(s, "p1", "BS14-105")
    const restedOne = put(s, "p1", "BS14-035", 1)
    restedOne.isRested = true
    const alreadyRefreshed = put(s, "p1", "BS01-001", 1)
    alreadyRefreshed.isRested = false
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(!restedOne.isRested, "疲労していたスピリットは回復する")
    assert(restedOne.cantAttackThisTurn === true, "この効果で回復したスピリットはアタックできない")
    assert(!alreadyRefreshed.cantAttackThisTurn, "もともと回復状態だったスピリットはアタックできる")
}

console.log("=== BS14-106 リカバードコア：メインでライフとスピリットへコア各1個 + フラッシュでBP+3000 ===")
{
    const s = game("t316-106")
    const spirit = put(s, "p1", "BS14-035", 1) // 白のスピリット
    s.players.p1.life = 3
    resolveMagic(s, "p1", "BS14-106", "main")
    assert(s.players.p1.life === 4, "ボイドからライフにコア1個")
    assert(spirit.cores === 2, "ボイドから自分の白のスピリット1体にコア1個")
}

console.log("=== BS14-X04 氷の覇王ミブロック・バラガン：バースト自己召喚 + バースト発動後の再セット + コスト予算バウンス ===")
{
    const s = game("t316-x04")
    placeBurst(s, "p1", "BS14-X04")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-X04"), "バースト発動でこのスピリットカードを召喚する")

    const s2 = game("t316-x04b")
    put(s2, "p1", "BS14-X04", 1) // フィールドに出ている間だけこのfieldEventを持つ
    s2.players.p1.hand.push("BS14-103") // バースト効果を持つカード
    fireFieldEventTriggers(s2, "p1", "ownBurstActivated")
    assert(s2.players.p1.burstSet === true, "自分のバーストをセットしていないとき、バースト持ちカードをセットできる")

    const s3 = game("t316-x04c")
    const bulk = put(s3, "p1", "BS14-X04", 1) // コスト7
    const payer = put(s3, "p1", "BS14-044", 5) // コスト8（自分の最大コスト＝コストの高い方が予算最大化なのでこちらが自動選択される）
    const cheapEnemy = put(s3, "p2", "SD01-001", 1) // コスト0
    const handBefore = s3.players.p2.hand.length
    resolveAction(s3, "p1", bulk, { type: "returnToHandCostBudget" })
    assert(!s3.players.p1.field.spirits.some((sp) => sp.instanceId === payer.instanceId), "コストが最大の自分のスピリットが手札へ戻った（予算最大化）")
    assert(s3.players.p1.field.spirits.some((sp) => sp.instanceId === bulk.instanceId), "発生源自身はコストで劣るため選ばれない")
    assert(!s3.players.p2.field.spirits.some((sp) => sp.instanceId === cheapEnemy.instanceId), "予算(コスト8)内の相手のコスト0スピリットは手札へ戻る")
    assert(s3.players.p2.hand.length === handBefore + 1, "コスト合計まで相手のスピリットを好きなだけ手札に戻す")
}

console.log("すべてのチェックに合格しました 🎉（part316）")
