// サーバー／クライアント共有のブロック可否判定。
//
// サーバー（RuleValidator.validateBlock）は「バトルが発生しているか」「優先権があるか」など
// 進行状態の前提を先に検証してからこの関数を呼び、クライアント（renderer）は
// ブロック可能ハイライトの判定に同じ関数を使う。
// エラー理由の文字列を返し、ブロック可能なら null を返す（サーバーはその文字列をそのまま拒否理由に使う）。
import type { CardInstance, PlayerId } from "../server/src/type"
import type { Board } from "./board"
import { card } from "./cardDb"
import { COLOR_LABELS } from "../data/constants"
import {
    activeConstraints,
    activeConstraintsWithSource,
    boardResistanceAgainst,
    cantActByTimed,
    matchesTarget,
    resolveSelfRelative,
    timedPlayerRules,
    timedContentsOn,
    canBlockWhileRestedThisTurn,
    currentLevel,
    effectiveBp,
    instAllCosts,
    instCantBlockByCost,
    instHasColor,
    instHasTriggerEffect,
    instHasCost,
    instColors,
    bravesOf,
    instIsCombined,
    instIsVanilla,
    instMatchesCostFilter,
    matchesFamilyFilter,
    KEYWORDS,
    spiritHasKeyword,
    type DirectAttackFilter,
} from "./rules"

// このアタッカーをブロックするのに必要なブロッカーの体数（blockRequiresCount）。
// 通常は1。BS10-X03巨蟹武神キャンサードのように「スピリット2体でないとブロックできない」制約が
// 効いている間は2以上を返す。複数ある場合はいちばん厳しい（多い）ものを採る
export function blockRequiredCount(
    board: Board,
    attackerPid: PlayerId,
    attackerInst: CardInstance | undefined,
): number {
    if (!attackerInst) return 1
    let required = 1
    for (const c of activeConstraints(board, attackerPid, attackerInst)) {
        if (c.type === "blockRequiresCount" && c.count > required) required = c.count
    }
    return required
}

// このアタッカーをブロックするのに払うコスト（制約 blockPayCost の合計）。
// 〔重複不可〕は noStackId ごとに1回分だけ数える
export function blockPayCost(
    board: Board,
    attackerPid: PlayerId,
    attackerInst: CardInstance | undefined,
): number {
    if (!attackerInst) return 0
    const counted = new Set<string>()
    let total = 0
    for (const { constraint: c } of activeConstraintsWithSource(board, attackerPid, attackerInst)) {
        if (c.type !== "blockPayCost") continue
        if (c.noStackId !== undefined) {
            if (counted.has(c.noStackId)) continue
            counted.add(c.noStackId)
        }
        total += c.count
    }
    return total
}

// このアタッカーをブロックするのにトラッシュへ置くリザーブのコアの数（制約 blockReserveToTrash の合計）
export function blockReserveToTrashCount(board: Board, attackerPid: PlayerId, attackerInst: CardInstance | undefined): number {
    if (!attackerInst) return 0
    return activeConstraints(board, attackerPid, attackerInst).reduce((n, c) => n + (c.type === "blockReserveToTrash" ? c.count : 0), 0)
}

// このアタッカーをブロックするのに、ブロックするスピリット以外の回復状態のスピリット1体を疲労させる必要があるか（制約 blockExhaustSpirit）
export function blockExhaustSpiritRequired(board: Board, attackerPid: PlayerId, attackerInst: CardInstance | undefined): boolean {
    if (!attackerInst) return false
    return activeConstraints(board, attackerPid, attackerInst).some((c) => c.type === "blockExhaustSpirit")
}

