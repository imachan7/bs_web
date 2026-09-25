// キーワードの定義・レベルと BP・ブレイヴの合成・盤面の位置（shared/rules.ts から分割。判定の規約は shared/rules.ts 冒頭）

import type {
    CardData,
    CardInstance,
    Color,
    Keyword,
    LevelDef,
    PlayerId,
    TriggerEvent,
} from "../../server/src/type"
import type { Board, BoardPlayer } from "../board"
import { card } from "../cardDb"
import { minLevelCoresOf } from "./activation"
import { activeConstraints, hasGlobalConstraint, timedPlayerRules } from "./constraints"
import { spiritHasFamily, spiritHasKeyword } from "./keywordState"
import { cardNameContains } from "./targetFilter"

// ---- キーワード ----

// キーワードの存在と表示名を一元管理する（挙動は GameEngine / RuleValidator が hasKeyword で参照する）
export interface KeywordInfo {
    id: Keyword
    label: string
}

// キーワード効果のレジストリ。カードデータには名前だけを持たせ、挙動はエンジン側で解決する
export const KEYWORDS: Record<Keyword, KeywordInfo> = {
    soku: { id: "soku", label: "神速" },
    resshinsoku: { id: "resshinsoku", label: "烈神速" },
    awaken: { id: "awaken", label: "覚醒" },
    superAwaken: { id: "superAwaken", label: "超覚醒" },
    clash: { id: "clash", label: "激突" },
    armor: { id: "armor", label: "装甲" },
    heavyArmor: { id: "heavyArmor", label: "重装甲" },
    jugeki: { id: "jugeki", label: "呪撃" },
    funsai: { id: "funsai", label: "粉砕" },
    daifunsai: { id: "daifunsai", label: "大粉砕" },
    kobo: { id: "kobo", label: "光芒" },
    tensho: { id: "tensho", label: "転召" },
    bofu: { id: "bofu", label: "暴風" },
    seimei: { id: "seimei", label: "聖命" },
    kyoshu: { id: "kyoshu", label: "強襲" },
    hyoheki: { id: "hyoheki", label: "氷壁" },
    fushi: { id: "fushi", label: "不死" },
    jumetsugeki: { id: "jumetsugeki", label: "呪滅撃" },
}

