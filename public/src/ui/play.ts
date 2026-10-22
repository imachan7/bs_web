// 対戦中のクリック操作：手札・スピリットを押したときの召喚・アタック・選択の応答
import type { CardData, GameAction, PaySource } from "../../../server/src/type"
import { canDirectAttack, effectiveCost, hasKeyword, magicTargetSide, master, matchesDirectedAttackFilter } from "../renderer"
import { exReductionSymbolsFor, type ExReductionGroup, payableFieldCores } from "./paying"
import { canAltSummonFromHand, flashSummonFromHandNow, attackTollTotal, attackPayTollCount, instMinLevelCores, placedCoresForSummon, timedContentsOn } from "../../../shared/rules"
import { canPayNexusCostByMill, canPaySummonCostByHandDiscard, exTrashReductionCandidateIndices, ownFieldSymbolColors } from "../../../shared/cost"
import { braveCombineCandidates, canBattleSwapSummon, isSummonableCardType } from "../../../shared/summon"
import { blockPayCost } from "../../../shared/block"
import { magicTimingChoosable, magicUseTiming } from "../../../shared/magicTiming"
import { toggleDiscardPay, startChoicePaying, assignPayCore } from "./payInput"
import { view, ui, send, rerender, opponentOf } from "../main"

// 器BM（BS13-043 鳥人イカロッシュ）／器BU（BS13-047 深海大帝ノーグ・デンス）：
// アタック・ブロックの宣言そのものに追加コストが要る場面で、押し間違いでコアやマジックを
// 失わないよう確認をはさむ（2026-09-10 ユーザー確認：断ればアタック／ブロックしない）。
// サーバーは宣言が成立したら自動で支払う（払えないときは validateAttack / validateBlock が弾く）ので、
// 「断る＝そもそも宣言しない」をクライアント側で表現する。
// アタックの送信口が3か所（通常・指定アタックの対象選択・相手プレイヤーへの指定）あるため send() に1つ置く
export function confirmExtraCost(action: GameAction): boolean {
    if (!view) return true
    if (action.type === "attack") {
        const inst = view.players[view.you].field.spirits.find((s) => s.instanceId === action.instanceId)
        const toll = inst ? attackTollTotal(view, view.you, inst) - (action.paySources ? attackPayTollCount(view, view.you, inst) : 0) : 0
        if (!inst || toll === 0) return true
        return window.confirm(
            `${master(inst.cardId).name}のアタックには、リザーブのコア${toll}個をトラッシュに置く必要があります。\n\n` +
                "支払ってアタックしますか？",
        )
    }
    if (action.type === "block") {
        const battle = view.battle
        const attacker = battle ? view.players[view.you === "p1" ? "p2" : "p1"].field.spirits.find((s) => s.instanceId === battle.attackerInstanceId) : undefined
        if (!attacker || !timedContentsOn(view, attacker).some((c) => c.type === "blockCost" && c.cost === "discardMagic")) return true
        return window.confirm(
            "ブロックするには、手札のマジックカード1枚を破棄する必要があります。\n\n破棄してブロックしますか？",
        )
    }
    return true
}

// スピリット／ネクサスからコアを1個取り除く。
// 自分のスピリットが**維持コア（Lv1）を下回る**ときは、消滅することを断ってから送る
// （コアをリザーブへ引き上げて他の召喚や別のスピリットへ回すために、あえて退かせる操作。
// 2026-08-23 ユーザー要望）。ネクサスは Lv1 が0コアなのでこの確認は出ない
export function sendCoreRemove(instanceId: string): void {
    const inst = view?.players[view.you].field.spirits.find((s) => s.instanceId === instanceId)
    if (inst && inst.cores - 1 < instMinLevelCores(inst)) {
        const name = master(inst.cardId).name
        const ok = window.confirm(
            `${name}のコアを取り除くと維持コア（Lv1）を下回るため、${name}は消滅します。\n` +
                `残っているコアはリザーブに戻ります。\n\nよろしいですか？`,
        )
        if (!ok) return
        send({ type: "moveCore", instanceId, direction: "remove", confirmDeplete: true })
        return
    }
    send({ type: "moveCore", instanceId, direction: "remove" })
}

