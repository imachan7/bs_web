// 指定の段：同時に指定された対象が出そろった時点で、持ち主の付け替え（kind:"targetRedirect"）を挟む（docs/design/TARGET_REDIRECT.md）。
// 魔導書（bothSides・side）は未対応。Q23559〜Q23568
import type { CardInstance, EffectAction, PlayerId, ResolvedTargetFilter } from "../type"
import type { EffectAttempt } from "../../../shared/rules"
import { effectActiveAtLevel, effectSources, matchesTarget } from "../../../shared/rules"
import { noteCoverage } from "../../../shared/coverage"
import type { ActionCtx } from "./actions/types"
import type { PickProgress } from "./pickTargets"
import { currentLevel, getCard, log, opponentOf, suspend, findBattler } from "./GameState"
import { isResisted } from "./EffectModules"

type RedirectEffect = Extract<NonNullable<ReturnType<typeof getCard>["effects"]>[number], { kind: "targetRedirect" }>
interface RedirectOffer { source: CardInstance; effect: RedirectEffect; options: string[] }

// 選べるのは、その指定の候補に入り、効果を受けられるもの。選ばれていない個体も選べる（Q23560・Q23562・Q23564）。
// 確認を出すときと、答えを受け取るときで同じ集合を使う。bothSides・side は 3b で足す（今は起きない扱い）
function redirectOffers(state: ActionCtx["state"], holder: PlayerId, srcType: ActionCtx["srcType"], ids: string[], candidates: string[], attempt: EffectAttempt): RedirectOffer[] {
    const spirits = state.players[holder].field.spirits
    const offers: RedirectOffer[] = []
    for (const source of effectSources(state, holder)) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "targetRedirect" || effect.includes === "bothSides" || effect.to === "side") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.turn !== undefined && (effect.turn === "own") !== (holder === state.turnPlayer)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.sourceTypes !== undefined && (srcType === undefined || !(effect.sourceTypes as string[]).includes(srcType))) continue
            const inc = effect.includes
            const involved = inc === "self"
                ? ids.includes(source.instanceId)
                : spirits.some((s) => ids.includes(s.instanceId) && (inc === "own" || matchesTarget(state, holder, s, inc.filter as unknown as ResolvedTargetFilter)))
            if (!involved) continue
            const options = effect.to === "self"
                // 自分1体に絞り込む結果が今と同じ（対象が発生源だけ）なら聞く意味がない
                ? spirits.filter((s) => s.instanceId === source.instanceId && !(ids.length === 1 && ids[0] === s.instanceId)
                    && (effect.requireReceivable !== true || candidates.includes(s.instanceId)) && !isResisted(state, holder, s, attempt)).map((s) => s.instanceId)
                : spirits.filter((s) => (effect.requireReceivable !== true || candidates.includes(s.instanceId)) && !isResisted(state, holder, s, attempt)).map((s) => s.instanceId)
            if (options.length > 0) offers.push({ source, effect, options })
        }
    }
    return offers
}

// 戻り値：そのまま進めるなら対象、確認を出したら null（呼び出し側は中断する）。
// 再入（picked.settled）は持ち主の答えを反映する。picked が既にあるとき（耐性の確認の途中など）は決定済みなので触らない
export function settleTargets(
    ctx: ActionCtx,
    action: EffectAction & PickProgress,
    ids: string[],
    candidates: string[],
    attempt: EffectAttempt,
): string[] | null {
    const { state, owner, self, srcType, sourceName } = ctx
    const holder = opponentOf(owner)
    const holderSpirit = (id: string): CardInstance | undefined => findBattler(state.players[holder], id)
    if (action.picked?.settled === true) {
        const pick = ctx.targetInstanceId
        const found = pick === undefined ? undefined : redirectOffers(state, holder, srcType, action.picked.ids, candidates, attempt).find((o) => o.options.includes(pick))
        if (pick === undefined || !found) return ids
        noteCoverage(found.effect, "targetRedirect")
        log(state, `${sourceName}：効果の対象を${getCard(holderSpirit(pick)!.cardId).name}のみに変更した。`)
        return [pick]
    }
    // バースト効果そのもの（Q23567）と【連鎖】の部分（Q23568）は付け替えられない
    if (state.currentEffectSource?.burst === true || action.rensa === true) return ids
    if (action.picked !== undefined || owner === holder) return ids
    if (!ids.some((id) => holderSpirit(id) !== undefined)) return ids
    const offers = redirectOffers(state, holder, srcType, ids, candidates, attempt)
    if (offers.length === 0) return ids
    // 発生源が自分自身へ付け替える効果は、強制（optional なし）か非対話なら確認なしで先頭のものを使う
    const auto = offers.find((o) => o.effect.to === "self" && (o.effect.optional !== true || !state.interactiveTargets))
    if (auto) {
        noteCoverage(auto.effect, "targetRedirect")
        log(state, `${getCard(auto.source.cardId).name}：${sourceName}の効果の対象を、このスピリットのみにした。`)
        return [auto.source.instanceId]
    }
    if (!state.interactiveTargets) return ids
    const options = [...new Set(offers.flatMap((o) => o.options))]
    const name = offers.length === 1 ? getCard(offers[0]!.source.cardId).name : "対象の付け替え"
    suspend(state, {
        pid: holder,
        kind: "target",
        prompt: `${name}：相手の効果の対象を、自分のスピリット1体だけに変更しますか？`,
        candidates: options,
        optional: true,
        resolveOnSkip: true,
        skipLabel: "付け替えない",
        action: { ...action, choosing: true as const, picked: { ids, passed: [], failed: [], settled: true } } as unknown as EffectAction,
        selfInstanceId: self ? self.instanceId : null,
        actorPid: owner,
    })
    return null
}

// 「すべて」のように、一覧を作ってから適用する action 用。一覧のまま進めるなら一覧（付け替えたら絞った一覧）、確認を出したら null
export function settleList<T extends { instanceId: string }>(
    ctx: ActionCtx,
    action: EffectAction & PickProgress,
    list: T[],
    attempt: EffectAttempt,
): T[] | null {
    const ids = list.map((t) => t.instanceId)
    const settled = settleTargets(ctx, action, ids, ids, attempt)
    return settled === null ? null : list.filter((t) => settled.includes(t.instanceId))
}

// 付け替えの答えで再入したとき、元の指定で選ばれていた1体。再入でなければ undefined。
// 再入では ctx.targetInstanceId は付け替え先の答えなので、呼び出し側は自分の選択として読まずにこちらを使う
export function redirectReentryId(action: EffectAction & PickProgress): string | undefined {
    return action.picked?.settled === true ? action.picked.ids[0] : undefined
}

// 1体が決まった後の付け替え。付け替え先（または元の1体）を返す。確認を出したら null（呼び出し側は中断する）。
// candidates＝その指定で取りえた候補（付け替え先は requireReceivable ならこの中に限られる）
export function settleOne(
    ctx: ActionCtx,
    action: EffectAction & PickProgress,
    target: CardInstance,
    candidates: string[],
    attempt: EffectAttempt,
): CardInstance | null {
    const settled = settleTargets(ctx, action, [target.instanceId], candidates, attempt)
    if (settled === null) return null
    const id = settled[0]
    if (id === undefined || id === target.instanceId) return target
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const found = findBattler(ctx.state.players[pid], id)
        if (found) return found
    }
    return target
}
