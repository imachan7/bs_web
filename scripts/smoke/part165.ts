// smoke パート165（BS04-081 強者統べる大地Lv2：ブロックされないスピリットを自分で選ぶ）
//
// 「BP10000以上の自分のスピリット1体を指定する」を、実効BP最大の自動選択から
// pendingChoice による選択へ移した（UI担当からの依頼 chatbox 2026-08-10-1610）。
// 非対話（interactiveTargets が false ＝ smoke の既定）では従来どおり自動選択のままなので、
// **両方の経路**を見る。
//
// 同じ依頼にあった BS04-079 王蛇の住処Lv2 は調べたら既に選択式だったので、ここでは
// 「選択が出ること」だけを確認している（card-notes の記述のほうが古かった）。
import { act, assert, createGame, createInstance, effectiveBp, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireStepTriggers } from "../../server/src/logic/EffectModules"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): void {
    s.players[pid].field.nexuses.push(createInstance(cardId, s.turn, cores))
}
const unblockable = (s: GameState, id: string): boolean =>
    s.players.p1.field.spirits.find((x) => x.instanceId === id)?.unblockableOnceThisTurn === true

console.log("=== 対話モード：BP10000以上が2体いれば選択になる ===")
{
    const s = createGame("bs04-081-choice", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    s.interactiveTargets = true
    putNexus(s, "p1", "BS04-081", 3) // 強者統べる大地 Lv2
    // キングタウロス大公 Lv3（コア9）＝BP12000。2体置いてどちらを指定するか選ばせる
    const a = putSpirit(s, "p1", "BS01-X03", 9)
    const b = putSpirit(s, "p1", "BS01-X03", 9)
    assert(effectiveBp(s, "p1", s.players.p1.field.spirits[0]!) >= 10000, "前提：BP10000以上である")

    s.phase = "attack"
    fireStepTriggers(s, "attack")
    assert(s.pendingChoice !== null, "選択待ちになる")
    assert(s.pendingChoice?.candidates?.length === 2, "候補は2体")
    assert(!unblockable(s, a) && !unblockable(s, b), "選ぶ前はどちらにも印が付いていない")

    // 2体目（自動選択なら選ばれないとは限らないが、明示指定が効くことを見る）を選ぶ
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b }) === null, "2体目を選択")
    assert(s.pendingChoice === null, "選択待ちが解ける")
    assert(unblockable(s, b) === true, "選んだスピリットに印が付く")
    assert(unblockable(s, a) === false, "選ばなかったほうには付かない")
}

console.log("=== 候補が1体だけなら選択を挟まない ===")
{
    const s = createGame("bs04-081-single", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    s.interactiveTargets = true
    putNexus(s, "p1", "BS04-081", 3)
    const only = putSpirit(s, "p1", "BS01-X03", 9)
    putSpirit(s, "p1", "BS01-050", 1) // ビートビートル（BP10000未満なので候補外）

    s.phase = "attack"
    fireStepTriggers(s, "attack")
    assert(s.pendingChoice === null, "候補1体なら選択待ちにならない")
    assert(unblockable(s, only) === true, "その1体に印が付く")
}

console.log("=== 非対話（smokeの既定）では従来どおり自動選択 ===")
{
    const s = createGame("bs04-081-auto", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    putNexus(s, "p1", "BS04-081", 3)
    const weak = putSpirit(s, "p1", "BS01-X03", 9) // BP12000
    const strong = putSpirit(s, "p1", "BS01-X03", 9)
    // 片方だけ実効BPを上げて「BP最大が選ばれる」ことを見る
    s.players.p1.field.spirits.find((x) => x.instanceId === strong)!.tempBpBuff = 3000

    s.phase = "attack"
    fireStepTriggers(s, "attack")
    assert(s.pendingChoice === null, "非対話では選択待ちにならない")
    assert(unblockable(s, strong) === true, "実効BP最大のほうに印が付く")
    assert(unblockable(s, weak) === false, "もう一方には付かない")
}

console.log("=== BP10000以上が1体もいなければ不発 ===")
{
    const s = createGame("bs04-081-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    s.interactiveTargets = true
    putNexus(s, "p1", "BS04-081", 3)
    const small = putSpirit(s, "p1", "BS01-050", 1)

    s.phase = "attack"
    fireStepTriggers(s, "attack")
    assert(s.pendingChoice === null, "選択待ちにならない")
    assert(unblockable(s, small) === false, "印は付かない")
}

console.log("=== BS04-079 王蛇の住処Lv2：相手のスピリットを選ばせている（既存の確認） ===")
{
    const s = createGame("bs04-079-choice", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    putNexus(s, "p1", "BS04-079", 3) // 王蛇の住処 Lv2
    putSpirit(s, "p1", "BS01-034", 1) // バイ・パイソン（系統「妖蛇」＝取り除くコア数のカウンタ）
    const targets = [0, 1, 2].map(() => putSpirit(s, "p2", "BS01-031", 3))

    s.phase = "start"
    fireStepTriggers(s, "start")
    assert(s.pendingChoice !== null, "選択待ちになる")
    assert(s.pendingChoice?.candidates?.length === 3, "相手のスピリット3体が候補")

    const pick = targets[1]!
    assert(act(s, "p1", { type: "resolveChoice", instanceId: pick }) === null, "2体目を選択")
    const picked = s.players.p2.field.spirits.find((x) => x.instanceId === pick)!
    assert(picked.cores === 2, "選んだスピリットからコアが1個取り除かれる（妖蛇1体ぶん）")
    assert(
        s.players.p2.field.spirits.filter((x) => x.cores === 3).length === 2,
        "選ばなかった2体は減っていない",
    )
}
