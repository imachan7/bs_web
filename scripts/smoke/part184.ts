// smoke パート184（第九弾「超星」＝赤16枚）
//
// 新しく足した器の確認:
//   fieldEvent.colorFilter を ownSpiritSummoned でも使えるようにした /
//   aura.reductionColorsAtLeast / symbolFix.phaseTurn / keywordGrant.minBp /
//   immunityGrant.keywordFilter / costMod.setToCounter="ownLife" /
//   TargetFilter.keywords（OR）/ lifeCharge.upTo / costDiscardHandKeywordThenDraw
import {
    assert,
    createGame,
    createInstance,
    effectiveBp,
    effectiveCost,
    fireStepTriggers,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    spiritHasKeyword,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"
import { instanceSymbolCount } from "../../shared/rules"

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
const PLAIN = "BS01-001" // ゴラドン（赤のバニラ）

console.log("=== BS09-002 フタバニア：自分の青のスピリットが召喚されたときだけ発揮する ===")
{
    const s: GameState = createGame("bs09-002", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    put(s, "p1", "BS09-002", 1)
    const enemy = put(s, "p2", PLAIN, 1) // BP1000（BP2000以下）
    // 赤のスピリットの召喚では発揮しない
    const red = put(s, "p1", PLAIN, 1)
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned", { pid: "p1", inst: red }, ["red"], undefined, undefined, {
        families: getCard(red.cardId).family,
    })
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === enemy.instanceId), "赤の召喚では発揮しない")
    // 青のスピリット（BS09-001 ヨロイリザドンは colorAs で青を持つ）の召喚では発揮する
    const blue = put(s, "p1", "BS09-001", 1)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p1", "ownSpiritSummoned", { pid: "p1", inst: blue }, ["red", "blue"], undefined, undefined, {
        families: getCard(blue.cardId).family,
    })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === enemy.instanceId), "青の召喚ではBP2000以下を破壊する")
}

console.log("=== BS09-003 角竜人ドラケン Lv2：軽減シンボルを2色以上持つ味方をBP+2000 ===")
{
    const s: GameState = createGame("bs09-003", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    put(s, "p1", "BS09-003", 3) // Lv2
    // BS09-002 フタバニアの軽減は red/blue の2色
    const twoColors = put(s, "p1", "BS09-002", 1)
    // BS09-003 自身の軽減は red/red の1色
    const oneColor = put(s, "p1", "BS09-012", 1) // purple/purple＝1色
    refreshLevelAsOverrides(s)
    assert(new Set(getCard("BS09-002").reduction).size === 2, "前提：フタバニアの軽減は2色")
    assert(new Set(getCard("BS09-012").reduction).size === 1, "前提：ボーギーの軽減は1色")
    assert(effectiveBp(s, "p1", twoColors) === getCard("BS09-002").levels[0]!.bp + 2000, "軽減2色のスピリットはBP+2000")
    assert(effectiveBp(s, "p1", oneColor) === getCard("BS09-012").levels[0]!.bp, "軽減1色のスピリットは変わらない")
}

console.log("=== BS09-008 炎皇帝アグニフォン：自分のアタックステップだけシンボルを2つにする ===")
{
    const s: GameState = createGame("bs09-008", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    const agni = put(s, "p1", "BS09-008", 3) // Lv2・系統「皇獣」
    s.turnPlayer = "p1"
    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(agni) === 1, "メインステップではシンボルは元のまま")
    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(agni) === 2, "自分のアタックステップではシンボル2つになる")
    s.turnPlayer = "p2"
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(agni) === 1, "相手のアタックステップでは元のまま")
}

