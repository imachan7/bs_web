// ステップの開始・終了、バトルに勝ったとき、BP が達したときの誘発
import { noteCoverage } from "../../../shared/coverage"
import { entryActive } from "../../../shared/rules/effectStop"
import { markPays } from "./actions/pay"
import type { CardInstance, EffectDef, GameState, Phase, PlayerId } from "../type"
import { currentLevel, getCard, log, opponentOf, resolveInOrder } from "./GameState"
import { countSpiritsWeighted, countSymbols, effectiveBp, effectSources, instColors, nexusEffectsStopped, instHasColor, instIsVanilla, isVirtualSource, cardNameContains, instMatchesCostFilter, matchesFamilyFilter, spiritHasKeyword, effectActiveOn, instIsCombined, cardHasColor, ownFieldOnlyColor, ownAllHaveFamily, ownAllHaveTeam, ownTeamAtLeast } from "../../../shared/rules"
import { requestActivationConfirm, resolveAction } from "./EffectModules"
import { claimOnce, isOnceUsed, markOnceUsed, revertOnceUsed } from "./oncePerTurn"
import { keishoExcludedTeamAtLeast, soulCoreInReserve } from "./soulCore"
import { fireFieldEventTriggers } from "./fieldEventTriggers"
import { activationPrompt, confirmPromptIfOptional, isStillOnField } from "./triggers"

