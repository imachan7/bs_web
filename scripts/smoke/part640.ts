// smoke パート640（BS18 部品：globalConstraint noBurstActivationByEvent。BS18-022／023 の読み 2026-10-23 ユーザー確認）
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { act, assert, createGame, createInstance, getCard, placeBurst, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const HOLDER = "BS01-001" // ゴラドン（赤・コスト0）。テスト中だけ効果を差し込む
const CHIEF = "BS01-002" // ロクケラトプス（赤・コスト1・系統「地竜」）
const OTHER = "BS01-003" // テラノセイバー（赤・コスト2・系統「空牙」）
const BURST_MAGIC = "BS15-084" // 爆砕轟神掌。条件だけ差し替える

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HOLDER).name === "ゴラドン" && getCard(HOLDER).cost === 0, "HOLDERはゴラドン")
    assert(getCard(CHIEF).family.includes("地竜") && getCard(OTHER).family.includes("空牙"), "系統は地竜／空牙")
    assert(getCard(BURST_MAGIC).effects.some((e) => e.kind === "burst"), "爆砕轟神掌はバーストを持つ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => CHIEF)
    s.players.p2.deck = Array.from({ length: 40 }, () => CHIEF)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const effects = getCard(HOLDER).effects as unknown[]
const burst = getCard(BURST_MAGIC).effects.find((e) => e.kind === "burst") as { event: string; subjectSide?: string; byOpponentEffectOnly?: boolean | undefined; condition?: unknown }
const original = { ...burst }
// 発動されたか（ログに「バースト（…）を発動した」が出る。止められたバーストはセットされたまま残る）
const fired = (s: GameState): boolean => s.log.some((l) => l.includes("を発動した"))

function withSource(constraint: unknown, extra: object, body: () => void): void {
    effects.push({ id: "t-nba", kind: "globalConstraint", levels: [1], constraint, ...extra })
    try {
        body()
    } finally {
        effects.pop()
        Object.assign(burst, original)
    }
}

// p1 のターンのアタックステップで attackerCard がアタックしたとき、p2 のバースト（アタック後）が残るか
function attackScenario(seed: string, attackerCard: string): GameState {
    burst.event = "anySpiritAttacked"
    burst.subjectSide = "opponent"
    delete burst.byOpponentEffectOnly
    const s = game(seed)
    s.turnPlayer = "p1"
    s.phase = "attack"
    put(s, "p1", HOLDER)
    const atk = put(s, "p1", attackerCard)
    placeBurst(s, "p2", BURST_MAGIC)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックを宣言できる")
    return s
}

console.log("=== 1. 022：雄将（ここでは地竜）がアタックしている間、アタック後バーストを発動できない ===")
{
    const c = { type: "noBurstActivationByEvent", events: ["anySpiritAttacked"], whileOwnAttackerFamily: "地竜" }
    const w = { phase: "attack", turn: "own" }
    withSource(c, w, () => {
        assert(!fired(attackScenario("a-hit", CHIEF)), "系統を持つスピリットのアタックではバーストがセットされたまま残る")
        assert(fired(attackScenario("a-family", OTHER)), "系統が違うスピリットのアタックでは発動する")
    })
    withSource({ ...c, events: ["ownSpiritDestroyed"] }, w, () => {
        assert(fired(attackScenario("a-event", CHIEF)), "events に無い事象のバーストは止まらない")
    })
    withSource(c, { phase: "attack", turn: "opponent" }, () => {
        assert(fired(attackScenario("a-turn", CHIEF)), "窓（相手のアタックステップ）の外では止まらない")
    })
    withSource({ ...c, whileOwnAttackerFamily: undefined }, w, () => {
        assert(!fired(attackScenario("a-nofam", OTHER)), "系統指定なしならどのアタックでも止まる")
    })
}

console.log("=== 2. 023：相手による自分のスピリット破壊後バーストを発動できない ===")
{
    const run = (seed: string, events: string[], phase: string, atk: boolean): GameState => {
        burst.event = "ownSpiritDestroyed"
        burst.byOpponentEffectOnly = true
        let s!: GameState
        withSource({ type: "noBurstActivationByEvent", events, whileOwnAttackerFamily: "地竜" }, { phase: "attack", turn: "own" }, () => {
            s = game(seed)
            s.turnPlayer = "p1"
            s.phase = phase as GameState["phase"]
            put(s, "p1", HOLDER)
            const victim = put(s, "p2", CHIEF)
            if (atk) s.battle = { attackerInstanceId: put(s, "p1", CHIEF).instanceId } as GameState["battle"]
            placeBurst(s, "p2", BURST_MAGIC)
            destroyTargetsBatch(s, "p1", [{ pid: "p2" as PlayerId, instanceId: victim.instanceId }], { sourcePid: "p1", sourceType: "spirit" })
        })
        return s
    }
    assert(!fired(run("d-hit", ["ownSpiritDestroyed"], "attack", true)), "雄将のアタック中の破壊では発動できずセットされたまま")
    assert(fired(run("d-noatk", ["ownSpiritDestroyed"], "attack", false)), "アタック中でなければ発動する")
    assert(fired(run("d-main", ["ownSpiritDestroyed"], "main", true)), "アタックステップ以外なら発動する")
    assert(fired(run("d-event", ["anySpiritAttacked"], "attack", true)), "events に無ければ発動する")
}

console.log("すべてのチェックに合格しました 🎉（part640）")
