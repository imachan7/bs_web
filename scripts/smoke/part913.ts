// smoke パート913（召喚時効果の中で別のスピリットを召喚し、内側が選択待ちで止まっても、外側の召喚時効果の終わりを落とさない。#437 F4）
import { act, assert, createGame, createInstance, fireSummonTrigger, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const SOL = "X002" // 極龍帝ジーク・ソル・フリード（召喚時：手札の「ジーク」を召喚できる）
const APOLLO = "X005R" // 北斗七星龍ジーク・アポロドラゴン（召喚時：手札のブレイヴを召喚できる）
const BRAVE = "BS17-055" // ヤサカニ・ウィング

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(APOLLO).name.includes("ジーク") && getCard(BRAVE).type === "brave", "アポロドラゴンは「ジーク」、ヤサカニ・ウィングはブレイヴ")
}

function run(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.hand = [APOLLO, BRAVE]
    const sol = createInstance(SOL, s.turn, 1)
    s.players.p1.field.spirits.push(sol)
    refreshLevelAsOverrides(s)
    fireSummonTrigger(s, "p1", sol)
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.kind === "option") act(s, pc.pid, { type: "resolveChoice", option: pc.options![0]! })
        else if (pc.kind === "card") act(s, pc.pid, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
        else act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0]! })
    }
    return s
}

console.log("=== 入れ子の召喚時効果を全部解決したあと、最後に閉じるのは外側（ソル・フリード）。対話でも非対話と同じ ===")
{
    const auto = run("p913-auto", false)
    const inter = run("p913-inter", true)
    assert(auto.players.p1.field.spirits.some((sp) => sp.cardId === APOLLO), "前提：アポロドラゴンが召喚された（非対話）")
    assert(inter.players.p1.field.spirits.some((sp) => sp.cardId === APOLLO) && inter.pendingChoice === null, "前提：アポロドラゴンが召喚され、選択は残っていない（対話）")
    assert(auto.lastOpponentSummonEffect?.cardId === SOL, `非対話：最後に記録されるのはソル・フリード（${String(auto.lastOpponentSummonEffect?.cardId)}）`)
    assert(inter.lastOpponentSummonEffect?.cardId === SOL, `対話：最後に記録されるのはソル・フリード（${String(inter.lastOpponentSummonEffect?.cardId)}）`)
    assert((inter.summonEffectSources ?? []).length === 0, "召喚時効果の記録は全部閉じた")
}

console.log("すべてのチェックに合格しました 🎉（part913）")