// バトルの勝者側プレイヤーのフィールド（ネクサス＋スピリット）を走査し、
// kind: "battleWon" かつ role 一致（role:"any"はどちらの役割でも一致）かつレベル条件を満たす効果を実行する
// （ネクサスのバトル結果誘発）。
// resolveAction には self として発生源（ネクサス／スピリット）ではなく、
// 「勝利したスピリット（winnerInst）」を渡す。refreshSelf 等が「勝ったスピリット」を回復させる
// ような効果文（例: 無限蟲の蟻塚「自分のブロックしたスピリットは回復する」）を、
// 発生源に関係なく素直に表現するための意図的な選択。selfMode:"source" 指定時は逆に
// 発生源インスタンス（ネクサス自身）を self に渡す（深緑の樹海：ネクサス自身にコアを置く）。
// turn:"own" 指定時は winnerPid が turnPlayer のときのみ、vanillaWinnerOnly 指定時は
// 勝利したスピリットがバニラのときのみ発火する。
// 勝敗が決着したら（state.winner が立ったら）残りは打ち切る。
export function fireBattleWonTriggers(
    state: GameState,
    winnerPid: PlayerId,
    winnerInst: CardInstance,
    role: "attacker" | "blocker",
): void {
    // effectSources：このターンだけの仮想発生源（マジックが貸した継続効果。BS04ニーベルングリング）も含める
    const instances = effectSources(state, winnerPid)
    // ⚠️ **発火するものを先に全部集めてから順に解決する**（2026-08-17。fireStepTriggers と同じ形）。
    // 以前はループの中で直接解決し、選択待ちが立ったら `return` するだけだったため、
    // **同じバトルの残りの誘発が永久に失われていた**（太陽石の神殿を2枚並べると2枚目が発火しない）
    const firing: { inst: CardInstance; effect: Extract<EffectDef, { kind: "battleWon" }> }[] = []
    for (const inst of instances) {
        const card = getCard(inst.cardId)
        const level = currentLevel(inst).level
        for (const effect of card.effects) {
            if (effect.kind !== "battleWon") continue
            if (effect.role !== "any" && effect.role !== role) continue
            // 『このスピリットのバトル時』：発生源自身が勝利したときだけ発火する（BS01要塞龍ギガLv2）。
            // 同名の別個体が場にいても、勝っていない側では発火させない
            if (effect.selfOnly && inst.instanceId !== winnerInst.instanceId) continue
            // lentOnly：仮想発生源からのみ有効（実在カードが同じエントリを持っても恒久化させない）
            if (effect.lentOnly && !isVirtualSource(inst)) continue
            if (effect.whileCombined && !instIsCombined(inst)) continue
            if (!entryActive(state, winnerPid, inst, effect, level)) continue
            if (effect.turn === "own" && winnerPid !== state.turnPlayer) continue
            // そのターンの最初のアタックで勝利したときのみ（BS08太陽石の神殿）
            if (effect.firstAttackOfTurn && state.attacksThisTurn !== 1) continue
            if (effect.vanillaWinnerOnly && !instIsVanilla(winnerInst)) continue
            // 勝利したスピリットのカード名で絞る（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）
            if (
                effect.winnerNameContains !== undefined &&
                !cardNameContains(winnerInst, effect.winnerNameContains)
            ) {
                continue
            }
            // BS04ドラゴンズラッシュ：勝利したスピリットが指定系統を持つときのみ発火（配列＝OR）
            if (
                effect.winnerFamilyFilter !== undefined &&
                !matchesFamilyFilter(state, winnerPid, winnerInst, effect.winnerFamilyFilter)
            ) {
                continue
            }
            // BS02エメラルドに輝く鍾乳洞Lv2：勝利したスピリットのコアが指定数以上のときのみ発火
            if (effect.winnerMinCores !== undefined && winnerInst.cores < effect.winnerMinCores) {
                continue
            }
            // BS07ニードルショット：「**そのスピリットが**、BPを比べ〜」＝直前の文でBP増加した1体に限る。
            // 貸与のときに仮想発生源へ写した lentBuffTargetId と照合する
            if (effect.winnerIsLentBuffTarget && inst.lentBuffTargetId !== winnerInst.instanceId) {
                continue
            }
            // BS13-078ネバーギブアップ：targetChoiceLendThisTurnで選んだ1体に限る。
            // 貸与のときに仮想発生源へ写した lentChoiceInstanceId と照合する
            if (effect.winnerIsLentChoiceTarget && inst.lentChoiceInstanceId !== winnerInst.instanceId) {
                continue
            }
            // BS03熾烈極める最前線Lv2：勝利したスピリットが指定キーワードを持つときのみ発火（＝覚醒持ち）
            // 配列＝OR（どれか1つ持っていれば発火する。1回だけ）
            if (effect.winnerKeywordFilter !== undefined) {
                const needs = Array.isArray(effect.winnerKeywordFilter)
                    ? effect.winnerKeywordFilter
                    : [effect.winnerKeywordFilter]
                if (!needs.some((kw) => spiritHasKeyword(state, winnerPid, winnerInst, kw))) continue
            }
            // BS11-062 オールトの竜巣Lv2：勝利したのが**合体スピリット**のときのみ発火
            if (effect.winnerCombinedOnly && !instIsCombined(winnerInst)) {
                continue
            }
            // BS15-005虚獣チャンプボンゴル：勝利したスピリットがこの色を持つときのみ発火
            if (effect.winnerColorFilter !== undefined && !instHasColor(winnerInst, effect.winnerColorFilter)) {
                continue
            }
            // BS13-050輝竜シャイン・ブレイザー【合体時】：敗北して破壊された側の実効BPがこれ以上のときのみ発火
            // （state.lastBattleDestroyedBpは破壊直前に測った実効BP。GameEngine.resolveBattleが記録する）
            if (effect.loserMinBp !== undefined && state.lastBattleDestroyedBp < effect.loserMinBp) {
                continue
            }
            // BS14-060ティンダロ・ハウンドLv2：破壊された側のコストがこれ以下のときのみ発火
            if (effect.loserCostAtMost !== undefined && state.lastBattleDestroyedCost > effect.loserCostAtMost) {
                continue
            }
            // BS15-066廃寺の無限階段：発生源の持ち主のフィールドが指定色1色だけのときのみ発火
            if (
                effect.condition?.ownFieldOnlyColor !== undefined &&
                !ownFieldOnlyColor(state, winnerPid, effect.condition.ownFieldOnlyColor, effect.condition.spiritsOnly)
            ) {
                continue
            }
            firing.push({ inst, effect })
        }
    }
    const selfOf = (e: (typeof firing)[number]): CardInstance =>
        e.effect.selfMode === "source" ? e.inst : winnerInst
    resolveInOrder(state, firing, {
        // 集めたあとに場を離れた発生源は発火させない（先に解決した効果で破壊されうる）。
        // 仮想発生源はフィールドに実体が無いので在否を見ない
        skip: (e) => !isVirtualSource(e.inst) && !isStillOnField(state, winnerPid, e.inst.instanceId),
        resolve: (e) => {
            // 「〜できる」（optional）は実対戦では発動可否を確認する（step / triggered と同じ扱い）
            if (e.effect.optional && state.interactiveTargets) {
                requestActivationConfirm(state, winnerPid, activationPrompt(e.inst), e.effect.action, selfOf(e))
            } else {
                resolveAction(state, winnerPid, selfOf(e), e.effect.action)
            }
        },
        frame: (e) => ({
            kind: "action" as const,
            selfInstanceId: selfOf(e).instanceId,
            action: e.effect.action,
            actorPid: winnerPid,
            ...confirmPromptIfOptional(state, e.inst, e.effect.optional),
        }),
        // 同時発揮の解決順はターンプレイヤーが決める（TIMING_CHART.md §0-3）
        askOrder: {
            pid: state.turnPlayer,
            label: (e) => getCard(e.inst.cardId).name,
            // ⚠️ **カード単位**で見る（効果エントリ単位にしない）。同じカードの複数エントリは
            // 「ドロー後、〜する」のようにテキストで順序が決まっているので同時発揮ではなく、
            // 同名カードを2枚並べた場合は順序を入れ替えても結果が同じ（対称）
            key: (e) => e.inst.cardId,
        },
    })
}

