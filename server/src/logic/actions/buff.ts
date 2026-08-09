// BP修正系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance } from "../../type"
import { currentLevel, getCard, log } from "../GameState"
import {
    applyMagicBuffBonus,
    bofuCountFor,
    countEffectCounter,
    effectActiveAtLevel,
    effectiveBp,
    exhaustSpirit,
    instHasColor,
    instanceSymbolCount,
    matchesFamilyFilter,
    findSpiritAny,
    pickAnySideByBp,
    pickBpBuffTarget,
    pickEnemyByBp,
    requestCardChoice,
    requestChoice,
    spiritHasKeyword,
} from "../EffectModules"
import { isBpBuffSuppressed, matchesTarget } from "../../../../shared/rules"
import { normalizeFilter, SELF_REQUIRED } from "./filter"

// BS05アイシクルアサルト用: このスピリットが持つ【装甲】の指定色数（静的keyword＋一時付与tempKeywordsを合算、重複除く）
function armorColorCount(inst: CardInstance): number {
    const level = currentLevel(inst).level
    const colors = new Set<string>()
    for (const e of getCard(inst.cardId).effects) {
        if (e.kind === "keyword" && e.keyword === "armor" && effectActiveAtLevel(e.levels, level)) {
            for (const c of e.colors ?? []) colors.add(c)
        }
    }
    for (const k of inst.tempKeywords) {
        if (k.keyword === "armor") {
            for (const c of k.colors ?? []) colors.add(c)
        }
    }
    return colors.size
}

// スリーカード：対象スピリット1体に「このターンの間、使用者の効果では count 体分として数える」印を付ける。
// 対象未指定時は実効BP最大の1体（自動選択の簡略化。anySide 指定時は自分/相手どちらからも選ぶ）
const countAsMultipleThisTurnHandler: ActionHandler<"countAsMultipleThisTurn"> = (ctx, action) => {
    const { state, owner, opp, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const found = targetInstanceId
        ? findSpiritAny(state, targetInstanceId)
        : action.anySide
          ? pickAnySideByBp(state, owner, Infinity, () => true, srcColors, srcType)
          : (() => {
                const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType)
                return t ? { pid: opp, inst: t } : null
            })()
    if (!found) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    found.inst.countAsThisTurn = { pid: owner, count: action.count }
    log(
        state,
        `${sourceName}：このターンの間、${getCard(found.inst.cardId).name}は${state.players[owner].name}の効果で${action.count}体分として数えられる。`,
    )
}

const selfBuff: ActionHandler<"selfBuff"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (!self) return
        self.tempBpBuff += action.amount
        log(
            state,
            `${getCard(self.cardId).name}はBP+${action.amount}（ターン終了時まで）。`,
        )
        return
}

const selfBuffPer: ActionHandler<"selfBuffPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
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
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 対象1体の経路は matchesTarget を通らないため、この経路が扱える軸を filter から取り出して渡す
        // （minSymbols＝ライトニングバリスタ等／nameContains＝BS07ウィリアンスラッシュ「勇者」／
        //   keyword・attackingOnly＝BS07桜の妖精オウカ「アタックしている【聖命】持ち」／
        //   family＝BS07ニードルショット「系統：剣獣」）
        const target = pickBpBuffTarget(
            state,
            owner,
            targetInstanceId,
            action.filter?.minSymbols,
            action.filter?.keyword,
            action.filter?.nameContains,
            action.filter?.attackingOnly,
            action.filter?.family,
        )
        if (!target) {
            log(state, `${sourceName}のBP増加：対象がいなかった。`)
            return
        }
        // amountFromSelfBp（BS08機人フィアラル）：amountを無視し、発生源自身の実効BPを加算量として使う
        if (action.amountFromSelfBp) {
            if (!self) {
                log(state, `${sourceName}のBP増加：発生源がいなかった。`)
                return
            }
            const amount = effectiveBp(state, owner, self)
            target.tempBpBuff += amount
            log(
                state,
                `${getCard(target.cardId).name}はBP+${amount}（ターン終了時まで）。`,
            )
            applyMagicBuffBonus(state, target, srcType, srcColors)
            return
        }
        target.tempBpBuff += action.amount
        log(
            state,
            `${getCard(target.cardId).name}はBP+${action.amount}（ターン終了時まで）。`,
        )
        applyMagicBuffBonus(state, target, srcType, srcColors)
        return
}

