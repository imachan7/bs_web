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
    TriggerEvent,
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
    bofu: { id: "bofu", label: "暴風" },
    seimei: { id: "seimei", label: "聖命" },
    kyoshu: { id: "kyoshu", label: "強襲" },
    hyoheki: { id: "hyoheki", label: "氷壁" },
}

// カード静的なキーワード保持判定（一時付与・継続付与は spiritHasKeyword を使うこと）
export function hasKeyword(cardId: string, keyword: Keyword): boolean {
    return card(cardId).effects.some((e) => e.kind === "keyword" && e.keyword === keyword)
}

// 指定トリガーの誘発効果（kind:"triggered"）を現在のレベルで静的に持つか（TargetFilter.hasTrigger）。
// 継続付与された誘発効果（kind:"effectGrant"）や一時付与（tempGrantedTriggers）は見ない簡略化
// （BS08プテラディア捕獲部隊：『召喚時』効果を持つ相手のスピリット）
export function instHasTriggerEffect(inst: CardInstance, trigger: TriggerEvent): boolean {
    const level = currentLevel(inst).level
    return card(inst.cardId).effects.some(
        (e) => e.kind === "triggered" && e.trigger === trigger && effectActiveAtLevel(e.levels, level),
    )
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

// インスタンス単位のバニラ判定：カード静的（効果テキストが空）‖ 継続付与された「バニラとしても扱う」
// （kind:"vanillaAsGrant"。refreshLevelAsOverrides が CardInstance.treatedAsVanillaContinuous を都度再構築する）。
// **場のインスタンスを判定するときは必ずこちらを使う**（isVanillaCard を直接呼ぶと付与が無言で無視される）
export function instIsVanilla(inst: CardInstance): boolean {
    if (inst.treatedAsVanillaContinuous === true) return true
    return isVanillaCard(card(inst.cardId))
}

// 「効果の発生源」をすべて返す器。**フィールドに実在する発生源＋実在しないが効果を出す発生源**の両方を返す。
// 前者はスピリット・ネクサス。後者は現時点ではターン限定の仮想発生源（マジックが貸した継続効果。
// PlayerState.turnVirtualInstances）のみだが、**今後ここに種類が追加される想定**（例: 次弾以降の新カードタイプ
// 「ブレイヴ」＝スピリットに合体して1体として扱われるカード。合体中は field.spirits に置かず
// ホストの入れ子として持たせ、その【合体中】効果はここ経由で発揮させる設計になる）。
// 発生源の種類が増えたら下の配列に1行足すだけで済むよう、種類ごとに1行で並べておくこと。
//
// ⚠️ 「場に実在するカードを数える」用途には使わないこと。
//    軽減シンボル集計（countSymbols）・色ロック（ownFieldSymbolColors）は
//    物理的な存在を見る処理であり、意味的に発生源とは別物（TURN_EFFECT_SOURCES.md §1 の分類B）。
//    それらは player.field を直接見ること。この区別は将来ブレイヴが乗っても効く
//    （合体中のブレイヴを軽減シンボル集計に混ぜると、実在しないもう1体として数えてしまう事故になる）
export function effectSources(board: Board, pid: PlayerId): CardInstance[] {
    const player = board.players[pid]
    return [
        // フィールドに実在するスピリット。「持つ効果すべては発揮されない」を受けている個体は外す
        // （kind:"spiritEffectsDisabledGrant"。BS07ルナースラッシュ）
        ...player.field.spirits.filter((s) => s.effectsDisabledContinuous !== true),
        // フィールドに実在するネクサス。相手が「相手のネクサスすべての効果は発揮されない」を出している間は丸ごと外す
        ...(nexusEffectsDisabledFor(board, pid) ? [] : player.field.nexuses),
        ...player.turnVirtualInstances, // 実在しないが効果を出す発生源：このターン限定（マジックが貸した継続効果）
    ]
}

// pid のネクサスの効果が、相手の kind:"nexusEffectsDisabled" によって発揮されない状態か
// （BS05ネクサスブロケイド）。
// ⚠️ ここで effectSources を呼ぶと無限再帰するので、相手側の配列を**直接**走査する。
// ネクサスが自分自身を無効化する形は現データに無いが、仮に書かれても
// 「無効化する側のネクサス」は下の走査に含まれるため一貫して効く
function nexusEffectsDisabledFor(board: Board, pid: PlayerId): boolean {
    const opp = board.players[pid === "p1" ? "p2" : "p1"]
    const sources = [...opp.field.spirits, ...opp.field.nexuses, ...opp.turnVirtualInstances]
    for (const source of sources) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "nexusEffectsDisabled") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            return true
        }
    }
    return false
}

