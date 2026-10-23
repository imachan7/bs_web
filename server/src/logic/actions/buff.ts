// BP修正系のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, ResolvedTargetFilter } from "../../type"
import { currentLevel, getCard, log } from "../GameState"
import { lastTargetsOf, recordTargets } from "../record"
import {
    applyMagicBuffBonus,
    bpBuffTargetPasses,
    countEffectCounter,
    effectActiveAtLevel,
    effectiveBp,
    exhaustSpirit,
    instHasColor,
    instanceSymbolCount,
    matchesFamilyFilter,
    findSpiritAny,
    pickAnySideByBp,
    pickAnySideCandidates,
    pickBpBuffTarget,
    ownBpBuffCandidates,
    pickEnemyByBp,
    pickEnemyCandidates,
    askPayToNegateIfNeeded,
    resistanceAgainst,
    refreshSpirit,
    requestCardChoice,
    requestChoice,
    spiritHasFamily,
    tryInteractiveTargetChoice,
    spiritHasKeyword,
    returnSpiritToHand,
    recordBp,
    recordTimed,
} from "../EffectModules"
import { hasGlobalConstraint, instFamilies, instIsCombined, isBpBuffSuppressed, matchesTarget } from "../../../../shared/rules"
import { COLOR_LABELS } from "../../../../data/constants"
import { attemptOf, normalizeFilter, SELF_REQUIRED } from "./filter"
import { fieldOrReserveCores, payCoresFromFieldOrReserveToTrash } from "./cores"
import { countedAmount } from "../counted"


// スリーカード：対象スピリット1体に「このターンの間、使用者の効果では count 体分として数える」印を付ける。
// 対象未指定時は実効BP最大の1体（自動選択の簡略化。anySide 指定時は自分/相手どちらからも選ぶ）
const countAsMultipleThisTurnHandler: ActionHandler<"countAsMultipleThisTurn"> = (ctx, action) => {
    const { state, owner, opp, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const found = targetInstanceId
        ? findSpiritAny(state, targetInstanceId)
        : action.anySide
          ? pickAnySideByBp(state, owner, Infinity, () => true, srcColors, srcType)
          : (() => {
                const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType)
                return t ? { pid: opp, inst: t } : null
            })()
    if (!found) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    // sourceTypes（数える側の発生源種別の限定。スリーカード＝スピリット/ネクサスの効果のみ）は印へそのまま写す
    recordTimed(state, {
        content: [{ type: "countAs", count: action.count, ...(action.sourceTypes ? { sourceTypes: action.sourceTypes } : {}) }],
        target: { kind: "instance", instanceId: found.inst.instanceId },
        until: "turn",
        ownerPid: owner,
    })
    log(
        state,
        `${sourceName}：このターンの間、${getCard(found.inst.cardId).name}は${state.players[owner].name}の効果で${action.count}体分として数えられる。`,
    )
}

const colorlessSelfThisBattle: ActionHandler<"colorlessSelfThisBattle"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
        if (!self) return
        recordTimed(state, { content: [{ type: "colorless" }], target: { kind: "instance", instanceId: self.instanceId }, until: "battle", ownerPid: owner })
        log(state, `${getCard(self.cardId).name}は、このバトルの間色を無いものとして扱う。`)
        return
}

