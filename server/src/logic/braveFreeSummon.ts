// 概念: kind:"braveFreeSummonByCoreTrash"（BS23-X05）。手札/手元のブレイヴを、リザーブのコア1個をトラッシュに置いて無償で召喚する
import { effectSources, currentLevel } from "../../../shared/rules"
import { entryActive } from "../../../shared/rules/effectStop"
import { noteCoverage } from "../../../shared/coverage"
import type { GameAction, GameState, PlayerId } from "../type"
import { getCard, log, minLevelCores, suspend } from "./GameState"
import { summonFreeFromHandIndex } from "./EffectModules"
import { canPayFreeSummonSurcharge } from "./summonSurcharge"
import { summonDenial } from "./summonGate"

type SummonAction = Extract<GameAction, { type: "summon" }>

function braveFreeSource(state: GameState, pid: PlayerId) {
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "braveFreeSummonByCoreTrash") continue
            if (!entryActive(state, pid, source, effect, level)) continue
            noteCoverage(effect, "braveFreeSummonByCoreTrash")
            return source
        }
    }
    return null
}

// undefined＝この経路には乗らない（通常の召喚へ進む）。null／文字列＝この経路で処理した結果（文字列は拒否理由）
export function tryBraveFreeSummon(state: GameState, pid: PlayerId, action: SummonAction): string | null | undefined {
    if (action.braveFreeChoice === false) return undefined
    if (state.winner || state.phase !== "main" || state.turnPlayer !== pid || state.isFlashTiming) return undefined
    if (action.substituteInstanceId !== undefined || action.altSummonNexusInstanceIds !== undefined || (action.level ?? 1) > 1) return undefined
    const player = state.players[pid]
    const cardId = action.fromTegamoto ? player.tegamoto[action.handIndex] : player.hand[action.handIndex]
    if (cardId === undefined || getCard(cardId).type !== "brave") return undefined
    if (action.fromTegamoto && !player.tegamotoPlayable.includes(cardId)) return undefined
    const source = braveFreeSource(state, pid)
    if (source === null) return undefined
    const card = getCard(cardId)
    // 効果による召喚の禁止・1コスト以上支払う縛り（X07。Q4611）はここで弾き、通常の召喚に任せる
    if (summonDenial(state, { pid, cardId, from: "hand", cause: "effect", braveTargetInstanceId: action.braveTargetInstanceId }) !== null) return undefined
    const maintain = action.braveTargetInstanceId !== undefined ? 0 : minLevelCores(card)
    player.reserve -= 1
    const affordable = player.reserve >= maintain && canPayFreeSummonSurcharge(state, pid, card, maintain, false)
    player.reserve += 1
    if (!affordable) return undefined

    if (action.braveFreeChoice === undefined && state.interactiveTargets) {
        suspend(state, {
            pid,
            kind: "option",
            prompt: `${card.name}：リザーブのコア1個をトラッシュに置いて、コストを支払わずに召喚しますか？`,
            candidates: [],
            options: ["コア1個をトラッシュに置き、コストを支払わずに召喚する", "通常どおり召喚する"],
            optional: false,
            sokuFreeChoice: {
                handIndex: action.handIndex,
                braveFree: true,
                ...(action.fromTegamoto ? { fromTegamoto: true as const } : {}),
                ...(action.level !== undefined ? { level: action.level } : {}),
                ...(action.paySources !== undefined ? { paySources: action.paySources } : {}),
                ...(action.braveTargetInstanceId !== undefined ? { braveTargetInstanceId: action.braveTargetInstanceId } : {}),
            },
            action: { type: "noop" },
            selfInstanceId: null,
        })
        return null
    }

    let handIndex = action.handIndex
    if (action.fromTegamoto) {
        player.tegamoto.splice(action.handIndex, 1)
        player.tegamotoPlayable.splice(player.tegamotoPlayable.indexOf(cardId), 1)
        player.hand.push(cardId)
        handIndex = player.hand.length - 1
    }
    player.reserve -= 1
    player.trashCores += 1
    log(state, `${player.name}は${getCard(source.cardId).name}の効果で、リザーブのコア1個をトラッシュに置き、${card.name}をコストを支払わずに召喚する。`)
    summonFreeFromHandIndex(state, pid, getCard(source.cardId).name, handIndex, undefined, {
        skipOnSummon: true,
        ...(action.braveTargetInstanceId !== undefined ? { braveTargetInstanceId: action.braveTargetInstanceId } : {}),
    })
    return null
}
