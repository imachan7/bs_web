// smoke パート314（BS14紫20種）
// バースト持ち5枚（BS14-020/095/096/097/X02）と、新設の器
// （destroy.costDiscardOwnBurst／coreSqueezeOne.all／aura.whileOwnBurstSet／
//   burst.alsoDrawIfDestroyedColor+returnSelfToHandAfter／opponentNexusCoresToTrashOne／
//   reviveOnDestroy.cost.opponentLifeOneToTrash）を確認する
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { fireFieldEventTriggers, fireTrigger } from "../../server/src/logic/triggers"
import { exhaustSpirit } from "../../server/src/logic/EffectModules"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: BS14紫カード定義（cardIdのズレ検出） ===")
{
    assert(getCard("BS14-020").name === "ナスノ・アーチャー", "BS14-020はナスノ・アーチャー")
    assert(getCard("BS14-078").name === "幽鬼集う廃都", "BS14-078は幽鬼集う廃都")
    assert(getCard("BS14-095").name === "紫魂葬", "BS14-095は紫魂葬")
    assert(getCard("BS14-096").name === "冥皇封滅呪", "BS14-096は冥皇封滅呪")
    assert(getCard("BS14-097").name === "刹那残影弓", "BS14-097は刹那残影弓")
    assert(getCard("BS14-098").name === "ダークリボーン", "BS14-098はダークリボーン")
    assert(getCard("BS14-X02").name === "呪の覇王カオティック・セイメイ", "BS14-X02は呪の覇王カオティック・セイメイ")
}

console.log("=== BS14-020ナスノ・アーチャー：バースト条件（トラッシュに紫4枚以上） ===")
{
    const s = game("nasuno-burst-ok")
    s.players.p1.burst = "BS14-020"
    s.players.p1.burstSet = true
    for (let i = 0; i < 4; i++) s.players.p1.trashCards.push("BS14-012")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-020"), "条件を満たせばこのスピリットカードを召喚する")
    assert(s.players.p1.burst === null, "召喚後はバーストエリアが空になる")

    const s2 = game("nasuno-burst-ng")
    s2.players.p1.burst = "BS14-020"
    s2.players.p1.burstSet = true
    for (let i = 0; i < 3; i++) s2.players.p1.trashCards.push("BS14-012")
    fireFieldEventTriggers(s2, "p1", "ownLifeDamaged")
    assert(!s2.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-020"), "条件未達なら召喚しない")
    assert(s2.players.p1.burst === null, "発動自体はして空振りに終わる（トラッシュへ）")
}

console.log("=== BS14-095紫魂葬：バースト（自他スピリットのコアをそれぞれトラッシュへ）＋thenPay:flash ===")
{
    const s = game("shikonso")
    s.players.p1.burst = "BS14-095"
    s.players.p1.burstSet = true
    const mySpirit = createInstance("BS14-014", s.turn, 2)
    mySpirit.cores = 5
    s.players.p1.field.spirits.push(mySpirit)
    const theirSpirit = createInstance("BS14-014", s.turn, 2)
    theirSpirit.cores = 5
    s.players.p2.field.spirits.push(theirSpirit)
    const theirNexus = createInstance("BS14-076", s.turn, 1)
    theirNexus.cores = 3
    s.players.p2.field.nexuses.push(theirNexus)
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: mySpirit }, undefined, undefined, undefined, {
        byOpponentEffect: true,
    })
    assert(mySpirit.cores === 2, "自分のスピリットのコア3個がトラッシュへ")
    assert(theirSpirit.cores === 2, "相手のスピリットのコア3個もトラッシュへ")
    assert(s.players.p1.trashCards.includes("BS14-095"), "バースト発動後はトラッシュへ")
    assert(theirNexus.cores === 0, "thenPay:flashで相手のネクサスのコアがすべてトラッシュへ")
}

console.log("=== BS14-096冥皇封滅呪：バースト（疲労状態コスト5以下を破壊）＋flash（相互破壊） ===")
{
    const s = game("meiou-fumetsuju")
    s.players.p1.burst = "BS14-096"
    s.players.p1.burstSet = true
    const target = createInstance("BS14-015", s.turn, 1) // コスト3・疲労状態
    target.isRested = true
    s.players.p2.field.spirits.push(target)
    const mySpirit = createInstance("BS14-014", s.turn, 1)
    s.players.p1.field.spirits.push(mySpirit)
    const theirOther = createInstance("BS14-014", s.turn, 1)
    s.players.p2.field.spirits.push(theirOther)
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === target.instanceId), "疲労状態コスト5以下の相手スピリットを破壊")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === mySpirit.instanceId), "flash：自分のスピリット1体を破壊した")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === theirOther.instanceId), "flash：相手も相手のスピリット1体を破壊した")
}

