import type { ActionHandler, ActionRegistry } from "./types"
import type { Color } from "../../type"
import { getCard, log, suspend } from "../GameState"
import { summonFreeFromTrashIndex, destroySpirit, payCost, notifyHandGained, requestCardChoice, requestChoice, resolveMagic, tryInteractiveCardChoice } from "../EffectModules"
import { KEYWORDS, cardHasColor, effectiveBp, spiritHasKeyword, hasGlobalConstraint, hasKeyword, opponentCantReturnFromTrashToHand, isTrashCardProtected, isVanillaCard, trashCardNameMatches } from "../../../../shared/rules"
import { effectiveCost } from "../../../../shared/cost"
import { COLOR_LABELS } from "../../../../data/constants"
import { countedAmount } from "../counted"

// トラッシュにあって「デッキの下に戻せる」スピリットカードの枚数
function countChoosableTrashSpirits(trashCards: string[]): number {
    return trashCards.filter((id) => getCard(id).type === "spirit" && !isTrashCardProtected(id)).length
}

const trashSpiritsToDeckBottomHandler: ActionHandler<"trashSpiritsToDeckBottom"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        // トリックプランク：自分のトラッシュにあるスピリットカードをcount枚、**好きな順番で**デッキの下へ。
        // 対話では1枚ずつ選ばせ、**選んだ順**に積む（PROCEDURES_AUDIT §5 Q4）
        const player = state.players[owner]
        // ⚠️ **選び終わるまでトラッシュから抜かない**（インデックスで控える）。
        // 途中で抜くと「どのゾーンにも無いカード」ができ、保存則の検査に引っかかる
        const picked = action.pickedIndices ?? []
        if (chosenCardIndex !== undefined) {
            const next = [...picked, chosenCardIndex]
            if (next.length < action.count && next.length < countChoosableTrashSpirits(player.trashCards)) {
                ctx.resolve({ ...action, pickedIndices: next })
                return
            }
            // 選んだ順のまま、まとめてデッキの下へ（インデックスの大きい方から抜くとずれない）
            const movedIds = next.map((j) => player.trashCards[j]!)
            for (const j of [...next].sort((a, b) => b - a)) player.trashCards.splice(j, 1)
            for (const id of movedIds) player.deck.push(id)
            log(
                state,
                `${player.name}はトラッシュの「${movedIds.map((id) => getCard(id).name).join("、")}」をデッキの下に戻した。`,
            )
            return
        }
        const choosable = player.trashCards
            .map((id, j) => ({ id, j }))
            .filter(({ id, j }) => getCard(id).type === "spirit" && !isTrashCardProtected(id) && !picked.includes(j))
            .map(({ j }) => j)
        if (
            tryInteractiveCardChoice(
                state,
                owner,
                self,
                `${sourceName}：デッキの下に戻すスピリットカードを選んでください（${picked.length + 1}/${action.count}枚目）`,
                "trash",
                choosable,
                { ...action, pickedIndices: picked },
                null,
            )
        ) {
            return
        }
        // 非対話（テスト・AI）と候補1枚のとき：末尾（新しい方）からその順で戻す。
        // 既に選んだぶん（picked）が先、そのあとに自動で拾ったぶんが続く
        const indices: number[] = []
        for (let j = player.trashCards.length - 1; j >= 0 && picked.length + indices.length < action.count; j--) {
            const id = player.trashCards[j]!
            if (getCard(id).type === "spirit" && !isTrashCardProtected(id) && !picked.includes(j)) indices.push(j)
        }
        if (indices.length === 0 && picked.length === 0) {
            log(state, `${sourceName}：トラッシュにスピリットカードがなかった。`)
            return
        }
        const order = [...picked, ...indices]
        const movedIds = order.map((j) => player.trashCards[j]!)
        for (const j of [...order].sort((a, b) => b - a)) player.trashCards.splice(j, 1)
        for (const id of movedIds) player.deck.push(id)
        log(
            state,
            `${player.name}はトラッシュの「${movedIds.map((id) => getCard(id).name).join("、")}」をデッキの下に戻した。`,
        )
        return
}

