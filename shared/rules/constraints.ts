// 制約・免疫・期間つき効果の読み取り（shared/rules.ts から分割。判定の規約は shared/rules.ts 冒頭）

import type {
    ConstraintDef,
    PlayerRuleDef,
    GlobalConstraintDef,
    CardInstance,
    CardType,
    Color,
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
import { bravesOf, currentLevel, effectActiveAtLevel, effectActiveOn, effectSources, instAllCosts, instEffectsSuppressed, instHasColor, instHasCost, instIsCombined, instIsVanilla, isVirtualSource } from "./level"
import { hasUntargetableConstraint } from "./resistance"
import { instanceSymbolCount } from "./symbols"
import { cardNameContains, matchesTarget } from "./targetFilter"

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
                        // whileOwnBurstSet：発生源の持ち主が自分のバーストをセットしている間だけ有効（docs/design/BURST.md）
                        (e.whileOwnBurstSet !== true || board.players[pid].burstSet) &&
                        // BS15共通器：condition／phaseTurn（aura.condition／aura.phaseTurnと同じ判定式。BS15-060バンディット・アームズ）
                        (e.condition === undefined || checkAuraCondition(board, pid, e.condition)) &&
                        (e.phaseTurn === undefined ||
                            (board.phase === e.phaseTurn.phase &&
                                (e.phaseTurn.turn === "both" ||
                                    (e.phaseTurn.turn === "own") === (pid === board.turnPlayer)))),
                )
                .map((e) => (e as { constraint: ConstraintDef }).constraint),
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
    // constraintGrant（夢魔の寝所Lv2）：持ち主フィールドの発生源から、ownAll/minLevel/phaseTurn条件に
    // 合致する制約を合成する（levelはinst自身の現在レベル＝minLevel判定に使う）
    const granted: ConstraintWithSource[] = []
    const sources = effectSources(board, pid)
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "constraintGrant") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            // 【合体時】：発生源自身が合体しているときだけ付与する（BRAVE.md §12.3。BS13-X006）
            if (effect.whileCombined === true && !instIsCombined(source)) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.minLevel !== undefined && level < effect.minLevel) continue
            // BS06計画された場外乱闘：系統「闘神」を持つスピリットのみに付与
            if (effect.familyFilter && !matchesFamilyFilter(board, pid, inst, effect.familyFilter)) continue
            // BS13-029剣馬グラニム：この色を持つスピリットのみに付与
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) continue
            // BS05シンクロニシティ：覚醒持ちに指定アタックを付与（静的・一時付与・継続付与を考慮）
            if (effect.keywordFilter && !spiritHasKeyword(board, pid, inst, effect.keywordFilter)) continue
            // BS05ポテンシャルパワー：バニラ（効果の記述を持たない）スピリットのみ対象
            if (effect.vanillaFilter && !instIsVanilla(inst)) continue
            // BS05最古龍の顎Lv2：シンボル2つ以上のスピリットのみ（ダブルハートの追加シンボルも数える）
            if (effect.minSymbols !== undefined && instanceSymbolCount(inst) < effect.minSymbols) continue
            // BS05天焦がす大聖火Lv2：カード名に「巨人」を含むスピリットのみ（「〜として扱う」付与名も見る）
            if (
                effect.nameIncludes !== undefined &&
                !effect.nameIncludes.some((n) => cardNameContains(inst, n))
            ) {
                continue
            }
            if (effect.phaseTurn) {
                const { phase, turn } = effect.phaseTurn
                if (board.phase !== phase) continue
                if (turn === "own" && pid !== board.turnPlayer) continue
                if (turn === "opponent" && pid === board.turnPlayer) continue
            }
            // BS10-091シャボンの湖畔Lv2：コスト2のスピリットのみ（AuraDef.costFilterと同じ意味。付与コストも見る）
            if (effect.costFilter !== undefined && !instHasCost(inst, effect.costFilter)) continue
            // AuraDef.turnと同じ意味：フェーズを問わずturn条件のみで絞る（phaseTurnのphase必須版とは別軸）
            if (effect.turn === "own" && pid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && pid === board.turnPlayer) continue
            // BS10-093時刻む花時計Lv2：合体スピリットのみ（AuraDef.combinedFilterと同じ意味）
            if (effect.combinedFilter && !instIsCombined(inst)) continue
            // colorFromChosen（BS09-081サマーソルトターン）：「指定した色」を、貸与時に選ばれた色
            // （仮想発生源の lentChoiceColor）へ解決してから積む。色が選ばれていなければ付与しない
            const c = effect.constraint
            if (c.type === "unblockableBy" && c.colorFromChosen) {
                const chosen = source.lentChoiceColor
                if (chosen === undefined) continue
                const { colorFromChosen: _flag, ...rest } = c
                granted.push({ constraint: { ...rest, colorFilter: chosen }, sourceInstanceId: source.instanceId })
                continue
            }
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
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (familyFilter !== undefined && !matchesFamilyFilter(board, pid, inst, familyFilter)) continue
            if (costFilter !== undefined && !instHasCost(inst, costFilter)) continue
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
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && pid === board.turnPlayer) continue
            if (effect.nameContains !== undefined && !cardNameContains(inst, effect.nameContains)) continue
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
            (c) => c.type === "immuneToOpponentEffects" && c.against === "brave",
        )
    }
    if (srcType !== "spirit" && srcType !== "magic") return false
    // activeConstraints は自前の kind:"constraint" だけでなく constraintGrant による範囲付与も含む
    // （BS10-091シャボンの湖畔Lv2＝「自分のコスト2のスピリットすべては」）。against指定時はそのsrcTypeのみ絞る
    return activeConstraints(board, pid, inst).some(
        (c) => c.type === "immuneToOpponentEffects" && (c.against === undefined || c.against === srcType),
    )
}
// ⚠️ 原則 boardResistanceAgainst の内部実装。**直接呼んでよいのはバトル文脈だけ**
// （【呪撃】を装甲で防ぐ判定と、reviveOnDestroy の byBattleVsArmorColor＝「装甲の色の相手に
// バトルで破壊されたとき」。どちらも『効果が届くか』ではなく装甲の色そのものを問う判定）
export function hasArmorAgainst(board: Board, inst: CardInstance, sourceColors: Color[] | undefined): boolean {
    if (sourceColors === undefined || sourceColors.length === 0) return false
    const level = currentLevel(inst).level
    const staticArmor = card(inst.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "armor" &&
            effectActiveOn(inst, e, level) &&
            (e.colors?.some((c) => sourceColors.includes(c)) ?? false),
    )
    if (staticArmor) return true
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
    return (inst.armorColorsGranted ?? []).some((c) => sourceColors.includes(c))
}

