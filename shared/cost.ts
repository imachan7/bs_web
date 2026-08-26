// サーバー／クライアント共有のコスト計算層。
// 軽減シンボル・コスト修正・マジック使用制約・無償化の判定を一本化する。
// クライアントは「軽減後のコスト表示」と「使用可能ハイライト」にこれを使うため、
// サーバーと実装がズレると『使えるのに使えないように見える』表示バグになる（旧 renderer のミラーで実在した）。
import type { CardData, Color, PlayerId } from "../server/src/type"
import type { Board } from "./board"
import { card } from "./cardDb"
import { cardHasColor, countSymbols, currentLevel, effectActiveAtLevel, effectSources, hasKeyword, instHasColor, isVirtualSource, matchesCostFilter, matchesFamilyFilter, noReductionBySummonCost, spiritHasKeyword, instIsCombined, isVanillaCard } from "./rules"

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
                // mode:"set"（コスト置換。BS05パントマイスター／ゴッドスピード）はcostSetOverride側が
                // 別途処理するため、加算合計のこちらでは読み飛ばす（二重適用を防ぐ）
                if (effect.mode === "set") continue
                if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
                if (effect.colorFilter !== undefined && !cardHasColor(cardData, effect.colorFilter)) continue
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
    // effectSources：このターンだけの仮想発生源（マジックが lendSelfThisTurn で貸した継続効果）も含める
    // （BS07リボーンフレイム。従来は field だけを見ており、貸与された reductionGrant が無言で効かなかった）
    const sources = effectSources(board, pid)
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "reductionGrant") continue
            // lentOnly：仮想発生源からのみ有効（実在スピリットが同じエントリを持っても恒久化させない）
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.cardType !== undefined && cardData.type !== effect.cardType) continue
            if (effect.cardColor !== undefined && !cardHasColor(cardData, effect.cardColor)) continue
            if (effect.keywordFilter !== undefined && !hasKeyword(cardData.cardId, effect.keywordFilter)) continue
            // vanillaFilter（BS10-080炎の結晶石：効果の記述を持たないスピリットカードのみ）
            if (effect.vanillaFilter === true && !isVanillaCard(cardData)) continue
            // phase指定時はこのステップ中のみ有効（ターンプレイヤー不問＝『お互いの〜ステップ』。BS06賢獣アイベリックス）
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
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
                    const total = board.players[pid].field.spirits.filter((s) =>
                        instHasColor(s, color),
                    ).length
                    if (total < count) continue
                } else {
                    const { color, count } = effect.condition.ownColorTotalAtLeast
                    const total = sources.filter((s) => instHasColor(s, color)).length
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
    restriction:
        | "oncePerTurnAll"
        | "noReductionOpponent"
        | "colorLockOpponent"
        | "trashColorLockOpponent"
        | "noFreeCastOpponent"
        | "reserveOnlyOpponent"
        | "noFlashAll"
        | "noFlashOpponent",
): boolean {
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        // noFlashAll（BS06軍師ショウジョウジ）はoncePerTurnAllと同じく「お互い」に効くため、
        // usingPid===ownerPidでもスキップしない
        if (restriction !== "oncePerTurnAll" && restriction !== "noFlashAll" && usingPid === ownerPid) continue
        const sources = [...board.players[ownerPid].field.spirits, ...board.players[ownerPid].field.nexuses]
        for (const source of sources) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "magicRestriction") continue
                if (effect.restriction !== restriction) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
                return true
            }
        }
    }
    return false
}

