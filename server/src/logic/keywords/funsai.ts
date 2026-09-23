import type { CardInstance, GameState, PlayerId } from "../../type"
import { currentLevel, getCard, opponentOf } from "../GameState"
import { fireFieldEventTriggers } from "../triggers"
import { countSymbols, effectActiveAtLevel, effectSources, isVirtualSource, spiritHasKeyword } from "../../../../shared/rules"
import { millDeck } from "../zones/mill"

// 持ち主フィールドの funsaiBonus（崩壊する戦線／デモリッシュ）合計：【粉砕】の破棄枚数に加算する。
// effectSources() でこのターンだけの仮想発生源（マジックが貸した継続効果。lentOnly。BS06デモリッシュ）も含める
export function funsaiBonusTotal(state: GameState, ownerPid: PlayerId): number {
    let total = 0
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "funsaiBonus") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // BS15共通器：phaseTurn（発生源の持ち主基準のステップ・turn条件。BS15-071巨人の足跡湖）
            if (effect.phaseTurn) {
                const { phase, turn } = effect.phaseTurn
                if (state.phase !== phase) continue
                if (turn === "own" && ownerPid !== state.turnPlayer) continue
                if (turn === "opponent" && ownerPid === state.turnPlayer) continue
            }
            // amountPerSymbolColor（BS08神造巨兵オリハルコン・ゴレム）：固定amountの代わりに、
            // 持ち主のフィールドが持つ指定色のシンボル総数を動的に加算する
            // BS15共通器：amountPerBurstCount（BS15-071巨人の足跡湖）：自分と相手のバースト1つにつき+1
            total += effect.amountPerSymbolColor
                ? countSymbols(state.players[ownerPid], [effect.amountPerSymbolColor])
                : effect.amountPerBurstCount
                  ? (state.players[ownerPid].burstSet ? 1 : 0) + (state.players[opponentOf(ownerPid)].burstSet ? 1 : 0)
                  : (effect.amount ?? 0)
        }
    }
    return total
}

// 持ち主フィールドの millCapBonus（BS06マキシマムブレイク）合計：millPer.cap の上限値に加算する。
// funsaiBonusTotal と同じ考え方（effectSources経由でlendSelfThisTurnによる貸与にも対応）
export function millCapBonusFor(state: GameState, ownerPid: PlayerId): number {
    let total = 0
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "millCapBonus") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            total += effect.amount
        }
    }
    return total
}

// 持ち主フィールドに funsaiOnBlock（士気高き大本営）が有効な発生源があるか
export function hasFunsaiOnBlock(state: GameState, ownerPid: PlayerId): boolean {
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "funsaiOnBlock") continue
            if (effectActiveAtLevel(effect.levels, level)) return true
        }
    }
    return false
}

// 【粉砕】の解決：spirit が現在レベルで粉砕を持つなら、相手のデッキを
// （現在レベル + funsaiBonus合計）枚破棄する（アタック時／funsaiOnBlockによるブロック時の共通処理）。
// 実破棄枚数が1以上なら fieldEvent "ownFunsaiMilled" を発火する（repeatPerCount対応）。
// 破棄したカードの種別内訳は state.lastFunsai に記録する（巨人王ランドルフ／二刀流のアムブローズ／
// 伝説巨人ジュードの「【粉砕】で破棄した◯枚につき」系onAttack効果が参照する。doAttackがアタック
// 宣言のたびにクリアするため、粉砕を持たないスピリットのアタックでは前回の値を拾わない）
export function resolveFunsai(
    state: GameState,
    ownerPid: PlayerId,
    spirit: CardInstance,
): void {
    // spiritHasKeyword: 静的keyword ‖ 一時付与 ‖ 継続付与（keywordGrant。lendSelfThisTurnによる
    // 仮想発生源からの貸与も含む。BS05サーキュラーソー・アーム）。既存の静的カードは全レベルで
    // 【粉砕】を持つため、レベル不問のこの判定に切り替えても挙動は変わらない
    if (!spiritHasKeyword(state, ownerPid, spirit, "funsai")) return
    const level = currentLevel(spirit).level
    const bonus = funsaiBonusTotal(state, ownerPid)
    const opponentPid = opponentOf(ownerPid)
    const trashCards = state.players[opponentPid].trashCards
    const beforeLen = trashCards.length
    // 【粉砕】の発生源は常にスピリット（onMilledFromDeck の by:"opponentSpiritEffect" 判定に使う）。
    // funsai:true は **ここだけ**が立てる（BS08鳳翼の聖剣Lv2「【粉砕】以外の」の判定用。
    // action:"mill" は効果文で「デッキを破棄する」と書かれた通常の効果なので立てない）
    const actual = millDeck(state, opponentPid, level + bonus, ownerPid, { sourceType: "spirit", funsai: true })
    if (actual > 0) {
        const milledCardIds = trashCards.slice(beforeLen, beforeLen + actual)
        let spirits = 0
        let nexuses = 0
        let magics = 0
        let costAtLeast4 = 0
        for (const cardId of milledCardIds) {
            const card = getCard(cardId)
            if (card.type === "spirit") spirits++
            else if (card.type === "nexus") nexuses++
            else if (card.type === "magic") magics++
            // BS15共通器：BS15-053コジロンド・ゴレムLv2-3「コスト4以上のカードを破棄したとき」用
            if (card.cost >= 4) costAtLeast4++
        }
        state.lastFunsai = { total: actual, spirits, nexuses, magics, costAtLeast4 }
        fireFieldEventTriggers(state, ownerPid, "ownFunsaiMilled", undefined, undefined, undefined, actual)
    }
}
