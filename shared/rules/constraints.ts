// 制約・免疫・期間つき効果の読み取り（shared/rules.ts から分割。判定の規約は shared/rules.ts 冒頭）
import { noteCoverage, noteGrantedFrom, noteKeyword } from "../coverage"

import type {
    ConstraintDef,
    EffectDef,
    PlayerRuleDef,
    GlobalConstraintDef,
    CardInstance,
    CardType,
    ImmuneSource,
    Color,
    FieldEvent,
    Keyword,
    PlayerId,
    TimedContent,
    TriggerEvent,
} from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { isEndStepLocked } from "./activation"
import { checkAuraCondition, countSpiritsWeighted, effectiveBp } from "./bp"
import { matchesFamilyFilter, spiritHasFamily, spiritHasKeyword } from "./keywordState"
import { hasKeyword, bravesOf, combinedBraveColorsOk, currentLevel, effectActiveOn, effectSources, instAllCosts, instEffectsSuppressed, ownAllNexusesHaveFamily, instHasColor, instHasCost, instIsCombined, instIsVanilla, isVirtualSource } from "./level"
import { entryActive } from "./effectStop"
import { hasUntargetableConstraint } from "./resistance"
import { handSizeOf, instanceSymbolCount } from "./symbols"
import { ownFieldSymbolColors } from "../cost"
import { cardNameContains, instMatchesCostFilter, matchesTarget } from "./targetFilter"
import { lifeGuardBounds } from "./lifeGuard"

// ---- 制約・免疫 ----

// 指定インスタンスが現在レベルで持つ制約定義の一覧（RuleValidator の validateBlock が参照する）
// 制約と、それを出している発生源の instanceId の組。
// 「ターンに1回」を**発生源ごと**に数える処理（BS07ブリシンガメンの首飾りLv2）が必要とする。
// 同名ネクサスを2枚置けば2回使えるのが正しいので、どの1枚が出した制約かを区別できないといけない
export interface ConstraintWithSource {
    constraint: ConstraintDef
    sourceInstanceId: string
}

// 制約だけが要る呼び出し（大多数）はこちら。判定の本体は activeConstraintsWithSource に1本化してある
export function activeConstraints(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): ConstraintDef[] {
    return activeConstraintsWithSource(board, pid, inst).map((e) => e.constraint)
}

export function activeConstraintsWithSource(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): ConstraintWithSource[] {
    // 「持つ効果すべては発揮されない」を受けている個体は制約を1つも出さない
    // （自前の kind:"constraint" だけでなく、他の発生源からの継続付与 constraintGrant も含めて打ち切る。
    //  BS07ルナースラッシュ＝ブロックしてきた相手を無力化する用途なので、広く止める側に倒している）
    if (instEffectsSuppressed(inst)) return []
    const level = currentLevel(inst).level
    // 合体しているブレイヴの constraint も、ホストが出す制約としてここに合流させる
    // （合体スピリットは1体として振る舞う。BS10バズーカ・アームズ：canBlockUnblockable）
    const own = [inst, ...bravesOf(board.players[pid], inst)]
        .flatMap((src) =>
            card(src.cardId)
                .effects.filter(
                    (e) =>
                        e.kind === "constraint" &&
                        effectActiveOn(inst, e, src === inst ? level : currentLevel(src).level) &&
                        (e.whileSpirit !== true || src === inst) &&
                        // whileOwnBurstSet：発生源の持ち主が自分のバーストをセットしている間だけ有効（docs/design/BURST.md）
                        (e.whileOwnBurstSet !== true || board.players[pid].burstSet) &&
                        // BS15共通器：condition／phaseTurn（aura.condition／aura.phaseTurnと同じ判定式。BS15-060バンディット・アームズ）
                        (e.condition === undefined || checkAuraCondition(board, pid, e.condition, inst)) &&
                        (e.phaseTurn === undefined ||
                            (board.phase === e.phaseTurn.phase &&
                                (e.phaseTurn.turn === "both" ||
                                    (e.phaseTurn.turn === "own") === (pid === board.turnPlayer)))),
                )
                .map((e) => { noteCoverage(e, "constraint"); return (e as { constraint: ConstraintDef }).constraint }),
        )
        // cantAttack の条件つき（BS04鎧装獣ヘイズ・ルーン：相手のフィールドに赤のスピリットが
        // **いない間**だけアタックできない）。条件を満たさなくなったら制約自体を外す
        // 「自分のフィールドにネクサスが1つだけある間」（BS11-027 海戦機ニヨルド）。
        // 条件を満たさなければ制約自体を外す
        .filter((c) => {
            const whileCount =
                (c.type === "cantAttack" || c.type === "immuneToOpponentEffects") ? c.whileOwnNexusCount : undefined
            if (whileCount === undefined) return true
            return board.players[pid].field.nexuses.length === whileCount
        })
        // 26RSD09-001：自身に[ソウルコア]が置かれていない間だけ／26RBS03-046：自分のフィールドに指定系統のスピリットがいない間だけ（自身も数える）
        .filter((c) => {
            if (c.type !== "cantAttack") return true
            if (c.whileNoOwnSoulCore && inst.soulCoreOn === true) return false
            if (c.whileNoOwnFamilySpirit !== undefined) {
                const fam = c.whileNoOwnFamilySpirit
                if (board.players[pid].field.spirits.some((s) => spiritHasFamily(board, pid, s, fam))) return false
            }
            return true
        })
        .filter((c) => {
            if (c.type !== "cantAttack" || c.unlessOpponentHasColorSpirit === undefined) return true
            const oppPid: PlayerId = pid === "p1" ? "p2" : "p1"
            const color = c.unlessOpponentHasColorSpirit
            return !board.players[oppPid].field.spirits.some((s) => instHasColor(s, color))
        })
        // unblockableBy の条件つき（BS03鷹人ホークアイLv2：自分のフィールドに紫のネクサスがあるとき
        // だけブロックされない）。条件を満たさない間は制約自体を外す
        .filter((c) => {
            if (c.type !== "unblockableBy" || c.requireOwnFieldColorNexus === undefined) return true
            const color = c.requireOwnFieldColorNexus
            return board.players[pid].field.nexuses.some((n) => instHasColor(n, color))
        })
        // unblockableBy の条件つきその2（BS05幻獣王リーンLv3：自分のコスト2のスピリットが3体以上いる間だけ）。
        // 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る（instHasCost）
        .filter((c) => {
            if (c.type !== "unblockableBy" || c.requireOwnCostCountAtLeast === undefined) return true
            const { cost, count } = c.requireOwnCostCountAtLeast
            // この制約は判定対象のスピリット自身が持つ kind:"constraint" なので、数える側の発生源はスピリット
            return countSpiritsWeighted(board, pid, pid, (s) => instHasCost(s, cost), "spirit") >= count
        })
    // constraintGrant：持ち主フィールドの発生源から、ownAll/filter/phaseTurn条件に合致する制約を合成する
    const granted: ConstraintWithSource[] = []
    const sources = effectSources(board, pid)
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "constraintGrant") continue
            if (effect.target === "opponentAll") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            // 【合体時】：発生源自身が合体しているときだけ付与する（BRAVE.md §12.3。BS13-X006）
            if (effect.whileCombined === true && !instIsCombined(source)) continue
            if (!entryActive(board, pid, source, effect, sourceLevel)) continue
            if (effect.condition !== undefined && !checkAuraCondition(board, pid, effect.condition)) continue
            if (effect.filter && !matchesTarget(board, pid, inst, effect.filter, source.instanceId)) continue
            // keywordFilter（【激突】など）だけ filter に移していない。matchesTarget はラベル系を現在Lvで見るため挙動が変わる
            if (effect.keywordFilter && !spiritHasKeyword(board, pid, inst, effect.keywordFilter)) continue
            if (effect.phaseTurn) {
                const { phase, turn } = effect.phaseTurn
                if (board.phase !== phase) continue
                if (turn === "own" && pid !== board.turnPlayer) continue
                if (turn === "opponent" && pid === board.turnPlayer) continue
            }
            // AuraDef.turnと同じ意味：フェーズを問わずturn条件のみで絞る（phaseTurnのphase必須版とは別軸）
            if (effect.turn === "own" && pid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && pid === board.turnPlayer) continue
            if (!combinedBraveColorsOk(board.players[pid], source, effect.combinedBraveColors)) continue
            noteCoverage(effect, "constraintGrant")
            granted.push({ constraint: effect.constraint, sourceInstanceId: source.instanceId })
        }
    }
    // target:"opponentAll"（N9）：発生源の持ち主から見て相手の側（pid）に効く制約。
    // phaseTurn・turn は効果文どおり発生源の持ち主（oppPid）基準で判定する
    const oppPid: PlayerId = pid === "p1" ? "p2" : "p1"
    for (const source of effectSources(board, oppPid)) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "constraintGrant" || effect.target !== "opponentAll") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (effect.whileCombined === true && !instIsCombined(source)) continue
            if (!entryActive(board, oppPid, source, effect, sourceLevel)) continue
            if (effect.condition !== undefined && !checkAuraCondition(board, oppPid, effect.condition)) continue
            if (effect.filter && !matchesTarget(board, pid, inst, effect.filter, source.instanceId)) continue
            if (effect.keywordFilter && !spiritHasKeyword(board, pid, inst, effect.keywordFilter)) continue
            if (effect.phaseTurn) {
                const { phase, turn } = effect.phaseTurn
                if (board.phase !== phase) continue
                if (turn === "own" && oppPid !== board.turnPlayer) continue
                if (turn === "opponent" && oppPid === board.turnPlayer) continue
            }
            if (effect.turn === "own" && oppPid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && oppPid === board.turnPlayer) continue
            if (!combinedBraveColorsOk(board.players[oppPid], source, effect.combinedBraveColors)) continue
            noteCoverage(effect, "constraintGrant")
            granted.push({ constraint: effect.constraint, sourceInstanceId: source.instanceId })
        }
    }
    // tenshoCoreSubstitute の familyFilter/costFilter 指定（BS12-061剣の誕生地）：
    // 他の発生源（ネクサス等）が「対象スピリットの絞り込み」つきでこの制約を**own（kind:"constraint"）として**
    // 宣言している場合、そのスピリットの【転召】置換として合流させる。疲労するのは対象スピリットではなく
    // **宣言した発生源自身**（EffectModules.tenshoAfterTargetTriggerがsourceInstanceIdを見て判定する）
    for (const source of sources) {
        if (source.instanceId === inst.instanceId) continue
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "constraint") continue
            if (effect.constraint.type !== "tenshoCoreSubstitute") continue
            const { familyFilter, costFilter } = effect.constraint
            if (familyFilter === undefined && costFilter === undefined) continue
            if (!entryActive(board, pid, source, effect, sourceLevel)) continue
            if (familyFilter !== undefined && !matchesFamilyFilter(board, pid, inst, familyFilter)) continue
            if (costFilter !== undefined && !instHasCost(inst, costFilter)) continue
            noteCoverage(effect, "constraint")
            granted.push({ sourceInstanceId: source.instanceId, constraint: effect.constraint })
        }
    }
    // constraintSuppression（BS04獣使いドヴェルグ）：持ち主のフィールドの発生源が、対象スピリットの
    // 指定タイプの制約を発揮させない。合成結果から最後に取り除く
    const suppressed = new Set<ConstraintDef["type"]>()
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "constraintSuppression") continue
            if (!entryActive(board, pid, source, effect, sourceLevel)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && pid === board.turnPlayer) continue
            if (effect.nameContains !== undefined && !cardNameContains(inst, effect.nameContains)) continue
            noteCoverage(effect, "constraintSuppression")
            suppressed.add(effect.constraintType)
        }
    }
    // 自分自身が持つ制約（kind:"constraint"）の発生源はその個体自身
    const all: ConstraintWithSource[] = [
        ...own.map((c) => ({ constraint: c, sourceInstanceId: inst.instanceId })),
        ...granted,
    ]
    if (suppressed.size === 0) return all
    return all.filter((e) => !suppressed.has(e.constraint.type))
}
// 軽減シンボルの付与（reductionGrant）を、種別 sourceType の発生源からは行えないか
export function noReductionGrantFrom(board: Board, sourceType: CardType): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "noReductionGrantToHand") continue
                if (!entryActive(board, pid, source, effect, level)) continue
                if (effect.constraint.sourceTypes.includes(sourceType)) return true
            }
        }
    }
    return false
}