const bpBuff: ActionHandler<"bpBuff"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 器：costMillSelfCount指定時は自分のデッキを上からこの枚数だけ破棄することがコスト
        // （対象は常にself固定「このスピリットをBP+」）。一般則（COST_MODEL.md §1）どおり、
        // デッキがこの枚数未満なら払わず発揮もしない（2026-09-26修正：以前はあるだけ破棄して成立させていた）。
        // thenRefreshIfMilledFamily指定時は、破棄した中に指定系統のスピリットカードが
        // 1枚以上あればselfを回復させる（BS13-060トレス・ベルーガ【合体時】：「自分のデッキを上から6枚破棄する
        // ことで、このスピリットをBP+6000する。この効果で自分のトラッシュに系統：「光導」を持つスピリットカードが
        // 1枚以上置かれたとき、このスピリットは回復する」）
        if (action.costMillSelfCount !== undefined) {
            if (!self) {
                log(state, `${sourceName}：発揮する対象がいなかった。`)
                return
            }
            const player = state.players[owner]
            const n = action.costMillSelfCount
            if (player.deck.length < n || hasGlobalConstraint(state, "noDeckMill")) {
                log(state, `${sourceName}：デッキが足りないため発動しなかった。`)
                return
            }
            const milledIds: string[] = []
            for (let i = 0; i < n; i++) {
                const cardId = player.deck.shift()!
                player.trashCards.push(cardId)
                milledIds.push(cardId)
            }
            log(state, `${player.name}はデッキを上から${n}枚破棄した。`)
            recordBp(state, owner, self, action.amount, action.scope === "battle" ? "battle" : "turn")
            log(
                state,
                `${getCard(self.cardId).name}はBP+${action.amount}（${action.scope === "battle" ? "このバトルの間" : "ターン終了時まで"}）。`,
            )
            applyMagicBuffBonus(state, self, srcType, srcColors)
            if (action.thenRefreshIfMilledFamily !== undefined) {
                const wanted = Array.isArray(action.thenRefreshIfMilledFamily)
                    ? action.thenRefreshIfMilledFamily
                    : [action.thenRefreshIfMilledFamily]
                const matched = milledIds.some((cid) => {
                    const c = getCard(cid)
                    return c.type === "spirit" && c.family.some((f) => wanted.includes(f))
                })
                if (matched) {
                    refreshSpirit(state, owner, self)
                    log(state, `${getCard(self.cardId).name}は回復した。`)
                }
            }
            return
        }
        // extraPerCoreToTrash の第2段（コア数を選び終わって戻ってきた経路）。
        // boostTargetInstanceId が入っている＝amount の適用は済んでいるので、追加ぶんだけ乗せる
        if (action.boostTargetInstanceId !== undefined) {
            const boostTarget = findSpiritAny(state, action.boostTargetInstanceId)
            const paid = Number(chosenOption ?? "0")
            if (!boostTarget || !Number.isFinite(paid) || paid <= 0) return
            const placed = payCoresFromFieldOrReserveToTrash(state, owner, paid)
            if (placed <= 0) return
            const extra = placed * (action.extraPerCoreToTrash ?? 0)
            // 支払いで対象自身が消滅していることがある（コアを対象の上から取った場合）。その場合は加算しない
            const stillThere = findSpiritAny(state, action.boostTargetInstanceId)
            log(state, `${sourceName}：コア${placed}個を${state.players[owner].name}のトラッシュに置いた。`)
            if (!stillThere) return
            recordBp(state, owner, stillThere.inst, extra, action.scope === "battle" ? "battle" : "turn")
            log(state, `${getCard(stillThere.inst.cardId).name}はさらにBP+${extra}。`)
            return
        }
        // target:"self"＝「このスピリットをBP+」。自動選択に任せず発生源自身に固定する
        if (action.target === "self") {
            delete state.lastBpBuffTargetId
            if (!self) {
                log(state, `${sourceName}：発揮する対象がいなかった。`)
                return
            }
            // 「◯1体につき」（amountCounter）も自身への BP+ で効かせる（【増幅】・ネクサス数など）
            const selfAmount =
                action.amountCounter !== undefined
                    ? countedAmount(state, owner, self, action.amount, action.amountCounter, srcType, undefined, self)
                    : action.amount
            if (action.amountCounter !== undefined && selfAmount === 0) {
                log(state, `${sourceName}のBP増加：カウントが0のため増加しなかった。`)
                return
            }
            recordBp(state, owner, self, selfAmount, action.scope === "battle" ? "battle" : "turn")
            log(state, `${getCard(self.cardId).name}はBP+${selfAmount}（${action.scope === "battle" ? "このバトルの間" : "ターン終了時まで"}）。`)
            if (action.thenAddSymbolThisBattle) {
                const { color, count } = action.thenAddSymbolThisBattle
                if (!self.battleSymbolsAdded) self.battleSymbolsAdded = []
                for (let i = 0; i < count; i++) self.battleSymbolsAdded.push(color)
                log(state, `${getCard(self.cardId).name}は${COLOR_LABELS[color]}のシンボルを${count}つ追加した（このバトルの間）。`)
            }
            applyMagicBuffBonus(state, self, srcType, srcColors)
            return
        }
        // 「そのスピリットが」の控えは**このBP増加の結果**でなければならない。
        // 対象がいなくて不発だったときに前のカードの控えが残らないよう、入口で消す
        delete state.lastBpBuffTargetId
        // anySide（SD02ストロングドロー／BS01ダークコフィンのフラッシュ＝陣営を書いていない「スピリット1体をBP+」）：
        // 自分/相手どちらのスピリットも対象にできる。クライアントは anySide のマジックの対象を先取りしない
        // （renderer.ts の magicTargetSide が null を返す）ので、ここで両陣営から選ばせる。
        // 非対話（smoke）では従来どおり pickBpBuffTarget の自動選択＝自分の場から選ぶ
        // （BP増加は自分に使うのが自然なため。テストの決定性のための簡略化）
        if (targetInstanceId === undefined && action.anySide && state.interactiveTargets) {
            const candidates = pickAnySideCandidates(
                state,
                owner,
                (s) =>
                    bpBuffTargetPasses(
                        state,
                        owner,
                        s,
                        action.filter?.minSymbols,
                        action.filter?.keyword,
                        action.filter?.nameContains,
                        action.filter?.attackingOnly,
                        action.filter?.family,
                        action.filter?.combined,
                        action.filter?.vanilla,
                        action.filter?.cost,
                        action.filter?.team,
                        action.filter?.shinkaiho,
                    ),
                srcColors,
                srcType,
            )
            if (candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：BPを増加するスピリットを選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 自分のスピリットを選ぶ文面（誘発・起動）：候補が2体以上なら選ばせる。
        // lastTarget／lastBpBuffTarget 付きは対象が1体に決まるので選択しない
        // 1体の経路は下の個別の軸しか見ないので、色などそれ以外の軸も matchesTarget で重ねて見る（以前は色が素通りしていた）
        const full = normalizeFilter(ctx, action)
        const fullOk = (s: CardInstance): boolean => full !== SELF_REQUIRED && matchesTarget(state, owner, s, full, self?.instanceId)
        if (targetInstanceId === undefined && !action.anySide && state.interactiveTargets && !action.filter?.lastTarget && !action.filter?.lastBpBuffTarget) {
            const f = action.filter
            const candidates = ownBpBuffCandidates(state, owner, f?.minSymbols, f?.keyword, f?.nameContains, f?.attackingOnly, f?.family, f?.combined, f?.vanilla, f?.cost, f?.team, f?.shinkaiho).filter(fullOk)
            if (candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：BPを増加するスピリットを選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    action,
                    self,
                )
                return
            }
        }
        // 対象1体の経路は matchesTarget を通らないため、この経路が扱える軸を filter から取り出して渡す
        // （minSymbols＝ライトニングバリスタ等／nameContains＝BS07ウィリアンスラッシュ「勇者」／
        //   keyword・attackingOnly＝BS07桜の妖精オウカ「アタックしている【聖命】持ち」／
        //   family＝BS07ニードルショット「系統：剣獣」／cost＝26系水流「コスト8以上の海緑」）
        const target = pickBpBuffTarget(
            state,
            owner,
            targetInstanceId ?? (action.filter?.lastTarget ? lastTargetsOf(state)[0] ?? "" : undefined),
            fullOk,
            action.filter?.minSymbols,
            action.filter?.keyword,
            action.filter?.nameContains,
            action.filter?.attackingOnly,
            action.filter?.family,
            action.filter?.combined,
            action.filter?.vanilla,
            action.filter?.cost,
            action.filter?.team,
            action.filter?.shinkaiho,
        )
        if (!target) {
            log(state, `${sourceName}のBP増加：対象がいなかった。`)
            return
        }
        // 「〜をBP+2000する。**そのスピリットが**〜」と後ろの文が前の文を指すカード用に、
        // 増加させた対象を控えておく（直後の lendSelfThisBattle が仮想発生源へ写す。BS07ニードルショット）
        state.lastBpBuffTargetId = target.instanceId
        // scope:"battle"（BS07ニードルショット「このバトルの間」）だけ積む先と寿命が変わる。
        // 既定（無指定）は従来どおりターン終了時まで
        const battleScope = action.scope === "battle"
        const addBuff = (inst: typeof target, amount: number): void => recordBp(state, owner, inst, amount, battleScope ? "battle" : "turn")
        const untilLabel = battleScope ? "このバトルの間" : "ターン終了時まで"
        // amountFromSelfBp（BS08機人フィアラル）：amountを無視し、発生源自身の実効BPを加算量として使う
        if (action.amountFromSelfBp) {
            if (!self) {
                log(state, `${sourceName}のBP増加：発生源がいなかった。`)
                return
            }
            const amount = effectiveBp(state, owner, self)
            addBuff(target, amount)
            log(
                state,
                `${getCard(target.cardId).name}はBP+${amount}（${untilLabel}）。`,
            )
            applyMagicBuffBonus(state, target, srcType, srcColors)
            return
        }
        const amount =
            action.amountCounter !== undefined
                ? countedAmount(state, owner, self, action.amount, action.amountCounter, srcType, undefined, target)
                : action.amountIfTarget && matchesTarget(state, owner, target, action.amountIfTarget.filter as unknown as ResolvedTargetFilter, self?.instanceId)
                  ? action.amountIfTarget.amount
                  : action.amount
        if (action.amountCounter !== undefined && amount === 0) {
            log(state, `${sourceName}のBP増加：カウントが0のため増加しなかった。`)
            return
        }
        addBuff(target, amount)
        log(
            state,
            `${getCard(target.cardId).name}はBP+${amount}（${untilLabel}）。`,
        )
        applyMagicBuffBonus(state, target, srcType, srcColors)
        // thenAddSymbolThisBattle（BS13-062光り輝く大銀河Lv2）：BP増加に続けて、このバトルの間だけ
        // 指定色のシンボルを対象へ追加する（CardInstance.battleSymbolsAdded。clearBattleでリセット）
        if (action.thenAddSymbolThisBattle) {
            const { color, count } = action.thenAddSymbolThisBattle
            if (!target.battleSymbolsAdded) target.battleSymbolsAdded = []
            for (let i = 0; i < count; i++) target.battleSymbolsAdded.push(color)
            log(state, `${getCard(target.cardId).name}は${COLOR_LABELS[color]}のシンボルを${count}つ追加した（このバトルの間）。`)
        }
        // extraPerCoreToTrash（BS10-103グロウイングソード）：「さらに、自分のフィールド/リザーブのコアを
        // 自分のトラッシュに好きなだけ置くことで、置いたコア1個につき、そのスピリットをBP+1000する」。
        // 対話時は0〜払える総量の増減式（stepper）で選ばせる。非対話（テスト・AI）は0個に倒す
        // ＝リザーブを勝手に捨てないための決定的簡略化
        if (action.extraPerCoreToTrash !== undefined && state.interactiveTargets) {
            const max = fieldOrReserveCores(state, owner)
            if (max > 0) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：トラッシュに置くコアの数を選んでください（1個につきBP+${action.extraPerCoreToTrash}）`,
                    [],
                    true,
                    { ...action, boostTargetInstanceId: target.instanceId },
                    self,
                    "option",
                    Array.from({ length: max + 1 }, (_, i) => String(i)),
                    undefined,
                    true,
                )
            }
        }
        return
}

// BS08スナイピングブラスト：自分のスピリットすべてを、それぞれが持つ【暴風】の実効指定数×amountPerだけBP+
// （bpBuffAllByArmorColorsの暴風版。暴風を持たない個体は対象外）

// bpBuffAll（26系Re覚醒）：指定系統（familyFilter省略時は系統不問）を持つ自分のスピリットすべてを
// ターン終了時までBP+Nする（「このターン中、系統：「紅雲」を持つ自分のスピリットすべてをBP+1000する」）
const bpBuffAll: ActionHandler<"bpBuffAll"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const targets = state.players[owner].field.spirits.filter(
        (s) => (action.familyFilter === undefined || matchesFamilyFilter(state, owner, s, action.familyFilter)) && (action.teamFilter === undefined || (getCard(s.cardId).team ?? []).includes(action.teamFilter)),
    )
    if (targets.length === 0) {
        log(state, `${sourceName}のBP増加：対象がいなかった。`)
        return
    }
    for (const s of targets) recordBp(state, owner, s, action.amount, "turn")
    log(state, `${sourceName}：${targets.map((s) => getCard(s.cardId).name).join("、")}をBP+${action.amount}（ターン終了時まで）。`)
}

// 26系「相手のスピリット1体を指定する。このターン中、それをBP-2000する」。
// 非対話の自動選択は、この効果でBP0以下になる中で実効BP最大（続く「BP0なら破壊」を活かす）、いなければ実効BP最大
const bpMinus: ActionHandler<"bpMinus"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    delete state.lastBpBuffTargetId
    // 絞り込み（filter.lastTarget＝designate で指定した個体）を先に解いてから控えを空にする
    const filter = normalizeFilter(ctx, action)
    // 複数体のとき「それらがBP0なら」が読む控え。count 回の再帰の初回で空に戻し、BP-できた個体を足していく
    if (action.excludeIds === undefined) recordTargets(state, [])
    if (filter === SELF_REQUIRED) return
    const amount = action.amount + (action.per ? countEffectCounter(state, owner, self, action.per.counter, srcType) * action.per.amount : 0)
    if (action.all) {
        const hit = state.players[opp].field.spirits.filter((s) => matchesTarget(state, opp, s, filter, self?.instanceId))
        for (const t of hit) {
            const resisted = resistanceAgainst(state, opp, t, attemptOf(ctx, "other", "area"))
            if (resisted) {
                log(state, `${getCard(t.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
                continue
            }
            recordTargets(state, [...lastTargetsOf(state), t.instanceId])
            recordBp(state, opp, t, -amount, action.scope === "battle" ? "battle" : "turn")
            log(state, `${sourceName}：${getCard(t.cardId).name}はBP-${amount}（${action.scope === "battle" ? "このバトルの間" : "ターン終了時まで"}）。`)
        }
        return
    }
    const excluded = action.excludeIds ?? []
    const list = pickEnemyCandidates(state, opp, Infinity, (s) => !excluded.includes(s.instanceId) && matchesTarget(state, opp, s, filter, self?.instanceId), srcColors, srcType)
    // count 体を1体ずつ、選んだ個体を除いて繰り返す（exhaust と同じ形）
    const next = (t: CardInstance): void => {
        const { chosenByPlayer: _c, ...rest } = action
        if ((action.count ?? 1) > 1) ctx.resolve({ ...rest, count: action.count! - 1, excludeIds: [...excluded, t.instanceId] }, { sourceColors: srcColors, sourceType: srcType })
    }
    let target = action.chosenByPlayer && targetInstanceId !== undefined ? list.find((s) => s.instanceId === targetInstanceId) : undefined
    if (target === undefined) {
        if (list.length === 0) {
            log(state, `${sourceName}のBP-：対象がいなかった。`)
            return
        }
        if (tryInteractiveTargetChoice(state, owner, self, `${sourceName}：BP-${amount}する相手のスピリットを選んでください`, list, { ...action, chosenByPlayer: true }, null)) return
        const bp = (s: CardInstance): number => effectiveBp(state, opp, s)
        const lethal = list.filter((s) => bp(s) <= amount)
        target = (lethal.length > 0 ? lethal : list).reduce((best, s) => (bp(s) > bp(best) ? s : best))
    }
    const attempt = attemptOf(ctx, "other", "targeted")
    if (askPayToNegateIfNeeded(state, opp, target, attempt, action, self, sourceName)) return
    const resisted = resistanceAgainst(state, opp, target, attempt)
    if (resisted) {
        log(state, `${getCard(target.cardId).name}は${sourceName}の効果を受けなかった（${resisted.label}）。`)
        next(target)
        return
    }
    state.lastBpBuffTargetId = target.instanceId
    recordTargets(state, [...lastTargetsOf(state), target.instanceId])
    recordBp(state, opp, target, -amount, action.scope === "battle" ? "battle" : "turn")
    log(state, `${sourceName}：${getCard(target.cardId).name}はBP-${amount}（${action.scope === "battle" ? "このバトルの間" : "ターン終了時まで"}）。`)
    next(target)
}

