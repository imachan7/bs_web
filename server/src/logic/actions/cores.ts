// コア操作系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, PlayerId } from "../../type"
import { getCard, log, lv1Cores } from "../GameState"
import {
    countEffectCounter,
    destroySpirit,
    dumpAllCoresTensho,
    findSpiritAny,
    isImmuneToArea,
    millDeck,
    notifySpiritCoresRemovedByOpponent,
    pickBpBuffTarget,
    pickEnemyByBp,
    pickEnemyCandidates,
    placeCoresOnSpirit,
    removeCores,
    removeCoresToTrash,
    removeCoresToVoid,
    requestCardChoice,
    requestChoice,
} from "../EffectModules"
import { KEYWORDS, effectiveBp, hasArmorAgainst, hasMagicImmunity, instHasColor, isUntargetableByOpponent, matchesFamilyFilter, spiritHasFamily, spiritHasKeyword } from "../../../../shared/rules"

const coreRemoveHandler: ActionHandler<"coreRemove"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (targetInstanceId === undefined && state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, undefined, srcColors, srcType)
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
        // 対象指定があれば両プレイヤーから検索、なければ相手のBP最大スピリットを自動選択
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : (() => {
                  const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType)
                  return t ? { pid: opp, inst: t } : null
              })()
        if (!found) {
            log(state, `${sourceName}のコア除去：対象がいなかった。`)
            return
        }
        // 明示ターゲットが相手側かつ装甲該当・マジック効果耐性該当なら効果を受けない
        if (
            found.pid !== owner &&
            (hasArmorAgainst(found.inst, srcColors) ||
                (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst)))
        ) {
            log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
            return
        }
        // 維持コア割れの消滅処理はremoveCores/removeCoresToVoidが担う。
        // dest:"void"指定時はリザーブでなくボイドへ（BS04ヴェノムショット）
        if (action.dest === "void") {
            removeCoresToVoid(state, found.pid, found.inst, action.count, owner)
        } else {
            removeCores(state, found.pid, found.inst, action.count, owner)
        }
        return
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
        placeCoresOnSpirit(state, target, amount)
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
        const count = countEffectCounter(state, owner, self, action.counter)
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
        placeCoresOnSpirit(state, self, action.count)
        return
}

const voidCoreToSelfPerHandler: ActionHandler<"voidCoreToSelfPer"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // カウント値ぶん、ボイドからこのスピリット上にコアを置く
        if (!self) {
            log(state, `${sourceName}：コアを置く対象がいなかった。`)
            return
        }
        const count = countEffectCounter(state, owner, self, action.counter)
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

const voidCoreToOtherHandler: ActionHandler<"voidCoreToOther"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ボイドからコアを、self以外の自分のスピリットのうち実効BP最大の1体に置く
        if (!self) {
            log(state, `${sourceName}：コアを置く対象がいなかった。`)
            return
        }
        const candidates = state.players[owner].field.spirits.filter(
            (s) => s.instanceId !== self.instanceId,
        )
        if (candidates.length === 0) {
            log(
                state,
                `${sourceName}：このスピリット以外に自分のスピリットがいなかった。`,
            )
            return
        }
        const target = candidates.reduce((best, s) =>
            effectiveBp(state, owner, s) > effectiveBp(state, owner, best)
                ? s
                : best,
        )
        log(
            state,
            `${sourceName}：ボイドからコア${action.count}個を${getCard(target.cardId).name}の上に置いた。`,
        )
        placeCoresOnSpirit(state, target, action.count)
        return
}

const coreSqueezeAllHandler: ActionHandler<"coreSqueezeAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 両プレイヤーの全スピリットについて、コアを1個だけ残し超過分をその持ち主のリザーブへ
        let squeezed = 0
        const affectedByPid: Record<PlayerId, number> = { p1: 0, p2: 0 }
        const toDeplete: { pid: PlayerId; instanceId: string }[] = []
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            const player = state.players[pid]
            for (const inst of [...player.field.spirits]) {
                if (inst.cores <= 1) continue
                const excess = inst.cores - 1
                inst.cores = 1
                player.reserve += excess
                squeezed++
                affectedByPid[pid]++
                // 残った1個が維持コア数を下回るなら消滅対象（Lv1維持コアが2個以上のスピリット）
                if (inst.cores < lv1Cores(getCard(inst.cardId))) {
                    toDeplete.push({ pid, instanceId: inst.instanceId })
                }
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
        for (const { pid, instanceId } of toDeplete) {
            destroySpirit(state, pid, instanceId, "deplete")
        }
        return
}

