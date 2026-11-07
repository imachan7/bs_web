// 「コアを取り除けない」の共通の軸（個体 constraint・場全体 globalConstraint・期間つき timedEffect が同じ type 名 "coresProtected" で使う）
import type { CardType } from "../type"

// 止める原因。省略＝全部（【転召】を含む）。【転召】を通したい場合は tensho を外して書く（BS13-065・X03）
export type CoreProtectCause = "effect" | "cost" | "player" | "tensho"

export type CoresProtectedRule = {
    // opponent＝取り除く側が対象の持ち主の相手のときだけ止める（効果・支払いとも持ち主自身は通る）
    by?: "any" | "opponent"
    causes?: CoreProtectCause[]
    // 指定時は、発生源の無いルール処理（sourceType が undefined）を止めない。ネクサスの効果も止めない（BS12-022 の「スピリット/ブレイヴ/マジックの効果で」）
    sourceTypes?: CardType[]
    // 行き先がリザーブの取り除きだけ止める（トラッシュ・ボイド行きとコアの移動は通る。BS22-020・Q4361）
    to?: "reserve"
    // 止める対象が「持ち主自身の効果」だけは通す。支払い・移動は止まる
    exceptOwnerEffects?: true
}