// BS15-082神閃月下：trashSpiritsToDeckBottomの汎用版（カード種別を問わない。「count枚まで」＝
// 好きな枚数でよいが、trashSpiritsToDeckBottomと同じく「候補が尽きるまで選ばせる」簡略化で実装する。
// 途中でやめる専用UI（クリックで番号付与→取り消しで詰め直し）は見送った＝要確認）
const trashCardsToDeckBottomHandler: ActionHandler<"trashCardsToDeckBottom"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        const player = state.players[owner]
        const picked = action.pickedIndices ?? []
        const remainingChoosable = (excludeIndices: number[]): number[] =>
            player.trashCards
                .map((id, j) => ({ id, j }))
                .filter(({ id, j }) => !isTrashCardProtected(id) && !excludeIndices.includes(j))
                .map(({ j }) => j)
        if (chosenCardIndex !== undefined) {
            const next = [...picked, chosenCardIndex]
            if (next.length < action.count && remainingChoosable(next).length > 0) {
                ctx.resolve({ ...action, pickedIndices: next })
                return
            }
            const movedIds = next.map((j) => player.trashCards[j]!)
            for (const j of [...next].sort((a, b) => b - a)) player.trashCards.splice(j, 1)
            for (const id of movedIds) player.deck.push(id)
            log(
                state,
                `${player.name}はトラッシュの「${movedIds.map((id) => getCard(id).name).join("、")}」をデッキの下に戻した。`,
            )
            return
        }
        const choosable = remainingChoosable(picked)
        if (
            tryInteractiveCardChoice(
                state,
                owner,
                self,
                `${sourceName}：デッキの下に戻すカードを選んでください（${picked.length + 1}/${action.count}枚まで）`,
                "trash",
                choosable,
                { ...action, pickedIndices: picked },
                null,
            )
        ) {
            return
        }
        // 非対話：末尾（新しい方）からcount枚まで戻す
        const indices: number[] = []
        for (let j = player.trashCards.length - 1; j >= 0 && picked.length + indices.length < action.count; j--) {
            if (!isTrashCardProtected(player.trashCards[j]!) && !picked.includes(j)) indices.push(j)
        }
        const order = [...picked, ...indices]
        if (order.length === 0) {
            log(state, `${sourceName}：トラッシュに戻せるカードがなかった。`)
            return
        }
        const movedIds = order.map((j) => player.trashCards[j]!)
        for (const j of [...order].sort((a, b) => b - a)) player.trashCards.splice(j, 1)
        for (const id of movedIds) player.deck.push(id)
        log(
            state,
            `${player.name}はトラッシュの「${movedIds.map((id) => getCard(id).name).join("、")}」をデッキの下に戻した。`,
        )
        return
}

// BS15-082神閃月下：自分のトラッシュにあるマジックカード1枚をデッキの上に戻す
const trashMagicToDeckTopHandler: ActionHandler<"trashMagicToDeckTop"> = (ctx) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        const player = state.players[owner]
        if (chosenCardIndex !== undefined) {
            const cardId = player.trashCards[chosenCardIndex]
            if (cardId === undefined) return
            player.trashCards.splice(chosenCardIndex, 1)
            player.deck.unshift(cardId)
            log(state, `${player.name}はトラッシュの「${getCard(cardId).name}」をデッキの上に戻した。`)
            return
        }
        const choosable = player.trashCards
            .map((id, j) => ({ id, j }))
            .filter(({ id }) => getCard(id).type === "magic" && !isTrashCardProtected(id))
            .map(({ j }) => j)
        if (
            tryInteractiveCardChoice(
                state,
                owner,
                self,
                `${sourceName}：デッキの上に戻すマジックカードを選んでください`,
                "trash",
                choosable,
                { type: "trashMagicToDeckTop" },
                null,
            )
        ) {
            return
        }
        if (choosable.length === 0) {
            log(state, `${sourceName}：トラッシュにマジックカードがなかった。`)
            return
        }
        const j = choosable[choosable.length - 1]!
        const cardId = player.trashCards[j]!
        player.trashCards.splice(j, 1)
        player.deck.unshift(cardId)
        log(state, `${player.name}はトラッシュの「${getCard(cardId).name}」をデッキの上に戻した。`)
        return
}

