// smoke パート595（対話中に複数体を同時に無償召喚しても、転召の祭壇の余分の支払い待ちは1回だけ。2026-10-15 ユーザー確認）
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"

const BEELZE = "BS06-X22" // 魔界七将ベルゼビート
const ALTAR = "SD02-013" // 転召の祭壇
const CAP = "BS05-011" // レッドキャップ（コスト2・【呪撃】）
const NECRO = "BS07-011" // ネクロウ（コスト2・【呪撃】）
const VANILLA = "BS01-002" // ロクケラトプス（払い待ちを出させるため、フィールドに払えるコアを置く）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BEELZE).name === "魔界七将ベルゼビート", "BEELZEはベルゼビート")
    assert(getCard(ALTAR).name === "転召の祭壇", "ALTARは転召の祭壇")
    assert(getCard(CAP).name === "レッドキャップ" && getCard(NECRO).name === "ネクロウ", "CAP・NECRO")
}

console.log("=== 1. ベルゼビートで2体を同時に召喚：支払い待ちは1回、余分は1コスト ===")
{
    const s = createGame("p595", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    const p = s.players.p1
    s.players.p2.field.nexuses = [createInstance(ALTAR, s.turn, 0)]
    p.field.spirits = [createInstance(VANILLA, s.turn, 3)]
    p.hand = [BEELZE]
    p.trashCards = [CAP, NECRO]
    p.reserve = 11
    const trashCores = p.trashCores
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ベルゼビートを召喚する")
    let costPays = 0
    for (let i = 0; i < 12 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.effectCostPay) costPays++
        const ans = pc.candidates?.length ? { instanceId: pc.candidates[0]! } : pc.cardIndices?.length ? { cardIndex: pc.cardIndices[0]! } : { option: pc.options?.[0] ?? "" }
        assert(act(s, pc.pid, { type: "resolveChoice", ...ans }) === null, `選択待ちに答える（${pc.prompt}）`)
    }
    assert(s.pendingChoice === null, "選択待ちが残らない")
    assert(costPays === 1, `余分の支払い待ちは1回（${costPays}回）`)
    assert(p.field.spirits.some((sp) => sp.cardId === CAP) && p.field.spirits.some((sp) => sp.cardId === NECRO), "2体とも召喚した")
    assert(p.trashCores === trashCores + 8, `トラッシュのコアはコスト7＋余分1（+${p.trashCores - trashCores}）`)
}

console.log("すべてのチェックに合格しました 🎉（part595）")
