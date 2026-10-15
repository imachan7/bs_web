// smoke パート560
//   - moveCards 手札→トラッシュ（旧 discardSelfChoose）：2枚目以降の選択でも絞り込み（系統）が残る
//     （旧実装は2枚目以降に cardType／keyword しか引き継がず、系統・色・カード名が落ちていた）
import { assert, createGame, handleAction, resolveAction } from "./helpers"
import { getCard } from "../../server/src/logic/GameState"

const FAM = "BS02-056" // 系統「四道」
const OTHER = "BS01-002" // 系統「地竜」
assert(getCard(FAM).family.includes("四道") && !getCard(OTHER).family.includes("四道"), "前提：系統")

console.log("=== 1. 系統「四道」2枚を1枚ずつ選んで破棄する ===")
{
    const s = createGame("560a", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.players.p1.hand = [FAM, OTHER, FAM, OTHER, FAM]
    resolveAction(s, "p1", null, { type: "moveCards", from: "hand", dest: "trash", count: 2, pick: { family: "四道" } })
    assert(s.pendingChoice?.cardIndices?.length === 3, "1枚目の候補は四道の3枚")
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.players.p1.hand.length === 4 && s.players.p1.trashCards.includes(FAM), "1枚目はその場で破棄")
    const second = s.pendingChoice?.cardIndices ?? []
    assert(second.length === 2 && second.every((i) => s.players.p1.hand[i] === FAM), "2枚目の候補も四道だけ")
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: second[0]! })
    assert(s.players.p1.hand.filter((id) => id === FAM).length === 1 && s.players.p1.hand.filter((id) => id === OTHER).length === 2, "四道を2枚破棄し、ほかは残る")
}