// このインスタンスがターン限定の仮想発生源（マジックが貸した継続効果）かどうか。
// 仮想発生源は場に実在しないため、self参照アクション（refreshSelf等）やaura target:"self"の対象にしてはいけない
// （TURN_EFFECT_SOURCES.md §4.1）
export function isVirtualSource(inst: CardInstance): boolean {
    return inst.instanceId.startsWith("virtual-")
}

// 状態を考慮したコスト判定：カード本来のコスト ‖ 一時的に「コストとしても扱う」値（tempAlsoCosts） ‖
// 継続付与された「コストとしても扱う」値（alsoCostsContinuous＝kind:"alsoCostGrant"。道化師クラン）
export function instHasCost(inst: CardInstance, cost: number): boolean {
    if (card(inst.cardId).cost === cost) return true
    if (inst.tempAlsoCosts.includes(cost)) return true
    return (inst.alsoCostsContinuous ?? []).includes(cost)
}

// インスタンスが「扱われている」コストの一覧（本来のコスト＋tempAlsoCosts＋alsoCostsContinuous）。
// 単一値の一致判定は instHasCost、範囲判定は instMatchesCostFilter を使えば足りるので、
// それらで表現できない判定（costCantAct のように「どのコストか」を都度渡す関数へORで橋渡しする、
// 2インスタンス間でコストを比較する、等）でのみ使うこと
export function instAllCosts(inst: CardInstance): number[] {
    return [card(inst.cardId).cost, ...inst.tempAlsoCosts, ...(inst.alsoCostsContinuous ?? [])]
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
    // 「持つ効果すべては発揮されない」を受けている個体は、静的キーワードも付与キーワードも発揮しない
    // （kind:"spiritEffectsDisabledGrant"。BS07ルナースラッシュ）
    if (inst.effectsDisabledContinuous === true) return false
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
    const sources = effectSources(board, ownerPid)
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
            // costFilter（BS02-101リフレクションアーマー：コスト2のスピリットのみ）。
            // 従来はここが未対応で、armorColorsGranted経由のhasArmorAgainst（refreshLevelAsOverridesが
            // costFilterを見て構築）は正しくコスト絞り込みできる一方、spiritHasKeyword経由のこちらは
            // costFilter を無視してすべてのスピリットにマッチしてしまっていた（2026-07-31 発見・修正）
            if (effect.costFilter && !instMatchesCostFilter(inst, effect.costFilter)) continue
            // BS05黄道の虚空Lv2：転召持ちにのみ光芒を付与（対象が既に持つキーワードで絞る）
            if (effect.keywordFilter && !spiritHasKeyword(board, ownerPid, inst, effect.keywordFilter)) continue
            if (effect.phase && board.phase !== effect.phase) continue
            // turn（BS07龍星皇メテオヴルムLv2-3：『自分のアタックステップ』）は phase と併用する
            if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
            if (effect.vanillaFilter && !instIsVanilla(inst)) continue
            return true
        }
    }
    return false
}

