// 対戦ルーム生成・参加・破棄の管理
import type { DeckSpec, GameState, PlayerId } from "./type"

export interface RoomPlayer {
    socketId: string
    name: string
    deck: DeckSpec // デッキレシピ名（"red" 等）またはカスタムデッキのカードリスト
    connected: boolean
}

export interface Room {
    roomId: string
    players: Partial<Record<PlayerId, RoomPlayer>>
    game: GameState | null
}

export class RoomManager {
    private rooms = new Map<string, Room>()

    // 現在のルーム数を返す（ヘルスチェック用）
    get roomCount(): number {
        return this.rooms.size
    }

    // ルームに参加する。空いている席（p1 → p2）に割り当てる
    join(
        roomId: string,
        socketId: string,
        name: string,
        deck: DeckSpec,
    ): { room: Room; playerId: PlayerId } | { error: string } {
        let room = this.rooms.get(roomId)
        if (!room) {
            room = { roomId, players: {}, game: null }
            this.rooms.set(roomId, room)
        }

        const seat: PlayerId | null = !room.players.p1
            ? "p1"
            : !room.players.p2
              ? "p2"
              : null
        if (!seat) return { error: "このルームは満員です" }

        room.players[seat] = { socketId, name, deck, connected: true }
        return { room, playerId: seat }
    }

    // socketId からルームと座席を探す
    findBySocket(
        socketId: string,
    ): { room: Room; playerId: PlayerId } | null {
        for (const room of this.rooms.values()) {
            for (const pid of ["p1", "p2"] as const) {
                if (room.players[pid]?.socketId === socketId) {
                    return { room, playerId: pid }
                }
            }
        }
        return null
    }

    // 切断処理。全員いなくなったらルームを破棄する
    leave(socketId: string): { room: Room; playerId: PlayerId } | null {
        const found = this.findBySocket(socketId)
        if (!found) return null
        const { room, playerId } = found
        const player = room.players[playerId]
        if (player) player.connected = false

        const anyConnected = (["p1", "p2"] as const).some(
            (pid) => room.players[pid]?.connected,
        )
        if (!anyConnected) this.rooms.delete(room.roomId)
        return found
    }
}