// ⚠️ **これは boardResistanceAgainst の内部実装**。個別に呼ぶと他の耐性軸が抜けるので、
// 効果が届くかを判定したい箇所は resistanceAgainst（サーバー）か boardResistanceAgainst を通すこと。
export function isUntargetableByOpponent(inst: CardInstance): boolean {
    // 判定本体は hasUntargetableConstraint に一本化してある（同じ走査を2つ持つと、
    // 実行時カバレッジの計測点が二重になるうえ、片方だけ直す事故が起きる）
    return inst.immuneToOpponentThisTurn === true || hasUntargetableConstraint(inst)
}
// untargetableByOpponentと異なり範囲効果（destroy{all}/exhaust{all}等）にも効く「効果を受けない」判定。
// srcType が spirit/magic のときのみ判定する（ネクサスの効果・自分自身の効果は通す。BS04ワルキューレ・ヒルド）
// ⚠️ **これは boardResistanceAgainst の内部実装**。個別に呼ぶと他の耐性軸が抜けるので、
// 効果が届くかを判定したい箇所は resistanceAgainst（サーバー）か boardResistanceAgainst を通すこと。
export function hasFullEffectImmunity(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
    srcType: CardType | undefined,
): boolean {
    // ブレイヴの効果（合体中のブレイヴが発生源）も対象にする。
    // ⚠️ against 未指定の「相手の効果を受けない」は**従来どおりスピリット/マジックだけ**を止める
    // （既存カードの範囲を広げないため）。ブレイヴを止めるのは against:"brave" を書いたときだけ
    if (srcType === "brave") {
        return activeConstraints(board, pid, inst).some(
            (c) => c.type === "immuneToOpponentEffects" && againstIncludes(c.against, "brave"),
        )
    }
    if (srcType === "nexus") {
        return activeConstraints(board, pid, inst).some((c) => c.type === "immuneToOpponentEffects" && againstIncludes(c.against, "nexus"))
    }
    if (srcType !== "spirit" && srcType !== "magic") return false
    // activeConstraints は自前の kind:"constraint" だけでなく constraintGrant による範囲付与も含む
    // （BS10-091シャボンの湖畔Lv2＝「自分のコスト2のスピリットすべては」）。against指定時はそのsrcTypeのみ絞る
    return activeConstraints(board, pid, inst).some(
        (c) => c.type === "immuneToOpponentEffects" && (c.against === undefined || againstIncludes(c.against, srcType)),
    )
}

// against が単発／配列どちらでも書けることの吸収（BS17-072：spirit/braveの2種指定）
function againstIncludes(against: ImmuneSource | ImmuneSource[] | undefined, srcType: ImmuneSource): boolean {
    if (against === undefined) return false
    return Array.isArray(against) ? against.includes(srcType) : against === srcType
}
// ⚠️ 原則 boardResistanceAgainst の内部実装。**直接呼んでよいのはバトル文脈だけ**
// （【呪撃】を装甲で防ぐ判定と、reviveOnDestroy の byBattleVsArmorColor＝「装甲の色の相手に
// バトルで破壊されたとき」。どちらも『効果が届くか』ではなく装甲の色そのものを問う判定）
export function hasArmorAgainst(board: Board, inst: CardInstance, sourceColors: Color[] | undefined): boolean {
    if (sourceColors === undefined || sourceColors.length === 0) return false
    // 「効果すべてを失い、新たに得ることもない」（BS12-081 メロディアスハープ）は、付与された装甲も持たない
    if (instEffectsSuppressed(inst)) return false
    const level = currentLevel(inst).level
    const staticArmor = card(inst.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "armor" &&
            effectActiveOn(inst, e, level) &&
            (e.colors?.some((c) => sourceColors.includes(c)) ?? false),
    )
    if (staticArmor) {
        noteKeyword(card(inst.cardId).effects, "armor", level)
        return true
    }
    // 一時付与の装甲（インビンシブルシールド）
    if (
        timedKeywords(board, inst).some(
            (k) => k.keyword === "armor" && (k.colors?.some((c) => sourceColors.includes(c)) ?? false),
        )
    ) {
        return true
    }
    // 継続付与の装甲（kind:"keywordGrant"のkeyword:"armor"。refreshLevelAsOverridesが
    // armorColorsGrantedへ毎回再計算する。BS05白夜の虚空Lv2：転召持ちに装甲：赤/紫/緑/白）
    if (!(inst.armorColorsGranted ?? []).some((c) => sourceColors.includes(c))) return false
    noteGrantedFrom(inst, "keyword")
    return true
}

// 【重装甲】。装甲との差は**ブレイヴの効果も防ぐ**ことだけで、判定の形は hasArmorAgainst と同じ。
// ⚠️ 装甲とは別枠（KEYWORD_INCLUDES に入れない。2026-09-03 ユーザー確認。docs/design/BS12_PLAN.md §1）。
// 一時付与の重装甲は BS12 に無いので tempKeywords は見ない（必要になったら足す）
export function hasHeavyArmorAgainst(inst: CardInstance, sourceColors: Color[] | undefined): boolean {
    if (sourceColors === undefined || sourceColors.length === 0) return false
    // 「効果すべてを失い、新たに得ることもない」（BS12-081 メロディアスハープ）は、付与された装甲も持たない
    if (instEffectsSuppressed(inst)) return false
    const level = currentLevel(inst).level
    const staticHeavyArmor = card(inst.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "heavyArmor" &&
            effectActiveOn(inst, e, level) &&
            (e.colors?.some((c) => sourceColors.includes(c)) ?? false),
    )
    if (staticHeavyArmor) {
        noteKeyword(card(inst.cardId).effects, "heavyArmor", level)
        return true
    }
    // 毎回算出ぶん（合体中のブレイヴが持つ静的【重装甲】のホストへの反映と、【重装甲：可変】＝colorsFrom:"selfColors"）。
    // refreshLevelAsOverrides が heavyArmorColorsGranted へ都度再構築する
    if (!(inst.heavyArmorColorsGranted ?? []).some((c) => sourceColors.includes(c))) return false
    noteGrantedFrom(inst, "keyword")
    return true
}