const coreSqueezeOneHandler: ActionHandler<"coreSqueezeOne"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
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
            const player = state.players[opp]
            const excess = target.cores - 1
            if (excess > 0) {
                target.cores = 1
                player.reserve += excess
                log(
                    state,
                    `${getCard(target.cardId).name}のコアを1個だけ残し、超過分${excess}個を${player.name}のリザーブに置いた。`,
                )
                // 相手（opp）のスピリットのコアがownerの効果で取り除かれた（極光の大地）
                notifySpiritCoresRemovedByOpponent(state, opp, 1)
            } else {
                log(state, `${getCard(target.cardId).name}はコアが1個以下のため変化しなかった。`)
            }
            if (target.cores < lv1Cores(getCard(target.cardId))) {
                destroySpirit(state, opp, target.instanceId, "deplete")
            }
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
            if (target.cores < lv1Cores(getCard(target.cardId))) {
                destroySpirit(state, owner, target.instanceId, "deplete")
            }
        }
        return
}

const bothSidesCoreToTrashHandler: ActionHandler<"bothSidesCoreToTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 両プレイヤーのフィールドから各自の実効BP最大スピリット1体を選び、
        // そのコアを各持ち主のトラッシュへ（片側のみ対象がいてもその側は処理する）
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            const spirits = state.players[pid].field.spirits
            if (spirits.length === 0) {
                log(
                    state,
                    `${sourceName}：${state.players[pid].name}のフィールドにスピリットがいなかった。`,
                )
                continue
            }
            const target = spirits.reduce((best, s) =>
                effectiveBp(state, pid, s) > effectiveBp(state, pid, best) ? s : best,
            )
            removeCoresToTrash(state, pid, target, action.count, owner)
        }
        return
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
        placeCoresOnSpirit(state, target, amount)
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
        placeCoresOnSpirit(state, target, amount)
        log(state, `${player.name}はトラッシュのコア${amount}個を${getCard(target.cardId).name}に置いた。`)
        return
}

const voidCoresAndMillByCostHandler: ActionHandler<"voidCoresAndMillByCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, targetInstanceId } = ctx
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
            // 決定的自動選択：コスト最大（破棄枚数を最大化する）
            target = candidates.reduce((best, s) =>
                getCard(s.cardId).cost > getCard(best.cardId).cost ? s : best,
            )
        }
        const voided = target.cores
        const cost = getCard(target.cardId).cost
        const name = getCard(target.cardId).name
        target.cores = 0
        log(state, `${player.name}は${name}のコア${voided}個をボイドに置いた。`)
        if (voided < lv1Cores(getCard(target.cardId))) {
            destroySpirit(state, owner, target.instanceId, "deplete")
        }
        millDeck(state, opp, cost)
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

const coreToOpponentTrashChoiceHandler: ActionHandler<"coreToOpponentTrashChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 相手フィールドのスピリット/ネクサス1つを選び、コアcount個を相手のトラッシュへ置く。
        // targetInstanceId 指定時はその対象へ実行、未指定時は候補を集めて選択を要求する（魔界侯爵コキュートス）
        if (targetInstanceId !== undefined) {
            const oppPlayer = state.players[opp]
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
            (s) => s.cores >= 1 && !isUntargetableByOpponent(s) && !hasArmorAgainst(s, srcColors),
        )
        const nexusCandidates = oppPlayer.field.nexuses.filter((n) => n.cores >= 1)
        const candidates = [...spiritCandidates, ...nexusCandidates].map((i) => i.instanceId)
        requestChoice(state, owner, "コアを取り除く相手のスピリット/ネクサスを選択", candidates, false, action, self)
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
            placeCoresOnSpirit(state, target, action.count)
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
            placeCoresOnSpirit(state, target, action.count)
            log(
                state,
                `${sourceName}：ボイドからコア${action.count}個を${getCard(target.cardId).name}の上に置いた。`,
            )
            return
        }
        for (const n of nexuses) placeCoresOnSpirit(state, n, action.count)
        log(
            state,
            `${sourceName}：ボイドからコア${action.count}個ずつを${nexuses.length}枚のネクサスの上に置いた。`,
        )
        return
}

