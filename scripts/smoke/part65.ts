// smoke パート65（【激突】の動作確認と、ブロック不能ブロッカーによる詰みの回帰）
//
// 【激突】は第一弾から実装されていたが、**保持カードが1枚も収録されていないため一度も動作実績がない**
// 経路だった（設計担当の指摘）。将来弾（ブレイヴの【合体中】）で実カードが出る前に、
// 一時付与（grantKeyword）で実際に通しておく。
//
// あわせて、当初の実装が `hasBlocker`（疲労とレベルしか見ない）を使っていたために起きる
// **詰み**を回帰として押さえる: ブロッカーはいるが `cantBlock` で実際にはブロックできない場合、
// 「ブロックもできない・ライフでも受けられない」状態になり、防御側の手番が進まなくなっていた。
// 強制ブロック（mustBlockGrant）側は先に `hasLegalBlocker`（validateBlock を実際に通す）で
// 対処済みだったので、【激突】も同じ判定に揃えた。
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// アタック直前の状態を作る（p1 のターン・アタックステップ、両者のフィールドを空にしてから配置する）
function setupAttackStep(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

// アタッカーに【激突】をこのターンだけ付与する（静的に持つカードが未収録のため）
function grantClash(s: GameState, instanceId: string): void {
    resolveAction(s, "p1", null, { type: "grantKeyword", keyword: "clash" }, instanceId)
}

console.log("=== §A 激突: ブロックできるスピリットがいるならライフで受けられない ===")
{
    const s = setupAttackStep("clash-blocked")
    const attacker = put(s, "p1", "BS01-002", 1)
    put(s, "p2", "BS01-002", 1) // 回復状態の通常スピリット＝ブロックできる

    grantClash(s, attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言できる")

    const err = act(s, "p2", { type: "takeLife" })
    assert(err !== null, "【激突】によりライフ受けが拒否される")
    assert(String(err).includes("激突"), `拒否理由が【激突】であること（実際: ${err}）`)
    assert(s.players.p2.life === 5, "ライフは減っていない")
}

console.log("=== §B 激突: ブロックできるスピリットが1体もいなければライフで受けられる ===")
{
    const s = setupAttackStep("clash-no-blocker")
    const attacker = put(s, "p1", "BS01-002", 1)
    // 防御側は疲労状態のみ＝ブロック不可
    const rested = put(s, "p2", "BS01-002", 1)
    s.players.p2.field.spirits.find((x) => x.instanceId === rested)!.isRested = true

    grantClash(s, attacker)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker })

    assert(act(s, "p2", { type: "takeLife" }) === null, "ブロッカー不在ならライフで受けられる")
    assert(s.players.p2.life === 4, "ライフが1減る")
}

console.log("=== §C 回帰: cantBlock のスピリットしかいないときに詰まないこと ===")
{
    // テラノセイバー（BS01-003）は Lv1 で cantBlock。回復状態でもブロックはできない。
    // 旧実装（hasBlocker）はレベルと疲労しか見ないため、これを「ブロックできる」と誤判定し、
    // ブロックもライフ受けもできない詰みになっていた。
    assert(getCard("BS01-003").name === "テラノセイバー", "テスト前提: BS01-003 はテラノセイバー")

    const s = setupAttackStep("clash-cantblock")
    const attacker = put(s, "p1", "BS01-002", 1)
    const cantBlocker = put(s, "p2", "BS01-003", 1) // Lv1 = cantBlock

    grantClash(s, attacker)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker })

    // 前提: このブロッカーは実際にブロックできない
    assert(
        act(s, "p2", { type: "block", instanceId: cantBlocker }) !== null,
        "テスト前提: cantBlock のスピリットはブロックを拒否される",
    )
    // よってライフ受けは許可されなければならない（さもなくば防御側の選択肢がゼロになる）
    assert(
        act(s, "p2", { type: "takeLife" }) === null,
        "ブロックできないブロッカーしかいなければライフで受けられる（詰み回避）",
    )
    assert(s.players.p2.life === 4, "ライフが1減る")
}

console.log("=== §D 激突を持たないアタッカーには影響しない ===")
{
    const s = setupAttackStep("clash-absent")
    const attacker = put(s, "p1", "BS01-002", 1)
    put(s, "p2", "BS01-002", 1) // ブロックできるスピリットがいる

    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker })

    assert(act(s, "p2", { type: "takeLife" }) === null, "激突なしならブロッカーがいてもライフで受けられる")
}