// キーワードの**包含関係**：左のキーワードを参照する効果は、右のキーワードを持つ個体にも当たる。
// 【超覚醒】は【覚醒】を含む（効果文が「覚醒」を含む以上、参照されるべき。2026-08-25 ユーザー確認）。
// 逆向きには効かない（「【超覚醒】を持つ〜」は【覚醒】だけの個体を拾わない）
const KEYWORD_INCLUDES: Partial<Record<Keyword, Keyword[]>> = {
    awaken: ["superAwaken"],
}
export function keywordMatches(has: Keyword, asked: Keyword): boolean {
    return has === asked || (KEYWORD_INCLUDES[asked]?.includes(has) ?? false)
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
// カードに静的に書かれたキーワードエントリの指定数（【暴風：1】の1）。付与されたキーワードは指定数を持たないので見ない
export function staticKeywordCount(inst: CardInstance, keyword: Keyword): number | undefined {
    const level = currentLevel(inst).level
    for (const effect of card(inst.cardId).effects) {
        if (effect.kind !== "keyword" || effect.keyword !== keyword) continue
        if (!effectActiveAtLevel(effect.levels, level)) continue
        return effect.count ?? 1
    }
    return undefined
}

export function effectActiveAtLevel(levels: number[] | null, level: number): boolean {
    return levels === null || levels.includes(level)
}

// このインスタンスが**合体しているか**（docs/design/BRAVE.md §12.3）。
// ホスト側のスピリット（ブレイヴを参照している）と、合体中のブレイヴ自身の両方で true。
// **盤面を見ない純粋な述語**なので、どの層からでも呼べる
export function instIsCombined(inst: CardInstance): boolean {
    return (inst.braveRefs?.length ?? 0) > 0 || inst.braveCombined === true
}

// 効果エントリが**いま発揮されているか**。レベル条件に加えて【合体時】のゲートも見る。
//
// ⚠️ `whileCombined` を宣言しているのは **keyword / triggered / aura / constraint / fieldEvent** の5 kind だけ
// （server/src/type.ts）。他の kind に書くと validate:cards の「型宣言の無いキー」検査が落ちるので、
// **ゲートを実装していない kind に 【合体時】 が無言で素通りすることはない**。
// 新しい kind に【合体時】が要るようになったら、型宣言と走査の両方を足すこと
export function effectActiveOn(
    inst: CardInstance,
    effect: { levels: number[] | null; whileCombined?: true },
    level: number,
): boolean {
    if (!effectActiveAtLevel(effect.levels, level)) return false
    return effect.whileCombined !== true || instIsCombined(inst)
}

// 【合体時】の色条件（X008 神星皇ストライク・アポロドラゴン＝「赤/紫/青のブレイヴとの合体時」）。
// 合体しているブレイヴの**いずれか1つ**が指定色のどれかを持てば成立する（多色ブレイヴは1色でも含めば該当。
// 2026-09-07 ユーザー確認）。色違いのブレイヴを両方付ければ、色違いの2つの効果が両方成立する。
// colors 未指定なら常に成立＝既存カードの挙動は変わらない
export function combinedBraveColorsOk(
    player: BoardPlayer,
    host: CardInstance,
    colors: Color[] | undefined,
): boolean {
    if (colors === undefined) return true
    return bravesOf(player, host).some((b) => colors.some((c) => instHasColor(b, c)))
}

// カードに効果の記述を持たない（バニラ）か
export function isVanillaCard(cardData: CardData): boolean {
    return cardData.effect === ""
}

// トラッシュにあるこのカードが、一切の効果を受けない（kind:"trashImmunity"）か。
// フィールドの状態・現在Lvと無関係にカード静的なデータだけで判定する（effectSources経由ではない＝
// トラッシュのカードはそもそも場にいないため、effectActiveOn等のレベル判定が使えない）。
// **トラッシュにあるカードを対象にする効果は、候補を絞り込む箇所でこれを1つ呼ぶこと**
// （noTrashRecoveryのように各ハンドラ冒頭へ個別に書くと、書き忘れの経路が残る。
// BS10-108ルナティックシール：「トラッシュにあるこのマジックカードは、一切の効果を受けない」＝自分の効果からも守られる）
export function isTrashCardProtected(cardId: string): boolean {
    return card(cardId).effects.some((e) => e.kind === "trashImmunity")
}

// トラッシュにあるこのカードが、持ち主の『自分のエンドステップ』に手札へ戻るか（kind:"trashReturnAtEndStep"）。
// isTrashCardProtectedと同じくカード静的なデータだけで判定する（BS13-015冥総裁ハーゲン：
// 「自分のトラッシュにあるこのスピリットカードは、『自分のエンドステップ』に手札に戻る。」）
export function isTrashReturnAtEndStep(cardId: string): boolean {
    return card(cardId).effects.some((e) => e.kind === "trashReturnAtEndStep")
}

// インスタンス単位のバニラ判定：カード静的（効果テキストが空）‖ 継続付与された「バニラとしても扱う」
// （kind:"vanillaAsGrant"。refreshLevelAsOverrides が CardInstance.treatedAsVanillaContinuous を都度再構築する）。
// **場のインスタンスを判定するときは必ずこちらを使う**（isVanillaCard を直接呼ぶと付与が無言で無視される）
export function instIsVanilla(inst: CardInstance): boolean {
    if (inst.treatedAsVanillaContinuous === true) return true
    // このターンだけスピリットとして扱われているネクサスは「効果の記述なし」（BS03ゴーレムクラフト）
    if (inst.asSpiritThisTurn !== undefined) return true
    return isVanillaCard(card(inst.cardId))
}

// この個体が「持つ効果すべてを発揮しない」状態か。判定軸は2つ:
// ① 継続付与の kind:"spiritEffectsDisabledGrant"（BS07ルナースラッシュ）
// ② このターンだけスピリットとして扱われているネクサス＝「ネクサスとしての効果を失い」（BS03ゴーレムクラフト）
// **発揮を止める箇所は必ずこの述語を通すこと**（effectSources / activeConstraints / spiritHasKeyword /
// EffectModules.fireTrigger の4か所。片方だけを直接見ると、もう一方の軸が無言ですり抜ける）
export function instEffectsSuppressed(inst: CardInstance): boolean {
    return inst.effectsDisabledContinuous === true || inst.asSpiritThisTurn !== undefined
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
        ...player.field.spirits.filter((s) => !instEffectsSuppressed(s)),
        // フィールドに実在するネクサス。相手が「相手のネクサスすべての効果は発揮されない」を出している間は丸ごと外す。
        // さらに「**疲労状態の**ネクサスすべての効果は発揮されない」（BS10-074 きぐるみクマッター）は両陣営に効く
        ...(nexusEffectsDisabledFor(board, pid)
            ? []
            : restedNexusEffectsDisabled(board)
              ? player.field.nexuses.filter((n) => !n.isRested)
              : player.field.nexuses),
        // **合体中のブレイヴ**（BRAVE.md §4）。これで aura / constraint / keywordGrant / fieldEvent /
        // reviveOnDestroy / mustBlockGrant など走査すべてが【合体中】効果に対応する。
        // ⚠️ ホストが「持つ効果すべては発揮されない」を受けていたら、**合体中ブレイヴの効果も止まる**
        // （2026-08-25 ユーザー確認。§12 の1。合体スピリットは1体なので、その1体の効果が止まる）
        ...player.field.combinedBraves.filter(
            (b) =>
                !instEffectsSuppressed(b) &&
                hostsOf(player, b).some((h) => !instEffectsSuppressed(h)),
        ),
        ...player.turnVirtualInstances, // 実在しないが効果を出す発生源：このターン限定（マジックが貸した継続効果）
        ...player.battleVirtualInstances, // 同上のこのバトル限定版（lendSelfThisBattle。clearBattle で消える）
    ]
}

