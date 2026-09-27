// smoke パート415（カウンタ minus・opponentCoresTotal：ブラッディレインの段とセイムタイアードを実カードデータで解決する）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const BLOODY_RAIN = "BS02-094" // ブラッディレイン
const SAME_TIRED = "BS03-139" // セイムタイアード
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BLOODY_RAIN).name === "ブラッディレイン" && getCard(SAME_TIRED).name === "セイムタイアード", "カード名")
    assert(getCard(VANILLA).effects.length === 0, "VANILLA はバニラ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.players.p2.field.spirits = []
    s.players.p2.field.nexuses = []
    s.players.p2.trashCores = 0
    return s
}
const total = (s: GameState): number => s.players.p2.reserve + s.players.p2.trashCores + s.players.p2.field.spirits.reduce((n, x) => n + x.cores, 0)
const actionOf = (cardId: string, eid: string): EffectAction => (getCard(cardId).effects.find((e) => e.id === eid) as { action: EffectAction }).action

console.log("=== 1. ブラッディレイン：合計20個以上なら6個、10〜19個なら2個、9個以下なら何もしない ===")
for (const [reserve, removed] of [[20, 6], [12, 2], [9, 0]] as const) {
    const s = game(`bloody-${reserve}`)
    s.players.p2.reserve = reserve
    resolveAction(s, "p1", null, actionOf(BLOODY_RAIN, "BS02-094-e1"))
    assert(total(s) === reserve - removed, `合計${reserve}個 → ${removed}個をボイドへ`)
}

console.log("=== 2. セイムタイアード：疲労している数が同じになるように相手を疲労させる ===")
{
    const s = game("same-tired")
    for (let i = 0; i < 3; i++) {
        const mine = createInstance(VANILLA, s.turn, 1)
        mine.isRested = true
        s.players.p1.field.spirits.push(mine)
    }
    const foes = [0, 1, 2, 3].map(() => createInstance(VANILLA, s.turn, 1))
    foes[0]!.isRested = true
    s.players.p2.field.spirits.push(...foes)
    resolveAction(s, "p1", null, actionOf(SAME_TIRED, "e1"))
    assert(foes.filter((f) => f.isRested).length === 3, "相手の疲労は1体→3体（自分と同じ）")
}

console.log("すべてのチェックに合格しました 🎉（part415）")
