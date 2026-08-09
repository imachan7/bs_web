// smoke パート151（「破壊される代わりに復活**できる**」の保留確認）
//
// reviveOnDestroy.optional：効果文が「〜できる」の復活は、これまで常に自動で発動していた。
// 破壊処理の途中では中断できない（destroySpirit の呼び出しはループの中にあり、pendingChoice の
// queue は EffectAction の列しか運べない）ため、**いったん破壊を見送って場に残し**、
// アクションを解決しきった安全な地点（GameEngine.handleAction の末尾）で持ち主に確認する。
//   GameState.pendingReviveConfirms → PendingChoice.reviveConfirm →
//   applyReviveConfirm（コストを払って確定）／declineReviveConfirm（ここで破壊）
//
// 非対話（interactiveTargets=false）は従来どおり即時に自動で復活するため、既存テストは影響を受けない。
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function entryOf(c: CardRow, pred: (e: Record<string, unknown>) => boolean): Record<string, unknown> {
    const found = (c.effects ?? []).find(pred)
    if (!found) throw new Error(`${c.name} に該当エントリがありません`)
    return found
}

// p2 のターンのアタックステップでフラッシュを開き、p2 が全体破壊マジックを使う盤面を作る。
// チャガマルの復活は『相手のアタックステップ』条件なので、持ち主 p1 は非ターンプレイヤーである必要がある
function setupOpponentAttackStep(seed: string, interactive: boolean) {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "main"
    s.interactiveTargets = interactive
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const ALIVE = (s: GameState, pid: PlayerId, id: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === id)

// チャガマル：scope:"self"・コスト「コア1個だけ残して残りをトラッシュ」・『相手のアタックステップ』
const CHAGA = findByEffect(
    (e) =>
        e["kind"] === "reviveOnDestroy" &&
        e["optional"] === true &&
        e["scope"] === "self" &&
        (e["cost"] as Record<string, unknown> | undefined)?.["keepOneCoreRestToTrash"] === true,
)
const CHAGA_LEVEL = (entryOf(CHAGA, (e) => e["kind"] === "reviveOnDestroy")["levels"] as number[])[0]!
const CHAGA_CORES = CHAGA.levels?.[CHAGA_LEVEL - 1]?.cores ?? 3
// 全体破壊マジック（BP上限つき）。チャガマルがその上限以下で立てられることを確かめて使う
const WIPE = findByEffect(
    (e, c) =>
        c.type === "magic" &&
        (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroyAll" &&
        ((e["action"] as Record<string, unknown>)["filter"] as Record<string, unknown> | undefined)?.["maxBp"] !==
            undefined &&
        (e["action"] as Record<string, unknown>)["anySide"] === true,
)
const WIPE_MAXBP = Number(
    ((entryOf(WIPE, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroyAll")[
        "action"
    ] as Record<string, unknown>)["filter"] as Record<string, unknown>)["maxBp"],
)
const ATTACKER = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!

// p2 がアタック宣言 → p1 がパス → p2 が全体破壊マジックを使う、までを進める
function wipeDuringOpponentAttack(s: GameState): void {
    const attacker = put(s, "p2", ATTACKER.cardId, ATTACKER.levels?.[0]?.cores ?? 1)
    s.players.p2.hand.push(WIPE.cardId)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: s.players.p2.hand.length - 1 }) === null,
        `${WIPE.name}を使用`,
    )
}

console.log("=== 実対戦：破壊はいったん見送られ、アクション解決後に確認が立つ ===")
{
    const s = setupOpponentAttackStep("revive-confirm-prompt", true)
    const chaga = put(s, "p1", CHAGA.cardId, CHAGA_CORES)
    assert(
        (CHAGA.levels?.[CHAGA_LEVEL - 1]?.bp ?? 0) <= WIPE_MAXBP,
        `${CHAGA.name} Lv${CHAGA_LEVEL} は ${WIPE.name} の対象BPに入る`,
    )
    wipeDuringOpponentAttack(s)

    assert(s.pendingChoice !== null, "復活するかの確認が立つ")
    assert(s.pendingChoice?.pid === "p1", "選択するのは破壊される側の持ち主")
    assert(ALIVE(s, "p1", chaga.instanceId), "確認中は場に残っている（破壊は見送られている）")
    assert(chaga.cores === CHAGA_CORES, "コストもまだ払っていない")
}

