import type { CardData, CardInstance, EffectDef, FamilyFilter, GameState, PlayerId } from "../../type"
import { currentLevel, findNexus, findSpirit, getCard, log, instMinLevelCores, pushResumeFrames } from "../GameState"
import { destroySpirit, returnSpiritToHand } from "../removal"
import { fireFieldEventTriggers, fireTrigger } from "../triggers"
import { activeConstraintsWithSource, effectActiveAtLevel, effectSources, instMatchesCostFilter, matchesFamilyFilter } from "../../../../shared/rules"
import { exhaustSpirit } from "../state/exhaust"
import { requestChoice } from "../EffectModules"

// 【転召】置換（tenshoCoreSubstitute）の選択肢ラベル。cores.ts の tenshoSubstituteChoice ハンドラと共有する
export const TENSHO_SUBSTITUTE_REST = "疲労してコアを維持する"
export const TENSHO_SUBSTITUTE_DUMP = "疲労せずコアを置く"

// mode:"returnToHand"（SD02-009 獣将軍クジャルタ）用のラベル。疲労版と選択肢の文言だけが違う
export const TENSHO_SUBSTITUTE_HAND = "手札に戻してコアを維持する"
export const TENSHO_SUBSTITUTE_HAND_DUMP = "手札に戻さずコアを置く"

// 【転召】の解決：spirit が現在レベルで転召を持つなら、召喚コスト支払い後（doSummonの末尾）に呼ぶ。
// 自分の他スピリットからコストがminCost以上の候補を集め、上のコアすべてをdestへ置く
// （0体=不発、1体=自動選択、2体以上はinteractiveTargets時のみpendingChoice、それ以外はコスト最大を決定的選択）。
// そのカードが指定レベルで持つ【転召】（無ければ null）。
// 召喚の可否判定（RuleValidator.validateSummon）と解決（resolveTensho）で同じ実装を通す
// entry は【転召】の keyword エントリそのもの（実行時カバレッジ計測が __eid を読む）
export function tenshoSpecOf(
    card: CardData,
    level: number,
): { entry: EffectDef; minCost: number; familyFilter?: FamilyFilter | undefined; dest: "trash" | "void" } | null {
    const effect = card.effects.find(
        (e) => e.kind === "keyword" && e.keyword === "tensho" && effectActiveAtLevel(e.levels, level),
    )
    if (!effect || effect.kind !== "keyword") return null
    return {
        entry: effect,
        minCost: effect.minCost ?? 0,
        familyFilter: effect.familyFilter,
        dest: effect.dest ?? "trash",
    }
}

// 【転召】でコアを置く対象になれる自分のスピリット。
// 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る。
// tenshoSelfCostBonus（BS08冥機グングニル）：このコスト判定でだけ候補自身のコストに+amountする。
// excludeInstanceId には召喚された本人を渡す（召喚前の可否判定では省略する＝場にまだいないため）
export function tenshoCandidates(
    state: GameState,
    ownerPid: PlayerId,
    minCost: number,
    excludeInstanceId?: string,
    // 【転召：星魂/ボイド】（BS12初出）：コストでなく系統で対象を絞る。minCost とは排他で、
    // 指定されているときはコスト条件を課さない（付与系統も見る＝matchesFamilyFilter）
    familyFilter?: FamilyFilter,
): CardInstance[] {
    return state.players[ownerPid].field.spirits.filter((s) => {
        if (s.instanceId === excludeInstanceId) return false
        if (familyFilter) return matchesFamilyFilter(state, ownerPid, s, familyFilter)
        return (
            instMatchesCostFilter(s, { min: minCost }) ||
            getCard(s.cardId).cost + tenshoSelfCostBonus(state, ownerPid, s) >= minCost
        )
    })
}

