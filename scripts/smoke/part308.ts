// smoke パート308（「ターンに1回」はコストを払えなかったときは消費しない）
// ルール上、コストを払えなければ効果は発揮していないので oncePerTurn の枠は残る。
// 消費は triggers.ts が**発揮の直前**に記録している（解決中に中断が入っても再発揮させないため）ので、
// コスト不発を検出したハンドラが refundOncePerTurn() で巻き戻す。
// 見本は BS13-070 星宿の障壁 Lv2（このネクサスを疲労させることで、ボイドからコア1個を自分のライフに置く）
import {
    assert,
    createGame,
    createInstance,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { fireFieldEventTriggers } from "../../server/src/logic/EffectModules"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    // 『相手のアタックステップ』限定の誘発なので、p1 から見て相手（p2）のアタックステップに置く
    s.turnPlayer = "p2"
    s.phase = "attack"
    return s
}

console.log("=== BS13-070 Lv2：疲労できないときは「ターンに1回」を消費しない ===")
{
    const s = game("once-per-turn-refund")
    const barrier = createInstance("BS13-070", s.turn, 2) // Lv2
    barrier.isRested = true // コスト（自身を疲労させる）が払えない状態
    s.players.p1.field.nexuses.push(barrier)
    refreshLevelAsOverrides(s)
    const lifeBefore = s.players.p1.life

    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.life === lifeBefore, "疲労できないので発揮しない")
    assert(
        barrier.triggeredUsedTurn?.["BS13-070-e2"] === undefined,
        "コストを払えなかったので「ターンに1回」の枠は消費されない",
    )

    barrier.isRested = false
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.life === lifeBefore + 1, "同じターンでも、払えるようになれば発揮できる")
    assert(barrier.isRested === true, "コストとして自身が疲労した")
    assert(barrier.triggeredUsedTurn?.["BS13-070-e2"] === s.turn, "発揮したので枠を消費する")
}

console.log("=== BS13-070 Lv2：一度発揮したら同じターンには二度と発揮しない（従来どおり） ===")
{
    const s = game("once-per-turn-consumed")
    const barrier = createInstance("BS13-070", s.turn, 2) // Lv2
    s.players.p1.field.nexuses.push(barrier)
    refreshLevelAsOverrides(s)
    const lifeBefore = s.players.p1.life

    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.life === lifeBefore + 1, "1回目は発揮する")
    barrier.isRested = false // 疲労だけ戻しても、枠を消費済みなので発揮しない
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.life === lifeBefore + 1, "2回目は「ターンに1回」で発揮しない")
}

console.log("すべてのチェックに合格しました 🎉（part308）")