// コスト上限によるマジック使用制約（restriction:"costLimitAll"）の判定。
// hasMagicRestriction と分けているのは、こちらだけ「使おうとしているカードのコスト」を要るため。
// 「お互い」に効くので usingPid と発生源の持ち主の一致チェックはしない（oncePerTurnAll と同じ）。
// コストは**カード記載のコスト（軽減前）**で比べる（BS05青嵐の虚空Lv2＝コスト4以下）。
// requireOwnKeyword 指定時は、発生源の持ち主のフィールドにそのキーワードを持つスピリットがいる間だけ有効
export function hasMagicCostLock(board: Board, cardData: CardData): boolean {
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        const sources = [...board.players[ownerPid].field.spirits, ...board.players[ownerPid].field.nexuses]
        for (const source of sources) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "magicRestriction") continue
                if (effect.restriction !== "costLimitAll") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
                if (effect.maxCost === undefined || cardData.cost > effect.maxCost) continue
                if (
                    effect.requireOwnKeyword !== undefined &&
                    !board.players[ownerPid].field.spirits.some((s) =>
                        spiritHasKeyword(board, ownerPid, s, effect.requireOwnKeyword!),
                    )
                ) {
                    continue
                }
                return true
            }
        }
    }
    return false
}

// 栄光の表彰台Lv1（kind:"nexusCostMillPay"）：ネクサスの配置コストを
// 「コスト1につきデッキを上から1枚破棄」で支払える発生源が場にあるか。
// **デッキの残り枚数による上限は呼び出し側でかける**（Board にデッキ枚数が無いため。
// サーバーは player.deck.length、クライアントは view の deckCount を使う）
export function canPayNexusCostByMill(board: Board, pid: PlayerId): boolean {
    for (const source of effectSources(board, pid)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "nexusCostMillPay") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
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

// BS08ビクティム（kind:"summonCostHandDiscardPay"）：スピリットの召喚コストを
// 「コスト1につき手札1枚を破棄」で支払える発生源（＝このターン自分を貸したマジック）があるか。
// **手札の残り枚数による上限は呼び出し側でかける**（canPayNexusCostByMill と同じ理由。
// サーバーは player.hand.length、クライアントは view の handCount を使う。
// どちらも「召喚するカード自身」は破棄に使えないので1枚引くこと）
export function canPaySummonCostByHandDiscard(board: Board, pid: PlayerId): boolean {
    for (const source of effectSources(board, pid)) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "summonCostHandDiscardPay") continue
            return true
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
    return findMagicFreeGrantSource(board, pid, cardData, requireTegamotoScope) !== null
}

// hasMagicFreeGrant の実体。無償化を成立させている**発生源のinstanceId**を返す（無ければ null）。
// oncePerBattle の消費を記録する側（EffectModules.consumeOncePerBattleMagicFree）が、
// 同じ絞り込みを二重に書かずに済むよう分けてある
export function findMagicFreeGrantSource(
    board: Board,
    pid: PlayerId,
    cardData: CardData,
    requireTegamotoScope = false,
): string | null {
    const sources = [...board.players[pid].field.spirits, ...board.players[pid].field.nexuses]
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "magicFreeGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // oncePerBattle（BS07大天使イスフィール）：このバトルで既に1枚使っていれば、もう無償にしない
            if (effect.oncePerBattle && board.battle?.oncePerBattleMagicFreeUsed?.includes(source.instanceId)) {
                continue
            }
            const isAllScope = effect.scope === "allMagicHandAndTegamoto"
            if (requireTegamotoScope) {
                if (!isAllScope) continue
            } else if (!isAllScope) {
                if (effect.colorFilter === undefined || !cardHasColor(cardData, effect.colorFilter)) continue
            }
            if (effect.phaseTurn) {
                if (board.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && pid !== board.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && pid === board.turnPlayer) continue
            }
            // 『このスピリットのバトル時』（BS07大天使イスフィール）：発生源自身がバトルの当事者のときだけ
            if (effect.condition === "selfInBattle" && !isSelfInBattle(board, source.instanceId)) continue
            return source.instanceId
        }
    }
    return null
}

