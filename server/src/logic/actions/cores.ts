// コア操作系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, EffectAction, GameState, PlayerId } from "../../type"
import { coresForLevel, getCard, instMinLevelCores, log, minLevelCores } from "../GameState"
import {
    fireFieldEventTriggers,
    bothSidesPids,
    isResisted,
    askPayToNegateIfNeeded,
    resistanceAgainst,
    checkExhaustOnCoreChange,
    countEffectCounter,
    destroySpirit,
    dumpAllCoresTensho,
    exhaustSpirit,
    findSpiritAny,
    fireTenshoEvent,
    tenshoAfterTargetTrigger,
    tenshoDumpAndDestroy,
    millDeck,
    notifySpiritCoresRemovedByOpponent,
    pickAnySideByBp,
    pickAnySideCandidates,
    pickBpBuffTarget,
    pickEnemyByBp,
    pickEnemyCandidates,
    placeCoresOnSpirit,
    canTakeCoresFrom,
    removeCores,
    removeCoresToTrash,
    removeCoresToVoid,
    requestCardChoice,
    requestChoice,
    TENSHO_SUBSTITUTE_REST,
    TENSHO_SUBSTITUTE_HAND,
    applyTenshoSubstitute,
    tryInteractiveTargetChoice,
    voidCoreToOwnTrash,
} from "../EffectModules"
import { KEYWORDS, OPPONENT_RESERVE_TARGET, currentLevel, effectActiveAtLevel, effectiveBp, instHasColor, instMatchesCostFilter, matchesFamilyFilter, matchesTarget, spiritHasFamily, spiritHasKeyword } from "../../../../shared/rules"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"

const coreRemoveHandler: ActionHandler<"coreRemove"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // countCounter指定時はcountを無視し、EffectCounterの値を除去枚数として使う
        // （BS03巨人王ランドルフ：直前の【粉砕】で破棄した枚数ぶん。0ならログのみ）
        const count = action.countCounter !== undefined ? countEffectCounter(state, owner, self, action.countCounter, srcType) : action.count
        if (count === 0) {
            log(state, `${sourceName}のコア除去：カウントが0のため発動しなかった。`)
            return
        }
        // filter指定時はTargetFilterで絞り込む（対象自動選択・明示ターゲットの両方。BS08倒逆ピラミッド群：BP5000以下）
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}のコア除去：BP参照元がいなかった。`)
            return
        }
        const matchesFilter = (s: CardInstance) => matchesTarget(state, opp, s, filter, self?.instanceId)
        // anySide：自分/相手どちらのスピリットも対象にできる（destroy等のanySideと同じ非対称ルール。
        // 相手側候補には装甲・マジック効果耐性を尊重し、自分側には適用しない）
        if (targetInstanceId === undefined && state.interactiveTargets) {
            const candidates = action.anySide
                ? pickAnySideCandidates(state, owner, matchesFilter, srcColors, srcType)
                : pickEnemyCandidates(state, opp, Infinity, matchesFilter, srcColors, srcType)
            if (candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}のコア除去：対象を選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 対象指定があれば両プレイヤーから検索、なければ相手（anySide指定時は自分/相手どちらか）の
        // BP最大スピリットを自動選択
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : action.anySide
              ? pickAnySideByBp(state, owner, Infinity, matchesFilter, srcColors, srcType)
              : (() => {
                    const t = pickEnemyByBp(state, opp, Infinity, matchesFilter, srcColors, srcType)
                    return t ? { pid: opp, inst: t } : null
                })()
        if (!found) {
            log(state, `${sourceName}のコア除去：対象がいなかった。`)
            return
        }
        // 明示ターゲットが相手側かつ装甲該当・マジック効果耐性該当なら効果を受けない
        const coreAttempt = attemptOf(ctx, "coreRemove", "targeted")
        // 「手札を破棄することで効果を受けない」は払うかを守る側に聞いてから判定する（BS08竜騎集う円卓Lv2）
        if (askPayToNegateIfNeeded(state, found.pid, found.inst, coreAttempt, action, self, sourceName)) return
        const resisted = resistanceAgainst(state, found.pid, found.inst, coreAttempt)
        if (resisted) {
            log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
            return
        }
        // leaveAtLeast指定時は、対象のコアがこの数を下回らないところまでに抑える
        // （BS04王蛇の住処Lv2：この効果では相手のスピリット上のコアを0個にできない）
        let removeCount = count
        if (action.leaveAtLeast !== undefined) {
            removeCount = Math.min(removeCount, Math.max(0, found.inst.cores - action.leaveAtLeast))
            if (removeCount === 0) {
                log(
                    state,
                    `${sourceName}のコア除去：${getCard(found.inst.cardId).name}のコアはこれ以上取り除けなかった。`,
                )
                return
            }
        }
        // 維持コア割れの消滅処理はremoveCores/removeCoresToVoidが担う。
        // dest:"void"指定時はリザーブでなくボイドへ（BS04ヴェノムショット）
        if (action.dest === "void") {
            removeCoresToVoid(state, found.pid, found.inst, removeCount, owner)
        } else {
            removeCores(state, found.pid, found.inst, removeCount, owner)
        }
        return
}

// BS06-096レベルドレイン：相手のスピリット1体の上のコアを、1つ下のLvに必要なコア数と同じになるまで
// 相手のトラッシュへ置く（coreRemoveHandlerと同じ対象選択・装甲/マジック効果耐性の判定を踏襲）。
// Lv1のスピリット（1つ下のLvが無い）は対象にしても何も起きない
const coreDrainToLowerLevelHandler: ActionHandler<"coreDrainToLowerLevel"> = (ctx) => {
    const { state, owner, opp, sourceName, srcColors, srcType, targetInstanceId } = ctx
    if (targetInstanceId === undefined && state.interactiveTargets) {
        const candidates = pickEnemyCandidates(state, opp, Infinity, undefined, srcColors, srcType)
        if (candidates.length >= 2) {
            requestChoice(
                state,
                owner,
                `${sourceName}：対象を選んでください`,
                candidates.map((s) => s.instanceId),
                false,
                { type: "coreDrainToLowerLevel" },
                ctx.self,
            )
            return
        }
    }
    const found = targetInstanceId
        ? findSpiritAny(state, targetInstanceId)
        : (() => {
              const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType)
              return t ? { pid: opp, inst: t } : null
          })()
    if (!found) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const coreAttempt2 = attemptOf(ctx, "coreRemove", "targeted")
    // 「手札を破棄することで効果を受けない」は払うかを守る側に聞いてから判定する（BS08竜騎集う円卓Lv2）
    if (askPayToNegateIfNeeded(state, found.pid, found.inst, coreAttempt2, { type: "coreDrainToLowerLevel" }, ctx.self, sourceName)) return
    const resisted = resistanceAgainst(state, found.pid, found.inst, coreAttempt2)
    if (resisted) {
        log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
        return
    }
    const card = getCard(found.inst.cardId)
    const level = currentLevel(found.inst).level
    if (level <= 1) {
        log(state, `${sourceName}：${card.name}はLv1のため効果がなかった。`)
        return
    }
    const lowerCores = coresForLevel(card, level - 1)
    if (lowerCores === null || found.inst.cores <= lowerCores) {
        log(state, `${sourceName}：${card.name}のコアはこれ以上取り除けなかった。`)
        return
    }
    removeCoresToTrash(state, found.pid, found.inst, found.inst.cores - lowerCores, owner)
}

// coreRemoveMulti の対象1体への適用（装甲・マジック効果耐性の判定を含む）。
// pickEnemyCandidates/pickEnemyByBp経由の自動選択はこれらを既に除外済みだが、
// pendingChoice解決経由（targetInstanceId指定）はここで改めて判定する（coreRemoveHandlerと同じ考え方）
function applyCoreRemoveMultiTarget(
    state: GameState,
    opp: PlayerId,
    found: CardInstance,
    action: Extract<EffectAction, { type: "coreRemoveMulti" }>,
    srcColors: Color[] | undefined,
    srcType: "spirit" | "nexus" | "magic" | undefined,
    owner: PlayerId,
    sourceName: string,
): void {
    // ctx を受け取らないヘルパーなので、耐性判定の引数はここで組み立てる（attemptOf と同じ形）
    const resisted = resistanceAgainst(state, opp, found, {
        op: "coreRemove",
        scope: "targeted",
        actorPid: owner,
        ...(srcType !== undefined ? { sourceType: srcType } : {}),
        ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
    })
    if (resisted) {
        log(state, `${getCard(found.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
        return
    }
    if (action.dest === "void") removeCoresToVoid(state, opp, found, action.count, owner)
    else if (action.dest === "trash") removeCoresToTrash(state, opp, found, action.count, owner)
    else removeCores(state, opp, found, action.count, owner)
}