// 「疲労状態のネクサスすべての効果は発揮されない」（globalConstraint。BS10-074 きぐるみクマッター）。
// ⚠️ ここで effectSources を呼ぶと無限再帰するので、両陣営の配列を**直接**走査する
// （nexusEffectsDisabledFor と同じ理由・同じ書き方）。
// 判定する側のネクサスが疲労していれば、そのネクサス自身の効果も止まる（両陣営に効く常在効果なので一貫する）
function restedNexusEffectsDisabled(board: Board): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = board.players[pid]
        for (const source of [...p.field.spirits, ...p.field.nexuses, ...p.field.combinedBraves, ...p.turnVirtualInstances, ...p.battleVirtualInstances]) {
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "restedNexusEffectsDisabled") continue
                if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                if (effect.whileCombined === true && !instIsCombined(source)) continue
                return true
            }
        }
    }
    return false
}

// pid のネクサスの効果が、相手の kind:"nexusEffectsDisabled" によって発揮されない状態か
// （BS05ネクサスブロケイド）。
// ⚠️ ここで effectSources を呼ぶと無限再帰するので、相手側の配列を**直接**走査する。
// ネクサスが自分自身を無効化する形は現データに無いが、仮に書かれても
// 「無効化する側のネクサス」は下の走査に含まれるため一貫して効く
function nexusEffectsDisabledFor(board: Board, pid: PlayerId): boolean {
    if (timedPlayerRules(board, pid).some((c) => c.type === "nexusEffectsDisabledForPid")) return true
    const opp = board.players[pid === "p1" ? "p2" : "p1"]
    const sources = [
        ...opp.field.spirits,
        ...opp.field.nexuses,
        ...opp.turnVirtualInstances,
        ...opp.battleVirtualInstances,
    ]
    for (const source of sources) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "nexusEffectsDisabled") continue
            if (effect.target !== "opponentAll" && effect.target !== "bothAll") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.condition?.ownFieldOnlyColor && !ownFieldOnlyColor(board, pid === "p1" ? "p2" : "p1", effect.condition.ownFieldOnlyColor, effect.condition.spiritsOnly)) continue
            return true
        }
    }
    // target:"bothAll" は**自分の**ネクサスも止める（BS15-034：白しかない間、両陣営のネクサス効果が発揮されない）
    const own = board.players[pid]
    const ownSources = [
        ...own.field.spirits,
        ...own.field.nexuses,
        ...own.turnVirtualInstances,
        ...own.battleVirtualInstances,
    ]
    for (const source of ownSources) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "nexusEffectsDisabled") continue
            if (effect.target !== "bothAll") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.condition?.ownFieldOnlyColor && !ownFieldOnlyColor(board, pid, effect.condition.ownFieldOnlyColor, effect.condition.spiritsOnly)) continue
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
    if (instBaseCost(inst) === cost) return true
    if (inst.tempAlsoCosts.includes(cost)) return true
    return (inst.alsoCostsContinuous ?? []).includes(cost)
}

