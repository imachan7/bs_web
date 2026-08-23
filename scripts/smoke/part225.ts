// smoke パート225（AI戦とランダムマッチ。2026-08-23 追加）
//
// AI（server/src/ai/）は「合法手を列挙して1手だけ評価する」作り。強さより**止まらないこと**が要件なので、
// ここで見るのは次の3つ:
//   1. AI 対 AI の自己対戦が、どこにも詰まらずに決着まで進むこと（フリーズ検出）
//   2. 判断の骨格（倒せるならブロック／倒せないならライフで受ける／ライフ1なら必ず止める）
//   3. ランダムマッチの待機列（MatchQueue）の出し入れ
//
// 1 は AI のテストであると同時に**エンジンの通し稼働テスト**でもある。人手では踏まない
// 手順の組み合わせを大量に通すので、選択待ちの取りこぼしのような詰まりがあればここで止まる。
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { decideAiAction } from "../../server/src/ai"
import { pumpAiSync } from "../../server/src/ai/runner"
import { MatchQueue } from "../../server/src/roomManager"

const WEAK = "BS01-001" // ゴラドン（バニラ Lv1 BP1000）
const STRONG = "BS01-008" // メタルバーン（バニラ Lv1 BP3000）
const HUGE = "BS01-031" // デス・ハーデス（バニラ Lv1 BP4000）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    for (const [cardId, bp] of [[WEAK, 1000], [STRONG, 3000], [HUGE, 4000]] as const) {
        const card = getCard(cardId)
        const lv1 = card.levels.find((l) => l.level === 1)
        assert(card.type === "spirit", `${cardId} はスピリット（${card.name}）`)
        assert(card.effects.length === 0, `${cardId} ${card.name} は効果を持たない（判断だけを見るため）`)
        assert(lv1?.bp === bp, `${cardId} ${card.name} の Lv1 BP は ${bp}`)
    }
}

// アタック宣言後のフラッシュ①を、両者パスで閉じる（helpers の closeFlashTiming と同じ手順）
function closeFlash(state: GameState): void {
    let guard = 0
    while (state.isFlashTiming && state.battle && guard < 20) {
        handleAction(state, state.priorityPlayer, { type: "pass" })
        guard++
    }
}

// p1 のアタッカー1体と、p2 の防御側スピリットを並べたバトル直前の盤面を作る
function battleSetup(defenderCardIds: string[], defenderLife: number): GameState {
    const s = createGame("ai-block", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3 // 先攻1ターン目のアタック禁止を避ける
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits.push(createInstance(STRONG, s.turn, 1))
    s.players.p2.life = defenderLife
    for (const cardId of defenderCardIds) {
        s.players.p2.field.spirits.push(createInstance(cardId, s.turn, 1))
    }
    return s
}

// p1 がアタックしてフラッシュを閉じ、そこで p2 の AI が選ぶ手を返す
function aiDefenceMove(state: GameState): string | undefined {
    const attacker = state.players.p1.field.spirits[0]
    if (!attacker) return undefined
    handleAction(state, "p1", { type: "attack", instanceId: attacker.instanceId })
    closeFlash(state)
    return decideAiAction(state, "p2")?.action.type
}

console.log("=== 防御の判断 ===")
{
    // BP4000 で BP3000 のアタッカーを一方的に倒せる → ブロックする
    assert(aiDefenceMove(battleSetup([HUGE], 4)) === "block", "倒せるアタッカーはブロックする")

    // BP1000 では返り討ちに遭うだけ → ライフで受ける
    assert(aiDefenceMove(battleSetup([WEAK], 4)) === "takeLife", "倒せないならライフで受ける")

    // ライフ1のときは体を失ってでも止める（受けたら負けるため）
    assert(aiDefenceMove(battleSetup([WEAK], 1)) === "block", "ライフ1なら勝てなくてもブロックする")
}

console.log("=== 攻撃・召喚の判断 ===")
{
    // 相手のフィールドが空ならアタックを選ぶ（ライフを削れる）
    const s = battleSetup([], 4)
    const move = decideAiAction(s, "p1")
    assert(move?.action.type === "attack", "止める相手がいなければアタックする")

    // メインステップで召喚できる手札があれば、ターンを終えずに召喚する
    const m = createGame("ai-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(m)
    m.interactiveTargets = true
    m.turnPlayer = "p1"
    m.phase = "main"
    m.players.p1.hand = [WEAK]
    m.players.p1.reserve = 5
    const mainMove = decideAiAction(m, "p1")
    assert(mainMove?.action.type === "summon", "召喚できるならターンを終えずに召喚する")

    // 相手の手番中は何も指さない（null＝入力待ち）
    assert(decideAiAction(m, "p2") === null, "自分の手番でなければ何も指さない")
}

console.log("=== AI 対 AI の自己対戦が決着まで進む ===")
{
    const s = createGame("ai-selfplay", { p1: "AI赤", p2: "AI紫" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true // 実対戦と同じ条件（選択待ちにも AI が答えられること込みで見る）

    let total = 0
    let stalled = false
    while (!s.winner && total < 6000) {
        const acted = (["p1", "p2"] as PlayerId[]).reduce(
            (sum, pid) => sum + pumpAiSync(s, pid, 60),
            0,
        )
        if (acted === 0) {
            // どちらも手が無い＝盤面が進まない。AI かエンジンのどちらかに詰まりがある
            stalled = true
            break
        }
        total += acted
    }
    assert(!stalled, `AI 対 AI が途中で詰まらない（${total}手・ターン${s.turn}）`)
    assert(s.winner !== null && s.winner !== undefined, `自己対戦が決着する（勝者: ${s.winner ?? "なし"}・${total}手）`)
}

console.log("=== ランダムマッチの待機列 ===")
{
    const queue = new MatchQueue()
    assert(queue.takePair() === null, "1人も並んでいなければマッチしない")

    queue.add({ socketId: "s1", name: "アキラ", deck: "red" })
    queue.add({ socketId: "s1", name: "アキラ", deck: "red" })
    assert(queue.size === 1, "同じ接続は二重に並ばない")
    assert(queue.takePair() === null, "1人だけではマッチしない")

    queue.add({ socketId: "s2", name: "ユウキ", deck: "blue" })
    const pair = queue.takePair()
    assert(pair !== null, "2人そろえばマッチする")
    assert(pair?.[0]?.socketId === "s1" && pair?.[1]?.socketId === "s2", "先に並んだ順に取り出される")
    assert(queue.size === 0, "取り出した2人は列から消える")

    queue.add({ socketId: "s3", name: "ミナ", deck: "green" })
    assert(queue.remove("s3"), "待機の取り消しができる")
    assert(!queue.remove("s3"), "並んでいない接続の取り消しは何も起きない")
    assert(queue.size === 0, "取り消した人は列に残らない")
}
