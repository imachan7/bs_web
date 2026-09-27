// smoke パート403（M2 if の器 PR 4：discardOpponentTegamoto＝相手の手元をすべて破棄 → 1枚につき。IF_UNIFY.md §5）
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const ECLIA = "BS03-016" // 透明人間エクリア（召喚時：相手の手元をすべて破棄し、1枚につき相手のスピリット1体を破壊）
const MUMMY = "BS12-011" // ミイラバード（召喚時：相手の手元をすべて破棄し、1枚につき相手のフィールド/リザーブのコア1個をボイドへ）
const VANILLA = "BS01-002" // ロクケラトプス（スピリット）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ECLIA).name === "透明人間エクリア", "ECLIAは透明人間エクリア")
    assert(getCard(MUMMY).name === "ミイラバード", "MUMMYはミイラバード")
    assert(getCard(VANILLA).type === "spirit", "VANILLAはスピリット")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "yellow" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    return s
}
function actionOf(cardId: string, effectId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => x.id === effectId)
    if (!e || !("action" in e) || e.action === undefined) throw new Error(`${effectId} に action が無い`)
    return e.action
}

console.log("=== 1. エクリア：手元2枚を破棄し、2体を破壊 ===")
{
    const s = game("eclia", false)
    s.players.p2.tegamoto = [VANILLA, VANILLA]
    s.players.p2.tegamotoPlayable = [VANILLA]
    for (let i = 0; i < 3; i++) s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, actionOf(ECLIA, "BS03-016-e1"))
    assert(s.players.p2.tegamoto.length === 0 && s.players.p2.tegamotoPlayable.length === 0, "手元と使用権が空になる")
    assert(s.players.p2.field.spirits.length === 1, "破棄した2枚ぶん、2体を破壊する")
}
{
    const s = game("eclia-empty", false)
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, actionOf(ECLIA, "BS03-016-e1"))
    assert(s.players.p2.field.spirits.length === 1, "手元が0枚なら破壊しない")
}

console.log("=== 2. ミイラバード（対話）：取るコアを使用者が1個ずつ選べる ===")
{
    const s = game("mummy", true)
    s.players.p2.tegamoto = [VANILLA, VANILLA]
    s.players.p2.reserve = 3
    const foe = createInstance(VANILLA, s.turn, 3)
    s.players.p2.field.spirits.push(foe)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, actionOf(MUMMY, "BS12-011-e1"))
    for (let i = 0; i < 2; i++) {
        const pc = s.pendingChoice
        assert(pc?.pid === "p1" && pc.candidates.includes(foe.instanceId), `${i + 1}個目：使用者に相手のスピリットも候補として出る`)
        if (pc) act(s, "p1", { type: "resolveChoice", instanceId: foe.instanceId })
    }
    assert(foe.cores === 1 && s.players.p2.reserve === 3, "スピリットを選んだので、スピリットから2個ボイドへ（リザーブは減らない）")
}

console.log("すべてのチェックに合格しました 🎉（part403）")
