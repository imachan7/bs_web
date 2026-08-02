// バトル進行・配置系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance } from "../../type"
import { clearBattle, createInstance, getCard, log, minLevelCores, opponentOf } from "../GameState"
import {
    emitEvent,
    findSpiritAny,
    fireFieldEventTriggers,
    fireTrigger,
    requestCardChoice,
    requestChoice,
    resolveKoboOnBattleEnd,
    summonFreeFromHandIndex,
    summonFreeFromTrashIndex,
} from "../EffectModules"
import { cardHasColor, effectiveBp, matchesCostFilter } from "../../../../shared/rules"
import { effectiveCost } from "../RuleValidator"

const endBattleHandler: ActionHandler<"endBattle"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (!state.battle) {
            log(state, `${sourceName}：バトルが発生していないため終了できなかった。`)
            return
        }
        log(state, `${sourceName}によって、行っていたバトルはただちに終了した。`)
        const endBattleAttackerPid = state.turnPlayer
        const endBattleAttacker = findSpiritAny(state, state.battle.attackerInstanceId)
        resolveKoboOnBattleEnd(state, endBattleAttackerPid, endBattleAttacker?.inst)
        clearBattle(state)
        return
}

const endAttackStepHandler: ActionHandler<"endAttackStep"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 妖機妃ソール：破壊時に相手ターンのアタックステップを終了させる（onlyOpponentTurn）。
        // 既存の endAttackStepAfterBattle フラグ（forceEndTurnIfFlagged）をそのまま再利用する。
        if (action.onlyOpponentTurn === true && owner === state.turnPlayer) {
            log(state, `${sourceName}：自分のターンなので終了しない。`)
            return
        }
        if (state.phase !== "attack") {
            log(state, `${sourceName}：アタックステップではないため終了しない。`)
            return
        }
        state.endAttackStepAfterBattle = true
        log(state, `${sourceName}：このターンのアタックステップを終了する。`)
        return
}

const endAttackStepAfterBattleHandler: ActionHandler<"endAttackStepAfterBattle"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // バトル中のみ有効：フラグを立て、バトル終了直後にターン終了処理側で強制実行する
        if (!state.battle) {
            log(state, `${sourceName}：バトルが発生していないため使用できなかった。`)
            return
        }
        state.endAttackStepAfterBattle = true
        log(
            state,
            `${sourceName}：このバトルが終了したとき、アタックステップを終了する。`,
        )
        return
}

const swapBattlerHandler: ActionHandler<"swapBattler"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // テレポートチェンジ：バトルしている自分のスピリット1体を、疲労状態の自分のスピリット1体と
        // 入れ替える。使用者（owner）がアタッカー側かブロッカー側かで入れ替え対象を判定する
        if (!state.battle) {
            log(state, `${sourceName}：バトルが発生していないため使用できなかった。`)
            return
        }
        const battleAttackerPid = state.turnPlayer
        const battleDefenderPid = opponentOf(battleAttackerPid)
        let swapSide: "attacker" | "blocker"
        let currentBattlerId: string
        if (owner === battleAttackerPid) {
            swapSide = "attacker"
            currentBattlerId = state.battle.attackerInstanceId
        } else if (owner === battleDefenderPid && state.battle.blockerInstanceId) {
            swapSide = "blocker"
            currentBattlerId = state.battle.blockerInstanceId
        } else {
            log(state, `${sourceName}：使用者がバトルに参加していないため使用できなかった。`)
            return
        }
        // pendingChoiceからの再突入：targetInstanceIdが選ばれた入れ替え先
        if (targetInstanceId !== undefined) {
            const replacement = state.players[owner].field.spirits.find(
                (s) => s.instanceId === targetInstanceId,
            )
            if (!replacement) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            if (swapSide === "attacker") {
                state.battle.attackerInstanceId = replacement.instanceId
            } else {
                state.battle.blockerInstanceId = replacement.instanceId
            }
            log(state, `${sourceName}：バトル中のスピリットを${getCard(replacement.cardId).name}と入れ替えた。`)
            return
        }
        const restedOwn = state.players[owner].field.spirits.filter(
            (s) => s.isRested && s.instanceId !== currentBattlerId,
        )
        if (state.interactiveTargets) {
            requestChoice(
                state,
                owner,
                `${sourceName}：入れ替える疲労状態のスピリットを選んでください`,
                restedOwn.map((s) => s.instanceId),
                false,
                action,
                self,
            )
            return
        }
        // 自動選択：実効BP最大の疲労状態のスピリット
        let best: CardInstance | undefined
        for (const s of restedOwn) {
            if (!best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best)) best = s
        }
        if (!best) {
            log(state, `${sourceName}：入れ替えられる疲労状態のスピリットがいなかった。`)
            return
        }
        if (swapSide === "attacker") {
            state.battle.attackerInstanceId = best.instanceId
        } else {
            state.battle.blockerInstanceId = best.instanceId
        }
        log(state, `${sourceName}：バトル中のスピリットを${getCard(best.cardId).name}と入れ替えた。`)
        return
}

