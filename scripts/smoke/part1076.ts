// smoke パート1076（アルティメットの土台 段4：召喚条件。docs/design/ULTIMATE.md §6・ULTIMATE_PLAN A1〜A6）
import { assert, createGame, createInstance, getCard, handleAction, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction, IfCond } from "../../server/src/type"
import { CARD_DB } from "../../server/src/logic/GameState"
import { sweepLevelCostDepletion } from "../../server/src/logic/EffectModules"
import { summonConditionMet } from "../../server/src/logic/summonGate"

const RED = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const WHITE = "BS01-074" // バーサーカー・ガン（白）
const NEXUS = "BS01-098" // 燃えさかる戦場（ネクサス）
const lv = [{ level: 3, cores: 1, bp: 5000 }, { level: 4, cores: 3, bp: 7000 }]
const redOne: IfCond = { count: { ownSpirits: { color: "red" } }, atLeast: 1 }
const whiteOne: IfCond = { count: { ownSpirits: { color: "white" } }, atLeast: 1 }
const nexusOne: IfCond = { count: "ownNexuses", atLeast: 1 }
function ult(id: string, summonCondition: IfCond): string {
    CARD_DB.set(id, { ...getCard(RED), cardId: id, type: "ultimate", levels: lv, summonCondition })
    return id
}
const U_RED = ult("TEST-U1", redOne)
const U_BOTH = ult("TEST-U2", { allOf: [redOne, whiteOne] })
const U_NEX = ult("TEST-U3", { anyOf: [{ allOf: [redOne, whiteOne] }, nexusOne] })

