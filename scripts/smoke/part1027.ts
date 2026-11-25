// smoke パート1027（#631 destroyBrave の allBraves・filter・破壊数の記録。GX16 ブレイヴドミネーション・PB13-01 魔犬ゼロ Lv2）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance, EffectAction } from "../../server/src/type"

const GX16 = "GX16" // ブレイヴドミネーション（紫マジック・コスト6）
const PB13 = "PB13-01" // 魔犬ゼロ（紫・コスト5）
const VAN = "BS01-002" // ロクケラトプス
const X015 = "X015" // 放浪者ロロ（このスピリット以外の一切の効果を受けない）
const HOST = "SD01-007" // スティラホーン（赤・コスト5・効果なし）。ブレイヴの合体条件コスト4以上を満たす
const PANDA = "BS21-063" // ぐるみパンダ（黄ブレイヴ・コスト4）
const PTERA = "BS21-056" // プテラノストーン（ブレイヴ・コスト5）
const EAGLE = "BS21-055" // ゴルニック・イーグル（ブレイヴ・コスト3）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk: [string, string, string, number][] = [
        [GX16, "ブレイヴドミネーション", "magic", 6], [PB13, "魔犬ゼロ", "spirit", 5], [X015, "放浪者ロロ", "spirit", 6],
        [PANDA, "ぐるみパンダ", "brave", 4], [PTERA, "プテラノストーン", "brave", 5], [EAGLE, "ゴルニック・イーグル", "brave", 3],
    ]
    for (const [id, name, type, cost] of chk) assert(getCard(id).name === name && getCard(id).type === type && getCard(id).cost === cost, `${id} は ${name}（${type}・コスト${cost}）`)
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VAN)
    s.players.p2.deck = Array.from({ length: 40 }, () => VAN)
    return s
}
// 相手（p2）の合体スピリット：ホストにブレイヴを合体させる
function hostWith(s: GameState, host: string, braves: string[]): CardInstance {
    const h = createInstance(host, s.turn - 1, 3)
    s.players.p2.field.spirits.push(h)
    h.braveRefs = braves.map((b, i) => {
        const inst = createInstance(b, s.turn - 1, 0)
        inst.braveCombined = true
        s.players.p2.field.combinedBraves.push(inst)
        return { slot: i === 0 ? "single" : "double", instanceId: inst.instanceId } as never
    })
    refreshLevelAsOverrides(s)
    return h
}
const gx16 = (): EffectAction => (getCard(GX16).effects!.find((e) => e.id === "GX16-e1") as { action: EffectAction }).action

console.log("=== 1. GX16：2体の合体スピリットのブレイヴが同時に破壊され、破壊した数だけ相手のライフのコアがボイドへ ===")
{
    const s = game("gx16-1")
    const a = hostWith(s, HOST, [PANDA, PTERA])
    const b = hostWith(s, HOST, [EAGLE])
    s.players.p2.life = 5
    const lifeBefore = s.players.p2.life
    resolveAction(s, "p1", null, gx16(), undefined, undefined, "magic")
    assert(s.players.p2.field.combinedBraves.length === 0, "相手のブレイヴはすべて破壊された")
    assert(a.braveRefs === undefined && b.braveRefs === undefined && s.players.p2.field.spirits.length === 2, "ホストは場に残る")
    assert(lifeBefore - s.players.p2.life === 3, `ブレイヴ3つにつきライフ3減る（実際 ${lifeBefore - s.players.p2.life}）`)
}

console.log("=== 2. GX16：効果を受けないホストのブレイヴは破壊されず、数えない ===")
{
    const s = game("gx16-2")
    hostWith(s, HOST, [PANDA])
    const x = hostWith(s, X015, [EAGLE])
    s.players.p2.life = 5
    resolveAction(s, "p1", null, gx16(), undefined, undefined, "magic")
    assert(s.players.p2.field.combinedBraves.length === 1 && x.braveRefs?.length === 1, "X015 のブレイヴは残る")
    assert(s.players.p2.life === 4, `ライフは1だけ減る（実際 ${s.players.p2.life}）`)
}

