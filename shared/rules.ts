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
    CardType,
    Color,
    FamilyFilter,
    Keyword,
    LevelDef,
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
    superAwaken: { id: "superAwaken", label: "超覚醒" },
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
    fushi: { id: "fushi", label: "不死" },
}

// キーワードの**包含関係**：左のキーワードを参照する効果は、右のキーワードを持つ個体にも当たる。
// 【超覚醒】は【覚醒】を含む（効果文が「覚醒」を含む以上、参照されるべき。2026-08-25 ユーザー確認）。
// 逆向きには効かない（「【超覚醒】を持つ〜」は【覚醒】だけの個体を拾わない）
const KEYWORD_INCLUDES: Partial<Record<Keyword, Keyword[]>> = {
    awaken: ["superAwaken"],
}
function keywordMatches(has: Keyword, asked: Keyword): boolean {
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
    if (instBaseCost(inst) === cost) return true
    if (inst.tempAlsoCosts.includes(cost)) return true
    return (inst.alsoCostsContinuous ?? []).includes(cost)
}

// このインスタンスに掛かっている**コストの増減の合計**（「このターンの間、コスト+3する」など）。
// **コストを読む処理はすべて instBaseCost を通るので、増減の種類が増えたらここに項を足せば全体へ効く**。
// いまは「このターンの間」の増減（tempCostDelta）だけだが、今後のブレイヴ（合体中はコストが加算される）の
// ような継続の増減もここへ足すこと。個別の判定側に足し算を散らさない
export function instCostDelta(inst: CardInstance): number {
    // 合体しているブレイヴのコストが加算される（BRAVE.md §1.1・§3.1）。
    // instBaseCost が唯一のコスト算出口なので、ここに1項足せば
    // 「コスト◯以下を破壊」「同じコストの相手を疲労」などコストを見る判定すべてに一度で効く
    return (inst.tempCostDelta ?? 0) + (inst.braveComposite?.cost ?? 0)
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
    // 合体しているブレイヴの色が加わり、合体スピリットは**混色扱い**になる
    // （BRAVE.md §12.2。2026-08-25 ユーザー確認）。装甲・軽減・「相手の〈色〉のスピリット」の
    // 絞り込みはすべてこの合成後の色で行う。
    // ⚠️ **colorsAsContinuous には入れないこと**。あちらは「◯色としても扱う」で、
    // countSymbols が「その色のシンボルとしても数える」ために読む枠。ブレイヴの色を混ぜると
    // ホストのシンボルまでブレイヴの色として数えられ、混色軽減バグと同じ二重計上になる
    for (const c of inst.braveComposite?.colors ?? []) colors.add(c)
    return [...colors]
}

