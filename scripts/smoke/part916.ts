// smoke パート916（解決順を聞くときは、聞いてから列を積む。外側の続き（次の体の破壊など）が列を追い越さない。#437 R11B-2・RESUME_STACK §3）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { destroyTargetsBatch } from "../../server/src/logic/removal"

const GRAVE = "BS06-076" // 暴かれた墓石（『アタックステップ』自分のスピリットが破壊されたとき、1枚ドロー）
const SILVER = "BS01-113" // 侵食されゆく銀世界（Lv2＝コア4『相手のアタックステップ』自分のスピリットが破壊されたとき）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    for (const id of [GRAVE, SILVER]) assert(getCard(id).effects.some((e) => e.kind === "fieldEvent" && e.event === "ownSpiritDestroyed"), `${getCard(id).name}は「自分のスピリットが破壊されたとき」`)
}

console.log("=== 同時に2体破壊：1体目の誘発の解決順を聞いた時点で、続きの先頭は選んだ誘発の列（次の体の破壊ではない） ===")
{
    const s = createGame("p916", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p2.field.nexuses = [createInstance(GRAVE, s.turn, 0), createInstance(SILVER, s.turn, 4)]
    const a = createInstance(VANILLA, s.turn, 1)
    const b = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits = [a, b]
    refreshLevelAsOverrides(s)
    const hand = s.players.p2.hand.length
    destroyTargetsBatch(s, "p1", [{ pid: "p2", instanceId: a.instanceId }, { pid: "p2", instanceId: b.instanceId }], { sourcePid: "p1", sourceType: "magic", sourceColors: ["red"] })
    assert(s.pendingChoice?.triggerOrder !== undefined, `解決順の質問（${s.pendingChoice?.prompt ?? "なし"}）`)
    assert(s.resumeStack[0]?.kind === "triggerBatch", `続きの先頭は誘発の列（${s.resumeStack.map((f) => f.kind).join(" → ")}）`)
    const grave = (s.pendingChoice?.options ?? []).findIndex((o) => o.includes("暴かれた墓石"))
    act(s, "p1", { type: "resolveChoice", option: s.pendingChoice!.options![Math.max(0, grave)]! })
    // 墓石を選んだら、次の質問・次の体の破壊より先にドローが済んでいる
    assert(s.players.p2.hand.length === hand + 1, `選んだ墓石のドローが先に解決（${s.players.p2.hand.length - hand}枚）`)
}

console.log("すべてのチェックに合格しました 🎉（part916）")
