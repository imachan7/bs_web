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

    // ルームに参加する。空いている席（p1 → p2）に割り当てる。
    //
    // **同じ socket が同じルームで2回目の join を送ってきたら「参加の取り消し」として席を空ける**
    // （2026-08-13 利用者報告）。ロビーの「対戦ルームに入る」は待機中も押せるため、
    // 2回押すと同じ人が p1 と p2 の両方に座り、自分対自分で何も操作できない状態になっていた。
    // 対戦が始まった後は取り消せない（席を空けると進行中のゲームが壊れるため）
    join(
        roomId: string,
        socketId: string,
        name: string,
        deck: DeckSpec,
    ): { room: Room; playerId: PlayerId } | { cancelled: PlayerId } | { error: string } {
        let room = this.rooms.get(roomId)
        if (!room) {
            room = { roomId, players: {}, game: null }
            this.rooms.set(roomId, room)
        }

        const alreadySeated = (["p1", "p2"] as const).find(
            (pid) => room.players[pid]?.socketId === socketId,
        )
        if (alreadySeated) {
            if (room.game) return { error: "対戦がすでに始まっているため、参加を取り消せません" }
            delete room.players[alreadySeated]
            // 誰もいなくなったルームは残さない（次の join で作り直される）
            if (!room.players.p1 && !room.players.p2) this.rooms.delete(roomId)
            return { cancelled: alreadySeated }
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

    // gameId から進行中のルームを探す（バグ報告への対戦ログ添付用）
    // roomId でルームを取る（デバッグ用の盤面差し替えが使う）
    getRoom(roomId: string): Room | null {
        return this.rooms.get(roomId) ?? null
    }

    findByGameId(gameId: string): Room | null {
        for (const room of this.rooms.values()) {
            if (room.game?.gameId === gameId) return room
        }
        return null
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
