import type { CardInstance, GameState, Keyword, PlayerId } from "../../type"
import { currentLevel, getCard, log } from "../GameState"
import { notifyHandGained } from "../triggers"
import { effectActiveAtLevel, effectSources, hasContinuousKeywordGrant, timedKeywords } from "../../../../shared/rules"

// 静的キーワード（レベル判定つき）‖ 一時付与 ‖ 継続付与のいずれかで keyword を持つか。
// spiritHasKeyword（shared/rules.ts）と違い静的判定に**レベルを課す**（kobo/makoboの実装から移設。
// 【光芒】【魔光芒】はレベル帯ごとに別エントリで宣言されることがあるため）
export function hasKeywordAtLevel(state: GameState, pid: PlayerId, inst: CardInstance, keyword: Keyword): boolean {
    const level = currentLevel(inst).level
    const hasStatic = getCard(inst.cardId).effects.some(
        (e) => e.kind === "keyword" && e.keyword === keyword && effectActiveAtLevel(e.levels, level),
    )
    return (
        hasStatic ||
        timedKeywords(state, inst).some((k) => k.keyword === keyword) ||
        hasContinuousKeywordGrant(state, pid, inst, keyword)
    )
}

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
    // 【魔光芒】は【光芒】の回収部分を内包する（合成先。両方持つ個体は魔光芒の名でログする）
    const hasMakobo = hasKeywordAtLevel(state, attackerPid, attacker, "makobo")
    const hasKobo = hasMakobo || hasKeywordAtLevel(state, attackerPid, attacker, "kobo")
    if (!hasKobo) return
    const keywordLabel = hasMakobo ? "魔光芒" : "光芒"
    const player = state.players[attackerPid]
    let recovered = 0
    for (const cardId of usedMagicCardIds) {
        const idx = player.trashCards.lastIndexOf(cardId)
        if (idx === -1) continue
        player.trashCards.splice(idx, 1)
        player.hand.push(cardId)
        recovered++
        log(state, `【${keywordLabel}】${player.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
    }
    notifyHandGained(state, attackerPid, recovered)
}
