// smoke パート960（破壊されたスピリットのコアの行き先が矛盾したら、後から発揮した効果へ置く。issue #571・公式回答。2026-11-16 ユーザー確認）
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance } from "../../server/src/type"
import { attachBrave } from "../../server/src/logic/brave"
import { destroySpirit } from "../../server/src/logic/removal"

const X01 = "BS20-X01" // 滅龍帝ジエンド・ドラゴニス（Lv1〜：破壊された自分のスピリットのコアは、このスピリットに置く）
const HEDGE = "BS10-065" // ヘッジボルグ（BPを比べ相手のスピリットだけを破壊したとき、そのコアすべてをボイドに置く）
const HOST = "BS01-089" // デュアルキャノン・ベル（コスト4以上・効果なし）
const ROKU = "BS01-002" // ロクケラトプス（効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(X01).name === "滅龍帝ジエンド・ドラゴニス" && getCard(X01).effects.some((e) => e.kind === "destroyedCoresToSelf"), "ジエンドは、破壊された自分のスピリットのコアを自身に置く")
    assert(getCard(HEDGE).name === "ヘッジボルグ" && getCard(HEDGE).type === "brave" && JSON.stringify(getCard(HEDGE).effects).includes("battleLoserCoresToVoid"), "ヘッジボルグは、バトルで破壊した相手のコアをボイドに置く")
    assert(getCard(HOST).name === "デュアルキャノン・ベル" && getCard(HOST).effects.length === 0 && getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).effects.length === 0, "ベル・ロクケラトプスは効果なし")
    assert((getCard(HOST).levels[0]?.bp ?? 0) > (getCard(ROKU).levels[0]?.bp ?? 9999) && getCard(ROKU).levels[1]?.cores === 2, "ベルは、Lv1（コア1個）のロクケラトプスに BP で勝つ")
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): CardInstance {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 「このバトルの間、破壊された相手（アキラ）のスピリットのコアを to に置く」が発揮された後の状態。
// この効果（timedEffect の destroyedCoresTo）はバトル中にしか発揮しないので、発揮後の一時の効果を直接置く
function redirect(s: GameState, to: "void" | "trash"): void {
    s.timedEffects.push({ content: [{ type: "destroyedCoresTo", to }], target: { kind: "player", pid: "p1" }, until: "battle", ownerPid: "p2" } as GameState["timedEffects"][number])
}
function timedGame(seed: string): { s: GameState; x01: CardInstance; victim: CardInstance } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    return { s, x01: put(s, "p1", X01, 1), victim: put(s, "p1", ROKU, 3) }
}

for (const to of ["void", "trash"] as const) {
    console.log(`=== ジエンドがいても、後から発揮した「コアを${to === "void" ? "ボイド" : "トラッシュ"}に置く」効果へ置く（選ばせない） ===`)
    const { s, x01, victim } = timedGame("timed-" + to)
    redirect(s, to)
    const reserve = s.players.p1.reserve
    const trash = s.players.p1.trashCores
    destroySpirit(s, "p1", victim.instanceId)
    assert(s.pendingChoice === null, "行き先の選択は出ない")
    assert(!s.players.p1.field.spirits.includes(victim) && x01.cores === 1, "ジエンドにコアは置かれない")
    assert(s.players.p1.reserve === reserve && s.players.p1.trashCores === trash + (to === "trash" ? 3 : 0), to === "void" ? "コア3個はボイドへ行く（リザーブにもトラッシュにも増えない）" : "コア3個はトラッシュへ行く")
}

console.log("=== 行き先を変える効果が2つ発揮されていたら、後から発揮した方へ置く ===")
{
    const { s, x01, victim } = timedGame("two-timed")
    redirect(s, "void")
    redirect(s, "trash")
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", victim.instanceId)
    assert(s.pendingChoice === null && x01.cores === 1 && s.players.p1.reserve === reserve && s.players.p1.trashCores === 3, "後から発揮したトラッシュ行きへ置く")
}

console.log("=== 行き先を変える効果が無ければ、今までどおりジエンドに置く ===")
{
    const { s, x01, victim } = timedGame("no-timed")
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", victim.instanceId)
    assert(s.pendingChoice === null && x01.cores === 4 && s.players.p1.reserve === reserve, "コア3個はジエンドに置かれる")
}

console.log("=== ヘッジボルグがバトルで破壊：相手にジエンドがいても、コアはジエンドに置かれず直接ボイドへ行く ===")
{
    const s = createGame("hedge", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    act(s, "p1", { type: "endTurn" })
    act(s, "p2", { type: "endTurn" })
    const host = put(s, "p1", HOST, 3)
    attachBrave(s, "p1", host, createInstance(HEDGE, s.turn, 0))
    const x01 = put(s, "p2", X01, 1)
    const blocker = put(s, "p2", ROKU, 1)
    refreshLevelAsOverrides(s)
    const reserve = s.players.p2.reserve
    const trash = s.players.p2.trashCores
    act(s, "p1", { type: "nextPhase" })
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックする")
    act(s, "p2", { type: "pass" })
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ロクケラトプスでブロックする")
    for (let i = 0; i < 6 && s.battle && !s.pendingChoice; i++) act(s, s.priorityPlayer, { type: "pass" })
    assert(s.pendingChoice === null && !s.players.p2.field.spirits.includes(blocker), "選択は出ず、ブロッカーは破壊される")
    assert(x01.cores === 1, "ジエンドにコアは置かれない")
    assert(s.players.p2.reserve === reserve && s.players.p2.trashCores === trash, "ブロッカーのコア1個はボイドへ行く（リザーブにもトラッシュにも増えない）")
}

console.log("すべてのチェックに合格しました 🎉（part960）")
