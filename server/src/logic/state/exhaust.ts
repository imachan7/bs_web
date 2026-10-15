// スピリット・ネクサスの疲労処理
import type { CardInstance, CardType, GameState, PlayerId } from "../../type"
import { currentLevel, getCard, log, opponentOf, requestTrashReturn } from "../GameState"
import { fireFieldEventTriggers, fireTrigger, notifyHandGained } from "../triggers"
import { effectActiveAtLevel, effectSources, hasGlobalConstraint, instAllCosts, instColors, instFamilies, instHasColor } from "../../../../shared/rules"

// hasGlobalConstraintは汎用関数のためphase/turnを見ない（removal.tsのallSpiritsCantBounceActiveと同じ理由で専用関数にする）。
// BS16-072 Lv2：『お互いのアタックステップ』限定。phase/turn未指定のBS09-047は従来どおり常時有効のまま
function noRefreshByNexusOrMagicActive(state: GameState): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "noRefreshByNexusOrMagic") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true
            }
        }
    }
    return false
}

export function checkExhaustOnCoreChange(
    state: GameState,
    affectedPid: PlayerId,
    affectedInst: CardInstance,
    opts: { viaEffect: boolean; isRemoval: boolean } = { viaEffect: false, isRemoval: false },
): void {
    if (affectedInst.isRested) return
    // 発生源は「対象から見た相手」側が既定（夢魔の寝所／魔影街）。
    // scope:"any" の効果（ルビーの太陽Lv2＝陣営の指定が無い）は対象自身の陣営からも効く
    const sourcePids: PlayerId[] = [opponentOf(affectedPid), affectedPid]
    for (const sourcePid of sourcePids) {
        for (const source of effectSources(state, sourcePid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "exhaustOnManualCoreAdd") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (sourcePid === affectedPid && effect.scope !== "any") continue
                const wantsEffect = effect.trigger === "effect"
                if (wantsEffect !== opts.viaEffect) continue
                if (opts.isRemoval && !effect.onRemove) continue
                if (!opts.viaEffect && !effect.anyPhase && state.phase !== "main") continue
                if (effect.colorFilter !== undefined && !instHasColor(affectedInst, effect.colorFilter)) continue
                log(
                    state,
                    `${getCard(source.cardId).name}の効果で、${getCard(affectedInst.cardId).name}は疲労した。`,
                )
                exhaustSpirit(state, affectedPid, affectedInst, undefined, sourcePid, getCard(source.cardId).type)
                return
            }
        }
    }
}

// スピリットを疲労させる唯一の入口。すでに疲労していれば何もしない（誘発も起きない）。
// 実際に疲労したときだけ「疲労したとき」のフィールドイベントを発火する。
// アタック宣言・ブロック宣言・効果による疲労のいずれもここを通す
// （疲労の代入が13箇所に散っていて誘発点が無かったのを 2026-08-07 に一元化）。
export function exhaustSpirit(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    // 【暴風】の効果による疲労のとき、その【暴風】の持ち主を渡す。
    // 記録（BS06颶風高原Lv2）と "ownBofuExhausted" の発火（BS06ミストラルコア）に使う
    bofuSourcePid?: PlayerId,
    // この疲労を引き起こした効果の実行者と発生源種別（省略＝自分自身の操作／内部処理による疲労）。
    // ownSpiritExhausted の byOpponentEffectOnly（BS12-062白煙の大山脈）が使う
    causePid?: PlayerId,
    causeType?: CardType,
    // 【暴風】の持ち主自身のinstanceId（BS14-032ヤツノカンゾウLv2の「このスピリットの【暴風】で疲労させた」が
    // 発生源を特定するために使う。任意＝渡されない呼び出し元では記録されないだけ）
    bofuSourceInstanceId?: string,
): void {
    // 破壊待機状態のカードは**疲労できない**（docs/design/TIMING_CHART.md §1.5）
    if (inst.pendingDestruction) return
    if (inst.isRested) return
    inst.isRested = true
    if (bofuSourcePid !== undefined && ownerPid !== bofuSourcePid) {
        state.bofuExhaustedThisBattle.push({
            pid: ownerPid,
            instanceId: inst.instanceId,
            ...(bofuSourceInstanceId !== undefined ? { bofuSourceInstanceId } : {}),
        })
        fireFieldEventTriggers(state, bofuSourcePid, "ownBofuExhausted", { pid: ownerPid, inst })
    }
    fireExhaustedTriggers(state, ownerPid, inst, causePid, causeType)
}