const recoverSpiritFromTrashHandler: ActionHandler<"recoverSpiritFromTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 鎖縛の武舞台Lv1-2：お互い、トラッシュからカードを手札に戻せない
        if (hasGlobalConstraint(state, "noTrashRecovery") || opponentCantReturnFromTrashToHand(state, owner)) {
            log(state, `${sourceName}：トラッシュからカードを手札に戻せないため発動しなかった。`)
            return
        }
        // countCounter指定時はcount×EffectCounterの値を戻す枚数として使う（BS12-X02魔羯邪神シュタイン・ボルグ）。
        // 一度だけ解決し、countCounterを落としたactionへ入り直す（coreRemove.countCounterと同じ考え方）
        if (action.countCounter !== undefined) {
            const resolvedCount = countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType)
            if (resolvedCount === 0) {
                log(state, `${sourceName}のスピリット回収：カウントが0のため発動しなかった。`)
                return
            }
            const { countCounter: _cc, ...rest } = action
            ctx.resolve({ ...rest, count: resolvedCount })
            return
        }
        // interactiveTargets時は選択式（選択者=使用者。cardZone:"trash"）
        const player = state.players[owner]
        // BS07ドラグロン占術師：手札に戻したカードが指定系統のときだけ、続けて相手1体を破壊する。
        // トラッシュのカードが対象なのでカード静的な family で判定する（回収条件の familyOk と同じ扱い）
        const followUp = (recoveredIds: string[]): void => {
            // 「ドローしないことで」（BS07常闇の聖堂Lv2）：ドロー自体が支払い。
            // **実際に手札へ戻せたときだけ**支払う（対象がいなくて不発なら、ドローはそのまま行う）。
            // ドローより前に発火する区間（step.beforeDraw）から呼ばれるので、この後の区間が引かずに進む
            if (action.costSkipDraw && recoveredIds.length > 0) state.drawStepSkipped = true
            const spec = action.thenDestroyIfFamily
            if (spec === undefined) return
            const wanted = Array.isArray(spec.family) ? spec.family : [spec.family]
            const hit = recoveredIds.some((id) => wanted.some((f) => getCard(id).family.includes(f)))
            if (!hit) return
            ctx.resolve({ type: "destroy", filter: { maxBp: spec.maxBp }, count: 1 })
        }
        // familyFilter 指定時はその系統（配列＝OR）を持つスピリットカードのみ対象。
        // トラッシュのカードが対象のため、判定はカード静的な family で行う（BS04鋼葉の樹林＝甲獣）
        const familyOk = (cardId: string): boolean => {
            if (action.familyFilter === undefined) return true
            const wanted = Array.isArray(action.familyFilter)
                ? action.familyFilter
                : [action.familyFilter]
            return wanted.some((f) => getCard(cardId).family.includes(f))
        }
        // keywordFilter（BS08ターンインフェルノ＝【転召】持ち）：トラッシュのカードが対象なので
        // カード静的なキーワード保有（hasKeyword）で判定する。
        // keywordFilterAny（BS13-015冥総裁ハーゲン＝【呪撃】/【不死】）はいずれか1つ持てばよいOR判定
        const keywordOk = (cardId: string): boolean =>
            (action.keywordFilter === undefined || hasKeyword(cardId, action.keywordFilter)) &&
            (action.keywordFilterAny === undefined || action.keywordFilterAny.some((kw) => hasKeyword(cardId, kw)))
        // nameIncludes（BS08アルカナクィーン・パラス＝「アルカナ」）：トラッシュのカードが対象なので
        // カード静的な名前（cardId基準。trashNameAsによる別名も一致する）で判定する
        const nameOk = (cardId: string): boolean =>
            action.nameIncludes === undefined || trashCardNameMatches(cardId, action.nameIncludes)
        // colorFilter（BS09-015獄獣ガシャベルスLv3＝黄）：トラッシュのカードが対象なので
        // カード静的な colors で判定する（多色カードはいずれかが一致すればよい）
        const colorOk = (cardId: string): boolean =>
            action.colorFilter === undefined || getCard(cardId).colors.includes(action.colorFilter)
        // includeBraves指定時はブレイヴカードも対象に含める（BS10-006ヤシウム：「スピリットカード/ブレイヴカード」）。
        // bravesOnly指定時はスピリットカードでなく**ブレイヴカードだけ**が対象（BS10-100ブレイヴセメタリー：「ブレイヴカード」）
        const typeOk = (cardId: string): boolean => {
            if (action.anyCardType) return true // BS12-X02：「紫のカード」＝種別を問わない
            // bravesAnyOrSpiritColorFilter（BS14-092烈光閃刃：「ブレイヴカード1枚か、赤のスピリットカード1枚」）：
            // OR判定なのでtypeOkは通し、braveOrColorOkのほうで絞る
            if (action.bravesAnyOrSpiritColorFilter !== undefined) return true
            const t = getCard(cardId).type
            if (action.bravesOnly) return t === "brave"
            return t === "spirit" || (action.includeBraves === true && t === "brave")
        }
        // bravesAnyOrSpiritColorFilter：ブレイヴカード（色問わず）OR 指定色のスピリットカード。
        // typeOk側でスピリット/ブレイヴ以外（ネクサス/マジック）は素通りしてしまうため、ここで種別自体も見る
        const braveOrColorOk = (cardId: string): boolean => {
            if (action.bravesAnyOrSpiritColorFilter === undefined) return true
            const card = getCard(cardId)
            if (card.type === "brave") return true
            return card.type === "spirit" && card.colors.includes(action.bravesAnyOrSpiritColorFilter)
        }
        // vanillaFilter（BS10-082六分儀天文台：「効果の記述を持たないスピリットカード」）：
        // トラッシュのカードが対象なのでカード静的な isVanillaCard で判定する
        const vanillaOk = (cardId: string): boolean =>
            action.vanillaFilter !== true || isVanillaCard(getCard(cardId))
        // costFilter（BS11-051 イビル・フィッシャー＝コスト6以下）：トラッシュのカードが対象なので
        // カード静的なコストで判定する（フィールドの一時的なコスト修正は関係しない）
        const costOk = (cardId: string): boolean => {
            if (action.costFilter === undefined) return true
            const cost = getCard(cardId).cost
            return (
                (action.costFilter.max === undefined || cost <= action.costFilter.max) &&
                (action.costFilter.min === undefined || cost >= action.costFilter.min)
            )
        }
        // costAtMostOrHasBurst（BS14-005ヒノシシ：「コスト4以下のスピリットカード1枚か、バースト効果を持つスピリットカード1枚」）：
        // コスト条件とバースト所持のOR判定
        const costOrBurstOk = (cardId: string): boolean =>
            action.costAtMostOrHasBurst === undefined ||
            getCard(cardId).cost <= action.costAtMostOrHasBurst ||
            getCard(cardId).effects.some((e) => e.kind === "burst")
        // excludeBurst（BS16-055アームストロンガー）：kind:"burst"エントリを持つカードを除外する
        const burstExcludeOk = (cardId: string): boolean =>
            !action.excludeBurst || !getCard(cardId).effects.some((e) => e.kind === "burst")
        const isRecoverable = (cardId: string): boolean =>
            typeOk(cardId) && braveOrColorOk(cardId) && familyOk(cardId) && keywordOk(cardId) && nameOk(cardId) && colorOk(cardId) && vanillaOk(cardId) &&
            costOk(cardId) && costOrBurstOk(cardId) && burstExcludeOk(cardId) && !isTrashCardProtected(cardId)
        // BS07ブリュナグオン：【呪撃】を持つ自分のスピリット1体を破壊することがコスト。
        // 払えなければ何も起きない。**何を犠牲にするかは候補2体以上ならプレイヤーが選ぶ**（COST_MODEL.md §2）。
        // 選ばせたあとは costDestroyOwnKeyword を落とした action で入り直し、二重に払わないようにする
        // （exhaust の chooserIsTarget と同じ「解決済みの軸を落として再入する」書き方）
        if (action.costDestroyOwnKeyword !== undefined && chosenCardIndex === undefined) {
            const kw = action.costDestroyOwnKeyword
            const candidates = player.field.spirits.filter((sp) => spiritHasKeyword(state, owner, sp, kw))
            if (candidates.length === 0) {
                log(state, `${sourceName}：【${KEYWORDS[kw].label}】を持つ自分のスピリットがいないため発動しなかった。`)
                return
            }
            // B（トラッシュから戻せるカード）が無ければ発揮できない（COST_MODEL.md §1）。
            // 以前は先に自分のスピリットを破壊してからトラッシュを見ていたため、払い損になっていた
            if (!player.trashCards.some(isRecoverable)) {
                log(state, `${sourceName}：トラッシュに戻せるスピリットカードがないため発動しなかった。`)
                return
            }
            const { costDestroyOwnKeyword: _paid, costSacrificeChosen: _flag, ...rest } = action
            if (action.costSacrificeChosen && targetInstanceId !== undefined) {
                const chosen = candidates.find((sp) => sp.instanceId === targetInstanceId)
                if (!chosen) {
                    log(state, `${sourceName}：指定されたスピリットはコストにできなかった。`)
                    return
                }
                log(state, `${player.name}は${sourceName}のコストとして${getCard(chosen.cardId).name}を破壊した。`)
                destroySpirit(state, owner, chosen.instanceId, "destroy", { sourcePid: owner })
                ctx.resolve(rest)
                return
            }
            if (state.interactiveTargets && candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コストとして破壊する自分のスピリットを選んでください`,
                    candidates.map((sp) => sp.instanceId),
                    false,
                    { ...action, costSacrificeChosen: true },
                    self,
                )
                return
            }
            // 非対話・候補1体：実効BP最小を自動選択（犠牲を最小化する決定的簡略化）
            const victim = candidates.reduce((min, sp) =>
                effectiveBp(state, owner, sp) < effectiveBp(state, owner, min) ? sp : min,
            )
            destroySpirit(state, owner, victim.instanceId, "destroy", { sourcePid: owner })
        }
        if (chosenCardIndex !== undefined) {
            const cardId = player.trashCards[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}のスピリット回収：対象がいなかった。`)
                return
            }
            player.trashCards.splice(chosenCardIndex, 1)
            player.hand.push(cardId)
            log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
            notifyHandGained(state, owner, 1)
            followUp([cardId])
            return
        }
        // costBudget指定時はcountを無視し、summonFromTrashFree.costBudgetと同じ貪欲選択
        // （コスト最大から順に、合計がbudget以下になる範囲で好きなだけ）で複数枚を手札に戻す
        // （BS12-016骸巨人ギ・ガッシャ：系統「無魔」をコスト合計13まで）
        if (action.costBudget !== undefined) {
            let remaining = action.costBudget
            const recoveredIds: string[] = []
            for (;;) {
                let bestIdx = -1
                let bestCost = -1
                for (let j = 0; j < player.trashCards.length; j++) {
                    const id = player.trashCards[j]!
                    if (!isRecoverable(id)) continue
                    const cost = getCard(id).cost
                    if (cost <= remaining && cost > bestCost) {
                        bestIdx = j
                        bestCost = cost
                    }
                }
                if (bestIdx === -1) break
                const cardId = player.trashCards[bestIdx]!
                player.trashCards.splice(bestIdx, 1)
                player.hand.push(cardId)
                recoveredIds.push(cardId)
                remaining -= bestCost
            }
            if (recoveredIds.length === 0) {
                log(state, `${sourceName}のスピリット回収：トラッシュに対象がいなかった。`)
                return
            }
            log(
                state,
                `${player.name}は「${recoveredIds.map((id) => getCard(id).name).join("、")}」をトラッシュから手札に戻した。`,
            )
            notifyHandGained(state, owner, recoveredIds.length)
            followUp(recoveredIds)
            return
        }
        // all指定時はcountを無視し、該当カードすべてを手札に戻す（BS03ネクロマンシー：系統「無魔」すべて）
        if (action.all) {
            const indices: number[] = []
            for (let j = 0; j < player.trashCards.length; j++) {
                if (isRecoverable(player.trashCards[j]!)) indices.push(j)
            }
            if (indices.length === 0) {
                log(state, `${sourceName}のスピリット回収：トラッシュに対象がいなかった。`)
                return
            }
            const recoveredIds = indices.map((j) => player.trashCards[j]!)
            // インデックスが大きい順に取り除く（splice時のズレを防ぐ）
            for (let k = indices.length - 1; k >= 0; k--) {
                player.trashCards.splice(indices[k]!, 1)
            }
            player.hand.push(...recoveredIds)
            log(
                state,
                `${player.name}は「${recoveredIds.map((id) => getCard(id).name).join("、")}」をトラッシュから手札に戻した。`,
            )
            notifyHandGained(state, owner, recoveredIds.length)
            followUp(recoveredIds)
            return
        }
        if (state.interactiveTargets) {
            const indices = player.trashCards
                .map((id, i) => ({ id, i }))
                .filter(({ id }) => isRecoverable(id))
                .map(({ i }) => i)
            if (
                tryInteractiveCardChoice(
                    state,
                    owner,
                    self,
                    `${sourceName}のスピリット回収：手札に戻すカードを選んでください`,
                    "trash",
                    indices,
                    { ...action, count: 1 },
                    action.count > 1 ? { ...action, count: action.count - 1 } : null,
                )
            ) {
                return
            }
        }
        // 既存の決定的自動選択：トラッシュの末尾（新しい方）からスピリットカードを探して
        // count枚手札に戻す（本来は好きな1枚を選べるが、決定的な自動選択で簡略化）
        let recovered = 0
        const recoveredIds: string[] = []
        for (let i = 0; i < action.count; i++) {
            let idx = -1
            for (let j = player.trashCards.length - 1; j >= 0; j--) {
                if (isRecoverable(player.trashCards[j]!)) {
                    idx = j
                    break
                }
            }
            if (idx === -1) {
                log(state, `${sourceName}のスピリット回収：トラッシュに対象がいなかった。`)
                break
            }
            const cardId = player.trashCards[idx]!
            player.trashCards.splice(idx, 1)
            player.hand.push(cardId)
            recovered++
            recoveredIds.push(cardId)
            log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
        }
        notifyHandGained(state, owner, recovered)
        followUp(recoveredIds)
        return
}

