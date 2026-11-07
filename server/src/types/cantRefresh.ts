// 回復の禁止（globalConstraint・playerRule・timedEffect の内容で共通）。判定は shared/rules/cantRefresh.ts の1か所
import type { CardType, ResolvedTargetFilter } from "../type"

export type CantRefreshDef = {
    type: "cantRefresh"
    side?: "own" | "opponent" // globalConstraint のときだけ読む。発生源の持ち主から見た陣営。省略＝両陣営（playerRule は timedEffect の side）
    cardType?: "spirit" | "nexus" // 省略＝スピリット。ネクサスの回復をスピリット限定の効果文で止めないため
    target?: ResolvedTargetFilter
    by?: "step" | "effect" // 省略＝リフレッシュステップと効果の両方。効果文が「リフレッシュステップ以外で」「リフレッシュステップで」と言い分ける
    effectSource?: { types?: CardType[] } // 効果による回復のときの発生源の種別。省略＝すべての効果
}
