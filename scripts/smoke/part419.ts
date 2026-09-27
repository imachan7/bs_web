// smoke パート419（mill の until と takeLast：「〜が出るまで破棄し、そのカードを〜」。デッキ破棄の共通処理を通る）
import { assert, createGame, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const AMAIMON = "BS08-014" // 冥将アマイモン
const FILLER = "BS01-002" // ロクケラトプス
const KYOSHIN = "BS06-X21" // 激神皇カタストロフドラゴン（虚神）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(AMAIMON).name === "冥将アマイモン", "AMAIMON")
    assert(getCard(KYOSHIN).type === "spirit" && getCard(KYOSHIN).family.includes("虚神"), "KYOSHIN は虚神のスピリット")
    assert(!getCard(FILLER).family.includes("虚神"), "FILLER は虚神でない")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.players.p1.deck = [FILLER, FILLER, KYOSHIN, ...s.players.p1.deck]
    s.players.p1.trashCards = []
    return s
}
const effect = (getCard(AMAIMON).effects.find((e) => e.id === "BS08-014-e1") as { action: EffectAction }).action

console.log("=== 1. 虚神が出たところで止め、トラッシュにあるそのカードを手札に戻す ===")
{
    const s = game("found")
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, effect)
    assert(s.players.p1.trashCards.join() === [FILLER, FILLER].join(), "虚神までの2枚はトラッシュに残る")
    assert(s.players.p1.hand.length === hand + 1 && s.players.p1.hand.includes(KYOSHIN), "出た虚神を手札に戻す")
}

console.log("=== 2. デッキ破棄の共通処理を通る：「このターンの間、自分のデッキは破棄されない」なら何も起きない ===")
{
    const s = game("blocked")
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "noDeckMillForPid" } }], duration: "turn", side: "own" })
    const hand = s.players.p1.hand.length
    const deck = s.players.p1.deck.length
    resolveAction(s, "p1", null, effect)
    assert(s.players.p1.deck.length === deck && s.players.p1.hand.length === hand, "破棄されず、手札にも戻らない")
}

console.log("すべてのチェックに合格しました 🎉（part419）")