// [ソウルコア]をリザーブへ戻す。取り除くと維持コアを割るなら確認を取る（通常コアと同じ流れ）
export function sendSoulCoreRemove(instanceId: string): void {
    const inst = view?.players[view.you].field.spirits.find((s) => s.instanceId === instanceId)
    if (inst && inst.cores - 1 < instMinLevelCores(inst)) { // 案B-inside: 取り除いた後の cores で見る
        const name = master(inst.cardId).name
        const ok = window.confirm(
            `${name}の[ソウルコア]を取り除くと維持コア（Lv1）を下回るため、${name}は消滅します。
よろしいですか？`,
        )
        if (!ok) return
        send({ type: "moveCore", instanceId, direction: "remove", confirmDeplete: true, soulCore: true })
        return
    }
    send({ type: "moveCore", instanceId, direction: "remove", soulCore: true })
}

// カード種別に応じたアクションを送信する（paySources/targetInstanceId/levelは値がある場合のみキーを含める）
export function sendPlay(
    cardType: CardData["type"],
    handIndex: number,
    targetInstanceId?: string,
    paySources?: PaySource[],
    level?: number,
    substituteInstanceId?: string,
    discardHandIndices?: number[],
    millPay?: number,
    braveTargetInstanceId?: string,
    altSummonNexusInstanceIds?: string[],
    shinsokuAssistInstanceIds?: string[],
    exReductionTrashIndices?: number[],
    paySoulCoreFromReserve?: boolean, // リザーブの[ソウルコア]をコスト支払い1個ぶんとして使う
    placeSoulCoreFromReserve?: boolean, // リザーブの[ソウルコア]を維持コアとして召喚/配置した個体に置く
): void {
    // ブレイヴは単体で場に出すとスピリットとして扱われるので、召喚はこちらを通る（BRAVE.md §1.1）
    if (isSummonableCardType(cardType)) {
        send({
            type: "summon",
            handIndex,
            ...(paySources ? { paySources } : {}),
            ...(level !== undefined ? { level } : {}),
            ...(substituteInstanceId ? { substituteInstanceId } : {}),
            ...(discardHandIndices ? { discardHandIndices } : {}),
            ...(braveTargetInstanceId ? { braveTargetInstanceId } : {}),
            ...(altSummonNexusInstanceIds ? { altSummonNexusInstanceIds } : {}),
            ...(shinsokuAssistInstanceIds && shinsokuAssistInstanceIds.length > 0 ? { shinsokuAssistInstanceIds } : {}),
            ...(exReductionTrashIndices && exReductionTrashIndices.length > 0 ? { exReductionTrashIndices } : {}),
            ...(paySoulCoreFromReserve ? { paySoulCoreFromReserve } : {}),
            ...(placeSoulCoreFromReserve ? { placeSoulCoreFromReserve } : {})
        })
    } else if (cardType === "nexus") {
        send({ type: "setNexus", handIndex, ...(paySources ? { paySources } : {}), ...(level !== undefined ? { level } : {}), ...(millPay !== undefined ? { millPay } : {}), ...(paySoulCoreFromReserve ? { paySoulCoreFromReserve } : {}), ...(placeSoulCoreFromReserve ? { placeSoulCoreFromReserve } : {}) })
    } else if (cardType === "magic") {
        // **マジックのときだけ** castMagic を送る。かつてここは「それ以外はすべて castMagic」
        // という取りこぼしの受け皿になっており、ブレイヴが追加されたときに
        // 手札のブレイヴが castMagic として送られて場に出せなくなっていた（2026-08-28 修正）。
        // 今後カード種別が増えたときも、ここに書き足すまでは黙って誤送信されない
        send({
            type: "castMagic",
            handIndex,
            ...(ui.magicTiming ? { timing: ui.magicTiming } : {}),
            ...(targetInstanceId ? { targetInstanceId } : {}),
            ...(paySources ? { paySources } : {}),
            ...(exReductionTrashIndices && exReductionTrashIndices.length > 0 ? { exReductionTrashIndices } : {}),
            ...(paySoulCoreFromReserve ? { paySoulCoreFromReserve } : {}),
        })
    } else {
        // カード種別の網羅チェック。**新しい種別が増えるとここで typecheck が落ちる**ので、
        // 出し方を決めないまま既存のアクションへ紛れ込むことがない（2026-08-28 ユーザー指示）
        const unknown: never = cardType
        console.error(`このカード種別の出し方が未実装です: ${String(unknown)}`)
    }
}

