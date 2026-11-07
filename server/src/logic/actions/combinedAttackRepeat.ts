// 合体スピリットが持つ「ブレイヴの『合体アタック時』効果をもう1度だけ発揮できる」（BS22-009）
import { entryActive } from "../../../../shared/rules/effectStop"
import { currentLevel, instIsCombined } from "../../../../shared/rules"
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, EffectDef, GameState, PlayerId } from "../../type"
import { getCard, log } from "../GameState"
import { requestActivationConfirm } from "../targeting"
import { noteCoverage } from "../../../../shared/coverage"

type Triggered = Extract<EffectDef, { kind: "triggered" }>

// host の目印が有効なとき、ブレイヴの『合体アタック時』効果を「解決→もう1度の確認」の列に包む。
// 発揮した効果だけが対象なので、確認を断った・不発の効果には付かない（包んだ列ごと確認の内側に入る）
export function wrapWithRepeat(state: GameState, owner: PlayerId, host: CardInstance, brave: CardInstance, effect: EffectDef): EffectDef {
    if (brave === host || effect.kind !== "triggered" || effect.trigger !== "onAttack" || effect.whileCombined !== true) return effect
    if (!instIsCombined(host)) return effect
    // 見出しが『合体アタック時』か【合体時】『アタック時』かは区別しない（2026-11-08 ユーザー決定。BS23-031・044 と同じ）。
    // 対象はブレイヴのカード自身のエントリだけで、合体先のスピリットの【合体時】の効果は含めない
    const level = currentLevel(host).level
    const marker = getCard(host.cardId).effects.find(
        (e): e is Triggered => e.kind === "triggered" && e.action.type === "repeatCombinedAttackMarker" && entryActive(state, owner, host, e, level),
    )
    if (!marker) return effect
    return { ...effect, action: { type: "sequence", actions: [effect.action, { type: "fireAgain", action: effect.action }] } }
}

const markerHandler: ActionHandler<"repeatCombinedAttackMarker"> = (ctx) => {
    const marker = ctx.self && getCard(ctx.self.cardId).effects.find((e) => e.kind === "triggered" && e.action.type === "repeatCombinedAttackMarker")
    noteCoverage(marker, "triggered")
}

const fireAgainHandler: ActionHandler<"fireAgain"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
    if (self?.combinedAttackRepeated) return
    if (state.interactiveTargets && !action.confirmed) {
        requestActivationConfirm(state, owner, `${sourceName}：発揮した効果をもう1度発揮しますか？`, { ...action, confirmed: true }, self)
        return
    }
    if (self) self.combinedAttackRepeated = true
    log(state, `${sourceName}：効果をもう1度発揮する。`)
    ctx.resolve(action.action)
}

const handlers = {
    repeatCombinedAttackMarker: markerHandler,
    fireAgain: fireAgainHandler,
} satisfies Partial<ActionRegistry>

export default handlers
