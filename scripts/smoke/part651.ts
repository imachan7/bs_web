// smoke パート651（BS18 部品：バースト条件を無視したバースト発動 activateBurstIgnoringCondition。BURST.md §7）
import { assert, createGame, createInstance, getCard, placeBurst, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const COND_BURST = "BS14-020" // ナスノ・アーチャー（紫・バースト条件：自分のトラッシュの紫が4枚以上。召喚）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard(COND_BURST)
    assert(c.name === "ナスノ・アーチャー" && c.colors.includes("purple") && c.type === "spirit", "COND_BURSTは紫のスピリット")
    assert(c.effects.some((e) => e.kind === "burst" && e.condition !== undefined), "バースト条件を持つ")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLA")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.trashCards = []
    return s
}
const onField = (s: GameState, id: string): boolean => s.players.p1.field.spirits.some((x) => x.cardId === id)

console.log("=== 1. セット中のバーストを条件を無視して発動する ===")
{
    const s = game("c1")
    placeBurst(s, "p1", COND_BURST)
    resolveAction(s, "p1", null, { type: "activateBurstIgnoringCondition", from: "set", filter: { color: "purple" } })
    assert(onField(s, COND_BURST), "条件（トラッシュの紫4枚）を満たさなくても召喚された")
    assert(s.players.p1.burst === null, "バーストエリアは空")
}

console.log("=== 2. 境界：フィルタに合わない／セットが無いと何も起きない ===")
{
    const s = game("c2")
    placeBurst(s, "p1", COND_BURST)
    resolveAction(s, "p1", null, { type: "activateBurstIgnoringCondition", from: "set", filter: { color: "red" } })
    assert(!onField(s, COND_BURST) && s.players.p1.burst === COND_BURST, "赤でないので発動せずセットされたまま")
    const t = game("c2b")
    resolveAction(t, "p1", null, { type: "activateBurstIgnoringCondition", from: "set" })
    assert(t.players.p1.field.spirits.length === 0, "セットが無ければ不発")
}

console.log("=== 3. 公開中のカードからバースト持ちを1枚選んで発動する ===")
{
    const s = game("c3")
    s.revealedCards = { pid: "p1", cardIds: [VANILLA, COND_BURST] }
    resolveAction(s, "p1", null, { type: "activateBurstIgnoringCondition", from: "revealed" })
    assert(onField(s, COND_BURST), "公開中のバーストが条件を無視して召喚された")
    assert(s.revealedCards?.cardIds.join() === VANILLA, "バーストを持たないカードは公開中に残る")
}

console.log("=== 4. 境界：公開中にバースト持ちが無ければ不発 ===")
{
    const s = game("c4")
    s.revealedCards = { pid: "p1", cardIds: [VANILLA] }
    resolveAction(s, "p1", null, { type: "activateBurstIgnoringCondition", from: "revealed" })
    assert(s.players.p1.field.spirits.length === 0 && s.revealedCards?.cardIds.length === 1, "何も起きない")
}

console.log("=== 5. 境界：通常の発動では条件未達で空振り（対比） ===")
{
    const s = game("c5")
    s.revealedCards = { pid: "p1", cardIds: [COND_BURST] }
    resolveAction(s, "p1", null, { type: "moveCards", from: "revealed", count: 1, dest: "activateBurst" })
    assert(!onField(s, COND_BURST), "ignoreBurstCondition なしなら条件未達で召喚されない")
}

console.log("=== 6. 境界：相手の「〜のバーストを発動できない」は条件を無視しても効く ===")
{
    const effects = getCard(VANILLA).effects
    effects.push({ id: "tmp-nb", kind: "globalConstraint", levels: [1, 2, 3], constraint: { type: "noBurstActivationByEvent", events: ["ownLifeDamaged"] } } as (typeof effects)[number])
    try {
        const s = game("c6")
        s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
        refreshLevelAsOverrides(s)
        placeBurst(s, "p1", COND_BURST)
        resolveAction(s, "p1", null, { type: "activateBurstIgnoringCondition", from: "set" })
        assert(!onField(s, COND_BURST) && s.players.p1.burst === COND_BURST, "set：禁じられているので発動せずセットされたまま")
        const t = game("c6b")
        t.players.p2.field.spirits.push(createInstance(VANILLA, t.turn, 1))
        refreshLevelAsOverrides(t)
        t.revealedCards = { pid: "p1", cardIds: [COND_BURST] }
        resolveAction(t, "p1", null, { type: "activateBurstIgnoringCondition", from: "revealed" })
        assert(!onField(t, COND_BURST) && t.revealedCards?.cardIds.join() === COND_BURST, "revealed：発動できず公開中に残る")
    } finally {
        effects.pop()
    }
}

console.log("すべてのチェックに合格しました 🎉（part651）")
