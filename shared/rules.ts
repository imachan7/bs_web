// サーバー／クライアント共有のルール判定層。
//
// ここに置く関数は「盤面（Board）とカードマスタだけで答えが決まる純粋な述語」に限る。
// サーバー（GameState）とクライアント（GameView）の双方から同じ実装を呼ぶことで、
// 二重実装によるロジックのズレ（型エラーにならず実対戦でしか露見しない）を根絶する。
//
// 制約: node:fs 等の node 組み込みモジュールを import しないこと（esbuild でクライアントへバンドルするため）。
// カードマスタは shared/cardDb.ts の注入経由で参照する。
import type {
    AuraCondition,
    ConstraintDef,
    GlobalConstraintDef,
    AuraCounter,
    AuraDef,
    CardData,
    CardInstance,
    Color,
    FamilyFilter,
    Keyword,
    PlayerId,
    ResolvedTargetFilter,
} from "../server/src/type"
import type { Board, BoardPlayer } from "./board"
import { card } from "./cardDb"

// ---- キーワード ----

// キーワードの存在と表示名を一元管理する（挙動は GameEngine / RuleValidator が hasKeyword で参照する）
export interface KeywordInfo {
    id: Keyword
    label: string
}

// キーワード効果のレジストリ。カードデータには名前だけを持たせ、挙動はエンジン側で解決する
export const KEYWORDS: Record<Keyword, KeywordInfo> = {
    soku: { id: "soku", label: "神速" },
    awaken: { id: "awaken", label: "覚醒" },
    clash: { id: "clash", label: "激突" },
    armor: { id: "armor", label: "装甲" },
    jugeki: { id: "jugeki", label: "呪撃" },
    funsai: { id: "funsai", label: "粉砕" },
    kobo: { id: "kobo", label: "光芒" },
    tensho: { id: "tensho", label: "転召" },
}

// カード静的なキーワード保持判定（一時付与・継続付与は spiritHasKeyword を使うこと）
export function hasKeyword(cardId: string, keyword: Keyword): boolean {
    return card(cardId).effects.some((e) => e.kind === "keyword" && e.keyword === keyword)
}

// ---- レベル・基本述語 ----

// 効果の levels 指定が現在のレベルで有効か（null = レベル不問）
export function effectActiveAtLevel(levels: number[] | null, level: number): boolean {
    return levels === null || levels.includes(level)
}

// カードに効果の記述を持たない（バニラ）か
export function isVanillaCard(cardData: CardData): boolean {
    return cardData.effect === ""
}

// 状態を考慮したコスト判定：カード本来のコスト ‖ 一時的に「コストとしても扱う」値（道化師クラン）
export function instHasCost(inst: CardInstance, cost: number): boolean {
    return card(inst.cardId).cost === cost || inst.tempAlsoCosts.includes(cost)
}

// カード（手札・デッキ・トラッシュ＝インスタンスが無い経路）の色判定。
// **色の一致判定は必ずこの述語か instHasColor を通すこと**（`card.color === c` を直接書かない）。
// BS05 で多色カードが入ると CardData の色が配列になるため、直接比較は静かに壊れる（MULTICOLOR.md 参照）
export function cardHasColor(cardData: CardData, color: Color): boolean {
    return cardData.colors.includes(color)
}

// 状態を考慮した色判定：master色 ‖ 一時付与された色（tempColors。アディショナルカラー） ‖
// 継続的な色置換（colorsAsContinuous。百面相のフラットフェイス）
export function instHasColor(inst: CardInstance, color: Color): boolean {
    if (cardHasColor(card(inst.cardId), color)) return true
    if (inst.tempColors.includes(color)) return true
    return (inst.colorsAsContinuous ?? []).includes(color)
}

// 状態を考慮した色の一覧。「発生源の色」を装甲判定などへまとめて渡すときに使う
// （多色カードは複数返る。付与色＝tempColors／colorsAsContinuous も含む）
export function instColors(inst: CardInstance): Color[] {
    const colors = new Set<Color>(card(inst.cardId).colors)
    for (const c of inst.tempColors) colors.add(c)
    for (const c of inst.colorsAsContinuous ?? []) colors.add(c)
    return [...colors]
}

