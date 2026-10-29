// カードが手札に入ってよいかの問い合わせ。行き先が手札なら効く禁止と、トラッシュから戻すときだけ効く禁止を集める（EFFECT_GATE §4 の 5a）
import type { GameState, PlayerId } from "../type"
import { hasGlobalConstraint, opponentCantReturnFromTrashToHand } from "../../../shared/rules"

export type HandGainFrom = "deck" | "trash" | "revealed" | "field" | "other"

// 手札にカードを加えてよいか。止めるなら理由、よいなら null。
// cause:"rule"（ドロー等のルール処理）は効果ではないので noHandGainByEffect を見ない。
// 止められたカードは「選ばれなかった」扱いで、各経路が自分の残りの行き先へ送る。
// 破壊時に手札へ戻るスピリットは破壊待機でトラッシュに行っていないので from:"field"（2026-10-30 ユーザー確認）
export function handGainDenial(state: GameState, q: { pid: PlayerId; from: HandGainFrom; cause: "effect" | "rule" }): string | null {
    if (q.cause === "effect" && hasGlobalConstraint(state, "noHandGainByEffect")) return "効果によって手札が増やせない"
    if (q.from === "trash" && (hasGlobalConstraint(state, "noTrashRecovery") || opponentCantReturnFromTrashToHand(state, q.pid))) {
        return "トラッシュからカードを手札に戻せない"
    }
    return null
}
