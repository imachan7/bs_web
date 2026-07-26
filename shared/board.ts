// 共有ルール層が読み取る盤面インターフェース。
// サーバーの GameState と、クライアントへ配信される GameView の**両方が満たす**最小の形を定義し、
// ルール判定（BP計算・キーワード判定・コスト計算など）をどちらからも同じ実装で呼べるようにする。
//
// 重要: ここには「隠匿されない情報」だけを置く。GameView は相手の手札やデッキ中身を持たないため、
// それらに依存する判定は共有層に置けない（サーバー専用のまま残す）。
import type {
    BattleState,
    CardInstance,
    GameState,
    GameView,
    Phase,
    PlayerId,
    TurnConstraintDef,
} from "../server/src/type"

export interface BoardPlayer {
    id: PlayerId
    reserve: number
    trashCores: number
    trashCards: string[]
    tegamoto: string[]
    field: { spirits: CardInstance[]; nexuses: CardInstance[] }
    turnVirtualInstances: CardInstance[] // このターンの間だけ有効な仮想の効果発生源（マジックが貸した継続効果）。effectSources() が参照する
}

export interface Board {
    turn: number
    turnPlayer: PlayerId
    phase: Phase
    battle: BattleState | null
    isFlashTiming: boolean
    priorityPlayer: PlayerId
    turnConstraints: TurnConstraintDef[]
    magicUsedThisTurn: Record<PlayerId, number>
    ignoreUnblockableThisTurn: PlayerId[]
    players: Record<PlayerId, BoardPlayer>
}

// コンパイル時の保証: GameState / GameView がどちらも Board を満たしていること。
// どちらかにフィールドを足し忘れると、この行が型エラーになる
type Assert<T extends true> = T
export type _GameStateIsBoard = Assert<GameState extends Board ? true : false>
export type _GameViewIsBoard = Assert<GameView extends Board ? true : false>