const coreRemoveMultiHandler: ActionHandler<"coreRemoveMulti"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        // pendingChoice解決：選ばれた1体のみ処理する（tryInteractiveTargetChoiceのfirstAction経由）
        if (targetInstanceId !== undefined) {
            const found = state.players[opp].field.spirits.find((s) => s.instanceId === targetInstanceId)
            if (!found) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                return
            }
            applyCoreRemoveMultiTarget(state, opp, found, action, srcColors, srcType, owner, sourceName)
            return
        }
        // 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る。
        // keywordExclude（BS08闇帝竜騎サブナ・ルーク＝【転召】を持たない相手）は静的・一時付与・継続付与すべて考慮
        const matchesFilter = (s: CardInstance) =>
            instMatchesCostFilter(s, action.costFilter) &&
            (action.keywordExclude === undefined || !spiritHasKeyword(state, opp, s, action.keywordExclude))
        // allTargets（BS07腐りゆく湖沼）：条件を満たす相手すべてが対象。範囲効果なので選択を挟まない
        if (action.allTargets) {
            const all = pickEnemyCandidates(state, opp, Infinity, matchesFilter, srcColors, srcType)
            if (all.length === 0) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                return
            }
            for (const target of [...all]) {
                applyCoreRemoveMultiTarget(state, opp, target, action, srcColors, srcType, owner, sourceName)
            }
            return
        }
        if (action.targets <= 0) return
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, matchesFilter, srcColors, srcType)
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}のコア除去：対象を選んでください`,
                    candidates,
                    { ...action, targets: 1 },
                    action.targets > 1 ? { ...action, targets: action.targets - 1 } : null,
                )
            ) {
                return
            }
        }
        // 決定的自動選択：実効BP上位からtargets体を重複なく選ぶ（プレイヤー選択の簡略化）
        const chosen = new Set<string>()
        for (let i = 0; i < action.targets; i++) {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                (s) => matchesFilter(s) && !chosen.has(s.instanceId),
                srcColors,
                srcType,
            )
            if (!target) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                break
            }
            chosen.add(target.instanceId)
            applyCoreRemoveMultiTarget(state, opp, target, action, srcColors, srcType, owner, sourceName)
        }
        return
}

// BS09-027密林の勇者皇ヴォルザLv2-3：このバトルの間、ブロッカー上のコアを効果で取り除けなくする。
// アタック宣言の時点ではまだブロッカーが決まっていないので、印はバトル側に立てる
const protectBlockerCoresThisBattleHandler: ActionHandler<"protectBlockerCoresThisBattle"> = (ctx) => {
    const { state, sourceName } = ctx
    if (!state.battle) {
        log(state, `${sourceName}：バトル中ではないため何も起きなかった。`)
        return
    }
    state.battle.blockerCoresProtected = true
    log(state, `${sourceName}：このバトルの間、ブロックしたスピリット上のコアは取り除けない。`)
}

const coreRemoveSelfHandler: ActionHandler<"coreRemoveSelf"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット（self）自身のコアを持ち主のリザーブへ（維持コア割れの消滅処理は removeCores が担う）
        if (!self) {
            log(state, `${sourceName}のコア除去：対象がいなかった。`)
            return
        }
        removeCores(state, owner, self, action.count)
        return
}

const coreToTrashSelfHandler: ActionHandler<"coreToTrashSelf"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット（self）自身のコアを持ち主のトラッシュへ（維持コア割れの消滅処理は removeCoresToTrash が担う。
        // 魔帝の墓標Lv2：anySpiritAttacked 経由では self にアタックしたスピリットが渡る）
        if (!self) {
            log(state, `${sourceName}のコア除去：対象がいなかった。`)
            return
        }
        removeCoresToTrash(state, owner, self, action.count)
        return
}

const tenshoCoreDumpHandler: ActionHandler<"tenshoCoreDump"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 【転召】のpendingChoice再開専用：targetInstanceIdで指定された自分のスピリットの
        // 上のコアすべてをdestへ（cards.jsonには書かない。resolveTenshoからのみ発行される）
        if (targetInstanceId === undefined) return
        const target = state.players[owner].field.spirits.find(
            (s) => s.instanceId === targetInstanceId,
        )
        if (!target) {
            log(state, "【転召】：対象がいなかった。")
            return
        }
        dumpAllCoresTensho(state, owner, target, action.dest)
        return
}

const tenshoResumeHandler: ActionHandler<"tenshoResume"> = (ctx, action) => {
    const { state, owner, self } = ctx
        // 【転召】の途中で誘発が選択待ちを立てたときの再開専用（cards.jsonには書かない）。
        // self には転召の対象になった自分のスピリットが渡る。
        // 対象が既に場を離れていたら（誘発の解決中に除去された等）残りの処理は行わない
        if (!self) return
        if (action.stage === "afterTargetTrigger") {
            tenshoAfterTargetTrigger(state, owner, self, action.dest, action.skipSubstitute === true)
            return
        }
        tenshoDumpAndDestroy(state, owner, self, action.dest)
        return
}

const tenshoSubstituteChoiceHandler: ActionHandler<"tenshoSubstituteChoice"> = (ctx, action) => {
    const { state, owner, self, chosenOption } = ctx
        // 【転召】置換（BS05の竜使い）の任意発動のpendingChoice再開専用（cards.jsonには書かない）。
        // selfには転召の対象になった自分のスピリットが渡る
        if (!self) return
        if (chosenOption === TENSHO_SUBSTITUTE_REST || chosenOption === TENSHO_SUBSTITUTE_HAND) {
            applyTenshoSubstitute(state, owner, self, chosenOption === TENSHO_SUBSTITUTE_HAND)
            return
        }
        // 「置換しない」側：置換を飛ばして通常のコア移動を行う（再度の確認を出さない）
        dumpAllCoresTensho(state, owner, self, action.dest, true)
        return
}

const coreChargeHandler: ActionHandler<"coreCharge"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const target = pickBpBuffTarget(state, owner, targetInstanceId)
        if (!target) {
            log(state, `${sourceName}のコアチャージ：対象がいなかった。`)
            return
        }
        const player = state.players[owner]
        const amount = Math.min(action.count, player.reserve)
        player.reserve -= amount
        log(
            state,
            `${getCard(target.cardId).name}にリザーブからコア${amount}個を置いた。`,
        )
        placeCoresOnSpirit(state, target, amount, owner)
        return
}

const coreGainHandler: ActionHandler<"coreGain"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const player = state.players[owner]
        player.reserve += action.count
        log(
            state,
            `${player.name}はボイドからコア${action.count}個をリザーブに置いた。（リザーブ${player.reserve}）`,
        )
        return
}

const coreGainPerHandler: ActionHandler<"coreGainPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const count = countEffectCounter(state, owner, self, action.counter, srcType)
        if (count === 0) {
            log(state, `${sourceName}の可変コア獲得：カウントが0のため獲得しなかった。`)
            return
        }
        const player = state.players[owner]
        player.reserve += count
        log(
            state,
            `${player.name}はボイドからコア${count}個をリザーブに置いた。（リザーブ${player.reserve}）`,
        )
        return
}

const voidCoreToSelfHandler: ActionHandler<"voidCoreToSelf"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ボイドからコアをこのスピリット上に置く（レベル変動は cores 増加で自然に反映される）
        if (!self) {
            log(state, `${sourceName}：コアを置く対象がいなかった。`)
            return
        }
        log(
            state,
            `${getCard(self.cardId).name}は、ボイドからコア${action.count}個を自身の上に置いた。`,
        )
        placeCoresOnSpirit(state, self, action.count, owner)
        return
}

const voidCoreToSelfPerHandler: ActionHandler<"voidCoreToSelfPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // カウント値ぶん、ボイドからこのスピリット上にコアを置く
        if (!self) {
            log(state, `${sourceName}：コアを置く対象がいなかった。`)
            return
        }
        const count = countEffectCounter(state, owner, self, action.counter, srcType)
        if (count === 0) {
            log(state, `${sourceName}：カウントが0のためコアを置かなかった。`)
            return
        }
        self.cores += count
        log(
            state,
            `${getCard(self.cardId).name}は、ボイドからコア${count}個を自身の上に置いた。`,
        )
        return
}

const voidCoreToSelfPerBofuCountHandler: ActionHandler<"voidCoreToSelfPerBofuCount"> = (ctx) => {
    const { state, owner, self, sourceName } = ctx
        // 颶風高原：召喚されたスピリット（self＝fieldEventのselfOverride）自身が持つ【暴風】の指定数ぶん、
        // ボイドからそのスピリット上にコアを置く（【暴風】を持たない／selfが無いならno-op）
        if (!self) {
            log(state, `${sourceName}：コアを置く対象がいなかった。`)
            return
        }
        const level = currentLevel(self).level
        const entry = getCard(self.cardId).effects.find(
            (e) => e.kind === "keyword" && e.keyword === "bofu" && effectActiveAtLevel(e.levels, level),
        )
        const count = entry && entry.kind === "keyword" ? (entry.count ?? 1) : 0
        if (count === 0) {
            log(state, `${sourceName}：${getCard(self.cardId).name}は【暴風】を持たないため置かなかった。`)
            return
        }
        log(
            state,
            `${getCard(self.cardId).name}は、ボイドからコア${count}個を自身の上に置いた。`,
        )
        placeCoresOnSpirit(state, self, count, owner)
        return
}

const voidCoreToOtherHandler: ActionHandler<"voidCoreToOther"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ボイドからコアを、自分のスピリットのうち実効BP最大の1体に置く。
        // **発生源自身も対象に含む**（2026-08-20 修正）。効果文が「自分の◯◯のスピリット」なら
        // 自分自身も「自分のスピリット」なので含まれる。除外するのは「このスピリット以外の」と
        // 明記があるカードだけ（excludeSelf。BS01-066スタッグローブ）
        if (!self) {
            log(state, `${sourceName}：コアを置く対象がいなかった。`)
            return
        }
        // colorFilter（BS09-020ヤミヤンマ＝白のスピリット）：指定色を持つ自分のスピリットのみ対象。
        // instHasColor なので colorAs（「白のスピリットとしても扱う」）による付与色も拾う
        const candidates = state.players[owner].field.spirits.filter(
            (s) =>
                (!action.excludeSelf || s.instanceId !== self.instanceId) &&
                (action.colorFilter === undefined || instHasColor(s, action.colorFilter)),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：対象の自分のスピリットがいなかった。`)
            return
        }
        // targets（BS09-023要塞蟲ラルバ＝白2体）：実効BP上位から重複なくその体数へ置く
        const ordered = [...candidates].sort((a, b) => effectiveBp(state, owner, b) - effectiveBp(state, owner, a))
        for (const target of ordered.slice(0, action.targets ?? 1)) {
            log(
                state,
                `${sourceName}：ボイドからコア${action.count}個を${getCard(target.cardId).name}の上に置いた。`,
            )
            placeCoresOnSpirit(state, target, action.count, owner)
        }
        return
}