// ステップ誘発の condition を、発火元インスタンスの持ち主 pid 基準で判定する
export function checkStepCondition(
    state: GameState,
    pid: PlayerId,
    condition: "handNotGreaterThanOpponent",
): boolean {
    // 主無き古城Lv2：お互いの手札の枚数が同じか、相手の方が多いとき
    return state.players[pid].hand.length <= state.players[opponentOf(pid)].hand.length
}

// ステップ誘発のログに出すステップ名。「どのステップの効果として発動したか」を示す
export const STEP_LABELS: Record<Phase, string> = {
    start: "スタートステップ",
    core: "コアステップ",
    draw: "ドローステップ",
    refresh: "リフレッシュステップ",
    main: "メインステップ",
    attack: "アタックステップ",
    end: "エンドステップ",
}

// 指定ステップに到達したときの誘発（ネクサス・スピリット共通）を、
// ターンプレイヤー側 → 相手側の順に、各プレイヤー内ではスピリット→ネクサスの順で発火する。
// 1件実行するたびに勝敗をチェックし、決着していれば残りは発火させない。
// refreshedInstanceIds はリフレッシュステップで実際に回復（isRested: true → false）した
// インスタンスの集合（PhaseManagerが渡す）。selfWasRefreshedThisStep 条件の判定に使う（省略可）
// timing は「ステップ開始時（省略時＝"enter"）」と「ステップ終了時（"end"）」の呼び分け。
// データ側の effect.timing が未指定なら "enter" 扱いなので、既存の呼び出しは影響を受けない
export function fireStepTriggers(
    state: GameState,
    step: Phase,
    refreshedInstanceIds?: Set<string>,
    timing: "enter" | "end" = "enter",
    // ドローステップとコアステップは、本体の動き（ドロー／リザーブへのコア置き）の前後で
    // 2回に分けて呼ぶ（PhaseManager が区間を分けている）。
    // "before"＝本体の動き自体を支払いに使う効果（step.beforeStepAction）だけ、"after"＝それ以外。
    // 省略時（他のステップ）は全部発火する
    subStep: "before" | "after" | "all" = "all",
): void {
    const order: PlayerId[] = [
        state.turnPlayer,
        opponentOf(state.turnPlayer),
    ]
    // ⚠️ **発火するものを先に全部集めてから順に解決する**（2026-08-17）。
    // 以前はループの中で直接解決し、選択待ちが立ったら `return` するだけだったため、
    // **同じステップの残りの誘発が永久に失われていた**
    // （灼熱の谷を2枚並べると、1枚目の「手札1枚を破棄」で中断して2枚目が発火しなかった）。
    // 中断したら残りを再開スタックへ積む（fireTrigger と同じ形）。
    // 条件（handNotGreaterThanOpponent など）は**誘発した時点**で判定する
    const firing: { pid: PlayerId; inst: CardInstance; effect: Extract<EffectDef, { kind: "step" }> }[] = []
    for (const pid of order) {
        const player = state.players[pid]
        const instances = [...player.field.spirits, ...player.field.nexuses]
        for (const inst of instances) {
            const card = getCard(inst.cardId)
            const level = currentLevel(inst).level
            if (nexusEffectsStopped(state, pid, inst)) continue
            for (const effect of card.effects) {
                if (effect.kind !== "step") continue
                if (effect.step !== step) continue
                if ((effect.timing ?? "enter") !== timing) continue
                if (subStep === "before" && effect.beforeStepAction !== true) continue
                if (subStep === "after" && effect.beforeStepAction === true) continue
                if (effect.turn === "own" && pid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && pid === state.turnPlayer) continue
                // 【合体時】のゲート＋レベル判定（BS10-008 火星神龍アレス・ドラグーン）
                if (!entryActive(state, pid, inst, effect, level)) continue
                // 「ターンに1回」（BS10-008：この効果自身が追加のエンドステップを生むため、無いと無限ループになる）
                if (effect.oncePerTurn === true && isOnceUsed(state, pid, inst, effect, "stepUsedTurn")) continue
                if (effect.condition === "handNotGreaterThanOpponent" && !checkStepCondition(state, pid, effect.condition)) continue
                if (effect.condition === "selfWasRefreshedThisStep" && !refreshedInstanceIds?.has(inst.instanceId)) continue
                if (effect.condition && typeof effect.condition === "object" && "ownSymbolColorAtLeast" in effect.condition) {
                    // ハートレス・ティンLv2：自分のフィールドの指定色シンボルが count 個以上、かつ
                    // noAttacksThisTurn 指定時はこのターンまだ1度もアタックが行われていないときのみ発火
                    const { color, count } = effect.condition.ownSymbolColorAtLeast
                    // シンボルの数え方は countSymbols に一本化する（2026-08-20）。
                    // symbolFix による固定・バウンス待機の除外・「◯色としても扱う」で得た色も見る
                    if (countSymbols(player, [color]) < count) continue
                    if (effect.condition.noAttacksThisTurn && state.attacksThisTurn > 0) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownColorTotalAtLeast" in effect.condition) {
                    // 道化師クラン：自分のフィールドに指定色のスピリット+ネクサスが合計count以上あるときのみ発火
                    const { color, count } = effect.condition.ownColorTotalAtLeast
                    const total = instances.filter((s) => instHasColor(s, color)).length
                    if (total < count) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownFamilyCountAtLeast" in effect.condition) {
                    // 王蛇の住処：自分のフィールドに指定系統（配列＝OR）のスピリットがcount体以上いるときのみ発火
                    const { family, count } = effect.condition.ownFamilyCountAtLeast
                    const total = countSpiritsWeighted(
                        state,
                        pid,
                        pid,
                        (s) => matchesFamilyFilter(state, pid, s, family),
                        getCard(inst.cardId).type,
                    )
                    if (total < count) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownHandAtLeast" in effect.condition) {
                    // 水蛇シーサーペンタ：持ち主の手札が指定枚数以上のときのみ発火（Lvごとに閾値が変わる）
                    if (state.players[pid].hand.length < effect.condition.ownHandAtLeast) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "opponentDeckNotEmpty" in effect.condition) {
                    // BS09-058魔本収められし書架Lv2：相手のデッキが0枚のときは発揮しない
                    if (state.players[opponentOf(pid)].deck.length === 0) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownTrashOnlyColor" in effect.condition) {
                    // BS14-024ツチピッグLv1-2：トラッシュにあるカードが指定色だけのときのみ（0枚は満たさない）
                    const wantColor = effect.condition.ownTrashOnlyColor
                    const trash = state.players[pid].trashCards
                    if (trash.length === 0 || !trash.every((id) => cardHasColor(getCard(id), wantColor))) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownSpiritMinCost" in effect.condition) {
                    // BS09-032飛鋼獣ゲイル・フォッカー：コストが指定値以上の自分のスピリットが1体でもいるときのみ
                    const min = effect.condition.ownSpiritMinCost
                    if (!state.players[pid].field.spirits.some((s) => instMatchesCostFilter(s, { min }))) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownSpiritMinBp" in effect.condition) {
                    // BS09-015獄獣ガシャベルス：実効BPが指定値以上の自分のスピリットが1体でもいるときのみ発火
                    const min = effect.condition.ownSpiritMinBp
                    if (!state.players[pid].field.spirits.some((s) => effectiveBp(state, pid, s) >= min)) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownRefreshedSpiritsAtLeast" in effect.condition) {
                    // 紫水晶の森Lv2：自分のフィールドに回復状態のスピリットが指定体数以上いるときのみ発火
                    const refreshed = countSpiritsWeighted(state, pid, pid, (s) => !s.isRested, getCard(inst.cardId).type)
                    if (refreshed < effect.condition.ownRefreshedSpiritsAtLeast) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownBurstSet" in effect.condition) {
                    // SD06-009キジ・トリアLv2：自分がバーストをセットしている／していない間だけ発火
                    if (state.players[pid].burstSet !== effect.condition.ownBurstSet) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "opponentBurstSet" in effect.condition) {
                    // BS15-065大河と絶壁Lv2：相手がバーストをセットしている／していない間だけ発火
                    if (state.players[opponentOf(pid)].burstSet !== effect.condition.opponentBurstSet) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "noAttacksThisTurn" in effect.condition) {
                    // BS15-067雪の結晶樹：このターンまだ1度もアタックが行われていないときのみ発火
                    if (state.attacksThisTurn > 0) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownNameIncludesCountAtLeast" in effect.condition) {
                    // 郵便ペンタン：カード名にいずれかの文字列を含む自分のスピリットが合計count体以上いるときのみ発火
                    const { names, count } = effect.condition.ownNameIncludesCountAtLeast
                    const total = countSpiritsWeighted(
                        state,
                        pid,
                        pid,
                        (s) => names.some((n) => cardNameContains(s, n)),
                        getCard(inst.cardId).type,
                    )
                    if (total < count) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownAllHaveTeam" in effect.condition) {
                    // 26系「自分のスピリット/ネクサスすべてが【X】を持つなら」（step軸。triggeredの条件判定と同じ）
                    if (!ownAllHaveTeam(state, pid, effect.condition.ownAllHaveTeam)) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownAllHaveFamily" in effect.condition) {
                    if (!ownAllHaveFamily(state, pid, effect.condition.ownAllHaveFamily)) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownTeamAtLeast" in effect.condition) {
                    // 26系「【X】を持つ自分のスピリットがN体以上いるなら」：
                    // AuraCondition.ownTeamAtLeastと同じ判定（発火元インスタンス自身も数に入る）
                    if (!ownTeamAtLeast(state, pid, effect.condition.ownTeamAtLeast)) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "soulCoreInReserve" in effect.condition) {
                    // 26系「自分のリザーブに[ソウルコア]があるなら」（step軸。triggeredの条件判定と同じ）
                    if (!soulCoreInReserve(state.players[pid])) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "ownKeishoExcludedTeamAtLeast" in effect.condition) {
                    // 26系「この継召で【X】を持つカードをN枚以上除外していたなら」（step軸。triggeredの条件判定と同じ）
                    if (!keishoExcludedTeamAtLeast(state, effect.condition.ownKeishoExcludedTeamAtLeast)) continue
                }
                if (effect.condition && typeof effect.condition === "object" && "summonedBy" in effect.condition) {
                    // 26系「【Fチェンジ】で召喚されているか」など（step軸。triggeredの条件判定と同じ。発生源自身の召喚経路と突合）
                    if (inst.summonedBy !== effect.condition.summonedBy) continue
                }
                firing.push({ pid, inst, effect })
            }
        }
    }
    resolveInOrder(state, firing, {
        // 集めたあとに場を離れた発生源は発火させない（先に解決した効果で破壊されうる）
        skip: (e) => !isStillOnField(state, e.pid, e.inst.instanceId),
        resolve: (e) => {
            // 「ターンに1回」の消費を記録する（BS10-008：発火が確定した時点で記録し、再入で二重発火しない）
            const byName = e.effect.onceScope === "name"
            if (byName) {
                if (!claimOnce(state, e.pid, e.inst, e.effect, "stepUsedTurn")) return
            } else if (e.effect.oncePerTurn === true) {
                markOnceUsed(state, e.pid, e.inst, e.effect, "stepUsedTurn")
            }
            // 「〜できる」（optional）は実対戦では発動可否を確認する（triggered と同じ扱い）
            if (e.effect.optional && state.interactiveTargets) {
                requestActivationConfirm(state, e.pid, activationPrompt(e.inst), e.effect.action, e.inst, byName ? { instanceId: e.inst.instanceId, effectId: e.effect.id } : undefined)
                return
            }
            // 効果の発生源をログに残す（2026-08-02 UI担当からの指摘）。
            // これが無いと「カードを2枚引いた」等の結果だけが残り、どのカードの効果か分からない。
            // カード名を含めることでUI側のホバー表示も効く
            log(
                state,
                `${state.players[e.pid].name}の${getCard(e.inst.cardId).name}の効果が発動した。（${STEP_LABELS[step]}${timing === "end" ? "終了時" : ""}）`,
            )
            if (!byName) {
                resolveAction(state, e.pid, e.inst, e.effect.action)
                return
            }
            delete state.effectFizzled
            resolveAction(state, e.pid, e.inst, markPays(e.effect.action, { onceRevert: { instanceId: e.inst.instanceId, effectId: e.effect.id } }))
            if (state.effectFizzled) revertOnceUsed(state, e.inst, e.effect.id, "stepUsedTurn")
            delete state.effectFizzled
        },
        frame: (e) => ({
            kind: "action" as const,
            selfInstanceId: e.inst.instanceId,
            action: e.effect.onceScope === "name" ? markPays(e.effect.action, { onceRevert: { instanceId: e.inst.instanceId, effectId: e.effect.id } }) : e.effect.action,
            actorPid: e.pid,
            ...(e.effect.onceScope === "name" ? { onceClaim: { instanceId: e.inst.instanceId, effectId: e.effect.id } } : {}),
            logText: `${state.players[e.pid].name}の${getCard(e.inst.cardId).name}の効果が発動した。（${STEP_LABELS[step]}${timing === "end" ? "終了時" : ""}）`,
            ...confirmPromptIfOptional(state, e.inst, e.effect.optional),
        }),
        // 同時発揮の解決順はターンプレイヤーが決める（TIMING_CHART.md §0-3）
        askOrder: {
            pid: state.turnPlayer,
            label: (e) => `${state.players[e.pid].name}の${getCard(e.inst.cardId).name}`,
            // ⚠️ **カード単位**で見る（同じカードの複数エントリはテキスト順で決まっており同時発揮ではない）。
            // 持ち主が違えば別扱い（自分と相手の同名ネクサスは順序が結果を変えうる）
            key: (e) => `${e.pid}:${e.inst.cardId}`,
        },
    })
}