// 現在のレベルとBP。levelOverrideThisTurn（このターンの上書き）または levelAsContinuous（継続置換）が
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
    // 効果の発揮判定にだけ効く置き換えは、他から見えるレベル（forEffects=false）では無視する
    const continuous = inst.levelAsEffectsOnly && !forEffects ? undefined : inst.levelAsContinuous
    const override = inst.levelOverrideThisTurn ?? continuous
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
export function braveBpBonus(player: BoardPlayer, host: CardInstance): number {
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

// ---- シンボル ----

// インスタンスのシンボル数：カードの静的シンボル数 + このターンの追加シンボル数（tempExtraSymbols。ダブルハート）。
// ライフダメージ計算・magicのownFieldHasMinSymbolSpirit条件・bpBuffのminSymbols対象フィルタが共用する
export function instanceSymbolCount(inst: CardInstance): number {
    // symbolsOverrideContinuous（kind:"symbolFix"）: シンボルを固定された個体は、カード静的な
    // シンボルの代わりにこちらを見る（BS08海底に眠りし古代都市）
    if (inst.symbolsOverrideContinuous) {
        // ⚠️ **シンボル固定が勝つ**（BRAVE.md §12 の3。2026-08-25 ユーザー確認）。
        // 合体しているブレイヴのシンボルも固定値に含まれるので、ここでは足さない
        return inst.symbolsOverrideContinuous.length + (inst.tempExtraSymbols ?? 0)
    }
    // 合体しているブレイヴのシンボルが加わる（ライフダメージに効く。BRAVE.md §3）。
    // 色が混色になってもシンボルは合成するだけ＝多色カードと同じ扱い（§12.2）
    return card(inst.cardId).symbol.length + (inst.braveComposite?.symbols.length ?? 0) + (inst.tempExtraSymbols ?? 0)
}

// 軽減計算用：プレイヤーのフィールドにある指定色シンボルの数を数える。
// tempExtraSymbols（ダブルハート）は「持っているシンボルと同じ色を1つ追加」の簡略化として、
// そのインスタンスが元々colors該当のシンボルを持つ場合にのみ加算する
export function countSymbols(player: BoardPlayer, colors: Color[]): number {
    let count = 0
    const all = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of all) {
        // **バウンス待機中のカードのシンボルは軽減に使えない**（バトスピ Wiki「バウンスについて」）。
        // 破壊待機中は使えるので、そこだけ扱いが違う
        if (inst.pendingBounce) continue
        // symbolsOverrideContinuous（kind:"symbolFix"）: 固定されたシンボルで数える（BS08海底に眠りし古代都市）
        // 合体しているブレイヴのシンボルを足す。**シンボル固定を受けていれば固定値が勝つ**（§12 の3）
        const cardSymbols =
            inst.symbolsOverrideContinuous ??
            (inst.braveComposite === undefined
                ? card(inst.cardId).symbol
                : [...card(inst.cardId).symbol, ...inst.braveComposite.symbols])
        // 「このスピリットは◯色のスピリットとしても扱う」（colorAs / tempColors）を持つ個体は、
        // **そのシンボルを付与色のシンボルとしても数える**（2026-08-20 ユーザー確認）。
        // 元の色を失うわけではないので、緑1シンボルの個体が白としても扱われるなら
        // 「緑シンボル1つ」としても「白シンボル1つ」としても数える（置き換えではない）
        const grantedColors = [...inst.tempColors, ...(inst.colorsAsContinuous ?? [])]
        const grantedMatches = grantedColors.some((c) => colors.includes(c))
        let matched = false
        for (const sym of cardSymbols) {
            if (colors.includes(sym) || grantedMatches) {
                count++
                matched = true
            }
        }
        if (matched && inst.tempExtraSymbols) count += inst.tempExtraSymbols
    }
    return count
}

// 軽減計算用：トラッシュにあるカードのシンボル数（BS10-092／BS10-X05）。
// フィールドと違い個体（CardInstance）ではなくカードIDの列なので、カード静的な symbol だけで数える
export function countTrashSymbols(player: BoardPlayer, colors: Color[]): number {
    let count = 0
    for (const cardId of player.trashCards) {
        for (const sym of card(cardId).symbol) {
            if (colors.includes(sym)) count++
        }
    }
    return count
}

