// 対戦中の AI を動かすループ。
//
// 人間が1手打つ → 配信 → ここが呼ばれ、AI が打てる手が無くなるまで1手ずつ進める。
// 1手ごとに間隔を空けて配信するので、人間側の画面では AI の手が順に流れて見える。
//
// 無限ループへの備えを2つ持つ:
//   1. サーバーに弾かれた手は覚えて避ける（同じ手を選び続けて止まるのを防ぐ）
//   2. 1回の起動で打てる手数に上限を置く（超えたら AI を降参させて対戦を終わらせる）
import type { GameState, PlayerId } from "../type"
import { handleAction } from "../logic/GameEngine"
import { decideAiAction, moveKey } from "./index"

// 1手ごとの間隔。人間側が AI の動きを1手ずつ追えるだけの間を空ける。
// BS_AI_DELAY_MS で上書きできる（E2E を待たせないため。0 にすれば間を空けずに指す）
const configuredDelay = Number(process.env.BS_AI_DELAY_MS)
export const AI_STEP_DELAY_MS = Number.isFinite(configuredDelay) && configuredDelay >= 0 ? configuredDelay : 450

// 1回の起動で AI が打てる手数の上限。
// 「打っても盤面が進まない手」を選び続けたときに、サーバーを回し続けないための安全弁。
// 通常の1ターンは多くても数十手なので、これに掛かる時点で AI かエンジンの異常
const MAX_ACTIONS_PER_PUMP = 400

// 連続で弾かれた手をこの数だけ覚える。これを超えたら打ち切る
const MAX_CONSECUTIVE_ERRORS = 8

export interface AiPumpOptions {
    // ルームがまだ生きているか（相手が切断したら false を返して AI を止める）
    isActive: () => boolean
    // AI が1手打つたびに呼ぶ。実装は両者への状態配信
    onStateChanged: () => void
    // AI が異常で打ち切ったときの通知（対戦ログではなくサーバーログ向け）
    onGiveUp?: (message: string) => void
    // テストから同期実行するためのフック。既定は setTimeout（実対戦）
    delayMs?: number
}

// 同じ対戦で AI ループが二重に走らないようにする。
// 人間の action と AI 自身の action の両方から pumpAi が呼ばれうるため
const pumping = new WeakSet<GameState>()

// AI が打てる手が無くなるまで1手ずつ進める。すでに走っていれば何もしない
export function pumpAi(state: GameState, aiPid: PlayerId, opts: AiPumpOptions): void {
    if (pumping.has(state)) return
    pumping.add(state)

    const delay = opts.delayMs ?? AI_STEP_DELAY_MS
    let acted = 0
    const rejected = new Set<string>()

    const finish = (): void => {
        pumping.delete(state)
    }

    const step = (): void => {
        if (!opts.isActive() || state.winner) {
            finish()
            return
        }
        const move = decideAiAction(state, aiPid, rejected)
        if (!move) {
            // AI の手番ではない＝人間の入力待ち。次に人間が打ったらまた呼ばれる
            finish()
            return
        }
        if (acted >= MAX_ACTIONS_PER_PUMP) {
            opts.onGiveUp?.(`AIが1手番で${MAX_ACTIONS_PER_PUMP}手を超えました。対戦を終了します`)
            handleAction(state, aiPid, { type: "surrender" })
            opts.onStateChanged()
            finish()
            return
        }

        const error = handleAction(state, aiPid, move.action)
        acted++
        if (error) {
            // 列挙は validateXxx を通しているのでここへは来ない想定。来たらその手を避けて選び直す
            rejected.add(moveKey(move))
            if (rejected.size >= MAX_CONSECUTIVE_ERRORS) {
                opts.onGiveUp?.(`AIの手が続けて拒否されました（最後の理由: ${error}）。対戦を終了します`)
                handleAction(state, aiPid, { type: "surrender" })
                opts.onStateChanged()
                finish()
                return
            }
            // 盤面は変わっていないので、配信せずに次の候補をすぐ試す
            step()
            return
        }
        // 1手通ったら、避けていた手の記録は捨てる（盤面が変われば通ることがある）
        rejected.clear()
        opts.onStateChanged()
        setTimeout(step, delay)
    }

    setTimeout(step, delay)
}

// テスト用：間隔を空けずに、AI が打てなくなるまでその場で進める。
// 打った手数を返す（smoke から AI 対 AI の自己対戦を回すのに使う）
export function pumpAiSync(state: GameState, aiPid: PlayerId, maxActions = MAX_ACTIONS_PER_PUMP): number {
    let acted = 0
    const rejected = new Set<string>()
    while (acted < maxActions && !state.winner) {
        const move = decideAiAction(state, aiPid, rejected)
        if (!move) break
        const error = handleAction(state, aiPid, move.action)
        if (error) {
            rejected.add(moveKey(move))
            if (rejected.size >= MAX_CONSECUTIVE_ERRORS) break
            continue
        }
        rejected.clear()
        acted++
    }
    return acted
}