const battleCompareByLevelHandler: ActionHandler<"battleCompareByLevel"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // エンジェルボイス：現在のバトルにフラグを立て、解決時にBPの代わりにLvを比較させる
        if (!state.battle) {
            log(state, `${sourceName}：バトル外のため不発。`)
            return
        }
        state.battle.compareByLevel = true
        log(state, `${sourceName}：バトル解決時、BPの代わりにLvを比較する。`)
        return
}

const lockFlashHandler: ActionHandler<"lockFlash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (!state.battle) {
            log(state, `${sourceName}：バトルが発生していないため使用できなかった。`)
            return
        }
        state.battle.flashLockedPlayer = opp
        log(
            state,
            `${sourceName}：このバトルの間、${state.players[opp].name}はフラッシュで手札のカードを使用できない。`,
        )
        return
}

const lifeCrushHandler: ActionHandler<"lifeCrush"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // カイザーアトラス皇帝：costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。
        // 足りればその数のコアをリザーブからボイドへ送ってから実行する（「〜することで」の任意コストは
        // 自動発動で簡略化。levelOverrideOpponentNexuses.costReserveToVoidと同じ方針）
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
        // 相手のライフのコアをリザーブへ（doTakeLife と同様の処理）。ライフ0以下で勝敗が決まる
        const player = state.players[opp]
        const dealt = Math.min(action.count, player.life)
        player.life -= dealt
        player.reserve += dealt
        log(
            state,
            `${sourceName}：${player.name}のライフからコア${dealt}個をリザーブに置いた。（残りライフ${player.life}）`,
        )
        if (dealt > 0) emitEvent(state, { type: "lifeDamage", pid: opp, amount: dealt })
        if (player.life <= 0 && !state.winner) {
            state.winner = owner
            log(state, `${state.players[owner].name}の勝利！`)
        } else if (dealt > 0) {
            // 相手（opp）から見て「相手（owner）によって自分のライフが減らされたとき」に該当（命の果実）
            fireFieldEventTriggers(state, opp, "ownLifeDamaged")
        }
        return
}

