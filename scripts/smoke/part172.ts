// smoke パート172（BS08-012 ダークスカルデーモンLv2-3：コアを置くスピリットは「相手が」選ぶ）
//
// card-notes と実装の突き合わせ（2026-08-11）で見つかったズレ。
// 効果文は「BP6000以下の相手のスピリットがアタックしたとき、**相手は**、
// 相手のスピリット上のコア1個を相手のトラッシュに置く」＝**選ぶのはアタックした側**。
// ところが実装は coreToTrashSelf で「アタックしたスピリット自身」から必ず1個落としていた。
// アタック中にLvが下がる（＝BPが落ちる／維持コア割れで消滅する）ため、印刷されたカードより強かった。
//
// 直し方は BS07ブリシンガメンの首飾り（returnToDeckTop.chooserIsTarget）と同型で、
// coreToOpponentTrashChoice に chooserIsTarget と spiritsOnly を足した。
// あわせて fieldEvent 側に selfMode:"source" を足している：
// anySpiritAttacked は selfOverride にアタックしたスピリットを渡すため、そのままだと
// resolveAction の owner がアタック側になり、「相手」の向きが逆さまになる。
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

interface Setup {
    s: GameState
    attackerId: string
    otherId: string
}
// p1（非ターンプレイヤー）にダークスカルデーモンLv2、p2 に BP6000以下のアタッカーと別のスピリット
function setup(seed: string, opts: { nexus?: boolean; onlyAttacker?: boolean } = {}): Setup {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.field.spirits.push(createInstance("BS08-012", s.turn, 2))
    s.turnPlayer = "p2"
    s.phase = "attack"
    const attacker = createInstance("BS02-014", s.turn, 2) // ファンタズマ Lv2（コア2個）
    s.players.p2.field.spirits.push(attacker)
    let otherId = ""
    if (!opts.onlyAttacker) {
        const other = createInstance("BS02-014", s.turn, 3)
        s.players.p2.field.spirits.push(other)
        otherId = other.instanceId
    }
    if (opts.nexus) {
        const nexus = createInstance("BS06-080", s.turn, 1)
        nexus.cores = 3
        s.players.p2.field.nexuses.push(nexus)
    }
    return { s, attackerId: attacker.instanceId, otherId }
}
function coresOf(s: GameState, instanceId: string): number {
    return s.players.p2.field.spirits.find((x) => x.instanceId === instanceId)?.cores ?? -1
}

console.log("=== コアを置くスピリットを選ぶのは「アタックした側」 ===")
{
    const { s, attackerId, otherId } = setup("darkskull-chooser")
    assert(act(s, "p2", { type: "attack", instanceId: attackerId }) === null, "BP6000以下でアタック")
    assert(s.pendingChoice !== null, "選択待ちになる")
    assert(s.pendingChoice?.pid === "p2", "選ぶのはコアを置く側（p2）")
    assert(s.pendingChoice?.actorPid === "p1", "解決は発生源の持ち主（p1）の効果として行う")
    assert(s.pendingChoice?.candidates.length === 2, "p2のスピリット2体が候補")

    // アタッカー以外を選べる＝アタック中にLvが下がらずに済む
    assert(act(s, "p2", { type: "resolveChoice", instanceId: otherId }) === null, "p2がアタッカー以外を選ぶ")
    assert(coresOf(s, attackerId) === 2, "アタッカーのコアは減らない")
    assert(coresOf(s, otherId) === 2, "選ばれた側のコアが1個減る")
    assert(s.players.p2.trashCores === 1, "コアはp2のトラッシュへ")
    assert(s.battle !== null && s.battle !== undefined, "アタックはそのまま続く")
}

console.log("=== 発生源の持ち主は選べない ===")
{
    const { s, attackerId, otherId } = setup("darkskull-not-owner")
    assert(act(s, "p2", { type: "attack", instanceId: attackerId }) === null, "アタック")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: otherId }) !== null, "p1が選ぼうとしても拒否される")
}

console.log("=== ネクサスは候補にならない（spiritsOnly） ===")
{
    const { s, attackerId } = setup("darkskull-spirits-only", { nexus: true })
    assert(act(s, "p2", { type: "attack", instanceId: attackerId }) === null, "アタック")
    assert(s.pendingChoice?.candidates.length === 2, "候補はスピリット2体だけ（ネクサスを含まない）")
    const nexusCores = s.players.p2.field.nexuses[0]?.cores
    assert(nexusCores === 3, "ネクサス上のコアは減らない")
}

console.log("=== 候補が1体なら選択を挟まず、そのスピリットから落ちる ===")
{
    const { s, attackerId } = setup("darkskull-single", { onlyAttacker: true })
    assert(act(s, "p2", { type: "attack", instanceId: attackerId }) === null, "アタック")
    assert(s.pendingChoice === null, "候補が1体なので選択待ちにならない")
    assert(coresOf(s, attackerId) === 1, "唯一の候補＝アタッカーからコアが1個落ちる")
    assert(s.players.p2.trashCores === 1, "コアはp2のトラッシュへ")
}