// 発生源自身が現在のバトルの当事者（アタッカー/ブロッカー）か。
// magicFreeGrant / magicRepeatGrant の condition:"selfInBattle" が共用する
export function isSelfInBattle(board: Board, instanceId: string): boolean {
    if (!board.battle) return false
    return (
        board.battle.attackerInstanceId === instanceId ||
        board.battle.blockerInstanceId === instanceId
    )
}
// pidのフィールド（スピリット＋ネクサス）が持つシンボルの色集合（力奪う凱旋門のcolorLockOpponent判定用。
// 軽減シンボルと同じシンボル集計対象を色の集合として求める）
export function ownFieldSymbolColors(board: Board, pid: PlayerId): Set<Color> {
    const colors = new Set<Color>()
    const all = [...board.players[pid].field.spirits, ...board.players[pid].field.nexuses]
    for (const inst of all) {
        // countSymbols と同じ規則で数える（2026-08-20 に揃えた）:
        // バウンス待機中は数えない／symbolFix で固定されたシンボルを優先する／
        // 「◯色としても扱う」で得た色は、そのシンボルの色としても数える（元の色も残る）
        if (inst.pendingBounce) continue
        const symbols = inst.symbolsOverrideContinuous ?? card(inst.cardId).symbol
        if (symbols.length === 0) continue
        for (const sym of symbols) colors.add(sym)
        for (const c of inst.tempColors) colors.add(c)
        for (const c of inst.colorsAsContinuous ?? []) colors.add(c)
    }
    return colors
}
// コスト置換（kind:"costMod"のmode:"set"）を求める。pid自身のeffectSources（フィールド＋
// このターンの仮想発生源。lendSelfThisTurnでマジックが貸与するBS05ゴッドスピードに対応）を走査し、
// レベル有効・familyFilter/keywordFilter/costFilter一致の値を返す（複数重なる状況は現状無いが、
// 決定的にするため最小値を採用する）。該当なしはundefined
export function costSetOverride(
    board: Board,
    pid: PlayerId,
    cardData: CardData,
): number | undefined {
    let result: number | undefined
    const sources = effectSources(board, pid)
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "costMod" || effect.mode !== "set") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.familyFilter !== undefined) {
                const wanted = Array.isArray(effect.familyFilter) ? effect.familyFilter : [effect.familyFilter]
                if (!wanted.some((f) => cardData.family.includes(f))) continue
            }
            if (effect.keywordFilter !== undefined && !hasKeyword(cardData.cardId, effect.keywordFilter)) continue
            if (effect.costFilter !== undefined && !matchesCostFilter(cardData.cost, effect.costFilter)) continue
            // BS07女帝ペンプレスLv2-3：手札のカード名に「ペンタン」を含むスピリットカードのみ
            if (effect.nameContains !== undefined && !cardData.name.includes(effect.nameContains)) continue
            if (effect.cardTypeFilter !== undefined && cardData.type !== effect.cardTypeFilter) continue
            // setToCounter（BS09-067ビッグバンエナジー＝「コストを自分のライフと同じ数にする」）：
            // 固定値でなく、その時点の値を置換後のコストにする
            const setTo =
                effect.setToCounter === "ownLife" ? board.players[pid].life : effect.setTo
            // 複数の置換が同時に効く場合は最も小さい値を採る（決定的にするため。現状そのカードは無い）
            if (result === undefined || setTo < result) result = setTo
        }
    }
    return result
}