// 対象インスタンス自身が持つ【装甲】の指定色数（静的keyword・一時付与tempKeywords・継続付与armorColorsGrantedを
// 合算、重複除く）。AuraCounter "targetArmorColors"（アイシクルアサルト）専用。発生源ではなく**対象**基準の点に注意
export function targetArmorColorCount(inst: CardInstance): number {
    const level = currentLevel(inst).level
    const colors = new Set<Color>()
    for (const e of card(inst.cardId).effects) {
        if (e.kind === "keyword" && e.keyword === "armor" && effectActiveAtLevel(e.levels, level)) {
            for (const c of e.colors ?? []) colors.add(c)
        }
    }
    for (const k of inst.tempKeywords) {
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
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, ownerPid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "familySuppression") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.turn === "own" && ownerPid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === board.turnPlayer) continue
                if (effect.maxCores !== undefined && inst.cores > effect.maxCores) continue
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
    if (card(inst.cardId).family.includes(family)) return true
    const player = board.players[ownerPid]
    const sources = effectSources(board, ownerPid)
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "familyGrant") continue
            // 付与する系統：固定（family）か、貸与時にプレイヤーが選んだもの（familyFromChoice。音鳥クルーク）
            const granted = effect.familyFromChoice ? source.lentChoiceFamily : effect.family
            if (granted !== family) continue
            // lentOnly：仮想発生源からのみ有効（実在スピリットが同じエントリを持っても恒久化させない）
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            // familyFilter は**カード静的な系統のみ**で判定する。ここで spiritHasFamily を呼ぶと
            // 「歌鳥持ちに歌鳥を与える」選択で自己再帰する（音鳥クルーク）。配列＝いずれかの系統でOR
            // （BS06無限なる軌道母艦：機人/動器のいずれかを持つスピリットに武装を付与）
            if (effect.familyFilter) {
                const wantedFamilies = Array.isArray(effect.familyFilter) ? effect.familyFilter : [effect.familyFilter]
                if (!wantedFamilies.some((f) => card(inst.cardId).family.includes(f))) continue
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
// なお「スピリットの効果か・ネクサスの効果か・マジックの効果か」の区別（シーサーズはネクサス除外、
// スリーカードはマジック除外）は簡略化して見ていない（card-notes に記載）。
export function spiritCountWeight(
    board: Board,
    countingPid: PlayerId,
    ownerPid: PlayerId,
    inst: CardInstance,
): number {
    let weight = 1
    // シーサーズLv2：持ち主自身の効果で数えるときだけ N 体分
    if (countingPid === ownerPid) {
        for (const effect of card(inst.cardId).effects) {
            if (effect.kind !== "countAsMultiple") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(inst).level)) continue
            weight = Math.max(weight, effect.count)
        }
    }
    // スリーカード：このターンの間、印を付けた側の効果でだけ N 体分（相手のスピリットにも付けられる）
    if (inst.countAsThisTurn && inst.countAsThisTurn.pid === countingPid) {
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
): number {
    let total = 0
    for (const s of board.players[ownerPid].field.spirits) {
        if (!predicate(s)) continue
        total += spiritCountWeight(board, countingPid, ownerPid, s)
    }
    return total
}

