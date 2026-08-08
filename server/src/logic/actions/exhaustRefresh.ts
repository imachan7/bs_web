// 疲労・回復系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, Keyword, PlayerId } from "../../type"
import { currentLevel, getCard, log } from "../GameState"
import {
    bothSidesPids,
    destroySpirit,
    exhaustSpirit,
    refreshSpirit,
    findSpiritAny,
    isExhaustImmune,
    isImmuneToArea,
    isEffectBlocked,
    pickAnySideCandidates,
    pickEnemyByBp,
    pickEnemyCandidates,
    requestChoice,
    tryInteractiveTargetChoice,
    hasBofuChooserSelf,
} from "../EffectModules"
import { KEYWORDS, effectActiveAtLevel, effectiveBp, hasArmorAgainst, hasFullEffectImmunity, hasMagicImmunity, instColors, instHasColor, instHasCost, isVanillaCard, matchesFamilyFilter, matchesTarget, spiritHasFamily, spiritHasKeyword } from "../../../../shared/rules"
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
        // excludeTarget（BS01甲精ディース）：誘発から渡ってくる targetInstanceId（＝ブロッカー）は
        // 疲労させる対象ではなく**除外する**対象。以降の候補判定から外し、明示ターゲット扱いもしない
        const excludedId = action.excludeTarget ? targetInstanceId : undefined
        // BS07ワールウィンド：【暴風】で疲労させる対象を、疲労させられる側ではなく持ち主自身が選ぶ。
        // 以降は chooserIsTarget を落とした action として扱う（選択者と表示プロンプトが切り替わる）
        if (action.chooserIsTarget && hasBofuChooserSelf(state, owner)) {
            const { chooserIsTarget: _dropped, ...rest } = action
            log(state, `${sourceName}：【暴風】で疲労させる相手のスピリットを自分で指定する。`)
            // targetInstanceId（excludeTarget が除外に使うブロッカー）と発生源の色・種別は
            // 明示的に引き継ぐ（ctx.resolve は省略すると undefined を渡す設計のため）
            ctx.resolve(rest, { targetInstanceId, sourceColors: srcColors, sourceType: srcType })
            return
        }
        const matchesLevel = (s: CardInstance) =>
            s.instanceId !== excludedId && matchesTarget(state, opp, s, filter, self?.instanceId)
        // 対象指定時はその1体のみ処理（既に疲労済み・levelFilter不一致ならログを出して何もしない）
        if (targetInstanceId && !action.excludeTarget) {
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
            exhaustSpirit(state, found.pid, found.inst)
            log(state, `${getCard(found.inst.cardId).name}は疲労した。`)
            return
        }
        // 未指定時（自動選択・対象choice共通）は対象が常に相手側（opp）のため、疲労免疫を無条件でフィルタする
        const matchesCandidate = (s: CardInstance) =>
            !s.isRested && matchesLevel(s) && !isExhaustImmune(state, opp, s)
        // interactive の選択後に再入するときは excludeTarget を落とす。
        // 残したままだと、プレイヤーが選んだ instanceId を「除外する対象」と誤読して自動選択に落ちてしまう
        const { excludeTarget: _excludeTarget, ...actionForChoice } = action
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
                    { ...actionForChoice, count: 1 },
                    action.count > 1 ? { ...actionForChoice, count: action.count - 1 } : null,
                )
            ) {
                return
            }
            // 自動時は実効BP最大から順に count 体（相手側→自分側の順で同値は先勝ち）。
            // count を見ずに1体で打ち切ると「スピリット2体までを疲労させる」（BS01-036 シャ・ズー）が
            // 半分しか効かないため、選んだ個体を除きながら count 回繰り返す
            let exhausted = 0
            for (let i = 0; i < action.count; i++) {
                const target = candidates
                    .filter((sp) => !sp.isRested)
                    .reduce<CardInstance | undefined>(
                        (best, sp) =>
                            !best || effectiveBp(state, owner, sp) > effectiveBp(state, owner, best)
                                ? sp
                                : best,
                        undefined,
                    )
                if (!target) break
                // anySide なので疲労するのは自分か相手か分からない。「疲労したとき」の誘発を
                // 正しい持ち主のフィールドから発火させるため、どちらの場にいるかを引き直す
                const targetPid = state.players[owner].field.spirits.includes(target) ? owner : opp
                exhaustSpirit(state, targetPid, target)
                exhausted += 1
                log(state, `${getCard(target.cardId).name}は疲労した。`)
            }
            if (exhausted === 0) {
                log(state, `${sourceName}の疲労付与：対象がいなかった。`)
            }
            return
        }
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, matchesCandidate, srcColors, srcType)
            // chooserIsTarget（【暴風】）：疲労させられる側が自分で対象を選ぶ。
            // 解決は発生源の持ち主の効果として行う（tryInteractiveTargetChoice が actorPid を立てる）
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    action.chooserIsTarget
                        ? `${sourceName}：疲労させる自分のスピリットを選んでください`
                        : `${sourceName}の疲労付与：対象を選んでください`,
                    candidates,
                    { ...actionForChoice, count: 1 },
                    action.count > 1 ? { ...actionForChoice, count: action.count - 1 } : null,
                    action.chooserIsTarget ? opp : undefined,
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
            exhaustSpirit(state, opp, target)
            log(state, `${getCard(target.cardId).name}は疲労した。`)
        }
        return
}