// 軽減後コスト（+維持コア）がリザーブで足りるなら即送信、足りなければ支払いモードを開始する
export function tryPlay(handIndex: number, card: CardData, targetInstanceId: string | undefined, level?: number, substituteInstanceId?: string, braveTargetInstanceId?: string, altSummonNexusInstanceIds?: string[], exReductionTrashIndices?: number[], soulOnlyDeclined?: boolean, soulWaiver?: boolean): void {
    if (!view) return
    // 《ソウルマジック》(kind:"soulCoreOnlyCast")：「自分の◯シンボルがあれば[ソウルコア]だけで使用できる」。
    // 無償化（cost0）のときは軽減も支払いも不要なので選択を出さない。soulOnlyDeclinedは「通常どおり」を選んだ済みの印
    const v = view // view はモジュール変数のためクロージャ内では絞り込みが効かない。先に取り出す
    if (
        soulOnlyDeclined !== true &&
        card.type === "magic" &&
        effectiveCost(view, view.you, card) > 0 &&
        // [ソウルコア]はリザーブでも自分のスピリット/ネクサスの上でも使える（2026-10-06 ユーザー確認）
        (view.players[view.you].soulCore?.zone === "reserve" || view.players[view.you].soulCore?.zone === "instance") &&
        card.effects.some((e) => e.kind === "soulCoreOnlyCast" && ownFieldSymbolColors(v, v.you, e.symbolAs).has(e.color))
    ) {
        ui.targeting = null
        ui.awakenTarget = null
        ui.paying = null
        ui.directedAttack = null
        ui.summonLevelSelect = null
        ui.battleSwapSummon = null
        ui.braveSummonSelect = null
        ui.altSummonSelect = null
        ui.exReductionSelect = null
        ui.soulCoreOnlySelect = { handIndex, cardId: card.cardId, ...(targetInstanceId ? { targetInstanceId } : {}) }
        rerender()
        return
    }
    // 《継召》(kind:"exTrashReduction")：コストを支払う通常のスピリット/ブレイヴ単体の召喚・マジックの使用で、
    // トラッシュにEXシンボル持ちカードがあるとき、除外するカードを選ばせてから先へ進む
    // （exReductionTrashIndices が未指定のときだけ開く。空配列＝「使わない」を選んだ済み）
    if (
        exReductionTrashIndices === undefined &&
        (card.type === "spirit" || card.type === "brave" || card.type === "magic") &&
        // マジックが効果で無償化（cost 0）されているときは軽減するものが無いため選択モードを開かない
        effectiveCost(view, view.you, card) > 0 &&
        card.effects.some((e) => e.kind === "exTrashReduction") &&
        substituteInstanceId === undefined &&
        braveTargetInstanceId === undefined &&
        altSummonNexusInstanceIds === undefined
    ) {
        // 候補は軽減に効くカード（色一致）だけ。同一カードは1グループにまとめて枚数で選ばせる
        const trash = view.players[view.you].trashCards
        const useful = exTrashReductionCandidateIndices(view, view.you, card).filter((i) =>
            master(trash[i]!).symbol.some((c) => card.reduction.includes(c)),
        )
        if (useful.length > 0) {
            const groups: ExReductionGroup[] = []
            for (const idx of useful) {
                const trashCardId = trash[idx]!
                const group = groups.find((g) => g.trashCardId === trashCardId)
                if (group) group.indices.push(idx)
                else groups.push({ trashCardId, indices: [idx], count: 0 })
            }
            ui.targeting = null
            ui.awakenTarget = null
            ui.paying = null
            ui.directedAttack = null
            ui.summonLevelSelect = null
            ui.battleSwapSummon = null
            ui.braveSummonSelect = null
            ui.altSummonSelect = null
            ui.exReductionSelect = { handIndex, cardId: card.cardId, ...(targetInstanceId ? { targetInstanceId } : {}), phase: "ask", groups }
            rerender()
            return
        }
    }
    // 代替召喚（kind:"altSummonFromHand"）は召喚コストを支払わない。維持コアは通常どおり必要
    const cost = altSummonNexusInstanceIds ? 0 : effectiveCost(view, view.you, card, false, exReductionSymbolsFor(view, exReductionTrashIndices))
    
    // 入れ替え召喚（substituteInstanceId あり）の場合は強制Lv1（維持コア=minLevelCores）になるためレベル選択をスキップする
    // ダイレクトブレイヴ（braveTargetInstanceId あり）は合体状態のLv1固定でコアを置かないため、
    // 入れ替え召喚と同じくレベル選択をスキップする（サーバーもレベル指定を受け付けない）
    if (level === undefined && substituteInstanceId === undefined && braveTargetInstanceId === undefined && soulWaiver !== true && (card.type === "spirit" || card.type === "nexus")) {
        const reserve = view.players[view.you].reserve
        const cardIdForField = view.players[view.you].hand?.[handIndex]
        // コストも置くコアも、リザーブに加えてフィールドのコアで賄える（2026-08-01）ため、
        // 選択肢に出すレベルの判定にもフィールドのコアを含める
        const fieldCores = cardIdForField ? payableFieldCores(view, cardIdForField) : 0
        const affordableLevels = card.levels.filter((l) => reserve + fieldCores >= cost + l.cores)
        // 《真界放》のwaiver配置（[ソウルコア]1個でLv2）が選べるなら、レベルが1つしか
        // 買えなくても選択ステップを出す（3パターンの選択。2026-10-07 ユーザー指示）
        const soulInReserveEarly = view.players[view.you].soulCore?.zone === "reserve"
        const waiverAvailable =
            card.levels.some((l) => l.soulCoreRequired === true) && soulInReserveEarly && reserve + fieldCores >= cost + 1

        // If they can afford Lv2 or higher, show level selection
        if (affordableLevels.length > 1 || waiverAvailable) {
            const cardId = view.players[view.you].hand?.[handIndex]
            if (!cardId) return
            ui.targeting = null
            ui.awakenTarget = null
            ui.paying = null
            ui.directedAttack = null
            // 空配列＝「《継召》を使わない」を選んだ済みの印。レベル選択を挟んでも引き継ぐ（落とすと無限ループ）
            ui.summonLevelSelect = { handIndex, cardId, ...(targetInstanceId ? { targetInstanceId } : {}), ...(altSummonNexusInstanceIds ? { altSummonNexusInstanceIds } : {}), ...(exReductionTrashIndices !== undefined ? { exReductionTrashIndices } : {}) }
            rerender()
            return
        }
        
        // If they can't even afford Lv1 from reserve, affordableLevels.length is 0. 
        // We just fall through and it will enter paying mode for Lv1.
        // If they can afford exactly Lv1, it falls through and sends instantly.
    }
    
    // 置くコア数。サーバー（placedCoresForSummon）と同じ計算。soulWaiver＝《真界放》の
    // waiver配置（[ソウルコア]1個のみでLv2。2026-10-07）のときはレベルではなく1コア
    const maintain =
        soulWaiver === true
            ? 1
            : card.type === "magic" || braveTargetInstanceId !== undefined
              ? 0
              : placedCoresForSummon(card, level)
    const reserve = view.players[view.you].reserve

    // 栄光の表彰台Lv1：ネクサスの配置コストを、コアの代わりにデッキ破棄で払える。
    // **コア払いとの併用はできない**ので全額（＝実効コスト）払えるときだけ選択肢になる
    // （判定を揃えないと、サーバーが受け付ける配置をクライアントが支払いモードに入れてしまう）
    const millPayable =
        card.type === "nexus" &&
        canPayNexusCostByMill(view, view.you) &&
        view.players[view.you].deckCount >= cost
            ? cost
            : 0

    // BS08ビクティム：スピリットの召喚コストは、コアで足りない分を手札破棄で払える。
    // **召喚するカード自身は破棄に使えない**ので手札枚数から1枚引く
    const handDiscardPayable =
        card.type === "spirit" && canPaySummonCostByHandDiscard(view, view.you)
            ? Math.min(cost, Math.max(0, view.players[view.you].handCount - 1))
            : 0

    // 代替コスト（手札破棄／デッキ破棄）が使えるなら、**コアが足りていても支払いモードへ入る**。
    // 手札破棄はどこまで代替で払うか、デッキ破棄はコアで払うかデッキで払うかをプレイヤーが選ぶ
    // （そのまま確定すれば従来どおり全額コア払いになる）
    const altAvailable = millPayable > 0 || handDiscardPayable > 0
    // 案B-inside: reserveには[ソウルコア]が含まれる。auto即送信は通常コアで足りるときだけにして、
    // [ソウルコア]を使うかどうかは支払いモードのトグルでプレイヤーが選ぶ（2026-10-05確定）
    const soulInReserve = view.players[view.you].soulCore?.zone === "reserve"
    // waiver配置は維持コア1個を[ソウルコア]が担うため、通常コアはコストぶんだけで足りる
    if (soulWaiver === true && ui.payMode === "auto" && !altAvailable && soulInReserve && reserve - 1 >= cost) {
        sendPlay(card.type, handIndex, targetInstanceId, undefined, undefined, substituteInstanceId, undefined, undefined, braveTargetInstanceId, altSummonNexusInstanceIds, undefined, exReductionTrashIndices, undefined, true)
        return
    }
    if (ui.payMode === "auto" && !altAvailable && soulWaiver !== true && reserve - (soulInReserve ? 1 : 0) >= cost + maintain) {
        sendPlay(card.type, handIndex, targetInstanceId, undefined, level, substituteInstanceId, undefined, undefined, braveTargetInstanceId, altSummonNexusInstanceIds)
        return
    }
    // コアが足りない、または代替コストを選べる → 支払いモードを開始（他のモードは排他的に解除する）
    ui.targeting = null
    ui.awakenTarget = null
    ui.summonLevelSelect = null
    ui.battleSwapSummon = null
    ui.braveSummonSelect = null
    ui.altSummonSelect = null
    ui.exReductionSelect = null
    ui.soulCoreOnlySelect = null
    ui.magicTimingSelect = null
    ui.soulSwapSelect = null
    ui.combineBrave = null
    ui.paying = { 
        handIndex, 
        ...(targetInstanceId ? { targetInstanceId } : {}), 
        assigned: {}, 
        discardHandIndices: [],
        millPay: 0,
        shinsokuAssistInstanceIds: [],
        ...(exReductionTrashIndices && exReductionTrashIndices.length > 0 ? { exReductionTrashIndices } : {}),
        ...(level !== undefined ? { level } : {}),
        ...(substituteInstanceId ? { substituteInstanceId } : {}),
        ...(braveTargetInstanceId ? { braveTargetInstanceId } : {}),
        ...(altSummonNexusInstanceIds ? { altSummonNexusInstanceIds } : {})
    }
    // 案B-inside: 通常コアがちょうど1個ぶんだけ足りないときは[ソウルコア]の使い方を事前選択する。
    // 維持コアを置くカードなら「維持コアとして置く」（自然な初期値。2026-10-06 ユーザー確認）、
    // マジックなら「コスト支払いに使う」
    if (soulInReserve) {
        const normals = reserve - 1
        if (normals === cost + maintain - 1) {
            if (maintain >= 1) ui.paying.placeSoulCore = true
            else ui.paying.useSoulCore = true
        }
    }
    // waiver配置（[ソウルコア]1個のみでLv2）を選んだときは[ソウルコア]の使い方を「維持コア」に
    // 固定して支払いモードに入る（3択トグルで「使わない」に変えれば通常のLv1配置に戻る）
    if (soulWaiver === true && soulInReserve) ui.paying.placeSoulCore = true
    rerender()
}