// 手札の枚数（内容は隠匿されても枚数は公開情報）。BoardPlayer.handCountがあればそれを使い、
// 無ければhand.length（サーバー内部のPlayerStateは常に実配列）にフォールバックする
export function handSizeOf(player: BoardPlayer): number {
    return player.handCount ?? player.hand?.length ?? 0
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
    if (inst.tempKeywords.some((k) => keywordMatches(k.keyword, keyword))) return true
    return hasContinuousKeywordGrant(board, ownerPid, inst, keyword)
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

// ---- 効果耐性の一本化（2026-08-10） ----
//
// 【この節が唯一の判定表】耐性は6つの述語（hasArmorAgainst / hasMagicImmunity /
// hasFullEffectImmunity / isUntargetableByOpponent / hasBounceImmunity / isExhaustImmune）に
// 分かれていて、**呼び出し側が「どれを見るべきか」を毎回自分で判断していた**。
// 約70か所あり、書き忘れても型は通り smoke も落ちない
// （2026-08-10 に直した「範囲コア奪取が装甲を素通り」がまさにこれ。10ハンドラで漏れていた）。
//
// **新しく「相手のスピリットに何かをする」処理を書くときは、個別の述語を並べずにここを1回呼ぶこと。**
// サーバー側はさらに一時的な解決状態（対象の絞り込み・召喚時効果免疫）も見る必要があるので、
// EffectModules.resistanceAgainst を呼ぶ（内部でこれを呼んでいる）。
// クライアントの対象ハイライトは、状態を持たないこちらを直接呼んでよい。

// 耐性の分類。**分岐用ではなくログ・UI表示用**（呼び出し側は「防がれたかどうか」だけ見ればよい）
export type ResistanceCategory =
    | "armor" // 【装甲：色】＝発生源の色で決まる（keyword:"armor"）
    | "fullImmune" // 相手の効果を受けない（constraint:"immuneToOpponentEffects"／このターンの間の immuneToOpponentThisTurn）
    | "magicImmune" // 相手のマジックの効果を受けない（immunityGrant against:"magic"）
    | "bounceImmune" // 相手の効果で手札・デッキに戻らない（immunityGrant against:"bounce"）
    | "exhaustImmune" // 相手の効果で疲労しない（exhaustImmunityGrant）
    | "coresLocked" // このスピリットのコアは取り除けない（constraint:"coresCantBeRemoved"）。**お互いに効く**
    | "untargetable" // 相手の効果の**対象にならない**（constraint:"untargetableByOpponent"）。範囲効果は防がない
    | "battlingImmune" // バトル中は効果を受けない（globalConstraint:"battlingEffectImmune"）
    | "paidNegate" // コストを払って効果を受けなかった（kind:"targetNegateByHandDiscard"。サーバー側で判定）
    | "summonEffectImmune" // 相手のスピリットの『召喚時』効果を受けない（サーバー側で判定）
    | "magicRedirect" // 対象の絞り込みで、この個体が対象から外れた（耐性ではないが同じ入口で弾く。サーバー側で判定）

export interface Resistance {
    category: ResistanceCategory
    label: string // 日本語のログ用ラベル（「【装甲：赤】」など）
}

// 「何をしようとしているか」。耐性ごとに効く操作が違うので、**この2軸は必ず渡す**
export interface EffectAttempt {
    // 操作の種類。bounce（手札・デッキへ戻す）と exhaust（疲労）だけが専用の耐性を持つ。
    // それ以外は "destroy" / "coreRemove" / "other" のどれでも判定は同じだが、ログのために区別しておく
    op: "destroy" | "bounce" | "exhaust" | "coreRemove" | "other"
    // 対象指定（1体を選ぶ）か範囲（条件に合うものすべて）か。
    // **「相手の効果の対象にならない」は範囲効果を防がない**ので、ここを間違えると挙動が変わる
    scope: "targeted" | "area"
    actorPid: PlayerId // この効果を行っている側。targetOwnerPid と同じなら「自分の効果」＝相手限定の耐性は効かない
    sourceType?: CardType
    sourceColors?: Color[] // 装甲の判定に必要。**渡さないと装甲を判定できない**（不明時は防がない側に倒す）
    // 「候補を数えているだけで、まだ適用しない」問い合わせ。**候補列挙（pickEnemy* / pickAnySide*）だけが立てる。**
    //
    // コストを払って防ぐ耐性（kind:"targetNegateByHandDiscard"。BS08竜騎集う円卓Lv2）のためにある。
    // ああいう耐性は「対象にはなる → そのあと受けない」が正しい順序なので、候補列挙の段階では
    // **防がない**と答えて候補に残し、実際に適用する1点でだけコストを払って防ぐ。
    // 候補列挙で払ってしまうと、候補を数えただけで手札が溶ける。
    //
    // **既定（未指定）が「適用する」側**なのは意図的:
    // 立て忘れると「払いすぎる」＝テストで見える失敗になる。
    // 逆向き（既定が probing）だと、立て忘れが「耐性が無言で効かない」になり検出できない
    probing?: true
}

// 盤面だけで決まる耐性を判定する。防がれるなら理由を、通るなら null を返す。
// 一時的な解決状態（対象の絞り込み・召喚時効果免疫）はここでは見ない＝サーバー側の
// EffectModules.resistanceAgainst が上乗せする
export function boardResistanceAgainst(
    board: Board,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
): Resistance | null {
    // このターンの間、相手のカード効果を受けない（フェザーバリア）。**範囲効果も防ぐ**ので scope を問わない
    if (target.immuneToOpponentThisTurn && attempt.actorPid !== targetOwnerPid) {
        return { category: "fullImmune", label: "相手の効果を受けない状態" }
    }
    // バトル中の効果免疫だけは**自分の効果も止める**（既存の isEffectBlocked と同じ範囲を保つ）
    if (
        (attempt.sourceType === "spirit" || attempt.sourceType === "magic") &&
        isInBattle(board, target) &&
        hasGlobalConstraint(board, "battlingEffectImmune")
    ) {
        return { category: "battlingImmune", label: "バトル中の効果免疫" }
    }
    // 「お互い、このスピリットのコアを取り除けない」（BS10-X01 幻羅星龍ガイ・アスラ）。
    // **自分の効果も止める**ので、下の「相手の効果」限定より前で判定する
    if (attempt.op === "coreRemove" && coresCantBeRemoved(board, targetOwnerPid, target)) {
        return { category: "coresLocked", label: "コアを取り除けない" }
    }
    // ここから下はすべて「相手の効果」限定
    if (attempt.actorPid === targetOwnerPid) return null

    // 【装甲】。ただしこのターン「装甲を無いものとして扱う」効果を受けていれば働かない
    //（すでに持っている分も、このターンに付与された分もまとめて落とす。SD01-040 アーマーパージ）
    const armorDisabled = board.turnConstraints.some(
        (c) => c.type === "armorDisabledForPid" && c.pid === targetOwnerPid,
    )
    // ⚠️ **ブレイヴの効果は【装甲】では防げない**（2026-08-25 ユーザー確認。docs/design/BRAVE.md §12）。
    // 【装甲：色】の効果文は「指定された色の相手の**スピリット/ネクサス/マジック**の効果を受けない」で、
    // ブレイヴを列挙していない。これを防ぐのは【重装甲】（ブレイヴ登場後のキーワード。プールに入ったら実装する）。
    // なお**合体中**にブレイヴがホストへ付与している効果は、発生源が合体スピリット＝"spirit" で来るのでここで防がれる
    if (!armorDisabled && attempt.sourceType !== "brave" && hasArmorAgainst(target, attempt.sourceColors)) {
        return { category: "armor", label: `【${KEYWORDS.armor.label}】` }
    }
    if (hasFullEffectImmunity(board, targetOwnerPid, target, attempt.sourceType)) {
        return { category: "fullImmune", label: "相手の効果を受けない" }
    }
    if (attempt.sourceType === "magic" && hasMagicImmunity(board, targetOwnerPid, target)) {
        return { category: "magicImmune", label: "相手のマジックの効果を受けない" }
    }
    if (attempt.op === "bounce" && hasBounceImmunity(board, targetOwnerPid, target)) {
        return { category: "bounceImmune", label: "相手の効果で手札に戻らない" }
    }
    if (attempt.op === "exhaust" && isExhaustImmuneOnBoard(board, targetOwnerPid, target)) {
        return { category: "exhaustImmune", label: "相手の効果で疲労しない" }
    }
    // 「対象にならない」は**対象指定の効果だけ**を防ぐ（範囲効果はすり抜ける）
    if (attempt.scope === "targeted" && hasUntargetableConstraint(target)) {
        return { category: "untargetable", label: "相手の効果の対象にならない" }
    }
    return null
}

// constraint:"untargetableByOpponent" だけを見る（immuneToOpponentThisTurn は上で別扱いにしたので含めない）。
// 既存の isUntargetableByOpponent は両方を見る合成なので、そちらはクライアントの既存呼び出しのために残してある
function hasUntargetableConstraint(inst: CardInstance): boolean {
    const level = currentLevel(inst).level
    return card(inst.cardId).effects.some(
        (e) =>
            e.kind === "constraint" &&
            e.constraint.type === "untargetableByOpponent" &&
            effectActiveAtLevel(e.levels, level),
    )
}

// 現在のバトルに参加しているか（サーバーの isInCurrentBattle と同じ判定。Board だけで決まる）
function isInBattle(board: Board, inst: CardInstance): boolean {
    const battle = board.battle
    if (!battle) return false
    return battle.attackerInstanceId === inst.instanceId || battle.blockerInstanceId === inst.instanceId
}

// 【疲労しない】（kind:"exhaustImmunityGrant"。トランプの王国）。
// サーバーの isExhaustImmune と同じ判定を Board で行う（あちらはこの関数へ委譲している）
export function isExhaustImmuneOnBoard(board: Board, targetOwnerPid: PlayerId, inst: CardInstance): boolean {
    const player = board.players[targetOwnerPid]
    for (const source of [...player.field.spirits, ...player.field.nexuses]) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "exhaustImmunityGrant") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (!spiritHasFamily(board, targetOwnerPid, inst, effect.familyFilter)) continue
            if (effect.phaseTurn) {
                if (board.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== board.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === board.turnPlayer) continue
            }
            return true
        }
    }
    return false
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
    if (counter === "targetArmorColors") {
        return targetInst ? targetArmorColorCount(targetInst) : 0
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
    // 軽減はカード固有の情報なので、付与色（tempColors）ではなくカード静的な reduction を見る
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
    // 合体しているブレイヴの「合体時BP+」（BRAVE.md §3）。オーラより先に基礎BPへ足す
    let total = currentLevel(inst).bp + braveBpBonus(board.players[ownerPid], inst)
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
    // 合体しているか（BS10。docs/design/BRAVE.md）。true=合体スピリット／false=合体していない
    if (filter.combined !== undefined && instIsCombined(inst) !== filter.combined) return false
    // スピリット状態のブレイヴ＝カード種別がブレイヴで、合体していない個体。
    // 合体中のブレイヴは field.combinedBraves にいて field.spirits の走査に入らないので、
    // ここへ来る時点で「スピリット状態」だが、braveCombined でも二重に確かめておく
    if (filter.braveInSpiritState === true && !(card(inst.cardId).type === "brave" && !instIsCombined(inst))) return false
    if (filter.keyword !== undefined && !spiritHasKeyword(board, ownerPid, inst, filter.keyword)) return false
    // keyword の否定（BS07剣王獣ビャク・ガロウLv2＝【転召】を持たない相手）
    // unblockableOnly（BS09-049炎蜥蜴クトゥグマLv3）：「ブロックされない」効果を持つものだけ。
    // 継続的な制約（unblockableBy）とターン限定の印（unblockableOnceThisTurn）の両方を見る
    if (filter.unblockableOnly) {
        const hasUnblockable =
            inst.unblockableOnceThisTurn === true ||
            activeConstraints(board, ownerPid, inst).some((c) => c.type === "unblockableBy")
        if (!hasUnblockable) return false
    }
    // keywords（BS09-068ランドマイン＝覚醒/呪撃/神速/光芒/粉砕）：いずれか1つでも持てばよい
    if (filter.keywords !== undefined && !filter.keywords.some((k) => spiritHasKeyword(board, ownerPid, inst, k))) return false
    if (filter.keywordExclude !== undefined && spiritHasKeyword(board, ownerPid, inst, filter.keywordExclude)) return false
    if (filter.vanilla !== undefined && !instIsVanilla(inst)) return false
    if (filter.minSymbols !== undefined && instanceSymbolCount(inst) < filter.minSymbols) return false
    if (filter.excludeSelf && selfInstanceId !== undefined && inst.instanceId === selfInstanceId) return false
    if (filter.cores !== undefined && inst.cores !== filter.cores) return false
    if (filter.maxCores !== undefined && inst.cores > filter.maxCores) return false
    if (filter.rested !== undefined && inst.isRested !== filter.rested) return false
    // カード名の部分一致（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）。
    // 名前は master データの静的な値のみを見る（名前の付与・変更を行う効果は未実装）。
    // 配列指定はいずれかの文字列を含めばよい（OR。BS08ダークパワー：「ダーク」/「ブラック」）
    if (filter.nameContains !== undefined) {
        const names = Array.isArray(filter.nameContains) ? filter.nameContains : [filter.nameContains]
        if (!names.some((n) => cardNameContains(inst, n))) return false
    }
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

// トラッシュ（インスタンスを持たない、cardIdだけのゾーン）のカード名照合。cardNameContainsのトラッシュ版。
// kind:"trashNameAs"（トラッシュにある間だけ別名としても扱う。BS10-056蒼天大聖モンゴクウ）を持つカードは
// その名前でも一致する。トラッシュのカード名を照合する呼び出し側はすべてこれを通すこと
// （直接 getCard(cardId).name.includes(...) を書くと trashNameAs が無言ですり抜ける）
export function trashCardNameMatches(cardId: string, needle: string): boolean {
    const c = card(cardId)
    if (c.name.includes(needle)) return true
    return c.effects.some((e) => e.kind === "trashNameAs" && e.name.includes(needle))
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
    // 実コストは instBaseCost 経由で見る（asSpiritThisTurn の置き換えと instCostDelta の増減を含む）
    if (matchesCostFilter(instBaseCost(inst), costFilter)) return true
    if (inst.tempAlsoCosts.some((c) => matchesCostFilter(c, costFilter))) return true
    return (inst.alsoCostsContinuous ?? []).some((c) => matchesCostFilter(c, costFilter))
}

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
                    (e) => e.kind === "constraint" && effectActiveOn(inst, e, src === inst ? level : currentLevel(src).level),
                )
                .map((e) => (e as { constraint: ConstraintDef }).constraint),
        )
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
// untargetableByOpponentと異なり範囲効果（destroyAll/exhaustAll等）にも効く「効果を受けない」判定。
// srcType が spirit/magic のときのみ判定する（ネクサスの効果・自分自身の効果は通す。BS04ワルキューレ・ヒルド）
// ⚠️ **これは boardResistanceAgainst の内部実装**。個別に呼ぶと他の耐性軸が抜けるので、
// 効果が届くかを判定したい箇所は resistanceAgainst（サーバー）か boardResistanceAgainst を通すこと。
export function hasFullEffectImmunity(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
    srcType: CardType | undefined,
): boolean {
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
export function hasArmorAgainst(inst: CardInstance, sourceColors: Color[] | undefined): boolean {
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
                const { maxCost, costs, keywordExclude, maxBp } = effect.constraint
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
                if (maxCost !== undefined && costsOfAttacker.some((cost) => cost <= maxCost)) return true
            }
        }
    }
    return false
}

