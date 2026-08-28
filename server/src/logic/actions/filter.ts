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
import type { EffectAttempt } from "../../../../shared/rules"
import { effectiveBp } from "../../../../shared/rules"
import { findInstanceAnywhere, getCard } from "../GameState"
import type { ActionCtx } from "./types"

// 耐性判定（EffectModules.resistanceAgainst / isResisted）へ渡す「何をしようとしているか」を
// ActionCtx から組み立てる。**発生源の色と種別を渡し忘れると装甲やマジック耐性が無言で効かなくなる**ため、
// ハンドラ側で毎回オブジェクトリテラルを書かずにこれを通すこと。
//
// scope は呼び出し側が決める:
//   "targeted" = 1体を選んで作用する（「相手の効果の対象にならない」が効く）
//   "area"     = 条件に合うものすべてに作用する（同上は効かない）
export function attemptOf(
    ctx: ActionCtx,
    op: EffectAttempt["op"],
    scope: EffectAttempt["scope"],
): EffectAttempt {
    return {
        op,
        scope,
        actorPid: ctx.owner,
        ...(ctx.srcType !== undefined ? { sourceType: ctx.srcType } : {}),
        ...(ctx.srcColors !== undefined ? { sourceColors: ctx.srcColors } : {}),
    }
}

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
    // バトル敗者参照の軸も、ここで既存の color / family 軸へ畳んでから matchesTarget に渡す
    const { maxBp, minBp, exactBp, sameColorAsBattleLoser, sameFamilyAsBattleLoser, sameBpAsBattleLoser, lowerBpThanBattleLoser, sameCostAsEventTarget, sameCostAsSelf, maxCostAsSelf, ...rest } = spec
    const resolved: ResolvedTargetFilter = { ...rest }

    // 直前のバトルで「BPを比べ相手のスピリットだけを破壊した」ときの、破壊された側の色／系統。
    // 記録が空（バトル外での発動など）なら対象なしにしたいので、一致しえない値を入れて空振りさせる
    if (sameColorAsBattleLoser) {
        const colors = ctx.state.lastBattleDestroyedColors
        if (colors.length === 0) return SELF_REQUIRED
        // 多色の敗者は現データに存在しないため先頭色で判定する（色軸は単一色のみ受ける）
        resolved.color = colors[0]!
    }
    if (sameFamilyAsBattleLoser) {
        const families = ctx.state.lastBattleDestroyedFamilies
        if (families.length === 0) return SELF_REQUIRED
        resolved.family = families // 配列＝いずれかの系統でOR
    }
    // 直前のバトルで破壊された側と同じ実効BP（BS03熾烈極める最前線Lv2）。
    // 記録が0（バトル外での発動など）なら対象なしにする
    if (sameBpAsBattleLoser) {
        const bp = ctx.state.lastBattleDestroyedBp
        if (bp === 0) return SELF_REQUIRED
        resolved.exactBp = bp
    }
    // 直前のバトルで破壊された側より実効BPが低い（BS10-X04月光龍ストライク・ジークヴルム Lv2）。
    // 「未満」はmaxBp軸に無いため、-1して「以下」で表す（BPは常に1000刻みの整数）
    if (lowerBpThanBattleLoser) {
        const bp = ctx.state.lastBattleDestroyedBp
        if (bp === 0) return SELF_REQUIRED
        resolved.maxBp = bp - 1
    }
    // イベント対象として渡ってきたブロッカー（ctx.targetInstanceId）と同じコスト
    // （BS06計画された場外乱闘Lv2：ブロックしたスピリットと同じコストの、他の相手のスピリット）
    // イベント対象と同じコスト。何が「イベント対象」かは誘発で変わる
    // （onBlocked＝ブロッカー／onBlock＝アタックしている相手）
    if (sameCostAsEventTarget) {
        const target = ctx.targetInstanceId ? findInstanceAnywhere(ctx.state, ctx.targetInstanceId) : undefined
        if (!target) return SELF_REQUIRED
        const cost = getCard(target.cardId).cost
        resolved.cost = { min: cost, max: cost }
    }

    // self と同じコスト（BS09-060緑翼の大樹：召喚された【暴風】持ちと同じコストの相手）。
    // fieldEvent では self にイベント対象（召喚されたスピリット）が入る
    if (sameCostAsSelf) {
        if (!ctx.self) return SELF_REQUIRED
        const cost = getCard(ctx.self.cardId).cost
        resolved.cost = { min: cost, max: cost }
    }

    // self と同じかそれ以下のコスト（sameCostAsSelfの以下版。BS10-X06天蠍神騎スコル・スピア＝
    // 「このスピリットのコスト以下の相手」）
    if (maxCostAsSelf) {
        if (!ctx.self) return SELF_REQUIRED
        const cost = getCard(ctx.self.cardId).cost
        resolved.cost = { max: cost }
    }

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
