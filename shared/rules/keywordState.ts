// 盤面の付与効果を考慮したキーワード・系統の判定（shared/rules.ts から分割。判定の規約は shared/rules.ts 冒頭）

import type {
    CardData,
    CardInstance,
    Color,
    FamilyFilter,
    Keyword,
    PlayerId,
} from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { effectiveBp } from "./bp"
import { timedKeywords } from "./constraints"
import { bravesOf, currentLevel, effectActiveAtLevel, effectActiveOn, effectSources, instEffectsSuppressed, instFamilies, instHasColor, instHasCost, instIsCombined, instIsVanilla, isVanillaCard, isVirtualSource, keywordMatches } from "./level"
import { instMatchesCostFilter } from "./targetFilter"

// ---- キーワード・系統の状態判定（盤面の付与効果を考慮する） ----

// 状態を考慮したキーワード判定：カード静的 ‖ 一時付与（tempKeywords） ‖ 継続付与（keywordGrant）。
// フィールド上のスピリットを判定する箇所はすべてこちらを使う（手札の神速判定はカード静的な hasKeyword のまま）
export function spiritHasKeyword(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    keyword: Keyword,
): boolean {
    // 「持つ効果すべては発揮されない」を受けている個体は、静的キーワードも付与キーワードも発揮しない
    // （kind:"spiritEffectsDisabledGrant"。BS07ルナースラッシュ）
    if (instEffectsSuppressed(inst)) return false
    // カード静的なキーワード。**【合体時】のキーワードは合体しているときだけ**（BS10のブレイヴ：
    // 【合体時】【激突】など）。levels を見ないのは hasKeyword の従来どおりの挙動を保つため。
    // **合体しているブレイヴのキーワードもホスト側でここに合流させる**（合体スピリットは1体として
    // 振る舞う。bravesOf(inst) は inst がホストでないとき空配列を返すので安全）
    const cards = [inst, ...bravesOf(board.players[ownerPid], inst)]
    if (
        cards.some((src) =>
            card(src.cardId).effects.some(
                (e) =>
                    e.kind === "keyword" &&
                    keywordMatches(e.keyword, keyword) &&
                    (e.whileCombined !== true || instIsCombined(inst)),
            ),
        )
    ) {
        return true
    }
    if (timedKeywords(board, inst).some((k) => keywordMatches(k.keyword, keyword))) return true
    return hasContinuousKeywordGrant(board, ownerPid, inst, keyword)
}

// 【氷壁】の色（kind:"magicNegate"のcolors。BS08-032等）。同じカードの複数レベルに分かれていることがあるので
// 現在レベルで有効なエントリすべての色を合わせて返す（OR）。合体しているブレイヴの【氷壁】もホストへ合流させる
// （spiritHasKeywordと同じホスト合流パターン）。無効化されていても「持っている」扱いにするため
// magicNegate自体が発揮できるか（コスト等）は見ない＝levels一致だけで判定する（Q3703／Q25026〜Q25028）
export function iceWallColorsOf(board: Board, ownerPid: PlayerId, inst: CardInstance): Color[] {
    if (instEffectsSuppressed(inst)) return []
    const colors = new Set<Color>()
    for (const src of [inst, ...bravesOf(board.players[ownerPid], inst)]) {
        const level = currentLevel(src).level
        for (const effect of card(src.cardId).effects) {
            if (effect.kind !== "magicNegate") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            for (const c of effect.colors ?? []) colors.add(c)
        }
    }
    return [...colors]
}

