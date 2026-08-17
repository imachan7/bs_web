// smoke パート213（BS08-055 竜騎集う円卓 Lv2：払うかを「効果ごとに」選べるようにした）
//
// Lv2『自分のアタックステップ』
// 「系統：「龍帝」/「竜騎」を持つ自分のスピリットすべては、相手のスピリットの効果の対象になるたび、
//   自分の手札1枚を破棄することで、その効果を受けない。」
//
// 直す前は**事前トグル（PlayerState.payToNegate）で一律**に払う／払わないを決めており、
// 「どの効果に対して払うか」を効果の内容を見てから選べなかった。破棄する手札も末尾固定だった。
// 耐性の判定（resistanceAgainst）は装甲と同じ同期の述語で中断できないため、
// **対象が確定してから適用するまでの間に先に聞く**形にした（askPayToNegateIfNeeded →
// payNegateDecide → GameState.payNegateDecision）。docs/design/INTERRUPTION_POINTS.md §4。
//
// **このパートは part169（事前トグル方式のテスト）を置き換えたもの。**
// あちらが見ていた「既定では払って防ぐ」「手札が無ければ防げない」は、
// それぞれ下の「非対話では従来どおり自動で払う」「手札が0枚なら聞かずに効果を受ける」が引き継いでいる。
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const ROUND_TABLE = "BS08-055" // 竜騎集う円卓（ネクサス。Lv2 はコア1個）
const CLAIRE = "BS04-010" // 雷帝エール・クレル（系統「龍帝」＝守られる側）
const ATTACKER = "BS01-002" // ロクケラトプス（バニラ。相手の効果の発生源）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(ROUND_TABLE).name === "竜騎集う円卓" && getCard(ROUND_TABLE).type === "nexus", "BS08-055 は竜騎集う円卓（ネクサス）")
    assert(getCard(CLAIRE).name === "雷帝エール・クレル" && getCard(CLAIRE).family.includes("龍帝"), "BS04-010 は雷帝エール・クレル（龍帝）")
    assert(getCard(ATTACKER).name === "ロクケラトプス" && getCard(ATTACKER).effects.length === 0, "BS01-002 はロクケラトプス（バニラ）")
    assert(
        getCard(ROUND_TABLE).effects.some((e) => e.kind === "targetNegateByHandDiscard"),
        "竜騎集う円卓は targetNegateByHandDiscard を持つ",
    )
}

interface Setup {
    s: GameState
    targetId: string
    src: ReturnType<typeof createInstance>
}

