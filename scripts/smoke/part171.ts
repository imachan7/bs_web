// smoke パート171（BS07-062 ブリシンガメンの首飾りLv1-2：戻す3体は「相手が」選ぶ）
//
// card-notes と実装の突き合わせ（2026-08-10）で見つかったズレ。
// 効果文は「自分のネクサスが相手の効果で破壊されたとき、**相手は**、相手のスピリット3体を
// デッキの上に好きな順番で戻す」＝**選ぶのは戻される側**。
// ところが実装は発生源の持ち主（＝ネクサスを壊された側）が選んでいた。
// 相手の場から都合の良い3体を選べてしまうため、印刷されたカードより強い状態だった。
//
// 【暴風】の chooserIsTarget と同じ形で、選択者だけを相手に変える
// （解決自体は発生源の持ち主の効果として行う＝PendingChoice.actorPid）。
//
// **そして、この確認の過程でもっと大きな穴が見つかった**：
// fireFieldEventTriggers は effectSources（＝いま場にあるもの）だけを走査するので、
// 「自分のネクサスが破壊されたとき」を**そのネクサス自身**が持っている場合、
// 破壊された時点で場から消えていて無言で発火しなかった。BS07の各色ネクサス6枚が該当し、
// 「他のネクサスが壊れたときは動くが、自分が壊れたときは動かない」半分だけの状態だった。
// destroyNexus が破壊されたインスタンスを extraSources として渡すようにして直した。
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { destroyNexus } from "../../server/src/logic/removal"

function setup(seed: string, interactive: boolean): { s: GameState; nexusId: string } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    const nexus = createInstance("BS07-062", s.turn, 2) // ブリシンガメンの首飾り Lv2
    s.players.p1.field.nexuses.push(nexus)
    for (let i = 0; i < 4; i++) s.players.p2.field.spirits.push(createInstance("BS02-014", s.turn, 1))
    return { s, nexusId: nexus.instanceId }
}
// 相手（p2）のスピリットの効果で p1 のネクサスを壊す（byOpponentEffectOnly を満たす）
function destroyByOpponent(s: GameState, nexusId: string): void {
    destroyNexus(s, "p1", nexusId, { sourcePid: "p2", sourceType: "spirit" })
}

console.log("=== 戻す対象を選ぶのは「相手」（戻される側） ===")
{
    const { s, nexusId } = setup("brisingamen-chooser", true)
    destroyByOpponent(s, nexusId)
    assert(s.pendingChoice !== null, "選択待ちになる")
    assert(s.pendingChoice?.pid === "p2", "選ぶのは戻される側（p2）")
    assert(s.pendingChoice?.actorPid === "p1", "解決は発生源の持ち主（p1）の効果として行う")
    assert(s.pendingChoice?.candidates.length === 4, "相手のスピリット4体が候補")

    // 相手が自分で選んだ1体が戻る
    const pick = s.pendingChoice?.candidates[0] ?? ""
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p2", { type: "resolveChoice", instanceId: pick }) === null, "p2が選ぶ")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === pick),
        "選ばれたスピリットが場から離れる",
    )
    assert(s.players.p2.deck.length > deckBefore, "デッキに戻っている")
}

console.log("=== 発生源の持ち主は選べない ===")
{
    const { s, nexusId } = setup("brisingamen-not-owner", true)
    destroyByOpponent(s, nexusId)
    assert(s.pendingChoice !== null, "選択待ちになる")
    const pick = s.pendingChoice?.candidates[0] ?? ""
    assert(act(s, "p1", { type: "resolveChoice", instanceId: pick }) !== null, "p1が選ぼうとしても拒否される")
}

console.log("=== 非対話（smokeの既定）では従来どおり自動で進む ===")
{
    const { s, nexusId } = setup("brisingamen-auto", false)
    const before = s.players.p2.field.spirits.length
    destroyByOpponent(s, nexusId)
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(s.players.p2.field.spirits.length === before - 3, "3体がデッキに戻る")
}

console.log("=== 自分自身の破壊でも発火する（BS07の各色ネクサス6枚の回帰テスト） ===")
{
    // effectSources は場にあるものしか返さない。破壊されたネクサス自身が持つ
    // 「自分のネクサスが破壊されたとき」は、extraSources で渡さないと無言で発火しない
    const ids: [string, string][] = [
        ["BS07-056", "隕石落下地点"],
        ["BS07-057", "腐りゆく湖沼"],
        ["BS07-059", "大風車の丘"],
        ["BS07-062", "ブリシンガメンの首飾り"],
        ["BS07-063", "秘密の花園"],
        ["BS07-066", "蹴撃の戦場跡"],
    ]
    for (const [id, name] of ids) {
        const s = createGame(`self-destroy-${id}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "purple" })
        runTurnStart(s)
        const nx = createInstance(id, s.turn, 2)
        s.players.p1.field.nexuses.push(nx)
        for (let i = 0; i < 3; i++) s.players.p2.field.spirits.push(createInstance("BS02-014", s.turn, 1))
        const before = s.log.length
        destroyNexus(s, "p1", nx.instanceId, { sourcePid: "p2", sourceType: "spirit" })
        // ネクサス破壊のログ以外に何か起きていれば、効果が発揮されている
        const fired = s.log.slice(before).some((l) => !l.includes("（ネクサス）は破壊された"))
        assert(fired, `${name}：自分自身が破壊されたときも効果が発揮される`)
    }
}