// このインスタンスに掛かっている**コストの増減の合計**（「このターンの間、コスト+3する」など）。
// **コストを読む処理はすべて instBaseCost を通るので、増減の種類が増えたらここに項を足せば全体へ効く**。
// いまは「このターンの間」の増減（timedCostDelta）だけだが、今後のブレイヴ（合体中はコストが加算される）の
// ような継続の増減もここへ足すこと。個別の判定側に足し算を散らさない
export function instCostDelta(inst: CardInstance): number {
    // 合体しているブレイヴのコストが加算される（BRAVE.md §1.1・§3.1）。
    // instBaseCost が唯一のコスト算出口なので、ここに1項足せば
    // 「コスト◯以下を破壊」「同じコストの相手を疲労」などコストを見る判定すべてに一度で効く
    return (inst.timedCostDelta ?? 0) + (inst.costDeltaContinuous ?? 0) + (inst.braveComposite?.cost ?? 0)
}

// このインスタンスの「本来のコスト」。asSpiritThisTurn（このターンだけスピリットとして扱われている
// ネクサス。BS03ゴーレムクラフト）が載っていれば、カード静的なコストではなくそちらの値を使う
// （上書きであって追加ではないので、元のネクサスのコストは残らない）。
// そのうえで instCostDelta の増減を足す（**増減は置き換えであって追加ではない**＝元のコストは残らない。
// 「コスト+3」したスピリットは、相手の「コスト3以下を破壊」にはもう当たらない。BS08グロウアップ）
export function instBaseCost(inst: CardInstance): number {
    // braveStatsAsContinuous（kind:"braveStatsAs"。BS10-X06）が asSpiritThisTurn より優先。
    // 両方が同時に載ることは現状ない（ネクサス限定 vs ブレイヴ限定）が、優先順位は明示しておく
    return Math.max(
        0,
        (inst.braveStatsAsContinuous?.cost ?? inst.asSpiritThisTurn?.cost ?? card(inst.cardId).cost) +
            instCostDelta(inst),
    )
}

// このインスタンスの「カード側の系統」。braveStatsAsContinuous / asSpiritThisTurn があればその系統で置き換わる
// （付与効果による系統は含まない。それらは spiritHasFamily が別途見る）
export function instFamilies(inst: CardInstance): string[] {
    return inst.braveStatsAsContinuous?.family ?? inst.asSpiritThisTurn?.family ?? card(inst.cardId).family
}

// インスタンスが「扱われている」コストの一覧（本来のコスト＋tempAlsoCosts＋alsoCostsContinuous）。
// 単一値の一致判定は instHasCost、範囲判定は instMatchesCostFilter を使えば足りるので、
// それらで表現できない判定（costCantAct のように「どのコストか」を都度渡す関数へORで橋渡しする、
// 2インスタンス間でコストを比較する、等）でのみ使うこと
export function instAllCosts(inst: CardInstance): number[] {
    return [instBaseCost(inst), ...inst.tempAlsoCosts, ...(inst.alsoCostsContinuous ?? [])]
}

