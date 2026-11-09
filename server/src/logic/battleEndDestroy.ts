// 「バトル解決時、〜をブロックしていた〜をバトル終了時に破壊する」（kind:"destroyBlockerAtBattleEnd"）の予約
import { entryActive } from "../../../shared/rules/effectStop"
import { noteCoverage } from "../../../shared/coverage"
import { effectSources, instColors } from "../../../shared/rules"
import type { CardInstance, GameState, PlayerId } from "../type"
import { currentLevel, getCard, log } from "./GameState"

// 発生源が場にいる（effectSources）ことの判定はここで済ませる。予約の後は発生源の有無を見ない
export function reserveBlockerDestroyByEntries(
    state: GameState,
    attackerPid: PlayerId,
    attacker: CardInstance,
    blockerPid: PlayerId,
    blocker: CardInstance,
): void {
    if (attackerPid === blockerPid || !state.battle) return
    for (const source of effectSources(state, attackerPid)) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "destroyBlockerAtBattleEnd") continue
            if (!entryActive(state, attackerPid, source, effect, sourceLevel)) continue
            if (getCard(attacker.cardId).cost !== effect.attackerCost) continue
            if (currentLevel(blocker).level !== effect.blockerLevel) continue
            noteCoverage(effect, "destroyBlockerAtBattleEnd")
            const list = state.battle.endBattleDestroy ?? []
            list.push({
                targetInstanceId: blocker.instanceId,
                sourceInstanceId: source.instanceId,
                sourcePid: attackerPid,
                sourceColors: instColors(source),
                sourceType: "spirit",
            })
            state.battle.endBattleDestroy = list
            log(state, `${getCard(source.cardId).name}：${getCard(blocker.cardId).name}をバトル終了時に破壊する。`)
        }
    }
}