const coreSqueezeAllHandler: ActionHandler<"coreSqueezeAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 両プレイヤーの全スピリットについて、コアを1個だけ残し超過分をその持ち主のリザーブへ
        let squeezed = 0
        const affectedByPid: Record<PlayerId, number> = { p1: 0, p2: 0 }
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const inst of [...state.players[pid].field.spirits]) {
                if (inst.cores <= 1) continue
                // 範囲でまとめて奪う効果は候補選びの経路（pickEnemy*）を通らないので、ここで耐性を見る
                if (!canTakeCoresFrom(state, pid, inst, owner, srcColors, srcType)) {
                    log(state, `${getCard(inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                    continue
                }
                // removeCores を通すことで、バトル中のコア保護（BS05茨の決戦地Lv1）・コア下限
                // （BS08聖なる柱状彫刻）・チャウーLv2の加算・維持コア割れの消滅がまとめて効く
                const removed = removeCores(state, pid, inst, inst.cores - 1, owner)
                if (removed === 0) continue
                squeezed++
                affectedByPid[pid]++
            }
        }
        if (squeezed === 0) {
            log(state, `${sourceName}：コアが2個以上のスピリットがいなかった。`)
            return
        }
        log(
            state,
            `${sourceName}：すべてのスピリット上のコアを1個だけ残し、それ以外を持ち主のリザーブに置いた。（${squeezed}体が対象）`,
        )
        // 相手（owner以外）の陣営が影響を受けたぶんは「相手の効果でコアが取り除かれた」として通知（極光の大地）
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            if (pid !== owner && affectedByPid[pid] > 0) {
                notifySpiritCoresRemovedByOpponent(state, pid, affectedByPid[pid])
            }
        }
        return
}

const coreSqueezeOneHandler: ActionHandler<"coreSqueezeOne"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        // コアを1個だけ残し超過分を持ち主のリザーブ（dest:"trash"ならトラッシュ）へ置く（両陣営共通の適用処理）
        const toTrash = action.dest === "trash"
        const applySqueeze = (pid: PlayerId, target: CardInstance): void => {
            const player = state.players[pid]
            const excess = target.cores - 1
            if (excess > 0) {
                target.cores = 1
                if (toTrash) player.trashCores += excess
                else player.reserve += excess
                log(
                    state,
                    `${getCard(target.cardId).name}のコアを1個だけ残し、超過分${excess}個を${player.name}の${toTrash ? "トラッシュ" : "リザーブ"}に置いた。`,
                )
                // 相手側のスピリットが対象になった場合のみ「相手の効果でコアが取り除かれた」通知（極光の大地）
                if (pid !== owner) notifySpiritCoresRemovedByOpponent(state, pid, 1)
            } else {
                log(state, `${getCard(target.cardId).name}はコアが1個以下のため変化しなかった。`)
            }
            if (target.cores < instMinLevelCores(target)) {
                destroySpirit(state, pid, target.instanceId, "deplete")
            }
        }
        // anySide（BS03ウィークネス）：自分/相手どちらのスピリットも対象にできる。
        // targetInstanceId優先→interactiveTargets時はrequestChoiceで両陣営から選択→
        // それも無ければ既存どおり相手BP最大の自動選択（下のループへフォールスルー）
        if (action.anySide) {
            if (targetInstanceId !== undefined) {
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) {
                    log(state, `${sourceName}のコア圧縮：対象がいなかった。`)
                    return
                }
                const squeezeResisted = resistanceAgainst(state, found.pid, found.inst, attemptOf(ctx, "coreRemove", "targeted"))
                if (squeezeResisted) {
                    log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった（${squeezeResisted.label}）。`)
                    return
                }
                applySqueeze(found.pid, found.inst)
                return
            }
            if (state.interactiveTargets) {
                const candidates = pickAnySideCandidates(state, owner, () => true, srcColors, srcType)
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コアを圧縮するスピリットを選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 相手フィールドの実効BP最大のスピリットをcount体選び、コアを1個だけ残す（coreSqueezeAllの単体版）
        const processed = new Set<string>()
        for (let i = 0; i < action.count; i++) {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                (s) => !processed.has(s.instanceId),
                srcColors,
            )
            if (!target) {
                log(state, `${sourceName}のコア圧縮：対象がいなかった。`)
                break
            }
            processed.add(target.instanceId)
            applySqueeze(opp, target)
        }
        return
}

const coreToVoidOwnHandler: ActionHandler<"coreToVoidOwn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分のコアをボイドへ置く（消す）。trashCoresから優先的に減らし、足りなければ
        // 自分フィールドのスピリット（実効BP最小）から取る
        const player = state.players[owner]
        let remaining = action.count
        const fromTrash = Math.min(remaining, player.trashCores)
        if (fromTrash > 0) {
            player.trashCores -= fromTrash
            remaining -= fromTrash
            log(state, `${sourceName}：トラッシュのコア${fromTrash}個をボイドに置いた。`)
        }
        while (remaining > 0) {
            const spirits = player.field.spirits
            if (spirits.length === 0) {
                log(state, `${sourceName}：ボイドに置くコアが足りなかった。`)
                break
            }
            const target = spirits.reduce((worst, s) =>
                effectiveBp(state, owner, s) < effectiveBp(state, owner, worst)
                    ? s
                    : worst,
            )
            const taken = Math.min(remaining, target.cores)
            if (taken === 0) break // 安全策：無限ループ防止（通常は発生しない）
            target.cores -= taken
            remaining -= taken
            log(state, `${getCard(target.cardId).name}のコア${taken}個をボイドに置いた。`)
            if (target.cores < instMinLevelCores(target)) {
                destroySpirit(state, owner, target.instanceId, "deplete")
            }
        }
        return
}

const bothSidesCoreToTrashHandler: ActionHandler<"bothSidesCoreToTrash"> = (ctx, action) => {
    const { state, owner, sourceName, srcColors, srcType } = ctx
        // 両プレイヤーが各自のフィールドのスピリットから、コアの多い個体から順に
        // 合計count個を各持ち主のトラッシュへ（1体で足りなければ次にコアが多い個体へ繰り越す。
        // 維持コア割れの消滅処理はopponentCoresToTrashHandlerと同じ判定を用いる。
        // 片側のみ対象がいてもその側は処理する。BS01メタルディー・バグ＝count1、BS02マインドコントロール＝count4）
        for (const pid of bothSidesPids(state, srcType)) {
            const player = state.players[pid]
            if (player.field.spirits.length === 0) {
                log(state, `${sourceName}：${player.name}のフィールドにスピリットがいなかった。`)
                continue
            }
            let remaining = action.count
            let moved = 0
            // 耐性・保護で取れなかった個体。同じ相手を選び続けて無限ループにならないよう覚えておく
            const skip = new Set<string>()
            while (remaining > 0) {
                const richest = player.field.spirits
                    .filter((s) => s.cores > 0 && !skip.has(s.instanceId))
                    .reduce<CardInstance | undefined>(
                        (best, s) => (best === undefined || s.cores > best.cores ? s : best),
                        undefined,
                    )
                if (!richest) break
                // 耐性で弾かれる個体は候補から外す（範囲でまとめて奪う効果は pickEnemy* を通らない）
                if (!canTakeCoresFrom(state, pid, richest, owner, srcColors, srcType)) {
                    log(state, `${getCard(richest.cardId).name}は${sourceName}の効果を受けなかった。`)
                    skip.add(richest.instanceId)
                    continue
                }
                // removeCoresToTrash 経由でバトル中のコア保護・コア下限・維持コア割れの消滅を効かせる
                const removed = removeCoresToTrash(state, pid, richest, Math.min(remaining, richest.cores), owner)
                if (removed === 0) {
                    skip.add(richest.instanceId) // 保護されていて取れない：無限ループを避ける
                    continue
                }
                remaining -= removed
                moved += removed
            }
            if (moved > 0) {
                log(state, `${sourceName}：${player.name}のスピリットからコア${moved}個をトラッシュに置いた。`)
            } else {
                log(state, `${sourceName}：${player.name}のスピリットにコアがなかった。`)
            }
        }
        return
}

// bothSidesCoreToTrashHandlerと同じ「コアの多い個体から順に合計count個をトラッシュへ」の
// 単一プレイヤー版（維持コア割れの消滅処理を含む）。実際に移した枚数を返す
function moveRichestSpiritCoresToTrash(state: GameState, pid: PlayerId, count: number): number {
    const player = state.players[pid]
    let remaining = count
    let moved = 0
    while (remaining > 0) {
        const richest = player.field.spirits
            .filter((s) => s.cores > 0)
            .reduce<CardInstance | undefined>(
                (best, s) => (best === undefined || s.cores > best.cores ? s : best),
                undefined,
            )
        if (!richest) break
        const take = Math.min(remaining, richest.cores)
        richest.cores -= take
        player.trashCores += take
        remaining -= take
        moved += take
        if (richest.cores < instMinLevelCores(richest)) {
            destroySpirit(state, pid, richest.instanceId, "deplete")
        }
    }
    return moved
}

