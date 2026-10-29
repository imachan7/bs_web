// ターン進行・フェーズ遷移の制御
import { zoneSpiritEffectsDisabled } from "../../../shared/rules"
import { noteCoverage } from "../../../shared/coverage"
import { handGainDenial } from "./handGate"
import type { CardInstance, GameState, PlayerId, TimedRecord } from "../type"
import { moveSoulCore, soulCoreInTrash } from "./soulCore"
import { currentLevel, draw, getCard, log, pushResumeFrames, resolveInOrder, suspend } from "./GameState"
import { cardNameContains, effectActiveOn, effectSources, instIsCombined, isEndStepLocked, isTrashReturnAtEndStep, matchesTarget, refreshRestrictionsFor } from "../../../shared/rules"
import { activeConstraints, coreStepBonusFor, detachBravesOnLeave, drawStepBonusFor, fireStepTriggers, isRefreshBlockedByMark, fireRefreshedSideEvents, refreshLevelAsOverrides, refreshSpirit, resolveAction, returnSpiritToDeckBottom } from "./EffectModules"

const SECOND_MAIN_STEP = false

// 器BJ：カード名条件・コア条件に合う自分のネクサスを、アタックステップの間だけスピリットとして扱う
// （BS13-048古代戦艦アルゴ・ゴレムLv2）。treatOwnNexusesAsSpiritsThisTurnHandler（BS03ゴーレムクラフト）と
// 同じ「同じインスタンスのままfield.nexuses→field.spiritsへ移す」手口だが、asSpiritThisTurnそのものを
// 積んだうえでasSpiritAttackStepScopedを立てる（戻すタイミングを分けるための目印）。
// PhaseManager.toAttackPhase から毎回呼ぶ（既に変換済み・別経路でasSpiritThisTurn済みの個体は除外する）
function applyAttackStepNexusAsSpirit(state: GameState): void {
    for (const pid of ["p1", "p2"] as const) {
        const player = state.players[pid]
        for (const inst of effectSources(state, pid)) {
            const level = currentLevel(inst).level
            for (const effect of getCard(inst.cardId).effects) {
                if (effect.kind !== "nexusAsSpiritDuringAttackStep") continue
                if (!effectActiveOn(inst, effect, level)) continue
                const minCores = effect.minCores ?? 1
                const targets = player.field.nexuses.filter(
                    (n) =>
                        n.cores >= minCores &&
                        n.asSpiritThisTurn === undefined &&
                        (effect.nameContains === undefined || cardNameContains(n, effect.nameContains)),
                )
                if (targets.length === 0) continue
                noteCoverage(effect, "nexusAsSpiritDuringAttackStep")
                for (const nexus of targets) {
                    player.field.nexuses.splice(player.field.nexuses.indexOf(nexus), 1)
                    nexus.asSpiritThisTurn = {
                        cost: effect.cost,
                        family: [...effect.family],
                        levels: effect.spiritLevels.map((l) => ({ ...l })),
                    }
                    nexus.asSpiritAttackStepScoped = true
                    player.field.spirits.push(nexus)
                }
                log(
                    state,
                    `${player.name}のネクサス${targets.length}つ（${targets.map((n) => getCard(n.cardId).name).join("・")}）は、アタックステップの間スピリットとして扱われる。`,
                )
            }
        }
    }
}

// applyAttackStepNexusAsSpirit の戻し。asSpiritAttackStepScoped が付いた個体だけを field.nexuses へ戻す
// （通常のasSpiritThisTurn＝ターン限定はこの目印が無いのでここでは戻らず、endTurn側の既存ループが担当する）
// battleOnly＝バトルの終わり（clearBattle）の呼び出し。「このバトル中」の印（asSpiritBattleScoped）が付いた個体だけ戻す
export function revertAttackStepNexusAsSpirit(state: GameState, battleOnly = false): void {
    for (const pid of ["p1", "p2"] as const) {
        const field = state.players[pid].field
        for (const inst of [...field.spirits]) {
            if (inst.asSpiritAttackStepScoped !== true) continue
            if (battleOnly && inst.asSpiritBattleScoped !== true) continue
            delete inst.asSpiritThisTurn
            delete inst.asSpiritAttackStepScoped
            delete inst.asSpiritBattleScoped
            field.spirits.splice(field.spirits.indexOf(inst), 1)
            field.nexuses.push(inst)
            detachBravesOnLeave(state, pid, inst)
            log(state, `${state.players[pid].name}の${getCard(inst.cardId).name}はネクサスに戻った。`)
        }
    }
}

