// smoke パート1025（#631 immuneToEffects：from の own／any と exceptSelf。X015・BS55-XX01。判定は resistance.ts の boardResistanceAgainst と continuousEffectReaches）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { boardResistanceAgainst, continuousEffectReaches, effectiveBp } from "../../shared/rules"

const X015 = "X015" // 放浪者ロロ（このスピリット以外の一切の効果を受けない）
const AMA = "BS55-XX01" // 絶対なる幻龍神アマテラス・ドラゴン（あらゆる効果を受けない）
const VAN = "BS01-002" // ロクケラトプス（バニラ）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(X015).name === "放浪者ロロ" && getCard(AMA).name === "絶対なる幻龍神アマテラス・ドラゴン" && getCard(VAN).name === "ロクケラトプス", "カード名")

function game(): GameState {
    const s = createGame("immune-any", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const attempt = (actorPid: PlayerId, sourceType: "spirit" | "magic" | "brave" | "nexus", sourceInstanceId?: string) =>
    ({ op: "destroy", scope: "area", actorPid, sourceType, ...(sourceInstanceId !== undefined ? { sourceInstanceId } : {}) }) as const

console.log("=== 1. X015：相手の効果も自分側の他の発生源の効果も止まり、自分自身の効果だけ通る ===")
{
    const s = game()
    const x = put(s, "p1", X015, 1)
    const ally = put(s, "p1", VAN, 1)
    for (const t of ["spirit", "magic", "brave", "nexus"] as const) {
        assert(boardResistanceAgainst(s, "p1", x, attempt("p2", t))?.category === "fullImmune", `相手の${t}の効果は止まる（from:any は against 省略でも全種別）`)
    }
    assert(boardResistanceAgainst(s, "p1", x, attempt("p1", "magic"))?.category === "fullImmune", "自分のマジックの効果も止まる")
    assert(boardResistanceAgainst(s, "p1", x, attempt("p1", "spirit", ally.instanceId))?.category === "fullImmune", "自分のほかのスピリットの効果も止まる")
    assert(boardResistanceAgainst(s, "p1", x, attempt("p1", "spirit", x.instanceId)) === null, "exceptSelf：自分自身の効果は通る")
    assert(boardResistanceAgainst(s, "p1", ally, attempt("p1", "magic")) === null, "耐性を持たない味方には自分の効果が通る")
    assert(boardResistanceAgainst(s, "p1", ally, attempt("p2", "spirit")) === null, "耐性を持たない味方には相手のスピリットの効果が通る（従来どおり）")
    assert(continuousEffectReaches(s, "p1", x, { pid: "p1", type: "spirit", instanceId: ally.instanceId }) === false, "自分のほかのスピリットの継続効果も届かない")
    assert(continuousEffectReaches(s, "p1", x, { pid: "p1", type: "spirit", instanceId: x.instanceId }) === true, "自分自身の継続効果は届く")
    assert(continuousEffectReaches(s, "p1", ally, { pid: "p1", type: "spirit", instanceId: x.instanceId }) === true, "X015の継続効果は味方へ届く（耐性は受け手の側）")
}

console.log("=== 2. アマテラス：自分自身の効果も止まる。自身のBP（コア×10000）だけは自身の定義なので通る ===")
{
    const s = game()
    const a = put(s, "p1", AMA, 3)
    assert(boardResistanceAgainst(s, "p1", a, attempt("p1", "spirit", a.instanceId))?.category === "fullImmune", "自分自身の効果も止まる（exceptSelf なし）")
    assert(boardResistanceAgainst(s, "p1", a, attempt("p2", "magic"))?.category === "fullImmune", "相手のマジックの効果は止まる")
    assert(effectiveBp(s, "p1", a) === 30000, "BP＝コア3個×10000（自身のオーラは通る）")
}
console.log("すべてのチェックに合格しました 🎉（part1025）")
