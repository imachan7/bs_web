// smoke パート272（BS11 グループC その1：ブレイヴだけを破壊する）
//
// docs/design/BS11_PLAN.md §1 の3（2026-09-02 ユーザー確認）:
// 「合体スピリットのブレイヴ1つを破壊する」は**ブレイヴだけがトラッシュへ行き、ホストは無傷**。
// 合体中のブレイヴはコア0なので戻るコアは無い。『破壊時』はブレイヴ側のものだけ発火する。
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave } from "../../server/src/logic/removal"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}
const anyBrave = ALL_CARDS.filter((c) => c.type === "brave")
const anySpirit = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
assert(anyBrave.length >= 1 && anySpirit.length >= 2, "テスト前提: ブレイヴとバニラスピリットがいる")

function game(interactive: boolean): GameState {
    const s = createGame("bs11-brave-destroy", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
// 合体スピリットを1体作る（ホスト＋合体中のブレイヴ）
function combined(s: GameState, pid: PlayerId, hostCardId: string, braveCardId: string) {
    const host = createInstance(hostCardId, s.turn, 3)
    s.players[pid].field.spirits.push(host)
    const brave = createInstance(braveCardId, s.turn, 0)
    // attachBrave が combinedBraves への追加と braveRefs の張りを両方やる（自分で push しない）
    attachBrave(s, pid, host, brave)
    refreshLevelAsOverrides(s)
    return { host, brave }
}

console.log("=== §A ブレイヴだけがトラッシュへ行き、ホストは無傷で残る ===")
{
    const s = game(false)
    const { host, brave } = combined(s, "p2", anySpirit[0]!.cardId, anyBrave[0]!.cardId)
    const hostCores = host.cores
    resolveAction(s, "p1", null, { type: "destroyBrave" })
    assert(s.players.p2.field.combinedBraves.length === 0, "合体中の置き場から消える")
    assert(s.players.p2.trashCards.includes(brave.cardId), "ブレイヴはトラッシュへ")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === host.instanceId), "ホストは場に残る")
    assert(host.cores === hostCores, "ホストのコアは減らない")
    assert(host.braveRefs === undefined, "ホストの参照が切れている")
    assert(!s.players.p2.trashCards.includes(host.cardId), "ホストはトラッシュに行かない")
}

console.log("=== §B allHosts：合体スピリットすべてから1つずつ破壊する ===")
{
    const s = game(false)
    const a = combined(s, "p2", anySpirit[0]!.cardId, anyBrave[0]!.cardId)
    const b = combined(s, "p2", anySpirit[1]!.cardId, anyBrave[0]!.cardId)
    resolveAction(s, "p1", null, { type: "destroyBrave", allHosts: true })
    assert(s.players.p2.field.combinedBraves.length === 0, "すべての合体スピリットからブレイヴが外れる")
    assert(s.players.p2.trashCards.length === 2, "2つともトラッシュへ")
    assert(s.players.p2.field.spirits.length === 2, "ホストは2体とも残る")
    assert(a.host.braveRefs === undefined && b.host.braveRefs === undefined, "参照はどちらも切れている")
}

console.log("=== §C 対話：どの合体スピリットのブレイヴを壊すかを選ぶ ===")
{
    const s = game(true)
    const a = combined(s, "p2", anySpirit[0]!.cardId, anyBrave[0]!.cardId)
    const b = combined(s, "p2", anySpirit[1]!.cardId, anyBrave[0]!.cardId)
    resolveAction(s, "p1", null, { type: "destroyBrave" })
    assert(s.pendingChoice?.kind === "target", "対象の選択待ちが立つ")
    assert(s.pendingChoice?.candidates.length === 2, "候補は合体スピリット2体")
    assert(s.pendingChoice?.pid === "p1", "選ぶのは効果の使用者")
    // 2体目を選ぶ
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b.host.instanceId }) === null, "2体目を選ぶ")
    assert(b.host.braveRefs === undefined, "選んだ側のブレイヴが壊れる")
    assert((a.host.braveRefs ?? []).length === 1, "選ばなかった側は残る")
}

console.log("=== §D 合体しているスピリットがいなければ何も起きない ===")
{
    const s = game(false)
    const lone = createInstance(anySpirit[0]!.cardId, s.turn, 1)
    s.players.p2.field.spirits.push(lone)
    resolveAction(s, "p1", null, { type: "destroyBrave" })
    assert(s.players.p2.field.spirits.length === 1, "スピリットは無傷")
    assert(s.players.p2.trashCards.length === 0, "何もトラッシュに行かない")
}

console.log("すべてのチェックに合格しました 🎉（part272）")