// ステップの終わりの掃除。「このステップ中」の期間つき効果（until:"step"）を消し、ステップ限りでスピリット扱いにしたネクサスを戻す
// （効果で「このステップ中スピリットとして扱う」にしたもの。2026-10-11 ユーザー確認）。ステップが変わる箇所（toAttackPhase・endTurn）から呼ぶ
function endStepScoped(state: GameState): void {
    revertAttackStepNexusAsSpirit(state)
    if (!state.timedEffects.some((r) => r.until === "step")) return
    state.timedEffects = state.timedEffects.filter((r) => r.until !== "step")
    refreshLevelAsOverrides(state)
}

// ターン開始処理のステップ列（start → core → draw → refresh → main）。
// 各ステップは内部で fireStepTriggers を呼ぶ。ステップ誘発が pendingChoice を立てた場合、
// driveTurnStart がそのステップの次から再開できるようステップ単位に分割してある。
// 各クロージャは state.turnPlayer が固定である前提で pid/player を捕捉する
// （ターン開始処理中にターンプレイヤーは変わらない。再開時は本関数を呼び直して捕捉し直す）。
function turnStartSegments(state: GameState): (() => void)[] {
    const pid = state.turnPlayer
    const player = state.players[pid]
    return [
        // スタートステップ
        () => {
            state.phase = "start"
            log(state, `―――― ターン${state.turn}：${player.name}のターン ――――`)
            // クロスシザースのコア数リンクは次の自分のスタートステップまで続く（2026-09-25 ユーザー確認）。指定し直す前に外す
            for (const nexus of player.field.nexuses) {
                delete nexus.coresLinkedTo
                delete nexus.coresOverride
            }
            fireStepTriggers(state, "start")
        },
        // コアステップ①：コアを置くより前に発火する効果（「コアを置かないことで〜する」）。
        // ドローステップと同じ理由で区間を分けている（ここで選択待ちになると再開は次の区間＝コア置きから）。
        // 先攻1ターン目はコアステップ自体が存在しない（公式ルール）
        () => {
            state.phase = "core"
            state.coreStepSkipped = false
            if (state.turn === 1) return
            fireStepTriggers(state, "core", undefined, "enter", "before")
        },
        // コアステップ②：コア置き本体（coreStepBonus持ち＝ベル・ダンディア等で+amount）と、
        // コアを置いた後に発火する効果
        () => {
            if (state.turn === 1) {
                log(state, `先攻1ターン目のためコアステップなし。`)
                return
            }
            if (state.coreStepSkipped) {
                log(state, `${player.name}は効果のコストとしてリザーブにコアを置かなかった。`)
            } else {
                const coreStepBonus = coreStepBonusFor(state, pid)
                player.reserve += 1 + coreStepBonus
                if (coreStepBonus > 0) {
                    log(state, `${player.name}はリザーブにコアを${1 + coreStepBonus}個置いた（コアステップ+${coreStepBonus}）。`)
                } else {
                    log(state, `${player.name}はリザーブにコアを1個置いた。`)
                }
            }
            fireStepTriggers(state, "core", undefined, "enter", "after")
        },
        // ドローステップ①：ドローより前に発火する効果（「ドローしないことで〜する」）。
        // ここで選択待ちになると、再開は**次の区間＝ドロー**からになるので、
        // 「発動を確認してからドローする／しない」が成立する（区間を分けているのはこのため）
        () => {
            state.phase = "draw"
            state.drawStepSkipped = false
            fireStepTriggers(state, "draw", undefined, "enter", "before")
        },
        // ドローステップ②：ドロー本体（先攻1ターン目も通常通りドローする。公式ルール）と、
        // ドローの後に発火する効果（引いたカードを破棄の対象にできる百識の谷Lv1など）
        () => {
            if (state.drawStepSkipped) {
                log(state, `${player.name}は効果のコストとしてドローしなかった。`)
            } else {
                draw(state, pid, 1 + drawStepBonusFor(state, pid), true)
            }
            if (state.winner) return // デッキ切れ敗北時はステップ誘発を発火させない
            fireStepTriggers(state, "draw", undefined, "enter", "after")
        },
        // リフレッシュステップ：トラッシュのコアをリザーブに戻し、全回復
        () => {
            state.phase = "refresh"
            // 「次のリフレッシュステップで」の記録（寿命 nextRefresh）は、このステップで読んで使い切る
            const nextRefresh = consumeNextRefreshRecords(state, pid)
            if (nextRefresh.some((r) => r.content.some((c) => c.type === "playerRule" && c.rule.type === "skipMainStep"))) state.skipMainStepNow = true
            if (player.trashCores > 0) {
                const caps = nextRefresh.flatMap((r) => r.content.flatMap((c) => (c.type === "trashCoreReturnCap" ? [c.max] : [])))
                const cap = caps.length > 0 ? Math.min(...caps) : undefined
                // 案B-inside: トラッシュに[ソウルコア]があるときは、コアと一緒にリザーブへ戻す。
                // これを忘れると数値だけ戻って[ソウルコア]がただの通常コアに化けて消える（2026-10-06 修正）
                if (soulCoreInTrash(player) && (cap === undefined || cap >= 1)) {
                    moveSoulCore(player, { zone: "reserve" })
                }
                const moved = cap !== undefined ? Math.min(player.trashCores, cap) : player.trashCores
                player.reserve += moved
                player.trashCores -= moved
                if (cap !== undefined && player.trashCores > 0) {
                    log(state, `トラッシュのコア${moved}個をリザーブに戻した（制限により${player.trashCores}個は戻せなかった）。`)
                } else {
                    log(state, `トラッシュのコア${moved}個をリザーブに戻した。`)
                }
            }
            const refreshedInstanceIds = new Set<string>()
            // リフレッシュステップの制限（BS11-X04 宝瓶神機アクア・エリシオン）
            const limits = refreshRestrictionsFor(state, pid)
            let firstRefreshed: CardInstance | undefined
            for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
                // noRefresh（スクルディア Lv1-2 の自分自身）を持つスピリットはこのステップで回復しない
                if (activeConstraints(state, pid, inst).some((c) => c.type === "noRefresh")) continue
                // 相手のスピリットから「回復できない」と指定されている間も回復しない
                // （スクルディア Lv2-3。指定元が疲労状態で相手のフィールドにいる間だけ効く）
                if (isRefreshBlockedByMark(state, pid, inst)) continue
                // 「次のリフレッシュステップで回復できない」（BS11-055）
                // all:true はルールとして置くので、発揮後に場に出たスピリットにも効く（SEMANTICS_AUDIT §3.12）
                if (nextRefresh.some((r) => r.content.some((c) => c.type === "skipRefresh") && ((r.target.kind === "instance" && r.target.instanceId === inst.instanceId) || (r.target.kind === "rule" && !player.field.nexuses.includes(inst) && matchesTarget(state, pid, inst, r.target.filter, r.target.selfInstanceId))))) continue
                const isNexus = player.field.nexuses.includes(inst)
                if (limits.nexuses && isNexus) continue
                if (limits.combined && !isNexus && instIsCombined(inst)) continue
                // 「合体していないスピリットは1体しか回復できない」ときは、ここでは回復させず
                // ステップ誘発のあとにまとめて1体だけ選ばせる（下の refreshOne）
                if (limits.onlyOneUncombined && !isNexus && !instIsCombined(inst)) continue
                if (inst.isRested) refreshedInstanceIds.add(inst.instanceId)
                // 回復は refreshSpirit を通す（「このスピリットが回復したとき」＝onRefreshed を発火させる唯一の入口）
                if (refreshSpirit(state, pid, inst, undefined, true) && !firstRefreshed) firstRefreshed = inst
            }
            if (firstRefreshed && !state.winner) fireRefreshedSideEvents(state, pid, firstRefreshed)
            fireStepTriggers(state, "refresh", refreshedInstanceIds)
            // 1体だけの回復は既存の refreshOne に委譲する（**どれを回復させるかはそのステップの
            // プレイヤーが選ぶ**。対話では選択待ちで中断し、非対話は実効BP最大を自動選択する。
            // ステップ誘発のあとに置くのは、中断するとこのステップの残りが走らなくなるため）
            if (limits.onlyOneUncombined && !state.pendingChoice && !state.winner) {
                resolveAction(state, pid, null, { type: "refreshOne", filter: { uncombined: true } })
            }
        },
        // メインステップ
        () => {
            if (state.skipMainStepNow) {
                delete state.skipMainStepNow
                log(state, `${player.name}はメインステップを行えない。`)
                toAttackPhase(state)
                return
            }
            state.phase = "main"
            state.priorityPlayer = pid
            state.isFlashTiming = false
            state.flashCount = 0
            fireStepTriggers(state, "main")
        },
    ]
}