const deployNexusHandler: ActionHandler<"deployNexus"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 手札またはトラッシュから、指定色いずれかのネクサスカード1枚をコストを支払わずに
        // 自分のフィールドに配置する（スコルピード／白虎ハック／黒虎クロン。
        // 本来は「できる」＝任意発動だが、自動処理では常に発動する簡略化。
        // interactiveTargets時は選択式（選択者=使用者。cardZoneはfromに応じてhand/trash）
        const player = state.players[owner]
        const isMatch = (cardId: string): boolean => {
            const c = getCard(cardId)
            return c.type === "nexus" && action.colors.some((col) => cardHasColor(c, col))
        }
        const deployFromIndex = (idx: number): void => {
            const zone = action.from === "hand" ? player.hand : player.trashCards
            const cardId = zone[idx]
            if (cardId === undefined) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            zone.splice(idx, 1)
            const maintain = minLevelCores(getCard(cardId))
            const inst = createInstance(cardId, state.turn, maintain)
            player.field.nexuses.push(inst)
            log(
                state,
                `${player.name}は${sourceName}の効果で、${action.from === "hand" ? "手札" : "トラッシュ"}から${getCard(cardId).name}をコストを支払わずに配置した。`,
            )
        }
        if (action.all) {
            // 該当するネクサスカードをすべて配置する（選択の余地がないためinteractiveTargets/chosenCardIndexは無関係）
            const zone = action.from === "hand" ? player.hand : player.trashCards
            const indices: number[] = []
            for (let i = 0; i < zone.length; i++) {
                if (isMatch(zone[i]!)) indices.push(i)
            }
            if (indices.length === 0) {
                log(state, `${sourceName}：${action.from === "hand" ? "手札" : "トラッシュ"}に対象のネクサスがなかった。`)
                return
            }
            // 後ろのインデックスから順に配置（splice後もインデックスがずれないように）
            for (let i = indices.length - 1; i >= 0; i--) {
                deployFromIndex(indices[i]!)
            }
            return
        }
        if (chosenCardIndex !== undefined) {
            deployFromIndex(chosenCardIndex)
            return
        }
        if (state.interactiveTargets) {
            const zone = action.from === "hand" ? player.hand : player.trashCards
            const indices: number[] = []
            for (let i = 0; i < zone.length; i++) {
                if (isMatch(zone[i]!)) indices.push(i)
            }
            if (indices.length >= 2) {
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}：配置するネクサスを選んでください`,
                    action.from,
                    indices,
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 既存の決定的自動選択（手札は先頭、トラッシュは末尾＝新しい方から）
        let cardId: string | undefined
        if (action.from === "hand") {
            const idx = player.hand.findIndex(isMatch)
            if (idx === -1) {
                log(state, `${sourceName}：手札に対象のネクサスがなかった。`)
                return
            }
            cardId = player.hand[idx]
            player.hand.splice(idx, 1)
        } else {
            // トラッシュは末尾（新しい方）から最初の一致を選ぶ（本来は好きな1枚を選べる簡略化）
            let idx = -1
            for (let j = player.trashCards.length - 1; j >= 0; j--) {
                if (isMatch(player.trashCards[j]!)) {
                    idx = j
                    break
                }
            }
            if (idx === -1) {
                log(state, `${sourceName}：トラッシュに対象のネクサスがなかった。`)
                return
            }
            cardId = player.trashCards[idx]
            player.trashCards.splice(idx, 1)
        }
        if (cardId === undefined) return
        const maintain = minLevelCores(getCard(cardId))
        const inst = createInstance(cardId, state.turn, maintain)
        player.field.nexuses.push(inst)
        log(
            state,
            `${player.name}は${sourceName}の効果で、${action.from === "hand" ? "手札" : "トラッシュ"}から${getCard(cardId).name}をコストを支払わずに配置した。`,
        )
        return
}

const summonFromHandFreeHandler: ActionHandler<"summonFromHandFree"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 老賢樹トレントン／竜戦車アースガルド：自分の手札にある条件（colorFilter一致／
        // sameFamilyAsSelf=selfと系統1つ以上共通）を満たすスピリットカードのうちコスト最大の1枚
        // （同コストは手札の先頭側）を、コストを支払わずに召喚する（プレイヤー選択の決定的簡略化）。
        // interactiveTargets時は選択式（選択者=使用者。cardZone:"hand"）。
        // この効果で召喚されたスピリットの onSummon 効果は発揮されないため、fireTrigger を呼ばず
        // 直接 createInstance → push する（summonFreeFromHandIndex に共通化）
        const player = state.players[owner]
        const selfFamily = action.sameFamilyAsSelf && self ? getCard(self.cardId).family : null
        const matchesCardId = (candidateId: string): boolean => {
            const candidate = getCard(candidateId)
            if (candidate.type !== "spirit") return false
            if (action.colorFilter !== undefined && !cardHasColor(candidate, action.colorFilter)) return false
            if (action.sameFamilyAsSelf) {
                if (!selfFamily) return false
                if (!candidate.family.some((f) => selfFamily.includes(f))) return false
            }
            // familyFilter（配列＝OR）：selfの系統全部とのOR判定にしたくない場合の直接指定
            // （BS05火龍王ボルケノス：系統「竜人」限定。カード静的な family のみ＝手札カード判定のため）
            if (action.familyFilter !== undefined) {
                const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
                if (!wanted.some((f) => candidate.family.includes(f))) return false
            }
            // costFilter：コストが完全一致するもののみ（BS05シーサーズ：コスト2）
            if (action.costFilter !== undefined && candidate.cost !== action.costFilter) return false
            // nameIncludes：カード名にこの文字列を含むもののみ（BS05ペンタン帝国）
            if (action.nameIncludes !== undefined && !candidate.name.includes(action.nameIncludes)) return false
            return true
        }
        if (chosenCardIndex !== undefined) {
            summonFreeFromHandIndex(state, owner, sourceName, chosenCardIndex)
            return
        }
        if (state.interactiveTargets) {
            const indices: number[] = []
            for (let i = 0; i < player.hand.length; i++) {
                if (matchesCardId(player.hand[i]!)) indices.push(i)
            }
            if (indices.length >= 2) {
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}：召喚するスピリットを選んでください`,
                    "hand",
                    indices,
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 既存の決定的自動選択（コスト最大、同コストは手札の先頭側）
        let bestIndex = -1
        let bestCost = -1
        for (let i = 0; i < player.hand.length; i++) {
            const candidateId = player.hand[i]!
            if (!matchesCardId(candidateId)) continue
            const cost = getCard(candidateId).cost
            if (cost > bestCost) {
                bestCost = cost
                bestIndex = i
            }
        }
        if (bestIndex === -1) {
            log(state, `${sourceName}：手札に対象のスピリットがなかった。`)
            return
        }
        summonFreeFromHandIndex(state, owner, sourceName, bestIndex)
        return
}

