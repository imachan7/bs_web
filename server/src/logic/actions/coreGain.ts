// コアを置くアクション（ボイド・トラッシュから自分のスピリット・ネクサス・リザーブ・トラッシュへ、コアチャージ）
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance } from "../../type"
import { coresForLevel, getCard, log, suspend } from "../GameState"
import {
    destroySpirit,
    pickBpBuffTarget,
    placeCoresOnSpirit,
    requestChoice,
    voidCoreToOwnTrash,
    voidCorePlacementBlocked,
} from "../EffectModules"
import {
    KEYWORDS,
    effectiveBp,
    instHasColor,
    instIsCombined,
    matchesFamilyFilter,
    spiritHasFamily,
    spiritHasKeyword,
} from "../../../../shared/rules"
import { countedAmount } from "../counted"


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

// ボイドからコアを持ち主の「デッキの横」へ置く（BS12-078 カシオペアシール）。
// デッキ横はどのゾーンにも属さないので、コストの支払いにもコア移動にも使えない
// （効果文の「このコアは、この効果以外に使用することはできない」）。
// ボイドは残量を持たない無限の供給源なので、ボイド側から引く処理は無い。
// 減らすのは PhaseManager のエンドステップ（1個ずつ）
const voidCoreToDeckSideHandler: ActionHandler<"voidCoreToDeckSide"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    if (action.count <= 0) return
    const player = state.players[owner]
    player.deckSideCores += action.count
    log(state, `${sourceName}：ボイドからコア${action.count}個をデッキの横に置いた。`)
}

// BS13-036星鳥クージャLv3：ボイドからコアcount個を持ち主のリザーブへ直接置く（voidCoreToDeckSideの
// リザーブ版。voidCoreToPlacementBlocked（コアステップ限定）はここでは適用しない＝リザーブに直接置く
// 効果に既存の他カード（voidCoreToOwnTrash等）も同様にガードを課していないため揃える）
const voidCoreToReserveHandler: ActionHandler<"voidCoreToReserve"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    if (action.count <= 0) return
    const player = state.players[owner]
    player.reserve += action.count
    log(state, `${sourceName}：ボイドからコア${action.count}個を自分のリザーブに置いた。`)
}

// BS15-039僧侶ペンタンLv2：自分のトラッシュのコアをcount個、持ち主のリザーブへ置く（不足分は可能な分だけ）
const trashCoresToReserveHandler: ActionHandler<"trashCoresToReserve"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    if (action.count <= 0) return
    const player = state.players[owner]
    const moved = Math.min(action.count, player.trashCores)
    if (moved <= 0) {
        log(state, `${sourceName}：トラッシュにコアが無かった。`)
        return
    }
    player.trashCores -= moved
    player.reserve += moved
    log(state, `${sourceName}：トラッシュのコア${moved}個を自分のリザーブに置いた。`)
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
        if (voidCorePlacementBlocked(state)) {
            log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため発動しなかった。`)
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

const voidCoreToAllOwnByFamilyHandler: ActionHandler<"voidCoreToAllOwnByFamily"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (voidCorePlacementBlocked(state)) {
            log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため発動しなかった。`)
            return
        }
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
        if (voidCorePlacementBlocked(state)) {
            log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため発動しなかった。`)
            return
        }
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
        if (voidCorePlacementBlocked(state)) {
            log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため発動しなかった。`)
            return
        }
        // ボイドからコアcount個を対象の自分スピリットの上に置く（未指定時は自分の実効BP最大。ポーションベリー）。
        // familyFilter 指定時はその系統を持つ自分のスピリットだけが対象（BS07デルファングス＝虚神/神将）
        // excludeSelf（BS11-019 ダンデラビット＝「このスピリット以外の」）は発生源自身を外す
        const eligible = state.players[owner].field.spirits.filter(
            (s) =>
                (action.familyFilter === undefined ||
                    matchesFamilyFilter(state, owner, s, action.familyFilter)) &&
                (action.colorFilter === undefined || instHasColor(s, action.colorFilter)) &&
                !(action.excludeSelf === true && s.instanceId === self?.instanceId),
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
        if (voidCorePlacementBlocked(state)) {
            log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため発動しなかった。`)
            return
        }
        // 甲殻戦士ロングホーン：ボイドからコアcount個ずつを、指定キーワードを持つ自分のスピリットすべてへ。
        // combinedFilter指定時は合体スピリットに絞る（BS10-087戦場に息づく命Lv2＝自分の合体スピリットすべて）
        const keyword = action.keyword
        const targets = state.players[owner].field.spirits.filter((s) => {
            if (keyword !== undefined && !spiritHasKeyword(state, owner, s, keyword)) return false
            if (action.combinedFilter === true && !instIsCombined(s)) return false
            return true
        })
        const label = keyword !== undefined ? `【${KEYWORDS[keyword].label}】を持つ` : "合体スピリット"
        if (targets.length === 0) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        for (const t of targets) placeCoresOnSpirit(state, t, action.count, owner)
        log(
            state,
            `${sourceName}：ボイドからコア${action.count}個ずつを${label}${targets.length}体の上に置いた。`,
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

const voidCoresToNexusLevelHandler: ActionHandler<"voidCoresToNexusLevel"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
        if (voidCorePlacementBlocked(state)) {
            log(state, `${sourceName}：コアステップ以外はボイドからコアを置けないため発動しなかった。`)
            return
        }
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

const handlers = {
    coreCharge: coreChargeHandler,
    coreGain: coreGainHandler,
    voidCoreToDeckSide: voidCoreToDeckSideHandler,
    voidCoreToReserve: voidCoreToReserveHandler,
    trashCoresToReserve: trashCoresToReserveHandler,
    voidCoreToSelf: voidCoreToSelfHandler,
    voidCoreToOther: voidCoreToOtherHandler,
    trashCoresToSpirit: trashCoresToSpiritHandler,
    trashCoresToKeywordSpirit: trashCoresToKeywordSpiritHandler,
    reclaimTrashCores: reclaimTrashCoresHandler,
    voidCoreToAllOwnByFamily: voidCoreToAllOwnByFamilyHandler,
    voidCoreToOwnNexuses: voidCoreToOwnNexusesHandler,
    voidCoreToTarget: voidCoreToTargetHandler,
    destructionCoresToOwnSpirit: destructionCoresToOwnSpiritHandler,
    voidCoreToOwnByKeyword: voidCoreToOwnByKeywordHandler,
    voidCoreToOwnTrash: voidCoreToOwnTrashHandler,
    voidCoresToNexusLevel: voidCoresToNexusLevelHandler,
} satisfies Partial<ActionRegistry>

export default handlers