// 「BPがN以上になった時」（event: "ownSpiritBpReached"）：handleAction が1操作を解決しきった地点で呼ぶ。
// 各スピリットの前回の実効BP（state.bpSeen）と今回を比べ、増減があったものだけ発火する（2026-10-11 ユーザー確認）。
// 新しく場に出た個体は前回値が無いので記録するだけ。発火は届いた個体を集めてから順に行い、選択待ちが立ったら残りは捨てる（同時に複数体が届くのは稀なので簡略化）
export function fireBpReachedTriggers(state: GameState): void {
    const pids = ["p1", "p2"] as PlayerId[]
    const watched = pids.some((pid) => effectSources(state, pid).some((inst) => getCard(inst.cardId).effects.some((e) => e.kind === "fieldEvent" && e.event === "ownSpiritBpReached")))
    if (!watched) {
        delete state.bpSeen
        return
    }
    const prev = state.bpSeen ?? {}
    const next: Record<string, number> = {}
    const reached: { pid: PlayerId; inst: CardInstance; from: number; to: number }[] = []
    for (const pid of pids) {
        for (const inst of state.players[pid].field.spirits) {
            const to = effectiveBp(state, pid, inst)
            next[inst.instanceId] = to
            const from = prev[inst.instanceId]
            if (from !== undefined && from !== to) reached.push({ pid, inst, from, to })
        }
    }
    state.bpSeen = next
    for (const [i, r] of reached.entries()) {
        if (state.winner) return
        // 選択待ちで止まったら、残りは前回の値に戻しておき、次の操作の事後処理で拾い直す
        if (state.pendingChoice) {
            for (const rest of reached.slice(i)) next[rest.inst.instanceId] = rest.from
            return
        }
        fireFieldEventTriggers(state, r.pid, "ownSpiritBpReached", { pid: r.pid, inst: r.inst }, instColors(r.inst), undefined, undefined, { bpFrom: r.from, bpTo: r.to })
    }
}

