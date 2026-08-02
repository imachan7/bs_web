// 破壊系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, GameState, PlayerId } from "../../type"
import { createInstance, currentLevel, draw, getCard, log, minLevelCores } from "../GameState"
import {
    destroyNexus,
    destroySpirit,
    findSpiritAny,
    isImmuneToArea,
    isEffectBlocked,
    notifyNexusDeployed,
    pickAnySideByBp,
    pickAnySideCandidates,
    pickEnemyByBp,
    pickEnemyCandidates,
    requestChoice,
    returnNexusToHand,
    tryInteractiveTargetChoice,
    voidCoreToOwnTrash,
} from "../EffectModules"
import { effectiveBp, hasArmorAgainst, hasFullEffectImmunity, hasMagicImmunity, instColors, instHasColor, instMatchesCostFilter, matchesTarget, spiritHasKeyword } from "../../../../shared/rules"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { COLOR_LABELS } from "../../../../data/constants"

// 相手のトラッシュにあるマジックカードの色の種類数（重複除く。BS05超獣王ベヒードス）
function distinctOpponentTrashMagicColors(state: GameState, opp: PlayerId): number {
    const colors = new Set<Color>()
    for (const cardId of state.players[opp].trashCards) {
        const card = getCard(cardId)
        if (card.type !== "magic") continue
        for (const c of card.colors) colors.add(c)
    }
    return colors.size
}

