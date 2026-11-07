// 戻すの問い合わせ：「手札に戻らない」を1か所に集める（EFFECT_GATE.md §4 の 5f）
//
// 「〜されない」は対象に取られることを防がない（10-30 の一般則）ので、戻す入口（markBounce）がここを聞く。
// 「手札に戻らない」はデッキへ戻すことを止めない（toDeck 付きの耐性だけデッキも止める）。誰の効果かは解決中の効果の記録（currentEffectSource）で見る
import { entryActive } from "../../../shared/rules/effectStop"
import { effectSources, hasBounceImmunity, hasGlobalConstraint } from "../../../shared/rules"
import { effectActiveAtLevel, instHasTriggerEffect } from "../../../shared/rules/level"
import { noteCoverage } from "../../../shared/coverage"
import { trashUnderCards } from "./zones/underCards"
import type { CardInstance, GameState, PlayerId } from "../type"
import { currentLevel, getCard, log } from "./GameState"

export type BounceTo = "hand" | "deckTop" | "deckBottom" | "burst"

export function bounceDenial(state: GameState, ownerPid: PlayerId, target: CardInstance, to: BounceTo): string | null {
    // noBounceByEffect（BS19-099）：効果による戻しは手札・デッキとも戻らない。原因を効果に限るので、
    // currentEffectSource が載っていない（＝効果の解決中でない）戻しは従来どおり通る
    if (to !== "burst" && state.currentEffectSource && hasGlobalConstraint(state, "noBounceByEffect", (e) =>
        e.constraint.type === "noBounceByEffect" && (e.constraint.filter !== "hasSummonTrigger" || instHasTriggerEffect(target, "onSummon")))) {
        return "効果では手札/デッキに戻らない"
    }
    if (to !== "hand" && to !== "deckTop" && to !== "deckBottom") return null
    if (to === "hand" && allSpiritsCantBounceActive(state)) return "スピリットは手札に戻らない"
    const src = state.currentEffectSource
    if (src && src.pid !== ownerPid && hasBounceImmunity(state, ownerPid, target, src.type, to === "hand" ? "hand" : "deck")) {
        return to === "hand" ? "相手の効果では手札に戻らない" : "相手の効果では手札/デッキに戻らない"
    }
    return null
}

// 金狐角。発生源の持ち主基準の phase/turn を見るので hasGlobalConstraint ではなく専用に走査する
export function allSpiritsCantBounceActive(state: GameState): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, pid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "allSpiritsCantBounce") continue
                if (!entryActive(state, pid, source, effect, level)) continue
                if (effect.phase !== undefined && state.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                return true
            }
        }
    }
    return false
}

// kind:"reviveOnDestroy".alsoOnReturn（BS19-X02）：相手の効果で手札・デッキに戻るときも、
// 破壊のときと同じコスト（cost.discardUnderOne のみ対応）で revived の状態で場に残る。
// optional（「〜できる」）の問い直しは出さず、コストを払えるなら自動で残る。
// 破壊側の reviveConfirm の確認経路は断ったとき破壊し直す造りなので戻しには流用できない（簡略化）
export function reviveOnReturnStay(state: GameState, ownerPid: PlayerId, target: CardInstance): boolean {
    const level = currentLevel(target).level
    for (const effect of getCard(target.cardId).effects) {
        if (effect.kind !== "reviveOnDestroy" || effect.alsoOnReturn !== true || effect.scope !== "self") continue
        if (!effectActiveAtLevel(effect.levels, level)) continue
        if (effect.cost?.discardUnderOne !== true) continue
        if ((target.underCards?.length ?? 0) < 1) continue
        noteCoverage(effect, "reviveOnDestroy")
        trashUnderCards(state, ownerPid, target, 1)
        if ("rested" in effect.revived) target.isRested = effect.revived.rested
        const stayed = "rested" in effect.revived ? (effect.revived.rested ? "疲労" : "回復") + "状態でフィールドに残った" : "フィールドに残った"
        log(state, `${state.players[ownerPid].name}の${getCard(target.cardId).name}は、手札/デッキに戻る代わりに${stayed}。`)
        return true
    }
    return false
}
