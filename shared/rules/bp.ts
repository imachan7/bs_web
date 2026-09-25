// 常時BP修正（オーラ）と実効BP、数を数えるときの重み（shared/rules.ts から分割。判定の規約は shared/rules.ts 冒頭）

import type {
    AuraCondition,
    AuraCounter,
    AuraDef,
    CardInstance,
    CardType,
    PlayerId,
} from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { matchesFamilyFilter, spiritHasFamily, spiritHasKeyword, targetArmorColorCount } from "./keywordState"
import { braveBpBonus, currentLevel, effectActiveAtLevel, effectSources, instAllCosts, instFamilies, instHasColor, instHasCost, instIsCombined, instIsVanilla, isSpiritOnField, isVirtualSource, opponentFieldColorCount, ownFieldOnlyColor } from "./level"
import { handSizeOf, instanceSymbolCount } from "./symbols"
import { cardNameContains, instMatchesCostFilter, matchesTarget } from "./targetFilter"

// ---- 常時BP修正（オーラ）と実効BP ----

// オーラのカウンタを、発生源の持ち主（sourcePid）基準で数える。
// "targetArmorColors" のみ対象（targetInst）基準（発生源ではない）のため、呼び出し側から渡す
// ---- スピリットの「数を数える」ときの重み ----
//
// 「このスピリットは◯体分として数える」（BS05シーサーズLv2＝2体分／BS05スリーカード＝このターン3体分）を
// **すべての数え上げに一元的に効かせる**ための重み。通常のスピリットは 1 を返すので、
// 該当カードが場にない限り従来と完全に同じ結果になる。
//
// countingPid ＝ 数えている効果の持ち主。カードの効果文は「**自分の**スピリット/マジック/ネクサスの効果で
// 数えるとき」と限定しているため、数える側が重みの持ち主でなければ 1 のまま。
//
// countingSourceType ＝ 数えている効果の**発生源の種別**。シーサーズは「スピリット/マジックの効果」
// （＝ネクサス除外）、スリーカードは「スピリット/ネクサスの効果」（＝マジック除外）と限定しているため、
// 一致しなければ重みを載せない。**渡されなかったときは限定しない**（従来どおり効く側に倒す）：
// 数える経路は多く、渡し漏れが「効かない」に倒れると発見しづらいため
export function spiritCountWeight(
    board: Board,
    countingPid: PlayerId,
    ownerPid: PlayerId,
    inst: CardInstance,
    countingSourceType?: CardType,
): number {
    const typeAllowed = (allowed?: readonly CardType[]): boolean =>
        allowed === undefined || countingSourceType === undefined || allowed.includes(countingSourceType)
    let weight = 1
    // シーサーズLv2：持ち主自身の効果で数えるときだけ N 体分
    if (countingPid === ownerPid) {
        for (const effect of card(inst.cardId).effects) {
            if (effect.kind !== "countAsMultiple") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(inst).level)) continue
            if (!typeAllowed(effect.sourceTypes)) continue
            weight = Math.max(weight, effect.count)
        }
    }
    // スリーカード：このターンの間、印を付けた側の効果でだけ N 体分（相手のスピリットにも付けられる）
    if (
        inst.countAsThisTurn &&
        inst.countAsThisTurn.pid === countingPid &&
        typeAllowed(inst.countAsThisTurn.sourceTypes)
    ) {
        weight = Math.max(weight, inst.countAsThisTurn.count)
    }
    return weight
}

// ownerPid のフィールドで predicate に合うスピリットを、上記の重みつきで数える。
// **効果が「スピリットの数を数える」箇所はすべてこれを通すこと**（素の .filter().length を使わない）。
// ゲームのルールとしての数え上げ（フィールドに置けるスピリット数の上限など）は対象外なので従来どおり
export function countSpiritsWeighted(
    board: Board,
    countingPid: PlayerId,
    ownerPid: PlayerId,
    predicate: (inst: CardInstance) => boolean = () => true,
    countingSourceType?: CardType,
): number {
    let total = 0
    for (const s of board.players[ownerPid].field.spirits) {
        if (!predicate(s)) continue
        total += spiritCountWeight(board, countingPid, ownerPid, s, countingSourceType)
    }
    return total
}