const destroyHandler: ActionHandler<"destroy"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 絞り込みは共通の TargetFilter に一本化（maxBp/keyword/cost と、self相対BP＝
        // maxBpFromSelf「召喚されたスピリットのBP以下」・bpEqualsSelf「selfと同BP」）。
        // self 相対BPは normalizeFilter が数値へ解決し、self 不在なら SELF_REQUIRED を返す
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}の破壊効果：BP参照元がいなかった。`)
            return
        }
        // BP上限も filter 側で判定するため、候補列挙には上限を渡さない（Infinity）
        const limitBp = Infinity
        const matchesFilter = (s: CardInstance) => matchesTarget(state, opp, s, filter, self?.instanceId)
        if (targetInstanceId !== undefined) {
            // pendingChoice解決：選ばれた1体のみ破壊する。
            // 候補列挙（pickEnemyCandidates）では除外済みでも、この経路はここで改めて免疫を判定する
            // （coreRemove / returnToHand と同じ考え方。選択の提示から解決までの間に状態が変わりうる）。
            // anySide対応のためfindSpiritAnyで両陣営から検索する（instanceIdはゲーム内で一意）
            const found = findSpiritAny(state, targetInstanceId)
            if (!found) {
                log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                return
            }
            if (
                isEffectBlocked(state, found.inst, srcType) ||
                (found.pid !== owner &&
                    (hasArmorAgainst(found.inst, srcColors) ||
                        (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst))))
            ) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                return
            }
            destroySpirit(state, found.pid, found.inst.instanceId, "destroy", destroyContext)
            return
        }
        // countPerOpponentTrashMagicColors指定時はcountを無視し、相手のトラッシュのマジックカード
        // の色の種類数を対象数として使う（BS05超獣王ベヒードス）
        const resolvedCount = action.countPerOpponentTrashMagicColors
            ? distinctOpponentTrashMagicColors(state, opp)
            : action.count
        if (resolvedCount === 0) {
            log(state, `${sourceName}の破壊効果：カウントが0のため発動しなかった。`)
            return
        }
        // anySide：自分/相手どちらのスピリットも対象にできる（destroyExhaustedのanySideと同じ非対称ルール。
        // 相手側候補には装甲・マジック効果耐性を尊重し、自分側には適用しない）
        if (action.anySide) {
            const anySideCandidates = pickAnySideCandidates(state, owner, matchesFilter, srcColors, srcType)
            if (
                state.interactiveTargets &&
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の破壊効果：破壊するスピリットを選んでください`,
                    anySideCandidates,
                    { ...action, count: 1 },
                    resolvedCount > 1
                        ? { ...action, count: resolvedCount - 1, countPerOpponentTrashMagicColors: false }
                        : null,
                )
            ) {
                return
            }
            for (let i = 0; i < resolvedCount; i++) {
                const target = pickAnySideByBp(state, owner, limitBp, matchesFilter, srcColors, srcType)
                if (!target) {
                    log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                    break
                }
                destroySpirit(state, target.pid, target.inst.instanceId, "destroy", destroyContext)
            }
            return
        }
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, limitBp, matchesFilter, srcColors, srcType)
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の破壊効果：破壊するスピリットを選んでください`,
                    candidates,
                    { ...action, count: 1 },
                    resolvedCount > 1 ? { ...action, count: resolvedCount - 1, countPerOpponentTrashMagicColors: false } : null,
                )
            ) {
                return
            }
        }
        for (let i = 0; i < resolvedCount; i++) {
            const target = pickEnemyByBp(state, opp, limitBp, matchesFilter, srcColors, srcType)
            if (!target) {
                log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                break
            }
            destroySpirit(state, opp, target.instanceId, "destroy", destroyContext)
        }
        return
}

const destroyAllHandler: ActionHandler<"destroyAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 範囲破壊。untargetable（ワルキューレ）は範囲に無力なので当たるが、
        // 全効果免疫（フェザーバリア）・装甲該当・マジック効果耐性該当のスピリットは除外する。
        // 絞り込み（maxBp / colorExclude）は共通の TargetFilter に一本化。
        // anySide は「どちらのフィールドを見るか」＝対象プールの選択なので filter には含めない
        const areaFilter = normalizeFilter(ctx, action)
        if (areaFilter === SELF_REQUIRED) {
            log(state, `${sourceName}：BP参照元がいなかった。`)
            return
        }
        const oppTargets = state.players[opp].field.spirits
            .filter(
                (s) =>
                    matchesTarget(state, opp, s, areaFilter, self?.instanceId) &&
                    !isImmuneToArea(s) &&
                    !isEffectBlocked(state, s, srcType) &&
                    !hasArmorAgainst(s, srcColors) &&
                    !(srcType === "magic" && hasMagicImmunity(state, opp, s)) &&
                    !hasFullEffectImmunity(s, srcType),
            )
            .map((s) => ({ pid: opp, inst: s }))
        // anySide 指定時は自分側も対象に含める（装甲・マジック効果耐性は既存のanySide系アクションと
        // 同様に自分側には適用しない非対称ルール。BS04魔龍帝ジークフリードLv3）
        const ownTargets = action.anySide
            ? state.players[owner].field.spirits
                  .filter(
                      (s) =>
                          matchesTarget(state, owner, s, areaFilter, self?.instanceId) &&
                          !isImmuneToArea(s) &&
                          !isEffectBlocked(state, s, srcType),
                  )
                  .map((s) => ({ pid: owner, inst: s }))
            : []
        const targets = [...oppTargets, ...ownTargets]
        if (targets.length === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        for (const t of targets) destroySpirit(state, t.pid, t.inst.instanceId, "destroy", destroyContext)
        return
}

const destroyAllExceptChosenColorsHandler: ActionHandler<"destroyAllExceptChosenColors"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // お互い自分のフィールドで最多のスピリット色を1色ずつ自動指定する
        // （同数の場合はColor定義順=red,purple,green,white,yellow,blueの先頭を採用。
        // フィールドが空のプレイヤーは指定なし。プレイヤー選択の決定的簡略化）
        const colorOrder: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
        const pickChosenColor = (pid: PlayerId): Color | null => {
            const spirits = state.players[pid].field.spirits
            if (spirits.length === 0) return null
            const counts = new Map<Color, number>()
            for (const s of spirits) {
                // 多色スピリットはどちらの色にも1票を入れる
                for (const c of instColors(s)) counts.set(c, (counts.get(c) ?? 0) + 1)
            }
            let best: Color | null = null
            let bestCount = 0
            for (const c of colorOrder) {
                const n = counts.get(c) ?? 0
                if (n > bestCount) {
                    bestCount = n
                    best = c
                }
            }
            return best
        }
        // 実対戦では「お互い、自分のフィールドに出ているスピリットの色を1色指定する」を
        // **両プレイヤーが順に**選ぶ。進捗は action の chosenOwn / chosenOpp / awaiting に持たせて再入する。
        // 相手に選ばせる段では PendingChoice.actorPid で「選択者＝相手・実行者＝発生源の持ち主」にする
        const fieldColors = (pid: PlayerId): Color[] => {
            const set = new Set<Color>()
            for (const sp of state.players[pid].field.spirits) for (const c of instColors(sp)) set.add(c)
            return colorOrder.filter((c) => set.has(c))
        }
        const colorOf = (label: string | undefined): Color | undefined =>
            (Object.entries(COLOR_LABELS) as [Color, string][]).find(([, l]) => l === label)?.[0]

        let chosenOwn = action.chosenOwn
        let chosenOpp = action.chosenOpp
        if (state.interactiveTargets) {
            // 選択の応答を取り込む
            if (action.awaiting === "own") chosenOwn = colorOf(chosenOption) ?? chosenOwn
            if (action.awaiting === "opponent") chosenOpp = colorOf(chosenOption) ?? chosenOpp

            const ownColors = fieldColors(owner)
            if (chosenOwn === undefined && ownColors.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：自分のフィールドから残す色を1色指定してください`,
                    [],
                    false,
                    { ...action, awaiting: "own", ...(chosenOpp ? { chosenOpp } : {}) },
                    self,
                    "option",
                    ownColors.map((c) => COLOR_LABELS[c]),
                )
                return
            }
            if (chosenOwn === undefined) chosenOwn = ownColors[0]

            const oppColors = fieldColors(opp)
            if (chosenOpp === undefined && oppColors.length >= 2) {
                requestChoice(
                    state,
                    opp, // ← 選ぶのは相手
                    `${sourceName}：自分のフィールドから残す色を1色指定してください`,
                    [],
                    false,
                    { ...action, awaiting: "opponent", ...(chosenOwn ? { chosenOwn } : {}) },
                    self,
                    "option",
                    oppColors.map((c) => COLOR_LABELS[c]),
                )
                // 破壊は発生源の持ち主の効果として解決する
                if (state.pendingChoice) state.pendingChoice.actorPid = owner
                return
            }
            if (chosenOpp === undefined) chosenOpp = oppColors[0]
        }
        const chosenP1 = chosenOwn ?? chosenOpp ?? pickChosenColor("p1")
        const chosenP2 = state.interactiveTargets
            ? (chosenOpp ?? null)
            : pickChosenColor("p2")
        const safeColors = new Set(
            (state.interactiveTargets ? [chosenOwn, chosenOpp] : [chosenP1, chosenP2]).filter(
                (c): c is Color => c !== null && c !== undefined,
            ),
        )
        log(
            state,
            `${sourceName}：指定色は p1=${chosenP1 ?? "なし"}, p2=${chosenP2 ?? "なし"}。` +
                `いずれでもない色のスピリットを破壊する。`,
        )
        // 相手フィールドは既存の免疫（isImmuneToArea）・装甲チェックを適用、自分フィールドは適用しない
        // （destroyExhaustedのanySideと同じ非対称ルール＝自分の効果は自分のスピリットには免疫が働かない）
        const oppTargets = state.players[opp].field.spirits.filter(
            (s) =>
                !instColors(s).some((c) => safeColors.has(c)) &&
                !isImmuneToArea(s) &&
                !isEffectBlocked(state, s, srcType) &&
                !hasArmorAgainst(s, srcColors) &&
                !hasFullEffectImmunity(s, srcType),
        )
        const ownTargets = state.players[owner].field.spirits.filter(
            (s) => !instColors(s).some((c) => safeColors.has(c)),
        )
        for (const t of oppTargets) destroySpirit(state, opp, t.instanceId, "destroy", destroyContext)
        for (const t of ownTargets) destroySpirit(state, owner, t.instanceId)
        return
}