// 器AJ：instがその時点で実際に持つ【重装甲】の色を列挙する（静的keyword＋heavyArmorColorsGranted。
// hasHeavyArmorAgainstと同じ元データを「含むか」ではなく「一覧」で返す版。BS13-030リーサルウェポンドラゴン：
// 「このスピリットが持つ【重装甲】と同じ色」を色ごとに1体ずつ選ぶために使う。重複除去して返す）
export function heavyArmorColorsOf(inst: CardInstance): Color[] {
    const level = currentLevel(inst).level
    const colors: Color[] = []
    for (const e of card(inst.cardId).effects) {
        if (e.kind !== "keyword" || e.keyword !== "heavyArmor") continue
        if (!effectActiveOn(inst, e, level)) continue
        for (const c of e.colors ?? []) if (!colors.includes(c)) colors.push(c)
    }
    for (const c of inst.heavyArmorColorsGranted ?? []) if (!colors.includes(c)) colors.push(c)
    return colors
}

// 第3の耐性軸：相手のブレイヴの効果を受けない（kind:"braveImmuneGrant"）。装甲/重装甲とは別枠
// （BS12_PLAN.md §1 の1と同じ線引き）。scope:"all"は色不問、scope:"matchArmorColors"は
// **対象自身が持つ【装甲】の色**と一致するときだけ防ぐ（このスピリット自身の装甲色を都度参照する）
export function hasBraveImmuneAgainst(inst: CardInstance, sourceColors: Color[] | undefined): boolean {
    if (inst.braveImmuneAll) return true
    if (inst.braveImmuneMatchArmorColors) {
        if (sourceColors === undefined || sourceColors.length === 0) return false
        const level = currentLevel(inst).level
        const ownArmorColors: Color[] = []
        for (const e of card(inst.cardId).effects) {
            if (e.kind !== "keyword" || e.keyword !== "armor") continue
            if (!effectActiveOn(inst, e, level)) continue
            for (const c of e.colors ?? []) if (!ownArmorColors.includes(c)) ownArmorColors.push(c)
        }
        for (const c of inst.armorColorsGranted ?? []) if (!ownArmorColors.includes(c)) ownArmorColors.push(c)
        return ownArmorColors.some((c) => sourceColors.includes(c))
    }
    return false
}
// BS18-052：手札・トラッシュにあるスピリットカード自身の効果を止めるか（2026-10-23 ユーザー確認）。
// 止めるのは「そのカード自身の効果の発揮」だけで、効果を持つこと自体は変わらない
// （「【不死】を持つ」の参照や、他の効果から受ける効果は止めない）。
// ブレイヴ・マジック・ネクサスはスピリットカードではないので対象外。召喚コストを払う通常の召喚は止めない
export function zoneSpiritEffectsDisabled(board: Board, cardId: string): boolean {
    return card(cardId).type === "spirit" && hasGlobalConstraint(board, "handTrashSpiritEffectsDisabled")
}
// PX19：トラッシュのカードが効果を受けない／自身の効果を使えない（Q18473・Q18475）。トラッシュの枚数やシンボルを数えるだけの参照は止めない
export function trashFrozen(board: Board): boolean {
    return hasGlobalConstraint(board, "trashFrozen")
}
// トラッシュにあるカード自身の効果の発揮を止めるか。トラッシュだけで効く呼び出し元は zoneSpiritEffectsDisabled ではなくこちらを使う
export function trashCardEffectsDisabled(board: Board, cardId: string): boolean {
    return zoneSpiritEffectsDisabled(board, cardId) || trashFrozen(board)
}
// 手札にあるカード自身のキーワード（【神速】【烈神速】）を行使できるか。持っているかの参照には hasKeyword を使うこと
export function ownHandKeyword(board: Board, cardId: string, keyword: Keyword): boolean {
    return hasKeyword(cardId, keyword) && !zoneSpiritEffectsDisabled(board, cardId)
}
// match：型ごとの追加の絞り込み（発生源の持ち主 pid とエントリを受ける）。発生源が効いているかの判定はここ1か所
export function hasGlobalConstraint(
    board: Board,
    type: GlobalConstraintDef["type"],
    match?: (effect: Extract<EffectDef, { kind: "globalConstraint" }>, sourcePid: PlayerId, source: CardInstance) => boolean,
): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果。BS02グレートウォール）も含める
        for (const inst of effectSources(board, pid)) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== type) continue
                if (!entryActive(board, pid, inst, effect, level)) continue
                // whileOwnBurstSet：発生源の持ち主が自分のバーストをセットしている間だけ有効（docs/design/BURST.md）
                if (effect.whileOwnBurstSet === true && !board.players[pid].burstSet) continue
                if (effect.whileSelfAttacking === true && board.battle?.attackerInstanceId !== inst.instanceId) continue
                if (match && !match(effect, pid, inst)) continue
                noteCoverage(effect, "globalConstraint")
                return true
            }
        }
    }
    return false
}

// pid のデッキが破棄できないか（globalConstraint／このターンの playerRule の noDeckMill）。mill・コスト・【粉砕】の判定はここ1か所。
export function deckMillBlockedByRule(board: Board, pid: PlayerId, byOpponent: boolean): boolean {
    if (timedPlayerRules(board, pid).some((r) => r.type === "noDeckMill" && (r.by !== "opponent" || byOpponent))) return true
    return hasGlobalConstraint(board, "noDeckMill", (effect, sourcePid, source) => {
        const c = effect.constraint
        if (c.type !== "noDeckMill") return false
        if (c.side === "own" && sourcePid !== pid) return false
        if (c.by === "opponent" && !byOpponent) return false
        if (effect.phase !== undefined && effect.phase !== board.phase) return false
        if (c.whileSourceDeployedTurnOnly && source.summonedTurn !== board.turn) return false
        return true
    })
}

// 合体スピリットのコストからブレイヴ分を引くか（050 の継続・054 の期間つき）。refreshLevelAsOverrides が braveComposite を組むときに読む
export function braveCostZeroFor(board: Board, hostPid: PlayerId): boolean {
    if (board.timedEffects.some((r) => r.target.kind === "player" && r.target.pid === hostPid && r.content.some((c) => c.type === "braveCostZero"))) return true
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of effectSources(board, pid)) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "braveCostZero") continue
                if (!entryActive(board, pid, inst, effect, level)) continue
                noteCoverage(effect, "globalConstraint")
                return true
            }
        }
    }
    return false
}

// 「合体時BP+」を0にする制約（braveBpBonusZero）が、hostPid の合体スピリットに掛かっているか
export function braveBpBonusZeroFor(board: Board, hostPid: PlayerId): boolean {
    const onField = (id: string): boolean => (["p1", "p2"] as PlayerId[]).some((p) => [...board.players[p].field.spirits, ...board.players[p].field.combinedBraves].some((i) => i.instanceId === id))
    for (const r of board.timedEffects) {
        if (r.target.kind !== "player" || r.target.pid !== hostPid || !r.content.some((c) => c.type === "braveBpBonusZero")) continue
        if (r.sourceInstanceId !== undefined && !onField(r.sourceInstanceId)) continue
        return true
    }
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of effectSources(board, pid)) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "braveBpBonusZero") continue
                if (effect.constraint.side === "opponent" && pid === hostPid) continue
                if (effect.turn === "own" && board.turnPlayer !== pid) continue // 見出し『自分のターン』（BS23-008）
                if (!entryActive(board, pid, inst, effect, level)) continue
                if (effect.whileOwnBurstSet === true && !board.players[pid].burstSet) continue
                noteCoverage(effect, "globalConstraint")
                return true
            }
        }
    }
    return false
}

// 器AQ：globalConstraint "attackOncePerTurnBySymbolCount"（BS13-068遥かなる衛星砲）。
// instのシンボル数と一致する制約が両陣営どちらかのfieldにあり、かつinstが既にこのターンアタック済みなら true
// （RuleValidator.validateAttackが2回目以降のアタック宣言を拒否する）
export function attackOncePerTurnLimitApplies(board: Board, inst: CardInstance): boolean {
    if (!inst.attackedThisTurn) return false
    const count = instanceSymbolCount(inst)
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "attackOncePerTurnBySymbolCount") continue
                if (!entryActive(board, pid, source, effect, level)) continue
                if (effect.constraint.symbolCount === count) return true
            }
        }
    }
    return false
}

// attackOncePerTurnLimitAppliesのコスト版（BS14-088青玉の巨大迷宮）。
// instのコストがmaxCost以下の制約が両陣営どちらかのfieldにあり、かつinstが既にこのターンアタック済みならtrue
export function attackOncePerTurnByCostLimitApplies(board: Board, inst: CardInstance): boolean {
    if (!inst.attackedThisTurn) return false
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                const constraint = effect.constraint
                if (constraint.type !== "attackOncePerTurnByCost") continue
                if (!entryActive(board, pid, source, effect, level)) continue
                if (instAllCosts(inst).some((cost) => cost <= constraint.maxCost)) return true
            }
        }
    }
    return false
}

