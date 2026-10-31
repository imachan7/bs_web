// 対象選択の絞り込み（TargetFilter）（shared/rules.ts から分割。判定の規約は shared/rules.ts 冒頭）
import { noteCoverage, noteGrantedFrom } from "../coverage"

import type {
    CardInstance,
    PlayerId,
    ResolvedTargetFilter,
} from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { effectiveBp } from "./bp"
import { activeConstraints, hasTimedUnblockable, zoneSpiritEffectsDisabled } from "./constraints"
import { matchesFamilyFilter, spiritHasFamily, spiritHasKeyword, spiritHasKeywordOrLabel } from "./keywordState"
import { currentLevel, effectActiveAtLevel, instAllCosts, instBaseCost, instColors, instHasColor, instHasTriggerEffect, instInShinkaihoState, instIsCombined, instIsVanilla, staticKeywordCount } from "./level"
import { instanceSymbolCount } from "./symbols"

// ---- 対象選択の絞り込み（TargetFilter） ----

// 対象インスタンス1体が ResolvedTargetFilter の全条件を満たすかを判定する純粋な述語。
//
// **これが直交化の中核**: 従来は destroy / exhaust / refresh … の各ハンドラが
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
    if (filter.maxBp !== undefined && effectiveBp(board, ownerPid, inst) > filter.maxBp && !(filter.orMinBp !== undefined && effectiveBp(board, ownerPid, inst) >= filter.orMinBp)) return false
    if (filter.minBp !== undefined && effectiveBp(board, ownerPid, inst) < filter.minBp) return false
    if (filter.exactBp !== undefined && effectiveBp(board, ownerPid, inst) !== filter.exactBp) return false
    if (filter.color !== undefined && !(Array.isArray(filter.color) ? filter.color : [filter.color]).some((c) => instHasColor(inst, c))) return false
    if (filter.colorExclude !== undefined && instHasColor(inst, filter.colorExclude)) return false
    if (filter.minCores !== undefined && inst.cores < filter.minCores) return false
    if (filter.originallyNexus && card(inst.cardId).type !== "nexus") return false
    if (filter.colorNotIn !== undefined && !instColors(inst).some((c) => !filter.colorNotIn!.includes(c))) return false
    if (filter.colorAny !== undefined && !filter.colorAny.some((c) => instHasColor(inst, c))) return false
    if (filter.family !== undefined && !matchesFamilyFilter(board, ownerPid, inst, filter.family)) return false
    if (filter.familyExclude !== undefined && matchesFamilyFilter(board, ownerPid, inst, filter.familyExclude)) return false
    // familyAll（AND版。BS13-061戴冠する活火山Lv2：系統「地竜」と系統「竜人」両方）
    if (filter.familyAll !== undefined && !filter.familyAll.every((f) => spiritHasFamily(board, ownerPid, inst, f))) return false
    // チーム所属（26系【チーム：X】）。カード静的な team 配列のみを見る（ゾーンを問わない。付与系チームは未対応）
    if (filter.exSymbol !== undefined && !(card(inst.cardId).symbolEx === true && card(inst.cardId).symbol.includes(filter.exSymbol))) return false
    if (filter.team !== undefined && !(card(inst.cardId).team ?? []).includes(filter.team)) return false
    // 場のスピリット/ネクサスのコストを条件にする判定なので、道化師クランの付与コストも見る
    // （instMatchesCostFilter。以前はcard本来のコストのみを見ており、汎用ターゲットフィルタ経由の
    // destroy/exhaust/refresh等すべてが付与コストを無視していた）
    if (filter.cost !== undefined && !instMatchesCostFilter(inst, filter.cost)) return false
    if (filter.cost?.notIn !== undefined && instAllCosts(inst).some((c) => filter.cost!.notIn!.includes(c))) return false
    if (filter.level !== undefined && !filter.level.includes(currentLevel(inst).level)) return false
    if (filter.maxLevelAsSelf) {
        const self = selfInstanceId === undefined ? undefined : findOnBoard(board, selfInstanceId)
        if (self === undefined || currentLevel(inst).level > currentLevel(self).level) return false
    }
    // minLevel（BS13-023マウンテン・セイカイLv1-3：「Lv2以上の自分のスピリットすべて」。levelの完全一致とは別軸）
    if (filter.minLevel !== undefined && currentLevel(inst).level < filter.minLevel) return false
    // 合体しているか（BS10。docs/design/BRAVE.md）。true=合体スピリット／false=合体していない
    if (filter.combined !== undefined && instIsCombined(inst) !== filter.combined) return false
    // スピリット状態のブレイヴ＝カード種別がブレイヴで、合体していない個体。
    // 合体中のブレイヴは field.combinedBraves にいて field.spirits の走査に入らないので、
    // ここへ来る時点で「スピリット状態」だが、braveCombined でも二重に確かめておく
    if (filter.braveInSpiritState === true && !(card(inst.cardId).type === "brave" && !instIsCombined(inst))) return false
    // keyword（参照判定）: ラベルキーワード（LABELED_KEYWORDS＝【増幅】/【水流】/【地鳴】/【操霊】）は
    // spiritHasLabeledKeyword で判定する（Lv2書きの【地鳴】はLv1では「持たない」＝Lv条件を尊重。
    // kind:"keyword" の宣言を持たないため spiritHasKeyword では引っかからない）。
    // 旧キーワード（kyoshu/soku等）は従来の spiritHasKeyword のまま
    if (filter.keyword !== undefined) {
        const wanted = Array.isArray(filter.keyword) ? filter.keyword : [filter.keyword]
        if (!wanted.some((k) => spiritHasKeywordOrLabel(board, ownerPid, inst, k))) return false
    }
    // 配列の keyword との組み合わせは不一致扱い
    if (filter.keywordCount !== undefined && (typeof filter.keyword !== "string" || staticKeywordCount(inst, filter.keyword) !== filter.keywordCount)) return false
    // keyword の否定（BS07剣王獣ビャク・ガロウLv2＝【転召】を持たない相手）
    // unblockableOnly（BS09-049炎蜥蜴クトゥグマLv3）：「ブロックされない」効果を持つものだけ。
    // 継続的な制約（unblockableBy）と期間つき効果の両方を見る。どちらも「◯◯の相手から」の条件つきでも数える
    if (filter.unblockableOnly) {
        const hasUnblockable =
            hasTimedUnblockable(board, inst) ||
            activeConstraints(board, ownerPid, inst).some((c) => c.type === "unblockableBy")
        if (!hasUnblockable) return false
    }
    // BS15共通器：BS15-051虚海獣エメヒドラルLv2。カード自身の効果文に「ブロックされない」（constraint宣言）を
    // 持てば条件成否を問わず対象（現在のレベルで有効な宣言だけ。Lv1のシェイロンは対象外）。加えて、他の効果で今ブロックされなくなっているスピリットも対象（OR）
    if (filter.hasUnblockableEffectOrActive) {
        const declaresUnblockable = card(inst.cardId).effects.some(
            (e) => e.kind === "constraint" && e.constraint.type === "unblockableBy" && effectActiveAtLevel(e.levels, currentLevel(inst).level),
        )
        const activelyUnblockable =
            hasTimedUnblockable(board, inst) ||
            activeConstraints(board, ownerPid, inst).some((c) => c.type === "unblockableBy")
        if (!declaresUnblockable && !activelyUnblockable) return false
    }
    // keywords（BS09-068ランドマイン＝覚醒/呪撃/神速/光芒/粉砕）：いずれか1つでも持てばよい
    if (filter.keywords !== undefined && !filter.keywords.some((k) => spiritHasKeyword(board, ownerPid, inst, k))) return false
    if (filter.keywordExclude !== undefined && spiritHasKeyword(board, ownerPid, inst, filter.keywordExclude)) return false
    if (filter.vanilla !== undefined && instIsVanilla(inst) !== filter.vanilla) return false
    // hasBurst：effectsに kind:"burst" を持つカードだけ（docs/design/BURST.md）。false指定時は持たないものだけ
    if (filter.hasBurst !== undefined) {
        const has = card(inst.cardId).effects.some((e) => e.kind === "burst")
        if (filter.hasBurst !== has) return false
    }
    if (filter.minSymbols !== undefined && instanceSymbolCount(inst) < filter.minSymbols) return false
    if (filter.symbolCount !== undefined && instanceSymbolCount(inst) !== filter.symbolCount) return false
    if (filter.excludeSelf && selfInstanceId !== undefined && inst.instanceId === selfInstanceId) return false
    if (filter.cores !== undefined && inst.cores !== filter.cores) return false
    if (filter.maxCores !== undefined && inst.cores > filter.maxCores) return false
    // [ソウルコア]が載っている/載っていない（26系）。ソウルコアの居場所は公開情報で、
    // 両プレイヤーのポインタを見る＝対象がどちらの側でも判定できる（コア数値には含まれないため inst.cores と独立）
    if (filter.soulCore !== undefined) {
        const hasSoul =
            (board.players.p1.soulCore?.zone === "instance" && board.players.p1.soulCore.instanceId === inst.instanceId) ||
            (board.players.p2.soulCore?.zone === "instance" && board.players.p2.soulCore.instanceId === inst.instanceId)
        if (filter.soulCore === "present" ? !hasSoul : hasSoul) return false
    }
    // 真界放状態（26系《真界放》のLv2に現在いるか。コアの内訳は問わない）
    if (filter.shinkaiho !== undefined && instInShinkaihoState(inst) !== filter.shinkaiho) return false
    // 召喚経路（26系「【Fチェンジ】で召喚されているか」等。CardInstance.summonedByと突合。未記録の個体はどの値とも一致しない）
    if (filter.summonedBy !== undefined && inst.summonedBy !== filter.summonedBy) return false
    if (filter.summonedThisTurn === true && inst.summonedTurn !== board.turn) return false
    if (filter.rested !== undefined && inst.isRested !== filter.rested) return false
    if (filter.refreshed !== undefined && inst.isRested === filter.refreshed) return false
    // BS11-X04：合体していないスピリットだけ（合体中のブレイヴ自身も「合体している」側）
    if (filter.uncombined === true && instIsCombined(inst)) return false
    // カード名の部分一致（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）。
    // 名前は master データの静的な値のみを見る（名前の付与・変更を行う効果は未実装）。
    // 配列指定はいずれかの文字列を含めばよい（OR。BS08ダークパワー：「ダーク」/「ブラック」）
    if (filter.nameIs !== undefined && !cardNameIs(inst, filter.nameIs)) return false
    if (filter.nameContains !== undefined) {
        const names = Array.isArray(filter.nameContains) ? filter.nameContains : [filter.nameContains]
        if (!names.some((n) => cardNameContains(inst, n))) return false
    }
    // 「アタックしている」（BS07桜の妖精オウカ）：現在のバトルのアタッカーだけ。バトル外では対象なし
    if (filter.attackingOnly && board.battle?.attackerInstanceId !== inst.instanceId) return false
    if (filter.notHeavyRested && inst.heavyRested) return false
    if (filter.notAttacking && board.battle?.attackerInstanceId === inst.instanceId) return false
    if (filter.blocking && board.battle?.blockerInstanceId !== inst.instanceId) return false
    if (filter.notInBattle && (board.battle?.attackerInstanceId === inst.instanceId || board.battle?.blockerInstanceId === inst.instanceId)) return false
    if (filter.inBattle && board.battle?.attackerInstanceId !== inst.instanceId && board.battle?.blockerInstanceId !== inst.instanceId) return false
    // 指定トリガーの誘発効果を静的に持つものだけ（BS08プテラディア捕獲部隊：『召喚時』効果持ち）
    if (filter.hasTrigger !== undefined && !instHasTriggerEffect(inst, filter.hasTrigger)) return false
    if (filter.instanceIn !== undefined && !filter.instanceIn.includes(inst.instanceId)) return false
    return true
}

