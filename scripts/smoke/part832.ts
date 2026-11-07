// smoke パート832（デッキを破棄されない禁止は、デッキを破棄して払うネクサスの配置コストと【粉砕】の0枚判定にも同じ判定で効く）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { canPayNexusCostByMill } from "../../shared/cost"
import { deckMillBlockedByRule } from "../../shared/rules"

const PODIUM = "BS04-088" // 栄光の表彰台：ネクサスの配置コストをデッキの破棄で払える（自分のメインステップ）
const ORGAN = "BS14-085" // 賛美するパイプオルガン：お互い、メインステップでデッキは破棄されない
const SWORD = "BS08-064" // 鳳翼の聖剣：配置されたターンの間、自分のデッキは破棄されない
const VAN = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(PODIUM).name === "栄光の表彰台" && getCard(PODIUM).type === "nexus", "PODIUMは栄光の表彰台")
assert(getCard(ORGAN).name === "賛美するパイプオルガン" && getCard(ORGAN).type === "nexus", "ORGANは賛美するパイプオルガン")
assert(getCard(SWORD).name === "鳳翼の聖剣" && getCard(SWORD).type === "nexus", "SWORDは鳳翼の聖剣")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as const) {
        s.players[pid].deck = Array.from({ length: 30 }, () => VAN)
        s.players[pid].field.nexuses = []
        s.players[pid].field.spirits = []
    }
    return s
}
function nexus(s: GameState, pid: PlayerId, cardId: string, cores: number, summonedTurn: number): void {
    const inst = createInstance(cardId, summonedTurn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
}

console.log("=== 栄光の表彰台の配置コストの支払い ===")
{
    const s = game("podium")
    nexus(s, "p1", PODIUM, 0, 1)
    assert(canPayNexusCostByMill(s, "p1"), "対照：禁止が無ければデッキの破棄で払える")
}
{
    const s = game("podium-organ")
    nexus(s, "p1", PODIUM, 0, 1)
    nexus(s, "p2", ORGAN, 0, 1)
    assert(!canPayNexusCostByMill(s, "p1"), "相手のパイプオルガン（お互い・メインステップ）があればメインでは払えない")
}
{
    const s = game("podium-sword-now")
    nexus(s, "p1", PODIUM, 0, 1)
    nexus(s, "p1", SWORD, 0, 3)
    assert(!canPayNexusCostByMill(s, "p1"), "自分の鳳翼の聖剣を配置したターンは払えない")
}
{
    const s = game("podium-sword-old")
    nexus(s, "p1", PODIUM, 0, 1)
    nexus(s, "p1", SWORD, 0, 1)
    assert(canPayNexusCostByMill(s, "p1"), "鳳翼の聖剣を配置したターンが過ぎていれば払える")
}
{
    const s = game("podium-sword-opp")
    nexus(s, "p1", PODIUM, 0, 1)
    nexus(s, "p2", SWORD, 0, 3)
    assert(canPayNexusCostByMill(s, "p1"), "相手の鳳翼の聖剣は相手のデッキだけを守る（自分は払える）")
}

console.log("=== 【粉砕】の0枚判定：相手の効果による破棄として見る ===")
{
    const s = game("funsai-sword")
    nexus(s, "p2", SWORD, 0, 3)
    s.phase = "attack"
    assert(deckMillBlockedByRule(s, "p2", true), "配置したターンの鳳翼の聖剣は、相手の【粉砕】による破棄も止める")
}

console.log("すべてのチェックに合格しました 🎉（part832）")
