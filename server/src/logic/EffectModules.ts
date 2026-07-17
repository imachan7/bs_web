// キーワード効果・誘発効果ハンドラの集約と実行
//
// 設計（data.md 5章の3層構成）:
//   - イベント層: TriggerEvent（onSummon など）を起点に発火する
//   - 効果データ層: カードの effects 配列（EffectDef）
//   - ハンドラ層: キーワードはレジストリ、アクションは resolveAction で解決
// 新キーワード／新アクションは「型を足す → ここにハンドラを足す」で完結する。
import type {
    AuraCondition,
    AuraCounter,
    AuraDef,
    CardInstance,
    Color,
    ConstraintDef,
    DrawPerCounter,
    EffectAction,
    FieldEvent,
    GameState,
    GlobalConstraintDef,
    Keyword,
    Phase,
    PlayerId,
    TriggerEvent,
} from "../type"
import { COLOR_LABELS } from "../../../data/constants"
import {
    clearBattle,
    createInstance,
    currentLevel,
    draw,
    getCard,
    log,
    lv1Cores,
    opponentOf,
    rawLevel,
} from "./GameState"

// ---- キーワードレジストリ ----
// 挙動（召喚やコア移動の可否）は GameEngine / RuleValidator が hasKeyword で参照する。
// ここではキーワードの存在と表示名を一元管理する。
export interface KeywordInfo {
    id: Keyword
    label: string
}

export const KEYWORDS: Record<Keyword, KeywordInfo> = {
    soku: { id: "soku", label: "神速" },
    awaken: { id: "awaken", label: "覚醒" },
    clash: { id: "clash", label: "激突" },
    armor: { id: "armor", label: "装甲" },
    jugeki: { id: "jugeki", label: "呪撃" },
}

// 指定カードがそのキーワードを持つか。
// 「神速を持つスピリット」を参照する効果など、他カードの判定にも使い回せる。
export function hasKeyword(cardId: string, keyword: Keyword): boolean {
    return getCard(cardId).effects.some(
        (e) => e.kind === "keyword" && e.keyword === keyword,
    )
}

// 効果が現在のレベルで有効か（levels が null ならレベル不問）
export function effectActiveAtLevel(
    levels: number[] | null,
    level: number,
): boolean {
    return levels === null || levels.includes(level)
}

// 状態を考慮したキーワード判定：
//   静的キーワード（hasKeyword） ‖ 一時付与（tempKeywords。スピリットリンク等） ‖
//   持ち主フィールドからの継続付与（kind: "keywordGrant"。暴双龍ディラノス）
// フィールド上のスピリットを判定する箇所はこちらを使う（手札の静的判定は hasKeyword のまま）。
export function spiritHasKeyword(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    keyword: Keyword,
): boolean {
    if (hasKeyword(inst.cardId, keyword)) return true
    if (inst.tempKeywords.some((k) => k.keyword === keyword)) return true
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "keywordGrant") continue
            if (effect.keyword !== keyword) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (
                effect.familyFilter &&
                !spiritHasFamily(state, ownerPid, inst, effect.familyFilter)
            ) {
                continue
            }
            if (effect.phase && state.phase !== effect.phase) continue
            return true
        }
    }
    return false
}

// 状態を考慮した系統判定：
//   静的系統（CardData.family） ‖ 持ち主フィールドからの継続付与（kind: "familyGrant"。ポム／生み出される尖兵）
// aura の familyFilter・AuraCounter/DrawPerCounter の { ownFamily }・keywordGrant の familyFilter は
// すべてこちらを参照する（familyGrant で付与された系統もカウントに含めるため）。
export function spiritHasFamily(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    family: string,
): boolean {
    if (getCard(inst.cardId).family.includes(family)) return true
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "familyGrant") continue
            if (effect.family !== family) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.colorFilter && getCard(inst.cardId).color !== effect.colorFilter) {
                continue
            }
            if (
                effect.costFilter !== undefined &&
                getCard(inst.cardId).cost !== effect.costFilter
            ) {
                continue
            }
            if (effect.phase && state.phase !== effect.phase) continue
            if (effect.condition) {
                const { color, count } = effect.condition.ownColorTotalAtLeast
                const total = sources.filter((s) => getCard(s.cardId).color === color).length
                if (total < count) continue
            }
            return true
        }
    }
    return false
}

// ---- 常時BP修正（オーラ） ----

// フィールド上の指定インスタンスがスピリットとして存在するか
function isSpiritOnField(state: GameState, pid: PlayerId, instanceId: string): boolean {
    return state.players[pid].field.spirits.some((s) => s.instanceId === instanceId)
}

// オーラのカウンタを、発生源の持ち主（sourcePid）基準で数える
function countAuraCounter(
    state: GameState,
    sourcePid: PlayerId,
    counter: AuraCounter,
): number {
    if (counter === "ownReserve") return state.players[sourcePid].reserve
    if (counter === "ownNexuses") return state.players[sourcePid].field.nexuses.length
    if (counter === "allNexuses") {
        return (
            state.players.p1.field.nexuses.length +
            state.players.p2.field.nexuses.length
        )
    }
    if (counter === "ownExhausted") {
        return state.players[sourcePid].field.spirits.filter((s) => s.isRested).length
    }
    // { ownNameIncludes: string }：発生源自身を含む自分フィールドで、カード名に指定文字列を含むスピリット数
    if ("ownNameIncludes" in counter) {
        return state.players[sourcePid].field.spirits.filter((s) =>
            getCard(s.cardId).name.includes(counter.ownNameIncludes),
        ).length
    }
    // { ownFamily: string }：発生源自身を含む自分フィールドのスピリット数（familyGrant による付与も含む）
    return state.players[sourcePid].field.spirits.filter((s) =>
        spiritHasFamily(state, sourcePid, s, counter.ownFamily),
    ).length
}

// オーラの発動条件を、発生源の持ち主（sourcePid）基準で判定する
function checkAuraCondition(
    state: GameState,
    sourcePid: PlayerId,
    condition: AuraCondition,
): boolean {
    const player = state.players[sourcePid]
    if (condition === "ownReserveNotEmpty") return player.reserve >= 1
    if ("hasOwnColor" in condition) {
        const all = [...player.field.spirits, ...player.field.nexuses]
        return all.some((inst) => getCard(inst.cardId).color === condition.hasOwnColor)
    }
    if ("hasOwnColorSpirit" in condition) {
        return player.field.spirits.some(
            (s) => getCard(s.cardId).color === condition.hasOwnColorSpirit,
        )
    }
    // { hasOwnFamily: string }：発生源自身を含んでよい
    return player.field.spirits.some((s) =>
        getCard(s.cardId).family.includes(condition.hasOwnFamily),
    )
}

// オーラ1件が対象インスタンス（targetOwnerPid が持ち主）に効くか判定する
function auraAppliesTo(
    state: GameState,
    sourcePid: PlayerId,
    sourceInst: CardInstance,
    aura: AuraDef,
    targetOwnerPid: PlayerId,
    targetInst: CardInstance,
): boolean {
    // phaseTurn は target を問わず適用する（アルカナプリンス・オベロ：target:"self" での使用）
    if (aura.phaseTurn) {
        if (state.phase !== aura.phaseTurn.phase) return false
        if (aura.phaseTurn.turn === "own" && sourcePid !== state.turnPlayer) return false
        if (aura.phaseTurn.turn === "opponent" && sourcePid === state.turnPlayer) return false
    }
    if (aura.target === "self") {
        return sourceInst.instanceId === targetInst.instanceId
    }
    // target === "ownAll"：発生源の持ち主のスピリットすべて（ネクサスは対象外）
    if (sourcePid !== targetOwnerPid) return false
    if (!isSpiritOnField(state, targetOwnerPid, targetInst.instanceId)) return false
    if (aura.colorFilter && getCard(targetInst.cardId).color !== aura.colorFilter) {
        return false
    }
    if (aura.battlingOnly) {
        if (!state.battle) return false
        if (
            state.battle.attackerInstanceId !== targetInst.instanceId &&
            state.battle.blockerInstanceId !== targetInst.instanceId
        ) {
            return false
        }
    }
    if (aura.summonedThisTurnOnly && targetInst.summonedTurn !== state.turn) {
        return false
    }
    if (
        aura.keywordFilter &&
        !spiritHasKeyword(state, targetOwnerPid, targetInst, aura.keywordFilter)
    ) {
        return false
    }
    if (aura.minCores !== undefined && targetInst.cores < aura.minCores) {
        return false
    }
    if (aura.costFilter !== undefined && getCard(targetInst.cardId).cost !== aura.costFilter) {
        return false
    }
    if (
        aura.familyFilter &&
        !spiritHasFamily(state, targetOwnerPid, targetInst, aura.familyFilter)
    ) {
        return false
    }
    return true
}

// オーラ1件の増加量（発生源の持ち主 sourcePid 基準でカウンタ・条件を評価する）
function auraAmount(state: GameState, sourcePid: PlayerId, aura: AuraDef): number {
    let amount = 0
    if (aura.amountPer !== undefined && aura.counter !== undefined) {
        amount += aura.amountPer * countAuraCounter(state, sourcePid, aura.counter)
    }
    if (aura.amount !== undefined) {
        if (!aura.condition || checkAuraCondition(state, sourcePid, aura.condition)) {
            amount += aura.amount
        }
    }
    return amount
}