// 【重装甲】。装甲との差は**ブレイヴの効果も防ぐ**ことだけで、判定の形は hasArmorAgainst と同じ。
// ⚠️ 装甲とは別枠（KEYWORD_INCLUDES に入れない。2026-09-03 ユーザー確認。docs/design/BS12_PLAN.md §1）。
// 一時付与の重装甲は BS12 に無いので tempKeywords は見ない（必要になったら足す）
export function hasHeavyArmorAgainst(inst: CardInstance, sourceColors: Color[] | undefined): boolean {
    if (sourceColors === undefined || sourceColors.length === 0) return false
    const level = currentLevel(inst).level
    const staticHeavyArmor = card(inst.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "heavyArmor" &&
            effectActiveOn(inst, e, level) &&
            (e.colors?.some((c) => sourceColors.includes(c)) ?? false),
    )
    if (staticHeavyArmor) return true
    // 毎回算出ぶん（合体中のブレイヴが持つ静的【重装甲】のホストへの反映と、【重装甲：可変】＝colorsFrom:"selfColors"）。
    // refreshLevelAsOverrides が heavyArmorColorsGranted へ都度再構築する
    return (inst.heavyArmorColorsGranted ?? []).some((c) => sourceColors.includes(c))
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
export function hasGlobalConstraint(
    board: Board,
    type: GlobalConstraintDef["type"],
): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果。BS02グレートウォール）も含める
        for (const inst of effectSources(board, pid)) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== type) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                // whileOwnBurstSet：発生源の持ち主が自分のバーストをセットしている間だけ有効（docs/design/BURST.md）
                if (effect.whileOwnBurstSet === true && !board.players[pid].burstSet) continue
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
                if (!effectActiveAtLevel(effect.levels, level)) continue
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
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (instAllCosts(inst).some((cost) => cost <= constraint.maxCost)) return true
            }
        }
    }
    return false
}