const recoverMagicFromTrashHandler: ActionHandler<"recoverMagicFromTrash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 鎖縛の武舞台Lv1-2：お互い、トラッシュからカードを手札に戻せない
        if (hasGlobalConstraint(state, "noTrashRecovery") || opponentCantReturnFromTrashToHand(state, owner)) {
            log(state, `${sourceName}：トラッシュからカードを手札に戻せないため発動しなかった。`)
            return
        }
        // interactiveTargets時は選択式（選択者=使用者。cardZone:"trash"）
        const player = state.players[owner]
        // colors（BS09-039探偵ペンタン＝紫／BS09-043クロックダイル＝紫・黄）：
        // トラッシュのカードが対象なのでカード静的な colors で判定する（配列＝いずれかでOR）。
        // anyCardType指定時はマジック限定を外す（hasBurstと組み合わせてカード種別を問わない回収に使う。
        // SD06-014爆烈十紋刃：「自分のトラッシュにあるバースト効果を持つカード1枚を手札に戻す」）。
        // hasBurst指定時はkind:"burst"エントリを持つカードだけが対象
        const magicOk = (cardId: string): boolean =>
            (action.anyCardType === true || getCard(cardId).type === "magic") &&
            (action.colors === undefined || action.colors.some((c) => getCard(cardId).colors.includes(c))) &&
            (action.hasBurst !== true || getCard(cardId).effects.some((e) => e.kind === "burst")) &&
            // onlyBurstDestroyedCard：バースト発動のきっかけになった破壊で落ちたカードだけ。
            // burst.destroyedAsTarget が targetInstanceId の枠に cardId を入れてくる（BS14-103）
            (action.onlyBurstDestroyedCard !== true || cardId === targetInstanceId) &&
            !isTrashCardProtected(cardId)
        // costDiscardOwnBurst（BS15-044天使サクエル）：自分のバースト1つを破棄することがコスト。
        // 対象条件を満たすカードが1枚も無ければコストも払わない（COST_MODEL.md §1）
        if (action.costDiscardOwnBurst) {
            if (player.burst === null) {
                log(state, `${sourceName}：セットしているバーストがないため発動しなかった。`)
                return
            }
            if (!player.trashCards.some((id) => magicOk(id))) {
                log(state, `${sourceName}：対象がいないため発動しなかった。`)
                return
            }
            player.trashCards.push(player.burst)
            player.burst = null
            player.burstSet = false
            log(state, `${player.name}は${sourceName}のコストとして自分のバーストを破棄した。`)
            const { costDiscardOwnBurst: _cdob, ...rest } = action
            ctx.resolve(rest)
            return
        }
        if (chosenCardIndex !== undefined) {
            const cardId = player.trashCards[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}のマジック回収：対象がいなかった。`)
                return
            }
            player.trashCards.splice(chosenCardIndex, 1)
            player.hand.push(cardId)
            log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
            notifyHandGained(state, owner, 1)
            return
        }
        if (state.interactiveTargets) {
            const indices = player.trashCards
                .map((id, i) => ({ id, i }))
                .filter(({ id }) => magicOk(id))
                .map(({ i }) => i)
            if (indices.length >= 2) {
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}のマジック回収：手札に戻すカードを選んでください`,
                    "trash",
                    indices,
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 既存の決定的自動選択：トラッシュの末尾（新しい方）からマジックカードを探して
        // 1枚手札に戻す（recoverSpiritFromTrashと同じ考え方。本来は好きな1枚を選べるが
        // 決定的な自動選択で簡略化）
        let idx = -1
        for (let j = player.trashCards.length - 1; j >= 0; j--) {
            if (magicOk(player.trashCards[j]!)) {
                idx = j
                break
            }
        }
        if (idx === -1) {
            log(state, `${sourceName}のマジック回収：トラッシュに対象がいなかった。`)
            return
        }
        const cardId = player.trashCards[idx]!
        player.trashCards.splice(idx, 1)
        player.hand.push(cardId)
        log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
        notifyHandGained(state, owner, 1)
        return
}