export function countAuraCounter(
    board: Board,
    sourcePid: PlayerId,
    counter: AuraCounter,
    targetInst?: CardInstance,
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
        return countSpiritsWeighted(board, sourcePid, sourcePid, (s) => s.isRested)
    }
    if (counter === "targetArmorColors") {
        return targetInst ? targetArmorColorCount(targetInst) : 0
    }
    // { ownNameIncludes: string }：発生源自身を含む自分フィールドで、カード名に指定文字列を含むスピリット数
    if ("ownNameIncludes" in counter) {
        return countSpiritsWeighted(board, sourcePid, sourcePid, (s) =>
            cardNameContains(s, counter.ownNameIncludes),
        )
    }
    // { ownCost: number }：発生源自身を含む自分フィールドの指定コストのスピリット数（BS06細剣の猫騎士ケット・シー）
    if ("ownCost" in counter) {
        return countSpiritsWeighted(board, sourcePid, sourcePid, (s) => instHasCost(s, counter.ownCost))
    }
    // { ownFamily: FamilyFilter }：発生源自身を含む自分フィールドのスピリット数（familyGrant による付与も含む。配列＝いずれかの系統でOR）
    return countSpiritsWeighted(board, sourcePid, sourcePid, (s) =>
        matchesFamilyFilter(board, sourcePid, s, counter.ownFamily),
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
    if (aura.attackingOnly) {
        if (!board.battle) return false
        if (board.battle.attackerInstanceId !== targetInst.instanceId) return false
    }
    if (aura.blockingOnly) {
        if (!board.battle) return false
        if (board.battle.blockerInstanceId !== targetInst.instanceId) return false
    }
    if (aura.minSymbols !== undefined && instanceSymbolCount(targetInst) < aura.minSymbols) {
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
): number {
    let amount = 0
    if (aura.amountPer !== undefined && aura.counter !== undefined) {
        amount += aura.amountPer * countAuraCounter(board, sourcePid, aura.counter, targetInst)
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
    let total = currentLevel(inst).bp
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        // 古代闘技場Lv1：この陣営の「BPを+する」効果は発揮されない。オーラは1体ぶんずつ加算されるため、
        // 加算値が正のものだけを落とす（BP-のオーラは抑止の対象外。現データに負のBPオーラは無い）
        const bpBuffSuppressed = isBpBuffSuppressed(board, pid)
        const sources = effectSources(board, pid)
        for (const source of sources) {
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "aura" || effect.aura.type !== "bp") continue
                // lentOnly：仮想発生源（マジックが lendSelfThisTurn で貸した効果）からのみ有効。
                // 実在するスピリット/ネクサスがたまたま同じ効果エントリを持っていても恒久化させない
                if (effect.aura.lentOnly && !isVirtualSource(source)) continue
                // 発生源のレベル判定は素の currentLevel を使う（effectiveBp の再帰を避ける）
                const sourceLevel = currentLevel(source).level
                if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
                if (!auraAppliesTo(board, pid, source, effect.aura, ownerPid, inst)) {
                    continue
                }
                const amount = auraAmount(board, pid, effect.aura, inst)
                if (bpBuffSuppressed && amount > 0) continue
                total += amount
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
    if (filter.minBp !== undefined && effectiveBp(board, ownerPid, inst) < filter.minBp) return false
    if (filter.exactBp !== undefined && effectiveBp(board, ownerPid, inst) !== filter.exactBp) return false
    if (filter.color !== undefined && !instHasColor(inst, filter.color)) return false
    if (filter.colorExclude !== undefined && instHasColor(inst, filter.colorExclude)) return false
    if (filter.family !== undefined && !matchesFamilyFilter(board, ownerPid, inst, filter.family)) return false
    // 場のスピリット/ネクサスのコストを条件にする判定なので、道化師クランの付与コストも見る
    // （instMatchesCostFilter。以前はcard本来のコストのみを見ており、汎用ターゲットフィルタ経由の
    // destroy/exhaust/refreshOne等すべてが付与コストを無視していた）
    if (filter.cost !== undefined && !instMatchesCostFilter(inst, filter.cost)) return false
    if (filter.level !== undefined && !filter.level.includes(currentLevel(inst).level)) return false
    if (filter.keyword !== undefined && !spiritHasKeyword(board, ownerPid, inst, filter.keyword)) return false
    // keyword の否定（BS07剣王獣ビャク・ガロウLv2＝【転召】を持たない相手）
    if (filter.keywordExclude !== undefined && spiritHasKeyword(board, ownerPid, inst, filter.keywordExclude)) return false
    if (filter.vanilla !== undefined && !instIsVanilla(inst)) return false
    if (filter.minSymbols !== undefined && instanceSymbolCount(inst) < filter.minSymbols) return false
    if (filter.excludeSelf && selfInstanceId !== undefined && inst.instanceId === selfInstanceId) return false
    if (filter.cores !== undefined && inst.cores !== filter.cores) return false
    if (filter.maxCores !== undefined && inst.cores > filter.maxCores) return false
    if (filter.rested !== undefined && inst.isRested !== filter.rested) return false
    // カード名の部分一致（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）。
    // 名前は master データの静的な値のみを見る（名前の付与・変更を行う効果は未実装）
    if (filter.nameContains !== undefined && !cardNameContains(inst, filter.nameContains)) return false
    // 「アタックしている」（BS07桜の妖精オウカ）：現在のバトルのアタッカーだけ。バトル外では対象なし
    if (filter.attackingOnly && board.battle?.attackerInstanceId !== inst.instanceId) return false
    // 指定トリガーの誘発効果を静的に持つものだけ（BS08プテラディア捕獲部隊：『召喚時』効果持ち）
    if (filter.hasTrigger !== undefined && !instHasTriggerEffect(inst, filter.hasTrigger)) return false
    return true
}

// カード名に指定文字列を含むか。「カード名に『◯◯』と入っているスピリット」の共通判定。
// namesAsContinuous（「カード名に◯◯が入っているものとして扱う」の継続付与。
// refreshLevelAsOverrides が都度再構築する）も含めて判定する
export function cardNameContains(inst: CardInstance, text: string): boolean {
    if (card(inst.cardId).name.includes(text)) return true
    return (inst.namesAsContinuous ?? []).includes(text)
}

// コスト範囲の判定（TargetFilter.cost）。
// 従来 EffectModules 側にあった matchesCostFilter をここへ移し、matchesTarget から使う
export function matchesCostFilter(cost: number, costFilter?: { max?: number; min?: number }): boolean {
    if (!costFilter) return true
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
    costFilter?: { max?: number; min?: number },
): boolean {
    if (!costFilter) return true
    if (matchesCostFilter(card(inst.cardId).cost, costFilter)) return true
    if (inst.tempAlsoCosts.some((c) => matchesCostFilter(c, costFilter))) return true
    return (inst.alsoCostsContinuous ?? []).some((c) => matchesCostFilter(c, costFilter))
}

// ---- 制約・免疫 ----

// 指定インスタンスが現在レベルで持つ制約定義の一覧（RuleValidator の validateBlock が参照する）
export function activeConstraints(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): ConstraintDef[] {
    // 「持つ効果すべては発揮されない」を受けている個体は制約を1つも出さない
    // （自前の kind:"constraint" だけでなく、他の発生源からの継続付与 constraintGrant も含めて打ち切る。
    //  BS07ルナースラッシュ＝ブロックしてきた相手を無力化する用途なので、広く止める側に倒している）
    if (inst.effectsDisabledContinuous === true) return []
    const level = currentLevel(inst).level
    const own = card(inst.cardId)
        .effects.filter(
            (e) => e.kind === "constraint" && effectActiveAtLevel(e.levels, level),
        )
        .map((e) => (e as { constraint: ConstraintDef }).constraint)
        // cantAttack の条件つき（BS04鎧装獣ヘイズ・ルーン：相手のフィールドに赤のスピリットが
        // **いない間**だけアタックできない）。条件を満たさなくなったら制約自体を外す
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
            return countSpiritsWeighted(board, pid, pid, (s) => instHasCost(s, cost)) >= count
        })
    // constraintGrant（夢魔の寝所Lv2）：持ち主フィールドの発生源から、ownAll/minLevel/phaseTurn条件に
    // 合致する制約を合成する（levelはinst自身の現在レベル＝minLevel判定に使う）
    const granted: ConstraintDef[] = []
    const sources = effectSources(board, pid)
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "constraintGrant") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.minLevel !== undefined && level < effect.minLevel) continue
            // BS06計画された場外乱闘：系統「闘神」を持つスピリットのみに付与
            if (effect.familyFilter && !matchesFamilyFilter(board, pid, inst, effect.familyFilter)) continue
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
            granted.push(effect.constraint)
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
    const all = [...own, ...granted]
    if (suppressed.size === 0) return all
    return all.filter((c) => !suppressed.has(c.type))
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
// untargetableByOpponentと異なり範囲効果（destroyAll/exhaustAll等）にも効く「効果を受けない」判定。
// srcType が spirit/magic のときのみ判定する（ネクサスの効果・自分自身の効果は通す。BS04ワルキューレ・ヒルド）
export function hasFullEffectImmunity(
    inst: CardInstance,
    srcType: "spirit" | "nexus" | "magic" | undefined,
): boolean {
    if (srcType !== "spirit" && srcType !== "magic") return false
    const level = currentLevel(inst).level
    return card(inst.cardId).effects.some(
        (e) =>
            e.kind === "constraint" &&
            e.constraint.type === "immuneToOpponentEffects" &&
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
    if (
        inst.tempKeywords.some(
            (k) => k.keyword === "armor" && (k.colors?.some((c) => sourceColors.includes(c)) ?? false),
        )
    ) {
        return true
    }
    // 継続付与の装甲（kind:"keywordGrant"のkeyword:"armor"。refreshLevelAsOverridesが
    // armorColorsGrantedへ毎回再計算する。BS05白夜の虚空Lv2：転召持ちに装甲：赤/紫/緑/白）
    return (inst.armorColorsGranted ?? []).some((c) => sourceColors.includes(c))
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
                return true
            }
        }
    }
    return false
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
export function noLifeDamageByCost(board: Board, attacker: CardInstance): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果）も含める
        for (const inst of effectSources(board, pid)) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "noLifeDamageByCost") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                const { maxCost } = effect.constraint
                if (instAllCosts(attacker).some((cost) => cost <= maxCost)) return true
            }
        }
    }
    return false
}

