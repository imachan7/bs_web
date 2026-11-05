// smoke パート774（BS11-058 神弓鳥ペリュトーン：【合体時】合体アタック時にデッキ1枚オープン→マジックならフラッシュをコスト不払いで使用／使用しない・非マジックは手札）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BRAVE = "BS11-058" // 神弓鳥ペリュトーン（黄・ブレイヴ・コスト5）
const HOST = "BS02-023" // 双蛇ヒュドラム（赤・スピリット・コスト6・バニラ：合体条件コスト5以上を満たす）
const MAGIC = "BS01-135" // パワーオーラ（マジック：フラッシュで1枚ドロー＋自分のスピリットすべてBP+1000）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BRAVE).name === "神弓鳥ペリュトーン" && getCard(BRAVE).type === "brave" && getCard(BRAVE).cost === 5, "BRAVEは神弓鳥ペリュトーン（ブレイヴ・コスト5）")
    assert(getCard(HOST).name === "双蛇ヒュドラム" && getCard(HOST).type === "spirit" && getCard(HOST).cost === 6, "HOSTは双蛇ヒュドラム（コスト6）")
    assert(getCard(MAGIC).name === "パワーオーラ" && getCard(MAGIC).type === "magic", "MAGICはパワーオーラ（マジック）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはロクケラトプス")
}

function game(topCard: string): { s: GameState; host: string } {
    const s = createGame("part774", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "yellow" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.deck = Array.from({ length: 20 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 20 }, () => VANILLA)
    s.players.p1.deck[0] = topCard
    const host = createInstance(HOST, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    const brave = createInstance(BRAVE, s.turn, 0)
    s.players.p1.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return { s, host: host.instanceId }
}

function totalCards(s: GameState): number {
    const p = s.players.p1
    return p.deck.length + p.hand.length + p.trashCards.length + p.field.spirits.length + p.field.nexuses.length + p.field.combinedBraves.length
}

function answer(s: GameState, use: "use" | "skip" | "decline"): void {
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        const res: Record<string, unknown> = { type: "resolveChoice" }
        if (i === 0 && use === "decline") {
            handleAction(s, pc.pid as PlayerId, { type: "resolveChoice" }) // 空送り＝発動しない
            return
        }
        if (pc.kind === "option") res["option"] = pc.options![0]
        else if (pc.kind === "target") res["instanceId"] = pc.candidates![0]
        else if (use === "skip") {
            handleAction(s, pc.pid as PlayerId, { type: "resolveChoice" }) // 空送り＝マジックを使用しない
            return
        }
        else res["cardIndex"] = pc.cardIndices![0]
        handleAction(s, pc.pid as PlayerId, res as never)
    }
}

console.log("=== A. デッキ上がマジック：オープンして使用するとフラッシュが解決し、そのマジックはトラッシュに行く ===")
{
    const { s, host } = game(MAGIC)
    const before = totalCards(s)
    const handBefore = s.players.p1.hand.length
    handleAction(s, "p1", { type: "attack", instanceId: host })
    answer(s, "use")
    assert(s.players.p1.trashCards.filter((c) => c === MAGIC).length === 1, "A: 使ったマジックはトラッシュに1枚ある")
    assert(!s.players.p1.hand.includes(MAGIC) && !s.players.p1.deck.includes(MAGIC), "A: マジックは手札にもデッキにも無い")
    assert(s.players.p1.hand.length === handBefore + 1, "A: フラッシュのドローで手札は+1（オープンしたマジックは手札に行かない）")
    assert(totalCards(s) === before, "A: カードの総数（デッキ＋手札＋トラッシュ＋場）は変わらない")
}

console.log("=== B. デッキ上がマジック：使用しないと手札に加わり、フラッシュは解決しない ===")
{
    const { s, host } = game(MAGIC)
    const handBefore = s.players.p1.hand.length
    handleAction(s, "p1", { type: "attack", instanceId: host })
    answer(s, "skip")
    assert(s.players.p1.hand.filter((c) => c === MAGIC).length === 1, "B: マジックは手札に1枚ある")
    assert(!s.players.p1.trashCards.includes(MAGIC), "B: マジックはトラッシュに無い")
    assert(s.players.p1.hand.length === handBefore + 1, "B: 手札は+1（ドローはしていない）")
    assert(s.players.p1.deck.length === 19, "B: デッキはオープンした1枚ぶん減る")
}

console.log("=== C. デッキ上がマジックでないカード：手札に加わる ===")
{
    const { s, host } = game(VANILLA)
    const handBefore = s.players.p1.hand.length
    handleAction(s, "p1", { type: "attack", instanceId: host })
    answer(s, "use")
    assert(s.players.p1.hand.length === handBefore + 1 && s.players.p1.hand[s.players.p1.hand.length - 1] === VANILLA, "C: オープンしたカードが手札に加わる")
    assert(s.players.p1.deck.length === 19, "C: デッキは1枚減る")
}

console.log("=== D. オープンしないを選ぶ：デッキの上はそのまま ===")
{
    const { s, host } = game(MAGIC)
    const handBefore = s.players.p1.hand.length
    handleAction(s, "p1", { type: "attack", instanceId: host })
    answer(s, "decline")
    assert(s.players.p1.deck[0] === MAGIC && s.players.p1.deck.length === 20, "D: デッキの上は変わらない")
    assert(!s.players.p1.hand.includes(MAGIC) && !s.players.p1.trashCards.includes(MAGIC), "D: マジックは手札にもトラッシュにも無い")
    assert(s.players.p1.hand.length === handBefore, "D: 手札は変わらない")
}

console.log("すべてのチェックに合格しました 🎉（part774）")