// pendingChoiceが自分宛かつkind:"card"・cardZone:"hand"、クリックしたhandIndexが候補内なら
// resolveChoice を送信する。送信したら true を返す（呼び出し側はそこで処理を打ち切る）
export function tryResolveCardChoice(handIndex: number): boolean {
    if (!view || !view.pendingChoice) return false
    if (view.pendingChoice.pid !== view.you) return false
    if (view.pendingChoice.kind !== "card" || view.pendingChoice.cardZone !== "hand") return false
    if (!(view.pendingChoice.cardIndices ?? []).includes(handIndex)) return false
    // 「コストを支払って召喚できる」起動効果（BS08帝竜騎サイクル）で、リザーブだけでは
    // 払えないときは支払いモードへ入る（フィールドのコアの割り当てを決めてから送る）
    if (startChoicePaying(handIndex)) return true
    send({ type: "resolveChoice", cardIndex: handIndex })
    return true
}

// バーストセットボタン（docs/design/BURST.md）。すでにバーストがセットされている場合は
// 上書き（旧カードがトラッシュへ送られる）ことになるので、押し間違い防止に確認をはさむ
export function onBurstSetClick(handIndex: number): void {
    if (!view) return
    if (view.players[view.you].burstSet) {
        ui.burstResetConfirm = { handIndex }
        rerender()
        return
    }
    send({ type: "setBurst", handIndex })
}