const summonRepeatFromHandHandler: ActionHandler<"summonRepeatFromHand"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
        // 天使長セラフィー（mode:"free"）／兵隊アントマン（mode:"paid"）：自分の手札にある条件
        // （familyFilter・costFilter、いずれもカード静的判定）を満たすスピリットカードを、
        // リザーブが続く限り好きなだけ召喚する（プレイヤー選択の決定的簡略化：1体あたりの必要リザーブが
        // 小さいものから貪欲に選び、召喚数を最大化する）。free時はextraReserveCostPerSummon指定分を
        // 1体ごとにリザーブから自分のトラッシュへ置く。paid時はeffectiveCostで通常のコストを計算し、
        // 維持コア+コストをリザーブから支払う（コスト分はtrashCoresへ）。
        // いずれもこの効果で召喚されたスピリットのonSummon効果は発揮されない
        const player = state.players[owner]
        const matchesCardId = (candidateId: string): boolean => {
            const candidate = getCard(candidateId)
            if (candidate.type !== "spirit") return false
            if (action.familyFilter !== undefined) {
                const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
                if (!wanted.some((f) => candidate.family.includes(f))) return false
            }
            if (!matchesCostFilter(candidate.cost, action.costFilter)) return false
            return true
        }
        let summonedCount = 0
        const summonedNames: string[] = []
        while (true) {
            let bestIndex = -1
            let bestReserveNeed = Infinity
            for (let i = 0; i < player.hand.length; i++) {
                const candidateId = player.hand[i]!
                if (!matchesCardId(candidateId)) continue
                const candidate = getCard(candidateId)
                const maintain = minLevelCores(candidate)
                const need =
                    action.mode === "free"
                        ? maintain + (action.extraReserveCostPerSummon ?? 0)
                        : maintain + effectiveCost(state, owner, candidate)
                if (need < bestReserveNeed) {
                    bestReserveNeed = need
                    bestIndex = i
                }
            }
            if (bestIndex === -1 || player.reserve < bestReserveNeed) break
            const cardId = player.hand[bestIndex]!
            const card = getCard(cardId)
            const maintain = minLevelCores(card)
            player.hand.splice(bestIndex, 1)
            if (action.mode === "free") {
                player.reserve -= maintain
                if (action.extraReserveCostPerSummon) {
                    player.reserve -= action.extraReserveCostPerSummon
                    player.trashCores += action.extraReserveCostPerSummon
                }
            } else {
                const cost = effectiveCost(state, owner, card)
                player.reserve -= cost + maintain
                player.trashCores += cost
            }
            const inst = createInstance(cardId, state.turn, maintain)
            player.field.spirits.push(inst)
            summonedNames.push(card.name)
            summonedCount++
        }
        if (summonedCount === 0) {
            log(state, `${sourceName}：召喚できる対象がいなかった。`)
            return
        }
        log(
            state,
            `${player.name}は${sourceName}の効果で「${summonedNames.join("、")}」を${action.mode === "free" ? "コストを支払わず" : "コストを支払い"}召喚した。（このスピリットの召喚時効果は発揮されない）`,
        )
        return
}