// ネクサスを疲労させる入口（スピリットの exhaustSpirit に対応）。ネクサスの疲労は経路が散っていたので、
// 発火点（ownNexusExhausted。26RBS01-108「このネクサスが疲労した時」）をここに集めた
export function exhaustNexus(state: GameState, ownerPid: PlayerId, nexus: CardInstance, causePid?: PlayerId, causeType?: CardType): void {
    if (nexus.isRested) return
    nexus.isRested = true
    fireExhaustedTriggers(state, ownerPid, nexus, causePid, causeType)
}

// 重疲労させる唯一の入口。回復状態からでも直接重疲労になる（疲労を経由するので「疲労したとき」の誘発は起きる。
// 2026-10-08 ユーザー確定）。すでに重疲労なら何もしない
export function heavyExhaustSpirit(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    causePid?: PlayerId,
    causeType?: CardType,
): void {
    if (inst.pendingDestruction || inst.heavyRested) return
    if (!inst.isRested) exhaustSpirit(state, ownerPid, inst, undefined, causePid, causeType)
    if (!inst.isRested) return
    inst.heavyRested = true
    if (causePid !== undefined && causeType !== undefined && causePid !== ownerPid) returnTrashOnHeavyExhaust(state, causePid)
}

// kind:"trashReturnOnOwnHeavyExhaust"（26RBS02-032）。〔重複不可〕なので1回の重疲労で戻るのは1枚だけ。
// 「手札に戻せる」は任意なので持ち主に確認する（2026-10-11 ユーザー確認）
function returnTrashOnHeavyExhaust(state: GameState, pid: PlayerId): void {
    if (state.turnPlayer !== pid) return
    const player = state.players[pid]
    const index = player.trashCards.findIndex((cardId) =>
        getCard(cardId).effects.some(
            (e) =>
                e.kind === "trashReturnOnOwnHeavyExhaust" &&
                [...player.field.spirits, ...player.field.nexuses].some((i) => instFamilies(i).includes(e.familyFilter)),
        ),
    )
    if (index === -1) return
    requestTrashReturn(state, pid, player.trashCards[index]!)
}

// スピリットを回復させる唯一の入口。すでに回復状態なら何もしない（誘発も起きない）。
// 実際に回復したときだけ「このスピリットが回復したとき」（onRefreshed）を発火する。
// リフレッシュステップ・効果による回復・【強襲】のいずれもここを通す
// （疲労を exhaustSpirit に一元化したのと同じ理由で、2026-08-09 に11箇所から集約した。BS07）
export function refreshSpirit(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    sourceType?: CardType,
): void {
    // 破壊待機状態のカードは**回復できない**（docs/design/TIMING_CHART.md §1.5）
    if (inst.pendingDestruction) return
    // noRefreshUntilOwnEndSteps（BS12-078カシオペアシール）：残り回数がある間はリフレッシュステップ・
    // 効果による回復のいずれも通さない（refreshSpiritの唯一の入口で判定するため両方に効く）
    if ((inst.noRefreshUntilOwnEndSteps ?? 0) > 0) return
    // BS09-047鮫人サンゴジョー：スピリットすべては、ネクサス/マジックの効果では回復しない
    // （スピリットの効果とリフレッシュステップは通る。sourceType 未指定＝効果由来でない扱い）
    if (
        (sourceType === "nexus" || sourceType === "magic") &&
        noRefreshByNexusOrMagicActive(state)
    ) {
        return
    }
    // BS15共通器：BS15-072渦巻く大海峡「疲労状態のスピリットすべては、リフレッシュステップ以外で回復できない」。
    // sourceType が渡る（＝リフレッシュステップ以外の呼び出し）ときだけ止める
    if (sourceType !== undefined && hasGlobalConstraint(state, "noRefreshByAnyEffect")) {
        return
    }
    if (!inst.isRested) return
    // 重疲労は疲労状態へ1段戻るだけ（回復したことにはならないので誘発もしない）
    if (inst.heavyRested) {
        delete inst.heavyRested
        log(state, `${getCard(inst.cardId).name}は重疲労状態から疲労状態になった。`)
        return
    }
    inst.isRested = false
    fireTrigger(state, ownerPid, inst, "onRefreshed")
    // フィールドイベント「自分のスピリットが回復したとき」（ownSpiritExhaustedの対。BS13-024武神獣ディアル・ユキムラLv2）
    fireFieldEventTriggers(state, ownerPid, "ownSpiritRefreshed", { pid: ownerPid, inst })
    // 両陣営から見える版（anySpiritAttackedと同じ形。BS14-085賛美するパイプオルガンLv2：
    // 「スピリット/マジックの効果で回復した赤/緑/白/青のスピリットすべてを破壊する」＝両陣営が対象）
    const selfOverride = { pid: ownerPid, inst }
    const refreshEventInfo = sourceType === undefined ? {} : { refreshSourceType: sourceType }
    fireFieldEventTriggers(state, ownerPid, "anySpiritRefreshed", selfOverride, instColors(inst), undefined, undefined, refreshEventInfo)
    if (!state.winner) {
        fireFieldEventTriggers(
            state,
            opponentOf(ownerPid),
            "anySpiritRefreshed",
            selfOverride,
            instColors(inst),
            undefined,
            undefined,
            refreshEventInfo,
        )
    }
}

