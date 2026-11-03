// smoke パート767（「その後」の次の手が、前の手で変わった継続効果を見るか。docs/design/CONJUNCTION.md の「その後」）
import { assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"

const TYRANO = "BS08-004" // 恐竜人ティラノイド：自分のスピリットが2体以下のとき Lv3 として扱う
const ROKU = "BS01-002" // ロクケラトプス（コスト1）
const BELL = "BS01-089" // デュアルキャノン・ベル（コスト4・Lv1 BP3000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TYRANO).name === "恐竜人ティラノイド" && getCard(TYRANO).levels[0]!.bp === 2000, "TYRANOはLv1 BP2000")
    assert(getCard(TYRANO).levels[2]!.bp === 6000, "TYRANOはLv3 BP6000")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).cost === 1, "ROKUはコスト1")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4, "BELLはコスト4")
}

console.log("=== 1. 前の手で体数が減り Lv3 扱いになったスピリットは、次の手の BP 条件から外れる ===")
{
    const s = createGame("part767", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    const tyrano = createInstance(TYRANO, s.turn, 1)
    const roku = createInstance(ROKU, s.turn, 1)
    const bell = createInstance(BELL, s.turn, 1)
    s.players.p2.field.spirits.push(tyrano, roku, bell)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p2", tyrano) === 2000, "3体いる間はLv1（BP2000）")
    resolveAction(s, "p1", null, {
        type: "sequence",
        actions: [
            { type: "destroy", count: 1, filter: { cost: { max: 1 } } },
            { type: "destroy", count: 1, filter: { maxBp: 2000 } },
        ],
    })
    assert(!s.players.p2.field.spirits.includes(roku), "手1でコスト1のロクケラトプスが破壊される")
    assert(s.players.p2.field.spirits.includes(tyrano), "手1の後はLv3（BP6000）なので、手2で破壊されない")
    assert(effectiveBp(s, "p2", tyrano) === 6000, "ティラノイドはBP6000")
}

console.log("すべてのチェックに合格しました 🎉（part767）")
