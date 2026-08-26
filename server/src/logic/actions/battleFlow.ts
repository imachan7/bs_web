// バトル進行・配置系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, EffectAction } from "../../type"
import { clearBattle, createInstance, getCard, log, minLevelCores, opponentOf, pushResumeFrames } from "../GameState"
import {
    bothSidesPids,
    countEffectCounter,
    destroyNexus,
    destroySpirit,
    emitEvent,
    findSpiritAny,
    matchesFamilyFilter,
    fireFieldEventTriggers,
    fireSummonSequence,
    fireSummonTrigger,
    fireTrigger,
    notifyNexusDeployed,
    pickEnemyCandidates,
    requestCardChoice,
    requestChoice,
    resolveAction,
    resolveKoboOnBattleEnd,
    resolveTensho,
    summonFreeFromHandIndex,
    summonFreeFromTrashIndex,
} from "../EffectModules"
import { cardHasColor, effectiveBp, hasKeyword, instMinLevelCores, matchesCostFilter } from "../../../../shared/rules"
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

// BS10-065 ヘッジボルグ：BPを比べ相手のスピリットだけを破壊したとき、そのスピリット上のコアすべてはボイドへ。
// トリガーは onBattleWin なので、この時点で通常は破壊が確定済み（＞６でコアはすでにリザーブへ移動している）。
// その場合は lastBattleDestroyedCores 分をリザーブから差し引く＝ボイド行きにする。
// 「フィールドに残る」等で破壊を免れ、まだ場にいる場合はそのままコアを0にする
const battleLoserCoresToVoidHandler: ActionHandler<"battleLoserCoresToVoid"> = (ctx) => {
    const { state, opp, sourceName } = ctx
    const id = state.lastBattleDestroyedInstanceId
    if (id === undefined) {
        log(state, `${sourceName}：直前のバトルで破壊されたスピリットがいない。`)
        return
    }
    for (const pid of ["p1", "p2"] as const) {
        const inst = state.players[pid].field.spirits.find((sp) => sp.instanceId === id)
        if (!inst) continue
        if (inst.cores === 0) return
        log(state, `${sourceName}：${getCard(inst.cardId).name}の上のコア${inst.cores}個はボイドに置かれた。`)
        inst.cores = 0
        return
    }
    const cores = Math.min(state.lastBattleDestroyedCores, state.players[opp].reserve)
    if (cores === 0) return
    state.players[opp].reserve -= cores
    log(state, `${sourceName}：破壊されたスピリット上のコア${cores}個はリザーブへ戻らずボイドに置かれた。`)
}

// BS10-072 セイバーシャーク：このターンの間、**自分の**スピリットすべての『ブロック時』効果を『アタック時』へ移す
const blockTriggersAsAttackOwnThisTurnHandler: ActionHandler<"blockTriggersAsAttackOwnThisTurn"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    if (state.turnConstraints.some((c) => c.type === "blockTriggersAsAttackForPid" && c.pid === owner)) return
    state.turnConstraints.push({ type: "blockTriggersAsAttackForPid", pid: owner })
    log(state, `${sourceName}：このターンの間、${state.players[owner].name}のスピリットの『ブロック時』効果は『アタック時』に発揮される。`)
}

// BS10-073 エンジェドール：このターンの間、自分のスピリットすべては指定Lvの相手からブロックされない
const grantUnblockableByLevelThisTurnHandler: ActionHandler<"grantUnblockableByLevelThisTurn"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    state.turnConstraints.push({ type: "unblockableByLevelThisTurn", pid: owner, levels: [...action.levels] })
    log(state, `${sourceName}：このターンの間、${state.players[owner].name}のスピリットはLv${action.levels.join("/")}の相手のスピリットにブロックされない。`)
}

// BS10-108 ルナティックシール：発揮した側のエンドステップを turns 回数えるまで、両陣営に制限をかける。
// カードは「ボイドからコア3個をデッキの横に置き、『自分のエンドステップ』に1個ずつボイドに置く」と書くが、
// **置かれたコアは以後どこからも参照されない**ので、実体のコアではなくカウンターとして持つ
// （2026-08-25 ユーザー確認）。remaining がそのままデッキの横のコア数で、画面にもこれを出す
const endStepLockHandler: ActionHandler<"endStepLock"> = (ctx, action) => {
    const { state, owner, self, sourceName, sourceCardId } = ctx
    if (action.turns < 1) return
    state.endStepLocks.push({
        pid: owner,
        remaining: action.turns,
        cardId: sourceCardId ?? self?.cardId ?? "",
        locks: [...action.locks],
    })
    log(state, `${sourceName}：${state.players[owner].name}のエンドステップを${action.turns}回行うまで、お互いに制限がかかる。`)
}