// globalConstraint "ownLifeImmuneToSpiritEffects"（BS13-027ムーンショウウオLv2）：
// **発生源の持ち主だけ**を守る片側パターン（ownLifeFloorContinuousと同型）。pid自身のeffectSourcesだけを見る
export function ownLifeImmuneToOpponentSpiritEffects(board: Board, pid: PlayerId): boolean {
    for (const source of effectSources(board, pid)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== "ownLifeImmuneToSpiritEffects") continue
            if (effectActiveAtLevel(effect.levels, level)) return true
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
    // BS15-052天蒼元帥チョウハッカイ：お互い、効果では手札を破棄できない（ステップを問わない）
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

// リフレッシュステップの制限（BS11-X04 宝瓶神機アクア・エリシオン）。
// pid は**これから回復させるプレイヤー**。両陣営の発生源を見る:
//   onlyOneUncombined / nexuses は両者に効き、combined は「発生源の持ち主から見た相手」だけに効く
export function refreshRestrictionsFor(
    board: Board,
    pid: PlayerId,
): { onlyOneUncombined: boolean; nexuses: boolean; combined: boolean } {
    const result = { onlyOneUncombined: false, nexuses: false, combined: false }
    for (const owner of ["p1", "p2"] as PlayerId[]) {
        for (const inst of effectSources(board, owner)) {
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (!effectActiveOn(inst, effect, currentLevel(inst).level)) continue
                if (effect.constraint.type === "refreshOnlyOneUncombined") result.onlyOneUncombined = true
                else if (effect.constraint.type === "nexusesCantRefresh") result.nexuses = true
                else if (effect.constraint.type === "opponentCombinedCantRefresh" && owner !== pid) {
                    result.combined = true
                }
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
                if (!effectActiveAtLevel(effect.levels, level)) continue
                const { maxCost, costs } = effect.constraint
                if (costs !== undefined ? costs.includes(cost) : maxCost !== undefined && cost <= maxCost) {
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
            if (constraint.type !== "opponentCantAttackByCost") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // phase/turn指定時は発生源の持ち主(opp)基準でのステップ限定（BS14-053オリンピアの天使ハギトLv2：『相手のアタックステップ』＝opp視点では"opponent"）
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (
                effect.turn !== undefined &&
                effect.turn !== "both" &&
                (effect.turn === "own") !== (board.turnPlayer === opp)
            )
                continue
            if (attackerCosts.some((cost) => constraint.costs.includes(cost))) return true
        }
    }
    return false
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
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (costsOfAttacker.some((cost) => constraint.costs.includes(cost))) return true
            }
        }
    }
    return false
}

// 器BM：globalConstraint "attackRequiresCoreToll"（両陣営）：コストがmaxCost以下のスピリットが
// アタックするとき、持ち主のリザーブのコア1個を持ち主のトラッシュに置かなければアタックできない。
// instCantAttackByCostと同じ両陣営走査だが、こちらは「不可」でなく「要求」を返す判定なので専用関数にする
// （BS13-043鳥人イカロッシュ）
export function instAttackRequiresCoreToll(board: Board, inst: CardInstance): boolean {
    const costsOfAttacker = instAllCosts(inst)
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                const constraint = effect.constraint
                if (constraint.type !== "attackRequiresCoreToll") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (costsOfAttacker.some((cost) => cost <= constraint.maxCost)) return true
            }
        }
    }
    return false
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
                if (!effectActiveAtLevel(effect.levels, level)) continue
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
                if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
                if (effect.constraint.levels.includes(level)) return true
            }
        }
    }
    return false
}