// 器N（BS12-057ハイドランディア【合体時】/BS12-069定規山脈）：「相手のスピリット/ブレイヴ/マジックの
// 効果でコアが0個になったとき、最高Lvとして破壊される」を持つか。destroySpiritが cause:"deplete" の
// 直前にこれを見て、通常の維持コア割れ（消滅・onDestroy不発火）ではなく破壊（onDestroy誘発あり・最大Lv扱い）に切り替える
export function hasDestroyAsMaxLevelGrant(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
): boolean {
    if (instEffectsSuppressed(inst)) return false
    // target:"self"：発生源自身（【合体時】なら bravesOf で合体中ブレイヴの効果もホストへ合流させる。
    // spiritHasKeyword と同じホスト合流パターン。BS12-057）
    for (const src of [inst, ...bravesOf(board.players[ownerPid], inst)]) {
        for (const effect of card(src.cardId).effects) {
            if (effect.kind !== "destroyAsMaxLevelGrant" || effect.target !== "self") continue
            if (effect.whileCombined === true && !instIsCombined(inst)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(src).level)) continue
            return true
        }
    }
    // target:"ownAll"：持ち主のフィールドの継続付与源から（BS12-069：ネクサスがスピリットすべてへ与える）
    for (const source of effectSources(board, ownerPid)) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "destroyAsMaxLevelGrant" || effect.target !== "ownAll") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            return true
        }
    }
    return false
}

// 継続付与（kind: "keywordGrant"）によるキーワード保持判定（暴双龍ディラノス）
export function hasContinuousKeywordGrant(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    keyword: Keyword,
): boolean {
    return continuousKeywordGrantCount(board, ownerPid, inst, keyword) > 0
}

// keywordGrant.minBp 用のBP参照。
// **相互再帰を切るためのガードを噛ませてある**：BPオーラは keywordFilter を持てるので
// 「キーワードを見る → BPを見る → BPオーラがキーワードを見る」で循環しうる。
// 再入したときはオーラ抜きの素のBP（レベル相当）で判定する
const bpForKeywordGrantInFlight = new Set<string>()
function bpForKeywordGrant(board: Board, ownerPid: PlayerId, inst: CardInstance): number {
    if (bpForKeywordGrantInFlight.has(inst.instanceId)) return currentLevel(inst).bp
    bpForKeywordGrantInFlight.add(inst.instanceId)
    try {
        return effectiveBp(board, ownerPid, inst)
    } finally {
        bpForKeywordGrantInFlight.delete(inst.instanceId)
    }
}

// 継続付与（kind: "keywordGrant"）で持つキーワードの指定数（【強襲】等、数値を伴うキーワード用。
// 一致するエントリのeffect.count（省略時1）を返す。該当なしは0（＝持たない）。
// hasContinuousKeywordGrant と同じ走査・絞り込みを共有する（BS08キマイラアサルト：付与する【強襲】はcount:1）
export function continuousKeywordGrantCount(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    keyword: Keyword,
): number {
    const sources = effectSources(board, ownerPid)
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "keywordGrant") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (effect.keyword !== keyword) continue
            // 【合体時】＝発生源自身が合体しているときだけ（BS13-005強暴竜ディラノ・レックス【合体時】Lv3）
            if (!effectActiveOn(source, effect, sourceLevel)) continue
            // onlyWhileSpiritState＝whileCombinedの逆。発生源自身が合体しているときは発揮しない（BS13-056ホーク・ブレイカー）
            if (effect.onlyWhileSpiritState && instIsCombined(source)) continue
            // combinedFilter（BS13-005）：対象（inst）自身が合体スピリットのときのみ
            if (effect.combinedFilter && !instIsCombined(inst)) continue
            if (
                effect.familyFilter &&
                !matchesFamilyFilter(board, ownerPid, inst, effect.familyFilter)
            ) {
                continue
            }
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) continue
            // costFilter（BS02-101リフレクションアーマー：コスト2のスピリットのみ）。
            // 従来はここが未対応で、armorColorsGranted経由のhasArmorAgainst（refreshLevelAsOverridesが
            // costFilterを見て構築）は正しくコスト絞り込みできる一方、spiritHasKeyword経由のこちらは
            // costFilter を無視してすべてのスピリットにマッチしてしまっていた（2026-07-31 発見・修正）
            if (effect.costFilter && !instMatchesCostFilter(inst, effect.costFilter)) continue
            // BS05黄道の虚空Lv2：転召持ちにのみ光芒を付与（対象が既に持つキーワードで絞る）
            if (effect.keywordFilter && !spiritHasKeyword(board, ownerPid, inst, effect.keywordFilter)) continue
            // keywordFilter の OR 版（BS12-068光の聖剣Lv1＝【装甲】/【重装甲】のいずれかを持つスピリットに【氷壁】を配る）
            if (
                effect.keywordFilterAny &&
                !effect.keywordFilterAny.some((k) => spiritHasKeyword(board, ownerPid, inst, k))
            ) {
                continue
            }
            if (effect.phase && board.phase !== effect.phase) continue
            // turn（BS07龍星皇メテオヴルムLv2-3：『自分のアタックステップ』）は phase と併用する
            if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
            if (effect.vanillaFilter && !instIsVanilla(inst)) continue
            // braveInSpiritState（BS10-083魔星輝く古戦場Lv2）：スピリット状態のブレイヴのみ
            // （TargetFilter.braveInSpiritStateと同じ判定＝カード種別がブレイヴで合体していない個体）
            if (effect.braveInSpiritState && !(card(inst.cardId).type === "brave" && !instIsCombined(inst))) continue
            // minBp（BS09-056星創られし場所＝BP8000以上に【激突】を与える）。
            // 実効BPで見るので、BPバフで届いた個体にも付く
            if (effect.minBp !== undefined && bpForKeywordGrant(board, ownerPid, inst) < effect.minBp) continue
            return effect.count ?? 1
        }
    }
    return 0
}

