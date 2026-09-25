// smoke パート355：BS16-027 の同時破壊。1回の誘発で破壊待機のスピリット全員の系統を参照する（2026-09-22 ユーザー確認）
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const COKA = "BS16-027" // コーカサス・リョフ・ビートル
const HAOU = "BS16-005" // ゴエモン・シーフ・ドラゴン（覇皇/戦竜）
const CHIRYU = "BS01-002" // ロクケラトプス（地竜・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(COKA).name === "コーカサス・リョフ・ビートル", "027")
    assert(getCard(HAOU).family.includes("覇皇") && !getCard(HAOU).family.includes("地竜"), "005 は覇皇で地竜ではない")
    assert(getCard(CHIRYU).family.join() === "地竜" && getCard(CHIRYU).effects.length === 0, "BS01-002 は地竜のバニラ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 027-e3：相手の覇皇と地竜が同時に破壊されたとき、覇皇・地竜どちらかを持つ相手すべてを疲労させる ===")
{
    const s = game("027-simultaneous")
    const coka = put(s, "p1", COKA, 4) // Lv2
    const victimHaou = put(s, "p2", HAOU, 1) // 先に処理される（誘発はこの1体の時点で1回）
    const victimChiryu = put(s, "p2", CHIRYU, 1)
    const allyHaou = put(s, "p2", HAOU, 1)
    const allyChiryu = put(s, "p2", CHIRYU, 1)
    s.battle = { attackerInstanceId: coka.instanceId, blockerInstanceId: null, directed: false }
    destroyTargetsBatch(s, "p1", [
        { pid: "p2", instanceId: victimHaou.instanceId },
        { pid: "p2", instanceId: victimChiryu.instanceId },
    ], { sourcePid: "p1", sourceType: "spirit" })
    assert(allyHaou.isRested === true, "覇皇の相手が疲労した")
    assert(allyChiryu.isRested === true, "後に処理された地竜の系統も参照され、地竜の相手も疲労した")
}

console.log("すべてのチェックに合格しました 🎉（part355）")
