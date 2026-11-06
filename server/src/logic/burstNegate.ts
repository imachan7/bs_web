// 相手のバーストの発動を、自分のスピリットを破壊することで無効にする（BS21-052。kind:"burstActivationNegate"）。
// 聞くのは発動の経路を問わずバースト効果の解決前。無効にしたバーストは効果もフラッシュ効果も解決せずトラッシュへ置く
import { noteCoverage } from "../../../shared/coverage"
import { effectiveBp, effectSources } from "../../../shared/rules"
import { entryActive } from "../../../shared/rules/effectStop"
import type { CardInstance, EffectDef, PendingChoice, GameState, PlayerId } from "../type"
import { currentLevel, getCard, log, opponentOf, suspend } from "./GameState"
import { destroySpirit } from "./removal"
import { burstCardIgnoresEffects } from "./keywords/burst"

type NegateInfo = NonNullable<PendingChoice["burstNegate"]>

// 無効にできる発生源と、破壊するスピリットの候補。無ければ null（払えないなら聞かない：COST_MODEL §10）
function findBurstNegate(state: GameState, burstPid: PlayerId, burstCardId: string): { pid: PlayerId; effect: Extract<EffectDef, { kind: "burstActivationNegate" }>; candidates: CardInstance[] } | null {
    // 「発動を無効にする」はバーストに掛かる効果なので、効果を受けないバーストには効かない（Q7012）
    if (burstCardIgnoresEffects(burstCardId)) return null
    const pid = opponentOf(burstPid)
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "burstActivationNegate") continue
            if (!entryActive(state, pid, source, effect, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            const candidates = state.players[pid].field.spirits.filter((s) => getCard(s.cardId).family.includes(effect.destroyFamily))
            if (candidates.length === 0) continue
            return { pid, effect, candidates }
        }
    }
    return null
}

// バーストが発動する全経路（発動確認の承認・非対話の自動発動・効果でめくった／条件を無視した発動）が、効果の解決とバーストカードの公開の前に呼ぶ。
// 無効にした・確認を出して中断したなら true（呼び出し側は発動の解決をしない）。
// 非対話（AI・テスト）は払えるなら自動で破壊して無効にする（実効BPの最も低い1体。reviveOnDestroy の非対話と同じ「払えるなら払う」）
export function negateBurstActivation(state: GameState, burstPid: PlayerId, cardId: string, resume: NegateInfo["resume"]): boolean {
    const found = findBurstNegate(state, burstPid, cardId)
    if (!found) return false
    if (!state.interactiveTargets) {
        const pick = found.candidates.reduce((min, s) => (effectiveBp(state, found.pid, s) < effectiveBp(state, found.pid, min) ? s : min))
        applyBurstNegate(state, found.pid, pick.instanceId, { burstPid, cardId, resume })
        return true
    }
    suspend(state, {
        pid: found.pid,
        kind: "target",
        prompt: `相手が${getCard(cardId).name}のバーストを発動しました。${found.candidates.length === 1 ? "" : "破壊するスピリットを選ぶと、"}異合のスピリット1体を破壊して発動を無効にしますか？`,
        candidates: found.candidates.map((s) => s.instanceId),
        optional: true,
        action: { type: "noop" },
        selfInstanceId: null,
        burstNegate: { burstPid, cardId, resume },
    })
    return true
}

// 破壊することを選んだ：スピリットを破壊し、バーストカードをトラッシュへ置く（発動の後始末や「バースト発動後」の誘発は起きない）
export function applyBurstNegate(state: GameState, pid: PlayerId, instanceId: string, info: NegateInfo): void {
    const found = findBurstNegate(state, info.burstPid, info.cardId)
    if (found) noteCoverage(found.effect, "burstActivationNegate")
    destroySpirit(state, pid, instanceId)
    const holder = state.players[info.burstPid]
    if (holder.burst === info.cardId) {
        holder.burst = null
        holder.burstSet = false
        holder.trashCards.push(info.cardId)
    }
    log(state, `${getCard(info.cardId).name}のバーストの発動は無効になり、破棄された。`)
}
