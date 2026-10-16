// smoke パート591（無償召喚の余分コスト：単発の召喚は毎回払い、複数体を同時に召喚する効果だけ1回にまとめる。2026-10-15 ユーザー確認）
import { assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import { canPayFreeSummonSurcharge, payFreeSummonSurcharge } from "../../server/src/logic/summonSurcharge"

const ALTAR = "SD02-013" // 転召の祭壇
const CAP = "BS05-011" // レッドキャップ（コスト3以下・【転召】なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ALTAR).name === "転召の祭壇" && getCard(ALTAR).type === "nexus", "ALTARは転召の祭壇")
    assert(getCard(CAP).name === "レッドキャップ" && getCard(CAP).cost <= 3, "CAPはコスト3以下のレッドキャップ")
}

function game(): ReturnType<typeof createGame> {
    const s = createGame("p591", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.players.p2.field.nexuses = [createInstance(ALTAR, s.turn, 0)]
    s.players.p1.reserve = 5
    return s
}

console.log("=== 1. 単発の召喚が2回続いたら、余分は2回払う ===")
{
    const s = game()
    assert(payFreeSummonSurcharge(s, "p1", getCard(CAP)) && payFreeSummonSurcharge(s, "p1", getCard(CAP)), "2回とも払える")
    assert(s.players.p1.reserve === 3, `リザーブ 5→3（実際は${s.players.p1.reserve}）`)
}

console.log("=== 2. 同時に召喚する効果の中では1回だけ ===")
{
    const s = game()
    assert(payFreeSummonSurcharge(s, "p1", getCard(CAP), true) && payFreeSummonSurcharge(s, "p1", getCard(CAP), true), "2体とも払える")
    assert(s.players.p1.reserve === 4, `リザーブ 5→4（実際は${s.players.p1.reserve}）`)
    assert(canPayFreeSummonSurcharge(s, "p1", getCard(CAP), 4, true), "払い済みなので3体目は余分なしで判定する")
    assert(!canPayFreeSummonSurcharge(s, "p1", getCard(CAP), 4), "単発の召喚は払い済みの印を見ない")
}

console.log("すべてのチェックに合格しました 🎉（part591）")
