// コスト支払いモードの状態と、残りコスト・軽減の計算
import type { CardData, Color, GameView } from "../../../server/src/type"
import { canPayNexusCostByMill, canPaySummonCostByHandDiscard, effectiveCost, exSymbolsOfTrashCard } from "../../../shared/cost"
import { flashSummonFromHandNow, hasKeyword, minLevelCores, placedCoresForSummon, sokuPayableInstanceIds, handSizeOf, payAssistCandidates } from "../../../shared/rules"
import { master } from "../renderer"

// 支払いに使える自分のフィールドのコア総数（スピリット/ネクサス上）。
// 【神速】召喚のときは基礎ルールでリザーブのみのため、sokuPaySourceGrant が許可した対象だけ数える
// （判定はサーバー validateSummon と同一の共有実装）
export function payableFieldCores(view: GameView, cardId: string): number {
    const player = view.players[view.you]
    const card = master(cardId)
    const isSoku = view.isFlashTiming && card.type === "spirit" && (hasKeyword(cardId, "soku") || flashSummonFromHandNow(view, view.you, cardId))
    const allowed = isSoku ? sokuPayableInstanceIds(view, view.you) : null
    return [...player.field.spirits, ...player.field.nexuses]
        .filter((i) => allowed === null || allowed.has(i.instanceId))
        .reduce((sum, i) => sum + i.cores, 0)
}

// コストだけの支払い（ブロックの追加コスト・【迷彩】）。置くコアが無いので[ソウルコア]は「コストに使う」だけ選べる
export function payingIsCostOnly(paying: PayingState): boolean {
    return paying.forBlock !== undefined || paying.forMeisai !== undefined || paying.forAttack !== undefined
}

// 支払いモードで満たすべき合計コア数（フィールド割り当て＋リザーブの合計がこれに達すれば送信可能）
export function payingNeed(view: GameView, paying: PayingState): number {
    const cardId = payingCardId(view, paying)
    if (cardId === undefined) return 0
    if (paying.forBlock !== undefined) return paying.forBlock.need
    if (paying.forAttack !== undefined) return paying.forAttack.need
    if (paying.forMeisai !== undefined) return paying.forMeisai.need
    const card = master(cardId)
    // ブレイヴの分離（§6.3・§6.4）はコストが無く、必要なのは置くコア（スピリット状態のLv1維持コスト）だけ
    if (paying.forDetachBraveInstanceId !== undefined || paying.forBraveKeep !== undefined) {
        return minLevelCores(card)
    }
    // 代替召喚（ネクサスをデッキの下に戻して払う）は召喚コストが0になる
    const cost = paying.altSummonNexusInstanceIds ? 0 : effectiveCost(view, view.you, card, false, exReductionSymbolsFor(view, paying.exReductionTrashIndices))
    // 置くコア数。サーバー（placedCoresForSummon）と同じ計算。《真界放》マーカー付きで
    // [ソウルコア]を維持コアに使う選択ならwaiver配置（1コア）になる
    const maintain =
        card.type === "magic" || paying.braveTargetInstanceId !== undefined
            ? 0
            : placedCoresForSummon(card, paying.level, { placeSoulCoreFromReserve: paying.placeSoulCore === true })
    // 代替コスト（手札破棄／デッキ破棄）は**コスト側だけ**を肩代わりする（置くコアには使えない）
    const alt = payingAltPay(view, paying)
    // kind:"payAssistByExhaust"（BS16-021）：疲労させたスピリット1体につきeffect.cost分、
    // 召喚コストを肩代わりする（置くコアには使えない）
    const shinsokuDiscount = payingShinsokuAssistDiscount(view, paying)
    const costAfterDiscounts = Math.max(0, cost - Math.min(alt.used, cost) - shinsokuDiscount)
    return costAfterDiscounts + maintain
}