// attackOncePerTurnByCostLimitApplies の「合計」版（26RBS02-085）。attackerPid のコストがmaxCost以下のスピリットが
// すでにこのターンにアタックしていれば、同じ区分のスピリットはもうアタックできない。
// 制約の発生源は両陣営どちらでもよく、条件（自分のネクサスすべてが系統〜）は発生源の持ち主で判定する
export function attackTotalOncePerTurnLimitApplies(board: Board, attackerPid: PlayerId, inst: CardInstance): boolean {
    const used = board.players[attackerPid].minAttackCostThisTurn
    if (used === undefined) return false
    const costs = instAllCosts(inst)
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "attackOncePerTurnTotalByCost") continue
                const maxCost = effect.constraint.maxCost
                if (!entryActive(board, pid, source, effect, level)) continue
                const family = effect.condition?.allOwnNexusesHaveFamily
                if (family !== undefined && !ownAllNexusesHaveFamily(board, pid, family)) continue
                if (used <= maxCost && costs.some((c) => c <= maxCost)) return true
            }
        }
    }
    return false
}

// 手札破棄の関門（BS11-065 満天の牧草地Lv1-2「お互い、手札を破棄できない」）。
// pid は破棄しようとしている本人（両陣営に効く制約なので現状は参照しないが、片側限定の制約が
// 増えたときのために引数を持たせてある）。手札破棄は約18種のアクションに散っているため、
// 共通ヘルパー化はせず各ハンドラの先頭でこの述語を見て早期リターンする形にする
export function canDiscardHand(board: Board, pid: PlayerId): boolean {
    if (board.phase === "main" && hasGlobalConstraint(board, "noHandDiscardInMain")) return false
    // BS15-052天蒼元帥チョウハッカイ：お互い、効果では手札を破棄できない（ステップを問わない）。
    // 今ある手札の破棄はすべて効果か、効果が与えた払い方・効果が要求するもの（ビクティム・ブロックのコスト。10-30 ユーザー決定）
    if (hasGlobalConstraint(board, "noHandDiscardByEffect")) return false
    return true
}
// pid は「ブレイヴをスピリット状態にできない」側か（BS11-X02 滅神星龍ダークヴルム・ノヴァLv3）。
// 発生源の持ち主から見た相手だけに効くので、pid 以外のフィールドの発生源を見る
export function cantSpiritStateBrave(board: Board, pid: PlayerId): boolean {
    for (const owner of ["p1", "p2"] as PlayerId[]) {
        if (owner === pid) continue
        for (const inst of effectSources(board, owner)) {
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "opponentCantSpiritStateBrave") continue
                if (!effectActiveOn(inst, effect, currentLevel(inst).level)) continue
                return true
            }
        }
    }
    return false
}

// globalConstraint "opponentBraveConditionMinCost"（BS21-X06 Lv2）：hostOwnerPid の側のブレイヴの合体条件に足される「コストN以上」。
// 元の条件に加えて満たす必要がある（2026-11-06 ユーザー確認）。複数の発生源があれば最も高い値。
// 「合体条件を無視して合体できる」ホストは元の条件ごと無視するので足さない（解釈は未確認＝報告事項）
export function braveExtraMinCostFor(
    board: Board,
    hostOwnerPid: PlayerId,
    host: CardInstance,
): { minCost: number; sourceOwner: PlayerId } | null {
    if (activeConstraints(board, hostOwnerPid, host).some((c) => c.type === "ignoreBraveCondition")) return null
    let found: { minCost: number; sourceOwner: PlayerId } | null = null
    for (const owner of ["p1", "p2"] as PlayerId[]) {
        if (owner === hostOwnerPid) continue
        for (const inst of effectSources(board, owner)) {
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "opponentBraveConditionMinCost") continue
                if (!effectActiveOn(inst, effect, currentLevel(inst).level)) continue
                noteCoverage(effect, "globalConstraint")
                if (found === null || effect.constraint.minCost > found.minCost) found = { minCost: effect.constraint.minCost, sourceOwner: owner }
            }
        }
    }
    return found
}

// globalConstraint "coresToOpponentReserveGoToTrash"（BS12-X02魔羯邪神シュタイン・ボルグLv2-3）:
// 「スピリット/ブレイヴ/マジックの効果で相手のリザーブに置かれるコアすべては相手のトラッシュに置かれる」。
// targetPid は「コアが向かうプレイヤー」。targetPid から見て発生源が「相手」である側だけを見る（両陣営の発生源が効く＝主語なし）。
// sourceType（コア移動を引き起こした効果の種別）がspirit/brave/magicのいずれでもなければ判定するまでもなく false
// （ネクサスの効果・undefined＝バトル敗北や場を離れるとき等のルール処理は対象外）
export function coresToOpponentReserveGoToTrash(
    board: Board,
    targetPid: PlayerId,
    sourceType: CardType | undefined,
): boolean {
    if (sourceType !== "spirit" && sourceType !== "brave" && sourceType !== "magic") return false
    for (const owner of ["p1", "p2"] as PlayerId[]) {
        if (owner === targetPid) continue
        for (const inst of effectSources(board, owner)) {
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "coresToOpponentReserveGoToTrash") continue
                if (!effectActiveOn(inst, effect, currentLevel(inst).level)) continue
                return true
            }
        }
    }
    return false
}

// リフレッシュステップで合体していないスピリットを1体しか回復できないか（両陣営の発生源を見る。回復の禁止は cantRefresh.ts）
export function refreshRestrictionsFor(board: Board): { onlyOneUncombined: boolean } {
    const result = { onlyOneUncombined: false }
    for (const owner of ["p1", "p2"] as PlayerId[]) {
        for (const inst of effectSources(board, owner)) {
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (!effectActiveOn(inst, effect, currentLevel(inst).level)) continue
                if (effect.constraint.type === "refreshOnlyOneUncombined") result.onlyOneUncombined = true
            }
        }
    }
    return result
}

// フィールド全体制約 costCantAct（両陣営）：コストがmaxCost以下（またはcostsに完全一致）のスピリットは
// アタック/ブロックができない（BS05白夜の虚空Lv1=maxCost1、青嵐の虚空Lv1=maxCost2、BS02グレートウォール=costs[6,8]）。
// hasGlobalConstraintの単純boolean判定と異なり、具体的なしきい値を比較する必要があるため専用の判定関数にする。
// このconst自体は単一のコスト値を受け取る低レベル判定。場のインスタンスに対して呼ぶ場合は
// 付与コストも考慮する instCostCantAct を使うこと
export function costCantAct(board: Board, cost: number): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果）も含める
        for (const inst of effectSources(board, pid)) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "costCantAct") continue
                if (!entryActive(board, pid, inst, effect, level)) continue
                const { maxCost, costs } = effect.constraint
                if (costs !== undefined ? costs.includes(cost) : maxCost !== undefined && cost <= maxCost) {
                    noteCoverage(effect, "globalConstraint")
                    return true
                }
            }
        }
    }
    return false
}

// フィールド上のインスタンスに対する「全体制約による行動不可」判定。実コストに加えて、道化師クランの
// tempAlsoCosts／alsoCostsContinuous（「コストNとしても扱う」）のいずれかが該当すれば行動不可とする。
// **コスト条件（costCantAct）に加えてレベル条件（levelCantAct）も見る**
// （アタック可否／ブロック可否／mustAttack対象判定はこちらを使うこと。名前は歴史的にコスト由来だが、
//  サーバーとクライアントの唯一の入口なので、新しい行動不可の軸はここへ足して両者を同時に揃える）
export function instCostCantAct(board: Board, inst: CardInstance): boolean {
    if (instAllCosts(inst).some((cost) => costCantAct(board, cost))) return true
    return levelCantAct(board, currentLevel(inst).level)
}

// BS12-X05戦神乙女ヴィエルジェ：発生源の持ち主から見た**相手**のスピリットのうち、コストが
// 配列のいずれかと完全一致するものはアタックできない（ブロックは可能。片側限定。cantSpiritStateBraveと同じ
// 「相手側だけを見る」パターン）
export function instCantAttackByOpponentCost(board: Board, attackerPid: PlayerId, inst: CardInstance): boolean {
    const opp = attackerPid === "p1" ? "p2" : "p1"
    const attackerCosts = instAllCosts(inst)
    for (const source of effectSources(board, opp)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            const constraint = effect.constraint
            if (constraint.type !== "opponentCantAttackByCost" && constraint.type !== "opponentCantAttackByCores") continue
            if (!entryActive(board, opp, source, effect, level)) continue
            // phase/turn指定時は発生源の持ち主(opp)基準でのステップ限定（BS14-053オリンピアの天使ハギトLv2：『相手のアタックステップ』＝opp視点では"opponent"）
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (
                effect.turn !== undefined &&
                effect.turn !== "both" &&
                (effect.turn === "own") !== (board.turnPlayer === opp)
            )
                continue
            if (constraint.type === "opponentCantAttackByCores" ? inst.cores === constraint.cores : attackerCosts.some((cost) => constraint.costs.includes(cost))) {
                noteCoverage(effect, "globalConstraint")
                return true
            }
        }
    }
    return false
}

