// smoke パート653（BURST.md §7.4：replayOpponentSummonEffect。相手の『召喚時』効果を自分のスピリットが発揮したものとして解決する）
import { assert, createGame, createInstance, getCard, resolveAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireSummonTrigger } from "../../server/src/logic/EffectModules"

const SRC = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）。召喚時の draw を一時的に足す
assert(getCard(SRC).name === "ロクケラトプス" && getCard(SRC).type === "spirit", "SRCはロクケラトプス")

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => SRC)
    s.players.p2.deck = Array.from({ length: 40 }, () => SRC)
    return s
}
function put(s: GameState, pid: PlayerId, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(SRC, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const card = getCard(SRC)
const saved = card.effects
card.effects = [{ id: "t1", kind: "triggered", trigger: "onSummon", levels: [1, 2], action: { type: "draw", count: 2 }, optional: false } as never]
try {
    console.log("=== 1. 召喚時の発揮が記録され、自分のスピリットが同じ効果を発揮する ===")
    {
        const s = game("c1")
        const opp = put(s, "p2")
        fireSummonTrigger(s, "p2", opp)
        assert(s.lastOpponentSummonEffect?.cardId === SRC && s.lastOpponentSummonEffect.level === 1, "発揮したカードとLvが記録される")
        s.players.p1.field.spirits = []
        const mine = put(s, "p1")
        const hand0 = s.players.p1.hand.length
        const oppHand0 = s.players.p2.hand.length
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        assert(s.players.p1.hand.length === hand0 + 2, "自分が2枚引く（効果文の「自分」は選んだスピリットの持ち主）")
        assert(s.players.p2.hand.length === oppHand0, "相手は引かない")
        assert(mine.instanceId !== opp.instanceId, "選んだのは自分のスピリット")
    }
    console.log("=== 2. 召喚した個体が場を離れていても発揮できる ===")
    {
        const s = game("c2")
        const opp = put(s, "p2")
        fireSummonTrigger(s, "p2", opp)
        s.players.p2.field.spirits = []
        put(s, "p1")
        const hand0 = s.players.p1.hand.length
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        assert(s.players.p1.hand.length === hand0 + 2, "召喚個体が場にいなくても記録から再発揮")
    }
    console.log("=== 3. 境界：自分のスピリットがいなければ発揮しない ===")
    {
        const s = game("c3")
        const opp = put(s, "p2")
        fireSummonTrigger(s, "p2", opp)
        s.players.p1.field.spirits = []
        const hand0 = s.players.p1.hand.length
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        assert(s.players.p1.hand.length === hand0, "スピリット不在なら何も起きない")
    }
    console.log("=== 4. 境界：記録が無ければ発揮しない／Lvが合わなければ効果なし ===")
    {
        const s = game("c4")
        put(s, "p1")
        const hand0 = s.players.p1.hand.length
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        assert(s.players.p1.hand.length === hand0, "記録なしは不発")
        s.lastOpponentSummonEffect = { cardId: SRC, level: 3 }
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        assert(s.players.p1.hand.length === hand0, "記録したLvで有効なエントリが無ければ不発")
    }
    console.log("=== 5. 対話：選択待ちになり、選んだスピリットで解決する ===")
    {
        const s = game("c5", true)
        const opp = put(s, "p2")
        fireSummonTrigger(s, "p2", opp)
        const a = put(s, "p1")
        put(s, "p1")
        const hand0 = s.players.p1.hand.length
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        assert(s.pendingChoice !== null && s.pendingChoice !== undefined && s.players.p1.hand.length === hand0, "選択待ちで止まる")
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect", chosenId: a.instanceId })
        assert(s.players.p1.hand.length === hand0 + 2, "選んだ後に解決")
    }
    console.log("=== 6. バースト発動の文脈（self=null・resolvingBurstPid）で condition を判定する ===")
    {
        card.effects = [{ id: "t2", kind: "triggered", trigger: "onSummon", levels: [1], condition: { ownHandAtLeast: 99 }, action: { type: "draw", count: 2 }, optional: false } as never]
        const s = game("c6")
        s.lastOpponentSummonEffect = { cardId: SRC, level: 1 }
        put(s, "p1")
        s.resolvingBurstPid = "p1"
        const hand0 = s.players.p1.hand.length
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        assert(s.players.p1.hand.length === hand0, "選んだスピリットの持ち主から見て条件を満たさなければ発揮しない")
        card.effects = [{ id: "t2", kind: "triggered", trigger: "onSummon", levels: [1], condition: { ownHandAtLeast: 1 }, action: { type: "draw", count: 2 }, optional: false } as never]
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        assert(s.players.p1.hand.length === hand0 + 2, "条件を満たせば発揮する")
    }
    console.log("=== 7. ターン1回は選んだスピリット側で数える／optional は確認になる ===")
    {
        card.effects = [{ id: "t3", kind: "triggered", trigger: "onSummon", levels: [1], oncePerTurn: true, action: { type: "draw", count: 1 }, optional: false } as never]
        const s = game("c7")
        s.lastOpponentSummonEffect = { cardId: SRC, level: 1 }
        put(s, "p1")
        const hand0 = s.players.p1.hand.length
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        resolveAction(s, "p1", null, { type: "replayOpponentSummonEffect" })
        assert(s.players.p1.hand.length === hand0 + 1, "同じスピリットでは2回目は発揮しない")
        card.effects = [{ id: "t4", kind: "triggered", trigger: "onSummon", levels: [1], action: { type: "draw", count: 1 }, optional: true } as never]
        const s2 = game("c7b", true)
        s2.lastOpponentSummonEffect = { cardId: SRC, level: 1 }
        const m = put(s2, "p1")
        resolveAction(s2, "p1", null, { type: "replayOpponentSummonEffect", chosenId: m.instanceId })
        assert(s2.pendingChoice !== null && s2.pendingChoice !== undefined, "「できる」は発動確認で止まる")
    }
} finally {
    card.effects = saved
}
console.log("すべてのチェックに合格しました 🎉（part653）")
