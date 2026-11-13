// 概念: 対戦の始め方（デッキ指定の解決・先攻決め・最初のターン開始）。
// サーバー（server/src/index.ts）と、AI戦をブラウザの中で動かす Worker（public/src/aiWorker/worker.ts）の両方が使うので、
// ここに Node 専用の import（node:fs など）を足さないこと
import type { DeckSpec, GameState, PlayerId } from "./type"
import { createGame, validateDeckCards } from "./logic/GameState"
import { runTurnStart } from "./logic/PhaseManager"
import { DECK_RECIPES } from "../../data/constants"

// join / randomMatch / startAi が受け取るデッキ指定を DeckSpec に解決する。
// deckCards（カスタムデッキ）が指定されていれば deck キーより優先する
export function resolveDeckSpec(deck: unknown, deckCards: unknown): { deck: DeckSpec } | { error: string } {
    if (deckCards !== undefined && deckCards !== null && typeof deckCards === "object" && !Array.isArray(deckCards)) {
        const deckError = validateDeckCards(deckCards as Record<string, number>)
        if (deckError) return { error: `デッキが不正です: ${deckError}` }
        return { deck: deckCards as DeckSpec }
    }
    const name = String(deck || "sd01_blazing")
    if (!DECK_RECIPES[name]) return { error: "不明なデッキです" }
    return { deck: name }
}

// 対戦を作り、最初のターンを始めたところまで進めて返す
export function createStartedGame(
    roomId: string,
    names: Record<PlayerId, string>,
    decks: Record<PlayerId, DeckSpec>,
): GameState {
    // 先攻はランダム（以前は先に入った側＝p1 が必ず先攻だった。2026-11-13 ユーザー要望）
    const first: PlayerId = Math.random() < 0.5 ? "p1" : "p2"
    const game = createGame(roomId, names, decks, first)
    game.log.push(`先攻は${names[first]}に決まった。`)
    // 実対戦は誘発効果の対象をプレイヤーに選ばせる（smokeは既定falseのまま自動選択）。
    // AI戦でも true にする：AI 側の選択待ちは AI が自分で resolveChoice に答える
    game.interactiveTargets = true
    runTurnStart(game)
    return game
}
