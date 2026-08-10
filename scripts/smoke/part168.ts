// smoke パート168（BS06-052 ヒナペンタン：疲労と効果を1つの選択にまとめる）
//
// UI担当からの依頼（chatbox 2026-08-10-1641）で調べたところ、**カードが機能していなかった**。
// 「このスピリットを疲労させることで、このターンの間〜」を
// 疲労（optional）と貸与（optional）の2エントリに分けていたため、
// 発動を選ぶと**疲労だけして貸与が発火せず**、コストだけ払って何も得られない状態だった。
//
// 任意コストと効果は1つのアクション（exhaustSelfThenLendThisTurn）にまとめる。
// 確認は1回だけになり、「疲労だけ」「効果だけ」の組み合わせも起きない。
import { act, assert, createGame, createInstance, instHasCost } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireStepTriggers } from "../../server/src/logic/EffectModules"

function setup(seed: string, cores = 1): { s: GameState; hina: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    s.interactiveTargets = true
    const hina = createInstance("BS06-052", s.turn, cores)
    s.players.p2.field.spirits.push(hina)
    // 「自分のスピリットすべてをコスト2としても扱う」の対象になる別のスピリット
    s.players.p2.field.spirits.push(createInstance("BS02-049", s.turn, 1)) // ピヨン（コスト0）
    s.turnPlayer = "p1" // 相手のスタートステップに発動する効果
    s.phase = "start"
    return { s, hina }
}
const otherSpirit = (s: GameState): ReturnType<typeof createInstance> =>
    s.players.p2.field.spirits.find((x) => x.cardId === "BS02-049")!

console.log("=== 発動すると、疲労と効果が両方そろう ===")
{
    const { s, hina } = setup("hina-both")
    fireStepTriggers(s, "start")
    assert(s.pendingChoice !== null, "発動確認が出る")
    assert(s.pendingChoice?.kind === "option", "はい/いいえ形式（option）で聞かれる")

    const option = s.pendingChoice?.options?.[0] ?? ""
    assert(act(s, "p2", { type: "resolveChoice", option }) === null, "発動する")
    assert(s.pendingChoice === null, "確認は1回だけ（分割されていない）")
    assert(hina.isRested === true, "コストとして自身が疲労する")
    assert(s.players.p2.turnVirtualInstances.length === 1, "効果（貸与）も発火している")
    assert(
        instHasCost(otherSpirit(s), 2),
        "自分のスピリットすべてがコスト2としても扱われる",
    )
}

console.log("=== 発動しなければ、疲労もしないし効果も出ない ===")
{
    const { s, hina } = setup("hina-skip")
    fireStepTriggers(s, "start")
    assert(act(s, "p2", { type: "resolveChoice" }) === null, "発動しない（スキップ）")
    assert(hina.isRested === false, "疲労していない")
    assert(s.players.p2.turnVirtualInstances.length === 0, "貸与もされない")
    assert(!instHasCost(otherSpirit(s), 2), "コスト2としては扱われない")
}

console.log("=== すでに疲労していれば発動できない（コストを払えない） ===")
{
    const { s, hina } = setup("hina-already-rested")
    hina.isRested = true
    fireStepTriggers(s, "start")
    if (s.pendingChoice !== null) {
        const option = s.pendingChoice.options?.[0] ?? ""
        assert(act(s, "p2", { type: "resolveChoice", option }) === null, "発動を選んでも")
    }
    assert(s.players.p2.turnVirtualInstances.length === 0, "コストを払えないので貸与は起きない")
    assert(!instHasCost(otherSpirit(s), 2), "コスト2としては扱われない")
}

console.log("=== 非対話（smokeの既定）でも疲労と効果がそろう ===")
{
    const { s, hina } = setup("hina-auto")
    s.interactiveTargets = false
    fireStepTriggers(s, "start")
    assert(s.pendingChoice === null, "確認は出ない")
    assert(hina.isRested === true, "疲労する")
    assert(s.players.p2.turnVirtualInstances.length === 1, "貸与も発火する")
}
