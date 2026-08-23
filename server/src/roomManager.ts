// 対戦ルーム生成・参加・破棄の管理
import { randomUUID } from "node:crypto"
import type { DeckSpec, GameState, PlayerId } from "./type"

export interface RoomPlayer {
    socketId: string
    name: string
    deck: DeckSpec // デッキレシピ名（"red" 等）またはカスタムデッキのカードリスト
    connected: boolean
    isAi?: true // AI が座っている席（socketId は実在しないダミー）。切断判定から除外する
}

export interface Room {
    roomId: string
    players: Partial<Record<PlayerId, RoomPlayer>>
    game: GameState | null
    ai?: { pid: PlayerId } // AI戦のとき、AI が座っている席。無ければ人間同士の対戦
}

export class RoomManager {
    private rooms = new Map<string, Room>()

    // 自動生成のルームID（ランダムマッチ・AI戦）。合言葉ルームと衝突しないよう接頭辞を付ける
    newRoomId(prefix: "match" | "ai"): string {
        return `${prefix}-${randomUUID().slice(0, 8)}`
    }

    // AI戦のルームを作る。人間が p1、AI が p2 に座る。
    // AI の席には実在しない socketId を入れる（配信先として使われても誰にも届かないだけで害はない）
    createAiRoom(
        socketId: string,
        name: string,
        deck: DeckSpec,
        aiName: string,
        aiDeck: DeckSpec,
    ): { room: Room; playerId: PlayerId } {
        const roomId = this.newRoomId("ai")
        const room: Room = {
            roomId,
            players: {
                p1: { socketId, name, deck, connected: true },
                p2: { socketId: `ai:${roomId}`, name: aiName, deck: aiDeck, connected: true, isAi: true },
            },
            game: null,
            ai: { pid: "p2" },
        }
        this.rooms.set(roomId, room)
        return { room, playerId: "p1" }
    }

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

        // AI の席は常に connected なので、これを数えるとAI戦のルームが永久に残る。
        // 「人間が誰も残っていなければ破棄する」で数える
        const anyHumanConnected = (["p1", "p2"] as const).some((pid) => {
            const p = room.players[pid]
            return p?.connected === true && p.isAi !== true
        })
        if (!anyHumanConnected) this.rooms.delete(room.roomId)
        return found
    }
}

// ---- ランダムマッチの待機キュー ----
// 合言葉を決めずに「先に待っていた2人」を突き合わせる。順番待ちだけを持ち、
// レーティングや条件指定は扱わない（2026-08-23 ユーザー判断）
export interface MatchQueueEntry {
    socketId: string
    name: string
    deck: DeckSpec
    queuedAt: number
}

export class MatchQueue {
    private entries: MatchQueueEntry[] = []

    get size(): number {
        return this.entries.length
    }

    has(socketId: string): boolean {
        return this.entries.some((e) => e.socketId === socketId)
    }

    // 待機列に加える。すでに並んでいれば二重には入れない
    add(entry: Omit<MatchQueueEntry, "queuedAt">): void {
        if (this.has(entry.socketId)) return
        this.entries.push({ ...entry, queuedAt: Date.now() })
    }

    // 待機列から外す。外したら true（キャンセル・切断の両方から呼ぶ）
    remove(socketId: string): boolean {
        const before = this.entries.length
        this.entries = this.entries.filter((e) => e.socketId !== socketId)
        return this.entries.length !== before
    }

    // 先頭2人を取り出す。2人揃っていなければ null（列は変えない）
    takePair(): [MatchQueueEntry, MatchQueueEntry] | null {
        if (this.entries.length < 2) return null
        const first = this.entries.shift()!
        const second = this.entries.shift()!
        return [first, second]
    }

    // 待機中の socketId 一覧（待ち人数の配信先）
    socketIds(): string[] {
        return this.entries.map((e) => e.socketId)
    }
}
