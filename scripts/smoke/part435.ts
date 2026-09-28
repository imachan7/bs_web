// smoke パート435（R5：組み合わせ方の部品 simultaneous＝「Aして、B」は同時。BS04-108 はカードデータのまま）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { findBadSimultaneous } from "../validate-cards"

const FLUSH = "BS04-108" // ストレートフラッシュ
const SHIDO = ALL_CARDS.find((c) => c.type === "spirit" && c.family.includes("四道") && c.effects.length === 0)?.cardId
    ?? ALL_CARDS.find((c) => c.type === "spirit" && c.family.includes("四道"))!.cardId
const PLAIN = "BS01-002" // ロクケラトプス（バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(FLUSH).name === "ストレートフラッシュ" && getCard(FLUSH).type === "magic", "FLUSHはストレートフラッシュ")
    assert(getCard(SHIDO).family.includes("四道"), `SHIDO（${getCard(SHIDO).name}）は系統：四道`)
    assert(getCard(PLAIN).name === "ロクケラトプス" && !getCard(PLAIN).family.includes("四道"), "PLAINは四道でない")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    return s
}
function mainAction(): Parameters<typeof resolveAction>[3] {
    const e = getCard(FLUSH).effects.find((x) => x.kind === "magic" && x.timing === "main") as { action: Parameters<typeof resolveAction>[3] }
    return e.action
}

console.log("=== 自分の四道すべてと相手のスピリットすべてを破壊し、自分の四道でないスピリットは残る ===")
{
    const s = game("p435-flush")
    const shido = Array.from({ length: 5 }, () => createInstance(SHIDO, s.turn, 3))
    const mine = createInstance(PLAIN, s.turn, 1)
    const enemies = [createInstance(PLAIN, s.turn, 1), createInstance(SHIDO, s.turn, 3)]
    s.players.p1.field.spirits.push(...shido, mine)
    s.players.p2.field.spirits.push(...enemies)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, mainAction())
    assert(s.players.p1.field.spirits.length === 1 && s.players.p1.field.spirits[0] === mine, "自分は四道でない1体だけ残る")
    assert(s.players.p2.field.spirits.length === 0, "相手のスピリットはすべて破壊される")
}

console.log("=== destroy{all, side own} は自分側だけ ===")
{
    const s = game("p435-own")
    const mine = createInstance(PLAIN, s.turn, 1)
    const enemy = createInstance(PLAIN, s.turn, 1)
    s.players.p1.field.spirits.push(mine)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, all: true, side: "own" })
    assert(s.players.p1.field.spirits.length === 0, "自分のスピリットは破壊される")
    assert(s.players.p2.field.spirits.includes(enemy), "相手のスピリットは残る")
}

console.log("=== simultaneous の中に destroy{all} 以外を書くと validate:cards が落とす ===")
{
    const bad = [{ cardId: "X", effects: [{ kind: "magic", action: { type: "simultaneous", actions: [{ type: "draw", count: 1 }] } }] }]
    assert(findBadSimultaneous(bad as never).length === 1, "draw を入れると検出される")
    assert(findBadSimultaneous(ALL_CARDS).length === 0, "実カードデータには無い")
}

console.log("すべてのチェックに合格しました 🎉（part435）")
