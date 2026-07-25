// サーバー／クライアント共有のコスト計算層。
// 軽減シンボル・コスト修正・マジック使用制約・無償化の判定を一本化する。
// クライアントは「軽減後のコスト表示」と「使用可能ハイライト」にこれを使うため、
// サーバーと実装がズレると『使えるのに使えないように見える』表示バグになる（旧 renderer のミラーで実在した）。
import type { CardData, Color, PlayerId } from "../server/src/type"
import type { Board } from "./board"
import { card } from "./cardDb"
import { countSymbols, currentLevel, effectActiveAtLevel, hasKeyword, matchesFamilyFilter } from "./rules"

// コスト修正（kind: "costMod"）の合計を求める。両プレイヤーのフィールド（スピリット＋ネクサス）を
// 走査し、レベル有効な costMod のうち条件（colorFilter・cardType・side・phaseTurn。すべて省略時は
// 常に一致）に合うものの amount を合計する。usingPid は実際にそのカードを使おうとしているプレイヤー
// （side:"opponent" の判定・validateSummon等の呼び出し元から渡る）
// （ルビーの太陽：「すべての白のカードは使用時+1コスト」＝発生源・対象カードの持ち主を問わず両陣営に効く。
//   螺旋の塔：「自分のアタックステップ中、相手のマジックは+1コスト」＝side:"opponent"＋phaseTurn）
export function costModTotal(board: Board, usingPid: PlayerId, cardData: CardData): number {
    let total = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = board.players[pid]
        const sources = [...player.field.spirits, ...player.field.nexuses]
        for (const source of sources) {
            const sourceLevel = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "costMod") continue
                if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
                if (effect.colorFilter !== undefined && cardData.color !== effect.colorFilter) continue
                if (effect.cardType !== undefined && cardData.type !== effect.cardType) continue
                // side:"opponent"：発生源の持ち主（pid）から見て相手（usingPid !== pid）のカードのみ
                if (effect.side === "opponent" && usingPid === pid) continue
                if (effect.phaseTurn) {
                    if (board.phase !== effect.phaseTurn.phase) continue
                    if (effect.phaseTurn.turn === "own" && pid !== board.turnPlayer) continue
                    if (effect.phaseTurn.turn === "opponent" && pid === board.turnPlayer) continue
                }
                if (effect.condition) {
                    // 魔力満ちる泉：発生源の持ち主のフィールドに指定系統のスピリットがcount体以上のときのみ
                    const { family, count } = effect.condition.ownFamilyCountAtLeast
                    const owned = board.players[pid].field.spirits.filter((s) =>
                        matchesFamilyFilter(board, pid, s, family),
                    ).length
                    if (owned < count) continue
                }
                total += effect.amount
            }
        }
    }
    return total
}
// 軽減シンボル付与（kind: "reductionGrant"）で追加される軽減シンボルを求める。
// pid 自身のフィールド（スピリット＋ネクサス）発生源のうち、レベル有効・カード種別/色一致・
// 条件成立（ownColorTotalAtLeast：自分のスピリット+ネクサス合計）のものを集める
// （ペンタン：黄のマジック軽減、天使バーチュ：手札の黄スピリット軽減）
export function reductionGrantSymbols(board: Board, pid: PlayerId, cardData: CardData): Color[] {
    const extra: Color[] = []
    const sources = [...board.players[pid].field.spirits, ...board.players[pid].field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "reductionGrant") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.cardType !== undefined && cardData.type !== effect.cardType) continue
            if (effect.cardColor !== undefined && cardData.color !== effect.cardColor) continue
            if (effect.keywordFilter !== undefined && !hasKeyword(cardData.cardId, effect.keywordFilter)) continue
            // familyFilter は対象が手札のカードのため、カード静的な family のみで判定する（配列＝OR）
            if (effect.familyFilter !== undefined) {
                const families = Array.isArray(effect.familyFilter)
                    ? effect.familyFilter
                    : [effect.familyFilter]
                if (!families.some((f) => cardData.family.includes(f))) continue
            }
            if (effect.condition) {
                if ("ownColorSpiritsAtLeast" in effect.condition) {
                    // ティ・ターニャ：ネクサスを数えず、指定色のスピリット数のみで判定
                    const { color, count } = effect.condition.ownColorSpiritsAtLeast
                    const total = board.players[pid].field.spirits.filter(
                        (s) => card(s.cardId).color === color,
                    ).length
                    if (total < count) continue
                } else {
                    const { color, count } = effect.condition.ownColorTotalAtLeast
                    const total = sources.filter((s) => card(s.cardId).color === color).length
                    if (total < count) continue
                }
            }
            extra.push(...effect.symbols)
        }
    }
    return extra
}
// マジック使用制約（kind: "magicRestriction"）の判定。両陣営のフィールドを走査し、
// レベル有効・restriction一致・turn条件成立の発生源があるか調べる。
// oncePerTurnAll は持ち主を問わず両陣営に効くため usingPid との一致チェックをしない。
// noReductionOpponent / colorLockOpponent は「発生源の持ち主の相手」にのみ効くため、
// 発生源の持ち主自身が使用者（usingPid === ownerPid）のときは対象外とする
// （イワトビペンタン／作戦参謀フォクシン／力奪う凱旋門）
export function hasMagicRestriction(
    board: Board,
    usingPid: PlayerId,
    restriction: "oncePerTurnAll" | "noReductionOpponent" | "colorLockOpponent" | "noFreeCastOpponent",
): boolean {
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        if (restriction !== "oncePerTurnAll" && usingPid === ownerPid) continue
        const sources = [...board.players[ownerPid].field.spirits, ...board.players[ownerPid].field.nexuses]
        for (const source of sources) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "magicRestriction") continue
                if (effect.restriction !== restriction) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
                return true
            }
        }
    }
    return false
}
// マジック無償化（kind: "magicFreeGrant"）の判定。使用者pid自身のフィールドに、
// レベル有効・色一致（またはscope一致）・phaseTurn一致の発生源があるかを調べる
// （薔薇人バロッサ：自分のアタックステップに自分の黄マジックカードを無償化）。
// requireTegamotoScope=true のときは、手元(tegamoto)のカードを無償使用しようとしている呼び出しのため、
// colorFilter指定の色限定バリアントは対象外とし、scope:"allMagicHandAndTegamoto"の発生源のみ有効とする
// （大天使ミカファールLv2）。requireTegamotoScope=false（手札からの通常使用）は、色限定バリアントの
// 色一致 or scope指定バリアント（色不問）のどちらでも成立する
export function hasMagicFreeGrant(
    board: Board,
    pid: PlayerId,
    cardData: CardData,
    requireTegamotoScope = false,
): boolean {
    const sources = [...board.players[pid].field.spirits, ...board.players[pid].field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "magicFreeGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            const isAllScope = effect.scope === "allMagicHandAndTegamoto"
            if (requireTegamotoScope) {
                if (!isAllScope) continue
            } else if (!isAllScope) {
                if (effect.colorFilter !== cardData.color) continue
            }
            if (effect.phaseTurn) {
                if (board.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && pid !== board.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && pid === board.turnPlayer) continue
            }
            return true
        }
    }
    return false
}
// pidのフィールド（スピリット＋ネクサス）が持つシンボルの色集合（力奪う凱旋門のcolorLockOpponent判定用。
// 軽減シンボルと同じシンボル集計対象を色の集合として求める）
export function ownFieldSymbolColors(board: Board, pid: PlayerId): Set<Color> {
    const colors = new Set<Color>()
    const all = [...board.players[pid].field.spirits, ...board.players[pid].field.nexuses]
    for (const inst of all) {
        for (const sym of card(inst.cardId).symbol) colors.add(sym)
    }
    return colors
}
// 軽減後の実コスト（フィールドの一致シンボル数だけ軽減、軽減シンボル数が上限）に
// costMod（例: ルビーの太陽の白カード+1コスト）を加算した実コスト。
// reductionGrant（ペンタン／天使バーチュ）で付与された軽減シンボルは cardData.reduction に連結してから計算する。
// noReductionOpponent（イワトビペンタン）が有効なマジックは軽減シンボルによる軽減自体ができない
export function effectiveCost(
    board: Board,
    pid: PlayerId,
    cardData: CardData,
): number {
    // マジック無償化（薔薇人バロッサ）：相手フィールドに noFreeCastOpponent（力奪う凱旋門Lv2）が
    // なければコスト0（costModも無視。他の軽減とは独立した完全無償化）
    if (
        cardData.type === "magic" &&
        hasMagicFreeGrant(board, pid, cardData) &&
        !hasMagicRestriction(board, pid, "noFreeCastOpponent")
    ) {
        return 0
    }
    const reductionColors = [...cardData.reduction, ...reductionGrantSymbols(board, pid, cardData)]
    const reductionBlocked = cardData.type === "magic" && hasMagicRestriction(board, pid, "noReductionOpponent")
    const symbols = reductionBlocked ? 0 : countSymbols(board.players[pid], reductionColors)
    const reduction = reductionBlocked ? 0 : Math.min(reductionColors.length, symbols)
    const base = Math.max(cardData.cost - reduction, 0)
    return base + costModTotal(board, pid, cardData)
}
