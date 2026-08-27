// smoke パート247（BS10-087 戦場に息づく命。2026-08-27）
//
// 拡張した機構:
//   - step.beforeDraw を beforeStepAction に一般化し、コアステップにも同じ規則を通した。
//     PhaseManager のコアステップを「コア置きの前／コア置き本体＋その後」の2区間に分割し、
//     GameState.coreStepSkipped（drawStepSkipped と同型）を追加した
//   - draw アクションに costSkipCoreStep（「ボイドからコアをリザーブに置かないことで」）
//   - voidCoreToOwnByKeyword の keyword を任意にし combinedFilter を追加（合体スピリットすべて）
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, currentLevel, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { instIsCombined, matchesBraveCondition } from "../../shared/rules"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
const inochi = byName("戦場に息づく命")
{
    assert(inochi.type === "nexus" && inochi.colors.includes("green"), "戦場に息づく命は緑のネクサス")
    assert(inochi.cost === 4, "戦場に息づく命のコストは4")
}

// ネクサスを置いた状態で、次のターン開始処理（＝コアステップ）まで進める
function startTurnWith(seed: string, cores: number, interactive: boolean) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    const nexus = putNexus(s, "p1", inochi.cardId, cores)
    // ターン1はコアステップが存在しないので、ターン2以降で確認する
    s.turn = 3
    s.turnPlayer = "p1"
    s.drawStepSkipped = false
    s.coreStepSkipped = false
    return { s, nexus }
}

console.log("=== §A 非対話：optional の step 効果は自動発動する（既存の常闇の聖堂Lv2 と同じ扱い） ===")
{
    const { s, nexus } = startTurnWith("bs10-087-a", inochi.levels[0]!.cores, false)
    assert(currentLevel(nexus).level === 1, "戦場に息づく命はLv1")
    const reserveBefore = s.players.p1.reserve
    const handBefore = s.players.p1.hand.length
    runTurnStart(s)
    assert(s.players.p1.reserve === reserveBefore, `コアを置かない側に倒れる（実際: +${String(s.players.p1.reserve - reserveBefore)}）`)
    assert(s.players.p1.hand.length === handBefore + 2, `コアステップとドローステップで2枚増える（実際: +${String(s.players.p1.hand.length - handBefore)}）`)
}

console.log("=== §A2 ネクサスが無ければコアステップは従来どおり ===")
{
    const s = createGame("bs10-087-a2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.drawStepSkipped = false
    s.coreStepSkipped = false
    const reserveBefore = s.players.p1.reserve
    runTurnStart(s)
    assert(s.players.p1.reserve === reserveBefore + 1, `リザーブにコアが1個置かれる（実際: +${String(s.players.p1.reserve - reserveBefore)}）`)
}

console.log("=== §B 対話：コアステップで毎回発動確認が出る。断ればコアが増える ===")
{
    const { s } = startTurnWith("bs10-087-b", inochi.levels[0]!.cores, true)
    const reserveBefore = s.players.p1.reserve
    runTurnStart(s)
    assert(s.pendingChoice !== null && s.pendingChoice !== undefined, "コアステップで発動確認が出る")
    assert(s.pendingChoice!.optional, "「〜することで」なので断れる")
    assert(s.players.p1.reserve === reserveBefore, "確認中はまだコアが置かれていない")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ＝発動しない")
    assert(s.players.p1.reserve === reserveBefore + 1, `断ればリザーブにコアが1個置かれる（実際: ${String(s.players.p1.reserve - reserveBefore)}）`)
    assert(!s.coreStepSkipped, "コア置きは放棄されていない")
}

console.log("=== §C 対話：受ければコアを置かず、代わりに1枚ドローする ===")
{
    const { s } = startTurnWith("bs10-087-c", inochi.levels[0]!.cores, true)
    const reserveBefore = s.players.p1.reserve
    const handBefore = s.players.p1.hand.length
    runTurnStart(s)
    assert(s.pendingChoice !== null && s.pendingChoice !== undefined, "コアステップで発動確認が出る")
    const option = s.pendingChoice!.options?.[0]
    assert(option !== undefined, "確認の選択肢がある")
    assert(act(s, "p1", { type: "resolveChoice", option: option! }) === null, "発動を受ける")
    assert(s.coreStepSkipped, "コア置きを支払いに使った")
    assert(s.players.p1.reserve === reserveBefore, `リザーブにコアは置かれない（実際: +${String(s.players.p1.reserve - reserveBefore)}）`)
    // コアステップの1枚 + ドローステップの1枚
    assert(s.players.p1.hand.length === handBefore + 2, `手札が2枚増える（コアステップ+ドローステップ。実際: +${String(s.players.p1.hand.length - handBefore)}）`)
}

console.log("=== §D 相手のターンでは発動しない（turn:\"own\"） ===")
{
    const { s } = startTurnWith("bs10-087-d", inochi.levels[0]!.cores, true)
    s.turnPlayer = "p2"
    const reserveBefore = s.players.p2.reserve
    runTurnStart(s)
    assert(s.pendingChoice === null || s.pendingChoice === undefined, "相手のコアステップでは確認が出ない")
    assert(s.players.p2.reserve === reserveBefore + 1, "相手は通常どおりコアを1個得る")
}

// host のコストを満たす、host が合体できるブレイヴを1枚探す（part243 と同じ形）
function findCompatibleBrave(host: { cost: number; effect: string }) {
    return ALL_CARDS.find((c) => {
        if (c.type !== "brave") return false
        const cond = c.braveCondition
        const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
        const t = terms[0]
        if (t === undefined) return true
        if (t.vanilla === true) return host.effect === ""
        return host.cost >= (t.minCost ?? 0)
    })
}

console.log("=== §E Lv2：相手によってライフが減ったとき、自分の合体スピリットすべてにコア1個ずつ ===")
{
    const s = createGame("bs10-087-e", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    putNexus(s, "p1", inochi.cardId, inochi.levels[1]!.cores)

    // 合体スピリット（コアが乗る側）と、合体していないスピリット（乗らない側）を1体ずつ用意する
    const host = byName("ヘラジグサ")
    const brave = findCompatibleBrave(host)
    assert(brave !== undefined, "テスト前提: 合体できるブレイヴが1枚は存在する")
    const hostInst = createInstance(host.cardId, s.turn, host.levels[0]!.cores)
    s.players.p1.field.spirits.push(hostInst)
    refreshLevelAsOverrides(s)
    assert(matchesBraveCondition(s, "p1", hostInst, brave!.cardId), `${brave!.name} はヘラジグサに合体できる`)
    s.players.p1.hand = [brave!.cardId]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: hostInst.instanceId })
    assert(instIsCombined(hostInst), "合体スピリットになっている")

    const solo = createInstance(byName("ムシャゼミ").cardId, s.turn, 1)
    s.players.p1.field.spirits.push(solo)
    refreshLevelAsOverrides(s)

    const hostBefore = hostInst.cores
    const soloBefore = solo.cores
    // 相手のアタックステップで、相手のアタックを受けて自分のライフが減る
    s.turnPlayer = "p2"
    s.phase = "attack"
    const attacker = createInstance(byName("ムシャゼミ").cardId, s.turn, 1)
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手がアタック宣言")
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける")
    assert(hostInst.cores === hostBefore + 1, `合体スピリットにコア1個が置かれる（実際: +${String(hostInst.cores - hostBefore)}）`)
    assert(solo.cores === soloBefore, `合体していないスピリットには置かれない（実際: +${String(solo.cores - soloBefore)}）`)
}
