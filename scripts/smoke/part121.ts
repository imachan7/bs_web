// smoke パート121（マジック解決への割り込み＝マジックの無効化）
//
// 新設した機構:
//   - kind:"magicNegate"（相手が使用したマジックの効果を無効にする）
//     ＋ PendingChoice.magicNegate（実対戦では防御側に「無効にするか」を確認する）
//     ＋ CardInstance.magicNegateUsedTurn（oncePerTurn の管理）
//     resolveMagic を「無効化の判定」と「効果の解決（resolveMagicEffects）」に分割し、
//     確認をスキップしたときは中断していた解決を続ける（declineMagicNegateChoice）。
//     コストは selfCoresToVoid（発生源のコアをボイドへ）と exhaustSelf（発生源を疲労させる）の2種。
//   - action:"noop"（アクションを解決しない pendingChoice のプレースホルダ）
// 実装したカード:
//   - BS02-083 鏡の回廊 Lv2（お互いのアタックステップ、相手のマジックの効果を無効にする。コア2個・ターン1回）
//
// ※ colors 絞り込み（【氷壁：赤】）と exhaustSelf コストを使うカードは BS08/BS09 にあり、
//    まだ data/cards/ に取り込んでいないため、ここでは検証していない
import { act, assert, createGame, createInstance, currentLevel, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"

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

// p1 が鏡の回廊を持ち、p2 がフレイムサイクロン（BP5000以下の相手スピリット1体を破壊）を使う盤面
function setup(id: string, nexusCores: number) {
    const s = createGame(id, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.phase = "attack"
    const nexus = putNexus(s, "p1", "BS02-083", nexusCores)
    const victim = put(s, "p1", "BS01-001", 1) // ゴラドン Lv1（BP1000）＝破壊される側
    return { s, nexus, victim }
}

function alive(s: GameState, pid: PlayerId, instanceId: string): boolean {
    return s.players[pid].field.spirits.some((x) => x.instanceId === instanceId)
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS02-083").name === "鏡の回廊" && getCard("BS02-083").type === "nexus", "BS02-083 は鏡の回廊（ネクサス）")
    assert(getCard("BS03-120").name === "フレイムサイクロン" && getCard("BS03-120").type === "magic", "BS03-120 はフレイムサイクロン（マジック）")
    assert(getCard("BS01-001").name === "ゴラドン", "BS01-001 はゴラドン")
}

console.log("=== BS02-083 鏡の回廊 Lv2：相手のマジックの効果を無効にする ===")
{
    // 対照：鏡の回廊なし → マジックが通ってゴラドンが破壊される
    const base = createGame("t121-mirror-base", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(base)
    base.phase = "attack"
    const baseVictim = put(base, "p1", "BS01-001", 1)
    resolveMagic(base, "p2", "BS03-120", "flash")
    assert(!alive(base, "p1", baseVictim.instanceId), "鏡の回廊がなければマジックは通る")

    const { s, nexus, victim } = setup("t121-mirror-1", 3) // Lv2
    assert(currentLevel(nexus).level === 2, `鏡の回廊は3コアでLv2（実際: ${String(currentLevel(nexus).level)}）`)
    resolveMagic(s, "p2", "BS03-120", "flash")
    assert(alive(s, "p1", victim.instanceId), "マジックの効果が無効になり、ゴラドンは破壊されない")
    assert(nexus.cores === 1, `コスト2個をボイドへ置く（実際: 残り${String(nexus.cores)}個）`)
    assert(nexus.magicNegateUsedTurn === s.turn, "このターンの使用済みが記録される")
}

console.log("=== BS02-083 鏡の回廊：Lv1では無効にしない／メインステップでは無効にしない ===")
{
    const { s, victim } = setup("t121-mirror-2", 0) // Lv1
    resolveMagic(s, "p2", "BS03-120", "flash")
    assert(!alive(s, "p1", victim.instanceId), "Lv1では無効にしない")

    const { s: s2, nexus: nexus2, victim: victim2 } = setup("t121-mirror-3", 3)
    s2.phase = "main" // 『お互いのアタックステップ』の範囲外（フレイムサイクロンはフラッシュ側にしか効果がない）
    resolveMagic(s2, "p2", "BS03-120", "flash")
    assert(!alive(s2, "p1", victim2.instanceId), "メインステップでは無効にしない")
    assert(nexus2.cores === 3, `コストも払わない（実際: ${String(nexus2.cores)}個）`)
}

console.log("=== BS02-083 鏡の回廊：ターンに1回だけ（コアを戻しても2回目は使えない） ===")
{
    const { s, nexus, victim } = setup("t121-mirror-4", 3)
    resolveMagic(s, "p2", "BS03-120", "flash")
    assert(alive(s, "p1", victim.instanceId), "1回目は無効にできる")

    // コアを補充して Lv2 に戻す＝「レベルが下がったから使えない」ではないことを切り分ける
    nexus.cores = 3
    assert(currentLevel(nexus).level === 2, "コアを戻してLv2に復帰")
    resolveMagic(s, "p2", "BS03-120", "flash")
    assert(!alive(s, "p1", victim.instanceId), "2回目は無効にできず、マジックが通る")
    assert(nexus.cores === 3, `2回目はコストも払わない（実際: ${String(nexus.cores)}個）`)

    // ターンが変われば再び使える
    const { s: s2, nexus: nexus2, victim: victim2 } = setup("t121-mirror-5", 3)
    nexus2.magicNegateUsedTurn = s2.turn - 1 // 前のターンに使った状態
    resolveMagic(s2, "p2", "BS03-120", "flash")
    assert(alive(s2, "p1", victim2.instanceId), "ターンが変われば再び無効にできる")
}

console.log("=== BS02-083 鏡の回廊：自分が使ったマジックは無効にしない ===")
{
    const { s, nexus } = setup("t121-mirror-6", 3)
    const enemy = put(s, "p2", "BS01-001", 1)
    resolveMagic(s, "p1", "BS03-120", "flash") // 鏡の回廊の持ち主自身が使用
    assert(!alive(s, "p2", enemy.instanceId), "自分のマジックは無効にならず、相手のスピリットが破壊される")
    assert(nexus.cores === 3, `コストも払わない（実際: ${String(nexus.cores)}個）`)
}

console.log("=== BS02-083 鏡の回廊：実対戦では防御側に確認を出す（無効にする） ===")
{
    const { s, nexus, victim } = setup("t121-mirror-7", 3)
    s.interactiveTargets = true
    resolveMagic(s, "p2", "BS03-120", "flash")
    assert(s.pendingChoice !== null, "無効化の確認が立つ")
    assert(s.pendingChoice?.pid === "p1", "選択するのは防御側（鏡の回廊の持ち主）")
    assert(alive(s, "p1", victim.instanceId), "確認中はマジックの効果がまだ解決されていない")

    assert(act(s, "p1", { type: "resolveChoice", option: "無効にする" }) === null, "「無効にする」を選ぶ")
    assert(s.pendingChoice === null, "選択待ちが解消される")
    assert(alive(s, "p1", victim.instanceId), "マジックの効果は無効になる")
    assert(nexus.cores === 1, `コスト2個をボイドへ置く（実際: 残り${String(nexus.cores)}個）`)
}

console.log("=== BS02-083 鏡の回廊：確認をスキップすると中断していた解決が続く ===")
{
    const { s, nexus, victim } = setup("t121-mirror-8", 3)
    s.interactiveTargets = true
    resolveMagic(s, "p2", "BS03-120", "flash")
    assert(s.pendingChoice !== null, "無効化の確認が立つ")

    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ（無効にしない）")
    assert(s.pendingChoice === null, "選択待ちが解消される")
    assert(!alive(s, "p1", victim.instanceId), "マジックの効果が解決されてゴラドンが破壊される")
    assert(nexus.cores === 3, `無効にしなければコストも払わない（実際: ${String(nexus.cores)}個）`)
    assert(nexus.magicNegateUsedTurn === undefined, "ターン1回の枠も消費しない")
}
