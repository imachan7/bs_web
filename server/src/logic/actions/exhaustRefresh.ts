// 疲労・回復系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, PlayerId } from "../../type"
import { currentLevel, getCard, log } from "../GameState"
import {
    findSpiritAny,
    isExhaustImmune,
    isImmuneToArea,
    isEffectBlocked,
    pickAnySideCandidates,
    pickEnemyByBp,
    pickEnemyCandidates,
    tryInteractiveTargetChoice,
} from "../EffectModules"
import { effectiveBp, hasArmorAgainst, hasMagicImmunity, instColors, instHasColor, isVanillaCard, matchesFamilyFilter, matchesTarget, spiritHasFamily, spiritHasKeyword } from "../../../../shared/rules"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { COLOR_LABELS } from "../../../../data/constants"

const exhaustHandler: ActionHandler<"exhaust"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 絞り込みは共通の TargetFilter に一本化（level/cost の2軸）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の疲労付与：BP参照元がいなかった。`)
            return
        }
        const matchesLevel = (s: CardInstance) => matchesTarget(state, opp, s, filter, self?.instanceId)
        // 対象指定時はその1体のみ処理（既に疲労済み・levelFilter不一致ならログを出して何もしない）
        if (targetInstanceId) {
            const found = findSpiritAny(state, targetInstanceId)
            if (!found) {
                log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                return
            }
            if (
                found.pid !== owner &&
                (hasArmorAgainst(found.inst, srcColors) ||
                    isEffectBlocked(state, found.inst, srcType) ||
                    (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst)) ||
                    isExhaustImmune(state, found.pid, found.inst))
            ) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                return
            }
            if (!matchesLevel(found.inst)) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の対象条件を満たさない。`)
                return
            }
            if (found.inst.isRested) {
                log(
                    state,
                    `${getCard(found.inst.cardId).name}はすでに疲労している。`,
                )
                return
            }
            found.inst.isRested = true
            log(state, `${getCard(found.inst.cardId).name}は疲労した。`)
            return
        }
        // 未指定時（自動選択・対象choice共通）は対象が常に相手側（opp）のため、疲労免疫を無条件でフィルタする
        const matchesCandidate = (s: CardInstance) =>
            !s.isRested && matchesLevel(s) && !isExhaustImmune(state, opp, s)
        // anySide：「自分か相手のスピリット1体を疲労させる」（BS03-104 運命分かつ岐路／BS04-042 ドヴェルグ）。
        // 自分側は疲労免疫・装甲の対象外（既存の anySide 系と同じ非対称ルール）
        if (action.anySide) {
            const candidates = pickAnySideCandidates(
                state,
                owner,
                (sp) => !sp.isRested && matchesLevel(sp),
                srcColors,
                srcType,
            ).filter((sp) => state.players[owner].field.spirits.includes(sp) || !isExhaustImmune(state, opp, sp))
            if (
                state.interactiveTargets &&
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}：疲労させるスピリットを選んでください`,
                    candidates,
                    { ...action, count: 1 },
                    action.count > 1 ? { ...action, count: action.count - 1 } : null,
                )
            ) {
                return
            }
            // 自動時は実効BP最大を1体（相手側→自分側の順で同値は先勝ち）
            const target = candidates.reduce<CardInstance | undefined>(
                (best, sp) =>
                    !best || effectiveBp(state, owner, sp) > effectiveBp(state, owner, best) ? sp : best,
                undefined,
            )
            if (!target) {
                log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                return
            }
            target.isRested = true
            log(state, `${getCard(target.cardId).name}は疲労した。`)
            return
        }
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, matchesCandidate, srcColors, srcType)
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の疲労付与：対象を選んでください`,
                    candidates,
                    { ...action, count: 1 },
                    action.count > 1 ? { ...action, count: action.count - 1 } : null,
                )
            ) {
                return
            }
        }
        // 未指定時は相手フィールドの回復状態（かつlevelFilter一致）スピリットからBP最大をcount回自動選択
        for (let i = 0; i < action.count; i++) {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                matchesCandidate,
                srcColors,
                srcType,
            )
            if (!target) {
                log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                break
            }
            target.isRested = true
            log(state, `${getCard(target.cardId).name}は疲労した。`)
        }
        return
}

const exhaustAllHandler: ActionHandler<"exhaustAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 指定側のスピリットをBP範囲で疲労させる（相手側のみ装甲・疲労免疫を尊重）
        const sides: PlayerId[] = action.side === "both" ? ["p1", "p2"] : [opp]
        let exhausted = 0
        for (const pid of sides) {
            for (const s of state.players[pid].field.spirits) {
                if (s.isRested) continue
                const bp = effectiveBp(state, pid, s)
                if (action.minBp !== undefined && bp < action.minBp) continue
                if (action.maxBp !== undefined && bp > action.maxBp) continue
                // filter は cores / excludeSelf の2軸のみ対応（BS05双剣虎ジェン・フー：コア1個のみ・自分以外）
                if (action.filter?.cores !== undefined && s.cores !== action.filter.cores) continue
                if (action.filter?.excludeSelf && self && s.instanceId === self.instanceId) continue
                if (isEffectBlocked(state, s, srcType)) continue
                if (pid !== owner && (hasArmorAgainst(s, srcColors) || isExhaustImmune(state, pid, s) || isImmuneToArea(s))) continue
                s.isRested = true
                exhausted++
            }
        }
        log(state, `${sourceName}：条件を満たす${exhausted}体を疲労させた。`)
        return
}

