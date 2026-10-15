// 旧「選ぶ＋送る」の type（toHand／toDeck／recover*／summonFromTrashFree／castMagicFromTrashByColor／
// deployNexusFromTrashByFieldCores／reveal）を moveCards（と revealOpen・if）へ写す純粋な関数。
// エンジンの読み替え・データの移行（scripts/migrate-move-cards.ts）・変換ツールの後処理で共有する。
// エンジンのモジュールを読み込まない（テストや変換ツールから先に読まれても循環しないように）
import type { CardPick, CardType, Color, EffectAction, EffectCounter, FamilyFilter, Keyword } from "../../type"

// 移行前の型（データには残っていない。旧データ・テストの期待値を読むためだけに残す）
export type LegacyMoveAction =
    | { type: "discardSelfChoose"; count: number | "any"; downTo?: number; cardType?: CardType | CardType[]; family?: FamilyFilter; keyword?: Keyword | Keyword[]; cardName?: string; colorFilter?: Color; discarded?: string[]; awaitingSkip?: true; anyMax?: number } // 自分の手札からcount枚を破棄する。interactiveTargets時は1枚ずつ選ばせ、非interactive時は末尾から機械的に破棄。cardType/keyword指定時はそのカードだけを対象にする（両方指定時はAND、配列指定時は配列内OR。costDiscardHandKeywordThenDrawと同じ意味）。cardName指定時はそのカード名だけが対象。colorFilter指定時はその色を持つカードのみ対象（多色はOR）。count:"any"＝好きなだけ（破棄し終えたら lastMoved に書く。discarded／awaitingSkip は再開用）
    | { type: "reveal"; /* 2種類目の「その中の〜1枚と、〜1枚を手札に加える」（dest:hand のみ） */ pick2?: CardPick; from?: "ownDeck" | "opponentDeck" | "burst"; count?: number; countPer?: { ownColorTotal: Color } | { ownNexuses: true } | { ownSymbols: Color } | { keishoExcluded: true }; /* keishoExcluded＝直近の《継召》で除外したEXシンボル（カード1枚＝1つ）の数 */ countFromSelfLevel?: true; pick?: CardPick; pickCount?: 1 | "all" | 0 | number; optional?: true; dest?: "hand" | "summon" | "summonOrPlace" | "cast" | "placeNexus" | "tegamoto" | "deckBottom" | "activateBurst" | "trash"; orHand?: true; tensho?: "asIfDone" | "none"; noSummonEffects?: true; rest?: "trash" | "deckTop" | "deckBottom" | "deckTopOrBottom" | "hand"; returnToDeckBottomAtEndStep?: true; pay?: "cost"; destroySelfIf?: CardPick } // destroySelfIf＝オープンしたカードがこれに合うなら発生源自身を破壊する（count:1 のオープン限定。26RBS03-081）。オープン統合の器（docs/design/REVEAL_UNIFY.md §4）。from省略時はownDeck、pickCount省略時は1、dest省略時はhand、rest省略時はdeckBottom。選ぶのは常に効果の使用者
    | { type: "toDeck"; from: "hand" | "trash"; side?: "opponent"; position: "top" | "bottom"; count: number; all?: true; pick?: CardPick; chooserIsTarget?: true; picked?: number[]; upTo?: true; fromEvent?: true; revealed?: true } // all：候補すべて（count は 1 を書く。「手札すべてを好きな順でデッキの下に戻す」）。revealed：「相手に見せて」＝手札から戻したカード名をログに出す。 upTo：countは上限。0〜count枚の好きな数を選べる（2026-09-28ユーザー決定）。fromEvent：from:"trash"限定、GameState.lastDeckMillに記録された直近の破棄ぶんだけを候補にする（BS16-039）
    | { type: "toHand"; from: "trash"; count: number | "all"; pick?: CardPick; picked?: number[]; dest?: "placeNexus" | "summon"; destroyAtBattleEnd?: true; lastMovedOnly?: true } // lastMovedOnly＝直前の動作（粉砕・破棄）で動いたカードだけが候補（26RBS02-016「破棄した〜を指定する」。同じ cardId の元からトラッシュにあったカードも区別しない簡略化）。destroyAtBattleEnd＝dest:"summon"で召喚した個体に CardInstance.destroyAtBattleEnd を立てる（バトルに参加しなくても終了時に破壊。26RBS01-113）。自分のトラッシュのカードを手札に加える。picked は選択の再開用。dest 指定時は手札ではなく、選んだカードをコストを支払わずに配置／召喚する（revealApplyOne と同じ送り先処理。手札へ戻す禁止は受けない）
    | { type: "recoverSpiritFromTrash"; costSacrificeChosen?: true; count: number; countCounter?: EffectCounter; familyFilter?: FamilyFilter; all?: true; costBudget?: number; thenDestroyIfFamily?: { family: FamilyFilter; maxBp: number }; keywordFilter?: Keyword; keywordFilterAny?: Keyword[]; colorFilter?: Color; nameIncludes?: string; costSkipDraw?: true; includeBraves?: true; anyCardType?: true; vanillaFilter?: true; bravesOnly?: true; costFilter?: { max?: number; min?: number }; costAtMostOrHasBurst?: number; bravesAnyOrSpiritColorFilter?: Color; excludeBurst?: true } // costFilter指定時はカードのコストがこの範囲のものだけ。costAtMostOrHasBurst指定時は「コストがこの値以下」または「kind:"burst"エントリを持つ」のOR判定。bravesAnyOrSpiritColorFilter指定時は「ブレイヴカード（色問わず）」または「この色を持つスピリットカード」のOR判定。excludeBurst指定時はkind:"burst"エントリを持つカードを除外する
    | { type: "recoverMagicFromTrash"; colors?: Color[]; anyCardType?: true; hasBurst?: true; onlyBurstDestroyedCard?: true } // onlyBurstDestroyedCard指定時は、**そのバースト発動のきっかけになった破壊で落ちたカード**だけが対象（burst.destroyedAsTargetがtargetInstanceIdの枠に入れたcardIdと一致するもの）。colors指定時は、そのいずれかの色を持つマジックカードだけを対象にする（カード静的なcolorsで判定）。anyCardType指定時はマジック限定を外し、カード種別を問わず対象にする。hasBurst指定時はkind:"burst"エントリを持つカードだけが対象。自分のトラッシュにあるマジックカード1枚（末尾＝新しい方）を手札に戻す
    | { type: "castMagicFromTrashByColor"; colorFilter?: Color } // 自分のトラッシュにある指定色（省略時は色不問）のマジックカード1枚を、手札にあるときと同様にコストを支払って使用する（自動時はコストが払える中で最もコストが高いものを自動選択。該当・支払い可能なカードがなければ不発）。この効果ではフィールドのコアは使えずリザーブのみで支払う簡略化。発動タイミングはこの効果自体の発火位置で決まる（バトル中ならflash、それ以外はメイン優先）
    | { type: "deployNexusFromTrashByFieldCores"; colors: Color[] } // 自分のトラッシュにある指定色いずれかのネクサスカード1枚を、**自分のフィールドのコアだけ**を使ってコストを支払い配置する（リザーブは使わない。2026-08-14 ユーザー確認）。フィールドのコアが足りなければ不発。取るのはネクサス上→コアの多いスピリットの順（維持コアを割る個体からは取らない決定的簡略化）
    | { type: "summonFromTrashFree"; costFilter?: { max?: number; min?: number }; colorFilter?: Color; keywordFilter?: Keyword; costBudget?: number; familyFilter?: FamilyFilter; nameIncludes?: string; payCost?: true; whileCombinedFilter?: true; count?: number; countCounter?: EffectCounter; skipOnSummon?: true; onlyBurstDestroyedCard?: true; destroyAtBattleEnd?: true; upTo?: true } // countCounter指定時はcountを無視しEffectCounterの値を召喚できる最大枚数として使う（0なら不発）。onlyBurstDestroyedCard指定時は、そのバースト発動のきっかけになった破壊で落ちたカードだけが対象（recoverMagicFromTrashの同名軸と同型）。destroyAtBattleEnd指定時は、召喚できた個体にCardInstance.destroyAtBattleEndを立てる（バトル参加者としてonBattleEndまで生き残ったら破壊される）

