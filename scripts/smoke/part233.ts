// smoke パート233（「好きなだけ破壊する」をトグルで選ばせる。2026-08-24）
//
// 予算の範囲で好きなだけ破壊する2種（destroyByCostBudget / destroyByBpBudget）は、
// 「どれを何体破壊するか」がプレイヤーの選択なのに、貪欲な自動選択で固定されていた。
//
// 対話モードでは**トグル式**にする：クリックで選択、もう一度クリックで選択解除。
// 選んだ合計は prompt に出し、スキップボタン（skipLabel＝「これで破壊する」）で確定する。
// 予算に収まらない未選択のスピリットは候補から外れる。
// 非対話（テスト・自動解決）は従来どおりの貪欲選択を残す。
//
// 選択の応答は handleAction を直接呼ぶ（helpers.act は対話モードで先に消化してしまうため）
import { assert, createGame, createInstance, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const C1 = "BS01-002" // ロクケラトプス：コスト1・BP1000
const C2 = "BS01-005" // アイバーン：コスト2・BP2000
const C3 = "BS01-008" // メタルバーン：コスト3・BP3000
const C4 = "BS01-089" // デュアルキャノン・ベル：コスト4・BP3000

function putEnemy(s: GameState, cardId: string): string {
    const inst = createInstance(cardId, s.turn, 1)
    s.players.p2.field.spirits.push(inst)
    return inst.instanceId
}

function setup(name: string, interactive: boolean): GameState {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    return s
}

const alive = (s: GameState, id: string): boolean =>
    s.players.p2.field.spirits.some((sp) => sp.instanceId === id)
const candidates = (s: GameState): string[] => s.pendingChoice?.candidates ?? []

console.log("=== コスト予算：クリックで選択、もう一度クリックで解除できる ===")
{
    const s = setup("cost-budget-toggle", true)
    const c1 = putEnemy(s, C1)
    const c2 = putEnemy(s, C2)
    const c3 = putEnemy(s, C3)
    const c4 = putEnemy(s, C4)

    // 聖皇ジークフリーデン：コスト合計5まで
    resolveAction(s, "p1", null, { type: "destroyByCostBudget", budget: 5 })
    assert(!!s.pendingChoice, "選択待ちになる")
    assert(candidates(s).length === 4, `予算5に収まる4体すべてが候補（実際は${candidates(s).length}）`)
    assert((s.pendingChoice!.selectedIds ?? []).length === 0, "まだ何も選ばれていない")
    assert(s.pendingChoice!.optional === true, "スキップ（確定）できる")
    assert(s.pendingChoice!.skipLabel === "破壊しない", "1体も選んでいなければ「破壊しない」")
    assert(s.pendingChoice!.prompt.includes("0／5"), `選んだ合計が prompt に出る（実際は「${s.pendingChoice!.prompt}」）`)

    // コスト4を選ぶ → 残り予算1
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: c4 }) === null, "コスト4を選ぶ")
    assert(!!s.pendingChoice, "選択待ちが続く（勝手に確定しない）")
    assert((s.pendingChoice!.selectedIds ?? []).includes(c4), "選択済みとして返る")
    assert(s.pendingChoice!.prompt.includes("4／5"), `合計が更新される（実際は「${s.pendingChoice!.prompt}」）`)
    assert(s.pendingChoice!.skipLabel === "これで破壊する（1体）", "確定ボタンの文言が変わる")
    assert(candidates(s).includes(c4), "選択済みも候補に残る＝もう一度押すと外れる")
    assert(candidates(s).includes(c1), "残り予算1に収まるコスト1は候補")
    assert(!candidates(s).includes(c2), "残り予算を超えるコスト2は候補から外れる")
    assert(!candidates(s).includes(c3), "同上（コスト3）")
    assert(alive(s, c4), "この時点ではまだ破壊されない")

    // 同じものをもう一度クリック → 選択解除
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: c4 }) === null, "コスト4をもう一度押す")
    assert((s.pendingChoice!.selectedIds ?? []).length === 0, "選択が外れる")
    assert(candidates(s).length === 4, "予算が戻り、4体すべてが再び候補")

    // コスト1だけを選んで確定する（自動選択ならコスト4＋コスト1が破壊される場面）
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: c1 }) === null, "コスト1を選ぶ")
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "スキップ＝これで破壊する")
    assert(s.pendingChoice === null, "選択待ちが解ける")
    assert(!alive(s, c1), "選んだ1体だけが破壊される")
    assert(alive(s, c2) && alive(s, c3) && alive(s, c4), "選ばなかったものは残る")
}