// 片側限定のライフ保護（TurnConstraintDef "noLifeDamageByCostForPid"。BS07秘密の花園Lv2）：
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
    if (noLifeDamageByCost(board, attacker)) {
        return { max: 0, reason: "コスト条件によりライフが減らない" }
    }
    // BS07秘密の花園Lv2：このターン、コスト条件のアタックでは**この防御側だけ**が減らない
    if (lifeProtectedByCostThisTurn(board, defenderPid, attacker)) {
        return { max: 0, reason: "このターンはコスト条件によりライフが減らない" }
    }
    // BS08空帝竜騎プラチナム：アタッカーの実効BPが発生源以下なら減らない
    if (protectedByBpUpToSelf(board, defenderPid, attacker)) {
        return { max: 0, reason: "BP条件によりライフが減らない" }
    }
    // このターン限定の上限（ブリザードウォール＝1しか減らない）。複数あれば最も厳しいものを採る
    let max = Number.POSITIVE_INFINITY
    for (const c of board.turnConstraints) {
        if (c.type === "lifeDamageMaxForPid" && c.pid === defenderPid) max = Math.min(max, c.max)
    }
    if (max === 0) return { max, reason: "このターンはライフが減らない" }
    if (Number.isFinite(max)) return { max, reason: `このターンはライフが${max}しか減らない` }
    return { max }
}