const bpBuffAll: ActionHandler<"bpBuffAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 絞り込みは共通の TargetFilter に一本化（family 軸）
        const allFilter = normalizeFilter(ctx, action)
        if (allFilter === SELF_REQUIRED) {
            log(state, `${sourceName}のBP増加：BP参照元がいなかった。`)
            return
        }
        const spirits = state.players[owner].field.spirits.filter((s) =>
            matchesTarget(state, owner, s, allFilter, self?.instanceId),
        )
        for (const s of spirits) {
            s.tempBpBuff += action.amount
        }
        const family = action.filter?.family
        const familyLabel = family ? (Array.isArray(family) ? family.join("/") : family) : ""
        log(
            state,
            `${state.players[owner].name}の${familyLabel ? `【${familyLabel}】` : ""}スピリットすべてがBP+${action.amount}（ターン終了時まで）。`,
        )
        return
}

const bpBuffAllByArmorColors: ActionHandler<"bpBuffAllByArmorColors"> = (ctx, action) => {
    const { state, owner } = ctx
        // 自分の【装甲】を持つスピリットすべてを、それぞれが持つ装甲の色数×amountPerだけBP+
        let count = 0
        for (const s of state.players[owner].field.spirits) {
            const colors = armorColorCount(s)
            if (colors === 0) continue
            s.tempBpBuff += action.amountPer * colors
            count++
        }
        if (count === 0) {
            log(state, `${state.players[owner].name}：【装甲】を持つスピリットがいなかった。`)
            return
        }
        log(
            state,
            `${state.players[owner].name}の【装甲】を持つスピリット${count}体が、装甲の色数に応じてBP増加（ターン終了時まで）。`,
        )
        return
}

// BS08スナイピングブラスト：自分のスピリットすべてを、それぞれが持つ【暴風】の実効指定数×amountPerだけBP+
// （bpBuffAllByArmorColorsの暴風版。暴風を持たない個体は対象外）
const bpBuffAllByBofuCount: ActionHandler<"bpBuffAllByBofuCount"> = (ctx, action) => {
    const { state, owner } = ctx
        let count = 0
        for (const s of state.players[owner].field.spirits) {
            const bofu = bofuCountFor(state, owner, s)
            if (bofu === 0) continue
            s.tempBpBuff += action.amountPer * bofu
            count++
        }
        if (count === 0) {
            log(state, `${state.players[owner].name}：【暴風】を持つスピリットがいなかった。`)
            return
        }
        log(
            state,
            `${state.players[owner].name}の【暴風】を持つスピリット${count}体が、指定数に応じてBP増加（ターン終了時まで）。`,
        )
        return
}

