// 効果解決中のプレイヤー選択（pendingChoice）への応答と、再開スタックの消化
import type { GameState, PaySource, PendingChoice, PlayerId } from "../type"
import { fieldInstanceIdsOf, findInstanceAnywhere, getCard, log, opponentOf, resumeTriggerBatch } from "./GameState"
import { EXTRA_STEP_OPTIONS, driveTurnStart, endTurn, runExtraStep, toAttackPhase } from "./PhaseManager"
import { resumeDestroyBatch, resumeDestroyCommit, resumeDestroyNexusCommit } from "./removal"
import { applyFushiSummon, applySpiritMillFreeSummon, declineSpiritMillFreeSummon } from "./revive"
import {
    summonFreeFromTrashIndex,
    finishBurstActivation,
    fireOwnBurstActivated,
    applyMagicNegateChoice,
    applyMagicRedirectChoice,
    applyMagicSideChoice,
    applyMagicRepeatChoice,
    applyHandFreeSummon,
    applyDeckMillNegate,
    applyProvocationUse,
    applyReviveConfirm,
    declineDeckMillNegate,
    declineReviveConfirm,
    declineMagicNegateChoice,
    revertDestroyGroupUsage,
    revertOncePerTurn,
    resolveAction,
    fireBounceTriggers,
    flushBraveKeeps,
    applyBraveKeep,
    declineBraveKeep,
    requestActivationConfirm,
} from "./EffectModules"
import { validatePaySources } from "./RuleValidator"
import { magicEffectiveColors } from "../../../shared/cost"
import { doCastMagic } from "./magic/cast"
import { applyResshinsokuDestination, finishBlockDeclaration, placeSummonedSpirit, revertActivatedUse } from "./GameEngine"
import { resumeBattleResolution } from "./battleResolve"

// 選択を「やめた」ときに、「ターンに1回」を巻き戻す
// （起動能力＝PendingChoice.revertActivated／誘発＝revertTriggered。2026-09-16）
function revertActivatedIfSkipped(state: GameState, pending: PendingChoice): void {
    const r = pending.revertActivated
    if (r) {
        const inst = findInstanceAnywhere(state, r.instanceId)
        if (inst) revertActivatedUse(inst, r.effectId)
    }
    const t = pending.revertTriggered
    if (t) {
        const inst = findInstanceAnywhere(state, t.instanceId)
        if (inst) revertOncePerTurn(inst, t.effectId)
        // 同時破壊グループの仮消費も戻す（キーが無ければ何もしない。fix/destroyed-trigger-once）
        revertDestroyGroupUsage(state, t.instanceId, t.effectId)
    }
}

