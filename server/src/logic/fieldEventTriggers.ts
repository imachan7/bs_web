// 盤面の出来事（fieldEvent）で起きる誘発の収集と解決。手札を得た・ネクサスを配置したときの通知もここ
import { zoneSpiritEffectsDisabled } from "../../../shared/rules"
import { noteCoverage } from "../../../shared/coverage"
import { canPayFreeSummonSurcharge } from "./summonSurcharge"
import { markPays } from "./actions/pay"
import { matchesPick } from "./actions/revealAction"
import type { CardInstance, CardType, Color, EffectAction, EffectDef, FieldEvent, GameState, Keyword, PlayerId } from "../type"
import { currentLevel, findInstanceAnywhere, getCard, minLevelCores, opponentOf, suspend, resolveInOrder } from "./GameState"
import { countSpiritsWeighted, effectiveBp, receivesBpPlus, effectSources, instanceSymbolCount, instColors, instHasColor, instHasTriggerEffect, instIsVanilla, isVirtualSource, cardNameContains, instMatchesCostFilter, matchesCostFilter, matchesFamilyFilter, instHasStaticKeyword, spiritHasKeyword, spiritHasKeywordOrLabel, effectActiveOn, instIsCombined, combinedBraveColorsOk, hostsOf } from "../../../shared/rules"
import { findSpiritAny, requestActivationConfirm, resolveAction, summonFreeFromHandIndex } from "./EffectModules"
import { claimOnce, isOnceUsed, markOnceUsed } from "./oncePerTurn"
import { fireBurstOnEvent } from "./keywords/burst"
import type { CollectedTrigger } from "./blockDeclared"
import { revertOncePerTurn, revertDestroyGroupUsage, fireTrigger, activationPrompt, confirmPromptIfOptional, isStillOnField } from "./triggers"

// フィールドイベント誘発：「フィールド上の他の何かに起きたこと」に対してネクサス／スピリットが反応する。
//   ownLifeDamaged: pid のライフが（相手によって）減らされたとき
//   ownSpiritDestroyed: pid のスピリットが破壊（または消滅）されたとき
//   anySpiritAttacked: どちらかのスピリットがアタックを宣言したとき（発生源の持ち主を問わず両フィールドから呼ぶ）
// pid のフィールド（スピリット→ネクサスの順、既存の走査順に合わせる）から
// kind:"fieldEvent" かつ event 一致かつレベル・phase・turn 条件を満たす効果を実行する。
// self には発生源インスタンス（効果を持つネクサス／スピリット自身）を渡す。
// selfOverride を指定すると、resolveAction に渡す self とその持ち主を差し替える
// （anySpiritAttacked では「アタックしたスピリット」に効果を作用させるため。
// fireBattleWonTriggers が勝利スピリットを self に渡すのと同じ考え方）。既存呼び出しには影響しない。
// eventColor を指定すると、colorFilter 付きの効果（event: "ownSpiritDestroyed" 限定）は
// この色と一致する場合のみ発火する（祝福されし大聖堂）。他イベントでは colorFilter を持つ
// データが無いため未指定のままでよい。
// 1件実行するたびに勝敗をチェックし、決着していれば残りは発火させない。
// 注意（再入）: ここで実行される action が destroySpirit を呼ぶと、本関数を呼び出した
// destroySpirit 自身への再入となる。現対象カードの action は draw / coreGain のみで
// destroySpirit を呼ばないため安全だが、将来 destroy 系アクションを組み合わせる場合は
// 無限ループ（破壊→誘発→破壊→…）が起きないよう設計時に確認すること。
// 上の extraItems の1件分。fieldEvent の誘発と同じ列に並ぶ
export interface FieldEventExtraItem {
    key: string // 「同じ効果か」の判定用（askOrder.key と同じ役目）
    label: string // 選択肢の表示
    action: EffectAction // 解決するアクション（内部専用アクションを渡す）
    selfInstanceId: string | null
    actorPid: PlayerId
    requiresPendingDestructionOf?: string // このフレームのガード
    // 非対話（テスト・AI）で順番を聞かないときの既定位置。true なら fieldEvent の誘発より前に置く。
    // 実対戦では askOrder が並べ替えるので効かない。**従来の解決順を変えないため**に要る
    // （破壊されたカード自身の『破壊時』は、もともと他カードの誘発より先だった）
    first?: true
}

