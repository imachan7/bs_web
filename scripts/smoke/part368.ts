// smoke パート368（1体の Lv を「このターンの間」として扱う：timedEffect の内容 level。移したカードデータを直接解決する）
import { assert, createGame, createInstance, currentLevel, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const MASSIVE = "BS04-112" // マッシブアップ：青で Lv3 を持つ自分のスピリット1体を Lv3 として扱う
const QUEEN = "BS14-051" // アルカナビーストクィーン：相手のスピリット1体を Lv1 として扱う
const BUILD = "BS03-141" // ビルドアップ：スピリット1体の Lv を1つ上として扱う

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MASSIVE).name === "マッシブアップ", "MASSIVE")
    assert(getCard(QUEEN).name === "アルカナビーストクィーン", "QUEEN")
    assert(getCard(BUILD).name === "ビルドアップ", "BUILD")
}

function levelAction(cardId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => {
        const a = (x as { action?: { type: string; content?: { type: string }[] } }).action
        return a?.type === "timedEffect" && a.content?.some((c) => c.type === "level") === true
    })
    return (e as { action: EffectAction }).action
}

function game(): GameState {
    return createGame("p368", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
}

const maxLv = (id: string) => getCard(id).levels.reduce((m, l) => Math.max(m, l.level), 1)
const blue3 = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "blue" && maxLv(c.cardId) >= 3)!
const blue2 = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "blue" && maxLv(c.cardId) === 2)!
const red3 = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "red" && maxLv(c.cardId) >= 3)!

console.log("=== 1. マッシブアップ：青で Lv3 を持つ自分のスピリットだけ ===")
{
    const s = game()
    const ok = createInstance(blue3.cardId, 1, 1)
    const noLv3 = createInstance(blue2.cardId, 1, 1)
    const notBlue = createInstance(red3.cardId, 1, 1)
    s.players.p1.field.spirits = [noLv3, notBlue, ok]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, levelAction(MASSIVE), undefined, undefined, "magic")
    assert(ok.timedLevel === 3 && currentLevel(ok).level === 3, "青で Lv3 を持つスピリットが Lv3 になる")
    assert(noLv3.timedLevel === undefined && notBlue.timedLevel === undefined, "条件に合わないものは変わらない")
    const t = game()
    const bad = createInstance(red3.cardId, 1, 1)
    t.players.p1.field.spirits = [bad]
    refreshLevelAsOverrides(t)
    resolveAction(t, "p1", null, levelAction(MASSIVE), bad.instanceId, undefined, "magic")
    assert(bad.timedLevel === undefined, "指定された対象が青でなければ効果は無い")
}

console.log("=== 2. アルカナビーストクィーン：相手のスピリットを Lv1 として扱う ===")
{
    const s = game()
    const mine = createInstance(red3.cardId, 1, 5)
    const theirs = createInstance(red3.cardId, 1, 5)
    s.players.p1.field.spirits = [mine]
    s.players.p2.field.spirits = [theirs]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", mine, levelAction(QUEEN))
    assert(theirs.timedLevel === 1 && mine.timedLevel === undefined, "相手のスピリットだけが Lv1 になる")
}

console.log("=== 3. ビルドアップ：Lv を1つ上げ、最大Lvで止まる ===")
{
    const s = game()
    const lv1 = createInstance(blue2.cardId, 1, 1)
    s.players.p1.field.spirits = [lv1]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, levelAction(BUILD), lv1.instanceId, undefined, "magic")
    assert(lv1.timedLevel === 2, "Lv1 → Lv2")
    resolveAction(s, "p1", null, levelAction(BUILD), lv1.instanceId, undefined, "magic")
    assert(lv1.timedLevel === 2, "最大Lv（2）で止まる")
}

console.log("すべてのチェックに合格しました 🎉（part368）")
