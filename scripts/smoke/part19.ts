// smoke パート19（BS03新キーワード【粉砕】【光芒】の検証）
import { assert, act, takeLifeAndResolve, createGame, createInstance, runTurnStart } from "./helpers"

console.log("=== 粉砕（BS03-076 爪剣のラザラス Lv2） ===")
{
    const s = createGame(
        "funsai-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const razarus = createInstance("BS03-076", s.turn, 2) // 爪剣のラザラス Lv2（粉砕）BP3000
    s.players.p1.field.spirits.push(razarus)
    const deckBefore = s.players.p2.deck.length
    const trashBefore = s.players.p2.trashCards.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: razarus.instanceId }) === null,
        "ラザラスでアタック（粉砕発動）",
    )
    assert(s.players.p2.deck.length === deckBefore - 2, "相手デッキが2枚減った")
    assert(s.players.p2.trashCards.length === trashBefore + 2, "相手トラッシュが2枚増えた")
}

console.log("=== 粉砕：デッキ残1枚でも安全に破棄される ===")
{
    const s = createGame(
        "funsai-lowdeck-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const razarus = createInstance("BS03-076", s.turn, 2)
    s.players.p1.field.spirits.push(razarus)
    s.players.p2.deck = s.players.p2.deck.slice(0, 1) // デッキ残1枚にする
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: razarus.instanceId }) === null,
        "ラザラスでアタック（デッキ残1枚）",
    )
    assert(s.players.p2.deck.length === 0, "デッキがちょうど0枚になった")
    assert(s.players.p2.trashCards.length === 1, "破棄されたのは1枚だけ")
    assert(s.winner === null, "デッキ切れによる敗北にはならない（敗北はドロー不能時のみ）")
}

console.log("=== 光芒（BS03-054 アルカナドール・トリア Lv2） ===")
{
    const s = createGame(
        "kobo-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const doll = createInstance("BS03-054", s.turn, 3) // アルカナドール・トリア Lv2（光芒）BP4000
    s.players.p1.field.spirits.push(doll)
    s.players.p1.hand[0] = "BS01-123" // リターンドロー（フラッシュ：BP+1000、コスト2）
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: doll.instanceId }) === null, "トリアでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（攻撃側に優先権が移る）")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0 }) === null,
        "フラッシュでリターンドローを使用",
    )
    assert(s.players.p1.trashCards.includes("BS01-123"), "使用直後はトラッシュにある")
    assert(takeLifeAndResolve(s, "p2") === null, "防御側はライフで受ける（バトル終了）")
    assert(s.players.p1.hand.includes("BS01-123"), "【光芒】でリターンドローが手札に戻った")
    assert(!s.players.p1.trashCards.includes("BS01-123"), "トラッシュからは消えている")
}

console.log("=== 光芒：バトル中にマジックを使わなければ何も起きない ===")
{
    const s = createGame(
        "kobo-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const doll = createInstance("BS03-054", s.turn, 3)
    s.players.p1.field.spirits.push(doll)
    const handBefore = [...s.players.p1.hand]
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: doll.instanceId }) === null, "トリアでアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "防御側はライフで受ける（バトル終了）")
    assert(
        JSON.stringify(s.players.p1.hand) === JSON.stringify(handBefore),
        "マジックを使っていないので手札は変化しない",
    )
    assert(s.battle === null, "バトル終了")
}