// pendingChoice（効果解決中のプレイヤー選択）への応答を処理する。
// instanceId 省略時は「選ばない」（optional な選択のみ許可）。
// 選択実行後、退避していた queue（同一トリガー内の残りの誘発）を先頭から順に消化する。
// 途中で新たな pendingChoice が立てば、残りの queue をそちらへ引き継いで中断する。
export function doResolveChoice(
    state: GameState,
    pid: PlayerId,
    instanceId?: string,
    option?: string,
    cardIndex?: number,
    // 「コストを支払って召喚できる」起動効果（summonFromHandFree の payCost）で、
    // リザーブの不足分をフィールドのコアから払うための指定。通常の召喚と同じ支払いUIから届く
    paySources?: PaySource[],
): string | null {
    const pending = state.pendingChoice
    if (!pending) return "選択待ちの効果がありません"
    if (pending.pid !== pid) return "あなたが選択するタイミングではありません"

    // マジックの無効化の確認（鏡の回廊Lv2／【氷壁】）。action は解決せず、
    // 「無効にする」ならコストを払ってマジックの効果を捨て、選ばなければ中断していた解決を続ける
    if (pending.magicNegate) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.magicNegate
        state.pendingChoice = null
        if (option !== undefined) {
            applyMagicNegateChoice(state, info)
        } else {
            log(state, `${getCard(info.cardId).name}の効果を無効にしなかった。`)
            declineMagicNegateChoice(state, info)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 複数体ブロック（blockRequiresCount）で、アタック側がバトル相手を選ぶ待ち。action は解決しない
    // （BS10-X03巨蟹武神キャンサード：「どれか1体とだけバトルする」）
    if (pending.blockBattlePick) {
        if (instanceId === undefined || !pending.candidates.includes(instanceId)) {
            return "選択できない対象です"
        }
        const blockerPid = pending.blockBattlePick.blockerPid
        state.pendingChoice = null
        if (!state.battle) return null
        state.battle.extraBlockerIds = pending.candidates.filter((id) => id !== instanceId)
        finishBlockDeclaration(state, blockerPid, instanceId)
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 手札からの無償召喚の確認（BS08猫娘アニー）。action は解決しない
    if (pending.handFreeSummon) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.handFreeSummon
        state.pendingChoice = null
        if (option !== undefined) {
            applyHandFreeSummon(state, info)
        } else {
            log(state, `${getCard(info.cardId).name}：手札から召喚しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 手札から破棄されたカード自身の無償召喚の確認（BS09-025忍者サルトベ）。action は解決しない
    if (pending.trashFreeSummon) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.trashFreeSummon
        state.pendingChoice = null
        if (option !== undefined) {
            // 確認を出したあとにトラッシュが動いている可能性があるので、位置が食い違えばIDで取り直す
            const trash = state.players[info.pid].trashCards
            const index = trash[info.trashIndex] === info.cardId ? info.trashIndex : trash.lastIndexOf(info.cardId)
            if (index !== -1) summonFreeFromTrashIndex(state, info.pid, getCard(info.cardId).name, index)
        } else {
            log(state, `${getCard(info.cardId).name}：トラッシュから召喚しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 「破壊される代わりに復活できる」の確認。action は解決せず、
    // 選べばコストを払って復活が確定し、選ばなければ見送っていた破壊をここで行う
    if (pending.reviveConfirm) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const entry = pending.reviveConfirm
        state.pendingChoice = null
        if (option !== undefined) {
            applyReviveConfirm(state, entry)
        } else {
            declineReviveConfirm(state, entry)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 合体スピリットが場を離れたときの「ブレイヴを残しますか？」の確認（BRAVE.md §6.3）。
    // action は解決せず、選べばコアを置いてフィールドへ戻し、選ばなければトラッシュへ置く
    if (pending.braveKeep) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.braveKeep
        // 支払い元の検証は召喚と同じ形。**指定が無いときは検証しない**（リザーブで足りなければ
        // applyBraveKeep がフィールドのコアから自動で補う。AI・自動応答はここを通る）
        if (option !== undefined && paySources !== undefined) {
            const invalid = validatePaySources(state, info.pid, info.need, paySources)
            if (invalid) return invalid
        }
        state.pendingChoice = null
        if (option !== undefined) applyBraveKeep(state, info, paySources)
        else declineBraveKeep(state, info)
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 器AR（BS13-034）：デッキ破棄効果で破棄されたこのカードを、コストを支払わず召喚するかの確認。action は解決しない
    if (pending.spiritMillFreeSummon) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.spiritMillFreeSummon
        state.pendingChoice = null
        if (option !== undefined) {
            applySpiritMillFreeSummon(state, info)
        } else {
            declineSpiritMillFreeSummon(state, info)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 【不死】（BS09）：トラッシュのこのカードを、コストを支払って召喚するかの確認。action は解決しない
    if (pending.fushiSummon) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.fushiSummon
        state.pendingChoice = null
        if (option === "魔門を疲労させて無償で召喚する") {
            // BS15-064冥府へ続く魔門Lv2：未疲労の魔門を疲労させ、コストを支払わずに召喚する（召喚時効果は発揮されない）
            applyFushiSummon(state, info, true)
        } else if (option !== undefined) {
            applyFushiSummon(state, info)
        } else {
            log(state, `${getCard(info.cardId).name}：【不死】で召喚しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 同時に発揮する誘発のうち「どれから解決するか」（ターンプレイヤーが決める）。
    // action は解決せず、選ばれた番号を記録して誘発バッチの再開へ戻す（docs/design/TIMING_CHART.md §0-3）
    if (pending.triggerOrder) {
        const options = pending.options ?? []
        if (option === undefined) return "どの効果から解決するか選んでください"
        const index = options.indexOf(option)
        if (index < 0 || index >= pending.triggerOrder.count) return "選択できない候補です"
        state.pendingChoice = null
        state.triggerOrderPick = index
        return finishChoiceResolution(state, pending.pid)
    }

    // 同時に破壊される複数体のうち「どの体から破壊処理をするか」（ターンプレイヤーが決める）。
    // action は解決せず、選ばれた個体を記録して破壊バッチの再開へ戻す（docs/design/TIMING_CHART.md §0-3）
    if (pending.destroyOrder) {
        const options = pending.options ?? []
        if (option === undefined) return "どのスピリットから破壊処理をするか選んでください"
        const index = options.indexOf(option)
        const picked = pending.destroyOrder.instanceIds[index]
        if (index < 0 || picked === undefined) return "選択できない候補です"
        state.pendingChoice = null
        state.destroyOrderPick = picked
        return finishChoiceResolution(state, pending.pid)
    }

    // 【烈神速】：トラッシュのコアの置き先を1個ぶん選ぶ（BS16-X03）。action は解決せず、
    // 選んだ置き先へ1個（一括なら残り全部）置いてから、残っていればまた同じ選択を出す
    if (pending.distributeCores) {
        const options = pending.options ?? []
        if (option === undefined) return "コアの置き先を選んでください"
        const index = options.indexOf(option)
        const destination = pending.distributeCores.destinations[index]
        if (index < 0 || destination === undefined) return "選択できない候補です"
        const info = pending.distributeCores
        state.pendingChoice = null
        applyResshinsokuDestination(state, pid, info, destination)
        if (state.winner) return null
        return finishChoiceResolution(state, pid)
    }

    // 「デッキの破棄を、コストを払って無効にできる」の確認（BS08鳳翼の聖剣Lv2）。action は解決せず、
    // 選べばコストを払って破棄が無効になり、選ばなければ見送っていた破棄をここで行う
    if (pending.deckMillNegate) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const entry = pending.deckMillNegate
        state.pendingChoice = null
        if (option !== undefined) {
            applyDeckMillNegate(state, entry)
        } else {
            declineDeckMillNegate(state, entry)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 「相手のメインステップ終了時に使用できる」マジックの使用確認（BS15-079プロボケイション）。
    // action は解決せず、選べば使用してからアタックステップへ、選ばなくてもそのままアタックステップへ進む
    // アタックステップ終了後に行うステップの選択（BS15-X04 機獣要塞ナウマンガルド Lv2）。断れない
    if (pending.extraStepChoice) {
        if (option === undefined || !(EXTRA_STEP_OPTIONS as readonly string[]).includes(option)) {
            return "行うステップを選んでください"
        }
        state.pendingChoice = null
        runExtraStep(state, option)
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    if (pending.provocationUse) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const entry = pending.provocationUse
        state.pendingChoice = null
        if (option !== undefined) {
            applyProvocationUse(state, entry)
        } else {
            log(state, `${getCard(entry.cardId).name}：使用しなかった。`)
        }
        if (state.winner) return null
        // 使わなかった直接ターン終了は endTurn に任せる（phase が main なのでアタックステップを経由する）
        if (option === undefined && entry.endTurnIfDeclined) endTurn(state)
        else toAttackPhase(state)
        return finishChoiceResolution(state, pending.pid)
    }

    // 再発揮の確認（BS07大天使イスフィール）。action は解決せず、
    // 選べば効果の並びをもう1周し、選ばなければマジック使用時の誘発へ進む
    if (pending.magicRepeat) {
        const options = pending.options ?? []
        if (option === undefined) return "もう1度発揮するかどうか選んでください"
        const index = options.indexOf(option)
        if (index < 0) return "選択できない候補です"
        const info = pending.magicRepeat
        state.pendingChoice = null
        applyMagicRepeatChoice(state, info, index === 0) // 0=もう1度発揮する
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 無償化の使用時確認（BS07大天使イスフィールほか）。action は解決せず、
    // 答えを持って doCastMagic をやり直す（コストの支払いはそのやり直しの中で行う）
    if (pending.magicFreeChoice) {
        const options = pending.options ?? []
        if (option === undefined) return "コストを支払うかどうか選んでください"
        const index = options.indexOf(option)
        if (index < 0) return "選択できない候補です"
        const info = pending.magicFreeChoice
        state.pendingChoice = null
        const error = doCastMagic(
            state,
            pending.pid,
            info.handIndex,
            info.targetInstanceId,
            info.paySources,
            info.fromTegamoto,
            index === 0, // 0=コストを支払わずに使用する
        )
        if (error) return error
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 対象の変更の確認（BS02封印された魔導書Lv1）。action は解決せず、
    // どちらを対象として残すかを記録してから、中断していたマジックの解決を続ける。
    // options の並びは BOTH_SIDES_REDIRECT_OPTIONS（0=変更しない / 1=相手のみ / 2=自分のみ）で、
    // 「相手」「自分」はどちらも**魔導書の持ち主から見た**呼び方
    if (pending.magicSideChoice) {
        const options = pending.options ?? []
        if (option === undefined) return "対象をどちらに変更するか選んでください"
        const index = options.indexOf(option)
        if (index < 0) return "選択できない候補です"
        const info = pending.magicSideChoice
        state.pendingChoice = null
        const keepPid =
            index === 0 ? null : index === 1 ? opponentOf(info.ownerPid) : info.ownerPid
        applyMagicSideChoice(state, info, keepPid)
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    // 対象の絞り込みの確認（BS04サンク／BS05スノーホワイト）。action は解決せず、
    // 承認・拒否のどちらでも中断していたマジックの解決を続ける（絞り込むかだけが変わる）
    if (pending.magicRedirect) {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        const info = pending.magicRedirect
        state.pendingChoice = null
        if (option === undefined) {
            const source = findInstanceAnywhere(state, info.sourceInstanceId)
            const name = source ? getCard(source.cardId).name : "効果"
            log(state, `${name}：${getCard(info.cardId).name}の対象を絞り込まなかった。`)
        }
        applyMagicRedirectChoice(state, info, option !== undefined)
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    if (pending.kind === "option") {
        if (option !== undefined && !(pending.options ?? []).includes(option)) {
            return "選択できない候補です"
        }
        if (option === undefined && !pending.optional) {
            return "選択肢を選んでください"
        }
        state.pendingChoice = null
        const self = pending.selfInstanceId ? findInstanceAnywhere(state, pending.selfInstanceId) ?? null : null
        // 実行者は actorPid（省略時は選択者自身）。「相手に選ばせて自分の効果として解決する」形に対応する
        const actor = pending.actorPid ?? pending.pid
        if (option !== undefined) {
            // confirm（「〜できる」の発動確認）は選んだラベルを渡さない。
            // 渡すと、選択肢を解釈するアクション（grantColorChoice 等）が誤動作する
            if (pending.confirm) {
                // 発動を選んだ側もログに残す（発動しなかった場合と対になる。発生源がログから追えるように）
                log(state, `${self ? getCard(self.cardId).name : "効果"}：効果を発動した。`)
                if (pending.burstThenPay) {
                    // バーストのthenPay：確認どおりコストを支払ってから発揮する（docs/design/BURST.md）
                    const info = pending.burstThenPay
                    state.players[info.pid].reserve -= info.cost
                    log(state, `${state.players[info.pid].name}はコスト${info.cost}を支払った。`)
                    // 非対話の tryBurstThenPay と同じく、マジックの色と種別を渡す（【装甲】などの効果耐性。BURST.md §7）。
                    // 色は magicEffectiveColors を通す（BS15_PLAN.md §7.3）
                    resolveAction(state, actor, self, pending.action, undefined, magicEffectiveColors(state, info.pid, getCard(info.cardId)), "magic", undefined, undefined, info.cardId)
                } else if (pending.burstActivate) {
                    // バーストの発動確認（docs/design/BURST.md）。承認された時点でバーストエリアはまだ
                    // 空にしていない（cardIdは保持しておく必要があるため）。resolveAction のあとで
                    // finishBurstActivation がバーストエリアの後始末（召喚以外はトラッシュへ）を行う
                    const info = pending.burstActivate
                    const before = fieldInstanceIdsOf(state, info.pid)
                    // バースト効果を解決している間だけ目印を立てる（coreReturnBonus.ownBurstOnly。BS14-019）
                    state.resolvingBurstPid = info.pid
                    // BS15共通器：EffectCounter "burstEventCost" 用（BS15-084／BS15-X06）。
                    // BS16バッチ0：burstEventCostOptionsがあれば、選んだ選択肢（pending.optionsと同じ並び）のコストを使う
                    if (info.burstEventCostOptions !== undefined) {
                        const idx = (pending.options ?? []).indexOf(option)
                        state.burstEventCost = info.burstEventCostOptions[idx] ?? Math.max(...info.burstEventCostOptions)
                    } else if (info.burstEventCost !== undefined) {
                        state.burstEventCost = info.burstEventCost
                    } else {
                        delete state.burstEventCost
                    }
                    // BS16共通器：条件{burstDestroyedColor}用
                    if (info.burstEventColors !== undefined) state.burstEventColors = info.burstEventColors
                    else delete state.burstEventColors
                    if (info.burstEventLifeDamagerId !== undefined) state.burstEventLifeDamagerId = info.burstEventLifeDamagerId
                    else delete state.burstEventLifeDamagerId
                    // バーストのカードの色と種別を渡す（【装甲】などの効果耐性。非対話の triggers.ts と同じ。BURST.md §7）。
                    // 色は magicEffectiveColors を通す（BS15_PLAN.md §7.3）
                    const burstCard = getCard(info.cardId)
                    resolveAction(state, actor, self, pending.action, info.destroyedCardId, magicEffectiveColors(state, info.pid, burstCard), burstCard.type, undefined, undefined, info.cardId)
                    delete state.resolvingBurstPid
                    if (info.alsoDraw && !state.winner && !state.pendingChoice) resolveAction(state, info.pid, null, { type: "draw", count: 1 })
                    if (!state.pendingChoice) {
                        finishBurstActivation(state, info.pid, info.cardId, pending.action.type, info.thenPay, info.toHand ? { toHand: true } : undefined)
                        if (!state.pendingChoice) fireOwnBurstActivated(state, info.pid, before, info.cardId)
                    }
                } else {
                    delete state.effectFizzled
                    resolveAction(state, actor, self, pending.action)
                    // 発動を選んだがコストを払えず不発だった＝発揮していないので「ターンに1回」を戻す（2026-09-16）
                    if (state.effectFizzled) revertActivatedIfSkipped(state, pending)
                    delete state.effectFizzled
                }
            } else {
                resolveAction(state, actor, self, pending.action, undefined, undefined, undefined, option)
            }
        } else {
            const name = self ? getCard(self.cardId).name : "効果"
            log(state, pending.confirm ? `${name}：効果を発動しなかった。` : `${name}：選択しなかった。`)
            // 「〜できる」を断った＝発揮していないので「ターンに1回」を戻す（2026-09-16）
            revertActivatedIfSkipped(state, pending)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    if (pending.kind === "card") {
        if (cardIndex !== undefined && !(pending.cardIndices ?? []).includes(cardIndex)) {
            return "選択できない対象です"
        }
        if (cardIndex === undefined && !pending.optional) {
            return "対象を選択してください"
        }
        state.pendingChoice = null
        const self = pending.selfInstanceId ? findInstanceAnywhere(state, pending.selfInstanceId) ?? null : null
        if (cardIndex !== undefined) {
            resolveAction(state, pending.actorPid ?? pending.pid, self, pending.action, undefined, undefined, undefined, undefined, cardIndex, undefined, paySources)
        } else if (pending.resolveOnSkip) {
            // 「選び終わったら後処理がある」効果（BS08堕天使ミカファール：破棄した枚数ぶんドローする）。
            // スキップ＝「もう選ばない」の合図なので、cardIndex なしで action をもう一度解決させる
            resolveAction(state, pending.actorPid ?? pending.pid, self, pending.action)
        } else {
            // 起動能力から出た選択をやめた＝発揮しなかった扱いにして、同じターンにもう一度起動できるようにする
            revertActivatedIfSkipped(state, pending)
            log(state, `${self ? getCard(self.cardId).name : "効果"}：選択しなかった。`)
        }
        if (state.winner) return null
        return finishChoiceResolution(state, pending.pid)
    }

    if (instanceId !== undefined && !pending.candidates.includes(instanceId)) {
        return "選択できない対象です"
    }
    if (instanceId === undefined && !pending.optional) {
        return "対象を選択してください"
    }

    state.pendingChoice = null
    const self = pending.selfInstanceId ? findInstanceAnywhere(state, pending.selfInstanceId) ?? null : null

    if (instanceId !== undefined) {
        resolveAction(state, pending.actorPid ?? pending.pid, self, pending.action, instanceId)
    } else if (pending.resolveOnSkip) {
        // 「選び終わったら後処理がある」効果（予算内で好きなだけ破壊するトグル選択）。
        // スキップ＝「これで確定」の合図なので、対象なしで action をもう一度解決させる
        resolveAction(state, pending.actorPid ?? pending.pid, self, pending.action)
    } else {
        log(state, `${self ? getCard(self.cardId).name : "効果"}：対象を選ばなかった。`)
    }
    if (state.winner) return null
    return finishChoiceResolution(state, pending.pid)
}

// 選択解決後の共通後処理：queue を消化し、消化しきって新たな選択待ちも無く勝敗も未決なら、
// ステップ誘発の pendingChoice で中断していたターン開始処理を続きのステップから再開する
// （百識の谷Lv1のドローステップ破棄選択など。中断していなければ resumeTurnStart は no-op）。
function finishChoiceResolution(state: GameState, pid: PlayerId): string | null {
    drainResumeStack(state, pid)
    return null
}

// 再開スタック（中断された残りの処理）を先頭から1つずつ消化する。
//
// **中断が起きたら、その場で止めるだけでよい**（残りはスタックに載ったまま）。
// 新しい中断で積まれたフレームは pushResumeFrames が「今回の領域の末尾」＝古いフレームより前へ
// 入れるので、配列は常に「内側 → 外側 → 古いもの」の正しい実行順に並ぶ。
// 移行前は queue を引数で持ち回り、中断のたびに新しい pendingChoice へ積み直していた
// （docs/design/RESUME_STACK.md §2・§3）
function drainResumeStack(state: GameState, pid: PlayerId): string | null {
    // 直前のアクションが新しい選択待ちを立てていたら、消化せずそのまま中断を続ける
    // （選択の解決中にさらに選択が必要になるケース。例：【転召】でコアを置く先を選んだあと、
    // その対象が【転召】置換を持っていて「疲労するか」を続けて聞く）
    while (!state.pendingChoice && !state.winner && (state.resumeStack.length > 0 || (state.pendingBraveKeeps?.length ?? 0) > 0)) {
        // 脇に置いたままのブレイヴ（BRAVE.md §6.3）を先に決着させる。detachBravesOnLeave 直後の
        // 確認が別の中断に上書きされていても、ここで聞き直せる（エントリは答えるまで消えない）
        flushBraveKeeps(state)
        if (state.pendingChoice || state.resumeStack.length === 0) continue
        const frame = state.resumeStack.shift()
        if (!frame) continue
        if (frame.kind === "placeSummon") {
            // 【転召】の対象選択で中断していた召喚の続き。維持コアを置いて場に出し、召喚時効果へ進む
            placeSummonedSpirit(state, frame.pid, frame.inst, frame.reserveDelta, frame.logText, frame.cardName, frame.braveTargetInstanceId)
            continue
        }
        if (frame.kind === "endTurn") {
            // メインから直接ターン終了して経由したアタックステップの開始時誘発が片付いたので、ターン終了をやり直す
            endTurn(state)
            continue
        }
        if (frame.kind === "turnStart") {
            // 中断していたターン開始処理を続きのステップから再開する
            // （百識の谷Lv1のドローステップ破棄選択など）
            driveTurnStart(state, frame.step, frame.until)
            continue
        }
        if (frame.kind === "destroyBatch") {
            resumeDestroyBatch(state, frame)
            continue
        }
        if (frame.kind === "destroyNexusCommit") {
            // 破壊待機状態のまま中断していたネクサスの破壊処理を続ける
            resumeDestroyNexusCommit(state, frame)
            continue
        }
        if (frame.kind === "destroyCommit") {
            // 破壊待機状態のまま中断していた破壊処理（誘発の残り＋トラッシュ行き）を続ける
            resumeDestroyCommit(state, frame)
            continue
        }
        if (frame.kind === "bounceFlush") {
            // バウンス待機から実際に戻したあとの誘発が中断していた。残りの体ぶんを続ける
            fireBounceTriggers(state, frame.moved, frame.index)
            continue
        }
        if (frame.kind === "battleResolve") {
            // 中断していたバトル解決（＞６破壊処理〜＞７バトル終了）を続きのステップから再開する
            resumeBattleResolution(state, frame)
            continue
        }
        if (frame.kind === "triggerBatch") {
            resumeTriggerBatch(state, frame)
            continue
        }
        // requiresPendingDestructionOf：破壊で誘発した効果の列の残り。途中で
        // 「フィールドに残る／戻る」が解決してその破壊が無かったことになっていれば空振りさせる
        // （docs/design/TIMING_CHART.md）。フレームは消さず、ここで無効化する
        if (frame.requiresPendingDestructionOf !== undefined) {
            const target = findInstanceAnywhere(state, frame.requiresPendingDestructionOf)
            if (target == null || target.pendingDestruction !== true) continue
        }
        // logText：ステップ誘発の「〜の効果が発動した」を、再開経路でも同じ位置に残す
        if (frame.logText !== undefined) log(state, frame.logText)
        const frameSelf = frame.selfInstanceId
            ? findInstanceAnywhere(state, frame.selfInstanceId) ?? null
            : null
        // optional な誘発の残りは、解決ではなく**発動確認から**再開する
        if (frame.confirmPrompt !== undefined) {
            requestActivationConfirm(state, frame.actorPid ?? pid, frame.confirmPrompt, frame.action, frameSelf)
            continue
        }
        // targetInstanceId / sourceColors / sourceType は fieldEvent 誘発の残りを再開するときだけ入る
        resolveAction(
            state,
            frame.actorPid ?? pid,
            frameSelf,
            frame.action,
            frame.targetInstanceId,
            frame.sourceColors,
            frame.sourceType,
        )
    }
    return null
}