export function countAuraCounter(
    board: Board,
    sourcePid: PlayerId,
    counter: AuraCounter,
    targetInst?: CardInstance,
    countingSourceType?: CardType, // 数えている効果の発生源の種別（spiritCountWeight の限定に使う）
): number {
    if (counter === "ownReserve") return board.players[sourcePid].reserve
    if (counter === "ownLife") return board.players[sourcePid].life
    if (counter === "ownHand") return handSizeOf(board.players[sourcePid])
    if (counter === "ownNexuses") return board.players[sourcePid].field.nexuses.length
    if (counter === "allNexuses") {
        return (
            board.players.p1.field.nexuses.length +
            board.players.p2.field.nexuses.length
        )
    }
    if (counter === "ownExhausted") {
        return countSpiritsWeighted(board, sourcePid, sourcePid, (s) => s.isRested, countingSourceType)
    }
    if (counter === "opponentSpirits") {
        const opp: PlayerId = sourcePid === "p1" ? "p2" : "p1"
        return countSpiritsWeighted(board, sourcePid, opp, () => true, countingSourceType)
    }
    if (counter === "opponentFieldColors") return opponentFieldColorCount(board, sourcePid)
    if (counter === "opponentFieldSpiritColors") return opponentFieldColorCount(board, sourcePid, true)
    if (counter === "exhaustedEnemies") {
        const opp: PlayerId = sourcePid === "p1" ? "p2" : "p1"
        return countSpiritsWeighted(board, sourcePid, opp, (s) => s.isRested, countingSourceType)
    }
    if (counter === "ownRestedNexuses") return board.players[sourcePid].field.nexuses.filter((n) => n.isRested).length
    if (counter === "targetSymbols") return targetInst ? instanceSymbolCount(targetInst) : 0
    // counted.ts の同名軸（対象を選んだ後に数える版）と同じく重み付けしない素の件数（サーバー側の既存実装に合わせる）
    if (counter === "targetSameFamilyOwn") {
        if (!targetInst) return 0
        const families = instFamilies(targetInst)
        return board.players[sourcePid].field.spirits.filter((s) => families.some((f) => spiritHasFamily(board, sourcePid, s, f))).length
    }
    if (counter === "targetArmorColors") {
        return targetInst ? targetArmorColorCount(board, targetInst) : 0
    }
    if (counter === "readyEnemies") {
        const opp: PlayerId = sourcePid === "p1" ? "p2" : "p1"
        return countSpiritsWeighted(board, sourcePid, opp, (s) => !s.isRested, countingSourceType)
    }
    if (counter === "opponentTrashCores") {
        const opp: PlayerId = sourcePid === "p1" ? "p2" : "p1"
        return board.players[opp].trashCores
    }
    if (counter === "ownBraveSpirits") {
        return board.players[sourcePid].field.spirits.filter((s) => card(s.cardId).type === "brave").length
    }
    // selfCores／battlingOpponent* は timedEffect の target:"self" 経由でのみ使うため、targetInst は常に発生源自身
    if (counter === "selfCores") return targetInst?.cores ?? 0
    if (counter === "battlingOpponentSymbols" || counter === "battlingOpponentCombinedSymbols") {
        if (!board.battle || !targetInst) return 0
        const opp: PlayerId = sourcePid === "p1" ? "p2" : "p1"
        const otherId =
            board.battle.attackerInstanceId === targetInst.instanceId
                ? board.battle.blockerInstanceId
                : board.battle.attackerInstanceId
        if (!otherId) return 0
        const otherInst = board.players[opp].field.spirits.find((s) => s.instanceId === otherId)
        if (!otherInst) return 0
        if (counter === "battlingOpponentCombinedSymbols" && !instIsCombined(otherInst)) return 0
        return instanceSymbolCount(otherInst)
    }
    // **対象自身**の軽減シンボル数（カード静的な reduction の個数。SD01-038 エメラルドブースト）。
    // targetArmorColors と同じく発生源ではなく対象基準
    if (counter === "targetReductionSymbols") {
        return targetInst ? card(targetInst.cardId).reduction.length : 0
    }
    // { ownNameIncludes: string }：発生源自身を含む自分フィールドで、カード名に指定文字列を含むスピリット数
    if ("ownNameIncludes" in counter) {
        return countSpiritsWeighted(
            board,
            sourcePid,
            sourcePid,
            (s) => cardNameContains(s, counter.ownNameIncludes),
            countingSourceType,
        )
    }
    // { ownCost: number }：発生源自身を含む自分フィールドの指定コストのスピリット数（BS06細剣の猫騎士ケット・シー）
    if ("ownCost" in counter) {
        return countSpiritsWeighted(
            board,
            sourcePid,
            sourcePid,
            (s) => instHasCost(s, counter.ownCost),
            countingSourceType,
        )
    }
    // { ownColor: Color }：発生源自身を含む自分フィールドの指定色スピリット数（BS14-041バスター・フェンリルキャノン）
    if ("ownColor" in counter) {
        return countSpiritsWeighted(
            board,
            sourcePid,
            sourcePid,
            (s) => instHasColor(s, counter.ownColor),
            countingSourceType,
        )
    }
    // { anyNameIncludes: string }：両陣営のフィールドで、カード名に指定文字列を含むスピリット数
    if ("anyNameIncludes" in counter) {
        return (
            countSpiritsWeighted(board, sourcePid, "p1", (s) => cardNameContains(s, counter.anyNameIncludes), countingSourceType) +
            countSpiritsWeighted(board, sourcePid, "p2", (s) => cardNameContains(s, counter.anyNameIncludes), countingSourceType)
        )
    }
    // { ownNexusColor: Color }：自分フィールドの指定色ネクサス数
    if ("ownNexusColor" in counter) {
        return board.players[sourcePid].field.nexuses.filter((n) => instHasColor(n, counter.ownNexusColor)).length
    }
    // { ownKeyword: Keyword }：自分フィールドで指定キーワードを持つスピリット数
    if ("ownKeyword" in counter) {
        return countSpiritsWeighted(
            board,
            sourcePid,
            sourcePid,
            (s) => spiritHasKeyword(board, sourcePid, s, counter.ownKeyword),
            countingSourceType,
        )
    }
    // { enemyCost: {max,min} }：相手フィールドのコスト条件を満たすスピリット数
    if ("enemyCost" in counter) {
        const opp: PlayerId = sourcePid === "p1" ? "p2" : "p1"
        return countSpiritsWeighted(board, sourcePid, opp, (s) => instMatchesCostFilter(s, counter.enemyCost), countingSourceType)
    }
    // { ownFamily: FamilyFilter }：発生源自身を含む自分フィールドのスピリット数（familyGrant による付与も含む。配列＝いずれかの系統でOR）
    return countSpiritsWeighted(
        board,
        sourcePid,
        sourcePid,
        (s) => matchesFamilyFilter(board, sourcePid, s, counter.ownFamily),
        countingSourceType,
    )
}
// オーラの発動条件を、発生源の持ち主（sourcePid）基準で判定する
export function checkAuraCondition(
    board: Board,
    sourcePid: PlayerId,
    condition: AuraCondition,
): boolean {
    const player = board.players[sourcePid]
    if (condition === "ownReserveNotEmpty") return player.reserve >= 1
    // "hasOwnBurstSet"：自分がバーストエリアにカードをセットしている間（docs/design/BURST.md）。
    // 文字列リテラル判定は "in" 演算子より前に置く（プリミティブに in を使うと例外になる）
    if (condition === "hasOwnBurstSet") return player.burstSet
    // { ownTrashOnlyColor: Color }：自分のトラッシュにあるカードがこの色だけの間（トラッシュ0枚は空虚な真で成立。BS14-003スカートゥース）
    if ("ownTrashOnlyColor" in condition) {
        return player.trashCards.every((cardId) => card(cardId).colors.includes(condition.ownTrashOnlyColor))
    }
    // BS15共通器：持ち主から見た相手フィールドの色の種類数がこれ以上
    if ("opponentFieldColorsAtLeast" in condition) {
        return opponentFieldColorCount(board, sourcePid, condition.spiritsOnly === true) >= condition.opponentFieldColorsAtLeast
    }
    // BS15共通器：自分フィールドが指定色1色だけの間
    if ("ownFieldOnlyColor" in condition) {
        return ownFieldOnlyColor(board, sourcePid, condition.ownFieldOnlyColor, condition.spiritsOnly === true)
    }
    // BS15共通器：発生源の持ち主から見た相手がバーストをセットしている間（false指定時はセットしていない間）
    if ("opponentBurstSet" in condition) {
        const oppPid: PlayerId = sourcePid === "p1" ? "p2" : "p1"
        return board.players[oppPid].burstSet === condition.opponentBurstSet
    }
    if ("hasOwnColor" in condition) {
        // 「自分の場に◯色のカードがあるか」＝**盤面の存在**を問う判定（分類B）なので、
        // effectSources ではなく field を直接見る。仮想発生源（マジックが貸した継続効果）を
        // 含めると、場に赤のカードが1枚も無いのに赤のマジックを貸しただけで成立してしまう
        // （TURN_EFFECT_SOURCES.md §1。同じ関数の中でも、外側のオーラ発生源探索はAで、この条件はB）
        const all = [...player.field.spirits, ...player.field.nexuses]
        return all.some((inst) => instHasColor(inst, condition.hasOwnColor))
    }
    if ("hasOwnColorSpirit" in condition) {
        return player.field.spirits.some((s) => instHasColor(s, condition.hasOwnColorSpirit))
    }
    // { ownHasKeyword: Keyword }：自分フィールドに指定キーワード持ちのスピリットがいる（一時付与・継続付与も考慮）
    if ("ownHasKeyword" in condition) {
        return player.field.spirits.some((s) =>
            spiritHasKeyword(board, sourcePid, s, condition.ownHasKeyword),
        )
    }
    // { ownLifeAtMost: number }：自分のライフ（コア数）がこの値以下（BS06鉄拳のカクタスガルー）
    if ("ownLifeAtMost" in condition) {
        return player.life <= condition.ownLifeAtMost
    }
    // { opponentHandAtLeast: number }：相手の手札枚数がこれ以上（BS08ブラックウガルルムLv2）
    if ("opponentHandAtLeast" in condition) {
        const oppPid: PlayerId = sourcePid === "p1" ? "p2" : "p1"
        return handSizeOf(board.players[oppPid]) >= condition.opponentHandAtLeast
    }
    // { hasOwnFamily: FamilyFilter }：発生源自身を含んでよい（配列＝いずれかの系統でOR。BS05黄道の虚空）
    return player.field.spirits.some((s) =>
        matchesFamilyFilter(board, sourcePid, s, condition.hasOwnFamily),
    )
}
// オーラ1件が対象インスタンス（targetOwnerPid が持ち主）に効くか判定する
export function auraAppliesTo(
    board: Board,
    sourcePid: PlayerId,
    sourceInst: CardInstance,
    aura: AuraDef,
    targetOwnerPid: PlayerId,
    targetInst: CardInstance,
): boolean {
    // phaseTurn は target を問わず適用する（アルカナプリンス・オベロ：target:"self" での使用）
    if (aura.phaseTurn) {
        if (board.phase !== aura.phaseTurn.phase) return false
        if (aura.phaseTurn.turn === "own" && sourcePid !== board.turnPlayer) return false
        if (aura.phaseTurn.turn === "opponent" && sourcePid === board.turnPlayer) return false
    }
    // turn はフェーズを問わない版（『自分のターン』のようにステップ不問の継続効果。target を問わず適用。BS10-079そびえる机山群Lv1）
    if (aura.turn) {
        if (aura.turn === "own" && sourcePid !== board.turnPlayer) return false
        if (aura.turn === "opponent" && sourcePid === board.turnPlayer) return false
    }
    // バトル中かどうかの3つも target を問わず適用する（phaseTurn と同じ理由）。
    // かつては target:"self" の早期リターンより後にあり、**self では黙って無視されていた**
    // （2026-08-16 に SD02-009 獣将軍クジャルタで判明。当時の該当カードはこの1枚だけ）
    if (aura.battlingOnly) {
        if (!board.battle) return false
        if (
            board.battle.attackerInstanceId !== targetInst.instanceId &&
            board.battle.blockerInstanceId !== targetInst.instanceId
        ) {
            return false
        }
    }
    if (aura.attackingOnly) {
        if (!board.battle) return false
        if (board.battle.attackerInstanceId !== targetInst.instanceId) return false
    }
    if (aura.blockingOnly) {
        if (!board.battle) return false
        if (board.battle.blockerInstanceId !== targetInst.instanceId) return false
    }
    if (aura.target === "self") {
        return sourceInst.instanceId === targetInst.instanceId
    }
    // target === "ownAll"：発生源の持ち主のスピリットすべて（ネクサスは対象外）
    if (sourcePid !== targetOwnerPid) return false
    if (!isSpiritOnField(board, targetOwnerPid, targetInst.instanceId)) return false
    if (aura.colorFilter && !instHasColor(targetInst, aura.colorFilter)) {
        return false
    }
    // combinedFilter（BS10-097ブレイヴオーラ：合体スピリットへの追加BP）
    if (aura.combinedFilter === true && !instIsCombined(targetInst)) {
        return false
    }
    // uncombinedFilter（combinedFilterのちょうど逆。SD06-004ドス・モンキ：合体していないスピリットすべて）
    if (aura.uncombinedFilter === true && instIsCombined(targetInst)) {
        return false
    }
    // braveOnly（BS10-086巨星望む大樹Lv1：自分のスピリット状態のブレイヴすべて）。合体中のブレイヴは
    // field.spiritsに実体が無いため、ownAllの走査に来た時点で自動的に「スピリット状態」を意味する
    if (aura.braveOnly === true && card(targetInst.cardId).type !== "brave") {
        return false
    }
    if (aura.summonedThisTurnOnly && targetInst.summonedTurn !== board.turn) {
        return false
    }
    if (aura.minSymbols !== undefined && instanceSymbolCount(targetInst) < aura.minSymbols) {
        return false
    }
    // 軽減シンボルの色数（BS09-003角竜人ドラケンLv2＝「軽減シンボルを2色以上持つ」）。
    // 軽減はカード固有の情報なので、付与色（timedColors）ではなくカード静的な reduction を見る
    if (aura.reductionColorsAtLeast !== undefined) {
        const colors = new Set(card(targetInst.cardId).reduction)
        if (colors.size < aura.reductionColorsAtLeast) return false
    }
    if (
        aura.keywordFilter &&
        !spiritHasKeyword(board, targetOwnerPid, targetInst, aura.keywordFilter)
    ) {
        return false
    }
    // keywordsFilter（OR。BS11-081 ライトニングデリバリー＝【光芒】/【聖命】）
    if (
        aura.keywordsFilter &&
        !aura.keywordsFilter.some((k) => spiritHasKeyword(board, targetOwnerPid, targetInst, k))
    ) {
        return false
    }
    if (aura.minCores !== undefined && targetInst.cores < aura.minCores) {
        return false
    }
    if (aura.coresExact !== undefined && targetInst.cores !== aura.coresExact) {
        return false
    }
    if (aura.costFilter !== undefined && !instHasCost(targetInst, aura.costFilter)) {
        return false
    }
    // costMinFilter（BS07造兵工房Lv2：コスト3以上）。costFilter＝完全一致とは別軸で、
    // 付与コスト（道化師クラン）も含めていずれかが下限以上なら通す
    const costMin = aura.costMinFilter
    if (costMin !== undefined && !instAllCosts(targetInst).some((cost) => cost >= costMin)) {
        return false
    }
    if (
        aura.familyFilter &&
        !matchesFamilyFilter(board, targetOwnerPid, targetInst, aura.familyFilter)
    ) {
        return false
    }
    if (aura.familyAllFilter !== undefined && !aura.familyAllFilter.every((f) => spiritHasFamily(board, targetOwnerPid, targetInst, f))) {
        return false
    }
    if (aura.nameIncludesFilter !== undefined && !cardNameContains(targetInst, aura.nameIncludesFilter)) {
        return false
    }
    if (aura.vanillaFilter && !instIsVanilla(targetInst)) {
        return false
    }
    return true
}
// オーラ1件の増加量（発生源の持ち主 sourcePid 基準でカウンタ・条件を評価する）。
// targetInst は "targetArmorColors"（対象基準のカウンタ。アイシクルアサルト）でのみ使う
export function auraAmount(
    board: Board,
    sourcePid: PlayerId,
    aura: AuraDef,
    targetInst?: CardInstance,
    sourceType?: CardType, // オーラの発生源の種別（数え上げの限定に使う。呼び出し元が発生源インスタンスから求めて渡す）
): number {
    let amount = 0
    if (aura.amountPer !== undefined && aura.counter !== undefined) {
        amount += aura.amountPer * countAuraCounter(board, sourcePid, aura.counter, targetInst, sourceType)
    }
    if (aura.amount !== undefined) {
        if (!aura.condition || checkAuraCondition(board, sourcePid, aura.condition)) {
            amount += aura.amount
        }
    }
    return amount
}
// 「BPを+する」効果が、effectOwnerPid（効果を出す側）にとって発揮されない状態か
// （kind:"bpBuffSuppression"。BS04古代闘技場Lv1「相手のスピリット/ネクサス/マジックの『BPを+する』効果は発揮されない」）。
// 発生源の持ち主から見た**相手**に効くため、opponent 側のフィールドに有効な発生源があるかを見る。
// BP増加アクション（buff.ts のレジストリ）・BP増加オーラ（下の effectiveBp）・magicBuffBonus の3経路が参照する
export function isBpBuffSuppressed(board: Board, effectOwnerPid: PlayerId): boolean {
    const sourcePid: PlayerId = effectOwnerPid === "p1" ? "p2" : "p1"
    // 抑止する側の発生源は「場に実在するもの」で判定する（貸与された仮想発生源も効果を出す側なので effectSources を使う）
    for (const source of effectSources(board, sourcePid)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "bpBuffSuppression") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && sourcePid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && sourcePid === board.turnPlayer) continue
            return true
        }
    }
    return false
}

