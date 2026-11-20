// ゲームの再開始（PB13-05 グラウンド・オブ・ロロ）。全カードをデッキへ戻して切り直し、先攻を決め直して1ターン目から始める
import type { CardInstance, GameState, PlayerId } from "../type"
import { log, shuffle } from "./GameState"
import { leavesNothingBehind } from "./keywords/bunshin"
import { runTurnStart } from "./PhaseManager"

const RESTART_RESERVE = 6
const RESTART_HAND = 2

// 場のカード1個体が、デッキへ戻すカードとして何を残すか（トークンは残さない・分身は元のカード）
function cardsOfInstance(inst: CardInstance): string[] {
    const own = leavesNothingBehind(inst) ? [] : [inst.bunshinOf ?? inst.cardId]
    return [...own, ...(inst.underCards ?? [])]
}

// 除外ゾーン（excludedCards）とライフのコアは動かさない。
// 期間つきの効果・貸与（ゲームの間のものも）・ターンの記録は、再開後に最初からやり直すためすべて消す。
// 呼び出し元が解決の続きを走らせないよう、再開スタックも捨てる（エンドステップの残りを行わない）
export function restartGame(state: GameState): void {
    state.gameRestartCount = (state.gameRestartCount ?? 0) + 1
    log(state, "ゲームを最初から再開する。")

    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = state.players[pid]
        const f = p.field
        const all = [
            ...p.deck,
            ...p.hand,
            ...p.trashCards,
            ...p.tegamoto,
            ...(p.burst === null ? [] : [p.burst]),
            ...[...f.spirits, ...f.nexuses, ...f.combinedBraves, ...f.magics].flatMap(cardsOfInstance),
        ]
        p.deck = shuffle(all)
        p.hand = p.deck.splice(0, RESTART_HAND)
        p.trashCards = []
        p.tegamoto = []
        p.tegamotoPlayable = []
        p.field = { spirits: [], nexuses: [], combinedBraves: [], magics: [] }
        p.burst = null
        p.burstSet = false
        p.burstSetThisTurn = false
        delete p.burstRevealedCardId
        p.reserve = RESTART_RESERVE
        p.trashCores = 0
        p.deckSideCores = 0
        p.soulCore = null
        p.turnVirtualInstances = []
        p.battleVirtualInstances = []
        p.gameVirtualInstances = []
        p.tempHandKeywordGrants = []
        delete p.minAttackCostThisTurn
        delete p.peekedOpponentBurstCardId
        delete p.peekedOpponentCardIds
        delete p.onceByNameUsed
        delete p.onceByNameUsedCount
        p.payAssistUsedThisTurn = []
        p.noRestWhenBlockingUsedThisTurn = []
    }

    state.battle = null
    state.timedEffects = []
    state.endStepLocks = []
    delete state.turnEndActions
    state.endAttackStepAfterBattle = false
    delete state.endAttackStepLifeCheck
    for (const k of [
        "extraStepAfterAttackUsed", "extraMainStep", "secondMainStep", "skipMainStepNow", "oweSecondMain", "secondMainDone",
        "extraTurnStepsPending", "extraAttackStepPending", "lastAttackerCombinedPid", "prevAttackerCombinedPid",
        "magicIdsUsedThisTurn", "lifeLostThisTurn", "magicEffectsUsedByName", "ownSpiritDestroyedThisTurn",
        "ownSpiritDestroyedByBattleThisTurn", "spiritVanishedThisTurn", "oppSpiritRemovedByEffectThisTurn",
        "ownSpiritDestroyedByOwnEffectColors", "ownSpiritWithOnDestroyDestroyedByOwnEffect", "selfSummonCostUsedNames",
        "millCountThisTurnBrave", "activatedUsedBattle", "declaredBursts", "pendingBurstDestroyQueue",
        "pendingBraveKeeps", "pendingCoreDestinations", "pendingReviveConfirms", "pendingReviveDestinations",
        "destroyGroup", "summonBatch", "summonEffectSources", "lastDestroyedNexus",
    ] as const) delete (state as unknown as Record<string, unknown>)[k]
    state.attacksThisTurn = 0
    state.blocksThisTurn = 0
    state.magicUsedThisTurn = { p1: 0, p2: 0 }
    state.millCountThisTurn = { p1: 0, p2: 0 }
    state.coreGainCountThisTurn = { p1: 0, p2: 0 }
    state.millCountThisTurnMutual = { p1: 0, p2: 0 }
    state.drawStepSkipped = false
    state.coreStepSkipped = false
    state.resumeStack = []
    state.resumeInsertAt = 0

    const first: PlayerId = Math.random() < 0.5 ? "p1" : "p2"
    state.turn = 1
    state.turnPlayer = first
    state.priorityPlayer = first
    state.isFlashTiming = false
    state.flashCount = 0
    log(state, `${state.players[first].name}が先攻になった。`)
    runTurnStart(state)
}