// フィールド全体制約 noLifeDamageByCost（両陣営）：コストがmaxCost以下のスピリットのアタックでは
// お互いのライフが減らされない（BS07の「勇傑」各色に共通。天槍の勇者アーク等）。
// costCantAct と同じ「しきい値を比較する専用判定」の形。道化師クランの付与コストも見る（instAllCosts）
export function noLifeDamageByCost(board: Board, defenderPid: PlayerId, attacker: CardInstance): boolean {
    // keywordExclude の判定に持ち主が要る（spiritHasKeyword は付与キーワードを持ち主基準で見る）
    const attackerPid: PlayerId = board.players.p1.field.spirits.includes(attacker) ? "p1" : "p2"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果）も含める
        for (const inst of effectSources(board, pid)) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "noLifeDamageByCost") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                const { maxCost, costs, keywordExclude, maxBp, symbolCount, combinedOnly, ownOnly, attackerLevel } = effect.constraint
                // ownOnly（BS12-069定規山脈Lv2）：発生源の持ち主だけを守る（両陣営でなく片側）
                if (ownOnly && pid !== defenderPid) continue
                // symbolCount+combinedOnly（BS12-020一番槍のシベルザ）：「シンボル数がsymbolCountちょうど、
                // かつ合体スピリット」のアタックだけを保護する専用条件。maxCost等とは併用しない
                if (symbolCount !== undefined && combinedOnly) {
                    if (instanceSymbolCount(attacker) === symbolCount && instIsCombined(attacker)) return true
                    continue
                }
                // symbolCountのみ（combinedOnlyなし。BS12-069定規山脈Lv2）：シンボル数がちょうど一致するアタックのみ保護
                if (symbolCount !== undefined) {
                    if (instanceSymbolCount(attacker) === symbolCount) return true
                    continue
                }
                // keywordExclude（BS08守護機獣スノパルド：【転召】を持たない）：持っていれば保護しない
                if (keywordExclude && spiritHasKeyword(board, attackerPid, attacker, keywordExclude)) continue
                // costs はコスト完全一致（配列＝いずれか）。maxCost とは排他で、costs を優先する
                const costsOfAttacker = instAllCosts(attacker)
                if (costs) {
                    if (costsOfAttacker.some((cost) => costs.includes(cost))) return true
                    continue
                }
                // maxBp（BS09-031守護巨獣ガラパーゾ＝BP3000以下のアタック）：コストでなく実効BPで縛る形
                if (maxBp !== undefined && effectiveBp(board, attackerPid, attacker) <= maxBp) return true
                // attackerLevel（器BA）：maxCostと**両方**満たすときだけ保護する（BS13-070：コスト3以下かつLv1）。
                // maxCost省略時はLvだけで判定する（BS14-110天災之禍風：「Lv1のスピリットのアタックでは」）
                if (
                    attackerLevel !== undefined &&
                    maxCost === undefined &&
                    currentLevel(attacker).level === attackerLevel
                ) {
                    return true
                }
                if (
                    maxCost !== undefined &&
                    costsOfAttacker.some((cost) => cost <= maxCost) &&
                    (attackerLevel === undefined || currentLevel(attacker).level === attackerLevel)
                ) {
                    return true
                }
            }
        }
    }
    return false
}