const destroyAllNexusesExceptChosenColorsHandler: ActionHandler<"destroyAllNexusesExceptChosenColors"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // destroyAllExceptChosenColorsのネクサス版。両者フィールドのネクサスの色数合計
        // （重複除く）がminTotalColors未満なら不発（ログのみ）。
        // お互い自分フィールドで最多のネクサス色を1色ずつ自動指定し（同数はcolorOrder先頭、
        // ネクサス0の側は指定なし）、どちらの指定色でもないネクサスをすべて破壊する
        // （色選択の決定的簡略化。溶海竜プレシオス）
        const colorOrder: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
        const pickChosenNexusColor = (pid: PlayerId): Color | null => {
            const nexuses = state.players[pid].field.nexuses
            if (nexuses.length === 0) return null
            const counts = new Map<Color, number>()
            for (const n of nexuses) {
                for (const c of instColors(n)) counts.set(c, (counts.get(c) ?? 0) + 1)
            }
            let best: Color | null = null
            let bestCount = 0
            for (const c of colorOrder) {
                const n = counts.get(c) ?? 0
                if (n > bestCount) {
                    bestCount = n
                    best = c
                }
            }
            return best
        }
        const allNexusColors = new Set<Color>()
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const n of state.players[pid].field.nexuses) {
                for (const c of instColors(n)) allNexusColors.add(c)
            }
        }
        if (allNexusColors.size < action.minTotalColors) {
            log(
                state,
                `${sourceName}：両者のネクサスの色数合計が${action.minTotalColors}色未満のため発動しなかった。`,
            )
            return
        }
        const chosenP1 = pickChosenNexusColor("p1")
        const chosenP2 = pickChosenNexusColor("p2")
        const safeColors = new Set([chosenP1, chosenP2].filter((c): c is Color => c !== null))
        log(
            state,
            `${sourceName}：ネクサスの指定色は p1=${chosenP1 ?? "なし"}, p2=${chosenP2 ?? "なし"}。` +
                `いずれでもない色のネクサスを破壊する。`,
        )
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            const targets = state.players[pid].field.nexuses.filter(
                (n) => !instColors(n).some((c) => safeColors.has(c)),
            )
            for (const t of targets) destroyNexus(state, pid, t.instanceId)
        }
        return
}

