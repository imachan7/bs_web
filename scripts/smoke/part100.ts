// smoke パート100（道化師クランの付与コストが「場のスピリットのコストを条件にする判定」全般に
// 反映されるかの検証。実プレイで発覚したバグ修正）
//
// 背景：BS02-060 道化師クラン「このターンの間、自分のスピリットすべてはコスト2のスピリットとしても扱う」は
// CardInstance.tempAlsoCosts / alsoCostsContinuous への付与自体は正しく実装されていたが、
// costCantAct（アタック/ブロック可否）・destroyOwnByCost・matchesTarget（TargetFilter.cost）等、
// 「場のスピリットのコストを条件にする判定」の多くが getCard(inst.cardId).cost を直接読んでおり、
// 付与コストを無視していた。instHasCost / instMatchesCostFilter 経由に統一して修正した。
//
// 一方、「コストが最大のものを選ぶ」という順序付け（destroyOwnByCostの自動選択・gainCoresEqualCostの
// コア数）は、複数コストを持つ状態では「最大」を定義できないため、意図的にカード本来のコストのまま
// 据え置いている（実装側にもコメントを残している）。
import {
    act,
    assert,
    createGame,
    createInstance,
    refreshLevelAsOverrides,
    resolveAction,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { runTurnStart } from "../../server/src/logic/PhaseManager"
import { instHasCost, instMatchesCostFilter, matchesTarget } from "../../shared/rules"

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
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

// クランの発動条件（自分のフィールドに黄のスピリットとネクサスが合計3以上）を満たす3枚
// （道化師クラン自身＋ピヨン＋チュンポポ＝黄3体。part77と同じ組み合わせ）
function putClanTrio(s: GameState): void {
    put(s, "p1", "BS02-060", 3) // 道化師クランLv2（黄・コスト3）
    put(s, "p1", "BS02-049", 1) // ピヨン（黄・コスト0）
    put(s, "p1", "BS02-051", 1) // チュンポポ（黄・コスト1）
}

console.log("=== refreshAllByCost（BS02-106ローヤルポーション）は道化師クランの付与コストも対象にする ===")
{
    const s = setup("clan-refresh-with")
    putClanTrio(s)
    const own3 = put(s, "p1", "BS01-009", 1) // ヴォルク・バブーン：本来コスト3
    own3.isRested = true
    runTurnStart(s) // 自分のスタートステップ：黄3体で条件成立 → lendSelfThisTurn（コスト2付与）
    assert(instHasCost(own3, 2), "前提: own3はクランによりコスト2としても扱われる")

    s.players.p1.hand[0] = "BS02-106"
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ローヤルポーションを使用")
    assert(!own3.isRested, "本来コスト3のown3も、クランの付与コスト2によりrefreshAllByCostの対象になる")
}
console.log("--- クランが無ければ、同じ本来コスト3のスピリットはrefreshAllByCost対象外のまま（回帰確認） ---")
{
    const s = setup("clan-refresh-without")
    const own3 = put(s, "p1", "BS01-009", 1)
    own3.isRested = true
    s.players.p1.hand[0] = "BS02-106"
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ローヤルポーションを使用")
    assert(own3.isRested === true, "クランが無い状態では本来のコスト3で判定され、対象外のまま疲労が残る")
}

console.log("=== costCantAct（BS05-065青嵐の虚空 maxCost2）は道化師クランの付与コストも対象にする ===")
{
    const s = setup("clan-costcantact-with")
    putClanTrio(s)
    const own3 = put(s, "p1", "BS01-009", 1) // 本来コスト3
    const voidNexus = createInstance("BS05-065", s.turn, 0) // 青嵐の虚空Lv1：コスト2以下は行動不可
    s.players.p2.field.nexuses.push(voidNexus)
    refreshLevelAsOverrides(s)
    runTurnStart(s)
    assert(instHasCost(own3, 2), "前提: own3はクランによりコスト2としても扱われる")

    s.phase = "attack"
    const error = act(s, "p1", { type: "attack", instanceId: own3.instanceId })
    assert(error !== null, "本来コスト3でも、付与コスト2が青嵐の虚空のmaxCost2に該当しアタック不可になる")
}
console.log("--- クランが無ければ、同じ本来コスト3のスピリットはアタックできる（回帰確認） ---")
{
    const s = setup("clan-costcantact-without")
    const own3 = put(s, "p1", "BS01-009", 1)
    const voidNexus = createInstance("BS05-065", s.turn, 0)
    s.players.p2.field.nexuses.push(voidNexus)
    refreshLevelAsOverrides(s)

    s.phase = "attack"
    const error = act(s, "p1", { type: "attack", instanceId: own3.instanceId })
    assert(error === null, "クランが無い状態では本来のコスト3で判定され、maxCost2に該当せずアタックできる")
}

console.log("=== matchesTarget（TargetFilter.cost）は道化師クランの付与コストも対象にする ===")
{
    const s = setup("clan-matchestarget")
    putClanTrio(s)
    const own8 = put(s, "p1", "BS01-025", 1) // 要塞龍ギガ：本来コスト8
    runTurnStart(s)
    assert(instHasCost(own8, 2), "前提: own8はクランによりコスト2としても扱われる")
    assert(
        matchesTarget(s, "p1", own8, { cost: { max: 2 } }, undefined),
        "本来コスト8でも、付与コスト2がfilter.cost.max=2を満たす",
    )
    assert(
        !matchesTarget(s, "p1", own8, { cost: { min: 5, max: 7 } }, undefined),
        "本来コスト8・付与コスト2のどちらも満たさない範囲では引き続き不一致",
    )
    assert(instMatchesCostFilter(own8, { max: 2 }), "instMatchesCostFilter単体でも同じ結果になる")
}

console.log("=== destroyOwnByCost（BS02-075天使長プリンシパール maxCost4）：候補は付与コストも見るが、自動選択は本来のコストのまま ===")
{
    const s = setup("clan-destroybycost")
    putClanTrio(s)
    const high = put(s, "p1", "BS01-025", 1) // 要塞龍ギガ：本来コスト8（クラン無しならmaxCost4の対象外）
    const low = put(s, "p1", "BS01-004", 1) // ドラグノ偵察兵：本来コスト2（クラン無しでも対象内）
    runTurnStart(s)
    assert(instHasCost(high, 2), "前提: highはクランによりコスト2としても扱われる")

    const reserveBefore = s.players.p1.reserve
    const highCores = high.cores // destroySpirit自体もコア分をリザーブへ移すため、gainCoresEqualCost分と分けて計算する
    // 天使長プリンシパール自身の召喚を経由せず、ハンドラを直接呼んで検証する（self=nullで自己除外なし）
    resolveAction(s, "p1", null, { type: "destroyOwnByCost", maxCost: 4, gainCoresEqualCost: true })

    assert(
        !s.players.p1.field.spirits.includes(high),
        "本来コスト8のhighも、付与コスト2によりmaxCost4の候補に入り破壊される",
    )
    assert(s.players.p1.field.spirits.includes(low), "lowは破壊されず残る")
    assert(
        s.players.p1.reserve === reserveBefore + highCores + 8,
        "gainCoresEqualCostは破壊したhighの本来のコスト8ぶん（付与コスト2ではない）",
    )
}