// カード（手札・デッキ・トラッシュ＝インスタンスが無い経路）の色判定。
// **色の一致判定は必ずこの述語か instHasColor を通すこと**（`card.color === c` を直接書かない）。
// BS05 で多色カードが入ると CardData の色が配列になるため、直接比較は静かに壊れる（MULTICOLOR.md 参照）
export function cardHasColor(cardData: CardData, color: Color): boolean {
    return cardData.colors.includes(color)
}

// 状態を考慮した色判定：master色 ‖ 一時付与された色（timedColors。アディショナルカラー） ‖
// 継続的な色置換（colorsAsContinuous。百面相のフラットフェイス）
// ⚠️ colorlessThisBattle（器S。BS13-011/015/052「色を無いものとして扱う」）が立っている間は、
//    付与色も含めて常に無色（false）を返す
export function instHasColor(inst: CardInstance, color: Color): boolean {
    if (inst.colorlessThisBattle) return false
    if (cardHasColor(card(inst.cardId), color)) return true
    if (inst.timedColors.includes(color)) return true
    return (inst.colorsAsContinuous ?? []).includes(color)
}

// 状態を考慮した色の一覧。「発生源の色」を装甲判定などへまとめて渡すときに使う
// （多色カードは複数返る。付与色＝timedColors／colorsAsContinuous も含む）
// colorlessThisBattle が立っている間は常に空配列（instHasColorと同じ扱い）
export function instColors(inst: CardInstance): Color[] {
    if (inst.colorlessThisBattle) return []
    const colors = new Set<Color>(card(inst.cardId).colors)
    for (const c of inst.timedColors) colors.add(c)
    for (const c of inst.colorsAsContinuous ?? []) colors.add(c)
    // 合体しているブレイヴの色が加わり、合体スピリットは**混色扱い**になる
    // （BRAVE.md §12.2。2026-08-25 ユーザー確認）。装甲・軽減・「相手の〈色〉のスピリット」の
    // 絞り込みはすべてこの合成後の色で行う。
    // ⚠️ **colorsAsContinuous には入れないこと**。あちらは「◯色としても扱う」で、
    // countSymbols が「その色のシンボルとしても数える」ために読む枠。ブレイヴの色を混ぜると
    // ホストのシンボルまでブレイヴの色として数えられ、混色軽減バグと同じ二重計上になる
    for (const c of inst.braveComposite?.colors ?? []) colors.add(c)
    return [...colors]
}

// 持ち主から見た相手フィールド（スピリット+ネクサス）の色の種類数（重複除く）。
// 「相手のフィールドのスピリット/ネクサスの色1色につき」を表す共通器（BS15）。
// 多色カードは各色を数える。合体中のブレイヴの色は instColors（braveComposite.colors 経由）で
// 自動的に含まれる。colorlessThisBattle の個体は instColors が空配列を返すため自動的に除外される
export function opponentFieldColorCount(board: Board, pid: PlayerId, spiritsOnly = false): number {
    const opp = board.players[pid === "p1" ? "p2" : "p1"]
    const insts = spiritsOnly ? opp.field.spirits : [...opp.field.spirits, ...opp.field.nexuses]
    const colors = new Set<Color>()
    for (const inst of insts) for (const c of instColors(inst)) colors.add(c)
    return colors.size
}

// 自分のフィールド（スピリット+ネクサス）のカードがすべて指定色1色だけか。
// 「自分のフィールドに◯のスピリット/ネクサスしかない」を表す共通器（BS15）。
// 多色が1枚でもあれば不成立、0枚でも不成立（空虚な真にしない）
export function ownFieldOnlyColor(board: Board, pid: PlayerId, color: Color, spiritsOnly = false): boolean {
    const own = board.players[pid]
    const insts = spiritsOnly ? own.field.spirits : [...own.field.spirits, ...own.field.nexuses]
    if (insts.length === 0) return false
    return insts.every((inst) => {
        const colors = instColors(inst)
        return colors.length === 1 && colors[0] === color
    })
}