const destroyNexusHandler: ActionHandler<"destroyNexus"> = (ctx, action) => {
    const { state, owner, opp, sourceName } = ctx
        // side指定時は破壊対象の陣営を切り替える（省略時はopponent＝従来どおり。BS01バスターファランクス＝both）
        const sides: PlayerId[] = action.side === "both" ? ["p1", "p2"] : [opp]
        // levelFilter指定時はcurrentLevelがこれに含まれるネクサスのみ対象（BS03バスターランス＝Lv1のみ）
        const matchesLevel = (n: CardInstance) =>
            action.levelFilter === undefined || action.levelFilter.includes(currentLevel(n).level)
        let destroyed = 0
        for (const pid of sides) {
            // all指定時はcountを無視し、開始時点で条件に一致するネクサス数ぶん繰り返して全破壊する（BS04風龍王フージャオス）
            const iterations = action.all
                ? state.players[pid].field.nexuses.filter(matchesLevel).length
                : action.count
            for (let i = 0; i < iterations; i++) {
                const nexus = action.levelFilter
                    ? state.players[pid].field.nexuses.find(matchesLevel)
                    : state.players[pid].field.nexuses[0]
                if (!nexus) {
                    log(state, `${sourceName}のネクサス破壊：対象がいなかった。`)
                    break
                }
                const ok = destroyNexus(state, pid, nexus.instanceId)
                if (!ok) break // 破壊耐性で不発：同じネクサスを再試行しても結果は変わらないため打ち切る
                destroyed++
            }
        }
        // 実際に破壊できたネクサス1つにつきdrawPerDestroyed枚ドロー（バスタースピア）
        if (action.drawPerDestroyed && destroyed > 0) {
            draw(state, owner, destroyed * action.drawPerDestroyed)
        }
        return
}

