// 先読み用の決定化（docs/design/AI_OPPONENT.md §9.2・§9.x）。AI が知り得ない情報を複製の側で置き換える。
// 隠すのは、相手の手札（空にする。公開ゾーンからの推定はしない）と、両者のデッキの順（中身の多重集合は保つ）。
//
// 相手の伏せたバーストは、効果を持たないカードに置き換える。エンジンは burst !== null を直接読む（pay.ts・revive.ts など）ので
// null にすると burstSet と食い違い、本物の cardId のままだと試行の中で実際に発動してしまう。
// 相手の手札を空にしたのと同じく、相手の隠れた反撃は読まない楽観になる。
import type { GameState, PlayerId } from "../type"
import { shuffle } from "../logic/GameState"

const NO_EFFECT_CARD = "BS01-002" // ロクケラトプス（効果なしを data で確認済み）

export function determinize(state: GameState, me: PlayerId): GameState {
    const sim = structuredClone(state)
    const opp: PlayerId = me === "p1" ? "p2" : "p1"
    sim.players[opp].hand = []
    if (sim.players[opp].burst !== null) sim.players[opp].burst = NO_EFFECT_CARD
    for (const pid of [me, opp]) sim.players[pid].deck = shuffle(sim.players[pid].deck)
    return sim
}
