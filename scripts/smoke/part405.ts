// smoke パート405（M2 if の器 PR 6：reveal from:"burst"。BS14-053 オリンピアの天使ハギト。IF_UNIFY.md §5）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"

const HAGITH = "BS14-053" // オリンピアの天使ハギト（召喚時：自分のバーストをオープンできる。マジックなら手札、ほかは破棄）
const MAGIC_BURST = "BS15-076" // 妖華吸血爪（マジック・バースト持ち）
const SPIRIT_BURST = "BS16-018" // 太骨望（スピリット・バースト持ち）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HAGITH).name === "オリンピアの天使ハギト", "HAGITHはハギト")
    assert(getCard(MAGIC_BURST).type === "magic" && getCard(MAGIC_BURST).effects.some((e) => e.kind === "burst"), "MAGIC_BURSTはバースト持ちのマジック")
    assert(getCard(SPIRIT_BURST).type === "spirit" && getCard(SPIRIT_BURST).effects.some((e) => e.kind === "burst"), "SPIRIT_BURSTはバースト持ちのスピリット")
}

function game(seed: string, burst: string | null): { s: GameState; run: () => void } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.burst = burst
    s.players.p1.burstSet = burst !== null
    const me = createInstance(HAGITH, s.turn, 1)
    s.players.p1.field.spirits.push(me)
    refreshLevelAsOverrides(s)
    const e = getCard(HAGITH).effects.find((x) => x.id === "BS14-053-e1")
    return { s, run: () => { if (e?.kind === "triggered") resolveAction(s, "p1", me, e.action) } }
}

console.log("=== 1. マジックなら手札に戻す ===")
{
    const { s, run } = game("magic", MAGIC_BURST)
    run()
    assert(s.players.p1.burst === null && !s.players.p1.burstSet, "バーストエリアは空になる")
    assert(s.players.p1.hand.includes(MAGIC_BURST) && !s.players.p1.trashCards.includes(MAGIC_BURST), "マジックは手札へ")
}

console.log("=== 2. ほかのカードは破棄する ===")
{
    const { s, run } = game("spirit", SPIRIT_BURST)
    run()
    assert(s.players.p1.burst === null, "バーストエリアは空になる")
    assert(s.players.p1.trashCards.includes(SPIRIT_BURST) && !s.players.p1.hand.includes(SPIRIT_BURST), "スピリットはトラッシュへ")
}

console.log("=== 3. バーストをセットしていなければ何もしない ===")
{
    const { s, run } = game("none", null)
    const hand = s.players.p1.hand.length
    const trash = s.players.p1.trashCards.length
    run()
    assert(s.players.p1.hand.length === hand && s.players.p1.trashCards.length === trash, "手札もトラッシュも変わらない")
}

console.log("すべてのチェックに合格しました 🎉（part405）")
