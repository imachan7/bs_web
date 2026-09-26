// コアを置くアクション（ボイド・トラッシュから自分のスピリット・ネクサス・リザーブ・トラッシュへ、コアチャージ）
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance } from "../../type"
import { getCard, log, suspend } from "../GameState"
import { placeCoresOnSpirit, voidCorePlacementBlocked } from "../EffectModules"
import { effectiveBp } from "../../../../shared/rules"
import { countedAmount } from "../counted"


const voidCoreToSelfHandler: ActionHandler<"voidCoreToSelf"> = (ctx, action) => {
    const { state, owner, self, sourceName, srcType, chosenOption } = ctx
        // costDiscardOwnBurst（BS15-022アナグマッド・デビル）：自分のバースト1つを破棄することがコスト。
        // バーストをセットしていなければ不発
        if (action.costDiscardOwnBurst) {
            const ownerPlayer = state.players[owner]
            if (ownerPlayer.burst === null) {
                log(state, `${sourceName}：バーストをセットしていないため発動しなかった。`)
                return
            }
            ownerPlayer.trashCards.push(ownerPlayer.burst)
            ownerPlayer.burst = null
            ownerPlayer.burstSet = false
            log(state, `${ownerPlayer.name}は${sourceName}のコストとして自分のバーストを破棄した。`)
            const { costDiscardOwnBurst: _cdob, ...rest } = action
            ctx.resolve(rest)
            return
        }
        // ボイドからコアをこのスピリット上に置く（レベル変動は cores 増加で自然に反映される）
        if (voidCorePlacementBlocked(state)) {
            log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため発動しなかった。`)
            return
        }
        if (!self) {
            log(state, `${sourceName}：コアを置く対象がいなかった。`)
            return
        }
        const count =
            action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
                : action.count
        if (action.countCounter !== undefined && count === 0) {
            log(state, `${sourceName}：カウントが0のためコアを置かなかった。`)
            return
        }
        // orReserve（BS12-077/BS12-X03）：「自分のリザーブか、このスピリット上か」を効果の使用者が毎回選ぶ
        if (action.orReserve) {
            if (chosenOption === "このスピリット上に置く") {
                // 下の通常経路（スピリット上に置く）へ落ちる
            } else if (chosenOption === "リザーブに置く" || !state.interactiveTargets) {
                const player = state.players[owner]
                player.reserve += count
                log(state, `${player.name}はボイドからコア${count}個をリザーブに置いた。（リザーブ${player.reserve}）`)
                return
            } else {
                suspend(state, {
                    pid: owner,
                    kind: "option",
                    prompt: `${sourceName}：ボイドからコア${count}個を、自分のリザーブか、このスピリット上のどちらに置きますか？`,
                    candidates: [],
                    options: ["リザーブに置く", "このスピリット上に置く"],
                    optional: false,
                    action,
                    selfInstanceId: self.instanceId,
                })
                return
            }
        }
        log(
            state,
            `${getCard(self.cardId).name}は、ボイドからコア${count}個を自身の上に置いた。`,
        )
        placeCoresOnSpirit(state, self, count, owner)
        return
}

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
    voidCoreToSelf: voidCoreToSelfHandler,
    destructionCoresToOwnSpirit: destructionCoresToOwnSpiritHandler,
} satisfies Partial<ActionRegistry>

export default handlers