const voidCoreToTargetHandler: ActionHandler<"voidCoreToTarget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ボイドからコアcount個を対象の自分スピリットの上に置く（未指定時は自分の実効BP最大。ポーションベリー）
        const target = targetInstanceId
            ? state.players[owner].field.spirits.find((s) => s.instanceId === targetInstanceId)
            : state.players[owner].field.spirits.reduce<CardInstance | undefined>(
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
        placeCoresOnSpirit(state, target, action.count)
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
                getCard(s.cardId).cost <= action.maxCost &&
                !isImmuneToArea(s) &&
                !hasArmorAgainst(s, srcColors) &&
                !(srcType === "magic" && hasMagicImmunity(state, opp, s)),
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
        let remaining = action.count
        const fromReserve = Math.min(remaining, target.reserve)
        target.reserve -= fromReserve
        target.trashCores += fromReserve
        remaining -= fromReserve
        while (remaining > 0) {
            const richest = target.field.spirits
                .filter((s) => s.cores > 0)
                .reduce<CardInstance | undefined>(
                    (best, s) => (best === undefined || s.cores > best.cores ? s : best),
                    undefined,
                )
            if (!richest) break
            const take = Math.min(remaining, richest.cores)
            richest.cores -= take
            target.trashCores += take
            remaining -= take
            // 維持コア（Lv1）を下回ったスピリットは消滅する
            if (richest.cores < lv1Cores(getCard(richest.cardId))) {
                destroySpirit(state, opp, richest.instanceId, "deplete")
            }
        }
        const moved = action.count - remaining
        log(state, `${sourceName}：${target.name}のコア${moved}個をトラッシュに置いた。`)
        return
}

const destructionCoresToOwnSpiritHandler: ActionHandler<"destructionCoresToOwnSpirit"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 盾精ラングリーズ：destroySpiritが破壊直前にリザーブへ移した分（coresAtDestruction）を
        // 持ち主の実効BP最大のスピリットへ付け替える（対象選択の決定的簡略化）
        const coreCount = self?.coresAtDestruction ?? 0
        if (coreCount <= 0) {
            log(state, `${sourceName}：移すコアがなかった。`)
            return
        }
        const player = state.players[owner]
        const target = player.field.spirits.reduce<CardInstance | null>(
            (best, s) =>
                !best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
            null,
        )
        if (!target) {
            log(state, `${sourceName}：移す先のスピリットがいなかった（リザーブに残る）。`)
            return
        }
        const moveCount = Math.min(coreCount, player.reserve)
        player.reserve -= moveCount
        placeCoresOnSpirit(state, target, moveCount)
        log(
            state,
            `${sourceName}：リザーブのコア${moveCount}個を${getCard(target.cardId).name}へ移した。`,
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
        for (const t of targets) placeCoresOnSpirit(state, t, action.count)
        log(
            state,
            `${sourceName}：ボイドからコア${action.count}個ずつを【${KEYWORDS[action.keyword].label}】を持つ${targets.length}体の上に置いた。`,
        )
        return
}

const lifeChargeHandler: ActionHandler<"lifeCharge"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const player = state.players[owner]
        const amount = Math.min(action.count, player.reserve)
        player.reserve -= amount
        player.life += amount
        log(
            state,
            `${player.name}はリザーブからライフにコア${amount}個を置いた。（現在ライフ${player.life}）`,
        )
        return
}

const handlers = {
    coreRemove: coreRemoveHandler,
    coreRemoveSelf: coreRemoveSelfHandler,
    coreToTrashSelf: coreToTrashSelfHandler,
    tenshoCoreDump: tenshoCoreDumpHandler,
    coreCharge: coreChargeHandler,
    coreGain: coreGainHandler,
    coreGainPer: coreGainPerHandler,
    voidCoreToSelf: voidCoreToSelfHandler,
    voidCoreToSelfPer: voidCoreToSelfPerHandler,
    voidCoreToOther: voidCoreToOtherHandler,
    coreSqueezeAll: coreSqueezeAllHandler,
    coreSqueezeOne: coreSqueezeOneHandler,
    coreToVoidOwn: coreToVoidOwnHandler,
    bothSidesCoreToTrash: bothSidesCoreToTrashHandler,
    coreDrainAllOthers: coreDrainAllOthersHandler,
    trashCoresToSpirit: trashCoresToSpiritHandler,
    trashCoresToKeywordSpirit: trashCoresToKeywordSpiritHandler,
    reclaimTrashCores: reclaimTrashCoresHandler,
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
    lifeCharge: lifeChargeHandler,
    voidCoresAndMillByCost: voidCoresAndMillByCostHandler,
} satisfies Partial<ActionRegistry>

export default handlers
