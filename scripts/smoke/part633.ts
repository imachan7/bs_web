// smoke パート633（BS18 部品7〜8：reviveOnDestroy／fieldEvent の ownHandAtLeast 条件、ownSpiritBattleEnded の familyFilter）
import { assert, createGame, createInstance, destroySpirit, fireFieldEventTriggers, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const HOLDER = "BS01-001" // ゴラドン（赤・コスト0）。テスト中だけ効果を差し込む
const CHIKURYU = "BS01-002" // ロクケラトプス（系統「地竜」）
const SORAKIBA = "BS01-003" // テラノセイバー（系統「空牙」）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HOLDER).name === "ゴラドン", "HOLDERはゴラドン")
    assert(getCard(CHIKURYU).family.includes("地竜") && getCard(SORAKIBA).family.includes("空牙"), "系統の前提")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => CHIKURYU)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function withEffects<T>(entries: unknown[], body: () => T): T {
    const effects = getCard(HOLDER).effects as unknown[]
    effects.push(...entries)
    try {
        return body()
    } finally {
        effects.splice(effects.length - entries.length, entries.length)
    }
}

console.log("=== 7a. reviveOnDestroy の ownHandAtLeast ===")
{
    const revive = { id: "t-revive", kind: "reviveOnDestroy", levels: [1], scope: "self", when: {}, revived: { rested: false }, condition: { ownHandAtLeast: 3 } }
    withEffects([revive], () => {
        const s = game("revive-hand-ok")
        const me = put(s, "p1", HOLDER)
        s.players.p1.hand = [CHIKURYU, CHIKURYU, CHIKURYU]
        destroySpirit(s, "p1", me.instanceId)
        assert(s.players.p1.field.spirits.includes(me), "手札3枚（しきい値ちょうど）なら破壊されず場に残る")

        const s2 = game("revive-hand-ng")
        const me2 = put(s2, "p1", HOLDER)
        s2.players.p1.hand = [CHIKURYU, CHIKURYU]
        destroySpirit(s2, "p1", me2.instanceId)
        assert(!s2.players.p1.field.spirits.includes(me2), "手札2枚では復活せず破壊される")
    })
}

console.log("=== 7b. fieldEvent の ownHandAtLeast ===")
{
    const fe = { id: "t-fe-hand", kind: "fieldEvent", event: "ownSpiritBattleEnded", levels: [1], condition: { ownHandAtLeast: 2 }, action: { type: "draw", count: 1 } }
    withEffects([fe], () => {
        for (const [hand, expectDraw] of [[2, true], [1, false]] as const) {
            const s = game(`fe-hand-${hand}`)
            put(s, "p1", HOLDER)
            const subject = put(s, "p1", CHIKURYU)
            s.players.p1.hand = Array.from({ length: hand }, () => CHIKURYU)
            fireFieldEventTriggers(s, "p1", "ownSpiritBattleEnded", { pid: "p1", inst: subject }, ["red"])
            assert(s.players.p1.hand.length === hand + (expectDraw ? 1 : 0), `手札${hand}枚：${expectDraw ? "発火する" : "発火しない"}`)
        }
    })
}

console.log("=== 8. ownSpiritBattleEnded の familyFilter ===")
{
    const fe = { id: "t-fe-family", kind: "fieldEvent", event: "ownSpiritBattleEnded", levels: [1], subjectFilter: { family: "地竜" }, action: { type: "draw", count: 1 } }
    withEffects([fe], () => {
        const s = game("fe-family-ok")
        put(s, "p1", HOLDER)
        const chi = put(s, "p1", CHIKURYU)
        const before = s.players.p1.hand.length
        fireFieldEventTriggers(s, "p1", "ownSpiritBattleEnded", { pid: "p1", inst: chi }, ["red"])
        assert(s.players.p1.hand.length === before + 1, "バトルしたスピリットが地竜なら発火する")

        const s2 = game("fe-family-ng")
        put(s2, "p1", HOLDER)
        const sora = put(s2, "p1", SORAKIBA)
        const before2 = s2.players.p1.hand.length
        fireFieldEventTriggers(s2, "p1", "ownSpiritBattleEnded", { pid: "p1", inst: sora }, ["red"])
        assert(s2.players.p1.hand.length === before2, "空牙なら発火しない")
    })
}

console.log("すべてのチェックに合格しました 🎉（part633）")