// 軽減後の実コスト（フィールドの一致シンボル数だけ軽減、軽減シンボル数が上限）に
// costMod（例: ルビーの太陽の白カード+1コスト）を加算した実コスト。
// reductionGrant（ペンタン／天使バーチュ）で付与された軽減シンボルは cardData.reduction に連結してから計算する。
// noReductionOpponent（イワトビペンタン）が有効なマジックは軽減シンボルによる軽減自体ができない
export function effectiveCost(
    board: Board,
    pid: PlayerId,
    cardData: CardData,
    ignoreFreeGrant = false,
): number {
    // マジック無償化（薔薇人バロッサ）：相手フィールドに noFreeCastOpponent（力奪う凱旋門Lv2）が
    // なければコスト0（costModも無視。他の軽減とは独立した完全無償化）。
    // ignoreFreeGrant は「無償で使えるが**あえてコストを払う**」を選んだとき（2026-08-15 ユーザー確認）。
    // 無償化の枠が1枚きりのカード（大天使イスフィール）で枠を温存する余地があるため、使用時に選ばせる
    if (
        !ignoreFreeGrant &&
        cardData.type === "magic" &&
        hasMagicFreeGrant(board, pid, cardData) &&
        !hasMagicRestriction(board, pid, "noFreeCastOpponent")
    ) {
        return 0
    }
    // コスト置換（BS05パントマイスター／ゴッドスピード）：適用順は「置換 → costMod加算」で固定する
    // （costSetとcostModが同時に効く場合、発生源の走査順に依存しない決定的な結果にするため）。
    // 置換値は軽減後の値ではなく置換後の値をそのまま使う（原文「コストを◯にする」の忠実化）ので、
    // 軽減シンボル（reductionGrant含む）はここでは一切適用しない
    const setOverride = costSetOverride(board, pid, cardData)
    let base: number
    if (setOverride !== undefined) {
        base = setOverride
    } else {
        const reductionColors = [...cardData.reduction, ...reductionGrantSymbols(board, pid, cardData)]
        const reductionBlocked = cardData.type === "magic" && hasMagicRestriction(board, pid, "noReductionOpponent")
        // 軽減シンボルは**色ごとに**、その色のフィールドシンボル数までしか適用されない。
        // 全体を1つの集合として数えると、混色の軽減（BS05-X19 聖皇ジークフリーデン＝赤3白3）で
        // 赤シンボルだけを大量に並べたときに白の軽減まで払えてしまい、過剰に軽減される
        // （コスト9が3になる。正しくは6）。単色カードは軽減シンボルが1色なので結果は従来と同じ
        // noReductionBySummonCost（BS08超時空重力炉）：コストがmaxCost以下のスピリットカードを
        // 召喚するとき、軽減シンボルによる軽減が一切できなくなる（**カード静的なコスト**で判定）
        const reductionBlockedBySummonCost =
            cardData.type === "spirit" && noReductionBySummonCost(board, cardData.cost)
        let reduction = 0
        if (!reductionBlocked && !reductionBlockedBySummonCost) {
            for (const color of new Set(reductionColors)) {
                const need = reductionColors.filter((c) => c === color).length
                const have = countSymbols(board.players[pid], [color])
                reduction += Math.min(need, have)
            }
        }
        base = Math.max(cardData.cost - reduction, 0)
    }
    // SD02-013 転召の祭壇Lv1-2：相手フィールドの発生源が、条件を満たすスピリットカードの召喚に
    // 追加コストを課す（「1コスト余分に支払わなければならない」）。軽減の後に足す
    return Math.max(
        base +
            costModTotal(board, pid, cardData) +
            opponentSummonCostIncrease(board, pid, cardData) +
            opponentMagicCostIncrease(board, pid, cardData),
        0,
    )
}

// globalConstraint "opponentMagicCostIncrease"：発生源の持ち主の**相手**が、マジックの効果を
// 使用するときに増える追加コストの合計（BS10-077 ギョクリューン＝2コスト）。
// opponentSummonCostIncrease のマジック版で、絞り込み条件は持たない
function opponentMagicCostIncrease(board: Board, usingPid: PlayerId, cardData: CardData): number {
    if (cardData.type !== "magic") return 0
    let total = 0
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        if (ownerPid === usingPid) continue
        for (const source of effectSources(board, ownerPid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "opponentMagicCostIncrease") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.whileCombined === true && !instIsCombined(source)) continue
                total += effect.constraint.amount
            }
        }
    }
    return total
}

// globalConstraint "opponentSummonCostIncrease"：発生源の持ち主の**相手**が、条件を満たす
// スピリットカードを召喚するときに増える追加コストの合計（SD02-013 転召の祭壇Lv1-2）。
// 条件は**カード静的な**コストとキーワードで見る（場に出る前の判定のため）
function opponentSummonCostIncrease(board: Board, usingPid: PlayerId, cardData: CardData): number {
    if (cardData.type !== "spirit") return 0
    let total = 0
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        if (ownerPid === usingPid) continue
        for (const source of effectSources(board, ownerPid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "opponentSummonCostIncrease") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                const { amount, maxCost, keywordExclude } = effect.constraint
                if (maxCost !== undefined && cardData.cost > maxCost) continue
                if (keywordExclude !== undefined && hasKeyword(cardData.cardId, keywordExclude)) continue
                total += amount
            }
        }
    }
    return total
}
