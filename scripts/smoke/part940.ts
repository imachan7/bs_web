// smoke パート940（『合体アタック時』の結果連動型も、借りる・繰り返す・貸す。#505。BRAVE.md §12.4）
//   - イリテバン：借りた結果連動型は、このバトルの間エントリごと与え、出来事が起きたら発揮する
//   - メサイア・ドラゴン：結果連動型も、もう1度発揮できる
//   - フィンヴェール：貸した結果連動型も、出来事が起きたら発揮する
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave } from "../../server/src/logic/brave"
import { fireTrigger } from "../../server/src/logic/EffectModules"
import { currentLevel } from "../../shared/rules"

const IRITEBAN = "BS13-049" // イリテバン
const KARMULA = "BS11-053" // カーミュラ1：【合体時】『合体アタック時』相手のライフを減らしたとき、相手のライフのコア1個をリザーブへ
const MESSIAH = "BS22-009" // 剣星メサイア・ドラゴン：Lv2-3【合体時】ブレイヴの『合体アタック時』効果をもう1度発揮できる
const FINVEL = "BS23-031" // 大空の剣聖フィンヴェール：Lv3【合体時】武装コスト5以上の合体していない自分のスピリットに、ブレイヴの『合体アタック時』効果を与える
const WINGAL = "BS02-046" // ウィンガル（武装・コスト6）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(IRITEBAN).name === "イリテバン", "IRITEBAN")
assert(getCard(KARMULA).name === "カーミュラ1" && getCard(KARMULA).type === "brave", "KARMULA")
assert(getCard(MESSIAH).name === "剣星メサイア・ドラゴン", "MESSIAH")
assert(getCard(FINVEL).name === "大空の剣聖フィンヴェール", "FINVEL")
assert(getCard(WINGAL).name === "ウィンガル" && getCard(WINGAL).family.includes("武装"), "WINGAL")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits = []
    return s
}

console.log("=== イリテバン：スピリット状態のカーミュラ1の結果連動型を借りると、ライフを減らしたときに発揮する ===")
{
    const s = game("t940-borrow")
    const host = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    attachBrave(s, "p1", host, createInstance(IRITEBAN, s.turn, 0))
    const karmula = createInstance(KARMULA, s.turn, 1)
    s.players.p1.field.spirits.push(karmula)
    refreshLevelAsOverrides(s)
    const life = s.players.p2.life
    fireTrigger(s, "p1", host, "onLifeDealt", "attacker")
    assert(s.players.p2.life === life, "対照：借りる前は発揮しない")
    resolveAction(s, "p1", host, { type: "borrowCombinedAttackEffect", confirmed: true }, karmula.instanceId)
    assert(s.players.p2.life === life, "借りた時点では発揮しない（出来事を待つ）")
    fireTrigger(s, "p1", host, "onLifeDealt", "attacker")
    assert(s.players.p2.life === life - 1, "ライフを減らしたときに発揮する")
}

console.log("=== メサイア・ドラゴン：合体したカーミュラ1の結果連動型も、もう1度発揮できる ===")
{
    const s = game("t940-repeat")
    const messiah = createInstance(MESSIAH, s.turn, 3)
    s.players.p1.field.spirits.push(messiah)
    attachBrave(s, "p1", messiah, createInstance(KARMULA, s.turn, 0))
    refreshLevelAsOverrides(s)
    assert(currentLevel(messiah).level >= 2, "テスト前提: メサイア・ドラゴンは Lv2 以上")
    const life = s.players.p2.life
    fireTrigger(s, "p1", messiah, "onAttack")
    fireTrigger(s, "p1", messiah, "onLifeDealt", "attacker")
    assert(s.players.p2.life === life - 2, `2回発揮する（実際 ${life - s.players.p2.life}回）`)
}

console.log("=== フィンヴェール：貸したカーミュラ1の結果連動型も、ライフを減らしたときに発揮する ===")
{
    const s = game("t940-lend")
    const finvel = createInstance(FINVEL, s.turn, 4)
    s.players.p1.field.spirits.push(finvel)
    attachBrave(s, "p1", finvel, createInstance(KARMULA, s.turn, 0))
    const wingal = createInstance(WINGAL, s.turn, 1)
    s.players.p1.field.spirits.push(wingal)
    refreshLevelAsOverrides(s)
    assert(currentLevel(finvel).level === 3, "テスト前提: フィンヴェールは Lv3")
    const life = s.players.p2.life
    fireTrigger(s, "p1", wingal, "onLifeDealt", "attacker")
    assert(s.players.p2.life === life - 1, "ウィンガルがライフを減らしたときに発揮する")
}

console.log("すべてのチェックに合格しました 🎉（part940）")