export function resolveTensho(
    state: GameState,
    ownerPid: PlayerId,
    spirit: CardInstance,
): void {
    const level = currentLevel(spirit).level
    const spec = tenshoSpecOf(getCard(spirit.cardId), level)
    if (!spec) return
    const { minCost, familyFilter, dest } = spec
    const candidates = tenshoCandidates(state, ownerPid, minCost, spirit.instanceId, familyFilter)
    if (candidates.length === 0) {
        log(state, `【転召】${getCard(spirit.cardId).name}：対象がいなかった。`)
        return
    }
    if (candidates.length === 1) {
        const only = candidates[0]
        if (only) dumpAllCoresTensho(state, ownerPid, only, dest)
        return
    }
    if (state.interactiveTargets) {
        requestChoice(
            state,
            ownerPid,
            // 選択待ちの間、召喚するカードは手札からもフィールドからも見えない
            // （手順どおり「転召 → 召喚完了」の順で解決するため）。何を召喚しているのかが
            // 対戦者に分かるよう、選択の見出しにカード名を入れる（2026-08-20）
            `【転召】${getCard(spirit.cardId).name}：コアを${dest === "void" ? "ボイドに置く" : "トラッシュに置く"}自分のスピリットを選択`,
            candidates.map((s) => s.instanceId),
            false,
            { type: "tenshoCoreDump", dest },
            spirit,
        )
        return
    }
    // 自動選択（プレイヤー選択の決定的簡略化）：コスト最大の1体。
    // 複数コストを持つ状態では「最大」を定義できないため、カード本来のコストのまま比較する
    const chosen = candidates.reduce((best, s) =>
        getCard(s.cardId).cost + tenshoSelfCostBonus(state, ownerPid, s) >
        getCard(best.cardId).cost + tenshoSelfCostBonus(state, ownerPid, best)
            ? s
            : best,
    )
    dumpAllCoresTensho(state, ownerPid, chosen, dest)
}

// kind:"tenshoSelfCostBonus"：【転召】の生贄候補列挙でだけ、その候補のコストに+amountする。
// 2種類を合算する:
//   ① 候補自身が持つエントリ（target 省略。BS08冥機グングニル＝「このスピリットをコスト+3」）
//   ② 持ち主フィールドの発生源が配る target:"ownAll" のエントリ
//      （BS08赤き砂の座Lv2＝「系統『冥主』を持つ自分のスピリットすべてをコスト+3」）
// 効くのはresolveTenshoの候補判定だけで、instAllCosts等の一般的なコスト計算には影響しない局所的な簡略化
export function tenshoSelfCostBonus(state: GameState, ownerPid: PlayerId, inst: CardInstance): number {
    let bonus = 0
    const instLevel = currentLevel(inst).level
    for (const effect of getCard(inst.cardId).effects) {
        if (effect.kind !== "tenshoSelfCostBonus") continue
        if (effect.target === "ownAll") continue // 自身のエントリでも ownAll 版は②で数える
        if (!effectActiveAtLevel(effect.levels, instLevel)) continue
        bonus += effect.amount
    }
    for (const source of effectSources(state, ownerPid)) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "tenshoSelfCostBonus") continue
            if (effect.target !== "ownAll") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.familyFilter && !matchesFamilyFilter(state, ownerPid, inst, effect.familyFilter)) continue
            bonus += effect.amount
        }
    }
    return bonus
}

// フィールドイベント誘発「自分の【転召】が解決したとき」（BS08関将龍皇ドラグロン）。
// dumpAllCoresTenshoが唯一の解決点なので、呼び出し側（自動/interactive選択のいずれの経路）から
// 「実際に転召が確定した」タイミングでちょうど1回ずつ呼ぶ
export function fireTenshoEvent(state: GameState, ownerPid: PlayerId, inst: CardInstance): void {
    const info = {
        families: [...getCard(inst.cardId).family],
        names: [getCard(inst.cardId).name],
    }
    // 召喚の一部としての【転召】では、召喚されたスピリットはまだ場に出ていない
    // （手順は「コストを支払う → 転召 → 維持コアを置く → 召喚完了」。RESUME_STACK.md §6）。
    // ここで発火すると、**召喚されたカード自身が持つ『転召したとき』を拾えない**
    // （BS08-009関将龍皇ドラグロン等6枚。効果文では『召喚時』ブロックの一部として書かれている）。
    // そこで場に出た時点まで保留する（GameEngine.placeSummonedSpirit が発火させる）
    if (state.summoningInstanceId !== undefined) {
        state.pendingTenshoEvent = { pid: ownerPid, ...info }
        return
    }
    fireFieldEventTriggers(state, ownerPid, "ownTensho", undefined, undefined, undefined, undefined, info)
}