// 片側限定のライフ保護（TurnConstraintDef "noLifeDamageByCostForPid"。BS07秘密の花園Lv2）：
// このターンの間、コストがmaxCost以下のスピリットのアタックでは defenderPid のライフだけが減らされない。
// noLifeDamageByCost（両陣営）と違い、守られるのは積んだ側だけ
export function lifeProtectedByCostThisTurn(
    board: Board,
    defenderPid: PlayerId,
    attacker: CardInstance,
): boolean {
    return board.turnConstraints.some(
        (c) =>
            c.type === "noLifeDamageByCostForPid" &&
            c.pid === defenderPid &&
            instAllCosts(attacker).some((cost) => cost <= c.maxCost),
    )
}

export function hasMagicImmunity(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
): boolean {
    return hasImmunityAgainst(board, ownerPid, inst, "magic")
}

// 発生源の持ち主の familyFilter/colorFilter 一致スピリットは、相手の効果によるバウンス
// （returnToHand/returnAllToHand）を受けない（kind:"immunityGrant" against:"bounce"。BS06恐竜姫ジュラ）。
// 呼び出し側（handDeck.tsのbounceガード）は自分自身の効果には適用しない（対象の持ち主==効果の持ち主なら呼ばない）
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
            // familyFilter一致（配列＝OR。matchesFamilyFilterで判定） ‖ includeSelf指定時は発生源自身も対象
            // （BS05白亜の竜使いアルブス：自身は対象系統を持たないが対象に含む）
            if (effect.familyFilter !== undefined) {
                const familyOk = matchesFamilyFilter(board, ownerPid, inst, effect.familyFilter)
                const selfOk = effect.includeSelf === true && inst.instanceId === source.instanceId
                if (!familyOk && !selfOk) continue
            }
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) continue
            if (effect.condition) {
                const { cost, count } = effect.condition.ownCostCountAtLeast
                // 場のスピリットのコストを条件にする判定なので、道化師クランの付与コストも見る（instHasCost）
                const matchCount = countSpiritsWeighted(board, ownerPid, ownerPid, (s) => instHasCost(s, cost))
                if (matchCount < count) continue
            }
            return true
        }
    }
    return false
}