// このターンの間、この pid のライフはあらゆる原因（アタック・lifeCrushアクション）で減らないか
// （BS10-093時刻む花時計。TIMING_CHART.md §2「あらゆる原因を止める」）。
// lifeDamageLimit（アタック経路）と lifeCrushハンドラ（効果経路）の両方から呼ぶ共通の入口
export function lifeImmuneThisTurn(board: Board, pid: PlayerId): boolean {
    return board.turnConstraints.some((c) => c.type === "lifeImmuneForPid" && c.pid === pid)
}

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

// このターンだけの強制アタック（TurnConstraintDef "mustAttackByCost" / "mustAttackByInstance"。
// action:"forceAttackThisTurn" が積む。BS08アンブッシュブロッカー／獣機合神セイ・ドリガン）：
// pid の対象スピリットが、恒久的な constraint:"mustAttack" と同じ扱いで強制アタックの対象になるか
export function mustAttackThisTurn(board: Board, pid: PlayerId, inst: CardInstance): boolean {
    return board.turnConstraints.some((c) => {
        if (c.type === "mustAttackByCost") return c.pid === pid && instAllCosts(inst).some((cost) => cost <= c.maxCost)
        if (c.type === "mustAttackByInstance") return c.pid === pid && c.instanceId === inst.instanceId
        return false
    })
}

