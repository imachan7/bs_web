// smoke パート876（軽微バグ3件：ノヴァの転召ライフ補充元／ヴィエルジェ自身の手札戻り／複数色の「としても扱う」の軽減割り当て）
import { assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { effectiveCost } from "../../server/src/logic/RuleValidator"
import type { GameState } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.reserve = 10
    return s
}

console.log("=== 前提: カードの機械確認 ===")
assert(getCard("BS12-X05").name === "戦神乙女ヴィエルジェ", "BS12-X05 はヴィエルジェ")
assert(getCard("BS05-036").name === "氷の魔女ヘル", "BS05-036 はヘル")
assert(getCard("P066").name === "プリズモルフォ", "P066 はプリズモルフォ")
assert(getCard("SD03-008").name === "棟梁マッコイ" && getCard("SD03-008").reduction.join() === "blue,red", "SD03-008 は青赤の軽減")

console.log("=== BS09-X35 ノヴァ：ライフの補充元はボイド ===")
{
    const e = getCard("BS09-X35").effects.find((x) => x.id === "BS09-X35-e2")
    const a = (e as { action: { from: string } }).action
    assert(a.from === "void", "【転召】後のライフ補充は『ボイドからコアを置く』")
}

console.log("=== BS12-X05 ヴィエルジェ：自分自身も相手によって破壊されたとき手札に戻る ===")
{
    const s = game("vierge-self")
    const v = createInstance("BS12-X05", s.turn, 3)
    s.players.p1.field.spirits.push(v)
    refreshLevelAsOverrides(s)
    const h = s.players.p1.hand.length
    destroySpirit(s, "p1", v.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    assert(s.players.p1.hand.length === h + 1 && s.players.p1.field.spirits.length === 0, "ヴィエルジェ自身も手札に戻る")
}

console.log("=== BS05-036 ヘル：『ヘル以外』なので自分自身は戻らない ===")
{
    const s = game("hel-self")
    const hel = createInstance("BS05-036", s.turn, 3)
    s.players.p1.field.spirits.push(hel)
    refreshLevelAsOverrides(s)
    s.phase = "attack"
    const h = s.players.p1.hand.length
    destroySpirit(s, "p1", hel.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    assert(s.players.p1.hand.length === h, "ヘル自身は手札に戻らない")
}

console.log("=== P066 プリズモルフォ：1つのシンボルは軽減シンボル1つにしか使えない ===")
{
    const s = game("prism")
    s.players.p1.field.spirits.push(createInstance("P066", s.turn, 1))
    refreshLevelAsOverrides(s)
    const mccoy = getCard("SD03-008") // コスト4・青赤
    assert(effectiveCost(s, "p1", mccoy) === 3, "プリズモルフォ1体では青と赤を同時には満たせず、軽減は1")
    s.players.p1.field.spirits.push(createInstance("BS01-002", s.turn, 1)) // 赤シンボル1つ
    refreshLevelAsOverrides(s)
    assert(effectiveCost(s, "p1", mccoy) === 2, "赤1つがあれば、プリズモルフォは青に回って軽減は2（最適に割り当てる）")
}
console.log("すべてのチェックに合格しました 🎉（part876）")
