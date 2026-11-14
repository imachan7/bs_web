// smoke パート949（破壊後バーストの順番：破壊 → 破壊誘発 → トラッシュ → バースト。1文の「1体ずつを破壊する」は同時破壊。#552）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireTrigger } from "../../server/src/logic/triggers"
import { loadAllCards } from "../../data/loadCards"

const CARDS = loadAllCards() as { cardId: string; type: string; cost: number; colors: string[]; effect: string; effects: unknown[] }[]

const LOWEN = "SD02-010" // 轟剣士レーヴェン（召喚時：コスト0/1/2/3/4の相手のスピリット1体ずつを破壊する）
const GOLEM = "BS09-052" // フォレスト・ゴレム（コスト3/4のスピリット1体ずつを破壊する）
const WALL = "BS14-101" // 仁王壁（バースト：相手による自分のスピリット破壊後。ボイドからコア1個を自分のリザーブに置く）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LOWEN).name === "轟剣士レーヴェン" && getCard(LOWEN).effect.includes("コスト0/1/2/3/4の相手のスピリット1体ずつを破壊する"), "LOWENは轟剣士レーヴェン")
    assert(getCard(GOLEM).name === "フォレスト・ゴレム" && getCard(GOLEM).effect.includes("1体ずつを破壊する"), "GOLEMはフォレスト・ゴレム")
    assert(getCard(WALL).name === "仁王壁" && getCard(WALL).effect.includes("【バースト：相手による自分のスピリット破壊後】"), "WALLは仁王壁")
}

// 効果を持たないコスト c のスピリット（idx 番目）
function vanilla(cost: number, idx = 0): string {
    const hit = CARDS.filter((c) => c.type === "spirit" && c.cost === cost && c.effect === "" && c.effects.length === 0)[idx]
    if (!hit) throw new Error(`コスト${cost}のバニラが足りない`)
    return hit.cardId
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => vanilla(1))
    s.players.p2.deck = Array.from({ length: 40 }, () => vanilla(1))
    s.players.p2.burst = WALL
    s.players.p2.burstSet = true
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const alive = (s: GameState, id: string): boolean => s.players.p2.field.spirits.some((x) => x.instanceId === id)

// 選択待ちを答えていく。対象選びは pick に含まれる個体を選ぶ。バーストの確認が出た時点の盤面を onBurst で見る
function drain(s: GameState, pick: string[], onBurst: () => void): number {
    let bursts = 0
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.kind === "target") {
            handleAction(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates.find((c) => pick.includes(c)) ?? pc.candidates[0]! })
        } else if (pc.kind === "option") {
            const opts = pc.options ?? []
            if (pc.prompt.includes("バーストを発動しますか")) {
                bursts++
                onBurst()
                handleAction(s, pc.pid, { type: "resolveChoice", option: opts[0]! })
            } else if (pc.optional) handleAction(s, pc.pid, { type: "resolveChoice" }) // フラッシュ効果のコストは払わない
            else handleAction(s, pc.pid, { type: "resolveChoice", option: opts[0]! })
        } else handleAction(s, pc.pid, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
    }
    return bursts
}