type MoveCards = Extract<EffectAction, { type: "moveCards" }>
type RevealActionT = Extract<LegacyMoveAction, { type: "reveal" }>

// 旧 type → moveCards（と if）への読み替え。データの機械移行（scripts）からも使う
export function legacyRecoverToMoveCards(a: Extract<LegacyMoveAction, { type: "recoverSpiritFromTrash" | "recoverMagicFromTrash" }>): EffectAction {
    if (a.type === "recoverMagicFromTrash") {
        const pick: CardPick = {
            ...(a.anyCardType ? {} : { cardType: "magic" as const }),
            ...(a.colors ? { color: a.colors } : {}),
            ...(a.hasBurst ? { hasBurst: true as const } : {}),
        }
        return { type: "moveCards", from: "trash", count: 1, dest: "hand", ...(Object.keys(pick).length ? { pick } : {}), ...(a.onlyBurstDestroyedCard ? { onlyEventCard: true as const } : {}) }
    }
    const anyOf: CardPick[] | undefined = a.bravesAnyOrSpiritColorFilter
        ? [{ cardType: "brave" }, { cardType: "spirit", color: a.bravesAnyOrSpiritColorFilter }]
        : a.costAtMostOrHasBurst !== undefined
          ? [{ cost: { max: a.costAtMostOrHasBurst } }, { hasBurst: true }]
          : a.keywordFilterAny
            ? a.keywordFilterAny.map((keyword) => ({ keyword }))
            : undefined
    const cardType: CardPick["cardType"] = a.anyCardType || a.bravesAnyOrSpiritColorFilter ? undefined : a.bravesOnly ? "brave" : a.includeBraves ? ["spirit", "brave"] : "spirit"
    const pick: CardPick = {
        ...(cardType ? { cardType } : {}),
        ...(anyOf ? { anyOf } : {}),
        ...(a.familyFilter !== undefined ? { family: a.familyFilter } : {}),
        ...(a.keywordFilter ? { keyword: a.keywordFilter } : {}),
        ...(a.colorFilter ? { color: a.colorFilter } : {}),
        ...(a.nameIncludes !== undefined ? { nameIncludes: a.nameIncludes } : {}),
        ...(a.vanillaFilter ? { vanilla: true as const } : {}),
        ...(a.costFilter ? { cost: a.costFilter } : {}),
        ...(a.excludeBurst ? { noBurst: true as const } : {}),
    }
    const move: EffectAction = {
        type: "moveCards",
        from: "trash",
        count: a.all ? "all" : a.count,
        dest: "hand",
        pick,
        ...(a.countCounter ? { countCounter: a.countCounter } : {}),
        ...(a.costBudget !== undefined ? { costBudget: a.costBudget } : {}),
    }
    // 「ドローしないことで」：実際に手札へ戻せたときだけ支払う
    if (a.costSkipDraw) return { type: "sequence", actions: [move, { type: "if", cond: { count: "lastMoved", atLeast: 1 }, then: { type: "skipDrawStep" } }] }
    if (a.thenDestroyIfFamily) {
        const t = a.thenDestroyIfFamily
        return { type: "sequence", actions: [move, { type: "if", cond: { last: { family: t.family } }, then: { type: "destroy", filter: { maxBp: t.maxBp }, count: 1 } }] }
    }
    return move
}

