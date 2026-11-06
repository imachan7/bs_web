// smoke パート805（BS21-052：相手のバーストの発動を、経路を問わず・非対話でも無効にする。part804 の補完）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import { activateBurstCard } from "../../server/src/logic/keywords/burst"
import type { GameState, PlayerId } from "./helpers"

const BLD = "BS21-052" // 十剣聖ブールド・サイノス
const YASHI = "BS21-053" // 星喰いのヤシガニド（異合・Lv1=3000 / Lv2=8000）
const HYOGAN = "SD06-016" // 絶甲氷盾（バースト：ボイドからコア1個を自分のライフに置く）
const VAN = "BS01-002" // ロクケラトプス

console.log("=== 前提 ===")
assert(getCard(BLD).name === "十剣聖ブールド・サイノス" && getCard(YASHI).family.includes("異合") && getCard(HYOGAN).name === "絶甲氷盾", "カードの確認")

function game(seed: string, interactive: boolean, phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "yellow" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = phase
    s.interactiveTargets = interactive
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const has = (s: GameState, pid: PlayerId, id: string): boolean => s.players[pid].field.spirits.some((x) => x.instanceId === id)

console.log("=== E1: 非対話（自動）：払えるなら実効BPの最も低い異合を自動で破壊して無効 ===")
{
    const s = game("e1", false)
    put(s, "p1", BLD, 1)
    const strong = put(s, "p1", YASHI, 4) // Lv2・8000
    const weak = put(s, "p1", YASHI, 1) // Lv1・3000
    const van = put(s, "p1", VAN, 1)
    s.players.p2.burst = HYOGAN
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "アタックできる")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(!has(s, "p1", weak.instanceId) && has(s, "p1", strong.instanceId), "BPの低い異合だけが破壊される")
    assert(s.pendingChoice === null && s.players.p2.burst === null && s.players.p2.trashCards.includes(HYOGAN), "確認は出ず、バーストはトラッシュへ")
    assert(s.players.p2.life === 4, "絶甲氷盾の効果は起きない")
}
console.log("=== E2: 非対話：異合がいなければ普通に発動 ===")
{
    const s = game("e2", false)
    put(s, "p1", BLD, 1)
    const van = put(s, "p1", VAN, 1)
    s.players.p2.burst = HYOGAN
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "アタックできる")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(s.players.p2.life === 5, "効果が起きる（ライフ5）")
}
console.log("=== E3: activateBurstCard 経由（効果でめくった発動）も聞かれる：承認で無効 ===")
{
    const s = game("e3", true)
    put(s, "p1", BLD, 1)
    const yashi = put(s, "p1", YASHI, 1)
    activateBurstCard(s, "p2", HYOGAN, true)
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p1" && pc.burstNegate !== undefined, "052 の持ち主 p1 に確認が出る")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: yashi.instanceId }) === null, "破壊を選ぶ")
    assert(!has(s, "p1", yashi.instanceId), "異合が破壊される")
    assert(s.pendingChoice === null && s.players.p2.burst === null && s.players.p2.trashCards.includes(HYOGAN) && s.players.p2.life === 5, "バーストは無効でトラッシュへ・効果は起きない")
}
console.log("=== E4: activateBurstCard 経由：断れば普通に解決 ===")
{
    const s = game("e4", true)
    put(s, "p1", BLD, 1)
    const yashi = put(s, "p1", YASHI, 1)
    activateBurstCard(s, "p2", HYOGAN, true)
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "断る")
    let guard = 0
    while (s.pendingChoice && guard++ < 5) {
        const pc = s.pendingChoice
        if (pc.burstNegate) assert(false, "二重に聞かれない")
        act(s, pc.pid, { type: "resolveChoice", ...(pc.options ? { option: pc.options[0] } : {}) })
    }
    assert(has(s, "p1", yashi.instanceId) && s.players.p2.life === 6 && s.players.p2.trashCards.includes(HYOGAN), "発動して効果が起きる（ライフ5→6）・トラッシュへ")
}
console.log("=== E5: activateBurstCard 経由・非対話：自動で無効 ===")
{
    const s = game("e5", false)
    put(s, "p1", BLD, 1)
    const yashi = put(s, "p1", YASHI, 1)
    activateBurstCard(s, "p2", HYOGAN, true)
    assert(!has(s, "p1", yashi.instanceId) && s.players.p2.life === 5 && s.players.p2.trashCards.includes(HYOGAN) && s.players.p2.burst === null, "異合が破壊され、バーストは無効")
}
console.log("=== E6: アタックステップ以外では無効にしない ===")
{
    const s = game("e6", false, "main")
    put(s, "p1", BLD, 1)
    const yashi = put(s, "p1", YASHI, 1)
    activateBurstCard(s, "p2", HYOGAN, true)
    assert(has(s, "p1", yashi.instanceId) && s.players.p2.life === 6, "メインステップなので無効にならない（効果が起きる）")
}
console.log("すべてのチェックに合格しました 🎉（part805）")
