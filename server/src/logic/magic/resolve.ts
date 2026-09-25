import type { CardData, CardInstance, PendingChoice, EffectDef, GameState, PlayerId } from "../../type"
import { currentLevel, findInstanceAnywhere, getCard, log, opponentOf, pushResumeFrames, suspend } from "../GameState"
import { isSelfInBattle, magicEffectiveColors } from "../../../../shared/cost"
import { magicConditionFailure } from "../../../../shared/magicCondition"
import { effectActiveAtLevel, effectSources } from "../../../../shared/rules"
import { resolveAction } from "../EffectModules"
import { fireFieldEventTriggers } from "../triggers"
import { setTargetRedirect } from "./redirect"
import type { ActionHandler } from "../actions/types"
import { resolveMagic } from "./cast"

// マジックの効果本体の解決。resolveMagic から（無効化されなかったときに）呼ぶ。
// usedMagicCardIds への記録と emitEvent は resolveMagic 側で済ませてあるので、ここでは行わない
export function resolveMagicEffects(
    state: GameState,
    owner: PlayerId,
    cardId: string,
    timing: "main" | "flash",
    targetInstanceId?: string,
    paidCost = true,
): void {
    // BS07大天使イスフィール：使用者のフィールドに magicRepeatGrant が有効な発生源があれば、
    // 効果の並びをもう1周する。判定は1周目を始める前に固定する（1周目の結果で発生源が場を離れても
    // 「発揮後にもう1度」は約束どおり行う）
    const repeatSource = findMagicRepeatGrantSource(state, owner)
    runMagicActions(state, owner, cardId, timing, targetInstanceId)
    // 選択待ちで中断したときは、残りの効果を pendingChoice の queue が引き継いでいるのでここで抜ける
    if (state.pendingChoice) return
    if (repeatSource && !state.winner) {
        // 「もう1度だけ発揮**できる**」＝任意なので、1周目が解決しきってから聞く（2026-08-15 ユーザー確認）。
        // 非対話（テスト・自動解決）では従来どおり自動で2周目を走らせる
        if (state.interactiveTargets) {
            suspend(state, {
                pid: owner,
                kind: "option",
                prompt: `${getCard(repeatSource.cardId).name}：${getCard(cardId).name}の効果をもう1度発揮しますか？`,
                candidates: [],
                options: MAGIC_REPEAT_OPTIONS,
                optional: false,
                magicRepeat: {
                    casterPid: owner,
                    cardId,
                    timing,
                    targetInstanceId,
                    sourceInstanceId: repeatSource.instanceId,
                    paidCost,
                },
                action: { type: "noop" },
                selfInstanceId: repeatSource.instanceId,
            })
            return
        }
        consumeMagicRepeatGrant(state, repeatSource)
        log(state, `${getCard(cardId).name}の効果をもう1度発揮する。`)
        runMagicActions(state, owner, cardId, timing, targetInstanceId)
        if (state.pendingChoice) return
    }
    fireMagicUsedTriggers(state, owner, getCard(cardId), timing, paidCost)
}

// 使用者pidのフィールドにある、kind:"magicRepeatGrant" の有効な発生源を返す（BS07大天使イスフィール）。
// **消費（oncePerBattle の記録）はここでは行わない**：再発揮は「もう1度発揮**できる**」＝任意で、
// 発揮しないことを選んだときは枠を使っていないので残す（2026-08-15 ユーザー確認）。
// 消費は実際に2周目を走らせる直前に consumeMagicRepeatGrant で行う
// （無償化側とは消費点が違うのでリストを分けている＝BattleState のコメント参照）
export function findMagicRepeatGrantSource(state: GameState, pid: PlayerId): CardInstance | null {
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicRepeatGrant") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.condition === "selfInBattle" && !isSelfInBattle(state, source.instanceId)) continue
            if (effect.oncePerBattle) {
                if (!state.battle) continue // バトル外では消費を記録できないので成立させない
                if ((state.battle.oncePerBattleMagicRepeatUsed ?? []).includes(source.instanceId)) continue
            }
            return source
        }
    }
    return null
}

// 上で見つけた発生源を「このバトルで使い切った」として記録する（oncePerBattle のときだけ）
export function consumeMagicRepeatGrant(state: GameState, source: CardInstance): void {
    const oncePerBattle = getCard(source.cardId).effects.some(
        (e) => e.kind === "magicRepeatGrant" && e.oncePerBattle,
    )
    if (!oncePerBattle || !state.battle) return
    const used = (state.battle.oncePerBattleMagicRepeatUsed ??= [])
    if (!used.includes(source.instanceId)) used.push(source.instanceId)
}

// 再発揮の確認の選択肢。**この並び順に GameEngine.doResolveChoice が依存する**（0=発揮する / 1=しない）
export const MAGIC_REPEAT_OPTIONS = ["もう1度発揮する", "発揮しない"]

// pendingChoice（再発揮の確認）の後処理。GameEngine.doResolveChoice から呼ぶ
export function applyMagicRepeatChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicRepeat"]>,
    again: boolean,
): void {
    const card = getCard(info.cardId)
    if (again) {
        const source = findInstanceAnywhere(state, info.sourceInstanceId)
        if (source) consumeMagicRepeatGrant(state, source)
        log(state, `${card.name}の効果をもう1度発揮する。`)
        runMagicActions(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId)
        if (state.pendingChoice) return
        if (state.winner) return
    } else {
        log(state, `${card.name}の効果をもう1度は発揮しなかった。`)
    }
    fireMagicUsedTriggers(state, info.casterPid, card, info.timing, info.paidCost)
}