// BS08ダークパワー：カウント値×amountPerを、filter一致の自分のスピリットすべてにBP+
// （bpBuffPerの単体対象を「全体」に広げた版）
const bpBuffAllPer: ActionHandler<"bpBuffAllPer"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
        const count = countEffectCounter(state, owner, self, action.counter)
        if (count === 0) {
            log(state, `${sourceName}のBP増加：カウントが0のため増加しなかった。`)
            return
        }
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}のBP増加：BP参照元がいなかった。`)
            return
        }
        const spirits = state.players[owner].field.spirits.filter((s) =>
            matchesTarget(state, owner, s, filter, self?.instanceId),
        )
        if (spirits.length === 0) {
            log(state, `${sourceName}のBP増加：対象条件を満たすスピリットがいなかった。`)
            return
        }
        const amount = count * action.amountPer
        for (const s of spirits) s.tempBpBuff += amount
        log(
            state,
            `${state.players[owner].name}の対象スピリット${spirits.length}体がBP+${amount}（ターン終了時まで）。`,
        )
        return
}

const bpBuffPer: ActionHandler<"bpBuffPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // targetSymbols（BS06サベージパワー）：**対象スピリット自身**のシンボル数を数えるため、
        // 対象選択をカウント計算より先に行う（マジックはself=nullでselfSymbolsが使えない）
        if (action.counter === "targetSymbols") {
            const target = pickBpBuffTarget(state, owner, targetInstanceId)
            if (!target) {
                log(state, `${sourceName}のBP増加：対象がいなかった。`)
                return
            }
            const count = instanceSymbolCount(target)
            if (count === 0) {
                log(state, `${sourceName}のBP増加：カウントが0のため増加しなかった。`)
                return
            }
            const amount = count * action.amountPer
            target.tempBpBuff += amount
            log(
                state,
                `${getCard(target.cardId).name}はBP+${amount}（ターン終了時まで）。`,
            )
            applyMagicBuffBonus(state, target, srcType, srcColors)
            return
        }
        const count = countEffectCounter(state, owner, self, action.counter)
        if (count === 0) {
            log(state, `${sourceName}のBP増加：カウントが0のため増加しなかった。`)
            return
        }
        const target = pickBpBuffTarget(state, owner, targetInstanceId, undefined, action.keywordFilter)
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
        applyMagicBuffBonus(state, target, srcType, srcColors)
        return
}

const bpBuffByExhaustOwn: ActionHandler<"bpBuffByExhaustOwn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
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
            applyMagicBuffBonus(state, buffTarget, srcType, srcColors)
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
            exhaustSpirit(state, owner, exhaustTarget)
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
            applyMagicBuffBonus(state, buffTarget, srcType, srcColors)
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
        exhaustSpirit(state, owner, auto)
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
        applyMagicBuffBonus(state, buffTarget, srcType, srcColors)
        return
}

const selfBuffByExhaustFamily: ActionHandler<"selfBuffByExhaustFamily"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
        // 巨神機トールLv1-3：familyFilter一致・self以外・回復状態の自分のスピリット1体
        // （実効BP最大を自動選択＝バフ量を最大化する簡略化）を疲労させ、self自身をその実効BP分だけBP+する。
        // 「〜することで」の任意コストは自動発動で簡略化
        if (!self) {
            log(state, `${sourceName}：バフ対象がいなかった。`)
            return
        }
        const candidates = state.players[owner].field.spirits.filter(
            (s) =>
                !s.isRested &&
                s.instanceId !== self.instanceId &&
                matchesFamilyFilter(state, owner, s, action.familyFilter),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：疲労させる対象がいなかったため発動しなかった。`)
            return
        }
        const target = candidates.reduce((best, s) =>
            effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
        )
        const amount = effectiveBp(state, owner, target)
        exhaustSpirit(state, owner, target)
        self.tempBpBuff += amount
        log(
            state,
            `${getCard(target.cardId).name}は疲労し、${getCard(self.cardId).name}はBP+${amount}（ターン終了時まで）。`,
        )
        return
}

const selfBuffByHandDiscard: ActionHandler<"selfBuffByHandDiscard"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
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
    countAsMultipleThisTurn: countAsMultipleThisTurnHandler,
    selfBuff,
    selfBuffPer,
    bpBuff,
    bpBuffAll,
    bpBuffAllByArmorColors,
    bpBuffAllByBofuCount,
    bpBuffAllPer,
    bpBuffPer,
    bpBuffByExhaustOwn,
    selfBuffByExhaustFamily,
    selfBuffByHandDiscard,
} satisfies Partial<ActionRegistry>

// 古代闘技場Lv1（kind:"bpBuffSuppression"）：相手の「BPを+する」効果は発揮されない。
// BP増加アクションはこのモジュールに集約されているため、**レジストリを1箇所で包んで**ゲートする
// （8ハンドラそれぞれに早期returnを撒くと、将来アクションを足したときに素通りする）。
// BPを-する効果は抑止の対象外のため、amount/amountPer が負のものは通す
function isBpDecrease(action: { amount?: number; amountPer?: number }): boolean {
    const amount = action.amount ?? action.amountPer
    return typeof amount === "number" && amount < 0
}

type AnyBuffHandler = (ctx: ActionCtx, action: { amount?: number; amountPer?: number }) => void

const suppressed = Object.fromEntries(
    Object.entries(handlers).map(([type, handler]) => [
        type,
        ((ctx, action) => {
            if (!isBpDecrease(action) && isBpBuffSuppressed(ctx.state, ctx.owner)) {
                log(ctx.state, `${ctx.sourceName}：「BPを+する」効果は発揮されなかった。`)
                return
            }
            ;(handler as AnyBuffHandler)(ctx, action)
        }) as AnyBuffHandler,
    ]),
) as unknown as typeof handlers

export default suppressed
