// smoke パート167（ログとイベントに「どの効果で何が起きたか」を出す）
//
// 2026-08-10 ユーザー要望。実対戦のログが次のようになっていて、
// **何によってそうなったのか**が追えなかった:
//
//   「ファンタズマは疲労した。」                    ← 何の効果で？（実際は【暴風】）
//   「ユウキのファンタズマはデッキの一番下に戻った。」← 何によって？（実際は颶風高原Lv2）
//
// あわせて、破壊以外でフィールドを離れたとき（手札／デッキへ戻る）にも GameEvent を出す
// （UI担当依頼 chatbox 2026-08-10-1710。クライアントが破壊と同じく通知を出せるようにする）。
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}
const hasLog = (s: GameState, text: string): boolean => s.log.some((l) => l.includes(text))

console.log("=== 【暴風】の疲労と、颶風高原Lv2のデッキ戻しに発生源が出る ===")
{
    const s = createGame("log-bofu-gufu", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.field.nexuses.push(createInstance("BS06-080", s.turn, 4)) // 颶風高原 Lv2
    const attacker = putSpirit(s, "p1", "BS06-028", 3) // ガブノハシ Lv2（【暴風】持ち・BP5000）
    const blocker = putSpirit(s, "p2", "BS02-014", 1) // ファンタズマ Lv1 BP2000
    // 【暴風】で疲労させられる側。ブロッカーはBP比較で破壊されるので、戻る対象はこちらになる
    putSpirit(s, "p2", "BS02-014", 1)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "ブロック（ここで【暴風】が誘発）")

    assert(
        hasLog(s, "ガブノハシの【暴風】：ファンタズマは疲労した。"),
        "疲労のログに発生源と【暴風】が出る",
    )

    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(
        hasLog(s, "颶風高原：ユウキのファンタズマはデッキの一番下に戻った。"),
        "デッキ戻しのログに発生源（颶風高原）が出る",
    )
}

console.log("=== 手札・デッキへ戻ったときに GameEvent が出る（UI通知用） ===")
{
    const s = createGame("log-return-events", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    const target = putSpirit(s, "p2", "BS02-014", 1)

    // ドリームリボン（フラッシュ：相手のスピリット1体を手札に戻す）。フラッシュ専用なのでバトル中に使う
    const attacker = putSpirit(s, "p1", "BS02-014", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（優先権が攻撃側へ）")
    s.events = []
    s.players.p1.hand = ["BS01-146"]
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target })
    assert(err === null, `マジックを使用できる（${err ?? "ok"}）`)
    const ev = s.events.find((e) => e.type === "returnToHand")
    assert(ev !== undefined, "returnToHand イベントが発行される")
    assert(ev?.type === "returnToHand" && ev.pid === "p2", "戻された側（持ち主）のpidが載る")
    assert(ev?.type === "returnToHand" && ev.cardName === "ファンタズマ", "カード名が載る")
    assert(
        ev?.type === "returnToHand" && ev.sourceName !== undefined,
        "どの効果で戻ったか（発生源カード名）が載る",
    )
}

console.log("=== デッキへ戻ったときのイベントには上/下が載る ===")
{
    const s = createGame("log-return-deck-event", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.field.nexuses.push(createInstance("BS06-080", s.turn, 4))
    const attacker = putSpirit(s, "p1", "BS06-028", 3)
    const blocker = putSpirit(s, "p2", "BS02-014", 1)
    putSpirit(s, "p2", "BS02-014", 1) // 【暴風】で疲労させられ、デッキの下に戻る側

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "ブロック")
    s.events = []
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")

    const ev = s.events.find((e) => e.type === "returnToDeck")
    assert(ev !== undefined, "returnToDeck イベントが発行される")
    assert(ev?.type === "returnToDeck" && ev.position === "bottom", "デッキの下に戻ったことが分かる")
    assert(ev?.type === "returnToDeck" && ev.sourceName === "颶風高原", "発生源が載る")
}