// このターン限りの全体制約（turnConstraints）により、指定スピリットがアタック/ブロックできないか（ヘビィゲート）
export function cantActByCost(board: Board, inst: CardInstance): boolean {
    // 道化師クランの tempAlsoCosts（一時付与）／alsoCostsContinuous（継続付与）も判定対象に含める：
    // 実コスト・付与コストのいずれかがmaxCost以下なら対象
    // （2026-08-02修正：以前はalsoCostsContinuousを見ておらず、クラン常設中でも判定に反映されないバグがあった）
    return board.turnConstraints.some((c) =>
        c.type === "cantActByCost" && instAllCosts(inst).some((cost) => cost <= c.maxCost),
    )
}

// ---- 覚醒・起動能力・指定アタック（UIハイライトとサーバー検証で共有する判定） ----

// 【覚醒】を現在レベルで持っているか。
// 静的キーワードは **effects の levels を尊重する**（「Lv2・Lv3【覚醒】」を Lv1 で使えないようにする）。
// 一時付与（スピリットリンク）・継続付与（ディラノス）はレベル指定を持たないためそのまま有効。
// なお spiritHasKeyword の静的分岐はレベルを見ないため、レベルを尊重したい呼び出しはこちらを使う
// 【神速】召喚のコスト支払いに使える、持ち主のフィールドのインスタンス集合。
//
// **基礎ルール: 神速召喚の支払いはリザーブからのみ**（通常召喚と違い、フィールドのコアは使えない）。
// kind:"sokuPaySourceGrant" が有効な発生源があるぶんだけ、フィールドからの支払いが許可される
// （BS04旋風渦巻く渓谷Lv2＝自分のフィールドすべて／BS04甲殻戦士ロングホーンLv2-3＝ロングホーン上のみ）。
// サーバー validateSummon とクライアントの支払いUIが共用する
export function sokuPayableInstanceIds(board: Board, pid: PlayerId): Set<string> {
    const allowed = new Set<string>()
    for (const source of effectSources(board, pid)) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "sokuPaySourceGrant") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== board.turnPlayer) continue
            if (effect.scope === "self") {
                allowed.add(source.instanceId)
                continue
            }
            const player = board.players[pid]
            for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
                allowed.add(inst.instanceId)
            }
        }
    }
    return allowed
}