// 手札から使う効果（kind:"handActivated"。BS15-011ミーアバット）。
// 対象選択はサーバー側の bpBuff.anySide の既存経路（対話ならPendingChoice）に任せるので、
// クライアントは useHandAbility を送るだけでよい
export function onHandAbilityClick(handIndex: number, effectId: string): void {
    if (!view) return
    send({ type: "useHandAbility", handIndex, effectId })
}

// 手札のマジックのバースト効果を発揮する（handBurstEffectGrant）。通常のマジック使用（onHandClick）とは別操作
export function onHandBurstEffectClick(handIndex: number): void {
    if (!view) return
    const cardId = view.players[view.you].hand?.[handIndex]
    if (cardId === undefined) return
    const cost = effectiveCost(view, view.you, master(cardId))
    const player = view.players[view.you]
    const soulInReserve = player.soulCore?.zone === "reserve"
    if (ui.payMode === "auto" && player.reserve - (soulInReserve ? 1 : 0) >= cost) {
        send({ type: "useHandBurstEffect", handIndex })
        return
    }
    ui.targeting = null
    ui.awakenTarget = null
    ui.summonLevelSelect = null
    ui.battleSwapSummon = null
    ui.braveSummonSelect = null
    ui.altSummonSelect = null
    ui.exReductionSelect = null
    ui.soulCoreOnlySelect = null
    ui.magicTimingSelect = null
    ui.soulSwapSelect = null
    ui.combineBrave = null
    ui.paying = { handIndex, forHandBurst: true, assigned: {}, discardHandIndices: [], millPay: 0, shinsokuAssistInstanceIds: [] }
    if (soulInReserve && player.reserve - 1 === cost - 1) ui.paying.useSoulCore = true
    rerender()
}