// 実効BP：基礎BP（tempBpBuff加算済み）に、両陣営の常時BP修正（オーラ）を加算した値。
// 戦闘のBP比較・BPを条件にした対象選択はすべてこの値を使う（レベル判定・維持コアは対象外）。
export function effectiveBp(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): number {
    let total = currentLevel(inst).bp
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        const sources = [...player.field.spirits, ...player.field.nexuses]
        for (const source of sources) {
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "aura" || effect.aura.type !== "bp") continue
                // 発生源のレベル判定は素の currentLevel を使う（effectiveBp の再帰を避ける）
                const sourceLevel = currentLevel(source).level
                if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
                if (!auraAppliesTo(state, pid, source, effect.aura, ownerPid, inst)) {
                    continue
                }
                total += auraAmount(state, pid, effect.aura)
            }
        }
    }
    return total
}

// ---- 制約（ブロック可否など） ----

// 指定インスタンスが現在レベルで持つ制約定義の一覧（RuleValidator の validateBlock が参照する）
export function activeConstraints(
    state: GameState,
    pid: PlayerId,
    inst: CardInstance,
): ConstraintDef[] {
    const level = currentLevel(inst).level
    return getCard(inst.cardId)
        .effects.filter(
            (e) => e.kind === "constraint" && effectActiveAtLevel(e.levels, level),
        )
        .map((e) => (e as { constraint: ConstraintDef }).constraint)
}

// 相手の「対象を取る」効果の対象にならないか（クイーン・ワルキューレの常時、
// またはフェザーバリアの一時免疫）。対象自動選択・明示ターゲットの両方で参照する。
export function isUntargetableByOpponent(inst: CardInstance): boolean {
    if (inst.immuneToOpponentThisTurn) return true
    const level = currentLevel(inst).level
    return getCard(inst.cardId).effects.some(
        (e) =>
            e.kind === "constraint" &&
            e.constraint.type === "untargetableByOpponent" &&
            effectActiveAtLevel(e.levels, level),
    )
}

// 相手のカード効果を一切受けないか（フェザーバリア）。範囲効果（destroyAll 等）にも免疫。
// ワルキューレの untargetable は範囲には無力なので、こちらは immuneToOpponentThisTurn のみ。
function isImmuneToArea(inst: CardInstance): boolean {
    return inst.immuneToOpponentThisTurn
}

// 【装甲：色】：inst が sourceColor の相手効果を受けないか（対象・範囲の両方から参照する）。
// sourceColor が不明（undefined）な場合は装甲を判定できないため false（＝防がない）とする。
export function hasArmorAgainst(inst: CardInstance, sourceColor: Color | undefined): boolean {
    if (sourceColor === undefined) return false
    const level = currentLevel(inst).level
    const staticArmor = getCard(inst.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "armor" &&
            effectActiveAtLevel(e.levels, level) &&
            (e.colors?.includes(sourceColor) ?? false),
    )
    if (staticArmor) return true
    // 一時付与の装甲（インビンシブルシールド）
    return inst.tempKeywords.some(
        (k) => k.keyword === "armor" && (k.colors?.includes(sourceColor) ?? false),
    )
}

// 【相手のマジックの効果を受けない】（kind: "immunityGrant"、対象 ownAll）：
// ownerPid のフィールド（スピリット＋ネクサス）を走査し、レベル有効・familyFilter一致（省略時は不問）の
// immunityGrant（against: "magic"）を持つ発生源が1つでもあれば、inst は相手のマジックの効果を受けない。
// 呼び出し側は「効果の発生源が実際にマジックか（sourceType === "magic"）」を先に判定してから呼ぶこと
// （装甲の hasArmorAgainst が sourceColor を受け取るのと同じ考え方で、対象側にだけ知識を閉じる）。
export function hasMagicImmunity(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): boolean {
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "immunityGrant") continue
            if (effect.against !== "magic") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (
                effect.familyFilter &&
                !getCard(inst.cardId).family.includes(effect.familyFilter)
            ) {
                continue
            }
            return true
        }
    }
    return false
}

// このスピリットに効果でコアが置かれるときの追加数（グラーバの coreBonus）。
// コアを置く各アクション（coreCharge / voidCoreToSelf / voidCoreToOther）が参照する。
function coreBonusFor(inst: CardInstance): number {
    const level = currentLevel(inst).level
    let bonus = 0
    for (const e of getCard(inst.cardId).effects) {
        if (e.kind !== "coreBonus") continue
        if (!effectActiveAtLevel(e.levels, level)) continue
        bonus += e.amount
    }
    return bonus
}

// 対象スピリットへ「効果で」コアを置く共通処理。coreBonus（グラーバ）ぶんをボイドから追加する。
function placeCoresOnSpirit(
    state: GameState,
    inst: CardInstance,
    baseCount: number,
): void {
    inst.cores += baseCount
    const bonus = coreBonusFor(inst)
    if (bonus > 0) {
        inst.cores += bonus
        log(
            state,
            `${getCard(inst.cardId).name}の効果で、置かれるコアが${bonus}個追加された。`,
        )
    }
}

// フィールド発生源から全スピリット／全ネクサスに効くグローバル制約（kind: "globalConstraint"）が
// 現在有効か判定する。両陣営のフィールド（スピリット＋ネクサス）を走査し、
// レベル条件を満たす該当制約が1つでもあれば true（発生源の持ち主は問わない）。
export function hasGlobalConstraint(
    state: GameState,
    type: GlobalConstraintDef["type"],
): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        const instances = [...player.field.spirits, ...player.field.nexuses]
        for (const inst of instances) {
            const level = currentLevel(inst).level
            for (const effect of getCard(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== type) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                return true
            }
        }
    }
    return false
}

// 継続的なレベル置換（kind: "levelAs"）を再計算する。
// 全インスタンスの levelAsContinuous を一旦クリアしてから、両陣営フィールドの levelAs 効果を
// 走査して条件成立分を再適用する（毎回全消去→再構築でズレを防ぐ）。
// 発生源自身のレベル判定（sourceMinLevel）は rawLevel（コア数基準・上書き無視）で行い、
// currentLevel の再帰・自己参照を避ける。
// 呼び出し箇所: GameEngine.handleAction の事後フック／ターン開始処理の最後／ゲーム生成直後
export function refreshLevelAsOverrides(state: GameState): void {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of [
            ...state.players[pid].field.spirits,
            ...state.players[pid].field.nexuses,
        ]) {
            delete inst.levelAsContinuous
        }
    }
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        const sources = [...player.field.spirits, ...player.field.nexuses]
        for (const source of sources) {
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "levelAs") continue
                if (
                    effect.sourceMinLevel !== undefined &&
                    rawLevel(source) < effect.sourceMinLevel
                ) {
                    continue
                }
                if (
                    effect.condition?.maxOwnSpirits !== undefined &&
                    player.field.spirits.length > effect.condition.maxOwnSpirits
                ) {
                    continue
                }
                if (effect.target === "self") {
                    source.levelAsContinuous = effect.treatAs
                } else if (effect.target === "ownNexusesAll") {
                    for (const nexus of player.field.nexuses) {
                        nexus.levelAsContinuous = effect.treatAs
                    }
                }
            }
        }
    }
}

// ---- スピリット／ネクサスの除去 ----

// スピリットを破壊（または消滅）：コアをリザーブへ戻し、カードをトラッシュへ。
// cause が "destroy" のときのみ破壊時効果（onDestroy）が誘発する。
export function destroySpirit(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
    cause: "destroy" | "deplete" = "destroy",
): void {
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === instanceId,
    )
    if (index === -1) return
    const inst = player.field.spirits[index]
    if (!inst) return
    const master = getCard(inst.cardId)
    // 破壊直前のコア数を記録（リザーブへ移す前。漆黒鳥ヤタグロスの coreGainPer: selfCoresAtDestruction）
    inst.coresAtDestruction = inst.cores

    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
    player.trashCards.push(inst.cardId)
    log(
        state,
        `${player.name}の${master.name}は${cause === "destroy" ? "破壊" : "消滅"}された。`,
    )

    if (cause === "destroy") {
        fireTrigger(state, ownerPid, inst, "onDestroy")
    }
    // フィールドイベント誘発「自分のスピリットが破壊されたとき」：cause問わず（消滅も含む）持ち主側で発火
    // （侵食されゆく銀世界Lv2）。fireFieldEventTriggers の action がさらに destroySpirit を
    // 呼ぶカードは現対象に無いが、呼ぶ場合は再入（同一スピリットの二重破壊）に注意すること
    // 破壊されたスピリットの色（colorFilter判定用。祝福されし大聖堂）を渡す
    fireFieldEventTriggers(state, ownerPid, "ownSpiritDestroyed", undefined, master.color)
}