// ターン開始処理のステップ列を fromIndex から順に実行する。
// ステップ処理後に pendingChoice が立っていたら（ステップ誘発が選択待ちを要求したら）、
// 次のステップ番号を**再開フレーム**に積んでそこで中断する（docs/design/RESUME_STACK.md）。
// 全ステップを完走したら levelAs を再計算する。
// until 指定時はその区間で止め、ドロー／リフレッシュならターン終了処理へ戻る（BS15-X04 の追加ステップ）
export function driveTurnStart(state: GameState, fromIndex: number, until?: number): void {
    const segments = turnStartSegments(state)
    const last = until ?? segments.length - 1
    for (let i = fromIndex; i <= last; i++) {
        segments[i]!()
        if (state.winner) return
        if (state.pendingChoice) {
            pushResumeFrames(state, [{ kind: "turnStart", step: i + 1, ...(until !== undefined ? { until } : {}) }])
            return
        }
    }
    // 継続的なレベル置換（levelAs）をターン開始処理の最後に再計算する
    // （ジャグリーンのスピリット数条件・トパーズの流星のsourceMinLevelなど）
    refreshLevelAsOverrides(state)
    // 追加のメインステップはプレイヤーに返す（ターン終了ボタンでエンドステップへ）
    if (until !== undefined && until !== MAIN_SEGMENT) endTurn(state)
}

