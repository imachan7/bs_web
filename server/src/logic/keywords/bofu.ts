import type { CardInstance, GameState, PlayerId } from "../../type"
import { currentLevel, getCard } from "../GameState"
import { effectActiveAtLevel, effectSources, isVirtualSource, bravesOf } from "../../../../shared/rules"

// 持ち主フィールドの bofuCountBonus（BS08ゲラン准将Lv2）合計：【暴風】の指定数に加算する。
// funsaiBonusTotal と同じ考え方（effectSources経由でlendSelfThisTurnによる貸与にも対応）
export function bofuCountBonusFor(state: GameState, ownerPid: PlayerId): number {
    let total = 0
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "bofuCountBonus") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            total += effect.amount
        }
    }
    return total
}

// このスピリットが持つ【暴風】の実効指定数（静的keywordのcount + bofuCountBonus合計）。
// 暴風を持たない（base=0）スピリットにはボーナスを加算しない。GameEngine.resolveBattleの
// hasBofuOnBlock分岐と、action:"bpBuffAllByBofuCount"の両方から参照する（BS08ゲラン准将／スナイピングブラスト）
// 【暴風】はホスト自身だけでなく、合体しているブレイヴの keyword エントリも見る
// （BS10千刀鳥カクレイン：ホストのカードには【暴風】が無く、ブレイヴ側にのみ書かれている）
export function bofuCountFor(state: GameState, ownerPid: PlayerId, inst: CardInstance): number {
    let base = 0
    for (const src of [inst, ...bravesOf(state.players[ownerPid], inst)]) {
        const level = currentLevel(src).level
        for (const effect of getCard(src.cardId).effects) {
            if (effect.kind !== "keyword" || effect.keyword !== "bofu") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            base = effect.count ?? 1
            break
        }
    }
    if (base === 0) return 0
    return base + bofuCountBonusFor(state, ownerPid)
}

// 持ち主のフィールドに bofuOnBlock（BS07大風車の丘Lv2）が有効な発生源があるか。
// hasKyoshuOnBlock と同型で、こちらは phase に加えて turn 条件も持つ
export function hasBofuOnBlock(state: GameState, ownerPid: PlayerId): boolean {
    const player = state.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "bofuOnBlock") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
            return true
        }
    }
    return false
}

// 持ち主のフィールドに bofuChooserSelf（BS07ワールウィンド）が有効な発生源があるか。
// あるとき、【暴風】の疲労対象は「疲労させられる側」ではなく持ち主自身が選ぶ
export function hasBofuChooserSelf(state: GameState, ownerPid: PlayerId): boolean {
    for (const source of effectSources(state, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "bofuChooserSelf") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // phase（BS09-060緑翼の大樹Lv2＝『お互いのアタックステップ』）。
            // データには書いてあったのに型と実装が読んでおらず、メインステップでも効いていた（2026-08-24 修正）
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            return true
        }
    }
    return false
}