// 現在のレベルとBP。levelOverrideThisTurn（このターンの上書き）または levelAsContinuous（継続置換）が
// あればそちらを優先し、無ければコア数（coresOverride があればそれ）から判定する。
// BP には tempBpBuff を加算する（レベル0＝維持コア割れの場合は加算しない）
export function currentLevel(inst: CardInstance): { level: number; bp: number } {
    const master = card(inst.cardId)
    const override = inst.levelOverrideThisTurn ?? inst.levelAsContinuous
    if (override !== undefined) {
        const lv = master.levels.find((l) => l.level === override)
        if (lv) {
            return { level: lv.level, bp: lv.bp + (lv.level > 0 ? inst.tempBpBuff : 0) }
        }
    }
    // coresOverride（クロスシザースのネクサスコア数リンク）があれば、レベル判定はそちらを使う
    const coreCount = inst.coresOverride ?? inst.cores
    let result = { level: 0, bp: 0 }
    for (const lv of master.levels) {
        if (coreCount >= lv.cores && lv.level > result.level) {
            result = { level: lv.level, bp: lv.bp }
        }
    }
    return { level: result.level, bp: result.bp + (result.level > 0 ? inst.tempBpBuff : 0) }
}

// ---- シンボル ----

// インスタンスのシンボル数：カードの静的シンボル数 + このターンの追加シンボル数（tempExtraSymbols。ダブルハート）。
// ライフダメージ計算・magicのownFieldHasMinSymbolSpirit条件・bpBuffのminSymbols対象フィルタが共用する
export function instanceSymbolCount(inst: CardInstance): number {
    return card(inst.cardId).symbol.length + (inst.tempExtraSymbols ?? 0)
}

// 軽減計算用：プレイヤーのフィールドにある指定色シンボルの数を数える。
// tempExtraSymbols（ダブルハート）は「持っているシンボルと同じ色を1つ追加」の簡略化として、
// そのインスタンスが元々colors該当のシンボルを持つ場合にのみ加算する
export function countSymbols(player: BoardPlayer, colors: Color[]): number {
    let count = 0
    const all = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of all) {
        const cardSymbols = card(inst.cardId).symbol
        let matched = false
        for (const sym of cardSymbols) {
            if (colors.includes(sym)) {
                count++
                matched = true
            }
        }
        if (matched && inst.tempExtraSymbols) count += inst.tempExtraSymbols
    }
    return count
}

// ---- 盤面の位置 ----

// 指定インスタンスがそのプレイヤーのフィールドにスピリットとして存在するか
export function isSpiritOnField(board: Board, pid: PlayerId, instanceId: string): boolean {
    return board.players[pid].field.spirits.some((s) => s.instanceId === instanceId)
}

// ---- キーワード・系統の状態判定（盤面の付与効果を考慮する） ----

// 状態を考慮したキーワード判定：カード静的 ‖ 一時付与（tempKeywords） ‖ 継続付与（keywordGrant）。
// フィールド上のスピリットを判定する箇所はすべてこちらを使う（手札の神速判定はカード静的な hasKeyword のまま）
export function spiritHasKeyword(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    keyword: Keyword,
): boolean {
    if (hasKeyword(inst.cardId, keyword)) return true
    if (inst.tempKeywords.some((k) => k.keyword === keyword)) return true
    return hasContinuousKeywordGrant(board, ownerPid, inst, keyword)
}

// 継続付与（kind: "keywordGrant"）によるキーワード保持判定（暴双龍ディラノス）
export function hasContinuousKeywordGrant(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    keyword: Keyword,
): boolean {
    const player = board.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "keywordGrant") continue
            if (effect.keyword !== keyword) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (
                effect.familyFilter &&
                !matchesFamilyFilter(board, ownerPid, inst, effect.familyFilter)
            ) {
                continue
            }
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) continue
            if (effect.phase && board.phase !== effect.phase) continue
            return true
        }
    }
    return false
}

// 状態を考慮した系統判定：カード静的 ‖ 継続付与（kind: "familyGrant"。ポム／尖兵）
export function spiritHasFamily(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    family: string,
): boolean {
    if (card(inst.cardId).family.includes(family)) return true
    const player = board.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "familyGrant") continue
            if (effect.family !== family) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) {
                continue
            }
            if (
                effect.costFilter !== undefined &&
                !instHasCost(inst, effect.costFilter)
            ) {
                continue
            }
            if (effect.phase && board.phase !== effect.phase) continue
            if (effect.condition) {
                const { color, count } = effect.condition.ownColorTotalAtLeast
                const total = sources.filter((s) => instHasColor(s, color)).length
                if (total < count) continue
            }
            return true
        }
    }
    return false
}

// FamilyFilter（string | string[]）共通の判定：配列指定時はいずれかの系統を持てばよい（OR）
export function matchesFamilyFilter(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    filter: FamilyFilter,
): boolean {
    if (Array.isArray(filter)) {
        return filter.some((f) => spiritHasFamily(board, ownerPid, inst, f))
    }
    return spiritHasFamily(board, ownerPid, inst, filter)
}