// BS08マインドブレイク：「自分のスピリット上のコアcount個を自分のトラッシュに置くことで、
// **相手は**、相手のスピリット上のコアcount個を相手のトラッシュに置く」。
//
// 選択者が前半と後半で入れ替わる:
//   - 前半（phase:"own"）＝コストの支払い。**支払う本人が**どのスピリットから出すかを選ぶ（COST_MODEL.md §2）
//   - 後半（phase:"opp"）＝効果。効果文の主語が「相手は」なので**相手が**選ぶ（CHOOSER_RULES.md §1）
// どちらも1個ずつ選ばせ、残数を action.remaining に持ち回る。非対話は従来どおりコアの多い個体から。
// 自分のスピリット上のコア合計が count 未満なら発揮できない（COST_MODEL.md §1）
const costOwnSpiritCoresToTrashThenOpponentHandler: ActionHandler<"costOwnSpiritCoresToTrashThenOpponent"> = (
    ctx,
    action,
) => {
    const { state, owner, opp, self, sourceName, targetInstanceId } = ctx
    // side のスピリットから1個ずつ置かせる。remaining が尽きたら次の段階へ
    const step = (phase: "own" | "opp", remaining: number): void => {
        if (state.winner) return
        const side = phase === "own" ? owner : opp
        if (remaining <= 0) {
            if (phase === "own") step("opp", action.count)
            return
        }
        const candidates = state.players[side].field.spirits.filter((s) => s.cores > 0)
        if (candidates.length === 0) {
            if (phase === "opp") {
                log(state, `${sourceName}：${state.players[opp].name}のスピリットにコアがなかった。`)
                return
            }
            step("opp", action.count)
            return
        }
        if (state.interactiveTargets) {
            requestChoice(
                state,
                owner,
                phase === "own"
                    ? `${sourceName}：コストとしてコアを置く自分のスピリットを選んでください（あと${remaining}個）`
                    : `${sourceName}：コアをトラッシュに置く自分のスピリットを選んでください（あと${remaining}個）`,
                candidates.map((s) => s.instanceId),
                false,
                { ...action, phase, remaining },
                self,
                "target",
                undefined,
                // 後半は「相手は」なので選択者を相手に差し替える（解決は発生源の持ち主の効果のまま）
                phase === "opp" ? opp : undefined,
            )
            return
        }
        // 非対話：コアの多い個体から自動で置く（従来どおりの決定的簡略化）
        const moved = moveRichestSpiritCoresToTrash(state, side, remaining)
        log(state, `${sourceName}：${state.players[side].name}のスピリットからコア${moved}個をトラッシュに置いた。`)
        if (phase === "own") step("opp", action.count)
    }
    // 選択の再開：選ばれたスピリットからコアを1個置いて、残りを続ける
    if (action.phase !== undefined && action.remaining !== undefined) {
        const side = action.phase === "own" ? owner : opp
        const chosen = state.players[side].field.spirits.find((s) => s.instanceId === targetInstanceId)
        if (chosen && chosen.cores > 0) {
            chosen.cores -= 1
            state.players[side].trashCores += 1
            log(
                state,
                `${sourceName}：${state.players[side].name}は${getCard(chosen.cardId).name}のコア1個をトラッシュに置いた。`,
            )
            // 維持コア割れは既存の消滅処理に委ねる
            if (chosen.cores < instMinLevelCores(chosen)) {
                destroySpirit(state, side, chosen.instanceId, "deplete")
            }
        }
        step(action.phase, action.remaining - 1)
        return
    }
    const ownTotal = state.players[owner].field.spirits.reduce((sum, s) => sum + s.cores, 0)
    if (ownTotal < action.count) {
        log(state, `${sourceName}：自分のスピリット上のコアが足りず発動しなかった。`)
        return
    }
    step("own", action.count)
}

const coreDrainAllOthersHandler: ActionHandler<"coreDrainAllOthers"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット（self）以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブへ。
        // ループ中に消滅でspirits配列が変化するため、対象instanceIdを先に集めてから処理する。
        if (!self) {
            log(state, `${sourceName}：コア吸収の発生源がいなかった。`)
            return
        }
        const targets: { pid: PlayerId; instanceId: string }[] = []
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const inst of state.players[pid].field.spirits) {
                if (inst.instanceId === self.instanceId) continue
                targets.push({ pid, instanceId: inst.instanceId })
            }
        }
        if (targets.length === 0) {
            log(state, `${sourceName}：このスピリット以外に対象がいなかった。`)
            return
        }
        let destroyed = 0
        for (const { pid, instanceId } of targets) {
            const inst = state.players[pid].field.spirits.find(
                (s) => s.instanceId === instanceId,
            )
            if (!inst) continue // 途中の誘発等ですでにフィールドから消えている場合はスキップ
            const before = state.players[pid].field.spirits.length
            removeCores(state, pid, inst, 1, owner)
            if (state.players[pid].field.spirits.length < before) destroyed++
        }
        log(
            state,
            `${sourceName}：このスピリット以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブに置いた。`,
        )
        if (destroyed > 0) {
            self.cores += destroyed
            log(
                state,
                `${sourceName}：この効果で${destroyed}体が消滅したため、ボイドからコア${destroyed}個を自身の上に置いた。`,
            )
        }
        return
}

const trashCoresToSpiritHandler: ActionHandler<"trashCoresToSpirit"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分のトラッシュのコアを対象スピリットへ置く（count省略=全部、不足時は可能な分。
        // 対象はtargetInstanceId優先、フォールバックはself→自分フィールド先頭）
        const player = state.players[owner]
        const mine = player.field.spirits
        const target = targetInstanceId
            ? (mine.find((s) => s.instanceId === targetInstanceId) ?? null)
            : (self ?? mine[0] ?? null)
        if (!target) {
            log(state, `${sourceName}：コアを置く対象がいなかった。`)
            return
        }
        const amount =
            action.count !== undefined
                ? Math.min(action.count, player.trashCores)
                : player.trashCores
        if (amount <= 0) {
            log(state, `${sourceName}：トラッシュにコアがなかった。`)
            return
        }
        player.trashCores -= amount
        log(
            state,
            `${player.name}はトラッシュのコア${amount}個を${getCard(target.cardId).name}の上に置いた。`,
        )
        placeCoresOnSpirit(state, target, amount, owner)
        return
}

const trashCoresToKeywordSpiritHandler: ActionHandler<"trashCoresToKeywordSpirit"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分のトラッシュのコアすべてを、指定キーワードを持つ自分のスピリット1体へ置く
        const player = state.players[owner]
        if (player.trashCores <= 0) {
            log(state, `${sourceName}：トラッシュにコアがなかった。`)
            return
        }
        const candidates = player.field.spirits.filter((s) =>
            spiritHasKeyword(state, owner, s, action.keyword),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        // 対象指定（choice再入）があればその1体、なければ実効BP最大。候補複数かつinteractiveならまず選択させる
        let target = targetInstanceId
            ? candidates.find((s) => s.instanceId === targetInstanceId)
            : undefined
        if (!target) {
            if (candidates.length >= 2 && state.interactiveTargets) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コアを置くスピリットを選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
            target = candidates.reduce((best, s) =>
                effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
            )
        }
        const amount = player.trashCores
        player.trashCores = 0
        placeCoresOnSpirit(state, target, amount, owner)
        log(state, `${player.name}はトラッシュのコア${amount}個を${getCard(target.cardId).name}に置いた。`)
        return
}

const voidCoresAndMillByCostHandler: ActionHandler<"voidCoresAndMillByCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcType, targetInstanceId } = ctx
        // BS05マジックスパナ：familyFilter一致の自分のスピリット1体のコアすべてをボイドに置き、
        // そのスピリットのコストと同じ枚数だけ相手のデッキをトラッシュへ送る
        const player = state.players[owner]
        const candidates = player.field.spirits.filter((s) =>
            matchesFamilyFilter(state, owner, s, action.familyFilter),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        let target = targetInstanceId
            ? candidates.find((s) => s.instanceId === targetInstanceId)
            : undefined
        if (!target) {
            if (candidates.length >= 2 && state.interactiveTargets) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コアをボイドに置くスピリットを選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
            // 決定的自動選択：コスト最大（破棄枚数を最大化する）。
            // 複数コストを持つ状態（道化師クラン）では「最大」を定義できないため、
            // ここと下のミル枚数計算はカード本来のコストのまま比較・参照する（順序付け・値の参照）
            target = candidates.reduce((best, s) =>
                getCard(s.cardId).cost > getCard(best.cardId).cost ? s : best,
            )
        }
        const voided = target.cores
        const cost = getCard(target.cardId).cost
        const name = getCard(target.cardId).name
        target.cores = 0
        log(state, `${player.name}は${name}のコア${voided}個をボイドに置いた。`)
        if (voided < instMinLevelCores(target)) {
            destroySpirit(state, owner, target.instanceId, "deplete")
        }
        millDeck(state, opp, cost, owner, srcType ? { sourceType: srcType } : undefined)
        return
}

const reclaimTrashCoresHandler: ActionHandler<"reclaimTrashCores"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const player = state.players[owner]
        if (player.trashCores <= 0) {
            log(state, `${sourceName}：トラッシュにコアがなかった。`)
            return
        }
        const amount = player.trashCores
        player.reserve += amount
        player.trashCores = 0
        log(state, `${player.name}はトラッシュのコア${amount}個をリザーブに戻した。`)
        return
}

