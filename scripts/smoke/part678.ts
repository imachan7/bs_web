// smoke パート678（「このターンの間、ライフは減らない」の間は、自分のライフのコアをコストとして払えない。2026-10-29 ユーザー確認：召喚時効果は発揮されるが不発）
import { assert, createGame, createInstance, fireSummonTrigger, getCard, resolveAction, runTurnStart } from "./helpers"

const DARK_KNIGHT = "BS16-008" // ダークナイト・ドラゴン：召喚時、自分のライフのコア1個をボイドに置くことで、BP6000以下の相手1体を破壊
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(DARK_KNIGHT).name === "ダークナイト・ドラゴン" && getCard(DARK_KNIGHT).type === "spirit", "DARK_KNIGHTはダークナイト・ドラゴン")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

function setup(immune: boolean) {
    const s = createGame(`dk${immune}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    if (immune) resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "lifeImmuneForPid" } }], duration: "turn", side: "own" })
    const dk = createInstance(DARK_KNIGHT, s.turn, 1)
    const foe = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(dk)
    s.players.p2.field.spirits.push(foe)
    fireSummonTrigger(s, "p1", dk)
    return { s, foe }
}

console.log("=== 1. ライフが減らない間：ライフは減らず、相手も破壊されない ===")
{
    const { s, foe } = setup(true)
    const life = s.players.p1.life
    assert(s.players.p1.life === life && s.players.p1.life === 5, "ライフは5のまま")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === foe.instanceId), "相手のスピリットは場に残る")
}

console.log("=== 2. 対照：ふだんはライフ1個を払って破壊する ===")
{
    const { s, foe } = setup(false)
    assert(s.players.p1.life === 4, "ライフが1減る")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === foe.instanceId), "相手のスピリットは破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part678）")
