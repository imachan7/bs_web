// smoke パート412（destroyNexus の filter と、ネクサスを含む「指定する」3枚を実カードデータで解決する。DECLARE_UNIFY §2）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance, EffectAction, PlayerId } from "../../server/src/type"

const HAMMER = "BS11-073" // バスターハンマー
const PLESIOS = "BS02-010" // 溶海竜プレシオス
const MATADORA = "BS15-055" // マタドーラ
const ELK = "BS03-007" // フレイム・エルク
const N_RED = "BS01-098" // 燃えさかる戦場（赤）
const N_PURPLE = "BS01-102" // 主無き古城（紫）
const N_GREEN = "BS01-106" // 緑のネクサス
const S_RED = "BS01-001" // ゴラドン（赤）
const S_PURPLE = "BS01-031" // デス・ハーデス（紫）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HAMMER).name === "バスターハンマー" && getCard(PLESIOS).name === "溶海竜プレシオス", "HAMMER／PLESIOS")
    assert(getCard(MATADORA).name === "マタドーラ" && getCard(ELK).name === "フレイム・エルク", "MATADORA／ELK")
    assert(getCard(S_PURPLE).colors.join() === "purple" && getCard(S_RED).colors.join() === "red", "S_RED／S_PURPLE")
    for (const [id, c] of [[N_RED, "red"], [N_PURPLE, "purple"], [N_GREEN, "green"]] as const) {
        assert(getCard(id).type === "nexus" && getCard(id).colors.join() === c, `${id} は${c}のネクサス`)
    }
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    return s
}
function nexus(s: GameState, pid: PlayerId, id: string, cores = 0): CardInstance {
    const n = createInstance(id, s.turn, cores)
    s.players[pid].field.nexuses.push(n)
    return n
}
const on = (s: GameState, n: CardInstance): boolean => [...s.players.p1.field.nexuses, ...s.players.p2.field.nexuses].includes(n)
function actionOf(cardId: string, eid: string): EffectAction {
    return (getCard(cardId).effects!.find((e) => e.id === eid) as { action: EffectAction }).action
}

console.log("=== 1. バスターハンマー：6色から指定し、その色のネクサスすべて（両陣営）を破壊して1つにつき1枚引く ===")
{
    const s = game("hammer")
    const a = nexus(s, "p1", N_PURPLE)
    const b = nexus(s, "p2", N_PURPLE)
    const c = nexus(s, "p2", N_RED)
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", null, actionOf(HAMMER, "BS11-073-e1"))
    assert(s.pendingChoice?.options?.length === 6, "6色が候補")
    act(s, "p1", { type: "resolveChoice", option: "紫" })
    assert(!on(s, a) && !on(s, b) && on(s, c), "紫だけ破壊")
    assert(s.players.p1.hand.length === hand + 2, "2つ破壊して2枚引く")
}

console.log("=== 2. プレシオス：ネクサスが合計3色未満なら何もしない ===")
{
    const s = game("plesios-2")
    const a = nexus(s, "p1", N_RED)
    const b = nexus(s, "p2", N_PURPLE)
    resolveAction(s, "p1", null, actionOf(PLESIOS, "BS02-010-e1"))
    assert(s.pendingChoice === null && on(s, a) && on(s, b), "2色なので指定もしない")
}

console.log("=== 3. プレシオス：3色以上なら、お互い自分のネクサスの色から指定し、指定されなかった色を破壊 ===")
{
    const s = game("plesios-3")
    const r = nexus(s, "p1", N_RED)
    const p = nexus(s, "p1", N_PURPLE)
    const g = nexus(s, "p2", N_GREEN)
    const r2 = nexus(s, "p2", N_RED)
    resolveAction(s, "p1", null, actionOf(PLESIOS, "BS02-010-e1"))
    assert(s.pendingChoice?.pid === "p1" && s.pendingChoice.options?.join() === "赤,紫", "自分のネクサスの色から選ぶ")
    act(s, "p1", { type: "resolveChoice", option: "紫" })
    assert(s.pendingChoice?.pid === "p2" && s.pendingChoice.options?.join() === "赤,緑", "相手も自分のネクサスの色から選ぶ")
    act(s, "p2", { type: "resolveChoice", option: "緑" })
    assert(on(s, p) && on(s, g) && !on(s, r) && !on(s, r2), "紫と緑は残り、赤は両陣営とも破壊")
}

console.log("=== 4. マタドーラ：相手が指定した色以外の相手のスピリットとネクサスを破壊 ===")
{
    const s = game("matadora")
    const sp = createInstance(S_RED, s.turn, 1)
    const sp2 = createInstance(S_PURPLE, s.turn, 1)
    s.players.p2.field.spirits.push(sp, sp2)
    const red = nexus(s, "p2", N_RED)
    const purple = nexus(s, "p2", N_PURPLE)
    resolveAction(s, "p1", null, actionOf(MATADORA, "BS15-055-e1"))
    assert(s.pendingChoice?.pid === "p2", "相手が指定する")
    act(s, "p2", { type: "resolveChoice", option: "赤" })
    assert(s.players.p2.field.spirits.includes(sp) && !s.players.p2.field.spirits.includes(sp2), "紫のスピリットを破壊")
    assert(on(s, red) && !on(s, purple), "紫のネクサスも破壊")
}

console.log("=== 5. フレイム・エルク：コアが1個以上置かれているネクサスすべて（両陣営）を破壊 ===")
{
    const s = game("elk")
    const a = nexus(s, "p1", N_RED, 1)
    const b = nexus(s, "p1", N_PURPLE, 0)
    const c = nexus(s, "p2", N_GREEN, 2)
    resolveAction(s, "p1", null, actionOf(ELK, "e1"))
    assert(!on(s, a) && on(s, b) && !on(s, c), "コアのあるネクサスだけ破壊")
}

console.log("すべてのチェックに合格しました 🎉（part412）")