const destroyExhaustedHandler: ActionHandler<"destroyExhausted"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 絞り込みは共通の TargetFilter に一本化（cost 軸）。対象指定パスからも使うため冒頭で解決する
        const exhaustedFilter = normalizeFilter(ctx, action)
        if (exhaustedFilter === SELF_REQUIRED) {
            log(state, `${sourceName}：BP参照元がいなかった。`)
            return
        }
        // 対象指定時はその1体のみ処理（疲労状態でなければログを出して何もしない）
        if (targetInstanceId) {
            const found = findSpiritAny(state, targetInstanceId)
            if (!found) {
                log(state, `${sourceName}の疲労破壊：対象がいなかった。`)
                return
            }
            if (
                isEffectBlocked(state, found.inst, srcType) ||
                (found.pid !== owner &&
                    (hasArmorAgainst(found.inst, srcColors) ||
                        (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst))))
            ) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                return
            }
            if (!found.inst.isRested) {
                log(
                    state,
                    `${getCard(found.inst.cardId).name}は疲労していないため破壊できない。`,
                )
                return
            }
            if (!matchesTarget(state, found.pid, found.inst, exhaustedFilter, self?.instanceId)) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の対象条件を満たさない。`)
                return
            }
            destroySpirit(state, found.pid, found.inst.instanceId)
            return
        }
        // costFilter 指定時は対象スピリットのコストがmax以下/min以上のみ（BS04ヘルウィッチ）
        const matchesExhaustedCandidate = (s: CardInstance) =>
            s.isRested && matchesTarget(state, opp, s, exhaustedFilter, self?.instanceId)
        if (action.anySide) {
            // 「自分か相手の疲労スピリット1体」（BS02-024 ブラッディ・シーザー）。
            // 実対戦ではプレイヤーが両陣営から選ぶ。相手側の候補には免疫・装甲チェックを適用し、
            // 自分側には適用しない（pickEnemyByBp と同じ非対称ルール）
            const anySideCandidates = pickAnySideCandidates(
                state,
                owner,
                matchesExhaustedCandidate,
                srcColors,
                srcType,
            )
            if (
                state.interactiveTargets &&
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の疲労破壊：対象を選んでください`,
                    anySideCandidates,
                    { ...action, count: 1 },
                    action.count > 1 ? { ...action, count: action.count - 1 } : null,
                )
            ) {
                return
            }
            // 自動選択（テスト・非対話時）は従来どおり実効BP最大の1体。同値の場合は相手側を優先する
            const oppCandidate = pickEnemyByBp(state, opp, Infinity, matchesExhaustedCandidate, srcColors, srcType)
            const ownCandidates = state.players[owner].field.spirits.filter(matchesExhaustedCandidate)
            const ownCandidate =
                ownCandidates.length > 0
                    ? ownCandidates.reduce((best, s) =>
                          effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
                      )
                    : null
            let target: { pid: PlayerId; inst: CardInstance } | null = null
            if (oppCandidate && ownCandidate) {
                target =
                    effectiveBp(state, owner, ownCandidate) > effectiveBp(state, opp, oppCandidate)
                        ? { pid: owner, inst: ownCandidate }
                        : { pid: opp, inst: oppCandidate }
            } else if (oppCandidate) {
                target = { pid: opp, inst: oppCandidate }
            } else if (ownCandidate) {
                target = { pid: owner, inst: ownCandidate }
            }
            if (!target) {
                log(state, `${sourceName}の疲労破壊：対象がいなかった。`)
                return
            }
            destroySpirit(state, target.pid, target.inst.instanceId)
            return
        }
        if (state.interactiveTargets) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, matchesExhaustedCandidate, srcColors, srcType)
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}の疲労破壊：対象を選んでください`,
                    candidates,
                    { ...action, count: 1 },
                    action.count > 1 ? { ...action, count: action.count - 1 } : null,
                )
            ) {
                return
            }
        }
        // 未指定時は相手フィールドの疲労状態スピリットからBP最大をcount回自動選択
        for (let i = 0; i < action.count; i++) {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                matchesExhaustedCandidate,
                srcColors,
                srcType,
            )
            if (!target) {
                log(state, `${sourceName}の疲労破壊：対象がいなかった。`)
                break
            }
            destroySpirit(state, opp, target.instanceId, "destroy", destroyContext)
        }
        return
}

const destroyByCostBudgetHandler: ActionHandler<"destroyByCostBudget"> = (ctx, action) => {
    const { state, opp, sourceName, srcColors, srcType, destroyContext } = ctx
        // 聖皇ジークフリーデン：相手スピリットをコスト合計がbudgetを超えない範囲で好きなだけ破壊する
        // （プレイヤー選択の決定的簡略化：残り予算内でコスト最大のものから貪欲に選ぶ。同コストは実効BP最大を優先）
        let remaining = action.budget
        let destroyedCount = 0
        const destroyedNames: string[] = []
        while (remaining > 0) {
            const candidates = pickEnemyCandidates(
                state,
                opp,
                Infinity,
                (s) => getCard(s.cardId).cost <= remaining,
                srcColors,
                srcType,
            )
            if (candidates.length === 0) break
            const target = candidates.reduce((best, s) => {
                const sCost = getCard(s.cardId).cost
                const bestCost = getCard(best.cardId).cost
                if (sCost !== bestCost) return sCost > bestCost ? s : best
                return effectiveBp(state, opp, s) > effectiveBp(state, opp, best) ? s : best
            })
            remaining -= getCard(target.cardId).cost
            destroyedNames.push(getCard(target.cardId).name)
            destroySpirit(state, opp, target.instanceId, "destroy", destroyContext)
            destroyedCount++
        }
        if (destroyedCount === 0) {
            log(state, `${sourceName}：破壊できる対象がいなかった。`)
            return
        }
        log(
            state,
            `${sourceName}：コスト合計${action.budget}まで「${destroyedNames.join("、")}」を破壊した。`,
        )
        return
}

const destroyOwnByCostHandler: ActionHandler<"destroyOwnByCost"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分のフィールドからself以外でコスト<=maxCostの1体を破壊する。
        // 実対戦（interactiveTargets）ではプレイヤーが選び、非対話時はコスト最大を自動選択する。
        // 候補の絞り込みは「場のスピリットのコストを条件にする判定」なので、道化師クランの
        // 付与コストも見る instMatchesCostFilter を使う
        const candidates = state.players[owner].field.spirits.filter(
            (s) =>
                (!self || s.instanceId !== self.instanceId) &&
                instMatchesCostFilter(s, { max: action.maxCost }),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        // pendingChoice 解決時は選ばれた1体を使う
        const chosenTarget = targetInstanceId
            ? candidates.find((s) => s.instanceId === targetInstanceId)
            : undefined
        if (!chosenTarget && targetInstanceId === undefined && state.interactiveTargets) {
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}：破壊する自分のスピリットを選んでください`,
                    candidates,
                    action,
                    null,
                )
            ) {
                return
            }
        }
        // 自動選択の「コスト最大」／gainCoresEqualCostで得るコア数は、複数コストを持つ状態では
        // 「最大」を定義できないため、道化師クラン等の付与コストではなくカード本来のコストのまま比較する
        const target =
            chosenTarget ??
            candidates.reduce((best, s) =>
                getCard(s.cardId).cost > getCard(best.cardId).cost ? s : best,
            )
        const targetCost = getCard(target.cardId).cost
        const targetName = getCard(target.cardId).name
        destroySpirit(state, owner, target.instanceId)
        if (action.gainCoresEqualCost) {
            const player = state.players[owner]
            player.reserve += targetCost
            log(
                state,
                `${sourceName}：破壊した${targetName}のコストと同じ数のコア${targetCost}個をボイドから自分のリザーブに置いた。（リザーブ${player.reserve}）`,
            )
        }
        return
}