// 支払いモードでの残り不足コア数（0なら送信可能）
export function payingRemaining(view: GameView, paying: PayingState): number {
    if (payingCardId(view, paying) === undefined) return 0
    const need = payingNeed(view, paying)
    const assignedTotal = Object.values(paying.assigned).reduce((a, b) => a + b, 0)
    // 案B-inside: reserve の数値には[ソウルコア]が含まれる。使う選択ならそのまま、使わないなら通常コアぶんを差し引く
    const soulInReserve = view.players[view.you].soulCore?.zone === "reserve"
    // [ソウルコア]をコストか維持コアに使う選択なら総コア、使わないなら通常コアで支払い力を見る
    const soulUsed = paying.useSoulCore === true || paying.placeSoulCore === true
    const reserve = soulUsed
        ? view.players[view.you].reserve
        : view.players[view.you].reserve - (soulInReserve ? 1 : 0)
    // フィールドの個体から[ソウルコア]を支払うとき（soulPayInstanceId）も1個ぶん支払い力に数える
    const soulFromField = paying.soulPayInstanceId !== undefined ? 1 : 0
    return Math.max(need - reserve - assignedTotal - soulFromField, 0)
}

// 支払いモード：コストをフィールドのコア／代替コストで賄うための一時状態
export interface PayingState {
    handIndex: number
    // 選択待ち（pendingChoice）の解決として送る場合の手札インデックス。
    // 「コストを支払って召喚できる」起動効果（BS08帝竜騎サイクル＝summonFromHandFree の payCost）で、
    // リザーブだけでは払えないときに通常の召喚と同じ支払いUIを流用するためのもの。
    // 立っているときは summon ではなく resolveChoice を送る（2026-08-23）
    forChoiceCardIndex?: number
    // 選択待ちの解決として支払うとき、選んだカードがどのゾーンにあるか（既定は手札）。
    // "trash" のときは handIndex を trashCards の添字として読む
    // （BS07常闇の聖堂＝トラッシュから召喚／BS08-X33ミカファール＝トラッシュのマジックを使用。2026-08-24）
    choiceZone?: "hand" | "trash"
    targetInstanceId?: string // マジックで対象選択済みの場合のみ
    level?: number // 召喚レベル指定用
    substituteInstanceId?: string // 入れ替え召喚の入れ替え元
    braveTargetInstanceId?: string // ダイレクトブレイヴの合体先スピリット（維持コアは置かない）
    altSummonNexusInstanceIds?: string[] // 代替召喚でデッキの下に戻すネクサス（召喚コストは0になる）
    // 支払いの3つ目の起点（BRAVE.md §6.4）：**メインステップの任意分離**。
    // 手札／トラッシュのカードではなく**場の合体中ブレイヴ**が起点で、必要数はそのブレイヴの
    // スピリット状態のLv1維持コスト。立っているときは summon ではなく detachBrave を送る。
    // リザーブだけで払えるときは支払いモードに入らず、そのまま detachBrave を送っている
    forDetachBraveInstanceId?: string
    // 支払いの4つ目の起点（BRAVE.md §6.3）：**場を離れるときにブレイヴを残す**ときのコア。
    // 起点は場のどこにも無い（脇に置かれている）ので、カードと必要数を選択待ちから受け取って持つ。
    // 立っているときは resolveChoice（option＋paySources）を送る
    forBraveKeep?: { option: string; cardId: string; need: number }
    // 支払いの5つ目の起点：**ブロックの追加コスト**（制約 blockPayCost。26RDB01-X06）。
    // 起点はブロックするスピリット。block（instanceId＋paySources）を送る
    forBlock?: { instanceId: string; need: number }
    // 支払いの7つ目の起点：**アタックの追加コスト**（制約 attackPayToll。26RSD06-011）。起点はアタックするスピリット。attack（instanceId＋paySources）を送る
    forAttack?: { instanceId: string; need: number; targetSpiritInstanceId?: string }
    // 支払いの6つ目の起点：**【迷彩：N】のコスト**（PendingChoice.meisaiPay）。起点は指定しようとしている相手のスピリット。
    // resolveChoice（option＋paySources＋paySoulCoreFromReserve）を送る
    forMeisai?: { option: string; cardId: string; need: number; effectCost?: true } // effectCost：効果の「Nコスト支払う」（PendingChoice.effectCostPay）。表示文言だけ違う
    // 手札のマジックのバースト効果を発揮する支払い（handBurstEffectGrant）。マジックの使用ではないので castMagic ではなく useHandBurstEffect を送る
    forHandBurst?: true
    assigned: Record<string, number> // instanceId -> 割り当てたコア数
    // 代替コスト（コア以外での支払い）。1つにつきコスト1が減る
    discardHandIndices: number[] // 破棄する手札のindex（BS08ビクティム。スピリット召喚のみ）
    millPay: number // デッキ破棄で払う枚数（BS04栄光の表彰台。ネクサス配置のみ）
    // kind:"payAssistByExhaust"（BS16-021）：疲労させて召喚コストの一部を肩代わりする自分のスピリット
    // （【神速】召喚のみ。任意で選ぶ。省略/空配列＝使わない）
    shinsokuAssistInstanceIds?: string[]
    // リザーブの[ソウルコア]をコスト支払い1個ぶんとして使う（docs/design/SOULCORE.md 部品3）。
    // 支払いでプレイヤーが選ぶ（2026-10-05 ユーザー確認）。置くコアだけの支払いでは使わない
    useSoulCore?: boolean
    // [ソウルコア]を維持コアとして召喚/配置した個体に置く（2026-10-06。useSoulCoreとの排他）
    placeSoulCore?: boolean
    // フィールドの個体の上の[ソウルコア]をコスト支払いに使うときの支払い元（2026-10-06。
    // クリック回数ではなく対象カード上の専用ボタンで明示的に選ぶ。assignedとは独立に+1個）
    soulPayInstanceId?: string | undefined
    // [ソウルコア]の使い方: "cost"=コストとして支払う（→トラッシュ）/"maintain"=維持コアとして置く
    // （→召喚/配置した個体の上。2026-10-06 ユーザー確認。soulPayInstanceIdとセットで使う）
    soulPayMode?: "cost" | "maintain" | undefined
    // 《継召》(kind:"exTrashReduction")：除外して軽減するトラッシュのインデックス（trashCards内）。
    // summon アクションと一緒に送る（省略/空配列＝使わない）
    exReductionTrashIndices?: number[]
}

