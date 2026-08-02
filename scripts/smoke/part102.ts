// smoke パート102（降参）
//
// 降参はゲームの手順の外側にある操作なので、自分のターンでなくても、フラッシュタイミング中でも、
// 効果解決の選択待ち中でも受け付ける（handleAction の冒頭で、他のどの検証よりも先に処理される）。
// 相手の勝利としてただちに終了し、進行中のバトル・フラッシュ・選択待ちはすべて破棄される。
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    return s
}

console.log("=== 降参：自分のターンに降参すると相手の勝利になる ===")
{
    const s = setup("surrender-own-turn")
    assert(s.winner === null, "開始時は勝敗が決まっていない")
    assert(act(s, "p1", { type: "surrender" }) === null, "p1（ターンプレイヤー）が降参")
    assert(s.winner === "p2", "相手（p2）の勝利になる")
    assert(
        s.log.some((l) => l.includes("降参")),
        "降参したことがログに残る",
    )
}

console.log("--- 相手のターン中でも降参できる ---")
{
    const s = setup("surrender-opponent-turn")
    assert(s.turnPlayer === "p1", "p1のターン")
    assert(act(s, "p2", { type: "surrender" }) === null, "ターンプレイヤーでないp2が降参")
    assert(s.winner === "p1", "相手（p1）の勝利になる")
}

console.log("--- フラッシュタイミング中でも降参でき、バトルは破棄される ---")
{
    const s = setup("surrender-in-flash")
    const attacker = put(s, "p1", "BS01-001", 1)
    put(s, "p2", "BS01-001", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(s.isFlashTiming === true, "フラッシュタイミング中である")
    assert(s.battle !== null, "バトルが進行中である")

    assert(act(s, "p2", { type: "surrender" }) === null, "フラッシュ中に防御側が降参")
    assert(s.winner === "p1", "アタック側の勝利になる")
    assert(s.battle === null, "進行中のバトルは破棄される")
    assert(s.isFlashTiming === false, "フラッシュタイミングも解除される")
}

console.log("--- 効果解決の選択待ち中でも降参できる ---")
{
    const s = setup("surrender-in-choice")
    s.interactiveTargets = true
    // ランスラプトル（BS01-017）召喚時：BP2000以下のスピリット1体を破壊できる（optional＝発動確認が立つ）
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-001", 1)
    s.players.p1.hand[0] = "BS01-017"
    s.players.p1.reserve = 10

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ランスラプトルを召喚")
    assert(s.pendingChoice !== null, "選択待ちになっている")
    // 選択待ち中は resolveChoice 以外が拒否されることを確認してから降参する
    assert(act(s, "p1", { type: "endTurn" }) !== null, "選択待ち中は通常のアクションが拒否される")
    assert(act(s, "p1", { type: "surrender" }) === null, "選択待ち中でも降参は受け付けられる")
    assert(s.winner === "p2", "相手の勝利になる")
    assert(s.pendingChoice === null, "選択待ちは破棄される")
}

console.log("--- 勝敗が決まった後は降参できない ---")
{
    const s = setup("surrender-after-end")
    assert(act(s, "p1", { type: "surrender" }) === null, "p1が降参")
    assert(s.winner === "p2", "p2の勝利")
    assert(act(s, "p2", { type: "surrender" }) !== null, "終了後の降参は拒否される")
    assert(s.winner === "p2", "勝敗は上書きされない")
}
