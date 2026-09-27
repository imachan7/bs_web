// smoke パート402（M2 if の器 PR 3：discardSelfChoose count:"any"＝手札を好きなだけ破棄 → 1枚につき。IF_UNIFY.md §5）
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const MIKAFAEL = "BS08-X33" // 堕天使ミカファール（召喚時：手札を好きなだけ破棄し、1枚につき1枚ドロー）
const REGISTER = "BS03-146" // ネクサスレジスター（手札のネクサスを好きなだけ破棄し、1枚につき1枚ドロー）
const MACABRE = "BS04-094" // ダンスマカブル（手札を好きなだけ破棄し、1枚につき相手のスピリット1体のコア1個をトラッシュへ）
const VANILLA = "BS01-002" // ロクケラトプス（スピリット）
const NEXUS = "BS01-098" // ネクサス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MIKAFAEL).name === "堕天使ミカファール", "MIKAFAELは堕天使ミカファール")
    assert(getCard(REGISTER).name === "ネクサスレジスター", "REGISTERはネクサスレジスター")
    assert(getCard(MACABRE).name === "ダンスマカブル", "MACABREはダンスマカブル")
    assert(getCard(VANILLA).type === "spirit" && getCard(NEXUS).type === "nexus", "VANILLAはスピリット、NEXUSはネクサス")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.phase = "attack" // 満天の牧草地（メインステップに手札を破棄できない）に掛からないステップ
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
function actionOf(cardId: string, effectId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => x.id === effectId)
    if (!e || !("action" in e) || e.action === undefined) throw new Error(`${effectId} に action が無い`)
    return e.action
}

console.log("=== 1. 対話：1枚ずつ選び、スキップで終えると、破棄した枚数ぶんドロー ===")
{
    const s = game("interactive", true)
    s.players.p1.hand = [VANILLA, VANILLA, VANILLA]
    resolveAction(s, "p1", null, actionOf(MIKAFAEL, "BS08-X33-e1"))
    assert(s.pendingChoice?.optional === true, "破棄する手札の選択が出る（選ばなくてもよい）")
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.pendingChoice?.optional === true && s.players.p1.hand.length === 2, "1枚破棄して、もう一度聞かれる")
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    act(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null, "スキップで終わる")
    assert(s.players.p1.hand.length === 1 + 2, "残り1枚＋破棄した2枚ぶんドロー")
}
{
    const s = game("interactive-zero", true)
    s.players.p1.hand = [VANILLA, VANILLA]
    resolveAction(s, "p1", null, actionOf(MIKAFAEL, "BS08-X33-e1"))
    act(s, "p1", { type: "resolveChoice" })
    assert(s.players.p1.hand.length === 2, "1枚も破棄しなければ引かない")
}

console.log("=== 2. 非対話：条件に合う手札をすべて破棄（ネクサスレジスターはネクサスだけ） ===")
{
    const s = game("register", false)
    s.players.p1.hand = [NEXUS, VANILLA, NEXUS]
    resolveAction(s, "p1", null, actionOf(REGISTER, "BS03-146-e1"))
    assert(s.players.p1.trashCards.filter((id) => id === NEXUS).length === 2, "ネクサス2枚を破棄")
    assert(s.players.p1.hand.length === 1 + 2 && s.players.p1.hand.includes(VANILLA), "スピリットは残り、2枚ドロー")
}

console.log("=== 3. ダンスマカブル：1枚につき相手のスピリット1体のコア1個（同じスピリットを重ねて選べる＝Q2） ===")
{
    const s = game("macabre", false)
    s.players.p1.hand = [VANILLA, VANILLA]
    const foe = createInstance(VANILLA, s.turn, 3)
    s.players.p2.field.spirits.push(foe)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, actionOf(MACABRE, "BS04-094-e1"))
    assert(foe.cores === 1, "相手が1体だけでも、破棄した2枚ぶん同じスピリットからコア2個を取る")
}

console.log("すべてのチェックに合格しました 🎉（part402）")