// pendingChoice の候補に混ぜると「相手のリザーブ」を意味する番兵。
// 通常の instanceId とは衝突しない固定文字列（BS03-075 犬人マードック：
// 「相手のフィールド/リザーブから」コアをトラッシュへ置く）
export const OPPONENT_RESERVE_TARGET = "opponent-reserve"

// GameAction awaken の fromInstanceId に渡すと「自分のリザーブから」の意味になる番兵。
// 通常の instanceId とは衝突しない固定文字列（BS05合成恐竜ディノゾールLv2）
export const AWAKEN_FROM_RESERVE = "reserve"

// 【覚醒】のコア移動元に自分のリザーブを使えるか（kind:"awakenFromReserve" が有効な発生源が
// 持ち主のフィールドにあるか。ディノゾールLv2が自分のスピリットすべての【覚醒】を書き換える）。
// サーバー validateAwaken とクライアントの覚醒UIが共用する
export function canAwakenFromReserve(board: Board, ownerPid: PlayerId): boolean {
    for (const source of effectSources(board, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "awakenFromReserve") continue
            if (effectActiveAtLevel(effect.levels, level)) return true
        }
    }
    return false
}

export function canAwaken(board: Board, ownerPid: PlayerId, inst: CardInstance): boolean {
    const level = currentLevel(inst).level
    const staticAwaken = card(inst.cardId).effects.some(
        (e) => e.kind === "keyword" && e.keyword === "awaken" && effectActiveAtLevel(e.levels, level),
    )
    if (staticAwaken) return true
    return inst.tempKeywords.some((k) => k.keyword === "awaken")
        || hasContinuousKeywordGrant(board, ownerPid, inst, "awaken")
}

