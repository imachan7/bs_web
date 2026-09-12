// smoke パート323（BS14-084 永久凍土の王都：ライフが0になる瞬間を守る範囲）
//
// 「自分のライフが0になるとき、このネクサスを自分のトラッシュに置くことで、自分のライフは0にならない。」
// 効果文は**原因を限定していない**ので、アタックでも効果でも守る。
//
// 2026-09-13 に調べたところ、ライフを減らす経路は7つあるのに
// tryOwnLifeFloorByCost を呼んでいたのは2つ（アタック／lifeCrush）だけだった。
// **相手の効果でライフをコストにされる経路**（BS14-X02 呪滅撃の opponentLifeOneToTrash）も
// 守るようにした（ユーザー判断）。
// ⚠️ **自分でコストとして払う経路**（BS08-056 太陽石の神殿／BS13-036 星鳥クージャ／
//    BS13-039 神獣バーロン／BS08-064 鳳翼の聖剣）は**意図的に対象外**のまま。
//    「自分から払って0にしておいて助かる」のが正しいか未確定のため（HANDOFF §2）。
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

function setup(copies = 1): GameState {
    const s: GameState = createGame("life-floor", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.phase = "main"
    s.turnPlayer = "p1"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.interactiveTargets = false
    for (let i = 0; i < copies; i++) s.players.p2.field.nexuses.push(createInstance("BS14-084", s.turn, 1))
    refreshLevelAsOverrides(s)
    s.players.p2.life = 1
    return s
}
const onField = (s: GameState) => s.players.p2.field.nexuses.filter((n) => n.cardId === "BS14-084").length
const inTrash = (s: GameState) => s.players.p2.trashCards.filter((c) => c === "BS14-084").length

console.log("=== 効果でのライフバーン（lifeCrush）から守る ===")
{
    const s = setup()
    resolveAction(s, "p1", null, { type: "lifeCrush", count: 1 })
    assert(s.players.p2.life === 1, "ライフは0にならない")
    assert(s.winner === null, "敗北しない")
    assert(inTrash(s) === 1, "ネクサスは自分のトラッシュへ置かれる")
    assert(onField(s) === 0, "場からは無くなる")
}

console.log("=== 複数枚あっても、1回のライフ0につき1枚だけ使う ===")
{
    const s = setup(3)
    for (let i = 1; i <= 3; i++) {
        resolveAction(s, "p1", null, { type: "lifeCrush", count: 1 })
        assert(s.players.p2.life === 1, `${String(i)}回目：ライフは0にならない`)
        assert(inTrash(s) === i, `${String(i)}回目：消費したのは累計${String(i)}枚だけ`)
        assert(onField(s) === 3 - i, `${String(i)}回目：残りは${String(3 - i)}枚`)
    }
    // 4回目は守るものが無いので敗北する
    resolveAction(s, "p1", null, { type: "lifeCrush", count: 1 })
    assert(s.players.p2.life === 0, "4回目はライフが0になる")
    assert(s.winner === "p1", "守るネクサスが尽きたら敗北する")
}

console.log("=== 王都が無ければ、そのまま敗北する（テストの対照） ===")
{
    const s = setup(0)
    resolveAction(s, "p1", null, { type: "lifeCrush", count: 1 })
    assert(s.players.p2.life === 0 && s.winner === "p1", "守りが無ければ敗北する")
}

console.log("すべてのチェックに合格しました 🎉（part323）")