// 「スピリットが疲労したとき」のフィールドイベント発火。
// ownSpiritExhausted は持ち主のフィールドから、anySpiritExhausted は両者のフィールドから
// （anyNexusDestroyed / ownNexusDestroyed と同じ組み合わせ）。self には疲労したスピリットを渡す。
// アタック宣言の疲労だけは、アタッカーが効果で消滅したときの「バトル不成立」判定を既存のガードに
// 任せるため doAttack 側で明示的にこの関数を呼んでいる（exhaustSpirit は経由しない）
export function fireExhaustedTriggers(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    causePid?: PlayerId,
    causeType?: CardType,
): void {
    // 疲労したスピリットのコスト（道化師クランの付与コストも含む）を costFilter 用に渡す。
    // byOpponentEffect：「相手の**スピリット/ブレイヴ/マジック**の効果」で疲労したときのみtrue
    // （ネクサスの効果による疲労は含まない。BS12-062白煙の大山脈）
    const eventInfo = {
        costs: instAllCosts(inst),
        byOpponentEffect:
            causeType !== undefined && causeType !== "nexus" && causePid !== undefined && causePid !== ownerPid,
        ...(causePid !== undefined ? { causePid } : {}),
        ...(causeType !== undefined ? { causeType } : {}),
    }
    const colors = instColors(inst)
    if (state.winner) return
    // ネクサスの【起動】コスト・効果の疲労も exhaustSpirit を通るので、ここで種別を見て足す。
    // スピリットとして扱われているネクサス（nexusAsSpiritThisStep）の ownSpiritExhausted は従来どおり発火させる
    if (getCard(inst.cardId).type === "nexus") {
        fireFieldEventTriggers(state, ownerPid, "ownNexusExhausted", { pid: ownerPid, inst }, colors, undefined, undefined, eventInfo)
        if (state.winner) return
    }
    fireFieldEventTriggers(state, ownerPid, "ownSpiritExhausted", { pid: ownerPid, inst }, colors, undefined, undefined, eventInfo)
    if (state.winner) return
    fireFieldEventTriggers(state, ownerPid, "anySpiritExhausted", { pid: ownerPid, inst }, colors, undefined, undefined, eventInfo)
    if (state.winner) return
    fireFieldEventTriggers(state, opponentOf(ownerPid), "anySpiritExhausted", { pid: ownerPid, inst }, colors, undefined, undefined, eventInfo)
}

// スクルディア：相手のスピリットから「回復できない」と指定されていて、
// その指定元が**疲労状態で持ち主のフィールドにいる**間は、リフレッシュステップで回復しない
export function isRefreshBlockedByMark(state: GameState, pid: PlayerId, inst: CardInstance): boolean {
    return state.players[opponentOf(pid)].field.spirits.some(
        (s) => s.isRested && s.noRefreshTargetInstanceId === inst.instanceId,
    )
}

// BS09-063花の宮殿Lv2：発生源の持ち主から見た相手のネクサスは疲労させられない。
// ownerPid のネクサスを疲労させてよいかを返す（【強襲】の疲労元・氷壁のネクサス支払いが見る）
export function canExhaustNexus(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, opponentOf(ownerPid))) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "opponentNexusesUnexhaustable") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.constraint.phase !== undefined && state.phase !== effect.constraint.phase) continue
            return false
        }
    }
    return true
}
