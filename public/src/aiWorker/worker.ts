// AI戦をブラウザの中で動かす Web Worker。エンジンと AI はサーバーと同じコードを束ねたもの。
// メッセージの名前は socket のイベントに合わせてある（startAi／action を受け、joined／state／errorMessage を返す）ので、
// main.ts は相手がサーバーでも Worker でも同じハンドラで受ける。
// AI戦は対戦開始の9割近くを占め、サーバーで動かすと接続を張っている間ずっと Cloud Run の課金が続く（docs/ops/DEPLOY_CLOUDRUN.md §5）
import type { GameAction, GameState } from "../../../server/src/type"
import { viewFor } from "../../../server/src/logic/GameState"
import { handleAction } from "../../../server/src/logic/GameEngine"
import { pumpAi } from "../../../server/src/ai/runner"
import { createStartedGame, resolveDeckSpec } from "../../../server/src/matchSetup"

type StartAiPayload = {
    name?: string
    deck?: string
    deckCards?: Record<string, number>
    aiName?: string
    aiDeck?: string
    aiDeckCards?: Record<string, number>
}

let game: GameState | null = null

const post = (event: string, payload?: unknown): void => self.postMessage({ event, payload })

// 人間（p1）へ状態を送り、AI（p2）が打てる手を打ち切るまで進める（1手ごとに再びここへ戻る）
function publish(): void {
    if (!game) return
    post("state", viewFor(game, "p1"))
    pumpAi(game, "p2", {
        isActive: () => true,
        onStateChanged: publish,
        onGiveUp: (message) => console.warn(`[AI] ${message}`),
    })
}

function startAi(payload: StartAiPayload): void {
    if (game) return
    const mine = resolveDeckSpec(payload?.deck, payload?.deckCards)
    if ("error" in mine) return post("errorMessage", mine.error)
    const theirs = resolveDeckSpec(payload?.aiDeck, payload?.aiDeckCards)
    if ("error" in theirs) return post("errorMessage", `AIの${theirs.error}`)
    game = createStartedGame(
        "ai-local",
        { p1: String(payload?.name || "プレイヤー"), p2: String(payload?.aiName || "AI").slice(0, 20) },
        { p1: mine.deck, p2: theirs.deck },
    )
    post("joined", { playerId: "p1", roomId: "ai-local" })
    publish()
}

// エンジンや AI が例外を投げたら、内容と直前のログを main.ts へ渡す（main.ts がバグ報告として送る）。
// サーバーで動いていた頃はサーバーのログに残っていたが、Worker の中の例外は利用者のブラウザにしか出ない。
// AI の手は setTimeout の中で進むので、呼び出しごとの try/catch ではなく Worker 全体の onerror で受ける
self.onerror = (message, _source, _lineno, _colno, error) => {
    post("crash", {
        message: String(error?.message ?? message),
        stack: String(error?.stack ?? ""),
        turn: game?.turn,
        phase: game?.phase,
        logTail: game?.log.slice(-40) ?? [],
    })
}

self.onmessage = (e: MessageEvent<{ event: string; payload?: unknown }>) => {
    const { event, payload } = e.data
    if (event === "startAi") return startAi(payload as StartAiPayload)
    if (event !== "action") return
    if (!game) return post("errorMessage", "ゲームが開始されていません")
    const error = handleAction(game, "p1", payload as GameAction)
    if (error) post("errorMessage", error)
    else publish()
}
