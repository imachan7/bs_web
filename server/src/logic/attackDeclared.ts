// アタック宣言で誘発する効果を1つの列にして同時発揮として解決する（TIMING_CHART ＞１-2・§0-3。解決順はターンプレイヤーが選ぶ）。
// アタッカーの疲労による「疲労したとき」も同じ列に入れる（＞１-1 の疲労はアタック宣言そのもの。2026-11-03 ユーザー確認）。
// アタック後バースト（＞１-3）は列を解決し終えてから判定する
import type { CardInstance, EventBurstCheck, GameState, PlayerId } from "../type"
import { getCard, log, opponentOf, pushResumeFrames, resolveInOrder, suspend } from "./GameState"
import { fireEventBursts, fireFieldEventTriggers, fireTrigger, instColors } from "./EffectModules"
import { exhaustedEvents } from "./state/exhaust"
import { attackEffectsTollActive, instAllCosts } from "../../../shared/rules"
import type { CollectedTrigger } from "./blockDeclared"

// directed：指定アタック。『バトル時』は相手が決まるブロック確定時に発火するので、ここでは積まない
export function resolveAttackDeclared(state: GameState, pid: PlayerId, inst: CardInstance, directed: boolean): void {
    // BS20-072 Lv2（attackEffectsToll）：アタッカーの『アタック時』より先に支払いを聞く（2026-11-05 ユーザー確認）。
    // 応答したらこの関数をやり直すので、聞いたかどうかを BattleState に印して二度聞きを防ぐ
    const battle = state.battle
    if (battle && !battle.attackEffectsTollAsked && attackEffectsTollActive(state, pid)) {
        battle.attackEffectsTollAsked = true
        const player = state.players[pid]
        if (player.reserve <= 0) {
            battle.attackEffectsSuppressed = true
            log(state, `${player.name}のリザーブにコアが無いため、${getCard(inst.cardId).name}の『アタック/バトル時』効果すべては発揮されない。`)
        } else if (!state.interactiveTargets) {
            player.reserve -= 1
            player.trashCores += 1
            log(state, `${player.name}はリザーブのコア1個をトラッシュに置いた。`)
        } else {
            suspend(state, {
                pid,
                kind: "option",
                prompt: `リザーブのコア1個をトラッシュに置きますか？（置かなければ${getCard(inst.cardId).name}の『アタック/バトル時』効果すべては発揮できない）`,
                candidates: [],
                options: ["置く", "置かない"],
                optional: true,
                action: { type: "noop" },
                selfInstanceId: inst.instanceId,
                attackEffectsToll: { attackerPid: pid, attackerInstanceId: inst.instanceId, directed },
            })
            return
        }
    }
    const items: CollectedTrigger[] = []
    const checks: EventBurstCheck[] = []
    fireTrigger(state, pid, inst, "onAttack", undefined, undefined, undefined, undefined, undefined, undefined, items)
    if (!directed) fireTrigger(state, pid, inst, "onBattleStart", "attacker", undefined, undefined, undefined, undefined, undefined, items)
    const colors = instColors(inst)
    // instAllCosts：本来のコストに加え、道化師クランの付与コストも含める（costFilter で絞る効果のため）
    const attacked = { costs: instAllCosts(inst) }
    const events = [
        { pid, event: "anySpiritAttacked" as const, info: attacked },
        { pid: opponentOf(pid), event: "anySpiritAttacked" as const, info: attacked },
        ...exhaustedEvents(pid, inst),
    ]
    for (const ev of events) {
        fireFieldEventTriggers(state, ev.pid, ev.event, { pid, inst }, colors, undefined, undefined, ev.info, undefined, undefined, undefined, undefined, items)
        checks.push({ pid: ev.pid, event: ev.event, subject: { pid, cardId: inst.cardId }, colors, info: ev.info })
    }
    resolveInOrder(state, items, {
        skip: (i) => i.skip?.() === true,
        resolve: (i) => i.run(),
        frame: (i) => i.frame,
        askOrder: { pid: state.turnPlayer, label: (i) => i.label, key: (i) => i.key },
    })
    if (state.winner) return
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "eventBursts", checks }])
        return
    }
    fireEventBursts(state, checks)
}