// この支払いで使える代替コストの種類と上限。
// kind が null なら代替コストは使えない（＝従来どおりコアだけで払う）
export interface AltPayInfo {
    kind: "handDiscard" | "mill" | null
    used: number
    max: number
}

// 《継召》(kind:"exTrashReduction")：除外するトラッシュカードのシンボル列（effectiveCost の第5引数へ渡す）。
// サーバー（RuleValidator.doValidateSummon）と同じ「除外カードのシンボル列」の作り方にすること
export function exReductionSymbolsFor(view: GameView, indices: number[] | undefined): Color[] {
    return (indices ?? []).flatMap((i) => exSymbolsOfTrashCard(view, view.you, i))
}

// 《継召》：同一カードごとの除外候補グループ。同一カードは1ボタンにまとめ、count で枚数を選ぶ
export interface ExReductionGroup {
    trashCardId: string // 除外候補のカード（trashCards の cardId）
    indices: number[] // そのカードの候補インデックス（trashCards 内・出現順）
    count: number // 選んだ枚数
}

// 《継召》：選ばれた除外カードが軽減に効く個数（色ごとに軽減シンボル数で頭打ち）。
// 軽減に効かない枚は対象外（ユーザー確定 2026-10-05）
export function exReductionEffectiveCount(card: CardData, symbols: Color[]): number {
    const budget = new Map<string, number>()
    for (const c of card.reduction) budget.set(c, (budget.get(c) ?? 0) + 1)
    let used = 0
    for (const c of symbols) {
        const b = budget.get(c) ?? 0
        if (b > 0) {
            budget.set(c, b - 1)
            used++
        }
    }
    return used
}