const handlers = {
    countAsMultipleThisTurn: countAsMultipleThisTurnHandler,
    colorlessSelfThisBattle,
    bpBuff,
    bpBuffAll,
    bpMinus,
} satisfies Partial<ActionRegistry>

// 古代闘技場Lv1（kind:"bpBuffSuppression"）：相手の「BPを+する」効果は発揮されない。
// BP増加アクションはこのモジュールに集約されているため、**レジストリを1箇所で包んで**ゲートする
// （8ハンドラそれぞれに早期returnを撒くと、将来アクションを足したときに素通りする）。
// BPを-する効果は抑止の対象外のため、amount/amountPer が負のものは通す
function isBpDecrease(action: { amount?: number; amountPer?: number }): boolean {
    const amount = action.amount ?? action.amountPer
    return typeof amount === "number" && amount < 0
}

type AnyBuffHandler = (ctx: ActionCtx, action: { amount?: number; amountPer?: number }) => void

const suppressed = Object.fromEntries(
    Object.entries(handlers).map(([type, handler]) => [
        type,
        ((ctx, action) => {
            if (!isBpDecrease(action) && isBpBuffSuppressed(ctx.state, ctx.owner)) {
                log(ctx.state, `${ctx.sourceName}：「BPを+する」効果は発揮されなかった。`)
                return
            }
            ;(handler as AnyBuffHandler)(ctx, action)
        }) as AnyBuffHandler,
    ]),
) as unknown as typeof handlers

export default suppressed