// ---- 常時BP修正（オーラ）と実効BP ----

// オーラのカウンタを、発生源の持ち主（sourcePid）基準で数える
export function countAuraCounter(
    board: Board,
    sourcePid: PlayerId,
    counter: AuraCounter,
): number {
    if (counter === "ownReserve") return board.players[sourcePid].reserve
    if (counter === "ownNexuses") return board.players[sourcePid].field.nexuses.length
    if (counter === "allNexuses") {
        return (
            board.players.p1.field.nexuses.length +
            board.players.p2.field.nexuses.length
        )
    }
    if (counter === "ownExhausted") {
        return board.players[sourcePid].field.spirits.filter((s) => s.isRested).length
    }
    // { ownNameIncludes: string }：発生源自身を含む自分フィールドで、カード名に指定文字列を含むスピリット数
    if ("ownNameIncludes" in counter) {
        return board.players[sourcePid].field.spirits.filter((s) =>
            card(s.cardId).name.includes(counter.ownNameIncludes),
        ).length
    }
    // { ownFamily: FamilyFilter }：発生源自身を含む自分フィールドのスピリット数（familyGrant による付与も含む。配列＝いずれかの系統でOR）
    return board.players[sourcePid].field.spirits.filter((s) =>
        matchesFamilyFilter(board, sourcePid, s, counter.ownFamily),
    ).length
}
// オーラの発動条件を、発生源の持ち主（sourcePid）基準で判定する
export function checkAuraCondition(
    board: Board,
    sourcePid: PlayerId,
    condition: AuraCondition,
): boolean {
    const player = board.players[sourcePid]
    if (condition === "ownReserveNotEmpty") return player.reserve >= 1
    if ("hasOwnColor" in condition) {
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
    // { hasOwnFamily: string }：発生源自身を含んでよい
    return player.field.spirits.some((s) =>
        card(s.cardId).family.includes(condition.hasOwnFamily),
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
    if (aura.target === "self") {
        return sourceInst.instanceId === targetInst.instanceId
    }
    // target === "ownAll"：発生源の持ち主のスピリットすべて（ネクサスは対象外）
    if (sourcePid !== targetOwnerPid) return false
    if (!isSpiritOnField(board, targetOwnerPid, targetInst.instanceId)) return false
    if (aura.colorFilter && !instHasColor(targetInst, aura.colorFilter)) {
        return false
    }
    if (aura.battlingOnly) {
        if (!board.battle) return false
        if (
            board.battle.attackerInstanceId !== targetInst.instanceId &&
            board.battle.blockerInstanceId !== targetInst.instanceId
        ) {
            return false
        }
    }
    if (aura.summonedThisTurnOnly && targetInst.summonedTurn !== board.turn) {
        return false
    }
    if (
        aura.keywordFilter &&
        !spiritHasKeyword(board, targetOwnerPid, targetInst, aura.keywordFilter)
    ) {
        return false
    }
    if (aura.minCores !== undefined && targetInst.cores < aura.minCores) {
        return false
    }
    if (aura.costFilter !== undefined && !instHasCost(targetInst, aura.costFilter)) {
        return false
    }
    if (
        aura.familyFilter &&
        !matchesFamilyFilter(board, targetOwnerPid, targetInst, aura.familyFilter)
    ) {
        return false
    }
    if (aura.vanillaFilter && !isVanillaCard(card(targetInst.cardId))) {
        return false
    }
    return true
}
// オーラ1件の増加量（発生源の持ち主 sourcePid 基準でカウンタ・条件を評価する）
export function auraAmount(board: Board, sourcePid: PlayerId, aura: AuraDef): number {
    let amount = 0
    if (aura.amountPer !== undefined && aura.counter !== undefined) {
        amount += aura.amountPer * countAuraCounter(board, sourcePid, aura.counter)
    }
    if (aura.amount !== undefined) {
        if (!aura.condition || checkAuraCondition(board, sourcePid, aura.condition)) {
            amount += aura.amount
        }
    }
    return amount
}
// 実効BP：基礎BP（tempBpBuff加算済み）に、両陣営の常時BP修正（オーラ）を加算した値。
// 戦闘のBP比較・BPを条件にした対象選択はすべてこの値を使う（レベル判定・維持コアは対象外）。
export function effectiveBp(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
): number {
    let total = currentLevel(inst).bp
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = board.players[pid]
        const sources = [...player.field.spirits, ...player.field.nexuses]
        for (const source of sources) {
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "aura" || effect.aura.type !== "bp") continue
                // 発生源のレベル判定は素の currentLevel を使う（effectiveBp の再帰を避ける）
                const sourceLevel = currentLevel(source).level
                if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
                if (!auraAppliesTo(board, pid, source, effect.aura, ownerPid, inst)) {
                    continue
                }
                total += auraAmount(board, pid, effect.aura)
            }
        }
    }
    return total
}

