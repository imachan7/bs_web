// TargetFilter の互換層（直交化 第1段階）。
//
// 背景: 対象選択の絞り込み軸（色・系統・コスト・レベル・キーワード・バニラ・BP）は、
// 従来アクションごとに個別フィールドとして後付けされてきた（BS01〜BS04 で計28個）。
// これを共通の TargetFilter に一本化するのが直交化だが、**cards.json のデータは移行しない**
// （57箇所・44枚。うち13枚は smoke カバレッジが無く、移行ミスを検出できないため）。
//
// そこでこのモジュールが「旧フィールド → ResolvedTargetFilter」の畳み込みを一手に引き受ける。
// ハンドラは normalizeFilter() の戻り値だけを見ればよく、**旧フィールドを直接読む箇所はゼロになる**。
// 旧フィールドの削除とデータ移行は第2段階（13枚のテスト追加が前提）の別タスク。
import type {
    Color,
    FamilyFilter,
    Keyword,
    ResolvedTargetFilter,
    TargetFilter,
} from "../../type"
import { effectiveBp } from "../../../../shared/rules"
import type { ActionCtx } from "./types"

// 旧形式の個別フィールド。アクションごとに散っていた同義の軸をここで受ける。
// 名前が違うだけで意味は同じもの（colorFilter → color など）を吸収する
export interface LegacyFilterFields {
    filter?: TargetFilter // 新形式（これが指定されていれば旧フィールドより優先される）
    maxBp?: number
    maxBpFromSelf?: boolean // BS04七龍帝の玉座Lv2：self の実効BP以下
    bpEqualsSelf?: boolean // BS01プテラトマホーク：self と実効BPが同じ
    keywordFilter?: Keyword
    colorFilter?: Color
    colorExclude?: Color
    familyFilter?: FamilyFilter
    costFilter?: { max?: number; min?: number }
    levelFilter?: number[]
    vanillaFilter?: true
    minSymbols?: number
    excludeSelf?: boolean
}

// self 相対のBP指定が必要なのに self が不在だったことを表す。
// 呼び出し側は「対象がいなかった」ログを出して no-op にする（旧実装の挙動をそのまま維持）
export const SELF_REQUIRED = Symbol("selfRequired")

// 旧フィールド／新 filter のどちらで書かれていても ResolvedTargetFilter を返す。
// self 相対のBP（"selfBp" / maxBpFromSelf / bpEqualsSelf）はここで数値へ解決するため、
// matchesTarget はインスタンス単位の純粋な述語でいられる
export function normalizeFilter(
    ctx: ActionCtx,
    action: LegacyFilterFields,
): ResolvedTargetFilter | typeof SELF_REQUIRED {
    const spec: TargetFilter = action.filter ?? legacyToSpec(action)
    // exactOptionalPropertyTypes 対応：BP系は下で条件付きに代入するため、いったん除いて展開する
    const { maxBp, exactBp, ...rest } = spec
    const resolved: ResolvedTargetFilter = { ...rest }

    // self の実効BP。発生源が場にいない文脈（マジック等）では self が null になりうる
    const selfBp = ctx.self ? effectiveBp(ctx.state, ctx.owner, ctx.self) : undefined

    if (maxBp === "selfBp") {
        if (selfBp === undefined) return SELF_REQUIRED
        resolved.maxBp = selfBp
    } else if (maxBp !== undefined) {
        resolved.maxBp = maxBp
    }

    if (exactBp === "selfBp") {
        if (selfBp === undefined) return SELF_REQUIRED
        resolved.exactBp = selfBp
    }

    return resolved
}

// 旧フィールド群を新形式の TargetFilter へ読み替える（データは無変更のまま）
function legacyToSpec(a: LegacyFilterFields): TargetFilter {
    const spec: TargetFilter = {}
    if (a.maxBpFromSelf) spec.maxBp = "selfBp"
    else if (a.maxBp !== undefined) spec.maxBp = a.maxBp
    if (a.bpEqualsSelf) spec.exactBp = "selfBp"
    if (a.colorFilter !== undefined) spec.color = a.colorFilter
    if (a.colorExclude !== undefined) spec.colorExclude = a.colorExclude
    if (a.familyFilter !== undefined) spec.family = a.familyFilter
    if (a.costFilter !== undefined) spec.cost = a.costFilter
    if (a.levelFilter !== undefined) spec.level = a.levelFilter
    if (a.keywordFilter !== undefined) spec.keyword = a.keywordFilter
    if (a.vanillaFilter !== undefined) spec.vanilla = a.vanillaFilter
    if (a.minSymbols !== undefined) spec.minSymbols = a.minSymbols
    if (a.excludeSelf !== undefined) spec.excludeSelf = a.excludeSelf
    return spec
}
