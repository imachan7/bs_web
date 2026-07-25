// BP修正系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import { currentLevel, getCard, log } from "../GameState"
import {
    applyMagicBuffBonus,
    countEffectCounter,
    effectiveBp,
    instHasColor,
    instanceSymbolCount,
    matchesFamilyFilter,
    pickBpBuffTarget,
    requestCardChoice,
    requestChoice,
    spiritHasKeyword,
} from "../EffectModules"

const selfBuff: ActionHandler<"selfBuff"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColor, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (!self) return
        self.tempBpBuff += action.amount
        log(
            state,
            `${getCard(self.cardId).name}はBP+${action.amount}（ターン終了時まで）。`,
        )
        return
}

const selfBuffPer: ActionHandler<"selfBuffPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColor, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット自身を「カウント値×amountPer」だけBP+
        if (!self) {
            log(state, `${sourceName}：バフ対象がいなかった。`)
            return
        }
        const count = countEffectCounter(state, owner, self, action.counter)
        if (count === 0) {
            log(state, `${sourceName}：カウントが0のため増加しなかった。`)
            return
        }
        const amount = count * action.amountPer
        self.tempBpBuff += amount
        log(
            state,
            `${getCard(self.cardId).name}はBP+${amount}（ターン終了時まで）。`,
        )
        return
}

const bpBuff: ActionHandler<"bpBuff"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColor, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (action.attackingAll) {
            // オフェンシブオーラ／フォレストオーラ：対象選択なしで「アタックしている自分のスピリットすべて」をBP+。
            // 現エンジンは同時アタック1体のため、バトルのアタッカーが自分側なら対象（targetInstanceIdは無視）。
            // familyFilter指定時は該当系統持ちのみ（フォレストオーラ＝爪鳥/樹魔）
            const attackers = state.players[owner].field.spirits.filter(
                (s) =>
                    state.battle &&
                    s.instanceId === state.battle.attackerInstanceId &&
                    (!action.familyFilter || matchesFamilyFilter(state, owner, s, action.familyFilter)),
            )
            if (attackers.length === 0) {
                log(state, `${sourceName}のBP増加：アタックしている自分のスピリットがいなかった。`)
                return
            }
            for (const t of attackers) {
                t.tempBpBuff += action.amount
                log(
                    state,
                    `${getCard(t.cardId).name}はBP+${action.amount}（ターン終了時まで）。`,
                )
                applyMagicBuffBonus(state, t, srcType, srcColor)
            }
            return
        }
        const target = pickBpBuffTarget(state, owner, targetInstanceId, action.minSymbols)
        if (!target) {
            log(state, `${sourceName}のBP増加：対象がいなかった。`)
            return
        }
        target.tempBpBuff += action.amount
        log(
            state,
            `${getCard(target.cardId).name}はBP+${action.amount}（ターン終了時まで）。`,
        )
        applyMagicBuffBonus(state, target, srcType, srcColor)
        return
}

const bpBuffAll: ActionHandler<"bpBuffAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColor, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const spirits = state.players[owner].field.spirits.filter(
            (s) =>
                !action.familyFilter ||
                matchesFamilyFilter(state, owner, s, action.familyFilter),
        )
        for (const s of spirits) {
            s.tempBpBuff += action.amount
        }
        const familyLabel = action.familyFilter
            ? Array.isArray(action.familyFilter)
                ? action.familyFilter.join("/")
                : action.familyFilter
            : ""
        log(
            state,
            `${state.players[owner].name}の${familyLabel ? `【${familyLabel}】` : ""}スピリットすべてがBP+${action.amount}（ターン終了時まで）。`,
        )
        return
}

const bpBuffPer: ActionHandler<"bpBuffPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColor, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const count = countEffectCounter(state, owner, self, action.counter)
        if (count === 0) {
            log(state, `${sourceName}のBP増加：カウントが0のため増加しなかった。`)
            return
        }
        const target = pickBpBuffTarget(state, owner, targetInstanceId)
        if (!target) {
            log(state, `${sourceName}のBP増加：対象がいなかった。`)
            return
        }
        const amount = count * action.amountPer
        target.tempBpBuff += amount
        log(
            state,
            `${getCard(target.cardId).name}はBP+${amount}（ターン終了時まで）。`,
        )
        applyMagicBuffBonus(state, target, srcType, srcColor)
        return
}