// ---- 対象選択の絞り込み（TargetFilter） ----

// 対象インスタンス1体が ResolvedTargetFilter の全条件を満たすかを判定する純粋な述語。
//
// **これが直交化の中核**: 従来は destroy / exhaust / refreshOne … の各ハンドラが
// 同じ軸（色・系統・コスト・レベル・キーワード・バニラ）を**それぞれ独自にインラインで**
// 判定していたため、新しい軸が必要になるたびにアクションごとの後付けフィールドが増えていた。
// 以後は軸をここへ足せば、filter を受け取る全アクションが自動的にその軸を扱える。
//
// 注意: BP の self 相対指定（"selfBp"）は normalizeFilter が数値へ解決済みである前提。
// 装甲・免疫・untargetable の判定はここには含まない（対象の「絞り込み」ではなく
// 「そもそも対象に取れるか」の判定であり、pickEnemyCandidates 側の責務）
export function matchesTarget(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    filter: ResolvedTargetFilter | undefined,
    selfInstanceId?: string,
): boolean {
    if (!filter) return true
    if (filter.maxBp !== undefined && effectiveBp(board, ownerPid, inst) > filter.maxBp) return false
    if (filter.exactBp !== undefined && effectiveBp(board, ownerPid, inst) !== filter.exactBp) return false
    if (filter.color !== undefined && !instHasColor(inst, filter.color)) return false
    if (filter.colorExclude !== undefined && instHasColor(inst, filter.colorExclude)) return false
    if (filter.family !== undefined && !matchesFamilyFilter(board, ownerPid, inst, filter.family)) return false
    if (filter.cost !== undefined && !matchesCostFilter(card(inst.cardId).cost, filter.cost)) return false
    if (filter.level !== undefined && !filter.level.includes(currentLevel(inst).level)) return false
    if (filter.keyword !== undefined && !spiritHasKeyword(board, ownerPid, inst, filter.keyword)) return false
    if (filter.vanilla !== undefined && !isVanillaCard(card(inst.cardId))) return false
    if (filter.minSymbols !== undefined && instanceSymbolCount(inst) < filter.minSymbols) return false
    if (filter.excludeSelf && selfInstanceId !== undefined && inst.instanceId === selfInstanceId) return false
    return true
}

// コスト範囲の判定（TargetFilter.cost）。
// 従来 EffectModules 側にあった matchesCostFilter をここへ移し、matchesTarget から使う
export function matchesCostFilter(cost: number, costFilter?: { max?: number; min?: number }): boolean {
    if (!costFilter) return true
    if (costFilter.max !== undefined && cost > costFilter.max) return false
    if (costFilter.min !== undefined && cost < costFilter.min) return false
    return true
}

// ---- 制約・免疫 ----

