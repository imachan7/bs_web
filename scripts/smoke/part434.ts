// smoke パート434（R5：海賊王レヴィアダンを destroy{all} と絞り込みの軸 costSameAsOwn で書いた。カードデータのまま解決する）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const LEVIA = "BS12-X06" // 海賊王レヴィアダン

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LEVIA).name === "海賊王レヴィアダン" && getCard(LEVIA).family.includes("獣頭"), "LEVIAは系統：獣頭の海賊王レヴィアダン")
}

function summonAction(): Parameters<typeof resolveAction>[3] {
    const e = getCard(LEVIA).effects.find((x) => x.kind === "triggered" && x.trigger === "onSummon") as { action: Parameters<typeof resolveAction>[3] }
    return e.action
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    return s
}

console.log("=== レヴィアダン自身のコストと同じコストの相手のスピリットすべてが破壊され、違うコストは残る ===")
{
    const s = game("p434")
    const levia = createInstance(LEVIA, s.turn, 3)
    s.players.p1.field.spirits.push(levia)
    const cost = getCard(LEVIA).cost
    const sameId = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === cost && c.cardId !== LEVIA && c.effects.length === 0)!.cardId
    const otherId = ALL_CARDS.find((c) => c.type === "spirit" && c.cost !== cost && c.effects.length === 0)!.cardId
    const same = createInstance(sameId, s.turn, 3)
    const other = createInstance(otherId, s.turn, 3)
    s.players.p2.field.spirits.push(same, other)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", levia, summonAction())
    const alive = s.players.p2.field.spirits.map((sp) => sp.instanceId)
    assert(!alive.includes(same.instanceId), `同じコスト${cost}の相手は破壊される`)
    assert(alive.includes(other.instanceId), "違うコストの相手は残る")
    assert(s.players.p1.field.spirits.includes(levia), "自分のスピリットは破壊しない")
}

console.log("すべてのチェックに合格しました 🎉（part434）")
