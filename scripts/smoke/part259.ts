// smoke パート259（ブレイヴの召喚方法を選ばせるための共有判定。2026-08-28）
//
// クライアントは手札のブレイヴをクリックしたとき「スピリット状態で召喚」と
// 「合体した状態で召喚（ダイレクトブレイヴ）」を毎回選ばせる（2026-08-28 ユーザー指示）。
// その合体先の候補列挙 braveCombineCandidates が、サーバーの validateSummon と
// **同じ条件**で絞れているかを見る（片方だけ緩いと「ボタンが出るのにサーバーが弾く」が起きる）。
//
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { matchesBraveCondition } from "../../shared/rules"
import { braveCombineCandidates, isSummonableCardType } from "../../shared/summon"

const BRAVES = ALL_CARDS.filter((c) => c.type === "brave")
assert(BRAVES.length > 0, "テスト前提: ブレイヴカードがカードデータに存在する")

function base(): GameState {
    const s = createGame("brave-summon-choice", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    return s
}

console.log("=== 召喚で場に出せるカード種別：ブレイヴはスピリットと同じ扱い ===")
{
    assert(isSummonableCardType("spirit"), "スピリットは召喚できる")
    assert(isSummonableCardType("brave"), "ブレイヴは単体で召喚できる（スピリットとして扱われる）")
    assert(!isSummonableCardType("nexus"), "ネクサスは召喚ではない")
    assert(!isSummonableCardType("magic"), "マジックは召喚ではない")
}

// 合体条件を満たすホストと、満たさないホストを実カードから機械的に選ぶ
const brave = BRAVES.find((b) => {
    const cond = b.braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    return terms.length > 0
})
assert(brave !== undefined, "合体条件を持つブレイヴが1枚以上ある")
const braveId = brave!.cardId

console.log("=== 合体先の候補：条件を満たすスピリットだけが出る ===")
{
    const s = base()
    // 条件を満たすホストを探す（実際に matchesBraveCondition が true になるものを使う）
    let okHostId: string | undefined
    let ngHostId: string | undefined
    for (const c of ALL_CARDS) {
        if (c.type !== "spirit" || c.levels.length === 0) continue
        const probe = createInstance(c.cardId, s.turn, c.levels[0]!.cores)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, braveId)) {
            if (okHostId === undefined) okHostId = c.cardId
        } else if (ngHostId === undefined) {
            ngHostId = c.cardId
        }
        if (okHostId !== undefined && ngHostId !== undefined) break
    }
    assert(okHostId !== undefined, `${getCard(braveId).name} の合体条件を満たすスピリットがカードデータにある`)
    assert(ngHostId !== undefined, `${getCard(braveId).name} の合体条件を満たさないスピリットがカードデータにある`)

    const okCard = getCard(okHostId!)
    const ngCard = getCard(ngHostId!)
    const okHost = createInstance(okCard.cardId, s.turn, okCard.levels[0]!.cores)
    const ngHost = createInstance(ngCard.cardId, s.turn, ngCard.levels[0]!.cores)
    s.players.p1.field.spirits = [okHost, ngHost]
    refreshLevelAsOverrides(s)

    const cands = braveCombineCandidates(s, "p1", braveId)
    assert(cands.includes(okHost.instanceId), "合体条件を満たすスピリットは候補に出る")
    assert(!cands.includes(ngHost.instanceId), "合体条件を満たさないスピリットは候補に出ない")
}

console.log("=== 既にブレイヴが合体しているスピリットは候補から外れる ===")
{
    const s = base()
    let okHostId: string | undefined
    for (const c of ALL_CARDS) {
        if (c.type !== "spirit" || c.levels.length === 0) continue
        const probe = createInstance(c.cardId, s.turn, c.levels[0]!.cores)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, braveId)) { okHostId = c.cardId; break }
    }
    assert(okHostId !== undefined, "合体条件を満たすスピリットが見つかる")
    const okCard = getCard(okHostId!)
    const host = createInstance(okCard.cardId, s.turn, okCard.levels[0]!.cores)
    s.players.p1.field.spirits = [host]
    refreshLevelAsOverrides(s)
    assert(braveCombineCandidates(s, "p1", braveId).includes(host.instanceId),
        "前提：合体前は候補に出る")

    // 既に別のブレイヴが合体している状態にする（サーバーの validateSummon と同じ拒否理由）
    const other = createInstance(braveId, s.turn, 0)
    other.braveCombined = true
    s.players.p1.field.combinedBraves.push(other)
    host.braveRefs = [{ slot: "single", instanceId: other.instanceId }]
    assert(!braveCombineCandidates(s, "p1", braveId).includes(host.instanceId),
        "既にブレイヴが合体しているスピリットは候補から外れる")
}

console.log("=== ブレイヴ以外のカードでは候補が空 ===")
{
    const s = base()
    const spiritCard = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const host = createInstance(spiritCard.cardId, s.turn, spiritCard.levels[0]!.cores)
    s.players.p1.field.spirits = [host]
    refreshLevelAsOverrides(s)
    assert(braveCombineCandidates(s, "p1", spiritCard.cardId).length === 0,
        "スピリットカードを渡しても合体先は列挙しない")
}

console.log("すべてのチェックに合格しました 🎉（part259）")
