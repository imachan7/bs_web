// smoke パート365（期間の書かれていない『アタック時』『ブロック時』の BP+ はバトルが解決したら戻る。ACTION_VOCABULARY §4・2026-09-24 ユーザー確認）
import { assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { clearBattle } from "../../server/src/logic/GameState"

const SCOUT = "BS01-004" // アタック時：このスピリットをBP+2000
const JAW = "BS01-016" // アタック時：相手の回復状態のスピリット1体につき、このスピリットをBP+1000
const DOUBLE_DRAW = "BS01-117" // フラッシュ：このターンの間、スピリット1体をBP+2000
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SCOUT).name === "ドラグノ偵察兵", "SCOUTはドラグノ偵察兵")
    assert(getCard(JAW).name === "スケルトン・ジョウ", "JAWはスケルトン・ジョウ")
    assert(getCard(DOUBLE_DRAW).name === "ダブルドロー" && getCard(DOUBLE_DRAW).type === "magic", "DOUBLE_DRAWはダブルドロー")
}

function actionOf(cardId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => "action" in x && (x.action as { type: string }).type === "timedEffect")
    return (e as { action: EffectAction }).action
}

function board(): { s: GameState; me: ReturnType<typeof createInstance> } {
    const s = createGame("p365", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    const me = createInstance(SCOUT, 1, 1)
    s.players.p1.field.spirits = [me]
    s.players.p2.field.spirits = [createInstance(VANILLA, 1, 1), createInstance(VANILLA, 1, 1)]
    refreshLevelAsOverrides(s)
    s.battle = { attackerInstanceId: me.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    return { s, me }
}

console.log("=== 1. アタック時の BP+ はバトルが解決したら戻る ===")
{
    const { s, me } = board()
    const before = effectiveBp(s, "p1", me)
    resolveAction(s, "p1", me, actionOf(SCOUT))
    assert(effectiveBp(s, "p1", me) === before + 2000, "バトル中は BP+2000")
    clearBattle(s)
    assert(effectiveBp(s, "p1", me) === before, "バトルが終わると戻る")
}

console.log("=== 2. 量が可変のアタック時の BP+ も、バトルが解決したら戻る ===")
{
    const { s } = board()
    const jaw = createInstance(JAW, 1, 1)
    s.players.p1.field.spirits.push(jaw)
    refreshLevelAsOverrides(s)
    const before = effectiveBp(s, "p1", jaw)
    resolveAction(s, "p1", jaw, actionOf(JAW))
    assert(effectiveBp(s, "p1", jaw) === before + 2000, "相手の回復状態2体ぶん BP+2000")
    clearBattle(s)
    assert(effectiveBp(s, "p1", jaw) === before, "バトルが終わると戻る")
}

console.log("=== 3. 「このターンの間」と書かれたマジックの BP+ はバトルが終わっても残る ===")
{
    const { s, me } = board()
    const before = effectiveBp(s, "p1", me)
    resolveAction(s, "p1", null, actionOf(DOUBLE_DRAW), me.instanceId, undefined, "magic")
    assert(effectiveBp(s, "p1", me) === before + 2000, "BP+2000")
    clearBattle(s)
    assert(effectiveBp(s, "p1", me) === before + 2000, "バトルが終わっても残る")
}

console.log("すべてのチェックに合格しました 🎉（part365）")
