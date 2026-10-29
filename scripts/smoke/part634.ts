// smoke パート634（BS18 軸1〜3：keywordGrant.uncombinedFilter／summonFromHandFree.symbolCount／BraveConditionTerm.minSymbols）
import { matchesBraveCondition } from "../../shared/rules"
import { summonFromHandFreeCandidateMatches } from "../../server/src/logic/summon"
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart, spiritHasKeyword } from "./helpers"
import type { GameState } from "./helpers"

const SRC = "BS01-001" // ゴラドン（効果なし・赤）
const VANILLA = "BS01-002" // ロクケラトプス（1シンボル）
const TWO_SYMBOL = "BS04-010" // 雷帝エール・クレル（2シンボル）
const BRAVE = "BS10-061" // 剣鎧竜バスター・ドラゴン

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SRC).name === "ゴラドン" && getCard(SRC).effects.length === 0, "SRCはゴラドン（効果なし）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).symbol.length === 1, "VANILLAは1シンボル")
    assert(getCard(TWO_SYMBOL).name === "雷帝エール・クレル" && getCard(TWO_SYMBOL).symbol.length === 2, "TWO_SYMBOLは2シンボル")
    assert(getCard(BRAVE).type === "brave", "BRAVEはブレイヴ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    return s
}

function withEffects(cardId: string, effects: unknown[], body: () => void): void {
    const c = getCard(cardId)
    const saved = c.effects
    c.effects = effects as typeof c.effects
    try {
        body()
    } finally {
        c.effects = saved
    }
}

console.log("=== 1. keywordGrant.uncombinedFilter ===")
withEffects(
    SRC,
    [{ id: "t1", kind: "keywordGrant", levels: null, keyword: "jugeki", target: "ownAll", uncombinedFilter: true }],
    () => {
        const s = game("c1")
        const src = createInstance(SRC, s.turn, 1)
        const plain = createInstance(VANILLA, s.turn, 1)
        const combined = createInstance(VANILLA, s.turn, 1)
        combined.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }]
        s.players.p1.field.spirits.push(src, plain, combined)
        refreshLevelAsOverrides(s)
        assert(spiritHasKeyword(s, "p1", plain, "jugeki"), "合体していないスピリットには付与される")
        assert(!spiritHasKeyword(s, "p1", combined, "jugeki"), "合体しているスピリットには付与されない")
    },
)

console.log("=== 2. summonFromHandFree.symbolCount ===")
{
    const s = game("c2")
    const m = (cardId: string, symbolCount?: number): boolean =>
        summonFromHandFreeCandidateMatches(s, "p1", null, { type: "summon", from: "hand", ...(symbolCount !== undefined ? { symbolCount } : {}) }, cardId)
    assert(m(TWO_SYMBOL, 2), "2シンボルのカードは symbolCount:2 に合う")
    assert(!m(VANILLA, 2), "1シンボルのカードは symbolCount:2 に合わない")
    assert(m(VANILLA, 1) && !m(TWO_SYMBOL, 1), "symbolCount:1 は1シンボルだけ（ちょうど）")
    assert(m(VANILLA) && m(TWO_SYMBOL), "指定なしなら絞り込まない")
}

console.log("=== 3. BraveConditionTerm.minSymbols ===")
{
    const c = getCard(BRAVE)
    const saved = c.braveCondition
    c.braveCondition = { minSymbols: 2 }
    try {
        const s = game("c3")
        const one = createInstance(VANILLA, s.turn, 1)
        const two = createInstance(TWO_SYMBOL, s.turn, 1)
        const boosted = createInstance(VANILLA, s.turn, 1)
        boosted.timedExtraSymbols = 1 // ダブルハート：場のシンボル数は2
        s.players.p1.field.spirits.push(one, two, boosted)
        assert(!matchesBraveCondition(s, "p1", one, BRAVE), "シンボル1の合体先は条件を満たさない")
        assert(matchesBraveCondition(s, "p1", two, BRAVE), "シンボル2の合体先は条件を満たす")
        assert(matchesBraveCondition(s, "p1", boosted, BRAVE), "場でシンボルが2に増えた合体先も満たす")
    } finally {
        c.braveCondition = saved!
    }
}

console.log("すべてのチェックに合格しました 🎉（part634）")