// 相手のスピリットから合計count個のコアを、1個ずつ対象を選びながら取り除く（SD01-013 冥剣士ベリト）。
// coreRemove が「1体からN個」なのに対し、こちらは「N個を何体かに配分」。
// 1個ぶんの実処理は coreRemove count:1 に委譲しているので、装甲・効果耐性・維持コア割れの消滅・
// leaveAtLeast の判定はすべて coreRemove 側の1箇所に残る。
// 残数の持ち回りは Pattern C「体数で再入」（docs/design/RESUME_STACK.md §7）：
// tryInteractiveTargetChoice が 1個ぶんを選択待ちにし、残り (count-1) を再開フレームへ積む
const coreRemoveDistributedHandler: ActionHandler<"coreRemoveDistributed"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        if (action.count <= 0) return
        const floor = action.leaveAtLeast ?? 0
        const one: EffectAction = {
            type: "coreRemove",
            count: 1,
            ...(action.dest !== undefined ? { dest: action.dest } : {}),
            ...(action.leaveAtLeast !== undefined ? { leaveAtLeast: action.leaveAtLeast } : {}),
        }
        // 選択の再入：選ばれた1体から1個だけ取り、残りは同じ形で続ける
        if (targetInstanceId !== undefined) {
            ctx.resolve(one, { targetInstanceId, sourceColors: srcColors, sourceType: srcType })
            if (action.count > 1) {
                ctx.resolve({ ...action, count: action.count - 1 }, { sourceColors: srcColors, sourceType: srcType })
            }
            return
        }
        // 候補：コアが floor を上回っている相手のスピリット（装甲・効果耐性で守られているものは除く）
        const candidates = state.players[opp].field.spirits.filter(
            (s) => s.cores > floor && !isResisted(state, opp, s, attemptOf(ctx, "coreRemove", "targeted")),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：コアを取り除ける相手のスピリットがいなかった。`)
            return
        }
        const prompt = action.chooserIsTarget
            ? `${sourceName}：コアを取り除く自分のスピリットを選んでください（残り${action.count}個）`
            : `${sourceName}：コアを取り除く相手のスピリットを選んでください（残り${action.count}個）`
        if (
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                prompt,
                candidates,
                { ...action, count: 1 },
                action.count > 1 ? { ...action, count: action.count - 1 } : null,
                action.chooserIsTarget ? opp : undefined,
            )
        ) {
            return
        }
        // 非対話（テスト）と候補1件のときの自動選択。docs/design/CHOOSER_RULES.md の規約に従い、
        // chooserIsTarget なら「相手が選ぶであろうもの＝損の小さいコア最多の1体」、
        // そうでなければ「発生源の持ち主が選ぶ＝痛いコア最少の1体」を取る
        const pick = candidates.reduce((best, s) =>
            action.chooserIsTarget
                ? (s.cores > best.cores ? s : best)
                : (s.cores < best.cores ? s : best),
        )
        ctx.resolve(one, { targetInstanceId: pick.instanceId, sourceColors: srcColors, sourceType: srcType })
        if (action.count > 1) {
            ctx.resolve({ ...action, count: action.count - 1 }, { sourceColors: srcColors, sourceType: srcType })
        }
        return
}

const coreToOpponentTrashChoiceHandler: ActionHandler<"coreToOpponentTrashChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 相手フィールドのスピリット/ネクサス1つを選び、コアcount個を相手のトラッシュへ置く。
        // targetInstanceId 指定時はその対象へ実行、未指定時は候補を集めて選択を要求する（魔界侯爵コキュートス）
        if (targetInstanceId !== undefined) {
            const oppPlayer = state.players[opp]
            // 「相手のフィールド/**リザーブ**から」（BS03-075 犬人マードック）。
            // リザーブはインスタンスを持たないため、候補に番兵を混ぜて表現する
            if (targetInstanceId === OPPONENT_RESERVE_TARGET) {
                const removed = Math.min(action.count, oppPlayer.reserve)
                oppPlayer.reserve -= removed
                oppPlayer.trashCores += removed
                log(state, `${sourceName}：${oppPlayer.name}のリザーブのコア${removed}個をトラッシュに置いた。`)
                return
            }
            const spirit = oppPlayer.field.spirits.find((s) => s.instanceId === targetInstanceId)
            if (spirit) {
                removeCoresToTrash(state, opp, spirit, action.count, owner)
                return
            }
            const nexus = oppPlayer.field.nexuses.find((n) => n.instanceId === targetInstanceId)
            if (nexus) {
                const removed = Math.min(action.count, nexus.cores)
                nexus.cores -= removed
                state.players[opp].trashCores += removed
                log(
                    state,
                    `${sourceName}：${getCard(nexus.cardId).name}（ネクサス）のコア${removed}個をトラッシュに置いた。`,
                )
                return
            }
            log(state, `${sourceName}：対象が見つからなかった。`)
            return
        }
        // 初回：相手フィールドのコア1個以上のスピリット/ネクサスを候補にして選択を要求する
        const oppPlayer = state.players[opp]
        const spiritCandidates = oppPlayer.field.spirits.filter(
            (s) =>
                s.cores >= 1 && !isResisted(state, opp, s, attemptOf(ctx, "coreRemove", "targeted")),
        )
        // spiritsOnly：「相手のスピリット**上の**コア1個」＝ネクサスは含まない（BS08ダークスカルデーモンLv2）
        const nexusCandidates = action.spiritsOnly
            ? []
            : oppPlayer.field.nexuses.filter((n) => n.cores >= 1)
        const candidates = [...spiritCandidates, ...nexusCandidates].map((i) => i.instanceId)
        // includeReserve 指定時のみ、相手のリザーブも取得元として選べる
        // （BS03-075 犬人マードック＝「相手のフィールド/リザーブから」。
        //  BS02-022 コキュートスは「スピリット1体かネクサス1つ」なのでリザーブを含めない）
        const withReserve = action.includeReserve && oppPlayer.reserve >= 1
        if (withReserve) candidates.push(OPPONENT_RESERVE_TARGET)
        // chooserIsTarget（BS08ダークスカルデーモンLv2）：「**相手は**、相手のスピリット上のコア1個を〜置く」。
        // 選ぶのはコアを取られる側だが、解決は発生源の持ち主の効果として行う（actorPid）
        requestChoice(
            state,
            owner,
            action.chooserIsTarget
                ? `${sourceName}：コアをトラッシュに置く自分のスピリットを選んでください`
                : withReserve
                  ? "コアを取り除く相手のスピリット/ネクサス、または相手のリザーブを選択"
                  : action.spiritsOnly
                    ? "コアを取り除く相手のスピリットを選択"
                    : "コアを取り除く相手のスピリット/ネクサスを選択",
            candidates,
            false,
            action,
            self,
            "target",
            undefined,
            action.chooserIsTarget ? opp : undefined,
        )
        return
}

const linkNexusCoresChoiceHandler: ActionHandler<"linkNexusCoresChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // クロスシザース：自分のネクサス1つを指定し、コア数をこのスピリットのコア数と同じものとして扱う
        // （selfがnullなら不発。requestChoiceが候補0件/1件/複数件を判定する）
        if (!self) return
        if (targetInstanceId === undefined) {
            const candidates = state.players[owner].field.nexuses.map((n) => n.instanceId)
            requestChoice(state, owner, "コア数をリンクするネクサスを選んでください", candidates, true, action, self)
            return
        }
        const nexus = state.players[owner].field.nexuses.find((n) => n.instanceId === targetInstanceId)
        if (!nexus) return
        nexus.coresLinkedTo = self.instanceId
        log(
            state,
            `${sourceName}：${getCard(nexus.cardId).name}のコア数は、このスピリットのコア数と同じものとして扱われる。`,
        )
        return
}

const voidCoreToAllOwnByFamilyHandler: ActionHandler<"voidCoreToAllOwnByFamily"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ボイドからコアcount個ずつを、指定系統いずれかを持つ自分のスピリットすべての上に置く（太陽花ゾンネ・ブルム）
        const candidates = state.players[owner].field.spirits.filter((s) =>
            action.families.some((family) => spiritHasFamily(state, owner, s, family)),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：対象の系統を持つスピリットがいなかった。`)
            return
        }
        for (const target of candidates) {
            placeCoresOnSpirit(state, target, action.count, owner)
        }
        log(
            state,
            `${sourceName}：ボイドからコア${action.count}個ずつを${candidates.length}体の上に置いた。`,
        )
        return
}

const voidCoreToOwnNexusesHandler: ActionHandler<"voidCoreToOwnNexuses"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ボイドからコアcount個ずつを、指定色（省略時は色不問）の自分のネクサスすべての上に置く（ボルカノ・ゴレム）
        const nexuses = state.players[owner].field.nexuses.filter(
            (n) => action.colorFilter === undefined || instHasColor(n, action.colorFilter),
        )
        if (nexuses.length === 0) {
            log(state, `${sourceName}：対象のネクサスがなかった。`)
            return
        }
        // single 指定時は1つだけに置く（薬師ギルママール）。対象指定・選択・自動選択の順で決める
        if (action.single) {
            let target = targetInstanceId
                ? nexuses.find((n) => n.instanceId === targetInstanceId)
                : undefined
            if (!target) {
                if (nexuses.length >= 2 && state.interactiveTargets) {
                    requestChoice(
                        state,
                        owner,
                        `${sourceName}：コアを置くネクサスを選んでください`,
                        nexuses.map((n) => n.instanceId),
                        false,
                        action,
                        self,
                    )
                    return
                }
                // 自動時はコアが最も少ないネクサス（レベルアップにつながりやすい方）を選ぶ
                target = nexuses.reduce((best, n) => (n.cores < best.cores ? n : best))
            }
            placeCoresOnSpirit(state, target, action.count, owner)
            log(
                state,
                `${sourceName}：ボイドからコア${action.count}個を${getCard(target.cardId).name}の上に置いた。`,
            )
            return
        }
        for (const n of nexuses) placeCoresOnSpirit(state, n, action.count, owner)
        log(
            state,
            `${sourceName}：ボイドからコア${action.count}個ずつを${nexuses.length}枚のネクサスの上に置いた。`,
        )
        return
}

const voidCoreToTargetHandler: ActionHandler<"voidCoreToTarget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ボイドからコアcount個を対象の自分スピリットの上に置く（未指定時は自分の実効BP最大。ポーションベリー）。
        // familyFilter 指定時はその系統を持つ自分のスピリットだけが対象（BS07デルファングス＝虚神/神将）
        const eligible = state.players[owner].field.spirits.filter(
            (s) =>
                action.familyFilter === undefined ||
                matchesFamilyFilter(state, owner, s, action.familyFilter),
        )
        const target = targetInstanceId
            ? eligible.find((s) => s.instanceId === targetInstanceId)
            : eligible.reduce<CardInstance | undefined>(
                  (best, s) =>
                      !best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best)
                          ? s
                          : best,
                  undefined,
              )
        if (!target) {
            log(state, `${sourceName}：コアを置く対象がいなかった。`)
            return
        }
        log(
            state,
            `${sourceName}：ボイドからコア${action.count}個を${getCard(target.cardId).name}の上に置いた。`,
        )
        placeCoresOnSpirit(state, target, action.count, owner)
        return
}

const coreTradeToOpponentTrashHandler: ActionHandler<"coreTradeToOpponentTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分のリザーブのコアをX個自分のトラッシュへ、同数だけ相手のリザーブから相手のトラッシュへ
        const player = state.players[owner]
        const opponent = state.players[opp]
        if (chosenOption !== undefined) {
            const n = parseInt(chosenOption, 10)
            if (!Number.isFinite(n) || n <= 0) return
            const capped = Math.min(n, player.reserve, opponent.reserve)
            if (capped <= 0) return
            player.reserve -= capped
            player.trashCores += capped
            opponent.reserve -= capped
            opponent.trashCores += capped
            log(
                state,
                `${player.name}はリザーブのコア${capped}個をトラッシュへ置き、${opponent.name}のリザーブのコア${capped}個も相手のトラッシュへ置かれた。`,
            )
            return
        }
        const maxAmount = Math.min(player.reserve, opponent.reserve)
        if (maxAmount <= 0) {
            log(state, `${sourceName}：お互いのリザーブが不足しており実行できなかった。`)
            return
        }
        if (state.interactiveTargets) {
            const options = Array.from({ length: maxAmount }, (_, i) => `${i + 1}個`)
            requestChoice(
                state,
                owner,
                `${sourceName}：自分のリザーブのコアを何個トラッシュへ置きますか？（同数だけ相手のリザーブもトラッシュへ。任意）`,
                [],
                true,
                action,
                self,
                "option",
                options,
            )
            return
        }
        // 自動時：上限個（min(自分,相手)）を実行
        player.reserve -= maxAmount
        player.trashCores += maxAmount
        opponent.reserve -= maxAmount
        opponent.trashCores += maxAmount
        log(
            state,
            `${player.name}はリザーブのコア${maxAmount}個をトラッシュへ置き、${opponent.name}のリザーブのコア${maxAmount}個も相手のトラッシュへ置かれた。`,
        )
        return
}