// recoverMagicFromTrashHandlerのネクサス版（BS10-112ネクサスエクステンション：「その後、自分のトラッシュにある
// ネクサスカード1枚を手札に戻す」）。同じマジックの前半でdeployNexusが既に1枚トラッシュから取り除いた後に
// 呼ばれる想定で、末尾（新しい方）から探すのは同じ考え方
const recoverNexusFromTrashHandler: ActionHandler<"recoverNexusFromTrash"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        if (hasGlobalConstraint(state, "noTrashRecovery") || opponentCantReturnFromTrashToHand(state, owner)) {
            log(state, `${sourceName}：トラッシュからカードを手札に戻せないため発動しなかった。`)
            return
        }
        const player = state.players[owner]
        const nexusOk = (cardId: string): boolean =>
            getCard(cardId).type === "nexus" &&
            (action.colors === undefined || action.colors.some((c) => getCard(cardId).colors.includes(c))) &&
            !isTrashCardProtected(cardId)
        if (chosenCardIndex !== undefined) {
            const cardId = player.trashCards[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}のネクサス回収：対象がいなかった。`)
                return
            }
            player.trashCards.splice(chosenCardIndex, 1)
            player.hand.push(cardId)
            log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
            notifyHandGained(state, owner, 1)
            return
        }
        if (state.interactiveTargets) {
            const indices = player.trashCards
                .map((id, i) => ({ id, i }))
                .filter(({ id }) => nexusOk(id))
                .map(({ i }) => i)
            if (indices.length >= 2) {
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}のネクサス回収：手札に戻すカードを選んでください`,
                    "trash",
                    indices,
                    false,
                    action,
                    self,
                )
                return
            }
        }
        let idx = -1
        for (let j = player.trashCards.length - 1; j >= 0; j--) {
            if (nexusOk(player.trashCards[j]!)) {
                idx = j
                break
            }
        }
        if (idx === -1) {
            log(state, `${sourceName}のネクサス回収：トラッシュに対象がいなかった。`)
            return
        }
        const cardId = player.trashCards[idx]!
        player.trashCards.splice(idx, 1)
        player.hand.push(cardId)
        log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
        notifyHandGained(state, owner, 1)
        return
}