// 保留していた『転召したとき』を、召喚されたスピリットが場に出てから発火する。
// 保留が無ければ何もしない（召喚以外の経路の【転召】は fireTenshoEvent がその場で発火している）
export function flushPendingTenshoEvent(state: GameState): void {
    const pending = state.pendingTenshoEvent
    if (!pending) return
    delete state.pendingTenshoEvent
    fireFieldEventTriggers(state, pending.pid, "ownTensho", undefined, undefined, undefined, undefined, {
        families: pending.families,
        names: pending.names,
    })
}

// 対象スピリットの上のコアすべてをdestへ置く（trash=持ち主のトラッシュ、void=消滅）。
// 維持コア割れは既存の消滅処理に委ねる（【転召】／resolveAction "tenshoCoreDump" 共通）
export function dumpAllCoresTensho(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    dest: "trash" | "void",
    skipSubstitute = false,
): void {
    // 「このスピリットが【転召】の対象になったとき」（BS08天使オリフィア）：唯一の解決点であるここで、
    // 対象になった本人（inst）自身の誘発を必ず発火する。tenshoCoreSubstituteで疲労を選んだ場合も
    // コアを失う場合も、対象になった事実は変わらないため分岐より前で一度だけ呼ぶ
    fireTrigger(state, ownerPid, inst, "onTenshoTarget")
    // 誘発が選択で中断したら、残り（置換の判断以降）を再開フレームに積んでここで止める。
    // 【転召】の手順は「コアを外す＋対象スピリットの効果発揮 → 対象の消滅 → 召喚時効果」の順で、
    // **消滅は効果の発揮が解決しきってから**でなければならない（2026-08-13 ユーザー確認）
    if (state.pendingChoice) {
        pushResumeFrames(state, [{
            kind: "action",
            selfInstanceId: inst.instanceId,
            actorPid: ownerPid,
            action: { type: "tenshoResume", dest, stage: "afterTargetTrigger", ...(skipSubstitute ? { skipSubstitute: true } as const : {}) },
        }])
        return
    }
    tenshoAfterTargetTrigger(state, ownerPid, inst, dest, skipSubstitute)
}

// dumpAllCoresTensho の後半：置換（疲労で代替）の判断 → 『転召が解決したとき』の誘発 → コア処理。
// onTenshoTarget の誘発で中断したときは、再開フレーム（tenshoResume "afterTargetTrigger"）から呼ばれる
export function tenshoAfterTargetTrigger(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    dest: "trash" | "void",
    skipSubstitute: boolean,
): void {
    // constraint "tenshoCoreSubstitute"（BS05の竜使い6枚）：疲労していなければ、
    // 疲労することでコアを置いたものとして扱う（実際にはコアを失わない代替。すでに疲労中は通常のコア移動になる）。
    // 「疲労させることで」は任意なので、実対戦では疲労するかコアを置くかをプレイヤーに選ばせる
    // （skipSubstitute=true は「コアを置く」を選んだ後の再入。tenshoSubstituteChoice からのみ渡る）
    // mode:"returnToHand"（SD02-009 獣将軍クジャルタ）は疲労の代わりに手札へ戻る。
    // 疲労版と違い「疲労していないこと」は条件にならない（既に疲労していても戻せる）
    const substituteEntry = activeConstraintsWithSource(state, ownerPid, inst).find(
        (e) => e.constraint.type === "tenshoCoreSubstitute",
    )
    const substitute = substituteEntry?.constraint.type === "tenshoCoreSubstitute" ? substituteEntry.constraint : undefined
    // familyFilter/costFilter付き（BS12-061剣の誕生地）＝宣言した発生源（ネクサス等）が別インスタンス。
    // その場合は疲労するのは対象スピリット自身ではなく発生源自身
    const crossSource = substituteEntry !== undefined && substituteEntry.sourceInstanceId !== inst.instanceId
    const substituteSourceInst = crossSource
        ? findSpirit(state.players[ownerPid], substituteEntry!.sourceInstanceId) ??
          findNexus(state.players[ownerPid], substituteEntry!.sourceInstanceId)
        : undefined
    const substituteMode = substitute ? (substitute.mode ?? "rest") : undefined
    const substituteAvailable = crossSource
        ? substituteSourceInst !== undefined && !substituteSourceInst.isRested
        : substituteMode === "returnToHand"
          ? true
          : substituteMode === "rest"
            ? !inst.isRested
            : false
    if (!skipSubstitute && substituteAvailable) {
        const toHand = !crossSource && substituteMode === "returnToHand"
        if (state.interactiveTargets) {
            requestChoice(
                state,
                ownerPid,
                crossSource
                    ? `【転召】${getCard(inst.cardId).name}：${getCard(substituteSourceInst!.cardId).name}を疲労させてコアを維持しますか？`
                    : toHand
                      ? `【転召】${getCard(inst.cardId).name}：手札に戻してコアを維持しますか？`
                      : `【転召】${getCard(inst.cardId).name}：疲労してコアを維持しますか？`,
                [],
                false,
                { type: "tenshoSubstituteChoice", dest, ...(crossSource ? { exhaustInstanceId: substituteSourceInst!.instanceId } : {}) },
                inst,
                "option",
                toHand
                    ? [TENSHO_SUBSTITUTE_HAND, TENSHO_SUBSTITUTE_HAND_DUMP]
                    : [TENSHO_SUBSTITUTE_REST, TENSHO_SUBSTITUTE_DUMP],
            )
            return
        }
        // 自動時（テスト）はコアを失わない側を選ぶ決定的簡略化
        if (crossSource) {
            applyTenshoSubstituteCrossSource(state, ownerPid, inst, substituteSourceInst!)
        } else {
            applyTenshoSubstitute(state, ownerPid, inst, toHand)
        }
        return
    }
    fireTenshoEvent(state, ownerPid, inst)
    // 『転召が解決したとき』の誘発が中断したら、コア処理と消滅は選択が終わってから。
    // ここを見ていなかったため、選択待ちのまま destroySpirit が走り、
    // その先の『破壊されたとき』の誘発が中断できない状態になっていた（2026-08-13 修正）
    if (state.pendingChoice) {
        pushResumeFrames(state, [{
            kind: "action",
            selfInstanceId: inst.instanceId,
            actorPid: ownerPid,
            action: { type: "tenshoResume", dest, stage: "afterEvent" },
        }])
        return
    }
    tenshoDumpAndDestroy(state, ownerPid, inst, dest)
}