const coreToTrashAllByCostHandler: ActionHandler<"coreToTrashAllByCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 相手のコストmaxCost以下のスピリットすべての上から、コア1個ずつを相手のトラッシュへ
        // （範囲効果。destroyAllと同様に装甲・マジック効果耐性・immuneToOpponentThisTurnを除外。BS04風龍王フージャオス）
        const targets = state.players[opp].field.spirits.filter(
            (s) =>
                instMatchesCostFilter(s, { max: action.maxCost }) &&
                !isResisted(state, opp, s, attemptOf(ctx, "coreRemove", "area")),
        )
        if (targets.length === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        for (const t of targets) removeCoresToTrash(state, opp, t, 1, owner)
        return
}

const coreRemovePerHandDiscardHandler: ActionHandler<"coreRemovePerHandDiscard"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分の手札を好きなだけ破棄し、破棄したカード1枚につき相手のスピリット1体
        // （実効BP最大を自動選択。同一解決内で既に選んだ個体は除外して異なる個体へ広げる）の
        // コアを1個、相手のトラッシュへ置く（王蛇ケツァルカトル／ダンスマカブル）
        const player = state.players[owner]
        const removeOneCoreFromEnemy = (excluded: Set<string>): void => {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                (s) => !excluded.has(s.instanceId),
                srcColors,
                srcType,
            )
            if (!target) {
                log(state, `${sourceName}：コアを除去する対象がいなかった。`)
                return
            }
            excluded.add(target.instanceId)
            removeCoresToTrash(state, opp, target, 1, owner)
        }
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：破棄する手札がなかった。`)
                return
            }
            player.hand.splice(chosenCardIndex, 1)
            player.trashCards.push(cardId)
            log(state, `${player.name}は手札の「${getCard(cardId).name}」を破棄した。`)
            removeOneCoreFromEnemy(new Set())
            // 続けて破棄できるか再度尋ねる（optional=trueのためスキップで終了する）
            ctx.resolve(action)
            return
        }
        if (state.interactiveTargets) {
            if (player.hand.length === 0) {
                log(state, `${sourceName}：手札がなかった。`)
                return
            }
            requestCardChoice(
                state,
                owner,
                `${sourceName}：破棄する手札を選んでください（選ばなければ終了）`,
                "hand",
                player.hand.map((_, i) => i),
                true,
                action,
                self,
            )
            return
        }
        // 非interactive時：手札をすべて破棄し、破棄枚数ぶん一括でコア除去する（決定的簡略化）
        const count = player.hand.length
        if (count === 0) {
            log(state, `${sourceName}：手札がなかった。`)
            return
        }
        const discardedNames = player.hand.map((cardId) => getCard(cardId).name)
        player.trashCards.push(...player.hand)
        player.hand = []
        log(state, `${player.name}は手札「${discardedNames.join("、")}」を破棄した。`)
        const excluded = new Set<string>()
        for (let i = 0; i < count; i++) removeOneCoreFromEnemy(excluded)
        return
}

const opponentCoresToTrashHandler: ActionHandler<"opponentCoresToTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 氷の女神フリッグ：相手のリザーブ→相手スピリット上（コアの多い順）の順にコアを相手のトラッシュへ
        const target = state.players[opp]
        // reserveAll（BS09-017蛇凰神バァラルLv3）：リザーブにあるコアすべてをトラッシュへ。
        // スピリット上のコアには触れないので、ここで完結する
        if (action.reserveAll) {
            const moved = target.reserve
            if (moved === 0) {
                log(state, `${sourceName}：${target.name}のリザーブにコアがなかった。`)
                return
            }
            target.reserve = 0
            target.trashCores += moved
            log(state, `${sourceName}：${target.name}のリザーブのコア${String(moved)}個をトラッシュに置いた。`)
            return
        }
        let remaining = action.count
        const fromReserve = Math.min(remaining, target.reserve)
        target.reserve -= fromReserve
        target.trashCores += fromReserve
        remaining -= fromReserve
        const skip = new Set<string>() // 耐性・保護で取れなかった個体（無限ループ防止）
        while (remaining > 0) {
            const richest = target.field.spirits
                .filter((s) => s.cores > 0 && !skip.has(s.instanceId))
                .reduce<CardInstance | undefined>(
                    (best, s) => (best === undefined || s.cores > best.cores ? s : best),
                    undefined,
                )
            if (!richest) break
            if (!canTakeCoresFrom(state, opp, richest, owner, srcColors, srcType)) {
                log(state, `${getCard(richest.cardId).name}は${sourceName}の効果を受けなかった。`)
                skip.add(richest.instanceId)
                continue
            }
            const removed = removeCoresToTrash(state, opp, richest, Math.min(remaining, richest.cores), owner)
            if (removed === 0) {
                skip.add(richest.instanceId)
                continue
            }
            remaining -= removed
        }
        const moved = action.count - remaining
        log(state, `${sourceName}：${target.name}のコア${moved}個をトラッシュに置いた。`)
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

const voidCoreToOwnByKeywordHandler: ActionHandler<"voidCoreToOwnByKeyword"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 甲殻戦士ロングホーン：ボイドからコアcount個ずつを、指定キーワードを持つ自分のスピリットすべてへ
        const targets = state.players[owner].field.spirits.filter((s) =>
            spiritHasKeyword(state, owner, s, action.keyword),
        )
        if (targets.length === 0) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        for (const t of targets) placeCoresOnSpirit(state, t, action.count, owner)
        log(
            state,
            `${sourceName}：ボイドからコア${action.count}個ずつを【${KEYWORDS[action.keyword].label}】を持つ${targets.length}体の上に置いた。`,
        )
        return
}

const voidCoreToOwnTrashHandler: ActionHandler<"voidCoreToOwnTrash"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
        // ブリッツ：【粉砕】持ちのアタック時、ボイドからコア1個を自分のトラッシュに置く（effectGrantで継続付与）
        voidCoreToOwnTrash(state, owner, action.count)
        log(
            state,
            `${sourceName}：ボイドからコア${action.count}個を${state.players[owner].name}のトラッシュに置いた。`,
        )
        return
}

// BS07ライフセービング：このスピリット（self）の上のコアを自分のライフに置く。
// 維持コア割れになる場合は消滅処理を通す（checkExhaustOnCoreChange と同じ扱いを destroySpirit に委ねる）
const selfCoreToOwnLifeHandler: ActionHandler<"selfCoreToOwnLife"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
        if (!self) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        const moved = Math.min(action.count, self.cores)
        if (moved === 0) {
            log(state, `${sourceName}：置けるコアがなかった。`)
            return
        }
        self.cores -= moved
        state.players[owner].life += moved
        log(
            state,
            `${getCard(self.cardId).name}の上のコア${moved}個を${state.players[owner].name}のライフに置いた。（現在ライフ${state.players[owner].life}）`,
        )
        if (self.cores < instMinLevelCores(self)) {
            destroySpirit(state, owner, self.instanceId, "deplete")
        }
        return
}

const lifeChargeHandler: ActionHandler<"lifeCharge"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const player = state.players[owner]
        // upTo（BS09-X35超神星龍ジークヴルム・ノヴァ）：「ライフが5になるように」不足分だけ置く。
        // すでにその数以上なら何も置かない。ボイドから置くので必ず届く
        if (action.upTo !== undefined) {
            const need = action.upTo - player.life
            if (need <= 0) {
                log(state, `${sourceName}：ライフはすでに${String(action.upTo)}以上のため、コアは置かれなかった。`)
                return
            }
            player.life += need
            log(state, `${player.name}はボイドからライフにコア${String(need)}個を置いた。（現在ライフ${String(player.life)}）`)
            return
        }
        // from:"void"（【聖命】）はボイドから置くのでリザーブを消費せず、必ず count 個置ける
        if (action.from === "void") {
            player.life += action.count
            log(
                state,
                `${player.name}はボイドからライフにコア${action.count}個を置いた。（現在ライフ${player.life}）`,
            )
            // BS09-064天駆ける方舟：「【聖命】の効果で自分のライフにコアが置かれたとき」。
            // 発生源が【聖命】持ちのときだけ発火させる（同じ lifeCharge でも他のカードは対象外）
            if (self && spiritHasKeyword(state, owner, self, "seimei")) {
                fireFieldEventTriggers(state, owner, "ownSeimeiLifeCharged", { pid: owner, inst: self })
            }
            return
        }
        const amount = Math.min(action.count, player.reserve)
        player.reserve -= amount
        player.life += amount
        log(
            state,
            `${player.name}はリザーブからライフにコア${amount}個を置いた。（現在ライフ${player.life}）`,
        )
        return
}

const voidCoresToNexusLevelHandler: ActionHandler<"voidCoresToNexusLevel"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
        // フルアッド：自分のネクサス1つがlevelになるように、不足分のコアをボイドから置く。
        // 対象決定はvoidCoreToOwnNexusesのsingle分岐と同じ優先順（targetInstanceId→
        // interactiveTargets時はrequestChoice→自動時はコア数最少）
        const nexuses = state.players[owner].field.nexuses
        if (nexuses.length === 0) {
            log(state, `${sourceName}：自分のネクサスがなかった。`)
            return
        }
        let target = targetInstanceId
            ? nexuses.find((n) => n.instanceId === targetInstanceId)
            : undefined
        if (!target) {
            if (nexuses.length >= 2 && state.interactiveTargets) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：Lv${action.level}にするネクサスを選んでください`,
                    nexuses.map((n) => n.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
            target = nexuses.reduce((best, n) => (n.cores < best.cores ? n : best))
        }
        const required = coresForLevel(getCard(target.cardId), action.level)
        if (required === null || target.cores >= required) {
            log(state, `${sourceName}：${getCard(target.cardId).name}は対象条件を満たさなかった。`)
            return
        }
        const amount = required - target.cores
        placeCoresOnSpirit(state, target, amount, owner)
        log(
            state,
            `${sourceName}：ボイドからコア${amount}個を${getCard(target.cardId).name}に置き、Lv${action.level}にした。`,
        )
        return
}

