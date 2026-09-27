// コアを置くアクション（ボイド・トラッシュから自分のスピリット・ネクサス・リザーブ・トラッシュへ、コアチャージ）
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance } from "../../type"
import { getCard, log, suspend } from "../GameState"
import { placeCoresOnSpirit, voidCorePlacementBlocked } from "../EffectModules"
import { effectiveBp } from "../../../../shared/rules"
import { countedAmount } from "../counted"



const destructionCoresToOwnSpiritHandler: ActionHandler<"destructionCoresToOwnSpirit"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 盾精ラングリーズ／神鳴る霊峰：破壊されたスピリットに乗っていたコアを、
        // 持ち主の実効BP最大のスピリットへ付け替える（対象選択の決定的簡略化）。
        // 破壊時の誘発なので、そのスピリットは**破壊待機状態でまだコアを乗せたまま**
        // （TIMING_CHART.md §1.5）。そこから直接移す
        const coreCount = self?.coresAtDestruction ?? 0
        if (coreCount <= 0) {
            log(state, `${sourceName}：移すコアがなかった。`)
            return
        }
        const player = state.players[owner]
        // 破壊待機状態の個体はこのあとトラッシュへ行くので、移し先の候補から外す
        const target = player.field.spirits
            .filter((s) => !s.pendingDestruction)
            .reduce<CardInstance | null>(
                (best, s) =>
                    !best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
                null,
            )
        if (!target) {
            log(state, `${sourceName}：移す先のスピリットがいなかった（リザーブに残る）。`)
            return
        }
        let moveCount: number
        let from: string
        if (self && self.pendingDestruction && self.cores > 0) {
            moveCount = Math.min(coreCount, self.cores)
            self.cores -= moveCount
            from = "破壊されたスピリットのコア"
        } else {
            // 破壊が確定した後（コアが既にリザーブへ移っている）経路への保険
            moveCount = Math.min(coreCount, player.reserve)
            player.reserve -= moveCount
            from = "リザーブのコア"
        }
        placeCoresOnSpirit(state, target, moveCount, owner)
        log(
            state,
            `${sourceName}：${from}${moveCount}個を${getCard(target.cardId).name}へ移した。`,
        )
        return
}

const handlers = {
    destructionCoresToOwnSpirit: destructionCoresToOwnSpiritHandler,
} satisfies Partial<ActionRegistry>

export default handlers