// 起動能力（kind: "activated"）が今このスピリットで発動可能なら {effectId, costLabel} を返す。
// フラッシュ中・優先権保持・（condition が要求するなら）self がバトル当事者・コスト支払い可能を満たす必要がある。
// バトル当事者であることは condition:"selfInBattle" のときだけの条件で、
// 発動タイミングがバトル中（timing:"flashBattle"）であること自体とは別（BS07桜の妖精オウカは
// バトルに参加していなくてもアタック中の味方をBP+できる）
export function activatableAbility(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): { effectId: string; costLabel: string } | null {
    if (!board.battle || !board.isFlashTiming) return null
    if (board.priorityPlayer !== pid) return null
    const inBattle =
        board.battle.attackerInstanceId === inst.instanceId ||
        board.battle.blockerInstanceId === inst.instanceId
    const level = currentLevel(inst).level
    for (const e of card(inst.cardId).effects) {
        if (e.kind !== "activated") continue
        if (!effectActiveAtLevel(e.levels, level)) continue
        if (e.condition === "selfInBattle" && !inBattle) continue
        if ("exhaustSelf" in e.cost) {
            if (inst.isRested) continue
            return { effectId: e.id, costLabel: "このスピリットを疲労させて効果を発動" }
        }
        if (board.players[pid].reserve < e.cost.reserveToTrash) continue
        return { effectId: e.id, costLabel: `コア${e.cost.reserveToTrash}個を払って効果を発動` }
    }
    return null
}

// 指定アタック（canDirectAttack）の対象条件（targetFilter状態条件＋targetMinBpのBP条件）
export interface DirectAttackFilter {
    targetFilter: "rested" | "singleCore" | "recovered" | "any"
    targetMinBp?: number // 指定時は相手スピリットの実効BPがこれ以上のもののみ指定できる（BS05シンクロニシティ：BP4000以上）
    targetMinCost?: number // 指定時は相手スピリットのコストがこれ以上のもののみ指定できる（BS05天焦がす大聖火Lv2：コスト5以上）
}

// 指定アタック（canDirectAttack）を現在レベルで持っていれば、その対象条件を返す
export function directAttackFilter(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): DirectAttackFilter | null {
    const constraint = activeConstraints(board, pid, inst).find((c) => c.type === "canDirectAttack")
    if (!constraint || constraint.type !== "canDirectAttack") return null
    const filter: DirectAttackFilter = { targetFilter: constraint.targetFilter }
    if (constraint.targetMinBp !== undefined) filter.targetMinBp = constraint.targetMinBp
    if (constraint.targetMinCost !== undefined) filter.targetMinCost = constraint.targetMinCost
    return filter
}

// ---- 維持コア ----

// 維持コア数＝そのカードが持つ**最小レベル**の必要コア数。
// これを下回るとスピリットは消滅する（ネクサスはレベルが下がるだけ）。
// 現行カードはすべて Lv1 を持つため値は Lv1 のコア数と一致するが、Lv3 から始まるカード
// （アルティメット。ULTIMATE.md §4）では Lv1 が存在しないため、最小レベルを見る必要がある。
// 旧名 lv1Cores（2026-07-26 改名。挙動は不変）。
// サーバー側は server/src/logic/GameState.ts の re-export 経由で使う
export function minLevelCores(cardData: CardData): number {
    const min = cardData.levels.reduce<{ level: number; cores: number } | null>(
        (best, l) => (best === null || l.level < best.level ? l : best),
        null,
    )
    return min ? min.cores : 0
}

// ---- フラッシュのロック ----

// pid がいま「フラッシュで手札のカードを使えない」状態か。
// ① action "lockFlash" がこのバトルに立てたロック（board.battle.flashLockedPlayer）
// ② 相手の継続効果 kind:"flashLockWhileAttackingFamily"（BS07ウィリアンスラッシュ）：
//    相手の指定系統スピリットがアタックしている間だけ効く
export function isFlashLockedFor(board: Board, pid: PlayerId): boolean {
    if (board.battle?.flashLockedPlayer === pid) return true
    const attackerId = board.battle?.attackerInstanceId
    if (attackerId === undefined) return false
    const opp: PlayerId = pid === "p1" ? "p2" : "p1"
    const attacker = board.players[opp].field.spirits.find((s) => s.instanceId === attackerId)
    if (!attacker) return false
    for (const source of effectSources(board, opp)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "flashLockWhileAttackingFamily") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (matchesFamilyFilter(board, opp, attacker, effect.familyFilter)) return true
        }
    }
    return false
}