// BS10-008 火星神龍アレス・ドラグーン：アタックステップとエンドステップを順番にもう1回ずつ行う。
// フラグを立てるだけで、実際に戻すのは PhaseManager.endTurn（エンドステップの誘発を解決した直後）。
// **自分のターンでなければ何もしない**（「自分のターン終了時」の効果なので、他の経路から呼ばれても暴発させない）
const extraAttackStepHandler: ActionHandler<"extraAttackStep"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    if (owner !== state.turnPlayer) {
        log(state, `${sourceName}：自分のターンではないため、アタックステップは追加されない。`)
        return
    }
    if (state.extraAttackStepPending === true) {
        log(state, `${sourceName}：すでにアタックステップの追加が予約されている。`)
        return
    }
    state.extraAttackStepPending = true
    log(state, `${sourceName}：アタックステップとエンドステップを、順番にもう1回ずつ行う。`)
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

const battleCompareByCoresHandler: ActionHandler<"battleCompareByCores"> = (ctx, action) => {
    const { state, sourceName } = ctx
        // イマジンフィールド：現在のバトルにフラグを立て、解決時にBPの代わりにコアの数を比較させる
        if (!state.battle) {
            log(state, `${sourceName}：バトル外のため不発。`)
            return
        }
        state.battle.compareByCores = true
        log(state, `${sourceName}：バトル解決時、BPの代わりにコアの数を比較する。`)
        return
}