export function onHandClick(handIndex: number): void {
    if (!view) return
    // 選択待ち中は通常の手札操作（召喚等）をすべて抑止する。自分宛のkind:"card"・cardZone:"hand"
    // なら選択を送信し、それ以外（相手宛や別kind）は何もしない
    if (view.pendingChoice) {
        tryResolveCardChoice(handIndex)
        return
    }
    if (ui.awakenTarget !== null || ui.soulSwapSelect !== null) return // 覚醒/[ソウルコア]交換モード中は手札操作を抑止
    if (ui.paying !== null) {
        // 支払いモード中は新規の手札操作を抑止するが、
        // 代替コストで「破棄する手札を選ぶ」場合だけはクリックを受け付ける（BS08ビクティム）
        toggleDiscardPay(handIndex)
        return
    }
    if (ui.directedAttack !== null) return // 指定アタックの対象選択モード中は手札操作を抑止
    const hand = view.players[view.you].hand
    const cardId = hand?.[handIndex]
    if (cardId === undefined) return
    const card: CardData = master(cardId)

    const myTurn = view.turnPlayer === view.you
    const myMainFree = myTurn && view.phase === "main" && !view.battle
    // フラッシュ中で自分が優先権を持つとき（攻撃側・防御側どちらでも使用可）
    const inFlash =
        !!view.battle && view.isFlashTiming && view.priorityPlayer === view.you

    if (myMainFree) {
        // ブレイヴは「スピリット状態で召喚」と「合体した状態で召喚」を毎回選ばせる
        // （2026-08-28 ユーザー指示。合体先が無くても選択は出す＝何が起きるか分かるように）
        if (card.type === "brave") {
            ui.targeting = null
            ui.awakenTarget = null
            ui.paying = null
            ui.directedAttack = null
            ui.summonLevelSelect = null
            ui.battleSwapSummon = null
            ui.altSummonSelect = null
            ui.exReductionSelect = null
            ui.braveSummonSelect = {
                handIndex,
                cardId,
                candidateIds: braveCombineCandidates(view, view.you, cardId),
            }
            rerender()
            return
        }
        if (card.type === "spirit") {
            // 代替召喚（BS10-058）を持つカードは、通常召喚と代替召喚のどちらで出すか選ばせる
            const alt = canAltSummonFromHand(view, view.you, handIndex)
            if (alt.ok) {
                ui.targeting = null
                ui.awakenTarget = null
                ui.paying = null
                ui.directedAttack = null
                ui.summonLevelSelect = null
                ui.battleSwapSummon = null
                ui.braveSummonSelect = null
                ui.exReductionSelect = null
                ui.altSummonSelect = { handIndex, cardId, candidateNexusIds: alt.candidateNexusIds }
                rerender()
                return
            }
            tryPlay(handIndex, card, undefined)
            return
        }
        if (card.type === "nexus") {
            tryPlay(handIndex, card, undefined)
            return
        }
    }

    // 神速召喚または入れ替え召喚（フラッシュで手札のスピリットを使用）
    if (card.type === "spirit" && inFlash) {
        const swapOpt = canBattleSwapSummon(view, view.you, handIndex)
        const tempSoku = (view.players[view.you].tempHandKeywordGrants ?? []).some(
            (g) => g.cardId === cardId && g.keyword === "soku",
        )
        const canSoku = hasKeyword(cardId, "soku") || tempSoku || flashSummonFromHandNow(view, view.you, cardId)

        // 現在「神速」と「入れ替え召喚」を両方持つカードは存在しないため、排他的に処理する
        if (swapOpt) {
            ui.battleSwapSummon = { handIndex, substituteInstanceIds: swapOpt.substituteInstanceIds }
            rerender()
            return
        }

        if (canSoku) {
            tryPlay(handIndex, card, undefined)
            return
        }

        // 【烈神速】：お互いのアタックステップ、トラッシュのコア5個以上でコストを支払わず召喚する
        // （置き先はサーバーが立てる distributeCores の選択で1個ずつ聞かれる。BS16-X03）
        if (hasKeyword(cardId, "resshinsoku") && view.players[view.you].trashCores >= 5) {
            send({ type: "resshinsokuSummon", handIndex })
            return
        }
    }

    if (card.type === "magic" && (myMainFree || (inFlash && card.flash))) {
        ui.magicTiming = null
        // メインステップではメイン効果とフラッシュ効果のどちらを使うかを選ばせる
        if (!inFlash && magicTimingChoosable(card)) {
            ui.magicTimingSelect = { handIndex, cardId }
            rerender()
            return
        }
        startMagic(handIndex, card, magicUseTiming(card, inFlash) ?? "flash")
    }
}

