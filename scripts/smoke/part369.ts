// smoke パート369（「このターンの間、〜のスピリットすべてを Lv◯として扱う」は解決後に場に出たスピリットにも効く。2026-09-24 ユーザー確認）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const DISASTER = "BS14-110" // 天災之禍風：このターンの間、相手のスピリットすべてを Lv1 として扱う
const MIRAGE = "BS04-069" // 幻影士のミラージ：召喚時、このターンの間、自分のスピリットすべてを最高Lvとして扱う

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(DISASTER).name === "天災之禍風", "DISASTER")
    assert(getCard(MIRAGE).name === "幻影士のミラージ", "MIRAGE")
}

function levelAllAction(cardId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => {
        const a = (x as { action?: { type: string; all?: true; content?: { type: string }[] } }).action
        return a?.type === "timedEffect" && a.all === true && a.content?.some((c) => c.type === "level") === true
    })
    return (e as { action: EffectAction }).action
}

const maxLv = (id: string) => getCard(id).levels.reduce((m, l) => Math.max(m, l.level), 1)
const lv3 = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.length === 0 && maxLv(c.cardId) >= 3)!

function game(): GameState {
    return createGame("p369", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
}

console.log("=== 1. 天災之禍風：相手のスピリットすべて（後から出たものも）を Lv1 として扱う ===")
{
    const s = game()
    const theirs = createInstance(lv3.cardId, 1, 5)
    const mine = createInstance(lv3.cardId, 1, 5)
    s.players.p2.field.spirits = [theirs]
    s.players.p1.field.spirits = [mine]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, levelAllAction(DISASTER), undefined, undefined, "magic")
    assert(theirs.levelOverrideThisTurn === 1 && mine.levelOverrideThisTurn === undefined, "相手のスピリットだけ Lv1")
    const later = createInstance(lv3.cardId, 1, 5)
    s.players.p2.field.spirits.push(later)
    refreshLevelAsOverrides(s)
    assert(later.levelOverrideThisTurn === 1, "解決後に出た相手のスピリットも Lv1")
    // 後から使われた1体の Lv 変更はルールに上書きされない
    resolveAction(s, "p2", null, { type: "timedEffect", content: [{ type: "level", up: 1 }], duration: "turn", side: "own" }, theirs.instanceId, undefined, "magic")
    refreshLevelAsOverrides(s)
    assert(theirs.levelOverrideThisTurn === 2, "後から Lv を上げた個体はそのまま（Lv2）")
}

console.log("=== 2. 幻影士のミラージ：自分のスピリットすべて（後から出たものも）を最高Lvとして扱う ===")
{
    const s = game()
    const mirage = createInstance(MIRAGE, 1, 1)
    const a = createInstance(lv3.cardId, 1, 1)
    s.players.p1.field.spirits = [mirage, a]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", mirage, levelAllAction(MIRAGE))
    assert(a.levelOverrideThisTurn === maxLv(lv3.cardId), "いた個体は最高Lv")
    const later = createInstance(lv3.cardId, 1, 1)
    s.players.p1.field.spirits.push(later)
    refreshLevelAsOverrides(s)
    assert(later.levelOverrideThisTurn === maxLv(lv3.cardId), "解決後に出た個体も最高Lv")
    const opp = createInstance(lv3.cardId, 1, 1)
    s.players.p2.field.spirits.push(opp)
    refreshLevelAsOverrides(s)
    assert(opp.levelOverrideThisTurn === undefined, "相手のスピリットには効かない")
}

console.log("すべてのチェックに合格しました 🎉（part369）")