// このターンだけの疲労状態ブロック許可（TurnConstraintDef "canBlockWhileRestedThisTurn"。
// action:"grantCanBlockWhileRestedThisTurn" が積む。constraint:"canBlockWhileRested" のターン付与版。BS08インフィニティシールド）
export function canBlockWhileRestedThisTurn(board: Board, pid: PlayerId, inst: CardInstance): boolean {
    return board.turnConstraints.some((c) => {
        if (c.type !== "canBlockWhileRestedThisTurn" || c.pid !== pid) return false
        if (c.familyFilter === undefined) return true
        return matchesFamilyFilter(board, pid, inst, c.familyFilter)
    })
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
    for (const source of effectSources(board, ownerPid === "p1" ? "p2" : "p1")) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "noOpponentTriggerByColor") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (!effect.constraint.triggers.includes(event)) continue
            if (!instHasColor(inst, effect.constraint.color)) continue
            return true
        }
    }
    return false
}

// フィールド全体制約 noSummonTriggerByCost（両陣営）：コストがmaxCost以下のスピリットの
// 『このスピリットの召喚時』効果は発揮されない（BS08共鳴する音叉の塔）。召喚時トリガーの発火直前に判定する
export function noSummonTriggerByCost(board: Board, inst: CardInstance): boolean {
    const costs = instAllCosts(inst)
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, pid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "noSummonTriggerByCost") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                const { maxCost } = effect.constraint
                if (costs.some((cost) => cost <= maxCost)) return true
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
// （returnToHand/returnAllToHand）を受けない（kind:"immunityGrant" against:"bounce"。BS06恐竜姫ジュラ）。
// 呼び出し側（handDeck.tsのbounceガード）は自分自身の効果には適用しない（対象の持ち主==効果の持ち主なら呼ばない）
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