// トラッシュにある指定色のマジックカード1枚を、手札にあるときと同様にコストを支払って使用する
// （BS08堕天使ミカファールLv2-3）。フィールドのコアは使えずリザーブのみで支払う簡略化
const castMagicFromTrashByColorHandler: ActionHandler<"castMagicFromTrashByColor"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        const player = state.players[owner]
        const isEligible = (cardId: string): boolean => {
            const cardData = getCard(cardId)
            return (
                cardData.type === "magic" &&
                (action.colorFilter === undefined || cardHasColor(cardData, action.colorFilter)) &&
                !isTrashCardProtected(cardId)
            )
        }
        const perform = (idx: number): void => {
            const cardId = player.trashCards[idx]
            if (cardId === undefined) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            const card = getCard(cardId)
            const cost = effectiveCost(state, owner, card)
            // 支払い元はリザーブ＋**フィールドのスピリット/ネクサス上のコア**（手札から使うときと同じ。
            // 2026-08-24 ユーザー確認。以前はリザーブ限定で、かつ支払ったコアがトラッシュへ行かず消えていた）
            const fromField = (ctx.paySources ?? []).reduce((sum, src) => {
                const inst =
                    player.field.spirits.find((i) => i.instanceId === src.instanceId) ??
                    player.field.nexuses.find((i) => i.instanceId === src.instanceId)
                return sum + Math.min(Math.max(0, src.count), inst?.cores ?? 0)
            }, 0)
            if (player.reserve + fromField < cost) {
                log(state, `${sourceName}：${card.name}のコストを支払えないため発動しなかった。`)
                return
            }
            player.trashCards.splice(idx, 1)
            payCost(state, owner, cost, ctx.paySources)
            player.trashCards.push(cardId)
            log(state, `${player.name}はトラッシュの${card.name}を手札にあるときと同様に使用した。（コスト${cost}）`)
            state.magicUsedThisTurn[owner] = (state.magicUsedThisTurn[owner] ?? 0) + 1
            const hasMain = card.effects.some((e) => e.kind === "magic" && e.timing === "main")
            const timing: "main" | "flash" = state.battle ? "flash" : hasMain ? "main" : "flash"
            // マジックミラー用の記録（GameEngine.doCastMagicと同じ理由でresolveMagicの後にする。
            // 解決中に書き換わっていれば（トラッシュから使ったカード自身がマジックミラーだった場合）上書きしない）
            const beforeLastMagicCast = state.lastMagicCast
            resolveMagic(state, owner, cardId, timing)
            if (state.lastMagicCast === beforeLastMagicCast) {
                state.lastMagicCast = { pid: owner, cardId, timing }
            }
        }
        if (chosenCardIndex !== undefined) {
            perform(chosenCardIndex)
            return
        }
        if (state.interactiveTargets) {
            const indices = player.trashCards
                .map((id, i) => ({ id, i }))
                .filter(({ id }) => isEligible(id))
                .map(({ i }) => i)
            if (indices.length === 0) {
                log(state, `${sourceName}：トラッシュに対象がいなかった。`)
                return
            }
            requestCardChoice(
                state,
                owner,
                `${sourceName}：トラッシュから使用するマジックを選んでください（選ばなければ発動しません）`,
                "trash",
                indices,
                true,
                action,
                self,
                // 候補が1枚でも必ず聞く。「使用できる」＝任意なので断れる必要があり、
                // さらに**支払い元（フィールドのコア）を選ぶ機会**がここでしか作れない（2026-08-24）
                true,
            )
            return
        }
        // 非interactive時：コストを支払える中で最もコストが高いものを自動選択（決定的簡略化）
        let bestIdx = -1
        let bestCost = -1
        for (let i = 0; i < player.trashCards.length; i++) {
            const cardId = player.trashCards[i]!
            if (!isEligible(cardId)) continue
            const cost = effectiveCost(state, owner, getCard(cardId))
            if (cost <= player.reserve && cost > bestCost) {
                bestCost = cost
                bestIdx = i
            }
        }
        if (bestIdx === -1) {
            log(state, `${sourceName}：トラッシュに対象がいなかった。`)
            return
        }
        perform(bestIdx)
}