try {
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).colors[0] === "red", "REDは赤スピリット")
    assert(getCard(WHITE).colors[0] === "white" && getCard(NEXUS).type === "nexus", "WHITEは白・NEXUSはネクサス")

    const game = (seed: string, hand: string[] = []): GameState => {
        const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
        runTurnStart(s)
        s.turn = 3
        s.players.p1.reserve = 10
        s.players.p1.hand = [...hand]
        return s
    }
    const put = (s: GameState, id: string, cores = 1) => {
        const i = createInstance(id, s.turn, cores)
        s.players.p1.field.spirits.push(i)
        return i
    }
    const summonUlt = (s: GameState, extra: object = {}) => handleAction(s, "p1", { type: "summon", handIndex: 0, ...extra } as never)

    console.log("=== A. 宣言時の条件 ===")
    {
        const s = game("u-a1", [U_RED])
        assert(!summonConditionMet(s, "p1", getCard(U_RED)), "赤スピリット0体では条件を満たさない")
        summonUlt(s)
        assert(s.players.p1.hand[0] === U_RED && s.players.p1.field.ultimates.length === 0, "赤0体では手札から召喚できない")
    }
    {
        const s = game("u-a2", [U_RED])
        put(s, WHITE)
        summonUlt(s)
        assert(s.players.p1.field.ultimates.length === 0, "白スピリットだけでは召喚できない")
    }
    {
        const s = game("u-a3", [U_RED])
        put(s, RED)
        summonUlt(s)
        assert(s.players.p1.field.ultimates.length === 1 && s.players.p1.hand.length === 0, "赤1体なら召喚でき field.ultimates に置かれる")
        assert(!s.players.p1.field.spirits.some((x) => x.cardId === U_RED), "field.spirits には入らない")
        assert(s.players.p1.field.ultimates[0]!.cores === 1, "最小Lv（Lv3）のコア1個で置かれる")
    }

    console.log("=== B. A1：支払いで条件のスピリットが消えても召喚できる ===")
    {
        const s = game("u-b", [U_RED])
        const r = put(s, RED, 1)
        s.players.p1.reserve = 0
        summonUlt(s, { paySources: [{ type: "spirit", instanceId: r.instanceId, count: 1 }] })
        assert(s.players.p1.field.ultimates.length === 1, "支払いで赤スピリットのコアを使っても召喚は成立する")
        assert(!s.players.p1.field.spirits.includes(r), "赤スピリットはコアを失って消滅した")
    }

    console.log("=== C. A6：破壊待機の赤スピリットも数える ===")
    {
        const s = game("u-c", [U_RED])
        const r = put(s, RED)
        r.waiting = { kind: "destroy", event: "t" }
        assert(summonConditionMet(s, "p1", getCard(U_RED)), "破壊待機の赤スピリットでも条件を満たす")
    }

    console.log("=== D. A2・A3：効果の無償召喚でも条件が要る ===")
    const free: EffectAction = { type: "moveCards", from: "trash", dest: "summon", pick: { cardType: "ultimate" }, count: 1 } as never
    {
        const s = game("u-d1")
        s.players.p1.trashCards = [U_RED]
        resolveAction(s, "p1", null, free)
        assert(s.players.p1.field.ultimates.length === 0 && s.players.p1.trashCards.includes(U_RED), "条件未達ならトラッシュから召喚されず元の場所に残る")
    }
    {
        const s = game("u-d2")
        put(s, RED)
        s.players.p1.trashCards = [U_RED]
        resolveAction(s, "p1", null, free)
        assert(s.players.p1.field.ultimates.length === 1 && !s.players.p1.trashCards.includes(U_RED), "条件を満たせばトラッシュから召喚され field.ultimates に置かれる")
    }
    const fromHand: EffectAction = { type: "moveCards", from: "hand", dest: "summon", pick: { cardType: "ultimate" }, count: 1 } as never
    {
        const s = game("u-d3", [U_RED])
        resolveAction(s, "p1", null, fromHand)
        assert(s.players.p1.field.ultimates.length === 0 && s.players.p1.hand.includes(U_RED), "手札からの無償召喚も条件未達なら不発で手札に残る")
        const t = game("u-d4", [U_RED])
        put(t, RED)
        resolveAction(t, "p1", null, fromHand)
        assert(t.players.p1.field.ultimates.length === 1, "対照：条件を満たせば手札からの無償召喚が成立する")
    }

    console.log("=== D2. バーストの召喚 ===")
    const burstSummon: EffectAction = { type: "summon", from: "burst" }
    {
        const s = game("u-g1")
        s.players.p1.burst = U_RED
        resolveAction(s, "p1", null, burstSummon)
        assert(s.players.p1.field.ultimates.length === 0 && s.players.p1.trashCards.includes(U_RED) && s.players.p1.burst === null, "条件未達のバーストは召喚されず、発動したバーストとしてトラッシュへ")
    }
    {
        const s = game("u-g2")
        put(s, RED)
        s.players.p1.burst = U_RED
        resolveAction(s, "p1", null, burstSummon)
        assert(s.players.p1.field.ultimates.length === 1, "条件を満たすバーストは field.ultimates へ召喚される")
    }

    console.log("=== E. allOf・anyOf ===")
    {
        const s = game("u-e")
        const card = (id: string) => getCard(id)
        put(s, RED)
        assert(!summonConditionMet(s, "p1", card(U_BOTH)), "allOf：赤だけでは不可")
        put(s, WHITE)
        assert(summonConditionMet(s, "p1", card(U_BOTH)), "allOf：赤と白で可")
        const t = game("u-e2")
        put(t, RED)
        assert(!summonConditionMet(t, "p1", card(U_NEX)), "anyOf：赤だけ（ネクサスなし）では不可")
        t.players.p1.field.nexuses.push(createInstance(NEXUS, t.turn, 1))
        assert(summonConditionMet(t, "p1", card(U_NEX)), "anyOf：ネクサスだけで可")
    }

    console.log("=== F. 召喚したアルティメットの維持コア ===")
    {
        const s = game("u-f", [U_RED])
        put(s, RED)
        summonUlt(s)
        const u = s.players.p1.field.ultimates[0]!
        assert(u !== undefined && u.cores === 1, "（前提）Lv3の最小コア1個で召喚された")
        sweepLevelCostDepletion(s)
        assert(s.players.p1.field.ultimates.includes(u), "Lv3の最小コア1個なら消滅しない")
        u.levelCostBonusContinuous = 3
        sweepLevelCostDepletion(s)
        assert(!s.players.p1.field.ultimates.includes(u), "維持コアを割ると消滅する")
    }
} catch (e) {
    console.error("例外:", e)
    process.exitCode = 1
}

console.log("すべてのチェックに合格しました 🎉（part1076）")
