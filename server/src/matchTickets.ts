// 接続を張らずに対戦相手を待つための受付。クライアントは数秒おきに問い合わせ（poll）、同じ待ち場所（pool）に
// 2人そろったら同じ roomId を受け取り、そこで初めて socket をつないでそのルームへ入る。
// 待っている間 WebSocket を張らないので、Cloud Run の課金は問い合わせを処理する一瞬だけになる（docs/ops/DEPLOY_CLOUDRUN.md §5.2）。
// 受付はメモリ上にしか無い。インスタンスが止まって消えても、クライアントの次の問い合わせで新しく並び直す
import { randomUUID } from "node:crypto"

// この時間問い合わせが無い待ちは、閉じられたものとして捨てる（クライアントの間隔は3秒）
export const TICKET_ALIVE_MS = 10_000

export type PollResult = { ticket: string; waiting: number } | { roomId: string }

type Ticket = { pool: string; seenAt: number; roomId?: string }

export class MatchTickets {
    private tickets = new Map<string, Ticket>()

    constructor(
        private readonly newRoomId: () => string,
        private readonly now: () => number = Date.now,
    ) {}

    // その ticket が今も待ちとして残っているか（残っていなければ、次の poll は新しく並ぶ扱いになる）
    has(ticket: unknown): boolean {
        this.sweep()
        return typeof ticket === "string" && this.tickets.has(ticket)
    }

    // 問い合わせ1回。相手が決まっていれば roomId、まだなら自分の ticket と待ち人数（自分を含む）を返す。
    // 知らない ticket（初回・期限切れ・サーバーの再起動後）は、新しく列の最後に並ぶ
    poll(ticket: unknown, pool: string): PollResult {
        this.sweep()
        const id = typeof ticket === "string" && this.tickets.has(ticket) ? ticket : randomUUID()
        const mine: Ticket = this.tickets.get(id) ?? { pool, seenAt: 0 }
        mine.seenAt = this.now()
        this.tickets.set(id, mine)
        if (mine.roomId !== undefined) {
            this.tickets.delete(id)
            return { roomId: mine.roomId }
        }
        // 先に待っていた人から当てる（Map は入れた順）
        for (const [otherId, other] of this.tickets) {
            if (otherId === id || other.pool !== mine.pool || other.roomId !== undefined) continue
            const roomId = this.newRoomId()
            other.roomId = roomId // 相手は次の問い合わせで受け取る
            this.tickets.delete(id)
            return { roomId }
        }
        let waiting = 0
        for (const t of this.tickets.values()) if (t.pool === mine.pool && t.roomId === undefined) waiting++
        return { ticket: id, waiting }
    }

    cancel(ticket: unknown): void {
        if (typeof ticket === "string") this.tickets.delete(ticket)
    }

    private sweep(): void {
        const limit = this.now() - TICKET_ALIVE_MS
        for (const [id, t] of this.tickets) if (t.seenAt < limit) this.tickets.delete(id)
    }
}
