// 相手の効果の対象を、持ち主が自分のスピリット1体に付け替える（古の魔王城・BSC05-017。
// kind:"magicTargetRedirect" の redirectTo:"ownTargetChosen"）。
// 相手が対象を選び終えた後・解決の前に、対象のうち持ち主のスピリットがあれば持ち主が「付け替えない」か
// 「その1体にする」を選ぶ。選んだ1体だけが効果を受け、ほかの対象は外れる（Q23559〜Q23565）。
// 効果を受けないスピリットは選べない（Q23560・Q23562）。バースト・持続効果・【連鎖】の部分には効かない（Q23566〜Q23568）
import type { CardInstance, EffectAction, PlayerId } from "../type"
import type { EffectAttempt } from "../../../shared/rules"
import { effectActiveAtLevel, effectSources } from "../../../shared/rules"
import { noteCoverage } from "../../../shared/coverage"
import type { ActionCtx } from "./actions/types"
import type { PickProgress } from "./pickTargets"
import { currentLevel, getCard, log, opponentOf, suspend } from "./GameState"
import { isResisted } from "./EffectModules"

// 持ち主（対象の持ち主側）が持つ、付け替えの発生源。種別は発生源の種別で絞る
function findOwnTargetRedirectSource(state: ActionCtx["state"], holder: PlayerId, srcType: ActionCtx["srcType"]): CardInstance | null {
    for (const source of effectSources(state, holder)) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicTargetRedirect" || effect.redirectTo !== "ownTargetChosen") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            const typeOk = effect.sourceTypes === undefined || (srcType !== undefined && (effect.sourceTypes as string[]).includes(srcType))
            if (typeOk) return source
        }
    }
    return null
}

// 選び終えた対象（ids）に、持ち主の付け替えを挟む。そのまま進めるなら ids、確認を出したら null（呼び出し側は中断する）。
// 再入（ownRedirectAsked）では持ち主の答えを反映する。picked が既にあるとき（耐性の確認の途中など）は決定済みなので触らない
export function ownTargetRedirect(
    ctx: ActionCtx,
    action: EffectAction & PickProgress,
    ids: string[],
    attempt: EffectAttempt,
): string[] | null {
    const { state, owner, self, srcType, sourceName } = ctx
    const holder = opponentOf(owner)
    const holderSpirit = (id: string): CardInstance | undefined => state.players[holder].field.spirits.find((s) => s.instanceId === id)
    if (action.picked?.ownRedirectAsked === true) {
        const pick = ctx.targetInstanceId
        if (pick === undefined || !ids.includes(pick) || holderSpirit(pick) === undefined) return ids
        const source = findOwnTargetRedirectSource(state, holder, srcType)
        if (source) noteCoverage(getCard(source.cardId).effects.find((e) => e.kind === "magicTargetRedirect"), "magicTargetRedirect")
        log(state, `${sourceName}：効果の対象を${getCard(holderSpirit(pick)!.cardId).name}のみに変更した。`)
        return [pick]
    }
    // バースト効果そのものは付け替えられない（Q23567）
    if (state.currentEffectSource?.burst === true) return ids
    if (action.picked !== undefined || owner === holder || !state.interactiveTargets || ids.length < 2) return ids
    const source = findOwnTargetRedirectSource(state, holder, srcType)
    if (!source) return ids
    // 効果を受けない（耐性で弾かれる）持ち主のスピリットは選べない。確認は出さずに判定する
    const candidates = ids
        .map(holderSpirit)
        .filter((s): s is CardInstance => s !== undefined && !isResisted(state, holder, s, attempt))
        .map((s) => s.instanceId)
    if (candidates.length === 0) return ids
    suspend(state, {
        pid: holder,
        kind: "target",
        prompt: `${getCard(source.cardId).name}：相手の効果の対象を、自分のスピリット1体だけに変更しますか？`,
        candidates,
        optional: true,
        resolveOnSkip: true,
        skipLabel: "付け替えない",
        action: { ...action, choosing: true as const, picked: { ids, passed: [], failed: [], ownRedirectAsked: true } } as unknown as EffectAction,
        selfInstanceId: self ? self.instanceId : null,
        actorPid: owner,
    })
    return null
}