// 現在のレベルとBP。timedLevel（このターンの上書き）または levelAsContinuous（継続置換）が
// あればそちらを優先し、無ければコア数（coresOverride があればそれ）から判定する。
// BP には tempBpBuff と battleBpBuff を加算する（レベル0＝維持コア割れの場合は加算しない）。
// 両者の違いは寿命だけ：tempBpBuff はターン終了まで、battleBpBuff は clearBattle まで
export function currentLevel(inst: CardInstance): { level: number; bp: number } {
    return levelOf(inst, true)
}

// 「見た目・他のカードから見えるレベル」。**効果の発揮判定にだけ効く置き換え**
// （levelAsEffectsOnly。BS03ウッド・ゴレム「相手のネクサスすべてのLv2効果は発揮されない」）を無視する。
//
// ウッド・ゴレムは「Lv2効果を発揮させない」だけで、相手のネクサスをLv1にするわけではない。
// currentLevel（＝効果の発揮判定が通る道）に置き換えを載せると、**画面のレベル表示や
// 「Lv1のネクサスを破壊する」（BS03バスターランス）の判定にまで当たってしまう**。
// **他のカードから見えるレベルを読む処理はこちらを使うこと**（対象の絞り込み・表示）。
// 自分の効果を発揮するかどうかの判定は currentLevel のままでよい
export function displayLevel(inst: CardInstance): { level: number; bp: number } {
    return levelOf(inst, false)
}

function levelOf(inst: CardInstance, forEffects: boolean): { level: number; bp: number } {
    const buff = inst.tempBpBuff + (inst.battleBpBuff ?? 0)
    // asSpiritThisTurn（このターンだけスピリットとして扱われているネクサス。BS03ゴーレムクラフト）が
    // 載っていれば、カード静的な levels ではなく上書きされた levels で判定する。
    // ネクサスのLv1コア数は全カード0のため、これが無いとコア0でもLv1のまま消滅しない
    const levels = instLevels(inst)
    // 器N：破壊処理中、「最高Lvとして破壊される」判定のためLvをそのカードの最大Lvとして扱う
    // （destroySpiritがdestroyAsMaxLevel を立てる。BS12-057/069）
    if (inst.destroyAsMaxLevel) {
        const maxLv = levels.reduce((m, l) => (l.level > m.level ? l : m), levels[0] ?? { level: 0, cores: 0, bp: 0 })
        return { level: maxLv.level, bp: maxLv.bp + (maxLv.level > 0 ? buff : 0) }
    }
    // 効果の発揮判定にだけ効く置き換えは、他から見えるレベル（forEffects=false）では無視する
    const continuous = inst.levelAsEffectsOnly && !forEffects ? undefined : inst.levelAsContinuous
    const override = inst.timedLevel ?? continuous
    if (override !== undefined) {
        const lv = levels.find((l) => l.level === override)
        if (lv) {
            return { level: lv.level, bp: lv.bp + (lv.level > 0 ? buff : 0) }
        }
    }
    // coresOverride（クロスシザースのネクサスコア数リンク）があれば、レベル判定はそちらを使う
    const coreCount = inst.coresOverride ?? inst.cores
    let result = { level: 0, bp: 0 }
    for (const lv of levels) {
        if (coreCount >= lv.cores && lv.level > result.level) {
            result = { level: lv.level, bp: lv.bp }
        }
    }
    return { level: result.level, bp: result.bp + (result.level > 0 ? buff : 0) }
}

// ---- ブレイヴ（docs/design/BRAVE.md §2.3）----
//
// 合体中のブレイヴの実体は `field.combinedBraves` にあり、ホストは `braveRefs` で参照する。
// **参照の解決を各所に散らさないため、必ずこの3つを通すこと。**

