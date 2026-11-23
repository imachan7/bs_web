// smoke パート1051（効果の解決通知：スピリットの効果が解決を始めたとき "effect" の出来事を1件だけ出す。マジック・効果なしでは出さない）
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { GameEvent } from "../../server/src/type"

const ON_SUMMON = "BS01-030" // グリプ・ハンズ（紫・召喚時ドロー）
const ON_ATTACK = "BS01-034" // バイ・パイソン（紫・アタック時ドロー）
const SUMMON_PICK = "BS01-063" // エメラルドシーザー（緑・召喚時に相手スピリット1体を疲労）
const MAGIC = "BS01-136" // ギャザーフォース（メインでコア1個）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, type] of [[ON_SUMMON, "グリプ・ハンズ", "spirit"], [ON_ATTACK, "バイ・パイソン", "spirit"], [SUMMON_PICK, "エメラルドシーザー", "spirit"], [MAGIC, "ギャザーフォース", "magic"], [VANILLA, "ロクケラトプス", "spirit"]] as const) {
    assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
}
assert(getCard(ON_SUMMON).effect.includes("『このスピリットの召喚時』") && getCard(ON_ATTACK).effect.includes("『このスピリットのアタック時』"), "効果文の見出しを確認")

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
const effects = (s: GameState): Extract<GameEvent, { type: "effect" }>[] => s.events.filter((e): e is Extract<GameEvent, { type: "effect" }> => e.type === "effect")

console.log("=== 1. 召喚時の効果で出る ===")
{
    const s = game("n1")
    s.players.p1.hand = [ON_SUMMON]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    const ev = effects(s)
    assert(ev.length === 1 && ev[0]!.pid === "p1" && ev[0]!.cardId === ON_SUMMON, "effect が1件・持ち主と cardId が合う")
    assert(ev[0]!.heading?.includes("このスピリットの召喚時") === true, "見出しは召喚時")
    assert(ev[0]!.instanceId === s.players.p1.field.spirits[0]!.instanceId, "発生源の個体")
}

console.log("=== 2. アタック時の効果で出る ===")
{
    const s = game("n2")
    s.players.p1.hand = [ON_ATTACK]
    handleAction(s, "p1", { type: "summon", handIndex: 0 })
    s.players.p1.field.spirits[0]!.summonedTurn = 0
    handleAction(s, "p1", { type: "nextPhase" })
    assert(handleAction(s, "p1", { type: "attack", instanceId: s.players.p1.field.spirits[0]!.instanceId }) === null, "アタックできる")
    const ev = effects(s)
    assert(ev.length === 1 && ev[0]!.cardId === ON_ATTACK && ev[0]!.heading?.includes("アタック時") === true, "アタック時の effect が1件")
}

console.log("=== 3. マジックでは出ない ===")
{
    const s = game("n3")
    s.players.p1.hand = [MAGIC]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "マジックを使える")
    assert(s.events.some((e) => e.type === "magic") && effects(s).length === 0, "magic だけで effect は出ない")
}

console.log("=== 4. 効果を持たないスピリットでは出ない ===")
{
    const s = game("n4")
    s.players.p1.hand = [VANILLA]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(effects(s).length === 0, "effect は出ない")
}

console.log("=== 5. 選ぶ場面で中断・再開しても1回だけ ===")
{
    const s = game("n5", true)
    s.players.p1.hand = [SUMMON_PICK]
    s.players.p2.field.spirits.push(...[0, 1].map(() => { return createInstance(VANILLA, s.turn, 1) }))
    let total = 0
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    total += effects(s).length
    assert(s.pendingChoice !== undefined && s.pendingChoice !== null, "対象を選ぶ場面で止まる")
    for (let i = 0; s.pendingChoice && i < 5; i++) {
        const pc = s.pendingChoice
        const target = s.players.p2.field.spirits[0]!.instanceId
        handleAction(s, pc.pid, { type: "resolveChoice", instanceId: target })
        total += effects(s).length
    }
    assert(total === 1, `effect は合計1件（${total}）`)
}

console.log("すべてのチェックに合格しました 🎉（part1051）")