// 期間つき効果（playerRule "cantAttackByCostForPid"）：コストが配列のいずれかと一致するこのプレイヤーの
// スピリットはアタックできない（ブロックは可能。globalConstraint opponentCantAttackByCost と同じ判定の期間つき版）
export function timedCantAttackByCost(board: Board, pid: PlayerId, inst: CardInstance): boolean {
    return timedPlayerRules(board, pid).some((r) => r.type === "cantAttackByCostForPid" && instAllCosts(inst).some((cost) => r.costs.includes(cost)))
}

// 器AW：globalConstraint "cantAttackByCost"（両陣営）：コストが配列のいずれかと完全一致するスピリットは
// 持ち主を問わずアタックできない（ブロックは可能。opponentCantAttackByCostの両陣営版。BS13-035オリンピアの天使オク）
export function instCantAttackByCost(board: Board, inst: CardInstance): boolean {
    const costsOfAttacker = instAllCosts(inst)
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                const constraint = effect.constraint
                if (constraint.type !== "cantAttackByCost") continue
                if (!entryActive(board, pid, source, effect, level)) continue
                // phase/turn指定時は発生源の持ち主(pid)基準でのステップ限定（instCantAttackByOpponentCostと同じ読み）
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                if (
                    effect.turn !== undefined &&
                    effect.turn !== "both" &&
                    (effect.turn === "own") !== (board.turnPlayer === pid)
                )
                    continue
                // condition.ownSpiritMatches：持ち主のフィールドにこの絞り込みに合うスピリットがいる間だけ有効
                const matches = effect.condition?.ownSpiritMatches
                if (matches !== undefined && !board.players[pid].field.spirits.some((s) => matchesTarget(board, pid, s, matches, source.instanceId))) continue
                if (costsOfAttacker.some((cost) => constraint.costs.includes(cost))) {
                    noteCoverage(effect, "globalConstraint")
                    return true
                }
            }
        }
    }
    return false
}

// globalConstraint "cantBlockByCost"（両陣営）：コストが配列のいずれかと完全一致するスピリットは
// 持ち主を問わずブロックできない（アタックは可能。instCantAttackByCostのブロック版。BS17-071）
export function instCantBlockByCost(board: Board, inst: CardInstance): boolean {
    const costsOfBlocker = instAllCosts(inst)
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                const constraint = effect.constraint
                if (constraint.type !== "cantBlockByCost") continue
                if (!entryActive(board, pid, source, effect, level)) continue
                if (costsOfBlocker.some((cost) => constraint.costs.includes(cost))) return true
            }
        }
    }
    return false
}

// 器BM：globalConstraint "attackRequiresCoreToll"（両陣営）：コストがmaxCost以下のスピリットが
// アタックするとき、持ち主のリザーブのコア1個を持ち主のトラッシュに置かなければアタックできない。
// instCantAttackByCostと同じ両陣営走査だが、こちらは「不可」でなく「要求」を返す判定なので専用関数にする
// （BS13-043鳥人イカロッシュ）
export function instAttackRequiresCoreToll(board: Board, attackerPid: PlayerId, inst: CardInstance): boolean {
    const costsOfAttacker = instAllCosts(inst)
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                const constraint = effect.constraint
                if (constraint.type !== "attackRequiresCoreToll") continue
                if (!entryActive(board, pid, source, effect, level)) continue
                // side:"opponent"指定時は発生源の持ち主(pid)から見た相手のアタックだけ
                if (constraint.side === "opponent" && attackerPid === pid) continue
                // phase/turn指定時は発生源の持ち主(pid)基準（attackPayTollCountと同じ読み）
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                if (
                    effect.turn !== undefined &&
                    effect.turn !== "both" &&
                    (effect.turn === "own") !== (board.turnPlayer === pid)
                )
                    continue
                const maxCost = constraint.maxCost
                if (maxCost !== undefined && !costsOfAttacker.some((cost) => cost <= maxCost)) continue
                if (constraint.filter !== undefined && !matchesTarget(board, attackerPid, inst, constraint.filter, source.instanceId)) continue
                return true
            }
        }
    }
    return false
}

// attackPayToll（26RSD06-011）：発生源の持ち主から見た相手のスピリットが、アタックのためにリザーブからトラッシュへ置くコア数。
// 〔重複不可〕は同じカード名の発生源を1回分に数える
export function attackPayTollCount(board: Board, attackerPid: PlayerId, inst: CardInstance): number {
    const sourcePid: PlayerId = attackerPid === "p1" ? "p2" : "p1"
    const level = currentLevel(inst).level
    const counted = new Set<string>()
    let total = 0
    for (const source of effectSources(board, sourcePid)) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== "attackPayToll") continue
            if (!entryActive(board, sourcePid, source, effect, sourceLevel)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "opponent" && board.turnPlayer === sourcePid) continue
            if (effect.turn === "own" && board.turnPlayer !== sourcePid) continue
            if (effect.constraint.attackerLevel !== level) continue
            if (effect.constraint.noStack) {
                const key = card(source.cardId).name
                if (counted.has(key)) continue
                counted.add(key)
            }
            total += effect.constraint.count
        }
    }
    return total
}

// アタックの宣言でリザーブからトラッシュへ置くコアの合計（attackRequiresCoreToll の1個と attackPayToll）
export function attackTollTotal(board: Board, attackerPid: PlayerId, inst: CardInstance): number {
    return (instAttackRequiresCoreToll(board, attackerPid, inst) ? 1 : 0) + attackPayTollCount(board, attackerPid, inst)
}

// 器BV：globalConstraint "cantAttackIfFewOwnSpirits"（両陣営それぞれ独立に判定）：
// attackerPid のフィールドのスピリット数がatMost体以下ならアタックできない（BS13-071巨人港）
export function instCantAttackByFewOwnSpirits(board: Board, attackerPid: PlayerId, inst: CardInstance): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                const constraint = effect.constraint
                if (constraint.type !== "cantAttackIfFewOwnSpirits") continue
                if (!entryActive(board, pid, source, effect, level)) continue
                if (board.players[attackerPid].field.spirits.length <= constraint.atMost) return true
            }
        }
    }
    return false
}

// 器BO：globalConstraint "opponentCantReturnFromTrashToHand"。pid は「トラッシュから手札に戻そうとしている本人」。
// cantSpiritStateBraveと同じ「発生源の持ち主から見た相手だけに効く」パターン（BS13-044吟遊詩人のオルフェLv2）
export function opponentCantReturnFromTrashToHand(board: Board, pid: PlayerId): boolean {
    for (const owner of ["p1", "p2"] as PlayerId[]) {
        if (owner === pid) continue
        for (const inst of effectSources(board, owner)) {
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "opponentCantReturnFromTrashToHand") continue
                if (!effectActiveOn(inst, effect, currentLevel(inst).level)) continue
                return true
            }
        }
    }
    return false
}

// フィールド全体制約 levelCantAct（両陣営）：currentLevel が指定リストに含まれるスピリットは
// アタックとブロックができない（costCantAct のレベル版。BS07腐りゆく湖沼Lv2＝Lv1）
export function levelCantAct(board: Board, level: number): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of effectSources(board, pid)) {
            const sourceLevel = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "levelCantAct") continue
                if (!entryActive(board, pid, inst, effect, sourceLevel)) continue
                if (effect.constraint.levels.includes(level)) return true
            }
        }
    }
    return false
}

// このアタックで、防御側のライフが1回に減る**上限**を返す唯一の入口。
// 0＝減らない／Infinity＝制限なし。実際の減少量は Math.min(アタッカーのシンボル数, max)。
//
// **「減るか／減らないか」ではなく値で返す**のが要点（2026-08-16 ユーザー提案）。
// 「〇しか減らない」「減らない」は lifeGuard の max として合流する。今後この種の効果が増えてもここに集まる。
// クライアントが「このアタックはライフに通るか」を判定するのにも使える（純粋な述語なので shared に置ける）。
//
// ⚠️ **副作用のあるものはここに入れない**。
//    六花の司書長サーガ（ライフの代わりにデッキを破棄する）と、GameState 依存の
//    hasLifeDamageNegate は、呼び出し側（GameEngine.resolveLifeDamage）が別に見る
export function lifeDamageLimit(
    board: Board,
    defenderPid: PlayerId,
    attacker: CardInstance,
): { max: number; reason?: string } {
    // 硝子の女神フレイア／ミストカーテン：このアタッカーのダメージそのものが打ち消されている
    if (attacker.lifeDamageNegatedFor === defenderPid) {
        return { max: 0, reason: "このアタックのライフダメージは打ち消されている" }
    }
    // BS08空帝竜騎プラチナム：アタッカーの実効BPが発生源以下なら減らない
    if (protectedByBpUpToSelf(board, defenderPid, attacker)) {
        return { max: 0, reason: "BP条件によりライフが減らない" }
    }
    // 不減・下限・1回／スピリット1体ごとの上限は lifeGuard が持ち、lifeLossAllowed が畳む。amount 無限＝「いくつまで減らせるか」
    const max = lifeLossAllowed(board, { pid: defenderPid, amount: Number.POSITIVE_INFINITY, cause: "attack", actorPid: (defenderPid === "p1" ? "p2" : "p1"), sourceInstance: attacker })
    if (max === 0) return { max, reason: "このターンはライフが減らない" }
    if (Number.isFinite(max)) return { max, reason: `このターンはライフが${max}しか減らない` }
    return { max }
}