// 【転召】の置換を実際に適用する（疲労 or 手札に戻す）。どちらもコアは指定場所へ行かない。
// 手札に戻す場合は通常のバウンスと同じで、**上のコアは持ち主のリザーブへ**（2026-08-16 ユーザー確認）
export function applyTenshoSubstitute(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    toHand: boolean,
): void {
    if (toHand) {
        log(state, `【転召】${getCard(inst.cardId).name}は手札に戻り、コアはリザーブへ置かれた。`)
        returnSpiritToHand(state, ownerPid, inst)
    } else {
        log(state, `【転召】${getCard(inst.cardId).name}は疲労し、コアをそのまま維持した。`)
        exhaustSpirit(state, ownerPid, inst)
    }
    fireTenshoEvent(state, ownerPid, inst)
}

// tenshoCoreSubstituteのfamilyFilter/costFilter版（BS12-061剣の誕生地）：疲労するのは対象スピリット
// （inst）ではなく、置換を宣言した発生源自身（sourceInst＝ネクサス）。コスト支払いなので
// exhaustSpiritは通さず直接isRestedを立てる（【強襲】のネクサス疲労と同じ方針。ownSpiritExhaustedを誤発火させない）
export function applyTenshoSubstituteCrossSource(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    sourceInst: CardInstance,
): void {
    sourceInst.isRested = true
    log(
        state,
        `【転召】${getCard(sourceInst.cardId).name}を疲労させ、${getCard(inst.cardId).name}のコアはそのまま維持された。`,
    )
    fireTenshoEvent(state, ownerPid, inst)
}

// 【転召】の最終段：対象の上のコアをすべて dest へ置き、維持コア割れなら消滅させる。
// 手順上「対象スピリットの消滅」は転召の効果発揮がすべて解決した後に来るので、
// 中断をまたぐときはここだけを再開フレームで呼び直す
export function tenshoDumpAndDestroy(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    dest: "trash" | "void",
): void {
    const player = state.players[ownerPid]
    const count = inst.cores
    inst.cores = 0
    if (dest === "trash") {
        player.trashCores += count
        log(state, `【転召】${getCard(inst.cardId).name}のコア${count}個をトラッシュに置いた。`)
    } else {
        log(state, `【転召】${getCard(inst.cardId).name}のコア${count}個をボイドに置いた。`)
    }
    if (inst.cores < instMinLevelCores(inst)) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
}