// ホストに合体しているブレイヴの実体。参照が切れている（実体が既に無い）ぶんは黙って落とす
export function bravesOf(player: BoardPlayer, host: CardInstance): CardInstance[] {
    const refs = host.braveRefs
    if (refs === undefined || refs.length === 0) return []
    const found: CardInstance[] = []
    for (const r of refs) {
        const b = player.field.combinedBraves.find((x) => x.instanceId === r.instanceId)
        if (b !== undefined && !found.includes(b)) found.push(b)
    }
    return found
}

// ブレイヴが合体しているホスト。**異魔神ブレイヴは2体returnsする**（実体1つ・参照2本）
export function hostsOf(player: BoardPlayer, brave: CardInstance): CardInstance[] {
    return player.field.spirits.filter((s) =>
        (s.braveRefs ?? []).some((r) => r.instanceId === brave.instanceId),
    )
}

// 合体状態のブレイヴのレベル。**合体スピリット上のコア数**（＝ホストのコア数）を
// ブレイヴの `braveLevels` で引く。合体状態の Lv1 は 0 コアなので、コア0でも Lv1 になる。
//
// ⚠️ ホストの `levelCostBonusContinuous`（バァラル型「Lvコストを+N」）は**足さない**
// （2026-08-25 ユーザー確認。BRAVE.md §12 の5。上がるのはホストのLvコストだけ）。
// そのため instLevels ではなくカード静的な braveLevels を直接引く
export function braveLevelOf(host: CardInstance, brave: CardInstance): number {
    const levels = card(brave.cardId).braveLevels
    if (levels === undefined || levels.length === 0) return 0
    const coreCount = host.coresOverride ?? host.cores
    let level = 0
    for (const lv of levels) {
        if (coreCount >= lv.cores && lv.level > level) level = lv.level
    }
    return level
}

// 合体しているブレイヴが足す「合体時BP+」の合計。**ホストのコア数で合体状態のレベルが変わる**ため、
// braveComposite（レベルに依らない値のキャッシュ）には入れず、ここで都度引く
export function braveBpBonus(board: Board, player: BoardPlayer, host: CardInstance): number {
    // BS14-090勇壮なる船上都市：両陣営の合体スピリットすべての「合体時BP+」を0にする
    if (hasGlobalConstraint(board, "braveBpBonusZero")) return 0
    let total = 0
    for (const brave of bravesOf(player, host)) {
        // braveCombined が載っていれば currentLevel が合体状態のレベル表を引く（instLevels）。
        // まだ載っていない（refreshLevelAsOverrides 前）ときのために braveLevelOf でも引けるようにしておく
        if (brave.braveCombined === true) {
            total += currentLevel(brave).bp
            continue
        }
        const lv = card(brave.cardId).braveLevels?.find((l) => l.level === braveLevelOf(host, brave))
        if (lv !== undefined) total += lv.bp
    }
    return total
}

// スピリット状態のブレイヴを場に残すのに必要なコア数（＝**スピリット状態の**Lv1維持コスト。§1.4）。
// 合体状態の braveLevels ではなく通常の levels を引く
export function braveKeepCores(brave: CardInstance): number {
    // ⚠️ instMinLevelCores を通さないこと。合体中のブレイヴには braveCombined が載っていて、
    // instLevels が**合体状態**のレベル表（Lv1=0コア）を返すため、必要コアが常に0になってしまう
    // （2026-08-25 に実際に踏んだ）。ここが見たいのは**スピリット状態**のLv1維持コスト
    return minLevelCoresOf(card(brave.cardId).levels)
}

