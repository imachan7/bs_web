// smoke パート163（「印刷されたカードより強い」簡略化を2件つぶす）
//
//   BS06-095 ベリアルドロー    「**アタックした**自分の紫のスピリットが」の限定が無く、
//                              ブロッカーとして破壊された場合もドローしていた（fieldEvent の attackerOnly）
//   BS07-062 ブリシンガメンの首飾りLv2  「ターンに1回」の制限が無く、何度ブロックしても疲労しなかった
//                              （constraint の oncePerTurn）
//
// どちらも「効くこと」だけでなく「**効かない条件で効かないこと**」まで見る。
// 前者だけだと限定を書き忘れた実装（＝直す前）でも通ってしまう。
import { act, assert, createGame, createInstance, declareBlock, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst.instanceId
}
// ブロックされたバトルを解決まで進める（フラッシュはどちらも使わない）
function resolveBlockedBattle(s: GameState, attackerId: string, blockerId: string): void {
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "p1がアタック")
    assert(declareBlock(s, "p2", blockerId) === null, "p2がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
}

console.log("=== BS06-095 ベリアルドロー：ドローは「アタックした」スピリットが破壊されたときだけ ===")
{
    const s = createGame("bs06-095-attacker-only", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    // p1（マジックの使用者）の紫スピリット。アタッカーは相手のBP4000に負ける側にする
    const attacker = putSpirit(s, "p1", "BS02-014", 1) // ファンタズマ Lv1 BP2000
    const myBlocker = putSpirit(s, "p1", "BS02-014", 1)
    putSpirit(s, "p2", "BS01-031", 1) // デス・ハーデス Lv1 BP4000
    s.players.p1.hand = ["BS06-095"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインでベリアルドローを使用")
    assert(s.players.p1.turnVirtualInstances.length === 1, "このターンの仮想発生源が立つ")

    console.log("--- アタッカーが破壊されたとき：ドローする ---")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const beforeHand = s.players.p1.hand.length
    const p2Blocker = s.players.p2.field.spirits[0]!.instanceId
    resolveBlockedBattle(s, attacker, p2Blocker)
    assert(
        s.players.p1.field.spirits.every((x) => x.instanceId !== attacker),
        "アタッカーはBP比較で破壊された",
    )
    assert(s.players.p1.hand.length === beforeHand + 2, "アタックしたスピリットの破壊で2枚ドロー")

    console.log("--- ブロッカーとして破壊されたとき：ドローしない ---")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    // p2のターン。p1のスピリットはブロック側に回る（貸与はp1のターン終了で切れているので張り直す）
    s.players.p1.turnVirtualInstances.push(createInstance("BS06-095", s.turn, 0))
    s.players.p1.turnVirtualInstances[0]!.instanceId = "virtual-relend"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2のアタックステップへ")
    const beforeHand2 = s.players.p1.hand.length
    assert(act(s, "p2", { type: "attack", instanceId: p2Blocker }) === null, "p2がアタック")
    assert(declareBlock(s, "p1", myBlocker) === null, "p1がブロック（自分の紫スピリット）")
    assert(act(s, "p1", { type: "pass" }) === null, "p1パス")
    assert(act(s, "p2", { type: "pass" }) === null, "p2パス→バトル解決")
    assert(
        s.players.p1.field.spirits.every((x) => x.instanceId !== myBlocker),
        "ブロッカーはBP比較で破壊された（イベント自体は起きている）",
    )
    assert(s.players.p1.hand.length === beforeHand2, "ブロックして破壊された場合はドローしない")
}

console.log("=== BS07-062 ブリシンガメンの首飾りLv2：疲労しないのはターンに1回まで ===")
{
    const s = createGame("bs07-062-once", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    runTurnStart(s)
    // 防御側（p2）にネクサスLv2（コア2）と、ブロッカー2体
    putNexus(s, "p2", "BS07-062", 2)
    const blocker1 = putSpirit(s, "p2", "BS01-031", 1) // デス・ハーデス Lv1 BP4000
    const blocker2 = putSpirit(s, "p2", "BS01-031", 1)
    // アタッカーは【転召】を持たない紫スピリット2体（BP2000なのでブロッカーが一方的に勝つ）
    const attacker1 = putSpirit(s, "p1", "BS02-014", 1)
    const attacker2 = putSpirit(s, "p1", "BS02-014", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")

    const restedOf = (id: string): boolean =>
        s.players.p2.field.spirits.find((x) => x.instanceId === id)?.isRested === true

    console.log("--- 1回目のブロック：疲労しない ---")
    resolveBlockedBattle(s, attacker1, blocker1)
    assert(restedOf(blocker1) === false, "1体目のブロッカーは疲労していない")
    assert(s.players.p2.noRestWhenBlockingUsedThisTurn === true, "「ターンに1回」を消費した記録が立つ")

    console.log("--- 2回目のブロック：今度は疲労する ---")
    resolveBlockedBattle(s, attacker2, blocker2)
    assert(restedOf(blocker2) === true, "2体目のブロッカーは疲労する（ターンに1回を使い切っている）")

    console.log("--- 次のターンにはまた1回使える ---")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    assert(s.players.p2.noRestWhenBlockingUsedThisTurn === false, "ターン終了で消費記録がリセットされる")
    assert(act(s, "p2", { type: "endTurn" }) === null, "p2ターン終了")
    // p1の2ターン目。p1のリフレッシュでアタッカーが回復している
    const attacker3 = putSpirit(s, "p1", "BS02-014", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    resolveBlockedBattle(s, attacker3, blocker1)
    assert(restedOf(blocker1) === false, "新しいターンでは再び疲労しない")
}