// turnStartSegments の区間番号（BS15-X04 の追加ステップで使う）
const EXTRA_STEP_SEGMENTS = { ドローステップ: [3, 4], リフレッシュステップ: [5, 5], メインステップ: [6, 6] } as const
const MAIN_SEGMENT = 6
export const EXTRA_STEP_OPTIONS = Object.keys(EXTRA_STEP_SEGMENTS) as (keyof typeof EXTRA_STEP_SEGMENTS)[]

// BS15-X04 Lv2：選んだステップを通常どおり丸ごと行う（そのステップの効果もすべて発揮する）
export function runExtraStep(state: GameState, option: string): void {
    const range = EXTRA_STEP_SEGMENTS[option as keyof typeof EXTRA_STEP_SEGMENTS] ?? EXTRA_STEP_SEGMENTS.ドローステップ
    log(state, `${state.players[state.turnPlayer].name}は${option}を行う。`)
    if (range[1] === MAIN_SEGMENT) state.extraMainStep = true
    driveTurnStart(state, range[0], range[1])
}

// BS15-X04 Lv2 の発生源（ターンプレイヤーの場の Lv2 の個体）
function extraStepSource(state: GameState) {
    const player = state.players[state.turnPlayer]
    return player.field.spirits.find((inst) =>
        getCard(inst.cardId).effects.some(
            (e) => e.kind === "extraStepAfterAttackStep" && effectActiveOn(inst, e, currentLevel(inst).level),
        ),
    )
}

// ターン開始処理：start → core → draw → refresh を自動で進めて main で止める。
// 途中のステップ誘発が pendingChoice を立てた場合はそこで中断し、
// 再開フレーム（kind:"turnStart"）として再開スタックに載る
export function runTurnStart(state: GameState): void {
    driveTurnStart(state, 0)
}