// 片側限定のライフ保護（playerRule "noLifeDamageByCostForPid"。BS07秘密の花園Lv2）：
// このターンの間、コストがmaxCost以下のスピリットのアタックでは defenderPid のライフだけが減らされない。
// noLifeDamageByCost（両陣営）と違い、守られるのは積んだ側だけ
// このアタックで、防御側のライフが1回に減る**上限**を返す唯一の入口。
// 0＝減らない／Infinity＝制限なし。実際の減少量は Math.min(アタッカーのシンボル数, max)。
//
// **「減るか／減らないか」ではなく値で返す**のが要点（2026-08-16 ユーザー提案）。
// 「〇しか減らない」（SD01-039 ブリザードウォール）は上限として合流し、
// 「減らない」は max:0 として合流する。今後この種の効果が増えてもここに集まる。
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
    // BS10-093時刻む花時計：このターンの間あらゆる原因でライフが減らない（lifeCrushアクションも別途これを見る）
    if (lifeImmuneThisTurn(board, defenderPid)) {
        return { max: 0, reason: "このターンはライフが減らない" }
    }
    // BS07「勇傑」各色：コストが条件以下のアタックでは**お互いの**ライフが減らない
    if (noLifeDamageByCost(board, defenderPid, attacker)) {
        return { max: 0, reason: "コスト条件によりライフが減らない" }
    }
    // BS07秘密の花園Lv2：このターン、コスト条件のアタックでは**この防御側だけ**が減らない
    if (lifeProtectedByCostThisTurn(board, defenderPid, attacker)) {
        return { max: 0, reason: "このターンはコスト条件によりライフが減らない" }
    }
    // BS11-X06 天秤造神リブラ・ゴレムLv3：発生源が回復状態の間、その持ち主は相手のライフを減らせない
    if (cantReduceOpponentLife(board, defenderPid === "p1" ? "p2" : "p1")) {
        return { max: 0, reason: "回復状態の発生源があるため、相手のライフを減らせない" }
    }
    // BS08空帝竜騎プラチナム：アタッカーの実効BPが発生源以下なら減らない
    if (protectedByBpUpToSelf(board, defenderPid, attacker)) {
        return { max: 0, reason: "BP条件によりライフが減らない" }
    }
    // このターン限定の上限（ブリザードウォール＝1しか減らない）。複数あれば最も厳しいものを採る
    let max = Number.POSITIVE_INFINITY
    for (const c of timedPlayerRules(board, defenderPid)) {
        if (c.type === "lifeDamageMaxForPid") max = Math.min(max, c.max)
    }
    // このターンの間のライフ下限（BS11-080 デルタバリア＝「ライフは0にならない」）。
    // アタック経路では byAttackMinCost（アタッカーのコスト）で絞る
    const attackerCost = Math.max(...instAllCosts(attacker), 0)
    for (const c of timedPlayerRules(board, defenderPid)) {
        if (c.type !== "lifeFloorForPid") continue
        if (c.byAttackMinCost !== undefined && attackerCost < c.byAttackMinCost) continue
        max = Math.min(max, Math.max(0, board.players[defenderPid].life - c.floor))
    }
    // 常在のライフ下限（BS12-070天の階Lv2）
    const continuousFloor = ownLifeFloorContinuous(board, defenderPid)
    if (continuousFloor > 0) {
        max = Math.min(max, Math.max(0, board.players[defenderPid].life - continuousFloor))
    }
    // 常在の「相手のスピリット1体からmaxまでしか減らされない」（アタッカー個体ごとのターン累計。SD06-010）
    max = Math.min(max, ownLifeDamageCapRemaining(board, defenderPid, attacker))
    // 神将「お互いのライフは、ターンごとにスピリット1体からmaxまでしか減らされない」（BS15共通器）
    max = Math.min(max, lifeDamagePerSpiritRemaining(board, attacker))
    if (max === 0) return { max, reason: "このターンはライフが減らない" }
    if (Number.isFinite(max)) return { max, reason: `このターンはライフが${max}しか減らない` }
    return { max }
}

// このターンの間、この pid のライフはあらゆる原因（アタック・lifeCrushアクション）で減らないか
// （BS10-093時刻む花時計。TIMING_CHART.md §2「あらゆる原因を止める」）。
// lifeDamageLimit（アタック経路）と lifeCrushハンドラ（効果経路）の両方から呼ぶ共通の入口
// このターンの間、効果（lifeCrush 等）でこの pid のライフを減らせる下限。
// 下限が無ければ 0（＝0まで減らせる）。BS11-080 デルタバリア
export function lifeFloorByEffect(board: Board, pid: PlayerId, srcType: CardType | undefined): number {
    let floor = 0
    for (const c of timedPlayerRules(board, pid)) {
        if (c.type !== "lifeFloorForPid") continue
        if (c.byEffectSourceTypes !== undefined && (srcType === undefined || !c.byEffectSourceTypes.includes(srcType))) continue
        floor = Math.max(floor, c.floor)
    }
    // 常在のライフ下限（BS12-070天の階Lv2）
    floor = Math.max(floor, ownLifeFloorContinuous(board, pid))
    return floor
}