console.log("--- 「復活させる」を選ぶとコストを払って確定する ---")
{
    const s = setupOpponentAttackStep("revive-confirm-accept", true)
    const chaga = put(s, "p1", CHAGA.cardId, CHAGA_CORES)
    const trashBefore = s.players.p1.trashCores
    wipeDuringOpponentAttack(s)
    assert(s.pendingChoice !== null, "確認が立つ")

    assert(act(s, "p1", { type: "resolveChoice", option: "復活させる" }) === null, "「復活させる」を選ぶ")
    assert(s.pendingChoice === null, "選択待ちが解消される")
    assert(ALIVE(s, "p1", chaga.instanceId), "場に残る")
    assert(chaga.cores === 1, `コア1個だけ残る（実際: ${String(chaga.cores)}個）`)
    assert(
        s.players.p1.trashCores === trashBefore + (CHAGA_CORES - 1),
        "残りのコアはトラッシュへ置かれる（コストの支払い）",
    )
}

console.log("--- スキップすると、見送っていた破壊がその場で行われる ---")
{
    const s = setupOpponentAttackStep("revive-confirm-decline", true)
    const chaga = put(s, "p1", CHAGA.cardId, CHAGA_CORES)
    const trashBefore = s.players.p1.trashCores
    const reserveBefore = s.players.p1.reserve
    wipeDuringOpponentAttack(s)
    assert(s.pendingChoice !== null, "確認が立つ")

    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ（復活させない）")
    assert(s.pendingChoice === null, "選択待ちが解消される")
    assert(!ALIVE(s, "p1", chaga.instanceId), "見送っていた破壊がここで行われる")
    assert(s.players.p1.trashCores === trashBefore, "断ったのでコストは払っていない")
    assert(s.players.p1.reserve === reserveBefore + CHAGA_CORES, "破壊されたコアは通常どおりリザーブへ戻る")
}

console.log("=== 複数体が候補になったときは1体ずつ確認する（紫水晶の森：scope ownAll） ===")
{
    const forest = findByEffect(
        (e) => e["kind"] === "reviveOnDestroy" && e["optional"] === true && e["scope"] === "ownAll",
    )
    const entry = entryOf(forest, (e) => e["kind"] === "reviveOnDestroy")
    const phaseTurn = entry["phaseTurn"] as Record<string, string> | undefined
    // このカードは『自分のアタックステップ』条件なので、持ち主 p1 がターンプレイヤーの側で組む
    const s: GameState = createGame("revive-confirm-multi", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    assert(phaseTurn?.["turn"] === "own", "『自分のアタックステップ』条件のカードで検証する")

    const forestLevel = (entry["levels"] as number[])[0]!
    const fInst = createInstance(forest.cardId, s.turn, forest.levels?.[forestLevel - 1]?.cores ?? 0)
    s.players.p1.field.nexuses.push(fInst)
    const weak = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.bp ?? 99999) <= WIPE_MAXBP,
    )!
    const a = put(s, "p1", weak.cardId, 2)
    const b = put(s, "p1", weak.cardId, 2)
    // アタッカーは ownAll の復活対象に入らないよう、全体破壊のBP上限を超える個体を選ぶ
    // （入れてしまうと確認が3体ぶん出る）
    const toughAttacker = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.bp ?? 0) > WIPE_MAXBP,
    )!
    const attacker = put(s, "p1", toughAttacker.cardId, toughAttacker.levels?.[0]?.cores ?? 1)
    refreshLevelAsOverrides(s)

    // p1のアタックステップで、防御側 p2 がフラッシュで全体破壊を使う
    s.players.p2.hand.push(WIPE.cardId)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック宣言")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: s.players.p2.hand.length - 1 }) === null,
        `防御側が${WIPE.name}を使用`,
    )

    assert(s.pendingChoice !== null, "1体目の確認が立つ")
    assert(ALIVE(s, "p1", a.instanceId) && ALIVE(s, "p1", b.instanceId), "2体とも場に残ったまま")
    assert(act(s, "p1", { type: "resolveChoice", option: "復活させる" }) === null, "1体目は復活させる")
    assert(s.pendingChoice !== null, "続けて2体目の確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "2体目はスキップ")
    assert(s.pendingChoice === null, "すべて解決すると選択待ちが無くなる")

    const survivors = [a, b].filter((x) => ALIVE(s, "p1", x.instanceId)).length
    assert(survivors === 1, `復活させた1体だけが残る（実際: ${String(survivors)}体）`)
}

console.log("=== 非対話（テスト・自動解決）では従来どおり即時に復活する ===")
{
    const s = setupOpponentAttackStep("revive-auto", false)
    const chaga = put(s, "p1", CHAGA.cardId, CHAGA_CORES)
    wipeDuringOpponentAttack(s)
    assert(s.pendingChoice === null, "確認は立たない")
    assert(ALIVE(s, "p1", chaga.instanceId), "その場で復活している")
    assert(chaga.cores === 1, "コストも即時に支払われている")
}