function findOnBoard(board: Board, instanceId: string): CardInstance | undefined {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const f = board.players[pid].field
        const hit = [...f.spirits, ...f.nexuses, ...f.combinedBraves].find((x) => x.instanceId === instanceId)
        if (hit) return hit
    }
    return undefined
}

// self 相対の軸を、ActionCtx なしで self の個体から数値の軸へ解決する（block.ts／GameEngine 用。クライアントも通る）。
// コストは normalizeFilter（印刷コスト1個）と違い、付与コスト込みの総当たり：「どれかのコスト同士が条件を満たせば一致」
// （shared/block.ts の旧 costAtMostAttacker・GameEngine の旧 noRestWhenBlockingCost と同じ見方）
export function resolveSelfRelative(filter: ResolvedTargetFilter, self: CardInstance): ResolvedTargetFilter {
    const { maxCostAsSelf, sameCostAsSelf, maxLevelAsSelf, ...rest } = filter
    const out: ResolvedTargetFilter = rest
    if (maxCostAsSelf) out.cost = { ...out.cost, max: Math.max(...instAllCosts(self)) }
    if (sameCostAsSelf) out.cost = { ...out.cost, in: instAllCosts(self) }
    if (maxLevelAsSelf) out.level = Array.from({ length: currentLevel(self).level }, (_, i) => i + 1)
    return out
}

