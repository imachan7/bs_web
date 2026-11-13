// smoke パート928（BS08 帝竜騎：召喚できる【転召】スピリットが手札に無ければ、押すと不発で権利は戻る。CPU はその起動を選ばない。#497）
import { assert, createGame, createInstance, getCard, handleAction, hasKeyword, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { activatableAbility } from "../../shared/rules"
import { decideAiAction } from "../../server/src/ai"
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import type { GameState } from "./helpers"

const RAIBLITZ = "BS08-006" // 雷帝竜騎レイブリッツ
const TENSHO = "BS07-009" // 剣龍皇エクス・キャリバス（【転召】）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RAIBLITZ).name === "雷帝竜騎レイブリッツ", "RAIBLITZはレイブリッツ")
    assert(getCard(TENSHO).name === "剣龍皇エクス・キャリバス" && hasKeyword(TENSHO, "tensho"), "TENSHOは【転召】持ち")
}

function game(hand: string[], reserve: number): { s: GameState; id: string } {
    const s = createGame("teiryuki", { p1: "CPU", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = true // 実サーバーと同じ。対話時だけ不発で「ターンに1回」が戻る
    runTurnStart(s)
    s.turn = 3
    s.phase = "main"
    s.turnPlayer = "p1"
    s.players.p1.hand = hand
    s.players.p1.reserve = reserve
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    const inst = createInstance(RAIBLITZ, s.turn, 1)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return { s, id: inst.instanceId }
}

console.log("=== 1. 手札に【転召】スピリットが無い：押せるが不発で、ターンに1回は消費しない ===")
{
    const { s, id } = game([], 10)
    const inst = s.players.p1.field.spirits.find((x) => x.instanceId === id)!
    assert(activatableAbility(s, "p1", inst) !== null, "起動ボタンは出る")
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: id, effectId: "BS08-006-e1" }) === null, "サーバーも受理する")
    assert(s.pendingChoice === null && s.log.some((l) => l.includes("発動しなかった")), "不発になる")
    assert(inst.activatedUsedTurn?.["BS08-006-e1"] === undefined, "ターンに1回は消費しない")
}

console.log("=== 1b. 同じ場面で CPU が起動を繰り返さない ===")
{
    const { s } = game([], 10)
    for (let i = 0; i < 5; i++) {
        const move = decideAiAction(s, "p1")
        assert(move?.action.type !== "activateAbility", `CPU が起動を選ばない（${i + 1}手目）`)
        if (!move || move.action.type === "endTurn") break
        handleAction(s, "p1", move.action)
    }
}

console.log("=== 2. 【転召】スピリットはあるがコストを払えない：CPU は起動を選ばない ===")
{
    const { s } = game([TENSHO], 0)
    assert(decideAiAction(s, "p1")?.action.type !== "activateAbility", "CPU が起動を選ばない")
}

console.log("=== 3. 払える【転召】スピリットがある：CPU も起動を候補にする ===")
{
    const { s } = game([TENSHO], 20)
    assert(enumerateLegalMoves(s, "p1").some((m) => m.action.type === "activateAbility"), "起動が合法手に入る")
}

console.log("すべてのチェックに合格しました 🎉（part928）")
