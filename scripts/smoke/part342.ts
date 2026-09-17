// smoke パート342（バースト効果にもカードの色と種別を渡し、【装甲】などの効果耐性を効かせる。2026-09-17）
//
// バーストの発動（非対話の triggers.ts／対話の確認後の GameEngine）と、「その後コストを支払うことで
// このカードのフラッシュ/メイン効果を発揮する」（thenPay）の対話経路が、resolveAction に色も種別も
// 渡していなかった。そのため「指定された色の相手の効果を受けない」【装甲】をバースト効果がすり抜けていた。
// 【氷壁】（マジックの無効化）がバーストに効かないのは正しい（使用したマジック効果ではない。BURST.md §7.1）。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "white" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.players.p2.field.spirits = []
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS14-099").name === "武迅衝" && getCard("BS14-099").colors.includes("green"), "BS14-099 は緑の武迅衝")
    assert(getCard("BS06-037").name === "双子妖精フギン＆ムニン", "BS06-037 はフギン＆ムニン（【装甲：緑】）")
    assert(getCard("BS14-094").name === "天翔龍神覇" && getCard("BS14-094").colors.includes("red"), "BS14-094 は赤の天翔龍神覇")
    assert(getCard("BS06-044").name === "レインディア", "BS06-044 はレインディア（【装甲：赤】）")
}

// p2 の召喚時効果の発揮後（opponentSummonEffectResolved）を、p1 から見た事象として起こす
function fireSummonResolved(s: GameState, summonedId: string): void {
    const inst = s.players.p2.field.spirits.find((x) => x.instanceId === summonedId)!
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved", { pid: "p2", inst })
}

console.log("=== §A 非対話：緑のバーストは【装甲：緑】の相手を疲労させられない ===")
{
    const s = game("p342-a", false)
    s.players.p1.burst = "BS14-099"
    const armored = createInstance("BS06-037", s.turn, 1)
    s.players.p2.field.spirits.push(armored)
    fireSummonResolved(s, armored.instanceId)
    assert(armored.isRested === false, "【装甲：緑】は緑のバースト効果を受けない")
}
{
    // 対照：装甲の無い相手は疲労する
    const s = game("p342-a2", false)
    s.players.p1.burst = "BS14-099"
    const plain = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(plain)
    fireSummonResolved(s, plain.instanceId)
    assert(plain.isRested === true, "装甲の無い相手は疲労する（対照）")
}

console.log("=== §B 対話：バーストの発動確認で「発動する」を選んでも【装甲：緑】の相手は受けない ===")
{
    const s = game("p342-b", true)
    s.players.p1.burst = "BS14-099"
    const armored = createInstance("BS06-037", s.turn, 1)
    s.players.p2.field.spirits.push(armored)
    fireSummonResolved(s, armored.instanceId)
    assert(s.pendingChoice?.burstActivate !== undefined, "バーストの発動確認が出る")
    act(s, "p1", { type: "resolveChoice", option: "発動する" })
    // thenPay（メイン効果）の確認が出たら断る
    if (s.pendingChoice) act(s, "p1", { type: "resolveChoice" })
    assert(armored.isRested === false, "【装甲：緑】は緑のバースト効果を受けない")
}

console.log("=== §C 対話：コストを支払って発揮するフラッシュ効果（thenPay）も【装甲：赤】の相手を破壊できない ===")
{
    const s = game("p342-c", true)
    s.players.p1.burst = "BS14-094"
    const armored = createInstance("BS06-044", s.turn, 1)
    s.players.p2.field.spirits.push(armored)
    fireSummonResolved(s, armored.instanceId)
    assert(s.pendingChoice?.burstActivate !== undefined, "バーストの発動確認が出る")
    act(s, "p1", { type: "resolveChoice", option: "発動する" })
    assert(s.pendingChoice?.burstThenPay !== undefined, "コストを支払って発揮するかの確認が出る")
    act(s, "p1", { type: "resolveChoice", option: "発動する" })
    while (s.pendingChoice && s.pendingChoice.pid === "p1" && (s.pendingChoice.candidates ?? []).length > 0) {
        act(s, "p1", { type: "resolveChoice", instanceId: s.pendingChoice.candidates[0]! })
    }
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === armored.instanceId), "【装甲：赤】は赤のマジックの効果で破壊されない")
}

console.log("すべてのチェックに合格しました 🎉（part342）")