console.log("=== BS09-056 星創られし場所：BP8000以上の味方に【激突】を与える ===")
{
    const s: GameState = createGame("bs09-056", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS09-056", 0) // Lv1
    const big = put(s, "p1", "BS09-008", 3) // Lv2 BP8000
    const small = put(s, "p1", PLAIN, 1) // BP1000
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", big, "clash"), "BP8000のスピリットには【激突】が付く")
    assert(!spiritHasKeyword(s, "p1", small, "clash"), "BP1000のスピリットには付かない")
}

console.log("=== BS09-055 転生の谷：【転召】持ちを1枚捨ててドロー+1／【転召】持ちは相手の効果で手札に戻らない ===")
{
    const s: GameState = createGame("bs09-055", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    putNexus(s, "p1", "BS09-055", 0) // Lv1
    // 手札に【転召】持ちが無ければ発揮しない
    s.players.p1.hand = [PLAIN]
    const handBefore = s.players.p1.hand.length
    fireStepTriggers(s, "draw")
    assert(s.players.p1.hand.length === handBefore, "【転召】持ちが手札に無ければドローは増えない")
    // 【転召】持ち（BS09-009 烈火の勇者皇アーク）を手札に置くと、1枚捨てて1枚引く
    s.players.p1.hand = [PLAIN, "BS09-009"]
    fireStepTriggers(s, "draw")
    assert(!s.players.p1.hand.includes("BS09-009"), "【転召】持ちがコストとして破棄される")
    assert(s.players.p1.trashCards.includes("BS09-009"), "破棄したカードはトラッシュへ")
    assert(s.players.p1.hand.length === 2, "1枚捨てて1枚引くので手札枚数は変わらない")
}
{
    const s: GameState = createGame("bs09-055b", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS09-055", 2) // Lv2
    const tensho = put(s, "p1", "BS09-009", 1) // 【転召】持ち
    const plain = put(s, "p1", PLAIN, 1)
    refreshLevelAsOverrides(s)
    // 相手（p2）の効果で自分（p1）のスピリットを手札に戻そうとする
    resolveAction(s, "p2", null, { type: "returnToHand", count: 2 })
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === tensho.instanceId), "【転召】持ちは相手の効果で手札に戻らない")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === plain.instanceId), "【転召】を持たないスピリットは戻る")
}

console.log("=== BS09-067 ビッグバンエナジー：手札の「星竜」のコストを自分のライフと同じ数にする ===")
{
    const s: GameState = createGame("bs09-067", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    const card = getCard("BS09-005") // 銀河竜アンドロメテオス（系統「星竜」・コスト4）
    assert(card.family.includes("星竜"), "前提：BS09-005 は「星竜」")
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, undefined, "magic", undefined, undefined, "BS09-067")
    s.players.p1.life = 2
    assert(effectiveCost(s, "p1", card) === 2, "ライフ2ならコスト2になる")
    s.players.p1.life = 5
    assert(effectiveCost(s, "p1", card) === 5, "ライフ5ならコスト5になる")
}

console.log("=== BS09-068 ランドマイン：指定5キーワードのいずれかを持つ相手1体を破壊 ===")
{
    const s: GameState = createGame("bs09-068", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    const clash = put(s, "p2", "BS09-004", 3) // 【激突】＝対象外
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { keywords: ["awaken", "jugeki", "soku", "kobo", "funsai"] } })
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === clash.instanceId), "【激突】だけの相手は対象にならない")
    const awaken = put(s, "p2", "BS01-013", 1) // タウロスナイト＝【覚醒】持ち
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { keywords: ["awaken", "jugeki", "soku", "kobo", "funsai"] } })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === awaken.instanceId), "【覚醒】持ちは破壊される")
}

console.log("=== BS09-X35 超神星龍ジークヴルム・ノヴァ：ライフが5になるようにボイドからコアを置く ===")
{
    const s: GameState = createGame("bs09-x35", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.players.p1.life = 2
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "lifeCharge", count: 0, upTo: 5 })
    assert(s.players.p1.life === 5, "ライフ2から5まで補充される")
    assert(s.players.p1.reserve === reserveBefore, "ボイドから置くのでリザーブは減らない")
    resolveAction(s, "p1", null, { type: "lifeCharge", count: 0, upTo: 5 })
    assert(s.players.p1.life === 5, "すでに5ならそれ以上は増えない")
}
