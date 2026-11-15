// smoke パート953（場を離れる誘発の列の途中で条件を満たしたバーストは、列を解決しきってから発動する。BURST.md §1.4。2026-11-15 ユーザー確認）
import { act, assert, createGame, createInstance, declareBlock, fireFieldEventTriggers, getCard, placeBurst, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireQueuedDestroyBursts } from "../../server/src/logic/removal"

const KAISER = "BS02-036" // カイザレオン大帝（Lv2 アタック時：BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く）
const JIGEN = "BS16-080" // 次元断（バースト：自分のライフ減少後、相手のスピリット1体を手札に戻す）
const GANDINOS = "X13-01" // 太陽凶龍アポロ・ガンディノス（アタック時：BP5000以下の相手のスピリット1体を破壊。Lv2 から指定アタック）
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ）
const TARAN = "BS16-025" // タランドーズ（Lv1 BP6000・効果なし）
const SOKO = "BS14-091" // 双光気弾（バースト：相手の効果による自分のスピリット破壊後、2枚ドロー）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KAISER).name === "カイザレオン大帝" && getCard(KAISER).effects.some((e) => e.kind === "triggered" && e.trigger === "onBattleWin" && e.action.type === "lifeCrush"), "KAISER は勝利時に相手のライフを減らす")
    assert(getCard(JIGEN).name === "次元断" && getCard(JIGEN).effects.some((e) => e.kind === "burst" && e.event === "ownLifeDamaged" && e.action.type === "return"), "JIGEN はライフ減少後に手札へ戻すバースト")
    assert(getCard(GANDINOS).name === "太陽凶龍アポロ・ガンディノス" && getCard(KARAKURI).type === "brave" && getCard(TARAN).name === "タランドーズ", "指定アタックの場面のカード")
    assert(getCard(SOKO).name === "双光気弾" && getCard(SOKO).effects.some((e) => e.kind === "burst" && e.event === "ownSpiritDestroyed"), "SOKO は破壊後バースト")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLA はロクケラトプス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

const texts = (s: GameState, from: number): string[] => s.log.slice(from).map((l) => (typeof l === "string" ? l : (l as { message: string }).message))

console.log("=== 1. バトルの勝利時にライフが減った：バーストは、敗者をトラッシュに置いた後に発動する ===")
{
    const s = game("battle")
    const kaiser = createInstance(KAISER, 1, 7)
    s.players.p1.field.spirits.push(kaiser)
    const loser = createInstance(VANILLA, 1, 1)
    s.players.p2.field.spirits.push(loser)
    refreshLevelAsOverrides(s)
    placeBurst(s, "p2", JIGEN)
    s.phase = "attack"
    const from = s.log.length
    let burstSawLoserOnField: boolean | undefined
    const logs = s.log
    const push = logs.push.bind(logs)
    // バーストが発動した時点で、敗者がまだ場にいたかを控える
    logs.push = (...items) => {
        for (const it of items) {
            const m = typeof it === "string" ? it : (it as { message: string }).message
            if (m.includes("バースト（次元断）を発動した")) burstSawLoserOnField = s.players.p2.field.spirits.includes(loser)
        }
        return push(...items)
    }
    assert(act(s, "p1", { type: "attack", instanceId: kaiser.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p2", loser.instanceId) === null, "ブロックできる")
    while (s.isFlashTiming && s.battle) act(s, s.priorityPlayer, { type: "pass" })
    const t = texts(s, from)
    assert(s.players.p2.life === 4, "勝利時効果で相手のライフが1つ減った")
    assert(t.some((m) => m.includes("バースト（次元断）を発動した")), "ライフ減少後バーストが発動した")
    assert(burstSawLoserOnField === false, "バーストが発動した時点で、敗者はもう場にいない（トラッシュに置かれた後）")
    assert(!s.players.p1.field.spirits.includes(kaiser) && s.players.p1.hand.includes(KAISER), "バーストの効果で、勝ったスピリットが手札に戻った")
    assert(s.pendingEventBursts === undefined, "控えは残らない")
}

console.log("=== 2. 待機状態のカードがいる間は控え、いなくなってから発動する ===")
{
    const s = game("deferred")
    const waiting = createInstance(VANILLA, 1, 1)
    const target = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits.push(waiting, target)
    refreshLevelAsOverrides(s)
    placeBurst(s, "p2", JIGEN)
    waiting.waiting = { kind: "destroy" }
    fireFieldEventTriggers(s, "p2", "ownLifeLost")
    assert(s.players.p2.burstSet && s.pendingEventBursts?.length === 1, "待機状態のカードがいる間は発動せず、控えに積む")
    fireQueuedDestroyBursts(s)
    assert(s.players.p2.burstSet && s.pendingEventBursts?.length === 1, "待機状態のカードがいる間は、確認しても発動しない")
    delete waiting.waiting
    fireQueuedDestroyBursts(s)
    assert(!s.players.p2.burstSet && s.pendingEventBursts === undefined, "待機状態のカードがいなくなったら発動する")
}

console.log("=== 3. 待機状態のカードがいなければ、その場で発動する（従来どおり） ===")
{
    const s = game("immediate")
    const target = createInstance(VANILLA, 1, 1)
    s.players.p1.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    placeBurst(s, "p2", JIGEN)
    fireFieldEventTriggers(s, "p2", "ownLifeLost")
    assert(!s.players.p2.burstSet && s.pendingEventBursts === undefined, "ライフ減少後バーストがその場で発動する")
    assert(!s.players.p1.field.spirits.includes(target), "相手のスピリットが手札に戻る")
}

console.log("=== 4. 指定アタック：持ち越した破壊後バーストを確認してから、ブロックを確定する（TIMING_CHART §1.10） ===")
{
    const s = game("directed")
    s.interactiveTargets = true
    const atk = createInstance(GANDINOS, 1, 3)
    s.players.p1.field.spirits.push(atk)
    // アタック時効果で破壊される合体スピリット（ブレイヴを残す確認が挟まる）と、指定先（BP6000 で破壊されない）
    const host = createInstance(VANILLA, 1, 1)
    const target = createInstance(TARAN, 1, 1)
    s.players.p2.field.spirits.push(host, target)
    const brave = createInstance(KARAKURI, 1, 0)
    s.players.p2.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    placeBurst(s, "p2", SOKO)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId, targetSpiritInstanceId: target.instanceId }) === null, "指定アタックできる")
    assert(s.pendingChoice?.kind === "option" && s.pendingChoice.prompt.includes("カラクリバッタ"), "ブレイヴを残すかの確認が出る")
    act(s, "p2", { type: "resolveChoice", option: s.pendingChoice!.options![0]! })
    assert(s.pendingChoice?.prompt.includes("双光気弾") === true, "次に破壊後バーストの確認が出る")
    assert(s.battle?.blockerInstanceId == null, "バーストの確認の時点では、ブロックはまだ確定していない")
    for (let i = 0; i < 6 && s.pendingChoice; i++) act(s, s.pendingChoice.pid, { type: "resolveChoice", option: s.pendingChoice.options![0]! })
    assert(!s.players.p2.burstSet, "バーストが発動した")
    assert(s.battle?.blockerInstanceId === target.instanceId, "バーストを解決し終えたら、指定先のブロックが確定する")
}

console.log("すべてのチェックに合格しました 🎉（part953）")