// ネクサスを破壊する。破壊できたら true、破壊耐性（nexusIndestructible）で不発だった場合は false を返す
// （呼び出し側は戻り値でカウント・ドロー処理の可否を判定する。バスタースピア等）。
export function destroyNexus(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
): boolean {
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex(
        (n) => n.instanceId === instanceId,
    )
    if (index === -1) return false
    const inst = player.field.nexuses[index]
    if (!inst) return false
    // 破壊耐性（要塞皇オーディーンLv2-3等）：すべてのネクサスは破壊されない
    if (hasGlobalConstraint(state, "nexusIndestructible")) {
        log(
            state,
            `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊されなかった（破壊耐性）。`,
        )
        return false
    }
    player.field.nexuses.splice(index, 1)
    player.reserve += inst.cores
    player.trashCards.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は破壊された。`)
    // フィールドイベント誘発「ネクサスが破壊されたとき」：破壊した/された側を問わず両陣営のフィールドから発火
    // （竜狩りのアーケオルニ）。バウンス（returnNexusToHand）はここを通らないため対象外
    fireFieldEventTriggers(state, ownerPid, "anyNexusDestroyed")
    fireFieldEventTriggers(state, opponentOf(ownerPid), "anyNexusDestroyed")
    return true
}

// ネクサスを持ち主の手札へ戻す（バウンス）：コアはリザーブへ、カードは手札へ。
// 破壊ではないため destroyNexus とは別処理（ネクサスに onDestroy はまだないが将来のため命名を揃える）。
export function returnNexusToHand(
    state: GameState,
    ownerPid: PlayerId,
    instanceId: string,
): void {
    const player = state.players[ownerPid]
    const index = player.field.nexuses.findIndex(
        (n) => n.instanceId === instanceId,
    )
    if (index === -1) return
    const inst = player.field.nexuses[index]
    if (!inst) return
    player.field.nexuses.splice(index, 1)
    player.reserve += inst.cores
    player.hand.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}（ネクサス）は手札に戻った。`)
}

// スピリットを持ち主の手札へ戻す（バウンス）：コアはリザーブへ、カードは手札へ。
// 破壊ではないため onDestroy は誘発しない（destroySpirit とは別処理）。
export function returnSpiritToHand(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): void {
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === inst.instanceId,
    )
    if (index === -1) return
    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
    player.hand.push(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}は手札に戻った。`)
}

// スピリットを持ち主のデッキの一番上へ戻す：コアはリザーブへ、カードはデッキトップへ。
// 破壊ではないため onDestroy は誘発しない。
export function returnSpiritToDeckTop(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
): void {
    const player = state.players[ownerPid]
    const index = player.field.spirits.findIndex(
        (s) => s.instanceId === inst.instanceId,
    )
    if (index === -1) return
    player.field.spirits.splice(index, 1)
    player.reserve += inst.cores
    player.deck.unshift(inst.cardId)
    log(state, `${player.name}の${getCard(inst.cardId).name}はデッキの一番上に戻った。`)
}

// コアを取り除き、維持コア（Lv1）を下回ったら消滅させる
export function removeCores(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
): void {
    const player = state.players[ownerPid]
    const removed = Math.min(count, inst.cores)
    inst.cores -= removed
    player.reserve += removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}からコア${removed}個を取り除いた。`,
    )
    if (inst.cores < lv1Cores(getCard(inst.cardId))) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
}

// コアを取り除いて持ち主のトラッシュへ置き、維持コア（Lv1）を下回ったら消滅させる
// （魔帝の墓標Lv2「そのスピリット上のコア1個をトラッシュに置かなければならない」）
export function removeCoresToTrash(
    state: GameState,
    ownerPid: PlayerId,
    inst: CardInstance,
    count: number,
): void {
    const player = state.players[ownerPid]
    const removed = Math.min(count, inst.cores)
    inst.cores -= removed
    player.trashCores += removed
    log(
        state,
        `${player.name}の${getCard(inst.cardId).name}のコア${removed}個をトラッシュに置いた。`,
    )
    if (inst.cores < lv1Cores(getCard(inst.cardId))) {
        destroySpirit(state, ownerPid, inst.instanceId, "deplete")
    }
}

// ---- アクションの実行 ----

// 相手スピリットから BP <= maxBp かつ extraPredicate を満たすものの中で
// 最もBPが高いものを1体選ぶ（疲労状態の絞り込みなどにも使い回す）
// sourceColor: 効果発生源の色（装甲判定用。不明なら undefined＝装甲を貫通しない）
// sourceType: 効果発生源の種別（マジック効果耐性判定用。"magic" のときのみ hasMagicImmunity を追加チェック）
function pickEnemyByBp(
    state: GameState,
    targetPid: PlayerId,
    maxBp: number,
    extraPredicate: (s: CardInstance) => boolean = () => true,
    sourceColor?: Color,
    sourceType?: "spirit" | "nexus" | "magic",
): CardInstance | null {
    const candidates = state.players[targetPid].field.spirits.filter(
        // targetPid はアクターの相手フィールド。免疫スピリット・装甲該当・マジック効果耐性該当は対象選択から除外する
        (s) =>
            effectiveBp(state, targetPid, s) <= maxBp &&
            !isUntargetableByOpponent(s) &&
            !hasArmorAgainst(s, sourceColor) &&
            !(sourceType === "magic" && hasMagicImmunity(state, targetPid, s)) &&
            extraPredicate(s),
    )
    if (candidates.length === 0) return null
    return candidates.reduce((best, s) =>
        effectiveBp(state, targetPid, s) > effectiveBp(state, targetPid, best) ? s : best,
    )
}

// instanceId から両プレイヤーのフィールドを検索し、対象スピリットと持ち主を返す
function findSpiritAny(
    state: GameState,
    instanceId: string,
): { pid: PlayerId; inst: CardInstance } | null {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const inst = state.players[pid].field.spirits.find(
            (s) => s.instanceId === instanceId,
        )
        if (inst) return { pid, inst }
    }
    return null
}

// 騎獣スレイプホース：マジックによるBPバフ（bpBuff/bpBuffPer）が対象に適用された直後にフックし、
// 条件を満たせばさらに magicBuffBonus 分のBP+を追加する。
// 効果文の『このスピリットのアタック時』／『自分のアタックステップ』条件は「バトル中または
// 自分のアタックステップ」で近似する簡略化とし、判定は state.phase === "attack" のみとする。
function applyMagicBuffBonus(
    state: GameState,
    target: CardInstance,
    srcType?: "spirit" | "nexus" | "magic",
    srcColor?: Color,
): void {
    if (srcType !== "magic") return
    if (state.phase !== "attack") return
    const found = findSpiritAny(state, target.instanceId)
    if (!found) return
    const targetOwner = found.pid
    const targetColor = getCard(target.cardId).color
    for (const source of state.players[targetOwner].field.spirits) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicBuffBonus") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.colorFilter && srcColor !== effect.colorFilter) continue
            if (effect.target === "self") {
                if (source.instanceId !== target.instanceId) continue
            } else {
                // ownOthers：発生源以外の、持ち主の緑スピリットが対象のときのみ
                if (source.instanceId === target.instanceId) continue
                if (targetColor !== "green") continue
            }
            target.tempBpBuff += effect.amountBonus
            log(
                state,
                `${getCard(source.cardId).name}の効果で${getCard(target.cardId).name}はさらにBP+${effect.amountBonus}（ターン終了時まで）。`,
            )
        }
    }
}

// bpBuff / bpBuffPer 共通の対象選択：
// 対象指定があれば両プレイヤーから検索、なければバトル中の自分スピリット優先、
// いなければ自分フィールドの先頭スピリット
function pickBpBuffTarget(
    state: GameState,
    owner: PlayerId,
    targetInstanceId?: string,
): CardInstance | null {
    if (targetInstanceId) {
        const found = findSpiritAny(state, targetInstanceId)
        return found ? found.inst : null
    }
    const mine = state.players[owner].field.spirits
    let target: CardInstance | null = null
    if (state.battle) {
        target =
            mine.find(
                (s) =>
                    s.instanceId === state.battle?.attackerInstanceId ||
                    s.instanceId === state.battle?.blockerInstanceId,
            ) ?? null
    }
    if (!target) target = mine[0] ?? null
    return target
}

// grantKeyword 共通の対象選択：自分のスピリットのみが対象（targetInstanceId は自分側のみ有効）。
// 対象指定があれば自分フィールドから検索、なければバトル中の自分スピリット優先、
// いなければ自分フィールドの先頭スピリット
function pickOwnKeywordTarget(
    state: GameState,
    owner: PlayerId,
    targetInstanceId?: string,
): CardInstance | null {
    const mine = state.players[owner].field.spirits
    if (targetInstanceId) {
        return mine.find((s) => s.instanceId === targetInstanceId) ?? null
    }
    let target: CardInstance | null = null
    if (state.battle) {
        target =
            mine.find(
                (s) =>
                    s.instanceId === state.battle?.attackerInstanceId ||
                    s.instanceId === state.battle?.blockerInstanceId,
            ) ?? null
    }
    if (!target) target = mine[0] ?? null
    return target
}

// 疲労状態の相手スピリット数（drawPer / bpBuffPer の "exhaustedEnemies" カウンタ）
function countExhaustedEnemies(state: GameState, opp: PlayerId): number {
    return state.players[opp].field.spirits.filter((s) => s.isRested).length
}

// drawPer / coreGainPer 共通のカウンタ集計。
// exhaustedEnemies / opponentHand は相手（opp）基準、{ ownFamily } は自分（owner）のフィールド基準、
// selfCoresAtDestruction は self（破壊時点のコア数を destroySpirit が記録済み）基準
function countDrawPerCounter(
    state: GameState,
    owner: PlayerId,
    opp: PlayerId,
    counter: DrawPerCounter,
    self: CardInstance | null,
): number {
    if (counter === "exhaustedEnemies") return countExhaustedEnemies(state, opp)
    if (counter === "opponentHand") return state.players[opp].hand.length
    if (counter === "selfCoresAtDestruction") return self?.coresAtDestruction ?? 0
    if (counter === "lastBattleDestroyedCores") return state.lastBattleDestroyedCores
    // { ownFamily: string }：自分のフィールドの指定系統スピリット数（familyGrant による付与も含む）
    // （onDestroy等で発火する場合、selfはこの時点ですでにフィールドから除去済みのため含まれない）
    return state.players[owner].field.spirits.filter((s) =>
        spiritHasFamily(state, owner, s, counter.ownFamily),
    ).length
}

