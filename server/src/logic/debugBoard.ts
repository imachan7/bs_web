// デバッグ用の盤面差し替え（2026-08-16 ユーザー要望）。
//
// 「盤面と手札と相手のカードを用意して、実際に動かして確かめたい」ための仕組み。
// **ローカル実行時だけ**有効にする（公開サーバーで他人の対戦を書き換えられないようにするため。
// 有効判定は server/src/index.ts 側）。
//
// 進行中のゲームの状態を、渡された盤面で上書きする。対戦画面は既存のものをそのまま使えるよう、
// 状態の形だけを差し替えて通常の配信（broadcastState）に載せる。
import { createInstance, getCard } from "./GameState"
import { refreshLevelAsOverrides } from "./EffectModules"
import type { CardInstance, GameState, Phase, PlayerId } from "../type"

// 場に置く1体の指定。cores を省略するとLv1に必要なコア数（最低でも1個）
export interface DebugInstance {
    cardId: string
    cores?: number
    isRested?: boolean
}

export interface DebugPlayerBoard {
    name?: string
    life?: number
    reserve?: number
    trashCores?: number
    hand?: string[]
    deck?: string[] // 先頭がデッキトップ。**省略時は現状維持**（引くカードを固定したいときだけ書く）
    trashCards?: string[]
    tegamoto?: string[]
    field?: {
        spirits?: DebugInstance[]
        nexuses?: DebugInstance[]
    }
}

export interface DebugBoard {
    turn?: number
    turnPlayer?: PlayerId
    phase?: Phase
    players?: Partial<Record<PlayerId, DebugPlayerBoard>>
}

const PHASES: Phase[] = ["start", "core", "draw", "refresh", "main", "attack", "end"]

// そのカードのLv1に必要なコア数（levels[0].cores。最低1個）
function defaultCores(cardId: string): number {
    const lv1 = getCard(cardId).levels?.[0]
    return Math.max(1, lv1?.cores ?? 1)
}

// 存在しない cardId を弾く（打ち間違いを黙って通すと、盤面が静かに欠ける）
function checkCardIds(ids: string[] | undefined, where: string): string | null {
    for (const id of ids ?? []) {
        try {
            getCard(id)
        } catch {
            return `${where}に存在しないカードIDがあります: ${id}`
        }
    }
    return null
}

function toInstances(specs: DebugInstance[] | undefined, turn: number): CardInstance[] {
    return (specs ?? []).map((spec) => {
        const inst = createInstance(spec.cardId, turn, spec.cores ?? defaultCores(spec.cardId))
        if (spec.isRested) inst.isRested = true
        return inst
    })
}

// 盤面を適用する。問題があればエラーメッセージ、成功なら null を返す。
// **指定した項目だけ**を上書きする（省略した項目は現状のまま）
export function applyDebugBoard(state: GameState, board: DebugBoard): string | null {
    if (board.phase !== undefined && !PHASES.includes(board.phase)) {
        return `不明なフェーズです: ${board.phase}`
    }
    if (board.turnPlayer !== undefined && board.turnPlayer !== "p1" && board.turnPlayer !== "p2") {
        return `不明な手番です: ${String(board.turnPlayer)}`
    }
    // 先に**全部**検証してから書き込む（途中で失敗して盤面が半端に壊れるのを防ぐ）
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const spec = board.players?.[pid]
        if (!spec) continue
        for (const [zone, ids] of [
            ["手札", spec.hand],
            ["デッキ", spec.deck],
            ["トラッシュ", spec.trashCards],
            ["手元", spec.tegamoto],
        ] as const) {
            const err = checkCardIds(ids, `${pid}の${zone}`)
            if (err) return err
        }
        const err =
            checkCardIds(spec.field?.spirits?.map((s) => s.cardId), `${pid}のフィールド（スピリット）`) ??
            checkCardIds(spec.field?.nexuses?.map((s) => s.cardId), `${pid}のフィールド（ネクサス）`)
        if (err) return err
        for (const [label, v] of [
            ["ライフ", spec.life],
            ["リザーブ", spec.reserve],
            ["トラッシュのコア", spec.trashCores],
        ] as const) {
            if (v !== undefined && (!Number.isFinite(v) || v < 0)) return `${pid}の${label}が不正です: ${String(v)}`
        }
    }

    if (board.turn !== undefined) state.turn = board.turn
    if (board.turnPlayer !== undefined) state.turnPlayer = board.turnPlayer
    if (board.phase !== undefined) state.phase = board.phase
    // 差し替えの前に、進行中の割り込み・バトルを畳む（古い選択待ちが残ると操作できなくなる）
    state.pendingChoice = null
    state.resumeStack = []
    state.battle = null
    state.isFlashTiming = false
    state.priorityPlayer = state.turnPlayer
    state.winner = null

    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const spec = board.players?.[pid]
        if (!spec) continue
        const p = state.players[pid]
        if (spec.name !== undefined) p.name = spec.name
        if (spec.life !== undefined) p.life = spec.life
        if (spec.reserve !== undefined) p.reserve = spec.reserve
        if (spec.trashCores !== undefined) p.trashCores = spec.trashCores
        if (spec.hand !== undefined) p.hand = [...spec.hand]
        if (spec.deck !== undefined) p.deck = [...spec.deck]
        if (spec.trashCards !== undefined) p.trashCards = [...spec.trashCards]
        if (spec.tegamoto !== undefined) {
            p.tegamoto = [...spec.tegamoto]
            p.tegamotoPlayable = []
        }
        if (spec.field !== undefined) {
            p.field.spirits = toInstances(spec.field.spirits, state.turn)
            p.field.nexuses = toInstances(spec.field.nexuses, state.turn)
        }
        // このターン限定の効果は盤面と噛み合わなくなるので落とす
        p.turnVirtualInstances = []
        delete p.tempHandKeywordGrants
    }
    refreshLevelAsOverrides(state)
    state.log.push("【デバッグ】盤面を差し替えました。")
    return null
}