const summonFromTrashFreeHandler: ActionHandler<"summonFromTrashFree"> = (ctx, action) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
        // 妖狐キュービック：自分のトラッシュにある条件（colorFilter一致・costFilter範囲）を満たす
        // スピリットカードのうちコスト最大の1枚（同コストは末尾＝新しい方から自動選択）を、
        // コストを支払わずに召喚する（プレイヤー選択の決定的簡略化）。interactiveTargets時は選択式
        // （選択者=使用者。cardZone:"trash"）。summonFromHandFreeHandlerのトラッシュ版
        const player = state.players[owner]
        const matchesCardId = (candidateId: string): boolean => {
            const candidate = getCard(candidateId)
            if (candidate.type !== "spirit") return false
            if (action.colorFilter !== undefined && !cardHasColor(candidate, action.colorFilter)) return false
            if (!matchesCostFilter(candidate.cost, action.costFilter)) return false
            return true
        }
        if (chosenCardIndex !== undefined) {
            summonFreeFromTrashIndex(state, owner, sourceName, chosenCardIndex)
            return
        }
        if (state.interactiveTargets) {
            const indices: number[] = []
            for (let i = 0; i < player.trashCards.length; i++) {
                if (matchesCardId(player.trashCards[i]!)) indices.push(i)
            }
            if (indices.length >= 2) {
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}：召喚するスピリットを選んでください`,
                    "trash",
                    indices,
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 決定的自動選択：コスト最大、同コストは末尾（新しい方）
        let bestIndex = -1
        let bestCost = -1
        for (let i = 0; i < player.trashCards.length; i++) {
            const candidateId = player.trashCards[i]!
            if (!matchesCardId(candidateId)) continue
            const cost = getCard(candidateId).cost
            if (cost >= bestCost) {
                bestCost = cost
                bestIndex = i
            }
        }
        if (bestIndex === -1) {
            log(state, `${sourceName}：トラッシュに対象のスピリットがなかった。`)
            return
        }
        summonFreeFromTrashIndex(state, owner, sourceName, bestIndex)
        return
}

const refireSummonEffectHandler: ActionHandler<"refireSummonEffect"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 対象の自分スピリット1体（targetInstanceId優先、フォールバックは自分フィールド先頭）の
        // onSummon効果を再発揮する（タイムリープ。効果を持たなければ何も起きない）
        const mine = state.players[owner].field.spirits
        const target = targetInstanceId
            ? (mine.find((s) => s.instanceId === targetInstanceId) ?? null)
            : (mine[0] ?? null)
        if (!target) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        log(state, `${sourceName}：${getCard(target.cardId).name}の召喚時効果を再発揮する。`)
        fireTrigger(state, owner, target, "onSummon")
        return
}

const handlers = {
    endBattle: endBattleHandler,
    endAttackStep: endAttackStepHandler,
    endAttackStepAfterBattle: endAttackStepAfterBattleHandler,
    swapBattler: swapBattlerHandler,
    battleCompareByLevel: battleCompareByLevelHandler,
    lockFlash: lockFlashHandler,
    lifeCrush: lifeCrushHandler,
    deployNexus: deployNexusHandler,
    summonFromHandFree: summonFromHandFreeHandler,
    summonRepeatFromHand: summonRepeatFromHandHandler,
    summonFromTrashFree: summonFromTrashFreeHandler,
    refireSummonEffect: refireSummonEffectHandler,
} satisfies Partial<ActionRegistry>

export default handlers
