// 【聖命】のライフ増加を別の効果に置き換える（seimeiReplace。BS22-X05）
import { entryActive } from "../../../../shared/rules/effectStop"
import { noteCoverage } from "../../../../shared/coverage"
import { effectSources } from "../../../../shared/rules"
import type { CardInstance, EffectAction, GameState, PlayerId } from "../../type"
import { currentLevel, getCard, suspend } from "../GameState"

// 置き換えの確認を立てたら true。断れば original をそのまま（seimeiChecked 付きで）解く。
// 非対話（AI・テスト）では置き換えない。置き換えても元の効果（連鎖つき）は発揮済みなので、呼び出し側の sequence はそのまま続く（BS19 Q773）
export function offerSeimeiReplace(state: GameState, owner: PlayerId, self: CardInstance, original: EffectAction): boolean {
    if (!state.interactiveTargets) return false
    for (const source of effectSources(state, owner)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "seimeiReplace" || !entryActive(state, owner, source, effect, level)) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && owner !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && owner === state.turnPlayer) continue
            }
            noteCoverage(effect, "seimeiReplace")
            suspend(state, {
                pid: owner,
                kind: "option",
                prompt: `${getCard(source.cardId).name}：【聖命】で自分のライフが増えるかわりに、相手のライフのコア1個を相手のトラッシュに置きますか？`,
                candidates: [],
                options: ["置き換える"],
                optional: true,
                confirm: true,
                action: effect.action,
                declineAction: { ...original, seimeiChecked: true } as EffectAction,
                selfInstanceId: self.instanceId,
            })
            return true
        }
    }
    return false
}
