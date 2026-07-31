// ターン進行・フェーズ遷移の制御
import type { GameState } from "../type"
import { draw, log } from "./GameState"
import { activeConstraints, coreStepBonusFor, fireStepTriggers, refreshLevelAsOverrides } from "./EffectModules"

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
            fireStepTriggers(state, "start")
        },
        // コアステップ：リザーブにコアを1個追加（coreStepBonus持ち＝ベル・ダンディア等で+amount）。
        // 先攻1ターン目はコアステップ自体が存在しない（公式ルール）
        () => {
            state.phase = "core"
            if (state.turn === 1) {
                log(state, `先攻1ターン目のためコアステップなし。`)
                return
            }
            const coreStepBonus = coreStepBonusFor(state, pid)
            player.reserve += 1 + coreStepBonus
            if (coreStepBonus > 0) {
                log(state, `${player.name}はリザーブにコアを${1 + coreStepBonus}個置いた（コアステップ+${coreStepBonus}）。`)
            } else {
                log(state, `${player.name}はリザーブにコアを1個置いた。`)
            }
            fireStepTriggers(state, "core")
        },
        // ドローステップ（先攻1ターン目も通常通りドローする。公式ルール）
        () => {
            state.phase = "draw"
            draw(state, pid, 1)
            if (state.winner) return // デッキ切れ敗北時はステップ誘発を発火させない
            fireStepTriggers(state, "draw")
        },
        // リフレッシュステップ：トラッシュのコアをリザーブに戻し、全回復
        () => {
            state.phase = "refresh"
            if (player.trashCores > 0) {
                player.reserve += player.trashCores
                log(state, `トラッシュのコア${player.trashCores}個をリザーブに戻した。`)
                player.trashCores = 0
            }
            const refreshedInstanceIds = new Set<string>()
            for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
                // noRefresh（スクルディア）を持つスピリットはこのステップで回復しない
                if (activeConstraints(state, pid, inst).some((c) => c.type === "noRefresh")) continue
                if (inst.isRested) refreshedInstanceIds.add(inst.instanceId)
                inst.isRested = false
            }
            fireStepTriggers(state, "refresh", refreshedInstanceIds)
        },
        // メインステップ
        () => {
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
// 次のステップ番号を state.turnStartResumeStep に記録してそこで中断する。
// 全ステップを完走したら levelAs を再計算し、再開位置をクリアする。
function driveTurnStart(state: GameState, fromIndex: number): void {
    const segments = turnStartSegments(state)
    for (let i = fromIndex; i < segments.length; i++) {
        segments[i]!()
        if (state.winner) {
            state.turnStartResumeStep = null
            return
        }
        if (state.pendingChoice) {
            state.turnStartResumeStep = i + 1
            return
        }
    }
    state.turnStartResumeStep = null
    // 継続的なレベル置換（levelAs）をターン開始処理の最後に再計算する
    // （ジャグリーンのスピリット数条件・トパーズの流星のsourceMinLevelなど）
    refreshLevelAsOverrides(state)
}

// ターン開始処理：start → core → draw → refresh を自動で進めて main で止める。
// 途中のステップ誘発が pendingChoice を立てた場合はそこで中断し、resumeTurnStart で再開する
export function runTurnStart(state: GameState): void {
    driveTurnStart(state, 0)
}

// pendingChoice の解決後に、中断していたターン開始処理があれば続きのステップから再開する。
// 中断していなければ（turnStartResumeStep が null なら）何もしない
export function resumeTurnStart(state: GameState): void {
    if (state.turnStartResumeStep === null) return
    driveTurnStart(state, state.turnStartResumeStep)
}

// メインステップ → アタックステップ
export function toAttackPhase(state: GameState): void {
    state.phase = "attack"
    log(state, `${state.players[state.turnPlayer].name}はアタックステップに移行した。`)
    fireStepTriggers(state, "attack")
}

// ターン終了処理：エンドステップを経て相手のターンを開始する
export function endTurn(state: GameState): void {
    state.phase = "end"
    fireStepTriggers(state, "end")
    if (state.winner) return

    // ターン終了時までのBP増減と、このターン限りのアタック不可状態をリセット
    for (const pid of ["p1", "p2"] as const) {
        state.players[pid].tempHandKeywordGrants = []
        // このターンだけの仮想発生源（マジックが貸した継続効果）もリセット（BS05リアニメイト。TURN_EFFECT_SOURCES.md §4.2）
        state.players[pid].turnVirtualInstances = []
        for (const inst of state.players[pid].field.spirits) {
            inst.tempBpBuff = 0
            inst.cantAttackThisTurn = false
            inst.immuneToOpponentThisTurn = false
            inst.blockConstraintNegatedThisTurn = false
            delete inst.lifeDamageNegatedFor
            inst.tempKeywords = []
            inst.tempAlsoCosts = []
            inst.tempColors = []
            delete inst.tempExtraSymbols
            delete inst.attackTriggersAsBlockThisTurn
        }
    }
    // このターンの間のレベル上書き（levelOverrideThisTurn）もリセット
    // （スピリット・ネクサス両方が対象になりうる。皇帝アンプルールは相手のネクサスに設定する）
    for (const pid of ["p1", "p2"] as const) {
        for (const inst of [
            ...state.players[pid].field.spirits,
            ...state.players[pid].field.nexuses,
        ]) {
            delete inst.levelOverrideThisTurn
        }
    }
    // ネクサスのコア数リンク（クロスシザース）もこのターンだけの簡略化のためリセットする
    for (const pid of ["p1", "p2"] as const) {
        for (const nexus of state.players[pid].field.nexuses) {
            delete nexus.coresLinkedTo
            delete nexus.coresOverride
        }
    }
    // 遅延アタックステップ終了フラグ（サイレントウォール）もリセット
    state.endAttackStepAfterBattle = false
    // このターン限りの全体制約（ヘビィゲート）もリセット
    state.turnConstraints = []
    // このターン限りのトリガー抑止（ユーサネイジア）もリセット
    state.triggerSuppressionThisTurn = []
    // このターンのアタック回数（「最初のアタック」判定用）もリセット
    state.attacksThisTurn = 0
    // このターンの「ブロックされない」無視（レッドウォール）もリセット
    state.ignoreUnblockableThisTurn = []
    // このターンのマジック使用回数（作戦参謀フォクシンのoncePerTurnAll用）もリセット
    state.magicUsedThisTurn = { p1: 0, p2: 0 }
    // このターンの相手効果によるミル累計（侵されざる聖域Lv2のmillCap perTurn用）もリセット
    state.millCountThisTurn = { p1: 0, p2: 0 }

    log(state, `${state.players[state.turnPlayer].name}はターンを終了した。`)
    state.turnPlayer = state.turnPlayer === "p1" ? "p2" : "p1"
    state.turn += 1
    runTurnStart(state)
}
