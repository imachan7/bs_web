// smoke パート268（ブレイヴ 段階5：ホストが場を離れるときの「残す／コアを置く」。BRAVE.md §6.3）
//
// §1.4「自分のフィールド/リザーブから Lv1の維持コスト以上の数のコアを置くことで、
// スピリット状態のブレイヴとしてフィールドに残すことができる」。
// これまでは**リザーブから自動で払って必ず残す**簡略化だった。§6.3 の確定（2026-08-24：
// コアの置き方はプレイヤーに選ばせる。簡略化しない）を実装した。
//
// 新設した機構:
//   - CardInstance.pendingBraveKeep（server/src/type.ts）：確認待ちの暫定状態。
//     **破壊処理の途中では中断できない**ので、ブレイヴをコア0個のまま field.spirits に置いて印を立て、
//     アクションを解決しきった安全な地点（GameEngine の requestPendingBraveKeep）で確認を出す。
//     破壊待機（pendingDestruction）と同じ形
//   - PendingChoice.braveKeepConfirm：**action は解決しない**特殊な選択待ち（reviveConfirm と同型）
//   - PayingState.braveKeepNeed / braveKeepOption（public/src/renderer.ts）：支払いモードの
//     **3つ目の起点**。カードではなく「場のブレイヴに置くコア」を起点にする（§6.3 の「足りない部品」）
//
// ⚠️ 破壊は destroySpirit の直呼びでなく**実際のバトル**で起こす。直呼びでは GameEngine の
//    事後フック（確認を出す地点）を通らず、「印は立つが誰にも聞かれない」を見逃す。
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { matchesBraveCondition } from "../../shared/rules"
import { detachBravesOnLeave } from "../../server/src/logic/removal"

// 合体条件を持つブレイヴと、それを満たすホストを実データから探す（part263/267 と同じ手法）
const braveCard = ALL_CARDS.find((c) => {
    if (c.type !== "brave") return false
    const cond = c.braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    return terms.length > 0 && c.levels.length > 0 && c.levels[0]!.cores >= 1
})
assert(braveCard !== undefined, "テスト前提：合体条件を持ち、Lv1維持コアが1個以上のブレイヴがある")
const BRAVE = braveCard!.cardId
const NEED = braveCard!.levels[0]!.cores

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function findHost(): string {
    for (const c of ALL_CARDS) {
        if (c.type !== "spirit" || c.levels.length === 0) continue
        const probe = createInstance(c.cardId, 3, c.levels[0]!.cores)
        const s = base("host-probe", false)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, BRAVE)) return c.cardId
    }
    throw new Error("合体条件を満たすホストが見つからない")
}
const HOST = findHost()

console.log("=== テスト前提の機械確認 ===")
{
    assert(getCard(BRAVE).type === "brave", `${BRAVE} はブレイヴ`)
    assert(NEED >= 1, "ブレイヴのLv1維持コアは1個以上（0個だと「置けない」場合が作れない）")
    assert(getCard(HOST).type === "spirit", `${HOST} はスピリット`)
}

// p1 の合体スピリットがアタックし、p2 の大きいスピリットにブロックされて破壊されるところまで進める。
// ブロッカーは実データから「合体スピリットより実効BPが高い」ものを選ぶ
const blockerCard = ALL_CARDS.filter((c) => c.type === "spirit" && c.levels.length > 0).sort(
    (a, b) => (b.levels[0]?.bp ?? 0) - (a.levels[0]?.bp ?? 0),
)[0]
assert(blockerCard !== undefined, "テスト前提：スピリットが1枚以上ある")

// donorCores を渡すと、破壊が起きる前に「支払い元になるスピリット」を場へ置く
function setupBattle(seed: string, interactive: boolean, reserveAtDestroy: number, donorCores = 0): GameState {
    const s = base(seed, interactive)
    const host = createInstance(HOST, s.turn, getCard(HOST).levels[0]!.cores)
    s.players.p1.field.spirits.push(host)
    s.players.p1.hand = [BRAVE]
    // ダイレクトブレイヴで合体させる（維持コアは置かない。§5）
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, "ダイレクトブレイヴで合体できる")
    const blocker = createInstance(blockerCard!.cardId, s.turn, blockerCard!.levels[0]!.cores)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ進める")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    // ブロッカーの方が実効BPで勝つ前提を機械確認する（勝たないとホストが破壊されず、検査にならない）
    assert(
        effectiveBp(s, "p2", blocker) > effectiveBp(s, "p1", host),
        `ブロッカーの実効BP（${effectiveBp(s, "p2", blocker)}）が合体スピリット（${effectiveBp(s, "p1", host)}）を上回る`,
    )
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "大きいスピリットでブロックできる")
    // ⚠️ リザーブは**破壊が起きる前**に決める（残せるかの判定は破壊処理の中で行うため、
    //    バトル解決の後に書き換えても効かない）
    s.players.p1.reserve = reserveAtDestroy
    if (donorCores > 0) {
        s.players.p1.field.spirits.push(createInstance(HOST, s.turn, donorCores))
        refreshLevelAsOverrides(s)
    }
    // ブロック後のフラッシュを閉じるとBPを比べて合体スピリットが破壊される
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    return s
}

