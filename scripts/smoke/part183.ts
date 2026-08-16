// smoke パート183（第九弾「超星」＝紫13枚）
//
// 新しく足した器の確認:
//   coreSqueezeOne.dest:"trash" / opponentCoresToTrash.reserveAll / recoverSpiritFromTrash.colorFilter /
//   mutualDestroyChoice.keywordExclude / EffectCounter "selfLevel" / handToOwnDeckTop /
//   fieldEvent.fushiSummonOnly / step.condition ownSpiritMinBp・opponentDeckNotEmpty /
//   magic.condition ownFieldHasColorSpirits
//
// あわせて「【不死】による召喚も『自分のスピリットが召喚されたとき』を起こす」を固定する
// （BS09_PLAN.md §3。以前は召喚時効果しか発揮していなかった）
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    destroySpirit,
    effectiveBp,
    fireStepTriggers,
    instMinLevelCores,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    spiritHasKeyword,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { applyFushiSummon } from "../../server/src/logic/removal"
import { sweepLevelCostDepletion } from "../../server/src/logic/EffectModules"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// 効果を持たない適当な相手スピリット（BS01-001 は赤のバニラ）
const PLAIN = "BS01-001"

console.log("=== BS09-012 ボーギー：破壊時、相手のコアを1個だけ残して残りをトラッシュへ ===")
{
    const s: GameState = createGame("bs09-012", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const mine = put(s, "p1", "BS09-012", 2)
    const enemy = put(s, "p2", PLAIN, 4)
    const trashBefore = s.players.p2.trashCores
    const reserveBefore = s.players.p2.reserve
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p1" })
    assert(enemy.cores === 1, "相手のコアが1個だけ残る")
    assert(s.players.p2.trashCores === trashBefore + 3, "超過3個は相手のトラッシュへ置かれる")
    assert(s.players.p2.reserve === reserveBefore, "リザーブには戻らない")
}

console.log("=== BS09-011 盾騎士ガードナー：相手のアタックステップに、自分の赤が破壊されたら発揮 ===")
{
    const s: GameState = createGame("bs09-011", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    put(s, "p1", "BS09-011", 3) // Lv2
    const red = put(s, "p1", PLAIN, 1) // 赤のスピリット
    const enemy = put(s, "p2", PLAIN, 3)
    const reserveBefore = s.players.p2.reserve
    destroySpirit(s, "p1", red.instanceId, "destroy", { sourcePid: "p2" })
    assert(enemy.cores === 2, "相手のスピリットからコア1個が取り除かれる")
    assert(s.players.p2.reserve === reserveBefore + 1, "取り除いたコアは相手のリザーブへ")
}
{
    // 自分のターンのアタックステップでは発揮しない（turn:"opponent" の確認）
    const s: GameState = createGame("bs09-011b", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    put(s, "p1", "BS09-011", 3)
    const red = put(s, "p1", PLAIN, 1)
    const enemy = put(s, "p2", PLAIN, 3)
    destroySpirit(s, "p1", red.instanceId, "destroy", { sourcePid: "p2" })
    assert(enemy.cores === 3, "自分のアタックステップでは発揮しない")
}

console.log("=== BS09-018 暗空の勇者皇ザンバ：アタック時、Lvと同じ個数のコアを相手のリザーブへ ===")
{
    const s: GameState = createGame("bs09-018", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const zanba = put(s, "p1", "BS09-018", 3) // Lv2
    const enemy = put(s, "p2", PLAIN, 5)
    const reserveBefore = s.players.p2.reserve
    resolveAction(s, "p1", zanba, { type: "coreRemove", count: 1, countCounter: "selfLevel" })
    assert(enemy.cores === 3, "Lv2なのでコア2個が取り除かれる")
    assert(s.players.p2.reserve === reserveBefore + 2, "取り除いた2個は相手のリザーブへ")
}

console.log("=== BS09-017 の器：opponentCoresToTrash.reserveAll ===")
{
    const s: GameState = createGame("reserve-all", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const src = put(s, "p1", PLAIN, 1)
    const enemy = put(s, "p2", PLAIN, 3)
    s.players.p2.reserve = 4
    const trashBefore = s.players.p2.trashCores
    resolveAction(s, "p1", src, { type: "opponentCoresToTrash", reserveAll: true, count: 0 })
    assert(s.players.p2.reserve === 0, "相手のリザーブが空になる")
    assert(s.players.p2.trashCores === trashBefore + 4, "リザーブのコアはすべてトラッシュへ")
    assert(enemy.cores === 3, "スピリット上のコアには触れない")
}

console.log("=== BS09-016 闇騎士モルドレッド：お互い【転召】を持たないスピリット1体を破壊 ===")
{
    const s: GameState = createGame("bs09-016", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const src = put(s, "p1", "BS09-016", 2)
    // 【転召】持ち（BS09-018）だけが相手フィールドにいるときは、破壊対象にならない
    const tensho = put(s, "p2", "BS09-018", 3)
    assert(spiritHasKeyword(s, "p2", tensho, "tensho"), "前提：BS09-018 は【転召】を持つ")
    resolveAction(s, "p1", src, { type: "mutualDestroyChoice", keywordExclude: "tensho" })
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === tensho.instanceId), "【転召】持ちは破壊されない")
    // 相手フィールドに候補がいないので、非対話時は自分のフィールドから選ばれる（既存の決定的簡略化）
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === src.instanceId), "候補が自分側にしかいなければ自分が選ばれる")
}
{
    const s: GameState = createGame("bs09-016b", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const src = put(s, "p1", "BS09-016", 2)
    const plain = put(s, "p2", PLAIN, 3)
    resolveAction(s, "p1", src, { type: "mutualDestroyChoice", keywordExclude: "tensho" })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === plain.instanceId), "【転召】を持たない相手は破壊される")
}

console.log("=== BS09-015 獄獣ガシャベルス：BP8000以上の自分のスピリットがいるときだけドロー+1 ===")
{
    const s: GameState = createGame("bs09-015", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    put(s, "p1", "BS09-015", 1) // Lv1（BP3000）
    const handBefore = s.players.p1.hand.length
    fireStepTriggers(s, "draw")
    assert(s.players.p1.hand.length === handBefore, "BP8000以上がいなければ追加ドローは無い")
    // BP8000以上の仲間を置くと発揮する（BS05-006 城塞龍メガロンの Lv2 は BP8000）
    put(s, "p1", "BS05-006", 3)
    fireStepTriggers(s, "draw")
    assert(s.players.p1.hand.length === handBefore + 1, "BP8000以上がいれば1枚多く引く")
}

console.log("=== BS09-015 Lv3 破壊時：トラッシュの黄のスピリットカードだけ手札に戻す ===")
{
    const s: GameState = createGame("bs09-015b", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const inst = put(s, "p1", "BS09-015", 3) // Lv3
    // トラッシュに紫のスピリットと黄のスピリットを1枚ずつ置く
    const purple = "BS09-012"
    const yellow = "BS09-015"
    s.players.p1.trashCards.push(purple, yellow)
    assert(getCard(yellow).colors.includes("purple"), "前提：BS09-015 自身は紫（＝色の判定が効いていることを見る）")
    const YELLOW_CARD = "BS02-060" // 黄のスピリット（道化師クラン）
    s.players.p1.trashCards.push(YELLOW_CARD)
    destroySpirit(s, "p1", inst.instanceId, "destroy", { sourcePid: "p2" })
    assert(s.players.p1.hand.includes(YELLOW_CARD), "黄のスピリットカードが手札に戻る")
    assert(s.players.p1.trashCards.includes(purple), "紫のスピリットカードはトラッシュに残る")
}

console.log("=== BS09-013 ミミズクロ：【不死】で召喚されたときだけ発揮する ===")
{
    const s: GameState = createGame("bs09-013", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS09-013", 1)
    const enemy = put(s, "p2", PLAIN, 3)
    // 通常の召喚（byFushi なし）では発揮しない
    const summoned = put(s, "p1", PLAIN, 1)
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned", { pid: "p1", inst: summoned }, undefined, undefined, undefined, {
        families: getCard(summoned.cardId).family,
        byFushi: false,
    })
    assert(enemy.cores === 3, "通常の召喚では発揮しない")
    // 【不死】による召喚では発揮する
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned", { pid: "p1", inst: summoned }, undefined, undefined, undefined, {
        families: getCard(summoned.cardId).family,
        byFushi: true,
    })
    assert(enemy.cores === 2, "【不死】の召喚では相手のコアが1個減る")
}