// 指定インスタンスが現在レベルで持つ制約定義の一覧（RuleValidator の validateBlock が参照する）
export function activeConstraints(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): ConstraintDef[] {
    const level = currentLevel(inst).level
    const own = card(inst.cardId)
        .effects.filter(
            (e) => e.kind === "constraint" && effectActiveAtLevel(e.levels, level),
        )
        .map((e) => (e as { constraint: ConstraintDef }).constraint)
    // constraintGrant（夢魔の寝所Lv2）：持ち主フィールドの発生源から、ownAll/minLevel/phaseTurn条件に
    // 合致する制約を合成する（levelはinst自身の現在レベル＝minLevel判定に使う）
    const granted: ConstraintDef[] = []
    const sources = [...board.players[pid].field.spirits, ...board.players[pid].field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "constraintGrant") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.minLevel !== undefined && level < effect.minLevel) continue
            if (effect.phaseTurn) {
                const { phase, turn } = effect.phaseTurn
                if (board.phase !== phase) continue
                if (turn === "own" && pid !== board.turnPlayer) continue
                if (turn === "opponent" && pid === board.turnPlayer) continue
            }
            granted.push(effect.constraint)
        }
    }
    return [...own, ...granted]
}
export function isUntargetableByOpponent(inst: CardInstance): boolean {
    if (inst.immuneToOpponentThisTurn) return true
    const level = currentLevel(inst).level
    return card(inst.cardId).effects.some(
        (e) =>
            e.kind === "constraint" &&
            e.constraint.type === "untargetableByOpponent" &&
            effectActiveAtLevel(e.levels, level),
    )
}
export function hasArmorAgainst(inst: CardInstance, sourceColors: Color[] | undefined): boolean {
    if (sourceColors === undefined || sourceColors.length === 0) return false
    const level = currentLevel(inst).level
    const staticArmor = card(inst.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "armor" &&
            effectActiveAtLevel(e.levels, level) &&
            (e.colors?.some((c) => sourceColors.includes(c)) ?? false),
    )
    if (staticArmor) return true
    // 一時付与の装甲（インビンシブルシールド）
    return inst.tempKeywords.some(
        (k) => k.keyword === "armor" && (k.colors?.some((c) => sourceColors.includes(c)) ?? false),
    )
}
export function hasGlobalConstraint(
    board: Board,
    type: GlobalConstraintDef["type"],
): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = board.players[pid]
        const instances = [...player.field.spirits, ...player.field.nexuses]
        for (const inst of instances) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== type) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                return true
            }
        }
    }
    return false
}
export function hasMagicImmunity(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
): boolean {
    const player = board.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "immunityGrant") continue
            if (effect.against !== "magic") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (
                effect.familyFilter &&
                !card(inst.cardId).family.includes(effect.familyFilter)
            ) {
                continue
            }
            return true
        }
    }
    return false
}

// このターン限りの全体制約（turnConstraints）により、指定スピリットがアタック/ブロックできないか（ヘビィゲート）
export function cantActByCost(board: Board, inst: CardInstance): boolean {
    const cost = card(inst.cardId).cost
    // 道化師クランの tempAlsoCosts（「コストXとしても扱う」）も判定対象に含める：
    // 実コスト・tempAlsoCostsのいずれかがmaxCost以下なら対象
    return board.turnConstraints.some(
        (c) =>
            c.type === "cantActByCost" &&
            (cost <= c.maxCost || inst.tempAlsoCosts.some((also) => also <= c.maxCost)),
    )
}

// ---- 覚醒・起動能力・指定アタック（UIハイライトとサーバー検証で共有する判定） ----

// 【覚醒】を現在レベルで持っているか。
// 静的キーワードは **effects の levels を尊重する**（「Lv2・Lv3【覚醒】」を Lv1 で使えないようにする）。
// 一時付与（スピリットリンク）・継続付与（ディラノス）はレベル指定を持たないためそのまま有効。
// なお spiritHasKeyword の静的分岐はレベルを見ないため、レベルを尊重したい呼び出しはこちらを使う
export function canAwaken(board: Board, ownerPid: PlayerId, inst: CardInstance): boolean {
    const level = currentLevel(inst).level
    const staticAwaken = card(inst.cardId).effects.some(
        (e) => e.kind === "keyword" && e.keyword === "awaken" && effectActiveAtLevel(e.levels, level),
    )
    if (staticAwaken) return true
    return inst.tempKeywords.some((k) => k.keyword === "awaken")
        || hasContinuousKeywordGrant(board, ownerPid, inst, "awaken")
}

// 起動能力（kind: "activated"）が今このスピリットで発動可能なら {effectId, cost} を返す。
// フラッシュ中・優先権保持・self がバトル当事者・コスト支払い可能をすべて満たす必要がある
export function activatableAbility(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): { effectId: string; cost: number } | null {
    if (!board.battle || !board.isFlashTiming) return null
    if (board.priorityPlayer !== pid) return null
    const inBattle =
        board.battle.attackerInstanceId === inst.instanceId ||
        board.battle.blockerInstanceId === inst.instanceId
    if (!inBattle) return null
    const level = currentLevel(inst).level
    for (const e of card(inst.cardId).effects) {
        if (e.kind !== "activated") continue
        if (!effectActiveAtLevel(e.levels, level)) continue
        if (board.players[pid].reserve < e.cost.reserveToTrash) continue
        return { effectId: e.id, cost: e.cost.reserveToTrash }
    }
    return null
}

// 指定アタック（canDirectAttack）を現在レベルで持っていれば、その対象条件を返す
export function directAttackFilter(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): "rested" | "singleCore" | "recovered" | null {
    const constraint = activeConstraints(board, pid, inst).find((c) => c.type === "canDirectAttack")
    if (!constraint || constraint.type !== "canDirectAttack") return null
    return constraint.targetFilter
}