const exhaustAllHandler: ActionHandler<"exhaustAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 指定側のスピリットをBP範囲で疲労させる（相手側のみ装甲・疲労免疫を尊重）
        const sides: PlayerId[] = action.side === "both" ? bothSidesPids(state, srcType) : [opp]
        let exhausted = 0
        for (const pid of sides) {
            for (const s of [...state.players[pid].field.spirits]) {
                if (s.isRested) continue
                const bp = effectiveBp(state, pid, s)
                if (action.minBp !== undefined && bp < action.minBp) continue
                if (action.maxBp !== undefined && bp > action.maxBp) continue
                // filter は cores / excludeSelf の2軸のみ対応（BS05双剣虎ジェン・フー：コア1個のみ・自分以外）
                if (action.filter?.cores !== undefined && s.cores !== action.filter.cores) continue
                if (action.filter?.excludeSelf && self && s.instanceId === self.instanceId) continue
                if (isEffectBlocked(state, s, srcType)) continue
                if (pid !== owner && (hasArmorAgainst(s, srcColors) || isExhaustImmune(state, pid, s) || isImmuneToArea(s) || hasFullEffectImmunity(s, srcType))) continue
                exhaustSpirit(state, pid, s)
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
            for (const s of [...state.players[pid].field.spirits]) {
                if (currentLevel(s).level !== level) continue
                if (s.isRested) continue
                // 疲労させる側（owner）と持ち主が異なるときのみ装甲・疲労免疫・範囲免疫を判定（トランプの王国）
                if (isEffectBlocked(state, s, srcType)) continue
                if (pid !== owner && (hasArmorAgainst(s, srcColors) || isExhaustImmune(state, pid, s) || isImmuneToArea(s) || hasFullEffectImmunity(s, srcType))) continue
                exhaustSpirit(state, pid, s)
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
        // 「色をひとつ選び」＝プレイヤーの選択。実対戦では相手フィールドに実在する色から選ばせる
        // （選択後は chosenOption 経由で再入する）
        if (chosenOption !== undefined) {
            const entry = (Object.entries(COLOR_LABELS) as [Color, string][]).find(
                ([, label]) => label === chosenOption,
            )
            if (entry) {
                exhaustSpiritsOfColor(ctx, entry[0], action.side)
                return
            }
        }
        if (state.interactiveTargets && tally.size > 1) {
            requestChoice(
                state,
                owner,
                `${sourceName}：疲労させる色を選んでください`,
                [],
                false,
                action,
                self,
                "option",
                [...tally.keys()].map((c) => COLOR_LABELS[c]),
            )
            return
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
        exhaustSpiritsOfColor(ctx, chosen, action.side)
        return
}

// 指定色のスピリットすべてを疲労させる（exhaustAllByColor の共通部分。自動選択・色choiceの双方から使う）
function exhaustSpiritsOfColor(ctx: ActionCtx, chosen: Color, side?: "opponent"): void {
    const { state, owner, opp, sourceName, srcColors, srcType } = ctx
    let exhausted = 0
    // side:"opponent" 指定時は相手のスピリットだけ（BS07大風車の丘。既定は両陣営）
    const pids: PlayerId[] = side === "opponent" ? [opp] : (["p1", "p2"] as PlayerId[])
    for (const pid of pids) {
        for (const s of [...state.players[pid].field.spirits]) {
            if (!instHasColor(s, chosen)) continue
            // 装甲・疲労免疫・範囲免疫は「相手の効果」を防ぐものなので、自分側のスピリットには適用しない
            if (isEffectBlocked(state, s, srcType)) continue
            if (pid !== owner && (hasArmorAgainst(s, srcColors) || isExhaustImmune(state, pid, s) || isImmuneToArea(s))) continue
            exhaustSpirit(state, pid, s)
            exhausted++
        }
    }
    log(
        state,
        `${sourceName}：色「${COLOR_LABELS[chosen]}」を選び、${exhausted}体を疲労させた。`,
    )
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
            for (const c of candidates) refreshSpirit(state, owner, c)
            log(state, `${sourceName}：条件を満たすスピリット${candidates.length}体を回復させた。`)
            return
        }
        const target = candidates.reduce((best, s) =>
            effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
        )
        refreshSpirit(state, owner, target)
        log(state, `${getCard(target.cardId).name}は回復した。`)
        return
}

// このスピリットが**カードに静的に持つ**指定キーワードエントリの count（レベル有効なもの）。
// 【暴風：1】と【暴風：2】を区別する用途。付与キーワードは count を持たないため対象外
function staticKeywordCount(inst: CardInstance, keyword: Keyword): number | undefined {
    const level = currentLevel(inst).level
    for (const effect of getCard(inst.cardId).effects) {
        if (effect.kind !== "keyword" || effect.keyword !== keyword) continue
        if (!effectActiveAtLevel(effect.levels, level)) continue
        return effect.count ?? 1
    }
    return undefined
}

const refreshAllByKeywordHandler: ActionHandler<"refreshAllByKeyword"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
        // 蛮騎士ハーキュリー：修飾なしの「【神速】を持つスピリットすべて」＝両陣営が対象。
        // refreshAllByCostと同型でcantAttackThisTurnは付与しない。
        // side:"own"指定時は自分のスピリットのみ（BS06名誉ある御前試合Lv2＝「自分のスピリットすべて」）
        let count = 0
        for (const pid of (action.side === "own" ? [owner] : (["p1", "p2"] as PlayerId[]))) {
            for (const s of state.players[pid].field.spirits) {
                if (!s.isRested) continue
                if (!spiritHasKeyword(state, pid, s, action.keyword)) continue
                // keywordCount（BS07突風侯爵コカトリーフLv2＝【暴風：1】限定）：
                // カードが静的に持つキーワードエントリの count が一致するものだけ
                if (action.keywordCount !== undefined && staticKeywordCount(s, action.keyword) !== action.keywordCount) {
                    continue
                }
                refreshSpirit(state, pid, s)
                count++
            }
        }
        if (count === 0) {
            log(state, `${sourceName}：【${KEYWORDS[action.keyword].label}】を持つ疲労スピリットがいなかった。`)
            return
        }
        log(state, `${sourceName}：【${KEYWORDS[action.keyword].label}】を持つスピリット${count}体を回復した。`)
        return
}

const refreshSelfByDestroyFamilyHandler: ActionHandler<"refreshSelfByDestroyFamily"> = (ctx, action) => {
    const { state, owner, self, sourceName, destroyContext } = ctx
        // 巨神機トールLv3：「〜することで」の任意コストは自動発動で簡略化。
        // 犠牲はfamilyFilter一致・self以外から実効BP最小を自動選択する（犠牲を最小化する簡略化）
        if (!self) {
            log(state, `${sourceName}：回復対象がいなかった。`)
            return
        }
        const candidates = state.players[owner].field.spirits.filter(
            (s) => s.instanceId !== self.instanceId && matchesFamilyFilter(state, owner, s, action.familyFilter),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：破壊できる対象がいなかったため発動しなかった。`)
            return
        }
        const target = candidates.reduce((worst, s) =>
            effectiveBp(state, owner, s) < effectiveBp(state, owner, worst) ? s : worst,
        )
        const name = getCard(target.cardId).name
        destroySpirit(state, owner, target.instanceId, "destroy", destroyContext)
        if (!self.isRested) {
            log(state, `${name}は破壊されたが、${getCard(self.cardId).name}はすでに回復状態のため何もしなかった。`)
            return
        }
        refreshSpirit(state, owner, self)
        log(state, `${name}は破壊され、${getCard(self.cardId).name}は回復した。`)
        return
}

const refreshAllOwnHandler: ActionHandler<"refreshAllOwn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const player = state.players[owner]
        let count = 0
        for (const s of player.field.spirits) {
            if (!s.isRested) continue
            refreshSpirit(state, owner, s)
            // exemptFamily指定時は、この系統（配列＝OR）を持つ個体にはcantAttackThisTurnを付与しない
            // （BS06キャバルリー：系統「戦騎」を持たないスピリットのみアタック不可）
            if (!action.exemptFamily || !matchesFamilyFilter(state, owner, s, action.exemptFamily)) {
                s.cantAttackThisTurn = true
            }
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

const markNoRefreshTargetHandler: ActionHandler<"markNoRefreshTarget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName } = ctx
        // スクルディア：このスピリットが疲労したとき、相手の疲労状態のスピリット1体を指定する。
        // 指定は発生源（self）に記録し、self が疲労状態で持ち主のフィールドにいる間だけ効く
        // （判定は EffectModules.isRefreshBlockedByMark。リフレッシュステップのみが見る）。
        // 対象は実効BP最大の1体を自動選択する（アタック宣言中の疲労からも発火しうるため、
        // ここで pendingChoice を立てない決定的簡略化）
        if (!self) return
        const candidates = state.players[opp].field.spirits.filter(
            (s) => s.isRested && !isEffectBlocked(state, s, ctx.srcType) && !isImmuneToArea(s),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：相手に疲労状態のスピリットがいなかった。`)
            return
        }
        const target = candidates.reduce((best, s) =>
            effectiveBp(state, opp, s) > effectiveBp(state, opp, best) ? s : best,
        )
        self.noRefreshTargetInstanceId = target.instanceId
        log(
            state,
            `${sourceName}は${getCard(target.cardId).name}を指定した。（${sourceName}が疲労状態でフィールドにいる間、回復できない）`,
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
                // 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る
                if (!instHasCost(s, action.cost)) continue
                refreshSpirit(state, pid, s)
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
        // costReserveToVoid（BS06-X23天帝ホウオウガLv3）：lifeCrush.costReserveToVoidと同じ方針。
        // 自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからボイドへ送ってから回復する
        if (action.costReserveToVoid !== undefined) {
            const ownerPlayer = state.players[owner]
            if (ownerPlayer.reserve < action.costReserveToVoid) {
                log(state, `${sourceName}：リザーブが足りず発動しなかった。`)
                return
            }
            ownerPlayer.reserve -= action.costReserveToVoid
            log(
                state,
                `${ownerPlayer.name}は${sourceName}の効果で、リザーブのコア${action.costReserveToVoid}個をボイドに置いた。`,
            )
        }
        refreshSpirit(state, owner, self)
        log(state, `${getCard(self.cardId).name}は回復した。`)
        return
}

// 【強襲】：自分の回復状態のネクサス1つを疲労させることで、このスピリットを回復する（BS07）。
// ターン中の上限回数は self が持つ kind:"keyword" keyword:"kyoshu" の count から読む
// （暴風と同じ設計＝キーワードエントリは宣言で、挙動と回数の読み出しはこちらが持つ）。
// 疲労させるネクサスの選択は決定的簡略化：コア数が最少のもの（同数はフィールドの先頭側）。
// ネクサスはリフレッシュステップで回復する（PhaseManager が spirits と nexuses の両方を回復させる）
const refreshSelfByExhaustNexusHandler: ActionHandler<"refreshSelfByExhaustNexus"> = (ctx) => {
    const { state, owner, self, sourceName } = ctx
    if (!self) {
        log(state, `${sourceName}：回復対象がいなかった。`)
        return
    }
    if (!self.isRested) {
        log(state, `${getCard(self.cardId).name}はすでに回復状態のため何もしなかった。`)
        return
    }
    const level = currentLevel(self).level
    const entry = getCard(self.cardId).effects.find(
        (e) => e.kind === "keyword" && e.keyword === "kyoshu" && effectActiveAtLevel(e.levels, level),
    )
    const limit = entry && entry.kind === "keyword" ? (entry.count ?? 1) : 0
    if (limit === 0) {
        log(state, `${getCard(self.cardId).name}は【強襲】を持たないため回復しなかった。`)
        return
    }
    const used = self.kyoshuUsed?.turn === state.turn ? self.kyoshuUsed.count : 0
    if (used >= limit) {
        log(state, `${getCard(self.cardId).name}の【強襲】はこのターンの上限（${limit}回）に達している。`)
        return
    }
    const candidates = state.players[owner].field.nexuses.filter((n) => !n.isRested)
    if (candidates.length === 0) {
        log(state, `${sourceName}：疲労させられる自分のネクサスがなかった。`)
        return
    }
    const nexus = [...candidates].sort((a, b) => a.cores - b.cores)[0]
    if (!nexus) return
    nexus.isRested = true
    refreshSpirit(state, owner, self)
    self.kyoshuUsed = { turn: state.turn, count: used + 1 }
    log(
        state,
        `【強襲】${getCard(self.cardId).name}は${getCard(nexus.cardId).name}を疲労させて回復した。（このターン${used + 1}/${limit}回目）`,
    )
    return
}

const exhaustSelfHandler: ActionHandler<"exhaustSelf"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
        // このスピリット自身を疲労させる（唯一の入口exhaustSpirit経由。BS06雪ん子イエティ／天使長ファニム）
        if (!self) {
            log(state, `${sourceName}：疲労対象がいなかった。`)
            return
        }
        if (self.isRested) {
            log(state, `${getCard(self.cardId).name}はすでに疲労状態のため何もしなかった。`)
            return
        }
        exhaustSpirit(state, owner, self)
        log(state, `${getCard(self.cardId).name}は疲労した。`)
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
        for (const s of candidates) refreshSpirit(state, owner, s)
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
        // 「系統1つを指定する」＝プレイヤーの選択。実対戦では疲労中の自分スピリットが持つ系統から選ばせる
        if (chosenOption !== undefined && tally.has(chosenOption)) {
            refreshSpiritsOfFamily(ctx, action.count, chosenOption)
            return
        }
        if (state.interactiveTargets && tally.size > 1) {
            requestChoice(
                state,
                owner,
                `${sourceName}：回復させる系統を選んでください`,
                [],
                false,
                action,
                self,
                "option",
                [...tally.keys()],
            )
            return
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
        refreshSpiritsOfFamily(ctx, action.count, chosen)
        return
}

// 指定系統の疲労スピリットを最大count体回復させる（refreshByFamilyAuto の共通部分）。
// 回復させる個体の選択は実効BP降順の簡略化のまま（「3体」の内訳までは選ばせない）
function refreshSpiritsOfFamily(ctx: ActionCtx, count: number, family: string): void {
    const { state, owner, sourceName } = ctx
    const candidates = state.players[owner].field.spirits
        .filter((s) => s.isRested && spiritHasFamily(state, owner, s, family))
        .sort((a, b) => effectiveBp(state, owner, b) - effectiveBp(state, owner, a))
        .slice(0, count)
    for (const s of candidates) refreshSpirit(state, owner, s)
    log(
        state,
        `${sourceName}：系統「${family}」を選び、${candidates.length}体を回復させた。`,
    )
}

const handlers = {
    exhaust: exhaustHandler,
    exhaustAll: exhaustAllHandler,
    exhaustAllByLevel: exhaustAllByLevelHandler,
    exhaustAllByColor: exhaustAllByColorHandler,
    exhaustOpponentToMatch: exhaustOpponentToMatchHandler,
    refreshOne: refreshOneHandler,
    refreshAllByKeyword: refreshAllByKeywordHandler,
    refreshSelfByDestroyFamily: refreshSelfByDestroyFamilyHandler,
    refreshAllOwn: refreshAllOwnHandler,
    refreshAllByCost: refreshAllByCostHandler,
    markNoRefreshTarget: markNoRefreshTargetHandler,
    refreshSelf: refreshSelfHandler,
    refreshSelfByExhaustNexus: refreshSelfByExhaustNexusHandler,
    exhaustSelf: exhaustSelfHandler,
    refreshByFamily: refreshByFamilyHandler,
    refreshByFamilyAuto: refreshByFamilyAutoHandler,
} satisfies Partial<ActionRegistry>

export default handlers
