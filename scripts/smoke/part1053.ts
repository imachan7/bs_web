// smoke パート1053（メインステップのブレイヴの交換。BRAVE.md §6.4.1：Q65・Q66・Q67・Q71・Q76。2026-11-24 ユーザー確認）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { attachBrave } from "../../server/src/logic/brave"
import { instBaseCost } from "../../shared/rules"

const METAL = "BS01-008" // メタルバーン（赤・コスト3・効果の記述なし）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・効果の記述なし）
const VOLK = "BS01-009" // ヴォルク・バブーン（赤・コスト3・効果の記述あり）
const BUSTER = "BS10-061" // 剣鎧竜バスター・ドラゴン（ブレイヴ・コスト3・合体条件：効果の記述を持たない）
const CANNON = "BS10-062" // 砲凰竜フェニック・キャノン（ブレイヴ・コスト5・合体条件：コスト3以上）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(METAL).name === "メタルバーン" && getCard(METAL).cost === 3 && getCard(METAL).effect === "", "METALはメタルバーン（コスト3・記述なし）")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).cost === 1 && getCard(ROKU).effect === "", "ROKUはロクケラトプス（コスト1・記述なし）")
    assert(getCard(VOLK).name === "ヴォルク・バブーン" && getCard(VOLK).effect !== "", "VOLKはヴォルク・バブーン（記述あり）")
    assert(getCard(BUSTER).name === "剣鎧竜バスター・ドラゴン" && getCard(BUSTER).cost === 3 && JSON.stringify(getCard(BUSTER).braveCondition) === '{"vanilla":true}', "BUSTERは記述なしが条件のブレイヴ（コスト3）")
    assert(getCard(CANNON).name === "砲凰竜フェニック・キャノン" && JSON.stringify(getCard(CANNON).braveCondition) === '{"minCost":3}', "CANNONはコスト3以上が条件のブレイヴ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 0 // 余りのコアが無くても交換できる（Q67）
        p.trashCores = 0
        p.hand = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, cardId: string, cores: number, brave?: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    if (brave !== undefined) attachBrave(s, "p1", inst, createInstance(brave, s.turn, 0))
    refreshLevelAsOverrides(s)
    return inst
}

const braveOn = (s: GameState, host: { instanceId: string }): string | undefined => {
    const ref = s.players.p1.field.spirits.find((x) => x.instanceId === host.instanceId)?.braveRefs?.[0]
    return s.players.p1.field.combinedBraves.find((b) => b.instanceId === ref?.instanceId)?.cardId
}
const braveIdOn = (s: GameState, host: { instanceId: string }) => s.players.p1.field.spirits.find((x) => x.instanceId === host.instanceId)?.braveRefs?.[0]?.instanceId ?? ""
const exchange = (s: GameState, from: { instanceId: string }, to: { instanceId: string }, pid: PlayerId = "p1") =>
    act(s, pid, { type: "exchangeBrave", braveInstanceId: braveIdOn(s, from), toInstanceId: to.instanceId })

console.log("=== 1. 合体していないスピリットへ移す：コアは動かず、余りのコアが無くてもできる ===")
{
    const s = game("move")
    const a = put(s, METAL, 3, BUSTER)
    const b = put(s, ROKU, 2)
    assert(exchange(s, a, b) === null, "リザーブ0でも交換できる")
    assert(braveOn(s, b) === BUSTER && braveOn(s, a) === undefined, "ブレイヴがロクケラトプスへ移る")
    assert(a.cores === 3 && b.cores === 2 && s.players.p1.reserve === 0, `コアは動かない（メタルバーン ${a.cores}・ロクケラトプス ${b.cores}・リザーブ ${s.players.p1.reserve}）`)
    assert(instBaseCost(b) === 4 && instBaseCost(a) === 3, "コストはブレイヴのぶんが移る（1+3=4、メタルバーンは3に戻る）")
    assert(s.players.p1.field.combinedBraves.length === 1 && !s.players.p1.field.spirits.some((x) => x.cardId === BUSTER), "ブレイヴはスピリット状態にならない")
}

console.log("=== 2. 移動元が疲労していれば、移動先も疲労する ===")
{
    const s = game("rest")
    const a = put(s, METAL, 3, BUSTER)
    a.isRested = true
    const b = put(s, ROKU, 2)
    assert(exchange(s, a, b) === null, "疲労中でも交換できる")
    assert(b.isRested === true && a.isRested === true, "移動先のロクケラトプスも疲労状態になる")
}

console.log("=== 3. 合体スピリットどうしでブレイヴを入れ替える ===")
{
    const s = game("swap")
    const a = put(s, METAL, 3, CANNON)
    const b = put(s, METAL, 3, BUSTER)
    assert(exchange(s, a, b) === null, "入れ替えられる")
    assert(braveOn(s, b) === CANNON && braveOn(s, a) === BUSTER, "フェニック・キャノンとバスター・ドラゴンが入れ替わる")
    assert(s.players.p1.field.combinedBraves.length === 2, "どちらもスピリット状態にならない")
}

console.log("=== 4. できない：合体先が合体条件を満たさない ===")
{
    const s = game("cond")
    const a = put(s, METAL, 3, BUSTER)
    const b = put(s, VOLK, 1)
    assert(exchange(s, a, b) !== null, "効果の記述を持つヴォルク・バブーンへは移せない")
    assert(braveOn(s, a) === BUSTER && braveOn(s, b) === undefined, "盤面は変わらない")
}

console.log("=== 5. できない：入れ替え先の条件は、今ついているブレイヴのコストを含めずに見る（Q71） ===")
{
    const s = game("q71")
    const a = put(s, METAL, 3, CANNON)
    const b = put(s, ROKU, 2, BUSTER) // 合体中のコストは 1+3=4 だが、ロクケラトプスだけなら1
    assert(instBaseCost(b) === 4, "前提：ロクケラトプスの合体中のコストは4")
    assert(exchange(s, a, b) !== null, "コスト3以上が条件のフェニック・キャノンは、ロクケラトプス（1）と入れ替えられない")
    assert(braveOn(s, a) === CANNON && braveOn(s, b) === BUSTER, "盤面は変わらない")
}

console.log("=== 6. できない：入れ替えで戻ってくる側が条件を満たさない（Q66） ===")
{
    const s = game("q66")
    const a = put(s, VOLK, 3, CANNON) // ヴォルク・バブーンは記述ありなので、バスター・ドラゴンを受けられない
    const b = put(s, METAL, 3, BUSTER)
    assert(exchange(s, a, b) !== null, "バスター・ドラゴンがヴォルク・バブーンの条件を満たさないので入れ替えられない")
    assert(braveOn(s, a) === CANNON && braveOn(s, b) === BUSTER, "盤面は変わらない")
}

console.log("=== 7. できない：メインステップの外・相手のターン・スピリット状態のブレイヴ（Q76） ===")
{
    const s = game("timing")
    const a = put(s, METAL, 3, BUSTER)
    const b = put(s, ROKU, 2)
    s.phase = "attack"
    assert(exchange(s, a, b) !== null, "アタックステップには交換できない")
    s.phase = "main"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(exchange(s, a, b) !== null, "相手のターンには交換できない")
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    const loose = createInstance(BUSTER, s.turn, 1)
    s.players.p1.field.spirits.push(loose)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "exchangeBrave", braveInstanceId: loose.instanceId, toInstanceId: b.instanceId }) !== null, "スピリット状態のブレイヴは交換できない")
    assert(braveOn(s, a) === BUSTER && braveOn(s, b) === undefined, "盤面は変わらない")
}

console.log("すべてのチェックに合格しました 🎉（part1053）")