const destroySelfHandler: ActionHandler<"destroySelf"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このスピリット（self）を破壊する（onDestroy誘発あり。selfがnull/不在ならno-op。コリスタル）
        if (!self) {
            log(state, `${sourceName}：selfが不在のため何も起こらなかった。`)
            return
        }
        destroySpirit(state, owner, self.instanceId)
        return
}

const destroyAllNexusesWithCoresHandler: ActionHandler<"destroyAllNexusesWithCores"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // コアが1個以上置かれている両陣営のネクサスをすべて破壊する（フレイム・エルク）。
        // 破壊耐性（nexusIndestructible）はdestroyNexus内で尊重される
        let destroyed = 0
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            const targets = state.players[pid].field.nexuses
                .filter((n) => n.cores >= 1)
                .map((n) => n.instanceId)
            for (const instanceId of targets) {
                if (destroyNexus(state, pid, instanceId)) destroyed++
            }
        }
        if (destroyed === 0) {
            log(state, `${sourceName}：コアが置かれているネクサスがなかった。`)
        }
        return
}

const nexusCoresToTrashHandler: ActionHandler<"nexusCoresToTrash"> = (ctx, action) => {
    const { state, opp, sourceName } = ctx
        // フォールダウン：指定側のネクサスすべての上のコアすべてを、各持ち主のトラッシュへ。
        // ネクサスはコア0になっても消滅しない
        const sides: PlayerId[] = action.side === "both" ? ["p1", "p2"] : [opp]
        let total = 0
        for (const pid of sides) {
            const player = state.players[pid]
            for (const nexus of player.field.nexuses) {
                if (nexus.cores <= 0) continue
                total += nexus.cores
                player.trashCores += nexus.cores
                nexus.cores = 0
            }
        }
        if (total === 0) {
            log(state, `${sourceName}：コアが置かれているネクサスがなかった。`)
            return
        }
        log(state, `${sourceName}：ネクサスの上のコア合計${total}個を持ち主のトラッシュに置いた。`)
        return
}