// メインステップ → アタックステップ
export function toAttackPhase(state: GameState): void {
    // 先攻1ターン目はアタックステップが存在しない（公式ルール。2026-10-06 ユーザー指定）。
    // nextPhase / endTurn の通常経路ではここへ来ないが、forceEndMainStep 等の効果経由で来た場合は
    // メインステップの終了としてターン終了処理へ流す（endTurn 側もターン1を除外しているので再帰しない）
    if (state.turn === 1) {
        log(state, `先攻1ターン目のため、アタックステップは存在しない。`)
        endTurn(state)
        return
    }
    // アタックステップを経由した＝このターンには第2メインステップがまだ残っている（endTurn が消費する）。
    // 既に第2メインを行った後の再アタックステップ（BS10-008 アレス・ドラグーン）の後には第2メインを挟まない。
    // 旧カードの対戦には第2メインステップが無いので立てない（2026-10-15 ユーザー決定。standard 版から持ち込んだ仕組みは入口だけ閉じる）
    if (SECOND_MAIN_STEP && state.secondMainDone !== true) state.oweSecondMain = true
    endStepScoped(state)
    state.phase = "attack"
    log(state, `${state.players[state.turnPlayer].name}はアタックステップに移行した。`)
    // 器BJ：アタックステップ開始時に、対象のネクサスをスピリットとして扱う（BS13-048古代戦艦アルゴ・ゴレムLv2）
    applyAttackStepNexusAsSpirit(state)
    fireStepTriggers(state, "attack")
}

