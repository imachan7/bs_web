import type { CardData, CardInstance, PendingChoice, EffectDef, GameState, PlayerId } from "../../type"
import { currentLevel, findInstanceAnywhere, getCard, log, opponentOf, pushResumeFrames, suspend } from "../GameState"
import { isSelfInBattle, magicEffectiveColors, ownFieldSymbolColors } from "../../../../shared/cost"
import { countSpiritsWeighted, effectActiveAtLevel, effectSources, instanceSymbolCount, instHasColor, spiritHasFamily, opponentFieldColorCount } from "../../../../shared/rules"
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
        if (effect.condition) {
            if ("ownFamilyCountAtLeast" in effect.condition) {
                // デルタクラッシュ：指定系統を持つ自分のスピリットがcount体以上のときのみ実行
                const { family, count } = effect.condition.ownFamilyCountAtLeast
                const total = countSpiritsWeighted(
                    state,
                    owner,
                    owner,
                    (s) => spiritHasFamily(state, owner, s, family),
                    "magic", // ここはマジックの使用条件なので発生源は常にマジック
                )
                if (total < count) {
                    log(
                        state,
                        `${card.name}：系統「${family}」を持つスピリットが${count}体未満のため発動しなかった。`,
                    )
                    continue
                }
            } else if ("ownFieldHasMinSymbolSpirit" in effect.condition) {
                // ライトニングバリスタ等：自分のフィールドにシンボル数がこれ以上のスピリットが
                // 1体もいなければ実行しない（BS04エンジン拡張バッチ1）
                const minSymbols = effect.condition.ownFieldHasMinSymbolSpirit
                const has = state.players[owner].field.spirits.some(
                    (s) => instanceSymbolCount(s) >= minSymbols,
                )
                if (!has) {
                    log(
                        state,
                        `${card.name}：シンボル${minSymbols}個以上を持つスピリットがいないため発動しなかった。`,
                    )
                    continue
                }
            } else if ("ownSpiritIsBlocking" in effect.condition) {
                // BS07アームズインパクト：自分のスピリットが現在のバトルでブロッカーのときだけ使える
                const blockerId = state.battle?.blockerInstanceId
                const blocking =
                    blockerId !== undefined &&
                    blockerId !== null &&
                    state.players[owner].field.spirits.some((s) => s.instanceId === blockerId)
                if (!blocking) {
                    log(state, `${card.name}：自分のスピリットがブロックしていないため発動しなかった。`)
                    continue
                }
            } else if ("bothFieldsHaveNexus" in effect.condition) {
                // クロスファイア：どちらのフィールドにもネクサスが1つ以上ないと使用できない
                const bothHave =
                    state.players.p1.field.nexuses.length > 0 &&
                    state.players.p2.field.nexuses.length > 0
                if (!bothHave) {
                    log(
                        state,
                        `${card.name}：どちらかのフィールドにネクサスがないため発動しなかった。`,
                    )
                    continue
                }
            } else if ("ownSpiritCountAtLeast" in effect.condition) {
                // BS08ジャッジメントフレア：自分のフィールドのスピリット数がこれ以上ないと使用できない
                const minCount = effect.condition.ownSpiritCountAtLeast
                if (state.players[owner].field.spirits.length < minCount) {
                    log(
                        state,
                        `${card.name}：自分のスピリットが${minCount}体未満のため発動しなかった。`,
                    )
                    continue
                }
            } else if ("ownFieldHasColorSpirits" in effect.condition) {
                // BS09-072シャドウブレイド：指定した色のスピリットが**それぞれ**1体以上いないと使用できない
                // （1体が多色で複数の色を満たしてもよい）
                const wanted = effect.condition.ownFieldHasColorSpirits
                const spirits = state.players[owner].field.spirits
                if (!wanted.every((c) => spirits.some((s) => instHasColor(s, c)))) {
                    log(state, `${card.name}：必要な色のスピリットがそろっていないため発動しなかった。`)
                    continue
                }
            } else if ("ownFieldHasAllNames" in effect.condition) {
                // BS08ロイヤルストレートフラッシュ：指定したカード名すべてが自分のフィールドに
                // 1体ずつ揃っていないと使用できない（cardIdではなく名前の完全一致で判定）
                const names = effect.condition.ownFieldHasAllNames
                const ownNames = new Set(
                    state.players[owner].field.spirits.map((s) => getCard(s.cardId).name),
                )
                if (!names.every((n) => ownNames.has(n))) {
                    log(state, `${card.name}：指定されたスピリットがフィールドに揃っていないため発動しなかった。`)
                    continue
                }
            } else if ("ownNameIncludesCountAtLeast" in effect.condition) {
                // 判定は解決の時点（ほかの条件と同じ）。撃った後に場を離れても効果は続く（2026-09-07 ユーザー確認）
                const { names, count } = effect.condition.ownNameIncludesCountAtLeast
                const matched = state.players[owner].field.spirits.filter((s) => names.some((n) => getCard(s.cardId).name.includes(n))).length
                if (matched < count) {
                    log(state, `${card.name}：カード名に「${names.join("」か「")}」と入っているスピリットがいないため発動しなかった。`)
                    continue
                }
            } else if ("opponentFieldColorsAtLeast" in effect.condition) {
                // BS15-078飛雷震之計：相手のフィールドの色の種類数がこれ以上ないと使用できない
                const { opponentFieldColorsAtLeast: minColors, spiritsOnly } = effect.condition
                if (opponentFieldColorCount(state, owner, spiritsOnly) < minColors) {
                    log(state, `${card.name}：相手のフィールドの色が${minColors}色未満のため発動しなかった。`)
                    continue
                }
            } else {
                // ブランチロック：自分のフィールド（スピリット+ネクサス）が持つシンボルの色の種類数（重複除く）がこれ以上
                const minColors = effect.condition.ownFieldSymbolColorsAtLeast
                // 数え方は shared/cost.ts の ownFieldSymbolColors に一本化する（2026-08-20。
                // symbolFix・バウンス待機・付与色の扱いを軽減計算と揃えるため）
                const colors = ownFieldSymbolColors(state, owner)
                if (colors.size < minColors) {
                    log(
                        state,
                        `${card.name}：シンボルの色が${minColors}色未満のため発動しなかった。`,
                    )
                    continue
                }
            }
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