const lockFlashHandler: ActionHandler<"lockFlash"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (!state.battle) {
            log(state, `${sourceName}：バトルが発生していないため使用できなかった。`)
            return
        }
        // attackerFamilyFilter（BS07ウィリアンスラッシュ）：アタックしているのが指定系統の
        // 自分のスピリットのときだけロックする。アタッカーが自分側でない／系統が一致しないなら不発
        if (action.attackerFamilyFilter !== undefined) {
            const attackerId = state.battle.attackerInstanceId
            const attacker = state.players[owner].field.spirits.find((sp) => sp.instanceId === attackerId)
            if (!attacker || !matchesFamilyFilter(state, owner, attacker, action.attackerFamilyFilter)) {
                log(state, `${sourceName}：指定の系統を持つ自分のスピリットがアタックしていないため効かなかった。`)
                return
            }
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
            // B（減らせるライフ）が無ければ発揮できない（COST_MODEL.md §1）。
            // 以前は払ってからカウントを見ていたため、減らせないときも払い損になっていた
            const costCount =
                action.countCounter !== undefined
                    ? countEffectCounter(state, owner, self, action.countCounter, srcType)
                    : action.count
            if (costCount <= 0 || state.players[opp].life <= 0) {
                log(state, `${sourceName}：減らせるライフがないため発動しなかった。`)
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
        // countCounter指定時はcountを無視しEffectCounterの値を個数として使う（BS08メテオストーム）
        const count = action.countCounter !== undefined ? countEffectCounter(state, owner, self, action.countCounter, srcType) : action.count
        if (count <= 0) {
            log(state, `${sourceName}：カウントが0のため発動しなかった。`)
            return
        }
        const dealt = Math.min(count, player.life)
        player.life -= dealt
        // dest:"trash" はトラッシュ行き（リザーブと違い、そのままでは再利用されない。BS08機神獣インフェニット・ヴォルスLv3）
        if (action.dest === "trash") player.trashCores += dealt
        else player.reserve += dealt
        log(
            state,
            `${sourceName}：${player.name}のライフからコア${dealt}個を${action.dest === "trash" ? "トラッシュ" : "リザーブ"}に置いた。（残りライフ${player.life}）`,
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

// BS09-065名工集いし大工房Lv2：自分のトラッシュにある指定色のネクサスカード1枚を、
// **自分のフィールドのコアだけ**を使ってコストを支払って配置する（リザーブは使わない。2026-08-14 ユーザー確認）。
// 取るのはネクサス上→コアの多いスピリットの順で、**維持コアを割る個体からは取らない**（決定的簡略化）
const deployNexusFromTrashByFieldCoresHandler: ActionHandler<"deployNexusFromTrashByFieldCores"> = (ctx, action) => {
    const { state, owner, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    const isMatch = (cardId: string): boolean => {
        const c = getCard(cardId)
        return c.type === "nexus" && action.colors.some((col) => cardHasColor(c, col))
    }
    // フィールドから取り出せるコアの総量（維持コアぶんは残す）
    const spendable = (): { inst: CardInstance; max: number }[] => [
        ...player.field.nexuses.map((n) => ({ inst: n, max: n.cores })),
        ...player.field.spirits.map((sp) => ({ inst: sp, max: Math.max(0, sp.cores - instMinLevelCores(sp)) })),
    ].filter((x) => x.max > 0)
    const indices = player.trashCards.map((_, i) => i).filter((i) => isMatch(player.trashCards[i]!))
    if (indices.length === 0) {
        log(state, `${sourceName}：トラッシュに対象のネクサスがなかった。`)
        return
    }
    const deploy = (idx: number): void => {
        const cardId = player.trashCards[idx]
        if (cardId === undefined) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        const cost = effectiveCost(state, owner, getCard(cardId))
        const pool = spendable()
        const total = pool.reduce((sum, x) => sum + x.max, 0)
        if (total < cost) {
            log(state, `${sourceName}：フィールドのコアが足りないため配置できなかった。`)
            return
        }
        // コアの多い順に取る（決定的簡略化）
        let remaining = cost
        for (const x of [...pool].sort((a, b) => b.max - a.max)) {
            if (remaining <= 0) break
            const take = Math.min(remaining, x.max)
            x.inst.cores -= take
            player.trashCores += take
            remaining -= take
        }
        player.trashCards.splice(idx, 1)
        const maintain = minLevelCores(getCard(cardId))
        player.field.nexuses.push(createInstance(cardId, state.turn, maintain))
        log(
            state,
            `${player.name}はフィールドのコア${String(cost)}個を支払い、トラッシュから${getCard(cardId).name}を配置した。`,
        )
        notifyNexusDeployed(state, owner)
    }
    if (chosenCardIndex !== undefined) {
        deploy(chosenCardIndex)
        return
    }
    if (state.interactiveTargets && indices.length >= 2) {
        requestCardChoice(
            state,
            owner,
            `${sourceName}：配置するネクサスを選んでください`,
            "trash",
            indices,
            false,
            action,
            null,
        )
        return
    }
    deploy(indices[0]!)
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
            // colors 省略時は色を問わない（SD02-006 鼬の暗殺者ウィゼーブ）
            if (c.type !== "nexus") return false
            return action.colors === undefined || action.colors.some((col) => cardHasColor(c, col))
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
            notifyNexusDeployed(state, owner)
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
        notifyNexusDeployed(state, owner)
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
            // costFilter：数値指定時はコストが完全一致するもののみ（BS05シーサーズ：コスト2）。
            // {max,min}指定時は範囲一致（BS06リクラメーション：コスト4以下）
            if (action.costFilter !== undefined) {
                if (typeof action.costFilter === "number") {
                    if (candidate.cost !== action.costFilter) return false
                } else if (!matchesCostFilter(candidate.cost, action.costFilter)) {
                    return false
                }
            }
            // nameIncludes：カード名にこの文字列を含むもののみ（BS05ペンタン帝国）
            if (action.nameIncludes !== undefined && !candidate.name.includes(action.nameIncludes)) return false
            // maxCostFromOwnTrashCores：コスト上限が「自分のトラッシュにあるコアの数」（BS02ディバインウィンド）
            if (action.maxCostFromOwnTrashCores && candidate.cost > player.trashCores) return false
            // keywordFilter：このキーワードエントリを静的に持つカードのみ（summonFromTrashFreeと同型。BS08雷帝竜騎レイブリッツ＝転召持ち）
            if (action.keywordFilter !== undefined && !hasKeyword(candidateId, action.keywordFilter)) return false
            // payCost：通常の召喚コストを支払う効果では、払えないカードは最初から候補にしない
            // （選ばせてから「払えなかった」で不発にすると、ターンに1回の権利だけ失う）。
            // **リザーブだけでなくフィールドのコアも支払いに使える**（通常の召喚と同じ。paySources）。
            // 2026-08-23 まではリザーブだけで判定しており、盤面のコアでなら払えるカードが
            // 候補にすら出なかった（利用者報告。BS08空帝竜騎プラチナム等の帝竜騎サイクル6枚）
            if (action.payCost) {
                const fieldCores = [...player.field.spirits, ...player.field.nexuses].reduce(
                    (sum, i) => sum + i.cores,
                    0,
                )
                if (player.reserve + fieldCores < minLevelCores(candidate) + effectiveCost(state, owner, candidate)) {
                    return false
                }
            }
            return true
        }
        // summonFreeFromHandIndex へ渡す追加指定（コストを支払う／召喚時効果を発揮させない／
        // フィールドのコアからの支払い指定）
        const summonOpts = {
            ...(action.payCost ? { payCost: action.payCost } : {}),
            ...(action.skipOnSummon ? { skipOnSummon: action.skipOnSummon } : {}),
            ...(action.payCost && ctx.paySources ? { paySources: ctx.paySources } : {}),
        }
        // count指定時：count枚まで複数体を召喚する（BS06アルカナキング・カール＝4枚まで）。
        // コスト最大から貪欲に選び、維持コアがリザーブから払えなくなった時点で打ち切る決定的簡略化。
        // interactiveTargetsでも選択式にはしない（この経路は自動選択のみ）
        if (action.count !== undefined) {
            let summonedCount = 0
            for (let n = 0; n < action.count; n++) {
                let bestIdx = -1
                let bestCost = -1
                for (let i = 0; i < player.hand.length; i++) {
                    const candidateId = player.hand[i]!
                    if (!matchesCardId(candidateId)) continue
                    const cost = getCard(candidateId).cost
                    if (cost > bestCost) {
                        bestCost = cost
                        bestIdx = i
                    }
                }
                if (bestIdx === -1) break
                const maintain = minLevelCores(getCard(player.hand[bestIdx]!))
                if (player.reserve < maintain) break
                summonFreeFromHandIndex(state, owner, sourceName, bestIdx, action.skipTensho, summonOpts)
                summonedCount++
                if (state.winner) return
            }
            if (summonedCount === 0) {
                log(state, `${sourceName}：召喚できるスピリットがいなかった。`)
            }
            return
        }
        // costDestroyOwnFamily：指定系統の自分のスピリット1体を破壊することがコスト（BS02キャストオフ）。
        // 破壊できる対象がいなければ不発。対象はコスト最小（同コストはフィールドの先頭側）を機械的に選ぶ
        // 「〜することで召喚する」の任意コストは、**B（召喚できる手札）が無ければ発揮できない**
        // （COST_MODEL.md §1）。以前は先に自分のスピリット／ネクサスを破壊してから手札を見ていたため、
        // 召喚できないときも払い損になっていた。
        // なお維持コアの足りるかまではここで見ない：コストで破壊したスピリットのコアがリザーブに戻り、
        // 支払い後に払えるようになる場合があるため（誤って発揮不可にしないための保守的な判定）
        if (
            (action.costDestroyOwnFamily !== undefined || action.costDestroyOwnNexus) &&
            chosenCardIndex === undefined &&
            !action.costSacrificeChosen &&
            !player.hand.some(matchesCardId)
        ) {
            log(state, `${sourceName}：召喚できるスピリットカードが手札にないため発動しなかった。`)
            return
        }
        // **何を犠牲にするかは候補2体以上ならプレイヤーが選ぶ**（COST_MODEL.md §2）。
        // 選ばせたあとは costDestroyOwnFamily を落とした action で入り直し、二重に払わないようにする
        if (action.costDestroyOwnFamily !== undefined && chosenCardIndex === undefined) {
            const sacrifices = player.field.spirits.filter((s) =>
                matchesFamilyFilter(state, owner, s, action.costDestroyOwnFamily!),
            )
            if (sacrifices.length === 0) {
                log(state, `${sourceName}：コストにできるスピリットがいないため発動しなかった。`)
                return
            }
            const { costDestroyOwnFamily: _paid, costSacrificeChosen: _flag, ...rest } = action
            if (action.costSacrificeChosen && targetInstanceId !== undefined) {
                const chosen = sacrifices.find((s) => s.instanceId === targetInstanceId)
                if (!chosen) {
                    log(state, `${sourceName}：指定されたスピリットはコストにできなかった。`)
                    return
                }
                log(state, `${player.name}は${sourceName}のコストとして${getCard(chosen.cardId).name}を破壊した。`)
                destroySpirit(state, owner, chosen.instanceId, "destroy", destroyContext)
                ctx.resolve(rest)
                return
            }
            if (state.interactiveTargets && sacrifices.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コストとして破壊する自分のスピリットを選んでください`,
                    sacrifices.map((s) => s.instanceId),
                    false,
                    { ...action, costSacrificeChosen: true },
                    self,
                )
                return
            }
            // 非対話・候補1体：コスト最小を自動選択（決定的簡略化）
            let victim = sacrifices[0]!
            for (const s of sacrifices) {
                if (getCard(s.cardId).cost < getCard(victim.cardId).cost) victim = s
            }
            log(state, `${player.name}は${sourceName}のコストとして${getCard(victim.cardId).name}を破壊した。`)
            destroySpirit(state, owner, victim.instanceId, "destroy", destroyContext)
        }
        // costDestroyOwnNexus：自分のネクサス1つ（コア最少、同数はフィールド先頭）を破壊することがコスト
        // （BS06リクラメーション）。破壊できるネクサスがなければ不発
        if (action.costDestroyOwnNexus && chosenCardIndex === undefined) {
            const nexuses = player.field.nexuses
            if (nexuses.length === 0) {
                log(state, `${sourceName}：破壊できるネクサスがないため発動しなかった。`)
                return
            }
            const { costDestroyOwnNexus: _paidNx, costSacrificeChosen: _flagNx, ...restNx } = action
            if (action.costSacrificeChosen && targetInstanceId !== undefined) {
                const chosen = nexuses.find((n) => n.instanceId === targetInstanceId)
                if (!chosen) {
                    log(state, `${sourceName}：指定されたネクサスはコストにできなかった。`)
                    return
                }
                if (!destroyNexus(state, owner, chosen.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })) {
                    log(state, `${sourceName}：コストを支払えなかったため発動しなかった。`)
                    return
                }
                ctx.resolve(restNx)
                return
            }
            // **どのネクサスを壊すかは候補2つ以上ならプレイヤーが選ぶ**（COST_MODEL.md §2）
            if (state.interactiveTargets && nexuses.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コストとして破壊する自分のネクサスを選んでください`,
                    nexuses.map((n) => n.instanceId),
                    false,
                    { ...action, costSacrificeChosen: true },
                    self,
                )
                return
            }
            // 非対話・候補1つ：コア最少を自動選択（同数はフィールド先頭）
            let victim = nexuses[0]!
            for (const n of nexuses) {
                if (n.cores < victim.cores) victim = n
            }
            // destroyNexus自体が成否のログを出す（破壊耐性で不発の場合あり）。
            // 不発ならコストを支払えなかったとして召喚もしない
            if (!destroyNexus(state, owner, victim.instanceId, { sourcePid: owner, ...(srcType ? { sourceType: srcType } : {}) })) {
                log(state, `${sourceName}：コストを支払えなかったため発動しなかった。`)
                return
            }
        }
        if (chosenCardIndex !== undefined) {
            summonFreeFromHandIndex(state, owner, sourceName, chosenCardIndex, action.skipTensho, summonOpts)
            return
        }
        if (state.interactiveTargets) {
            const indices: number[] = []
            for (let i = 0; i < player.hand.length; i++) {
                if (matchesCardId(player.hand[i]!)) indices.push(i)
            }
            // cancelable（起動能力から使う効果）：**候補が1枚でも必ず聞き、やめられる**。
            // 起動ボタンを押してから手札を見て「やっぱりやめる」ができるようにするため
            // （やめたときに「ターンに1回」を戻すのは doActivateAbility / doResolveChoice の担当）。
            // 候補が0枚なら発揮できないので、消費を巻き戻すフラグを立てて終わる
            if (action.cancelable) {
                if (indices.length === 0) {
                    state.activationFizzled = true
                    log(state, `${sourceName}：召喚できるスピリットカードが手札にないため発動しなかった。`)
                    return
                }
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}：召喚するスピリットを選んでください`,
                    "hand",
                    indices,
                    true,
                    action,
                    self,
                    true,
                )
                return
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
        summonFreeFromHandIndex(state, owner, sourceName, bestIndex, action.skipTensho, summonOpts)
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
            // 【転召】はコストを支払わない召喚でも必ず行う（公式Q&A 2024-10-31）。
            // 現データでこの経路から召喚されうるカード（天霊／怪虫）に転召持ちはいないため実質no-opだが、
            // 経路ごとに扱いを変えると将来のカードで無言の取りこぼしになるので必ず通す。
            // 転召が対象選択を要求したら（選択待ちが立ったら）そこで召喚を打ち切る
            if (!state.winner) resolveTensho(state, owner, inst)
            if (state.pendingChoice) break
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
            if (action.keywordFilter !== undefined && !hasKeyword(candidateId, action.keywordFilter)) return false
            // familyFilter（BS07常闇の聖堂＝「夜族」）：トラッシュのカードが対象なので
            // カード静的な family で判定する（配列＝OR）
            if (action.familyFilter !== undefined) {
                const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
                if (!wanted.some((f) => candidate.family.includes(f))) return false
            }
            // nameIncludes（BS08アンドレアルファス＝「勇者」）：トラッシュのカードが対象なので
            // カード静的な名前で判定する
            if (action.nameIncludes !== undefined && !candidate.name.includes(action.nameIncludes)) return false
            // whileCombinedFilter（BS10-084虚実の口Lv2＝「【合体時】効果を持つスピリットカード」）：
            // トラッシュのカードが対象なので、カード静的な effects に whileCombined:true のエントリがあるかで判定する
            if (action.whileCombinedFilter === true && !candidate.effects.some((e) => "whileCombined" in e && e.whileCombined === true)) {
                return false
            }
            if (action.costBudget === undefined && !matchesCostFilter(candidate.cost, action.costFilter)) return false
            // payCost：通常の召喚コストを支払う効果では、払えないカードは最初から候補にしない
            // （手札版と同じ理由・同じ判定。リザーブだけでなくフィールドのコアも支払いに使える）
            if (action.payCost) {
                const fieldCores = [...player.field.spirits, ...player.field.nexuses].reduce(
                    (sum, i) => sum + i.cores,
                    0,
                )
                if (player.reserve + fieldCores < minLevelCores(candidate) + effectiveCost(state, owner, candidate)) {
                    return false
                }
            }
            return true
        }
        // summonFreeFromTrashIndex へ渡す追加指定（コストを支払う／フィールドのコアからの支払い指定）
        const trashSummonOpts = {
            ...(action.payCost ? { payCost: action.payCost } : {}),
            ...(action.payCost && ctx.paySources ? { paySources: ctx.paySources } : {}),
        }
        // BS06-X22魔界七将ベルゼビート：costBudget指定時はcostFilterを使わず、コスト合計がbudget以下になる
        // 範囲で複数枚を召喚する（コスト最大から貪欲に選ぶ決定的簡略化。維持コアがリザーブから払えなくなった
        // 時点で打ち切り。プレイヤー選択・対象選択は伴わないため choseCardIndex / interactiveTargets 分岐は不要）
        if (action.costBudget !== undefined) {
            let remainingBudget = action.costBudget
            const summonedNames: string[] = []
            while (true) {
                let bestIndex = -1
                let bestCost = -1
                for (let i = 0; i < player.trashCards.length; i++) {
                    const candidateId = player.trashCards[i]!
                    if (!matchesCardId(candidateId)) continue
                    const candidate = getCard(candidateId)
                    if (candidate.cost > remainingBudget) continue
                    if (minLevelCores(candidate) > player.reserve) continue
                    if (candidate.cost > bestCost) {
                        bestCost = candidate.cost
                        bestIndex = i
                    }
                }
                if (bestIndex === -1) break
                const cardId = player.trashCards[bestIndex]!
                const card = getCard(cardId)
                const maintain = minLevelCores(card)
                player.trashCards.splice(bestIndex, 1)
                player.reserve -= maintain
                remainingBudget -= card.cost
                const inst = createInstance(cardId, state.turn, maintain)
                player.field.spirits.push(inst)
                summonedNames.push(card.name)
                if (!state.winner) resolveTensho(state, owner, inst)
                if (state.pendingChoice) break
            }
            if (summonedNames.length === 0) {
                log(state, `${sourceName}：召喚できる対象がいなかった。`)
                return
            }
            log(
                state,
                `${player.name}は${sourceName}の効果で「${summonedNames.join("、")}」をコストを支払わずに召喚した。（このスピリットの召喚時効果は発揮されない）`,
            )
            return
        }
        if (chosenCardIndex !== undefined) {
            summonFreeFromTrashIndex(state, owner, sourceName, chosenCardIndex, trashSummonOpts)
            return
        }
        if (state.interactiveTargets) {
            const indices: number[] = []
            for (let i = 0; i < player.trashCards.length; i++) {
                if (matchesCardId(player.trashCards[i]!)) indices.push(i)
            }
            // payCost（BS07常闇の聖堂＝「コストとして使うことで〜召喚できる」）は
            // **候補が1枚でも必ず聞く**。「できる」＝任意なので断れる必要があり、
            // さらに支払い元（フィールドのコア）を選ぶ機会がここでしか作れない（2026-08-24）
            if (indices.length >= 2 || action.payCost) {
                requestCardChoice(
                    state,
                    owner,
                    `${sourceName}：召喚するスピリットを選んでください`,
                    "trash",
                    indices,
                    action.payCost === true,
                    action,
                    self,
                    action.payCost === true,
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
        summonFreeFromTrashIndex(state, owner, sourceName, bestIndex, trashSummonOpts)
        return
}

// 【転召】の対象選択で中断した召喚の続き（cards.jsonには書かない内部専用）。
// GameEngine が pendingChoice.queue へ積み、選択の解決後にここで召喚時効果以降へ合流する
const summonSequenceHandler: ActionHandler<"summonSequence"> = (ctx, action) => {
    const { state, owner, self } = ctx
    if (!self) return
    fireSummonSequence(state, owner, self, action.byFushi === true)
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
        fireSummonTrigger(state, owner, target)
        return
}

// 強者統べる大地Lv2：実効BPがminBp以上の自分のスピリット1体に「このターン1回だけブロックされない」印を付ける。
// 「1体を指定する」は実効BP最大の1体に固定した決定的簡略化（同BPならフィールドの先頭側）
// BS09-044妖精の姫巫女ハマ・ドリュアス：このバトルに「ブロッカーがLv1なら
// BPを比べずブロックされなかった扱いにする」印を立てる（判定はバトル解決側）
const treatAsUnblockedIfBlockerLevel1Handler: ActionHandler<"treatAsUnblockedIfBlockerLevel1"> = (ctx) => {
    const { state, sourceName } = ctx
    if (!state.battle) {
        log(state, `${sourceName}：バトル中ではないため何も起きなかった。`)
        return
    }
    state.battle.treatAsUnblockedIfBlockerLevel1 = true
    log(state, `${sourceName}：Lv1のスピリットにブロックされても、ブロックされなかったものとして扱う。`)
}

// SD02-016 ウィングブーツ：アタッカーのLvがブロッカーのLv以上なら、BPを比べずに
// 「ブロックされなかった」ものとして扱う（treatAsUnblockedIfBlockerLevel1 の一般化版）
const treatAsUnblockedIfLevelAtLeastBlockerHandler: ActionHandler<"treatAsUnblockedIfLevelAtLeastBlocker"> = (ctx) => {
    const { state, sourceName } = ctx
    if (!state.battle) {
        log(state, `${sourceName}：バトル中ではないため何も起きなかった。`)
        return
    }
    state.battle.treatAsUnblockedIfLevelAtLeastBlocker = true
    log(state, `${sourceName}：ブロックした相手と同じLv以下なら、ブロックされなかったものとして扱う。`)
}

// BS09-042妖精騎士ピーターLv2-3：相手のスピリット1体を指定し、このバトルの間ブロックさせない。
// 指定するのは効果の持ち主（効果文の主語が「（自分が）指定する」。CHOOSER_RULES.md）
const markCantBlockThisBattleHandler: ActionHandler<"markCantBlockThisBattle"> = (ctx) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    if (targetInstanceId !== undefined) {
        const found = state.players[opp].field.spirits.find((s) => s.instanceId === targetInstanceId)
        if (!found) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        found.cantBlockThisBattle = true
        log(state, `${getCard(found.cardId).name}は、このバトルの間ブロックできない。`)
        return
    }
    const candidates: CardInstance[] = pickEnemyCandidates(state, opp, Infinity, undefined, srcColors, srcType)
    if (candidates.length === 0) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    if (state.interactiveTargets && candidates.length >= 2) {
        requestChoice(
            state,
            owner,
            `${sourceName}：ブロックできなくする相手のスピリットを選んでください`,
            candidates.map((s: CardInstance) => s.instanceId),
            false,
            { type: "markCantBlockThisBattle" },
            self,
        )
        return
    }
    // 非対話時は実効BP最大を自動選択（プレイヤー選択の決定的簡略化）
    const chosen = candidates.reduce((best: CardInstance, s: CardInstance) =>
        effectiveBp(state, opp, s) > effectiveBp(state, opp, best) ? s : best,
    )
    chosen.cantBlockThisBattle = true
    log(state, `${getCard(chosen.cardId).name}は、このバトルの間ブロックできない。`)
}

const markUnblockableThisTurnHandler: ActionHandler<"markUnblockableThisTurn"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    // target:"self"（BS07天使長トロン）は発生源自身。BP最大の自動選択は行わない
    if (action.target === "self") {
        if (!self) return
        self.unblockableOnceThisTurn = true
        log(state, `${getCard(self.cardId).name}は、このターン1回だけ相手のスピリットにブロックされない。`)
        return
    }
    // 「BP◯◯◯以上の自分のスピリット1体を指定する」（BS04強者統べる大地Lv2）。
    // 候補が2体以上あればプレイヤーに選ばせる（非対話時＝smoke等は従来どおり実効BP最大を自動選択）
    const candidates = state.players[owner].field.spirits.filter(
        (inst) => effectiveBp(state, owner, inst) >= action.minBp,
    )
    if (candidates.length === 0) {
        log(state, `${sourceName}：BP${action.minBp}以上の自分のスピリットがいなかった。`)
        return
    }
    if (targetInstanceId === undefined && state.interactiveTargets && candidates.length >= 2) {
        requestChoice(
            state,
            owner,
            `${sourceName}：ブロックされないスピリットを選んでください`,
            candidates.map((s) => s.instanceId),
            false,
            action,
            self,
        )
        return
    }
    // 明示ターゲット（選択の再開もここに戻ってくる）。条件を満たさない個体が指定されたら不発
    let chosen: CardInstance | undefined
    if (targetInstanceId !== undefined) {
        chosen = candidates.find((s) => s.instanceId === targetInstanceId)
        if (!chosen) {
            log(state, `${sourceName}：指定されたスピリットは条件を満たさなかった。`)
            return
        }
    } else {
        let bestBp = -1
        for (const inst of candidates) {
            const bp = effectiveBp(state, owner, inst)
            if (bp > bestBp) {
                chosen = inst
                bestBp = bp
            }
        }
    }
    if (!chosen) return
    chosen.unblockableOnceThisTurn = true
    log(
        state,
        `${sourceName}：${getCard(chosen.cardId).name}は、このターン1回だけ相手のスピリットにブロックされない。`,
    )
}

// 魔界七将パンデミウムLv3：お互いが手札からcount枚を破棄する（自分→相手の順）。
// **破棄するカードは各自が自分で選ぶ**（2026-08-24。それまでは手札の末尾からの決定的簡略化だった）。
// 1人ぶんの破棄は discardSelfChoose に委譲する（1枚ずつ選ばせる／非対話では末尾から）。
// 相手側は actorPid で「相手の効果として」解決させるので、選択者も相手本人になる
const discardBothHandsHandler: ActionHandler<"discardBothHands"> = (ctx, action) => {
    const { state, owner, self, srcType } = ctx
    // countCounter指定時はcountを無視しEffectCounterの値を破棄枚数として使う
    // （BS10-X02双魚賊神ピスケガレオン：系統「光導」/「星魂」を持つ自分のスピリット数）
    const count = action.countCounter !== undefined ? countEffectCounter(state, owner, self, action.countCounter, srcType) : action.count
    if (count <= 0) {
        if (action.countCounter !== undefined) {
            const { sourceName } = ctx
            log(state, `${sourceName}：カウントが0のため発動しなかった。`)
        }
        return
    }
    const pids = bothSidesPids(state, srcType)
    const discardOne: EffectAction = { type: "discardSelfChoose", count }
    for (const pid of [owner, opponentOf(owner)]) {
        if (!pids.includes(pid)) continue
        // 自分側が選択待ちに入ったら、相手側の破棄は再開スタックへ回す。
        // 外側から積むので、自分の残り枚数のフレーム（内側）より後に実行される
        if (state.pendingChoice) {
            pushResumeFrames(state, [
                {
                    kind: "action",
                    selfInstanceId: self ? self.instanceId : null,
                    action: discardOne,
                    actorPid: pid,
                },
            ])
            return
        }
        resolveAction(state, pid, self, discardOne)
    }
}

const handlers = {
    endBattle: endBattleHandler,
    treatAsUnblockedIfBlockerLevel1: treatAsUnblockedIfBlockerLevel1Handler,
    treatAsUnblockedIfLevelAtLeastBlocker: treatAsUnblockedIfLevelAtLeastBlockerHandler,
    markCantBlockThisBattle: markCantBlockThisBattleHandler,
    markUnblockableThisTurn: markUnblockableThisTurnHandler,
    discardBothHands: discardBothHandsHandler,
    battleLoserCoresToVoid: battleLoserCoresToVoidHandler,
    blockTriggersAsAttackOwnThisTurn: blockTriggersAsAttackOwnThisTurnHandler,
    grantUnblockableByLevelThisTurn: grantUnblockableByLevelThisTurnHandler,
    endStepLock: endStepLockHandler,
    extraAttackStep: extraAttackStepHandler,
    endAttackStep: endAttackStepHandler,
    endAttackStepAfterBattle: endAttackStepAfterBattleHandler,
    swapBattler: swapBattlerHandler,
    battleCompareByLevel: battleCompareByLevelHandler,
    battleCompareByCores: battleCompareByCoresHandler,
    lockFlash: lockFlashHandler,
    lifeCrush: lifeCrushHandler,
    deployNexusFromTrashByFieldCores: deployNexusFromTrashByFieldCoresHandler,
    deployNexus: deployNexusHandler,
    summonFromHandFree: summonFromHandFreeHandler,
    summonRepeatFromHand: summonRepeatFromHandHandler,
    summonFromTrashFree: summonFromTrashFreeHandler,
    refireSummonEffect: refireSummonEffectHandler,
    summonSequence: summonSequenceHandler,
} satisfies Partial<ActionRegistry>

export default handlers
