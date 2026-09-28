// smoke パート436（BS16バッチ3・組A：draw.countMax／reveal.pickCountの数値／TargetFilter.familyExclude）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const FAM1 = "BS02-056" // アルカナビースト・ケン（四道・赤・コスト2）
const FAM2 = "BS03-054" // アルカナドール・トリア（四道・青？・コスト3）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ・系統は地竜＝四道を持たない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(FAM1).name === "アルカナビースト・ケン" && getCard(FAM1).family.includes("四道"), "FAM1は系統「四道」")
    assert(getCard(FAM2).name === "アルカナドール・トリア" && getCard(FAM2).family.includes("四道"), "FAM2は系統「四道」")
    assert(getCard(VANILLA).name === "ロクケラトプス" && !getCard(VANILLA).family.includes("四道"), "VANILLAは系統「四道」を持たない")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. draw.countMax：カウントが上限を超えたら上限枚数だけ引く ===")
{
    const s = game("case1")
    put(s, "p1", FAM1, 1)
    put(s, "p1", FAM1, 1)
    put(s, "p1", FAM1, 1) // 系統「四道」3体（countCounterのownFamilyが3を返す）
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "draw", count: 1, countCounter: { ownFamily: "四道" }, countMax: 2 })
    assert(s.players.p1.hand.length === before + 2, "countMax:2で3を数えても2枚しか引かない")
}

console.log("=== 2. draw.countMax：カウントが上限未満なら上限は効かない ===")
{
    const s = game("case2")
    put(s, "p1", FAM1, 1) // 系統「四道」1体
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "draw", count: 1, countCounter: { ownFamily: "四道" }, countMax: 2 })
    assert(s.players.p1.hand.length === before + 1, "countMax未満のカウントはそのまま（1枚）")
}

console.log("=== 3. reveal.pickCount（数値・非対話）：条件に合うものを前から最大N枚、自動で選ぶ ===")
{
    const s = game("case3", false)
    s.players.p1.deck = [FAM1, FAM2, VANILLA, VANILLA, ...s.players.p1.deck.slice(4)]
    const beforeHand = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "reveal", from: "ownDeck", count: 4, pick: { family: "四道" }, pickCount: 2 })
    assert(s.players.p1.hand.length === beforeHand + 2, "非対話：四道2枚とも手札に加わる")
    assert(s.players.p1.hand.includes(FAM1) && s.players.p1.hand.includes(FAM2), "手札に加わったのはFAM1とFAM2")
    // 残り2枚（VANILLA×2）はrest省略時のdeckBottomへ
    assert(s.players.p1.deck.slice(-2).every((id) => id === VANILLA), "選ばれなかった2枚はデッキの下へ戻る")
}

console.log("=== 4. reveal.pickCount（数値・対話）：1枚選んでから、途中でやめられる ===")
{
    const s = game("case4", true)
    s.players.p1.deck = [FAM1, FAM2, VANILLA, VANILLA, ...s.players.p1.deck.slice(4)]
    const beforeHand = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "reveal", from: "ownDeck", count: 4, pick: { family: "四道" }, pickCount: 2 })
    assert(s.pendingChoice !== null && s.pendingChoice?.kind === "card", "1回目：カード選択待ちが立つ")
    assert((s.pendingChoice as { cardIndices?: number[] })?.cardIndices?.length === 2, "候補は四道2枚（FAM1・FAM2）")
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.players.p1.hand.length === beforeHand + 1 && s.players.p1.hand.includes(FAM1), "1枚目（FAM1）を選んで手札へ")
    assert(s.pendingChoice !== null && s.pendingChoice?.kind === "card", "2回目：まだ1枚まで選べるので選択待ちが立つ")
    handleAction(s, "p1", { type: "resolveChoice" }) // 選ばずに終える
    assert(s.players.p1.hand.length === beforeHand + 1, "2枚目は選ばなかったので手札は1枚のまま")
    // 「選ばず終える」の直後は、残り3枚をデッキの下に戻す順番の選択待ちが立つ（rest省略時のdeckBottom。
    // 戻す順は本題ではないので先頭から機械的に答えて畳む）
    while (s.pendingChoice !== null) handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.players.p1.deck.slice(-3).sort().join(",") === [FAM2, VANILLA, VANILLA].sort().join(","), "選ばなかった残り3枚はデッキの下へ戻る")
}

console.log("=== 5. TargetFilter.familyExclude：系統を持たないものだけ当たる ===")
{
    const s = game("case5")
    const holder = put(s, "p2", FAM1, 1) // 系統「四道」を持つ＝除外される
    const nonHolder = put(s, "p2", VANILLA, 1) // 系統「四道」を持たない＝対象になる
    resolveAction(s, "p1", null, { type: "destroy", filter: { familyExclude: "四道" }, count: 1, all: true })
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === holder.instanceId),
        "系統「四道」を持つ方は破壊されずに残る",
    )
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === nonHolder.instanceId),
        "系統「四道」を持たない方は破壊される",
    )
}

console.log("すべてのチェックに合格しました 🎉（part436）")