console.log("=== 3. GX16：ライフが0になれば勝ち ===")
{
    const s = game("gx16-3")
    hostWith(s, HOST, [PANDA, PTERA])
    s.players.p2.life = 2
    resolveAction(s, "p1", null, gx16(), undefined, undefined, "magic")
    assert(s.players.p2.life === 0 && s.winner === "p1", `ライフ0で p1 の勝ち（life ${s.players.p2.life}・winner ${s.winner}）`)
}

console.log("=== 4. GX16：ブレイヴがいなければ何も起きない（前の破壊数が残らない） ===")
{
    const s = game("gx16-4")
    s.players.p2.field.spirits.push(createInstance(VAN, s.turn - 1, 1))
    s.players.p2.life = 5
    resolveAction(s, "p1", null, gx16(), undefined, undefined, "magic")
    assert(s.players.p2.life === 5, "ライフは減らない")
}

console.log("=== 5. PB13-01：Lv2 のアタックでコスト4以下のブレイヴだけが対象（コスト5は不可）。Lv1 では起きない ===")
{
    for (const [label, cores, expect] of [["Lv2", 3, "pass"], ["Lv1", 1, "none"]] as const) {
        const s = game(`pb13-${label}`)
        const me = createInstance(PB13, s.turn - 1, cores)
        s.players.p1.field.spirits.push(me)
        const h = hostWith(s, HOST, [PTERA])
        const h2 = hostWith(s, HOST, [PANDA])
        refreshLevelAsOverrides(s)
        assert(act(s, "p1", { type: "nextPhase" }) === null, `${label}：アタックステップへ`)
        assert(act(s, "p1", { type: "attack", instanceId: me.instanceId }) === null, `${label}：アタック`)
        const left = s.players.p2.field.combinedBraves.map((b) => b.cardId)
        if (expect === "pass") {
            assert(!left.includes(PANDA) && left.includes(PTERA), `Lv2：コスト4のパンダだけ破壊・コスト5は残る（残り ${left}）`)
            assert(h.braveRefs?.length === 1 && h2.braveRefs === undefined, "ホストは残り、対象のホストのブレイヴだけ外れた")
        } else {
            assert(left.length === 2, `Lv1：何も破壊されない（残り ${left}）`)
        }
    }
}
console.log("=== 6. 1つのホストに対象のブレイヴが2つなら使用者が選ぶ（非対話は先頭を自動） ===")
{
    const act6: EffectAction = { type: "destroyBrave", filter: { cost: { max: 4 } } }
    const s = game("pb13-choose")
    s.interactiveTargets = true
    hostWith(s, HOST, [PANDA, EAGLE])
    resolveAction(s, "p1", null, act6, undefined, undefined, "magic")
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p1" && pc.kind === "target" && pc.candidates.length === 2, "使用者 p1 が2つのブレイヴから選ぶ")
    assert(s.players.p2.field.combinedBraves.length === 2, "選ぶまで破壊されない")
    const pick = s.players.p2.field.combinedBraves.find((b) => b.cardId === EAGLE)!
    assert(act(s, "p1", { type: "resolveChoice", instanceId: pick.instanceId }) === null, "選ぶ")
    assert(s.players.p2.field.combinedBraves.map((b) => b.cardId).join() === PANDA, "選んだイーグルだけ破壊された")
    const s2 = game("pb13-auto")
    hostWith(s2, HOST, [PANDA, EAGLE])
    resolveAction(s2, "p1", null, act6, undefined, undefined, "magic")
    assert(s2.pendingChoice === null && s2.players.p2.field.combinedBraves.length === 1, "非対話は自動で1つ")
}
console.log("すべてのチェックに合格しました 🎉（part1027）")