// 実効BP：基礎BP（tempBpBuff加算済み）に、両陣営の常時BP修正（オーラ）を加算した値。
// 戦闘のBP比較・BPを条件にした対象選択はすべてこの値を使う（レベル判定・維持コアは対象外）。
export function effectiveBp(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
): number {
    // 「Lv◯BPを◯として扱う」は Lv の BP を置き換える：ブレイヴの合体時BP+ は含めて置き換わり（足さない）、
    // 効果による BP+ とオーラは掛かった前後を問わず上に乗る（Q3630・Q3632・Q18859。2026-09-25 ユーザー確認）。
    // 重なったら このバトル限定＞継続の同値化（百地ダイル）＞継続（X011）の順で1つだけ見る
    const battleBpAs = inst.battleBpAs !== undefined && inst.battleBpAs.levels.includes(currentLevel(inst).level) ? inst.battleBpAs.amount : undefined
    const lvBpAs = battleBpAs ?? inst.bpEqualizeContinuous ?? inst.bpAsContinuous
    // currentLevel(...).bp は tempBpBuff/battleBpBuff を加算済みなので、置き換えるときはそれを足し直す
    let total =
        lvBpAs !== undefined
            ? lvBpAs + inst.tempBpBuff + (inst.battleBpBuff ?? 0)
            : currentLevel(inst).bp + braveBpBonus(board, board.players[ownerPid], inst)
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        // 古代闘技場Lv1：この陣営の「BPを+する」効果は発揮されない。オーラは1体ぶんずつ加算されるため、
        // 加算値が正のものだけを落とす（BP-のオーラは抑止の対象外。現データに負のBPオーラは無い）
        const bpBuffSuppressed = isBpBuffSuppressed(board, pid)
        const sources = effectSources(board, pid)
        for (const source of sources) {
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "aura" || effect.aura.type !== "bp") continue
                // 【合体時】：発生源が合体しているときだけ発揮する
                if (effect.whileCombined === true && !instIsCombined(source)) continue
                // whileOwnBurstSet：発生源の持ち主が自分のバーストをセットしている間だけ有効（docs/design/BURST.md。BS14-019シュテン・ドーガLv2）
                if (effect.whileOwnBurstSet === true && !board.players[pid].burstSet) continue
                // lentOnly：仮想発生源（マジックが lendSelfThisTurn で貸した効果）からのみ有効。
                // 実在するスピリット/ネクサスがたまたま同じ効果エントリを持っていても恒久化させない
                if (effect.aura.lentOnly && !isVirtualSource(source)) continue
                // 発生源のレベル判定は素の currentLevel を使う（effectiveBp の再帰を避ける）
                const sourceLevel = currentLevel(source).level
                if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
                if (!auraAppliesTo(board, pid, source, effect.aura, ownerPid, inst)) {
                    continue
                }
                const amount = auraAmount(board, pid, effect.aura, inst, card(source.cardId).type)
                if (bpBuffSuppressed && amount > 0) continue
                total += amount
            }
        }
    }
    return total + timedRuleBp(board, ownerPid, inst)
}

