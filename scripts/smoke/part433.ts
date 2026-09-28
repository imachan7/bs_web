// smoke パート433（R5：スレイ・ウラノスを returnToHand → if{last cost} → refreshOne で書いた。
// 「この効果で戻したとき」は戻す効果の解決中＝バウンス待機のまま判定する（Wiki「バウンスについて」。2026-09-28 ユーザー確認）ので、
// 合体スピリットはブレイヴを残すかを選ぶ前のホスト＋ブレイヴの合計コストで見る）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave } from "../../server/src/logic/brave"

const URANOS = "BS11-032" // 天王神獣スレイ・ウラノス
const HOST = "BS01-008" // メタルバーン（コスト3・バニラ）
const BRAVE = "BS10-061" // 剣鎧竜バスター・ドラゴン（コスト3・合体条件：効果の記述を持たない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(URANOS).name === "天王神獣スレイ・ウラノス" && getCard(URANOS).family.includes("神星"), "URANOSは系統：神星の天王神獣スレイ・ウラノス")
    assert(getCard(HOST).name === "メタルバーン" && getCard(HOST).cost === 3 && getCard(HOST).effects.length === 0, "HOSTはコスト3のバニラ")
    assert(getCard(BRAVE).name === "剣鎧竜バスター・ドラゴン" && getCard(BRAVE).type === "brave" && getCard(BRAVE).cost === 3, "BRAVEはコスト3のブレイヴ")
}

function uranosAction(): Parameters<typeof resolveAction>[3] {
    const e = getCard(URANOS).effects.find((x) => x.kind === "triggered" && x.trigger === "onAttack") as { action: Parameters<typeof resolveAction>[3] }
    return e.action
}

function game(seed: string): { s: GameState; ally: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p2.reserve = 10 // 非対話ではリザーブが足りればブレイヴを残す
    const ally = createInstance(URANOS, s.turn, 3) // 回復させる味方（系統：神星）
    ally.isRested = true
    s.players.p1.field.spirits.push(ally)
    return { s, ally }
}

console.log("=== 合体していないコスト3を戻したら回復する（対照） ===")
{
    const { s, ally } = game("p433-plain")
    s.players.p2.field.spirits.push(createInstance(HOST, s.turn, 1))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, uranosAction())
    assert(s.players.p2.hand.includes(HOST), "メタルバーンが手札に戻る")
    assert(!(ally.isRested as boolean), "コスト3なので回復する")
}

console.log("=== 合体スピリット（3＋3＝6）を戻したら、ブレイヴを残しても回復しない ===")
{
    const { s, ally } = game("p433-combined")
    const host = createInstance(HOST, s.turn, 1)
    s.players.p2.field.spirits.push(host)
    attachBrave(s, "p2", host, createInstance(BRAVE, s.turn, 0))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, uranosAction())
    assert(s.players.p2.hand.includes(HOST), "ホストが手札に戻る")
    assert(s.players.p2.field.spirits.some((sp) => sp.cardId === BRAVE), "ブレイヴはスピリット状態で場に残った（前提）")
    assert(ally.isRested === true, "待機中は合計コスト6なので回復しない")
}

console.log("すべてのチェックに合格しました 🎉（part433）")