const exhaustAllByLevelHandler: ActionHandler<"exhaustAllByLevel"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 両陣営のcurrentLevelが一致するスピリットをすべて疲労させる（疲労済みはno-op、範囲効果）。
        // "lastBattleDestroyed"指定時は直前のバトル解決で破壊されたブロッカーのLvを使用（0=まだ発生していない=不発。魔界伯爵ヴィール）
        const level =
            action.level === "lastBattleDestroyed" ? state.lastBattleDestroyedLevel : action.level
        if (level === 0) {
            log(state, `${sourceName}：直前のバトルで破壊されたスピリットがいないため発動しなかった。`)
            return
        }
        let count = 0
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const s of state.players[pid].field.spirits) {
                if (currentLevel(s).level !== level) continue
                if (s.isRested) continue
                // 疲労させる側（owner）と持ち主が異なるときのみ装甲・疲労免疫・範囲免疫を判定（トランプの王国）
                if (isEffectBlocked(state, s, srcType)) continue
                if (pid !== owner && (hasArmorAgainst(s, srcColors) || isExhaustImmune(state, pid, s) || isImmuneToArea(s))) continue
                s.isRested = true
                count++
            }
        }
        log(state, `${sourceName}：Lv${level}のスピリット${count}体を疲労させた。`)
        return
}

const exhaustAllByColorHandler: ActionHandler<"exhaustAllByColor"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const oppSpirits = state.players[opp].field.spirits
        if (oppSpirits.length === 0) {
            log(state, `${sourceName}：相手フィールドにスピリットがいなかった。`)
            return
        }
        // 相手フィールドで最多の色を選ぶ（同数なら先に見つかった色。Map は挿入順を保持する）
        const tally = new Map<Color, number>()
        for (const s of oppSpirits) {
            const colors = new Set<Color>(instColors(s))
            for (const color of colors) {
                tally.set(color, (tally.get(color) ?? 0) + 1)
            }
        }
        let chosen: Color | null = null
        let best = 0
        for (const [color, count] of tally) {
            if (count > best) {
                best = count
                chosen = color
            }
        }
        if (!chosen) {
            log(state, `${sourceName}：対象の色がなかった。`)
            return
        }
        let exhausted = 0
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const s of state.players[pid].field.spirits) {
                if (!instHasColor(s, chosen)) continue
                // 装甲・疲労免疫・範囲免疫は「相手の効果」を防ぐものなので、自分側のスピリットには適用しない
                if (isEffectBlocked(state, s, srcType)) continue
                if (pid !== owner && (hasArmorAgainst(s, srcColors) || isExhaustImmune(state, pid, s) || isImmuneToArea(s))) continue
                s.isRested = true
                exhausted++
            }
        }
        log(
            state,
            `${sourceName}：色「${COLOR_LABELS[chosen]}」を選び、${exhausted}体を疲労させた。`,
        )
        return
}

const exhaustOpponentToMatchHandler: ActionHandler<"exhaustOpponentToMatch"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // セイムタイアード：自分の疲労スピリット数と同数になるまで相手のスピリットを疲労させる。
        // 差分をcountとして既存"exhaust"の単体処理へ委譲し、armor/免疫/interactive choiceを自然に通す
        const ownExhausted = state.players[owner].field.spirits.filter((s) => s.isRested).length
        const oppExhausted = state.players[opp].field.spirits.filter((s) => s.isRested).length
        const diff = ownExhausted - oppExhausted
        if (diff <= 0) {
            log(state, `${sourceName}：相手の疲労スピリットが自分以上のため発動しなかった。`)
            return
        }
        ctx.resolve({ type: "exhaust", count: diff }, { targetInstanceId, sourceColors: srcColors, sourceType: srcType })
        return
}