// この個体が【超覚醒】を持つか（＝コアを置いたあと回復するか）。
// 【覚醒】との違いはこの1点だけなので、判定もここに閉じる
export function hasSuperAwaken(board: Board, ownerPid: PlayerId, inst: CardInstance): boolean {
    return spiritHasKeyword(board, ownerPid, inst, "superAwaken")
}

// このスピリットのコアを取り除けないか（constraint:"coresCantBeRemoved"）。
// **効果でもプレイヤーの操作でも取り除けない**ので、耐性の判定表と、
// コアが動くプレイヤー操作の入口（moveCore / 支払い元 / 【覚醒】の移動元）から呼ぶ
// エンドステップを数える封印（BS10-108 ルナティックシール）が、いま指定の制限をかけているか。
// **両陣営に効く**（誰が発揮したかを問わない）。クライアントもこれを読んでボタンを落とす
export function isEndStepLocked(
    board: Board,
    lock: "attackStep" | "deckMill" | "lifeChargeFromVoidOrReserve",
): boolean {
    return board.endStepLocks.some((l) => l.remaining > 0 && l.locks.includes(lock))
}

export function coresCantBeRemoved(board: Board, ownerPid: PlayerId, inst: CardInstance): boolean {
    return activeConstraints(board, ownerPid, inst).some((c) => c.type === "coresCantBeRemoved")
}

export function canAwaken(board: Board, ownerPid: PlayerId, inst: CardInstance): boolean {
    const level = currentLevel(inst).level
    // 【超覚醒】は【覚醒】を含む（KEYWORD_INCLUDES）。コアを集める操作自体は同じで、
    // 違うのは「置いたとき回復する」の1点だけ（GameEngine.doAwaken が見る）
    const staticAwaken = card(inst.cardId).effects.some(
        (e) => e.kind === "keyword" && keywordMatches(e.keyword, "awaken") && effectActiveOn(inst, e, level),
    )
    if (staticAwaken) return true
    return inst.tempKeywords.some((k) => keywordMatches(k.keyword, "awaken"))
        || hasContinuousKeywordGrant(board, ownerPid, inst, "awaken")
}

// 起動能力（kind: "activated"）が今このスピリットで発動可能なら {effectId, costLabel} を返す。
// タイミング・（condition が要求するなら）self がバトル当事者・「ターンに1回」の残り・コスト支払い可能を
// すべて満たす必要がある。
// バトル当事者であることは condition:"selfInBattle" のときだけの条件で、
// 発動タイミングがバトル中（timing:"flashBattle"）であること自体とは別（BS07桜の妖精オウカは
// バトルに参加していなくてもアタック中の味方をBP+できる）。
//
// ⚠️ **RuleValidator.validateActivateAbility と同じ条件をここで判定する**。
// UIのボタン表示はこちら、サーバーの受理はあちらなので、片方だけ直すと
// 「ボタンが出るのにサーバーが弾く」ズレが出る（過去に実際に起きている）
export function activatableAbility(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): { effectId: string; costLabel: string } | null {
    // バトル中のフラッシュ窓（優先権が要る）と、自分のメインステップ（バトル外）の2つがありうる
    const inBattleFlash = board.battle !== null && board.isFlashTiming && board.priorityPlayer === pid
    const inOwnMain = board.battle === null && board.turnPlayer === pid && board.phase === "main"
    if (!inBattleFlash && !inOwnMain) return null
    const inBattle =
        board.battle !== null &&
        (board.battle.attackerInstanceId === inst.instanceId ||
            board.battle.blockerInstanceId === inst.instanceId)
    const level = currentLevel(inst).level
    for (const e of card(inst.cardId).effects) {
        if (e.kind !== "activated") continue
        if (!effectActiveAtLevel(e.levels, level)) continue
        // 発動可能タイミング（validateActivateAbility と同じ切り分け）
        if (e.timing === "flashBattle" && !inBattleFlash) continue
        if (e.timing === "flash" && !inBattleFlash && !inOwnMain) continue
        if (e.timing === "main" && !inOwnMain) continue
        if (e.condition === "selfInBattle" && !inBattle) continue
        // 「ターンに1回」：発生源1体につきターン1回
        if (e.oncePerTurn && inst.activatedUsedTurn?.[e.id] === board.turn) continue
        // コスト省略時は追加コストなし（BS08帝竜騎サイクル）
        if (e.cost === undefined) return { effectId: e.id, costLabel: "効果を発動" }
        if ("exhaustSelf" in e.cost) {
            if (inst.isRested) continue
            return { effectId: e.id, costLabel: "このスピリットを疲労させて効果を発動" }
        }
        if (board.players[pid].reserve < e.cost.reserveToTrash) continue
        return { effectId: e.id, costLabel: `コア${e.cost.reserveToTrash}個を払って効果を発動` }
    }
    return null
}

