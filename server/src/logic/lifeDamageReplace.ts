// kind:"lifeDamageReplace"：アタックが相手のライフを減らすとき、通常の減少の代わりに action を解決する
import { entryActive } from "../../../shared/rules/effectStop"
import { noteCoverage } from "../../../shared/coverage"
import type { CardInstance, GameState, PlayerId, ResumeFrame } from "../type"
import { currentLevel, findInstanceAnywhere, getCard, opponentOf, pushResumeFrames } from "./GameState"
import { matchesFamilyFilter, resolveAction } from "./EffectModules"
import { effectSources } from "../../../shared/rules"
import { requestActivationConfirm } from "./targeting"

type LifeFrame = Extract<ResumeFrame, { kind: "lifeDamageResolve" }>

interface Candidate {
    source: CardInstance
    effect: Extract<ReturnType<typeof getCard>["effects"][number], { kind: "lifeDamageReplace" }>
}

function candidatesFor(state: GameState, attackerPid: PlayerId, attacker: CardInstance): Candidate[] {
    const found: Candidate[] = []
    for (const source of effectSources(state, attackerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "lifeDamageReplace") continue
            if (!entryActive(state, attackerPid, source, effect, level)) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && attackerPid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && attackerPid === state.turnPlayer) continue
            }
            if (effect.target === "self" ? source.instanceId !== attacker.instanceId : effect.familyFilter !== undefined && !matchesFamilyFilter(state, attackerPid, attacker, effect.familyFilter)) continue
            found.push({ source, effect })
        }
    }
    return found
}

// 複製した盤面で試し、相手のライフが何個減るかを数える（action の形に依存せず「効かない」を判定するため）
function reductionOf(state: GameState, attackerPid: PlayerId, c: Candidate): number {
    const sim = structuredClone(state)
    sim.interactiveTargets = false
    sim.pendingChoice = null
    const oppPid = opponentOf(attackerPid)
    resolveAction(sim, attackerPid, findInstanceAnywhere(sim, c.source.instanceId) ?? null, c.effect.action)
    return state.players[oppPid].life - sim.players[oppPid].life
}

// 置換が成立しうるなら引き取る。複数当たるときは減るコアが最も多い1つだけを提示する
// （どれか1つしか使えないが、候補どうしの選択は聞かない。現行の2枚は同じ段階表）。
// immediate=true は非対話でその場で解決済み（呼び出し側が settle を続ける）、false は確認待ちで再開スタックに積んだ
export function startLifeDamageReplace(
    state: GameState,
    attackerPid: PlayerId,
    attacker: CardInstance,
): { frame: LifeFrame; immediate: boolean } | null {
    let best: { c: Candidate; n: number } | null = null
    for (const c of candidatesFor(state, attackerPid, attacker)) {
        const n = reductionOf(state, attackerPid, c)
        if (n > 0 && (!best || n > best.n)) best = { c, n }
    }
    if (!best) return null
    const { source, effect } = best.c
    noteCoverage(effect, "lifeDamageReplace")
    const frame: LifeFrame = {
        kind: "lifeDamageResolve",
        step: 0,
        attackerPid,
        attackerSnapshot: { ...attacker },
        dealt: 0,
        lifeTriggers: false,
        settle: { lifeBefore: state.players[opponentOf(attackerPid)].life },
    }
    if (state.interactiveTargets) {
        requestActivationConfirm(state, attackerPid, `${getCard(source.cardId).name}：ライフを減らす代わりに、相手のライフのコアをリザーブに置きますか？`, effect.action, source)
        pushResumeFrames(state, [frame])
        return { frame, immediate: false }
    }
    resolveAction(state, attackerPid, source, effect.action)
    return { frame, immediate: true }
}
