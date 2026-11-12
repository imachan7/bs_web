// smoke パート911（誘発の残りを後ろへ積むときも、並べ替えの列と同じフレーム（発動確認・誰の効果か・対象・ターン1回）で積む。#437 F3）
import { act, assert, createGame, createInstance, fireTrigger, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"

const NOBUNAGA = "BS12-024" // 木星魔龍ノブナガード・ゼクスト（召喚時：ブレイヴ1枚と緑のスピリット1枚を召喚できる＝任意のエントリ2つ）
const GREEN = "BS01-050" // ビートビートル（緑・効果なし）
const BRAVE = "BS17-055" // ヤサカニ・ウィング（1つ目の効果に召喚できるブレイヴが無いと、確認を出さずに不発になるため）

console.log("=== 前提: カードの機械確認 ===")
{
    const opt = getCard(NOBUNAGA).effects.filter((e) => e.kind === "triggered" && e.trigger === "onSummon" && e.optional === true)
    assert(opt.length === 2, `ノブナガード・ゼクストの召喚時は任意のエントリ2つ（${opt.length}）`)
    assert(getCard(BRAVE).type === "brave", "BRAVE はブレイヴ")
    assert(getCard(GREEN).type === "spirit" && getCard(GREEN).colors.includes("green"), "GREEN は緑のスピリット")
}

console.log("=== 1つ目の確認を断ったあと、2つ目にも確認が出る（以前は確認なしで召喚した） ===")
{
    const s = createGame("p911", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.hand = [BRAVE, GREEN]
    const nobu = createInstance(NOBUNAGA, s.turn, 1)
    s.players.p1.field.spirits.push(nobu)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", nobu, "onSummon")
    assert((s.pendingChoice?.prompt ?? "").includes("発動しますか"), `1つ目の確認（${s.pendingChoice?.prompt ?? "なし"}）`)
    act(s, "p1", { type: "resolveChoice" }) // 発動しない
    assert((s.pendingChoice?.prompt ?? "").includes("発動しますか"), `2つ目の確認が出る（${s.pendingChoice?.prompt ?? "なし"}）`)
    assert(!s.players.p1.field.spirits.some((sp) => sp.cardId === GREEN), "まだ緑のスピリットは出ていない")
}

console.log("すべてのチェックに合格しました 🎉（part911）")