// 旧 summonFromTrashFree の道筋ごとの違いをそのまま写す：
// count・costBudget の道筋は召喚時効果を発揮させていなかった（skipOnSummon を明示する）。countCounter と1枚の道筋は発揮する
export function legacyTrashPlayToMoveCards(a: Extract<LegacyMoveAction, { type: "summonFromTrashFree" | "castMagicFromTrashByColor" | "deployNexusFromTrashByFieldCores" }>): MoveCards {
    if (a.type === "castMagicFromTrashByColor") return { type: "moveCards", from: "trash", count: 1, dest: "cast", pay: "cost", pick: { cardType: "magic", ...(a.colorFilter ? { color: a.colorFilter } : {}) } }
    if (a.type === "deployNexusFromTrashByFieldCores") return { type: "moveCards", from: "trash", count: 1, dest: "placeNexus", pay: "fieldCoresOnly", pick: { cardType: "nexus", color: a.colors } }
    const pick: CardPick = {
        cardType: "spirit",
        ...(a.colorFilter ? { color: a.colorFilter } : {}),
        ...(a.keywordFilter ? { keyword: a.keywordFilter } : {}),
        ...(a.familyFilter !== undefined ? { family: a.familyFilter } : {}),
        ...(a.nameIncludes !== undefined ? { nameIncludes: a.nameIncludes } : {}),
        ...(a.whileCombinedFilter ? { hasWhileCombined: true as const } : {}),
        ...(a.costFilter && a.costBudget === undefined ? { cost: a.costFilter } : {}),
    }
    const legacySkip = a.countCounter === undefined && !a.upTo && (a.costBudget !== undefined || a.count !== undefined)
    return {
        type: "moveCards",
        from: "trash",
        dest: "summon",
        pick,
        count: a.costBudget !== undefined ? "all" : (a.count ?? 1),
        ...(a.countCounter ? { countCounter: a.countCounter } : {}),
        ...(a.costBudget !== undefined ? { costBudget: a.costBudget } : {}),
        ...(a.upTo ? { upTo: true as const } : {}),
        ...(a.payCost ? { pay: "cost" as const } : {}),
        ...(a.skipOnSummon || legacySkip ? { skipOnSummon: true as const } : {}),
        ...(a.destroyAtBattleEnd ? { destroyAtBattleEnd: true as const } : {}),
        ...(a.onlyBurstDestroyedCard ? { onlyEventCard: true as const } : {}),
    }
}