const sacrificeNexusThenWipeEnemyNexusCoresHandler: ActionHandler<"sacrificeNexusThenWipeEnemyNexusCores"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // サクリファイス：自分のネクサス1つを破壊し、相手の全ネクサス上のコアを相手のトラッシュへ置く。
        // 実対戦（interactiveTargets）では破壊するネクサスをプレイヤーが選び、
        // 非対話時はコア数最小（同数は配列先頭）を自動選択する
        const mine = state.players[owner].field.nexuses
        if (mine.length === 0) {
            log(state, `${sourceName}：自分のネクサスがなかった。`)
            return
        }
        const chosenNexus = targetInstanceId
            ? mine.find((n) => n.instanceId === targetInstanceId)
            : undefined
        if (!chosenNexus && targetInstanceId === undefined && state.interactiveTargets) {
            if (
                tryInteractiveTargetChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}：破壊する自分のネクサスを選んでください`,
                    mine,
                    action,
                    null,
                )
            ) {
                return
            }
        }
        const sacrifice = chosenNexus ?? mine.reduce((best, n) => (n.cores < best.cores ? n : best))
        const destroyed = destroyNexus(state, owner, sacrifice.instanceId)
        if (!destroyed) {
            log(state, `${sourceName}：ネクサスを破壊できなかったため効果は発動しなかった。`)
            return
        }
        const oppPlayer = state.players[opp]
        let total = 0
        for (const nexus of oppPlayer.field.nexuses) {
            if (nexus.cores <= 0) continue
            total += nexus.cores
            oppPlayer.trashCores += nexus.cores
            nexus.cores = 0
        }
        if (total === 0) {
            log(state, `${sourceName}：${oppPlayer.name}のネクサスにコアがなかった。`)
            return
        }
        log(
            state,
            `${sourceName}：${oppPlayer.name}のネクサス上のコア合計${total}個をトラッシュに置いた。`,
        )
        return
}

const returnNexusToHandHandler: ActionHandler<"returnNexusToHand"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, targetInstanceId } = ctx
        // 1件戻すたびの共通処理：voidCoreToOwnTrashIfOpponent指定時、戻したネクサスが
        // 相手のものだったときのみボイドからその数のコアを自分のトラッシュへ（BS03メビウスリング）
        const bounceOne = (pid: PlayerId, nexus: CardInstance): void => {
            returnNexusToHand(state, pid, nexus.instanceId)
            if (pid !== owner && action.voidCoreToOwnTrashIfOpponent) {
                voidCoreToOwnTrash(state, owner, action.voidCoreToOwnTrashIfOpponent)
                log(
                    state,
                    `${sourceName}：相手のネクサスを手札に戻したため、ボイドからコア${action.voidCoreToOwnTrashIfOpponent}個を自分のトラッシュに置いた。`,
                )
            }
        }
        // anySide：自分/相手どちらのネクサスも対象にできる。
        // targetInstanceId優先→interactiveTargets時はrequestChoiceで両陣営から選択→
        // それも無ければ既存どおり相手の先頭ネクサスを自動選択（下のループへフォールスルー）
        if (action.anySide) {
            if (targetInstanceId !== undefined) {
                let found: { pid: PlayerId; inst: CardInstance } | null = null
                for (const pid of ["p1", "p2"] as PlayerId[]) {
                    const nexus = state.players[pid].field.nexuses.find((n) => n.instanceId === targetInstanceId)
                    if (nexus) {
                        found = { pid, inst: nexus }
                        break
                    }
                }
                if (!found) {
                    log(state, `${sourceName}のネクサス手札戻し：対象がいなかった。`)
                    return
                }
                bounceOne(found.pid, found.inst)
                return
            }
            if (state.interactiveTargets) {
                const candidates = [
                    ...state.players[opp].field.nexuses,
                    ...state.players[owner].field.nexuses,
                ]
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：手札に戻すネクサスを選んでください`,
                    candidates.map((n) => n.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
        }
        for (let i = 0; i < action.count; i++) {
            const nexus = state.players[opp].field.nexuses[0]
            if (!nexus) {
                log(state, `${sourceName}のネクサス手札戻し：対象がいなかった。`)
                break
            }
            bounceOne(opp, nexus)
        }
        return
}

const reviveLastDestroyedNexusHandler: ActionHandler<"reviveLastDestroyedNexus"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 戦闘獣ジャッカー：self上のコアすべてをトラッシュに置くことで、直近に破壊された自分のネクサスを戻す
        // BS05ブロンズ・ゴレム：coreCost指定時はその数だけを支払う（不足なら不発）
        const last = state.lastDestroyedNexus
        const requiredCost = action.coreCost
        if (!self || self.cores <= 0 || (requiredCost !== undefined && self.cores < requiredCost)) {
            log(state, `${sourceName}：支払えるコアがなかった。`)
            return
        }
        if (!last || last.pid !== owner) {
            log(state, `${sourceName}：戻せるネクサスがなかった。`)
            return
        }
        const player = state.players[owner]
        const trashIndex = player.trashCards.lastIndexOf(last.cardId)
        if (trashIndex === -1) {
            log(state, `${sourceName}：戻せるネクサスがトラッシュになかった。`)
            return
        }
        // コストの支払い：coreCost指定時はその数、省略時はself上のコアすべてを自分のトラッシュへ（維持コア割れで消滅する）
        const paid = requiredCost ?? self.cores
        self.cores -= paid
        player.trashCores += paid
        player.trashCards.splice(trashIndex, 1)
        player.field.nexuses.push(createInstance(last.cardId, state.turn, 0))
        state.lastDestroyedNexus = null
        log(
            state,
            `${sourceName}：コア${paid}個をトラッシュに置き、${getCard(last.cardId).name}をフィールドに戻した。`,
        )
        notifyNexusDeployed(state, owner)
        if (self.cores < minLevelCores(getCard(self.cardId))) {
            destroySpirit(state, owner, self.instanceId, "deplete")
        }
        return
}

