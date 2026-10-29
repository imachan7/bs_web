// smoke パート685（BS11-080 デルタバリア「相手のスピリット/マジックの効果と、コスト4以上の相手のスピリットのアタックでは、自分のライフは0にならない」は、自分のコストで払うライフには効かない。EFFECT_GATE §4 の 4）
import { assert, createGame, createInstance, fireSummonTrigger, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const DELTA = "BS11-080" // デルタバリア
const DARK_KNIGHT = "BS16-008" // ダークナイト・ドラゴン：召喚時、自分のライフのコア1個をボイドに置くことで、BP6000以下の相手1体を破壊
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提 ===")
{
    assert(getCard(DELTA).name === "デルタバリア" && getCard(DELTA).type === "magic", "DELTAはデルタバリア")
    assert(getCard(DARK_KNIGHT).name === "ダークナイト・ドラゴン", "DARK_KNIGHTはダークナイト・ドラゴン")
}

const deltaAction = (): EffectAction => (getCard(DELTA).effects.find((e) => e.kind === "magic") as { action: EffectAction }).action

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.life = 1
    resolveAction(s, "p1", null, deltaAction(), undefined, ["white"], "magic", undefined, undefined, DELTA)
    return s
}

console.log("=== 1. 相手のスピリットの効果では0にならない ===")
{
    const s = game("delta-opp")
    const foe = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(foe)
    resolveAction(s, "p2", foe, { type: "lifeCrush", count: 1 } as EffectAction, undefined, ["red"], "spirit")
    assert(s.players.p1.life === 1, "ライフは1のまま")
}

console.log("=== 2. 自分のスピリットのコストで払うライフは止めない（0になれば敗北） ===")
{
    const s = game("delta-own")
    const dk = createInstance(DARK_KNIGHT, s.turn, 1)
    const foe = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(dk)
    s.players.p2.field.spirits.push(foe)
    refreshLevelAsOverrides(s)
    fireSummonTrigger(s, "p1", dk)
    assert(s.players.p1.life === 0, "ライフ1を払って0になる")
}

console.log("すべてのチェックに合格しました 🎉（part685）")
