// smoke パート652（BS18 部品：キーワード【バースト転召】。BURST.md §7.4）
import { assert, createGame, createInstance, getCard, placeBurst, refreshLevelAsOverrides, resolveAction, runTurnStart, spiritHasKeyword } from "./helpers"
import { tenshoSpecOf } from "../../server/src/logic/keywords/tensho"
import type { GameState } from "./helpers"

const HOST = "SD06-007" // 英雄龍ロード・ドラゴン（赤・覇皇・バースト召喚）。一時的に【バースト転召】を足す
const SACRIFICE = "BS16-X01" // 覇皇
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HOST).name === "英雄龍ロード・ドラゴン" && getCard(HOST).family.includes("覇皇"), "HOST")
    assert(getCard(SACRIFICE).name.includes("バゼル") && getCard(SACRIFICE).family.includes("覇皇"), "SACRIFICE")
    assert(getCard(VANILLA).family.every((f) => f !== "覇皇"), "VANILLAは覇皇でない")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    return s
}
const burstSummon = (s: GameState): void => {
    placeBurst(s, "p1", HOST)
    resolveAction(s, "p1", null, { type: "activateBurstIgnoringCondition", from: "set" })
}

const effects = getCard(HOST).effects
effects.push({ id: "tmp-bt", kind: "keyword", keyword: "burstTensho", levels: [1, 2, 3], familyFilter: ["覇皇"], dest: "void" } as (typeof effects)[number])
try {
    console.log("=== 1. バーストで召喚すると【転召】の手順で覇皇のコアがボイドへ ===")
    {
        const s = game("c1")
        const sac = createInstance(SACRIFICE, s.turn, 2)
        s.players.p1.field.spirits.push(sac)
        refreshLevelAsOverrides(s)
        burstSummon(s)
        assert(s.players.p1.field.spirits.some((x) => x.cardId === HOST), "召喚された")
        assert(!s.players.p1.field.spirits.some((x) => x.instanceId === sac.instanceId), "覇皇のコアがすべて取り除かれ消滅した")
        const me = s.players.p1.field.spirits.find((x) => x.cardId === HOST)!
        assert(spiritHasKeyword(s, "p1", me, "tensho"), "【転召】を持つものとして扱われる")
    }

    console.log("=== 2. 境界：覇皇がいなければ召喚できない ===")
    {
        const s = game("c2")
        s.players.p1.field.spirits.push(createInstance(VANILLA, s.turn, 1))
        burstSummon(s)
        assert(!s.players.p1.field.spirits.some((x) => x.cardId === HOST), "生贄がいないので召喚されない")
        assert(s.players.p1.trashCards.includes(HOST), "バーストのカードはトラッシュへ")
    }

    console.log("=== 2b. 境界：召喚できなければ続きのアクションも走らない（この効果発揮後） ===")
    {
        const run = (withSacrifice: boolean): GameState => {
            const s = game(withSacrifice ? "c2b1" : "c2b0")
            s.players.p1.field.spirits.push(createInstance(withSacrifice ? SACRIFICE : VANILLA, s.turn, 1))
            refreshLevelAsOverrides(s)
            placeBurst(s, "p1", HOST)
            const before = s.players.p1.reserve
            resolveAction(s, "p1", null, { type: "sequence", keepScope: true, actions: [
                { type: "summonBurstCardFree" },
                { type: "if", cond: { last: { cardType: "spirit" } }, then: { type: "draw", count: 1 } },
            ] } as never)
            s.players.p1.reserve = before
            return s
        }
        const none = run(false)
        const ok = run(true)
        assert(none.players.p1.hand.length === game("x").players.p1.hand.length, "召喚できないので続き（ドロー）は起きない")
        assert(ok.players.p1.hand.length === game("x").players.p1.hand.length + 1, "召喚できれば続きが走る")
    }

    console.log("=== 3. 境界：手札など通常の召喚では転召の手順に入らない ===")
    {
        assert(tenshoSpecOf(getCard(HOST), 1) === null, "通常の召喚では tenshoSpecOf が空")
        assert(tenshoSpecOf(getCard(HOST), 1, true) !== null, "バースト経由なら転召の仕様が出る")
    }
} finally {
    effects.pop()
}

console.log("すべてのチェックに合格しました 🎉（part652）")