// p1 のアタックステップ（Lv2 の条件『自分のアタックステップ』）に、
// p2 のスピリットの効果が p1 の龍帝を対象に取る場面を作る
function setup(opts: { interactive?: boolean; nexusLevel?: number; hand?: number; turn?: "p1" | "p2" } = {}): Setup {
    const s = createGame(`round-table-${JSON.stringify(opts)}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = opts.interactive ?? true
    s.turnPlayer = opts.turn ?? "p1"
    s.phase = "attack"
    // 円卓（Lv2 にするならコア1個、Lv1 なら0個）
    const nexus = createInstance(ROUND_TABLE, s.turn, opts.nexusLevel === 1 ? 0 : 1)
    s.players.p1.field.nexuses.push(nexus)
    // 守られる側（龍帝）
    const target = createInstance(CLAIRE, s.turn, 1)
    s.players.p1.field.spirits.push(target)
    // 効果の発生源（相手のスピリット）
    const src = createInstance(ATTACKER, s.turn, 1)
    s.players.p2.field.spirits.push(src)
    // 手札は**重複しないカード**で組む。同名が混ざると「選んだ1枚が消えたか」を
    // cardId で判別できず、末尾固定のままでも合格してしまう
    const n = opts.hand ?? 3
    s.players.p1.hand = ["BS01-001", "BS01-002", "BS01-003", "BS01-004"].slice(0, n)
    return { s, targetId: target.instanceId, src }
}

const aliveInP1 = (s: GameState, id: string) => s.players.p1.field.spirits.some((x) => x.instanceId === id)

console.log("=== 対象になった時点で、守る側に「破棄する手札」を聞く ===")
{
    const { s, targetId, src } = setup()
    resolveAction(s, "p2", src, { type: "destroy", count: 1 }, targetId)

    assert(s.pendingChoice !== null, "選択待ちになる")
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice?.cardZone === "hand", "自分の手札から選ぶ")
    assert(s.pendingChoice?.pid === "p1", "選ぶのは守る側（p1）")
    assert(s.pendingChoice?.actorPid === "p2", "解決は効果の実行者（p2）の効果のまま")
    assert(s.pendingChoice?.optional === true, "スキップできる（＝効果を受ける選択）")
    assert(aliveInP1(s, targetId), "聞いている間はまだ破壊されていない")
    assert((s.pendingChoice?.prompt ?? "").includes("ロクケラトプス"), "どの効果から守るのかがプロンプトに出る")
    assert((s.pendingChoice?.prompt ?? "").includes("雷帝エール・クレル"), "どのスピリットを守るのかも出る")
}

console.log("=== 手札を選ぶと、その1枚が破棄されて効果を受けない ===")
{
    const { s, targetId, src } = setup()
    const handBefore = [...s.players.p1.hand]
    assert(new Set(handBefore).size === handBefore.length, "テスト用の手札は重複しない（判定の前提）")
    resolveAction(s, "p2", src, { type: "destroy", count: 1 }, targetId)
    // 末尾ではなく**先頭**を選ぶ（破棄するカードを選べることの確認）
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "守る側が破棄する手札を選ぶ")

    assert(s.pendingChoice === null, "選択待ちは残らない")
    assert(aliveInP1(s, targetId), "対象は破壊されていない（効果を受けなかった）")
    assert(s.players.p1.hand.length === handBefore.length - 1, "手札が1枚減る")
    assert(!s.players.p1.hand.includes(handBefore[0]!), "選んだ先頭のカードが無くなっている（末尾固定ではない）")
    assert(s.players.p1.trashCards.includes(handBefore[0]!), "選んだカードはトラッシュへ")
}

console.log("=== スキップすると効果を受ける（手札は減らない） ===")
{
    const { s, targetId, src } = setup()
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p2", src, { type: "destroy", count: 1 }, targetId)
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "守る側がスキップする")

    assert(s.pendingChoice === null, "選択待ちは残らない")
    assert(!aliveInP1(s, targetId), "対象は破壊される（効果を受けた）")
    assert(s.players.p1.hand.length === handBefore, "手札は減らない")
}

console.log("=== 効果ごとに選べる（1回目は払い、2回目は受ける） ===")
{
    const { s, targetId, src } = setup({ hand: 3 })
    const second = createInstance(CLAIRE, s.turn, 1)
    s.players.p1.field.spirits.push(second)

    // 1体目：払って守る
    resolveAction(s, "p2", src, { type: "destroy", count: 1 }, targetId)
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "1回目は払う")
    assert(aliveInP1(s, targetId), "1体目は守られた")

    // 2体目：同じターンでも、今度は受ける側を選べる
    resolveAction(s, "p2", src, { type: "destroy", count: 1 }, second.instanceId)
    assert(s.pendingChoice !== null, "2回目もあらためて聞かれる")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "2回目はスキップする")
    assert(!aliveInP1(s, second.instanceId), "2体目は破壊された（効果ごとに選べている）")
    assert(s.players.p1.hand.length === 2, "払ったのは1回ぶんだけ")
}

console.log("=== 手札が0枚なら聞かずに効果を受ける ===")
{
    const { s, targetId, src } = setup({ hand: 0 })
    resolveAction(s, "p2", src, { type: "destroy", count: 1 }, targetId)
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(!aliveInP1(s, targetId), "対象は破壊される")
}

console.log("=== Lv1 では働かない（この効果は Lv2 から） ===")
{
    const { s, targetId, src } = setup({ nexusLevel: 1 })
    resolveAction(s, "p2", src, { type: "destroy", count: 1 }, targetId)
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(!aliveInP1(s, targetId), "対象は破壊される")
}

console.log("=== 『自分のアタックステップ』限定（相手のターンでは働かない） ===")
{
    const { s, targetId, src } = setup({ turn: "p2" })
    resolveAction(s, "p2", src, { type: "destroy", count: 1 }, targetId)
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(!aliveInP1(s, targetId), "対象は破壊される")
}

console.log("=== 非対話（テスト・自動解決）では従来どおり自動で払う ===")
{
    const { s, targetId, src } = setup({ interactive: false })
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p2", src, { type: "destroy", count: 1 }, targetId)
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(aliveInP1(s, targetId), "自動で払って守られる（既存テストの前提を変えない）")
    assert(s.players.p1.hand.length === handBefore - 1, "手札が1枚減る")
}

console.log("=== 破壊以外の対象効果でも働く（コア除去・手札戻し・疲労） ===")
{
    // 効果文は「相手のスピリットの効果の**対象になるたび**」なので、破壊に限らない。
    // 呼び出し元（resistanceAgainst の直前）ごとに組み込んであることを確かめる
    const cases: { label: string; action: Parameters<typeof resolveAction>[3] }[] = [
        { label: "コア除去", action: { type: "coreRemove", count: 1 } },
        { label: "手札に戻す", action: { type: "returnToHand", count: 1 } },
        { label: "疲労させる", action: { type: "exhaust", count: 1 } },
    ]
    for (const c of cases) {
        const { s, targetId, src } = setup()
        resolveAction(s, "p2", src, c.action, targetId)
        assert(s.pendingChoice !== null, `${c.label}でも守るか聞かれる`)
        assert(s.pendingChoice?.pid === "p1", `${c.label}：選ぶのは守る側`)
        assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, `${c.label}：払って守る`)
        assert(s.players.p1.hand.length === 2, `${c.label}：手札が1枚減る`)
    }
}
