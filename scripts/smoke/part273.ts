// smoke パート273（BS11 グループC その2：相手の合体スピリットを分離させる）
//
// docs/design/BRAVE.md §12.5.1（2026-09-02 ユーザー確認）:
// 「相手の合体スピリット1体を分離させる。ただし、分離するときのコアの移動は相手が行う」は、
// **場を離れるときと同じ手順**（§6.3）に乗せる。＝ブレイヴの持ち主に「残すか・どのコアを置くか」を聞き、
// 残さない／払えないならブレイヴはトラッシュへ。ホストは無傷で場に残る。
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave } from "../../server/src/logic/removal"
import { braveKeepCores } from "../../shared/rules"

const anySpirit = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0 && c.symbol.length === 1)
const braveNoSymbol = ALL_CARDS.find((c) => c.type === "brave" && c.symbol.length === 0)
const braveWithSymbol = ALL_CARDS.find((c) => c.type === "brave" && c.symbol.length === 1)
assert(anySpirit.length >= 2 && braveNoSymbol !== undefined && braveWithSymbol !== undefined, "テスト前提: バニラスピリット2種とブレイヴ2種がいる")

function game(interactive: boolean): GameState {
    const s = createGame("bs11-detach-opponent", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function combined(s: GameState, pid: PlayerId, hostCardId: string, braveCardId: string) {
    const host = createInstance(hostCardId, s.turn, 3)
    s.players[pid].field.spirits.push(host)
    const brave = createInstance(braveCardId, s.turn, 0)
    attachBrave(s, pid, host, brave)
    refreshLevelAsOverrides(s)
    return { host, brave }
}

console.log("=== §A 非対話：リザーブから自動で払い、スピリット状態で残る ===")
{
    const s = game(false)
    const { host, brave } = combined(s, "p2", anySpirit[0]!.cardId, braveNoSymbol!.cardId)
    const need = braveKeepCores(brave)
    const before = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "detachOpponentBrave" })
    assert(s.players.p2.field.combinedBraves.length === 0, "合体中の置き場から外れる")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴはスピリット状態で場に残る")
    assert(brave.cores === need, "Lv1維持コストぶんのコアが乗る")
    assert(s.players.p2.reserve === before - need, "コアは持ち主のリザーブから出る")
    assert(host.braveRefs === undefined, "ホストの参照が切れている")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === host.instanceId), "ホストは無傷で残る")
    assert(s.players.p2.trashCards.length === 0, "何もトラッシュに行かない")
}

console.log("=== §B 払えないときはトラッシュへ ===")
{
    const s = game(false)
    const { host, brave } = combined(s, "p2", anySpirit[0]!.cardId, braveNoSymbol!.cardId)
    s.players.p2.reserve = 0
    host.cores = 0 // フィールドにも取れるコアが無い
    resolveAction(s, "p1", null, { type: "detachOpponentBrave" })
    assert(s.players.p2.trashCards.includes(brave.cardId), "ブレイヴはトラッシュへ")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "場には残らない")
}

console.log("=== §C 対話：残すかどうかを聞かれるのは**ブレイヴの持ち主** ===")
{
    const s = game(true)
    const { brave } = combined(s, "p2", anySpirit[0]!.cardId, braveNoSymbol!.cardId)
    resolveAction(s, "p1", null, { type: "detachOpponentBrave" })
    assert(s.pendingChoice?.braveKeep !== undefined, "残すかどうかの確認が立つ")
    assert(s.pendingChoice?.pid === "p2", "聞かれるのはブレイヴの持ち主（効果の使用者ではない）")
    assert(act(s, "p2", { type: "resolveChoice", option: "残す" }) === null, "「残す」を選ぶ")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "スピリット状態で残る")
}

console.log("=== §D 対話：持ち主が「残さない」を選べる ===")
{
    const s = game(true)
    const { brave } = combined(s, "p2", anySpirit[0]!.cardId, braveNoSymbol!.cardId)
    resolveAction(s, "p1", null, { type: "detachOpponentBrave" })
    assert(s.pendingChoice?.braveKeep !== undefined, "確認が立つ")
    assert(act(s, "p2", { type: "resolveChoice" }) === null, "「残さない」を選ぶ")
    assert(s.players.p2.trashCards.includes(brave.cardId), "ブレイヴはトラッシュへ")
    assert(s.players.p2.field.spirits.every((sp) => sp.instanceId !== brave.instanceId), "場には残らない")
}

console.log("=== §E allHosts + minSymbols：シンボル2つ以上の合体スピリットだけ分離させる ===")
{
    const s = game(false)
    // ホスト（シンボル1）＋シンボルを持つブレイヴ＝合計2 → 対象
    const big = combined(s, "p2", anySpirit[0]!.cardId, braveWithSymbol!.cardId)
    // ホスト（シンボル1）＋シンボル0のブレイヴ＝合計1 → 対象外
    const small = combined(s, "p2", anySpirit[1]!.cardId, braveNoSymbol!.cardId)
    resolveAction(s, "p1", null, { type: "detachOpponentBrave", allHosts: true, minSymbols: 2 })
    assert(big.host.braveRefs === undefined, "シンボル2つ以上のホストは分離される")
    assert((small.host.braveRefs ?? []).length === 1, "シンボル1つのホストは分離されない")
}

console.log("=== §F 対話：候補2体なら効果の使用者が分離させる相手を選ぶ ===")
{
    const s = game(true)
    const a = combined(s, "p2", anySpirit[0]!.cardId, braveNoSymbol!.cardId)
    const b = combined(s, "p2", anySpirit[1]!.cardId, braveNoSymbol!.cardId)
    resolveAction(s, "p1", null, { type: "detachOpponentBrave" })
    assert(s.pendingChoice?.kind === "target" && s.pendingChoice.pid === "p1", "選ぶのは効果の使用者")
    assert(s.pendingChoice?.candidates.length === 2, "候補は合体スピリット2体")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b.host.instanceId }) === null, "2体目を選ぶ")
    assert(b.host.braveRefs === undefined, "選んだ側が分離する")
    assert((a.host.braveRefs ?? []).length === 1, "選ばなかった側は合体したまま")
}

console.log("=== §G 合体スピリットがいなければ何も起きない ===")
{
    const s = game(false)
    const lone = createInstance(anySpirit[0]!.cardId, s.turn, 1)
    s.players.p2.field.spirits.push(lone)
    resolveAction(s, "p1", null, { type: "detachOpponentBrave" })
    assert(s.players.p2.field.spirits.length === 1, "盤面は変わらない")
    assert(s.players.p2.trashCards.length === 0, "何もトラッシュに行かない")
}

console.log("すべてのチェックに合格しました 🎉（part273）")
