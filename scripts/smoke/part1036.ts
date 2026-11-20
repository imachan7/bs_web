// smoke パート1036（AI のバーストのセットと、意味のない発動の見送り。server/src/ai/legalMoves.ts・policy.ts）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart, viewFor } from "./helpers"
import type { GameState } from "./helpers"
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import { decideAiAction } from "../../server/src/ai/index"
import { burstKind } from "../../server/src/ai/moveTags"
import { BURST_POLICY, OLD_POLICY } from "../../server/src/ai/policy"

const VANILLA = "BS01-002" // ロクケラトプス
const DRAW = "BS14-091" // 双光気弾（バースト：ドロー）
const REMOVAL = "BS14-092" // 烈光閃刃（バースト：破壊。thenPay 付き）
const DESTROY = "BS14-010" // 皇牙獣キンタローグ・ベアー（バースト：thenPay なしの破壊）
const COND = "BS14-X01" // 龍の覇王ジーク・ヤマト・フリード（バースト：ライフ3以下なら破壊）
const GUARD = "SD06-016" // 絶甲氷盾（バースト：ライフにコア／フラッシュ：アタックステップを終える）
const SUMMON = "BS14-020" // ナスノ・アーチャー（バースト：自身を召喚）

assert(getCard(DRAW).name === "双光気弾" && getCard(REMOVAL).name === "烈光閃刃" && getCard(DESTROY).name === "皇牙獣キンタローグ・ベアー", "cardId の機械確認（マジック）")
assert(getCard(GUARD).name === "絶甲氷盾", "cardId の機械確認（守り）")
assert(getCard(COND).name === "龍の覇王ジーク・ヤマト・フリード" && getCard(SUMMON).name === "ナスノ・アーチャー", "cardId の機械確認（スピリット）")

function scene(hand: string[]): GameState {
    const s = createGame("burst", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = hand
    s.players.p2.hand = []
    refreshLevelAsOverrides(s)
    return s
}

const has = (s: GameState, type: string) => enumerateLegalMoves(s, "p1").some((m) => m.action.type === type)

console.log("=== 1. 手札にバーストがあればセットを合法手に入れ、パスより高い点で選ぶ ===")
{
    const s = scene([DRAW])
    assert(has(s, "setBurst"), "setBurst が合法手にある")
    assert(decideAiAction(s, "p1", new Set(), BURST_POLICY)?.action.type === "setBurst", "新しい方針はセットする")
    assert(decideAiAction(s, "p1", new Set(), OLD_POLICY)?.action.type !== "setBurst", "旧の方針はセットしない")
}

console.log("=== 2. ターン1回・入れ替えは良くなるときだけ ===")
{
    const s = scene([DRAW])
    s.players.p1.burstSetThisTurn = true
    assert(!has(s, "setBurst"), "このターンにセット済みなら出さない")
    const t = scene([DRAW])
    t.players.p1.burst = DRAW
    assert(!has(t, "setBurst"), "同じ程度のバーストが伏せてあれば入れ替えない")
    const u = scene([REMOVAL])
    u.players.p1.burst = DRAW
    assert(has(u, "setBurst"), "除去のバーストはドローのバーストより良いので入れ替える")
    const v = scene([VANILLA])
    assert(!has(v, "setBurst"), "バースト効果の無いカードは出さない")
}

console.log("=== 3. 意味のないバーストの発動は断る（旧は従来どおり発動） ===")
function confirm(cardId: string, oppSpirit: boolean, life = 5, event = "ownLifeDamaged"): GameState {
    const s = scene([])
    s.players.p1.life = life
    if (oppSpirit) s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    s.pendingChoice = { pid: "p1", kind: "option", prompt: "", candidates: [], options: ["発動する"], optional: true, confirm: true, action: { type: "noop" }, selfInstanceId: null, burstActivate: { pid: "p1", cardId, event } } as never
    return s
}
{
    const act = (s: GameState, policy?: typeof OLD_POLICY) => decideAiAction(s, "p1", new Set(), policy ?? BURST_POLICY)?.action as { type: string; option?: string } | undefined
    const none = confirm(DESTROY, false, 5, "opponentSummonEffectResolved")
    assert(act(none)?.type === "resolveChoice" && act(none)?.option === undefined, "相手の場に的がいない除去は断る")
    assert(act(none, OLD_POLICY)?.option !== undefined, "旧は発動する")
    const some = confirm(DESTROY, true, 5, "opponentSummonEffectResolved")
    assert(act(some)?.option !== undefined, "的がいるなら発動する")
    assert(act(confirm(REMOVAL, false))?.option === undefined, "thenPay 付きでも、バースト効果そのものが何もできないなら断る（バーストは伏せたまま残る）")
    assert(act(confirm(COND, true, 5))?.option === undefined, "ライフ条件が成り立たない if は断る")
    assert(act(confirm(COND, true, 3))?.option !== undefined, "条件が成り立てば発動する")
    assert(act(confirm(SUMMON, false))?.option !== undefined, "自身を召喚するバーストは発動する")
    assert(act(confirm(DRAW, false))?.option !== undefined, "ドローは相手の場に関係なく発動する")
}

console.log("=== 4. 守りのバーストは効果データから分類し、ドローより上に置く ===")
{
    assert(burstKind(GUARD) === "guard" && burstKind(DRAW) === "draw" && burstKind(DESTROY) === "removal", "種類の分類（ライフにコア＝守り／ドロー／破壊）")
    const s = scene([GUARD])
    s.players.p1.burst = DRAW
    assert(has(s, "setBurst"), "ドローのバーストを伏せていても、守りのバーストには入れ替える")
}

console.log("すべてのチェックに合格しました 🎉（part1036）")