// 《継召》：各グループの選択枚数から、実際に除外する trashCards 内インデックスを返す
export function exReductionPickedIndices(groups: ExReductionGroup[]): number[] {
    return groups.flatMap((g) => g.indices.slice(0, g.count))
}

// 支払いモードで使える代替コストを求める。**サーバーの上限計算と同じ式にすること**
// （RuleValidator.summonHandDiscardPayAmount / nexusMillPayAmount。ズレると
//  「UIで選べるのにサーバーが弾く」形の食い違いになる）
// 支払い中のカードを取り出す（選択待ちの解決ならトラッシュを見ることもある）。
// **payingAltPay と payingRemaining は必ずこれを通す**（ゾーンの読み違いで別のカードを見ないように）
export function payingCardId(view: GameView, paying: PayingState): string | undefined {
    const player = view.players[view.you]
    if (paying.forBraveKeep !== undefined) return paying.forBraveKeep.cardId
    if (paying.forMeisai !== undefined) return paying.forMeisai.cardId
    if (paying.forBlock !== undefined) {
        const blockerId = paying.forBlock.instanceId
        return player.field.spirits.find((s) => s.instanceId === blockerId)?.cardId
    }
    if (paying.forAttack !== undefined) {
        const attackerId = paying.forAttack.instanceId
        return player.field.spirits.find((s) => s.instanceId === attackerId)?.cardId
    }
    if (paying.forDetachBraveInstanceId !== undefined) {
        return player.field.combinedBraves.find((b) => b.instanceId === paying.forDetachBraveInstanceId)?.cardId
    }
    if (paying.choiceZone === "trash") return player.trashCards[paying.handIndex]
    return player.hand?.[paying.handIndex]
}

export function payingAltPay(view: GameView, paying: PayingState): AltPayInfo {
    const player = view.players[view.you]
    const cardId = payingCardId(view, paying)
    if (cardId === undefined) return { kind: null, used: 0, max: 0 }
    const card = master(cardId)
    const cost = effectiveCost(view, view.you, card, false, exReductionSymbolsFor(view, paying.exReductionTrashIndices))
    if (card.type === "spirit" && canPaySummonCostByHandDiscard(view, view.you)) {
        // 召喚するカード自身は破棄に使えないので手札枚数から1枚引く
        const max = Math.min(cost, Math.max(0, handSizeOf(player) - 1))
        return { kind: "handDiscard", used: paying.discardHandIndices.length, max }
    }
    if (card.type === "nexus" && canPayNexusCostByMill(view, view.you)) {
        // 配置コストは**コア払いと併用できない**ので、選べるのは「全額デッキ破棄」か「使わない」の二択。
        // デッキが実効コストに足りなければ全額払えない＝この支払い方法自体が使えない
        if (player.deckCount < cost) return { kind: null, used: 0, max: 0 }
        return { kind: "mill", used: paying.millPay, max: cost }
    }
    return { kind: null, used: 0, max: 0 }
}

// kind:"payAssistByExhaust"：この支払いで選べる肩代わり候補
export function payingShinsokuAssistCandidates(view: GameView, paying: PayingState): { instanceId: string; discount: number }[] {
    const card = payingCardId(view, paying)
    if (card === undefined) return []
    return payAssistCandidates(view, view.you, { cardId: card, flash: view.isFlashTiming })
}

// 選択済みの肩代わり候補ぶんの合計割引
export function payingShinsokuAssistDiscount(view: GameView, paying: PayingState): number {
    const candidates = new Map(payingShinsokuAssistCandidates(view, paying).map((c) => [c.instanceId, c.discount]))
    return (paying.shinsokuAssistInstanceIds ?? []).reduce((sum, id) => sum + (candidates.get(id) ?? 0), 0)
}