// 対象インスタンス自身が持つ【装甲】の指定色数（静的keyword・期間つきの付与・継続付与armorColorsGrantedを
// 合算、重複除く）。AuraCounter "targetArmorColors"（アイシクルアサルト）専用。発生源ではなく**対象**基準の点に注意
export function targetArmorColorCount(board: Board, inst: CardInstance): number {
    const level = currentLevel(inst).level
    const colors = new Set<Color>()
    for (const e of card(inst.cardId).effects) {
        if (e.kind === "keyword" && e.keyword === "armor" && effectActiveAtLevel(e.levels, level)) {
            for (const c of e.colors ?? []) colors.add(c)
        }
    }
    for (const k of timedKeywords(board, inst)) {
        if (k.keyword === "armor") {
            for (const c of k.colors ?? []) colors.add(c)
        }
    }
    for (const c of inst.armorColorsGranted ?? []) colors.add(c)
    return colors.size
}

// 状態を考慮した系統判定：カード静的 ‖ 継続付与（kind: "familyGrant"。ポム／尖兵／音鳥クルーク）。
// 走査は effectSources 経由＝このターンだけの仮想発生源（lendSelfThisTurn で貸した継続効果）も含む
// 暗礁海域Lv1（kind:"familySuppression"）：条件に合うスピリットは系統をないものとして扱う。
// 両陣営のフィールドを走査する（発生源の持ち主を問わず「すべて」に効く）。
// ここでは系統を一切参照しないので、spiritHasFamily から呼んでも再帰しない
export function familiesSuppressed(board: Board, inst: CardInstance): boolean {
    // target:"opponentAll"（BS09-079キャラクターロスト）用に、対象の持ち主を割り出す
    const instPid: PlayerId | undefined = board.players.p1.field.spirits.some(
        (s) => s.instanceId === inst.instanceId,
    )
        ? "p1"
        : board.players.p2.field.spirits.some((s) => s.instanceId === inst.instanceId)
          ? "p2"
          : undefined
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, ownerPid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "familySuppression") continue
                if (effect.lentOnly && !isVirtualSource(source)) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
                if (effect.maxCores !== undefined && inst.cores > effect.maxCores) continue
                // 「相手のスピリットすべて」＝発生源の持ち主のスピリットには効かない。
                // 対象の持ち主が分からないとき（場にいない個体）は効かせない側に倒す
                if (effect.target === "opponentAll" && (instPid === undefined || instPid === ownerPid)) continue
                return true
            }
        }
    }
    return false
}

