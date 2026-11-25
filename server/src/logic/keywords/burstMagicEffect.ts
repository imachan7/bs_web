// バーストで発動したマジックが、その後のメイン効果・フラッシュ効果（コストを払う thenPay と、BS16-070 による無償）を発揮すると決まったことを画面へ知らせる。
// マジックの「使用」ではない（Q22399）ので magic の出来事は出ず、何の効果を発揮したのかが画面に出ていなかった（2026-11-25 ユーザー指摘）
import type { GameState, PlayerId } from "../../type"
import { emitEvent } from "../EffectModules"
import { getCard } from "../GameState"

export function announceBurstMagicEffect(state: GameState, pid: PlayerId, cardId: string, timing: "main" | "flash"): void {
    emitEvent(state, { type: "burstMagicEffect", pid, cardId, cardName: getCard(cardId).name, timing, logAt: state.log.length })
}
