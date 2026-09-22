// smoke パート351（BS16-X03 烈の覇王セイリュービ：【烈神速】。トラッシュのコア5個以上を
// 自分のフィールド/リザーブに好きに置くことで、コストを支払わず手札から召喚する。docs/design/INTERRUPTION_POINTS.md パターンA）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const TARGET = "BS16-X03"
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TARGET).name === "烈の覇王セイリュービ" && getCard(TARGET).type === "spirit", "TARGETは烈の覇王セイリュービ")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 0
    s.players.p2.reserve = 0
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 回答: pending.options から部分一致で選び、resolveChoice を送る
function answer(s: GameState, pid: PlayerId, includes: string): string | null {
    const pending = s.pendingChoice
    if (!pending) return "選択待ちがありません"
    const option = (pending.options ?? []).find((o) => o.includes(includes))
    if (option === undefined) return `候補が見つかりません（${includes}）`
    return handleAction(s, pid, { type: "resolveChoice", option })
}

console.log("=== 1. 成立する場面：コア5個、置き先を分けて召喚（弱制フェイズも1回踏む） ===")
{
    const s = game("case1", true)
    s.players.p1.hand[0] = TARGET
    s.players.p1.trashCores = 5
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const other = put(s, "p1", VANILLA, 1)
    const beforeCount = s.players.p1.field.spirits.length

    const err = handleAction(s, "p1", { type: "resshinsokuSummon", handIndex: 0 })
    assert(err === null, `resshinsokuSummon が通る（実際: ${String(err)}）`)
    assert(s.pendingChoice !== null && s.pendingChoice.distributeCores !== undefined, "コアの置き先の選択待ちが立つ")
    assert(
        (s.pendingChoice!.options ?? []).length === 5,
        `残り5個・候補2体+一括2つで選択肢5つ（実際: ${String((s.pendingChoice!.options ?? []).length)}）`,
    )

    assert(answer(s, "p1", "リザーブに置く") === null, "1個目：リザーブへ")
    assert(answer(s, "p1", other.cardId === VANILLA ? "ロクケラトプス" : "") === null, "2個目：既存スピリットへ")
    assert(answer(s, "p1", "リザーブに置く") === null, "3個目：リザーブへ")
    assert(answer(s, "p1", "ロクケラトプス") === null, "4個目：既存スピリットへ")
    // 残り1個・自分にまだ0個なのでLv1維持コアのため「このスピリット」だけに絞られる
    assert(
        (s.pendingChoice!.options ?? []).length === 1 && (s.pendingChoice!.options ?? [])[0]!.includes("このスピリット"),
        "最後の1個は維持コアのため『このスピリット』に強制される",
    )
    assert(answer(s, "p1", "このスピリット") === null, "5個目：このスピリットへ（強制）")

    assert(s.pendingChoice === null, "選択がすべて解消した")
    assert(s.players.p1.field.spirits.length === beforeCount + 1, "セイリュービが場に出た")
    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === TARGET)
    assert(summoned !== undefined && summoned.cores === 1, `召喚されたセイリュービのコアは1個（実際: ${String(summoned?.cores)}）`)
    assert(s.players.p1.reserve === 2, `リザーブに2個置かれた（実際: ${String(s.players.p1.reserve)}）`)
    assert(other.cores === 3, `既存スピリットに2個乗って計3個（実際: ${String(other.cores)}）`)
    assert(s.players.p1.trashCores === 0, "トラッシュのコアは使い切った")
    assert(!s.players.p1.hand.includes(TARGET), "手札からセイリュービが無くなった")
}

console.log("=== 2. トラッシュのコアが4個では使えない ===")
{
    const s = game("case2", false)
    s.players.p1.hand[0] = TARGET
    s.players.p1.trashCores = 4
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const err = handleAction(s, "p1", { type: "resshinsokuSummon", handIndex: 0 })
    assert(err !== null, "コア4個では【烈神速】を使えない")
}

console.log("=== 3. アタックステップのフラッシュタイミング外では使えない ===")
{
    const s = game("case3", false)
    s.players.p1.hand[0] = TARGET
    s.players.p1.trashCores = 5
    s.phase = "main"
    s.isFlashTiming = false
    const err = handleAction(s, "p1", { type: "resshinsokuSummon", handIndex: 0 })
    assert(err !== null, "メインステップでは【烈神速】を使えない")
}

console.log("=== 4. 【神速】参照の効果には反応しない（keywordの別枠確認） ===")
{
    assert(!getCard(TARGET).effects.some((e) => e.kind === "keyword" && e.keyword === "soku"), "セイリュービは【神速】を持たない")
    assert(getCard(TARGET).effects.some((e) => e.kind === "keyword" && e.keyword === "resshinsoku"), "セイリュービは【烈神速】を持つ")
}

console.log("=== 5. 非対話（AI・自動応答）は全部このスピリットに置く ===")
{
    const s = game("case5", false)
    s.players.p1.hand[0] = TARGET
    s.players.p1.trashCores = 5
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const err = handleAction(s, "p1", { type: "resshinsokuSummon", handIndex: 0 })
    assert(err === null, `非対話でも resshinsokuSummon が通る（実際: ${String(err)}）`)
    assert(s.pendingChoice === null, "非対話では選択待ちを立てない")
    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === TARGET)
    assert(summoned !== undefined && summoned.cores === 5, `全部このスピリットに乗る（実際: ${String(summoned?.cores)}）`)
    assert(s.players.p1.reserve === 0, "リザーブには置かれない")
    assert(s.players.p1.trashCores === 0, "トラッシュのコアは使い切った")
}

console.log("すべてのチェックに合格しました 🎉（part351）")
