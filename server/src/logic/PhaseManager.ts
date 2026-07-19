// ターン進行・フェーズ遷移の制御
import type { GameState } from "../type"
import { FIRST_TURN_DRAW } from "../../../data/constants"
import { draw, log } from "./GameState"
import { activeConstraints, fireStepTriggers, refreshLevelAsOverrides } from "./EffectModules"

// ターン開始処理：start → core → draw → refresh を自動で進めて main で止める
export function runTurnStart(state: GameState): void {
    const pid = state.turnPlayer
    const player = state.players[pid]

    state.phase = "start"
    log(state, `―――― ターン${state.turn}：${player.name}のターン ――――`)
    fireStepTriggers(state, "start")
    if (state.winner) return

    // コアステップ：リザーブにコアを1個追加
    state.phase = "core"
    player.reserve += 1
    log(state, `${player.name}はリザーブにコアを1個置いた。`)
    fireStepTriggers(state, "core")
    if (state.winner) return

    // ドローステップ（先攻1ターン目はスキップ）
    state.phase = "draw"
    if (state.turn === 1 && !FIRST_TURN_DRAW) {
        log(state, `先攻1ターン目のためドローなし。`)
    } else {
        draw(state, pid, 1)
        if (state.winner) return
    }
    fireStepTriggers(state, "draw")
    if (state.winner) return

    // リフレッシュステップ：トラッシュのコアをリザーブに戻し、全回復
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
    if (state.winner) return

    state.phase = "main"
    state.priorityPlayer = pid
    state.isFlashTiming = false
    state.flashCount = 0
    fireStepTriggers(state, "main")
    if (state.winner) return

    // 継続的なレベル置換（levelAs）をターン開始処理の最後に再計算する
    // （ジャグリーンのスピリット数条件・トパーズの流星のsourceMinLevelなど）
    refreshLevelAsOverrides(state)
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
        for (const inst of state.players[pid].field.spirits) {
            inst.tempBpBuff = 0
            inst.cantAttackThisTurn = false
            inst.immuneToOpponentThisTurn = false
            inst.blockConstraintNegatedThisTurn = false
            inst.tempKeywords = []
            inst.tempAlsoCosts = []
            inst.tempColors = []
            inst.tempFamilies = []
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

    log(state, `${state.players[state.turnPlayer].name}はターンを終了した。`)
    state.turnPlayer = state.turnPlayer === "p1" ? "p2" : "p1"
    state.turn += 1
    runTurnStart(state)
}