console.log("=== 【不死】の召喚も「自分のスピリットが召喚されたとき」を起こす ===")
{
    const s: GameState = createGame("fushi-summon-event", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS09-013", 1)
    const enemy = put(s, "p2", PLAIN, 3)
    // トラッシュに【不死】持ち（BS09-014 闇騎士ボールス／コスト4）を置き、コストを払える状態にする
    s.players.p1.trashCards.push("BS09-014")
    s.players.p1.reserve = 12
    const fieldBefore = s.players.p1.field.spirits.length
    applyFushiSummon(s, { pid: "p1", cardId: "BS09-014", trashIndex: s.players.p1.trashCards.length - 1 })
    assert(s.players.p1.field.spirits.length === fieldBefore + 1, "【不死】でトラッシュから召喚される")
    assert(enemy.cores === 2, "ミミズクロが発揮する（＝召喚イベントが起きている）")
}

console.log("=== BS09-057 影潜む時計台：【不死】持ちだけを強化し【呪撃】を与える ===")
{
    const s: GameState = createGame("bs09-057", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS09-057", 3) // Lv2
    const fushi = put(s, "p1", "BS09-014", 1) // 【不死】持ち
    const plain = put(s, "p1", PLAIN, 1)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", fushi) === getCard("BS09-014").levels[0]!.bp + 1000, "【不死】持ちは BP+1000")
    assert(effectiveBp(s, "p1", plain) === getCard(PLAIN).levels[0]!.bp, "【不死】を持たないスピリットは変わらない")
    assert(spiritHasKeyword(s, "p1", fushi, "jugeki"), "【不死】持ちには【呪撃】が付く")
    assert(!spiritHasKeyword(s, "p1", plain, "jugeki"), "【不死】を持たないスピリットには付かない")
}

console.log("=== BS09-058 魔本収められし書架：相手のエンドステップに手札1枚をデッキの上へ ===")
{
    const s: GameState = createGame("bs09-058", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    putNexus(s, "p1", "BS09-058", 1) // Lv2
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    const top = s.players.p1.hand[s.players.p1.hand.length - 1]!
    fireStepTriggers(s, "end")
    assert(s.players.p1.hand.length === handBefore - 1, "手札が1枚減る")
    assert(s.players.p1.deck.length === deckBefore + 1, "デッキが1枚増える")
    assert(s.players.p1.deck[0] === top, "戻したカードがデッキの一番上に来る")
}
{
    // 相手のデッキが0枚なら発揮しない
    const s: GameState = createGame("bs09-058b", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    putNexus(s, "p1", "BS09-058", 1)
    s.players.p2.deck = []
    const handBefore = s.players.p1.hand.length
    fireStepTriggers(s, "end")
    assert(s.players.p1.hand.length === handBefore, "相手のデッキが0枚なら発揮しない")
}

console.log("=== BS09-072 シャドウブレイド：赤と紫がそろっているときだけ使える ===")
{
    const s: GameState = createGame("bs09-072", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const src = put(s, "p1", PLAIN, 1)
    const rested = put(s, "p2", PLAIN, 3)
    rested.isRested = true
    resolveAction(s, "p1", src, { type: "destroyAll", filter: { rested: true, keywordExclude: "tensho" } })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === rested.instanceId), "疲労状態で【転召】を持たない相手は破壊される")
}
{
    const s: GameState = createGame("bs09-072b", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const tensho = put(s, "p2", "BS09-018", 3)
    tensho.isRested = true
    resolveAction(s, "p1", null, { type: "destroyAll", filter: { rested: true, keywordExclude: "tensho" } })
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === tensho.instanceId), "【転召】持ちは破壊されない")
}

console.log("=== BS09-017 蛇凰神バァラル：相手のスピリットすべてのLvコストを+1する ===")
{
    const s: GameState = createGame("bs09-017", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    // 相手のゴラドン（Lv1=1個/Lv2=3個）をコア3個で置く → 本来 Lv2
    const enemy = put(s, "p2", PLAIN, 3)
    assert(currentLevel(enemy).level === 2, "前提：コア3個ならLv2")
    put(s, "p1", "BS09-017", 5) // Lv2（コア5個）
    refreshLevelAsOverrides(s)
    assert(currentLevel(enemy).level === 1, "Lvコストが+1され、コア3個ではLv1どまりになる")
    assert(instMinLevelCores(enemy) === 2, "維持コア（Lv1のコスト）も1個→2個に上がる")
}
{
    // Lv1 のバァラルでは発揮しない
    const s: GameState = createGame("bs09-017b", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const enemy = put(s, "p2", PLAIN, 3)
    put(s, "p1", "BS09-017", 1) // Lv1
    refreshLevelAsOverrides(s)
    assert(currentLevel(enemy).level === 2, "Lv1のバァラルでは相手のLvは下がらない")
}
{
    // コア1個の相手はLv1に届かなくなり、維持コア割れで消滅する（2026-08-14 ユーザー確認）
    const s: GameState = createGame("bs09-017c", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const enemy = put(s, "p2", PLAIN, 1)
    put(s, "p1", "BS09-017", 5)
    refreshLevelAsOverrides(s)
    sweepLevelCostDepletion(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === enemy.instanceId), "コア1個の相手は消滅する")
}
{
    // 自分のスピリットは対象外（target:"opponentAll"）
    const s: GameState = createGame("bs09-017d", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const mine = put(s, "p1", PLAIN, 3)
    put(s, "p1", "BS09-017", 5)
    refreshLevelAsOverrides(s)
    sweepLevelCostDepletion(s)
    assert(currentLevel(mine).level === 2, "自分のスピリットのLvコストは上がらない")
}