export interface LifeLossQuery {
    pid: PlayerId // ライフが減る側
    amount: number // 減らしたい量（上限を調べるだけなら Infinity）
    cause: "attack" | "effect" | "cost"
    actorPid: PlayerId
    sourceType?: CardType | undefined
    sourceInstance?: CardInstance | undefined // アタッカー、または効果・コストの発生源。スピリットのときだけ「1体から」の上限に数える
    floor?: number | undefined // この効果だけの下限（neverZero）
}

// ライフを減らす処理の制限を1か所に集めた問い合わせ。0〜amount の「減らせる量」を返す。
// アタックだけの制限（打ち消し・コスト条件・BP条件・1回あたりの上限）は lifeDamageLimit が持つ。
// 原因を問わず効く扱いは EFFECT_GATE §4 の 4（2026-10-30 ユーザー確認）
export function lifeLossAllowed(board: Board, q: LifeLossQuery): number {
    const { pid } = q
    if (q.actorPid !== pid && cantReduceOpponentLife(board, q.actorPid)) return 0
    // noLifeDamage の includeEffects（BS19-106）：減らしに来た効果の発生源が「アタック/効果では減らない」を
    // 指定されたスピリットそのもののときは減らせない
    if (q.cause === "effect" && q.actorPid !== pid && q.sourceInstance?.lifeDamageEffectsNegatedFor === pid) return 0
    const guard = lifeGuardBounds(board, q)
    let allowed = Math.min(q.amount, guard.max)
    let floor = Math.max(q.floor ?? 0, guard.floor)
    // 「このネクサスをトラッシュに置くことで0を回避」型は、ライフを払って0にするコストだけは止める（COST_MODEL §9）
    if (q.cause === "cost") floor = Math.max(floor, ownLifeFloorByCostSelfToTrash(board, pid))
    if (floor > 0) allowed = Math.min(allowed, Math.max(0, board.players[pid].life - floor))
    // 期間つきの「自分のライフはそれから N しか減らされない」（26RBS03-079）。lifeGuard の per:"spirit" と同じ lifeDealtThisTurn で数える
    const spirit = q.sourceInstance && card(q.sourceInstance.cardId).type === "spirit" ? q.sourceInstance : undefined
    if (spirit?.lifeCapThisTurn !== undefined) allowed = Math.min(allowed, Math.max(0, spirit.lifeCapThisTurn - (spirit.lifeDealtThisTurn?.[pid] ?? 0)))
    return allowed
}

// ownLifeFloor（costSelfToTrash 版。BS14-084）：ダメージ計算の時点で下限として効くと、コストを払わずに0回避が成立してしまうので、
// ライフを払って0にするコストだけを止める。実際の0回避は tryOwnLifeFloorByCost が life<=0 の判定直後に任意コスト付きで処理する
function ownLifeFloorByCostSelfToTrash(board: Board, pid: PlayerId): number {
    let floor = 0
    for (const source of effectSources(board, pid)) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== "ownLifeFloor") continue
            if (!entryActive(board, pid, source, effect, currentLevel(source).level)) continue
            floor = Math.max(floor, effect.constraint.floor)
        }
    }
    return floor
}

// attackerPid は「ライフを減らそうとしている側」。その持ち主のフィールドに
// cantReduceOpponentLifeWhileSelfRefreshed を持つ**回復状態の**発生源があれば減らせない（BS11-X06 Lv3）
export function cantReduceOpponentLife(board: Board, attackerPid: PlayerId): boolean {
    for (const inst of effectSources(board, attackerPid)) {
        if (inst.isRested) continue
        for (const effect of card(inst.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "cantReduceOpponentLifeWhileSelfRefreshed") continue
            if (!effectActiveOn(inst, effect, currentLevel(inst).level)) continue
            return true
        }
    }
    return false
}

// このターンだけの強制アタック（timedEffect の内容 mustAttack）が、恒久的な constraint:"mustAttack" と同じ扱いで掛かっているか
export function mustAttackThisTurn(board: Board, _pid: PlayerId, inst: CardInstance): boolean {
    return timedContentsOn(board, inst).some((c) => c.type === "mustAttack")
}

// 「このステップの最初に必ずアタックする」（until:"firstAttack"）を受けているか。受けている間は他のスピリットでアタックできない
export function mustAttackFirst(board: Board, inst: CardInstance): boolean {
    return board.timedEffects.some(
        (r) =>
            r.until === "firstAttack" &&
            r.target.kind === "instance" &&
            r.target.instanceId === inst.instanceId &&
            r.content.some((c) => c.type === "mustAttack"),
    )
}

// このターンだけの疲労状態ブロック許可（timedEffect の内容 canBlockWhileRested。constraint:"canBlockWhileRested" のターン付与版）
export function canBlockWhileRestedThisTurn(board: Board, _pid: PlayerId, inst: CardInstance): boolean {
    return timedContentsOn(board, inst).some((c) => c.type === "canBlockWhileRested")
}

// constraint:"protectOwnLifeByBpUpToSelf"（BS08空帝竜騎プラチナム）：ブロックされなかったアタッカーの
// 実効BPが、defenderPid の場にいるこの制約持ちスピリット自身の実効BP以下のとき、そのアタックでは
// defenderPid のライフが減らない（片側のみ）。ライフダメージ直前（resolveLifeDamage）から呼ぶ
export function protectedByBpUpToSelf(
    board: Board,
    defenderPid: PlayerId,
    attacker: CardInstance,
): boolean {
    const attackerPid: PlayerId = board.players.p1.field.spirits.includes(attacker) ? "p1" : "p2"
    const attackerBp = effectiveBp(board, attackerPid, attacker)
    return board.players[defenderPid].field.spirits.some(
        (inst) =>
            attackerBp <= effectiveBp(board, defenderPid, inst) &&
            activeConstraints(board, defenderPid, inst).some((c) => c.type === "protectOwnLifeByBpUpToSelf"),
    )
}

// フィールド全体制約 noOpponentTriggerByColor（片側のみ）：発生源の持ち主から見た**相手**の、
// 指定色のスピリットの、指定した『〇〇時』効果は発揮されない（SD01-031 朝焼け岬Lv2＝紫の『召喚時』『破壊時』）。
// ownerPid はこれから誘発しようとしているスピリットの持ち主。その**相手**のフィールドだけを走査する。
// fireTrigger の入口から呼ぶため、封じられるのは『』でカテゴライズされた効果（kind:"triggered"）だけで、
// ネクサスの常在効果による reviveOnDestroy は対象にならない（docs/design/CONJUNCTION.md）
export function noOpponentTriggerByColor(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    event: TriggerEvent,
): boolean {
    // BS15共通器：bothSides指定のエントリは、発生源がinst自身と同じ陣営にあっても効く
    // （主語の無い効果文＝両陣営対象。BS15-072渦巻く大海峡Lv2）。既定（bothSidesなし）は従来どおり
    // 「ownerPidから見た相手」の発生源だけを見る
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const isOpponentSide = pid !== ownerPid
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "noOpponentTriggerByColor") continue
                if (!isOpponentSide && effect.constraint.bothSides !== true) continue
                if (!entryActive(board, pid, source, effect, level)) continue
                if (effect.whileOwnBurstSet === true && !board.players[pid].burstSet) continue
                if (!effect.constraint.triggers.includes(event)) continue
                if (effect.constraint.color !== undefined && !instHasColor(inst, effect.constraint.color)) continue
                noteCoverage(effect, "globalConstraint")
                return true
            }
        }
    }
    return false
}

// フィールド全体制約 noSummonTriggerByCost（両陣営）：コストがmaxCost以下のスピリットの
// 『このスピリットの召喚時』効果は発揮されない（BS08共鳴する音叉の塔）。召喚時トリガーの発火直前に判定する
export function noSummonTriggerByCost(board: Board, inst: CardInstance, instOwnerPid?: PlayerId): boolean {
    // 器AU：endStepLock("summonTrigger")。BS13-081ドリームシール「『自分のエンドステップ』を3回行うまで、
    // 『このスピリットの召喚時』効果は発揮されない」（お互い＝両陣営。BS13_PLAN.md §1 #21と同じ書き分け）
    if (isEndStepLocked(board, "summonTrigger")) return true
    const costs = instAllCosts(inst)
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "noSummonTriggerByCost") continue
                if (!entryActive(board, pid, source, effect, level)) continue
                // side:"opponent"指定時は、発生源の持ち主から見た相手（instOwnerPid）のスピリット/ブレイヴだけを止める
                // （BS14-088青玉の巨大迷宮Lv2。instOwnerPidが分からなければ安全側＝止めない）
                if (effect.constraint.side === "opponent" && (instOwnerPid === undefined || instOwnerPid === pid)) {
                    continue
                }
                // エントリに区間の指定（phase / turn）があれば、その区間でだけ効く
                // （BS11-072 は『相手のメインステップ』限定。coreFloorFor と同じ見方）
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                if (effect.turn === "own" && pid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && pid === board.turnPlayer) continue
                const { maxCost } = effect.constraint
                // maxCost 省略時はコストを問わずすべて止める
                if (maxCost === undefined || costs.some((cost) => cost <= maxCost)) return true
            }
        }
    }
    return false
}