// 旧 type は moveCards への読み替えだけ（データを移し終えたら消す）
// 旧 reveal → オープン＋選んだカードを送る＋残りを送る
export function legacyRevealToSteps(a: RevealActionT): EffectAction[] {
    const pickCount = a.pickCount ?? 1
    const open: EffectAction = {
        type: "revealOpen",
        ...(a.from !== undefined ? { from: a.from } : {}),
        ...(a.count !== undefined ? { count: a.count } : {}),
        ...(a.countPer !== undefined ? { countPer: a.countPer } : {}),
        ...(a.countFromSelfLevel ? { countFromSelfLevel: true as const } : {}),
        ...(a.destroySelfIf ? { destroySelfIf: a.destroySelfIf } : {}),
    }
    const pick: EffectAction = {
        type: "moveCards",
        from: "revealed",
        count: pickCount,
        dest: a.dest ?? "hand",
        // pick を書かない「すべて」は「残り」と区別するため、何にでも合う pick を置く
        pick: a.pick ?? {},
        ...(a.optional ? { optional: true as const } : {}),
        ...(a.tensho !== undefined ? { tensho: a.tensho } : {}),
        ...(a.noSummonEffects ? { noSummonEffects: true as const } : {}),
        ...(a.orHand ? { orHand: true as const } : {}),
        ...(a.returnToDeckBottomAtEndStep ? { returnToDeckBottomAtEndStep: true as const } : {}),
        ...(a.pay ? { pay: a.pay } : {}),
    }
    const rest: EffectAction = { type: "moveCards", from: "revealed", count: "all", dest: a.rest ?? "deckBottom" }
    const pick2: EffectAction[] = a.pick2 ? [{ type: "moveCards", from: "revealed", count: 1, dest: "hand", pick: a.pick2 }] : []
    return pickCount === 0 ? [open, rest] : [open, pick, ...pick2, rest]
}