// マジックの効果エントリを1周ぶん解決する。resolveMagicEffects が1〜2回呼ぶ
// （「マジックの効果を使用したとき」の誘発は呼び出し側が最後に1回だけ発火させる）
export function runMagicActions(
    state: GameState,
    owner: PlayerId,
    cardId: string,
    timing: "main" | "flash",
    targetInstanceId?: string,
): void {
    const card = getCard(cardId)
    const matches = (effect: EffectDef): effect is Extract<EffectDef, { kind: "magic" }> =>
        effect.kind === "magic" && effect.timing === timing
    const effects = card.effects
    for (let i = 0; i < effects.length; i++) {
        const effect = effects[i]
        if (!effect || !matches(effect)) continue
        // 使用条件（手札以外から使う経路もあるので、解決の時点でも見る）と、解決時の条件
        const failure = [effect.useCondition, effect.condition].map((c) => (c ? magicConditionFailure(state, owner, c) : null)).find((f) => f !== null)
        if (failure) {
            log(state, `${card.name}：${failure}ため発動しなかった。`)
            continue
        }
        // 「(この効果はターンに1回しか使えない)」＝使用者ごと・cardIdごとにそのターン1回だけ発揮する。
        // 判定はエントリ単位（同じカードの他の timing のエントリには影響させない）。
        // 2枚目は使用自体はできる（コストは払う）が、このエントリの効果だけが発揮されない（BS03-133 ハイエリクサー）
        if (effect.oncePerTurn) {
            const usedTurn = state.players[owner].magicOncePerTurnUsed?.[cardId]
            if (usedTurn === state.turn) {
                log(state, `${card.name}：この効果はターンに1回しか使えないため、発揮されなかった。`)
                continue
            }
            ;(state.players[owner].magicOncePerTurnUsed ??= {})[cardId] = state.turn
        }
        // アルカナソルジャー・サンクLv2：相手が使用したマジックがサンクを対象に含むとき、
        // このアクションの対象をサンクのみに絞る（＝同じ持ち主の他のスピリットは効果を受けない）
        setTargetRedirect(state, owner, targetInstanceId, effect.action)
        // self が null（マジック）のため、装甲・マジック効果耐性判定用のカード色／種別／カードIDを明示的に渡す
        // （sourceCardId: lendSelfThisTurnが仮想発生源を作るのに使う。TURN_EFFECT_SOURCES.md §3.3）。
        // 色は magicEffectiveColors を通す（BS15-015吸血令嬢エサルフリーダ Lv1-3。BS15_PLAN.md §7.3）
        resolveAction(
            state,
            owner,
            null,
            effect.action,
            targetInstanceId,
            magicEffectiveColors(state, owner, card),
            "magic",
            undefined,
            undefined,
            card.cardId,
        )
        if (state.pendingChoice) {
            const remaining = effects.slice(i + 1).filter(matches)
            pushResumeFrames(
                state,
                remaining.map((e) => ({ kind: "action" as const, selfInstanceId: null, action: e.action })),
            )
            // 選択待ちで抜けるときも絞り込みは持ち越さない（選択の解決は別のアクションとして走る）
            delete state.magicRedirectTo
            return
        }
    }
    // 対象の絞り込みはこのマジックの解決中だけ有効（誘発効果には及ぼさない）
    delete state.magicRedirectTo
}

// 「マジックの効果を使用したとき」の誘発（使用者側・相手側）。
// **効果が無効にされた場合もここは通す**（使用宣言とコストの支払いは済んでいるため）
export function fireMagicUsedTriggers(
    state: GameState,
    owner: PlayerId,
    card: CardData,
    timing: "main" | "flash",
    paidCost: boolean,
): void {
    // フィールドイベント誘発「自分がマジックの効果を使用したとき」：使用者側のフィールドから発火
    // （opponentDrewの実装を踏襲。緑芽吹く原野）。paidCost はBS11-X05のpaidCostOnly判定用
    if (!state.winner) {
        fireFieldEventTriggers(state, owner, "ownMagicUsed", undefined, undefined, undefined, undefined, { paidCost })
    }
    // 「相手がマジックの効果を使用したとき」：使用者の相手側のフィールドから発火する（氷の女神フリッグ）。
    // コスト（軽減前の素のコスト）と使用タイミングを eventInfo で渡し、fieldEvent 側で絞り込む
    if (!state.winner) {
        fireFieldEventTriggers(
            state,
            opponentOf(owner),
            "opponentMagicUsed",
            undefined,
            undefined,
            undefined,
            undefined,
            { magicCost: card.cost, magicTiming: timing },
        )
    }
}

// このフラッシュタイミングで相手が直前に使用したマジックの効果を、自分が使用したものとして
// もう一度だけ発揮する（BS08マジックミラー）。[マジックミラー]自身は対象にできない
export const magicMirrorRepeatHandler: ActionHandler<"magicMirrorRepeat"> = (ctx, _action) => {
    const { state, owner, sourceName } = ctx
        const last = state.lastMagicCast
        if (!last || last.pid === owner) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        const lastCard = getCard(last.cardId)
        if (lastCard.name === "マジックミラー") {
            log(state, `${sourceName}：[マジックミラー]自身は対象にできない。`)
            return
        }
        log(state, `${sourceName}：${lastCard.name}の効果をもう一度発揮する。`)
        state.lastMagicCast = {
            pid: owner,
            cardId: last.cardId,
            timing: last.timing,
            ...(last.targetInstanceId !== undefined ? { targetInstanceId: last.targetInstanceId } : {}),
        }
        // 使用者は「コストを支払って」いない＝BS11-X05のpaidCostOnlyから連鎖しない
        resolveMagic(state, owner, last.cardId, last.timing, last.targetInstanceId, false)
}