// 緑芽吹く原野Lv2（kind:"handKeywordGrant"）：持ち主の手札にある条件一致のカードが
// 場の発生源からキーワードを得ているか。手札には書き込まず、判定のたびに場を見る
// （RuleValidator.validateSummon とクライアントの神速表示が同じ実装を使う）
export function hasHandKeywordGrant(
    board: Board,
    pid: PlayerId,
    cardData: CardData,
    keyword: Keyword,
): boolean {
    for (const source of effectSources(board, pid)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "handKeywordGrant") continue
            if (effect.keyword !== keyword) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (cardData.type !== (effect.cardType ?? "spirit")) continue
            if (effect.familyFilter !== undefined && !cardData.family.includes(effect.familyFilter)) continue
            // vanillaFilter：手札のカードなので静的判定でよい（BS10-085浮遊する岩塊Lv2）
            if (effect.vanillaFilter === true && !isVanillaCard(cardData)) continue
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

export function spiritHasFamily(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    family: string,
): boolean {
    // 暗礁海域Lv1：系統をないものとして扱う（静的な系統も、familyGrant による付与も持たない）
    if (familiesSuppressed(board, inst)) return false
    // asSpiritThisTurn（BS03ゴーレムクラフト＝系統「造兵」）は静的な系統の代わりに載る上書き。
    // ネクサスは系統を持たないので実質は追加だが、上書きとして扱っておけば
    // 「系統を持つネクサス」が将来出ても効果文どおりになる
    if (instFamilies(inst).includes(family)) return true
    const player = board.players[ownerPid]
    const sources = effectSources(board, ownerPid)
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "familyGrant") continue
            // 【合体時】＝発生源自身が合体しているときだけ（BS13-X05Lv3）
            if (effect.whileCombined && !instIsCombined(source)) continue
            // target:"self"（器BH）：発生源自身にしか付与しない
            if (effect.target === "self" && source.instanceId !== inst.instanceId) continue
            // 器BH：familiesFromOwnField＝持ち主のフィールドのスピリットが（カード静的に）持つ系統すべてを動的に付与する
            // （付与系統の再帰を避けるため getCard(...).family の静的系統だけを見る）
            if (effect.familiesFromOwnField) {
                if (!player.field.spirits.some((s) => card(s.cardId).family.includes(family))) continue
            } else {
                // 付与する系統：固定（family）か、貸与時にプレイヤーが選んだもの（familyFromChoice。音鳥クルーク）
                const granted = effect.familyFromChoice ? source.lentChoiceFamily : effect.family
                if (granted !== family) continue
            }
            // lentOnly：仮想発生源からのみ有効（実在スピリットが同じエントリを持っても恒久化させない）
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            // familyFilter は**カード静的な系統のみ**で判定する。ここで spiritHasFamily を呼ぶと
            // 「歌鳥持ちに歌鳥を与える」選択で自己再帰する（音鳥クルーク）。配列＝いずれかの系統でOR
            // （BS06無限なる軌道母艦：機人/動器のいずれかを持つスピリットに武装を付与）
            if (effect.familyFilter) {
                const wantedFamilies = Array.isArray(effect.familyFilter) ? effect.familyFilter : [effect.familyFilter]
                if (!wantedFamilies.some((f) => instFamilies(inst).includes(f))) continue
            }
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
            // turn（BS07重刀竜ブレイガザウラーLv2-3：『自分のアタックステップ』）は phase と併用する
            if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
            if (effect.condition) {
                // 「スピリットとネクサスが合計N以上」は**場に実在するもの**を数える（分類B。
                // 仮想発生源を混ぜてはいけないため sources ではなく field を見る。TURN_EFFECT_SOURCES.md §1）
                const { color, count } = effect.condition.ownColorTotalAtLeast
                const onField = [...player.field.spirits, ...player.field.nexuses]
                const total = onField.filter((s) => instHasColor(s, color)).length
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