// SD06-010海皇龍シーマ・クリーク：「自分のライフは、ターンごとに相手のスピリット1体からmaxまでしか
// 減らされない」。ownLifeFloorContinuousと同じ片側パターンだが、**アタッカー個体ごとのターン累計**
// （CardInstance.lifeDealtThisTurn）で判定する点が違う（1回のアタック限定のlifeDamageMaxForPidとは別軸）。
// 該当する制約が無ければInfinityを返す
export function ownLifeDamageCapRemaining(board: Board, pid: PlayerId, attacker: CardInstance): number {
    let remaining = Number.POSITIVE_INFINITY
    for (const source of effectSources(board, pid)) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== "ownLifeDamageCapPerSourcePerTurn") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.whileCombined === true && !instIsCombined(source)) continue
            const dealt = attacker.lifeDealtThisTurn ?? 0
            remaining = Math.min(remaining, Math.max(0, effect.constraint.max - dealt))
        }
    }
    return remaining
}

// 神将「自分のバーストをセットしている間、お互いのライフは、ターンごとにスピリット1体から
// maxまでしか減らされない」（BS15共通器）。ownLifeDamageCapRemainingと同じ
// CardInstance.lifeDealtThisTurn（そのスピリットがこのターンに与えたライフダメージ累計。
// アタック・スピリット自身の効果の両方をここに合算して記録する）を見るが、
// **発生源がどちらの陣営のフィールドにあっても両陣営に効く**点が違う（片側のみのownLifeDamageCapとは別軸）。
// whileOwnBurstSet は効果本体（kind:"globalConstraint"）の既存フィールドをそのまま使う
// （発生源の持ち主がバーストをセットしている間だけ有効）。該当する制約が無ければInfinity
export function lifeDamagePerSpiritRemaining(board: Board, spirit: CardInstance): number {
    let remaining = Number.POSITIVE_INFINITY
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint" || effect.constraint.type !== "lifeDamagePerSpiritPerTurn") continue
                if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                if (effect.whileOwnBurstSet === true && !board.players[pid].burstSet) continue
                const dealt = spirit.lifeDealtThisTurn ?? 0
                remaining = Math.min(remaining, Math.max(0, effect.constraint.max - dealt))
            }
        }
    }
    return remaining
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

export function lifeImmuneThisTurn(board: Board, pid: PlayerId): boolean {
    return timedPlayerRules(board, pid).some((c) => c.type === "lifeImmuneForPid")
}

// BS12-070天の階Lv2：「自分のフィールドに系統：「天霊」を持つスピリットが5体以上いる間、
// 自分のライフは0にならない」。globalConstraint "ownLifeFloor" を持つ発生源から、pid自身の
// フィールドだけを見て発揮条件（ownFamilyCountAtLeast）を判定する（cantReduceOpponentLifeと同じ片側パターン）
export function ownLifeFloorContinuous(board: Board, pid: PlayerId): number {
    let floor = 0
    for (const source of effectSources(board, pid)) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint" || effect.constraint.type !== "ownLifeFloor") continue
            // costSelfToTrash版（BS14-084）はここでは無条件の下限として数えない：
            // ダメージ計算の時点でここが効くと、コストを払わずに0回避が成立してしまう
            // （tryOwnLifeFloorByCostが life<=0 判定の直後で任意コスト付きで処理する）
            if (effect.constraint.costSelfToTrash) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.whileCombined === true && !instIsCombined(source)) continue
            const fam = effect.condition?.ownFamilyCountAtLeast
            if (fam !== undefined) {
                const wanted = Array.isArray(fam.family) ? fam.family : [fam.family]
                const count = board.players[pid].field.spirits.filter((s) =>
                    wanted.some((f) => spiritHasFamily(board, pid, s, f)),
                ).length
                if (count < fam.count) continue
            }
            floor = Math.max(floor, effect.constraint.floor)
        }
    }
    return floor
}

export function lifeProtectedByCostThisTurn(
    board: Board,
    defenderPid: PlayerId,
    attacker: CardInstance,
): boolean {
    return timedPlayerRules(board, defenderPid).some((c) => {
        if (c.type !== "noLifeDamageByCostForPid") return false
        // symbolCount+combinedOnly（BS12-043大地の狩人コンドラッドLv1）：maxCostの代わりに
        // 「シンボル数がsymbolCountちょうど、かつ合体スピリット」のアタックだけを保護する
        if (c.symbolCount !== undefined) {
            if (instanceSymbolCount(attacker) !== c.symbolCount) return false
            if (c.combinedOnly && !instIsCombined(attacker)) return false
            return true
        }
        return c.maxCost !== undefined && instAllCosts(attacker).some((cost) => cost <= c.maxCost!)
    })
}

