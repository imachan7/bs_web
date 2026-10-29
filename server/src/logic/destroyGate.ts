// 破壊の問い合わせ：「破壊されない」系の禁止を1か所に集める（EFFECT_GATE.md §4 の 5b）
//
// 「破壊されない」は対象に取られることを防がない（Q1711・2026-10-30）。選択肢には出し、破壊の時点で止める。
// コストの破壊だけは、全部払えるときだけ払えるので候補から外す（呼び出し側が cause:"cost" で聞く）
import { entryActive } from "../../../shared/rules/effectStop"
import { cardNameContains, hasGlobalConstraint, instHasColor, instIsVanilla, timedContentsOn } from "../../../shared/rules"
import { noteCoverage } from "../../../shared/coverage"
import type { CardInstance, CardType, Color, DestroyContext, GameState, PlayerId } from "../type"
import { currentLevel, getCard } from "./GameState"

// 破壊対象ネクサスの持ち主（ownerPid）自身のフィールド（スピリット＋ネクサス）のみを走査し、
// レベル有効かつ condition（ownVanillaSpiritsAtLeast＝持ち主のバニラスピリット数）を満たす
// globalConstraint "ownNexusIndestructible" があるか判定する。
// hasGlobalConstraint は両陣営を走査する汎用判定だが、こちらは破壊対象の持ち主側のみに効く
// 制約（サファイアの城壁）専用の判定のため別関数にしている。
function hasOwnNexusIndestructible(
    state: GameState,
    ownerPid: PlayerId,
    target?: CardInstance,
    context?: DestroyContext,
): boolean {
    const player = state.players[ownerPid]
    const instances = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of instances) {
        const level = currentLevel(inst).level
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "ownNexusIndestructible") continue
            if (!entryActive(state, ownerPid, inst, effect, level)) continue
            // colors（BS09-062ノルンの泉Lv2＝白/黄のネクサスだけ）：対象が分からないときは守らない側に倒す
            if (effect.constraint.colors !== undefined) {
                if (!target) continue
                if (!effect.constraint.colors.some((c) => instHasColor(target, c))) continue
            }
            // nameIncludes（SD06-012英雄皇の御盾Lv2＝カード名に「英雄皇」と入っているネクサスだけ）：対象が分からないときは守らない側に倒す
            if (effect.constraint.nameIncludes !== undefined) {
                if (!target) continue
                if (!cardNameContains(target, effect.constraint.nameIncludes)) continue
            }
            // sourceColors / sourceTypes（SD01-032 機械神の加護＝「相手の赤のスピリット/マジックの効果では」）：
            // 破壊しようとしている効果の発生源で絞る。発生源が分からないときは守らない側に倒す
            if (effect.constraint.sourceColors !== undefined || effect.constraint.sourceTypes !== undefined) {
                if (!context || context.sourcePid === undefined) continue
                if (context.sourcePid === ownerPid) continue
                if (
                    effect.constraint.sourceColors !== undefined &&
                    !effect.constraint.sourceColors.some((c) => (context.sourceColors ?? []).includes(c))
                ) {
                    continue
                }
                if (
                    effect.constraint.sourceTypes !== undefined &&
                    (context.sourceType === undefined || !effect.constraint.sourceTypes.includes(context.sourceType))
                ) {
                    continue
                }
            }
            if (effect.condition?.ownVanillaSpiritsAtLeast !== undefined) {
                const vanillaCount = player.field.spirits.filter((s) =>
                    instIsVanilla(s),
                ).length
                if (vanillaCount < effect.condition.ownVanillaSpiritsAtLeast) continue
            }
            // 「自分のネクサスすべてが黄の間」（BS11-069 黄金の鐘楼）。発生源自身も数に入る
            if (effect.condition?.allOwnNexusesHaveColor !== undefined) {
                const color = effect.condition.allOwnNexusesHaveColor
                if (!player.field.nexuses.every((n) => instHasColor(n, color))) continue
            }
            // 「自分のフィールドにネクサスが1つだけある間」（BS11-027 海戦機ニヨルドLv2）
            if (effect.condition?.ownNexusCountExactly !== undefined) {
                if (player.field.nexuses.length !== effect.condition.ownNexusCountExactly) continue
            }
            noteCoverage(effect, "globalConstraint")
            return true
        }
    }
    return false
}

export interface DestroyDenialQuery {
    ownerPid: PlayerId // 破壊される側の持ち主
    target: CardInstance
    cause: "effect" | "cost" | "bpCompare"
    actorPid?: PlayerId
    sourceType?: CardType
    sourceColors?: Color[]
}

// 破壊を止める理由（ログ用）。止められないなら null。スピリットに効く禁止は bpCompare だけ
export function destroyDenial(state: GameState, q: DestroyDenialQuery): string | null {
    if (q.cause === "bpCompare") {
        const guarded = hasGlobalConstraint(state, "noBpCompareDestroy") || timedContentsOn(state, q.target).some((c) => c.type === "noBpCompareDestroy")
        return guarded ? "BP比べでは破壊されない" : null
    }
    if (getCard(q.target.cardId).type !== "nexus") return null
    if (hasGlobalConstraint(state, "nexusIndestructible")) return "破壊耐性"
    const context: DestroyContext = {
        ...(q.actorPid !== undefined ? { sourcePid: q.actorPid } : {}),
        ...(q.sourceType !== undefined ? { sourceType: q.sourceType } : {}),
        ...(q.sourceColors !== undefined ? { sourceColors: q.sourceColors } : {}),
    }
    return hasOwnNexusIndestructible(state, q.ownerPid, q.target, context) ? "破壊耐性" : null
}
