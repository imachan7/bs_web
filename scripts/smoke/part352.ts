// smoke パート352（BS16-021ノウゼンサーバル・065誓いの桃園・058サテライド・バード・067氷聖女の塔：
// shinsokuPayAssist／sokuPaySourceGrant再利用／effectGrant再利用／noBurstSpiritSummonThisTurn／burstSetCost）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    handleAction,
    fireTrigger,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const NOUZEN = "BS16-021" // ノウゼンサーバル（緑・コスト2）
const CHIGIRI = "BS16-065" // 誓いの桃園（緑ネクサス）
const SATELLITE = "BS16-058" // サテライド・バード（白ブレイヴ）
const HYOTOU = "BS16-067" // 氷聖女の塔（白ネクサス）
const SEIRYUBI = "BS16-X03" // 烈の覇王セイリュービ（065のLv2が名指しする）
const SOKU_SPIRIT = "BS01-053" // リーヴォルフ（緑・コスト2・【神速】持ち）
const BURST_SPIRIT = "BS15-004" // ハンゾウ・シノビ・ドラゴン（バースト持ちスピリット）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(NOUZEN).name === "ノウゼンサーバル" && getCard(NOUZEN).cost === 2, "NOUZENはコスト2")
    assert(getCard(CHIGIRI).name === "誓いの桃園" && getCard(CHIGIRI).type === "nexus", "CHIGIRIはネクサス")
    assert(getCard(SATELLITE).name === "サテライド・バード" && getCard(SATELLITE).type === "brave", "SATELLITEはブレイヴ")
    assert(getCard(HYOTOU).name === "氷聖女の塔" && getCard(HYOTOU).type === "nexus", "HYOTOUはネクサス")
    assert(getCard(SEIRYUBI).name === "烈の覇王セイリュービ", "SEIRYUBIは烈の覇王セイリュービ")
    assert(getCard(SOKU_SPIRIT).name === "リーヴォルフ" && getCard(SOKU_SPIRIT).cost === 2, "SOKU_SPIRITはコスト2")
    assert(getCard(BURST_SPIRIT).effects.some((e) => e.kind === "burst"), "BURST_SPIRITはバースト持ち")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "white" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 0
    s.players.p2.reserve = 0
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. shinsokuPayAssist：疲労させて2コスト肩代わりすれば、リザーブ0でも【神速】召喚できる ===")
{
    const s = game("case1")
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const helper = put(s, "p1", NOUZEN, 1)
    s.players.p1.reserve = 1 // 置くコア（Lv1維持コア1個）ぶんだけは要る。肩代わりは召喚コスト側だけ
    s.players.p1.hand[0] = SOKU_SPIRIT
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [helper.instanceId] })
    assert(err === null, `shinsokuAssistで神速召喚が通る（実際: ${String(err)}）`)
    assert(helper.isRested === true, "肩代わりに使ったノウゼンサーバルは疲労する")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === SOKU_SPIRIT), "リーヴォルフが場に出ている")
    assert(s.players.p1.reserve === 0, "リザーブは置くコアの1個だけ減る（召喚コスト2は肩代わりされた）")
}

console.log("=== 2. shinsokuPayAssist：すでに疲労しているノウゼンサーバルは指定できない ===")
{
    const s = game("case2")
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const helper = put(s, "p1", NOUZEN, 1)
    helper.isRested = true
    s.players.p1.hand[0] = SOKU_SPIRIT
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [helper.instanceId] })
    assert(err !== null, `疲労済みは指定できずエラーになる（実際: ${String(err)}）`)
}

console.log("=== 3. 誓いの桃園Lv1（sokuPaySourceGrant再利用）：フィールドのコアで神速召喚のコストを払える ===")
{
    const s = game("case3")
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const nexus = createInstance(CHIGIRI, s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    const fieldSource = put(s, "p1", VANILLA, 3)
    s.players.p1.hand[0] = SOKU_SPIRIT
    const err = handleAction(s, "p1", {
        type: "summon",
        handIndex: 0,
        paySources: [{ instanceId: fieldSource.instanceId, count: 2 }],
    })
    assert(err === null, `誓いの桃園があればフィールドのコアで神速召喚できる（実際: ${String(err)}）`)
    assert(fieldSource.cores === 1, "支払った2個ぶんフィールドのコアが減る")
}

console.log("=== 4. 誓いの桃園Lv2（effectGrant再利用）：烈の覇王セイリュービのバトル時、相手はバーストを発動できない ===")
{
    const s = game("case4")
    const nexus = createInstance(CHIGIRI, s.turn, 2)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    assert(getCard(nexus.cardId).levels.length >= 2, "誓いの桃園はLv2を持つ")
    const seiryubi = put(s, "p1", SEIRYUBI, 6)
    s.battle = { attackerInstanceId: seiryubi.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    fireTrigger(s, "p1", seiryubi, "onBattleStart")
    assert(s.battle.burstBlockedForPid === "p2", "セイリュービのバトル時、相手はバーストを発動できなくなる")
}

console.log("=== 5. サテライド・バード：このターンの間バースト効果でスピリットは召喚できない（ブレイヴは対象外） ===")
{
    const s = game("case5")
    s.turnConstraints.push({ type: "noBurstSpiritSummonThisTurn" })
    s.players.p1.burst = BURST_SPIRIT
    s.players.p1.burstSet = true
    s.players.p1.reserve = 5
    const before = s.players.p1.field.spirits.length
    resolveAction(s, "p1", null, { type: "summonBurstCardFree" })
    assert(s.players.p1.burst === null, "バースト自体は消費される（発動は止めない）")
    assert(s.players.p1.field.spirits.length === before, "スピリットは場に出ない")
    assert(s.players.p1.trashCards.includes(BURST_SPIRIT), "召喚できなかったバーストはトラッシュへ")
}

console.log("=== 6. サテライド・バード：制約が無ければバーストのスピリット召喚は通常どおり通る ===")
{
    const s = game("case6")
    s.players.p1.burst = BURST_SPIRIT
    s.players.p1.burstSet = true
    s.players.p1.reserve = 5
    const before = s.players.p1.field.spirits.length
    resolveAction(s, "p1", null, { type: "summonBurstCardFree" })
    assert(s.players.p1.field.spirits.length === before + 1, "制約が無ければ通常どおり召喚される")
}

console.log("=== 7. 氷聖女の塔Lv2：相手はリザーブのコア2個をトラッシュに置かなければバーストをセットできない ===")
{
    const s = game("case7")
    s.players.p1.field.nexuses.push(createInstance(HYOTOU, s.turn, 2))
    refreshLevelAsOverrides(s)
    s.phase = "main"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand[0] = BURST_SPIRIT
    s.players.p2.reserve = 1
    const err = handleAction(s, "p2", { type: "setBurst", handIndex: 0 })
    assert(err !== null, `リザーブが足りなければセットできない（実際: ${String(err)}）`)
    s.players.p2.reserve = 2
    const err2 = handleAction(s, "p2", { type: "setBurst", handIndex: 0 })
    assert(err2 === null, `リザーブ2個あればセットできる（実際: ${String(err2)}）`)
    assert(s.players.p2.reserve === 0, "セットと同時にリザーブのコア2個が支払われる")
    assert(s.players.p2.trashCores === 2, "支払ったコアは相手のトラッシュへ置かれる")
}

console.log("すべてのチェックに合格しました 🎉（part352）")
