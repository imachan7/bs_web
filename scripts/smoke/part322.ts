// smoke パート322（fieldEvent の「解決の主体」。audit:semantics の S6 軸）
//
// 2026-09-13 に audit:semantics の S6（fieldEvent の主語）を仕分けて見つかった実バグ5件。
// anySpiritAttacked / anySpiritExhausted は**イベント対象の持ち主が実行者**になるため
// （triggers.ts の contextOf: actionPid = selfOverride.pid）、subjectSide:"opponent" だけを
// 書くと「相手のスピリットがアタックしたとき、**自分は**〜する」が**相手の動作**になる。
// selfMode:"source" で主体を発生源の持ち主に固定するのが正解（SEMANTICS_AUDIT.md §3.1）。
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

// p2 が発生源を持ち、p1（相手）がアタックする盤面を作る
function setup(seed: string, ownColor: "red" | "purple" | "white" | "green" | "blue") {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: ownColor })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.interactiveTargets = false
    return s
}
const attackWith = (s: GameState) => {
    const atk = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    refreshLevelAsOverrides(s)
    return atk
}

console.log("=== BS10-083 魔星輝く古戦場：ドローするのはネクサスの持ち主 ===")
{
    const s = setup("s6-bs10-083", "purple")
    s.players.p2.field.nexuses.push(createInstance("BS10-083", s.turn, 1))
    const atk = attackWith(s)
    const before = { p1: s.players.p1.hand.length, p2: s.players.p2.hand.length }
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
    assert(s.players.p2.hand.length === before.p2 + 1, "持ち主（p2）が1枚ドローする")
    assert(s.players.p1.hand.length === before.p1, "相手（p1）はドローしない")
}

console.log("=== BS11-031 ワルキューレ・ミスト：疲労するのは相手のスピリット ===")
{
    const s = setup("s6-bs11-031", "white")
    const mist = createInstance("BS11-031", s.turn, 3) // Lv2（3コア）
    s.players.p2.field.spirits.push(mist)
    const mine = createInstance("BS01-074", s.turn, 1)
    s.players.p2.field.spirits.push(mine)
    const atk = attackWith(s)
    const theirOther = createInstance("BS01-002", s.turn, 1)
    s.players.p1.field.spirits.push(theirOther)
    refreshLevelAsOverrides(s)

    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
    const find = (id: string) =>
        [...s.players.p1.field.spirits, ...s.players.p2.field.spirits].find((x) => x.instanceId === id)
    assert(find(theirOther.instanceId)?.isRested === true, "相手（p1）のスピリットが疲労する")
    assert(find(mine.instanceId)?.isRested === false, "自分（p2）のスピリットは疲労しない")
}

console.log("=== BS14-077 骸の斜塔：疲労でドローするのはネクサスの持ち主 ===")
{
    const s = setup("s6-bs14-077", "purple")
    s.players.p2.field.nexuses.push(createInstance("BS14-077", s.turn, 3)) // Lv2
    const atk = attackWith(s)
    const before = { p1: s.players.p1.hand.length, p2: s.players.p2.hand.length }
    // アタック＝アタッカーが疲労する。それを anySpiritExhausted が拾う
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
    assert(s.players.p2.hand.length > before.p2, "持ち主（p2）がドローする")
    assert(s.players.p1.hand.length === before.p1, "相手（p1）はドローしない")
}

console.log("すべてのチェックに合格しました 🎉（part322）")
