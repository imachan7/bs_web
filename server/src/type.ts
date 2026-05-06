// プレイヤーIDやステップ名を厳格に定義（タイポを防ぎます）
export type PlayerId = "p1" | "p2"
export type Phase =
    | "start"
    | "core"
    | "draw"
    | "refresh"
    | "main"
    | "attack"
    | "end"

// カードマスターデータの型
export interface CardData {
    cardId: string
    name: string
    type: "spirit" | "nexus" | "magic"
    cost: number
    symbols: string[]
    effects: Effect[]
}

// 効果（モジュール化）の型
export interface Effect {
    trigger: "on_summon" | "on_attack" | "on_destruction"
    action: string // 後で EffectModules のキーと一致させます
    value: number | string
}

// プレイヤーの状態
export interface PlayerState {
    id: PlayerId
    life: number
    reserve: number
    deck: CardData[]
    hand: CardData[]
    trashCards: CardData[]
    // ※今回は簡易化のため盤面を省略しています
}

// ゲーム全体の状態
export interface GameState {
    gameId: string
    turnPlayer: PlayerId
    phase: Phase
    players: Record<PlayerId, PlayerState> // 'p1' と 'p2' をキーに持つオブジェクト
}
