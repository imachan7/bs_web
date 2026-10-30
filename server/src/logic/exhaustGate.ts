// 疲労の問い合わせ：「疲労しない」「疲労させることができない」を1か所に集める（EFFECT_GATE.md §4 の 5d）
//
// 「〜されない／できない」は対象に取られることを防がない（10-30 の一般則）。疲労させる入口
// （exhaustSpirit／exhaustNexus）がここを聞き、コストの候補だけは呼び出し側が先に外す（canExhaustNexus）
import { isExhaustImmuneOnBoard } from "../../../shared/rules/resistance"
import type { CardInstance, CardType, GameState, PlayerId } from "../type"
import { canExhaustNexus } from "./state/exhaust"

export type ExhaustAttempt = {
    ownerPid: PlayerId
    target: CardInstance
    // 省略＝ルール・プレイヤー自身の操作による疲労（アタック・ブロック宣言、コスト）
    actorPid?: PlayerId | undefined
    sourceType?: CardType | undefined
}

export function exhaustDenial(state: GameState, a: ExhaustAttempt): string | null {
    if (state.players[a.ownerPid].field.nexuses.includes(a.target)) {
        return canExhaustNexus(state, a.ownerPid) ? null : "相手のネクサスは疲労させられない"
    }
    if (a.actorPid !== undefined && a.actorPid !== a.ownerPid && isExhaustImmuneOnBoard(state, a.ownerPid, a.target, a.sourceType)) {
        return "相手の効果で疲労しない"
    }
    return null
}