// フィールド全体制約 noReductionBySummonCost（両陣営）：コストがmaxCost以下のスピリットカードを
// 召喚するとき、軽減シンボルによるコスト軽減ができなくなる（BS08超時空重力炉）。
// **カード静的なコスト**（軽減前の値）で判定する。effectiveCost（shared/cost.ts）から呼ぶ
export function noReductionBySummonCost(board: Board, staticCost: number): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "noReductionBySummonCost") continue
                if (!entryActive(board, pid, source, effect, level)) continue
                if (staticCost <= effect.constraint.maxCost) return true
            }
        }
    }
    return false
}

// ⚠️ **これは boardResistanceAgainst の内部実装**。個別に呼ぶと他の耐性軸が抜けるので、
// 効果が届くかを判定したい箇所は resistanceAgainst（サーバー）か boardResistanceAgainst を通すこと。
export function hasMagicImmunity(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
): boolean {
    return hasImmunityAgainst(board, ownerPid, inst, "magic")
}

// 発生源の持ち主の familyFilter/colorFilter 一致スピリットは、相手の効果によるバウンス
// （returnToHand/returnToHand{all}）を受けない（kind:"immunityGrant" against:"bounce"。BS06恐竜姫ジュラ）。
// 呼び出し側（bounce.tsのバウンスガード）は自分自身の効果には適用しない（対象の持ち主==効果の持ち主なら呼ばない）
// ⚠️ **これは boardResistanceAgainst の内部実装**。個別に呼ぶと他の耐性軸が抜けるので、
// 効果が届くかを判定したい箇所は resistanceAgainst（サーバー）か boardResistanceAgainst を通すこと。
export function hasBounceImmunity(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    sourceType?: CardType,
    // "deck"＝デッキの上/下へ戻す効果への問い合わせ。toDeck 無しの耐性（手札限定）はここで弾かれる
    to?: "hand" | "deck",
): boolean {
    return hasImmunityAgainst(board, ownerPid, inst, "bounce", sourceType, to)
}

// hasMagicImmunity / hasBounceImmunity 共通の判定本体（kind:"immunityGrant" の against で分岐）
function hasImmunityAgainst(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    against: "magic" | "bounce",
    sourceType?: CardType,
    to?: "hand" | "deck",
): boolean {
    const player = board.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "immunityGrant") continue
            if (effect.against !== against) continue
            if (to === "deck" && effect.toDeck !== true) continue
            if (effect.sourceTypes !== undefined && sourceType !== undefined && !effect.sourceTypes.includes(sourceType)) continue
            if (!entryActive(board, ownerPid, source, effect, sourceLevel)) continue
            if (effect.phaseTurn) {
                if (board.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && ownerPid !== board.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && ownerPid === board.turnPlayer) continue
            }
            // target:"self"＝**発生源自身だけ**（「このスピリットは〜受けない」。SD01-005 タルタルガー）
            if (effect.target === "self" && inst.instanceId !== source.instanceId) continue
            // familyFilter一致（配列＝OR。matchesFamilyFilterで判定） ‖ includeSelf指定時は発生源自身も対象
            // （BS05白亜の竜使いアルブス：自身は対象系統を持たないが対象に含む）
            if (effect.familyFilter !== undefined) {
                const familyOk = matchesFamilyFilter(board, ownerPid, inst, effect.familyFilter)
                const selfOk = effect.includeSelf === true && inst.instanceId === source.instanceId
                if (!familyOk && !selfOk) continue
            }
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) continue
            // keywordFilter（BS09-055転生の谷Lv2＝【転召】持ち）
            if (effect.keywordFilter && !spiritHasKeyword(board, ownerPid, inst, effect.keywordFilter)) continue
            // combinedFilter（BS10-079そびえる机山群Lv2＝合体スピリットのみ）
            if (effect.combinedFilter === true && !instIsCombined(inst)) continue
            // vanillaFilter（BS12-071未完成の古代戦艦：帆＝効果の記述を持たないスピリットのみ）
            if (effect.vanillaFilter === true && !instIsVanilla(inst)) continue
            if (effect.nameIncludes !== undefined && !effect.nameIncludes.some((n) => cardNameContains(inst, n))) continue
            if (effect.condition) {
                const { cost, count } = effect.condition.ownCostCountAtLeast
                // 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る（instHasCost）
                const matchCount = countSpiritsWeighted(
                    board,
                    ownerPid,
                    ownerPid,
                    (s) => instHasCost(s, cost),
                    card(source.cardId).type,
                )
                if (matchCount < count) continue
            }
            noteCoverage(effect, "immunityGrant")
            return true
        }
    }
    return false
}

// この個体にいま掛かっている期間つき効果の内容（docs/design/TIMED_EFFECTS.md）。1体指定と「すべて」の両方を追加順に返す。
// 「すべて」は判定のたびに照合するので、効果の解決後に場に出たスピリットにも効く（2026-09-24 ユーザー確認）
export function hasTimedUnblockable(board: Board, inst: CardInstance): boolean {
    return timedContentsOn(board, inst).some((c) => c.type === "unblockable")
}

export function timedContentsOn(board: Board, inst: CardInstance): TimedContent[] {
    return timedRecordsOn(board, inst).flatMap((r) => r.content)
}

// 記録を出した側（ownerPid）が要る判定のために、当たった記録そのものを記録順で返す
export function timedRecordsOn(board: Board, inst: CardInstance): Board["timedEffects"] {
    const p1 = board.players.p1.field
    const pid: PlayerId = p1.spirits.includes(inst) || p1.nexuses.includes(inst) ? "p1" : "p2"
    // 「〜のスピリットすべて」の記録はスピリットにだけ当たる（ネクサスは1体指定の記録でだけ受ける）
    const isSpirit = board.players[pid].field.spirits.includes(inst)
    return board.timedEffects.filter((r) => {
        const t = r.target
        return t.kind === "instance"
            ? t.instanceId === inst.instanceId
            : t.kind === "braveHost"
              ? bravesOf(board.players[pid], inst).some((b) => b.instanceId === t.braveInstanceId)
              : t.kind === "rule" && isSpirit && (t.pid === undefined || t.pid === pid) && matchesTarget(board, pid, inst, t.filter, t.selfInstanceId)
    })
}

// この個体に期間つき効果で与えられたキーワード（colors＝【装甲】の色）
export function timedKeywords(board: Board, inst: CardInstance): { keyword: Keyword; colors?: Color[] }[] {
    return timedContentsOn(board, inst).flatMap((c) => (c.type === "keyword" ? [c] : []))
}

// このプレイヤーに掛かっている期間つき効果の内容
export function timedContentsFor(board: Board, pid: PlayerId): TimedContent[] {
    const open = isBeforeBlockWindow(board)
    return board.timedEffects.flatMap((r) =>
        r.target.kind === "player" && r.target.pid === pid && (r.until !== "beforeBlock" || open) ? r.content : [],
    )
}

// ブロック宣言前のフラッシュタイミングか。ブロックされずにライフで受ける場合はその場でバトルが終わるので、
// battle があって blockerInstanceId が空の間がそのまま「ブロック前」になる
export function isBeforeBlockWindow(board: Board): boolean {
    return !!board.battle && board.battle.blockerInstanceId === null
}

// 手札のカードを使えない期間つき制約（cantUseHandCardsForPid）に掛かるか。掛かるなら理由、掛からなければ null
export function handCardBanned(board: Board, pid: PlayerId, cardId: string): string | null {
    const data = card(cardId)
    for (const c of timedPlayerRules(board, pid)) {
        if (c.type !== "cantUseHandCardsForPid") continue
        if (c.cardType !== undefined && data.type !== c.cardType) continue
        if (c.minCost !== undefined && data.cost < c.minCost) continue
        if (c.allowedColor !== undefined && data.colors.includes(c.allowedColor)) continue
        // bannedColors は置く時点（timedEffect.ts）で"last"を具体色へ解決済みなので、ここでは配列のみ来る
        if (Array.isArray(c.bannedColors) && !c.bannedColors.some((col) => data.colors.includes(col))) continue
        return "効果により、このカードは使えません"
    }
    return null
}

// useWindow:"beforeBlock" のマジックを、いまの場面で使えるか。使えないなら理由
export function magicUseWindowDenial(board: Board, pid: PlayerId, cardId: string, useTiming: "main" | "flash"): string | null {
    const entries = card(cardId).effects.filter((e) => e.kind === "magic" && e.timing === useTiming)
    if (entries.length === 0 || !entries.every((e) => e.kind === "magic" && e.useWindow === "beforeBlock")) return null
    const attackerId = board.battle?.attackerInstanceId
    const attackerPid = board.players.p1.field.spirits.some((s) => s.instanceId === attackerId) ? "p1" : "p2"
    if (!isBeforeBlockWindow(board) || attackerPid === pid) return "このマジックは相手のアタックのブロック前のフラッシュタイミングでしか使用できません"
    return null
}

// このプレイヤーに掛かっている「このターンの間」の制約
export function timedPlayerRules(board: Board, pid: PlayerId): PlayerRuleDef[] {
    return timedContentsFor(board, pid).flatMap((c) => (c.type === "playerRule" && (c.activeWhile === undefined || handSizeOf(board.players[pid]) >= c.activeWhile.handAtLeast) ? [c.rule] : []))
}

