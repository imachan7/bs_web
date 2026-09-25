import type { CardInstance, GameState, PlayerId } from "../../type"
import { currentLevel, getCard, log } from "../GameState"
import { notifyHandGained } from "../triggers"
import { effectActiveAtLevel, effectSources, hasContinuousKeywordGrant, timedKeywords } from "../../../../shared/rules"

// 士気高き大本営の光芒版（BS03星降る巡礼地Lv2）：持ち主のスピリットの【光芒】を
// 『このスピリットのブロック時』にも発揮させる発生源が、持ち主のフィールドにあるか。
// 「**にも**」なのでアタック時の発揮はそのまま残る（移し替えではない）
export function hasKoboOnBlock(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "koboOnBlock") continue
            if (effectActiveAtLevel(effect.levels, level)) return true
        }
    }
    return false
}

// 【光芒】: バトル終了時、アタッカーがレベル有効で光芒を持つなら、
// このバトル中にアタッカー側が使用したマジックカードをトラッシュから手札へ戻す。
// state.battle が null になる前（clearBattle 直前）に、各呼び出し元から呼ぶ。
// attacker はローカル参照を渡す（BP比較でフィールドから除去済みでも cardId/cores は読み取れる。呪撃と同じ考え方）
export function resolveKoboOnBattleEnd(
    state: GameState,
    attackerPid: PlayerId,
    attacker: CardInstance | undefined,
): void {
    if (!state.battle || !attacker) return
    const usedMagicCardIds = state.battle.usedMagicCardIds?.[attackerPid]
    if (!usedMagicCardIds || usedMagicCardIds.length === 0) return
    const attackerLevel = currentLevel(attacker).level
    // 静的キーワードはレベル判定つきで判定する（spiritHasKeywordの静的分岐＝hasKeywordはレベルを見ないため、
    // ここだけは従来通り自前でレベルを確認する）。期間つきの付与（グリームホープ）・
    // 継続付与（keywordGrant）はspiritHasKeywordの非静的判定と同じヘルパーを利用する（BS04エンジン拡張バッチ1）
    const hasStaticKobo = getCard(attacker.cardId).effects.some(
        (e) => e.kind === "keyword" && e.keyword === "kobo" && effectActiveAtLevel(e.levels, attackerLevel),
    )
    const hasKobo =
        hasStaticKobo ||
        timedKeywords(state, attacker).some((k) => k.keyword === "kobo") ||
        hasContinuousKeywordGrant(state, attackerPid, attacker, "kobo")
    if (!hasKobo) return
    const player = state.players[attackerPid]
    let recovered = 0
    for (const cardId of usedMagicCardIds) {
        const idx = player.trashCards.lastIndexOf(cardId)
        if (idx === -1) continue
        player.trashCards.splice(idx, 1)
        player.hand.push(cardId)
        recovered++
        log(state, `【光芒】${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
    }
    notifyHandGained(state, attackerPid, recovered)
}
