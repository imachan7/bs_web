// smoke パート631（BS18 部品1〜4：TargetFilter.color 配列・notInBattle・sameLevelAsSource、exhaust の count:"any"）
import { lastTargetsOf } from "../../server/src/logic/record"
import { matchesTarget } from "../../shared/rules"
import { assert, createGame, createInstance, currentLevel, getCard, resolveAction, refreshLevelAsOverrides, runTurnStart, handleAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const RED = "BS01-002" // ロクケラトプス（赤・Lv1:1コア Lv2:2コア Lv3:3コア）
const RED2 = "BS01-003" // テラノセイバー（赤・Lv1:1コア Lv2:3コア）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).colors.includes("red"), "REDは赤のロクケラトプス")
    assert(getCard(RED2).name === "テラノセイバー" && getCard(RED2).colors.includes("red"), "RED2は赤のテラノセイバー")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. color は配列でOR。単色の指定は従来どおり ===")
{
    const s = game("color-array")
    const red = put(s, "p1", RED)
    assert(matchesTarget(s, "p1", red, { color: ["blue", "red"] }), "配列のどれかの色を持てば一致")
    assert(!matchesTarget(s, "p1", red, { color: ["blue", "green"] }), "配列のどの色も持たなければ不一致")
    assert(matchesTarget(s, "p1", red, { color: "red" }) && !matchesTarget(s, "p1", red, { color: "blue" }), "単色指定は従来どおり")
}

console.log("=== 2. notInBattle：アタッカーでもブロッカーでもない ===")
{
    const s = game("not-in-battle")
    const a = put(s, "p1", RED)
    const b = put(s, "p2", RED)
    const c = put(s, "p1", RED)
    assert(matchesTarget(s, "p1", c, { notInBattle: true }) && matchesTarget(s, "p1", a, { notInBattle: true }), "バトル外では全員が該当")
    s.battle = { attackerInstanceId: a.instanceId, blockerInstanceId: b.instanceId } as unknown as GameState["battle"]
    assert(!matchesTarget(s, "p1", a, { notInBattle: true }), "アタッカーは不一致")
    assert(!matchesTarget(s, "p2", b, { notInBattle: true }), "ブロッカーは不一致")
    assert(matchesTarget(s, "p1", c, { notInBattle: true }), "バトルに関わらない個体は一致")
}

console.log("=== 3. sameLevelAsSource：発生源と同じLvだけ ===")
{
    const s = game("same-level")
    const self = put(s, "p1", RED, 1) // Lv1
    const lv1 = put(s, "p2", RED, 1)
    const lv2 = put(s, "p2", RED, 2)
    assert(currentLevel(self).level === 1 && currentLevel(lv1).level === 1 && currentLevel(lv2).level === 2, "前提：Lv1・Lv1・Lv2")
    resolveAction(s, "p1", self, { type: "exhaust", count: 2, filter: { sameLevelAsSource: true } })
    assert(lv1.isRested && !lv2.isRested, "発生源と同じLv1だけが疲労し、Lv2は疲労しない")

    const s2 = game("same-level-gone")
    const ghost = createInstance(RED, s2.turn, 1) // 場にいない発生源
    const t = put(s2, "p2", RED, 1)
    resolveAction(s2, "p1", ghost, { type: "exhaust", count: 1, filter: { sameLevelAsSource: true } })
    assert(!t.isRested, "発生源が場にいなければ対象なし")
}

console.log("=== 4. exhaust count:any（好きなだけ） ===")
{
    const s = game("any-auto")
    const self = put(s, "p1", RED2, 1)
    const a = put(s, "p1", RED)
    const b = put(s, "p1", RED)
    const done = put(s, "p1", RED)
    done.isRested = true
    const foe = put(s, "p2", RED)
    resolveAction(s, "p1", self, { type: "exhaust", side: "own", count: "any", filter: { excludeSelf: true } })
    assert(a.isRested && b.isRested, "非対話は候補すべてを疲労させる")
    assert(!self.isRested, "excludeSelf の発生源は疲労しない")
    assert(!foe.isRested, "相手側は触らない")

    const s2 = game("any-notinbattle")
    const att = put(s2, "p1", RED)
    const idle = put(s2, "p1", RED)
    s2.battle = { attackerInstanceId: att.instanceId, blockerInstanceId: null } as unknown as GameState["battle"]
    resolveAction(s2, "p1", null, { type: "exhaust", side: "own", count: "any", filter: { notInBattle: true } })
    assert(idle.isRested && !att.isRested, "バトルしていない個体だけが疲労する")

    const s3 = game("any-none")
    resolveAction(s3, "p1", null, { type: "exhaust", side: "own", count: "any" })
    assert(s3.pendingChoice === null, "候補が0体でも不発で終わる（例外を出さない）")
}

console.log("=== 4b. exhaust count:any の対話：1体ずつ選び、好きなところで止められる ===")
{
    const s = game("any-interactive", true)
    const a = put(s, "p1", RED)
    const b = put(s, "p1", RED)
    const c = put(s, "p1", RED)
    resolveAction(s, "p1", null, { type: "exhaust", side: "own", count: "any" })
    const p1 = s.pendingChoice
    assert(p1 !== null && p1.kind === "target" && p1.optional === true && p1.candidates.length === 3, "3体を候補に任意の選択が出る")
    assert(handleActionOk(s, { type: "resolveChoice", instanceId: a.instanceId }), "1体目を選ぶ")
    assert(a.isRested && !b.isRested, "選んだ1体だけが疲労")
    const p2 = s.pendingChoice
    assert(p2 !== null && p2.kind === "target" && p2.candidates.length === 2 && !p2.candidates.includes(a.instanceId), "疲労済みを除いた2体で聞き直す")
    assert(handleActionOk(s, { type: "resolveChoice" }), "ここで選ぶのをやめる（スキップ）")
    assert(s.pendingChoice === null && !b.isRested && !c.isRested, "スキップで終わり、残りは疲労しない")
}


function handleActionOk(s: GameState, action: Parameters<typeof handleAction>[2]): boolean {
    return handleAction(s, s.pendingChoice?.pid ?? "p1", action) === null
}

console.log("=== 4c. 疲労状態の個体は「好きなだけ」の候補に出さない（選んでも何も起きず、同じ個体を選び続けられるため） ===")
{
    const s = game("any-rested", true)
    const a = put(s, "p1", RED)
    const done = put(s, "p1", RED)
    done.isRested = true
    resolveAction(s, "p1", null, { type: "exhaust", side: "own", count: "any" })
    const p1 = s.pendingChoice
    assert(p1 !== null && p1.kind === "target" && !p1.candidates.includes(done.instanceId) && p1.candidates.includes(a.instanceId), "候補は回復状態の個体だけ")
    assert(handleActionOk(s, { type: "resolveChoice", instanceId: a.instanceId }), "回復状態の個体を選ぶ")
    assert(a.isRested && !s.pendingChoice, "候補が尽きたら聞き直さずに終わる（記録は解決しきった時点で消える）")

    const s2 = game("any-rested-auto")
    const r = put(s2, "p1", RED)
    r.isRested = true
    resolveAction(s2, "p1", null, { type: "exhaust", side: "own", count: "any" })
    assert(lastTargetsOf(s2).length === 0, "非対話は回復状態だけ（疲労状態は選ばない）")
}

console.log("すべてのチェックに合格しました 🎉（part631）")