export function canBlock(
    board: Board,
    blockerPid: PlayerId,
    blockerInst: CardInstance,
    attackerPid: PlayerId,
    attackerInst: CardInstance | undefined,
    // ignoreRested：強制ブロック(exhaustAndForceBlock)は疲労させた直後の個体が宣言するので、疲労は理由にしない
    opts?: { ignoreRested?: boolean },
): string | null {
    // ブロッカー側の制約（cantBlock / cantBlockLowerBp）。
    // バーストファイアで無効化されている場合はこれらのチェックをスキップする
    const blockerConstraints = activeConstraints(board, blockerPid, blockerInst)
    if (blockerInst.isRested && !opts?.ignoreRested) {
        const canBlockRested =
            blockerConstraints.some((c) => {
                if (c.type !== "canBlockWhileRested") return false
                if (c.filter === undefined) return true
                return attackerInst !== undefined && matchesTarget(board, attackerPid, attackerInst, c.filter, blockerInst.instanceId)
            }) || canBlockWhileRestedThisTurn(board, blockerPid, blockerInst)
        if (!canBlockRested) return "疲労しているためブロックできません"
    }
    // 期間つき効果でブロックできない（1体指定・「すべて」とも）。
    // 効果で直接掛けたものなので blockConstraintNegatedThisTurn（制約の無効化）では消えない
    if (cantActByTimed(board, blockerInst, "block")) {
        return "このスピリットは効果によりブロックできません"
    }
    if (instCantBlockByCost(board, blockerInst)) {
        return "このスピリットはコストによりブロックできません"
    }
    if (!blockerInst.blockConstraintNegatedThisTurn) {
        if (blockerConstraints.some((c) => c.type === "cantBlock")) {
            return "このスピリットはブロックできません"
        }
        if (
            attackerInst &&
            blockerConstraints.some((c) => c.type === "cantBlockLowerBp") &&
            effectiveBp(board, attackerPid, attackerInst) < effectiveBp(board, blockerPid, blockerInst)
        ) {
            return "BPの低いスピリットはブロックできません"
        }
    }

    // アタッカー側の制約（unblockableBy）。
    // レッドウォール使用中は、ブロック側がこのターン「ブロックされない」効果を無視できる
    // BS09-049炎蜥蜴クトゥグマ：このスピリットは「ブロックされない」効果を持つ相手もブロックできる
    // （継続的な制約・ターン限定の印のどちらも乗り越える。2026-08-14 ユーザー確認）
    const ignoresUnblockable = blockerConstraints.some((c) => c.type === "canBlockUnblockable")
    if (attackerInst && !ignoresUnblockable && !timedPlayerRules(board, blockerPid).some((c) => c.type === "ignoreUnblockableForPid")) {
        // 期間つき効果の「ブロックされない」（1体・すべて・ブレイヴのホスト）。from があればそれに合う相手からだけ
        for (const c of timedContentsOn(board, attackerInst)) {
            if (c.type !== "unblockable") continue
            if (c.opponentOnly && blockerPid === attackerPid) continue
            if (c.from === undefined) return "このスピリットはブロックされません"
            if (matchesTarget(board, blockerPid, blockerInst, c.from)) return "このスピリットはこの相手にブロックされません"
        }
        for (const c of activeConstraints(board, attackerPid, attackerInst)) {
            if (c.type !== "unblockableBy") continue
            if (c.opponentOnly && blockerPid === attackerPid) continue
            // filter も noSoulCore も無い unblockableBy は「すべてにブロックされない」（require* は有効かどうかの条件で、ブロッカーの絞り込みではない）。__eid は coverage:effects が足す計測用の印
            if (Object.keys(c).every((k) => k === "type" || k === "__eid" || k.startsWith("require"))) return "このスピリットはブロックされません"
            if (c.noSoulCore && blockerInst.soulCoreOn !== true) return "このスピリットは[ソウルコア]が置かれていないスピリットにブロックされません"
            if (c.filter !== undefined && matchesTarget(board, blockerPid, blockerInst, resolveSelfRelative(c.filter, attackerInst), attackerInst.instanceId)) {
                return "このスピリットはこの相手にブロックされません"
            }
        }
    }
    return null
}

// 指定アタック（canDirectAttack）の対象条件に、指定された相手スピリットが合致するか。
// サーバー（validateAttack）は拒否理由の文字列を、クライアントは対象ハイライトの可否を
// この同一実装から得る（合致すれば null）。targetMinBp判定にはBoardと対象の持ち主pidが必要
export function matchesDirectedAttackFilter(
    filter: DirectAttackFilter,
    target: CardInstance,
    board: Board,
    targetPid: PlayerId,
    // 指定する側（アタッカー）。渡すと**その効果を受けない個体は指定できない**
    // （2026-09-06 ユーザー確認：指定アタックは【装甲】/【重装甲】で防がれ、指定できない）
    attacker?: { pid: PlayerId; inst: CardInstance },
): string | null {
    if (attacker) {
        const resisted = boardResistanceAgainst(board, targetPid, target, {
            actorPid: attacker.pid,
            op: "other",
            scope: "targeted",
            sourceType: card(attacker.inst.cardId).type,
            sourceColors: instColors(attacker.inst),
        })
        if (resisted) return "このスピリットは効果を受けないため指定できません"
    }
    if (filter.onlyInstanceIds && !filter.onlyInstanceIds.includes(target.instanceId)) {
        return "相手の効果により、指定されたスピリットしか指定できません"
    }
    // BS12-008 グランド・ドラグキャッスル：相手のフィールドで最もBPの高いスピリットしか指定できない
    if (filter.targetHighestBp) {
        const maxBp = Math.max(
            ...board.players[targetPid].field.spirits.map((s) => effectiveBp(board, targetPid, s)),
        )
        if (effectiveBp(board, targetPid, target) < maxBp) {
            return "最もBPの高いスピリットしか指定できません"
        }
    }
    // BS11-X02 滅神星龍ダークヴルム・ノヴァ：相手の**合体スピリット**しか指定できない
    if (filter.targetCombinedOnly && !instIsCombined(target)) {
        return "相手の合体スピリットしか指定できません"
    }
    if (filter.targetFilter === "rested" && !target.isRested) return "疲労状態のスピリットしか指定できません"
    if (filter.targetFilter === "singleCore" && target.cores !== 1) return "コア1個のスピリットしか指定できません"
    if (filter.targetFilter === "recovered" && target.isRested) return "回復状態のスピリットしか指定できません"
    if (filter.targetFilter === "hasSummonTrigger" && !instHasTriggerEffect(target, "onSummon")) return "『召喚時』効果を持つスピリットしか指定できません"
    if (
        filter.targetMinBp !== undefined &&
        effectiveBp(board, targetPid, target) < filter.targetMinBp
    ) {
        return `BP${filter.targetMinBp}以上のスピリットしか指定できません`
    }
    // BS05天焦がす大聖火Lv2：コスト5以上のみ指定できる（道化師クランの付与コストも見る）
    if (
        filter.targetMinCost !== undefined &&
        !instMatchesCostFilter(target, { min: filter.targetMinCost })
    ) {
        return `コスト${filter.targetMinCost}以上のスピリットしか指定できません`
    }
    return null
}
