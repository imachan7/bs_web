// smoke パート971（AI がブレイヴを手札から召喚する手を列挙する。単体の召喚・合体しての召喚・フラッシュの神速の3場面）
import { assert, createGame, createInstance, getCard, handleAction, hasKeyword, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import { pumpAiSync } from "../../server/src/ai/runner"
import { bravesOf } from "../../shared/rules"

const BRAVE = "BS19-X07" // 黒蟲の妖刀ウスバカゲロウ（緑・コスト5・【神速】・合体条件はコスト5以上）
const HOST = "BS19-031" // トキイロシダレ（緑・コスト5・効果なしのスピリット）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BRAVE).name === "黒蟲の妖刀ウスバカゲロウ" && getCard(BRAVE).type === "brave", "BRAVEはブレイヴ")
    assert(hasKeyword(BRAVE, "soku"), "BRAVEは【神速】持ち")
    assert(getCard(HOST).name === "トキイロシダレ" && getCard(HOST).type === "spirit" && getCard(HOST).cost === 5, "HOSTはコスト5のスピリット")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== A. メインステップ：手札のブレイヴに単体の召喚と合体しての召喚の両方がある ===")
{
    const s = game("brave-main")
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.hand = [BRAVE]
    const host = put(s, "p1", HOST, 1)
    const summons = enumerateLegalMoves(s, "p1").filter((m) => m.action.type === "summon")
    const single = summons.find((m) => m.action.type === "summon" && m.action.braveTargetInstanceId === undefined)
    const combined = summons.find((m) => m.action.type === "summon" && m.action.braveTargetInstanceId === host.instanceId)
    assert(single !== undefined, "単体で召喚する手が列挙される")
    assert(combined !== undefined, "トキイロシダレに合体して召喚する手が列挙される")
    assert(combined !== undefined && handleAction(s, "p1", combined.action) === null, "合体の手はサーバーも受理する")
    assert(combined !== undefined && bravesOf(s.players.p1, host).length === 1, "合体の手で実際にブレイヴが合体する")
}

console.log("=== B. フラッシュタイミング：神速のブレイヴが、フィールドのコアでは払えないときは出ない ===")
{
    const attackerSetup = (reserve: number): GameState => {
        const s = game(`brave-soku-${reserve}`)
        s.turn = 4
        s.turnPlayer = "p2"
        s.phase = "attack"
        s.players.p1.hand = [BRAVE]
        s.players.p1.reserve = reserve
        put(s, "p1", VANILLA, 5) // 払えるのはフィールドのコアだけ
        const atk = put(s, "p2", VANILLA, 1)
        assert(handleAction(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタックする")
        let guard = 0
        while (s.isFlashTiming && s.priorityPlayer !== "p1" && guard++ < 10) handleAction(s, s.priorityPlayer, { type: "pass" })
        return s
    }
    const hasSoku = (s: GameState): boolean =>
        enumerateLegalMoves(s, "p1").some((m) => m.action.type === "summon" && m.action.handIndex === 0)

    const dry = attackerSetup(0)
    assert(dry.isFlashTiming && dry.priorityPlayer === "p1", "p1 がフラッシュの優先権を持つ")
    assert(!hasSoku(dry), "リザーブが空なら神速の召喚は列挙されない")

    const ok = attackerSetup(10)
    assert(hasSoku(ok), "リザーブがあれば神速の召喚が列挙される")
}

console.log("=== C. AI 対 AI：ブレイヴを含むデッキで、AI がブレイヴを場に出す ===")
{
    const s = createGame("ai-brave-selfplay", { p1: "AI赤", p2: "AI紫" }, { p1: "green", p2: "purple" })
    s.interactiveTargets = true
    s.players.p1.deck = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? BRAVE : HOST))
    s.players.p2.deck = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? BRAVE : HOST))
    runTurnStart(s)
    const seen = new Set<string>()
    const scan = (): void => {
        for (const pid of ["p1", "p2"] as const) {
            const pl = s.players[pid]
            for (const sp of pl.field.spirits) {
                if (sp.cardId === BRAVE) seen.add(sp.instanceId)
                for (const b of bravesOf(pl, sp)) if (b.cardId === BRAVE) seen.add(b.instanceId)
            }
        }
    }
    let total = 0
    while (!s.winner && total < 6000) {
        const acted = (["p1", "p2"] as PlayerId[]).reduce((sum, pid) => sum + pumpAiSync(s, pid, 60), 0)
        scan()
        if (acted === 0) break
        total += acted
    }
    assert(seen.size >= 1, `AI がブレイヴを場に出した（${seen.size}回・${total}手・ターン${s.turn}）`)
}

console.log("すべてのチェックに合格しました 🎉（part971）")
