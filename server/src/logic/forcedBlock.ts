// 強制ブロック（exhaustAndForceBlock）の宣言処理。
// ブロック前のフラッシュが閉じた時点で、記録された個体を防御側のブロック宣言の代わりに成立させる（2026-10-23 ユーザー裁定）
import type { GameState } from "../type"
import { blockRequiredCount, canBlock } from "../../../shared/block"
import { finishBlockDeclaration } from "./GameEngine"
import { findSpirit, getCard, log, opponentOf } from "./GameState"

export function resolveForcedBlock(state: GameState): void {
    const battle = state.battle
    const id = battle?.forcedBlockerInstanceId
    if (!battle || id === undefined) return
    const attackerPid = state.turnPlayer
    const defenderPid = opponentOf(attackerPid)
    const attacker = findSpirit(state.players[attackerPid], battle.attackerInstanceId)
    const forced = findSpirit(state.players[attackerPid], id)
    const giveUp = (why: string): void => {
        delete battle.forcedBlockerInstanceId
        log(state, `${why}ため、防御側が通常どおりブロックを宣言する。`)
    }
    if (!attacker || !forced) return giveUp("ブロックさせるスピリットが場にいない")
    const name = getCard(forced.cardId).name
    const reason = canBlock(state, attackerPid, forced, attackerPid, attacker, { ignoreRested: true })
    if (reason) return giveUp(`${name}はブロックできない（${reason}）`)
    const required = blockRequiredCount(state, attackerPid, attacker)
    if (required > 1) {
        // 複数体ブロック：この個体を1体目として貯め、残りは防御側が宣言する。揃えられないなら宣言ごと不成立
        // （貯めたまま止まるとライフで受けられなくなる）
        const others = state.players[defenderPid].field.spirits.filter((sp) => canBlock(state, defenderPid, sp, attackerPid, attacker) === null).length
        if (others + 1 < required) return giveUp(`ブロックに必要な${String(required)}体を揃えられない`)
        battle.pendingBlockerIds = [id]
        log(state, `${name}がブロック宣言（あと${String(required - 1)}体）。`)
        return
    }
    finishBlockDeclaration(state, defenderPid, id)
}
