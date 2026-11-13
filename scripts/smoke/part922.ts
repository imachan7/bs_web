// smoke パート922（同時発揮の列で後回しにした誘発は、解決する時点の Lv で見直す。公式Q2717。2026-11-13 ユーザー決定）
import { act, assert, createGame, createInstance, currentLevel, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const LUTE = "BS09-045" // 光輝の勇者皇リュート（自分のスピリットをブロックした相手を Lv1 として扱う）
const ATTACKER = "BS01-002" // ロクケラトプス
const SPHERE = "BS02-037" // スフィアロイド（Lv2『このスピリットのブロック時』BP+2000。Lv1 1000／Lv2 2000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LUTE).name === "光輝の勇者皇リュート", "LUTEは光輝の勇者皇リュート")
    assert(getCard(ATTACKER).name === "ロクケラトプス", "ATTACKERはロクケラトプス")
    const sphere = getCard(SPHERE)
    assert(sphere.name === "スフィアロイド" && sphere.effects.some((e) => e.kind === "triggered" && e.trigger === "onBlock" && JSON.stringify(e.levels) === "[2]"), "SPHEREはLv2だけのブロック時効果を持つ")
}

function blockScene(interactive: boolean): { s: GameState; sphere: ReturnType<typeof createInstance> } {
    const s = createGame("q2717", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "white" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits.push(createInstance(LUTE, s.turn, 1))
    const atk = createInstance(ATTACKER, s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    const sphere = createInstance(SPHERE, s.turn, 2)
    s.players.p2.field.spirits.push(sphere)
    refreshLevelAsOverrides(s)
    assert(currentLevel(sphere).level === 2, "ブロック前のスフィアロイドは Lv2")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p2", sphere.instanceId) === null, "ブロックできる")
    return { s, sphere }
}

console.log("=== 1. リュートを先に解決すると、スフィアロイドの Lv2 ブロック時効果は発揮しない（Q2717） ===")
{
    const { s, sphere } = blockScene(true)
    const options = s.pendingChoice?.options ?? []
    assert(s.pendingChoice?.pid === "p1" && options.length === 2, "ターンプレイヤーに解決順を聞く")
    const lute = options.find((o) => o.includes("光輝の勇者皇リュート"))
    assert(lute !== undefined && act(s, "p1", { type: "resolveChoice", option: lute }) === null, "リュートを先に選ぶ")
    assert(currentLevel(sphere).level === 1, "スフィアロイドは Lv1 として扱う")
    assert(effectiveBp(s, "p2", sphere) === 1000, "Lv2 の BP+2000 は発揮しない（Lv1 の BP1000 のまま）")
    assert(s.log.some((l) => l.includes("スフィアロイドはLv1になっていたため")), "発揮しなかった理由をログに残す")
}

console.log("=== 2. スフィアロイドを先に解決すれば、Lv2 のうちに発揮する（対照） ===")
{
    const { s, sphere } = blockScene(true)
    const own = (s.pendingChoice?.options ?? []).find((o) => o.includes("スフィアロイド"))
    assert(own !== undefined && act(s, "p1", { type: "resolveChoice", option: own }) === null, "スフィアロイドを先に選ぶ")
    assert(currentLevel(sphere).level === 1, "そのあとリュートで Lv1 として扱う")
    assert(effectiveBp(s, "p2", sphere) === 3000, "BP+2000 は発揮済み（Lv1 の 1000＋2000）")
}

console.log("すべてのチェックに合格しました 🎉（part922）")