const refreshOneHandler: ActionHandler<"refreshOne"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
        // 絞り込みは共通の TargetFilter に一本化（keyword/color/vanilla/family/excludeSelf の5軸。
        // 旧フィールドは normalizeFilter が畳み込むためデータは無変更）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の回復：BP参照元がいなかった。`)
            return
        }
        const candidates = state.players[owner].field.spirits.filter(
            (s) => s.isRested && matchesTarget(state, owner, s, filter, self?.instanceId),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}の回復：対象がいなかった。`)
            return
        }
        // all指定時は候補すべてを回復する（cantAttackThisTurnは付与しない。決闘台地Lv2）
        if (action.all) {
            for (const c of candidates) c.isRested = false
            log(state, `${sourceName}：条件を満たすスピリット${candidates.length}体を回復させた。`)
            return
        }
        const target = candidates.reduce((best, s) =>
            effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
        )
        target.isRested = false
        log(state, `${getCard(target.cardId).name}は回復した。`)
        return
}

const refreshAllOwnHandler: ActionHandler<"refreshAllOwn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const player = state.players[owner]
        let count = 0
        for (const s of player.field.spirits) {
            if (!s.isRested) continue
            s.isRested = false
            s.cantAttackThisTurn = true
            count++
        }
        if (count === 0) {
            log(state, `${sourceName}：疲労状態のスピリットがいなかった。`)
            return
        }
        log(
            state,
            `${player.name}の疲労スピリット${count}体を回復した。（このターンの間、回復したスピリットはアタック不可）`,
        )
        return
}

const refreshAllByCostHandler: ActionHandler<"refreshAllByCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 両陣営のコストが一致するスピリットすべてを回復させる（refreshAllOwnと異なりcantAttackThisTurnは付与しない）
        let count = 0
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const s of state.players[pid].field.spirits) {
                if (!s.isRested) continue
                if (getCard(s.cardId).cost !== action.cost) continue
                s.isRested = false
                count++
            }
        }
        if (count === 0) {
            log(state, `${sourceName}：コスト${action.cost}の疲労スピリットがいなかった。`)
            return
        }
        log(state, `${sourceName}：コスト${action.cost}のスピリット${count}体を回復した。`)
        return
}

const refreshSelfHandler: ActionHandler<"refreshSelf"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 「相手だけ破壊したとき、このスピリットは回復する」等のバトル勝利時効果
        if (!self) {
            log(state, `${sourceName}：回復対象がいなかった。`)
            return
        }
        if (!self.isRested) {
            log(state, `${getCard(self.cardId).name}はすでに回復状態のため何もしなかった。`)
            return
        }
        self.isRested = false
        log(state, `${getCard(self.cardId).name}は回復した。`)
        return
}

const refreshByFamilyHandler: ActionHandler<"refreshByFamily"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分の疲労スピリットのうちfamilyFilter一致（配列=OR）を実効BP最大からcount体まで回復
        const candidates = state.players[owner].field.spirits
            .filter((s) => s.isRested && matchesFamilyFilter(state, owner, s, action.familyFilter))
            .sort((a, b) => effectiveBp(state, owner, b) - effectiveBp(state, owner, a))
            .slice(0, action.count)
        if (candidates.length === 0) {
            log(state, `${sourceName}の回復：対象がいなかった。`)
            return
        }
        for (const s of candidates) s.isRested = false
        log(state, `${sourceName}：${candidates.length}体を回復させた。`)
        return
}

const refreshByFamilyAutoHandler: ActionHandler<"refreshByFamilyAuto"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 疲労中の自分スピリットの最多系統を自動指定し、その系統の疲労スピリットを最大count体回復させる
        // （プレイヤー選択の決定的簡略化。フロックリカバリー）
        const rested = state.players[owner].field.spirits.filter((s) => s.isRested)
        if (rested.length === 0) {
            log(state, `${sourceName}：疲労状態のスピリットがいなかった。`)
            return
        }
        // 疲労中の自分スピリットで最多の系統を選ぶ（同数は先に見つかった系統。Mapは挿入順を保持する）
        const tally = new Map<string, number>()
        for (const s of rested) {
            const families = new Set(getCard(s.cardId).family)
            for (const family of families) {
                tally.set(family, (tally.get(family) ?? 0) + 1)
            }
        }
        let chosen: string | null = null
        let best = 0
        for (const [family, count] of tally) {
            if (count > best) {
                best = count
                chosen = family
            }
        }
        if (!chosen) {
            log(state, `${sourceName}：対象の系統がなかった。`)
            return
        }
        const candidates = rested
            .filter((s) => spiritHasFamily(state, owner, s, chosen!))
            .sort((a, b) => effectiveBp(state, owner, b) - effectiveBp(state, owner, a))
            .slice(0, action.count)
        for (const s of candidates) s.isRested = false
        log(
            state,
            `${sourceName}：系統「${chosen}」を選び、${candidates.length}体を回復させた。`,
        )
        return
}

const handlers = {
    exhaust: exhaustHandler,
    exhaustAll: exhaustAllHandler,
    exhaustAllByLevel: exhaustAllByLevelHandler,
    exhaustAllByColor: exhaustAllByColorHandler,
    exhaustOpponentToMatch: exhaustOpponentToMatchHandler,
    refreshOne: refreshOneHandler,
    refreshAllOwn: refreshAllOwnHandler,
    refreshAllByCost: refreshAllByCostHandler,
    refreshSelf: refreshSelfHandler,
    refreshByFamily: refreshByFamilyHandler,
    refreshByFamilyAuto: refreshByFamilyAutoHandler,
} satisfies Partial<ActionRegistry>

export default handlers