console.log("=== BS14-097刹那残影弓：バースト（相手コア1個をリザーブへ）＋thenPay:main（トラッシュから無償召喚・召喚時効果なし） ===")
{
    const s = game("setsuna-zaneikyu")
    s.players.p1.burst = "BS14-097"
    s.players.p1.burstSet = true
    const oppSpirit = createInstance("BS14-014", s.turn, 1)
    oppSpirit.cores = 3
    s.players.p2.field.spirits.push(oppSpirit)
    s.players.p1.trashCards.push("BS14-016") // コスト3・召喚時ドローを持つ
    const handBefore = s.players.p1.hand.length
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved")
    assert(oppSpirit.cores === 2, "相手のスピリットのコア1個がリザーブへ")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-016"), "thenPay:mainでトラッシュから無償召喚")
    assert(s.players.p1.hand.length === handBefore, "skipOnSummonのため召喚時ドローは発揮されない（手札が増えていない）")
}

console.log("=== BS14-X02呪の覇王カオティック・セイメイ：バースト（相手コア1個をトラッシュへ＋条件付きドロー＋手札へ戻る） ===")
{
    const s = game("chaotic-seimei-purple")
    s.players.p1.burst = "BS14-X02"
    s.players.p1.burstSet = true
    const mySpirit = createInstance("BS14-014", s.turn, 1)
    s.players.p1.field.spirits.push(mySpirit)
    const oppSpirit = createInstance("BS14-014", s.turn, 1)
    oppSpirit.cores = 2
    s.players.p2.field.spirits.push(oppSpirit)
    const deckBefore = s.players.p1.deck.length
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: mySpirit }, ["purple"], undefined, undefined, {
        byOpponentEffect: true,
    })
    assert(oppSpirit.cores === 1, "相手のスピリットのコア1個がトラッシュへ")
    assert(s.players.p1.deck.length === deckBefore - 1, "紫のスピリットが破壊されていたのでさらに1枚ドロー")
    assert(s.players.p1.hand.includes("BS14-X02"), "その後、このカードは手札に戻る（トラッシュではない）")
    assert(!s.players.p1.trashCards.includes("BS14-X02"), "トラッシュには置かれない")

    const s2 = game("chaotic-seimei-nonpurple")
    s2.players.p1.burst = "BS14-X02"
    s2.players.p1.burstSet = true
    const mySpirit2 = createInstance("BS03-062", s2.turn, 2) // 紫以外の破壊で条件を満たさない例
    s2.players.p1.field.spirits.push(mySpirit2)
    const oppSpirit2 = createInstance("BS14-014", s2.turn, 1)
    oppSpirit2.cores = 2
    s2.players.p2.field.spirits.push(oppSpirit2)
    const deckBefore2 = s2.players.p1.deck.length
    fireFieldEventTriggers(s2, "p1", "ownSpiritDestroyed", { pid: "p1", inst: mySpirit2 }, [], undefined, undefined, {
        byOpponentEffect: true,
    })
    assert(oppSpirit2.cores === 1, "相手のスピリットのコア1個は無条件でトラッシュへ")
    assert(s2.players.p1.deck.length === deckBefore2, "破壊されたのが紫でなければ追加ドローはしない")
    assert(s2.players.p1.hand.includes("BS14-X02"), "ドロー条件を満たさなくても手札には戻る")
}

console.log("=== BS14-X02 Lv3【呪滅撃】：相手のライフのコア1個をトラッシュに置くことで回復状態でフィールドに残る ===")
{
    const s = game("chaotic-seimei-jumetsugeki")
    const seimei = createInstance("BS14-X02", s.turn, 4)
    seimei.isRested = true
    s.players.p1.field.spirits.push(seimei)
    s.players.p2.life = 3
    destroySpirit(s, "p1", seimei.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === seimei.instanceId), "コストを支払って回復状態でフィールドに残った")
    assert(!seimei.isRested, "回復状態で残る")
    assert(s.players.p2.life === 2, "相手のライフのコア1個がトラッシュへ")

    const s2 = game("chaotic-seimei-jumetsugeki-nolife")
    const seimei2 = createInstance("BS14-X02", s2.turn, 4)
    s2.players.p1.field.spirits.push(seimei2)
    s2.players.p2.life = 0
    destroySpirit(s2, "p1", seimei2.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(!s2.players.p1.field.spirits.some((sp) => sp.instanceId === seimei2.instanceId), "相手のライフが0なら支払えず破壊される")
}

