// コアを置くアクション（ボイド・トラッシュから自分のスピリット・ネクサス・リザーブ・トラッシュへ、コアチャージ）
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance } from "../../type"
import { getCard, log, suspend } from "../GameState"
import { destroySpirit, placeCoresOnSpirit, requestChoice, voidCorePlacementBlocked } from "../EffectModules"
import { effectiveBp } from "../../../../shared/rules"
import { countedAmount } from "../counted"


const coreGainHandler: ActionHandler<"coreGain"> = (ctx, action) => {
    const { state, owner, self, sourceName, srcType, destroyContext, targetInstanceId } = ctx
        if (voidCorePlacementBlocked(state)) {
            log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため発動しなかった。`)
            return
        }
        const player = state.players[owner]
        // costDestroyOwnSpirit：コストがminCost以上の自分のスピリット1体を破壊することがコスト
        // （BS10-105ライフチャージ）。「〜することで〜する」の任意コストは、破壊できる対象が
        // いなければ不発（COST_MODEL.md §1）。何を犠牲にするかは候補2体以上ならプレイヤーが選ぶ（§2）
        if (action.costDestroyOwnSpirit) {
            const minCost = action.costDestroyOwnSpirit.minCost ?? 0
            const candidates = player.field.spirits.filter((s) => getCard(s.cardId).cost >= minCost)
            if (candidates.length === 0) {
                log(state, `${sourceName}：コストにできるスピリットがいないため発動しなかった。`)
                return
            }
            let victim: CardInstance | undefined
            if (action.costSacrificeChosen && targetInstanceId !== undefined) {
                victim = candidates.find((s) => s.instanceId === targetInstanceId)
                if (!victim) {
                    log(state, `${sourceName}：指定されたスピリットはコストにできなかった。`)
                    return
                }
            } else if (state.interactiveTargets && candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コストとして破壊する自分のスピリットを選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    { ...action, costSacrificeChosen: true },
                    self,
                )
                return
            } else {
                victim = candidates[0]!
                for (const s of candidates) {
                    if (getCard(s.cardId).cost < getCard(victim.cardId).cost) victim = s
                }
            }
            log(state, `${player.name}は${sourceName}のコストとして${getCard(victim.cardId).name}を破壊した。`)
            destroySpirit(state, owner, victim.instanceId, "destroy", destroyContext)
        }
        const count =
            action.countCounter !== undefined
                ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
                : action.count
        if (action.countCounter !== undefined && count === 0) {
            log(state, `${sourceName}：カウントが0のため獲得しなかった。`)
            return
        }
        player.reserve += count
        log(
            state,
            `${player.name}はボイドからコア${count}個をリザーブに置いた。（リザーブ${player.reserve}）`,
        )
        return
}

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
    coreGain: coreGainHandler,
    voidCoreToSelf: voidCoreToSelfHandler,
    destructionCoresToOwnSpirit: destructionCoresToOwnSpiritHandler,
} satisfies Partial<ActionRegistry>

export default handlers