const opponentNexusOrReserveCoreToTrashHandler: ActionHandler<"opponentNexusOrReserveCoreToTrash"> = (ctx, action) => {
    const { state, opp, sourceName } = ctx
        // エナジードレイン：相手のネクサス（コア数最多）にコアがあればそこから、
        // 無ければ相手のリザーブから、count個を相手のトラッシュへ
        const oppPlayer = state.players[opp]
        const richestNexus = oppPlayer.field.nexuses
            .filter((n) => n.cores > 0)
            .reduce<CardInstance | undefined>(
                (best, n) => (best === undefined || n.cores > best.cores ? n : best),
                undefined,
            )
        if (richestNexus) {
            const take = Math.min(action.count, richestNexus.cores)
            richestNexus.cores -= take
            oppPlayer.trashCores += take
            log(
                state,
                `${sourceName}：${getCard(richestNexus.cardId).name}（ネクサス）のコア${take}個をトラッシュに置いた。`,
            )
            return
        }
        if (oppPlayer.reserve > 0) {
            const take = Math.min(action.count, oppPlayer.reserve)
            oppPlayer.reserve -= take
            oppPlayer.trashCores += take
            log(state, `${sourceName}：${oppPlayer.name}のリザーブのコア${take}個をトラッシュに置いた。`)
            return
        }
        log(state, `${sourceName}：相手のネクサス・リザーブにコアがなかった。`)
        return
}

const bothSidesCoreToVoidHandler: ActionHandler<"bothSidesCoreToVoid"> = (ctx, action) => {
    const { state, owner, sourceName, srcColors, srcType } = ctx
        // インフェルノアイズ：両プレイヤーが各自のスピリット+ネクサスから、コアの多い個体から順に
        // 合計count個をボイドへ（維持コア割れの消滅処理はスピリットのみ。ネクサスは消滅しない）
        for (const pid of bothSidesPids(state, srcType)) {
            const player = state.players[pid]
            let remaining = action.count
            let moved = 0
            const skip = new Set<string>() // 耐性・保護で取れなかった個体（無限ループ防止）
            while (remaining > 0) {
                let richest: CardInstance | undefined
                let richestKind: "spirit" | "nexus" | undefined
                for (const s of player.field.spirits) {
                    if (s.cores > 0 && !skip.has(s.instanceId) && (!richest || s.cores > richest.cores)) {
                        richest = s
                        richestKind = "spirit"
                    }
                }
                for (const n of player.field.nexuses) {
                    if (n.cores > 0 && (!richest || n.cores > richest.cores)) {
                        richest = n
                        richestKind = "nexus"
                    }
                }
                if (!richest || !richestKind) break
                if (richestKind === "spirit") {
                    if (!canTakeCoresFrom(state, pid, richest, owner, srcColors, srcType)) {
                        log(state, `${getCard(richest.cardId).name}は${sourceName}の効果を受けなかった。`)
                        skip.add(richest.instanceId)
                        continue
                    }
                    const removed = removeCoresToVoid(state, pid, richest, Math.min(remaining, richest.cores), owner)
                    if (removed === 0) {
                        skip.add(richest.instanceId)
                        continue
                    }
                    remaining -= removed
                    moved += removed
                    continue
                }
                // ネクサスは装甲・維持コアの概念が無いので従来どおり直接動かす
                const take = Math.min(remaining, richest.cores)
                richest.cores -= take
                remaining -= take
                moved += take
            }
            if (moved > 0) {
                log(state, `${sourceName}：${player.name}のスピリット/ネクサスからコア${moved}個をボイドに置いた。`)
            } else {
                log(state, `${sourceName}：${player.name}のフィールドにコアがなかった。`)
            }
        }
        return
}

// ブラッディレイン：相手のコア総量（フィールド＋トラッシュ＋リザーブ）に応じた個数をボイドへ置く。
// 「相手がその中から選ぶ」を、リザーブ→トラッシュ→フィールド（コアの多い個体から）の順で
// 機械的に取り除く決定的簡略化にしてある（相手の不利が最小になる順序）
// 取り先1つぶんの選択肢。ラベルは相手に見せる文字列で、**同名個体があっても一意になるよう連番を付ける**
// （resolveChoice はラベル文字列で返るため、重複すると取り先を特定できない）
interface CoreSource {
    label: string
    kind: "reserve" | "trash" | "spirit" | "nexus"
    instanceId?: string
}

const opponentCoresToVoidByTotalHandler: ActionHandler<"opponentCoresToVoidByTotal"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, chosenOption } = ctx
    const player = state.players[opp]
    const fieldCores =
        player.field.spirits.reduce((sum, s) => sum + s.cores, 0) +
        player.field.nexuses.reduce((sum, n) => sum + n.cores, 0)
    const total = fieldCores + player.trashCores + player.reserve
    // 条件を満たす段のうち最大の minTotal を採用する
    let count = 0
    let matchedMin = -1
    for (const tier of action.tiers) {
        if (total >= tier.minTotal && tier.minTotal > matchedMin) {
            matchedMin = tier.minTotal
            count = tier.count
        }
    }
    if (count === 0) {
        log(state, `${sourceName}：${player.name}のコアは合計${total}個で条件を満たさなかった。`)
        return
    }

    // ---- 実対戦：効果文の主語は「**相手は**その中から◯個をボイドに置く」なので、
    //      取り先は1個ずつ**コアを失う側**が選ぶ（2026-08-17 ユーザー確認）。
    //      それまでは対話モードでも下の決定的簡略化を通していた。
    //      選択者だけ相手に差し替え、解決は発生源の持ち主の効果のまま（requestChoice の chooserPid）
    if (state.interactiveTargets) {
        // 再入時は action.remaining が残り個数。初回は count から始める
        const left = action.remaining ?? count
        if (left <= 0) return

        // 取り先の候補を作る。装甲・効果耐性で取れない個体は候補から外す
        const sources: CoreSource[] = []
        if (player.reserve > 0) sources.push({ label: "リザーブ", kind: "reserve" })
        if (player.trashCores > 0) sources.push({ label: "トラッシュ", kind: "trash" })
        const seen = new Map<string, number>()
        const labelFor = (name: string): string => {
            const n = (seen.get(name) ?? 0) + 1
            seen.set(name, n)
            return n === 1 ? name : `${name}（${n}体目）`
        }
        for (const sp of player.field.spirits) {
            if (sp.cores <= 0) continue
            if (!canTakeCoresFrom(state, opp, sp, owner, srcColors, srcType)) continue
            sources.push({ label: labelFor(getCard(sp.cardId).name), kind: "spirit", instanceId: sp.instanceId })
        }
        for (const nx of player.field.nexuses) {
            if (nx.cores <= 0) continue
            sources.push({ label: labelFor(getCard(nx.cardId).name), kind: "nexus", instanceId: nx.instanceId })
        }
        if (sources.length === 0) {
            log(state, `${sourceName}：${player.name}に取り除けるコアがなかった。`)
            return
        }

        // 選択の応答が来ていれば1個取り、残りがあれば再入して次を聞く
        if (chosenOption !== undefined) {
            const picked = sources.find((c) => c.label === chosenOption)
            if (!picked) {
                log(state, `${sourceName}：選ばれた取り先が見つからなかった。`)
                return
            }
            if (picked.kind === "reserve") {
                player.reserve -= 1
                log(state, `${player.name}はリザーブのコア1個をボイドに置いた。`)
            } else if (picked.kind === "trash") {
                player.trashCores -= 1
                log(state, `${player.name}はトラッシュのコア1個をボイドに置いた。`)
            } else if (picked.kind === "spirit") {
                const sp = player.field.spirits.find((x) => x.instanceId === picked.instanceId)
                if (!sp) return
                // 維持コア割れの消滅処理は removeCoresToVoid が担う
                removeCoresToVoid(state, opp, sp, 1, owner)
            } else {
                const nx = player.field.nexuses.find((x) => x.instanceId === picked.instanceId)
                if (!nx) return
                nx.cores -= 1
                log(state, `${getCard(nx.cardId).name}の上のコア1個をボイドに置いた。`)
            }
            const rest = left - 1
            if (rest > 0) ctx.resolve({ ...action, remaining: rest })
            return
        }

        requestChoice(
            state,
            owner,
            `${sourceName}：ボイドに置くコアの取り先を選んでください（残り${left}個）`,
            [],
            false,
            { ...action, remaining: left },
            self,
            "option",
            sources.map((c) => c.label),
            opp, // 選ぶのはコアを失う側
        )
        return
    }

    let remaining = count
    // リザーブ
    const fromReserve = Math.min(remaining, player.reserve)
    player.reserve -= fromReserve
    remaining -= fromReserve
    // トラッシュ
    const fromTrash = Math.min(remaining, player.trashCores)
    player.trashCores -= fromTrash
    remaining -= fromTrash
    // フィールド（コアの多い個体から。維持コア割れのスピリットは消滅）
    let fromField = 0
    const skip = new Set<string>() // 耐性・保護で取れなかった個体（無限ループ防止）
    while (remaining > 0) {
        let richest: CardInstance | undefined
        let richestKind: "spirit" | "nexus" | undefined
        for (const s of player.field.spirits) {
            if (s.cores > 0 && !skip.has(s.instanceId) && (!richest || s.cores > richest.cores)) {
                richest = s
                richestKind = "spirit"
            }
        }
        for (const n of player.field.nexuses) {
            if (n.cores > 0 && (!richest || n.cores > richest.cores)) {
                richest = n
                richestKind = "nexus"
            }
        }
        if (!richest || !richestKind) break
        if (richestKind === "spirit") {
            if (!canTakeCoresFrom(state, opp, richest, owner, srcColors, srcType)) {
                log(state, `${getCard(richest.cardId).name}は${sourceName}の効果を受けなかった。`)
                skip.add(richest.instanceId)
                continue
            }
            const removed = removeCoresToVoid(state, opp, richest, Math.min(remaining, richest.cores), owner)
            if (removed === 0) {
                skip.add(richest.instanceId)
                continue
            }
            remaining -= removed
            fromField += removed
            continue
        }
        // ネクサスは装甲・維持コアの概念が無いので従来どおり直接動かす
        const take = Math.min(remaining, richest.cores)
        richest.cores -= take
        remaining -= take
        fromField += take
    }
    log(
        state,
        `${sourceName}：${player.name}のコア合計${total}個につき${count - remaining}個をボイドに置いた。（リザーブ${fromReserve}／トラッシュ${fromTrash}／フィールド${fromField}。取り除く順は簡略化）`,
    )
}