const bpBuffByExhaustOwn: ActionHandler<"bpBuffByExhaustOwn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColor, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ユナイテッドパワー：回復状態の自分スピリット1体を疲労させ、その実効BP分だけ
        // 自分のスピリット1体をバフする。段階判定は「最も進んだ段階の指標を先に見る」方式
        // （grantColorChoiceと同じ考え方）: selfが埋まっていれば第2段階（疲労元は既に確定）、
        // targetInstanceIdのみなら第1段階の応答（疲労させる対象が確定した直後）、
        // どちらもなければ最初の呼び出し
        if (self && targetInstanceId !== undefined) {
            // 第2段階：selfが疲労させたスピリット、targetInstanceIdがバフ先
            const buffTarget = pickBpBuffTarget(state, owner, targetInstanceId)
            if (!buffTarget) {
                log(state, `${sourceName}：BPを増加させる対象がいなかった。`)
                return
            }
            const amount = effectiveBp(state, owner, self)
            buffTarget.tempBpBuff += amount
            log(
                state,
                `${getCard(self.cardId).name}は疲労し、${getCard(buffTarget.cardId).name}はBP+${amount}（ターン終了時まで）。`,
            )
            applyMagicBuffBonus(state, buffTarget, srcType, srcColor)
            return
        }
        if (targetInstanceId !== undefined) {
            // 第1段階の応答：疲労させるスピリットが決まったので疲労させ、続けてバフ先を選ばせる
            const exhaustTarget = state.players[owner].field.spirits.find(
                (s) => s.instanceId === targetInstanceId,
            )
            if (!exhaustTarget || exhaustTarget.isRested) {
                log(state, `${sourceName}：疲労させる対象がいなかった。`)
                return
            }
            exhaustTarget.isRested = true
            if (state.interactiveTargets) {
                const buffCandidates = state.players[owner].field.spirits.map((s) => s.instanceId)
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：BPを増加させる自分のスピリットを選んでください`,
                    buffCandidates,
                    false,
                    action,
                    exhaustTarget,
                )
                return
            }
            const buffTarget = pickBpBuffTarget(state, owner)
            if (!buffTarget) {
                log(state, `${sourceName}：BPを増加させる対象がいなかった。`)
                return
            }
            const amount = effectiveBp(state, owner, exhaustTarget)
            buffTarget.tempBpBuff += amount
            log(
                state,
                `${getCard(exhaustTarget.cardId).name}は疲労し、${getCard(buffTarget.cardId).name}はBP+${amount}（ターン終了時まで）。`,
            )
            applyMagicBuffBonus(state, buffTarget, srcType, srcColor)
            return
        }
        // 最初の呼び出し：疲労させる自分のスピリット（回復状態のみ）を選ぶ
        const restCandidates = state.players[owner].field.spirits.filter((s) => !s.isRested)
        if (restCandidates.length === 0) {
            log(state, `${sourceName}：回復状態の自分のスピリットがいないため発動しなかった。`)
            return
        }
        if (state.interactiveTargets) {
            requestChoice(
                state,
                owner,
                `${sourceName}：疲労させる自分のスピリットを選んでください`,
                restCandidates.map((s) => s.instanceId),
                false,
                action,
                self,
            )
            return
        }
        const auto = restCandidates.reduce((best, s) =>
            effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
        )
        auto.isRested = true
        const buffTarget = pickBpBuffTarget(state, owner)
        if (!buffTarget) {
            log(state, `${sourceName}：BPを増加させる対象がいなかった。`)
            return
        }
        const amount = effectiveBp(state, owner, auto)
        buffTarget.tempBpBuff += amount
        log(
            state,
            `${getCard(auto.cardId).name}は疲労し、${getCard(buffTarget.cardId).name}はBP+${amount}（ターン終了時まで）。`,
        )
        applyMagicBuffBonus(state, buffTarget, srcType, srcColor)
        return
}

const selfBuffByHandDiscard: ActionHandler<"selfBuffByHandDiscard"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColor, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 手札の指定種別カード1枚を破棄することでself自身をBP+amountできる（任意コスト）
        if (!self) {
            log(state, `${sourceName}：バフ対象がいなかった。`)
            return
        }
        const player = state.players[owner]
        const typeLabel =
            action.discardCardType === "nexus"
                ? "ネクサス"
                : action.discardCardType === "magic"
                  ? "マジック"
                  : "スピリット"
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：破棄する手札がなかった。`)
                return
            }
            player.hand.splice(chosenCardIndex, 1)
            player.trashCards.push(cardId)
            self.tempBpBuff += action.amount
            log(
                state,
                `${player.name}は手札の${typeLabel}カード「${getCard(cardId).name}」を破棄し、${getCard(self.cardId).name}はBP+${action.amount}（ターン終了時まで）。`,
            )
            return
        }
        const indices = player.hand
            .map((_, i) => i)
            .filter((i) => getCard(player.hand[i]!).type === action.discardCardType)
        if (indices.length === 0) {
            log(state, `${sourceName}：手札に${typeLabel}カードがなかった。`)
            return
        }
        if (state.interactiveTargets) {
            requestCardChoice(
                state,
                owner,
                `${sourceName}：${typeLabel}カード1枚を破棄してBP+${action.amount}できます（任意）`,
                "hand",
                indices,
                true,
                action,
                self,
            )
            return
        }
        // 自動時：手札末尾（新しい方）の該当カードを破棄する簡略化
        const idx = indices[indices.length - 1]!
        const cardId = player.hand[idx]!
        player.hand.splice(idx, 1)
        player.trashCards.push(cardId)
        self.tempBpBuff += action.amount
        log(
            state,
            `${player.name}は手札の${typeLabel}カード「${getCard(cardId).name}」を破棄し、${getCard(self.cardId).name}はBP+${action.amount}（ターン終了時まで）。`,
        )
        return
}

const handlers = {
    selfBuff,
    selfBuffPer,
    bpBuff,
    bpBuffAll,
    bpBuffPer,
    bpBuffByExhaustOwn,
    selfBuffByHandDiscard,
} satisfies Partial<ActionRegistry>

export default handlers