const recoverAllMagicFromTrashByColorChoiceHandler: ActionHandler<"recoverAllMagicFromTrashByColorChoice"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenOption } = ctx
        // 鎖縛の武舞台Lv1-2：お互い、トラッシュからカードを手札に戻せない
        if (hasGlobalConstraint(state, "noTrashRecovery") || opponentCantReturnFromTrashToHand(state, owner)) {
            log(state, `${sourceName}：トラッシュからカードを手札に戻せないため発動しなかった。`)
            return
        }
        // 大天使ヴァリエル：緑/黄から1色を指定し、自分のトラッシュにある指定色のマジックカードすべてを手札に戻す
        const player = state.players[owner]
        const recoverColor = (color: Color): void => {
            const indices: number[] = []
            for (let i = 0; i < player.trashCards.length; i++) {
                const id = player.trashCards[i]!
                const c = getCard(id)
                if (c.type === "magic" && cardHasColor(c, color) && !isTrashCardProtected(id)) indices.push(i)
            }
            if (indices.length === 0) {
                log(state, `${sourceName}：色「${COLOR_LABELS[color]}」のマジックカードがトラッシュになかった。`)
                return
            }
            const names: string[] = []
            // 後ろのインデックスから順に取り除く（spliceでインデックスがずれないように）
            for (let i = indices.length - 1; i >= 0; i--) {
                const idx = indices[i]!
                const cardId = player.trashCards[idx]!
                player.trashCards.splice(idx, 1)
                player.hand.push(cardId)
                names.unshift(getCard(cardId).name)
            }
            log(
                state,
                `${player.name}は色「${COLOR_LABELS[color]}」のマジックカード「${names.join("、")}」をトラッシュから手札に戻した。`,
            )
            notifyHandGained(state, owner, names.length)
        }
        if (chosenOption !== undefined) {
            const entry = (Object.entries(COLOR_LABELS) as [Color, string][]).find(
                ([, label]) => label === chosenOption,
            )
            if (entry) recoverColor(entry[0])
            return
        }
        // 候補色（action.colorsのうちトラッシュに該当マジックがある色）を集計する
        const tally = new Map<Color, number>()
        for (const cardId of player.trashCards) {
            const c = getCard(cardId)
            if (c.type !== "magic") continue
            for (const color of action.colors) {
                if (cardHasColor(c, color)) tally.set(color, (tally.get(color) ?? 0) + 1)
            }
        }
        if (tally.size === 0) {
            log(state, `${sourceName}：対象の色のマジックカードがトラッシュになかった。`)
            return
        }
        if (state.interactiveTargets && tally.size > 1) {
            requestChoice(
                state,
                owner,
                `${sourceName}：色を1つ指定してください`,
                [],
                false,
                action,
                self,
                "option",
                [...tally.keys()].map((c) => COLOR_LABELS[c]),
            )
            return
        }
        // 非対話時（候補1色以下も含む）：該当枚数最多の色を自動選択（同数はaction.colorsの先頭を優先）
        let chosen: Color | null = null
        let best = 0
        for (const color of action.colors) {
            const count = tally.get(color) ?? 0
            if (count > best) {
                best = count
                chosen = color
            }
        }
        if (!chosen) {
            log(state, `${sourceName}：対象の色がなかった。`)
            return
        }
        recoverColor(chosen)
        return
}

