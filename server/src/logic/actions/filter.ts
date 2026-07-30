// TargetFilter の解決（直交化 第2段階まで完了）。
//
// 背景: 対象選択の絞り込み軸（色・系統・コスト・レベル・キーワード・バニラ・BP）は、
// 従来アクションごとに個別フィールドとして後付けされてきた（BS01〜BS04 で計28個）。
// 第1段階でこのモジュールが「旧フィールド → ResolvedTargetFilter」の畳み込みを引き受けて
// 経路を新形式へ一本化し、**第2段階（2026-07-30）で cards.json のデータを filter へ移行**して
// 旧フィールドと互換層（legacyToSpec）を削除した（40箇所・35枚。旧→新は同一経路を通るため
// キー付け替えは構成上ふるまいを変えない。移行スクリプトが旧ファイルから期待値を再構成して
// 全箇所を deep-equal で突き合わせ済み）。
//
// 旧フィールドの再発は scripts/validate-cards.ts が検査する（型に無いキーは JSON では
// 無言で無視されてしまうため、データ側の検査が必要）。
import type { ResolvedTargetFilter, TargetFilter } from "../../type"
import { effectiveBp } from "../../../../shared/rules"
import type { ActionCtx } from "./types"

// normalizeFilter に渡せるアクションの形。filter を持つアクションはすべてこれを満たす
export interface FilterCarrier {
    filter?: TargetFilter
}

// self 相対のBP指定が必要なのに self が不在だったことを表す。
// 呼び出し側は「対象がいなかった」ログを出して no-op にする（旧実装の挙動をそのまま維持）
export const SELF_REQUIRED = Symbol("selfRequired")

// action.filter を ResolvedTargetFilter へ解決する。
// self 相対のBP指定（"selfBp"）はここで数値へ解決するため、
// matchesTarget はインスタンス単位の純粋な述語でいられる
export function normalizeFilter(
    ctx: ActionCtx,
    action: FilterCarrier,
): ResolvedTargetFilter | typeof SELF_REQUIRED {
    const spec: TargetFilter = action.filter ?? {}
    // exactOptionalPropertyTypes 対応：BP系は下で条件付きに代入するため、いったん除いて展開する
    const { maxBp, minBp, exactBp, ...rest } = spec
    const resolved: ResolvedTargetFilter = { ...rest }

    // self の実効BP。発生源が場にいない文脈（マジック等）では self が null になりうる
    const selfBp = ctx.self ? effectiveBp(ctx.state, ctx.owner, ctx.self) : undefined

    if (maxBp === "selfBp") {
        if (selfBp === undefined) return SELF_REQUIRED
        resolved.maxBp = selfBp
    } else if (maxBp !== undefined) {
        resolved.maxBp = maxBp
    }

    if (minBp === "selfBp") {
        if (selfBp === undefined) return SELF_REQUIRED
        resolved.minBp = selfBp
    } else if (minBp !== undefined) {
        resolved.minBp = minBp
    }

    if (exactBp === "selfBp") {
        if (selfBp === undefined) return SELF_REQUIRED
        resolved.exactBp = selfBp
    }

    return resolved
}
