// smoke パート30（イベント通知レイヤー Phase 1）
// 収録セクション:
//   - GameEvent: 召喚でstate.eventsにsummonイベントが積まれる（cardName/pid/seq採番）
//   - GameEvent: handleAction冒頭でstate.eventsがクリアされる（前アクション分は残らない）
//   - GameEvent: destroySpiritでdestroyイベントが積まれる
//   - GameEvent: draw()でdrawイベントが積まれる
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    draw,
    runTurnStart,
} from "./helpers"

console.log("=== GameEvent: 召喚でsummonイベントが積まれる ===")
{
    const s = createGame(
        "gameevent-summon-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS01-063" // エメラルドシーザー
    const seqBefore = s.eventSeq
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーを召喚できる")
    const summonEvents = s.events.filter((e) => e.type === "summon")
    assert(summonEvents.length === 1, "eventsにsummonイベントが1件積まれる")
    const ev = summonEvents[0]
    assert(
        ev !== undefined && ev.type === "summon" && ev.pid === "p1" && ev.cardName === "エメラルドシーザー",
        "summonイベントのpid・cardNameが正しい",
    )
    assert(ev !== undefined && ev.seq > seqBefore, "seqはeventSeqの通し番号として採番される")
}

console.log("=== GameEvent: handleAction冒頭でeventsがクリアされる ===")
{
    const s = createGame(
        "gameevent-clear-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS01-063"
    act(s, "p1", { type: "summon", handIndex: 0 })
    assert(s.events.some((e) => e.type === "summon"), "1回目のアクション直後はsummonイベントが残っている")
    const seqAfterFirst = s.eventSeq

    // 2回目の別アクション（コア移動）：エラーになっても handleAction 冒頭のクリアは必ず通る
    act(s, "p1", { type: "moveCore", instanceId: s.players.p1.field.spirits[0]?.instanceId ?? "", direction: "add" })
    assert(!s.events.some((e) => e.type === "summon"), "2回目のアクションで前回分のsummonイベントは消える")
    assert(s.eventSeq >= seqAfterFirst, "eventSeqはクリアしてもリセットされず増え続ける")
}

console.log("=== GameEvent: destroySpiritでdestroyイベントが積まれる ===")
{
    const s = createGame(
        "gameevent-destroy-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    const target = createInstance("BS01-001", s.turn, 1) // ゴラドン
    s.players.p1.field.spirits.push(target)
    s.events = [] // 直前の召喚等に依存しないよう明示的にクリアしてから検証する
    destroySpirit(s, "p1", target.instanceId, "destroy")
    const destroyEvents = s.events.filter((e) => e.type === "destroy")
    assert(destroyEvents.length === 1, "eventsにdestroyイベントが1件積まれる")
    const dev = destroyEvents[0]
    assert(
        dev !== undefined && dev.type === "destroy" && dev.pid === "p1" && dev.cardName === "ゴラドン",
        "destroyイベントのpid・cardNameが正しい",
    )
}

console.log("=== GameEvent: draw()でdrawイベントが積まれる ===")
{
    const s = createGame(
        "gameevent-draw-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    s.events = []
    draw(s, "p2", 2)
    const drawEvents = s.events.filter((e) => e.type === "draw")
    assert(drawEvents.length === 1, "eventsにdrawイベントが1件積まれる")
    const dwev = drawEvents[0]
    assert(
        dwev !== undefined && dwev.type === "draw" && dwev.pid === "p2" && dwev.count === 2,
        "drawイベントのpid・countが正しい（1回のdraw呼び出しでまとめて1件）",
    )
}