// 全体ルール（timedEffect の all:true）の BP 増減。対象も量も計算のたびに判定し直す
// （解決後に場に出たスピリットにも効き、「1体につき」の数も変わる。2026-09-24 ユーザー確認）。
// 古代闘技場の抑止はここでは見ない：発揮を止める効果は、発揮し終わって続いている効果を止めない（置くときだけ見る）
export function timedRuleBp(board: Board, ownerPid: PlayerId, inst: CardInstance): number {
    let total = 0
    for (const r of board.timedEffects) {
        const t = r.target
        // 1体への一定量は写し（tempBpBuff・battleBpBuff）に入っているので、ここでは「1体につき」の量だけ
        const onInstance = t.kind === "instance" && t.instanceId === inst.instanceId
        const byRule = t.kind === "rule" && (t.pid === undefined || t.pid === ownerPid) && matchesTarget(board, ownerPid, inst, t.filter, t.selfInstanceId)
        if (!onInstance && !byRule) continue
        for (const x of r.content) {
            if (x.type !== "bp" || (onInstance && x.amountCounter === undefined)) continue
            total += x.amountCounter === undefined ? x.amount : x.amount * countAuraCounter(board, r.ownerPid, x.amountCounter as AuraCounter, inst)
        }
    }
    return total
}
