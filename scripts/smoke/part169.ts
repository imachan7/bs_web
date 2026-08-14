// smoke パート169（BS08-055 竜騎集う円卓Lv2：手札を破棄して防ぐかをプレイヤーが決められるようにする）
//
// 「自分の手札1枚を破棄することで、その効果を受けない」は**任意コスト**だが、
// 条件を満たす限り必ず破棄して防いでいた。
//
// この耐性は装甲と同じ resistanceAgainst の中で判定される。装甲は
// 「盤面を見るだけの同期の述語」なので、その場でプレイヤーに選択を出すことができない。
// そこで**方針をあらかじめ盤面の状態にしておく**（PlayerState.payToNegate ／
// GameAction "setPayToNegate"）。判定側は装甲と同じくその状態を読むだけになる。
//
// 既定は true（従来どおり払って防ぐ）なので、設定しなければ挙動は変わらない。
import { act, assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// p2 側に「竜騎集う円卓Lv2」と系統「龍帝」のスピリットを置き、p1（相手）のスピリットの効果で狙う。
// 効果は p2 のアタックステップ**ではなく** p2 自身のターンのアタックステップに限る（phaseTurn: own）
function setup(seed: string): { s: GameState; target: ReturnType<typeof createInstance>; attacker: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2" // 円卓の効果は「自分のアタックステップ」限定
    s.phase = "attack"
    s.players.p2.field.nexuses.push(createInstance("BS08-055", s.turn, 1)) // 竜騎集う円卓 Lv2
    const target = createInstance("BS04-055", s.turn, 1) // 光帝リュミエール（系統「龍帝」）
    s.players.p2.field.spirits.push(target)
    const attacker = createInstance("BS02-014", s.turn, 1) // 効果の発生源（相手のスピリット）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.hand = ["BS02-049", "BS02-051"] // 破棄できる手札
    return { s, target, attacker }
}
// p1 のスピリットの効果で p2 の龍帝1体を疲労させにいく（単体対象＝targeted）
function tryExhaust(s: GameState, attacker: ReturnType<typeof createInstance>, targetId: string): void {
    resolveAction(s, "p1", attacker, { type: "exhaust", count: 1 }, targetId, undefined, "spirit")
}

console.log("=== 既定（未設定）では従来どおり手札を破棄して防ぐ ===")
{
    const { s, target, attacker } = setup("entaku-default")
    tryExhaust(s, attacker, target.instanceId)
    assert(target.isRested === false, "効果を受けていない（防いだ）")
    assert(s.players.p2.hand.length === 1, "手札1枚を破棄している")
    assert(s.players.p2.trashCards.length === 1, "破棄したカードはトラッシュへ")
}

console.log("=== 「使わない」に設定すると、手札を残して効果を受ける ===")
{
    const { s, target, attacker } = setup("entaku-off")
    assert(act(s, "p2", { type: "setPayToNegate", enabled: false }) === null, "方針を「使わない」に切り替える")
    assert(s.players.p2.payToNegate === false, "設定が保持される")

    tryExhaust(s, attacker, target.instanceId)
    assert(target.isRested === true, "効果を受ける（防がない）")
    assert(s.players.p2.hand.length === 2, "手札は減っていない")
}

console.log("=== 「使う」に戻せる ===")
{
    const { s, target, attacker } = setup("entaku-back-on")
    assert(act(s, "p2", { type: "setPayToNegate", enabled: false }) === null, "いったん切る")
    assert(act(s, "p2", { type: "setPayToNegate", enabled: true }) === null, "また入れる")
    tryExhaust(s, attacker, target.instanceId)
    assert(target.isRested === false, "防ぐ")
    assert(s.players.p2.hand.length === 1, "手札1枚を破棄している")
}

console.log("=== 相手のターン中でも設定を切り替えられる（手順の外側の操作） ===")
{
    const { s } = setup("entaku-anytime")
    s.turnPlayer = "p1" // 相手のターンにする
    assert(act(s, "p2", { type: "setPayToNegate", enabled: false }) === null, "自分のターンでなくても受け付ける")
    assert(s.players.p2.payToNegate === false, "設定が反映される")
}

console.log("=== 手札が無ければ、方針にかかわらず防げない ===")
{
    const { s, target, attacker } = setup("entaku-no-hand")
    s.players.p2.hand = []
    tryExhaust(s, attacker, target.instanceId)
    assert(target.isRested === true, "支払えないので効果を受ける")
}