// ターン終了処理：エンドステップを経て相手のターンを開始する
export function endTurn(state: GameState): void {
    // アタックする／しないに関わらず、アタックステップは必ず経由する（2026-09-17 ユーザー確認。smoke part343）。
    // メインステップから直接ターンを終了したときも、ここでアタックステップへ入って開始時の誘発を出してから
    // 終了時の誘発へ進む。「アタックステップは行えず」（BS10-108 ルナティックシール）のときだけ経由しない。
    // 開始時の誘発が選択待ちになったら、選択の解決後にこの関数をやり直す（そのときは phase が "attack"）
    // 第2メインステップ中と先攻1ターン目はアタックステップを経由しない（第2メイン→エンド、1ターン目はメイン→エンド）
    if (state.phase === "main" && !state.extraMainStep && state.secondMainStep !== true && state.turn !== 1 && !isEndStepLocked(state, "attackStep")) {
        toAttackPhase(state)
        if (state.winner) return
        if (state.pendingChoice) {
            pushResumeFrames(state, [{ kind: "endTurn" }])
            return
        }
    }
    // 「アタックステップ終了時」の誘発（紫水晶の森Lv2）。エンドステップへ移る直前に、
    // まだ phase が "attack" のまま発火させる（『自分のアタックステップ』の turn/phase 判定を効かせるため）
    if (state.phase === "attack") fireStepTriggers(state, "attack", undefined, "end")
    if (state.winner) return
    // 器BJ：アタックステップ終了時に、applyAttackStepNexusAsSpiritで変換したネクサスを元へ戻す
    // （extraAttackStepPendingでもう1回アタックステップへ戻る場合も、いったんここで戻してから
    // toAttackPhaseが改めて変換し直すので問題ない）
    endStepScoped(state)
    if (state.winner) return

    // BS15-X04 Lv2：アタックステップ終了後・エンドステップの前に、ステップを1つ行う（ターンに1回・断れない）。
    // phase が attack＝アタックステップを経由したときだけ（行った後に戻ってきたときは draw/refresh/main）
    if (state.phase === "attack" && !state.extraStepAfterAttackUsed) {
        const source = extraStepSource(state)
        if (source) {
            noteCoverage(getCard(source.cardId).effects.find((e) => e.kind === "extraStepAfterAttackStep"), "extraStepAfterAttackStep")
            state.extraStepAfterAttackUsed = true
            if (!state.interactiveTargets) {
                runExtraStep(state, "ドローステップ")
                return
            }
            suspend(state, {
                pid: state.turnPlayer,
                kind: "option",
                prompt: `${getCard(source.cardId).name}：行うステップを選んでください`,
                candidates: [],
                options: [...EXTRA_STEP_OPTIONS],
                optional: false,
                extraStepChoice: { sourceInstanceId: source.instanceId },
                action: { type: "noop" },
                selfInstanceId: source.instanceId,
            })
            return
        }
    }

    // 第2メインステップ（公式ルール。2026-10-06）: アタックステップの後にもう一度メインステップを行う。
    // toAttackPhase を通ったターンだけ（oweSecondMain）。先攻1ターン目はアタックステップ自体が無いため来ない。
    // BS15-X04 の追加ステップはこの前に終わる。移行したらターンプレイヤーへ返し、
    // 「ターン終了」で endTurn をやり直す（secondMainStep が立っているのでアタック経由はしない）
    if (state.oweSecondMain === true) {
        delete state.oweSecondMain
        state.secondMainStep = true
        state.secondMainDone = true
        state.phase = "main"
        state.priorityPlayer = state.turnPlayer
        state.isFlashTiming = false
        state.flashCount = 0
        log(state, `${state.players[state.turnPlayer].name}は第2メインステップに移行した。`)
        fireStepTriggers(state, "main")
        return
    }

    state.phase = "end"
    fireStepTriggers(state, "end")
    if (state.winner) return

    // エンドステップを数える封印（BS10-108 ルナティックシール）を1つ減らす。
    // 「『自分のエンドステップ』に1個ずつボイドに置く」＝**発揮した側のエンドステップだけ**数える。
    // 0 になった封印は解ける。**ターン終了の一時状態リセットの対象ではない**（複数ターンにまたがる）
    if (state.endStepLocks.length > 0) {
        for (const lock of state.endStepLocks) {
            if (lock.pid !== state.turnPlayer) continue
            lock.remaining -= 1
            log(state, `${getCard(lock.cardId).name}：デッキの横のコアを1個ボイドに置いた。（残り${lock.remaining}個）`)
        }
        state.endStepLocks = state.endStepLocks.filter((l) => l.remaining > 0)
    }

    // デッキ横のコア（BS12-078カシオペアシール）：持ち主のエンドステップに1個ずつボイドへ戻す。
    // ボイドは残量を持たない無限の供給源なので、減らすだけでよい
    {
        const p = state.players[state.turnPlayer]
        if (p.deckSideCores > 0) {
            p.deckSideCores -= 1
            log(state, `${p.name}は、デッキの横のコア1個をボイドに置いた。（残り${p.deckSideCores}個）`)
        }
    }

    // noRefreshUntilOwnEndSteps（BS12-078カシオペアシール）：持ち主のエンドステップごとに1減らす
    for (const inst of state.players[state.turnPlayer].field.spirits) {
        if ((inst.noRefreshUntilOwnEndSteps ?? 0) <= 0) continue
        inst.noRefreshUntilOwnEndSteps = (inst.noRefreshUntilOwnEndSteps ?? 0) - 1
    }

    // 「アタックステップとエンドステップを順番にもう1回ずつ行う」（BS10-008 火星神龍アレス・ドラグーン）。
    // ⚠️ **この位置でなければならない**：エンドステップの誘発を解決した直後で、
    // かつ下の一時状態のリセット群（tempBpBuff・turnVirtualInstances 等）より**前**。
    // 後ろに置くと、追加のアタックステップに入る前にこのターンの継続効果が消えてしまう。
    // ターンプレイヤーは交代せず、アタックステップへ戻して return する
    if (state.extraAttackStepPending === true) {
        delete state.extraAttackStepPending
        // 第2メインステップから移行してきた場合はフラグを片付ける（ここはクリーンアップより前で return するため）
        delete state.secondMainStep
        // 前のアタックステップで立った「バトル終了時に畳む」フラグは役目を終えているので落とす
        // （残すと追加ステップの最初のバトルで即座に終了してしまう）
        state.endAttackStepAfterBattle = false
        log(state, `${state.players[state.turnPlayer].name}はアタックステップとエンドステップを、もう1回ずつ行う。`)
        toAttackPhase(state)
        return
    }

    // 「エンドステップに自分のデッキの下に戻す」（BS05トランスマイグレーションで召喚した個体）。
    // エンドステップの誘発効果からは見えている状態にしたいので、fireStepTriggers の**後**に処理する。
    // 戻す処理中に配列が変わるのでスナップショットを取ってから回す
    for (const pid of ["p1", "p2"] as const) {
        for (const inst of [...state.players[pid].field.spirits]) {
            if (inst.returnToDeckBottomAtEndStep) returnSpiritToDeckBottom(state, pid, inst)
        }
    }

    // トラッシュのカードが持ち主の『自分のエンドステップ』に自動で手札へ戻る（kind:"trashReturnAtEndStep"）。
    // **持ち主のエンドステップだけ**（＝state.turnPlayer側のトラッシュのみ）。BS13-015冥総裁ハーゲン
    // maxCount指定時は「ターンに1回」等、そのcardIdにつき戻る枚数を上限で絞る（BS13-077ブリーズライド：1枚まで）
    {
        const p = state.players[state.turnPlayer]
        const trashReturnMaxCount = (cardId: string): number => {
            const e = getCard(cardId).effects.find((eff) => eff.kind === "trashReturnAtEndStep")
            return e && e.kind === "trashReturnAtEndStep" ? (e.maxCount ?? Infinity) : Infinity
        }
        const returnedCounts = new Map<string, number>()
        for (let i = p.trashCards.length - 1; i >= 0; i--) {
            const cardId = p.trashCards[i]
            if (cardId === undefined || !isTrashReturnAtEndStep(cardId) || zoneSpiritEffectsDisabled(state, cardId)) continue
            const already = returnedCounts.get(cardId) ?? 0
            if (already >= trashReturnMaxCount(cardId)) continue
            if (handGainDenial(state, { pid: state.turnPlayer, from: "trash", cause: "effect" })) continue
            noteCoverage(getCard(cardId).effects.find((eff) => eff.kind === "trashReturnAtEndStep"), "trashReturnAtEndStep")
            p.trashCards.splice(i, 1)
            p.hand.push(cardId)
            returnedCounts.set(cardId, already + 1)
            log(state, `${p.name}は${getCard(cardId).name}をトラッシュから手札に戻した。`)
        }
    }

    // ターン終了時までのBP増減と、このターン限りのアタック不可状態をリセット
    for (const pid of ["p1", "p2"] as const) {
        state.players[pid].tempHandKeywordGrants = []
        delete state.players[pid].minAttackCostThisTurn
        // このターンだけの仮想発生源（マジックが貸した継続効果）もリセット（BS05リアニメイト。TURN_EFFECT_SOURCES.md §4.2）
        state.players[pid].turnVirtualInstances = []
        // 「ターンに1回、ブロックしても疲労しない」の消費記録（BS07ブリシンガメンの首飾りLv2）
        state.players[pid].noRestWhenBlockingUsedThisTurn = []
        state.players[pid].payAssistUsedThisTurn = []
        // バーストのセットはターン1回（docs/design/BURST.md。setBurstFromHandはこの制限を受けない）
        state.players[pid].burstSetThisTurn = false
        // 「このバトルの間」の貸与は clearBattle で切れるのが本筋だが、バトルが成立しないまま
        // ターンが終わる経路のために念のためここでも空にする（lendSelfThisBattle）
        state.players[pid].battleVirtualInstances = []
        for (const inst of state.players[pid].field.spirits) {
            // バトル終了で消えるはずのBP増減も、バトルが成立しないまま終わる経路のために念のため消す
            delete inst.attackedThisTurn
            inst.blockConstraintNegatedThisTurn = false
            inst.tempAlsoCosts = []
            delete inst.lifeDealtThisTurn
        }
    }
    // このターンの間スピリットとして扱われていたネクサス（BS03ゴーレムクラフト）をネクサスへ戻す。
    // **フィールドに残っている個体だけが戻る**：破壊・手札戻しなどで場を離れたものは既に
    // field.spirits から抜けているので、ここで復活することはない（破壊されたネクサスはトラッシュのまま）。
    // 上の一時状態リセットより後に置くのは、戻す前に spirits として tempBpBuff 等を消しておくため。
    // 疲労状態はそのまま引き継ぐ（アタックして疲労した個体は疲労したネクサスとして戻る）
    for (const pid of ["p1", "p2"] as const) {
        const field = state.players[pid].field
        for (const inst of [...field.spirits]) {
            if (inst.asSpiritThisTurn === undefined) continue
            delete inst.asSpiritThisTurn
            delete inst.asSpiritAttackStepScoped
            field.spirits.splice(field.spirits.indexOf(inst), 1)
            field.nexuses.push(inst)
            detachBravesOnLeave(state, pid, inst) // 合体していたブレイヴを外す（BRAVE.md §6.1.1）
            log(state, `${state.players[pid].name}の${getCard(inst.cardId).name}はネクサスに戻った。`)
        }
    }
    // atTurnEnd（BS16-068）：エンドステップの誘発の後・このターンの期間つき効果を消す前に、
    // 記録した順で解決する（発生源が場を離れていても解決する。Q22394〜Q22396）
    if (state.turnEndActions && state.turnEndActions.length > 0) {
        const items = state.turnEndActions
        state.turnEndActions = []
        resolveInOrder(state, items, {
            resolve: (item) =>
                resolveAction(state, item.ownerPid, null, item.action, undefined, undefined, undefined, undefined, undefined, item.sourceCardId),
            frame: (item) => ({ kind: "action", selfInstanceId: null, actorPid: item.ownerPid, action: item.action }),
        })
        if (state.winner) return
        if (state.pendingChoice) {
            pushResumeFrames(state, [{ kind: "endTurn" }])
            return
        }
    }
    // 遅延アタックステップ終了フラグ（サイレントウォール）もリセット
    state.endAttackStepAfterBattle = false
    // このターン限りの全体制約（ヘビィゲート）もリセット
    // バトル限定の記録も、バトルが成立しないまま終わる経路のためにここで消す
    // 「次のリフレッシュステップで」の記録だけはターンをまたいで残す
    state.timedEffects = state.timedEffects.filter((r) => r.until === "nextRefresh")
    refreshLevelAsOverrides(state)
    delete state.extraStepAfterAttackUsed
    delete state.extraMainStep
    delete state.secondMainStep
    delete state.oweSecondMain
    delete state.secondMainDone
    // このターン限りのトリガー抑止（ユーサネイジア）もリセット
    // このターンのアタック回数（「最初のアタック」判定用）もリセット
    state.attacksThisTurn = 0
    // BS10-047：「次にアタックした」はターンをまたがないので、直前のアタック宣言の記録もリセット
    delete state.lastAttackerCombinedPid
    delete state.prevAttackerCombinedPid
    // このターンの「ブロックされない」無視（レッドウォール）もリセット
    // このターンの「ブロック時→アタック時」移し替え（アタックシフト）もリセット
    // このターンのマジック使用回数（作戦参謀フォクシンのoncePerTurnAll用）もリセット
    state.magicUsedThisTurn = { p1: 0, p2: 0 }
    delete state.magicIdsUsedThisTurn
    delete state.lifeLostThisTurn
    delete state.magicEffectsUsedByName
    delete state.ownSpiritDestroyedThisTurn
    delete state.spiritVanishedThisTurn
    delete state.oppSpiritRemovedByEffectThisTurn
    delete state.ownSpiritDestroyedByOwnEffectColors
    delete state.ownSpiritWithOnDestroyDestroyedByOwnEffect
    delete state.selfSummonCostUsedNames
    // このターンの相手効果によるミル累計（侵されざる聖域Lv2のmillCap perTurn用）もリセット
    state.millCountThisTurn = { p1: 0, p2: 0 }
    state.coreGainCountThisTurn = { p1: 0, p2: 0 }
    state.millCountThisTurnMutual = { p1: 0, p2: 0 }

    log(state, `${state.players[state.turnPlayer].name}はターンを終了した。`)
    state.turnPlayer = state.turnPlayer === "p1" ? "p2" : "p1"
    state.turn += 1
    runTurnStart(state)
}

// pid の「次のリフレッシュステップで」の記録（寿命 nextRefresh）を一覧から取り除いて返す。
// 対象はそのプレイヤー自身か、そのプレイヤーのフィールドにいる個体。場を離れた個体への記録もここで捨てる
function consumeNextRefreshRecords(state: GameState, pid: PlayerId): TimedRecord[] {
    const field = state.players[pid].field
    const onField = new Set([...field.spirits, ...field.nexuses].map((i) => i.instanceId))
    const anyField = new Set((["p1", "p2"] as PlayerId[]).flatMap((p) => [...state.players[p].field.spirits, ...state.players[p].field.nexuses].map((i) => i.instanceId)))
    const mine = (r: TimedRecord): boolean =>
        r.until === "nextRefresh" &&
        ((r.target.kind === "player" && r.target.pid === pid) || (r.target.kind === "rule" && r.target.pid === pid) || (r.target.kind === "instance" && (onField.has(r.target.instanceId) || !anyField.has(r.target.instanceId))))
    const used = state.timedEffects.filter(mine)
    state.timedEffects = state.timedEffects.filter((r) => !mine(r))
    return used
}