// 使うタイミングが決まったマジックを、対象選択か使用へ進める。選ばせたときだけ timing を送信に付ける
export function startMagic(handIndex: number, card: CardData, timing: "main" | "flash", chosen = false): void {
    if (chosen) ui.magicTiming = timing
    const side = magicTargetSide(card, timing)
    if (side) {
        ui.targeting = { handIndex, side }
        rerender()
    } else {
        tryPlay(handIndex, card, undefined)
    }
}

// pendingChoiceが自分宛かつクリックしたinstanceIdが候補内なら resolveChoice を送信する。
// 送信したら true を返す（呼び出し側はそこで処理を打ち切る）
export function tryResolveChoice(instanceId: string): boolean {
    if (!view || !view.pendingChoice) return false
    if (view.pendingChoice.pid !== view.you) return false
    if (!view.pendingChoice.candidates.includes(instanceId)) return false
    send({ type: "resolveChoice", instanceId })
    return true
}

export function onMySpiritClick(instanceId: string): void {
    if (!view) return
    if (tryResolveChoice(instanceId)) return

    // 指定アタックの対象選択モード中：自分のスピリットのクリックは無視する
    // （対象は相手スピリット。プレイヤーへアタックは専用ボタン、キャンセルは対象選択をやめるボタン）
    if (ui.directedAttack !== null) return

    // 支払いモード中：クリックしたスピリットに1個割り当てる
    if (ui.paying !== null) {
        assignPayCore(instanceId)
        return
    }

    // 覚醒モード中：クリックしたスピリットからコアを1個移す（移動先の再クリックでキャンセル）
    if (ui.awakenTarget !== null) {
        if (instanceId === ui.awakenTarget) {
            ui.awakenTarget = null
            rerender()
            return
        }
        send({
            type: "awaken",
            instanceId: ui.awakenTarget,
            fromInstanceId: instanceId,
            count: 1,
        })
        ui.awakenTarget = null
        return
    }

    // [ソウルコア]の1:1交換モード中: クリックした個体と交換する（通常コア1個以上必要。
    // 自分自身の再クリック＝キャンセル。条件を満たさない相手は無視してモードを続ける）
    if (ui.soulSwapSelect !== null) {
        const from = ui.soulSwapSelect.fromInstanceId
        if (instanceId === from) {
            ui.soulSwapSelect = null
            rerender()
            return
        }
        const target = view.players[view.you].field.spirits.find((s) => s.instanceId === instanceId)
        if (target && target.cores >= 1) {
            ui.soulSwapSelect = null
            send({ type: "swapSoulCore", fromInstanceId: from, toInstanceId: instanceId })
        }
        return
    }

    // 入れ替え召喚の対象選択モード中
    if (ui.battleSwapSummon !== null) {
        if (ui.battleSwapSummon.substituteInstanceIds.includes(instanceId)) {
            const handIndex = ui.battleSwapSummon.handIndex
            const cardId = view.players[view.you].hand?.[handIndex]
            ui.battleSwapSummon = null
            if (cardId !== undefined) {
                tryPlay(handIndex, master(cardId), undefined, undefined, instanceId)
            }
        }
        return
    }

    if (ui.targeting?.side === "self") {
        const handIndex = ui.targeting.handIndex
        const cardId = view.players[view.you].hand?.[handIndex]
        ui.targeting = null
        if (cardId !== undefined) {
            tryPlay(handIndex, master(cardId), instanceId)
        }
        return
    }

    const myTurn = view.turnPlayer === view.you
    const isDefender = !!view.battle && !myTurn
    // ブロック宣言はフラッシュタイミングの外（フラッシュ①終了後）でのみ行える
    const canDefend = isDefender && !view.isFlashTiming

    if (canDefend && !view.battle?.blockerInstanceId) {
        // ブロックの追加コスト（blockPayCost）：リザーブで払えるならそのまま送り、足りなければ支払いモードへ入る
        const attackerPid = opponentOf(view.you)
        const attackerId = view.battle?.attackerInstanceId
        const attacker = view.players[attackerPid].field.spirits.find((s) => s.instanceId === attackerId)
        const need = blockPayCost(view, attackerPid, attacker)
        const me = view.players[view.you]
        // [ソウルコア]が使える位置（リザーブ・自分の場）にあるときは、使うかを選ばせるため必ず支払いモードへ（2026-10-08 ユーザー要望）
        const soulSelectable = me.soulCore !== null && me.soulCore.zone !== "trash"
        if (need > 0 && (soulSelectable || !(ui.payMode === "auto" && me.reserve >= need))) {
            ui.paying = { handIndex: -1, forBlock: { instanceId, need }, assigned: {}, discardHandIndices: [], millPay: 0, shinsokuAssistInstanceIds: [] }
            rerender()
            return
        }
        send({ type: "block", instanceId })
        return
    }

    if (myTurn && view.phase === "attack" && !view.battle) {
        const inst = view.players[view.you].field.spirits.find(
            (s) => s.instanceId === instanceId,
        )
        const filter = inst ? canDirectAttack(view, view.you, inst) : null
        const oppPid = opponentOf(view.you)
        const oppSpirits = view.players[oppPid].field.spirits
        const currentView = view
        const hasValidTarget =
            filter !== null &&
            inst !== undefined &&
            oppSpirits.some((s) =>
                matchesDirectedAttackFilter(filter, s, currentView, oppPid, { pid: currentView.you, inst }),
            )
        if (filter !== null && hasValidTarget) {
            // 指定アタック可能で、条件に合う相手がいる：対象選択モードを開始する
            ui.directedAttack = { attackerInstanceId: instanceId, filter }
            rerender()
            return
        }
        sendAttack(instanceId)
    }
}