// **pid はブレイヴをスピリット状態にできないか**（BS11-X02 滅神星龍ダークヴルム・ノヴァ Lv3
// 「相手は、ブレイヴをスピリット状態にできない」）。2026-08-29 ユーザー確認で、
// ブレイヴがスピリット状態になる**3経路すべて**を禁じる:
//   (a) ブレイヴを単体で召喚する（RuleValidator.validateSummon）
//   (b) ホストが場を離れるときコアを置いて残す（detachBravesOnLeave。§6.3）
//   (c) 効果で分離する（detachBraveByEffect。§12.5）
// 判定は**相手側の発生源**が constraint:"opponentCantMakeBraveSpiritState" を有効に持つかで行う
export function cantMakeBraveSpiritState(board: Board, pid: PlayerId): boolean {
    const foe = pid === "p1" ? "p2" : "p1"
    return effectSources(board, foe).some((src) =>
        activeConstraints(board, foe, src).some((c) => c.type === "opponentCantMakeBraveSpiritState"),
    )
}

// 指定アタック（canDirectAttack）の対象条件（targetFilter状態条件＋targetMinBpのBP条件）
export interface DirectAttackFilter {
    targetFilter: "rested" | "singleCore" | "recovered" | "any" | "combined" // combined＝相手の合体スピリットのみ（BS11-X02）
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
    return minLevelCoresOf(cardData.levels)
}

// レベル表から最小レベルの必要コア数を求める素の計算（minLevelCores / instMinLevelCores の共通実体）
function minLevelCoresOf(levels: LevelDef[]): number {
    const min = levels.reduce<{ level: number; cores: number } | null>(
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

// ---- 代替召喚ルート（kind:"altSummonFromHand"。BS10-058水星神龍メルクリウス・サーペント） ----

export interface AltSummonFromHandOption {
    effectId: string
    color: Color
    count: number
    candidateNexusIds: string[] // 支払いに使える自分のネクサス（cost.returnOwnNexusToDeckBottom.color 一致）のinstanceId
}

// 判定の本体。**サーバー（RuleValidator.validateSummon）とクライアントUIの唯一の判定元**
// （battleSwapSummonCheck と同じ形）。戻り値は失敗理由（string）か成功時のオプション。
// 支払い元（altSummonNexusInstanceIds）の枚数・重複チェックはサーバー専用の検証が持つため、
// ここでは「この召喚方法を選べるか」と「候補ネクサス一覧」までを返す
export function altSummonFromHandCheck(
    board: Board,
    pid: PlayerId,
    handIndex: number,
): AltSummonFromHandOption | string {
    const cardId = board.players[pid].hand?.[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const cardData = card(cardId)
    if (cardData.type !== "spirit") return "スピリットカードではありません"
    const alt = cardData.effects.find((e) => e.kind === "altSummonFromHand")
    if (!alt || alt.kind !== "altSummonFromHand") return "このカードはこの召喚方法を使えません"
    // timing:"main"＝自分のメインステップ中の任意のタイミング（バトル中は不可）
    if (board.turnPlayer !== pid || board.phase !== "main" || board.battle) {
        return "自分のメインステップではありません"
    }
    const { color, count } = alt.cost.returnOwnNexusToDeckBottom
    const candidates = board.players[pid].field.nexuses.filter((n) => instHasColor(n, color))
    if (candidates.length < count) return "コストにできる自分のネクサスが足りません"
    return {
        effectId: alt.id,
        color,
        count,
        candidateNexusIds: candidates.map((n) => n.instanceId),
    }
}

// UI向け：手札の handIndex 枚目がいま代替召喚できるなら候補ネクサスを返す（できなければ ok:false）
export function canAltSummonFromHand(
    board: Board,
    pid: PlayerId,
    handIndex: number,
): { ok: boolean; candidateNexusIds: string[] } {
    const result = altSummonFromHandCheck(board, pid, handIndex)
    return typeof result === "string" ? { ok: false, candidateNexusIds: [] } : { ok: true, candidateNexusIds: result.candidateNexusIds }
}

