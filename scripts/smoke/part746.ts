// smoke パート746（「自分のリザーブのコアN個をトラッシュに置くことで」はリザーブからだけ払える。フィールドのコアは使えない。
// 「Nコスト支払う」はフィールドのコアからも払える（pay.ts の isReserveToll）ので、reserveOnly で分ける）
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"

const KAGUYA = "BS15-X05" // 光の覇王ルナアーク・カグヤ（起動コスト：リザーブのコア2個）
const ROKU = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KAGUYA).name === "光の覇王ルナアーク・カグヤ", "KAGUYA")
}

console.log("=== カグヤ：リザーブ1個・フィールドにコア5個では起動できない／リザーブ2個なら起動できる ===")
for (const reserve of [1, 2]) {
    const s = createGame(`p746-${reserve}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const kaguya = createInstance(KAGUYA, s.turn - 1, 5)
    s.players.p1.field.spirits.push(kaguya)
    s.players.p2.field.spirits.push(createInstance(ROKU, s.turn - 1, 1))
    s.players.p1.reserve = reserve
    s.players.p1.trashCores = 0
    // 実際にアタックして、アタック後のフラッシュ（防御側が先にパス）に入る
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: kaguya.instanceId }) === null, "カグヤでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス")
    const err = act(s, "p1", { type: "activateAbility", instanceId: kaguya.instanceId, effectId: "BS15-X05-e2" })
    if (reserve === 1) {
        assert(err !== null, "リザーブが1個ならフィールドにコアがあっても起動できない")
        assert(kaguya.cores === 5, "フィールドのコアは減らない")
    } else {
        assert(err === null, `リザーブが2個なら起動できる（${String(err)}）`)
        assert(s.players.p1.reserve === 0 && s.players.p1.trashCores === 2 && kaguya.cores === 5, "リザーブの2個がトラッシュへ。フィールドのコアは減らない")
    }
}

console.log("すべてのチェックに合格しました 🎉（part746）")