// カード名に指定文字列を含むか。「カード名に『◯◯』と入っているスピリット」の共通判定。
// namesAsContinuous（「カード名に◯◯が入っているものとして扱う」の継続付与。
// refreshLevelAsOverrides が都度再構築する）も含めて判定する
export function cardNameContains(inst: CardInstance, text: string): boolean {
    if (card(inst.cardId).name.includes(text)) return true
    return (inst.namesAsContinuous ?? []).includes(text)
}

// カード名の完全一致（部分一致しない）。「〜として扱う」名も一致とみなす
export function cardNameIs(inst: CardInstance, name: string): boolean {
    return card(inst.cardId).name === name || (inst.namesAsContinuous ?? []).includes(name)
}

// トラッシュ（インスタンスを持たない、cardIdだけのゾーン）のカード名照合。cardNameContainsのトラッシュ版。
// kind:"trashNameAs"（トラッシュにある間だけ別名としても扱う。BS10-056蒼天大聖モンゴクウ）を持つカードは
// その名前でも一致する。トラッシュのカード名を照合する呼び出し側はすべてこれを通すこと
// （直接 getCard(cardId).name.includes(...) を書くと trashNameAs が無言ですり抜ける）
export function trashCardNameMatches(cardId: string, needle: string, board?: Board): boolean {
    const c = card(cardId)
    if (c.name.includes(needle)) return true
    if (board !== undefined && zoneSpiritEffectsDisabled(board, cardId)) return false
    const found = c.effects.find((e) => e.kind === "trashNameAs" && e.name.includes(needle))
    if (found) noteCoverage(found, "trashNameAs")
    return found !== undefined
}