// このターンだけの強制アタック（timedEffect の内容 mustAttack）が、恒久的な constraint:"mustAttack" と同じ扱いで掛かっているか
export function mustAttackThisTurn(board: Board, _pid: PlayerId, inst: CardInstance): boolean {
    return timedContentsOn(board, inst).some((c) => c.type === "mustAttack")
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
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.whileOwnBurstSet === true && !board.players[pid].burstSet) continue
                if (!effect.constraint.triggers.includes(event)) continue
                if (effect.constraint.color !== undefined && !instHasColor(inst, effect.constraint.color)) continue
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
                if (!effectActiveAtLevel(effect.levels, level)) continue
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

// フィールド全体制約 noSummonByEffect（両陣営・主語なし）：スピリット/ブレイヴ/ネクサス/マジックの
// 効果でスピリット/ブレイヴを召喚できない（BS12-072海賊王の秘宝島Lv1。通常のdoSummonは対象外）。
// summonFreeFromHandIndex/summonFreeFromTrashIndex/summonRevealedFree（EffectModules.ts）が冒頭で呼ぶ
export function summonByEffectBlocked(board: Board): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "noSummonByEffect") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                return true
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
                if (!effectActiveAtLevel(effect.levels, level)) continue
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
): boolean {
    return hasImmunityAgainst(board, ownerPid, inst, "bounce")
}

// hasMagicImmunity / hasBounceImmunity 共通の判定本体（kind:"immunityGrant" の against で分岐）
function hasImmunityAgainst(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    against: "magic" | "bounce",
): boolean {
    const player = board.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "immunityGrant") continue
            if (effect.against !== against) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
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
    const p1 = board.players.p1.field
    const pid: PlayerId = p1.spirits.includes(inst) || p1.nexuses.includes(inst) ? "p1" : "p2"
    // 「〜のスピリットすべて」の記録はスピリットにだけ当たる（ネクサスは1体指定の記録でだけ受ける）
    const isSpirit = board.players[pid].field.spirits.includes(inst)
    return board.timedEffects.flatMap((r) => {
        const t = r.target
        const hit =
            t.kind === "instance"
                ? t.instanceId === inst.instanceId
                : t.kind === "braveHost"
                  ? bravesOf(board.players[pid], inst).some((b) => b.instanceId === t.braveInstanceId)
                  : t.kind === "rule" && isSpirit && (t.pid === undefined || t.pid === pid) && matchesTarget(board, pid, inst, t.filter, t.selfInstanceId)
        return hit ? r.content : []
    })
}

// この個体に期間つき効果で与えられたキーワード（colors＝【装甲】の色）
export function timedKeywords(board: Board, inst: CardInstance): { keyword: Keyword; colors?: Color[] }[] {
    return timedContentsOn(board, inst).flatMap((c) => (c.type === "keyword" ? [c] : []))
}

// このプレイヤーに掛かっている期間つき効果の内容
export function timedContentsFor(board: Board, pid: PlayerId): TimedContent[] {
    return board.timedEffects.flatMap((r) => (r.target.kind === "player" && r.target.pid === pid ? r.content : []))
}

// このプレイヤーに掛かっている「このターンの間」の制約
export function timedPlayerRules(board: Board, pid: PlayerId): PlayerRuleDef[] {
    return timedContentsFor(board, pid).flatMap((c) => (c.type === "playerRule" ? [c.rule] : []))
}

// このバトルの解決方法（比べるもの・勝敗の逆転）
export function timedBattleContents(board: Board): TimedContent[] {
    return board.timedEffects.flatMap((r) => (r.target.kind === "battle" ? r.content : []))
}

// 期間つき効果で、このバトルの間フラッシュで手札のカードを使えないか
export function timedFlashLocked(board: Board, pid: PlayerId): boolean {
    return timedContentsFor(board, pid).some((c) => c.type === "battleLock" && c.lock === "flash")
}

// 期間つき効果でアタック／ブロックできないか
export function cantActByTimed(board: Board, inst: CardInstance, act: "attack" | "block" = "attack"): boolean {
    const needed = act === "attack" ? "cantAttack" : "cantBlock"
    return timedContentsOn(board, inst).some((c) => c.type === needed)
}