// チェンジングコア：対象スピリットのコアを1個だけ残し、残りを同じフィールドの別のスピリットへ移す。
// 「別のスピリット」の指定はフィールドの先頭側（対象自身を除く）に固定した決定的簡略化
const moveCoresLeavingOneHandler: ActionHandler<"moveCoresLeavingOne"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    // selfTarget：対象を発生源自身に固定する（『このスピリット上のコアを』。BS01要塞龍ギガLv2）
    const found = action.selfTarget
        ? self
            ? { pid: owner, inst: self }
            : null
        : targetInstanceId
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
    const { pid, inst } = found
    if (inst.cores <= 1) {
        log(state, `${sourceName}：${getCard(inst.cardId).name}のコアは1個以下で移せなかった。`)
        return
    }
    // 移し先は同じフィールドの別のスピリット（先頭側）。allowNexusDest 指定時は、
    // スピリットがいなければ自分のネクサス（先頭側）にも置ける（要塞龍ギガ＝「他のスピリットかネクサスに」）
    const dest =
        state.players[pid].field.spirits.find((s) => s.instanceId !== inst.instanceId) ??
        (action.allowNexusDest ? state.players[pid].field.nexuses[0] : undefined)
    if (!dest) {
        log(state, `${sourceName}：同じフィールドに移し先がいなかった。`)
        return
    }
    const moved = inst.cores - 1
    inst.cores = 1
    dest.cores += moved
    log(
        state,
        `${sourceName}：${getCard(inst.cardId).name}のコア${moved}個を${getCard(dest.cardId).name}へ移した。（移し先は簡略化）`,
    )
}

// 天使スローン：相手のスピリット2体（実効BP上位2体＝プレイヤー指定の決定的簡略化）の上のコアをすべて入れ替える。
// 入れ替えで維持コア（Lv1）を下回った側は消滅する（コアが0個だった個体と入れ替えたとき）
const swapOpponentCoresHandler: ActionHandler<"swapOpponentCores"> = (ctx) => {
    const { state, owner, opp, sourceName, srcColors, srcType } = ctx
    // 装甲・マジック効果耐性で効果を受けない個体は対象から外す（他のコア操作アクションと同じ扱い）
    const candidates = state.players[opp].field.spirits.filter(
        (s) =>
            !isResisted(state, opp, s, attemptOf(ctx, "coreRemove", "area")),
    )
    if (candidates.length < 2) {
        log(state, `${sourceName}：相手のスピリットが2体未満で入れ替えられなかった。`)
        return
    }
    const sorted = [...candidates].sort((x, y) => effectiveBp(state, opp, y) - effectiveBp(state, opp, x))
    const a = sorted[0]
    const b = sorted[1]
    if (!a || !b) return
    const beforeA = a.cores
    const beforeB = b.cores
    if (beforeA === beforeB) {
        log(state, `${sourceName}：${getCard(a.cardId).name}と${getCard(b.cardId).name}のコアは同数だった。`)
        return
    }
    a.cores = beforeB
    b.cores = beforeA
    log(
        state,
        `${sourceName}：${getCard(a.cardId).name}（${beforeA}個→${beforeB}個）と${getCard(b.cardId).name}（${beforeB}個→${beforeA}個）のコアを入れ替えた。（対象2体は実効BP上位＝簡略化）`,
    )
    // コアが減った側は「効果でコアを取り除かれた」扱いの誘発と、維持コア割れの消滅を処理する
    for (const [inst, before] of [
        [a, beforeA],
        [b, beforeB],
    ] as const) {
        if (inst.cores >= before) continue
        checkExhaustOnCoreChange(state, opp, inst, { viaEffect: true, isRemoval: true })
        if (inst.cores < instMinLevelCores(inst)) {
            destroySpirit(state, opp, inst.instanceId, "deplete")
        }
        notifySpiritCoresRemovedByOpponent(state, opp, 1)
    }
}

// セブンスクリムゾン：BPminBp以上の自分のスピリット1体（BP最大）のコアすべてをボイドへ置くことをコストに、
// 相手のスピリット上のコアを合計count個（コアの多い個体から）相手のリザーブへ置く
const costOwnAllCoresThenEnemyCoresToReserveHandler: ActionHandler<"costOwnAllCoresThenEnemyCoresToReserve"> = (
    ctx,
    action,
) => {
    const { state, owner, opp, sourceName } = ctx
    const ownPlayer = state.players[owner]
    let payer: CardInstance | undefined
    for (const s of ownPlayer.field.spirits) {
        if (s.cores === 0) continue
        if (effectiveBp(state, owner, s) < action.minBp) continue
        if (!payer || effectiveBp(state, owner, s) > effectiveBp(state, owner, payer)) payer = s
    }
    if (!payer) {
        log(state, `${sourceName}：コストにできるBP${action.minBp}以上のスピリットがいないため発動しなかった。`)
        return
    }
    const paid = payer.cores
    payer.cores = 0
    log(state, `${sourceName}：コストとして${getCard(payer.cardId).name}のコア${paid}個をボイドに置いた。`)
    if (payer.cores < instMinLevelCores(payer)) {
        destroySpirit(state, owner, payer.instanceId, "deplete")
    }
    let remaining = action.count
    let moved = 0
    while (remaining > 0) {
        let richest: CardInstance | undefined
        for (const s of state.players[opp].field.spirits) {
            if (s.cores > 0 && (!richest || s.cores > richest.cores)) richest = s
        }
        if (!richest) break
        const take = Math.min(remaining, richest.cores)
        richest.cores -= take
        remaining -= take
        moved += take
        state.players[opp].reserve += take
        if (richest.cores < instMinLevelCores(richest)) {
            destroySpirit(state, opp, richest.instanceId, "deplete")
        }
    }
    if (moved === 0) {
        log(state, `${sourceName}：相手のスピリット上にコアがなかった。`)
        return
    }
    log(state, `${sourceName}：相手のスピリット上のコア${moved}個を相手のリザーブに置いた。（選ぶ順は簡略化）`)
}

const handlers = {
    opponentCoresToVoidByTotal: opponentCoresToVoidByTotalHandler,
    moveCoresLeavingOne: moveCoresLeavingOneHandler,
    swapOpponentCores: swapOpponentCoresHandler,
    costOwnAllCoresThenEnemyCoresToReserve: costOwnAllCoresThenEnemyCoresToReserveHandler,
    coreRemove: coreRemoveHandler,
    coreDrainToLowerLevel: coreDrainToLowerLevelHandler,
    coreRemoveMulti: coreRemoveMultiHandler,
    protectBlockerCoresThisBattle: protectBlockerCoresThisBattleHandler,
    coreRemoveSelf: coreRemoveSelfHandler,
    coreToTrashSelf: coreToTrashSelfHandler,
    tenshoCoreDump: tenshoCoreDumpHandler,
    tenshoResume: tenshoResumeHandler,
    tenshoSubstituteChoice: tenshoSubstituteChoiceHandler,
    coreCharge: coreChargeHandler,
    coreGain: coreGainHandler,
    coreGainPer: coreGainPerHandler,
    voidCoreToSelf: voidCoreToSelfHandler,
    voidCoreToSelfPer: voidCoreToSelfPerHandler,
    voidCoreToSelfPerBofuCount: voidCoreToSelfPerBofuCountHandler,
    voidCoreToOther: voidCoreToOtherHandler,
    coreSqueezeAll: coreSqueezeAllHandler,
    coreSqueezeOne: coreSqueezeOneHandler,
    coreToVoidOwn: coreToVoidOwnHandler,
    bothSidesCoreToTrash: bothSidesCoreToTrashHandler,
    costOwnSpiritCoresToTrashThenOpponent: costOwnSpiritCoresToTrashThenOpponentHandler,
    coreDrainAllOthers: coreDrainAllOthersHandler,
    trashCoresToSpirit: trashCoresToSpiritHandler,
    trashCoresToKeywordSpirit: trashCoresToKeywordSpiritHandler,
    reclaimTrashCores: reclaimTrashCoresHandler,
    coreRemoveDistributed: coreRemoveDistributedHandler,
    coreToOpponentTrashChoice: coreToOpponentTrashChoiceHandler,
    linkNexusCoresChoice: linkNexusCoresChoiceHandler,
    voidCoreToAllOwnByFamily: voidCoreToAllOwnByFamilyHandler,
    voidCoreToOwnNexuses: voidCoreToOwnNexusesHandler,
    voidCoreToTarget: voidCoreToTargetHandler,
    coreTradeToOpponentTrash: coreTradeToOpponentTrashHandler,
    coreToTrashAllByCost: coreToTrashAllByCostHandler,
    coreRemovePerHandDiscard: coreRemovePerHandDiscardHandler,
    opponentCoresToTrash: opponentCoresToTrashHandler,
    destructionCoresToOwnSpirit: destructionCoresToOwnSpiritHandler,
    voidCoreToOwnByKeyword: voidCoreToOwnByKeywordHandler,
    voidCoreToOwnTrash: voidCoreToOwnTrashHandler,
    lifeCharge: lifeChargeHandler,
    selfCoreToOwnLife: selfCoreToOwnLifeHandler,
    voidCoresAndMillByCost: voidCoresAndMillByCostHandler,
    voidCoresToNexusLevel: voidCoresToNexusLevelHandler,
    opponentNexusOrReserveCoreToTrash: opponentNexusOrReserveCoreToTrashHandler,
    bothSidesCoreToVoid: bothSidesCoreToVoidHandler,
} satisfies Partial<ActionRegistry>

export default handlers
