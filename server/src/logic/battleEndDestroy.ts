// 「バトル解決時、〜とバトルした相手のスピリットを、バトル終了時に破壊する」（kind:"destroyOpponentAtBattleEnd"）の予約
import { entryActive } from "../../../shared/rules/effectStop"
import { noteCoverage } from "../../../shared/coverage"
import { effectSources, instColors } from "../../../shared/rules"
import { matchesTarget } from "../../../shared/rules/targetFilter"
import type { CardInstance, GameState, PlayerId } from "../type"
import { currentLevel, getCard, log } from "./GameState"

// 発生源が場にいる（effectSources）ことの判定はここで済ませる。予約の後は発生源の有無を見ない
// 発生源の持ち主の側（アタッカー／ブロッカー）ごとに、相手の側の体を見る。
// opponentRole は相手の立場（"blocker"＝自分がアタッカーで相手がブロッカー）
export function reserveBlockerDestroyByEntries(
    state: GameState,
    attackerPid: PlayerId,
    attacker: CardInstance,
    blockerPid: PlayerId,
    blocker: CardInstance,
): void {
    if (attackerPid === blockerPid || !state.battle) return
    const sides = [
        { pid: attackerPid, own: attacker, ownRole: "attacker", opp: blocker, oppPid: blockerPid },
        { pid: blockerPid, own: blocker, ownRole: "blocker", opp: attacker, oppPid: attackerPid },
    ] as const
    for (const side of sides) {
        for (const source of effectSources(state, side.pid)) {
            const sourceLevel = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "destroyOpponentAtBattleEnd") continue
                if (!entryActive(state, side.pid, source, effect, sourceLevel)) continue
                if (effect.opponentRole === "blocker" && side.ownRole !== "attacker") continue
                if (effect.opponentRole === "attacker" && side.ownRole !== "blocker") continue
                if (effect.ownCost !== undefined && getCard(side.own.cardId).cost !== effect.ownCost) continue
                if (effect.opponentLevel !== undefined && currentLevel(side.opp).level !== effect.opponentLevel) continue
                if (!matchesTarget(state, side.oppPid, side.opp, effect.opponentFilter)) continue
                noteCoverage(effect, "destroyOpponentAtBattleEnd")
                const list = state.battle.endBattleDestroy ?? []
                list.push({
                    targetInstanceId: side.opp.instanceId,
                    sourceInstanceId: source.instanceId,
                    sourcePid: side.pid,
                    sourceColors: instColors(source),
                    sourceType: getCard(source.cardId).type,
                })
                state.battle.endBattleDestroy = list
                log(state, `${getCard(source.cardId).name}：${getCard(side.opp.cardId).name}をバトル終了時に破壊する。`)
            }
        }
    }
}