// このブレイヴが対象のスピリットに合体できるか（合体条件。§1.2）。
// 条件の配列は OR（効果文の読点区切り）。ホスト側の「既にブレイヴが付いている」判定は
// 呼び出し側（RuleValidator）が見る
export function matchesBraveCondition(
    board: Board,
    hostOwnerPid: PlayerId,
    host: CardInstance,
    braveCardId: string,
): boolean {
    // 器BI：「合体条件を無視して合体できる」（BS13-X05麒麟星獣リーン）
    if (activeConstraints(board, hostOwnerPid, host).some((c) => c.type === "ignoreBraveCondition")) return true
    const cond = card(braveCardId).braveCondition
    if (cond === undefined) return false
    const terms = Array.isArray(cond) ? cond : [cond]
    if (terms.length === 0) return false
    return terms.some((t) => {
        if (t.family !== undefined && !spiritHasFamily(board, hostOwnerPid, host, t.family)) return false
        if (t.minCost !== undefined && instBaseCost(host) < t.minCost) return false
        if (t.cardName !== undefined && !cardNameContains(host, t.cardName)) return false
        // 「合体条件：効果の記述を持たない」（BS10 の18枚中6枚）。
        // 継続付与の「バニラとしても扱う」（BS04スイッチヒッター）も見る instIsVanilla を通す
        if (t.vanilla === true && !instIsVanilla(host)) return false
        if (t.keyword !== undefined && !spiritHasKeyword(board, hostOwnerPid, host, t.keyword)) return false
        return true
    })
}

// このインスタンスが参照すべきレベル表。asSpiritThisTurn の上書きがあればそちらを使う
// （BS03ゴーレムクラフト＝Lv1コスト:1/Lv1BP:2000）。
// **レベル・BP・維持コアをインスタンスから求める処理は必ずこれを経由すること**
export function instLevels(inst: CardInstance): LevelDef[] {
    // 合体中のブレイヴは**合体状態のレベル表**を引く（BRAVE.md §4。Lv1は0コアなので
    // コアを持たなくても Lv1 が成立する）。判定に使うコア数は coresOverride に写した**ホストのコア数**
    // 合体していないときは braveStatsAsContinuous（kind:"braveStatsAs"。BS10-X06）→ asSpiritThisTurn の順に見る
    const levels =
        inst.braveCombined === true
            ? (card(inst.cardId).braveLevels ?? card(inst.cardId).levels)
            : (inst.braveStatsAsContinuous?.braveLevels ?? inst.asSpiritThisTurn?.levels ?? card(inst.cardId).levels)
    // 「Lvコストを+Nする」の継続効果（BS09-017蛇凰神バァラル）。**Lv1のコストも上がる**ので、
    // 維持コア（instMinLevelCores）もここを通って自然に引き上がる
    const bonus = inst.levelCostBonusContinuous ?? 0
    if (bonus === 0) return levels
    return levels.map((lv) => ({ ...lv, cores: lv.cores + bonus }))
}

// インスタンス単位の維持コア数（最小レベルに必要なコア数）。
// **場のインスタンスを判定するときは必ずこちらを使う**（minLevelCores にカードを直接渡すと
// asSpiritThisTurn の上書きが無視され、ネクサスのLv1コア0がそのまま効いて消滅しなくなる）。
// 手札のカードから求める場面（召喚・配置の維持コア計算）は minLevelCores のままでよい
export function instMinLevelCores(inst: CardInstance): number {
    return minLevelCoresOf(instLevels(inst))
}

// ---- 盤面の位置 ----

// 指定インスタンスがそのプレイヤーのフィールドにスピリットとして存在するか
export function isSpiritOnField(board: Board, pid: PlayerId, instanceId: string): boolean {
    return board.players[pid].field.spirits.some((s) => s.instanceId === instanceId)
}

// この個体が**まだ場にいるか**（スピリット／ネクサス／**合体中のブレイヴ**）。
// ⚠️ 合体中のブレイヴは field.spirits の走査には入らないが、カードとしては場に存在し、
// 効果の発生源にもなる（docs/design/BRAVE.md §2.3）。
// 「場を離れたら発火させない」種類の判定は**必ずこれを通すこと**：
// field.spirits だけを見ると、合体中のブレイヴの効果が丸ごと無言で消える
// （2026-08-25 に fireSummonSequence と fireFieldEventTriggers で実際に踏んだ）
export function isOnFieldAnyZone(player: BoardPlayer, instanceId: string): boolean {
    return (
        player.field.spirits.some((x) => x.instanceId === instanceId) ||
        player.field.nexuses.some((x) => x.instanceId === instanceId) ||
        player.field.combinedBraves.some((x) => x.instanceId === instanceId)
    )
}