// 効果アクションを実行する。
//   owner = 効果の使用者、self = 効果の発生源スピリット（マジックは null）
//   sourceColor = 効果発生源の色（装甲判定用）。省略時は self のカード色から求める（マジックは呼び出し側で明示する）
export function resolveAction(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    action: EffectAction,
    targetInstanceId?: string,
    sourceColor?: Color,
    sourceType?: "spirit" | "nexus" | "magic",
): void {
    const opp = opponentOf(owner)
    const sourceName = self ? getCard(self.cardId).name : "効果"
    const srcColor = sourceColor ?? (self ? getCard(self.cardId).color : undefined)
    // マジック効果耐性（ポークン）判定用。self があればそのカード種別（マジックはself=nullなので
    // 呼び出し側=resolveMagicが明示的に"magic"を渡す）
    const srcType = sourceType ?? (self ? getCard(self.cardId).type : undefined)

    switch (action.type) {
        case "draw": {
            draw(state, owner, action.count)
            return
        }

        case "destroy": {
            // bpEqualsSelf 指定時は self の実効BPが確定しないと対象を選べない（selfがnullならno-op）
            if (action.bpEqualsSelf && !self) {
                log(state, `${sourceName}の破壊効果：selfが不在のため対象がいなかった。`)
                return
            }
            const selfBp = action.bpEqualsSelf && self ? effectiveBp(state, owner, self) : undefined
            for (let i = 0; i < action.count; i++) {
                // maxBp 省略時はBP不問。keywordFilter 指定時はそのキーワード持ちのみ対象。
                // bpEqualsSelf 指定時はselfと実効BPが同じ相手のみ対象（プテラトマホーク）
                const target = pickEnemyByBp(
                    state,
                    opp,
                    action.maxBp ?? Infinity,
                    (s) =>
                        (action.keywordFilter === undefined ||
                            spiritHasKeyword(state, opp, s, action.keywordFilter)) &&
                        (selfBp === undefined || effectiveBp(state, opp, s) === selfBp),
                    srcColor,
                    srcType,
                )
                if (!target) {
                    log(state, `${sourceName}の破壊効果：対象がいなかった。`)
                    break
                }
                destroySpirit(state, opp, target.instanceId)
            }
            return
        }

        case "destroyAll": {
            // 範囲破壊。untargetable（ワルキューレ）は範囲に無力なので当たるが、
            // 全効果免疫（フェザーバリア）・装甲該当・マジック効果耐性該当のスピリットは除外する
            const targets = state.players[opp].field.spirits.filter(
                (s) =>
                    effectiveBp(state, opp, s) <= action.maxBp &&
                    !isImmuneToArea(s) &&
                    !hasArmorAgainst(s, srcColor) &&
                    !(srcType === "magic" && hasMagicImmunity(state, opp, s)),
            )
            if (targets.length === 0) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            for (const t of targets) destroySpirit(state, opp, t.instanceId)
            return
        }

        case "exhaustAllByLevel": {
            // 両陣営のcurrentLevelが一致するスピリットをすべて疲労させる（疲労済みはno-op、範囲効果）
            let count = 0
            for (const pid of ["p1", "p2"] as PlayerId[]) {
                for (const s of state.players[pid].field.spirits) {
                    if (currentLevel(s).level !== action.level) continue
                    if (s.isRested) continue
                    s.isRested = true
                    count++
                }
            }
            log(state, `${sourceName}：Lv${action.level}のスピリット${count}体を疲労させた。`)
            return
        }

        case "destroyAllExceptChosenColors": {
            // お互い自分のフィールドで最多のスピリット色を1色ずつ自動指定する
            // （同数の場合はColor定義順=red,purple,green,white,yellow,blueの先頭を採用。
            // フィールドが空のプレイヤーは指定なし。プレイヤー選択の決定的簡略化）
            const colorOrder: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
            const pickChosenColor = (pid: PlayerId): Color | null => {
                const spirits = state.players[pid].field.spirits
                if (spirits.length === 0) return null
                const counts = new Map<Color, number>()
                for (const s of spirits) {
                    const c = getCard(s.cardId).color
                    counts.set(c, (counts.get(c) ?? 0) + 1)
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
            const chosenP1 = pickChosenColor("p1")
            const chosenP2 = pickChosenColor("p2")
            const safeColors = new Set([chosenP1, chosenP2].filter((c): c is Color => c !== null))
            log(
                state,
                `${sourceName}：指定色は p1=${chosenP1 ?? "なし"}, p2=${chosenP2 ?? "なし"}。` +
                    `いずれでもない色のスピリットを破壊する。`,
            )
            // 相手フィールドは既存の免疫（isImmuneToArea）・装甲チェックを適用、自分フィールドは適用しない
            // （destroyExhaustedのanySideと同じ非対称ルール＝自分の効果は自分のスピリットには免疫が働かない）
            const oppTargets = state.players[opp].field.spirits.filter(
                (s) => !safeColors.has(getCard(s.cardId).color) && !isImmuneToArea(s) && !hasArmorAgainst(s, srcColor),
            )
            const ownTargets = state.players[owner].field.spirits.filter(
                (s) => !safeColors.has(getCard(s.cardId).color),
            )
            for (const t of oppTargets) destroySpirit(state, opp, t.instanceId)
            for (const t of ownTargets) destroySpirit(state, owner, t.instanceId)
            return
        }

        case "destroyAllNexusesExceptChosenColors": {
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
                    const c = getCard(n.cardId).color
                    counts.set(c, (counts.get(c) ?? 0) + 1)
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
                    allNexusColors.add(getCard(n.cardId).color)
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
                    (n) => !safeColors.has(getCard(n.cardId).color),
                )
                for (const t of targets) destroyNexus(state, pid, t.instanceId)
            }
            return
        }

        case "destructionCoresToOwnSpirit": {
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

        case "grantBlockerImmunity": {
            // フェザーバリア：ブロック中の自分スピリット優先、なければバトル中の自分、なければ先頭
            const mine = state.players[owner].field.spirits
            let target: CardInstance | null = null
            if (state.battle) {
                target =
                    mine.find(
                        (s) =>
                            s.instanceId === state.battle?.blockerInstanceId ||
                            s.instanceId === state.battle?.attackerInstanceId,
                    ) ?? null
            }
            if (!target) target = mine[0] ?? null
            if (!target) {
                log(state, `${sourceName}：対象のスピリットがいなかった。`)
                return
            }
            target.immuneToOpponentThisTurn = true
            log(
                state,
                `${getCard(target.cardId).name}はこのターン、相手のカードの効果を受けない。`,
            )
            return
        }

        case "negateOwnBlockConstraint": {
            // バーストファイア：cantBlock/cantBlockLowerBp を持つ自分スピリット優先、なければ先頭
            const mine = state.players[owner].field.spirits
            const target =
                mine.find((s) =>
                    activeConstraints(state, owner, s).some(
                        (c) =>
                            c.type === "cantBlock" ||
                            c.type === "cantBlockLowerBp",
                    ),
                ) ??
                mine[0] ??
                null
            if (!target) {
                log(state, `${sourceName}：対象のスピリットがいなかった。`)
                return
            }
            target.blockConstraintNegatedThisTurn = true
            log(
                state,
                `${getCard(target.cardId).name}の『ブロックできない』効果を無効にした。`,
            )
            return
        }

        case "grantKeyword": {
            // スピリットリンク／インビンシブルシールド：自分のスピリット1体に一時的にキーワードを付与
            const target = pickOwnKeywordTarget(state, owner, targetInstanceId)
            if (!target) {
                log(state, `${sourceName}：対象のスピリットがいなかった。`)
                return
            }
            target.tempKeywords.push({
                keyword: action.keyword,
                ...(action.colors ? { colors: action.colors } : {}),
            })
            log(
                state,
                `${getCard(target.cardId).name}に【${KEYWORDS[action.keyword].label}】を付与した。`,
            )
            return
        }

        case "selfBuff": {
            if (!self) return
            self.tempBpBuff += action.amount
            log(
                state,
                `${getCard(self.cardId).name}はBP+${action.amount}（ターン終了時まで）。`,
            )
            return
        }

        case "destroyNexus": {
            let destroyed = 0
            for (let i = 0; i < action.count; i++) {
                const nexus = state.players[opp].field.nexuses[0]
                if (!nexus) {
                    log(state, `${sourceName}のネクサス破壊：対象がいなかった。`)
                    break
                }
                const ok = destroyNexus(state, opp, nexus.instanceId)
                if (!ok) break // 破壊耐性で不発：同じネクサスを再試行しても結果は変わらないため打ち切る
                destroyed++
            }
            // 実際に破壊できたネクサス1つにつきdrawPerDestroyed枚ドロー（バスタースピア）
            if (action.drawPerDestroyed && destroyed > 0) {
                draw(state, owner, destroyed * action.drawPerDestroyed)
            }
            return
        }

        case "returnSelfToHand": {
            if (!self) return
            const player = state.players[owner]
            // 破壊時に呼ばれるため、直前にトラッシュへ送られた自分のカードを手札へ戻す
            const idx = player.trashCards.lastIndexOf(self.cardId)
            if (idx >= 0) {
                player.trashCards.splice(idx, 1)
                player.hand.push(self.cardId)
                log(state, `${getCard(self.cardId).name}は手札に戻った。`)
            }
            return
        }

        case "coreRemove": {
            // 対象指定があれば両プレイヤーから検索、なければ相手のBP最大スピリットを自動選択
            const found = targetInstanceId
                ? findSpiritAny(state, targetInstanceId)
                : (() => {
                      const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColor, srcType)
                      return t ? { pid: opp, inst: t } : null
                  })()
            if (!found) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                return
            }
            // 明示ターゲットが相手側かつ装甲該当・マジック効果耐性該当なら効果を受けない
            if (
                found.pid !== owner &&
                (hasArmorAgainst(found.inst, srcColor) ||
                    (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst)))
            ) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                return
            }
            // 維持コア割れの消滅処理は removeCores が担う
            removeCores(state, found.pid, found.inst, action.count)
            return
        }

        case "coreRemoveSelf": {
            // このスピリット（self）自身のコアを持ち主のリザーブへ（維持コア割れの消滅処理は removeCores が担う）
            if (!self) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                return
            }
            removeCores(state, owner, self, action.count)
            return
        }

        case "coreToTrashSelf": {
            // このスピリット（self）自身のコアを持ち主のトラッシュへ（維持コア割れの消滅処理は removeCoresToTrash が担う。
            // 魔帝の墓標Lv2：anySpiritAttacked 経由では self にアタックしたスピリットが渡る）
            if (!self) {
                log(state, `${sourceName}のコア除去：対象がいなかった。`)
                return
            }
            removeCoresToTrash(state, owner, self, action.count)
            return
        }

        case "bpBuff": {
            const target = pickBpBuffTarget(state, owner, targetInstanceId)
            if (!target) {
                log(state, `${sourceName}のBP増加：対象がいなかった。`)
                return
            }
            target.tempBpBuff += action.amount
            log(
                state,
                `${getCard(target.cardId).name}はBP+${action.amount}（ターン終了時まで）。`,
            )
            applyMagicBuffBonus(state, target, srcType, srcColor)
            return
        }

        case "exhaust": {
            // 対象指定時はその1体のみ処理（既に疲労済みならログを出して何もしない）
            if (targetInstanceId) {
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) {
                    log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                    return
                }
                if (
                    found.pid !== owner &&
                    (hasArmorAgainst(found.inst, srcColor) ||
                        (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst)))
                ) {
                    log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                    return
                }
                if (found.inst.isRested) {
                    log(
                        state,
                        `${getCard(found.inst.cardId).name}はすでに疲労している。`,
                    )
                    return
                }
                found.inst.isRested = true
                log(state, `${getCard(found.inst.cardId).name}は疲労した。`)
                return
            }
            // 未指定時は相手フィールドの回復状態スピリットからBP最大をcount回自動選択
            for (let i = 0; i < action.count; i++) {
                const target = pickEnemyByBp(
                    state,
                    opp,
                    Infinity,
                    (s) => !s.isRested,
                    srcColor,
                    srcType,
                )
                if (!target) {
                    log(state, `${sourceName}の疲労付与：対象がいなかった。`)
                    break
                }
                target.isRested = true
                log(state, `${getCard(target.cardId).name}は疲労した。`)
            }
            return
        }

        case "destroyExhausted": {
            // 対象指定時はその1体のみ処理（疲労状態でなければログを出して何もしない）
            if (targetInstanceId) {
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) {
                    log(state, `${sourceName}の疲労破壊：対象がいなかった。`)
                    return
                }
                if (
                    found.pid !== owner &&
                    (hasArmorAgainst(found.inst, srcColor) ||
                        (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst)))
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
                destroySpirit(state, found.pid, found.inst.instanceId)
                return
            }
            if (action.anySide) {
                // 両陣営の疲労スピリットから実効BP最大の1体を自動選択して破壊
                // （本来はプレイヤーが選ぶ処理の簡略化。相手側の候補には既存の免疫・装甲チェックを適用し、
                // 自分側には適用しない＝pickEnemyByBpと同じ非対称ルール。同値の場合は相手側を優先する）
                const oppCandidate = pickEnemyByBp(state, opp, Infinity, (s) => s.isRested, srcColor, srcType)
                const ownCandidates = state.players[owner].field.spirits.filter((s) => s.isRested)
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
            // 未指定時は相手フィールドの疲労状態スピリットからBP最大をcount回自動選択
            for (let i = 0; i < action.count; i++) {
                const target = pickEnemyByBp(
                    state,
                    opp,
                    Infinity,
                    (s) => s.isRested,
                    srcColor,
                    srcType,
                )
                if (!target) {
                    log(state, `${sourceName}の疲労破壊：対象がいなかった。`)
                    break
                }
                destroySpirit(state, opp, target.instanceId)
            }
            return
        }

        case "drawPer": {
            const count = countDrawPerCounter(state, owner, opp, action.counter, self)
            if (count === 0) {
                log(state, `${sourceName}の可変ドロー：カウントが0のためドローしなかった。`)
                return
            }
            draw(state, owner, count)
            return
        }

        case "coreGainPer": {
            const count = countDrawPerCounter(state, owner, opp, action.counter, self)
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

        case "bpBuffPer": {
            const count = countExhaustedEnemies(state, opp)
            if (count === 0) {
                log(state, `${sourceName}のBP増加：カウントが0のため増加しなかった。`)
                return
            }
            const target = pickBpBuffTarget(state, owner, targetInstanceId)
            if (!target) {
                log(state, `${sourceName}のBP増加：対象がいなかった。`)
                return
            }
            const amount = count * action.amountPer
            target.tempBpBuff += amount
            log(
                state,
                `${getCard(target.cardId).name}はBP+${amount}（ターン終了時まで）。`,
            )
            applyMagicBuffBonus(state, target, srcType, srcColor)
            return
        }

        case "discardHandAll": {
            const player = state.players[owner]
            const count = player.hand.length
            player.trashCards.push(...player.hand)
            player.hand = []
            log(state, `${player.name}は手札${count}枚をすべて破棄した。`)
            return
        }

        case "bpBuffAll": {
            const spirits = state.players[owner].field.spirits
            for (const s of spirits) {
                s.tempBpBuff += action.amount
            }
            log(
                state,
                `${state.players[owner].name}のスピリットすべてがBP+${action.amount}（ターン終了時まで）。`,
            )
            return
        }

        case "returnToHand": {
            // 対象指定時はその1体のみ手札へ戻す
            if (targetInstanceId) {
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) {
                    log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                    return
                }
                if (
                    found.pid !== owner &&
                    (hasArmorAgainst(found.inst, srcColor) ||
                        (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst)))
                ) {
                    log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                    return
                }
                returnSpiritToHand(state, found.pid, found.inst)
                return
            }
            // 未指定時は相手フィールドのBP最大をcount回自動選択
            for (let i = 0; i < action.count; i++) {
                const target = pickEnemyByBp(state, opp, Infinity, undefined, srcColor, srcType)
                if (!target) {
                    log(state, `${sourceName}の手札戻し：対象がいなかった。`)
                    break
                }
                returnSpiritToHand(state, opp, target)
            }
            return
        }

        case "returnToDeckTop": {
            const found = targetInstanceId
                ? findSpiritAny(state, targetInstanceId)
                : (() => {
                      const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColor, srcType)
                      return t ? { pid: opp, inst: t } : null
                  })()
            if (!found) {
                log(state, `${sourceName}のデッキ戻し：対象がいなかった。`)
                return
            }
            if (
                targetInstanceId &&
                found.pid !== owner &&
                (hasArmorAgainst(found.inst, srcColor) ||
                    (srcType === "magic" && hasMagicImmunity(state, found.pid, found.inst)))
            ) {
                log(state, `${getCard(found.inst.cardId).name}は${sourceName}の効果を受けなかった。`)
                return
            }
            returnSpiritToDeckTop(state, found.pid, found.inst)
            return
        }

        case "coreCharge": {
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

        case "lifeCharge": {
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

        case "coreGain": {
            const player = state.players[owner]
            player.reserve += action.count
            log(
                state,
                `${player.name}はボイドからコア${action.count}個をリザーブに置いた。（リザーブ${player.reserve}）`,
            )
            return
        }

        case "refreshOne": {
            // 自分の疲労スピリットから（keywordFilter/colorFilter指定時はそれぞれの条件持ちのみ）実効BP最大の1体を回復
            const candidates = state.players[owner].field.spirits.filter(
                (s) =>
                    s.isRested &&
                    (action.keywordFilter === undefined ||
                        spiritHasKeyword(state, owner, s, action.keywordFilter)) &&
                    (action.colorFilter === undefined ||
                        getCard(s.cardId).color === action.colorFilter),
            )
            if (candidates.length === 0) {
                log(state, `${sourceName}の回復：対象がいなかった。`)
                return
            }
            // all指定時は候補すべてを回復する（cantAttackThisTurnは付与しない。決闘台地Lv2）
            if (action.all) {
                for (const c of candidates) c.isRested = false
                log(state, `${sourceName}：条件を満たすスピリット${candidates.length}体を回復させた。`)
                return
            }
            const target = candidates.reduce((best, s) =>
                effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
            )
            target.isRested = false
            log(state, `${getCard(target.cardId).name}は回復した。`)
            return
        }

        case "refreshAllOwn": {
            const player = state.players[owner]
            let count = 0
            for (const s of player.field.spirits) {
                if (!s.isRested) continue
                s.isRested = false
                s.cantAttackThisTurn = true
                count++
            }
            if (count === 0) {
                log(state, `${sourceName}：疲労状態のスピリットがいなかった。`)
                return
            }
            log(
                state,
                `${player.name}の疲労スピリット${count}体を回復した。（このターンの間、回復したスピリットはアタック不可）`,
            )
            return
        }

        case "refreshAllByCost": {
            // 両陣営のコストが一致するスピリットすべてを回復させる（refreshAllOwnと異なりcantAttackThisTurnは付与しない）
            let count = 0
            for (const pid of ["p1", "p2"] as PlayerId[]) {
                for (const s of state.players[pid].field.spirits) {
                    if (!s.isRested) continue
                    if (getCard(s.cardId).cost !== action.cost) continue
                    s.isRested = false
                    count++
                }
            }
            if (count === 0) {
                log(state, `${sourceName}：コスト${action.cost}の疲労スピリットがいなかった。`)
                return
            }
            log(state, `${sourceName}：コスト${action.cost}のスピリット${count}体を回復した。`)
            return
        }

        case "destroyOwnByCost": {
            // 自分のフィールドからself以外でコスト<=maxCostのうちコスト最大の1体を破壊する
            // （本来はプレイヤーが選ぶ処理だが、決定的な自動選択で簡略化）
            const candidates = state.players[owner].field.spirits.filter(
                (s) =>
                    (!self || s.instanceId !== self.instanceId) &&
                    getCard(s.cardId).cost <= action.maxCost,
            )
            if (candidates.length === 0) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            const target = candidates.reduce((best, s) =>
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

        case "endBattle": {
            if (!state.battle) {
                log(state, `${sourceName}：バトルが発生していないため終了できなかった。`)
                return
            }
            log(state, `${sourceName}によって、行っていたバトルはただちに終了した。`)
            clearBattle(state)
            return
        }

        case "exhaustAllByColor": {
            const oppSpirits = state.players[opp].field.spirits
            if (oppSpirits.length === 0) {
                log(state, `${sourceName}：相手フィールドにスピリットがいなかった。`)
                return
            }
            // 相手フィールドで最多の色を選ぶ（同数なら先に見つかった色。Map は挿入順を保持する）
            const tally = new Map<Color, number>()
            for (const s of oppSpirits) {
                const color = getCard(s.cardId).color
                tally.set(color, (tally.get(color) ?? 0) + 1)
            }
            let chosen: Color | null = null
            let best = 0
            for (const [color, count] of tally) {
                if (count > best) {
                    best = count
                    chosen = color
                }
            }
            if (!chosen) {
                log(state, `${sourceName}：対象の色がなかった。`)
                return
            }
            let exhausted = 0
            for (const pid of ["p1", "p2"] as PlayerId[]) {
                for (const s of state.players[pid].field.spirits) {
                    if (getCard(s.cardId).color !== chosen) continue
                    // 装甲は「相手の効果」を防ぐものなので、自分側のスピリットには適用しない
                    if (pid !== owner && hasArmorAgainst(s, srcColor)) continue
                    s.isRested = true
                    exhausted++
                }
            }
            log(
                state,
                `${sourceName}：色「${COLOR_LABELS[chosen]}」を選び、${exhausted}体を疲労させた。`,
            )
            return
        }

        case "lockFlash": {
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

        case "returnNexusToHand": {
            for (let i = 0; i < action.count; i++) {
                const nexus = state.players[opp].field.nexuses[0]
                if (!nexus) {
                    log(state, `${sourceName}のネクサス手札戻し：対象がいなかった。`)
                    break
                }
                returnNexusToHand(state, opp, nexus.instanceId)
            }
            return
        }

        case "reclaimTrashCores": {
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

        case "refreshSelf": {
            // 「相手だけ破壊したとき、このスピリットは回復する」等のバトル勝利時効果
            if (!self) {
                log(state, `${sourceName}：回復対象がいなかった。`)
                return
            }
            if (!self.isRested) {
                log(state, `${getCard(self.cardId).name}はすでに回復状態のため何もしなかった。`)
                return
            }
            self.isRested = false
            log(state, `${getCard(self.cardId).name}は回復した。`)
            return
        }

        case "lifeCrush": {
            // 相手のライフのコアをリザーブへ（doTakeLife と同様の処理）。ライフ0以下で勝敗が決まる
            const player = state.players[opp]
            const dealt = Math.min(action.count, player.life)
            player.life -= dealt
            player.reserve += dealt
            log(
                state,
                `${sourceName}：${player.name}のライフからコア${dealt}個をリザーブに置いた。（残りライフ${player.life}）`,
            )
            if (player.life <= 0 && !state.winner) {
                state.winner = owner
                log(state, `${state.players[owner].name}の勝利！`)
            } else if (dealt > 0) {
                // 相手（opp）から見て「相手（owner）によって自分のライフが減らされたとき」に該当（命の果実）
                fireFieldEventTriggers(state, opp, "ownLifeDamaged")
            }
            return
        }

        case "voidCoreToSelf": {
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

        case "voidCoreToSelfPer": {
            // self 以外の自分のフィールドのスピリット数ぶん、ボイドからコアを置く
            if (!self) {
                log(state, `${sourceName}：コアを置く対象がいなかった。`)
                return
            }
            const count = state.players[owner].field.spirits.filter(
                (s) => s.instanceId !== self.instanceId,
            ).length
            if (count === 0) {
                log(state, `${sourceName}：このスピリット以外に自分のスピリットがいなかった。`)
                return
            }
            self.cores += count
            log(
                state,
                `${getCard(self.cardId).name}は、ボイドからコア${count}個を自身の上に置いた。`,
            )
            return
        }

        case "discardOpponent": {
            // 本来は相手が選ぶが、簡略化して手札末尾からcount枚を破棄する（Math.randomは不使用）
            const player = state.players[opp]
            if (player.hand.length === 0) {
                log(state, `${sourceName}の手札破棄：${player.name}の手札がなかった。`)
                return
            }
            const discarded: string[] = []
            for (let i = 0; i < action.count; i++) {
                const cardId = player.hand.pop()
                if (cardId === undefined) break
                player.trashCards.push(cardId)
                discarded.push(getCard(cardId).name)
            }
            log(
                state,
                `${player.name}は手札「${discarded.join("、")}」を破棄した。`,
            )
            return
        }

        case "selfBuffPer": {
            // このスピリット自身を「相手フィールドの回復状態スピリット数×amountPer」だけBP+
            if (!self) {
                log(state, `${sourceName}：バフ対象がいなかった。`)
                return
            }
            const count = state.players[opp].field.spirits.filter(
                (s) => !s.isRested,
            ).length
            if (count === 0) {
                log(
                    state,
                    `${sourceName}：相手の回復状態のスピリットがいなかったため増加しなかった。`,
                )
                return
            }
            const amount = count * action.amountPer
            self.tempBpBuff += amount
            log(
                state,
                `${getCard(self.cardId).name}はBP+${amount}（ターン終了時まで）。`,
            )
            return
        }

        case "voidCoreToOther": {
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

        case "coreSqueezeAll": {
            // 両プレイヤーの全スピリットについて、コアを1個だけ残し超過分をその持ち主のリザーブへ
            let squeezed = 0
            const toDeplete: { pid: PlayerId; instanceId: string }[] = []
            for (const pid of ["p1", "p2"] as PlayerId[]) {
                const player = state.players[pid]
                for (const inst of [...player.field.spirits]) {
                    if (inst.cores <= 1) continue
                    const excess = inst.cores - 1
                    inst.cores = 1
                    player.reserve += excess
                    squeezed++
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
            for (const { pid, instanceId } of toDeplete) {
                destroySpirit(state, pid, instanceId, "deplete")
            }
            return
        }

        case "endAttackStepAfterBattle": {
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

        case "endAttackStep": {
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

        case "deckReveal": {
            // スワロウアイヴィー：自分のデッキ上からcount枚を公開し、pickTypeに一致する最初の
            // 1枚（省略時は先頭）を手札に加える。残りは元の順で山札の下に戻す。
            // 大天使ミカファール：countPer指定時は自分の指定色スピリット/ネクサス合計数ぶん公開し、
            // pickAllOfType指定時は一致するカードすべてを手札に加える。
            // 簡略化: 本来はプレイヤーが選ぶ／戻す順を選ぶ処理を、決定的な自動選択で代替する。
            const player = state.players[owner]
            const count = action.countPer
                ? [...player.field.spirits, ...player.field.nexuses].filter(
                      (s) => getCard(s.cardId).color === action.countPer!.ownColorTotal,
                  ).length
                : action.count ?? 0
            const revealed = player.deck.splice(0, count)
            if (revealed.length === 0) {
                log(state, `${sourceName}：デッキにカードがないため公開できなかった。`)
                return
            }
            const revealedCount = revealed.length
            const revealedNames = revealed.map((id) => getCard(id).name).join("、")
            if (action.pickAllOfType) {
                const picked = revealed.filter((id) => getCard(id).type === action.pickAllOfType)
                const remaining = revealed.filter((id) => getCard(id).type !== action.pickAllOfType)
                if (picked.length === 0) {
                    log(
                        state,
                        `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開したが、一致するカードがなかった。`,
                    )
                } else {
                    for (const id of picked) player.hand.push(id)
                    log(
                        state,
                        `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開し、${picked.map((id) => getCard(id).name).join("、")}を手札に加えた。`,
                    )
                }
                for (const id of remaining) player.deck.push(id)
                return
            }
            const pickIndex = revealed.findIndex(
                (id) =>
                    action.pickType === undefined ||
                    getCard(id).type === action.pickType,
            )
            if (pickIndex === -1) {
                log(
                    state,
                    `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開したが、一致するカードがなかった。`,
                )
            } else {
                const [pickedId] = revealed.splice(pickIndex, 1)
                player.hand.push(pickedId!)
                log(
                    state,
                    `${player.name}はデッキ上${revealedCount}枚（${revealedNames}）を公開し、${getCard(pickedId!).name}を手札に加えた。`,
                )
            }
            // 残ったカードは公開順のまま山札の下に戻す（下に戻す＝push）
            for (const id of revealed) player.deck.push(id)
            return
        }

        case "recoverSpiritFromTrash": {
            // トラッシュの末尾（新しい方）からスピリットカードを探してcount枚手札に戻す
            // （本来は好きな1枚を選べるが、決定的な自動選択で簡略化）
            const player = state.players[owner]
            for (let i = 0; i < action.count; i++) {
                let idx = -1
                for (let j = player.trashCards.length - 1; j >= 0; j--) {
                    if (getCard(player.trashCards[j]!).type === "spirit") {
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
                log(state, `${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
            }
            return
        }

        case "coreSqueezeOne": {
            // 相手フィールドの実効BP最大のスピリットをcount体選び、コアを1個だけ残す（coreSqueezeAllの単体版）
            const processed = new Set<string>()
            for (let i = 0; i < action.count; i++) {
                const target = pickEnemyByBp(
                    state,
                    opp,
                    Infinity,
                    (s) => !processed.has(s.instanceId),
                    srcColor,
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
                } else {
                    log(state, `${getCard(target.cardId).name}はコアが1個以下のため変化しなかった。`)
                }
                if (target.cores < lv1Cores(getCard(target.cardId))) {
                    destroySpirit(state, opp, target.instanceId, "deplete")
                }
            }
            return
        }

        case "coreToVoidOwn": {
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

        case "bothSidesCoreToTrash": {
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
                removeCoresToTrash(state, pid, target, action.count)
            }
            return
        }

        case "discardSelfOne": {
            // 自分の手札末尾1枚をトラッシュへ（本来は自分が選ぶ処理の簡略化。手札0ならno-op）
            const player = state.players[owner]
            const cardId = player.hand.pop()
            if (cardId === undefined) {
                log(state, `${sourceName}の手札破棄：手札がなかった。`)
                return
            }
            player.trashCards.push(cardId)
            log(state, `${player.name}は手札から${getCard(cardId).name}を破棄した。`)
            return
        }

        case "coreDrainAllOthers": {
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
                removeCores(state, pid, inst, 1)
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

        case "destroySelf": {
            // このスピリット（self）を破壊する（onDestroy誘発あり。selfがnull/不在ならno-op。コリスタル）
            if (!self) {
                log(state, `${sourceName}：selfが不在のため何も起こらなかった。`)
                return
            }
            destroySpirit(state, owner, self.instanceId)
            return
        }

        case "refireSummonEffect": {
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

        case "recoverMagicFromTrash": {
            // トラッシュの末尾（新しい方）からマジックカードを探して1枚手札に戻す
            // （recoverSpiritFromTrashと同じ考え方。本来は好きな1枚を選べるが決定的な自動選択で簡略化）
            const player = state.players[owner]
            let idx = -1
            for (let j = player.trashCards.length - 1; j >= 0; j--) {
                if (getCard(player.trashCards[j]!).type === "magic") {
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
            return
        }

        case "trashCoresToSpirit": {
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

        case "grantKeywordAll": {
            // リフレクションアーマー：自分のスピリット全員（costFilter指定時はコスト一致のみ）に
            // このターンの間キーワードを付与する（grantKeywordの全体版）
            const targets = state.players[owner].field.spirits.filter(
                (s) =>
                    action.costFilter === undefined ||
                    getCard(s.cardId).cost === action.costFilter,
            )
            if (targets.length === 0) {
                log(state, `${sourceName}：対象のスピリットがいなかった。`)
                return
            }
            for (const t of targets) {
                t.tempKeywords.push({
                    keyword: action.keyword,
                    ...(action.colors ? { colors: action.colors } : {}),
                })
            }
            log(
                state,
                `${state.players[owner].name}の${action.costFilter !== undefined ? `コスト${action.costFilter}の` : ""}スピリットすべてに【${KEYWORDS[action.keyword].label}】を付与した。（${targets.length}体）`,
            )
            return
        }

        case "banActByCostThisTurn": {
            // ヘビィゲート：このターンの間、コストがmaxCost以下のスピリットはすべてアタック/ブロック不可
            state.turnConstraints.push({ type: "cantActByCost", maxCost: action.maxCost })
            log(
                state,
                `${sourceName}：このターンの間、コスト${action.maxCost}以下のスピリットはアタックとブロックができない。`,
            )
            return
        }

        case "deployNexus": {
            // 手札またはトラッシュから、指定色いずれかのネクサスカード1枚をコストを支払わずに
            // 自分のフィールドに配置する（スコルピード／白虎ハック／黒虎クロン。
            // 本来は「できる」＝任意発動だが、自動処理では常に発動する簡略化）
            const player = state.players[owner]
            const isMatch = (cardId: string): boolean => {
                const c = getCard(cardId)
                return c.type === "nexus" && action.colors.includes(c.color)
            }
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
            const maintain = lv1Cores(getCard(cardId))
            const inst = createInstance(cardId, state.turn, maintain)
            player.field.nexuses.push(inst)
            log(
                state,
                `${player.name}は${sourceName}の効果で、${action.from === "hand" ? "手札" : "トラッシュ"}から${getCard(cardId).name}をコストを支払わずに配置した。`,
            )
            return
        }

        case "sacrificeNexusThenWipeEnemyNexusCores": {
            // サクリファイス：自分のネクサス1つ（コア数最小、同数は配列先頭）を破壊し、
            // 相手の全ネクサス上のコアを相手のトラッシュへ置く（自分のネクサスを選ぶのは
            // 本来プレイヤーの選択だが、コア数最小を自動選択する決定的な簡略化）
            const mine = state.players[owner].field.nexuses
            if (mine.length === 0) {
                log(state, `${sourceName}：自分のネクサスがなかった。`)
                return
            }
            const sacrifice = mine.reduce((best, n) => (n.cores < best.cores ? n : best))
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

        case "levelOverrideOpponentNexuses": {
            // 皇帝アンプルール：costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。
            // 足りればその数のコアをリザーブからボイドへ送ってから、相手の全ネクサスの
            // levelOverrideThisTurn を level に設定する（このターンの間。ターン終了処理でリセット）
            if (action.costReserveToVoid !== undefined) {
                const player = state.players[owner]
                if (player.reserve < action.costReserveToVoid) {
                    log(state, `${sourceName}：リザーブが足りず発動しなかった。`)
                    return
                }
                player.reserve -= action.costReserveToVoid
                log(
                    state,
                    `${player.name}は${sourceName}の効果で、リザーブのコア${action.costReserveToVoid}個をボイドに置いた。`,
                )
            }
            const oppPlayer = state.players[opp]
            for (const nexus of oppPlayer.field.nexuses) {
                nexus.levelOverrideThisTurn = action.level
            }
            log(
                state,
                `${sourceName}：${oppPlayer.name}のネクサスすべてを、このターンの間Lv${action.level}として扱う。`,
            )
            return
        }

        case "levelOverrideTarget": {
            // 花の子リップ：対象（targetInstanceId＝ブロックした相手スピリット）の
            // levelOverrideThisTurn を level に設定する（このターンの間。ターン終了処理でリセット）
            const found = targetInstanceId ? findSpiritAny(state, targetInstanceId) : null
            if (!found) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            found.inst.levelOverrideThisTurn = action.level
            log(
                state,
                `${sourceName}：${getCard(found.inst.cardId).name}はこのターンの間Lv${action.level}として扱われる。`,
            )
            return
        }

        case "summonFromHandFree": {
            // 老賢樹トレントン／竜戦車アースガルド：自分の手札にある条件（colorFilter一致／
            // sameFamilyAsSelf=selfと系統1つ以上共通）を満たすスピリットカードのうちコスト最大の1枚
            // （同コストは手札の先頭側）を、コストを支払わずに召喚する（プレイヤー選択の決定的簡略化）。
            // この効果で召喚されたスピリットの onSummon 効果は発揮されないため、fireTrigger を呼ばず
            // 直接 createInstance → push する
            const player = state.players[owner]
            const selfFamily = action.sameFamilyAsSelf && self ? getCard(self.cardId).family : null
            let bestIndex = -1
            let bestCost = -1
            for (let i = 0; i < player.hand.length; i++) {
                const candidateId = player.hand[i]!
                const candidate = getCard(candidateId)
                if (candidate.type !== "spirit") continue
                if (action.colorFilter !== undefined && candidate.color !== action.colorFilter) {
                    continue
                }
                if (action.sameFamilyAsSelf) {
                    if (!selfFamily) continue
                    if (!candidate.family.some((f) => selfFamily.includes(f))) continue
                }
                if (candidate.cost > bestCost) {
                    bestCost = candidate.cost
                    bestIndex = i
                }
            }
            if (bestIndex === -1) {
                log(state, `${sourceName}：手札に対象のスピリットがなかった。`)
                return
            }
            const cardId = player.hand[bestIndex]!
            const card = getCard(cardId)
            const maintain = lv1Cores(card)
            if (player.reserve < maintain) {
                log(state, `${sourceName}：リザーブが足りず${card.name}を召喚できなかった。`)
                return
            }
            player.hand.splice(bestIndex, 1)
            player.reserve -= maintain
            const inst = createInstance(cardId, state.turn, maintain)
            player.field.spirits.push(inst)
            log(
                state,
                `${player.name}は${sourceName}の効果で、${card.name}をコストを支払わずに召喚した。` +
                    "（このスピリットの召喚時効果は発揮されない）",
            )
            return
        }
    }
}

// ---- イベント発火 ----

// selfInstance が持つ、指定イベントの誘発効果を実行する。
// レベル条件を満たすものだけ発動する。
// battleRole は onBattle 専用の追加引数：勝利した側の役割（attacker/blocker）を渡す。
// 効果側に battleRole の指定があれば、渡された役割と一致する場合のみ発火する
// （指定なしの効果は従来通り常に発火＝相打ちを含まない「勝った側」全体で発火）。
export function fireTrigger(
    state: GameState,
    owner: PlayerId,
    selfInstance: CardInstance,
    event: TriggerEvent,
    battleRole?: "attacker" | "blocker",
    targetInstanceId?: string,
): void {
    const card = getCard(selfInstance.cardId)
    const level = currentLevel(selfInstance).level
    for (const effect of card.effects) {
        if (effect.kind !== "triggered") continue
        if (effect.trigger !== event) continue
        if (!effectActiveAtLevel(effect.levels, level)) continue
        if (effect.battleRole !== undefined && effect.battleRole !== battleRole) continue
        if (effect.condition) {
            // 溶海竜プレシオスLv3：持ち主から見て相手フィールドのネクサスの色数（重複除く）が
            // opponentNexusColorsAtLeast 以上のときのみ発火
            const oppNexuses = state.players[opponentOf(owner)].field.nexuses
            const colors = new Set(oppNexuses.map((n) => getCard(n.cardId).color))
            if (colors.size < effect.condition.opponentNexusColorsAtLeast) continue
        }
        resolveAction(state, owner, selfInstance, effect.action, targetInstanceId)
    }
}

// バトルの勝者側プレイヤーのフィールド（ネクサス＋スピリット）を走査し、
// kind: "battleWon" かつ role 一致かつレベル条件を満たす効果を実行する（ネクサスのバトル結果誘発）。
// resolveAction には self として発生源（ネクサス／スピリット）ではなく、
// 「勝利したスピリット（winnerInst）」を渡す。refreshSelf 等が「勝ったスピリット」を回復させる
// ような効果文（例: 無限蟲の蟻塚「自分のブロックしたスピリットは回復する」）を、
// 発生源に関係なく素直に表現するための意図的な選択。
// 勝敗が決着したら（state.winner が立ったら）残りは打ち切る。
export function fireBattleWonTriggers(
    state: GameState,
    winnerPid: PlayerId,
    winnerInst: CardInstance,
    role: "attacker" | "blocker",
): void {
    const player = state.players[winnerPid]
    const instances = [...player.field.nexuses, ...player.field.spirits]
    for (const inst of instances) {
        const card = getCard(inst.cardId)
        const level = currentLevel(inst).level
        for (const effect of card.effects) {
            if (effect.kind !== "battleWon") continue
            if (effect.role !== role) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            resolveAction(state, winnerPid, winnerInst, effect.action)
            if (state.winner) return
        }
    }
}

// ステップ誘発の condition を、発火元インスタンスの持ち主 pid 基準で判定する
function checkStepCondition(
    state: GameState,
    pid: PlayerId,
    condition: "handNotGreaterThanOpponent",
): boolean {
    // 主無き古城Lv2：お互いの手札の枚数が同じか、相手の方が多いとき
    return state.players[pid].hand.length <= state.players[opponentOf(pid)].hand.length
}

// 指定ステップに到達したときの誘発（ネクサス・スピリット共通）を、
// ターンプレイヤー側 → 相手側の順に、各プレイヤー内ではスピリット→ネクサスの順で発火する。
// 1件実行するたびに勝敗をチェックし、決着していれば残りは発火させない。
export function fireStepTriggers(state: GameState, step: Phase): void {
    const order: PlayerId[] = [
        state.turnPlayer,
        opponentOf(state.turnPlayer),
    ]
    for (const pid of order) {
        const player = state.players[pid]
        const instances = [...player.field.spirits, ...player.field.nexuses]
        for (const inst of instances) {
            const card = getCard(inst.cardId)
            const level = currentLevel(inst).level
            for (const effect of card.effects) {
                if (effect.kind !== "step") continue
                if (effect.step !== step) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.condition && !checkStepCondition(state, pid, effect.condition)) {
                    continue
                }
                resolveAction(state, pid, inst, effect.action)
                if (state.winner) return
            }
        }
    }
}

// フィールドイベント誘発：「フィールド上の他の何かに起きたこと」に対してネクサス／スピリットが反応する。
//   ownLifeDamaged: pid のライフが（相手によって）減らされたとき
//   ownSpiritDestroyed: pid のスピリットが破壊（または消滅）されたとき
//   anySpiritAttacked: どちらかのスピリットがアタックを宣言したとき（発生源の持ち主を問わず両フィールドから呼ぶ）
// pid のフィールド（スピリット→ネクサスの順、既存の走査順に合わせる）から
// kind:"fieldEvent" かつ event 一致かつレベル・phase・turn 条件を満たす効果を実行する。
// self には発生源インスタンス（効果を持つネクサス／スピリット自身）を渡す。
// selfOverride を指定すると、resolveAction に渡す self とその持ち主を差し替える
// （anySpiritAttacked では「アタックしたスピリット」に効果を作用させるため。
// fireBattleWonTriggers が勝利スピリットを self に渡すのと同じ考え方）。既存呼び出しには影響しない。
// eventColor を指定すると、colorFilter 付きの効果（event: "ownSpiritDestroyed" 限定）は
// この色と一致する場合のみ発火する（祝福されし大聖堂）。他イベントでは colorFilter を持つ
// データが無いため未指定のままでよい。
// 1件実行するたびに勝敗をチェックし、決着していれば残りは発火させない。
// 注意（再入）: ここで実行される action が destroySpirit を呼ぶと、本関数を呼び出した
// destroySpirit 自身への再入となる。現対象カードの action は draw / coreGain のみで
// destroySpirit を呼ばないため安全だが、将来 destroy 系アクションを組み合わせる場合は
// 無限ループ（破壊→誘発→破壊→…）が起きないよう設計時に確認すること。
export function fireFieldEventTriggers(
    state: GameState,
    pid: PlayerId,
    event: FieldEvent,
    selfOverride?: { pid: PlayerId; inst: CardInstance },
    eventColor?: Color,
    targetInstanceId?: string,
): void {
    const player = state.players[pid]
    const instances = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of instances) {
        const card = getCard(inst.cardId)
        const level = currentLevel(inst).level
        for (const effect of card.effects) {
            if (effect.kind !== "fieldEvent") continue
            if (effect.event !== event) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && pid === state.turnPlayer) continue
            if (effect.colorFilter !== undefined && effect.colorFilter !== eventColor) continue
            if (effect.condition) {
                // 花の子リップ：発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上
                const { color, count } = effect.condition.ownColorTotalAtLeast
                const sources = [...player.field.spirits, ...player.field.nexuses]
                const total = sources.filter((s) => getCard(s.cardId).color === color).length
                if (total < count) continue
            }
            if (selfOverride) {
                resolveAction(
                    state,
                    selfOverride.pid,
                    selfOverride.inst,
                    effect.action,
                    targetInstanceId,
                )
            } else {
                resolveAction(state, pid, inst, effect.action, targetInstanceId)
            }
            if (state.winner) return
        }
    }
}

// マジックカードの効果を実行する（timing に一致するすべての効果を配列順に実行）。
// 「ドロー＋バフ」のような複合テキストは effects に複数エントリを並べて表現する。
export function resolveMagic(
    state: GameState,
    owner: PlayerId,
    cardId: string,
    timing: "main" | "flash",
    targetInstanceId?: string,
): void {
    const card = getCard(cardId)
    for (const effect of card.effects) {
        if (effect.kind !== "magic" || effect.timing !== timing) continue
        // self が null（マジック）のため、装甲・マジック効果耐性判定用のカード色／種別を明示的に渡す
        resolveAction(state, owner, null, effect.action, targetInstanceId, card.color, "magic")
    }
    // フィールドイベント誘発「自分がマジックの効果を使用したとき」：使用者側のフィールドから発火
    // （opponentDrewの実装を踏襲。緑芽吹く原野）
    if (!state.winner) {
        fireFieldEventTriggers(state, owner, "ownMagicUsed")
    }
}