console.log("=== コスト予算：1体も選ばずに確定できる（好きなだけ＝0体でよい） ===")
{
    const s = setup("cost-budget-none", true)
    const c2 = putEnemy(s, C2)
    resolveAction(s, "p1", null, { type: "destroyByCostBudget", budget: 5 })
    assert(!!s.pendingChoice, "候補1体でも選択待ちになる（やめられるようにするため）")
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "何も選ばずに確定する")
    assert(s.pendingChoice === null, "選択待ちが解ける")
    assert(alive(s, c2), "1体も破壊されない")
}

console.log("=== コスト予算：非対話では従来どおりの貪欲選択 ===")
{
    const s = setup("cost-budget-auto", false)
    const c1 = putEnemy(s, C1)
    const c2 = putEnemy(s, C2)
    const c3 = putEnemy(s, C3)
    const c4 = putEnemy(s, C4)
    resolveAction(s, "p1", null, { type: "destroyByCostBudget", budget: 5 })
    assert(s.pendingChoice === null, "選択を出さない")
    assert(!alive(s, c4), "残り予算内でコスト最大から選ぶ（コスト4）")
    assert(!alive(s, c1), "続けてコスト1（合計5）")
    assert(alive(s, c2) && alive(s, c3), "予算を超えるものは残る")
}

console.log("=== BP予算：同じトグルで選べる ===")
{
    const s = setup("bp-budget-toggle", true)
    const c1 = putEnemy(s, C1) // BP1000
    const c2 = putEnemy(s, C2) // BP2000
    const c3 = putEnemy(s, C3) // BP3000

    // 剣龍皇エクス・キャリバス：BP合計6000まで
    resolveAction(s, "p1", null, { type: "destroyByBpBudget", budget: 6000 })
    assert(!!s.pendingChoice, "選択待ちになる")
    assert(s.pendingChoice!.prompt.includes("BP合計 0／6000"), `BPで数える（実際は「${s.pendingChoice!.prompt}」）`)

    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: c3 }) === null, "BP3000を選ぶ")
    assert(s.pendingChoice!.prompt.includes("3000／6000"), "合計が更新される")
    assert(candidates(s).includes(c2), "残り3000に収まるBP2000はまだ候補")

    // 貪欲な自動選択なら3体すべてが破壊される（1000+2000+3000＝6000）。あえて2体だけ選ぶ
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: c1 }) === null, "BP1000も選ぶ（合計4000）")
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "これで破壊する")
    assert(!alive(s, c1) && !alive(s, c3), "選んだ2体が破壊される")
    assert(alive(s, c2), "予算は残っていても、選ばなかったものは破壊されない")
}

console.log("=== BP予算：非対話では従来どおりの貪欲選択 ===")
{
    const s = setup("bp-budget-auto", false)
    const c1 = putEnemy(s, C1)
    const c2 = putEnemy(s, C2)
    const c3 = putEnemy(s, C3)
    resolveAction(s, "p1", null, { type: "destroyByBpBudget", budget: 6000 })
    assert(s.pendingChoice === null, "選択を出さない")
    assert(!alive(s, c3) && !alive(s, c2) && !alive(s, c1), "BP最大から貪欲に3体（合計6000）")
}