// 旧 toHand／toDeck → moveCards
export function legacyHandDeckToMoveCards(a: Extract<LegacyMoveAction, { type: "toHand" | "toDeck" }>): MoveCards {
    if (a.type === "toHand") {
        return {
            type: "moveCards",
            from: "trash",
            count: a.count,
            dest: a.dest ?? "hand",
            ...(a.pick ? { pick: a.pick } : {}),
            ...(a.lastMovedOnly ? { lastMovedOnly: true as const } : {}),
            ...(a.destroyAtBattleEnd ? { destroyAtBattleEnd: true as const } : {}),
        }
    }
    return {
        type: "moveCards",
        from: a.from,
        count: a.all ? "all" : a.count,
        dest: a.position === "top" ? "deckTop" : "deckBottom",
        ...(a.side ? { side: a.side } : {}),
        ...(a.pick ? { pick: a.pick } : {}),
        ...(a.upTo ? { upTo: true as const } : {}),
        ...(a.chooserIsTarget ? { chooserIsTarget: true as const } : {}),
        ...(a.fromEvent ? { fromEvent: true as const } : {}),
        ...(a.revealed ? { revealed: true as const } : {}),
    }
}

// 旧 discardSelfChoose → moveCards（手札→トラッシュ）。「好きなだけ」は count:"all"（anyMax があればその数）＋upTo
export function legacyDiscardToMoveCards(a: Extract<LegacyMoveAction, { type: "discardSelfChoose" }>): MoveCards {
    const kw = a.keyword === undefined ? undefined : Array.isArray(a.keyword) ? a.keyword : [a.keyword]
    const pick: CardPick = {
        ...(a.cardType !== undefined ? { cardType: a.cardType } : {}),
        ...(a.family !== undefined ? { family: a.family } : {}),
        ...(kw ? (kw.length === 1 ? { keyword: kw[0]! } : { anyOf: kw.map((keyword) => ({ keyword })) }) : {}),
        ...(a.cardName !== undefined ? { name: a.cardName } : {}),
        ...(a.colorFilter !== undefined ? { color: a.colorFilter } : {}),
    }
    return {
        type: "moveCards",
        from: "hand",
        dest: "trash",
        count: a.count === "any" ? (a.anyMax ?? "all") : a.count,
        ...(a.count === "any" ? { upTo: true as const } : {}),
        ...(Object.keys(pick).length ? { pick } : {}),
        ...(a.downTo !== undefined ? { downTo: a.downTo } : {}),
    }
}

// 旧「選ぶ＋送る」の type を入れ子ごと新しい形へ（データの移行と、変換ツールの出力の後処理で使う）。
// reveal の3段は、親が「順に実行」の列ならその場に展開する（記録の枠が同じなので意味は変わらない）
export function migrateMoves<T>(x: T): T {
    const convert = (a: EffectAction | LegacyMoveAction): EffectAction => {
        switch (a.type) {
            case "toHand":
            case "toDeck":
                return legacyHandDeckToMoveCards(a)
            case "discardSelfChoose":
                return legacyDiscardToMoveCards(a)
            case "recoverSpiritFromTrash":
            case "recoverMagicFromTrash":
                return legacyRecoverToMoveCards(a)
            case "summonFromTrashFree":
            case "castMagicFromTrashByColor":
            case "deployNexusFromTrashByFieldCores":
                return legacyTrashPlayToMoveCards(a)
            case "reveal": {
                return { type: "sequence", keepScope: true, actions: legacyRevealToSteps(a) }
            }
            default:
                return a
        }
    }
    const isKeepScopeSeq = (c: unknown): c is { actions: unknown[] } =>
        !!c && typeof c === "object" && (c as { type?: string }).type === "sequence" && (c as { keepScope?: boolean }).keepScope === true
    const walk = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(walk)
        if (!v || typeof v !== "object") return v
        const o: Record<string, unknown> = {}
        for (const [k, c] of Object.entries(v)) {
            const m = walk(c)
            o[k] = k === "actions" && Array.isArray(m) ? m.flatMap((e) => (isKeepScopeSeq(e) ? e.actions : [e])) : m
        }
        return typeof o.type === "string" ? convert(o as EffectAction) : o
    }
    return walk(x) as T
}