// 「お互い、フィールドのスピリット1体を選び、破壊する」（BS05吸血女王カーミラLv3）。
// destroyAllExceptChosenColorsHandlerと同じ二段階choiceパターン：発生源の持ち主（own）→相手（opponent）の
// 順に、フィールド（両陣営どちらでも可）から1体を指定させる。進捗はaction.chosenOwn/chosenOpp/awaitingで持ち回る。
// 二段階目の選択はrequestChoiceのpidに相手を渡すが、実行者（resolveActionのowner引数）は
// 発生源の持ち主のまま解決する（destroyAllExceptChosenColorsと同じ「相手に選ばせて自分の効果として解決する」形）
const mutualDestroyChoiceHandler: ActionHandler<"mutualDestroyChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, targetInstanceId } = ctx
    const allSpiritIds = (): string[] =>
        [...state.players.p1.field.spirits, ...state.players.p2.field.spirits].map((s) => s.instanceId)

    let chosenOwn = action.chosenOwn
    let chosenOpp = action.chosenOpp

    if (state.interactiveTargets) {
        if (action.awaiting === "own" && targetInstanceId !== undefined) chosenOwn = targetInstanceId
        if (action.awaiting === "opponent" && targetInstanceId !== undefined) chosenOpp = targetInstanceId

        if (chosenOwn === undefined) {
            requestChoice(
                state,
                owner,
                `${sourceName}：破壊するスピリットを選んでください`,
                allSpiritIds(),
                false,
                { ...action, awaiting: "own", ...(chosenOpp !== undefined ? { chosenOpp } : {}) },
                self,
            )
            return
        }
        if (chosenOpp === undefined) {
            requestChoice(
                state,
                opp,
                `${sourceName}：破壊するスピリットを選んでください`,
                allSpiritIds(),
                false,
                { ...action, awaiting: "opponent", chosenOwn },
                self,
            )
            // 選ぶのは相手だが、実行者は発生源の持ち主のまま（destroyAllExceptChosenColorsと同じ）
            if (state.pendingChoice) state.pendingChoice.actorPid = owner
            return
        }
    } else {
        // 非対話時：各プレイヤーが「相手フィールドの実効BP最大」を自動選択する
        // （プレイヤー選択の決定的簡略化。pickEnemyByBpと同じ考え方。相手フィールドが空なら自分フィールドから選ぶ）
        const pickMaxBp = (fromPid: PlayerId, viewerPid: PlayerId): string | undefined => {
            const spirits = state.players[fromPid].field.spirits
            if (spirits.length === 0) return undefined
            return spirits.reduce((best, s) =>
                effectiveBp(state, fromPid, s) > effectiveBp(state, fromPid, best) ? s : best,
            ).instanceId
        }
        if (chosenOwn === undefined) chosenOwn = pickMaxBp(opp, owner) ?? pickMaxBp(owner, owner)
        if (chosenOpp === undefined) chosenOpp = pickMaxBp(owner, opp) ?? pickMaxBp(opp, opp)
    }

    const destroyedIds = new Set<string>()
    for (const id of [chosenOwn, chosenOpp]) {
        if (id === undefined || destroyedIds.has(id)) continue
        const found = findSpiritAny(state, id)
        if (!found) continue
        destroyedIds.add(id)
        destroySpirit(state, found.pid, found.inst.instanceId, "destroy")
    }
    if (destroyedIds.size === 0) log(state, `${sourceName}：対象がいなかった。`)
    return
}

const handlers = {
    destroy: destroyHandler,
    mutualDestroyChoice: mutualDestroyChoiceHandler,
    destroyAll: destroyAllHandler,
    destroyAllExceptChosenColors: destroyAllExceptChosenColorsHandler,
    destroyAllNexusesExceptChosenColors: destroyAllNexusesExceptChosenColorsHandler,
    destroyNexus: destroyNexusHandler,
    destroyExhausted: destroyExhaustedHandler,
    destroyByCostBudget: destroyByCostBudgetHandler,
    destroyOwnByCost: destroyOwnByCostHandler,
    destroySelf: destroySelfHandler,
    destroyAllNexusesWithCores: destroyAllNexusesWithCoresHandler,
    nexusCoresToTrash: nexusCoresToTrashHandler,
    sacrificeNexusThenWipeEnemyNexusCores: sacrificeNexusThenWipeEnemyNexusCoresHandler,
    returnNexusToHand: returnNexusToHandHandler,
    reviveLastDestroyedNexus: reviveLastDestroyedNexusHandler,
} satisfies Partial<ActionRegistry>

export default handlers