console.log("=== BS14-078幽鬼集う廃都：相手による破壊後、デッキ4枚破棄で疲労状態のまま残す（自分のアタックステップ限定） ===")
{
    const s = game("yuuki-tsudou-haito")
    const nexus = createInstance("BS14-078", s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    const target = createInstance("BS14-014", s.turn, 1)
    s.players.p1.field.spirits.push(target)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const deckBefore = s.players.p1.deck.length
    destroySpirit(s, "p1", target.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === target.instanceId), "デッキ4枚破棄を払って疲労状態のままフィールドに残った")
    assert(target.isRested, "疲労状態で残る")
    assert(s.players.p1.deck.length === deckBefore - 4, "自分のデッキを上から4枚破棄した")

    // own効果による破壊では発火しない（相手によって破壊されたときのみ）
    const s2 = game("yuuki-tsudou-haito-own")
    const nexus2 = createInstance("BS14-078", s2.turn, 1)
    s2.players.p1.field.nexuses.push(nexus2)
    const target2 = createInstance("BS14-014", s2.turn, 1)
    s2.players.p1.field.spirits.push(target2)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    destroySpirit(s2, "p1", target2.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })
    assert(!s2.players.p1.field.spirits.some((sp) => sp.instanceId === target2.instanceId), "自分の効果による破壊では発火しない")
}

console.log("=== BS14-019シュテン・ドーガ：召喚時のトラッシュ回収と、バーストセット中の系統オーラ ===")
{
    const s = game("shuten-doga")
    s.players.p1.trashCards.push("BS14-013") // 系統「魔影」ではない
    s.players.p1.trashCards.push("BS14-016") // 系統「魔影」・コスト3
    const doga = createInstance("BS14-019", s.turn, 3)
    s.players.p1.field.spirits.push(doga)
    fireTrigger(s, "p1", doga, "onSummon")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-016"), "召喚時：トラッシュの系統「魔影」コスト3以下を無償召喚")

    refreshLevelAsOverrides(s)
    const baseBp = effectiveBp(s, "p1", doga)
    s.players.p1.burstSet = true
    refreshLevelAsOverrides(s)
    const withBurst = effectiveBp(s, "p1", doga)
    assert(withBurst === baseBp + 2000 * 2, "バーストセット中は系統「魔影」1体につきBP+2000（自身とBS14-016で2体）")
    s.players.p1.burstSet = false
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", doga) === baseBp, "バーストをセットしていない間はオーラが効かない")
}

console.log("=== BS14-015トウダー：自分のバースト1つを破棄することで、疲労状態の相手のスピリット1体を破壊する ===")
{
    const s = game("touda-burst-cost")
    s.players.p1.burst = "BS14-096"
    s.players.p1.burstSet = true
    const touda = createInstance("BS14-015", s.turn, 3)
    s.players.p1.field.spirits.push(touda)
    const target = createInstance("BS14-014", s.turn, 1)
    target.isRested = true
    s.players.p2.field.spirits.push(target)
    fireTrigger(s, "p1", touda, "onDestroy")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === target.instanceId), "バーストを破棄して疲労状態の相手を破壊した")
    assert(s.players.p1.burst === null, "コストとしてバーストが破棄された")

    const s2 = game("touda-burst-cost-none")
    const touda2 = createInstance("BS14-015", s2.turn, 3)
    s2.players.p1.field.spirits.push(touda2)
    const target2 = createInstance("BS14-014", s2.turn, 1)
    target2.isRested = true
    s2.players.p2.field.spirits.push(target2)
    fireTrigger(s2, "p1", touda2, "onDestroy")
    assert(s2.players.p2.field.spirits.some((sp) => sp.instanceId === target2.instanceId), "セットしているバーストがないため発動しなかった")
}

console.log("=== BS14-022幻双龍シェイロン：召喚時に相手フィールド全体をコア1個に圧縮 ===")
{
    const s = game("gensouryu-sheylon")
    const a = createInstance("BS14-014", s.turn, 2)
    a.cores = 4
    const b = createInstance("BS14-014", s.turn, 1)
    b.cores = 3
    s.players.p2.field.spirits.push(a, b)
    const sheylon = createInstance("BS14-022", s.turn, 1)
    s.players.p1.field.spirits.push(sheylon)
    resolveAction(s, "p1", sheylon, { type: "coreSqueezeOne", count: 0, all: true })
    assert(a.cores === 1 && b.cores === 1, "相手フィールドのスピリットすべてがコア1個に圧縮される")
}

console.log("=== BS14-068ストラスト：合体時、相手のターンにこのスピリットが疲労したらドロー ===")
{
    const s = game("stlast-brave")
    const host = createInstance("BS14-014", s.turn, 3)
    s.players.p1.field.spirits.push(host)
    const strast = createInstance("BS14-068", s.turn, 1)
    strast.braveCombined = true
    s.players.p1.field.combinedBraves.push(strast)
    host.braveRefs = [{ slot: "single", instanceId: strast.instanceId }]
    s.turnPlayer = "p2"
    const deckBefore = s.players.p1.deck.length
    exhaustSpirit(s, "p1", host)
    assert(s.players.p1.deck.length === deckBefore - 1, "相手のターンに合体スピリットが疲労したのでドロー")
}

console.log("すべてのチェックに合格しました 🎉（part314）")