// BS14-113退魔絶刀角：相手のトラッシュにあるカード1枚を相手のデッキの下に戻す（選ぶのは効果の使用者）。
// トラッシュはゾーンの持ち主＝相手なので、requestCardChoiceの汎用形（chooserPid=zoneOwnerの前提）に乗らず、
// PendingChoiceを直接組んでcardOwnerだけ相手にする（AI/クライアントはcardOwnerでゾーンを見る）
const opponentTrashCardToDeckBottomHandler: ActionHandler<"opponentTrashCardToDeckBottom"> = (ctx) => {
    const { state, owner, opp, self, sourceName, chosenCardIndex } = ctx
    const oppPlayer = state.players[opp]
    if (chosenCardIndex !== undefined) {
        const cardId = oppPlayer.trashCards[chosenCardIndex]
        if (cardId === undefined) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        oppPlayer.trashCards.splice(chosenCardIndex, 1)
        oppPlayer.deck.push(cardId)
        log(state, `${sourceName}：${oppPlayer.name}のトラッシュにあった${getCard(cardId).name}をデッキの下に戻した。`)
        return
    }
    if (oppPlayer.trashCards.length === 0) {
        log(state, `${sourceName}：${oppPlayer.name}のトラッシュにカードが無かった。`)
        return
    }
    if (state.interactiveTargets && oppPlayer.trashCards.length >= 2) {
        suspend(state, {
            pid: owner,
            kind: "card",
            prompt: `${sourceName}：デッキの下に戻すカードを選んでください`,
            candidates: [],
            cardZone: "trash",
            cardOwner: opp,
            cardIndices: oppPlayer.trashCards.map((_, i) => i),
            optional: false,
            action: { type: "opponentTrashCardToDeckBottom" },
            selfInstanceId: self ? self.instanceId : null,
        })
        return
    }
    // 非対話、または候補1枚：末尾（新しい方）を機械的に選ぶ
    const index = oppPlayer.trashCards.length - 1
    const cardId = oppPlayer.trashCards[index]!
    oppPlayer.trashCards.splice(index, 1)
    oppPlayer.deck.push(cardId)
    log(state, `${sourceName}：${oppPlayer.name}のトラッシュにあった${getCard(cardId).name}をデッキの下に戻した。`)
}

// BS08冥将アマイモン：自分のデッキを上から、指定系統を持つスピリットカードが出るまで（上限maxCount枚）破棄し、
// 出ればそのカード1枚を手札に戻す。デッキ切れ・上限到達まで出なければ手札には戻らない
// デッキを上から、指定コストのスピリットカードが出るまで破棄し（上限あり）、
// 出たらトラッシュからコストを支払わずに召喚する（BS11-038 天星馬ペガシーダ）
// kind:"trashSummonOnNameSummoned" の確認に「召喚する」と答えたときの解決（内部専用）
const summonFreeFromTrashIndexInternalHandler: ActionHandler<"summonFreeFromTrashIndexInternal"> = (ctx, action) => {
    const { state, owner } = ctx
    const cardId = state.players[owner].trashCards[action.trashIndex]
    if (cardId === undefined) return
    summonFreeFromTrashIndex(state, owner, getCard(cardId).name, action.trashIndex)
}

const handlers = {
    trashSpiritsToDeckBottom: trashSpiritsToDeckBottomHandler,
    trashCardsToDeckBottom: trashCardsToDeckBottomHandler,
    trashMagicToDeckTop: trashMagicToDeckTopHandler,
    recoverSpiritFromTrash: recoverSpiritFromTrashHandler,
    recoverMagicFromTrash: recoverMagicFromTrashHandler,
    recoverNexusFromTrash: recoverNexusFromTrashHandler,
    recoverAllMagicFromTrashByColorChoice: recoverAllMagicFromTrashByColorChoiceHandler,
    castMagicFromTrashByColor: castMagicFromTrashByColorHandler,
    opponentTrashCardToDeckBottom: opponentTrashCardToDeckBottomHandler,
    summonFreeFromTrashIndexInternal: summonFreeFromTrashIndexInternalHandler,
} satisfies Partial<ActionRegistry>

export default handlers