// コスト範囲の判定（TargetFilter.cost）。
// 従来 EffectModules 側にあった matchesCostFilter をここへ移し、matchesTarget から使う
export function matchesCostFilter(cost: number, costFilter?: { max?: number; min?: number; in?: number[] }): boolean {
    if (!costFilter) return true
    if (costFilter.in !== undefined && !costFilter.in.includes(cost)) return false
    if (costFilter.max !== undefined && cost > costFilter.max) return false
    if (costFilter.min !== undefined && cost < costFilter.min) return false
    return true
}

// フィールド上のインスタンスに対するコスト範囲の判定。実コストに加えて
// **「このターンの間、コストNとしても扱う」（tempAlsoCosts。道化師クラン）も見る**。
// 場のスピリットを絞る costFilter は必ずこちらを通すこと（instHasCost が単一コスト用なのと同じ理由）。
// 静的コストだけで判定すると、クラン下のリフレクションアーマー（コスト2のスピリットに装甲）が
// 無言で対象を取り落とす
export function instMatchesCostFilter(
    inst: CardInstance,
    costFilter?: { max?: number; min?: number; in?: number[] },
): boolean {
    if (!costFilter) return true
    // 実コストは instBaseCost 経由で見る（asSpiritThisTurn の置き換えと instCostDelta の増減を含む）
    if (matchesCostFilter(instBaseCost(inst), costFilter)) return true
    if (inst.tempAlsoCosts.some((c) => matchesCostFilter(c, costFilter))) return true
    const hit = (inst.alsoCostsContinuous ?? []).some((c) => matchesCostFilter(c, costFilter))
    if (hit) noteGrantedFrom(inst, "alsoCostGrant")
    return hit
}
