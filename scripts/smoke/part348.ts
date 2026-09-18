// smoke パート348（「〜が破壊されたとき」は同時破壊でも1回。公式Q&A Q22359・2026-09-18 ユーザー確認）
// 同時に破壊された2体に対し、他のカードの「破壊されたとき」は1回だけ。「1体につき」（perDestroyed）は体数ぶん。
// 詳細は docs/design/TIMING_CHART.md（同時破壊グループ）
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { assert, createGame, createInstance, destroySpirit, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    // 暴かれた墓石は『お互いのアタックステップ』
    s.turnPlayer = "p2"
    s.phase = "attack"
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

// 相手（p2）のスピリットの効果で、p1 のスピリットをまとめて破壊する
function destroyTogether(s: GameState, ids: string[]): number {
    return destroyTargetsBatch(s, "p2", ids.map((instanceId) => ({ pid: "p1" as PlayerId, instanceId })), { sourcePid: "p2", sourceType: "spirit" })
}

console.log("=== 1. 2体同時に破壊 → 暴かれた墓石のドローは1回 ===")
{
    const s = game("group-once")
    putNexus(s, "p1", "BS06-076")
    const a = put(s, "p1", "BS01-001")
    const b = put(s, "p1", "BS01-002")
    refreshLevelAsOverrides(s)
    const hand = s.players.p1.hand.length
    assert(destroyTogether(s, [a.instanceId, b.instanceId]) === 2, "2体とも破壊された")
    assert(s.players.p1.hand.length === hand + 1, `ドローは1回だけ（${s.players.p1.hand.length - hand}枚）`)
    assert(s.destroyGroup === undefined, "バッチが終わったらグループは外れる")
}

console.log("=== 2. 別々の効果で1体ずつ破壊 → 毎回ドローする ===")
{
    const s = game("separate")
    putNexus(s, "p1", "BS06-076")
    const a = put(s, "p1", "BS01-001")
    const b = put(s, "p1", "BS01-002")
    refreshLevelAsOverrides(s)
    const hand = s.players.p1.hand.length
    destroyTogether(s, [a.instanceId])
    destroySpirit(s, "p1", b.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.hand.length === hand + 2, `2回ドローした（${s.players.p1.hand.length - hand}枚）`)
}

console.log("=== 3. 「1体につき」（perDestroyed）：骸騎士ヴェリアムは体数ぶんドロー ===")
{
    const s = game("per-destroyed")
    put(s, "p1", "BS12-014")
    const a = put(s, "p1", "BS06-013")
    const b = put(s, "p1", "BS06-020")
    refreshLevelAsOverrides(s)
    const hand = s.players.p1.hand.length
    destroyTogether(s, [a.instanceId, b.instanceId])
    assert(s.players.p1.hand.length === hand + 2, `無魔2体の同時破壊で2枚ドロー（${s.players.p1.hand.length - hand}枚）`)
}

console.log("=== 4. 吊られた古城 Lv2：同時に破壊された夜族2体のうち残せるのは1体だけ（Q22359） ===")
{
    const s = game("castle")
    putNexus(s, "p1", "BS15-063", 5)
    const a = put(s, "p1", "BS07-010")
    const b = put(s, "p1", "BS07-010")
    refreshLevelAsOverrides(s)
    s.players.p1.hand.push("BS01-001", "BS01-002", "BS01-005")
    destroyTogether(s, [a.instanceId, b.instanceId])
    const left = s.players.p1.field.spirits.filter((sp) => sp.cardId === "BS07-010").length
    assert(left === 1, `残ったのは1体（${left}体）`)
}

// 対話モード：任意の「フィールドに残る」（花の宮殿。楽族・相手のターン）を2体同時破壊に当てる。
// declineFirst=true なら1体目の確認を断り、以降は使う。確認が出た回数と残った体数を返す
function palaceRun(seed: string, declineFirst: boolean): { confirms: number; left: number } {
    const s = game(seed)
    s.interactiveTargets = true
    putNexus(s, "p1", "BS09-063", 1)
    // コストは「そのスピリット上のコア1個」。1個だと払った時点で消滅するので2個置く
    const a = put(s, "p1", "BS02-053", 2)
    const b = put(s, "p1", "BS02-053", 2)
    refreshLevelAsOverrides(s)
    destroyTogether(s, [a.instanceId, b.instanceId])
    let confirms = 0
    for (let guard = 0; guard < 10 && s.pendingChoice; guard++) {
        const pc = s.pendingChoice
        if (pc.reviveConfirm) {
            confirms++
            const decline = declineFirst && confirms === 1
            handleAction(s, pc.pid, decline ? { type: "resolveChoice" } : { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        } else {
            // 破壊処理の順番（ターンプレイヤーが選ぶ）は先頭でよい
            handleAction(s, pc.pid, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        }
    }
    return { confirms, left: s.players.p1.field.spirits.filter((sp) => sp.cardId === "BS02-053").length }
}

console.log("=== 5. 任意の「フィールドに残る」：1体目で使えば2体目には出ない ===")
{
    const r = palaceRun("palace-accept", false)
    assert(r.confirms === 1, `確認は1回だけ（${r.confirms}回）`)
    assert(r.left === 1, `1体が残った（${r.left}体）`)
}

console.log("=== 6. 任意の「フィールドに残る」：1体目で断れば、2体目でまた出る（どの1体に使うかを選べる） ===")
{
    const r = palaceRun("palace-decline", true)
    assert(r.confirms === 2, `確認は2回出た（${r.confirms}回）`)
    assert(r.left === 1, `2体目で使って1体残った（${r.left}体）`)
}
console.log("すべてのチェックに合格しました 🎉（part348）")
