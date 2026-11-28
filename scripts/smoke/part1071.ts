// smoke パート1071（アルティメットの土台 段3a：findBattler・場の列挙・effectSources・leaveField。docs/design/ULTIMATE_STAGE3.md）
import { assert, createGame, createInstance } from "./helpers"
import { battlerOwnerOf, effectSources, isOnFieldAnyZone } from "../../shared/rules"
import { findBattler, findInstanceAnywhere, findSpirit } from "../../server/src/logic/GameState"
import { leaveField } from "../../server/src/logic/leaveField"
import { ownerPidOfInstance } from "../../server/src/logic/oncePerTurn"

const VANILLA = "BS01-002" // ロクケラトプス

// ultimates に直接入れた個体と、spirits の個体を1体ずつ置く
function board() {
    const s = createGame("ult-stage3a", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    const p = s.players.p1
    const sp = createInstance(VANILLA, 1, 1)
    const ult = createInstance(VANILLA, 1, 3)
    p.field.spirits.push(sp)
    p.field.ultimates.push(ult)
    return { s, p, sp, ult }
}

console.log("=== 探す・持ち主の逆引き ===")
{
    const { s, p, sp, ult } = board()
    assert(findBattler(p, ult.instanceId) === ult, "findBattler はアルティメットを見つける")
    assert(findBattler(p, sp.instanceId) === sp, "findBattler はスピリットも見つける")
    assert(findSpirit(p, ult.instanceId) === undefined, "findSpirit はアルティメットを見つけない")
    assert(isOnFieldAnyZone(p, ult.instanceId), "isOnFieldAnyZone はアルティメットを場にいると見る")
    assert(!isOnFieldAnyZone(s.players.p2, ult.instanceId), "相手側では場にいない")
    assert(ownerPidOfInstance(s, ult) === "p1", "ownerPidOfInstance はアルティメットの持ち主を返す")
    assert(battlerOwnerOf(s, ult) === "p1", "battlerOwnerOf はアルティメットの持ち主を返す")
    assert(findInstanceAnywhere(s, ult.instanceId) === ult, "findInstanceAnywhere はアルティメットを見つける")
}

console.log("=== 発生源 ===")
{
    const { s, sp, ult } = board()
    const sources = effectSources(s, "p1")
    assert(sources.includes(ult) && sources.includes(sp), "effectSources にアルティメットとスピリットが入る")
    assert(!effectSources(s, "p2").includes(ult), "相手の発生源には入らない")
}

console.log("=== 場を離れる ===")
{
    const { s, p, sp, ult } = board()
    ult.cores = 3
    p.reserve = 0
    assert(leaveField(s, "p1", ult), "アルティメットが場から抜ける")
    assert(p.field.ultimates.length === 0 && p.field.spirits.length === 1 && p.field.spirits[0] === sp, "ultimates だけが空になり spirits は変わらない")
    assert(p.reserve === 3, "乗っていたコアはリザーブへ")
    assert(!leaveField(s, "p1", ult), "もう場にいない個体は何も動かさない")
    assert(p.reserve === 3, "二重に加算されない")
    assert(leaveField(s, "p1", sp) && p.field.spirits.length === 0, "スピリットも同じ入口で抜ける")
}

console.log("すべてのチェックに合格しました 🎉（part1071）")