console.log("=== 対話：ホストが破壊されると「残しますか」の確認が出る（自動では残さない） ===")
{
    const s = setupBattle("keep-ask", true, 20)
    assert(s.pendingChoice?.braveKeepConfirm !== undefined, "ブレイヴを残すかの確認待ちになる")
    assert(s.pendingChoice?.pid === "p1", "聞くのはブレイヴの持ち主")
    assert(s.pendingChoice?.confirm === true, "任意なので確認式（選ばなければ残さない）")
    assert(s.pendingChoice?.braveKeepConfirm?.need === NEED, `必要なコア数はスピリット状態のLv1維持コスト（${NEED}個）`)
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave !== undefined, "確認中のブレイヴは場に置かれている（バトルを引き継ぐため）")
    assert(brave?.cores === 0, "確認が済むまでコアは置かれていない")
}

console.log("=== 対話：「残す」を選ぶとリザーブからコアを置いて残る ===")
{
    const s = setupBattle("keep-yes", true, 20)
    const before = s.players.p1.reserve
    assert(act(s, "p1", { type: "resolveChoice", option: "残す" }) === null, "「残す」を選べる")
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave !== undefined, "ブレイヴはスピリット状態で場に残る")
    assert(brave?.cores === NEED, "Lv1維持コスト分のコアが置かれる")
    assert(brave?.pendingBraveKeep === undefined, "確認待ちの印は消える")
    assert(s.players.p1.reserve === before - NEED, "置いた分だけリザーブが減る")
    assert(!s.players.p1.trashCards.includes(BRAVE), "トラッシュには行かない")
    assert(s.pendingChoice === null, "選択待ちは残らない")
}

console.log("=== 対話：選ばなければ合体元と一緒にトラッシュへ行く（残さない選択が取れる） ===")
{
    const s = setupBattle("keep-no", true, 20)
    const before = s.players.p1.reserve
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ（残さない）を選べる")
    assert(!s.players.p1.field.spirits.some((sp) => sp.cardId === BRAVE), "ブレイヴは場に残らない")
    assert(s.players.p1.trashCards.includes(BRAVE), "合体元と一緒にトラッシュへ置かれる")
    assert(s.players.p1.reserve === before, "残さないならリザーブは減らない")
    assert(s.pendingChoice === null, "選択待ちは残らない")
}

console.log("=== 対話：リザーブが足りなければフィールドのコアで払える（§6.3 の3つ目の起点） ===")
{
    // リザーブを0にしても、フィールドのコアで払えるなら確認は出る
    const s = setupBattle("keep-pay-field", true, 0, 3)
    const donor = s.players.p1.field.spirits.find((sp) => sp.cardId === HOST && sp.cores === 3)
    assert(donor !== undefined, "支払い元のスピリットが場にいる")
    assert(s.pendingChoice?.braveKeepConfirm !== undefined, "リザーブが0でもフィールドで払えるなら確認が出る")

    assert(
        act(s, "p1", { type: "resolveChoice", option: "残す", paySources: [{ instanceId: donor!.instanceId, count: NEED }] }) === null,
        "フィールドのコアを指定して「残す」を選べる",
    )
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave?.cores === NEED, "リザーブ＋フィールドの合計でLv1維持コストが置かれる")
    assert(donor!.cores === 3 - NEED, "指定したスピリットから置いた分だけコアが減る")
    // 破壊されたホストのコアはリザーブへ戻るので、リザーブは0のままにはならない。
    // 見るべきは「フィールドから払ったぶんはリザーブから引かれていない」こと
    assert(s.players.p1.reserve === getCard(HOST).levels[0]!.cores, "フィールドで払ったのでリザーブは減らない（戻ったホストのコアがそのまま残る）")
}

console.log("=== どう払っても足りないブレイヴには確認を出さず、そのままトラッシュへ ===")
{
    // ⚠️ 実データのブレイヴはLv1維持コアが1個で、ホストは必ず1個以上コアを持つ（そのコアはリザーブへ戻る）。
    //    つまりバトル経由ではこの場合を作れないので、ここだけ detachBravesOnLeave を直接呼んで作る
    //    （コアを全部失って消滅するホスト＝リザーブも0）
    const s = base("keep-unpayable", true)
    const host = createInstance(HOST, s.turn, getCard(HOST).levels[0]!.cores)
    s.players.p1.field.spirits.push(host)
    s.players.p1.hand = [BRAVE]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, "ダイレクトブレイヴで合体できる")
    s.players.p1.reserve = 0
    host.cores = 0 // コアを全部失った状態（維持コア割れの消滅と同じ）
    detachBravesOnLeave(s, "p1", host)
    assert(s.players.p1.field.spirits.every((sp) => sp.pendingBraveKeep === undefined), "残せないなら確認待ちの印を立てない")
    assert(!s.players.p1.field.spirits.some((sp) => sp.cardId === BRAVE), "ブレイヴは場に残らない")
    assert(s.players.p1.trashCards.includes(BRAVE), "合体元と一緒にトラッシュへ置かれる")
}

console.log("=== 非対話（テスト・AI）は従来どおりリザーブから自動で払って残す ===")
{
    const s = setupBattle("keep-auto", false, 20)
    assert(s.pendingChoice === null, "非対話では確認を出さない")
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave?.cores === NEED, "リザーブから自動でLv1維持コストが置かれる")
    assert(brave?.pendingBraveKeep === undefined, "確認待ちの印は付かない")
}