// このバトルの解決方法（比べるもの・勝敗の逆転）
export function timedBattleContents(board: Board): TimedContent[] {
    return board.timedEffects.flatMap((r) => (r.target.kind === "battle" ? r.content : []))
}

// 期間つき効果で、このバトルの間フラッシュで手札のカードを使えないか
export function timedFlashLocked(board: Board, pid: PlayerId): boolean {
    return timedContentsFor(board, pid).some((c) => c.type === "battleLock" && c.lock === "flash")
}

// 期間つき効果で、このマジックの色が使用禁止か（cantUseMagicForPid。手札・手元・トラッシュなど使用元は問わない）
// 色・コストの禁止は使うたびに見る（ユーザー確認 2026-10-31）。cost は印刷コスト
export function magicColorBanned(board: Board, pid: PlayerId, colors: Color[], cost?: number): boolean {
    const foe: PlayerId = pid === "p1" ? "p2" : "p1"
    // globalConstraint "magicOnlyOwnFieldSymbolColors"（BS19-112）：それぞれの自分のフィールドのシンボルと
    // 同じ色のマジックしか使えない。両陣営に効くので、ここから見た自分側（pid）のフィールドで判定する
    if (hasGlobalConstraint(board, "magicOnlyOwnFieldSymbolColors") && !colors.some((c) => ownFieldSymbolColors(board, pid).has(c))) return true
    return timedPlayerRules(board, pid).some((r) => {
        if (r.type !== "cantUseMagicForPid") return false
        if (Array.isArray(r.colors) && r.colors.some((c) => colors.includes(c))) return true
        if (r.allowColors === "opponentFieldSymbols" && !colors.some((c) => ownFieldSymbolColors(board, pid).has(c))) return true
        if (cost === undefined || r.costs === undefined) return false
        const banned = r.costs === "ownerRestedNexuses" ? board.players[foe].field.nexuses.filter((n) => n.isRested).map((n) => card(n.cardId).cost) : r.costs
        return banned.includes(cost)
    })
}

// 期間つき効果で、このバトルの間マジックを使用できないか（BS16-X06）。バースト発動は「使用」ではない
export function timedMagicLocked(board: Board, pid: PlayerId): boolean {
    return timedContentsFor(board, pid).some((c) => c.type === "battleLock" && c.lock === "magic")
}

// 期間つき効果でアタック／ブロックできないか
export function cantActByTimed(board: Board, inst: CardInstance, act: "attack" | "block" = "attack"): boolean {
    const needed = act === "attack" ? "cantAttack" : "cantBlock"
    return timedContentsOn(board, inst).some((c) => c.type === needed)
}


// globalConstraint の phase／turn 窓。turn は発生源の持ち主(ownerPid)基準
function globalConstraintWindowOpen(board: Board, effect: { phase?: string; turn?: "own" | "opponent" | "both" }, ownerPid: PlayerId, phase: string = board.phase): boolean {
    if (effect.phase !== undefined && phase !== effect.phase) return false
    if (effect.turn !== undefined && effect.turn !== "both" && (effect.turn === "own") !== (board.turnPlayer === ownerPid)) return false
    return true
}

// globalConstraint "noBurstActivationByEvent"／"noBurstActivationByColor"：holderPid のバーストが発動できないか。
// burstCardId は色の軸（noBurstActivationByColor・battleLock colors）の判定に使う。省略時は色の軸を見ない
export function burstActivationForbidden(board: Board, holderPid: PlayerId, event: FieldEvent, burstCardId?: string): boolean {
    const opp: PlayerId = holderPid === "p1" ? "p2" : "p1"
    for (const source of effectSources(board, opp)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            const c = effect.constraint
            if (c.type === "noBurstActivationByEvent") {
                if (!c.events.includes(event) || !entryActive(board, opp, source, effect, level)) continue
                if (!globalConstraintWindowOpen(board, effect, opp)) continue
                if (c.whileOwnAttackerFamily !== undefined) {
                    const attacker = board.battle && board.turnPlayer === opp ? board.players[opp].field.spirits.find((s) => s.instanceId === board.battle!.attackerInstanceId) : undefined
                    if (!attacker || !matchesFamilyFilter(board, opp, attacker, c.whileOwnAttackerFamily)) continue
                }
                noteCoverage(effect, "globalConstraint")
                return true
            }
            if (c.type === "noBurstActivationByColor") {
                if (!entryActive(board, opp, source, effect, level)) continue
                if (!globalConstraintWindowOpen(board, effect, opp)) continue
                if (burstCardId === undefined || !card(burstCardId).colors.some((col) => c.colors.includes(col))) continue
                if (c.whileOwnAttackerKeyword !== undefined) {
                    const attacker = board.battle && board.turnPlayer === opp ? board.players[opp].field.spirits.find((s) => s.instanceId === board.battle!.attackerInstanceId) : undefined
                    if (!attacker || !spiritHasKeyword(board, opp, attacker, c.whileOwnAttackerKeyword)) continue
                }
                noteCoverage(effect, "globalConstraint")
                return true
            }
            if (c.type === "burstOnlyOwnFieldSymbolColors") {
                if (!entryActive(board, opp, source, effect, level)) continue
                if (!globalConstraintWindowOpen(board, effect, opp)) continue
                // 色の軸はバーストカード自身の色。burstCardId が渡せない場面では判定できないので見ない
                if (burstCardId === undefined || card(burstCardId).colors.some((col) => ownFieldSymbolColors(board, holderPid).has(col))) continue
                noteCoverage(effect, "globalConstraint")
                return true
            }
        }
    }
    return false
}

// globalConstraint "burstActivationCost"：holderPid のバースト発動にコストの支払いが課されているか（金額は server/src/logic/burstActivationFee.ts が決める）
export function burstActivationCostActive(board: Board, holderPid: PlayerId): boolean {
    const opp: PlayerId = holderPid === "p1" ? "p2" : "p1"
    for (const source of effectSources(board, opp)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== "burstActivationCost") continue
            if (!entryActive(board, opp, source, effect, level) || !globalConstraintWindowOpen(board, effect, opp)) continue
            noteCoverage(effect, "globalConstraint")
            return true
        }
    }
    return false
}

// globalConstraint "attackEffectsToll"（BS20-072 Lv2）：attackerPid の今回のアタックに効いているか。
// 効果窓（phase／turn）は発生源の持ち主基準。アタックした側がコアを置くかは攻撃側の選択なので、ここでは効いているかだけを返す
export function attackEffectsTollActive(board: Board, attackerPid: PlayerId): boolean {
    const opp: PlayerId = attackerPid === "p1" ? "p2" : "p1"
    for (const source of effectSources(board, opp)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== "attackEffectsToll") continue
            if (!entryActive(board, opp, source, effect, level)) continue
            if (!globalConstraintWindowOpen(board, effect, opp)) continue
            noteCoverage(effect, "globalConstraint")
            return true
        }
    }
    return false
}

// globalConstraint "opponentMustAttackOnce"：pid がアタックを1回もしていないのに、アタックを強いられているか。
// メインからのターン終了でもアタックステップは必ず来るので、窓の phase は "attack" として数える
// 「可能ならば」は canDeclare（実際のアタック宣言が通るか。サーバーは validateAttack）で判定する。指定先の絞り込み・指定不可・コア不足の拒否もこれで含まれ、詰みを作らない
export function mustAttackOnceBlocksEnd(board: Board, pid: PlayerId, canDeclare: (inst: CardInstance, targetId?: string) => boolean): boolean {
    if (board.attacksThisTurn > 0 || board.turn === 1 || (board as { extraMainStep?: boolean; secondMainStep?: boolean }).extraMainStep || (board as { secondMainStep?: boolean }).secondMainStep || isEndStepLocked(board, "attackStep")) return false
    const opp: PlayerId = pid === "p1" ? "p2" : "p1"
    let hit: unknown = null
    for (const source of effectSources(board, opp)) {
        const level = currentLevel(source).level
        hit = card(source.cardId).effects.find(
            (e) =>
                e.kind === "globalConstraint" &&
                e.constraint.type === "opponentMustAttackOnce" &&
                entryActive(board, opp, source, e, level) &&
                globalConstraintWindowOpen(board, e, opp, "attack"),
        )
        if (hit) break
    }
    if (!hit) return false
    const declarable = board.players[pid].field.spirits.some(
        (s) => canDeclare(s) || mustBeAttackTargetIds(board, pid, s).some((t) => canDeclare(s, t)),
    )
    if (!declarable) return false
    noteCoverage(hit, "globalConstraint")
    return true
}

// constraint "mustBeAttackTarget"：attacker がアタックするとき指定しなければならない相手スピリットの instanceId（無ければ空）
export function mustBeAttackTargetIds(board: Board, attackerPid: PlayerId, attacker: CardInstance): string[] {
    const opp: PlayerId = attackerPid === "p1" ? "p2" : "p1"
    return board.players[opp].field.spirits
        .filter((s) =>
            activeConstraints(board, opp, s).some(
                (c) => c.type === "mustBeAttackTarget" && instMatchesCostFilter(attacker, { min: c.attackerMinCost }),
            ),
        )
        .map((s) => s.instanceId)
}