export function fireFieldEventTriggers(
    state: GameState,
    pid: PlayerId,
    event: FieldEvent,
    selfOverride?: { pid: PlayerId; inst: CardInstance },
    eventColors?: Color[],
    targetInstanceId?: string,
    eventCount?: number,
    eventInfo?: {
        vanilla?: boolean
        byBattle?: boolean
        // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがそのバトルのアタッカーだったか（attackerOnly の判定に使う）
        wasAttacker?: boolean
        // event: "ownSpiritDestroyed" 限定：破壊されたスピリットの実効BP（破壊直前の近似値。kind:"burst".destroyedMinBpの判定に使う。BS15-034ミブロック・ジーナス）
        destroyedBp?: number
        // event: "ownNexusDestroyed" 限定：**相手の**スピリット/ネクサス/マジックの効果による破壊か
        // （destroyNexus が DestroyContext から求めて渡す。byOpponentEffectOnly の判定に使う）
        // event: "ownSpiritExhausted" 限定：**相手の**スピリット/ブレイヴ/マジックの効果による疲労か
        // （ネクサスの効果による疲労は含まない。fireExhaustedTriggers が計算する。BS12-062白煙の大山脈）
        byOpponentEffect?: boolean
        // event: "coresGainedFromVoid" | "lifeCorePlaced" 限定：コアが増えた側（subjectSide はこの陣営で判定する）
        gainerPid?: PlayerId
        // 疲労イベント限定：疲労させた効果の実行者と発生源種別（効果によらない疲労＝アタック宣言等では undefined。causedByOwnEffect の判定に使う）
        causePid?: PlayerId
        causeType?: CardType
        // event: "opponentSpiritDestroyed" 限定：破壊した側（発火する側）の効果による破壊のときの、その発生源の種別とカードID（destroyedByOwnEffect の判定に使う）
        ownEffectSourceType?: CardType
        ownEffectSourceCardId?: string
        // event: "ownSpiritDestroyed" 限定：**相手のスピリットの**効果による破壊か（byOpponentSpiritEffectOnly の判定に使う）
        bySpiritEffect?: boolean
        // event: "ownSpiritDestroyed" 限定：破壊した効果の発生源の種別（opponentEffectSourceTypes の判定に使う）
        destroySourceType?: CardType
        // 同上：その効果を発揮したスピリットのインスタンスID（byOpponentSpiritEffectOnly 指定時の対象決定に使う。BS10-012/BS10-014）。
        // event: "ownSpiritSummoned" 限定：**召喚されたスピリット自身**のインスタンスID（summonedSpiritAsTarget が読む。BS13-053モクバオー）
        sourceInstanceId?: string
        families?: string[]
        magicCost?: number
        magicTiming?: "main" | "flash"
        // event: "ownTensho" 限定：【転召】の犠牲になったスピリットのカード名（nameIncludesの判定に使う。BS08魔界七将アスモディオス）
        names?: string[]
        // 対象スピリットが「扱われている」コストの一覧（instAllCosts）。本来のコストに加え、
        // 道化師クランの付与コストも含めた複数値になりうるため、配列で受け取りいずれかが
        // costFilter を満たせばよい（instMatchesCostFilterと同じOR意味論）
        costs?: number[]
        // event: "ownSpiritCoresRemovedByOpponent" 限定：実際に取り除かれたコア数。
        // effect.countMode === "cores" のエントリのみ repeatPerCount の繰り返し回数として使う（BS06希望の大灯台Lv1）
        coresRemoved?: number
        // event: "ownSpiritSummoned" 限定：その召喚が【不死】によるものだったか（fushiSummonOnly の判定に使う。BS09-013ミミズクロ）
        byFushi?: boolean
        // 同上：その召喚が【神速】によるものだったか（sokuSummonOnly の判定に使う。BS11-065 満天の牧草地Lv2）
        bySoku?: boolean
        // 同上：《継召》で召喚されたか（keishoSummonOnly の判定に使う。26RBS02-079）
        byKeisho?: boolean
        // event: "ownSpiritDestroyed" 限定：消滅（維持コア割れ）で、その原因が相手の効果だったか（byOpponentVanishOnly の判定に使う。26RBS02-079）
        vanishedByOpponent?: boolean
        // 同上：手札からの召喚だったか（fromHandOnly の判定に使う。BS11-X05 魔導双神ジェミナイズ）
        fromHand?: boolean
        // event: "ownMagicUsed" 限定：そのマジックが「コストを支払って」使用されたか（paidCostOnly の判定に使う。BS11-X05 魔導双神ジェミナイズ Lv2-3）
        paidCost?: boolean
        // 同上：使用したマジックの cardId（magicPick の判定に使う）
        magicCardId?: string
        // event: "ownBurstActivated" 限定：発動したバーストのカードのコスト（docs/design/BURST.md）
        burstCost?: number
        // event: "anySpiritRefreshed" 限定：回復させた効果の発生源種別（refreshSpiritのsourceType引数をそのまま渡す。
        // undefined＝リフレッシュステップ・ネクサスの効果由来。refreshSourceTypeFilterの判定に使う。BS14-085賛美するパイプオルガン）
        refreshSourceType?: CardType
        // event: "ownKeywordActivated" 限定：発揮されたキーワード（【増幅】/【水流】等のラベルID）
        keyword?: Keyword
        // event: "ownSpiritBpReached" 限定：前回観測したBPと今回のBP（bpReachedAt の判定に使う）
        bpFrom?: number
        bpTo?: number
    },
    // 場から離れた発生源を走査に加える（「**自分のネクサスが破壊されたとき**」を、
    // 破壊されたネクサス自身が持っている場合。effectSources はもう場にいないものを返さないため、
    // これが無いと自分自身の破壊では無言で発火しない。BS07の各色ネクサス6枚。2026-08-10 修正）
    extraSources?: CardInstance[],
    // 破壊で誘発した効果を1列に並べるための外部項目（docs/design/TIMING_CHART.md）。
    // ownSpiritDestroyed から、破壊されたカード自身の『破壊時』と「フィールドに残る／戻る」を
    // **同じ列**に混ぜてターンプレイヤーに順番を選ばせるために使う。他のイベントでは使わない
    extraItems?: FieldEventExtraItem[],
    // 発生源から除外する instanceId（docs/design/BURST.md）。ownBurstActivated が
    // 「発動開始時点で場にいた発生源にだけ発火させる」ために、summonBurstCardFreeで新しく場に出た
    // 個体をここで除く
    excludeInstanceIds?: string[],
    // BS16バッチ0：破壊後バースト（kind:"burst".event:"ownSpiritDestroyed"）は、破壊待機中のこの走査では
    // 判定しない（トラッシュ行き確定の後に fireQueuedDestroyBursts が1回だけ判定する。TIMING_CHART.md ＞６）。
    // trueのときはこの関数末尾のバースト走査を丸ごと飛ばす
    skipBurst?: true,
    // 渡されたら解決せずに各件を積んで返る。末尾のバースト判定も呼ばない（呼び出し側が解決後に行う）
    collect?: CollectedTrigger[],
): void {
    const player = state.players[pid]
    // effectSources()：このターンだけの仮想発生源（マジックが貸した継続効果。lendSelfThisTurn。
    // BS05ソウルクラッシュ）も含める。「誰が誘発効果を出しているか」を問うA分類の走査
    // （TURN_EFFECT_SOURCES.md §1）
    // extraSources は場を離れた個体を拾うためのもの。破壊処理の途中ではその個体がまだ field.spirits に居るので、
    // instanceId で重複を除く（除かないと fieldEvent＋selfOnly が2回解決される。BS13-010スカルザード。smoke part341）
    const baseSources = effectSources(state, pid)
    const instances = extraSources && extraSources.length > 0
        ? [...baseSources, ...extraSources.filter((x) => !baseSources.some((b) => b.instanceId === x.instanceId))]
        : baseSources
    // ⚠️ **発火するものを先に全部集めてから順に解決する**（2026-08-17。fireStepTriggers と同じ形）。
    // 以前はループの中で直接解決し、選択待ちが立ったら `return` するだけだったため、
    // **同じイベントの残りの誘発が永久に失われていた**
    // （共鳴する音叉の塔を2枚並べると、1枚目の確認で中断して2枚目が発火しなかった）。
    // 条件は**誘発した時点**で判定する（repeatTimes もここで確定させる）
    const firing: {
        inst: CardInstance
        effect: Extract<EffectDef, { kind: "fieldEvent" }>
        repeatTimes: number
    }[] = []
    for (const inst of instances) {
        if (excludeInstanceIds?.includes(inst.instanceId)) continue
        const card = getCard(inst.cardId)
        const level = currentLevel(inst).level
        for (const effect of card.effects) {
            if (effect.kind !== "fieldEvent") continue
            if (effect.event !== event || (event === "ownTensho" && inst.noOnSummon)) continue
            // lentOnly：仮想発生源からのみ有効（実在カードが同じエントリを持っても恒久化させない）
            if (effect.lentOnly && !isVirtualSource(inst)) continue
            // selfOnly：発生源自身が破壊されたときだけ（ownSpiritDestroyed 限定。BS13-010 スカルザード）
            if (effect.selfOnly && inst.instanceId !== selfOverride?.inst.instanceId) continue
            // excludeSelfSubject（BS15-009虚龍帝カタストロフドラゴン）：イベントの主体が発生源自身のときは発火しない
            if (effect.excludeSelfSubject && inst.instanceId === selfOverride?.inst.instanceId) continue
            if (!effectActiveOn(inst, effect, level)) continue
            // 個体ごとの枠は集める時点で取る。名前スコープの枠は resolve の直前に取る（同名の1体目が不発なら2体目が使える）
            if (effect.oncePerTurn === true && isOnceUsed(state, pid, inst, effect, "triggeredUsedTurn")) continue
            // 【合体時】の色条件（X008）
            if (!combinedBraveColorsOk(state.players[pid], inst, effect.combinedBraveColors)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            // 「ドローステップ以外で」（BS08ダークアンキラーザウルス）：指定ステップでは発火しない
            if (effect.excludePhase !== undefined && state.phase === effect.excludePhase) continue
            if (effect.turn === "own" && pid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && pid === state.turnPlayer) continue
            // ownOnly（BS06冥騎士アンドラー／冥府の深淵）：発生源の持ち主（pid）のスピリットがアタックしたときのみ
            // （selfOverride.pidが発生源の持ち主と一致するときだけ通す。「自分のスピリットが」の限定）
            if (effect.ownOnly && selfOverride?.pid !== pid) continue
            // subjectSide：**イベントの主体がどちら側か**で絞る（turn＝誰のターンか、とは別軸）。
            // 「**相手の**スピリットが疲労したとき」のように、any…系のイベントで
            // 主体の陣営だけを条件にしたいときに使う（SD01-028 呪われし神殿Lv2）
            // subjectCombined：**イベントの主体が合体しているか**で絞る（BS10-070 鎧馬アルファズル）
            if (
                effect.subjectCombined !== undefined &&
                (selfOverride === undefined || instIsCombined(selfOverride.inst) !== effect.subjectCombined)
            ) {
                continue
            }
            // コア増加イベントの主体は「コアが増えた側」（selfOverride を持たない）
            const gainerEvent = event === "coresGainedFromVoid" || event === "lifeCorePlaced"
            if (gainerEvent) {
                if (effect.subjectSide === "own" && eventInfo?.gainerPid !== pid) continue
                if (effect.subjectSide === "opponent" && eventInfo?.gainerPid === pid) continue
            } else if (effect.subjectSide === "own" && selfOverride?.pid !== pid) continue
            if (
                !gainerEvent &&
                effect.subjectSide === "opponent" &&
                (selfOverride === undefined || selfOverride.pid === pid)
            ) {
                continue
            }
            // subjectMaxCores（BS13-063血塗られた魔具）：アタックしたスピリット自身のコア数で絞る
            if (effect.subjectMaxCores !== undefined && (selfOverride === undefined || selfOverride.inst.cores > effect.subjectMaxCores)) continue
            if (effect.colorFilter !== undefined && !(eventColors ?? []).includes(effect.colorFilter)) continue
            // sourceColorFilter：「**相手の**この色のスピリット/ネクサス/マジックの**効果によって**起きたとき」
            // だけ発火する（SD01-029 蠢く地下墓地Lv1＝緑／SD01-031 朝焼け岬Lv1＝紫）。
            // colorFilter がイベント**対象**の色を見るのに対し、こちらは効果の**発生源**の色を見る。
            // currentEffectSource が無い＝効果によらない動き（ドローステップのドロー・コアステップのコア置き）
            // なので発火させない。docs/design/EFFECT_SOURCE_CONTEXT.md
            if (effect.sourceColorFilter !== undefined) {
                const src = state.currentEffectSource
                if (!src) continue
                if (src.pid === pid) continue
                if (!(src.colors ?? []).includes(effect.sourceColorFilter)) continue
            }
            // targetColorFilter：イベントの「相手役」（targetInstanceId）の色で絞る。
            // colorFilter（イベントの主体の色）とは別軸（SD01-029 蠢く地下墓地Lv2＝緑にブロックされたとき）
            if (effect.targetColorFilter !== undefined) {
                if (targetInstanceId === undefined) continue
                const found = findSpiritAny(state, targetInstanceId)
                if (!found) continue
                if (!instHasColor(found.inst, effect.targetColorFilter)) continue
            }
            // vanillaOnly：破壊/召喚のように主体が既にフィールドを離れているイベントは
            // 呼び出し側が eventInfo.vanilla を渡す。anySpiritAttacked のように主体が場に残る
            // イベントは selfOverride の実体で判定する（継続付与の「バニラとしても扱う」も見る）
            if (effect.vanillaOnly) {
                const subjectIsVanilla = eventInfo?.vanilla ?? (selfOverride !== undefined && instIsVanilla(selfOverride.inst))
                if (!subjectIsVanilla) continue
            }
            // subjectKeywordFilter（BS11-069 黄金の鐘楼Lv2＝【聖命】持ち）：主体の実体で判定する。
            // 破壊のイベントでも、この時点では破壊待機状態でまだ場にいるのでキーワードを読める
            if (effect.subjectKeywordFilter !== undefined) {
                if (selfOverride === undefined) continue
                const needs = Array.isArray(effect.subjectKeywordFilter)
                    ? effect.subjectKeywordFilter
                    : [effect.subjectKeywordFilter]
                if (!needs.some((kw) => spiritHasKeywordOrLabel(state, selfOverride.pid, selfOverride.inst, kw))) continue
            }
            // 器BS16：subjectMaxCost / subjectHasTrigger（BS16-064宙吊りの五行山Lv2）。
            // 主体の実体（selfOverride）で判定する＝subjectKeywordFilterと同じ考え方
            if (effect.subjectMaxCost !== undefined) {
                if (selfOverride === undefined || !instMatchesCostFilter(selfOverride.inst, { max: effect.subjectMaxCost })) continue
            }
            if (effect.subjectMinCost !== undefined) {
                if (selfOverride === undefined || !instMatchesCostFilter(selfOverride.inst, { min: effect.subjectMinCost })) continue
            }
            if (effect.subjectReceivesBpPlus && (selfOverride === undefined || !receivesBpPlus(state, selfOverride.pid, selfOverride.inst))) continue
            if (effect.bpReachedAt !== undefined && !(eventInfo?.bpFrom !== undefined && eventInfo.bpTo !== undefined && eventInfo.bpFrom < effect.bpReachedAt && effect.bpReachedAt <= eventInfo.bpTo)) continue
            if (effect.blockerMaxBp !== undefined) {
                const blocker = targetInstanceId === undefined ? undefined : findSpiritAny(state, targetInstanceId)
                if (!blocker || effectiveBp(state, blocker.pid, blocker.inst) > effect.blockerMaxBp) continue
            }
            if (effect.subjectMinBp !== undefined && (selfOverride === undefined || effectiveBp(state, selfOverride.pid, selfOverride.inst) < effect.subjectMinBp)) continue
            if (effect.subjectRefreshed && (selfOverride === undefined || selfOverride.inst.isRested)) continue
            if (effect.subjectMinSymbols !== undefined && (selfOverride === undefined || instanceSymbolCount(selfOverride.inst) < effect.subjectMinSymbols)) continue
            // 本来はネクサスの主体（スピリットとして扱われているネクサス。26RBS02-X16）
            if (effect.subjectOriginalNexus && (selfOverride === undefined || getCard(selfOverride.inst.cardId).type !== "nexus")) continue
            if (effect.subjectDifferentNameFromSelf && (selfOverride === undefined || getCard(selfOverride.inst.cardId).name === getCard(inst.cardId).name)) continue
            if (effect.subjectTeamFilter !== undefined) {
                if (selfOverride === undefined || !(getCard(selfOverride.inst.cardId).team ?? []).includes(effect.subjectTeamFilter)) continue
            }
            if (effect.subjectHasTrigger !== undefined) {
                if (selfOverride === undefined || !instHasTriggerEffect(selfOverride.inst, effect.subjectHasTrigger)) continue
            }
            if (effect.destroyedByOwnEffect) {
                const want = effect.destroyedByOwnEffect
                if (eventInfo?.ownEffectSourceType !== want.sourceType) continue
                if (want.sourceFamily !== undefined) {
                    const fams = eventInfo.ownEffectSourceCardId !== undefined ? getCard(eventInfo.ownEffectSourceCardId).family : []
                    if (!(Array.isArray(want.sourceFamily) ? want.sourceFamily : [want.sourceFamily]).some((f) => fams.includes(f))) continue
                }
            }
            if (effect.destroyedMaxBp !== undefined && !(eventInfo?.destroyedBp !== undefined && eventInfo.destroyedBp <= effect.destroyedMaxBp)) continue
            if (effect.byBattleOnly && !eventInfo?.byBattle) continue
            // 「アタックした自分のスピリットが破壊されるたび」（BS06ベリアルドロー）：
            // ブロッカーとして破壊された場合は発火させない
            if (effect.attackerOnly && !eventInfo?.wasAttacker) continue
            // 「このスピリットのアタック時」限定（BS16-027）：発生源自身が現在のバトルのアタッカーであるときだけ
            if (effect.duringSelfAttack && state.battle?.attackerInstanceId !== inst.instanceId) continue
            // 「相手のスピリット/ネクサス/マジックの効果で破壊されたとき」（BS07の各色ネクサス6枚・BS12-023ウドウ）：
            // 自分の効果による破壊・発生源が不明な破壊・バトルでの破壊では発火しない（「相手によって」は byOpponentOnly）
            if (effect.byOpponentEffectOnly && !(eventInfo?.byOpponentEffect && !eventInfo.byBattle)) continue
            if (effect.opponentEffectSourceTypes && !(eventInfo?.destroySourceType !== undefined && effect.opponentEffectSourceTypes.includes(eventInfo.destroySourceType))) continue
            // 「相手の〜の効果で増えたとき」：効果の持ち主が発生源の持ち主でないことも見る
            if (event === "coresGainedFromVoid" && effect.opponentEffectSourceTypes && eventInfo?.causePid === pid) continue
            if (effect.causedByOpponent && !(eventInfo?.causePid !== undefined && eventInfo.causePid !== pid)) continue
            if (effect.causedByOwnEffect !== undefined) {
                if (eventInfo?.causePid !== pid || eventInfo.causeType === undefined) continue
                if (effect.causedByOwnEffect === "spirit" && eventInfo.causeType !== "spirit") continue
            }
            // 「相手によって破壊されたとき」（BS15-061幼竜の揺り籠Lv2）：相手の効果による破壊 **または**
            // バトルのBP比較による破壊（reviveOnDestroy.when.byOpponentと同じ判定。byOpponentEffectOnlyより広い）
            if (effect.byOpponentOnly && !(eventInfo?.byOpponentEffect || eventInfo?.byBattle)) continue
            // 「相手のスピリットの効果で破壊されたとき」（BS10-012アントイーター/BS10-014闇騎士マリス）
            if (effect.byOpponentSpiritEffectOnly && !eventInfo?.bySpiritEffect) continue
            // event: "anySpiritRefreshed" 限定：回復させた効果の発生源種別で絞る（BS14-085賛美するパイプオルガン：
            // 「スピリット/マジックの効果で回復した」＝ネクサスの効果・リフレッシュステップ由来（sourceType未指定）は対象外）
            if (
                effect.refreshSourceTypeFilter !== undefined &&
                (eventInfo?.refreshSourceType === undefined ||
                    !effect.refreshSourceTypeFilter.includes(eventInfo.refreshSourceType))
            ) {
                continue
            }
            // event: "ownKeywordActivated" 限定：発揮されたキーワードで絞る（「自分のスピリットが【増幅】を
            // 発揮した時」＝keywordActivatedFilter:"zofuku"。イベントpayloadのkeywordと突合）
            if (effect.keywordActivatedFilter !== undefined && eventInfo?.keyword !== effect.keywordActivatedFilter) {
                continue
            }
            // 破壊/消滅したスピリットのコストで絞る（BS05天使クレイオ：コスト2）。
            // 道化師クランの付与コストも見るため、eventInfo.costsのいずれかが条件を満たせばよい
            if (
                effect.costFilter !== undefined &&
                !(eventInfo?.costs ?? []).some((c) => matchesCostFilter(c, effect.costFilter))
            ) {
                continue
            }
            // アタックしたスピリット（selfOverride）の実効BPで絞る（BS08ダークスカルデーモン：BP6000以下）
            if (
                effect.maxBp !== undefined &&
                (selfOverride === undefined ||
                    effectiveBp(state, selfOverride.pid, selfOverride.inst) > effect.maxBp)
            ) {
                continue
            }
            // アタックしたスピリット（selfOverride）のシンボル数で絞る（BS12-037オリンピアの天使ベトール：シンボル2つ）
            if (
                effect.symbolCount !== undefined &&
                (selfOverride === undefined || instanceSymbolCount(selfOverride.inst) !== effect.symbolCount)
            ) {
                continue
            }
            // 「一度に◯枚以上破棄したとき」（アリゲイド）：eventCount が閾値以上のときのみ
            if (effect.minEventCount !== undefined && (eventCount ?? 0) < effect.minEventCount) continue
            // 相手のマジック使用（氷の女神フリッグ）：コスト／タイミングの一致で絞る
            if (effect.magicCostEquals !== undefined && eventInfo?.magicCost !== effect.magicCostEquals) continue
            if (effect.magicTiming !== undefined && eventInfo?.magicTiming !== effect.magicTiming) continue
            // 「このスピリットが疲労したとき」（スクルディア）：イベント対象が発生源自身のときだけ
            // eventTargetIsSelf：「このスピリットが」＝inst自身が対象のとき。inst が合体中のブレイヴ自身なら
            // 「このスピリット」はホスト（合体スピリット。1体として振る舞う）を指す（selfMode:"source"と同じ考え方。
            // BS14-068ストラスト【合体時】：「このスピリットが疲労したとき」＝ホストが疲労したとき）
            if (effect.eventTargetIsSelf) {
                const selfTarget = inst.braveCombined === true ? (hostsOf(player, inst)[0] ?? inst) : inst
                if (selfOverride?.inst.instanceId !== selfTarget.instanceId) continue
            }
            // 「[カード名]以外の」の除外（BS06鉄拳のカクタスガルー）：イベント対象が発生源自身のときは発火しない
            if (effect.excludeSelfAsEventTarget && selfOverride?.inst.instanceId === inst.instanceId) continue
            // イベント対象のカード名で絞る（BS05ペンタン帝国Lv2：「ペンタン」/「アンプルール」）。
            // event: "ownTensho" はselfOverrideを渡さないため、eventInfo.names（【転召】の犠牲になった
            // スピリットのカード名）があればそちらで判定する（BS08魔界七将アスモディオス）
            if (effect.nameIncludes !== undefined) {
                const nameOk =
                    eventInfo?.names !== undefined
                        ? effect.nameIncludes.some((n) => eventInfo.names?.some((name) => name.includes(n)))
                        : selfOverride !== undefined &&
                          effect.nameIncludes.some((n) => cardNameContains(selfOverride.inst, n))
                if (!nameOk) continue
            }
            // targetInstanceId のスピリットのLvがイベント対象と同じときだけ
            // （BS05ペンタン帝国Lv2：同じLvの相手のスピリットにブロックされたとき）
            if (effect.targetSameLevelAsSelf) {
                const target = targetInstanceId ? findInstanceAnywhere(state, targetInstanceId) : null
                if (!target || !selfOverride) continue
                if (currentLevel(target).level !== currentLevel(selfOverride.inst).level) continue
            }
            if (effect.familyFilter !== undefined) {
                // 配列指定はいずれかの系統を持てばよい（OR。BS04七龍帝の玉座＝古竜/龍帝）
                const wanted = Array.isArray(effect.familyFilter)
                    ? effect.familyFilter
                    : [effect.familyFilter]
                const ok =
                    eventInfo?.families !== undefined
                        ? // 破壊/召喚イベント：呼び出し側が渡した**カード静的な系統**で判定する（従来どおり）
                          wanted.some((f) => eventInfo.families?.includes(f))
                        : // families を渡さないイベント（疲労）：継続付与された系統も含めて判定する
                          // （BS02生み出される尖兵：自身のLv1が与える「武装」を Lv2 が見る）
                          selfOverride !== undefined &&
                          matchesFamilyFilter(state, selfOverride.pid, selfOverride.inst, effect.familyFilter)
                if (!ok) continue
            }
            // 【不死】の効果で召喚されたときのみ（BS09-013ミミズクロ）。通常の召喚では発火しない
            if (effect.fushiSummonOnly && eventInfo?.byFushi !== true) continue
            if (effect.sokuSummonOnly && eventInfo?.bySoku !== true) continue
            if (effect.subjectNotInBattle && (selfOverride === undefined || selfOverride.inst.instanceId === state.battle?.attackerInstanceId || selfOverride.inst.instanceId === state.battle?.blockerInstanceId)) continue
            if (effect.keishoSummonOnly && eventInfo?.byKeisho !== true) continue
            if (effect.byOpponentVanishOnly && eventInfo?.vanishedByOpponent !== true) continue
            if (effect.fromHandOnly && eventInfo?.fromHand !== true) continue
            // 「コストを支払って」使用されたときのみ（BS11-X05 魔導双神ジェミナイズLv2-3）。
            // このカード自身の無償使用（paidCost:false）からは連鎖しない
            if (effect.paidCostOnly && eventInfo?.paidCost !== true) continue
            if (effect.magicPick && !(eventInfo?.magicCardId && matchesPick(eventInfo.magicCardId, effect.magicPick))) continue
            // 「ターンに2回しか使えない」：実際に無償使用した回数（confirmで断った・候補が無かった場合は含まない）で絞る
            if (effect.magicFreeUseMaxPerTurn !== undefined) {
                const usedSoFar = inst.magicFreeUseTurn === state.turn ? (inst.magicFreeUseCount ?? 0) : 0
                if (usedSoFar >= effect.magicFreeUseMaxPerTurn) continue
            }
            // イベント対象（召喚された／アタックしたスピリットなど）がこのキーワードを持つときのみ。
            // 「持つ」には効果で得たものも含む（2026-09-25 ユーザー確認）
            if (effect.keywordFilter !== undefined) {
                const hasKw =
                    selfOverride !== undefined
                        ? spiritHasKeywordOrLabel(state, selfOverride.pid, selfOverride.inst, effect.keywordFilter)
                        : instHasStaticKeyword(inst, effect.keywordFilter)
                if (!hasKw) continue
            }
            if (effect.condition) {
                if (effect.condition === "selfIsAttacking") {
                    // キノコノコ：発生源自身が現在のバトルのアタッカーであるときのみ
                    // 合体中のブレイヴが発生源なら、アタッカーはホスト（合体スピリットは1体）
                    const selfAttacker = inst.braveCombined === true ? (hostsOf(player, inst)[0] ?? inst) : inst
                    if (!state.battle || state.battle.attackerInstanceId !== selfAttacker.instanceId) continue
                } else if ("attacksThisTurnAtLeast" in effect.condition) {
                    if (state.attacksThisTurn < effect.condition.attacksThisTurnAtLeast) continue
                } else if ("firstAttackOfTurn" in effect.condition) {
                    // 神鳴る霊峰Lv2：そのターンの最初のアタックのときのみ（triggered.conditionの同名軸と同じ判定）
                    if (state.attacksThisTurn !== 1) continue
                } else if ("targetMaxBp" in effect.condition) {
                    // BS08竜騎集う円卓：ライフを減らしたスピリット（targetInstanceId＝アタッカー）の
                    // 実効BPがこれ以下のときのみ（見つからなければ発火しない）
                    if (targetInstanceId === undefined) continue
                    const found = findSpiritAny(state, targetInstanceId)
                    if (!found) continue
                    if (effectiveBp(state, found.pid, found.inst) > effect.condition.targetMaxBp) continue
                } else if ("ownColorTotalAtLeast" in effect.condition) {
                    // 花の子リップ：発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上
                    const { color, count } = effect.condition.ownColorTotalAtLeast
                    const sources = [...player.field.spirits, ...player.field.nexuses]
                    const total = sources.filter((s) => instHasColor(s, color)).length
                    if (total < count) continue
                } else if ("ownFamilyCountAtLeast" in effect.condition) {
                    // 魔力満ちる泉：発生源の持ち主のフィールドに指定系統のスピリットがcount体以上
                    const { family, count } = effect.condition.ownFamilyCountAtLeast
                    const total = countSpiritsWeighted(
                        state,
                        pid,
                        pid,
                        (s) => matchesFamilyFilter(state, pid, s, family),
                        getCard(inst.cardId).type,
                    )
                    if (total < count) continue
                } else if ("ownHandAtLeast" in effect.condition) {
                    if (state.players[pid].hand.length < effect.condition.ownHandAtLeast) continue
                } else if ("ownFieldHasColorNexus" in effect.condition) {
                    // 修理屋バラン・バラン：発生源の持ち主のフィールドに指定色のネクサスがある
                    const color = effect.condition.ownFieldHasColorNexus
                    if (!player.field.nexuses.some((n) => instHasColor(n, color))) continue
                } else if ("targetMaxCostOfEventTarget" in effect.condition) {
                    // SD02-004 神獣ハクタクLv2-3：ブロックした相手（targetInstanceId）のコストがこれ以下のときのみ。
                    // 道化師クランの付与コストも見るため instMatchesCostFilter を使う
                    if (targetInstanceId === undefined) continue
                    const found = findSpiritAny(state, targetInstanceId)
                    if (!found) continue
                    if (!instMatchesCostFilter(found.inst, { max: effect.condition.targetMaxCostOfEventTarget })) continue
                } else if ("lastMilledHasEx" in effect.condition) {
                    if (!(state.lastDeckMill?.cardIds ?? []).some((id) => getCard(id).symbolEx === true)) continue
                } else if ("lastFunsaiHasSpirit" in effect.condition) {
                    // BS11-042 海賊ラッコルセア：直前の【粉砕】で破棄したカードの中にスピリットカードがあったときのみ
                    // （triggered.conditionの同名軸と同じ判定。GameState.lastFunsai）
                    if ((state.lastFunsai?.spirits ?? 0) === 0) continue
                } else if ("lastFunsaiHasCostAtLeast4" in effect.condition) {
                    // BS15共通器：BS15-053コジロンド・ゴレムLv2-3「コスト4以上のカードを破棄したとき」
                    if ((state.lastFunsai?.costAtLeast4 ?? 0) === 0) continue
                } else if ("opponentHandAtLeastOwnHand" in effect.condition) {
                    // BS13-042ナイト・ゴーンLv2：相手の手札枚数が自分の手札枚数以上のときのみ
                    if (state.players[opponentOf(pid)].hand.length < state.players[pid].hand.length) continue
                } else if ("opponentMagicUsedAtLeast" in effect.condition) {
                    // BS13-071巨人港Lv2：このターンに相手がマジックの効果を使用した回数がこれ以上のときのみ
                    // （state.magicUsedThisTurnはresolveMagicの解決前に加算済み＝この誘発の時点で最新値）
                    if ((state.magicUsedThisTurn[opponentOf(pid)] ?? 0) < effect.condition.opponentMagicUsedAtLeast) continue
                } else if ("burstCostAtMost" in effect.condition) {
                    // event: "ownBurstActivated" 限定：発動したバーストのカードのコストがこれ以下のときのみ
                    // （SD06-007英雄龍ロード・ドラゴン：「発動したカードがコスト5以下のとき」）
                    if (eventInfo?.burstCost === undefined || eventInfo.burstCost > effect.condition.burstCostAtMost) continue
                } else if ("ownBurstSet" in effect.condition) {
                    // BS14-X04氷の覇王ミブロック・バラガン：「自分のバーストをセットしていないとき」
                    // （triggered.conditionの同名軸と同じ判定。falseなら未セットの間だけ発火）
                    if (state.players[pid].burstSet !== effect.condition.ownBurstSet) continue
                } else {
                    // BS08デストラクションバリア：ライフを減らしたスピリットが指定キーワードを持つときは発火しない
                    if (targetInstanceId === undefined) continue
                    const found = findSpiritAny(state, targetInstanceId)
                    if (!found) continue
                    if (spiritHasKeyword(state, found.pid, found.inst, effect.condition.targetKeywordExclude)) continue
                }
            }
            // repeatPerCount（バラン・バラン「置かれるたび」）: 実破棄枚数ぶんアクションを繰り返す。
            // countMode:"cores"（希望の大灯台Lv1）指定時は、影響を受けたスピリット数(eventCount)ではなく
            // 取り除かれたコア数(eventInfo.coresRemoved)を繰り返し回数にする（省略時は従来どおりeventCount）
            const repeatTimes = effect.repeatPerCount
                ? effect.countMode === "cores" && eventInfo?.coresRemoved !== undefined
                    ? eventInfo.coresRemoved
                    : effect.countMode === "funsaiSpirits"
                      ? (state.lastFunsai?.spirits ?? 0)
                      : eventCount
                        ? eventCount
                        : 1
                : 1
            // 同時破壊グループ：2体以上が同時に破壊されても、他カードの「破壊されたとき」は
            // グループにつき1回だけ（perDestroyed 指定は対象外。公式Q&A Q22359。fix/destroyed-trigger-once）。
            // 消費は resolve 側で解決確定するまでの間だけ先取りし、断った／不発なら revertDestroyGroupUsage で戻す
            // （oncePerTurn と同じ「マッチ時点で仮消費 → 未発揮なら巻き戻す」形）
            if (
                (event === "ownSpiritDestroyed" || event === "opponentSpiritDestroyed") &&
                state.destroyGroup &&
                effect.perDestroyed !== true
            ) {
                const groupKey = `${inst.instanceId}:${effect.id}`
                if (state.destroyGroup.used.includes(groupKey)) continue
                state.destroyGroup.used.push(groupKey)
            }
            // 発揮しなかったときは解決後に巻き戻す（triggered と同型。2026-09-16）
            if (effect.oncePerTurn && effect.onceScope !== "name") markOnceUsed(state, pid, inst, effect, "triggeredUsedTurn")
            firing.push({ inst, effect, repeatTimes })
        }
    }

    // 集めたものを順に解決する。`remaining` は「この誘発の残り回数」（repeatPerCount のぶん）
    const queue: { inst: CardInstance; effect: Extract<EffectDef, { kind: "fieldEvent" }> }[] = []
    for (const e of firing) for (let i = 0; i < e.repeatTimes; i++) queue.push({ inst: e.inst, effect: e.effect })

    // 1件ぶんの解決に必要な文脈（再開スタックへ積むときも同じ組み合わせを使う）
    const contextOf = (inst: CardInstance, effect: Extract<EffectDef, { kind: "fieldEvent" }>) => {
        // selfMode:"source" 指定時は、イベント対象ではなく発生源自身を self にする
        // （BS04鎧装獣ヘイズ・ルーン：相手のコスト1以下がアタックしたとき「このスピリットは回復する」）
        // ignoreEventTarget：イベント対象を効果の対象にしない（SD01-029 蠢く地下墓地Lv2）
        // byOpponentSpiritEffectOnly：対象をイベント対象ではなく「その効果を発揮したスピリット」にする
        // （eventInfo.sourceInstanceId。BS10-012アントイーター/BS10-014闇騎士マリス）
        const actionTargetId = effect.byOpponentSpiritEffectOnly || effect.summonedSpiritAsTarget || effect.eventSourceAsTarget
            ? eventInfo?.sourceInstanceId
            : effect.attackerAsTarget
              ? selfOverride?.inst.instanceId
              : effect.ignoreEventTarget
                ? undefined
                : targetInstanceId
        // inst が合体中のブレイヴ自身のときは、self はホスト（＝合体スピリット。1体として振る舞う）にする
        // （BS10鎧馬アルファズル・BS12-053オオヅツナナフシ：refreshSelf はホストの isRested を操作する必要がある）
        const src = inst.braveCombined === true ? (hostsOf(player, inst)[0] ?? inst) : inst
        if (effect.selfMode === "source") {
            return { actionPid: pid, actionSelf: src, actionTargetId, srcColors: undefined, srcType: undefined }
        }
        if (selfOverride) {
            // self はイベント対象（召喚されたスピリット等。filter の self 相対BPが参照する）だが、
            // **効果の発生源はこのエントリを持つカード（inst）**。装甲・マジック効果耐性の判定に使う
            // 色と種別は発生源のものを明示的に渡す（渡さないと self から導出され、
            // 「召喚されたスピリットの色で装甲を判定する」誤りになる。BS04七龍帝の玉座／鋼葉の樹林）
            // 「そのスピリットを破壊する／疲労させる」は発生源の持ち主の効果（2026-09-30 ユーザー確認）。
            // イベント対象が相手側でも実行者は発生源の持ち主にする（装甲などの耐性と「相手の効果で〜」の判定に効く）
            const actsOnEventSubject = (effect.action.type === "destroy" && effect.action.target === "self") || (effect.action.type === "exhaust" && effect.action.target === "self")
            return {
                actionPid: actsOnEventSubject ? pid : selfOverride.pid,
                actionSelf: selfOverride.inst,
                actionTargetId,
                srcColors: instColors(inst),
                srcType: getCard(inst.cardId).type,
            }
        }
        return { actionPid: pid, actionSelf: src, actionTargetId, srcColors: undefined, srcType: undefined }
    }

    // extraItems（破壊で誘発した効果の列）を同じプールに混ぜる。
    // 混ぜることで「自身の『破壊時』→他カードの誘発→フィールドに残る」の順番を
    // ターンプレイヤーが1つずつ選べるようになる（docs/design/TIMING_CHART.md）
    type PoolItem =
        | { extra?: undefined; inst: CardInstance; effect: Extract<EffectDef, { kind: "fieldEvent" }> }
        | { extra: FieldEventExtraItem }
    const extras = extraItems ?? []
    const pool: PoolItem[] = [
        ...extras.filter((e) => e.first === true).map((extra) => ({ extra })),
        ...queue,
        ...extras.filter((e) => e.first !== true).map((extra) => ({ extra })),
    ]

    // 「〜が破壊されたとき」は、同じ列の「フィールドに残る」が先に解決して破壊が無かったことになれば発揮しない
    // （RESUME_STACK.md §7 ①。破壊されたカード自身の『破壊時』と同じガード）
    const destroyGuard =
        (event === "ownSpiritDestroyed" || event === "opponentSpiritDestroyed") && selfOverride?.inst.pendingDestruction === true
            ? selfOverride.inst.instanceId
            : undefined
    const handlers: Parameters<typeof resolveInOrder<PoolItem>>[2] = {
        // 集めたあとに場を離れた発生源は発火させない（先に解決した効果で破壊されうる）。
        // 仮想発生源はフィールドに実体が無いので在否を見ない
        skip: (e) =>
            (e.extra === undefined && !isVirtualSource(e.inst) && !isStillOnField(state, pid, e.inst.instanceId)) ||
            (e.extra === undefined && destroyGuard !== undefined && findInstanceAnywhere(state, destroyGuard)?.pendingDestruction !== true),
        resolve: (e) => {
            if (e.extra !== undefined) {
                resolveAction(state, e.extra.actorPid, e.extra.selfInstanceId ? findInstanceAnywhere(state, e.extra.selfInstanceId) ?? null : null, e.extra.action)
                return
            }
            if (e.effect.onceScope === "name" && !claimOnce(state, pid, e.inst, e.effect, "triggeredUsedTurn")) return
            const c = contextOf(e.inst, e.effect)
            // 「〜できる」（optional）は実対戦では発動可否を確認する（triggered/step/battleWonと同じ扱い。
            // interactiveTargets=false（テスト）では従来どおり常に発動する。BS08聖なる柱状彫刻Lv2）
            if (e.effect.optional && state.interactiveTargets) {
                requestActivationConfirm(
                    state,
                    c.actionPid,
                    activationPrompt(e.inst),
                    e.effect.action,
                    c.actionSelf,
                    // oncePerTurn／同時破壊グループの仮消費どちらも、断ったときにここで戻す
                    // （revertDestroyGroupUsageは対象キーが無ければ何もしないので常に渡してよい）
                    { instanceId: e.inst.instanceId, effectId: e.effect.id },
                    { targetInstanceId: c.actionTargetId, sourceColors: c.srcColors, sourceType: c.srcType },
                )
            } else {
                delete state.effectFizzled
                // 中の pay が確認で止まったとき、断った／不発で消費を戻せるよう渡す（triggered と同じ）
                const action = markPays(e.effect.action, { onceRevert: { instanceId: e.inst.instanceId, effectId: e.effect.id } })
                resolveAction(state, c.actionPid, c.actionSelf, action, c.actionTargetId, c.srcColors, c.srcType)
                // コストを払えないなどで何も起きなかったら、「ターンに1回」／同時破壊グループの消費を戻す（2026-09-16／fix/destroyed-trigger-once）
                if (state.effectFizzled) {
                    if (e.effect.oncePerTurn) revertOncePerTurn(state, e.inst, e.effect.id)
                    revertDestroyGroupUsage(state, e.inst.instanceId, e.effect.id)
                }
                delete state.effectFizzled
            }
        },
        frame: (e) => {
            if (e.extra !== undefined) {
                return {
                    kind: "action" as const,
                    selfInstanceId: e.extra.selfInstanceId,
                    action: e.extra.action,
                    actorPid: e.extra.actorPid,
                    ...(e.extra.requiresPendingDestructionOf !== undefined
                        ? { requiresPendingDestructionOf: e.extra.requiresPendingDestructionOf }
                        : {}),
                }
            }
            const c = contextOf(e.inst, e.effect)
            return {
                kind: "action" as const,
                selfInstanceId: c.actionSelf.instanceId,
                action: e.effect.onceScope === "name" ? markPays(e.effect.action, { onceRevert: { instanceId: e.inst.instanceId, effectId: e.effect.id } }) : e.effect.action,
                actorPid: c.actionPid,
                ...(e.effect.onceScope === "name" ? { onceClaim: { instanceId: e.inst.instanceId, effectId: e.effect.id } } : {}),
                ...(destroyGuard !== undefined ? { requiresPendingDestructionOf: destroyGuard } : {}),
                ...(c.actionTargetId !== undefined ? { targetInstanceId: c.actionTargetId } : {}),
                ...(c.srcColors !== undefined ? { sourceColors: c.srcColors } : {}),
                ...(c.srcType !== undefined ? { sourceType: c.srcType } : {}),
                ...confirmPromptIfOptional(state, e.inst, e.effect.optional),
            }
        },
        // 同時発揮の解決順はターンプレイヤーが決める（TIMING_CHART.md §0-3）
        askOrder: {
            pid: state.turnPlayer,
            label: (e) => (e.extra !== undefined ? e.extra.label : `${state.players[pid].name}の${getCard(e.inst.cardId).name}`),
            // ⚠️ **持ち主込みのカード単位**で見る。相手の同名ネクサスと混ざらないように pid を入れる
            // （step 版と同じ形。2026-09-08 に効果エントリ単位＋pid無しから直した）
            key: (e) => (e.extra !== undefined ? e.extra.key : `${pid}:${e.inst.cardId}`),
        },
    }
    if (collect !== undefined) {
        const ask = handlers.askOrder
        if (ask === undefined) return
        for (const e of pool) {
            collect.push({
                key: ask.key(e),
                label: ask.label(e),
                frame: handlers.frame(e),
                skip: () => handlers.skip?.(e) === true,
                run: () => handlers.resolve(e),
            })
        }
        return
    }
    resolveInOrder(state, pool, handlers)

    // バースト（docs/design/BURST.md）：effectSources() には入れないため、上のフィールド発生源の
    // 走査とは別に、ここで両プレイヤーのバーストエリアを見る。上の解決で選択待ちが残っている間は割り込まない。
    // skipBurst指定時（破壊待機中のownSpiritDestroyed走査）はここで判定しない（BS16バッチ0：呼び出し元が
    // トラッシュ行き確定後にfireQueuedDestroyBursts経由でfireBurstOnEventを直接呼ぶ）
    if (state.pendingChoice || skipBurst) return
    fireBurstOnEvent(
        state,
        pid,
        event,
        selfOverride ? { pid: selfOverride.pid, cardId: selfOverride.inst.cardId } : undefined,
        eventColors,
        targetInstanceId,
        eventInfo,
    )
}

// フィールドイベント誘発「持ち主から見て相手の手札にカードが加えられたとき」：
// 手札を得たプレイヤー(gainerPid)の相手側フィールドから発火する（犬人マードック／英雄の喪失）。
// ドロー・トラッシュ回収・deckReveal・バウンス（ネクサス／スピリット）・reviveOnDestroy の
// toHand など、初期手札配布を除く手札加入箇所すべてから呼ぶ。count省略時/0以下・勝敗確定後は何もしない
export function notifyHandGained(state: GameState, gainerPid: PlayerId, count: number): void {
    if (count < 1 || state.winner) return
    fireFieldEventTriggers(state, opponentOf(gainerPid), "opponentHandAdded", undefined, undefined, undefined, count)
}

// フィールドイベント誘発「自分のフィールドにネクサスが配置されたとき」（BS04栄光の表彰台Lv2）。
// 通常の配置（GameEngine.doSetNexus）・効果による配置（deployNexus）・破壊されたネクサスの復活の
// いずれからも呼ぶ。ネクサスを1つ置くたびに1回発火する（「配置されるたび」）
export function notifyNexusDeployed(state: GameState, ownerPid: PlayerId): void {
    if (state.winner) return
    fireFieldEventTriggers(state, ownerPid, "ownNexusDeployed")
    tryHandFreeSummonOnOwnNexusDeployed(state, ownerPid)
}

// 手札のカード自身が持つ「自分のネクサスが配置されたとき、コストを支払わずに召喚できる」
// （kind:"freeSummonFromHandOnOwnNexusDeployed"。BS14-060 ティンダロ・ハウンド）。
// tryHandFreeSummonOnLifeDamaged（removal.ts）と同型：実対戦では確認を出し、非対話では自動召喚する
export function tryHandFreeSummonOnOwnNexusDeployed(state: GameState, pid: PlayerId): void {
    if (state.pendingChoice || state.winner) return
    const player = state.players[pid]
    for (let i = 0; i < player.hand.length; i++) {
        const cardId = player.hand[i]
        if (cardId === undefined) continue
        if (zoneSpiritEffectsDisabled(state, cardId)) continue
        const effect = getCard(cardId).effects.find((e) => e.kind === "freeSummonFromHandOnOwnNexusDeployed")
        if (!effect) continue
        if (!canPayFreeSummonSurcharge(state, pid, getCard(cardId), minLevelCores(getCard(cardId)))) continue
        noteCoverage(effect, "freeSummonFromHandOnOwnNexusDeployed")
        if (state.interactiveTargets) {
            suspend(state, {
                pid,
                kind: "option",
                prompt: `${getCard(cardId).name}：手札からコストを支払わずに召喚しますか？`,
                candidates: [],
                options: ["召喚する"],
                optional: true,
                confirm: true,
                handFreeSummon: { pid, cardId },
                action: { type: "noop" },
                selfInstanceId: null,
            })
            return
        }
        summonFreeFromHandIndex(state, pid, getCard(cardId).name, i)
        return
    }
}

// ネクサスが「配置」されたときの発火をまとめたもの。通知は2種類あり別物:
//   ・fireSummonTrigger    … 置かれたネクサス自身の『このネクサスの配置時』（trigger:"onSummon"）
//   ・notifyNexusDeployed  … 他カードの「自分のフィールドにネクサスが配置されたとき」
// ⚠️ 2026-08-28 まで、前者を呼んでいたのは手札からの通常配置だけで、効果による配置
// （トラッシュから／コストを支払わずに／デッキ破棄から）では自身の『配置時』が黙って消えていた。
// 経路ごとに2行書くと同じ呼び忘れが再発するので、配置の経路はすべてこの1本を通す。
// **破壊されたネクサスの復活（destroy.ts）とスピリット化の解除（PhaseManager）は「配置」ではない**ので、
// ここは通さず notifyNexusDeployed だけを呼ぶ（2026-08-28 ユーザー判断）
export function fireNexusDeployed(state: GameState, ownerPid: PlayerId, inst: CardInstance, fromHand?: boolean): void {
    // ネクサスの『このネクサスの配置時』は `onDeploy`。スピリットの『召喚時』（onSummon）とは
    // **別のカテゴリ**なので分けている（SEMANTICS_AUDIT.md §3.17）。
    // `fireSummonTrigger` を通さないのは、そこで見ている noSummonTriggerByCost（コストの低い
    // **スピリット**の召喚時効果を止める）も resolvingSummonTriggerPid（「相手の**スピリット**の
    // 召喚時効果を受けない」）も、どちらもスピリット限定の規則だから
    // 器BS16：fromHand（手札から配置したときのみ発火する条件。effect.fromHandOnly）
    fireTrigger(state, ownerPid, inst, "onDeploy", undefined, undefined, undefined, undefined, fromHand === true)
    notifyNexusDeployed(state, ownerPid)
}