// 果て無き地平線Lv1（kind:"battleBpAsLevel"）：バトルのBP比較のときだけ、指定レベルのスピリットが
// 別のレベルのBPを使う。effectiveBp（バフ・オーラ込み）に「使うレベルのBP − 本来のレベルのBP」の差を足す形で
// 実装するので、BP増減の効果とは独立して働く。GameEngine.resolveBattle からのみ呼ぶ
// （効果の対象条件やオーラのBP判定には影響させない ＝「バトルでBPを比べるとき」の限定を守る）
export function battleBp(state: GameState, pid: PlayerId, inst: CardInstance): number {
    const base = effectiveBp(state, pid, inst)
    const level = currentLevel(inst).level
    // side:"both"（BS09-073オンザエッジ＝「スピリットすべては」）は相手の発生源からも効くので、
    // 対象の持ち主だけでなく両陣営の発生源を走査する
    const sourcePids: PlayerId[] = [pid, opponentOf(pid)]
    for (const sourcePid of sourcePids)
    for (const source of effectSources(state, sourcePid)) {
        const sourceLevel = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "battleBpAsLevel") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            // 相手側の発生源は side:"both" のエントリだけが効く
            if (sourcePid !== pid && effect.side !== "both") continue
            if (!entryActive(state, sourcePid, source, effect, sourceLevel)) continue
            if (effect.fromLevel !== undefined && effect.fromLevel !== level) continue
            if (effect.maxCost !== undefined && getCard(inst.cardId).cost > effect.maxCost) continue
            // keywordFilter（BS06神葉樹の森Lv2）：指定キーワードを持つスピリットのみ対象
            if (effect.keywordFilter && !spiritHasKeyword(state, pid, inst, effect.keywordFilter)) continue
            if (effect.phaseTurn) {
                if (state.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && sourcePid !== state.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && sourcePid === state.turnPlayer) continue
            }
            const levels = getCard(inst.cardId).levels
            const from = levels.find((l) => l.level === level)
            const use =
                effect.useLevel === "max"
                    ? levels.reduce((best, l) => (l.level > best.level ? l : best), levels[0]!)
                    : levels.find((l) => l.level === effect.useLevel)
            if (!from || !use) continue
            noteCoverage(effect, "battleBpAsLevel")
            return base + (use.bp - from.bp)
        }
    }
    return base
}
