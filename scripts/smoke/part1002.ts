// smoke パート1002（globalConstraint の condition を共通の AuraCondition へ寄せた回帰。2026-11-18）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { destroyDenial } from "../../server/src/logic/destroyGate"
import { attachBrave } from "../../server/src/logic/brave"
import { lifeLossAllowed, instCantAttackByCost, checkAuraCondition } from "../../shared/rules"

const VANILLA = "BS01-002"
const NAMES: Record<string, string> = {
    "BS03-114": "サファイアの城壁",
    "BS11-069": "黄金の鐘楼",
    "BS11-027": "海戦機ニヨルド",
    "BS12-070": "天の階",
    "SD03-009": "星海獣シー・サーペンダー",
    "SD03-010": "砲竜バル・ガンナー",
    "BS17-041": "天使グレイエル",
}
for (const [id, name] of Object.entries(NAMES)) assert(getCard(id).name === name, `${id}は${name}`)

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number, zone: "spirits" | "nexuses" = "spirits") {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field[zone].push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const denied = (s: GameState, target: ReturnType<typeof put>) =>
    destroyDenial(s, { ownerPid: "p1", target, cause: "effect", actorPid: "p2", sourceType: "spirit" }) !== null

console.log("=== ownVanillaSpiritsAtLeast（BS03-114）===")
for (const [n, ok] of [[3, true], [2, false]] as const) {
    const s = game(`van${n}`)
    const wall = put(s, "p1", "BS03-114", 2, "nexuses")
    for (let i = 0; i < n; i++) put(s, "p1", VANILLA, 1)
    assert(denied(s, wall) === ok, `バニラ${n}体: 城壁は${ok ? "破壊されない" : "破壊される"}`)
}

console.log("=== allOwnNexusesHaveColor（BS11-069）===")
{
    const s = game("col1")
    const bell = put(s, "p1", "BS11-069", 2, "nexuses")
    assert(denied(s, bell), "黄のネクサスだけなら破壊されない")
    put(s, "p1", "BS03-114", 0, "nexuses")
    assert(!denied(s, bell), "黄以外のネクサスが混ざると破壊される")
}

console.log("=== ownNexusCountExactly（BS11-027）===")
{
    const s = game("cnt1")
    put(s, "p1", "BS11-027", 2)
    const nx = put(s, "p1", "BS12-070", 0, "nexuses")
    assert(denied(s, nx), "ネクサス1つなら破壊されない")
    put(s, "p1", "BS03-114", 0, "nexuses")
    assert(!denied(s, nx), "ネクサス2つなら破壊される")
}

console.log("=== ownFamilyCountAtLeast（BS12-070 lifeGuard）===")
for (const [n, floor] of [[5, 0], [4, 1]] as const) {
    const s = game(`fam${n}`)
    put(s, "p1", "BS12-070", 2, "nexuses")
    for (let i = 0; i < n; i++) put(s, "p1", "BS17-041", 1)
    s.players.p1.life = 1
    const allowed = lifeLossAllowed(s, { pid: "p1", amount: 1, cause: "effect", actorPid: "p2" })
    assert(allowed === floor, `天霊${n}体（5体でライフ1を守る）: ライフ1から減らせる量は${floor}（実際${allowed}）`)
}

console.log("=== ownSpiritMatches（SD03-009 cantAttackByCost）===")
for (const combined of [true, false]) {
    const s = game(`mat${combined}`)
    const host = put(s, "p1", "SD03-009", 4)
    if (combined) attachBrave(s, "p1", host, createInstance("SD03-010", s.turn, 1))
    refreshLevelAsOverrides(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    const atk = put(s, "p2", VANILLA, 1)
    assert(instCantAttackByCost(s, atk) === combined, `合体${combined ? "あり" : "なし"}: コスト1のスピリットは${combined ? "アタックできない" : "アタックできる"}`)
}

console.log("=== ownColorSymbolsAtLeast を globalConstraint の condition に書ける（型は AuraCondition）===")
{
    const s = game("sym")
    put(s, "p1", VANILLA, 1)
    const cond = { ownColorSymbolsAtLeast: { color: "red" as const, count: 1 } }
    assert(checkAuraCondition(s, "p1", cond), "赤シンボル1つ以上")
    assert(!checkAuraCondition(s, "p1", { ownColorSymbolsAtLeast: { color: "red" as const, count: 9 } }), "赤シンボル9つ以上は不成立")
}
console.log("すべてのチェックに合格しました 🎉（part1002）")
