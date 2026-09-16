// smoke パート328（「ターンに1回」は、実際に発揮したときだけ消費する。2026-09-16 ユーザー確定）
//
// コストを払えず不発だった／「〜できる」の確認を断った場合は、その効果は発揮していないので
// 「ターンに1回」を消費しない（docs/design/RULES_BATSPI_WIKI.md）。
// 以前は条件に合致した時点で使用済みにしていたため、不発でも1回を失っていた。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireFieldEventTriggers } from "../../server/src/logic/triggers"
import { requestActivationConfirm } from "../../server/src/logic/EffectModules"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.turnPlayer = "p2" // 相手のアタックステップ
    s.phase = "attack"
    s.players.p1.life = 3
    return s
}

console.log("=== カードデータの機械確認 ===")
{
    assert(getCard("BS13-070").name === "星宿の障壁", "BS13-070 は星宿の障壁")
}

console.log("=== 星宿の障壁 Lv2：疲労していて払えなかった回は消費しない（fieldEvent） ===")
{
    const s = base("p328-barrier")
    s.interactiveTargets = false
    const barrier = createInstance("BS13-070", s.turn, 2) // Lv2
    s.players.p1.field.nexuses.push(barrier)
    refreshLevelAsOverrides(s)

    barrier.isRested = true // コスト（このネクサスを疲労させる）を払えない
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.life === 3, "払えないのでライフは増えない")
    assert(barrier.triggeredUsedTurn?.["BS13-070-e2"] === undefined, "不発なので「ターンに1回」は消費されていない")

    barrier.isRested = false // 回復した
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.life === 4, "同じターンの2回目は払えて、ボイドからライフに1個置く")
    assert((barrier.isRested as boolean) === true, "コストとして疲労した")
    assert(barrier.triggeredUsedTurn?.["BS13-070-e2"] === s.turn, "発揮したので消費された")

    barrier.isRested = false
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.life === 4, "3回目は「ターンに1回」で発揮しない")
}

console.log("=== 星宿の障壁 Lv2：払えた回は従来どおり1回で打ち止め（対照） ===")
{
    const s = base("p328-barrier-ctrl")
    s.interactiveTargets = false
    const barrier = createInstance("BS13-070", s.turn, 2)
    s.players.p1.field.nexuses.push(barrier)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.life === 4, "1回目は発揮する")
    barrier.isRested = false
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.life === 4, "2回目は発揮しない")
}

console.log("=== 「〜できる」の確認を断ったら消費しない／承認後に不発でも消費しない（誘発の確認経路） ===")
{
    // BS13-039 神獣バーロン【合体時】Lv3 と同じ形（triggered・oncePerTurn・optional、コストはライフ→リザーブ）。
    // 合体アタックのバトル終了まで組むのは重いので、fireTrigger が出す確認を直接立てて経路だけを見る
    const s = base("p328-confirm")
    s.interactiveTargets = true
    const src = createInstance("BS13-039", s.turn, 1)
    s.players.p1.field.spirits.push(src)
    const effectId = "BS13-039-e3"
    const action = { type: "refreshSelf" as const, costOwnLifeToReserve: 1 }

    // 断る
    src.triggeredUsedTurn = { [effectId]: s.turn }
    requestActivationConfirm(s, "p1", "発動しますか？", action, src, { instanceId: src.instanceId, effectId })
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "確認を断る")
    assert(src.triggeredUsedTurn?.[effectId] === undefined, "断ったので「ターンに1回」は消費されていない")

    // 承認したがコストを払えない（ライフ0）
    s.players.p1.life = 0
    src.isRested = true // 回復の対象にはなる状態で、コストだけ払えないようにする
    src.triggeredUsedTurn = { [effectId]: s.turn }
    requestActivationConfirm(s, "p1", "発動しますか？", action, src, { instanceId: src.instanceId, effectId })
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(src.triggeredUsedTurn?.[effectId] === undefined, "払えず不発だったので消費されていない")

    // 承認して払えた
    s.players.p1.life = 3
    src.isRested = true
    src.triggeredUsedTurn = { [effectId]: s.turn }
    requestActivationConfirm(s, "p1", "発動しますか？", action, src, { instanceId: src.instanceId, effectId })
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert((src.isRested as boolean) === false, "回復した")
    assert(src.triggeredUsedTurn?.[effectId] === s.turn, "発揮したので消費されたまま")
}

console.log("すべてのチェックに合格しました 🎉（part328）")