console.log("=== 1. レーヴェン：5体を選び終えてから同時に破壊し、全員がトラッシュに置かれてからバーストを1回だけ確認する ===")
{
    const s = game("lowen-simul")
    const targets = [0, 1, 2, 3, 4].map((c) => put(s, "p2", vanilla(c)))
    const spare = put(s, "p2", vanilla(3, 1)) // コスト3の2体目。選ばなければ残る
    const high = put(s, "p2", vanilla(5))
    const self = put(s, "p1", LOWEN, 1)
    const reserveBefore = s.players.p2.reserve
    fireTrigger(s, "p1", self, "onSummon")
    assert(s.pendingChoice?.kind === "target" && s.pendingChoice.candidates.length === 2, "コスト3が2体いるので、どちらを破壊するか選ぶ")
    assert(targets.every((t) => alive(s, t.instanceId)), "選び終えるまでは1体も破壊されていない（同時破壊）")
    let aliveAtBurst = -1
    const bursts = drain(s, [targets[3]!.instanceId], () => {
        aliveAtBurst = targets.filter((t) => alive(s, t.instanceId)).length
    })
    assert(bursts === 1, `バーストの確認は1回だけ（実際 ${bursts} 回）`)
    assert(aliveAtBurst === 0, `バーストの確認が出た時点で、5体ともトラッシュに置かれている（残り ${aliveAtBurst} 体）`)
    assert(targets.every((t) => !alive(s, t.instanceId)), "コスト0〜4が1体ずつ破壊される")
    assert(alive(s, spare.instanceId) && alive(s, high.instanceId), "選ばなかったコスト3と、コスト5は残る")
    assert(s.players.p2.burst === null && s.players.p2.reserve === reserveBefore + 5 + 1, `仁王壁が発動してコア1個を得る（リザーブ ${reserveBefore} → ${s.players.p2.reserve}）`)
}

console.log("=== 2. レーヴェン：候補のいないコストは飛ばし、いるコストだけ同時に破壊する ===")
{
    const s = game("lowen-partial")
    s.players.p2.burst = null
    const c1 = put(s, "p2", vanilla(1))
    const c4 = put(s, "p2", vanilla(4))
    const self = put(s, "p1", LOWEN, 1)
    fireTrigger(s, "p1", self, "onSummon")
    drain(s, [], () => {})
    assert(!alive(s, c1.instanceId) && !alive(s, c4.instanceId), "コスト1とコスト4が破壊される")
}

console.log("=== 3. フォレスト・ゴレム：コスト3/4の1体ずつも同時破壊 ===")
{
    const s = game("golem-simul")
    const c3 = put(s, "p2", vanilla(3))
    const c4 = put(s, "p2", vanilla(4))
    // 条件「自分のフィールドに緑のスピリットがいるとき」を、ゴレム以外の緑で満たす
    put(s, "p1", CARDS.find((c) => c.type === "spirit" && c.colors.join() === "green" && c.effect === "" && c.effects.length === 0)!.cardId)
    const self = put(s, "p1", GOLEM, 1)
    let aliveAtBurst = -1
    fireTrigger(s, "p1", self, "onSummon")
    const bursts = drain(s, [], () => {
        aliveAtBurst = [c3, c4].filter((t) => alive(s, t.instanceId)).length
    })
    assert(bursts === 1 && aliveAtBurst === 0, `2体ともトラッシュに置かれてからバーストを1回確認する（確認 ${bursts} 回・残り ${aliveAtBurst} 体）`)
}

console.log("=== 4. 「破壊した数につきドロー」の後処理は、バーストより先に解決する（非対話。対話では確認の前後どちらでも結果が同じなのでログの順で見る） ===")
{
    const s = game("after-before-burst")
    s.interactiveTargets = false
    const t = put(s, "p2", vanilla(3))
    const handBefore = s.players.p1.hand.length
    const logStart = s.log.length
    // マジックの効果として解決する（相手の効果による破壊）
    resolveAction(s, "p1", null, { type: "destroy", count: 1, drawPerDestroyed: 1 }, undefined, ["red"], "magic")
    const drawAt = s.log.findIndex((l, i) => i >= logStart && l.includes("ドロー"))
    const burstAt = s.log.findIndex((l) => l.includes("バースト（仁王壁）を発動"))
    assert(!alive(s, t.instanceId) && s.players.p1.hand.length === handBefore + 1 && s.players.p2.burst === null, "破壊してドローし、バーストも発動する")
    assert(drawAt >= 0 && burstAt > drawAt, `ドローのログがバーストの発動より先（ドロー ${drawAt}・バースト ${burstAt}）`)
}

console.log("すべてのチェックに合格しました 🎉（part949）")