// アタックの追加コスト（attackPayToll）：リザーブで払えるならそのまま送り、足りなければ支払いモードへ入る（ブロックと同じ。2026-10-11 ユーザー確認）
export function sendAttack(instanceId: string, targetSpiritInstanceId?: string): void {
    const inst = view?.players[view.you].field.spirits.find((s) => s.instanceId === instanceId)
    const need = view && inst ? attackPayTollCount(view, view.you, inst) : 0
    if (view && need > 0) {
        const me = view.players[view.you]
        const soulSelectable = me.soulCore !== null && me.soulCore.zone !== "trash"
        if (soulSelectable || !(ui.payMode === "auto" && me.reserve >= need)) {
            ui.paying = { handIndex: -1, forAttack: { instanceId, need, ...(targetSpiritInstanceId !== undefined ? { targetSpiritInstanceId } : {}) }, assigned: {}, discardHandIndices: [], millPay: 0, shinsokuAssistInstanceIds: [] }
            rerender()
            return
        }
    }
    send({ type: "attack", instanceId, ...(targetSpiritInstanceId !== undefined ? { targetSpiritInstanceId } : {}) })
}

export function onOppSpiritClick(instanceId: string): void {
    if (!view) return
    if (tryResolveChoice(instanceId)) return
    if (ui.paying !== null) return // v1はスピリット上のコアのみ対応、自分のスピリットのみが支払い元
    if (ui.awakenTarget !== null) return // 覚醒モード中は相手側の操作を抑止
    // 指定アタックの対象選択モード中：フィルタに合う相手スピリットをクリックしたら指定アタックを送信する
    if (ui.directedAttack !== null) {
        const filter = ui.directedAttack.filter
        const oppPid = opponentOf(view.you)
        const target = view.players[oppPid].field.spirits.find(
            (s) => s.instanceId === instanceId,
        )
        const attackerInst = view.players[view.you].field.spirits.find(
            (s) => s.instanceId === ui.directedAttack?.attackerInstanceId,
        )
        if (
            target &&
            attackerInst &&
            matchesDirectedAttackFilter(filter, target, view, oppPid, { pid: view.you, inst: attackerInst })
        ) {
            sendAttack(ui.directedAttack.attackerInstanceId, instanceId)
            ui.directedAttack = null
        }
        return
    }
    if (ui.targeting?.side === "opponent") {
        const handIndex = ui.targeting.handIndex
        const cardId = view.players[view.you].hand?.[handIndex]
        ui.targeting = null
        if (cardId !== undefined) {
            tryPlay(handIndex, master(cardId), instanceId)
        }
    }
}
