// smoke パート274（BS11 グループC その3：効果による合体 ＝ BS11-078 ブレイヴフラッシュ）
//
// docs/design/BRAVE.md §12.5.2（2026-09-02 ユーザー確認）:
// 「フラッシュタイミングで合体させる」は**効果専用の合体**（combineOwnBrave）で行う。
// メインステップの任意合体（GameAction "combineBrave"）には触らない。
// 「ブロック宣言後のフラッシュタイミングで使えない」はマジック側の制限（afterBlockForbidden）。
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { braveCombineCandidates } from "../../shared/summon"

const FLASH = "BS11-078" // ブレイヴフラッシュ（フラッシュ・コスト不問でリザーブから払う）
// 合体条件「バニラ」のブレイヴを選び、ホストは効果を持たないスピリット（＝バニラ）にする
const braveCard = ALL_CARDS.find(
    (c) => c.type === "brave" && JSON.stringify(c.braveCondition) === JSON.stringify({ vanilla: true }),
)
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
assert(braveCard !== undefined && vanilla.length >= 2, "テスト前提: 合体条件バニラのブレイヴとバニラスピリットがいる")

function game(interactive: boolean): GameState {
    const s = createGame("bs11-combine-effect", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
// スピリット状態のブレイヴを1体置く
function braveOnField(s: GameState) {
    const b = createInstance(braveCard!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(b)
    refreshLevelAsOverrides(s)
    return b
}

console.log("=== §A 非対話：スピリット状態のブレイヴが自分のスピリットに合体する ===")
{
    const s = game(false)
    const host = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(host)
    const brave = braveOnField(s)
    resolveAction(s, "p1", null, { type: "combineOwnBrave" })
    assert(s.players.p1.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "ブレイヴは合体中の置き場へ")
    assert((host.braveRefs ?? []).length === 1, "ホストが参照を持つ")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "スピリット状態ではなくなる")
}

console.log("=== §B 対話：合体先を選ぶ ===")
{
    const s = game(true)
    const h1 = createInstance(vanilla[0]!.cardId, s.turn, 2)
    const h2 = createInstance(vanilla[1]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(h1, h2)
    const brave = braveOnField(s)
    assert(braveCombineCandidates(s, "p1", brave.cardId).length === 2, "テスト前提: 合体先の候補が2体")
    resolveAction(s, "p1", null, { type: "combineOwnBrave" })
    assert(s.pendingChoice?.kind === "target" && s.pendingChoice.pid === "p1", "合体先の選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: h2.instanceId }) === null, "2体目を選ぶ")
    assert((h2.braveRefs ?? []).length === 1, "選んだ側に合体する")
    assert((h1.braveRefs ?? []).length === 0, "選ばなかった側には合体しない")
}

console.log("=== §C 合体先がいなければ何も起きない ===")
{
    const s = game(false)
    const brave = braveOnField(s)
    resolveAction(s, "p1", null, { type: "combineOwnBrave" })
    assert(s.players.p1.field.combinedBraves.length === 0, "合体は起きない")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴはスピリット状態のまま")
}

console.log("=== §D ブロック宣言後のフラッシュタイミングでは使用できない ===")
{
    const s = game(false)
    const atk = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(atk)
    braveOnField(s)
    const blocker = createInstance(vanilla[1]!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    s.players.p1.hand[0] = FLASH
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    // フラッシュ①（ブロック宣言前）では使える。優先権は防御側→攻撃側の順
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（攻撃側に優先権が移る）")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ブロック宣言前は使用できる")
    assert(s.players.p1.field.combinedBraves.length === 1, "合体している")
}
{
    const s = game(false)
    const atk = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(atk)
    braveOnField(s)
    const blocker = createInstance(vanilla[1]!.cardId, s.turn, 3)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    s.players.p1.hand[0] = FLASH
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ブロック宣言（フラッシュ②が開く）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（攻撃側に優先権が移る）")
    const err = act(s, "p1", { type: "castMagic", handIndex: 0 })
    assert(err !== null, `ブロック宣言後は使用できない（${err}）`)
    assert(s.players.p1.field.combinedBraves.length === 0, "合体は起きていない")
}

console.log("すべてのチェックに合格しました 🎉（part274）")
